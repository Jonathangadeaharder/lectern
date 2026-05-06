import { z } from 'zod';

export const PointResultSchema = z.object({
	id: z.string(),
	met: z.enum(['yes', 'partial', 'no']),
	justification: z.string().min(1)
});

export const DisqualifierResultSchema = z.object({
	id: z.string(),
	triggered: z.boolean(),
	justification: z.string().min(1)
});

export const VerdictSchema = z.enum(['pass', 'fail', 'borderline', 'review_needed']);

export const GradingResultSchema = z.object({
	requiredResults: z.array(PointResultSchema),
	bonusResults: z.array(PointResultSchema).default([]),
	disqualifierResults: z.array(DisqualifierResultSchema).default([]),
	rawScore: z.number().min(0).max(1),
	verdict: VerdictSchema,
	feedback: z.string().min(1)
});

export type Verdict = z.infer<typeof VerdictSchema>;
export type GradingResult = z.infer<typeof GradingResultSchema>;
export type PointResult = z.infer<typeof PointResultSchema>;
export type DisqualifierResult = z.infer<typeof DisqualifierResultSchema>;
