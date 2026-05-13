import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import TopBar from './TopBar.svelte';

describe('TopBar', () => {
	it('renders all crumbs and styles the last one as active', () => {
		render(TopBar, {
			crumbs: [
				{ label: 'Repos', href: '/dashboard' },
				{ label: 'drizzle-orm', mono: true }
			]
		});
		const last = screen.getByText('drizzle-orm');
		expect(last).toHaveClass('active', 'mono');
	});

	it('renders earlier crumbs as anchors when href is set', () => {
		render(TopBar, { crumbs: [{ label: 'Repos', href: '/dashboard' }, { label: 'x' }] });
		const link = screen.getByRole('link', { name: 'Repos' });
		expect(link).toHaveAttribute('href', '/dashboard');
	});

	it('calls onPalette and onPaste callbacks', async () => {
		const onPalette = vi.fn();
		const onPaste = vi.fn();
		render(TopBar, { crumbs: [], onPalette, onPaste });
		const user = userEvent.setup();
		await user.click(screen.getByRole('button', { name: /palette/i }));
		await user.click(screen.getByRole('button', { name: /paste pr/i }));
		expect(onPalette).toHaveBeenCalledOnce();
		expect(onPaste).toHaveBeenCalledOnce();
	});

	it('hides Paste PR when showPaste=false', () => {
		render(TopBar, { crumbs: [], showPaste: false });
		expect(screen.queryByRole('button', { name: /paste pr/i })).not.toBeInTheDocument();
	});
});
