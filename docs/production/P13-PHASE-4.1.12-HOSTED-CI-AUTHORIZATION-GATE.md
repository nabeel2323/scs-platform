# P13 Phase 4.1.12 — Hosted-CI Authorization Gate

**Phase:** 4.1.12 | **Date:** 2026-10-16 | **Branch:** develop | **HEAD:** ed6c30f

> **STATUS: HANDOFF ONLY.** Nothing in this document has been executed. No staging, no commit, no push, no PR, no merge, no deploy, no pilot activation. Hosted CI may proceed **only after explicit authorization from the user** for the remote action.

---

## 1. Intended Branch and HEAD

- **Branch:** `develop` — **HEAD:** `ed6c30f` ("test(migrations): verify existence of migration 0062") — the parent of the proposed release-candidate commit.

Pre-flight re-verification (run before staging; every value must match, otherwise STOP):

```powershell
cd C:\TAIF\scs-platform
git branch --show-current                        # expect: develop
git log -1 --format="%h %s"                      # expect: ed6c30f test(migrations): verify existence of migration 0062
(git status --porcelain | Measure-Object -Line).Lines
# expect: 129 (25 modified + 88 docs + 10 source/infra entries + 5 probes + 1 scratch dir).
# Acceptable variance: additional scratch/session artifacts only — never tracked files.
```

---

## 2. Exact Proposed Release-Candidate File List

Defined in `P13-PHASE-4.1.12-RELEASE-CANDIDATE-MANIFEST.md`:

- §2 — 25 modified tracked files (exact paths)
- §3 — 27 untracked source / CI / deployment / migration files (exact paths)
- §4 — 88 phase-report files at execution time (three disjoint globs)
- **Total expected staged: 140.** Do not widen scope at commit time; if anything new appears, stop and reconcile.

---

## 3. Proposed Commit Message

Manifest §10 verbatim. Delivery: write the exact content to `.m73b6-scratch\p4112-commit-msg.txt` and commit with `git commit -F` (see §7). Subject: `feat(p13): operational readiness, financial isolation, CI gates`.

---

## 4. Required CI Jobs (ci.yml — push to develop)

| Job | What it does | Expected outcome |
|-----|--------------|------------------|
| `lint` | Lint & Typecheck | GREEN (local: 0 errors / 296 warnings) |
| `boundary-lint` (E6) | Boundary rules | GREEN |
| `test-unit` | Unit tests + coverage gates | GREEN (local: 279/279) |
| `test-integration` | postgres suites on `postgis/postgis:16-3.4` + `redis:7-alpine` services | **Expected RED with exactly 1 failure: AL-17** (no `P13_OPS_ALERT_WEBHOOK_URL` in CI; fail-closed). Any other failure is a genuine regression → STOP. |
| `migration-gate` | Builds `scs-ci-postgres:ci` (pg_partman) and enforces the full 63-file apply | GREEN (fresh 63/63 + idempotent verified locally) |
| `test-contract` | Contract spec + codegen | GREEN |
| `build` | Full turbo build | GREEN (local: 6/6) |
| `container-build` | Container Build & Smoke Test (30-min timeout): builds `scs-api:ci-test` via `infra/deploy/api.Dockerfile` from context `.` (docker/build-push-action@v5), boots with `P13_WORKER_ENABLED=false` / `P13_PILOT_MODE=legacy`, verifies non-root | GREEN expected; Linux-hosted run is the arbitration |
| `mobile` | flutter analyze + test | GREEN |
| `k6-smoke` | `main`-branch only | Not part of the develop push run |

---

## 5. Known-Red Consequence — Decision Required at Authorization

`test-contract`, `build`, and `container-build` all declare `needs: [test-unit, test-integration]`. GitHub Actions **skips** dependent jobs when a needed job fails. Therefore:

- **Path A (recommended):** before the authorized push, add a CI-local webhook receiver so AL-17 can legitimately pass inside `test-integration` (e.g., configure `P13_OPS_ALERT_WEBHOOK_URL` to a receiver started by the CI job). This is a code/test change — a new authorized work item with re-verification — not executable during this preflight phase. Enables a fully green run that arbitrates **all** gates, including container-build.
- **Path B:** push as-is with the documented known-red. `test-integration` fails on AL-17 → `test-contract`, `build`, `container-build` are **skipped**. The hosted run then arbitrates lint/unit/integration/migration only; the container gate remains NOT RUN until a later green run.
- **Prohibited:** weakening or skipping AL-17, adding `continue-on-error`, removing the test, or using `[skip ci]`.

