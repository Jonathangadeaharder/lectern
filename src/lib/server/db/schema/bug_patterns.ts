import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const bugPatterns = sqliteTable(
	'bug_patterns',
	{
		id: text('id').primaryKey(),
		repoSlug: text('repo_slug').notNull(),
		summary: text('summary').notNull(),
		rootCause: text('root_cause'),
		fixPattern: text('fix_pattern'),
		fileGlobsJson: text('file_globs_json').notNull().default('[]'),
		frequency: integer('frequency').notNull().default(1),
		confidence: real('confidence').notNull().default(0.5),
		lastSeenAt: integer('last_seen_at').notNull(),
		createdAt: integer('created_at').notNull()
	},
	(t) => ({
		repoIdx: index('bug_patterns_repo_idx').on(t.repoSlug)
	})
);

export const bugCommits = sqliteTable(
	'bug_commits',
	{
		id: text('id').primaryKey(),
		repoSlug: text('repo_slug').notNull(),
		sha: text('sha').notNull(),
		message: text('message').notNull(),
		isBugFix: integer('is_bug_fix', { mode: 'boolean' }).notNull().default(false),
		isRefactor: integer('is_refactor', { mode: 'boolean' }).notNull().default(false),
		blameSha: text('blame_sha'),
		patternId: text('pattern_id'),
		analyzedAt: integer('analyzed_at').notNull()
	},
	(t) => ({
		repoShaIdx: index('bug_commits_repo_sha_idx').on(t.repoSlug, t.sha)
	})
);
