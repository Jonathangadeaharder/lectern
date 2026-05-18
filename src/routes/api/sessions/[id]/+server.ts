import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { describeSession, deleteSession, listSessionAnswers } from '$lib/server/services/session';
import { getDb } from '$lib/server/db';
import { sessionQuestions, chunkSets, sessions } from '$lib/server/db/schema';

export async function GET({ params }) {
	const id = params.id;
	if (!id) throw error(400, 'missing id');
	try {
		const summary = describeSession(id);
		const db = getDb();
		const session = db.select().from(sessions).where(eq(sessions.id, id)).get();
		if (!session) throw error(404, 'session not found');
		const cs = db
			.select()
			.from(chunkSets)
			.where(eq(chunkSets.bundleId, session.bundleId))
			.get();
		const chunks = cs ? JSON.parse(cs.chunksJson) : [];
		const qRows = db
			.select()
			.from(sessionQuestions)
			.where(eq(sessionQuestions.sessionId, id))
			.all();
		const questions = qRows.map((q) => ({
			id: q.id,
			chunkId: q.chunkId,
			position: q.position,
			format: q.format,
			type: q.type,
			status: q.status,
			question: JSON.parse(q.promptJson)
		}));
		return json({
			session: summary.session,
			chunks,
			questions,
			answers: listSessionAnswers(id)
		});
	} catch (e) {
		throw error(500, e instanceof Error ? e.message : String(e));
	}
}

export async function DELETE({ params }) {
	const id = params.id;
	if (!id) throw error(400, 'missing id');
	deleteSession(id);
	return json({ ok: true });
}
