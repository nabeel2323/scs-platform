# G-002 — Supabase Database Access Inventory (Read-Only)

| Field | Value |
|---|---|
| Project | `SCS-PlatForm` / `wplsxxevoevzqbgtpctw` |
| Engine | PostgreSQL 17.6 |
| Inventory date | 19 November 2026 |
| Scope | Public-schema relations, roles, memberships, default ACLs, function settings and migration ledger |
| Access mode | Read-only SQL |
| Status | INVENTORY VERIFIED; LEAST-PRIVILEGE DESIGN DOCUMENTED; IMPLEMENTATION OPEN |

## 1. Confirmed schema baseline

- The live `public` schema contains **114 relations**: 113 ordinary tables and one partitioned table.
- All 114 relations are owned by `postgres`.
- Row-level security is disabled on all 114 relations; `FORCE ROW LEVEL SECURITY` is also disabled.
- The live application migration ledger contains **69 applied migrations**, from `0001_identity.sql` through `0069_organization_onboarding_permission.sql`. The latest ledger timestamp observed was 17 November 2026 16:07:23 UTC.

## 2. Existing table ACLs

The expanded PostgreSQL ACL inventory confirms that each of `anon`, `authenticated`, and `service_role` has the following privileges on all 114 public relations:

| Role | Privilege | Relations |
|---|---|---:|
| anon | MAINTAIN | 114 |
| anon | REFERENCES | 114 |
| anon | TRIGGER | 114 |
| anon | TRUNCATE | 114 |
| authenticated | MAINTAIN | 114 |
| authenticated | REFERENCES | 114 |
| authenticated | TRIGGER | 114 |
| authenticated | TRUNCATE | 114 |
| service_role | MAINTAIN | 114 |
| service_role | REFERENCES | 114 |
| service_role | TRIGGER | 114 |
| service_role | TRUNCATE | 114 |

No `SELECT`, `INSERT`, `UPDATE`, or `DELETE` privileges were found for those three roles on the 114 public relations in the checked ACL snapshot. This distinction matters: the concern is not a demonstrated direct CRUD path through the Supabase client roles; it is the unnecessary structural/maintenance privileges and the privileged API database identity.


## 2A. Fresh Security Advisor and effective-privilege reconciliation (19 November 2026)

A fresh Supabase Security Advisor run reports a **critical** `rls_disabled` finding for 117 tables: 114 in `public` and three in `partman`. Its generated description says the tables are fully exposed to `anon` and `authenticated`. This statement must be qualified against effective PostgreSQL privileges rather than copied as a proven direct Data API read/write path.

A read-only SQL verification using `has_table_privilege` (which accounts for inherited and PUBLIC grants) produced this effective privilege count for all 114 ordinary/partitioned `public` relations:

| Role | SELECT | INSERT | UPDATE | DELETE | TRUNCATE | REFERENCES | TRIGGER | MAINTAIN |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| anon | 0 | 0 | 0 | 0 | 114 | 114 | 114 | 114 |
| authenticated | 0 | 0 | 0 | 0 | 114 | 114 | 114 | 114 |
| service_role | 0 | 0 | 0 | 0 | 114 | 114 | 114 | 114 |

This is an important distinction:

- The current effective privilege check does **not** show direct table SELECT/INSERT/UPDATE/DELETE access for these roles on the 114 public relations.
- It **does** confirm that all three roles have TRUNCATE on all 114 public relations, which is a destructive table-level privilege and must be treated as a real least-privilege defect. They also have unnecessary REFERENCES, TRIGGER and MAINTAIN privileges.
- The public schema grants USAGE to anon/authenticated/service_role. The partman schema does not grant USAGE to these roles, and the four discovered partman objects (three tables plus the `table_privs` view) have no effective CRUD/TRUNCATE privileges for them.
- The checked auth tables (including the 11 with RLS disabled) show no effective SELECT or TRUNCATE privilege for anon/authenticated. The storage schema has RLS enabled on its eight listed relations; effective SELECT exists on seven, so the applicable storage RLS policies still need their own review.
- The `extensions` schema exposes five extension objects with SELECT privileges to anon/authenticated. This is separate from access to application data tables.

