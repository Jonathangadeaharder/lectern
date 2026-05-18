import { and, eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getDb } from '$lib/server/db';
import { bookmarks } from '$lib/server/db/schema';

const CreateSchema = z.object({
	chunkId: z.string().min(1),
	file: z.string().min(1),
	line: z.number().int().nonnegative(),
	note: z.string().max(500).optional()
});

const DeleteSchema = z.object({
	id: z.string().min(1)
});

export async function GET({ params }) {
	const sessionId = params.id;
	if (!sessionId) throw error(400, 'missing session id');

	const db = getDb();
	const rows = db
		.select()
		.from(bookmarks)
		.where(eq(bookmarks.sessionId, sessionId))
		.all();

	return json(rows);
}

export async function POST({ params, request }) {
	const sessionId = params.id;
	if (!sessionId) throw error(400, 'missing session id');

	const body = await request.json().catch(() => null);
	const parsed = CreateSchema.safeParse(body);
	if (!parsed.success) throw error(400, parsed.error.issues.map((i) => i.message).join('; '));

	const db = getDb();
	const id = randomUUID();
	const now = Date.now();

	db.insert(bookmarks)
		.values({
			id,
			sessionId,
			chunkId: parsed.data.chunkId,
			file: parsed.data.file,
			line: parsed.data.line,
			note: parsed.data.note ?? null,
			createdAt: now
		})
		.run();

	return json({ ok: true, id });
}

export async function DELETE({ params, request }) {
	const sessionId = params.id;
	if (!sessionId) throw error(400, 'missing session id');

	const body = await request.json().catch(() => null);
	const parsed = DeleteSchema.safeParse(body);
	if (!parsed.success) throw error(400, parsed.error.issues.map((i) => i.message).join('; '));

	const db = getDb();
	db.delete(bookmarks)
		.where(and(eq(bookmarks.id, parsed.data.id), eq(bookmarks.sessionId, sessionId)))
		.run();

	return json({ ok: true });
}
