# P13 Phase 4.1.5 — Baseline Report

**Date:** 2026-10-15  
**Starting commit:** `ed6c30f2bfcd21db883f2e5ec4a7a0cda65cd75c` (develop)  
**Working tree:** 24 modified files (uncommitted), includes Phase 4.1.4 changes

## Preserved Phase 4.1.4 Changes

| File | Status | Purpose |
|------|--------|---------|
| `.github/workflows/ci.yml` | Modified | Enforcing migration gate with custom pg_partman image |
| `infra/deploy/ci-postgres.Dockerfile` | New | PostgreSQL 16 + PostGIS 3.6.4 + pg_partman 5.5.0 CI image |
| `apps/api/infra/drizzle/migrate-pg.ts` | Modified | All 63 migrations included (no exclusions for CI runner) |

## Source Code Inspection

### ops-alert.service.ts (421 lines)
- Webhook delivery: Lines 246-257 — fetch() with content-type: application/json only
- HMAC signing: NOT implemented (Phase 4.1.4 finding confirmed)
- Payload: Lines 306-327 — buildPayload() returns identifiers and counts only
- Recursion guard: Line 282 — deliveringFailureAlert flag prevents infinite loops
- Dedup: deriveDedupKey() at line 108 — conditionKey:resourceId format

### p13-ops.config.ts (139 lines)
- Parsed env vars: P13_OPS_ALERT_WEBHOOK_URL (line 110), no secret parsed
- Safe defaults: workerEnabled=false, pilotMode=legacy, alertWebhookUrl=null
- No P13_OPS_ALERT_WEBHOOK_SECRET parsing exists

## Safe Defaults Verified
- P13_WORKER_ENABLED = false
- P13_PILOT_MODE = legacy
- P13_OPS_ALERT_WEBHOOK_URL = null
- Pilot allowlist = empty
- Merchant SLA = 72 elapsed hours
- Admin review = 3 business days (UTC business calendar)

## Scope of Phase 4.1.5
1. Implement HMAC-SHA256 webhook signing
2. Add comprehensive automated tests
3. Investigate test failures/timeouts from Phase 4.1.4
4. Revalidate migration and CI gates
5. Regression and operational safety review

## Constraints
- No commit, push, merge, deploy, or pilot activation
- No production financial changes
- Disposable infrastructure only
- Fail closed — unsigned alerts never sent
