# G-002 Database Access Path Inventory

**Audit date:** 22 November 2026  
**Branch:** remediation/phase-0-1-tenant-security  
**Source baseline:** d8f9941e9f517c93b9fbcb22bae1a1eeb384bce2  
**Status:** Preliminary static source inventory — not a complete runtime proof and not authorization to enable RLS.

## Purpose and safety boundary

This inventory supports the G-002 transaction-bound tenant-context design. It records the database access paths that must be accounted for before request-scoped context or RLS can be safely enabled. It does not change database roles, grants, default ACLs, schemas, migrations, policies, runtime secrets or worker activation.

The source audit reviewed all 53 TypeScript service/worker/provider files under apps/api/src/modules, plus DatabaseService, DatabaseModule, AuditService, AuditLogMiddleware, JwtAuthGuard, PermissionsGuard, AppModule and main.ts. The source review did not inspect a live database or staging environment.

## Confirmed source access paths

| Access path                          | Current implementation                                                                                                                                                                                                                                                                          | RLS / transaction-context implication                                                                                                                                                                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HTTP module services                 | Services inject the singleton DatabaseService and issue Drizzle operations through DatabaseService.db (select/insert/update/delete and db.execute(sql...)). There is no request-bound AsyncLocalStorage transaction context in the reviewed common database path.                               | A transaction-local tenant setting cannot be assumed to exist for normal service queries. Every request operation must be routed through an explicit transaction-bound handle before RLS is enabled.                                                                                       |
| Service-level transactions           | Explicit db.transaction calls exist in inventory, merchant, store membership, orders, payments, returns, business calendar, settlement adjustments, catalog-import execution and bootstrap flows.                                                                                               | A request-level transaction wrapper may create nested transactions/savepoints. Nested transaction semantics, transaction lifetime and rollback behavior must be proven before adoption.                                                                                                    |
| Raw Drizzle SQL                      | Several modules use DatabaseService.db.execute(sql...). These remain Drizzle operations on the configured database handle, not independent authorization boundaries.                                                                                                                            | A future scoped handle must cover both query-builder and execute(sql...) calls; do not assume typed query-builder coverage is enough.                                                                                                                                                      |
| Audit middleware                     | AuditLogMiddleware records mutating HTTP requests asynchronously after response completion through AuditService.record. AuditService writes with DatabaseService.db and receives actor type, actor ID, org ID, IP and request metadata.                                                         | The audit write is outside the controller's service transaction and may run after its context is gone. It needs an explicit audit/system context and a deliberate decision about whether audit rows participate in or are independent from the request transaction.                        |
| Authentication and permission guards | JwtAuthGuard attaches the decoded JWT payload to request.user; PermissionsGuard reads permissions from that payload. The reviewed guards do not issue database queries.                                                                                                                         | Guards are not currently a database-query path that needs a tenant transaction. Any future DB-backed permission lookup would need explicit ordering/context design.                                                                                                                        |
| Background workers and monitors      | AutoCompleteWorker, ReturnExpirationWorker, ShippingCarrierWorker, CarrierTrackingPoller, OutboxDispatcher, P13MonitorService, WorkerLeaseService and OpsAlertService use the shared DatabaseService handle outside normal HTTP request execution.                                              | These must receive an explicit system/worker or tenant-scoped context. They cannot inherit a user request's AsyncLocalStorage context. The P13 return-expiration worker is opt-in; P13Monitor is separate and always runs; other in-process workers have their own startup/claim behavior. |
| Startup identity diagnostic          | DatabaseService creates the runtime pg.Pool from the resolved DATABASE_URL and logs non-secret session_user/current_user, role privilege flags (including BYPASSRLS) and SSL state.                                                                                                             | This is source-level diagnostic capability only. Actual staging API identity remains unverified until protected runtime evidence is collected.                                                                                                                                             |
| Development migration and seed path  | In development/test only, DatabaseService creates a separate bootstrap Pool and PoolClient using the same resolved connection string, applies SQL migrations and RBAC seed transactionally, then closes the bootstrap pool. Production/staging migration execution is a separate workflow path. | Runtime API and migration identities must remain distinct in protected environments. Do not infer production role separation from this development bootstrap code.                                                                                                                         |
| Direct pg PoolClient usage           | Within the reviewed application source, raw pool/client queries are concentrated in DatabaseService startup identity and development migration/seed code. No direct new Pool/pool.query/client.query pattern was found in the reviewed module service/worker/provider set.                      | This is a bounded source finding, not proof that scripts, CLI tools, tests, connectors or future modules have no direct database paths.                                                                                                                                                    |

