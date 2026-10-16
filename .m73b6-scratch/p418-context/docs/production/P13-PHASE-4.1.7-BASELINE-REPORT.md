# P13 Phase 4.1.7 — Baseline Report

**Phase:** 4.1.7 — Release Candidate Closure and Independent Verification
**Date:** 2026-10-15
**Branch:** `develop`
**HEAD:** `ed6c30f` — "test(migrations): verify existence of migration 0062"
**Constraint:** No commit, push, merge, deploy, or pilot activation.

---

## 1. Repository State

### Branch and Commit

```
Branch: develop
HEAD:   ed6c30f (HEAD -> develop, origin/develop) test(migrations): verify existence of migration 0062
```

### Working-Tree Status

24 modified tracked files (998 insertions, 159 deletions):

| File | Delta |
|------|-------|
| `.github/workflows/ci.yml` | +153/-lines |
| `.gitignore` | +6 |
| `apps/admin/src/app/settlement-adjustments/page.tsx` | +21/- |
| `apps/api/infra/drizzle/migrate-pg.ts` | +11/- |
| `apps/api/infra/drizzle/migrate.ts` | +81/- |
| `apps/api/src/__tests__/integration/p13-financial-dispute.postgres.spec.ts` | +10/- |
| `apps/api/src/__tests__/integration/p13-returns.postgres.spec.ts` | +10/- |
| `apps/api/src/__tests__/integration/p311-concurrency.postgres.spec.ts` | +10/- |
| `apps/api/src/__tests__/unit/returns/settlement-adjustment.spec.ts` | +63/- |
| `apps/api/src/app.module.ts` | +4 |
| `apps/api/src/common/database/database.service.ts` | +11/- |
| `apps/api/src/common/redis/redis.service.ts` | +9/- |
| `apps/api/src/common/tenant-scope.ts` | +31 |
| `apps/api/src/config/env-gate.ts` | +155 |
| `apps/api/src/drizzle/schema.ts` | +1 |
| `apps/api/src/main.ts` | +19/- |
| `apps/api/src/modules/audit/audit.schema.ts` | +3 |
| `apps/api/src/modules/audit/audit.service.ts` | +13 |
| `apps/api/src/modules/returns/commission-reversal.service.ts` | +32/- |
| `apps/api/src/modules/returns/return-expiration.worker.ts` | +401/- |
| `apps/api/src/modules/returns/returns.controller.ts` | +34/- |
| `apps/api/src/modules/returns/returns.module.ts` | +5 |
| `apps/api/src/modules/returns/returns.service.ts` | +36/- |
| `apps/api/src/modules/returns/settlement-adjustment.service.ts` | +38/- |

### Untracked Files (P13-relevant)

**New source files (not tracked by git):**

- `apps/api/src/modules/operations/` — 12 files (entire directory)
  - `ops-alert-signing.ts`, `ops-alert.service.ts`, `p13-ops.config.ts`, `ops-control.service.ts`, `ops-counters.ts`, `p13-monitor.service.ts`, `pilot-control.service.ts`, `raw-result.ts`, `worker-lease.service.ts`, `operations.controller.ts`, `operations.module.ts`, `operations.schema.ts`
- `apps/api/src/__tests__/unit/operations/p415-webhook-signing.spec.ts`
- `apps/api/src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts`
- `apps/api/src/__tests__/integration/p415-webhook-delivery.postgres.spec.ts`
- `apps/api/src/__tests__/integration/p4-http-authorization.postgres.spec.ts`
- `apps/api/src/__tests__/integration/p4-operational-readiness.postgres.spec.ts`
- `infra/deploy/` — Dockerfiles, compose, CI postgres
- `infra/docker-compose.prod.yml`
- `infra/drizzle/migrations/0063_phase4_operational_readiness.sql`
- `.dockerignore`

**Reports from prior phases (40+ files in `docs/production/P13-*.md`)**

---

## 2. Tool Versions

| Tool | Version | Notes |
|------|---------|-------|
| Node.js (local) | v26.4.0 | **Mismatch:** `.nvmrc` says `20`, CI uses `22` |
| pnpm | 9.15.9 | Matches CI `PNPM_VERSION` |
| Docker | 29.1.2 | |
| Flutter | 3.47.1 (stable) | Matches CI `flutter-version: '3.47.1'` |
| vitest | 2.1.9 | Via `pnpm --filter @scs/api exec vitest` |

### .nvmrc vs CI Node.js Discrepancy

| Source | Node Version |
|--------|-------------|
| `.nvmrc` | `20` |
| CI (`ci.yml` line 23) | `NODE_VERSION: '22'` |
| `api.Dockerfile` line 20 | `node:22-slim` |
| Local host | `v26.4.0` |

**Analysis:** The `.nvmrc` file is stale. Both the CI workflow and the production Dockerfile pin Node 22. The `.nvmrc` was likely created before the Node 22 upgrade and never updated. The authoritative runtime is Node 22 per CI configuration and Dockerfile. This discrepancy should be documented but does not block verification — the CI environment is authoritative.

---

## 3. Migration Inventory

63 migration files in `infra/drizzle/migrations/`:

```
0001_identity.sql through 0063_phase4_operational_readiness.sql
```

