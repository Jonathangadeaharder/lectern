import type { Chunk, Hunk } from './types';
import { createHash } from 'node:crypto';

const TEST_FILE_RE = /(__tests?__|\.test\.|\.spec\.|tests?\/|_test\.\w+$|test_[\w-]+\.\w+$)/i;

export function isTestFile(path: string): boolean {
	return TEST_FILE_RE.test(path);
}

export function stripTestSuffix(path: string): string {
	return path
		.replace(/\.(test|spec)\.([tj]sx?|py|rb|go|rs)$/, '.$2')
		.replace(/\/__tests?__\//, '/')
		.replace(/^test_/, '')
		.replace(/_test(\.\w+)$/, '$1');
}

function chunkId(hunkIds: string[]): string {
	return createHash('sha1').update(hunkIds.join('|')).digest('hex').slice(0, 12);
}

export function estimateMinutes(group: Hunk[]): number {
	const added = group.reduce((s, h) => s + h.addedLines, 0);
	const removed = group.reduce((s, h) => s + h.removedLines, 0);
	const files = new Set(group.map((h) => h.file)).size;
	return 0.5 + added * 0.05 + removed * 0.02 + files * 0.5;
}

interface GroupedFile {
	file: string;
	hunks: Hunk[];
	isTest: boolean;
}

/**
 * v1.0 chunking: per-file grouping + simple test↔impl pairing.
 * No tree-sitter, no reference graph.
 */
export function groupHunksToChunks(hunks: Hunk[]): Chunk[] {
	if (hunks.length === 0) return [];

	const byFile = new Map<string, Hunk[]>();
	for (const h of hunks) {
		const list = byFile.get(h.file) ?? [];
		list.push(h);
		byFile.set(h.file, list);
	}

	const fileGroups: GroupedFile[] = [];
	for (const [file, list] of byFile) {
		fileGroups.push({ file, hunks: list, isTest: isTestFile(file) });
	}

	// Pair test files with their impl counterpart (if present).
	const merged: { files: string[]; hunks: Hunk[] }[] = [];
	const consumed = new Set<string>();

	for (const fg of fileGroups) {
		if (consumed.has(fg.file)) continue;
		if (!fg.isTest) {
			const stripped = stripTestSuffix(fg.file);
			const partner = fileGroups.find(
				(o) =>
					!consumed.has(o.file) &&
					o.isTest &&
					stripTestSuffix(o.file) === stripped &&
					o.file !== fg.file
			);
			if (partner) {
				merged.push({ files: [fg.file, partner.file], hunks: [...fg.hunks, ...partner.hunks] });
				consumed.add(fg.file);
				consumed.add(partner.file);
				continue;
			}
		}
		// non-paired
	}
	for (const fg of fileGroups) {
		if (!consumed.has(fg.file)) {
			merged.push({ files: [fg.file], hunks: fg.hunks });
		}
	}

	// Sizing pass: split groups whose estimate exceeds 15min, merge any <3min adjacent same-file.
	const sized: { files: string[]; hunks: Hunk[] }[] = [];
	for (const g of merged) {
		const minutes = estimateMinutes(g.hunks);
		if (minutes <= 15) {
			sized.push(g);
			continue;
		}
		// Split at hunk boundaries, accumulating until we hit ~10min.
		let cur: Hunk[] = [];
		for (const h of g.hunks) {
			cur.push(h);
			if (estimateMinutes(cur) >= 10) {
				sized.push({ files: g.files, hunks: cur });
				cur = [];
			}
		}
		if (cur.length > 0) sized.push({ files: g.files, hunks: cur });
	}

	// Merge tiny adjacent same-file groups (<3min).
	const compacted: { files: string[]; hunks: Hunk[] }[] = [];
	for (const g of sized) {
		const last = compacted[compacted.length - 1];
		if (
			last &&
			estimateMinutes(g.hunks) < 3 &&
			estimateMinutes(last.hunks) < 8 &&
			g.files.every((f) => last.files.includes(f))
		) {
			last.hunks.push(...g.hunks);
		} else {
			compacted.push(g);
		}
	}

	const chunks: Chunk[] = compacted.map((g, idx) => {
		const hunkIds = g.hunks.map((h) => h.id);
		const isTestChunk = g.files.every(isTestFile);
		return {
			id: chunkId(hunkIds),
			index: idx,
			title: '', // filled by LLM titles step
			rationale: '',
			hunks: g.hunks,
			estimatedMinutes: Math.round(estimateMinutes(g.hunks) * 10) / 10,
			primaryFiles: [...new Set(g.files)],
			tags: isTestChunk ? ['test'] : ['impl']
		};
	});

	return chunks;
}
