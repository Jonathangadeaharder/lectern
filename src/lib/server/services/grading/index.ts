import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { answers, sessionQuestions } from '../../db/schema';
import { runStructured, streamStructured } from '../llm';
import { LlmAbortError, LlmSchemaError } from '../llm/errors';
import * as gradePrompt from '../llm/prompts/grade_freetext';
import {
	type GradingResult,
	GradingResultSchema,
	type Question,
	type Rubric
} from '../llm/schemas';
import { computeScore } from './score';
import { updateMasteryFromSession } from '../mastery';

export interface ClickLinesPayload {
	marked: Array<{ file: string; line: number }>;
}
export interface MultipleChoicePayload {
	selectedOptionId: string;
}
export interface FreeTextPayload {
	answer: string;
}
export interface TrueFalsePayload {
	answer: boolean;
}
export interface CodeFixPayload {
	code: string;
}
export type AnswerPayload =
	| ClickLinesPayload
	| MultipleChoicePayload
	| FreeTextPayload
	| TrueFalsePayload
	| CodeFixPayload;

export interface GradeArgs {
	sessionId: string;
	questionId: string;
	payload: AnswerPayload;
	signal?: AbortSignal;
}

// ── Free-text grading cache (Gap 6) ─────────────────────────────────────────

interface CacheEntry {
	result: GradingResult;
	expiresAt: number;
}

const gradingCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(questionId: string, answer: string): string {
	const hash = createHash('sha256')
		.update(questionId)
		.update(answer)
		.digest('hex');
	return hash;
}

function cacheGet(questionId: string, answer: string): GradingResult | null {
	const entry = gradingCache.get(cacheKey(questionId, answer));
	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		gradingCache.delete(cacheKey(questionId, answer));
		return null;
	}
	return entry.result;
}

function cachePut(questionId: string, answer: string, result: GradingResult): void {
	gradingCache.set(cacheKey(questionId, answer), {
		result,
		expiresAt: Date.now() + CACHE_TTL_MS
	});
}

export function clearGradingCache(): void {
	gradingCache.clear();
}

// ── Grade dispatch ───────────────────────────────────────────────────────────

export async function gradeAnswer(args: GradeArgs): Promise<GradingResult> {
	const { question, rubric } = loadQuestion(args.questionId);
	let final: GradingResult;

	switch (question.format) {
		case 'multiple_choice':
			final = gradeMultipleChoice(question, args.payload as MultipleChoicePayload);
			break;
		case 'click_lines':
			final = gradeClickLines(question, args.payload as ClickLinesPayload);
			break;
		case 'true_false':
			final = gradeTrueFalse(question, args.payload as TrueFalsePayload);
			break;
		case 'code_fix':
			final = gradeCodeFix(question, args.payload as CodeFixPayload);
			break;
		case 'free_text':
			if (!rubric) throw new Error(`free_text question ${question.id} has no rubric`);
			final = await gradeFreeText({
				question,
				rubric,
				answer: (args.payload as FreeTextPayload).answer,
				signal: args.signal
			});
			break;
		default:
			throw new Error(`unsupported format: ${question.format}`);
	}

	persistAnswer(args, final);
	updateMasteryFromSession(args.sessionId);
	return final;
}

export async function* streamGradeFreeText(args: {
	sessionId: string;
	questionId: string;
	answer: string;
	signal?: AbortSignal;
}): AsyncGenerator<{ partial?: Partial<GradingResult>; final?: GradingResult }> {
	const { question, rubric } = loadQuestion(args.questionId);
	if (!rubric) throw new Error(`question has no rubric: ${args.questionId}`);

	const userPrompt = gradePrompt.buildUser({
		prompt: question.prompt,
		chunkDiff: '(diff omitted in v1)',
		rubricJson: JSON.stringify(rubric),
		userAnswer: args.answer
	});

	let stream: Awaited<ReturnType<typeof streamStructured>>;
	try {
		stream = await streamStructured({
			task: 'grade_freetext',
			schema: GradingResultSchema,
			system: gradePrompt.system,
			prompt: userPrompt,
			signal: args.signal
		});
	} catch (e) {
		if (e instanceof LlmAbortError) throw e;
		stream = await streamStructured({
			task: 'grade_freetext',
			schema: GradingResultSchema,
			system: `${gradePrompt.system}\n\nOutput JSON matching the schema EXACTLY.`,
			prompt: userPrompt,
			signal: args.signal
		});
	}

	for await (const partial of stream.partialObjectStream) {
		yield { partial: partial as Partial<GradingResult> };
	}

	let llmFinal: GradingResult;
	try {
		llmFinal = (await stream.object) as GradingResult;
	} catch (e) {
		if (e instanceof LlmSchemaError) {
			llmFinal = borderlineFallback();
		} else {
			throw e;
		}
	}

	const computed = computeScore(rubric, llmFinal);
	const result: GradingResult = {
		...llmFinal,
		rawScore: computed.rawScore,
		verdict: computed.verdict,
		confidence: computed.confidence
	};

	persistAnswer(
		{ sessionId: args.sessionId, questionId: args.questionId, payload: { answer: args.answer } },
		result
	);
	updateMasteryFromSession(args.sessionId);
	yield { final: result };
}

