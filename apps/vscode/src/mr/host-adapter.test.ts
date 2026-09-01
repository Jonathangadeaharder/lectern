/**
 * Extension-host loader test. Runs under vitest, not the VS Code test host,
 * so we mock the vscode module to a bare stub. The point is to prove the
 * adapter path from disk to MrBundle survives the extension's compile chain.
 */

import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';

import { loadBundleForHost } from './host-adapter';

const WORKSPACE = process.cwd().endsWith('vscode')
	? resolve(process.cwd(), '..', '..')
	: process.cwd();

describe('host-adapter loadBundleForHost', () => {
	it('loads mr-6635 from disk and adapts it end-to-end', async () => {
		const bundle = await loadBundleForHost({
			kind: 'fixture',
			slug: 'mr-6635',
			workspaceRoot: WORKSPACE
		});
		expect(bundle.summary.iid).toBe(6635);
		expect(bundle.files.length).toBe(85);
		expect(bundle.threads.length).toBe(88);
	});

	it('rejects unknown fixture slug', async () => {
		await expect(
			loadBundleForHost({
				kind: 'fixture',
				slug: 'nope',
				workspaceRoot: WORKSPACE
			})
		).rejects.toThrow();
	});
});
