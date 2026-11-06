-- Migration 0066: Server-issued device trust credential (S-1 remediation)
--
-- WHAT IT DOES
--   Creates public.device_credentials: the server-side half of a
--   cryptographically random, opaque device credential that establishes
--   "this browser has already passed a second factor for this account".
--
-- WHY A NEW TABLE IS GENUINELY REQUIRED (audit finding S-1)
--   Trust used to be asserted from a client-generated UUID
--   (localStorage -> X-Device-Id -> sessions.device_id) and granted by
--   checkDeviceTrust() looking that value up in sessions. A value the
--   client chooses cannot be a trust anchor: copying it between browsers
--   permanently bypasses OTP, and nothing on the server could tell the
--   original holder from the copier. Trust must therefore be anchored on
--   secret bytes the SERVER issued and only the server validates, which
--   needs storage for the digest, its owner, its expiry and its revocation
--   state. sessions.device_id is deliberately NOT reused: it is unvalidated
--   client input of variable length, and keeping it as the trust key would
--   preserve the exact weakness being removed.
--
-- SECURITY PROPERTIES ENCODED BY THE SCHEMA
--   * credential_hash stores ONLY a SHA-256 digest of the 256-bit secret.
--     The secret itself never touches the database, so a data breach cannot
--     mint or replay a credential. char(64) makes an accidental plaintext
--     insert impossible rather than merely discouraged.
--   * UNIQUE on credential_hash: one credential resolves to at most one
--     row, hence to exactly one user. Cross-user reuse is structurally
--     impossible, not just checked at runtime.
--   * user_id ... ON DELETE CASCADE: deleting a user deletes their trust.
--   * created_by_session -> sessions ON DELETE SET NULL: revoking the
--     session that enrolled a device also de-trusts that device (the link
--     the old model lacked), while keeping the credential row for audit.
--   * expires_at (sliding horizon) and hard_expires_at (absolute cap) are
--     separate columns so a long-lived active device still hits a ceiling;
--     CHECK enforces the ordering so a bug cannot produce a credential that
--     slides past its own cap.
--   * revoked_at + revoked_reason: revocation is durable and explainable.
--     A revoked row stays in the table; the UNIQUE index keeps rejecting
--     the value, so revocation cannot be raced by re-insertion.
--
-- TRANSACTION CONTRACT:
--   This file MUST NOT contain its own BEGIN/COMMIT. Both migration runners
--   (apps/api/infra/drizzle/migrate.ts and migrate-pg.ts) wrap every file as
--   BEGIN -> <file> -> INSERT INTO _migration_log -> COMMIT, so either the
--   whole file applies and is logged, or nothing does and the runner exits
--   non-zero. Same convention as 0063 and 0064.
--
-- LOCKING CONTRACT:
--   Everything is a CREATE on a brand-new table plus guarded ADD CONSTRAINT,
--   so no existing hot table is touched. CREATE TABLE / CREATE INDEX are not
--   CONCURRENTLY (illegal in a transaction block); the lock cost is on the
--   new empty relation only. lock_timeout is set so an unexpected lock wait
--   aborts instead of stacking a queue behind writers.
--
-- SAFETY / IDEMPOTENCE:
--   Every statement is guarded, so a rerun is a no-op.
--
-- NO BACKFILL — AND WHY THAT IS THE SAFE CHOICE:
--   Existing sessions.device_id values are NOT converted into credentials.
--   They are client-chosen strings of unknown provenance; promoting them
--   would carry the S-1 weakness into the new model and silently mark every
--   historical device trusted. The intended consequence is stated plainly:
--   on first login after this migration, every existing browser presents no
--   credential, evaluates as untrusted, and is required to complete OTP once
--   to enrol. That is the correct security behaviour, and it is the reason
--   real OTP delivery must be configured BEFORE this migration is applied to
--   staging (see docs/reports/OTP-AUTHENTICATION-SECURITY-REMEDIATION-REPORT.md).
--   This migration is not applied to staging or production as part of the
--   remediation branch.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.device_credentials;
--   Forward-only otherwise: no existing table or column is altered, so a
--   rollback loses only device-trust state (all devices become untrusted,
--   which is the safe direction — it re-prompts OTP, it never weakens it).
--   The application does not start without the table, so rollback requires
--   deploying the previous build at the same time.

