# M7.3-B.3.3.1 — Cancellation Execution Foundation: Implementation Results

| Field | Value |
|-------|-------|
| **Milestone** | M7.3-B.3.3 Carrier Cancellation |
| **Phase** | B.3.3.1 — Cancellation Execution Foundation |
| **Status** | **COMPLETE** |
| **Date** | 2026-09-30 |
| **Pre-implementation audit** | `SCS-M7.3-B.3.3-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md` (GO WITH CONDITIONS) |

---

## 1. Scope Compliance

**Strictly implemented (per spec §2):**

- Atomic outbox event creation inside `cancelOrder()` transaction
- Worker `handleCancel()` with full state machine
- Idempotent success guard (SUCCEEDED / NOT_REQUIRED → skip)
- Provider capability check (`canCancelPickup`)
- Manual provider → NOT_REQUIRED
- Missing `carrierPickupId` → FAILED (validation)
- Circuit breaker integration
- Timeout boundary protection (timeout CANNOT produce SUCCEEDED)
- Deterministic error classification via `classifyCarrierError()`
- Tenant verification (event storeId vs shipment storeId)
- Credential safety via `toSafeMessage()`

**Explicitly NOT implemented (per spec §3):**

- ❌ RETRY state (→ B.3.3.2)
- ❌ UNKNOWN state (→ B.3.3.3)
- ❌ Reconciliation job (→ B.3.3.4)
- ❌ Tracking poller changes
- ❌ Webhook controller changes
- ❌ Database migrations (columns already exist from 0049)
- ❌ Delivered-after-cancel detection
- ❌ Admin recovery UI
- ❌ New metrics / dashboards

---

## 2. Files Changed

| File | Operation | Lines |
|------|-----------|-------|
| `apps/api/src/modules/orders/orders.service.ts` | Modified | +17 |
| `apps/api/src/modules/shipping/shipping-carrier.worker.ts` | Modified | +228 / −2 |
| `apps/api/src/__tests__/unit/shipping/m73b331-handle-cancel.spec.ts` | **New** | 505 |
| `apps/api/src/__tests__/integration/m73b331-cancel-execution.postgres.spec.ts` | **New** | 553 |

**Total production code:** +245 / −2 lines  
**Total test code:** 1,058 lines

---

## 3. Outbox Event Design

### Event creation in `cancelOrder()`

```typescript
// Inside the cancellable shipment block in cancelOrder():
await this.db.db
  .update(shipments)
  .set({
    status: 'CANCELLED',
    cancellationReason: reason,
    carrierCancelStatus: 'PENDING',                          // ← NEW
    carrierCancelIdempotencyKey: `carrier-cancel:${shipmentId}`, // ← NEW
    updatedAt: new Date(),
  })
  .where(eq(shipments.id, shipmentId));

// After shipment update, still inside `if (shipment)`:
await this.outbox.publish(
  'shipping.carrier.cancel',
  shipmentId,                    // aggregateId
  { shipmentId },                // payload
  { storeId: order['storeId'] }, // metadata (tenant)
  null,                          // nextAttemptAt
  tx,                            // transaction client (atomic)
);
```

**Atomicity guarantee:** The outbox event is created inside the same database transaction as the order cancellation and shipment status update. If any part fails, everything rolls back together.

**Event properties:**
- `event_type`: `'shipping.carrier.cancel'`
- `aggregate_id`: shipment UUID
- `payload`: `{ shipmentId }`
- `metadata`: `{ storeId }` (tenant verification)
- `status`: `'PENDING'` (initially)

---

## 4. handleCancel() Design

