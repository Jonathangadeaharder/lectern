/**
 * Manual verification test for the LLM → question generation pipeline.
 *
 * Run:  npx tsx src/lib/server/services/llm/test_pipeline.ts
 *
 * This exercises:
 *  1. LLM connectivity (generateText)
 *  2. Structured output (generateObject with mode:'json')
 *  3. Question schema parsing (QuestionListSchema)
 *  4. runText fallback + tryParseQuestions
 *  5. Full generateQuestionsForChunk (requires a bundle)
 *
 * Steps 1-4 need only a configured LLM endpoint.
 * Step 5 needs a valid bundle — pass BUNDLE_ID env var or skip it.
 */

import { generateObject, generateText, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';
import { getDb } from '../../db';
import { bundles } from '../../db/schema';
import { buildModelFromValues, getModel } from './provider';
import { getQuickConfig } from './quick_config';
import { getKey } from '../secrets/keychain';
import { resolveSecret } from './secret_ref';
import { runStructured, runText } from './index';
import { QuestionListSchema, type Question } from './schemas';
import { generateQuestionsForChunk } from '../questions';
import { chunkBundle } from '../chunking';

const SEP = '─'.repeat(60);

async function main() {
	console.log(SEP);
	console.log('LLM Pipeline Verification');
	console.log(SEP);

	const cfg = await getQuickConfig();
	if (!cfg) {
		console.error('❌ No LLM quick config found. Run onboarding first.');
		process.exit(1);
	}
	console.log(`\n✓ Config: endpoint=${cfg.endpoint} model=${cfg.model}`);

	const stored = await getKey('llm.quick');
	if (!stored) {
		console.error('❌ No API token stored.');
		process.exit(1);
	}
	const token = resolveSecret(stored);
	console.log(`✓ Token: ${token.slice(0, 6)}…${token.slice(-4)}`);

	const model = await getModel('generate_questions');
	console.log(`✓ Model resolved`);

	// ── Step 1: Plain text generation ──────────────────────────────────
	console.log(`\n${SEP}`);
	console.log('Step 1: generateText (plain text)');
	console.log(SEP);
	try {
		const t0 = Date.now();
		const result = await generateText({
			model,
			prompt: 'Reply with the single word: PONG',
			maxOutputTokens: 10,
			temperature: 0,
			abortSignal: AbortSignal.timeout(15000)
		});
		console.log(`✓ generateText ok in ${Date.now() - t0}ms`);
		console.log(`  Response: "${result.text.trim()}"`);
	} catch (e) {
		console.error(`❌ generateText failed: ${(e as Error).message}`);
		if ((e as Error).message?.includes('401') || (e as Error).message?.includes('403')) {
			console.error('  → Auth error. Check your API token.');
		}
		process.exit(1);
	}

	// ── Step 2: Structured output with generateObject ──────────────────
	console.log(`\n${SEP}`);
	console.log('Step 2: generateObject with mode:"json" (simple schema)');
	console.log(SEP);

	const SimpleSchema = z.object({
		items: z.array(z.object({
			name: z.string(),
			value: z.number()
		})).min(1).max(3)
	});

	try {
		const t0 = Date.now();
		const opts: Record<string, unknown> = {
			model,
			schema: SimpleSchema,
			mode: 'tool',
			prompt: 'Generate 2 items with name and value.',
			temperature: 0,
			abortSignal: AbortSignal.timeout(30000)
		};
		const result = await generateObject(opts as any) as any;
		console.log(`✓ generateObject (simple) ok in ${Date.now() - t0}ms`);
		console.log(`  Output: ${JSON.stringify(result.object ?? result)}`);
	} catch (e) {
		console.error(`❌ generateObject (simple) failed: ${(e as Error).name}: ${(e as Error).message?.slice(0, 500)}`);
		if (NoObjectGeneratedError.isInstance(e)) {
			const noe = e as NoObjectGeneratedError;
			console.error(`  finishReason: ${noe.finishReason}`);
			console.error(`  raw text: ${(noe.text ?? '').slice(0, 1000)}`);
		}
		console.log('\n→ The model may not support structured JSON output. Trying generateText fallback…');
		try {
			const t0 = Date.now();
			const textResult = await generateText({
				model,
				prompt: 'Generate 2 items with name and value as JSON: { "items": [{"name": "...", "value": 1}] }',
				temperature: 0,
				abortSignal: AbortSignal.timeout(30000)
			});
			console.log(`✓ generateText fallback ok in ${Date.now() - t0}ms`);
			console.log(`  Raw: ${textResult.text.slice(0, 500)}`);
			try {
				const jsonMatch = textResult.text.match(/\{[\s\S]*\}/);
				if (jsonMatch) {
					const parsed = SimpleSchema.safeParse(JSON.parse(jsonMatch[0]!));
					console.log(`  Parse: ${parsed.success ? '✓ valid' : '✗ invalid: ' + parsed.error.message.slice(0, 200)}`);
				} else {
					console.log(`  Parse: ✗ no JSON object found in output`);
				}
			} catch {
				console.log(`  Parse: ✗ JSON.parse failed`);
			}
		} catch (e2) {
			console.error(`❌ generateText fallback also failed: ${(e2 as Error).message}`);
		}
	}

	// ── Step 3: QuestionListSchema with generateObject ─────────────────
	console.log(`\n${SEP}`);
	console.log('Step 3: generateObject with QuestionListSchema');
	console.log(SEP);

	const testPrompt = `Generate 3 multiple-choice questions about this code change:

\`\`\`diff
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -10,6 +10,8 @@ export async function login(email: string, password: string) {
   const user = await db.users.findByEmail(email);
-  if (!user) return { error: 'not found' };
+  if (!user) throw new AuthError('User not found', 404);
+  if (user.locked) throw new AuthError('Account locked', 403);
   const valid = await bcrypt.compare(password, user.hash);
\`\`\`

chunkId: "test-chunk-1"`;

	const testSystem = `You are a code review quiz generator. Generate questions as JSON matching the QuestionListSchema. Each question needs: id, chunkId, type ("anchor"), format ("multiple_choice"), prompt (10-800 chars), contextLines (array), skillTags (array), difficulty ("easy"|"medium"|"hard"), derivedFrom ({source:"diff",refs:[]}), and options array with id, text, correct (boolean), explanation.`;

	try {
		const t0 = Date.now();
		const opts: Record<string, unknown> = {
			model,
			schema: QuestionListSchema,
			mode: 'tool',
			system: testSystem,
			prompt: testPrompt,
			temperature: 0,
			abortSignal: AbortSignal.timeout(60000)
		};
		const result = await generateObject(opts as any) as any;
		console.log(`✓ generateObject (QuestionList) ok in ${Date.now() - t0}ms`);
		console.log(`  Questions: ${result.object?.questions?.length ?? 'unknown'}`);
		for (const q of (result.object?.questions ?? [])) {
			console.log(`    - [${q.difficulty}] ${q.format}: ${q.prompt.slice(0, 80)}…`);
		}
	} catch (e) {
		console.error(`❌ generateObject (QuestionList) failed: ${(e as Error).name}: ${(e as Error).message?.slice(0, 500)}`);
		if (NoObjectGeneratedError.isInstance(e)) {
			const noe = e as NoObjectGeneratedError;
			console.error(`  finishReason: ${noe.finishReason}`);
			console.error(`  raw text: ${(noe.text ?? '').slice(0, 2000)}`);
		}
	}

	// ── Step 4: runText fallback ───────────────────────────────────────
	console.log(`\n${SEP}`);
	console.log('Step 4: runText + tryParseQuestions fallback');
	console.log(SEP);

	try {
		const t0 = Date.now();
		const raw = await runText({
			task: 'generate_questions',
			system: testSystem,
			prompt: `${testPrompt}\n\nOutput ONLY valid JSON matching: { "questions": [...] }`,
			maxRetries: 0
		});
		console.log(`✓ runText ok in ${Date.now() - t0}ms`);
		console.log(`  Raw length: ${raw.length}`);
		console.log(`  First 300 chars: ${raw.slice(0, 300)}`);

		function tryParseQuestions(text: string): { questions: Question[] } | null {
			const candidates = [text];
			const jsonMatch = text.match(/\{[\s\S]*"questions"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
			if (jsonMatch) candidates.unshift(jsonMatch[0]!);
			const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
			if (fenceMatch) candidates.unshift(fenceMatch[1]!.trim());
			for (const candidate of candidates) {
				try {
					const parsed = JSON.parse(candidate);
					const validated = QuestionListSchema.safeParse(parsed);
					if (validated.success) return validated.data;
					else console.log(`  Parse attempt: schema invalid — ${validated.error.message.slice(0, 200)}`);
				} catch {
					continue;
				}
			}
			return null;
		}

		const parsed = tryParseQuestions(raw);
		if (parsed) {
			console.log(`✓ Parsed ${parsed.questions.length} questions from runText output`);
		} else {
			console.error(`❌ Could not parse questions from runText output`);
		}
	} catch (e) {
		console.error(`❌ runText failed: ${(e as Error).message?.slice(0, 500)}`);
	}

	// ── Step 5: Full generateQuestionsForChunk (optional) ──────────────
	const bundleId = process.env.BUNDLE_ID;
	if (bundleId) {
		console.log(`\n${SEP}`);
		console.log(`Step 5: Full generateQuestionsForChunk (bundle: ${bundleId})`);
		console.log(SEP);

		try {
			const chunks = await chunkBundle(bundleId, { force: false });
			if (chunks.length === 0) {
				console.error('❌ No chunks found for bundle');
			} else {
				const chunk = chunks[0]!;
				console.log(`  Chunk: ${chunk.id} — ${chunk.title} (${chunk.primaryFiles.join(', ')})`);
				const t0 = Date.now();
				const questions = await generateQuestionsForChunk({
					sessionId: 'test-session',
					bundleId,
					chunk
				});
				console.log(`✓ generateQuestionsForChunk ok in ${Date.now() - t0}ms`);
				console.log(`  Questions generated: ${questions.length}`);
				for (const q of questions) {
					console.log(`    - [${q.difficulty}] ${q.format}: ${q.prompt.slice(0, 80)}…`);
				}
			}
		} catch (e) {
			console.error(`❌ generateQuestionsForChunk failed: ${(e as Error).message?.slice(0, 500)}`);
		}
	} else {
		console.log(`\nSkipping Step 5 (set BUNDLE_ID env var to test full chunk generation)`);
	}

	console.log(`\n${SEP}`);
	console.log('Done.');
	console.log(SEP);
	process.exit(0);
}

main().catch((e) => {
	console.error('Fatal:', e);
	process.exit(1);
});
