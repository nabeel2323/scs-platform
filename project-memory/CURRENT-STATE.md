# SCS Platform — Current State

**Live reconciliation date:** 24 November 2026  
**Repository:** [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform)  
**Branch:** remediation/phase-0-1-tenant-security  
**Latest source implementation group:** Orders rejection actor-context, merchant rejection refund actor attribution, and Merchant document download-presign separation. Key source commits: 7e2b2509292cfbcfe6f1f12ebae8d2fad25f8cf1 and 733b0570c9ae4e94a9684ff28b30cbd3f77ec038.  
**Latest test-source follow-ups:** 61489e264fbe5e15e332ba23c4947ea3120d9476 and ec2998abb0ff5fbb9208d66558b4dde309f672bc. Tests remain unexecuted.  
**Latest remediation documentation checkpoints:** 7663d692fd0f32a3760e07980b4a232e3ab900fb and project-memory sync f01fc1dfb05af8975d50739ccee7563db8e5bf95.  
**PR:** [#138](https://github.com/nabeel2323/scs-platform/pull/138), OPEN / DRAFT / UNMERGED, base develop.  
**Exact-head evidence before this current-state update:** GitHub Actions zero workflow runs; combined status zero contexts.  
**Standing user instruction:** complete implementation and cross-component integration first. Do not execute tests or trigger CI during implementation. Keep PR #138 draft/open/unmerged.

## Latest G-002 implementation checkpoint

- Orders merchant rejection scopes DB-only authorization, optional SUBMITTED auto-advance, stock release, optimistic REJECTED status transition, history and rejection outbox under the verified merchant actor. Stock release and rejection persistence share the same transaction.
- Refund request creation is a separate DB-only actor phase with stable per-order idempotency. The actual authenticated merchant identity is passed through; PaymentsService permits the MERCHANT_REJECTION reason only for MERCHANT_* callers whose order passes assertOrderAccessible. Payment-event actor attribution is MERCHANT, not a synthetic BUYER.
- This path creates a REQUESTED refund row, payment event and outbox record only. OutboxDispatcher currently logs generic events and marks them dispatched; it does not execute a payment-provider refund. Automatic refund-provider execution is outside the approved scope.
- Master-order recalculation and final read use a separate short actor context after rejection/refund request persistence.
- Merchant document download presigning scopes document/membership reads, calls object storage outside any DB transaction, then scopes storageUrl metadata persistence in a second actor context. Upload presign remains storage-only; document registration and organization/store listing are already scoped.
- Regression specs exist for rejection phase boundaries, merchant refund actor attribution, and Merchant presign transaction separation. None have been executed.

## Bounded authenticated HTTP and service adoption

- Payments: eight bounded GET handlers and four DB-only POST handlers use the verified-user interceptor. Refund request/approval/retry, proof upload and payment-provider operations remain outside the controller-wide actor interceptor by explicit decision.
- Orders: safe reads/preview/reorder and bounded lifecycle operations are scoped. Reject and cancel use service-level actor phases because post-commit/refund/outbox boundaries require narrower scopes. Actual checkout remains excluded.
- Merchant: store/warehouse/verification and document registration/listing are scoped. Download presign uses two short service actor phases around storage signing. Upload presign is storage-only.
- Worker, webhook, bootstrap, audit and realtime principals remain separately bounded as recorded in the G-002 operation map and progress tracker.

## Remaining implementation priorities

1. Continue the G-002 physical table/operation/ownership-predicate matrix and reconcile 99 Drizzle-exported tables versus 114 detailed public relations and the unresolved 116 count. Do not infer a two-relation delta.
2. Finish source review of service/controller/worker raw SQL, operation and principal paths. Preserve the external-I/O boundaries.
3. Obtain actual API/migration runtime identity and protected read-only catalog evidence only through the authorized staging process.
4. Keep G-001 independent review and G-036 verification open. Phases 0–5 remain IN PROGRESS; Phase 6 remains NOT STARTED.

## Verification state

No tests, formatter, lint, typecheck, E6 boundary check or GitHub Actions workflow was run for this implementation group. Exact-head Actions and status evidence must be re-queried at the start of the next session. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED; source adoption is not RLS verification.

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
