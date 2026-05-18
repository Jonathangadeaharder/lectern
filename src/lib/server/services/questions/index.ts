import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { sessionQuestions } from '../../db/schema';
import type { Chunk } from '../chunking';
import { getBundlePath } from '../ingestion';
import { readBundleEntry } from '../ingestion/bundle';
import { runStructured, runText } from '../llm';
import { LlmProviderError, LlmSchemaError } from '../llm/errors';
import * as prompt from '../llm/prompts/generate_questions';
import { type Question, QuestionListSchema } from '../llm/schemas';

const FILE_SAMPLE_LINES = 60;
const MAX_FILE_SAMPLE_BYTES = 8000;
const SIMILARITY_THRESHOLD = 0.7;

function tryParseQuestions(raw: string): { questions: Question[] } | null {
	const candidates = [raw];
	const jsonMatch = raw.match(/\{[\s\S]*"questions"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
	if (jsonMatch) candidates.unshift(jsonMatch[0]!);
	const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (fenceMatch) candidates.unshift(fenceMatch[1]!.trim());
	for (const candidate of candidates) {
		try {
			const parsed = JSON.parse(candidate);
			const validated = QuestionListSchema.safeParse(parsed);
			if (validated.success) return validated.data;
			console.warn(`[questions] schema validation failed: ${JSON.stringify(validated.error.issues.slice(0, 3).map(i => ({ path: i.path.join('.'), message: i.message })))}`);
		} catch (e) {
			continue;
		}
	}
	return null;
}

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
	const jsonInstruction = `${userPrompt}\n\nOutput ONLY valid JSON matching: { "questions": [...] }`;

	let result: { questions: Question[] } | null = null;

	try {
		const raw = await runText({
			task: 'generate_questions',
			system: prompt.system,
			prompt: jsonInstruction
		});
		console.log(`[questions] runText returned ${raw.length} chars for chunk ${chunk.id}`);
		const parsed = tryParseQuestions(raw);
		if (parsed) {
			result = parsed;
			console.log(`[questions] runText parsed OK: ${parsed.questions.length} questions for chunk ${chunk.id}`);
		} else {
			console.warn(`[questions] runText output could not be parsed for chunk ${chunk.id}: ${raw.slice(0, 500)}`);
		}
	} catch (e) {
		console.warn(`[questions] runText failed for chunk ${chunk.id}: ${(e as Error).message?.slice(0, 300)}`);
	}

	if (!result) {
		try {
			result = await runStructured({
				task: 'generate_questions',
				schema: QuestionListSchema,
				system: prompt.system,
				prompt: jsonInstruction,
				maxRetries: 1
			});
		} catch (e) {
			console.warn(`[questions] runStructured failed for chunk ${chunk.id}: ${(e as Error).message?.slice(0, 300)}`);
		}
	}

	if (!result) {
		throw new Error(`Failed to generate questions for chunk ${chunk.id} after all attempts`);
	}

	let deduped = deduplicateQuestions(result.questions);

	if (!hasAcceptableDifficulty(deduped)) {
		console.warn('[questions] difficulty distribution poor; retrying with emphasis');
		const retryPrompt =
			jsonInstruction +
			'\n\nIMPORTANT: Ensure a mix of difficulties: ~30% easy, ~50% medium, ~20% hard. At least 1 easy and 1 hard if 5+ questions.';
		try {
			const raw = await runText({
				task: 'generate_questions',
				system: prompt.system,
				prompt: retryPrompt
			});
			const retryParsed = tryParseQuestions(raw);
			if (retryParsed) {
				const retryDeduped = deduplicateQuestions(retryParsed.questions);
				if (hasAcceptableDifficulty(retryDeduped)) {
					deduped = retryDeduped;
				}
			}
		} catch {
			// keep original set if retry fails
		}
	}

	persistQuestions(sessionId, chunk.id, deduped);
	console.log(`[questions] persisted ${deduped.length} questions for chunk ${chunk.id}`);
	return deduped;
}

export interface GenerateCrossChunkInput {
	sessionId: string;
	bundleId: string;
	chunks: Chunk[];
}

export async function generateCrossChunkQuestion(input: GenerateCrossChunkInput): Promise<Question | null> {
	const { sessionId, bundleId, chunks } = input;

	if (chunks.length < 2) return null;

	const related = selectRelatedChunks(chunks);
	if (related.length < 2) return null;

	const chunkSummaries = related.map((c) => ({
		chunkId: c.id,
		title: c.title || 'Untitled chunk',
		rationale: c.rationale || '',
		files: c.primaryFiles,
		diff: chunkDiff(c).slice(0, 500)
	}));

	const userPrompt = [
		'# Related Chunks',
		'',
		...chunkSummaries.map(
			(s) =>
				`## Chunk: ${s.title} (id: ${s.chunkId})\nFiles: ${s.files.join(', ')}\nRationale: ${s.rationale}\nDiff excerpt:\n\`\`\`diff\n${s.diff}\n\`\`\``
		),
		'',
		'Generate 1 cross-chunk question that tests understanding of how these chunks interact. Return JSON: { "questions": [...] }.'
	].join('\n');

	try {
		const result = await runStructured({
			task: 'generate_questions',
			schema: QuestionListSchema,
			system: prompt.CROSS_CHUNK_SYSTEM,
			prompt: userPrompt
		});

		if (result.questions.length === 0) return null;

		const q = result.questions[0]!;
		q.type = 'cross_chunk';
		q.difficulty = 'hard';
		q.derivedFrom = { source: 'cross_chunk' as const, refs: related.map((c) => c.id) };

		persistQuestions(sessionId, related[0]!.id, [q]);
		return q;
	} catch {
		return null;
	}
}

function selectRelatedChunks(chunks: Chunk[]): Chunk[] {
	const scored: Array<{ chunk: Chunk; score: number }> = [];

	for (const chunk of chunks) {
		let score = 0;
		for (const other of chunks) {
			if (chunk === other) continue;
			const sharedDirs = countSharedDirectories(chunk.primaryFiles, other.primaryFiles);
			score += sharedDirs;
			const sharedTags = countSharedTags(chunk, other);
			score += sharedTags * 2;
		}
		scored.push({ chunk, score });
	}

	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, Math.min(3, chunks.length)).map((s) => s.chunk);
}

function countSharedDirectories(filesA: string[], filesB: string[]): number {
	const dirsA = new Set(filesA.map((f) => f.split('/').slice(0, -1).join('/')));
	const dirsB = new Set(filesB.map((f) => f.split('/').slice(0, -1).join('/')));
	let count = 0;
	for (const d of dirsA) {
		if (dirsB.has(d)) count++;
	}
	return count;
}

function countSharedTags(a: Chunk, b: Chunk): number {
	const tagsA = new Set(a.tags ?? []);
	const tagsB = new Set(b.tags ?? []);
	let count = 0;
	for (const t of tagsA) {
		if (tagsB.has(t)) count++;
	}
	return count;
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

function hasAcceptableDifficulty(questions: Question[]): boolean {
	if (questions.length < 2) return true;
	const counts = { easy: 0, medium: 0, hard: 0 };
	for (const q of questions) counts[q.difficulty]++;
	const total = questions.length;
	const easyRatio = counts.easy / total;
	const hardRatio = counts.hard / total;
	const mediumRatio = counts.medium / total;
	if (total >= 5 && (counts.easy === 0 || counts.hard === 0)) return false;
	if (easyRatio > 0.5 || hardRatio > 0.5) return false;
	if (mediumRatio < 0.2 && total >= 3) return false;
	return true;
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
					id: randomUUID(),
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
