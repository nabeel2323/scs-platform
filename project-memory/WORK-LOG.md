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
