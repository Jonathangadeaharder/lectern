import { error, json } from '@sveltejs/kit';

import { resolveDiscussion, resolveTokenForHost } from '$lib/server/mr/mutate';

import type { RequestHandler } from './$types';

interface Body {
	host?: string;
	projectPath: string;
	resolved: boolean;
	fixture?: boolean;
}

export const PUT: RequestHandler = async ({ params, request }) => {
	const iid = Number(params.iid);
	if (!Number.isFinite(iid) || iid <= 0) throw error(400, 'invalid iid');
	const disc = params.disc;
	if (!disc) throw error(400, 'disc required');
	const b = (await request.json()) as Body;
	if (b.fixture)
		return json({ ok: true, mode: 'fixture', resolved: Boolean(b.resolved) });

	if (!b.projectPath) throw error(400, 'projectPath required');
	const host = b.host ?? 'git.cgm.ag';
	const token = resolveTokenForHost(host);
	if (!token) throw error(401, 'no gitlab token');
	try {
		const result = await resolveDiscussion(
			token,
			{ host, projectPath: b.projectPath, iid },
			disc,
			Boolean(b.resolved)
		);
		return json({ ok: true, mode: 'live', discussion: result });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw error(502, `gitlab: ${msg}`);
	}
};
