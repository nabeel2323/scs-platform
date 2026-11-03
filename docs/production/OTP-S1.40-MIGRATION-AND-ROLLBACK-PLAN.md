# OTP-S1.40 — Migration & Rollback Plan

**Date:** 2026-11-03
**Scope:** Database migrations 0064 and 0065 for Phase 1 email-first identity
**PR:** #104 (merged at `428b8fa`)

---

## 1. Migration Overview

| Migration | File | Purpose | Risk | Downtime |
|-----------|------|---------|------|----------|
| 0064 | `0064_email_identity.sql` | Dual-identifier schema (nullable phone, email unique index, audit table, feature flag) | MEDIUM | 5-30s (index build) |
| 0065 | `0065_hmac_identifier_hash.sql` | HMAC hash versioning (column widen, add version column) | LOW | <5s |

**Total estimated downtime:** 10-35 seconds (during index build in migration 0064)

**Locking contract:**
- Migration 0064: `ACCESS EXCLUSIVE` on `users` table during index creation (non-concurrent, inside transaction)
- Migration 0065: `ACCESS EXCLUSIVE` on `account_link_log` during ALTER TABLE
- Both migrations set `lock_timeout = '5s'` to abort rather than block writers

---

## 2. Pre-Migration Checklist

### 2.1 Verify Prerequisites

```bash
# 1. Confirm PR #104 is merged
git log --oneline origin/develop | grep "428b8fa"
# Expected: 428b8fa Merge pull request #104

# 2. Verify migration files exist
ls -la infra/drizzle/migrations/0064_email_identity.sql
ls -la infra/drizzle/migrations/0065_hmac_identifier_hash.sql
# Expected: Both files present

# 3. Check current migration state
psql -U scs -h staging-db -d scs_platform -c "SELECT migration_name FROM _migration_log ORDER BY applied_at DESC LIMIT 5;"
# Expected: Latest migration is 0063 or earlier (0064/0065 not yet applied)
```

### 2.2 Pre-Flight Data Validation

**Migration 0064 performs these checks automatically:**

```sql
-- Preflight A: Detect duplicate normalized emails
SELECT LOWER(BTRIM(email)) AS lemail, COUNT(*)
FROM users
WHERE email IS NOT NULL AND BTRIM(email) <> ''
GROUP BY lemail
HAVING COUNT(*) > 1;
-- Expected: 0 rows (no duplicates)

-- Preflight B: Detect orphan users (NULL phone AND NULL email)
SELECT COUNT(*)
FROM users
WHERE phone IS NULL AND (email IS NULL OR BTRIM(email) = '');
-- Expected: 0 (no orphans)
```

**If preflight fails:**
- **Duplicate emails:** Resolve duplicates before migration (merge accounts or add unique suffixes)
- **Orphan users:** Delete or update orphan users (add phone or email)

### 2.3 Create Database Backup

```bash
# Full database backup (method depends on infrastructure)
pg_dump -U scs -h staging-db -Fc scs_platform > backup-pre-migration-$(date +%Y%m%d-%H%M%S).dump

# Verify backup is restorable
pg_restore -l backup-pre-migration-*.dump | head -20
# Expected: Lists backup contents

# Store backup off-host (REQUIRED — staging server must not hold its only copy)
scp backup-pre-migration-*.dump backup-host:/backups/staging/
```

**Backup requirements:**
- ✅ Format: Custom (`-Fc`) for efficient restore
- ✅ Stored off-host (not on staging server)
- ✅ Retained for at least 7 days post-migration
- ✅ Tested for restorability

### 2.4 Notify Stakeholders

**Recommended notification:**
```
Subject: Staging Database Migration — Phase 1 Email Identity
Date: [scheduled date]
Time: [scheduled time] (estimated duration: 1-2 minutes)
Impact: Brief API unavailability during migration
Rollback: Soft rollback via feature flag (no data loss)

Migration details:
- Migration 0064: Email-first identity schema (nullable phone, dual-identifier support)
- Migration 0065: HMAC hash versioning for audit log

No user-facing changes expected. Existing phone OTP and password login flows unaffected.
```

