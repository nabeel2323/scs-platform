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


## 24 November 2026 — stale migration-ledger fail-closed correction

Source follow-up through `6f3327a2039c65fb0f9578202d4bd76c75e7b426` adds a second layer of migration consistency protection:

- Local `migrate.ts` and DatabaseService development bootstrap now refuse to proceed when pg_partman-dependent migrations 0013/0018 are already present in the ledger despite being excluded from the local image. They do not delete ledger rows or attempt automatic repair; the local DB may contain partial state and must be explicitly rebuilt/reconciled.
- The complete `migrate-pg.ts` runner now rejects impossible/stale analytics ledger states: 0018 without 0013, 0013 without the pg_partman extension/config row, or 0018 whose retention values do not match the migration.
- The disposable M7.3 runner refuses to continue if skipped pg_partman migrations already appear in its ledger.
- Local `migrate.ts` uses a unique per-process/per-file temp SQL path and cleans it up, avoiding concurrent runners overwriting the same temporary script.
- Disposable shell verification target guard now also checks `inet_server_addr()` is a Unix socket or loopback address, in addition to explicit test environment, exact DB/user, local PGHOST/PGHOSTADDR and no PGSERVICE redirection.

No database was inspected or repaired, and no tests/CI were run. These are source-level fail-closed checks only.


## 24 November 2026 — final migration-ledger safety source update

Source implementation checkpoint `f21dbe4aca75ba04e9173b1fc28a9591829af554`. The local migration paths reject stale 0013/0018 ledger rows rather than silently trusting them; the complete migration path validates pg_partman extension/configuration and retention state; temporary migration scripts are unique and cleaned up; the legacy M7.3 disposable runner stops after the first migration failure. Disposable target guard verifies actual PostgreSQL server address is loopback/unix-socket.

No tests or DB operations were run. Exact-head Actions is empty and Vercel Web/Admin are rate-limited. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## Latest source follow-up — 24 November 2026

The fail-closed stale-ledger correction and local temp-file isolation were completed through source checkpoint `f21dbe4aca75ba04e9173b1fc28a9591829af554`. The M7.3 runner now stops at the first failed migration. The disposable DB guard verifies the PostgreSQL server's actual address is a Unix socket or loopback. No tests or database commands were run. Current branch/PR head after documentation-only synchronization is `bb193c7b52ed83bc6c0a6f72ce1a24ba4dcdd926`; PR #138 remains OPEN / DRAFT / UNMERGED. Exact-head Actions is empty; Vercel Web/Admin rate-limit failures are external preview statuses.


## 26 November 2026 — bootstrap CLI actor-context unification

The break-glass `apps/api/src/scripts/bootstrap-issue-token.ts` path previously set five transaction-local application context fields inline after `BEGIN`, but omitted an explicit reset of `app.auth_operation`. It now calls the shared `setOperatorActorContext(client, 'bootstrap', operatorId)` helper instead. This keeps the CLI bootstrap principal consistent with staging bootstrap scripts and explicitly clears actor role, active organization, worker ID and authentication-operation context in the same transaction-local statement.

The existing helper unit test now asserts all six context settings are established/reset with transaction-local `set_config(..., true)`. This is source/test authoring only; no CLI was executed and no token was issued. The test, typecheck and CI remain unexecuted. This change does not authorize or perform bootstrap activity against staging or production.


## 26 November 2026 — catalog import actor-context call-graph review

Live verification before this review: PR #138 is OPEN / DRAFT / UNMERGED, head `af29841dc9f6e9668bf3630a2bd609c61f96bd8b`, base `develop`, GitHub mergeable=false; `develop` is `fde20420bbb759d2e562f9ff747c9e824ac58e25`; compare is diverged (2,805 ahead / 3 behind; merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`). Preservation ref is identical to the source head (0/0). Exact-head Actions has no workflow runs; combined statuses are only Vercel Web/Admin build-rate-limit failures.

### Import route/service findings (source review only)

Reviewed `catalog.controller.ts`, `catalog.service.ts` and `TenantDatabaseContextInterceptor` around all import routes and their service call paths.

