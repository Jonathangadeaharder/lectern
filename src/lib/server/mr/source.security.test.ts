/**
 * Adversarial tests for the fixture loader's path handling.
 * Confirms that a slug cannot escape tests/fixtures/mr/, and that a request
 * timeout / body-size cap fires on the live gitlab path.
 */

import { describe, expect, it, vi } from 'vitest';

import { loadBundle } from './source';

describe('loadBundle (fixture path traversal)', () => {
	it('rejects a slug with ..', async () => {
		await expect(loadBundle({ source: 'fixture', fixtureSlug: '../mr' })).rejects.toThrow(
			/invalid fixture slug/
		);
	});

	it('rejects a slug with slash', async () => {
		await expect(loadBundle({ source: 'fixture', fixtureSlug: 'mr/etc' })).rejects.toThrow(
			/invalid fixture slug/
		);
	});

	it('rejects a slug with backslash', async () => {
		await expect(loadBundle({ source: 'fixture', fixtureSlug: 'mr\\etc' })).rejects.toThrow(
			/invalid fixture slug/
		);
	});

	it('rejects the empty slug', async () => {
		await expect(loadBundle({ source: 'fixture', fixtureSlug: '' })).rejects.toThrow();
	});

	it('accepts a valid slug', async () => {
		const bundle = await loadBundle({ source: 'fixture', fixtureSlug: 'mr-6635' });
		expect(bundle.summary.iid).toBe(6635);
	});
});

describe('loadBundle (live gitlab caps)', () => {
	it('aborts on request timeout with a labeled error', async () => {
		const origFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async (_url, init) => {
			return new Promise<Response>((_resolve, reject) => {
				const signal = (init as { signal?: AbortSignal } | undefined)?.signal;
				signal?.addEventListener('abort', () => reject(new Error('aborted')));
			});
		}) as unknown as typeof fetch;
		try {
			await expect(
				loadBundle({
					source: 'gitlab',
					projectPath: 'a/b',
					iid: 1,
					host: 'example.invalid',
					token: 'stub'
				})
			).rejects.toThrow(/timed out after \d+ms on/);
		} finally {
			globalThis.fetch = origFetch;
		}
	}, 15_000);

	it('rejects when Content-Length exceeds the cap', async () => {
		const origFetch = globalThis.fetch;
		const bigCl = 100 * 1024 * 1024;
		globalThis.fetch = vi.fn(async () => {
			return new Response('{}', {
				status: 200,
				headers: { 'content-type': 'application/json', 'content-length': String(bigCl) }
			});
		}) as unknown as typeof fetch;
		try {
			await expect(
				loadBundle({
					source: 'gitlab',
					projectPath: 'a/b',
					iid: 1,
					host: 'example.invalid',
					token: 'stub'
				})
			).rejects.toThrow(/too large/);
		} finally {
			globalThis.fetch = origFetch;
		}
	});
});
