import { classifyStructuralDiff } from './structuralDiff';
import type { MrFile, MrReviewState } from './types';

interface ReconcileOptions {
	migrateLegacyLineIds?: boolean;
}

/**
 * Rebuilds review state from paths alone, marking every changed line of those files reviewed.
 * Paths survive a push intact, unlike the positional line ids of a legacy bucket, so this is the
 * only part of a bucket recorded against a different head SHA that can be replayed safely.
 */
export function mrReviewStateFromViewedPaths(
	state: MrReviewState,
	files: MrFile[],
	viewedPaths: string[]
): MrReviewState {
	const wanted = new Set(viewedPaths);
	const diff = classifyStructuralDiff(files);
	const reviewedLineIds: string[] = [];

	for (const file of diff.files) {
		if (!wanted.has(file.path)) continue;
		for (const hunk of file.hunks) {
			for (const line of hunk.lines) {
				if (line.category !== null) reviewedLineIds.push(line.id);
			}
		}
	}

	return reconcileMrReviewState({ ...state, reviewedLineIds, viewedPaths: [] }, files);
}

export function reconcileMrReviewState(
	state: MrReviewState,
	files: MrFile[],
	options: ReconcileOptions = {}
): MrReviewState {
	const diff = classifyStructuralDiff(files);
	const saved = new Set(state.reviewedLineIds);
	const reviewedLineIds = new Set<string>();

	for (const [fileIndex, file] of diff.files.entries()) {
		for (const [hunkIndex, hunk] of file.hunks.entries()) {
			for (const [lineIndex, line] of hunk.lines.entries()) {
				if (line.category === null) continue;
				const legacyId = `file-${fileIndex}-hunk-${hunkIndex}-line-${lineIndex}`;
				if (saved.has(line.id) || (options.migrateLegacyLineIds && saved.has(legacyId))) {
					reviewedLineIds.add(line.id);
				}
			}
		}
	}

	const viewedPaths = diff.files
		.filter((file) => {
			const changed = file.hunks.flatMap((hunk) =>
				hunk.lines.filter((line) => line.category !== null)
			);
			return changed.length > 0 && changed.every((line) => reviewedLineIds.has(line.id));
		})
		.map((file) => file.path)
		.sort();

	return {
		...state,
		reviewedLineIds: [...reviewedLineIds].sort(),
		viewedPaths
	};
}