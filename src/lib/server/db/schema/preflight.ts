import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { bundles } from './bundles';

export const preflightResults = sqliteTable(
	'preflight_results',
	{
		id: text('id').primaryKey(),
		bundleId: text('bundle_id')
			.notNull()
			.references(() => bundles.id, { onDelete: 'cascade' }),
		headSha: text('head_sha').notNull(),
		decision: text('decision', {
			enum: ['block', 'warn', 'proceed', 'proceed-with-warning']
		}).notNull(),
		countsJson: text('counts_json').notNull(),
		findingsJson: text('findings_json').notNull(),
		prAgentRunId: text('pr_agent_run_id'),
		errorKind: text('error_kind'),
		errorMessage: text('error_message'),
		createdAt: integer('created_at').notNull()
	},
	(t) => ({
		bundleHeadUq: uniqueIndex('preflight_bundle_head_uq').on(t.bundleId, t.headSha)
	})
);

export const preflightOverrides = sqliteTable('preflight_overrides', {
	id: text('id').primaryKey(),
	preflightResultId: text('preflight_result_id')
		.notNull()
		.references(() => preflightResults.id, { onDelete: 'cascade' }),
	createdAt: integer('created_at').notNull()
});
