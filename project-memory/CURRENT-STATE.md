# SCS Platform — Current State

**Live reconciliation date:** 24 November 2026  
**Repository:** [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform)  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Exact branch head:** `836e06467228a8f7d6b34fff1c58bb33104f03a0` — `feat(identity): scope organization REST queries to actor transaction [skip ci]`.  
**PR:** [#138](https://github.com/nabeel2323/scs-platform/pull/138), OPEN / DRAFT / UNMERGED, base `develop`.  
**Exact-head GitHub Actions:** zero workflow runs; source commits intentionally include `[skip ci]`.  
**Exact-head preview status:** Vercel Web FAILURE and Vercel Admin FAILURE, both due to the external provider build-rate-limit page. These are not application-test results.

> **Standing user instruction:** complete implementation and cross-component integration first, then run tests. Do not execute test commands or trigger CI during implementation. Proceed autonomously without asking for approval for routine steps; group related changes and synchronize project memory.

## Current G-002 implementation checkpoint

The opt-in DatabaseService actor-context foundation is implemented in source:

- Typed principals: `anonymous`, `user`, `worker`, `system`, `bootstrap`, `audit`.
- Parameterized transaction-local PostgreSQL settings use `set_config(..., true)` for actor ID, actor role, active organization, actor kind and worker ID.
- AsyncLocalStorage routes existing `DatabaseService.db` calls through the transaction-bound Drizzle handle during an opted-in operation.
- Nested calls reuse the active transaction only for the same actor. Actor switching fails closed.
- The context scope is marked inactive after completion; detached async work that inherits the ALS store cannot query through a committed/rolled-back transaction.
- The interceptor is explicitly scoped, never global.

### Bounded controller adoption

The controller-level interceptor is now wired into:
- Notifications REST controller.
- Pricing controller.
- Store Membership controller.
- Promotions controller (also includes source-level store/org ownership enforcement for merchant operations).
- Reviews and Disputes controllers.
- Inventory controller.
- Analytics controller.
- Catalog Offer, Catalog Requests and Catalog Taxonomy controllers.
- Selected Admin read handlers (method-scoped).
- Cart controller.
- Returns controller.
- Organizations and Roles controllers.

Each adoption is restricted to JWT-authenticated request paths reviewed for bounded DB work. This is not universal coverage and does not make the project RLS-ready.

### Remaining uncovered paths

Other complex or separately authenticated paths remain outside this first rollout, including Auth/Profile, general Catalog import/upload and Merchant document/upload operations, main Orders/Payments, Shipping/carrier webhooks, bootstrap, deferred audit middleware writes, workers/schedulers, realtime sockets, CLI and migration execution. Each requires its own principal and transaction contract; do not apply the interceptor indiscriminately.

## Next implementation priorities

1. Complete bounded adoption for remaining authenticated HTTP controllers only after reviewing detached async work, streaming, external I/O, nested transactions and module provider wiring.
2. Define explicit service contexts for worker/scheduler, carrier webhook (only after credential authentication), bootstrap and deferred audit writes.
3. Finish the G-002 method-level physical table/operation/ownership matrix and reconcile the 114/116 relation inventory.
4. Obtain actual API/migration runtime identity and protected read-only catalog evidence through the authorized staging process.
5. Keep RLS, grants, ACLs, migrations, staging and deployment blocked until their independent design/review/authorization gates are satisfied.

## Verification state

No tests, formatter, lint, typecheck, E6 boundary check or GitHub Actions workflow was run for this implementation batch. The consolidated testing campaign is deferred until implementation and integration are complete. Do not mark G-002 VERIFIED from source implementation alone.

No shared database mutation, migration, grant/default-ACL change, RLS enablement, staging action, deployment, worker activation, merge or release occurred. PR #138 remains draft and unmerged.
