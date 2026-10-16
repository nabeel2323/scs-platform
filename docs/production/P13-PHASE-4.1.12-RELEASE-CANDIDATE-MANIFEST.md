# P13 Phase 4.1.12 — Release Candidate Manifest

**Phase:** 4.1.12 | **Date:** 2026-10-16 | **Branch:** develop | **HEAD:** ed6c30f

> **STATUS: PROPOSAL ONLY.** Nothing has been staged or committed during Phase 4.1.12. No `git add`, `git commit`, or `git push` was executed. The commands below are the exact future sequence, to be run only after explicit user authorization (see the Hosted-CI Authorization Gate report).

---

## 1. Composition Summary

| Bucket | Files | Disposition |
|--------|-------|-------------|
| Modified tracked files | 25 | INCLUDE |
| Untracked source / CI / deployment / migration | 27 | INCLUDE |
| Untracked phase reports (`docs/production/`) | 84 now → **88** at staging time | INCLUDE (glob-staged) |
| Scratch / probes / snapshot artifacts | 1,272 (1,267 in `.m73b6-scratch/` + 5 probes) | EXCLUDE — marked for review, NOT deleted |
| **Expected staged total at execution time** | **140** | 25 + 27 + 88 |

The 88-docs figure = 84 currently untracked reports + the 4 remaining Phase 4.1.12 reports (this manifest, verification reconciliation, hosted-CI gate, final report). The documentation globs in §11 pick them up automatically. Verified at manifest time: `git ls-files --others --exclude-standard` → 1,383 total untracked; 116 non-scratch (27 source/infra + 84 docs + 5 probes); 1,267 scratch.

---

## 2. Inclusion A — Modified Tracked Files (25, exact)

Full change rationale is in the Change Scope Audit report §2; one-line purpose here.

| # | File | Purpose |
|---|------|---------|
| 1 | `.github/workflows/ci.yml` | Enforcing migration gate + container-build job |
| 2 | `.gitignore` | `.env.*` ignored with example negations |
| 3 | `.nvmrc` | Node 20 → 22 (aligns with CI) |
| 4 | `apps/admin/src/app/settlement-adjustments/page.tsx` | `canPostFx()` allow-list fix |
| 5 | `apps/api/infra/drizzle/migrate-pg.ts` | CI runner applies all 63 migrations |
| 6 | `apps/api/infra/drizzle/migrate.ts` | Dev runner: ON_ERROR_STOP, transactional logging |
| 7 | `apps/api/src/__tests__/integration/p13-financial-dispute.postgres.spec.ts` | Harness: PilotControlService arg |
| 8 | `apps/api/src/__tests__/integration/p13-returns.postgres.spec.ts` | Same harness update |
| 9 | `apps/api/src/__tests__/integration/p311-concurrency.postgres.spec.ts` | TC-03 fixture fx_status vocabulary fix |
| 10 | `apps/api/src/__tests__/unit/returns/settlement-adjustment.spec.ts` | Vocabulary fix + 3 new fail-closed tests |
| 11 | `apps/api/src/app.module.ts` | Registers OperationsModule |
| 12 | `apps/api/src/common/database/database.service.ts` | `resolveDatabaseUrl()` fail-fast |
| 13 | `apps/api/src/common/redis/redis.service.ts` | `resolveRedisUrl()` fail-fast |
| 14 | `apps/api/src/common/tenant-scope.ts` | `financialOrgScope()` fail-closed |
| 15 | `apps/api/src/config/env-gate.ts` | Resolvers, `assertProductionConfig` |
| 16 | `apps/api/src/drizzle/schema.ts` | Re-exports operations schema |
| 17 | `apps/api/src/main.ts` | Boot gate + `enableShutdownHooks()` |
| 18 | `apps/api/src/modules/audit/audit.schema.ts` | feature_flags `updatedBy`/`createdAt` |
| 19 | `apps/api/src/modules/audit/audit.service.ts` | Ops counters on audit failure |
| 20 | `apps/api/src/modules/returns/commission-reversal.service.ts` | Ops counters (observability only) |
| 21 | `apps/api/src/modules/returns/return-expiration.worker.ts` | Lease fencing, pause, opt-in gate |
| 22 | `apps/api/src/modules/returns/returns.controller.ts` | 11 endpoints via `financialOrgScope()` |
| 23 | `apps/api/src/modules/returns/returns.module.ts` | Imports OperationsModule |
| 24 | `apps/api/src/modules/returns/returns.service.ts` | Pilot entry gate, refund counter |
| 25 | `apps/api/src/modules/returns/settlement-adjustment.service.ts` | fx_status fix, allow-listed posting, awaits |

