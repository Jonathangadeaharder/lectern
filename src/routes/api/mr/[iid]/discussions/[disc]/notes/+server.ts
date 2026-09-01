import { error, json } from '@sveltejs/kit';

import { replyToDiscussion, resolveTokenForHost } from '$lib/server/mr/mutate';

import type { RequestHandler } from './$types';

interface Body {
	host?: string;
	projectPath: string;
	body: string;
	fixture?: boolean;
}

export const POST: RequestHandler = async ({ params, request }) => {
	const iid = Number(params.iid);
	if (!Number.isFinite(iid) || iid <= 0) throw error(400, 'invalid iid');
	const disc = params.disc;
	if (!disc) throw error(400, 'disc required');
	const b = (await request.json()) as Body;
	if (b.fixture) return json({ ok: true, mode: 'fixture', echo: { body: b.body } });

	if (!b.projectPath || !b.body) throw error(400, 'projectPath, body required');
	const host = b.host ?? 'git.cgm.ag';
	const token = resolveTokenForHost(host);
	if (!token) throw error(401, 'no gitlab token');
	try {
		const result = await replyToDiscussion(
			token,
			{ host, projectPath: b.projectPath, iid },
			disc,
			b.body
		);
		return json({ ok: true, mode: 'live', note: result });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw error(502, `gitlab: ${msg}`);
	}
};
