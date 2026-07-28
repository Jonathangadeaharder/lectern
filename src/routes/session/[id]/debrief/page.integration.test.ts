import { render, screen, waitFor } from '@testing-library/svelte';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import Debrief from './+page.svelte';

vi.mock('$lib/client/sound/events', () => ({ emit: vi.fn() }));

vi.mock('$lib/client/sound/events', () => ({ emit: vi.fn() }));

const server = setupServer(
	http.get('/api/sessions/:id/debrief', ({ params }) =>
		HttpResponse.json({
			sessionId: params.id,
			confidenceScore: 80,
			band: 'high',
			recommendation: 'keep at it',
			perChunk: [{ chunkId: 'c1', title: 'X', score: 0.8, answered: 5, total: 5, note: 'ok' }],
			missedByTag: [],
			followUps: ['review-tomorrow', 'drill'],
			selfConfidence: [],
			rawSession: {}
		})
	)
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Debrief + /api/sessions/:id/debrief', () => {
	it('renders stats from happy-path response', async () => {
		render(Debrief, { data: { sessionId: 'abc' } });
		await waitFor(() => {
			expect(screen.getByText(/4 of 5/)).toBeInTheDocument();
			expect(screen.getByText(/High confidence/)).toBeInTheDocument();
		});
	});

	it('handles 404 gracefully', async () => {
		server.use(http.get('/api/sessions/:id/debrief', () => HttpResponse.json({}, { status: 404 })));
		render(Debrief, { data: { sessionId: 'abc' } });
		await waitFor(() => {
			expect(screen.getByText(/No debrief available/)).toBeInTheDocument();
		});
	});
});
