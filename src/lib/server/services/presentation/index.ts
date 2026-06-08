/** Public surface of the presentation service.
 *
 * High-level entry points:
 *   - ensurePresentation(bundleId, headSha, scope?) - generate if missing,
 *     return the record.
 *   - verifyPresentationForRecord(record) - run the coverage check, store
 *     summary on the record.
 *   - getSlides(record) - ordered slide rows from the DB (or .md if the DB
 *     copy is empty).
 *
 * Routes and the CLI use only these entry points; the storage / verifier /
 * generator modules are implementation details.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { bundles } from '../../db/schema';
import { readBundleDiff, readBundleEntry, readBundleManifest } from '../ingestion/bundle';
import { getQuickConfig } from '../llm/quick_config';
import { generateSlidesWithLlm } from './llm-generate';
import {
	bundleExists,
	findPresentation,
	generateAndStore,
	invalidatePresentationCache,
	listSlides,
	readDiffForPresentation,
	readPresentationCache,
	reingestFromFilesystem,
	updateCoverageStatus,
	writePresentationCache,
	writeBackMarkdown
} from './storage';
import type { PresentationRecord } from './storage';
import type { CoverageCheckResult, CoverageStatus, SlideRecord } from './types';
import { summarizeCoverage, verifyPresentation } from './verifier';

export interface EnsureOptions {
	scopeFiles?: string[];
	bundleTitle?: string;
	bundleUrl?: string;
	/** 'mechanical' = deterministic generator, 'llm' = LLM, 'auto' = LLM if configured else mechanical. */
	mode?: 'mechanical' | 'llm' | 'auto';
}

export async function ensurePresentation(
	bundleId: string,
	opts: EnsureOptions = {}
): Promise<PresentationRecord> {
	if (!(await bundleExists(bundleId))) {
		throw new Error(`bundle not found: ${bundleId}`);
	}

	const db = getDb();
	const bundle = db.select().from(bundles).where(eq(bundles.id, bundleId)).get();
	if (!bundle) throw new Error(`bundle not found: ${bundleId}`);

	const existing = await findPresentation(bundleId, bundle.headSha);
	if (existing) return existing;

	const diffText = await readBundleDiff(bundle.filePath);
	if (!diffText) throw new Error(`bundle ${bundleId} has no diff.patch`);

	let scope = opts.scopeFiles;
	if (!scope) {
		const manifest = await readBundleManifest(bundle.filePath);
		scope = manifest?.files.map((f) => f.path) ?? [];
	}

	const scopedDiff = scope.length === 0 ? diffText : restrictDiffToScope(diffText, new Set(scope));
	const title = opts.bundleTitle ?? `${bundle.repoSlug} !${bundle.prNumber}`;
	const url = opts.bundleUrl ?? bundle.sourceUrl;
	const mode = opts.mode ?? 'auto';

	let llmSlides: SlideRecord[] | null = null;
	if (mode === 'llm' || mode === 'auto') {
		const cfg = await getQuickConfig();
		if (cfg) {
			// Check cache before calling the LLM.
			const cached = readPresentationCache(bundleId, bundle.headSha, mode);
			if (cached) {
				console.log('[presentation] LLM cache hit');
				llmSlides = cached;
			} else {
				try {
					llmSlides = await generateSlidesWithLlm({
						diffText: scopedDiff,
						bundleTitle: title,
						bundleUrl: url ?? ''
					});
					writePresentationCache(bundleId, bundle.headSha, mode, llmSlides);
				} catch (e) {
					console.warn('[presentation] LLM generation failed, falling back to mechanical:', e instanceof Error ? e.message : String(e));
				}
			}
		}
	}

	return await generateAndStore({
		bundleId,
		headSha: bundle.headSha,
		scopeFiles: scope,
		diffText: scopedDiff,
		bundleTitle: title,
		bundleUrl: url,
		prebuiltSlides: llmSlides ?? undefined
	});
}

export async function getSlides(record: PresentationRecord): Promise<SlideRecord[]> {
	const cached = await listSlides(record.id);
	if (cached.length > 0) return cached;
	return await reingestFromFilesystem(record);
}

export async function verifyPresentationForRecord(
	record: PresentationRecord
): Promise<CoverageStatus> {
	const slides = await getSlides(record);
	const diff = await readDiffForPresentation(record);

	const db = getDb();
	const bundle = db.select().from(bundles).where(eq(bundles.id, record.bundleId)).get();
	if (!bundle) throw new Error(`bundle ${record.bundleId} not found`);

	const summary = await verifyPresentation({
		diffText: diff,
		slides,
		readPostFile: async (path) => readPostFileFromBundle(bundle.filePath, path)
	});
	const sum = summarizeCoverage(summary);
	const status: CoverageStatus = { status: sum.status, summary };
	await updateCoverageStatus(record.id, status);
	return status;
}

export async function saveEditedSlides(
	record: PresentationRecord,
	slides: SlideRecord[]
): Promise<CoverageStatus> {
	await writeBackMarkdown(record, slides);
	return await verifyPresentationForRecord(record);
}

async function readPostFileFromBundle(
	bundlePath: string,
	repoPath: string
): Promise<string[] | null> {
	const buf = await readBundleEntry(bundlePath, `files/head/${repoPath}`);
	if (!buf) return null;
	return buf.toString('utf8').split('\n');
}

function restrictDiffToScope(diffText: string, scope: Set<string>): string {
	const out: string[] = [];
	let keep = false;
	for (const ln of diffText.split('\n')) {
		if (ln.startsWith('diff --git')) {
			const m = /diff --git a\/(.+?) b\/(.+)$/.exec(ln);
			keep = m?.[2] ? scope.has(m[2]) : false;
		}
		if (keep) out.push(ln);
	}
	return out.join('\n');
}

export type { PresentationRecord, PresentationExtrasRecord } from './storage';
export {
	getPresentationExtras,
	savePresentationExtras,
	readPresentationCache,
	writePresentationCache,
	invalidatePresentationCache
} from './storage';
export type { SlideRecord, CoverageCheckResult, CoverageStatus, Bullet, Changeset, SystematicPattern, CausalClaim, CodeGraph } from './types';
