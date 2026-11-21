# SCS Platform — Current State

**Checkpoint date:** 21 November 2026  
**Repository:** [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform)  
**Branch:** remediation/phase-0-1-tenant-security  
**Last inspected branch head before this checkpoint reconciliation:** 148cdca4f8bef1cdeca02fc3c0fa88bd5d621052  
**Current PR:** [#138 — Remediation Phase 0–1](https://github.com/nabeel2323/scs-platform/pull/138), open and draft.

> This is a dated checkpoint. At the beginning of every new session, re-fetch the live branch head, PR, commits and CI. This checkpoint-documentation update itself advances the branch; resolve its exact SHA from GitHub rather than assuming the SHA above is still HEAD.

## Repository and product

SCS Platform is a B2B-first multi-merchant commerce and supply marketplace. The monorepo contains a NestJS modular-monolith API, Next.js buyer/merchant web application, Next.js admin console, Flutter mobile application, shared TypeScript contracts/packages, PostgreSQL 16/PostGIS, Redis and CI/deployment infrastructure.

## GitHub checkpoint

| Item                                 | Last inspected value                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| Repository                           | nabeel2323/scs-platform                                                      |
| Branch                               | remediation/phase-0-1-tenant-security                                        |
| Last inspected PR head               | 148cdca4f8bef1cdeca02fc3c0fa88bd5d621052                                     |
| Last inspected commit                | docs(project): refresh SCS project starting point                             |
| PR #138                              | Open; draft; not merged                                                      |
| PR base                              | develop at f74eb588cc58fc99b105e749d39dbfbacb4f9775                          |
| Latest completed CI at checkpoint    | [#1184](https://github.com/nabeel2323/scs-platform/actions/runs/44858627846) |
| CI #1184 tested SHA                  | fe675e76a8cace78ac2513da08118dd9c7527428                                     |
| CI #1184 status                      | Failed at changed-file Prettier gate; not a full verification                |

## Current remediation status

| Area                                 | Status                   | Meaning                                                                                                                                                                            |
| ------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-001 — merchant offer authorization | **PARTIAL**              | Merchant role gates, tenant checks and scope-first offer-existence confidentiality are implemented with focused regression tests. Exact-head CI, remaining acceptance evidence and independent review remain. |
| G-002 — database access/RLS          | **IN PROGRESS**          | Read-only source/schema work exists. Actual staging API/migration identities, protected staging audit, per-table access predicates and reviewed least-privilege/RLS design remain. |
| Phases 0–5                           | **IN PROGRESS**          | See the authoritative progress tracker for phase and finding details.                                                                                                              |
| Phase 6                              | **NOT STARTED**          | Consolidated full verification and release go/no-go campaign has not begun.                                                                                                        |
| PR #138                              | **DRAFT — DO NOT MERGE** | Not release authorization.                                                                                                                                                         |

The complete finding register, phase dashboard and technical evidence live in [IMPLEMENTATION-PROGRESS.md](../docs/remediation/IMPLEMENTATION-PROGRESS.md). The detailed acceptance criteria and release gates live in [IMPLEMENTATION-PLAN.md](../docs/remediation/IMPLEMENTATION-PLAN.md).

## Formatter and verification evidence

- CI #1184 tested PR head fe675e76a8cace78ac2513da08118dd9c7527428 and failed only the changed-file Prettier gate for project-memory/RELEASE-AND-CI-STATUS.md and project-memory/WORK-LOG.md. ESLint reported 0 errors (311 warnings), TypeScript passed and Flutter passed. API unit/coverage, PostgreSQL integration, migration, Web/Admin, boundary, build/container and contract jobs were skipped; staging and k6 were not run.
- Formatter run #15 completed successfully and corrected the handover Markdown. Cleanup commit f1cb7c7467c0fee6c829eec5fe557e3734c9c275 removed the temporary formatter and the resulting tree was checked for its absence.
- Later helper-workflow checkpoint commits were cleaned up; the final branch tree contains no temporary formatter workflow.
- CI #1187–#1189 were cancelled during successive helper/checkpoint commits. CI #1190 was queued on an intermediate helper commit and is not exact-head verification for the current G-001 source/test changes.
- G-001 scope-first confidentiality implementation commits: dd52aaf (service), bca32b0 (controller), 39a0437 (controller tests), a1602bc (service tests). Focused API tests and exact-head CI remain pending.

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
