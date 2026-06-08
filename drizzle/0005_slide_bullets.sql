ALTER TABLE `presentation_slides` ADD `bullets_json` text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `presentation_slides` ADD `folds_json` text NOT NULL DEFAULT '[]';
