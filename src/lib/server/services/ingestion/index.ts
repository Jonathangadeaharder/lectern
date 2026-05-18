import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import parseDiff from 'parse-diff';
import { getDb } from '../../db';
import { bundles } from '../../db/schema';
import { isBinary } from './binary';
import { bundlePath as bundleFilePath, writeBundle } from './bundle';
import { githubClient } from './github';
import type { BundleFileEntry, BundleManifest, IngestProgressEvent, PlatformClient } from './types';
import { type ParsedPrUrl, parsePrUrl, repoSlug } from './url';

export class IngestionAuthError extends Error {
	constructor(public readonly platform: 'github' | 'gitlab') {
		super(`Authentication required for ${platform}.`);
		this.name = 'IngestionAuthError';
	}
}

export interface IngestOptions {
	signal?: AbortSignal;
	onProgress?: (e: IngestProgressEvent) => void;
}

function clientFor(platform: 'github' | 'gitlab'): PlatformClient {
	if (platform === 'github') return githubClient;
	throw new Error('gitlab.com client deferred to v1.1');
}

export async function ingestFromUrl(
	url: string,
	opts: IngestOptions = {}
): Promise<{ id: string; filePath: string; sizeBytes: number }> {
	const parsed = parsePrUrl(url);
	const client = clientFor(parsed.platform);
	const emit = opts.onProgress ?? (() => undefined);

	try {
		emit({ step: 'metadata' });
		const meta = await client.fetchMetadata(parsed, opts.signal);

		emit({ step: 'diff' });
		const diff = await client.fetchDiff(parsed, opts.signal);

		emit({ step: 'commits' });
		const commits = await client.fetchCommits(parsed, opts.signal);

		const filesInDiff = parseDiff(diff);
		const totalFiles = filesInDiff.length * 2; // base + head per file
		let filesDone = 0;

		const fileEntries: BundleFileEntry[] = [];
		const fileContents: Array<{ side: 'base' | 'head'; path: string; content: Buffer }> = [];

		emit({ step: 'files', filesDone: 0, filesTotal: totalFiles });

		for (const f of filesInDiff) {
			const path = f.to ?? f.from;
			if (!path || path === '/dev/null') continue;

			const baseRef = meta.baseSha;
			const headRef = meta.headSha;

			const baseFile =
				f.from && f.from !== '/dev/null'
					? await client.fetchFile(parsed, f.from, baseRef, opts.signal)
					: null;
			filesDone += 1;
			emit({ step: 'files', filesDone, filesTotal: totalFiles });

			const headFile =
				f.to && f.to !== '/dev/null'
					? await client.fetchFile(parsed, f.to, headRef, opts.signal)
					: null;
			filesDone += 1;
			emit({ step: 'files', filesDone, filesTotal: totalFiles });

			const baseBinary = baseFile ? isBinary(baseFile.content) : false;
			const headBinary = headFile ? isBinary(headFile.content) : false;
			const binary = baseBinary || headBinary;

			fileEntries.push({
				path,
				baseSize: baseFile?.size ?? 0,
				headSize: headFile?.size ?? 0,
				binary,
				renamed: f.from && f.to && f.from !== f.to ? { from: f.from } : undefined
			});

			if (!binary) {
				if (baseFile && f.from && f.from !== '/dev/null') {
					fileContents.push({ side: 'base', path: f.from, content: baseFile.content });
				}
				if (headFile && f.to && f.to !== '/dev/null') {
					fileContents.push({ side: 'head', path: f.to, content: headFile.content });
				}
			}
		}

		emit({ step: 'packaging' });

		const manifest: BundleManifest = {
			formatVersion: '1',
			source: {
				url,
				platform: parsed.platform,
				host: parsed.host,
				owner: parsed.owner,
				repo: parsed.repo,
				prNumber: parsed.prNumber,
				fetchedAt: Date.now()
			},
			headSha: meta.headSha,
			baseSha: meta.baseSha,
			files: fileEntries
		};

		const written = await writeBundle({
			parsed,
			manifest,
			metadataJson: JSON.stringify(meta, null, 2),
			commitsJson: JSON.stringify(commits, null, 2),
			diffPatch: diff,
			files: fileContents
		});

		const id = randomUUID();
		const db = getDb();

		// Drop any existing row for the same (repo, prNumber) — v1.0 keeps just latest.
		const existing = db
			.select()
			.from(bundles)
			.where(eq(bundles.repoSlug, repoSlug(parsed)))
			.all()
			.filter((row) => row.prNumber === parsed.prNumber);
		for (const e of existing) {
			db.delete(bundles).where(eq(bundles.id, e.id)).run();
		}

		db.insert(bundles)
			.values({
				id,
				repoSlug: repoSlug(parsed),
				prNumber: parsed.prNumber,
				sourceUrl: url,
				filePath: written.filePath,
				formatVersion: '1',
				fetchedAt: manifest.source.fetchedAt,
				sizeBytes: written.sizeBytes,
				headSha: meta.headSha,
				baseSha: meta.baseSha
			})
			.run();

		emit({ step: 'done', bundleId: id });
		return { id, filePath: written.filePath, sizeBytes: written.sizeBytes };
	} catch (e) {
		const status = (e as { status?: number }).status;
		if (status === 401 || status === 403) {
			emit({ step: 'error', kind: 'auth', message: 'Authentication required.' });
			throw new IngestionAuthError(parsed.platform);
		}
		emit({
			step: 'error',
			kind: 'unknown',
			message: e instanceof Error ? e.message : String(e)
		});
		throw e;
	}
}

export async function getBundlePath(bundleId: string): Promise<string | null> {
	const db = getDb();
	const row = db.select().from(bundles).where(eq(bundles.id, bundleId)).get();
	return row?.filePath ?? null;
}

export { parsePrUrl, repoSlug } from './url';
export { bundleFilePath };