Therefore the Advisor is correct that RLS is disabled across the listed application tables and that this is a critical security posture issue, but its blanket sentence that every row can currently be read or modified through anon/authenticated is not established by the effective privileges queried here. The exact Data API route exposure and the TRUNCATE path need separate verification. Do not describe the discrepancy as a false positive until that verification is complete.

The role-privilege query was read-only and included inherited privileges. No grants, revokes, policies or schema settings were changed.

## 2B. Function exposure and search-path observations

- The public schema contains 32 functions in the current snapshot. None is marked `SECURITY DEFINER`.
- All 32 report no function-level `proconfig` (no pinned search_path); 31 are pg_trgm extension functions and one is `public.normalize_arabic(text)`.
- `anon` and `authenticated` have effective EXECUTE on those public functions. The inspected `normalize_arabic` body uses built-ins and no application tables, but the mutable search_path warning remains and should be hardened in a versioned migration after verifying function dependencies.
- The broader non-public schema inventory includes Supabase-managed functions; do not mass-alter their search paths or privileges.

## 2C. Current scope count clarification

The 114 public relations consist of 113 ordinary tables and one partitioned parent; partition children are included in the 114. The fresh Advisor's 117-table warning adds three partman tables. A broader catalog query also found `partman.table_privs`, a view, which is why a query counting tables/views reports four partman relations. This explains the 117-versus-118 object-count difference without treating the view as a table.

## 3. Default privileges

The default ACL configured for objects created by `postgres` in `public` repeats the `MAINTAIN`, `REFERENCES`, `TRIGGER`, and `TRUNCATE` grants for `anon`, `authenticated`, and `service_role` on future tables. Therefore, correcting only current table ACLs would not fix the future-object grant behavior.

The inventory also found normal default owner privileges for `postgres` on tables and sequences, and `EXECUTE` for `postgres` on functions.

## 4. Role attributes and membership observations

| Role | Login | Superuser | Create role | Create DB | BYPASSRLS |
|---|---:|---:|---:|---:|---:|
| postgres | yes | no | yes | yes | yes |
| service_role | no | no | no | no | yes |
| authenticated | no | no | no | no | no |
| anon | no | no | no | no | no |
| authenticator | yes | no | no | no | no |
| supabase_admin | yes | yes | yes | yes | yes |

The Supabase-managed role-membership graph includes `authenticator` membership in `anon`, `authenticated`, and `service_role`; it also reports elevated membership relationships for `postgres`. These platform-managed memberships must not be altered as an incidental part of application hardening. The `service_role` and `postgres` roles both bypass RLS.

## 5. API connection identity — qualification

The API source reads `DATABASE_URL` and uses a PostgreSQL connection pool. The Render environment-variable value was not exposed by the available read-only Render integration.

Supavisor recorded authenticated `postgres` sessions from external peer IP `74.220.51.161`. One session termination occurred within a fraction of a second of the Render API process receiving `SIGTERM`. This is a high-confidence timing correlation that Render's API uses the Supabase `postgres` role, but it is not direct proof of the environment variable's username. The management SQL connection is also `postgres` and must not be mistaken for the Render API connection.

Do not record the inference as an exact configuration fact until an application-specific connection identifier or sanitized environment metadata can be correlated.

## 6. Function configuration

`public.normalize_arabic(text)` is not `SECURITY DEFINER`, but its `proconfig` is null, so it has no function-level pinned `search_path`. The inspected body uses PostgreSQL built-ins (`regexp_replace`, `chr`, `translate`, `replace`, `lower`, and `trim`) and does not reference application tables. A fixed function-level path limited to `pg_catalog` is a candidate hardening change, to be introduced as a versioned migration and verified with the Supabase Security Advisor.

