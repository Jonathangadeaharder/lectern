import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { bundles } from './bundles';

/** A generated PR-presentation deck. Filesystem-backed (slides.md); ingested
 * into the DB on first read so subsequent reads are fast and queries against
 * coverage status are cheap.
 */
export const presentations = sqliteTable(
	'presentations',
	{
		id: text('id').primaryKey(),
		bundleId: text('bundle_id')
			.notNull()
			.references(() => bundles.id, { onDelete: 'cascade' }),
		headSha: text('head_sha').notNull(),
		formatVersion: text('format_version').notNull().default('1'),
		generatedAt: integer('generated_at').notNull(),
		updatedAt: integer('updated_at').notNull(),
		filesystemPath: text('filesystem_path').notNull(),
		sizeBytes: integer('size_bytes').notNull(),
		/** JSON array of repo-relative paths that the presentation tries to cover. */
		scopeFilesJson: text('scope_files_json').notNull(),
		coverageStatus: text('coverage_status', {
			enum: ['unknown', 'clean', 'uncovered', 'fidelity_failed']
		})
			.notNull()
			.default('unknown'),
		/** Last verifier run summary - counts, sample uncovered lines, fidelity errors. */
		coverageSummaryJson: text('coverage_summary_json')
	},
	(t) => ({
		bundleIdx: index('presentations_bundle_idx').on(t.bundleId, t.headSha)
	})
);

/** Extra multi-axis data attached to the presentation (populated by LLM gen). */
export const presentationExtras = sqliteTable('presentation_extras', {
	presentationId: text('presentation_id')
		.primaryKey()
		.references(() => presentations.id, { onDelete: 'cascade' }),
	/** JSON array of Changeset objects. */
	changesetsJson: text('changesets_json').notNull().default('[]'),
	/** JSON array of SystematicPattern objects. */
	systematicPatternsJson: text('systematic_patterns_json').notNull().default('[]'),
	/** JSON array of CausalClaim objects. */
	causalClaimsJson: text('causal_claims_json').notNull().default('[]'),
	/** Optional CodeGraph JSON. */
	graphJson: text('graph_json')
});

/** Slides as ordered rows. Edits via the UI write the .md back to disk so the
 * filesystem remains canonical.
 */
export const presentationSlides = sqliteTable(
	'presentation_slides',
	{
		presentationId: text('presentation_id')
			.notNull()
			.references(() => presentations.id, { onDelete: 'cascade' }),
		position: integer('position').notNull(),
		title: text('title').notNull(),
		body: text('body').notNull(),
		/** JSON array of {path, start, end} coverage claims. */
		coversJson: text('covers_json').notNull().default('[]'),
		/** JSON array of {path, start, end} verbatim claims, per code block. */
		verbatimRangesJson: text('verbatim_ranges_json').notNull().default('[]'),
		/** 0 or 1; 1 = illustrative code, do not run fidelity check. */
		nofidelity: integer('nofidelity').notNull().default(0),
		/** JSON array of { text, highlightLines, explanation } bullets. */
		bulletsJson: text('bullets_json').notNull().default('[]'),
		/** JSON array of line numbers to fold as boilerplate. */
		foldsJson: text('folds_json').notNull().default('[]')
	},
	(t) => ({
		pk: primaryKey({ columns: [t.presentationId, t.position] }),
		positionIdx: index('presentation_slides_position_idx').on(t.presentationId, t.position)
	})
);
