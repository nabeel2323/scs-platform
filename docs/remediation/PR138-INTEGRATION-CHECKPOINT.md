## G-002 runtime identity and actor-context audit — 28 November 2026

- The application runtime identity guard in `DatabaseService.onModuleInit` rejects production-like runtime sessions that are superuser, BYPASSRLS, CREATEROLE, CREATEDB, own public tables/schema, or lack verified TLS. The source includes a dedicated non-secret identity diagnostic query.
- `DatabaseService.withActorContext` is transaction-bound and uses transaction-local `set_config(..., true)`, but it is explicitly opt-in. `TenantDatabaseContextInterceptor` is also explicitly opt-in, not global; it requires JWT-authenticated request context and revalidates active organization membership inside the same transaction. `AppModule` currently registers AuditLogMiddleware, not this interceptor globally.
- Therefore, do not assume all API routes have database actor context. Continue a route/service callsite inventory and test coverage audit before RLS or runtime-role changes. Include raw SQL, worker, auth, bootstrap, migration, audit and realtime paths.
- Supabase PostgreSQL logs over the inspected last 24 hours showed only the MCP management connection as `postgres` (`application_name=mgmt-api`) plus a `supabase_admin` connection; no `scs-api-staging`/Render application connection was visible. This does not prove the API runtime identity. The live Render service configuration must be inspected to verify the deployed API and migration credentials and TLS.
- The only listed Render workspace is `My Workspace`; a workspace selection is required before reading the staging service's Render configuration. Do not guess the workspace or mutate the service.
- Supabase currently reports PostgreSQL `17.6.1.166`. The current Supabase changelog notes the 17.11 minor release includes security fixes; schedule an upgrade review and downtime/reindex assessment rather than initiating an upgrade blindly.
- Staging DB migration authorization does not authorize RLS activation, runtime credential rotation, Render env changes, service restarts, or deployment. Those require the complete access matrix and a separate controlled rollout plan.

## Staging database authorization and latest state — 28 November 2026

- The user confirms **no production database exists or is provisioned**. Do not describe any environment as production or claim production readiness/verification.
- The user explicitly authorizes source-reviewed changes and forward migrations on the SCS staging database to improve migration cleanliness, schema quality, security and readiness for the future production database. Preserve useful staging data; do not reset/truncate or seed demo data. Destructive changes still require careful preflight and a reversible plan.
- Confirmed staging DB: Supabase project `SCS-PlatForm`, ref `wplsxxevoevzqbgtpctw`, region `eu-west-1`, PostgreSQL `17.6.1.166`. Render hosts the `scs-api-staging` service; this is not a Render PostgreSQL database.
- Applied repository migrations 0072–0077 to staging on 28 Nov 2026 in one transaction, protected by the repository advisory-lock key. The application's `public._migration_log` now contains 77 entries through `0077_carrier_webhook_legacy_manual_review.sql`. Full preflight and post-apply evidence: [Staging database migration reconciliation](../docs/remediation/STAGING-DATABASE-MIGRATION-2026-11-28.md).
- Post-apply checks confirmed credential-scoped webhook FK/indexes, updated ops-alert index, organization-scoped reconciliation version uniqueness, payment-proof upload-intent table and API-role privilege revocation. No webhook/reconciliation history rows were rewritten; existing ops alert was RESOLVED.
- The SQL session used for the staging migration reported `current_user=postgres`, `rolbypassrls=true`, `rolsuper=false`. This is the MCP session identity, not proof of the Render API runtime identity. Verify the actual deployed API and migration-runner roles and TLS independently.
- `anon` and `authenticated` now have no table privileges on public tables; RLS remains disabled on all 115 public tables pending least-privilege runtime role and per-table actor/tenant policy design. Do not enable RLS wholesale.
- Remaining advisor findings: `pg_trgm` is in `public` and owned by `supabase_admin`; 55 unindexed FKs, one pg_partman template table without a primary key, and 275 unused-index observations. Do not mass-move extensions or create/drop indexes without ownership and workload evidence.
- Staging DB changes are authorized. Production DB creation/changes, application deployments/restarts, provider calls, worker activation and staging/production release remain separate actions and are not authorized by this database instruction.
- Do not dispatch the protected staging audit or release workflows automatically. Keep changes grouped and run one consolidated exact-head CI after source implementation is complete.

## Current continuation — 28 November 2026

**Live repository state (verified 28 Nov 2026):**
- Repository: `nabeel2323/scs-platform`; integration baseline: `develop`, source baseline before the documentation-only handoff updates was `2f6bb106e7147b83cdcc98ad93b4ef688e163e84`; the current `develop` tip includes only the subsequent project-memory documentation commits.
- PR #170 and #171 are MERGED. PR #173 (carrier configuration/provider credential binding) and PR #174 (bootstrap CLI database identity and actor context) are also MERGED.
- PR #138 remains OPEN / DRAFT / UNMERGED at `81f30f5c30654b233ef373c15fd3f2cb867aba01`. Preserve the source and synchronized preservation ref; never merge it wholesale, reset, force-push, delete or destructively rebase it.
- Latest develop CI run #1723 / `46085878528` targets prior develop head `4c5c755571385b346902c74c9f4f0578f48d9433`. All ten mandatory jobs passed, including Build and Container Build & Smoke. k6 Smoke and Trigger Staging Release were skipped. Run conclusion SUCCESS.
- PR #173 exact-head run `46077477944` and PR #174 exact-head run `46080913174` completed SUCCESS. The prior develop run `46080692700` also completed SUCCESS.
- Vercel Web/Admin contexts currently show external free-plan build-rate-limit failures. Do not trigger redundant Vercel builds.
- Open PRs currently include #138 (protected remediation source) and #175 (unrelated draft country/currency reference-data work). Keep #175 separate from G-002 and do not merge it as part of this remediation. No GitHub reviewers are required or should be requested.

**Next implementation priority — G-002 (continue from merged develop):**
1. Complete the source inventory for raw SQL and database functions/triggers/partitions; verify each sensitive operation's exact ownership predicate.
2. Finish the FK-to-tenant ownership crosswalk and actor-context nesting audit across worker, migration, bootstrap/CLI, carrier credential lifecycle/retry/recovery, audit middleware and realtime paths.
3. Reconcile the new PR #173/#174 implementations against the G-002 evidence matrix; do not repeat already merged work.
4. Keep protected read-only catalog/runtime identity verification separate and use only the authorized staging process. Do not dispatch protected audit workflows automatically.
5. Once the grouped source/test batch is complete, run one consolidated exact-head mandatory CI campaign. No per-file CI, no unnecessary Vercel builds.

**Hard safety boundaries remain unchanged:** no staging/production DB writes or migrations; no RLS/grant/default-ACL changes; no provider calls or worker activation; no Render mutations, deployments, restarts or releases; no staging-release workflow dispatch. Do not prepare/apply the dedicated least-privilege API/migration role or TLS rollout until role ownership, actual migration identity, rollback and TLS evidence are verified and separately authorized. Preserve the staging-release safety hold. Never weaken tenant/actor guards or relax state-machine rules to satisfy stale tests.


# Post-merge continuation checkpoint — 27 November 2026

## Current repository state

- PR #170 is **MERGED** into `develop` at `d078fe0124ac04fb0da3fc26f3ff02306c45a33f`. Tested implementation head `5ba67eb00810d4419b0dfb901596a1eb948b8595` passed all ten mandatory CI #1707 jobs (run `46048745793`); only documentation updates followed before merge. k6 and staging-release jobs were skipped.
- PR #138 remains **OPEN / DRAFT / UNMERGED** at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; source and preservation branches remain identical. It is recovery/source material only. Never merge it wholesale, force-push, reset or delete either ref.
- Active bounded follow-up branch: `remediation/g002-post-merge-followups-2026-11-27`, created from post-merge `develop`.

