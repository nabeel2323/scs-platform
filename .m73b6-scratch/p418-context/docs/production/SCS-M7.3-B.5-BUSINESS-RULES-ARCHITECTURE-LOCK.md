# SCS-M7.3-B.5 — Business Rules + Architecture Decision Lock

**RTS + Reconciliation**

| Field | Value |
|-------|-------|
| Milestone | M7.3-B.5 |
| Phase | Business Rules + Architecture Decision Lock |
| Status | **LOCKED** |
| Baseline | `develop` @ `5aa29bf784c4d01a9d17d614a413c5559643b07f` |
| Predecessor | SCS-M7.3-B.5-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md (GO WITH CONDITIONS, 7 conditions) |
| Parent Lock | SCS-M7.3-B-BUSINESS-RULES-ARCHITECTURE-LOCK.md (LOCKED) |
| Previous Milestone | M7.3-B.4 — CLOSED / PASS |
| Next Phase | M7.3-B.5 — Implementation |
| Implementation | STRICTLY FORBIDDEN IN THIS PHASE |

---

## 1. Milestone Identity

This document converts the findings of the M7.3-B.5 Pre-Implementation Architecture Audit into formally locked business rules and architecture decisions that serve as the authoritative specification for M7.3-B.5 implementation.

**Audit verdict inherited:** GO WITH CONDITIONS (7 conditions)

**All seven conditions are incorporated and resolved in this lock.**

**Business objective:** When delivery exceptions reach a terminal failure point (recipient refused, max delivery attempts exhausted), provide a structured RTS request/approval workflow that records the RTS lifecycle, emits events for downstream consumption, and maintains a complete audit trail — without modifying inventory, carrier integrations, or the order FSM.

---

## 2. Baseline

```text
Branch:           develop
HEAD:             5aa29bf784c4d01a9d17d614a413c5559643b07f
Working tree:     CLEAN (only untracked B.5 audit document)
Migrations:       0001–0050 (latest: 0050_delivery_exceptions.sql)
Latest commit:    test(delivery): add integration and unit tests for delivery exceptions and retries
```

**Exception FSM at baseline (orders.service.ts L886–892):**
```text
OPEN → [RETRY_PENDING, RESOLVED, CLOSED, RTS_PENDING]
RETRY_PENDING → [OPEN, CLOSED]
RESOLVED → []
CLOSED → []
RTS_PENDING → [RTS_COMPLETED]
RTS_COMPLETED → [CLOSED]
```

**Schema at baseline (shipment.schema.ts L93):**
```text
exception_status: VARCHAR(24), nullable
```
Accommodates RTS_PENDING (11 chars), RTS_IN_PROGRESS (15 chars), RTS_COMPLETED (13 chars).

**Cancellation exception closure at baseline (orders.service.ts L1136–1149):**
```text
WHERE exception_status IN ('OPEN', 'RETRY_PENDING')
```
B.5 extends this to include RTS states.

---

## 3. Authoritative Inputs

| Document | Role | Status |
|----------|------|--------|
| SCS-M7.3-B-BUSINESS-RULES-ARCHITECTURE-LOCK.md | Parent lock — authoritative where B.5 requirements exist | LOCKED |
| SCS-M7.3-B.5-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md | Primary input — audit findings and open decisions | COMPLETE |
| SCS-M7.3-B.4-BUSINESS-RULES-ARCHITECTURE-LOCK.md | Predecessor lock — B.4 foundation | LOCKED |
| SCS-M7.3-B.4-RELEASE-CLOSURE.md | Predecessor closure | CLOSED / PASS |

**Parent B.0 lock B.5 roadmap evidence (§36):**
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

**Parent B.0 lock §9 (ADR-B0-009: RTS Boundary):**
```text
M7.3-B records the operational RTS state/event only.
Inventory return-to-stock is deferred to M7.3-C.
Financial refund handling is deferred to M7.3-D.
```

**Parent B.0 lock §9 (RTS Authorization):**
```text
RTS authorization actor: ADMIN (primary), MERCHANT (request with admin approval for LOST/DAMAGED)
RTS triggers: RECIPIENT_REFUSED, MAX_DELIVERY_ATTEMPTS_EXCEEDED
RTS status: RTS_PENDING → RTS_IN_PROGRESS → RTS_COMPLETED
Carrier action: None in M7.3-B (Aramex has no RTS API)
```

**Conflict resolution:** B.0 §7 (Delivery Exception Ownership table) shows MERCHANT with "Can Trigger RTS: Yes (approve)" while §9 says "ADMIN (primary)." This lock resolves: ADMIN is the primary approval actor; MERCHANT may approve for own-store shipments EXCEPT for LOST/DAMAGED exception types, which require ADMIN approval.

---

## 4. Business Objective

Implement the RTS request/approval workflow and state machine. When a delivery exception reaches a terminal failure point, authorized actors can request the return of the physical shipment. The RTS lifecycle proceeds through merchant request → admin approval → physical return confirmation, with complete audit trail and event emission.

B.5 delivers:
1. RTS state machine (OPEN → RTS_PENDING → RTS_IN_PROGRESS → RTS_COMPLETED → CLOSED)
2. RTS request/approval/rejection/completion endpoints
3. Authorization model (merchant request + admin approve)
4. Shipment events and outbox events for the RTS lifecycle
5. Cancellation, delivery, and retry interaction rules
6. Concurrency safety via optimistic locking

B.5 does NOT deliver: inventory movement, financial settlement, carrier RTS APIs, or order FSM changes.

---

## 5. Scope

### IN SCOPE

1. RTS state machine (three-state: RTS_PENDING → RTS_IN_PROGRESS → RTS_COMPLETED)
2. RTS request endpoint (POST /v1/shipments/:id/rts)
3. RTS approval endpoint (POST /v1/shipments/:id/rts/approve)
4. RTS rejection endpoint (POST /v1/shipments/:id/rts/reject)
5. RTS completion endpoint (POST /v1/shipments/:id/rts/complete)
6. Authorization (merchant request + admin approve)
7. RTS triggers (RECIPIENT_REFUSED, MAX_DELIVERY_ATTEMPTS_EXCEEDED)
8. LOST exception RTS (admin investigation → admin direct RTS)
9. RTS shipment events (audit trail)
10. RTS outbox events (downstream consumers)
11. Cancellation interaction (close RTS on cancel)
12. Delivery interaction (block delivery when RTS active)
13. Retry interaction (block retry when RTS active)
14. Concurrency safety (optimistic locking)
15. Exception FSM extension (add RTS_IN_PROGRESS)
16. Cancellation TX extension (close RTS states)
17. Unit tests, PostgreSQL integration tests, concurrency tests, security tests
18. Regression verification

### OUT OF SCOPE

```text
Inventory return-to-stock                           — M7.3-C
Financial refund handling                           — M7.3-D
Buyer return workflow                               — M7.3-E
Notification expansion                              — M7.3-F
Photo evidence storage                              — future
Carrier RTS API integration                         — not authorized (Aramex has no RTS API)
New carrier provider methods                        — not authorized
Post-delivery return workflow                       — M7.3-C
Order FSM changes                                   — explicitly excluded
Master-order FSM redesign                           — explicitly excluded
Recovery-token redesign                             — explicitly deferred
Poller cleanup                                      — explicitly deferred
Unrelated tracking improvements                     — explicitly deferred
Automatic redelivery dispatch                       — not authorized
New workers                                         — not authorized
Automatic carrier RTS                               — not authorized
```

---

## 6. Business Decisions

### BD-B5-001: RTS State Model

