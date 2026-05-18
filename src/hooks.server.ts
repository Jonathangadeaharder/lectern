import 'dotenv/config';
import { resolveDataDir } from '$lib/server/config/paths';
import { getQuickConfig } from '$lib/server/services/llm/quick_config';
import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

const ALLOW_PREFIXES = ['/onboarding', '/settings', '/api/settings', '/api/health', '/_app/'];

const LLM_GATED_PREFIXES = ['/session', '/debrief', '/dashboard', '/api/sessions', '/api/grades'];

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.dataDir = resolveDataDir().root;

	const path = event.url.pathname;

	if (path === '/' || ALLOW_PREFIXES.some((p) => path.startsWith(p))) {
		return resolve(event);
	}

	if (LLM_GATED_PREFIXES.some((p) => path.startsWith(p))) {
		const cfg = await getQuickConfig();
		if (!cfg) {
			throw redirect(302, `/onboarding?from=${encodeURIComponent(path)}`);
		}
	}

	return resolve(event);
};
