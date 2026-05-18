import { and, eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { answers } from '$lib/server/db/schema';

const BodySchema = z.object({
	questionId: z.string().min(1),
	confidence: z.number().int().min(1).max(5)
});

export async function POST({ params, request }) {
	const sessionId = params.id;
	if (!sessionId) throw error(400, 'missing session id');

	const body = await request.json().catch(() => null);
	const parsed = BodySchema.safeParse(body);
	if (!parsed.success) throw error(400, parsed.error.issues.map((i) => i.message).join('; '));

	const { questionId, confidence } = parsed.data;

	const db = getDb();
	db.update(answers)
		.set({ selfConfidence: confidence })
		.where(and(eq(answers.sessionId, sessionId), eq(answers.questionId, questionId)))
		.run();

	return json({ ok: true });
}