## Important transaction-context blockers

1. DatabaseService.db is a singleton NodePgDatabase property, not a request-aware getter. A request handler's user/org identity is not automatically bound to the connection executing a query.
2. Many service methods open their own transactions. Any outer request transaction must prove compatibility with nested Drizzle transactions/savepoints and existing transaction callbacks.
3. AuditLogMiddleware writes asynchronously after response completion. Its actor/org metadata is available, but it is not automatically inside a controller transaction.
4. Background workers, the outbox dispatcher, operations monitor, worker lease service and bootstrap paths need explicit system/worker/bootstrap identity. They must never inherit a stale or unrelated HTTP tenant context.
5. Raw Drizzle execute(sql...) calls must be covered by the same scoped transaction mechanism as typed query-builder calls.
6. The current source inventory does not prove that the staging API runtime role is non-superuser and NOBYPASSRLS. PR #142 adds diagnostics and passed disposable-PostgreSQL integration CI, but live staging identity is still unverified.
7. The last detailed public-schema inventory and schema coverage reconciliation total 114 relations; a separate 116-table summary count remains unexplained. Do not mark table coverage complete until a refreshed protected read-only catalog audit resolves the discrepancy.

## Required proof before implementation or RLS activation

- Finish the exact route/service-to-table operation map for every tenant-owned relation, including worker, audit, bootstrap, webhook and CLI paths.
- Reconcile the 114-versus-116 relation-count discrepancy from a protected read-only catalog snapshot. Include schemas, relkinds, partition parents/children, migration/system objects and extension-owned relations.
- Specify transaction-local setting names and semantics, including user ID, active organization, actor type, worker identity and bootstrap identity. Match them exactly to policy expressions.
- Prove request interceptor ordering after authentication/permission guards and before handlers; test errors, early returns, streaming responses, cancellation and response completion.
- Prove nested transaction/savepoint behavior for existing service transactions and ensure no fallback to an unscoped global Drizzle connection occurs inside a tenant request.
- Define separate worker/system context entry points and explicit tenant context for work items that belong to a store/org.
- Define audit middleware context and decide whether audit writes commit independently or with the request.
- Verify runtime API role is not superuser and has NOBYPASSRLS; verify migration role separately and ensure default privileges are correct.
- Add negative cross-tenant SELECT/INSERT/UPDATE/DELETE tests, same-user multi-org switch tests, worker isolation tests, audit attribution tests, rollback/concurrency tests and connection-pool reuse tests.
- Obtain independent security review and explicit protected staging authorization before applying policies or changing role configuration.

## Current decision

Do not add a global request transaction interceptor, enable RLS, alter role grants/default ACLs, apply migrations 0070/0071, change DATABASE_URL, or activate workers as part of this preliminary inventory. The next implementation task is to complete the operation/ownership and runtime access-path proof, then implement the scoped context behind a feature-controlled, fail-closed boundary with dedicated tests.

## Standalone migration, seed, bootstrap and operator access paths — 22 November 2026

This map complements the API service/worker inventory. These tools connect directly to PostgreSQL or invoke psql and therefore do not automatically inherit HTTP request identity, permission guards or a tenant-scoped Drizzle transaction.

