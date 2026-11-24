# SCS Platform — Current State

**Live reconciliation:** 24 November 2026  
**Repository:** [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform)  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Exact branch head at this checkpoint:** `ab8317297fcf9c2dba2eaa5b9653251833da7a86` — operator bootstrap CLI transaction-local principal.  
**PR:** [#138](https://github.com/nabeel2323/scs-platform/pull/138), OPEN / DRAFT / UNMERGED, base `develop`.  
**Actions:** no exact-head workflow run; implementation commits use `[skip ci]`. Latest listed Actions runs are historical older SHAs. External Vercel preview statuses are not application test evidence.

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

## Current worker and system adoption

- `AutoCompleteWorker`: claim and per-order completion/release run under a unique `worker` actor context; each claim and completion uses a bounded transaction.
- `OutboxDispatcher`: claim and status/retry acknowledgements run under a unique `worker` actor context; event dispatch remains outside the transaction.
- `CarrierTrackingPoller`: shipment claim, tracking event persistence, delivered-after-cancel exception writes, shipment status updates and Orders delivery bridge run under a worker actor context. Carrier network calls and circuit-breaker operations remain outside transactions.
- `AuditLogMiddleware`: response-finish audit writes now open their own short transaction with an explicit `audit` actor; this avoids reusing an HTTP request transaction after response completion.
- `BootstrapService`: public status reads use an anonymous context; OTP authorization insertion and initial Super Admin provisioning use bootstrap contexts.
- `bootstrap-issue-token.ts`: the operator CLI sets a transaction-local bootstrap principal immediately after BEGIN, before advisory locking and database operations.
- `ReturnExpirationWorker`: remains outside actor context. An attempted wrapper was reverted to preserve lease/fencing and per-item transaction boundaries.
- `ShippingCarrierWorker`: remains outside actor context because it mixes DB reads/writes with external carrier and storage calls. It needs a per-phase DB/external-I/O split.
- `WorkerCountMonitor` has no database operations.

## Remaining uncovered paths

AuthController; Profile credential setup/password change; main Catalog import/upload and Merchant document/upload mutations; main Orders and Payments controllers; ShippingCarrierWorker provider/storage phases; ReturnExpirationWorker lease/fencing operations; realtime sockets; remaining workers/schedulers; CLI utilities other than bootstrap issue; and migration execution. Carrier webhook context must be established only after credential authentication.

## Next implementation priorities

1. Complete the method-level table/operation/ownership matrix and reconcile the 114/116 relation inventory.
2. Design ReturnExpirationWorker context without wrapping the full batch or weakening lease/fencing semantics.
3. Split ShippingCarrierWorker into short worker-context DB phases around external carrier/storage calls, using the validated credential/shipment organization only after authorization.
4. Define explicit carrier-webhook and realtime socket context contracts; never establish webhook context before credential authentication.
5. Obtain actual API/migration runtime identity and protected read-only catalog evidence through the authorized staging process.

## Verification state

No tests, formatter, lint, typecheck, E6 boundary check or CI workflow has been run for the actor-context rollout. The consolidated verification campaign begins only after implementation and cross-component integration are complete. Do not mark G-002 VERIFIED from source implementation alone.

No shared database mutation, migration, grant/default-ACL change, RLS enablement, staging action, deployment, worker activation, merge or release occurred. PR #138 remains draft and unmerged.
