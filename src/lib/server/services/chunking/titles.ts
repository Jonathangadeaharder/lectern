import { runStructured } from '../llm';
import * as prompt from '../llm/prompts/chunk_titles';
import { ChunkTitleListSchema } from '../llm/schemas';
import type { Chunk } from './types';

const SAMPLE_DIFF_LIMIT = 1024;

export async function generateChunkTitles(chunks: Chunk[], signal?: AbortSignal): Promise<Chunk[]> {
	if (chunks.length === 0) return chunks;

	const input = {
		chunks: chunks.map((c) => ({
			chunkId: c.id,
			files: c.primaryFiles,
			addedLines: c.hunks.reduce((s, h) => s + h.addedLines, 0),
			removedLines: c.hunks.reduce((s, h) => s + h.removedLines, 0),
			sampleDiff: buildSampleDiff(c).slice(0, SAMPLE_DIFF_LIMIT)
		}))
	};

	const result = await runStructured({
		task: 'chunk_titles',
		schema: ChunkTitleListSchema,
		system: prompt.system,
		prompt: prompt.buildUser(input),
		signal
	});

	const byId = new Map(result.titles.map((t) => [t.chunkId, t]));
	return chunks.map((c) => {
		const t = byId.get(c.id);
		return t ? { ...c, title: t.title, rationale: t.rationale } : c;
	});
}

function buildSampleDiff(chunk: Chunk): string {
	const lines: string[] = [];
	for (const h of chunk.hunks) {
		lines.push(`--- ${h.file}`);
		lines.push(`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`);
		for (const l of h.lines.slice(0, 30)) {
			const sign = l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' ';
			lines.push(`${sign}${l.content}`);
		}
		if (h.lines.length > 30) lines.push('… (truncated)');
	}
	return lines.join('\n');
}
