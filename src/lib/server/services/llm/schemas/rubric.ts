import { z } from 'zod';

export const RubricPointSchema = z.object({
	id: z.string(),
	text: z.string().min(1),
	weight: z.number().positive().default(1)
});

export const RubricDisqualifierSchema = z.object({
	id: z.string(),
	text: z.string().min(1)
});

export const RubricSchema = z.object({
	requiredPoints: z.array(RubricPointSchema).min(1),
	bonusPoints: z.array(RubricPointSchema).default([]),
	disqualifiers: z.array(RubricDisqualifierSchema).default([]),
	referenceAnswer: z.string().min(1),
	scoring: z.object({
		passThreshold: z.number().min(0).max(1).default(0.7),
		borderlineBand: z.array(z.number()).length(2).default([0.6, 0.7])
	})
});

export type Rubric = z.infer<typeof RubricSchema>;
export type RubricPoint = z.infer<typeof RubricPointSchema>;
export type RubricDisqualifier = z.infer<typeof RubricDisqualifierSchema>;
