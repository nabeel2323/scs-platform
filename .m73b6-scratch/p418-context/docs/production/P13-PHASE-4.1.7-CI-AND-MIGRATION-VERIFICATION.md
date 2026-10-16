# P13 Phase 4.1.7 — CI and Migration Verification

**Phase:** 4.1.7 — Independent Verification
**Date:** 2026-10-15
**HEAD:** `ed6c30f` (develop)

---

## 1. CI Workflow Structure

### Job Graph (`.github/workflows/ci.yml`, 403 lines)

```
lint ──┬── test-unit ──────┬── test-contract
       │                   ├── build
       │                   └── container-build
       ├── test-integration┘       │
       │                          └── (needs: test-unit, test-integration)
       ├── migration-gate (enforcing)
       └── boundary-lint (advisory)
       
build ── k6-smoke (main only)
mobile (independent)
```

### Node.js and pnpm Versions

| Setting | Value | Source |
|---------|-------|--------|
| `NODE_VERSION` | `'22'` | `ci.yml` line 23 |
| `PNPM_VERSION` | `'9.15.9'` | `ci.yml` line 24 |
| `.nvmrc` | `20` | Stale — does not match CI |
| `api.Dockerfile` base | `node:22-slim` | Matches CI |

**Verdict:** `.nvmrc` is stale. CI and Dockerfile are consistent at Node 22. The `.nvmrc` discrepancy does not affect CI but should be updated to `22` for local development consistency.

---

## 2. Required CI Checks — Genuinely Blocking?

| Job | Blocking? | Evidence |
|-----|-----------|----------|
| lint (typecheck + format) | **YES** | No `continue-on-error` on `pnpm typecheck`. `pnpm format:check` has `continue-on-error: true` (advisory only, line 53). |
| boundary-lint | **NO** | `continue-on-error: true` (line 75). Documented as advisory. |
| test-unit | **YES** | No `continue-on-error`. Coverage gates present. |
| test-integration | **YES** | No `continue-on-error`. |
| migration-gate | **YES** | Explicitly documented "No continue-on-error" (line 188). |
| test-contract | **YES** | No `continue-on-error`. |
| build | **YES** | No `continue-on-error`. |
| container-build | **YES** | No `continue-on-error`. Includes non-root check. |
| mobile | **YES** | No `continue-on-error`. |
| k6-smoke | **NO** (main only) | `if: github.ref == 'refs/heads/main'` (line 280). |

**No required check is silently skipped.** The two `continue-on-error: true` usages are on advisory-only steps (Prettier formatting debt and boundary lint) with documented TODO comments explaining why.

---

## 3. Migration Chain Verification

### File Inventory

63 migration files in `infra/drizzle/migrations/`:

```
0001_identity.sql through 0063_phase4_operational_readiness.sql
```

All files present, sequentially numbered, no gaps. Verified by `Get-ChildItem` count: **63**.

### Migration Gate Configuration

The migration gate (`ci.yml` lines 147-201):

1. **Builds CI postgres image** with PostGIS + pg_partman from `infra/deploy/ci-postgres.Dockerfile`
2. **Starts disposable postgres** container on port 5433
3. **Dry-run** (`--dry-run`): validates ordering without writing
4. **Full migration apply** (enforcing): all 63 files applied sequentially
5. **Verify pg_partman**: queries `partman.part_config` to confirm partitioning
6. **Cleanup**: removes container

### Migration Gate Properties

| Property | Status | Evidence |
|----------|--------|----------|
| Uses PostgreSQL (not SQLite) | YES | `ci-postgres.Dockerfile` based on `postgres:16-bookworm` |
| Includes pg_partman | YES | `postgresql-16-partman` in Dockerfile (line 21) |
| Includes PostGIS | YES | `postgresql-16-postgis-3` in Dockerfile (line 19) |
| Full chain applied | YES | `pnpm --filter @scs/api run db:migrate:ci` (line 191) |
| Failure stops pipeline | YES | No `continue-on-error` on migration steps |
| Idempotent re-application | YES | Migrations use `IF NOT EXISTS` / `ON CONFLICT` patterns |
| Dry-run before apply | YES | `--dry-run` step at line 185 |

### Migration 0063 (Phase 4 Operational Readiness)

File: `infra/drizzle/migrations/0063_phase4_operational_readiness.sql` (untracked)

