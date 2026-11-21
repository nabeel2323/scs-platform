# SCS Platform — Current State

**Checkpoint date:** 22 November 2026  
**Repository:** [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform)  
**Branch:** remediation/phase-0-1-tenant-security  
**Current branch head after project-memory updates:** `562dbc6bdcf8ce06e0c639a08c006276eac33168`
**Current PR:** [#138 — Remediation Phase 0–1](https://github.com/nabeel2323/scs-platform/pull/138), open and draft.

> This is a dated checkpoint. At the beginning of every new session, re-fetch the live branch head, PR, commits and CI. This checkpoint-documentation update itself advances the branch; resolve its exact SHA from GitHub rather than assuming the SHA above is still HEAD.

## Repository and product

SCS Platform is a B2B-first multi-merchant commerce and supply marketplace. The monorepo contains a NestJS modular-monolith API, Next.js buyer/merchant web application, Next.js admin console, Flutter mobile application, shared TypeScript contracts/packages, PostgreSQL 16/PostGIS, Redis and CI/deployment infrastructure.

## GitHub checkpoint

| Item                 | Last inspected value                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| Repository           | nabeel2323/scs-platform                                                  |
| Branch               | remediation/phase-0-1-tenant-security                                    |
| Live branch head     | `562dbc6bdcf8ce06e0c639a08c006276eac33168`                               |
| Latest commit        | `docs(security): add G-002 database access architecture design`          |
| PR #138              | Open; draft; not merged                                                  |
| PR base              | `develop` at `f74eb588cc58fc99b105e749d39dbfbacb4f9775`                  |
| Latest exact-head CI | No workflow/status returned for documentation head `562dbc6...`; NOT CI-VERIFIED |
| PR #142 CI           | #44948310469 — success on `6567eb3b...`; new PostgreSQL SQL test pending |
| PR #138 CI           | All 10 executable jobs passed; k6 and staging release skipped            |

## Current remediation status

| Area                                 | Status                   | Meaning                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-001 — merchant offer authorization | **PARTIAL**              | Merchant role gates, scope-first offer confidentiality and ACTIVE-store buyer visibility are implemented with focused regression tests. Exact-head CI, remaining acceptance evidence and independent review remain. |
| G-002 — database access/RLS          | **IN PROGRESS**          | Read-only source/schema work exists. Actual staging API/migration identities, protected staging audit, per-table access predicates and reviewed least-privilege/RLS design remain.                                  |
| Phases 0–5                           | **IN PROGRESS**          | See the authoritative progress tracker for phase and finding details.                                                                                                                                               |
| Phase 6                              | **NOT STARTED**          | Consolidated full verification and release go/no-go campaign has not begun.                                                                                                                                         |
| PR #138                              | **DRAFT — DO NOT MERGE** | Not release authorization.                                                                                                                                                                                          |

The complete finding register, phase dashboard and technical evidence live in [IMPLEMENTATION-PROGRESS.md](../docs/remediation/IMPLEMENTATION-PROGRESS.md). The detailed acceptance criteria and release gates live in [IMPLEMENTATION-PLAN.md](../docs/remediation/IMPLEMENTATION-PLAN.md).

## Latest CI and security verification evidence — 22 November 2026

- PR #138 CI [#44948332893](https://github.com/nabeel2323/scs-platform/actions/runs/44948332893) passed all 10 executable jobs on branch source SHA `05e7a0ea602913c445e6766a1046fc3b8068be7b`. This includes API unit/coverage, PostgreSQL integration, migration full apply and read-only database-access audit, Web/Admin, Flutter, E6 boundary lint, container smoke, build, contract/codegen and formatting. k6 and protected staging release were skipped.
- The migration job created a separate `scs_audit` login with no superuser, BYPASSRLS, role-creation or database-creation flags and only database CONNECT, then ran the audit utility. It successfully inspected the disposable PostgreSQL 16 catalog with no application table privileges. This is CI-fixture evidence, not live staging evidence.
- PR #142 CI [#44948310469](https://github.com/nabeel2323/scs-platform/actions/runs/44948310469) passed all 10 executable jobs on source SHA `6567eb3b94de62514b5e8c5b9512cef995a8dd7f`. The API identity logger unit cases, API unit/coverage, PostgreSQL integration, migration full apply, Web/Admin, Flutter, boundary lint, container smoke, build, contract/codegen and formatting passed. k6 and protected staging release were skipped.
- A further real-PostgreSQL test was added to PR #142 to exercise distinct login/effective roles through the API identity SQL using a non-owner, non-superuser, non-BYPASSRLS account. Its exact-head run [#44953735602](https://github.com/nabeel2323/scs-platform/actions/runs/44953735602) is still in progress at this checkpoint on `dddff20c170737dc4694008bb807b2b90e177f77`.
- PR #138 now includes [G-002-RLS-ARCHITECTURE-DESIGN.md](../docs/remediation/G-002-RLS-ARCHITECTURE-DESIGN.md). It records why RLS activation is premature until a transaction-bound tenant context and complete operation/ownership matrix exist.
- PR #138 remains open and draft. PR #142 remains open and draft. Neither is merged or deployed.

## Historical CI #1176 failure

[CI #1176](https://github.com/nabeel2323/scs-platform/actions/runs/44856823290) tested 1c1cf2f5032cf789789f0efc527e3c976a9ceb78 and failed only at changed-file Prettier for the G-001 controller test and progress tracker. Lint completed with 0 errors (311 warnings), typecheck succeeded and Flutter analysis/tests passed. API unit/coverage, PostgreSQL integration, migration, Web/Admin, boundary, build/container and contract jobs were skipped because the lint job failed. Formatter run #14 corrected the two files.

## Immediate next actions

1. Complete and record PR #142's real-PostgreSQL login/effective-role integration test on its exact head.
2. Expand the G-002 table inventory into a complete operation/ownership matrix, including HTTP, worker, webhook, audit and bootstrap paths.
3. Design and test a transaction-bound Drizzle context before writing or enabling any RLS policies. Use transaction-local context only; never set tenant identity at pooled-session scope.
4. Obtain independent G-001 security review and record findings/disposition. Keep G-001 PARTIAL until this is complete.
5. Keep PR #138 and PR #142 draft. Do not merge, deploy, alter shared grants/default ACLs, apply migration 0070 or enable RLS without the required independent review and explicit authorization.

## Safety reminder

PR #138 must remain open and draft. Do not merge or deploy it, bypass protected staging approval, change shared database grants/default ACLs, apply migration 0070, enable RLS, change staging/production configuration, perform staging writes or activate workers without the explicitly required authorization.

## Live reconciliation — 21 November 2026

- The branch advanced from `e039715b8f05cc3146dddf64d476df4aabe43868` with a G-001 controller test expansion and synchronized remediation tracker/work-log entries. The pre-refresh branch head inspected here is `a6c4b924f1899717c745d41fc6a8a1b4b7dc02c9`.
- Supported merchant roles are now exercised across list, analytics, trend and offer-detail reads; FINANCE is included in the negative privileged-read matrix; foreign-organization trend access is explicitly denied before service access.
- This test-only increment is not yet test-verified. The latest completed CI remains historical #1184; no Actions run or combined status was returned for the inspected head. Obtain exact-head CI before claiming verification.
- PR #138 remains open and draft. G-001 remains PARTIAL; G-002 remains IN PROGRESS. All staging, shared-database and deployment restrictions remain unchanged.

## Live continuation checkpoint — 21 November 2026

- Latest branch commit inspected: `ae2d3ea97a16b7ebb916e390dbf6433733c31438`.
- Added G-001 controller denial tests for foreign-organization offer lists, missing active organization, and revoked/inactive membership on analytics. Tests assert that protected service methods are not called after denial.
- Source test commit: `ca641eb2a73bd1d3da27700e9a85c6ec2dfe0dad`; remediation progress and project-memory work log were synchronized afterward.
- Exact-head GitHub Actions workflow lookup returned no associated runs. Combined status contains two Vercel failures, both targeting the external build-rate-limit page. No application test failure is reported by those Vercel contexts, but they are not green checks. GitHub Actions exact-head verification remains pending.
- PR #138 remains open and draft. G-001 remains PARTIAL; G-002 remains IN PROGRESS.
- Next: complete remaining G-001 lifecycle/service acceptance and obtain exact-head API + integration CI. Independent review remains separate. All database/staging/deployment restrictions remain unchanged.

## Latest continuation checkpoint — 21 November 2026

- Latest branch commit before this checkpoint update: `e814f871b2b027c5c44ff614dfcac66eaa06c56e`.
- G-001 controller tests now cover foreign-organization offer-list denial, missing active organization, revoked/inactive membership on analytics, and merchant management of DRAFT stores. The DRAFT-store test preserves the documented distinction between merchant management and buyer visibility; no SUSPENDED-store policy was inferred.
- Test-source commits: `ca641eb2a73bd1d3da27700e9a85c6ec2dfe0dad` and `9dcd87bd688d3d7f7bcccaad4660d0976e4e848a`. Progress tracker and project-memory work log were synchronized.
- Exact-head CI remains unverified; prior Vercel contexts were external build-rate-limit failures. Obtain a fresh Actions result before considering these tests validated.
- Remaining G-001 work: service/integration coverage for store membership revocation and full buyer/foreign-merchant/admin HTTP behavior, then independent security review. G-001 remains PARTIAL. G-002 remains IN PROGRESS. PR #138 remains draft.

## Latest PostgreSQL acceptance checkpoint — 21 November 2026

- Latest branch commit before this checkpoint update: `05fe9c6ecb9590586d9117af6d6ce547dd7e29b6`.
- Identified and corrected a fixture mismatch caused by the ACTIVE-store buyer visibility rule: catalog lifecycle stores now explicitly start ACTIVE for buyer discovery integration scenarios.
- Added a PostgreSQL regression that changes Merchant B's store to DRAFT and verifies that both buyer list and ranked-offer queries exclude it while the other ACTIVE store remains visible; restores the status in `finally`.
- Related implementation/test commits include `5f74662dfcb2f4e5745e0738cc8c0e352b83bdcd`. Progress tracker and work log were synchronized.
- This regression has not yet executed in CI. Exact-head GitHub Actions, API unit and PostgreSQL integration verification remain pending.
- G-001 remains PARTIAL; G-002 remains IN PROGRESS. PR #138 remains open/draft. No shared database or staging data was modified.

## Latest G-001 PostgreSQL security checkpoint — 21 November 2026

- Latest branch commit before this checkpoint update: `bf8feed6ebf0064bbf95b0a80910b002988d18ad`.
- Added real PostgreSQL coverage for scope-first offer detail: foreign-organization merchants and same-organization non-members both receive the same 404 class; inactive/revoked store membership denies detail and is restored to ACTIVE in `finally`.
- The catalog lifecycle PostgreSQL suite also now uses explicitly ACTIVE stores for buyer-discovery fixtures and verifies DRAFT-store exclusion from both buyer offer list and ranked results.
- Related source/test commits: `5f74662dfcb2f4e5745e0738cc8c0e352b83bdcd` and `f8e6d19f912027c094ba0721736cc8080843fc0f`. Remediation tracker and work log synchronized.
- Exact-head API unit/PostgreSQL CI remains pending; no tests are claimed as executed. G-001 remains PARTIAL pending CI, full acceptance evidence and independent security review. G-002 remains IN PROGRESS.
- No shared database or staging state was touched; all new database tests run against disposable PostgreSQL containers.

## Merchant-staff PostgreSQL acceptance checkpoint — 21 November 2026

- Latest branch commit before this checkpoint update: `bf625aefd6faf47c60fd1bf01b1c23148de66ca0`.
- Added disposable-PostgreSQL service coverage proving an active store MEMBER using `MERCHANT_STAFF` caller context can read offer detail. Temporary membership is marked INACTIVE in `finally`.
- The same integration suite covers foreign-merchant/same-org-non-member 404 parity, revoked membership denial, and ACTIVE/DRAFT buyer-visibility behavior.
- Exact-head API/PostgreSQL CI remains pending; no new tests are claimed as executed. G-001 remains PARTIAL pending exact-head CI and independent security review.

## G-001 buyer projection and create-reference hardening — 21 November 2026

The buyer-facing product offer endpoint now returns an explicit allowlist of public commercial fields instead of full merchant-offer rows. It excludes merchant metadata, external references, proposer/reviewer identifiers and timestamps, review details, price-list IDs and warehouse IDs. The ranked buyer endpoint no longer returns the internal price-list reference.

Offer creation now enforces the same-store ownership invariant for optional price-list and warehouse references, matching the existing pricing-update behavior. Unit tests cover foreign-store denial, same-store acceptance and the public projection. PostgreSQL integration tests cover cross-store reference rejection without inserting an offer and verify that private offer fields are absent from buyer and ranked responses.

The implementation and documentation are synchronized in this change. Exact-head CI must verify the resulting commit before G-001 status changes. G-001 remains PARTIAL pending full CI, remaining role/tenant acceptance and independent security review. G-002 remains IN PROGRESS. No shared database, staging, migration, grants, RLS, deployment or worker changes were performed.

## CI #1259 regression analysis and correction — 21 November 2026

Exact-head CI #1259 exposed two defects. PostgreSQL rejected the correlated `EXISTS` predicate used by the buyer offer relational query because the outer `merchant_offers` reference was not valid in the generated query shape. The store-visibility predicate is being changed to an uncorrelated `store_id IN (SELECT id FROM stores WHERE status = 'ACTIVE')` subquery, preserving the visibility rule without the invalid outer reference. The catalog-offer unit harness also lacked `.limit()` on its selected-query branch, which broke tenant-membership tests; the harness now supports `.getSQL()`, `.limit()` and `.groupBy()` for the relevant query shapes.

CI #1259: lint/typecheck, formatting, mobile, Web/Admin, boundary lint and migration/read-only audit passed. API unit/coverage and PostgreSQL integration failed for the two issues above. The correction is committed with regression coverage; exact-head CI must pass before G-001 advances. No staging/database writes or deployment actions were performed.

## Exact-head CI #1265 reconciliation — 21 November 2026

The live PR #138 head at inspection was `36399ce6704b0774f0ebb0f670a3e7d735b19295`. CI [#1265](https://github.com/nabeel2323/scs-platform/actions/runs/44897469038) completed with lint/typecheck/formatting, Flutter, E6 boundary lint, migration full apply/read-only audit and Web/Admin tests passing. API unit/coverage and PostgreSQL integration failed on the missing `storeMembers` model in five explicit Drizzle test schema maps; Phase 4's offer/cart/checkout failures were downstream cascades. Contract/codegen, container smoke, build, k6 and staging release were skipped. Vercel web/admin contexts were separate provider build-rate-limit failures.

The current grouped source correction adds the missing model to all five test schema maps and sets the test stores ACTIVE where buyer-discovery flows are expected. Production authorization logic is unchanged. Exact-head CI on the corrected commit remains the next verification gate. G-001 remains PARTIAL; G-002 remains IN PROGRESS; PR #138 remains open and draft. No staging/shared-database/deployment actions were performed.

## Exact-head CI #1266 formatting gate — 21 November 2026

CI #1266 on `52336f751dc2558b10834940034833b4573c5ca4` passed Flutter and completed lint/typecheck with zero errors, but failed changed-file Prettier on nine files. All dependent API unit/coverage, PostgreSQL integration, migration, Web/Admin, boundary, contract, container and build jobs were skipped. The five PostgreSQL fixture corrections are committed, but this run did not execute them. Repository-locked formatting is the immediate task; exact-head CI after the formatting commit must verify the test changes. G-001 remains PARTIAL and PR #138 remains draft.

## Live checkpoint — exact-head CI #1268 — 21 November 2026

- GitHub branch head: `b73f72e34406c1260f214610539139d0d096b2de`; latest commit applies repository Prettier to the tenant-security fixtures and handover docs.
- PR #138 is open, draft and unmerged; base is `develop` at `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.
- CI [#1268](https://github.com/nabeel2323/scs-platform/actions/runs/44907038784) passed all 10 executable jobs on the exact head: lint/typecheck/format, API unit/coverage, PostgreSQL integration, Web/Admin, migration full-apply/read-only DB audit, E6 boundary lint, Flutter, contract/codegen, build and container smoke. k6 and protected staging release were skipped.
- The five `storeMembers` Drizzle schema-map corrections and ACTIVE buyer-discovery fixtures are now verified by API unit/coverage and real PostgreSQL integration. Production authorization guards were not relaxed.
- G-001 remains PARTIAL pending independent security review; G-002 remains IN PROGRESS. No staging deployment, shared DB mutation, migration 0070, grants/default ACL, RLS, worker activation or environment change occurred.
- Next: independent G-001 review using the review packet, then continue G-002 read-only evidence and identity/access design within existing approval restrictions.

## G-001 INACTIVE-store buyer-visibility regression — 21 November 2026

- Added a disposable-PostgreSQL integration scenario to `catalog-lifecycle.e2e.spec.ts`: set Merchant B's store to `INACTIVE`, verify buyer list and ranked results exclude its offers while Merchant A's ACTIVE store remains visible, and restore the fixture in `finally`.
- This explicitly tests the inactive-store buyer-visibility dimension without defining merchant-management behavior for inactive stores.
- The test awaits exact-head CI. CI #1268 verifies the preceding G-001 code; CI #1269 failed Prettier, formatter workflow #1 succeeded and removed itself, and CI #1271 returned `action_required` with no jobs. The next commit is user-authored to trigger fresh exact-head CI.

## Live checkpoint — INACTIVE-store regression and exact-head CI recovery — 21 November 2026

- Live branch head at reconciliation: `cba6fb76ede53efefc2683c3372df1fdb7e6e1a4`; PR #138 remains open, draft and unmerged, based on `develop` at `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.
- The source commit `6a7a620f9a68528ec7f638dbf85ad3c13031a5e5` adds a real PostgreSQL test that sets Merchant B's store to `INACTIVE`, checks both buyer list and ranked-offer results exclude it while Merchant A remains visible, and restores the fixture in `finally`.
- CI #1271 passed all 10 executable jobs on `71550c4c6d71de1b3b54f6d2230b308251a73e23`; that run does not include the INACTIVE-store test.
- CI #1272 on `6a7a620f9a68528ec7f638dbf85ad3c13031a5e5` failed only changed-file Prettier on seven Markdown files. Lint/typecheck passed; all dependent API/integration and other jobs were skipped.
- Temporary formatter workflow run [#2](https://github.com/nabeel2323/scs-platform/actions/runs/44922086383) succeeded, applied repository-locked Prettier and removed its temporary workflow. The formatted docs commit is `cba6fb76ede53efefc2683c3372df1fdb7e6e1a4`.
- CI #1273 for that formatter-bot commit returned `action_required` with zero jobs. This is not a pass or a test result. The exact current head still needs a normal CI execution before the INACTIVE-store test is considered verified.
- G-001 remains PARTIAL pending exact-head API/PostgreSQL verification and independent security review. G-002 remains IN PROGRESS. PR stays draft; no staging deployment, shared DB mutation, migration 0070, grants/default ACL, RLS or worker activation occurred.

## CI #1275 — documentation formatting regression — 21 November 2026

- Exact tested commit: `d67875507a07a75f2945b44beb7bfbec387f169e`; PR #138 remains open/draft/unmerged.
- Lint and TypeScript typecheck passed. Flutter analysis and Flutter tests passed.
- The changed-file Prettier gate failed on five Markdown files: `docs/remediation/IMPLEMENTATION-PROGRESS.md`, `project-memory/CURRENT-STATE.md`, `project-memory/OPEN-ISSUES.md`, `project-memory/RELEASE-AND-CI-STATUS.md` and `project-memory/WORK-LOG.md`.
- API unit/coverage, PostgreSQL integration, Web/Admin, boundary lint, migration, contract/codegen, container and build jobs were skipped after the formatting gate failed. The INACTIVE-store regression has therefore not yet run in CI.
- Next: apply repository-locked Prettier to all changed handover documents, then obtain a normal exact-head CI run. G-001 remains PARTIAL; do not claim the new test as verified. G-002 remains IN PROGRESS. No staging/shared DB changes occurred.

## Latest live reconciliation — 21 November 2026

## Latest verified checkpoint — 21 November 2026

- Branch: `remediation/phase-0-1-tenant-security`; source commit: `ffd3961c32164c2af00090b32dbafb06b997a581`.
- PR [#138](https://github.com/nabeel2323/scs-platform/pull/138) remains open, draft and unmerged; base `develop` is `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.
- Exact-head [CI #1280](https://github.com/nabeel2323/scs-platform/actions/runs/44922582006) completed successfully on that SHA. All 10 executable jobs passed: lint/typecheck/changed-file formatting; Flutter analysis/tests; API unit/coverage; PostgreSQL integration; Web/Admin tests; E6 boundary lint; migration full apply and read-only access audit; container build/smoke; build; and contract/codegen. k6 and protected staging release were skipped.
- The PostgreSQL integration job executed `pnpm --filter @scs/api test:integration` against disposable PostgreSQL 16 and Redis services and passed. The `catalog-lifecycle.e2e.spec.ts` suite, including `hides buyer offers for an INACTIVE store`, is included in that integration test command. The test verifies both buyer list and ranked results exclude the INACTIVE store while the ACTIVE store remains visible, and restores the fixture in `finally`.
- G-001 remains PARTIAL only pending independent security review and disposition of reviewer findings. The review packet is prepared but is not itself an independent review.
- G-002 remains IN PROGRESS. Actual staging API/migration runtime identities and the protected read-only staging audit remain unverified. The connected Supabase Management API `postgres` identity is not a substitute.
- No staging deployment/write, shared database mutation, migration 0070, grants/default ACL change, RLS enablement, environment change or worker activation was performed.

## G-002 architecture checkpoint — 22 November 2026

The read-only design note [G-002-RLS-ARCHITECTURE-DESIGN.md](../docs/remediation/G-002-RLS-ARCHITECTURE-DESIGN.md) records the current architecture blocker: the API uses a global process-wide Drizzle pool, and the inspected request middleware does not bind all service queries to a transaction carrying verified tenant context. A pooled session-level tenant variable would risk cross-request context leakage. RLS remains disabled until transaction-bound context, complete per-table operation mapping, non-owner role tests, independent review and staging approval are complete.


## G-002 inventory and CI checkpoint — 22 November 2026

- PR #138 exact-head CI [#44954371615](https://github.com/nabeel2323/scs-platform/actions/runs/44954371615) passed all executable jobs on 741a09f68721898a5bed6601bc3bc636867c78c2. PR #142 exact-head CI [#44953735602](https://github.com/nabeel2323/scs-platform/actions/runs/44953735602) passed all executable jobs on dddff20c170737dc4694008bb807b2b90e177f77, including the distinct-login/effective-role PostgreSQL integration test. k6 and protected staging release were skipped in both runs.
- Added docs/remediation/G-002-TABLE-OWNERSHIP-MATRIX.md. It enumerates 99 Drizzle-exported tables and records candidate row scopes, but deliberately marks exact owner columns, FK paths and route/service operations as incomplete. The historical 116-table live inventory still requires refreshed protected reconciliation.
- Both PRs remain open, draft and unmerged. CI used disposable services only. Actual staging API/migration identities remain unverified; G-002 is IN PROGRESS and RLS must remain disabled.
- No shared database mutation, migration 0070, grants/default-ACL changes, RLS enablement, worker activation, environment change or deployment was performed.


## User-approved programme direction — 22 November 2026

The user approved the Implementation Completion Program and requested that this decision persist in project memory for future sessions. The new [Implementation Completion Gap Register](./IMPLEMENTATION-GAP-REGISTER.md) is the programme-level entry point for the evidence-backed initial gaps and statuses.

**Execution sequence:** baseline/gap mapping → implementation completion → integration completion → comprehensive testing → stabilization → release readiness. During implementation, run only targeted developer checks and focused tests needed for critical invariants; defer the broad regression campaign until implementation and integration are ready. Fix any known security/correctness defect immediately. This sequencing does not waive independent review, protected staging, database, deployment, business sign-off or release restrictions.

**Next task:** expand MAP-001 into a repository-wide, source-referenced inventory of modules, user journeys, APIs, screens, database entities, permissions, integrations and documentation; then select the highest-priority confirmed implementation gap. Do not assume historical UI/UX issues are still open without checking current source. Keep the authoritative remediation finding tracker synchronized.


## Live project-memory update — 22 November 2026

- Current branch head after this checkpoint: `562dbc6bdcf8ce06e0c639a08c006276eac33168` on `remediation/phase-0-1-tenant-security`.
- Created `project-memory/IMPLEMENTATION-GAP-REGISTER.md` and recorded the user's approved implementation-first programme in START-HERE, DECISIONS-AND-CONSTRAINTS, IMPLEMENTATION-ROADMAP, OPEN-ISSUES, CURRENT-STATE, RELEASE-AND-CI-STATUS and WORK-LOG.
- This is a documentation-only change. Workflow-run lookup and combined-status lookup returned no checks for the exact current head; it is NOT CI-VERIFIED. Earlier CI #44954371615 on source SHA `741a09f68721898a5bed6601bc3bc636867c78c2` remains historical evidence only.
- Next: complete MAP-001 by auditing actual source modules, routes, screens, database entities, permissions, workflows and docs. Then implement the highest-priority confirmed gap in a cohesive batch. Keep broad regression testing for Phase 3 and all existing security/release restrictions intact.
