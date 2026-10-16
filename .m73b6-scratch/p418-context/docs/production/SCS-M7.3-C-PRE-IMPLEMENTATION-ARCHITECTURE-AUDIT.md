# SCS-M7.3-C — Pre-Implementation Architecture Audit

## Returns (Inventory Return-to-Stock + RTS Physical Handling)

| Field | Value |
|-------|-------|
| Milestone | M7.3-C |
| Title | Returns — Inventory Return-to-Stock + RTS Physical Handling |
| Phase | Pre-Implementation Architecture Audit — READ-ONLY |
| Status | **COMPLETE** |
| Verdict | **GO WITH CONDITIONS** (8 conditions) |
| Date | 2026-10-02 |
| Branch | develop |
| HEAD | 5c6649dc2334e278c808b44c558b020db7e6db7b |
| Predecessor | B.5 CLOSED/PASS |
| Parent Lock | SCS-M7.3-B-BUSINESS-RULES-ARCHITECTURE-LOCK.md (LOCKED) |

---

## 1. Audit Identity

This audit determines whether the SCS shipping/delivery/inventory architecture can safely progress from the B.5 closed state into M7.3-C — Returns (inventory return-to-stock + RTS physical handling). It addresses:

1. The B.5 RTS foundation — what is already in place for return-to-stock
2. The inventory service's existing movement vocabulary and RETURN type
3. The `settleStockForStatus()` helper — what it currently handles and what it does not
4. The `completeRTS()` method — current lack of inventory movement
5. The B.0 lock's explicit deferral of inventory return to M7.3-C
6. The B.5 lock's deferral of return condition and return quantity recording
7. Authorization model for return-to-stock operations
8. Concurrency between return-to-stock and cancellation/delivery/other inventory operations
9. Multi-item order partial return implications
10. Open business decisions from the B.0 and B.5 locks

---

## 2. Read-Only Statement

**NO implementation changes were made.** This audit is strictly read-only. No source code, tests, migrations, configuration, or documentation files were modified. This document is the only artifact produced.

---

## 3. Authoritative Roadmap Evidence

### B.0 Lock §27 (Explicitly Preserved)

```text
M7.3-C = Returns (inventory return-to-stock, RTS physical handling)
M7.3-D = Refunds (financial refund automation)
M7.3-E = Disputes (buyer dispute flow)
M7.3-F = Notifications (buyer/merchant notification expansion)
```

### B.0 Lock ADR-B0-009 (RTS Boundary)

```text
Title: M7.3-B records RTS state; inventory/financial handling deferred
Status: LOCKED
Decision: M7.3-B records RTS operational state (RTS_PENDING → RTS_COMPLETED) on shipments.
          No inventory return-to-stock. No financial refund. These are M7.3-C and M7.3-D.
Future migration impact: M7.3-C adds return-to-stock action on RTS_COMPLETED.
```

### B.0 Lock — Multiple RTS Scenarios

```text
RECIPIENT_REFUSED → RTS:
  Inventory action: DEFERRED to M7.3-C

DAMAGED → RTS:
  Inventory effect: DEFERRED to M7.3-C

LOST → RTS:
  Inventory effect: DEFERRED to M7.3-C (stock was released at cancel or still reserved)
```

### B.0 Lock §38 (Non-Goals for M7.3-B)

```text
This milestone does not implement return-to-stock.
```

### B.5 Lock BD-B5-006 (Physical Return Confirmation)

```text
Return condition is NOT recorded in B.5 (deferred to M7.3-C).
Return quantity is NOT recorded in B.5 (deferred to M7.3-C).
```

### B.5 Lock BD-B5-010 (Reconciliation Scope)

```text
Physical return verification (did the goods actually arrive back?) is deferred to M7.3-C.
```

### Migration 0005 (Inventory Foundation)

```sql
-- Movement types include:
--   RETURN   — customer return restocked
-- Sign convention: positive = in (RETURN writes positive quantity)
```

### Migration 0020 (Stock Movement Constraint)

```sql
CHECK (movement_type IN ('ADJUST', 'RESERVE', 'RELEASE', 'SALE', 'CANCEL', 'IMPORT', 'RETURN'))
```

**RETURN is already a valid movement type in the database constraint.** No schema migration is required to enable RETURN movements.

---

## 4. Repository Baseline

```text
Branch:           develop
HEAD:             5c6649dc2334e278c808b44c558b020db7e6db7b
Working tree:     clean (2 untracked B.5 closure documents)
Migrations:       0001–0050 (latest: 0050_delivery_exceptions.sql)
Latest commit:    fix(tests): update OUT_FOR_DELIVERY cancel tests
```

### Milestone Commit Chain

```text
5c6649d B.5 — OUT_FOR_DELIVERY cancel test updates
f6b7b22 B.5 — OUT_FOR_DELIVERY cancellation support
a546522 B.5 — postgres spec fixes
07ff0f9 B.5 — SQL parameter type fix
ee77025 B.5 — inventory column name fix
0d3eb70 B.5 — RTS + Reconciliation implementation
```

---

## 5. Previous Milestone Baseline

**M7.3-B.5 — RTS + Reconciliation: CLOSED / PASS**

B.5 delivered:
- Three-state RTS lifecycle: RTS_PENDING → RTS_IN_PROGRESS → RTS_COMPLETED
- RTS request/approve/reject/complete endpoints
- LOST admin direct flow
- Delivery blocking during active RTS
- Cancellation closes all RTS states
- Shipment events + outbox events for full audit trail
- **Deliberately NO inventory movement** (deferred to M7.3-C)

