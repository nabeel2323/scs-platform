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
