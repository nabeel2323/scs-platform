# SCS Platform — Release and CI Status

**Live reconciliation:** 24 November 2026  
**PR:** [#138](https://github.com/nabeel2323/scs-platform/pull/138) — OPEN / DRAFT / UNMERGED.  
**Branch:** `remediation/phase-0-1-tenant-security`.  
**Latest implementation checkpoint:** `ff8e4aebee01631023fad76eec9a8d98c254108b` (Orders cancellation actor-context formatting follow-up); latest documentation checkpoint before this status sync `2cff7c0f6604d6918b00efb190abd96d301149e1`.  
**Exact-head GitHub Actions:** zero workflow runs; source commits use `[skip ci]`.  
**Last exact-head check before this documentation sync:** on `a18c705616c5b698219377e5f7119a4fcc50a8c0`, GitHub Actions returned zero workflow runs; Vercel Web was PENDING and Vercel Admin was FAILURE. These are preview statuses, not application-test evidence.

## Standing implementation-first instruction

The user explicitly requires implementation and cross-component integration to finish before tests are run. Do not execute test commands or trigger CI workflows during the implementation phase. Add/update test coverage as appropriate, but defer execution until the consolidated verification phase. Proceed autonomously through routine steps, group related changes into cohesive commits, and synchronize project memory. Fix concrete security/correctness defects immediately. Existing protected staging, shared database, no-merge, no-deploy, independent-review and release gates remain binding.

## G-002 source implementation checkpoint

The opt-in actor-context foundation provides typed principals, transaction-local PostgreSQL settings, AsyncLocalStorage-backed Drizzle routing, same-actor nested reuse and an expired-scope fence. Explicit controller/method-scoped adoption covers bounded authenticated surfaces in Notifications, Pricing, Store Membership, Promotions, Reviews/Disputes, Inventory, Analytics, Catalog Offers/Requests/Taxonomy, selected Catalog/Admin reads, Cart, Returns, Organizations/Roles, bounded Profile/device/session routes, selected Orders reads/preview/reorder/lifecycle actions, and bounded Merchant store/warehouse/verification operations.

Worker contexts cover OutboxDispatcher, AutoCompleteWorker, ReturnExpirationWorker, CarrierTrackingPoller and ShippingCarrierWorker. Carrier webhook processing uses a credential-scoped principal after credential/HMAC authentication. Bootstrap status/provisioning and operator token CLI use anonymous/bootstrap contexts. Deferred AuditLogMiddleware writes use an audit actor transaction. RealtimeGateway room authorization uses the verified socket actor. External provider/storage operations remain outside database transactions.

Remaining source-context work includes pre-authentication OTP/email-OTP login, password login, refresh-token rotation and logout (safe principal resolution is still undefined); remaining main checkout/reject/cancel payment phases; Merchant file/document storage operations; and any uncovered services. Authenticated credential setup/change, OTP-proven account linking/unlinking and organization switching now have bounded DB-only actor contexts. No global interceptor is present.

## Verification phase policy

No tests, formatter, lint, typecheck, E6 or CI execution during implementation. When implementation and integration are complete, record the exact final SHA and run one consolidated campaign. Record every relevant job, skipped job, exact tested SHA and external preview status separately. Do not mark any finding VERIFIED from source implementation alone.

No RLS, migration, shared database grant/default-ACL change, staging action, deployment, worker activation, merge or release occurred.

## 24 November 2026 — authenticated identity source checkpoint

Source commit `fe98b12f1f0ad9c6a24a48f02ceb5201c4cf3d4f` updates authenticated Identity/Profile DB-only operations and their controller/service regression coverage. Tests have not been executed. Exact-head GitHub Actions lookup returned zero workflow runs; Vercel Admin and Web status contexts are SUCCESS but are preview statuses, not application tests. The commit includes `[skip ci]` as required by the implementation-first phase.

Next identity work is pre-authentication principal resolution for OTP/email-OTP login, password login, refresh-token rotation and logout. Preserve the existing external-I/O boundaries. No formatter, lint, typecheck, E6, database, migration, grant, RLS, staging, deployment, worker, merge or release action was performed.

## 24 November 2026 — credential actor-context test-fixture follow-up

Test-only commit `c8405a33388731095ef08b64d744a36d7b079cd3` corrected the credential actor-context spec's Drizzle update-query mock to preserve `where().returning()` chaining. No production source changed in that commit. The test remains unexecuted; exact-head GitHub Actions remains at zero runs and Vercel Admin/Web SUCCESS are preview-only statuses.

## 24 November 2026 — pre-authentication actor source update

Source commit `4e9e04757e0ab5f6b3c7ac924240216de0b39d0f` adds an operation-scoped authentication actor and applies it to initial OTP/password account lookups and refresh/logout session lookups. This commit includes `[skip ci]`; no tests or Actions workflows were run. The authentication actor is not a grant or RLS policy. Post-proof session/device-credential DB phases remain unfinished.

## 24 November 2026 — Payments read-route context source update

Commit `7f56e5185cf1a7c7b6954845ca9151aac83c5ac6` adds the user actor interceptor to eight bounded Payments GET handlers. A controller metadata test was added but not executed. No payment/refund/provider/upload mutation, RLS, grant, migration, database, staging, deployment, worker, merge or release action occurred.

## Payments DB-only mutation route actor context — 24 November 2026

Source commit: `22f14b0e14bf8ca8ddd2eb578b59d3f3ae5f9b50`.

Added the verified user actor interceptor to four Payments POST handlers whose inspected service call graphs perform database transactions, append payment events and write outbox rows without calling payment/refund providers or object storage: COD cash confirmation, bank-transfer proof verification decision, settlement calculation and settlement-paid recording. Existing permission guards, service-level object/store authorization, row locks, optimistic state predicates and transactional outbox writes remain authoritative. The actor context wraps the complete awaited method; nested Drizzle transactions remain inside that scope.

Explicitly excluded: bank-transfer proof upload (object storage), refund request/approval/retry (refund lifecycle), payment-provider operations, checkout and order cancellation/rejection paths. The controller metadata test now covers 12 Payments routes (eight GET and four DB-only POST); it remains unexecuted.
No tests or CI were run; commit contains `[skip ci]`. No RLS/grant/migration/database/staging/deployment/worker/merge/release action occurred.


## 24 November 2026 — Merchant document metadata context source update

Commit `bccb8c569d122c7b1479881aa162fb428f264c4e` scopes only document registration and organization/store document listing under the verified-user actor context. Storage presign upload/download routes remain outside. The new controller metadata test was added but not executed. Exact-head Actions lookup returned zero workflow runs; combined status returned zero contexts. No tests, formatter, lint, typecheck or E6 were run. No RLS, migration, grants/default ACLs, shared/staging database writes, deployment, worker activation, merge or release occurred.


## Live exact-head status — 24 November 2026

At PR HEAD `2cff7c0f6604d6918b00efb190abd96d301149e1`, PR #138 remained OPEN / DRAFT / UNMERGED to `develop`. Exact-head GitHub Actions lookup returned zero workflow runs. Combined statuses: Vercel Web SUCCESS and Vercel Admin FAILURE with the external build-rate-limit URL. These are preview statuses only. Latest source implementation is `bccb8c569d122c7b1479881aa162fb428f264c4e`; no tests, formatter, lint, typecheck, E6 or CI were run during this implementation phase.


## Orders cancellation actor-context source update — 24 November 2026

Source commit `55910f043360b5e89103fd1ccbe5be6085a14e78`; formatting follow-up `ff8e4aebee01631023fad76eec9a8d98c254108b`. The DB-only cancellation phases use a verified-user actor context; realtime emission occurs after commit and post-commit recalculation/read use a second short context. Merchant rejection/refund and checkout remain excluded. Tests were added but not executed. Exact-head Actions lookup returned zero workflow runs; Vercel Web/Admin both reported the external build-rate-limit failure. No application test evidence is claimed.


## G-002 Orders rejection and Merchant document download-presign phases — 24 November 2026

- Merchant rejection uses the verified merchant actor for order authorization, optional SUBMITTED auto-advance, inventory settlement, optimistic REJECTED status transition, history and rejection outbox insertion. Inventory settlement receives the caller transaction, so stock movement and order status/history/outbox commit or roll back together.
- Refund-request creation runs only after rejection commits. It is a DB-only refund-record/event/outbox operation; the current generic outbox dispatcher only logs this event; no payment-provider refund is executed by this path. The rejection refund key is stable (reject-refund:<orderId>) rather than time-based, so retries reuse the same request. Failure remains non-fatal and logged.
- Master-order recalculation and final order read run in a separate short verified-user actor context. No request-wide interceptor was added to the rejection route.
- Merchant document download presigning uses one short actor context for document/membership reads, calls object storage with no DB transaction open, then uses a second short actor context to persist the signed URL. Both admin-reviewer and merchant-member routes pass verified JWT identity. Upload presigning remains storage-only; registration/listing retain their existing scoped handlers.
- Added Orders rejection and Merchant presign actor-context regression specs. They are authored but not executed under the implementation-first restriction.
- No tests, formatter, lint, typecheck, E6 or CI were run. No RLS, migration, grants/default ACLs, shared/staging DB writes, deployment, worker activation, merge or release occurred. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


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


## 24 November 2026 — latest continuation boundary

Source commit `6339acb944d3e41a6066e0f123394daa38d74491` adds the verified-user actor interceptor to the database-only Merchant verification-review route and extends its controller metadata regression spec. Subsequent documentation commits reconcile worker/socket actor-context evidence and expand the G-002 schema ownership matrix to all 100 module schema declarations (98 barrel-exported; two catalog-import declarations are not barrel-exported). The prior 99+15=114 decomposition is now historical, not a current source reconciliation.

Implementation-first instruction remains active: no tests, formatter, lint, typecheck, E6 or CI are run until implementation/integration is complete. No protected DB, RLS, migration, grant/default ACL, staging, deployment, worker activation, merge or release action is authorized. Verify live branch/PR/head/status before next action.


## 24 November 2026 — automatic workflow execution exception

- Run #1474 / `45376045168` (triggered by `fa9e554418f6b268bbab35208a8f35db48a41161`) completed: Mobile Flutter Tests SUCCESS, API Lint SUCCESS, API Typecheck FAILURE. New PaymentsService type errors were identified and corrected in `fc2993290d4522d397ab56934e41103f8dd9d060`; other failures occurred in interceptor, identity, shipping worker and integration-test files, baseline attribution unknown.
- Run #1475 / `45376830054` was automatically triggered by the type-fix commit and was IN_PROGRESS at the time of this update. No local tests or typecheck were manually run. The connected GitHub actions do not expose a workflow cancellation action.
- Implementation-first restriction remains: do not intentionally dispatch or rerun CI until implementation/integration completion. Vercel Web/Admin contexts remain build-rate-limited. PR #138 must remain OPEN / DRAFT / UNMERGED.
