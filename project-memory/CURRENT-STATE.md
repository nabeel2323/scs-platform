# SCS Platform — Current State

**Checkpoint date:** 21 November 2026  
**Repository:** [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform)  
**Branch:** remediation/phase-0-1-tenant-security  
**Last inspected branch head before this current-state refresh:** fb805ddbb48aab4575503900c557ecb371d0cb32  
**Current PR:** [#138 — Remediation Phase 0–1](https://github.com/nabeel2323/scs-platform/pull/138), open and draft.

> This is a dated checkpoint. At the beginning of every new session, re-fetch the live branch head, PR, commits and CI. This checkpoint-documentation update itself advances the branch; resolve its exact SHA from GitHub rather than assuming the SHA above is still HEAD.

## Repository and product

SCS Platform is a B2B-first multi-merchant commerce and supply marketplace. The monorepo contains a NestJS modular-monolith API, Next.js buyer/merchant web application, Next.js admin console, Flutter mobile application, shared TypeScript contracts/packages, PostgreSQL 16/PostGIS, Redis and CI/deployment infrastructure.

## GitHub checkpoint

| Item                                 | Last inspected value                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| Repository                           | nabeel2323/scs-platform                                                      |
| Branch                               | remediation/phase-0-1-tenant-security                                        |
| Last inspected PR head               | fb805ddbb48aab4575503900c557ecb371d0cb32                                     |
| Last inspected commit                | docs(ci): record G-001 correlated query verification state                          |
| PR #138                              | Open; draft; not merged                                                      |
| PR base                              | develop at f74eb588cc58fc99b105e749d39dbfbacb4f9775                          |
| Latest completed CI at checkpoint    | #1184 (historical; predates current source/test head) |
| CI #1184 tested SHA                  | fe675e76a8cace78ac2513da08118dd9c7527428                                     |
| CI #1184 status                      | Failed at changed-file Prettier gate; not a full verification                |

## Current remediation status

| Area                                 | Status                   | Meaning                                                                                                                                                                            |
| ------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-001 — merchant offer authorization | **PARTIAL**              | Merchant role gates, scope-first offer confidentiality and ACTIVE-store buyer visibility are implemented with focused regression tests. Exact-head CI, remaining acceptance evidence and independent review remain. |
| G-002 — database access/RLS          | **IN PROGRESS**          | Read-only source/schema work exists. Actual staging API/migration identities, protected staging audit, per-table access predicates and reviewed least-privilege/RLS design remain. |
| Phases 0–5                           | **IN PROGRESS**          | See the authoritative progress tracker for phase and finding details.                                                                                                              |
| Phase 6                              | **NOT STARTED**          | Consolidated full verification and release go/no-go campaign has not begun.                                                                                                        |
| PR #138                              | **DRAFT — DO NOT MERGE** | Not release authorization.                                                                                                                                                         |

The complete finding register, phase dashboard and technical evidence live in [IMPLEMENTATION-PROGRESS.md](../docs/remediation/IMPLEMENTATION-PROGRESS.md). The detailed acceptance criteria and release gates live in [IMPLEMENTATION-PLAN.md](../docs/remediation/IMPLEMENTATION-PLAN.md).

## Formatter and verification evidence

- CI #1184 is historical and tested fe675e76a8cace78ac2513da08118dd9c7527428, not the current branch head. The latest branch commit `a6c4b924f1899717c745d41fc6a8a1b4b7dc02c9` has no associated GitHub Actions workflow run returned by the commit-workflow lookup and no combined status contexts. Vercel web/admin rate-limit failures were reported on the earlier head; they are external preview-provider failures, not application CI results. Exact-head CI remains pending.
- Formatter run #15 completed successfully and corrected the handover Markdown. Cleanup commit f1cb7c7467c0fee6c829eec5fe557e3734c9c275 removed the temporary formatter and the resulting tree was checked for its absence.
- Later helper-workflow checkpoint commits were cleaned up; the final branch tree contains no temporary formatter workflow.
- CI #1187–#1190 and #1207 were cancelled during successive helper/checkpoint commits. CI #1210 is pending on pre-refresh head fb805dd with no jobs started yet. The latest completed CI remains #1184, which predates the G-001 changes; the current-state refresh will require a new exact-head run.
- G-001 implementation commits: dd52aaf (scope-first service), bca32b0 (controller), 39a0437 (controller tests), a1602bc (service tests), 512dc0e (initial ACTIVE-store filter), 6ff59aa (buyer visibility tests), e039715 (correlated SQL EXISTS refinement) and 5cdeb09 (query-shape tests). Focused API tests and exact-head CI remain pending.

## Historical CI #1176 failure

[CI #1176](https://github.com/nabeel2323/scs-platform/actions/runs/44856823290) tested 1c1cf2f5032cf789789f0efc527e3c976a9ceb78 and failed only at changed-file Prettier for the G-001 controller test and progress tracker. Lint completed with 0 errors (311 warnings), typecheck succeeded and Flutter analysis/tests passed. API unit/coverage, PostgreSQL integration, migration, Web/Admin, boundary, build/container and contract jobs were skipped because the lint job failed. Formatter run #14 corrected the two files.

## Immediate next actions

1. Verify the exact current PR head with a fresh CI run. The latest completed CI (#1184) predates the new G-001 code and is not verification.
2. Confirm the focused offer service/controller unit tests pass, then inspect downstream integration, migration, build, boundary and contract jobs on the same exact SHA.
3. Complete remaining G-001 acceptance dimensions: owner/staff, revoked membership, store lifecycle/inactive-store policy, buyer, foreign merchant, analytics/trend and privileged-admin behavior.
4. Prepare an independent security-review package. Keep G-001 PARTIAL until the complete acceptance evidence and reviewer findings are recorded.
5. Continue G-002 only within the read-only/authorized evidence boundary in DECISIONS-AND-CONSTRAINTS.md.

## Safety reminder

PR #138 must remain open and draft. Do not merge or deploy it, bypass protected staging approval, change shared database grants/default ACLs, apply migration 0070, enable RLS, change staging/production configuration, perform staging writes or activate workers without the explicitly required authorization.


## Live reconciliation — 21 November 2026

- The branch advanced from `e039715b8f05cc3146dddf64d476df4aabe43868` with a G-001 controller test expansion and synchronized remediation tracker/work-log entries. The pre-refresh branch head inspected here is `a6c4b924f1899717c745d41fc6a8a1b4b7dc02c9`.
- Supported merchant roles are now exercised across list, analytics, trend and offer-detail reads; FINANCE is included in the negative privileged-read matrix; foreign-organization trend access is explicitly denied before service access.
- This test-only increment is not yet test-verified. The latest completed CI remains historical #1184; no Actions run or combined status was returned for the inspected head. Obtain exact-head CI before claiming verification.
- PR #138 remains open and draft. G-001 remains PARTIAL; G-002 remains IN PROGRESS. All staging, shared-database and deployment restrictions remain unchanged.
