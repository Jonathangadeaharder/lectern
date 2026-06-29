ALTER TABLE `answers` ADD `self_confidence` integer;
--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`chunk_id` text NOT NULL,
	`file` text NOT NULL,
	`line` integer NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmarks_session_idx` ON `bookmarks` (`session_id`);
--> statement-breakpoint
CREATE TABLE `llm_cache` (
	`hash` text PRIMARY KEY NOT NULL,
	`task` text NOT NULL,
	`response_json` text NOT NULL,
	`model_id` text,
	`latency_ms` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `llm_cache_task_idx` ON `llm_cache` (`task`);
--> statement-breakpoint
CREATE INDEX `llm_cache_created_idx` ON `llm_cache` (`created_at`);