- `createImportJob`, list/get job, get chunks, mapping update, cancel and retry routes use the opt-in tenant DB interceptor. Their DB-only call paths run under the authenticated request actor.
- Row staging, file upload, processing, preview and error-report routes intentionally do not use a request-wide interceptor. They first resolve the persisted job/store and verify organization/store membership inside a short explicit user actor scope. Service methods then scope their own DB reads, writes, claims, chunk operations and finalization with `withUserActorContext`.
- Redis row staging/read, object-storage upload/read, XLSX parsing and CSV serialization occur outside DB actor transactions. Chunk product/variant/pricing writes run inside actor-scoped DB transactions. The worker-style stale-import recovery entry point uses a stable worker principal and is dormant/not scheduled by this remediation.
- `updateImportMapping`, `cancelImport`, `retryFailedJob`, `getImportJob` and `getChunks` remain context-dependent service methods rather than accepting an actor argument themselves; current HTTP call sites are covered by the interceptor or an explicit actor wrapper. This is a maintainability boundary to preserve and test if new callers are added; do not infer the methods are safe for unscoped invocation.
- No missing actor-context route was identified in the reviewed import route set. This is not a full catalog module sign-off: continue auditing the remaining catalog service call graph, other controllers and worker entry points before closing G-002.

No code was changed in this review. No tests, typecheck, formatter, build or CI were run. No import job was created/processed, no object storage or Redis was touched, and no staging/shared DB writes, migrations, grants, RLS changes, worker activation, deployment or merge occurred.

**Next:** continue catalog service and worker actor-context coverage; then complete the raw SQL/function/trigger and migration/operator boundaries and prepare a bounded G-002 extraction manifest from refreshed `develop`. Keep CI batched until that bounded workstream is complete.


## 26 November 2026 — worker actor-context and order-completion reconciliation

Reviewed the current PR #138 order auto-completion worker, its unit tests, the #138 OrdersService completion path, focused PR #154 and the #153 outbox implementation.

- The #138 auto-completion worker establishes `withActorContext({ actorKind: 'worker', workerId })` around both claim and the entire `processCompletion` call. The conditional lease release runs in `processCompletion`'s `finally` before that outer actor scope closes, so release inherits the worker context. No production worker code change was required.
- The #138 worker unit-test double did not implement DatabaseService.withActorContext, so the tests did not model the actor-context implementation. Updated the test harness to provide a passthrough scope, assert DB execution and completion occur inside the worker scope, assert the stable worker principal, and cover lease release after failed completion. Commits: `983acb6b5a87c52a21a905745cf404d6c785c47f`, `82998dd808f5800ccfb7c354a373ef63bdf06bf4`, `7b98f58532c66c005c6a3089f9da72e1bc32d495`.
- The #138 `OrdersService.completeOrder` still performs multiple related writes without the single encompassing transaction present in #154. #154's atomic completion and claim-owner/lease fencing are the preferred service implementation, but its worker must be composed with #138's DatabaseService worker actor context before extraction. Keep one canonical migration 0071; its duplicate DDL must not be applied twice.
- #138's generic outbox dispatcher still contains the log-only placeholder that marks events DISPATCHED. Do not extract or enable it. PR #153 is the safer canonical behavior: no generic polling/acknowledgement without a real adapter; carrier-owned events remain with ShippingCarrierWorker. #153 exact-head Actions has a passing CI run; #154 exact-head Actions lookup is empty. Recheck before any merge decision.
- ShippingCarrierWorker's inspected database phases use a worker-context helper; provider/storage operations are outside those short DB scopes. This was a source-level spot check, not full worker sign-off.

No tests, typecheck, formatter, build or CI were run for the unit-test update. All source/test changes remain NOT TESTED / NOT CI-VERIFIED. No worker was activated, no outbox polling enabled, no provider call, database write, migration, deployment or merge occurred.

**Next:** finish the remaining worker and database call-graph audit; prepare the bounded G-002 extraction as the composition of #154 atomic completion with #138 actor context, and #153's safe outbox behavior. Run the consolidated CI campaign only after that bounded slice is assembled.


## 26 November 2026 — migration 0070 collision disposition and runner review

