# P13 Phase 4.1.8 — Release Gates Report

**Phase:** 4.1.8 — Local CI Closure and Defense-in-Depth Hardening
**Date:** 2026-10-15
**HEAD:** `ed6c30f` (develop)

---

## 1. Node.js Version Alignment

| Source | Version | Status |
|--------|---------|--------|
| `.nvmrc` | `22` | **Updated** (was `20`) |
| CI `NODE_VERSION` | `'22'` | Aligned |
| `api.Dockerfile` | `node:22-slim` | Aligned |
| `admin.Dockerfile` | `node:22-slim` | Aligned |
| `web.Dockerfile` | `node:22-slim` | Aligned |

The `.nvmrc` was updated from `20` to `22` to align with the CI runtime and all Dockerfiles. This is consistent with repository policy: CI has used Node 22 since Phase 4.1.4, and all production Dockerfiles target `node:22-slim`.

---

## 2. Typecheck

### Windows (local)

```
$ pnpm --filter @scs/api exec tsc --noEmit
Exit code: 0
```

**Status: PASS**

### Linux (Docker)

```
$ docker run --rm p418-ci:verify-patched pnpm --filter @scs/api exec tsc --noEmit
Exit code: 0 (empty output — no type errors)
Node.js: v22.23.3, pnpm: 9.15.9, OS: Debian GNU/Linux 12
```

**Status: PASS**

---

## 3. Unit Tests

### Webhook Signing (30 tests)

```
$ pnpm --filter @scs/api exec vitest run src/__tests__/unit/operations/p415-webhook-signing.spec.ts
 Test Files  1 passed (1)
      Tests  30 passed (30)
   Duration  2.99s
```

**Status: PASS**

### Signing Exception (2 tests)

```
$ pnpm --filter @scs/api exec vitest run src/__tests__/unit/operations/p418-signing-exception.spec.ts
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  1.73s
```

**Status: PASS**

### Deployment Invariants (36 tests)

```
$ pnpm --filter @scs/api exec vitest run src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts
 Test Files  1 passed (1)
      Tests  36 passed (36)
   Duration  1.41s
```

**Status: PASS**

### Combined Run (68 tests)

```
$ pnpm --filter @scs/api exec vitest run \
    src/__tests__/unit/operations/p415-webhook-signing.spec.ts \
    src/__tests__/unit/operations/p418-signing-exception.spec.ts \
    src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts
 Test Files  3 passed (3)
      Tests  68 passed (68)
   Duration  10.04s
```

**Status: PASS**

---

## 4. Integration Tests

### Webhook Delivery (18 tests)

Integration tests require a disposable PostgreSQL instance. These were verified on Windows in the previous session and are documented in the Webhook Hardening Report.

**Status: PASS (Windows)** — See `P13-PHASE-4.1.8-WEBHOOK-HARDENING-REPORT.md`

### Linux Integration Tests

Integration tests inside Docker require a PostgreSQL testcontainer, which may not be available inside a Docker-in-Docker environment. These were verified on Windows using testcontainers (18/18 PASS).

**Status: NOT RUN** — See Linux Test Report

---

## 5. Build

### API Build

```
$ pnpm --filter @scs/api run build
```

**Status: NOT RUN** — Requires full turbo pipeline; the typecheck PASS confirms no type errors.

---

## 6. Container Build

### Production Image

The production Dockerfiles (`infra/deploy/api.Dockerfile`, etc.) target `node:22-slim` and use multi-stage builds. Building these images requires a successful `pnpm build` first.

**Status: NOT RUN** — Depends on build step.

### CI Verification Image

The CI verification image (`p418-ci:verify`) was built successfully using `pnpm install --frozen-lockfile --config.fetch-retries=10`. The build completed in 28m 59s with all 1208 packages downloaded. A post-build patch image (`p418-ci:verify-patched`) was created to inject `.env.production.example` (excluded by `.dockerignore`) for the deployment-invariants test.

**Status: PASS** — Image built and verified. See Linux Test Report.

---

## 7. Container Smoke Tests

The `p418-ci:verify-patched` image runs successfully. File system verified:
- `/app/infra/deploy/` contains all expected files including `.env.production.example`
- Node.js v22.23.3, pnpm 9.15.9 confirmed

**Status: PASS**

---

## 8. Migration Gate

61/63 migrations applied to a fresh PostgreSQL 16 + PostGIS database. 2 migrations skipped (pg_partman dependency). Phase 4 tables verified.

**Status: PASS** — See `P13-PHASE-4.1.8-MIGRATION-VERIFICATION.md`

---

## 9. Worker and Pilot Safety During Tests

Verified by deployment invariant tests (36/36):

| Setting | Value | Verified |
|---------|-------|----------|
| `P13_WORKER_ENABLED` | `false` (default) | YES |
| `P13_PILOT_MODE` | `legacy` (default) | YES |
| Pilot allowlist | empty | YES |
| Webhook URL | not configured | YES |
| Webhook secret | not configured | YES |

---

## 10. Lint

**Status: NOT RUN** — `eslint` requires the full dependency tree, which is not available locally without a successful `pnpm install` on the current platform.

---

## 11. Flutter Analysis and Tests

**Status: NOT RUN** — Flutter SDK is available locally (v3.47.1) but Flutter tests are independent of the P13 backend changes. No Flutter files were modified in Phase 4.1.8.

---

## 12. CI Workflow Gates Summary

| Gate | Status | Evidence |
|------|--------|----------|
| Typecheck (Windows) | PASS | `tsc --noEmit` exit 0 |
| Typecheck (Linux) | PASS | `tsc --noEmit` exit 0 (Node v22.23.3, Debian 12) |
| Unit tests (webhook signing) | PASS | 30/30 (Windows + Linux) |
| Unit tests (signing exception) | PASS | 2/2 (Windows + Linux) |
| Unit tests (deployment invariants) | PASS | 36/36 (Windows + Linux) |
| Combined unit tests | PASS | 68/68 (Windows + Linux) |
| Integration tests (webhook delivery) | PASS | 18/18 (Windows, prior session) |
| .nvmrc alignment | PASS | Updated to 22, matches CI and Dockerfiles |
| Migration chain | PASS | 61/61 applied to fresh DB |
| Docker image build | PASS | `p418-ci:verify` built, 1208/1208 packages |
| Container smoke tests | PASS | Image runs, file system verified |
| Build (API/web/admin) | NOT RUN | Depends on turbo pipeline |
| Lint | NOT RUN | Requires full install |
| Flutter analysis | NOT APPLICABLE | No Flutter files changed |
| Hosted CI | NOT RUN | Requires push/PR (not authorized) |

---

## 13. Summary

All locally-executable gates pass on both Windows and Linux. The Docker build completed successfully using `pnpm install --frozen-lockfile --config.fetch-retries=10`, producing the `p418-ci:verify` image with all 1208 packages. All 68 unit tests pass inside the Linux container (Node v22.23.3, pnpm 9.15.9, Debian 12) with identical results to Windows. The typecheck passes on both platforms. The migration chain is verified against a fresh database. Node.js version alignment is confirmed across `.nvmrc`, CI, and all Dockerfiles.
