# SCS Platform — Current State

**Live reconciliation date:** 24 November 2026  
**Repository:** [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform)  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Latest PR head:** `19738fbe16399db7f8975d647b062773a3eb2583` (latest docs-only source after the current handoff update; re-query before acting).  
**PR:** [#138](https://github.com/nabeel2323/scs-platform/pull/138), OPEN / DRAFT / UNMERGED, base `develop`.  
**Exact-head Actions/status:** zero Actions runs; Vercel Web/Admin contexts fail on the external build-rate-limit page. No current-head application CI result.  
**Standing instruction:** implementation/integration first; do not intentionally run tests, formatter, lint, typecheck or CI during implementation. Keep PR #138 draft/open/unmerged.

## Latest implementation checkpoint

- Authenticated Identity/Profile, Payments, Orders/Merchant, Catalog Import, P13 monitoring/control and selected worker/system paths have the bounded actor-context adoption recorded in later entries.
- Carrier credential/configuration CRUD and Aramex/webhook credential resolution use verified-user or organization-bound worker contexts with exact organization predicates. The legacy ambiguous webhook route still returns HTTP 401.
- Local Docker migration exclusions for pg_partman-dependent migrations 0013/0018 are now centralized and shared by manual and API development migration paths. The DATABASE_URL migration runner remains the complete-target path and requires pg_partman.
- DatabaseService development migration now holds the shared session advisory lock; the manual local runner uses transaction locks and in-transaction ledger rechecks. The legacy disposable verification migration scripts are guarded and atomic.
- RBAC seed, catalog seed and development RBAC seed use transaction-local system principals. Staging bootstrap and local admin creation use bootstrap principals. The read-only DB access audit uses an audit principal.
- Staging bootstrap diagnostics now require the same explicit target guard and read-only actor scope. RBAC post-commit verification is scoped. The seed mapping total no longer double-counts newly inserted mappings.
- The read-only DB audit now enumerates functions/triggers in all non-system schemas, including partman, and reports pg_partman retention config plus pg_cron maintenance jobs when available.
- Regression specs were updated/added for operator actor context, staging bootstrap actor context and driver/store assignment eligibility. Tests remain unexecuted.
- The existing `POST /orders/:id/assign-driver` route was found in OrdersController/OrdersService. The service now validates an active driver profile and user, active DRIVER membership, profile-org/store-org equality, and migration 0041's zero-row unrestricted / explicit-row allowlist semantics before any fulfillment mutation. The mapping table itself still has no repository writer; no new API, migration or composite FK was introduced.

## G-002 physical table inventory

The source ownership matrix covers all 100 pgTable declarations across 25 module schema files; 98 are re-exported by apps/api/src/drizzle/schema.ts, while catalog_imports and catalog_import_errors are declared in catalog-import.schema.ts but not exported by that barrel. The previously omitted exported payment_proof_upload_intents table is included. The historical 99+15=114 source split is invalidated. The detailed 114 public relation snapshot and separate 116 count remain unresolved pending protected read-only catalog evidence; no subtraction-based delta or live relation total is claimed.

## Latest Catalog Import actor-context slice

CatalogImportController list/detail/errors database-only routes use the verified-user TenantDatabaseContextInterceptor. The report route reads persisted errors inside a short user actor context and builds the workbook after that scope closes. The in-memory preview route and mixed upload/execute/retry routes remain deliberately unwrapped. ExportCatalog, upload/validate, execution transactions and remaining import DB writes still need phase-by-phase actor-context adoption.

## Remaining implementation priorities

1. Finish exact per-operation table ownership predicates and migration-defined FK evidence; preserve the distinction between source declarations and live catalog evidence.
2. Verify external pg_partman maintenance scheduling, actual API/migration identities and protected read-only catalog evidence only through the authorized process.
3. Verify remaining worker/audit/bootstrap actor-context nesting and ensure no different actor is switched while a transaction is active.
4. Reconcile the historical 114/116 relation-count discrepancy from a fresh protected read-only catalog snapshot.
5. Keep G-001 independent review and G-036 verification open. Phases 0–5 remain IN PROGRESS; Phase 6 remains NOT STARTED.

## Verification and safety

G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED. Exact branch Actions are intentionally not triggered during implementation; source and documentation commits use `[skip ci]`. The current documentation head `bb193c7b52ed83bc6c0a6f72ce1a24ba4dcdd926` has zero Actions runs and Vercel Web/Admin rate-limit failures. The prior automatic run #1501 on source SHA `9a010db69c668432f2811c68094a367ad5c7684c` failed API typecheck on optional caller.role; commit `4d3488d` corrected it but was not re-run. Vercel Web/Admin checks on the prior docs head reported external deployment rate limiting. No application test pass is claimed.

No shared DB mutation, migration, seed, reset, bootstrap, audit query, grant/default-ACL change, RLS enablement, protected staging action, deployment, worker activation, merge or release occurred.

## G-002 actor-context implementation checkpoint

The opt-in DatabaseService actor-context foundation is implemented:
- Typed principals: `anonymous`, operation-scoped `authentication`, `user`, `worker`, `system`, `bootstrap`, `audit`.
- Parameterized transaction-local PostgreSQL settings use `set_config(..., true)` for actor ID, role, active organization, actor kind and worker ID.
- AsyncLocalStorage routes existing `DatabaseService.db` calls through a transaction-bound Drizzle handle inside opted-in operations.
- Same-actor nested calls reuse the active transaction; actor switching fails closed.
- The context scope is marked inactive after completion, preventing detached async work from querying through a committed/rolled-back transaction.
- No global interceptor or blanket request transaction exists.

### Bounded authenticated HTTP adoption

The reviewed allowlist covers Notifications, Pricing, Store Membership, Promotions, Reviews/Disputes, Inventory, Analytics, Catalog Offers/Requests/Taxonomy, selected Catalog/Admin reads, Cart, Returns, Organizations/Roles, bounded Profile/device/session handlers, selected Orders reads/preview/reorder/lifecycle operations, and bounded Merchant store/warehouse/verification operations.

Orders reject/cancel and actual checkout remain excluded where payment/refund/provider lifecycles are involved. Merchant document listing/presigning and upload operations remain excluded where storage I/O may be involved.

### Worker, webhook, bootstrap, audit and realtime adoption

- **OutboxDispatcher:** claim and acknowledgement/retry DB operations use worker actor contexts; external event dispatch remains outside transactions.
- **AutoCompleteWorker:** claim and completion/release DB phases use worker actor contexts.
- **ReturnExpirationWorker:** granular lease acquire/renew/release, durable-control, claim, per-item expiration/escalation, alert and success/failure DB operations use worker actor contexts. No outer transaction spans the batch.
- **CarrierTrackingPoller:** claim and persistence/order-bridge DB operations use worker actor contexts; provider tracking HTTP calls remain outside transactions.
- **ShippingCarrierWorker:** all 32 direct DB operations plus merchant tenant lookup, webhook-routing lookup, credential decryption and verified shipment-organization checks use short worker actor contexts. Carrier API and object-storage operations remain outside.
- **Carrier webhooks:** after credential/HMAC authentication, tenant shipment routing and webhook processing use a credential-scoped worker principal.
- **Bootstrap:** status uses anonymous context; post-OTP authorization persistence, initial Super Admin provisioning and operator token CLI use bootstrap contexts.
- **AuditLogMiddleware:** deferred response-finish writes use a separate short audit actor transaction, not the completed request transaction.
- **RealtimeGateway:** authorized store/order room checks use the verified socket user's actor context.

## Remaining implementation priorities

1. Continue Payments/Orders method-level review: identify DB-only payment mutations that can be separated from provider/refund side effects; keep proof uploads, payment-provider, refund and settlement external operations outside transactions. Eight bounded Payments GET routes now use the user actor. Then separate Merchant document metadata from object-storage I/O.
2. Complete remaining safe Orders/Payments read and mutation coverage while excluding external payment/refund phases from DB transactions.
3. Complete Merchant document metadata paths only after separating storage I/O from DB-only registration.
4. Finish the G-002 physical table/operation/ownership matrix and reconcile the 114/116 relation inventory.
5. Obtain actual API/migration runtime identity and protected read-only catalog evidence through the authorized staging process.

## Verification state

No tests, formatter, lint, typecheck, E6 boundary check or GitHub Actions workflow was run for this implementation batch. The consolidated testing campaign is deferred until implementation and integration are complete. Do not mark G-002 VERIFIED from source implementation alone.

No shared database mutation, migration, grant/default-ACL change, RLS enablement, staging action, deployment, worker activation, merge or release occurred. PR #138 remains draft and unmerged.

## 24 November 2026 — authenticated identity actor-context adoption

Source commit: `fe98b12f1f0ad9c6a24a48f02ceb5201c4cf3d4f`.

The authenticated Profile/Auth handlers now forward verified JWT user ID, role and active organization to IdentityService. Explicit user actor contexts cover credential setup/change, OTP-proven email/phone linking, account identifier unlinking and organization switching. Bcrypt, OTP Redis consumption, Redis token denylisting, provider I/O and JWT signing remain outside DB transactions. Password mutation, credential audit, device-trust revocation and session revocation share one DB-only transaction; the non-throwing general audit log uses a separate audit actor context.

Tests were added/updated but not executed. G-002 remains NOT VERIFIED; the next Identity task is pre-authentication principal resolution for OTP/password login and refresh/logout.

## 24 November 2026 — pre-authentication lookup principal

Source commit `4e9e04757e0ab5f6b3c7ac924240216de0b39d0f` adds an `authentication` actor kind with no user/role/org/worker identity and five fixed operation labels in transaction-local `app.auth_operation`. IdentityService uses it for initial phone OTP, email OTP and password account lookups, plus refresh/logout session lookups. Post-proof persistence and device-credential phases remain next. No RLS/grant/migration change; no tests/CI run.

## 24 November 2026 — post-proof authentication/session adoption

Source commits: `5a6eba900eabe021352a0f7f3307bddaeb2d6333` and `b939a335a5bc126241131ab48bb03c9ed3cfaea6`.

- Phone/email OTP: Redis challenge consumption stays outside. Account lookup/create and claims resolution use the fixed authentication operation. Once role/org claims are resolved, session insertion and device-credential issuance run in a verified user actor transaction.
- Password login: rate limiting and bcrypt comparison stay outside. Post-password claims resolution uses the authentication operation; device-credential validation and trusted session insertion/anchor update use the user actor.
- Refresh: initial session lookup and claims resolution use the authentication operation. A user actor transaction conditionally revokes the still-active old session, inserts its replacement and validates/anchors device trust. A zero-row conditional revoke rejects a concurrent rotation. JWT signing remains outside.
- Refresh reuse and logout: resolve session owner first, then perform owner-bound session/device-credential revocations under the user actor. Logout's revocations share one DB-only transaction; unknown tokens remain non-disclosing.
- OTP Redis, rate limits, bcrypt, provider delivery, external audit side effects and JWT signing remain outside database actor transactions.

New DatabaseService auth-context coverage and existing OTP/password/refresh regression fixtures were added/updated but not executed. No RLS/grant/migration/database/deployment action occurred.

## Payments bounded read-route actor context — 24 November 2026

Source commit: `7f56e5185cf1a7c7b6954845ca9151aac83c5ac6`.

Added `TenantDatabaseContextInterceptor` to eight JWT-protected, database-only GET handlers in PaymentsController: buyer payment detail (including order ownership, payment events and refunds), admin requested-refund queue, payment list, verification queue, stale payments, settlement list, merchant payment list and merchant settlement list. The existing service-layer object/tenant authorization and permission guards remain in place. No payment/refund/provider mutation route, file upload route or storage operation was wrapped. Added a controller metadata regression test for the interceptor allowlist; it has not been run.

This is method-scoped transaction context only. It does not enable RLS or change grants.

## Identity session/device route reconciliation — 24 November 2026

A follow-up controller audit confirmed that ProfileController's session list, revoke-by-device, trusted-device list and trusted-device revoke handlers already carry `TenantDatabaseContextInterceptor`. The interceptor derives the actor from the verified JWT after guards and scopes the complete awaited handler. These routes were therefore already covered; no redundant service-level wrapper or controller signature change was added. Credential setup/change remain explicitly scoped inside IdentityService because those handlers intentionally stay outside the interceptor for bcrypt separation.

## Payments DB-only mutation route actor context — 24 November 2026

Source commit: `22f14b0e14bf8ca8ddd2eb578b59d3f3ae5f9b50`.

Added the verified user actor interceptor to four Payments POST handlers whose inspected service call graphs perform database transactions, append payment events and write outbox rows without calling payment/refund providers or object storage: COD cash confirmation, bank-transfer proof verification decision, settlement calculation and settlement-paid recording. Existing permission guards, service-level object/store authorization, row locks, optimistic state predicates and transactional outbox writes remain authoritative. The actor context wraps the complete awaited method; nested Drizzle transactions remain inside that scope.

Explicitly excluded: bank-transfer proof upload (object storage), refund request/approval/retry (refund lifecycle), payment-provider operations, checkout and order cancellation/rejection paths. The controller metadata test now covers 12 Payments routes (eight GET and four DB-only POST); it remains unexecuted.


## 24 November 2026 — Merchant document metadata actor-context adoption

Commit `bccb8c569d122c7b1479881aa162fb428f264c4e` scopes the database-only document registration, organization listing and store listing handlers through the verified-user interceptor. Object-storage upload/download presign handlers remain excluded. The new controller metadata spec asserts the allowlist and exclusions; it has not been executed. Exact-head Actions lookup returned zero workflow runs and zero status contexts. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## Live status reconciliation — 24 November 2026

At PR HEAD `2cff7c0f6604d6918b00efb190abd96d301149e1`, PR #138 remained OPEN / DRAFT / UNMERGED to `develop`. GitHub Actions workflow-run lookup returned zero runs. Combined statuses: Vercel Web SUCCESS; Vercel Admin FAILURE with the external provider build-rate-limit URL. These preview statuses are not application-test evidence. The latest implementation commit is `bccb8c569d122c7b1479881aa162fb428f264c4e`; the `2cff7c0` commit is documentation-only. Tests and all quality gates remain deferred.


## Orders cancellation actor-context continuation — 24 November 2026

The dedicated cancelOrder database phases use a verified-user actor context. Payment cancellation is a DB-only status/event/outbox operation. The actor transaction commits before realtime emission; master-order recalculation and final read use a second context. Source commits: `55910f043360b5e89103fd1ccbe5be6085a14e78` and formatting follow-up `ff8e4aebee01631023fad76eec9a8d98c254108b`. Merchant rejection remains excluded because it invokes refund orchestration; checkout remains excluded pending full side-effect separation. Regression spec added, not executed. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## Latest source implementation continuation — 24 November 2026

Latest implementation commit: 7e2b2509292cfbcfe6f1f12ebae8d2fad25f8cf1. Rejection inventory/status/history/outbox now share one actor-bound transaction; refund-request persistence is a separate stable-idempotency DB phase; master-order recalculation/read use a separate phase. Merchant document presign performs actor-scoped metadata/membership reads, external storage signing outside any DB transaction, and actor-scoped URL metadata persistence. Regression specs are added but not run. Tests/formatter/lint/typecheck/E6/CI remain deferred. PR #138 stays OPEN / DRAFT / UNMERGED; no protected DB, staging, RLS, migration, grants, deployment or worker actions.



## Live GitHub reconciliation — 24 November 2026

- Repository: nabeel2323/scs-platform. Branch: remediation/phase-0-1-tenant-security.
- PR #138 is OPEN / DRAFT / UNMERGED against develop. Exact current HEAD: 84f57fd368ae0472251133adaa8029b01b777b49.
- Latest source implementation commit: 7e2b2509292cfbcfe6f1f12ebae8d2fad25f8cf1. Latest remediation-plan/progress and project-memory sync commit: 84f57fd368ae0472251133adaa8029b01b777b49.
- Exact-head GitHub Actions lookup returned zero workflow runs. Combined status reports Vercel Admin and Vercel Web FAILURE with the provider build-rate-limit URL. These are external preview-provider statuses, not application test outcomes.
- The latest source group scopes Orders rejection DB phases and Merchant document download-presign metadata phases; two regression specs are authored but unexecuted. No formatter, lint, typecheck, E6 or CI was run. G-002 remains IN PROGRESS / NOT VERIFIED.
- No merge, deployment, worker activation, RLS, migration, grant/default ACL change or shared/staging database action occurred. All standing restrictions remain in force.


## Refund-provider execution boundary correction — 24 November 2026

The merchant-rejection flow creates a refund REQUESTED row, payment event and outbox record only. Source inspection of OutboxDispatcher.dispatch confirms generic events are currently logged and marked dispatched; this does not invoke a payment-provider refund. Automatic refund-provider execution is not implemented by this slice and remains outside the approved scope (no automatic gateway/payout expansion or worker activation). The durable refund request is still available for the existing review/approval workflow. Merchant-initiated rejection refunds now attribute requestedBy/paymentEvents.actorId to the authenticated merchant; PaymentsService permits the special MERCHANT_REJECTION reason only when the caller has a MERCHANT_* role and assertOrderAccessible confirms the order is in the caller's active organization. The service no longer impersonates the buyer for audit attribution.



## Exact-head reconciliation — 24 November 2026 (latest continuation)

- Repository: nabeel2323/scs-platform; branch: remediation/phase-0-1-tenant-security.
- PR #138: OPEN / DRAFT / UNMERGED; base develop; exact branch/PR HEAD ec2998abb0ff5fbb9208d66558b4dde309f672bc.
- Source change group: 7e2b2509292cfbcfe6f1f12ebae8d2fad25f8cf1 (Orders rejection + Merchant download-presign); 733b0570c9ae4e94a9684ff28b30cbd3f77ec038 (merchant rejection refund actor attribution and special-reason authorization); df976de9db9c68c04885f106373c072334a9906b (outbox boundary comment). Regression specs were added/updated in the same group and remain unexecuted.
- Documentation/progress updates include 17dcad59ea2b8bf636eca43b58d0c0a98c452976, 84f57fd368ae0472251133adaa8029b01b777b49, fa06d4709367e29a256fa0373fa6fbc42361dac6 and 7663d692fd0f32a3760e07980b4a232e3ab900fb. Latest small test-fixture role correction is ec2998abb0ff5fbb9208d66558b4dde309f672bc.
- Exact-head GitHub Actions lookup: zero workflow runs. Exact-head combined status: zero status contexts. Prior source checkpoint 7663d69 showed Vercel Web/Admin build-rate-limit failures; those prior statuses are not current-head evidence.
- No tests, formatter, lint, typecheck, E6 or CI were run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.
- Refund boundary: rejection creates a durable refund request/payment event/outbox record only. The generic OutboxDispatcher currently logs events and marks them dispatched; no payment-provider refund is executed by this path. Automatic provider execution remains outside the approved scope.
- No merge, deployment, worker activation, RLS, migration, grants/default ACLs or shared/staging database action occurred.


## Merchant verification-review actor-context continuation — 24 November 2026

The verified-user actor interceptor now also covers `MerchantController.reviewVerification`. Source review confirms the service's request/store locks, organization consistency check, verification request/store/document updates, conditional organization verification/product activation, and outbox insertion all occur in one database transaction; no storage or provider I/O occurs in this handler. The existing `merchant:verification:review` permission guard remains authoritative. The controller metadata spec was extended; it is authored but not executed.

Source implementation commit: `6339acb944d3e41a6066e0f123394daa38d74491`. Post-commit live verification confirms branch and PR #138 HEAD both equal this SHA; PR remains OPEN / DRAFT / UNMERGED to `develop`. Exact-head Actions lookup returned zero workflow runs. Exact-head combined statuses: Vercel Web PENDING; Vercel Admin FAILURE with the external build-rate-limit URL. These are preview-provider statuses, not application test outcomes. No tests, formatter, lint, typecheck, E6 or CI were run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED. No protected DB, migration, grants/default ACLs, RLS, staging, deployment, worker activation, merge or release action occurred.


## G-002 worker/socket source-map reconciliation — 24 November 2026

The method-level ownership map's earlier statement that ReturnExpirationWorker, ShippingCarrierWorker and realtime socket actor context remained uncovered was stale. Current source review confirms explicit operation-scoped worker contexts for ReturnExpirationWorker and ShippingCarrierWorker, verified socket-user context for RealtimeGateway room authorization, plus bounded contexts for AutoCompleteWorker, OutboxDispatcher, AuditLogMiddleware and CarrierTrackingPoller. Carrier provider calls, label fetch/streaming and object-storage writes remain outside actor transactions; return lease fencing remains per-operation/per-return rather than a full-batch transaction.

The method-level map now records these boundaries. This closes only the source-map inconsistency; it does not complete G-002's physical table/operation/ownership matrix or establish live runtime identity/RLS verification. No tests or CI were run and no protected database/staging/deployment action occurred.


## G-002 physical table matrix — Identity and Merchant direct-column pass — 24 November 2026

Updated 16 Identity/Merchant table rows with direct Drizzle columns and declared parent references. The matrix now distinguishes user-owned records from organization membership, global RBAC reference data, organization-owned stores, store-inherited warehouses, dual-parent documents/verification requests, and store/user membership rows. Actor attribution fields are not treated as ownership keys; the missing composite org/store constraints remain explicit service-level consistency requirements.

This is schema-source evidence only. The 99 Drizzle / 114 detailed public relation / unresolved 116 count discrepancy, live staging constraints, actual API/migration identities and protected catalog audit remain open. No tests or CI were run and no database/RLS/migration/grant/staging/deployment action occurred.


## G-002 physical table matrix — Catalog core/offers/taxonomy direct-column pass — 24 November 2026

Updated 24 Catalog/Search/Import table rows with schema-backed direct columns and declared parent paths. The pass distinguishes shared/global taxonomy from store-owned category extensions, nullable shared products from merchant offers, inherited child rows, user-owned favorites/saved suppliers, merchant store imports from platform catalog imports, and mixed user/store search history. Multi-parent consistency for merchant offers, offer-review state and product media remains a service-level requirement where no composite FK is declared.

This is Drizzle source evidence only; no live catalog constraints or policy readiness are claimed. The 99/114/116 discrepancy, runtime identity and protected catalog audit remain open.


## G-002 physical table matrix — Inventory/Pricing/Promotions/Orders/Shipments direct-column pass — 24 November 2026

Updated 15 table rows with direct Drizzle columns and parent references across Inventory, Pricing, Promotions, Cart, Orders and Shipments. The matrix now distinguishes warehouse-inherited stock ownership, store-owned price books/promotions, buyer-owned carts/master orders, buyer/store participant access for sub-orders, and shipment inheritance. Polymorphic references and missing composite constraints are explicitly recorded as service-level invariants, not treated as FKs.

This is source-schema evidence only. Live catalog constraints, runtime identities, operation-by-operation policy mapping and the 99/114/116 reconciliation remain open.


## G-002 full source-schema inventory reconciliation — 24 November 2026

The table ownership matrix now covers all 100 `pgTable` declarations found across the 25 module schema files, with direct columns, declared parent references, attribution fields, polymorphic references and multi-parent consistency requirements recorded. A source-barrel comparison found that 98 declarations are re-exported by `apps/api/src/drizzle/schema.ts`; `catalog_imports` and `catalog_import_errors` are declared in `catalog-import.schema.ts` but not exported by the barrel. The previous 99-row matrix included those two and omitted the exported `payment_proof_upload_intents` table; that inventory omission is corrected.

The historical 99+15=114 relation split is no longer a current source-backed reconciliation. The detailed 114 relation snapshot and separate 116 count remain unresolved pending protected read-only catalog evidence. No live relation count, policy readiness or RLS verification is claimed.


## G-002 Payments proof upload and cleanup phase separation — 24 November 2026

The bank-transfer proof upload and stale-intent cleanup paths now have explicit database actor boundaries. User-owned proof submission DB phases use verified CallerContext claims; the multipart controller remains outside the request interceptor. Object-storage writes/deletes are kept outside actor transactions. The cleanup sweeper uses a worker actor for global intent claims, payment-reference checks and intent state updates, while object head/delete remains outside the DB scope. Tests were authored but not run; the cleanup scheduler was not activated.


## Automatic CI exception and typecheck remediation — 24 November 2026

The source commit `fa9e554418f6b268bbab35208a8f35db48a41161` unintentionally triggered Actions run #1474 (`45376045168`). It completed with Mobile Flutter Tests SUCCESS, API Lint SUCCESS and API Typecheck FAILURE. The typecheck identified new PaymentsService errors from nullable caller role, fileBuffer and mutable upload-intent values captured by async callbacks, as well as additional failures in TenantDatabaseContextInterceptor, IdentityService, ShippingCarrierWorker and integration-test files (baseline attribution unknown).

The PaymentsService-specific type errors were corrected in `fc2993290d4522d397ab56934e41103f8dd9d060` by guarding the caller role and capturing immutable non-null upload values. The correction has not been rerun locally. Automatic Actions run #1475 (`45376830054`) was IN_PROGRESS at this checkpoint. No cancellation action is available through the connected GitHub capability. No further CI run is intentionally requested.


## Final automatic CI result — 24 November 2026

Actions run #1475 (`45376830054`), on source commit `fc2993290d4522d397ab56934e41103f8dd9d060`, completed with Mobile Flutter Tests SUCCESS, API Lint SUCCESS and API Typecheck FAILURE. The typecheck no longer reported errors in `payments.service.ts`; the PaymentsService actor-role and async nullable-value issues from run #1474 were absent after the fix. Remaining reported failures were in `tenant-database-context.interceptor.ts`, `identity.service.ts`, `shipping-carrier.worker.ts`, integration specs (account-linking, device-trust, email-OTP, m723a1 concurrency, registration flows) and unit specs (token revocation and database authentication context). No baseline run was available to classify those as pre-existing.

Unit Tests + Coverage Gates, Integration Tests, Boundary Lint (E6), Container Build & Smoke Test, Web/Admin App Tests, Migration Full Apply, Build, Contract Spec & Codegen, k6 Smoke Test and Trigger Staging Release were SKIPPED. No backend unit/integration or release-gate success is claimed. The two automatic runs were not intentionally dispatched; no further CI rerun is requested. The available GitHub connector has no workflow-cancel action.


## G-002 — Catalog Import actor-context phase separation — 24 November 2026

**Source implementation checkpoint:** `ff83be282b9f36c1153271e612e5686bbee33931` (source files: CatalogImportController, CatalogImportService, ExcelExecutorService and TemplateGeneratorService).

- The controller now forwards verified JWT `sub`, `role` and `activeOrg` into upload, execute, retry, template download and catalog export operations. Existing list/detail/errors routes retain the post-guard verified-user interceptor; preview remains in-memory only.
- Upload performs object-storage put before opening a short user actor scope for the import-row insert. Auto-validation then passes the same verified caller through each phase.
- Validation scopes job/status reads and writes, existing-catalog snapshots, reference resolution, plan/refs persistence and error persistence to short user actor transactions. Storage download, byte collection, XLSX parsing, validation, planning and cache mutation remain outside DB transactions.
- Execution scopes import status/counter updates, publishability DB reads, error/plan persistence and audit persistence. The audit record uses a separate audit principal. ExcelExecutorService establishes a verified user actor for each of its 12 ordered entity-type transactions; combination-key updates use a separate short user actor scope. Existing per-entity transaction/savepoint and dependency behavior is retained.
- Retry resolves the job under the caller actor, then reuses caller-aware validation and execution. Failure-path plan snapshot persistence is also actor-scoped.
- Template dropdown source rows are loaded under one short actor scope; template workbook creation and XLSX serialization occur after it closes. Catalog export scopes each independent source query and performs workbook row generation/serialization outside those query scopes.
- Object storage and workbook parsing/generation are not wrapped in actor transactions. No request-wide transaction was added.
- This is source implementation only. No tests, formatter, lint, typecheck, E6 or CI were intentionally run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED. No RLS, migration, grants/default ACLs, shared/staging database actions, deployment, worker activation, merge or release occurred.

**Remaining G-002 work:** P13Monitor/OpsAlert/OpsControl/PilotControl worker/system/operator principal separation; remaining source-backed raw SQL/function/trigger/partition/bootstrap/CLI/helper access paths and exact per-operation predicates; migration-backed FK validation; protected read-only catalog and actual API/migration runtime identity evidence through the authorized process. G-001 independent review and G-036 verification remain open; Phase 6 remains NOT STARTED.


## G-002 — P13 monitor, alert, ops-control and pilot-control principals — 24 November 2026

**Source implementation checkpoint:** P13 source slice completed through `c80af8cddb3a65814a20304f53b49f400f8c416d`.

- P13Monitor's raw SQL reads now execute under a dedicated worker principal (`p13-monitor`). Worker-lease reads continue through WorkerLeaseService's own worker principal. Findings collection remains read-only; alert raise/resolve work begins after those short read scopes close.
- OpsAlertService's durable alert-state DB phases use the platform alert-service system principal when no caller context is active. Operator-facing list/snapshot reads use the verified admin user. Atomic claim/update statements remain individually scoped; webhook delivery stays outside the alert-service's short DB scopes.
- OpsControlService checks the pause flag under a worker principal. Admin state/history reads and pause/resume mutations use verified caller claims; the durable control row and append-only control audit row remain in one caller-bound transaction. Platform AuditService writes use a separate audit principal, and alert delivery follows after those DB scopes close.
- PilotControlService policy flag/allowlist reads reuse an already-active verified caller/worker context, otherwise use a dedicated system policy reader. Admin snapshots and configuration mutations use verified caller claims; platform audit writes use a separate audit principal. Organization/store ownership validation calls remain outside the local write transaction.
- OperationsController now forwards authenticated JWT `sub`, `role` and `activeOrg` to the control, alert and pilot services. No new RBAC permissions or role changes were introduced.
- This is source implementation only. No tests, formatter, lint, typecheck, E6 or CI were intentionally run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED. No RLS, migration, grants/default ACLs, shared/staging database actions, deployment, worker activation, merge or release occurred.

**Next G-002 work:** complete callsite and operation-map reconciliation for P13 and the other raw SQL/service/worker paths; verify actor scopes are never switched while another actor transaction is active; finish the physical table/operation/ownership-predicate matrix and exact FK evidence; obtain protected read-only runtime catalog and API/migration identity evidence through the authorized process. Regression specs are still required before the deferred verification campaign. G-001 independent review and G-036 verification remain open; Phase 6 remains NOT STARTED.


## G-002 — Catalog Import and P13 actor-context adoption consolidated — 24 November 2026

**Latest source implementation checkpoint:** `75890feeffcef6f0035238476dc9242958dd5ec5`.

The Catalog Import source slice and P13 operational principal slice are now implemented together:
- Catalog Import upload/validate/execute/retry, executor entity-type transactions, report errors, template dropdown queries and export source queries use verified caller actor scopes. Object storage, XLSX parsing, workbook construction and serialization remain outside DB actor transactions. Failure-path plan persistence and audit writes use the appropriate user/audit principal.
- P13Monitor raw SQL reads use a worker principal; WorkerLeaseService retains its own worker scope. OpsAlert durable alert-state DB phases use a system service principal when no caller context is already active; operator list/snapshot reads use the authenticated admin actor. Webhook delivery remains outside the alert service's short DB scopes.
- OpsControl pause checks use a worker principal; admin state/history/pause/resume use the verified caller, with the control row and append-only control audit in one transaction and a separate audit principal for AuditService.
- Pilot policy reads use the current verified actor when nested or a system policy principal otherwise. Admin snapshots and writes use the verified caller; organization/store ownership validation reads are also caller-scoped; AuditService writes use a separate audit principal.
- Helper wrappers now await PromiseLike/Drizzle query thenables before leaving the actor context.
- The implementation does not activate workers, change RLS/grants/migrations, or access shared/staging data. No tests, formatter, lint, typecheck or E6 were intentionally run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.

**Automatic CI note:** GitHub automatically queued PR CI run #1499 (run ID 45394547128) after the source push. It was PENDING at the last check; no workflow was intentionally dispatched. Vercel Web/Admin contexts remained FAILURE due to the external build-rate limit. Check the run's eventual result before starting the deferred verification campaign.

**Next work:** reconcile the complete G-002 operation inventory against all source callsites and exact table/ownership predicates; verify no actor-context switch occurs while a different actor transaction is active; reconcile the 100 current source declarations with the historical 114-relation snapshot (99 declarations + 15 non-Drizzle objects on 19 November) and the unresolved historical 116 count; do not treat source counts as live catalog evidence; validate migration-backed FKs and obtain protected read-only runtime catalog plus actual API/migration runtime identity evidence through the authorized process. Add/adjust regression specs after implementation/integration is complete, then run the consolidated verification campaign. G-001 independent review and G-036 verification remain open; Phase 6 remains NOT STARTED.


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


## 24 November 2026 — actor-context nesting correction and final source checkpoint

**Latest source checkpoint:** `0f3c180f5af389cb363e8919982af371dc178f16`.

- Source callsite review found that ReturnExpirationWorker already holds its lease-fenced worker actor when it calls `OpsControlService.isPaused()`. OpsControl now reuses the active actor context instead of attempting to switch to a second worker ID. This avoids the explicit actor-switch rejection in DatabaseService while preserving the worker's existing lease fence.
- P13Monitor's read helper likewise reuses an already-active verified actor context when nested and creates its dedicated `p13-monitor` worker context only when no actor context exists. Pilot policy and OpsAlert system helpers already follow the same reuse-before-create rule.
- Catalog Import resolver reads and CatalogTaxonomyService publishability checks are executed inside the caller's actor scope. The publishability validator's legacy natural-code-to-UUID correction is a DB write and therefore remains inside that same caller scope.
- Runtime schema barrel completeness correction `474ef450d98a62fe3b2f6b480a5dc4ea300d824d` includes the catalog-import schema; current source and runtime barrel both enumerate 100 declarations. The 114 public r/p count is a historical 19-November catalog snapshot (99 declarations + 15 non-Drizzle objects), not a current live count; 116 remains a separate unexplained historical count. No protected live catalog audit was run.
- No tests, formatter, lint, typecheck or E6 were intentionally run. No merge/deploy, worker activation, migration, RLS/grant/default-ACL change or shared/staging DB access occurred. Automatic CI run #1499 was queued on the prior source checkpoint and must not be treated as exact-head verification.

**Next task:** continue the source callsite and ownership-predicate audit across carrier credential lifecycle/retry/recovery, audit middleware, migration/bootstrap/CLI paths and raw database functions/triggers/partitions. Add targeted regression specs for actor reuse, worker nesting, caller-scope boundaries and the schema-barrel completeness correction after implementation/integration is complete. Then finish FK evidence and protected read-only API/migration identity/catalog verification.


## 24 November 2026 — CI failure triage and fixture compatibility correction

- Automatic PR CI run [#1499](https://github.com/nabeel2323/scs-platform/actions/runs/45394547128), on the earlier source checkpoint `75890feeffcef6f0035238476dc9242958dd5ec5`, completed with **API Lint PASS / API TypeScript typecheck FAIL**. The typecheck errors were due to test fixtures still calling the new caller-required APIs with legacy signatures, plus a stale `actorId` reference in PilotControl's flag log message. Vercel Web/Admin contexts also failed on the external build-rate-limit page.
- Corrected the PilotControl caller attribution reference. Updated Catalog Import executor/template tests to pass a verified caller; integration harnesses now use the real DatabaseService actor-context implementation. Updated executor unit doubles to expose the scoped-context hook. Updated P13 operational-readiness and PilotControl tests to pass caller contexts and use the real DB actor-context wrapper where PostgreSQL is involved.
- These are test-source/fixture corrections only. They have **not** been executed and no new typecheck was run. Do not treat CI #1499 as verification of the corrected test fixtures.
- Latest implementation/test commit: `4950e66507efebca8fbc7d910d65ae717f360732`. Exact-head Actions lookup returned zero workflow runs. Exact-head combined status contains only Vercel Web/Admin failures targeting the provider build-rate-limit page; these are not application test results. Commits use `[skip ci]` under the implementation-first verification restriction.
- PR #138 remains OPEN / DRAFT / UNMERGED. No merge, deployment, worker activation, migration, RLS/grant/default-ACL change, shared/staging DB access or provider call occurred.

**Next:** complete the remaining source callsite/ownership-predicate inventory, then run the consolidated typecheck/unit/PostgreSQL/E6 verification campaign only after implementation and integration are complete. Resolve any newly exposed failures before considering G-002 verified. G-001 independent review and G-036 verification remain open; Phase 6 remains NOT STARTED.


## 24 November 2026 — carrier credential/configuration actor-context continuation

Source commits: `9906430459666effbd25f33148c3cdf01b976330` and `9a010db69c668432f2811c68094a367ad5c7684c`. Next task: migration/CLI/raw SQL function/trigger/partition reconciliation and exact ownership/FK evidence. No verification was executed; Actions #1501 is automatic and was in progress at last inspection.


## 24 November 2026 — carrier actor-context type correction

Commit `4d3488d7017439c1e756df4a595873dc9d590455` makes carrier user actor creation fail closed when the caller role is missing/blank and performs the organization membership pre-check before credential encryption, then rechecks membership inside the insert transaction. This addresses the concrete nullable-role type error in automatic run #1501; the correction remains unverified because exact-head CI was not run.


## 24 November 2026 — webhook actor-context test harness follow-up

Latest source/test commit before this documentation sync: `47c27898447389de4809a861f19c7b37e54b7081`. It updates the CarrierWebhookController tenant-routing test harness to supply the new actor-context wrapper and assert the org-bound webhook-secret call signature. The test has not been executed.


## 24 November 2026 — Vercel status reconciliation

At the last live check, branch/PR head was `977e837e65fc6639f24610832962c20c766eb55d`. Exact-head Actions lookup was empty. Vercel Web and Admin contexts were FAILURE with “Deployment rate limited — retry in 24 hours.” This is an external preview-provider rate limit, not an application test result. PR #138 remained OPEN / DRAFT / UNMERGED to `develop`. Re-query live HEAD and statuses before continuing after this documentation note.


## 24 November 2026 — migration object and operator access continuation

See [G-002 migration object and operator access audit](../docs/remediation/G-002-MIGRATION-OBJECT-AND-OPERATOR-ACCESS-AUDIT-2026-11-24.md). Latest source checkpoint before docs: `48b22ded255f514f4ccec55d58a604a1c41e7b8f`. New migration exclusion/locking, operator actor context, staging target guards, legacy verification-script safety and audit tooling changes are committed but unverified. No database operation or CI run was performed.


## 24 November 2026 — stale migration-ledger fail-closed correction

Source follow-up through `6f3327a2039c65fb0f9578202d4bd76c75e7b426` adds a second layer of migration consistency protection:

- Local `migrate.ts` and DatabaseService development bootstrap now refuse to proceed when pg_partman-dependent migrations 0013/0018 are already present in the ledger despite being excluded from the local image. They do not delete ledger rows or attempt automatic repair; the local DB may contain partial state and must be explicitly rebuilt/reconciled.
- The complete `migrate-pg.ts` runner now rejects impossible/stale analytics ledger states: 0018 without 0013, 0013 without the pg_partman extension/config row, or 0018 whose retention values do not match the migration.
- The disposable M7.3 runner refuses to continue if skipped pg_partman migrations already appear in its ledger.
- Local `migrate.ts` uses a unique per-process/per-file temp SQL path and cleans it up, avoiding concurrent runners overwriting the same temporary script.
- Disposable shell verification target guard now also checks `inet_server_addr()` is a Unix socket or loopback address, in addition to explicit test environment, exact DB/user, local PGHOST/PGHOSTADDR and no PGSERVICE redirection.

No database was inspected or repaired, and no tests/CI were run. These are source-level fail-closed checks only.


## 24 November 2026 — migration FK source scan completion

The 75-file numbered migration scan found 183 explicit REFERENCES clauses across 40 migration files; 35 files had none. The detailed migration/count/parent-table appendix is in `docs/remediation/G-002-MIGRATION-FOREIGN-KEY-CROSSWALK-2026-11-22.md`. This completes the static source-reference inventory, not live catalog verification. Remaining: reconcile with Drizzle declarations and protected staging pg_constraint evidence, then finish cross-column ownership consistency decisions (org/store, carrier config/credential/store, payment/refund/order/settlement, shipping driver/store, reconciliation parent/org). No database query was run.


## 24 November 2026 — financial cross-column ownership continuation

Latest source commits:
- `01b6e6c729c1a458f20aaeaed043df4c569119e4`: settlement-adjustment `org_id` is always derived from sub-order → store → organization; optional caller org and return parent are validated; settlement payment/order consistency is checked before posting.
- `fa2547997c4b4dad490b582f92c9a69b8c01ed8f`: commission reversal validates return payment/order, item/order, caller org and settlement payment/store identity; adjustment ledger rows cannot be selected as the primary settlement.

The crosswalk and progress tracker now record the invariant evidence and regression cases. Tests remain deferred. CI run #1503 (ID 45434170778) was automatically queued by source pushes and was IN_PROGRESS at last observation; it was not manually dispatched and no pass is claimed. Vercel Web/Admin remain external rate-limit failures. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.

**Next source task:** inspect driver-profile/store-assignment organization consistency and reconciliation run/discrepancy organization inheritance; then complete the remaining financial/shipping cross-column matrix and Drizzle/migration FK reconciliation. Obtain actual runtime identity/catalog evidence only through the authorized read-only staging process. PR #138 remains draft/unmerged; no merge, deployment, shared DB mutation, migration, RLS/grant change or worker activation occurred.


## 24 November 2026 — reconciliation scope integrity follow-up

Source commit `98843bfe455667f7a96d7cbdd6dfb2253ce2af0f` now verifies a non-null reconciliation organization exists before run creation, rejects a run read if any discrepancy child has a different organization from the run, and checks the parent run's organization before discrepancy resolution. The run writer already stamped both parent and children from the same tenant scope; this closes the missing read/resolve validation.

Driver assignment schema review remains open: profile org and assignment store are separate FKs without a same-org constraint; the inspected ShippingModule and ShipmentOperationsController have no assignment write route, and shipment assignedDriverId references users. No speculative endpoint was introduced. The next task is to locate the actual consumer/write path.

CI #1503, automatically triggered by earlier source commits, completed FAILURE on the prior source SHA; it does not cover the reconciliation update and has not been triaged during implementation. Follow-up commits use `[skip ci]`. No tests, staging/shared DB, migration, RLS/grant, deployment, worker activation, merge or release action occurred. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## 24 November 2026 — refund/payment/order lineage follow-up

Source commit `e9bf293dbdb8bde8ab2a7a409d37c2b411ee5b5d` closes missing cross-column checks in refund approval and idempotent request recovery: refund order and currency must match the locked payment before a replay is accepted or an approval transitions state. Return-refund processing already validates its return/payment/order/refund/buyer/currency lineage under locks. The G-002 crosswalk and progress tracker now include the source evidence and regression cases.

No tests or CI were run for this `[skip ci]` source commit. The previous automatic CI #1503 failure was on the earlier financial source checkpoint, not this update. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED. Next: locate actual driver/store assignment consumers, complete remaining shipment/order and carrier/shipment cross-column review, reconcile Drizzle declarations against migrations, then add regression coverage and proceed to consolidated verification only after implementation/integration is complete.


## 24 November 2026 — shipment order/store integrity follow-up

Source commits `b1e5490401d9602205d46351ee4eaf1ab2db7d30`, `02edaa89d75b06e6c8a4170cc306662965d8fd30`, and `15d328c952dfd0805a9eee00374c6ad74ed1d6a1` enforce the shipment/order/store same-merchant invariant at creation, shipment detail authorization (before privileged bypass), and carrier worker processing before external side effects. This addresses independent `shipments.order_id` and `shipments.store_id` FKs that otherwise allow a mismatched pair.

Regression cases are documented, not executed. Commits use `[skip ci]`. Next: locate the driver/store assignment consumer, review remaining carrier/webhook/shipment relationships, reconcile Drizzle and migration FKs, then add and execute the consolidated regression suite only after implementation/integration completion. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## 24 November 2026 — latest refund and shipment source checkpoint

Latest source implementation commits:
- `01b6e6c729c1a458f20aaeaed043df4c569119e4` — settlement-adjustment org/return/payment ownership.
- `fa2547997c4b4dad490b582f92c9a69b8c01ed8f` — commission-reversal return/payment/item/settlement/store ownership.
- `98843bfe455667f7a96d7cbdd6dfb2253ce2af0f` — reconciliation organization and parent-child scope.
- `e9bf293dbdb8bde8ab2a7a409d37c2b411ee5b5d` — refund/payment/order/currency lineage.
- `b1e5490401d9602205d46351ee4eaf1ab2db7d30`, `02edaa89d75b06e6c8a4170cc306662965d8fd30`, `15d328c952dfd0805a9eee00374c6ad74ed1d6a1` — shipment/order/store consistency at creation, detail authorization and carrier worker boundaries.

The G-002 migration FK crosswalk, implementation progress tracker, work log, open issues and START-HERE handoff were synchronized. Regression scenarios are documented but have not been added/executed in this continuation. The only recent automatic CI run, #1503, failed on an earlier source SHA; later source/docs commits use `[skip ci]` and have no workflow runs. Vercel Web/Admin remain external rate-limit failures. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.

**Next:** locate the actual `driver_store_assignments` consumer/write path, finish the remaining carrier/webhook/shipment relationship inventory, reconcile Drizzle declarations with migration FKs, and then add regression coverage before the deferred consolidated verification. No protected staging, shared DB, migration, RLS/grant, deployment, worker activation, merge or release action occurred.


## 24 November 2026 — shipment read-path completion update

Source commit `56d605a7377c49766b990abfc023e6ae4a5cea1d` extends shipment/order/store consistency to OrdersService exception/RTS access before driver/platform bypasses, order-based shipment lookup, and driver shipment lists. Commit `c916acd0a8b156affeda50e98dbc88acab2f39bc` filters malformed pairs from ShipmentOperationsController list and count queries. Combined with shipment creation, detail and carrier worker guards, all inspected shipment read/provider paths now enforce same-store order ownership.

Regression cases are documented but unexecuted. Driver profile/store assignment consumers and remaining carrier/webhook relationships remain open. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED; no tests or CI were run for the `[skip ci]` source commits.


## 24 November 2026 — carrier recovery/webhook/tracking ownership checkpoint

Latest source follow-up commits:
- `0581776dc42e87e4206377b45c971612368ab0ef`: direct create/cancel reconciliation validates shipment order/store before provider calls; both claim SQL paths exclude mismatched pairs.
- `83a4073c20d14519f9c9f02757bd2386bbe9de58`: admin recovery validates order/store before privileged bypass and recovery queue joins matching orders.
- `2b2810e14e41f40023e610dcda9e9064fb846e9c`: webhook shipment resolution joins orders on ID and same store.
- `9c9d7f479ae332e6760238c7a9789f9e56febbea`: tracking poll claim and per-shipment path validate same-store order ownership before provider/event/delivery side effects.

Driver/store assignment review found only schema declarations in the inspected module; no assignment writer/controller was found, and shipment assignedDriverId points to users rather than driver profiles. Do not invent an API. The crosswalk and implementation progress tracker record this disposition and the remaining regression cases.

No tests or CI were run; commits use `[skip ci]`. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED. Next: continue full Drizzle-to-migration FK reconciliation and source callsite scan, then add regression coverage before the deferred verification campaign. Protected staging/database/RLS/grant/migration/deployment/worker/merge gates remain unchanged.


## 24 November 2026 — webhook retry credential lineage checkpoint

Source commit `926c475fb9c59ffa1688dccee3d4f9dfbeea59e2` closes a remaining webhook retry relationship gap: every unprocessed credential-bound event now revalidates credential existence/active state and provider key, including already-linked events; the linked shipment's store organization must equal the credential organization before the event is marked processed. Unlinked legacy events without a credential fail closed; already-linked legacy rows with null credential remain compatible but still require shipment/order/store consistency.

Crosswalk and progress tracker record the new invariants and regression cases. No tests or CI were run; commit uses `[skip ci]`. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED. Next: finish Drizzle-to-migration FK reconciliation and locate any external driver assignment consumer before adding any API or database constraint.


## 24 November 2026 — driver assignment eligibility continuation

Source commits `9d461e1c25381d4528fc733059ee58afb320fa6b` and `fca4c3569976fd6e5a8b9db767e876f8f449c367` add the ShippingService driver eligibility contract and enforce it in `OrdersService.assignDriver` before order/shipment/event/history/outbox writes. The contract checks active profile/user, active DRIVER membership and profile organization = store organization. It preserves migration 0041's rule that zero explicit `driver_store_assignments` rows means unrestricted eligibility within the driver's organization; otherwise the target store must be listed.

Unit and disposable PostgreSQL regression source was added; no tests, formatter, lint, typecheck, E6 or CI were run. The latest exact-head check on parent SHA `d6070e476e29d826b953f1874e12f757c736c222` returned zero Actions runs and zero status contexts. PR #138 remains OPEN / DRAFT / UNMERGED to `develop`. No live/shared DB, migration, RLS/grant, protected staging, deployment, worker activation, merge or release action occurred. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.

**Next:** complete Drizzle-to-migration FK reconciliation and remaining source-level ownership/actor-context review; confirm whether an external process provisions optional driver-store allowlist rows; obtain actual API/migration runtime identities, pg_partman scheduler ownership and live catalog evidence only through the authorized read-only staging process. Keep G-001 independent review and G-036 verification open; defer consolidated tests/CI until implementation/integration is complete.


## 24 November 2026 — targeted Drizzle FK parity continuation

The current session advanced the migration/Drizzle FK reconciliation:
- `financial.schema.ts` now declares the migration 0062 self-reference `reconciliation_runs.superseded_by → reconciliation_runs.id` using a typed lazy reference.
- The migration-only deferred links `refunds.return_request_id`, `return_requests.refund_id`, `return_request_items.inventory_item_id` and `disputes.return_request_id` are explicitly documented in their schema declarations, including the payments/returns module-cycle and ON DELETE SET NULL semantics.
- The G-002 migration FK crosswalk now records the four targeted parity findings and distinguishes them from nullable application-maintained `org_id` columns that intentionally have no organizations FK.

This is not full Drizzle/migration parity completion: only the payment, return and financial schema slice was inspected. The remaining 100-table schema/migration comparison, exact ownership predicates, source operation and actor-context nesting audit, protected read-only catalog/runtime identity, external pg_partman scheduler evidence, 114/116 historical relation reconciliation, G-001 independent review and G-036 verification remain open.

Source commits: `b37f3386220b7148f2b326f9fd43b532b201a152`, `ef178d7af0d10b1ef80642aa5f6fe77b37cc55d4`, `e1d73e5270f8a815c537edf97f1ff8cc1d45fac4`. Crosswalk commit: `ad1547e781e0382bbd4ad6b6105c59dc3b19c0a3`. Tests, formatter, lint, typecheck, E6 and CI were not run; all remain deferred. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED. PR #138 remains OPEN / DRAFT / UNMERGED to `develop`; no protected database, staging, migration, RLS/grant, deployment, worker activation, merge or release action occurred.


## Final live reconciliation — 24 November 2026

Immediately before this checkpoint update, GitHub reported PR #138 head `07eb6b7c60152ca72dd937bc0dd1251003fd583b`, OPEN / DRAFT / UNMERGED to `develop`. The compare API reports the branch 2,485 commits ahead and 0 behind `develop`. Exact-head Actions lookup returned zero workflow runs. Combined status contains only Vercel Web/Admin FAILURE contexts pointing to the provider build-rate-limit page; these are external preview-provider failures, not application test results.

The current source/docs work remains unverified. No tests, formatter, lint, typecheck, E6 or CI were run during implementation. The next task remains full table-by-table Drizzle/migration FK parity and source callsite/actor-context audit; protected runtime identity/catalog and pg_partman scheduler evidence remain gated.


## 24 November 2026 — migration 0059 Drizzle parity correction

The latest source slice represents three migration 0059 relationships directly in Drizzle without introducing a module cycle: `return_requests.refund_id → refunds.id`, `return_request_items.inventory_item_id → inventory_items.id`, and `disputes.return_request_id → return_requests.id`. All preserve nullable columns and `ON DELETE SET NULL`.

The review also found that `refunds.dispute_id → disputes.id ON DELETE SET NULL` was omitted from the earlier targeted parity table. Together with `refunds.return_request_id → return_requests.id ON DELETE SET NULL`, these remain migration-owned because payments cannot import returns/support without a payments → returns/support → payments module cycle. Source comments and the G-002 crosswalk now record this reason.

This is a targeted correction, not completion of the full table-by-table FK reconciliation. No migration, database, RLS, grant, staging, worker, deployment or merge action occurred. No tests, formatter, lint, typecheck, E6 or CI were run. Next: complete the 100-table / 183-migration-reference parity review, then finish remaining operation/actor-context ownership review. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.
