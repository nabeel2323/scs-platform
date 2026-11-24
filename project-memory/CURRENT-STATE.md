# SCS Platform — Current State

**Live reconciliation date:** 24 November 2026  
**Repository:** [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform)  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Latest implementation checkpoint:** `ff8e4aebee01631023fad76eec9a8d98c254108b` — formatting follow-up for Orders cancellation DB-phase actor context (`55910f043360b5e89103fd1ccbe5be6085a14e78`). Merchant document metadata actor-context commit: `bccb8c569d122c7b1479881aa162fb428f264c4e`. Payments DB-only route checkpoint: `22f14b0e14bf8ca8ddd2eb578b59d3f3ae5f9b50`.  
**Latest source implementation commit:** `bccb8c569d122c7b1479881aa162fb428f264c4e`.  
**Latest documentation checkpoint before this status sync:** `2cff7c0f6604d6918b00efb190abd96d301149e1`.  
**Latest test-only follow-up:** `c8405a33388731095ef08b64d744a36d7b079cd3` — corrected the Drizzle update-query mock used by the credential actor-context spec.  
**PR:** [#138](https://github.com/nabeel2323/scs-platform/pull/138), OPEN / DRAFT / UNMERGED, base `develop` (`f74eb588cc58fc99b105e749d39dbfbacb4f9775`).  
**Exact-head GitHub Actions:** zero workflow runs; source commits intentionally include `[skip ci]`.  
**Last exact-head check before this documentation sync (a18c705616c5b698219377e5f7119a4fcc50a8c0):** GitHub Actions zero workflow runs; Vercel Web PENDING and Vercel Admin FAILURE. These are preview statuses, not application-test results; Admin failure is not an API test result.

> **Standing user instruction:** complete implementation and cross-component integration first, then run tests. Do not execute test commands or trigger CI during implementation. Proceed autonomously without asking for approval for routine steps; group related changes and synchronize project memory.

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
