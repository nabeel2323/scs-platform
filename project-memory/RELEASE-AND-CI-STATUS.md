# SCS Platform — Release and CI Status

**Live reconciliation:** 24 November 2026  
**PR:** [#138](https://github.com/nabeel2323/scs-platform/pull/138) — OPEN / DRAFT / UNMERGED.  
**Branch:** `remediation/phase-0-1-tenant-security`.  
**Current head:** `836e06467228a8f7d6b34fff1c58bb33104f03a0`.  
**Exact-head GitHub Actions:** zero workflow runs; source commits use `[skip ci]`.  
**Combined status:** Vercel Web FAILURE and Vercel Admin FAILURE due to the external provider build-rate-limit page. These are preview statuses, not application-test evidence.

## Standing implementation-first instruction

The user explicitly requires implementation and cross-component integration to finish before tests are run. Do not execute test commands or trigger CI workflows during the implementation phase. Add/update test coverage as appropriate, but defer execution until the consolidated verification phase. Proceed autonomously through routine steps, group related changes into cohesive commits, and synchronize project memory. Fix concrete security/correctness defects immediately. Existing protected staging, shared database, no-merge, no-deploy, independent-review and release gates remain binding.

## G-002 source implementation checkpoint

The active source now includes:
- Typed actor contexts and transaction-local PostgreSQL settings through parameterized `set_config(..., true)`.
- AsyncLocalStorage-backed transaction-bound Drizzle routing for existing `DatabaseService.db` callers.
- Same-actor nested transaction reuse and an expired-scope fence against detached asynchronous work.
- Explicit controller/method-scoped adoption for Notifications, Pricing, Store Membership, Promotions, Reviews, Disputes, Inventory, Analytics, Catalog Offers/Requests/Taxonomy, selected Admin reads, Cart, Returns, Organizations and Roles.
- Merchant promotion mutations now carry caller context and enforce store organization plus active membership; foreign promotion detail access is normalized to not-found.

This remains partial coverage. No global interceptor is present. Auth/Profile, file/import/upload, main Orders/Payments, shipping/carrier webhooks, bootstrap, audit middleware, workers/schedulers, realtime, CLI and migration paths remain outside the current adoption pending explicit principal/transaction review.

## Verification phase policy

No tests, formatter, lint, typecheck, E6 or CI execution during implementation. When implementation and integration are complete, record the exact final SHA and run one consolidated campaign. Record every relevant job, skipped job, exact tested SHA and external preview status separately. Do not mark any finding VERIFIED from source implementation alone.

No RLS, migration, shared database grant/default-ACL change, staging action, deployment, worker activation, merge or release occurred.