B.5 final state:
- `completeRTS()`: transitions RTS_IN_PROGRESS → RTS_COMPLETED, emits events, **no inventory movement**
- `settleStockForStatus()`: handles CANCELLED/REJECTED (RELEASE) and DELIVERED (SALE) only
- `EXCEPTION_TRANSITIONS`: RTS_COMPLETED → CLOSED (cancellation)
- `RTS_ACTIVE_STATES`: [RTS_PENDING, RTS_IN_PROGRESS, RTS_COMPLETED]
- Outbox events: `shipment.rts_requested`, `shipment.rts_approved`, `shipment.rts_completed`

---

## 6. Successor Milestone Objective

**Business objective:** When an RTS reaches RTS_COMPLETED (physical return confirmed), record the inventory return-to-stock so the warehouse's on-hand quantity accurately reflects the returned goods. This closes the loop that B.5 deliberately opened — B.5 records the RTS state; M7.3-C acts on the physical consequence.

**Scope (from B.0 lock):**
- Inventory return-to-stock on RTS completion
- RTS physical handling (condition assessment, quantity tracking)

**Not in scope (from B.0 lock):**
- Financial refund automation (M7.3-D)
- Buyer dispute flow (M7.3-E)
- Notification expansion (M7.3-F)

---

## 7. Scope

### IN SCOPE (preliminary — subject to lock)

1. Return-to-stock inventory movement (RETURN type) on RTS completion
2. Return quantity tracking (how many units returned)
3. Return condition recording (what state the returned goods are in)
4. Warehouse routing (which warehouse receives the returned stock)
5. Order status interaction (does return change order status?)
6. Partial return support (returning some items but not all)
7. LOST exception return handling (stock was released — what happens?)
8. DAMAGED return handling (return condition affects stock disposition)
9. Outbox events for downstream consumption
10. Shipment events for audit trail

### OUT OF SCOPE (preliminary — subject to lock)

- Financial refund processing (M7.3-D)
- Buyer-initiated returns (M7.3-E)
- Post-delivery returns not preceded by RTS
- Carrier return shipping (M7.3-C does not call carrier APIs)
- Return shipping labels
- Return authorization workflow (RMA)
- Automatic redelivery
- Photo evidence
- Notification expansion

---

## 8. Dependencies

| Dependency | Status | Notes |
|-----------|--------|-------|
| M7.3-B.5 (RTS + Reconciliation) | CLOSED / PASS | RTS lifecycle provides the trigger |
| M7.3-B.4 (Delivery Exceptions) | CLOSED / PASS | Exception foundation |
| M7.3-B.2 (Merchant Cancellation) | CLOSED / PASS | Cancellation closes RTS + releases stock |
| M7.3-B.1 (Concurrency Hardening) | CLOSED / PASS | Optimistic locking, atomic settlement |
| Inventory service | Existing | RETURN type already in constraint |
| Outbox dispatcher | Existing | Transactional event publishing |

### B.5 Capabilities M7.3-C Depends On

| Capability | Present? | Evidence |
|-----------|----------|---------|
| RTS_COMPLETED state | Yes | `EXCEPTION_TRANSITIONS['RTS_IN_PROGRESS'] = ['RTS_COMPLETED']` |
| `completeRTS()` method | Yes | orders.service.ts L2462 |
| `shipment.rts_completed` outbox event | Yes | Emitted inside completeRTS TX |
| RTS_COMPLETED shipment event | Yes | `RTS_COMPLETED` event type |
| Optimistic locking on RTS transitions | Yes | `UPDATE WHERE exception_status = 'RTS_IN_PROGRESS'` |
| `settleStockForStatus()` helper | Yes | Handles RELEASE and SALE |
| RETURN movement type in constraint | Yes | migration 0020 CHECK constraint |
| `stock_movements` ledger | Yes | migration 0005 |

**All prerequisites are present and verified.**

---

## 9. Current Architecture

### Inventory Service (`inventory.service.ts`)

| Method | Movement Type | When |
|--------|--------------|------|
| `reserveStock()` | RESERVE (-qty) | Order accepted |
| `releaseStock()` | RELEASE (+qty) | Order cancelled/rejected |
| `settleStockForStatus()` → SALE | SALE (-qty) | Order delivered |
| `adjustStock()` | ADJUST (±qty) | Manual correction |
| `createItem()` | IMPORT (+qty) | Initial stock load |
| `transferStock()` | ADJUST (±qty) | Warehouse transfer |
| **None** | **RETURN (+qty)** | **Not yet implemented** |

### Stock Settlement (`settleStockForStatus()`)

Current behavior:
- `CANCELLED` / `REJECTED` → RELEASE movement (restores qty_reserved)
- `DELIVERED` → SALE movement (deducts qty_on_hand + qty_reserved)
- Idempotent: nets outstanding RESERVE/RELEASE/SALE per inventory item
- Uses `SELECT ... FOR UPDATE` for row-level locking
- Works inside caller's transaction (no nested TX)

### Order FSM (`TRANSITIONS`)

```text
OUT_FOR_DELIVERY → [DELIVERED]
DELIVERED → [COMPLETED, DISPUTED]
COMPLETED → [DISPUTED]
CANCELLED → [] (terminal)
```

### Exception FSM (`EXCEPTION_TRANSITIONS`)

```text
OPEN → [RETRY_PENDING, RESOLVED, CLOSED, RTS_PENDING]
RETRY_PENDING → [OPEN, CLOSED]
RESOLVED → []
CLOSED → []
RTS_PENDING → [RTS_IN_PROGRESS, OPEN]
RTS_IN_PROGRESS → [RTS_COMPLETED]
RTS_COMPLETED → [CLOSED]
```

