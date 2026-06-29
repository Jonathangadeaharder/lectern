import { z } from 'zod';
import { RubricSchema } from './rubric';

export const QuestionFormatSchema = z.enum([
	'multiple_choice',
	'free_text',
	'click_lines',
	'true_false',
	'code_fix'
]);
export const QuestionTypeSchema = z.enum(['anchor', 'implication', 'cross_chunk']);
export const DifficultySchema = z.enum(['easy', 'medium', 'hard']);

export const ContextLineSchema = z.object({
	file: z.string(),
	startLine: z.number().int().nonnegative(),
	endLine: z.number().int().nonnegative()
});

const FlexibleContextLineSchema = z.preprocess((val) => {
	if (typeof val === 'number') return { file: '', startLine: val, endLine: val };
	if (typeof val === 'string') {
		const numMatch = val.match(/^(\d+)$/);
		if (numMatch) return { file: '', startLine: parseInt(numMatch[1]!), endLine: parseInt(numMatch[1]!) };
		return { file: '', startLine: 0, endLine: 0, _raw: val };
	}
	return val;
}, z.object({
	file: z.string().default(''),
	startLine: z.number().int().nonnegative().default(0),
	endLine: z.number().int().nonnegative().default(0),
	_raw: z.string().optional()
}));

export const McOptionSchema = z.preprocess((val) => {
	if (!val || typeof val !== 'object' || Array.isArray(val)) return val;
	const o = { ...(val as Record<string, unknown>) };
	if (o.correct === undefined || o.correct === null) {
		o.correct = o.isCorrect === true || false;
	}
	return o;
}, z.object({
	id: z.string(),
	text: z.string().min(1),
	correct: z.boolean().default(false),
	explanation: z.string().optional()
}));

export const ExpectedLineSchema = z.preprocess((val) => {
	if (typeof val === 'number') return { file: '', line: val };
	if (typeof val === 'string') {
		const numMatch = val.match(/^(\d+)$/);
		if (numMatch) return { file: '', line: parseInt(numMatch[1]!) };
		return { file: '', line: 0 };
	}
	return val;
}, z.object({
	file: z.string().default(''),
	line: z.number().int().nonnegative().default(0)
}));

export const QuestionSchema = z.object({
	id: z.string().default('q0'),
	chunkId: z.string().default(''),
	type: QuestionTypeSchema.default('anchor'),
	format: QuestionFormatSchema.default('multiple_choice'),
	prompt: z.string().min(1).max(2000),
	contextLines: z.array(FlexibleContextLineSchema).default([]),
	options: z.array(McOptionSchema).optional(),
	expectedLines: z.array(ExpectedLineSchema).optional(),
	correctAnswer: z.boolean().optional(),
	explanation: z.string().optional(),
	originalCode: z.string().optional(),
	expectedCode: z.string().optional(),
	rubric: RubricSchema.optional(),
	skillTags: z.array(z.string()).default([]),
	difficulty: DifficultySchema.default('medium'),
	derivedFrom: z.object({
		source: z.enum(['diff', 'memory', 'bug_catalog', 'cross_chunk']),
		refs: z.array(z.string())
	}).default({ source: 'diff', refs: [] })
});

function inferFormat(q: Record<string, unknown>): string | undefined {
	if (typeof q.format === 'string' && q.format) return q.format;
	if (Array.isArray(q.options) && q.options.length > 0) return 'multiple_choice';
	if (typeof q.correctAnswer === 'boolean') return 'true_false';
	if (typeof q.originalCode === 'string' && typeof q.expectedCode === 'string') return 'code_fix';
	if (Array.isArray(q.expectedLines) && q.expectedLines.length > 0) return 'click_lines';
	if (q.rubric && typeof q.rubric === 'object') return 'free_text';
	return undefined;
}

const QuestionInputSchema = z.preprocess((raw) => {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
	const q = { ...(raw as Record<string, unknown>) };
	if (!q.format && q.style && typeof q.style === 'string') q.format = q.style;
	delete q.style;
	const fmt = inferFormat(q);
	if (fmt) q.format = fmt;
	if (!q.type) q.type = 'anchor';
	if (!q.difficulty) q.difficulty = 'medium';
	if (!q.skillTags) q.skillTags = [];
	if (!q.contextLines) q.contextLines = [];
	if (!q.derivedFrom) q.derivedFrom = { source: 'diff', refs: [] };
	return q;
}, QuestionSchema);

export const QuestionListSchema = z.object({
	questions: z.array(QuestionInputSchema).min(1).max(8)
});

export type QuestionFormat = z.infer<typeof QuestionFormatSchema>;
export type QuestionType = z.infer<typeof QuestionTypeSchema>;
export type Difficulty = z.infer<typeof DifficultySchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type QuestionList = z.infer<typeof QuestionListSchema>;
