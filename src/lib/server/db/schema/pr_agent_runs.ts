import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { bundles } from './bundles';

export const prAgentRuns = sqliteTable('pr_agent_runs', {
	id: text('id').primaryKey(),
	bundleId: text('bundle_id')
		.notNull()
		.references(() => bundles.id, { onDelete: 'cascade' }),
	task: text('task', { enum: ['review', 'describe'] }).notNull(),
	status: text('status', { enum: ['running', 'done', 'error'] })
		.notNull()
		.default('running'),
	startedAt: integer('started_at').notNull(),
	finishedAt: integer('finished_at'),
	outputJson: text('output_json'),
	errorKind: text('error_kind'),
	errorMessage: text('error_message')
});
