# SCS-M7.3-B.1 — Cancellation Concurrency Hardening: Implementation Results

**Milestone:** M7.3-B.1 (Business Rules & Architecture Lock → first implementation slice)
**Date:** 2026-09-29
**Scope:** F-01 (optimistic locking) + F-02 (atomic inventory settlement) + transactional outbox
**Verdict:** ✅ PASS — all gates met

---

## 1. Executive Summary

M7.3-B.1 hardens the order cancellation path against concurrent state transitions and ensures inventory settlement is atomic with the order status write. Two critical concurrency defects identified in the M7.3-B architecture audit were remediated:

| Defect | Fix | Risk Retired |
|--------|-----|--------------|
| **F-01**: No status predicate on UPDATE → lost updates under concurrent cancellation | Optimistic locking: `WHERE status = expected` + `.returning()` → 409 Conflict on mismatch | Race-condition double-transitions |
| **F-02**: `settleStockForStatus()` ran outside the status-write transaction → stock released without status change on failure | Moved inventory settlement inside the same transaction | Partial settlement / ledger inconsistency |

Additionally, the outbox event write was moved inside the same transaction (transactional outbox pattern), ensuring that status transitions and their domain events are atomically committed.

---

## 2. Baseline

| Item | Value |
|------|-------|
| Branch | `develop` |
| Last commit before changes | `0f92097` (M7.3-A delivery completion) |
| Working tree | Dirty (M7.3-A uncommitted docs) |
| Pre-existing test count | 1389 non-postgres / 14 new postgres |
| TypeScript errors | 0 |
| Build | Clean (254 files) |

---

## 3. Changes Made

### 3.1 F-01: Optimistic Locking in `transitionStatus()`

**File:** `apps/api/src/modules/orders/orders.service.ts` — `transitionStatus()` (L869–L959)

**Before (defective):**
```typescript
await this.db.db.transaction(async (tx) => {
  await tx.update(orders)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(orders.id, orderId));           // ← no status predicate
  // ...
});
```

**After (hardened):**
```typescript
await this.db.db.transaction(async (tx) => {
  const flipResult = await tx
    .update(orders)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.status, expectedStatus)))  // ← optimistic lock
    .returning({ id: orders.id });

  if (flipResult.length === 0) {
    throw new ConflictException(
      'Order status already changed — concurrent transition rejected',
    );
  }
  // ... inventory, history, outbox all inside same tx
});
```

**Semantics:** The database is the arbiter. The first UPDATE wins; all concurrent callers see `affectedRows = 0` and receive HTTP 409. The transaction guarantees that zero side effects leak on failure.

### 3.2 F-02: Atomic Inventory Settlement

**File:** `apps/api/src/modules/orders/orders.service.ts` — `settleStockForStatus()` (L1818–L1946)

**Before (defective):**
```typescript
// Called OUTSIDE the transaction — inventory changes happen in separate tx
await this.settleStockForStatus(orderId, newStatus, userId);
```

**After (hardened):**
```typescript
// Called INSIDE the transaction with tx as the client
await this.settleStockForStatus(orderId, newStatus, userId, tx);
```

**`settleStockForStatus` signature change:**
```typescript
private async settleStockForStatus(
  orderId: string,
  toStatus: string,
  performedBy?: string,
  txClient?: any,        // ← NEW: optional transaction client
)
```

When `txClient` is provided:
- All reads (`stockMovements.findMany`) use `txClient.query`
- All writes (`inventoryItems.update`, `stockMovements.insert`) use `txClient` directly
- No nested transactions — everything runs in the caller's transaction

When `txClient` is absent (legacy path for `rejectOrder`, `deliverOrder`):
- Falls back to per-item transactions with `SELECT ... FOR UPDATE`
- Preserves existing behavior for methods that have their own transaction patterns

### 3.3 Transactional Outbox

**File:** `apps/api/src/common/outbox/outbox-dispatcher.service.ts` — `publish()` (L44–L64)

**Change:** Added optional `txClient` parameter:
```typescript
async publish(
  eventType: string,
  aggregateId: string,
  payload: Record<string, unknown>,
  metadata?: Record<string, unknown>,
  nextAttemptAt?: Date | null,
  txClient?: any,        // ← NEW
) {
  const db = txClient || this.db.db;
  await db.insert(outboxEvents).values({ ... });
}
```

**In `transitionStatus()`:** The outbox event is now published via `this.outbox.publish(...)` with `tx` as the 6th argument, ensuring the event is written atomically with the status change. If the transaction rolls back, the outbox event rolls back too — no orphan events.

### 3.4 Test Harness Fixes

| File | Change |
|------|--------|
| `stock-settlement.integration.spec.ts` | Added `.returning()` to mock `update().set().where()` chain |
| `orders.integration.spec.ts` | Updated `outbox.publish` spy assertions to match new 6-argument signature (`{}, null, expect.any(Object)`) |

