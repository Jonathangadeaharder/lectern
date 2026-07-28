import 'dotenv/config';
import { resolveDataDir } from '$lib/server/config/paths';
import { getQuickConfig } from '$lib/server/services/llm/quick_config';
import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

const ALLOW_PREFIXES = ['/onboarding', '/settings', '/api/settings', '/api/health', '/_app/'];

const LLM_GATED_PREFIXES = ['/session', '/debrief', '/dashboard', '/api/sessions', '/api/grades'];

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// CSRF guard: a malicious page could reach http://localhost and trigger side
// effects with the user's stored credentials. Reject state-changing /api/*
// requests whose Origin/Referer is not same-origin; headerless clients pass.
function isSameOriginRequest(request: Request, url: URL): boolean {
	const origin = request.headers.get('origin');
	const referer = request.headers.get('referer');
	if (!origin && !referer) return true;
	const expected = url.origin;
	for (const value of [origin, referer]) {
		if (!value) continue;
		try {
			if (new URL(value).origin === expected) return true;
		} catch {
			// Malformed header (e.g. `Origin: null`) — treat as cross-origin.
		}
	}
	return false;
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.dataDir = resolveDataDir().root;

	const path = event.url.pathname;

	if (path.startsWith('/api/') && STATE_CHANGING_METHODS.has(event.request.method)) {
		if (!isSameOriginRequest(event.request, event.url)) {
			return new Response('Cross-origin request rejected', { status: 403 });
		}
	}

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
