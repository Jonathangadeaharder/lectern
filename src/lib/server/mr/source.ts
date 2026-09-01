/**
 * MR bundle loader. Two sources today:
 *
 * - `fixture` reads pre-captured GitLab v4 JSON from tests/fixtures/mr/<slug>/.
 *   Used by unit and e2e tests, and by dev when GITLAB_TOKEN is missing.
 * - `gitlab` fetches from the live REST API using the same token-precedence
 *   rules as the ingestion client.
 *
 * Adapters translate both into a single MrBundle so downstream code is source-
 * agnostic. All external I/O has size and time caps so a hostile MR or
 * misconfigured URL cannot exhaust memory or hang the server load.
 */

import { readFile, realpath } from 'node:fs/promises';
import { resolve as pathResolve, sep as pathSep } from 'node:path';

import type { MrBundle } from '$lib/shared/mr/types';
import { adaptBundle, type RawMrBundle } from './gitlab-adapter';

export type MrSource = 'fixture' | 'gitlab';

export interface LoadOpts {
	source: MrSource;
	/** For source=fixture: slug of the fixture dir under tests/fixtures/mr/. */
	fixtureSlug?: string;
	/** For source=gitlab: url-encoded owner/repo path. */
	projectPath?: string;
	iid?: number;
	host?: string;
	token?: string;
}

/** Only alphanumerics, hyphen, underscore, dot allowed in a fixture slug. */
const SLUG_RE = /^[a-zA-Z0-9._-]+$/;

/** Hard cap on any single GitLab response body. 20 MiB is comfortably above
 *  the observed MR 6635 largest response (~230 KB) and small enough that a
 *  runaway response cannot exhaust our server. */
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

/** Timeout for a single GitLab API call. */
const REQUEST_TIMEOUT_MS = 10_000;

async function loadFixture(slug: string): Promise<RawMrBundle> {
	if (!SLUG_RE.test(slug)) {
		throw new Error(`invalid fixture slug: ${slug}`);
	}
	const fixturesRoot = await realpath(pathResolve(process.cwd(), 'tests', 'fixtures', 'mr'));
	// realpath the candidate too, so a symlink out of the fixtures dir cannot escape.
	const candidate = pathResolve(fixturesRoot, slug);
	const resolved = await realpath(candidate);
	// Enforce prefix + separator so /foo does not slip past a check that /fooB starts with /foo
	if (!(resolved === fixturesRoot || resolved.startsWith(fixturesRoot + pathSep))) {
		throw new Error(`fixture path escapes root: ${slug}`);
	}
	const read = async (f: string): Promise<unknown> =>
		JSON.parse(await readFile(pathResolve(resolved, f), 'utf8'));
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

export class GitLabTimeoutError extends Error {
	constructor(public readonly url: string, public readonly timeoutMs: number) {
		super(`GitLab request timed out after ${timeoutMs}ms on ${url}`);
		this.name = 'GitLabTimeoutError';
	}
}

export class GitLabHttpError extends Error {
	constructor(public readonly url: string, public readonly status: number) {
		super(`GitLab ${status} on ${url}`);
		this.name = 'GitLabHttpError';
	}
}

async function glGet(url: string, token: string): Promise<unknown> {
	const bareUrl = url.replace(/\?.*/, '');
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
	try {
		let res: Response;
		try {
			res = await fetch(url, {
				headers: { 'PRIVATE-TOKEN': token, Accept: 'application/json' },
				signal: ctl.signal
			});
		} catch (e) {
			if (ctl.signal.aborted) throw new GitLabTimeoutError(bareUrl, REQUEST_TIMEOUT_MS);
			throw e;
		}
		if (!res.ok) {
			throw new GitLabHttpError(bareUrl, res.status);
		}
		// Trust Content-Length as a fast reject; also stream and count bytes so a
		// missing/lying header can't slip past.
		const cl = Number(res.headers.get('content-length') ?? '0');
		if (Number.isFinite(cl) && cl > MAX_RESPONSE_BYTES) {
			throw new Error(`GitLab response too large (${cl} > ${MAX_RESPONSE_BYTES})`);
		}
		if (!res.body) return null;
		const reader = res.body.getReader();
		const chunks: Uint8Array[] = [];
		let total = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			total += value.byteLength;
			if (total > MAX_RESPONSE_BYTES) {
				await reader.cancel();
				throw new Error(`GitLab response too large (${total} > ${MAX_RESPONSE_BYTES})`);
			}
			chunks.push(value);
		}
		const merged = new Uint8Array(total);
		let off = 0;
		for (const c of chunks) {
			merged.set(c, off);
			off += c.byteLength;
		}
		return JSON.parse(new TextDecoder('utf-8').decode(merged));
	} finally {
		clearTimeout(timer);
	}
}

async function loadFromGitlab(opts: LoadOpts): Promise<RawMrBundle> {
	const host = opts.host ?? 'git.cgm.ag';
	if (!opts.projectPath || !opts.iid || !opts.token) {
		throw new Error('gitlab source requires projectPath, iid, token');
	}
	const p = encodeURIComponent(opts.projectPath);
	const base = `https://${host}/api/v4/projects/${p}/merge_requests/${opts.iid}`;
	const [mr, diffs, discussions, versions, pipelines, approvals] = await Promise.all([
		glGet(base, opts.token),
		glGet(`${base}/diffs?per_page=100`, opts.token),
		glGet(`${base}/discussions?per_page=100`, opts.token),
		glGet(`${base}/versions`, opts.token),
		glGet(`${base}/pipelines`, opts.token),
		glGet(`${base}/approvals`, opts.token).catch((e) => {
			// Approvals is often unconfigured on personal projects; a 404 is
			// benign. Anything else (auth failure, timeout) must propagate so
			// the reviewer sees the real error instead of silent empty state.
			if (e instanceof GitLabHttpError && e.status === 404) return {};
			throw e;
		})
	]);
	return { mr, diffs, discussions, versions, pipelines, approvals };
}

export async function loadBundle(opts: LoadOpts): Promise<MrBundle> {
	const raw =
		opts.source === 'fixture'
			? await loadFixture(opts.fixtureSlug ?? 'mr-6635')
			: await loadFromGitlab(opts);
	return adaptBundle(raw);
}
