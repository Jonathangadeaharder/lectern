import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ThreadRail from './ThreadRail.svelte';

describe('ThreadRail', () => {
	it('offers an independent thread sidebar collapse control', async () => {
		const onCollapse = vi.fn();
		render(ThreadRail, {
			threads: [],
			selectedFile: null,
			onCollapse
		});

		await userEvent.click(screen.getByRole('button', { name: 'Hide threads sidebar' }));

		expect(onCollapse).toHaveBeenCalledOnce();
	});
});