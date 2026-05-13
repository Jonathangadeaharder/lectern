import { z } from 'zod';
import { permitHost } from '../net/fetch';
import { getSetting, setSetting } from '../settings/app_settings';

export const QuickConfigSchema = z.object({
	endpoint: z.string().url(),
	model: z.string().min(1),
	headers: z.record(z.string()).optional()
});

export type QuickConfig = z.infer<typeof QuickConfigSchema>;

const KEY = 'llm.quick_config';

export async function getQuickConfig(): Promise<QuickConfig | null> {
	const value = await getSetting<unknown>(KEY);
	if (!value) return null;
	const parsed = QuickConfigSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}

export async function setQuickConfig(cfg: QuickConfig): Promise<void> {
	await setSetting(KEY, cfg);
	try {
		const host = new URL(cfg.endpoint).hostname;
		permitHost(host);
	} catch {
		// invalid URL caught by Zod earlier; ignore
	}
}

export interface ProviderPreset {
	id: string;
	label: string;
	endpoint: string;
	model: string;
	headers?: Record<string, string>;
	help?: string;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
	{
		id: 'anthropic',
		label: 'Anthropic',
		endpoint: 'https://api.anthropic.com/v1',
		model: 'claude-sonnet-4-6',
		headers: { 'anthropic-version': '2023-06-01' }
	},
	{
		id: 'openai',
		label: 'OpenAI',
		endpoint: 'https://api.openai.com/v1',
		model: 'gpt-4o'
	},
	{
		id: 'openrouter',
		label: 'OpenRouter',
		endpoint: 'https://openrouter.ai/api/v1',
		model: 'anthropic/claude-sonnet-4'
	},
	{
		id: 'google',
		label: 'Google AI Studio',
		endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
		model: 'gemini-2.5-pro'
	},
	{
		id: 'ollama',
		label: 'Ollama (local)',
		endpoint: 'http://localhost:11434/v1',
		model: 'qwen2.5-coder:32b',
		help: 'Token can be any non-empty string for local Ollama.'
	},
	{
		id: 'lmstudio',
		label: 'LM Studio (local)',
		endpoint: 'http://localhost:1234/v1',
		model: 'auto',
		help: 'Token can be any non-empty string for local LM Studio.'
	},
	{
		id: 'custom',
		label: 'Custom OpenAI-compatible',
		endpoint: '',
		model: ''
	}
] as const;

const ProviderPresetSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	endpoint: z.string(),
	model: z.string(),
	headers: z.record(z.string()).optional(),
	help: z.string().optional()
});

function loadExtraPresets(): ProviderPreset[] {
	const raw = process.env.LECTERN_EXTRA_PRESETS;
	if (!raw) return [];
	try {
		const parsed = z.array(ProviderPresetSchema).parse(JSON.parse(raw));
		return parsed;
	} catch (e) {
		console.warn('LECTERN_EXTRA_PRESETS is set but failed to parse:', (e as Error).message);
		return [];
	}
}

export function listPresets(): ProviderPreset[] {
	const extras = loadExtraPresets();
	const baseIds = new Set(extras.map((p) => p.id));
	return [...extras, ...PROVIDER_PRESETS.filter((p) => !baseIds.has(p.id))];
}

export function defaultPresetId(): string {
	const fromEnv = process.env.LECTERN_DEFAULT_PRESET?.trim();
	if (fromEnv) return fromEnv;
	return listPresets()[0]?.id ?? 'anthropic';
}
