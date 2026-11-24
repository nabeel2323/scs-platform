# SCS Platform — Current State

**Live reconciliation date:** 24 November 2026  
**Repository:** [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform)  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Exact branch head:** `c58202e4b3ca26471b60553a647e629c62e0770e` — `docs(remediation): record G-002 scoped actor context architecture [skip ci]`.  
**Latest source implementation checkpoint:** `0eccaf90847bce0ca8039b6874a2053ce1412445` — bounded Profile/device/session REST routes added to the actor-context allowlist.  
**PR:** [#138](https://github.com/nabeel2323/scs-platform/pull/138), OPEN / DRAFT / UNMERGED, base `develop` (`f74eb588cc58fc99b105e749d39dbfbacb4f9775`).  
**Exact-head GitHub Actions:** zero workflow runs; source commits intentionally include `[skip ci]`.  
**Exact-head preview status:** Vercel Web FAILURE and Vercel Admin FAILURE due to the external provider build-rate-limit page. These are not application-test results.

> **Standing user instruction:** complete implementation and cross-component integration first, then run tests. Do not execute test commands or trigger CI during implementation. Proceed autonomously without asking for approval for routine steps; group related changes and synchronize project memory.

## G-002 actor-context implementation checkpoint

The opt-in DatabaseService actor-context foundation is implemented in source:
- Typed principals: `anonymous`, `user`, `worker`, `system`, `bootstrap`, `audit`.
- Parameterized transaction-local PostgreSQL settings use `set_config(..., true)` for actor ID, actor role, active organization, actor kind and worker ID.
- AsyncLocalStorage routes existing `DatabaseService.db` calls through the transaction-bound Drizzle handle during an opted-in awaited operation.
- Nested calls reuse the active transaction only for the same actor; actor switching fails closed.
- The context scope is marked inactive after completion, so detached async work cannot query through a committed/rolled-back transaction.
- The interceptor is opt-in and controller/method-scoped, never global.

### Bounded authenticated route adoption

The current reviewed allowlist covers Notifications, Pricing, Store Membership, Promotions, Reviews/Disputes, Inventory, Analytics, Catalog Offers/Requests/Taxonomy, selected Catalog and Admin read handlers, Cart, Returns, Organizations/Roles, and 16 bounded Profile/device/session handlers. Promotion merchant operations enforce store organization/membership at the service boundary and normalize foreign detail access to not-found.

This is partial adoption, not universal coverage or RLS readiness. Auth/OTP, credential/password setup/change, file/import/upload, main Orders/Payments, carrier/shipping operations, bootstrap, deferred audit middleware writes, workers/schedulers, realtime sockets, CLI and migrations remain outside pending explicit principal and transaction contracts.

## Next implementation priorities

1. Continue bounded authenticated HTTP adoption only after reviewing each service call graph for nested transactions, detached async work, streaming, external I/O and module provider wiring.
2. Define explicit worker/scheduler, carrier-webhook (only after credential authentication), bootstrap and deferred-audit context contracts.
3. Finish the G-002 physical table/operation/ownership matrix and reconcile the 114/116 relation inventory.
4. Obtain actual API/migration runtime identity and protected read-only catalog evidence through the authorized staging process.
5. Keep RLS, grants, ACLs, migrations, staging and deployment blocked until independent design/review/authorization gates are satisfied.

## Verification state

No tests, formatter, lint, typecheck, E6 boundary check or GitHub Actions workflow was run for this implementation batch. The consolidated testing campaign is deferred until implementation and integration are complete. Do not mark G-002 VERIFIED from source implementation alone.

No shared database mutation, migration, grant/default-ACL change, RLS enablement, staging action, deployment, worker activation, merge or release occurred. PR #138 remains draft and unmerged.
