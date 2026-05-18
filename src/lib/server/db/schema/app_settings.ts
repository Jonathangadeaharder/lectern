import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/** Generic key-value bag. Used for `llm.quick_config` and similar. */
export const appSettings = sqliteTable('app_settings', {
	key: text('key').primaryKey(),
	value: text('value_json').notNull(),
	updatedAt: integer('updated_at').notNull()
});
