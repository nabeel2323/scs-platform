# SCS Platform — Work Log

Chronological handover notes. The authoritative technical detail remains in the linked PR, commits, remediation tracker and finding-specific documents.

## 21 November 2026 — Project-memory checkpoint creation

- Reconciled the handover against repository `nabeel2323/scs-platform`, branch `remediation/phase-0-1-tenant-security`, PR #138 and branch head `1c1cf2f5032cf789789f0efc527e3c976a9ceb78`.
- Verified PR #138 is open and draft, targeting `develop`; it is not merged.
- Verified latest commit message: `test(security): complete merchant offer governance role matrix`.
- Inspected CI #1176 on the exact head. The run failed at changed-file Prettier for the controller test and remediation progress tracker. Lint reported zero errors (311 warnings); typecheck succeeded; Flutter analysis/tests passed. Downstream API unit/coverage, PostgreSQL integration, migration, Web/Admin, boundary, build/container and contract jobs were skipped. Staging release and k6 were skipped.
- Created this `project-memory/` handover system to make cross-chat resumption repeatable. It is an index/checkpoint layer; `docs/remediation/IMPLEMENTATION-PLAN.md` and `IMPLEMENTATION-PROGRESS.md` remain authoritative.
- Immediate follow-up: complete formatting correction, ensure no temporary helper workflow remains, then inspect a fresh exact-head CI run.

## 21 November 2026 — G-001 role-gate implementation checkpoint

