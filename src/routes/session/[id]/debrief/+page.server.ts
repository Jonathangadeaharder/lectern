import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { sessions } from '$lib/server/db/schema';

export async function load({ params }) {
	const id = params.id;
	if (!id) throw error(400, 'missing id');
	const db = getDb();
	const session = db.select().from(sessions).where(eq(sessions.id, id)).get();
	if (!session) throw error(404, 'session not found');
	return { sessionId: id };
}