| Path                                                                                                                                                     | Observed database behavior                                                                                                                                                                                                                | Context and safety classification                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| apps/api/infra/drizzle/migrate-pg.ts                                                                                                                     | Dedicated pg Pool; reads _migration_log, creates it when applying, acquires a session advisory lock, executes each SQL migration and inserts its ledger row in the same transaction; emits non-secret migration-role identity diagnostics | Migration principal, not API runtime principal. DATABASE_URL must be separately verified.                                                                                          |
| apps/api/infra/drizzle/migrate.ts                                                                                                                        | Local Docker psql runner against fixed scs-postgres/scs_platform; reads migration ledger and applies each file plus ledger row atomically with ON_ERROR_STOP; skips pg_partman-dependent files with a warning                             | Local development migration path. Not equivalent to the remote DATABASE_URL runner.                                                                                                |
| apps/api/infra/drizzle/migration-identity.ts and migration-lock.ts                                                                                       | Read-only role identity query and session advisory lock/unlock helpers on a supplied PoolClient                                                                                                                                           | Inherit the caller's migration connection; not independent runtime roles.                                                                                                          |
| apps/api/src/common/database/database.service.ts                                                                                                         | API Pool identity diagnostic; in development/test creates a separate bootstrap Pool, applies pending migrations and runs canonical RBAC seed; then creates the Drizzle runtime handle                                                     | Development/test startup has migration/seed writes. Deployed environments rely on the external startup/deployment command.                                                         |
| apps/api/infra/drizzle/seed-pg.ts and apps/api/src/scripts/seed.ts                                                                                       | Raw SQL reads/inserts into permissions, roles and role_permissions; seed-pg wraps RBAC writes in a transaction and is idempotent; src/scripts/seed.ts is a legacy psql-based path                                                         | Platform-wide RBAC seed actor. Not a tenant request.                                                                                                                               |
| apps/api/infra/drizzle/seed-catalog.ts                                                                                                                   | Raw PoolClient reads/inserts/updates across organizations, users, stores, warehouses, taxonomy, product types, product attributes, products, variants and optional demo merchant offers                                                   | Platform catalog seed; demo profile adds merchant-offer data. Treat as privileged seed path.                                                                                       |
| apps/api/src/scripts/demo-data.ts                                                                                                                        | psql-based inserts across demo users, organizations, memberships, stores, warehouses, catalog, offers/pricing, inventory, orders, notifications, audit and outbox                                                                         | Has development/test and explicit opt-in checks plus production-like URL heuristics. Mutating test fixture path; never run against shared staging.                                 |
| apps/api/src/scripts/bootstrap-issue-token.ts                                                                                                            | Direct PostgreSQL transaction; checks active SUPER_ADMIN and unexpired authorizations, optionally revokes old tokens, inserts bootstrap_authorizations and audit_logs under an advisory transaction lock                                  | Explicit SCS_ENVIRONMENT/SCS_OPERATOR; production requires --confirm-production. Plaintext token is returned once, digest is stored.                                               |
| apps/api/src/modules/system/bootstrap.service.ts                                                                                                         | Transaction-scoped advisory lock; consumes authorization and creates the initial user, platform organization and SUPER_ADMIN membership                                                                                                   | One-time system/bootstrap actor; distinct from normal authenticated request identity.                                                                                              |
| apps/api/bootstrap-staging-platform.ts, bootstrap-staging-merchant.ts, bootstrap-staging-store.ts, bootstrap-staging-staff.ts, bootstrap-staging-rbac.ts | Direct Client/Pool SQL creates platform/merchant users, organizations, memberships, stores, warehouses and/or RBAC rows; SSL CA is required by the staging bootstrap entry points                                                         | Privileged manual staging writes. Do not execute without a separately approved staging procedure; these scripts do not carry ordinary API tenant context.                          |
| apps/api/scripts/audit-db-access.ts                                                                                                                      | Begins a READ ONLY transaction and inspects PostgreSQL roles, grants, default ACLs, schemas, functions, sequences and memberships                                                                                                         | Read-only operator audit; no mutation observed.                                                                                                                                    |
| apps/api/infra/drizzle/reset-pg.ts                                                                                                                       | Deletes the analytics pg_partman config row and drops every public table in a transaction                                                                                                                                                 | Destructive reset. It now requires an explicit environment, exact database name, typed confirmation, local host for development/test, and separate staging approval. Not executed. |
| apps/api/infra/drizzle/reset.ts                                                                                                                          | Drops public tables and custom enum types in the fixed local Docker database                                                                                                                                                              | Destructive local-only reset path.                                                                                                                                                 |
| apps/api/scripts/create-admin-user.ts                                                                                                                    | Creates a local platform organization/user/SUPER_ADMIN membership                                                                                                                                                                         | Hardened in this implementation group: local DB only, explicit development/test and confirmation, caller-supplied credentials, one transaction, no password logging.               |
| apps/api/infra/catalog-import-cli.ts                                                                                                                     | Parses/validates workbook input and generates templates; no direct DB query found                                                                                                                                                         | File-processing CLI; database access is delegated only if a future caller injects a DB-backed service.                                                                             |

### Legacy M5/M6 UAT and migration harnesses

