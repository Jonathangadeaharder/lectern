import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getDb } from '../../db';
import { bugCommits, bugPatterns, repoScanState } from '../../db/schema';
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

export interface AiTypicalPattern {
	id: string;
	summary: string;
	description: string;
	rootCause: string;
	fileGlobs: string[];
	confidence: number;
}

export function loadAiTypicalCatalog(): AiTypicalPattern[] {
	const candidates = [
		join(process.cwd(), 'data', 'ai_typical_catalog.yaml'),
		join(import.meta.dirname ?? '.', '..', '..', '..', '..', '..', 'data', 'ai_typical_catalog.yaml')
	];

	for (const path of candidates) {
		if (!existsSync(path)) continue;
		try {
			const raw = readFileSync(path, 'utf8');
			return parseYamlCatalog(raw);
		} catch {
			continue;
		}
	}
	return [];
}

function parseYamlCatalog(raw: string): AiTypicalPattern[] {
	const patterns: AiTypicalPattern[] = [];
	const patternBlocks = raw.split(/^\s*-\s+id:\s*/m).slice(1);

	for (const block of patternBlocks) {
		const id = block.match(/^\S+/)?.[0] ?? '';
		const summary = block.match(/summary:\s*"([^"]*)"/)?.[1] ?? block.match(/summary:\s*'([^']*)'/)?.[1] ?? block.match(/summary:\s*(.+)$/m)?.[1]?.trim() ?? '';
		const description = block.match(/description:\s*"([^"]*)"/)?.[1] ?? block.match(/description:\s*'([^']*)'/)?.[1] ?? block.match(/description:\s*(.+)$/m)?.[1]?.trim() ?? '';
		const rootCause = block.match(/root_cause:\s*"([^"]*)"/)?.[1] ?? block.match(/root_cause:\s*'([^']*)'/)?.[1] ?? block.match(/root_cause:\s*(.+)$/m)?.[1]?.trim() ?? '';
		const confidence = parseFloat(block.match(/confidence:\s*([\d.]+)/)?.[1] ?? '0.5');

		const fileGlobs: string[] = [];
		const globBlock = block.match(/file_globs:\s*\n((?:\s+-\s+.*\n?)*)/);
		if (globBlock) {
			for (const line of globBlock[1]!.split('\n')) {
				const m = line.match(/^\s+-\s+"?([^"\n]+)"?/);
				if (m) fileGlobs.push(m[1]!.trim());
			}
		}

		patterns.push({ id, summary, description, rootCause, fileGlobs, confidence });
	}

	return patterns;
}

export function ingestAiTypicalPatterns(repoSlug: string): BugPatternRow[] {
	const catalog = loadAiTypicalCatalog();
	const db = getDb();
	const now = Date.now();
	const results: BugPatternRow[] = [];

	for (const p of catalog) {
		const existing = db
			.select()
			.from(bugPatterns)
			.where(eq(bugPatterns.repoSlug, repoSlug))
			.all()
			.find((row) => row.summary === p.summary);

		if (existing) {
			results.push(existing as BugPatternRow);
			continue;
		}

		const row: BugPatternRow = {
			id: randomUUID(),
			repoSlug,
			summary: p.summary,
			rootCause: p.rootCause || null,
			fixPattern: null,
			fileGlobsJson: JSON.stringify(p.fileGlobs),
			frequency: 0,
			confidence: p.confidence,
			lastSeenAt: now,
			createdAt: now
		};
		db.insert(bugPatterns).values(row).run();
		results.push(row);
	}

	return results;
}

function globToRe(glob: string): RegExp {
	const pattern = glob
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*\*/g, '{{GLOBSTAR}}')
		.replace(/\*/g, '[^/]*')
		.replace(/{{GLOBSTAR}}/g, '.*')
		.replace(/\?/g, '[^/]');
	return new RegExp(`^${pattern}$`);
}

export function matchPatternsToChunk(
	repoSlug: string,
	chunkFilePaths: string[]
): Array<{ pattern: BugPatternRow; matchedFiles: string[] }> {
	const db = getDb();
	const patterns = db
		.select()
		.from(bugPatterns)
		.where(eq(bugPatterns.repoSlug, repoSlug))
		.all() as BugPatternRow[];

	const results: Array<{ pattern: BugPatternRow; matchedFiles: string[] }> = [];

	for (const pattern of patterns) {
		const globs = JSON.parse(pattern.fileGlobsJson) as string[];
		const regexes = globs.map(globToRe);
		const matchedFiles = chunkFilePaths.filter((fp) =>
			regexes.some((re) => re.test(fp))
		);
		if (matchedFiles.length > 0) {
			results.push({ pattern, matchedFiles });
		}
	}

	return results;
}

export interface ScanStateRow {
	repoSlug: string;
	lastScannedSha: string;
	lastScannedAt: number;
	totalCommitsScanned: number;
}

export function getScanState(repoSlug: string): ScanStateRow | null {
	const db = getDb();
	const row = db
		.select()
		.from(repoScanState)
		.where(eq(repoScanState.repoSlug, repoSlug))
		.get();
	return (row as ScanStateRow) ?? null;
}

export function updateScanState(repoSlug: string, sha: string, scannedCount: number): ScanStateRow {
	const db = getDb();
	const now = Date.now();
	const existing = getScanState(repoSlug);

	if (existing) {
		db.update(repoScanState)
			.set({
				lastScannedSha: sha,
				lastScannedAt: now,
				totalCommitsScanned: existing.totalCommitsScanned + scannedCount
			})
			.where(eq(repoScanState.repoSlug, repoSlug))
			.run();
		return {
			repoSlug,
			lastScannedSha: sha,
			lastScannedAt: now,
			totalCommitsScanned: existing.totalCommitsScanned + scannedCount
		};
	}

	const row: ScanStateRow = {
		repoSlug,
		lastScannedSha: sha,
		lastScannedAt: now,
		totalCommitsScanned: scannedCount
	};
	db.insert(repoScanState).values(row).run();
	return row;
}

export function ingestCommitsIncremental(
	repoSlug: string,
	commits: Array<{ sha: string; message: string }>,
	sinceSha?: string
): BugCommitRow[] {
	const state = getScanState(repoSlug);
	const cutoffSha = sinceSha ?? state?.lastScannedSha;

	let toProcess = commits;
	if (cutoffSha) {
		const idx = commits.findIndex((c) => c.sha === cutoffSha);
		if (idx >= 0) {
			toProcess = commits.slice(0, idx);
		}
	}

	if (toProcess.length === 0) return [];

	const results = toProcess.map((c) => ingestCommit({ repoSlug, ...c }));

	if (toProcess.length > 0) {
		updateScanState(repoSlug, toProcess[0]!.sha, toProcess.length);
	}

	return results;
}
