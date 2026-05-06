/** Helper to stream a structured-object stream to SSE. */
export function streamObjectToSSE<T>(
	stream: AsyncIterable<Partial<T>>,
	finalPromise: Promise<T>
): Response {
	const encoder = new TextEncoder();

	const body = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				for await (const partial of stream) {
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify({ partial })}\n\n`)
					);
				}
				const final = await finalPromise;
				controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify(final)}\n\n`));
				controller.close();
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				controller.enqueue(
					encoder.encode(`event: error\ndata: ${JSON.stringify({ message })}\n\n`)
				);
				controller.close();
			}
		}
	});

	return new Response(body, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
}
