CREATE TABLE `presentations` (
	`id` text PRIMARY KEY NOT NULL,
	`bundle_id` text NOT NULL,
	`head_sha` text NOT NULL,
	`format_version` text NOT NULL DEFAULT '1',
	`generated_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`filesystem_path` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`scope_files_json` text NOT NULL,
	`coverage_status` text NOT NULL DEFAULT 'unknown',
	`coverage_summary_json` text,
	FOREIGN KEY (`bundle_id`) REFERENCES `bundles`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `presentations_bundle_idx` ON `presentations` (`bundle_id`,`head_sha`);
--> statement-breakpoint
CREATE TABLE `presentation_slides` (
	`presentation_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`covers_json` text NOT NULL DEFAULT '[]',
	`verbatim_ranges_json` text NOT NULL DEFAULT '[]',
	`nofidelity` integer NOT NULL DEFAULT 0,
	PRIMARY KEY(`presentation_id`, `position`),
	FOREIGN KEY (`presentation_id`) REFERENCES `presentations`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `presentation_slides_position_idx` ON `presentation_slides` (`presentation_id`,`position`);
