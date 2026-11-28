# G-002 direct PostgreSQL entrypoint audit — 28 November 2026

**Reviewed ref:** `develop` at `5356cd182cb41fc8f2266a0b75eb60056c43675d`  
**Audit branch:** `docs/g002-postgres-entrypoint-audit-20261128`  
**Scope:** source-level review of identified API PostgreSQL connection entrypoints and their immediate identity/actor helpers. No database connection was opened and no script was executed.

## Executive result

The API runtime pool has a stronger production identity/TLS startup gate than several standalone CLI entrypoints. The five staging bootstrap scripts share a fail-closed target/role/TLS guard and establish a bootstrap actor. By contrast, the standalone platform and catalog seeders accept an optional CA file and do not show the same staging target/role guard at their CLI boundary. The migration runner also treats its identity query as diagnostic/non-fatal and configures TLS only when a CA file is supplied.

These are **source-level hardening gaps / assurance differences**, not proof that a particular connection is currently insecure: the effective TLS behavior can also depend on the PostgreSQL connection URL and runtime environment. No credentials, connection strings, or database state were inspected.

## Entrypoint matrix

| Entrypoint | Connection / scope | Target and identity controls | TLS behavior | Actor context / disposition |
|---|---|---|---|---|
| `DatabaseService.onModuleInit` | Runtime `Pool` used by API | Resolves runtime URL and runs `logRuntimeDatabaseIdentity`; production-like identity failures are fatal | Verified TLS required for deployed/production-like runtime; mounted CA is verified | Runtime pool; reference implementation for production identity assurance |
| `DatabaseService.runDevMigrationsAndSeed` | Separate bootstrap `Pool` + `PoolClient` | Development/test bootstrap path; inspect environment gate before treating as a deployed entrypoint | Uses configured CA when supplied | Establishes system actor before RBAC seed; separate from API request pool |
| `infra/drizzle/migrate-pg.ts` | Standalone `Pool` + session `PoolClient`; advisory lock held over ledger/apply sequence | Reads migration identity via `readMigrationDatabaseIdentity`, but catches diagnostic failures and continues with identity unverified | CA-based verified TLS only when `PGSSLROOTCERT` is supplied | Migration operations are privileged DDL; no tenant actor context is established by the reviewed runner |
| `infra/drizzle/seed-pg.ts` | Standalone `Pool` + client | Requires `DATABASE_URL`; no equivalent exact-environment/database/role preflight found at CLI entrypoint | `PGSSLROOTCERT` optional; if present, CA verification enabled | Sets operator system actor for seed transaction; target restrictions are not equivalent to staging bootstrap guard |
| `infra/drizzle/seed-catalog.ts` | Standalone `Pool` + client | Requires `DATABASE_URL`; no equivalent exact-environment/database/role preflight found at CLI entrypoint | `PGSSLROOTCERT` optional; if present, CA verification enabled | Sets operator system actor for seed transaction; profile defaults to production data profile |
| `infra/drizzle/reset-pg.ts` | Destructive standalone `Client` | Requires explicit environment, exact database, exact destructive confirmation; staging has a second separate approval; dev/test restricted to local hosts | Requires `PGSSLROOTCERT` and verifies CA | Destructive path with strong explicit target guard; never execute as part of this audit |
| `bootstrap-staging-platform.ts` | Standalone `Client` | Shared staging preflight verifies exact database, staging approval, non-privileged/non-owning role and matching session/effective user | Requires CA and verifies TLS | Establishes bootstrap actor |
| `bootstrap-staging-rbac.ts` | Standalone `Pool` + client | Same shared staging preflight; actor is re-established for verification scope | Requires CA and verifies TLS | Establishes bootstrap actor; no execution performed |
| `bootstrap-staging-merchant.ts` | Standalone `Pool` + client | Same shared staging preflight | Requires CA and verifies TLS | Establishes bootstrap actor |
| `bootstrap-staging-staff.ts` | Standalone `Pool` + client | Same shared staging preflight | Requires CA and verifies TLS | Establishes bootstrap actor |
| `bootstrap-staging-store.ts` | Standalone `Pool` + client | Same shared staging preflight | Requires CA and verifies TLS | Establishes bootstrap actor |
| `scripts/audit-db-access.ts` | Read-only transaction through standalone `Pool` | Requires `DATABASE_URL`; reports effective/login role and privilege inventory | CA verification when `PGSSLROOTCERT` supplied; absent CA does not itself force verified TLS in this script | Begins `READ ONLY`, sets audit actor; does not read application rows |
| `scripts/create-admin-user.ts` | Standalone `Pool` + client | Explicit development/test environment and local database restrictions in helper; must retain local-only boundary | Reviewed CLI pool does not configure CA | Establishes bootstrap actor; local-only utility, not a staging bootstrap |
| `src/scripts/bootstrap-issue-token.ts` | Source file uses bootstrap token workflow; direct PostgreSQL client/pool ownership must be confirmed from imports and delegated service path | Not classified as a direct pool until helper/import chain is traced | Not classified | Follow-up item; avoid double-counting indirect use of DatabaseService |

