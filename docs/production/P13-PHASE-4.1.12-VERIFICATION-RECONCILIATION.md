# P13 Phase 4.1.12 — Verification Reconciliation

**Phase:** 4.1.12 | **Date:** 2026-10-16 | **Branch:** develop | **HEAD:** ed6c30f

---

## 1. Method

Every result below was re-run fresh in this session without modifying any test to obtain it. One environment repair was required: the Windows pnpm virtual-store corruption recurred (`es-module-lexer` missing from `vite-node@2.1.9`, breaking vitest startup) and was repaired with `pnpm install --force --offline` (1m 7.6s relink; the `cpu-features` optional-native failure is the known-ignorable one). The repair changed no repository file and no test.

Databases used: `ci-p4111-pg` (port 5434, pg_partman-enabled CI image) for fresh-migration runs; the dev `scs-postgres` container (postgis:16-3.4) for the missing-extension failure test (throwaway DB, dropped afterwards; container stopped and state restored).

---

## 2. Results Matrix

| # | Check | Fresh Result | Status |
|---|-------|--------------|--------|
| 1 | Contracts build | exit 0 | **PASS** |
| 2 | Typecheck | 9/9 packages, exit 0 | **PASS** |
| 3 | Lint | 0 errors / 296 warnings, exit 0 | **PASS** |
| 4 | Turbo build | 6/6 (4 cached, 2 executed), exit 0 | **PASS** |
| 5 | P13 unit tests | 279/279 across 9 files, exit 0 | **PASS** |
| 6 | Integration suites | 151 executed: 150 passed, **1 FAILED (AL-17)**, 0 skipped; exit 1 | **FAIL** — expected fail-closed; see §4 |
| 7 | Fresh migration | 63/63 applied on genuinely fresh DB, exit 0 | **PASS** |
| 8 | Migration idempotency | 2nd run: "all 63 migration(s) already applied", exit 0 | **PASS** |
| 9 | Missing-extension behavior | explicit failure at 0013, exit 1, on image without pg_partman | **PASS** (failing is the correct behavior) |
| 10 | Post-migration DB state | see §3 | **PASS** |
| 11 | 13 business-safety invariants | spot-verified in code | **PASS** — see §6 |
| 12 | CI workflow prerequisites | workflow reviewed; local prerequisites verified | **PASS** (local only) — see §7 |
| 13 | Hosted CI run | never executed | **NOT RUN** |
| 14 | Container build in intended Linux environment | never executed | **NOT RUN** |

**BLOCKED: none.** No financial invariant failed; no tenant isolation regression; no secret found.

---

## 3. Fresh Migration & Idempotency Evidence

- Created empty database `scs_p4112_fresh` in `ci-p4111-pg`; ran `pnpm --filter @scs/api run db:migrate:ci` (script-file execution — inline-connection-string commands are unreliable in this harness; documented in the Baseline Report).
- Run 1: **63/63 applied**, exit 0. Run 2: `Database up-to-date — all 63 migration(s) already applied`, exit 0.
- Post-state queries: `MIGRATIONS = 63`; `pg_partman 5.5.0` enabled; `pg_trgm 1.6`; partman config `public.analytics_events | 1 | mon`; **112 public tables**; all key tables present — `worker_leases`, `ops_alerts`, `ops_controls`, `ops_control_audit`, `p13_pilot_allowlist`, `return_requests`, `settlement_adjustments`, `commission_reversals` (the 5 ops tables come from migration 0063).
- `postgis 3.6.4` is AVAILABLE in the CI image but **not enabled**; no migration requires it; `GEOG_TABLES = 0`. Informational — not a gate.
- Missing-extension test: throwaway DB `scs_p4112_nopartman` inside the dev `postgis:16-3.4` image (no pg_partman) → the CI runner fails **explicitly at migration 0013, exit 1** — silent-skip is impossible. Throwaway DB dropped; container stopped; environment restored.

---

## 4. AL-17 — Honest Classification

**AL-17 is FAILED. It is not a passing test, and it is not skipped.**

- The test asserts delivery status `SENT`; it received `FAILED`, because `P13_OPS_ALERT_WEBHOOK_URL` is unset — the ops-alert sink disables itself (`p13-ops.config.ts` nulls the URL when no signed sink is configured) and the delivery attempt fails.
- The runtime behavior under test **is** the fail-closed design working: with no receiver configured the system must not claim successful delivery. The assertion, however, is red and counts as a failure in every count in this report.
- **Hosted-CI impact:** `ci.yml` configures no `P13_OPS_ALERT_WEBHOOK_URL` either, so the hosted `test-integration` job will exit 1 with exactly this one failure. This is documented as the expected known-red outcome in the Hosted-CI Authorization Gate, with the resolution options recorded there. Weakening, skipping, or asserting-around AL-17 to force green is prohibited.

