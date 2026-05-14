export function intensity(count: number, maxCount: number): 0 | 1 | 2 | 3 | 4 {
	if (count <= 0 || maxCount <= 0) return 0;
	const ratio = count / maxCount;
	if (ratio < 0.25) return 1;
	if (ratio < 0.5) return 2;
	if (ratio < 0.75) return 3;
	return 4;
}

export function scorePercent(score: number | null | undefined): string {
	if (score === null || score === undefined) return '\u2014';
	return `${Math.round(score * 100)}%`;
}

export function averageScore(rows: ReadonlyArray<{ avgScore: number | null }>): number | null {
	const scored = rows.filter((r) => r.avgScore !== null);
	if (scored.length === 0) return null;
	const sum = scored.reduce((s, r) => s + (r.avgScore ?? 0), 0);
	return sum / scored.length;
}
