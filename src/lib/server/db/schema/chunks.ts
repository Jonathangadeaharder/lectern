import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { bundles } from './bundles';
import { sessions } from './sessions';

/** Cached chunk sets per (bundle, head_sha). Pre-computed in #6. */
export const chunkSets = sqliteTable(
	'chunk_sets',
	{
		bundleId: text('bundle_id')
			.notNull()
			.references(() => bundles.id, { onDelete: 'cascade' }),
		headSha: text('head_sha').notNull(),
		chunksJson: text('chunks_json').notNull(),
		generatedAt: integer('generated_at').notNull()
	},
	(t) => ({
		pk: primaryKey({ columns: [t.bundleId, t.headSha] })
	})
);

export const sessionChunks = sqliteTable(
	'session_chunks',
	{
		sessionId: text('session_id')
			.notNull()
			.references(() => sessions.id, { onDelete: 'cascade' }),
		chunkId: text('chunk_id').notNull(),
		position: integer('position').notNull(),
		status: text('status', {
			enum: ['pending', 'reviewing', 'questioning', 'done']
		})
			.notNull()
			.default('pending'),
		enteredAt: integer('entered_at'),
		completedAt: integer('completed_at'),
		activeTimeMs: integer('active_time_ms').notNull().default(0)
	},
	(t) => ({
		pk: primaryKey({ columns: [t.sessionId, t.chunkId] }),
		positionIdx: index('session_chunks_position_idx').on(t.sessionId, t.position)
	})
);