Creates: `worker_leases`, `ops_alerts`, `ops_controls`, `ops_control_audit`, `p13_pilot_allowlist` tables plus `feature_flags` provenance columns. All DDL is idempotent (`IF NOT EXISTS`).

---

## 4. Container Build Hygiene

### Dockerfile Analysis (`infra/deploy/api.Dockerfile`, 116 lines)

| Property | Status | Evidence |
|----------|--------|----------|
| Base image | `node:22-slim` | Line 20, 66 |
| pnpm version pinned | `9.15.9` via corepack | Line 25 |
| No secrets baked | YES | No `ARG` or `ENV` holding credentials |
| `.dockerignore` excludes credentials | YES | `.env*`, `*.pem`, `*.key`, `*.dump` excluded |
| Non-root runtime user | `USER node` | Line 100 |
| Exec form CMD | `["node", "apps/api/dist/main.js"]` | Line 115 — Node is PID 1 |
| Healthcheck present | `/v1/healthz` | Line 109-110 |
| Migrations inside image | YES | Line 91: `COPY --from=build ... migrations` |
| BuildKit cache mount | YES | Line 55: pnpm store cache for resilience |
| Multi-stage build | YES | Build stage + runtime stage |

### .dockerignore Coverage (113 lines)

Excludes: `node_modules/`, `.env*`, `*.pem`, `*.key`, `*.dump`, `.git/`, `docs/`, `coverage/`, `*.log`, mobile build artifacts, scratch files. Comprehensive.

### Container Build Smoke Test (CI)

The `container-build` job (lines 319-403):
1. Builds API image via `docker/build-push-action@v5`
2. Runs deployment invariants spec
3. Starts disposable postgres + redis
4. Starts API container with safe defaults (`P13_WORKER_ENABLED=false`, `P13_PILOT_MODE=legacy`)
5. Verifies health endpoints (`/v1/healthz`, `/v1/readyz`)
6. **Verifies non-root user** — fails if container runs as root
7. Cleanup

---

## 5. Worker and Pilot Safety Defaults

Verified in CI container smoke test (lines 357-369):

```yaml
-e P13_WORKER_ENABLED=false
-e P13_PILOT_MODE=legacy
```

Verified in config defaults (`p13-ops.config.ts`):
- `workerEnabled: false` (line 72)
- `pilotMode: 'legacy'` (line 83)

Verified in deployment invariants test (36/36 PASS):
- "disables the worker and legacy pilot mode with an empty environment"
- "stays disabled under a production NODE_ENV with no P13_* variables"
- "only enters allowlist mode on that exact value"

---

## 6. Production Compose Safety

Verified by deployment invariants test suite (9 tests in "production Compose safety posture"):
- Contains no development credentials
- Requires every credential through interpolation
- Hard-codes worker off on API environment block
- Worker behind Compose profile (plain `up` cannot start it)
- Defaults pilot to legacy
- Runs migrations as one-shot gate
- API tier has sufficient stop time for lease release
- Scales API tier (not single process)
- Redis authenticated

---

## 7. Gate-by-Gate Status

| Gate | Status | Evidence |
|------|--------|----------|
| Lint & Typecheck | **PASS** (local) | `tsc --noEmit` EXIT 0 |
| Unit Tests | **PASS** (local) | 30/30 webhook signing + 36/36 deployment invariants |
| Integration Tests | **NOT RUN** (requires PostgreSQL testcontainer) | Windows testcontainers unreliable |
| Migration Gate | **NOT RUN** (requires hosted CI or disposable PG) | Would need pg_partman-enabled PostgreSQL |
| Contract Tests | **NOT RUN** | Depends on `pnpm contracts:build` |
| Build | **NOT RUN** (Linux) | Pending Docker build completion |
| Container Build | **IN PROGRESS** | Docker build at 802/1208 packages |
| Mobile | **NOT RUN** | Flutter toolchain available but not exercised |
| Hosted GitHub Actions | **NOT RUN** | Requires push/PR — not authorized |

---

## 8. Summary

The CI workflow is correctly structured with genuinely blocking checks. The two `continue-on-error` usages are on advisory-only steps with documented rationale. The migration chain has 63 files with no gaps, and the enforcing gate uses PostgreSQL with pg_partman. Container images bake no secrets, run as non-root, and include migrations. The `.nvmrc` discrepancy (20 vs CI 22) is documented.