## G-002 follow-up batch authored (verification pending)

- `.github/workflows/db-access-audit.yml` checks out `${{ github.sha }}`, the immutable revision selected for workflow_dispatch, rather than always checking out `develop`. The protected `staging` environment remains required; this workflow has NOT been dispatched.
- `apps/api/infra/drizzle/migrate-pg.ts` records non-secret session/effective migration identity metadata from the exact PoolClient used by the migration runner. It also validates the historical 0013/0018 analytics ledger relationship and verifies pg_partman retention state before trusting those ledger rows. Diagnostics are non-fatal; inconsistent migration state fails closed before new migrations apply.
- `apps/api/src/__tests__/integration/migration-lock.postgres.spec.ts` covers migration identity metadata and session advisory-lock serialization/release using disposable PostgreSQL. It reuses the canonical lock helper under `src/common/database`.
- No staging/production database writes, migrations, grants/default-ACL/RLS changes or protected workflow dispatch occurred. CI for this branch has not yet run.

## Reconciliation decisions

- Preserve newer `develop` code for DatabaseService's lazy actor-context storage, tenant scope/interceptor, safe non-polling OutboxDispatcher, request-log/OTP redaction, catalog-import actor-context boundaries and Orders schema. PR #138's versions of these files are stale or regress current safeguards; do not copy them back.
- Migration 0070 filename collision is already resolved in merged `develop`: G-020 search_path guard remains in develop's 0070; privilege/default-ACL revocations are isolated in 0076. Do not reintroduce PR #138's combined 0070. Keep develop's 0071 claim-lease DDL.
- Exclude all scratch artifacts, test-token.txt and the bootstrap-token issuer.

## Next work

1. Complete G-002 source inventory: raw SQL, functions/triggers/partitions, exact operation ownership predicates, FK-to-tenant crosswalk, and worker/bootstrap/CLI/audit/realtime actor-context nesting.
2. Review the protected read-only audit path and capture the actual migration identity only through its authorized staging environment. Do not dispatch it automatically.
3. Prepare the dedicated least-privilege API/migration role and verified TLS rollout. Historical Render evidence reports API `postgres`, BYPASSRLS and TLS disabled; RLS is ineffective under that identity. Do not deploy the fail-closed runtime guard or apply RLS/grant migrations until role ownership, migration identity, rollback and TLS are verified.
4. Finish grouped source/test changes, then run one consolidated exact-head CI campaign. No per-fix CI, reviewers or redundant Vercel builds.

# PR #138 Integration Continuation Checkpoint

**Updated:** 2026-11-26 UTC  
**Repository:** `nabeel2323/scs-platform`

## Current branch and pull request state

- PR #170 is **OPEN / DRAFT / UNMERGED**, targeting `develop`.
- Integration branch: `integration/pr138-bulk-remediation-2026-11-26`.
- Exact integration head: `1102f9baca40364b02c4fce6d3766b5cdb8dcd2b`.
- The integration branch is **44 commits ahead and 0 behind** `develop`; merge base is `118174a644a197d72a033c22f0ee5af430617f44`.
- The latest develop-only change disabled the automatic staging-release job (`if: false`) pending separate owner authorization. The integration branch already contained the exact same `.github/workflows/ci.yml` content. A two-parent merge commit connected the histories without changing the integration tree.
- GitHub reports the PR mergeable after recalculation. This is not test evidence or merge authorization.

## PR #138 preservation

- PR #138 remains **OPEN / DRAFT / UNMERGED** and is source/recovery material only.
- Source branch `remediation/phase-0-1-tenant-security` and preservation branch `preservation/pr138-remediation-2026-11-25` are identical at `81f30f5c30654b233ef373c15fd3f2cb867aba01`.
- Never merge PR #138 wholesale. Continue integrating only reconciled, bounded changes through PR #170.

## Verification state and remaining gates

- No exact-head GitHub Actions workflow run is associated with integration head `1102f9baca40364b02c4fce6d3766b5cdb8dcd2b`. The historical run #1617 is diagnostic only; it does not validate this head.
- Current reported Vercel status contexts for the latest head are failing due to the team's free-plan deployment quota (`api-deployments-free-per-day`). These are preview-provider failures, not application test results. Do not trigger additional Vercel builds.
- The previously identified grouped test work remains unverified: API actor-context/Drizzle fixtures, shipping/carrier tenant-context fixtures, bootstrap/outbox expectations, and Web/Admin recovery/navigation/Product Studio regressions (including merchant returns and progress disabling).
- Continue source review and grouped corrections. Do not run per-file CI. When the remaining concrete mismatches are resolved, run one consolidated mandatory exact-head CI campaign.
- No local tests have been executed by the connected GitHub tooling.

## Safety and operating instructions

- Do not merge PR #170 until exact-head mandatory CI passes and the user separately authorizes the staging-release/migration step.
- The automatic staging release on pushes to `develop` is currently disabled; the dedicated release workflow still requires separate authorization.
- Do not perform staging/production DB writes, migrations, RLS/grant/default-ACL changes, provider calls, worker activation, Render changes, deployments, restarts, or releases without separate authorization.
- No GitHub reviewers are required or should be requested.
- Keep related changes grouped into as few commits and CI runs as practical. Keep this checkpoint and PR description current.

## Additional grouped Web regression correction

- Commit `bb5a0e9137b7fcb29a679b1c144b9fbda374a757` disables Product Studio's Previous control while a save is in progress or after a successful save. This aligns the footer navigation lock with the progress-step buttons and Next/Save controls.
- The existing `product-studio-progress.test.tsx` covers sequential step access and disabling all progress buttons during save. The footer Previous-button change has not been executed in a local test environment; include it in the consolidated exact-head Web/Admin test run.


## 2026-11-27 CI repair batch 2 checkpoint

- Candidate follow-up fixes reviewed against exact-head run #1621. Web/Admin failures: permission-dependent hydration landmark and quote-normalization mismatch. API failures: actor-context test wrappers, M7.1 test-only shipping eligibility injection, M7.2.2 unsupported INACTIVE membership state, checkout currency fixture rows, catalog canonical/private fixture collision, and webhook dedup tests that predate migration 0072 credential scoping.
- Follow-up batch is being assembled as one commit on `integration/pr138-bulk-remediation-2026-11-26`; it must be validated on its exact commit SHA before PR #170 can be considered merge-ready.
- Keep staging-release predicate hard-disabled. Do not merge PR #138 wholesale; it remains the preserved source/recovery branch. PR #170 stays draft. No deployment, staging/prod DB writes, Render edits, or reviewer requests.


## Consolidated fixture repair checkpoint — 27 November 2026

- Reviewed exact-head CI run #1659 (run ID 45914688537) on code head `a39acd446767d071eea2b175d1341897c9c6b3e4`. Lint/typecheck, Flutter, Web/Admin tests, migration full apply and E6 boundary lint passed; API integration and Unit/Coverage failed. Staging release was skipped. Historical CI is diagnostic only for later commits.
- The run exposed missing explicit CallerContext arguments in transaction-lifecycle accept/partial-accept tests, misplaced DatabaseService.withActorContext mocks in OrdersService unit tests, and a checkout MOQ test that changed product.moq while the current contract validates the selected merchant offer's MOQ.
- Grouped corrections pushed to the integration branch (all use `[skip ci]` to avoid premature duplicate CI):
  - `2b9cc406aafd36c0414399bbce21663a377c3f35`: place actor-context wrapper on the DatabaseService mock in OrdersService unit tests.
  - `526cf957bf4b1810737021681546408a31e9a96b`: pass the explicit caller context to acceptOrder and partiallyAcceptOrder in transaction-lifecycle integration tests.
  - `00375d43f5f206f1d5807eb089fabd5fc7aff6a5`: align the checkout MOQ fixture's initial and locked merchant-offer snapshots with the tested MOQ.
