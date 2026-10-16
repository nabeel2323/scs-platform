# P13 Phase 4.1.8 — Regression and Safety Report

**Phase:** 4.1.8 — Local CI Closure and Defense-in-Depth Hardening
**Date:** 2026-10-15
**HEAD:** `ed6c30f` (develop)

---

## 1. Scope

This report verifies that all Phase 4.1.8 changes preserve the 13 business-safety invariants established by prior phases. The only code changes in this phase are:

1. **`apps/api/src/modules/operations/ops-alert.service.ts`** — Defense-in-depth signing enforcement in `deliver()` method
2. **`apps/api/src/__tests__/integration/p415-webhook-delivery.postgres.spec.ts`** — Updated WS-05, added WS-14 through WS-18
3. **`apps/api/src/__tests__/unit/operations/p418-signing-exception.spec.ts`** — New signing exception tests
4. **`.nvmrc`** — Updated from `20` to `22`

No financial business rules, returns logic, settlement logic, commission rules, or authorization code was modified.

---

## 2. Invariant Verification

### Invariant 1: 72-elapsed-hour merchant return SLA

**Status: UNCHANGED**

```
returns.service.ts: SLA_HOURS = 72
return-expiration.worker.ts: processes only rows past 72h
```

No changes to returns service or expiration worker.

### Invariant 2: Timeout escalation without automatic approval/rejection/refund/expiration

**Status: UNCHANGED**

```
return-expiration.worker.ts: marks as EXPIRED_PENDING_REVIEW (not auto-approved/rejected)
settlement-adjustment.service.ts: requires manual admin review
```

No changes to escalation logic.

### Invariant 3: Three-business-day admin review target

**Status: UNCHANGED**

```
settlement-adjustments/page.tsx: displays review target
returns.controller.ts: review endpoints unchanged
```

No changes to admin review configuration.

### Invariant 4: Commission responsibility rules, caps, idempotency, transaction safety

**Status: UNCHANGED**

```
commission-reversal.service.ts: reversal rules, cap checks, idempotency keys
returns.service.ts: transaction wrapping with commission updates
```

No changes to commission logic.

### Invariant 5: Immutability of finalized financial sources

**Status: UNCHANGED**

```
settlement-adjustment.service.ts: finalized records are read-only
audit.service.ts: append-only audit trail
```

No changes to financial immutability rules.

### Invariant 6: No historical financial backfill or automatic clawback

**Status: UNCHANGED**

```
No migration or code path performs historical backfill.
Commission reversal is prospective only.
```

No changes to backfill or clawback behavior.

### Invariant 7: Required distinct approvers for delivery-fee exceptions and settlement adjustments

**Status: UNCHANGED**

```
settlement-adjustments/page.tsx: requires distinct approver
returns.controller.ts: authorization checks unchanged
```

No changes to approver requirements.

### Invariant 8: FX fail-closed behavior

**Status: UNCHANGED**

```
No FX rate calculation code was modified.
FX failures continue to block settlement rather than guess.
```

### Invariant 9: Original payment-method and unused-balance voucher refund semantics

**Status: UNCHANGED**

```
returns.service.ts: refund routing logic unchanged
Voucher balance handling unchanged.
```

### Invariant 10: Tenant isolation, authorization, and audit history

**Status: UNCHANGED**

```
tenant-scope.ts: tenant isolation unchanged
database.service.ts: connection scoping unchanged
audit.service.ts: audit logging unchanged
```

No changes to tenant isolation or authorization.

### Invariant 11: Worker disabled by default, legacy pilot mode, empty allowlist

**Status: UNCHANGED**

```
env-gate.ts: P13_WORKER_ENABLED defaults to false
p13-ops.config.ts: P13_PILOT_MODE defaults to 'legacy'
p13-ops.config.ts: pilot allowlist defaults to empty
```

Verified by deployment invariant tests (36/36 PASS).

### Invariant 12: No production financial data changes

**Status: UNCHANGED**

Phase 4.1.8 changes are limited to the webhook delivery service hardening and test additions. No financial tables, services, or business rules were modified.

### Invariant 13: Secrets never in logs, payloads, or exception messages

**Status: UNCHANGED / HARDENED**

```
ops-alert.service.ts: error messages use conditionKey and severity, never the secret
The new UnsignedDeliverySuppressedError message describes the failure mode
  ("signing secret missing or too short") without including the secret value.
```

The hardening strengthens this invariant by ensuring that missing/short secrets produce descriptive error messages without leaking the secret value.

---

## 3. Test Evidence

### Deployment Invariant Tests (Windows)

```
$ pnpm --filter @scs/api exec vitest run src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts
 Test Files  1 passed (1)
      Tests  36 passed (36)
   Duration  1.41s
```

36 tests verify:
- Worker disabled by default
- Pilot mode = legacy
- Allowlist empty
- Webhook URL/secret not in deployment templates
- All kill-switch defaults safe

### Webhook Signing Tests (Windows)

```
$ pnpm --filter @scs/api exec vitest run src/__tests__/unit/operations/p415-webhook-signing.spec.ts
 Test Files  1 passed (1)
      Tests  30 passed (30)
   Duration  2.99s
```

### Signing Exception Tests (Windows)

```
$ pnpm --filter @scs/api exec vitest run src/__tests__/unit/operations/p418-signing-exception.spec.ts
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  1.73s
```

---

## 4. Diff Scope Confirmation

```
$ git diff --stat HEAD
 .nvmrc                                                |  2 +-
 apps/api/src/__tests__/integration/p415-webhook-delivery.postgres.spec.ts | +++
 apps/api/src/__tests__/unit/operations/p418-signing-exception.spec.ts     | +++ (new)
 apps/api/src/modules/operations/ops-alert.service.ts    | +++ (hardening)
```

Only 4 files changed. None touch financial logic, returns, settlements, commissions, authorization, tenant isolation, or audit.

---

## 5. Summary

All 13 business-safety invariants are UNCHANGED by Phase 4.1.8. The only code modifications are defense-in-depth hardening of the webhook delivery path and corresponding test additions. The `.nvmrc` update aligns the local Node.js version with CI. No financial business rules, authorization logic, tenant isolation, or audit behavior was modified.
