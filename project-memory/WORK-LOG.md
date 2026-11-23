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

## 22 November 2026 — Admin refund queue follow-up

- Follow-up commit `f477755cccfdecab8673fdd047935e42e0e85c9c` added the permission-guarded refund queue API, refund request tab, and a focused controller delegation test. Exact-head workflow lookup returned no GitHub Actions run for that commit; combined statuses only showed the Vercel build-rate-limit failures. Do not claim CI verification.
- This follow-up corrects the payments screen layout and initial/tab visibility for users who have refund-approval permission without payment-read permission. The new head must receive its own exact-SHA verification.

## 22 November 2026 — branch and CI checkpoint after refund queue

- Live PR #138 head is `593bc1dfb0948a2b52d29731ab7037a1fa2c9dd1`, open/draft/unmerged; PR #142 is still open/draft/unmerged at `dddff20c170737dc4694008bb807b2b90e177f77`.
- GitHub Actions exact-head lookup returned no run for `593bc1dfb0948a2b52d29731ab7037a1fa2c9dd1`; combined status only reported Vercel web/admin build-rate-limit failures. Do not claim CI verification.
- UX-002 is implemented: requested-refund API queue, Admin Payments Refund Requests tab, explicit confirmation, API types/helper and focused controller delegation test. Full tests remain queued for Phase 3.
- Next implementation target: finish route-to-contract/permission and operation mapping, then safely scope order operations. Preserve all no-merge/no-deploy/database/staging/worker restrictions.

## 22 November 2026 — formatting and exact-head CI reconciliation

- The Admin refund queue implementation and permission-only access correction are present on PR #138. Source implementation is in `f477755cccfdecab8673fdd047935e42e0e85c9c` and `593bc1dfb0948a2b52d29731ab7037a1fa2c9dd1`; this follow-up only normalizes the API additions to the repository's multiline formatting style and synchronizes handover metadata.
- Latest branch/PR head before this follow-up: `a6a5cf24bdb2661673268d229bfcf917c2cc00eb`. GitHub Actions run lookup (both commit-associated and Actions API filtered by exact head SHA) returned no runs. Combined status contained only Vercel build-rate-limit failures.
- Keep the implementation marked IMPLEMENTED, not VERIFIED. Phase 3 API/UI regression and exact-head CI evidence are still required.

## 22 November 2026 — Admin order cancellation implementation checkpoint

- Commit `d4938bc9bdefd9d48d77b21ce5eb96973154c4ef` adds Admin order cancellation UX through the existing cancellation API. It is gated by `orders:cancel`, matches the service's allowed states and canonical reason set, requires notes for OTHER, confirms the action and reloads the order detail/history.
- The permission grant was verified in `rbac-seed.data.ts`: ADMIN explicitly has `orders:cancel`, and SUPER_ADMIN receives all permissions. Existing backend service enforces object access and transactionally handles inventory, shipment, exception, history and outbox effects.
- Exact-head GitHub Actions lookup returned no workflow run for this commit; combined status only showed Vercel build-rate-limit failures. The new UI/API integration is IMPLEMENTED, NOT VERIFIED.
- PR #138 remains draft/open/unmerged; PR #142 remains draft/open/unmerged. No merge, deploy, staging/database mutation, migration, grants, RLS, worker activation or release action.

## 22 November 2026 — Admin dashboard and permission alignment checkpoint

- Added permission-aware Recent Catalog Imports and Pending Catalog Requests widgets to the Admin dashboard, reusing existing APIs and only loading each widget when its canonical permission is present.
- Fixed the Admin `/requests` page guard to `catalog:requests:manage`, matching `CatalogRequestsController`; previously it used `catalog:categories:write`. This closes a concrete route-to-endpoint permission mismatch.
- Renumbered the broad whole-product UX inventory row as UX-010 to avoid collision with the new Admin order-operations UX-001 row.
- Latest source commit `c61b06241025b7ed5207f8ada533be120faadbec` has no associated GitHub Actions run; combined status only shows Vercel build-rate-limit failures. Do not claim CI verification.

## 22 November 2026 — Admin navigation grouping

- Grouped the existing 32 Admin sidebar destinations into Overview, Platform Management, Orders & Fulfillment, Catalog, Finance, Analytics & Governance, and Account.
- Preserved every existing route, label, icon, permission predicate, active-route rule, collapsed tooltip, responsive breakpoint, mobile overlay, footer identity and logout behavior. Group headings are shown in expanded mode and replaced with separators in collapsed mode.
- Corrected the Requests sidebar permission to `catalog:requests:manage`, consistent with the page and API controller. Source inventory count is 32 destinations (not the earlier rough 33 estimate).
- UX-004 is IMPLEMENTED, not Phase 3 verified. No backend, database, staging, worker, deployment or release changes.

## 22 November 2026 — Prettier remediation checkpoint

- CI #1330 exposed a changed-file formatting failure. Lint, typecheck and Flutter analysis/tests passed; the formatter failure prevented downstream test/build/migration jobs from running.
- Used the repository-locked Prettier 3.9.6 in a temporary GitHub Actions formatter workflow to format the touched source and project-memory/remediation docs. Formatter run `44961632176` completed successfully; it committed `635ef98cccb7f9690410b56ed9caa631e92268a4` and removed the temporary workflow from the branch.
- The resulting pull-request CI run `44961636474` is attached to the helper commit `c6d964ea1973e71ff292a0c30d2392ff74ec0ce1`, not the formatted head. A fresh exact-head CI run is still required.
- No staging write, DB change, migration, grant/default-ACL change, RLS enablement, worker activation, merge or deployment occurred.

## 22 November 2026 — exact-head CI and documentation formatting

- CI run #44961723564 on `10a890a3a69f7281b93f4a8e80b735f2228825cb`: lint and TypeScript typecheck passed; Flutter analysis and tests passed. Prettier failed only on CURRENT-STATE.md, RELEASE-AND-CI-STATUS.md, START-HERE.md and WORK-LOG.md. All downstream application/database/build jobs were skipped.
- Running repository-locked Prettier 3.9.6 against those four handover files, then a fresh exact-head CI run is required. Do not claim full verification from this run.


## 22 November 2026 — Admin route permission audit and action-gate fixes

- Reviewed all 56 Admin page route files, global `AuthGuard`, `useRequirePerms`, generic `ManagementPage`, and `managementTables` permission configuration. Added `docs/admin-route-permission-matrix.md` with page-level and observed action-level permission requirements.
- Found that `/calendar` exposed holiday add/remove controls to users with `admin:returns:read` only, although the API requires `admin:returns:write`. Added write permission gating to both controls and mutation handlers, plus a read-only explanation.
- Found that `/returns/[id]` exposed the escalation resolution form/link to users with read permission only, although `POST /admin/returns/:id/resolve` requires `admin:returns:write`. Gated the form, link and submit handler; read-only users now see the required permission.
- Added focused Admin component tests for read-only and write-authorized calendar/return workflows. Comprehensive role/deep-link/action verification remains in Phase 3; no local or CI test execution is claimed in this handover.
- Updated UX-009 and whole-product inventory. Next: map the 32 mobile screens/routes and granular permission/action affordances, then complete remaining web/API and worker/provider ownership mapping.
- Actions budget constraint recorded: approximately 90% of GitHub Actions minutes consumed; related work is batched and the comprehensive campaign is deferred until implementation/integration completion.
- The pre-batch branch head was `cd1d7de837d3c519db4a249479effe65db5fce53`; this grouped commit is the implementation checkpoint following it. PR #138 remains draft. No database/staging/deployment/migration/grant/RLS/worker/release action occurred.


## 2026-11-22 — Mobile authorization parity continuation

- Re-read `project-memory/START-HERE.md` and relevant project-memory decisions, gaps, inventory, current-state, release, roadmap, and work-log material before changing code.
- Verified branch `remediation/phase-0-1-tenant-security`, PR #138, and baseline head `06cd8fc1e56dc7ef64a141b97b594adc96ffbece`.
- Baseline CI #1337: changed-file formatting failed for nine PR files; Flutter passed; dependent checks were skipped. No new CI run is requested for this implementation commit because the user has consumed 90% of GitHub Actions minutes and asked to consolidate implementation before one testing/fixing phase.
- Added mobile permission parsing, route policy, Access Restricted screen, router refresh on profile/active-org changes, permission-filtered buyer/merchant navigation, and action-level checks across organization, driver, order, merchant-order, inventory, catalog, store-profile, and cart flows.
- Added focused route/profile permission tests and `docs/mobile-route-permission-matrix.md`. Test execution remains pending.
- Follow-up: reconcile missing `identity:organizations:create` seed/default grants with organization type and creator-role policy; then complete the remaining action-affordance audit and run one consolidated formatter, Flutter, backend, security, and CI validation.


## 2026-11-22 — Mobile authorization follow-up review

- Reviewed the pushed mobile authorization commit and found remaining action-affordance gaps: Home discovery visibility, product-detail variant/offer cart buttons, merchant registration mutations, and the low-stock KPI destination.
- Closed those gaps in one grouped follow-up commit. The registration wizard now distinguishes create-organization permission from invitation-based joining and checks store-write before create/verification.
- The merchant route builder already honors the `tab` query parameter; no duplicate router change was needed.
- CI remains intentionally deferred. Finish the remaining permission audit, then perform one consolidated formatter, Flutter, backend, security, and CI validation run.


## 2026-11-22 — Registration active-organization correction

- Reviewed the mobile permission commit and found that the merchant registration wizard created/joined an organization without persisting it as the active organization. Its following store-write check could therefore inspect stale or empty permissions.
- Added a shared activation helper that writes secure storage, updates `activeOrgIdProvider`, invalidates the profile, and awaits the refreshed permission projection before proceeding.
- Invalidated store/warehouse caches after registration writes and clarified the no-business dashboard CTA for create vs invite-join access.
- CI remains deferred under the agreed Actions-minute budget; run all mobile/backend/security/format checks once after the implementation batch is complete.


## 2026-11-22 — Organization onboarding RBAC seed reconciliation

- Inspected `0069_organization_onboarding_permission.sql`, the OrganizationsController guard, and canonical RBAC seed data.
- Supabase read-only SQL: `public._migration_log` confirms migration 0069 applied on 17 November 2026. Permission-role join confirms `identity:organizations:create` exists for BUYER, ADMIN, MERCHANT_OWNER, and SUPER_ADMIN.
- Corrected the earlier finding: staging grants were already correct; only `rbac-seed.data.ts` was stale. Aligned PERMISSIONS and the four role grants with migration 0069 and added a regression assertion against the actual `ROLES` seed.
- No database write, privilege change, deployment, or new migration was performed.


## 2026-11-22 — Admin read-permission alignment

- Reconciled PR #138 to exact source head `c660a9276da13a5df17af9161b3d5efc5d6ff0b3` and confirmed it remained open/draft/unmerged. Exact-head Actions lookup returned no workflow run; only external Vercel build-rate-limit statuses were present.
- Fixed `apps/admin/src/app/commission/page.tsx`: enforce `admin:commission:read`, render AccessDenied, and do not issue the commission-reversal API request without access.
- Fixed `apps/admin/src/app/page.tsx`: gate KPI fetch/section by `admin:kpis:read` and organization-update fetch/section by `admin:users:read`; preserve existing independent catalog import/request gates and add an organization-update loading state.
- Added `apps/admin/src/__tests__/dashboard-permissions.test.tsx` covering unauthorized request suppression and permitted access for both dashboard data groups and commission reversals.
- Updated Admin route matrix and UX-003/UX-006 classifications. UX-006 is IMPLEMENTED / NOT VERIFIED; full role/deep-link/action testing remains Phase 3.
- Validation intentionally deferred; no Actions workflow was triggered by this grouped `[skip ci]` commit. No backend permission, role grant, DB, staging, migration, worker, deployment or release behavior changed.


## 2026-11-22 — Cart API permission parity and route inventory

- Reconciled the current PR #138 branch after the Admin read-gate batch. Inspected all 28 API module controller files and added `docs/api-route-permission-matrix.md` mapping route families, primary client surfaces and permission boundaries.
- Found `GET /offers/nearby` in `PromotionsController`; corrected the earlier inventory assumption that no route existed. The service currently ignores coordinates/radius and returns active promotions by date/limit; no matching wrapper was found in the inspected web/mobile API clients and Home/Search entry pages. UX-008 remains pending a product/location decision.
- Found CartController mutations had only JWT auth and no `orders:write` permission. Added the canonical permission guard to all cart mutations while retaining authenticated self-scoped GET. Added controller metadata/guard tests.
- Updated MAP-001 and API-001 documentation. Validation is intentionally deferred; no GitHub Actions run, database change, migration, role grant, staging write, worker activation, deployment or release action occurred.


## 2026-11-22 — Aramex provider registry wiring

- Reviewed the existing outbox ownership map and staging runtime topology before extending MAP-001; avoided duplicating the already documented worker ownership model.
- Found that `AramexProvider` was registered in Nest DI but not in `ShippingProviderRegistry`. `ShippingCarrierWorker` resolves explicitly configured provider keys through that registry and otherwise defaults shipment create/cancel/label operations to `manual-driver`; `CarrierTrackingPoller` separately falls back to `aramex`, so Aramex-configured operations and tracking polls could not resolve the provider.
- Updated `ShippingService.onModuleInit` to register Aramex as non-default while retaining `manual-driver` as the default. Optional injection preserves existing direct construction tests. No credentials are loaded and no external HTTP call occurs at startup.
- Added a focused registry integration unit test and documented the ownership/activation boundary. Validation deferred to the consolidated Phase 3 campaign; no CI, deployment, secret, DB, migration or live carrier action occurred.


## 2026-11-22 — Post-implementation static review correction

- Static inspection of the Admin dashboard found the Completion Rate card still referenced the old `loading` variable after the KPI/org split. Corrected it to `kpisLoading` and normalized conditional JSX indentation/loading markup.
- Added the missing `Card` export to the UI-kit test mock and made the Aramex provider stub cast explicit through `unknown` to satisfy TypeScript's structural-cast rules.
- Updated the API matrix source checkpoint to the Aramex registry wiring commit. No tests or CI were run; this remains part of the single consolidated Phase 3 verification campaign.


## 2026-11-22 — Client wrapper and worker activation mapping

- Matched Admin, Web and Mobile API wrapper symbols to the 28-controller route-family inventory and recorded them in docs/api-route-permission-matrix.md. Exact page/screen call-site mapping remains open. The nearby-offers endpoint has no wrapper in the inspected API clients; its service still ignores geographic inputs.
- Corrected the provider fallback description: shipment create/cancel/label paths use manual-driver when no provider is configured; only CarrierTrackingPoller falls back to aramex. The registry fix makes explicit Aramex provider selection and tracking polls resolvable.
- Verified source activation boundaries: P13 return-expiration is opt-in and disabled by default; P13Monitor is an always-on read-only scanner with Postgres dedup and log-only alert fallback; other in-process workers start without the P13 flag and use their own claim/lease logic. No runtime activation or deployment change was made.


## 2026-11-22 — G-002 database access-path inventory

- Reviewed all 53 API module service/worker/provider TypeScript files plus DatabaseService/Module, AuditService, AuditLogMiddleware, JwtAuthGuard, PermissionsGuard, AppModule and main.ts.
- Recorded the bounded source findings in docs/remediation/G-002-DATABASE-ACCESS-PATH-INVENTORY-2026-11-22.md: singleton Drizzle handle; typed and raw execute(sql...) operations; multiple existing nested service transactions; asynchronous post-response audit writes; worker/monitor/bootstrap DB access outside HTTP request context; and raw PoolClient limited to DatabaseService startup identity and development/test migrations/seeding within the reviewed application path.
- No global transaction interceptor or AsyncLocalStorage adapter was added because the architecture requires complete operation-path, nested-transaction, audit and worker-context proof first.
- No live staging DB query, migration, role/grant change, RLS enablement, worker activation, deployment or test run occurred.


