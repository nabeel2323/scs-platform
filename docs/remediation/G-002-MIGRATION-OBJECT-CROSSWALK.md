## G-002 worker-lineage review — tracking poller and reconciliation — 28 November 2026

- Reviewed current `develop` source for `carrier-tracking-poller.ts`, `carrier-reconciliation.service.ts`, `shipping-carrier.worker.ts`, `DatabaseService.withActorContext`, the merchant `stores` schema and `OrdersService.processCarrierDelivery`.
- Authoritative lineage is `shipment.store_id → stores.id → stores.org_id`, with an independent `shipment.order_id → orders.id` relationship that must also satisfy `orders.store_id = shipment.store_id`. Both FKs exist independently; they do not enforce this cross-row equality or establish org scope.
- `ShippingCarrierWorker` already provides the stronger reference pattern: it resolves the store's authoritative org through `MerchantService.getStoreTenantContextForSystem`, checks optional outbox store/org metadata against that org, checks the order belongs to the shipment store, then binds subsequent order/shipment operations to a worker context with that exact `activeOrgId`. Global event claim/lease maintenance remains a platform-worker operation.
- The preliminary note in this section is superseded by the source refresh below. Current `CarrierTrackingPoller` and `CarrierReconciliationService` use `resolveCarrierShipmentTenantContext` before provider lookups and per-shipment business writes. The resolver obtains the authoritative `stores.org_id` in a platform worker scope, then verifies `orders.store_id === shipments.store_id` in a separate worker context bound to that exact org.
- Tracking-event inserts, delivered-after-cancel event/recovery writes, shipment status changes, the `OrdersService.processCarrierDelivery` bridge, create/cancel reconciliation status updates, and retry outbox insertion all run inside the resolved org-bound worker context. Shipment updates are constrained by shipment and store IDs; retry outbox rows carry explicit `organizationId` and `storeId`.
- Global atomic claim/lease operations remain platform-worker operations by design. They use bounded `FOR UPDATE SKIP LOCKED` claims; they must be distinguished from tenant-specific business writes rather than mechanically forced into an arbitrary tenant. Provider network calls remain outside the actor-context DB transaction.
- The refreshed source review does not establish a remaining per-shipment attribution gap in these two worker paths. This is a source-level finding only; it does not prove all worker paths or every tenant predicate in the application. Preserve the existing lineage regression tests and do not reimplement the resolver already present in `develop`.

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
| Manual staging bootstrap scripts | Shared helper requires explicit staging environment, exact DB name and approval; checks session/effective role equality, rejects privileged role flags and public ownership, verifies `pg_stat_ssl`, then establishes transaction-local bootstrap actor context | Scripts require CA-verified TLS and invoke the fail-closed helper before writes. No further helper hardening is indicated by the current source; do not execute these scripts during audit |

## Live catalog evidence — staging read-only inspection, 28 November 2026

A SELECT-only catalog inventory was executed against Supabase project `wplsxxevoevzqbgtpctw`. It ran as the Supabase SQL tool's own `postgres` session over TLS. This is **not** proof of the Render API runtime or standalone migration runner identity; the earlier Render API diagnostic independently reported `postgres` with TLS disabled and elevated role flags.

