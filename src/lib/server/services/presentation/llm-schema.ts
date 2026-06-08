/** Zod schema for structured LLM output during presentation generation.
 *
 * Ported from LecternExtension/src/server.ts JSON shape, restricted to the
 * slide + bullet subset. CausalClaims, graph, and layout are in Epics C/D.
 */

import { z } from 'zod';

export const BulletSchema = z.object({
	text: z.string().describe('Short heading for the bullet point.'),
	highlightLines: z
		.string()
		.describe('Comma-separated line ranges to highlight, e.g. "12-18" or "3-7,10-12".'),
	explanation: z.string().describe('One-sentence explanation of why these lines matter.')
});

export const LlmSlideSchema = z.object({
	title: z.string(),
	subtitle: z.string().optional(),
	fileFocus: z
		.string()
		.describe(
			'Repo-relative file path this slide focuses on. Empty string if multi-file summary.'
		),
	codeSnippet: z.string().describe('Representative code snippet (or empty string).'),
	folds: z
		.array(z.number().int().positive())
		.describe('Line numbers of boilerplate to fold.')
		.default([]),
	bullets: z
		.array(BulletSchema)
		.describe('Ordered bullet points, each focusing a line range in the code snippet.')
		.default([]),
	coversRanges: z
		.string()
		.describe(
			'Space-separated covers annotation ranges, e.g. "path/to/file.ts:10-20 path/to/other.ts:5".'
		)
		.default('')
});

export const LlmPresentationSchema = z.object({
	slides: z.array(LlmSlideSchema).min(1)
});

export type LlmPresentation = z.infer<typeof LlmPresentationSchema>;
export type LlmSlide = z.infer<typeof LlmSlideSchema>;
