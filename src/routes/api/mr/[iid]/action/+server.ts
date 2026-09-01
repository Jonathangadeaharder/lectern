import { error, json } from '@sveltejs/kit';

import {
	approveMr,
	postGeneralNote,
	resolveTokenForHost,
	unapproveMr
} from '$lib/server/mr/mutate';

import type { RequestHandler } from './$types';

interface Body {
	kind: 'approve' | 'unapprove' | 'comment';
	host?: string;
	projectPath: string;
	body?: string;
	fixture?: boolean;
}

export const POST: RequestHandler = async ({ params, request }) => {
	const iid = Number(params.iid);
	if (!Number.isFinite(iid) || iid <= 0) throw error(400, 'invalid iid');

	const b = (await request.json()) as Body;
	if (b.fixture) {
		// Client is running against a snapshot; no network call. Reply with a
		// stub so the aria-live announcement + optimistic UI still work.
		return json({ ok: true, mode: 'fixture', kind: b.kind });
	}

	if (!b.projectPath) throw error(400, 'projectPath required');
	const host = b.host ?? 'git.cgm.ag';
	const token = resolveTokenForHost(host);
	if (!token) {
		throw error(
			401,
			`no gitlab token in env LECTERN_GITLAB_TOKEN_${host.toUpperCase().replaceAll('.', '_')}`
		);
	}
	const opts = { host, projectPath: b.projectPath, iid };
	try {
		if (b.kind === 'approve') await approveMr(token, opts);
		else if (b.kind === 'unapprove') await unapproveMr(token, opts);
		else if (b.kind === 'comment') {
			if (!b.body) throw error(400, 'body required for comment');
			await postGeneralNote(token, opts, b.body);
		} else {
			throw error(400, `unknown kind: ${b.kind}`);
		}
		return json({ ok: true, mode: 'live', kind: b.kind });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw error(502, `gitlab: ${msg}`);
	}
};
