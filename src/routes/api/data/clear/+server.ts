import { getDb } from '$lib/server/db';
import { answers, debriefs, sessionActivity, sessions } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async () => {
	const db = getDb();
	db.delete(answers).run();
	db.delete(debriefs).run();
	db.delete(sessionActivity).run();
	db.delete(sessions).run();
	return json({ ok: true });
};
