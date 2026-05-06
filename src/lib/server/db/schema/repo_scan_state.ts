import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const repoScanState = sqliteTable(
	'repo_scan_state',
	{
		repoSlug: text('repo_slug').primaryKey(),
		lastScannedSha: text('last_scanned_sha').notNull().default(''),
		lastScannedAt: integer('last_scanned_at').notNull(),
		totalCommitsScanned: integer('total_commits_scanned').notNull().default(0)
	},
	(t) => ({
		shaIdx: index('repo_scan_state_sha_idx').on(t.lastScannedSha)
	})
);