- Compared PR #138 migration `0070_public_access_and_function_search_path_hardening.sql` with PR #145's `0070_normalize_arabic_search_path.sql`. They both alter the same `public.normalize_arabic(text)` function and therefore cannot coexist as two migration files with the same sequence/ledger position.
- Consolidated PR #145's postcondition assertion (`pg_proc.proconfig` contains `search_path=pg_catalog`, with the expected `input text` identity arguments) into PR #138's broader 0070 migration. The single canonical 0070 now retains the existing anon/authenticated table/sequence grant and default-ACL revocations, the function-local search_path setting, and an explicit fail-fast verification block. PR #145's standalone migration is to be excluded from the bounded integration slice; retain its verification intent in the canonical file.
- Reviewed `apps/api/infra/drizzle/migrate-pg.ts`: the runner serializes the ledger/apply sequence with a session advisory lock and wraps each individual migration plus its ledger insert in one BEGIN/COMMIT transaction, rolling back the file on failure. It does not make the whole 0070–0075 sequence one transaction. Dry-run only checks that files are nonempty; it does not parse or execute their SQL.
- Migration 0071 is the same two-column/index DDL as PR #154 apart from comments; keep one canonical 0071. Migrations 0072–0075 remain source-only and require separate isolated PostgreSQL validation and reviewed data/rollback plans before any shared/staging application. In particular, 0072 performs historical webhook relinking/detachment with manual-review markers; 0074 rewrites reconciliation supersession pointers and uniqueness; 0075 creates durable payment-proof upload-intent state.
- The 0070 edit is source-only. No migration runner, dry-run, SQL execution, staging/shared DB write, grant/default-ACL change, RLS change, deployment or worker activation occurred. No tests/typecheck/formatter/build/CI were run.

**Next:** assemble the G-002 bounded migration manifest with explicit 0070 canonical disposition, single 0071 ownership, and validation/rollback evidence for 0072–0075. Do not apply any migration until the separately required database-access and deployment approvals are satisfied.


## 26 November 2026 — return/shipping worker actor-context and lease-fencing review

### Return expiration

- `ReturnExpirationWorker.runBatch` establishes the worker actor for the claim SQL and each per-item processing operation. Its nested `WorkerLeaseService` calls use the same `holderId`, so DatabaseService's identical-actor nested-scope rule reuses the active transaction. `ReturnsService.escalateReturn` locks the exact live lease and repeats the holder+epoch+expiry predicate in the return status mutation; the return event and outbox insert are in that same transaction. The caller's worker scope surrounds this service call. No production return-worker change was identified in this pass.
- Fixed unit test doubles for `ReturnExpirationWorker` and `ReturnsService.escalateReturn` to provide the actor-context wrapper and exercise the intended worker/user caller scopes. Test files: `return-expiration-worker-fencing.spec.ts`, `returns-service-worker-escalation-fence.spec.ts`.

### Shipping carrier worker

- Claim and stale-recovery operations run under a stable worker principal. Before provider side effects, handlers resolve the shipment's store→organization relationship and verify the shipment order belongs to that store. Tenant-specific shipment/label writes use the resolved active organization. Carrier API, label URL fetch and object-storage operations are outside DB actor transactions.
- Found a real stale-worker fencing gap: successful event acknowledgement and failure/retry state updates were conditional only on outbox event ID. A worker whose processing lease had expired could overwrite the state after another worker reclaimed the event. Both updates now require the event ID, `status='PROCESSING'`, and `locked_by=this.workerId`. Source commit: `d18a495433460902190bec23d0d39923cc7b346a`.
- Added regression tests for owner-fenced success acknowledgement and failure/retry updates; also repaired carrier-worker test doubles so claim/recovery execute inside the expected worker actor scope. Return worker and ReturnsService tests now model the production caller actor context. Test commits: `7009e69dc04a4d37ea1f7dd8b29c89466c125eff`, `e90276f75e562aeb1ecbd71de0bdc0e661bade6a`, `7fc543a59f6902db811ea903f34bc7a80caf0e26`, `2abac268e2a06b5c6997e00f9f0f23d526d4d836`.
- The generic outbox dispatcher remains excluded: #153's no-poller/no-false-ack behavior is canonical. Carrier-specific worker ownership remains with ShippingCarrierWorker.

### Verification boundary

All changes are source/test authoring only. No test, lint, typecheck, formatter, build or CI was run, per the implementation-first batching decision. No carrier provider, storage, Redis, DB, migration, worker activation, staging workflow, deployment or merge was executed. The live staging ReturnExpirationWorker remains disabled unless separately configured; this source review did not change worker flags.


