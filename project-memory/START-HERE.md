# SCS Platform — Start Here

**Last updated:** 27 November 2026  
**Repository:** `nabeel2323/scs-platform`  
**Active integration PR:** [#170 — Bulk PR #138 remediation extraction](https://github.com/nabeel2323/scs-platform/pull/170)  
**Protected remediation source:** [#138 — Phase 0–1 tenant/security remediation](https://github.com/nabeel2323/scs-platform/pull/138)

## Read these documents first

1. [PR #138 integration checkpoint](../docs/remediation/PR138-INTEGRATION-CHECKPOINT.md) — branch, reconciliation decisions, validation status and safety gates.
2. [Implementation progress tracker](../docs/remediation/IMPLEMENTATION-PROGRESS.md) — authoritative task-level remediation and evidence log.
3. [Implementation plan](../docs/remediation/IMPLEMENTATION-PLAN.md) — phase order, acceptance criteria and release gates.
4. [README](../README.md) — repository structure and commands.

The newest dated entries in the checkpoint and progress tracker override older historical entries.

## Current integration state — 27 November 2026

- PR #170 is **OPEN / DRAFT / UNMERGED**, targeting `develop`.
- Integration branch: `integration/pr138-bulk-remediation-2026-11-26`.
- Read the exact current head, base SHA, changed-file count and mergeability from live PR #170 metadata; do not hard-code a branch SHA in this handoff.
- The integration branch is based on `develop` at `118174a644a197d72a033c22f0ee5af430617f44` and is 0 commits behind that base. Use the live PR comparison for its current ahead count.
- GitHub's mergeable flag can change as metadata recalculates. It is not test evidence or merge authorization.
- PR #138 remains **OPEN / DRAFT / UNMERGED** with 1,943 changed files. Its source and preservation refs remain identical at `81f30f5c30654b233ef373c15fd3f2cb867aba01`. It is recovery/source material only; never merge it wholesale.

## Verification and immediate work

- Exact-head CI #1659 (run ID `45914688537`) ran on older code head `a39acd446767d071eea2b175d1341897c9c6b3e4`. Lint/typecheck, Flutter, Web/Admin, migration full apply and E6 passed; API integration and Unit/Coverage failed. It does not validate later commits.
- Follow-up API fixture and identity/security corrections have been committed but remain unverified. The latest shipping fixture pass adds a narrow `assertDriverEligibleForStore` test collaborator to the M7.3-B.4 delivery-exception and M7.3-B.5 RTS PostgreSQL suites; production fail-closed behavior is unchanged.
- No workflow run is associated with the current integration head. Vercel checks are failing on the free-plan daily deployment quota and are not application CI. Do not trigger extra Vercel builds.
- Continue source-reviewed, grouped repairs for remaining API unit/integration failures. Re-check current source before editing any historical failure. Run one consolidated exact-head mandatory CI campaign only after concrete mismatches are resolved; do not run CI per file or per small fix.

## Operating decisions and safety boundaries

- Preserve PR #138 and its synchronized preservation branch. Never close, delete, reset, force-push, destructively rebase, or merge PR #138 wholesale.
- Extract only reviewed, bounded, non-conflicting changes into PR #170; preserve newer `develop` behavior and reconcile migrations deliberately.
- Batch related implementation and test changes. Use focused checks where available, then one consolidated exact-head CI campaign.
- Do not request GitHub reviewers.
- Keep PR #170 draft/unmerged until mandatory exact-head CI passes and the user separately authorizes the staging-release/migration step.
- Keep the staging-release safety hold disabled.
- No staging/production DB writes, migrations, RLS/grant/default-ACL changes, provider calls, worker activation, Render changes, deployments, restarts or releases without separate authorization.
- Keep this file, the integration checkpoint, progress tracker and PR description synchronized after meaningful grouped work.


## Latest continuation update — 27 November 2026 (buyer confirmation atomicity + API fixture batch)

- Production fix `3aa3358e5d213876988bcfe4f20930237873b2b5`: buyer confirmation timestamp now commits in the same transaction as order completion, with a `buyerConfirmedAt IS NULL` compare-and-set and idempotent concurrent-loser handling.
- Grouped test fixture corrections:
  - `3151fc2f460a72fc0b1ef720360618c6093f4e2c` — privileged RTS admin fixture retains valid shipment/store lineage while testing cross-org bypass.
  - `574f3a4626c7a2ebd6cfc19a509d1790ad988320` — ReturnsService worker escalation mock follows `db.db.transaction` and provides result projection queries.
  - `0b1ec543232310f6c333b17bd03ae5a895135446` — DisputesService authorization tests provide transaction/locking mocks.
  - `358ac213c1f632340336c542e9b6361040e60621` — Catalog saved-favorites fixture supports `where().limit(1)`.
- Tracker/checkpoint updated in commits `103d7140f0594e6fc50546923647045103eff98f` and `e4f1124472ef9e70fae072def2e08af620e6a560`.
- All changes are UNVERIFIED: no local runner or exact-head CI has executed them. Historical CI #1659 still identifies carrier reconciliation mutex tests B34-PG-10/11, shipping/carrier tenant-context mocks, catalog publication visibility assertions, orders checkout fixtures, P4.1.8 signing-exception mock, and other payment/returns/admin assertions. Re-check each against current source before changing; some may have been superseded.
- Next task: source-review B34-PG-10/11 carrier reconciliation mutex separation and the remaining current unit fixture failures. Group related fixes, do not weaken tenant/actor guards, and run only one consolidated exact-head CI after the batch is complete.


## Further grouped API follow-ups — 27 November 2026

- `4bd5521f44eb411251162b8c8336649027c2e611`: corrected B34-PG-10/11 barrier to intercept the transaction-scoped Drizzle handle inside DatabaseService.withActorContext; the old root-handle patch could not hold the real worker claim query.
- `ea2e17f011f0503e96a24d2b2094ee244218673c`: P4.1.8 signing exception mock now inspects compiled Drizzle SQL to detect INSERT and return its ID.
- `d65e8ad42a4c5d6518eb8167f0850cb65981a12b` and `b88a68dbd5b4ae6435bd8e52a4f2b08cc2bd88e6`: Catalog visibility assertions now match the actor-aware product detail contract and verify active membership predicate.
- Tracker/checkpoint updates: `b5e1d6d9a85972b5437b120671508aed11b3b930`, `cb048757d1ab50e16c0375130ac219b57e070307`.
- These remain unverified; no local tests or exact-head CI run. Continue source review of remaining API fixture and behavior failures, batch related changes, and use one consolidated exact-head CI campaign only when the batch is complete. Keep PR #170 draft/unmerged and preserve PR #138 unchanged.


## Latest continuation update — 27 November 2026 (shipping tenant validation)

- Commit `035bd65269c07c6c3a3e447c190932607870b439` now rejects mismatched event/expected organization immediately after resolving the authoritative shipment store tenant and before the order-lineage lookup. The mandatory order/store lineage check still runs before provider side effects.
- Tracker/checkpoint updates: `c330fcd8839912b2cc5ca35323fc7cd1eef5b181` and `06a3762b1467176ee8d23c556ba6aaa39c532097`.
- No tests have run locally and there is no exact-head Actions run. The latest known Vercel contexts are free-plan build-rate-limit failures, not application test evidence. Do not trigger extra Vercel builds.
- Keep working through remaining API tests with source review; never weaken authorization or tenant boundaries. Consolidate before one exact-head CI run. Do not merge PR #170 or alter PR #138; no staging or production operations.


### Current continuation — 27 November 2026

- PR #170 exact-head CI #1685 (`45918515070`) failed at API typecheck only after lint and Flutter passed. The failure was a strict typing issue in the saved-suppliers unit test query mocks; no downstream suites ran. Test-only correction committed as `baef54ec07160733c3c18e119e63a0182ea02adb`; not yet verified.
- Continue grouped source-level audit before a single consolidated exact-head CI run. Do not run per-fix CI or additional Vercel previews. PR #138 and its preservation branch remain identical at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; never merge PR #138 wholesale.
- PR #170 remains OPEN / DRAFT / UNMERGED. Do not merge until exact-head mandatory CI passes and separate staging-release/migration authorization is received. No reviewers are needed.


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
