import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModelV2 } from '@ai-sdk/provider';
import { getKey } from '../secrets/keychain';
import { LlmAuthError, LlmNotConfiguredError } from './errors';
import { type QuickConfig, getQuickConfig } from './quick_config';
import { resolveSecret } from './secret_ref';
import { getTaskOverride } from './task_config';
import type { TaskName } from './tasks';

let cachedKey: string | undefined;
let cachedConfig: QuickConfig | undefined;

export function invalidateProviderCache(): void {
	cachedKey = undefined;
	cachedConfig = undefined;
}

const compatFetch: typeof fetch = async (input, init) => {
	if (init?.body && typeof init.body === 'string') {
		try {
			const body = JSON.parse(init.body);
			if ('max_tokens' in body && !('max_completion_tokens' in body)) {
				body.max_completion_tokens = body.max_tokens;
				delete body.max_tokens;
				init = { ...init, body: JSON.stringify(body) };
			}
		} catch {
			// not JSON — pass through
		}
	}

	const res = await fetch(input, init);

	if (process.env.LECTERN_LLM_DEBUG === '1') {
		const clone = res.clone();
		const text = await clone.text();
		console.log('[llm-debug] response:', text.slice(0, 2000));
	}

	return res;
};

export async function getModel(task?: TaskName): Promise<LanguageModelV2> {
	const cfg = (await getQuickConfig()) ?? undefined;
	if (!cfg) throw new LlmNotConfiguredError();

	const stored = await getKey('llm.quick');
	if (!stored) throw new LlmAuthError('No API token stored. Re-run onboarding.');
	const token = resolveSecret(stored);

	cachedKey = token;
	cachedConfig = cfg;

	let endpoint = cfg.endpoint;
	let model = cfg.model;
	let headers = cfg.headers;

	if (task) {
		const override = await getTaskOverride(task);
		if (override) {
			if (override.endpoint) endpoint = override.endpoint;
			if (override.model) model = override.model;
			if (override.headers) headers = { ...headers, ...override.headers };
		}
	}

	const provider = createOpenAICompatible({
		name: 'lectern-default',
		baseURL: endpoint,
		apiKey: token,
		headers,
		fetch: compatFetch
	});

	return provider.chatModel(model);
}

export function buildModelFromValues(
	endpoint: string,
	model: string,
	token: string,
	headers?: Record<string, string>
): LanguageModelV2 {
	const provider = createOpenAICompatible({
		name: 'lectern-test',
		baseURL: endpoint,
		apiKey: resolveSecret(token),
		headers,
		fetch: compatFetch
	});
	return provider.chatModel(model);
}

export function getCachedConfig(): {
	endpoint?: string;
	model?: string;
	headers?: Record<string, string>;
} {
	return {
		endpoint: cachedConfig?.endpoint,
		model: cachedConfig?.model,
		headers: cachedConfig?.headers
	};
}
