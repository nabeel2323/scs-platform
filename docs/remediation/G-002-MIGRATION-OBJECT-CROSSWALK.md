# G-002 — migration object and tenant-ownership crosswalk

**Audit date:** 28 November 2026  
**Baseline:** `develop` at `c37c4d94f728b2806e7efb59d0380adb24472597`  
**Scope:** Source-only review of all 77 numbered SQL migrations under `infra/drizzle/migrations`. No database connection or mutation was performed for this document.

## Executive findings

- The 77-file migration set contains one application-defined PostgreSQL function: `public.normalize_arabic(TEXT)`, created in `0007_search.sql`. It is declared `IMMUTABLE`, uses PL/pgSQL built-ins, and is not declared `SECURITY DEFINER`. Migration `0070_normalize_arabic_search_path.sql` pins the function-local search path to `pg_catalog` and fails if the catalog setting is absent.
- The analytics event table is range-partitioned by `created_at` in `0002_platform.sql`; `0013_analytics.sql` renames/replaces the initial table with a monthly partitioned parent and configures pg_partman. `0018_analytics_retention.sql` establishes the 12-month retention policy. Treat parent, partitions, pg_partman configuration and its template as one operational ownership surface.
- No `CREATE TRIGGER`, `CREATE PROCEDURE`, `CREATE RULE`, explicit `OWNER TO`, or migration-authored `SECURITY DEFINER` declaration was found in the numbered migrations. This is a source scan, not a live catalog proof that no externally-created triggers/routines or ownership overrides exist.
- `0076_public_api_role_privilege_hardening.sql` is the only migration in this set that changes grants/default ACLs: it revokes all table and sequence privileges from Supabase `anon` and `authenticated`, and dynamically revokes their future table/sequence default privileges for roles that create objects in `public`. Its effect is dependent on the executing role/object-creator set; it does not establish a dedicated application runtime role.
- Foreign keys are predominantly single-column references. They enforce referential integrity, but generally do not encode tenant equality across related rows. Tenant isolation must continue to be proven by service predicates, authenticated actor context and, later, table-specific RLS policies—not inferred from an FK.
- `0002_platform.sql` creates generic audit/outbox records without FK ownership to a user/org aggregate. Those records require explicit actor/aggregate authorization and should not be treated as tenant-safe merely because they carry `org_id` or `aggregate_id` values.

## Migration object inventory

| Area | Migrations | Source finding | G-002 implication |
|---|---|---|---|
| Identity and membership | 0001, 0014, 0021, 0022, 0054, 0064, 0067–0069 | User/session/org/role/membership FKs and bootstrap/onboarding structures | Verify active membership and active-org predicates at every user-facing service boundary; FKs alone do not establish caller authorization |
| Platform audit/outbox/analytics | 0002, 0013, 0018 | Audit and outbox are generic records; analytics is monthly range-partitioned and pg_partman-managed | Audit/outbox require explicit actor attribution and guarded state transitions; analytics parent/partitions/config/template need consistent ownership and grants |
| Merchant/store/catalog/inventory/pricing | 0003–0006, 0023–0039, 0053–0057 | Store/org/product/variant/warehouse/offer/catalog-request relationships; many single-column FKs | Crosswalk each write/read predicate to authoritative store/org lineage and active membership; do not assume an FK implies same-tenant linkage |
| Search | 0007, 0070 | Immutable Arabic normalization function; pg_trgm extension; function search_path pinned to pg_catalog | Preserve the function-local search_path hardening; verify live function owner/config and extension schema/owner independently |
| Orders, fulfillment and carriers | 0008–0012, 0040–0052, 0072, 0077 | Promotion/cart/order/shipment/driver/carrier/credential relationships; credential-scoped webhook linkage and legacy manual-review quarantine | Check caller/worker actor and exact order→store→org lineage before side effects; credential/provider/org/store bindings must be revalidated |
| Payments, returns and reconciliation | 0058–0063, 0074–0075 | Payment, refund, settlement, return, dispute and reconciliation links; upload-intent linkage | Verify exact payment/order/merchant-store lineage and tenant/version uniqueness at each operation; do not rely on generic FK linkage |
| API privilege hardening | 0076 | Revoke anon/authenticated table/sequence privileges and current-role default ACL grants | Confirm actual object creators, object owners, runtime role and migration role before further ACL changes or RLS rollout |

## Principal and execution-boundary matrix

