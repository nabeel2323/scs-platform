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