## 2026-11-22 — G-002 database operation map, source slice 1

- Inspected 13 core API service files on the remediation branch: IdentityService, MerchantService, CatalogService, CatalogOfferService, CatalogRequestsService, CatalogTaxonomyService, PricingService, InventoryService, OrdersService, PaymentsService, ReturnsService, ShippingService and AuditService.
- Added `docs/remediation/G-002-DATABASE-OPERATION-MAP-2026-11-22.md` with direct Drizzle read/insert/update/delete observations for the schema symbols used by those services.
- Confirmed cross-module access paths: catalog projections read store/warehouse/pricing/inventory/offer/taxonomy data; order lifecycle touches orders, shipment, inventory, financial and outbox rows; payments and returns cross-reference financial/order/shipping/inventory records.
- Kept the evidence explicitly preliminary: direct source-symbol patterns are not a runtime call graph, do not establish exact tenant predicates, and do not cover all workers, webhooks, CLI/raw-SQL or database objects.
- Updated DB-003 in the programme gap register. No application code, tests, CI, live database query/write, migration, grants, RLS, staging, deployment, provider call or worker activation occurred.


## 2026-11-22 — G-002 supporting service and worker operation map

- Extended the G-002 source map with cart, promotions, notifications, analytics, disputes, reviews, generic outbox, carrier worker, P13 monitor, worker lease, ops alert, auto-complete worker and return-expiration worker paths.
- Recorded schema-backed Drizzle operations and separately identified raw-SQL touchpoints such as `worker_leases`, `ops_alerts`, `orders` and `return_requests`. The raw SQL list is explicitly not treated as a complete statement-level access map.
- Documented the separate ownership concerns for outbox consumer eligibility, worker/system identity, order/return delegated transitions, user-private notification/device rows, analytics privacy, and dispute/conversation participant ownership.
- DB-003 remains IN PROGRESS: remaining module services, webhook/CLI/migration paths, exact SQL statement predicates, full FK ownership, non-Drizzle physical relations and the 114-vs-116 discrepancy are still open.
- No tests, CI, live DB query/write, migration, grants, RLS, staging/deployment, provider call or worker activation occurred.


## 2026-11-22 — G-002 schema ownership and predicate candidates

- Reviewed the Drizzle schema declarations for identity, merchant, catalog, taxonomy, orders/cart/shipments, payments, returns, promotions, inventory, pricing, notifications, audit, reviews/disputes, shipping, catalog imports and operations.
- Created `docs/remediation/G-002-TABLE-OWNERSHIP-AND-PREDICATE-CANDIDATES-2026-11-22.md` with preliminary ownership paths and principal classes: PLATFORM, ORGANIZATION, STORE, BUYER, ORDER, PARENT, SYSTEM and MIXED.
- Recorded critical multi-owner relationships: buyer/store order participants, store/warehouse/variant inventory, payment/refund/return lineage, assigned-driver shipment access, conversation participants, provider-credential webhook identity and worker/system records.
- Explicitly separated owner columns from actor-attribution fields such as created_by, uploaded_by, reviewed_by, performed_by and actor_id. Flagged plain UUID references and missing direct org columns for migration/catalog verification.
- Extended the operation map with AdminService, CatalogImportService, StoreMembershipService, carrier tracking/webhook, reconciliation and operations-control paths. Updated START-HERE and DB-003 evidence links.
- These are static source observations only. No tests, CI, live DB query/write, migration, grants, RLS, staging, deployment, worker activation or provider call occurred.


## 2026-11-22 — G-002 expanded import, carrier and financial operation paths

- Extended the operation map to 33 service files, including ExcelExecutorService, carrier credential/configuration/reconciliation services, commission reversal, settlement adjustment and business calendar.
- Recorded that catalog import execution uses ordered per-entity-type transactions and preserves partial-failure semantics; request transaction design must not collapse those boundaries.
- Added carrier credential/configuration paths, including organization/store consistency and the privileged decrypt boundary.
- Added financial ownership candidates for commission reversals, settlement adjustments/approvals, reconciliation runs/discrepancies and business calendar/holiday/audit rows.
- Flagged business calendars as unresolved configuration scope: schema comments describe tenant/global calendars but the inspected declaration has no direct org_id.
- No tests, CI, DB query/write, migration, grants, RLS, staging/deployment, provider call or worker activation occurred.


## 2026-11-22 — API-003 canonical merchant read-permission alignment

- Audited every permission decorator in the 25 controller files listed by the API route matrix against the canonical PERMISSIONS seed and built-in role grants.
- Found the unseeded permission key merchant:products:read on five CatalogController read routes (merchant moderation history and store import list/detail/chunks/errors) and the store-member list route. No built-in role can satisfy a permission absent from the canonical seed.
- Corrected CatalogController reads to the existing catalog:products:read permission while preserving assertStoreInOrg/assertStoreMember or assertProductEditableByMerchant checks.
- Corrected StoreMembershipController member-list access to the existing merchant:stores:read permission and granted that already-defined key to MERCHANT_STAFF as well as MERCHANT_OWNER. Membership-manager checks still gate eligible-user and mutation routes; all mutations continue to require merchant:products:write.
- Added focused API tests for the catalog route decorators, PermissionsGuard behavior and role-seed alignment, plus store-member list permission/guard alignment.
- Updated docs/api-route-permission-matrix.md and added API-003 to the programme gap register. No new permission key, database migration or grant was added.
- Tests were added but not executed; no CI run was triggered. No staging/database mutation, migration, deployment, worker activation or provider call occurred.


## 2026-11-22 — API-003 RBAC seed verification correction

- A follow-up inspection of the MERCHANT_OWNER and MERCHANT_STAFF role blocks caught an insertion-position mistake in the first seed edit: it duplicated merchant:stores:read on MERCHANT_OWNER instead of adding it to MERCHANT_STAFF.
- Corrected the seed: MERCHANT_OWNER has one existing merchant:stores:read grant; MERCHANT_STAFF now has one grant; no duplicate or new permission key remains.
- Re-read the final role blocks and confirmed CatalogController has five catalog:products:read decorators, StoreMembershipController has merchant:stores:read for member listing, and neither controller references merchant:products:read.
- The focused test asserts both owner and staff role grants and should catch future drift. Test execution remains deferred to the consolidated campaign.


## 2026-11-22 — G-002 migration foreign-key crosswalk

- Reviewed migrations 0034, 0043, 0054, 0058, 0059, 0060, 0061, 0062, 0063, 0070 and 0071.
- Created docs/remediation/G-002-MIGRATION-FOREIGN-KEY-CROSSWALK-2026-11-22.md to record migration-defined parent relationships, deferred FKs, actor-attribution links, financial lineage and system-table boundaries.
- Confirmed 0062 adds org_id to reconciliation_runs, settlement_adjustments, commission_reversals and reconciliation_discrepancies without an FK to organizations; these are application-maintained scope fields whose consistency must be proven against order/store/return parents.
- Confirmed 0063 worker_leases, ops_controls, ops_control_audit, ops_alerts and p13_pilot_allowlist have no tenant/user FKs; they are system/operator state, not ordinary tenant rows.
- Confirmed 0060 business_calendars has created_by but no org/store key; its tenant-vs-global comment is not reflected in the table structure. 0034 catalog_imports is explicitly platform-level and uploaded_by is attribution.
- Reaffirmed migration 0070 revokes anon/authenticated table/sequence privileges and defaults and pins normalize_arabic search_path, but does not enable RLS or change service_role. Migration 0071 adds auto-complete claim fields/index only.
- No staging catalog query, database write, migration, grant/default-ACL change, RLS activation, deployment, worker activation or provider call occurred.


## 2026-11-22 — G-002 earlier migration FK crosswalk extension

- Extended the migration crosswalk with core schema constraints from migrations 0001, 0003, 0004, 0005, 0009, 0010, 0023, 0026, 0040 and 0041.
- Added explicit membership, store/warehouse, catalog, inventory, cart/order, offer, shipment/driver, shipping-zone, label/proof and webhook FK paths.
- Flagged the absence of composite consistency constraints for multi-parent rows such as verification requests, business documents, cart items, inventory items, merchant offers, order participants, settlement records, carrier configurations, delivery-zone methods and driver-store assignments.
- Reaffirmed that a child-table RLS predicate must verify every required parent relationship; one valid FK alone does not guarantee all referenced parents belong to the same tenant.
- No live catalog query or DB mutation occurred; this remains migration-source evidence only.


## 2026-11-22 — G-002 service and operator access-path implementation

- Reconciled the API source tree at 06c5f25f1e0a967129ddae8b94b33e060f2e9691 and completed inspection of all 53 service/worker/poller/dispatcher/executor candidates. The operation map records 44 DB-operation paths and identifies 9 DB-independent parser/rule/provider/crypto helpers.
- Added docs/remediation/G-002-CLI-AND-BOOTSTRAP-ACCESS-MAP-2026-11-22.md, covering runtime startup, migration runners, migration identity/lock helpers, RBAC/catalog/demo seeds, bootstrap token issuance/completion, staging provisioning, read-only audit, reset utilities and legacy UAT/migration harnesses.
- Hardened scripts/create-admin-user.ts: removed the fixed SUPER_ADMIN password and local DSN fallback; require explicit development/test, local database host, opt-in and caller-supplied credentials; create organization/user/membership in one transaction; never log the password.
- Hardened infra/drizzle/reset-pg.ts: require explicit environment, exact database name, typed DROP confirmation, local host for development/test and a second approval for staging; verify the connected database identity before dropping tables. The reset was not executed.
- Hardened scripts/m6-env-check.ts: require development/test and explicit UAT opt-in, validate local API/Redis hosts, read credentials from environment, redact OTP values and avoid logging raw verification responses.
- Source review found application OTP redaction in IdentityService/OtpDeliveryService with otp-redaction and otp-security-remediation regression tests already present. Deployed staging log verification remains an external runtime gate.
- Remaining script debt is explicit: legacy M5/M6 UAT and migration harnesses still include direct SQL, fixed local test credentials and/or DATABASE_URL overrides; staging bootstrap scripts need a uniform target-environment confirmation guard. They were not run.
- No tests or Actions were run. No staging/shared DB command, migration, seed, reset, bootstrap, grant, RLS change, deployment, worker activation or provider call occurred. Next source task is controller-to-service-method-to-table operation mapping.


## 2026-11-22 — G-002 physical database object inventory and read-only audit

- Reconciled the 19-November 114 public ordinary/partitioned table count at source level: 99 Drizzle declarations plus public._migration_log, public.backfill_errors and 13 analytics_events partitions (default plus 12 monthly partitions).
- Traced _migration_log to the migration runners; traced backfill_errors to migration 0053 only; traced analytics_events parent/partitioning/retention to audit.schema.ts and migrations 0002/0013/0018. Analytics event identity comes from CurrentUser; analytics:read is platform ADMIN/SUPER_ADMIN, not merchant roles.
- Added docs/remediation/G-002-PHYSICAL-DATABASE-OBJECT-INVENTORY-2026-11-22.md and updated schema coverage, CLI and service operation maps.
- Enhanced apps/api/scripts/audit-db-access.ts (still BEGIN READ ONLY) to enumerate relation kinds, owners, RLS/policy/extension/partition metadata, partition bounds and safe migration/backfill summaries. No audit was run.
- The 116 historical count remains unresolved; the next protected read-only run must compare relation-kind scopes and enumerate current partitions.
- Current branch head: 2477a958699a933c71f168d5397f39ca0ab26a34. Current head has no Actions run; Vercel Admin/Web both report build-rate-limit failure. No tests were run.


## 2026-11-22 — UAT and staging bootstrap safety completion

- Added apps/api/scripts/local-uat-safety.ts and applied it to 11 M5/M6 TypeScript UAT/diagnostic scripts. The separately hardened m6-env-check.ts retains its explicit local guard. Both b1-migration-test.js and p311-migration-verify.js now require development/test plus explicit UAT confirmation.
- The shared UAT helper rejects missing/non-development environment, missing SCS_UAT_CONFIRM, and remote DB/API/Redis hosts where targets are supplied. M5 DATABASE_URL overrides can no longer point to a remote DB. It cannot inspect the DB behind a separately running local API; that remains an operator precondition.
- Added staging-bootstrap-safety.ts and verify-staging-bootstrap-target.ts. All five staging bootstrap scripts call the helper before BEGIN/write; db:bootstrap:staging now runs the target preflight before RBAC seed and bootstrap commands.
- Staging bootstrap requires SCS_ENVIRONMENT=staging, SCS_STAGING_BOOTSTRAP_CONFIRM=true, exact SCS_STAGING_BOOTSTRAP_DATABASE and SCS_STAGING_BOOTSTRAP_APPROVAL=I_APPROVE_STAGING_BOOTSTRAP:<database>. The connected current_database() is compared before writes.
- Added unit tests for both guard helpers; tests were not run. No UAT/migration/bootstrap script was executed and no database connection was opened by this implementation.
- Current branch head: b78ad3137ecc7820e8a4a0c3816a772bff764c3d; no Actions run; Vercel Admin/Web report provider build-rate-limit failures.


## G-002 method-level predicate batch 3 — Pricing, Merchant and Store Membership — 22 November 2026

Completed source mapping and implementation for PricingService, MerchantService and StoreMembershipService. Fixed cross-store price-tier relationships at the PricingService boundary; inactive organization members can no longer list/download merchant documents or enumerate organization verification requests; document uploads validate the caller's active organization, current organization membership and optional store ownership/membership. Organization-scoped store/customer reads now receive caller context from MerchantController.

Added focused specs merchant-service-tenant-scope.spec.ts and pricing-service-tenant-scope.spec.ts; they are committed but not run. See the G-002 method-level predicate map. Next method-level batch: Returns/Disputes/Reviews. Then carrier/shipping and worker/outbox/bootstrap/system. Full testing remains deferred to the consolidated phase.


## 2026-11-22 — G-002 method-level predicate batch 4

- Scoped return inspection inventory lookup to the warehouses of the return order's store, preventing canonical variants from restoring stock into another merchant's warehouse.
- Settlement adjustment creation now derives actual org from sub-order → store, rejects supplied org mismatch, validates returnRequestId belongs to the same sub-order, and rechecks target-org consistency in locked transitions/detail reads.
- Reconciliation discrepancy resolution now uses financialOrgScope and repeats the org predicate in the UPDATE statement.
- Reviewed DisputesService participant checks and ReviewsService order/buyer/subject checks; no additional code change was required. BusinessCalendarService is platform-global admin-controlled configuration.
- Added three focused unit specs; tests not run. No CI, database connection/query/write, migration, grant/RLS, staging, deployment, worker or provider action occurred.


## 2026-11-22 — G-002 method-level predicate batch 5

- Added assertActiveOrgMembership and applied it to shipping store CRUD, carrier credential/config management, shipment operations and carrier recovery.
- CarrierConfigurationsService.resolveForStore now validates store→org and credential→org/active before returning store or org defaults.
- Removed Aramex resolveAnyCredential cross-tenant fallback. Store-bound operations require store context and use the store's configured active credential; global address validation is PLATFORM-credential-only.
- Updated tracking callers (ShipmentOperationsController, ShippingCarrierWorker, CarrierTrackingPoller, CarrierReconciliationService) to pass storeId.
- Worker validates outbox store/org metadata against shipment→store→org before provider side effects; webhook retry checks active credential/org. Shipment writes repeat id + store predicates and outbox events carry tenant metadata.
- Added shipping-tenant-context.spec.ts and updated shipping-carrier-worker-label.spec.ts. Tests not run; no CI, DB, migration, grants/RLS, staging, deployment, worker activation or carrier/provider calls.


## 2026-11-22 — G-002 worker/system and operator-context continuation

