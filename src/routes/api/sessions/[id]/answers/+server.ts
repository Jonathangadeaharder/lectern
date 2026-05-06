import { gradeAnswer, streamGradeFreeText } from '$lib/server/services/grading';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';

const McSchema = z.object({
	format: z.literal('multiple_choice'),
	questionId: z.string(),
	selectedOptionId: z.string()
});
const ClickLinesSchema = z.object({
	format: z.literal('click_lines'),
	questionId: z.string(),
	marked: z.array(z.object({ file: z.string(), line: z.number().int() }))
});
const FreeTextSchema = z.object({
	format: z.literal('free_text'),
	questionId: z.string(),
	answer: z.string().min(1),
	stream: z.boolean().optional()
});
const TrueFalseSchema = z.object({
	format: z.literal('true_false'),
	questionId: z.string(),
	answer: z.boolean()
});
const CodeFixSchema = z.object({
	format: z.literal('code_fix'),
	questionId: z.string(),
	code: z.string().min(1)
});
const SkipSchema = z.object({
	format: z.string(),
	questionId: z.string(),
	skipped: z.literal(true)
});
const BodySchema = z.union([
	McSchema,
	ClickLinesSchema,
	FreeTextSchema,
	TrueFalseSchema,
	CodeFixSchema,
	SkipSchema
]);

export async function POST({ params, request }) {
	const sessionId = params.id;
	if (!sessionId) throw error(400, 'missing session id');
	const body = await request.json().catch(() => null);
	const parsed = BodySchema.safeParse(body);
	if (!parsed.success) throw error(400, 'Invalid body');

	if ('skipped' in parsed.data && parsed.data.skipped) {
		const { eq } = await import('drizzle-orm');
		const { getDb } = await import('$lib/server/db');
		const { answers, sessionQuestions } = await import('$lib/server/db/schema');
		const { randomUUID } = await import('node:crypto');
		const db = getDb();
		const now = Date.now();
		const skippedResult = {
			requiredResults: [],
			bonusResults: [],
			disqualifierResults: [],
			rawScore: 0,
			verdict: 'skipped' as const,
			feedback: 'Question skipped.',
			confidence: 0
		};
		db.transaction((tx) => {
			tx.insert(answers)
				.values({
					id: randomUUID(),
					sessionId,
					questionId: parsed.data.questionId,
					format: parsed.data.format,
					payloadJson: JSON.stringify({ skipped: true }),
					gradingJson: JSON.stringify(skippedResult),
					rawScore: 0,
					verdict: 'skipped',
					submittedAt: now,
					gradedAt: now
				})
				.run();
			tx.update(sessionQuestions)
				.set({ status: 'skipped', submittedAt: now, gradedAt: now })
				.where(eq(sessionQuestions.id, parsed.data.questionId))
				.run();
		});
		return json({ result: skippedResult });
	}

	if (parsed.data.format === 'free_text' && 'stream' in parsed.data && parsed.data.stream) {
		const { questionId, answer } = parsed.data;
		const encoder = new TextEncoder();
		const stream = new ReadableStream<Uint8Array>({
			async start(controller) {
				try {
					for await (const chunk of streamGradeFreeText({
						sessionId,
						questionId,
						answer,
						signal: request.signal
					})) {
						const event = chunk.final ? 'done' : 'partial';
						const payload = chunk.final ?? chunk.partial;
						controller.enqueue(
							encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
						);
					}
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
				Connection: 'keep-alive'
			}
		});
	}

	try {
		let payload: any;
		const data = parsed.data as any;
		if (data.format === 'multiple_choice') {
			payload = { selectedOptionId: data.selectedOptionId };
		} else if (data.format === 'click_lines') {
			payload = { marked: data.marked };
		} else if (data.format === 'true_false') {
			payload = { answer: data.answer };
		} else if (data.format === 'code_fix') {
			payload = { code: data.code };
		} else {
			payload = { answer: data.answer };
		}
		const result = await gradeAnswer({
			sessionId,
			questionId: data.questionId,
			payload,
			signal: request.signal
		});
		return json({ result });
	} catch (e) {
		throw error(500, e instanceof Error ? e.message : String(e));
	}
}