| Entry point | Connection / actor behavior | Remaining issue |
|---|---|---|
| API runtime — `DatabaseService` | Dedicated `pg.Pool`; production-like startup requires verified TLS, session/effective role equality, safe role flags, and no public table/schema ownership | Live Render logs previously showed the API pool connected as `postgres` with BYPASSRLS/CREATEROLE/CREATEDB and TLS disabled. The startup guard correctly rejects this configuration; no credential or service change is authorized here |
| Scoped API operation — `withActorContext` | One transaction-bound Drizzle handle; actor settings use transaction-local `set_config(..., true)`; nested calls are constrained | Explicit opt-in only. The tenant interceptor is not globally registered. Continue route/service callsite audit before any RLS activation |
| HTTP audit middleware | Deferred audit write gets its own explicit audit actor context and short transaction; it cannot inherit the request transaction after response finish | Confirm unauthenticated/authentication-failure semantics and keep audit writes separate from caller-controlled identity |
| Workers and lease operations | Reviewed worker paths use worker/system actor context and lease holder identity | Continue checking every raw SQL call and any future worker path; do not activate disabled workers |
| Realtime | Reviewed room joins use authenticated socket actor context and fail closed | Keep room authorization tied to JWT subject/role/org and revalidate active membership in the same DB transaction |
| Standalone migration runner — `migrate-pg.ts` | Separate `pg.Pool`; session identity diagnostics are non-fatal; verified TLS only when `PGSSLROOTCERT` is provided; migration SQL runs on a direct `PoolClient` | Migration principal/TLS/ownership remain unverified; no migration actor context; do not alter until the exact migration principal and object ownership/default ACL impact are established |
| RBAC/catalog seed | Standalone pool; operator/system actor context inside transaction; CA TLS optional | Catalog seed defaults to `production` profile and demo-offer path creates demo organizations/users/stores/warehouses/offers. Never run on staging without explicit target/profile guard and separate authorization |
| Reset utility | Direct `pg.Client`; CA-verified TLS, environment/database confirmation and separate staging reset approval | Destructive by design; identity check currently reports database/current_user but does not enforce role capability/ownership or actor context. Not run; preserve staging data |
| Manual staging bootstrap scripts | Shared helper validates explicit staging environment, exact DB name and approval; establishes transaction-local bootstrap actor context; scripts configure CA-verified TLS | Shared helper currently checks only `current_database()` and `current_user`; it does not validate `session_user`, role capability flags, public ownership or `pg_stat_ssl`. Review/harden as a bounded source change after confirming script-specific required privileges |

## Live catalog evidence still required

The source scan does **not** prove actual database object ownership. A protected, read-only catalog inventory must capture, without exposing credentials:

1. `pg_class` / `pg_namespace` owners for all public tables, partitions, indexes, sequences and the pg_partman template.
2. `pg_proc` owner, language, `prosecdef`, `proconfig` and ACL for `public.normalize_arabic(TEXT)` and any non-migration routines.
3. `pg_trigger` and `pg_rewrite` inventory, including enabled state and referenced functions.
4. Parent/child partition tree and pg_partman configuration/template owner and ACLs.
5. Effective ACL and default ACL inventory by every object-creating role, including the role that actually ran migrations 0072–0077.
6. Separate API runtime, migration, seed/bootstrap and administrative session/effective identities plus verified TLS state.

## Controlled next steps

1. Complete the repository-wide direct `pg.Pool`/`pg.Client` callsite inventory and map each to its environment, identity check, TLS mode, transaction boundary and actor context.
2. Finish the FK-to-tenant ownership matrix for sensitive workflows: offers/catalog, inventory, cart/order, shipment/carrier, payment/refund/settlement, returns/disputes and reconciliation.
3. Add source-level tests for the manual bootstrap helper's missing identity/TLS checks only after confirming the expected bootstrap privilege contract; do not run the scripts.
4. Keep the migration runner's fail-closed identity/TLS work, role creation/rotation, grants/default ACLs, RLS and Render rollout behind a separately reviewed principal/ownership/rollback plan and explicit authorization.
5. Preserve migration advisory locking, per-migration transactions and ledger semantics. No staging reset, seed, migration, RLS activation, role/credential change, Render mutation, deployment, restart, worker activation or provider call is authorized by this audit.

## Scope limitations

This is a source-level inventory against the named `develop` commit. It is not a database catalog dump, a complete per-query service predicate proof, a live API/migration credential verification, or a claim of production readiness. The project has no production database; Supabase is staging only.
