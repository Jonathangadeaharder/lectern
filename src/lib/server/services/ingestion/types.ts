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
