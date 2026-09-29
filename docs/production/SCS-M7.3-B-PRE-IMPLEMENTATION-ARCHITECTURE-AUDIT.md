# SCS-M7.3-B — Pre-Implementation Architecture & Concurrency Audit

## Cancellation & Delivery Exception Handling

---

# 1. Executive Summary

This audit is a **read-only** investigation of the current SCS Platform codebase to determine how cancellation and delivery exceptions currently behave, identify all lifecycle/concurrency/security gaps, and define the required business rules and implementation plan for M7.3-B.

**Critical findings:**

| ID | Severity | Finding |
|----|----------|---------|
| F-01 | **HIGH** | `cancelOrder()` has NO optimistic locking — concurrent CANCEL vs ACCEPT/PREPARING can both appear successful |
| F-02 | **HIGH** | `settleStockForStatus()` executes OUTSIDE the status-write transaction in `transitionStatus()` — crash between them leaves stock released but order status unchanged |
| F-03 | **HIGH** | Carrier shipment cancellation is NOT supported (Aramex `canCancel: false`) — `handleCancel()` in worker is a stub |
| F-04 | **HIGH** | Zero delivery exception handling — no FAILED_DELIVERY, REFUSED, DAMAGED, LOST, RETURN_TO_SENDER states exist |
| F-05 | **MEDIUM** | Driver has no mechanism to report delivery exceptions (customer unavailable, wrong address, damaged) |
| F-06 | **MEDIUM** | Merchant cancellation uses generic `POST /orders/:id/status` endpoint — no dedicated cancel path, no cancellation-specific validation |
| F-07 | **MEDIUM** | No shipment status update on order cancellation — shipment remains in its current status when order is cancelled |
| F-08 | **MEDIUM** | No carrier reconciliation when SCS cancels but carrier later reports DELIVERED |
| F-09 | **LOW** | `cancelOrder()` does not record a cancellation-specific outbox event distinct from the generic `order.cancelled` |
| F-10 | **INFO** | No master-level cancellation operation — only sub-order cancellation exists |

**Go/No-Go: GO WITH CONDITIONS**

The architecture is sufficiently understood to proceed. The concurrency defects (F-01, F-02) must be fixed as part of M7.3-B implementation. The carrier gap (F-03) and delivery exception gap (F-04) define the core scope of M7.3-B.

---

# 2. Baseline

```text
Git branch:   develop
Git commit:   0f92097
Repository:   M7.3-A implementation (uncommitted) + A.1/A.2 verification artifacts
M7.3-A status: CLOSED / PASS
```

Modified files (M7.3-A implementation):
- `apps/api/src/modules/orders/orders.service.ts` — M7.3-A delivery completion + master aggregation
- `apps/api/src/modules/orders/orders.controller.ts` — confirm-delivery endpoint
- `apps/api/src/modules/orders/auto-complete.worker.ts` — new file
- `apps/api/src/modules/shipping/carrier-tracking-poller.ts` — carrier delivery bridge
- `infra/drizzle/migrations/0047_delivery_completion.sql` — new migration

---

# 3. Current Order FSM

## 3.1 Complete State Machine

Source: `orders.service.ts` lines 1940-1957 (`TRANSITIONS` map).

| Current State | Allowed Transitions | Who Can Trigger | Cancellation Allowed? | Inventory Effect | Shipment Effect |
|---|---|---|---|---|---|
| DRAFT | SUBMITTED | Buyer (checkout) | No (pre-order) | None | None |
| SUBMITTED | PENDING_CONFIRMATION | System (auto-advance) | Yes (via cancelOrder) | None | None |
| PENDING_CONFIRMATION | ACCEPTED, PARTIALLY_ACCEPTED, REJECTED, CANCELLED | Merchant | Yes (via cancelOrder) | Reserve at ACCEPT; Release at CANCEL/REJECT | Shipment created at ACCEPT |
| ACCEPTED | PREPARING, CANCELLED | Merchant | Yes (via cancelOrder) | RESERVE done; Release at CANCEL | Shipment in PREPARING |
| PARTIALLY_ACCEPTED | PREPARING, CANCELLED | Merchant | Yes (via cancelOrder) | RESERVE done; Release at CANCEL | Shipment in PREPARING |
| PREPARING | READY, CANCELLED | Merchant | Yes (via cancelOrder) | RESERVE done; Release at CANCEL | Shipment in PREPARING |
| READY | OUT_FOR_DELIVERY, ASSIGNED, DELIVERED, CANCELLED | Merchant | Yes (via cancelOrder) | RESERVE done; Release at CANCEL | Shipment in READY |
| ASSIGNED | PICKED_UP | Driver | **NO** | RESERVE held | Shipment ASSIGNED |
| PICKED_UP | OUT_FOR_DELIVERY | Driver | **NO** | RESERVE held | Shipment PICKED_UP |
| OUT_FOR_DELIVERY | DELIVERED | Driver | **NO** | RESERVE held | Shipment OUT_FOR_DELIVERY |
| DELIVERED | COMPLETED, DISPUTED | Buyer / System | **NO** | SALE consumed | Shipment DELIVERED |
| COMPLETED | DISPUTED | Buyer (dispute) | **NO** | None (SALE at DELIVERED) | Shipment COMPLETED |
| PAYMENT_PENDING | PREPARING, CANCELLED | Buyer/System | Yes (via cancelOrder) | None | None |
| CANCELLED | *(terminal)* | — | — | RELEASE | None (GAP) |
| REJECTED | *(terminal)* | — | — | RELEASE | None |
| DISPUTED | *(terminal)* | — | — | None | None |

## 3.2 Key Observations

1. **Cancellation is permitted from 7 states**: SUBMITTED, PENDING_CONFIRMATION, ACCEPTED, PARTIALLY_ACCEPTED, PREPARING, READY, PAYMENT_PENDING
2. **Cancellation is BLOCKED from 4 active states**: ASSIGNED, PICKED_UP, OUT_FOR_DELIVERY, DELIVERED
3. **Once a driver is assigned (ASSIGNED), cancellation is impossible** — this is a business decision that M7.3-B must revisit
4. **CANCELLED and REJECTED are terminal** — no outgoing transitions
5. **The FSM allows READY → CANCELLED** in the TRANSITIONS map, and `cancelOrder()` includes READY in its cancellable list — consistent

---

# 4. Existing Cancellation Capabilities

## 4.1 Buyer Cancellation Endpoint

**File:** `orders.controller.ts` line 128-137
**File:** `orders.service.ts` line 947-969

```text
API: POST /v1/orders/:id/cancel
Actor: Buyer (or anyone with orders:cancel permission)
Permission: orders:cancel
Tenant check: assertOrderAccessible() in cancelOrder()
Current state requirement: SUBMITTED, PENDING_CONFIRMATION, ACCEPTED, PARTIALLY_ACCEPTED, PREPARING, READY, PAYMENT_PENDING
Database transaction: Via transitionStatus() — status + history in one tx
Optimistic lock: NONE — transitionStatus() uses plain UPDATE WHERE id = orderId
Inventory effect: settleStockForStatus() RELEASE (before status tx — GAP)
Shipment effect: NONE — shipment status not updated on cancellation
Carrier effect: NONE
Outbox event: order.cancelled (via eventMap in transitionStatus)
History event: order_status_history row (fromStatus, CANCELLED, reason)
Master recalculation: Yes (via transitionStatus line 942)
Idempotency: NONE — concurrent calls can both succeed if FSM allows
```

## 4.2 Merchant Cancellation via Generic Status Endpoint

**File:** `orders.controller.ts` line 110-126
**File:** `orders.service.ts` line 869-945

```text
API: POST /v1/orders/:id/status  { status: "CANCELLED", reason: "..." }
Actor: Merchant (merchant:orders:write permission)
Permission: merchant:orders:write
Tenant check: assertOrderAccessible() in transitionStatus()
Current state requirement: FSM assertTransition() check
Database transaction: status + history in one tx
Optimistic lock: NONE
Inventory effect: settleStockForStatus() RELEASE (before status tx — GAP)
Shipment effect: NONE
Carrier effect: NONE
Outbox event: order.cancelled
History event: order_status_history row
Master recalculation: Yes
Idempotency: NONE
```

**Critical:** Merchants do NOT hold `orders:cancel` permission. They use the generic status transition endpoint. The web merchant orders page confirms this: "Merchants do not hold orders:cancel, so the dedicated /orders/:id/cancel endpoint is not available to them."