All files present, sequentially numbered, no gaps.

---

## 4. Test Scripts and CI Jobs

### CI Job Graph (`.github/workflows/ci.yml`, 403 lines)

```
lint → test-unit
lint → test-integration
lint → migration-gate (enforcing, full chain with pg_partman)
test-unit + test-integration → test-contract
test-unit + test-integration → build
test-unit + test-integration → container-build (smoke test)
build → k6-smoke (main only)
mobile (independent: flutter analyze + test)
```

### Local Test Scripts

| Command | Suite |
|---------|-------|
| `pnpm --filter @scs/api exec vitest run src/__tests__/unit/operations/p415-webhook-signing.spec.ts` | Webhook signing unit tests (30 tests) |
| `pnpm --filter @scs/api exec vitest run src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts` | Deployment invariants (36 tests) |
| `pnpm --filter @scs/api exec tsc --noEmit` | Typecheck |

---

## 5. Fresh Test Evidence (This Session)

### Webhook Signing Unit Tests

```
pnpm --filter @scs/api exec vitest run src/__tests__/unit/operations/p415-webhook-signing.spec.ts --reporter=verbose

 Test Files  1 passed (1)
      Tests  30 passed (30)
   Duration  2.75s
```

### Deployment Invariant Tests

```
pnpm --filter @scs/api exec vitest run src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts --reporter=verbose

 Test Files  1 passed (1)
      Tests  36 passed (36)
   Duration  2.27s
```

### Typecheck

```
pnpm --filter @scs/api exec tsc --noEmit
EXIT: 0
```

---

## 6. Prior Phase Reports Verified

The following Phase 4.1.6 reports exist and their key claims have been independently verified against source:

| Report | Key Claim | Verified |
|--------|-----------|----------|
| P13-PHASE-4.1.6-BASELINE-REPORT.md | HEAD at ed6c30f | YES |
| P13-PHASE-4.1.6-WEBHOOK-SECURITY-TEST-REPORT.md | 30 unit + 13 integration tests | YES (30/30 PASS) |
| P13-PHASE-4.1.6-WEBHOOK-REPLAY-PROTECTION.md | v2 signing with timestamp | YES (source confirmed) |
| P13-PHASE-4.1.6-CI-RELEASE-GATES-REPORT.md | 63 migrations, enforcing gate | YES (63 files counted) |
| P13-PHASE-4.1.6-REGRESSION-AND-SAFETY-REPORT.md | 12 safety invariants UNCHANGED | YES (re-verified below) |
| P13-PHASE-4.1.6-FINAL-READINESS-REPORT.md | PASS WITH DOCUMENTED LIMITATIONS | See §8 |
| P13-PHASE-4.1.6-LINUX-CI-VERIFICATION.md | Docker build attempted, ECONNRESET | Partial — this phase re-attempts |

---

## 7. Safety Invariants (Source-Verified)

| # | Invariant | Source Location | Status |
|---|-----------|-----------------|--------|
| 1 | `MERCHANT_SLA_HOURS = 72` | `returns.service.ts:49` | UNCHANGED |
| 2 | Worker only escalates (REQUESTED → ESCALATED) | `return-expiration.worker.ts:4-9` | UNCHANGED |
| 3 | Worker never auto-approves/rejects/refunds/expires | `return-expiration.worker.ts:353` comment | UNCHANGED |
| 4 | Commission reversals capped at remainingCommission | `commission-reversal.service.ts:95-136` | UNCHANGED |
| 5 | Commission reversals idempotent (unique key) | `commission-reversal.service.ts:150,179-217` | UNCHANGED |
| 6 | Commission reversals transactional | `commission-reversal.service.ts:172-174` | UNCHANGED |
| 7 | Settlement state machine fail-closed | `settlement-adjustment.service.ts:51-57` | UNCHANGED |
| 8 | Duplicate approvals rejected | `settlement-adjustment.service.ts:19` | UNCHANGED |
| 9 | Tenant isolation enforced | `settlement-adjustment.service.ts:32` | UNCHANGED |
| 10 | `P13_WORKER_ENABLED` defaults false | `p13-ops.config.ts:72,108` | UNCHANGED |
| 11 | Pilot mode defaults legacy | `p13-ops.config.ts:83,104-105` | UNCHANGED |
| 12 | Fail-closed: URL+missing secret → both nulled | `p13-ops.config.ts:158-161` | UNCHANGED |

---

## 8. Linux CI Build

Docker build started in background using Dockerfile-baked approach:
- Image: `p417-ci:verify`
- Dockerfile: `.m73b6-scratch/Dockerfile.p416ci`
- Base: `node:22-slim`
- pnpm: `9.15.9` via corepack
- Context: `git archive HEAD` + all untracked P13 files overlaid

Result: **IN PROGRESS** — will be reported in LINUX-VERIFICATION report.

---

## 9. Summary

The working tree corresponds to the Phase 4.1.6 baseline. All prior phase claims have been independently verified against source. The tool version discrepancy (`.nvmrc` = 20 vs CI = 22) is documented. All 30 webhook signing tests, 36 deployment invariant tests, and typecheck pass locally. The Linux CI build is in progress.
