import { getDb } from '$lib/server/db';
import { bundles } from '$lib/server/db/schema';
import {
	ensurePresentation,
	getSlides,
	verifyPresentationForRecord
} from '$lib/server/services/presentation';
import { getPresentationExtras } from '$lib/server/services/presentation/storage';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const slug = params.slug;
	const prRaw = params.pr;
	if (!slug || !prRaw) throw error(400, 'missing slug or pr');
	const prNumber = Number.parseInt(prRaw, 10);
	if (!Number.isFinite(prNumber)) throw error(400, 'pr must be a number');

	const db = getDb();
	const bundle = db
		.select()
		.from(bundles)
		.where(eq(bundles.repoSlug, slug))
		.all()
		.filter((b) => b.prNumber === prNumber)
		.sort((a, b) => b.fetchedAt - a.fetchedAt)[0];

	if (!bundle) {
		throw error(
			404,
			`No bundle ingested for ${slug} !${prNumber}. Open the URL on the dashboard first.`
		);
	}

	const record = await ensurePresentation(bundle.id, {
		bundleTitle: `${slug} !${prNumber}`,
		bundleUrl: bundle.sourceUrl
	});
	const slides = await getSlides(record);
	const coverage = await verifyPresentationForRecord(record);
	const extras = await getPresentationExtras(record.id);

	// Build a per-slide uncovered index for the warning chip.
	const uncoveredBySlide: Record<number, boolean> = {};
	for (const u of coverage.summary.uncovered) {
		for (const s of slides) {
			const overlaps = s.covers.some(
				(c) => c.path === u.file && u.lines.some((l) => l.start <= c.end && l.end >= c.start)
			);
			if (!overlaps) uncoveredBySlide[s.position] = true;
		}
	}

	return {
		presentation: {
			id: record.id,
			bundleId: record.bundleId,
			headSha: record.headSha,
			generatedAt: record.generatedAt,
			updatedAt: record.updatedAt,
			coverageStatus: coverage.status,
			coverageHeadline: coverage.summary.totalAdditions === 0 ? 'empty diff' : null,
			totalAdditions: coverage.summary.totalAdditions,
			coveredAdditions: coverage.summary.coveredAdditions,
			uncovered: coverage.summary.uncovered,
			fidelityErrors: coverage.summary.fidelityErrors,
			uncoveredBySlide
		},
		slides: slides.map((s) => ({
			position: s.position,
			title: s.title,
			body: s.body,
			covers: s.covers,
			verbatimRanges: s.verbatimRanges,
			nofidelity: s.nofidelity,
			bullets: s.bullets,
			folds: s.folds
		})),
		bundle: {
			repoSlug: slug,
			prNumber,
			sourceUrl: bundle.sourceUrl
		},
		extras: {
			changesets: extras.changesets,
			systematicPatterns: extras.systematicPatterns,
			causalClaims: extras.causalClaims,
			graphJson: extras.graphJson
		}
	};
};
