import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPullsGet = vi.fn();
const mockListCommitsIterator = vi.fn();
const mockGetContent = vi.fn();
const mockRequest = vi.fn();

vi.mock('../secrets/keychain', () => ({
	getKey: vi.fn().mockResolvedValue('fake-token')
}));

vi.mock('@octokit/rest', () => ({
	Octokit: vi.fn().mockImplementation(() => ({
		rest: {
			pulls: { get: mockPullsGet },
			repos: { getContent: mockGetContent }
		},
		request: mockRequest,
		paginate: { iterator: mockListCommitsIterator }
	}))
}));

import { githubClient } from './github';
import type { ParsedPrUrl } from './url';

const parsed: ParsedPrUrl = {
	platform: 'github',
	host: 'github.com',
	owner: 'test-owner',
	repo: 'test-repo',
	prNumber: 1
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe('githubClient.fetchMetadata', () => {
	it('maps open PR state', async () => {
		mockPullsGet.mockResolvedValue({
			data: {
				title: 'My PR',
				body: 'desc',
				user: { login: 'alice' },
				state: 'open',
				draft: false,
				merged: false,
				head: { sha: 'abc', ref: 'feat' },
				base: { sha: 'def', ref: 'main' },
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-02T00:00:00Z'
			}
		});
		const meta = await githubClient.fetchMetadata(parsed);
		expect(meta.title).toBe('My PR');
		expect(meta.author).toBe('alice');
		expect(meta.state).toBe('open');
		expect(meta.headSha).toBe('abc');
		expect(meta.baseSha).toBe('def');
	});

	it('maps merged PR state', async () => {
		mockPullsGet.mockResolvedValue({
			data: {
				title: 'Merged',
				body: null,
				user: { login: 'bob' },
				state: 'closed',
				draft: false,
				merged: true,
				head: { sha: 'h1', ref: 'f' },
				base: { sha: 'b1', ref: 'm' },
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-02T00:00:00Z'
			}
		});
		const meta = await githubClient.fetchMetadata(parsed);
		expect(meta.state).toBe('merged');
		expect(meta.body).toBe('');
	});

	it('maps draft PR state', async () => {
		mockPullsGet.mockResolvedValue({
			data: {
				title: 'WIP',
				body: 'draft',
				user: { login: 'carol' },
				state: 'open',
				draft: true,
				merged: false,
				head: { sha: 'h2', ref: 'd' },
				base: { sha: 'b2', ref: 'm' },
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-02T00:00:00Z'
			}
		});
		const meta = await githubClient.fetchMetadata(parsed);
		expect(meta.state).toBe('draft');
	});

	it('falls back to unknown author when user is missing', async () => {
		mockPullsGet.mockResolvedValue({
			data: {
				title: 'No user',
				body: '',
				user: null,
				state: 'open',
				draft: false,
				merged: false,
				head: { sha: 'h', ref: 'r' },
				base: { sha: 'b', ref: 'r' },
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-02T00:00:00Z'
			}
		});
		const meta = await githubClient.fetchMetadata(parsed);
		expect(meta.author).toBe('unknown');
	});
});

describe('githubClient.fetchDiff', () => {
	it('returns raw diff string from request', async () => {
		const diffStr = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n';
		mockRequest.mockResolvedValue({ data: diffStr });
		const result = await githubClient.fetchDiff(parsed);
		expect(result).toBe(diffStr);
		expect(mockRequest).toHaveBeenCalledWith(
			'GET /repos/{owner}/{repo}/pulls/{pull_number}',
			expect.objectContaining({
				owner: 'test-owner',
				repo: 'test-repo',
				pull_number: 1,
				mediaType: { format: 'diff' }
			})
		);
	});
});

describe('githubClient.fetchCommits', () => {
	it('formats commit data from paginated iterator', async () => {
		const page1 = {
			data: [
				{
					sha: 'c1',
					commit: { message: 'feat: first', author: { name: 'A', date: '2024-01-01' } },
					author: { login: 'a-dev' }
				},
				{
					sha: 'c2',
					commit: { message: 'fix: second', author: { name: null, date: null } },
					author: null
				}
			]
		};
		mockListCommitsIterator.mockReturnValue({
			[Symbol.asyncIterator]() {
				let done = false;
				return {
					async next() {
						const wasDone = done;
						done = true;
						return wasDone ? { done: true, value: undefined } : { done: false, value: page1 };
					}
				};
			}
		});
		const commits = await githubClient.fetchCommits(parsed);
		expect(commits).toHaveLength(2);
		expect(commits[0]).toEqual({
			sha: 'c1',
			message: 'feat: first',
			author: 'A',
			date: '2024-01-01'
		});
		expect(commits[1]?.author).toBe('unknown');
		expect(commits[1]?.date).toBe('');
	});
});

describe('githubClient.fetchFile', () => {
	it('decodes base64 file content', async () => {
		const content = Buffer.from('hello').toString('base64');
		mockGetContent.mockResolvedValue({
			data: { type: 'file', content, encoding: 'base64', size: 5 }
		});
		const result = await githubClient.fetchFile(parsed, 'src/a.ts', 'abc');
		expect(result).not.toBeNull();
		expect(result?.content.toString()).toBe('hello');
		expect(result?.size).toBe(5);
	});

	it('returns null for 404', async () => {
		const err = new Error('Not Found');
		(err as { status?: number }).status = 404;
		mockGetContent.mockRejectedValue(err);
		const result = await githubClient.fetchFile(parsed, 'missing.ts', 'abc');
		expect(result).toBeNull();
	});

	it('returns null for directory entries', async () => {
		mockGetContent.mockResolvedValue({
			data: [{ type: 'dir', name: 'src' }]
		});
		const result = await githubClient.fetchFile(parsed, 'src', 'abc');
		expect(result).toBeNull();
	});

	it('returns null for files over 5MB', async () => {
		const content = Buffer.from('x').toString('base64');
		mockGetContent.mockResolvedValue({
			data: { type: 'file', content, encoding: 'base64', size: 6 * 1024 * 1024 }
		});
		const result = await githubClient.fetchFile(parsed, 'big.ts', 'abc');
		expect(result).toBeNull();
	});

	it('re-throws non-404 errors', async () => {
		const err = new Error('Server Error');
		(err as { status?: number }).status = 500;
		mockGetContent.mockRejectedValue(err);
		await expect(githubClient.fetchFile(parsed, 'a.ts', 'abc')).rejects.toThrow('Server Error');
	});
});
