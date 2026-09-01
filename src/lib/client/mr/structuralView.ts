import type {
	StructuralCategory,
	StructuralDiff,
	StructuralFile,
	StructuralHunk,
	StructuralLine
} from '$lib/shared/mr/structuralDiff';

export type StructuralScope = 'full' | StructuralCategory;

export const STRUCTURAL_SCOPES: Array<{ id: StructuralScope; label: string }> = [
	{ id: 'full', label: 'Full' },
	{ id: 'behavior', label: 'Behavior' },
	{ id: 'mechanical', label: 'Mechanical' },
	{ id: 'new', label: 'New' },
	{ id: 'deleted', label: 'Deleted' }
];

export function lineInScope(line: StructuralLine, scope: StructuralScope): boolean {
	return line.category !== null && (scope === 'full' || line.category === scope);
}

export function linesInScope(
	file: StructuralFile,
	scope: StructuralScope
): StructuralLine[] {
	return file.hunks.flatMap((hunk) => hunk.lines.filter((line) => lineInScope(line, scope)));
}

export function hunkLinesInScope(
	hunk: StructuralHunk,
	scope: StructuralScope
): StructuralLine[] {
	return hunk.lines.filter((line) => lineInScope(line, scope));
}

export function fileCountForScope(file: StructuralFile, scope: StructuralScope): number {
	return scope === 'full' ? file.changedLines : file.counts[scope];
}

export function fileInScope(file: StructuralFile, scope: StructuralScope): boolean {
	if (fileCountForScope(file, scope) > 0) return true;
	return file.isPureRename && (scope === 'full' || scope === 'mechanical');
}

export function fileMatchesQuery(file: StructuralFile, query: string): boolean {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return true;
	if (file.file.oldPath.toLowerCase().includes(normalized)) return true;
	if (file.file.newPath.toLowerCase().includes(normalized)) return true;
	return file.hunks.some((hunk) =>
		hunk.lines.some((line) => line.text.toLowerCase().includes(normalized))
	);
}

export function filesForView(
	diff: StructuralDiff,
	scope: StructuralScope,
	query: string
): StructuralFile[] {
	return diff.files.filter((file) => fileInScope(file, scope) && fileMatchesQuery(file, query));
}

export function lineIdsForView(
	diff: StructuralDiff,
	scope: StructuralScope,
	query: string
): string[] {
	return filesForView(diff, scope, query).flatMap((file) =>
		linesInScope(file, scope).map((line) => line.id)
	);
}

export function setFileLinesReviewed(
	reviewedLineIds: ReadonlySet<string>,
	file: StructuralFile,
	reviewed: boolean
): Set<string> {
	const next = new Set(reviewedLineIds);
	for (const line of linesInScope(file, 'full')) {
		if (reviewed) next.add(line.id);
		else next.delete(line.id);
	}
	return next;
}

export function synchronizeViewedPaths(
	diff: StructuralDiff,
	reviewedLineIds: ReadonlySet<string>,
	viewedPaths: ReadonlySet<string>
): Set<string> {
	const next = new Set(viewedPaths);
	for (const file of diff.files) {
		const lineIds = linesInScope(file, 'full').map((line) => line.id);
		if (lineIds.length === 0) continue;
		if (lineIds.every((lineId) => reviewedLineIds.has(lineId))) next.add(file.path);
		else next.delete(file.path);
	}
	return next;
}