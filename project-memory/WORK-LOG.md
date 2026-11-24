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

## 2026-11-23 — FIN-029 payment confirmation order-history actor parity

- Source audit found a second attribution defect adjacent to FIN-028: `verifyPayment` correctly wrote the authenticated verifier as ADMIN/MERCHANT in `payment_events`, but `transitionOrderAfterPaymentConfirmation` wrote the corresponding `order_status_history` row as SYSTEM.
- Updated the order-transition helper to receive a constrained `ADMIN | MERCHANT` actor class derived from the same authenticated caller and persist it with the verifier ID.
- Extended PostgreSQL FIN-DSH-54 to assert both payment event and order status history actor ID/class for merchant verification.
- Source commit: `77c2caaa322836cc8e7d651f6577df715c5e3228`. Test commit: `8fc1759a9e374f12513c82d301b2c9b934a98840`. Test added/extended, not executed.
- No schema/migration, shared DB, staging, worker, provider, payout, environment, deployment or merge action. Consolidated Phase 3 validation remains pending.
- Next: continue audit of remaining event producers and cross-ledger timing/retry semantics; do not repeat FIN-001–FIN-029.

## 2026-11-23 — FIN-030 refund-completion period attribution

- Reconciliation audit found `checkMissingRefunds` and `checkCommissionReversals` scoped REFUNDED returns by `return_requests.created_at`, which is the date the buyer opened the return, not when the refund completed.
- Returns opened in a prior month and refunded in the current month were therefore omitted from current-period reconciliation. The append-only `return_request_events` log provides the actual REFUNDED transition timestamp.
- Both checks now use the REFUNDED event timestamp. Legacy rows without a REFUNDED event retain the previous created_at fallback.
- Added PostgreSQL FIN-DSH-58: backdates return creation while recording refund completion in the current period, then asserts refund-status and missing-commission-reversal discrepancies are emitted.
- Source commit: `93a908d4627c804af5d12e20c6a1e7c2811524e9`. Test commit: `5abae2018b9e6d6a43d5e3b90764ef80560b4ea0`. Test added, not executed.
- No migration, shared database write, staging operation, deployment or merge. Continue consolidated Phase 3 testing only after implementation is complete.

## 2026-11-23 — FIN-031 cross-period duplicate refund detection

- Continued reconciliation audit found duplicate-return detection filtered by `return_requests.created_at` and counted only refunds in that window. It missed a duplicate when the return was opened earlier or when one successful refund fell in an earlier accounting period.
- Updated detection to identify returns with at least one SUCCEEDED refund whose `refunds.updated_at` falls in the current period, then count ALL SUCCEEDED refunds for those returns across periods. Tenant scoping is preserved in both queries.
- Added PostgreSQL FIN-DSH-59: a return created two days earlier has two successful refunds, one updated in the prior period and one in the current period; reconciliation must emit DUPLICATE_REFUND with count 2.
- Source commit: `6089a1fd821c35c0dcd9f0cde849e145326905e1`. Test commit: `4bdd2935d48ea2c6ef3d633aa6af2f3fe39369ab`. Test added, not executed.
- No schema/migration, shared DB, staging, deployment or merge action. Consolidated Phase 3 validation remains pending.

## FIN-032 — Settlement-adjustment accounting-period correctness — 23 November 2026

Reconciliation previously used adjustment creation time for POSTED-adjustment approval and delivery-fee-cap checks. This misattributed adjustments created in an earlier period but posted in the current period; delivery-fee-cap checks also included DRAFT and other unposted adjustments. Both checks now require status POSTED and use the adjustment transition timestamp (updated_at) as the accounting-period timestamp. PostgreSQL FIN-DSH-60 covers a prior-period-created adjustment posted in the current period and confirms that an unposted draft is excluded. Source commit: 0c65476d1135d18504ae910083299683fdb8d072; test commit: 39a8ee35e81e919601e49d0564fee023d5a39871. Test added, not executed.

## FIN-033 — Exact payment refund aggregate arithmetic — 23 November 2026

Three payment-side SUM(bigint) aggregates used for refund reservation, refund approval projection and settlement calculation were exposed as JavaScript numbers without an explicit precision guard. They now return PostgreSQL numeric text, convert through BigInt, and fail closed when negative or outside Number.MAX_SAFE_INTEGER. Unit coverage verifies totals above the 32-bit boundary, unsafe aggregate rejection and malformed/negative values. Source commit: 633d56a06e073ee416e5b7a989167ef5828f13d8; test commit: 115b0dab007e4071f6a32ee1e564427a86732249. Tests added, not executed.

## FIN-034 — Caller-owned refund transaction support — 23 November 2026

PaymentsService.requestRefund now accepts an optional caller-owned transaction client and reuses it rather than opening a nested transaction. This aligns the implementation with the existing dispute-resolution caller, which passes its transaction so refund creation, payment event/outbox, refund linkage and dispute resolution remain atomic. Existing PostgreSQL FIN-DSH-45 covers injected failure rollback; tests remain unexecuted. Source commit: 2c4b4538cc10e3d4e6217ca56967c89e52657fd8.

## FIN-035 — Atomic return-refund and return-ledger transition — 23 November 2026