## 7. Safe remediation direction

Do not blanket-enable RLS on all 114 relations and do not revoke grants from Supabase-managed roles indiscriminately.

The application currently uses Drizzle queries through a shared `DatabaseService`. A dedicated runtime DB role and an owner/migration role should be separated, but the RLS design must account for how authenticated request identity and active organization context reach PostgreSQL. If the application does not set trusted request context inside a transaction, policies based on per-request user/org settings will not work reliably.

Required design work before DDL:

1. Inventory every table, sequence, function, view and partition by owning domain and access path.
2. Identify the exact Render API connection role without exposing the connection string.
3. Identify every API query path, background worker and migration/seed path that needs privileges.
4. Design a non-owner runtime role with only required schema usage, table DML and sequence privileges.
5. Design request-scoped database identity propagation before enabling RLS policies.
6. Change default privileges for future objects, and validate migrations using the dedicated owner/migration role.
7. Verify negative and positive access tests using the runtime role before staging rollout.

No DDL, grant, revoke, role, migration, environment or deployment change was made during this inventory.


## 2D. Sequence and managed-storage privilege cross-check

A separate effective sequence-privilege query found two sequences in the checked `public` and `auth` schemas; anon, authenticated and service_role had no USAGE, SELECT or UPDATE privilege on either sequence.

The complete postgres default-ACL snapshot also includes managed `storage` schema defaults. Supabase's `storage` schema grants the client roles access to storage metadata tables and functions, with RLS enabled on all eight listed storage relations. These grants are part of the managed Storage subsystem and must not be mass-revoked as if they were application `public` table grants. The seven storage relations with effective SELECT require policy-level verification. The storage `service_role` has broad privileges by design; do not repurpose that managed role as the API's runtime database login.


## 8. Application and release identity path source review (20 November 2026)

A read-only source review now supplements the live catalog inventory:

- `apps/api/src/common/database/database.service.ts` creates the API's shared PostgreSQL pool from `DATABASE_URL`. The API's Drizzle handle uses that pool.
- The automatic migration and RBAC seed path in `DatabaseService` runs only when `NODE_ENV` is `development` or `test`; it is not the production-like API runtime path.
- `apps/api/infra/drizzle/migrate-pg.ts` uses `DATABASE_URL`, holds a session-level advisory lock during the migration sequence, and applies each migration with its ledger insert in one transaction.
- `apps/api/infra/drizzle/seed-pg.ts` writes RBAC permissions, roles and role-permission mappings.
- `.github/workflows/release.yml` maps the environment secret `STAGING_DATABASE_URL` to `DATABASE_URL` for the staging migration, RBAC seed and migration-ledger verification sequence.
- The API runtime `DATABASE_URL` and the release workflow's `STAGING_DATABASE_URL` are separate configuration paths. The source does not prove that they authenticate as different PostgreSQL roles; neither secret value nor username was read.

A least-privilege design is documented in [G-002 Least-Privilege Remediation Design](./G-002-LEAST-PRIVILEGE-REMEDIATION-DESIGN.md). It defines a proposed runtime login/group-role split, the request-context/RLS blocker, staged ACL remediation, required verification and rollback gates. It explicitly prohibits blanket RLS, indiscriminate managed-role revocation and live changes before evidence and approval.

A read-only diagnostic was added at `apps/api/scripts/inspect-db-identity.mjs`, exposed as `pnpm --filter @scs/api db:identity`. It reports the current/session role, role attributes, inherited memberships and effective public table/sequence privileges without printing the connection string or credentials. CI now includes a disposable PostgreSQL validation step for the diagnostic. This script has not been run against Render or Supabase; the actual runtime and migration identities remain unverified until it is executed separately in those environments.

**No live database change was made:** no DDL, grant, revoke, role, membership, RLS, secret, environment, migration, seed, staging or production mutation was performed.