### Shipment Schema (relevant columns)

```text
exception_status: VARCHAR(24) — NULL/OPEN/RETRY_PENDING/RESOLVED/CLOSED/RTS_*
exception_type: VARCHAR(30) — 8 canonical types
exception_notes: TEXT
exception_at: TIMESTAMPTZ
exception_resolved_at: TIMESTAMPTZ
delivery_attempts: INTEGER (default 0)
max_delivery_attempts: INTEGER (default 3)
```

### Order Items Schema (relevant columns)

```text
quantity: INTEGER — ordered quantity
qty_confirmed: INTEGER — merchant-confirmed quantity
unit_price_minor: BIGINT — immutable price snapshot
line_total_minor: BIGINT — immutable line total
offer_id: UUID — which offer priced this line
offer_snapshot: JSONB — immutable offer terms at checkout
```

### Stock Movements Schema

```text
movement_type: VARCHAR(16) — CHECK constraint: ADJUST|RESERVE|RELEASE|SALE|CANCEL|IMPORT|RETURN
quantity: INTEGER — positive = in, negative = out
reference_type: VARCHAR(40) — ORDER, IMPORT_JOB, ADJUSTMENT, etc.
reference_id: UUID — FK to referencing entity
reason: TEXT — human-readable reason
performed_by: UUID — who performed the movement
```

---

## 10. Domain Model

### Return-to-Stock Aggregate Relationships

```text
Shipment (RTS_COMPLETED)
  └── Order (OUT_FOR_DELIVERY or CANCELLED)
       └── OrderItems (quantity, qty_confirmed, variant_id)
            └── InventoryItem (variant_id, warehouse_id, qty_on_hand, qty_reserved)
                 └── StockMovement (RETURN, +qty, reference: ORDER/SHIPMENT)
```

### Key Observation

The return-to-stock operation must bridge three aggregates:
1. **Shipment** — has the RTS_COMPLETED state and exception_type (which encodes return condition)
2. **Order/OrderItems** — has the original ordered quantities and variant references
3. **InventoryItem** — receives the RETURN movement

---

## 11. FSM Analysis

### Current Exception FSM (post-B.5)

```text
NULL → OPEN (report exception)
OPEN → RETRY_PENDING (authorize retry)
OPEN → RESOLVED (delivery auto-resolve)
OPEN → CLOSED (cancellation)
OPEN → RTS_PENDING (request RTS)
RETRY_PENDING → OPEN (retry execution)
RETRY_PENDING → CLOSED (cancellation)
RTS_PENDING → RTS_IN_PROGRESS (approve)
RTS_PENDING → OPEN (reject)
RTS_IN_PROGRESS → RTS_COMPLETED (complete)
RTS_COMPLETED → CLOSED (cancellation)
```

### Proposed M7.3-C Extension

M7.3-C does NOT change the exception FSM. The RTS lifecycle remains identical. The return-to-stock action occurs **as a consequence of RTS_COMPLETED** — it is a side effect of the completion, not a new FSM state.

### Order FSM Interaction

**Critical question:** Does return-to-stock change the order status?

Current order FSM has no RETURN/RETURNING status. The order is:
- `OUT_FOR_DELIVERY` during RTS (B.5 lock: sub-order remains OUT_FOR_DELIVERY)
- `CANCELLED` if cancelled (stock already released)

**Option A:** Order status remains unchanged. Return-to-stock is a shipment/inventory concern only.
**Option B:** New transition `OUT_FOR_DELIVERY → RETURNED` or `DELIVERED → RETURNED`.
**Option C:** Return-to-stock happens at RTS_COMPLETED; order transitions to a new status only after full return.

This is **OBD-001** (see §23).

### Cross-FSM Interactions

| Scenario | Exception FSM | Order FSM | Inventory | Notes |
|----------|--------------|-----------|-----------|-------|
| RTS completed (RECIPIENT_REFUSED) | → RTS_COMPLETED | OUT_FOR_DELIVERY (unchanged?) | RETURN +qty | Stock comes back |
| RTS completed (LOST) | → RTS_COMPLETED | OUT_FOR_DELIVERY or CANCELLED | ??? | Package may not physically return |
| RTS completed (DAMAGED) | → RTS_COMPLETED | OUT_FOR_DELIVERY | RETURN +qty? ADJUST? | Depends on condition |
| Cancel after RTS_COMPLETED | → CLOSED | → CANCELLED | RELEASE already done? | Stock already released at cancel |
| RTS completed after cancel | Cannot happen — cancel closes RTS | CANCELLED | RELEASE done | No return needed |

### Cancellation Interaction

If order is cancelled BEFORE RTS completion:
- Cancel closes RTS → CLOSED
- Cancel releases stock → RELEASE movement
- No RTS_COMPLETED can occur (RTS is closed)
- No return-to-stock needed

If RTS completes BEFORE cancel:
- RTS_COMPLETED → RETURN movement created
- Then cancel → CLOSED + RELEASE movement
- **Risk: double stock adjustment** — RETURN added stock, RELEASE tries to release reservation

This is **OBD-005** (see §23).

### Delivery Interaction

If delivery occurs while RTS is pending:
- Delivery resolves exception → RESOLVED
- RTS cannot proceed (exception is resolved)
- No return needed

If RTS completes and then delivery is attempted:
- Delivery is blocked during active RTS (B.5)
- After RTS_COMPLETED, delivery is still blocked
- Admin must reject RTS first (→ OPEN) to re-enable delivery

---

## 12. Database / Schema Analysis