---

## 3. Inclusion B — Untracked Source / CI / Deployment (27, exact)

| Group | Files |
|-------|-------|
| Operations module (12) | `apps/api/src/modules/operations/` — `operations.controller.ts`, `operations.module.ts`, `operations.schema.ts`, `ops-alert-signing.ts`, `ops-alert.service.ts`, `ops-control.service.ts`, `ops-counters.ts`, `p13-monitor.service.ts`, `p13-ops.config.ts`, `pilot-control.service.ts`, `raw-result.ts`, `worker-lease.service.ts` |
| New integration tests (3) | `apps/api/src/__tests__/integration/p4-http-authorization.postgres.spec.ts`, `p4-operational-readiness.postgres.spec.ts`, `p415-webhook-delivery.postgres.spec.ts` |
| New unit tests (3, in 2 new directories) | `apps/api/src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts`, `apps/api/src/__tests__/unit/operations/p415-webhook-signing.spec.ts`, `apps/api/src/__tests__/unit/operations/p418-signing-exception.spec.ts` |
| Migration (1) | `infra/drizzle/migrations/0063_phase4_operational_readiness.sql` |
| Deployment (6) | `infra/deploy/.env.production.example`, `infra/deploy/README.md`, `infra/deploy/admin.Dockerfile`, `infra/deploy/api.Dockerfile`, `infra/deploy/ci-postgres.Dockerfile`, `infra/deploy/web.Dockerfile` |
| Compose (1) | `infra/docker-compose.prod.yml` |
| Docker gate (1) | `.dockerignore` |

Directory-scoped adds below (`apps/api/src/modules/operations`, `apps/api/src/__tests__/unit/deployment`, `apps/api/src/__tests__/unit/operations`, `infra/deploy`) cover directories whose complete contents were enumerated and verified this session — each contains exactly the files listed above. This is not `git add -A`; scope is directory-verified.

---

## 4. Inclusion C — Documentation (glob, 88 at execution time)

All P13 phase reports: `docs/production/P13-PHASE-4-*.md`, `P13-PHASE-4.1-*.md`, `P13-PHASE-4.1.*.md` (Phases 4 → 4.1.12). The three globs are disjoint and match nothing else. The repo already tracks 272 files under `docs/production/`, so committing phase reports follows the established convention. They are the verification evidence chain for this release.

---

## 5. Required Migration & CI Workflow Files

All included above; called out because the release cannot ship without them:

| File | Role |
|------|------|
| `.github/workflows/ci.yml` | The 9-job gate: lint, boundary-lint, test-unit, test-integration, migration-gate, test-contract, build, container-build, mobile |
| `apps/api/infra/drizzle/migrate-pg.ts` | CI migration runner (transaction-per-file, `_migration_log`) |
| `apps/api/infra/drizzle/migrate.ts` | Dev runner (ON_ERROR_STOP, transactional logging) |
| `infra/drizzle/migrations/0063_phase4_operational_readiness.sql` | Ops tables + feature_flags columns (verified 63/63) |
| `infra/deploy/ci-postgres.Dockerfile` | Builds `scs-ci-postgres:ci` with pg_partman for migration-gate |
| `infra/deploy/api.Dockerfile`, `web.Dockerfile`, `admin.Dockerfile` | container-build job inputs |
| `.dockerignore` | Keeps credentials/Windows artifacts out of build context `.` |
| `infra/deploy/.env.production.example` | Placeholder-only deployment contract |

---

## 6. Exclusion List (1,272 files) — Marked for Review, NOT Deleted

| Group | Count | Reason for exclusion |
|-------|-------|---------------------|
| `.m73b6-scratch/p418-context/` | 1,260 | Full repository snapshot built for the Phase 4.1.8 baked-Linux-image verification. Contains `test-token.txt` (expired JWT, iat ≈ 2026-10-08, 15-min TTL — dead but a token artifact that must never be committed) and test fixtures. |
| `.m73b6-scratch/` other | 7 | `Dockerfile.p416ci`, `p418-archive.tar`, 2 `p418-file-inject/` files, plus Phase 4.1.12 session artifacts (audit diff, integration log, migration log, verification scripts). |
| Root probes (2) | 2 | `.p41-net-probe.mjs`, `p41-p4suites.json` — Phase 4.1 session probes. |
| `apps/api/` probes (3) | 3 | `.p41-counts.cjs`, `.p41-runbook-check.ps1`, `.p41-secretscan.cjs` — Phase 4 session helpers. |

