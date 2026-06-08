CREATE TABLE `presentation_extras` (
	`presentation_id` text PRIMARY KEY NOT NULL,
	`changesets_json` text NOT NULL DEFAULT '[]',
	`systematic_patterns_json` text NOT NULL DEFAULT '[]',
	`causal_claims_json` text NOT NULL DEFAULT '[]',
	`graph_json` text,
	FOREIGN KEY (`presentation_id`) REFERENCES `presentations`(`id`) ON DELETE cascade
);
