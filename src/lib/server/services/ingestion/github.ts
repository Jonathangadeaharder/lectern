import { Octokit } from '@octokit/rest';
import { getKey } from '../secrets/keychain';
import type { PlatformClient, PrCommit, PrMetadata } from './types';
import type { ParsedPrUrl } from './url';

let cachedToken: string | null = null;
let octokit: Octokit | null = null;

async function getOctokit(): Promise<{ gh: Octokit; tokenPresent: boolean }> {
	const token = await getKey('github');
	if (!octokit || token !== cachedToken) {
		cachedToken = token;
		octokit = new Octokit({
			auth: token ?? undefined,
			userAgent: 'lectern/0.1.0',
			request: { fetch: globalThis.fetch }
		});
	}
	return { gh: octokit, tokenPresent: Boolean(token) };
}

function tagAuthError(e: unknown, tokenPresent: boolean): unknown {
	const status = (e as { status?: number }).status;
	if (status === 401 || status === 403) {
		(e as { tokenPresent?: boolean }).tokenPresent = tokenPresent;
	}
	return e;
}

export const githubClient: PlatformClient = {
	async fetchMetadata(parsed, signal) {
		const { gh, tokenPresent } = await getOctokit();
		const { data } = await gh.rest.pulls
			.get({
				owner: parsed.owner,
				repo: parsed.repo,
				pull_number: parsed.prNumber,
				request: { signal }
			})
			.catch((e) => {
				throw tagAuthError(e, tokenPresent);
			});
		const state: PrMetadata['state'] = data.draft
			? 'draft'
			: data.merged
				? 'merged'
				: (data.state as 'open' | 'closed');
		return {
			title: data.title,
			body: data.body ?? '',
			author: data.user?.login ?? 'unknown',
			state,
			headSha: data.head.sha,
			baseSha: data.base.sha,
			headRef: data.head.ref,
			baseRef: data.base.ref,
			createdAt: data.created_at,
			updatedAt: data.updated_at
		};
	},

	async fetchDiff(parsed, signal) {
		const { gh, tokenPresent } = await getOctokit();
		const res = await gh
			.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
				owner: parsed.owner,
				repo: parsed.repo,
				pull_number: parsed.prNumber,
				mediaType: { format: 'diff' },
				request: { signal }
			})
			.catch((e) => {
				throw tagAuthError(e, tokenPresent);
			});
		return res.data as unknown as string;
	},

	async fetchCommits(parsed, signal) {
		const { gh } = await getOctokit();
		const commits: PrCommit[] = [];
		const iterator = gh.paginate.iterator(gh.rest.pulls.listCommits, {
			owner: parsed.owner,
			repo: parsed.repo,
			pull_number: parsed.prNumber,
			per_page: 100,
			request: { signal }
		});
		for await (const page of iterator) {
			for (const c of page.data) {
				commits.push({
					sha: c.sha,
					message: c.commit.message,
					author: c.commit.author?.name ?? c.author?.login ?? 'unknown',
					date: c.commit.author?.date ?? ''
				});
			}
		}
		return commits;
	},

	async fetchFile(parsed, path, ref, signal) {
		const { gh, tokenPresent } = await getOctokit();
		try {
			const res = await gh.rest.repos.getContent({
				owner: parsed.owner,
				repo: parsed.repo,
				path,
				ref,
				request: { signal }
			});
			const data = res.data;
			if (Array.isArray(data) || data.type !== 'file') return null;
			if (typeof data.size === 'number' && data.size > 5 * 1024 * 1024) return null;
			const content = Buffer.from(data.content, data.encoding as BufferEncoding);
			return { content, size: data.size ?? content.length };
		} catch (e) {
			const status = (e as { status?: number }).status;
			if (status === 404) return null;
			throw tagAuthError(e, tokenPresent);
		}
	}
};
