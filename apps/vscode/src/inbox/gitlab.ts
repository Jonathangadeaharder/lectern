// Trimmed lift of src/lib/server/services/ingestion/gitlab.ts — only the
// "inbox" surface (list MRs by scope) survives. Diff/file/commit ingestion
// stays in the SvelteKit world.

import { type ParsedPrUrl, parsePrUrl, repoSlug } from './url';

export function envVarForGitlabHost(host: string): string {
	const safe = host.toUpperCase().replace(/[^A-Z0-9]/g, '_');
	return `LECTERN_GITLAB_TOKEN_${safe}`;
}

function apiBase(host: string): string {
	return `https://${host}/api/v4`;
}

async function glFetch(
	host: string,
	path: string,
	token: string,
	signal?: AbortSignal
): Promise<Response> {
	const res = await fetch(`${apiBase(host)}${path}`, {
		headers: { 'PRIVATE-TOKEN': token },
		signal
	});
	if (!res.ok) {
		const err = new Error(`GitLab API ${res.status} ${path}`);
		(err as { status?: number }).status = res.status;
		throw err;
	}
	return res;
}

export interface InboxMr {
	id: number;
	webUrl: string;
	title: string;
	state: 'open' | 'draft' | 'merged' | 'closed';
	projectPath: string;
	projectName: string;
	repoSlug: string;
	author: string;
	updatedAt: string;
}

interface RawMr {
	iid?: number;
	web_url?: string;
	title?: string;
	state?: string;
	draft?: boolean;
	work_in_progress?: boolean;
	references?: { full?: string };
	author?: { username?: string };
	updated_at?: string;
}

function mapMr(raw: RawMr): InboxMr {
	const stateStr = String(raw.state ?? 'opened');
	const state: InboxMr['state'] =
		raw.draft === true || raw.work_in_progress === true
			? 'draft'
			: stateStr === 'merged'
				? 'merged'
				: stateStr === 'closed'
					? 'closed'
					: 'open';
	const webUrl = String(raw.web_url ?? '');
	let projectPath = raw.references?.full?.split('!')[0] ?? '';
	let slug = '';
	try {
		const parsed: ParsedPrUrl = parsePrUrl(webUrl);
		projectPath = `${parsed.owner}/${parsed.repo}`;
		slug = repoSlug(parsed);
	} catch {
		const parts = projectPath.split('/');
		const owner = parts.slice(0, -1).join('/');
		const repo = parts[parts.length - 1] ?? '';
		slug = `${owner.replace(/[^A-Za-z0-9._-]/g, '_')}__${repo.replace(/[^A-Za-z0-9._-]/g, '_')}`;
	}
	return {
		id: Number(raw.iid ?? 0),
		webUrl,
		title: String(raw.title ?? ''),
		state,
		projectPath,
		projectName: projectPath.split('/').pop() ?? projectPath,
		repoSlug: slug,
		author: String(raw.author?.username ?? 'unknown'),
		updatedAt: String(raw.updated_at ?? '')
	};
}

export async function fetchGitlabInbox(
	host: string,
	token: string,
	signal?: AbortSignal
): Promise<{ reviewing: InboxMr[]; authored: InboxMr[] }> {
	const opts = 'state=opened&per_page=30&order_by=updated_at';
	const [reviewing, authored] = await Promise.all([
		glFetch(host, `/merge_requests?scope=assigned_to_me&${opts}`, token, signal),
		glFetch(host, `/merge_requests?scope=created_by_me&${opts}`, token, signal)
	]);
	const [rRev, rAuth] = await Promise.all([reviewing.json(), authored.json()]);
	return {
		reviewing: (rRev as RawMr[]).map(mapMr),
		authored: (rAuth as RawMr[]).map(mapMr)
	};
}
