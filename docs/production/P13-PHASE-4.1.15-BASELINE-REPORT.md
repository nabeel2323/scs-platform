# P13 PHASE 4.1.15 - BASELINE REPORT

Date: 2026-10-16
Phase: 4.1.15 - Container-build workflow repair and hosted-CI re-verification (pre-push preflight)
Repository: c:\TAIF\scs-platform
Prepared by: Qoder agent session

## 1. Source-of-Truth Inputs Read

| Input | State | Key facts consumed |
|---|---|---|
| docs/production/P13-PHASE-4.1.14-FINAL-REPORT.md | Untracked (preserved) | Outcome "COMMIT AND PUSH COMPLETE - HOSTED CI FAILED"; container-build failure carried as blocker |
| docs/production/P13-PHASE-4.1.14-HOSTED-CI-RESULTS.md | Untracked (preserved) | Run #386 (38881220631), job "Container Build & Smoke Test" (116911122701) failed at step "Run deployment invariants spec", exit 127; 8 of 9 applicable jobs green |
| docs/production/P13-PHASE-4.1.14-COMMIT-PUSH-REPORT.md | Untracked (preserved) | Commit 13f2634 staged via manifest groups A-L, pushed ed6c30f..13f2634 fast-forward |
| .github/workflows/ci.yml @ HEAD 13f2634 | Committed | Root cause re-verified from committed bytes (see Workflow-Fix-Report) |

## 2. Repository State Verification (commands and results)

| Check | Command (abridged) | Expected | Actual | Verdict |
|---|---|---|---|---|
| Branch | git branch --show-current | develop | develop | PASS |
| HEAD | git rev-parse HEAD | 13f26340a1ea6ee40a310a239c2cb42d248c258a | 13f26340a1ea6ee40a310a239c2cb42d248c258a | PASS |
| Remote sync | git fetch origin develop; git rev-parse origin/develop | == HEAD | 13f26340a1ea6ee40a310a239c2cb42d248c258a | PASS |
| Tracked modifications | git status --porcelain (non-??) | 0 | 0 | PASS |
| Index | git diff --cached --name-only | empty | empty (0) | PASS |
| Porcelain lines | git status --porcelain | 9 (8 non-scratch + collapsed .m73b6-scratch/) | 9 | PASS |
| Non-scratch untracked | git ls-files --others --exclude-standard filtered | 8 | 8 = 3 x Phase 4.1.14 reports + 5 probes | PASS |
| Preserved artifacts | untracked listing | 4.1.14 reports + probes untouched | unchanged through the phase (FINAL_NS=8 at close) | PASS |

## 3. Reconciliation With Phase Expectations

- Branch and HEAD match the spec exactly; no reconciliation was needed. No reset, clean, stash, rebase, or discard was performed at any point.
- No pre-existing tracked modifications existed, so the working tree before this phase was exactly HEAD 13f2634 plus the 8 untracked non-scratch artifacts, all preserved.
- The Phase 4.1.14 failure record (container-build exit 127 at "Run deployment invariants spec") was re-derived independently from the committed workflow before any edit; the report's classification was not assumed.

## 4. Environment Probed For Local Verification Feasibility

| Item | Result |
|---|---|
| Docker daemon | Up, server 29.1.2 (feasible for full local build + smoke rehearsal) |
| Local Node | v26.4.0 (not used for workflow semantics; workflow pins Node 22 via env.NODE_VERSION) |
| pnpm | 9.15.9 locally, matching env.PNPM_VERSION '9.15.9' in ci.yml |
| gh CLI | Not installed (not required this phase) |
| Existing local images | scs-api:p41-local (36h old) and p41x verification images present; fresh build performed anyway for this phase |

## 5. Status Summary

| Gate | Status |
|---|---|
| Branch/HEAD/tree/index/remote verification | PASS |
| Phase 4.1.14 reports read and preserved | PASS |
| Root-cause inputs confirmed from committed source | PASS |
| Staging | NOT RUN (spec forbids staging before separate authorization) |
| Remote actions | NOT RUN (none performed) |
