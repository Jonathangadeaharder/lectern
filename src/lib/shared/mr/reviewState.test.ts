import { describe, expect, it } from 'vitest';
import { classifyStructuralDiff } from './structuralDiff';
import { mrReviewStateFromViewedPaths, reconcileMrReviewState } from './reviewState';
import {
	defaultMrReviewState,
	legacyMrReviewStateKey,
	legacyMrReviewStatePrefix,
	mrReviewStateKey,
	type MrFile,
	type MrSummary
} from './types';

function summary(headSha: string): MrSummary {
	return {
		projectId: 42,
		iid: 6811,
		title: 'Review state',
		description: '',
		state: 'opened',
		draft: false,
		author: null,
		assignees: [],
		reviewers: [],
		sourceBranch: 'feature',
		targetBranch: 'main',
		diffRefs: { baseSha: 'base', headSha, startSha: 'start' },
		webUrl: '',
		createdAt: '',
		updatedAt: '',
		mergeStatus: '',
		hasConflicts: false,
		changesCount: '0',
		userNotesCount: 0,
		upvotes: 0,
		downvotes: 0,
		labels: []
	};
}

describe('MR review state', () => {
	it('starts with both sidebars open and no completed review work', () => {
		expect(defaultMrReviewState()).toEqual({
			reviewedLineIds: [],
			viewedPaths: [],
			isFileRailOpen: true,
			isThreadRailOpen: true
		});
	});

	it('shares persisted progress across heads of the same MR', () => {
		expect(mrReviewStateKey(summary('head-a'))).toBe(mrReviewStateKey(summary('head-b')));
	});

	it('keeps only exact changed lines that still belong to the refreshed diff', () => {
		const original = mrFile('src/recovery.ts', '@@ -1 +1 @@\n-oldCall();\n+newCall();');
		const originalLines = changedLines([original]);
		const refreshed = mrFile(
			'src/recovery.ts',
			'@@ -1,2 +1,2 @@\n-oldCall();\n-oldTail();\n+newCall();\n+newTail();'
		);

		const state = reconcileMrReviewState(
			{
				...defaultMrReviewState(),
				reviewedLineIds: originalLines.map((line) => line.id),
				viewedPaths: ['src/recovery.ts']
			},
			[refreshed]
		);

		expect(state.reviewedLineIds).toEqual(originalLines.map((line) => line.id).sort());
		expect(state.viewedPaths).toEqual([]);
	});

	it('drops a check when text changes at the same path and line', () => {
		const original = mrFile('src/recovery.ts', '@@ -1 +1 @@\n-oldCall();\n+newCall();');
		const reviewed = changedLines([original]).find((line) => line.kind === 'addition')!;
		const refreshed = mrFile('src/recovery.ts', '@@ -1 +1 @@\n-oldCall();\n+newerCall();');

		const state = reconcileMrReviewState(
			{ ...defaultMrReviewState(), reviewedLineIds: [reviewed.id] },
			[refreshed]
		);

		expect(state.reviewedLineIds).toEqual([]);
	});

	it('preserves exact lines when GitLab reorders files', () => {
		const original = mrFile('src/recovery.ts', '@@ -1 +1 @@\n-oldCall();\n+newCall();');
		const reviewedLineIds = changedLines([original]).map((line) => line.id);
		const inserted = mrFile('src/added.ts', '@@ -1 +1 @@\n-old\n+new');

		const state = reconcileMrReviewState(
			{ ...defaultMrReviewState(), reviewedLineIds, viewedPaths: ['src/recovery.ts'] },
			[inserted, original]
		);

		expect(state.reviewedLineIds).toEqual([...reviewedLineIds].sort());
		expect(state.viewedPaths).toEqual(['src/recovery.ts']);
	});

	it('matches every head a legacy bucket was written under', () => {
		const prefix = legacyMrReviewStatePrefix(summary('head-a'));

		expect(legacyMrReviewStateKey(summary('head-a')).startsWith(prefix)).toBe(true);
		expect(legacyMrReviewStateKey(summary('head-b')).startsWith(prefix)).toBe(true);
		expect(mrReviewStateKey(summary('head-a')).startsWith(prefix)).toBe(false);
	});

	it('marks a carried path fully reviewed against the diff it is replayed on', () => {
		const carried = mrFile(
			'src/recovery.ts',
			'@@ -1,2 +1,2 @@\n-oldCall();\n-oldTail();\n+newCall();\n+newTail();'
		);
		const untouched = mrFile('src/other.ts', '@@ -1 +1 @@\n-old\n+new');

		const state = mrReviewStateFromViewedPaths(
			defaultMrReviewState(),
			[carried, untouched],
			['src/recovery.ts']
		);

		const expected = changedLines([carried])
			.map((line) => line.id)
			.sort();
		expect(state.reviewedLineIds).toEqual(expected);
		expect(state.viewedPaths).toEqual(['src/recovery.ts']);
	});

	it('ignores a carried path that the current diff no longer changes', () => {
		const present = mrFile('src/recovery.ts', '@@ -1 +1 @@\n-old\n+new');

		const state = mrReviewStateFromViewedPaths(defaultMrReviewState(), [present], ['src/gone.ts']);

		expect(state.reviewedLineIds).toEqual([]);
		expect(state.viewedPaths).toEqual([]);
	});

	it('keeps sidebar preferences while replaying carried paths', () => {
		const file = mrFile('src/recovery.ts', '@@ -1 +1 @@\n-old\n+new');

		const state = mrReviewStateFromViewedPaths(
			{ ...defaultMrReviewState(), isFileRailOpen: false, isThreadRailOpen: false },
			[file],
			['src/recovery.ts']
		);

		expect(state.isFileRailOpen).toBe(false);
		expect(state.isThreadRailOpen).toBe(false);
	});
});

function mrFile(path: string, diff: string): MrFile {
	return {
		oldPath: path,
		newPath: path,
		newFile: false,
		deletedFile: false,
		renamedFile: false,
		generatedFile: false,
		tooLarge: false,
		collapsed: false,
		aMode: '100644',
		bMode: '100644',
		diff,
		added: 1,
		removed: 1
	};
}

function changedLines(files: MrFile[]) {
	return classifyStructuralDiff(files).files.flatMap((file) =>
		file.hunks.flatMap((hunk) => hunk.lines.filter((line) => line.category !== null))
	);
}