---

## 3. Migration Application

### 3.1 Dry Run

```bash
# Dry-run migration chain to verify no errors
docker compose --env-file .env.staging -f infra/docker-compose.prod.yml \
  run --rm migrate /app/apps/api/node_modules/.bin/tsx infra/drizzle/migrate-pg.ts --dry-run

# Expected output:
# [dry-run] Would apply: 0064_email_identity.sql
# [dry-run] Would apply: 0065_hmac_identifier_hash.sql
# Exit code: 0
```

**If dry run fails:**
- Review error messages
- Fix any SQL syntax errors (should not happen — migrations are tested)
- Verify database connectivity
- Check preflight validation (duplicate emails, orphan users)

### 3.2 Apply Migrations

```bash
# Apply migrations as one-shot service
# Nothing else starts until this completes successfully
docker compose --env-file .env.staging -f infra/docker-compose.prod.yml \
  run --rm migrate

# Expected output:
# [migrate] Applying: 0064_email_identity.sql
# [migrate] Applied: 0064_email_identity.sql (1234ms)
# [migrate] Applying: 0065_hmac_identifier_hash.sql
# [migrate] Applied: 0065_hmac_identifier_hash.sql (567ms)
# [migrate] Migrations complete
# Exit code: 0
```

**Migration runner behavior:**
- Each migration runs in its own transaction
- `_migration_log` write is part of the same transaction (atomic)
- If a migration fails, it is NOT logged and the runner exits non-zero
- Migrations are idempotent (safe to re-run)

### 3.3 Post-Migration Validation

```sql
-- 1. Verify migration 0064 applied
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'phone';
-- Expected: phone | YES

-- 2. Verify CHECK constraint exists
SELECT conname, contype
FROM pg_constraint
WHERE conname = 'users_at_least_one_identifier';
-- Expected: users_at_least_one_identifier | c

-- 3. Verify unique index exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE indexname = 'idx_users_email_lower';
-- Expected: idx_users_email_lower | CREATE UNIQUE INDEX ... ON public.users USING btree (lower(btrim(email)))

-- 4. Verify account_link_log table exists
SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'account_link_log';
-- Expected: 1

-- 5. Verify feature flag seeded
SELECT key, enabled, created_at
FROM feature_flags
WHERE key = 'auth.email_otp.enabled';
-- Expected: auth.email_otp.enabled | f | <timestamp>

-- 6. Verify migration 0065 applied
SELECT column_name, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'account_link_log' AND column_name = 'identifier_hash';
-- Expected: identifier_hash | 68

-- 7. Verify hash_version column exists
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'account_link_log' AND column_name = 'hash_version';
-- Expected: hash_version | integer | 2

-- 8. Verify migration log
SELECT migration_name, applied_at, execution_ms
FROM _migration_log
WHERE migration_name IN ('0064_email_identity.sql', '0065_hmac_identifier_hash.sql')
ORDER BY applied_at;
-- Expected: Both migrations logged with execution times
```

### 3.4 Verify API Startup

```bash
# Start API service
docker compose --env-file .env.staging -f infra/docker-compose.prod.yml \
  up -d api

# Check logs for successful startup
docker logs api-service | tail -30
# Expected: "Nest application successfully started"
# Expected: No migration errors

# Verify health endpoint
curl -fsS https://staging-api.your-domain.com/v1/healthz
# Expected: {"status":"ok"}

# Verify readiness endpoint (checks DB + Redis)
curl -fsS https://staging-api.your-domain.com/v1/readyz
# Expected: {"status":"ok"}
```

---

## 4. Rollback Procedures

### 4.1 Soft Rollback (Feature Flag) — RECOMMENDED

**When to use:** Issues with email OTP flow, but no data corruption