No scratch file was deleted. Recommended (future housekeeping change, not this RC): add `.m73b6-scratch/`, `.p41-*`, `p41-*.json` to `.gitignore`.

---

## 7. Generated Artifacts Requiring Review

- `.m73b6-scratch/p418-archive.tar`, `Dockerfile.p416ci`, `p418-context/` — historical phase artifacts; keep on disk for audit until the 4.1.8 evidence chain is retired; never commit.
- `.m73b6-scratch/p4112-*.log`, `p4112-*.ps1`, `p4112-audit-tracked-diff.txt` — this phase's raw evidence; preserved untracked for reviewer inspection.
- No build outputs appear as untracked files: `dist/` and coverage are covered by existing `.gitignore` patterns (verified — none in `git status`).

---

## 8. Secret-Scanning Results

Scanned: full tracked diff (1,868 lines) + all 116 non-scratch untracked files. Patterns: AWS keys, `sk-`/`ghp_` tokens, JWT literals, private-key blocks, password/secret assignments, credentialed postgres/redis URLs, cloud endpoints.

| Finding | Verdict |
|---------|---------|
| `JWT_ACCESS_SECRET='ci-test-secret-at-least-16-chars!!'` (ci.yml smoke test) | Explicitly labelled CI-only test value; pre-existing repo pattern; not a credential |
| `postgresql://scs:scs_test@localhost...` (ci.yml service containers) | Standard CI service credentials |
| `scs_dev_2026` dev DSN | Pre-existing localhost-only dev credential; diff moves it into named constant `DEV_DATABASE_URL` and makes production refuse to fall back to it. Unchanged exposure. |
| Untracked source files | 0 hits |
| `infra/deploy/.env.production.example` | Placeholder-only (`__REPLACE_ME__*`) |
| `test-token.txt` (scratch) | Expired JWT — excluded from RC; must never be committed |

**CLEAN** — no accidental credentials, production URLs, or secrets in the proposed inclusion set.

---

## 9. Unresolved Scope Ambiguity