The user must pick A or B when granting authorization.

---

## 6. Failure-Handling Instructions (during the hosted run)

1. Triage: capture the run URL, job, failing step, and first error block; attach to the run record.
2. Re-run at most once, and only for suspected infra flake (service-container startup races).
3. The **only** acceptable red is `test-integration` with exactly one failure, AL-17 — and only under Path B. Anything else is a genuine regression: stop, triage, report back before any release decision.
4. Never `push --force`, never bypass branch protection, never amend pushed history, never weaken tests to force green.
5. Report per-job outcomes back before any release decision is recorded.

---

## 7. Exact Commands for a Future Authorized Commit and Push

**NOT EXECUTED. Run only in the order below, only after explicit user authorization, and only if §2 counts match.**

```powershell
# ===== FUTURE AUTHORIZED SEQUENCE — DO NOT RUN WITHOUT EXPLICIT USER AUTHORIZATION =====
cd C:\TAIF\scs-platform

# 0. Re-verify state (§1 commands). STOP on any mismatch.

# 1. Write the commit message file: .m73b6-scratch\p4112-commit-msg.txt
#    with the EXACT content of Manifest §10.

# 2. Stage exactly the approved list — run Manifest §11 groups A through L.
#    (No `git add -A` under any circumstances.)

# 3. Review the staged diff — run Manifest §12 commands:
#    staged count must be 140; the scratch-guard Select-String must return nothing.

# 4. Commit
git commit -F .m73b6-scratch\p4112-commit-msg.txt

# 5. Push — THE REMOTE ACTION. Requires explicit user authorization.
git push origin develop

# 6. Post-run: record the Actions run URL and per-job outcomes in the next phase report.
```

---

## 8. Explicit Boundary

- This handoff authorizes nothing by itself. The push is the only remote action contemplated; even it requires the user's explicit authorization, plus the Path A/B decision from §5.
- No PR, no merge, no deployment, no pilot activation, no external webhook activation, no production financial data changes.
- Safe defaults remain enforced everywhere: worker disabled, pilot mode `legacy`, pilot allowlist empty, external webhook delivery disabled — verified in `p13-ops.config.ts`, the `ci.yml` smoke environment, and `infra/deploy/.env.production.example`.

---

## 9. Phase 4.1.13 Addendum (2026-10-16) — AL-17 Resolved, Counts Reconciled

Phase 4.1.13 implemented **Path A in its minimal form** (no CI receiver service, no workflow change): a disposable in-process loopback receiver inside `p4-operational-readiness.postgres.spec.ts` now proves the full signed round trip, plus three new fail-closed tests (AL-17a/b/c). Local six-suite result: **154 passed / 0 failed / 0 skipped**. The deltas below supersede the corresponding lines of §§1–7:

| Item | 4.1.12 value | Now |
|------|--------------|-----|
| §1 porcelain expectation | 129 lines | **135** (25 modified + 94 docs + 10 source/infra entries + 5 probes + 1 scratch dir); acceptable variance: additional scratch artifacts only — never tracked files |
| §2 expected staged total | 140 (docs 88) | **146** (docs 94) — see `P13-PHASE-4.1.13-UPDATED-RELEASE-CANDIDATE-MANIFEST.md` |
| §3 commit message | 4.1.12 Manifest §10 via `p4112-commit-msg.txt` | **Updated manifest §9** via `p4113-commit-msg.txt` (adds the AL-17 verifying-sink bullet and the 154/154 verification line) |
| §4 `test-integration` expected outcome | RED with exactly AL-17 | **GREEN** (154/154 locally, incl. the signed round trip) |
| §5 decision required at authorization | Path A or Path B | **RESOLVED — Path A delivered test-side**; `test-contract`/`build`/`container-build` are expected to EXECUTE; no known-red choice remains |
| §7 staged-count check | 140 | **146**; scratch guard refined to `'m73b6-scratch|test-token|\.p41-|p41-p4suites'` (bare `p41-` would false-positive on `p41-deployment-invariants.spec.ts`, which is legitimately part of the RC) |

Everything else in this gate — the authorization requirement, failure handling, prohibited actions, and safe defaults — is unchanged. Hosted CI remains **NOT RUN**.