- No local test runner is available through the connected GitHub tooling. These changes are not claimed as passing; they remain VERIFICATION_PENDING until the next consolidated exact-head CI.
- The same CI log still reports further failures in delivery-exception/RTS integration tests, carrier reconciliation race tests, Product CRUD tenant fixtures, and catalog/order unit fixtures. Continue source-level grouping; do not waive tenant/actor guards or rerun per-fix CI.
- PR #138 source and preservation refs were re-compared and remain identical at `81f30f5c30654b233ef373c15fd3f2cb867aba01` (0 ahead / 0 behind). PR #138 remains OPEN / DRAFT / UNMERGED; never merge it wholesale.
- PR #170 remains OPEN / DRAFT / UNMERGED against `develop`. No staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, Render mutations, deployments, restarts, releases or reviewer requests were made. Keep the staging-release safety hold disabled.


## Live continuation checkpoint — 27 November 2026 (shipping fixture batch)

- Reviewed the API integration failures recorded by CI #1659 (run ID `45914688537`), which ran on the older code head `a39acd4`. Its API integration and Unit/Coverage failures are diagnostic only for later commits; no workflow run is associated with the current branch head.
- The M7.3-B.4 delivery-exception and M7.3-B.5 RTS PostgreSQL suites call `OrdersService.assignDriver` during setup. The production method intentionally fails closed when the optional ShippingService collaborator is absent. Both test suites now inject a narrow eligibility stub for their seeded driver; they do not test shipping eligibility itself:
  - `fb6de7e4ce1305ce2da121f411eddc5939e9e81d` — RTS suite.
  - `c80e652e708e4d523169eaf9a741bdb44edc0dc9` — delivery-exception suite.
- Tracker update: `c1c993c8a96bc08ee0a93f5894f4a9b8a9f167b4`. Handoff refresh: `52f2326528dfe5ca60f6332be3de74b5e274f299`.
- Current PR #170 head will advance with this checkpoint documentation commit. It remains OPEN / DRAFT / UNMERGED against `develop`; GitHub's mergeable flag is not test evidence or authorization. The integration branch remains 0 commits behind `develop`; latest compare previously reported 117 commits ahead. PR #138 source/preservation refs remain identical at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; never merge PR #138 wholesale.
- No local tests were run. These fixes remain UNVERIFIED pending one consolidated exact-head mandatory CI campaign after remaining concrete API fixture mismatches are source-reviewed and grouped. Do not dispatch per-fix CI or additional Vercel builds.
- Keep staging-release disabled. No staging/production DB writes, migrations, RLS/grant/default-ACL changes, provider calls, worker activation, Render mutations, deployments, restarts, releases or reviewer requests.


## Follow-up unit fixture correction — 27 November 2026

- Source-reviewed the historical Unit/Coverage failure in `m73c-inventory-return.spec.ts`. The cancelled-order case omitted the shipment's matching store lineage in its overridden order fixture, causing the production preflight to correctly fail as “Shipment not found” before the intended CANCELLED-state assertion.
- Added the matching `storeId` in test-only commit `5cb4d044ea1a8a121b33a3c78238ff13a7b75d7d`. No production code or tenant guard changed.
- Recorded in the implementation tracker commit `ae0a08d255992400b5b6bb852bdfb3f8fb4a13ca`. No local tests or CI were run; the correction remains unverified. Continue grouped source review and reserve CI for one consolidated exact-head run.


## Buyer confirmation atomicity repair — 27 November 2026

- Production defect found while investigating the API Unit/Coverage failure: `confirmDelivery` wrote `buyerConfirmedAt` outside the completion transaction. A later shipment/history/outbox failure could leave a DELIVERED order with a committed confirmation timestamp.
- Commit `3aa3358e5d213876988bcfe4f20930237873b2b5` moves confirmation into `completeOrder`'s transaction and adds a `buyerConfirmedAt IS NULL` compare-and-set predicate for buyer-confirmation source. A losing concurrent confirmer rereads the order and returns the completed projection if the winner committed.
- Existing regression test checks the intended rollback boundary; not executed locally. Fix remains UNVERIFIED pending consolidated exact-head CI.
- Test-only privileged RTS admin fixture was also aligned in commit `3151fc2f460a72fc0b1ef720360618c6093f4e2c`: retain shipment/store lineage, use another org to exercise privileged bypass. No production authorization logic changed.


## API transactional and fixture repair batch — 27 November 2026

- Fixed a real completion atomicity defect in `OrdersService.confirmDelivery`: buyerConfirmedAt previously committed before the completion transaction. Commit `3aa3358e5d213876988bcfe4f20930237873b2b5` moves the timestamp into the same transaction as DELIVERED → COMPLETED and adds a null timestamp compare-and-set. Concurrent confirmations retain idempotent success when another request completes first.
- Grouped test-only fixture repairs: RTS privileged-admin lineage (`3151fc2f460a72fc0b1ef720360618c6093f4e2c`), ReturnsService worker transaction/query contract (`574f3a4626c7a2ebd6cfc19a509d1790ad988320`), DisputesService transactional authorization fixtures (`0b1ec543232310f6c333b17bd03ae5a895135446`), and Catalog saved-favorites limited membership query (`358ac213c1f632340336c542e9b6361040e60621`).
- No local test runner is available through connected GitHub tools; none of these changes have been executed. Keep all changes UNVERIFIED until consolidated exact-head CI.
- Continue by source-reviewing remaining CI #1659 failures, starting with carrier reconciliation mutex B34-PG-10/11 and any test fixture mismatches still present at current head. Treat historical logs as diagnostic only; never weaken tenant/actor guards. Do not trigger per-fix CI.


## Carrier race harness and catalog/operations fixture batch — 27 November 2026

- B34-PG-10/11 previously patched `dbService.db.execute` on the root handle, but `withActorContext` redirects service queries to a transaction-bound Drizzle handle. Commit `4bd5521f44eb411251162b8c8336649027c2e611` moves the test barrier to the scoped handle so the test actually holds the first claim query while the other reconciliation cycle runs. Production carrier code unchanged; DB concurrency assertions remain unverified.
- Commit `ea2e17f011f0503e96a24d2b2094ee244218673c` fixes the P4.1.8 signing-exception test mock to inspect compiled Drizzle SQL, not non-existent `query.sql` fields.
- Catalog visibility test corrections: `d65e8ad42a4c5d6518eb8167f0850cb65981a12b` and `b88a68dbd5b4ae6435bd8e52a4f2b08cc2bd88e6`. Assertions now match the actor-aware controller/service signature and explicitly verify the active membership predicate.
- No local tests or CI were run. Keep all changes UNVERIFIED until consolidated exact-head CI.


## Shipping tenant validation ordering — 27 November 2026

- Commit `035bd65269c07c6c3a3e447c190932607870b439` moves the event/expected organization comparison immediately after authoritative store tenant resolution and before the order-lineage query. A known organization mismatch is now rejected without requiring an unrelated order lookup; shipment order/store lineage remains enforced before provider side effects.
- This resolves the fixture's focused-path TypeError without weakening tenant validation. No local test or CI execution; remains UNVERIFIED.


## Saved-supplier unit mock typecheck repair — 27 November 2026