---

## 5. The 16 Skipped Tests (Phase 4.1.11) — Reconciled, Not Concealed

- The 4.1.11 integration batch reported **16 skipped**. Root cause established: batch-level hook timeouts (environmental), **not** conditional test gating.
- Evidence: grep across all 6 integration suites for `skipIf|.skip(|todo(` → **0 hits**. No conditional skip exists in the test code.
- This session's single full batch ran **151 executed, 0 skipped**. The 0-skip result supersedes the 4.1.11 artifact; the skips were never intentional gating and are not being hidden.

---

## 6. Business-Safety Invariants — 13/13 Spot-Verified

| # | Invariant | Evidence |
|---|-----------|----------|
| 1 | Worker disabled by default | `p13-ops.config.ts` `workerEnabled: false`; `P13_WORKER_ENABLED` is an explicit opt-in |
| 2 | Pilot mode legacy default | `p13-ops.config.ts` `pilotMode: 'legacy'` |
| 3 | Worker escalates only | `return-expiration.worker.ts`: REQUESTED→ESCALATED only; "never approves, rejects, refunds, or expires a return on SLA elapse alone" |
| 4 | Lease exclusivity with epoch fencing | `worker-lease.service.ts`; worker re-checks the lease fence per item |
| 5 | Pause control honored | worker checks pause state before each item |
| 6 | Unsigned webhook delivery suppressed | sink secret < 32 chars → URL nulled (`p13-ops.config.ts`) + `UnsignedDeliverySuppressedError` (`ops-alert-signing.ts`) |
| 7 | Pilot allowlist enforced on return creation | `returns.service.ts` pilot entry gate |
| 8 | Financial tenant isolation fail-closed | `returns.controller.ts`: all 11 financial endpoints route through `financialOrgScope()`; missing scope counts as a denial, never an allow |
| 9 | Posting blocked until FX resolved | `settlement-adjustment.service.ts` allow-listed posting; unknown/FAILED/PENDING_REVIEW values rejected |
| 10 | Creator cannot self-approve; dual approval unchanged | self-dealing prevention active in approval flow |
| 11 | JWT secret gate | `env-gate.ts`: `MIN_SECRET_LENGTH = 16`; dev default rejected outside dev via `assertProductionConfig()` at boot (`main.ts`) |
| 12 | Audit loss → alert, not assumption | `audit.service.ts` counters on audit write success/failure; `commission-reversal.service.ts` failure/duplicate counters with error rethrown unchanged |
| 13 | Deployment safe defaults | `infra/deploy/.env.production.example`: worker deliberately unset, `P13_EXPECTED_WORKER_COUNT=0`, `P13_PILOT_MODE=legacy`, webhook URL empty, placeholders only |

These hold in the diff itself (Change Scope Audit §6.3): the three service defects fixed were making documented policy unenforceable; fixing them restores the locked policy.

---

## 7. CI Workflow Prerequisites & Expected Container-Build Behavior

- **Trigger:** push / pull_request to `main` / `develop`; concurrency group with cancel-in-progress.
- **Chain:** `lint` (Lint & Typecheck) gates `boundary-lint`, `test-unit`, `test-integration`, `migration-gate`; `test-contract` and `build` need `[test-unit, test-integration]`; `k6-smoke` runs on `main` only; `mobile` (flutter analyze + test) independent.
- **test-integration:** ubuntu-latest with `postgis/postgis:16-3.4` service (plus redis service).
- **migration-gate:** builds `scs-ci-postgres:ci` from `infra/deploy/ci-postgres.Dockerfile` (pg_partman present) and applies **all 63** migrations against localhost:5433 — enforcing, no `continue-on-error`.
- **container-build (expected behavior):** builds the api image from build context `.` (protected by `.dockerignore`), boots a smoke container with safe defaults — `P13_WORKER_ENABLED=false`, `P13_PILOT_MODE=legacy`, CI-labelled test JWT secret — verifies the worker/pilot status echoes and the **non-root user**, then tears down.
- Local prerequisites verified (Docker, base images, migration chain, `.dockerignore` present, Node 22 alignment via `.nvmrc`). **The full hosted run is NOT RUN** and must arbitrate the Linux-environment gates.

---

## 8. Status Summary

- **PASS:** checks 1–5, 7–12 of the matrix.
- **FAIL:** integration suite exit code — exactly one failure, AL-17, expected fail-closed with no receiver; known-red documented for hosted CI.
- **NOT RUN:** hosted CI; container build in the intended Linux environment.
- **BLOCKED:** none.
- Local results are necessary but not sufficient: the complete hosted-CI run must determine whether the full build, integration, migration, and container gates pass in the intended Linux environment.
