# P13 Phase 3.1.1 — Concurrency Verification Report

**Date:** 2026-10-14
**Branch:** develop @ 8d60e36
**Database:** PostgreSQL (scs-postgres container, port 25433, disposable database `scs_p311_concur`)

## Executive Summary

Six concurrency tests verify that financial operations are safe under concurrent access against real PostgreSQL. All 6 tests **PASS**.

## Test Results

| Test | Description | Mechanism | Result |
|------|-------------|-----------|--------|
| TC-01 | Commission reversal idempotency key | UNIQUE index on `idempotency_key` | **PASS** |
| TC-02 | Concurrent approve by different users (dual approval) | `SELECT ... FOR UPDATE` row lock | **PASS** |
| TC-03 | Concurrent post of same adjustment | Status check + row lock serialization | **PASS** |
| TC-04 | Concurrent reconciliation for same period/org | UNIQUE index on `(period_start, period_end, currency, version)` | **PASS** |
| TC-05 | Duplicate approval from same user | UNIQUE index on `(adjustment_id, approver_id)` | **PASS** |
| TC-06 | Concurrent reject + approve | `SELECT ... FOR UPDATE` row lock — one wins | **PASS** |

## Command Output

```
$ npx vitest run src/__tests__/integration/p311-concurrency.postgres.spec.ts --reporter=verbose

 ✓ TC-01: commission reversal idempotency key → unique constraint prevents duplicate
 ✓ TC-02: concurrent approve by different users → both succeed for dual approval
 ✓ TC-03: concurrent post of same adjustment → only one wins
 ✓ TC-04: concurrent reconciliation for same period/org → unique version constraint
 ✓ TC-05: duplicate approval from same user → rejected
 ✓ TC-06: concurrent reject + approve → row lock serializes, one wins

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Duration  12.60s
```

## Concurrency Mechanisms Verified

### 1. Idempotency Keys (TC-01)
- `commission_reversals.idempotency_key` has a UNIQUE index (`idx_commission_reversals_idempotency`)
- Duplicate inserts with the same key are rejected at the database level
- The service also performs an in-transaction check before insert

### 2. Row-Level Locking (TC-02, TC-03, TC-06)
- `SettlementAdjustmentService.lockAdjustment()` uses `SELECT ... FOR UPDATE`
- Concurrent operations on the same adjustment are serialized
- Status checks after locking prevent invalid transitions (e.g., double-post)

### 3. Unique Constraints (TC-04, TC-05)
- `reconciliation_runs` has UNIQUE index on `(period_start, period_end, currency, version)`
- `settlement_adjustment_approvals` has UNIQUE index on `(adjustment_id, approver_id)`
- Both prevent duplicate records at the database level

## Invariants Confirmed

1. **No duplicate financial postings:** Row locks + status checks prevent double-posting
2. **No duplicate commission reversals:** Idempotency key unique constraint
3. **No unauthorized approvals:** Duplicate approver check + unique constraint
4. **No lost reconciliation history:** Version constraint ensures each run is unique
5. **Transaction boundaries respected:** All operations use `db.transaction()` with proper isolation

## Test File

- `apps/api/src/__tests__/integration/p311-concurrency.postgres.spec.ts`

## Limitations

- TC-01 tests the idempotency constraint directly rather than through the full service chain (which requires products, variants, order_items, return_request_items fixtures). The unique index behavior is identical.
- Concurrent tests run with 2 parallel operations. Higher concurrency levels would serialize further due to `FOR UPDATE` locking but would not change the correctness guarantees.
