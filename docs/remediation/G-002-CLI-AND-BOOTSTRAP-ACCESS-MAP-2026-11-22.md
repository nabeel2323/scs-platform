# G-002 CLI, Migration and Bootstrap Access Map — 22 November 2026

## Purpose and boundary

This document records source-observed direct database access outside ordinary API request handlers. It is a static source map at 06c5f25f1e0a967129ddae8b94b33e060f2e9691; it does not establish which credentials are deployed in Render or which scripts are currently invoked by staging. No script, migration, seed, reset, bootstrap command or provider call was executed.

## Runtime and migration paths

- **API runtime:** DatabaseService creates the API Pool and a Drizzle handle. It emits a non-secret identity diagnostic. In development/test only, it creates a second bootstrap Pool, applies pending migrations and runs the canonical RBAC seed before exposing the main Drizzle handle. The bootstrap catch path logs a failure but allows API startup to continue; this behavior needs a separate startup-readiness review.
- **DATABASE_URL migration runner:** migrate-pg.ts uses a dedicated Pool and captures the migration connection's actual session/effective role. It holds a session advisory lock across the migration-ledger check and full apply sequence. Each migration and its _migration_log insert share a transaction.
- **Local Docker migration runner:** migrate.ts uses the fixed scs-postgres container and scs_platform database, applies SQL through psql with ON_ERROR_STOP, and commits the migration plus ledger row atomically. It intentionally skips the two pg_partman-dependent migrations with an explicit warning.
- **Migration helpers:** migration-identity.ts is a read-only role diagnostic on a supplied PoolClient. migration-lock.ts acquires/releases a session advisory lock on that same client.
- **RBAC seed:** seed-pg.ts performs idempotent transactional inserts into permissions, roles and role_permissions. The older src/scripts/seed.ts uses the local psql wrapper for similar data.
- **Catalog seed:** seed-catalog.ts uses raw PoolClient SQL across platform taxonomy, products, variants, attribute values and optional demo merchant offers.
- **Demo data:** src/scripts/demo-data.ts writes a broad set of demo identities and business records through psql. It requires development/test and explicit opt-in, with production-like DATABASE_URL heuristics. It was not run.
- **Audit:** scripts/audit-db-access.ts starts a READ ONLY transaction and reads catalog metadata; no writes were found.

## Bootstrap and operator paths

- **Bootstrap token issuance:** src/scripts/bootstrap-issue-token.ts validates SCS_ENVIRONMENT and SCS_OPERATOR, requires explicit production confirmation, and uses an advisory transaction lock. It checks for an existing active SUPER_ADMIN and unexpired token, optionally revokes previous authorizations, then writes bootstrap_authorizations and audit_logs. The plaintext token is output once; the database stores its digest.
- **Bootstrap completion:** system/bootstrap.service.ts uses a transaction-scoped advisory lock, consumes the token authorization and creates the initial user, platform organization and SUPER_ADMIN membership. This is a one-time global system identity, not a tenant-scoped request.
- **Staging provisioning:** bootstrap-staging-platform.ts, bootstrap-staging-merchant.ts, bootstrap-staging-store.ts, bootstrap-staging-staff.ts and bootstrap-staging-rbac.ts issue direct PostgreSQL writes to users, organizations, memberships, stores, warehouses and RBAC. The inspected entry points require DATABASE_URL and SSL CA material, but do not expose one uniform target-environment confirmation contract. Treat them as privileged manual writes; add explicit staging approval before any future invocation.
- **Admin creation helper:** scripts/create-admin-user.ts previously contained a fixed SUPER_ADMIN password and local DB fallback. It is now restricted to development/test and local PostgreSQL hosts, requires explicit confirmation and caller-supplied email/phone/name/password, wraps organization/user/membership creation in one transaction, and never logs the password.
- **Reset helper:** infra/drizzle/reset-pg.ts drops all public tables and removes the analytics pg_partman configuration. It now requires an explicit development/test/staging environment, exact target database name, typed DROP confirmation, local host for development/test and a second staging approval value. Production is rejected. The script was not run.
- **Local reset:** infra/drizzle/reset.ts drops tables and enum types in the fixed local Docker database. It is a destructive development tool.

## Legacy UAT and migration harnesses

