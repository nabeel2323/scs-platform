# G-002 Migration Object and Operator Access Audit — 24 November 2026

## Scope and evidence boundary

Source checkpoint: `48b22ded255f514f4ccec55d58a604a1c41e7b8f` on `remediation/phase-0-1-tenant-security`. This is a repository source review only. No database was connected, no migration/seed/reset/bootstrap script was executed, and no live catalog or runtime identity was inferred. The numbered SQL migration set contains 75 files (0001–0075).

## Migration-defined SQL objects

- `0007_search.sql` defines `public.normalize_arabic(text)`, a PL/pgSQL IMMUTABLE function. It is a normal invoker function; no SECURITY DEFINER declaration is present.
- `0070_public_access_and_function_search_path_hardening.sql` pins that function's search_path to `pg_catalog`. The same migration revokes client-role table/sequence privileges and migration-role default ACL grants; it explicitly does **not** enable RLS.
- The numbered migration source review found no CREATE TRIGGER / CREATE CONSTRAINT TRIGGER, CREATE POLICY, ENABLE ROW LEVEL SECURITY, CREATE VIEW / MATERIALIZED VIEW, or CREATE SEQUENCE statements. No SECURITY DEFINER declaration was found in the migration set. This is source evidence only; it does not describe extension-installed or live-database objects.
- Analytics partitioning is the exception to ordinary table DDL. `0002_platform.sql` initially creates `analytics_events` as a range-partitioned table with an initial monthly partition. `0013_analytics.sql` replaces the legacy table with a monthly range-partitioned parent and calls `partman.create_parent` for `public.analytics_events` (premake 3, start 2026-01-01).
- `0013_analytics.sql` configures 12-month retention but matches `parent_table = 'analytics_events'` without schema qualification. `0018_analytics_retention.sql` corrects the match to `public.analytics_events`; the latter is the effective retention configuration when both migrations are successfully applied.
- The proposed `cron.schedule('partman-maintenance', ... 'SELECT partman.run_maintenance()')` statement in migration 0013 is commented out. The repository tree has no pg_cron/pg_partman scheduler deployment manifest or cron configuration. Retention configuration therefore does not prove that maintenance is scheduled or that old partitions are detached/dropped.

## Migration runner and ledger boundaries

| Path | Role and behavior | Current source correction / remaining constraint |
|---|---|---|
| `apps/api/infra/drizzle/migrate-pg.ts` | DATABASE_URL migration Pool; logs non-secret migration identity diagnostics; holds the shared session advisory lock for ledger check and complete migration sequence; each migration and ledger insert share a transaction. | Complete-target path. It does not skip 0013/0018; target must have the required pg_partman extension and privileges. Actual deployed migration identity remains unverified. |
| `apps/api/infra/drizzle/migrate.ts` | Local Docker/PostGIS runner. | Uses shared `DEV_MIGRATION_EXCLUSIONS` for 0013/0018, warns and leaves them unlogged. Uses transaction advisory lock and rechecks the ledger inside each migration transaction to avoid duplicate application when another runner wins the race. |
| `DatabaseService.runDevMigrationsAndSeed` | Development/test startup PoolClient performs automatic migrations and RBAC seed. | Now uses the same 0013/0018 exclusions as the local Docker runner and the shared session advisory lock. Seed phase is a distinct system actor. This fixes the earlier mismatch where startup attempted pg_partman-dependent migrations even though the local image lacks pg_partman. |
| `infra/drizzle/migrations/a2_apply_migrations.sh` and `run_all.sh` | Legacy M7.3 disposable verification runner. | Now requires explicit test environment + exact database confirmation + local connection, verifies database/login identity, applies migrations atomically with advisory lock and ledger recheck. run_all delegates to this runner. |
| `infra/drizzle/migrations/_p12_verify_runner.sh` | Legacy P12 disposable verification runner. | Now requires explicit test environment/target confirmation and local connection; each migration is applied in a transaction under the shared advisory lock. 0013/0018 remain intentionally skipped because the verification image lacks pg_partman. |
| `migrate-pg.ts` versus local runners | Separate complete-target and local-development contracts. | Do not treat a local schema with 0013/0018 skipped as a complete production schema. |

