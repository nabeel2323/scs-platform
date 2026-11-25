# G-002 Bounded Integration Manifest — 26 November 2026

## Purpose and source checkpoint

This manifest defines the bounded, reviewable extraction from PR #138. It is **not** approval to merge PR #138 wholesale, apply migrations, change staging privileges/RLS, activate workers, or deploy.

- Repository: `nabeel2323/scs-platform`
- Evidence branch: `remediation/phase-0-1-tenant-security`
- PR #138: open, draft, unmerged; latest checkpoint before this manifest commit: `57ac7271b394c11eb1108046224c6c66e30ea67b`
- Base branch: `develop`, currently `fde20420bbb759d2e562f9ff747c9e824ac58e25`
- Compare: diverged; source is 2,829 commits ahead and 3 behind, merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`
- Changed-path inventory: 1,938 total; 1,280 scratch paths (1,277 under `.m73b6-scratch/`, 3 under `apps/api/src/__tests__/scratch/`); 658 non-scratch paths. The 658 non-scratch paths are **not** all G-002 scope; unrelated web/admin/mobile and feature work must not be imported simply because it is on #138.
- Preservation ref must be kept identical to the PR source head using expected-SHA fast-forward updates.

## Extraction rule

Create one or more small integration PRs from a freshly refreshed `develop`. Select files by dependency and ownership, not by copying the PR tree. Reconcile each selected file against current `develop` and every overlapping focused PR. Do not cherry-pick the full #138 history or copy the 1,280 scratch paths.

## Candidate slice A — actor-context and runtime database foundation

Review and extract only the current, compatible versions of:

- `apps/api/src/common/database/database.service.ts`
- `apps/api/src/common/database/runtime-database-identity.ts`
- `apps/api/src/common/database/tenant-database-context.interceptor.ts`
- `apps/api/src/common/database/raw-query-result.ts`
- `apps/api/src/common/tenant-scope.ts`
- `apps/api/src/config/env-gate.ts`
- `apps/api/src/main.ts` (only module/interceptor registration required by the selected scopes)
- `apps/api/src/__tests__/unit/common/database-actor-context.spec.ts`
- `apps/api/src/__tests__/unit/common/database-authentication-context.spec.ts`
- `apps/api/src/__tests__/unit/common/runtime-database-identity.spec.ts`
- `apps/api/src/__tests__/integration/runtime-database-identity.postgres.spec.ts`

Preserve the opt-in design: server-verified user, authentication-operation, worker, bootstrap, system and audit actors; parameterized transaction-local `set_config(..., true)`; same-actor nested reuse; actor-switch rejection; detached-scope fencing; and strict production-like runtime DB role/TLS startup checks. Do not add a global request transaction.

## Candidate slice B — bounded application adoption

Select the controller/service/test groups only where the actor-context call graph has been reviewed and external I/O is kept outside DB transactions:

- Identity authentication operations and profile/organization reads.
- Catalog controller/service, catalog import, offers, requests and taxonomy.
- Inventory and store-membership operations.
- Pricing and promotions.
- Cart and bounded order read/lifecycle operations.
- Returns/disputes/reviews where the specific operation has a reviewed actor and ownership predicate.
- Notifications and OTP persistence.
- Admin reads explicitly approved for the selected scope.
- Realtime room authorization reads.

Do not treat this module list as blanket approval for every method. Keep method-level operation/ownership predicates, verified caller identity and tenant scope. Checkout/payment/provider/storage/Redis work must remain outside a DB actor transaction unless a separate DB-only phase has been isolated and reviewed.

## Candidate slice C — workers and webhook boundaries

- Auto completion: `apps/api/src/modules/orders/auto-complete.worker.ts`, its unit/PostgreSQL tests and the compatible #154 atomic completion implementation.
- Return expiration: `apps/api/src/modules/returns/return-expiration.worker.ts`, `returns.service.ts`, `worker-lease.service.ts`, lease constants and fencing tests. The worker principal must be the same through nested operations; the exact holder+epoch+expiry fence must be checked in the transition transaction.
- Carrier processing: `apps/api/src/modules/shipping/shipping-carrier.worker.ts`, webhook controller/routing/credential services and their tests. Preserve the credential-authenticated organization boundary and shipment→store→organization plus order/store consistency checks. External carrier calls, label download and object storage remain outside DB transactions.
- Carrier event finalization must require matching event ID, `PROCESSING` status and current `locked_by` worker for both acknowledgement and retry/failure updates. This source correction is in #138 head commit `d18a495433460902190bec23d0d39923cc7b346a`; its regression tests are authored but not yet run.
- Generic outbox: use PR #153's safe no-poller/no-false-ack behavior. Do not extract #138's log-only generic dispatcher. A real generic publisher requires explicit event ownership, delivery adapter, acknowledgement, retry and worker actor contracts before activation.

## Candidate slice D — operator, bootstrap and migration access

- Operator actor helper and its tests: `apps/api/infra/drizzle/operator-actor-context.ts`, bootstrap/seed/audit callsites and `apps/api/src/__tests__/unit/scripts/operator-actor-context.spec.ts`.
- Staging bootstrap guards and scripts: include only after source review and keep the explicit staging-target/approval guard before transaction or writes.
- Read-only access audit: `apps/api/scripts/audit-db-access.ts`, identity diagnostics and migration identity reporting.
- Migration runner: `apps/api/infra/drizzle/migrate-pg.ts`, local runner and advisory lock/identity helpers. Keep migration principal separate from application actor contexts.
- Do not run bootstrap CLI, issue a token, seed, reset or migration during extraction/CI preparation.

## Migration ledger disposition

| Migration | Integration decision | Required evidence before staging apply |
|---|---|---|
| 0070 privilege and function hardening | Keep one canonical #138 migration, including #145's `normalize_arabic` search_path postcondition. Exclude PR #145's duplicate standalone 0070. | Isolated PostgreSQL test; identify actual object owner/default-ACL authority; review role grants and rollback/recovery. No RLS is enabled by 0070. |
| 0071 auto-complete claim lease | Keep one canonical copy; #138 and #154 DDL are the same apart from comments. | PostgreSQL claim/reclaim/stale-owner concurrency tests and one migration ledger entry. |
| 0072 carrier webhook credential scoping | Source-only until historical relinking/detachment behavior and ambiguity handling are tested. | Isolated data fixture with unique, ambiguous, cross-org and mismatched-provider cases; preservation/export and rollback/recovery plan. |
| 0073 operations alert delivery claim | Source-only until concurrent claim and stale-claim behavior are validated. | PostgreSQL concurrency and lease recovery tests. |
| 0074 reconciliation tenant/version integrity | Source-only until supersession rewrites and uniqueness are validated against duplicate/cyclic/legacy histories. | Snapshot-based isolated tests, data reconciliation report and recovery plan. |
| 0075 payment proof upload intents | Source-only until upload/commit/cleanup races and object-reference protections are validated. | Isolated storage/DB failure tests, orphan cleanup safety tests and recovery plan. |

The migration runner holds a session advisory lock across the ledger/apply sequence and commits each migration with its ledger insert in one per-file transaction. Its `--dry-run` checks non-empty SQL only; it is not SQL parsing or migration validation. The sequence 0070–0075 is not one atomic transaction.

## Explicit exclusions

- All 1,280 scratch paths.
- PR #145's standalone duplicate 0070 migration.
- Duplicate PR #154 migration 0071; retain only one canonical migration.
- PR #138's log-only generic outbox dispatcher; use #153 behavior.
- PR #138's non-atomic order-completion implementation where #154's atomic implementation is selected; compose it with #138's worker actor context.
- Unrelated frontend/admin/mobile product features and any unrelated catalog/product work not required by G-002.
- Any broad merge, reset, force-push, destructive rebase or rewrite of PR #138 or its preservation branch.

## Consolidated verification campaign — deferred until integration is assembled

Run one consolidated campaign after slices A–D are reconciled and implementation is complete:

1. Focused unit suites for actor context, authentication context, tenant interceptor, operator helper, catalog/import mixed DB+external-I/O boundaries, return fencing, order auto-completion and carrier event ownership.
2. PostgreSQL integration suites for runtime DB identity, transaction lifecycle, migration lock, order auto-completion concurrency, return worker fencing, carrier webhook tenant routing and migration-specific data transformations.
3. API typecheck, lint and build.
4. Full required GitHub Actions CI on the exact integration PR head, plus independent review and protected staging approval where applicable.

Do not promote old CI runs, test source that has not been executed, or Vercel build-rate-limit failures into verification evidence.

## Current non-actions and blockers

- No tests, lint, typecheck, formatter, build or CI have been run for the current worker-fencing/test-fixture changes.
- The staging API runtime was previously observed using `postgres` with `BYPASSRLS=true` and TLS disabled. The code-side fail-closed guard is not deployed. Do not enable RLS or apply migrations until a dedicated non-owner/non-BYPASSRLS API role, verified TLS, migration identity and protected rollout are prepared.
- No database write, migration, grant/default-ACL change, RLS change, Render configuration/deploy/restart, worker activation, provider call, bootstrap/token issuance, production provisioning or PR merge occurred.
- PR #138 remains the preserved source-of-truth evidence branch, not a release branch.


## 26 November 2026 — crosswalk dependency

The initial FK-to-ownership source crosswalk is recorded in `docs/remediation/G-002-FK-OWNERSHIP-CROSSWALK-2026-11-26.md`. It covers shipping/carrier, payment proof, returns, settlements and reconciliation and identifies the remaining 75-migration and module coverage. It is partial source evidence; complete the remaining callsite and migration crosswalk before closing G-002.


## Final checkpoint — 26 November 2026

- PR #138 source head at this checkpoint: `e410bf44b272eafb8e762636b66877f9e0c4b230`; OPEN / DRAFT / UNMERGED, base `develop`, GitHub mergeable=false.
- Preservation ref `preservation/pr138-remediation-2026-11-25` is identical to this exact head (0 ahead / 0 behind).
- Changed paths: 1,940 total, 1,280 scratch, 660 non-scratch. The non-scratch set still contains unrelated work; the G-002 manifest selects only bounded dependencies.
- `develop` remains `fde20420bbb759d2e562f9ff747c9e824ac58e25` (correct exact SHA: `fde20420bbb759d2e562f9ff747c9e824ac58e25`); source is diverged 2,852 ahead / 3 behind from merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.
- Exact-head Actions has no runs. Combined statuses contain only Vercel Web/Admin build-rate-limit failures. Worker-fencing changes and all authored tests remain NOT TESTED / NOT CI-VERIFIED.
- No DB/catalog access, migration, grant/default-ACL/RLS change, provider/storage call, worker activation, bootstrap, deployment or merge occurred.


## 26 November 2026 — expanded migration and application source review

The source review now includes migration 0007 and 0012–0053, in addition to the previously reviewed 0001–0006, 0008–0011 and 0054–0075 groups. The repository contains 75 numbered migrations; the earlier static scan recorded 183 explicit REFERENCES clauses across 40 migration files. This is not a live catalog verification and does not close the full raw SQL/function/trigger/partition consumer audit.

New high-priority evidence gates:
- Analytics partitioning/retention (0013/0018) requires copy-count/checksum, partition coverage, pg_partman configuration and retention/recovery review before any migration approval.
- Typed attribute backfill (0053) logs progress every 500 rows but does not commit batches; preflight actual JSONB data volume and transaction/lock impact.
- Analytics event-count endpoint is globally aggregated without org predicate; confirm analytics:read is platform-only or scope it before tenant grants.
- Promotions redemption is called by OrdersService inside buyer actor scope, but the service method itself does not validate order buyer/store against the promotion; add a service-level lineage guard before treating it as a general internal API.
- Catalog import DB actor scopes and per-entity executor transactions were confirmed; storage/workbook operations remain outside DB actor transactions.
- ShippingService checks delivery zone/method store equality and driver eligibility checks org membership/role/assignment; carrier config and worker cross-parent checks remain as previously recorded.

The FK crosswalk and source-callsite inventory remain IN PROGRESS. Do not create the bounded release PR until method-level predicates, raw SQL consumers and develop-only commits are reconciled. CI remains deferred to one consolidated campaign after the bounded integration is assembled.


## 26 November 2026 — bounded integration Slice A created

Draft PR #157: https://github.com/nabeel2323/scs-platform/pull/157

- Branch: `integration/g002-actor-context-foundation`; base `develop` at `fde20420bbb759d2e562f9ff747c9e824ac58e25`; head `e3bc1ba21d67ec4947824acf278529e543487eb1`.
- Exactly 17 files, 1,040 additions / 43 deletions. PR is OPEN / DRAFT / UNMERGED and currently mergeable=true.
- The branch is based on current develop, so it retains the three develop-only commits: `9530d87` runtime identity diagnostics, `d800e5b` OTP delivery log redaction, and `fde2042` carrier outbox ownership. The copied runtime identity helper preserves the new develop diagnostic fields and adds public-table/schema ownership checks.
- Slice includes DatabaseService actor-context foundation, runtime DB identity fail-closed startup gate, tenant interceptor/scope helpers, env/OTP gates, required local migration/operator-context dependencies, and focused tests.
- Exact-head Actions lookup: no runs. Vercel Web/Admin statuses are provider build-rate-limit failures only. No tests, lint, typecheck, build or CI have run for PR #157.
- No SQL migration, RLS policy, grant/default-ACL change, DB role, Render configuration, worker activation, provider/storage action or deployment is included or performed.

The PR is intentionally draft. Application adoption, workers/webhooks and remaining operator/migration-runner work stay in separate bounded slices.


## 26 November 2026 — promotion and catalog-import lineage continuation

- Added a service-level promotion redemption guard. The redemption now requires an order and verifies the exact order ID, buyer ID, promotion store, promotion ID and recorded discount amount before writing the redemption row or incrementing the promotion counter. Source commit ab59c9b4019dcc6a0a306e604b7e32d139b1b14c; regression-test commit 53990e08318e0deb54b41bb258c76ce5e6e41713. The concurrent global/per-user redemption-limit race remains a separate open item.
- The CatalogImportService actor preflight hardening was added in commits f9bfccf3ac11b7fbb0904634845c24a31d7c805a, 0b14f11c3fd6f787baa73765da7310bb553b24c4 and 0f8586e9548a91ad4c56b410e60180ad080e6788. It validates the caller before upload storage writes and before execute plan mutation; a focused regression spec covers missing/blank identity.
- PR #138 remains OPEN / DRAFT / UNMERGED. Source and preservation refs were kept identical with expected-SHA fast-forwards after each deliberate commit. The live source head should be re-read before future writes.
- PR #157 current exact head is 77145bc6262aba99cf7fdbd45139382bebc44fa7, 19 changed paths from develop. CI run #1553 was cancelled after five successful jobs and is not a full pass; newer run #1554 is in progress. Vercel quota statuses are provider failures, not application CI.
- PR #158 is stacked on PR #157 at 2e57a2deed1efb5c02de05d23b7ec10b668271c0 and adds only IdentityService plus two focused test files for active organization membership and active organization claim/profile checks. No exact-head Actions run exists.
- All newly authored promotion/catalog-import tests remain unexecuted. No database/catalog writes, migrations, grant/default-ACL/RLS changes, staging mutation, storage/provider calls, worker activation, bootstrap, deployment or merge occurred.
- Next: complete source review of PR #157/#158 and their dependency relationship, inspect #157's active CI run, continue the FK ownership and raw SQL/function/trigger/partition audit, then prepare the next bounded application-adoption slice from refreshed develop. Keep worker/webhook and operator/migration slices separate; do not merge PR #138 wholesale.


## 26 November 2026 — live Slice A and exported-service follow-up

- PR #157 current head: 77145bc6262aba99cf7fdbd45139382bebc44fa7, OPEN / DRAFT / UNMERGED, mergeable=true. Exact-head Actions run #1554 is in progress. Lint/typecheck, Mobile, Web/Admin, E6 boundary lint and full migration apply passed; API integration and unit/coverage remain in progress. Do not dispatch duplicate CI.
- PR #158 is a stacked draft on #157 at 2e57a2deed1efb5c02de05d23b7ec10b668271c0 for active organization membership checks in identity claims/profile projection. No exact-head Actions run yet.
- PR #138 remains the preserved evidence source at f7894abe85b9e9c053e51a730dbfd1c51f6adf21; its preservation ref is identical. It remains draft/unmerged and has no exact-head Actions run.
- The CatalogImportService preflight actor validation and regression test are present on #138 but not yet tested or CI-verified. Treat this as a Candidate Slice B application-adoption dependency, not part of Slice A.
- Inventory, Pricing and Cart route spot-check: their HTTP controllers establish actor context and derive/verify user/store scope, but their modules export service classes. Internal consumers must be mapped before caller-optional InventoryService methods, controller-dependent PricingService authorization, or CartService ID-based helper contracts are changed.
