import { describe, expect, it } from 'vitest';
import type { StructuralDiff, StructuralFile } from '$lib/shared/mr/structuralDiff';
import {
	fileInScope,
	fileMatchesQuery,
	filesForView,
	lineIdsForView,
	setFileLinesReviewed,
	synchronizeViewedPaths
} from './structuralView';

function file(
	path: string,
	counts: StructuralFile['counts'],
	options: { pureRename?: boolean; text?: string } = {}
): StructuralFile {
	const category = Object.entries(counts).find(([, count]) => count > 0)?.[0] as
		| keyof StructuralFile['counts']
		| undefined;
	return {
		id: path,
		path,
		status: options.pureRename ? 'R' : 'M',
		file: {
			oldPath: path,
			newPath: path,
			newFile: false,
			deletedFile: false,
			renamedFile: options.pureRename ?? false,
			generatedFile: false,
			tooLarge: false,
			collapsed: false,
			aMode: '100644',
			bMode: '100644',
			diff: '',
			added: 0,
			removed: 0
		},
		hunks: category
			? [{
					id: `${path}-hunk`,
					header: '@@ -1 +1 @@',
					lines: [{
						id: `${path}-line`,
						kind: 'addition',
						oldNumber: null,
						newNumber: 1,
						text: options.text ?? '',
						category
					}]
				}]
			: [],
		counts,
		changedLines: Object.values(counts).reduce((sum, count) => sum + count, 0),
		isPureRename: options.pureRename ?? false
	};
}

const zeroCounts = { behavior: 0, mechanical: 0, new: 0, deleted: 0 };

describe('structural view helpers', () => {
	it('keeps pure renames in full and mechanical scopes only', () => {
		const renamed = file('src/NewName.ts', zeroCounts, { pureRename: true });

		expect(fileInScope(renamed, 'full')).toBe(true);
		expect(fileInScope(renamed, 'mechanical')).toBe(true);
		expect(fileInScope(renamed, 'behavior')).toBe(false);
	});

	it('searches full paths and source text case-insensitively', () => {
		const candidate = file(
			'src/recovery/AdmissionGate.ts',
			{ ...zeroCounts, behavior: 1 },
			{ text: 'observeDisconnect();' }
		);

		expect(fileMatchesQuery(candidate, 'ADMISSION')).toBe(true);
		expect(fileMatchesQuery(candidate, 'disconnect')).toBe(true);
		expect(fileMatchesQuery(candidate, 'unrelated')).toBe(false);
	});

	it('returns only line ids visible in the selected scope and query', () => {
		const behavior = file('src/behavior.ts', { ...zeroCounts, behavior: 1 });
		const mechanical = file('src/mechanical.ts', { ...zeroCounts, mechanical: 1 });
		const diff: StructuralDiff = {
			files: [behavior, mechanical],
			counts: { behavior: 1, mechanical: 1, new: 0, deleted: 0 },
			total: 2
		};

		expect(filesForView(diff, 'behavior', '')).toEqual([behavior]);
		expect(lineIdsForView(diff, 'mechanical', 'mechanical')).toEqual([
			'src/mechanical.ts-line'
		]);
	});

	it('keeps file and line review progress in one state', () => {
		const candidate = file('src/recovery.ts', { ...zeroCounts, behavior: 1 });
		const diff: StructuralDiff = {
			files: [candidate],
			counts: { behavior: 1, mechanical: 0, new: 0, deleted: 0 },
			total: 1
		};

		const reviewed = setFileLinesReviewed(new Set(), candidate, true);
		const viewed = synchronizeViewedPaths(diff, reviewed, new Set());

		expect(reviewed).toEqual(new Set(['src/recovery.ts-line']));
		expect(viewed).toEqual(new Set(['src/recovery.ts']));

		const unreviewed = setFileLinesReviewed(reviewed, candidate, false);
		expect(synchronizeViewedPaths(diff, unreviewed, viewed)).toEqual(new Set());
	});
});