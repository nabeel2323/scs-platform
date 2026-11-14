-- 0065: HMAC identifier hash migration (S1.38 F-19)
--
-- Replaces unsalted SHA-256 identifier hashes in account_link_log with
-- keyed HMAC-SHA256 digests with domain separation and versioning.
--
-- Changes:
--   1. Widen identifier_hash from varchar(64) to varchar(68) to accommodate
--      the "v<N>:" version prefix (e.g. "v2:<64-hex-chars>").
--   2. Add hash_version integer column (NOT NULL DEFAULT 2).
--   3. Backfill existing rows: set hash_version = 1 (legacy unsalted SHA-256).
--
-- Rollback:
--   DROP COLUMN hash_version from account_link_log;
--   ALTER TABLE account_link_log ALTER COLUMN identifier_hash TYPE varchar(64);
--   Note: rollback loses version metadata but does NOT revert the hash values.
--   A full rehash would require application-level reprocessing.
--
-- Locking: ALTER TABLE acquires ACCESS EXCLUSIVE on account_link_log.
--   This table is append-only audit data with low write frequency;
--   the lock duration is negligible in practice.

-- Step 1: Widen the hash column to fit versioned digests.
ALTER TABLE account_link_log
  ALTER COLUMN identifier_hash TYPE varchar(68);

-- Step 2: Add hash_version column. Existing rows get version 1 (legacy SHA-256);
-- new rows default to version 2 (HMAC-SHA256).
ALTER TABLE account_link_log
  ADD COLUMN hash_version integer NOT NULL DEFAULT 2;

-- Step 3: Backfill all pre-existing rows as version 1.
UPDATE account_link_log SET hash_version = 1;
