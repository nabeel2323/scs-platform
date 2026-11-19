# Database Access Verification — 19 November 2026

**Repository:** `nabeel2323/scs-platform`  
**Working branch:** `remediation/phase-0-1-tenant-security`  
**Finding:** G-002 — database privileges and RLS architecture  
**Environment:** Shared Supabase PostgreSQL project `wplsxxevoevzqbgtpctw` (`SCS-PlatForm`)  
**Method:** Read-only Supabase SQL queries, project metadata, Security Advisor, source inspection  
**Mutation performed:** None

## Executive result

G-002 remains **OPEN / PARTIALLY REMEDIATED**. The live inventory and effective privileges were rechecked on 19 November. The API's deployed database identity is still **NOT VERIFIED**: the Supabase MCP connection authenticated as `postgres`, which is an administrative inspection identity and is not evidence of the Render API's connection identity. The observed `pg_stat_activity` snapshot contained no clearly identifiable SCS API session.

Do not enable RLS, change live grants, or apply migration 0070 until the API and migration connection identities and the application access model are verified.

## Live identity and role evidence

The SQL inspection session reported:

- `current_user = postgres` and `session_user = postgres`.
- PostgreSQL 17.6 on the Supabase project.
- `postgres` has `BYPASSRLS`, role-creation and database-creation privileges.
- `service_role` has `BYPASSRLS` and cannot log in directly.
- `anon` and `authenticated` do not have `BYPASSRLS` and cannot log in directly.
- `authenticator` is the PostgREST login role; the observed PostgREST session was idle under `authenticator`.
- `pg_stat_activity` showed PostgREST/authenticator, pgbouncer, Supabase management API/postgres, pg_net and Supabase admin background sessions. No session could be attributed to the SCS API.

**Interpretation:** this confirms the MCP administrative connection and Supabase-managed connection roles only. It does not prove the credentials configured as Render `DATABASE_URL` or GitHub `STAGING_DATABASE_URL`.

## Public table inventory and RLS

| Measure | Live result |
|---|---:|
| Public ordinary/partitioned tables | 114 |
| Tables owned by postgres (prior inventory; ownership remains to be rechecked alongside full classification) | 114 |
| RLS enabled | 0 |
| RLS forced | 0 |

Supabase Security Advisor currently emits the critical `rls_disabled` finding for all 114 public tables. Its explanatory text says the tables are fully exposed for read/write through the anon key. The direct privilege checks below do **not** support that full read/write claim: `anon` and `authenticated` currently have no SELECT, INSERT, UPDATE or DELETE privilege on these 114 tables. The advisor is correctly flagging that RLS is absent, but its blanket description does not reflect the effective DML grants observed in this snapshot.

RLS being disabled remains a serious defense-in-depth and future-grant risk. It must not be fixed by blindly enabling RLS: the application uses a direct PostgreSQL API connection and does not use Supabase Auth as its application authorization system. Policies based on `auth.uid()` would not automatically represent the SCS user's custom JWT/session and organization membership model.

## Effective table privileges

Effective privileges were counted using PostgreSQL `has_table_privilege` across all 114 public tables:

| Role | SELECT | INSERT | UPDATE | DELETE | TRUNCATE | REFERENCES | TRIGGER | MAINTAIN |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| anon | 0 | 0 | 0 | 0 | 114 | 114 | 114 | 114 |
| authenticated | 0 | 0 | 0 | 0 | 114 | 114 | 114 | 114 |
| service_role | 0 | 0 | 0 | 0 | 114 | 114 | 114 | 114 |

The raw ACL for representative tables (`users`, `orders`, `merchant_offers`, `products`) confirms these non-DML grants are explicit. In particular, TRUNCATE is a destructive privilege and should not be granted to public client roles. MAINTAIN is a PostgreSQL 17 table-maintenance privilege; it is not row-read or row-write access, but is also unnecessary for these client roles.

All three roles have USAGE but not CREATE on schema `public`.

## Default privileges

The live `pg_default_acl` inventory shows:

- Default privileges for objects created by `postgres` in `public` grant anon/authenticated/service_role table privileges including MAINTAIN, REFERENCES, TRIGGER and TRUNCATE.
- Default privileges owned by `supabase_admin` include broad table DML grants for anon/authenticated/service_role, sequence grants and function EXECUTE grants.