```text
Status: LOCKED
Rule: B.5 uses the THREE-STATE RTS lifecycle:
      RTS_PENDING → RTS_IN_PROGRESS → RTS_COMPLETED
      This matches the parent B.0 lock §9 which explicitly specifies:
      "RTS_PENDING → RTS_IN_PROGRESS → RTS_COMPLETED"
      RTS_PENDING:    RTS requested, awaiting admin approval
      RTS_IN_PROGRESS: RTS approved, physical return underway
      RTS_COMPLETED:  Physical return confirmed
      The EXCEPTION_TRANSITIONS map is extended to include RTS_IN_PROGRESS.
      No schema migration required — VARCHAR(24) accommodates all three values.
Source: B.0 Lock §9; Audit Condition 1 (OBD-01)
```

### BD-B5-002: RTS Triggers

```text
Status: LOCKED
Rule: RTS is directly available for exactly two exception scenarios:
      1. RECIPIENT_REFUSED — recipient explicitly refused the package
      2. MAX_DELIVERY_ATTEMPTS_EXCEEDED — delivery_attempts >= max_delivery_attempts
      Other exception types do NOT automatically enable RTS:
      - RECIPIENT_UNAVAILABLE: retry first; RTS only after max attempts
      - WRONG_ADDRESS: retry with corrected address first
      - DAMAGED: merchant decides disposition (no auto-RTS)
      - LOST: admin investigation first; RTS only if confirmed unrecoverable (see BD-B5-009)
      - CARRIER_EXCEPTION: depends on specific carrier issue
      - DRIVER_EXCEPTION: depends on specific driver issue
      - OTHER: depends on specific circumstances
Source: B.0 Lock §9; Audit §10
```

### BD-B5-003: RTS Authorization

```text
Status: LOCKED
Rule: ADMIN is the primary authorization actor for RTS.
      MERCHANT may request RTS for own-store shipments.
      MERCHANT may approve RTS for own-store shipments EXCEPT LOST/DAMAGED.
      LOST/DAMAGED RTS requires ADMIN approval always.
      DRIVER has no RTS approval authority.
      BUYER has no RTS authority whatsoever.
Source: B.0 Lock §9; Audit §12
```

### BD-B5-004: RTS Approval

```text
Status: LOCKED
Rule: RTS approval transitions RTS_PENDING → RTS_IN_PROGRESS.
      Who may approve: ADMIN (any shipment), MERCHANT (own store, non-LOST/DAMAGED).
      Approval is atomic via optimistic lock.
      Approval emits RTS_APPROVED shipment event and shipment.rts_approved outbox event.
      Once approved, the physical return is considered underway.
Source: B.0 Lock §9; Audit §8
```

### BD-B5-005: RTS Rejection

```text
Status: LOCKED
Rule: When admin (or merchant for own-store) rejects an RTS request:
      RTS_PENDING → OPEN (exception reverts to open state)
      Rejection requires non-empty notes (rejection reason).
      Emits RTS_REJECTED shipment event.
      No outbox event on rejection (internal operational matter).
      After rejection, the shipment can be retried or a new RTS requested.
      The exception remains the same type as originally reported.
Source: Audit Condition 4 (OBD-06)
```

### BD-B5-006: Physical Return Confirmation

```text
Status: LOCKED
Rule: Physical return confirmation transitions RTS_IN_PROGRESS → RTS_COMPLETED.
      Who may confirm: MERCHANT (own store), ADMIN (any).
      Notes are recommended but not mandatory.
      Return condition is NOT recorded in B.5 (deferred to M7.3-C).
      Return quantity is NOT recorded in B.5 (deferred to M7.3-C).
      Confirmation emits RTS_COMPLETED shipment event and shipment.rts_completed outbox event.
      Confirmation is idempotent via optimistic lock.
      NO inventory movement occurs (deferred to M7.3-C).
Source: Audit Condition 5 (OBD-07)
```

### BD-B5-007: Cancellation Interaction

```text
Status: LOCKED
Rule: SCS cancellation authority wins over RTS at every stage.
      The cancellation TX is extended to close RTS states:
      - RTS_PENDING + cancellation → exception → CLOSED
      - RTS_IN_PROGRESS + cancellation → exception → CLOSED
      - RTS_COMPLETED + cancellation → exception → CLOSED
      All produce DELIVERY_EXCEPTION_CLOSED event with notes
      "Closed: order cancelled (RTS cancelled)".
      The cancelOrder() WHERE clause is extended from
      IN ('OPEN', 'RETRY_PENDING') to
      IN ('OPEN', 'RETRY_PENDING', 'RTS_PENDING', 'RTS_IN_PROGRESS', 'RTS_COMPLETED').
      Cancellation and RTS transitions occur in the same transaction.
Source: B.0 Lock §11; Audit Condition 6
```

### BD-B5-008: Delivery Interaction

```text
Status: LOCKED
Rule: Once RTS is requested (exception_status = RTS_PENDING), driver and carrier
      delivery are BLOCKED. A shipment being returned must not be delivered.
      Delivery flow (deliverOrder + processCarrierDelivery) checks:
      IF exception_status NOT IN (NULL, 'OPEN') → reject delivery with 409.
      This prevents the inconsistency where order is DELIVERED but shipment
      is in RTS state.
      To deliver after RTS request, admin must first reject the RTS
      (RTS_PENDING → OPEN via /rts/reject), then proceed with delivery.
Source: Audit §14.5; Lock §14 requirement
```

### BD-B5-009: LOST Handling

```text
Status: LOCKED
Rule: LOST exceptions can enter RTS, but only under strict conditions:
      1. LOST is ADMIN-only for exception reporting (B.4 locked).
      2. Admin must first investigate and confirm the package is unrecoverable.
      3. RTS for LOST is initiated by ADMIN directly (not merchant request).
      4. ADMIN both requests and approves LOST RTS in a single operation:
         OPEN → RTS_PENDING (request) → RTS_IN_PROGRESS (immediate admin approval).
         The admin must provide mandatory notes explaining the unrecoverable finding.
      5. Merchant cannot request RTS for LOST exceptions.
      6. LOST RTS emits both RTS_REQUESTED and RTS_APPROVED events.
      7. LOST RTS outbox emits shipment.rts_requested with exceptionType=LOST.
      LOST RTS does NOT differ from other RTS after RTS_IN_PROGRESS —
      the same completion flow applies.
Source: B.0 Lock §9 ("LOST — admin investigation first; RTS only if confirmed unrecoverable")
```

### BD-B5-010: Reconciliation Scope

```text
Status: LOCKED
Rule: B.5 "Reconciliation" means RTS state recording and event emission ONLY.
      No active reconciliation mechanism is introduced.
      No new worker is introduced.
      No reconciliation status column is added.
      No scheduled processing is introduced.
      "Reconciliation" in the B.5 title refers to the RTS lifecycle providing
      the data foundation for future reconciliation:
      - Outbox events (shipment.rts_completed) for downstream consumers
      - Shipment events (RTS_COMPLETED) for audit trail
      Physical return verification (did the goods actually arrive back?) is
      deferred to M7.3-C.
      Financial reconciliation (refunds, adjustments) is deferred to M7.3-D.
Source: B.0 Lock §9 (ADR-B0-009); Audit Condition 2 (OBD-03)
```

---

## 7. RTS State Machine

### 7.1 Authoritative Exception FSM (Post-B.5)

```text
NO EXCEPTION (exception_status IS NULL)
      ↓ [exception reported]
   OPEN
      ↓
  ┌───┼───────────────┬──────────────────┐
  ↓   ↓               ↓                  ↓
RETRY  RESOLVED    RTS_PENDING        CLOSED
  ↓                  ↓
OPEN            RTS_IN_PROGRESS
                     ↓
               RTS_COMPLETED
                     ↓
                  CLOSED

Also: OPEN → CLOSED (direct close by merchant/admin — B.4)
Also: OPEN/RETRY_PENDING → CLOSED (order cancelled — B.4)
Also: RTS_PENDING → OPEN (RTS rejected — B.5)
Also: RTS_PENDING/RTS_IN_PROGRESS/RTS_COMPLETED → CLOSED (order cancelled — B.5)
Also: OPEN → RESOLVED (carrier/driver delivery confirmed — B.4)
```