- Branch head before this memory update: `1c1cf2f5032cf789789f0efc527e3c976a9ceb78`.
- Latest commit: [`1c1cf2f`](https://github.com/nabeel2323/scs-platform/commit/1c1cf2f5032cf789789f0efc527e3c976a9ceb78) — `test(security): complete merchant offer governance role matrix`.
- The merchant offer mutation gate explicitly permits `MERCHANT_OWNER`, `MERCHANT_STAFF` and legacy `MERCHANT`; platform privileged roles must use governance routes rather than merchant mutation routes.
- Controller tests cover positive merchant mutation roles and negative BUYER, FINANCE, ADMIN, MODERATOR, SYSTEM and SUPER_ADMIN cases. Governance-read permission tests cover ADMIN, MODERATOR, SYSTEM and SUPER_ADMIN with and without `catalog:offers:govern` for merchant list/analytics/trend/detail surfaces.
- G-001 remains PARTIAL pending exact-head CI, complete tenant/role acceptance evidence and independent security review.
- See [PR #138](https://github.com/nabeel2323/scs-platform/pull/138) and the detailed [implementation progress tracker](../docs/remediation/IMPLEMENTATION-PROGRESS.md).

## Prior checkpoint — 20 November 2026

- G-001 service regression work included foreign-organization denial for proposal and pricing mutations and active-store-member proposal attribution; see the dated G-001 entries in the authoritative progress tracker.
- G-002 schema coverage reconciliation compared the live public relation inventory with API Drizzle schema declarations. It improves inventory completeness but does not establish row ownership predicates or RLS readiness; see [G-002 schema coverage reconciliation](../docs/remediation/G-002-SCHEMA-COVERAGE-RECONCILIATION-2026-11-21.md).
- No shared database mutation, live migration, grants/default-ACL change, RLS enablement, staging deployment, environment change, worker activation or staging write was performed.

## How to add future entries

Append newest first. Include date, branch/commit, concise changes, test commands or CI links, exact pass/fail/skip outcomes, docs updated, decisions/approvals, remaining risks and the next concrete action. Avoid recording secrets or personal data.

## 21 November 2026 — formatting and CI handover update

- Formatter run [#14](https://github.com/nabeel2323/scs-platform/actions/runs/44858112060) succeeded. It formatted the project-memory Markdown, README, remediation plan/progress tracker and G-001 controller test.
- The temporary formatter workflow removed itself in [commit 2776f97](https://github.com/nabeel2323/scs-platform/commit/2776f97e902f7569afdc08ba75db8109238e9fcf); the final tree was verified not to contain the helper workflow.
- CI #1179 on the formatter cleanup commit returned action_required with no jobs. CI #1178 refers to the pre-format commit and is not exact-head evidence for the formatted tree.
- The next app-authored checkpoint commit is intended to trigger the full CI suite against the formatted tree. Continue from that run and record its exact SHA and job results.

## 21 November 2026 — exact-head CI checkpoint

- The project-memory system and related remediation documentation were formatted by successful formatter run #14; the temporary workflow removed itself and is absent from the resulting tree.
- The last inspected app-authored checkpoint commit was f7f3ff6837f67f17cc00d5129a20f50e608bf3b6. CI #1180 was running on that exact SHA when this note was prepared.
- A further documentation-only checkpoint commit records this status. Check GitHub for the current branch head and the newest CI run before relying on this snapshot.
- PR #138 remains open and draft. G-001 remains PARTIAL; G-002 remains IN PROGRESS. No staging release, shared DB mutation, live migration, grants/default-ACL change or RLS enablement was performed.

## 21 November 2026 — CI #1180 formatting follow-up

- CI #1180 on f7f3ff6837f67f17cc00d5129a20f50e608bf3b6 failed only at the changed-file Prettier gate for the progress tracker, release/CI status file and work log.
- Lint reported 0 errors (311 warnings), TypeScript typecheck passed and Flutter analysis/tests passed. Dependent API, PostgreSQL, migration, Web/Admin, boundary, build/container and contract jobs were skipped.
- Formatter run #15 is correcting those three Markdown files. The next app-authored checkpoint commit must trigger full CI on the formatted tree.

## 21 November 2026 — formatter run #15 completed

- Formatter run #15 succeeded and formatted the three files flagged by CI #1180: the remediation progress tracker, project-memory release/CI status and work log.
- Formatter cleanup commit 2d416c99700de8b511a7c376085a107cc24a854c removed the temporary helper workflow; the final tree was verified not to contain it.
- CI #1183 on the cleanup commit returned action_required with no jobs; CI #1182 refers to the pre-format helper commit. A new app-authored checkpoint commit is required for exact-head full CI.

## 21 November 2026 — G-001 offer existence confidentiality

- Added a scope-first merchant offer service boundary: organization ownership and ACTIVE store membership are checked before full offer detail is loaded.
- Unknown, foreign-organization and same-organization non-member offer identifiers now share a 404 response on merchant detail, proposal, pricing-update and withdrawal paths. Governance reads remain permission-gated and separate.
- Added service/controller regression coverage for 404 parity, lookup ordering, active-member access and governance separation.
- Source/test commits: dd52aaf, bca32b0, 39a0437 and a1602bc. Focused tests and exact-head CI are pending; G-001 remains PARTIAL.

## 21 November 2026 — G-001 inactive-store buyer visibility

- Buyer product offer lists and ranked seller results now require an ACTIVE owning store in addition to an ACTIVE, available offer.
- DRAFT stores remain manageable by their active merchant members, but their offers are hidden from buyer discovery until store activation.
- Added unit coverage for both buyer query paths and the no-active-store case. Exact-head CI is pending.

## 21 November 2026 — G-001 active-store query efficiency

- Replaced the initial active-store ID materialization with a correlated SQL EXISTS predicate in both buyer-facing offer queries.
- The store lifecycle boundary remains enforced in SQL without loading all active store IDs into application memory.
- Unit tests assert the EXISTS predicate for the regular and ranked buyer query paths.

### 21 November 2026 — G-001 merchant read-surface acceptance expansion

- Expanded the catalog offer controller test matrix for supported merchant principals across list, analytics, trend and offer-detail reads.
- Added FINANCE to the negative privileged-read matrix and a foreign-organization trend-denial test that asserts no service query occurs.
- This is a test-only acceptance increment. It does not close G-001; exact-head CI, remaining tenant/store lifecycle evidence and independent security review are still required.
- No shared database, staging, deployment, environment or worker action was performed.

### 21 November 2026 — G-001 missing-organization and membership-denial coverage

- Added controller tests denying foreign-organization offer-list access before service queries.
- Added a missing-active-organization denial case and revoked/inactive-membership analytics denial before service access.
- The test increment is not yet CI-verified. G-001 remains PARTIAL pending exact-head CI, remaining lifecycle acceptance and independent security review.
- No shared database, staging, deployment, environment, grant, RLS or worker changes were made.

### 21 November 2026 — G-001 store lifecycle acceptance

- Added a controller regression test confirming an active store member can continue merchant offer management while the store remains DRAFT.
- This complements the buyer-facing ACTIVE-store visibility predicate; no unrecorded policy for SUSPENDED stores was assumed.
- Exact-head API CI remains pending. G-001 remains PARTIAL.

### 21 November 2026 — G-001 PostgreSQL buyer visibility regression

- Updated catalog lifecycle integration fixtures so the two merchant stores used in buyer discovery are explicitly ACTIVE instead of inheriting the DRAFT schema default.
- Added a PostgreSQL test that sets one store to DRAFT and verifies its offers disappear from both buyer list and ranked queries while the other ACTIVE store remains visible; store status is restored in a `finally` block.
- Exact-head API and PostgreSQL CI verification remains pending. No shared database or staging data was touched; this test uses the disposable integration database.

### 21 November 2026 — G-001 PostgreSQL offer-detail confidentiality and revocation

- Added disposable-PostgreSQL service tests proving foreign-organization merchants and same-organization non-members receive the same not-found response for offer detail.
- Added an inactive-membership scenario that denies merchant offer detail and restores the membership to ACTIVE in `finally`.
- Exact-head API/PostgreSQL CI remains pending; no shared database or staging state was touched.

### 21 November 2026 — G-001 PostgreSQL merchant-staff acceptance

- Added a real PostgreSQL service test for an active store MEMBER using the `MERCHANT_STAFF` caller context to read offer detail.
- The temporary membership is marked INACTIVE in `finally` to keep the lifecycle fixture deterministic.
- Exact-head API/PostgreSQL CI remains pending.

## 21 November 2026 — latest continuation and CI #1230

- Re-read the repository handover documents and authoritative remediation plan/progress tracker at the PR #138 head.
- Latest inspected PR head before this entry: `af8970c2817caf8c89ffc51cf4d4a3eb4374f8c8`; PR #138 remains open and draft.
- CI [#1230](https://github.com/nabeel2323/scs-platform/actions/runs/44860925152) failed only at changed-file Prettier. Lint and TypeScript typecheck passed, as did Flutter analysis/tests. API unit/coverage, PostgreSQL integration, migration, Web/Admin, boundary, build/container and contract jobs were skipped. k6 and staging release were skipped.
- Prettier identified nine files: the G-001 controller and service test files, remediation plan/progress tracker, and five project-memory Markdown files (CURRENT-STATE, IMPLEMENTATION-ROADMAP, OPEN-ISSUES, RELEASE-AND-CI-STATUS and WORK-LOG).
- A temporary formatter workflow file was created in commit `f1ede927083b078e050dc2066130756e7d3708b9`, but it is not present in the inspected current branch tree and no formatter run or formatter cleanup commit is verifiable. Do not treat the formatting as complete. The nine-file Prettier failure remains unresolved.
- Current branch checkpoint after the documentation update is `be43328183e58842a27d9cf3881140a4284ea13d`; no GitHub Actions run or status contexts are associated with this SHA. Next: correct the nine Prettier failures through a normal branch push, obtain exact-head full CI, then continue G-001 acceptance only if the focused API and PostgreSQL tests pass. G-001 remains PARTIAL; G-002 remains IN PROGRESS.
- No shared database mutation, staging write, migration, grant/default-ACL change, RLS enablement, environment change, worker activation or deployment was performed.

## G-001 buyer projection and create-reference hardening — 21 November 2026

The buyer-facing product offer endpoint now returns an explicit allowlist of public commercial fields instead of full merchant-offer rows. It excludes merchant metadata, external references, proposer/reviewer identifiers and timestamps, review details, price-list IDs and warehouse IDs. The ranked buyer endpoint no longer returns the internal price-list reference.

Offer creation now enforces the same-store ownership invariant for optional price-list and warehouse references, matching the existing pricing-update behavior. Unit tests cover foreign-store denial, same-store acceptance and the public projection. PostgreSQL integration tests cover cross-store reference rejection without inserting an offer and verify that private offer fields are absent from buyer and ranked responses.

The implementation and documentation are synchronized in this change. Exact-head CI must verify the resulting commit before G-001 status changes. G-001 remains PARTIAL pending full CI, remaining role/tenant acceptance and independent security review. G-002 remains IN PROGRESS. No shared database, staging, migration, grants, RLS, deployment or worker changes were performed.

- Verification note: CI #1252 on parent `ab3a2af` passed lint/typecheck/format, Flutter, Web/Admin, boundary lint and isolated full migration/read-only audit. Unit/coverage and PostgreSQL integration were still running when this commit superseded it. The new exact-head run is required.

## CI #1259 regression analysis and correction — 21 November 2026

Exact-head CI #1259 exposed two defects. PostgreSQL rejected the correlated `EXISTS` predicate used by the buyer offer relational query because the outer `merchant_offers` reference was not valid in the generated query shape. The store-visibility predicate is being changed to an uncorrelated `store_id IN (SELECT id FROM stores WHERE status = 'ACTIVE')` subquery, preserving the visibility rule without the invalid outer reference. The catalog-offer unit harness also lacked `.limit()` on its selected-query branch, which broke tenant-membership tests; the harness now supports `.getSQL()`, `.limit()` and `.groupBy()` for the relevant query shapes.

CI #1259: lint/typecheck, formatting, mobile, Web/Admin, boundary lint and migration/read-only audit passed. API unit/coverage and PostgreSQL integration failed for the two issues above. The correction is committed with regression coverage; exact-head CI must pass before G-001 advances. No staging/database writes or deployment actions were performed.

## 21 November 2026 — G-001 PostgreSQL fixture regression correction

Reviewed live PR #138 and exact-head CI #1265 on `36399ce6704b0774f0ebb0f670a3e7d735b19295`. The run passed lint/typecheck/formatting, Flutter, boundary lint, migration full-apply/read-only audit and Web/Admin tests, but failed API unit/coverage and PostgreSQL integration. The common defect was that five real-PostgreSQL test suites omitted `storeMembers` from their explicit Drizzle schema maps; this made the membership query undefined in the newly hardened offer service. Phase 4 commerce assertions then failed downstream. The grouped correction registers the model in all five suites and marks buyer-discovery stores ACTIVE, preserving the production membership guard and the DRAFT-store buyer-visibility rule. Exact-head CI after the correction is pending.

No shared database, staging, deployment, grant, RLS, migration, worker or external business action was performed.

## 21 November 2026 — CI #1266 formatting correction

CI #1266 on `52336f751dc2558b10834940034833b4573c5ca4` passed Flutter and lint/typecheck with zero errors, but the changed-file Prettier gate failed on nine files. API unit/coverage, PostgreSQL integration and downstream migration/build/release jobs were skipped, so the fixture correction has not yet been functionally verified. Applying the repository-locked formatter and rerunning exact-head CI. No application behavior, staging, database, deployment or worker settings changed.

## 21 November 2026 — G-001 exact-head CI #1268 passed

- Reconciled the live branch, PR #138, latest commit and GitHub Actions run. Branch `remediation/phase-0-1-tenant-security` is at `b73f72e34406c1260f214610539139d0d096b2de`; PR #138 remains open/draft and targets `develop` at `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.
- CI [#1268](https://github.com/nabeel2323/scs-platform/actions/runs/44907038784) passed all 10 executable jobs on the exact branch head: lint/typecheck/format, API unit/coverage, PostgreSQL integration, Web/Admin, migration full apply/read-only audit, E6 boundary lint, Flutter, contract/codegen, build and container smoke. k6 and protected staging release were skipped.
- The earlier CI #1266 formatting failure is superseded. The five PostgreSQL test-schema `storeMembers` corrections and ACTIVE-store buyer-discovery fixtures now pass API unit/coverage and real PostgreSQL integration. Production authorization logic remains unchanged.
- Prepared a dedicated G-001 independent security-review packet with source/test evidence and explicit reviewer questions. This packet is not itself an independent review; G-001 remains PARTIAL until a separate qualified reviewer records a conclusion and findings.
- G-002 remains IN PROGRESS. No shared database mutation, grants/default ACL, RLS, migration 0070, staging write/deploy, environment change or worker activation was performed.

## 21 November 2026 — INACTIVE-store acceptance extension and formatter recovery

- CI #1269 identified Prettier-only failures in seven Markdown files added/updated by the G-001 review packet commit. Lint/typecheck passed; API and dependent jobs were skipped.
- Temporary formatter workflow run [#1](https://github.com/nabeel2323/scs-platform/actions/runs/44917785644) completed successfully using repository-locked Prettier, removed itself, and pushed `71550c4c6d71de1b3b54f6d2230b308251a73e23`. CI #1271 on that formatted commit passed all 10 executable jobs; it predates the later INACTIVE-store test.
- Reviewed the G-001 acceptance plan and added explicit disposable-PostgreSQL coverage for an `INACTIVE` store: buyer list and ranked results must exclude its offers while another ACTIVE store remains visible; fixture state is restored in `finally`.
- Updated the independent review packet, progress tracker, current-state checkpoint, roadmap, open issues, CI record and work log. CI #1272 on the test commit failed only the changed-file Prettier gate on seven Markdown files; API unit/coverage and PostgreSQL integration were skipped. Formatter workflow run [#2](https://github.com/nabeel2323/scs-platform/actions/runs/44922086383) successfully formatted the seven files, removed itself and pushed `cba6fb76ede53efefc2683c3372df1fdb7e6e1a4`. CI #1273 for that formatter-bot commit returned `action_required` with no jobs and is not test verification. The INACTIVE-store test remains pending a normal exact-head API/PostgreSQL run. G-001 remains PARTIAL pending that verification and independent review. No staging or shared database changes were made.

## 21 November 2026 — formatter recovery and exact-head verification handoff

- Current formatted branch head: `cba6fb76ede53efefc2683c3372df1fdb7e6e1a4`; PR #138 remains open/draft/unmerged.
- CI #1271 passed all 10 executable jobs on `71550c4c6d71de1b3b54f6d2230b308251a73e23`, before the added INACTIVE-store PostgreSQL regression test.
- CI #1272 on `6a7a620f9a68528ec7f638dbf85ad3c13031a5e5` failed only the changed-file Prettier gate on seven Markdown files; API unit/coverage and PostgreSQL integration were skipped.
- Formatter workflow run [#2](https://github.com/nabeel2323/scs-platform/actions/runs/44922086383) succeeded, applied locked Prettier and removed the temporary workflow. The resulting formatted docs commit is `cba6fb76ede53efefc2683c3372df1fdb7e6e1a4`.
- CI #1273 on the formatter-bot commit returned `action_required` with zero jobs. It is not accepted as verification. The INACTIVE-store regression is still pending an exact-head API/PostgreSQL run.
- G-001 remains PARTIAL; independent review remains outstanding. G-002 remains IN PROGRESS. No protected staging, shared DB, grants, RLS, migration 0070, deployment or worker changes were made.

## 21 November 2026 — CI #1275 formatting gate and test handoff

- On exact commit `d67875507a07a75f2945b44beb7bfbec387f169e`, CI #1275 passed lint, TypeScript typecheck, Flutter analysis and Flutter tests.
- The changed-file Prettier gate failed on five Markdown files: implementation progress, current state, open issues, release/CI status and work log. API unit/coverage, PostgreSQL integration and all dependent jobs were skipped.
- This run does not verify the new INACTIVE-store PostgreSQL test. The test remains committed and must be exercised by a later exact-head integration run.
- Next: apply repository-locked formatting, then rerun CI. Keep G-001 PARTIAL pending API/PostgreSQL verification and independent security review. No staging, shared DB, RLS, grants, migration or deployment actions were performed.

## 21 November 2026 — G-001 exact-head CI #1280 passed; handover reconciled

- Rechecked branch, PR #138, source head and CI. Branch `remediation/phase-0-1-tenant-security` was at `ffd3961c32164c2af00090b32dbafb06b997a581`; PR #138 remains open/draft/unmerged and targets `develop` at `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.
- CI [#1280](https://github.com/nabeel2323/scs-platform/actions/runs/44922582006) completed successfully on the exact source SHA. All 10 executable jobs passed, including API unit/coverage, PostgreSQL integration, Web/Admin, Flutter, E6 boundary lint, migration full apply/read-only audit, contract/codegen, build, container smoke and lint/typecheck/format. k6 and protected staging release were skipped.
- Verified the source at the tested SHA contains the PostgreSQL lifecycle case `hides buyer offers for an INACTIVE store`. The integration job ran `pnpm --filter @scs/api test:integration` against disposable PostgreSQL 16 and Redis services and passed. The test checks buyer list and ranked results, preserves the separate ACTIVE store and restores the changed fixture in `finally`.
- Updated the project-memory checkpoint, open issues, roadmap, CI record, authoritative progress tracker and independent-review packet to distinguish implementation, CI verification and independent review.
- G-001 remains PARTIAL pending a reviewer other than the implementation author. G-002 remains IN PROGRESS; the actual staging API/migration identities and protected read-only staging audit remain unverified.
- No shared database mutation, grants/default ACL change, migration 0070, RLS enablement, staging deployment/write, environment change or worker activation was performed.

## 21 November 2026 — documentation formatting workflow

A temporary repository-locked Prettier workflow was added to format the synchronized G-001 CI verification handover. The workflow is self-removing and will not remain in the branch after formatting.

## 21 November 2026 — current-state checkpoint formatting

The current-state handover metadata was reconciled to the latest documentation head and CI #1280 source evidence. A temporary repository-locked Prettier workflow is formatting this checkpoint and will remove itself after the formatting commit.

## 22 November 2026 — G-002 architecture review and PR #142 PostgreSQL identity test

- Rechecked PR #138 and PR #142. Both remain open, draft and unmerged; PR #138 head before this documentation reconciliation was `0fcb7867b7ce8a6085f28ffbcdee5f79a1aa5233`; PR #142 source head was `dddff20c170737dc4694008bb807b2b90e177f77`.
- PR #138 CI [#44948332893](https://github.com/nabeel2323/scs-platform/actions/runs/44948332893) passed all 10 executable jobs. The migration full-apply job ran the read-only audit under a separate `scs_audit` login with no elevated role flags and only database CONNECT. The report confirmed the utility can inspect the disposable PostgreSQL 16 catalog without application table privileges. The migration identity `scs` was a disposable CI superuser and is not staging evidence.
- PR #142 CI [#44948310469](https://github.com/nabeel2323/scs-platform/actions/runs/44948310469) passed all 10 executable jobs on its prior source SHA. Added a real-PostgreSQL integration test on `dddff20c170737dc4694008bb807b2b90e177f77` to validate distinct session/effective roles using a non-owner, non-superuser, non-BYPASSRLS login. Exact-head CI [#44953735602](https://github.com/nabeel2323/scs-platform/actions/runs/44953735602) is in progress; do not mark the new integration test verified until its result is confirmed.
- Added [G-002-RLS-ARCHITECTURE-DESIGN.md](../docs/remediation/G-002-RLS-ARCHITECTURE-DESIGN.md), documenting the role model, transaction-local context requirement, initial ownership classification, isolated PostgreSQL acceptance criteria and staged rollout gates.
- Source review found a global process-wide Drizzle pool and service-layer tenant checks; the inspected request middleware does not provide a universal request-scoped transaction context. RLS must remain disabled until transaction-bound context and all request/worker query paths are covered.
- No staging deployment, shared database write, migration 0070, grant/default-ACL mutation, RLS enablement, environment change or worker activation occurred.


## Work log — 22 November 2026

- Confirmed exact-head PR #142 CI [#44953735602](https://github.com/nabeel2323/scs-platform/actions/runs/44953735602) passed all executable jobs on dddff20c170737dc4694008bb807b2b90e177f77. The real-PostgreSQL integration test verified distinct session_user/current_user values under a non-owner, non-superuser, non-BYPASSRLS login. This is disposable CI evidence only.
- Confirmed exact-head PR #138 CI [#44954371615](https://github.com/nabeel2323/scs-platform/actions/runs/44954371615) passed all executable jobs on 741a09f68721898a5bed6601bc3bc636867c78c2.
- Added G-002-TABLE-OWNERSHIP-MATRIX.md, enumerating 99 exported Drizzle tables with candidate scopes and explicit completion requirements. Updated G-002-RLS-ARCHITECTURE-DESIGN.md with final CI results and inventory link.
- Both PRs remain draft/unmerged. No staging release, shared database mutation, migration 0070, grant/default-ACL change, RLS enablement or worker activation.


## 22 November 2026 — user approval: Implementation Completion Program

- The user approved the revised project-wide execution approach and explicitly requested that the instructions be retained in project memory for future sessions.
- Created [IMPLEMENTATION-GAP-REGISTER.md](./IMPLEMENTATION-GAP-REGISTER.md) as the programme-level register. It defines the implementation-first phases, status vocabulary, evidence requirements, initial workstreams and completion rules.
- Recorded the binding direction in START-HERE, DECISIONS-AND-CONSTRAINTS, IMPLEMENTATION-ROADMAP, OPEN-ISSUES and CURRENT-STATE.
- Agreed sequence: baseline/gap mapping → implementation completion → integration completion → comprehensive testing → stabilization → release readiness.
- During implementation, use proportionate targeted checks rather than repeatedly running full regression. Fix any concrete security/correctness defect immediately; do not knowingly defer it to the later test campaign.
- Existing remediation plan/progress tracker remain authoritative for G-001–G-035 definitions and evidence. Existing independent-review, staging approval, shared-database, migration 0070, grants/default-ACL, RLS, worker, no-merge/no-deploy and release restrictions remain unchanged.
- Baseline CI evidence in the project memory: PR #138 exact-head CI #44954371615 on 741a09f68721898a5bed6601bc3bc636867c78c2 passed all executable jobs; PR #142 exact-head CI #44953735602 on dddff20c170737dc4694008bb807b2b90e177f77 passed all executable jobs including its disposable PostgreSQL identity test. k6 and protected staging release were skipped. Vercel web/admin checks reported the external build-rate-limit page; they are not application test failures.
- No merge, deployment, staging write, live database mutation, migration, grant, RLS or worker action was performed.


## 22 November 2026 — MAP-001 static whole-product inventory

- Reconciled live branch/PR state: branch `remediation/phase-0-1-tenant-security`, head before this inventory documentation batch `2cca47aa34abd1a014ea16217cfee204c9e9f803`; PR #138 open/draft/unmerged; PR #142 open/draft/unmerged.
- Inspected the recursive repository tree (1,625 files) and selected API, web, admin, mobile, shared-contract, schema, migration, test, UX and remediation sources.
- Recorded 20 API modules, 28 module controllers, 25 schema files, 49 web pages, 56 admin pages, 32 Flutter screens, 71 SQL migration files, 152 API unit test files, 82 API integration test files, 18 web test files, 15 admin test files, 10 Flutter test files and 2 Playwright E2E files.
- Created [WHOLE-PRODUCT-IMPLEMENTATION-INVENTORY.md](./WHOLE-PRODUCT-IMPLEMENTATION-INVENTORY.md). Added UX-001–UX-009 to the Implementation Completion Gap Register with exact source paths, acceptance directions and guardrails.
- Reconciled historical UI audit claims: promotions, buyer disputes/evidence, admin audit and analytics, payment list/verification, admin detail views and generic-list permission checks exist in current source. Mobile has role-level merchant/driver route redirects. Historical S3/S4 statuses are not accepted without source revalidation.
- Confirmed current candidates include Admin order actions, refund approval UI, dashboard import/catalog request widgets, flat admin navigation, Product Studio offer step, mobile granular permission affordances, empty SupportModule (scope decision needed), nearby-offers API/UI discrepancy and a complete admin route-permission audit.
- Reviewed the uploaded `Advanced UX Enhancement Prompt.txt`; its actual content is a read-only database/staging audit note, not a UX enhancement specification. Its RLS/function/role/FK-index observations are preserved as uploaded evidence only and were not independently re-run.
- No tests were run; no code, shared DB, staging configuration, migration, grants, deployment or worker state changed. The exact current documentation head still needs a fresh CI lookup and is not CI-verified unless a run is found.


## 22 November 2026 — Admin refund approval queue implementation

- Refreshed live GitHub state: branch `remediation/phase-0-1-tenant-security` at `d02b296982bb2d5b11bb2a6f6a7f8c9b3723f9f0`; PR #138 and PR #142 remain open/draft/unmerged.
- Exact-head CI run #1320 (run ID 44960328088) was found pending on `d02b296982bb2d5b11bb2a6f6a7f8c9b3723f9f0`. Combined statuses show Vercel build-rate-limit failures; these are external preview-provider failures, not application test evidence.
- Implemented a read-only admin refund queue endpoint (`GET /admin/refunds`) requiring `admin:refunds:approve`, returning only REQUESTED refunds, newest first, capped at 100. Approval remains a separate guarded action.
- Added the Admin Payments Refund Requests tab, permission-aware queue loading, order/payment references, amount/currency, reason and request time, plus explicit confirmation before calling the existing approval endpoint. No automatic approval or gateway payout is implied.
- Added a focused controller delegation regression test and extended the Admin API refund type/helper. Comprehensive API/UI regression remains in Phase 3; check exact-head CI after this commit.
- No staging writes, DB changes, migrations, grants/default-ACL changes, RLS enablement, worker activation, deployment, merge or release action.
