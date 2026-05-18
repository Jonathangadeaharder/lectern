import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { ingestFromUrl, IngestionAuthError } from '$lib/server/services/ingestion';
import type { IngestProgressEvent } from '$lib/server/services/ingestion/types';

const BodySchema = z.object({ url: z.string().url() });

export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	const parsed = BodySchema.safeParse(body);
	if (!parsed.success) throw error(400, 'Invalid body — expected { url }');

	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (event: IngestProgressEvent) => {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
			};
			try {
				await ingestFromUrl(parsed.data.url, {
					signal: request.signal,
					onProgress: send
				});
				controller.close();
			} catch (e) {
				if (e instanceof IngestionAuthError) {
					send({ step: 'error', kind: 'auth', message: e.message });
				} else {
					send({
						step: 'error',
						kind: 'unknown',
						message: e instanceof Error ? e.message : String(e)
					});
				}
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