### 7.2 Authoritative Transition Map

```typescript
EXCEPTION_TRANSITIONS = {
  'OPEN':            ['RETRY_PENDING', 'RESOLVED', 'CLOSED', 'RTS_PENDING'],
  'RETRY_PENDING':  ['OPEN', 'CLOSED'],
  'RESOLVED':       [],
  'CLOSED':         [],
  'RTS_PENDING':    ['RTS_IN_PROGRESS', 'OPEN'],       // approve or reject
  'RTS_IN_PROGRESS':['RTS_COMPLETED'],                  // physical return confirmed
  'RTS_COMPLETED':  ['CLOSED'],                         // lifecycle finalized
};
```

### 7.3 Transition Table

| From | To | Trigger | Actor | API |
|------|----|---------|-------|-----|
| OPEN | RTS_PENDING | RTS requested | MERCHANT, ADMIN | POST /rts |
| RTS_PENDING | RTS_IN_PROGRESS | RTS approved | ADMIN, MERCHANT (non-LOST/DAMAGED) | POST /rts/approve |
| RTS_PENDING | OPEN | RTS rejected | ADMIN, MERCHANT | POST /rts/reject |
| RTS_IN_PROGRESS | RTS_COMPLETED | Physical return confirmed | MERCHANT, ADMIN | POST /rts/complete |
| RTS_COMPLETED | CLOSED | Lifecycle finalized | SYSTEM | Internal |
| OPEN/RETRY_PENDING/RTS_PENDING/RTS_IN_PROGRESS/RTS_COMPLETED | CLOSED | Order cancelled | SYSTEM | cancelOrder() |

### 7.4 Invalid Transitions (Explicitly Locked)

| Transition | Reason | HTTP Response |
|------------|--------|---------------|
| RTS_PENDING → RETRY_PENDING | RTS active; reject first then retry | 409 |
| RTS_IN_PROGRESS → RETRY_PENDING | RTS active; cancel order first | 409 |
| RTS_COMPLETED → RETRY_PENDING | RTS complete; terminal | 409 |
| RTS_PENDING → RESOLVED | No delivery during RTS | 409 |
| RTS_IN_PROGRESS → RESOLVED | No delivery during RTS | 409 |
| RTS_COMPLETED → RESOLVED | RTS complete; terminal | 409 |
| RTS_PENDING → RTS_COMPLETED | Must go through RTS_IN_PROGRESS | 409 |
| RTS_COMPLETED → RTS_PENDING | Already completed | 409 |
| RTS_IN_PROGRESS → RTS_PENDING | Cannot un-approve | 409 |
| CLOSED → anything | Terminal state | 409 |
| RESOLVED → anything | Terminal state | 409 |

---

## 8. RTS Triggers

| Exception Type | RTS Available? | Condition | Who May Request |
|----------------|----------------|-----------|-----------------|
| RECIPIENT_REFUSED | **YES — direct** | Immediately when exception is OPEN | MERCHANT, ADMIN |
| (MAX_DELIVERY_ATTEMPTS_EXCEEDED) | **YES — direct** | When delivery_attempts >= max AND exception is OPEN | MERCHANT, ADMIN |
| RECIPIENT_UNAVAILABLE | No | Retry first; RTS only after max attempts reached | — |
| WRONG_ADDRESS | No | Retry with corrected address first | — |
| DAMAGED | No | Merchant decides disposition | — |
| LOST | **Conditional** | Admin investigation → confirmed unrecoverable | ADMIN only |
| CARRIER_EXCEPTION | No | Depends on specific carrier issue | — |
| DRIVER_EXCEPTION | No | Depends on specific driver issue | — |
| OTHER | No | Depends on specific circumstances | — |

**MAX_DELIVERY_ATTEMPTS_EXCEEDED** is not an exception type — it is a condition detected when `delivery_attempts >= max_delivery_attempts` on a shipment with an OPEN exception of any type.

**RTS eligibility check (implementation):**
```text
RTS is eligible when:
  1. exception_status = 'OPEN'
  2. exception_type IN ('RECIPIENT_REFUSED') OR delivery_attempts >= max_delivery_attempts
     OR (exception_type = 'LOST' AND caller is ADMIN)
  3. Shipment not CANCELLED
  4. Order not CANCELLED or terminal
```

---

## 9. Authorization Matrix

| Operation | DRIVER | MERCHANT | ADMIN | BUYER |
|-----------|--------|----------|-------|-------|
| Request RTS | **No** | **Yes** (own store) | **Yes** (any) | **No** |
| Approve RTS | **No** | **Yes** (own store, non-LOST/DAMAGED) | **Yes** (any) | **No** |
| Reject RTS | **No** | **Yes** (own store) | **Yes** (any) | **No** |
| Confirm physical return | **No** | **Yes** (own store) | **Yes** (any) | **No** |
| Complete RTS | **No** | **Yes** (own store) | **Yes** (any) | **No** |

### Tenant Isolation

- **Merchant:** `shipment.storeId.orgId == caller.orgId` — same as B.4 exception operations
- **Admin:** BYPASS_ROLES: SUPER_ADMIN, ADMIN, MODERATOR — no ownership check
- **Driver:** No RTS authority at all
- **Buyer:** No RTS authority at all
- **IDOR protection:** UUID primary keys + ownership checks via existing `assertShipmentAccessible()` pattern

### Permission

```text
Required permission: 'fulfillment:shipments:write' (same as B.4 exception endpoints)
Merchant permission: 'merchant:orders:write'
```

---

## 10. RTS API Contracts

### POST /v1/shipments/:id/rts — Request RTS

```text
Method: POST
Path: /v1/shipments/:id/rts
Actor: MERCHANT, ADMIN
Permission: 'fulfillment:shipments:write' or 'merchant:orders:write'

Request:
{
  "notes": "Recipient refused delivery"    // optional for standard triggers, mandatory for LOST
}

Response (201):
{
  "shipmentId": "uuid",
  "exceptionStatus": "RTS_PENDING",
  "exceptionType": "RECIPIENT_REFUSED",
  "requestedBy": "user-uuid",
  "requestedAt": "ISO-8601"
}

Idempotency:
  If already RTS_PENDING with same exception type → return existing (200)
  If already RTS_PENDING with different context → 409 Conflict

Errors:
  400 — RTS not eligible (exception type not RTS-eligible, max attempts not reached)
  403 — unauthorized (driver, buyer, wrong org)
  404 — shipment not found
  409 — exception not OPEN, shipment cancelled, order cancelled,
        delivery blocked due to active RTS

State requirements:
  exception_status = 'OPEN'
  exception_type IN ('RECIPIENT_REFUSED') OR delivery_attempts >= max_delivery_attempts
    OR (exception_type = 'LOST' AND caller is ADMIN)
  Shipment not CANCELLED
  Order not CANCELLED or terminal

Transaction:
  BEGIN TX
    1. Re-verify order status = 'OUT_FOR_DELIVERY' inside TX
    2. Optimistic lock: exception_status 'OPEN' → 'RTS_PENDING'
    3. INSERT shipment_event: RTS_REQUESTED
    4. INSERT outbox_event: shipment.rts_requested
  COMMIT
```

### POST /v1/shipments/:id/rts/approve — Approve RTS

```text
Method: POST
Path: /v1/shipments/:id/rts/approve
Actor: ADMIN, MERCHANT (own store, non-LOST/DAMAGED)
Permission: 'fulfillment:shipments:write' or 'merchant:orders:write'

Request:
{
  "notes": "Approved for return"           // optional
}

Response (200):
{
  "shipmentId": "uuid",
  "exceptionStatus": "RTS_IN_PROGRESS",
  "approvedBy": "user-uuid",
  "approvedAt": "ISO-8601"
}

Errors:
  403 — unauthorized (driver, buyer, wrong org, merchant on LOST/DAMAGED)
  404 — shipment not found
  409 — exception not RTS_PENDING, shipment cancelled

State requirements:
  exception_status = 'RTS_PENDING'
  Shipment not CANCELLED

Transaction:
  BEGIN TX
    1. Optimistic lock: exception_status 'RTS_PENDING' → 'RTS_IN_PROGRESS'
    2. INSERT shipment_event: RTS_APPROVED
    3. INSERT outbox_event: shipment.rts_approved
  COMMIT
```

