# Deployment, Migration and Forward-Fix Runbook

**Scope:** current SCS staging release workflow and database migration runner.  
**Status:** source-verified; live Render settings are last-observed evidence and require recheck before a release.  
**Critical environment fact:** the connected PostgreSQL database is shared across branches. The repository has no separately provisioned production database in the currently documented environment.

## 1. Runtime startup is not a migration mechanism

The API bootstrap in `apps/api/src/main.ts` validates JWT, OTP HMAC, bootstrap owner, production configuration, alert sink and OTP delivery configuration before binding the port. It does not invoke the migration runner or seed runner. Do not assume a Render restart or deploy applies migrations.

Production migrations are run by the release workflow using the staging database secret. Development/test migration and seed commands are separate CLI operations.

## 2. Migration runner behavior

Source: `apps/api/infra/drizzle/migrate-pg.ts`.

1. Requires `DATABASE_URL`; optionally reads the CA certificate path from `PGSSLROOTCERT`.
2. Reads all `.sql` files in `infra/drizzle/migrations`, sorted lexicographically.
3. Acquires a PostgreSQL session advisory lock before reading the migration ledger.
4. Creates `_migration_log` if absent.
5. Reads applied filenames and computes pending migrations.
6. Applies each pending SQL file in its own transaction and inserts that filename into `_migration_log` in the same transaction.
7. On failure, rolls back the current migration transaction, reports the filename and stops; earlier successfully committed migrations remain applied.
8. Releases the advisory lock and closes the connection in `finally`.

The `--dry-run` option only checks that migration files exist and are non-empty and reports which filenames would apply. It does **not** execute SQL, validate schema effects, test permissions or prove an upgrade path.

The ledger is filename-based; there is no checksum validation in this runner. Never edit an already-applied migration file. Add a new forward migration for corrections.

## 3. Seed behavior

The release workflow invokes `pnpm --filter @scs/api db:seed`, which runs `apps/api/infra/drizzle/seed-pg.ts`. The seed creates/ensures platform permission keys, role keys and role-permission mappings. Inserts use `ON CONFLICT DO NOTHING`; it is intended to be repeatable and is not a substitute for catalog/demo data seeding.

Do not run catalog/demo seed commands against the shared database as part of a release unless separately scoped and approved.

## 4. Staging release sequence

Source: `.github/workflows/release.yml`, called by CI after mandatory `develop` gates succeed.

1. Validate the triggering CI run and exact release SHA.
2. Confirm the SHA is an intended `develop` release.
3. Validate environment-scoped secrets and variables before mutation:
   - `RENDER_API_KEY`
   - `STAGING_DATABASE_URL`
   - `STAGING_PGSSLROOTCERT_PEM`
   - `RENDER_SERVICE_ID` environment variable
4. Install dependencies with frozen lockfile.
5. Create the temporary PostgreSQL CA certificate and keep its lifecycle in one shell step.
6. Run `db:migrate` against `STAGING_DATABASE_URL`.
7. Run the RBAC-only `db:seed`.
8. Verify every migration filename is present in `_migration_log`.
9. Trigger Render deployment for the exact same commit SHA.
10. Poll deployment to a terminal result and verify the deployed commit SHA.
11. Check `https://scs-api-staging.onrender.com/v1/readyz`.
12. Publish release summary and clean up the temporary CA file.

The release workflow serializes staging releases and the migration runner uses an advisory lock. Its stale-release policy is allow-complete: an in-flight migration is not aborted just because a newer release is queued.

## 5. Manual dispatch is a real release

The `workflow_dispatch` path in `release.yml` is **not a dry run**. It performs the same database migrations, RBAC seed, ledger verification, Render deployment and readiness check. There is no confirmation input or preview mode. The human approval surface is GitHub environment protection on the `staging` environment (required reviewers), which is repository configuration.

Never use manual dispatch to inspect a migration or test credentials. Use isolated CI PostgreSQL or the read-only database audit utility instead.