The following manually invoked utilities contain direct PostgreSQL/Redis/API access and are not part of the production runtime: m5-roundtrip-check.ts, m5-uat-run.ts, m5-uat-verification.ts, m6-clean.ts, m6-diag.ts, m6-env-check.ts, m6-fix-cart-constraint.ts, m6-get-otp.ts, m6-restore-admin.ts, m6-uat-run.ts, m6.1-inventory-concurrency.ts, m6.1-security-regression.ts, b1-migration-test.js and p311-migration-verify.js. Several use fixed local development credentials or direct SQL writes; m5 scripts also allow DATABASE_URL override. They were not executed. Before any future use, standardize local-only environment/confirmation guards and remove fixed credentials from scripts that authenticate to the API. The M6 environment check was hardened in this implementation group: it now requires explicit development/test opt-in and caller-supplied credentials, validates local API/Redis hosts, and never prints the OTP or raw OTP verification response.

### Outstanding CLI/access-path work

- Decide whether to retire obsolete legacy M5/M6 and migration harness scripts after the final consolidated test campaign. They now have explicit local development/test guards; do not run them against staging/shared databases.
- The five staging bootstrap scripts and db:bootstrap:staging package sequence now require explicit staging environment, exact database name and a second approval token before writes. This is a guard, not authorization to execute.
- Map any external Render startup command and deployment secret source to the exact migration and seed identity; source-level DATABASE_URL names alone do not prove deployed role identity.
- Reconcile every script's schema writes with migration ownership and RLS design. A migration/seed/service-role bypass must remain a separate, least-privilege capability.

No CLI, migration, seed, reset, bootstrap, provider, staging or shared database command was executed while preparing this inventory.

Physical relation detail is now recorded in [G-002-PHYSICAL-DATABASE-OBJECT-INVENTORY-2026-11-22.md](./G-002-PHYSICAL-DATABASE-OBJECT-INVENTORY-2026-11-22.md). The read-only audit utility was extended to distinguish public r/p tables from views/sequences, list parent/child partition bounds, RLS/policy/owner/extension metadata, and summarize _migration_log/backfill_errors without reading sensitive row contents. The utility was not executed.

## Source review continuation — pricing and admin order display — 22 November 2026

PricingController already validated that the requested variant belongs to the caller's store, but the no-storeId branch of PricingService.listTiersByVariant previously queried by variantId alone. A corrupt cross-store price-list association could therefore expose another store's tier. The service now requires storeId for all paths and joins priceLists with an explicit priceLists.storeId predicate. The controller passes the store resolved from the variant; internal getProductPricing calls pass their storeId too.

AdminService.getOrderDetail previously returned raw orderItems without product/variant labels. It now joins products/productVariants and returns productTitle, variantTitle and variantSku for the Admin UI. This is a read-only projection change; the existing admin:orders:read guard remains unchanged.


## 24 November 2026 — transaction-bound actor context implemented as opt-in

DatabaseService now has an explicit `withActorContext` primitive. It opens a Drizzle transaction, establishes parameterized transaction-local GUC values with `set_config(..., true)`, and binds the transaction handle through AsyncLocalStorage so existing `DatabaseService.db` access resolves to the scoped transaction during the awaited operation. The context contract supports anonymous, user, worker, system, bootstrap and audit principals. Same-actor nested scopes reuse the current transaction; actor switching is rejected; the scope is marked inactive after completion to block inherited detached work from querying a closed transaction.

A controller/method-scoped interceptor derives user context only from verified `request.user` after guards. It is currently applied to bounded JWT-protected routes in Notifications, Pricing, Store Membership, Promotions, Reviews/Disputes, Inventory, Analytics, Catalog Offers/Requests/Taxonomy, selected Catalog/Admin reads, Cart, Returns, Organizations/Roles, and selected Profile/device handlers. It is deliberately not global.

Promotions merchant HTTP operations now carry the verified caller to the service boundary, assert active organization and store membership, normalize foreign detail denial to not-found, and constrain updates by both promotion ID and resolved store ID. Internal checkout redemption paths remain outside HTTP context until Orders/checkout integration.

