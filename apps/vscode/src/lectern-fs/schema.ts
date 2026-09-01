/** Single zod source of truth for every file shape under ~/.lectern/.
 * Consumed by the SvelteKit loader (Phase B) and the VS Code extension
 * (Phase D). Bump FORMAT_VERSION whenever any of these shapes changes
 * incompatibly; consumers refuse to read mismatched files.
 */

import { z } from 'zod';

export const FORMAT_VERSION = '1';

export const SlideKindSchema = z.enum([
	'tldr',
	'risk',
	'decision',
	'implementation',
	'test',
	'open_question',
	'appendix'
]);
export const SlideSeveritySchema = z.enum(['critical', 'attention', 'info']);
export const FindingSeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export const FindingStanceSchema = z.enum(['bug', 'suggestion', 'question', 'praise']);

export const SourceRangeSchema = z.object({
	path: z.string(),
	start: z.number().int().nonnegative(),
	end: z.number().int().nonnegative()
});

export const MetaSchema = z.object({
	version: z.literal(FORMAT_VERSION),
	repoPath: z.string(),
	prRef: z.string(),
	title: z.string(),
	branch: z.string().optional(),
	baseBranch: z.string().optional(),
	author: z.string().optional(),
	baseSha: z.string().regex(/^[0-9a-f]{40}$/).optional(),
	headSha: z.string().regex(/^[0-9a-f]{40}$/).optional(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
	decks: z
		.object({
			high: z.number().int(),
			mid: z.number().int(),
			low: z.number().int()
		})
		.default({ high: 0, mid: 0, low: 0 })
});

/** The frontmatter half of a slide file. Body markdown is parsed separately. */
export const SlideFrontmatterSchema = z.object({
	position: z.number().int().nonnegative(),
	kind: SlideKindSchema,
	severity: SlideSeveritySchema,
	callout: z.string().default(''),
	covers: z.array(SourceRangeSchema).default([]),
	verbatimRanges: z.array(SourceRangeSchema).default([]),
	folds: z.array(z.number().int().nonnegative()).default([])
});

// Question schema re-exported from the existing LLM schemas module so the
// on-disk question.json format is byte-identical to what the (now-deleted)
// generator emitted. The source file is pure zod with no server-only side
// effects, so SvelteKit's $lib/server boundary is not crossed at runtime.
export {
	QuestionSchema,
	QuestionFormatSchema,
	McOptionSchema,
	ExpectedLineSchema,
	ContextLineSchema,
	DifficultySchema,
	QuestionTypeSchema
} from './question-schema';

export const FindingSchema = z.object({
	findingId: z.string(),
	severity: FindingSeveritySchema,
	path: z.string(),
	line: z.number().int().positive(),
	ruleId: z.string().optional(),
	title: z.string(),
	message: z.string(),
	citations: z.array(z.string()).default([]),
	stance: FindingStanceSchema
});

export const ReviewSummarySchema = z.object({
	counts: z.object({
		critical: z.number().int(),
		high: z.number().int(),
		medium: z.number().int(),
		low: z.number().int(),
		info: z.number().int()
	}),
	filesTouched: z.number().int(),
	findingsCount: z.number().int(),
	summary: z.string().default('')
});

export const QuizAnswerFileSchema = z.object({
	questionId: z.string(),
	submittedAt: z.string().datetime(),
	answer: z.unknown(), // format-specific, validated downstream
	correct: z.boolean().optional() // self-evaluated when expectedLines is present
});

export const SessionStateSchema = z.object({
	version: z.literal(FORMAT_VERSION),
	openedAt: z.string().datetime(),
	currentView: z.enum(['slides', 'quiz', 'review', 'diff']),
	currentSlide: z.number().int().nonnegative().default(0),
	currentQuestion: z.string().nullable().default(null),
	quizCursor: z
		.object({
			answered: z.array(z.string()),
			skipped: z.array(z.string())
		})
		.default({ answered: [], skipped: [] }),
	lastSkillInvocation: z.string().datetime().optional(),
	diffFilters: z.record(z.string(), z.boolean()).default({}),
	diffFileOverrides: z.array(z.string()).default([]),
	diffSearch: z
		.object({
			pattern: z.string().default(''),
			kind: z.enum(['glob', 'regex']).default('glob')
		})
		.default({ pattern: '', kind: 'glob' }),
	diffCollapsedFiles: z.array(z.string()).default([])
});

export const LogEntrySchema = z
	.object({
		t: z.string().datetime(),
		by: z.enum(['skill', 'extension', 'user', 'cli']),
		ev: z.string()
	})
	.passthrough(); // additional fields per event type — kept loose intentionally

export type SourceRange = z.infer<typeof SourceRangeSchema>;
export type Meta = z.infer<typeof MetaSchema>;
export type SlideFrontmatter = z.infer<typeof SlideFrontmatterSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type ReviewSummary = z.infer<typeof ReviewSummarySchema>;
export type QuizAnswerFile = z.infer<typeof QuizAnswerFileSchema>;
export type SessionState = z.infer<typeof SessionStateSchema>;
export type LogEntry = z.infer<typeof LogEntrySchema>;