## 6. Render deployment behavior

The latest documented Render observation recorded service `scs-api-staging`, branch `develop`, auto-deploy disabled, with the last observed live commit `9f5bc397`. This is historical evidence from the tracker, not a fresh verification on 19-Nov. Recheck the selected Render workspace/service and current deployment before any authorized release.

With auto-deploy disabled, a Git push alone is not evidence of a Render deployment. The release workflow explicitly triggers deployment for the validated SHA and verifies the resulting deployed commit. Do not manually restart/deploy the service outside this path during remediation.

## 7. Shared database and current migration boundary

The user has confirmed that one PostgreSQL database is shared across branches. The read-only 19-Nov inventory found the custom `_migration_log` at 69 entries through migration 0069. Migrations 0070 and 0071 have passed isolated CI full-apply checks but are not applied to the shared database.

**Do not** run `db:migrate`, `db:seed`, `db:reset`, or release.yml against the shared database during this remediation without a separately approved migration window and verified API/migration role model. In particular, migration 0070 and any RLS/grant change remain gated on G-002 role verification and access-design review.

## 8. Failure handling and forward-fix policy

- If a migration fails, the current file's transaction is rolled back; earlier migration files may already be committed. Inspect `_migration_log` and actual schema state before retrying.
- Do not delete migration ledger rows or edit applied migration files to force a rerun.
- Prefer a new forward migration that repairs the observed state and is safe for both fresh installs and already-upgraded databases.
- Do not assume an application rollback reverses database schema/data changes. Check backward compatibility of the previous app version before any app rollback.
- If a migration is destructive or non-backward-compatible, require a reviewed expand/contract sequence and explicit recovery procedure before release.
- No automatic down-migration mechanism is documented in this runner.
- Backup/restore testing P0-12 is deferred by user direction for the current development cycle; it remains a pre-production decision/gate in the overall plan.

## 9. Release evidence checklist

- [ ] Exact commit SHA and successful mandatory CI run recorded.
- [ ] Target database and actual API/migration PostgreSQL roles verified.
- [ ] Migration diff, locks, data impact, grants/RLS and forward-fix reviewed.
- [ ] Environment approval satisfied.
- [ ] Migration ledger verified after release.
- [ ] Render deployment SHA equals the approved SHA.
- [ ] `/v1/readyz` passes.
- [ ] Worker topology/flags and alert sink are verified; no unintended worker activation.
- [ ] User/admin documentation and release notes updated.
- [ ] No unapproved payment, shipment, notification or customer-data side effect occurred.

### Fresh staging topology verification — 19 November 2026

The Render workspace was rechecked read-only. The current service is `scs-api-staging`, a single web service on branch `develop`, with auto-deploy disabled, one configured instance, Frankfurt region, free plan, and health check `/v1/readyz`. Its build command installs dependencies and builds `@scs/api`; its start command is `pnpm --filter @scs/api start:prod`. Neither command runs migrations or seeds. The release workflow is the separate mutating path: it runs `db:migrate`, the RBAC-only `db:seed`, verifies the migration ledger, then deploys the same commit SHA.

No separate Render background-worker service or Render-managed PostgreSQL instance is configured in the inspected workspace. Runtime logs show `OutboxDispatcher` registered at a 1-second poll interval and `ShippingCarrierWorker` at 5 seconds inside the API process. `P13MonitorService` scans every 60 seconds in log-only mode; `ReturnExpirationWorker` is disabled because `P13_WORKER_ENABLED` is unset; the P13 alert channel is log-only because no webhook is configured. Current service configuration reports one instance; repeated worker-registration messages in logs correspond to different instance IDs over restarts and do not prove simultaneous multi-instance execution.

Operational implications: do not assume a Render restart migrates the database; do not enable protected P13 work until its feature flag, worker ownership, pause/resume controls and alert webhook are configured and verified; do not treat the API process as a dedicated worker service. No environment values were read, and no service settings, deployment, restart, migration, seed or worker flag were changed during this verification.