## 4.3 Carrier Shipment Cancellation

**File:** `aramex.provider.ts` line 119-126, 260-268
**File:** `shipping-carrier.worker.ts` line 445-448

```text
Aramex capabilities.canCancel: false
cancelShipment(): returns { supported: false, reason: "..." }
cancelPickup(): EXISTS — calls Aramex CancelPickup API (for scheduled pickups only)
Worker handleCancel(): STUB — "not yet implemented"
```

---

# 5. Buyer Cancellation

## 5.1 By State

| State | Can Buyer Cancel? | Who Approves? | Inventory Effect | Shipment Effect | Carrier Effect |
|---|---|---|---|---|---|
| SUBMITTED | Yes | Self-service | None (no reservation) | None (no shipment) | None |
| PENDING_CONFIRMATION | Yes | Self-service | None (no reservation yet) | None (no shipment) | None |
| ACCEPTED | Yes | Self-service | RELEASE reserved stock | Shipment exists in PREPARING — **NOT updated** | None |
| PARTIALLY_ACCEPTED | Yes | Self-service | RELEASE reserved stock | Shipment exists — **NOT updated** | None |
| PREPARING | Yes | Self-service | RELEASE reserved stock | Shipment in PREPARING — **NOT updated** | None |
| READY | Yes | Self-service | RELEASE reserved stock | Shipment in READY — **NOT updated** | None |
| ASSIGNED | **NO** | — | — | — | — |
| PICKED_UP | **NO** | — | — | — | — |
| OUT_FOR_DELIVERY | **NO** | — | — | — | — |
| DELIVERED | **NO** | — | Stock already SALE'd | — | — |
| COMPLETED | **NO** | — | — | — | — |

```text
BUSINESS DECISION REQUIRED: Should buyer be able to cancel after ASSIGNED?
BUSINESS DECISION REQUIRED: Should buyer be able to cancel after PICKED_UP?
BUSINESS DECISION REQUIRED: Should buyer be able to cancel after OUT_FOR_DELIVERY?
```

## 5.2 Cancellation Reason

- **Mandatory**: Yes — `body: { reason: string }` in controller
- **Format**: Free text only — no predefined list
- **Validation**: None — empty string accepted (web checks `cancelReason.trim()` but API does not)

---

# 6. Merchant Cancellation

## 6.1 Current Capability

Merchants cancel via `POST /orders/:id/status` with `body.status = 'CANCELLED'`.

**States from which merchant can cancel** (FSM TRANSITIONS):
- PENDING_CONFIRMATION → CANCELLED
- ACCEPTED → CANCELLED
- PARTIALLY_ACCEPTED → CANCELLED
- PREPARING → CANCELLED
- READY → CANCELLED

**Web UI** (`merchant/orders/page.tsx` line 35):
```typescript
const MERCHANT_CANCELLABLE = ['PENDING_CONFIRMATION', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'PREPARING', 'READY'];
```

## 6.2 Merchant Cancellation Properties

| Property | Current |
|---|---|
| Separate endpoint | **NO** — uses generic status transition |
| Reason required | Optional (body.reason) |
| Inventory release | Yes (via settleStockForStatus) |
| Shipment update | **NO** — GAP |
| Carrier notification | **NO** — GAP |
| Master recalculation | Yes |
| Audit trail | Yes (order_status_history) |
| Outbox event | order.cancelled |

```text
BUSINESS DECISION REQUIRED: Should merchant cancellation require a reason from a predefined list?
BUSINESS DECISION REQUIRED: Should merchant cancellation differ from buyer cancellation?
```

---

# 7. Admin/Moderator Cancellation

## 7.1 Current Capability

Admin/Moderator/Super Admin hold `orders:cancel` permission and can bypass tenant isolation via `isTenantPrivileged()`.

| Role | Permission | Tenant Bypass | Can Cancel Any Order? |
|---|---|---|---|
| SUPER_ADMIN | orders:cancel | Yes | Yes |
| ADMIN | orders:cancel | Yes | Yes |
| MODERATOR | orders:cancel | Yes | Yes |

**Evidence:** `tenant-scope.ts` line 22: `const BYPASS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'];`

Privileged cancellation:
- Bypasses buyer ownership check
- Bypasses merchant store ownership check
- Bypasses tenant isolation
- Does NOT bypass state validation (still subject to cancellable list)
- Does NOT bypass FSM transitions

---

# 8. Cancellation vs Acceptance Race

**This is a CRITICAL concurrency defect.**

## 8.1 Current Implementation

```
cancelOrder():
  1. getOrder(orderId)                    ← reads current status
  2. assertOrderAccessible()              ← tenant check
  3. Check cancellable list               ← status gate
  4. transitionStatus(orderId, CANCELLED) ← calls transitionStatus

transitionStatus():
  1. getOrder(orderId)                    ← reads status AGAIN
  2. assertTransition(status, CANCELLED)  ← FSM check
  3. settleStockForStatus()               ← RELEASE stock (OUTSIDE tx)
  4. BEGIN tx
  5.   UPDATE orders SET status = CANCELLED WHERE id = $1   ← NO status predicate
  6.   INSERT order_status_history
  7. COMMIT tx
  8. publish outbox event
  9. recalculateMasterOrderStatus()
```

## 8.2 Race Scenario

```text
Thread A (Buyer):     cancelOrder()
Thread B (Merchant):  acceptOrder()

T0: A reads order → SUBMITTED
T1: B reads order → SUBMITTED, auto-advances to PENDING_CONFIRMATION
T2: A checks cancellable → SUBMITTED is cancellable ✓
T3: B assertTransition(PENDING_CONFIRMATION, ACCEPTED) → OK
T4: B flipResult: UPDATE WHERE id = $1 AND status = PENDING_CONFIRMATION → SUCCESS (optimistic lock)
T5: B reserveStock() → stock reserved
T6: A calls transitionStatus()
T7: A reads order → ACCEPTED
T8: A assertTransition(ACCEPTED, CANCELLED) → OK (FSM allows ACCEPTED → CANCELLED)
T9: A settleStockForStatus(CANCELLED) → RELEASE stock (but B just reserved it)
T10: A UPDATE orders SET status = CANCELLED WHERE id = $1 → SUCCESS (no status predicate!)
T11: Order is CANCELLED but stock was reserved AND released — net effect may be correct by accident

ALTERNATIVE TIMING:
T4: B flipResult → SUCCESS (accepted)
T5: A transitionStatus UPDATE → ALSO SUCCESS (no status predicate)
→ Both appear successful. Order ends CANCELLED. Merchant thinks they accepted.
→ Inventory: reserveStock committed, then settleStockForStatus RELEASE'd it → correct by accident
→ But: shipment was created by accept, order is now CANCELLED with an orphaned shipment
```

## 8.3 Root Cause

`transitionStatus()` line 887-891:
```typescript
await this.db.db.transaction(async (tx) => {
  await tx.update(orders)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(orders.id, orderId));  // ← NO status predicate
```

Compare with `acceptOrder()` line 687-691:
```typescript
const flipResult = await this.db.db
  .update(orders)
  .set({ status: 'ACCEPTED', updatedAt: new Date() })
  .where(and(eq(orders.id, orderId), eq(orders.status, currentStatus)))  // ← HAS status predicate
  .returning({ id: orders.id });
```

## 8.4 Expected Invariant

Only one of CANCEL or ACCEPT can succeed. The other must receive a conflict/rollback.

## 8.5 Recommended Protection

Add optimistic locking to `transitionStatus()` / `cancelOrder()`:
```sql
UPDATE orders SET status = 'CANCELLED'
WHERE id = $1 AND status = $expectedCurrentStatus
RETURNING id
```

---

# 9. Cancellation vs Fulfillment Races

## 9.1 CANCEL vs PREPARING

```text
cancelOrder() has NO optimistic lock.
fulfillmentTransition() HAS optimistic lock (line 1547-1551).

Race: If cancel commits first → fulfillmentTransition sees status ≠ current → rejects (safe).
Race: If fulfillment commits first → cancel's transitionStatus reads PREPARING → asserts PREPARING → CANCELLED (allowed by FSM) → UPDATE WHERE id (no predicate) → SUCCESS.

Result: Cancel wins even if fulfillment started first. No double-commit possible because fulfillmentTransition checks flipResult.
```

## 9.2 CANCEL vs READY

Same analysis as CANCEL vs PREPARING. Cancel can overwrite READY because `transitionStatus()` has no status predicate.

