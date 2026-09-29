# SCS Platform — M7.3-B.0 Business Rules & Architecture Decision Lock

**Milestone:** M7.3-B.0
**Phase:** Business Rules + Architecture Decision Lock
**Status:** DECISION-LOCK COMPLETE
**Baseline:** `develop` after M7.3-A.2 / M7.3-A CLOSED/PASS
**Predecessor:** M7.3-B Pre-Implementation Architecture Audit
**Next Phase:** M7.3-B.1 — Cancellation Concurrency Hardening
**Implementation:** STRICTLY FORBIDDEN IN THIS PHASE

---

## 1. Executive Summary

This document converts the findings of the M7.3-B Pre-Implementation Architecture Audit into formally locked business rules and architecture decisions that serve as the authoritative specification for all M7.3-B implementation phases.

**Audit verdict inherited:** GO WITH CONDITIONS

**Critical findings addressed by this document:**
- **F-01** (HIGH): `cancelOrder()`/`transitionStatus()` has no optimistic locking — concurrency race with accept/reject/preparing/ready
- **F-02** (HIGH): `settleStockForStatus()` executes outside the status-write transaction — crash window creates permanent inventory inconsistency
- **F-03** (HIGH): Carrier shipment cancellation not supported; worker `handleCancel()` is a stub
- **F-04** (HIGH): Zero delivery exception handling in the entire platform
- **F-05 through F-10**: MEDIUM/INFO findings on driver exceptions, merchant cancel endpoint, shipment orphans, reconciliation

**Key decisions locked:**
1. Cancellation cutoff: Policy A (until READY inclusive) for buyer/merchant; ADMIN may cancel from any non-terminal state
2. Delivery exceptions modeled at shipment level, not order FSM
3. RTS operational state recorded in M7.3-B; inventory return deferred to M7.3-C
4. Master cancellation: sub-order orchestration only (Model C)
5. Carrier cancellation: best-effort CancelPickup + shipment orphan marking + reconciliation flag
6. Optimistic locking mandatory for all state transitions

---

## 2. Baseline Verification

```text
Branch: develop
Commit: 0f92097
M7.3-A status: CLOSED / PASS (per SCS-M7.3-A.2-LINUX-CI-RELEASE-CLOSURE.md)
Audit baseline: SCS-M7.3-B-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md
Working tree: DIRTY — M7.3-A uncommitted changes (expected, not yet committed)
```

**Dirty files (all M7.3-A related, no M7.3-B changes):**
- Modified: orders.service.ts, orders.controller.ts, orders.module.ts, orders.schema.ts, notifications.service.ts, carrier-tracking-poller.ts, shipping.module.ts, buyer-api.ts, order_detail_screen.dart, api_service.dart, page.tsx
- New: auto-complete.worker.ts, m73a-delivery-completion.postgres.spec.ts, 0047_delivery_completion.sql, M7.3-A docs

**FSM confirmed at baseline (orders.service.ts lines 1940-1957):**
```text
DRAFT → [SUBMITTED]
SUBMITTED → [PENDING_CONFIRMATION]
PENDING_CONFIRMATION → [ACCEPTED, PARTIALLY_ACCEPTED, REJECTED, CANCELLED]
ACCEPTED → [PREPARING, CANCELLED]
PARTIALLY_ACCEPTED → [PREPARING, CANCELLED]
PREPARING → [READY, CANCELLED]
READY → [OUT_FOR_DELIVERY, ASSIGNED, DELIVERED, CANCELLED]
ASSIGNED → [PICKED_UP]
PICKED_UP → [OUT_FOR_DELIVERY]
OUT_FOR_DELIVERY → [DELIVERED]
DELIVERED → [COMPLETED, DISPUTED]
COMPLETED → [DISPUTED]
PAYMENT_PENDING → [PREPARING, CANCELLED]
CANCELLED → [] (terminal)
REJECTED → [] (terminal)
DISPUTED → [] (terminal)
```

---

## 3. Current Cancellation Model (As Implemented)

### 3.1 Cancellable States (Confirmed)

```text
SUBMITTED          — transient checkout state; not externally cancellable (AMENDED B.2)
PENDING_CONFIRMATION — buyer cancel button active
ACCEPTED           — buyer cancel button active
PARTIALLY_ACCEPTED — buyer cancel button active
PREPARING          — buyer cancel button active
READY              — buyer cancel button active
PAYMENT_PENDING    — buyer cancel button active
```

### 3.2 Non-Cancellable States (Confirmed)

```text
ASSIGNED           — driver assigned, physical fulfillment started
PICKED_UP          — package with driver
OUT_FOR_DELIVERY   — en route to recipient
DELIVERED          — package delivered
COMPLETED          — buyer confirmed delivery
DISPUTED           — under dispute resolution
CANCELLED          — already terminal
REJECTED           — already terminal
```

### 3.3 Cancellation Transition Map

```text
PENDING_CONFIRMATION → CANCELLED (buyer/merchant/admin)
ACCEPTED → CANCELLED           (buyer/merchant/admin)
PARTIALLY_ACCEPTED → CANCELLED (buyer/merchant/admin)
PREPARING → CANCELLED          (buyer/merchant/admin)
READY → CANCELLED              (buyer/merchant/admin)
PAYMENT_PENDING → CANCELLED    (buyer/merchant/admin)
```

### 3.4 Current Implementation Defects

| Defect | Location | Severity |
|--------|----------|----------|
| No optimistic lock on cancel | `transitionStatus()` L888-891 | HIGH |
| `settleStockForStatus()` outside tx | `transitionStatus()` L885 | HIGH |
| Hardcoded `actorType = 'BUYER'` | `cancelOrder()` L968 | MEDIUM |
| No shipment state update on cancel | `cancelOrder()` entire method | MEDIUM |
| No carrier notification on cancel | `cancelOrder()` entire method | HIGH |
| Generic endpoint for merchant cancel | `POST /orders/:id/status` | MEDIUM |

---

## 4. BUSINESS DECISION #1 — CANCELLATION CUTOFF

### Policy Analysis

#### Policy A — Cancellation allowed until READY (inclusive)

| Dimension | Impact |
|-----------|--------|
| Buyer experience | Buyer can cancel up until the merchant marks "ready for pickup/driver". Clear cutoff. |
| Merchant experience | Merchant can cancel up to READY. Once ASSIGNED, cancellation requires admin. |
| Driver implications | No driver involvement — cancellation stops before driver assignment. |
| Shipment implications | Shipment exists (created at ACCEPTED) but driver not yet assigned. Simple cancellation. |
| Carrier implications | If carrier shipment created at acceptance, CancelPickup may still be possible. |
| Inventory implications | Stock reserved at acceptance, released at cancel. Clean before driver pickup. |
| Race conditions | Minimal — READY→ASSIGNED is merchant-controlled, clear boundary. |
| Operational complexity | Lowest — no driver recall, no package interception. |
| Future refund implications | Pre-fulfillment cancel = automatic refund eligibility. |
| Future return implications | No return needed — package never left. |

#### Policy B — Cancellation allowed until ASSIGNED (inclusive)

| Dimension | Impact |
|-----------|--------|
| Buyer experience | Can cancel even after driver assigned. Must recall driver. |
| Merchant experience | Can cancel after assigning driver. Wastes driver time. |
| Driver implications | Driver may already be en route to pickup. Recall required. |
| Shipment implications | Shipment has assigned driver. Must unassign + cancel. |
| Carrier implications | Carrier may have been notified. Additional cancel step. |
| Inventory implications | More complex — driver may have already picked up physically. |
| Race conditions | ASSIGNED→PICKED_UP is fast. Race window between cancel and pickup. |
| Operational complexity | Higher — driver notification, recall, potential compensation. |
| Future refund implications | May need partial refund if driver was dispatched. |
| Future return implications | If driver already picked up, becomes a return scenario. |

#### Policy C — Cancellation allowed until PICKED_UP (inclusive)

| Dimension | Impact |
|-----------|--------|
| Buyer experience | Can cancel even after package is with driver. High flexibility but confusing. |
| Merchant experience | Package already in driver's hands. Physical recall needed. |
| Driver implications | Driver has package. Must return it. Wasted trip. |
| Shipment implications | Shipment in PICKED_UP state. Complex reversal. |
| Carrier implications | Carrier may have accepted package. |
| Inventory implications | Stock physically moved. Return-to-stock needed. |
| Race conditions | PICKED_UP→OUT_FOR_DELIVERY is very fast. Extreme race risk. |
| Operational complexity | Very high — physical package recovery required. |
| Future refund implications | Complex — partial fulfillment occurred. |
| Future return implications | Essentially a return from the start. |

#### Policy D — Cancellation allowed until OUT_FOR_DELIVERY (inclusive)

| Dimension | Impact |
|-----------|--------|
| Buyer experience | Can cancel while package is en route to them. Confusing UX. |
| Merchant experience | Package is literally on its way to buyer. Cancellation makes no sense. |
| Driver implications | Driver is actively delivering. Must abort delivery route. |
| Shipment implications | Shipment in active delivery. Full reversal needed. |
| Carrier implications | Carrier actively delivering. |
| Inventory implications | Package is with driver, not in warehouse. |
| Race conditions | OUT_FOR_DELIVERY→DELIVERED is the fastest transition. Impossible to guarantee. |
| Operational complexity | Maximum — driver rerouting, package return, buyer confusion. |
| Future refund implications | Very complex. |
| Future return implications | Identical to a return. |

### Locked Decision

```text
BUYER CANCELLATION CUTOFF: READY (inclusive)
MERCHANT CANCELLATION CUTOFF: READY (inclusive)
ADMIN CANCELLATION CUTOFF: Any non-terminal state (PENDING_CONFIRMATION through READY, plus
                           ASSIGNED/PICKED_UP/OUT_FOR_DELIVERY with explicit
                           admin override; NOT DELIVERED/COMPLETED/DISPUTED/CANCELLED/REJECTED)
                           (AMENDED B.2: SUBMITTED removed — transient auto-advance state)
DRIVER CANCELLATION: Not permitted. Drivers report exceptions, not cancellations.
```

**Rationale:** Policy A provides the cleanest boundary. Once a driver is assigned (ASSIGNED), physical fulfillment has begun and cancellation becomes a physical recovery problem, not a logical state change. Admin override for ASSIGNED+ states allows operational flexibility for exceptional circumstances (merchant fraud, system error) without exposing this complexity to buyers/merchants.

---