**Procedure:**
```sql
-- Disable feature flag (immediate effect, no restart)
UPDATE feature_flags SET enabled = false WHERE key = 'auth.email_otp.enabled';

-- Verify
SELECT key, enabled FROM feature_flags WHERE key = 'auth.email_otp.enabled';
-- Expected: auth.email_otp.enabled | f
```

**Impact:**
- ✅ All 6 Phase 1 endpoints return 404 (not 403 — prevents enumeration)
- ✅ Existing phone OTP and password login flows unaffected
- ✅ No data loss or corruption
- ✅ No user-facing error messages (silent disable)
- ✅ No schema changes (migrations remain applied)
- ✅ Can re-enable at any time

**Verification:**
```bash
# Test email OTP endpoint (should return 404)
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/request \
  -H "Content-Type: application/json" \
  -d '{"email": "test@domain.com"}' \
  -w "\nHTTP %{http_code}\n"
# Expected: 404 Not Found

# Test phone OTP endpoint (should still work)
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/request \
  -H "Content-Type: application/json" \
  -d '{"phone": "+966500000000"}'
# Expected: 200 OK
```

**Downtime:** 0 seconds (runtime toggle)

**Data loss:** None

---

### 4.2 Hard Rollback (Schema Revert) — LAST RESORT

**When to use:** Data corruption, critical bugs, security vulnerabilities

**⚠️ WARNING:** This is a destructive operation. Requires database downtime. Not recommended unless absolutely necessary.

**Procedure:**

#### Step 1: Disable Feature Flag

```sql
UPDATE feature_flags SET enabled = false WHERE key = 'auth.email_otp.enabled';
```

#### Step 2: Stop Services

```bash
docker compose --env-file .env.staging -f infra/docker-compose.prod.yml \
  stop api web admin
```

#### Step 3: Revert Migration 0065

```sql
-- Remove hash_version column
ALTER TABLE account_link_log DROP COLUMN IF EXISTS hash_version;

-- Narrow identifier_hash back to varchar(64)
ALTER TABLE account_link_log ALTER COLUMN identifier_hash TYPE varchar(64);

-- Remove from migration log
DELETE FROM _migration_log WHERE migration_name = '0065_hmac_identifier_hash.sql';
```

#### Step 4: Handle Users with Email-Only Identity

**⚠️ CRITICAL:** Before reverting migration 0064, you must handle users who have only email (no phone).

```sql
-- Check for users with NULL phone
SELECT COUNT(*) FROM users WHERE phone IS NULL;

-- If count > 0, you have three options:

-- Option A: Delete email-only users (DATA LOSS)
DELETE FROM users WHERE phone IS NULL;

-- Option B: Add placeholder phone to email-only users
UPDATE users SET phone = '+0000000000' WHERE phone IS NULL;

-- Option C: Keep email column nullable (do NOT revert migration 0064)
-- This is the recommended approach if you have email-only users
```

#### Step 5: Revert Migration 0064 (if Option A or B)

```sql
-- Drop account_link_log table
DROP TABLE IF EXISTS account_link_log;

-- Drop case-insensitive email index
DROP INDEX IF EXISTS idx_users_email_lower;

-- Make phone NOT NULL again
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;

-- Remove CHECK constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_at_least_one_identifier;

-- Remove feature flag
DELETE FROM feature_flags WHERE key = 'auth.email_otp.enabled';

-- Remove from migration log
DELETE FROM _migration_log WHERE migration_name = '0064_email_identity.sql';
```

#### Step 6: Deploy Previous Image

```bash
SCS_IMAGE_TAG=<previous-known-good-tag> \
docker compose --env-file .env.staging -f infra/docker-compose.prod.yml \
  up -d api web admin
```

#### Step 7: Verify

```bash
curl https://staging-api.your-domain.com/v1/healthz
# Expected: {"status":"ok"}
```

