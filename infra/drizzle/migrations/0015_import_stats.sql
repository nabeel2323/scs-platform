-- Migration 0011: import job stats
-- Adds a stats JSONB column to import_jobs so processed import results
-- (created/updated/skipped/errors) are queryable by polling clients.

ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS stats JSONB NOT NULL DEFAULT '{}';
