import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { bundles } from './bundles';

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	bundleId: text('bundle_id')
		.notNull()
		.references(() => bundles.id, { onDelete: 'restrict' }),
	headSha: text('head_sha').notNull(),
	state: text('state', {
		enum: ['created', 'active', 'paused', 'completed', 'abandoned']
	})
		.notNull()
		.default('created'),
	currentChunkIndex: integer('current_chunk_index').notNull().default(0),
	currentQuestionId: text('current_question_id'),
	startedAt: integer('started_at'),
	lastActivityAt: integer('last_activity_at'),
	pausedAt: integer('paused_at'),
	resumedAt: integer('resumed_at'),
	endedAt: integer('ended_at'),
	wallTimeMs: integer('wall_time_ms').notNull().default(0),
	activeTimeMs: integer('active_time_ms').notNull().default(0)
});
