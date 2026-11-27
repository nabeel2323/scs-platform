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
