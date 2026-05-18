import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import Debrief from './+page.svelte';

vi.mock('$lib/client/sound/events', () => ({ emit: vi.fn() }));

function mockFetch(body: unknown, ok = true) {
	globalThis.fetch = vi.fn().mockResolvedValue({
		ok,
		json: async () => body
	}) as unknown as typeof fetch;
}

const sampleDebrief = {
	sessionId: 'abc',
	confidenceScore: 75,
	band: 'high',
	recommendation: 'review concurrency tomorrow',
	perChunk: [
		{ chunkId: 'c1', title: 'Fix: race', score: 0.85, answered: 5, total: 5, note: 'solid' },
		{ chunkId: 'c2', title: 'Test: spy', score: 0.5, answered: 2, total: 4, note: 'gap' }
	],
	missedByTag: [{ tag: 'concurrency', missCount: 3, exampleQuestionIds: [] }],
	followUps: ['review-tomorrow', 'drill-try-finally', 'read-spec'],
	selfConfidence: [
		{ questionId: 'q1', chunkTitle: 'Fix: race', selfConfidence: 4, computedScore: 0.85 }
	],
	rawSession: { id: 'abc' }
};

describe('Debrief', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('shows loading initially', () => {
		mockFetch(sampleDebrief);
		render(Debrief, { data: { sessionId: 'abc' } });
		expect(screen.getByText(/Loading the breakdown/i)).toBeInTheDocument();
	});

	it('renders "No debrief" when fetch fails', async () => {
		mockFetch({}, false);
		render(Debrief, { data: { sessionId: 'abc' } });
		await waitFor(() => expect(screen.getByText(/No debrief available/)).toBeInTheDocument());
	});

	it('renders headline with X of Y right', async () => {
		mockFetch(sampleDebrief);
		render(Debrief, { data: { sessionId: 'abc' } });
		await waitFor(() => {
			expect(screen.getByText(/5 of 9/)).toBeInTheDocument();
		});
	});

	it('renders follow-up recommendations', async () => {
		mockFetch(sampleDebrief);
		render(Debrief, { data: { sessionId: 'abc' } });
		await waitFor(() => {
			expect(screen.getByText(/Three follow-ups/i)).toBeInTheDocument();
			expect(screen.getByText(/review-tomorrow/i)).toBeInTheDocument();
		});
	});

	it('renders scatter SVG when selfConfidence present', async () => {
		mockFetch(sampleDebrief);
		const { container } = render(Debrief, { data: { sessionId: 'abc' } });
		await waitFor(() => {
			expect(container.querySelector('svg.scatter')).toBeInTheDocument();
		});
	});
});
