import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const bundles = sqliteTable(
	'bundles',
	{
		id: text('id').primaryKey(),
		repoSlug: text('repo_slug').notNull(),
		prNumber: integer('pr_number').notNull(),
		sourceUrl: text('source_url').notNull(),
		filePath: text('file_path').notNull(),
		formatVersion: text('format_version').notNull().default('1'),
		fetchedAt: integer('fetched_at').notNull(),
		sizeBytes: integer('size_bytes').notNull(),
		headSha: text('head_sha').notNull(),
		baseSha: text('base_sha').notNull()
	},
	(t) => ({
		repoPrIdx: index('bundles_repo_pr_idx').on(t.repoSlug, t.prNumber, t.fetchedAt)
	})
);
