import { z } from 'zod';
import { RubricSchema } from './rubric-schema';

export const QuestionFormatSchema = z.enum([
	'multiple_choice',
	'click_lines',
	'true_false',
	'code_fix',
	'spot_the_bug',
	'fill_the_hunk'
]);

export const HunkCandidateSchema = z.object({
	id: z.string(),
	code: z.string().min(1),
	correct: z.boolean().default(false),
	misconception: z.string().optional()
});

export const GapLineSchema = z.object({
	startLine: z.number().int().positive(),
	endLine: z.number().int().positive()
});
export const MutationKindSchema = z.enum([
	'off_by_one',
	'wrong_comparison',
	'swapped_args',
	'dropped_check',
	'wrong_resource_release',
	'no_bug'
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
	explanation: z.string().optional(),
	misconception: z.string().optional()
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
	prompt: z.string().min(15).max(1500),
	contextLines: z.array(FlexibleContextLineSchema).default([]),
	options: z.array(McOptionSchema).optional(),
	expectedLines: z.array(ExpectedLineSchema).optional(),
	correctAnswer: z.boolean().optional(),
	explanation: z.string().optional(),
	originalCode: z.string().optional(),
	expectedCode: z.string().optional(),
	mutationKind: MutationKindSchema.optional(),
	candidates: z.array(HunkCandidateSchema).optional(),
	gapLine: GapLineSchema.optional(),
	rubric: RubricSchema.optional(),
	skillTags: z.array(z.string()).default([]),
	difficulty: DifficultySchema,
	derivedFrom: z.object({
		source: z.enum(['diff', 'memory', 'bug_catalog', 'cross_chunk']),
		refs: z.array(z.string())
	}).default({ source: 'diff', refs: [] })
}).superRefine((q, ctx) => {
	if (q.format === 'multiple_choice') {
		const opts = q.options ?? [];
		if (opts.length > 4) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'multiple_choice options capped at 4' });
		}
		const wrongWithMisconception = opts.filter(
			(o) => !o.correct && typeof o.misconception === 'string' && o.misconception.trim().length > 0
		);
		if (wrongWithMisconception.length < 1) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'multiple_choice requires >=1 wrong option with a non-empty misconception'
			});
		}
	}
	if (q.format === 'fill_the_hunk') {
		if (!q.candidates || q.candidates.length !== 3) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'fill_the_hunk requires exactly 3 candidates' });
			return;
		}
		const correct = q.candidates.filter((c) => c.correct).length;
		if (correct !== 1) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'fill_the_hunk requires exactly one correct candidate' });
		}
		if (!q.originalCode) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'fill_the_hunk requires originalCode' });
		}
		if (!q.gapLine) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'fill_the_hunk requires gapLine' });
		}
	}
});

function inferFormat(q: Record<string, unknown>): string | undefined {
	if (typeof q.format === 'string' && q.format) return q.format;
	if (Array.isArray(q.candidates) && q.candidates.length > 0) return 'fill_the_hunk';
	if (typeof q.mutationKind === 'string') return 'spot_the_bug';
	if (Array.isArray(q.options) && q.options.length > 0) return 'multiple_choice';
	if (typeof q.correctAnswer === 'boolean') return 'true_false';
	if (typeof q.originalCode === 'string' && typeof q.expectedCode === 'string') return 'code_fix';
	if (Array.isArray(q.expectedLines) && q.expectedLines.length > 0) return 'click_lines';
	return undefined;
}

const FORMAT_VALUES = new Set<string>(QuestionFormatSchema.options);
const TYPE_VALUES = new Set<string>(QuestionTypeSchema.options);

const QuestionInputSchema = z.preprocess((raw) => {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
	const q = { ...(raw as Record<string, unknown>) };

	// Models often emit `type: "multiple_choice"` (a format) instead of
	// `type: "anchor"`. Detect that and move the value to `format`.
	if (typeof q.type === 'string' && FORMAT_VALUES.has(q.type as string)) {
		if (!q.format) q.format = q.type;
		q.type = undefined;
	}

	// Aliases observed in real LLM output for the `type` field.
	for (const alias of ['kind', 'subtype', 'anchorType', 'questionType'] as const) {
		const v = q[alias];
		if (typeof v === 'string') {
			if (!q.type && TYPE_VALUES.has(v as string)) q.type = v;
			delete q[alias];
		}
	}

	// `style` is the documented alias for format.
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

// Per-item parsing tolerant of MC misconception/options-cap failures:
// invalid items are silently dropped from the array instead of failing the
// whole list.
const QuestionItemTolerant = z.unknown().transform((raw) => {
	const parsed = QuestionInputSchema.safeParse(raw);
	return parsed.success ? parsed.data : undefined;
});

export const QuestionListSchema = z.object({
	questions: z
		.array(QuestionItemTolerant)
		.transform((arr) => arr.filter((q): q is z.infer<typeof QuestionInputSchema> => Boolean(q)))
		.pipe(z.array(QuestionSchema).min(1).max(6))
});

export type QuestionFormat = z.infer<typeof QuestionFormatSchema>;
export type QuestionType = z.infer<typeof QuestionTypeSchema>;
export type Difficulty = z.infer<typeof DifficultySchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type QuestionList = z.infer<typeof QuestionListSchema>;