### POST /v1/shipments/:id/rts/reject — Reject RTS

```text
Method: POST
Path: /v1/shipments/:id/rts/reject
Actor: ADMIN, MERCHANT (own store)
Permission: 'fulfillment:shipments:write' or 'merchant:orders:write'

Request:
{
  "notes": "Retry delivery instead"        // MANDATORY
}

Response (200):
{
  "shipmentId": "uuid",
  "exceptionStatus": "OPEN",
  "rejectionReason": "Retry delivery instead"
}

Errors:
  400 — missing notes (mandatory for rejection)
  403 — unauthorized
  404 — shipment not found
  409 — exception not RTS_PENDING

State requirements:
  exception_status = 'RTS_PENDING'
  Shipment not CANCELLED

Transaction:
  BEGIN TX
    1. Validate notes non-empty
    2. Optimistic lock: exception_status 'RTS_PENDING' → 'OPEN'
    3. INSERT shipment_event: RTS_REJECTED (with rejection notes)
  COMMIT

  No outbox event on rejection (internal operational matter).
```

### POST /v1/shipments/:id/rts/complete — Complete RTS

```text
Method: POST
Path: /v1/shipments/:id/rts/complete
Actor: MERCHANT, ADMIN
Permission: 'fulfillment:shipments:write' or 'merchant:orders:write'

Request:
{
  "notes": "Package returned to warehouse"  // optional
}

Response (200):
{
  "shipmentId": "uuid",
  "exceptionStatus": "RTS_COMPLETED",
  "completedBy": "user-uuid",
  "completedAt": "ISO-8601"
}

Errors:
  403 — unauthorized
  404 — shipment not found
  409 — exception not RTS_IN_PROGRESS, shipment cancelled

State requirements:
  exception_status = 'RTS_IN_PROGRESS'
  Shipment not CANCELLED

Transaction:
  BEGIN TX
    1. Optimistic lock: exception_status 'RTS_IN_PROGRESS' → 'RTS_COMPLETED'
    2. INSERT shipment_event: RTS_COMPLETED
    3. INSERT outbox_event: shipment.rts_completed
  COMMIT

  NO inventory movement. NO stock settlement.
```

---

## 11. RTS Rejection Rules

```text
Rejection transition: RTS_PENDING → OPEN
Rejection reason: MANDATORY (notes must be non-empty)
Who may reject: ADMIN (any), MERCHANT (own store)
Event emitted: RTS_REJECTED (shipment event with rejection notes in metadata)
Outbox event: NONE (rejection is internal operational matter)

After rejection:
  - Exception reverts to OPEN state
  - Original exception type is preserved
  - Shipment can be retried (if eligible)
  - New RTS can be requested (if eligible)
  - The RTS_REQUESTED event remains in shipment_events (audit trail)
  - The RTS_REJECTED event is appended with rejection notes

Rejection is idempotent:
  - If exception is not RTS_PENDING → 409 Conflict
  - Optimistic lock prevents concurrent rejection + approval
```

---

## 12. Physical Return Confirmation

```text
Confirmation transition: RTS_IN_PROGRESS → RTS_COMPLETED
Who may confirm: MERCHANT (own store), ADMIN (any)
Notes: Recommended but not mandatory
Return condition: NOT recorded in B.5 (deferred to M7.3-C)
Return quantity: NOT recorded in B.5 (deferred to M7.3-C)
Event emitted: RTS_COMPLETED (shipment event)
Outbox event: shipment.rts_completed

Confirmation is idempotent:
  - If already RTS_COMPLETED → 200 (return existing state)
  - If not RTS_IN_PROGRESS → 409 Conflict
  - Optimistic lock prevents concurrent completions

After confirmation:
  - Exception status is RTS_COMPLETED
  - Order status remains OUT_FOR_DELIVERY (unchanged)
  - No inventory movement occurs
  - Outbox event available for downstream consumers (M7.3-C inventory return)
  - RTS_COMPLETED → CLOSED transition occurs when admin closes the exception
```

---

## 13. Delivery Interaction

### RTS vs Delivery — Authoritative Rule

```text
Once RTS is requested (exception_status = RTS_PENDING or beyond),
driver and carrier delivery are BLOCKED.

Delivery check (deliverOrder + processCarrierDelivery):
  IF exception_status IS NOT NULL AND exception_status NOT IN ('OPEN')
  THEN reject delivery with 409:
    "Delivery blocked: RTS active (status: {exception_status})"
```

### Race: RTS Request vs Delivery

```text
Case A — Delivery commits first:
  Order → DELIVERED. Exception auto-resolved (OPEN → RESOLVED, BD-B4-007).
  RTS request: order status check inside TX → order is DELIVERED → 409.

Case B — RTS request commits first:
  Exception → RTS_PENDING. Delivery flow checks exception_status →
  RTS_PENDING is not NULL/OPEN → delivery rejected with 409.

Deterministic: exactly one succeeds. No corrupted state.
```

### Race: RTS Approval vs Delivery

```text
Not reachable in practice: approval requires RTS_PENDING, but delivery is
already blocked when exception is RTS_PENDING. If delivery somehow succeeds
(race with RTS request), the exception is RESOLVED and approval is rejected
(RTS_PENDING not found).
```

### Race: RTS Completion vs Delivery

```text
Not reachable: completion requires RTS_IN_PROGRESS, and delivery is blocked
when exception is RTS_IN_PROGRESS.
```

---

## 14. Cancellation Interaction

### Cancellation → RTS (Authoritative Rule)

```text
SCS cancellation authority wins over RTS at every stage.

The cancelOrder() TX step 4c (B.4 exception closure) is extended:
  WHERE exception_status IN ('OPEN', 'RETRY_PENDING',
                             'RTS_PENDING', 'RTS_IN_PROGRESS', 'RTS_COMPLETED')

When cancellation closes an RTS state:
  - exception_status → 'CLOSED'
  - exception_resolved_at → NOW()
  - Shipment event: DELIVERY_EXCEPTION_CLOSED
    notes: 'Closed: order cancelled (RTS cancelled)'
    metadata: { reason, rtsState: 'RTS_PENDING'|'RTS_IN_PROGRESS'|'RTS_COMPLETED' }
  - Inside same TX as cancellation (atomic)
  - Idempotent: if already CLOSED, no-op
```

### Race: Cancellation vs RTS Request

```text
Case A — Cancellation commits first:
  Shipment → CANCELLED. RTS request: shipment status check → 409.

Case B — RTS request commits first:
  Exception → RTS_PENDING. Cancellation TX step 4c:
  exception_status IN ('RTS_PENDING') → matches → exception → CLOSED.
  Cancellation proceeds normally.
```

### Race: Cancellation vs RTS Approval

```text
Case A — Cancellation commits first:
  Exception → CLOSED. Approval: optimistic lock WHERE = 'RTS_PENDING' →
  rows = 0 → 409.

Case B — Approval commits first:
  Exception → RTS_IN_PROGRESS. Cancellation TX step 4c:
  exception_status IN ('RTS_IN_PROGRESS') → matches → exception → CLOSED.
```

---

## 15. Retry Interaction