**Impact:**
- ❌ All email identifiers removed from user accounts (if Option A/B)
- ❌ Users with only email (no phone) will be deleted or given placeholder phones
- ❌ Account link log lost — **AUDIT TRAIL GAP**
- ❌ Feature flag removed — **CANNOT RE-ENABLE WITHOUT RE-APPLYING MIGRATIONS**
- ❌ Requires database downtime (5-10 minutes)

**Downtime:** 5-10 minutes

**Data loss:** Potentially significant (email-only users)

**Recommendation:** Avoid hard rollback unless absolutely necessary. Prefer soft rollback + forward-fix.

---

### 4.3 Restore from Backup — EMERGENCY ONLY

**When to use:** Catastrophic data corruption, migration applied to wrong database

**⚠️ WARNING:** This restores the database to the pre-migration state. All data written after the backup is lost.

**Procedure:**

```bash
# 1. Stop all services
docker compose --env-file .env.staging -f infra/docker-compose.prod.yml \
  stop api web admin

# 2. Drop and recreate database
psql -U scs -h staging-db -c "DROP DATABASE scs_platform;"
psql -U scs -h staging-db -c "CREATE DATABASE scs_platform OWNER scs;"

# 3. Restore from backup
pg_restore -U scs -h staging-db -d scs_platform -Fc backup-pre-migration-*.dump

# 4. Verify restore
psql -U scs -h staging-db -d scs_platform -c "SELECT COUNT(*) FROM users;"
# Expected: User count matches pre-migration state

# 5. Deploy previous image
SCS_IMAGE_TAG=<previous-known-good-tag> \
docker compose --env-file .env.staging -f infra/docker-compose.prod.yml \
  up -d api web admin

# 6. Verify
curl https://staging-api.your-domain.com/v1/healthz
# Expected: {"status":"ok"}
```

**Impact:**
- ❌ All data written after backup is lost
- ❌ Requires database downtime (15-30 minutes depending on database size)
- ❌ Must re-apply migrations if you want to retry

**Downtime:** 15-30 minutes

**Data loss:** All writes after backup timestamp

**Recommendation:** Use only as last resort. Prefer soft rollback.

---

## 5. Migration Safety Properties

### 5.1 Idempotency

**Migration 0064:**
- Uses `IF NOT EXISTS` for table creation
- Uses `ON CONFLICT DO NOTHING` for feature flag insertion
- Uses `IF EXISTS` for constraint/index drops (in rollback)
- Safe to re-run

**Migration 0065:**
- Uses `IF NOT EXISTS` for column additions
- Safe to re-run

### 5.2 Atomicity

- Each migration runs in its own transaction
- `_migration_log` write is part of the same transaction
- If migration fails, it is NOT logged
- No partial application possible

### 5.3 Locking

- Migration 0064: `ACCESS EXCLUSIVE` on `users` during index build (5-30s)
- Migration 0065: `ACCESS EXCLUSIVE` on `account_link_log` (<5s)
- `lock_timeout = '5s'` prevents lock queue buildup
- If lock cannot be acquired, migration aborts (operator retries during quiet window)

### 5.4 Forward-Only

- Migrations are additive (add columns, indexes, tables)
- No destructive operations (drop column, drop table)
- Previous code tolerates extra columns and tables
- Safe to apply without code deployment

### 5.5 Pre-Flight Validation

- Migration 0064 checks for duplicate emails (case-insensitive)
- Migration 0064 checks for orphan users (NULL phone AND NULL email)
- If preflight fails, migration aborts without changes

---

## 6. Testing in Disposable Environment

### 6.1 Local Testing with Docker Compose

```bash
# Start local PostgreSQL and Redis
docker compose up -d postgres redis

# Wait for services to be ready
sleep 5

# Apply migrations
docker compose run --rm migrate

# Verify
docker compose exec postgres psql -U scs -d scs_platform -c "\dt"
# Expected: users, account_link_log, feature_flags, _migration_log, etc.

# Clean up
docker compose down -v
```

### 6.2 CI Testing

