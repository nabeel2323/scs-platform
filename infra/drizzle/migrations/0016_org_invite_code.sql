-- Migration 0016: Organization Invite Codes
-- Adds a shareable invite_code to organizations so users can JOIN an existing
-- org during registration (in addition to creating a new one).
-- Idempotent: safe to re-run.

BEGIN;

-- Add invite code column (nullable so the unique index tolerates pre-existing rows)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS invite_code VARCHAR(12);

-- Unique lookup index for join-by-code
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_invite_code ON organizations(invite_code);

-- Backfill codes for organizations created before this migration
UPDATE organizations
SET invite_code = upper(substr(md5(random()::text || id::text), 1, 10))
WHERE invite_code IS NULL;

COMMIT;