- Exact-head CI run #1685 (run ID `45918515070`) ran on integration head `cebfd258fa77e20dd07f2a3b13d69d575236070e`. Mobile analysis/tests passed and lint passed; API typecheck failed before downstream suites could run. The only reported TypeScript diagnostics were in `apps/api/src/__tests__/unit/catalog/saved-suppliers.spec.ts`: the Drizzle `where` mock and `stores.findFirst` mock had zero-argument inferred call tuples, making predicate extraction unsafe under strict typing.
- Corrected the test harness in commit `baef54ec07160733c3c18e119e63a0182ea02adb`: typed the query mocks with their SQL/query arguments, used optional call access and explicit predicate-presence assertions, then compiled the predicates with PgDialect. No production code or authorization predicate changed.
- This typecheck repair has not yet been run. Do not dispatch CI for this isolated correction; continue the remaining source-level failure audit and use one consolidated exact-head campaign after the grouped repair pass.
- Current branch head is expected to advance to the repair commit; fetch live PR metadata before further actions. PR #138 source and preservation branch remain identical at `81f30f5c30654b233ef373c15fd3f2cb867aba01`. Keep PR #170 draft/unmerged; staging-release/migration authorization remains separate and is not granted.


## Exact-head CI #1689 follow-up — 27 November 2026

- Live PR metadata confirms PR #170 is OPEN / DRAFT / UNMERGED against `develop`; current head is `1925acc8750292e29eb09d18eb8b3ccd731d2d85`, base SHA is `118174a644a197d72a033c22f0ee5af430617f44`, 149 commits ahead, 0 behind, and 633 changed files. GitHub currently reports mergeable=true; this is not test evidence or merge authorization.
- Exact-head CI #1689 (run ID `45966568112`) completed FAILURE. Lint/typecheck, Flutter, migration full apply, E6 boundary lint and Web/Admin tests passed. API Unit/Coverage and API Integration failed. Container/build/k6/contract and staging-release jobs were skipped. Vercel previews were successful on the prior inspection; do not trigger additional preview builds.
- Confirmed fixture cascade: both `m73b4-delivery-exceptions.postgres.spec.ts` and `m73b5-rts-reconciliation.postgres.spec.ts` inject a ShippingService test double with `assertDriverEligibleForStore` only. Their shared order-setup helper calls checkout; current `OrdersService.checkout` invokes `validateCheckoutSelection` whenever a shipping collaborator is supplied, so the tests throw before exercising their intended delivery-exception/RTS assertions.
- Grouped test-only correction prepared: add a resolved `validateCheckoutSelection` stub to both fixtures, retaining the explicit driver eligibility stub. These suites do not test shipping checkout policy; production validation and fail-closed behavior remain unchanged. This correction is not yet validated by tests or CI.
- CI #1689 also exposes independent API unit/integration failures, including Product Studio PostgreSQL membership fixtures (active organization membership denied), legacy Phase 1 marketplace lifecycle tests still calling transitions that bypass the current FSM, catalog/search assertion mismatches, and other API unit failures. These must be source-reviewed individually; do not weaken tenant/actor boundaries or relax FSM rules to satisfy stale tests.
- No local test runner is available through the connected GitHub tools. Do not dispatch per-fix CI. Continue the grouped source audit, then run one consolidated exact-head mandatory CI campaign.
- PR #138 remains OPEN / DRAFT / UNMERGED at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; its preservation branch remains synchronized. Never merge PR #138 wholesale. Keep PR #170 draft/unmerged; staging-release/migration authorization remains separate. No reviewers, staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, Render mutations, deployments, restarts or releases.


## API integration fixture follow-up — 27 November 2026

- After the shipping collaborator correction, source review of the same CI #1689 run identified two additional tenant-fixture issues:
  - `p6-product-studio-edit.postgres.spec.ts` seeded an ACTIVE store-owner row but omitted the distinct ACTIVE `organization_members` row required by `assertProductEditableByMerchant`. The fixture now seeds both memberships and ensures the MERCHANT_OWNER role exists. Production authorization remains unchanged.
  - `phase1-marketplace.e2e.spec.ts` inserted organization memberships without explicitly setting `status: ACTIVE`; the fixture now seeds explicit ACTIVE status for both merchant and buyer memberships. All generic FSM transition calls in the lifecycle section now pass the real caller context, preserving tenant checks rather than using the optional unscoped path.
- These are test-fixture corrections only. They have not been executed locally or in CI; remain UNVERIFIED until consolidated exact-head CI.
- Current integration head before this follow-up: `b53b99abc4a00cfa7773a9b5a5be61558fc384f6`. The shipping fixture + handover synchronization commit is `b53b99abc4a00cfa7773a9b5a5be61558fc384f6`.
- Keep PR #170 OPEN / DRAFT / UNMERGED. PR #138 and its preservation branch remain identical at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; never merge wholesale. No reviewers, staging/production changes, migrations, releases or deployments.


## Shipping/Payments actor-fixture follow-up — 27 November 2026

- Additional CI #1689 stack traces identified two bounded fixture issues:
  - `m73c-inventory-return.postgres.spec.ts` instantiated OrdersService without the optional ShippingService collaborator, then exercised `assignDriver`; production correctly fails closed when driver eligibility cannot be validated. The test harness now supplies an explicit `assertDriverEligibleForStore` stub because the suite tests inventory-return behavior, not carrier eligibility policy.
  - `p12-independent-runtime-verification.postgres.spec.ts` supplied `role: null` for buyer callers even though `PaymentsService.submitProof` requires an authenticated role before opening user actor context. The fixtures now use the actual `BUYER` role. Production role enforcement is unchanged.
- These are test-only changes and remain UNVERIFIED; no local test runner is available here. Keep the consolidated CI hold until the remaining source-reviewed failure clusters are corrected.
- Current integration head before this batch: `02c7133d78cf9e63334ab945f90ecc3459978ea3`. Earlier grouped fixture commits: `b53b99abc4a00cfa7773a9b5a5be61558fc384f6` (shipping checkout + docs) and `02c7133d78cf9e63334ab945f90ecc3459978ea3` (tenant membership + lifecycle fixtures).
- PR #170 remains OPEN / DRAFT / UNMERGED; PR #138 source/preservation refs remain identical at `81f30f5c30654b233ef373c15fd3f2cb867aba01`. No reviewer requests or staging/production operations.


## P13 return/payment state-machine corrections — 27 November 2026

- Source review of CI #1689 identified that `PaymentsService.submitProof` explicitly accepts a previously REJECTED bank-transfer payment for replacement proof, but the payment transition map rejected the resulting `REJECTED → AWAITING_VERIFICATION` transition. Added that direct replacement-proof transition and its `PAYMENT_PROOF_SUBMITTED` event mapping; the existing `REJECTED → AWAITING_PAYMENT` method-selection path remains valid. This is a production state-machine correction, not a test bypass.
- The P13 financial integration helper attempted the protected `REFUND_PENDING` system transition using a merchant caller. It now receives the seeded platform-admin caller for that system-only step; buyer and merchant steps retain their own callers. Test return reasons were changed from unsupported `DAMAGED` to the supported `PRODUCT_NOT_AS_DESCRIBED` category; damage remains represented by the descriptive details/inspection condition. The reconciliation-versioning test now inserts its second organization before creating tenant-scoped reconciliation runs. A refund-limit assertion now matches the actual error contract.
- These source/test changes have not been run locally or in CI. They remain UNVERIFIED until one consolidated exact-head campaign. No financial invariants, authorization checks or tenant guards were relaxed.
- Prior grouped commits: `b53b99abc4a00cfa7773a9b5a5be61558fc384f6`, `02c7133d78cf9e63334ab945f90ecc3459978ea3`, `98a3337737c9a9f88750b2c15e945bc00c255ebd`.
- PR #170 remains OPEN / DRAFT / UNMERGED. PR #138 and its preservation branch remain identical at `81f30f5c30654b233ef373c15fd3f2cb867aba01`. No reviewers or staging/production operations.


