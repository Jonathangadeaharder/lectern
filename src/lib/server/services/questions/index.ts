import { eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { sessionQuestions } from '../../db/schema';
import { runStructured } from '../llm';
import { LlmSchemaError } from '../llm/errors';
import { QuestionListSchema, type Question } from '../llm/schemas';
import * as prompt from '../llm/prompts/generate_questions';
import type { Chunk } from '../chunking';
import { readBundleEntry } from '../ingestion/bundle';
import { getBundlePath } from '../ingestion';

const FILE_SAMPLE_LINES = 60;
const MAX_FILE_SAMPLE_BYTES = 8000;

export interface GenerateForChunkInput {
	sessionId: string;
	bundleId: string;
	chunk: Chunk;
}

export async function generateQuestionsForChunk(input: GenerateForChunkInput): Promise<Question[]> {
	const { sessionId, bundleId, chunk } = input;

	const headSamples = await collectHeadSamples(bundleId, chunk);
	const promptInput = {
		chunkId: chunk.id,
		chunkTitle: chunk.title || 'Untitled chunk',
		chunkRationale: chunk.rationale || 'No rationale generated.',
		files: chunk.primaryFiles,
		diff: chunkDiff(chunk),
		headFileSamples: headSamples
	};

	const userPrompt = prompt.buildUser(promptInput);

	let result: { questions: Question[] };
	try {
		result = await runStructured({
			task: 'generate_questions',
			schema: QuestionListSchema,
			system: prompt.system,
			prompt: userPrompt
		});
	} catch (e) {
		if (e instanceof LlmSchemaError) {
			// Retry once with stricter system prompt.
			result = await runStructured({
				task: 'generate_questions',
				schema: QuestionListSchema,
				system:
					prompt.system +
					'\n\nYour previous output failed schema validation. Output JSON that matches the schema EXACTLY.',
				prompt: userPrompt
			});
		} else {
			throw e;
		}
	}

	persistQuestions(sessionId, chunk.id, result.questions);
	return result.questions;
}

function chunkDiff(chunk: Chunk): string {
	const parts: string[] = [];
	for (const h of chunk.hunks) {
		parts.push(`--- ${h.file}`);
		parts.push(`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`);
		for (const l of h.lines.slice(0, 80)) {
			const sign = l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' ';
			parts.push(`${sign}${l.content}`);
		}
		if (h.lines.length > 80) parts.push('… (truncated)');
	}
	return parts.join('\n');
}

async function collectHeadSamples(
	bundleId: string,
	chunk: Chunk
): Promise<Array<{ file: string; content: string }>> {
	const bundleFile = await getBundlePath(bundleId);
	if (!bundleFile) return [];

	const samples: Array<{ file: string; content: string }> = [];
	for (const file of chunk.primaryFiles.slice(0, 3)) {
		const buf = await readBundleEntry(bundleFile, `files/head/${file}`);
		if (!buf) continue;
		const content = buf.toString('utf8').slice(0, MAX_FILE_SAMPLE_BYTES);
		const lines = content.split('\n').slice(0, FILE_SAMPLE_LINES).join('\n');
		samples.push({ file, content: lines });
	}
	return samples;
}

function persistQuestions(sessionId: string, chunkId: string, questions: Question[]): void {
	const db = getDb();
	db.transaction((tx) => {
		// Idempotent regen: wipe prior questions for THIS chunk only.
		const existing = tx
			.select()
			.from(sessionQuestions)
			.where(eq(sessionQuestions.sessionId, sessionId))
			.all()
			.filter((r) => r.chunkId === chunkId);
		for (const r of existing) {
			tx.delete(sessionQuestions).where(eq(sessionQuestions.id, r.id)).run();
		}

		let pos = 0;
		for (const q of questions) {
			tx.insert(sessionQuestions)
				.values({
					id: q.id,
					sessionId,
					chunkId,
					position: pos++,
					format: q.format,
					type: q.type,
					promptJson: JSON.stringify(q),
					rubricJson: q.rubric ? JSON.stringify(q.rubric) : null,
					skillTagsJson: JSON.stringify(q.skillTags ?? []),
					difficulty: q.difficulty,
					derivedFromJson: JSON.stringify(q.derivedFrom),
					promptVersion: prompt.PROMPT_VERSION,
					status: 'pending'
				})
				.run();
		}
	});
}

export type { Question };
