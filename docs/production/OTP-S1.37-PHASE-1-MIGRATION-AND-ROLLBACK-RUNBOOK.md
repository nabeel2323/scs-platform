# OTP-S1.37 Phase 1 — Migration and Rollback Runbook (corrected, authoritative)

- **Document ID:** OTP-S1.37-PHASE-1-MIGRATION-AND-ROLLBACK-RUNBOOK
- **Sprint:** S1.37 — Phase 1 Independent Audit and Final Acceptance
- **Date:** 2026-10-31
- **Supersedes:** [`OTP-S1.35-PHASE-1-MIGRATION-AND-ROLLBACK-RUNBOOK.md`](./OTP-S1.35-PHASE-1-MIGRATION-AND-ROLLBACK-RUNBOOK.md) v1.0 (see §10 for the claim-by-claim correction record)
- **Migration file:** `infra/drizzle/migrations/0064_email_identity.sql` (rev.2)
- **Repository state at publication:** see §1.1
- **Audience:** authorized deployment personnel only

> **Every command and SQL fragment in this runbook is a description of an authorized
> production procedure. Nothing in it was executed against staging or production during
> the S1.37 audit.** All behavioural claims were verified against a **disposable**
> PostgreSQL 16 instance only (Testcontainers `postgres:16-alpine` and one throwaway
> `docker run` container). No real SMTP, SMS or WhatsApp message was sent, and no real
> credential or user contact detail appears anywhere in this document.

---

## 1. Repository state and scope

### 1.1 Commit identity

| Item                               | Value                                                                                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch                             | `feat/auth-email-otp-phase1`                                                                                                                                                                   |
| Baseline (audited starting commit) | `2abb53881c87724c338e2a2a94b8e9be78e70c23`                                                                                                                                                     |
| Baseline relationship to `develop` | recorded in the audit report §1                                                                                                                                                                |
| Audited final SHA (code)           | `5581e6a46d4705c21a97cc941a696896f8f7973e`                                                                                                                                                     |
| Documentation commits on top       | `00f59dedd1f54f75c76cb1cd0b24d9ccb6a0721f` (this runbook, the two S1.35 corrections and the two S1.37 reports) plus a later documentation-only commit carrying the post-commit re-verification |
| Audit window                       | opened 2026-10-31, closed 2026-11-01 (local time, UTC+03:00)                                                                                                                                   |
| Migration audited                  | `0064_email_identity.sql` rev.2 (rewritten during S1.37)                                                                                                                                       |

### 1.2 What rev.2 changed relative to the rev.1 file the v1.0 runbook described

| #   | rev.1                                                                        | rev.2                                                                                                 |
| --- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | Embedded `BEGIN;` … `COMMIT;`                                                | **No transaction control** — the runner owns it                                                       |
| 2   | No lock timeout                                                              | `SET LOCAL lock_timeout = '5s'`                                                                       |
| 3   | One preflight on `LOWER(email)`                                              | Two preflights: duplicates on `LOWER(BTRIM(email))` **and** orphan-identifier scan                    |
| 4   | `CHECK (phone IS NOT NULL OR email IS NOT NULL)`                             | `CHECK (phone IS NOT NULL OR (email IS NOT NULL AND BTRIM(email) <> ''))`                             |
| 5   | `CREATE UNIQUE INDEX IF NOT EXISTS … (LOWER(email)) WHERE email IS NOT NULL` | guarded create-or-reconcile on `LOWER(BTRIM(email))` `WHERE email IS NOT NULL AND BTRIM(email) <> ''` |
| 6   | Unindexed audit table                                                        | `account_link_log` + `user_id`/`action` secondary indexes, `ON DELETE CASCADE`                        |

Findings behind each change are numbered **S1.37-F-02**, **F-07**, **F-08** in the audit report.

---

## 2. Migration summary (corrected)

| Item                | Detail                                                                                                                                                                                                                                                                                                                               | Verified how                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Migration file      | `0064_email_identity.sql`                                                                                                                                                                                                                                                                                                            | read from disk                                     |
| Migration number    | 0064                                                                                                                                                                                                                                                                                                                                 | filename                                           |
| Statements          | 8 top-level statements: 1 `SET LOCAL`, 2 preflight `DO` blocks, 1 `ALTER TABLE … DROP NOT NULL`, 2 guarded `DO` blocks (CHECK, index), `CREATE TABLE IF NOT EXISTS` + 2 `CREATE INDEX IF NOT EXISTS`, 1 `INSERT … ON CONFLICT DO NOTHING`                                                                                            | `psql` echo of a real apply (§11 R1a)              |
| Data backfill       | **None.** No row is read for update and no row is written to `users`                                                                                                                                                                                                                                                                 | §11 R1b (identical ids, phone, email before/after) |
| Estimated wall time | Preflight is a full scan of `users`; the rest is metadata + one index build. On a table with no duplicate/blank conflicts and no long-running writers, the observed disposable run completed in well under a second. **Do not treat "< 5 seconds" as a production estimate without measuring your own table size and write traffic** | §11                                                |
| Lock level          | **`ACCESS EXCLUSIVE` on `public.users`, held for the whole transaction** — see §5                                                                                                                                                                                                                                                    | §5                                                 |
| Downtime required   | **Not strictly**, but the migration cannot acquire its lock while a long reader/writer holds `users`, and with `lock_timeout = '5s'` it will **abort after 5 s rather than queue**                                                                                                                                                   | §5.4                                               |
| Backward compatible | Yes — phone-only users keep working; the CHECK is satisfied by every pre-existing row because `phone` was `NOT NULL` before 0064                                                                                                                                                                                                     | §11 R1b, R3.4                                      |
| Rerunnable          | **Qualified.** The SQL body is idempotent. The _runner step_ is not re-appliable for a migration already recorded in `_migration_log`. See §4                                                                                                                                                                                        | §11 R2, R2c                                        |
| Feature flag        | `auth.email_otp.enabled`, inserted **disabled**                                                                                                                                                                                                                                                                                      | §11 R1c                                            |

