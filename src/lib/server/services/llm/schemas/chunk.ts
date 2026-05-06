import { z } from 'zod';

export const ChunkTitleSchema = z.object({
	chunkId: z.string(),
	title: z.string().min(1).max(60),
	rationale: z.string().min(1).max(200)
});

export const ChunkTitleListSchema = z.object({
	titles: z.array(ChunkTitleSchema).min(1)
});

export type ChunkTitle = z.infer<typeof ChunkTitleSchema>;
export type ChunkTitleList = z.infer<typeof ChunkTitleListSchema>;