## Operator actor-context adoption

A shared `setOperatorActorContext` helper sets actor ID, actor role, active organization, actor kind, worker ID and auth operation with parameterized transaction-local `set_config(..., true)`. These settings expire at transaction end and cannot leak through pooled connection reuse.

- `system`: platform RBAC seed, catalog seed and development RBAC bootstrap.
- `bootstrap`: staging platform/RBAC/merchant/staff/store bootstrap, local admin creation and the existing bootstrap-token path.
- `audit`: read-only database-access audit.
- Migration runners remain separate migration principals; they are not represented as application system/bootstrap actors.
- The staging merchant bootstrap diagnostic now performs the same explicit environment/database/approval check, runs in a read-only transaction and uses a bootstrap principal.
- RBAC bootstrap verification reads now run in a second scoped transaction instead of unscoped pool queries.
- The RBAC seed mapping total is now counted before COMMIT and returned once; the previous post-COMMIT expression added newly inserted mappings to a total that already included them, double-counting the result.

## Read-only audit tooling

`apps/api/scripts/audit-db-access.ts` remains a read-only transaction and now:
- inventories functions in every non-system schema, including extension-owned schemas such as `partman`, with owner, language, SECURITY DEFINER flag, function settings/search_path and execute privileges;
- inventories triggers and their trigger functions, owners and function settings;
- reports `partman.part_config` retention/automatic-maintenance fields when visible;
- reports `cron.job` entries matching pg_partman maintenance commands when the relation exists and the audit role can read it.

This is an audit capability only. It has not been run against staging or any database.

## Legacy UAT and verification scripts

M5/M6 scripts using direct PostgreSQL/Redis/API access were reviewed as manually invoked test harnesses. They already use `assertLocalUatExecution` in the reviewed direct-DB paths; they remain development/test-only and were not executed. The shell verification scripts targeting `m73a_verify` or `scs_p12_verify` now require explicit test environment and target confirmation, local PGHOST/PGHOSTADDR, no PGSERVICE redirection, and a verified current_database/current_user. Their fixture DML remains disposable-test-only.

The local Docker reset script remains fixed to the local container. The guarded reset-pg script remains a separate destructive operator action and was not run.

## Remaining G-002 gaps

1. Confirm the actual pg_partman extension version, schema, owner, function privileges and function search_path from the protected read-only staging audit.
2. Confirm whether an external pg_cron/OS scheduler invokes `partman.run_maintenance()`; identify schedule, owner/login role, target database, failure monitoring and retention behavior. The repository source does not establish that schedule.
3. Verify actual API and migration runtime login/effective roles, BYPASSRLS/superuser attributes and connection separation. Source diagnostics are not live evidence.
4. Complete migration-defined FK crosswalk and exact per-operation ownership predicates; reconcile the historical 114 and 116 relation counts with a fresh protected catalog snapshot.
5. Complete actor-context reuse/nesting and regression review. Added/updated tests remain unexecuted under the implementation-first restriction.

## Explicit non-actions

No tests, formatter, lint, typecheck, E6 or CI workflow was intentionally run. No migration, seed, reset, bootstrap, SQL audit, provider call, worker activation, RLS enablement, grant/default-ACL change, staging/shared database access, deployment or merge occurred. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## 24 November 2026 — stale migration-ledger fail-closed correction

Source follow-up through `6f3327a2039c65fb0f9578202d4bd76c75e7b426` adds a second layer of migration consistency protection:

