# SCS Platform — Current State

**Live reconciliation:** 24 November 2026  
**Repository:** [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform)  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Exact branch head at this checkpoint:** `a0e9c8c06dc7aeeb55d5c4e89eec6276816d87f0` — CarrierTrackingPoller DB phases now use a worker actor context.  
**PR:** [#138](https://github.com/nabeel2323/scs-platform/pull/138), OPEN / DRAFT / UNMERGED, base `develop`.  
**Actions:** no exact-head workflow run; implementation commits use `[skip ci]`. External Vercel preview statuses are not application test evidence.

> **Standing user instruction:** complete implementation and cross-component integration first, then run tests. Do not execute test commands or trigger CI during implementation. Proceed autonomously without asking for approval for routine steps; group related changes and synchronize project memory.

## G-002 actor-context foundation

DatabaseService has an opt-in `withActorContext` transaction primitive with typed anonymous/user/worker/system/bootstrap/audit principals, parameterized transaction-local GUCs (`app.actor_id`, `app.actor_role`, `app.active_org_id`, `app.actor_kind`, `app.worker_id`), AsyncLocalStorage-backed Drizzle transaction routing, same-actor nested reuse, actor-switch rejection and a closed-scope fence for inherited asynchronous work.

The shared interceptor is explicitly controller/method scoped, runs after guards, and derives user identity only from verified `request.user`. It is not global.

## Current bounded HTTP adoption

- Notifications, Pricing, Store Membership, Promotions, Reviews/Disputes, Inventory and Analytics.
- Catalog Offers, Catalog Requests and Catalog Taxonomy.
- 31 bounded CatalogController GET handlers (direct-response import-errors handler excluded).
- 29 bounded AdminController GET handlers (media-preview signing excluded).
- Cart and Returns.
- Organizations and Roles.
- 16 bounded Profile/device/session handlers (credential setup and password change excluded).

Promotions merchant create/list/detail/update/code-validation now carry verified caller context, enforce active organization/store membership at the service boundary, normalize foreign detail denial to not-found, and constrain updates by both promotion ID and authorized store ID.

## Current worker adoption

- `AutoCompleteWorker`: claim and per-order completion/release run under a unique `worker` actor context. Claim and completion use separate transactions; no external provider call is included.
- `OutboxDispatcher`: claim and status/retry acknowledgements run under a unique `worker` actor context. Event dispatch remains outside the transaction so a future event-bus/provider call cannot hold a DB transaction open.
- `CarrierTrackingPoller`: claim, tracking-event persistence, delivered-after-cancel exception writes, shipment status updates and the Orders delivery bridge run under a worker actor context. The external `provider.getTrackingInfo()` call and circuit-breaker interactions remain outside the transaction.
- `ReturnExpirationWorker`: remains outside actor context. An attempted wrapper was reverted to preserve lease/fencing and per-item transaction boundaries; redesign as short per-operation contexts only after reviewing lease semantics.
- `ShippingCarrierWorker`: remains outside actor context because it mixes DB reads/writes with external create/cancel/label/tracking calls. Future adoption must isolate short DB phases and never hold a transaction across provider or storage calls.
- `WorkerCountMonitor` has no database operations.

## Remaining uncovered paths

AuthController; Profile credential setup/password change; main Catalog import/upload and Merchant document/upload mutations; main Orders and Payments controllers; ShippingCarrierWorker provider phases; ReturnExpirationWorker lease/fencing operations; bootstrap; deferred audit middleware writes after response completion; remaining workers/schedulers; realtime sockets; CLI; and migrations. Carrier webhook context must be established only after credential authentication.

## Next implementation priorities

1. Finish the G-002 method-level table/operation/ownership matrix and reconcile the 114/116 relation inventory.
2. Design ReturnExpirationWorker context without wrapping the full batch or weakening its lease/fencing semantics.
3. Split ShippingCarrierWorker into short worker-context DB phases around external carrier and storage calls.
4. Define explicit carrier-webhook, bootstrap and deferred-audit context contracts; never establish webhook context before credential authentication.
5. Obtain actual API/migration runtime identity and protected read-only catalog evidence through the authorized staging process.

## Verification state

No tests, formatter, lint, typecheck, E6 boundary check or CI workflow has been run for the actor-context rollout. The consolidated verification campaign begins only after implementation and cross-component integration are complete. Do not mark G-002 VERIFIED from source implementation alone.

No shared database mutation, migration, grant/default-ACL change, RLS enablement, staging action, deployment, worker activation, merge or release occurred. PR #138 remains draft and unmerged.
