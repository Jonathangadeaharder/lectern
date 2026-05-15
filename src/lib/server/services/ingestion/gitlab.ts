import type { PlatformClient, PrMetadata, PrCommit } from './types';
import type { ParsedPrUrl } from './url';
import { getKey } from '../secrets/keychain';

function envVarForHost(host: string): string {
	const safe = host.toUpperCase().replace(/[^A-Z0-9]/g, '_');
	return `LECTERN_GITLAB_TOKEN_${safe}`;
}

async function getGitlabToken(host: string): Promise<string | null> {
	const fromKeychain = await getKey(`gitlab:${host}`);
	if (fromKeychain) return fromKeychain;
	const fromEnv = process.env[envVarForHost(host)];
	return fromEnv ?? null;
}

function projectPath(parsed: ParsedPrUrl): string {
	return encodeURIComponent(`${parsed.owner}/${parsed.repo}`);
}

function apiBase(host: string): string {
	return `https://${host}/api/v4`;
}

async function glFetch(
	host: string,
	path: string,
	token: string | null,
	signal?: AbortSignal
): Promise<Response> {
	const headers: Record<string, string> = {};
	if (token) headers['PRIVATE-TOKEN'] = token;
	const res = await fetch(`${apiBase(host)}${path}`, { headers, signal });
	if (res.status === 401 || res.status === 403) {
		const err = new Error(`GitLab API returned ${res.status}`);
		(err as { status?: number }).status = res.status;
		throw err;
	}
	if (!res.ok) throw new Error(`GitLab API error: ${res.status} ${await res.text()}`);
	return res;
}

export const gitlabClient: PlatformClient = {
	async fetchMetadata(parsed, signal) {
		const token = await getGitlabToken(parsed.host);
		const res = await glFetch(
			parsed.host,
			`/projects/${projectPath(parsed)}/merge_requests/${parsed.prNumber}`,
			token,
			signal
		);
		const data = (await res.json()) as Record<string, unknown>;
		const stateStr = String(data['state'] ?? 'opened');
		const state: PrMetadata['state'] =
			data['draft'] === true
				? 'draft'
				: stateStr === 'merged'
					? 'merged'
					: stateStr === 'closed'
						? 'closed'
						: 'open';
		return {
			title: String(data['title'] ?? ''),
			body: String(data['description'] ?? ''),
			author: String((data['author'] as Record<string, unknown>)?.['username'] ?? 'unknown'),
			state,
			headSha: String(((data['diff_refs'] as Record<string, unknown>) ?? {})['head_sha'] ?? ''),
			baseSha: String(((data['diff_refs'] as Record<string, unknown>) ?? {})['base_sha'] ?? ''),
			headRef: String(data['source_branch'] ?? ''),
			baseRef: String(data['target_branch'] ?? ''),
			createdAt: String(data['created_at'] ?? ''),
			updatedAt: String(data['updated_at'] ?? '')
		};
	},

	async fetchDiff(parsed, signal) {
		const token = await getGitlabToken(parsed.host);
		const res = await glFetch(
			parsed.host,
			`/projects/${projectPath(parsed)}/merge_requests/${parsed.prNumber}/raw_diffs`,
			token,
			signal
		);
		return res.text();
	},

	async fetchCommits(parsed, signal) {
		const token = await getGitlabToken(parsed.host);
		const res = await glFetch(
			parsed.host,
			`/projects/${projectPath(parsed)}/merge_requests/${parsed.prNumber}/commits`,
			token,
			signal
		);
		const data = (await res.json()) as Array<Record<string, unknown>>;
		return data.map((c) => ({
			sha: String(c['id'] ?? ''),
			message: String(c['message'] ?? ''),
			author: String(c['author_name'] ?? 'unknown'),
			date: String(c['created_at'] ?? '')
		}));
	},

	async fetchFile(parsed, path, ref, signal) {
		const token = await getGitlabToken(parsed.host);
		const encodedPath = encodeURIComponent(path);
		try {
			const res = await glFetch(
				parsed.host,
				`/projects/${projectPath(parsed)}/repository/files/${encodedPath}/raw?ref=${encodeURIComponent(ref)}`,
				token,
				signal
			);
			const buf = Buffer.from(await res.arrayBuffer());
			if (buf.length > 5 * 1024 * 1024) return null;
			return { content: buf, size: buf.length };
		} catch (e) {
			const status = (e as { status?: number }).status;
			if (status === 404) return null;
			throw e;
		}
	}
};
