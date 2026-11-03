-- Migration 0064: Email-First Identity (S1.35 Phase 1) — rev.2 (S1.37 audit)
-- Makes users.phone nullable, adds dual-identifier CHECK constraint,
-- case-insensitive email unique index, and account_link_log audit table.
--
-- TRANSACTION CONTRACT (S1.37 audit correction):
--   This file MUST NOT contain its own BEGIN/COMMIT. Both migration runners
--   (apps/api/infra/drizzle/migrate.ts and migrate-pg.ts) wrap every file as
--   BEGIN -> <file> -> INSERT INTO _migration_log -> COMMIT, so either the whole
--   file applies and is logged, or nothing is and the runner exits non-zero.
--   An embedded COMMIT used to close the runner's transaction early, leaving the
--   _migration_log write outside the atomic unit (verified: "WARNING: there is no
--   transaction in progress"). This matches the convention stated in 0063.
--
-- LOCKING CONTRACT (S1.37 audit correction):
--   Everything here runs inside the runner's transaction, therefore
--   CREATE UNIQUE INDEX runs as an ordinary (non-CONCURRENT) build and takes
--   ACCESS EXCLUSIVE on public.users for the duration of the build. CONCURRENTLY
--   is illegal inside a transaction block and is NOT used. A lock_timeout is set
--   so a busy table aborts quickly instead of stacking up a lock queue behind
--   long-running writers.
--
-- SAFETY: Idempotent — every statement is guarded so a rerun is a no-op.
--   Forward-only: never blindly restores NOT NULL on phone.
--   Preflight: aborts on duplicate normalized emails, so the unique index can
--   never fail halfway and leave the migration logged as applied.

-- ═══════════════════════════════════════════════════════════════════
-- 0. Guard the lock queue. Applied only for the duration of the
--    runner's transaction. Aborts rather than blocking writers behind
--    a long transaction; the operator then retries during a quiet window.
-- ═══════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '5s';

-- ═══════════════════════════════════════════════════════════════════
-- Preflight A: detect duplicate normalized emails.
-- The application's identity key is normalizeEmail() === trim + lowercase,
-- so the check MUST use LOWER(BTRIM(email)) — not LOWER(email) alone,
-- which silently misses whitespace-variant duplicates in pre-existing rows.
-- Blank/whitespace-only emails are excluded: they are not identities.
-- This is a read-only check; it never modifies data.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  dup_count INT;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT LOWER(BTRIM(email)) AS lemail
    FROM users
    WHERE email IS NOT NULL AND BTRIM(email) <> ''
    GROUP BY LOWER(BTRIM(email))
    HAVING COUNT(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % duplicate normalized email group(s) detected in users table. Resolve duplicates manually before running this migration.', dup_count;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- Preflight B: refuse to add the identifier CHECK while a row has no
-- usable identifier at all (phone NULL and email NULL/blank). Such a row
-- cannot exist before this migration (phone was NOT NULL) but CAN exist
-- on a rerun against a database that was modified in between, and the
-- ADD CONSTRAINT would then fail with an opaque error mid-transaction.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM users
  WHERE phone IS NULL AND (email IS NULL OR BTRIM(email) = '');

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % user row(s) have no usable identifier (phone NULL and email NULL/blank). Resolve them before running this migration.', orphan_count;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 1. Make phone nullable (was NOT NULL in original schema 0001).
--    Metadata-only change: no table rewrite, no row touched.
--    Existing users, sessions, memberships and FK relationships are
--    unaffected — this ALTER changes a column modifier, never data.
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 2. CHECK constraint: at least one USABLE identifier.
--    S1.37 audit correction: the previous predicate
--    (phone IS NOT NULL OR email IS NOT NULL) was bypassed by email = ''
--    because an empty string IS NOT NULL, which let a user row exist with
--    no reachable identifier at all (verified against a disposable
--    PostgreSQL instance). BTRIM(email) <> '' closes that gap and matches
--    the blank-rejection normalizeEmail() applies in the application.
--    Guarded by conname existence so a rerun is a no-op.
--    S1.37 audit addition: a database that already carries the weaker rev.1
--    predicate is detected and rebuilt, because a bare name check would leave
--    the empty-string bypass in place forever. Re-adding a CHECK re-validates
--    the table under ACCESS EXCLUSIVE — same locking note as section 3.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  cdef TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO cdef
  FROM pg_constraint WHERE conname = 'users_at_least_one_identifier';

  IF cdef IS NULL THEN
    ALTER TABLE users ADD CONSTRAINT users_at_least_one_identifier
      CHECK (phone IS NOT NULL OR (email IS NOT NULL AND BTRIM(email) <> ''));
  ELSIF cdef NOT LIKE '%btrim%' THEN
    ALTER TABLE users DROP CONSTRAINT users_at_least_one_identifier;
    ALTER TABLE users ADD CONSTRAINT users_at_least_one_identifier
      CHECK (phone IS NOT NULL OR (email IS NOT NULL AND BTRIM(email) <> ''));
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 3. Case-insensitive unique index on non-null email addresses.
--    Key is LOWER(BTRIM(email)) so DB uniqueness matches the application's
--    normalizeEmail() identity rule; 'User@Example.com', 'user@example.com'
--    and ' user@example.com ' all collide.
--    Partial predicate excludes NULL and blank emails, so placeholder
--    empty strings never occupy an identity slot.
--    S1.37 audit correction: a stale index created by rev.1 keyed on
--    LOWER(email) alone is detected and rebuilt, because
--    CREATE UNIQUE INDEX IF NOT EXISTS would otherwise silently keep the
--    weaker definition forever.
--    Locking: ordinary CREATE UNIQUE INDEX inside the runner transaction =>
--    ACCESS EXCLUSIVE on users for the build (see LOCKING CONTRACT).
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  def TEXT;
BEGIN
  SELECT indexdef INTO def
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'users' AND indexname = 'idx_users_email_lower';

  IF def IS NOT NULL
     AND def NOT LIKE '%lower(btrim(email::text))%'
     AND def NOT LIKE '%lower(btrim((email)::text))%' THEN
    DROP INDEX idx_users_email_lower;
    def := NULL;
  END IF;

  IF def IS NULL THEN
    CREATE UNIQUE INDEX idx_users_email_lower
      ON users (LOWER(BTRIM(email)))
      WHERE email IS NOT NULL AND BTRIM(email) <> '';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 4. Account link/unlink audit log
--    Records every identifier link and unlink operation for security audit.
--    identifier_hash is SHA-256 of the normalized identifier — never stores
--    raw phone/email values in this audit table.
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS account_link_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action          VARCHAR(16) NOT NULL,  -- 'LINK' or 'UNLINK'
  identifier_type VARCHAR(8)  NOT NULL,  -- 'PHONE' or 'EMAIL'
  identifier_hash VARCHAR(64) NOT NULL,  -- SHA-256 of normalized identifier
  performed_by    UUID,                  -- NULL for self-service
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_link_log_user
  ON account_link_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_link_log_action
  ON account_link_log(action, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- 5. Feature flag: auth.email_otp.enabled
--    Defaults to FALSE (disabled). Enable at runtime via:
--    UPDATE feature_flags SET enabled = true WHERE key = 'auth.email_otp.enabled';
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO feature_flags (key, enabled, description)
VALUES ('auth.email_otp.enabled', false, 'Enable email OTP authentication (S1.35 Phase 1)')
ON CONFLICT (key) DO NOTHING;