## 26 November 2026 — shipping worker stale-owner fence and G-002 extraction manifest

- Re-verified before this documentation update: PR #138 open/draft/unmerged, head `a4b4921fd11171d48c13bcf69cef4082e1d48301`, base develop `fde20420bbb759d2e562f9ff747c9e824ac58e25`, diverged 2,840 ahead / 3 behind from merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`, mergeable=false. Preservation ref was 11 commits behind and is to be fast-forwarded to the final doc head with expected-SHA protection. Exact-head Actions has no runs; only Vercel Web/Admin build-rate-limit failures are present.
- Fixed a real ShippingCarrierWorker stale-owner race: success acknowledgement and failure/retry finalization now require matching event ID, PROCESSING status and current locked_by worker. Commit `d18a495433460902190bec23d0d39923cc7b346a`. Added regression tests and repaired worker actor-context test doubles in return/shipping/ReturnsService specs (commits `7009e69d`, `e90276f7`, `7fc543a5`, `2abac268`). These are not run yet.
- Reviewed ReturnExpirationWorker and ReturnsService nesting: the same worker principal is used through nested scopes; the escalation transaction locks the live lease and repeats the holder/epoch/expiry fence in the return mutation. No additional production change identified in this pass.
- Added `docs/remediation/G-002-BOUNDED-INTEGRATION-MANIFEST-2026-11-26.md`, with explicit actor-context, application adoption, worker/webhook, operator/migration slices; exclusions; migration 0070–0075 dispositions; and consolidated verification gates. Current #138 changed paths: 1,939 total, 1,280 scratch, 659 non-scratch. Do not import all non-scratch paths; select only reviewed G-002 dependencies. The manifest is a plan, not a merge/deploy/migration authorization.
- No tests, lint, typecheck, formatter, build or CI run. No carrier provider/storage/Redis/DB/migration, worker activation, staging workflow, deployment, grant/default-ACL/RLS change, bootstrap/token issuance or merge occurred.

**Next:** continue the FK-to-ownership crosswalk and raw SQL/function/trigger/partition audit against the 75 numbered migrations and source callsites. Then refresh develop, build clean bounded integration branches using the manifest, and run one consolidated CI campaign once integration is complete. Preserve #138; never merge its 1,939-path tree wholesale.


## 26 November 2026 — initial FK-to-ownership crosswalk

- Added `docs/remediation/G-002-FK-OWNERSHIP-CROSSWALK-2026-11-26.md` after reviewing shipping, payment, return, settlement and reconciliation schemas/services plus `financialOrgScope` and carrier webhook routing.
- Confirmed important independent-FK relationships require runtime consistency checks: shipment.order_id + store_id; carrier configuration org_id + credential_id + optional store_id; webhook credential_id + shipment_id; return sub_order_id + payment_record_id; settlement sub_order/payment/store links. Reviewed service guards exist for carrier config create/resolve, carrier worker shipment/order/store validation, webhook credential routing, commission reversal, settlement adjustment posting and payment-proof cleanup. Continue callsite review; no claim that all paths are covered.
- Financial reconciliation intentionally supports null/global scope for platform roles; non-platform HTTP callers are denied without activeOrg by `financialOrgScope` and the ReturnsController has class-level tenant actor interception. Preserve that distinction in the RLS/policy design.
- Full 75-migration/schema FK inventory and remaining catalog/inventory/document/settlement ownership chains remain open. This crosswalk is partial source evidence only.
- No tests or DB/catalog/migration/provider/storage/worker/deployment actions occurred.


## 26 November 2026 — CatalogImportService actor preflight hardening

Source review found that CatalogImportService.upload performed the object-storage write before validating the caller through withUserActor. Added a fail-closed assertCaller requiring non-empty subject and role, applied it to user/audit actor helpers, and invoked it before upload storage and execute plan mutation. Added a focused unit spec for missing/blank caller identity proving rejection before object-storage or database actor-context calls.

Commits: f9bfccf3ac11b7fbb0904634845c24a31d7c805a (service), 0b14f11c3fd6f787baa73765da7310bb553b24c4 (regression spec), 0f8586e9548a91ad4c56b410e60180ad080e6788 (import formatting). Tests and CI were not run. This is not runtime verification. No storage, database, migration, staging, worker, deployment or merge action occurred.