## P4 HTTP authorization harness wiring — 27 November 2026

- The P4 HTTP integration log recorded two deterministic Nest harness exceptions: `PilotControlService` attempted `identity.getOrg` and `merchant.getStore`, but its manually supplied `design:paramtypes` listed only the original three constructor dependencies. The production constructor now requires both `IdentityService` and `MerchantService`. Updated the test metadata and registered real read-only service instances backed by the same disposable PostgreSQL DatabaseService; only their unrelated collaborators are inert because `getOrg`/`getStore` do not use them.
- This explains the missing `getOrg`/ `getStore` errors in P4. Other `withActorContext` failures in the same harness still require verification; the P4 suite remains a known unresolved CI cluster until a rerun.
- No production HTTP authorization or permission behavior was changed. No mocks were added for the service methods under test.
- Current head before this batch: `41ae36d1b3a96768d0c86baf807052bb740beb97`; latest grouped payment-state-machine commit: `41ae36d1b3a96768d0c86baf807052bb740beb97`.
- PR #170 remains OPEN / DRAFT / UNMERGED; PR #138 remains preserved and unmerged. No reviewers or deployment/staging actions.


## CI #1694 failure analysis — grouped integration follow-up — 27 November 2026

- Exact tested code head `88e6b4943491192920e2e17b7dea566a76a3635b`; run #1694 / `45982465536` completed FAILURE. Passed: Lint & Typecheck, Mobile Flutter, Migration Full Apply, Web/Admin Tests, Boundary Lint E6, and both Vercel previews. Failed: API Unit/Coverage and API Integration. Container/build/contract/k6/staging-release jobs were skipped. No merge or deployment occurred.
- Integration failure clusters and grouped corrections in this batch:
  - M73-C fixture now implements checkout's required `validateCheckoutSelection` collaborator in addition to driver eligibility.
  - P12 same-key refund retries are intentionally idempotent for all callers; assert five successful responses and one DB row. The settlement service retry is also idempotent, so the unique-index test now attempts a direct duplicate SQL insert.
  - P13 orphan-refund recovery now uses the actual payment currency. System-only `REFUND_PENDING` transitions use the seeded admin caller; the expiry-race test updates the returned order ID rather than its payment ID; bigint assertions normalize to numbers.
  - P13-returns idempotent escalation expectation now matches the service's null return. Phase 1 FSM setup clears the prior active cart and selects the sub-order for storeA, preserving tenant authorization. P311 TC-03 now seeds the required primary settlement row.
  - P3 and P4 test harnesses now print exception stacks so remaining TypeErrors/HTTP 500s can be fixed at the actual dependency boundary.
- These are fixture/assertion/debugging changes; no financial invariants, tenant authorization, or FSM rules were weakened. They remain UNVERIFIED until consolidated exact-head CI.
- PR #170 remains OPEN / DRAFT / UNMERGED. PR #138 remains protected and unmerged. No reviewers required. No staging/production writes, migrations, grants/RLS changes, provider calls, worker activation, Render mutations, deployments, restarts or releases.


## CI #1694 unit-test follow-up — 27 November 2026

- The exact-head run #1694 (`45982465536`) failed API Unit/Coverage. Grouped test-only corrections in this batch:
  - P418 signing test now returns the row for the alert-claim UPDATE, allowing the test to reach the HMAC failure path and verify FAILED rather than prematurely observing UNKNOWN.
  - Shipping tenant-context tests now provide the worker's actor-context database collaborator before asserting a tenant mismatch.
  - Catalog P2 transaction mock now exposes relational query methods used by the service. SKU search mock now honors the ACTIVE-only predicate instead of returning a PUBLISHED-only row regardless of the DB filter.
  - Catalog ownership/read and inventory tests now reflect the actual scoped call sequence; the offer compare-and-set test compares the serialized timestamp value rather than Date object identity. Controller/publication tests assert membership checks occur without pinning a brittle internal call count.
- The preceding integration batch corrected M73-C checkout collaborator, P12 idempotency/unique-index expectations, P13 financial caller/currency/race fixtures, P13 returns null contract, Phase 1 cart isolation, P311 primary settlement prerequisite, and added P3/P4 stack diagnostics.
- These are test harness/expectation corrections only; production tenant authorization, inventory safeguards, financial transitions and publication rules remain unchanged. All remain UNVERIFIED until consolidated exact-head CI.
- Current branch before this batch: `bfe51c442902bcacfbe3ad3e760c8b225729b5f5`. Keep PR #170 OPEN / DRAFT / UNMERGED and PR #138 protected/unmerged. No reviewers, staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, deployments, restarts or releases.


## Phase 1 FSM cart-isolation ordering correction — 27 November 2026

- Follow-up review caught an ordering mistake in the Phase 1 test fixture: the active cart was being cleared after the new storeA item was added. Moved cleanup/conversion before `cartService.addItem`, then the FSM checkout selects the storeA sub-order. This is test-only isolation and does not change production authorization.
- Previous exact-head validation: run #1694 (`45982465536`) failed API Unit/Coverage and API Integration; passed Lint & Typecheck, Flutter, Migration Full Apply, Web/Admin, Boundary Lint E6, and both Vercel previews. The follow-up grouped commits address the observed test harness and financial fixture failures. The next consolidated run will be the validation gate for current head.
- Current code head before this correction: `feaa9a1dee2c902b2c62c52f915b599fce527e88`. PR #170 remains OPEN / DRAFT / UNMERGED; PR #138 remains protected and unmerged. No reviewers or staging/production operations.


## CI #1697 typecheck correction — 27 November 2026

- Run #1697 (`45985542987`) on head `5d3fdcf9e0d91ca59f5996c283e9d7f90f04ce64` stopped at API typecheck before Unit/Coverage or Integration ran. Mobile Flutter passed; downstream gates were skipped. Typecheck reported only two errors from the newest test-harness batch: an index-signature property access in the SKU-search mock and a test-scoped alert ID referenced from a shared P418 mock.
- Corrected the search mock to use bracket access and made the P418 mock derive the returned row ID from the insert/update query parameters. No production code changed. Next push-triggered CI is required; run #1697 does not validate the integration/unit changes.
- PR #170 remains OPEN / DRAFT / UNMERGED; PR #138 remains preserved and unmerged. No reviewers or staging/production actions.


## CI #1698 focused failure follow-up — 27 November 2026

- Run #1698 (`45985851063`) on head `8410dfb91e2a9f663d4735e6e74cc7de2a048583` passed Lint & Typecheck, Flutter, Migration Full Apply, Web/Admin, and Boundary Lint E6; API Unit/Coverage and API Integration failed. Downstream build/contract/staging/k6 jobs were skipped.
- Exact remaining failures and grouped corrections:
  - P4 HTTP 500s traced to `TenantDatabaseContextInterceptor` being attached to `ReturnsController` but omitted from the Vitest module's explicit constructor metadata/providers. Register the real interceptor with the real DatabaseService; do not bypass tenant context.
  - P3 moderation race TypeError traced to the test Drizzle schema omitting `storeMembers`, although the test seeded that table and production tenant-scope queries it. Include the table in the test schema.
  - P311 concurrent post is idempotent: both callers receive the same posted adjustment. Assert two successful retries and one primary settlement row, rather than expecting one caller to fail.
  - M73-B create/cancel mutex tests seeded `next_reconciliation_at` at the application wall-clock instant, which can still be ahead of PostgreSQL `NOW()`. Seed a safely-past timestamp to make both independent claim queries deterministic.
  - P13 FIN-DSH-28 now asserts the independent order update affected exactly one row, making any remaining RLS/identifier issue explicit rather than silently ignored.
  - Inventory scope assertion reflects two org membership checks and two store membership checks in the nested guard path.