**Migrations are tested in CI:**
- `apps/api/src/__tests__/integration/migration-0064-email-identity.postgres.spec.ts` (556 lines)
- `apps/api/src/__tests__/integration/migration-0065-hmac-hash.postgres.spec.ts` (313 lines)

**CI verifies:**
- ✅ Migrations apply without errors
- ✅ Preflight checks pass
- ✅ Schema changes are correct
- ✅ Feature flag is seeded
- ✅ Rollback procedures work

**CI database:** Disposable (created and destroyed per test run)

**Note:** CI migration success does NOT prove staging migration will succeed. Staging database has real data that must pass preflight checks.

---

## 7. Troubleshooting

### 7.1 Migration Fails with "duplicate key value violates unique constraint"

**Cause:** Duplicate emails exist in `users` table (case-insensitive)

**Resolution:**
```sql
-- Find duplicates
SELECT LOWER(BTRIM(email)) AS lemail, COUNT(*)
FROM users
WHERE email IS NOT NULL
GROUP BY lemail
HAVING COUNT(*) > 1;

-- Resolve duplicates (merge accounts or add unique suffixes)
UPDATE users SET email = email || '.dup1' WHERE id = <duplicate-user-id>;
```

### 7.2 Migration Fails with "check constraint violated"

**Cause:** Orphan users exist (NULL phone AND NULL email)

**Resolution:**
```sql
-- Find orphans
SELECT id, phone, email FROM users WHERE phone IS NULL AND (email IS NULL OR BTRIM(email) = '');

-- Resolve orphans (delete or add identifier)
DELETE FROM users WHERE id = <orphan-user-id>;
-- OR
UPDATE users SET phone = '+0000000000' WHERE id = <orphan-user-id>;
```

### 7.3 Migration Fails with "lock timeout"

**Cause:** Long-running transaction holding lock on `users` table

**Resolution:**
```sql
-- Find blocking transactions
SELECT pid, usename, application_name, state, query, age(clock_timestamp(), query_start) AS age
FROM pg_stat_activity
WHERE datname = 'scs_platform' AND state != 'idle'
ORDER BY age DESC;

-- Wait for transaction to complete, or terminate if safe:
SELECT pg_terminate_backend(<pid>);

-- Retry migration during quiet window
```

### 7.4 API Fails to Start After Migration

**Cause:** Missing environment variable or configuration error

**Resolution:**
```bash
# Check logs for errors
docker logs api-service | tail -50

# Common errors:
# - "OTP_HMAC_SECRET must be at least 32 characters" → Set OTP_HMAC_SECRET
# - "JWT_ACCESS_SECRET is set to the well-known development default" → Set unique JWT_ACCESS_SECRET
# - "SMTP email provider is not configured" → Set SMTP_HOST and SMTP_FROM

# Verify environment variables
docker compose exec api printenv | grep -E "(OTP_HMAC_SECRET|JWT_ACCESS_SECRET|SMTP_)"
```

---

## 8. References

**Migration files:**
- `infra/drizzle/migrations/0064_email_identity.sql` (185 lines)
- `infra/drizzle/migrations/0065_hmac_identifier_hash.sql` (33 lines)

**Migration runner:**
- `apps/api/infra/drizzle/migrate-pg.ts`
- `infra/drizzle/migrate.ts`

**Integration tests:**
- `apps/api/src/__tests__/integration/migration-0064-email-identity.postgres.spec.ts`
- `apps/api/src/__tests__/integration/migration-0065-hmac-hash.postgres.spec.ts`

**Documentation:**
- `infra/deploy/README.md` — Deployment procedures
- `docs/production/OTP-S1.37-PHASE-1-MIGRATION-AND-ROLLBACK-RUNBOOK.md` — Original runbook
- `docs/production/OTP-S1.40-STAGING-ACTIVATION-RUNBOOK.md` — Staging activation

---

**Plan prepared by:** S1.40 staging activation preparation
**Date:** 2026-11-03
**Status:** COMPLETE — READY FOR STAGING OPERATOR REVIEW
