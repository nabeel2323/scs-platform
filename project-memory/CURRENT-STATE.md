# SCS Platform — Current State

**Live reconciliation date:** 24 November 2026  
**Repository:** [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform)  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Exact branch head at this checkpoint:** `78d0475a7fcdbea6aca848a46236e5f536a4a796` — actor-context route allowlist documentation.  
**PR:** [#138](https://github.com/nabeel2323/scs-platform/pull/138), OPEN / DRAFT / UNMERGED, base `develop`.  
**Actions:** no exact-head workflow run; source commits use `[skip ci]`. External Vercel preview statuses are separate from application test evidence.

> **Standing user instruction:** complete implementation and cross-component integration first, then run tests. Do not execute test commands or trigger CI during implementation. Proceed autonomously without asking for approval for routine steps; group related changes and synchronize project memory.

## G-002 transaction-context implementation

DatabaseService now exposes an opt-in `withActorContext` transaction primitive with:
- Typed principals: `anonymous`, `user`, `worker`, `system`, `bootstrap`, `audit`.
- Parameterized transaction-local PostgreSQL settings via `set_config(..., true)` for actor ID, role, active organization, actor kind and worker ID.
- AsyncLocalStorage-backed Drizzle transaction routing for existing `DatabaseService.db` reads.
- Same-actor nested context reuse; actor switching is rejected.
- An inactive-scope fence so detached asynchronous work inheriting the ALS store cannot query after commit/rollback.
- An explicit controller/method-scoped interceptor; it is not global.

## Current bounded HTTP adoption

- Notifications.
- Pricing.
- Store Membership.
- Promotions (merchant create/list/detail/update/code-validation now carry caller context and enforce active organization/store membership; foreign detail denial is normalized to not-found).
- Reviews and Disputes.
- Inventory.
- Analytics.
- Catalog Offers, Catalog Requests and Catalog Taxonomy.
- Selected Catalog read handlers (31 bounded GET routes; direct response/import error handler excluded).
- Selected Admin read handlers (29 bounded GET routes; media-preview signing excluded).
- Cart and Returns.
- Organizations and Roles.
- Bounded Profile/device routes (16 handlers); credential setup and password change remain outside because they perform credential/session security work.

Every adopted route is JWT-protected and reviewed for bounded request lifetime. No global transaction wrapper is installed. This is partial source coverage, not proof of RLS readiness.

## Remaining uncovered paths

AuthController; Profile credential setup/password change; general Catalog import/upload and Merchant document/upload operations; main Orders and Payments controllers; Shipping/carrier webhooks; bootstrap; asynchronous audit middleware writes after response completion; workers/schedulers; realtime sockets; CLI; and migration execution. Each needs a separately reviewed principal and transaction contract. Carrier actor context may only be established after credential authentication.

## Next implementation priorities

1. Complete remaining bounded HTTP integration only where service call graph, nested transaction, detached work, streaming, external I/O and provider wiring are reviewed.
2. Define explicit worker/scheduler, carrier-webhook, bootstrap and deferred-audit context contracts; never establish webhook context before credential authentication.
3. Finish G-002 method-level physical table/operation/ownership predicates and reconcile the 114/116 relation inventory.
4. Obtain actual API/migration runtime identity and protected read-only catalog evidence through the authorized staging process.
5. Preserve all no-RLS, no-migration, no-grants/default-ACL, no-shared-DB-write, no-staging-write, no-deploy, no-worker-activation and no-merge restrictions.

## Verification state

No tests, formatter, lint, typecheck, E6 boundary check or CI workflow has been run for this implementation rollout. The consolidated test/verification campaign begins only after implementation and cross-component integration are complete. Do not mark G-002 VERIFIED from source implementation alone.

No shared database mutation, migration, grant/default-ACL change, RLS enablement, staging action, deployment, worker activation, merge or release occurred. PR #138 remains draft and unmerged.