Still outstanding: full source-level cached-handle/detached-task audit, remaining bounded controller coverage, explicit worker/scheduler/bootstrap/audit/carrier-webhook principals, complete table-operation predicate evidence, actual deployed API/migration identity, protected live relation inventory, and independent architecture/security review. Carrier webhook context must be established only after credential authentication. AuditLogMiddleware writes after response completion and therefore must use a separately designed explicit system/audit transaction, not the HTTP request transaction.

No RLS policy is enabled; no shared DB grants/default ACLs or migrations were changed. Tests, formatter, lint, typecheck, E6 and CI are deferred until implementation and integration are complete, per the user's explicit instruction.


## 24 November 2026 — explicit system and worker entry points

The transaction-bound actor context is now used beyond HTTP:

- AutoCompleteWorker wraps each claim and each order completion/release in a worker principal and separate bounded transaction.
- OutboxDispatcher wraps the claim statement and each success/retry acknowledgement in a worker principal; dispatch is outside the transaction.
- CarrierTrackingPoller wraps only DB claim/persist/bridge phases in a worker principal. Provider network calls and circuit-breaker operations remain outside transaction scopes.
- AuditLogMiddleware creates a new audit principal/transaction from the response-finish callback; it does not depend on the request's ALS context.
- BootstrapService uses anonymous context for public status, bootstrap context for OTP authorization insertion and initial Super Admin provisioning. The operator CLI sets local bootstrap GUCs inside its transaction.

ReturnExpirationWorker remains unwrapped after an attempted wrapper was reverted because a full-batch transaction would interfere with lease/fencing behavior. ShippingCarrierWorker remains unwrapped because it interleaves DB access and external carrier/storage operations. Both require explicit per-operation/per-phase design before RLS.

No RLS policy is enabled and no database, grants, migrations or staging actions were performed. Tests are deferred until implementation/integration are complete.


## 24 November 2026 — carrier webhook, bootstrap and audit entry points

- Carrier webhook pre-auth credential lookup/decryption and HMAC verification intentionally remain outside tenant actor context. After HMAC verification, each bounded DB operation uses a `worker` actor with `workerId=carrier-webhook:<credentialId>` and `activeOrgId=credential.orgId`. This context is derived only from the authoritative credential row; payload tenant IDs are not trusted. Shipment routing remains constrained through the credential organization, Merchant store ownership and Orders shipment lookup contracts.
- AutoCompleteWorker and OutboxDispatcher use worker contexts for DB claim/ack phases. CarrierTrackingPoller uses worker context for DB claim/persist/bridge phases while keeping carrier network calls outside transactions.
- AuditLogMiddleware opens its own `audit` actor transaction in the response-finish callback. BootstrapService uses `anonymous` for public status and `bootstrap` for OTP authorization insertion and initial Super Admin provisioning; the bootstrap operator CLI sets transaction-local bootstrap GUCs after BEGIN.
- ReturnExpirationWorker remains outside after a wrapper attempt was reverted to preserve lease/fencing semantics. ShippingCarrierWorker remains outside due to mixed provider/storage calls; it requires a phase-by-phase split. Realtime socket operations remain outside and need a distinct handshake/operation principal contract.

These source changes do not enable RLS and do not prove runtime identities or table policies. Tests remain deferred until implementation/integration are complete.



## 24 November 2026 — carrier recovery and lease operation contexts

The carrier recovery service is no longer wholly unwrapped: its DB-only claim and persistence phases now use a worker actor; provider HTTP remains outside. CarrierAdminController's admin-triggered recovery and queue reads use verified-user actor contexts, with reconciliation after the user transaction and audit in a separate scope. WorkerLeaseService uses worker context for lease lifecycle DB operations and system context for runbook force-expire.

Still outstanding in this operational area: P13MonitorService's global cross-tenant read-only scan, OpsAlertService durable alert/delivery state machine, OpsControlService pause/control operations, PilotControlService feature-flag/allowlist operations, and the runtime principal contract for manual recovery CLI. Catalog import also remains a mixed storage/database path requiring phase separation.

## 24 November 2026 — Catalog Import read-only/report actor-context slice

CatalogImportController list, detail and errors routes now use TenantDatabaseContextInterceptor after the class-level JWT, permission and role guards. Preview is intentionally excluded because it reads only the in-memory plan cache. Upload, execute and retry are intentionally excluded because they combine object-storage/workbook processing with multiple DB phases. The report route passes verified JWT sub/role/activeOrg to CatalogImportService; persisted errors are fetched in a short user actor context, then the XLSX workbook is generated after the DB scope closes. Regression metadata coverage was added for route interceptor selection; no test was run.

