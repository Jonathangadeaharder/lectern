import { eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { sessionQuestions } from '../../db/schema';
import type { Chunk } from '../chunking';
import { getBundlePath } from '../ingestion';
import { readBundleEntry } from '../ingestion/bundle';
import { runStructured } from '../llm';
import { LlmSchemaError } from '../llm/errors';
import * as prompt from '../llm/prompts/generate_questions';
import { type Question, QuestionListSchema } from '../llm/schemas';

const FILE_SAMPLE_LINES = 60;
const MAX_FILE_SAMPLE_BYTES = 8000;
const SIMILARITY_THRESHOLD = 0.7;

export interface GenerateForChunkInput {
	sessionId: string;
	bundleId: string;
	chunk: Chunk;
	weakTags?: string[];
}

export async function generateQuestionsForChunk(input: GenerateForChunkInput): Promise<Question[]> {
	const { sessionId, bundleId, chunk, weakTags } = input;

	const headSamples = await collectHeadSamples(bundleId, chunk);
	const promptInput = {
		chunkId: chunk.id,
		chunkTitle: chunk.title || 'Untitled chunk',
		chunkRationale: chunk.rationale || 'No rationale generated.',
		files: chunk.primaryFiles,
		diff: chunkDiff(chunk),
		headFileSamples: headSamples,
		weakTagsHint: weakTags
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
			result = await runStructured({
				task: 'generate_questions',
				schema: QuestionListSchema,
				system: `${prompt.system}\n\nYour previous output failed schema validation. Output JSON that matches the schema EXACTLY.`,
				prompt: userPrompt
			});
		} else {
			throw e;
		}
	}

	const deduped = deduplicateQuestions(result.questions);
	persistQuestions(sessionId, chunk.id, deduped);
	return deduped;
}

function deduplicateQuestions(questions: Question[]): Question[] {
	const seen: Question[] = [];
	for (const q of questions) {
		const isDuplicate = seen.some((existing) => areSimilarQuestions(existing, q));
		if (!isDuplicate) {
			seen.push(q);
		}
	}
	return seen;
}

function areSimilarQuestions(a: Question, b: Question): boolean {
	if (a.format !== b.format) return false;
	if (a.chunkId !== b.chunkId) return false;

	const aWords = tokenize(a.prompt);
	const bWords = tokenize(b.prompt);
	const intersection = [...aWords].filter((w) => bWords.has(w));
	const union = new Set([...aWords, ...bWords]);
	const jaccard = union.size > 0 ? intersection.length / union.size : 0;

	return jaccard >= SIMILARITY_THRESHOLD;
}

function tokenize(text: string): Set<string> {
	return new Set(
		text
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, '')
			.split(/\s+/)
			.filter((w) => w.length > 2)
	);
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
