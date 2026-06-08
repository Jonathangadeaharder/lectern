/** Filesystem-canonical, DB-cached presentation storage.
 *
 * Layout under <dataDir>/presentations/<bundleId>/<headSha>/:
 *   - slides.md   - canonical source, editable in-place
 *   - scope.diff  - copy of the bundle's diff at generation time, restricted
 *                   to the scope file list (so the verifier has something to
 *                   diff-parse without re-reading the bundle tar each time)
 *
 * The DB stores per-slide rows derived from the .md; reads parse the .md on
 * miss and ingest. Edits via the UI write the .md and then refresh the DB
 * rows so the .md is the source of truth.
 */

import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { resolveDataDir } from '../../config/paths';
import { getDb } from '../../db';
import { bundles, llmCache, presentationExtras, presentationSlides, presentations } from '../../db/schema';
import { generateStarterDeck, renderSlidesToMarkdown } from './generator';
import { parseSlidesMarkdown } from './markdown';
import type { Bullet, Changeset, CausalClaim, CoverageStatus, SlideRecord, SourceRange, SystematicPattern } from './types';

const PRESENTATION_CACHE_TASK = 'generate_presentation' as const;

function presentationCacheKey(bundleId: string, headSha: string, mode: string): string {
	return createHash('sha256').update(`pres:${mode}:${bundleId}:${headSha}`).digest('hex');
}

export function readPresentationCache(
	bundleId: string,
	headSha: string,
	mode: string
): SlideRecord[] | null {
	const db = getDb();
	const hash = presentationCacheKey(bundleId, headSha, mode);
	const row = db.select().from(llmCache).where(eq(llmCache.hash, hash)).get();
	if (!row) return null;
	try {
		return JSON.parse(row.responseJson) as SlideRecord[];
	} catch {
		return null;
	}
}

export function writePresentationCache(
	bundleId: string,
	headSha: string,
	mode: string,
	slides: SlideRecord[]
): void {
	const db = getDb();
	const hash = presentationCacheKey(bundleId, headSha, mode);
	db.insert(llmCache)
		.values({
			hash,
			task: PRESENTATION_CACHE_TASK,
			responseJson: JSON.stringify(slides),
			modelId: null,
			latencyMs: null,
			createdAt: Date.now()
		})
		.run();
}

export function invalidatePresentationCache(
	bundleId: string,
	headSha: string,
	mode: string
): void {
	const db = getDb();
	const hash = presentationCacheKey(bundleId, headSha, mode);
	db.delete(llmCache).where(eq(llmCache.hash, hash)).run();
}

export interface PresentationRecord {
	id: string;
	bundleId: string;
	headSha: string;
	formatVersion: string;
	generatedAt: number;
	updatedAt: number;
	filesystemPath: string;
	sizeBytes: number;
	scopeFiles: string[];
	coverageStatus: 'unknown' | 'clean' | 'uncovered' | 'fidelity_failed';
	coverageSummary: unknown | null;
}

function presentationDir(bundleId: string, headSha: string): string {
	return join(resolveDataDir().presentations, bundleId, headSha);
}

export async function findPresentation(
	bundleId: string,
	headSha: string
): Promise<PresentationRecord | null> {
	const db = getDb();
	const row = db
		.select()
		.from(presentations)
		.where(and(eq(presentations.bundleId, bundleId), eq(presentations.headSha, headSha)))
		.get();
	if (!row) return null;
	return mapRow(row);
}

export interface GenerateOptions {
	bundleId: string;
	headSha: string;
	scopeFiles: string[];
	diffText: string;
	bundleTitle?: string;
	bundleUrl?: string;
	/** If provided, skip mechanical generation and use these slides directly. */
	prebuiltSlides?: SlideRecord[];
}

export async function generateAndStore(opts: GenerateOptions): Promise<PresentationRecord> {
	const dir = presentationDir(opts.bundleId, opts.headSha);
	await mkdir(dir, { recursive: true, mode: 0o700 });

	const slides = opts.prebuiltSlides ?? generateStarterDeck({
		diffText: opts.diffText,
		bundleTitle: opts.bundleTitle,
		bundleUrl: opts.bundleUrl
	});
	const md = renderSlidesToMarkdown(slides);

	const mdPath = join(dir, 'slides.md');
	await writeFile(mdPath, md, { encoding: 'utf8', mode: 0o600 });

	const diffPath = join(dir, 'scope.diff');
	await writeFile(diffPath, opts.diffText, { encoding: 'utf8', mode: 0o600 });

	const sz = (await stat(mdPath)).size;
	const id = randomUUID();
	const now = Date.now();

	const db = getDb();
	db.transaction((tx) => {
		// Remove any prior row for the same (bundle, headSha).
		const prior = tx
			.select()
			.from(presentations)
			.where(
				and(eq(presentations.bundleId, opts.bundleId), eq(presentations.headSha, opts.headSha))
			)
			.all();
		for (const p of prior) {
			tx.delete(presentationSlides).where(eq(presentationSlides.presentationId, p.id)).run();
			tx.delete(presentations).where(eq(presentations.id, p.id)).run();
		}
		tx.insert(presentations)
			.values({
				id,
				bundleId: opts.bundleId,
				headSha: opts.headSha,
				formatVersion: '1',
				generatedAt: now,
				updatedAt: now,
				filesystemPath: mdPath,
				sizeBytes: sz,
				scopeFilesJson: JSON.stringify(opts.scopeFiles),
				coverageStatus: 'unknown',
				coverageSummaryJson: null
			})
			.run();
		insertSlidesTx(tx, id, slides);
	});

	const stored = await findPresentation(opts.bundleId, opts.headSha);
	if (!stored) throw new Error('Presentation row missing after insert');
	return stored;
}