Remaining import paths: upload/storage+insert+auto-validate, validation storage download/parser/resolver/plan/persist steps, executor per-entity transactions and status/error writes, retry, exportCatalog and TemplateGenerator DB reads. Next P13 operational services also remain: P13Monitor, OpsAlert, OpsControl and PilotControl principal separation.


## Catalog Import actor-context boundary — 24 November 2026

Implemented: list/detail/errors read endpoints use the verified-user context interceptor; report error rows are read in a short user actor transaction and workbook generation follows outside the transaction. Deliberately not wrapped: preview is in-memory only; upload, validate, execute and retry mix DB with object storage, parsing, cache state and/or nested entity transactions; export uses TemplateGeneratorService DB reads plus workbook generation. These require service-level DB phase separation rather than a request-wide interceptor.

## 24 November 2026 — source schema declaration and runtime barrel reconciliation

- The current source contains 100 `pgTable` declarations across 25 module `*.schema.ts` files. `drizzle.config.ts` discovers the module schema glob, while `DatabaseService` constructs its runtime Drizzle instance from `apps/api/src/drizzle/schema.ts`.
- Before this correction, the runtime barrel re-exported only 98 declarations because `catalog-import.schema.ts` (the platform-level `catalog_imports` and `catalog_import_errors` tables) was omitted. Source commit `474ef450d98a62fe3b2f6b480a5dc4ea300d824d` adds the missing barrel export. The runtime schema barrel now includes all 100 source declarations.
- This fixes source/runtime schema discovery alignment only. It does not apply a migration or prove the physical existence of every declared table in any deployed database.
- Keep the 19-November protected catalog snapshot distinct: its 114 public ordinary/partitioned relations were reconciled at that time as 99 Drizzle declarations plus 15 non-Drizzle relations (the migration ledger, backfill audit table and 13 analytics partitions). The current 100-declaration source count is not a replacement live catalog count. Migration 0075's `payment_proof_upload_intents` source declaration must not be assumed present in shared/staging until an authorized live catalog audit confirms it.
- The historical 116 count remains unexplained. A fresh protected read-only catalog audit must compare current relkinds, partitions, extension/system objects and API/migration role visibility. No such query was run here.


## 24 November 2026 — Catalog Import/P13 operation map and schema barrel follow-up

- CatalogImportController passes verified `sub`, `role`, and `activeOrg` into upload, execute, retry, template and export operations. CatalogImportService scopes each DB-only phase to the caller; object storage and XLSX parsing/generation remain outside actor transactions. ExcelExecutor scopes each entity-type transaction. The platform import's `uploaded_by` is actor attribution, not a tenant owner; `catalog_import_errors` inherits its platform import parent through `import_id`.
- P13Monitor cross-tenant diagnostic reads use the dedicated worker principal `p13-monitor`; WorkerLeaseService retains its own worker identity. OpsAlert durable alert-state writes use the alert-service system principal when not already inside a verified actor scope; operator list/snapshot reads use the authenticated admin. OpsControl pause checks use a worker principal, admin control state/history/mutations use the verified admin, and platform audit writes use a separate audit principal. Pilot policy reads use the active verified actor or the explicit system policy principal; admin snapshots and writes use the verified admin and audit writes use the audit principal.
- P13 platform-control tables (`ops_alerts`, `ops_controls`, `ops_control_audit`, `p13_pilot_allowlist`, and `worker_leases`) are platform operational/control data. The pilot allowlist's `org_id`/`store_id` identify the configured target scope; they do not turn the control table into a merchant-owned tenant table.
- Source commit `474ef450d98a62fe3b2f6b480a5dc4ea300d824d` adds `catalog-import.schema.ts` to the runtime Drizzle schema barrel. The barrel now exports all 100 current `pgTable` declarations. This does not prove deployed table presence or apply migration 0075.
- Remaining source work is callsite/nesting audit across the full 53-file candidate set, carrier/bootstrap/CLI/audit middleware and raw SQL DB objects; exact operation predicates and FK evidence; and protected live API/migration identity plus relation-kind inventory. No RLS/grant/migration or shared/staging action is authorized by this source map.


## 24 November 2026 — carrier, audit and operator access-path continuation

