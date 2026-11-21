# SCS Platform — Current State

**Checkpoint date:** 21 November 2026  
**Repository:** [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform)  
**Branch:** remediation/phase-0-1-tenant-security  
**Last inspected formatted-tree commit before this checkpoint-documentation commit:** 2d416c99700de8b511a7c376085a107cc24a854c  
**Current PR:** [#138 — Remediation Phase 0–1](https://github.com/nabeel2323/scs-platform/pull/138), open and draft.

> This is a dated checkpoint. At the beginning of every new session, re-fetch the live branch head, PR, commits and CI. This checkpoint-documentation update itself advances the branch; resolve its exact SHA from GitHub rather than assuming the SHA above is still HEAD.

## Repository and product

SCS Platform is a B2B-first multi-merchant commerce and supply marketplace. The monorepo contains a NestJS modular-monolith API, Next.js buyer/merchant web application, Next.js admin console, Flutter mobile application, shared TypeScript contracts/packages, PostgreSQL 16/PostGIS, Redis and CI/deployment infrastructure.

## GitHub checkpoint

| Item                                 | Last inspected value                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| Repository                           | nabeel2323/scs-platform                                                      |
| Branch                               | remediation/phase-0-1-tenant-security                                        |
| Last inspected PR head               | f7f3ff6837f67f17cc00d5129a20f50e608bf3b6                                     |
| Last inspected commit                | docs(project): reconcile handover checkpoint after formatting                |
| PR #138                              | Open; draft; not merged                                                      |
| PR base                              | develop at f74eb588cc58fc99b105e749d39dbfbacb4f9775                          |
| Latest app-authored CI at checkpoint | [#1180](https://github.com/nabeel2323/scs-platform/actions/runs/44858308974) |
| CI #1180 tested SHA                  | f7f3ff6837f67f17cc00d5129a20f50e608bf3b6                                     |
| CI #1180 status                      | Failed at changed-file Prettier gate; not a full verification                |

## Current remediation status

| Area                                 | Status                   | Meaning                                                                                                                                                                            |
| ------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-001 — merchant offer authorization | **PARTIAL**              | Merchant mutation role gate and expanded controller role tests are implemented. Complete tenant/role acceptance evidence and independent security review remain.                   |
| G-002 — database access/RLS          | **IN PROGRESS**          | Read-only source/schema work exists. Actual staging API/migration identities, protected staging audit, per-table access predicates and reviewed least-privilege/RLS design remain. |
| Phases 0–5                           | **IN PROGRESS**          | See the authoritative progress tracker for phase and finding details.                                                                                                              |
| Phase 6                              | **NOT STARTED**          | Consolidated full verification and release go/no-go campaign has not begun.                                                                                                        |
| PR #138                              | **DRAFT — DO NOT MERGE** | Not release authorization.                                                                                                                                                         |

The complete finding register, phase dashboard and technical evidence live in [IMPLEMENTATION-PROGRESS.md](../docs/remediation/IMPLEMENTATION-PROGRESS.md). The detailed acceptance criteria and release gates live in [IMPLEMENTATION-PLAN.md](../docs/remediation/IMPLEMENTATION-PLAN.md).

## Formatter and verification evidence

- [One-time formatter run #14](https://github.com/nabeel2323/scs-platform/actions/runs/44858112060) succeeded on formatter input commit ea77cbb3ff68ba01c94c5fb7ff7bfb7920a8cef9.
- It formatted the new project-memory Markdown, README, remediation plan/progress tracker and G-001 controller test.
- Formatter cleanup commit [2776f97](https://github.com/nabeel2323/scs-platform/commit/2776f97e902f7569afdc08ba75db8109238e9fcf) removed the temporary .github/workflows/format-fix.yml; the resulting tree was checked and the helper was absent.
- CI #1179 on the formatter cleanup commit was cancelled when the subsequent app-authored commit arrived; it is not verification.
- CI #1178 targeted the pre-format input commit ea77cbb3ff68ba01c94c5fb7ff7bfb7920a8cef9 and failed; it is not exact-head evidence for the formatted tree.
- CI #1180 completed with failure on f7f3ff6837f67f17cc00d5129a20f50e608bf3b6. Lint had 0 errors (311 warnings), typecheck succeeded and Flutter passed. Prettier flagged docs/remediation/IMPLEMENTATION-PROGRESS.md, project-memory/RELEASE-AND-CI-STATUS.md and project-memory/WORK-LOG.md; dependent jobs were skipped. Formatter run #15 completed successfully and formatted the three flagged Markdown files. Cleanup commit 2d416c99700de8b511a7c376085a107cc24a854c removed the helper workflow; the resulting tree was checked and the helper is absent. CI #1183 on the cleanup commit has action_required with no jobs; CI #1182 is on the pre-format helper commit and is not verification of the formatted tree. A new app-authored checkpoint commit is being created to trigger full CI on the formatted state.

## Historical CI #1176 failure

[CI #1176](https://github.com/nabeel2323/scs-platform/actions/runs/44856823290) tested 1c1cf2f5032cf789789f0efc527e3c976a9ceb78 and failed only at changed-file Prettier for the G-001 controller test and progress tracker. Lint completed with 0 errors (311 warnings), typecheck succeeded and Flutter analysis/tests passed. API unit/coverage, PostgreSQL integration, migration, Web/Admin, boundary, build/container and contract jobs were skipped because the lint job failed. Formatter run #14 corrected the two files.

## Immediate next actions

1. Inspect the fresh exact-head CI run triggered by this app-authored checkpoint commit. Confirm its SHA and all jobs; do not treat #1182 or #1183 as successful verification.
2. If formatting or other gates fail, fix related issues in one cohesive commit with corresponding documentation updates.
3. Once exact-head CI passes, continue G-001 service/controller tenant acceptance work and prepare the independent-review package.
4. Keep G-001 PARTIAL until an independent reviewer records findings and the full acceptance evidence is complete.
5. Continue G-002 only within the read-only/authorized evidence boundary in [DECISIONS-AND-CONSTRAINTS.md](./DECISIONS-AND-CONSTRAINTS.md).

## Safety reminder

PR #138 must remain open and draft. Do not merge or deploy it, bypass protected staging approval, change shared database grants/default ACLs, apply migration 0070, enable RLS, change staging/production configuration, perform staging writes or activate workers without the explicitly required authorization.
