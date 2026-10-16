# P13 Phase 4.1.8 — Baseline Report

**Phase:** 4.1.8 — Local CI Closure and Defense-in-Depth Hardening
**Date:** 2026-10-15
**Branch:** `develop`
**Starting HEAD:** `ed6c30f` — "test(migrations): verify existence of migration 0062"
**Constraint:** No commit, push, merge, deploy, or pilot activation.

---

## 1. Repository State

### Branch and Commit

```
Branch: develop
HEAD:   ed6c30f (HEAD -> develop, origin/develop) test(migrations): verify existence of migration 0062
```

### Working-Tree Status

93 entries in `git status --short`:
- 24 modified tracked files (998 insertions, 159 deletions)
- 69 untracked files/directories

### Modified Tracked Files (24)

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

### Untracked Files (P13-relevant, 69 entries)

**New source files:**

- `apps/api/src/modules/operations/` — 12 files (entire operations module)
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

## 2. Phase 4.1.7 Continuity Confirmation

The working tree corresponds exactly to the Phase 4.1.7 baseline. All 24 modified tracked files and all untracked P13 files are present and unchanged from the Phase 4.1.7 ending state.

Phase 4.1.7 reports read and verified:
- `P13-PHASE-4.1.7-BASELINE-REPORT.md` — HEAD ed6c30f, 24 modified tracked files
- `P13-PHASE-4.1.7-WEBHOOK-VERIFICATION.md` — 17 signing properties, 11 fail-closed scenarios
- `P13-PHASE-4.1.7-LINUX-VERIFICATION.md` — 30/30 webhook tests PASS in Linux, deployment invariants BLOCKED (expected)
- `P13-PHASE-4.1.7-CI-AND-MIGRATION-VERIFICATION.md` — 63 migrations, enforcing gate, .nvmrc stale
- `P13-PHASE-4.1.7-REGRESSION-AND-SAFETY-REPORT.md` — 13 safety invariants UNCHANGED
- `P13-PHASE-4.1.7-FINAL-READINESS-REPORT.md` — Gate-by-gate status, production NOT AUTHORIZED

---

## 3. Tool Versions

| Tool | Version | Notes |
|------|---------|-------|
| Node.js (local) | v26.4.0 | `.nvmrc` says `20` (stale), CI uses `22` |
| pnpm | 9.15.9 | Matches CI `PNPM_VERSION` |
| Docker | 29.1.2 | |
| Flutter | 3.47.1 (stable) | Matches CI `flutter-version: '3.47.1'` |
| vitest | 2.1.9 | Via `pnpm --filter @scs/api exec vitest` |

---

## 4. Key Weakness Identified by Phase 4.1.7

The Phase 4.1.7 webhook verification report identified a service-level weakness:

> If the webhook URL is present and the secret is absent because configuration is mutated after initialization, the delivery path can send an unsigned request.

In `ops-alert.service.ts:254`:
```typescript
if (this.config.alertWebhookSecret) {
  // sign the body
}
// ...
const response = await fetch(this.config.alertWebhookUrl as string, { ... });
```

If `alertWebhookSecret` is null (e.g., via post-construction mutation), no signature headers are added, but the `fetch()` still proceeds to `alertWebhookUrl`. The config layer prevents this from arising in production, but the service itself should enforce defense-in-depth.

**This phase will harden the delivery path to enforce signing immediately before any HTTP request.**

---

## 5. CI Job Graph

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

---

## 6. Migration Inventory

63 migration files in `infra/drizzle/migrations/`:
```
0001_identity.sql through 0063_phase4_operational_readiness.sql
```

All files present, sequentially numbered, no gaps.

---

## 7. Summary

Working tree confirmed at Phase 4.1.7 ending state. HEAD at `ed6c30f`. All 93 working-tree entries preserved. The primary hardening target is the webhook delivery service's `deliver()` method, which must enforce signing before any HTTP request regardless of config-layer guarantees.
