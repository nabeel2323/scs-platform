# P13 PHASE 4.1.15 - LOCAL VERIFICATION REPORT

Date: 2026-10-16
Phase: 4.1.15 - Container-build workflow repair and hosted-CI re-verification (pre-push preflight)

## 1. Verification Battery (exact commands and exit codes)

| # | Check | Command (from c:\TAIF\scs-platform) | Result | Exit |
|---|---|---|---|---|
| 1 | YAML syntax | pnpm dlx js-yaml .github/workflows/ci.yml (JSON dump, 29,458 bytes) | Parsed clean | 0 |
| 2 | Workflow structure + order + config match | node .m73b6-scratch\assert-ci.cjs over the js-yaml parse | All assertions true (see section 2) | 0 |
| 3 | Deployment-invariants spec, exact corrected hosted command | pnpm --filter @scs/api run test -- --run src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts | 1 file, 36/36 tests passed (vitest 2.1.9, 4.71s) | 0 |
| 3b | Broken command form regression proof | pnpm --filter @scs/api test -- --run <same spec> | "ERROR Unknown option: 'run'" - documented in Workflow-Fix-Report section 2 | 1 (expected) |
| 4 | Typecheck | pnpm typecheck | Tasks: 9 successful, 9 total (7 cached), 1m15s | 0 |
| 5 | Lint | pnpm lint | Tasks: 5 successful, 5 total, 1m22s (ESLint scope is TS/JS only; no YAML linter is configured in this repo, so the workflow file itself is outside both linters' scope - covered instead by checks 1-2) | 0 |
| 6 | Docker build (equivalent of "Build API image") | docker build -f infra/deploy/api.Dockerfile -t scs-api:ci-test-local . | FINISHED, 23/23 steps, ~12.4 min; context 1.96GB 257s; pnpm install (cache mount) 87.7s; pnpm --filter "@scs/api..." build 77.7s; export 132.9s | 0 |
| 7 | Smoke sequence (equivalent of steps 6-11 of container-build) | powershell -NoProfile -ExecutionPolicy Bypass -File .m73b6-scratch\p4115-smoke.ps1 | All steps green (see section 3) | 0 |
| 8 | Diff scope review | git status --porcelain / git diff --stat | Exactly 1 modified tracked file (+10/-1); no unrelated files | 0 |

## 2. Structural Assertion Results (check 2 output)

- JOBS(10)=lint, boundary-lint, test-unit, test-integration, migration-gate, test-contract, build,
  k6-smoke, mobile, container-build.
- container-build steps (12): checkout(0), pnpm/action-setup@v4(1), actions/setup-node@v4(2),
  docker/setup-buildx-action@v3(3), docker/build-push-action@v5(4), Run deployment invariants
  spec(5), Start disposable services(6), Start API container with safe defaults(7), Verify health
  endpoints(8), Verify P13 configuration(9), Verify non-root user(10), Cleanup(11).
- ORDER_OK(pnpm<node<invariants)=true. Setup precedes every host-runner pnpm command in the job.
- INV_CMD contains `pnpm --filter @scs/api run test -- --run ...`; broken form absent.
- CONTAINER_CONTINUE_ON_ERROR=false. SAFE_DEFAULTS true|true (P13_WORKER_ENABLED=false,
  P13_PILOT_MODE=legacy present in the container env).
- ENV_NODE=22, ENV_PNPM=9.15.9. New steps' `with` blocks: {"version":"${{ env.PNPM_VERSION }}"} and
  {"node-version":"${{ env.NODE_VERSION }}","cache":"pnpm"} - structurally identical to all 7
  working jobs.
- Per-job audit: all 8 pnpm-consuming jobs have the pair; k6-smoke and mobile use no pnpm.

## 3. Local Container Smoke Results (check 7 output, image scs-api:ci-test-local)

| Step | Result |
|---|---|
| Image identity | user=[node], healthcheck=present |
| Disposable services | ci-smoke-net network + ci-postgres (postgres:16-alpine) + ci-redis (redis:7-alpine) started |
| API container (exact workflow env incl. P13_WORKER_ENABLED=false, P13_PILOT_MODE=legacy) | Up 15 seconds (healthy) |
| Liveness /v1/healthz | {"status":"ok",...} |
| Readiness /v1/readyz | {"status":"ok","database":{"status":"up"},"redis":{"status":"up"}} |
| P13 configuration echo | P13_WORKER_ENABLED=false, P13_PILOT_MODE=legacy |
| Non-root assertion | whoami=node - "OK: Container running as non-root user" |
| Cleanup | containers + network removed; SMOKE_FAIL_COUNT=0 |

Benign log noise observed and explained: "[OutboxDispatcher] Poll error: relation \"outbox_events\"
does not exist" - the smoke database is empty (this job never applies migrations), so the outbox
table does not exist; the dispatcher logs and continues. Same class of noise the hosted job will
produce; not a failure condition for any smoke step.

## 4. Tooling Notes (recorded honestly)

- `npx --yes js-yaml` failed for a local-project reason (npm ran the project context instead of the
  CLI); `pnpm dlx js-yaml` used instead, EXIT 0.
- PowerShell 5.1 `>` redirection writes UTF-16LE; the first JSON dump began with FF FE and
  JSON.parse rejected it. Re-dumped via [System.IO.File]::WriteAllText with BOM-less UTF-8;
  assertion script strips a leading U+FEFF defensively. No effect on ci.yml itself (edits made via
  file tools, working tree encoding unchanged).
- Docker build context transfer (1.96 GB) dominated wall time locally; hosted runners upload a
  fresh shallow checkout instead. Not a defect.

## 5. Boundary Statement

All checks above are LOCAL reproductions on Windows/Docker Desktop 29.1.2 with pnpm 9.15.9. They
do not reproduce GitHub-hosted execution and are not claimed to. The hosted run remains the sole
authority for the repaired workflow; the container gate may only be declared passed after the full
hosted job (build, invariants, services, health, P13 echo, non-root, cleanup) succeeds there.

## 6. Status Summary

| Gate | Status |
|---|---|
| YAML syntax + structure | PASS |
| Setup order and configuration parity with working jobs | PASS |
| Deployment-invariants spec (corrected command) | PASS 36/36 |
| Lint / Typecheck | PASS |
| Local Docker build + full smoke sequence | PASS |
| Hosted workflow verification | NOT RUN (blocked on push authorization, by design) |
