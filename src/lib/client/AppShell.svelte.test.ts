import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { readable } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/dashboard') })
}));

import AppShell from './AppShell.svelte';

describe('AppShell', () => {
	it('renders sidebar + topbar elements', () => {
		const { container } = render(AppShell, {
			crumbs: [{ label: 'Dashboard' }]
		});
		expect(container.querySelector('.sidebar')).toBeInTheDocument();
		expect(container.querySelector('.topbar')).toBeInTheDocument();
	});

	it('Meta+K opens palette', async () => {
		render(AppShell, { crumbs: [] });
		const user = userEvent.setup();
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		await user.keyboard('{Meta>}k{/Meta}');
		await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
	});

	it('Ctrl+K opens palette (non-Mac)', async () => {
		render(AppShell, { crumbs: [] });
		const user = userEvent.setup();
		await user.keyboard('{Control>}k{/Control}');
		await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
	});
});
