import type { RequestEvent } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { invalidateProviderCache } from '$lib/server/services/llm/provider';
import {
	getQuickConfig,
	QuickConfigSchema,
	setQuickConfig
} from '$lib/server/services/llm/quick_config';
import { hasKey, setKey } from '$lib/server/services/secrets/keychain';

export async function GET() {
	const cfg = await getQuickConfig();
	const has = await hasKey('llm.quick');
	if (!cfg) {
		return json({ endpoint: null, model: null, headers: null, hasToken: has });
	}
	return json({
		endpoint: cfg.endpoint,
		model: cfg.model,
		headers: cfg.headers ?? null,
		hasToken: has
	});
}

const PutBodySchema = QuickConfigSchema.extend({
	token: z.string().min(1)
});

export async function PUT({ request }: RequestEvent) {
	const body = await request.json().catch(() => null);
	const parsed = PutBodySchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, `Invalid body: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
	}

	const { token, ...cfg } = parsed.data;
	await setQuickConfig(cfg);
	await setKey('llm.quick', token);
	invalidateProviderCache();

	return json({ ok: true });
}