## 9. Fresh runtime, ACL and deployment correlation evidence (20 November 2026)

### 9.1 Current read-only database posture

A fresh read-only catalog query on 20 November reconfirmed:

- 114 public ordinary/partitioned relations.
- RLS enabled: 0; FORCE RLS enabled: 0; RLS disabled: 114.
- Effective privileges on all 114 public relations remain unchanged from the 19 November snapshot for each of `anon`, `authenticated`, and `service_role`: SELECT/INSERT/UPDATE/DELETE = 0; TRUNCATE/REFERENCES/TRIGGER/MAINTAIN = 114.
- The Security Advisor at 22:40:28 UTC returned two warnings: `function_search_path_mutable` for `public.normalize_arabic` and `extension_in_public` for `pg_trgm`. It did not return an `rls_disabled` lint in this run. This does not mean RLS is enabled: the direct catalog query still confirms all 114 relations have RLS disabled. The absence of that advisor lint is not a remediation or an approval to defer the underlying posture.

### 9.2 Render service control-plane evidence

Read-only Render metadata inspection identified one service in the connected workspace:

| Field | Observed value |
|---|---|
| Service | `scs-api-staging` |
| Service ID | `srv-daklr78ae00c73bstr50` |
| Region | Frankfurt |
| Branch | `develop` |
| Auto deploy | Disabled (`autoDeploy=no`, trigger `off`) |
| Instances | 1 |
| Health endpoint | `/v1/readyz` |
| Render Postgres instances in workspace | None |

The latest live Render deployment visible in the control plane was commit `9f5bc397467dc92cdc8debd54797b6d730659c36`, completed 18 November 2026 09:40:25 UTC. The remediation branch has not been deployed. Render's service metadata response did not expose environment-variable values or provide an in-chat remote shell/command execution capability; no environment value was read or changed.

### 9.3 Correlated API shutdown and Supavisor session

A narrow, read-only log correlation was performed for 19 November 2026:

- Render application log for the `scs-api-staging` service recorded `Command failed with signal "SIGTERM"` at 18:22:13.235 UTC on its single instance.
- Supavisor logs recorded a connection using database role `postgres` from peer IP `74.220.51.161` at 18:19:58.035 UTC, followed by a client socket close from the same peer at 18:22:13.440 UTC. A prior client termination from the same peer was logged at 18:21:12.945 UTC.
- The 205 ms timing between the Render SIGTERM and Supavisor socket-close event is a strong temporal correlation. However, the available Render service response did not include outbound-IP metadata, and Supavisor did not include an application name for that peer. Therefore this remains **high-confidence circumstantial evidence**, not direct proof that the Render API process authenticated as `postgres`. Do not convert it into a definitive configuration claim until the sanitized diagnostic runs inside the actual API runtime or the peer IP is independently mapped to the service.

A separate `pg_stat_activity` snapshot at 22:39:25 UTC showed the management API connection as `postgres` with application name `mgmt-api`, plus Supabase internal connections; it did not show a live Render application session at that instant. The management API identity must not be confused with the application runtime identity.

### 9.4 Next diagnostic execution path

The staging release workflow now includes the sanitized `pnpm --filter @scs/api db:identity` command immediately before its first migration operation, using the same `STAGING_DATABASE_URL` and SSL CA as the migration runner. It sets the PostgreSQL application name to `scs-staging-db-identity`. This will establish the migration connection identity on the next authorized staging release; it has not run against the live staging database yet.

The API runtime identity remains unverified. The diagnostic command is ready to run in the Render service's runtime shell:

```bash
pnpm --filter @scs/api db:identity
```

The command is read-only and emits catalog/role metadata only. Run it from the repository root in the `scs-api-staging` service shell; do not copy or print `DATABASE_URL`. No such runtime-shell execution was available through the connected Render integration in this session.

No DDL, grants, revokes, role memberships, RLS policies, secrets, environment variables, migrations, seeds, deployments or business data were changed by this evidence refresh.
