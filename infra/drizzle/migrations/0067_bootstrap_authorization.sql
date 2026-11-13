-- 0067_bootstrap_authorization.sql
--
-- Secure initial Super Admin bootstrap authorization store.
--
-- Forward-only. Idempotent: safe on a fresh database and on an existing
-- database (uses IF NOT EXISTS). Does NOT create any user or role -- it only
-- provisions the table that holds single-use bootstrap authorizations.
-- The plaintext bootstrap token is NEVER stored; only its SHA-256 digest is.
--
-- Objects added here:
--   1. bootstrap_authorizations -- single-use, short-lived bootstrap tokens

CREATE TABLE IF NOT EXISTS bootstrap_authorizations (
  id            UUID        PRIMARY KEY,
  token_digest  CHAR(64)    NOT NULL UNIQUE, -- sha-256(plaintext token)
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,
  consumed      BOOLEAN     NOT NULL DEFAULT FALSE,
  purpose       VARCHAR(40) NOT NULL DEFAULT 'super_admin_bootstrap',
  created_by    VARCHAR(120),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bootstrap_authorizations_digest
  ON bootstrap_authorizations(token_digest);

CREATE INDEX IF NOT EXISTS idx_bootstrap_authorizations_expires
  ON bootstrap_authorizations(expires_at);

CREATE INDEX IF NOT EXISTS idx_bootstrap_authorizations_consumed
  ON bootstrap_authorizations(consumed);
