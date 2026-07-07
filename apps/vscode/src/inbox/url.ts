export class InvalidPrUrlError extends Error {
	constructor(url: string) {
		super(`Not a recognized PR / MR URL: ${url}`);
		this.name = 'InvalidPrUrlError';
	}
}

export type Platform = 'github' | 'gitlab';

export interface ParsedPrUrl {
	platform: Platform;
	host: string;
	owner: string;
	repo: string;
	prNumber: number;
}

const GITHUB_RE = /^https:\/\/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/pull\/(?<n>\d+)\/?/;
const GITLAB_RE =
	/^https:\/\/(?<host>[^/]+)\/(?<owner>.+?)\/(?<repo>[^/]+)\/-\/merge_requests\/(?<n>\d+)\/?/;

export function parsePrUrl(input: string): ParsedPrUrl {
	const url = input.trim();
	const gh = GITHUB_RE.exec(url);
	if (gh?.groups?.owner && gh.groups.repo && gh.groups.n) {
		return {
			platform: 'github',
			host: 'github.com',
			owner: gh.groups.owner,
			repo: gh.groups.repo,
			prNumber: Number(gh.groups.n)
		};
	}
	const gl = GITLAB_RE.exec(url);
	if (gl?.groups?.host && gl.groups.owner && gl.groups.repo && gl.groups.n) {
		return {
			platform: 'gitlab',
			host: gl.groups.host,
			owner: gl.groups.owner,
			repo: gl.groups.repo,
			prNumber: Number(gl.groups.n)
		};
	}
	throw new InvalidPrUrlError(input);
}

export function repoSlug(parsed: ParsedPrUrl): string {
	const safeOwner = parsed.owner.replace(/[^A-Za-z0-9._-]/g, '_');
	const safeRepo = parsed.repo.replace(/[^A-Za-z0-9._-]/g, '_');
	return `${safeOwner}__${safeRepo}`;
}