## 5. BUSINESS DECISION #2 — CANCELLATION REASONS

### Controlled Vocabulary

| Code | Display Name | Actor Allowed | Required? | Customer Visible | Merchant Visible | Admin Visible | Affects Refund |
|------|-------------|---------------|-----------|-----------------|-----------------|---------------|----------------|
| `CUSTOMER_REQUEST` | Customer requested cancellation | BUYER | Required | Yes | Yes | Yes | Yes — full refund eligible |
| `DUPLICATE_ORDER` | Duplicate order | BUYER | Required | Yes | Yes | Yes | Yes — full refund eligible |
| `MERCHANT_UNABLE_TO_FULFILL` | Merchant unable to fulfill | MERCHANT | Required | Yes (generic) | Yes | Yes | Yes — full refund eligible |
| `OUT_OF_STOCK` | Item(s) out of stock | MERCHANT | Required | Yes | Yes | Yes | Yes — full refund eligible |
| `PRICE_ERROR` | Pricing error | MERCHANT, ADMIN | Required | Yes (generic) | Yes | Yes | Yes — review required |
| `ADDRESS_PROBLEM` | Address cannot be serviced | MERCHANT, ADMIN | Required | Yes | Yes | Yes | Yes — review required |
| `PAYMENT_PROBLEM` | Payment verification failed | SYSTEM, ADMIN | Optional | Yes (generic) | Yes | Yes | Yes — may void |
| `CARRIER_PROBLEM` | Carrier unable to deliver | ADMIN, SYSTEM | Optional | Yes (generic) | Yes | Yes | Yes — review required |
| `SYSTEM_ERROR` | System error caused cancellation | SYSTEM | Optional | Yes (generic) | Yes | Yes | Yes — review required |
| `ADMINISTRATIVE` | Administrative cancellation | ADMIN | Required | Yes (generic) | Yes | Yes | Yes — review required |
| `OTHER` | Other (requires notes) | BUYER, MERCHANT, ADMIN | Required + notes | Yes | Yes | Yes | Yes — review required |

**Excluded codes and rationale:**
- `MERCHANT_REQUEST` — merged into `MERCHANT_UNABLE_TO_FULFILL` (more specific) and `OTHER` (catch-all)
- `PAYMENT_PROBLEM` — kept but marked as SYSTEM-originated only; merchants don't see payment details

---

## 6. BUSINESS DECISION #3 — DELIVERY EXCEPTION MODEL

### Architecture Decision

**ACCEPTED: Delivery exceptions are modeled at the SHIPMENT level.**

```text
Order/SubOrder → status remains unchanged during delivery exception
Shipment → gains exception state
```

**NOT:**
```text
Order FSM → expanded with FAILED_DELIVERY, DAMAGED, LOST, etc.
```

### Reasoning

1. **Separation of concerns**: The order FSM tracks the logical business state (was the order fulfilled?). The shipment tracks the physical state (did the package arrive?). These are different concerns.
2. **Multi-shipment safety**: A master order with 3 sub-orders may have 1 delivery exception without affecting the other 2. Expanding the order FSM would require complex aggregation rules.
3. **Retry semantics**: A delivery retry is a shipment operation (try delivering again), not an order operation. The order is still "out for delivery" from its perspective.
4. **Carrier alignment**: Carrier systems report exceptions at the shipment/tracking level, not the order level.
5. **Future returns**: Returns are an order-level concept triggered after delivery exceptions are resolved. Keeping them separate prevents FSM explosion.

### Canonical Exception Types

| Code | Display Name | Description |
|------|-------------|-------------|
| `RECIPIENT_UNAVAILABLE` | Recipient unavailable | Recipient not at delivery address |
| `RECIPIENT_REFUSED` | Recipient refused | Recipient explicitly refused delivery |
| `WRONG_ADDRESS` | Wrong address | Address incorrect or inaccessible |
| `DAMAGED` | Package damaged | Package damaged in transit |
| `LOST` | Package lost | Package cannot be located |
| `CARRIER_EXCEPTION` | Carrier exception | Carrier-reported issue not in other categories |
| `DRIVER_EXCEPTION` | Driver exception | Driver-reported issue (vehicle, weather, safety) |
| `OTHER` | Other | Requires notes |

**Excluded:**
- `FAILED_DELIVERY` — too generic; replaced by specific types above
- `ADDRESS_INACCESSIBLE` — merged into `WRONG_ADDRESS`
- `RECIPIENT_REFUSED` kept separate from `RECIPIENT_UNAVAILABLE` because they have different RTS implications

---

## 7. DELIVERY EXCEPTION OWNERSHIP

| Actor | Allowed Exception Types | Required Evidence | Required Reason | Can Resolve? | Can Retry? | Can Trigger RTS? | Can Close? |
|-------|------------------------|-------------------|-----------------|-------------|-----------|-----------------|-----------|
| DRIVER | `RECIPIENT_UNAVAILABLE`, `RECIPIENT_REFUSED`, `WRONG_ADDRESS`, `DRIVER_EXCEPTION`, `OTHER` | Notes required; photo optional for UNAVAILABLE | Yes | No | No | No | No |
| MERCHANT | `DAMAGED`, `CARRIER_EXCEPTION`, `OTHER` | Notes required | Yes | Yes | Yes (approve) | Yes (request) | Yes |
| ADMIN | All types | Notes required | Yes | Yes | Yes | Yes | Yes |
| SYSTEM | `CARRIER_EXCEPTION`, `LOST` | Carrier status evidence | Auto-generated | No | No | No | No |
| CARRIER | Via webhook → `CARRIER_EXCEPTION`, `LOST`, `DAMAGED` | Carrier data | Carrier code | No | No | No | No |
| BUYER | Not applicable — buyers report issues via disputes (M7.3-E) | N/A | N/A | N/A | N/A | N/A | N/A |

---

## 8. DELIVERY RETRY POLICY

```text
Maximum delivery attempts: 3 (configurable)
Default value: 3
Who may request retry: DRIVER (suggest), MERCHANT (request), ADMIN (request)
Who may approve retry: MERCHANT (own orders), ADMIN (any)
Does retry create a new shipment? NO — reuses existing shipment
Does retry reuse shipment? YES — same shipment record, new attempt
Does retry create a shipment event? YES — DELIVERY_RETRY_REQUESTED + DELIVERY_RETRY_ATTEMPTED
Does retry contact carrier? NO — retry is driver-based re-attempt (manual delivery)
Does retry reset shipment status? YES — back to OUT_FOR_DELIVERY for the new attempt
```

**Configuration:**
```text
Environment/config key: DELIVERY_MAX_ATTEMPTS
Default: 3
Minimum: 1
Maximum: 10
```

---

## 9. BUSINESS DECISION #4 — RTS / RETURN TO SENDER

### M7.3-B Boundary

```text
M7.3-B records the operational RTS state/event only.
Inventory return-to-stock is deferred to M7.3-C.
Financial refund handling is deferred to M7.3-D.
```

### RTS Authorization

```text
RTS authorization actor: ADMIN (primary), MERCHANT (request with admin approval for LOST/DAMAGED)
RTS triggers: RECIPIENT_REFUSED, MAX_DELIVERY_ATTEMPTS_EXCEEDED
RTS status: Shipment gains exceptionStatus = 'RTS_PENDING' → 'RTS_IN_PROGRESS' → 'RTS_COMPLETED'
Carrier action: None in M7.3-B (Aramex has no RTS API)
Inventory action: DEFERRED to M7.3-C
Order action: Sub-order status remains OUT_FOR_DELIVERY; master aggregation reflects exception
Financial action: DEFERRED to M7.3-D
```

### RTS Not Triggered By

- `RECIPIENT_UNAVAILABLE` — retry first, RTS only after max attempts
- `WRONG_ADDRESS` — retry with corrected address first
- `DAMAGED` — merchant decides disposition (no auto-RTS)
- `LOST` — admin investigation first; RTS only if confirmed unrecoverable
- `CARRIER_EXCEPTION` — depends on specific carrier issue
- `DRIVER_EXCEPTION` — depends on specific driver issue

---

## 10. BUSINESS DECISION #5 — MASTER ORDER CANCELLATION

### Decision: Model C — Orchestrated Sub-Order Cancellation

```text
Buyer master cancellation: Cancels all cancellable sub-orders. Non-cancellable sub-orders
                           are left unchanged. Returns list of cancelled + skipped sub-orders.
Merchant master cancellation: NOT PERMITTED. Merchants can only cancel their own sub-orders.
Admin master cancellation: Can cancel individual sub-orders or orchestrate all cancellable
                           sub-orders. Admin may also cancel ASSIGNED+ sub-orders (override).
Partial cancellation: Supported — cancelling some sub-orders while others continue.
Mixed cancelled + active: Master status = PROCESSING (some sub-orders active).
Mixed cancelled + completed: Master status = COMPLETED (all non-cancelled sub-orders done).
```

**Canonical principle preserved:** The master order represents the aggregation of merchant sub-orders. Master cancellation is an orchestration operation, not an independent state change.

**Master status aggregation during cancellation:**
- All sub-orders CANCELLED → master CANCELLED
- Some CANCELLED, some active → master reflects active sub-orders (PROCESSING/PREPARING/READY/etc.)
- Some CANCELLED, some DELIVERED → master COMPLETED (cancelled sub-orders ignored in aggregation)
- All sub-orders CANCELLED or COMPLETED → master COMPLETED

---

## 11. CANCELLATION VS CARRIER

### Current Capability (Confirmed)

```text
Aramex CancelShipment: NOT SUPPORTED (canCancel: false)
Aramex CancelPickup: SUPPORTED (fully implemented)
Manual delivery: No carrier integration
```

### Decision: Best-Effort + Reconciliation Flag

```text
carrier cancellation attempt: Check provider.canCancel. If true, attempt cancelShipment().
                              If false, attempt cancelPickup() if pickup was scheduled.
                              If neither available, mark shipment for reconciliation.
timeout behavior: 10-second timeout on carrier cancellation call. Timeout = unknown result.
carrier failure behavior: Log error, mark shipment.cancelledAt + cancellationReason,
                          set shipment.recoveryStatus = 'CARRIER_CANCEL_FAILED'.
                          Order cancellation proceeds regardless (SCS is authoritative).
unknown result behavior: Mark shipment.recoveryStatus = 'CARRIER_CANCEL_UNKNOWN'.
                         Reconciliation engine (M7.2.3-C) will detect if carrier
                         shipment still active on next poll.
reconciliation behavior: Existing carrier-reconciliation.service.ts picks up shipments
                         with recoveryStatus != null. Adds to next reconciliation cycle.
shipment state: shipment.cancelledAt = now(), shipment.cancellationReason = reason,
                shipment.status = 'CANCELLED' (SCS-local), shipment.recoveryStatus set
                if carrier action was needed but failed/unknown.
```

