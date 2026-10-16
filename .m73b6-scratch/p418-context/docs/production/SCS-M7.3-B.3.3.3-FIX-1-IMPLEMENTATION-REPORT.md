# SCS-M7.3-B.3.3.3 — Targeted Defect Fix: FIX-1

## 1. DEFECT-001 Root Cause

**File**: `apps/api/src/modules/shipping/carrier-reconciliation.service.ts`

**Root cause**: `reconcileCancel()` claims shipments via raw SQL `this.db.db.execute(sql`...RETURNING *`)` which returns PostgreSQL rows with **snake_case** column names (`carrier_cancel_status`, `shipping_provider_key`, `carrier_cancel_retries`, `carrier_cancel_attempted_at`, `carrier_tracking_id`).

However, `reconcileCancelShipment()` (lines 415-497) and `deferCancelReconciliation()` (line 571) accessed the shipment object using **camelCase** Drizzle property names. All property reads returned `undefined`, causing:

| Property (camelCase — WRONG) | Actual (snake_case) | Effect |
|-------------------------------|---------------------|--------|
| `shipment.carrierCancelStatus` | `shipment.carrier_cancel_status` | CA terminal guard never fires |
| `shipment.carrierCancelAttemptedAt` | `shipment.carrier_cancel_attempted_at` | 24h boundary check skipped |
| `shipment.carrierCancelRetries` | `shipment.carrier_cancel_retries` | Budget check always reads 0 |
| `shipment.shippingProviderKey` | `shipment.shipping_provider_key` | Provider lookup falls back to `'aramex'` → not found → `'error'` |
| `shipment.carrierTrackingId` | `shipment.carrier_tracking_id` | Tracking lookup never executes |

**Net effect**: The entire B.3.3.3 cancel reconciliation path was non-functional. Independent runtime verification confirmed 7/12 PostgreSQL tests failed.

---

## 2. Exact Production Changes

**File**: `apps/api/src/modules/shipping/carrier-reconciliation.service.ts`

**6 property accesses corrected** (camelCase → snake_case):

```
Line 417: shipment.carrierCancelStatus      → shipment.carrier_cancel_status
Line 425: shipment.carrierCancelAttemptedAt → shipment.carrier_cancel_attempted_at
Line 437: shipment.carrierCancelRetries     → shipment.carrier_cancel_retries
Line 443: shipment.shippingProviderKey      → shipment.shipping_provider_key
Line 457: shipment.carrierTrackingId        → shipment.carrier_tracking_id
Line 571: shipment.carrierCancelRetries     → shipment.carrier_cancel_retries
```

**NOT changed** (intentionally):
- `reconcileShipment()` line 215: `shipment.shippingProviderKey` — this is the CREATE path where the shipment comes from Drizzle ORM `db.query.shipments.findFirst()` (returns camelCase). Correct as-is.
- `escalateCancelReconciliation()`, `resolveCancelSucceeded()`: use `shipment.id` which is case-insensitive. Correct as-is.
- All `.set()` calls use Drizzle camelCase column names (ORM-mapped). Correct as-is.
- SQL claim query unchanged. FOR UPDATE SKIP LOCKED preserved.

---

## 3. DEFECT-002 Test Change

**File**: `apps/api/src/__tests__/integration/m73b333-carrier-http.postgres.spec.ts`

**Two fixes**:

1. **B333-HTTP-04 missing error catch**: The test called `handleCancel()` without catching the expected re-thrown retryable error. Fixed with try/catch + assertion on error message containing 'ENOTFOUND'.

2. **B333-HTTP-04 wrong status assertion**: Expected `carrier_cancel_status = 'IN_PROGRESS'` but the worker's retryable error path (line 696) sets status back to `'PENDING'` before re-throwing. Corrected assertion to `'PENDING'`.

**Additional test fixes** (provider key alignment):

**File**: `apps/api/src/__tests__/unit/shipping/m73b333-indeterminate-reconciliation.spec.ts`