- Public relation ownership: 114 ordinary tables, one partitioned parent, and one sequence are owned by `postgres`. The analytics partition children and default partition are also owned by `postgres`.
- RLS: 115 public tables/partitioned relations inspected; 0 have RLS enabled and 0 have FORCE RLS.
- Foreign keys: 182 public-schema foreign-key constraints are present.
- Application function: `public.normalize_arabic(TEXT)` is owned by `postgres`, PL/pgSQL, not SECURITY DEFINER, and has `search_path=pg_catalog` in `proconfig`.
- Public functions also include pg_trgm extension C functions owned by `supabase_admin`; these are extension objects, not extra application-defined routines.
- No non-internal triggers were returned for public tables.
- pg_partman 5.3.1 is installed in schema `partman`, extension owner `postgres`; `public.analytics_events` is configured for monthly range partitioning and 12-month retention, with `retention_keep_table=false` and `retention_keep_index=false`.
- Effective privileges: `anon` and `authenticated` have zero SELECT/INSERT/UPDATE/DELETE/TRUNCATE privileges on the 115 public relations; both retain public-schema USAGE but not CREATE. `postgres` has full table privileges and public-schema CREATE. `service_role` has zero CRUD privileges but does have TRUNCATE, REFERENCES and TRIGGER on all 115 relations (and MAINTAIN where supported), granted by `postgres`. Treat this role as highly privileged and server-only; do not expose its key to clients.
- Default ACLs for objects created by `postgres` in `public` no longer grant table/sequence privileges to `anon` or `authenticated`; the table default ACL still grants `service_role` TRUNCATE/REFERENCES/TRIGGER/MAINTAIN, not CRUD. The `supabase_admin` default ACL in `public` still grants broad table and sequence privileges to `anon`, `authenticated` and `service_role`. Current application relations are all owned by `postgres`, so this is a future-object risk if application objects are ever created as `supabase_admin`; do not change Supabase-managed defaults without a provider-aware review.
- The SQL tool session itself reported `session_user=current_user=postgres`, `ssl=true`, `rolsuper=false`, `rolbypassrls=true`, `rolcreaterole=true`, and `rolcreatedb=true`. These flags are privileged but belong to the SQL tool connection, not necessarily the app/migration connections.

This evidence closes the live ownership/partition/function/trigger/ACL inventory for the current staging catalog, but it does not establish the standalone migration runner's identity, TLS, or the Render API pool's current live state beyond the previously observed application log diagnostic. It also does not prove route-by-route authorization predicates.

## Controlled next steps

1. Complete the repository-wide direct `pg.Pool`/`pg.Client` callsite inventory and map each to its environment, identity check, TLS mode, transaction boundary and actor context.
2. Finish the FK-to-tenant ownership matrix for sensitive workflows: offers/catalog, inventory, cart/order, shipment/carrier, payment/refund/settlement, returns/disputes and reconciliation.
3. Retain the existing fail-closed staging bootstrap helper and its regression tests; review only if the helper contract or one of the five callers changes. Do not run the scripts.
4. Keep the migration runner's fail-closed identity/TLS work, role creation/rotation, grants/default ACLs, RLS and Render rollout behind a separately reviewed principal/ownership/rollback plan and explicit authorization.
5. Preserve migration advisory locking, per-migration transactions and ledger semantics. No staging reset, seed, migration, RLS activation, role/credential change, Render mutation, deployment, restart, worker activation or provider call is authorized by this audit.

## Scope limitations

This is a source-level inventory against the named `develop` commit. It is not a database catalog dump, a complete per-query service predicate proof, a live API/migration credential verification, or a claim of production readiness. The project has no production database; Supabase is staging only.


## Additional application callsite and tenant-predicate review — 28 November 2026