**Key invariant:** SCS order cancellation ALWAYS succeeds regardless of carrier outcome. The carrier is notified best-effort. Reconciliation handles the gap.

---

## 12. CARRIER DELIVERED AFTER SCS CANCELLATION

### Decision: SCS Cancellation Wins, Carrier Delivery Creates Reconciliation

```text
Which event wins? SCS CANCELLED is authoritative. DELIVERED does NOT override CANCELLED.
Can DELIVERED override CANCELLED? NO. Once CANCELLED, the order is terminal.
Does this create an exception? YES — shipment gets exceptionStatus = 'CARRIER_DELIVERED_AFTER_CANCEL'.
Does it create reconciliation_required? YES — shipment.recoveryStatus = 'RECONCILIATION_REQUIRED'.
Does it trigger administrative review? YES — outbox event 'shipment.reconciliation_required' emitted.
Does inventory SALE occur? NO — order was cancelled, stock was released. Physical package
                            requires manual disposition (return to merchant or buyer keeps).
Does it trigger refund workflow? NO — refund handling deferred to M7.3-D.
```

**Implementation approach:** When `processCarrierDelivery()` detects order status = CANCELLED:
1. Do NOT transition order status
2. Record shipment event: `CARRIER_DELIVERED_AFTER_CANCEL`
3. Set `shipment.recoveryStatus = 'RECONCILIATION_REQUIRED'`
4. Emit outbox event: `shipment.reconciliation_required`
5. Return conflict (carrier delivery rejected by SCS)

---

## 13. INVENTORY TRANSACTION BOUNDARY

### Atomicity Requirements

| Operation | Order State | Inventory | Shipment | History | Outbox | Master Recalc | Transaction |
|-----------|-------------|-----------|----------|---------|--------|---------------|-------------|
| CANCEL | Yes | Yes RELEASE | Yes cancel shipment | Yes | Yes order.cancelled | Yes | SINGLE TX |
| ACCEPT | Yes | Yes RESERVE | Yes create shipment | Yes | Yes order.accepted | Yes | SINGLE TX |
| REJECT | Yes | Yes RELEASE | — | Yes | Yes order.rejected | Yes | SINGLE TX |
| PREPARING | Yes | — | — | Yes | Yes order.preparing | — | SINGLE TX |
| READY | Yes | — | — | Yes | Yes order.ready | — | SINGLE TX |
| DELIVER | Yes | Yes SALE | Yes delivered | Yes | Yes order.delivered | Yes | SINGLE TX |
| COMPLETE | Yes | — | Yes completed | Yes | Yes order.completed | Yes | SINGLE TX |
| DELIVERY_EXCEPTION | — | — | Yes exception | Yes | Yes shipment.exception | — | SINGLE TX |

**Critical fix for F-02:** `settleStockForStatus()` MUST execute INSIDE the same transaction as the status update. The current code runs it BEFORE the transaction — this must change.

**Transaction pattern:**
```text
BEGIN TRANSACTION
  1. UPDATE orders SET status = ? WHERE id = ? AND status = ? (optimistic lock)
  2. settleStockForStatus() — inventory movement (inside same tx)
  3. UPDATE shipments SET status/cancelledAt (if applicable, inside same tx)
  4. INSERT orderStatusHistory (inside same tx)
  5. INSERT outbox event (inside same tx — transactional outbox pattern)
COMMIT
  6. recalculateMasterOrderStatus() (after commit — read-only aggregation)
  7. Emit realtime WebSocket (after commit — fire-and-forget)
```

---

## 14. OPTIMISTIC LOCKING POLICY

### Pattern

```sql
UPDATE orders
SET status = :new_status, updated_at = NOW()
WHERE id = :order_id
  AND status = :expected_status;
-- If rows affected = 0 → CONFLICT (409)
```

### Affected Rows = 0 Behavior

```text
Return conflict (HTTP 409 ConflictException)
Do NOT reload state
Do NOT treat as idempotent success
Caller receives: { type: 'CONFLICT', title: 'Order state changed concurrently' }
```

### Concurrency Winner Rules

| Race | Winner | Loser Behavior |
|------|--------|----------------|
| CANCEL vs ACCEPT | Whichever UPDATE executes first wins | Second gets 409 Conflict |
| CANCEL vs REJECT | Whichever UPDATE executes first wins | Second gets 409 Conflict |
| CANCEL vs PREPARING | Whichever UPDATE executes first wins | Second gets 409 Conflict |
| CANCEL vs READY | Whichever UPDATE executes first wins | Second gets 409 Conflict |
| CANCEL vs ASSIGN | Whichever UPDATE executes first wins | Second gets 409 Conflict |
| CANCEL vs PICKUP | Whichever UPDATE executes first wins | Second gets 409 Conflict |
| CANCEL vs OFD | Whichever UPDATE executes first wins | Second gets 409 Conflict |
| CANCEL vs DELIVER | Whichever UPDATE executes first wins | Second gets 409 Conflict |
| CANCEL vs COMPLETE | Whichever UPDATE executes first wins | Second gets 409 Conflict |
| CANCEL vs Carrier DELIVERED | Whichever UPDATE executes first wins | Second rejected |

**Fundamental invariant:** Only one incompatible state transition may succeed. The database is the arbiter. No application-level locking required.

---

## 15. CANCELLATION IDEMPOTENCY

### Sequential Cancellation (CANCEL → CANCEL)

```text
First CANCEL: succeeds, transitions to CANCELLED
Second CANCEL: order already CANCELLED → "Cannot cancel order in CANCELLED status" (409)
```

State-transition idempotency: The FSM itself prevents double-cancellation because CANCELLED is terminal (no outgoing transitions).

### Concurrent Cancellation (100 simultaneous CANCEL requests)

```text
All 100 read order status = READY (or whatever cancellable state)
All 100 pass the cancellable list check
All 100 attempt: UPDATE orders SET status = 'CANCELLED' WHERE id = ? AND status = 'READY'
Exactly 1 succeeds (rows affected = 1)
99 fail (rows affected = 0) → 409 Conflict
```

### Idempotency Layers

| Layer | Mechanism | Guarantee |
|-------|-----------|-----------|
| Request idempotency | Optimistic lock (WHERE status = expected) | Exactly one state transition |
| State-transition idempotency | FSM terminal state check | Cannot cancel already-cancelled |
| Event idempotency | Outbox event dedup (single tx with status) | Exactly one order.cancelled event |
| Inventory idempotency | settleStockForStatus inside tx + netting logic | Exactly one RELEASE |
| Shipment idempotency | Shipment update inside tx | Exactly one shipment cancellation |

---

## 16. MERCHANT CANCELLATION API

### Decision: Dedicated Merchant Cancel Endpoint

```text
Buyer endpoint: POST /v1/orders/:id/cancel (existing, requires 'orders:cancel')
Merchant endpoint: POST /v1/orders/:id/cancel (same endpoint, requires 'merchant:orders:write')
Admin endpoint: POST /v1/orders/:id/cancel (same endpoint, requires 'orders:cancel' or admin bypass)
Driver endpoint: NONE (drivers report exceptions, not cancellations)
Required permissions:
  - Buyer: 'orders:cancel' + ownership check
  - Merchant: 'merchant:orders:write' + store org match
  - Admin: 'orders:cancel' or privileged role bypass
Required reason: Yes — all actors must provide cancellation reason code
Actor type: Derived from caller context (not hardcoded)
Tenant rules: assertOrderAccessible() with correct caller context
```

**Key change:** The existing `POST /v1/orders/:id/cancel` endpoint is extended to accept merchant callers (with `merchant:orders:write` permission). The generic `POST /v1/orders/:id/status` endpoint remains for non-cancellation transitions but should NOT be used for cancellation.

**Why not a separate `/merchant/orders/:id/cancel` endpoint:** The cancel operation is the same regardless of actor. The difference is only in permission check and actor type. A single endpoint with proper authorization is simpler and avoids endpoint proliferation.

---

## 17. AUDIT ACTOR CORRECTNESS

### Canonical Actor Model

```text
actorType: BUYER | MERCHANT | DRIVER | CARRIER | ADMIN | SYSTEM
actorId: UUID of the acting user (or 'system' for SYSTEM)
source: 'api' | 'webhook' | 'worker' | 'scheduler'
reason: Cancellation reason code (see Section 5)
timestamp: ISO 8601 with timezone
```

### Actor Derivation

| Caller Context | actorType | actorId |
|---------------|-----------|---------|
| Buyer user | BUYER | user.id |
| Merchant user | MERCHANT | user.id |
| Admin/moderator user | ADMIN | user.id |
| Carrier webhook | CARRIER | 'carrier:{providerKey}' |
| System worker/scheduler | SYSTEM | 'system:{workerName}' |

### Implementation Requirement

The `cancelOrder()` method currently hardcodes `actorType = 'BUYER'` at line 968. This MUST change to derive the actor type from the `caller` context:
- If `caller.role` includes BUYER → `actorType = 'BUYER'`
- If `caller.role` includes MERCHANT → `actorType = 'MERCHANT'`
- If `caller.role` includes ADMIN/SUPER_ADMIN/MODERATOR → `actorType = 'ADMIN'`

---

## 18. SHIPMENT STATE ON CANCELLATION

### Invariant

```text
When an order is cancelled:
  Shipment status: 'CANCELLED'
  Shipment cancelledAt: NOW()
  Shipment cancellationReason: order cancellation reason
  Shipment events: INSERT 'CANCELLED' event with actorType + reason
  Carrier action: Best-effort cancelPickup() if applicable (see Section 11)
```

### Implementation Location

The shipment cancellation MUST happen inside the same transaction as the order status update (see Section 13). This prevents the orphan scenario where order is CANCELLED but shipment remains PREPARING.

### If Carrier Cancellation Fails

```text
Shipment is still marked CANCELLED in SCS.
shipment.recoveryStatus = 'CARRIER_CANCEL_FAILED' or 'CARRIER_CANCEL_UNKNOWN'.
Reconciliation engine picks up on next cycle.
```