async function gradeFreeText(args: {
	question: Question;
	rubric: Rubric;
	answer: string;
	signal?: AbortSignal;
}): Promise<GradingResult> {
	const cached = cacheGet(args.question.id, args.answer);
	if (cached) return cached;

	const userPrompt = gradePrompt.buildUser({
		prompt: args.question.prompt,
		chunkDiff: '(diff omitted in v1)',
		rubricJson: JSON.stringify(args.rubric),
		userAnswer: args.answer
	});

	let llm: GradingResult;
	try {
		llm = await runStructured({
			task: 'grade_freetext',
			schema: GradingResultSchema,
			system: gradePrompt.system,
			prompt: userPrompt,
			signal: args.signal
		});
	} catch (e) {
		if (e instanceof LlmSchemaError) {
			llm = await runStructured({
				task: 'grade_freetext',
				schema: GradingResultSchema,
				system: `${gradePrompt.system}\n\nOutput JSON matching the schema EXACTLY.`,
				prompt: userPrompt,
				signal: args.signal
			}).catch(() => borderlineFallback());
		} else {
			throw e;
		}
	}

	const computed = computeScore(args.rubric, llm);
	const result: GradingResult = {
		...llm,
		rawScore: computed.rawScore,
		verdict: computed.verdict,
		confidence: computed.confidence
	};

	cachePut(args.question.id, args.answer, result);
	return result;
}

function gradeCodeFix(question: Question, payload: CodeFixPayload): GradingResult {
	const expected = question.expectedCode ?? '';
	const original = question.originalCode ?? '';
	const submitted = payload.code;

	const normExpected = normalizeCode(expected);
	const normSubmitted = normalizeCode(submitted);

	const isCorrect = normExpected === normSubmitted;
	const similarity = codeSimilarity(normSubmitted, normExpected);

	let verdict: GradingResult['verdict'];
	let rawScore: number;
	if (isCorrect) {
		verdict = 'pass';
		rawScore = 1;
	} else if (similarity >= 0.8) {
		verdict = 'borderline';
		rawScore = similarity;
	} else {
		verdict = 'fail';
		rawScore = similarity;
	}

	const diff = computeCodeDiff(normSubmitted, normExpected);

	return {
		requiredResults: [
			{
				id: 'cf-correctness',
				met: isCorrect ? 'yes' : similarity >= 0.8 ? 'partial' : 'no',
				justification: isCorrect
					? 'Code matches expected fix.'
					: `Similarity ${(similarity * 100).toFixed(0)}%`
			}
		],
		bonusResults: [],
		disqualifierResults: [],
		rawScore,
		verdict,
		feedback: diff
			? `Differences found:\n${diff}`
			: 'Code matches expected fix.',
		confidence: isCorrect ? 1.0 : similarity >= 0.8 ? 0.7 : 0.9
	};
}

function normalizeCode(code: string): string {
	return code
		.replace(/\r\n/g, '\n')
		.replace(/[ \t]+$/gm, '')
		.replace(/\n{3,}/g, '\n\n')
		.replace(/^\n+/, '')
		.replace(/\n+$/, '');
}

function codeSimilarity(a: string, b: string): number {
	if (a === b) return 1;
	const aLines = a.split('\n');
	const bLines = b.split('\n');
	const bSet = new Set(bLines);
	const common = aLines.filter((l) => bSet.has(l)).length;
	const total = Math.max(aLines.length, bLines.length, 1);
	return common / total;
}

function computeCodeDiff(submitted: string, expected: string): string {
	const subLines = submitted.split('\n');
	const expLines = expected.split('\n');
	const expSet = new Set(expLines);
	const subSet = new Set(subLines);
	const missing = expLines.filter((l) => !subSet.has(l));
	const extra = subLines.filter((l) => !expSet.has(l));
	const parts: string[] = [];
	if (missing.length) parts.push(`Missing: ${missing.slice(0, 5).join(' | ')}`);
	if (extra.length) parts.push(`Extra: ${extra.slice(0, 5).join(' | ')}`);
	return parts.join('\n');
}