/** Read .md from disk, parse, replace DB rows. Use when the .md was edited
 * out-of-band (CLI, text editor, etc.).
 */
export async function reingestFromFilesystem(record: PresentationRecord): Promise<SlideRecord[]> {
	const md = await readFile(record.filesystemPath, { encoding: 'utf8' });
	const slides = parseSlidesMarkdown(md);
	const sz = Buffer.byteLength(md, 'utf8');
	const db = getDb();
	db.transaction((tx) => {
		tx.delete(presentationSlides).where(eq(presentationSlides.presentationId, record.id)).run();
		tx.update(presentations)
			.set({
				updatedAt: Date.now(),
				sizeBytes: sz
			})
			.where(eq(presentations.id, record.id))
			.run();
		insertSlidesTx(tx, record.id, slides);
	});
	return slides;
}

export async function listSlides(presentationId: string): Promise<SlideRecord[]> {
	const db = getDb();
	const rows = db
		.select()
		.from(presentationSlides)
		.where(eq(presentationSlides.presentationId, presentationId))
		.all();
	return rows
		.sort((a, b) => a.position - b.position)
		.map<SlideRecord>((r) => ({
			position: r.position,
			title: r.title,
			body: r.body,
			covers: safeRanges(r.coversJson),
			verbatimRanges: safeRanges(r.verbatimRangesJson),
			nofidelity: !!r.nofidelity,
			bullets: safeBullets(r.bulletsJson),
			folds: safeNumbers(r.foldsJson)
		}));
}

export async function writeBackMarkdown(
	record: PresentationRecord,
	slides: SlideRecord[]
): Promise<void> {
	const md = renderSlidesToMarkdown(slides);
	await mkdir(dirname(record.filesystemPath), { recursive: true, mode: 0o700 });
	await writeFile(record.filesystemPath, md, { encoding: 'utf8', mode: 0o600 });
	const sz = Buffer.byteLength(md, 'utf8');
	const db = getDb();
	db.transaction((tx) => {
		tx.delete(presentationSlides).where(eq(presentationSlides.presentationId, record.id)).run();
		tx.update(presentations)
			.set({ updatedAt: Date.now(), sizeBytes: sz })
			.where(eq(presentations.id, record.id))
			.run();
		insertSlidesTx(tx, record.id, slides);
	});
}

export async function updateCoverageStatus(
	presentationId: string,
	status: CoverageStatus
): Promise<void> {
	const db = getDb();
	db.update(presentations)
		.set({
			coverageStatus: status.status,
			coverageSummaryJson: JSON.stringify(status.summary)
		})
		.where(eq(presentations.id, presentationId))
		.run();
}

export async function readDiffForPresentation(record: PresentationRecord): Promise<string> {
	const diffPath = join(dirname(record.filesystemPath), 'scope.diff');
	return await readFile(diffPath, { encoding: 'utf8' });
}

export async function bundleExists(bundleId: string): Promise<boolean> {
	const db = getDb();
	const row = db.select().from(bundles).where(eq(bundles.id, bundleId)).get();
	return !!row;
}

// Drizzle's SQLiteTransaction type is awkward to spell explicitly; we accept
// any object that exposes the .insert(table).values(row).run() shape we use,
// which both BetterSQLite3Database and SQLiteTransaction satisfy structurally.
type InsertCapable = {
	insert: (table: typeof presentationSlides) => {
		values: (row: typeof presentationSlides.$inferInsert) => { run: () => unknown };
	};
};

function insertSlidesTx(tx: InsertCapable, presentationId: string, slides: SlideRecord[]): void {
	if (slides.length === 0) return;
	for (const s of slides) {
		tx.insert(presentationSlides)
			.values({
				presentationId,
				position: s.position,
				title: s.title,
				body: s.body,
				coversJson: JSON.stringify(s.covers),
				verbatimRangesJson: JSON.stringify(s.verbatimRanges),
				nofidelity: s.nofidelity ? 1 : 0,
				bulletsJson: JSON.stringify(s.bullets ?? []),
				foldsJson: JSON.stringify(s.folds ?? [])
			})
			.run();
	}
}

