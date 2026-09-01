import { error, json } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { resolve as pathResolve } from 'node:path';

import { adaptFiles } from '$lib/server/mr/gitlab-adapter';
import { resolveTokenForHost } from '$lib/server/mr/mutate';

import type { RequestHandler } from './$types';

/**
 * Return the diff set at a specific MR version. Response shape mirrors the
 * `files` field of MrBundle so the client can swap it in atomically.
 *
 * Two modes:
 * - ?fixture=<slug>: read tests/fixtures/mr/<slug>/versions/<versionId>.json
 *   if present, otherwise 404 (fixture does not carry every historical diff).
 * - live: hit /merge_requests/{iid}/versions/{versionId} on gitlab.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const iid = Number(params.iid);
	const versionId = Number(params.versionId);
	if (!Number.isFinite(iid) || iid <= 0) throw error(400, 'invalid iid');
	if (!Number.isFinite(versionId) || versionId <= 0) throw error(400, 'invalid versionId');

	const fixture = url.searchParams.get('fixture');
	if (fixture) {
		if (!/^[a-zA-Z0-9._-]+$/.test(fixture)) throw error(400, 'invalid fixture slug');
		const path = pathResolve(
			process.cwd(),
			'tests',
			'fixtures',
			'mr',
			fixture,
			'versions',
			`${versionId}.json`
		);
		try {
			const raw = JSON.parse(await readFile(path, 'utf8'));
			// GitLab returns the version wrapper; its `diffs` field is the same
			// shape as the top-level /diffs endpoint.
			const diffs = (raw && typeof raw === 'object' && Array.isArray(raw.diffs)) ? raw.diffs : [];
			return json({ files: adaptFiles(diffs) });
		} catch {
			throw error(404, `fixture version not captured: ${versionId}`);
		}
	}

	const projectPath = url.searchParams.get('project');
	if (!projectPath) throw error(400, 'projectPath required');
	const host = url.searchParams.get('host') ?? 'git.cgm.ag';
	const token = resolveTokenForHost(host);
	if (!token) throw error(401, 'no gitlab token');

	const p = encodeURIComponent(projectPath);
	const target = `https://${host}/api/v4/projects/${p}/merge_requests/${iid}/versions/${versionId}`;
	const res = await fetch(target, { headers: { 'PRIVATE-TOKEN': token } });
	if (!res.ok) throw error(res.status, `gitlab ${res.status}`);
	const raw = (await res.json()) as { diffs?: unknown };
	const diffs = Array.isArray(raw.diffs) ? raw.diffs : [];
	return json({ files: adaptFiles(diffs) });
};