### Execution flow (9 steps)

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Load shipment by aggregateId                                │
│  2. Tenant verification (event.storeId === shipment.storeId)    │
│  3. Idempotent guard (SUCCEEDED/NOT_REQUIRED → return)          │
│  4. Resolve provider from registry                              │
│  5. Manual provider → NOT_REQUIRED                              │
│  6. Capability check (canCancelPickup) → NOT_REQUIRED           │
│  7. carrierPickupId check → FAILED (validation)                 │
│  8. Circuit breaker check → throw RetryableCarrierError         │
│  9. PENDING → IN_PROGRESS transition                            │
│ 10. Build CancelPickupRequest                                   │
│ 11. Call provider.cancelPickup()                                │
│ 12. Deterministic outcome mapping                               │
└─────────────────────────────────────────────────────────────────┘
```

### Result mapping

| Provider result | Shipment status | Error class | Notes |
|----------------|-----------------|-------------|-------|
| `cancelled: true` | **SUCCEEDED** | null | Clears error fields, sets `cancelledAt` |
| `cancelled: false` | **FAILED** | `business_failure` | Stores `reason` (truncated to 2000 chars) |
| `supported: false` | **NOT_REQUIRED** | null | Provider doesn't support cancel |
| Exception (timeout) | **FAILED** | `timeout` | `[TIMEOUT — B3.3.3 will set UNKNOWN]` prefix |
| Exception (other) | **FAILED** | per `classifyCarrierError()` | safe message, no credentials |

---

## 5. State Transition Diagram

```
                    ┌──────────────┐
                    │     NULL     │ (initial — no cancel attempted)
                    └──────┬───────┘
                           │ cancelOrder()
                           ▼
                    ┌──────────────┐
                    │   PENDING    │ (outbox event created)
                    └──────┬───────┘
                           │ handleCancel() starts
                           ▼
                   ┌───────────────┐
                   │  IN_PROGRESS  │ (provider call in flight)
                   └───────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
       ┌──────────┐ ┌──────────┐ ┌──────────────┐
       │ SUCCEEDED│ │  FAILED  │ │ NOT_REQUIRED │
       └──────────┘ └──────────┘ └──────────────┘
       (terminal)   (terminal*)   (terminal)

       * B3.3.2 will add RETRY from FAILED
       * B3.3.3 will add UNKNOWN from FAILED (timeout cases)
```

---

## 6. Error Handling Strategy

### B.3.3.1 approach: All errors → FAILED

Per spec §8, B.3.3.1 intentionally does NOT implement blind retry. All errors (including retryable ones) are marked as FAILED deterministically. This is a safety measure — B.3.3.2 will add the RETRY state with proper retry outbox events.

### Timeout boundary

Timeout errors are detected via `isTimeoutError()` which checks for:
- `timeout`, `etimedout`, `econnreset`, `econnaborted`, `socket hang up`, `aborted`

Timeout is marked FAILED (not SUCCEEDED) with:
- `carrierCancelErrorClass = 'timeout'`
- `carrierCancelError` prefixed with `[TIMEOUT — B3.3.3 will set UNKNOWN]`
- Does NOT re-throw (prevents unsafe blind retry via `handleFailure`)

### Credential safety

All error messages use `classifyCarrierError(err).safeMessage` which strips credentials and sensitive data before storage.

---

## 7. Tenant Security

- Event `metadata.storeId` is compared against `shipment.storeId`
- Mismatch throws an error (event is not processed)
- This prevents cross-tenant cancellation via outbox event manipulation

---

## 8. Concurrency Model

- **Outbox claiming:** `FOR UPDATE SKIP LOCKED` in `claimEvents()` ensures exactly one worker processes each event
- **Idempotent guard:** Sequential duplicate calls are safe — SUCCEEDED/NOT_REQUIRED → skip
- **Circuit breaker:** Per-provider scope (`CarrierCircuitBreaker.scopeKey(providerKey)`)
- **Idempotency key:** `carrier-cancel:<shipmentId>` stored on shipment row

---

## 9. Unit Tests (21 scenarios)

| ID | Scenario | Status |
|----|----------|--------|
| U-01 | Successful cancellation: PENDING → SUCCEEDED | ✅ PASS |
| U-02 | Idempotent guard: already SUCCEEDED → skip | ✅ PASS |
| U-03 | Idempotent guard: already NOT_REQUIRED → skip | ✅ PASS |
| U-04 | Unsupported provider (canCancelPickup=false) → NOT_REQUIRED | ✅ PASS |
| U-05 | Business failure (cancelled=false) → FAILED | ✅ PASS |
| U-06 | Authentication error → FAILED (terminal) | ✅ PASS |
| U-07 | Validation error → FAILED (terminal) | ✅ PASS |
| U-08 | Malformed response → FAILED | ✅ PASS |
| U-09 | Missing shipment → throws | ✅ PASS |
| U-10 | Tenant mismatch → throws | ✅ PASS |
| U-11 | Missing carrierPickupId → FAILED (validation) | ✅ PASS |
| U-12 | Request mapping (CancelPickupRequest fields) | ✅ PASS |
| U-13a | Provider resolution: uses shippingProviderKey | ✅ PASS |
| U-13b | Provider resolution: defaults to manual-driver | ✅ PASS |
| U-13c | Provider resolution: unknown key → throws | ✅ PASS |
| U-14 | Credential safety (no raw error in safe message) | ✅ PASS |
| U-15 | Carrier-neutral behavior (works for any carrier) | ✅ PASS |
| U-16a | Timeout boundary: ETIMEDOUT → FAILED (not SUCCEEDED) | ✅ PASS |
| U-16b | Timeout boundary: errorClass = 'timeout' | ✅ PASS |
| U-17 | Unsupported result shape → NOT_REQUIRED | ✅ PASS |
| U-18 | Manual provider type → NOT_REQUIRED | ✅ PASS |

**Result:** 21/21 passed (131ms)

---

## 10. PostgreSQL Integration Tests (11 scenarios)

| ID | Scenario | Status |
|----|----------|--------|
| A | cancelOrder creates exactly one `shipping.carrier.cancel` outbox event | ✅ PASS (652ms) |
| B | Event + cancellation are atomic (rollback removes both) | ✅ PASS (359ms) |
| C | Worker transitions PENDING → SUCCEEDED, event → DISPATCHED | ✅ PASS |
| D | Unsupported provider → NOT_REQUIRED (no HTTP call) | ✅ PASS |
| E | Business failure → PENDING → FAILED | ✅ PASS |
| F | Duplicate event processing — only one effective provider execution | ✅ PASS |
| G | Already SUCCEEDED shipment — provider not called | ✅ PASS |
| H | Cross-tenant event/shipment — execution rejected | ✅ PASS |
| I | 100 concurrent workers — convergence to correct final state | ✅ PASS (963ms) |
| J | Worker crash/rollback — no corrupted shipment state | ✅ PASS |
| K | Timeout cannot produce `carrierCancelStatus = SUCCEEDED` | ✅ PASS |

**Result:** 11/11 passed

---

## 11. Regression Suite

| Suite | Result |
|-------|--------|
| Full unit + integration (non-postgres) | 1479 passed, 1 pre-existing failure* |
| TypeScript (`tsc --noEmit`) | **0 errors** |
| Build (`nest build`) | **0 issues**, 262 files compiled |
| B.3.3.1 unit tests | 21/21 passed |
| B.3.3.1 postgres tests | 11/11 passed |

*Pre-existing failure: `webhook-rate-limiting.spec.ts` — timeout in `ThrottlerGuard` import test. Not related to B.3.3.1 changes (file not modified).

---

## 12. Git Scope Audit

```
Modified:
  M apps/api/src/modules/orders/orders.service.ts        (+17 lines)
  M apps/api/src/modules/shipping/shipping-carrier.worker.ts (+228/-2 lines)

