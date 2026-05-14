import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bundlesDir = mkdtempSync(join('/tmp', 'lectern-bundle-'));

vi.mock('../../config/paths', () => ({
	resolveDataDir: () => ({ bundles: bundlesDir })
}));

import { readBundleEntry, writeBundle } from './bundle';

afterEach(() => {
	rmSync(bundlesDir, { recursive: true, force: true });
});

describe('writeBundle + readBundleEntry', () => {
	it('writes bundle and reads entries back with sanitized file paths', async () => {
		const parsed = {
			platform: 'github' as const,
			host: 'github.com',
			owner: 'test-owner',
			repo: 'test-repo',
			prNumber: 1
		};
		const manifest = {
			formatVersion: '1' as const,
			source: {
				url: 'https://github.com/test-owner/test-repo/pull/1',
				platform: 'github' as const,
				host: 'github.com',
				owner: 'test-owner',
				repo: 'test-repo',
				prNumber: 1,
				fetchedAt: Date.now()
			},
			headSha: 'abc123',
			baseSha: 'def456',
			files: [
				{
					path: 'src/index.ts',
					baseSize: 0,
					headSize: 7,
					binary: false
				}
			]
		};
		const input = {
			parsed,
			manifest,
			metadataJson: JSON.stringify({ title: 'Test' }),
			commitsJson: JSON.stringify([{ sha: 'c1', message: 'init' }]),
			diffPatch: 'diff --git a/a.ts b/a.ts\n',
			files: [
				{
					side: 'head' as const,
					path: 'src/./utils/../index.ts',
					content: Buffer.from('content')
				}
			]
		};
		const result = await writeBundle(input);
		expect(result.filePath).toBeDefined();
		expect(result.sizeBytes).toBeGreaterThan(0);

		const manifestBuf = await readBundleEntry(result.filePath, 'manifest.json');
		expect(manifestBuf).not.toBeNull();
		const parsedManifest = JSON.parse(manifestBuf?.toString('utf8') ?? '');
		expect(parsedManifest.files[0].path).toBe('src/index.ts');

		const fileBuf = await readBundleEntry(result.filePath, 'files/head/src/index.ts');
		expect(fileBuf).not.toBeNull();
		expect(fileBuf?.toString('utf8')).toBe('content');
	});
});