## 9.3 CANCEL vs ASSIGNED

```text
cancelOrder() cancellable list: does NOT include ASSIGNED.
FSM: ASSIGNED → ['PICKED_UP'] only.
assertTransition(ASSIGNED, CANCELLED) → throws ConflictException.

Result: Cancellation is BLOCKED once driver is assigned. This is a business decision.
```

```text
BUSINESS DECISION REQUIRED: Should cancellation be possible after driver assignment?
If yes: requires FSM change + shipment cancellation + driver notification.
If no: current behavior is correct.
```

## 9.4 CANCEL vs PICKED_UP / OUT_FOR_DELIVERY

Same as ASSIGNED — cancellation is blocked by FSM.

## 9.5 Inventory Consequences

When cancellation succeeds during PREPARING/READY:
- `settleStockForStatus(CANCELLED)` releases reserved stock
- But the shipment already exists and is in PREPARING/READY status
- **Shipment is NOT cancelled or updated** — orphaned shipment

---

# 10. Cancellation vs Delivery Race

## 10.1 CANCEL vs DELIVERED

```text
cancelOrder() cancellable list does NOT include OUT_FOR_DELIVERY.
FSM: OUT_FOR_DELIVERY → ['DELIVERED'] only.
assertTransition(OUT_FOR_DELIVERY, CANCELLED) → throws ConflictException.

Result: Cannot cancel during delivery. Correct behavior.
```

## 10.2 Interaction with deliverOrder()

`deliverOrder()` uses optimistic locking (line 1392-1396):
```typescript
const flipResult = await this.db.db
  .update(orders)
  .set({ status: 'DELIVERED', updatedAt: new Date() })
  .where(and(eq(orders.id, orderId), eq(orders.status, order['status'])))
  .returning({ id: orders.id });
```

Since cancellation is blocked from ASSIGNED/PICKED_UP/OUT_FOR_DELIVERY, there is no CANCEL vs DELIVERED race at the order level.

## 10.3 Interaction with processCarrierDelivery()

`processCarrierDelivery()` (line 2197-2260) checks:
```typescript
if (['DELIVERED', 'COMPLETED', 'DISPUTED'].includes(order['status'])) return false;
const allowed = OrdersService.TRANSITIONS[order['status']] || [];
if (!allowed.includes('DELIVERED')) return false;
```

Since cancellation is blocked before OUT_FOR_DELIVERY, carrier delivery and cancellation cannot race.

## 10.4 Inventory SALE Protection

M7.3-A established: stock is consumed (SALE) at DELIVERED, not at COMPLETED. Since cancellation is blocked from OUT_FOR_DELIVERY onward, there is no CANCEL vs SALE race.

---

# 11. Inventory Lifecycle

## 11.1 Complete Lifecycle Map

| Stage | Reservation | Stock Movement | Trigger |
|---|---|---|---|
| Checkout | None | None | Buyer creates order |
| Acceptance | RESERVE (qty_reserved +) | None | Merchant accepts |
| Preparation | Held | None | Merchant starts preparing |
| Delivery | Held → Released | SALE (qty_on_hand -) | Driver/Carrier delivers |
| Completion | Already consumed | None | Buyer confirms / auto-complete |
| Cancellation (pre-ACCEPT) | None | None | Order cancelled before acceptance |
| Cancellation (post-ACCEPT) | Released | RELEASE (qty_reserved -) | Order cancelled after acceptance |
| Rejection | Released | RELEASE (qty_reserved -) | Merchant rejects |

## 11.2 Cancellation Inventory Effects

| Cancellation State | Reservation Exists? | Release Required? | Stock Consumed? | Movement Required? |
|---|---|---|---|---|
| SUBMITTED | No | No | No | No |
| PENDING_CONFIRMATION | No | No | No | No |
| ACCEPTED | **Yes** | **Yes** | No | RELEASE |
| PARTIALLY_ACCEPTED | **Yes** | **Yes** | No | RELEASE |
| PREPARING | **Yes** | **Yes** | No | RELEASE |
| READY | **Yes** | **Yes** | No | RELEASE |
| PAYMENT_PENDING | No | No | No | No |

## 11.3 settleStockForStatus() Analysis

**File:** `orders.service.ts` lines 1799-1873

The method:
1. Queries all stock movements for the order
2. Nets RESERVE vs RELEASE/SALE to find outstanding quantity
3. For each item with outstanding > 0:
   - Opens a NEW transaction
   - SELECT ... FOR UPDATE on inventory row
   - Decrements qtyReserved (RELEASE) or qtyOnHand+qtyReserved (SALE)
   - Inserts RELEASE or SALE movement record

**Idempotency:** The netting logic ensures replayed transitions are no-ops — if all movements are already settled, outstanding = 0 and nothing happens.

---

# 12. Inventory Concurrency

## 12.1 CANCEL ↔ ACCEPT

```text
acceptOrder(): Optimistic lock on status flip (line 687-691)
cancelOrder() via transitionStatus(): NO optimistic lock

Race: Both read order → both see valid state → both attempt UPDATE
  - acceptOrder: UPDATE WHERE status = PENDING_CONFIRMATION → succeeds
  - transitionStatus: UPDATE WHERE id = orderId → ALSO succeeds (no predicate!)
  - Result: Order ends CANCELLED (last writer wins), but accept's reservation is orphaned
  - Then settleStockForStatus(CANCELLED) releases the reservation → correct by accident

SEVERITY: HIGH — last writer wins without conflict detection
```

## 12.2 CANCEL ↔ RESERVATION

```text
reserveStock() runs inside acceptOrder() AFTER the optimistic lock flip.
settleStockForStatus() runs inside transitionStatus() BEFORE the status tx.

If cancel runs first:
  - settleStockForStatus finds RESERVE movements → releases them
  - Then accept's reserveStock already committed → double reservation?
  - No: accept's flipResult would fail if cancel already changed status
  - BUT cancel has no status predicate → accept's flip succeeds → double reservation possible

SEVERITY: HIGH — potential double-reservation if cancel commits between accept's flip and reserveStock
```

## 12.3 CANCEL ↔ RELEASE

```text
settleStockForStatus uses SELECT ... FOR UPDATE on inventory row (line 1834-1838).
This prevents double-release at the inventory row level.

However: settleStockForStatus runs OUTSIDE the status transaction.
If status update fails after release committed → stock released but order not cancelled.

SEVERITY: HIGH — crash between release and status update causes permanent inconsistency
```

## 12.4 CANCEL ↔ DELIVERED

```text
Cannot happen: cancellation blocked from OUT_FOR_DELIVERY onward.
SALE happens at DELIVERED. No race possible.

SEVERITY: NONE — correctly prevented by FSM
```

## 12.5 Negative Stock Protection

`settleStockForStatus()` uses `GREATEST(qtyReserved - quantity, 0)` (line 1844) — prevents negative reserved quantity.

---

# 13. Shipment Lifecycle

## 13.1 Shipment Creation

Shipment is created at acceptance (`acceptOrder()` line 703 → `createShipment()` line 1247-1274):
- Inserts into `shipments` table with status = 'PREPARING'
- Inserts initial shipment event (PREPARING, MERCHANT)

## 13.2 Shipment Status Progression

| Order Status | Shipment Status | Trigger |
|---|---|---|
| (no order) | (no shipment) | — |
| ACCEPTED | PREPARING | acceptOrder() |
| PREPARING | PREPARING | prepareOrder() via fulfillmentTransition |
| READY | READY | readyOrder() via fulfillmentTransition |
| ASSIGNED | ASSIGNED | assignDriver() |
| PICKED_UP | PICKED_UP | pickupOrder() via driverFulfillmentTransition |
| OUT_FOR_DELIVERY | OUT_FOR_DELIVERY | outForDeliveryOrder() |
| DELIVERED | DELIVERED | deliverOrder() / processCarrierDelivery() |
| COMPLETED | COMPLETED (completedAt only) | completeOrder() |
| **CANCELLED** | **NOT UPDATED** | **cancelOrder() — GAP** |

## 13.3 Cancellation Impact on Shipment

When an order is cancelled:
- Order status → CANCELLED
- Stock released
- **Shipment status remains unchanged** (PREPARING/READY/etc.)
- **No shipment event recorded for cancellation**
- **No carrier notification**

This is a significant gap. An orphaned shipment remains in a non-terminal state.

---

# 14. Carrier Cancellation

## 14.1 Aramex Capabilities

**File:** `aramex.provider.ts` lines 119-126