- Closed the return-expiration lease race: the bounded claim statement locks the current live P13 lease; ReturnsService.escalateReturn requires either a privileged platform caller or a worker holder/epoch fence; worker escalation locks and revalidates the lease inside the same transaction as the return update; outbox/event writes occur only after a successful transition.
- Added organization/store validation to PilotControlService.addAllowlistEntry because p13_pilot_allowlist has no foreign keys.
- Fixed WorkerLeaseService expiry semantics: renewAndFence, isLiveHolder, poll-success, poll-failure and release now all reject expired ownership. An expired worker must reacquire and receive a new epoch.
- Fixed P13 alert delivery races across API instances: INSERT ... ON CONFLICT DO NOTHING RETURNING id is checked; PENDING/FAILED/SENT-repeat/stale-SENDING rows are claimed atomically as SENDING; stale claims are recoverable; SENDING appears in the open-alert view. Added migration 0073 for the open-alert index.
- Added focused tests for each correction. Tests remain unexecuted by design; no CI was triggered.
- Completed source-level worker/operator/bootstrap/audit/outbox context mapping. OutboxDispatcher remains log-only; real event-bus delivery is a deferred integration decision.
- No migration was applied, no worker was enabled, and no live database, staging, deployment, grant/RLS or provider action occurred.


## 2026-11-22 — UX-012/UX-013 and pricing read-scope continuation

- Implemented the mobile merchant pricing workflow: store-scoped price-list listing/creation/editing/activation; quantity-tier CRUD; product/variant selection; price-list linkage during offer creation; MOQ coverage preflight; offer-detail navigation to the linked price list.
- Enriched price-tier reads with product title, variant title and SKU for merchant-facing tier rows.
- Hardened PricingService.listTiersByVariant: storeId is mandatory for every path; the query joins priceLists and filters to the owning store. The pricing controller supplies the store resolved from the variant; the internal resolver passes its known store.
- Improved Admin order detail: AdminService joins product/variant labels and the Admin UI renders product title, variant title and SKU instead of only UUIDs.
- Added focused tests for mobile pricing route permission, price-tier enrichment, variant-tier store isolation and admin order labels. Tests not run; no CI triggered.
- Updated UX-012 and UX-013 in the gap register. Broad UX-010 source re-audit remains the next implementation stream.
- No migrations, DB writes, grants/RLS, staging/deployment, worker activation or external provider calls.


## 2026-11-22 — UX-015 Product Studio save-flow integrity

- Source review confirmed StepOffer already uses the selected store's active warehouse selector; the older whole-product inventory statement about a raw warehouse ID was stale and has been corrected.
- Fixed the Product Studio save sequence. Offer-step Next now validates store/title, blocks while saving, waits for product-only persistence and does not advance on a null/failed result. The intermediate save no longer creates the commercial offer; the final Review save creates it once.
- Variant creation retries reload persisted variants and skip existing SKUs, avoiding duplicate variants after partial failure. The dirty-state baseline now captures the actual saved state; save callback dependencies include loaded brands and offer-creation state.
- Added `apps/web/src/lib/product-studio-flow.ts` and `apps/web/src/__tests__/product-studio-flow.test.ts` covering five transition cases. Not executed by design; comprehensive validation remains at the end.
- Source baseline: `3adb376515137bf49da4b44699e1b3c731389504`. Documentation and hook correction are included in the next grouped commit; resolve live branch SHA afterward.
- PR #138 remains draft. No staging/shared DB, migration, grants/RLS, deployment, worker activation or external provider calls occurred.


## 2026-11-22 — UX-016 buyer cart mutation recovery

- Added `apps/web/src/lib/cart-actions.ts` to serialize cart mutations, surface API errors, refresh after success and always release pending state. Quantity/remove/clear handlers use it.
- Cart action controls now expose accessible names and pending feedback; promo application and checkout navigation are disabled during a cart mutation.
- Cart loading now falls back from validation to plain fetch without discarding the last known cart; if both reads fail, it shows a retryable load error instead of a false empty-cart state.
- Added `apps/web/src/__tests__/cart-actions.test.ts` for success/refresh and error/pending cleanup. Not executed; broad tests remain at the final campaign.
- Source baseline: `c04b722528d70c1c85261b5d160f14ad422b1f64`. Documentation synchronization is in the next grouped commit; resolve live SHA afterward.
- No staging/shared DB, migration, grants/RLS, deployment, worker activation or provider call occurred.


## 2026-11-22 — UX-017 Admin returns oversight recovery

- Updated Admin returns queue with shared retryable error state, error branch rather than false empty queue, and request-version protection against out-of-order filter responses and stale unmounted updates.
- Updated return detail with shared loading skeleton, retryable error state and explicit not-found state. The loader now returns a promise and is awaited after escalation resolution.
- Added focused tests to `apps/admin/src/__tests__/management.test.tsx` for queue and detail retry recovery. Tests not run.
- Source baseline: `d581d7b649139b04be62f1fbe7fed72cc6a11546`. Docs sync follows separately.
- No database, migration, deployment, worker activation, grants/RLS or provider actions.


## 2026-11-22 — UX-018 Mobile cart mutation locking

- Added `_itemActionBusy`/`_busyItemId` locking to mobile cart quantity and remove operations; the active line shows a progress indicator and all cart controls are disabled while a cart mutation is active.
- Added optional `enabled` to `QuantityStepper`, disabling decrement, increment and direct entry during pending cart operations. Existing callers remain enabled by default.
- Failed quantity updates invalidate cart data and bump a stepper key to restore the provider-backed value instead of leaving optimistic text visible.
- Added `mobile/test/cart_quantity_stepper_test.dart` for disabled and default-enabled behavior. Not executed.
- Source baseline: `cfea06ea07e9a140672f3f741815ebf745354e1d`; documentation sync follows separately.
- No DB, migration, deployment, worker activation, grants/RLS or provider actions.


## 2026-11-22 — UX-019 Admin dispute and evidence recovery

- Added `loadDispute` retry with request-version protection and a shared AdminErrorState. Detail reads clear prior errors and ignore stale completions.
- Added independent Events/Evidence request sequencing, clears old event rows before a fresh load, and exposes retry after failures.
- Added tests in `apps/admin/src/__tests__/management.test.tsx` for dispute detail retry and evidence timeline retry. Not executed.
- Source baseline: `344c4b1300a20b2ec33dfc264d975aff27c4da57`; docs sync follows separately.
- No DB, migration, deployment, worker activation, grants/RLS or provider calls.


## 2026-11-22 — UX-020 Admin user/merchant/organization detail recovery

- Added retryable request callbacks and request-version guards to user, merchant and organization detail pages. Each retry clears stale errors and ignores obsolete requests.
- Split user permission catalog loading from the main user record. Permission catalog errors are isolated to the Permissions tab with an independent retry action.
- Added focused component tests in `apps/admin/src/__tests__/management.test.tsx` for user, merchant and organization detail recovery. Not executed.
- Source baseline: `b20bdbfea47365bd8478f06cfa7ed4e73ce6d613`; docs sync follows separately.
- No DB, migration, deployment, worker activation, grants/RLS or provider calls.


## 2026-11-22 — UX-021 Admin dispute resolution workflow

- Added an Admin dispute Resolution section for non-resolved disputes, with required decision text and `PATCH disputes/:id/resolve` request.
- The form disables invalid/concurrent submissions, shows API errors and progress, reloads dispute detail after success, and displays the stored resolution when already resolved/closed.
- Preserved the API permission and service-level platform-admin guard; no refund amount or unsupported body fields were invented.
- Added a focused test to `apps/admin/src/__tests__/management.test.tsx`. Not executed.
- Source baseline: `e6c56d1c32a0e7d496db62e4ae69025d9e624ccd`; docs sync follows separately.
- No DB, migration, deployment, worker activation, grants/RLS or provider calls.


## 2026-11-22 — live project-memory reconciliation

- Re-read START-HERE and the current project-memory plan, gap register, inventory, open issues and release history; verified the live branch/PR and latest Actions run/check statuses.
- Reconciled the current branch head before this refresh to `7031cafcd94300421cf314aa6ac3ba3d3ef59651`; PR #138 is open/draft/unmerged to `develop`.
- Exact-head Actions lookup is empty. Vercel Admin/Web statuses are rate-limited failures. The latest actual Actions run #44963271498 on older SHA `06cd8fc1e56dc7ef64a141b97b594adc96ffbece` failed at changed-file Prettier; Mobile passed and dependent jobs were skipped.
- The project-memory current starting point and next action are updated to the implementation-first UX-010 continuation. UX-015–UX-021 have focused tests committed but not executed.


## 2026-11-22 — UX-022 Admin detail recovery expansion

- Added retryable primary-read callbacks and stale-request protection to Admin attribute, brand, import-job, offer, order, role, variant, category and product-type detail pages.
- Catalog import Errors and Offer Inventory tabs now show explicit retryable errors when reads fail; they no longer imply empty data. Role permission-save errors are isolated inline and the save guidance now matches the explicit Save Permissions button.
- Added tests in `apps/admin/src/__tests__/management.test.tsx` for attribute retry, order retry and import error-tab retry. Not executed.
- Source baseline: `9578040e4d28b327c451618f2111ba3ae8819493`; docs sync follows separately.
- No DB, migration, deployment, worker activation, grants/RLS or provider calls.


## 2026-11-22 — UX-023 Admin ProductDetails offers recovery

- Replaced the one-shot merchant-offer fetch in ProductDetails with an awaitable request-version guarded loader, loading skeleton, retryable error and true-empty state.
- Added a component test in `apps/admin/src/__tests__/management.test.tsx` for an offers read failure followed by a successful retry returning no offers. Not executed.
- Source baseline: `486650b19040c8e4d974e7fb7875f8a47cb46d9c`; docs sync follows separately.


## 2026-11-22 — UX-024 Admin financial workflow recovery

- Payments and Settlements now separate load errors from action errors, expose Retry, hide false empty states and ignore stale tab/filter responses.
- Reconciliation now has separate list/detail/action errors, retryable run-list and selected-run detail reads, and stale-response guards. Settlement Adjustments now has retryable list reads, action-error separation and filter request sequencing.
- Added four tests to `apps/admin/src/__tests__/management.test.tsx` for payment queue, settlement, reconciliation and settlement-adjustment read failure → retry → successful empty results. Not executed.
- Source baseline: `2fb4628b58420e0e9350bfb296b6266f291ca58d`; docs sync follows separately.
- No database, migration, deployment, worker activation, grants/RLS or provider actions.


## 2026-11-22 — Product Studio save and update completion (UX-015 / UX-025)

- Progress stepper navigation is now sequential; it routes Offer → Media through the same persistence helper as Next and disables all steps while saving. This closes the direct-step-click bypass.
- Product Studio now PATCHes existing products on subsequent saves rather than silently ignoring edits made after navigating back. Product `updatedAt` is carried forward for optimistic locking.
- Added supported productTypeId and GTIN/EAN/MPN fields to create/update payloads and validates store/title in the save routine.
- Added `apps/web/src/__tests__/product-studio-progress.test.tsx` and an existing-product update failure case in `product-studio-flow.test.ts`. Not executed.
- Source baseline: `49b28054855fa3e18ade7e17aca0395124713a6f`; docs sync follows separately.
- No database, migration, deployment, worker activation, grants/RLS or provider calls.


## 2026-11-22 — UX-026 / UX-027 Product Studio canonical and media integrity

- Product Studio now prefers `useExistingProductId` over a stale wizard product ID, reuses the canonical product and skips product/attribute/variant/media mutations for shared catalog data. Existing canonical identity/specification/media steps are read-only.
- Existing selected variant is passed as `variantId` to the merchant-offer create request. Offer idempotency state resets when canonical selection changes.
- Added `persistProductStudioMedia` to attach uploaded/linked media to merchant-owned products via `addMedia`, after re-reading existing media URLs to skip duplicates on retries. Canonical media is not touched.
- Added unit tests for canonical product target precedence and media dedupe/empty no-op. Not executed.
- Source baseline: `0ebce8be9abd89f8370e208698123c9786ae72e6`; docs sync follows separately.
- No DB, migration, deployment, worker activation, grants/RLS or provider calls.


## 2026-11-22 — UX-027 Product Studio offer retry-safety continuation

- Added store/product/variant-scoped Product Studio offer retry keys so changing seller or variant does not reuse a prior target's save marker.
- Before create retry, the client reads existing store offers and compares product/variant, currency, nullable lead time, warehouse, base price and MOQ. A matching existing offer is reconciled as the result of a possibly-lost response; conflicting terms route the merchant to the Offers surface.
- Existing nullable legacy prices are typed and compared safely; null never coerces to the desired price.
- Focused helper tests added for target scoping, reconciliation and nullable prices. Not executed. This improves client retry safety but is not server-side atomic idempotency across concurrent clients.
- Source commits: `d65b1eaf3f2098167c1c404fc7f96f54716d9af4`, `43d38171ad8315d1f3662db4f2ac8528db0c7bb0`, `9ce77fe3076adeafd58c26cb898bb1c5722d3baf`.

## 2026-11-22 — UX-028 mobile buyer return lifecycle parity

- Re-audited the buyer order-detail contract across API, Web and Flutter. Web already supports return creation; the API already exposes caller-scoped list/detail/create/cancel/shipped endpoints with ownership, payment, delivery-window, active-request and cumulative-quantity checks. Flutter had no buyer return methods or UI.
- Added Flutter `ReturnRequest`/item/event DTOs and `ApiService` wrappers for the existing buyer return endpoints.
- Added a buyer-only return section to mobile OrderDetail, available for owned DELIVERED/COMPLETED sub-orders. It mirrors the Web reason vocabulary and per-line quantity inputs, displays active return state, and offers cancellation and shipped transitions only when the service permits them.
- Uncertain create responses are reconciled by reading the buyer's request list; no blind retry is issued.
- Added `mobile/test/returns_api_test.dart` for parsing and request contract coverage. Not executed; comprehensive tests remain consolidated for Phase 3.
- Source implementation commit: `d7ffc3339db78f16e0f8a9aa7cb551ea28fabdcf`; parent: `9ce77fe3076adeafd58c26cb898bb1c5722d3baf`. PR #138 remains open/draft/unmerged.
- No API/schema/migration/RLS/grant, shared DB, staging, deployment, worker or provider changes.


## 2026-11-22 — UX-029 mobile buyer return detail/history parity

- Re-audited Web `/returns/[id]` against the existing API detail response and Flutter Order Detail. Web displayed refund, item, inspection/merchant-note and lifecycle event details; Flutter initially showed only a summary.
- Added a retryable detail sheet to the existing mobile Order Detail route using `fetchReturn` / `GET /v1/returns/:id`.
- Added actual-refund and inspection/merchant-note fields to `ReturnRequest`; detail view includes status, reason/description, tracking, item quantities/conditions and chronological event history.
- Updated `mobile/test/returns_api_test.dart` with DTO field assertions. Tests are not executed yet; consolidated regression remains Phase 3.
- No API, permission, route, schema, migration, database, staging or worker change.


## 2026-11-22 — UX-030 Web buyer self-service read recovery

- Audited buyer Notifications, Favorites, Saved Suppliers and Profile Sessions. Three list pages silently swallowed read errors and could misreport an empty state; Sessions lacked a retry path and could show a false empty result after failure.
- Added explicit retryable read-error states to all four pages. Failed favorite/supplier removals now surface action errors and preserve rows; buttons indicate pending removal.
- Fixed notification optimistic-update rollback to restore the original `readAt` and `status`, not the already-mutated values, and display mutation failure.
- Added `apps/web/src/__tests__/buyer-self-service-recovery.test.tsx` for all read/retry paths and failed favorite removal. Not executed.
- Source implementation commit: `b310f4da3ccda31f7a8c815f1d99ed1977329ad6`; exact-head Actions not run due to `[skip ci]`. No API/DB/permission/route change.


## 2026-11-22 — UX-031 Web Merchant Customers recovery

