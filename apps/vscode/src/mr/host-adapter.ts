/**
 * Extension-host side loader for MR bundles.
 *
 * Duplicates just enough of src/lib/server/mr/gitlab-adapter.ts + source.ts to
 * run under the VS Code extension host (Node, no SvelteKit). The Svelte
 * components in src/lib/client/mr/ are imported directly by the webview via
 * the $lib esbuild alias, so the *shape* (MrBundle) must match exactly.
 *
 * Two sources:
 * - fixture: reads tests/fixtures/mr/<slug>/*.json from the workspace root
 * - gitlab:  calls the v4 REST API with a token from context.secrets or env
 */

import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

import { adaptBundle, type RawMrBundle } from '../../../../src/lib/server/mr/gitlab-adapter';
import type { MrBundle } from '../../../../src/lib/shared/mr/types';

export type MrSource =
	| { kind: 'fixture'; slug: string; workspaceRoot: string }
	| { kind: 'gitlab'; projectPath: string; iid: number; host: string; token: string };

async function loadFixture(root: string, slug: string): Promise<RawMrBundle> {
	const base = path.join(root, 'tests', 'fixtures', 'mr', slug);
	const read = async (f: string): Promise<unknown> =>
		JSON.parse(await readFile(path.join(base, f), 'utf8'));
	const [mr, diffs, discussions, versions, pipelines, approvals] = await Promise.all([
		read('mr.json'),
		read('diffs.json'),
		read('discussions.json'),
		read('versions.json'),
		read('pipelines.json'),
		read('approvals.json')
	]);
	return { mr, diffs, discussions, versions, pipelines, approvals };
}

async function glGet(url: string, token: string): Promise<unknown> {
	const res = await fetch(url, { headers: { 'PRIVATE-TOKEN': token } });
	if (!res.ok) throw new Error(`GitLab ${res.status} on ${url.replace(/\?.*/, '')}`);
	return res.json();
}

async function loadFromGitlab(
	projectPath: string,
	iid: number,
	host: string,
	token: string
): Promise<RawMrBundle> {
	const p = encodeURIComponent(projectPath);
	const base = `https://${host}/api/v4/projects/${p}/merge_requests/${iid}`;
	const [mr, diffs, discussions, versions, pipelines, approvals] = await Promise.all([
		glGet(base, token),
		glGet(`${base}/diffs?per_page=100`, token),
		glGet(`${base}/discussions?per_page=100`, token),
		glGet(`${base}/versions`, token),
		glGet(`${base}/pipelines`, token),
		glGet(`${base}/approvals`, token).catch(() => ({}))
	]);
	return { mr, diffs, discussions, versions, pipelines, approvals };
}

export async function loadBundleForHost(source: MrSource): Promise<MrBundle> {
	const raw =
		source.kind === 'fixture'
			? await loadFixture(source.workspaceRoot, source.slug)
			: await loadFromGitlab(source.projectPath, source.iid, source.host, source.token);
	return adaptBundle(raw);
}