- No production authorization, financial, reconciliation or tenant invariants are weakened. All changes remain UNVERIFIED until the next consolidated exact-head CI.
- PR #170 remains OPEN / DRAFT / UNMERGED; PR #138 remains protected and unmerged. No reviewers, staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, deployments, restarts or releases.


## CI #1699 investigation refinement — 27 November 2026

- Run #1699 (`45987890950`) passed Lint & Typecheck, Flutter, Migration Full Apply, Web/Admin and E6. Unit/Coverage failed five assertions; Integration failed two assertions. No build/contract/k6/staging-release downstream job ran.
- M73-B.3.4 mutex tests failed at the 5-second test timeout, not an assertion. Replaced the brittle SQL-execution barrier (which held a claim transaction open) with a deterministic barrier at the worker actor-context boundary: first cycle holds after setting its process-local running flag but before claiming; the opposite cycle must complete. Both tests get a 30-second allowance and the barrier releases in `finally` to prevent leaked transactions.
- P311 TC-03: service explicitly supports idempotent replay after POSTED, so both callers must fulfill. The previous failure was the assertion counting both primary settlement and adjustment ledger row as if only one row should exist. Now assert exactly one adjustment ledger row keyed to the adjustment and exactly one non-adjustment primary row.
- Inventory active warehouse access calls the store-membership spy once; restore the correct one-call assertion. Organization membership is separately asserted.
- P13 FIN-DSH-28 remains the sole unresolved integration assertion. The independent update reported rowCount=1 but the final row remained PAYMENT_PENDING. The next fixture revision verifies the returned order ID equals the intended sub-order and that a fresh pool query sees ACCEPTED immediately after the independent update, before expiry continues. If that check passes but the final row changes back, investigate service transaction/trigger behavior; do not weaken the conditional update.
- Current PR #170 stays OPEN / DRAFT / UNMERGED; PR #138 stays protected/unmerged. No reviewers, no staging/production operations, migrations, RLS/grant changes, provider calls, worker activation, deployments, restarts or releases. Current corrections are unverified until a consolidated exact-head run.


## CI #1700 result and P13 expiry correction — 27 November 2026

- Run #1700 (`46033444622`) on head `82b5d29c099241324fb7a30044060f93d80f74aa`: Lint & Typecheck, Flutter, Boundary Lint E6, Web/Admin, and Migration Full Apply passed. Unit/Coverage and Integration each failed only FIN-DSH-28 in `p13-financial-dispute.postgres.spec.ts`. All other previously failing unit/integration areas passed, including M73-B mutex separation, P311 idempotent adjustment posting, inventory tenant scope, P4, P3 and financial fixtures. Downstream build/contract/k6/staging-release jobs skipped.
- Root cause refinement: `expirePayment` performed a status read before a conditional UPDATE. The read was redundant and introduced a stale-read window. Production now attempts the single atomic `UPDATE orders ... WHERE status='PAYMENT_PENDING' RETURNING id` directly and appends cancellation history only when that UPDATE returns a row. This preserves the payment-expiry invariant and closes the read/write gap.
- FIN-DSH-28 test is now deterministic: it commits an order transition to ACCEPTED before expiry attempts its conditional update, then verifies payment expiry does not overwrite the order or append cancellation history. The test title reflects this exact ordering; no false claim of a controlled mid-transaction race.
- Current head before this correction: `82b5d29c099241324fb7a30044060f93d80f74aa`. New code/test changes are not yet CI-verified. PR #170 remains OPEN / DRAFT / UNMERGED; PR #138 remains protected and unmerged. No reviewers, no staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, deployments, restarts or releases.


## CI #1701 FIN-DSH-28 fixture correction — 27 November 2026

- Run #1701 (`46035005436`) on head `70b67f6158b1355b01986e472d66483452ce6992`: lint/typecheck, Flutter, E6, Web/Admin, and Migration Full Apply passed. Unit/Coverage failed one FIN-DSH-28 assertion; integration result was still running at the time of this note.
- The remaining unit failure showed the test's payment retained `CASH_ON_DELIVERY` from `createDeliveredOrder`. Production correctly returns early for COD payments, so the test never exercised expiration and payment stayed AWAITING_PAYMENT. Correct the fixture to `BANK_TRANSFER` when resetting payment status to AWAITING_PAYMENT. This is a test setup correction; production COD protection remains intact.
- Production expiry now uses the atomic conditional order UPDATE and writes cancellation history only if a PAYMENT_PENDING row was actually transitioned. Current test fixture and implementation require a new exact-head validation run.
- PR #170 remains OPEN / DRAFT / UNMERGED; PR #138 remains protected and unmerged. No reviewers, no staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, deployments, restarts or releases.


## CI #1702 runtime smoke finding — notification/realtime import cycle — 27 November 2026

- Run #1702 (`46036124557`) passed Lint & Typecheck, Flutter, Unit/Coverage, Integration, Web/Admin, Migration Full Apply, E6, Contract/Codegen, and Build. Container Build & Smoke failed at API startup with `ReferenceError: Cannot access 'NotificationsService' before initialization` from compiled `notifications.controller.js`.
- Root cause is the static import cycle: NotificationsService imports RealtimeGateway; RealtimeGateway imports OrdersModule; OrdersModule imports NotificationsModule and OrdersService imports NotificationsService. This makes the controller's service reference execute while NotificationsService is still initializing.
- Break the runtime cycle with a narrow notification realtime port/token. NotificationsService now injects the interface via `NOTIFICATION_REALTIME_EMITTER` without importing RealtimeGateway; RealtimeModule binds that token to its existing RealtimeGateway using `useExisting` and exports it. IN_APP persistence and live emit behavior remain intact.
- This grouped code change is UNVERIFIED until exact-head CI, especially container startup and health checks, pass. No merge/deploy/staging operation.
- PR #170 remains OPEN / DRAFT / UNMERGED; PR #138 remains protected/unmerged. No reviewers; no staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, deployments, restarts or releases.


## CI #1703 container smoke follow-up — second circular barrel import — 27 November 2026

- Run #1703 (`46038700205`) passed Lint/Typecheck, Flutter, Unit/Coverage, Integration, Web/Admin, Migration Full Apply, E6, Contract/Codegen and Build. Container startup progressed past the NotificationsService cycle but failed on a second runtime cycle: `ReferenceError: Cannot access '_ordersservice' before initialization` at `modules/orders/index.js`, imported by `shipping/carrier-webhook-routing.js`.
- Root cause: `carrier-webhook-routing.ts` imports `OrdersService` through the `../orders/index` barrel. That barrel eagerly re-exports OrdersModule, which imports ShippingModule, which imports CarrierWebhookRoutingService, creating the class initialization cycle. Change only this type/provider import to the direct `../orders/orders.service` module path, bypassing the OrdersModule barrel. Existing `forwardRef(() => OrdersService)` injection remains in place.
- The previous NotificationsService → RealtimeGateway cycle has been removed using the notification realtime port. The current direct-import correction is not yet verified; rerun exact-head CI and require the container health endpoints to pass.
- PR #170 remains OPEN / DRAFT / UNMERGED; PR #138 remains protected/unmerged. No reviewers, staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, deployments, restarts or releases.


