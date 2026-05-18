import { getDb } from '$lib/server/db';
import { bundles, chunkSets, sessionQuestions, sessions } from '$lib/server/db/schema';
import {
	deleteSession,
	describeSession,
	getFailedChunks,
	getGenState,
	isGenerating,
	listSessionAnswers
} from '$lib/server/services/session';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export async function GET({ params }) {
	const id = params.id;
	if (!id) throw error(400, 'missing id');
	try {
		const summary = describeSession(id);
		const db = getDb();
		const session = db.select().from(sessions).where(eq(sessions.id, id)).get();
		if (!session) throw error(404, 'session not found');
		const cs = db.select().from(chunkSets).where(eq(chunkSets.bundleId, session.bundleId)).get();
		const chunks = cs ? JSON.parse(cs.chunksJson) : [];
		const qRows = db
			.select()
			.from(sessionQuestions)
			.where(eq(sessionQuestions.sessionId, id))
			.all();
		const questions = qRows.map((q) => {
			const parsed = JSON.parse(q.promptJson);
			parsed.id = q.id;
			return {
				id: q.id,
				chunkId: q.chunkId,
				position: q.position,
				format: q.format,
				type: q.type,
				status: q.status,
				question: parsed
			};
		});
		const chunksReady = new Set(qRows.map((q) => q.chunkId)).size;
		const stillGenerating = isGenerating(id);
		const bundle = db.select().from(bundles).where(eq(bundles.id, session.bundleId)).get();
		const gs = getGenState(id);
		return json({
			session: summary.session,
			chunks,
			questions,
			answers: listSessionAnswers(id),
			source: bundle ? { url: bundle.sourceUrl } : null,
			generation: {
				complete: !stillGenerating,
				chunksReady,
				chunksTotal: chunks.length,
				currentChunkId: gs?.currentChunkId ?? null,
				currentChunkIndex: gs?.currentChunkIndex ?? null,
				elapsedMs: gs ? Date.now() - gs.startedAt : null,
				lastProgressAt: gs?.lastProgressAt ?? null
			},
			failedChunks: getFailedChunks(id)
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