```text
RTS and retry are mutually exclusive.

Retry eligibility requires exception_status = 'OPEN'.
When exception is RTS_PENDING, RTS_IN_PROGRESS, or RTS_COMPLETED:
  - Retry request → 409 Conflict: "Cannot retry: RTS active (status: {status})"

RTS request requires exception_status = 'OPEN'.
When exception is RETRY_PENDING:
  - RTS request → 409 Conflict: "Cannot request RTS: retry pending"

After RTS rejection (RTS_PENDING → OPEN):
  - Retry becomes eligible again (if max attempts not reached)
  - New RTS can also be requested

After RTS completion (RTS_COMPLETED):
  - Retry is permanently unavailable (RTS_COMPLETED → CLOSED is the only path)
```

---

## 16. LOST Handling

```text
LOST exception RTS — special flow:

1. LOST is ADMIN-only for exception reporting (B.4 BD-B4-003).
2. Admin must investigate and confirm package is unrecoverable.
3. Admin initiates RTS for LOST via POST /v1/shipments/:id/rts.
4. Because LOST RTS is admin-initiated AND admin-approved:
   - The request transitions OPEN → RTS_PENDING (as normal)
   - The admin MAY simultaneously approve, transitioning RTS_PENDING → RTS_IN_PROGRESS
   - This is a single API call that performs both steps atomically
   - Mandatory notes explaining unrecoverable finding
5. If admin does not simultaneously approve:
   - RTS follows normal flow: RTS_PENDING → admin approval → RTS_IN_PROGRESS
6. Merchant CANNOT request RTS for LOST exceptions.
7. LOST RTS emits the same events as other RTS types.
   Additional metadata: { investigationResult: 'unrecoverable' }

LOST RTS differs from other RTS only in:
  - Who may request (ADMIN only)
  - Mandatory investigation notes
  - Cannot be merchant-requested
After RTS_IN_PROGRESS, the flow is identical.
```


---

## 17. Reconciliation Definition

```text
B.5 "Reconciliation" is defined as: RTS state recording and event emission.

What is being reconciled: The RTS lifecycle — from request through completion.
What event indicates reconciliation: shipment.rts_completed outbox event.
Who consumes the event: No consumer in B.5. Future consumers in M7.3-C
  (inventory return) and M7.3-D (financial settlement).
Is a persistent reconciliation status needed: NO.
Is a worker needed: NO.

The existing carrier-reconciliation.service.ts handles carrier create/cancel
state uncertainty. It is NOT affected by B.5.
The existing carrier-tracking-poller.ts continues unchanged.

B.5 reconciliation produces:
  - 4 shipment event types (RTS_REQUESTED, RTS_APPROVED, RTS_REJECTED, RTS_COMPLETED)
  - 3 outbox event types (shipment.rts_requested, shipment.rts_approved, shipment.rts_completed)
  - Complete audit trail of who requested, approved, and completed the RTS

Active reconciliation (confirming physical return, discrepancy detection,
scheduled reconciliation jobs) is deferred to M7.3-C.
```

---

## 18. Inventory Boundary

```text
B.5 performs NO inventory movement. This is an absolute invariant.

B.5 MUST NOT:
  - Add RETURN stock movement type
  - Add RESTOCK movement type
  - Modify inventory_items quantities
  - Call settleStockForStatus() for RTS operations
  - Perform financial settlement
  - Create refund records
  - Add return condition tracking
  - Add return quantity tracking

B.5 DOES:
  - Record the RTS lifecycle (RTS_PENDING → RTS_IN_PROGRESS → RTS_COMPLETED)
  - Emit outbox events for downstream consumers
  - Record shipment events for audit trail
  - Provide the data foundation for M7.3-C inventory return

Inventory movements remain governed solely by existing order-level transitions:
  ACCEPT → RESERVE
  DELIVER → SALE
  CANCEL → RELEASE

RTS does not trigger any of these.
```

---

## 19. Order / Master Order Boundary

```text
RTS is shipment-level. Order FSM does not change. Master order aggregation does not change.

During RTS:
  - Sub-order status remains OUT_FOR_DELIVERY (unchanged)
  - Master order status is unaffected (aggregation based on sub-order statuses)
  - Multiple merchants: each shipment has independent RTS lifecycle
  - Multiple shipments: one shipment's RTS does not affect another's
  - Partial RTS: supported — one shipment RTS'd while others continue

No order status such as RETURNING or RETURNED is introduced.
Post-delivery returns are M7.3-C scope.

Master order aggregation during RTS:
  - RTS does not change sub-order status → master unaffected
  - If one sub-order's shipment enters RTS, master reflects other active sub-orders
  - If all sub-orders' shipments enter RTS, master still reflects active sub-orders
    (because sub-order status is unchanged)
```

---

## 20. Carrier Boundary

```text
B.5 is entirely SCS-internal.

  - No Aramex RTS API (confirmed: DOES NOT EXIST)
  - No new provider capability (no canReturnShipment, no canRTS)
  - No new carrier methods on ShippingProvider abstract class
  - No new carrier webhook behavior
  - No new carrier state changes
  - No carrier-side return operation
  - No changes to ProviderCapabilities interface
  - No changes to Aramex provider files

Reconciliation is state/event recording only (see §17).
No carrier tracking changes for RTS.
No carrier webhook changes for RTS.
```

---

## 21. Shipment Events

| Event Type | When | Actor | Notes | Metadata |
|------------|------|-------|-------|----------|
| `RTS_REQUESTED` | RTS requested | MERCHANT/ADMIN | exceptionType in notes | `{ exceptionType, requestedBy, trigger }` |
| `RTS_APPROVED` | RTS approved | ADMIN/MERCHANT | approval notes | `{ approvedBy }` |
| `RTS_REJECTED` | RTS rejected | ADMIN/MERCHANT | rejection reason | `{ rejectedBy, reason }` |
| `RTS_COMPLETED` | Physical return confirmed | MERCHANT/ADMIN | completion notes | `{ completedBy }` |

**Event type length check (VARCHAR(40) limit):**
- RTS_REQUESTED: 11 chars ✓
- RTS_APPROVED: 12 chars ✓
- RTS_REJECTED: 12 chars ✓
- RTS_COMPLETED: 13 chars ✓

**Rules:**
- Every RTS state transition is recorded as a shipment event
- Events are inserted inside the same TX as the state change
- Events are append-only (no updates/deletes)
- actorType reflects the actual actor (MERCHANT, ADMIN)
- actorUserId records the specific user

---

## 22. Outbox Events

| Event Name | When | Aggregate | Payload | Metadata |
|------------|------|-----------|---------|----------|
| `shipment.rts_requested` | RTS requested | shipmentId | `{ shipmentId, orderId, exceptionType, requestedBy }` | `{ storeId }` |
| `shipment.rts_approved` | RTS approved | shipmentId | `{ shipmentId, orderId, approvedBy }` | `{ storeId }` |
| `shipment.rts_completed` | RTS completed | shipmentId | `{ shipmentId, orderId, completedBy }` | `{ storeId }` |

**Rules:**
- All outbox events emitted inside same TX as state mutation (transactional outbox)
- No separate RTS worker introduced
- No automatic notification introduced
- No automatic inventory return introduced
- Standard outbox retry for consumers
- Downstream consumers do not exist in B.5

**B.0 lock §9 (ADR-B0-009) compliance:**
```text
"Outbox event shipment.rts_requested emitted" — SATISFIED
```

**No outbox event on RTS rejection:**
Rejection is an internal operational matter. The shipment event RTS_REJECTED
provides the audit trail. No downstream consumer needs to know about rejection.

---

## 23. Idempotency

