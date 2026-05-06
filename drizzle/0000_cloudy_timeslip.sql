CREATE TABLE `answers` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`question_id` text NOT NULL,
	`format` text NOT NULL,
	`payload_json` text NOT NULL,
	`grading_json` text,
	`raw_score` real,
	`verdict` text,
	`submitted_at` integer NOT NULL,
	`graded_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `session_questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `answers_session_idx` ON `answers` (`session_id`);--> statement-breakpoint
CREATE INDEX `answers_question_idx` ON `answers` (`question_id`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bundles` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_slug` text NOT NULL,
	`pr_number` integer NOT NULL,
	`source_url` text NOT NULL,
	`file_path` text NOT NULL,
	`format_version` text DEFAULT '1' NOT NULL,
	`fetched_at` integer NOT NULL,
	`size_bytes` integer NOT NULL,
	`head_sha` text NOT NULL,
	`base_sha` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bundles_repo_pr_idx` ON `bundles` (`repo_slug`,`pr_number`,`fetched_at`);--> statement-breakpoint
CREATE TABLE `chunk_sets` (
	`bundle_id` text NOT NULL,
	`head_sha` text NOT NULL,
	`chunks_json` text NOT NULL,
	`generated_at` integer NOT NULL,
	PRIMARY KEY(`bundle_id`, `head_sha`),
	FOREIGN KEY (`bundle_id`) REFERENCES `bundles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session_chunks` (
	`session_id` text NOT NULL,
	`chunk_id` text NOT NULL,
	`position` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`entered_at` integer,
	`completed_at` integer,
	`active_time_ms` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`session_id`, `chunk_id`),
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_chunks_position_idx` ON `session_chunks` (`session_id`,`position`);--> statement-breakpoint
CREATE TABLE `debriefs` (
	`session_id` text PRIMARY KEY NOT NULL,
	`generated_at` integer NOT NULL,
	`confidence_score` real NOT NULL,
	`band` text NOT NULL,
	`recommendation` text NOT NULL,
	`per_chunk_json` text NOT NULL,
	`missed_by_tag_json` text NOT NULL,
	`follow_ups_json` text NOT NULL,
	`prompt_version` text NOT NULL,
	`model` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`bundle_id` text NOT NULL,
	`head_sha` text NOT NULL,
	`state` text DEFAULT 'created' NOT NULL,
	`current_chunk_index` integer DEFAULT 0 NOT NULL,
	`current_question_id` text,
	`started_at` integer,
	`last_activity_at` integer,
	`paused_at` integer,
	`resumed_at` integer,
	`ended_at` integer,
	`wall_time_ms` integer DEFAULT 0 NOT NULL,
	`active_time_ms` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`bundle_id`) REFERENCES `bundles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `session_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`chunk_id` text NOT NULL,
	`position` integer NOT NULL,
	`format` text NOT NULL,
	`type` text NOT NULL,
	`prompt_json` text NOT NULL,
	`rubric_json` text,
	`skill_tags_json` text DEFAULT '[]' NOT NULL,
	`difficulty` text DEFAULT 'medium' NOT NULL,
	`derived_from_json` text NOT NULL,
	`prompt_version` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`shown_at` integer,
	`submitted_at` integer,
	`graded_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_questions_session_chunk_idx` ON `session_questions` (`session_id`,`chunk_id`,`position`);--> statement-breakpoint
CREATE TABLE `preflight_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`preflight_result_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`preflight_result_id`) REFERENCES `preflight_results`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `preflight_results` (
	`id` text PRIMARY KEY NOT NULL,
	`bundle_id` text NOT NULL,
	`head_sha` text NOT NULL,
	`decision` text NOT NULL,
	`counts_json` text NOT NULL,
	`findings_json` text NOT NULL,
	`pr_agent_run_id` text,
	`error_kind` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bundle_id`) REFERENCES `bundles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preflight_bundle_head_uq` ON `preflight_results` (`bundle_id`,`head_sha`);--> statement-breakpoint
CREATE TABLE `pr_agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`bundle_id` text NOT NULL,
	`task` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`output_json` text,
	`error_kind` text,
	`error_message` text,
	FOREIGN KEY (`bundle_id`) REFERENCES `bundles`(`id`) ON UPDATE no action ON DELETE cascade
);
