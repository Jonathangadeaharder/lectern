import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const gotoSpy = vi.fn();

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => gotoSpy(...args)
}));

vi.mock('$app/stores', () => ({
	page: {
		subscribe(fn: (v: unknown) => void) {
			fn({ url: new URL('http://localhost/dashboard') });
			return () => {};
		}
	}
}));

import Sidebar from './Sidebar.svelte';

describe('Sidebar', () => {
	it('marks Dashboard active when on /dashboard', () => {
		render(Sidebar, {});
		const dash = screen.getByRole('button', { name: /dashboard/i });
		expect(dash).toHaveAttribute('aria-current', 'page');
	});

	it('does NOT show repos section when repos is empty', () => {
		render(Sidebar, { repos: [] });
		expect(screen.queryByText(/codebases/i)).not.toBeInTheDocument();
	});

	it('shows codebases list when repos provided', () => {
		render(Sidebar, { repos: [{ slug: 'drizzle/orm', pulse: 0.6 }] });
		expect(screen.getByText(/codebases/i)).toBeInTheDocument();
		expect(screen.getByText('drizzle/orm')).toBeInTheDocument();
		expect(screen.getByText('60')).toBeInTheDocument();
	});

	it('hides streak card when streak === 0', () => {
		render(Sidebar, { streak: 0 });
		expect(screen.queryByText(/-day streak/)).not.toBeInTheDocument();
	});

	it('renders streak card with day pips', () => {
		const { container } = render(Sidebar, {
			streak: 12,
			streakWeek: [true, true, true, true, true, false, false]
		});
		expect(screen.getByText(/12-day streak/)).toBeInTheDocument();
		expect(screen.getByText('5 of 7 days this week')).toBeInTheDocument();
		expect(container.querySelectorAll('.streak-pip.on').length).toBe(5);
	});

	it('calls onPalette when "Jump to…" clicked', async () => {
		const onPalette = vi.fn();
		render(Sidebar, { onPalette });
		const user = userEvent.setup();
		await user.click(screen.getByRole('button', { name: /open command palette/i }));
		expect(onPalette).toHaveBeenCalledOnce();
	});

	it('navigates via goto when nav item clicked', async () => {
		render(Sidebar, {});
		const user = userEvent.setup();
		await user.click(screen.getByRole('button', { name: /dashboard/i }));
		expect(gotoSpy).toHaveBeenCalledWith('/dashboard');
	});
});
