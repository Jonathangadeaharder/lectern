import { describe, expect, it } from 'vitest';
import type { MrFile } from '../../../src/lib/shared/mr/types';
import {
	advanceMutationQuiz,
	answerMutationQuizRound,
	buildMutationQuizDeck,
	defaultMutationQuizProgress,
	reconcileMutationQuizProgress
} from '../../../src/lib/shared/mutationQuiz';

function requiredItem<T>(items: T[], index: number): T {
	const item = items[index];
	if (!item) throw new Error(`Fixture item ${index} is missing.`);
	return item;
}

function file(path: string, diff: string, overrides: Partial<MrFile> = {}): MrFile {
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
		removed: 1,
		...overrides
	};
}

const operatorFile = file(
	'src/b.cpp',
	`@@ -10,2 +10,2 @@ void run()
-    return enabled;
+    return enabled == true;
 }
@@ -30,1 +30,1 @@ void tick()
-    count--;
+    count++;
`
);
const addOnlyFile = file(
	'src/a.cpp',
	`@@ -0,0 +1,2 @@
+++value;
+commit();
`,
	{ newFile: true, oldPath: 'src/a.cpp' }
);
const deleteOnlyFile = file(
	'src/c.cpp',
	`@@ -4,2 +4,0 @@
-obsolete();
-cleanup();
`,
	{ deletedFile: true, newPath: 'src/c.cpp' }
);

describe('buildMutationQuizDeck', () => {
	it('covers every textual hunk in stable path order', () => {
		const head = 'a'.repeat(40);
		const first = buildMutationQuizDeck([operatorFile, deleteOnlyFile, addOnlyFile], head);
		const second = buildMutationQuizDeck([addOnlyFile, operatorFile, deleteOnlyFile], head);

		expect(first).toEqual(second);
		expect(first.rounds).toHaveLength(4);
		expect(first.rounds.map((round) => round.path)).toEqual([
			'src/a.cpp',
			'src/b.cpp',
			'src/b.cpp',
			'src/c.cpp'
		]);
		expect(first.rounds.map((round) => round.fileRoundCount)).toEqual([1, 2, 2, 1]);
	});

	it('always presents one original and one deterministic mutant', () => {
		const deck = buildMutationQuizDeck([operatorFile, addOnlyFile, deleteOnlyFile], 'b'.repeat(40));
		for (const round of deck.rounds) {
			const original = round.candidates.find(
				(candidate) => candidate.id !== round.buggyCandidateId
			);
			const mutant = round.candidates.find((candidate) => candidate.id === round.buggyCandidateId);
			expect(original?.patch).not.toBe(mutant?.patch);
			expect(['a', 'b']).toContain(round.buggyCandidateId);
		}
		expect(deck.rounds.find((round) => round.path === 'src/c.cpp')?.mutationKind).toBe(
			'retain_deletion'
		);
		const retainedDeletion = deck.rounds.find((round) => round.path === 'src/c.cpp');
		if (!retainedDeletion) throw new Error('Delete-only fixture round is missing.');
		expect(
			retainedDeletion.candidates.find(
				(candidate) => candidate.id === retainedDeletion.buggyCandidateId
			)?.patch
		).toContain('@@ -4 +4,0 @@');
	});
});

describe('mutation quiz progress', () => {
	const deck = buildMutationQuizDeck([operatorFile], 'c'.repeat(40));

	it('requires a correct answer before advancing', () => {
		const fresh = defaultMutationQuizProgress(deck);
		const firstRound = requiredItem(deck.rounds, 0);
		const wrongId = firstRound.buggyCandidateId === 'a' ? 'b' : 'a';
		const wrong = answerMutationQuizRound(fresh, deck, wrongId);

		expect(wrong.correct).toBe(false);
		expect(wrong.progress.misses).toBe(1);
		expect(advanceMutationQuiz(wrong.progress, deck).currentRoundId).toBe(firstRound.id);

		const correct = answerMutationQuizRound(wrong.progress, deck, firstRound.buggyCandidateId);
		expect(correct.correct).toBe(true);
		expect(advanceMutationQuiz(correct.progress, deck).currentRoundId).toBe(deck.rounds[1]?.id);
	});

	it('resets stale revisions and rejects non-prefix solved ids', () => {
		const stale = { ...defaultMutationQuizProgress(deck), headSha: 'd'.repeat(40), attempts: 99 };
		expect(reconcileMutationQuizProgress(stale, deck)).toEqual(defaultMutationQuizProgress(deck));

		const secondRound = requiredItem(deck.rounds, 1);
		const nonPrefix = {
			...defaultMutationQuizProgress(deck),
			solvedRoundIds: [secondRound.id],
			currentRoundId: secondRound.id
		};
		expect(reconcileMutationQuizProgress(nonPrefix, deck).solvedRoundIds).toEqual([]);
	});

	it('repairs an empty cursor to the first unsolved patch', () => {
		const malformed = { ...defaultMutationQuizProgress(deck), currentRoundId: null };

		expect(reconcileMutationQuizProgress(malformed, deck).currentRoundId).toBe(deck.rounds[0]?.id);
	});

	it('persists the final solved round until completion is acknowledged', () => {
		let progress = defaultMutationQuizProgress(deck);
		for (const round of deck.rounds) {
			progress = answerMutationQuizRound(progress, deck, round.buggyCandidateId).progress;
			if (round !== deck.rounds.at(-1)) progress = advanceMutationQuiz(progress, deck);
		}

		expect(progress.completed).toBe(false);
		expect(progress.currentRoundId).toBe(deck.rounds.at(-1)?.id);
		expect(advanceMutationQuiz(progress, deck).completed).toBe(true);
	});
});
