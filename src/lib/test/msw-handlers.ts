import { HttpResponse, http } from 'msw';

export const handlers = [
	http.get('/api/settings/llm/quick', () =>
		HttpResponse.json({ endpoint: 'https://api.example', model: 'gpt-4o', hasToken: true })
	),
	http.get('/api/sessions/:id', ({ params }) =>
		HttpResponse.json({
			session: { id: params.id, state: 'active', bundleId: 'b1' },
			questions: [],
			answers: []
		})
	),
	http.get('/api/sessions/:id/debrief', ({ params }) =>
		HttpResponse.json({
			sessionId: params.id,
			confidenceScore: 80,
			band: 'high',
			recommendation: 'keep at it',
			perChunk: [{ chunkId: 'c1', title: 'X', score: 0.8, answered: 5, total: 5, note: 'ok' }],
			missedByTag: [],
			followUps: [],
			selfConfidence: [],
			rawSession: {}
		})
	),
	http.post('/api/sessions/:id/heartbeat', () => HttpResponse.json({ ok: true })),
	http.post('/api/sessions/:id/transition', () => HttpResponse.json({ ok: true }))
];
