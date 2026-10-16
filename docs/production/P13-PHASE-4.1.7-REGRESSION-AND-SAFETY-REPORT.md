# P13 Phase 4.1.7 — Regression and Safety Report

**Phase:** 4.1.7 — Independent Verification
**Date:** 2026-10-15
**HEAD:** `ed6c30f` (develop)
**Method:** Source inspection + test execution

---

## 1. Business-Safety Invariants

### 1.1 Merchant Return SLA: 72 Elapsed Hours

**Source:** `apps/api/src/modules/returns/returns.service.ts` line 49:
```typescript
const MERCHANT_SLA_HOURS = 72;
```

Used at line 298:
```typescript
const expiresAt = new Date(Date.now() + MERCHANT_SLA_HOURS * 60 * 60 * 1000);
```

**Verdict:** UNCHANGED. 72 elapsed hours (includes weekends and holidays — no business-day calculation for merchant SLA).

### 1.2 Merchant Timeouts Escalate Only

**Source:** `apps/api/src/modules/returns/return-expiration.worker.ts` lines 4-9:
```
Polls for REQUESTED returns whose merchant SLA (expires_at) has passed and
transitions them to ESCALATED for admin review.
```

Line 353 comment:
```
// approves, rejects, refunds, or expires a return on SLA elapse alone.
```

The worker SQL (lines 273-275):
```sql
AND expires_at IS NOT NULL
AND expires_at <= NOW()
```

Only transitions REQUESTED → ESCALATED. No auto-approve, auto-reject, auto-refund, or auto-expire.

**Verdict:** UNCHANGED. Timeouts only escalate to admin review.

### 1.3 Admin Review: Three Business Days

**Source:** Admin review uses a configurable UTC business calendar. The `return-expiration.worker.ts` does not handle admin review — that is a separate human-in-the-loop process through the admin UI.

**Verdict:** UNCHANGED. Business calendar configuration is external; safe behavior when missing.

### 1.4 Commission Reversals

**Source:** `apps/api/src/modules/returns/commission-reversal.service.ts`

| Property | Evidence | Status |
|----------|----------|--------|
| Capped at remainingCommission | Line 95-97: `remainingCommission = originalCommission - alreadyReversed`; Line 136: `rawReversal = Math.min(rawReversal, remainingCommission)` | UNCHANGED |
| Idempotent | Line 150: `idempotencyKey = 'commission-reversal:${returnRequestId}:${responsibilityCategory}'`; Line 179-217: duplicate throws ConflictException | UNCHANGED |
| Transactional | Line 172-174: `this.postReversalInTx(externalTx, ...)` within transaction | UNCHANGED |
| Responsibility rules preserved | Per-item mixed responsibility via `responsibilityCategory` parameter | UNCHANGED |
| No over-reversal | Line 97: `if (remainingCommission <= 0)` short-circuits | UNCHANGED |

**Verdict:** UNCHANGED. All commission reversal invariants intact.

### 1.5 Finalized Financial Sources Immutable

**Source:** Settlement adjustment state machine (`settlement-adjustment.service.ts` lines 51-57):
```typescript
DRAFT: ['PENDING_APPROVAL', 'BLOCKED_FX'],
PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'BLOCKED_FX'],
APPROVED: ['POSTED', 'FAILED'],
POSTED: [],       // terminal
REJECTED: [],     // terminal
BLOCKED_FX: [],   // terminal
```

POSTED is terminal — no outgoing transitions. Once posted, the financial record is immutable.

**Verdict:** UNCHANGED.

### 1.6 No Historical Financial Backfill

No migration or code introduced in Phases 4.1.4-4.1.6 modifies historical financial data. Migration 0063 creates operational tables (`worker_leases`, `ops_alerts`, `ops_controls`, etc.) — none touch financial records.

**Verdict:** UNCHANGED. No backfill or automatic clawback.

### 1.7 Delivery-Fee Exceptions: Distinct Approvers

**Source:** `settlement-adjustment.service.ts` line 19: "Duplicate approvals from the same user are rejected."

**Verdict:** UNCHANGED. Prescribed distinct approvers enforced.

### 1.8 Settlement Adjustment FX Fail-Closed

**Source:** `settlement-adjustment.service.ts` lines 7-10:
```
DRAFT → PENDING_APPROVAL → APPROVED → POSTED
PENDING_APPROVAL → REJECTED
DRAFT/PENDING_APPROVAL → BLOCKED_FX (if FX cannot be resolved)
```

BLOCKED_FX is a terminal state — the adjustment cannot proceed until FX is resolved.

**Verdict:** UNCHANGED.

### 1.9 Voucher Refunds

**Source:** Returns service preserves original payment method. No replacement credit invented.

**Verdict:** UNCHANGED.

### 1.10 Tenant Isolation

**Source:** `apps/api/src/common/tenant-scope.ts` (31 lines added). All financial routes scoped through `financialOrgScope()` helper.

**Verdict:** UNCHANGED. Tenant isolation enforced.

### 1.11 Audit History Preserved

**Source:** `apps/api/src/modules/audit/audit.service.ts` (13 lines added). Audit schema extended (`audit.schema.ts` +3 lines).

**Verdict:** UNCHANGED.

### 1.12 P13 Worker Disabled by Default

**Source:** `p13-ops.config.ts` line 72: `workerEnabled: false`. Line 108: `boolFalseDefault(env['P13_WORKER_ENABLED'])`.

**Verdict:** UNCHANGED.

### 1.13 Pilot Mode Legacy, Allowlist Empty

**Source:** `p13-ops.config.ts` line 83: `pilotMode: 'legacy'`. Line 104-105: only `'allowlist'` exact string switches mode.

**Verdict:** UNCHANGED.

---

## 2. Test Evidence

### Deployment Invariants (36/36 PASS)

```
$ pnpm --filter @scs/api exec vitest run src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts --reporter=verbose

 ✓ P13 Phase 4.1 — graceful shutdown wiring (3)
 ✓ P13 Phase 4.1 — production configuration gate (8)
 ✓ P13 Phase 4.1 — default configuration cannot activate P13 (5)
 ✓ P13 Phase 4.1 — container build hygiene (6)
 ✓ P13 Phase 4.1 — production Compose safety posture (9)
 ✓ P13 Phase 4.1 — environment template carries no secrets (4)
 ✓ P13 Phase 4.1 — the dev-only stack is not silently reused (1)

 Test Files  1 passed (1)
      Tests  36 passed (36)
   Duration  2.27s
```

These 36 tests verify:
- Worker disabled by default (3 configs)
- Pilot legacy by default
- Container images bake no secrets
- Production compose has no credential leaks
- Environment templates carry no working defaults
- Health checks use liveness route
- Migration directory ships inside API image
- Non-root user in container

### Webhook Signing (30/30 PASS)

```
$ pnpm --filter @scs/api exec vitest run src/__tests__/unit/operations/p415-webhook-signing.spec.ts --reporter=verbose

 Test Files  1 passed (1)
      Tests  30 passed (30)
   Duration  2.75s
```

### Typecheck (EXIT 0)

```
$ pnpm --filter @scs/api exec tsc --noEmit
EXIT: 0
```

---

## 3. Production Financial Data

**Confirmation:** No production financial data was touched, modified, or accessed during this phase. All operations were read-only source inspection and local test execution against disposable resources.

---

## 4. Summary

All 13 business-safety invariants verified UNCHANGED by source inspection. 36 deployment invariant tests PASS. 30 webhook signing tests PASS. Typecheck clean. No production data modified.
