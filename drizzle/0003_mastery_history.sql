CREATE TABLE `mastery_history` (
	`id` text PRIMARY KEY NOT NULL,
	`tag` text NOT NULL,
	`repo_slug` text,
	`session_id` text,
	`ewma_score` real NOT NULL,
	`verdict` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mastery_history_tag_idx` ON `mastery_history` (`tag`,`repo_slug`);
--> statement-breakpoint
CREATE INDEX `mastery_history_created_idx` ON `mastery_history` (`created_at`);
