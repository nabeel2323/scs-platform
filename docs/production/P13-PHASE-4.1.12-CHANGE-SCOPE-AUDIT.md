# P13 Phase 4.1.12 — Change Scope Audit

**Phase:** 4.1.12 | **Date:** 2026-10-16 | **Branch:** develop | **HEAD:** ed6c30f

---

## 1. Inventory Method

Commands executed: `git status --porcelain`, `git diff --name-only`, `git diff --stat`, `git ls-files --others --exclude-standard`, `git ls-files docs/production`. The full tracked diff (1,868 lines, 25 files) was read end-to-end; every untracked file was categorized; secret-pattern scans were run against both the diff and the untracked source set.

**Deleted tracked files: none.** The porcelain status contains only `M` (modified) and `??` (untracked) entries.

---

## 2. Modified Tracked Files (25) — All Necessary for the RC

| File | Change | Why necessary |
|------|--------|---------------|
| `.github/workflows/ci.yml` | Migration gate upgraded from best-effort dry-run+`continue-on-error` to enforcing full 63-file apply with pg_partman; `container-build` job added | Required: CI gates must match the release-verified behavior |
| `.gitignore` | `.env.*` ignored, `!.env.example`/`!.env.*.example` allowed | Required: prevents filled env files with credentials from being committable |
| `.nvmrc` | 20 → 22 | Required: aligns local Node with CI `NODE_VERSION: '22'` |
| `apps/admin/src/app/settlement-adjustments/page.tsx` | `canPostFx()` allow-list fix; FAILED filter option | Required: previous `!== 'BLOCKED_FX'` test matched every row — UI offered Post exactly where the server returns 409 |
| `apps/api/infra/drizzle/migrate-pg.ts` | Removes the 0013/0018 exclusion set | Required: CI runner must apply all 63 migrations |
| `apps/api/infra/drizzle/migrate.ts` | Dev runner: `ON_ERROR_STOP=1`, transaction-wrapped `_migration_log` insert, loud skip warnings | Required: previously logged migrations that silently failed (psql keeps going, exit 0) |
| `apps/api/src/__tests__/integration/p13-financial-dispute.postgres.spec.ts` | Harness: ReturnsService gains PilotControlService arg | Required: constructor change; gate is pass-through in this suite (no flag) |
| `apps/api/src/__tests__/integration/p13-returns.postgres.spec.ts` | Same harness update | Required: same |
| `apps/api/src/__tests__/integration/p311-concurrency.postgres.spec.ts` | TC-03 fixture: `fx_status 'BLOCKED'→'RESOLVED'` | Required: posting guard is allow-listed now; the concurrency property tested is unchanged |
| `apps/api/src/__tests__/unit/returns/settlement-adjustment.spec.ts` | fx_status vocabulary fix + NEW tests (schema-allowed values, PENDING_REVIEW blocked, unknown value fail-closed) | Required: test strengthening, mirrors service fix |
| `apps/api/src/app.module.ts` | Registers OperationsModule | Required |
| `apps/api/src/common/database/database.service.ts` | DATABASE_URL via `resolveDatabaseUrl()` (fail-fast outside dev) | Required: no silent localhost fallback in deployed envs |
| `apps/api/src/common/redis/redis.service.ts` | REDIS_URL via `resolveRedisUrl()` | Required: Redis holds the token denylist |
| `apps/api/src/common/tenant-scope.ts` | Adds `financialOrgScope()` (fail-closed, counts denials) | Required: closes the missing-`activeOrg` fail-open on financial records |
| `apps/api/src/config/env-gate.ts` | DEV DSN constants, resolvers, `describeAlertSink`, `assertProductionConfig` | Required: production boot gate |
| `apps/api/src/drizzle/schema.ts` | Re-exports operations schema | Required |
| `apps/api/src/main.ts` | `assertProductionConfig()` + `enableShutdownHooks()` (worker releases lease on SIGTERM) | Required |
| `apps/api/src/modules/audit/audit.schema.ts` | feature_flags `updatedBy`/`createdAt` columns | Required: matches migration 0063 |
| `apps/api/src/modules/audit/audit.service.ts` | Ops counters on audit write success/failure | Required: lost audit rows become alerts, not assumptions |
| `apps/api/src/modules/returns/commission-reversal.service.ts` | Ops counters on reversal failure/duplicate; error rethrown unchanged | Required: observability only — transactional outcome untouched |
| `apps/api/src/modules/returns/return-expiration.worker.ts` | Phase-4 hardening: opt-in gate, lease fencing, pause control, per-item fence re-check, alerts | Required: exclusivity for the protected job |
| `apps/api/src/modules/returns/returns.controller.ts` | All 11 financial endpoints route through `financialOrgScope()` | Required: tenant isolation on financial records |
| `apps/api/src/modules/returns/returns.module.ts` | Imports OperationsModule | Required |
| `apps/api/src/modules/returns/returns.service.ts` | Pilot entry gate on create; `orgForStore`; refund-failure counter | Required |
| `apps/api/src/modules/returns/settlement-adjustment.service.ts` | `fxStatus 'BLOCKED_FX'→'BLOCKED'` (illegal value violated CHECK 0061 — no adjustment could ever be created); allow-listed posting; `await`-transaction fixes (dead-code trailing read) | Required: three real production defects fixed |

---

## 3. Untracked Source / CI / Deployment Files (27) — All Necessary for the RC

