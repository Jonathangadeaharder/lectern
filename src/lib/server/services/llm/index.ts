/** Public LLM service surface. */
import { createHash } from 'node:crypto';
import { generateObject, generateText, NoObjectGeneratedError, streamObject } from 'ai';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { getDb } from '../../db';
import { appSettings, llmCache } from '../../db/schema';
import {
	BudgetExceededError,
	CircuitOpenError,
	LlmAbortError,
	LlmAuthError,
	LlmProviderError,
	LlmRateLimitError,
	LlmSchemaError
} from './errors';
import { getModel } from './provider';
import type { TaskName } from './tasks';

export interface RunStructuredOptions<T extends z.ZodTypeAny> {
	task: TaskName;
	schema: T;
	system: string;
	prompt: string;
	temperature?: number;
	signal?: AbortSignal;
	maxRetries?: number;
	sessionId?: string;
}

export interface StreamStructuredOptions<T extends z.ZodTypeAny> {
	task: TaskName;
	schema: T;
	system: string;
	prompt: string;
	temperature?: number;
	signal?: AbortSignal;
	sessionId?: string;
}

const DEFAULT_MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 10000;

// ── Circuit breaker ──────────────────────────────────────────────────────────

const CB_THRESHOLD = 5;
const CB_OPEN_DURATION_MS = 30_000;

interface CircuitState {
	failures: number;
	openSince: number | null;
}

const circuits = new Map<string, CircuitState>();

function circuitCheck(task: TaskName): void {
	const st = circuits.get(task);
	if (!st) return;
	if (st.openSince !== null) {
		if (Date.now() - st.openSince < CB_OPEN_DURATION_MS) {
			throw new CircuitOpenError(st.openSince);
		}
		st.openSince = null;
		st.failures = 0;
	}
}

function circuitRecordSuccess(task: TaskName): void {
	const st = circuits.get(task);
	if (st) {
		st.failures = 0;
		st.openSince = null;
	}
}

function circuitRecordFailure(task: TaskName, err: Error): void {
	if (!isCircuitTripping(err)) return;
	let st = circuits.get(task);
	if (!st) {
		st = { failures: 0, openSince: null };
		circuits.set(task, st);
	}
	st.failures++;
	if (st.failures >= CB_THRESHOLD) {
		st.openSince = Date.now();
		console.warn(`[llm] circuit OPEN for ${task} after ${st.failures} consecutive failures`);
	}
}

function isCircuitTripping(err: Error): boolean {
	return err instanceof LlmRateLimitError || err instanceof LlmProviderError;
}

export function resetCircuitBreaker(task: TaskName): void {
	circuits.delete(task);
}

export function clearCacheForTask(task: TaskName): void {
	try {
		const db = getDb();
		db.delete(llmCache).where(eq(llmCache.task, task)).run();
		console.log(`[llm] cleared cache for task: ${task}`);
	} catch {
		// non-fatal
	}
}

// ── Token budget tracking ────────────────────────────────────────────────────

const tokenUsage = new Map<string, number>();

const DEFAULT_TOKEN_LIMIT = 100_000;

function addTokenUsage(sessionId: string | undefined, count: number): void {
	if (!sessionId) return;
	tokenUsage.set(sessionId, (tokenUsage.get(sessionId) ?? 0) + count);
}

export function getTokenUsage(sessionId: string): number {
	return tokenUsage.get(sessionId) ?? 0;
}

export async function checkTokenBudget(sessionId: string, limit?: number): Promise<void> {
	const maxTokens = limit ?? (await loadTokenLimit());
	const used = getTokenUsage(sessionId);
	if (used >= maxTokens) {
		throw new BudgetExceededError(used, maxTokens);
	}
}

async function loadTokenLimit(): Promise<number> {
	try {
		const db = getDb();
		const row = db
			.select()
			.from(appSettings)
			.where(eq(appSettings.key, 'token_budget_limit'))
			.get();
		if (row?.value) {
			const parsed = JSON.parse(row.value);
			if (typeof parsed === 'number' && parsed > 0) return parsed;
		}
	} catch {
		// fall through to default
	}
	return DEFAULT_TOKEN_LIMIT;
}

export function resetTokenUsage(sessionId: string): void {
	tokenUsage.delete(sessionId);
}

// ── Core LLM functions ──────────────────────────────────────────────────────

function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

function cacheKey(task: TaskName, system: string, prompt: string, mode: 'text' | 'structured' = 'structured'): string {
	const raw = `${mode}:${task}\n${system}\n${prompt}`;
	return createHash('sha256').update(raw).digest('hex');
}

function cacheGet(hash: string): string | null {
	return null;
}

function cachePut(hash: string, task: TaskName, responseJson: string, modelId: string | null, latencyMs: number): void {
	return;
}

export async function runStructured<T extends z.ZodTypeAny>(
	opts: RunStructuredOptions<T>
): Promise<z.infer<T>> {
	circuitCheck(opts.task);
	if (opts.sessionId) await checkTokenBudget(opts.sessionId);

	const key = cacheKey(opts.task, opts.system, opts.prompt, 'structured');
	const cached = cacheGet(key);
	if (cached !== null) {
		console.log(`[llm] ${opts.task} cache hit`);
		return JSON.parse(cached) as z.infer<T>;
	}

	const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		const model = await getModel(opts.task);
		const t0 = Date.now();
		try {
			const result = await generateObject({
				model,
				schema: opts.schema,
				mode: 'tool',
				system: opts.system,
				prompt: opts.prompt,
				temperature: opts.temperature ?? 0,
				abortSignal: opts.signal
			});
			const latency = Date.now() - t0;
			logCall(opts.task, latency, true);
			circuitRecordSuccess(opts.task);
			addTokenUsage(opts.sessionId, estimateTokens(opts.system + opts.prompt));
			const json = JSON.stringify(result.object);
			cachePut(key, opts.task, json, model.modelId, latency);
			return result.object;
		} catch (e) {
			const mapped = mapError(e);
			logCall(opts.task, Date.now() - t0, false, e);
			circuitRecordFailure(opts.task, mapped);

			if (mapped instanceof LlmAbortError || mapped instanceof LlmAuthError) {
				throw mapped;
			}

			lastError = mapped;

			if (attempt < maxRetries && isRetryable(mapped)) {
				const delay = getRetryDelay(attempt, mapped);
				await sleep(delay);
				continue;
			}

			throw mapped;
		}
	}

	throw lastError ?? new LlmProviderError('Max retries exceeded');
}

