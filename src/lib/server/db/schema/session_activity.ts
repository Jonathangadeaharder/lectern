import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const sessionActivity = sqliteTable(
	'session_activity',
	{
		id: text('id').primaryKey(),
		sessionId: text('session_id').notNull(),
		repoSlug: text('repo_slug').notNull(),
		date: text('date').notNull(),
		questionsAttempted: integer('questions_attempted').notNull().default(0),
		questionsPassed: integer('questions_passed').notNull().default(0),
		activeTimeMs: integer('active_time_ms').notNull().default(0),
		chunksReviewed: integer('chunks_reviewed').notNull().default(0),
		avgScore: real('avg_score'),
		createdAt: integer('created_at').notNull()
	},
	(t) => ({
		dateIdx: index('session_activity_date_idx').on(t.date),
		repoIdx: index('session_activity_repo_idx').on(t.repoSlug)
	})
);

export const repoCompetence = sqliteTable(
	'repo_competence',
	{
		repoSlug: text('repo_slug').primaryKey(),
		totalSessions: integer('total_sessions').notNull().default(0),
		totalQuestions: integer('total_questions').notNull().default(0),
		avgScore: real('avg_score'),
		lastSessionAt: integer('last_session_at'),
		updatedAt: integer('updated_at').notNull()
	}
);