Return refund creation previously committed the payment refund/event/outbox first, then linked the refund and advanced the return request in a second transaction. It now locks the payment and performs refund creation (reusing PaymentsService's caller-owned transaction), return linkage, REFUND_PENDING state/history and return outbox in one transaction. The existing idempotency recovery path remains for legacy split-transaction rows. PostgreSQL FIN-DSH-61 injects failure at return outbox persistence and asserts that refund, payment event/outbox and return changes all roll back. Source commit: e462c256be710a81e42b2f2d4093d4700abe1818; test commit: f5d38d5a4af42ec29fa38040d8ba184e5dcbcdff, with scoped outbox assertion correction 4ad18e1eab3495030c6fff719607b5101337edb4 and test index update ac266c2c365d23c3ef3e58032616bb118d037715. Tests not executed.

## 23 November 2026 — CI #1449 triage and FIN-036 continuation

- Reconciled live repository nabeel2323/scs-platform, branch remediation/phase-0-1-tenant-security, PR #138 OPEN/DRAFT/UNMERGED against develop.
- CI #1449 on 3b87fc9985fcbb96081a5affccd303a598591cd9 failed API TypeScript typecheck. ESLint (0 errors, 304 warnings) and Flutter passed; dependent API unit/coverage, PostgreSQL integration, migration, Web/Admin, boundary, build/container, contract/codegen and k6 jobs were skipped. Vercel failures were external provider build-rate-limit statuses.
- Corrected the reported type blockers in a grouped source/test commit: 8f4962a16b4e14ddd5af590377ca2686f9e90fe4. This correction is not CI-verified.
- FIN-036 source review found that return finalization trusted a succeeded refund snapshot without locking and validating the payment/refund/return lineage and exact amount. Updated markRefunded to lock payment → refund → return, verify payment/order/buyer/currency/refund linkage and exact positive safe-integer amount, then perform settlement/commission/history/outbox changes using the locked return row.
- Added PostgreSQL FIN-DSH-62 to prove a succeeded refund with a mismatched amount cannot finalize the return or create REFUNDED history/outbox/commission-reversal rows. Test added, not executed.
- FIN-036 source/test commit: d84489f185cfc864074406f0c9029bc28f40dc94. No exact-head CI run is claimed; commits use [skip ci] under the implementation-first test cadence.
- No migration, shared database/staging write, grants/default-ACL change, RLS enablement, worker activation, provider call, deployment or merge. PR #138 remains draft/unmerged.
- **Next:** continue the source-first payment/refund/settlement lifecycle retry and cross-ledger consistency audit beyond FIN-036. Keep the consolidated Phase 3 campaign pending until implementation is complete.

## 23 November 2026 — reconciliation typecheck correction follow-up

- Reviewed the exact source diff after the grouped CI #1449 typecheck correction and found a literal newline escape in the RUNNING insert plus an unchanged nullable orgId assignment in the FAILED-run recovery insert.
- Corrected both Drizzle insert shapes in `apps/api/src/modules/returns/reconciliation.service.ts`; nullable orgId is omitted when the reconciliation is global, preserving database NULL behavior.
- Commit: `988b2fcd468f38c70c0f8910534640e5f2ca6151`. No CI or test execution is claimed; the commit uses `[skip ci]` under the implementation-first programme.

## 23 November 2026 — FIN-037–FIN-040 payment/refund/settlement retry audit

- Continued from the FIN-036 handoff on remediation/phase-0-1-tenant-security / PR #138.
- FIN-037: identified that a REFUND_FAILED return only updated return_requests, leaving its linked payment refund active. Added atomic payment refund failure state/event/outbox and return state/history/outbox. A retry reopens the same FAILED refund to REQUESTED only after a remaining-balance check. FIN-DSH-63/64 added. Commit 7be49a0420432d4e31733b77ee2c3042e738d242.
- FIN-038: made approveRefund idempotent after SUCCEEDED so a concurrent/lost-response replay returns existing success without a second payment event/outbox. FIN-DSH-65 added. Commit 89757383fd53dcb69d2c753f134aaf39d1b47bbc.
- FIN-039: made markSettlementPaid idempotent for a matching paymentReference after PAID; mismatched references remain conflicts. Updated FIN-DSH-17 to expect two successful identical concurrent commands but one persisted history/outbox event. Commit 4020853e3a51386f56e57b41b501a3060f680e82.
- FIN-040: expanded reconciliation to detect REFUND_FAILED with non-FAILED refund state and REFUND_PENDING with FAILED refund state, using matching return state event timestamps and legacy created_at fallback. FIN-DSH-66 covers both legacy mismatches. Commit 6a4e0edccab8cdd0dfa250fa3b950ab62a206a63.
- All regression tests added/updated but not executed; commits use [skip ci]. No migration, shared/staging DB write, worker activation, provider call, deployment or merge.
- Next: source-first review settlement/refund/payment history and outbox parity, then complete implementation audit before the consolidated Phase 3 test campaign.

### FIN-040 follow-up — latest event period attribution

Reviewed repeated return-state transitions and tightened FIN-040 to use MAX(created_at) for the latest event matching the current status, with a created_at fallback for legacy rows only. Updated FIN-DSH-66 to verify a prior-month REFUND_PENDING event does not create a prior-period discrepancy after the return re-enters REFUND_PENDING in the current month. Follow-up source/test commit: b63376cf26240d3dc21b6f26782158a09674c1c7. Tests remain unexecuted.

## 23 November 2026 — FIN-041 settlement-adjustment retry audit

- Found that postAdjustment rejected retries after a successful commit, even though the caller may have lost the response. Added an idempotent POSTED replay path that requires the corresponding ADJUSTMENT ledger row.
- Added adjustmentId, parentSettlementId and postedBy to settlement_records.metadata for newly posted adjustment rows; preserved a stable notes-prefix fallback for legacy rows.
- Added fail-closed validation that adjustment currency matches the primary settlement and that the primary settlement store still matches the sub-order.
- Added PostgreSQL FIN-DSH-67 for same-adjustment replay, single ledger/outbox persistence and currency mismatch rejection.
- Source/test commit: ad61d75b909341dd2936e03dbc592b0d244d9f72. Test added, not executed; [skip ci]. No migration/shared DB/deployment/merge.
- Next: audit adjustment ledger retrieval, reconciliation linkage and primary-settlement terminal-state interactions.

## 23 November 2026 — FIN-042 posted adjustment payout lifecycle

- Found that settlement adjustment posting creates an ADJUSTMENT settlement row, but markSettlementPaid accepted only CALCULATED/DUE, leaving posted adjustment credits/debits unable to reach PAID through the existing payout workflow.
- Added ADJUSTMENT to SETTLEMENT_STATUSES and allowed it through the same row-locked markSettlementPaid transition.
- Payment history/outbox and matching-reference retry idempotency are reused; no alternate payout path introduced.
- Added PostgreSQL FIN-DSH-68 for adjustment payout and duplicate retry.
- Source/test commit: a6dc0c50ee83d1f397b982084e338b142d89b62e. Test added, not executed; [skip ci].
- Next: audit adjustment listing/reconciliation and ensure primary settlement calculation does not treat adjustment rows as the primary settlement.

## 23 November 2026 — FIN-043 primary settlement lookup isolation

- After FIN-042 enabled payout of ADJUSTMENT rows, the latest-row query in calculateSettlement could select the adjustment row instead of the primary settlement.
- Updated primary settlement lookup to exclude new rows carrying adjustmentId metadata and legacy rows identified by the stable posted-adjustment note prefix.
- Extended FIN-DSH-68 to assert the original primary settlement remains the calculation result after adjustment posting and payout.
- Source/test commit: 6e336fbbe6e71a0c21ee8e81150eadfd769cc6f0. Test added, not executed; [skip ci].
- Next: audit settlement list/reconciliation projection semantics for primary versus adjustment rows.

### FIN-042/043 test assertion follow-up

FIN-DSH-68 now selects payment_record_id directly from the posted adjustment ledger row for its PAYMENT_SETTLEMENT_PAID history assertion; this is a test-only clarity correction. Commit: 74eef0fa36611dd7352436e8d2b7fd048ca7efc2. No behavior change. Test remains unexecuted.

## 23 November 2026 — FIN-044 adjustment parent isolation and Admin payout parity

- Continued the FIN-041–043 settlement-adjustment audit and found that `postAdjustment` still selected the latest settlement row by status. Once a prior ADJUSTMENT row was paid, its status became PAID and it could be incorrectly selected as the parent of a later adjustment.
- Updated the parent lookup to exclude metadata-linked adjustment rows and legacy rows identified by the stable `Posted adjustment ` notes prefix.
- Found that `markSettlementPaid` replaced the notes field for adjustment rows, which could erase the only durable marker on legacy rows. Adjustment payout now preserves the marker and appends optional payout notes; primary settlement note behavior remains unchanged.
- Updated Admin Settlements with ADJUSTMENT status styling/filtering and Mark Paid action.
- Extended PostgreSQL FIN-DSH-68/69 to simulate a legacy row without metadata, assert its marker survives payout and verify a second adjustment points to the original primary settlement. Added Admin recovery coverage for adjustment payout.
- Commits: `233e49a12352a4e157f455040a2bdcc4c16c1828` and `62bf7cf1991ff7974a8762c0e57eea148fcc53b4`. Tests added, not executed; `[skip ci]`.
- No migrations, shared/staging database writes, deployment, merge, environment changes, worker activation or RLS/ACL changes.
- Next: audit merchant settlement projections and reconciliation/report exports for adjustment visibility and double-counting before the consolidated Phase 3 test campaign.

## 23 November 2026 — FIN-045 paid adjustment reconciliation

- Found that commission-reversal sign logic used `status === 'ADJUSTMENT'`. After payout, status becomes PAID, so reconciliation would incorrectly treat a positive commission reversal as a primary commission debit.
- Added durable row classification from `metadata.adjustmentId` or the stable legacy posted-adjustment notes prefix and passed that classification into the exact minor-unit formula.
- Extended unit coverage for PAID adjustment rows, mixed refund/commission adjustments and PAID primary settlement semantics. Updated PostgreSQL FIN-DSH-36 to pay the commission-reversal adjustment before reconciliation.
- Source commit: `23fc0f5f6cfd017c281e498a0843b11e82ca0a3e`. Tests not executed; `[skip ci]`.

## 23 November 2026 — FIN-046 merchant settlement visibility

- Confirmed the backend already exposed a tenant/store-scoped merchant settlements endpoint, but the merchant web app had no settlement history page or navigation entry.
- Added `fetchMerchantSettlements` and a read-only merchant Settlements page with store/status filters, financial breakdown, paid date/reference and explicit paid-adjustment labeling.
- Added route permission and dashboard/navigation integration under existing `merchant:orders:read`. Added merchant read/retry/store-selection coverage.
- Admin settlement type/UI now uses adjustment metadata or the legacy note marker to label paid adjustments as `ADJUSTMENT · PAID`; added an Admin regression assertion.
- Source commits: `4615e05bb0c0df98ec2015387262a146bc13f6a4` and `3373c36930744c911300699b770d05c4428a313c`. Tests not executed; `[skip ci]`.
- Next: inspect settlement list caps, exports and financial KPI aggregation for primary/adjustment double counting. No migration, shared/staging write, deployment or merge.

## 23 November 2026 — settlement projection and reporting audit checkpoint

- Confirmed the merchant Settlements screen is now wired to the existing organization/store-scoped API and paid adjustment rows are labeled from durable metadata or legacy notes.
- Reviewed the Admin revenue KPI path: it aggregates `orders.total_minor` grouped by currency, not `settlement_records`; it therefore does not double-count primary and adjustment ledger rows.
- Merchant and Admin settlement list methods each cap results at 100 rows and currently do not expose pagination. No export/report service was found in the reviewed Admin/Analytics module paths that aggregates settlement records.
- Next: verify whether additional finance export/report consumers exist outside these modules, then decide whether pagination is required. Do not change order revenue KPI definitions to settlement net amounts without an explicit product decision.
- Exact branch/PR/CI status before this docs sync: head `615becfe8b1b9f14407e8872bb26a2e51ec790af`; PR #138 open/draft/unmerged; no exact-head Actions run; Vercel Web/Admin statuses are external build-rate-limit failures.

## 23 November 2026 — FIN-047 settlement history pagination

- Audited the 100-row settlement list ceiling and confirmed no settlement export/report consumer in the inspected Admin/Analytics modules. Admin revenue KPI aggregates orders.total_minor, not settlement_records; preserve that definition.
- Added shared strict pagination parsing (default 25, max 100), validated non-negative safe offsets, response totals, stable createdAt/id ordering and same merchant tenant filter for page and count queries.
- Wired Admin and Merchant settlement clients/pages to the paginated response with Previous/Next navigation and total/page display. Filter changes reset page; Admin marking the final row on a later page steps back.
- Added focused API controller/service pagination tests and Admin/Merchant UI pagination regression tests.
- Source commit: ee6bf2f84803f2eb1f80ae931d9415923a760ff3. Tests/typechecks/build/lint not executed. [skip ci]; no exact-head CI pass claimed.
- No migration, shared/staging database write, deployment, merge, environment mutation, worker activation or RLS/ACL change.
- Next: complete remaining report/export consumer audit outside reviewed Admin/Analytics paths, then execute consolidated Phase 3 test campaign.

## 23 November 2026 — FIN-047 consumer audit closure and CI coverage alignment

- Reconciled live branch `remediation/phase-0-1-tenant-security` at `f9eaa99c163a66ce4f37b9ad70724865c184e9e0`; PR #138 remains OPEN / DRAFT / UNMERGED against `develop`.
- Completed the remaining source audit across Admin/API/Web settlement consumers, KPI/report routes and the reconciliation consistency path. No settlement-ledger export consumer or aggregate that sums primary plus adjustment rows was found. Reconciliation checks individual settlement rows; Admin revenue is based on completed order totals grouped by currency. The settlement-adjustment approval queue is separate from settlement history.
- Found a CI coverage gap: the Admin job only selected hydration/global-style tests, so it did not execute the new finance recovery specs. Added both `admin-settlements-recovery.test.tsx` (pagination + payout UI) and `admin-settlement-adjustments-recovery.test.tsx` to that focused job; updated the test-campaign manifest.
- API coverage already collects the new pagination unit/controller spec; Web CI runs the full suite including merchant settlement pagination. No tests have executed yet.
- This grouped documentation/CI update intentionally omits `[skip ci]` to start the consolidated Phase 3 PR campaign. Exact-head status must be checked after push; do not treat the current pending state as a pass.
- No migrations, shared/staging DB writes, environment changes, worker activation, RLS/ACL changes, deployment or merge.

## 23 November 2026 — consolidated CI diagnosis and grouped TypeScript fixes

- CI #45243520666 on `86dbe607435d08f9e9ad483c1813ca52004df00a` found an invalid escaped template-literal delimiter at line 3428 of `p13-financial-dispute.postgres.spec.ts`. Corrected in `c036e7a483f634c9fad537c50fc8fc9dddb851a0`.
- CI #45243772955 on `c036e7a483f634c9fad537c50fc8fc9dddb851a0` passed lint and then failed workspace typecheck: two old Admin settlement test mocks returned arrays rather than the new paginated response, and Admin Settlements used dot notation for an index-signature metadata key.
- Corrected both mocks to return `{ data, total, limit, offset }` and changed metadata access to `['adjustmentId']`. These are grouped in the next source commit. Exact-head CI rerun required; no API, PostgreSQL, Web/Admin or Flutter test pass is claimed yet.

## 23 November 2026 — FIN-047 consolidated CI result and formatter blocker

- Verified branch head `d81f16cb2bab97c9896ead6ce7edb9bb8e92e63b`; PR #138 remains OPEN / DRAFT / UNMERGED.
- CI #45245048568: lint PASS, workspace typecheck PASS, Flutter analyze PASS, Flutter tests PASS.
- `pnpm format:check:changed` FAILED and reported 279 files. Because the step is in the blocking Lint & Typecheck job, API unit/coverage, PostgreSQL integration, Web/Admin tests, migration, boundary, contract, build and container jobs were skipped. This is not a successful Phase 3 campaign.
- Vercel Web PASS; Vercel Admin FAILURE due external build-rate-limit.
- All pagination/tenant/typecheck corrections are committed. Next: resolve the 279-file formatter gate in a grouped cleanup without disabling required checks, then rerun the consolidated campaign. No merge/deploy/database/environment/RLS/ACL/worker changes.

## Live continuation — FIN-047 verification follow-up (23 November 2026)

- Exact branch head: 3ef930973014bdb43e10a62c337a61831835c174; PR #138 remains OPEN / DRAFT / UNMERGED against develop. No merge or deployment.
- Formatting remediation: CI #45257284797 passed the changed-file Prettier gate, lint, and workspace typecheck. Flutter analyze and Flutter tests also passed. The broad formatting cleanup is grouped in 312e7d39044ea9ce412675a9bdbf68992776eec4; two remaining files were formatted in 11a6f5998fa6b21c70737a4a55a2b4e4a59f2a27. Temporary one-time formatting workflows were removed in b9926463886b778e87bde60895690e2d6dbad8b8.
- The consolidated CI run #45257284797 is still in progress at this checkpoint. Boundary Lint failed with 14 cross-module import violations against its 193-entry reviewed baseline (206 current violations); the same 14 findings were present on the preceding run. Migration Full Apply failed its read-only access audit because role scs_audit lacks SELECT permission on _migration_log. Neither failure was bypassed or baselined.
- Web test job failed with 9 unrelated existing tests across buyer self-service recovery, buyer route hydration, merchant returns, and product-studio progress/flow (6 failing files, 31 passing files; 212 tests passed, 9 failed). Merchant settlement recovery passed all 5 tests. The job stops at the Web suite, so Admin recovery tests have not yet run in this CI attempt.
- API pagination parser tests (15) and payment controller/tenant-scope tests (4) passed in CI #45250855722. The merchant settlement recovery suite passed 5/5. API coverage and PostgreSQL integration jobs in #45257284797 were still running at this checkpoint; do not claim them passed.
- The touched outbox-dispatcher test exposed a case-sensitive SQL assertion against PostgreSQL's uppercase NOT LIKE; corrected to compare lowercased SQL in commit 3ef930973014bdb43e10a62c337a61831835c174. The latest CI run is the exact-head recheck for this correction.
- FIN-047 remains IMPLEMENTED / TESTING_PENDING. Do not merge/deploy. No migration or shared/staging DB write, environment mutation, worker activation, RLS/ACL change, or production operation was performed.
- Next: finish collecting CI #45257284797 API coverage and PostgreSQL integration results; run the Admin settlement recovery tests independently because the Web suite currently fails before Admin is reached; then address the 14 modular-boundary violations and _migration_log audit grant through their proper owners/reviewed changes. Do not change test expectations or weaken gates to hide failures.

## 23 November 2026 — FIN-047 verification follow-up and CI blocker corrections

- Rechecked PR #138 and the active branch. PR remains OPEN / DRAFT / UNMERGED to `develop`; source/test checkpoint before memory sync: `954200f9bf7866aa2f25d0585847a0c51eb19259`.
- Completed analysis of CI #45257284797 on `3ef930973014bdb43e10a62c337a61831835c174`. Formatting/lint/typecheck and Flutter checks passed. Boundary Lint reported 14 new cross-module imports; migration audit failed on SELECT of `_migration_log`; Web had 9 failed and 212 passed; API coverage had 89 failed and 4,634 passed; PostgreSQL integration had 41 failed and 1,599/1,706 passed. Merchant settlement Web recovery passed 5/5. Admin recovery did not run because Web failed earlier in the same job.
- Fixed the audit utility so it checks effective SELECT privileges for `public._migration_log` and `public.backfill_errors` before reading rows. An unprivileged read-only audit now reports `exists`, `canSelect` and null row summaries rather than failing; no grant or database mutation is introduced.
- Added the owning-store result to the two carrier worker unit-test mocks, retaining the production store-to-organization guard. Updated precise tenant-mismatch assertions in the unit and PostgreSQL tests. Corrected the outbox dispatcher test to check the literal `NOT LIKE 'shipping.carrier.%'` in generated SQL instead of treating it as a bind parameter.
- Updated CI so focused Admin hydration/settlement suites run via `always()` after install and contracts build, even when the Web suite fails. A failing Web test still fails the job.
- Pushed source/test/CI corrections in commits ending `71a9cf1`, `fc5053f`, `ab782ab`, `86e7d92`, `e318775`, `990e7b7` and `954200f`. CI #45260954714 was queued against `954200f`; no result from that run is claimed yet.
- Deliberately left the 14 boundary violations un-baselined for a proper service-contract refactor. Broad remaining API/PostgreSQL/Web failures are not represented as FIN-047 regressions without evidence.
- No migration, grant, RLS, staging/shared database operation, deployment, worker activation or merge was performed. FIN-047 remains IMPLEMENTED / TESTING_PENDING; PR #138 remains draft.

## 23 November 2026 — formatter recovery

- CI #45260954714 tested `954200f9bf7866aa2f25d0585847a0c51eb19259`. Install, lint and workspace typecheck passed; Flutter passed. The changed-file Prettier check failed and all downstream application-test and release jobs were skipped.
- A one-time formatter action applied `pnpm exec prettier --write` and verified with `pnpm exec prettier --check` across the affected source and memory files. It pushed formatting-only commit `4477ebd42ba46146b14df18094d025ab133c5d75`.
- The formatting correction has not yet received an exact-head CI run. No test results from #452609 are promoted to the formatter commit.
- PR #138 remains draft/unmerged. No deployment, migration, shared database write, grant, RLS change or worker activation was performed.

## 23 November 2026 — service-boundary implementation checkpoint

**Active PR:** #138, OPEN / DRAFT / UNMERGED to `develop`.
**Branch:** `remediation/phase-0-1-tenant-security`.
**Implementation checkpoint:** `0a023175ea5cfd7bd24c4fb36ee8c0b32f531adb`.

### Work completed in this continuation

- FIN-047 settlement pagination remains implemented: bounded page size, stable ordering, total count, matching merchant row/count scope, and Admin/Merchant page navigation. Consumer audit found no settlement export or aggregate that double-counts primary and adjustment rows.
- The least-privilege DB audit now checks effective SELECT permission with `has_table_privilege` before reading `_migration_log` or `backfill_errors`. It reports existence/permission and null row summaries when SELECT is absent. No privilege was granted.
- Carrier worker test fixtures now include the owning-store lookup required by the unchanged production tenant guard. PostgreSQL tenant assertions match the guard's actual rejection. The outbox test checks its carrier exclusion SQL literal in generated SQL. CI allows the focused Admin recovery tests to run after Web failure (install/contracts must succeed); Web failure remains fatal.
- G-015 service-boundary work now removes direct schema imports in four consuming areas:
  - Pricing consumes Catalog's variant pricing lookup contract for ownership and tier enrichment.
  - Operations Pilot Control consumes Identity and Merchant public services for organization/store validation.
  - Reviews consumes Orders' order/line projection and Catalog's product/variant predicate.
  - Realtime consumes Orders' order-room/driver assignment lookup and Merchant's canonical store resolver. Store membership and organization checks remain enforced.
- Added focused tests for Catalog pricing and review lookups, Pricing fixtures, Operations allowlist tenant rules, Orders realtime access, Reviews subject scope, and Realtime room authorization. Updated affected PostgreSQL integration fixtures to match the new Pilot Control service dependencies.
- Do not claim the E6 boundary count has fallen by a specific amount until the boundary job runs; it was skipped in the latest run. The original 14 new violations remain un-baselined in the reviewed register pending exact E6 evidence.

### Latest verification evidence

CI #45266315504 tested implementation checkpoint `0a023175ea5cfd7bd24c4fb36ee8c0b32f531adb` and concluded FAILED at the changed-file Prettier gate. Lint and TypeScript typecheck completed without errors; the mobile Flutter analyze/tests passed. Seven files need formatting:
`apps/api/src/__tests__/integration/p4-operational-readiness.postgres.spec.ts`,
`apps/api/src/__tests__/unit/operations/pilot-control-public-contract.spec.ts`,
`apps/api/src/modules/catalog/catalog-pricing-lookup.service.ts`,
`apps/api/src/modules/catalog/catalog-review-lookup.service.ts`,
`apps/api/src/modules/orders/order-realtime-access.service.ts`,
`apps/api/src/modules/orders/orders.module.ts`,
and `apps/api/src/modules/orders/orders.service.ts`.
API unit/coverage, PostgreSQL integration, migration full apply, E6 boundary lint, Web/Admin, build, contract generation and k6 were skipped behind the formatting gate. No application-test pass is claimed for these changes.

External Vercel preview statuses continue to report the provider build-rate limit; those are not application test results.

### Next actions and restrictions

1. Format the entire changed source/test/memory set once, run Prettier check, and trigger one exact-head consolidated CI verification.
2. Inspect the exact E6 boundary results and address any remaining direct schema coupling through module-owned service contracts. Do not edit the 193-entry reviewed baseline or create schema re-export barrels.
3. Keep FIN-047 at IMPLEMENTED / TESTING_PENDING until the API pagination/tenant tests, Admin recovery and Merchant recovery tests pass.
4. Continue G-002 source evidence and actual FK/method-predicate mapping. Protected staging/runtime identity inspection remains unavailable without authorization. G-001 independent review and G-036 focused security verification remain open; Phase 6 remains NOT STARTED.

No migration, database grant/default-ACL change, RLS enablement, shared/staging database write, deployment, worker activation, merge or release was performed. PR #138 remains draft and unmerged.

## 24 November 2026 — residual Returns and Shipping module-boundary refactor

- Source commit: `93844d781ff50cd3ba325c0d9e3ffe209bc128cc` — [PR #138](https://github.com/nabeel2323/scs-platform/pull/138), still OPEN / DRAFT / UNMERGED against `develop`.
- Moved the P13 return-expiration lease key into a common worker constant and the raw SQL `readRows` accessor into a common database helper. ReturnsService and ReturnExpirationWorker now consume those common contracts; the Operations configuration retains its compatibility export.
- Added IdentityService's PLATFORM-organization lookup and MerchantService's system-only store ownership/store-ID projections. Aramex uses the Identity contract; the shipping worker and authenticated webhook routing use the Merchant contract.
- Moved carrier shipment matching into an OrdersService query contract. The lookup remains constrained to the provider, external carrier reference, and store IDs for the authenticated credential organization, and is capped at two rows so ambiguous references fail closed.
- Replaced direct Returns/Shipping imports of Operations helpers and Identity/Merchant/Orders schemas with common or module-owned contracts. Added/updated focused tests for the query predicate, credential/provider mismatch, empty tenant store set, ambiguous shipment references, pre-auth routing, Identity lookup, Merchant store scope, and worker outbox ownership.
- **Verification:** tests were added/updated but were not executed. No formatter, lint, typecheck, E6 or broad CI run has been executed for this commit. GitHub Actions reports zero runs for this exact SHA because the commit uses `[skip ci]`. Vercel Web and Admin status contexts are SUCCESS, but these are preview statuses, not application-test evidence.
- G-015 remains PARTIAL until the exact-head boundary check verifies that the residual unbaselined imports are gone. The 193-entry legacy baseline was not changed. G-001 independent review, G-002 runtime identity/transaction-context/policy gates, G-036 verification, and Phase 6 remain open.
- No shared database, Supabase grants/RLS, migration, Render configuration, staging, external carrier, SMS/OTP, deployment, or worker activation action occurred.

**Next:** run formatting and focused API typecheck/unit suites plus E6 boundary lint for this commit, then continue the remaining implementation-first gaps. Keep the full regression/migration campaign grouped at the planned Phase 3 checkpoint; do not merge or deploy PR #138.


## 24 November 2026 — user reaffirmed implementation-first execution

The user explicitly directed: finish implementation first, then do the tests; proceed autonomously without asking for approval for each routine step. This is now a standing next-session instruction. No tests or CI workflows are to be run during implementation. Continue source review, complete cross-component wiring, group related changes into cohesive commits, and update project memory. The consolidated testing campaign begins only after implementation/integration is complete. Existing security and release restrictions remain unchanged.


## 24 November 2026 — G-002 transaction context: first HTTP integration

- Added the opt-in transaction-bound actor-context primitive in DatabaseService (commit `464b1c857a113489822ba3345aabe59b0a0be4b2`). Existing service access through `DatabaseService.db` resolves to the active Drizzle transaction handle inside the scoped operation. Actor context is set with parameterized transaction-local GUCs; same-actor nested context is reused; actor changes and access after scope completion fail closed.
- Added `TenantDatabaseContextInterceptor` and applied it only to NotificationsController (commit `108c60c668827065e6fcb29499860c8febdae984`). It runs after the JWT guard, derives identity only from verified `request.user`, and awaits the handler observable inside the database transaction. This is the first bounded HTTP adoption, not a global interceptor. The notification controller routes are DB-only; internal notification delivery methods are not automatically wrapped.
- No workers, audit middleware or other controllers are wired. Continue reviewing nested transactions, cached/detached handles, streaming, provider side effects and post-response audit writes before expanding the allowlist.
- No tests, formatter, lint, typecheck, E6 or CI were run per the standing user instruction. No database migration, grant/RLS, staging, deployment or worker activation occurred.


## 24 November 2026 — G-002 bounded actor-context adoption expansion

- Continued from the live PR #138 head and preserved the open/draft/unmerged PR.
- The opt-in DatabaseService actor-context implementation and expired-scope fence are now used by bounded authenticated request paths. Controller/method-scoped adoption covers Notifications, Pricing, Store Membership, Promotions, Reviews, Disputes, Inventory, Analytics, Catalog Offers/Requests/Taxonomy, selected Admin read endpoints, Cart, Returns, Organizations and Roles.
- The Promotions source correction also forwards the authenticated caller to merchant promotion operations, checks organization/store membership, constrains updates to the resolved store and normalizes foreign promotion detail denial to not-found.
- No global interceptor was added. Main Orders/Payments, Auth/Profile, file/import/upload, carrier webhooks, bootstrap, audit middleware, workers/schedulers, realtime, CLI and migration paths remain separate follow-up work.
- Latest branch head at this checkpoint: `836e06467228a8f7d6b34fff1c58bb33104f03a0`; PR #138 OPEN / DRAFT / UNMERGED. Exact-head Actions lookup returned zero workflow runs due to `[skip ci]`; Vercel Web/Admin both report external provider build-rate-limit FAILURE.
- Tests, formatter, lint, typecheck, E6 and CI were not run, per the user's implementation-first instruction.
- No RLS, migration, grants/default ACL changes, shared/staging DB writes, deployment, worker activation, merge or release.
- **Next:** continue safe bounded controller integrations only after source review; then define explicit worker/webhook/bootstrap/audit context scopes and finish G-002 operation/ownership evidence.


## 24 November 2026 — bounded Profile/device actor-context integration

- Applied the existing opt-in `TenantDatabaseContextInterceptor` to 16 bounded Profile/device handlers: profile read/update, organization list, device-token register/list/remove, favorites, saved suppliers, sessions read/revoke, trusted-device list/revoke.
- Credential setup and password-change handlers intentionally remain outside the interceptor because they perform credential/session security work and may have longer CPU/Redis lifetimes. AuthController remains outside.
- The IdentityModule already provides the interceptor for Organizations and Roles; ProfileController now uses the same provider.
- The interceptor remains method-scoped for ProfileController, not class/global scoped. The actor is taken from verified JWT claims by the shared interceptor.
- No tests, formatter, lint, typecheck, E6 or CI were run. No RLS, migration, grants, shared DB, staging, deployment or worker activation occurred.
- Source commit: `0eccaf90847bce0ca8039b6874a2053ce1412445`; allowlist documentation commit: `78d0475a7fcdbea6aca848a46236e5f536a4a796`.


## 24 November 2026 — CarrierTrackingPoller worker context

- Added a unique worker identity and a short `withWorkerContext` scope to CarrierTrackingPoller.
- The atomic shipment claim, tracking event inserts, delivered-after-cancel event/recovery-token writes, shipment status updates and Orders delivery bridge now run under the worker actor context.
- The external `provider.getTrackingInfo()` call and circuit-breaker operations remain outside the transaction. The context is opened only around the DB phase after the provider response is received; no transaction is held across the carrier network call.
- ShippingCarrierWorker remains outside because its create/cancel/label/track/webhook-retry paths mix database access with provider/storage operations and need a more granular DB/external-I/O split. ReturnExpirationWorker remains outside after its attempted wrapper was reverted to preserve lease/fencing semantics.
- No tests, formatter, lint, typecheck, E6 or CI were run. No worker was newly activated; existing enablement gates remain unchanged. No RLS, migration, grant, shared DB, staging or deployment action occurred.


## 24 November 2026 — explicit audit and bootstrap actor contexts

- `AuditLogMiddleware` now gives deferred response-finish audit writes their own short transaction with `actorKind: 'audit'`, preserving the request actor ID/role/active organization when available and using a non-user audit principal for unauthenticated requests. The listener was registered before the request interceptor, and it no longer relies on the request transaction after response completion.
- `BootstrapService.getStatus` runs under an anonymous actor context; the bootstrap authorization insert after OTP verification uses a bootstrap principal; initial Super Admin provisioning wraps its existing atomic transaction in a bootstrap context. OTP Redis/rate-limit/delivery work remains outside database transactions.
- `bootstrap-issue-token.ts` now sets transaction-local bootstrap GUCs immediately after BEGIN and before the advisory lock and any reads/writes. The CLI continues to keep token plaintext out of persistence/audit.
- No tests, formatter, lint, typecheck, E6 or CI were run. No shared database, migration, grants, RLS, staging, deployment, worker activation, merge or release occurred.


## 24 November 2026 — authenticated carrier webhook actor context

- CarrierWebhookController now establishes a credential-scoped worker context only after the webhook HMAC signature has been verified. The context uses `workerId: carrier-webhook:<credentialId>` and `activeOrgId: credential.orgId` from the authoritative credential row.
- Pre-auth credential lookup and webhook-secret decryption remain outside tenant context because the credential has not yet been authenticated. The payload's tenant/store/order identifiers remain untrusted.
- After HMAC verification, deduplication insert/read, credential-scoped shipment routing, ambiguous/not-found status writes, shipment linking, processed status and retry outbox writes run inside short actor-context transactions. Retry state and outbox insertion are separated into bounded transactions so a best-effort update failure does not hold the entire webhook operation open.
- HTTP response writes occur after each actor-context operation completes; no transaction is held across external carrier I/O (there is no carrier provider call in this webhook path).
- No tests, formatter, lint, typecheck, E6 or CI were run. No RLS, migration, grant, shared DB, staging, deployment, worker activation, merge or release occurred.


## 24 November 2026 — Orders and Merchant actor-context expansion

- Added method-scoped user actor contexts to bounded Orders reads: master/sub-order details, status history, tracking, order lists and driver shipment lists. Added context to checkout preview and reorder.
- Added context to DB-only Orders lifecycle operations: accept, partial accept, item confirmation, status transition, prepare, ready, driver assignment, pickup, out-for-delivery, deliver and delivery confirmation. Actual checkout, reject/refund and cancel/payment paths remain excluded because they may cross provider boundaries.
- Added method-scoped actor context to Merchant store list, merchant customers, store detail/slug, warehouse list, verification queue/history/detail reads, and DB-only store/warehouse/verification writes. Document listing/presigning and upload/storage routes remain excluded pending explicit DB/storage separation.
- Latest source checkpoint: `12ae73c7ddc6dd3e59485918ada316b7088cdd3b`; docs checkpoint: `b7b0cea7d51c123c263222034a748f97b90e0f1e`. PR #138 remains OPEN / DRAFT / UNMERGED.
- No tests, formatter, lint, typecheck, E6 or CI were run. No RLS, migrations, grants/default ACL changes, shared/staging DB writes, deployment, worker activation, merge or release.

## 24 November 2026 — authenticated identity DB-only actor-context adoption

- Source commit: `fe98b12f1f0ad9c6a24a48f02ceb5201c4cf3d4f` on `remediation/phase-0-1-tenant-security`; PR #138 remains OPEN / DRAFT / UNMERGED to `develop`.
- Added an IdentityService helper that opens a typed user actor context using claims forwarded by JWT-protected controllers. AuthController now passes verified role and active organization for account link/unlink and organization switch operations; ProfileController passes the same claims for credential setup/change.
- Credential setup performs the identity read and final recheck/unique-email guard, password update and credential audit insert in short user-scoped DB operations. Password hashing and strength validation remain outside the write transaction.
- Password change verifies and hashes the password outside DB transactions, then atomically updates the password with a prior-hash optimistic concurrency predicate, writes the credential audit, revokes trusted-device credentials and revokes the relevant sessions. General audit logging, when needed, runs in a separate audit actor context.
- Email/phone linking consumes the OTP from Redis first, then scopes only the account lookup, uniqueness/optimistic update and hashed account-link audit row. Identifier unlinking scopes its reads, last-auth-method checks, updates and audit rows.
- Organization switching verifies target membership and builds role/permission claims under a user actor context with no target active organization set until membership is resolved. Redis jti denylisting and JWT signing remain outside the transaction.
- Updated controller tests, account-linking tests, email OTP error-coverage tests and organization N+1 tests. Added `identity.credentials-context.spec.ts` to cover actor values, bcrypt outside the transaction and the password/device/session DB transaction boundary.
- **Verification:** test files were added/updated but not executed per the implementation-first instruction. No formatter, lint, typecheck, E6 or GitHub Actions workflow was run. Exact source SHA `fe98b12f1f0ad9c6a24a48f02ceb5201c4cf3d4f` has zero Actions workflow runs; Vercel Admin/Web contexts are SUCCESS preview statuses only, not application-test evidence.
- No migration, RLS enablement, grants/default ACL changes, shared/staging DB writes, deployment, worker activation, merge or release occurred.
- **Next:** design and implement safe pre-authentication principal resolution for phone/email OTP login, password login, refresh-token rotation and logout; preserve OTP/Redis/provider/bcrypt/JWT boundaries. Then continue safe Orders/Payments and Merchant metadata slices, complete ownership predicates/runtime evidence and defer consolidated verification until implementation/integration is complete.

## 24 November 2026 — credential actor-context test-fixture correction

- Test-only commit: `c8405a33388731095ef08b64d744a36d7b079cd3`, immediately after source commit `fe98b12f1f0ad9c6a24a48f02ceb5201c4cf3d4f`.
- Corrected the new credential-context service spec's update mock so `where()` returns a chainable query object with `returning()`, matching the Drizzle call shape used by the service. Awaiting the non-returning update path still resolves the mock terminal result.
- The spec remains unexecuted, as required during implementation. The PR head has zero GitHub Actions workflow runs; Vercel Admin/Web statuses are SUCCESS preview contexts only.
- No production source, schema, migration, database, RLS, grants, staging, deployment, worker or release behavior changed.

## 24 November 2026 — operation-scoped pre-authentication lookup

- Source commit: `4e9e04757e0ab5f6b3c7ac924240216de0b39d0f`.
- Added DatabaseActorKind `authentication` and five fixed purpose labels: phone OTP login, email OTP login, password login, refresh token and logout.
- Authentication contexts reject user ID, role, active organization and worker identity; operation label is stored in transaction-local `app.auth_operation` and included in same-actor nested-scope equality.
- IdentityService scopes initial account lookup for phone OTP, email OTP and password login, plus initial refresh/logout session lookup. OTP challenge consumption, rate limiting, bcrypt, provider delivery and JWT signing remain outside.
- This is only the first pre-auth lookup boundary. Post-proof account/session/device-credential writes and claims reads remain open for verified user actor contexts. No tests, formatter, lint, typecheck, E6 or CI were run. No RLS/grant/migration/database/deployment/worker/merge/release action occurred.

## 24 November 2026 — post-proof authentication/session DB phases

Source commits `5a6eba900eabe021352a0f7f3307bddaeb2d6333` and `b939a335a5bc126241131ab48bb03c9ed3cfaea6`.

- Phone/email OTP: Redis challenge consumption stays outside. Account lookup/create and claims resolution use the fixed authentication operation. Once role/org claims are resolved, session insertion and device-credential issuance run in a verified user actor transaction.
- Password login: rate limiting and bcrypt comparison stay outside. Post-password claims resolution uses the authentication operation; device-credential validation and trusted session insertion/anchor update use the user actor.
- Refresh: initial session lookup and claims resolution use the authentication operation. A user actor transaction conditionally revokes the still-active old session, inserts its replacement and validates/anchors device trust. A zero-row conditional revoke rejects a concurrent rotation. JWT signing remains outside.
- Refresh reuse and logout: resolve session owner first, then perform owner-bound session/device-credential revocations under the user actor. Logout's revocations share one DB-only transaction; unknown tokens remain non-disclosing.
- OTP Redis, rate limits, bcrypt, provider delivery, external audit side effects and JWT signing remain outside database actor transactions.

Added `database-authentication-context.spec.ts`; updated OTP lifecycle, OTP concurrency/security, email enumeration and identity N+1 test fixtures. No tests, formatter, lint, typecheck, E6 or CI were run. No RLS/grant/migration/staging/deployment/worker/merge/release action occurred.

## Payments bounded read-route actor context — 24 November 2026

Source commit: `7f56e5185cf1a7c7b6954845ca9151aac83c5ac6`.

Added `TenantDatabaseContextInterceptor` to eight JWT-protected, database-only GET handlers in PaymentsController: buyer payment detail (including order ownership, payment events and refunds), admin requested-refund queue, payment list, verification queue, stale payments, settlement list, merchant payment list and merchant settlement list. The existing service-layer object/tenant authorization and permission guards remain in place. No payment/refund/provider mutation route, file upload route or storage operation was wrapped. Added a controller metadata regression test for the interceptor allowlist; it has not been run.

This is method-scoped transaction context only. It does not enable RLS or change grants.

## Identity session/device route reconciliation — 24 November 2026

A follow-up controller audit confirmed that ProfileController's session list, revoke-by-device, trusted-device list and trusted-device revoke handlers already carry `TenantDatabaseContextInterceptor`. The interceptor derives the actor from the verified JWT after guards and scopes the complete awaited handler. These routes were therefore already covered; no redundant service-level wrapper or controller signature change was added. Credential setup/change remain explicitly scoped inside IdentityService because those handlers intentionally stay outside the interceptor for bcrypt separation.

## Payments DB-only mutation route actor context — 24 November 2026

Source commit: `22f14b0e14bf8ca8ddd2eb578b59d3f3ae5f9b50`.

Added the verified user actor interceptor to four Payments POST handlers whose inspected service call graphs perform database transactions, append payment events and write outbox rows without calling payment/refund providers or object storage: COD cash confirmation, bank-transfer proof verification decision, settlement calculation and settlement-paid recording. Existing permission guards, service-level object/store authorization, row locks, optimistic state predicates and transactional outbox writes remain authoritative. The actor context wraps the complete awaited method; nested Drizzle transactions remain inside that scope.

Explicitly excluded: bank-transfer proof upload (object storage), refund request/approval/retry (refund lifecycle), payment-provider operations, checkout and order cancellation/rejection paths. The controller metadata test now covers 12 Payments routes (eight GET and four DB-only POST); it remains unexecuted.


## 24 November 2026 — Merchant document metadata actor-context slice

- Reviewed Merchant document controller/service call graphs. Registration of an already-uploaded document and organization/store document listing perform database-only metadata and membership operations; presign handlers perform object-storage signing, and download presigning also writes the resulting URL.
- Added TenantDatabaseContextInterceptor to uploadDocument, listOrgDocuments and listStoreDocuments only. Kept presignDocumentUpload, presignDocument and presignMerchantDocument outside the request transaction.
- Added merchant-controller-document-context.spec.ts to assert both the allowlist and storage-path exclusions. Test source was not executed.
- Updated the G-002 implementation plan, progress tracker and programme gap register. No tests, formatter, lint, typecheck, E6 or CI were run. No RLS, migration, grants/default ACLs, shared/staging DB writes, deployment, worker activation, merge or release occurred.


## 24 November 2026 — Orders cancellation actor-context boundary

- Reviewed OrdersService.cancelOrder and PaymentsService.cancelPayment. The latter performs only payment-record lookup/update, payment-event insertion and transactional outbox persistence; no provider/refund call occurs in that method.
- Wrapped the cancellation authorization/read and order/shipment/inventory/payment DB transaction in a service-level user actor context derived from the verified caller. Kept realtime emission after the actor transaction commits, then ran master-order recalculation and final order read in a second short actor context.
- Did not add the controller interceptor: it would hold the outer transaction open across realtime emission. Merchant rejectOrder remains excluded because it calls requestRefund; checkout remains excluded pending full side-effect separation.
- Added an unexecuted regression spec for actor identity and commit-before-realtime ordering. No tests, formatter, lint, typecheck, E6 or CI were run. No RLS, migration, grants/default ACLs, shared/staging DB writes, deployment, worker activation, merge or release occurred.


## G-002 Orders rejection and Merchant document download-presign phases — 24 November 2026

- Merchant rejection uses the verified merchant actor for order authorization, optional SUBMITTED auto-advance, inventory settlement, optimistic REJECTED status transition, history and rejection outbox insertion. Inventory settlement receives the caller transaction, so stock movement and order status/history/outbox commit or roll back together.
- Refund-request creation runs only after rejection commits. It is a DB-only refund-record/event/outbox operation; the current generic outbox dispatcher only logs this event; no payment-provider refund is executed by this path. The rejection refund key is stable (reject-refund:<orderId>) rather than time-based, so retries reuse the same request. Failure remains non-fatal and logged.
- Master-order recalculation and final order read run in a separate short verified-user actor context. No request-wide interceptor was added to the rejection route.
- Merchant document download presigning uses one short actor context for document/membership reads, calls object storage with no DB transaction open, then uses a second short actor context to persist the signed URL. Both admin-reviewer and merchant-member routes pass verified JWT identity. Upload presigning remains storage-only; registration/listing retain their existing scoped handlers.
- Added Orders rejection and Merchant presign actor-context regression specs. They are authored but not executed under the implementation-first restriction.
- No tests, formatter, lint, typecheck, E6 or CI were run. No RLS, migration, grants/default ACLs, shared/staging DB writes, deployment, worker activation, merge or release occurred. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## 24 November 2026 — Orders rejection and Merchant presign implementation

Source implementation commit: 7e2b2509292cfbcfe6f1f12ebae8d2fad25f8cf1. Documentation/progress synchronization: 17dcad59ea2b8bf636eca43b58d0c0a98c452976 and 84f57fd368ae0472251133adaa8029b01b777b49. Merchant rejection now atomically scopes stock release, optimistic order status, history and outbox; refund-request persistence uses a stable idempotency key in a separate DB actor phase, with provider execution downstream. Merchant download presigning scopes metadata/membership reads and URL persistence separately around storage signing. Regression specs added but not run. Exact HEAD 84f57fd368ae0472251133adaa8029b01b777b49 has zero Actions runs; Vercel Web/Admin show external build-rate-limit failures. No tests/CI or protected DB/deployment action occurred.


## Refund-provider execution boundary correction — 24 November 2026

The merchant-rejection flow creates a refund REQUESTED row, payment event and outbox record only. Source inspection of OutboxDispatcher.dispatch confirms generic events are currently logged and marked dispatched; this does not invoke a payment-provider refund. Automatic refund-provider execution is not implemented by this slice and remains outside the approved scope (no automatic gateway/payout expansion or worker activation). The durable refund request is still available for the existing review/approval workflow. Merchant-initiated rejection refunds now attribute requestedBy/paymentEvents.actorId to the authenticated merchant; PaymentsService permits the special MERCHANT_REJECTION reason only when the caller has a MERCHANT_* role and assertOrderAccessible confirms the order is in the caller's active organization. The service no longer impersonates the buyer for audit attribution.



## Exact-head reconciliation — 24 November 2026 (latest continuation)

- Repository: nabeel2323/scs-platform; branch: remediation/phase-0-1-tenant-security.
- PR #138: OPEN / DRAFT / UNMERGED; base develop; exact branch/PR HEAD ec2998abb0ff5fbb9208d66558b4dde309f672bc.
- Source change group: 7e2b2509292cfbcfe6f1f12ebae8d2fad25f8cf1 (Orders rejection + Merchant download-presign); 733b0570c9ae4e94a9684ff28b30cbd3f77ec038 (merchant rejection refund actor attribution and special-reason authorization); df976de9db9c68c04885f106373c072334a9906b (outbox boundary comment). Regression specs were added/updated in the same group and remain unexecuted.
- Documentation/progress updates include 17dcad59ea2b8bf636eca43b58d0c0a98c452976, 84f57fd368ae0472251133adaa8029b01b777b49, fa06d4709367e29a256fa0373fa6fbc42361dac6 and 7663d692fd0f32a3760e07980b4a232e3ab900fb. Latest small test-fixture role correction is ec2998abb0ff5fbb9208d66558b4dde309f672bc.
- Exact-head GitHub Actions lookup: zero workflow runs. Exact-head combined status: zero status contexts. Prior source checkpoint 7663d69 showed Vercel Web/Admin build-rate-limit failures; those prior statuses are not current-head evidence.
- No tests, formatter, lint, typecheck, E6 or CI were run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.
- Refund boundary: rejection creates a durable refund request/payment event/outbox record only. The generic OutboxDispatcher currently logs events and marks them dispatched; no payment-provider refund is executed by this path. Automatic provider execution remains outside the approved scope.
- No merge, deployment, worker activation, RLS, migration, grants/default ACLs or shared/staging database action occurred.


## G-002 Merchant verification-review actor context — 24 November 2026

- Source commit: `6339acb944d3e41a6066e0f123394daa38d74491`.
- Audited `MerchantController.reviewVerification` and `MerchantService.reviewVerification`. The service uses one DB transaction with row locks on the verification request and store; checks that the request organization matches the store; updates verification request, store and business-document state; conditionally updates organization verification and activates eligible products; and writes the decision outbox row with the same transaction client. No storage/provider I/O occurs in this path.
- Added the verified-user `TenantDatabaseContextInterceptor` to the review handler. The existing permission guard remains in place; the actor is derived from the authenticated JWT, not the request body.
- Expanded `merchant-controller-document-context.spec.ts` to assert that review is scoped while all document presign routes remain outside the request transaction.
- Regression spec authored, not executed. No tests, formatter, lint, typecheck, E6 or CI were run. No database/RLS/migration/grant/staging/deployment/worker/merge/release action occurred.


## G-002 worker/realtime actor-context source reconciliation — 24 November 2026

- Reopened the current worker/socket source rather than relying on historical handoff text. Confirmed AutoCompleteWorker claim and completion phases, OutboxDispatcher claim/ack/retry, AuditLogMiddleware's response-finish audit transaction, ReturnExpirationWorker's lease/claim/per-return escalation phases, ShippingCarrierWorker DB phases, CarrierTrackingPoller claim/persistence/delivery bridge and RealtimeGateway room authorization all use explicit actor contexts.
- Confirmed provider calls, carrier label HTTP fetch/streaming, and object-storage persistence remain outside actor transactions. Return-expiration still checks the live lease holder/epoch/expiry and does not wrap the full batch in one transaction.
- Corrected the stale method-level map statement that ReturnExpirationWorker, ShippingCarrierWorker and realtime socket context remained uncovered. The G-002 physical table/operation matrix and runtime identity evidence remain incomplete.
- Source-map reconciliation only. No tests, formatter, lint, typecheck, E6 or CI were run. No database/RLS/migration/grant/staging/deployment/worker activation/merge/release action occurred.


## G-002 physical table matrix — Identity and Merchant direct-column pass — 24 November 2026

- Reopened current `identity.schema.ts` and `merchant.schema.ts` and upgraded 16 ownership-matrix rows from broad module-level guesses to schema-backed direct columns and declared FK paths.
- Explicitly distinguished user-private identity from organization membership; global RBAC reference tables from tenant data; user-owned sessions/device credentials/security audit rows; organization-owned stores; store-inherited warehouses; dual-parent business documents and verification requests; and store/user membership relationship rows.
- Recorded that `business_documents` and `verification_requests` have independent org/store references with no composite FK in the reviewed Drizzle schema, so service-level cross-parent consistency checks remain mandatory. Actor attribution fields are not treated as ownership keys.
- This is schema-source evidence only. Live staging FK/constraint/privilege verification and the 114-versus-116 discrepancy remain open. No tests/CI or database/staging/deployment action occurred.


## G-002 physical table matrix — Catalog core/offers/taxonomy direct-column pass — 24 November 2026

- Reopened the current Catalog core, offer, request, taxonomy, search and platform catalog-import schema modules and mapped 24 table rows with direct columns and declared FK paths.
- Preserved nullable/shared category and product cases; separated global taxonomy/reference tables from merchant-owned product and offer rows; mapped child inheritance for variants/media/sources/typed attribute values; and distinguished user-owned favorites/saved-supplier relationships from referenced products/stores.
- Separated store-scoped merchant import_jobs from platform-level catalog_imports; uploader IDs are actor attribution for the latter. Search query rows are mixed because both user_id and store_id are nullable.
- Recorded multi-parent consistency requirements for offers, offer-review state and product media where simple FKs do not prove the full relationship. This is source-schema evidence, not a live catalog or RLS policy approval.
- No tests/CI, database, migration, grant, RLS, staging, deployment or worker action occurred.


## G-002 physical table matrix — Inventory/Pricing/Promotions/Orders/Shipments direct-column pass — 24 November 2026

- Reopened the current Drizzle schemas for inventory, pricing, promotions, carts, orders and shipments; mapped 15 physical table rows with direct owner/reference columns.
- Preserved the distinction between warehouse-owned stock and product variant references; store-owned price lists and their variant tiers; store-owned promotions and buyer-specific redemptions; buyer-owned carts/master orders; buyer/store participant visibility for sub-orders; and shipment child inheritance.
- Recorded non-FK and multi-parent edge cases: stock movement reference_id is polymorphic; promotion scope_id is polymorphic; promotion_redemptions.order_id is not a declared FK; cart items and orders require cross-parent consistency; shipments must agree with their order/store; actor IDs are attribution only.
- This is schema-source evidence only. No tests/CI or database/RLS/migration/grant/staging/deployment action occurred.


## G-002 full module-schema inventory and final ownership-column pass — 24 November 2026

- Mapped the remaining 44 table entries across Audit, Payments/Financial, Returns/Calendar, Reviews/Support, Notifications, Operations, Shipping and Bootstrap with direct columns, declared FK paths, polymorphic references, actor attribution and sensitive-data notes. Added the previously missing `payment_proof_upload_intents` row.
- Compared all 25 module `*.schema.ts` files with `apps/api/src/drizzle/schema.ts`. Found 100 `pgTable` declarations across module schema files; 98 are re-exported by the barrel. `catalog_imports` and `catalog_import_errors` are declared in `catalog-import.schema.ts` but that file is not re-exported. The prior 99-row matrix included those two and omitted the exported `payment_proof_upload_intents`; the matrix now lists all 100 module declarations.
- This invalidates the historical 99+15=114 split as a current source reconciliation. The 114 and 116 public relation counts remain historical/unresolved until the authorized protected read-only catalog audit. No subtraction-based delta is asserted.
- Candidate ownership mapping is not RLS verification. No tests/CI, database, migration, grant, RLS, staging, deployment, worker activation, merge or release action occurred.


## G-002 Payments proof upload and cleanup actor-context adoption — 24 November 2026

- Refactored PaymentsService `submitProof` so every database phase is wrapped in a verified-user actor context derived from the passed CallerContext: initial payment/order authorization, durable intent insert, post-upload intent transition, compensation and cleanup scheduling, final payment/event/outbox/intent transaction, lost-ack verification, and final payment read.
- Kept StorageService put/delete calls outside actor scopes. The multipart controller deliberately remains unwrapped by TenantDatabaseContextInterceptor and forwards verified JWT claims to the service.
- Added worker actor contexts around cleanupStaleProofUploads claim, per-intent payment-reference read/COMMITTED update, and CLEANED/retry/FAILED writes. Object head/delete remains outside transactions. The global payment reference check is an explicit worker operation with no tenant org.
- Added focused actor helper specs and controller boundary coverage. They were authored but not run. No scheduler activation, object-storage call, tests/CI, database/RLS/migration/grant/staging/deployment action occurred.


## Automatic CI exception — 24 November 2026

The source commit `fa9e554418f6b268bbab35208a8f35db48a41161` unexpectedly triggered GitHub Actions CI run #1474 (`45376045168`). It completed with Mobile Flutter Tests SUCCESS, API Lint SUCCESS and API Typecheck FAILURE. The typecheck reported errors in the newly changed PaymentsService proof path (nullable actor role, nullable upload identifiers and fileBuffer closure narrowing), plus additional errors in TenantDatabaseContextInterceptor, IdentityService, ShippingCarrierWorker and integration-test files. No baseline run was available to attribute the additional errors.

The PaymentsService errors attributable to this change were corrected in source commit `fc2993290d4522d397ab56934e41103f8dd9d060` by validating/narrowing the caller role and capturing immutable non-null file/intent values before async callbacks. No tests or typecheck were manually invoked. The source fix commit automatically triggered CI run #1475 (`45376830054`), which was IN_PROGRESS at this documentation checkpoint. The available GitHub connector exposes no workflow-cancel action; no cancellation was possible. Do not treat run #1474 as successful verification, and do not intentionally dispatch or rerun CI before implementation/integration is complete.


## Final automatic CI result — 24 November 2026

Actions run #1475 (`45376830054`), on source commit `fc2993290d4522d397ab56934e41103f8dd9d060`, completed with Mobile Flutter Tests SUCCESS, API Lint SUCCESS and API Typecheck FAILURE. The typecheck no longer reported errors in `payments.service.ts`; the PaymentsService actor-role and async nullable-value issues from run #1474 were absent after the fix. Remaining reported failures were in `tenant-database-context.interceptor.ts`, `identity.service.ts`, `shipping-carrier.worker.ts`, integration specs (account-linking, device-trust, email-OTP, m723a1 concurrency, registration flows) and unit specs (token revocation and database authentication context). No baseline run was available to classify those as pre-existing.

Unit Tests + Coverage Gates, Integration Tests, Boundary Lint (E6), Container Build & Smoke Test, Web/Admin App Tests, Migration Full Apply, Build, Contract Spec & Codegen, k6 Smoke Test and Trigger Staging Release were SKIPPED. No backend unit/integration or release-gate success is claimed. The two automatic runs were not intentionally dispatched; no further CI rerun is requested. The available GitHub connector has no workflow-cancel action.



## G-002 actor-context typecheck correction — 24 November 2026

- Corrected the API typecheck issues recorded by automatic run #1475: JWT claim narrowing across the interceptor's deferred callback; stable non-null prior password hash for IdentityService's optimistic update; and the missing validated orgId return in ShippingCarrierWorker's tenant assertion.
- Updated direct IdentityService test calls to supply the required authenticated actor for account linking/unlinking, password change and organization switching. Updated the carrier-worker concurrency fixture for the expanded constructor and corrected the authentication-context mock transaction callback type.
- Source commit: [`c587ed4`](https://github.com/nabeel2323/scs-platform/commit/c587ed46db9a4893f2fa0167a74e671bc9d3ae10). No tests, formatter, lint, typecheck or E6 were run.
- Actions #1476 (`45385046873`) was automatically triggered by the PR push; it was not intentionally dispatched. No cancel action is available through the connected GitHub capability, and no further run is intentionally requested.


## G-002 carrier recovery and worker lease actor-context adoption — 24 November 2026

- Added short worker actor contexts around CarrierReconciliationService create/cancel claims and durable recovery-state writes. External carrier tracking calls stay outside transactions; retry outbox intent and shipment retry state commit together.
- Added verified-user actor scope around CarrierAdminController recovery read/authorization/state-update/re-read and recovery-queue reads. Provider reconciliation is invoked after the user scope closes; audit persistence uses a separate audit principal.
- Added worker actor contexts to WorkerLeaseService DB operations and a system actor for runbook-only force-expire.
- Updated/added regression specs; no tests, formatter, lint, typecheck or E6 were run.
- Source commits: a78503a01f28de440b2ae8d9c3cafd1e754dfd93 and 98161b3f2e49b4b16af3d0fe6c98c5a8074a441f.

## 24 November 2026 — latest automatic CI result and fixture correction

Run #1478 (45386103613) on source commit 98161b3f2e49b4b16af3d0fe6c98c5a8074a441f completed FAILURE. API lint succeeded; API typecheck reported only three diagnostics in worker-lease-expiry-fencing.spec.ts: withActorContext was not bound in the third test, and its callback context parameter was consequently implicit any. Mobile Flutter Tests succeeded. Format check and all downstream unit/coverage, integration, E6, build, contract, k6, container and staging jobs were skipped. Source fixture correction commit 5de17d1880aa645a2efeccaf98eba959c6da7c8e binds the helper in that test. It contains [skip ci]; no rerun is requested, so the correction is not yet typecheck-verified.

Exact current head 5de17d1880aa645a2efeccaf98eba959c6da7c8e has zero GitHub Actions runs. Vercel Web/Admin contexts are FAILURE because the preview provider rate-limited deployments. PR #138 remains OPEN / DRAFT / UNMERGED.

## 24 November 2026 — Catalog Import read-only/report actor-context slice

CatalogImportController list, detail and errors routes now use TenantDatabaseContextInterceptor after the class-level JWT, permission and role guards. Preview is intentionally excluded because it reads only the in-memory plan cache. Upload, execute and retry are intentionally excluded because they combine object-storage/workbook processing with multiple DB phases. The report route passes verified JWT sub/role/activeOrg to CatalogImportService; persisted errors are fetched in a short user actor context, then the XLSX workbook is generated after the DB scope closes. Regression metadata coverage was added for route interceptor selection; no test was run.

Catalog Import upload, validation, execution, retry, template dropdown reads and export source queries now use explicit caller actor scopes with storage/workbook work outside DB transactions. Next P13 operational services remain: P13Monitor, OpsAlert, OpsControl and PilotControl principal separation.

## G-002 — Catalog Import actor-context phase separation — 24 November 2026

**Source implementation checkpoint:** `ff83be282b9f36c1153271e612e5686bbee33931` (source files: CatalogImportController, CatalogImportService, ExcelExecutorService and TemplateGeneratorService).

- The controller now forwards verified JWT `sub`, `role` and `activeOrg` into upload, execute, retry, template download and catalog export operations. Existing list/detail/errors routes retain the post-guard verified-user interceptor; preview remains in-memory only.
- Upload performs object-storage put before opening a short user actor scope for the import-row insert. Auto-validation then passes the same verified caller through each phase.
- Validation scopes job/status reads and writes, existing-catalog snapshots, reference resolution, plan/refs persistence and error persistence to short user actor transactions. Storage download, byte collection, XLSX parsing, validation, planning and cache mutation remain outside DB transactions.
- Execution scopes import status/counter updates, publishability DB reads, error/plan persistence and audit persistence. The audit record uses a separate audit principal. ExcelExecutorService establishes a verified user actor for each of its 12 ordered entity-type transactions; combination-key updates use a separate short user actor scope. Existing per-entity transaction/savepoint and dependency behavior is retained.
- Retry resolves the job under the caller actor, then reuses caller-aware validation and execution. Failure-path plan snapshot persistence is also actor-scoped.
- Template dropdown source rows are loaded under one short actor scope; template workbook creation and XLSX serialization occur after it closes. Catalog export scopes each independent source query and performs workbook row generation/serialization outside those query scopes.
- Object storage and workbook parsing/generation are not wrapped in actor transactions. No request-wide transaction was added.
- This is source implementation only. No tests, formatter, lint, typecheck, E6 or CI were intentionally run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED. No RLS, migration, grants/default ACLs, shared/staging database actions, deployment, worker activation, merge or release occurred.

**Remaining G-002 work:** P13Monitor/OpsAlert/OpsControl/PilotControl worker/system/operator principal separation; remaining source-backed raw SQL/function/trigger/partition/bootstrap/CLI/helper access paths and exact per-operation predicates; migration-backed FK validation; protected read-only catalog and actual API/migration runtime identity evidence through the authorized process. G-001 independent review and G-036 verification remain open; Phase 6 remains NOT STARTED.


## G-002 — P13 monitor, alert, ops-control and pilot-control principals — 24 November 2026

**Source implementation checkpoint:** P13 source slice completed through `c80af8cddb3a65814a20304f53b49f400f8c416d`.

- P13Monitor's raw SQL reads now execute under a dedicated worker principal (`p13-monitor`). Worker-lease reads continue through WorkerLeaseService's own worker principal. Findings collection remains read-only; alert raise/resolve work begins after those short read scopes close.
- OpsAlertService's durable alert-state DB phases use the platform alert-service system principal when no caller context is active. Operator-facing list/snapshot reads use the verified admin user. Atomic claim/update statements remain individually scoped; webhook delivery stays outside the alert-service's short DB scopes.
- OpsControlService checks the pause flag under a worker principal. Admin state/history reads and pause/resume mutations use verified caller claims; the durable control row and append-only control audit row remain in one caller-bound transaction. Platform AuditService writes use a separate audit principal, and alert delivery follows after those DB scopes close.
- PilotControlService policy flag/allowlist reads reuse an already-active verified caller/worker context, otherwise use a dedicated system policy reader. Admin snapshots and configuration mutations use verified caller claims; platform audit writes use a separate audit principal. Organization/store ownership validation calls remain outside the local write transaction.
- OperationsController now forwards authenticated JWT `sub`, `role` and `activeOrg` to the control, alert and pilot services. No new RBAC permissions or role changes were introduced.
- This is source implementation only. No tests, formatter, lint, typecheck, E6 or CI were intentionally run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED. No RLS, migration, grants/default ACLs, shared/staging database actions, deployment, worker activation, merge or release occurred.

**Next G-002 work:** complete callsite and operation-map reconciliation for P13 and the other raw SQL/service/worker paths; verify actor scopes are never switched while another actor transaction is active; finish the physical table/operation/ownership-predicate matrix and exact FK evidence; obtain protected read-only runtime catalog and API/migration identity evidence through the authorized process. Regression specs are still required before the deferred verification campaign. G-001 independent review and G-036 verification remain open; Phase 6 remains NOT STARTED.


## G-002 — Catalog Import and P13 actor-context adoption consolidated — 24 November 2026

**Latest source implementation checkpoint:** `75890feeffcef6f0035238476dc9242958dd5ec5`.

The Catalog Import source slice and P13 operational principal slice are now implemented together:
- Catalog Import upload/validate/execute/retry, executor entity-type transactions, report errors, template dropdown queries and export source queries use verified caller actor scopes. Object storage, XLSX parsing, workbook construction and serialization remain outside DB actor transactions. Failure-path plan persistence and audit writes use the appropriate user/audit principal.
- P13Monitor raw SQL reads use a worker principal; WorkerLeaseService retains its own worker scope. OpsAlert durable alert-state DB phases use a system service principal when no caller context is already active; operator list/snapshot reads use the authenticated admin actor. Webhook delivery remains outside the alert service's short DB scopes.
- OpsControl pause checks use a worker principal; admin state/history/pause/resume use the verified caller, with the control row and append-only control audit in one transaction and a separate audit principal for AuditService.
- Pilot policy reads use the current verified actor when nested or a system policy principal otherwise. Admin snapshots and writes use the verified caller; organization/store ownership validation reads are also caller-scoped; AuditService writes use a separate audit principal.
- Helper wrappers now await PromiseLike/Drizzle query thenables before leaving the actor context.
- The implementation does not activate workers, change RLS/grants/migrations, or access shared/staging data. No tests, formatter, lint, typecheck or E6 were intentionally run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.

**Automatic CI note:** GitHub automatically queued PR CI run #1499 (run ID 45394547128) after the source push. It was PENDING at the last check; no workflow was intentionally dispatched. Vercel Web/Admin contexts remained FAILURE due to the external build-rate limit. Check the run's eventual result before starting the deferred verification campaign.

**Next work:** reconcile the complete G-002 operation inventory against all source callsites and exact table/ownership predicates; verify no actor-context switch occurs while a different actor transaction is active; finish the 99 Drizzle-exported / 114 detailed public relation / unresolved 116 historical count reconciliation; validate migration-backed FKs and obtain protected read-only runtime catalog plus actual API/migration runtime identity evidence through the authorized process. Add/adjust regression specs after implementation/integration is complete, then run the consolidated verification campaign. G-001 independent review and G-036 verification remain open; Phase 6 remains NOT STARTED.


## 24 November 2026 — CI failure triage and fixture compatibility correction

- Automatic PR CI run [#1499](https://github.com/nabeel2323/scs-platform/actions/runs/45394547128), on the earlier source checkpoint `75890feeffcef6f0035238476dc9242958dd5ec5`, completed with **API Lint PASS / API TypeScript typecheck FAIL**. The typecheck errors were due to test fixtures still calling the new caller-required APIs with legacy signatures, plus a stale `actorId` reference in PilotControl's flag log message. Vercel Web/Admin contexts also failed on the external build-rate-limit page.
- Corrected the PilotControl caller attribution reference. Updated Catalog Import executor/template tests to pass a verified caller; integration harnesses now use the real DatabaseService actor-context implementation. Updated executor unit doubles to expose the scoped-context hook. Updated P13 operational-readiness and PilotControl tests to pass caller contexts and use the real DB actor-context wrapper where PostgreSQL is involved.
- These are test-source/fixture corrections only. They have **not** been executed and no new typecheck was run. Do not treat CI #1499 as verification of the corrected test fixtures.
- Latest implementation/test commit: `4950e66507efebca8fbc7d910d65ae717f360732`. Exact-head Actions lookup returned zero workflow runs. Exact-head combined status contains only Vercel Web/Admin failures targeting the provider build-rate-limit page; these are not application test results. Commits use `[skip ci]` under the implementation-first verification restriction.
- PR #138 remains OPEN / DRAFT / UNMERGED. No merge, deployment, worker activation, migration, RLS/grant/default-ACL change, shared/staging DB access or provider call occurred.

**Next:** complete the remaining source callsite/ownership-predicate inventory, then run the consolidated typecheck/unit/PostgreSQL/E6 verification campaign only after implementation and integration are complete. Resolve any newly exposed failures before considering G-002 verified. G-001 independent review and G-036 verification remain open; Phase 6 remains NOT STARTED.


## 24 November 2026 — carrier credential/configuration actor-context continuation

**Source commits:** `9906430459666effbd25f33148c3cdf01b976330` and `9a010db69c668432f2811c68094a367ad5c7684c`.

Carrier credential CRUD now uses verified user actors; configuration CRUD is likewise user-scoped. Internal credential/configuration resolution and decryption use organization-bound worker contexts and exact org predicates. Aramex provider reads retain org/provider/active predicates and use the Identity-resolved PLATFORM organization for global lookups. Incoming webhook credential resolution uses a dedicated worker principal and preserves the ambiguous legacy-route 401 response outside the transaction. Decryption occurs after DB scopes close.

AuditLogMiddleware already scopes its deferred response-finish write with an audit actor. Migration runner, seed CLI, bootstrap token CLI and BootstrapService retain separate migration/seed/bootstrap/anonymous principals. No generic HTTP context was applied to those paths.

No tests, formatter, lint, typecheck or E6 were intentionally executed. Automatic Actions [#1501](https://github.com/nabeel2323/scs-platform/actions/runs/45422228217) was in progress at last inspection. No pass is claimed. Next: raw SQL/function/trigger/partition inventory, direct migration/bootstrap/CLI access-path reconciliation, exact ownership predicates and FK evidence, then protected read-only runtime identity/catalog evidence. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## 24 November 2026 — carrier caller-role type correction

Source commit `4d3488d7017439c1e756df4a595873dc9d590455` follows the carrier credential/configuration actor-context implementation. It requires a non-empty caller role before creating the user actor context, resolving the exact API typecheck failure from automatic run #1501. Carrier credential create now authorizes organization membership before encryption and re-checks membership inside the insert transaction.

Run #1501 on the prior source SHA failed API typecheck (nullable caller.role); API lint and Mobile Flutter tests passed; dependent integration/unit/coverage/migration/Web/Admin/build/release jobs were skipped. The correction is not re-run. Exact-head Actions lookup on 4d3488d is empty. No tests or CI were intentionally dispatched.


## 24 November 2026 — webhook actor-context test fixture follow-up

Commit `47c27898447389de4809a861f19c7b37e54b7081` updates the existing webhook tenant-routing tests to supply `DatabaseService.withActorContext` and expect the credential's organization ID to be passed to webhook-secret decryption. The ambiguous-credential test continues to assert HTTP 401 and no secret decryption/event persistence. The tests were not executed.


## 24 November 2026 — G-002 migration and operator access continuation

**Source checkpoint:** `48b22ded255f514f4ccec55d58a604a1c41e7b8f`.

The 75-file migration source audit found the normalize_arabic function in migration 0007, its pg_catalog search_path hardening in 0070, no migration-defined triggers/policies/RLS/views/sequences/SECURITY DEFINER declarations, and pg_partman analytics partition/retention setup in 0013/0018. The pg_cron scheduling example is commented out; no repository scheduler manifest exists. The read-only DB audit now reports all non-system functions/triggers, partman retention config and cron maintenance jobs when accessible.

Implemented source corrections: local migration exclusions shared between migrate.ts and DatabaseService; advisory-lock/ledger rechecks; system/bootstrap/audit transaction-local principals for seed/bootstrap/audit tools; staging target confirmation and scoped read-only diagnostic; guarded/atomic legacy verification scripts; seed mapping-count double-count correction.

No test, CI, database, migration, seed, reset, bootstrap or audit command was run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED. Next: prove external partman maintenance schedule and actual API/migration roles via authorized read-only staging, finish FK/ownership evidence, then consolidated verification after implementation completes.


## 24 November 2026 — G-002 migration/operator continuation and exact-head status

Source implementation checkpoint: `48b22ded255f514f4ccec55d58a604a1c41e7b8f`. Current branch/PR head after documentation sync: `a286cd6b2c8d239e94a3a4d024c872e08fbbc3d4`. PR #138 remains OPEN / DRAFT / UNMERGED to `develop`.

Completed source work: shared pg_partman development migration exclusions; advisory-lock and ledger rechecks; transaction-local system/bootstrap/audit actor contexts; staging bootstrap target guards; guarded atomic legacy verification runners; extended read-only function/trigger/partman/cron audit; RBAC seed mapping count correction. Detailed handoff: `docs/remediation/G-002-MIGRATION-OBJECT-AND-OPERATOR-ACCESS-AUDIT-2026-11-24.md`.

Exact-head Actions lookup: zero runs. Vercel Web/Admin: FAILURE due to deployment rate limit (“retry in 24 hours”), not application tests. No tests, formatter, lint, typecheck, E6 or CI were intentionally run. No database/migration/seed/reset/bootstrap/audit operation was executed. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED. Next: confirm external pg_partman maintenance scheduling and actual runtime roles through authorized read-only staging, finish ownership/FK evidence and actor-context nesting review, then consolidated verification after implementation completion.


## 24 November 2026 — stale migration-ledger fail-closed correction

Source follow-up through `6f3327a2039c65fb0f9578202d4bd76c75e7b426` adds a second layer of migration consistency protection:

- Local `migrate.ts` and DatabaseService development bootstrap now refuse to proceed when pg_partman-dependent migrations 0013/0018 are already present in the ledger despite being excluded from the local image. They do not delete ledger rows or attempt automatic repair; the local DB may contain partial state and must be explicitly rebuilt/reconciled.
- The complete `migrate-pg.ts` runner now rejects impossible/stale analytics ledger states: 0018 without 0013, 0013 without the pg_partman extension/config row, or 0018 whose retention values do not match the migration.
- The disposable M7.3 runner refuses to continue if skipped pg_partman migrations already appear in its ledger.
- Local `migrate.ts` uses a unique per-process/per-file temp SQL path and cleans it up, avoiding concurrent runners overwriting the same temporary script.
- Disposable shell verification target guard now also checks `inet_server_addr()` is a Unix socket or loopback address, in addition to explicit test environment, exact DB/user, local PGHOST/PGHOSTADDR and no PGSERVICE redirection.

No database was inspected or repaired, and no tests/CI were run. These are source-level fail-closed checks only.


## 24 November 2026 — G-002 migration-ledger safety follow-up and final status

Latest source implementation checkpoint: `f21dbe4aca75ba04e9173b1fc28a9591829af554`; documentation head: `bb193c7b52ed83bc6c0a6f72ce1a24ba4dcdd926`. Branch and PR #138 are synchronized; PR remains OPEN / DRAFT / UNMERGED to `develop`.

Added fail-closed stale-ledger detection for excluded pg_partman migrations in local and complete migration paths; complete migration runner verifies the extension/config/retention state before trusting legacy analytics ledger entries. Local migration temp files are unique per process/file and cleaned up. Legacy disposable migration runner now stops after the first failed migration. Disposable target guard also verifies PostgreSQL server address is loopback/unix-socket.

Exact-head Actions: zero runs. Vercel Web/Admin: deployment rate limited, retry in 24 hours. No tests, CI, database, migration, seed, reset, bootstrap or audit command was executed. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## 24 November 2026 — migration FK source scan completion

The 75-file numbered migration scan found 183 explicit REFERENCES clauses across 40 migration files; 35 files had none. The detailed migration/count/parent-table appendix is in `docs/remediation/G-002-MIGRATION-FOREIGN-KEY-CROSSWALK-2026-11-22.md`. This completes the static source-reference inventory, not live catalog verification. Remaining: reconcile with Drizzle declarations and protected staging pg_constraint evidence, then finish cross-column ownership consistency decisions (org/store, carrier config/credential/store, payment/refund/order/settlement, shipping driver/store, reconciliation parent/org). No database query was run.


## 24 November 2026 — financial cross-column ownership remediation

- Reviewed `CarrierConfigurationsService`, return/payment/order schemas and services, payment/settlement schemas, `SettlementAdjustmentService`, and `CommissionReversalService` against the G-002 migration FK crosswalk.
- Found that independent FKs do not enforce the same-sub-order/payment/store relationships. Hardened settlement-adjustment creation and posting, plus commission-reversal payment/order-item/settlement/org resolution.
- Source commits: [01b6e6c](https://github.com/nabeel2323/scs-platform/commit/01b6e6c729c1a458f20aaeaed043df4c569119e4) and [fa25479](https://github.com/nabeel2323/scs-platform/commit/fa2547997c4b4dad490b582f92c9a69b8c01ed8f).
- Updated the migration FK crosswalk and authoritative progress tracker with the new invariants and exact regression cases still required.
- No tests, formatter, lint, typecheck, E6 or manual CI dispatch was intentionally run. GitHub automatically queued PR CI #1503 (run ID 45434170778) after the source pushes; it was IN_PROGRESS at the live check. This is not claimed as a pass. No staging/shared DB, migration, grant/RLS, deployment, worker activation, merge or release action occurred.
- Next: review driver/store assignment and reconciliation run/discrepancy organization inheritance, then complete the remaining cross-column ownership matrix. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## 24 November 2026 — financial cross-column ownership remediation

- Reviewed `CarrierConfigurationsService`, return/payment/order schemas and services, payment/settlement schemas, `SettlementAdjustmentService`, and `CommissionReversalService` against the G-002 migration FK crosswalk.
- Found that independent FKs do not enforce the same-sub-order/payment/store relationships. Hardened settlement-adjustment creation and posting, plus commission-reversal payment/order-item/settlement/org resolution.
- Source commits: [01b6e6c](https://github.com/nabeel2323/scs-platform/commit/01b6e6c729c1a458f20aaeaed043df4c569119e4) and [fa25479](https://github.com/nabeel2323/scs-platform/commit/fa2547997c4b4dad490b582f92c9a69b8c01ed8f).
- Updated the migration FK crosswalk and authoritative progress tracker with the new invariants and exact regression cases still required.
- No tests, formatter, lint, typecheck, E6 or manual CI dispatch was intentionally run. GitHub automatically queued PR CI #1503 (run ID 45434170778) after the source pushes; it was IN_PROGRESS at the live check. This is not claimed as a pass. No staging/shared DB, migration, grant/RLS, deployment, worker activation, merge or release action occurred.
- Next: review driver/store assignment and reconciliation run/discrepancy organization inheritance, then complete the remaining cross-column ownership matrix. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## 24 November 2026 — reconciliation parent-scope hardening

- Reviewed `ReconciliationService` against the G-002 run/discrepancy schema relationship. The writer already stamps run and child with the same scope, but reads/resolution did not validate the parent-child organization invariant.
- Commit [98843bf](https://github.com/nabeel2323/scs-platform/commit/98843bfe455667f7a96d7cbdd6dfb2253ce2af0f) now verifies a requested non-null organization exists before run creation, rejects a run read if any discrepancy child has a different org, and checks parent-run org before resolving a discrepancy.
- Driver assignment review: the schema has independent profile-org and assignment-store FKs, while shipment assignedDriverId references users. The inspected ShippingModule/ShipmentOperationsController does not expose an assignment mutation path; no speculative API was added. Locate the actual consumer before implementation.
- Updated the migration FK crosswalk and implementation progress tracker. Regression cases are documented, not executed. No tests or manual CI were run. Automatic CI #1503 failed on the prior source SHA and does not verify this commit. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.
- Next: locate the real driver/store assignment consumer, finish the cross-column shipping/financial matrix and Drizzle/migration reconciliation, then add the regression suite before consolidated verification.


## 24 November 2026 — refund/payment/order lineage follow-up

- Reviewed refund creation, approval, failure/retry and return-refund transitions against the independent `refunds.payment_record_id` and `refunds.order_id` FKs.
- Commit [e9bf293](https://github.com/nabeel2323/scs-platform/commit/e9bf293dbdb8bde8ab2a7a409d37c2b411ee5b5d) adds payment/order/currency equality checks to approval and both idempotent request-recovery paths. The return-refund workflow already validates its full return/payment/order/refund lineage under locks.
- Updated the G-002 migration FK crosswalk and implementation progress tracker. Regression scenarios are documented but not executed. The source commit uses `[skip ci]`; no tests or CI were run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## 24 November 2026 — shipment order/store ownership remediation

- Reviewed shipment schema, OrdersService shipment creation, ShipmentOperationsController detail access and ShippingCarrierWorker tenant validation.
- Found that `shipments.order_id` and `shipments.store_id` are independent FKs. A mismatched pair could let a store-scoped shipment detail path disclose a different store's order, or pass mismatched data to a carrier.
- Source commits: [b1e5490](https://github.com/nabeel2323/scs-platform/commit/b1e5490401d9602205d46351ee4eaf1ab2db7d30), [02edaa8](https://github.com/nabeel2323/scs-platform/commit/02edaa89d75b06e6c8a4170cc306662965d8fd30), [15d328c](https://github.com/nabeel2323/scs-platform/commit/15d328c952dfd0805a9eee00374c6ad74ed1d6a1). Creation, authorized reads and carrier worker paths now validate same-store order ownership.
- Updated G-002 crosswalk and progress tracker. Regression cases are documented but unexecuted. Commits use `[skip ci]`; no tests or CI were run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## 24 November 2026 — shipment read-path completeness

- Follow-up callsite review found that the initial shipment/order/store guard did not cover every read path. Commit [56d605a](https://github.com/nabeel2323/scs-platform/commit/56d605a7377c49766b990abfc023e6ae4a5cea1d) adds the same-store invariant before driver/platform exception-operation bypasses, validates order-based shipment lookup, and joins driver shipment lists to same-store orders.
- ShipmentOperationsController list and count queries also filter malformed shipment/order pairs (commit [c916acd](https://github.com/nabeel2323/scs-platform/commit/c916acd0a8b156affeda50e98dbc88acab2f39bc)).
- Updated G-002 crosswalk and progress tracker with the complete inspected read-path regression matrix. Tests remain unexecuted; commits use `[skip ci]`. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## 24 November 2026 — carrier recovery/webhook/tracking ownership follow-up

- Continued the G-002 shipping audit after the shipment read-path corrections. Found the direct admin recovery route, scheduled create/cancel reconciliation, webhook shipment resolver and tracking poller were additional entry points.
- Source commits: [0581776](https://github.com/nabeel2323/scs-platform/commit/0581776dc42e87e4206377b45c971612368ab0ef), [83a4073](https://github.com/nabeel2323/scs-platform/commit/83a4073c20d14519f9c9f02757bd2386bbe9de58), [2b2810e](https://github.com/nabeel2323/scs-platform/commit/2b2810e14e41f40023e610dcda9e9064fb846e9c), [5bbd35d](https://github.com/nabeel2323/scs-platform/commit/5bbd35da8f3f04c132d12f773192de0a4a27fad8), and [9c9d7f4](https://github.com/nabeel2323/scs-platform/commit/9c9d7f479ae332e6760238c7a9789f9e56febbea).
- Admin recovery validates order/store before privileged bypass; recovery queue joins the matching order; both reconciliation cycles filter and direct methods revalidate; webhook resolution only links same-store shipment/order pairs; tracking poll filters and revalidates before provider/events/delivery bridge.
- Driver assignment disposition: schema only, no writer/controller found in inspected shipping module; shipment assignedDriverId references users, not driver profiles. Do not invent an endpoint. Confirm whether driver_store_assignments is dead/legacy or consumed outside the module.
- Crosswalk and progress tracker updated. Regression cases are documented but unexecuted; commits use `[skip ci]`. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## 24 November 2026 — webhook retry credential lineage

- A final webhook worker pass found already-linked retry events did not compare the shipment's owning store organization with the event's credential organization, although unlinked events did revalidate the credential.
- Commit [926c475](https://github.com/nabeel2323/scs-platform/commit/926c475fb9c59ffa1688dccee3d4f9dfbeea59e2) now validates the bound credential for every unprocessed event and requires linked shipment store org = credential org before marking processed. Unlinked legacy events without credential binding fail closed; already-linked legacy null-credential rows remain compatible with shipment/order/store validation.
- Updated G-002 crosswalk and progress tracker with regression scenarios. Tests remain unexecuted; commit uses `[skip ci]`. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## 24 November 2026 — driver/store eligibility at shipment assignment

- Reconciled the G-002 handoff against the full Orders call path and corrected the earlier incomplete ShippingModule-only search. The existing `POST /orders/:id/assign-driver` route calls `OrdersService.assignDriver`, which writes `shipments.assigned_driver_id`.
- Source commits `9d461e1c25381d4528fc733059ee58afb320fa6b` and `fca4c3569976fd6e5a8b9db767e876f8f449c367` add a ShippingService eligibility contract and call it before any order/shipment/event/history/outbox mutation. Missing validation infrastructure fails closed.
- The check requires an active driver profile, active user, active DRIVER organization membership and profile/store organization equality. It preserves migration 0041's explicit compatibility rule: zero driver-store rows means unrestricted access across stores in the profile organization; if rows exist, only listed stores are eligible.
- Regression source added: shipping eligibility unit cases; OrdersService pre-write fail-closed unit cases; disposable PostgreSQL coverage for unrestricted mode, cross-org rejection, explicit allowlist, inactive profile and inactive DRIVER membership. Test commits include `0868647b6ad22f98732b4a4fe8fb370f3e94ce62`, `3d3e3b440cc839340ed2adbe0a15b2fad9edfd63`, and `783c2246c21895900a4d9f5719425820facf3599`; formatting/structure follow-ups include `13a3de7963efbd06c145295de2e5466e62a8f441`, `863513bc1a281591d786d3f230e46f21f7388735`, `043d5908714b70a6e02c129bf6b38e71b7b67f8c`, and `5ab4c9358191f184d2e5917741e08263777ac72d`.
- The optional `driver_store_assignments` mapping table still has no repository writer. No new endpoint, schema change, composite FK or migration was introduced. The earlier statement that no shipment assignment write path existed is superseded; the mapping-table writer remains unlocated.
- Updated the G-002 migration FK crosswalk, remediation progress tracker and open issues. Tests, formatter, lint, typecheck, E6 and CI were not run; commits use `[skip ci]`. Exact-head Actions lookup on source/test head `5ab4c9358191f184d2e5917741e08263777ac72d` returned zero workflow runs; combined statuses were only Vercel Web/Admin FAILURE for external build-rate limiting. These are not application test results.
- PR #138 remains OPEN / DRAFT / UNMERGED to `develop`. No live/shared DB, migration, RLS/grant, protected staging, deployment, worker activation, merge or release action occurred. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.
- Next: finish Drizzle-to-migration FK reconciliation and remaining source ownership/actor-context review; determine whether an external provisioning process manages driver-store allowlist rows; then complete protected read-only identity/catalog evidence only through the authorized staging process. Consolidated verification remains deferred until implementation/integration is complete.


## 24 November 2026 — targeted Drizzle/migration FK parity continuation

- Reconciled the current payment, return and financial Drizzle declarations against the migration FK crosswalk.
- Added the migration 0062 self-reference for `reconciliation_runs.superseded_by` to Drizzle using a typed lazy `AnyPgColumn` reference.
- Documented the migration-owned deferred FKs for `refunds.return_request_id`, `return_requests.refund_id` and `return_request_items.inventory_item_id`, including the payments/returns module-cycle constraint and ON DELETE SET NULL behavior.
- Added the targeted static comparison and explicit limits to `docs/remediation/G-002-MIGRATION-FOREIGN-KEY-CROSSWALK-2026-11-22.md`. Nullable financial/reconciliation `org_id` fields remain intentionally without organization FKs; no synthetic constraint was added.
- Source commits: `b37f3386220b7148f2b326f9fd43b532b201a152`, `ef178d7af0d10b1ef80642aa5f6fe77b37cc55d4`, `e1d73e5270f8a815c537edf97f1ff8cc1d45fac4`. Crosswalk commit: `ad1547e781e0382bbd4ad6b6105c59dc3b19c0a3`.
- No tests, formatter, lint, typecheck, E6 or CI were run. No migration, shared/staging DB, RLS/grant, deployment, worker activation, merge or release action occurred. PR #138 remains draft and unmerged. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.
- Next: continue the table-by-table Drizzle/migration FK comparison, then finish the source operation/actor-context audit. Keep protected runtime identity/catalog and pg_partman scheduler evidence gated to the authorized read-only staging process.


### Follow-up — dispute return FK parity, 24 November 2026

The 25-module Drizzle schema pass identified one additional migration-only relationship: `disputes.return_request_id → return_requests.id ON DELETE SET NULL` from migration 0059. The field is now explicitly documented in `reviews/support.schema.ts` as a deferred cross-module link, and the G-002 FK crosswalk/progress tracker now records five targeted Drizzle declaration omissions in total. The self-referential reconciliation FK is represented in Drizzle; the four cross-module/deferred FKs remain migration-owned and documented. This is still a targeted reconciliation, not proof of complete 100-table parity. No tests or CI were run.


## 24 November 2026 — Drizzle FK parity: migration 0059 safe-link modeling

**Repository/branch:** `nabeel2323/scs-platform` / `remediation/phase-0-1-tenant-security`  
**PR:** #138 (OPEN / DRAFT / UNMERGED to `develop`)  
**Parent head:** `19738fbe16399db7f8975d647b062773a3eb2583`

### Changes

- Added Drizzle `ON DELETE SET NULL` references for `return_requests.refund_id → refunds.id`, `return_request_items.inventory_item_id → inventory_items.id`, and `disputes.return_request_id → return_requests.id`. Reviewed import direction: returns already imports payments; inventory has no dependency on returns; support depends on returns, so these three references do not introduce a reverse dependency cycle.
- Corrected the G-002 migration FK crosswalk to include `refunds.dispute_id → disputes.id ON DELETE SET NULL`, which was missing from the earlier targeted omission table.
- Kept `refunds.return_request_id` and `refunds.dispute_id` as migration-owned plain UUID references in `payments.schema.ts`, with an explicit reason: importing returns/support into payments would create a payments → returns/support → payments module initialization cycle.
- Synchronized START-HERE, CURRENT-STATE, OPEN-ISSUES, IMPLEMENTATION-ROADMAP, RELEASE-AND-CI-STATUS and the G-002 crosswalk.

### Verification and boundaries

No tests, formatter, lint, typecheck, E6 or CI were run. No shared/staging database access, migration, grant/default-ACL change, RLS enablement, deployment, worker activation, merge or release occurred. The full 100-table / 183-migration-reference comparison remains incomplete; this slice does not mark G-002 verified.


## 24 November 2026 — post-push review and source-comment correction

Commit `92895859abe20f0132a3ae021c695898e0b9f051` was pushed to PR #138 with a fast-forward expected-head check. Live PR state remained OPEN / DRAFT / UNMERGED to `develop`; compare was 2,490 ahead / 0 behind. Exact-head Actions had zero runs. Vercel Web/Admin contexts were PENDING external preview checks, not application test results.

Post-push source inspection found stale comments left beside the newly modeled Drizzle references. This follow-up updates the comments to reflect the actual dependency direction: returns may reference inventory and the already-imported refunds table; support may reference returns; payments keeps both reverse links migration-only to avoid a module cycle. No tests, formatter, lint, typecheck, E6 or CI were run.


## 24 November 2026 — complete source FK parity reconciliation

The G-002 static source comparison now covers all 25 module schema files / 100 `pgTable` declarations and 178 Drizzle `.references()` declarations. Reconciliation of the prior 183 SQL text matches identifies exactly three intentional migration-owned FKs: `products.product_type_id → product_types.id` (taxonomy → catalog dependency), `refunds.return_request_id → return_requests.id`, and `refunds.dispute_id → disputes.id` (payments → returns/support cycles). The other two text matches are not additional effective constraints: migration 0061's `ADD COLUMN IF NOT EXISTS ... REFERENCES` is a no-op after migration 0059 creates the column/FK, and migration 0070 contains the word REFERENCES only in a comment. Thus 183 text matches reconcile to 181 effective SQL FK declarations = 178 Drizzle references + 3 documented migration-owned links.

The three previously corrected links (`return_requests.refund_id`, `return_request_items.inventory_item_id`, `disputes.return_request_id`) and reconciliation self-FK are represented in Drizzle. No SQL migration, schema DDL, database or RLS/grant policy was changed. This is source evidence only; protected live catalog validation remains pending. G-002 remains IN_PROGRESS / NOT VERIFIED. Next: finish operation-level ownership predicates and direct DB/actor-context audit, then add regression coverage and run the consolidated verification after implementation/integration is complete.


## 24 November 2026 — Orders cancel/reject actor-context fail-closed correction

The `POST /orders/:id/cancel` and `POST /orders/:id/reject` routes intentionally use service-level actor boundaries rather than a blanket controller interceptor. The service scopes database-only work and keeps post-commit realtime emission outside the transaction; rejection also scopes its separate refund-persistence phase. A supplied caller object missing a non-empty `sub` or `role` previously fell through to unscoped DB work. Both helpers now fail closed with `ForbiddenException` before DB access; only an absent caller argument preserves the trusted internal-call path. Four unit regression cases cover missing subject/role for both operations. Tests remain unexecuted. Do not add a controller interceptor without re-reviewing the split side-effect boundaries.


## Catalog controller actor-context pass — database-only mutation routes (24 November 2026)

A route-to-service call-graph review found a set of database-only catalog mutations that had no controller interceptor and no service-level `withActorContext`. Added `TenantDatabaseContextInterceptor` to 23 verified DB-only mutation routes: category create/update/delete; brand create/update/deactivate; product create; product governance submit/withdraw/publish/unpublish; product/variant typed attribute writes; variant create/update and bulk operations; bulk product operations; media reorder/remove; import-job create/mapping/cancel/retry. Added a metadata regression spec asserting the interceptor is attached to every listed handler.

The request-wide interceptor was deliberately not added to mixed/long-running routes: product update/delete (cache invalidation, outbox/audit work), media add (storage-backed URL resolution), staged-row upload/processing/preview (Redis/object storage and chunk processing), and CSV error export. These require short service-level actor scopes around each DB phase; wrapping the entire request would hold a DB transaction open across external I/O or long-running processing. These mixed paths remain open follow-up work and must not be treated as actor-context complete.

No tests, formatter, lint, typecheck, E6 or CI were run. G-002 remains IN_PROGRESS / NOT VERIFIED.


## 24 November 2026 — catalog media actor-context continuation

The catalog media-add endpoint now scopes product edit authorization in a user actor transaction, then requires a verified caller subject/role for a separate short service transaction covering product lookup, optional variant ownership validation and media-row insertion. Media URL resolution remains after commit because it may use external storage. Updated the focused media variant-scope unit fixture to supply the authenticated actor and transaction mock. No tests, lint, typecheck, E6 or CI were run. Other mixed catalog/import paths remain open; G-002 is not verified.


## Catalog import upload and CSV staging actor-context boundary — 24 November 2026

The mixed catalog import upload and CSV staging routes now establish the authenticated user actor for their authorization reads and for each database-only service phase. `uploadImportFile` requires a caller actor, scopes the persisted-job lookup and final import-job metadata update, and leaves raw request-body reading, object-storage upload and XLSX parsing outside DB transactions. `stageImportRows` requires a caller actor, scopes its persisted-job lookup and READY-state update, and leaves Redis batch deletion/write/expiry/count operations outside DB transactions. The controller resolves the persisted job and verifies store organization/membership inside a short actor context before reading upload bytes or invoking Redis/storage work. The focused P10 upload test fixture now mocks the actor-context wrapper and passes a caller to each upload test.

Source commits: `b6dd8a7d731604be811301dd7168fc3faffde1b6` and `6e3b5a9716eeac514fd214dbc2561266f797993c`. No tests, formatter, lint, typecheck, E6 or CI were run. Preview, processing/worker, error-report export and other mixed catalog import paths remain open; this change does not mark the catalog actor-context audit or G-002 verified.


## Import preview validation DB scope refinement — 24 November 2026

Follow-up review confirmed `ImportValidationService.validateRows` performs database reads (catalog lookup/validation), not just in-memory validation. Its invocation is now inside the same short authenticated actor-context boundary; workbook parsing and Redis reads remain outside. Source commit: `9b6387597e8c02de076613b4f4a540a379362491`. Tests and CI remain deferred and G-002 remains NOT VERIFIED.

## 25 November 2026 — mixed Catalog product mutation actor scopes

Implemented actor-context boundaries for mixed Catalog product update/delete routes. Controller-level assertProductEditableByMerchant reads now execute inside a short user actor transaction, and the verified caller is forwarded to CatalogService. The service requires the caller and scopes product preflight reads, GTIN/EAN uniqueness reads, product-type checks, publish validation, all update branches, product-type-change/re-review transactions, soft-delete reads/writes, outbox publication and final reads. Cache invalidation is deliberately after the DB scope. AuditService standalone writes now use an audit principal; an already-active verified caller/worker context is reused rather than attempting a prohibited actor switch.

Added/updated regression specs for controller interceptor exclusions, CatalogService update/delete and outbox boundaries, and AuditService standalone/reused actor scopes. Tests are authored only; none were executed. No formatter/lint/typecheck/E6/CI. No shared/staging DB access, RLS/grant/migration change, deployment, worker activation, merge or release.

Source commits: 0cd4606db719fdeaab61da5f0bc30767c381c5e9, e9b65ce7ceb2c8b73362c1ffe5db67f96883095b, 8959b67691585f4beaa43d12775a221d5a02927e. Test commits: ce66bf52df655f7e995e1cc91f1dd494e8b50660, d5d81e92b8a69bd243786d8846b7b4d5c7b68737, 0a94b92295b7525e95dffcc6682f61f0842a5656. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.

## 25 November 2026 — Catalog import processing and error-report scopes

Implemented verified-user actor scopes for mixed Catalog Import processing and CSV error export. Controller preflight job lookup and store membership/organization authorization now run inside short user scopes. processImportJob requires CatalogUserActor and scopes job lookup, atomic claim, default price-list operations, chunk creation/listing, cancellation reads, each chunk claim + per-chunk DB transaction, final aggregation/status writes, failure status update and final read. Object storage/XLSX parsing, Redis row loading and Redis cleanup stay outside actor transactions. getErrorReport requires the caller, loads the job and chunks in one short actor scope, then serializes CSV outside it. Routes intentionally remain excluded from TenantDatabaseContextInterceptor.

Added tests for processing DB phases, chunk transaction scope, missing caller fail-closed behavior, error report scope and mixed route interceptor exclusions. Tests remain unexecuted; no quality gates or CI were run. No worker was added or activated. G-002 remains NOT VERIFIED.

P13 correction: the full source shows P13MonitorService already wraps its direct diagnostic SQL reads in withMonitorActor. No P13 code change was made; the earlier helper-unused observation was incorrect.

## 25 November 2026 — dormant import recovery principal

Scoped the dormant CatalogService.recoverStaleJobs scan and stale job/chunk updates under the stable worker principal catalog-import-recovery. This does not register or schedule the method and does not activate any background worker. Added regression coverage for the worker actor and both writes. Tests remain unexecuted; no quality gates/CI or runtime worker action occurred.

## 25 November 2026 — Catalog product detail and media reads

Removed request-wide TenantDatabaseContextInterceptor from GET /products/:id and GET /products/:productId/media. Controller authorization checks now use short verified-user contexts. getProductDetail requires CatalogUserActor and groups product/store/media-row/variant/pricing/stock/attribute reads inside one actor scope, while Redis cache and storage URL signing happen outside. listMediaByProduct scopes its DB query then resolves media URLs after commit. Added tests for both service paths and controller interceptor exclusions. Tests are authored but unexecuted; no quality gates/CI.

## 25 November 2026 — Search Facets cache/DB split

Removed TenantDatabaseContextInterceptor from GET /search/facets. The controller passes the verified JWT actor; SearchService.getFacetsCached now performs Redis cache reads/writes outside the database scope and wraps only the facet database query in a short user actor context. Added missing-actor and cache/DB boundary tests plus controller metadata coverage. Tests remain unexecuted; no quality gates/CI.

## 25 November 2026 — Catalog ownership predicate and concurrency pass

Reviewed Catalog route actor boundaries and strengthened ownership predicates across category, product-type, product, media, offer and request operations. Store category list/search access now requires current org and active membership; public category lists/tree are active platform-only; inactive/foreign category detail is hidden. Product category assignment and category parent links reject inactive/foreign-store references. Global product types require active platform categories on create/update/publish/duplicate/version; public product-type list/detail/schema/product routes hide unpublished and legacy tenant-bound bindings, while product-type managers can inspect legacy inventory. Search facets use cache v2 and only aggregate public active product values.

Offer lifecycle updates now compare current status and owner store; pricing updates compare updatedAt. Request approvals/rejections lock the pending row under an active user transaction and use PENDING-only updates. Product update/type-change/delete/bulk mutations include exact store and soft-delete predicates. Product read/edit authorization is repeated inside service actor scopes; media deletion includes the parent product predicate.

Added/extended regression specs for category service/controller ownership, taxonomy category and visibility rules, search facet filtering and cache actor validation, offer CAS, request row locking, product/media owner predicates, and actor metadata across Catalog-adjacent controllers. Tests remain authored but not executed. No quality gates or CI were run. No shared DB/RLS/grants/migration/deployment/worker/merge/release action occurred. G-002 remains NOT VERIFIED.