- Local `migrate.ts` and DatabaseService development bootstrap now refuse to proceed when pg_partman-dependent migrations 0013/0018 are already present in the ledger despite being excluded from the local image. They do not delete ledger rows or attempt automatic repair; the local DB may contain partial state and must be explicitly rebuilt/reconciled.
- The complete `migrate-pg.ts` runner now rejects impossible/stale analytics ledger states: 0018 without 0013, 0013 without the pg_partman extension/config row, or 0018 whose retention values do not match the migration.
- The disposable M7.3 runner refuses to continue if skipped pg_partman migrations already appear in its ledger.
- Local `migrate.ts` uses a unique per-process/per-file temp SQL path and cleans it up, avoiding concurrent runners overwriting the same temporary script.
- Disposable shell verification target guard now also checks `inet_server_addr()` is a Unix socket or loopback address, in addition to explicit test environment, exact DB/user, local PGHOST/PGHOSTADDR and no PGSERVICE redirection.

No database was inspected or repaired, and no tests/CI were run. These are source-level fail-closed checks only.


## 24 November 2026 — final migration-ledger safety source update

Source implementation checkpoint `f21dbe4aca75ba04e9173b1fc28a9591829af554`. The local migration paths reject stale 0013/0018 ledger rows rather than silently trusting them; the complete migration path validates pg_partman extension/configuration and retention state; temporary migration scripts are unique and cleaned up; the legacy M7.3 disposable runner stops after the first migration failure. Disposable target guard verifies actual PostgreSQL server address is loopback/unix-socket.

No tests or DB operations were run. Exact-head Actions is empty and Vercel Web/Admin are rate-limited. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## Latest source follow-up — 24 November 2026

The fail-closed stale-ledger correction and local temp-file isolation were completed through source checkpoint `f21dbe4aca75ba04e9173b1fc28a9591829af554`. The M7.3 runner now stops at the first failed migration. The disposable DB guard verifies the PostgreSQL server's actual address is a Unix socket or loopback. No tests or database commands were run. Current branch/PR head after documentation-only synchronization is `bb193c7b52ed83bc6c0a6f72ce1a24ba4dcdd926`; PR #138 remains OPEN / DRAFT / UNMERGED. Exact-head Actions is empty; Vercel Web/Admin rate-limit failures are external preview statuses.


## 26 November 2026 — bootstrap CLI actor-context unification

The break-glass `apps/api/src/scripts/bootstrap-issue-token.ts` path previously set five transaction-local application context fields inline after `BEGIN`, but omitted an explicit reset of `app.auth_operation`. It now calls the shared `setOperatorActorContext(client, 'bootstrap', operatorId)` helper instead. This keeps the CLI bootstrap principal consistent with staging bootstrap scripts and explicitly clears actor role, active organization, worker ID and authentication-operation context in the same transaction-local statement.

The existing helper unit test now asserts all six context settings are established/reset with transaction-local `set_config(..., true)`. This is source/test authoring only; no CLI was executed and no token was issued. The test, typecheck and CI remain unexecuted. This change does not authorize or perform bootstrap activity against staging or production.


## 26 November 2026 — catalog import actor-context call-graph review

Live verification before this review: PR #138 is OPEN / DRAFT / UNMERGED, head `af29841dc9f6e9668bf3630a2bd609c61f96bd8b`, base `develop`, GitHub mergeable=false; `develop` is `fde20420bbb759d2e562f9ff747c9e824ac58e25`; compare is diverged (2,805 ahead / 3 behind; merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`). Preservation ref is identical to the source head (0/0). Exact-head Actions has no workflow runs; combined statuses are only Vercel Web/Admin build-rate-limit failures.

### Import route/service findings (source review only)

Reviewed `catalog.controller.ts`, `catalog.service.ts` and `TenantDatabaseContextInterceptor` around all import routes and their service call paths.