| Operation | Mechanism | Duplicate Behavior | HTTP |
|-----------|-----------|-------------------|------|
| RTS request (already RTS_PENDING, same type) | exception_status + type check | Return existing state | 200 |
| RTS request (already RTS_PENDING, different) | exception_status guard | 409 Conflict | 409 |
| RTS request (exception not OPEN) | exception_status = 'OPEN' guard | 409 Conflict | 409 |
| RTS request (after delivery, exception RESOLVED) | exception_status check | 409: exception resolved | 409 |
| RTS request (after cancellation) | shipment status check | 409: shipment cancelled | 409 |
| RTS approval (already RTS_IN_PROGRESS) | exception_status = 'RTS_PENDING' guard | 409 Conflict | 409 |
| RTS approval (not RTS_PENDING) | optimistic lock | 409 Conflict | 409 |
| RTS rejection (already OPEN after rejection) | exception_status = 'RTS_PENDING' guard | 409 Conflict | 409 |
| RTS completion (already RTS_COMPLETED) | exception_status = 'RTS_IN_PROGRESS' guard | 200 (return existing) | 200 |
| RTS completion (not RTS_IN_PROGRESS) | optimistic lock | 409 Conflict | 409 |
| Delivery after RTS requested | exception_status check | 409: delivery blocked | 409 |
| Retry after RTS requested | exception_status check | 409: retry blocked | 409 |

**No duplicate inventory movement risk:** B.5 performs no inventory movement.
**No duplicate stock release risk:** B.5 does not call settleStockForStatus().
**No duplicate order status change:** B.5 does not modify order status.

---

## 24. Concurrency Rules

### CR-B5-01: RTS Request vs RTS Request

```text
Pattern: Optimistic lock
SQL: UPDATE shipments SET exception_status = 'RTS_PENDING', ...
     WHERE id = ? AND exception_status = 'OPEN'
Result: Rows = 1 → success (201); Rows = 0 → 409 Conflict
Additional: Re-verify order status = 'OUT_FOR_DELIVERY' inside TX (per BD-B4-007 pattern)
```

### CR-B5-02: RTS Approval vs RTS Approval

```text
Pattern: Optimistic lock
SQL: UPDATE shipments SET exception_status = 'RTS_IN_PROGRESS', ...
     WHERE id = ? AND exception_status = 'RTS_PENDING'
Result: Rows = 1 → success (200); Rows = 0 → 409 Conflict
```

### CR-B5-03: RTS Completion vs RTS Completion

```text
Pattern: Optimistic lock
SQL: UPDATE shipments SET exception_status = 'RTS_COMPLETED', ...
     WHERE id = ? AND exception_status = 'RTS_IN_PROGRESS'
Result: Rows = 1 → success (200); Rows = 0 → 409 Conflict
```

### CR-B5-04: RTS vs Delivery

```text
Pattern: Mutual exclusion via state checks
Delivery flow checks: exception_status IS NULL OR exception_status = 'OPEN'
  If not → 409 (delivery blocked: RTS active)
RTS flow checks: order status = 'OUT_FOR_DELIVERY' inside TX
  If not → 409 (delivery already won)
Winner: Deterministic — first to commit wins
No delivery resurrection: once RTS is active, delivery cannot proceed
```

### CR-B5-05: RTS vs Cancellation

```text
Pattern: Cancellation wins
Cancellation TX extends step 4c to include RTS states:
  WHERE exception_status IN ('OPEN', 'RETRY_PENDING',
                             'RTS_PENDING', 'RTS_IN_PROGRESS', 'RTS_COMPLETED')
If cancellation commits first → shipment CANCELLED → RTS rejected (409)
If RTS commits first → cancellation TX closes RTS → exception → CLOSED
Both are atomic. No corrupted state.
```

### CR-B5-06: RTS vs Retry

```text
Pattern: Mutual exclusion via FSM
Retry requires exception_status = 'OPEN'
RTS requires exception_status = 'OPEN'
Once either transitions, the other is blocked by FSM.
No additional locking needed beyond the existing optimistic locks.
```

### Mandatory PostgreSQL Concurrency Tests

| Test | Setup | Expected |
|------|-------|----------|
| 100 concurrent RTS requests | Same shipment, OPEN exception | 1 succeeds (201), 99 get 409 |
| 100 concurrent RTS approvals | Same shipment, RTS_PENDING | 1 succeeds (200), 99 get 409 |
| 100 concurrent RTS completions | Same shipment, RTS_IN_PROGRESS | 1 succeeds (200), 99 get 409 |
| RTS request vs delivery | Simultaneous | One wins deterministically |
| RTS request vs cancellation | Simultaneous | Cancellation wins or RTS rejected |
| RTS approval vs delivery | RTS_PENDING + delivery attempt | Delivery blocked (409) |
| RTS approval vs cancellation | Simultaneous | One wins deterministically |

---

## 25. Database / Migration Decision

```text
Decision: NO MIGRATION

The B.0 lock §36 explicitly states: "Database: Use existing exception columns"

B.5 uses:
  - exception_status (VARCHAR(24)) — accommodates RTS_PENDING, RTS_IN_PROGRESS, RTS_COMPLETED
  - exception_type (VARCHAR(30)) — existing, unchanged
  - exception_notes (TEXT) — existing, unchanged
  - exception_at (TIMESTAMPTZ) — existing, set when exception opened
  - exception_resolved_at (TIMESTAMPTZ) — existing, set when exception closed/resolved
  - shipment_events — RTS events recorded here (actor, timestamp, metadata)
  - outbox_events — RTS outbox events recorded here

RTS actor tracking: via shipment_events (actorUserId, actorType, createdAt)
RTS timestamp tracking: via shipment_events (createdAt for each event)
RTS metadata: via shipment_events (metadata JSONB field)

No rts_requested_at, rts_approved_at, rts_completed_at columns needed.
No rts_requested_by, rts_approved_by columns needed.
No return_condition, return_quantity columns needed (deferred to M7.3-C).

Code changes required:
  - EXCEPTION_TRANSITIONS map: add 'RTS_IN_PROGRESS' key and update 'RTS_PENDING' transitions
  - cancelOrder() step 4c: extend WHERE clause to include RTS states
  - deliverOrder() / processCarrierDelivery(): add RTS check before delivery
```

---

## 26. Security Rules

| Threat | Protection |
|--------|-----------|
| Merchant requesting RTS on another merchant's shipment | `shipment.storeId.orgId == caller.orgId` |
| Driver approving/rejecting/completing RTS | Role check: DRIVER has no RTS authority |
| Buyer requesting RTS | Permission check: buyer lacks required permission |
| Cross-tenant RTS access | Org isolation in existing helpers |
| Merchant approving LOST/DAMAGED RTS | Exception type check: LOST/DAMAGED requires ADMIN |
| Admin bypass exposure | BYPASS_ROLES limited; logged |
| IDOR on RTS endpoints | UUID PKs + ownership checks |
| Duplicate/replay RTS request | Optimistic lock |
| RTS on cancelled shipment | Shipment status check |
| RTS on delivered shipment | Exception status check (must be OPEN) |
| Delivery after RTS requested | Exception status check (must be NULL/OPEN) |
| Unauthorized inventory manipulation | No inventory movement in B.5 |

### Mandatory Security Tests

| Test | Expected |
|------|----------|
| Cross-merchant RTS request → 403 | Forbidden |
| Cross-tenant RTS request → 403 | Forbidden |
| Driver RTS approval → 403 | Forbidden |
| Driver RTS rejection → 403 | Forbidden |
| Driver RTS completion → 403 | Forbidden |
| Buyer RTS request → 403 | Forbidden |
| Merchant approve LOST RTS → 403 | Forbidden (ADMIN only) |
| Merchant approve DAMAGED RTS → 403 | Forbidden (ADMIN only) |
| Unauthorized admin-like role → 403 | Forbidden |
| IDOR attempt on RTS endpoint → 403/404 | Forbidden/Not found |
| Replay/duplicate RTS request | Idempotent (200) or 409 |

---

## 27. Testing Requirements

### Unit Tests

