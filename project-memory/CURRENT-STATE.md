# SCS Platform — Current State

**Live reconciliation date:** 24 November 2026  
**Repository:** [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform)  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Exact branch head:** `108c60c668827065e6fcb29499860c8febdae984` — `feat(notifications): scope REST queries to actor transaction [skip ci]`.  
**Latest source implementation:** `108c60c668827065e6fcb29499860c8febdae984` — first controller-scoped transaction-context adoption.  
**PR:** [#138](https://github.com/nabeel2323/scs-platform/pull/138), OPEN / DRAFT / UNMERGED, base `develop`.  
**Exact-head CI:** none; commits use `[skip ci]`. Existing Vercel Web/Admin statuses are external provider build-rate-limit failures, not application test evidence. No tests have been run for the transaction-context changes.

> **Standing user instruction:** implementation first, tests afterward. Do not execute tests or trigger CI until implementation and cross-component integration are complete. Proceed autonomously through routine steps, group related changes, and synchronize project memory. This does not waive any security/release gate.

## Current implementation checkpoint

- Returns/Shipping module-boundary refactor: `93844d781ff50cd3ba325c0d9e3ffe209bc128cc`.
- G-002 transaction-context primitive: `464b1c857a113489822ba3345aabe59b0a0be4b2`. DatabaseService now exposes opt-in `withActorContext`, an AsyncLocalStorage-backed Drizzle transaction handle, typed anonymous/user/worker/system/bootstrap/audit actor contexts, parameterized transaction-local GUC setup (`app.actor_id`, `app.actor_role`, `app.active_org_id`, `app.actor_kind`, `app.worker_id`), same-actor nested reuse, actor-switch rejection and closed-scope fail-closed behavior.
- First HTTP adoption: `108c60c668827065e6fcb29499860c8febdae984`. A controller-scoped `TenantDatabaseContextInterceptor` is registered only on NotificationsController. Nest guards authenticate the JWT before interceptors; the interceptor takes `sub`, `role` and `activeOrg` from the verified request user and awaits the handler observable inside the transaction. The eight bounded notification/preferences/device-token endpoints are DB-only in their controller path; the service's internal notification-delivery entry points remain outside this interceptor.
- The interceptor is deliberately not global. No other HTTP controllers or workers are wired yet. Streaming/SSE, external-provider side effects, asynchronous audit-after-response, worker/system principals and nested transaction paths still need explicit review before wider adoption. No RLS policy, migration, grant or runtime configuration was changed.
- Tests are deferred and have not been executed.

## Highest-priority unfinished work

**G-002 — database access and tenant context (IN PROGRESS).** Continue a source-level transaction/handle escape audit and classify the next safe bounded controllers for explicit opt-in. Preserve a route allowlist; do not wrap the whole API globally. For each surface, confirm authenticated guard ordering, no streaming, no external provider action, no detached async task, no post-response audit dependency, and the intended active-org semantics. Review existing service-level transactions and raw SQL paths before adoption. Later test phase must prove transaction binding, nested savepoints, rollback, actor-switch denial, detached-task closure and pool reuse. Protected live API/migration identities and 114-vs-116 catalog reconciliation remain separate authorization/evidence gates.

Other open gates remain: G-001 independent security review; G-015 exact-head boundary verification and residual import remediation; G-036 focused security verification/independent review; remaining programme gaps and Phase 6 consolidated verification. Phase 6 has not started.

## GitHub and verification state

- PR #138 remains OPEN / DRAFT / UNMERGED to `develop`.
- Current head has no Actions run; source commits intentionally use `[skip ci]`.
- No staging deployment, protected audit approval, shared DB write, migration, grants/default-ACL change, RLS enablement, worker activation, merge or release occurred.

## Next-session procedure

Read START-HERE and authoritative G-002/programme documents; verify live GitHub again. Continue implementation and integration without running tests or CI. Expand controller-scoped adoption only to source-reviewed bounded routes; never turn it into an unreviewed global transaction. Update this file and the work log after each meaningful group.

---