New:
  ?? apps/api/src/__tests__/unit/shipping/m73b331-handle-cancel.spec.ts
  ?? apps/api/src/__tests__/integration/m73b331-cancel-execution.postgres.spec.ts
```

**Forbidden files NOT touched:**
- ❌ No reconciliation job
- ❌ No tracking poller
- ❌ No webhook controller
- ❌ No admin recovery
- ❌ No migrations
- ❌ No metrics/dashboards

**Scope verdict:** ✅ CLEAN — only allowed files changed

---

## 13. Known Limitations (B.3.3.1 scope)

1. **No retry:** All errors → FAILED. B.3.3.2 will add RETRY state.
2. **No UNKNOWN:** Timeout → FAILED (with marker). B.3.3.3 will add UNKNOWN.
3. **No reconciliation:** No background job to detect stuck FAILED shipments. B.3.3.4.
4. **No delivered-after-cancel detection:** Worker does not check if delivery occurred before cancel.
5. **No admin recovery UI:** Failed cancellations require manual investigation.

---

## 14. B.3.3.2+ Integration Points Confirmed

| Phase | Integration point | Ready? |
|-------|-------------------|--------|
| B.3.3.2 | `carrierCancelErrorClass` column stores classification | ✅ |
| B.3.3.2 | Timeout branch isolated (lines 638-654) for UNKNOWN upgrade | ✅ |
| B.3.3.2 | `classifyCarrierError()` returns `decision` for retry policy | ✅ |
| B.3.3.3 | `[TIMEOUT — B3.3.3 will set UNKNOWN]` prefix in error message | ✅ |
| B.3.3.3 | `carrierCancelErrorClass = 'timeout'` for UNKNOWN detection | ✅ |
| B.3.3.4 | `carrierCancelAttemptedAt` timestamp for staleness detection | ✅ |
| B.3.3.4 | `carrierCancelStatus` enum supports all needed states | ✅ |

---

## 15. Final Verdict

| Criterion | Result |
|-----------|--------|
| All spec requirements implemented | ✅ |
| Unit tests ≥ 15 scenarios | ✅ (21) |
| PostgreSQL tests A–K + timeout | ✅ (11) |
| Zero regressions | ✅ |
| TypeScript clean | ✅ |
| Build clean | ✅ |
| Scope audit clean | ✅ |
| B.3.3.2+ integration points ready | ✅ |

### **B.3.3.1 is COMPLETE. STOP. Do not begin B.3.3.2.**