- Found `fetchMerchantCustomers` failures silently swallowed in the Merchant Customers page, which then displayed “No customers yet.” Realtime/manual refresh failures were also hidden.
- Added retryable read-error feedback and retained the last successful customer list when a refresh fails.
- Added `apps/web/src/__tests__/merchant-customer-recovery.test.tsx` for initial failure/retry and failed-refresh stale-data preservation. Not executed.
- Source implementation commit: `18fe161297b3302c94c2a9df3a0dc24c68b4fbf8`; `[skip ci]` used to conserve Actions minutes. No API or permission change.


## 2026-11-22 — UX-032 Web Merchant Deliveries recovery

- Added retryable read-error feedback to the Merchant Deliveries queue and suppressed the false empty-queue message when the API request fails.
- Preserved existing rows across failed refreshes (the existing load path already leaves the prior data intact).
- Added `apps/web/src/__tests__/merchant-deliveries-recovery.test.tsx`; not executed.
- Source implementation commit: `b09dde7d7bd7de9c73f86b8dc5eb6b11271b3d81`; `[skip ci]` used under the Actions-minute budget. No API or permission change.

## 2026-11-22 — UX-033 / UX-034 Merchant Web implementation

- Merchant Returns now loads the signed-in merchant's stores through `fetchMyStores`, selects the first available store and supports store/status filtering. Store-directory and return-list reads have separate retry states and request-version protection.
- Merchant Return Detail now supports retry after a failed read.
- Merchant Organization now surfaces retryable verification, update-request, store, warehouse, role and member read failures. It retains last successful auxiliary data and blocks verified-organization updates while pending-request state is unknown.
- Focused tests added: `merchant-returns-recovery.test.tsx`, `merchant-return-detail-recovery.test.tsx`, `merchant-organization-recovery.test.tsx`. Not executed.
- Source/test commit sequence: `644627df54c8c8678643fb4e8893df8f4591982e`, `c9fa87b82948a344c95901a589ef23cdfcb53758`, `1bce8364ba843583eda49203dea8a622342efee5`, `112a5a10290a5669cc62235782fcb50ed43fe82e`, `73d6db58a7ebd069a4c67b67d4a5a5a6099e38b8`, `ea9460000823477887475aa91d09f146c79ca097`, `a86ef5522ef7f5921e3a13ff3efa991eeddd4c35`.
- All commits used `[skip ci]`. No tests/CI were run. No API, permission, schema, database, staging, deployment, worker or provider change occurred.

## 2026-11-22 — UX-034 organization read-state refinement

- Added the missing `rolesError` effect dependency so role loading is lint-correct while the explicit error guard prevents automatic retry loops.
- Corrected the warehouse summary to avoid showing an empty table when the initial warehouse read fails; warehouse count is unavailable while the read is in error.
- Commit: `36c11c8be3c22cbdb79bd341d4a798f28dde30b6`. No tests run; `[skip ci]` preserved Actions minutes.

## 2026-11-22 — UX-034 stale-data preservation refinement

- Merchant Organization now keeps previously loaded document and member rows visible alongside retryable errors after a failed refresh. Metrics no longer present a failed document read as a confirmed zero, and warehouse loading/error states avoid rendering an empty table as successful data.
- Commit: `3a8c5767ffd2a8e852ef0f7bcbe042da35dfa812`. No tests run; `[skip ci]` preserved Actions minutes.

## 2026-11-22 — UX-035 Merchant Orders queue recovery

- Fixed initial store-directory failure handling: errors are surfaced with Retry instead of being swallowed and followed by a false “No orders yet” state.
- Added visible queue loading, retry for order-list failures, and suppression of the successful-empty state while a read is loading/failed.
- Retry uses the selected store; a successful store discovery with no accessible store clears stale store/order state.
- Added `apps/web/src/__tests__/merchant-orders-recovery.test.tsx`. Not executed. No API permission/transition change.

## 2026-11-22 — UX-036 Merchant Offers read/analytics recovery

- Added explicit store loading/error/retry and a distinct no-store state. Offer list reads now expose retry and cannot show a false empty list after failure.
- Product directory failures are visible and retryable; offer creation is disabled until products are available.
- Analytics and trend failures are surfaced separately; unavailable sales data no longer appears as zero in the table/CSV or as “No sales in this range.” Both have retry.
- Added `apps/web/src/__tests__/merchant-offers-recovery.test.tsx`. Not executed. No API/permission change.

## 2026-11-22 — UX-037 Merchant Inventory movement-history recovery

- Replaced the silent catch in `openHistory` with an explicit history-read result and error state. Failed reads now expose Retry and cannot be mistaken for “No movements recorded yet.”
- Added `apps/web/src/lib/inventory-history.ts` and `apps/web/src/__tests__/inventory-history-recovery.test.ts` to test successful and failed reads separately.
- Tests not executed; no API, permission, schema or database change.

## 2026-11-22 — UX-038 / UX-039 Merchant Inventory and Import History recovery

- UX-038: removed silent per-product variant-fetch suppression from Merchant Inventory. The paginated variant read now fails visibly when any product's variant list is unavailable; the picker has request-version protection, clears stale options, and exposes Retry without converting a failure into an empty directory.
- UX-039: Merchant Import History now recovers from store-directory failures, distinguishes no store from loading, exposes a retryable import-job read error, preserves previously loaded jobs after failed refreshes, and polls only while a known job is active without overlapping requests.
- Added `merchant-inventory-variants.test.ts` and `merchant-import-history-recovery.test.tsx`. They cover pagination/partial variant failure and store/job recovery/no-store behavior. Tests are intentionally not executed during the implementation phase.
- No API contract, permission, schema, migration, database, staging, worker, provider or deployment changes. All implementation/test commits use `[skip ci]` under the Actions-minute budget.

## 2026-11-22 — UX-040 / UX-041 Merchant Import Wizard recovery and lifecycle

- UX-040: replaced swallowed Merchant Import Wizard store lookup errors with loading/error/retry/no-store states. A true empty store directory links to onboarding; failed discovery exposes Retry store lookup; import progression stays disabled until a real store is resolved.
- UX-041: corrected the import-processing race by starting status polling only after the process request succeeds. Polling now has request generation/overlap/unmount guards, exposes retry after status-read errors, and uses explicit COMPLETED/FAILED/CANCELLED outcome classification so a FAILED job cannot be presented as a successful import.
- Added `merchant-import-wizard-store-recovery.test.tsx` and `import-job-outcome.test.ts`. Tests are not executed during the implementation-first phase.
- No API/permission/schema/database/queue/worker changes. Commits use `[skip ci]`; no deployment or staging action.

## 2026-11-22 — UX-042 Merchant Warehouses read recovery

- Source audit found store lookup failures were presented as “No store found,” while warehouse-list failures still rendered “No warehouses yet” and had no retry.
- Added separate store loading/error/retry/no-store states and independent warehouse list loading/error/retry states. Request-version guards prevent stale store/list responses from overwriting newer state. Failed refreshes preserve the last successful warehouse rows.
- Added `merchant-warehouses-recovery.test.tsx` for store lookup retry, failed warehouse read/retry, empty-state suppression and true no-store handling. Test not executed.
- No API, permission, schema, database or migration changes. Commit uses `[skip ci]`; no deployment or staging action.

## 2026-11-22 — UX-043 Admin Dashboard read recovery

- Source audit found KPI and pending organization-update errors were swallowed; the Catalog Imports and Catalog Requests widgets shared one error/loading state and could render misleading empty results.
- Added independent KPI, organization-update, import and catalog-request loaders with retryable errors and request-version guards. Failed KPI reads show unavailable placeholders rather than zero defaults; stale successful data remains visible during failed refreshes; each widget suppresses only its own false empty state.
- Added `admin-dashboard-recovery.test.tsx` for independent failures, retry and empty-state suppression. Test not executed.
- No API, permission, schema, database or migration changes. Commits use `[skip ci]`; no deployment or staging action.

## 2026-11-22 — UX-044 Admin KPI Dashboard recovery

- The dedicated Admin KPI Dashboard swallowed fetch failures, offered no retry and lacked protection against out-of-order date-range responses.
- Added explicit error/retry state, request-version protection and stale-data preservation. Initial failures show KPI data as unavailable rather than zero defaults; failed refreshes retain the last successful KPI view with a warning.
- Added `admin-kpi-recovery.test.tsx` for initial read failure/retry and no fabricated zero values. Test not executed.
- No API, permission, schema, database or migration change. Commits use `[skip ci]`; no deployment or staging action.

## 2026-11-22 — UX-045 Admin Organizations read recovery

- The Admin Organizations page used one `Promise.all` for the organization directory and update-request queue. A single endpoint failure blocked both datasets and could produce false empty states.
- Split the reads into independent retryable loaders with separate loading/error states and request-version guards. Failed reads no longer render empty states; the successful list remains usable when the other endpoint fails; previously loaded rows remain visible after failed refreshes.
- Added `admin-organizations-recovery.test.tsx` for independent failure/retry and empty-state suppression. Test not executed.
- No API, permission, schema, database or migration change. Commits use `[skip ci]`; no deployment or staging action.

## 2026-11-22 — UX-046 / UX-047 Admin Users and Merchants completion

- Admin User Management: made phone optional in Create User to match the DTO/service; added independent retryable organization/role lookups; prevented partial initial memberships in the form and rejected incomplete org/role pairs at the AdminService boundary. Added API unit cases for organization-only and role-only payloads.
- User Detail: exposed the existing audited profile-update endpoint, moved membership assignment/removal onto the dedicated detail route, surfaced status controls and added confirmation before suspension/deactivation. Corrected the permissions tab: it now loads each assigned role's configured permissions instead of presenting the global permission catalog as the user's effective permissions.
- Merchant Detail: added store locale and popularity-badge visibility, logo/cover previews and structured address display using the existing store detail projection.
- Added focused Admin tests `admin-create-user-recovery.test.tsx`, `admin-user-role-permissions.test.tsx`, `admin-merchant-detail.test.tsx`, plus API `admin-user-creation.spec.ts` coverage. Tests were not executed; full testing remains deferred to Phase 3.
- No new API routes/permissions, schema/migration/database changes, deployment, staging write, RLS/grant change or worker activation. Implementation/test commits use `[skip ci]`.

## 2026-11-22 — UX-048 / UX-049 Admin Roles and Audit Log recovery

- Roles list now has an explicit retry action and request-version protection with effect cleanup; a failed lookup no longer leaves an unrecoverable error page.
- Audit Log reads now use request-version guards so an older filter response cannot overwrite a newer one. Cleanup invalidates outstanding requests, and the error banner exposes Retry audit log while preserving the last successful rows.
- Added `admin-roles-recovery.test.tsx` and `admin-audit-race.test.tsx` for retry and response-order behavior. Tests not executed.
- No API, permission, schema, database or migration change. Commits use `[skip ci]`; no deployment or staging action.

## 2026-11-22 — UX-050–UX-053 Admin catalog and analytics recovery

- UX-050 Category Detail: linked product-type, direct/descendant product and product-type attribute-schema reads now have explicit retryable errors and request-version guards. The Attributes tab loads its own product-type dependency; schema aggregation fails as a whole rather than showing a partial union as complete.
- UX-051 Product Type Detail: Products tab errors are now retryable and no longer become a successful “No products” state; requests are guarded against stale/unmounted completion.
- UX-052 Catalog Import Center: import-history reads have their own retryable error, request-version guard and successful-empty-only presentation; failed refreshes retain the last successful rows.
- UX-053 Analytics: event/activity reads are independently generation-guarded, retryable and cleanup-safe; older date/limit results cannot overwrite newer data.
- Added focused tests `admin-category-detail-recovery.test.tsx`, `admin-product-type-products-recovery.test.tsx`, `admin-catalog-import-recovery.test.tsx`, and `admin-analytics-race.test.tsx`. Tests not executed.
- No API, permission, schema, database or migration change. Commits use `[skip ci]`; no deployment or staging action.

## 2026-11-22 — UX-054–UX-057 Admin finance, brand and calendar recovery

- UX-054 Commission Oversight now guards status-filter reads, exposes Retry commission reversals and suppresses the false empty state on failure.
- UX-055 Offer KPI and Trend pages now guard overlapping filters, invalidate stale/unmounted requests, expose direct retry actions and suppress false no-sales results after failed initial reads. KPI values use an unavailable placeholder instead of fabricated zero; Trend period label distinguishes unavailable data.
- UX-056 Brand Management now exposes retry, request-version protection and successful-empty-only rendering after a failed directory read.
- UX-057 Business Calendar reads now have request-version/unmount protection and Retry calendar; a failed calendar read no longer reports that no calendar is configured, and dependent holiday/audit empty states are suppressed on read failure.
- Added focused tests `admin-commission-recovery.test.tsx`, `admin-offer-kpis-recovery.test.tsx`, `admin-offer-trend-recovery.test.tsx`, `admin-brands-recovery.test.tsx`, and `admin-calendar-recovery.test.tsx`. Tests not executed.
- No API, permission, schema, database or migration changes. Commits use `[skip ci]`; no deployment or staging action.

## 2026-11-22 — UX-058 Attribute Groups and Definitions recovery

- Attribute Groups and Attribute Definitions had retry controls but could still render empty result rows/counts when their initial reads failed. Attribute Definitions could also apply out-of-order filter responses.
- Added request-version protection and effect cleanup invalidation, role-aware read guards, alert semantics and successful-empty-only rows/counts. Attribute Group detail no longer says no attributes are defined when the shared attribute read failed.
- Added `admin-attribute-groups-recovery.test.tsx` and `admin-attributes-recovery.test.tsx`. Tests not executed.
- No API, permission, schema, database or migration change. Commits use `[skip ci]`; no deployment or staging action.


## 2026-11-23 — UX-078 Mobile Buyer Store Directory and Store Detail

- Re-audited the buyer-facing Store Directory and Store Detail screens. The directory only exposed initial-load retry by invalidation and lost the last successful list on refresh; Store Detail used an untracked FutureBuilder with no retry or refresh and could not preserve a previous catalogue.
- Added a dedicated buyer store-products provider with the existing `status: 'ACTIVE'` constraint, then added explicit refresh/pull-to-refresh, stale-data messaging, retry and true-empty-state handling to both screens.
- Added four focused Flutter widget scenarios for initial failure/retry and failed refresh after a successful store list/catalogue.
- Tests were not run, per the implementation-first plan. No API/permission/schema/database/migration/staging/worker/provider integration changes.


## 2026-11-23 — UX-079 Mobile Buyer Order History recovery

- Re-audited `mobile/lib/screens/orders/orders_list_screen.dart`. The refresh action only invalidated the provider and pull-to-refresh returned immediately; refreshes replaced the visible list, and a failed refresh had no stale-data context.
- Added awaited provider refresh, skip-loading/skip-error handling, stale-data messaging and retry while retaining the active status filter. Initial read failure remains distinct from a true empty history.
- Added three focused Flutter widget scenarios. Not run under the implementation-first test cadence. No order/payment/fulfillment/API/permission/database/migration/staging behavior changed.


## 2026-11-23 — UX-080 Mobile Search facet and request lifecycle

- Source audit found the dynamic attribute facet chips updated only local state; `ApiService.search` did not serialize them even though the existing API controller accepts `attrFilters` JSON and SearchService applies `attributeFilters`.
- Added client serialization without changing the backend contract. Added request-generation checks so delayed older queries/filter/page responses cannot overwrite the current search, invalidated in-flight requests as soon as the text changes, and canceled pending debounce when another action starts a search.
- Added explicit Refresh search, same-query stale-result preservation and protection against old-query rows/false empty states after a different query fails.
- Added ApiService query serialization and widget out-of-order response tests. Not run under the implementation-first cadence. No backend/database/permission/staging/provider changes.


## 2026-11-23 — UX-081 Mobile Product Detail stable reads and recovery