---

## 3. Prerequisites

| Prerequisite                                          | Verification                                                                                 | Notes                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| PostgreSQL 14+                                        | `SELECT version();`                                                                          | `BTRIM`, `gen_random_uuid`, partial indexes all available         |
| 0063 applied                                          | `SELECT name FROM _migration_log WHERE name = '0063'                                         |                                                                   | '_inventory_reserved.sql';` | adjust to the actual 0063 filename in `infra/drizzle/migrations/` |
| `_migration_log` exists                               | `SELECT to_regclass('_migration_log');`                                                      | both runners create it if absent                                  |
| `feature_flags` exists with a `key` UNIQUE constraint | `\d feature_flags`                                                                           | the final `INSERT … ON CONFLICT (key)` needs it                   |
| `users.email` column exists                           | `SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='email';` | 0064 adds no column; it only indexes/constrains an existing one   |
| Backup + restore rehearsal                            | DBA attestation                                                                              | mandatory; §9 explains why a restore is the _only_ true rollback  |
| Quiet window                                          | `SELECT count(*) FROM pg_stat_activity WHERE state <> 'idle';`                               | needed because of `ACCESS EXCLUSIVE`, not because the DDL is slow |

---

## 4. Rerun semantics — the precise claim

The v1.0 runbook said "**Idempotent: safe to run multiple times**". Measured behaviour (disposable PostgreSQL, §11) is:

1. **Normal operator rerun is a genuine no-op.** Both runners read
   `SELECT name FROM _migration_log` first and **skip** any file already recorded, so
   restarting the API after 0064 has been applied neither executes 0064 nor changes
   anything.
2. **The SQL body alone is idempotent.** Applying `0064_email_identity.sql` a second time
   with `psql -f` and no wrapper exits 0, changes no schema object and no row
   (`§11 R2c`: `ALTER TABLE / DO / DO / CREATE TABLE / CREATE INDEX / CREATE INDEX / INSERT 0 0`,
   `EXIT=0`; index, constraint, flag and row counts each stayed at exactly 1/1/1/2).
3. **A blind rerun through the runner wrapper fails — by design.** The wrapper is
   `BEGIN; → <file> → INSERT INTO _migration_log (name) VALUES ('0064_email_identity.sql'); → COMMIT;`
   and `_migration_log.name` is a `PRIMARY KEY`, so the second `INSERT` raises
   `duplicate key value violates unique constraint "_migration_log_pkey"` and the whole
   transaction rolls back. Observed: `EXIT=3` with `ON_ERROR_STOP=1`, one log row, one index,
   one constraint, one flag row, two users — i.e. **no damage, non-zero exit** (§11 R2).
   This is also asserted by the automated test
   _"a blind rerun through the real runner contract fails and rolls back"_ in
   `apps/api/src/__tests__/integration/migration-0064-email-identity.postgres.spec.ts`.

**Operational rule:** never re-apply a recorded migration by hand. If a rerun is needed to
reconcile a database whose 0064 objects were altered out-of-band (for example a rev.1
index still present), apply rev.2 as described in §6 — the guarded `DO` blocks rebuild a
stale definition and are otherwise inert — and then insert the `_migration_log` row
yourself only if it is genuinely missing.

---

## 5. Transaction and lock behaviour (verified)

### 5.1 Who owns the transaction

Both runners wrap **each migration file** in its own transaction:

| Runner                                 | Used by                                               | Wrapper                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/infra/drizzle/migrate.ts`    | local dev (`db:migrate`), drives `docker exec psql`   | builds `/tmp/_migrate.sql` = `BEGIN;` + file + `INSERT INTO _migration_log …` + `COMMIT;`, executed with `-v ON_ERROR_STOP=1` |
| `apps/api/infra/drizzle/migrate-pg.ts` | CI (`db:migrate:ci`) and any direct-connection deploy | `client.query('BEGIN')` → `client.query(sql)` → log insert → `COMMIT`, `ROLLBACK` on error                                    |

Therefore a **migration file must contain no `BEGIN`/`COMMIT`/`ROLLBACK` of its own**. rev.1
violated this. The observable failure mode was PostgreSQL emitting
`WARNING: there is no transaction in progress` and committing the DDL while the
`_migration_log` insert (and any later statement) sat outside an atomic unit — a migration
could be recorded, or not recorded, in a way that did not match the schema. A regression test
now pins the contract by scanning the file text:
_"migration file carries no embedded transaction control (runner contract)"_.

### 5.2 Locks actually taken

| Statement                                            | Lock                                          | Notes                                                                                               |
| ---------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `SET LOCAL lock_timeout = '5s'`                      | —                                             | transaction-scoped; applies to every lock request below                                             |
| Preflight A/B `DO` blocks                            | `ACCESS SHARE` on `users`                     | plain reads; block only if a writer already holds `ACCESS EXCLUSIVE`                                |
| `ALTER TABLE users ALTER COLUMN phone DROP NOT NULL` | `ACCESS EXCLUSIVE` on `users`                 | metadata-only: **no table rewrite, no row touched**                                                 |
| `ALTER TABLE users ADD CONSTRAINT … CHECK (…)`       | `ACCESS EXCLUSIVE` on `users`                 | validates the whole table under the lock (0064 uses `ADD CONSTRAINT`, not `NOT VALID` + `VALIDATE`) |
| `CREATE UNIQUE INDEX idx_users_email_lower`          | `ACCESS EXCLUSIVE` on `users`                 | **ordinary, non-concurrent build**                                                                  |
| `CREATE TABLE IF NOT EXISTS account_link_log`        | locks on `users` (FK) + `CREATE` in schema    | new object                                                                                          |
| `CREATE INDEX IF NOT EXISTS idx_account_link_log_*`  | `ACCESS EXCLUSIVE` on `account_link_log`      | new, empty table                                                                                    |
| `INSERT INTO feature_flags … ON CONFLICT DO NOTHING` | `ROW EXCLUSIVE` + row lock on `feature_flags` | one row                                                                                             |

### 5.3 Why `CONCURRENTLY` is **not** and cannot be used

`CREATE INDEX CONCURRENTLY` **cannot run inside a transaction block**
(`ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block`). Because the
runner puts every file inside `BEGIN … COMMIT`, a concurrent build is structurally
unavailable to any migration in this repository. The v1.0 claim that the index
"uses `CONCURRENTLY` pattern internally via Drizzle" is **false and is withdrawn**. The
index is built with a plain `CREATE UNIQUE INDEX`, and the consequences in §5.2/§5.4 are the
real ones.

Verified by direct experiment (§11 R-wrapped output): the apply emits `CREATE INDEX`, not
`CREATE INDEX CONCURRENTLY`, and succeeds; and the automated test asserts the recorded
`pg_indexes.indexdef` starts `CREATE UNIQUE INDEX idx_users_email_lower ON public.users USING btree (lower(btrim(...)))`.

### 5.4 Practical consequence for the operator

`users` is on the hot path of every authenticated request. The migration holds
`ACCESS EXCLUSIVE` on it for the duration of (a) the CHECK validation scan, (b) the unique
index build, and (c) the remainder of the transaction. Consequences:

- Any query that arrives after the lock is granted queues behind it.
- Any query that already holds a weaker lock blocks the migration. With
  `lock_timeout = '5s'` the **migration gives up** after 5 s and the runner exits non-zero
  with a fully rolled-back transaction, rather than stacking an unbounded lock queue behind a
  long-running writer. This is the intended failure mode: retry in a quieter window.
- Therefore: run 0064 during a low-traffic window, and treat a
  `canceling lock request timed out` / `lock_timeout` error as **safe to retry** — nothing was
  committed.

### 5.5 Optional pre-flight lock inspection

```sql
-- Disposable-safe, read-only. Run immediately before applying.
SELECT pid, state, wait_event_type, wait_event, now() - query_start AS age, left(query, 80)
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
  AND now() - query_start > interval '30 seconds'
ORDER BY age DESC;
-- Expected: 0 rows. Any long writer against "users" here will make 0064 hit lock_timeout.
```

---

## 6. Applying the migration

### 6.1 Recommended path — the repository runner

```bash
# LOCAL / DISPOSABLE DATABASE ONLY. Never point DATABASE_URL or the dev container
# at staging or production from a workstation.
pnpm --filter @scs/api db:migrate          # docker exec psql based
pnpm --filter @scs/api db:migrate:ci       # node-postgres based, used by CI
```

Both are idempotent at the _skip_ level (§4.1) and atomic per file (§5.1). Success criterion:
exactly one new line `0064_email_identity.sql` in `_migration_log` and exit code 0.

### 6.2 Manual path — DBA-supervised, single transaction

Use this only when the runner is unavailable. The wrapper is reproduced exactly so the
outcome matches §4.3 semantics:

```bash
# <disposable-only> — copy, do not paste blindly; substitute your own connection
{ echo 'BEGIN;'; \
  cat infra/drizzle/migrations/0064_email_identity.sql; \
  echo "INSERT INTO _migration_log (name) VALUES ('0064_email_identity.sql');"; \
  echo 'COMMIT;'; } > /tmp/0064-wrapped.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/0064-wrapped.sql