| Area | Cases |
|------|-------|
| RTS state transitions | All valid transitions; all invalid transitions rejected |
| RTS triggers | RECIPIENT_REFUSED eligible; MAX_ATTEMPTS eligible; others not |
| RTS authorization | Driver/merchant/admin/buyer matrix for all 4 endpoints |
| RTS rejection | Notes mandatory; returns to OPEN; preserves exception type |
| RTS idempotency | Duplicate request, duplicate approval, duplicate completion |
| LOST RTS | Admin-only; mandatory notes; investigation metadata |
| FSM constants | RTS_IN_PROGRESS in EXCEPTION_TRANSITIONS |
| Error semantics | 400/403/404/409 for each endpoint |

### PostgreSQL Integration Tests

| Area | Cases |
|------|-------|
| RTS lifecycle | OPEN → RTS_PENDING → RTS_IN_PROGRESS → RTS_COMPLETED → CLOSED |
| RTS rejection | OPEN → RTS_PENDING → OPEN (rejected) → RTS_PENDING (new request) |
| Atomic RTS transitions | State + events + outbox in same TX |
| Concurrent RTS requests | 100 simultaneous → 1 succeeds |
| Concurrent RTS approvals | 100 simultaneous → 1 succeeds |
| Concurrent RTS completions | 100 simultaneous → 1 succeeds |
| RTS vs delivery race | One wins deterministically; no corrupted state |
| RTS vs cancellation | Cancellation wins; closes RTS |
| RTS vs retry | Retry rejected when RTS active; RTS rejected when retry pending |
| Outbox atomicity | RTS events + state in same TX |
| LOST RTS flow | Admin-only; direct initiation |
| Delivery blocked during RTS | deliverOrder + processCarrierDelivery both reject |
| Cancellation closes RTS states | All 3 RTS states closed by cancel TX |

### Security Tests

| Test | Expected |
|------|----------|
| Cross-merchant RTS → 403 | Forbidden |
| Cross-tenant RTS → 403 | Forbidden |
| Driver RTS approval → 403 | Forbidden |
| Buyer RTS request → 403 | Forbidden |
| Merchant approve LOST → 403 | Forbidden |

### Regression

| Suite | Expected |
|-------|----------|
| B.4 (delivery exceptions) | All green |
| B.3.4 (race closure) | All green |
| B.3.x (carrier cancellation) | All green |
| B.2 (merchant cancellation) | All green |
| B.1 (concurrency hardening) | All green |
| Shipping unit | All green |
| Orders unit | All green |
| TypeScript | 0 errors |
| Build | 0 issues |

---

## 28. Invariants

The following invariants MUST hold throughout B.5 implementation:

| ID | Invariant | Preserved By |
|----|-----------|-------------|
| INV-B5-01 | Order FSM unchanged | No order status writes in RTS operations |
| INV-B5-02 | RTS is shipment-level | All RTS operations on shipments table |
| INV-B5-03 | Four state dimensions never conflated | Independent columns for each dimension |
| INV-B5-04 | No inventory movement in B.5 | No settleStockForStatus() in RTS operations |
| INV-B5-05 | Optimistic locking for all RTS transitions | WHERE clause guards on all UPDATEs |
| INV-B5-06 | SCS cancellation authority wins | Cancel TX closes all RTS states |
| INV-B5-07 | Tenant/merchant isolation | Existing authorization helpers reused |
| INV-B5-08 | Idempotency | Optimistic locks + state checks |
| INV-B5-09 | Concurrency safety | Optimistic locking + TX state verification |
| INV-B5-10 | Auditability | All transitions in shipment_events |
| INV-B5-11 | Transactional outbox | Outbox inside same TX |
| INV-B5-12 | No delivery resurrection | Delivery blocked when RTS active |
| INV-B5-13 | Master order unaffected | Sub-order status unchanged during RTS |
| INV-B5-14 | No carrier changes | No carrier files modified |
| INV-B5-15 | No new workers | Synchronous API-driven |

---

## 29. ADRs

### ADR-B5-001: Shipment-Level RTS

```text
Context: RTS could be modeled at order, sub-order, or shipment level.
Decision: RTS is modeled at the SHIPMENT level.
Alternatives: Order-level RTS (rejected: conflates with order FSM);
  Sub-order-level RTS (rejected: shipment is the physical entity being returned).
Rationale: Consistent with B.4 exception model (ADR-B4-001). The shipment is
  the physical entity being returned. Each shipment has its own RTS lifecycle.
Consequences: Multi-shipment orders may have partial RTS. Master order
  aggregation is unaffected.
```

### ADR-B5-002: Three-State RTS Model

```text
Context: B.0 lock specifies RTS_PENDING → RTS_IN_PROGRESS → RTS_COMPLETED.
  B.4 created only RTS_PENDING and RTS_COMPLETED.
Decision: Adopt the three-state model per B.0 lock.
Alternatives: Two-state (RTS_PENDING → RTS_COMPLETED) — simpler but contradicts
  B.0 lock; loses meaningful distinction between "approved" and "completed".
Rationale: B.0 lock is authoritative. Three states provide clear operational
  semantics: requested, approved/in-transit, completed.
Consequences: EXCEPTION_TRANSITIONS map extended with RTS_IN_PROGRESS.
  No migration needed (VARCHAR(24) accommodates 15-char value).
```

### ADR-B5-003: No Inventory Movement in B.5

```text
Context: RTS physically returns goods. Inventory could be adjusted immediately.
Decision: B.5 performs NO inventory movement.
Alternatives: Add RETURN movement type now (rejected: violates B.0 ADR-B0-009
  boundary; M7.3-C owns inventory return).
Rationale: B.0 lock explicitly defers inventory return-to-stock to M7.3-C.
  B.5 records state; M7.3-C acts on it.
Consequences: After RTS_COMPLETED, inventory does not reflect returned goods
  until M7.3-C. Outbox events provide the integration point.
```

### ADR-B5-004: No Carrier RTS API

```text
Context: Some carriers offer RTS/return APIs. Aramex does not.
Decision: B.5 does not add carrier RTS methods.
Alternatives: Add canReturnShipment capability (rejected: Aramex has no RTS API;
  premature abstraction).
Rationale: B.0 lock §9: "Carrier action: None in M7.3-B (Aramex has no RTS API)."
  Adding unused carrier methods is speculative engineering.
Consequences: RTS is entirely SCS-internal. Physical return is manually confirmed.
  Future carrier RTS API integration would be a separate milestone.
```

### ADR-B5-005: Authorization Architecture

```text
Context: RTS requires multi-party authorization (request + approve).
Decision: Merchant request + admin approve. Merchant may approve non-LOST/DAMAGED.
Alternatives: Merchant self-approve (rejected: B.0 says admin approve);
  Two-admin approval (rejected: too burdensome for routine RTS).
Rationale: B.0 lock §9: "ADMIN (primary), MERCHANT (request with admin approval
  for LOST/DAMAGED)." Balances operational efficiency with control.
Consequences: 4 endpoints (request, approve, reject, complete). LOST/DAMAGED
  requires ADMIN approval always.
```

### ADR-B5-006: Reconciliation Boundary

```text
Context: B.5 title includes "Reconciliation." Meaning is ambiguous.
Decision: B.5 reconciliation = state recording + event emission only.
Alternatives: Active reconciliation with worker (rejected: no defined reconciliation
  logic; physical return verification deferred to M7.3-C).
Rationale: Existing carrier reconciliation (carrier-reconciliation.service.ts)
  handles carrier state uncertainty — different concern. RTS reconciliation
  means providing the data foundation for future reconciliation.
Consequences: No new worker. No reconciliation status column. Outbox events
  are the reconciliation mechanism.
```

### ADR-B5-007: No Migration — Reuse Existing Columns

```text
Context: RTS metadata (timestamps, actors) could use dedicated columns.
Decision: No migration. Use existing exception columns + shipment_events.
Alternatives: Migration 0051 with rts_*_at columns (rejected: B.0 says "use
  existing exception columns"; shipment_events provides equivalent data).
Rationale: B.0 lock §36: "Database: Use existing exception columns."
  shipment_events records actor, timestamp, and metadata for each RTS transition.
  SLA tracking can be derived from shipment_events queries.
Consequences: No dedicated RTS timestamp columns. Actor tracking via
  shipment_events. Slightly more complex queries for RTS duration.
```