- Source audit found the Product Detail screen constructed a new `fetchProduct(widget.productId)` Future inline in build. Auxiliary variant/offer reads call `setState`, which rebuilt the screen and caused the FutureBuilder to issue another product-detail request. Main read failures had no retry/refresh, and variant/offer/review failures were swallowed.
- Added an ID-keyed auto-disposed product detail provider, explicit refresh/pull-to-refresh, stale product preservation, retryable initial errors, auxiliary read error/retry states, and request-version guards for matrix/offer loads when the route reuses the State for another product ID.
- Added Flutter widget tests for stale data, initial retry and avoiding redundant product fetches. Not run under the implementation-first cadence. No API/permission/cart/order/database/migration/staging behavior changed.


## 2026-11-23 — UX-082 Mobile Notifications recovery

- Re-audited `mobile/lib/screens/notifications/notifications_screen.dart`. Realtime events invalidated the provider but refresh discarded the visible list; individual mark-read had no catch/error feedback; initial read errors had retry but no explicit refresh or stale-data behavior.
- Added stale-safe refresh and pull-to-refresh, retry/true-empty handling, per-row in-flight state and caught individual mark-read failures. Extracted Mark All Read into a guarded action with success/failure feedback.
- Added three focused Flutter widget scenarios. Not run under the implementation-first cadence. No realtime/API/database/migration/staging behavior changed.


## 2026-11-23 — UX-083 Mobile Home discovery recovery

- Source audit found Categories and Suppliers used `maybeWhen(... orElse: SizedBox.shrink())`, Popular Products hid its error state, and the Home refresh callback invalidated five providers but returned before any refresh completed. The unread badge also coerced loading/error to zero.
- Added independent loading/error/retry and stale-data handling to Categories, Popular Products and Suppliers; made pull-to-refresh await each independent read and added an explicit refresh action. The unread badge remains unknown instead of fabricating zero.
- Added three focused Flutter widget scenarios. Not run under implementation-first cadence. No API/permission/role/database/migration/staging behavior changed.


## 2026-11-23 — UX-084 Mobile Checkout idempotency key lifecycle

- Source audit found the checkout screen retained the idempotency key minted on Review even when the buyer changed payment method before submitting. That changed the request payload while retaining the prior logical-request key.
- Payment-method changes now mint a fresh key; retries without payload changes retain the same key. Existing server idempotency contract and checkout payload are unchanged.
- Added a widget regression test covering two failed identical attempts followed by a payment-method change and a successful third attempt. Not run under implementation-first cadence.


## 2026-11-23 — UX-085 Mobile Merchant Dashboard recovery

- Source audit found the merchant dashboard refresh only invalidated profile, stores and KPIs and returned immediately; profile and active-store reads did not preserve last-successful values or expose stale refresh failures. KPI reads already had dedicated recovery.
- Added skip-refresh/reload stale handling and retry for profile/store reads, independent awaited refresh for profile/active-store/KPIs, explicit refresh action and pull-to-refresh on the always-scrollable store hub.
- Added a widget test for simultaneous profile/store refresh failures. Not run under implementation-first cadence. No org/store lifecycle/API/permission/database/migration/staging behavior changed.


## 2026-11-23 — UX-086 Mobile Merchant Catalog recovery

- Source audit found both active-store and product reads lacked stale-safe refresh handling; product pull-to-refresh invalidated and returned immediately. Failed initial product reads were retryable but refresh failures replaced the visible catalogue.
- Added skip-refresh/reload stale handling for the active store, skip-refresh/skip-error product handling, retry notices, awaited current-store refresh and awaited pull-to-refresh. Kept product search/status filters and create/delete permission gates intact.
- Added two focused Flutter widget tests. Not run under implementation-first cadence. No catalog API/visibility/permission/database/migration/staging behavior changed.

## 2026-11-23 — UX-087 Mobile Merchant Offer Detail recovery

- Re-audited the merchant Offer Detail route. The current implementation preserves the last successful offer and analytics during failed refreshes, exposes retry for the primary offer read, keeps analytics failure distinct from zero sales, and refreshes offer, analytics and trend reads independently.
- Added focused Flutter widget scenarios for stale offer/analytics preservation and retryable initial offer failure in `mobile/test/merchant_offer_detail_read_recovery_test.dart`.
- Focused test commit: `910466470d28c7d1eec08c80db47a74b6727f3bc`. Test not executed; remains pending the consolidated Phase 3 campaign. No API, permission, pricing, offer lifecycle, database or migration behavior changed.

## 2026-11-23 — UX-088 Mobile Merchant Inventory read recovery

- Merchant Inventory now refreshes the active store first and then independently refreshes the current store's inventory page and warehouse directory. Failed store refreshes retain the last successful store; inventory and warehouse failures are shown separately with retry.
- Inventory rows remain visible when a refresh fails, including the last successful page; successful empty inventory remains pull-to-refreshable and distinct from a failed read. Warehouse lookup failures now explain that transfers are unavailable until the directory can be loaded.
- Added focused Flutter widget coverage for inventory stale-data preservation, retryable warehouse lookup failure, and initial store lookup recovery to a true empty inventory state.
- Source commit: `df5a171762a5f6a5b365a13f491a975d4c6e9aa8`; focused test commit: `fe508b0d30c791fb7597ec7f1c95d6b6968461b4`. Tests not executed; they remain pending Phase 3. No API, permission, stock mutation, warehouse transfer, database or migration behavior changed.

## 2026-11-23 — UX-089 Mobile Merchant Pricing read recovery

- Re-audited the Mobile Pricing list and Price List Detail screens. The list/detail reads discarded last-successful values during refresh, list refresh did not await completion, the empty list/tier states were not pull-to-refreshable, and an initial tier failure was rendered as a zero tier count.
- Added stale-safe store/list/detail/tier refresh states, explicit retry for initial failures, awaited refresh actions, scrollable empty states, and an unavailable tier-count marker until a successful tier read. Price-list and tier reads remain independent.
- Added four focused Flutter widget scenarios covering stale price-list preservation, initial list failure/retry, stale tier preservation, and initial tier failure without a fabricated zero count.
- Source commits: list `9b0393a45b1ece770a8c977ab0abbd56d4127c58`; detail `3b76bf46518917b8bbcfc9ffb38a31a5e484ef54`; tier-count correction `0fd26220518f35e355c5260808f522f403bf57a7`; duplicate-refresh correction `fd3b94bd4bb4cb10028bc69c7dc7b40632f1de36`. Test/dependency commits: `2f112e97496e3056c8be1d4ac0f8c1b4f2b85fd3` and `a03c23fe9b7f59135f5c2ec27bf0b3b85faa7c59`. Tests not executed; remain pending Phase 3. No pricing API, commercial terms, permission, database or migration behavior changed.

## 2026-11-23 — UX-090 Mobile Merchant Customers read recovery

- Merchant Customers now awaits explicit and pull-to-refresh requests, preserves the last successful customer list/statistics during failed refreshes, exposes retryable initial errors and keeps successful empty/no-filter-match states distinct from failed reads.
- Search and sort state remain local and unchanged; customer/revenue/order statistics are still derived from the currently filtered list.
- Added focused Flutter widget coverage for stale customer/statistics preservation and initial failure/retry to a true empty state.
- Source commit: `b279c263da4e2f8b1153d0d4b19516fd76c46dca`; focused test commit: `3f3b0f6b4d610b24242c44fc75006c509bc7abd7`. Test not executed; remains pending Phase 3. No API, permission, customer, order, financial, database or migration behavior changed.

## 2026-11-23 — UX-091 Mobile Merchant Orders refresh lifecycle

- Re-audited the Mobile Merchant Orders queue. It already retained the last successful order list on refresh failure, but the toolbar action only invalidated the order provider and did not await completion; the queue had no pull-to-refresh, and a successful empty order history was not scrollable.
- Refresh now resolves the active store first and awaits the dependent order provider without issuing a duplicate fetch. The order list and successful empty state are wrapped in an always-scrollable RefreshIndicator; stale rows remain visible during refresh/reload failures.
- Added a third Flutter widget scenario proving an empty order history remains pull-to-refreshable and continues to show its successful empty result plus a refresh failure notice.
- Source commit: `da19ca12dea0974d2cf7c7e0f163d9d0bf695afc`; reload-preservation correction: `9ecce8a391814bec3a6deb6ed00e73e5296bd4c3`. Test commits: `112bf007d566c42d7fbfb81fe37a74ce0dfc7a90` and `b8c7b1ca75bba1128b7b271d6c5a7f7166c1f721`. Three focused Flutter widget scenarios are present but not executed; remain pending Phase 3. No order transition, fulfillment, stock reservation, API, permission, database or migration behavior changed.

## 2026-11-23 — UX-092 Mobile Merchant Store Profile and warehouse recovery

- Re-audited Mobile Store Profile. The store-profile refresh invalidated providers without awaiting the active organization store-directory read; the form had no pull-to-refresh; warehouse directory failures had no retry and could be confused with a successful empty warehouse list.
- Store Profile now awaits store-directory refresh, then awaits the dependent active-store value and refreshes that store's warehouse directory. The profile form is pull-to-refreshable, stale store details remain visible through refresh/reload failures, and warehouse errors have independent retry/stale-data states.
- Added three focused Flutter widget scenarios for stale store preservation, retryable warehouse lookup failure and initial store lookup recovery.
- Source commit: `bfb820ebf6af88a917a7de2b150623a150de85f0`; focused test commit: `90b2b6b45ee989cff03118a4c08efcd6c90cbea5`. Tests not executed; remain pending Phase 3. No store update, warehouse creation, permission, API, database or migration behavior changed.

## 2026-11-23 — UX-093 Organization and authenticated-session context invalidation

- Source audit found that both organization-switch flows persisted the replacement token and updated `activeOrgIdProvider`, but only invalidated profile/membership reads (and Org Detail only invalidated profile). Merchant store, pricing, offer, inventory, customer and order caches could survive the context change. A new login also retained cached authenticated reads and could inherit a persisted active organization.
- Added centralized `invalidateOrganizationScopedProviders` and `invalidateAuthenticatedSessionProviders` helpers. Both organization-switch flows now invalidate the full organization-scoped read set after the replacement token is stored and installed. Login/logout reset clears phone/email and active-org in-memory state and invalidates authenticated caches.
- `activeStoreProvider` now resolves only a store matching the selected `activeOrgIdProvider`; it returns null rather than falling back to a store belonging to another organization. New login clears the persisted active organization before saving the new token; logout already clears it through `AuthStorage.clearTokens`.
- Added ProviderContainer tests for active-store organization matching, organization-scoped cache invalidation without invalidating buyer orders, and session identity/cache reset.
- Source commits: provider cache helper `b49424e`, org switch integration `3f4a6a3` / `1f29e7c`, login/session integration `0895c16` / `61f1c60` / `c192589` / `bf10737`, active-store org filter `cd04739`, persisted org clearing `fc1f22a` / `b416041`. Focused test commits: `a0f308c` / `d0d0b26`. Three focused tests are present but not executed; remain pending Phase 3. No API, permission, DB, migration, RLS, worker or staging behavior changed.


## API typecheck correction checkpoint — 23 November 2026

- Live PR #138 head before this correction batch was `de9eeafb3852822552c667d13ad1e0c27fa8d28f`. GitHub Actions run [#1380](https://github.com/nabeel2323/scs-platform/actions/runs/45081889002) failed in `Lint & Typecheck` at API TypeScript checking. API lint passed and Mobile analysis/tests passed; unit/coverage, Web/Admin tests, boundary lint, migration, contracts, container, integration and build jobs were skipped after the typecheck failure. Vercel Web/Admin statuses pointed to the external build-rate-limit page and are not application test results.
- Corrected the 17 reported TypeScript diagnostics in one grouped source/test batch: P13 integration tests now pass explicit platform escalation authority; the return-expiration worker outcome union includes `fence_lost`; Admin order-item product labels join through the variant's product relationship (the order-item schema has no `productId`); the Admin test fixture matches the order-item schema and has a typed history array; the catalog tenant-scope mock matches the helper's `Promise<void>` contract; and SettlementAdjustmentService now resolves sub-order organization through order → store and fails closed when ownership cannot be resolved.
- Source/test correction commits: `0c6ad31cbb7635bddb702a2fe85006eb7aee6db5`, `caf8088d113ccb14808fb150365b234031cd790e`, `b21b9f1df445cb89360eed625e83a6f64cf918be`, `db6cac84259993f12cbdbf845079613c001bb4e8`, `40e6cf67cb98a1649b2aa171f523a300b5879fb7`, `9113c4aa31260034a6f53cb4b76f2ec04955d28c`.
- No tests or typecheck were executed after these corrections. The new code head is therefore **IMPLEMENTED / NOT VERIFIED**; no CI pass is claimed. The commits use `[skip ci]` under the Actions-minute budget. Comprehensive verification remains deferred to Phase 3.
- PR #138 remains OPEN/DRAFT/UNMERGED to `develop`. No staging deployment/write, shared database mutation, migration, grants/default-ACL change, RLS enablement, worker activation, provider call or release action occurred.


## UX-094 — Mobile merchant category permission/contract alignment — 23 November 2026

- Source audit confirmed `CatalogController` category create/update/delete operations require `catalog:categories:write` **and** platform role ADMIN/MODERATOR. The Mobile router's merchant-role gate excludes those platform roles from `/merchant/*`, while the merchant category screen previously displayed New/Edit/Delete controls to merchant owners/staff. Those controls could only fail at the API boundary.
- The merchant category directory now requires `catalog:categories:read`, the Home/Dashboard entry uses the same read permission, and merchant users see a read-only list with no mutation controls. A pure policy helper mirrors the API's ADMIN/MODERATOR + write-permission condition. No API role guard or permission grant was weakened.
- Focused route/helper tests were added in `mobile/test/route_permissions_test.dart`; not executed. Commits: `6741baf6f7d47c12ddc79d3ca1f4bbd3f110a39f`, `6f0659299c39952b0c8190a4a8dd520ccd3e3db9`, `bb2e4650534bae0b30bf112500db184c227ccba8`, `7b293273f4aba14429ed226932123678a0892c55`, route-matrix test `76b9b15dc1db37c67841d405b4a232f4731fc986`, and explanatory source comment `bd672f0b93de31d6bc669bb7785eeb70a345c302`.
- Client alignment is IMPLEMENTED / TESTING_PENDING. Actual merchant-owned category CRUD remains BLOCKED pending a product/API ownership decision: either implement store-scoped category ownership and membership authorization, or move category mutation to a dedicated platform-admin surface. Do not expose write controls until that decision and backend contract exist.
- No API, RBAC seed, role grant, schema, database, migration, RLS, worker, staging or deployment behavior changed.


## 23 November 2026 — Web merchant access alignment and G-036 realtime authorization