export interface PresentationExtrasRecord {
	changesets: Changeset[];
	systematicPatterns: SystematicPattern[];
	causalClaims: CausalClaim[];
	graphJson: string | null;
}

export async function getPresentationExtras(
	presentationId: string
): Promise<PresentationExtrasRecord> {
	const db = getDb();
	const row = db
		.select()
		.from(presentationExtras)
		.where(eq(presentationExtras.presentationId, presentationId))
		.get();
	if (!row) {
		return { changesets: [], systematicPatterns: [], causalClaims: [], graphJson: null };
	}
	return {
		changesets: safeJson<Changeset[]>(row.changesetsJson, []),
		systematicPatterns: safeJson<SystematicPattern[]>(row.systematicPatternsJson, []),
		causalClaims: safeJson<CausalClaim[]>(row.causalClaimsJson, []),
		graphJson: row.graphJson ?? null
	};
}

export async function savePresentationExtras(
	presentationId: string,
	extras: Partial<PresentationExtrasRecord>
): Promise<void> {
	const db = getDb();
	const existing = db
		.select()
		.from(presentationExtras)
		.where(eq(presentationExtras.presentationId, presentationId))
		.get();
	if (existing) {
		db.update(presentationExtras)
			.set({
				changesetsJson:
					extras.changesets !== undefined
						? JSON.stringify(extras.changesets)
						: existing.changesetsJson,
				systematicPatternsJson:
					extras.systematicPatterns !== undefined
						? JSON.stringify(extras.systematicPatterns)
						: existing.systematicPatternsJson,
				causalClaimsJson:
					extras.causalClaims !== undefined
						? JSON.stringify(extras.causalClaims)
						: existing.causalClaimsJson,
				graphJson: extras.graphJson !== undefined ? extras.graphJson : existing.graphJson
			})
			.where(eq(presentationExtras.presentationId, presentationId))
			.run();
	} else {
		db.insert(presentationExtras)
			.values({
				presentationId,
				changesetsJson: JSON.stringify(extras.changesets ?? []),
				systematicPatternsJson: JSON.stringify(extras.systematicPatterns ?? []),
				causalClaimsJson: JSON.stringify(extras.causalClaims ?? []),
				graphJson: extras.graphJson ?? null
			})
			.run();
	}
}

function safeJson<T>(json: string | null | undefined, fallback: T): T {
	if (!json) return fallback;
	try {
		return JSON.parse(json) as T;
	} catch {
		return fallback;
	}
}

function safeNumbers(json: string | null | undefined): number[] {
	const v = safeJson<unknown>(json, []);
	if (!Array.isArray(v)) return [];
	return v.filter((n): n is number => typeof n === 'number');
}

function safeBullets(json: string | null | undefined): Bullet[] {
	const v = safeJson<unknown>(json, []);
	if (!Array.isArray(v)) return [];
	return v.filter(
		(b): b is Bullet =>
			typeof b === 'object' &&
			b !== null &&
			typeof (b as Bullet).text === 'string' &&
			typeof (b as Bullet).highlightLines === 'string' &&
			typeof (b as Bullet).explanation === 'string'
	);
}

function safeRanges(json: string): SourceRange[] {
	try {
		const v = JSON.parse(json) as unknown;
		if (!Array.isArray(v)) return [];
		return v.filter(isSourceRange);
	} catch {
		return [];
	}
}

function isSourceRange(v: unknown): v is SourceRange {
	return (
		typeof v === 'object' &&
		v !== null &&
		typeof (v as SourceRange).path === 'string' &&
		typeof (v as SourceRange).start === 'number' &&
		typeof (v as SourceRange).end === 'number'
	);
}

function mapRow(row: typeof presentations.$inferSelect): PresentationRecord {
	let scopeFiles: string[] = [];
	try {
		const v = JSON.parse(row.scopeFilesJson) as unknown;
		if (Array.isArray(v)) scopeFiles = v.filter((s): s is string => typeof s === 'string');
	} catch {
		// keep empty
	}
	let coverageSummary: unknown | null = null;
	if (row.coverageSummaryJson) {
		try {
			coverageSummary = JSON.parse(row.coverageSummaryJson);
		} catch {
			coverageSummary = null;
		}
	}
	return {
		id: row.id,
		bundleId: row.bundleId,
		headSha: row.headSha,
		formatVersion: row.formatVersion,
		generatedAt: row.generatedAt,
		updatedAt: row.updatedAt,
		filesystemPath: row.filesystemPath,
		sizeBytes: row.sizeBytes,
		scopeFiles,
		coverageStatus: row.coverageStatus as PresentationRecord['coverageStatus'],
		coverageSummary
	};
}
