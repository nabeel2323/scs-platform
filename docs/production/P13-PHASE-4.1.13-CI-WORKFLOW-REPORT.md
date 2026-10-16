# P13 Phase 4.1.13 — CI Workflow Report

**Phase:** 4.1.13 | **Date:** 2026-10-16 | **Branch:** develop | **HEAD:** ed6c30f

---

## 1. Investigation Result

`.github/workflows/ci.yml` — `test-integration` job (L105–145): `ubuntu-latest`, `needs: lint`, services `postgis/postgis:16-3.4` (5432) + `redis:7-alpine` (6379), runs `pnpm test:integration` (= `vitest run src/__tests__/integration`, confirmed in `apps/api/package.json` L15) with job env limited to `DATABASE_URL` and `REDIS_URL`. **No `P13_OPS_ALERT_WEBHOOK_URL` / `P13_OPS_ALERT_WEBHOOK_SECRET` is defined anywhere in the workflow** — which is precisely why AL-17 failed in the Phase 4.1.12 hosted-CI expectation.

## 2. Decision: NO workflow change is required

The Phase 4.1.13 receiver is **in-process and self-configuring**: the test starts its own HTTP listener on `127.0.0.1` (OS-assigned ephemeral port) and sets the sender's URL/secret via `process.env` before constructing its `OpsAlertService`. On `ubuntu-latest` binding localhost inside the runner process is unconditionally available; no service container, no port mapping, no workflow secret, no job-level env is needed.

| Requirement | How it is met without touching ci.yml |
|-------------|--------------------------------------|
| Clearly labelled CI-only test secret | Lives in the spec as `P4_TEST_SINK_SECRET` with a test-only comment; nothing added to workflow env or repo secrets |
| No production secrets/URLs/credentials | None introduced anywhere; receiver binds loopback only |
| Production templates unchanged | `infra/deploy/.env.production.example` byte-identical; still placeholder-only, webhook empty |
| Worker/pilot stay off, allowlist empty | `P13_WORKER_ENABLED=false`, `P13_PILOT_MODE=legacy` remain in the container-build smoke env (L367–368); untouched |
| Env vars scoped to the test process | Set and deleted inside each test (`clearSinkEnv()` in `finally`); never job-level |

`.github/workflows/ci.yml` receives **zero new edits in Phase 4.1.13** — it remains exactly the version already carried in the release candidate (25 modified tracked files unchanged).

## 3. Job Dependencies — the gate unlocks

`test-contract`, `build`, and `container-build` all declare `needs: [test-unit, test-integration]`. With AL-17 fixed, a green `test-integration` no longer skips them: the contract, full build, and container-build jobs execute normally on the hosted run. (`k6-smoke` remains `main`-only; `mobile` is independent.)

The Phase 4.1.12 "known-red decision" (gate report §5) is thereby resolved via **Path A** in its minimal form: no CI receiver service was added — the receiver travels inside the test itself, which is strictly smaller than the Path A option sketched in 4.1.12.

## 4. Expected Hosted Outcome After This Fix

| Job | 4.1.12 expectation | 4.1.13 expectation |
|-----|--------------------|--------------------|
| lint / boundary-lint / test-unit / migration-gate / mobile | GREEN | GREEN (unchanged) |
| test-integration | RED — exactly AL-17 | **GREEN** (154/154 locally, incl. signed round trip) |
| test-contract / build / container-build | SKIPPED | **EXECUTE** (green integration no longer blocks them) |

The hosted run remains **NOT RUN** and is still the arbitration for the Linux environment; nothing here claims hosted CI passed.

## 5. Status

**PASS** — Workflow investigated, no change needed, job dependency goal achieved by the test-side fix alone.
