import { z } from 'zod';
import { RubricSchema } from './rubric';

export const QuestionFormatSchema = z.enum(['multiple_choice', 'free_text', 'click_lines']);
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
	rubric: RubricSchema.optional(),
	skillTags: z.array(z.string()),
	difficulty: DifficultySchema.default('medium'),
	derivedFrom: z.object({
		source: z.enum(['diff', 'memory', 'bug_catalog']),
		refs: z.array(z.string())
	})
});

export const QuestionListSchema = z.object({
	questions: z.array(QuestionSchema).min(1).max(6)
});

export type QuestionFormat = z.infer<typeof QuestionFormatSchema>;
export type QuestionType = z.infer<typeof QuestionTypeSchema>;
export type Difficulty = z.infer<typeof DifficultySchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type QuestionList = z.infer<typeof QuestionListSchema>;
