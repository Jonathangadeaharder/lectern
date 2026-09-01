import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import StructuralScopeBar from './StructuralScopeBar.svelte';

function props() {
	return {
		scope: 'behavior' as const,
		query: '',
		counts: { behavior: 442, mechanical: 282, new: 3206, deleted: 172 },
		totalLines: 4102,
		visibleFiles: 19,
		totalFiles: 85,
		reviewedOverall: 10,
		reviewedInView: 4,
		linesInView: 442,
		onScope: vi.fn(),
		onQuery: vi.fn(),
		onToggleViewReviewed: vi.fn()
	};
}

describe('StructuralScopeBar', () => {
	it('routes scope, search, and direct review commands through callbacks', async () => {
		const callbacks = props();
		render(StructuralScopeBar, callbacks);
		const user = userEvent.setup();

		await user.click(screen.getByRole('button', { name: /Mechanical 282/i }));
		await user.type(screen.getByTestId('structural-search'), 'recovery');
		await user.click(screen.getByTestId('view-reviewed'));

		expect(callbacks.onScope).toHaveBeenCalledWith('mechanical');
		expect(callbacks.onQuery).toHaveBeenLastCalledWith('recovery');
		expect(callbacks.onToggleViewReviewed).toHaveBeenCalledWith(true);
		expect(screen.queryByRole('button', { name: /^Reviewed$/i })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /^Unreviewed$/i })).not.toBeInTheDocument();
		expect(screen.getByText('19 / 85 files')).toBeInTheDocument();
		expect(screen.getByText('<1% reviewed')).toBeInTheDocument();
	});
});