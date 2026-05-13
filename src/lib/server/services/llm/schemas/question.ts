import { z } from 'zod';
import { RubricSchema } from './rubric';

export const QuestionFormatSchema = z.enum([
	'multiple_choice',
	'free_text',
	'click_lines',
	'true_false',
	'code_fix'
]);
export const QuestionTypeSchema = z.enum(['anchor', 'implication']);
export const DifficultySchema = z.enum(['easy', 'medium', 'hard']);

export const ContextLineSchema = z.object({
	file: z.string(),
	startLine: z.number().int().nonnegative(),
	endLine: z.number().int().nonnegative()
});

export const McOptionSchema = z.object({
	id: z.string(),
	text: z.string().min(1),
	correct: z.boolean(),
	explanation: z.string().optional()
});

export const ExpectedLineSchema = z.object({
	file: z.string(),
	line: z.number().int().nonnegative()
});

export const QuestionSchema = z.object({
	id: z.string(),
	chunkId: z.string(),
	type: QuestionTypeSchema,
	format: QuestionFormatSchema,
	prompt: z.string().min(10).max(800),
	contextLines: z.array(ContextLineSchema),
	options: z.array(McOptionSchema).optional(),
	expectedLines: z.array(ExpectedLineSchema).optional(),
	correctAnswer: z.boolean().optional(),
	explanation: z.string().optional(),
	originalCode: z.string().optional(),
	expectedCode: z.string().optional(),
	rubric: RubricSchema.optional(),
	skillTags: z.array(z.string()),
	difficulty: DifficultySchema.default('medium'),
	derivedFrom: z.object({
		source: z.enum(['diff', 'memory', 'bug_catalog']),
		refs: z.array(z.string())
	})
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
	const fmt = inferFormat(q);
	if (fmt) q.format = fmt;
	return q;
}, QuestionSchema);

export const QuestionListSchema = z.object({
	questions: z.array(QuestionInputSchema).min(1).max(6)
});

export type QuestionFormat = z.infer<typeof QuestionFormatSchema>;
export type QuestionType = z.infer<typeof QuestionTypeSchema>;
export type Difficulty = z.infer<typeof DifficultySchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type QuestionList = z.infer<typeof QuestionListSchema>;
