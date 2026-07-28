import { render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Home from './+page.svelte';

function mockSettings(body: object | null) {
	globalThis.fetch = vi.fn().mockResolvedValue({
		ok: body !== null,
		json: async () => body
	}) as unknown as typeof fetch;
}

describe('Home (empty state)', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('shows Loading initially', () => {
		mockSettings(null);
		render(Home);
		expect(screen.getByText(/Loading/)).toBeInTheDocument();
	});

	it('shows Set-up CTA when LLM is not configured', async () => {
		mockSettings({ endpoint: null, model: null, hasToken: false });
		render(Home);
		await waitFor(() => {
			expect(screen.getByRole('link', { name: /continue to setup/i })).toBeInTheDocument();
		});
	});

	it('shows PR input + sample chips when configured', async () => {
		mockSettings({ endpoint: 'https://api.openai.com', model: 'gpt-4o', hasToken: true });
		render(Home);
		await waitFor(() => {
			expect(screen.getByRole('textbox', { name: /pull request url/i })).toBeInTheDocument();
		});
		expect(screen.getByText(/drizzle-orm #2913/)).toBeInTheDocument();
	});
});
