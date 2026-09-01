import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { classifyStructuralDiff } from '$lib/shared/mr/structuralDiff';
import type { MrFile } from '$lib/shared/mr/types';
import FileRail from './FileRail.svelte';

const sourceFile: MrFile = {
	oldPath: 'src/a/very/long/recovery/AdmissionGate.ts',
	newPath: 'src/a/very/long/recovery/AdmissionGate.ts',
	newFile: false,
	deletedFile: false,
	renamedFile: false,
	generatedFile: false,
	tooLarge: false,
	collapsed: false,
	aMode: '100644',
	bMode: '100644',
	diff: '@@ -1 +1 @@\n-oldCall();\n+newCall();',
	added: 1,
	removed: 1
};

describe('FileRail', () => {
	it('shows full paths and scope-specific review progress', () => {
		const structuralFile = classifyStructuralDiff([sourceFile]).files[0]!;
		const reviewed = new Set([structuralFile.hunks[0]!.lines[0]!.id]);
		render(FileRail, {
			files: [structuralFile],
			scope: 'behavior',
			threads: [],
			selected: structuralFile.path,
			viewed: new Set<string>(),
			reviewedLineIds: reviewed,
			onSelect: vi.fn(),
			onToggleViewed: vi.fn()
		});

		expect(screen.getByText(sourceFile.newPath)).toBeInTheDocument();
		expect(screen.getByLabelText('1 of 2 lines reviewed')).toHaveTextContent('1/2');
		expect(screen.getByText('behavior files')).toBeInTheDocument();
	});

	it('offers an independent file sidebar collapse control', async () => {
		const structuralFile = classifyStructuralDiff([sourceFile]).files[0]!;
		const onCollapse = vi.fn();
		render(FileRail, {
			files: [structuralFile],
			scope: 'full',
			threads: [],
			selected: structuralFile.path,
			viewed: new Set<string>(),
			reviewedLineIds: new Set<string>(),
			onSelect: vi.fn(),
			onToggleViewed: vi.fn(),
			onCollapse
		});

		await userEvent.click(screen.getByRole('button', { name: 'Hide file sidebar' }));

		expect(onCollapse).toHaveBeenCalledOnce();
	});
});