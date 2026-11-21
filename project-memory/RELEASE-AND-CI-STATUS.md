# SCS Platform — Release and CI Status

**Checkpoint:** 21 November 2026  
**PR:** [#138](https://github.com/nabeel2323/scs-platform/pull/138) — open, draft, not merged.  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Last inspected pre-release-status-update SHA:** `9da572ea16ad205e72cdedd954e153ae1f9a8a89`

## Latest CI run

### CI #1184

- [Workflow run](https://github.com/nabeel2323/scs-platform/actions/runs/44858627846)
- Tested exact PR head: `fe675e76a8cace78ac2513da08118dd9c7527428`
- Conclusion: **FAILURE**
- Failure point: changed-file Prettier gate in the Lint & Typecheck job.

| Job                             | Result  | Evidence / interpretation                                                       |
| ------------------------------- | ------- | ------------------------------------------------------------------------------- |
| ESLint                          | PASS    | 0 errors; 311 warnings.                                                         |
| TypeScript typecheck            | PASS    | Completed successfully.                                                         |
| Changed-file Prettier           | FAIL    | Flagged project-memory/RELEASE-AND-CI-STATUS.md and project-memory/WORK-LOG.md. |
| Mobile (Flutter analysis/tests) | PASS    | Completed successfully.                                                         |
| API unit tests + coverage       | SKIPPED | Upstream lint/format gate failed.                                               |
| PostgreSQL integration          | SKIPPED | Upstream lint/format gate failed.                                               |
| Migration full apply            | SKIPPED | Upstream lint/format gate failed.                                               |
| Web & Admin tests               | SKIPPED | Upstream lint/format gate failed.                                               |
| Boundary lint                   | SKIPPED | Upstream lint/format gate failed.                                               |
| Build / container smoke         | SKIPPED | Upstream dependency failed/skipped.                                             |
| Contract spec & codegen         | SKIPPED | Upstream dependency failed/skipped.                                             |
| Staging release                 | SKIPPED | No staging release executed.                                                    |
| k6 smoke                        | SKIPPED | No performance verification executed.                                           |

## Formatter and subsequent checkpoint runs

- Formatter run #15 completed successfully and corrected the handover Markdown. Cleanup commit [f1cb7c7](https://github.com/nabeel2323/scs-platform/commit/f1cb7c7467c0fee6c829eec5fe557e3734c9c275) removed the temporary helper; the resulting tree was checked and the helper was absent.
- CI #1187–#1189 were cancelled during successive helper/checkpoint commits. CI #1190 was queued on an intermediate helper commit; it does not verify the current source/test implementation.
- The current G-001 source/test implementation is committed as service dd52aaf, controller bca32b0, controller tests 39a0437, service tests a1602bc, ACTIVE-store filtering 512dc0e, buyer visibility tests 6ff59aa, correlated SQL EXISTS refinement e039715 and query-shape tests 5cdeb09. Documentation checkpoint commits followed through 9da572ea. CI #1207 was cancelled by subsequent pushes; a new exact-head CI result is required. No API/integration/build result has yet verified these changes.
- Vercel web/admin previews continue to report the external daily build quota gate. This is not an application test result.

## Earlier evidence — context only

- CI #1171 passed all executable jobs on earlier commit `c18118793638f3c3f8d936e8608e228f56263e19`. It predates the latest expanded role matrix and is not a substitute for exact-head CI.
- CI #1175 on `2dc841247ba9e70b59a15a365bbaab5c531f3ca9` failed the changed-file Prettier gate for the progress tracker; dependent test/build jobs were skipped.
- CI #1176 is the latest exact-head run at this checkpoint.

Always verify the latest run and exact tested SHA before using this history.

## Release and environment status

- PR #138 remains draft and unmerged.
- No staging release or deployment of this branch is claimed.
- Protected staging environment approval must not be bypassed.
- k6 smoke and Phase 6 staging E2E/performance campaign are not verified.
- Render staging baseline and OTP runtime exercise remain separate from source/CI evidence; do not claim a post-fix runtime exercise without a verified authorized deployment and fresh logs.
- A green CI run does not authorize staging or production release.

## Database safety status

- No shared database mutation, live migration, grants/default-ACL change or RLS enablement is claimed.
- Migration 0070 must not be applied to the shared database without the required authorization.
- Actual API and migration runtime identities remain unverified pending the protected read-only staging audit.
- Disposable CI database evidence must not be represented as live staging/production evidence.

## How to record a new CI run

For every run, record:

1. Run number and URL.
2. Exact tested head SHA and branch/PR.
3. Overall conclusion.
4. Every relevant job result, including skipped/cancelled jobs.
5. The first causal failure and its log evidence.
6. External preview-provider failures separately from GitHub Actions jobs.
7. Whether staging, k6, deployment or database operations were actually executed.

## 21 November 2026 — formatter cleanup and handover checkpoint

- Formatter run [#14](https://github.com/nabeel2323/scs-platform/actions/runs/44858112060) completed successfully and formatted the new project-memory docs, README, remediation documents and G-001 controller test.
- The self-removing helper workflow was deleted by cleanup commit [2776f97](https://github.com/nabeel2323/scs-platform/commit/2776f97e902f7569afdc08ba75db8109238e9fcf); the resulting repository tree was checked and contains no .github/workflows/format-fix.yml.
- CI #1179 on the formatter cleanup commit returned action_required with no jobs; it is not verification. CI #1178 was on the pre-format commit and is not exact-head evidence for the formatted tree.
- A new app-authored documentation checkpoint commit is being used to trigger a full CI run against the formatted state. Record the exact new SHA and every job result when it completes.

## Latest checkpoint update — 21 November 2026

- Formatter run #14 succeeded and removed its temporary workflow. Cleanup commit 2776f97e902f7569afdc08ba75db8109238e9fcf was checked and the helper file is absent.
- App-authored checkpoint commit f7f3ff6837f67f17cc00d5129a20f50e608bf3b6 triggered CI #1180. At the time this documentation update was prepared, #1180 was still in progress. Verify its final status and any newer run against the actual current branch head.
- Earlier CI #1176 failed the Prettier gate; formatter #14 corrected both flagged files. CI #1178 was on the pre-format commit; CI #1179 on the cleanup commit was cancelled/superseded. Neither is a passing verification result.

## CI #1180 — 21 November 2026

- [CI #1180](https://github.com/nabeel2323/scs-platform/actions/runs/44858308974) tested f7f3ff6837f67f17cc00d5129a20f50e608bf3b6 and failed at the changed-file Prettier gate.
- Lint completed with 0 errors (311 warnings); TypeScript typecheck succeeded; Flutter analysis/tests passed.
- Prettier flagged docs/remediation/IMPLEMENTATION-PROGRESS.md, project-memory/RELEASE-AND-CI-STATUS.md and project-memory/WORK-LOG.md. API unit/coverage, PostgreSQL integration, migration, Web/Admin, boundary, build/container and contract jobs were skipped after the lint job failed. Staging release and k6 were skipped.
- Formatter run #15 completed successfully and corrected all three Markdown files. Cleanup commit 2d416c99700de8b511a7c376085a107cc24a854c removed the helper workflow; the final tree was checked and contains no temporary formatter. CI #1183 on cleanup commit has action_required with no jobs; CI #1182 refers to the pre-format helper commit and is not exact-head verification. A new app-authored checkpoint commit is required to trigger full CI on the formatted tree.

## Formatter run #15 completion — 21 November 2026

- [Formatter run #15](https://github.com/nabeel2323/scs-platform/actions/runs/44858510366) completed successfully. It formatted the progress tracker, project-memory release/CI status and work log along with the handover docs and G-001 test.
- Cleanup commit [2d416c9](https://github.com/nabeel2323/scs-platform/commit/2d416c99700de8b511a7c376085a107cc24a854c) removed the temporary formatter workflow; the resulting tree was checked and the helper file is absent.
- CI #1182 is associated with the pre-format helper commit; CI #1183 on the cleanup commit returned action_required with no jobs. Neither is a passing verification result.
- A new app-authored checkpoint commit is being created to trigger full CI on the formatted tree. Inspect that run's exact SHA and all jobs.

## Live branch verification — 21 November 2026

- The G-001 controller acceptance expansion is committed in `0d00dbac10b4c7de53aef4bbf860850668cf39fd`; the remediation tracker and project-memory work log were updated in subsequent commits.
- The inspected branch head before this status-document refresh was `e935e24a5983a028e3922ab5e7728c61aeba11b9`.
- `fetch_commit_workflow_runs` returned no associated GitHub Actions runs for the inspected head, and the combined commit status contained no status contexts. Therefore exact-head CI is **PENDING / NOT VERIFIED**. CI #1184 is historical and predates the current source/test changes.
- The earlier Vercel web/admin status failures were build-rate-limit provider failures, not application test failures. They do not substitute for GitHub Actions CI.
- No staging release, k6 run, database mutation, migration, grant/default-ACL change, RLS enablement, environment change, worker activation or deployment was performed.
- PR #138 remains open and draft. G-001 remains PARTIAL; G-002 remains IN PROGRESS.

## Latest exact-head check — 21 November 2026

- Inspected branch head: `ae2d3ea97a16b7ebb916e390dbf6433733c31438`.
- GitHub Actions workflow-run lookup returned no associated runs for this SHA.
- Combined status reports Vercel web and admin failures pointing to the external build-rate-limit page. These are provider quota failures, not evidence of failed application tests, and they do not count as passing CI.
- GitHub Actions exact-head verification remains pending. No k6, staging release, database mutation, migration, grant/default-ACL change, RLS enablement, environment change, worker activation or deployment was performed.
- PR #138 remains open and draft; G-001 remains PARTIAL and G-002 remains IN PROGRESS.

## G-001 continuation status — 21 November 2026

- Current inspected source/test branch head before this status refresh: `e814f871b2b027c5c44ff614dfcac66eaa06c56e`.
- Controller regression coverage expanded for foreign-organization offer-list denial, missing active organization, revoked/inactive membership on analytics, and DRAFT-store merchant management.
- Exact-head GitHub Actions verification is still pending. The previously inspected Vercel web/admin statuses were build-rate-limit provider failures, not application test results.
- No SUSPENDED-store policy was inferred. No staging release, k6, database mutation, migration, grant/default-ACL change, RLS enablement, environment change, worker activation or deployment was performed.

## PostgreSQL buyer-visibility regression — 21 November 2026

- Catalog lifecycle integration fixtures now explicitly create ACTIVE stores for buyer discovery.
- Added a PostgreSQL test for DRAFT-store exclusion from both buyer product-offer list and ranked seller results, with status restoration in `finally`.
- Latest inspected commit before this status refresh: `05fe9c6ecb9590586d9117af6d6ce547dd7e29b6`.
- Exact-head GitHub Actions run and API/PostgreSQL job results are pending. No shared database or staging mutation was performed.

## Latest G-001 PostgreSQL security tests — 21 November 2026

- Catalog lifecycle integration now covers DRAFT-store exclusion from buyer offer list/ranked results, same-404 confidentiality for foreign merchant and same-organization non-member detail reads, and denial after membership is marked INACTIVE (fixture restored in `finally`).
- Latest inspected branch commit before this status refresh: `bf8feed6ebf0064bbf95b0a80910b002988d18ad`.
- Exact-head GitHub Actions/API/PostgreSQL results remain pending. No shared database or staging mutation was performed.

## Merchant-staff PostgreSQL acceptance — 21 November 2026

- Added active store-member service coverage for `MERCHANT_STAFF` offer-detail access, with temporary membership deactivation in `finally`.
- Latest inspected source/test head before this status refresh: `bf625aefd6faf47c60fd1bf01b1c23148de66ca0`.
- Exact-head API/PostgreSQL CI remains pending. No shared database or staging mutation was performed.

## G-001 buyer projection/reference fix — verification pending — 21 November 2026

The previous exact-head run #1252 on parent commit `ab3a2af` had passed lint, typecheck, changed-file formatting, Flutter, Web/Admin, boundary lint and full isolated migration/read-only audit. API unit/coverage and PostgreSQL integration were still running when this follow-up commit superseded that head; those partial results are not a pass for the new changes. Verify all required jobs on the new PR head before advancing G-001. Vercel preview rate-limit failures remain external to application CI. PR #138 stays open and draft; no staging release or shared-database operation was performed.

## CI #1259 regression analysis and correction — 21 November 2026

Exact-head CI #1259 exposed two defects. PostgreSQL rejected the correlated `EXISTS` predicate used by the buyer offer relational query because the outer `merchant_offers` reference was not valid in the generated query shape. The store-visibility predicate is being changed to an uncorrelated `store_id IN (SELECT id FROM stores WHERE status = 'ACTIVE')` subquery, preserving the visibility rule without the invalid outer reference. The catalog-offer unit harness also lacked `.limit()` on its selected-query branch, which broke tenant-membership tests; the harness now supports `.getSQL()`, `.limit()` and `.groupBy()` for the relevant query shapes.

CI #1259: lint/typecheck, formatting, mobile, Web/Admin, boundary lint and migration/read-only audit passed. API unit/coverage and PostgreSQL integration failed for the two issues above. The correction is committed with regression coverage; exact-head CI must pass before G-001 advances. No staging/database writes or deployment actions were performed.

## CI #1265 — exact-head regression analysis — 21 November 2026

- **Commit tested:** `36399ce6704b0774f0ebb0f670a3e7d735b19295`.
- **Run:** [GitHub Actions CI #1265](https://github.com/nabeel2323/scs-platform/actions/runs/44897469038).
- **Passed:** Lint & Typecheck (including changed-file formatting), Flutter analysis/tests, E6 boundary lint, Migration Full Apply (including disposable PostgreSQL read-only DB-access audit and public-schema hardening checks), Web & Admin tests.
- **Failed:** Unit Tests + Coverage; Integration Tests.
- **Skipped:** Contract Spec & Codegen, Container Build & Smoke, Build, k6 Smoke Test and Trigger Staging Release because upstream gates failed.
- **External statuses:** Vercel web/admin contexts point to the provider build-rate-limit page; they are not GitHub Actions application test results.
- **Failure cause:** `storeMembers` was missing from five explicit Drizzle schema maps used by PostgreSQL integration tests. This caused `db.query.storeMembers` to be undefined in `assertStoreMember`. Phase 4 offer/cart/checkout failures cascaded from the initial offer-creation failure. Buyer discovery fixtures also need explicit ACTIVE store status.
- **Correction:** grouped test-only fixture change; production tenant authorization remains intact. Exact-head CI on the corrected commit is pending.
- **Release state:** PR #138 remains open/draft. No staging dispatch/approval, deployment, shared DB mutation, migration, grants/default ACL, RLS or worker activation occurred.

## CI #1266 — formatting gate failure — 21 November 2026

- **Commit tested:** `52336f751dc2558b10834940034833b4573c5ca4`.
- **Run:** [GitHub Actions CI #1266](https://github.com/nabeel2323/scs-platform/actions/runs/44906522797).
- **Passed:** Flutter analysis/tests; lint and TypeScript typecheck completed with 0 errors (309 warnings).
- **Failed:** changed-file Prettier check on nine files (three integration test files and six documentation/memory files).
- **Skipped:** API unit/coverage, PostgreSQL integration, boundary lint, migration full apply, contract/codegen, container smoke, build, Web/Admin and k6; dependent jobs were skipped after the formatting gate.
- **Interpretation:** no functional test result for the fixture correction was produced by this run.
- **Next:** repository-locked formatting of the changed files, then exact-head CI.
- **Release state:** PR #138 remains open/draft; no staging dispatch, deployment or shared database mutation occurred.

## CI #1268 — exact-head full verification — 21 November 2026

- **Run:** [GitHub Actions CI #1268](https://github.com/nabeel2323/scs-platform/actions/runs/44907038784).
- **Exact tested SHA:** `b73f72e34406c1260f214610539139d0d096b2de` (`style: apply repository Prettier to tenant security fixtures`).
- **Branch:** `remediation/phase-0-1-tenant-security`.
- **PR:** #138, open, draft, not merged; base `develop` at `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.
- **Passed (10 jobs):** Lint & Typecheck (including changed-file Prettier), API Unit Tests + Coverage Gates, Integration Tests (disposable PostgreSQL), Web & Admin App Tests, Migration Full Apply (including read-only DB access audit and public-schema hardening), Boundary Lint (E6), Mobile (Flutter analyze/tests), Contract Spec & Codegen, Build, and Container Build & Smoke Test.
- **Skipped:** k6 Smoke Test and Trigger Staging Release. These are not passes and do not imply staging approval or runtime verification.
- **Interpretation:** the five `storeMembers` test schema-map corrections and ACTIVE buyer-discovery fixtures now pass both API unit/coverage and real PostgreSQL integration on the exact head. Production authorization code was not weakened to satisfy the fixtures.
- **Security status:** G-001 remains PARTIAL pending independent security review. G-002 remains IN PROGRESS. No shared database grants/default ACL, RLS, migration 0070, staging configuration, deployment, worker activation or staging business writes were performed.

## G-001 INACTIVE-store regression and CI handoff — 21 November 2026

- CI #1269 on `5580e79f603705abc9120fc5cc68aa4495935166` failed only the changed-file Prettier gate on seven Markdown files; lint and typecheck passed, while dependent API/integration/migration/build jobs were skipped.
- Temporary formatter workflow run [#1](https://github.com/nabeel2323/scs-platform/actions/runs/44917785644) succeeded, formatted all seven files using repository-locked Prettier, removed its own workflow file, and pushed `71550c4c6d71de1b3b54f6d2230b308251a73e23`. The temporary workflow is verified absent from the resulting tree.
- CI #1270 on temporary-workflow insertion commit `7b57052b65d049811733ffb0cfd1e208b7fa17f1` failed the same formatting gate because it preceded formatter output. CI #1271 on the formatted bot commit returned `action_required` with no jobs; it is not a test result.
- A user-authored follow-up commit adds an explicit INACTIVE-store buyer-visibility PostgreSQL test and synchronizes this documentation. Exact-head CI for that commit is required; no test result is claimed yet.

## INACTIVE-store acceptance and formatter recovery — 21 November 2026

- CI #1271 passed all 10 executable jobs on formatted commit `71550c4c6d71de1b3b54f6d2230b308251a73e23`; this predates the additional INACTIVE-store PostgreSQL test.
- CI #1272 on `6a7a620f9a68528ec7f638dbf85ad3c13031a5e5` failed the changed-file Prettier gate on seven Markdown files. Lint/typecheck passed; dependent API unit/coverage, PostgreSQL integration, migration, Web/Admin, boundary, contract, build and container jobs were skipped.
- Formatter workflow run [#2](https://github.com/nabeel2323/scs-platform/actions/runs/44922086383) succeeded and pushed formatted documentation at `cba6fb76ede53efefc2683c3372df1fdb7e6e1a4`; the temporary workflow removed itself.
- CI #1273 for the formatter-bot commit returned `action_required` with zero jobs. This is neither a pass nor a test result. Exact-head API/PostgreSQL verification of the INACTIVE-store regression remains outstanding.
- PR #138 remains open/draft/unmerged. No staging release, protected environment approval, shared database mutation, migration 0070, grants/default ACL, RLS, deployment or worker activation occurred.

## CI #1275 — formatting gate failure — 21 November 2026

- **Exact tested commit:** `d67875507a07a75f2945b44beb7bfbec387f169e`.
- **Run:** [GitHub Actions CI #1275](https://github.com/nabeel2323/scs-platform/actions/runs/44922283263).
- **Passed:** lint, TypeScript typecheck, Flutter analysis and Flutter tests.
- **Failed:** changed-file Prettier on five Markdown files: implementation progress, current state, open issues, release/CI status and work log.
- **Skipped:** API unit/coverage, PostgreSQL integration, Web/Admin, boundary lint, migration, contract/codegen, container, build and k6. Dependent jobs did not execute.
- **Interpretation:** the INACTIVE-store PostgreSQL test has not been executed by CI. This is a documentation-formatting gate failure, not a functional test result.
- **Next:** run repository-locked Prettier on the changed handover documents and obtain a normal exact-head CI run.

## Latest exact-source verification — CI #1280 — 21 November 2026

## Latest verified checkpoint — 21 November 2026

- Branch: `remediation/phase-0-1-tenant-security`; source commit: `ffd3961c32164c2af00090b32dbafb06b997a581`.
- PR [#138](https://github.com/nabeel2323/scs-platform/pull/138) remains open, draft and unmerged; base `develop` is `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.
- Exact-head [CI #1280](https://github.com/nabeel2323/scs-platform/actions/runs/44922582006) completed successfully on that SHA. All 10 executable jobs passed: lint/typecheck/changed-file formatting; Flutter analysis/tests; API unit/coverage; PostgreSQL integration; Web/Admin tests; E6 boundary lint; migration full apply and read-only access audit; container build/smoke; build; and contract/codegen. k6 and protected staging release were skipped.
- The PostgreSQL integration job executed `pnpm --filter @scs/api test:integration` against disposable PostgreSQL 16 and Redis services and passed. The `catalog-lifecycle.e2e.spec.ts` suite, including `hides buyer offers for an INACTIVE store`, is included in that integration test command. The test verifies both buyer list and ranked results exclude the INACTIVE store while the ACTIVE store remains visible, and restores the fixture in `finally`.
- G-001 remains PARTIAL only pending independent security review and disposition of reviewer findings. The review packet is prepared but is not itself an independent review.
- G-002 remains IN PROGRESS. Actual staging API/migration runtime identities and the protected read-only staging audit remain unverified. The connected Supabase Management API `postgres` identity is not a substitute.
- No staging deployment/write, shared database mutation, migration 0070, grants/default ACL change, RLS enablement, environment change or worker activation was performed.

### Executable job results

| Job                                                      | Result  |
| -------------------------------------------------------- | ------- |
| Lint, TypeScript typecheck and changed-file Prettier     | PASS    |
| Flutter analysis and tests                               | PASS    |
| API unit tests and coverage gates                        | PASS    |
| PostgreSQL integration tests                             | PASS    |
| Web and Admin tests                                      | PASS    |
| E6 boundary lint                                         | PASS    |
| Migration full apply and read-only database-access audit | PASS    |
| Container build and smoke tests                          | PASS    |
| Build                                                    | PASS    |
| Contract specification and code generation               | PASS    |
| k6 smoke test                                            | SKIPPED |
| Protected staging release                                | SKIPPED |

The PostgreSQL integration command ran against disposable CI services. This is not a staging runtime test or approval to deploy. The INACTIVE-store regression is part of the integration suite executed by this job. No shared database changes were made.

## Exact-head security verification — 22 November 2026

### PR #138 — G-001/G-002 remediation

- [CI #44948332893](https://github.com/nabeel2323/scs-platform/actions/runs/44948332893) passed all 10 executable jobs on source SHA `05e7a0ea602913c445e6766a1046fc3b8068be7b`.
- API unit/coverage, PostgreSQL integration, migration full apply, read-only database-access audit under a separate `scs_audit` login, Web/Admin, Flutter, E6 boundary lint, container build/smoke, build, contract/codegen and formatting passed.
- k6 and protected staging release were skipped.
- The CI migration runner logged its disposable fixture identity as `scs` with elevated flags. The audit utility ran separately as `scs_audit` with superuser/BYPASSRLS/CREATEROLE/CREATEDB all false and only CONNECT granted. Neither identity represents staging.

### PR #142 — API runtime identity diagnostics

- [CI #44948310469](https://github.com/nabeel2323/scs-platform/actions/runs/44948310469) passed all 10 executable jobs on source SHA `6567eb3b94de62514b5e8c5b9512cef995a8dd7f`.
- A follow-up PostgreSQL integration test was committed on `dddff20c170737dc4694008bb807b2b90e177f77` to validate the exact identity SQL with distinct login/effective roles and a non-owner, non-superuser, non-BYPASSRLS login.
- Exact-head CI [#44953735602](https://github.com/nabeel2323/scs-platform/actions/runs/44953735602) is in progress at this checkpoint. Its lint/typecheck/format, Flutter, Web/Admin, boundary lint and migration full-apply jobs have passed; API unit/coverage and PostgreSQL integration are still running.
- k6 and protected staging release were skipped on the preceding successful run. No staging deploy was performed.

Neither PR is merged. CI results are disposable-environment verification only; live staging API/migration identities remain unverified.