### Option A: Reuse Existing Schema (No Migration)

**RETURN movement type already exists** in the CHECK constraint (migration 0020).

The `stock_movements` table can already accept RETURN rows:
- `movement_type = 'RETURN'`
- `quantity = +N` (positive = stock in)
- `reference_type = 'ORDER'` or `'SHIPMENT'`
- `reference_id = orderId` or `shipmentId`
- `reason = 'RTS return: ...'`
- `metadata = { exceptionType, condition, rtsCompletedAt }`

The `inventory_items.qty_on_hand` can be incremented directly.

**No migration required for basic return-to-stock.**

### Option B: New Migration for Return Metadata

If M7.3-C needs dedicated return tracking columns:
- `return_condition` on shipments (what condition are returned goods in?)
- `return_quantity` on order_items (how many units returned?)
- `returned_at` timestamp

Migration 0051 would add these columns.

### Option C: Extend Existing Structures

Use `shipments.metadata` JSONB for return condition.
Use `stock_movements.metadata` JSONB for return details.
Use `shipment_events` for return audit trail.

### Recommendation

**Option A + C combined** for the minimum viable return:
- Use existing RETURN movement type
- Use JSONB metadata for return condition and quantity
- Use shipment events for audit trail
- No migration required initially

**Option B** if the lock determines that dedicated columns are needed for query performance or data integrity (e.g., partial return tracking on order_items).

---

## 13. API Design Analysis

### Proposed Endpoint Candidates (subject to lock)

#### POST /v1/shipments/:id/rts/complete (extended)

Extend the existing `completeRTS()` to also perform return-to-stock:

```text
Current: RTS_IN_PROGRESS → RTS_COMPLETED + events
Proposed: RTS_IN_PROGRESS → RTS_COMPLETED + events + RETURN movement
```

**Alternative:** Separate endpoint for return-to-stock after RTS completion.

#### POST /v1/shipments/:id/return (new)

```text
Method: POST
Auth: JwtAuthGuard + PermissionsGuard
Permission: fulfillment:shipments:write
Actors: MERCHANT (own store), ADMIN
Body: { items?: [{ orderItemId, quantity }], condition?: string, notes?: string }
Success: 201 Created
```

This would allow:
- Explicit return after RTS completion
- Partial returns (some items but not all)
- Condition recording at return time

### Idempotency

- Duplicate return on same shipment → idempotent (check for existing RETURN movement)
- Return on non-RTS_COMPLETED shipment → 409
- Return on already-returned shipment → 200 (idempotent)

### Transaction Boundary

Return-to-stock must be atomic:
- RETURN movement + qty_on_hand increment + shipment event + outbox event in same TX
- Optimistic lock: WHERE exception_status = 'RTS_COMPLETED' (or similar guard)

---

## 14. Security Analysis

### Authorization Matrix (proposed — subject to lock)

| Actor | Return-to-Stock | Notes |
|-------|----------------|-------|
| ADMIN | Yes (any) | Platform staff |
| MERCHANT | Yes (own store) | Store-scoped |
| DRIVER | No | No return authority |
| BUYER | No | Buyer returns are M7.3-E |

### Tenant Isolation

- Return must verify shipment belongs to caller's store/org
- Same `assertShipmentAccessibleForException()` pattern from B.5
- Cross-tenant return → 403/404

### IDOR Risks

- Shipment ID in URL must be validated against caller's scope
- Order items in return payload must belong to the shipment's order
- Inventory item must belong to caller's warehouse

---

## 15. Concurrency Analysis

### Race 1: Return-to-Stock vs Return-to-Stock

| Aspect | Detail |
|--------|--------|
| Competing operations | Two concurrent return requests on same shipment |
| Interleaving | Both read RTS_COMPLETED, both attempt RETURN |
| Desired outcome | Exactly one succeeds; duplicate is idempotent 200 |
| Current protection | None (no return exists yet) |
| Missing protection | Optimistic guard: WHERE exception_status = 'RTS_COMPLETED' AND no existing RETURN movement for this reference |
| PostgreSQL test required | Yes — 100-concurrent return test |

### Race 2: Return-to-Stock vs Cancellation

| Aspect | Detail |
|--------|--------|
| Competing operations | Return-to-stock on RTS_COMPLETED shipment vs order cancellation |
| Interleaving | Return adds stock, cancel tries to release reservation |
| Desired outcome | Cancellation wins (per B.0 INV-06) or return wins (RTS_COMPLETED first) |
| Current protection | Cancellation closes RTS states, but RTS_COMPLETED → CLOSED + cancel RELEASE |
| Missing protection | Transaction ordering: if return commits first, cancel must not double-release |
| PostgreSQL test required | Yes |

### Race 3: Return-to-Stock vs Inventory Adjustment

| Aspect | Detail |
|--------|--------|
| Competing operations | Return increments qty_on_hand while manual adjustment modifies same row |
| Interleaving | Both read qty_on_hand, both write |
| Desired outcome | Both succeed with correct final quantity |
| Current protection | `SELECT ... FOR UPDATE` in reserveStock/releaseStock |
| Missing protection | Same FOR UPDATE pattern needed for return |
| PostgreSQL test required | Yes |

### Race 4: Return-to-Stock vs New Reservation

| Aspect | Detail |
|--------|--------|
| Competing operations | Return adds stock while new order reserves same inventory item |
| Interleaving | Return reads qty_on_hand = 5, new reserve reads qty_reserved = 5, both update |
| Desired outcome | Serial execution via row lock; both succeed with correct totals |
| Current protection | FOR UPDATE in reserveStock |
| Missing protection | Return must also use FOR UPDATE on inventory_items row |
| PostgreSQL test required | Yes |

