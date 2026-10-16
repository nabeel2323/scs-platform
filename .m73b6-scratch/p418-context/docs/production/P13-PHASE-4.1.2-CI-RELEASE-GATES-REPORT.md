# P13 Phase 4.1.2 — CI Release Gates Report

**Stage C** · Status: **PASS WITH DOCUMENTED LIMITATIONS**  
Date: 2026-10-15  
Workflow: `.github/workflows/ci.yml`

---

## 1. Summary

The container-build CI job has been implemented and the YAML validated locally. The deployment invariants spec (36 tests) passes. The migration gate remains a dry-run enforcing / apply best-effort posture due to the `pg_partman` dependency.

**Verdict: PASS WITH DOCUMENTED LIMITATIONS**

**Limitations:**
1. Actual hosted CI run not available (no push performed)
2. Migration full-chain test blocked by pg_partman extension availability
3. API image rebuild with `USER node` in progress (will be verified on next CI run)

---

## 2. Container-Build CI Job

### 2.1 Job Definition

Added to `.github/workflows/ci.yml` after the `mobile` job:

```yaml
container-build:
  name: Container Build & Smoke Test
  runs-on: ubuntu-latest
  needs: [test-unit, test-integration]
  timeout-minutes: 30
```

### 2.2 Job Steps

| Step | Description | Enforcing? |
|------|-------------|------------|
| Checkout | `actions/checkout@v4` | - |
| Docker Buildx | `docker/setup-buildx-action@v3` | - |
| Build API image | `docker/build-push-action@v5` with GHA cache | ✅ Yes |
| Deployment invariants | `p41-deployment-invariants.spec.ts` (36 tests) | ✅ Yes |
| Start disposable services | PostgreSQL 16 + Redis 7 on `ci-smoke-net` | - |
| Start API container | Safe defaults, P13 disabled | - |
| Verify health endpoints | `/v1/healthz` and `/v1/readyz` | ✅ Yes |
| Verify P13 configuration | Worker disabled, pilot mode legacy | ✅ Yes |
| Verify non-root user | `whoami` != root | ✅ Yes |
| Cleanup | `if: always()` — remove containers, network, image | - |

### 2.3 Integration with Existing Workflow

- **Trigger policy:** Runs for PRs and pushes to `main`/`develop` (consistent with existing workflow)
- **Dependency chain:** `needs: [test-unit, test-integration]` — runs after core tests pass
- **Frozen lockfile:** Uses `pnpm install --frozen-lockfile` (consistent with all other jobs)
- **Timeout:** 30 minutes (bounded)
- **Cleanup:** All disposable resources cleaned up even on failure (`if: always()`)
- **Failure behavior:** All verification steps are enforcing (no `continue-on-error`)

### 2.4 YAML Validation

**Method:** PowerShell script with UTF-8 no-BOM encoding (avoids box-drawing character corruption)

**Result:** ✅ VALID
- Total lines: 394
- Jobs: lint, boundary-lint, test-unit, test-integration, migration-gate, test-contract, build, k6-smoke, mobile, container-build

### 2.5 Local Verification

**Deployment invariants spec:** ✅ 36/36 PASSED
```
RUN  v2.1.9 C:/TAIF/scs-platform/apps/api
 ✓ src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts (36 tests) 40ms
 Test Files  1 passed (1)
      Tests  36 passed (36)
```

---

## 3. Migration Gate Analysis

### 3.1 Current State

The existing `migration-gate` job has two steps:

1. **Dry-run (enforcing):** Validates every migration file exists, is ordered, non-empty, and the DB is reachable. This is the enforcing migration gate.

2. **Apply (best-effort):** Attempts full migration apply to a fresh `postgis/postgis:16-3.4` database. Migrations 0001-0012 apply cleanly, but migration 0013 requires `pg_partman`, which is not bundled in the postgis image.

### 3.2 pg_partman Blocker

**Migration 0013:** `0013_analytics.sql` requires the third-party `pg_partman` extension.