## 26 November 2026 — Inventory/Pricing/Cart service boundary spot-check

- InventoryController applies TenantDatabaseContextInterceptor at class level and passes the verified JWT caller to every exposed InventoryService route. InventoryService methods accept optional CallerContext and perform ownership/membership assertions when supplied. InventoryModule exports the service, so all direct internal callsites must be mapped before changing the optional-caller contract; no blanket service signature change is justified yet.
- PricingController also applies TenantDatabaseContextInterceptor at class level and explicitly checks store organization/membership, price-list ownership and variant/store equality before each exposed PricingService call. PricingModule exports PricingService; direct internal consumers remain to be inventoried.
- CartController applies TenantDatabaseContextInterceptor and derives all cart operations from authenticated user.sub. It does not expose the raw getCart(cartId) helper as a route. OrdersModule exports CartService, so direct internal consumers of getCart/listCartItems and user-scoped operations still need mapping before changing method visibility or contracts.
- These are route-level positive findings, not proof that every internal callsite is safe. Keep G-002 partial until exported-service consumers, raw SQL/function/trigger/partition callers and exact operation ownership predicates are reconciled. No source changes, tests, database access or CI were performed in this review.


## 26 November 2026 — exported service direct-callsite map

### InventoryService

- Nest module graph: InventoryModule is imported by AppModule only; no feature module imports it. InventoryController is the sole production Nest consumer identified.
- InventoryController has class-level TenantDatabaseContextInterceptor and passes the verified JwtPayload caller to all 15 exposed InventoryService operations (list/read, create/update, adjust/reserve/release/transfer, exports and low-stock operations).
- InventoryService still has optional CallerContext parameters on tenant-sensitive operations. The assertions are conditional on caller presence. This is not an observed current cross-module bypass, because no other feature module imports InventoryModule, but it remains a fail-open contract if a future consumer is added.
- Existing stock-lifecycle unit tests invoke service methods without CallerContext as low-level harness tests. Do not make the caller mandatory until those tests and any future worker/system execution path are migrated to an explicit privileged/system actor. The test-only direct calls are not production consumers.

### PricingService

- Nest module graph: PricingModule is imported by AppModule only; no feature module imports it. PricingController is the sole production Nest consumer identified.
- PricingController has class-level TenantDatabaseContextInterceptor. Before service calls it validates store organization/membership, price-list ownership and variant/store consistency.
- CartService does not inject PricingService; it uses the pure shared price-resolution functions. No direct internal PricingService consumer was found in the inspected module graph.
- PricingService itself has no CallerContext parameter. This remains a future service-boundary hardening item if a non-controller consumer is introduced; no signature change is justified by the current graph.

### CartService and OrdersModule

- OrdersModule exports CartService, OrdersService and OrderRealtimeAccessService. CartController is class-level intercepted and derives cart operations from the authenticated user ID.
- The only direct CartService call found outside CartController is OrdersService.reorder: it calls addItems and getActiveCartWithItems with buyerId after checking the master order belongs to that buyer. OrdersController applies TenantDatabaseContextInterceptor to POST /orders/master/:id/reorder.
- ReviewsModule and ShippingModule import OrdersModule but their inspected consumers use OrdersService/OrderRealtimeAccess contracts, not CartService. ReviewsService uses getOrder/listPurchasedVariantIds; CarrierWebhookRoutingService uses findShipmentsByCarrierReference.
- CartService.getCart(cartId) is not exposed as a route; it is used internally by getOrCreateCart. The HTTP cart read uses getActiveCartWithItems(user.sub).

### Scope and remaining checks

- This closes the module-graph and currently visible direct-callsite map for InventoryService, PricingService and CartService. It is a source-level review, not runtime proof.
- Before tightening service signatures, still inspect the full worker/cron/bootstrap graph and all exported service consumers in other modules; preserve explicit system/worker actor semantics rather than passing fake user identities.
- Raw SQL, stored functions, triggers, partitions, dynamic SQL and migration/operator execution paths remain outstanding. No source code, tests, database, migration, staging, worker or CI changes were made in this audit update.
