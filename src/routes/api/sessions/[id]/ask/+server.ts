import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { bundles, sessions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { isPrAgentAvailable, runAsk, PrAgentSetupError } from '$lib/server/services/pr_agent';
import { runText } from '$lib/server/services/llm';

const BodySchema = z.object({
	snippet: z.string().min(1).max(20000),
	file: z.string().optional(),
	question: z.string().min(1).max(2000)
});

const FALLBACK_SYSTEM = `You are a code-review assistant. The reviewer is reading a pull request and selected a snippet of code, then asked a focused question about it.

Answer concisely (1-4 short paragraphs). Reference specific identifiers when helpful. If the snippet is incomplete and the answer truly depends on missing context, say so plainly and suggest what to look at. Do not hedge or pad.`;

export async function POST({ params, request }) {
	const id = params.id;
	if (!id) throw error(400, 'missing session id');
	const body = await request.json().catch(() => null);
	const parsed = BodySchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, parsed.error.issues.map((i) => i.message).join('; '));
	}
	const { snippet, file, question } = parsed.data;

	if (isPrAgentAvailable()) {
		try {
			const db = getDb();
			const session = db.select().from(sessions).where(eq(sessions.id, id)).get();
			if (!session) throw error(404, 'session not found');

			const bundle = db.select().from(bundles).where(eq(bundles.id, session.bundleId)).get();
			if (!bundle) throw error(404, 'bundle not found');

			const lineMatch = snippet.split('\n').length > 1 ? undefined : undefined;
			const result = await runAsk({
				bundleId: bundle.id,
				question,
				file: file ?? undefined,
				signal: request.signal
			});
			return json({ ok: true, answer: result.answer });
		} catch (e) {
			if (e instanceof PrAgentSetupError) {
				// fall through to fallback
			} else {
				const message = e instanceof Error ? e.message : String(e);
				console.warn(`[ask] PR-Agent /ask failed, falling back to local LLM: ${message}`);
			}
		}
	}

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
			system: FALLBACK_SYSTEM,
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
