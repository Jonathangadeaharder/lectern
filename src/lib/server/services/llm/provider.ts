import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModelV1 } from 'ai';
import { getKey } from '../secrets/keychain';
import { LlmAuthError, LlmNotConfiguredError } from './errors';
import { type QuickConfig, getQuickConfig } from './quick_config';
import { getTaskOverride } from './task_config';
import type { TaskName } from './tasks';

let cachedKey: string | undefined;
let cachedConfig: QuickConfig | undefined;

export function invalidateProviderCache(): void {
	cachedKey = undefined;
	cachedConfig = undefined;
}

export async function getModel(task?: TaskName): Promise<LanguageModelV1> {
	const cfg = (await getQuickConfig()) ?? undefined;
	if (!cfg) throw new LlmNotConfiguredError();

	const token = await getKey('llm.quick');
	if (!token) throw new LlmAuthError('No API token stored. Re-run onboarding.');

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
		headers
	});

	return provider.chatModel(model);
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