---

## 19. OUTBOX EVENT CONTRACT

### Events for M7.3-B

| Event Name | Producer | Payload | Tenant ID | Aggregate ID | Idempotency Key | Consumer | Retry |
|-----------|----------|---------|-----------|-------------|-----------------|----------|-------|
| `order.cancelled` | orders.service | orderId, status, storeId, buyerId, reason, actorType, actorId | storeId | orderId | tx-scoped | notifications, analytics | Standard outbox retry |
| `shipment.cancelled` | orders.service (new) | shipmentId, orderId, reason, carrierAction | storeId | shipmentId | tx-scoped | carrier worker, analytics | Standard outbox retry |
| `shipment.delivery_exception` | orders.service (new) | shipmentId, orderId, exceptionType, notes, actorType | storeId | shipmentId | tx-scoped | notifications, merchant dashboard | Standard outbox retry |
| `shipment.delivery_retry_requested` | orders.service (new) | shipmentId, orderId, attemptNumber, requestedBy | storeId | shipmentId | tx-scoped | notifications | Standard outbox retry |
| `shipment.rts_requested` | orders.service (new) | shipmentId, orderId, reason, requestedBy | storeId | shipmentId | tx-scoped | notifications, admin dashboard | Standard outbox retry |
| `shipment.reconciliation_required` | orders.service (new) | shipmentId, orderId, reason, carrierStatus | storeId | shipmentId | tx-scoped | reconciliation engine | Standard outbox retry |

### Events NOT Added

- `order.cancellation_requested` — cancellation is synchronous; no async approval flow
- `order.cancellation_rejected` — cancellation either succeeds or conflicts; no rejection flow

### Backward Compatibility

The existing `order.cancelled` event payload is extended (additive fields: reason, actorType, actorId). Existing consumers that only read orderId/status/storeId/buyerId are unaffected.

---

## 20. DELIVERY EXCEPTION STATE MACHINE

### Shipment Exception Lifecycle

```text
(no exception)
      ↓ [exception reported]
   OPEN
      ↓
  ┌───┼───────────────┐
  ↓   ↓               ↓
RETRY  RESOLVED    RTS_PENDING
  ↓                  ↓
OPEN            RTS_COMPLETED
                   ↓
               CLOSED
```

### Exception States

| State | Description | Allowed Transitions |
|-------|-------------|-------------------|
| `OPEN` | Exception reported, awaiting action | RETRY, RESOLVED, RTS_PENDING, CLOSED |
| `RETRY_PENDING` | Retry approved, awaiting re-delivery | OPEN (retry succeeded), OPEN (retry failed → new exception) |
| `RESOLVED` | Exception resolved without RTS | CLOSED (terminal for this exception) |
| `RTS_PENDING` | Return to sender in progress | RTS_COMPLETED |
| `RTS_COMPLETED` | Package returned to sender/merchant | CLOSED |
| `CLOSED` | Exception lifecycle complete | Terminal |

### State Distinction

```text
Shipment status: PREPARING → ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED → COMPLETED
Shipment exception status: (none) → OPEN → RESOLVED/RTS_COMPLETED/CLOSED
Order status: Unchanged during delivery exception (remains OUT_FOR_DELIVERY)
Carrier status: Independent — tracked in carrierStatusRaw/carrierStatusMapped
```

These four state dimensions are NEVER conflated.

---

## 21. ORDER STATUS DURING DELIVERY EXCEPTION

### Decision: Order Status Unchanged

```text
Order remains OUT_FOR_DELIVERY
Shipment has exceptionStatus = OPEN/RETRY_PENDING/etc.
```

### Implications

| Dimension | Impact |
|-----------|--------|
| Master aggregation | No change — sub-order still OUT_FOR_DELIVERY. Master unaffected. |
| Buyer UI | Shows "Delivery issue" banner from shipment exception, not order status change |
| Merchant UI | Shows exception alert on shipment, order status unchanged |
| Driver UI | Shows exception to report, can suggest retry |
| Carrier reconciliation | Carrier status tracked independently; exception is SCS-internal |
| Future returns | Returns triggered after exception resolution (RTS → return, or resolved → normal) |
| Future refunds | Refund eligibility determined after exception is resolved/closed |

---

## 22. BUSINESS RULE: REFUSED DELIVERY

```text
Who decides: DRIVER reports RECIPIENT_REFUSED; MERCHANT/ADMIN decides retry vs RTS
Allowed transitions: OPEN → RETRY_PENDING (retry) or OPEN → RTS_PENDING (RTS)
Maximum attempts: 1 refusal → retry allowed; 2 refusals → RTS recommended; 3 refusals → RTS mandatory
Merchant notification: Immediate via outbox event shipment.delivery_exception
Buyer notification: Via notifications (M7.3-F scope, not M7.3-B)
Carrier action: None in M7.3-B (manual delivery, no carrier RTS API)
Inventory action: DEFERRED to M7.3-C
Financial action: DEFERRED to M7.3-D
```

---

## 23. BUSINESS RULE: DAMAGED DELIVERY

```text
Who can report: DRIVER (at delivery), MERCHANT (upon return/notification), ADMIN
Required evidence: Notes mandatory; photo optional (evidence storage deferred)
Photo required: No (deferred to future milestone)
Shipment state: exceptionStatus = OPEN, exceptionType = DAMAGED
Order state: Unchanged (OUT_FOR_DELIVERY)
Retry allowed: No — damaged packages are not retried
RTS required: Merchant decides — RTS or dispose
Inventory effect: DEFERRED to M7.3-C
Future dispute/refund relationship: DAMAGED exception is evidence for future dispute (M7.3-E)
```

---

## 24. BUSINESS RULE: LOST SHIPMENT

```text
Who can report: CARRIER (via webhook), ADMIN (manual), SYSTEM (stale tracking detection)
Carrier confirmation: If carrier reports LOST → auto-create exception
System confirmation: If no tracking update for 72 hours → flag for admin review (not auto-LOST)
Order state: Unchanged (OUT_FOR_DELIVERY)
Shipment state: exceptionStatus = OPEN, exceptionType = LOST
Inventory effect: DEFERRED to M7.3-C (stock was released at cancel or still reserved)
Financial effect: DEFERRED to M7.3-D
Resolution owner: ADMIN investigates; MERCHANT decides disposition
```

---

## 25. BUSINESS RULE: MAX DELIVERY ATTEMPTS

```text
maxDeliveryAttempts default: 3
minimum: 1
maximum: 10
who can change: ADMIN (runtime config), SYSTEM (env var DELIVERY_MAX_ATTEMPTS)
when counter increments: Each time driver attempts physical delivery (OUT_FOR_DELIVERY → delivery attempt)
what counts as an attempt: Driver arrives at address and attempts handoff (regardless of outcome)
what does not count: Passing by, navigation to address, pre-delivery checks
action when threshold reached: Auto-transition exception to RTS_PENDING; emit shipment.rts_requested
```

---

## 26. SECURITY DECISIONS

### Authorization Matrix

| Action | Actor | Permission | Tenant Boundary | Ownership Rule | State Requirement |
|--------|-------|-----------|-----------------|----------------|-------------------|
| Cancel order (buyer) | BUYER | `orders:cancel` | Buyer owns order | `buyerId = caller.userId` | Cancellable state |
| Cancel order (merchant) | MERCHANT | `merchant:orders:write` | Store org match | `storeId.orgId = caller.orgId` | Cancellable state |
| Cancel order (admin) | ADMIN | `orders:cancel` or bypass | Platform-wide | No ownership check | Any non-terminal (admin override for ASSIGNED+) |
| Report delivery exception | DRIVER | `shipments:write` | Driver assigned to shipment | `assignedDriverId = caller.userId` | OUT_FOR_DELIVERY |
| Report exception (merchant) | MERCHANT | `merchant:orders:write` | Store org match | Shipment.storeId match | Shipment exists, not terminal |
| Resolve exception | MERCHANT | `merchant:orders:write` | Store org match | Shipment.storeId match | Exception OPEN |
| Resolve exception (admin) | ADMIN | `shipments:write` or bypass | Platform-wide | No ownership check | Exception OPEN |
| Retry delivery | MERCHANT | `merchant:orders:write` | Store org match | Shipment.storeId match | Exception OPEN, attempts < max |
| Request RTS | MERCHANT | `merchant:orders:write` | Store org match | Shipment.storeId match | Exception OPEN |
| Approve RTS | ADMIN | `shipments:write` or bypass | Platform-wide | No ownership check | RTS_PENDING |
| Admin recovery | ADMIN | `admin:shipments:recover` | Platform-wide | No ownership check | Any recovery state |

### Protection Rules

| Threat | Protection |
|--------|-----------|
| Buyer cancelling another buyer's order | `assertOrderAccessible()` checks `buyerId = caller.userId` |
| Merchant cancelling another merchant's order | `assertOrderAccessible()` checks `storeId.orgId = caller.orgId` |
| Merchant crossing org boundaries | Org check in tenant-scope.ts; no cross-org access |
| Driver manipulating unrelated shipments | `assignedDriverId` check on exception reporting |
| Carrier webhook affecting another tenant | Webhook validates shipment exists + provider key match |
| Admin bypass accidentally exposed | BYPASS_ROLES limited to SUPER_ADMIN, ADMIN, MODERATOR; logged |
| IDOR | All endpoints use UUID PKs + ownership/org checks |
| Horizontal privilege escalation | Tenant isolation in `assertOrderAccessible()` + `assertMasterOrderAccessible()` |

---

## 27. M7.3-B SCOPE LOCK

### IN SCOPE

- Cancellation concurrency hardening (F-01 fix)
- Atomic cancellation/inventory behavior (F-02 fix)
- Merchant cancellation command (dedicated endpoint)
- Correct actor/audit handling (F-05 partial)
- Shipment cancellation synchronization (F-07 fix)
- Carrier cancellation/best-effort handling (F-03 fix)
- Delivery exception model (F-04 fix)
- Delivery exception lifecycle
- Delivery retry rules
- RTS operational state (record only, no inventory)
- Carrier/SCS reconciliation (flag + outbox event)
- Cancellation observability (structured logging)
- Concurrency tests
- Failure-injection tests
- Tenant/security tests

### OUT OF SCOPE

- Payments
- Refunds
- Financial settlement
- Full returns management
- Return-to-stock workflow
- Customer refund automation
- Dispute redesign
- Notification expansion beyond required events
- Advanced carrier integrations (beyond best-effort cancel)
- GPS/maps
- Photo evidence storage

