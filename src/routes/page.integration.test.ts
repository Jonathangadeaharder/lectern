import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import Home from './+page.svelte';

const server = setupServer(
	http.get('/api/settings/llm/quick', () =>
		HttpResponse.json({ endpoint: 'https://api.example', model: 'gpt-4o', hasToken: true })
	)
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Home + /api/settings/llm/quick', () => {
	it('shows setup CTA when API says not configured', async () => {
		server.use(
			http.get('/api/settings/llm/quick', () =>
				HttpResponse.json({ endpoint: null, model: null, hasToken: false })
			)
		);
		render(Home);
		await waitFor(() => {
			expect(screen.getByRole('link', { name: /continue to setup/i })).toBeInTheDocument();
		});
	});

	it('shows PR input when API says configured', async () => {
		render(Home);
		await waitFor(() => {
			expect(screen.getByRole('textbox', { name: /pull request url/i })).toBeInTheDocument();
		});
	});

	it('shows graceful UI when API fails', async () => {
		server.use(http.get('/api/settings/llm/quick', () => HttpResponse.json({}, { status: 500 })));
		render(Home);
		await waitFor(() => {
			expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
		});
	});
});
