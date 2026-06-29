import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sessions } from './sessions';

export const bookmarks = sqliteTable(
	'bookmarks',
	{
		id: text('id').primaryKey(),
		sessionId: text('session_id')
			.notNull()
			.references(() => sessions.id, { onDelete: 'cascade' }),
		chunkId: text('chunk_id').notNull(),
		file: text('file').notNull(),
		line: integer('line').notNull(),
		note: text('note'),
		createdAt: integer('created_at').notNull()
	},
	(t) => ({
		sessionIdx: index('bookmarks_session_idx').on(t.sessionId)
	})
);