```typescript
readonly capabilities: ProviderCapabilities = {
  canCreateShipment: true,
  canCancel: false,          // Aramex has NO CancelShipment API
  canGenerateLabel: true,
  canTrack: true,
  canValidateAddress: true,
  canReceiveWebhooks: true,
};
```

## 14.2 cancelShipment()

**File:** `aramex.provider.ts` lines 260-268

Returns `{ supported: false }` — Aramex does not provide a shipment cancellation API.

## 14.3 cancelPickup()

**File:** `aramex.provider.ts` lines 659-704

CancelPickup IS implemented:
- Calls `POST /json/CancelPickup` with PickupGUID
- Returns `{ supported: true, cancelled: true }` on success
- Returns `{ supported: true, cancelled: false, reason }` on failure

## 14.4 Worker handleCancel()

**File:** `shipping-carrier.worker.ts` lines 445-448

```typescript
private async handleCancel(event: any): Promise<void> {
  const shipmentId = event.aggregateId;
  this.logger.log(`Carrier cancel requested for shipment ${shipmentId} — not yet implemented.`);
}
```

**STUB** — does nothing except log.

## 14.5 Summary

| Capability | Status |
|---|---|
| Cancel carrier shipment | **NOT SUPPORTED** by Aramex |
| Cancel carrier pickup | **IMPLEMENTED** but not wired to order cancellation |
| Worker cancel handler | **STUB** |
| Shipment cancelledAt/cancellationReason columns | **EXISTS** in schema (line 61-62) but never written by order cancellation |

---

# 15. Carrier Failure Scenarios

## 15.1 Scenario Analysis

| Scenario | Current Behavior | Target Behavior |
|---|---|---|
| **A**: SCS cancel → carrier cancel succeeds | N/A — carrier cancel not wired | Mark shipment cancelled, record event |
| **B**: SCS cancel → carrier cancel fails | N/A — carrier cancel not wired | Log failure, shipment remains active, alert |
| **C**: SCS cancel → carrier request timeout | N/A | Assume not cancelled, schedule reconciliation |
| **D**: Carrier cancel succeeds → SCS receives timeout | N/A | Reconciliation detects divergence |
| **E**: Carrier cancel succeeds → SCS crashes | N/A | Idempotent retry on recovery |
| **F**: Carrier says DELIVERED after SCS cancel | processCarrierDelivery checks status → if CANCELLED, `TRANSITIONS[CANCELLED]` = [] → returns false | **Correct** — FSM prevents it |

```text
BUSINESS DECISION REQUIRED: When Aramex cannot cancel a shipment, should SCS:
  (a) Block order cancellation until carrier confirms?
  (b) Cancel order anyway and mark shipment as "orphaned — do not hand over"?
  (c) Cancel order and attempt CancelPickup as best effort?
```

---

# 16. Delivery Exceptions

## 16.1 Current State

**Not found.** Searched for: FAILED_DELIVERY, DELIVERY_FAILED, DELIVERY_EXCEPTION, RETURN_TO_SENDER, RTS, REFUSED, DAMAGED, LOST, MISSING, ADDRESS_INVALID, CUSTOMER_UNAVAILABLE, CARRIER_EXCEPTION.

None of these states exist in:
- Order FSM (TRANSITIONS map)
- Shipment schema
- Carrier tracking mapper
- Carrier provider
- Webhook processing
- Tracking poller
- Database schema

## 16.2 Carrier Tracking Poller Terminal States

**File:** `carrier-tracking-poller.ts` line 52

```typescript
const TERMINAL_STATUSES = new Set(['DELIVERED', 'CANCELLED', 'COMPLETED']);
```

Only three terminal states. No FAILED_DELIVERY or exception states.

---

# 17. Driver Exception Handling

## 17.1 Current Driver Capabilities

| Action | Endpoint | FSM Transition |
|---|---|---|
| Confirm pickup | POST /orders/:id/pickup | ASSIGNED → PICKED_UP |
| Out for delivery | POST /orders/:id/out-for-delivery | PICKED_UP → OUT_FOR_DELIVERY |
| Deliver | POST /orders/:id/deliver | OUT_FOR_DELIVERY → DELIVERED |

## 17.2 What a Driver Cannot Do

- Mark delivery exception (customer unavailable, wrong address, damaged)
- Retry delivery (no mechanism to reset OUT_FOR_DELIVERY)
- Return shipment to merchant
- Contact merchant or buyer through the system
- Cancel order
- Report any exception state

```text
BUSINESS DECISION REQUIRED: Which delivery exception types should be supported?
BUSINESS DECISION REQUIRED: Who can create delivery exceptions?
BUSINESS DECISION REQUIRED: Can delivery be retried after exception?
BUSINESS DECISION REQUIRED: When does shipment become "failed"?
```

---

# 18. Master Order Semantics

## 18.1 computeMasterStatus() with Cancellation

**File:** `orders.service.ts` lines 1992-2008

The aggregation rules (first match wins):
1. ALL COMPLETED → COMPLETED
2. ALL CANCELLED/REJECTED → CANCELLED
3. ALL DELIVERED or COMPLETED → DELIVERED
4. ANY DISPUTED → DISPUTED
5. ANY OUT_FOR_DELIVERY/ASSIGNED/PICKED_UP → OUT_FOR_DELIVERY
6. ANY PREPARING/READY → PREPARING
7. ANY ACCEPTED/PARTIALLY_ACCEPTED → ACCEPTED
8. ANY SUBMITTED/PENDING_CONFIRMATION → SUBMITTED

## 18.2 Cancellation Impact on Master

| Merchant A | Merchant B | Master Status | Notes |
|---|---|---|---|
| COMPLETED | CANCELLED | **UNREACHABLE** (FSM) | See A.2 Section 7 |
| DELIVERED | CANCELLED | **UNREACHABLE** (FSM) | See A.2 Section 7 |
| PREPARING | CANCELLED | PREPARING | Rule 6: ANY PREPARING/READY |
| SUBMITTED | CANCELLED | SUBMITTED | Rule 8: ANY SUBMITTED |
| CANCELLED | CANCELLED | CANCELLED | Rule 2: ALL CANCELLED/REJECTED |
| ACCEPTED | CANCELLED | ACCEPTED | Rule 7: ANY ACCEPTED |

**Observation:** The master order correctly reflects partial cancellation. If one sub-order is cancelled but others are active, the master shows the status of the active sub-orders. Only when ALL sub-orders are cancelled/rejected does the master become CANCELLED.

---

# 19. Multi-Merchant Cancellation

## 19.1 Scenario

```text
Master Order
├── Merchant A — ACCEPTED
├── Merchant B — PREPARING
└── Merchant C — SUBMITTED
```

| Action | Master Status | Inventory | Shipping | Notifications |
|---|---|---|---|---|
| Cancel A only | PREPARING (B is active) | A's stock released | A's shipment orphaned | order.cancelled for A |
| Cancel B only | ACCEPTED (A is active) | B's stock released | B's shipment orphaned | order.cancelled for B |
| Cancel C only | PREPARING (B is highest) | No release (C not accepted) | No shipment for C | order.cancelled for C |
| Cancel all three | CANCELLED | All released | All orphaned | 3x order.cancelled + master.status_changed |

## 19.2 Master-Level Cancellation

**Not found.** There is no API endpoint or service method to cancel an entire master order. Only individual sub-orders can be cancelled.

```text
BUSINESS DECISION REQUIRED: Should there be a master-level cancellation operation?
  - Cancel all sub-orders atomically?
  - Or is per-sub-order cancellation sufficient?
```

---

# 20. Idempotency

## 20.1 Sequential Cancellation

```text
CANCEL → order becomes CANCELLED
CANCEL → assertTransition(CANCELLED, CANCELLED) → CANCELLED: [] → throws ConflictException
```

**Result:** Second cancel is rejected by FSM. Idempotent by FSM design.

## 20.2 Concurrent Cancellation

```text
Thread A: cancelOrder() → reads SUBMITTED → transitionStatus(CANCELLED)
Thread B: cancelOrder() → reads SUBMITTED → transitionStatus(CANCELLED)

Both call transitionStatus():
  Both read order → both see SUBMITTED
  Both assertTransition(SUBMITTED, CANCELLED) → OK
  Both settleStockForStatus(CANCELLED) → both try to RELEASE
  Both UPDATE orders SET status = CANCELLED WHERE id = $1 → both succeed (no predicate)
  Both insert history → two identical history rows
  Both publish outbox → two order.cancelled events

Result: NOT idempotent. Two outbox events, two history rows. Stock release is idempotent
(netting prevents double-release), but the order lifecycle records are duplicated.
```

