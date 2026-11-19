# G-002 — Least-Privilege Database Access Remediation Design

| Field | Value |
|---|---|
| Repository | `nabeel2323/scs-platform` |
| Finding | G-002 (P1) |
| Status | DESIGN BASELINE — IMPLEMENTATION BLOCKED ON RUNTIME IDENTITY AND QUERY INVENTORY |
| Database | Supabase PostgreSQL 17.6 |
| Related inventory | [G-002 Supabase Database Access Inventory](./G-002-SUPABASE-DATABASE-ACCESS-INVENTORY.md) |
| Scope | Runtime login, migration/seed identity, grants/default ACLs, request context and eventual RLS |
| DDL / grants / secrets / deployment | None changed |

## 1. Executive decision

The platform should separate its API runtime database identity from the database owner/migration identity, remove unnecessary destructive and structural privileges from application-facing roles only after grant provenance and managed-service dependencies are proven, and introduce row-level security only after request identity can be propagated safely through the connection pool.

**Do not apply a blanket RLS migration or mass-revoke privileges from Supabase-managed roles.** The existing API uses a shared PostgreSQL pool and global Drizzle database handle. RLS policies that depend on request-specific settings would be unsafe or unreliable until every query in an HTTP request is guaranteed to execute inside the same transaction with trusted, transaction-local context.

This document is a design and evidence record only. It is not authorization to modify the live database, change Render environment variables, or deploy.

## 2. Confirmed evidence

### 2.1 Live database posture

The read-only inventory recorded:

- 114 relations in `public` (113 ordinary tables and one partitioned parent); all are owned by `postgres`.
- RLS and FORCE RLS are disabled on all 114 public relations.
- Supabase Security Advisor reports 117 RLS-disabled tables, including three `partman` tables.
- `anon`, `authenticated`, and `service_role` have effective `TRUNCATE`, `REFERENCES`, `TRIGGER`, and PostgreSQL 17 `MAINTAIN` privileges on all 114 public relations.
- The checked effective ACL snapshot found no `SELECT`, `INSERT`, `UPDATE`, or `DELETE` privileges for those three roles on the 114 public relations.
- The same four privileges are present in `postgres` default privileges for future public tables.
- The checked sequence snapshot found no effective sequence privileges for those three roles.
- `postgres` and `service_role` have `BYPASSRLS`; `postgres` also has login/create-role/create-database attributes.
- Storage and Auth are Supabase-managed surfaces with separate ACL and RLS behavior. Their grants are out of scope for blanket changes.
- `public.normalize_arabic(text)` is not SECURITY DEFINER and uses built-ins, but has no function-level pinned `search_path`. The other 31 public functions in the snapshot are pg_trgm extension functions.

The Security Advisor's broad exposure wording must remain qualified: effective privilege checks did not demonstrate ordinary CRUD through anon/authenticated on the 114 public relations, but did demonstrate destructive TRUNCATE and unnecessary structural privileges. The actual Data API path and ACL grantors still require verification.

### 2.2 Application and release connection paths

Source inspection confirms:

1. `DatabaseService.onModuleInit()` resolves `process.env.DATABASE_URL` and creates the API's shared `pg.Pool` and Drizzle handle.
2. Production-like API startup does not run the development migration/seed bootstrap. The development/test bootstrap is explicitly conditional on `NODE_ENV` being `development` or `test`.
3. The staging release workflow maps the environment secret `STAGING_DATABASE_URL` into the process variable `DATABASE_URL` for `db:migrate`, `db:seed`, and migration-ledger verification.
4. The migration runner takes a PostgreSQL advisory lock, creates/updates `_migration_log`, and executes each migration transactionally.
5. The seed runner writes RBAC roles, permissions, and mappings.

These facts show separate application and release-workflow configuration paths, but **do not prove that their database URLs use different PostgreSQL roles**. The actual Render API `DATABASE_URL` username and the staging release secret's database username were not read. No secret values were accessed.

## 3. Target role architecture

Names below are proposed identifiers, not existing roles.

| Identity | Login | Purpose | Required authority |
|---|---:|---|---|
| `scs_api_login` | YES | API process connection identity | Inherits only the reviewed runtime grants; NO SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, or BYPASSRLS |
| `scs_runtime` | NO | Group role for API runtime privileges | Schema USAGE and least-privilege table/sequence/function privileges proven by query inventory |
| `scs_migrator` | NO | Group role for controlled schema migration and RBAC seed | DDL and DML required by the migration runner and seed runner; no application serving |
| existing database owner / Supabase administration roles | Existing | Ownership and managed platform administration | Retain platform-required ownership and control; never use as API runtime |

