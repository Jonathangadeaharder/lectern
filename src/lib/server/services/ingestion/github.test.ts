import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../secrets/keychain', () => ({
	getKey: vi.fn().mockResolvedValue('fake-token')
}));

vi.mock('@octokit/rest', () => {
	const mockGet = vi.fn();
	const mockListCommits = vi.fn();
	const mockGetContent = vi.fn();
	const mockRequest = vi.fn();

	return {
		Octokit: vi.fn().mockImplementation(() => ({
			rest: {
				pulls: {
					get: mockGet,
					listCommits: { iterator: mockListCommits }
				},
				repos: {
					getContent: mockGetContent
				}
			},
			request: mockRequest,
			paginate: {
				iterator: mockListCommits
			}
		}))
	};
});

// We test the module's shape and error handling rather than full Octokit integration.
// Full integration tests would require a real GitHub token.

import { githubClient } from './github';
import type { ParsedPrUrl } from './url';

const parsed: ParsedPrUrl = {
	platform: 'github',
	host: 'github.com',
	owner: 'test-owner',
	repo: 'test-repo',
	prNumber: 1
};

describe('githubClient', () => {
	it('exports a PlatformClient with expected methods', () => {
		expect(typeof githubClient.fetchMetadata).toBe('function');
		expect(typeof githubClient.fetchDiff).toBe('function');
		expect(typeof githubClient.fetchCommits).toBe('function');
		expect(typeof githubClient.fetchFile).toBe('function');
	});

	it('fetchMetadata throws when Octokit is not configured', async () => {
		// Without a real token, the mock will throw
		await expect(githubClient.fetchMetadata(parsed)).rejects.toThrow();
	});

	it('fetchDiff throws when Octokit is not configured', async () => {
		await expect(githubClient.fetchDiff(parsed)).rejects.toThrow();
	});

	it('fetchCommits throws when Octokit is not configured', async () => {
		await expect(githubClient.fetchCommits(parsed)).rejects.toThrow();
	});

	it('fetchFile throws when Octokit is not configured', async () => {
		await expect(githubClient.fetchFile(parsed, 'src/index.ts', 'abc123')).rejects.toThrow();
	});
});