### Carrier credential and configuration service paths

- `CarrierCredentialsService.listForOrg/getById/create/deactivate` use a verified user actor derived from caller JWT claims. Membership validation and DB mutation/read occur inside the scoped transaction. Credential encryption is performed before the insert transaction; decryption occurs only after a short tenant-bound read transaction closes.
- Internal credential lookup/decryption requires the expected org ID. DB predicates include credential ID + org ID; active-state checks remain. Internal scopes reuse an existing compatible actor or establish a dedicated worker principal.
- `CarrierConfigurationsService.listForOrg/getById/create/update` use verified user actors. `resolveForStore` uses an organization-bound worker actor and repeats store ID + org ID, config org/store/active and credential org/active predicates. Update repeats config ID + org ID.
- Aramex provider's direct store/credential/platform reads use explicit worker contexts. Credential reads retain expected org, provider key and active predicates. Platform credential resolution is restricted to the Identity-resolved PLATFORM organization.
- Carrier webhook initial credential lookup uses a dedicated `carrier-webhook:credential-resolution` worker principal. Secret decryption uses the credential's org-bound context; subsequent webhook event persistence/routing already uses `withCredentialContext`. The ambiguous legacy provider-only route still rejects multiple active credentials with HTTP 401, with the response returned after the DB transaction closes.

### Audit, migration, seed and bootstrap boundaries

- `AuditLogMiddleware` already wraps its deferred response-finish write in a separate `audit` actor context. `AuditService.record` remains a context-dependent append operation and must not self-switch actors inside an active scope.
- `migrate-pg.ts` uses a dedicated DATABASE_URL Pool, emits migration identity diagnostics, holds a session advisory lock and commits each migration with its ledger row. It is a migration principal, not an API actor.
- `seed-pg.ts` uses its own Pool/PoolClient for platform RBAC seed writes. The standalone seed path remains an operator/deployment principal.
- `bootstrap-issue-token.ts` sets transaction-local bootstrap actor settings before token authorization/audit operations. `BootstrapService` uses an anonymous context for bounded availability reads and a bootstrap context for owner-verified issuance/initialization transactions.
- These paths were source-inspected only. No migration, seed, bootstrap CLI, database query or shared/staging operation was executed.

### Remaining source and evidence gaps

The raw SQL/function/trigger/partition inventory across the full migration set remains incomplete. Review pg_partman partition maintenance/retention identity, function search_path/SECURITY DEFINER posture, migration-only tables and every direct Pool/PoolClient CLI/bootstrap path. The 100 source pgTable declarations, historical 114 public r/p snapshot and unresolved 116 count are distinct. Protected read-only live catalog and actual API/migration role identity remain gated to the authorized staging process.


## 24 November 2026 — carrier actor-context typecheck correction

Commit `4d3488d7017439c1e756df4a595873dc9d590455` requires a non-empty caller role before creating a user actor context and performs the organization membership pre-check before credential encryption, with a second check inside the insert transaction. This addresses the nullable `caller.role` type error in automatic Actions #1501 on the prior source SHA. The correction is not re-run; exact-head CI is empty because the commit uses `[skip ci]`. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## 24 November 2026 — migration object and operator access audit

See [G-002 migration object and operator access audit](./G-002-MIGRATION-OBJECT-AND-OPERATOR-ACCESS-AUDIT-2026-11-24.md) for the detailed 75-file SQL object scan and runner/CLI principal matrix.

Key findings: migration 0007 defines only the application normalize_arabic function; 0070 pins its search_path to pg_catalog. No migration-defined triggers, RLS policies, RLS enablement, views, sequences or SECURITY DEFINER routines were found. Migrations 0013/0018 create/configure pg_partman monthly analytics partitioning and 12-month retention, but the pg_cron schedule example is commented out and no repository scheduler config was found.

The local Docker runner and DatabaseService dev startup now share pg_partman exclusions for 0013/0018; the complete DATABASE_URL runner still requires pg_partman. Local migration locking/ledger checks were tightened. Seed/bootstrap/audit CLI operations now use transaction-local operator principals. Legacy disposable verification scripts gained explicit local test-target guards and atomic migration application. The read-only audit tool now inventories non-system functions/triggers and partman/cron maintenance metadata.

No test or database command was executed. External maintenance scheduling and actual runtime role identity remain unverified.