Provision a separate login credential for the API and store it only in the API service's secret manager. The migration workflow must retain a separately controlled owner/migrator connection. Whether `scs_migrator` can be granted the exact DDL required by all existing migrations without table ownership must be proven in a disposable PostgreSQL 17.6 environment first; many migrations assume owner-level DDL. Do not grant membership in `postgres` or use a BYPASSRLS role as the runtime workaround.

A role group with NOLOGIN separates privilege definition from credential rotation. The actual login must not be a member of any role that carries elevated attributes or broader managed-service privileges.

## 4. Request context and RLS architecture gate

### 4.1 Current blocker

The API currently creates one shared pool and one global Drizzle handle. Existing modules/services issue queries through that shared handle. A plain session-level `SET app.user_id` or `set_config(..., false)` would be unsafe with pooled connections because a later request could inherit a prior request's identity. A `SET LOCAL` / `set_config(..., true)` value is transaction-scoped, but it only protects queries executed on that same transaction-bound connection.

Therefore, do not enable policies based on `current_setting('app.user_id', true)` until request-scoped transaction propagation is implemented and proven for all database call paths.

### 4.2 Required implementation investigation

Before choosing a final RLS mechanism:

1. Inventory every `DatabaseService.db` / Drizzle query entry point across HTTP controllers, services, guards, middleware, WebSocket handlers, cron jobs, outbox workers, and startup tasks.
2. Identify calls that run before authentication, after response completion, or outside an HTTP request.
3. Determine whether a NestJS request interceptor plus AsyncLocalStorage can bind a transaction-scoped Drizzle handle to all downstream database calls without breaking nested transactions, streaming responses, retries, or background jobs.
4. If not, explicitly pass a transaction-bound database handle through service boundaries or choose a different isolation mechanism. Do not rely on a global mutable connection/session variable.
5. Define separate trusted actor contexts for authenticated HTTP requests and background workers. Workers must not inherit a previous request's user or organization context.
6. Add concurrency tests that interleave two organizations through a pool of size 1 and a pool greater than 1, including rollback, thrown exceptions, timeout, and connection reuse.
7. Prove that missing/invalid context fails closed and that the API cannot accidentally issue a tenant query outside the context boundary.

### 4.3 RLS rollout choices

Evaluate these options against the query inventory:

- **Option A — staged least-privilege runtime role first:** reduce database blast radius while preserving the current application-level tenant checks. This is the safe prerequisite and can be independently deployed after role/privilege verification.
- **Option B — transaction-bound request context:** add RLS to selected tenant-owned tables only after all relevant queries run through a transaction-bound handle and the context-isolation test matrix passes.
- **Option C — explicit tenant-scoped query API:** require service methods to accept a scoped DB context and make unscoped access unavailable to HTTP request paths. This is more invasive but may be easier to reason about than implicit context propagation.

Do not choose a global RLS policy that trusts a client-supplied `orgId`, `userId`, or JWT claim without verifying the server-side provenance and lifecycle of that value.

## 5. ACL remediation sequence

### Stage 0 — evidence-only (no mutation)

- Capture the exact Render API runtime database identity using a sanitized diagnostic that returns only `session_user`, `current_user`, database name, role flags, and a non-secret connection label.
- Independently capture the staging release workflow's database identity in the same sanitized form.
- Query ACL grantors and grant options for all current public relation grants, including inherited/PUBLIC grants; identify which migration or operator introduced each grant.
- Query default ACL grantors and verify the owner role for future tables, sequences, and functions.
- Enumerate all tables, partition parents/children, views, materialized views, sequences, functions, triggers, and extension-owned objects by domain and runtime access path.
- Reconcile PostgREST/Data API exposure and Supabase Advisor findings against effective privileges. Do not test TRUNCATE on live data; validate destructive privilege behavior only in a disposable clone.

### Stage 1 — runtime-role proof in disposable PostgreSQL

