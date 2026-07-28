import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { runText } from '$lib/server/services/llm';

const BodySchema = z.object({
	snippet: z.string().min(1).max(20000),
	file: z.string().optional(),
	question: z.string().min(1).max(2000)
});

const SYSTEM = `You are a code-review assistant. The reviewer is reading a pull request and selected a snippet of code, then asked a focused question about it.

Answer concisely (1-4 short paragraphs). Reference specific identifiers when helpful. If the snippet is incomplete and the answer truly depends on missing context, say so plainly and suggest what to look at. Do not hedge or pad.`;

import type { RequestEvent } from '@sveltejs/kit';

export async function POST({ params, request }: RequestEvent) {
	const id = params.id;
	if (!id) throw error(400, 'missing session id');
	const body = await request.json().catch(() => null);
	const parsed = BodySchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, parsed.error.issues.map((i) => i.message).join('; '));
	}
	const { snippet, file, question } = parsed.data;

	const userPrompt = [
		file ? `## File\n${file}` : '',
		'## Selected code',
		'```',
		snippet,
		'```',
		'',
		'## Question',
		question
	]
		.filter(Boolean)
		.join('\n');

	try {
		const text = await runText({
			task: 'ask_about_selection',
			system: SYSTEM,
			prompt: userPrompt,
			temperature: 0.2,
			maxTokens: 800,
			sessionId: id,
			signal: request.signal
		});
		return json({ ok: true, answer: text });
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return json({ ok: false, error: message }, { status: 502 });
	}
}