## CI #1704 runtime smoke follow-up — realtime gateway barrel import — 27 November 2026

- Exact PR head `2a98fdd33b1645848df674466af4b64f5388c878`; CI run #1704 (`46041178822`). Lint & Typecheck, Flutter, API Unit/Coverage, API Integration, Web/Admin, Migration Full Apply, E6 Boundary Lint, Contract/Codegen and Build all PASSED. Both Vercel preview checks are SUCCESS. Only Container Build & Smoke failed during API module initialization; k6 and staging-release were skipped.
- Container log: `ReferenceError: Cannot access '_orderrealtimeaccessservice' before initialization` from `modules/orders/index.js`, reached via `modules/realtime/realtime.gateway.js`. This is the same barrel-export cycle pattern already fixed for CarrierWebhookRoutingService. RealtimeGateway imported OrderRealtimeAccessService through `../orders/index`; the barrel eagerly re-exports OrdersModule, which imports ShippingModule and brings the gateway path back into initialization.
- Corrected the gateway to import `OrderRealtimeAccessService` directly from `../orders/order-realtime-access.service`. Constructor injection and the existing authorization checks remain unchanged; this only bypasses the eager barrel re-export. No production business logic or tenant policy changed.
- Current correction is not yet verified. Run one consolidated exact-head CI after source-level cycle review; require Container Build & Smoke health checks to pass. Do not rerun Vercel previews unnecessarily.
- PR #170 remains OPEN / DRAFT / UNMERGED against `develop` at `118174a644a197d72a033c22f0ee5af430617f44`. PR #138 remains OPEN / DRAFT / UNMERGED and preserved at source/preservation SHA `81f30f5c30654b233ef373c15fd3f2cb867aba01`; never merge it wholesale. No reviewers. No staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, Render changes, deployments, restarts or releases.


## CI #1705 runtime smoke follow-up — IdentityModule barrel cycle — 27 November 2026

- Exact-head run #1705 (`46043968375`) on `85b3099df844e83a1c5a1a941fbf913817fcc3cd`: Lint/Typecheck, Flutter, API Unit/Coverage (312 passed, 6 skipped), API Integration, Web/Admin, Migration Full Apply, E6 Boundary Lint, Contract/Codegen and Build all PASSED. Container Build & Smoke failed at module initialization with `ReferenceError: Cannot access 'IdentityModule' before initialization` from `identity/index.js`, imported by `shipping.module.js`. k6/staging release were skipped.
- Root cause is the eager barrel-export pattern: ShippingModule imports IdentityModule through `../identity/index`, which also re-exports IdentityService and evaluates the barrel while the Nest module graph is loading. The correction uses direct module/service file imports across the affected startup graph: ShippingModule → IdentityModule/MerchantModule, RealtimeModule → OrdersModule/MerchantModule, RealtimeGateway → MerchantService, and CarrierWebhookRoutingService → MerchantService. Existing direct imports for OrdersService and OrderRealtimeAccessService remain. This removes barrel side effects without changing providers, constructor injection, route authorization, or tenant policy.
- This grouped import-graph correction is UNVERIFIED until exact-head CI confirms container startup and liveness/readiness. All non-container checks passed on #1705; do not repeat CI per file.
- PR #170 remains OPEN / DRAFT / UNMERGED against `develop` at `118174a644a197d72a033c22f0ee5af430617f44`. PR #138 remains OPEN / DRAFT / UNMERGED and protected at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; never merge wholesale. No reviewers, staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, Render changes, deployments, restarts or releases.


## CI #1706 runtime smoke follow-up — deferred IdentityModule reference — 27 November 2026

- Exact-head run #1706 (`46046356695`) on `92faf963dff173e9f9a85a32bedbe14ab2f4b918`: Lint/Typecheck, Flutter, Unit/Coverage (312 passed, 6 skipped), Integration, Web/Admin, Migration Full Apply, E6, Contract/Codegen and Build all PASSED. Container Build & Smoke failed during startup with `ReferenceError: Cannot access 'IdentityModule' before initialization` while OrdersModule loaded ShippingModule.
- The direct-import cleanup removed barrel re-exports but confirmed a module initialization cycle remains between the Orders → Shipping startup path and Identity's module graph. ShippingModule retains the real IdentityModule dependency and now wraps it in Nest's `forwardRef(() => IdentityModule)`, deferring resolution until the module graph is assembled. No provider was removed, mocked, or bypassed; IdentityService remains the production dependency for organization lookups.
- This module-reference correction is UNVERIFIED until exact-head CI passes Container Build & Smoke and both liveness/readiness checks. All other gates passed on #1706. Avoid per-file CI retries.
- PR #170 remains OPEN / DRAFT / UNMERGED against `develop` at `118174a644a197d72a033c22f0ee5af430617f44`. PR #138 remains OPEN / DRAFT / UNMERGED and protected at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; never merge wholesale. No reviewers, staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, Render changes, deployments, restarts or releases.


## CI #1707 — full validation passed — 27 November 2026

- Tested implementation head: `5ba67eb00810d4419b0dfb901596a1eb948b8595`; workflow run #1707 / `46048745793` completed with all mandatory jobs SUCCESS: Lint & Typecheck, Flutter, Migration Full Apply, E6 Boundary Lint, API Unit/Coverage, API Integration, Web/Admin, Build, Contract/Codegen, and Container Build & Smoke.
- API Unit/Coverage passed 312 test files; 6 tests were skipped. API Integration passed. No remaining API test failures.
- Container Build & Smoke passed. API container remained running; `/v1/healthz` returned `{"status":"ok"}`; `/v1/readyz` returned `{"status":"ok"}` with PostgreSQL and Redis both `up`. The IdentityModule deferred reference resolved the final observed startup cycle.
- Vercel Web and Admin status checks are SUCCESS. k6 Smoke Test and Trigger Staging Release were SKIPPED by workflow conditions; no staging deployment or release was performed.
- PR #170 metadata at validation: OPEN / DRAFT / UNMERGED, 638 changed files, 167 commits, base `develop` at `118174a644a197d72a033c22f0ee5af430617f44`, mergeable=true, no requested reviewers. The current PR branch may receive this documentation-only checkpoint; the tested code SHA remains `5ba67eb00810d4419b0dfb901596a1eb948b8595`.
- PR #138 remains OPEN / DRAFT / UNMERGED. Source branch `remediation/phase-0-1-tenant-security` and preservation branch `preservation/pr138-remediation-2026-11-25` were rechecked and are identical at `81f30f5c30654b233ef373c15fd3f2cb867aba01`. Keep this source protected; never merge PR #138 wholesale.
- No staging/production DB writes, migrations, RLS/grant changes, provider calls, worker activation, Render changes, deployment, restart or release occurred. Keep PR #170 draft/unmerged until the user separately authorizes the staging-release/migration step; passing CI and GitHub mergeability do not provide that authorization.
- This checkpoint is documentation-only and uses `[skip ci]`; no redundant code CI should be launched for this note.


## PR #171 merged; grouped carrier/payment follow-up prepared — 27 November 2026

