/**
 * Integration test for the MR source loader. Reads the actual on-disk fixture
 * and exercises the same code path SvelteKit's server load uses.
 */

import { describe, expect, it } from 'vitest';

import { loadBundle } from './source';

describe('loadBundle (fixture source)', () => {
	it('loads mr-6635 from disk and adapts it end-to-end', async () => {
		const bundle = await loadBundle({ source: 'fixture', fixtureSlug: 'mr-6635' });
		expect(bundle.summary.iid).toBe(6635);
		expect(bundle.files.length).toBe(85);
		expect(bundle.threads.length).toBe(88);
		expect(bundle.versions.length).toBe(20);
		expect(bundle.pipelines.length).toBe(15);
	});

	it('rejects unknown fixture slug', async () => {
		await expect(
			loadBundle({ source: 'fixture', fixtureSlug: 'does-not-exist' })
		).rejects.toThrow();
	});

	it('rejects live gitlab source without required opts', async () => {
		await expect(loadBundle({ source: 'gitlab' })).rejects.toThrow(/projectPath/);
	});
});
