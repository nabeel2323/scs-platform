-- 0021: Add is_active column to organizations for admin soft-delete / deactivation.
-- Default true so existing organizations remain active.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
