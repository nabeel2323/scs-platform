-- 0068_bootstrap_owner_verification.sql
--
-- Track owner verification on bootstrap authorizations so the initial Super
-- Admin's email can be marked verified only after successful owner verification.
--
-- Forward-only. Idempotent: safe on a fresh database and on an existing
-- database (uses ADD COLUMN IF NOT EXISTS). Does NOT create any user or role.
--
-- Objects added here:
--   1. bootstrap_authorizations.email_verified_at -- timestamp stamped when an
--      authorization was issued after successful owner OTP verification (NULL
--      for break-glass / CLI-issued authorizations, which carry no owner proof).

ALTER TABLE bootstrap_authorizations
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
