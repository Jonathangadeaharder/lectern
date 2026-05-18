import { z } from 'zod';

export interface PrMetadata {
	title: string;
	body: string;
	author: string;
	state: 'open' | 'closed' | 'merged' | 'draft';
	headSha: string;
	baseSha: string;
	headRef: string;
	baseRef: string;
	createdAt: string;
	updatedAt: string;
}

export interface PrCommit {
	sha: string;
	message: string;
	author: string;
	date: string;
}

export interface BundleFileEntry {
	path: string;
	baseSize: number;
	headSize: number;
	binary: boolean;
	renamed?: { from: string };
}

export interface BundleManifest {
	formatVersion: '1';
	source: {
		url: string;
		platform: 'github' | 'gitlab';
		host: string;
		owner: string;
		repo: string;
		prNumber: number;
		fetchedAt: number;
	};
	headSha: string;
	baseSha: string;
	files: BundleFileEntry[];
}

export const BundleManifestSchema = z.object({
	formatVersion: z.literal('1'),
	source: z.object({
		url: z.string().url(),
		platform: z.enum(['github', 'gitlab']),
		host: z.string().min(1),
		owner: z.string().min(1),
		repo: z.string().min(1),
		prNumber: z.number().int().positive(),
		fetchedAt: z.number().int().positive()
	}),
	headSha: z.string().min(1),
	baseSha: z.string().min(1),
	files: z.array(
		z.object({
			path: z.string().min(1),
			baseSize: z.number().int().nonnegative(),
			headSize: z.number().int().nonnegative(),
			binary: z.boolean(),
			renamed: z.object({ from: z.string() }).optional()
		})
	)
});

export function validateBundleManifest(data: unknown): BundleManifest {
	return BundleManifestSchema.parse(data);
}

export interface IngestProgressEvent {
	step: 'metadata' | 'diff' | 'commits' | 'files' | 'packaging' | 'done' | 'error';
	filesDone?: number;
	filesTotal?: number;
	bytesFetched?: number;
	bundleId?: string;
	kind?: string;
	message?: string;
}

export interface PlatformClient {
	fetchMetadata(parsed: ParsedPrUrl, signal?: AbortSignal): Promise<PrMetadata>;
	fetchDiff(parsed: ParsedPrUrl, signal?: AbortSignal): Promise<string>;
	fetchCommits(parsed: ParsedPrUrl, signal?: AbortSignal): Promise<PrCommit[]>;
	fetchFile(
		parsed: ParsedPrUrl,
		path: string,
		ref: string,
		signal?: AbortSignal
	): Promise<{ content: Buffer; size: number } | null>;
}

import type { ParsedPrUrl } from './url';