- 9 mock shipment objects updated from camelCase to snake_case to match the raw PostgreSQL row shape that `reconcileCancelShipment()` now correctly reads.

**File**: `apps/api/src/__tests__/integration/m73b333-indeterminate-reconciliation.postgres.spec.ts`

- 4 tests (PG-01..04 concurrency, PG-05 stale lease, PG-07 tenant isolation, PG-09 tracking race) had `providerKey` mismatch: shipment used default `'tracking-cancelled'` but registered provider was `'tracking-ambiguous'`. Fixed by explicitly passing `providerKey: 'tracking-ambiguous'`.
- PG-11 lifecycle test: changed from exact `results.length === 1` to `results.length >= 1` + filter by shipmentId, since `reconcileCancel()` claims ALL eligible UNKNOWN shipments in the shared test database.

---

## 4. Tests Executed

### 4.1 B.3.3.3 Unit Suite

```
cd apps/api && npx vitest run src/__tests__/unit/shipping/m73b333-indeterminate-reconciliation.spec.ts
```

**Result: 24/24 PASS**

### 4.2 PostgreSQL B.3.3.3 Suite (Real Testcontainers)

```
cd apps/api && npx vitest run src/__tests__/integration/m73b333-indeterminate-reconciliation.postgres.spec.ts
```

**Result: 12/12 PASS**

| Test | Description | Result |
|------|-------------|--------|
| B333-PG-01 | 2 concurrent workers → 1 claim | ✓ PASS |
| B333-PG-02 | 10 concurrent workers → 1 claim | ✓ PASS |
| B333-PG-03 | 50 concurrent workers → 1 claim + reconciliation | ✓ PASS |
| B333-PG-04 | 100 concurrent workers → 1 claim + reconciliation | ✓ PASS |
| B333-PG-05 | stale RECONCILING lease recovery | ✓ PASS |
| B333-PG-06 | duplicate cancel events → single effective | ✓ PASS |
| B333-PG-07 | tenant isolation | ✓ PASS |
| B333-PG-08 | reconciliation vs cancellation race | ✓ PASS |
| B333-PG-09 | reconciliation vs tracking race | ✓ PASS |
| B333-PG-10 | worker timeout → UNKNOWN | ✓ PASS |
| B333-PG-11 | UNKNOWN → tracking CANCELLED → SUCCEEDED | ✓ PASS |
| B333-PG-12 | UNKNOWN → budget exhaustion → RECONCILIATION_REQUIRED | ✓ PASS |

### 4.3 Carrier HTTP Suite (Real Testcontainers)

```
cd apps/api && npx vitest run src/__tests__/integration/m73b333-carrier-http.postgres.spec.ts
```

**Result: 7/7 PASS**

| Test | Description | Result |
|------|-------------|--------|
| B333-HTTP-01 | timeout → UNKNOWN + CANCEL_TIMEOUT | ✓ PASS |
| B333-HTTP-02 | ECONNRESET → UNKNOWN + CANCEL_UNKNOWN | ✓ PASS |
| B333-HTTP-03 | aborted → UNKNOWN + CANCEL_UNKNOWN | ✓ PASS |
| B333-HTTP-04 | DNS failure → retryable, NOT UNKNOWN | ✓ PASS |
| B333-HTTP-05 | socket hang up → UNKNOWN | ✓ PASS |
| B333-HTTP-06 | ECONNABORTED → UNKNOWN + CANCEL_UNKNOWN | ✓ PASS |
| B333-HTTP-07 | ETIMEDOUT → UNKNOWN + CANCEL_TIMEOUT | ✓ PASS |

### 4.4 Full Non-PG Regression

```
cd apps/api && npx vitest run --exclude '**/*.postgres.spec.ts'
```

**Result: 1587/1587 PASS, 85 test files**

---

## 5. Results Summary