### Race 5: RTS Completion (with return) vs Delivery

| Aspect | Detail |
|--------|--------|
| Competing operations | completeRTS() with return vs deliverOrder() |
| Interleaving | Both try to modify shipment and inventory |
| Desired outcome | Exactly one wins (B.5 already handles RTS vs delivery race) |
| Current protection | B.5 delivery blocking when RTS active |
| Missing protection | Return movement must be inside the same TX as RTS completion |
| PostgreSQL test required | Yes |

---

## 16. Transaction Analysis

### Current Transaction Boundaries

| Operation | TX Scope |
|-----------|---------|
| `completeRTS()` | shipment update + shipment event + outbox event |
| `settleStockForStatus()` | inventory update + movement insert (inside caller TX or own TX) |
| `cancelOrder()` | optimistic lock + inventory settlement + shipment cancel + exception close + events + outbox |

### Proposed M7.3-C Transaction

Return-to-stock must extend `completeRTS()` or create a new TX:

```text
BEGIN TX
  1. Optimistic lock: UPDATE shipments WHERE exception_status = 'RTS_IN_PROGRESS'
  2. Set exception_status = 'RTS_COMPLETED'
  3. FOR UPDATE on inventory_items rows
  4. Increment qty_on_hand for each returned item
  5. Insert RETURN movement for each item
  6. Insert RTS_COMPLETED shipment event
  7. Insert shipment.rts_completed outbox event
  8. Insert shipment.return_to_stock outbox event (new?)
COMMIT
```

### Atomicity Requirement

Return-to-stock and RTS completion must be in the **same transaction**. If return is a separate step, there is a window where RTS is completed but stock has not been returned — violating the invariant that RTS_COMPLETED means "goods are back."

---

## 17. Event / Outbox Analysis

### Events Required by M7.3-C

| Event | Type | Purpose |
|-------|------|---------|
| `RETURN_TO_STOCK` | Shipment event | Audit trail: stock was returned |
| `shipment.return_to_stock` | Outbox event | Downstream consumers (future M7.3-D refund trigger) |

### Events from Prior Milestones (unchanged)

| Event | When | M7.3-C Impact |
|-------|------|---------------|
| `RTS_REQUESTED` | requestRTS() | No change |
| `RTS_APPROVED` | approveRTS() | No change |
| `RTS_COMPLETED` | completeRTS() | No change (still emitted) |
| `shipment.rts_completed` | completeRTS() | No change (still emitted) |

### Event Payload Requirements

`shipment.return_to_stock` payload:
```json
{
  "shipmentId": "...",
  "orderId": "...",
  "exceptionType": "RECIPIENT_REFUSED",
  "returnedItems": [
    { "orderItemId": "...", "variantId": "...", "quantity": 2, "condition": "GOOD" }
  ],
  "warehouseId": "...",
  "performedBy": "..."
}
```

### Downstream Consumers

- M7.3-D (refunds) will consume `shipment.return_to_stock` to determine refund eligibility
- Inventory low-stock alerts may need to re-evaluate after RETURN

---

## 18. Inventory Boundary

### What M7.3-C Must Handle

| Movement | When | Sign |
|----------|------|------|
| RETURN | RTS completed, goods physically returned | +qty_on_hand |

### What M7.3-C Must NOT Do

| Movement | Deferred To |
|----------|------------|
| Financial refund | M7.3-D |
| Stock write-off for damaged goods | M7.3-C or M7.3-D (OBD) |
| Return shipping inventory | N/A |

### RETURN vs SALE Interaction

For the same order:
- SALE: -qty_on_hand, -qty_reserved (on delivery)
- RETURN: +qty_on_hand (on RTS completion)

**Net effect:** Stock is restored. qty_reserved is NOT affected by RETURN (it was already decremented by SALE or RELEASE).

### LOST Exception Return

When LOST RTS completes:
- Stock may have been RELEASED at cancellation
- Physical return may not actually occur (package is lost)
- **OBD-003:** Should LOST RTS completion trigger RETURN movement?

### DAMAGED Exception Return

When DAMAGED RTS completes:
- Goods are physically returned but may be unsellable
- **OBD-004:** Should RETURN go to qty_on_hand (sellable) or require ADJUST (write-off)?

---

## 19. Financial / Refund Boundary

M7.3-C does NOT implement refunds. However, the return-to-stock action creates the data foundation for M7.3-D:

- `shipment.return_to_stock` outbox event signals that goods were physically returned
- RETURN movement in stock_movements provides audit trail
- Return condition metadata enables M7.3-D to determine refund eligibility

**No financial tables are modified in M7.3-C.**

---

## 20. Carrier Boundary

M7.3-C does NOT interact with carriers:
- No carrier return shipping API
- No carrier return tracking
- No carrier webhook for returns
- Return-to-stock is purely SCS-internal

---

## 21. Reconciliation Analysis

M7.3-C "reconciliation" refers to:
- **Inventory reconciliation:** Ensuring qty_on_hand reflects physical reality after RTS
- **State recording:** The RETURN movement records the inventory consequence of RTS

M7.3-C does NOT introduce:
- Active reconciliation worker
- Scheduled reconciliation
- Carrier reconciliation
- Financial reconciliation

---

## 22. Testing Strategy

### Unit Tests

| Category | Tests |
|----------|-------|
| Authorization | DRIVER/BUYER rejected from return; MERCHANT own-store; ADMIN any |
| Validation | Return on non-RTS_COMPLETED shipment rejected |
| FSM | Return does not change exception FSM |
| Inventory | RETURN movement type, sign convention, metadata |

