import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../../db';
import { bugCommits, bugPatterns } from '../../db/schema';
import type { ConventionSource } from '../repo_memory';

const BUG_FIX_PATTERNS = [
	/\bfix(es|ed)?\b/i,
	/\bbug\s*fix/i,
	/\bpatch\b/i,
	/\bhotfix\b/i,
	/\bresolve[ds]?\b/i,
	/\bcorrect(s|ed)?\b/i,
	/\brepair(s|ed)?\b/i,
	/\baddress(es|ed)?\b/i,
	/\bworkaround\b/i,
	/\bcrash(es|ed)?\b/i,
	/\bregression\b/i,
	/\bnull\s*pointer\b/i,
	/\bsegfault\b/i,
	/\bmemory\s*leak\b/i,
	/\brace\s*condition\b/i,
	/\boff[\s-]?by[\s-]?one\b/i,
	/\btype\s*error\b/i,
	/\bindex\s*out\s*of\s*bound/i
];

const REFACTOR_PATTERNS = [
	/\brefactor(s|ed|ing)?\b/i,
	/\brename[ds]?\b/i,
	/\bmove[ds]?\b/i,
	/\breorganize[ds]?\b/i,
	/\bclean(s|ed)?\s*up\b/i,
	/\bextract(s|ed)?\b/i,
	/\binline[ds]?\b/i,
	/\bformat(ting|ted)?\b/i,
	/\bstyle\b/i,
	/\bwhitespace\b/i,
	/\btypo\b/i,
	/\bcomment(s|ed)?\b/i
];

export interface BugCommitRow {
	id: string;
	repoSlug: string;
	sha: string;
	message: string;
	isBugFix: boolean;
	isRefactor: boolean;
	blameSha: string | null;
	patternId: string | null;
	analyzedAt: number;
}

export interface BugPatternRow {
	id: string;
	repoSlug: string;
	summary: string;
	rootCause: string | null;
	fixPattern: string | null;
	fileGlobsJson: string;
	frequency: number;
	confidence: number;
	lastSeenAt: number;
	createdAt: number;
}

export function isBugFixMessage(message: string): boolean {
	return BUG_FIX_PATTERNS.some((p) => p.test(message));
}

export function isRefactorMessage(message: string): boolean {
	return REFACTOR_PATTERNS.some((p) => p.test(message));
}

export function classifyCommit(message: string): { isBugFix: boolean; isRefactor: boolean } {
	return {
		isBugFix: isBugFixMessage(message),
		isRefactor: isRefactorMessage(message)
	};
}

export function ingestCommit(params: {
	repoSlug: string;
	sha: string;
	message: string;
}): BugCommitRow {
	const db = getDb();
	const now = Date.now();
	const { isBugFix, isRefactor } = classifyCommit(params.message);

	const existing = db
		.select()
		.from(bugCommits)
		.where(eq(bugCommits.sha, params.sha))
		.get();

	if (existing) return existing as BugCommitRow;

	const row: BugCommitRow = {
		id: randomUUID(),
		repoSlug: params.repoSlug,
		sha: params.sha,
		message: params.message,
		isBugFix,
		isRefactor,
		blameSha: null,
		patternId: null,
		analyzedAt: now
	};

	db.insert(bugCommits).values(row).run();
	return row;
}

export function ingestCommits(
	repoSlug: string,
	commits: Array<{ sha: string; message: string }>
): BugCommitRow[] {
	return commits.map((c) => ingestCommit({ repoSlug, ...c }));
}

export function szzTraceBack(params: {
	repoSlug: string;
	bugFixSha: string;
	getBlame: (sha: string, filePath: string) => string | null;
	getCommitFiles: (sha: string) => string[];
}): string | null {
	const db = getDb();
	const files = params.getCommitFiles(params.bugFixSha);
	if (files.length === 0) return null;

	for (const file of files) {
		const blameSha = params.getBlame(params.bugFixSha, file);
		if (blameSha && blameSha !== params.bugFixSha) {
			db.update(bugCommits)
				.set({ blameSha })
				.where(eq(bugCommits.sha, params.bugFixSha))
				.run();
			return blameSha;
		}
	}

	return null;
}

export function extractPatterns(
	repoSlug: string,
	extractFn: (commits: BugCommitRow[]) => Array<{
		summary: string;
		rootCause?: string;
		fixPattern?: string;
		fileGlobs?: string[];
		confidence?: number;
	}>
): BugPatternRow[] {
	const db = getDb();
	const now = Date.now();

	const bugFixCommits = db
		.select()
		.from(bugCommits)
		.where(eq(bugCommits.isBugFix, true))
		.all()
		.filter((c) => c.repoSlug === repoSlug && !c.isRefactor) as BugCommitRow[];

	if (bugFixCommits.length < 2) return [];

	const extracted = extractFn(bugFixCommits);
	const patterns: BugPatternRow[] = [];

	for (const ext of extracted) {
		const existing = db
			.select()
			.from(bugPatterns)
			.where(eq(bugPatterns.repoSlug, repoSlug))
			.all()
			.find((p) => p.summary === ext.summary);

		if (existing) {
			db.update(bugPatterns)
				.set({
					frequency: existing.frequency + 1,
					lastSeenAt: now,
					confidence: Math.max(existing.confidence, ext.confidence ?? 0.5)
				})
				.where(eq(bugPatterns.id, existing.id))
				.run();
			patterns.push({ ...existing, frequency: existing.frequency + 1, lastSeenAt: now });
		} else {
			const row: BugPatternRow = {
				id: randomUUID(),
				repoSlug,
				summary: ext.summary,
				rootCause: ext.rootCause ?? null,
				fixPattern: ext.fixPattern ?? null,
				fileGlobsJson: JSON.stringify(ext.fileGlobs ?? []),
				frequency: 1,
				confidence: ext.confidence ?? 0.5,
				lastSeenAt: now,
				createdAt: now
			};
			db.insert(bugPatterns).values(row).run();
			patterns.push(row);
		}
	}

	return patterns;
}

export function getBugCommits(repoSlug: string): BugCommitRow[] {
	const db = getDb();
	return db
		.select()
		.from(bugCommits)
		.where(eq(bugCommits.repoSlug, repoSlug))
		.all() as BugCommitRow[];
}

export function getBugPatterns(repoSlug: string): BugPatternRow[] {
	const db = getDb();
	return db
		.select()
		.from(bugPatterns)
		.where(eq(bugPatterns.repoSlug, repoSlug))
		.all() as BugPatternRow[];
}
