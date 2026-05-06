import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all dependencies
vi.mock('../../db', () => ({
	getDb: vi.fn().mockReturnValue({
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					all: vi.fn().mockReturnValue([]),
					get: vi.fn().mockReturnValue(null)
				})
			})
		}),
		insert: vi.fn().mockReturnValue({
			values: vi.fn().mockReturnValue({
				run: vi.fn()
			})
		}),
		delete: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				run: vi.fn()
			})
		})
	})
}));

vi.mock('./bundle', () => ({
	writeBundle: vi.fn().mockResolvedValue({ filePath: '/tmp/bundle.lectern', sizeBytes: 1024 }),
	bundlePath: vi.fn().mockResolvedValue('/tmp/bundle.lectern')
}));

vi.mock('./github', () => ({
	githubClient: {
		fetchMetadata: vi.fn().mockResolvedValue({
			title: 'Test PR',
			body: 'Test body',
			author: 'testuser',
			state: 'open',
			headSha: 'abc123',
			baseSha: 'def456',
			headRef: 'feature',
			baseRef: 'main',
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-02T00:00:00Z'
		}),
		fetchDiff: vi
			.fn()
			.mockResolvedValue(
				'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1,2 @@\n foo\n+bar\n'
			),
		fetchCommits: vi
			.fn()
			.mockResolvedValue([
				{ sha: 'abc123', message: 'feat: add bar', author: 'testuser', date: '2024-01-01' }
			]),
		fetchFile: vi.fn().mockResolvedValue({ content: Buffer.from('file content'), size: 12 })
	}
}));

vi.mock('./binary', () => ({
	isBinary: vi.fn().mockReturnValue(false)
}));

vi.mock('parse-diff', () => ({
	default: vi.fn().mockReturnValue([
		{
			from: 'a.ts',
			to: 'a.ts',
			chunks: [
				{
					oldStart: 1,
					oldLines: 1,
					newStart: 1,
					newLines: 2,
					changes: [
						{ type: 'normal', content: ' foo', ln: 1 },
						{ type: 'add', content: '+bar', ln: 2 }
					]
				}
			],
			deletions: 0,
			additions: 1
		}
	])
}));

import { IngestionAuthError, ingestFromUrl } from './index';

describe('ingestFromUrl', () => {
	it('is a function', () => {
		expect(typeof ingestFromUrl).toBe('function');
	});

	it('IngestionAuthError is a class', () => {
		expect(IngestionAuthError.prototype).toBeInstanceOf(Error);
	});

	it('IngestionAuthError contains platform info', () => {
		const err = new IngestionAuthError('github');
		expect(err.platform).toBe('github');
		expect(err.message).toContain('github');
		expect(err.name).toBe('IngestionAuthError');
	});
});
