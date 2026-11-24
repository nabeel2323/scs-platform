# SCS Platform — Current State

**Live reconciliation date:** 24 November 2026  
**Repository:** [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform)  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Latest source checkpoint:** `7f56e5185cf1a7c7b6954845ca9151aac83c5ac6` — operation-scoped authentication and post-proof session phases plus eight bounded Payments GET actor contexts. Previous Identity checkpoint: `b939a335a5bc126241131ab48bb03c9ed3cfaea6`.  
**Latest test-only follow-up:** `c8405a33388731095ef08b64d744a36d7b079cd3` — corrected the Drizzle update-query mock used by the credential actor-context spec.  
**PR:** [#138](https://github.com/nabeel2323/scs-platform/pull/138), OPEN / DRAFT / UNMERGED, base `develop` (`f74eb588cc58fc99b105e749d39dbfbacb4f9775`).  
**Exact-head GitHub Actions:** zero workflow runs; source commits intentionally include `[skip ci]`.  
**Source-commit preview status:** Vercel Web SUCCESS and Vercel Admin SUCCESS on source commit `fe98b12f1f0ad9c6a24a48f02ceb5201c4cf3d4f`. These are preview statuses, not application-test results; recheck the live PR head because later documentation-only commits can leave preview contexts pending.

> **Standing user instruction:** complete implementation and cross-component integration first, then run tests. Do not execute test commands or trigger CI during implementation. Proceed autonomously without asking for approval for routine steps; group related changes and synchronize project memory.

## G-002 actor-context implementation checkpoint

The opt-in DatabaseService actor-context foundation is implemented:
- Typed principals: `anonymous`, `user`, `worker`, `system`, `bootstrap`, `audit`.
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