### Explicitly Preserved

```text
M7.3-C = Returns (inventory return-to-stock, RTS physical handling)
M7.3-D = Refunds (financial refund automation)
M7.3-E = Disputes (buyer dispute flow)
M7.3-F = Notifications (buyer/merchant notification expansion)
```

---

## 28. ARCHITECTURE DECISION RECORDS

### ADR-B0-001: Cancellation Cutoff

```text
Title: Cancellation allowed until READY (inclusive)
Status: LOCKED
Context: The platform needs a clear boundary for when orders can be cancelled.
         Policy A (until READY) was selected over B (until ASSIGNED), C (until PICKED_UP),
         and D (until OUT_FOR_DELIVERY).
Decision: Buyer/merchant cancellation cutoff is READY (inclusive). Admin may cancel
          from any non-terminal state with override for ASSIGNED+.
Alternatives considered:
  - Policy B: Rejected because driver recall adds operational complexity
  - Policy C: Rejected because physical package recovery is not a logical operation
  - Policy D: Rejected because cancelling an in-transit package is incoherent
Consequences: Clean boundary at driver assignment. No driver recall needed.
              Admin override available for exceptional circumstances.
Implementation impact: Cancellable list unchanged from current code.
                       Admin cancel path needs state-range extension.
Future migration impact: None — this is the most conservative policy.
```

### ADR-B0-002: Cancellation Concurrency Model

```text
Title: Optimistic locking for all order state transitions
Status: LOCKED
Context: F-01 identified that cancelOrder()/transitionStatus() lacks optimistic locking
         while all other methods (accept, fulfill, deliver, complete) have it.
Decision: All state transitions use UPDATE ... WHERE id = ? AND status = ? (optimistic lock).
          Affected rows = 0 → 409 Conflict. No pessimistic locking. No retry loops.
Alternatives considered:
  - SELECT FOR UPDATE: Rejected (deadlocks with nested collaborator transactions)
  - Advisory locks: Rejected (heavier, unnecessary when condition is a row predicate)
  - Application-level mutex: Rejected (doesn't work across instances)
Consequences: Simple, deadlock-free, works across instances. Caller must handle 409.
Implementation impact: transitionStatus() WHERE clause changes from eq(orders.id, orderId)
                       to eq(orders.id, orderId) AND eq(orders.status, expectedStatus).
                       cancelOrder() must read current status and pass it to transitionStatus().
Future migration impact: None — additive WHERE clause change.
```

### ADR-B0-003: Atomic Inventory/Status Transaction

```text
Title: Inventory settlement inside the order-status transaction
Status: LOCKED
Context: F-02 identified settleStockForStatus() executes outside the status-write transaction.
         A crash between stock release and status update creates permanent inconsistency.
Decision: settleStockForStatus() moves INSIDE the transaction in transitionStatus().
          Order: (1) optimistic lock UPDATE, (2) inventory settlement, (3) shipment update,
          (4) history insert, (5) outbox insert — all in one transaction.
Alternatives considered:
  - Two-phase commit: Rejected (overkill for single-database operation)
  - Saga pattern: Rejected (adds complexity without benefit for single-DB)
  - Compensating transaction: Rejected (doesn't prevent the initial inconsistency)
Consequences: Crash-safe. Either everything commits or nothing does.
Implementation impact: Move settleStockForStatus() call inside the tx block.
                       Ensure settleStockForStatus() accepts the tx client.
Future migration impact: None — internal refactor, no schema change.
```

### ADR-B0-004: Merchant Cancellation API

```text
Title: Single cancel endpoint with actor-aware authorization
Status: LOCKED
Context: Merchants currently use the generic POST /orders/:id/status endpoint for cancellation.
         This bypasses cancellation-specific validation and audit.
Decision: Extend POST /v1/orders/:id/cancel to accept merchant caller with
          'merchant:orders:write' permission. Same endpoint, different authorization path.
          Generic status endpoint remains for non-cancel transitions only.
Alternatives considered:
  - Separate /merchant/orders/:id/cancel: Rejected (endpoint proliferation, same logic)
  - Keep generic endpoint: Rejected (loses cancellation-specific audit/reason validation)
Consequences: Single cancel endpoint for all actors. Authorization determines access.
Implementation impact: Controller method updated to check caller type and derive actorType.
                       Generic status endpoint rejects CANCELLED target status.
Future migration impact: None.
```

### ADR-B0-005: Shipment Cancellation Synchronization

```text
Title: Shipment cancelled atomically with order cancellation
Status: LOCKED
Context: F-07 identified that order cancellation leaves shipment in non-terminal state.
         Orphaned shipments cause confusion and reconciliation issues.
Decision: When order is cancelled, shipment is cancelled in the SAME transaction.
          shipment.status = 'CANCELLED', shipment.cancelledAt = NOW(),
          shipment.cancellationReason = reason. Shipment event recorded.
Alternatives considered:
  - Async shipment cancellation: Rejected (creates eventual consistency gap)
  - Separate API call: Rejected (not atomic, caller must handle partial failure)
Consequences: No orphaned shipments. Clean state invariant.
Implementation impact: Add shipment UPDATE inside transitionStatus() tx when target = CANCELLED.
Future migration impact: None.
```

### ADR-B0-006: Carrier Cancellation Fallback

```text
Title: Best-effort carrier cancellation with reconciliation flag
Status: LOCKED
Context: F-03 identified no carrier cancellation support. Aramex has no CancelShipment API.
         CancelPickup exists but is not wired to order cancellation.
Decision: On order cancellation: (1) Check provider.canCancel → attempt cancelShipment().
          (2) If canCancel=false, attempt cancelPickup() if pickup was scheduled.
          (3) If neither available or fails, set shipment.recoveryStatus flag.
          (4) SCS order cancellation ALWAYS succeeds regardless of carrier outcome.
Alternatives considered:
  - Block cancellation until carrier confirms: Rejected (SCS is authoritative, not carrier)
  - Fire-and-forget carrier notification: Rejected (no reconciliation tracking)
  - Manual carrier cancellation: Rejected (defeats automation)
Consequences: SCS always consistent. Carrier gap tracked via reconciliation engine.
Implementation impact: Add carrier cancel attempt in cancelOrder() after SCS tx commits.
                       Use existing recoveryStatus column on shipments.
Future migration impact: When Aramex adds CancelShipment, update provider.canCancel = true.
```

### ADR-B0-007: Delivery Exception Ownership

```text
Title: Driver reports, merchant/admin resolves
Status: LOCKED
Context: F-04 identified zero delivery exception handling. Need to define who can do what.
Decision: Drivers report exceptions (RECIPIENT_UNAVAILABLE, REFUSED, WRONG_ADDRESS,
          DRIVER_EXCEPTION). Merchants resolve exceptions on their orders.
          Admin resolves any exception. Carrier exceptions ingested via webhook.
          Buyers do NOT report exceptions (they use disputes — M7.3-E).
Alternatives considered:
  - Anyone can report: Rejected (loses accountability)
  - Only admin: Rejected (driver is the one at the door)
Consequences: Clear ownership chain. Driver → Merchant → Admin escalation.
Implementation impact: New service methods with actor-aware authorization.
Future migration impact: Buyer reporting added in M7.3-E (disputes).
```

### ADR-B0-008: Delivery Exception State Model

```text
Title: Shipment-level exception states, not order FSM expansion
Status: LOCKED
Context: Need to model delivery exceptions without exploding the order FSM.
Decision: Exception states live on shipments (exceptionStatus column).
          Order FSM unchanged. States: OPEN → RETRY_PENDING/RESOLVED/RTS_PENDING → CLOSED.
          Order status remains OUT_FOR_DELIVERY during exception.
Alternatives considered:
  - Expand order FSM with FAILED_DELIVERY, DAMAGED, LOST: Rejected (conflates physical/logical)
  - Separate exception table: Rejected (adds join overhead; shipment row is the natural home)
Consequences: Clean separation. Order FSM stays simple. Exception is shipment concern.
Implementation impact: Add exceptionStatus, exceptionType, exceptionAt, exceptionNotes,
                       deliveryAttempts, maxDeliveryAttempts columns to shipments table.
Future migration impact: None — additive columns on shipments.
```

### ADR-B0-009: RTS Boundary

```text
Title: M7.3-B records RTS state; inventory/financial handling deferred
Status: LOCKED
Context: RTS is related to delivery exceptions but full return workflow is complex.
Decision: M7.3-B records RTS operational state (RTS_PENDING → RTS_COMPLETED) on shipments.
          No inventory return-to-stock. No financial refund. These are M7.3-C and M7.3-D.
Alternatives considered:
  - Full RTS with inventory return: Rejected (scope creep into M7.3-C)
  - No RTS at all: Rejected (operational visibility needed)
Consequences: RTS visible and trackable. Physical/financial handling deferred.
Implementation impact: exceptionStatus values include RTS_PENDING, RTS_COMPLETED.
                       Outbox event shipment.rts_requested emitted.
Future migration impact: M7.3-C adds return-to-stock action on RTS_COMPLETED.
```

### ADR-B0-010: Master Cancellation Behavior

```text
Title: Master cancellation = orchestrated sub-order cancellation
Status: LOCKED
Context: No master-level cancellation API exists. Need to define behavior.
Decision: Model C — master cancellation iterates cancellable sub-orders and cancels each.
          Non-cancellable sub-orders are skipped (returned in response).
          Master status derived from sub-order aggregation (no independent master state).
Alternatives considered:
  - Model A (no master cancel): Rejected (inconvenient for buyers with multi-merchant orders)
  - Model B (all-or-nothing): Rejected (blocks cancellation if one sub-order is non-cancellable)
  - Model D (admin orchestration): Rejected (overly restrictive for buyer-initiated cancel)
Consequences: Buyer can cancel entire order; non-cancellable sub-orders continue independently.
Implementation impact: New cancelMasterOrder() method that iterates sub-orders.
Future migration impact: None.
```

### ADR-B0-011: Carrier DELIVERED-after-Cancel Reconciliation

