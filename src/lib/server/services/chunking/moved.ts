import type { Hunk, MovedFrom } from './types';

const SHINGLE_SIZE = 4;
const MIN_ADDED_LINES = 8;
const MIN_MATCH_RATIO = 0.6;

function normalize(s: string): string {
	return s.replace(/\s+/g, ' ').trim();
}

function shingles(lines: string[]): string[] {
	if (lines.length < SHINGLE_SIZE) return [];
	const out: string[] = [];
	for (let i = 0; i <= lines.length - SHINGLE_SIZE; i++) {
		out.push(lines.slice(i, i + SHINGLE_SIZE).map(normalize).join('\n'));
	}
	return out;
}

export interface CandidateFile {
	path: string;
	content: string;
}

/**
 * Detect contiguous additions copy-pasted from another file in the bundle —
 * or extracted from a different region of the same file's previous version.
 * For same-file candidates, the hunk's own old range is excluded so that
 * trivial in-place modifications don't false-positive.
 */
export function detectMovedFrom(hunk: Hunk, candidates: CandidateFile[]): MovedFrom | undefined {
	const added = hunk.lines.filter((l) => l.type === 'add').map((l) => l.content);
	if (added.length < MIN_ADDED_LINES) return undefined;

	const addedShingles = shingles(added);
	if (addedShingles.length === 0) return undefined;
	const addedSet = new Set(addedShingles);

	let best: MovedFrom | undefined;

	const deleted = hunk.lines.filter((l) => l.type === 'del').map((l) => l.content);
	const intraHunk: CandidateFile[] =
		deleted.length >= SHINGLE_SIZE
			? [{ path: hunk.file, content: deleted.join('\n') }]
			: [];

	for (const cand of [...intraHunk, ...candidates]) {
		const candLines = cand.content.split(/\r?\n/);
		const candShingles = shingles(candLines);
		if (candShingles.length === 0) continue;

		const matchedPositions: number[] = [];
		for (let i = 0; i < candShingles.length; i++) {
			if (addedSet.has(candShingles[i] as string)) matchedPositions.push(i);
		}
		if (matchedPositions.length === 0) continue;

		const ratio = new Set(matchedPositions.map((p) => candShingles[p])).size / addedSet.size;
		if (ratio < MIN_MATCH_RATIO) continue;

		const startLine = (matchedPositions[0] ?? 0) + 1;
		const endLine = (matchedPositions[matchedPositions.length - 1] ?? 0) + SHINGLE_SIZE;
		if (!best || ratio > best.matchRatio) {
			best = { file: cand.path, startLine, endLine, matchRatio: ratio };
		}
	}

	return best;
}

export function annotateMovedHunks(hunks: Hunk[], candidates: CandidateFile[]): void {
	for (const h of hunks) {
		const moved = detectMovedFrom(h, candidates);
		if (moved) h.movedFrom = moved;
	}
}
