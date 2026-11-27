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
