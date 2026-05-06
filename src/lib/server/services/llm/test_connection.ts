import { generateText } from 'ai';
import { z } from 'zod';
import { buildModelFromValues } from './provider';
import { LlmAuthError, LlmProviderError } from './errors';
import { permitHost, isHostAllowed } from '../net/fetch';

export const TestConnectionRequestSchema = z.object({
	endpoint: z.string().url(),
	model: z.string().min(1),
	token: z.string().min(1),
	headers: z.record(z.string()).optional()
});

export type TestConnectionRequest = z.infer<typeof TestConnectionRequestSchema>;

export interface TestConnectionResult {
	ok: boolean;
	model?: string;
	latencyMs?: number;
	error?: 'auth' | 'unreachable' | 'provider' | 'unknown';
	message?: string;
}

export async function testConnection(req: TestConnectionRequest): Promise<TestConnectionResult> {
	let host: string;
	try {
		host = new URL(req.endpoint).hostname;
	} catch {
		return { ok: false, error: 'unreachable', message: 'Invalid endpoint URL.' };
	}

	if (!isHostAllowed(host)) {
		permitHost(host);
	}

	const model = buildModelFromValues(req.endpoint, req.model, req.token, req.headers);
	const t0 = Date.now();

	try {
		const result = await generateText({
			model,
			prompt: 'Reply with the single token: OK',
			maxTokens: 4,
			temperature: 0,
			abortSignal: AbortSignal.timeout(15000)
		});
		return {
			ok: true,
			model: req.model,
			latencyMs: Date.now() - t0,
			message: result.text.trim().slice(0, 32)
		};
	} catch (e) {
		return classify(e);
	}
}

function classify(e: unknown): TestConnectionResult {
	if (e instanceof LlmAuthError) {
		return { ok: false, error: 'auth', message: e.message };
	}
	if (e instanceof LlmProviderError) {
		return { ok: false, error: 'provider', message: e.message };
	}
	const message = e instanceof Error ? e.message : String(e);
	const lower = message.toLowerCase();
	if (
		lower.includes('econnrefused') ||
		lower.includes('enotfound') ||
		lower.includes('timed out') ||
		lower.includes('fetch failed') ||
		lower.includes('network')
	) {
		return { ok: false, error: 'unreachable', message };
	}
	if (lower.includes('401') || lower.includes('403') || lower.includes('unauthor')) {
		return { ok: false, error: 'auth', message };
	}
	if (lower.includes('429')) {
		return { ok: false, error: 'provider', message };
	}
	return { ok: false, error: 'unknown', message };
}