function gradeMultipleChoice(question: Question, payload: MultipleChoicePayload): GradingResult {
	const correct = (question.options ?? []).find((o) => o.correct);
	const isCorrect = correct?.id === payload.selectedOptionId;
	return {
		requiredResults: [
			{
				id: 'mc-correct',
				met: isCorrect ? 'yes' : 'no',
				justification: isCorrect ? 'Selected the correct option.' : 'Wrong option.'
			}
		],
		bonusResults: [],
		disqualifierResults: [],
		rawScore: isCorrect ? 1 : 0,
		verdict: isCorrect ? 'pass' : 'fail',
		feedback: correct?.explanation ?? (isCorrect ? 'Correct.' : 'Incorrect.'),
		confidence: 1.0
	};
}

function gradeTrueFalse(question: Question, payload: TrueFalsePayload): GradingResult {
	const isCorrect = question.correctAnswer === payload.answer;
	return {
		requiredResults: [
			{
				id: 'tf-correct',
				met: isCorrect ? 'yes' : 'no',
				justification: isCorrect ? 'Correct answer.' : 'Wrong answer.'
			}
		],
		bonusResults: [],
		disqualifierResults: [],
		rawScore: isCorrect ? 1 : 0,
		verdict: isCorrect ? 'pass' : 'fail',
		feedback: question.explanation ?? (isCorrect ? 'Correct.' : 'Incorrect.')
	};
}

function gradeClickLines(question: Question, payload: ClickLinesPayload): GradingResult {
	const expected = (question.expectedLines ?? []).map((l) => `${l.file}:${l.line}`);
	const expectedSet = new Set(expected);
	const marked = payload.marked.map((l) => `${l.file}:${l.line}`);
	const markedSet = new Set(marked);

	const tp = expected.filter((e) => markedSet.has(e)).length;
	const precision = markedSet.size > 0 ? tp / markedSet.size : 0;
	const recall = expectedSet.size > 0 ? tp / expectedSet.size : 0;
	const raw = 0.5 * precision + 0.5 * recall;

	const verdict: GradingResult['verdict'] =
		raw >= 0.8 ? 'pass' : raw >= 0.5 ? 'borderline' : 'fail';
	const missed = expected.filter((e) => !markedSet.has(e));
	const wrong = marked.filter((m) => !expectedSet.has(m));

	return {
		requiredResults: [
			{
				id: 'cl-precision',
				met: precision >= 0.8 ? 'yes' : precision >= 0.5 ? 'partial' : 'no',
				justification: `precision ${precision.toFixed(2)} (${tp} of ${markedSet.size} marked correct)`
			},
			{
				id: 'cl-recall',
				met: recall >= 0.8 ? 'yes' : recall >= 0.5 ? 'partial' : 'no',
				justification: `recall ${recall.toFixed(2)} (${tp} of ${expectedSet.size} expected found)`
			}
		],
		bonusResults: [],
		disqualifierResults: [],
		rawScore: raw,
		verdict,
		feedback: [
			`Score: ${raw.toFixed(2)}`,
			missed.length ? `Missed: ${missed.join(', ')}` : null,
			wrong.length ? `Extra: ${wrong.join(', ')}` : null
		]
			.filter(Boolean)
			.join(' • '),
		confidence: verdict === 'borderline' ? 0.8 : 1.0
	};
}

function borderlineFallback(): GradingResult {
	return {
		requiredResults: [],
		bonusResults: [],
		disqualifierResults: [],
		rawScore: 0.6,
		verdict: 'borderline',
		feedback: 'Grader output unstable; treating as borderline.',
		confidence: 0.3
	};
}

function loadQuestion(questionId: string): { question: Question; rubric: Rubric | null } {
	const db = getDb();
	const row = db.select().from(sessionQuestions).where(eq(sessionQuestions.id, questionId)).get();
	if (!row) throw new Error(`question not found: ${questionId}`);
	const question = JSON.parse(row.promptJson) as Question;
	const rubric = row.rubricJson ? (JSON.parse(row.rubricJson) as Rubric) : null;
	return { question, rubric };
}

function persistAnswer(
	args: { sessionId: string; questionId: string; payload: AnswerPayload },
	result: GradingResult
): void {
	const db = getDb();
	const now = Date.now();
	db.transaction((tx) => {
		tx.insert(answers)
			.values({
				id: randomUUID(),
				sessionId: args.sessionId,
				questionId: args.questionId,
				format: 'unknown',
				payloadJson: JSON.stringify(args.payload),
				gradingJson: JSON.stringify(result),
				rawScore: result.rawScore,
				verdict: result.verdict,
				submittedAt: now,
				gradedAt: now
			})
			.run();

		tx.update(sessionQuestions)
			.set({ status: 'graded', submittedAt: now, gradedAt: now })
			.where(eq(sessionQuestions.id, args.questionId))
			.run();
	});
}

export type { GradingResult } from '../llm/schemas';