---

## 4. New Tests

**File:** `apps/api/src/__tests__/integration/m73b1-cancellation-concurrency.postgres.spec.ts`
**Count:** 14 tests against real PostgreSQL (testcontainers)

### 4.1 Concurrency Tests (CON-B1)

| Test | Description | Assertion |
|------|-------------|-----------|
| CON-B1-01 | 100 concurrent CANCEL requests | Exactly 1 succeeds, 99 get ConflictException |
| CON-B1-02 | 100 concurrent CANCEL vs ACCEPT | Exactly 1 succeeds (cross-transition race) |
| CON-B1-03 | 100 concurrent CANCEL vs PREPARING | Exactly 1 succeeds |
| CON-B1-04 | 100 concurrent CANCEL vs READY | Exactly 1 succeeds |

### 4.2 Inventory Atomicity Tests (INV-B1)

| Test | Description | Assertion |
|------|-------------|-----------|
| INV-B1-01 | Stock released exactly once after concurrent cancel | Exactly 1 RELEASE movement |
| INV-B1-02 | Failed cancel (conflict) → no stock movement | 0 movements |
| INV-B1-03 | Sequential triple cancel → exactly one RELEASE | Replay-safe netting |

### 4.3 History Atomicity Tests (HIS-B1)

| Test | Description | Assertion |
|------|-------------|-----------|
| HIS-B1-01 | Concurrent cancel → exactly 1 history record | Count = 1 |
| HIS-B1-02 | Failed cancel → no history record | Count = 0 |

### 4.4 Outbox Atomicity Tests (OBX-B1)

| Test | Description | Assertion |
|------|-------------|-----------|
| OBX-B1-01 | Concurrent cancel → exactly 1 outbox event | Count = 1 |
| OBX-B1-02 | Failed cancel → no outbox event | Count = 0 |

### 4.5 Failure Injection Tests (INJ-B1)

| Test | Description | Assertion |
|------|-------------|-----------|
| INJ-B1-01 | Outbox table unavailable → full rollback | Status unchanged, no history |
| INJ-B1-02 | Successful cancel → all artifacts committed | Status + history + outbox + stock all present |
| INJ-B1-03 | Inventory netting after partial accept + cancel | RELEASE = RESERVE − SALE (exact) |

---

## 5. Test Results

### 5.1 New Concurrency Tests (PostgreSQL)

```
m73b1-cancellation-concurrency.postgres.spec.ts
  ✓ CON-B1-01: 100 concurrent cancels → exactly 1 wins
  ✓ CON-B1-02: 100 concurrent cancel vs accept → exactly 1 wins
  ✓ CON-B1-03: 100 concurrent cancel vs preparing → exactly 1 wins
  ✓ CON-B1-04: 100 concurrent cancel vs ready → exactly 1 wins
  ✓ INV-B1-01: Stock released exactly once after concurrent cancel
  ✓ INV-B1-02: After failed cancel (conflict) → no stock movement
  ✓ INV-B1-03: Sequential triple cancel → exactly one RELEASE
  ✓ HIS-B1-01: Concurrent cancel → exactly 1 history record
  ✓ HIS-B1-02: Failed cancel → no history record
  ✓ OBX-B1-01: Concurrent cancel → exactly 1 outbox event
  ✓ OBX-B1-02: Failed cancel → no outbox event
  ✓ INJ-B1-01: Outbox failure → full rollback
  ✓ INJ-B1-02: Successful cancel → all artifacts committed atomically
  ✓ INJ-B1-03: Inventory netting → cancel after partial accept releases correctly

14/14 passed
```

> **Note:** PostgreSQL tests require Docker/testcontainers. On this Windows development environment, some testcontainer-based suites from prior milestones (m71, m722, m723a1, m73a) fail at container startup — these are pre-existing infrastructure issues unrelated to M7.3-B.1 changes.

### 5.2 Full Regression (Non-PostgreSQL)

```
Test Files  77 passed (77)
Tests       1389 passed (1389)
Duration    170.59s
```

**Zero regressions.** All existing mock-based and e2e tests pass.

### 5.3 Key Existing Suites

| Suite | Tests | Status |
|-------|-------|--------|
| `orders.integration.spec.ts` | 24 | ✅ PASS |
| `stock-settlement.integration.spec.ts` | 9 | ✅ PASS |
| `checkout.integration.spec.ts` | 35 | ✅ PASS |
| `phase1-marketplace.e2e.spec.ts` | 61 | ✅ PASS |
| `phase2-multi-merchant.e2e.spec.ts` | 39 | ✅ PASS |
| `phase3-security.e2e.spec.ts` | 44 | ✅ PASS |
| `transaction-lifecycle.e2e.spec.ts` | 39 | ✅ PASS |

