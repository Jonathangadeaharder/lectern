/** Public LLM service surface. */
import { generateObject, streamObject, generateText } from 'ai';
import type { z } from 'zod';
import { getModel } from './provider';
import {
	LlmAbortError,
	LlmAuthError,
	LlmProviderError,
	LlmRateLimitError,
	LlmSchemaError
} from './errors';
import type { TaskName } from './tasks';

export interface RunStructuredOptions<T extends z.ZodTypeAny> {
	task: TaskName;
	schema: T;
	system: string;
	prompt: string;
	temperature?: number;
	signal?: AbortSignal;
}

export interface StreamStructuredOptions<T extends z.ZodTypeAny> {
	task: TaskName;
	schema: T;
	system: string;
	prompt: string;
	temperature?: number;
	signal?: AbortSignal;
}

export async function runStructured<T extends z.ZodTypeAny>(
	opts: RunStructuredOptions<T>
): Promise<z.infer<T>> {
	const model = await getModel();
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
		logCall(opts.task, Date.now() - t0, false, e);
		throw mapError(e);
	}
}

export async function streamStructured<T extends z.ZodTypeAny>(opts: StreamStructuredOptions<T>) {
	const model = await getModel();
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
}): Promise<string> {
	const model = await getModel();
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
		logCall(opts.task, Date.now() - t0, false, e);
		throw mapError(e);
	}
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