## 20.3 Duplicate Event Risk

| Component | Duplicate Risk |
|---|---|
| order_status_history | **YES** — two rows for same transition |
| outbox_events | **YES** — two order.cancelled events |
| stock_movements | **NO** — netting prevents double-release |
| Master recalculation | **NO** — idempotent (only updates if changed) |

---

# 21. Optimistic Locking Audit

| Method | State Mutation | Transaction | Conditional UPDATE | Optimistic Lock | Master Recalc |
|---|---|---|---|---|---|
| acceptOrder() | PENDING_CONFIRMATION → ACCEPTED | Separate (flip + reserve + shipment) | `WHERE status = currentStatus` | **YES** | **YES** |
| rejectOrder() | PENDING_CONFIRMATION → REJECTED | No explicit tx | Via transitionStatus | **NO** | **YES** |
| cancelOrder() | * → CANCELLED | Via transitionStatus | `WHERE id = orderId` | **NO** | **YES** |
| transitionStatus() | * → * | `tx` for status+history | `WHERE id = orderId` | **NO** | **YES** |
| prepareOrder() | ACCEPTED → PREPARING | Via fulfillmentTransition | `WHERE status = currentStatus` | **YES** | **YES** |
| readyOrder() | PREPARING → READY | Via fulfillmentTransition | `WHERE status = currentStatus` | **YES** | **YES** |
| assignDriver() | READY → ASSIGNED | Separate statements | `WHERE status = currentStatus` | **YES** | **YES** |
| pickupOrder() | ASSIGNED → PICKED_UP | Via driverFulfillmentTransition | `WHERE status = currentStatus` | **YES** | **YES** |
| outForDeliveryOrder() | PICKED_UP → OUT_FOR_DELIVERY | Via driverFulfillmentTransition | `WHERE status = currentStatus` | **YES** | **YES** |
| deliverOrder() | OUT_FOR_DELIVERY → DELIVERED | Separate statements | `WHERE status = currentStatus` | **YES** | **YES** |
| completeOrder() | DELIVERED → COMPLETED | Separate statements | `WHERE status = currentStatus` | **YES** | **YES** |
| confirmDelivery() | DELIVERED → COMPLETED | Separate | `WHERE status = DELIVERED AND buyerConfirmedAt IS NULL` | **YES** | **YES** |
| processCarrierDelivery() | * → DELIVERED | Separate statements | `WHERE status = currentStatus` | **YES** | **YES** |

**Critical gap:** `cancelOrder()` and `transitionStatus()` are the ONLY methods without optimistic locking. This is the most important concurrency defect M7.3-B must fix.

---

# 22. Transaction Boundary Audit

## 22.1 cancelOrder() → transitionStatus()

```text
settleStockForStatus()     ← OUTSIDE transaction (separate DB calls per item)
  └─ tx: SELECT FOR UPDATE + UPDATE inventory + INSERT movement
BEGIN tx
  UPDATE orders SET status = CANCELLED
  INSERT order_status_history
COMMIT tx
publish outbox             ← AFTER commit (not transactional)
recalculateMasterOrderStatus ← AFTER commit (separate transaction)
```

**Crash window:** If crash occurs after `settleStockForStatus()` but before status UPDATE:
- Stock is RELEASED
- Order status is NOT CANCELLED
- **PERMANENT INCONSISTENCY** — stock released but order still active

## 22.2 acceptOrder()

```text
Optimistic lock flip       ← Single UPDATE (auto-committed)
reserveStock()             ← Separate transaction (or outer tx)
createShipment()           ← Single INSERT (auto-committed)
recordStatusChange()       ← Single INSERT (auto-committed)
publish outbox             ← AFTER commit
recalculateMasterOrderStatus ← AFTER commit
```

**Crash window:** If crash occurs after flip but before reserveStock:
- Order is ACCEPTED
- Stock is NOT reserved
- Shipment is NOT created
- **INCONSISTENCY** — order accepted but no stock reserved

## 22.3 fulfilllmentTransition()

```text
Optimistic lock flip       ← Single UPDATE (auto-committed)
Update shipment            ← Single UPDATE (auto-committed)
Insert shipment event      ← Single INSERT
Record status change       ← Single INSERT
Publish outbox             ← AFTER commit
recalculateMasterOrderStatus ← AFTER commit
```

**Crash window:** If crash occurs after flip but before shipment update:
- Order status changed
- Shipment status NOT changed
- **MINOR INCONSISTENCY** — resolvable by reconciliation

---

# 23. Outbox Audit

## 23.1 Cancellation Events

| Event Type | When Published | Aggregate ID | Payload |
|---|---|---|---|
| `order.cancelled` | In transitionStatus() eventMap | orderId | `{ orderId, status, storeId, buyerId }` |

## 23.2 Missing Events

| Event | Status |
|---|---|
| `order.cancellation.requested` | Not found |
| `order.cancellation.approved` | Not found |
| `order.cancellation.rejected` | Not found |
| `shipment.cancelled` | Not found |
| `shipping.carrier.cancel` | Exists in worker but is a stub |
| `order.delivery_exception` | Not found |

## 23.3 Outbox Schema

**File:** `audit.schema.ts` line 30

Key columns: `event_type`, `aggregate_id`, `payload`, `organization_id`, `store_id`.
M7.2.3-C added: `locked_at`, `locked_by`, `locked_by_worker`, `status` (PENDING/PROCESSING/COMPLETED/FAILED/DEAD_LETTER).

---

# 24. Order History/Audit

## 24.1 Current Schema

**File:** `orders.schema.ts` lines 112-122

| Column | Type | Purpose |
|---|---|---|
| id | uuid | Primary key |
| order_id | uuid | FK to orders |
| from_status | varchar(24) | Previous status |
| to_status | varchar(24) | New status |
| changed_by | uuid | FK to users (nullable) |
| actor_type | varchar(16) | BUYER/MERCHANT/DRIVER/SYSTEM/CARRIER |
| reason | text | Cancellation reason (nullable) |
| metadata | jsonb | Extensible metadata |
| created_at | timestamp | When transition occurred |

## 24.2 Cancellation History

When cancellation occurs:
- `from_status` = current status (SUBMITTED/ACCEPTED/etc.)
- `to_status` = CANCELLED
- `changed_by` = userId
- `actor_type` = 'BUYER' (hardcoded in cancelOrder)
- `reason` = provided reason

**Gap:** Actor type is hardcoded as 'BUYER' in `cancelOrder()` even when a merchant or admin performs the cancellation via `transitionStatus()`. The `transitionStatus()` method takes actorType as a parameter, but `cancelOrder()` always passes 'BUYER'.

---

# 25. Security Audit

## 25.1 Cancellation Endpoint Security

| Check | cancelOrder() | transitionStatus() |
|---|---|---|
| JWT required | Yes (JwtAuthGuard on controller) | Yes |
| Permission | orders:cancel | merchant:orders:write |
| Tenant isolation | assertOrderAccessible() | assertOrderAccessible() |
| Buyer ownership | Via assertOrderAccessible | Via assertOrderAccessible |
| Merchant ownership | Via assertOrderAccessible | Via assertOrderAccessible |
| State validation | Hardcoded cancellable list | FSM assertTransition() |
| Optimistic lock | **NO** | **NO** |

## 25.2 IDOR Testing

| Attack | Target | Expected | Actual | Severity |
|---|---|---|---|---|
| Buyer A → Buyer B order | cancelOrder() | DENY | DENY (assertOrderAccessible) | NONE |
| Merchant A → Merchant B order | cancelOrder() | DENY | DENY (assertOrderAccessible) | NONE |
| Driver → order | cancelOrder() | DENY | DENY (assertOrderAccessible) | NONE |
| Tenant A → Tenant B order | cancelOrder() | DENY | DENY (assertOrderAccessible) | NONE |
| Unauthenticated | cancelOrder() | DENY | DENY (JwtAuthGuard) | NONE |

## 25.3 Merchant Status Endpoint Risk

The generic `POST /orders/:id/status` endpoint allows merchants to transition to ANY FSM-allowed status. This includes CANCELLED from ACCEPTED/PREPARING/READY. A merchant could:
- Cancel an order that is about to be delivered (if FSM allowed it)
- Transition to unexpected states

