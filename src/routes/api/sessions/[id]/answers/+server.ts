import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { gradeAnswer, streamGradeFreeText } from '$lib/server/services/grading';

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
const BodySchema = z.discriminatedUnion('format', [
	McSchema,
	ClickLinesSchema,
	FreeTextSchema,
	TrueFalseSchema
]);

export async function POST({ params, request }) {
	const sessionId = params.id;
	if (!sessionId) throw error(400, 'missing session id');
	const body = await request.json().catch(() => null);
	const parsed = BodySchema.safeParse(body);
	if (!parsed.success) throw error(400, 'Invalid body');

	if (parsed.data.format === 'free_text' && parsed.data.stream) {
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
		const result = await gradeAnswer({
			sessionId,
			questionId: parsed.data.questionId,
			payload:
				parsed.data.format === 'multiple_choice'
					? { selectedOptionId: parsed.data.selectedOptionId }
					: parsed.data.format === 'click_lines'
						? { marked: parsed.data.marked }
						: parsed.data.format === 'true_false'
							? { answer: parsed.data.answer }
							: { answer: parsed.data.answer },
			signal: request.signal
		});
		return json({ result });
	} catch (e) {
		throw error(500, e instanceof Error ? e.message : String(e));
	}
}
