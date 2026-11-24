# SCS Platform — Current State

**Live reconciliation date:** 24 November 2026  
**Repository:** [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform)  
**Branch:** remediation/phase-0-1-tenant-security  
**Latest source implementation commits:** c587ed46db9a4893f2fa0167a74e671bc9d3ae10 (actor-context type-safety), a78503a01f28de440b2ae8d9c3cafd1e754dfd93 (carrier recovery), 98161b3f2e49b4b16af3d0fe6c98c5a8074a441f (worker leases), 5de17d1880aa645a2efeccaf98eba959c6da7c8e (worker-lease test fixture), 400acb3cb3c338e477bed180b64580b9b200dc0e (catalog-import read routes), and 565ab94a678053a60ef9386fafe3d2615e177f93 (report error-read phase).  
**PR:** [#138](https://github.com/nabeel2323/scs-platform/pull/138), OPEN / DRAFT / UNMERGED, base develop.  
**Latest exact branch/PR head:** 565ab94a678053a60ef9386fafe3d2615e177f93. Exact-head Actions lookup: zero workflow runs. Vercel Web and Admin contexts both FAILURE due to external deployment rate limiting; these are preview-provider statuses, not application test outcomes.  
**Recent automatic runs:** #1476 failed the changed-file formatting gate after all 9 lint/typecheck tasks and Mobile Flutter Tests succeeded. #1477 was automatically cancelled by a newer push. #1478 failed API typecheck due only to an outdated worker-lease unit-fixture variable reference; that fixture was corrected in 5de17d1 and has not been re-run.  
**Standing user instruction:** implementation and cross-component integration first; do not intentionally run tests or trigger CI during implementation. Keep PR #138 draft/open/unmerged.

## Latest implementation checkpoint

- The actor-context typecheck corrections capture narrowed JWT claims before the deferred interceptor callback, retain the non-null prior password hash in IdentityService's optimistic update predicate, and return the validated organization ID from the carrier tenant assertion. Direct-service test fixtures now pass authenticated actor claims and current method/constructor arguments.
- Carrier reconciliation claims and durable DB transitions now use a short global worker actor (carrier-reconciliation:<pid>). Carrier tracking/provider calls remain outside actor transactions. Outbox retry intent and shipment retry-state update commit together under the worker actor.
- Carrier admin recovery now performs shipment read, tenant/membership checks, recovery-state update and authoritative re-read under the verified admin actor. The carrier reconciliation call happens after that scope closes; the audit write uses a separate audit principal. The recovery queue read uses the verified user actor.
- WorkerLeaseService wraps lease ensure/acquire/renew/heartbeat/failure/release/read operations in the process holder's worker actor. The runbook-only force-expire operation uses a separate system actor.
- Regression specs were added/updated for carrier recovery worker/admin actor scopes and worker lease actor scopes. They remain unexecuted.

## G-002 physical table inventory

The source ownership matrix covers all 100 pgTable declarations across 25 module schema files; 98 are re-exported by apps/api/src/drizzle/schema.ts, while catalog_imports and catalog_import_errors are declared in catalog-import.schema.ts but not exported by that barrel. The previously omitted exported payment_proof_upload_intents table is included. The historical 99+15=114 source split is invalidated. The detailed 114 public relation snapshot and separate 116 count remain unresolved pending protected read-only catalog evidence; no subtraction-based delta or live relation total is claimed.

## Latest Catalog Import actor-context slice

CatalogImportController list/detail/errors database-only routes use the verified-user TenantDatabaseContextInterceptor. The report route reads persisted errors inside a short user actor context and builds the workbook after that scope closes. The in-memory preview route and mixed upload/execute/retry routes remain deliberately unwrapped. ExportCatalog, upload/validate, execution transactions and remaining import DB writes still need phase-by-phase actor-context adoption.

## Remaining implementation priorities

1. Complete actor-context phase separation for CatalogImportService/ExcelExecutor: distinguish admin DB reads/writes from object-storage upload/download, workbook parsing, export/report generation and per-entity nested transactions; pass verified caller identity through all import routes.
2. Complete P13 operational principal separation across P13MonitorService, OpsAlertService, OpsControlService and PilotControlService (worker/system monitoring versus authenticated operator read/write).
3. Finish remaining source-backed raw SQL/function/trigger/partition, migration, bootstrap, CLI and helper-mediated R/I/U/D paths and per-operation ownership predicates.
4. Obtain actual API/migration runtime identities and protected read-only staging catalog evidence only through the authorized process.
5. Keep G-001 independent review and G-036 verification open. Phases 0–5 remain IN PROGRESS; Phase 6 remains NOT STARTED.

## Verification and safety

G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED. Run #1476: 9 lint/typecheck tasks succeeded, Mobile Flutter Tests succeeded, but the changed-file format check failed; the overall job and workflow failed. Run #1477 was automatically cancelled after a newer push. Run #1478 failed API typecheck on the previous source head because the worker-lease unit test still referenced an undeclared withActorContext variable; commit 5de17d1 fixes the fixture. No re-run was requested. Exact-head Actions lookup for 5de17d1 returned zero runs. Unit/integration/E6/build/release gates remain unverified/skipped unless a later run proves otherwise. No local tests, formatter, lint or typecheck were run by this session.

No shared database mutation, migration, grant/default-ACL change, RLS enablement, protected staging action, deployment, worker activation, merge or release occurred.

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

**Next work:** reconcile the complete G-002 operation inventory against all source callsites and exact table/ownership predicates; verify no actor-context switch occurs while a different actor transaction is active; finish the 99 Drizzle-exported / 114 detailed public relation / unresolved 116 historical count reconciliation; validate migration-backed FKs and obtain protected read-only runtime catalog plus actual API/migration runtime identity evidence through the authorized process. Add/adjust regression specs after implementation/integration is complete, then run the consolidated verification campaign. G-001 independent review and G-036 verification remain open; Phase 6 remains NOT STARTED.
