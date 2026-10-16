# P13 Phase 4.1.5 — Regression and Safety Report

**Date:** 2026-10-15  
**Scope:** All P13 operational safety invariants verified against source code

## P13 Safe Defaults (verified from p13-ops.config.ts)

| Invariant | Source | Status |
|-----------|--------|--------|
| P13_WORKER_ENABLED = false | DEFAULTS.workerEnabled (line 67) | INTACT |
| P13_PILOT_MODE = 'legacy' | DEFAULTS.pilotMode (line 77) | INTACT |
| Pilot allowlist empty | No entries seeded by default | INTACT |
| Merchant SLA = 72 hours | MERCHANT_SLA_HOURS = 72 (returns.service.ts line 49) | INTACT |
| Admin review = 3 business days | addBusinessDays(escalatedAt, 3) (returns.service.ts line 785) | INTACT |
| Alert webhook URL = null | DEFAULT (line 117) | INTACT |
| Alert webhook secret = null | DEFAULT (line 118) | INTACT |

## Operational Safety Rules

| Rule | Verification | Status |
|------|-------------|--------|
| Timeout escalates only; never auto-approves/rejects/refunds/expires | return-expiration.worker.ts: only calls escalateReturn() | INTACT |
| Commission reversals idempotent, capped, transactionally consistent | commission-reversal.service.ts: idempotency_key + cap check | INTACT |
| Settlement approvals + FX fail-closed | settlement-adjustment.service.ts: fx_status check | INTACT |
| Voucher refund behavior unchanged | No changes to voucher/refund code paths | INTACT |
| Tenant isolation enforced | tenant-scope.ts: organization scoping unchanged | INTACT |
| Permission checks enforced | PermissionsGuard unchanged | INTACT |
| No historical backfill | No migration or seed changes | INTACT |
| No automatic clawback | No new financial automation | INTACT |
| No production financial changes | Only alert signing added | INTACT |

## Changed Files Review

### Phase 4.1.5 Changes (3 files)

| File | Change | Risk |
|------|--------|------|
| p13-ops.config.ts | Added secret parsing + fail-closed | LOW — additive, backward compatible |
| ops-alert.service.ts | Added HMAC signing to deliver() | LOW — additive, no behavior change when no secret |
| ops-alert-signing.ts | New utility module | NONE — no consumers except tests |

### Phase 4.1.4 Changes (preserved, 3 files)

| File | Change | Risk |
|------|--------|------|
| ci.yml | Enforcing migration gate | LOW — CI-only |
| ci-postgres.Dockerfile | Custom CI image | LOW — CI-only |
| migrate-pg.ts | Removed EXCLUDED set | LOW — CI runner only |

### Other Modified Files (pre-existing from prior phases)

24 total modified files include changes from Phases 4, 4.1, 4.1.2, 4.1.3, and 4.1.4. No accidental unrelated changes detected in the Phase 4.1.5 diff.

## Compatibility

- **Backward compatible:** When no `P13_OPS_ALERT_WEBHOOK_SECRET` is set, behavior is identical to Phase 4.1.4 (unsigned delivery when URL is set, log-only when not)
- **No breaking API changes:** No endpoint signatures changed
- **No database changes:** No new migrations
- **No dependency changes:** Uses only Node.js built-in `crypto` module

## Diff Summary

- Starting commit: `ed6c30f`
- Phase 4.1.5 additions: 3 files modified/created (+99 lines net)
- No unrelated changes introduced
- No credentials in diff
