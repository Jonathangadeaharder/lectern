import { eq } from 'drizzle-orm';
import parseDiff from 'parse-diff';
import { randomUUID } from 'node:crypto';
import { getDb } from '../../db';
import { bundles } from '../../db/schema';
import { isBinary } from './binary';
import { writeBundle, bundlePath as bundleFilePath } from './bundle';
import { githubClient } from './github';
import { gitlabClient } from './gitlab';
import type { BundleFileEntry, BundleManifest, IngestProgressEvent, PlatformClient } from './types';
import { parsePrUrl, repoSlug, type ParsedPrUrl } from './url';

export class IngestionAuthError extends Error {
	constructor(public readonly platform: 'github' | 'gitlab') {
		super(`Authentication required. Add a source token in Settings.`);
		this.name = 'IngestionAuthError';
	}
}

export interface IngestOptions {
	signal?: AbortSignal;
	onProgress?: (e: IngestProgressEvent) => void;
	force?: boolean;
}

function clientFor(platform: 'github' | 'gitlab'): PlatformClient {
	if (platform === 'github') return githubClient;
	if (platform === 'gitlab') return gitlabClient;
	throw new Error(`unsupported platform: ${platform}`);
}

export async function ingestFromUrl(url: string, opts: IngestOptions = {}): Promise<{ id: string; filePath: string; sizeBytes: number }> {
	const parsed = parsePrUrl(url);
	const client = clientFor(parsed.platform);
	const emit = opts.onProgress ?? (() => undefined);

	try {
		emit({ step: 'metadata' });
		const meta = await client.fetchMetadata(parsed, opts.signal);

		// Short-circuit: if a bundle for this exact head SHA already exists, reuse it.
		// Avoids re-fetching the diff and the FK-restricted delete below.
		const db = getDb();
		const slug = repoSlug(parsed);
		if (!opts.force) {
			const reusable = db
				.select()
				.from(bundles)
				.where(eq(bundles.repoSlug, slug))
				.all()
				.find((row) => row.prNumber === parsed.prNumber && row.headSha === meta.headSha);
			if (reusable) {
				emit({ step: 'done', bundleId: reusable.id });
				return { id: reusable.id, filePath: reusable.filePath, sizeBytes: reusable.sizeBytes };
			}
		}

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

			const baseFile = f.from && f.from !== '/dev/null'
				? await client.fetchFile(parsed, f.from, baseRef, opts.signal)
				: null;
			filesDone += 1;
			emit({ step: 'files', filesDone, filesTotal: totalFiles });

			const headFile = f.to && f.to !== '/dev/null'
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

		// Drop stale rows for the same (repo, prNumber). Sessions reference bundles
		// with ON DELETE restrict, so a delete may fail; keep the stale row in that
		// case — the new bundle supersedes it for fresh sessions.
		const existing = db
			.select()
			.from(bundles)
			.where(eq(bundles.repoSlug, slug))
			.all()
			.filter((row) => row.prNumber === parsed.prNumber);
		for (const e of existing) {
			try {
				db.delete(bundles).where(eq(bundles.id, e.id)).run();
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				if (!msg.includes('FOREIGN KEY')) throw err;
			}
		}

		db.insert(bundles)
			.values({
				id,
				repoSlug: slug,
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
			emit({ step: 'error', kind: 'auth', message: 'Authentication required. Add a source token in Settings.' });
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