- `createImportJob`, list/get job, get chunks, mapping update, cancel and retry routes use the opt-in tenant DB interceptor. Their DB-only call paths run under the authenticated request actor.
- Row staging, file upload, processing, preview and error-report routes intentionally do not use a request-wide interceptor. They first resolve the persisted job/store and verify organization/store membership inside a short explicit user actor scope. Service methods then scope their own DB reads, writes, claims, chunk operations and finalization with `withUserActorContext`.
- Redis row staging/read, object-storage upload/read, XLSX parsing and CSV serialization occur outside DB actor transactions. Chunk product/variant/pricing writes run inside actor-scoped DB transactions. The worker-style stale-import recovery entry point uses a stable worker principal and is dormant/not scheduled by this remediation.
- `updateImportMapping`, `cancelImport`, `retryFailedJob`, `getImportJob` and `getChunks` remain context-dependent service methods rather than accepting an actor argument themselves; current HTTP call sites are covered by the interceptor or an explicit actor wrapper. This is a maintainability boundary to preserve and test if new callers are added; do not infer the methods are safe for unscoped invocation.
- No missing actor-context route was identified in the reviewed import route set. This is not a full catalog module sign-off: continue auditing the remaining catalog service call graph, other controllers and worker entry points before closing G-002.

No code was changed in this review. No tests, typecheck, formatter, build or CI were run. No import job was created/processed, no object storage or Redis was touched, and no staging/shared DB writes, migrations, grants, RLS changes, worker activation, deployment or merge occurred.

**Next:** continue catalog service and worker actor-context coverage; then complete the raw SQL/function/trigger and migration/operator boundaries and prepare a bounded G-002 extraction manifest from refreshed `develop`. Keep CI batched until that bounded workstream is complete.


## 26 November 2026 — worker actor-context and order-completion reconciliation

Reviewed the current PR #138 order auto-completion worker, its unit tests, the #138 OrdersService completion path, focused PR #154 and the #153 outbox implementation.

- The #138 auto-completion worker establishes `withActorContext({ actorKind: 'worker', workerId })` around both claim and the entire `processCompletion` call. The conditional lease release runs in `processCompletion`'s `finally` before that outer actor scope closes, so release inherits the worker context. No production worker code change was required.
- The #138 worker unit-test double did not implement DatabaseService.withActorContext, so the tests did not model the actor-context implementation. Updated the test harness to provide a passthrough scope, assert DB execution and completion occur inside the worker scope, assert the stable worker principal, and cover lease release after failed completion. Commits: `983acb6b5a87c52a21a905745cf404d6c785c47f`, `82998dd808f5800ccfb7c354a373ef63bdf06bf4`, `7b98f58532c66c005c6a3089f9da72e1bc32d495`.
- The #138 `OrdersService.completeOrder` still performs multiple related writes without the single encompassing transaction present in #154. #154's atomic completion and claim-owner/lease fencing are the preferred service implementation, but its worker must be composed with #138's DatabaseService worker actor context before extraction. Keep one canonical migration 0071; its duplicate DDL must not be applied twice.
- #138's generic outbox dispatcher still contains the log-only placeholder that marks events DISPATCHED. Do not extract or enable it. PR #153 is the safer canonical behavior: no generic polling/acknowledgement without a real adapter; carrier-owned events remain with ShippingCarrierWorker. #153 exact-head Actions has a passing CI run; #154 exact-head Actions lookup is empty. Recheck before any merge decision.
- ShippingCarrierWorker's inspected database phases use a worker-context helper; provider/storage operations are outside those short DB scopes. This was a source-level spot check, not full worker sign-off.

No tests, typecheck, formatter, build or CI were run for the unit-test update. All source/test changes remain NOT TESTED / NOT CI-VERIFIED. No worker was activated, no outbox polling enabled, no provider call, database write, migration, deployment or merge occurred.

**Next:** finish the remaining worker and database call-graph audit; prepare the bounded G-002 extraction as the composition of #154 atomic completion with #138 actor context, and #153's safe outbox behavior. Run the consolidated CI campaign only after that bounded slice is assembled.