Currently mitigated by FSM constraints, but the endpoint is broader than necessary.

```text
SEVERITY: LOW — FSM prevents truly dangerous transitions, but the endpoint is overly permissive
```

---

# 26. Web/Mobile Audit

## 26.1 Web Buyer Cancellation

**File:** `apps/web/src/app/orders/[id]/page.tsx`

- Cancel button shown for cancellable states (line 194)
- Cancel dialog with reason input (line 136-145)
- Error surfacing (line 145)
- Matches backend cancellable list exactly

## 26.2 Web Merchant Cancellation

**File:** `apps/web/src/app/merchant/orders/page.tsx`

- MERCHANT_CANCELLABLE states: PENDING_CONFIRMATION, ACCEPTED, PARTIALLY_ACCEPTED, PREPARING, READY
- Cancel button in merchant orders page
- Uses `POST /orders/:id/status` endpoint (not /cancel)
- Cancel reason via dialog

## 26.3 Mobile Buyer Cancellation

**File:** `mobile/lib/screens/orders/order_detail_screen.dart`

- `_cancellable` set matches backend (line 36)
- `_confirmCancel()` dialog with reason input
- Calls `apiService.cancelOrder()` → `POST /v1/orders/:id/cancel`
- Success snackbar, error dialog

## 26.4 Mobile Merchant Cancellation

**File:** `mobile/lib/screens/merchant/merchant_orders_screen.dart`

- Shows CANCELLED in status filter (line 288)
- Transition map includes CANCELLED from READY (line 493)

## 26.5 Delivery Exception UI

**Not found.** No delivery exception UI exists in web or mobile.

---

# 27. API Contract Audit

## 27.1 Complete Order API Endpoints

| Method | Endpoint | Actor | Current State | Behavior |
|---|---|---|---|---|
| POST | /checkout | Buyer | Cart → DRAFT | Creates master + sub-orders |
| GET | /orders/master/:id | Buyer/Merchant | Any | Get master order |
| GET | /orders | Buyer/Merchant | Any | List orders |
| GET | /orders/:id | Buyer/Merchant | Any | Get sub-order |
| GET | /orders/:id/history | Buyer/Merchant | Any | Status history |
| POST | /orders/:id/accept | Merchant | PENDING_CONFIRMATION | Accept + reserve + ship |
| POST | /orders/:id/partial-accept | Merchant | PENDING_CONFIRMATION | Partial accept |
| POST | /orders/:id/reject | Merchant | PENDING_CONFIRMATION | Reject + release |
| POST | /orders/:id/status | Merchant | Various | Generic transition |
| POST | /orders/:id/cancel | Buyer/Admin | Pre-DELIVERED* | Cancel order |
| POST | /orders/:id/prepare | Merchant | ACCEPTED | Start preparation |
| POST | /orders/:id/ready | Merchant | PREPARING | Mark ready |
| POST | /orders/:id/assign-driver | Merchant | READY | Assign driver |
| POST | /orders/:id/pickup | Driver | ASSIGNED | Confirm pickup |
| POST | /orders/:id/out-for-delivery | Driver | PICKED_UP | Out for delivery |
| POST | /orders/:id/deliver | Driver | OUT_FOR_DELIVERY | Confirm delivery |
| POST | /orders/:id/confirm-delivery | Buyer | DELIVERED | Confirm → COMPLETED |
| GET | /orders/master/:id/tracking | Buyer | Any | Tracking info |
| GET | /drivers/shipments | Driver | Any | List driver shipments |

## 27.2 Missing Endpoints for M7.3-B

| Endpoint | Purpose | Priority |
|---|---|---|
| POST /orders/:id/cancel (merchant) | Dedicated merchant cancellation | MUST HAVE |
| POST /orders/master/:id/cancel | Master-level cancellation | SHOULD HAVE |
| POST /orders/:id/delivery-exception | Driver reports exception | MUST HAVE |
| POST /orders/:id/retry-delivery | Retry after exception | SHOULD HAVE |
| POST /orders/:id/return-to-sender | RTS authorization | DEFERRED |

---

# 28. Database Schema Audit

## 28.1 Current Tables Relevant to M7.3-B

| Table | Key Columns | M7.3-B Impact |
|---|---|---|
| orders | status, buyerConfirmedAt, autoCompleteAt | May need cancellationReason, cancelledAt |
| master_orders | status | No change needed |
| order_status_history | fromStatus, toStatus, actorType, reason | Already captures cancellation |
| shipments | status, cancelledAt, cancellationReason | Columns exist! Ready for use |
| shipment_events | eventType, actorType, notes | May need CANCELLED event type |
| outbox_events | eventType, aggregateId, status | May need new event types |
| stock_movements | movementType, referenceId | Already supports RELEASE |

## 28.2 Potential Migration 0048 Changes

| Change | Justification | Risk |
|---|---|---|
| Add `cancellationReason` to orders | Track why orders are cancelled | LOW — additive column |
| Add `cancelledBy` to orders | Track who cancelled (actor) | LOW — additive column |
| Add `cancellationSource` to orders | BUYER/MERCHANT/ADMIN/SYSTEM | LOW — additive column |
| Add CHECK constraint on shipment_events.event_type | Include CANCELLED | LOW |
| Add partial index on orders(status) WHERE status = 'CANCELLED' | Query performance | LOW |
| Add delivery_exception columns to orders | Exception tracking | MEDIUM — new FSM states |

**No backfill required** — all changes are additive.

---

# 29. Business Decisions Required

## 29.1 Buyer Cancellation

| Decision | Options | Consequence |
|---|---|---|
| Cancellation allowed until which state? | Current (READY) / ASSIGNED / PICKED_UP / OUT_FOR_DELIVERY | Each later state requires more reversal |
| Cancellation after acceptance? | Yes (current) / No | If no, must remove ACCEPTED from cancellable |
| Cancellation during preparation? | Yes (current) / No | Must release stock + cancel shipment |
| Cancellation after pickup? | **BUSINESS DECISION REQUIRED** | Package is with driver — physical reversal needed |
| Cancellation after out-for-delivery? | **BUSINESS DECISION REQUIRED** | Driver is en route — very costly to reverse |
| Cancellation after delivery? | **BUSINESS DECISION REQUIRED** | This becomes a return/refund — defer to M7.3-D |

## 29.2 Merchant Cancellation

| Decision | Options | Consequence |
|---|---|---|
| Allowed states? | Same as buyer / broader / narrower | Defines merchant flexibility |
| Reason required? | Yes (mandatory) / No (optional) | Affects audit trail quality |
| Predefined reason list? | Free text / enum / both | Affects UI and analytics |
| Merchant approval needed for buyer cancel? | Auto / requires merchant approval | Affects cancellation latency |

## 29.3 Shipment

| Decision | Options | Consequence |
|---|---|---|
| Cancel shipment automatically? | Yes / No | Orphaned shipments if no |
| Attempt carrier cancellation? | Yes (best effort) / No | Aramex doesn't support it; CancelPickup only |
| What if carrier rejects cancellation? | Block order cancel / cancel anyway + flag | Affects consistency |

## 29.4 Delivery Exception

| Decision | Options | Consequence |
|---|---|---|
| Which exception types? | CUSTOMER_UNAVAILABLE, WRONG_ADDRESS, DAMAGED, REFUSED, LOST | Defines driver workflow |
| Who can create? | Driver only / Driver + Carrier | Affects integration scope |
| Can delivery be retried? | Yes (reset to OUT_FOR_DELIVERY) / No | Affects FSM design |
| When does shipment become failed? | After N attempts / manual authorization | Affects automation |

## 29.5 Return to Sender

| Decision | Options | Consequence |
|---|---|---|
| When? | After exception / after max retries / manual | Defines RTS workflow |
| Who authorizes? | Driver / Merchant / Admin | Affects permission design |
| Carrier operation? | New delivery to merchant | Affects carrier integration |
| Inventory behavior? | Reverse SALE → restore on-hand | Complex inventory work — **DEFERRED TO M7.3-C** |

## 29.6 Master Order

| Decision | Options | Consequence |
|---|---|---|
| Sub-order cancellation only? | Yes (current) / Also master-level | Master-level = cancel all sub-orders atomically |
| Entire master cancellation? | **BUSINESS DECISION REQUIRED** | Convenience vs complexity |
| Master status aggregation? | Current rules are sufficient | CANCELLED sub-orders handled correctly |

## 29.7 Financial Behavior

