CREATE TABLE IF NOT EXISTS `source_refresh_jobs` (
 id TEXT PRIMARY KEY NOT NULL,
 member TEXT NOT NULL,
 force INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'queued',
 requested_at TEXT NOT NULL,
 finished_at TEXT,
 next_attempt_at INTEGER NOT NULL DEFAULT 0,
 lock_until INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0,
 result TEXT,
 CONSTRAINT source_refresh_jobs_status CHECK(status IN ('queued','running','completed','failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS source_refresh_jobs_active_member
 ON source_refresh_jobs(member) WHERE status IN ('queued','running');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS source_refresh_jobs_due
 ON source_refresh_jobs(status,next_attempt_at,lock_until);
