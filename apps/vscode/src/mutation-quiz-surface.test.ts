import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MrBundle, MrFile, MrSummary } from '../../../src/lib/shared/mr/types';
import {
	type MutationQuizProgress,
	buildMutationQuizDeck
} from '../../../src/lib/shared/mutationQuiz';
import MutationQuiz from '../webview/surfaces/MutationQuiz.svelte';

function requiredItem<T>(items: T[], index: number): T {
	const item = items[index];
	if (!item) throw new Error(`Fixture item ${index} is missing.`);
	return item;
}

function summary(): MrSummary {
	return {
		projectId: 42,
		iid: 7,
		title: 'Mutation quiz',
		description: '',
		state: 'opened',
		draft: false,
		author: null,
		assignees: [],
		reviewers: [],
		sourceBranch: 'feature',
		targetBranch: 'main',
		diffRefs: { baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), startSha: 'a'.repeat(40) },
		webUrl: '',
		createdAt: '',
		updatedAt: '',
		mergeStatus: '',
		hasConflicts: false,
		changesCount: '1',
		userNotesCount: 0,
		upvotes: 0,
		downvotes: 0,
		labels: []
	};
}

function sourceFile(): MrFile {
	return {
		oldPath: 'src/recovery.cpp',
		newPath: 'src/recovery.cpp',
		newFile: false,
		deletedFile: false,
		renamedFile: false,
		generatedFile: false,
		tooLarge: false,
		collapsed: false,
		aMode: '100644',
		bMode: '100644',
		diff: `@@ -1,2 +1,2 @@ void first()
-    return false;
+    return true;
 }
@@ -8,2 +8,2 @@ void second()
-    count--;
+    count++;
 }`,
		added: 2,
		removed: 2
	};
}

function bundle(): MrBundle {
	return {
		summary: summary(),
		files: [sourceFile()],
		threads: [],
		versions: [],
		pipelines: [],
		approvals: { required: 0, left: 0, approved: true, approvedBy: [], userHasApproved: false }
	};
}

describe('MutationQuiz', () => {
	it('requires the mutant before advancing through every patch', async () => {
		const liveBundle = bundle();
		const deck = buildMutationQuizDeck(liveBundle.files, liveBundle.summary.diffRefs.headSha);
		const onProgress = vi.fn<(progress: MutationQuizProgress) => void>();
		const user = userEvent.setup();
		render(MutationQuiz, { bundle: liveBundle, initialProgress: null, onProgress });

		const first = requiredItem(deck.rounds, 0);
		const patchA = screen.getByTestId('mutation-patch-a');
		const patchB = screen.getByTestId('mutation-patch-b');
		expect(patchA.querySelectorAll('code > span')).toHaveLength(
			first.candidates[0].patch.split('\n').length
		);
		expect(patchA.textContent).not.toContain('\n\n');
		Object.defineProperties(patchA, {
			scrollHeight: { value: 600 },
			clientHeight: { value: 300 },
			scrollWidth: { value: 800 },
			clientWidth: { value: 400 }
		});
		Object.defineProperties(patchB, {
			scrollHeight: { value: 900 },
			clientHeight: { value: 300 },
			scrollWidth: { value: 1000 },
			clientWidth: { value: 400 }
		});
		patchA.scrollTop = 150;
		patchA.scrollLeft = 200;
		patchA.dispatchEvent(new Event('scroll'));
		expect(patchB.scrollTop).toBe(300);
		expect(patchB.scrollLeft).toBe(300);

		const firstWrong = first.buggyCandidateId === 'a' ? 'B' : 'A';
		await user.click(screen.getByRole('button', { name: `Patch ${firstWrong} contains the bug` }));

		expect(screen.getByText('This candidate matches the live MR patch.')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Next patch' })).not.toBeInTheDocument();

		await user.click(
			screen.getByRole('button', {
				name: `Patch ${first.buggyCandidateId.toUpperCase()} contains the bug`
			})
		);
		expect(screen.getByText('Mutation found.')).toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: 'Next patch' }));
		expect(screen.getByText('Patch 2 of 2')).toBeInTheDocument();

		const second = requiredItem(deck.rounds, 1);
		await user.click(
			screen.getByRole('button', {
				name: `Patch ${second.buggyCandidateId.toUpperCase()} contains the bug`
			})
		);
		await user.click(screen.getByRole('button', { name: 'Finish quiz' }));

		expect(screen.getByRole('heading', { name: 'All 2 patches classified.' })).toBeInTheDocument();
		expect(onProgress).toHaveBeenLastCalledWith(
			expect.objectContaining({ completed: true, misses: 1 })
		);
	});
});