## Shared staging bootstrap guard

`scripts/staging-bootstrap-safety.ts` requires:
- `SCS_ENVIRONMENT=staging`;
- `SCS_STAGING_BOOTSTRAP_CONFIRM=true`;
- an exact `SCS_STAGING_BOOTSTRAP_DATABASE`;
- `SCS_STAGING_BOOTSTRAP_APPROVAL=I_APPROVE_STAGING_BOOTSTRAP:<database>`;
- connected database equality with the named target;
- session and effective user equality;
- neither role is superuser, BYPASSRLS, CREATEROLE or CREATEDB;
- the effective role owns neither public tables nor the public schema;
- verified TLS as reported by `pg_stat_ssl`.

The five staging bootstrap scripts call this preflight before writes and establish a dedicated bootstrap actor. This is materially stronger than the standalone seed CLI preflight found in the reviewed source.

## Confirmed follow-up findings

1. **Migration identity is currently advisory.** `migrate-pg.ts` catches failures from `readMigrationDatabaseIdentity`, logs that identity remains unverified, then continues to acquire the migration lock and apply pending SQL. A separate migration credential can therefore proceed without successful identity diagnostics. The runner's CA configuration is conditional on `PGSSLROOTCERT`; the API runtime's production-like TLS gate is stronger.
2. **Seed CLIs lack the staging target guard.** `seed-pg.ts` and `seed-catalog.ts` require only `DATABASE_URL` at the CLI boundary, make the CA optional, and proceed to connect and seed. Both set an operator actor for their seed operations, which is useful audit attribution but is not a substitute for target/role/TLS validation.
3. **The audit CLI has a similar optional-CA posture.** Its transaction is read-only and actor-attributed, but the script itself does not force verified TLS when no CA path is configured.
4. **Do not homogenize all tools blindly.** The reset utility, staging bootstrap utilities, local admin utility, development bootstrap and production migration runner have different intended authority and target restrictions. Hardening should use explicit purpose-specific policies, not a single permissive shared bypass.
5. **Entrypoint inventory still needs a repository-wide import/call-graph pass.** In particular, trace `bootstrap-issue-token.ts`, all `pg.Client`/`pg.Pool` constructions outside the listed paths, scripts under alternate packages, and test-only helpers before declaring exhaustiveness.

## Outbox caller audit status

The current `OutboxDispatcher` is a transactional writer only. It intentionally has no poller and does not mark generic events `DISPATCHED`; non-carrier events remain pending until a real consumer exists. Carrier events remain owned by `ShippingCarrierWorker`.

A source scan identified publisher callsites in orders, returns, commission reversal, settlement adjustments, payments, disputes/reviews, inventory, merchant/store membership and catalog. The presence of `publish()` alone does not prove the active actor context or transaction nesting. In particular, inspect the enclosing controller/service call chain and the exact use of `DatabaseService.withActorContext` for inventory stock adjustments/transfers and low-stock publication, merchant verification submission, review creation, and commission reversal. Confirm whether each operation passes its transaction client or relies on an already active actor transaction. Do not add context wrappers based only on this partial scan.

No generic notification consumer should be introduced as part of this audit: event ownership, payload contracts, tenant/recipient resolution, idempotency, durable leases, retries and dead-letter behavior must be designed and tested first.

## Next work

1. Finish the repository-wide direct `Client`/`Pool` and helper/import inventory, including all bootstrap scripts and the API bootstrap token utility.
2. Trace every production `OutboxDispatcher.publish()` call through its caller chain and classify: exact actor kind/org, active transaction reuse, explicit transaction-client propagation, and tenant/store attribution.
3. Reconcile the result with migration 0001–0077 object ownership, FK/tenant predicates, functions, triggers, partitions, grants and default ACL inventory.
4. Prepare one bounded source/test PR for proven gaps only. Prefer tests that prove the policy and fail-closed behavior; do not execute seed/migration/reset/bootstrap scripts against any shared database.
5. Run one consolidated exact-head CI for the completed source/test batch. Keep staging release, DB writes, migrations, grant/default-ACL/RLS changes, Render mutations, deployments, provider calls, credential changes and worker activation on hold.

## Safety and evidence boundary

This is a read-only source audit. No database connection was opened. No migration, seed, reset, bootstrap or audit script was run. No staging/shared database, Render service, provider, credential, grant, default ACL, RLS policy, worker, deployment or release was changed. CI success is not authorization for any of those operations.