- Direct `pg.Pool`/`pg.Client` source entrypoints confirmed in the reviewed operational files: API `DatabaseService`; standalone `migrate-pg.ts`; RBAC seed `seed-pg.ts`; catalog seed `seed-catalog.ts`; destructive `reset-pg.ts`; five staging bootstrap scripts (merchant/platform/RBAC/staff/store); read-only `audit-db-access.ts`; local-only `create-admin-user.ts`; and `bootstrap-issue-token.ts`. `src/scripts/seed.ts` delegates to the configured Drizzle database and is not a separate direct pg pool. The scan did not identify direct pg pools in the reviewed domain service files; those use the shared DatabaseService/Drizzle handle.
- The five staging bootstrap scripts all require CA-verified TLS and invoke the shared exact-database/environment/approval guard, then set transaction-local bootstrap actor context. The helper verifies session/effective role equality, rejects superuser/BYPASSRLS/CREATEROLE/CREATEDB, rejects public table/schema ownership, and requires `pg_stat_ssl.ssl = true`. No bootstrap script was executed.
- `audit-db-access.ts` is designed as a read-only catalog audit and opens a read-only transaction with audit actor context, but CA TLS is optional and it reports rather than rejects unsafe identity. It was not executed through the actual Render API connection; the separate Supabase SQL-tool catalog queries above were SELECT-only and used the tool's own postgres/TLS session.
- `create-admin-user.ts` is restricted to development/test and local database hostnames, with explicit confirmation and transaction-local bootstrap actor context. `bootstrap-issue-token.ts` applies production-like role/TLS/ownership checks before issuing a token and sets transaction-local bootstrap actor context.
- Domain predicate spot-check: merchant offer creation/listing calls `assertStoreInOrg` and `assertStoreMember`; inventory operations cross-check store/org membership and ensure warehouse/variant resolve to the same store; shipping checks active organization membership and driver/store assignment; carrier credentials are scoped by org and actor context; payment operations resolve the order and enforce buyer or merchant store/org access; cart insertion resolves store from product/offer rather than trusting caller-supplied storeId. These are positive source findings, not a complete method-by-method authorization proof.
- Actor context remains opt-in rather than global. AppModule registers AuditLogMiddleware globally but does not globally register TenantDatabaseContextInterceptor. A subset of services (notably catalog, orders, payments, merchant and carrier-credential workflows) use explicit `withActorContext`; several reviewed services rely on explicit caller parameters and service-level predicates without a transaction-bound actor context. RLS must remain disabled until every route/service/worker/raw SQL path is classified and tests prove actor context coverage.



## G-002 refreshed worker, webhook/outbox and PostgreSQL entrypoint review — 28 November 2026

Read-only verification against current `develop` after exact merge-commit CI #1750 passed all ten mandatory jobs. No application source or runtime configuration was changed in this review.

### Carrier worker lineage — refreshed finding supersedes the earlier preliminary note above

- `apps/api/src/modules/shipping/carrier-shipment-tenant-context.ts` resolves the authoritative store through `MerchantService.getStoreTenantContextForSystem` in a platform worker scope, rejects missing/malformed store or org identity, then verifies the independent order reference under a worker context bound to that exact `orgId`. It returns the verified `orgId/storeId/orderId` tuple only when `orders.store_id === shipments.store_id`.
- `CarrierTrackingPoller` and both create/cancel paths in `CarrierReconciliationService` use that resolver before provider lookups or tenant-specific writes. Tracking-event inserts, recovery/status updates, delivery bridge, reconciliation updates and retry outbox insertion all run with the resolved org-bound worker context and constrain shipment updates by both shipment and store IDs. Retry events carry `organizationId` and `storeId`.
- Global claim/lease SQL remains a separate platform-worker operation, preserving `FOR UPDATE SKIP LOCKED`, bounded batches and claim semantics. Provider network calls remain outside the actor-context transaction. The source and focused lineage tests are present on current `develop`; exact-head CI #1750 passed all mandatory jobs.
- This closes the specific per-shipment worker attribution gap described in the preliminary section above at source level; it does not prove all worker paths or all tenant predicates across the application.

### Webhook and outbox

- `CarrierWebhookController` uses a dedicated platform worker context only for global credential discovery. Tokenized requests select one exact credential; legacy provider-only lookup rejects multiple active credentials rather than choosing one.
- Secret decryption, webhook event persistence/deduplication, shipment routing, pending-state updates and retry outbox reads/writes use a worker context bound to the credential's exact `orgId`. Retry outbox rows set `organizationId` explicitly.
- `apps/api/src/common/outbox/outbox-dispatcher.service.ts` deliberately does not poll or mark rows dispatched because no generic delivery adapter exists. Its `publish` method only inserts PENDING rows and uses a supplied transaction client when provided, otherwise the shared DatabaseService handle; caller actor-context inheritance therefore depends on the caller. Carrier events are owned by `ShippingCarrierWorker`. No generic consumer-side actor-context/acknowledgement path is currently active in this dispatcher.
- Audit middleware opens a dedicated `audit` actor context for deferred writes; `AuditService.record` reuses an active transaction or opens its own audit context. This remains distinct from tenant business writes.

### Direct PostgreSQL entrypoint paths confirmed