- PR #171 is MERGED into `develop` at `f37ebaf97e2ce6330e69ded9b41d58c7229f4c40`; exact-head CI #1710 (`46056460442`) passed all 10 mandatory jobs. k6 and staging release skipped.
- PR #138 remains OPEN / DRAFT / UNMERGED at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; source and preservation refs remain synchronized. Never merge wholesale or rewrite either ref.
- Grouped next branch: `remediation/carrier-payment-reconciliation-safety-2026-11-27`. It contains carrier webhook credential fail-closed retry handling, migration 0077 legacy-link quarantine, migration 0074 preflight integrity validation with PostgreSQL tests, and a payment-proof cleanup worker registered but disabled by default.
- No staging/production migration, write, worker activation, provider call, Render mutation, deployment, restart or release occurred. PR #172 still requires final review and one consolidated exact-head CI campaign before merge.
- G-002 remains IN PROGRESS / NOT VERIFIED overall. The previous protected audit found the migration DB identity to be postgres with BYPASSRLS/CREATEROLE/CREATEDB; API runtime evidence also showed postgres with BYPASSRLS and TLS disabled. Migration TLS remains unconfirmed. Keep the RLS/least-privilege/TLS transition as a separate gated workstream.


## PR #172 merged and exact-head validation complete — 27 November 2026

- PR #172 merged into `develop` at `825f19b9214af97d34b4abdea1ff104325104361` from implementation head `a3a0d1199a08e62f6382c710006aa3e794d862ca`.
- CI #1713 (run `46062206421`, attempt 2) passed all 10 mandatory jobs. The first container-smoke attempt had a transient PostgreSQL shutdown during disposable-service setup; only that job was rerun, and the retry passed. k6 and staging release remained skipped.
- PR #172 adds fail-closed handling for carrier webhook retries without credential binding, migration 0077 for legacy webhook manual-review quarantine, migration 0074 reconciliation-history preflight/chain integrity tests, and a registered payment-proof cleanup worker gated off unless its environment flag is explicitly true. This PR did not set the flag or activate the worker.
- PR #138 remains OPEN / DRAFT / UNMERGED at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; source and preservation refs remain synchronized and protected. Never merge PR #138 wholesale or rewrite its refs.
- No staging/production migration or DB write, role/grant/RLS/default-ACL change, provider call, worker activation, Render mutation, deployment, restart or release occurred. G-002 remains IN PROGRESS / NOT VERIFIED; least-privilege role/ACL and TLS transition remain separate gated tasks.


## 28 November 2026 — PR #173 carrier provider binding; stale unit expectation corrected

- PR #173 (`remediation/carrier-config-provider-binding-2026-11-28`) adds provider-scoped configuration lookup and enforces credential/configuration provider equality on create and resolve. Credential resolution also requires active status and matching organization/provider. Aramex requests the explicit `aramex` provider key.
- CI #1716 / run `46069073203` on head `5acd0d5822f947a08524527e48eb531c1b778378`: lint/typecheck, mobile, PostgreSQL integration, E6, Web/Admin and migration full apply passed; API Unit/Coverage failed one stale two-argument assertion in `shipping-tenant-context.spec.ts`. The received call correctly included the third argument `'aramex'`.
- Corrected the three old call/expectation sites in that test file. Fix commit `bb2b7edc4d045d25daf3c8de1e7b07f818c74303`. This is a test-only compatibility correction. No tests were weakened and no production guard was changed.
- The corrected head has not yet received a completed exact-head CI run. Keep PR #173 OPEN / DRAFT / UNMERGED until all mandatory jobs, including API Unit/Coverage and any required container smoke, pass.
- PR #173 compares 3 commits ahead / 0 behind `develop` at base `bb39cb6488acd958a6079b60c2da4a2cfdbcab28`. PR #138 source and preservation refs remain identical at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; preserve both unchanged.
- No reviewers or extra Vercel builds. No staging/production writes, migrations, RLS/grant/default-ACL changes, provider calls, worker activation, Render changes, deployments, restarts or releases.


## 28 November 2026 — PR #173 CI #1717 concurrency assertion triage

- CI #1717 (46074130374) on bb2b7edc4d045d25daf3c8de1e7b07f818c74303 passed lint/typecheck, mobile, Web/Admin, E6, unit/coverage and migration full apply. Integration had one failure in cross-instance-throttling.spec.ts: the test compared the final Promise.all array element to the threshold-crossing count. Promise.all preserves input order, not Redis execution order.
- Reviewed the Redis Lua implementation: the counter increments atomically; the first count above the limit creates the block; subsequent calls return the blocked counter without incrementing. The test now asserts the maximum observed count is exactly limit + 1 and that at least one request observed the block.
- Test-only correction commit: 442d993e569eb77c435256ac0300c322600bb9d8. Not yet locally or CI verified. Do not launch per-fix CI; continue source review, then one consolidated exact-head campaign.
- PR #173 remains OPEN / DRAFT / UNMERGED. PR #138 source and preservation refs remain identical at 81f30f5c30654b233ef373c15fd3f2cb867aba01. No reviewers, Vercel retries, staging/production writes, migrations, role/grant/RLS/default-ACL changes, provider calls, worker activation, Render changes, deployments, restarts or releases.


## 28 November 2026 — PR #174 merged and PR #138 extraction reconciliation

- PR #174 merged into develop at `4c5c755571385b346902c74c9f4f0578f48d9433` from exact head `96c0276a7cd68a2125197d85d16b8e739d9cd5ef`. Exact-head CI #1722 passed all ten mandatory jobs; k6 and staging release were skipped. The CLI now requires verified TLS in production-like environments, validates exact session/effective role privileges and public ownership, and sets transaction-local bootstrap actor context. PostgreSQL regression tests cover TLS fail-closed and audit actor attribution.
- PR #170's 574-path non-conflicting PR #138 extraction merged on 27 November at `d078fe0124ac04fb0da3fc26f3ff02306c45a33f`. Focused PRs #157, #158, #159, #169, #171, #172, #173 and #174 are now merged.
- A three-way tree comparison used merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`, source head `81f30f5c30654b233ef373c15fd3f2cb867aba01`, and current develop `91795390cff5115dee475e07fd87d0c870a6e821`, excluding scratch and token-like artifacts. Results: 533 identical paths; 109 both-changed/different paths (81 tests, 22 source files, 3 docs, 2 migrations, 1 workflow); 60 develop-only paths; 20 source-only paths.
- Of the 109 differing paths, 95 are in merged PR #170 and 12 more are covered by focused merged follow-ups. The two intentionally not copied are (1) PR #138's old log-only polling OutboxDispatcher, which marks events DISPATCHED without a real delivery adapter; current develop safely disables polling and keeps events PENDING; and (2) a catalog round-trip test with random fixture UUID versus current fixed isolated fixture.
- The 20 source-only paths are ten legacy migration verification/apply scripts, the old migration 0070 that collides with current develop's migration 0070 and overlaps current 0076 ACL hardening, and ten historical project-memory documents. They are preserved on the PR #138 source branch and are not missing application implementation. Do not import/apply the old 0070 or run legacy scripts.
- PR #138 remains OPEN / DRAFT / UNMERGED at unchanged head `81f30f5c30654b233ef373c15fd3f2cb867aba01`; preservation ref is verified identical. The bulk implementation is now recovered through bounded merges or superseded by safer current-develop implementations. No further bulk extraction is justified. Any newly identified missing behavior must be a fresh, bounded PR from current develop with exact path provenance and focused tests.
- CI run #1723 / `46085878528` is on PR #174 merge commit `4c5c755571385b346902c74c9f4f0578f48d9433`. At the latest poll, Mobile, Lint/Typecheck, Web/Admin, Migration Full Apply and Boundary Lint had passed; Integration Tests and Unit/Coverage were still running. No staging release was triggered.
- G-002 remains IN PROGRESS / NOT VERIFIED. The standalone migration runner's non-fatal identity diagnostic and optional TLS remain gated until the protected read-only staging catalog audit establishes the actual migration principal, ownership, default ACLs and TLS state. No database writes/migrations, grants/default ACL changes, RLS, provider calls, worker activation, Render changes, deployment, restart or release occurred.
