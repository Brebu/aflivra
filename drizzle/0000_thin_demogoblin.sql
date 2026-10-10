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
	`error_diagnostic` text,
	`adapter_version` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `watch_items` (
	`id` text PRIMARY KEY NOT NULL,
	`install_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref` text NOT NULL,
	`label` text,
	`created_at` text NOT NULL,
	`muted` integer DEFAULT 0 NOT NULL,
	`checked_at` text,
	`fingerprint` text,
	`sigs` text,
	CONSTRAINT `watch_items_install_kind_ref_unique` UNIQUE(`install_id`, `kind`, `ref`)
);
--> statement-breakpoint
CREATE TABLE `watch_events` (
	`id` text PRIMARY KEY NOT NULL,
	`install_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`url` text NOT NULL,
	`created_at` text NOT NULL,
	`seen` integer DEFAULT 0 NOT NULL,
	`sig` text NOT NULL,
	CONSTRAINT `watch_events_install_sig_unique` UNIQUE(`install_id`, `sig`)
);
--> statement-breakpoint
CREATE TABLE `push_subs` (
	`id` text PRIMARY KEY NOT NULL,
	`install_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `push_subs_endpoint_unique` UNIQUE(`endpoint`)
);
