
## Migration crosswalk continuity — 28 November 2026

- Compared all numbered migration tree blob SHAs between the crosswalk's recorded baseline `c37c4d94f728b2806e7efb59d0380adb24472597` and current `develop` `5356cd182cb41fc8f2266a0b75eb60056c43675d`.
- Both contain the same 77 numbered files `0001`–`0077`; no migration path or blob changed. Existing static migration object crosswalk remains applicable; no reason to repeat its full scan.
- This is not live catalog, migration ledger, owner, grant, default-ACL or RLS evidence. Keep those checks separate and authorized.


## Outbox caller-chain spot checks — 28 November 2026

- Reviewed the controller and service call paths for inventory, merchant verification, reviews, returns, commission reversal and settlement adjustments.
- Inventory controller has class-level tenant DB interceptor; merchant verification has endpoint-level interceptor; reviews and returns controllers have class-level interceptors. These handlers run within the awaited `DatabaseService.withActorContext` transaction scope.
- The refund finalization path passes its existing transaction client to commission reversal and to the `return.refunded` outbox write. Settlement adjustment creation passes its transaction client to the outbox writer. The sampled candidates are not confirmed actor-context gaps.
- Continue tracing publishers invoked by non-HTTP workers, schedules, listeners, detached callbacks and direct service invocations; this spot check is not a complete outbox audit.
- PR #181 remains open with Vercel previews rate-limited by the free-plan external service; no GitHub Actions checks surfaced. Do not retry previews or run redundant CI. Keep PR open until merge-check status is known.

---


## Direct PostgreSQL inventory follow-up — 28 November 2026

- Expanded the audit with `src/scripts/bootstrap-issue-token.ts` (explicit environment and production confirmation, verified TLS and role/ownership checks for production-like targets, bootstrap actor), `check-staging-merchant-bootstrap.ts` (guarded read-only staging verification), and `scripts/verify-migration-ledger.mjs` (read-only ledger verifier, optional CA, no explicit target/actor preflight in the reviewed file).
- The audit distinguishes direct connection constructors from helpers accepting a PoolClient; the latter are not separate connection entrypoints.
- Current audit PR #181 head is `ece78974f9c25d6f7accf79ef8aedf5ad124d1a4`. Inventory remains provisional pending exhaustive scan of all 648 API source files and helper/import call graph.
- Next: complete repository-wide direct connection search, trace production outbox publisher caller chains, finish migrations 0001–0077 ownership crosswalk, then one bounded source/test PR for verified gaps.

---

## Direct PostgreSQL entrypoint audit — 28 November 2026

- Read-only source audit recorded in `docs/remediation/G-002-DIRECT-POSTGRES-ENTRYPOINT-AUDIT-2026-11-28.md` on branch `docs/g002-postgres-entrypoint-audit-20261128` (initial audit commit `b444eff8a7e3e21a6d777654e0f42548bdfd17dd`).
- API runtime pool has stronger production-like identity/TLS startup gates than the standalone migration and seed CLIs. Migration identity diagnostics are currently non-fatal; migration runner CA verification is conditional on `PGSSLROOTCERT`. Platform and catalog seed CLIs likewise make CA optional and do not show the exact staging target/role preflight used by staging bootstrap tools.
- All five staging bootstrap scripts reviewed use shared fail-closed target, role, ownership and TLS verification and establish bootstrap actor context. Reset utility has a distinct explicit destructive target approval. Audit CLI is read-only and actor-attributed but its CA is optional. Local create-admin script is restricted to development/test.
- These are source-level assurance differences, not proof of an active insecure connection. No database was connected and no script was run.
- Outbox writer is intentionally non-polling; generic events remain pending. Publisher actor-context and transaction-nesting review remains open. Next: complete full Client/Pool call graph, trace each publisher through its caller chain, finish migrations 0001–0077 ownership crosswalk, then submit one bounded source/test PR for proven gaps.
- No staging/shared DB, migration, seed, reset, bootstrap, grant/default-ACL/RLS, Render, deployment, provider, credential, worker activation or release action occurred.

---

## PR #180 merged — 28 November 2026, 13:43 UTC

- PR #180 merged into `develop` by squash; merge commit `a56b77ba09a8e185c9ecdf8649d6602cb3a94143`; exact source head `d0c3639f0c3820fa44bbadbb9c8b62264cd62413`.
- Exact-head CI run #1748 / GitHub run `46147121948` passed all 10 mandatory jobs, including lint/typecheck/format, Flutter, API unit/coverage, PostgreSQL integration, Web/Admin, E6 boundary lint, isolated full migration apply, contract/codegen, build and container smoke. k6 and staging release were skipped.
- Six changed files (184 additions, 57 deletions) were integrated unchanged from PR #177 with the fixture typing correction. Strict helper behavior now reuses an existing actor only for an exact-org worker context; null-org user, mismatched worker and non-worker actor kinds are rejected. Separate null-org store-owner/webhook credential discovery and exact-org secret decryption scopes remain separate.
- PR #177 remains superseded/closed; no duplicate implementation was created. PR #138 remains OPEN/DRAFT/UNMERGED at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; preservation refs unchanged. PR #175 remains separate.
- New develop merge commit CI run #1750 (`46151002279`) was queued at checkpoint time; verify exact-head completion before another integration batch.