```text
Title: SCS cancellation wins; carrier delivery creates reconciliation
Status: LOCKED
Context: Race condition: SCS cancels order, carrier delivers anyway.
Decision: SCS CANCELLED is authoritative. Carrier DELIVERED after cancel does NOT override.
          Creates shipment exception + reconciliation_required flag + outbox event.
          No inventory SALE. No automatic refund.
Alternatives considered:
  - Carrier delivery wins: Rejected (buyer was told order was cancelled)
  - Last-write-wins: Rejected (non-deterministic, creates confusion)
Consequences: Deterministic outcome. Admin reviews reconciliation cases manually.
Implementation impact: processCarrierDelivery() checks order status before transitioning.
                       If CANCELLED → exception + reconciliation flag instead.
Future migration impact: M7.3-D may add automatic refund for carrier-delivered-after-cancel.
```

### ADR-B0-012: Cancellation Event Contract

```text
Title: Extend order.cancelled; add shipment.cancelled
Status: LOCKED
Context: Current cancellation emits order.cancelled. Need shipment-level events too.
Decision: order.cancelled payload extended with reason, actorType, actorId (additive).
          New event shipment.cancelled emitted when shipment is cancelled with order.
          No cancellation_requested or cancellation_rejected events (synchronous flow).
Alternatives considered:
  - Async cancellation with request/reject: Rejected (unnecessary complexity)
  - No shipment event: Rejected (carrier worker needs shipment.cancelled to act)
Consequences: Backward compatible. New consumers can subscribe to shipment events.
Implementation impact: Add shipment.cancelled publish inside transitionStatus() tx.
Future migration impact: None.
```

---

## 29. FINAL STATE MACHINES

### Order/SubOrder FSM (Unchanged from Baseline)

| State | Allowed Transitions | Allowed Actors | Cancellable? | Inventory Effect | Shipment Effect |
|-------|-------------------|----------------|-------------|-----------------|-----------------|
| DRAFT | → SUBMITTED | BUYER | No | — | — |
| SUBMITTED | → PENDING_CONFIRMATION | SYSTEM (auto) | No (AMENDED B.2) | — | — |
| PENDING_CONFIRMATION | → ACCEPTED, PARTIALLY_ACCEPTED, REJECTED, CANCELLED | MERCHANT, ADMIN | Yes | — | — |
| ACCEPTED | → PREPARING, CANCELLED | MERCHANT, ADMIN | Yes | RESERVE | Create shipment |
| PARTIALLY_ACCEPTED | → PREPARING, CANCELLED | MERCHANT, ADMIN | Yes | RESERVE (partial) | Create shipment |
| PREPARING | → READY, CANCELLED | MERCHANT, ADMIN | Yes | — | — |
| READY | → ASSIGNED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED | MERCHANT, ADMIN | Yes | — | — |
| ASSIGNED | → PICKED_UP | DRIVER | Admin only | — | Assign driver |
| PICKED_UP | → OUT_FOR_DELIVERY | DRIVER | Admin only | — | Record pickup |
| OUT_FOR_DELIVERY | → DELIVERED | DRIVER | Admin only | — | Record OFD |
| DELIVERED | → COMPLETED, DISPUTED | BUYER, ADMIN | No | SALE | Record delivery |
| COMPLETED | → DISPUTED | BUYER, ADMIN | No | — | Record completion |
| PAYMENT_PENDING | → PREPARING, CANCELLED | SYSTEM | Yes | — | — |
| CANCELLED | (terminal) | — | — | RELEASE | Cancel shipment |
| REJECTED | (terminal) | — | — | RELEASE | — |
| DISPUTED | (terminal) | — | — | — | — |

### Shipment FSM

| State | Allowed Transitions | Exception Relationship | Carrier Relationship |
|-------|-------------------|----------------------|---------------------|
| PREPARING | → ASSIGNED, CANCELLED | Exception can be reported | Carrier shipment may be created |
| ASSIGNED | → PICKED_UP, CANCELLED | Exception can be reported | Driver assigned |
| PICKED_UP | → OUT_FOR_DELIVERY, CANCELLED | Exception can be reported | Package with driver |
| OUT_FOR_DELIVERY | → DELIVERED, CANCELLED (admin) | Exception lifecycle active | En route to recipient |
| DELIVERED | → COMPLETED | Exception resolved | Carrier confirmed |
| COMPLETED | (terminal) | N/A | Final |
| CANCELLED | (terminal) | N/A | Carrier notified (best-effort) |

### Delivery Exception FSM (Shipment-Level)

| State | Allowed Transitions | Actor | Required Action |
|-------|-------------------|-------|----------------|
| (none) | → OPEN | DRIVER, MERCHANT, ADMIN, CARRIER, SYSTEM | Report exception |
| OPEN | → RETRY_PENDING, RESOLVED, RTS_PENDING, CLOSED | MERCHANT, ADMIN | Decide action |
| RETRY_PENDING | → OPEN (retry done) | DRIVER | Attempt re-delivery |
| RESOLVED | → CLOSED | MERCHANT, ADMIN | Close exception |
| RTS_PENDING | → RTS_COMPLETED | ADMIN | Approve/execute RTS |
| RTS_COMPLETED | → CLOSED | SYSTEM | Record completion |
| CLOSED | (terminal) | — | No further action |

### Master Order Aggregation

| Sub-Order Combination | Computed Master Status |
|----------------------|----------------------|
| All SUBMITTED | SUBMITTED |
| All PENDING_CONFIRMATION | PENDING_CONFIRMATION |
| Mix of ACCEPTED/PREPARING/READY | PROCESSING (nearest active) |
| All DELIVERED | DELIVERED |
| All COMPLETED | COMPLETED |
| Some COMPLETED, some active | PROCESSING |
| Some CANCELLED, some active | Reflects active sub-orders |
| All CANCELLED | CANCELLED |
| Some CANCELLED, some COMPLETED | COMPLETED |
| Any DISPUTED | DISPUTED (if all non-active are DISPUTED) |

---

## 30. CONCURRENCY CONTRACT

| Race | Expected Result | Winner Rule | Inventory Effect | Event Effect |
|------|----------------|-------------|-----------------|-------------|
| CANCEL vs ACCEPT | One succeeds, one gets 409 | First UPDATE wins | Winner's inventory action; loser has none | Winner's event only |
| CANCEL vs REJECT | One succeeds, one gets 409 | First UPDATE wins | Winner's inventory action; loser has none | Winner's event only |
| CANCEL vs PREPARING | One succeeds, one gets 409 | First UPDATE wins | RELEASE if cancel wins; none if preparing wins | Winner's event only |
| CANCEL vs READY | One succeeds, one gets 409 | First UPDATE wins | RELEASE if cancel wins; none if ready wins | Winner's event only |
| CANCEL vs ASSIGN | One succeeds, one gets 409 | First UPDATE wins | RELEASE if cancel wins; none if assign wins | Winner's event only |
| CANCEL vs PICKUP | One succeeds, one gets 409 | First UPDATE wins | RELEASE if cancel wins; none if pickup wins | Winner's event only |
| CANCEL vs OFD | One succeeds, one gets 409 | First UPDATE wins | RELEASE if cancel wins; none if OFD wins | Winner's event only |
| CANCEL vs DELIVER | One succeeds, one gets 409 | First UPDATE wins | RELEASE if cancel wins; SALE if deliver wins | Winner's event only |
| CANCEL vs COMPLETE | One succeeds, one gets 409 | First UPDATE wins | RELEASE if cancel wins; none if complete wins | Winner's event only |
| CANCEL vs Carrier DELIVERED | One succeeds, one gets 409 | First UPDATE wins | RELEASE if cancel wins; SALE if deliver wins | Winner's event; loser creates reconciliation |
| CANCEL vs Inventory settlement | Atomic — same tx | N/A | Both or neither | Both or neither |
| Double CANCEL | First succeeds, second gets 409 | First UPDATE wins | One RELEASE only | One order.cancelled only |
| Exception vs Delivery | Exception recorded; delivery proceeds or conflicts | Delivery first → no exception; Exception first → delivery still proceeds with exception flag | N/A | Exception event + delivery event |
| Exception vs Retry | Retry creates new attempt under same exception | Sequential — retry resolves current exception, new failure creates new exception | N/A | Retry event |
| RTS vs Retry | Mutually exclusive — RTS cancels pending retry | RTS first → retry rejected; Retry first → RTS cancelled | N/A | RTS event or retry event |

---

## 31. FAILURE-INJECTION CONTRACT

### Cancellation Failures

| Scenario | Invariant |
|----------|-----------|
| Crash before transaction | No state change. Order unchanged. Stock unchanged. |
| Crash during transaction | PostgreSQL rolls back. No partial state. |
| Crash after status update (inside tx) | Impossible — tx not committed yet. Rollback. |
| Crash after inventory movement (inside tx) | Impossible — tx not committed yet. Rollback. |
| Crash before outbox (inside tx) | Impossible — outbox insert is inside tx. Rollback. |
| Crash after outbox, before realtime emit | DB committed. Outbox event persisted. Realtime missed — acceptable (realtime is best-effort). |

### Carrier Failures

| Scenario | Invariant |
|----------|-----------|
| Carrier timeout | SCS order cancelled. shipment.recoveryStatus = 'CARRIER_CANCEL_TIMEOUT'. |
| Carrier HTTP failure | SCS order cancelled. shipment.recoveryStatus = 'CARRIER_CANCEL_FAILED'. |
| Carrier success response lost | SCS order cancelled. shipment.recoveryStatus = 'CARRIER_CANCEL_UNKNOWN'. Reconciliation verifies. |
| Carrier reports DELIVERED after cancellation | Order stays CANCELLED. Shipment exception created. Reconciliation flagged. |
| Carrier cancellation unsupported | SCS order cancelled. shipment.recoveryStatus = 'CARRIER_CANCEL_NOT_SUPPORTED' if shipment existed. |
| Carrier cancellation unknown result | Treated as timeout — reconciliation picks up. |

### Worker Failures

| Scenario | Invariant |
|----------|-----------|
| Worker crash | Outbox ensures event is retried. No lost events. |
| Duplicate worker | Lease-based dedup (FOR UPDATE SKIP LOCKED). One worker processes. |
| Stale lease | Lease expiry + re-claim. Idempotent processing. |
| Retry | Exponential backoff with jitter. Max retries from retry policy. |
| Reconciliation | Existing M7.2.3-C reconciliation engine handles carrier gaps. |

---

## 32. OBSERVABILITY CONTRACT

### Required Log Fields

