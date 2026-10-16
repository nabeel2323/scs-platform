# P13 Phase 4.1.6 — Baseline Report

**Date:** 2026-10-15  
**Starting commit:** `ed6c30f2bfcd21db883f2e5ec4a7a0cda65cd75c` (develop)  
**Working tree:** 24+ modified files (uncommitted), includes Phases 4.1.4 and 4.1.5 changes

## Preserved Prior Work

### Phase 4.1.4 Changes
- `.github/workflows/ci.yml` — Enforcing migration gate with custom pg_partman image
- `infra/deploy/ci-postgres.Dockerfile` — PostgreSQL 16 + PostGIS + pg_partman CI image
- `apps/api/infra/drizzle/migrate-pg.ts` — All 63 migrations included

### Phase 4.1.5 Changes
- `apps/api/src/modules/operations/ops-alert.service.ts` — HMAC signing in deliver()
- `apps/api/src/modules/operations/p13-ops.config.ts` — Secret parsing, fail-closed validation
- `apps/api/src/modules/operations/ops-alert-signing.ts` — Signing utilities (now v2 with timestamp)
- `apps/api/src/__tests__/unit/operations/p415-webhook-signing.spec.ts` — 30 unit tests
- `apps/api/src/__tests__/integration/p415-webhook-delivery.postgres.spec.ts` — 13 integration tests

## Source Code Reconciliation

### Fail-Closed Behavior (verified from source)
The config layer at `p13-ops.config.ts` line 148-151:
```
if (merged.alertWebhookUrl && (!merged.alertWebhookSecret || merged.alertWebhookSecret.length < 32)) {
  merged.alertWebhookSecret = null;
  merged.alertWebhookUrl = null;
}
```
This ensures: when a webhook URL is configured but the secret is missing or < 32 chars, BOTH are nulled. Delivery falls back to log-only. Unsigned alerts are NEVER sent to an external sink.

### Phase 4.1.5 Report Discrepancy
The Phase 4.1.5 regression report stated "When no secret is set, behavior is identical to Phase 4.1.4 (unsigned delivery when URL is set)". This was INCORRECT. The fail-closed code was already in place. The integration test WS-05 bypassed the config layer by setting `config.alertWebhookUrl` directly on the service after construction, which is not a production code path. In production, the config constructor always runs fail-closed.

### v2 Signing Protocol (Phase 4.1.6)
The signing protocol now includes a timestamp for replay protection:
- Canonical input: `<timestamp>.<body>`
- Headers: `X-SCS-Alert-Signature: sha256=<hex>` + `X-SCS-Alert-Timestamp: <unix-seconds>`
- Backward incompatible with v1 receivers

## Scope of Phase 4.1.6
1. Resolve fail-closed discrepancy (documentation correction)
2. Add replay protection (timestamp + canonical signing)
3. Add security regression tests for replay protection
4. Linux CI validation
5. Migration and release gate validation
6. Regression and safety review