## Next tasks after merge

1. Complete read-only audit of every production `OutboxDispatcher.publish` caller: prove tenant/worker actor scope or explicit transaction-client propagation; map event writes to owning org/store.
2. Complete a repository-wide direct PostgreSQL `Client`/`Pool` entrypoint inventory, distinguishing runtime pool from dev/test bootstrap and migration advisory-lock clients.
3. Finish migration 0001–0077 crosswalk: tables, FKs, functions, triggers, partitions, object ownership, grants/default ACLs and tenant ownership predicates; reconcile against merged PRs #170–#180.
4. Batch only source-backed findings and focused tests; one consolidated exact-head CI for the next meaningful implementation batch.

No database, staging, Render, provider, credential, grants/default-ACL/RLS, worker activation, deployment or release operation was performed. Preserve the staging-release hold.

---

# G-002 continuation — 28 November 2026

## Integration completed

- Repository: `nabeel2323/scs-platform`; integration baseline: `develop`.
- PR #179, `fix(security): bind carrier poller and reconciliation writes to tenant org`, was reviewed and squash-merged into `develop`.
- Merge commit: `c05d491e59dc913bd69a5edf48965af81c2c1a9b`.
- Exact-head GitHub Actions run `46141594428` passed all 10 mandatory jobs: Mobile, Lint & Typecheck, Migration Full Apply, Unit/Coverage, Web/Admin, Boundary Lint E6, Integration Tests, Build, Contract Spec & Codegen, and Container Build & Smoke. k6 Smoke and Trigger Staging Release were skipped.
- PR #179 source review confirmed that global atomic claims/leases remain platform-worker operations; each claimed shipment resolves authoritative `stores.id → stores.org_id`, verifies `shipment.order_id → orders.store_id = shipment.store_id`, and performs per-shipment event/status/retry-outbox/delivery-bridge work in an exact-org worker context. Updates are constrained by shipment + store, and retry outbox events carry organization/store attribution.
- Vercel Web/Admin previews for the merge commit succeeded. No staging release, deployment, provider call, worker activation, DB/Render mutation, credential/grant/default-ACL/RLS change occurred.

## PR #180 — carrier credential actor-context hardening

- PR #180 is OPEN / DRAFT / UNMERGED; branch `implementation/g002-carrier-credential-actor-context-20261128`; base `develop` at `ea4792a3806309f0199973806d282bf82c460da5`; head `d0c3639f0c3820fa44bbadbb9c8b62264cd62413`.
- It carries forward the same six source/test files from PR #177 on top of the current `develop` baseline; this is a direct blob/tree integration, not a reimplementation. It includes the test fixture typing correction.
- PR #177's original exact-head run `46131141943` failed only at API typecheck: four assignments to a test double's `currentActorContext`, inferred too narrowly as literal `null`, in `carrier-configurations.service.spec.ts` lines 101, 114, 126 and 138. Lint and mobile passed; downstream jobs were skipped.
- Test-only correction: change the fixture initializer to `currentActorContext: null as any`. Fix commit on the old branch: `2274cf4f93ef95c23a616be84cb8812d86e738f9`; PR #180 carries the corrected file.
- No GitHub Actions run has been surfaced for PR #180's head yet. Its Web/Admin Vercel checks currently report external free-plan build-rate-limit failures; do not trigger redundant previews. Do not mark CI green or merge until mandatory exact-head Actions checks pass.
- PR #177 was closed as superseded by PR #180; its source branch was preserved. No reviewers requested.

## Protected integration and safety constraints

- PR #138 remains OPEN / DRAFT / UNMERGED at its protected source head; preserve its source branch and synchronized preservation ref unchanged. Never merge it wholesale, reset, force-push, delete or destructively rebase it.
- PR #175 (country/currency reference data) remains separate; do not fold it into G-002.
- PR #178 is merged at `9a885762f3040b2761b352e999d1ccc21b396931`; do not broaden it.
- Continue batching related source/tests and use one consolidated exact-head CI per meaningful integration batch. No reviewers are required.
- No staging release, Render mutation, deployment/restart, carrier provider call, worker activation, credential rotation, grant/default-ACL/RLS change or production operation without the separate authorization specified in `START-HERE.md`. Preserve the staging-release hold. The staging database has no production counterpart; do not describe anything as production.
- Staging migration authorization applies only to the documented forward migrations and does not authorize the separately controlled runtime role/TLS/RLS/grant/deployment changes.

## Next G-002 work