| Operation | Required Fields |
|-----------|----------------|
| Order cancellation | tenantId, orderId, actorType, actorId, reason, previousStatus, newStatus, correlationId, timestamp |
| Merchant cancellation | tenantId, orderId, storeId, actorType, actorId, reason, previousStatus, newStatus, correlationId, timestamp |
| Carrier cancellation attempt | tenantId, shipmentId, carrier, providerReference, action, correlationId, timestamp |
| Carrier cancellation failure | tenantId, shipmentId, carrier, providerReference, errorClass, errorMessage, correlationId, timestamp |
| Delivery exception | tenantId, orderId, subOrderId, shipmentId, exceptionType, actorType, actorId, notes, correlationId, timestamp |
| Delivery retry | tenantId, shipmentId, attemptNumber, requestedBy, approvedBy, correlationId, timestamp |
| RTS | tenantId, shipmentId, reason, requestedBy, approvedBy, correlationId, timestamp |
| Reconciliation | tenantId, shipmentId, recoveryStatus, carrierStatus, correlationId, timestamp |
| Concurrency conflict | tenantId, orderId, expectedStatus, actualStatus, actorType, correlationId, timestamp |
| Inventory settlement conflict | tenantId, orderId, itemId, expectedQty, actualQty, correlationId, timestamp |

### Log Levels

- **INFO**: Successful transitions, carrier attempts
- **WARN**: Concurrency conflicts (409), carrier failures, retry attempts
- **ERROR**: Carrier timeout, unknown results, inventory inconsistencies
- **DEBUG**: Detailed state for troubleshooting

---

## 33. DATABASE CHANGE PLAN

### Proposed Migration: 0048_delivery_exceptions

| Table | Column | Type | Nullable | Default | Purpose | Backward Compatible |
|-------|--------|------|----------|---------|---------|-------------------|
| shipments | exception_status | VARCHAR(24) | Yes | NULL | Current exception lifecycle state | Yes — additive |
| shipments | exception_type | VARCHAR(30) | Yes | NULL | Type of current/most-recent exception | Yes — additive |
| shipments | exception_notes | TEXT | Yes | NULL | Free-text exception details | Yes — additive |
| shipments | exception_at | TIMESTAMPTZ | Yes | NULL | When exception was opened | Yes — additive |
| shipments | exception_resolved_at | TIMESTAMPTZ | Yes | NULL | When exception was resolved/closed | Yes — additive |
| shipments | delivery_attempts | INTEGER | No | 0 | Number of delivery attempts made | Yes — additive |
| shipments | max_delivery_attempts | INTEGER | No | 3 | Maximum allowed delivery attempts | Yes — additive |
| orders | cancellation_reason | VARCHAR(40) | Yes | NULL | Cancellation reason code | Yes — additive |
| orders | cancellation_actor_type | VARCHAR(16) | Yes | NULL | Who cancelled (BUYER/MERCHANT/ADMIN/SYSTEM) | Yes — additive |
| orders | cancellation_actor_id | UUID | Yes | NULL | ID of who cancelled | Yes — additive |

**Indexes:**
- `CREATE INDEX idx_shipments_exception_status ON shipments(exception_status) WHERE exception_status IS NOT NULL;`
- `CREATE INDEX idx_orders_cancellation_reason ON orders(cancellation_reason) WHERE cancellation_reason IS NOT NULL;`

**NOT added (and why):**
- `orders.cancelled_by` — replaced by `cancellation_actor_id` (more explicit naming)
- `orders.cancellation_source` — merged into `cancellation_actor_type` (simpler model)

**Migration safety:**
- All columns are additive (nullable or have defaults)
- No column drops or renames
- No data migration required
- Safe for zero-downtime deployment
- Idempotent (IF NOT EXISTS on all operations)

---

## 34. API CONTRACT PLAN

### POST /v1/orders/:id/cancel (Extended)

```text
Method: POST
Path: /v1/orders/:id/cancel
Actor: BUYER, MERCHANT, ADMIN
Permission: 'orders:cancel' (buyer/admin) or 'merchant:orders:write' (merchant)
Request: { "reason": "CUSTOMER_REQUEST", "notes": "optional free text" }
Response: { "orderId", "status": "CANCELLED", "reason", "actorType", "actorId",
            "shipmentCancelled": true/false, "carrierNotified": true/false/undefined }
Errors: 404 (not found), 409 (cannot cancel / concurrent modification), 400 (invalid reason)
State requirements: Cancellable state (or admin override for ASSIGNED+)
Idempotency: Sequential idempotent (already-cancelled returns 409, not 200)
Tenant isolation: assertOrderAccessible() with caller context
```

### POST /v1/orders/:id/status (Restricted)

```text
Method: POST
Path: /v1/orders/:id/status
Actor: MERCHANT
Permission: 'merchant:orders:write'
Request: { "status": "PREPARING" | "READY" | etc. }
Response: Updated order
Errors: 400 if status = CANCELLED (must use /cancel endpoint)
State requirements: Valid FSM transition
Tenant isolation: assertOrderAccessible() with caller context
```

**Change:** This endpoint now REJECTS `status: "CANCELLED"` with a 400 error directing callers to use `/cancel`.

### POST /v1/shipments/:id/exception (New)

```text
Method: POST
Path: /v1/shipments/:id/exception
Actor: DRIVER, MERCHANT, ADMIN
Permission: 'shipments:write' (driver/admin) or 'merchant:orders:write' (merchant)
Request: { "type": "RECIPIENT_UNAVAILABLE", "notes": "...", "evidence": "optional" }
Response: { "shipmentId", "exceptionStatus": "OPEN", "exceptionType", "createdAt" }
Errors: 404, 409 (already has open exception), 400 (invalid type)
State requirements: Shipment in OUT_FOR_DELIVERY (or PICKED_UP for driver)
Idempotency: If same exception type already OPEN → return existing (idempotent)
Tenant isolation: Shipment store org match for merchant; assigned driver check for driver
```

### POST /v1/shipments/:id/retry (New)

```text
Method: POST
Path: /v1/shipments/:id/retry
Actor: MERCHANT, ADMIN
Permission: 'merchant:orders:write' or 'shipments:write'
Request: { "notes": "optional" }
Response: { "shipmentId", "exceptionStatus": "RETRY_PENDING", "attemptNumber" }
Errors: 404, 409 (no open exception / max attempts reached), 403
State requirements: Shipment has OPEN exception, deliveryAttempts < maxDeliveryAttempts
Idempotency: Sequential — second retry request while RETRY_PENDING returns 409
Tenant isolation: Shipment store org match
```

### POST /v1/shipments/:id/rts (New)

```text
Method: POST
Path: /v1/shipments/:id/rts
Actor: MERCHANT (request), ADMIN (approve/execute)
Permission: 'merchant:orders:write' (request) or 'shipments:write' (approve)
Request: { "reason": "RECIPIENT_REFUSED", "notes": "optional" }
Response: { "shipmentId", "exceptionStatus": "RTS_PENDING" }
Errors: 404, 409 (no open exception / already RTS), 403
State requirements: Shipment has OPEN exception (for request) or RTS_PENDING (for approve)
Idempotency: If already RTS_PENDING → return existing (idempotent)
Tenant isolation: Shipment store org match for merchant; admin bypass
```

---

## 35. TEST CONTRACT

### Unit Tests

- FSM transition matrix validity (all states, all transitions)
- Cancellation cutoff enforcement (cancellable vs non-cancellable)
- Cancellation reason validation (valid codes, invalid codes)
- Exception type validation (valid types, invalid types)
- Delivery attempt counting
- Max attempts threshold detection
- Master aggregation with cancelled sub-orders
- Optimistic lock conflict detection (rows = 0 → 409)
- Actor type derivation from caller context

### PostgreSQL Integration Tests

- Optimistic locking: concurrent cancel+accept → exactly one succeeds
- Atomic cancellation: order CANCELLED + stock RELEASED + shipment CANCELLED in one tx
- Inventory consistency: stock before/after cancel matches expected
- Shipment synchronization: order cancel → shipment cancel in same tx
- Outbox: order.cancelled + shipment.cancelled events emitted atomically
- Master recalculation: cancel sub-order → master status updated
- Exception lifecycle: OPEN → RETRY → OPEN → RESOLVED → CLOSED
- RTS lifecycle: OPEN → RTS_PENDING → RTS_COMPLETED → CLOSED

### Concurrency Tests

| Test | Workers | Expected |
|------|---------|----------|
| 100 concurrent CANCEL | 100 | Exactly 1 succeeds, 99 get 409 |
| 100 CANCEL vs ACCEPT | 100 | Exactly 1 succeeds (either cancel or accept) |
| 100 CANCEL vs PREPARING | 100 | Exactly 1 succeeds |
| 100 CANCEL vs READY | 100 | Exactly 1 succeeds |
| 100 CANCEL vs DELIVER | 100 | Exactly 1 succeeds |
| 100 cancellation + inventory race | 100 | Stock released exactly once |
| 100 carrier delivery + cancellation race | 100 | One wins; if cancel wins → reconciliation flag |

### Security Tests

- Cross-user: buyer A cannot cancel buyer B's order
- Cross-merchant: merchant A cannot cancel merchant B's order
- Cross-tenant: tenant isolation enforced
- Driver IDOR: driver A cannot report exception on driver B's shipment
- Merchant IDOR: merchant A cannot manage exception on merchant B's shipment
- Admin boundaries: admin bypass works but is logged
- Permission escalation: merchant:orders:write cannot access admin-only operations

### Failure Injection Tests

- Crash simulation via test hooks (before tx, during tx, after tx)
- Carrier timeout simulation
- Carrier HTTP error simulation
- Carrier success-lost simulation
- Worker crash simulation

### Regression

- All existing M7.3-A tests pass
- All M7.2.x milestone tests pass
- Full suite: 0 failures, 0 skipped (or documented skips)

---

## 36. IMPLEMENTATION SEQUENCE

### M7.3-B.1 — Cancellation Concurrency Hardening

```text
Goal: Fix F-01 (optimistic locking) and F-02 (atomic inventory)
Files: orders.service.ts, orders.service.spec.ts
Database: No schema change
API: No API change (internal fix)
Security: No change
Tests: Optimistic lock unit tests, concurrent cancel integration tests
Concurrency tests: 100 CANCEL vs ACCEPT, 100 double CANCEL
Failure-injection tests: Crash during tx, crash after tx
Exit criteria: F-01 fixed, F-02 fixed, all concurrency tests pass
Dependencies: None
```

### M7.3-B.2 — Merchant Cancellation + Shipment Synchronization