### ADR-B5-008: Transactional Concurrency Strategy

```text
Context: RTS operations race with delivery, cancellation, and retry.
Decision: Optimistic locking + in-TX state verification.
Alternatives: Pessimistic locking (SELECT FOR UPDATE) — rejected per codebase
  convention (prefer atomic conditional UPDATE per learned experience).
Rationale: Consistent with B.4 pattern (CR-01 through CR-05). Optimistic locking
  is proven in the codebase. Atomic conditional UPDATE serializes transitions
  without nested lock chains.
Consequences: All RTS transitions use UPDATE WHERE expected_state RETURNING id.
  Rows = 0 → 409 Conflict. Delivery flow checks exception_status before proceeding.
```

### ADR-B5-009: Cancellation Authority

```text
Context: Cancellation must interact with active RTS.
Decision: Cancellation always wins. Cancel TX closes all RTS states.
Alternatives: Block cancellation during active RTS (rejected: violates B.0 §11
  SCS cancellation authority); Require RTS cancellation first (rejected: adds
  unnecessary step).
Rationale: B.0 lock §11: SCS cancellation is authoritative. A package being
  returned does not prevent order cancellation. The RTS is simply closed.
Consequences: cancelOrder() WHERE clause extended. All RTS states closeable
  by cancellation. DELIVERY_EXCEPTION_CLOSED event records RTS was cancelled.
```

### ADR-B5-010: Master-Order Isolation

```text
Context: RTS on a sub-order shipment could affect master order status.
Decision: RTS does not affect master order status.
Alternatives: Add RETURNING master status (rejected: violates order FSM invariant;
  M7.3-C scope).
Rationale: RTS is shipment-level. Sub-order status is unchanged during RTS.
  Master aggregation is based on sub-order statuses. No change propagates.
Consequences: Master order may show "active" while a sub-order shipment is
  in RTS. This is correct — the order is still OUT_FOR_DELIVERY from the
  order's perspective.
```

---

## 30. Deferred / Out-of-Scope

| Item | Deferred To | Reason |
|------|-------------|--------|
| Inventory return-to-stock | M7.3-C | B.0 ADR-B0-009 explicit deferral |
| Financial refunds | M7.3-D | B.0 ADR-B0-009 explicit deferral |
| Buyer return workflow | M7.3-E | Separate milestone |
| Post-delivery returns | M7.3-C | B.5 is pre-delivery only |
| Carrier RTS APIs | Not authorized | Aramex has no RTS API |
| New carrier provider methods | Not authorized | Speculative engineering |
| Automatic carrier RTS | Not authorized | No carrier RTS API exists |
| Automatic redelivery | Not authorized | RTS blocks delivery |
| Photo evidence | Future | Not authorized in B.5 |
| Notification expansion | M7.3-F | Separate milestone |
| Recovery-token redesign | Explicitly deferred | Not B.5 scope |
| Poller cleanup | Explicitly deferred | Not B.5 scope |
| Unrelated tracking changes | Explicitly deferred | Not B.5 scope |
| Order FSM changes | Explicitly excluded | Core architectural invariant |
| Master-order FSM redesign | Explicitly excluded | Core architectural invariant |
| RTS metadata columns | Not needed | shipment_events sufficient |
| Active reconciliation | M7.3-C | B.5 is state recording only |
| RTS timeout/SLA automation | Not authorized | Manual admin intervention |

---

## 31. Release / Verification Gates

B.5 cannot be considered complete until:

| Gate | Criteria |
|------|----------|
| Architecture Audit | PASS / GO WITH CONDITIONS |
| Business/Architecture Lock | LOCKED |
| Implementation | COMPLETE |
| Independent Runtime Verification | PASS |
| TypeScript | 0 errors |
| Build | 0 issues |
| PostgreSQL | All B.5 tests pass |
| Concurrency | 100-concurrent RTS tests pass |
| Security | All tenant/IDOR/role tests pass |
| Regression | All B.1–B.4 suites green |
| Scope Compliance | No out-of-scope additions |
| Migration Integrity | N/A (no migration) |
| Release Closure | PASS |

---

## 32. Final Authorization

### Seven Audit Conditions — Resolution Status

| # | Condition | Resolved As | Reference |
|---|-----------|-------------|-----------|
| 1 | RTS state model | Three-state (RTS_PENDING → RTS_IN_PROGRESS → RTS_COMPLETED) | BD-B5-001, ADR-B5-002 |
| 2 | Reconciliation scope | State recording + event emission only | BD-B5-010, ADR-B5-006 |
| 3 | Migration decision | No migration — use existing columns + shipment_events | ADR-B5-007 |
| 4 | RTS rejection | RTS_PENDING → OPEN; notes mandatory | BD-B5-005 |
| 5 | Physical return confirmation | Merchant + Admin; no inventory movement | BD-B5-006 |
| 6 | Cancellation TX extension | Extend WHERE to include all RTS states | BD-B5-007, ADR-B5-009 |
| 7 | LOST exception RTS | Admin investigation → admin direct RTS | BD-B5-009 |

### Business Decision Summary

```text
BD-B5-001: Three-state RTS lifecycle          — LOCKED
BD-B5-002: RTS triggers (REFUSED + MAX)       — LOCKED
BD-B5-003: RTS authorization                  — LOCKED
BD-B5-004: RTS approval                       — LOCKED
BD-B5-005: RTS rejection                       — LOCKED
BD-B5-006: Physical return confirmation        — LOCKED
BD-B5-007: Cancellation interaction            — LOCKED
BD-B5-008: Delivery interaction                — LOCKED
BD-B5-009: LOST handling                       — LOCKED
BD-B5-010: Reconciliation scope                — LOCKED

Business Decisions: 10/10
```

### Architecture Decision Summary

```text
ADR-B5-001: Shipment-level RTS                — LOCKED
ADR-B5-002: Three-state RTS model             — LOCKED
ADR-B5-003: No inventory movement             — LOCKED
ADR-B5-004: No carrier RTS API                — LOCKED
ADR-B5-005: Authorization architecture         — LOCKED
ADR-B5-006: Reconciliation boundary            — LOCKED
ADR-B5-007: No migration                       — LOCKED
ADR-B5-008: Transactional concurrency          — LOCKED
ADR-B5-009: Cancellation authority             — LOCKED
ADR-B5-010: Master-order isolation             — LOCKED

Architecture Decisions: 10/10
```

### Verification

```text
Open business decisions: 0
Open blocking architectural decisions: 0
All 7 audit conditions: RESOLVED
All 10 business decisions: LOCKED
All 10 architecture decisions: LOCKED
Parent B.0 lock contradictions: NONE
B.4 lock contradictions: NONE
```

---

```
========================================
M7.3-B.5 BUSINESS/ARCHITECTURE LOCK COMPLETE
========================================

STATUS: LOCKED

Business Decisions: 10/10
  BD-B5-001 through BD-B5-010
Architecture Decisions: 10/10
  ADR-B5-001 through ADR-B5-010
Open Business Decisions: 0
Open Blocking Decisions: 0

Seven Audit Conditions: ALL RESOLVED
  Condition 1 (RTS state model):        Three-state per B.0 lock
  Condition 2 (Reconciliation scope):   State recording + events only
  Condition 3 (Migration decision):     No migration — existing columns
  Condition 4 (RTS rejection):          RTS_PENDING → OPEN
  Condition 5 (Physical confirmation):  Merchant + Admin
  Condition 6 (Cancellation TX):        Extended to all RTS states
  Condition 7 (LOST handling):          Admin investigation → admin RTS

Implementation: NOT YET PERFORMED
Implementation Authorization: GRANTED

NEXT STAGE:
M7.3-B.5 IMPLEMENTATION
========================================
```
