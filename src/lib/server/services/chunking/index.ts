import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { chunkSets } from '../../db/schema';
import { getBundlePath } from '../ingestion';
import { readBundleDiff, readBundleManifest } from '../ingestion/bundle';
import { parsePatchToHunks } from './diff';
import { groupHunksToChunks } from './group';
import { generateChunkTitles } from './titles';
import type { Chunk } from './types';

export async function chunkBundle(
	bundleId: string,
	opts: { force?: boolean; signal?: AbortSignal } = {}
): Promise<Chunk[]> {
	const filePath = await getBundlePath(bundleId);
	if (!filePath) throw new Error(`bundle not found: ${bundleId}`);

	const manifest = await readBundleManifest(filePath);
	if (!manifest) throw new Error(`bundle manifest unreadable: ${bundleId}`);

	const db = getDb();
	if (!opts.force) {
		const cached = db
			.select()
			.from(chunkSets)
			.where(and(eq(chunkSets.bundleId, bundleId), eq(chunkSets.headSha, manifest.headSha)))
			.get();
		if (cached) return JSON.parse(cached.chunksJson) as Chunk[];
	}

	const diff = await readBundleDiff(filePath);
	if (!diff) return [];

	const hunks = parsePatchToHunks(diff);
	const chunks = groupHunksToChunks(hunks);
	const titled = await generateChunkTitles(chunks, opts.signal);

	const json = JSON.stringify(titled);
	db.insert(chunkSets)
		.values({
			bundleId,
			headSha: manifest.headSha,
			chunksJson: json,
			generatedAt: Date.now()
		})
		.onConflictDoUpdate({
			target: [chunkSets.bundleId, chunkSets.headSha],
			set: { chunksJson: json, generatedAt: Date.now() }
		})
		.run();

	return titled;
}

export type { Chunk } from './types';
