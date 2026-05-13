import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const gotoSpy = vi.fn();
vi.mock('$app/navigation', () => ({ goto: (...a: unknown[]) => gotoSpy(...a) }));

import GlobalPalette from './GlobalPalette.svelte';

describe('GlobalPalette', () => {
	beforeEach(() => {
		gotoSpy.mockClear();
	});

	it('renders nothing when open=false', () => {
		render(GlobalPalette, { open: false, onclose: () => {} });
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('renders all groups when open=true', () => {
		render(GlobalPalette, { open: true, onclose: () => {} });
		expect(screen.getByText('Navigate')).toBeInTheDocument();
		expect(screen.getByText('Action')).toBeInTheDocument();
		expect(screen.getByText('Settings')).toBeInTheDocument();
	});

	it('focuses input on open', async () => {
		render(GlobalPalette, { open: true, onclose: () => {} });
		await waitFor(() => {
			const input = screen.getByRole('textbox');
			expect(input).toHaveFocus();
		});
	});

	it('filters items by label substring', async () => {
		render(GlobalPalette, { open: true, onclose: () => {} });
		const input = screen.getByRole('textbox');
		const user = userEvent.setup();
		await user.type(input, 'dashboard');
		expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
		expect(screen.queryByText('Toggle light/dark theme')).not.toBeInTheDocument();
	});

	it('shows empty message when nothing matches', async () => {
		render(GlobalPalette, { open: true, onclose: () => {} });
		const user = userEvent.setup();
		await user.type(screen.getByRole('textbox'), 'zzzzzzz');
		expect(screen.getByText(/No matches/i)).toBeInTheDocument();
	});

	it('ArrowDown advances selection, Enter dispatches and closes', async () => {
		const onclose = vi.fn();
		render(GlobalPalette, { open: true, onclose });
		const user = userEvent.setup();
		await user.keyboard('{ArrowDown}{Enter}');
		expect(gotoSpy).toHaveBeenCalled();
		expect(onclose).toHaveBeenCalledOnce();
	});

	it('Escape closes', async () => {
		const onclose = vi.fn();
		render(GlobalPalette, { open: true, onclose });
		const user = userEvent.setup();
		await user.keyboard('{Escape}');
		expect(onclose).toHaveBeenCalledOnce();
	});

	it('clicking scrim closes', async () => {
		const onclose = vi.fn();
		render(GlobalPalette, { open: true, onclose });
		const user = userEvent.setup();
		await user.click(screen.getByRole('dialog'));
		expect(onclose).toHaveBeenCalledOnce();
	});

	it('clicking inside palette does NOT close', async () => {
		const onclose = vi.fn();
		render(GlobalPalette, { open: true, onclose });
		const user = userEvent.setup();
		await user.click(screen.getByRole('textbox'));
		expect(onclose).not.toHaveBeenCalled();
	});

	it('theme toggle action flips [data-theme]', async () => {
		document.documentElement.setAttribute('data-theme', 'dark');
		render(GlobalPalette, { open: true, onclose: () => {} });
		const user = userEvent.setup();
		await user.click(screen.getByRole('button', { name: /toggle light\/dark theme/i }));
		expect(document.documentElement.getAttribute('data-theme')).toBe('light');
	});
});