1. Finish PR #177 exact-head CI after the fixture typing correction; source review remains limited to the credential/configuration helpers and Aramex's two-stage null-org store-owner discovery → exact-org credential lookup. Preserve the separate transaction scopes; never switch actors inside an active transaction.
2. Continue the read-only webhook/outbox actor-context nesting and direct PostgreSQL Client/Pool entrypoint inventory.
3. Complete the migration 0001–0077 DDL/FK/function/trigger/partition/object-owner/default-ACL crosswalk and ownership predicates, reconciling against already merged PRs #170–#179 so no completed work is repeated.
4. Continue only with bounded, source-reviewed changes. Run one consolidated exact-head CI when the next related implementation/test batch is complete.
5. Keep all protected staging/runtime/deployment/provider/worker actions on hold unless separately authorized.


## Read-only continuation audit — 28 November 2026

- Carrier webhook flow is deliberately two-stage: a null-org worker context resolves exactly one credential (token-specific route, or a legacy provider route that rejects multiple active credentials); a separate worker context bound to `credential.orgId` decrypts the secret, resolves shipment ownership, updates webhook state and inserts retry outbox events. No actor switching occurs inside one transaction. The webhook payload's tenant IDs are not trusted.
- PR #177's strict credential/configuration helpers fit those callsites: an already-active context is reused only when it is a worker bound to the exact requested org, including null-org equality for the dedicated store-owner/credential-discovery path. Do not collapse the two-stage lookup.
- `AuditLogMiddleware` establishes a short-lived `audit` actor context in the response-finish callback; `AuditService.record` reuses the active context, or creates its own audit scope when invoked without one. This keeps deferred audit writes out of the completed request transaction.
- `WorkerLeaseService` uses `DatabaseService.withActorContext` for raw Drizzle SQL lease operations. The lease claim/renew/release/read operations are platform-wide worker operations; `forceExpire` is an explicit system actor path. Keep these separate from per-tenant business writes.
- Direct PostgreSQL application entrypoints confirmed in the reviewed API files: the runtime `Pool` in `DatabaseService.onModuleInit`, a separate development/test-only bootstrap `Pool` + `PoolClient` for migration/seed work, and the advisory-lock helpers in `migration-lock.ts` that consume a `PoolClient`. The runtime identity/TLS startup gate applies to the runtime pool; the dev/test bootstrap path is distinct. Complete a wider source-tree search before declaring the direct Client/Pool inventory exhaustive.
- `OutboxDispatcher` does not poll or mark events dispatched; it intentionally leaves events PENDING because no generic delivery adapter is configured. Its `publish` method accepts an optional transaction client and otherwise uses `this.db.db`; audit every production caller to prove that it runs inside a tenant/worker actor scope or passes the transaction client before relying on RLS or tenant attribution. No conclusion about its callers is made yet.
- No source, database, Render, provider, worker activation, credential, grant, default-ACL, RLS, deployment or release changes were made during this read-only pass.


## Payment refund outbox actor-context correction — 28 November 2026

- PR #181 now includes a focused source/test correction in `PaymentsController`: both `requestRefund` and `approveRefund` endpoints now apply `TenantDatabaseContextInterceptor`.
- Before the change, those routes called `PaymentsService.requestRefund` / `approveRefund` without a request actor transaction. The service methods persisted refund/payment state, payment events and corresponding outbox rows, but did not establish their own actor context. A tx client preserved atomicity only, not actor attribution.
- Existing nested paths remain compatible: `OrdersService.rejectOrder` already wraps merchant-rejection refund creation in the exact caller actor; return-driven refund creation is inside `ReturnsController`'s class-level interceptor. Same-actor nested scopes reuse the active transaction.
- A metadata regression test asserts both methods retain the interceptor. No runtime DB, staging, worker, provider, Render, deployment, credential, grants/default ACL or RLS action occurred.
- Continue tracing remaining non-HTTP publisher callsites and complete the direct Client/Pool inventory before declaring G-002 exhaustive. Do not infer a callsite for `expirePayment` or activate workers without evidence.


## G-002 current-source correction and CI — 28 November 2026

- Exact-head CI #1753 / run ID `46163157475` passed all mandatory jobs for the payment refund actor-context fix on PR #181. Vercel web/admin preview status remains externally rate-limited on the free plan; no retry was made. Staging release and all database/provider operations remain unapproved.
- Current `staging-bootstrap-safety.ts` is already fail-closed: exact staging database/approval, session/effective user equality, dangerous-role rejection, public table/schema ownership rejection and TLS verification via `pg_stat_ssl`. The five staging bootstrap scripts also require CA TLS and establish bootstrap actor context. The previous stale crosswalk claim about missing checks has been corrected; no additional helper code is justified.
- Current `CarrierTrackingPoller` and `CarrierReconciliationService` already use `resolveCarrierShipmentTenantContext` to resolve store org and verify order/store equality. Per-shipment mutations, events, delivery bridge and retry outbox rows use exact org-bound worker context; retries carry org/store metadata. Global atomic claims remain platform-worker lease operations. Corrected the preliminary contradictory crosswalk section; do not reimplement this already-present work.
- Remaining G-002 scope: complete generic OutboxDispatcher publish caller graph and exhaustive direct PostgreSQL constructor/import inventory. The API tree has 648 source files, but full content/blob scan has not completed; inventory remains provisional.
