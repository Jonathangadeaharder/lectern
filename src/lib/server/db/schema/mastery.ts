import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
