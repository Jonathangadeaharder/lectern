/** Public LLM service surface. */
import { generateObject, generateText, streamObject } from 'ai';
import type { z } from 'zod';
import {
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
}

export interface StreamStructuredOptions<T extends z.ZodTypeAny> {
	task: TaskName;
	schema: T;
	system: string;
	prompt: string;
	temperature?: number;
	signal?: AbortSignal;
}

const DEFAULT_MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 10000;

export async function runStructured<T extends z.ZodTypeAny>(
	opts: RunStructuredOptions<T>
): Promise<z.infer<T>> {
	const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		const model = await getModel(opts.task);
		const t0 = Date.now();
		try {
			const result = await generateObject({
				model,
				schema: opts.schema,
				system: opts.system,
				prompt: opts.prompt,
				temperature: opts.temperature ?? 0,
				abortSignal: opts.signal
			});
			logCall(opts.task, Date.now() - t0, true);
			return result.object;
		} catch (e) {
			const mapped = mapError(e);
			logCall(opts.task, Date.now() - t0, false, e);

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
	const model = await getModel(opts.task);
	try {
		return streamObject({
			model,
			schema: opts.schema,
			system: opts.system,
			prompt: opts.prompt,
			temperature: opts.temperature ?? 0,
			abortSignal: opts.signal
		});
	} catch (e) {
		throw mapError(e);
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
}): Promise<string> {
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
				maxTokens: opts.maxTokens,
				abortSignal: opts.signal
			});
			logCall(opts.task, Date.now() - t0, true);
			return result.text;
		} catch (e) {
			const mapped = mapError(e);
			logCall(opts.task, Date.now() - t0, false, e);

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
	// Console log only in v1.0; `llm_calls` table deferred to v1.1.
	const message = ok
		? `[llm] ${task} ok ${latencyMs}ms`
		: `[llm] ${task} fail ${latencyMs}ms ${err instanceof Error ? err.name : ''}`;
	if (level === 'info') console.log(message);
	else console.warn(message);
}

function mapError(e: unknown): Error {
	if (e instanceof Error) {
		const name = e.name.toLowerCase();
		const message = e.message.toLowerCase();
		if (name === 'aborterror' || message.includes('aborted')) return new LlmAbortError();
		if (message.includes('zoderror') || name.includes('zod')) return new LlmSchemaError(e.message);
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