echo "EXIT=$?"
```

`ON_ERROR_STOP=1` is mandatory. Without it `psql` continues past a failed statement and
still exits 0 — which is precisely the defect the P13 Phase 4.1 runner fix removed.

### 6.3 Order of operations inside the file

1. `SET LOCAL lock_timeout = '5s'`
2. Preflight A — duplicate **normalized** emails (`LOWER(BTRIM(email))`, blanks excluded)
3. Preflight B — rows with **no usable identifier** (`phone IS NULL AND (email IS NULL OR BTRIM(email)='')`)
4. `ALTER TABLE users ALTER COLUMN phone DROP NOT NULL`
5. CHECK constraint — create, **or rebuild a stale rev.1 definition**, or no-op
6. Unique index — create, **or rebuild a stale rev.1 definition**, or no-op
7. `account_link_log` + its two secondary indexes
8. `INSERT` the `auth.email_otp.enabled` flag row (disabled) `ON CONFLICT (key) DO NOTHING`

Any failure aborts the whole file with nothing committed.

---

## 7. Pre-flight checks (operator-run, before apply)

All read-only.

```sql
-- 7.1 Duplicate NORMALIZED emails. MUST use LOWER(BTRIM(email)) to match
--     normalizeEmail() === trim().toLowerCase(). LOWER(email) alone is NOT enough.
SELECT LOWER(BTRIM(email)) AS norm, COUNT(*) AS cnt
FROM users
WHERE email IS NOT NULL AND BTRIM(email) <> ''
GROUP BY LOWER(BTRIM(email))
HAVING COUNT(*) > 1;
-- Expected: 0 rows.

-- 7.2 Blank/whitespace emails masquerading as identifiers (S1.37-F-07).
SELECT COUNT(*) AS blank_email_rows
FROM users
WHERE email IS NOT NULL AND BTRIM(email) = '';
-- Expected: 0. Non-zero is NOT a blocker for the CHECK (phone rescues the row)
-- but the blank value will be excluded from the unique index, so review it.

-- 7.3 Rows that would violate the new CHECK (they cannot exist pre-0064, but a
--     partially-migrated or hand-patched database can have them).
SELECT COUNT(*) AS orphan_identifier_rows
FROM users
WHERE phone IS NULL AND (email IS NULL OR BTRIM(email) = '');
-- Expected: 0.

-- 7.4 Row-count baseline for the post-migration comparison.
SELECT COUNT(*) AS users_before FROM users;

-- 7.5 Current shape of the objects 0064 owns.
SELECT is_nullable FROM information_schema.columns
 WHERE table_name = 'users' AND column_name = 'phone';              -- expect NO
SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conname = 'users_at_least_one_identifier';                   -- expect NULL
SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_users_email_lower'; -- expect NULL
-- Any non-NULL answer means a previous (possibly rev.1) apply already happened.
-- rev.2 reconciles a stale definition; record what you find before proceeding.

-- 7.6 Confirm 0064 has not already been recorded.
SELECT name, applied_at FROM _migration_log WHERE name = '0064_email_identity.sql';
-- Expected: 0 rows for a first apply.
```

---

## 8. Post-migration verification

```sql
-- 8.1 phone is now nullable
SELECT is_nullable FROM information_schema.columns
 WHERE table_name = 'users' AND column_name = 'phone';
-- Expected: YES

-- 8.2 CHECK exists AND carries the trim-aware predicate (not merely present)
SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
 WHERE conname = 'users_at_least_one_identifier';
-- Expected: CHECK (((phone IS NOT NULL) OR ((email IS NOT NULL) AND (btrim((email)::text) <> ''::text))))

-- 8.3 Unique index exists AND is keyed on the application identity
SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_users_email_lower';
-- Expected: CREATE UNIQUE INDEX idx_users_email_lower ON public.users USING btree
--           (lower(btrim((email)::text)))
--           WHERE ((email IS NOT NULL) AND (btrim((email)::text) <> ''::text))

-- 8.4 Audit table + indexes
SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'account_link_log';
-- Expected: 3 (PK + idx_account_link_log_user + idx_account_link_log_action)

-- 8.5 Flag row present and DISABLED
SELECT key, enabled FROM feature_flags WHERE key = 'auth.email_otp.enabled';
-- Expected: 1 row, enabled = false

-- 8.6 Nothing moved
SELECT COUNT(*) AS users_after FROM users;      -- == users_before from 7.4
SELECT COUNT(*) AS lost_relationships
FROM sessions s LEFT JOIN users u ON u.id = s.user_id WHERE u.id IS NULL;
-- Expected: 0
SELECT COUNT(*) AS lost_memberships
FROM organization_members m LEFT JOIN users u ON u.id = m.user_id WHERE u.id IS NULL;
-- Expected: 0

