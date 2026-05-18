export interface ChunkSummary {
	score: number;
	answered: number;
	total: number;
}

export function totalsAcrossChunks(chunks: ReadonlyArray<ChunkSummary>): {
	answered: number;
	total: number;
	approxPassed: number;
} {
	const answered = chunks.reduce((s, c) => s + c.answered, 0);
	const total = chunks.reduce((s, c) => s + c.total, 0);
	const approxPassed = Math.round(chunks.reduce((s, c) => s + c.score * c.answered, 0));
	return { answered, total, approxPassed };
}

export function bandFor(score: number): 'high' | 'medium' | 'low' {
	if (score >= 80) return 'high';
	if (score >= 50) return 'medium';
	return 'low';
}
