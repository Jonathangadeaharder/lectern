CREATE TABLE `bug_commits` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_slug` text NOT NULL,
	`sha` text NOT NULL,
	`message` text NOT NULL,
	`is_bug_fix` integer DEFAULT false NOT NULL,
	`is_refactor` integer DEFAULT false NOT NULL,
	`blame_sha` text,
	`pattern_id` text,
	`analyzed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bug_commits_repo_sha_idx` ON `bug_commits` (`repo_slug`,`sha`);--> statement-breakpoint
CREATE TABLE `bug_patterns` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_slug` text NOT NULL,
	`summary` text NOT NULL,
	`root_cause` text,
	`fix_pattern` text,
	`file_globs_json` text DEFAULT '[]' NOT NULL,
	`frequency` integer DEFAULT 1 NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`last_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bug_patterns_repo_idx` ON `bug_patterns` (`repo_slug`);--> statement-breakpoint
CREATE TABLE `skill_mastery` (
	`id` text PRIMARY KEY NOT NULL,
	`tag` text NOT NULL,
	`repo_slug` text,
	`ewma_score` real DEFAULT 0.5 NOT NULL,
	`level` text DEFAULT 'novice' NOT NULL,
	`total_attempts` integer DEFAULT 0 NOT NULL,
	`pass_count` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer,
	`last_decay_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_mastery_tag_repo_uq` ON `skill_mastery` (`tag`,`repo_slug`);--> statement-breakpoint
CREATE TABLE `repo_conventions` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_slug` text NOT NULL,
	`source` text NOT NULL,
	`file_path` text NOT NULL,
	`raw_content` text NOT NULL,
	`summary` text,
	`embedding_json` text,
	`ingested_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `repo_conventions_repo_idx` ON `repo_conventions` (`repo_slug`);--> statement-breakpoint
CREATE TABLE `repo_weak_spots` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_slug` text NOT NULL,
	`tag` text NOT NULL,
	`miss_rate` real NOT NULL,
	`sample_count` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `repo_weak_spots_repo_tag_idx` ON `repo_weak_spots` (`repo_slug`,`tag`);--> statement-breakpoint
CREATE TABLE `repo_competence` (
	`repo_slug` text PRIMARY KEY NOT NULL,
	`total_sessions` integer DEFAULT 0 NOT NULL,
	`total_questions` integer DEFAULT 0 NOT NULL,
	`avg_score` real,
	`last_session_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`repo_slug` text NOT NULL,
	`date` text NOT NULL,
	`questions_attempted` integer DEFAULT 0 NOT NULL,
	`questions_passed` integer DEFAULT 0 NOT NULL,
	`active_time_ms` integer DEFAULT 0 NOT NULL,
	`chunks_reviewed` integer DEFAULT 0 NOT NULL,
	`avg_score` real,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `session_activity_date_idx` ON `session_activity` (`date`);--> statement-breakpoint
CREATE INDEX `session_activity_repo_idx` ON `session_activity` (`repo_slug`);