-- 8.7 Integrity actually enforced — inside a transaction you will discard.
--     NOTE: full_name is NOT NULL on users, so a name literal is required.
BEGIN;
INSERT INTO users (id, full_name, email, locale, status)
VALUES (gen_random_uuid(), 'Probe Blank', '', 'en', 'ACTIVE');
-- Expected: ERROR, violates check constraint "users_at_least_one_identifier"
ROLLBACK;

BEGIN;
INSERT INTO users (id, full_name, email, locale, status)
VALUES (gen_random_uuid(), 'Probe Blank', '   ', 'en', 'ACTIVE');
-- Expected: ERROR, violates check constraint
ROLLBACK;

BEGIN;
INSERT INTO users (id, full_name, email, locale, status)
VALUES (gen_random_uuid(), 'Probe Dup', 'UPPER@EXAMPLE.TEST', 'en', 'ACTIVE');
-- If 'upper@example.test' already exists: ERROR, duplicate key … "idx_users_email_lower"
ROLLBACK;

BEGIN;
UPDATE users SET phone = NULL, email = NULL WHERE id = (SELECT id FROM users LIMIT 1);
-- Expected: ERROR, violates check constraint
ROLLBACK;

-- 8.8 Recorded
SELECT name, applied_at FROM _migration_log WHERE name = '0064_email_identity.sql';
-- Expected: exactly 1 row
```

### 8.9 Application health checks — corrected

**Do not** reuse the v1.0 examples: they dialled a real phone number and posted a literal
password to a `/v1/auth/login` endpoint that does not exist (the real route is
`/v1/auth/login/password`). Sending a real OTP from a runbook is not acceptable.

Use these instead. All of them are non-delivering by construction:

```bash
# H1 — Route table is live without sending anything.
#      A malformed address is rejected by the validation pipe with 400 before the
#      handler is entered, so no provider is contacted whether the flag is on or off.
#      <disposable-only> — substitute your own host; never a real user address.
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "https://<api>/v1/auth/otp/email/request" \
  -H 'Content-Type: application/json' \
  -d '{"email":"not-an-address"}'
# Expected: 400

# H2 — Kill switch works. A syntactically valid EXAMPLE.COM address (RFC 2606
#      reserved, never deliverable to a real mailbox) with the flag DISABLED must
#      answer 404. Run this ONLY while auth.email_otp.enabled = false; with the flag
#      on, the request would attempt a real SMTP send.
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "https://<api>/v1/auth/otp/email/request" \
  -H 'Content-Type: application/json' \
  -d '{"email":"probe@example.com"}'
# Expected: 404  (flag disabled). The 404 is padded to a >=250 ms response by the
#               timing floor, so measure latency too, not just the code.

# H3 — The account-linking surface is gated identically (S1.37-F-06). With a valid
#      bearer token and the flag off, the link route must 404 rather than link.
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "https://<api>/v1/auth/account/link-email" \
  -H "Authorization: Bearer <non-production test token>" \
  -H 'Content-Type: application/json' \
  -d '{"email":"probe@example.com","otp":"000000"}'
# Expected: 404 (flag disabled). Never use a real user's token in a runbook check.

# H4 — Phone OTP regression without sending anything: assert the app booted and the
#      notification registry did NOT report a mock provider in a production-like build.
grep -E "Mock provider: available|MockOtpProvider: REFUSED" <application-log>
# Expected in production/staging: "MockOtpProvider: REFUSED" or no mock line at all.

# H5 — Proof of control is enforced on the phone link path as well (S1.37-F-05).
#      With the flag ON and a test bearer token, linking a number that has no live
#      challenge must be refused BEFORE any identifier write, and linking never
#      triggers a delivery itself, so this sends nothing.
#      <DISPOSABLE_TEST_MSISDN> must be a well-formed number the operator owns for
#      testing. The literal number used by the withdrawn S1.35 runbook is deliberately
#      NOT reproduced here: it is a real-looking subscriber range, and correction C-11
#      rejects it (see §10). Substituting a number you do not own defeats the purpose.
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "https://<api>/v1/auth/account/link-phone" \
  -H "Authorization: Bearer <non-production test token>" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"<DISPOSABLE_TEST_MSISDN>","otp":"000000"}'
