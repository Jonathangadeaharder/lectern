import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sessions } from './sessions';

export const debriefs = sqliteTable('debriefs', {
	sessionId: text('session_id')
		.primaryKey()
		.references(() => sessions.id, { onDelete: 'cascade' }),
	generatedAt: integer('generated_at').notNull(),
	confidenceScore: real('confidence_score').notNull(),
	band: text('band', { enum: ['high', 'medium', 'low'] }).notNull(),
	recommendation: text('recommendation').notNull(),
	perChunkJson: text('per_chunk_json').notNull(),
	missedByTagJson: text('missed_by_tag_json').notNull(),
	followUpsJson: text('follow_ups_json').notNull(),
	promptVersion: text('prompt_version').notNull(),
	model: text('model').notNull()
});
