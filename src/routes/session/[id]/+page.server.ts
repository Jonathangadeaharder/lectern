import type { RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { chunkSets, sessions } from '$lib/server/db/schema';
import type { Chunk } from '$lib/server/services/chunking';
import { describeSession } from '$lib/server/services/session';

export async function load({ params }: RequestEvent) {
	const id = params.id;
	if (!id) throw error(400, 'missing id');
	let summary: ReturnType<typeof describeSession>;
	try {
		summary = describeSession(id);
	} catch {
		throw error(404, 'session not found');
	}
	const db = getDb();
	const session = db.select().from(sessions).where(eq(sessions.id, id)).get();
	if (!session) throw error(404, 'session not found');
	const cs = db.select().from(chunkSets).where(eq(chunkSets.bundleId, session.bundleId)).get();
	const chunks: Chunk[] = cs ? JSON.parse(cs.chunksJson) : [];
	return {
		sessionId: id,
		session: summary.session,
		chunks
	};
}