### PostgreSQL Integration Tests

| Category | Tests |
|----------|-------|
| Return-to-stock | qty_on_hand incremented, RETURN movement created |
| Idempotency | Duplicate return → 200, no double movement |
| Partial return | Return subset of order items |
| LOST return | Return behavior for LOST exception |
| DAMAGED return | Return behavior for DAMAGED exception |
| Concurrency | 100-concurrent returns → 1 success / 99 idempotent |
| Return vs cancel | Cancellation wins or return wins (deterministic) |
| Return vs reserve | FOR UPDATE serializes correctly |
| Event atomicity | RETURN movement + event + outbox in same TX |

### Regression

All previous milestones must remain green:
- B.1 (concurrency)
- B.2 (merchant cancellation)
- B.3.x (carrier operations)
- B.3.4 (race closure)
- B.4 (delivery exceptions)
- B.5 (RTS lifecycle)
- Shipping, Orders, Inventory unit suites

### Security

- Authorization for return endpoints
- Tenant isolation on return operations
- IDOR: cross-merchant return rejected

---

## 23. Open Business Decisions

### OBD-001: Order Status on Return

```text
OBD-001
Question: Does return-to-stock change the order status?
Current ambiguity: B.5 lock says order remains OUT_FOR_DELIVERY during RTS. After RTS_COMPLETED + return, does the order transition to a new status?
Relevant roadmap evidence: B.0 §27 "Returns (inventory return-to-stock, RTS physical handling)"
Affected behavior: Order FSM, master-order aggregation, buyer visibility
Affected architecture: TRANSITIONS map, recalculateMasterOrderStatus()
Potential consequences: New order status (RETURNED) vs. no status change (return is shipment/inventory concern only)
Blocking: YES — determines whether order FSM is extended
```

### OBD-002: Automatic vs. Explicit Return

```text
OBD-002
Question: Is return-to-stock automatic on RTS completion, or a separate explicit action?
Current ambiguity: B.0 ADR-B0-009 says "M7.3-C adds return-to-stock action on RTS_COMPLETED." This could mean automatic side-effect or separate action triggered after completion.
Relevant roadmap evidence: ADR-B0-009 "return-to-stock action on RTS_COMPLETED"
Affected behavior: completeRTS() method, API surface, inventory timing
Affected architecture: orders.service.ts completeRTS() or new returnStock() method
Potential consequences: Automatic = simpler but less flexible; Explicit = more control but more API surface
Blocking: YES — determines implementation approach
```

### OBD-003: LOST Return Behavior

```text
OBD-003
Question: Should LOST RTS completion trigger a RETURN movement?
Current ambiguity: LOST packages may not physically return. B.0 says "stock was released at cancel or still reserved." If stock was already RELEASED, a RETURN would double-count.
Relevant roadmap evidence: B.0 "Inventory effect: DEFERRED to M7.3-C (stock was released at cancel or still reserved)"
Affected behavior: LOST RTS completion flow, inventory accuracy
Affected architecture: completeRTS() or requestAndApproveLostRTS()
Potential consequences: RETURN on LOST could inflate stock if stock was already released at cancel
Blocking: YES — LOST is one of three RTS trigger types
```

### OBD-004: DAMAGED Return Condition

```text
OBD-004
Question: How does return condition affect inventory disposition?
Current ambiguity: B.5 BD-B5-006 defers "return condition" to M7.3-C. DAMAGED goods may not be sellable.
Relevant roadmap evidence: B.5 BD-B5-006 "Return condition is NOT recorded in B.5 (deferred to M7.3-C)"
Affected behavior: RETURN movement qty_on_hand vs. ADJUST write-off
Affected architecture: inventory.service.ts, stock_movements metadata
Potential consequences: Returning damaged goods to sellable stock inflates available quantity
Blocking: YES — affects inventory accuracy
```

### OBD-005: Return vs. Cancellation Ordering

```text
OBD-005
Question: What happens when cancellation and return-to-stock race?
Current ambiguity: If RTS completes and creates RETURN, then cancel creates RELEASE, stock could be double-adjusted.
Relevant roadmap evidence: B.0 INV-06 "cancellation authority"
Affected behavior: cancelOrder(), completeRTS(), inventory accuracy
Affected architecture: Transaction ordering, CANCELLABLE_EXCEPTION_STATES
Potential consequences: Double stock adjustment (RETURN + RELEASE for same order)
Blocking: YES — data integrity risk
```

### OBD-006: Partial Return

```text
OBD-006
Question: Can a subset of order items be returned?
Current ambiguity: Orders can have multiple items. RTS is per-shipment (per-order). Can the merchant return 2 of 5 items?
Relevant roadmap evidence: B.0 §27 "Returns" — no granularity specified
Affected behavior: API design, inventory movement per item, order status
Affected architecture: order_items, stock_movements reference granularity
Potential consequences: Partial return adds complexity but matches real-world return scenarios
Blocking: NO — can default to full-order return initially
```

### OBD-007: Return Quantity Tracking

```text
OBD-007
Question: How is return quantity tracked?
Current ambiguity: order_items has `quantity` and `qty_confirmed`. Return may return all or partial. Where is "qty_returned" recorded?
Relevant roadmap evidence: B.5 BD-B5-006 "Return quantity is NOT recorded in B.5 (deferred to M7.3-C)"
Affected behavior: Partial return support, refund eligibility (M7.3-D)
Affected architecture: order_items schema, stock_movements reference
Potential consequences: Without dedicated column, must query stock_movements to determine returned quantity
Blocking: NO — can use stock_movements as source of truth initially
```

