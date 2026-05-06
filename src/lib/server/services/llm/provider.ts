import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { getQuickConfig, type QuickConfig } from './quick_config';
import { getKey } from '../secrets/keychain';
import { LlmAuthError, LlmNotConfiguredError } from './errors';
import type { LanguageModelV1 } from 'ai';

let cachedKey: string | undefined;
let cachedConfig: QuickConfig | undefined;

export function invalidateProviderCache(): void {
	cachedKey = undefined;
	cachedConfig = undefined;
}

export async function getModel(): Promise<LanguageModelV1> {
	const cfg = (await getQuickConfig()) ?? undefined;
	if (!cfg) throw new LlmNotConfiguredError();

	const token = await getKey('llm.quick');
	if (!token) throw new LlmAuthError('No API token stored. Re-run onboarding.');

	cachedKey = token;
	cachedConfig = cfg;

	const provider = createOpenAICompatible({
		name: 'lectern-default',
		baseURL: cfg.endpoint,
		apiKey: token,
		headers: cfg.headers
	});

	return provider.chatModel(cfg.model);
}

/** Build a provider from explicit values (used by `testConnection` before persisting). */
export function buildModelFromValues(
	endpoint: string,
	model: string,
	token: string,
	headers?: Record<string, string>
): LanguageModelV1 {
	const provider = createOpenAICompatible({
		name: 'lectern-test',
		baseURL: endpoint,
		apiKey: token,
		headers
	});
	return provider.chatModel(model);
}

export function getCachedConfig(): { endpoint?: string; model?: string; headers?: Record<string, string> } {
	return {
		endpoint: cachedConfig?.endpoint,
		model: cachedConfig?.model,
		headers: cachedConfig?.headers
	};
}
