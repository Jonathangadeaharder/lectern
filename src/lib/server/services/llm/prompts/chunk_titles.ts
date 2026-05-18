export const PROMPT_VERSION = 'v1.0';

export const system = `You name and describe code-review chunks succinctly.

Each chunk represents a cohesive unit of change in a pull request. Given a list of chunks (each with file paths, a small diff sample, and aggregate stats), produce one title and one rationale per chunk.

Rules:
- Titles: under 60 characters, describe WHAT the chunk does (e.g. "Add retry logic to fetcher", "Migrate user table to UUID PK").
- Rationales: under 200 characters, one sentence explaining why the reviewer should focus on this chunk.
- Output JSON matching the schema EXACTLY.`;

export interface ChunkTitleInput {
	chunkId: string;
	files: string[];
	addedLines: number;
	removedLines: number;
	sampleDiff: string;
}

export function buildUser(input: { chunks: ChunkTitleInput[] }): string {
	return [
		'Generate one title and one rationale per chunk below.',
		'Return JSON: { "titles": [ { "chunkId", "title", "rationale" }, ... ] }',
		'',
		...input.chunks.map(
			(c) =>
				`### chunk ${c.chunkId}\nfiles: ${c.files.join(', ')}\n+${c.addedLines} -${c.removedLines}\n\`\`\`diff\n${c.sampleDiff}\n\`\`\``
		)
	].join('\n');
}