-- ═══════════════════════════════════════════════════════════════════
-- 0. Guard the lock queue for the duration of the runner's transaction.
-- ═══════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '5s';

-- ═══════════════════════════════════════════════════════════════════
-- 1. The credential table.
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.device_credentials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner. Cascades with the user, so orphaned trust cannot outlive an account.
  user_id         UUID NOT NULL
                    REFERENCES public.users(id) ON DELETE CASCADE,

  -- SHA-256 hex digest of the server-issued 256-bit secret. UNIQUE: one
  -- credential, one row, one user. The secret itself is never stored.
  credential_hash CHAR(64) NOT NULL,

  -- Non-secret display label for "my devices" (platform / user-agent prefix).
  -- Never used in a security decision.
  device_label    VARCHAR(160),

  -- Provenance: the session whose successful authentication enrolled the
  -- device. SET NULL (not CASCADE) so credential rows survive session pruning
  -- and remain auditable; explicit session revocation de-trusts via the index.
  created_by_session UUID
                    REFERENCES public.sessions(id) ON DELETE SET NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Sliding horizon: refreshed on use, so an actively used device is not
  -- re-prompted. Never allowed past hard_expires_at (see CHECK below).
  last_used_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,

  -- Absolute ceiling: fixed at issue time. Guarantees re-authentication even
  -- for a device used continuously.
  hard_expires_at TIMESTAMPTZ NOT NULL,

  -- Durable, explainable revocation. NULL = live.
  revoked_at      TIMESTAMPTZ,
  revoked_reason  VARCHAR(32),   -- LOGOUT | SESSION_REVOKED | MANUAL | ROTATION_REUSE | EXPIRED

  -- A live credential must not outlive its own hard cap.
  CONSTRAINT device_credentials_expiry_ordered
    CHECK (expires_at <= hard_expires_at),

  -- A revocation reason without a revocation timestamp is a data bug.
  CONSTRAINT device_credentials_revocation_consistent
    CHECK (revoked_at IS NOT NULL OR revoked_reason IS NULL),

  -- Only a lowercase SHA-256 hex digest may be stored. Cast to text first:
  -- the regex operators are defined on text, and an implicit bpchar->text
  -- conversion would otherwise depend on search_path operator resolution.
  -- This is what makes "the secret is never stored" a database-enforced
  -- property rather than a convention the service happens to follow.
  CONSTRAINT device_credentials_hash_is_sha256_hex
    CHECK (credential_hash::text ~ '^[0-9a-f]{64}$')
);

-- ═══════════════════════════════════════════════════════════════════
-- 2. Indexes.
-- ═══════════════════════════════════════════════════════════════════

-- Validation path: digest -> row. Declared explicitly because the column is
-- CHAR(64), whose implicit type+padding semantics make a bare UNIQUE
-- constraint and a named index equivalent here; the name documents intent and
-- gives the rollback path something to assert on.
CREATE UNIQUE INDEX IF NOT EXISTS device_credentials_credential_hash_uq
  ON public.device_credentials (credential_hash);

-- "List my trusted devices" and per-user bulk revocation.
CREATE INDEX IF NOT EXISTS device_credentials_user_active_idx
  ON public.device_credentials (user_id, expires_at)
  WHERE revoked_at IS NULL;

-- Session revocation -> de-trust. Partial: NULL provenance rows (set null on
-- session delete) need no index entries.
CREATE INDEX IF NOT EXISTS device_credentials_created_by_session_idx
  ON public.device_credentials (created_by_session)
  WHERE created_by_session IS NOT NULL;

-- Expiry sweep / housekeeping queries.
CREATE INDEX IF NOT EXISTS device_credentials_expires_at_idx
  ON public.device_credentials (expires_at);