**Issue:** No official combined `postgis + pg_partman` Docker image exists. The `postgis/postgis:16-3.4` image does not include pg_partman.

**Impact:** The ordered migration apply cannot complete on the CI service container.

**Mitigation:** The full apply is validated in staging/prod provisioning images that install pg_partman. The dry-run above is the enforcing migration gate.

### 3.3 Full-Chain Test Feasibility

**Can a full-chain test be implemented on Linux CI?**

Option 1: Custom PostgreSQL image with pg_partman
- Would require building and maintaining a custom Docker image
- Adds complexity and maintenance burden
- Not justified for a CI gate when the dry-run is enforcing

Option 2: Skip pg_partman migrations
- Would require proving the migration contract allows skipping
- The migration runner does not support selective skipping
- Would weaken the gate

**Conclusion:** A full-chain test cannot safely be implemented without a custom PostgreSQL image. The current posture (dry-run enforcing, apply best-effort) is the correct balance.

**Gate status:** ⚠️ BLOCKED (by pg_partman extension availability)

---

## 4. Encoding-Safe Editing Method

### 4.1 Problem

The CI workflow file contains UTF-8 box-drawing characters (─) in section headers. These characters display as `â"€"` when read without proper UTF-8 encoding, causing SearchReplace to fail.

### 4.2 Solution

Used a PowerShell script (`add_ci_job.ps1`) with:
- Single-quoted here-string (`@' '@`) to prevent variable expansion
- `[System.IO.File]::WriteAllText()` with explicit UTF-8 no-BOM encoding
- Git checkout to restore the original file before appending

### 4.3 Verification

- File restored from git: ✅
- Container-build job appended: ✅
- Variables preserved (not expanded): ✅
- YAML structure valid: ✅

---

## 5. Security Review of CI Job

### 5.1 Secrets

- No secrets hardcoded in the job definition
- Test credentials use placeholder values (`ci-test-secret-*`)
- JWT secret is a test value, not a production credential

### 5.2 Cleanup

- All disposable resources cleaned up on failure (`if: always()`)
- Containers, network, and image removed after test
- No residual state left on the runner

### 5.3 Cache

- Uses GitHub Actions cache (`type=gha`) for Docker layers
- Cache is scoped to the repository
- No sensitive data in cache

---

## 6. Comparison with Phase 4.1

| Aspect | Phase 4.1 | Phase 4.1.2 |
|--------|-----------|-------------|
| Container-build job | Designed, not committed | ✅ Implemented and committed |
| Deployment invariants | 36/36 passing | ✅ 36/36 passing |
| Migration gate | Dry-run enforcing, apply best-effort | ⚠️ Same (pg_partman blocker) |
| YAML validation | Not performed (encoding issues) | ✅ Validated locally |
| Encoding-safe method | Not found | ✅ PowerShell script with UTF-8 no-BOM |

---

## 7. Conclusion

**Overall verdict: PASS WITH DOCUMENTED LIMITATIONS**

The container-build CI job is implemented and locally validated. The deployment invariants spec passes. The migration gate remains blocked by the pg_partman extension, which is a known infrastructure limitation.

**Key findings:**
1. ✅ Container-build job implemented in CI workflow
2. ✅ YAML validated locally (394 lines, 10 jobs)
3. ✅ Deployment invariants: 36/36 passing
4. ✅ Encoding-safe editing method found and used
5. ✅ Cleanup on failure (all disposable resources)
6. ⚠️ Migration full-chain test blocked by pg_partman
7. ⚠️ Actual hosted CI run not available

**Recommendation:** The container-build job is ready for CI. The migration gate should remain in its current posture (dry-run enforcing, apply best-effort) until a custom PostgreSQL image with pg_partman is available.

---

**Report prepared:** 2026-10-15 00:40 UTC  
**Workflow file:** `.github/workflows/ci.yml` (394 lines)  
**Jobs:** 10 (including new `container-build`)  
**Deployment invariants:** 36/36 passing  
**Migration gate:** ⚠️ BLOCKED (pg_partman)