```text
PAYMENT/REFUND IMPACT — DEFERRED TO M7.3-D
```

Current architecture has no payment integration. Cancellation inventory effects (RELEASE) are handled, but financial refunds are out of scope for M7.3-B.

---

# 30. Required Concurrency Test Matrix

## 30.1 Race Tests

| Test | Race | Iterations | Expected Invariant |
|---|---|---|---|
| R-01 | CANCEL vs ACCEPT | 100 | Exactly one succeeds; other gets ConflictException |
| R-02 | CANCEL vs REJECT | 100 | Exactly one succeeds |
| R-03 | CANCEL vs PREPARING | 100 | Exactly one succeeds; if CANCEL wins, stock released |
| R-04 | CANCEL vs READY | 100 | Exactly one succeeds |
| R-05 | CANCEL vs ASSIGN | 100 | Exactly one succeeds |
| R-06 | CANCEL vs PICKUP | 100 | CANCEL blocked by FSM; PICKUP wins |
| R-07 | CANCEL vs OUT_FOR_DELIVERY | 100 | CANCEL blocked by FSM; OFD wins |
| R-08 | CANCEL vs DELIVER | 100 | CANCEL blocked by FSM; DELIVER wins |
| R-09 | CANCEL vs COMPLETE | 100 | CANCEL blocked by FSM; COMPLETE wins |
| R-10 | CANCEL vs CARRIER_DELIVERY | 100 | CANCEL blocked by FSM; carrier wins |
| R-11 | CANCEL vs INVENTORY_RELEASE | 100 | Release is idempotent; exactly one effective release |
| R-12 | CANCEL vs INVENTORY_CONSUMPTION | 100 | Cannot race (FSM prevents) |
| R-13 | CANCEL vs MASTER_RECALC | 100 | Master status eventually consistent |

## 30.2 Idempotency Tests

| Test | Description | Expected |
|---|---|---|
| ID-01 | 100 concurrent cancel requests on same order | Exactly 1 effective cancellation; 99 get ConflictException |
| ID-02 | Sequential cancel → cancel | Second gets ConflictException (FSM terminal) |
| ID-03 | Cancel → accept → verify | Only one succeeds |

## 30.3 Concurrency Scale

For critical races (R-01, R-03, ID-01):
```text
2 concurrent    → verify basic correctness
10 concurrent   → verify no lost updates
50 concurrent   → verify no duplicate side effects
100 concurrent  → verify statistical safety
```

---

# 31. Required Inventory Invariants

| ID | Invariant | Currently Guaranteed? | Evidence |
|---|---|---|---|
| I-01 | A cancelled reservation is released at most once | **PARTIALLY** — netting prevents double-release, but crash between release and status update can orphan release | settleStockForStatus netting logic |
| I-02 | A delivered order is never returned to reserved state | **YES** — FSM: DELIVERED has no path to CANCELLED | TRANSITIONS map |
| I-03 | A delivered order cannot receive a second SALE | **YES** — completeOrder has no inventory movement; processCarrierDelivery is idempotent | M7.3-A verification |
| I-04 | Cancellation cannot create negative inventory | **YES** — GREATEST(qtyReserved - qty, 0) | settleStockForStatus line 1844 |
| I-05 | Concurrent cancellation cannot double-release inventory | **YES** — netting computes outstanding once | settleStockForStatus lines 1815-1826 |
| I-06 | Cancellation cannot race delivery and produce inconsistent stock | **YES** — FSM prevents cancel from OUT_FOR_DELIVERY | TRANSITIONS map |
| I-07 | All inventory effects are transactionally consistent with order state | **NO** — settleStockForStatus runs OUTSIDE the status transaction | transitionStatus lines 885-902 |

**Critical gap:** I-07 is violated. The stock settlement and status write are not in the same transaction.

---

# 32. Required Master-Order Invariants

| ID | Invariant | Currently Guaranteed? | Evidence |
|---|---|---|---|
| M-01 | Every effective sub-order status change eventually recalculates master status | **YES** — all transition paths call recalculateMasterOrderStatus | Code inspection |
| M-02 | Concurrent sub-order transitions cannot permanently corrupt master status | **YES** — SELECT ... FOR UPDATE on master row | recalculateMasterOrderStatus line 2026 |
| M-03 | Cancellation of one sub-order cannot incorrectly cancel unrelated sub-orders | **YES** — cancelOrder operates on single orderId | cancelOrder implementation |
| M-04 | Master status reflects all sub-orders per aggregation rules | **YES** — computeMasterStatus is deterministic | M7.3-A.2 verified |
| M-05 | Master status events emitted only when status actually changes | **YES** — `if (newStatus !== master['status'])` guard | recalculateMasterOrderStatus line 2040 |

---

# 33. Required Carrier Invariants

| ID | Invariant | Currently Supported? | Evidence |
|---|---|---|---|
| C-01 | SCS and carrier cancellation cannot diverge permanently | **NO** — no carrier cancellation exists | canCancel: false |
| C-02 | Carrier timeout does not imply successful cancellation | **N/A** — no cancel integration | handleCancel is stub |
| C-03 | Carrier cancellation retries are safe | **NO** — no implementation | — |
| C-04 | Carrier DELIVERED after SCS cancellation is reconciled | **YES** — FSM prevents TRANSITIONS[CANCELLED] → DELIVERED | processCarrierDelivery checks |
| C-05 | Carrier cancellation does not duplicate shipment events | **NO** — no implementation | — |
| C-06 | Carrier exceptions do not silently alter order state | **YES** — no carrier exception path exists | No exception handling |

---

# 34. Failure Injection Matrix

| Test | Failure Point | Expected State | Recovery | Idempotency | Potential Inconsistency |
|---|---|---|---|---|---|
| F-01 | After cancel status update | Order CANCELLED, stock released, outbox pending | Outbox retry | Must be safe | None if outbox is reliable |
| F-02 | After inventory release | Stock released, order NOT cancelled | **MANUAL** — no automatic recovery | **INCONSISTENCY** — stock released but order active |
| F-03 | Before inventory release | Order NOT cancelled, stock intact | Retry cancel | Safe — no side effects | None |
| F-04 | Before outbox publish | Order CANCELLED, stock released, no event | Outbox retry | Must not duplicate | None if outbox dedup works |
| F-05 | After outbox publish | Order CANCELED, event published | Master recalc retry | Idempotent | None |
| F-06 | Carrier cancel timeout | Unknown carrier state | Schedule reconciliation | Retry must be safe | Divergence until reconciled |
| F-07 | Carrier cancel succeeds, response lost | Carrier cancelled, SCS doesn't know | Reconciliation detects | Idempotent | Divergence until reconciled |
| F-08 | SCS crashes before recording carrier result | Unknown | Worker retry on restart | Must be safe | Divergence until reconciled |
| F-09 | Carrier reports DELIVERED after cancellation | Rejected by FSM | No recovery needed | processCarrierDelivery returns false | None |
| F-10 | Worker crashes during cancellation recovery | Partial state | Worker restart + reconciliation | Must be safe | Depends on what was committed |

---

# 35. Observability Audit

## 35.1 Can the System Answer These Questions?

| Question | Answerable? | Source |
|---|---|---|
| Who cancelled? | **PARTIALLY** — order_status_history.changed_by | Only if cancelOrder was used; transitionStatus records actorType |
| Why? | **YES** — order_status_history.reason | If reason was provided |
| When? | **YES** — order_status_history.created_at | — |
| Which merchant? | **YES** — orders.storeId → stores.orgId | — |
| Which order? | **YES** — orders.id | — |
| Which shipment? | **YES** — shipments.orderId | — |
| Was carrier cancellation attempted? | **NO** — no tracking | GAP |
| Did it succeed? | **NO** | GAP |
| Did it timeout? | **NO** | GAP |
| Was retry performed? | **NO** | GAP |
| Did inventory release? | **YES** — stock_movements WHERE referenceId = orderId | — |
| Did master status change? | **YES** — outbox_events WHERE event_type = 'order.master.status_changed' | — |

---

# 36. Test Infrastructure

| Capability | Status | Notes |
|---|---|---|
| Testcontainers (Linux CI) | **Available** | GitHub Actions ubuntu-latest with PostgreSQL 16 |
| PostgreSQL concurrency | **Available** | Verified in M7.3-A.2 |
| Unit tests (vitest) | **Available** | 993+ tests passing |
| Integration tests | **Available** | PostgreSQL specs with testcontainers |
| Web E2E | **NOT AVAILABLE** | No browser automation infrastructure |
| Mobile E2E | **NOT AVAILABLE** | No emulator infrastructure |
| Mobile unit tests | **Available** | flutter test |

