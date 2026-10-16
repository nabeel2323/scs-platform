# P13 PHASE 4.1.15 - FINAL REPORT

Date: 2026-10-16
Phase: 4.1.15 - Container-build workflow repair and hosted-CI re-verification (pre-push preflight)
Branch: develop @ 13f26340a1ea6ee40a310a239c2cb42d248c258a (origin/develop in sync; unchanged)

## 1. Outcome Matrix

| Gate | Status | Evidence |
|---|---|---|
| Baseline identity (branch/HEAD/tree/index/remote) | PASS | Baseline-Report section 2 |
| Root cause 1: missing pnpm/Node setup in container-build | PASS (confirmed) | Workflow-Fix-Report section 1; matches 4.1.14 hosted failure (exit 127) |
| Root cause 2: `pnpm --filter @scs/api test -- --run` rejected by pnpm 9.15.9 ("Unknown option: 'run'") | PASS (confirmed) | Workflow-Fix-Report section 2; reproducible locally, platform-independent parser |
| Workflow-only fix applied, correctly ordered | PASS | +10/-1 in .github/workflows/ci.yml; setup at steps 1-2, first pnpm command at step 5 |
| Safety gates preserved (spec unchanged, no continue-on-error, defaults intact) | PASS | Workflow-Fix-Report section 5; LOCAL-VERIFICATION section 2 |
| YAML syntax + structure | PASS | pnpm dlx js-yaml EXIT 0; assert-ci.cjs EXIT 0 |
| Deployment-invariants spec (exact corrected hosted command) | PASS | 36/36, EXIT 0 |
| Lint / Typecheck | PASS | pnpm lint 5/5 EXIT 0; pnpm typecheck 9/9 EXIT 0 |
| Local Docker build equivalent | PASS | 23/23 steps FINISHED, scs-api:ci-test-local |
| Local smoke sequence equivalent | PASS | healthy; healthz/readyz ok; P13 echo false/legacy; whoami=node; cleanup; SMOKE_FAIL_COUNT=0 |
| Diff reconciliation, secret scan, git diff --check | PASS | 1 file (+10/-1); 0 secret hits; --check EXIT 0 |
| Existing work preserved (4.1.14 reports, probes, scratch) | PASS | 8 non-scratch untracked artifacts unchanged; no reset/clean/stash/rebase used |
| Remote actions (stage/commit/push/workflow trigger) | NOT RUN | forbidden this phase without separate authorization |
| Hosted workflow verification | NOT RUN | next gate, requires push authorization |

## 2. Remaining Uncertainty (stated plainly)

- Local checks are Windows/Docker Desktop reproductions with pnpm 9.15.9; they do not reproduce
  GitHub-hosted execution. js-yaml validates YAML syntax, not GitHub's full workflow schema
  (actionlint is not installed locally); the new steps are byte-identical in structure to seven
  job configurations that already run green hosted, which bounds the residual schema risk.
- The hosted runner's actual behavior - including the pnpm cache restore on the new
  `cache: pnpm` step - can only be observed in the next hosted run.
- The smoke rehearsal used the same Dockerfile bytes freshly built locally (tag
  scs-api:ci-test-local vs hosted scs-api:ci-test); image provenance is equivalent in content, not
  bit-identical in metadata.

## 3. Scope Compliance

- Modified: .github/workflows/ci.yml only. No Dockerfile, test, manifest, lockfile, or source
  change was needed; no scope expansion occurred.
- Nothing staged, committed, pushed, merged, deployed, or triggered. No PR created.
- P13_WORKER_ENABLED=false, P13_PILOT_MODE=legacy, empty pilot allowlist, and no production
  webhook activation all hold.
- The five Phase 4.1.15 reports are uncommitted and excluded from the candidate.

## 4. Conclusion

All feasible local checks pass; root causes are confirmed and repaired inside the single workflow
file; the diff and file scope are reconciled; existing work and excluded artifacts are preserved;
no remote action has occurred.

**PRE-PUSH PREFLIGHT COMPLETE - AWAITING EXPLICIT AUTHORIZATION**

Next gate: on explicit authorization, stage exactly `.github/workflows/ci.yml`, commit, push to
`origin develop`, and re-verify the new hosted run. The container gate may be declared passed only
when the full hosted job - image build, deployment-invariants test, disposable service startup,
health/readiness checks, P13 configuration echo proving safe defaults, non-root execution
assertion, and cleanup - succeeds. A successful image build alone is insufficient. Even a fully
green hosted CI run does not itself authorize production deployment, production webhook
activation, worker enablement, pilot activation, or business-policy approval; those remain
separate gates.