# Expected: 401 ("OTP expired or not found"). A 200 here means the proof-of-control
#           gate is missing or bypassed - stop and treat it as a security incident.
#           If the body is rejected as malformed instead, the number was not
#           well-formed; that is a 400, not a pass or a fail of this check.
```

No health check in this runbook exercises a real provider, and none should during an audit. No
health check in this runbook contains a real, dialable subscriber number or any credential.

> **Behavioural note on `account/link-phone` (corrected during S1.37):** the body now
> requires `otp`, and that code must be a live, unconsumed phone OTP previously delivered
> to the exact number being linked. Phone challenges expire after `OTP_CHALLENGE_TTL`
> (90 s), so link within that window. Consuming the code for the link invalidates it for
> login; the same is true in the opposite direction. `AccountLinkPhone` in the generated
> clients reflects this, so any client that still posts only `{phone}` receives 400.

---

## 9. Rollback

### 9.1 The only true rollback is a restore

`DROP NOT NULL` is metadata-only and reversible **in principle** (`ALTER TABLE users ALTER
COLUMN phone SET NOT NULL`), but it becomes **unsafe in practice** the moment an email-only
account exists, and 0064 is what allows such an account to be created. Additionally the
CHECK and the partial unique index cannot be "rolled forward" into their rev.1 definitions
without re-opening the empty-string and whitespace-collision gaps.

| Situation                                       | Action                                                                                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 0064 failed mid-apply                           | **Nothing to roll back.** The runner transaction aborted; verify §8.3/§8.5 show no objects and `_migration_log` has no row, then retry  |
| 0064 applied, feature misbehaving               | §9.2 soft rollback (flag). Schema stays                                                                                                 |
| 0064 applied and an email-only user was created | §9.2, then a **forward migration**. Do not attempt `SET NOT NULL` — it will fail on those rows and you will be repairing under pressure |
| Schema change itself was wrong                  | Author migration 0065 that fixes forward                                                                                                |
| Catastrophic, restore justified                 | Restore from backup to a **new** database, verify, then cut over. Never restore in place over a live database                           |

### 9.2 Soft rollback (immediate, no restart)

```sql
UPDATE feature_flags SET enabled = false WHERE key = 'auth.email_otp.enabled';
```

With the flag off, **all six** Phase 1 routes answer `404` (the four `account/*` routes were
ungated in rev.1 — corrected, S1.37-F-06):

- `POST /v1/auth/otp/email/request`
- `POST /v1/auth/otp/email/verify`
- `POST /v1/auth/account/link-email`
- `POST /v1/auth/account/link-phone`
- `POST /v1/auth/account/unlink-email`
- `POST /v1/auth/account/unlink-phone`

What the flag does **not** do:

- It does not remove an email already attached to an account, and it does not delete
  `account_link_log` rows. Any email-only account created before the flag was turned off
  **still exists with `phone NULL`** and can still sign in with a password — it is not
  lockable out by the flag. Enumerate them before enabling rollback expectations:
  `SELECT COUNT(*) FROM users WHERE phone IS NULL;`
- It does not affect phone OTP, sessions, refresh tokens or the phone-based password login.

### 9.3 Forward-fix template (if a schema correction is ever needed)

```sql
-- migration 00NN_description.sql — remember: no BEGIN/COMMIT here, the runner adds them.
SET LOCAL lock_timeout = '5s';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_at_least_one_identifier;
ALTER TABLE users ADD CONSTRAINT users_at_least_one_identifier
  CHECK (phone IS NOT NULL OR (email IS NOT NULL AND BTRIM(email) <> ''));
```

---

## 10. Correction record against the v1.0 runbook

Every claim below was re-tested against a disposable PostgreSQL 16 instance during S1.37.

| #    | v1.0 statement                                                                                                     | Status                                | Corrected statement                                                                                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-1  | "Idempotent: **Yes** (uses `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`)"                                            | **Partly false**                      | Replaced by §4. The file body is idempotent; a blind rerun through the runner wrapper fails on the `_migration_log` primary key and rolls back; the normal operator rerun is a no-op because the runner skips recorded files. |
| C-2  | "`CREATE UNIQUE INDEX` does **not** hold an exclusive lock (uses `CONCURRENTLY` pattern internally via Drizzle)"   | **False**                             | §5.3/§5.2. `CONCURRENTLY` is illegal inside the runner's transaction. The index is built with ordinary `CREATE UNIQUE INDEX` under `ACCESS EXCLUSIVE` on `users`.                                                             |
| C-3  | "Migration partially applied → Complete the migration (it's transactional)"                                        | **Misleading**                        | With rev.1's embedded `COMMIT` the file was **not** atomic — that was finding F-02. With rev.2 + runner ownership, a failure means nothing was applied; see §9.1 row 1.                                                       |
| C-4  | "Downtime required: **No**"                                                                                        | **Overstated**                        | No _planned_ downtime is needed, but the table is fully blocked for the lock's duration and the migration self-aborts at `lock_timeout = 5s`. §5.4.                                                                           |
| C-5  | "Estimated duration < 5 seconds"                                                                                   | **Unverified for production**         | Measured only on a 2-row disposable table. The CHECK validation scan and index build scale with `users`. §2.                                                                                                                  |
| C-6  | Preflight quoted as `LOWER(email)`                                                                                 | **False for rev.2, and insufficient** | rev.2 uses `LOWER(BTRIM(email))` matching `normalizeEmail()`, plus a second orphan-identifier preflight. §6.3, §7.1.                                                                                                          |
| C-7  | CHECK quoted as `CHECK (phone IS NOT NULL OR email IS NOT NULL)`                                                   | **False for rev.2**                   | That predicate is bypassed by `email = ''`. rev.2 adds `AND BTRIM(email) <> ''`. §8.2, finding F-07.                                                                                                                          |
| C-8  | Unique index quoted as `ON users (LOWER(email)) WHERE email IS NOT NULL`                                           | **False for rev.2**                   | `ON users (LOWER(BTRIM(email))) WHERE email IS NOT NULL AND BTRIM(email) <> ''`. §8.3, finding F-08.                                                                                                                          |
| C-9  | "Add unique index … Impact: Case-insensitive email uniqueness"                                                     | **Incomplete**                        | Also case-and-whitespace-insensitive, and blank-excluding.                                                                                                                                                                    |
| C-10 | "This immediately … Does NOT affect existing account linking"                                                      | **False**                             | In rev.1 the flag never gated `account/*` at all, so the sentence was true for the wrong reason. Post-F-06 the flag **does** gate all four link/unlink routes. §9.2.                                                          |
| C-11 | Health checks: `{"phone":"+966500000000"}`, `{"phone":"+966500000000","password":"..."}` and `POST /v1/auth/login` | **Rejected**                          | A real, dialable number and a literal credential in a runbook, plus a non-existent route. Replaced by the non-delivering checks in §8.9.                                                                                      |
| C-12 | "`relation "account_link_log" already exists` → Idempotent re-run, safe to ignore"                                 | **Not a real outcome**                | rev.2 uses `CREATE TABLE IF NOT EXISTS`, so that error cannot occur; it is listed as a log pattern that does not exist. §12.                                                                                                  |
| C-13 | Appendix §10.1 "Full Migration SQL" beginning with `BEGIN;` and ending with `COMMIT;`                              | **False and dangerous**               | It reproduced rev.1 exactly. Replaced by §11, which shows the real rev.2 file.                                                                                                                                                |
| C-14 | Date `2025-01-19`, Change Log 1.0                                                                                  | **Wrong**                             | §13.                                                                                                                                                                                                                          |
| C-15 | "The migration is applied automatically … when the API service starts"                                             | **True but must be stated as a risk** | `onModuleInit` auto-migration means starting a dev server against a shared database silently applies pending migrations. Never start a dev API against staging/production.                                                    |

**On the quoted MSISDN.** The `+9665…` digit string appears in this table **only** as the original that
C-11 rejects; it is absent from every executable block in §8.9 and from every health check, where
`<DISPOSABLE_TEST_MSISDN>` must be replaced by a number the operator owns. The same string is still
quoted inside the withdrawal notice that replaced the S1.35 runbook, because that notice has to keep
the withdrawn text identifiable — finding F-20 exists precisely because earlier revisions were not
recoverable from Git. That notice is a record, not a procedure, and nothing in it may be executed.

---

## 11. Evidence: actual rev.2 behaviour on a disposable database

Reproduced from the S1.37 audit run against a throwaway `postgres:16-alpine` container
(`docker run --rm`, removed afterwards) with 2 seeded users.

**R1a — first apply through the runner wrapper** (`BEGIN` + file + log insert + `COMMIT`), `ON_ERROR_STOP=1`:

```
BEGIN / SET / DO / DO / ALTER TABLE / DO / DO / CREATE TABLE / CREATE INDEX / CREATE INDEX / INSERT 0 1 / INSERT 0 1 / COMMIT
EXIT=0
```

**R1b — data preserved:** both seeded rows keep their exact `id`, `phone` and `email`.

**R1c — resulting definitions:**

```
is_nullable: phone YES, email YES
CHECK  : CHECK (((phone IS NOT NULL) OR ((email IS NOT NULL) AND (btrim((email)::text) <> ''::text))))
INDEX  : CREATE UNIQUE INDEX idx_users_email_lower ON public.users USING btree
         (lower(btrim((email)::text)))
         WHERE ((email IS NOT NULL) AND (btrim((email)::text) <> ''::text))
FLAG   : auth.email_otp.enabled | f
LOG    : 0064_email_identity.sql
```

**R2 — rerun through the same wrapper:** `INSERT 0 0` for the flag, then `EXIT=3`
(duplicate `_migration_log` primary key) and a full rollback. Counts afterwards: 1 log row,
1 index row, 1 constraint row, 1 flag row. **No damage; non-zero exit.**

**R2c — bare rerun of the file (`psql -f`, no wrapper):** `EXIT=0`; statements
`ALTER TABLE / DO / DO / CREATE TABLE / CREATE INDEX / CREATE INDEX / INSERT 0 0`.
Idempotent as claimed.

**R3 — identifier invariants after 0064:**

| Probe                                         | Result                                               |
| --------------------------------------------- | ---------------------------------------------------- |
| `phone NULL`, `email ''`                      | rejected (CHECK) — rev.1 accepted this               |
| `phone NULL`, `email '   '`                   | rejected (CHECK)                                     |
| `phone NULL`, `email NULL`                    | rejected (CHECK)                                     |
| email-only account                            | accepted                                             |
| case-variant duplicate of an existing address | rejected (`idx_users_email_lower`)                   |
| whitespace-variant duplicate                  | rejected — rev.1's `LOWER(email)` index allowed this |
| two rows with blank email + distinct phones   | accepted (blank is not an identity)                  |

**R4 — preflight abort and rollback:** seeding `'dup@test.com'` and `'DUP@TEST.COM'` (and
separately a whitespace pair) makes the apply exit non-zero; afterwards `phone` is still
`NO`, the constraint is absent, the index is absent, `_migration_log` has **0** rows and both
users are intact. **Nothing partial survives an aborted preflight.**

**R4b — normalization gap proven, then closed:** with a padded duplicate pair present, the
_v1.0_ preflight predicate returns 0 groups while the application sees 2 rows as one
identity; the rev.2 `LOWER(BTRIM(email))` preflight detects them.

**R5 — rev.1 → rev.2 reconciliation:** a database hand-built to the rev.1 end state
(index `lower((email)::text) WHERE email IS NOT NULL`, CHECK `phone IS NOT NULL OR email IS
NOT NULL`) was upgraded by applying rev.2: `EXIT=0` and **both** objects were rebuilt to the
rev.2 definitions. `CREATE … IF NOT EXISTS` alone would have silently kept the weak ones —
that is why the guarded `DO` blocks compare `pg_get_constraintdef` / `pg_indexes.indexdef`.

---

## 12. Monitoring

| Signal                                                                   | Expected                              | Investigate when                                                                                                            |
| ------------------------------------------------------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ERROR: canceling lock request due to lock timeout` during apply         | retryable                             | repeated across windows → schedule against a quieter period or find the long writer from §5.5                               |
| `PREFLIGHT FAILED: … duplicate normalized email group(s)`                | hard stop                             | resolve duplicates deliberately; the migration will not pick a survivor for you                                             |
| `PREFLIGHT FAILED: … no usable identifier`                               | hard stop                             | a row with neither phone nor a non-blank email exists; fix the row                                                          |
| `duplicate key value violates unique constraint "_migration_log_pkey"`   | expected only on a blind manual rerun | if it appears from a normal runner invocation, the log and the schema disagree — investigate before proceeding              |
| `ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block` | must never appear                     | 0064 rev.2 does not use `CONCURRENTLY`; if a future migration does, it needs a runner that supports non-transactional steps |
| `WARNING: there is no transaction in progress`                           | must never appear                     | means a migration re-introduced its own `COMMIT` — reject the change                                                        |
| `MockOtpProvider: REFUSED` in a production log line                      | correct                               | absence of it **and** a "Mock provider: available" line in production is a release blocker                                  |

---

## 13. Change log

| Date       | Version | Author                  | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2025-01-19 | 1.0     | Implementation Team     | Initial runbook (S1.35). Published with an incorrect date; the file it described was migration 0064 rev.1.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-31 | 2.0     | S1.37 independent audit | Rewritten as the authoritative runbook. Corrects the idempotency claim (C-1), the `CONCURRENTLY`/locking claim (C-2, C-4), the atomicity claim (C-3), the preflight/CHECK/index definitions (C-6..C-9), the feature-flag scope claim (C-10), the phone-number/credential health checks (C-11), a log pattern that cannot occur (C-12), the appendix SQL (C-13) and the document date (C-14). Adds the runner transaction contract, verified lock semantics, rerun semantics, rev.1→rev.2 reconciliation, and the disposable-only evidence set. Reflects migration rev.2. |
| 2026-10-31 | 2.1     | S1.37 independent audit | Adds health check H5 and the proof-of-control behaviour note for `account/link-phone`, following the remediation of finding **S1.37-F-05**: `LinkPhoneDto`/`AccountLinkPhone` now require a consumed phone OTP, the phone verification gate is shared with login, and the OpenAPI document declares the requirement. Migration content is unchanged.                                                                                                                                                                                                                     |
| 2026-10-31 | 2.2     | S1.37 independent audit | Records the audited final code SHA (`5581e6a46d4705c21a97cc941a696896f8f7973e`) in §1.1, replacing the forward reference to another document. H5 no longer contains the withdrawn S1.35 placeholder subscriber number: leaving it in would have contradicted correction C-11, which rejects that exact literal. The check now takes an operator-owned `<DISPOSABLE_TEST_MSISDN>` and explains the 400/401/200 outcomes. Migration content is unchanged.                                                                                                                  |
| 2026-11-01 | 2.3     | S1.37 independent audit | Closes the audit. §1.1 now names the documentation commits and the audit window, and §10 states explicitly that the rejected MSISDN survives only as quoted original in the C-11 row and in the S1.35 withdrawal notice, never inside an executable block. All checks were re-executed against the committed tree after the code commit and reproduced every published figure (verification report §4.8); the migration, its probes and the rollback procedure are unchanged.                                                                                            |

---

## 14. Contacts and escalation

| Role          | Responsibility                                                                  |
| ------------- | ------------------------------------------------------------------------------- |
| DBA           | Migration execution, lock monitoring, backup/restore                            |
| Backend Lead  | Application verification, feature-flag management                               |
| Security Lead | Enumeration monitoring, rate-limit tuning, mock-provider production attestation |
| SRE/DevOps    | Deployment coordination, rollback authorization                                 |
| Product Owner | Feature-enablement approval                                                     |
