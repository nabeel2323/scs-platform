-- 0021: Add is_active column to organizations for admin soft-delete / deactivation.
-- Default true so existing organizations remain active.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Track in migration log
INSERT INTO _migration_log (name, applied_at)
VALUES ('0021_org_is_active', NOW())
ON CONFLICT (name) DO NOTHING;
