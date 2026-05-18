import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const repoConventions = sqliteTable(
	'repo_conventions',
	{
		id: text('id').primaryKey(),
		repoSlug: text('repo_slug').notNull(),
		source: text('source', {
			enum: ['claude_md', 'cursorrules', 'agents_md', 'windsurfrules', 'contributing', 'readme', 'other']
		}).notNull(),
		filePath: text('file_path').notNull(),
		rawContent: text('raw_content').notNull(),
		summary: text('summary'),
		embeddingJson: text('embedding_json'),
		ingestedAt: integer('ingested_at').notNull(),
		updatedAt: integer('updated_at').notNull()
	},
	(t) => ({
		repoIdx: index('repo_conventions_repo_idx').on(t.repoSlug)
	})
);

export const repoWeakSpots = sqliteTable(
	'repo_weak_spots',
	{
		id: text('id').primaryKey(),
		repoSlug: text('repo_slug').notNull(),
		tag: text('tag').notNull(),
		missRate: real('miss_rate').notNull(),
		sampleCount: integer('sample_count').notNull(),
		lastSeenAt: integer('last_seen_at').notNull(),
		createdAt: integer('created_at').notNull()
	},
	(t) => ({
		repoTagIdx: index('repo_weak_spots_repo_tag_idx').on(t.repoSlug, t.tag)
	})
);