1. **Docs commit granularity** — commit the 88 phase reports with the code (single RC commit, as proposed in §11) or as a separate docs-only commit. Both are defensible; the single-commit staging below is the default proposal. Reviewer may split at staging time by running group L separately.
2. **AL-17 known-red on hosted CI** — no `P13_OPS_ALERT_WEBHOOK_URL` is configured in ci.yml, so the hosted integration run will show exactly 1 failed test (AL-17, fail-closed, no receiver). The committer must choose at authorization time: accept the documented known-red, or first add a CI-local receiver (code change, out of this phase's scope). Making AL-17 pass by weakening/skipping is prohibited.
3. **Scratch housekeeping** — future `.gitignore` change for the 1,272 excluded files; deliberately not bundled into this RC.

---

## 10. Proposed Commit Message

Subject ≤ 72 chars; body as exact text below. Recommended delivery: write this content to `.m73b6-scratch/p4112-commit-msg.txt` and commit with `git commit -F`.

```
feat(p13): operational readiness, financial isolation, CI gates

Phase 4 operational readiness for P13 production hardening.

- Operations module (12 files): worker lease service with epoch
  fencing, HMAC-SHA256 signed ops alerts (fail-closed on short
  secrets), ops controls with audit trail, P13 monitor, pilot
  controls, ops counters
- Expiration worker: opt-in via P13_WORKER_ENABLED, lease fencing
  with per-item re-check, pause control, graceful lease release on
  SIGTERM; escalates REQUESTED->ESCALATED only
- Financial isolation: financialOrgScope() fail-closed tenant scoping
  across all 11 financial endpoints; audit-loss and reversal-failure
  counters
- Settlement adjustments: fx_status 'BLOCKED_FX' -> 'BLOCKED' (was an
  illegal value violating CHECK 0061), allow-listed posting, missing
  transaction awaits fixed; admin canPostFx() aligned
- Config: env-gate resolvers (fail-fast outside dev), production boot
  gate, Redis fail-fast, graceful shutdown hooks
- Migration 0063 (ops tables, feature_flags columns); migration
  runners hardened (ON_ERROR_STOP, transactional logging, CI applies
  all 63 with pg_partman)
- CI: enforcing migration gate, container-build job (safe defaults:
  worker disabled, pilot legacy; non-root check)
- Deployment: infra/deploy Dockerfiles + compose + placeholder-only
  env example; .dockerignore; .nvmrc 22; .gitignore .env.* hardening
- Tests: 3 new integration suites, 3 new unit suites (incl.
  deployment invariants), settlement spec strengthened
- Docs: P13 phase reports 4 through 4.1.12 in docs/production

Local verification: typecheck 9/9, lint 0 errors, unit 279/279,
integration 150/151 (AL-17 fail-closed, no receiver configured),
migrations 63/63 fresh + idempotent, Turbo build 6/6.
Hosted CI run pending authorization.
```

---

## 11. Exact Staging Commands (Approved List Only — No `git add -A`)

```powershell
cd C:\TAIF\scs-platform

# A. Root config, CI, Docker gate
git add -- .gitignore .nvmrc .dockerignore .github/workflows/ci.yml

# B. Admin UI fix
git add -- apps/admin/src/app/settlement-adjustments/page.tsx

# C. Migration runners
git add -- apps/api/infra/drizzle/migrate.ts apps/api/infra/drizzle/migrate-pg.ts

# D. API core
git add -- apps/api/src/app.module.ts apps/api/src/main.ts apps/api/src/drizzle/schema.ts
git add -- apps/api/src/common/database/database.service.ts apps/api/src/common/redis/redis.service.ts apps/api/src/common/tenant-scope.ts
git add -- apps/api/src/config/env-gate.ts

# E. Audit module
git add -- apps/api/src/modules/audit/audit.schema.ts apps/api/src/modules/audit/audit.service.ts

# F. Returns module (6 modified)
git add -- apps/api/src/modules/returns/commission-reversal.service.ts apps/api/src/modules/returns/return-expiration.worker.ts apps/api/src/modules/returns/returns.controller.ts apps/api/src/modules/returns/returns.module.ts apps/api/src/modules/returns/returns.service.ts apps/api/src/modules/returns/settlement-adjustment.service.ts

# G. Operations module (directory verified: exactly 12 files)
git add -- apps/api/src/modules/operations

# H. Tests — modified (4)
git add -- apps/api/src/__tests__/unit/returns/settlement-adjustment.spec.ts apps/api/src/__tests__/integration/p13-financial-dispute.postgres.spec.ts apps/api/src/__tests__/integration/p13-returns.postgres.spec.ts apps/api/src/__tests__/integration/p311-concurrency.postgres.spec.ts

# I. Tests — new (3 files + 2 verified directories)
git add -- apps/api/src/__tests__/integration/p4-http-authorization.postgres.spec.ts apps/api/src/__tests__/integration/p4-operational-readiness.postgres.spec.ts apps/api/src/__tests__/integration/p415-webhook-delivery.postgres.spec.ts
git add -- apps/api/src/__tests__/unit/deployment apps/api/src/__tests__/unit/operations

# J. Migration 0063
git add -- infra/drizzle/migrations/0063_phase4_operational_readiness.sql

# K. Deployment (directory verified: exactly 6 files) + compose
git add -- infra/deploy infra/docker-compose.prod.yml

# L. Phase reports (88 at execution time)
git add -- "docs/production/P13-PHASE-4-*.md" "docs/production/P13-PHASE-4.1-*.md" "docs/production/P13-PHASE-4.1.*.md"
```

---

## 12. Commands for Reviewing the Staged Diff Before Committing

```powershell
# Exact staged list and count — expect 140
git diff --cached --name-only
(git diff --cached --name-only | Measure-Object -Line).Lines

# Guard: nothing from scratch/probes may be staged — expect NO output
git diff --cached --name-only | Select-String -Pattern 'm73b6-scratch|p41-|test-token'

# Unstaged remainder — expect only ?? scratch + probes
git status --short

# Stats and sanity
git diff --cached --stat
git diff --cached --check        # expect no output (no whitespace errors / conflict markers)

# Final full read of everything about to be committed
git diff --cached
```

If any count differs from 140, STOP and reconcile against §2–§4 before committing.

---

## 13. Phase Boundary

Phase 4.1.12 performed zero staging, zero commits, zero pushes, zero deletions. Every command in §11–§12 is part of the future authorized sequence documented in `P13-PHASE-4.1.12-HOSTED-CI-AUTHORIZATION-GATE.md`.
