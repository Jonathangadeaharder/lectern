import { getDb } from '$lib/server/db';
import { chunkSets, sessionQuestions, sessions } from '$lib/server/db/schema';
import type { Chunk } from '$lib/server/services/chunking';
import { generateQuestionsForChunk } from '$lib/server/services/questions';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const BodySchema = z.object({
	chunkId: z.string().optional(),
	weakTags: z.array(z.string()).optional()
});

export async function POST({ params, request }) {
	const sessionId = params.id;
	if (!sessionId) throw error(400, 'missing session id');

	const body = await request.json().catch(() => null);
	const parsed = BodySchema.safeParse(body);
	if (!parsed.success) throw error(400, 'Invalid body');

	const db = getDb();
	const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
	if (!session) throw error(404, 'session not found');

	const cs = db.select().from(chunkSets).where(eq(chunkSets.bundleId, session.bundleId)).get();
	if (!cs) throw error(404, 'no chunks found for session');

	const chunks: Chunk[] = JSON.parse(cs.chunksJson);

	let targetChunks: Chunk[];
	if (parsed.data.chunkId) {
		const chunk = chunks.find((c) => c.id === parsed.data.chunkId);
		if (!chunk) throw error(404, `chunk not found: ${parsed.data.chunkId}`);
		targetChunks = [chunk];
	} else {
		targetChunks = chunks;
	}

	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				for (const chunk of targetChunks) {
					const questions = await generateQuestionsForChunk({
						sessionId,
						bundleId: session.bundleId,
						chunk
					});

					controller.enqueue(
						encoder.encode(
							`data: ${JSON.stringify({
								chunkId: chunk.id,
								questions
							})}\n\n`
						)
					);
				}

				controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
				controller.close();
			} catch (e) {
				controller.enqueue(
					encoder.encode(
						`event: error\ndata: ${JSON.stringify({
							message: e instanceof Error ? e.message : String(e)
						})}\n\n`
					)
				);
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
}

export async function GET({ params }) {
	const sessionId = params.id;
	if (!sessionId) throw error(400, 'missing session id');

	const db = getDb();
	const rows = db
		.select()
		.from(sessionQuestions)
		.where(eq(sessionQuestions.sessionId, sessionId))
		.all();

	return json({
		questions: rows.map((r) => ({
			id: r.id,
			chunkId: r.chunkId,
			position: r.position,
			format: r.format,
			type: r.type,
			status: r.status,
			difficulty: r.difficulty,
			question: JSON.parse(r.promptJson)
		}))
	});
}