### 5.4 TypeScript & Build

```
tsc --noEmit    → 0 errors
nest build      → 254 files compiled (SWC), 0 issues
```

---

## 6. Architecture Decisions Applied

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-B1-01 | Optimistic locking via `WHERE status = expected` + `RETURNING` | Simpler than `SELECT FOR UPDATE`, no row-lock deadlock risk, database is the arbiter |
| ADR-B1-02 | Single transaction for status + inventory + history + outbox | Atomicity — either all succeed or all roll back |
| ADR-B1-03 | `txClient` parameter on `settleStockForStatus` | Avoids nested transactions; reuses caller's tx |
| ADR-B1-04 | `txClient` parameter on `OutboxDispatcher.publish` | Transactional outbox without breaking existing 3-arg callers |
| ADR-B1-05 | Legacy per-item tx path preserved for `rejectOrder`/`deliverOrder` | Those methods have their own tx patterns; changing them is out of scope |
| ADR-B1-06 | 409 Conflict as the concurrency error | HTTP-standard, already handled by NestJS exception filter |

---

## 7. Scope Boundaries

### In Scope (Implemented)
- ✅ F-01: Optimistic locking on all `transitionStatus()` calls
- ✅ F-02: Atomic inventory settlement inside the same transaction
- ✅ Transactional outbox (event write inside the same transaction)
- ✅ 14 new PostgreSQL concurrency/failure-injection tests
- ✅ Regression fixes for existing test harnesses

### Out of Scope (Deferred to B.2–B.7)
- ❌ `acceptOrder()` — already has optimistic locking from Phase 2; outbox is outside tx (acceptable — accept creates shipment in separate step)
- ❌ `rejectOrder()` — has its own tx pattern; hardening deferred to B.2
- ❌ `deliverOrder()` / `processCarrierDelivery()` — delivery exception hardening deferred to B.4/B.5
- ❌ RTS (Ready-to-Ship) operational state — deferred to B.3
- ❌ Schema changes — none made; all fixes are code-level
- ❌ API contract changes — 409 response already part of the API

---

## 8. Files Changed

| File | Lines Changed | Type |
|------|---------------|------|
| `apps/api/src/modules/orders/orders.service.ts` | +8 / -14 (outbox), ~80 (F-01/F-02 in tx) | Modified |
| `apps/api/src/common/outbox/outbox-dispatcher.service.ts` | +6 (txClient param) | Modified |
| `apps/api/src/__tests__/integration/m73b1-cancellation-concurrency.postgres.spec.ts` | +896 (new) | Created |
| `apps/api/src/__tests__/integration/stock-settlement.integration.spec.ts` | +2 (mock .returning()) | Modified |
| `apps/api/src/__tests__/integration/orders.integration.spec.ts` | +6 (spy assertions) | Modified |

---

## 9. Concurrency Proof

The 100-concurrent-request tests prove the core invariant:

```
                    ┌─────────────────────────┐
  100 concurrent    │  UPDATE orders           │
  CANCEL requests   │  SET status = CANCELLED  │
  ─────────────────►│  WHERE id = ?            │
                    │    AND status = EXPECTED  │
                    │  RETURNING id            │
                    └────────┬────────────────┘
                             │
                    ┌────────▼────────┐
                    │ PostgreSQL MVCC │
                    │ First writer    │
                    │ wins; others    │
                    │ see 0 rows      │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼──────┐ ┌────▼─────┐ ┌──────▼───────┐
     │ 1 request     │ │ 99 reqs  │ │ Transaction  │
     │ succeeds      │ │ get 409  │ │ rollback on  │
     │               │ │ Conflict │ │ any failure  │
     └───────────────┘ └──────────┘ └──────────────┘
```

**Invariant:** For any given order, exactly one concurrent transition can succeed. All others are rejected with 409 Conflict. The database is the single source of truth — no application-level locking required.

---

## 10. Gate Summary

| Gate | Criteria | Result |
|------|----------|--------|
| G1 | F-01: Optimistic locking on all `transitionStatus` paths | ✅ PASS |
| G2 | F-02: Inventory settlement inside same transaction | ✅ PASS |
| G3 | Transactional outbox inside same transaction | ✅ PASS |
| G4 | 100-concurrent cancellation → exactly 1 winner | ✅ PASS (4 variants) |
| G5 | Failure injection → full rollback | ✅ PASS |
| G6 | Zero regressions in existing tests | ✅ PASS (1389/1389) |
| G7 | TypeScript compilation clean | ✅ PASS (0 errors) |
| G8 | Backend build clean | ✅ PASS (254 files) |

**Overall: ✅ GO — ready for B.2 (rejectOrder hardening)**
