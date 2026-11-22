# SCS Platform — Current State

**Checkpoint date:** 22 November 2026  
**Repository:** [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform)  
**Branch:** remediation/phase-0-1-tenant-security  
**Latest source/documentation baseline before this state refresh:** `2345c01946bd31cbc34d63940275af45c312eb98` (the current-state refresh commit itself advances the branch; resolve its resulting SHA from GitHub)
**Current PR:** [#138 — Remediation Phase 0–1](https://github.com/nabeel2323/scs-platform/pull/138), open and draft.

> This is a dated checkpoint. At the beginning of every new session, re-fetch the live branch head, PR, commits and CI. This checkpoint-documentation update itself advances the branch; resolve its exact SHA from GitHub rather than assuming the SHA above is still HEAD.

## Repository and product

SCS Platform is a B2B-first multi-merchant commerce and supply marketplace. The monorepo contains a NestJS modular-monolith API, Next.js buyer/merchant web application, Next.js admin console, Flutter mobile application, shared TypeScript contracts/packages, PostgreSQL 16/PostGIS, Redis and CI/deployment infrastructure.

## GitHub checkpoint

| Item                 | Last inspected value                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| Repository           | nabeel2323/scs-platform                                                  |
| Branch               | remediation/phase-0-1-tenant-security                                    |
| Live branch head     | `2345c01946bd31cbc34d63940275af45c312eb98` before this state refresh; resulting state-refresh SHA must be resolved live |
| Latest commit        | `docs(remediation): reconcile current G-002 progress head [skip ci]` |
| PR #138              | Open; draft; not merged                                                  |
| PR base              | `develop` at `f74eb588cc58fc99b105e749d39dbfbacb4f9775`                  |
| Latest exact-head CI | No Actions run for source/docs head `2345c01...`; combined status contains only Vercel preview failures pointing to external build-rate limit; NOT CI-VERIFIED |
| PR #142 CI           | #44953735602 — passed all executable jobs on `dddff20c...`; disposable PostgreSQL identity test included |
| PR #138 CI           | Historical #44954371615 passed all executable jobs on `741a09f...`; not transferable to current head |

## Current remediation status

| Area                                 | Status                   | Meaning                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-001 — merchant offer authorization | **PARTIAL**              | Merchant role gates, scope-first offer confidentiality and ACTIVE-store buyer visibility are implemented with focused regression tests. Exact-head CI, remaining acceptance evidence and independent review remain. |
| G-002 — database access/RLS          | **IN PROGRESS**          | Operation map now covers 26 service files plus supporting worker/system paths; preliminary schema ownership candidates are documented. Actual staging API/migration identities, protected catalog audit, exact operation predicates and reviewed least-privilege/RLS design remain.                                  |
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

1. Continue DB-003 with the remaining service/controller/worker/webhook/CLI/raw-SQL operation paths; map each operation to the exact table, principal context and direct/indirect FK owner.
2. Reconcile the 114-versus-116 relation count only from a refreshed protected read-only catalog snapshot; do not infer a current count from the historical audit.
3. Complete the Admin/Web/Mobile route-to-client callsite mapping and resolve UX-008 only after the required location/privacy/product scope decision.
4. Preserve the implementation-first sequence: finish implementation and integration before the consolidated Phase 3 test campaign. The new G-002 operation map is source-only and NOT test-verified.
5. Keep G-001 PARTIAL pending independent review; keep G-002 IN PROGRESS pending actual API/migration runtime identity, protected catalog audit, complete operation/ownership map and reviewed transaction-context design.

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

- Current branch head after this checkpoint: `4adf87a07e8156e04ca008b6d236770704603eda` on `remediation/phase-0-1-tenant-security`.
- Created `project-memory/IMPLEMENTATION-GAP-REGISTER.md` and recorded the user's approved implementation-first programme in START-HERE, DECISIONS-AND-CONSTRAINTS, IMPLEMENTATION-ROADMAP, OPEN-ISSUES, CURRENT-STATE, RELEASE-AND-CI-STATUS and WORK-LOG.
- This is a documentation-only change. Workflow-run lookup and combined-status lookup returned no checks for the exact current head; it is NOT CI-VERIFIED. Earlier CI #44954371615 on source SHA `741a09f68721898a5bed6601bc3bc636867c78c2` remains historical evidence only.
- Next: complete MAP-001 by auditing actual source modules, routes, screens, database entities, permissions, workflows and docs. Then implement the highest-priority confirmed gap in a cohesive batch. Keep broad regression testing for Phase 3 and all existing security/release restrictions intact.

## MAP-001 source inventory checkpoint — 22 November 2026

- Added [WHOLE-PRODUCT-IMPLEMENTATION-INVENTORY.md](./WHOLE-PRODUCT-IMPLEMENTATION-INVENTORY.md) and linked it from START-HERE.
- Static recursive tree at inspected source head `2cca47aa34abd1a014ea16217cfee204c9e9f803`: 1,625 tracked files; 20 API modules, 28 module controllers, 25 module schema files, 49 web pages, 56 admin pages, 32 Flutter screens, 71 SQL migrations, 152 API unit test files and 82 API integration test files. Also 18 web tests, 15 admin tests, 10 Flutter test files and 2 Playwright E2E test files.
- Current-source gaps added to the programme register: Admin order operations UX; admin refund approval; dashboard import/catalog-request widgets; 33-entry flat sidebar; merchant Product Studio offer-step UX; granular mobile permission affordances; support-ticket scope/module; nearby-offers API/UI contract discrepancy; full admin route permission audit.
- Important corrections: the generic admin ManagementPage does apply its configured permission check; mobile has merchant/driver role redirects; payment list/verification, promotions, disputes and analytics UI exist. The September UI audit is historical, not a current status authority.
- This is a static source inventory only. No tests were run, no live database was queried or modified, and no deployment/staging/worker operation occurred. Current branch head must be re-fetched after the documentation updates; current head CI must not be assumed.
- Next: complete route-to-permission/API matrices and DB/worker operation mapping, then begin the highest-priority confirmed UX implementation batch only after confirming its backend state/permission contracts.

## MAP-001 documentation checkpoint and live CI reconciliation — 22 November 2026

- Current branch and PR #138 head: `7be3e2da3a26ab565f6c5dd391a9bba486d3bcae`; PR #138 remains open/draft/unmerged.
- The static inventory source inspected was commit `2cca47aa34abd1a014ea16217cfee204c9e9f803`; subsequent commits in this batch are project-memory/documentation updates only.
- GitHub Actions workflow-run lookup returned no run for exact head `7be3e2da3a26ab565f6c5dd391a9bba486d3bcae`; combined status returned no contexts. This documentation head is NOT CI-VERIFIED.
- The earlier source CI #44954371615 on `741a09f68721898a5bed6601bc3bc636867c78c2` and PR #142 CI #44953735602 on `dddff20c170737dc4694008bb807b2b90e177f77` remain historical exact-SHA evidence only.
- No application source was changed in this inventory batch. No tests, staging/database writes, migrations, grants, RLS changes, deployments or worker activations occurred.
- Next: complete API route-to-contract/permission mapping, admin/mobile route permission mapping, and worker/provider operation ownership; then implement the highest-priority confirmed UX gap in a cohesive batch.

## Live continuation — 22 November 2026

- Current PR #138 head: `593bc1dfb0948a2b52d29731ab7037a1fa2c9dd1`; PR remains open and draft. PR #142 remains open/draft at `dddff20c170737dc4694008bb807b2b90e177f77`.
- Implemented UX-002 Admin refund queue: API list endpoint protected by `admin:refunds:approve`, REQUESTED-only newest-first queue capped at 100, Admin Payments tab and explicit confirmation before invoking existing approval. Focused controller delegation test added. Comprehensive testing remains pending.
- Exact-head GitHub Actions lookup for the current source commit returned no run. Vercel web/admin statuses are external build-rate-limit failures, not application test evidence. No CI verification is claimed.
- Next: finish API route-to-contract/permission mapping and admin/mobile route matrix; map order-operation state machine/authorization before implementing order actions. No safety gates changed.

## Live continuation — 22 November 2026

- PR #138 head: `d4938bc9bdefd9d48d77b21ce5eb96973154c4ef`, open/draft/unmerged. PR #142 remains open/draft/unmerged at `dddff20c170737dc4694008bb807b2b90e177f77`.
- UX-001 Admin order cancellation and UX-002 Admin refund queue/approval are implemented. Order cancellation uses the existing endpoint, canonical cancellation reasons and notes, state guard, explicit confirmation and refresh. The UI is gated by `orders:cancel` and only appears in cancellable states.
- Exact-head workflow lookup returned no GitHub Actions run for `d4938bc9bdefd9d48d77b21ce5eb96973154c4ef`; Vercel web/admin failures point to the external build-rate-limit page. Neither constitutes application CI verification.
- Next: complete MAP-001 API route-to-contract/permission and admin/mobile route matrix; then continue grouped dashboard/navigation and Product Studio UX work. Comprehensive regression remains Phase 3.

## Live continuation — 22 November 2026

- PR #138 head `c61b06241025b7ed5207f8ada533be120faadbec`, open/draft/unmerged; PR #142 remains open/draft/unmerged at `dddff20c170737dc4694008bb807b2b90e177f77`.
- UX-001 order cancellation, UX-002 refund queue, UX-003 dashboard catalog widgets are implemented. UX-009 route guard discrepancy on /requests corrected to `catalog:requests:manage`; full 56-page Admin permission audit remains in progress.
- Exact-head workflow lookup returned no Actions run; Vercel build-rate-limit statuses are not application test evidence. No CI verification is claimed.
- Next: complete route mapping and Product Studio warehouse selection. Comprehensive tests remain Phase 3.

## Formatting remediation — 22 November 2026

- The changed-file formatting failure in CI #1330 was corrected using repository-locked Prettier 3.9.6 through a one-time formatter workflow. The formatter job completed successfully and self-removed; commit `635ef98cccb7f9690410b56ed9caa631e92268a4` contains the formatted source/docs and no temporary workflow file.
- CI run #44961636474 was triggered on helper commit `c6d964ea1973e71ff292a0c30d2392ff74ec0ce1`; it is not evidence for the formatted commit. Require exact-head CI after the next branch update.

## Exact-head CI result — 22 November 2026

- CI #44961723564 on `10a890a3a69f7281b93f4a8e80b735f2228825cb`: lint/typecheck passed; Flutter analysis/tests passed; formatting failed only on CURRENT-STATE.md, RELEASE-AND-CI-STATUS.md, START-HERE.md and WORK-LOG.md. Downstream API, PostgreSQL, Web/Admin, migration, build and smoke jobs were skipped.
- The four documents are being formatted with repository-locked Prettier 3.9.6. This run is not full verification.


## G-002 source access-path checkpoint — 22 November 2026

A 53-file API module service/worker/provider source inventory and shared middleware/database review are recorded in docs/remediation/G-002-DATABASE-ACCESS-PATH-INVENTORY-2026-11-22.md. The key blockers are singleton Drizzle access without request transaction context, existing nested service transactions, asynchronous audit writes, worker/system access paths and unverified live staging API/migration identities. The 114-versus-116 relation-count discrepancy remains open. The next task is to complete operation/ownership mapping and design explicit request, worker, audit and bootstrap contexts before any RLS implementation.


## Latest verified build status — 22 November 2026

PR #138 source head caba922e866635fad51e549e095a186f9d9df6cf reports SUCCESS for Vercel Admin and Vercel Web. No GitHub Actions run is attached to that exact head; full tests remain deferred to Phase 3.


## G-002 operation map source slices — 22 November 2026

A preliminary direct-Drizzle operation map now covers 19 core API services plus the generic outbox, carrier worker and P13 operations-worker/alert paths. It records observed read/insert/update/delete operations and separately identifies raw-SQL touchpoints. See [G-002-DATABASE-OPERATION-MAP-2026-11-22.md](../docs/remediation/G-002-DATABASE-OPERATION-MAP-2026-11-22.md). The programme gap register and work log were updated. This does not complete DB-003: remaining services, webhook/CLI/migration paths, exact SQL predicates, FK ownership and the 114-versus-116 catalog discrepancy remain open. No tests, CI, staging/database changes, migration, grants, RLS, deployment or worker activation occurred.


## G-002 operation and ownership checkpoint — 22 November 2026

The operation map now includes 26 service files plus supporting outbox, carrier, tracking, operations-control and worker paths. A separate schema review records candidate ownership paths across identity, organization/store membership, catalog, inventory/pricing, buyer/order, shipment/driver, payments/refunds/returns, disputes, notifications, carrier credentials, audit/outbox and system tables. See [G-002-DATABASE-OPERATION-MAP-2026-11-22.md](../docs/remediation/G-002-DATABASE-OPERATION-MAP-2026-11-22.md) and [G-002-TABLE-OWNERSHIP-AND-PREDICATE-CANDIDATES-2026-11-22.md](../docs/remediation/G-002-TABLE-OWNERSHIP-AND-PREDICATE-CANDIDATES-2026-11-22.md). Both are preliminary source evidence, not an approved policy. Exact FK/catalog verification, remaining service/CLI/migration paths, actual runtime identities and the 114-versus-116 discrepancy remain open. Latest source/docs commits use [skip ci]; no Actions run is associated with the current head. Vercel preview statuses currently point to an external build-rate-limit page, not application test results. No staging/database change, migration, grant, RLS, deployment or worker activation occurred.


## API-003 RBAC seed alignment checkpoint — 22 November 2026

A static audit of the 28 controller files enumerated in docs/api-route-permission-matrix.md found one permission key absent from the canonical PERMISSIONS seed and every built-in role: merchant:products:read. Five CatalogController read routes and StoreMembershipController member listing used it and were therefore inaccessible to seeded users. CatalogController now uses catalog:products:read with its existing store/org membership checks. StoreMembershipController now uses merchant:stores:read, and MERCHANT_STAFF receives that already-existing key; MERCHANT_OWNER retains its existing grant. All member mutations still require merchant:products:write and service-level manager/target-role checks. Focused tests were added but not executed. API-003 is IMPLEMENTED / NOT VERIFIED; no new permission key, migration, staging change or database grant was added.


## Live PR reconciliation — 22 November 2026

At the time of this refresh, PR #138 is open/draft/unmerged from remediation/phase-0-1-tenant-security to develop. The latest inspected source/docs head before this state refresh is 5aed6deee8c45b641c3d443dc6713bdd03b726a1. Exact-head Actions lookup returned no workflow runs; Vercel Admin/Web statuses point to the external build-rate-limit page and are not application CI results. PR #142 remains open/draft/unmerged at dddff20c170737dc4694008bb807b2b90e177f77; its earlier CI #1293 success is disposable-PostgreSQL evidence only. No merge, deployment, protected staging action, shared database change, migration, grant, RLS activation or worker activation occurred.


## G-002 migration and RBAC evidence refresh — 22 November 2026

The migration FK crosswalk now includes core schema relationships from migrations 0001, 0003, 0004, 0005, 0009, 0010, 0023, 0026, 0034, 0040, 0041, 0043, 0054, 0058–0063, 0070 and 0071. It records deferred FKs, non-FK org_id scope metadata added in 0062, system tables without tenant/user FKs in 0063, platform-level catalog import ownership and the global business-calendar schema limitation. Cross-parent consistency without composite FKs remains a policy-design risk. API-003 is implemented in source: CatalogController reads use catalog:products:read; StoreMembershipController member listing uses merchant:stores:read; MERCHANT_STAFF receives the existing store-read permission. Focused tests were added but not executed. All of this is static source/migration evidence only; no staging catalog query or shared DB change was performed.


## Latest current state — 22 November 2026

- Repository: nabeel2323/scs-platform; branch: remediation/phase-0-1-tenant-security; PR #138 open/draft/unmerged to develop.
- Current branch/PR head: `6b40d43fdfda45d59afaff7a7956c6be98039d0f` — security(g002): map service and operator DB access paths [skip ci].
- G-002 service mapping now inspects all 53 API service/worker/poller/dispatcher/executor candidates: 44 DB-operation paths and 9 DB-independent helper/provider paths. Added the standalone CLI/migration/bootstrap access map.
- Source safety changes: local admin creation requires development/test, local DB and explicit confirmation, caller-supplied credentials and a single transaction; reset-pg requires an exact database name and typed confirmation with separate staging approval; m6-env-check no longer embeds credentials or prints OTP/raw verification responses.
- Application OTP redaction code and regression tests already exist. Runtime staging-log verification remains pending; do not treat source tests as proof of clean deployed logs.
- Latest actual branch CI is #1337 on 06cd8fc1e56dc7ef64a141b97b594adc96ffbece, not current head. Flutter passed; lint/typecheck tasks passed with 309 lint warnings and zero errors; Prettier failed on nine files; dependent tests/build/migration jobs skipped. Current head has no Actions run; Vercel Admin SUCCESS, Web PENDING.
- Next: finish controller-to-service-method-to-table operation mapping, then reconcile raw SQL, legacy UAT/staging bootstrap paths and physical DB objects. Keep 114-versus-116 pending protected read-only catalog evidence.
- No tests were run, no CI was triggered, and no staging/shared database action, migration, grant, RLS change, deployment or worker activation occurred. Comprehensive testing remains the final consolidated phase.


## Latest current state — 22 November 2026

- Repository: nabeel2323/scs-platform; branch remediation/phase-0-1-tenant-security; PR #138 open/draft/unmerged to develop.
- Current branch/PR head: `2477a958699a933c71f168d5397f39ca0ab26a34` — security(g002): inventory physical database objects [skip ci].
- G-002 source mapping now covers all 53 API service/worker/poller/dispatcher/executor candidates and all 28 module controllers. The map identifies 44 DB-operation paths, 9 pure helper/provider files, four controllers with direct DB access and six controllers using shared tenant-scope helpers.
- Added standalone CLI/migration/bootstrap mapping and physical database object inventory. The 19-November 114 public r/p count reconciles at source level to 99 Drizzle tables plus 15 non-Drizzle relations: _migration_log, backfill_errors and 13 analytics_events partitions. The historical 116 count remains unresolved.
- Enhanced the read-only DB audit utility to enumerate public relation kinds, owners, RLS/policy state, partition hierarchy/bounds, extension membership and safe _migration_log/backfill_errors summaries. It was not executed.
- Security fixes: local admin creation and destructive reset authorization hardened; M6 diagnostic no longer prints OTP; legacy carrier provider-only webhook rejects ambiguous active credentials. Focused webhook tests were added but not run.
- Remaining implementation: standardize/retire legacy M5/M6 UAT/migration scripts, add uniform staging-bootstrap target confirmation, and complete method-level service-to-table ownership predicates. Live API/migration identities and the protected 114-versus-116 catalog audit remain external evidence gates.
- Latest actual Actions run #1337 is on 06cd8fc1e56dc7ef64a141b97b594adc96ffbece, not current head. Flutter passed; lint/typecheck steps passed with 309 warnings and zero errors; Prettier failed on nine files. Current head has no Actions run; Vercel Admin/Web both fail due to provider build-rate-limit. No tests or CI were run for current implementation commits.
- No staging/shared DB command, migration, seed, reset, grant, RLS change, deployment, worker activation, provider call or test execution occurred. Comprehensive testing remains the final consolidated phase.


## Latest implementation checkpoint — 22 November 2026

- Current branch/PR head: `b78ad3137ecc7820e8a4a0c3816a772bff764c3d`, PR #138 open/draft/unmerged to develop.
- Completed G-002 source work: service/worker map (53 candidates), controller-to-service map (28 controllers), direct controller DB and shared scope helper map, CLI/migration/bootstrap map, physical DB object inventory and read-only audit enhancement.
- Legacy M5/M6 UAT and two migration harnesses now require development/test environment and explicit UAT confirmation; local DB/API/Redis URL validation is applied where supplied. All five staging bootstrap scripts require exact staging DB name and a second target-specific approval; package bootstrap preflight runs before seed writes.
- Carrier webhook provider-only legacy route now rejects ambiguous active credentials; focused tests are committed but not run.
- Next: method-level service-to-table owner predicate mapping and worker/outbox/system context review. Live API/migration identities and protected 114-versus-116 catalog evidence remain external read-only gates.
- Current head has no Actions run; Vercel Admin/Web fail due to provider build-rate-limit. No tests were run, no CI was triggered, and no staging/shared DB action occurred.


## Latest implementation checkpoint — 22 November 2026

- Current branch/PR head: 9d3eaa8f961f2a718f1840b08c8e37dc113ea636. PR #138 is open, draft and unmerged from remediation/phase-0-1-tenant-security to develop.
- Completed method-level ownership batches: Orders/Payments/Inventory; Catalog/Offers/Taxonomy; Pricing/Merchant/Store Membership.
- Batch 3 fixes: PricingService enforces price-list ↔ variant ↔ product same-store relationships for tier create/update/delete, product-pricing reads and price resolution. Merchant document list/download and organization verification reads now require ACTIVE organization membership. Document upload validates caller activeOrg, ACTIVE org membership, store-to-org ownership and ACTIVE store membership. Organization-scoped store/customer reads receive caller context and revalidate active membership.
- Added merchant-service-tenant-scope.spec.ts and pricing-service-tenant-scope.spec.ts. They are committed but not run.
- Latest commit 9d3eaa8f961f2a718f1840b08c8e37dc113ea636 formats the new tenant-scope specs and pricing imports. No GitHub Actions run is attached to this head. Vercel Admin and Web report FAILURE due to provider build-rate-limit; these are preview-provider statuses, not test results.
- Next method-level implementation batch: Returns/Disputes/Reviews. Then carrier/shipping, followed by worker/outbox/bootstrap/system contexts.
- No tests/CI, database connections/queries/writes, migrations, grants, RLS changes, staging actions, deployments, worker activation or provider calls occurred. Full testing remains deferred to the consolidated final phase.


## Latest implementation checkpoint — 22 November 2026 (worker/system context)

- Repository: nabeel2323/scs-platform. Branch: remediation/phase-0-1-tenant-security. PR #138 remains open, draft, unmerged, targeting develop.
- Latest source implementation head before this project-memory refresh: 311ec402b4e5f908b01fd3a57137701f7a2f2a30.
- Completed the bounded G-002 method-level batches: Orders/Payments/Inventory; Catalog/Offers/Product Governance/Taxonomy; Pricing/Merchant/Store Membership; Returns/Disputes/Reviews/financial controls; Carrier/Shipping/Webhook; and worker/outbox/bootstrap/operator/system contexts.
- Additional worker/system fixes: return-expiration claim and escalation now lock and validate the live lease at the mutation boundary; manual escalation requires platform authority; pilot allowlist writes verify organization existence and store→organization ownership; WorkerLeaseService treats expiry as loss of ownership for renewal, liveness, poll bookkeeping and release.
- P13 alert delivery now uses an atomic SENDING claim with stale-claim recovery. The ON CONFLICT DO NOTHING insert path checks RETURNING before attempting delivery. Migration 0073 updates the open-alert index to include SENDING.
- Focused regression tests were added for return worker fencing, pilot allowlist ownership, alert delivery concurrency and lease-expiry fencing. None were executed. All tests remain reserved for the consolidated final testing phase.
- The generic OutboxDispatcher is still a log-only sink, not a configured event-bus publisher. This is an explicit functional limitation; do not claim external delivery or introduce a broker without a separate architecture decision.
- Latest head has no GitHub Actions check runs. Vercel Admin and Web statuses fail because the provider is rate-limited for 24 hours; these are not application test results.
- No migration was applied, no staging/shared DB was accessed, no RLS/grant/DB identity change was made, no deployment or worker activation occurred, and no external provider call was made.
- Remaining protected gates: live API/migration role identities, the unresolved 114-versus-116 physical relation count, transaction-context/RLS architecture review, and consolidated testing/CI/release verification.


## Latest implementation checkpoint — 22 November 2026 (merchant pricing + order presentation)

- Repository: nabeel2323/scs-platform. Branch: remediation/phase-0-1-tenant-security. PR #138 remains open, draft, unmerged, targeting develop.
- Latest source head: adbc386470e37329e8357be9908b4bfbe6c6fee0.
- Implemented UX-012: mobile merchant pricing list/detail surfaces; create/update/activate price lists; create/update/delete quantity tiers; product/variant selection; price-list selection in offer creation; preflight that a matching variant tier covers the offer MOQ; linked price-list navigation from offer detail. Read/write affordances use merchant:pricing:read/write and backend store ownership checks remain authoritative.
- PricingService.listTiersByVariant now requires storeId for all query paths and joins priceLists to filter to the variant's owning store. Controller supplies the store resolved from the variant; the internal product-pricing resolver passes its store context. This closes an unscoped cross-list read path.
- Implemented UX-013: Admin order detail now joins product title, variant title and SKU; Admin UI displays those labels instead of opaque product/variant IDs, with UUID fallback. No permission broadening.
- Focused tests added for mobile pricing route permission, price tier label enrichment, variant tier store scope and admin order item labels. Not executed; full test campaign remains deferred to the end of implementation.
- Source-level G-002 method mapping is complete for the bounded API service/worker/operator families. Protected live runtime identity evidence, 114-versus-116 physical relation reconciliation and transaction-context/RLS architecture remain open. Do not add a global request transaction interceptor or enable RLS before those gates.
- Latest exact-head GitHub Actions check-runs: none. Vercel Admin and Web statuses fail with Deployment rate limited — retry in 24 hours; these are preview-provider failures, not test results.
- No migrations applied, no shared/staging DB action, no grants/RLS changes, no deployment, no worker activation and no external provider calls.
- Next implementation work: continue UX-010 source re-audit across remaining Admin/Web/Mobile screens, recording only concrete contract-backed gaps. UX-007 support ticket scope and UX-008 geospatial/location policy remain blocked on product decisions; generic OutboxDispatcher remains log-only pending an event-bus decision.


## Product Studio save-flow checkpoint — 22 November 2026

- Source baseline before this checkpoint: `3adb376515137bf49da4b44699e1b3c731389504`. The grouped source/documentation commit advances the branch; resolve the resulting SHA from GitHub.
- UX-015 fixes the Product Studio Offer-step transition: failed product persistence no longer advances; product/variant persistence is separated from final commercial-offer creation; retries skip already-persisted variant SKUs; and Next is disabled during saving.
- Added focused web helper tests for failed-save blocking, required identity, successful advance, in-flight blocking and already-created product behavior. Not executed; full testing remains reserved for the consolidated campaign.
- UX-005 is confirmed implemented in current source: StepOffer already uses the selected store's active warehouse selector. The old inventory statement about a raw warehouse-ID input was historical and has been corrected.
- PR #138 remains open/draft/unmerged. No merge, deployment, database mutation, migration application, grant/RLS change, worker activation or provider call occurred.


## Buyer cart UX-016 checkpoint — 22 November 2026

- Fixed cart mutation feedback/recovery: quantity, remove and clear operations now serialize through a shared helper, display API failures and always release pending state. Controls have accessible labels and pending feedback; promo and checkout are gated during mutations.
- Cart reads no longer turn a double read failure into a false empty-cart state. The last successful cart is retained and a retryable error is shown.
- Added focused web tests for successful refresh, failure feedback and pending cleanup. Not executed; full validation remains deferred.
- Source baseline before documentation sync: `c04b722528d70c1c85261b5d160f14ad422b1f64`; grouped docs commit advances branch. PR #138 remains open/draft/unmerged.


## Admin returns UX-017 checkpoint — 22 November 2026

- Fixed retry and stale-request handling on the Admin returns queue. Filter requests are versioned so an older response cannot replace the current filter result; failed reads show a retryable error rather than an empty queue.
- Return detail now uses shared loading, retryable error and not-found components. The load callback returns a promise and is awaited by the escalation resolution path.
- Added focused queue/detail retry tests; not executed. Source baseline before docs sync: `d581d7b649139b04be62f1fbe7fed72cc6a11546`; this documentation commit advances the branch.
- PR #138 remains open/draft/unmerged. No database, migration, deployment, worker activation or grant/RLS action occurred.
