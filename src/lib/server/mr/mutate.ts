/**
 * Server-side mutating calls to GitLab v4. Reuses the token-precedence rule
 * of the ingestion client so the reviewer never has to configure a second
 * secret. All routes in src/routes/api/mr/** delegate to this file.
 */

import { env } from '$env/dynamic/private';

import { GitLabHttpError, GitLabTimeoutError } from './source';

const REQUEST_TIMEOUT_MS = 10_000;

export interface MutateOpts {
	host?: string;
	projectPath: string;
	iid: number;
}

export function resolveTokenForHost(host: string): string | null {
	const envVar = `LECTERN_GITLAB_TOKEN_${host.toUpperCase().replaceAll('.', '_')}`;
	return env[envVar] ?? null;
}

async function glMutate(
	url: string,
	token: string,
	init: RequestInit
): Promise<unknown> {
	const bareUrl = url.replace(/\?.*/, '');
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
	try {
		let res: Response;
		try {
			res = await fetch(url, {
				...init,
				headers: {
					'PRIVATE-TOKEN': token,
					'Content-Type': 'application/json',
					Accept: 'application/json',
					...(init.headers ?? {})
				},
				signal: ctl.signal
			});
		} catch (e) {
			if (ctl.signal.aborted) throw new GitLabTimeoutError(bareUrl, REQUEST_TIMEOUT_MS);
			throw e;
		}
		if (!res.ok) throw new GitLabHttpError(bareUrl, res.status);
		if (res.status === 204) return null;
		const text = await res.text();
		return text ? JSON.parse(text) : null;
	} finally {
		clearTimeout(timer);
	}
}

function baseUrl(opts: MutateOpts): string {
	const host = opts.host ?? 'git.cgm.ag';
	const p = encodeURIComponent(opts.projectPath);
	return `https://${host}/api/v4/projects/${p}/merge_requests/${opts.iid}`;
}

export async function approveMr(token: string, opts: MutateOpts): Promise<unknown> {
	return glMutate(`${baseUrl(opts)}/approve`, token, { method: 'POST' });
}

export async function unapproveMr(token: string, opts: MutateOpts): Promise<unknown> {
	return glMutate(`${baseUrl(opts)}/unapprove`, token, { method: 'POST' });
}

export async function postGeneralNote(
	token: string,
	opts: MutateOpts,
	body: string
): Promise<unknown> {
	return glMutate(`${baseUrl(opts)}/notes`, token, {
		method: 'POST',
		body: JSON.stringify({ body })
	});
}

export interface DiffPosition {
	base_sha: string;
	head_sha: string;
	start_sha: string;
	position_type: 'text';
	new_path?: string;
	old_path?: string;
	new_line?: number;
	old_line?: number;
}

export async function postPositionedDiscussion(
	token: string,
	opts: MutateOpts,
	body: string,
	position: DiffPosition
): Promise<unknown> {
	return glMutate(`${baseUrl(opts)}/discussions`, token, {
		method: 'POST',
		body: JSON.stringify({ body, position })
	});
}

export async function replyToDiscussion(
	token: string,
	opts: MutateOpts,
	discussionId: string,
	body: string
): Promise<unknown> {
	return glMutate(
		`${baseUrl(opts)}/discussions/${encodeURIComponent(discussionId)}/notes`,
		token,
		{ method: 'POST', body: JSON.stringify({ body }) }
	);
}

export async function resolveDiscussion(
	token: string,
	opts: MutateOpts,
	discussionId: string,
	resolved: boolean
): Promise<unknown> {
	const url = `${baseUrl(opts)}/discussions/${encodeURIComponent(discussionId)}?resolved=${resolved}`;
	return glMutate(url, token, { method: 'PUT' });
}
