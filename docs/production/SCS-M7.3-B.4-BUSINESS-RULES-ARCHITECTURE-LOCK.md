# SCS-M7.3-B.4 — Business Rules / Architecture Lock

**Delivery Exceptions + Retry**

| Field | Value |
|---|---|
| Milestone | M7.3-B.4 |
| Phase | Business Rules + Architecture Decision Lock |
| Status | **LOCKED** |
| Baseline | `develop` after M7.3-B.3.4 CLOSED/PASS |
| Predecessor | SCS-M7.3-B.4-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md (GO WITH CONDITIONS) |
| Parent Lock | SCS-M7.3-B-BUSINESS-RULES-ARCHITECTURE-LOCK.md (LOCKED) |
| Next Phase | M7.3-B.4 — Implementation |
| Implementation | STRICTLY FORBIDDEN IN THIS PHASE |

---

## 1. Executive Summary

This document converts the findings of the M7.3-B.4 Pre-Implementation Architecture Audit into formally locked business rules and architecture decisions that serve as the authoritative specification for M7.3-B.4 implementation.

**Audit verdict inherited:** GO WITH CONDITIONS (5 conditions)

**All five conditions are incorporated into this lock.**

**Finding addressed:**
- **F-04** (HIGH): Zero delivery exception handling — no mechanism to report, track, or resolve delivery failures