The M5/M6 utilities (m5-roundtrip-check.ts, m5-uat-run.ts, m5-uat-verification.ts, m6-clean.ts, m6-diag.ts, m6-env-check.ts, m6-fix-cart-constraint.ts, m6-get-otp.ts, m6-restore-admin.ts, m6-uat-run.ts, m6.1-inventory-concurrency.ts and m6.1-security-regression.ts) and the b1-migration-test.js/p311-migration-verify.js harnesses directly connect to local PostgreSQL, Redis or the local API. Some mutate fixtures or schema and several retain fixed local test credentials; M5 scripts also accept DATABASE_URL overrides. None was run. These scripts remain a separate hardening/retirement task and must not be used against staging/shared databases.

The M6 environment check was hardened: SCS_ENVIRONMENT and SCS_UAT_CONFIRM are required; API and Redis URLs must resolve to local hosts; credentials are supplied through environment variables; OTP values and raw verification responses are not logged.

## RLS and transaction-context implications

1. Migration and seed paths need their own explicit DB identity; do not infer their role from the API runtime identity.
2. Bootstrap uses a global system actor and must not inherit ordinary buyer/merchant organization context.
3. Reset and UAT scripts bypass API permissions and can mutate schema/data directly. They must be isolated from shared environments and excluded from runtime request policy assumptions.
4. Raw SQL and psql-based scripts must be included in any future scoped database abstraction or explicitly restricted to separate operator/migration principals.
5. The 114-versus-116 relation-count discrepancy and live API/migration identity remain protected read-only evidence tasks. This source map does not authorize RLS, grants, migrations or staging writes.

## Explicit non-actions

No script was executed. No staging write, shared DB mutation, migration, seed, reset, bootstrap, grant/default-ACL change, RLS activation, deployment, worker activation or provider call occurred.


## Non-Drizzle database object handoff

Migration 0053 creates public.backfill_errors and is the only writer found in the inspected source. It records PRODUCT/VARIANT attribute backfill errors without tenant owner fields or declared FKs; no API reader/writer was found. Treat it as SYSTEM/MIGRATION evidence until a supported operator reader is identified. _migration_log and analytics_events partitions are mapped in the physical object inventory. No table contents were read.


## Guard standardization for legacy UAT and staging bootstrap scripts — 22 November 2026

### Local M5/M6 UAT and migration harnesses

Added apps/api/scripts/local-uat-safety.ts and applied it to m5-roundtrip-check.ts, m5-uat-run.ts, m5-uat-verification.ts, m6-clean.ts, m6-diag.ts, m6-fix-cart-constraint.ts, m6-get-otp.ts, m6-restore-admin.ts, m6-uat-run.ts, m6.1-inventory-concurrency.ts and m6.1-security-regression.ts. The independently hardened m6-env-check.ts retains its own equivalent guard. The b1-migration-test.js and p311-migration-verify.js harnesses now require the same explicit development/test environment and UAT confirmation.

Required for TypeScript UAT scripts: SCS_ENVIRONMENT=development or test and SCS_UAT_CONFIRM=true. Database/API/Redis URLs supplied to the shared helper must resolve to local hosts; M5 DATABASE_URL overrides pointing at remote hosts are rejected. The helper cannot inspect the database behind a separately running local API, so the operator must also verify that the API process itself uses a local development/test DATABASE_URL. These scripts were not executed.

### Staging bootstrap scripts

Added apps/api/scripts/staging-bootstrap-safety.ts and verify-staging-bootstrap-target.ts. All five bootstrap-staging platform/merchant/store/staff/RBAC scripts call the guard after connecting and before BEGIN or any write. The package db:bootstrap:staging command now runs the preflight before the RBAC seed and bootstrap sequence.

Required variables:
- SCS_ENVIRONMENT=staging
- SCS_STAGING_BOOTSTRAP_CONFIRM=true
- SCS_STAGING_BOOTSTRAP_DATABASE=<exact database name>
- SCS_STAGING_BOOTSTRAP_APPROVAL=I_APPROVE_STAGING_BOOTSTRAP:<exact database name>

The guard checks current_database() against the exact approved database and fails closed before writes. The preflight also requires DATABASE_URL and PGSSLROOTCERT. These checks are not permission to run the scripts; no staging bootstrap was executed.
