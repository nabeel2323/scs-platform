# OTP-S1.35 Phase 1 — Migration and Rollback Runbook — **SUPERSEDED**

> ## ⛔ DO NOT USE THIS DOCUMENT TO EXECUTE A MIGRATION
>
> **Superseded on 2026-10-31 by
> [`OTP-S1.37-PHASE-1-MIGRATION-AND-ROLLBACK-RUNBOOK.md`](./OTP-S1.37-PHASE-1-MIGRATION-AND-ROLLBACK-RUNBOOK.md).**
>
> The authoritative procedure — corrected transaction/lock semantics, accurate rerun
> semantics, current preflight and post-flight checks, disposable-only evidence, and a
> rollback policy that matches the code — lives in the S1.37 runbook. This page is kept
> only so the correction is traceable. **Every operational instruction that was specific to
> this document has been removed**, because an unsafe instruction left in place "with a
> warning at the top" is still an unsafe instruction.

- **Document ID:** OTP-S1.35-PHASE-1-MIGRATION-AND-ROLLBACK-RUNBOOK
- **Status:** superseded / non-operational
- **Original date:** 2025-01-19 (itself incorrect — see R-14)
- **Superseded:** 2026-10-31, by the S1.37 Phase 1 independent audit
- **Migration described:** `infra/drizzle/migrations/0064_email_identity.sql`, **rev.1**.
  The file has since been rewritten as **rev.2**; rev.1 no longer exists in the repository.

---

## 1. Why this document was withdrawn

The S1.37 audit verified the implementation against a disposable PostgreSQL 16 instance and
found that a material part of this runbook described behaviour the code does not have. Two of
the errors were not cosmetic:

- **The atomicity/idempotency claims were wrong**, so an operator following §7.1
  ("Migration partially applied → complete the migration, it's transactional") would have
  believed a half-applied migration was safe to continue from. It was not: the migration file
  embedded its own `BEGIN;`/`COMMIT;`, which closed the runner's transaction early and left
  the `_migration_log` write outside the atomic unit.
- **The locking claim was backwards**, so an operator would have scheduled the change as a
  non-blocking online build. The index is built with an ordinary `CREATE UNIQUE INDEX` inside
  the runner's transaction and holds `ACCESS EXCLUSIVE` on `public.users` for the build.

The full correction record is §10 of the S1.37 runbook; the underlying code findings are
**S1.37-F-02**, **F-06**, **F-07**, **F-08**, **F-11** in
[`OTP-S1.37-PHASE-1-INDEPENDENT-AUDIT-REPORT.md`](./OTP-S1.37-PHASE-1-INDEPENDENT-AUDIT-REPORT.md).

---

## 2. Claims withdrawn (none of these is supported by the implementation)

| Ref  | Withdrawn claim                                                                                              | Reality                                                                                                                                                                                                                                      | Authoritative section     |
| ---- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| R-1  | "Idempotent: **Yes** (uses `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`)"                                      | The SQL _body_ is idempotent. A rerun through the runner wrapper fails on the `_migration_log` primary key and rolls back (exit non-zero, no damage). The normal operator rerun is a no-op only because the runner **skips** recorded files. | S1.37 runbook §4          |
| R-2  | "`CREATE UNIQUE INDEX` does not hold an exclusive lock (uses `CONCURRENTLY` pattern internally via Drizzle)" | `CREATE INDEX CONCURRENTLY` is illegal inside a transaction block. The build is ordinary and takes `ACCESS EXCLUSIVE` on `users`.                                                                                                            | S1.37 runbook §5.2–§5.3   |
| R-3  | "Downtime required: **No** (online migration, brief table lock)"                                             | No planned downtime, but `users` is fully blocked for the lock duration; the migration self-aborts at `lock_timeout = 5s` instead of queueing behind a long writer.                                                                          | S1.37 runbook §5.4        |
| R-4  | "Estimated duration < 5 seconds"; "ALTER TABLE < 500 ms"                                                     | Measured only on a 2-row disposable table. The CHECK validation scan and the index build both scale with `users`. No production measurement exists.                                                                                          | S1.37 runbook §2          |
| R-5  | Preflight is `LOWER(email)`                                                                                  | rev.2 uses `LOWER(BTRIM(email))`, which is what `normalizeEmail()` actually computes, plus a second preflight for rows with no usable identifier. `LOWER(email)` alone silently missed whitespace-variant duplicates.                        | S1.37 runbook §6.3, §7.1  |
| R-6  | `CHECK (phone IS NOT NULL OR email IS NOT NULL)`                                                             | Bypassed by `email = ''`, which let a row with no reachable identifier exist. rev.2 is `CHECK (phone IS NOT NULL OR (email IS NOT NULL AND BTRIM(email) <> ''))`.                                                                            | S1.37 runbook §8.2        |
| R-7  | `CREATE UNIQUE INDEX … ON users (LOWER(email)) WHERE email IS NOT NULL`                                      | rev.2 keys on `LOWER(BTRIM(email))` and excludes blank values, so DB uniqueness equals the application identity rule.                                                                                                                        | S1.37 runbook §8.3        |
| R-8  | "No data migration required … Existing rows already have `phone` populated"                                  | True for a genuine pre-0064 database, but it was used to justify skipping the orphan-identifier preflight. A partially migrated or hand-patched database can fail the `ADD CONSTRAINT` mid-transaction with an opaque error.                 | S1.37 runbook §6.3 step 3 |
| R-9  | "Migration partially applied → complete the migration (it's transactional)"                                  | With rev.1 the file was **not** atomic. With rev.2 plus runner ownership, any failure means nothing at all was applied — there is nothing to "complete".                                                                                     | S1.37 runbook §5.1, §9.1  |
| R-10 | Soft rollback "does NOT affect existing account linking"                                                     | rev.1 left the four `account/*` routes completely ungated, so the sentence was true for the wrong reason. Post-F-06 the flag gates **all six** Phase 1 routes, including link/unlink.                                                        | S1.37 runbook §9.2        |
| R-11 | "`relation "account_link_log" already exists` → idempotent re-run, safe to ignore"                           | Cannot occur under rev.2 (`CREATE TABLE IF NOT EXISTS`). A log pattern that does not exist should not be in an operational runbook.                                                                                                          | S1.37 runbook §12         |
| R-12 | Appendix "Full Migration SQL" starting `BEGIN;` and ending `COMMIT;`                                         | Reproduced rev.1 verbatim, including the embedded transaction control that the runner contract forbids.                                                                                                                                      | S1.37 runbook §11         |
| R-13 | Health checks posting `{"phone":"+966500000000"}` and a literal password to `POST /v1/auth/login`            | A real, dialable number and a credential in a runbook, against a route that does not exist (the real route is `POST /v1/auth/login/password`), and a phone-OTP request that would place a real SMS. Withdrawn outright — see §3 below.       | S1.37 runbook §8.9        |
| R-14 | "Date: 2025-01-19"; Change Log "1.0 / Initial runbook"                                                       | Wrong date; the sprint dates in this document family did not match the repository history.                                                                                                                                                   | S1.37 runbook §13         |
| R-15 | "The migration is applied automatically … when the API service starts"                                       | Accurate, and therefore a hazard that needed stating: `onModuleInit` auto-migration means starting a dev server pointed at a shared database silently applies every pending migration.                                                       | S1.37 runbook §6.1 note   |

