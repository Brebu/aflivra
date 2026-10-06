CREATE TABLE `source_budget` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`used` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`data` text,
	`published_at` text,
	`last_success_at` text,
	`last_attempt_at` text,
	`expires_at` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`error` text,
	`adapter_version` text DEFAULT '' NOT NULL
);