export async function streamStructured<T extends z.ZodTypeAny>(opts: StreamStructuredOptions<T>) {
	circuitCheck(opts.task);
	if (opts.sessionId) await checkTokenBudget(opts.sessionId);

	const model = await getModel(opts.task);
	try {
		addTokenUsage(opts.sessionId, estimateTokens(opts.system + opts.prompt));
		return streamObject({
			model,
			schema: opts.schema,
			system: opts.system,
			prompt: opts.prompt,
			temperature: opts.temperature ?? 0,
			abortSignal: opts.signal
		});
	} catch (e) {
		const mapped = mapError(e);
		circuitRecordFailure(opts.task, mapped);
		throw mapped;
	}
}

export async function runText(opts: {
	task: TaskName;
	system: string;
	prompt: string;
	temperature?: number;
	signal?: AbortSignal;
	maxTokens?: number;
	maxRetries?: number;
	sessionId?: string;
}): Promise<string> {
	circuitCheck(opts.task);
	if (opts.sessionId) await checkTokenBudget(opts.sessionId);

	const key = cacheKey(opts.task, opts.system, opts.prompt, 'text');
	const cached = cacheGet(key);
	if (cached !== null) {
		console.log(`[llm] ${opts.task} cache hit`);
		return JSON.parse(cached) as string;
	}

	const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		const model = await getModel(opts.task);
		const t0 = Date.now();
		try {
			const result = await generateText({
				model,
				system: opts.system,
				prompt: opts.prompt,
				temperature: opts.temperature ?? 0,
				maxOutputTokens: opts.maxTokens,
				abortSignal: opts.signal
			});
			const latency = Date.now() - t0;
			logCall(opts.task, latency, true);
			circuitRecordSuccess(opts.task);
			addTokenUsage(opts.sessionId, estimateTokens(opts.system + opts.prompt));
			cachePut(key, opts.task, JSON.stringify(result.text), model.modelId, latency);
			return result.text;
		} catch (e) {
			const mapped = mapError(e);
			logCall(opts.task, Date.now() - t0, false, e);
			circuitRecordFailure(opts.task, mapped);

			if (mapped instanceof LlmAbortError || mapped instanceof LlmAuthError) {
				throw mapped;
			}

			lastError = mapped;

			if (attempt < maxRetries && isRetryable(mapped)) {
				const delay = getRetryDelay(attempt, mapped);
				await sleep(delay);
				continue;
			}

			throw mapped;
		}
	}

	throw lastError ?? new LlmProviderError('Max retries exceeded');
}

function isRetryable(err: Error): boolean {
	if (err instanceof LlmRateLimitError) return true;
	if (err instanceof LlmProviderError) return true;
	if (err instanceof LlmSchemaError) return true;
	return false;
}

function getRetryDelay(attempt: number, err: Error): number {
	if (err instanceof LlmRateLimitError && err.retryAfterSec) {
		return err.retryAfterSec * 1000;
	}
	const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
	return delay + Math.random() * 200;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function logCall(task: TaskName, latencyMs: number, ok: boolean, err?: unknown): void {
	const level = ok ? 'info' : 'warn';
	let detail = '';
	if (!ok && err instanceof Error) {
		detail = err.name;
		if (NoObjectGeneratedError.isInstance(err)) {
			const raw = (err as NoObjectGeneratedError).text ?? '';
			detail += ` finishReason=${(err as NoObjectGeneratedError).finishReason ?? 'unknown'}`;
			if (raw) detail += ` raw=${raw.slice(0, 500)}`;
		}
	}
	const message = ok
		? `[llm] ${task} ok ${latencyMs}ms`
		: `[llm] ${task} fail ${latencyMs}ms ${detail}`;
	if (level === 'info') console.log(message);
	else console.warn(message);
}

function mapError(e: unknown): Error {
	if (NoObjectGeneratedError.isInstance(e)) {
		const noe = e as NoObjectGeneratedError;
		const raw = noe.text ?? '';
		const reason = noe.finishReason ?? 'unknown';
		return new LlmSchemaError(
			`NoObjectGenerated (finishReason=${reason}): ${raw.slice(0, 800)}`
		);
	}
	if (e instanceof Error) {
		const name = e.name.toLowerCase();
		const message = e.message.toLowerCase();
		if (name === 'aborterror' || message.includes('aborted')) return new LlmAbortError();
		if (
			message.includes('zoderror') ||
			name.includes('zod') ||
			message.includes('no object generated') ||
			message.includes('could not parse') ||
			message.includes('failed to parse')
		) {
			return new LlmSchemaError(e.message);
		}
		if (message.includes('401') || message.includes('403') || message.includes('unauthor')) {
			return new LlmAuthError(e.message);
		}
		if (message.includes('429')) {
			return new LlmRateLimitError(e.message);
		}
		return new LlmProviderError(e.message);
	}
	return new LlmProviderError(String(e));
}

export { getModel } from './provider';
export type { TaskName } from './tasks';