| Group | Files | Why necessary |
|-------|-------|---------------|
| Operations module (12) | `apps/api/src/modules/operations/` — operations.{controller,module,schema}.ts, ops-alert-signing.ts, ops-alert.service.ts, ops-control.service.ts, ops-counters.ts, p13-monitor.service.ts, p13-ops.config.ts, pilot-control.service.ts, raw-result.ts, worker-lease.service.ts | The P13 operational core referenced by the modified files; without it the app does not compile |
| Integration tests (3) | p4-http-authorization, p4-operational-readiness, p415-webhook-delivery postgres specs | The verification evidence backing the release |
| Unit tests (3) | p41-deployment-invariants, p415-webhook-signing, p418-signing-exception specs | Same; deployment-invariants spec is a CI container-build step |
| Migration (1) | `infra/drizzle/migrations/0063_phase4_operational_readiness.sql` | Required by worker/ops tables; verified 63/63 |
| Deployment (7) | `infra/deploy/.env.production.example` (placeholder-only), README.md, admin/api/ci-postgres/web Dockerfiles, `infra/docker-compose.prod.yml` | Required for container-build CI job and documented deployment shape |
| Docker build gate (1) | `.dockerignore` | Required: keeps credentials/Windows artifacts out of images; container-build uses context `.` |

---

## 4. Untracked Documentation (82) — Recommended for Inclusion

All files under `docs/production/` matching `P13-PHASE-4-*.md`, `P13-PHASE-4.1-*.md`, `P13-PHASE-4.1.*.md` (Phases 4 through 4.1.11). The repo already tracks 272 files in `docs/production/` (including earlier P13 governance artifacts and an .xlsx register), so committing phase reports follows the established convention. They are the verification evidence chain; without them the release lacks its audit trail. A reviewer may prefer to split them into a separate docs-only commit — flagged as the one scope-ambiguity decision.

---

## 5. Untracked Scratch / Unrelated (1,274) — Excluded, Marked for Review (Not Deleted)

| Group | Count | Assessment |
|-------|-------|------------|
| `.m73b6-scratch/p418-context/` | 1,260 | Full repo snapshot built for the Phase 4.1.8 baked-Linux-image verification. Includes `test-token.txt` (an expired short-lived JWT, iat/exp ≈ 2026-10-08, 15-min TTL — dead but still a token artifact that must never be committed) and test fixtures (`test-valid.csv`, `test-errors.xlsx`). Not RC content. |
| `.m73b6-scratch/` other | 9 | `Dockerfile.p416ci`, `p418-archive.tar`, 2 `p418-file-inject/` files, + 5 Phase 4.1.12 session artifacts (audit diff, integration log, migration log, 2 verification scripts) |
| Root probes | 2 | `.p41-net-probe.mjs`, `p41-p4suites.json` — Phase 4.1 session probes |
| `apps/api/` probes | 3 | `.p41-counts.cjs`, `.p41-runbook-check.ps1`, `.p41-secretscan.cjs` — Phase 4 session helpers |

No scratch file was deleted. Recommendation (not executed): add `.m73b6-scratch/`, `.p41-*`, `p41-*.json` patterns to `.gitignore` in a future housekeeping change.

---

## 6. Diff Inspection Findings

### 6.1 Secrets — CLEAN (with 3 explained patterns)

Scan patterns: AWS keys, `sk-` tokens, `ghp_` tokens, JWT literals, private-key blocks, password/secret assignments, postgres/redis URLs with credentials, cloud endpoints.

| Hit | Verdict |
|-----|---------|
| `JWT_ACCESS_SECRET='ci-test-secret-at-least-16-chars!!'` (ci.yml, container-build smoke) | Explicitly-labelled CI-only test value, pre-existing repo pattern; not a credential |
| `postgresql://scs:scs_test@localhost:5432|5433/...` (ci.yml) | Standard CI service-container credentials |
| `scs_dev_2026` DSN | Pre-existing localhost-only dev credential; this diff merely moves it into a named constant `DEV_DATABASE_URL` in env-gate.ts and makes production refuse to fall back to it. Unchanged exposure. |

Untracked source files: **0 hits**. `infra/deploy/.env.production.example`: placeholder-only (`__REPLACE_ME__*`), explicitly documented as containing no secrets.

### 6.2 Test Weakening — NONE

All test changes either strengthen assertions (settlement spec gains 3 new fail-closed cases) or update fixtures to match corrected service behavior (fx_status vocabulary; PilotControlService constructor arg with the gate pass-through in these suites). No assertion was removed, loosened, or skipped; the integration suites contain zero conditional skips (grep for `skipIf|.skip(|todo(` across all 6 suites: 0 hits).

### 6.3 Unintended Business-Policy Changes — NONE

The 13 safety invariants hold in the diff itself: the worker still only escalates (REQUESTED→ESCALATED, comment: "never approves, rejects, refunds, or expires a return on SLA elapse alone"); posting remains FX-blocked (now allow-listed, strictly tighter); dual approval and creator-cannot-approve unchanged; `financialOrgScope` strictly tightens authorization; commission reversal error path rethrows unchanged. The three service defects fixed (illegal fx_status value, dead-code transaction returns, UI post-button inversion) were making documented policy UNENFORCEABLE — fixing them restores the locked policy.

### 6.4 Unrelated Modifications — NONE

Every modified file maps to a P13 Phase 4 deliverable. No drive-by refactors, formatting churn, or version bumps beyond the two intentional CI alignment changes.

---

## 7. Status

**PASS** — Scope fully determined. 25 + 27 + 82 files proposed for inclusion; 1,274 scratch files excluded and marked for review; no secrets, no test weakening, no policy drift, no unrelated changes.
