import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { classifyStructuralDiff } from '$lib/shared/mr/structuralDiff';
import type { MrFile } from '$lib/shared/mr/types';
import StructuralDiffPane from './StructuralDiffPane.svelte';

const file: MrFile = {
	oldPath: 'src/recovery.ts',
	newPath: 'src/recovery.ts',
	newFile: false,
	deletedFile: false,
	renamedFile: false,
	generatedFile: false,
	tooLarge: false,
	collapsed: false,
	aMode: '100644',
	bMode: '100644',
	diff: '@@ -1,3 +1,3 @@\n const ready = true;\n-oldCall();\n+newCall();\n return ready;',
	added: 1,
	removed: 1
};

describe('StructuralDiffPane', () => {
	it('toggles line and hunk review directly', async () => {
		const structuralFile = classifyStructuralDiff([file]).files[0]!;
		const onToggleHunk = vi.fn();
		const onToggleLine = vi.fn();
		const firstChangedLine = structuralFile.hunks[0]!.lines[1]!.id;
		render(StructuralDiffPane, {
			structuralFile,
			scope: 'behavior',
			threads: [],
			reviewedLineIds: new Set([firstChangedLine]),
			onToggleHunk,
			onToggleLine
		});
		const user = userEvent.setup();

		expect(screen.getByTestId('hunk-reviewed')).toHaveProperty('indeterminate', true);
		await user.click(screen.getAllByTestId('line-reviewed')[1]!);
		await user.click(screen.getByTestId('hunk-reviewed'));

		expect(onToggleLine).toHaveBeenCalledWith(structuralFile.hunks[0]!.lines[2]!.id, true);
		expect(onToggleHunk).toHaveBeenCalledWith(
			structuralFile.hunks[0]!.lines.slice(1, 3).map((line) => line.id),
			true
		);
	});

	it('anchors deletion comments to the old side', async () => {
		const structuralFile = classifyStructuralDiff([file]).files[0]!;
		const onInlineDiscussion = vi.fn();
		render(StructuralDiffPane, {
			structuralFile,
			scope: 'behavior',
			threads: [],
			reviewedLineIds: new Set<string>(),
			onToggleHunk: vi.fn(),
			onToggleLine: vi.fn(),
			onInlineDiscussion
		});
		const user = userEvent.setup();

		await user.click(screen.getByRole('button', { name: 'Comment on old line 2' }));
		await user.type(screen.getByTestId('inline-composer-textarea'), 'Why remove this?');
		await user.click(screen.getByTestId('inline-composer-submit'));

		expect(onInlineDiscussion).toHaveBeenCalledWith({
			newPath: 'src/recovery.ts',
			oldPath: 'src/recovery.ts',
			newLine: null,
			oldLine: 2,
			body: 'Why remove this?'
		});
	});

	it('renders source as selectable text instead of a full-line button', () => {
		const structuralFile = classifyStructuralDiff([file]).files[0]!;
		render(StructuralDiffPane, {
			structuralFile,
			scope: 'behavior',
			threads: [],
			reviewedLineIds: new Set<string>(),
			onToggleHunk: vi.fn(),
			onToggleLine: vi.fn(),
			onInlineDiscussion: vi.fn()
		});

		const source = screen.getAllByTestId('source-line')[1]!;
		expect(source.tagName).toBe('DIV');
		expect(source.querySelector('code')?.closest('button')).toBeNull();
		expect(screen.getByRole('button', { name: 'Comment on old line 2' })).toBeInTheDocument();
	});
});