**Key decisions locked:**
1. Delivery exceptions modeled at shipment level — order FSM unchanged
2. Exception FSM is orthogonal to order status, shipment status, carrier status, and recovery status
3. Eight canonical exception types — no additions
4. Retry is authorization-only — no automatic re-dispatch
5. RTS schema accommodated in B.4 columns; RTS logic deferred to B.5
6. Migration 0050 (correcting B.0's "0048" numbering error)
7. Carrier DELIVERED resolves OPEN exception (physical delivery wins)
8. Cancellation closes open exceptions (SCS authority wins)
9. Delivery attempt counting is atomic and separate from exception reporting
10. No inventory movement, no carrier API changes, no new workers

---

## 2. Baseline Verification

```text
Branch: develop
HEAD:   380a3f9ee4b62810ceefec303e1dff2bd9e5dbc6
M7.3-B.3.4 status: CLOSED / PASS (per SCS-M7.3-B.3.4-RELEASE-CLOSURE.md)
Audit baseline: SCS-M7.3-B.4-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md
Working tree: CLEAN
Migrations: 0001–0049 (latest: 0049_carrier_cancellation.sql)
```

**FSM confirmed at baseline (orders.service.ts L2205–2222):**
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

**Shipment schema confirmed (shipment.schema.ts):** No exception columns exist.

**API confirmed:** No exception or retry endpoints exist.

---

## 3. Business Objective

Provide a shipment-level delivery exception model and controlled retry capability.

When a delivery attempt fails (recipient unavailable, refused, wrong address, damaged, lost, etc.), the platform must:

1. Allow authorized actors to report the exception
2. Track the exception lifecycle (OPEN → action → RESOLVED/CLOSED)
3. Allow authorized actors to authorize a retry delivery attempt
4. Enforce maximum delivery attempts
5. Maintain schema compatibility for future RTS (B.5)

The order FSM is NOT modified. The order remains `OUT_FOR_DELIVERY` while an exception is active.

---

## 4. Scope Lock

### IN SCOPE

1. Migration `0050` — shipment exception columns
2. Exception lifecycle (OPEN → RETRY_PENDING / RESOLVED / CLOSED / RTS_PENDING)
3. Retry authorization (OPEN → RETRY_PENDING → OPEN)
4. Delivery attempt counting
5. Maximum attempt enforcement (default 3, range 1–10)
6. Exception API: `POST /v1/shipments/:id/exception`
7. Retry API: `POST /v1/shipments/:id/retry`
8. Driver/merchant/admin authorization
9. Exception type validation (8 canonical types)
10. Shipment event audit records
11. Transactional outbox events
12. Unit tests
13. PostgreSQL integration tests
14. Concurrency tests
15. Security tests
16. Regression verification

### OUT OF SCOPE

```text
RTS endpoint (POST /shipments/:id/rts)          — B.5
RTS approval workflow                            — B.5
Return-to-stock / inventory return               — M7.3-C
Refunds / financial settlement                   — M7.3-D
Buyer-initiated exception reporting              — M7.3-E
Notification expansion                           — M7.3-F
Photo evidence storage                           — future
Carrier webhook → automatic exception            — not authorized
Stale tracking → automatic LOST                  — not authorized
Order FSM changes                                — explicitly excluded
New carrier integration methods                  — no Aramex changes
getPickupStatus                                  — explicitly deferred
UNKNOWN → PENDING                                — explicitly deferred
Automatic re-cancel                              — explicitly deferred
Cancellation webhook processing                  — explicitly deferred
Recovery-token redesign                          — explicitly deferred
Poller naming cleanup                            — explicitly deferred
```

---

## 5. Business Rules

### BD-B4-001: Exception Model Location

```text
Status: LOCKED
Rule: Delivery exceptions are modeled at the SHIPMENT level, not the order level.
      The order FSM is NOT modified. The order remains OUT_FOR_DELIVERY during
      the entire exception lifecycle.
Source: B.0 Lock §6, §21; Audit §13
```

### BD-B4-002: Four State Dimensions

```text
Status: LOCKED
Rule: The following four state dimensions are NEVER conflated:
      1. Order status (16-state FSM)
      2. Shipment status (PREPARING → ... → DELIVERED → COMPLETED)
      3. Exception status (null → OPEN → RESOLVED/RTS_COMPLETED/CLOSED)
      4. Carrier status (carrierStatusRaw/carrierStatusMapped)
      Each dimension has its own lifecycle. Transitions in one do not
      automatically trigger transitions in another (except as explicitly
      defined in this lock).
Source: B.0 Lock §20; Audit INV-03
```

### BD-B4-003: Exception Types Are Closed

```text
Status: LOCKED
Rule: Exactly eight exception types exist. No additional types may be added.
      RECIPIENT_UNAVAILABLE, RECIPIENT_REFUSED, WRONG_ADDRESS, DAMAGED,
      LOST, CARRIER_EXCEPTION, DRIVER_EXCEPTION, OTHER.
      OTHER requires non-empty notes.
Source: B.0 Lock §6; Audit §8.3
```

### BD-B4-004: Retry Is Authorization-Only

```text
Status: LOCKED
Rule: Retry authorization transitions the exception to RETRY_PENDING and emits
      an outbox event. No automatic re-dispatch occurs. The actual re-delivery
      is a manual driver operation. Notification of the driver is deferred to
      M7.3-F.
Source: B.0 Lock §8; Audit condition 5
```

### BD-B4-005: RTS Schema Without RTS Logic

```text
Status: LOCKED
Rule: The exception_status column supports RTS_PENDING and RTS_COMPLETED values
      for schema compatibility. The RTS endpoint, approval flow, and operational
      logic are B.5 scope. B.4 only establishes the column values.
Source: B.0 Lock §9; Audit condition 4
```

### BD-B4-006: Migration Numbering Correction

```text
Status: LOCKED
Rule: B.4 uses migration 0050. The B.0 lock document referenced "0048" which
      was already used by B.2 (cancellation metadata). Migration 0049 is used
      by B.3.1 (carrier cancellation). This is a documentation numbering
      correction, not a scope change.
Source: Audit §4, condition 1
```

### BD-B4-007: Carrier DELIVERED Resolves OPEN Exception

```text
Status: LOCKED
Rule: When processCarrierDelivery() commits (order → DELIVERED) and the
      shipment has an OPEN exception, the exception is auto-resolved:
      exception_status → RESOLVED, exception_resolved_at set, shipment event
      DELIVERY_EXCEPTION_RESOLVED recorded with notes "Auto-resolved: carrier
      delivery confirmed". This follows the B.0 §12 principle: carrier
      DELIVERED represents physical reality. When the SCS state is non-terminal
      (OUT_FOR_DELIVERY), the delivery proceeds and the exception becomes moot.
      Contrast with DELIVERED_AFTER_CANCEL (B.0 §12): there, CANCELLED is
      terminal and delivery is rejected. Here, OUT_FOR_DELIVERY is not terminal
      and delivery succeeds.
Source: B.0 §12 (by analogy); Audit §14 (Carrier Delivery vs Exception)
```

### BD-B4-008: Cancellation Closes Open Exceptions

```text
Status: LOCKED
Rule: When an order is cancelled and the shipment has an OPEN or RETRY_PENDING
      exception, the cancellation transaction closes the exception:
      exception_status → CLOSED, exception_resolved_at set, shipment event
      DELIVERY_EXCEPTION_CLOSED recorded with notes "Closed: order cancelled".
      No cancelled shipment may remain operationally retryable.
Source: Audit condition 3; B.0 §11 (SCS cancellation authority)
```

### BD-B4-009: No Inventory Movement

```text
Status: LOCKED
Rule: Exception reporting, retry authorization, exception resolution, and
      exception closure do NOT perform inventory settlement. No SALE, RELEASE,
      or RESERVE movement occurs. Inventory behavior remains governed solely
      by the existing order-level transitions (ACCEPT→RESERVE, DELIVER→SALE,
      CANCEL→RELEASE).
Source: B.0 §13, §15; Audit condition 5; INV-04
```

### BD-B4-010: No New Workers

```text
Status: LOCKED
Rule: B.4 introduces no new background workers. Exception handling is
      synchronous (API-driven). Outbox events are emitted for downstream
      consumers but no new consumer is introduced.
Source: Audit §19 (Key Design Decision 3)
```

---

## 6. Exception Model

### 6.1 Exception FSM

```text
NO EXCEPTION (exception_status IS NULL)
      ↓ [exception reported by authorized actor]
   OPEN
      ↓
  ┌───┼───────────────┐
  ↓   ↓               ↓
RETRY  RESOLVED    RTS_PENDING     (RTS states: schema only in B.4)
  ↓                  ↓                  Logic in B.5
OPEN            RTS_COMPLETED
                   ↓
               CLOSED

Also: OPEN → CLOSED (direct close by merchant/admin)
Also: Any non-CLOSED → CLOSED (when order cancelled — BD-B4-008)
Also: OPEN → RESOLVED (when carrier delivery confirmed — BD-B4-007)
```

### 6.2 Exception State Transitions

| From | To | Trigger | Actor |
|---|---|---|---|
| NULL | OPEN | Exception reported | DRIVER, MERCHANT, ADMIN |
| OPEN | RETRY_PENDING | Retry authorized | MERCHANT, ADMIN |
| OPEN | RESOLVED | Exception resolved | MERCHANT, ADMIN |
| OPEN | CLOSED | Exception closed directly | MERCHANT, ADMIN |
| OPEN | RTS_PENDING | RTS requested | MERCHANT (request), ADMIN |
| RETRY_PENDING | OPEN | Retry succeeded (new delivery attempt succeeds) | SYSTEM (via delivery flow) |
| RETRY_PENDING | OPEN | Retry failed (new exception reported) | DRIVER, MERCHANT, ADMIN |
| RESOLVED | CLOSED | Lifecycle complete | SYSTEM |
| RTS_PENDING | RTS_COMPLETED | RTS completed | SYSTEM (B.5) |
| RTS_COMPLETED | CLOSED | Lifecycle complete | SYSTEM |
| OPEN/RETRY_PENDING | CLOSED | Order cancelled | SYSTEM (via cancel TX) |
| OPEN | RESOLVED | Carrier delivery confirmed | SYSTEM (via processCarrierDelivery) |

### 6.3 State Distinction (Locked)

```text
Shipment status:      PREPARING → ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED
Exception status:     (null) → OPEN → RESOLVED/RTS_COMPLETED/CLOSED
Order status:         Unchanged during exception (remains OUT_FOR_DELIVERY)
Carrier status:       Independent (carrierStatusRaw/carrierStatusMapped)
```

---

## 7. Exception Types

| Code | Display Name | Allowed Reporters | Notes Required | Retry Allowed |
|---|---|---|---|---|
| `RECIPIENT_UNAVAILABLE` | Recipient unavailable | DRIVER, MERCHANT, ADMIN | Recommended | Yes |
| `RECIPIENT_REFUSED` | Recipient refused | DRIVER, MERCHANT, ADMIN | Recommended | Yes (≤max) |
| `WRONG_ADDRESS` | Wrong address | DRIVER, MERCHANT, ADMIN | Recommended | Yes |
| `DAMAGED` | Package damaged | DRIVER, MERCHANT, ADMIN | Mandatory | No |
| `LOST` | Package lost | ADMIN | Mandatory | No |
| `CARRIER_EXCEPTION` | Carrier exception | MERCHANT, ADMIN | Recommended | Depends |
| `DRIVER_EXCEPTION` | Driver exception | DRIVER, ADMIN | Mandatory | Depends |
| `OTHER` | Other | Any | **Mandatory** | Depends |

**Excluded types:** `FAILED_DELIVERY` (too generic), `ADDRESS_INACCESSIBLE` (merged into `WRONG_ADDRESS`).

---

## 8. Retry Rules

```text
Who may request retry: MERCHANT (own orders), ADMIN (any)
Who may suggest retry: DRIVER (no authorization power)
Does retry create a new shipment? NO — reuses existing shipment
Does retry reset exception status? YES → RETRY_PENDING
Does retry create a shipment event? YES — DELIVERY_RETRY_REQUESTED
Does retry contact carrier? NO — retry is driver-based re-attempt
Does retry reset shipment status? NO — shipment status unchanged
Does retry change order status? NO — order remains OUT_FOR_DELIVERY
```

**Retry eligibility:**
- Exception status must be OPEN
- delivery_attempts must be < max_delivery_attempts
- Shipment must not be CANCELLED
- Order must not be CANCELLED or terminal

**Retry outcome:**
- On successful re-delivery: exception → RESOLVED (via delivery flow)
- On failed re-delivery: new exception reported → RETRY_PENDING stays, new OPEN created
- On retry not attempted: stays RETRY_PENDING until manual intervention

---

## 9. Attempt-Counting Rules

```text
An attempt is counted when the driver enters the physical delivery flow.
Reporting an exception does NOT increment delivery_attempts.
The counter increments when the driver actually attempts physical delivery.

delivery_attempts:
  - Default: 0
  - Incremented: atomically inside the delivery transaction
  - Range: 0 to max_delivery_attempts
  - Atomicity: inside same TX as delivery status update

max_delivery_attempts:
  - Default: 3
  - Minimum: 1
  - Maximum: 10
  - Configurable via: DELIVERY_MAX_ATTEMPTS env var
  - Who can change: ADMIN (runtime), SYSTEM (env var)

When threshold reached:
  - Retry is rejected with 409
  - Exception remains OPEN
  - RTS may be requested (B.5 endpoint)
```

---

## 10. Authorization Matrix

| Operation | DRIVER | MERCHANT | ADMIN |
|---|---|---|---|
| Report exception | Yes (assigned shipment) | Yes (own store) | Yes (any) |
| Resolve exception | No | Yes (own store) | Yes |
| Request retry | Suggest only | Yes (own store) | Yes |
| Request RTS | No | Request only | Yes |
| Close exception | No | Yes (own store) | Yes |

### Driver Authorization

```text
MUST verify: shipment.assignedDriverId == caller.userId
Allowed exception types: RECIPIENT_UNAVAILABLE, RECIPIENT_REFUSED,
                         WRONG_ADDRESS, DRIVER_EXCEPTION, OTHER
Required evidence: Notes mandatory; photo optional (not stored in B.4)
```

### Merchant Authorization

```text
MUST verify: shipment.storeId.orgId == caller.orgId
Permission: 'merchant:orders:write'
Can report all types except LOST (admin-only)
Can resolve, retry, close own-store exceptions
```

### Admin Authorization

```text
Permission: 'shipments:write' or admin bypass
BYPASS_ROLES: SUPER_ADMIN, ADMIN, MODERATOR
All operations logged with actorType = 'ADMIN'
No ownership check
```

---

## 11. API Contracts

### POST /v1/shipments/:id/exception

```text
Method: POST
Path: /v1/shipments/:id/exception
Actor: DRIVER, MERCHANT, ADMIN
Permission: 'shipments:write' (driver/admin) or 'merchant:orders:write' (merchant)

Request:
{
  "type": "RECIPIENT_UNAVAILABLE",
  "notes": "Recipient was unavailable"
}

Response (201):
{
  "shipmentId": "uuid",
  "exceptionStatus": "OPEN",
  "exceptionType": "RECIPIENT_UNAVAILABLE",
  "createdAt": "ISO-8601"
}

Errors:
  400 — invalid type, missing notes for OTHER/DAMAGED/LOST
  403 — unauthorized (driver not assigned, merchant wrong org)
  404 — shipment not found
  409 — already has open exception (unless same type → idempotent)
        or shipment/order is cancelled or terminal

Idempotency:
  If same exception type is already OPEN → return existing (200, not 201)
  If different exception type is OPEN → 409 Conflict

State requirements:
  Driver: shipment status OUT_FOR_DELIVERY, order status OUT_FOR_DELIVERY
  Merchant/Admin: shipment exists, not terminal, order not terminal
```

### POST /v1/shipments/:id/retry

```text
Method: POST
Path: /v1/shipments/:id/retry
Actor: MERCHANT, ADMIN
Permission: 'merchant:orders:write' or 'shipments:write'

Request:
{
  "notes": "Retry approved"
}

Response (200):
{
  "shipmentId": "uuid",
  "exceptionStatus": "RETRY_PENDING",
  "attemptNumber": 1
}

Errors:
  403 — unauthorized
  404 — shipment not found
  409 — no open exception, max attempts reached, retry already pending,
        shipment/order cancelled

State requirements:
  Exception status = OPEN
  delivery_attempts < max_delivery_attempts
  Shipment not CANCELLED
  Order not CANCELLED or terminal
```

---

## 12. Data Model

### Migration 0050 — Shipment Exception Columns

| Table | Column | Type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| shipments | exception_status | VARCHAR(24) | Yes | NULL | Exception lifecycle state |
| shipments | exception_type | VARCHAR(30) | Yes | NULL | Current/most-recent type |
| shipments | exception_notes | TEXT | Yes | NULL | Free-text details |
| shipments | exception_at | TIMESTAMPTZ | Yes | NULL | When opened |
| shipments | exception_resolved_at | TIMESTAMPTZ | Yes | NULL | When resolved/closed |
| shipments | delivery_attempts | INTEGER | No | 0 | Attempt counter |
| shipments | max_delivery_attempts | INTEGER | No | 3 | Max allowed |

**Index:**
```sql
CREATE INDEX IF NOT EXISTS idx_shipments_exception_status
  ON shipments(exception_status)
  WHERE exception_status IS NOT NULL;
```

**Safety:** All additive. No drops, renames, or data migration. IF NOT EXISTS. Zero-downtime safe.

**Drizzle schema:** camelCase property names (exceptionStatus, exceptionType, etc.) matching existing convention.

---

## 13. State Machines

### Order FSM — NO CHANGE

The order FSM is unchanged. OUT_FOR_DELIVERY → [DELIVERED] remains the only forward transition.

### Shipment Status FSM — NO CHANGE

Shipment status is unchanged during exception handling.

### Exception FSM — NEW

See §6.1 and §6.2 above.

### Carrier FSM — NO CHANGE

Carrier status tracking remains independent.

### Recovery FSM — NO CHANGE

Existing recovery/reconciliation continues unchanged.

---

## 14. Concurrency Rules

### CR-01: Exception vs Exception

```text
Pattern: Optimistic lock
SQL: UPDATE shipments SET exception_status = 'OPEN', ...
     WHERE id = ? AND exception_status IS NULL
Result: Rows = 1 → success; Rows = 0 → 409 Conflict
Idempotency: If same type already OPEN → return existing (200)
```

### CR-02: Retry vs Retry

```text
Pattern: Optimistic lock
SQL: UPDATE shipments SET exception_status = 'RETRY_PENDING', ...
     WHERE id = ? AND exception_status = 'OPEN'
Result: Rows = 1 → success; Rows = 0 → 409 Conflict
```

### CR-03: Exception vs Delivery (CONDITION 2)

```text
Rule: Exception reporting MUST verify the order is still OUT_FOR_DELIVERY
      inside the same transaction before committing the exception.

Implementation:
  BEGIN TX
    1. SELECT order status WHERE id = ? AND status = 'OUT_FOR_DELIVERY'
       If not found → 409 (delivery already won)
    2. UPDATE shipments SET exception_status = 'OPEN'
       WHERE id = ? AND exception_status IS NULL
    3. INSERT shipment_event (DELIVERY_EXCEPTION)
    4. INSERT outbox_event (shipment.delivery_exception)
  COMMIT

If delivery commits first → order is DELIVERED → step 1 fails → exception rejected.
If exception commits first → delivery's order-level lock still succeeds →
  delivery proceeds → exception auto-resolved by BD-B4-007.
```

### CR-04: Exception vs Cancellation (CONDITION 3)

```text
Rule: Cancellation is authoritative.

Case A — Cancellation wins:
  Shipment becomes CANCELLED. Exception report checks shipment status →
  rejected (409: shipment cancelled).

Case B — Exception already open when cancellation commits:
  The cancellation TX must close the open exception:
  UPDATE shipments SET exception_status = 'CLOSED',
    exception_resolved_at = NOW()
  WHERE id = ? AND exception_status IS NOT NULL
    AND exception_status NOT IN ('CLOSED', 'RESOLVED')
  Plus shipment_event DELIVERY_EXCEPTION_CLOSED.

No cancelled shipment may remain operationally retryable.
```

### CR-05: Carrier DELIVERED vs OPEN Exception (CONDITION 7)

```text
Rule: Carrier DELIVERED represents physical reality.

When processCarrierDelivery() commits and an exception is OPEN:
  1. Order transitions to DELIVERED (existing flow)
  2. Inventory SALE occurs (existing flow)
  3. Exception auto-resolved:
     UPDATE shipments SET exception_status = 'RESOLVED',
       exception_resolved_at = NOW()
     WHERE id = ? AND exception_status = 'OPEN'
  4. Shipment event: DELIVERY_EXCEPTION_RESOLVED
     notes: 'Auto-resolved: carrier delivery confirmed'
     actorType: 'CARRIER'

Contrast with DELIVERED_AFTER_CANCEL (B.0 §12):
  CANCELLED is terminal → delivery rejected, reconciliation created.
  OUT_FOR_DELIVERY is not terminal → delivery succeeds, exception resolved.
```

---

## 15. Cancellation Interaction

```text
Existing cancel flow (orders.service.ts cancelOrder()):
  1. Optimistic lock: order → CANCELLED
  2. settleStockForStatus() — RELEASE
  3. Shipment → CANCELLED + cancelledAt + cancellationReason
  4. Shipment event: CANCELLED
  5. Outbox: order.cancelled
  6. Master recalc

B.4 addition to cancel TX:
  3b. If shipment has open exception → close it:
      exception_status = 'CLOSED', exception_resolved_at = NOW()
      Shipment event: DELIVERY_EXCEPTION_CLOSED
      (inside same TX — atomic with cancellation)

Retry authorization MUST verify order is not CANCELLED.
Exception reporting MUST verify shipment is not CANCELLED.
```

---

## 16. Delivery Interaction

### Driver Delivery (deliverOrder)

```text
Existing flow unchanged. B.4 adds:
  After successful delivery (order → DELIVERED, shipment → DELIVERED):
  If shipment had OPEN exception → auto-resolve:
    exception_status = 'RESOLVED', exception_resolved_at = NOW()
    Shipment event: DELIVERY_EXCEPTION_RESOLVED
  Inside same TX as delivery.
```

### Carrier Delivery (processCarrierDelivery)

```text
Per BD-B4-007 and CR-05:
  processCarrierDelivery() proceeds normally.
  After successful carrier delivery:
  If shipment had OPEN exception → auto-resolve (same as driver delivery).
  Inside same TX.
```

### Delivery Attempt Counting

```text
delivery_attempts increments in the delivery transaction:
  UPDATE shipments SET delivery_attempts = delivery_attempts + 1
  WHERE id = ?
  Inside same TX as order/shipment status update.

This is separate from exception reporting.
Exception report ≠ attempt increment.
```

---

## 17. Carrier Interaction

```text
B.4 is entirely SCS-internal.
No Aramex files modified.
No new provider methods.
No new carrier API calls.
No new webhook handling.
No new carrier states.

Aramex capabilities (unchanged):
  canCreateShipment: true
  canCancel: false
  canCancelPickup: true
  canTrack: true
  canReceiveWebhooks: true
  Exception API: DOES NOT EXIST
  RTS API: DOES NOT EXIST
```

---

## 18. Inventory Interaction

```text
Exception report:     NO inventory movement
Retry authorization:  NO inventory movement
Exception resolve:    NO inventory movement
Exception close:      NO inventory movement
Carrier delivery:     Existing SALE movement (unchanged)
Driver delivery:      Existing SALE movement (unchanged)
Order cancellation:   Existing RELEASE movement (unchanged)

Exception report ≠ Inventory SALE.
```

---

## 19. Outbox Events

| Event Name | Producer | Payload | When |
|---|---|---|---|
| `shipment.delivery_exception` | orders.service | shipmentId, orderId, exceptionType, notes, actorType, storeId | Exception reported |
| `shipment.delivery_retry_requested` | orders.service | shipmentId, orderId, attemptNumber, requestedBy, storeId | Retry authorized |

**Rules:**
- Emitted inside same TX as state mutation (transactional outbox)
- No separate exception worker introduced
- No automatic notification introduced
- No automatic delivery dispatch introduced
- Standard outbox retry for consumers

---

## 20. Shipment Events

| Event Type | When | Actor | Notes |
|---|---|---|---|
| `DELIVERY_EXCEPTION` | Exception reported | DRIVER/MERCHANT/ADMIN | type + notes in metadata |
| `DELIVERY_RETRY_REQUESTED` | Retry authorized | MERCHANT/ADMIN | attemptNumber in metadata |
| `DELIVERY_RETRY_ATTEMPTED` | Re-delivery attempted | DRIVER | attempt result in metadata |
| `DELIVERY_EXCEPTION_RESOLVED` | Exception resolved | MERCHANT/ADMIN/CARRIER | resolution reason in metadata |
| `DELIVERY_EXCEPTION_CLOSED` | Exception closed | MERCHANT/ADMIN/SYSTEM | closure reason in metadata |

Every exception state transition is auditable via shipment_events.

---

## 21. Security Rules

| Threat | Protection |
|---|---|
| Driver reporting on unassigned shipment | `assignedDriverId == caller.userId` |
| Merchant managing another merchant's exception | `shipment.storeId.orgId == caller.orgId` |
| Cross-tenant access | Org isolation in tenant-scope.ts |
| Driver escalating to resolve/close/retry | Role check: DRIVER cannot |
| Merchant admin-only operations | Permission check |
| Admin bypass exposure | BYPASS_ROLES limited; logged |
| IDOR on exception endpoint | UUID PKs + ownership checks |
| Horizontal privilege escalation | Tenant isolation checks |
| Retry on cancelled shipment | Shipment status check |
| Exception on terminal shipment | Shipment status check |

---

## 22. Idempotency

| Operation | Mechanism | Behavior |
|---|---|---|
| Exception report (same type, already OPEN) | exception_status + exception_type check | Return existing (200) |
| Exception report (different type, already OPEN) | exception_status IS NULL guard | 409 Conflict |
| Retry (already RETRY_PENDING) | exception_status = 'OPEN' guard | 409 Conflict |
| Resolve (already RESOLVED) | exception_status = 'OPEN' guard | 409 Conflict |
| Close (already CLOSED) | exception_status check | 409 Conflict |
| Carrier delivery auto-resolve | exception_status = 'OPEN' guard | No-op if already resolved |
| Cancellation close | exception_status NOT IN ('CLOSED','RESOLVED') | No-op if already closed |

---

## 23. Error Semantics

| Error | HTTP Code | When |
|---|---|---|
| Invalid exception type | 400 | Type not in canonical 8 |
| Missing notes for OTHER/DAMAGED/LOST | 400 | Notes required but empty |
| Unauthorized (driver not assigned) | 403 | assignedDriverId mismatch |
| Unauthorized (merchant wrong org) | 403 | storeId.orgId mismatch |
| Unauthorized (driver cannot resolve) | 403 | Role lacks permission |
| Shipment not found | 404 | Invalid shipment ID |
| Already has open exception | 409 | exception_status IS NOT NULL |
| No open exception (for retry/resolve) | 409 | exception_status != OPEN |
| Max attempts reached | 409 | delivery_attempts >= max |
| Shipment cancelled | 409 | shipment.status = CANCELLED |
| Order cancelled | 409 | order.status = CANCELLED |
| Concurrent modification | 409 | Optimistic lock rows = 0 |

---

## 24. Verification Requirements

### Unit Tests

- All 8 exception types validated
- Valid/invalid state transitions
- Authorization matrix (driver/merchant/admin)
- Idempotency (duplicate report, duplicate retry)
- Attempt counting (increment, boundary, max)
- Order status preservation (unchanged during exception)
- Shipment eligibility checks
- Error semantics (400/403/404/409)

### PostgreSQL Integration Tests

- Transaction atomicity (exception + outbox in same TX)
- Exception lifecycle (OPEN → RETRY → OPEN → RESOLVED → CLOSED)
- Retry lifecycle (OPEN → RETRY_PENDING → delivery → RESOLVED)
- Concurrent exception reporting (100 simultaneous → 1 succeeds)
- Concurrent retry (100 simultaneous → 1 succeeds)
- Exception vs delivery race (one wins deterministically)
- Exception vs cancellation race (cancellation wins, closes exception)
- Carrier delivery auto-resolves open exception
- Cancellation closes open exception
- Outbox atomicity (event + state in same TX)
- Migration 0050 (fresh DB + existing DB)

### Security Tests

- Cross-driver access → 403
- Cross-merchant access → 403
- Cross-tenant access → 403
- Unauthorized resolve → 403
- Unauthorized retry → 403
- Unauthorized close → 403
- Admin bypass → logged

### Regression

- All M7.3-B.1 through B.3.4 suites green
- All M7.3-A suites green
- All M7.2.x suites green
- Full non-PG suite: 0 new failures
- `npx tsc --noEmit` — 0 errors
- `npx nest build` — success

---

## 25. Out-of-Scope Items (Explicit)

The following MUST NOT be implemented as part of B.4:

1. RTS endpoint (`POST /shipments/:id/rts`)
2. RTS approval workflow
3. Return-to-stock / inventory return
4. Refunds / financial settlement
5. Buyer-initiated exception reporting
6. Expanded notifications
7. Photo evidence storage
8. Carrier webhook → automatic exception
9. Stale tracking → automatic LOST
10. Order FSM changes
11. New carrier integration methods
12. `getPickupStatus`
13. UNKNOWN → PENDING
14. Automatic re-cancel
15. Cancellation webhook processing
16. Recovery-token redesign
17. Poller naming cleanup

Do not opportunistically fix any of these.

---

## 26. Migration 0050 Specification

```sql
-- Migration 0050: Delivery Exception Columns
-- B.4: Shipment-level delivery exception model

-- Exception lifecycle
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS
  exception_status VARCHAR(24);

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS
  exception_type VARCHAR(30);

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS
  exception_notes TEXT;

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS
  exception_at TIMESTAMPTZ;

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS
  exception_resolved_at TIMESTAMPTZ;

-- Delivery attempt tracking
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS
  delivery_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS
  max_delivery_attempts INTEGER NOT NULL DEFAULT 3;

-- Partial index for exception queries
CREATE INDEX IF NOT EXISTS idx_shipments_exception_status
  ON shipments(exception_status)
  WHERE exception_status IS NOT NULL;
```

**Verification:**
- Applies to fresh DB: Yes
- Applies to existing DB: Yes (all additive)
- Idempotent: Yes (IF NOT EXISTS)
- Zero-downtime: Yes
- Data migration: Not required

---

## 27. Release Gates

B.4 cannot be considered CLOSED until:

| Gate | Criteria |
|---|---|
| Architecture Audit | PASS / GO WITH CONDITIONS |
| Business/Architecture Lock | LOCKED |
| Implementation | PASS |
| Independent Runtime Verification | PASS |
| PostgreSQL | PASS |
| Concurrency | PASS |
| Security | PASS |
| Idempotency | PASS |
| Cancellation Safety | PASS |
| Regression | PASS |
| TypeScript | PASS |
| Build | PASS |
| Scope Integrity | PASS |
| Migration Integrity | PASS |
| Release Closure | PASS |

---

## 28. Implementation Authorization

### Architecture Decision Records

| ADR | Title | Decision |
|---|---|---|
| ADR-B4-001 | Exception Model Location | Shipment-level, not order FSM |
| ADR-B4-002 | Migration Number | 0050 (correcting B.0 "0048") |
| ADR-B4-003 | Carrier DELIVERED vs OPEN Exception | Delivery wins; exception auto-resolved |
| ADR-B4-004 | Cancellation vs OPEN Exception | Cancellation wins; exception closed |
| ADR-B4-005 | Retry Mechanism | Authorization-only; no auto-dispatch |
| ADR-B4-006 | RTS in B.4 | Schema only; logic in B.5 |
| ADR-B4-007 | Attempt Counting | Atomic in delivery TX; not on exception report |
| ADR-B4-008 | Exception Types | Closed set of 8; no additions |
| ADR-B4-009 | Workers | No new workers; synchronous API-driven |
| ADR-B4-010 | Inventory | No movement on exception/retry |

### Five Audit Conditions — Incorporation Status

| # | Condition | Incorporated As |
|---|---|---|
| 1 | Migration 0050 (not 0048) | BD-B4-006, §26 |
| 2 | Exception vs delivery race | BD-B4-007, CR-03, CR-05 |
| 3 | Cancellation clears exceptions | BD-B4-008, CR-04, §15 |
| 4 | RTS schema in B.4, logic in B.5 | BD-B4-005, §6.2 |
| 5 | No automatic re-delivery | BD-B4-004, §8 |

---

## 29. Final Lock Status

```text
========================================
M7.3-B.4 BUSINESS / ARCHITECTURE LOCK

Status: LOCKED

Implementation authorization: GRANTED

Migration: 0050

Architecture Decision Records: 10
  ADR-B4-001 through ADR-B4-010

Business Decisions: 10
  BD-B4-001 through BD-B4-010

Five audit conditions: ALL INCORPORATED

Open business decisions: 0
Open blocking decisions: 0
External verification: None required

Next stage:
  M7.3-B.4 IMPLEMENTATION
========================================
```