- API runtime: `apps/api/src/common/database/database.service.ts` — `pg.Pool`, production-like fail-closed TLS/identity gate and opt-in transaction-bound actor context.
- Migration runner: `apps/api/infra/drizzle/migrate-pg.ts` — `pg.Pool` plus direct `PoolClient`; optional CA TLS and non-fatal identity diagnostic. Preserve advisory lock, per-migration transactions and ledger semantics.
- RBAC seed: `apps/api/infra/drizzle/seed-pg.ts` — `pg.Pool`/client and optional CA TLS; operator/system actor context. Never run as part of this audit.
- Catalog seed: `apps/api/infra/drizzle/seed-catalog.ts` — `pg.Pool`/client and optional CA TLS; production-profile default and demo-data path require explicit target/profile safeguards. Never run as part of this audit.
- Destructive reset: `apps/api/infra/drizzle/reset-pg.ts` — direct `pg.Client`, requires CA TLS and environment/database confirmation; identity check is not a complete role-capability/ownership guard. Never run.
- Bootstrap token issuer: `apps/api/src/scripts/bootstrap-issue-token.ts` — direct `pg.Client`, performs production-like identity/TLS/ownership checks and uses a transaction-local bootstrap actor context.
- Five manual staging bootstrap scripts, read-only `audit-db-access.ts`, and local-only `create-admin-user.ts` remain part of the inventory. Their exact file-by-file helper and guard matrix remains to be completed; no scripts were executed. `src/scripts/seed.ts` delegates to configured Drizzle and is not another direct pg pool.
- The source inventory does not authorize changing the API or migration credentials, TLS, roles, grants/default ACLs, RLS or Render configuration. The previously recorded live API diagnostic and SQL-tool catalog session are distinct principals and must not be conflated.

### Remaining bounded work

1. Complete the five bootstrap-script/shared-guard and audit-db-access helper matrix, including exact paths, target guards, TLS, identity enforcement, actor context and read/write scope.
2. Finish outbox callsite inventory: identify all `publish` callers, whether they pass a transaction client, and whether their transaction already has an appropriate actor context. Keep the dispatcher disabled until a real delivery adapter has explicit ownership, ack and retry semantics.
3. Compare the existing diverged `fix/g002-carrier-worker-tenant-scope-20261128` branch's eight commits against current `develop`; current source already contains the resolver and org-bound write pattern, so do not merge/cherry-pick the branch wholesale or duplicate it.
4. Continue the service operation-to-table tenant predicate matrix. No RLS/role transition until complete route/service/worker/raw-SQL coverage and tests exist.

No staging/shared database write, migration, seed/reset/bootstrap execution, provider call, worker activation, Render mutation, deployment, restart, credential/role/grant/default-ACL/RLS change or release was performed.


## G-002 source refresh — 28 November 2026

- Re-read `apps/api/scripts/staging-bootstrap-safety.ts` at current `develop` and corrected the preliminary table/paragraph above: the shared helper already verifies exact database, session/effective role equality, dangerous role flags, public ownership and TLS. The five manual staging bootstrap scripts additionally require CA material and set the bootstrap actor. No hardening change is needed on the evidence reviewed.
- Re-read `carrier-tracking-poller.ts`, `carrier-reconciliation.service.ts` and `carrier-shipment-tenant-context.ts`. Both workers already resolve authoritative store organization and verify order/store equality before provider operations or tenant-specific writes. Per-shipment mutations, events, delivery bridge and retry outbox writes run under the exact org-bound worker context; retry events carry organization and store IDs. Global SKIP LOCKED claims remain explicit platform-worker lease operations.
- The old worker-gap note at the top of this crosswalk was preliminary and is superseded by the corrected current-source finding. Do not implement/cherry-pick a duplicate tenant resolver or rework already-correct claim semantics.
- CI run #1753 (run ID `46163157475`) passed all mandatory GitHub Actions jobs on the payment actor-context source/test head. Vercel admin/web preview statuses remain external free-plan rate-limit failures; they are not GitHub Actions test failures.