| Gate | Required | Actual | Status |
|------|----------|--------|--------|
| Unit tests | 24/24 | 24/24 | ✓ |
| PostgreSQL tests | 12/12 | 12/12 | ✓ |
| Carrier HTTP tests | 7/7 | 7/7 | ✓ |
| Full regression | 0 failures | 1587/1587 | ✓ |
| TypeScript | 0 errors | 0 errors (exit 0) | ✓ |
| Build | success | 269 files compiled | ✓ |

---

## 6. Scope Verification

**Production files changed in this fix session**:

| File | Change |
|------|--------|
| `carrier-reconciliation.service.ts` | 6 property accesses: camelCase → snake_case |

**No changes to**:
- package.json ✓
- pnpm-lock.yaml ✓
- migrations (no 0050) ✓
- provider interfaces ✓
- Aramex provider ✓
- carrier-http-client.ts ✓
- shipping-carrier.worker.ts ✓
- carrier-tracking-poller.ts ✓
- carrier-admin.controller.ts ✓

**Test files changed**:
- `m73b333-indeterminate-reconciliation.spec.ts` (unit mock alignment)
- `m73b333-indeterminate-reconciliation.postgres.spec.ts` (provider key alignment + PG-11 robustness)
- `m73b333-carrier-http.postgres.spec.ts` (HTTP-04 error catch + status assertion)

---

## 7. TypeScript

```
cd apps/api && npx tsc --noEmit
Exit code: 0
```

**0 errors.**

---

## 8. Build

```
cd apps/api && npx nest build
Successfully compiled: 269 files with swc (512.86ms)
```

**0 issues.**

---

## 9. DEFECT-001 Verification — Previously Failing Cases

| Test | Before Fix | After Fix | Verified |
|------|-----------|-----------|----------|
| B333-PG-01 (2 workers) | FAIL (retries=0) | PASS (retries=1) | ✓ |
| B333-PG-02 (10 workers) | FAIL (retries=0) | PASS (retries=1) | ✓ |
| B333-PG-03 (50 workers) | FAIL (retries=0) | PASS (retries=1) | ✓ |
| B333-PG-04 (100 workers) | FAIL (retries=0) | PASS (retries=1) | ✓ |
| B333-PG-06 (duplicate) | FAIL (outcome='error') | PASS (cancel_succeeded) | ✓ |
| B333-PG-11 (UNKNOWN→SUCCEEDED) | FAIL (3 results, wrong) | PASS (cancel_succeeded) | ✓ |
| B333-PG-12 (UNKNOWN→RECONCILIATION_REQUIRED) | FAIL (outcome='error') | PASS (cancel_budget_exhausted) | ✓ |

**All specific verifications**:
- 24h boundary triggers: ✓ (unit B333-U-19, PG-12)
- carrier_cancel_retries increments: ✓ (PG-01..04 concurrency, PG-12)
- carrier_tracking_id used for tracking: ✓ (PG-11 tracking lookup)
- shipping_provider_key resolves correct provider: ✓ (all PG tests)
- carrier_cancel_status terminal guard works: ✓ (unit B333-U-16/16b)

---

## 10. Remaining Conditions

1. **No new conditions introduced.** The fix is strictly a property-name correction with no behavioral changes beyond enabling the already-designed reconciliation logic.

2. **All locked business rules preserved**: 24h boundary, 8-attempt budget, FOR UPDATE SKIP LOCKED, Aramex safety boundary, deterministic idempotency key, migration 0049 only.

3. **Next step**: Fresh independent runtime verification (B.3.3.3-A.1-R2) to confirm the fix from a clean slate.

---

## 11. Final Verdict

### **FIX COMPLETE**

- DEFECT-001 (production): Fixed — 6 property accesses corrected
- DEFECT-002 (test): Fixed — error catch + status assertion
- All 43 B.3.3.3 tests pass (24 unit + 12 PostgreSQL + 7 Carrier HTTP)
- Full regression clean (1587/1587)
- TypeScript clean (0 errors)
- Build clean (269 files)
- Scope minimal (1 production file, 6 lines changed)