### OBD-008: Return Condition Recording

```text
OBD-008
Question: Where is return condition recorded?
Current ambiguity: B.5 defers return condition to M7.3-C. Options: shipment column, shipment metadata JSONB, stock_movements metadata, separate table.
Relevant roadmap evidence: B.5 BD-B5-006 "Return condition is NOT recorded in B.5 (deferred to M7.3-C)"
Affected behavior: Condition-based disposition (sellable vs. write-off)
Affected architecture: shipments schema, stock_movements metadata
Potential consequences: Dedicated column enables querying; JSONB is flexible but slower to query
Blocking: NO — can use JSONB metadata initially
```

---

## 24. Architecture Decision Records Required

### ADR-C0-001: Return Trigger Mechanism

```text
ADR-C0-001
Decision required: How is return-to-stock triggered?
Context: B.0 ADR-B0-009 says "M7.3-C adds return-to-stock action on RTS_COMPLETED"
Current architecture: completeRTS() transitions to RTS_COMPLETED with no inventory effect
Options:
  (a) Automatic side-effect of completeRTS() — RETURN movement inside same TX
  (b) Separate endpoint POST /shipments/:id/return — explicit action after RTS_COMPLETED
  (c) Outbox consumer — async reaction to shipment.rts_completed event
Trade-offs: (a) simplest, atomic, but no separate condition input; (b) more flexible, allows condition/quantity input; (c) decoupled but eventual consistency
Potential impact: API surface, transaction boundaries, user workflow
Blocking: YES
```

### ADR-C0-002: Return-to-Stock Transaction Scope

```text
ADR-C0-002
Decision required: Should return-to-stock share the RTS completion transaction?
Context: If automatic (ADR-C0-001 option a), the RETURN movement must be in the same TX as the RTS state change
Current architecture: completeRTS() TX: shipment update + event + outbox
Options:
  (a) Extend completeRTS() TX to include inventory operations
  (b) New separate TX with idempotency guard
Trade-offs: (a) atomic but larger TX; (b) smaller TX but needs idempotency + failure handling
Potential impact: Atomicity guarantees, failure modes, inventory consistency
Blocking: YES
```

### ADR-C0-003: Warehouse Resolution

```text
ADR-C0-003
Decision required: Which warehouse receives the returned stock?
Context: inventory_items are per (variant, warehouse). Return must increment the correct warehouse.
Current architecture: Warehouses are linked to stores. Shipments have storeId.
Options:
  (a) Same warehouse the order reserved from (trace RESERVE movement's inventory_item_id)
  (b) Store's primary/default warehouse
  (c) Caller specifies warehouse in return request
Trade-offs: (a) most accurate but requires movement tracing; (b) simple but may be wrong; (c) flexible but adds API complexity
Potential impact: Inventory accuracy, API design
Blocking: YES
```

---

## 25. Risk Register

| ID | Risk | Probability | Impact | Affected Subsystem | Mitigation | Blocking? |
|----|------|------------|--------|-------------------|-----------|-----------|
| R-01 | Double stock adjustment (RETURN + RELEASE) on cancel-after-return race | MEDIUM | HIGH | Inventory accuracy | Transaction ordering: cancel checks for existing RETURN before RELEASE | YES |
| R-02 | LOST return inflates stock (stock already released, then RETURN adds more) | MEDIUM | HIGH | Inventory accuracy | LOST-specific logic: check if RELEASE already occurred before RETURN | YES |
| R-03 | DAMAGED goods returned to sellable stock | MEDIUM | MEDIUM | Inventory accuracy | Condition-based disposition: DAMAGED → separate ADJUST or metadata flag | NO — can use metadata |
| R-04 | Partial return creates orphan reservation | LOW | MEDIUM | Order/inventory consistency | Track qty_returned; validate against qty_confirmed | NO |
| R-05 | Return on wrong warehouse inflates wrong location | LOW | HIGH | Inventory accuracy | Trace RESERVE movement to find correct warehouse | YES |
| R-06 | Concurrent returns on same inventory item | LOW | MEDIUM | Inventory consistency | SELECT FOR UPDATE on inventory_items (same as reserveStock) | NO — standard pattern |
| R-07 | Return without RTS completion (bypass) | LOW | HIGH | Process integrity | Return endpoint requires RTS_COMPLETED exception_status | NO |
| R-08 | M7.3-C scope creep into refunds (M7.3-D) | MEDIUM | MEDIUM | Milestone boundary | Strict scope: inventory movement only, no financial tables | NO |

---

## 26. Implementation Conditions

The following conditions must be resolved in the M7.3-C Business/Architecture Lock before implementation:

| ID | Condition | Reason | Affected Component | Required Decision | Blocking? |
|----|-----------|--------|-------------------|------------------|-----------|
| C-01 | Order status on return | Determines whether order FSM is extended | Order FSM, master-order | OBD-001 | YES |
| C-02 | Automatic vs. explicit return | Determines API surface and TX scope | completeRTS(), API | OBD-002, ADR-C0-001, ADR-C0-002 | YES |
| C-03 | LOST return behavior | Prevents stock inflation for non-returned goods | LOST flow, inventory | OBD-003 | YES |
| C-04 | DAMAGED return condition | Prevents unsellable stock from appearing sellable | Inventory, disposition | OBD-004 | YES |
| C-05 | Return vs. cancellation ordering | Prevents double stock adjustment | cancelOrder(), return | OBD-005 | YES |
| C-06 | Warehouse resolution | Ensures stock returns to correct location | Inventory | ADR-C0-003 | YES |
| C-07 | Partial return support | Determines API complexity | API, order_items | OBD-006 | NO (default: full return) |
| C-08 | Return condition/quantity recording | Determines schema needs | Shipments, movements | OBD-007, OBD-008 | NO (default: JSONB metadata) |

