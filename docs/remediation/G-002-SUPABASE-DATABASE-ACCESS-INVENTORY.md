# G-002 — Supabase Database Access Inventory (Read-Only)

| Field | Value |
|---|---|
| Project | `SCS-PlatForm` / `wplsxxevoevzqbgtpctw` |
| Engine | PostgreSQL 17.6 |
| Inventory date | 19 November 2026 |
| Scope | Public-schema relations, roles, memberships, default ACLs, function settings and migration ledger |
| Access mode | Read-only SQL |
| Status | INVENTORY VERIFIED; REMEDIATION DESIGN OPEN |

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
