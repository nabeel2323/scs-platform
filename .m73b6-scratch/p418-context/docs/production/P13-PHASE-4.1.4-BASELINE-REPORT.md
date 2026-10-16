# P13 Phase 4.1.4 — Baseline Report

| Field | Value |
|-------|-------|
| Phase | 4.1.4 — Operational Verification Closure and Enforcing Release Gates |
| Branch | develop |
| Baseline commit | ed6c30f |
| Date | 2026-10-15 |
| Status | Executed — all stages completed |

## 1. Repository State

- **HEAD**: ed6c30f `test(migrations): verify existence of migration 0062`
- **Working tree**: 22 modified files (uncommitted), 30+ untracked
- **Modified areas**: CI workflow, API operations module, migration runner, integration tests, admin UI pages
- **Docker images available**: `scs-api:p41-local` (1.76GB), `postgis/postgis:16-3.4`, `postgres:16-bookworm`

## 2. Migration Inventory

- **Total migration files**: 63 (0001–0063)
- **Migrations requiring pg_partman**: 0013_analytics.sql, 0018_analytics_retention.sql
- **Previous CI image**: `postgis/postgis:16-3.4` — lacks pg_partman
- **New CI image**: `scs-ci-postgres:16-partman` — PostgreSQL 16 + PostGIS 3.6.4 + pg_partman 5.5.0
- **CI image Dockerfile**: `infra/deploy/ci-postgres.Dockerfile`

## 3. P13 Operations Module

| Component | File | Key Properties |
|-----------|------|----------------|
| Worker lease | `worker-lease.service.ts` | DB row, epoch fencing, TTL=90s, heartbeat=30s |
| Alert service | `ops-alert.service.ts` | Dedup by key, state machine PENDING→SENT/FAILED/SUPPRESSED |
| Ops control | `ops-control.service.ts` | Pause/resume with audit trail |
| Pilot control | `pilot-control.service.ts` | Feature flag + allowlist, fail-closed |
| Monitor | `p13-monitor.service.ts` | 10 conditions, periodic scan |
| Config | `p13-ops.config.ts` | All P13_ env vars, safe defaults |
| Controller | `operations.controller.ts` | `GET /v1/admin/ops/p13/status` |

## 4. Default Configuration

| Setting | Default | Env Var |
|---------|---------|---------|
| Worker enabled | `false` | P13_WORKER_ENABLED |
| Pilot mode | `legacy` | P13_PILOT_MODE |
| Lease TTL | 90s | P13_WORKER_LEASE_TTL_SECONDS |
| Heartbeat | 30s | P13_WORKER_HEARTBEAT_INTERVAL_MS |
| Alert timeout | 5s | P13_ALERT_DELIVERY_TIMEOUT_MS |
| Alert repeat window | 15min | P13_ALERT_REPEAT_WINDOW_MS |

## 5. CI Pipeline State (Pre-Changes)

- 10 jobs defined in `.github/workflows/ci.yml`
- Migration gate used `postgis/postgis:16-3.4` service container
- Full migration apply had `continue-on-error: true` (NOT enforcing)
- Migrations 0013 and 0018 excluded from CI runner (`EXCLUDED` set in `migrate-pg.ts`)

## 6. Critical Pre-Existing Findings

### Alert Signing NOT Implemented
Source code inspection of `ops-alert.service.ts` lines 247–252 reveals the `fetch()` call sends only:
```
headers: { 'content-type': 'application/json' }
```
No `X-SCS-Alert-Signature` header. No HMAC-SHA256. No `P13_OPS_ALERT_WEBHOOK_SECRET` env var parsed. Prior Phase 4.1.2/4.1.3 reports incorrectly stated signing was implemented.

### Migration Chain Partial
The CI migration gate previously skipped 0013 and 0018, meaning the schema was incomplete for analytics partitioning. This phase resolves both gaps.

## 7. Scope of Execution

| Priority | Stage | Description |
|----------|-------|-------------|
| 1 | Full migration chain | Build pg_partman image, apply all 63 migrations |
| 2 | Worker exclusivity | 10 scenarios via direct SQL against disposable DB |
| 3 | Recovery/rollback | 10 scenarios testing forward-only properties |
| 4 | Alert delivery | Disposable HTTP receiver, payload analysis |
| 5 | CI release gates | Enforcing migration gate, typecheck, unit tests |

## 8. Constraints

- No production deployment, pilot activation, git push, or merge
- P13_WORKER_ENABLED=false, P13_PILOT_MODE=legacy throughout
- Only disposable infrastructure and synthetic data
- No production financial data accessed