- Provision the proposed runtime login/group roles in a disposable database matching PostgreSQL 17.6 and the Supabase-relevant extension set.
- Build table/sequence/function grants from observed application query needs, not from a broad schema-wide CRUD grant.
- Exercise API startup, authentication, buyer/merchant/admin journeys, WebSockets, scheduled jobs, outbox workers, financial jobs, and all integration tests using the runtime identity.
- Assert runtime cannot create/alter/drop tables, create roles/databases, truncate tables, create triggers, bypass RLS, or access unrelated schemas.
- Verify migration and RBAC seed still work with the dedicated migration identity.
- Only after all checks pass should a controlled staging credential rollout be proposed.

### Stage 2 — remove unnecessary managed-role grants

- Determine the exact grantor and whether each grant is application-created, inherited, or Supabase-managed.
- Revoke only proven application-created unnecessary privileges from the specific application-schema roles/objects.
- Preserve required managed Auth, Storage, extension, and Supabase platform privileges.
- Correct default privileges for the exact object-creating role and schema so future tables do not regain unnecessary grants.
- Validate effective privileges after each narrowly scoped change; do not infer success from the migration applying.

### Stage 3 — selected RLS policies

- Select tenant-owned tables only after the domain ownership matrix and request-context mechanism are accepted.
- Enable RLS per table with explicit positive policies and negative tests for anonymous, buyer, foreign merchant, same-org non-member, inactive member, platform staff, and background worker.
- Test FORCE RLS behavior separately. Do not assume table owners are subject to RLS unless FORCE RLS is intentionally applied and migration/maintenance implications are understood.
- Roll out in small groups with before/after query plans and a tested rollback procedure.

## 6. Required verification matrix

| Test | Expected runtime result |
|---|---|
| API connects as dedicated runtime identity | Pass; identity is not postgres/service_role and has no BYPASSRLS |
| API normal buyer and merchant workflows | Pass |
| API background workers and financial jobs | Pass under explicitly declared worker context |
| Runtime role attempts TRUNCATE | Denied |
| Runtime role attempts CREATE/ALTER/DROP or role management | Denied |
| Runtime role attempts access to unrelated schemas | Denied unless explicitly required |
| Runtime role attempts migration DDL | Denied |
| Migration identity applies full migration set and RBAC seed in disposable DB | Pass |
| Missing tenant context on an RLS-protected request | Denied |
| Two tenants interleaved on one pooled connection | No cross-tenant context bleed |
| Exception/rollback followed by connection reuse | No context bleed |
| Anonymous/authenticated Data API access to application tables | Matches explicitly approved public surface only |
| Managed Storage/Auth operations | Continue to work; managed privileges/policies unchanged |

## 7. Rollback and release controls

- Preserve the current API connection credential until the replacement role is proven.
- Roll out the runtime credential through a staged secret change with a known-good rollback value; never put passwords in migration SQL, logs, source control, or PR comments.
- Keep the migration credential separate from the API credential.
- Do not combine role creation, grant changes, RLS activation, and application deployment into one irreversible step.
- For every DDL/ACL stage, record a pre-change catalog snapshot, exact SQL, post-change effective privilege results, and rollback SQL.
- No production or staging mutation is permitted until a separate change plan identifies the target environment, approver, backup/restore evidence, and rollback trigger.

## 8. Acceptance criteria

G-002 may move from OPEN to READY FOR VERIFICATION only when:

1. Actual API and migration connection identities are proven without exposing credentials.
2. A complete relation/sequence/function/default-ACL matrix maps each object to owner, access path, required operation, and role.
3. A dedicated runtime identity passes all application and worker tests and fails all prohibited privilege tests.
4. Managed Supabase role dependencies and Data API exposure are reconciled.
5. Request-context propagation is either implemented and proven before any RLS activation, or the approved staged scope explicitly defers RLS with a documented compensating-control decision.
6. All SQL is versioned, tested against PostgreSQL 17.6, has a rollback plan, and has not been applied to a live environment without explicit release authorization.

## 9. Current status and next action

- G-002 inventory: read-only evidence captured; 114 public relations and effective ACL/default-ACL findings recorded.
- Application runtime identity: unresolved; source proves the API consumes `DATABASE_URL`, not the actual configured username.
- Migration identity: release workflow uses `STAGING_DATABASE_URL` for migration, seed and ledger verification; actual role remains unverified.
- RLS request context: not implemented; global Drizzle handle and pooled connection make session-level context unsafe.
- DDL, grants, revokes, RLS, role membership, environment values and deployments: unchanged.

**Next action:** add and execute a sanitized, read-only database-identity diagnostic separately under the API runtime environment and the migration workflow environment. Then complete the per-object query/worker access matrix before drafting any SQL migration.