**Branch:** `remediation/phase-0-1-tenant-security`  
**PR:** [#138](https://github.com/nabeel2323/scs-platform/pull/138), OPEN / DRAFT / UNMERGED to `develop`  
**Exact live head:** `89561501099a75f02d344eef97a373d861413c5a`

### Web merchant UX-095

- Added a shared merchant route-permission map for navigation and direct deep links. The dashboard requires `merchant:stores:read`; Product Studio/import/offer creation/promotions/catalog requests require their write grants; onboarding paths still require authentication.
- Filtered dashboard cards and navigation by the active permission projection. Merchant workspace subtree is keyed by active organization, role and permission signature to clear old local state and in-flight work on scope changes.
- Added action-level guards for catalog mutations/export, order/return mutations, driver assignment, store/warehouse operations and organization/store profile operations. Organization writes use `identity:organizations:write`; store profile writes use `merchant:stores:write`.
- Dashboard profile/store reads refresh on active-org changes with request-version protection; store, warehouse, organization, orders and catalog reads also guard stale responses.
- Web merchant realtime subscriptions now require `merchant:orders:read`.

### Security G-036 — realtime room authorization

- Fixed the API Socket.IO gateway so a valid JWT alone no longer grants access to arbitrary `org:{storeId}` or `order:{orderId}` rooms.
- Store rooms require an existing store, `merchant:orders:read`, active-org ownership and active store membership; platform staff require `orders:read`.
- Order rooms require buyer ownership, merchant store membership, an assigned shipment/driver or platform-staff read permission as appropriate. User rooms remain self-only. UUID validation and authorization/database errors fail closed.
- Added focused gateway tests for merchant permissions/membership, foreign organization, buyer/master-order ownership, driver assignment and platform access.

### Verification and safety

- Focused Web tests were added/updated in route-permission, orders recovery, warehouses recovery and organization recovery suites. Focused API tests were added/updated in `apps/api/src/__tests__/unit/realtime/realtime.gateway.spec.ts`.
- **Tests were not executed.** Exact-head workflow lookup returned no GitHub Actions run for `89561501099a75f02d344eef97a373d861413c5a`; combined status shows Vercel Web and Admin external build-rate-limit failures, not application test results.
- All implementation commits use `[skip ci]`. No merge, deployment, staging operation, shared database mutation, migration, grants/default-ACL change, RLS enablement or worker activation occurred.
- UX-095 is IMPLEMENTED / TESTING_PENDING. G-036 is IN PROGRESS; do not close before exact-head verification and independent review.

**Next:** complete the Mobile route-permission and organization-context transition audit, then finish remaining Admin route/action permission mapping. Keep the comprehensive test campaign deferred to Phase 3.


## 23 November 2026 — Mobile route/action permission and organization-context audit (UX-096)

**Implementation checkpoint:** `84d7f4d713902819b21b89a12074986b17781c48`  
**PR:** [#138](https://github.com/nabeel2323/scs-platform/pull/138), OPEN / DRAFT / UNMERGED to `develop`

- Corrected offer route permissions: `/merchant/offers` and offer detail are read routes requiring `merchant:stores:read`; `/merchant/offers/new` requires `catalog:offers:write`.
- Kept offer browsing available to read-only merchants. The create FAB/empty-state action, offer detail lifecycle controls and offer-submit handler now require `catalog:offers:write`.
- Updated Mobile Catalog shortcuts and dashboard Offers card to use read permissions (`merchant:stores:read` for offers and `catalog:categories:read` for categories).
- Corrected Merchant Orders driver assignment to use `fulfillment:shipments:assign`, matching the API controller. Order acceptance/preparation/status actions remain under `merchant:orders:write`. The handler and UI now enforce the separate permission.
- Added handler guards for product save and offer creation.
- Merchant shell now watches active organization, role and permissions; it resets the selected tab, keys the tab subtree by the effective scope and hides the previous workspace while the profile permission projection reloads.
- Verified the existing organization switch flow in both organization screens: the returned token is persisted and installed before active-org state changes; organization-scoped providers are invalidated and router refresh is triggered. Existing provider-invalidation tests remain in place.

### Focused tests and safety

- Added/updated Mobile route-permission tests for offer read versus create.
- Added positive/negative widget tests for driver assignment permission.
- Tests were **not executed**. Commits use `[skip ci]`; no exact-head GitHub Actions run is available.
- No API business behavior, schema, database, migration, staging, grants, RLS, workers or deployment changed.

**Status:** UX-096 IMPLEMENTED / TESTING_PENDING. Mobile route/action/org-context implementation slice is complete at source level. **Next:** finish remaining Admin route/action permission mapping, then the consolidated testing phase.


## 2026-11-23 — CI typecheck/analyzer corrections and Admin UX-097 action guards

- Reviewed CI #1395 on the prior PR head `ff304ce6c0bcf63a654ff8fbd04130254cdb669e`. The API job failed at typecheck because regex match capture groups were typed `string | undefined`; the Mobile job failed analysis because `UserProfile.role` is nullable and a dynamic EmptyState description was incorrectly marked const.
- Fixed the API gateway by explicitly narrowing the validated `scope` and `id` captures before passing the identifier to room authorization. Fixed the Mobile category page with a null-safe role fallback and a non-const EmptyState for the runtime-dependent description.
- Continued the Admin action-permission audit. Found that verification organization deactivate/reactivate, organization status changes, organization update-request review and dispute resolution had UI permission gates but did not recheck the same permission inside their async action handlers. Added fail-closed handler checks and duplicate-action guards.
- Added focused tests: `apps/admin/src/__tests__/verification-org-status-permissions.test.tsx` and `apps/admin/src/__tests__/admin-organization-action-permissions.test.tsx` for losing `admin:users:write` while a confirmation modal is open. Existing dispute route/action permission coverage remains in the Phase 3 verification matrix.
- Source commits: `0d4644f`, `5f08755`, `112cee3`, `94f86da`, `41fca82`; focused test commits: `c0aa312`, `856d527`.
- Tests, API typecheck and Flutter analysis have not been rerun after these fixes. This batch is IMPLEMENTED / TESTING_PENDING, not automated-test or CI verified. The previous CI #1395 failure remains historical evidence and is not a pass.
- No API permission grants, backend business contracts, schema, migration, database, staging, worker, provider or deployment behavior changed. PR #138 remains draft/unmerged.

**Next:** continue the remaining Admin route/action audit against API controller decorators and role contracts; do not repeat the already-completed 56-route page-level audit or UX-097 handler fixes. Keep the comprehensive campaign deferred to Phase 3.


## 2026-11-23 — Admin capability-aware navigation and payment verification access (UX-098)

- Continued Admin custom route/action-to-controller permission mapping. Compared the sidebar's all-of permission filtering with the actual route access conditions and endpoint-level capabilities.
- Found that Carrier & Recovery allows either `admin:carrier:read` or `admin:shipping:recovery`, but the sidebar required `admin:carrier:read` only. A recovery-only operator could be authorized by the page but could not navigate to it.
- Found that Payments exposes a verification-only tab for `admin:payments:verify`, but the page-level access gate and data loader did not admit a user with that permission alone. Refund-only and read-only paths were already separately represented.
- Added a reusable navigation permission rule supporting all-of `perms` plus any-of `anyPerms`; configured Carrier & Recovery and Payments with their actual OR permission contracts.
- Updated Payments route access and per-tab loading so queue access requires `admin:payments:verify`, all/stale tabs require `admin:payments:read`, and refund requests require `admin:refunds:approve`. A user without any of those permissions receives AccessDenied.
- Added helper tests for all-of/any-of navigation policy and a page test for verification-only payment access.
- Source commits: `07ff19c`, `f303153`, `14214f0`; focused tests: `d504ace`, `89624f6`.
- Status: IMPLEMENTED / TESTING_PENDING. Tests were not executed. No backend permission grants or API contracts changed.

### Validation context

- CI #1408 ran on the preceding head `a76b0bef436af8bde2d9329b1cd6ee5980f593fc`. Lint and TypeScript typecheck passed; Flutter analyze and Flutter tests passed. The changed-file Prettier check failed because 245 files in the long-lived PR diff were reported unformatted; dependent API/Web/Admin/integration/migration/build jobs were skipped. This run does not validate UX-098, whose commits use `[skip ci]`.
- CI #1407 was superseded/cancelled after its TypeScript failure; the failure was four unsupported `exact` properties in new Testing Library `ByRoleOptions`. Those assertions were corrected to anchored regular expressions before #1408.
- Defer one consolidated repository-locked formatting pass and comprehensive tests to the planned implementation-complete validation batch. Do not create repeated formatter workflows or claim these tests passed.

**Next:** continue the remaining Admin custom route/action-to-controller mapping, checking permission OR/AND semantics against actual route guards and API decorators. The 56-page route-level audit and UX-097/098 fixes must not be repeated.


## 2026-11-23 — Supplemental G-002 audit note reconciled

- Reviewed the user-uploaded `Advanced UX Enhancement Prompt.txt`. It reports 111/111 tables with RLS disabled, 32 public-schema functions with none SECURITY DEFINER, anon/authenticated without BYPASSRLS, service_role with BYPASSRLS, 55 foreign-key constraints without covering indexes, prior plaintext OTP log observations, one Render API service/no separate worker, and a startup migration/RBAC-seed command with 63 migrations reported applied.
- The attachment supplies no observation timestamp, exact database endpoint, SQL/query text, connection identity or relation-kind scope. Preserved it as supplemental reported evidence in `docs/remediation/G-002-ADDITIONAL-AUDIT-NOTE-2026-11-23.md`; it is not promoted to a verified live snapshot.
- The 111-table count remains unreconciled with the existing detailed 19-November 114 public ordinary/partitioned table inventory and historical 116 wording. The 32-function result may be consistent with the earlier zero SECURITY DEFINER result but requires same-scope enumeration. The 55-index count matches the existing G-013 follow-up. OTP/runtime and embedded-worker status remain unverified.
- No SQL was run, no credentials or connection details were accessed, and no grants, RLS, migration, staging, Render, worker or deployment action occurred.

**Next G-002 evidence:** use the protected read-only staging audit to reconcile table/function scope and establish actual API/migration runtime identities. Do not bypass approval or mutate the shared database.


## 2026-11-23 — Shared Admin mutation permission rechecks (UX-099)

- Continued the Admin action-handler audit beyond the verification/organization/dispute pages. The shared `useAdminMutation` helper previously only prevented duplicate in-flight requests; several components relied exclusively on hiding controls when `useRequirePerms` returned false.
- Added an action-specific permission callback to `useAdminMutation`, checked immediately before the API request. Bound User status/membership, dispute, category, brand and offer-governance mutations to their actual permission hook result.
- Bound Carrier & Recovery queue actions to `admin:shipping:recovery` (passed explicitly to the RecoveryTable action component). Bound shipment exception/RTS actions to `fulfillment:shipments:write`, inventory returns to `fulfillment:shipments:return` plus eligibility, and carrier create/cancel vs recovery actions to their distinct write/recovery permissions.
- User Detail profile submission now rechecks `admin:users:write` and rejects duplicate saves; the edit form is hidden when the permission is no longer present.
- Added `admin-mutation-permission-guard.test.tsx` to verify that a permission removed before the click prevents the shared mutation, while an authorized action proceeds. Test not executed.
- Source commits: `262f2d1`, `d52acd6`, `93ec686`, `20447d2`, `bed844f`, `9313b85`, `5ea1145`, `91d69e4`; focused tests: `046160d`, `57d3a25`.
- Status: IMPLEMENTED / TESTING_PENDING. No API permission grants, backend authorization contracts, database, migration, staging, worker or provider behavior changed.

**Next:** continue remaining Admin custom route/action-to-controller mapping and confirm all `useAdminMutation` call sites use an action-specific permission callback. Do not repeat UX-097/098/099. Keep the consolidated test and formatting campaign deferred to Phase 3.


## 2026-11-23 — Admin settlement adjustment rejection action (UX-100)

- Continued the custom Admin route/action-to-controller audit. Compared the reconciliation, settlement-adjustment, settlement, payment, role-permission, return, calendar and shipment action permissions with the API controller decorators; the reviewed page-level predicates match the corresponding endpoint permission keys.
- Found a functional UI omission: the API's `POST /admin/settlement-adjustments/:id/reject` endpoint requires `admin:adjustments:approve` and a rejection reason, but the Admin page had no Reject action.
- Added an approver-only Reject action for pending adjustments, an inline required-reason form and the exact `{ reason }` POST body. The action is not exposed to read-only users.
- Added focused tests for the rejection request and read-only action visibility. Tests have **not been executed**.
- Source commit: `14c8c5c`; focused test commit: `e471e6b`.
- Status: IMPLEMENTED / TESTING_PENDING, not automated-test or CI verified. No backend permission grants, financial transition logic, schema, migration, database, staging, worker or deployment behavior changed.

**Next:** continue the remaining Admin custom route/action-to-controller mapping, including any direct custom mutation handlers outside `useAdminMutation`. Do not repeat the completed 56-page route audit or UX-097–UX-099. Comprehensive formatting and test execution remain grouped in Phase 3.


### Admin custom action mapping audit conclusion — 23 November 2026

- Completed the source-level pass over direct custom mutation handlers for payments/refunds, calendar holidays, reconciliation, settlement adjustments, settlements, role permission updates, return resolution, order cancellation, verification review/organization status and product moderation.
- The reviewed UI permission predicates align with API controller decorators. The shared `useAdminMutation` call sites reviewed in `EntityActions.tsx`, Carrier Recovery and Shipment Detail pass action-specific permission predicates or per-call overrides.
- No additional permission-key mismatch was found in this inspected slice. The one UI workflow omission—the settlement-adjustment Reject action—was implemented in UX-100.
- Focused UX-100 tests remain unexecuted. No API grants, backend authorization, schema, migration, database, staging, worker or deployment behavior changed.

**Next:** proceed with the remaining Admin operational UX/source audit beyond permission mapping; keep comprehensive formatting and test execution grouped in Phase 3.


## 2026-11-23 — Catalog governance action guards and Product Type publish correctness (UX-101)

- Continued the Admin custom-action audit into Product Type governance, Catalog Import Center, Attribute Management and Attribute Groups.
- Added `catalog:product-types:manage` action-time checks to Product Type create, category update and publish paths. Product Type Builder Save/Publish now recheck the permission, prevent overlapping requests and prevent Publish after a failed dirty-configuration save.
- Catalog Import Center now guards the history read and all import/report/template/export actions with `catalog:imports:manage`; upload, execute and retry are single-flight. Existing API ADMIN/SUPER_ADMIN role guard remains authoritative.
- Attribute create/update/deactivate/option and Attribute Group create handlers now recheck `catalog:attributes:manage`.
- Added a regression test proving failed Product Type Builder configuration save prevents publish. Tests have not been executed.
- Source commits: `bbe5a72`, `9af0646`, `553cb25`, `8e795c3`; tests: `43c6e5e`, `997da23`, `3d59ae9`.
- Status: IMPLEMENTED / TESTING_PENDING. No API grants, backend permission semantics, schema, migration, database, staging, worker or deployment behavior changed.

**Next:** continue the remaining Admin operational UX/source audit beyond permission mapping. Keep the consolidated formatting and test campaign grouped in Phase 3.


## 2026-11-23 — Product editor action-time permission guard (UX-102)

- Continued the Admin custom form audit and found that the shared ProductForm create/edit Save handler did not recheck the route's `catalog:products:write` capability at dispatch.
- Passed `canWrite` from both route wrappers, added an action-boundary permission check and a ref-backed single-flight guard, and disabled Save when permission is absent or a save is active.
- API routes continue enforcing `catalog:products:write`; no backend authorization changed.
- No ProductForm-specific test was added. Validation remains pending Phase 3.
- Source commit: `383ea13c589d9023aab24d3b2d15c5c0db2cd751`.

**Next:** continue the remaining Admin operational UX/source audit beyond permission mapping; keep the accumulated formatter and test campaign grouped in Phase 3.


## 2026-11-23 — Product Type stale-response suppression (UX-103)

- Added independent request-version guards for Product Type list/filter reads and selected-schema reads.
- Product Type Builder schema/attribute/readiness load now ignores stale responses and invalidates requests on route-ID or permission changes.
- No focused regression test was added. CI #1419 passed lint/typecheck and Flutter analysis/tests, but failed the accumulated Prettier gate (254 files); Web/Admin tests and dependent gates were skipped.
- Source commit: `892bb24f4522988c89dea507cb848d80fb4dbe2e`.
- Status: IMPLEMENTED / TESTING_PENDING; no API, schema, database or staging behavior changed.

**Next:** continue the remaining Admin operational UX/source audit beyond permission mapping. Keep comprehensive formatting and tests grouped in Phase 3.


## 2026-11-23 — Catalog Requests action guards (UX-104)

- Added action-time `catalog:requests:manage` checks and single-flight protection to Approve and Reject.
- RejectDialog receives the permission capability, prevents duplicate submits and retains required rejection reason.
- Added tests for duplicate approval dispatch and rejection payload. Tests not executed.
- Commit: `00427e5f0cdd183aa7b8c910a93b8edd2e0d0723`.



## 2026-11-23 — Dashboard protected-read gating (UX-105)

- Fixed Data Quality and KPI Dashboard so protected API reads and retry callbacks are gated by `catalog:product-types:manage` and `admin:kpis:read`, respectively.
- Added request-version invalidation to Data Quality and permission-aware request handling to KPI.
- Added tests confirming unauthorized users do not trigger protected API reads. Tests not executed.
- Commit: `8474b7acd264872a01d305bef515009eded104ed`.



## 2026-11-23 — FIN-001 Payment refund concurrency and idempotency

- Continued the API financial correctness audit after the Admin workflow work. Source inspection found that separate partial refund approvals did not serialize on the shared payment row. Two concurrent approvals could each calculate from an incomplete aggregate and leave a fully refunded payment in `PARTIALLY_REFUNDED`.
- `approveRefund` now locks the payment row before the refund transition and aggregate calculation. The payment status is derived from the latest locked row state and committed refund total.
- `requestRefund` now performs caller-key idempotency lookup under the same payment lock, returns the existing record for identical retries, and rejects mismatched reuse. A conflict-safe insert covers concurrent reuse of a key against separate payment rows.
- Added PostgreSQL integration cases FIN-DSH-11 and FIN-DSH-12. **Not executed**; both remain TESTING_PENDING for the consolidated Phase 3 campaign.
- Source/test commit: `117614884ff1e0d50ca116f0b28f249fd83761c0`. No schema/migration/provider/gateway/payout/shared DB/staging/deployment change.
- G-012 remains OPEN; this work does not expand automatic gateway or payout scope.

## 2026-11-23 — FIN-002 settlement calculation idempotency

- Audited P12 settlement calculation after FIN-001. Found `calculateSettlement` always inserted a new settlement and the partial unique index did not protect repeated calls after the original settlement reached PAID.
- Refactored calculation to lock the associated payment row, check for an existing settlement under that lock, return an existing PENDING/CALCULATED/DUE record idempotently, and reject recalculation after PAID/ADJUSTMENT history so explicit adjustment workflows remain authoritative.
- Moved the financial breakdown and successful-refund aggregate reads inside the payment-locked transaction, serializing them against refund requests/approvals using the same lock.
- Added PostgreSQL integration cases FIN-DSH-13 (concurrent calls reuse one settlement and emit one outbox event), FIN-DSH-14 (PAID settlement cannot be recalculated), and FIN-DSH-15 (unconfirmed payment cannot be settled). Tests not executed.
- Source/test commit: `60bf231f950dec8ede3c8945f76b22bc8e4b4451`; `[skip ci]` used in accordance with the grouped-validation/Actions-budget decision.
- Status: IMPLEMENTED / TESTING_PENDING. No schema, migration, API contract, provider, payout, staging, shared DB or deployment change.
- Next: continue source-first payment/settlement correctness audit without expanding gateway/payout scope.

## 2026-11-23 — FIN-002 settlement idempotency and eligibility

- `calculateSettlement` now serializes on the payment row, returns an existing PENDING/CALCULATED/DUE settlement for retries, rejects a new payable settlement after PAID/ADJUSTMENT history, and refuses calculation until payment is CONFIRMED, CAPTURED, PARTIALLY_REFUNDED or REFUNDED.
- FIN-DSH-13–15 cover concurrent calculation, post-PAID denial and pre-confirmation denial. Tests not executed.
- CI #1425 on `994fee9` passed lint and Flutter but failed typecheck; logs identified possible-undefined settlement insert result and test result types. Added an explicit insert-result guard in source commit `60bf231f950dec8ede3c8945f76b22bc8e4b4451`; exact-head validation pending.

## 2026-11-23 — FIN-003 minor-unit amount validation

- Source audit found that manual verification, COD cash confirmation and refund request paths did not consistently reject fractional or unsafe JavaScript numbers before writing PostgreSQL BIGINT minor-unit columns. Negative/zero verified and collected values were not rejected at the service boundary.
- Added shared `assertPositiveMinorAmount` validation to payment verification, COD cash confirmation, refund request and settlement confirmed-amount calculation. It requires positive safe integers in minor units; it does not impose a new upper bound or require actual received amount to equal the order amount.
- Added PostgreSQL regression FIN-DSH-16 for fractional verification/refund amounts and zero COD collection; asserts verification/COD statuses remain unchanged. Not executed.
- Source/test commit: `f554617c592ff57db296e0ca88614ac246468194`; `[skip ci]` used to preserve the consolidated validation plan.
- Status: IMPLEMENTED / TESTING_PENDING. No schema/migration, provider, gateway, payout, staging, shared DB or deployment change.

## 2026-11-23 — FIN-004 / FIN-005 financial transition consistency

- FIN-004: settlement calculation now records `PAYMENT_SETTLEMENT_CALCULATED`; marking PAID locks the settlement and atomically writes PAID state, `PAYMENT_SETTLEMENT_PAID` history and `payment.settlement_paid` outbox event. FIN-DSH-13 and FIN-DSH-17 cover calculation and concurrent pay effects; not executed.
- FIN-005: COD cash confirmation now synchronizes `orders.payment_status` in the same transaction while preserving the order's fulfillment status. FIN-DSH-18 covers DELIVERED + CONFIRMED projection and payment history; not executed.
- Source/test commits: `50f544a98dc8d9b84d8a3709b250425df48c4d5a`, `def9131ba94699150cb896a23eb171eab0ae5a00`, `51d7d9c8a6a26450f9cbc1dd32d0a6779513acd9`.
- Status: IMPLEMENTED / TESTING_PENDING. No schema/migration, gateway, provider, automatic payout, staging, shared DB or deployment changes.


## 2026-11-23 — FIN-006 dispute refund idempotency payload integrity

- Found that dispute orphan-refund recovery reused the deterministic `dispute-refund:<disputeId>` key without validating the financial payload against the retry.
- Added exact-match checks for payment/order, amount, reason, requester, currency and dispute link. Mismatches conflict before linking the refund or resolving the dispute.
- Added PostgreSQL FIN-DSH-20 scenarios for amount and reason mismatch. Tests added, not executed.
- Source/test commit: `9899113a4f574d2733b957d2f1b489e35a71fe0f`.
- No schema, migration, provider, payout, staging, shared database or deployment changes.


## 2026-11-23 — FIN-007 refund/order payment projection consistency

- Found that `approveRefund` updated the payment record but left the order's denormalized `payment_status` stale after a successful refund.
- The approval transaction now updates the order payment projection to the derived payment state, without changing fulfillment/order status.
- Added PostgreSQL FIN-DSH-21/22 for partial and full refunds; tests added, not executed.
- Source/test commit: `5b68edac4d148f68656b4331a9612cd1752eab3d`.
- No schema, migration, provider, payout, staging, shared database or deployment changes.


## 2026-11-23 — FIN-008 return refund idempotency payload integrity

- Found that return orphan-refund recovery reused the deterministic `return-refund:<returnId>` key without validating the original financial payload.
- Added exact-match checks for payment/sub-order, amount, reason, buyer/requester, currency and return link. Mismatches conflict before refund linking or advancing the return.
- Added PostgreSQL FIN-DSH-24/25 scenarios for changed amount and reason. Tests added, not executed.
- Source/test commit: `72927529e64a719741b94b864f6adba7cafd4f0d`.
- No schema, migration, provider, payout, staging, shared database or deployment changes.

## 2026-11-23 — FIN-009 through FIN-013 and payment expiry history guard

- FIN-009: dispute resolution now uses compare-and-set to prevent duplicate RESOLVED events/outbox messages; commit `2b8e2fa7cf2aab87d4186153a61748bc82805c52`.
- FIN-010: return refund settlement adjustment locks the settlement row and serializes against mark-paid; commit `a1dc7b2cf31c83f2a59c0a72f0056f4955fe7143`.
- FIN-011: post-refund settlement adjustment preserves original settlement currency; commit `ba3318724c3080d4c29baee1c81e972262e14ac4`.
- FIN-012: missing financial breakdown blocks manual/COD payment confirmation and rolls back; commit `cdb189e95dd7022793af33352a18c31f81117059`.
- FIN-013: payment expiration appends order cancellation history only when the conditional order update succeeds; source `028e30e9ebeb626b51b6d80bc28467c9c946c419`, test `83550c34c7dc11492fc6e5c5fc6fcb418b79243c`.
- FIN-DSH-11–28 added but not executed. All remain IMPLEMENTED / TESTING_PENDING.
- CI #1427: lint/typecheck and Flutter passed; changed-file Prettier failed (258 files); dependent API/Web/Admin/PostgreSQL/build/release jobs skipped. CI #1429 was cancelled. CI #1434 must be checked at its exact SHA.
- No schema/migration, gateway/provider/automatic payout, staging/shared DB, grants/RLS, deployment or worker changes.


## 2026-11-23 — FIN-014 discount-adjusted commission reversal and currency integrity

- Return commission reversal now prorates the order-level discount over the returned goods using the same persisted order financial basis. The commission reversal and post-refund settlement adjustment retain the original payment currency.
- Added PostgreSQL FIN-DSH-29 for a partial discounted return, asserting the commission reversal amount and currency in both ledgers. Test not executed.
- Source commits: 6221c9c10bba4652b19c1aeaca59a8d1c3d9c79d and 00da339e62dbeef87a55434b3ed5ea1a85cb6508.
- A follow-up passed payment currency explicitly into the reversal writer and corrected its syntax. No schema/migration or gateway/payout behavior changed.

## 2026-11-23 — FIN-015 exact commission reversal arithmetic

- Replaced Number multiplication in proportional commission reversal with shared BigInt arithmetic. This avoids a one-minor-unit over-reversal when safe integer operands have a product outside Number.MAX_SAFE_INTEGER.
- Both ReturnsService settlement adjustment and CommissionReversalService now use the same helper; input safe-integer checks and remaining-commission cap are preserved.
- Added a unit regression using operands where floating-point multiplication rounds the quotient up by one minor unit. Test not executed.
- Source commits: 917397ffd5491d6fe52a18063c0266e831b67c38, e2338cf1e50e825bd1c22becbeab0a6a4757a5e4, a596d49a752973cdc1b7039f3b325f0421252c9c; test commit: 4e67e5ef7541e87ef5d9698e3abad7529cd07219.
- Status: IMPLEMENTED / TESTING_PENDING. No schema/migration, provider, gateway, payout, staging, shared DB or deployment change.


## 2026-11-23 — FIN-016 COD excluded from stale-payment expiry

- COD payment collection is due at delivery, not within the bank-transfer payment window. The stale-payment reconciliation query now excludes CASH_ON_DELIVERY, and expirePayment rejects COD at the service boundary as a defense in depth.
- Added PostgreSQL FIN-DSH-30: a 365-day-old COD payment attached to a DELIVERED order is absent from stale-payment candidates; direct expiry is a no-op; no PAYMENT_EXPIRED event is emitted; order/payment states remain unchanged.
- Source commit: 68b5251200f9f3765a0568b796db056a18cd878e; test commit: 6ff2a4788c5f2a98c5866cfd0d321cea9948c4ac.
- Test added, not executed. No schema/migration, gateway, payout, staging, shared DB or deployment change.

## FIN-015 follow-up — PostgreSQL SUM(bigint) normalization

- Both commission reversal paths now convert the PostgreSQL SUM(bigint) aggregate to Number before passing it into the safe-integer BigInt helper. This avoids runtime rejection of a numeric string while retaining range validation.
- Commits: e5765b53be5a199ac075e75b92d4a93e05a2415d and c2864af871f36336a263b74056329ae3dcf4a381.


## FIN-017 — Exact return refund allocation and payment-currency delivery adjustments — 23 November 2026

- **Finding:** return request calculations used floating-point discount/VAT ratios with `Math.round`, creating minor-unit precision risk for large values. Partial-return delivery-fee exception adjustments also hardcoded SYP despite the return's payment currency being available.
- **Implementation:** `roundProportionalMinorUnits` now performs validated half-up allocation using BigInt. Return line discounts, VAT and delivery-fee VAT use exact minor-unit arithmetic with safe-integer bounds. Delivery-fee exception adjustments inherit `payment.currency`.
- **Regression coverage:** FIN-DSH-31 verifies a partial return with products 3000, discount 600, tax 240 and delivery fee 450 yields refund 880 and a 495 USD delivery-fee adjustment. Unit tests cover half-up allocation and an intermediate product beyond safe Number precision. Tests added, not executed.
- **Source commit:** `122edb4bf1dc67ba01bfc33b97809cc037781f87`; unit/integration test commit: `e6823ee9b1c68f5b71229ffbda17c9f525b66565`.
- **Status:** IMPLEMENTED / TESTING_PENDING. No schema/migration, gateway, payout, provider, staging, shared DB or deployment behavior changed.


## FIN-017 — Exact return refund allocation and payment-currency delivery adjustments — 23 November 2026

- **Finding:** return request calculations used floating-point discount/VAT ratios with `Math.round`, creating minor-unit precision risk for large values. Partial-return delivery-fee exception adjustments also hardcoded SYP despite the return's payment currency being available.
- **Implementation:** `roundProportionalMinorUnits` now performs validated half-up allocation using BigInt. Return line discounts, VAT and delivery-fee VAT use exact minor-unit arithmetic with safe-integer bounds. Delivery-fee exception adjustments inherit `payment.currency`.
- **Regression coverage:** FIN-DSH-31 verifies a partial return with products 3000, discount 600, tax 240 and delivery fee 450 yields refund 880 and a 495 USD delivery-fee adjustment. Unit tests cover half-up allocation and an intermediate product beyond safe Number precision. Tests added, not executed.
- **Source commit:** `122edb4bf1dc67ba01bfc33b97809cc037781f87`; unit/integration test commit: `e6823ee9b1c68f5b71229ffbda17c9f525b66565`.
- **Status:** IMPLEMENTED / TESTING_PENDING. No schema/migration, gateway, payout, provider, staging, shared DB or deployment behavior changed.


## 2026-11-23 — FIN-017 exact return refund allocation and delivery currency

- Replaced floating-point return-line discount/VAT allocation with BigInt-backed minor-unit arithmetic and explicit safe-integer guards. Full-return delivery-fee VAT uses the same exact ratio; delivery-fee exception adjustments preserve payment currency instead of hardcoding SYP.
- Added PostgreSQL FIN-DSH-31 for partial return discount/VAT and payment-currency preservation in the delivery adjustment. Test not executed.
- Source commit: 122edb4bf1dc67ba01bfc33b97809cc037781f87; test commit: e6823ee9b1c68f5b71229ffbda17c9f525b66565.
- No schema/migration, gateway, payout, staging, shared DB or deployment change.

## 2026-11-23 — FIN-018 concurrent return creation serialization

- The one-active-return check, cumulative returned-quantity check and refundable-amount check previously ran before the insert transaction; concurrent requests could both pass against the same snapshot.
- Return creation now locks the payment row inside the transaction and rechecks payment eligibility, active return, cumulative returned quantity and remaining refundable amount before inserting. This serializes competing return requests with refund operations.
- Added PostgreSQL FIN-DSH-32, which holds the payment row while two requests pass their fast-fail checks, then asserts exactly one active request commits. Test not executed.
- Source commit: 8a8364899f08180da9213be4d897a65fac9a897d; test commit: 705609fa2928d6e12e393b59bb990cfe0cf2343c.
- No schema/migration, gateway, payout, staging, shared DB or deployment change.


## 2026-11-23 — FIN-019 settlement adjustment posting integrity

- **Finding:** `SettlementAdjustmentService.postAdjustment` applied `netMinor = -amountMinor` to every adjustment type, incorrectly recording COMMISSION_REVERSAL as a merchant debit. It also transitioned an approved adjustment to POSTED even when no primary settlement existed, leaving no corresponding settlement ledger record.
- **Implementation:** introduced type-specific settlement-net calculation (commission reversal is a positive merchant credit; refund/delivery-fee/balance-debit adjustments are negative), positive safe-integer amount validation, and a row lock on the latest primary settlement (PENDING/CALCULATED/DUE/PAID). Posting now conflicts if no primary settlement exists, preserving the adjustment in APPROVED state without a ledger link.
- **Regression coverage:** unit cases cover credit/debit signs; PostgreSQL FIN-DSH-33 verifies commission reversal creates a positive-net ADJUSTMENT row; FIN-DSH-34 verifies no-settlement posting is rejected and the adjustment remains APPROVED/unlinked. Tests added, not executed.
- **Source commits:** `968fa110fb77efcc98c5a892c5ed69029347fc8e`, `b2f0dc49b85d65dac0eaf631bf6fab7beaba8cae`.
- **Status:** IMPLEMENTED / TESTING_PENDING. No schema/migration, gateway, payout, staging, shared DB, grants/RLS, deployment or worker changes.


## 2026-11-23 — FIN-019 regression scenario numbering correction

- The integration suite already used FIN-DSH-33 for return idempotent retry. Renumbered the new settlement-adjustment cases to FIN-DSH-34 (commission reversal positive net) and FIN-DSH-35 (no primary settlement blocks posting).
- Commit: `b9f9728659e71d3788cc58aa2b5ad9df29ab9731`. Tests remain added but not executed.


## 2026-11-23 — FIN-020 reconciliation correctness

- Audited `ReconciliationService` against the current settlement adjustment writer and return financial helper.
- Corrected commission-reversal sign handling for `ADJUSTMENT` settlement rows; primary settlement commission remains a merchant debit.
- Replaced unsafe Number reversal aggregation with validated BigInt accumulation. Unsafe data now creates an `INCOMPLETE_SOURCE_DATA` discrepancy.
- Corrected delivery-fee cap calculation to use the persisted net-goods denominator and existing half-up minor-unit allocator; included both delivery-fee exception/refund adjustment types and rejected unsafe source amounts.
- Fixed refund-status mismatch persistence: status text is held in the discrepancy description/source reference and is not written to BIGINT monetary columns.
- Added production-helper unit regressions and PostgreSQL FIN-DSH-36 with a disposable database.
- Source/test commit: `ad478cc53ce40bec86172e881b4f14cea7e6dfac`. Tests not run; IMPLEMENTED / TESTING_PENDING. Actions workflow lookup returned no run for this SHA; Vercel Web/Admin previews were successful but are not application tests.
- No schema/migration or shared/staging DB write, deployment, worker, grants/RLS, gateway or automatic payout changes.


## 2026-11-23 — FIN-021 reconciliation run lifecycle integrity

- Audited reconciliation run schema, migration 0062, service writers, Admin reader and current rerun tests. Confirmed three defects: global uniqueness despite org-scoped version reads; unlocked read-then-insert version allocation; and non-atomic run/discrepancy persistence. Confirmed `superseded_by` was written backward on the new run.
- Added tenant/period/currency transaction-scoped advisory locking and atomic version allocation.
- Moved run creation, all six source checks, discrepancy persistence and COMPLETED transition into one transaction. On error, all partial state rolls back; a separate best-effort transaction records a FAILED run with zero discrepancy rows and a generic error summary.
- Changed supersession to predecessor → successor. Added migration 0074 to repair legacy links and make the unique index tenant-aware with NULLS NOT DISTINCT (including one unique NULL/global scope).
- Added PostgreSQL FIN-DSH-37/38 for concurrent same-tenant versions, independent tenant version 1, supersession direction, failed run persistence and zero partial discrepancy rows. Removed fake unit rerun tests that only checked hard-coded counters.
- Updated the production reconciliation operations guide.
- Commit: `e2dcb43e37d2a67a72d0891c4c3519d19719b5ae`. Tests not executed; IMPLEMENTED / TESTING_PENDING. Migration 0074 is source-only and not applied.
- Exact-head Actions returned no run. Vercel Web failed due build-rate-limit; Vercel Admin succeeded. These are not application test results.
- No shared/staging DB write, migration execution, grants/RLS, worker activation, environment change, deployment, gateway/provider or payout change.


## 2026-11-23 — FIN-022 financial history and outbox consistency

- Audited payment lifecycle history, return events, commission reversals, settlement adjustments, dispute events, generic outbox publishing and dispatcher polling.
- Added `payment.created` in the checkout transaction and `payment.awaiting_payment` alongside the PAYMENT_AWAITING history row in its status-transition transaction.
- Reworked dispute opening to lock the order and commit dispute row, OPENED event and `dispute.opened` outbox together. Evidence and response now lock the dispute and commit status/history/outbox together, emitting `dispute.evidence_submitted` and `dispute.response_submitted`.
- Added `settlement_adjustment.created` to the same transaction as DRAFT adjustment creation.
- Replaced generic outbox read-then-dispatch with atomic PostgreSQL `FOR UPDATE SKIP LOCKED` claiming, five-minute lease/worker ownership, conditional success/failure updates and explicit camel-case returned columns. Carrier events remain excluded for their dedicated worker.
- Added FIN-DSH-39 through FIN-DSH-42 and unit tests for claim SQL and dispatch projection. Tests added, not executed. Dispatcher still logs locally; external event bus integration is not implemented.
- Commits: `3784bca3dd9a21fa3123e555aebbdd13addfb21b`, `a77339ab1b50d881fc006a16b9613505458fcd27`, `ccde36322f9bcfd12f2de2bfad22390cd9b7f503`, `5d7eadf07e11801813a606dfeeda60b83c16eb19`, `e761195829d3fcd4bc2d9d0eecfd848188c32d53`.
- No schema/migration/shared DB write, worker activation, deployment, gateway or payout change.
- Next FIN-023: audit BANK_TRANSFER checkout's post-commit order/payment transition and dispute-refund split transaction recovery.


## 2026-11-23 — FIN-023 checkout and dispute-refund atomicity

- Removed the BANK_TRANSFER checkout split-brain window: order PAYMENT_PENDING + payment AWAITING_PAYMENT, order/payment immutable history and payment/order outbox events are now persisted inside the original checkout transaction. Removed the swallowed post-commit transition; fail closed when BANK_TRANSFER is requested without PaymentsService.
- Added optional transaction-client support to `PaymentsService.requestRefund`. Dispute resolution now locks the dispute row first and performs refund request, payment history/outbox, refund-dispute linkage, dispute resolution/history/outbox in one transaction. Preserved strict idempotency payload validation and recovery for legacy orphan refund rows.
- Added PostgreSQL FIN-DSH-43/44/45 for bank-transfer success, checkout rollback on outbox failure and refund/dispute rollback on final outbox failure. Tests added, not executed.
- Commits: `a5fa4806e310159b6f2708d366764ffe4fa3892f`, `442b03a77e4645fba01b8f33d3d2351265365b9d`, `71c8acb5a890a8b7350915cc4eca80dd6104874c`.
- No migration/shared DB write, worker activation, deployment, gateway/provider or payout change.
- Next FIN-024: payment proof upload storage/DB rollback and retry-safe cleanup audit.


## 2026-11-23 — FIN-024 payment proof upload lifecycle

- Exposed the existing file-buffer proof path through the payment proof endpoint using multipart `file`, 10 MB limit and JPEG/PNG/WebP/PDF MIME allowlist; retained receipt URL/reference JSON compatibility.
- Sanitized file extensions and generated unique per-payment object keys. Missing storage configuration now fails closed.
- Added compensation after DB transaction failure: re-read the payment row and delete the new object only if it is not referenced. If DB verification fails, preserve the object rather than risk deleting a committed proof. Previous managed proof deletion occurs only after replacement commit; external URLs are not deleted. No-new-file updates retain the existing proof.
- Added PostgreSQL FIN-DSH-46/47 for failed DB/outbox persistence and successful proof replacement. Tests added, not executed.
- Commits: `7f6e3a949975511b5be56470c0dd427dc92ba16d`, `41c8db370a30124e981c42c1e7d7b8487771e8ec`.
- Residual crash window after upload and before DB transaction can leave orphan objects; no durable upload-intent/sweeper exists. Next FIN-025 addresses crash-safe cleanup. No migration/shared DB write/worker activation/deployment.


### FIN-024 follow-up — uncertain object-store upload — 23 November 2026

- Moved payment transition validation before object upload so invalid transitions cannot create unused objects.
- Added compensation for upload timeouts: when putObject throws, check the generated key and delete it if the object exists; cleanup errors are logged and do not mask the original upload failure.
- Added FIN-DSH-48 to verify an accepted object is deleted after the upload response times out and the payment row remains unchanged. Test not executed.
- Commit: `847647c424097e5ace69236d0c3b4592f85d30e9`. Process-crash orphan window remains for FIN-025.


## 2026-11-23 — FIN-021 transaction-client compatibility correction

- Re-audited FIN-021 after the parallel branch advanced. Drizzle relational `db.query.*` accessors were being used on a transaction client, which does not expose the relational query API.
- Replaced transactional latest-run, refund, commission-reversal, order-breakdown and approval reads with core `select().from().where()` queries. Run creation, check reads, discrepancy inserts and completion remain in the transaction.
- Commit: `1997ee604f58328faf580328817ec5b7b326fabf`. FIN-DSH-37/38 remain unexecuted; migration 0074 remains source-only.
- No database, staging, migration, deployment or worker action.

## 2026-11-23 — FIN-025 durable payment-proof upload recovery

- Added `payment_proof_upload_intents` with generated object key, bucket, MIME/size, lifecycle state, lease owner/expiry, retry schedule, attempt count and terminal timestamps. Migration 0075 is forward-only and not applied.
- `submitProof` now creates the durable intent before S3 upload, marks successful upload as UPLOADED, and commits payment row, immutable payment event, outbox event and COMMITTED intent in one database transaction. Failed/uncertain upload or payment persistence leaves a recoverable cleanup intent. Replaced managed proofs also receive a cleanup intent in the same payment transaction, closing the post-commit crash window.
- Added bounded `cleanupStaleProofUploads`: claims only old intent rows with `FOR UPDATE SKIP LOCKED`, fences claims with a lease owner, checks the payment row before object deletion, uses HEAD/DELETE on the exact recorded key, treats only confirmed not-found as absent, and schedules capped exponential retries with a terminal FAILED state.
- The cleanup method is not wired to a timer or worker and has not been activated. No bucket listing or broad deletion is used.
- PostgreSQL FIN-DSH-49–53 cover stale orphan cleanup, cross-payment committed-reference preservation, retry backoff, concurrent claim exclusion and retired-proof cleanup; FIN-DSH-46/48 were updated for durable intent behavior and FIN-DSH-47 verifies committed intent. Tests added, not executed.
- No shared database migration/write, staging operation, worker activation, grants/RLS, environment change, provider/gateway/payout, deployment or merge action.


### FIN-025 follow-up — storage provider error classification — 23 November 2026

- Hardened object-not-found detection for S3-compatible providers: accept HTTP 404 or a recognized code/name in any of the SDK's `name`, `Code`, or `code` fields. A generic `name='Error'` no longer masks a `Code='NotFound'` value.
- Generic storage errors continue through retry/backoff; they are never interpreted as object absence.
- Commit: `ff67348b950b51a482fa4cf624549a146551c383`. No tests executed.


## 2026-11-23 — FIN-026 payment event actor attribution

- Source audit found verifyPayment allowed both administrators and merchant owners but always persisted ADMIN in event history; confirmCash allowed privileged callers but always persisted MERCHANT.
- Both event producers now derive ADMIN versus MERCHANT from the authenticated caller. No client-supplied actor class is trusted.
- Added PostgreSQL FIN-DSH-54 for merchant bank-transfer verification and administrator COD cash confirmation. Test not executed.
- Commit: `e5733dc4a403c15da27d9064aa8703a89f6ee7f4`. No migration, shared DB write, worker activation, deployment or merge.

### FIN-026 follow-up — privileged return event attribution — 23 November 2026

- Extended the FIN-026 audit to ReturnsService. Admin callers are explicitly allowed to perform merchant-side and buyer-side return transitions, but the event producers hardcoded MERCHANT or BUYER.
- Merchant approve/reject/receive/inspect/reject-after-inspection and buyer cancel/ship transitions now record ADMIN when a privileged caller performs the action; ordinary merchant/buyer callers retain their correct class.
- Added PostgreSQL FIN-DSH-55 for admin override of MERCHANT_APPROVED and CANCELLED. Test not executed.
- Commit: `47de1df8637d3cdff03ac6a70184613978357120`.


## 2026-11-23 — FIN-027 refund-balance parity and CI syntax correction

- Live branch was reconciled at source/test checkpoint `5b636df49155ea523bc730852ed900720a858a88`; PR #138 remains OPEN / DRAFT / UNMERGED against `develop`.
- CI [#1446](https://github.com/nabeel2323/scs-platform/actions/runs/45189283326) tested prior head `8e32957d3435196222fbb9841e6063229b68b648`. Lint failed on two TypeScript parse errors: a missing closing brace before `catch` in `returns.service.ts` and a stray closing brace in `settlement-adjustment.service.ts`. Flutter analysis/tests passed; integration, unit, migration, Web/Admin, boundary, build/container, contract, k6 and staging-release jobs were skipped.
- Corrected both syntax defects in commits `a06086769028ad55a371376abfca2a211ef317c4` and `0798ae48c4c0e1bd58a45ddbbaed2cfeaf8d0cda`; a follow-up brace-balance and indentation correction in `returns.service.ts` is committed as `4a7ebc784a1b3e469d82b0dec899dbb2838e682b`. No CI rerun was triggered because implementation-first sequencing and the constrained Actions budget remain binding.
- FIN-027 source audit found `ReturnsService.getCumulativeRefundedAmount` excluded `APPROVED` refunds although `PaymentsService.requestRefund` counts them, and cast PostgreSQL `SUM(bigint)` to 32-bit `int`. It now includes APPROVED and reads the exact numeric total as text/BigInt, rejecting totals outside the safe-integer range. Source commit: `6ae8aba762215f69f42e74e4608a4fa31a02543b`.
- Added PostgreSQL FIN-DSH-56 for approved-refund balance reservation and aggregates above the PostgreSQL 32-bit integer boundary. Test commit: `5b636df49155ea523bc730852ed900720a858a88`. Tests are added but NOT EXECUTED.
- Exact-head Actions lookup after the source/test commits returned no workflow run. Vercel Web/Admin statuses are external build-rate-limit failures, not application test evidence.
- No shared/staging database writes, migration execution, grants/RLS changes, worker activation, environment changes, deployment or merge occurred. Migration 0075 remains source-only; PR #138 remains draft.
- Next: continue source-first audit of payment/refund/settlement event history, retry semantics and cross-ledger consistency. Keep the comprehensive Phase 3 test/migration campaign grouped until implementation is complete.


## 2026-11-23 — FIN-028 settlement calculation actor attribution

- Source audit found `PaymentsService.calculateSettlement` is admin-only but wrote `PAYMENT_SETTLEMENT_CALCULATED` history with `actor_type = SYSTEM`, misattributing a user-initiated privileged action.
- Changed the immutable event actor type to ADMIN; actor ID remains the authenticated admin ID supplied by the controller/service call.
- Added PostgreSQL FIN-DSH-57 asserting persisted actor ID and ADMIN actor type.
- Source commit: `5a7dfd6ea67de61bb016cc7a7ef31749760955d8`. Test commit: `05799cde897871ab9752af07bf70830ac834edbf`. Test added, not executed.
- No schema/migration, shared DB, staging, worker, provider, payout, environment, deployment or merge action. All implementation commits use `[skip ci]`; consolidated Phase 3 validation remains pending.
- Next: continue auditing refund/reconciliation event producers and retry/idempotency paths for authenticated actor and immutable history/outbox parity.