---

## 27. Scope Boundary

### IN SCOPE (confirmed)

1. Return-to-stock inventory movement (RETURN type)
2. RTS physical handling (condition, quantity)
3. Shipment events for return audit trail
4. Outbox events for downstream consumers
5. Authorization (merchant own-store, admin any)
6. Tenant isolation
7. Optimistic concurrency on return operations
8. Transactional atomicity (return + events in same TX)
9. LOST exception return handling
10. DAMAGED exception return handling

### OUT OF SCOPE (confirmed)

| Item | Deferred To |
|------|------------|
| Financial refund processing | M7.3-D |
| Buyer-initiated returns | M7.3-E |
| Post-delivery returns (no RTS) | Future |
| Carrier return shipping | N/A |
| Return shipping labels | N/A |
| Return authorization (RMA) workflow | Future |
| Automatic redelivery | N/A |
| Photo evidence | N/A |
| Notification expansion | M7.3-F |
| Order FSM changes (unless C-01 requires) | TBD by lock |
| Master-order FSM changes | TBD by lock |
| New migration (unless C-07/C-08 require) | TBD by lock |
| Reconciliation worker | N/A |
| Scheduled reconciliation | N/A |

---

## 28. Final Audit Verdict

```text
========================================
SCS-M7.3-C PRE-IMPLEMENTATION ARCHITECTURE AUDIT
========================================

Audit Verdict: GO WITH CONDITIONS (8 conditions)

Production Code Modified: NO
Tests Modified: NO
Migrations Added: NO
Schema Modified: NO
Implementation Started: NO

Open Business Decisions: 8 (OBD-001 through OBD-008)
Architecture Decisions Required: 3 (ADR-C0-001 through ADR-C0-003)
Implementation Conditions: 8 (C-01 through C-08)

Architectural risks: 8 (R-01 through R-08)
  HIGH risks: 3 (R-01, R-02, R-05)
  MEDIUM risks: 4 (R-03, R-04, R-06, R-08)
  LOW risks: 1 (R-07)

Key findings:
  1. RETURN movement type already exists in DB constraint — no migration needed for basic return
  2. completeRTS() has no inventory movement — deliberate B.5 deferral
  3. settleStockForStatus() handles RELEASE and SALE but not RETURN
  4. LOST return requires special handling (stock may already be released)
  5. Return vs. cancellation race is the highest-priority concurrency risk
  6. B.0 lock provides clear roadmap evidence for M7.3-C scope
  7. B.5 lock defers return condition and quantity to M7.3-C
  8. All B.5 capabilities that M7.3-C depends on are present and verified

Dependencies: All satisfied (B.1-B.5 all CLOSED/PASS)
External verification: None required — M7.3-C is SCS-internal

NEXT STAGE:
M7.3-C BUSINESS RULES + ARCHITECTURE DECISION LOCK
========================================
```

---

## 29. Confirmation

**NO implementation changes were made.** This audit is strictly read-only. No source code, tests, migrations, configuration, or documentation files were modified. This document is the only artifact produced.

**The audit stopped after completing the architecture analysis.** No implementation, migration, test, or endpoint changes were made. The next stage is the M7.3-C Business/Architecture Lock.

### Files Inspected

| File | Lines | Role |
|------|-------|------|
| `orders.service.ts` | 3744 | Order FSM, delivery, cancellation, exception lifecycle, RTS methods, settlement |
| `shipment.schema.ts` | 117 | Shipments + shipment_events Drizzle schema |
| `inventory.schema.ts` | 41 | Inventory items + stock movements Drizzle schema |
| `inventory.service.ts` | 649 | Inventory operations (RESERVE/RELEASE/SALE/IMPORT/ADJUST) |
| `orders.schema.ts` | 128 | Orders, order_items, financial_breakdown, status_history |
| `audit.schema.ts` | 74 | Outbox events, audit logs, feature flags |
| `shipment-operations.controller.ts` | 348 | Shipment CRUD + exception/retry/RTS endpoints |

### Migrations Inspected

| Migration | Content |
|-----------|---------|
| 0005 | Inventory items + stock movements (RETURN type documented) |
| 0020 | Stock movement CHECK constraint (RETURN in allowed list) |
| 0048 | Cancellation metadata (B.2) |
| 0049 | Carrier cancellation state (B.3.1) |
| 0050 | Delivery exception columns (B.4) |

### Documentation Inspected

| Document | Status |
|----------|--------|
| `SCS-M7.3-B-BUSINESS-RULES-ARCHITECTURE-LOCK.md` | LOCKED (1672 lines) |
| `SCS-M7.3-B.5-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md` | COMPLETE (1001 lines) |
| `SCS-M7.3-B.5-BUSINESS-RULES-ARCHITECTURE-LOCK.md` | LOCKED (1504 lines) |
| `SCS-M7.3-B.5-IMPLEMENTATION-REPORT.md` | COMPLETE (465 lines) |
| `SCS-M7.3-B.5-INDEPENDENT-RUNTIME-VERIFICATION.md` | PASS (634 lines) |
| `SCS-M7.3-B.5-RELEASE-CLOSURE.md` | CLOSED/PASS (563 lines) |
| `SCS-M7.3-B.4-RELEASE-CLOSURE.md` | CLOSED/PASS (564 lines) |