Do not modify the Supabase-managed `supabase_admin` default ACL without a separate ownership and platform-support review. The `postgres` default ACL is the application-relevant grant recurrence that migration 0070 is intended to address when executed by the appropriate owner role.

Migration 0070 currently revokes all table and sequence privileges from anon/authenticated on existing objects and revokes their future table/sequence defaults for **the role executing the migration**. It does not revoke service_role privileges or alter supabase_admin defaults. Its default-ACL behavior must be verified against the actual migration login role before any live application.

## Functions and extensions

- Public functions: 32.
- SECURITY DEFINER functions: 0 in the inspected public schema.
- anon/authenticated can execute all 32 public functions.
- All 32 had no function-level configuration in the broad inventory query; this is an inventory signal, not proof that every function needs a pinned search_path. Review each function's body, volatility and exposure before changing it.
- Security Advisor flags `public.normalize_arabic(text)` for mutable search_path. Migration 0070 pins it to `pg_catalog` and CI asserts that setting.
- Security Advisor also flags `pg_trgm` installed in `public`. G-022 remains open; extension relocation requires dependency/index review and is not part of this G-002 grant remediation.

## Migration ledger

The application's authoritative `public._migration_log` contains 69 rows; the latest recorded migration is `0069_organization_onboarding_permission.sql`, applied at `2026-11-17 16:07:23 UTC`.

Supabase `list_migrations` returned an empty list. It is not the authoritative ledger for this application's custom migration runner.

Migrations 0070 and 0071 have been validated in isolated CI PostgreSQL but are not recorded in the shared database's custom ledger. No live migration was applied during this verification.

## Source-level access path findings

- The NestJS API creates a direct `node-postgres` Pool from `DATABASE_URL`, then wraps it with Drizzle.
- Production startup does not auto-run the development migration/seed path; that path is restricted to `NODE_ENV=development` or `test`.
- The repository's migration runner also uses `DATABASE_URL`.
- The staging release workflow maps `STAGING_DATABASE_URL` to `DATABASE_URL` for the migration job. The secret value and username are intentionally not inspected or logged.
- The API does not use Supabase JS as its primary data access layer; web/mobile use the SCS API.
- The runtime API and migration roles may be different. Neither is proven by the MCP SQL session.

## Work added to make the next verification deterministic

A read-only audit utility has been added:

- `apps/api/scripts/audit-db-access.ts`
- `pnpm --filter @scs/api db:audit-access`

It reports the effective/login role, role attributes, effective privileges across public tables and sequences, schema privileges, RLS coverage, default ACLs, public function exposure and role memberships. It does not read application rows, print the connection string, or mutate the database.

A manually dispatched GitHub workflow, `.github/workflows/db-access-audit.yml`, runs this utility using the staging environment's `STAGING_DATABASE_URL` and CA certificate. It is read-only and does not deploy or migrate. Because GitHub only exposes `workflow_dispatch` workflows present on the default branch, this workflow becomes dispatchable after the branch containing it is promoted to the default branch; the workflow itself checks out `develop` for its audit code.

## Required next steps

1. Run the read-only workflow against the configured staging connection and record the effective login/effective roles. Never print or expose the DSN.
2. Obtain equivalent evidence for the running Render API process using its own `DATABASE_URL` without revealing its value; use a controlled read-only connection diagnostic or application telemetry.
3. Confirm whether API and migration credentials use the same role, and whether either role is a superuser, object owner, member of an owner role, or has `BYPASSRLS`.
4. Finish the table-by-table classification: API-private, public catalog read, tenant-scoped, user-owned, financial/audit, operational/worker, migration/system.
5. Review all views/materialized views, functions, sequences, default ACLs, extension dependencies and direct Data API exposure.
6. Design a least-privilege API role and migration-owner model that matches the direct Drizzle access path. Do not rely on Supabase `auth.uid()` unless the app is intentionally migrated to Supabase Auth.
7. Build isolated PostgreSQL tests for grants, role switching, API query compatibility and cross-tenant negative cases.
8. Only after source/CI review and an approved staging window, plan a staged migration. Do not apply it to the shared database as part of this audit.

## Safety statement

This report is based on read-only live queries and source inspection. No SQL mutation, migration, grant change, RLS enablement, worker activation, Render configuration change or deployment was performed.
