import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const llmCache = sqliteTable(
	'llm_cache',
	{
		hash: text('hash').primaryKey(),
		task: text('task').notNull(),
		responseJson: text('response_json').notNull(),
		modelId: text('model_id'),
		latencyMs: integer('latency_ms'),
		createdAt: integer('created_at').notNull()
	},
	(t) => ({
		taskIdx: index('llm_cache_task_idx').on(t.task),
		createdIdx: index('llm_cache_created_idx').on(t.createdAt)
	})
);
