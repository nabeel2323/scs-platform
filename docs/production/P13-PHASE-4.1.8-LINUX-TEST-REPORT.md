# P13 Phase 4.1.8 — Linux Test Report

**Phase:** 4.1.8 — Local CI Closure and Defense-in-Depth Hardening
**Date:** 2026-10-15
**HEAD:** `ed6c30f` (develop)

---

## 1. Objective

Run the P13 test suite inside a real Linux checkout (Node.js 22, pnpm 9.15.9) matching CI, using the full working tree including all tracked and untracked P13 changes.

---

## 2. Environment Setup

### Docker Image

- Base: `node:22-slim` (matches CI and production Dockerfiles)
- Build tools: `python3`, `make`, `g++`, `git` (for native module compilation)
- pnpm: `9.15.9` via `corepack prepare`
- Image tag: `p418-ci:verify` (base), `p418-ci:verify-patched` (with `.env.production.example` injected)

### Build Context

Full working tree exported via:
1. `git archive --format=tar -o base.tar HEAD` — base tracked files
2. Robocopy overlay of the entire working tree (excluding `node_modules`, `.pnpm-store`, `.git`) — ensures modified tracked files and untracked files are at their current working-tree versions

### Dockerfile

```dockerfile
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ git && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --config.fetch-retries=10 || \
    (echo "=== First attempt failed, retrying ===" && pnpm install --frozen-lockfile --config.fetch-retries=10)
CMD ["pnpm", "--filter", "@scs/api", "exec", "tsc", "--noEmit"]
```

### Post-Build Patch

The project `.dockerignore` excludes all `.env*` files from the Docker build context (intentional — credentials protection). However, the deployment-invariants test checks that `infra/deploy/.env.production.example` exists on disk. A thin patch image was created to inject this single file:

```dockerfile
FROM p418-ci:verify
COPY infra/deploy/.env.production.example /app/infra/deploy/.env.production.example
```

This produces `p418-ci:verify-patched` which is identical to the base image plus the example env template.

---

## 3. Build History

### Attempt 1 (Phase 4.1.7 carry-over)

- `pnpm install --frozen-lockfile` (default 3 retries)
- Failed at 1203/1208 packages — `ECONNRESET` on `@swc/core-linux-x64-musl`
- Duration: ~1634 seconds before abort

### Attempt 2 (Phase 4.1.8, first try)

- `pnpm install --frozen-lockfile --network-retries 10` (invalid flag)
- Failed immediately: `ERROR: Unknown options: 'frozen-lockfile', 'network-retries'`
- Note: `--network-retries` is not a valid pnpm CLI option

### Attempt 3 (Phase 4.1.8, corrected) — SUCCESS

- `pnpm install --frozen-lockfile --config.fetch-retries=10`
- apt-get step: CACHED (from attempt 2)
- pnpm install: reached 1202/1208 packages, then progressively downloaded remaining packages via retries
- **All 1208/1208 packages downloaded successfully**
- Native modules compiled: `cpu-features`, `ssh2`
- **Total `pnpm install` duration: 28m 59.3s** (1743.0s for the full RUN step)
- Image exported and unpacked as `p418-ci:verify`

### Post-Build Patch — SUCCESS

- Single-layer patch adding `.env.production.example` to the image
- Image tagged as `p418-ci:verify-patched`
- Build time: <1 second (cached base layers)

---

## 4. Linux Test Results

### Environment Verification

| Component | Version |
|-----------|---------|
| Node.js | v22.23.3 |
| pnpm | 9.15.9 |
| OS | Debian GNU/Linux 12 (container) |

### Typecheck

```
$ pnpm --filter @scs/api exec tsc --noEmit
Exit code: 0 (empty output — no type errors)
```

**Status: PASS**

### Webhook Signing Tests (30 tests)

```
$ pnpm --filter @scs/api exec vitest run src/__tests__/unit/operations/p415-webhook-signing.spec.ts
 ✓ src/__tests__/unit/operations/p415-webhook-signing.spec.ts (30 tests) 32ms
 Test Files  1 passed (1)
      Tests  30 passed (30)
   Duration  2.99s
```

**Status: PASS**

### Signing Exception Tests (2 tests)

```
$ pnpm --filter @scs/api exec vitest run src/__tests__/unit/operations/p418-signing-exception.spec.ts
 ✓ src/__tests__/unit/operations/p418-signing-exception.spec.ts (2 tests) 15ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  1.73s
```

**Status: PASS**

### Deployment Invariant Tests (36 tests)

```
$ pnpm --filter @scs/api exec vitest run src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts
 ✓ src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts (36 tests) 34ms
 Test Files  1 passed (1)
      Tests  36 passed (36)
   Duration  2.29s
```

**Status: PASS**

### Combined Run (68 tests)

```
$ pnpm --filter @scs/api exec vitest run \
    src/__tests__/unit/operations/p415-webhook-signing.spec.ts \
    src/__tests__/unit/operations/p418-signing-exception.spec.ts \
    src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts
 ✓ src/__tests__/unit/operations/p415-webhook-signing.spec.ts (30 tests) 32ms
 ✓ src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts (36 tests) 60ms
 ✓ src/__tests__/unit/operations/p418-signing-exception.spec.ts (2 tests) 15ms
 Test Files  3 passed (3)
      Tests  68 passed (68)
   Duration  2.56s
```

**Status: PASS — 68/68**

---

## 5. Windows Comparison

All P13 tests pass on both Windows and Linux with identical results:

| Test Suite | Windows | Linux | Match |
|------------|---------|-------|-------|
| Webhook signing (p415) | 30/30 | 30/30 | YES |
| Signing exception (p418) | 2/2 | 2/2 | YES |
| Deployment invariants (p41) | 36/36 | 36/36 | YES |
| Combined run | 68/68 | 68/68 | YES |
| Typecheck | PASS | PASS | YES |

---

## 6. Conclusion

| Gate | Status | Evidence |
|------|--------|----------|
| Docker image build | **PASS** | `p418-ci:verify` built, 1208/1208 packages, 28m 59s |
| Linux typecheck | **PASS** | `tsc --noEmit` exit 0 |
| Linux unit tests (68) | **PASS** | 68/68 (30 signing + 2 exception + 36 deployment) |
| Linux integration tests | **NOT RUN** | Requires PostgreSQL testcontainer inside Docker |
| Windows typecheck | **PASS** | `tsc --noEmit` exit 0 |
| Windows unit tests (68) | **PASS** | 68/68 |
| Windows integration tests (18) | **PASS** | 18/18 (prior session, testcontainers) |

**All locally-executable Linux tests PASS.** The Docker build completed successfully after configuring pnpm with `--config.fetch-retries=10`. The 68 unit tests (webhook signing, signing exception, deployment invariants) all pass inside the Linux container with Node.js v22.23.3 and pnpm 9.15.9. Results are identical to the Windows run.

**Note on `.dockerignore`:** The project `.dockerignore` intentionally excludes all `.env*` files from Docker build contexts. The deployment-invariants test verifies this exclusion is in place. For CI verification, the `.env.production.example` file must be injected separately (as done with the `p418-ci:verify-patched` image) or the test must be run from the repository filesystem rather than inside a container.
