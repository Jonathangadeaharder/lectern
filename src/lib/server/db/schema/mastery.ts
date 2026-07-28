import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const skillMastery = sqliteTable(
	'skill_mastery',
	{
		id: text('id').primaryKey(),
		tag: text('tag').notNull(),
		repoSlug: text('repo_slug'),
		ewmaScore: real('ewma_score').notNull().default(0.5),
		level: text('level', {
			enum: ['novice', 'developing', 'proficient', 'mastered']
		})
			.notNull()
			.default('novice'),
		totalAttempts: integer('total_attempts').notNull().default(0),
		passCount: integer('pass_count').notNull().default(0),
		lastAttemptAt: integer('last_attempt_at'),
		lastDecayAt: integer('last_decay_at'),
		createdAt: integer('created_at').notNull(),
		updatedAt: integer('updated_at').notNull()
	},
	(t) => ({
		tagRepoUq: uniqueIndex('skill_mastery_tag_repo_uq').on(t.tag, t.repoSlug)
	})
);

export const masteryHistory = sqliteTable(
	'mastery_history',
	{
		id: text('id').primaryKey(),
		tag: text('tag').notNull(),
		repoSlug: text('repo_slug'),
		sessionId: text('session_id'),
		ewmaScore: real('ewma_score').notNull(),
		verdict: text('verdict'),
		createdAt: integer('created_at').notNull()
	},
	(t) => ({
		tagIdx: index('mastery_history_tag_idx').on(t.tag, t.repoSlug),
		createdIdx: index('mastery_history_created_idx').on(t.createdAt)
	})
);