```text
Goal: Fix merchant cancel endpoint, add shipment cancellation, fix actor type
Files: orders.controller.ts, orders.service.ts, tenant-scope.ts
Database: Migration 0048 (orders cancellation columns)
API: Extend POST /cancel for merchants, restrict POST /status from CANCELLED
Security: Actor type derivation, permission checks
Tests: Merchant cancel tests, shipment sync tests, actor audit tests
Concurrency tests: Merchant cancel vs buyer cancel
Exit criteria: Merchant uses /cancel, shipment cancelled atomically, actor recorded
Dependencies: M7.3-B.1
```

### M7.3-B.3 — Carrier Cancellation / Best-Effort Handling

```text
Goal: Fix F-03 (carrier cancellation gap)
Files: orders.service.ts, shipping-carrier.worker.ts, aramex.provider.ts
Database: Use existing recoveryStatus column
API: No new API (internal logic)
Security: No change
Tests: Carrier cancel tests (supported, unsupported, timeout, failure)
Concurrency tests: Carrier delivery vs cancel race
Exit criteria: Carrier notified on cancel (best-effort), reconciliation flag set
Dependencies: M7.3-B.2
```

### M7.3-B.4 — Delivery Exceptions + Retry

```text
Goal: Fix F-04 (delivery exception model)
Files: orders.service.ts, orders.controller.ts, shipment.schema.ts
Database: Migration 0048 (shipment exception columns)
API: POST /shipments/:id/exception, POST /shipments/:id/retry
Security: Driver/merchant/admin authorization
Tests: Exception lifecycle tests, retry tests, attempt counting
Concurrency tests: Exception vs delivery race
Exit criteria: Exception model working, retry working, max attempts enforced
Dependencies: M7.3-B.3
```

### M7.3-B.5 — RTS + Reconciliation

```text
Goal: RTS operational state, carrier-after-cancel reconciliation
Files: orders.service.ts, orders.controller.ts
Database: Use existing exception columns
API: POST /shipments/:id/rts
Security: Merchant request + admin approve
Tests: RTS lifecycle tests, reconciliation flag tests
Exit criteria: RTS state machine working, reconciliation events emitted
Dependencies: M7.3-B.4
```

### M7.3-B.6 — Runtime Verification

```text
Goal: Full runtime verification of all M7.3-B behavior
Tests: All concurrency tests, failure injection, security tests, regression
Exit criteria: All test contracts from Section 35 pass
Dependencies: M7.3-B.1 through M7.3-B.5
```

### M7.3-B.7 — Release Closure

```text
Goal: Verify all release gates, produce closure report
Exit criteria: All gates from Section 38 pass
Dependencies: M7.3-B.6
```

---

## 37. RELEASE GATES

| Gate | Criteria | Status |
|------|----------|--------|
| Business decisions locked | All decisions in this document are FINAL | LOCKED |
| Architecture decisions locked | All ADRs approved | LOCKED |
| F-01 fixed | Optimistic locking on all transitions | PENDING (B.1) |
| F-02 fixed | Inventory settlement inside transaction | PENDING (B.1) |
| Shipment cancellation invariant | Shipment cancelled atomically with order | PENDING (B.2) |
| Carrier cancellation deterministic | Best-effort + reconciliation flag | PENDING (B.3) |
| Delivery exceptions implemented | Full exception lifecycle | PENDING (B.4) |
| Concurrency tests pass | All concurrent scenarios | PENDING (B.6) |
| Security tests pass | All tenant/IDOR/escalation tests | PENDING (B.6) |
| Failure injection passes | All crash/failure scenarios | PENDING (B.6) |
| Migration fresh install | 0048 applies to fresh DB | PENDING (B.2) |
| Migration existing DB | 0048 applies to existing DB | PENDING (B.2) |
| Migration idempotency | 0048 can be re-run safely | PENDING (B.2) |
| TypeScript clean | tsc --noEmit = 0 errors | PENDING |
| Backend build clean | turbo build = success | PENDING |
| Regression suite passes | All existing tests green | PENDING |
| No known HIGH/CRITICAL defects | All findings resolved | PENDING |

---

## 38. NON-GOALS

```text
This milestone does not implement payments.
This milestone does not implement refunds.
This milestone does not implement full returns.
This milestone does not implement return-to-stock.
This milestone does not redesign disputes.
This milestone does not claim unsupported carrier capabilities.
This milestone does not implement buyer-initiated exception reporting (deferred to M7.3-E).
This milestone does not implement photo evidence storage.
This milestone does not implement notification expansion (deferred to M7.3-F).
This milestone does not implement GPS/maps integration.
```

---

## 39. OPEN QUESTIONS

| ID | Question | Impact | Required Before | Proposed Default | Status |
|----|----------|--------|----------------|-----------------|--------|
| OQ-1 | Should admin cancellation from ASSIGNED+ states require a separate permission (e.g., `orders:cancel:override`) or reuse existing `orders:cancel`? | Security model granularity | B.2 | Reuse `orders:cancel` with admin role check | LOCKED (default) |
| OQ-2 | Should the `OTHER` cancellation reason require `notes` to be non-empty? | Validation strictness | B.2 | Yes — `notes` required when reason = `OTHER` | LOCKED (default) |
| OQ-3 | When a driver reports `RECIPIENT_REFUSED`, should RTS be automatically suggested (exception status = RTS_PENDING) or left for merchant decision (exception status = OPEN)? | UX workflow | B.4 | Left OPEN for merchant decision; auto-RTS only after max attempts | LOCKED (default) |
| OQ-4 | Should `max_delivery_attempts` be per-shipment or per-order? | Granularity of retry policy | B.4 | Per-shipment (each sub-order has its own shipment) | LOCKED (default) |

**All open questions have proposed defaults that are non-blocking for B.1 implementation.**

---

## 40. FINAL DECISION GATE

```text
========================================
SCS M7.3-B.0 — DECISION LOCK COMPLETE
========================================

Branch: develop
Commit: 0f92097
Working tree: DIRTY (M7.3-A uncommitted changes — expected)

Audit baseline: SCS-M7.3-B-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md
M7.3-A status: CLOSED / PASS

Business decisions locked: 5
  1. Cancellation cutoff: Policy A (READY inclusive) for buyer/merchant; admin override
  2. Cancellation reasons: 11-code controlled vocabulary
  3. Delivery exception model: Shipment-level, not order FSM
  4. RTS boundary: Operational state only; inventory/financial deferred
  5. Master cancellation: Model C (orchestrated sub-order)

Architecture decisions locked: 12
  ADR-B0-001 through ADR-B0-012

ADRs created: 12

Open blocking decisions: 0
Open non-blocking decisions: 4 (all have locked defaults)

F-01 disposition: Fix in B.1 — optimistic locking on all transitions
F-02 disposition: Fix in B.1 — inventory settlement inside transaction
Carrier cancellation disposition: Best-effort + reconciliation flag (B.3)
Delivery exception architecture: Shipment-level exception FSM (B.4)
RTS disposition: Operational state recording only; inventory/financial deferred to M7.3-C/D
Master cancellation disposition: Orchestrated sub-order cancellation (Model C)

Implementation sequence:
  B.1 — Cancellation Concurrency Hardening
  B.2 — Merchant Cancellation + Shipment Synchronization
  B.3 — Carrier Cancellation / Best-Effort Handling
  B.4 — Delivery Exceptions + Retry
  B.5 — RTS + Reconciliation
  B.6 — Runtime Verification
  B.7 — Release Closure

Recommended next phase: M7.3-B.1 — Cancellation Concurrency Hardening

Final Gate:
GO

Implementation performed:
NO
========================================
```

---

## 35. B.0 FORMAL AMENDMENT — SUBMITTED CANCELLATION RULE

**Amendment ID:** B.0-AMEND-001  
**Date:** 2026-09-29  
**Source:** M7.3-B.2 independent runtime verification  
**Effective:** M7.3-B.2 release closure  
**Status:** ACCEPTED

### Original B.0 Rule

The original B.0 document listed `SUBMITTED` as a cancellable state (section 3.1) and included:

```text
SUBMITTED → CANCELLED (buyer/merchant/admin)
```

in the cancellation transition map (section 3.3). The FSM state table (section 29) marked SUBMITTED as `Cancellable? = Yes`.

### Amended Rule

`SUBMITTED` is **not** a cancellable state.

The effective cancellable states are:

```text
PENDING_CONFIRMATION
ACCEPTED
PARTIALLY_ACCEPTED
PREPARING
READY
PAYMENT_PENDING
```

### Reason for Amendment

The checkout transaction atomically creates the order as `SUBMITTED` and immediately auto-advances it to `PENDING_CONFIRMATION` within the same transaction:

```typescript
// Auto-advance all sub-orders: SUBMITTED → PENDING_CONFIRMATION
for (const sub of subOrderData) {
  await this.autoAdvanceToPendingConfirmation(sub.id, input.buyerId, sub.storeId);
}
```

Consequently:

1. `SUBMITTED` is not externally observable via any API endpoint
2. The FSM transition map defines `SUBMITTED → [PENDING_CONFIRMATION]` only — no `SUBMITTED → CANCELLED` exists in `OrdersService.TRANSITIONS`
3. No user (buyer, merchant, or admin) can ever submit a cancellation request against an order in `SUBMITTED` state
4. The B.0 listing was aspirational and did not account for the atomic auto-advance implemented before B.0 was written

### Consequences

- **No runtime behavior change required** — the implementation was already correct
- The business-rule documentation is now aligned with the actual implemented FSM
- Existing orders and existing cancellation behavior remain unchanged
- The B.2 implementation correctly excluded `SUBMITTED` from the cancellable list

### Compatibility

Fully backward-compatible. No production code was modified to implement this amendment — only the documentation was reconciled.

### Affected Sections

| Section | Change |
|---------|--------|
| 3.1 Cancellable States | SUBMITTED annotated as transient, not cancellable |
| 3.3 Cancellation Transition Map | SUBMITTED → CANCELLED line removed |
| 4 Locked Decision | Admin cutoff changed from SUBMITTED to PENDING_CONFIRMATION |
| 29 Final State Machines | SUBMITTED Cancellable? changed from Yes to No |

### Reference

See `ADR-M7.3-B0-013` in `docs/architecture/` for the formal ADR record.
See `SCS-M7.3-B.2-RUNTIME-VERIFICATION-RESULTS.md` §8 for the discrepancy analysis.
See `SCS-M7.3-B.2-RELEASE-CLOSURE.md` for the closure evidence.