---

## 3. Withdrawn commands

The following commands from the original document are **deleted rather than corrected**, and
must not be reconstructed from an old copy:

- `POST /v1/auth/otp/request` with `{"phone":"+966500000000","channel":"sms"}` — would place a
  real SMS to a number written into a widely readable document.
- `POST /v1/auth/login` with `{"phone":"+966500000000","password":"..."}` — a literal
  credential pattern, and a non-existent route.
- Any example that sends a real OTP, SMS, WhatsApp or SMTP message. The S1.37 audit never
  contacted a real provider, and no runbook example should make it easy to do so by
  copy-paste.

`OTP-S1.37-PHASE-1-MIGRATION-AND-ROLLBACK-RUNBOOK.md` §8.9 replaces these with three
non-delivering checks: a malformed-address `400` (rejected before any handler runs), a
reserved-`example.com` address expecting `404` **only while the feature flag is disabled**,
and a log-pattern assertion that the mock provider refused to initialize.

---

## 4. What was accurate and has simply moved

These parts of the original document were verified correct and are reproduced in the S1.37
runbook, unchanged in substance:

| Original section                                                                                                                  | Verified                                                | Now located at                                                 |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| §2 "Feature flag `auth.email_otp.enabled` inserted as **disabled**"                                                               | ✅                                                      | S1.37 runbook §2, §8.5                                         |
| §3.1 "Make `users.phone` nullable → allows email-only users"                                                                      | ✅                                                      | S1.37 runbook §2                                               |
| §4.3 PostgreSQL 14+, prior migrations, backup, `feature_flags` present                                                            | ✅                                                      | S1.37 runbook §3                                               |
| §6 rows 1–7 (phone nullable, CHECK present, index present, audit table, flag disabled, row count unchanged, no double-null users) | ✅, and now with definitions rather than mere existence | S1.37 runbook §8.1–§8.8                                        |
| §7.2 "Why no rollback" reasons 1–3 (DROP NOT NULL impractical, data may exist, forward-fix safer)                                 | ✅                                                      | S1.37 runbook §9.1                                             |
| §7.3 soft rollback via the feature flag                                                                                           | ✅, scope corrected per R-10                            | S1.37 runbook §9.2                                             |
| §9 "prerequisites before enabling: SMTP configuration, rate limits, monitoring, support briefed"                                  | ✅                                                      | S1.37 Final Verification Report, remaining-limitations section |
| §11 contacts and escalation table                                                                                                 | ✅                                                      | S1.37 runbook §14                                              |

---

## 5. Change log

| Date       | Version | Author                  | Changes                                                                                                                                                        |
| ---------- | ------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2025-01-19 | 1.0     | Implementation Team     | Initial runbook for migration 0064 rev.1. Date published incorrectly.                                                                                          |
| 2026-10-31 | 1.1     | S1.37 independent audit | Withdrawn and reduced to this correction record. All operational instructions removed; fifteen unsupported claims enumerated with their verified replacements. |