---

# 37. Findings by Severity

## CRITICAL

*None.*

## HIGH

| ID | Finding | Impact |
|---|---|---|
| F-01 | `cancelOrder()` / `transitionStatus()` has NO optimistic locking | Concurrent CANCEL vs ACCEPT can both appear successful |
| F-02 | `settleStockForStatus()` executes OUTSIDE the status-write transaction | Crash between them leaves stock released but order status unchanged |
| F-03 | Carrier shipment cancellation NOT supported; worker handler is a stub | Cannot cancel carrier bookings when order is cancelled |
| F-04 | Zero delivery exception handling | No way to handle failed deliveries, refused packages, damaged goods |

## MEDIUM

| ID | Finding | Impact |
|---|---|---|
| F-05 | Driver has no mechanism to report delivery exceptions | Cannot handle customer unavailable, wrong address, etc. |
| F-06 | Merchant cancellation uses generic status endpoint | No cancellation-specific validation or audit trail |
| F-07 | Shipment status not updated on order cancellation | Orphaned shipments in non-terminal states |
| F-08 | No carrier reconciliation for post-cancellation delivery | Already handled by FSM (C-04 PASS), but no alerting |

## LOW

| ID | Finding | Impact |
|---|---|---|
| F-09 | cancelOrder() hardcodes actorType as 'BUYER' | Incorrect audit trail when admin/merchant cancels via transitionStatus |
| F-10 | No master-level cancellation operation | Must cancel each sub-order individually |

## INFO

| ID | Finding | Impact |
|---|---|---|
| I-01 | Shipment has cancelledAt/cancellationReason columns already | Schema is ready for M7.3-B implementation |
| I-02 | Aramex CancelPickup is implemented but not wired | Can be connected to order cancellation flow |

---

# 38. MUST HAVE / SHOULD HAVE / DEFERRED

## MUST HAVE (M7.3-B)

1. **Optimistic locking for cancelOrder() / transitionStatus()** — fix F-01
2. **Atomic stock settlement + status write** — fix F-02 (move settleStockForStatus inside the transaction)
3. **Shipment status update on cancellation** — fix F-07
4. **Dedicated merchant cancellation endpoint** — fix F-06
5. **Delivery exception states and driver workflow** — fix F-04, F-05
6. **Idempotent cancellation** — prevent duplicate outbox/history events

## SHOULD HAVE (M7.3-B)

7. **Carrier CancelPickup integration** — wire existing Aramex method to order cancellation
8. **Cancellation reason validation** — predefined list or mandatory validation
9. **Master-level cancellation** — convenience operation to cancel all sub-orders
10. **Cancellation observability** — track who/why/when with proper actor types

## DEFERRED

| Item | Target Milestone | Reason |
|---|---|---|
| Returns / RTS | M7.3-C | Requires separate return workflow |
| Refunds | M7.3-D | No payment integration yet |
| Dispute enhancement | M7.3-E | Current dispute flow is sufficient |
| Notification redesign | M7.3-F | Current notifications work |
| Carrier shipment cancellation (full) | M7.3-B.3 | Aramex doesn't support it; CancelPickup is best effort |
| Financial reconciliation | M7.3-D | No payment system |

---

# 39. Proposed M7.3-B Scope

## Phase B.0: Architecture Decisions
- Resolve business decisions (Section 29)
- Finalize FSM extensions for delivery exceptions
- Define cancellation reason enum

## Phase B.1: Cancellation Concurrency Hardening
- Add optimistic locking to cancelOrder() / transitionStatus()
- Move settleStockForStatus() inside the transaction
- Add idempotent cancellation (dedup events/history)
- Update shipment status on cancellation
- Concurrency test matrix (Section 30)

## Phase B.2: Merchant Cancellation
- Dedicated merchant cancellation endpoint
- Cancellation reason validation
- Proper actor type recording

## Phase B.3: Carrier Cancellation Integration
- Wire CancelPickup to order cancellation flow
- Worker handleCancel() implementation
- Best-effort carrier notification

## Phase B.4: Delivery Exception Handling
- New FSM states or shipment-level exception tracking
- Driver exception reporting API
- Exception → retry/failed workflow
- Carrier exception integration

## Phase B.5: Recovery & Reconciliation
- Post-cancellation carrier delivery detection
- Shipment/order state reconciliation worker
- Observability improvements

## Phase B.6: Runtime Verification
- Concurrency tests (100 iterations each)
- Failure injection tests
- Security tests
- Full regression

---

# 40. Proposed Migration 0048

## Tables Affected

### orders
```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason varchar(300);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_source varchar(16);
-- cancellation_source CHECK: BUYER, MERCHANT, ADMIN, SYSTEM
```

### orders (delivery exception — if FSM-level)
```sql
-- Only if delivery exceptions are order-level states:
-- Not recommended — keep exceptions at shipment level
```

### shipment_events
```sql
-- No schema change needed — event_type varchar(24) accommodates new types
-- New event types: CANCELLED, DELIVERY_EXCEPTION, RETURN_TO_SENDER
```

### shipments (delivery exception tracking)
```sql
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS exception_type varchar(40);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS exception_notes text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS exception_at timestamp WITH TIME ZONE;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivery_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS max_delivery_attempts integer NOT NULL DEFAULT 3;
```

### Indexes
```sql
CREATE INDEX IF NOT EXISTS idx_orders_cancellation ON orders(cancellation_source)
  WHERE cancellation_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_exception ON shipments(exception_type)
  WHERE exception_type IS NOT NULL;
```

## Backfill Requirements
None — all changes are additive columns.

## Idempotency
All DDL uses `IF NOT EXISTS` — safe to re-apply.

## Rollback Concerns
Columns can be dropped without data loss (no backfill).

## Zero-Downtime
All changes are backward-compatible additive DDL.

---

# 41. Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Optimistic lock fix breaks existing tests | MEDIUM | LOW | Tests use sequential execution; lock only affects concurrent |
| Moving settlement inside tx increases lock time | LOW | MEDIUM | Settlement is fast (SELECT FOR UPDATE + UPDATE) |
| Delivery exception FSM design is complex | HIGH | MEDIUM | Keep exceptions at shipment level, not order level |
| Aramex CancelPickup may not cover all scenarios | HIGH | LOW | Best-effort; document limitation |
| Merchant cancellation endpoint change breaks web | LOW | LOW | Web already uses status endpoint; new endpoint is additive |

---

# 42. Dependencies

| Dependency | Required By | Status |
|---|---|---|
| M7.3-A (delivery completion) | B.4 (exception handling) | **COMPLETE** |
| M7.2.3-C (carrier operations) | B.3 (carrier cancellation) | **COMPLETE** |
| M7.2.4 (concurrency hardening) | B.1 (cancellation concurrency) | **COMPLETE** |
| Business decisions (Section 29) | All phases | **PENDING** |
| Payment integration | Refund handling | **NOT STARTED — DEFERRED TO M7.3-D** |

---

# 43. GO / GO WITH CONDITIONS / NO-GO

```text
GO WITH CONDITIONS
```

## Conditions

1. **Business decisions required** (Section 29) must be resolved before implementation:
   - Cancellation cutoff state (after ASSIGNED or not?)
   - Delivery exception types to support
   - Return-to-sender authorization model
   - Master-level cancellation scope

2. **Concurrency defects F-01 and F-02 must be fixed** as the first implementation phase — they are safety-critical.

3. **Carrier cancellation limitation acknowledged**: Aramex does not support CancelShipment. Only CancelPickup is available. M7.3-B must handle this gracefully (best-effort + reconciliation).

4. **Delivery exception design choice**: Recommend keeping exception states at the shipment level rather than adding new order FSM states. This minimizes FSM complexity and avoids breaking M7.3-A invariants.

---

# 44. Recommended Next Step

Upon acceptance of this audit:

1. Resolve the business decisions in Section 29
2. Proceed to **M7.3-B Implementation** starting with Phase B.1 (Cancellation Concurrency Hardening)
3. Do NOT start M7.3-C/D/E/F until M7.3-B is complete

---

*Audit generated: 2026-09-29*
*Source: Real PostgreSQL 16.4, direct code inspection of develop branch @ 0f92097*
*Scope: M7.3-A closed codebase + all prior milestone artifacts*
*Status: READ-ONLY — no production code modified*
