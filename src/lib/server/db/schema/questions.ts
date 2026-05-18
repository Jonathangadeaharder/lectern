import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sessions } from './sessions';

export const sessionQuestions = sqliteTable(
	'session_questions',
	{
		id: text('id').primaryKey(),
		sessionId: text('session_id')
			.notNull()
			.references(() => sessions.id, { onDelete: 'cascade' }),
		chunkId: text('chunk_id').notNull(),
		position: integer('position').notNull(),
		format: text('format', {
			enum: ['multiple_choice', 'free_text', 'click_lines', 'true_false', 'code_fix']
		}).notNull(),
		type: text('type', { enum: ['anchor', 'implication'] }).notNull(),
		promptJson: text('prompt_json').notNull(),
		rubricJson: text('rubric_json'),
		skillTagsJson: text('skill_tags_json').notNull().default('[]'),
		difficulty: text('difficulty', { enum: ['easy', 'medium', 'hard'] })
			.notNull()
			.default('medium'),
		derivedFromJson: text('derived_from_json').notNull(),
		promptVersion: text('prompt_version').notNull(),
		status: text('status', {
			enum: ['pending', 'shown', 'submitted', 'graded', 'skipped']
		})
			.notNull()
			.default('pending'),
		shownAt: integer('shown_at'),
		submittedAt: integer('submitted_at'),
		gradedAt: integer('graded_at')
	},
	(t) => ({
		sessionChunkIdx: index('session_questions_session_chunk_idx').on(
			t.sessionId,
			t.chunkId,
			t.position
		)
	})
);
