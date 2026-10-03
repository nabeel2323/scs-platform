# SCS-M7.3-C — Business Rules + Architecture Decision Lock

## Returns (Inventory Return-to-Stock + RTS Physical Handling)

| Field | Value |
|-------|-------|
| Milestone | M7.3-C |
| Phase | Business Rules + Architecture Decision Lock |
| Status | **LOCKED** |
| Baseline | `develop` @ `5c6649dc2334e278c808b44c558b020db7e6db7b` |
| Predecessor Audit | SCS-M7.3-C-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md (GO WITH CONDITIONS, 8 conditions) |
| Parent Lock | SCS-M7.3-B-BUSINESS-RULES-ARCHITECTURE-LOCK.md (LOCKED) |
| Previous Milestone | M7.3-B.5 — CLOSED / PASS |
| Next Phase | M7.3-C — Implementation |
| Implementation | STRICTLY FORBIDDEN IN THIS PHASE |

---

## 1. Lock Identity

This document converts the findings of the M7.3-C Pre-Implementation Architecture Audit into formally locked business rules and architecture decisions that serve as the authoritative specification for M7.3-C implementation.

**Audit verdict inherited:** GO WITH CONDITIONS (8 conditions)

**All eight conditions are incorporated and resolved in this lock.**

**Business objective:** When an RTS reaches the point at which the physical return is confirmed, the inventory system must accurately reflect the returned goods — recording the return quantity, condition, and warehouse destination — without modifying the order FSM, carrier integrations, or financial settlement.

---

## 2. Authoritative Documents

| Document | Role | Status |
|----------|------|--------|
| SCS-M7.3-B-BUSINESS-RULES-ARCHITECTURE-LOCK.md | Parent lock | LOCKED |
| SCS-M7.3-C-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md | Primary input — audit findings | COMPLETE |
| SCS-M7.3-B.5-BUSINESS-RULES-ARCHITECTURE-LOCK.md | Predecessor lock — RTS foundation | LOCKED |
| SCS-M7.3-B.5-RELEASE-CLOSURE.md | Predecessor closure | CLOSED / PASS |

---

## 3. Business Objective

When delivery exceptions reach a terminal failure point and the RTS lifecycle confirms the physical return of goods, M7.3-C records the inventory consequence: a RETURN movement that restores `qty_on_hand`, tracks return condition and quantity, and emits events for downstream consumption — without modifying the order FSM, carrier integrations, or financial settlement.

---

## 4. Scope

### IN SCOPE

1. Return-to-stock inventory movement (RETURN type)
2. Return quantity tracking (per item)
3. Return condition recording (GOOD / DAMAGED / DEFECTIVE / UNSALEABLE)
4. Warehouse routing (trace original reservation)
5. RTS physical handling (return after RTS completion)
6. LOST exception return handling (no physical return)
7. DAMAGED exception return handling (condition-based)
8. Partial return support (item-level)
9. Shipment events for return audit trail
10. Outbox events for downstream consumers (M7.3-D)
11. Authorization (merchant own-store, admin any)
12. Tenant isolation
13. Optimistic concurrency on return operations
14. Transactional atomicity (return + events in same TX)
15. Cancellation interaction (net RETURN in RELEASE calculation)

### OUT OF SCOPE

| Item | Deferred To |
|------|------------|
| Financial refund processing | M7.3-D |
| Buyer-initiated returns | M7.3-E |
| Post-delivery returns (no RTS/exception) | Future |
| Carrier return shipping | N/A |
| Return shipping labels | N/A |
| Return authorization (RMA) workflow | N/A |
| Order FSM changes | N/A — explicitly preserved |
| Master-order FSM changes | N/A — explicitly preserved |
| New database migration | N/A — existing schema sufficient |
| Reconciliation worker | N/A |
| Scheduled reconciliation | N/A |
| Automatic redelivery | N/A |
| Photo evidence | N/A |
| Notification expansion | M7.3-F |

---

## 5. Out-of-Scope Boundary

```text
M7.3-C does NOT implement refunds.
M7.3-C does NOT implement buyer-initiated returns.
M7.3-C does NOT change the order FSM.
M7.3-C does NOT change the master-order FSM.
M7.3-C does NOT add a new order status.
M7.3-C does NOT add a new exception FSM state.
M7.3-C does NOT create a new migration.
M7.3-C does NOT interact with carriers.
M7.3-C does NOT implement automatic redelivery.
M7.3-C does NOT implement photo evidence.
M7.3-C does NOT expand notifications.
```

---

## 6. Business Decisions

### BD-C0-001: Order Status on Return (resolves OBD-001)

```text
Status: LOCKED
Rule: Return-to-stock does NOT change the order status.
      The order FSM is NOT extended. No RETURNED status is introduced.
      The order remains in its current status (typically OUT_FOR_DELIVERY)
      throughout the RTS and return lifecycle.
      Master-order status is NOT affected by return-to-stock.
      Return-to-stock is a shipment/inventory concern, not an order concern.
      Buyer visibility: The buyer sees the order as OUT_FOR_DELIVERY (unchanged).
      Cancellation eligibility: The order remains cancellable until it reaches
      a terminal state (DELIVERED, COMPLETED, CANCELLED, etc.).
      Partial return does not change order status.
      Full return does not change order status.
Rationale: Adding a new order status would cascade into master-order aggregation,
      buyer visibility, cancellation logic, and reporting. The shipment is the
      aggregate root for delivery exceptions and RTS; return is a consequence
      of the shipment-level RTS completion.
Source: Audit OBD-001; B.5 lock (order remains OUT_FOR_DELIVERY during RTS)
```

### BD-C0-002: Return Trigger (resolves OBD-002 / ADR-C0-001)

```text
Status: LOCKED
Rule: Return-to-stock is a SEPARATE explicit operation after RTS completion.
      It is NOT an automatic side-effect of completeRTS().
      It is NOT an asynchronous outbox-driven action.

      New endpoint: POST /v1/shipments/:id/return
      Prerequisites: exception_status = RTS_COMPLETED, order NOT CANCELLED.
      When inventory changes: Inside the return endpoint's transaction.
      If inventory return fails: The entire return TX rolls back; RTS remains
        RTS_COMPLETED but no RETURN movement exists. Operator retries.
      Condition/quantity: Supplied in the return request body.
      Idempotency: If RETURN movements already exist for the shipment with
        matching reference, return 200 with existing data (no duplicate).

      Rationale: Separating RTS confirmation from inventory return allows:
      (a) Condition/quantity input at return time (not at RTS completion),
      (b) LOST exceptions to complete RTS without physical return,
      (c) Operational flexibility (goods may be confirmed returned but not
        yet processed into inventory).
      The outbox event shipment.rts_completed signals downstream that a
      return is pending.

Source: Audit OBD-002, ADR-C0-001
```

### BD-C0-003: LOST Return Behavior (resolves OBD-003)

```text
Status: LOCKED
Rule: LOST RTS completion does NOT create a RETURN movement.
      LOST RTS completion does NOT create a RELEASE movement.
      LOST means the package is confirmed unrecoverable; no physical return occurs.

      Stock disposition for LOST:
      - If order is later cancelled: cancelOrder() RELEASEs reserved stock normally.
      - If order is never cancelled: stock remains reserved until operational
        decision (cancel or manual adjustment).
      - M7.3-C does NOT auto-release LOST stock. The order cancellation is the
        authoritative mechanism for releasing reserved stock.

      Double-counting prevention:
      - LOST creates zero inventory movements.
      - Therefore no RETURN + RELEASE double-count is possible.
      - Cancellation's settleStockForStatus() sees no RETURN to net; RELEASE
        proceeds normally.

      Rationale: LOST packages do not physically return. Creating a RETURN
      movement for goods that never arrive would inflate qty_on_hand.
      Auto-releasing at RTS completion would preempt the cancellation authority
      and could race with a later cancellation.

Source: Audit OBD-003, R-02 (HIGH risk)
```

### BD-C0-004: DAMAGED Disposition (resolves OBD-004)

```text
Status: LOCKED
Rule: DAMAGED goods that physically return ARE recorded as RETURN movements
      that increment qty_on_hand. The return condition is recorded in
      stock_movements.metadata JSONB.

      Condition vocabulary (controlled, 4 values):
        GOOD       — sellable, no damage
        DAMAGED    — physical damage, may be sellable at discount
        DEFECTIVE  — functional defect, not sellable as-is
        UNSALEABLE — cannot be sold, requires write-off or disposal

      Condition rules:
      - Condition is per item (each order item line gets its own condition).
      - Condition is REQUIRED in the return request.
      - If caller does not supply condition: 400 Bad Request.
      - Condition is immutable once recorded (stock_movements is append-only).
      - Mixed conditions in one return: YES (different items can have different conditions).
      - Who can choose condition: MERCHANT or ADMIN (whoever performs the return).

      Inventory effect:
      - ALL returned goods increment qty_on_hand regardless of condition.
      - Condition is tracked in metadata for M7.3-D to consume.
      - M7.3-D (refunds) can use condition to determine refund eligibility
        and write-off decisions.

      Rationale: Physically returned goods are in the warehouse regardless of
      condition. Not incrementing qty_on_hand would create a phantom inventory
      shortage. The condition metadata provides the information M7.3-D needs
      without complicating the inventory model.

Source: Audit OBD-004, R-03
```

### BD-C0-005: Return vs Cancellation (resolves OBD-005)

```text
Status: LOCKED
Rule: Cancellation authority is preserved. The interaction is defined as:

      Scenario A — Cancellation commits first:
        Winner: CANCELLATION.
        Order: → CANCELLED.
        Exception: RTS closed (RTS_COMPLETED → CLOSED).
        Inventory: RELEASE movement (normal cancellation settlement).
        Return: NOT possible (order is CANCELLED, return endpoint rejects).
        RETURN created: NO. RELEASE created: YES.

      Scenario B — Return-to-stock commits first:
        Winner: RETURN is recorded; cancellation can still proceed.
        Order: Remains OUT_FOR_DELIVERY (return does not change order status).
        Exception: Remains RTS_COMPLETED (return does not change exception).
        Inventory: RETURN movement (+qty_on_hand).
        Subsequent cancellation: RELEASE is NET of RETURN.
          settleStockForStatus() is extended to subtract RETURN quantities
          from the outstanding reservation calculation.
        RETURN created: YES. RELEASE created: only for un-returned quantity.

      Scenario C — Concurrent:
        Both TXs compete for SELECT FOR UPDATE on inventory_items rows.
        Whichever TX locks first commits. The other TX sees the committed
        state and behaves deterministically per scenarios A or B.

      Scenario D — Cancellation starts while return is executing:
        If return TX commits first: cancellation sees RETURN, nets it.
        If cancellation TX commits first: return TX sees order CANCELLED → 409.

      Scenario E — Cancellation after physical return (days later):
        Same as Scenario B. settleStockForStatus() nets RETURN.
        RELEASE = max(0, reserved - already_released - returned).

      CRITICAL: settleStockForStatus() netting extension:
        Current:  outstanding = RESERVE - RELEASE - SALE
        Extended: outstanding = RESERVE - RELEASE - SALE - RETURN
        This ensures RELEASE never exceeds what is still physically reserved
        after accounting for returns.

      Invariant: For any order item, the sum of RELEASE + RETURN quantities
        never exceeds the original RESERVE quantity.

Source: Audit OBD-005, R-01 (HIGH risk)
```

### BD-C0-006: Partial Return (resolves OBD-006)

```text
Status: LOCKED
Rule: M7.3-C supports item-level partial return.
      A return request specifies which order items and how many of each.
      Maximum return quantity per item = order_items.qty_confirmed (or quantity
        if not yet confirmed) minus sum of existing RETURN quantities for that item.
      Duplicate requests: Idempotent — if RETURN movements already exist matching
        the request, return 200 with existing data.
      Mixed item conditions: YES — each item line has its own condition.
      Inventory movements: One RETURN movement per item line per return.
      Refund implications: M7.3-D will use stock_movements RETURN data to
        determine refund eligibility. M7.3-C does not process refunds.

Source: Audit OBD-006
```

### BD-C0-007: Return Quantity (resolves OBD-007)

```text
Status: LOCKED
Rule: Return quantity is supplied explicitly by the caller in the request body.
      It is NOT derived from order_items automatically.
      It is NOT stored as a dedicated column on order_items.
      It IS stored in stock_movements.quantity (positive integer).
      It IS tracked per item via stock_movements.reference_id = orderItemId.

      Authoritative source of total returned quantity:
        SELECT COALESCE(SUM(quantity), 0) FROM stock_movements
        WHERE reference_type = 'RETURN' AND reference_id = :orderItemId

      Invariant: 0 < returned_quantity <= eligible_quantity
        where eligible_quantity = qty_confirmed (or quantity) - already_returned

      Duplicate prevention: Idempotency check compares requested quantities
        against existing RETURN movements. If all match → 200 (already done).
        If any differ → 409 Conflict.

Source: Audit OBD-007
```

### BD-C0-008: Return Condition Recording (resolves OBD-008)

```text
Status: LOCKED
Rule: Return condition is recorded in stock_movements.metadata JSONB.
      NOT a dedicated shipment column.
      NOT a separate return table.

      Storage location: stock_movements.metadata
      Key: "returnCondition"
      Value: one of "GOOD", "DAMAGED", "DEFECTIVE", "UNSALEABLE"

      Additional metadata keys:
        "returnOrderId": orderId
        "returnShipmentId": shipmentId
        "returnExceptionType": exceptionType (RECIPIENT_REFUSED, DAMAGED, etc.)
        "returnPerformedBy": actorType (MERCHANT, ADMIN)

      Rationale for JSONB metadata over dedicated column:
      - stock_movements is append-only; metadata is immutable once written.
      - No migration required (metadata column already exists).
      - Condition is an attribute of the movement, not of the shipment.
      - Different items in the same return can have different conditions.
      - Query by condition is possible via JSONB operators when needed:
        WHERE metadata->>'returnCondition' = 'DAMAGED'
      - M7.3-D can query stock_movements to build refund eligibility.

Source: Audit OBD-008
```

---

## 7. RTS Lifecycle

The B.5 RTS lifecycle is preserved unchanged:

```text
OPEN → RTS_PENDING (requestRTS)
RTS_PENDING → RTS_IN_PROGRESS (approveRTS)
RTS_PENDING → OPEN (rejectRTS)
RTS_IN_PROGRESS → RTS_COMPLETED (completeRTS)
RTS_COMPLETED → CLOSED (cancellation)
OPEN → RTS_IN_PROGRESS (requestAndApproveLostRTS — LOST direct flow)
```

M7.3-C does NOT add any new exception FSM state.
M7.3-C does NOT modify any existing RTS transition.
M7.3-C does NOT modify completeRTS() behavior.

The return-to-stock action occurs AFTER RTS completion via a separate endpoint.

---

## 8. Return-to-Stock Lifecycle

```text
Prerequisites:
  1. Shipment exists with exception_status = RTS_COMPLETED
  2. Associated order is NOT CANCELLED
  3. Caller has MERCHANT (own store) or ADMIN role

Flow:
  1. Authorization check (role + tenant)
  2. Load shipment, verify RTS_COMPLETED
  3. Load order, verify not CANCELLED
  4. Load order items, validate return quantities
  5. Idempotency check (existing RETURN movements)
  6. Resolve warehouse (trace RESERVE movement)
  7. BEGIN TX
     a. SELECT FOR UPDATE on inventory_items rows
     b. For each returned item:
        - Increment qty_on_hand
        - Insert RETURN movement with condition metadata
     c. Insert RETURN_TO_STOCK shipment event
     d. Insert shipment.return_to_stock outbox event
  8. COMMIT

Result:
  - qty_on_hand increased by returned quantities
  - qty_reserved unchanged (RETURN does not affect reservation)
  - stock_movements has RETURN rows with condition metadata
  - shipment_events has RETURN_TO_STOCK audit entry
  - outbox_events has shipment.return_to_stock for downstream
```

---

## 9. Inventory Rules

### RECIPIENT_REFUSED — Full Return

```text
RETURNABLE: YES
WAREHOUSE: Original reservation warehouse (traced from RESERVE movement)
QUANTITY: All items (full order)
INVENTORY EFFECT: qty_on_hand += quantity (per item)
MOVEMENT TYPE: RETURN
QTY_ON_HAND: Increased by returned quantity
QTY_RESERVED: Unchanged
CONDITION: GOOD (default for refused — package was not opened)
AUDIT EVENT: RETURN_TO_STOCK (shipment_events)
OUTBOX EVENT: shipment.return_to_stock
```

### LOST — No Physical Return

```text
RETURNABLE: NO
WAREHOUSE: N/A
QUANTITY: N/A
INVENTORY EFFECT: NONE — no RETURN movement, no RELEASE movement
MOVEMENT TYPE: N/A
QTY_ON_HAND: Unchanged
QTY_RESERVED: Unchanged (remains reserved until order cancellation)
CONDITION: N/A
AUDIT EVENT: N/A
OUTBOX EVENT: N/A
NOTES: Stock is released when/if the order is cancelled via cancelOrder().
```

### DAMAGED — Return with Condition

```text
RETURNABLE: YES
WAREHOUSE: Original reservation warehouse
QUANTITY: As specified by caller (partial or full)
INVENTORY EFFECT: qty_on_hand += quantity
MOVEMENT TYPE: RETURN
QTY_ON_HAND: Increased by returned quantity
QTY_RESERVED: Unchanged
CONDITION: DAMAGED / DEFECTIVE / UNSALEABLE (caller-supplied, required)
AUDIT EVENT: RETURN_TO_STOCK
OUTBOX EVENT: shipment.return_to_stock
NOTES: Condition recorded in stock_movements.metadata->>'returnCondition'.
       M7.3-D uses condition for refund/write-off decisions.
```

### Partial Return

```text
RETURNABLE: YES (per item)
WAREHOUSE: Original reservation warehouse (per item)
QUANTITY: Caller-specified per item (0 < qty <= eligible)
INVENTORY EFFECT: qty_on_hand += quantity (per returned item)
MOVEMENT TYPE: RETURN (one per item)
QTY_ON_HAND: Increased per item
QTY_RESERVED: Unchanged
CONDITION: Per item (caller-supplied)
AUDIT EVENT: RETURN_TO_STOCK (one event, metadata lists all items)
OUTBOX EVENT: shipment.return_to_stock (one event, payload lists all items)
```

### Duplicate Return

```text
RETURNABLE: NO (idempotent)
BEHAVIOR: If RETURN movements already exist matching the request exactly → 200
          If quantities differ → 409 Conflict
INVENTORY: No additional movement created
```

### Cancellation Before Return

```text
RETURNABLE: NO
BEHAVIOR: Return endpoint rejects with 409 (order is CANCELLED)
INVENTORY: RELEASE already created by cancellation
```

### Cancellation After Return

```text
RETURNABLE: N/A (return already completed)
BEHAVIOR: Cancellation proceeds normally.
          settleStockForStatus() nets RETURN:
            outstanding = RESERVE - RELEASE - SALE - RETURN
          RELEASE = max(0, outstanding)
INVENTORY: RELEASE only for un-returned quantity.
           Net effect: reserved stock for returned items is NOT double-released.
```

---

## 10. Order Status Rules

The order FSM is NOT modified.

```text
TRANSITIONS (unchanged):
  OUT_FOR_DELIVERY → [DELIVERED]
  DELIVERED → [COMPLETED, DISPUTED]
  COMPLETED → [DISPUTED]
  CANCELLED → [] (terminal)

Return-to-stock does NOT trigger any order status transition.
The order remains OUT_FOR_DELIVERY (or whatever status it was in) after return.
```

---

## 11. Master-Order Rules

Master-order status is NOT affected by return-to-stock.

`recalculateMasterOrderStatus()` is NOT called after return.
Master-order aggregation continues to reflect sub-order statuses unchanged.

---

## 12. LOST Handling

```text
LOST RTS completion (RTS_IN_PROGRESS → RTS_COMPLETED):
  - No RETURN movement created.
  - No RELEASE movement created.
  - No inventory effect whatsoever.
  - Stock remains in its current state (reserved or released).

LOST + subsequent cancellation:
  - cancelOrder() closes RTS (RTS_COMPLETED → CLOSED).
  - settleStockForStatus() RELEASEs reserved stock normally.
  - No RETURN to net (LOST created none).
  - Standard cancellation inventory behavior.

LOST + package later found:
  - Out of scope for M7.3-C.
  - Operational manual adjustment if needed.
  - M7.3-C does not provide a "reverse the LOST" mechanism.
```

---

## 13. DAMAGED Handling

```text
DAMAGED RTS completion → return endpoint:
  - Caller supplies condition: DAMAGED, DEFECTIVE, or UNSALEABLE.
  - RETURN movement increments qty_on_hand.
  - Condition stored in stock_movements.metadata.
  - Goods are physically in warehouse but flagged for review.

DAMAGED + GOOD condition in same return:
  - Allowed. Each item line has its own condition.
  - Separate RETURN movements per item.

DAMAGED goods and M7.3-D:
  - M7.3-D can query stock_movements.metadata->>'returnCondition'
    to determine refund eligibility or write-off.
  - M7.3-C does NOT make refund or write-off decisions.
```

---

## 14. Partial Return Rules

```text
Partial return is at the order-item level:
  - Each order_items row can be returned independently.
  - Quantity per item: 0 < returnQty <= eligibleQty.
  - eligibleQty = qty_confirmed (or quantity if null) - sum(existing RETURNs).

Example: Order with 3 items (A: qty 5, B: qty 3, C: qty 2)
  - Return A:3 + B:1 → two RETURN movements, 4 total units.
  - Later return A:2 + C:2 → two more RETURN movements, 4 total units.
  - Total returned: A=5, B=1, C=2. Remaining eligible: A=0, B=2, C=0.

Partial return does NOT change order status.
Partial return does NOT prevent later returns of remaining items.
Partial return does NOT prevent cancellation of the order.
```

---

## 15. Quantity Rules

```text
Return quantity invariants:
  1. returnQty > 0 (must be positive)
  2. returnQty <= eligibleQty (cannot over-return)
  3. eligibleQty = orderItem.qtyConfirmed (or .quantity) - totalReturned
  4. totalReturned = SUM(stock_movements.quantity) WHERE
       reference_type = 'RETURN' AND reference_id = orderItemId
  5. SUM(all RETURNs for orderItem) <= orderItem.qtyConfirmed

Duplicate prevention:
  - Idempotency check: if exact same return already exists → 200.
  - If quantities differ → 409 Conflict.
  - stock_movements is append-only; RETURN movements cannot be modified.
```

---

## 16. Condition Rules

```text
Condition vocabulary: GOOD | DAMAGED | DEFECTIVE | UNSALEABLE

Rules:
  - Condition is REQUIRED in the return request body.
  - Condition is per item (each returned item line has its own).
  - Condition is immutable (stock_movements.metadata is append-only).
  - Mixed conditions allowed in one return request.
  - Who can set condition: MERCHANT or ADMIN (whoever performs the return).
  - Default condition: NONE — caller must explicitly supply.
  - Validation: 400 if condition is not in the controlled vocabulary.

Storage:
  - stock_movements.metadata->>'returnCondition' = 'GOOD' | 'DAMAGED' | etc.
  - No dedicated column. No migration.
```

---

## 17. Warehouse Rules

```text
Warehouse resolution rule:
  Trace the original RESERVE movement for each order item.
  The RESERVE movement's inventory_item_id identifies the (variant, warehouse)
  pair. The RETURN goes to the SAME warehouse.

  Implementation:
    SELECT inventory_item_id FROM stock_movements
    WHERE reference_type = 'ORDER' AND reference_id = :orderId
      AND movement_type = 'RESERVE'
      AND inventory_item_id IS NOT NULL

  This returns the inventory_item_id for each item's reservation.
  The RETURN movement targets the same inventory_item_id.

Multi-warehouse orders:
  Each order item may have been reserved from a different warehouse.
  The return resolves each item independently.

Partial orders:
  If only some items were accepted/reserved, only those items have
  RESERVE movements. Unreserved items cannot be returned (no stock to return).

User override:
  NOT allowed in M7.3-C. The warehouse is determined automatically.
  Future milestones may add admin override.

Security:
  The resolved warehouse must belong to the same store as the shipment.
  Cross-warehouse/cross-store return is rejected.
```

---

## 18. Cancellation Interaction

```text
Rule: Cancellation is authoritative. Return respects cancellation.

Pre-return check:
  Return endpoint verifies order.status != 'CANCELLED' before proceeding.
  If cancelled → 409 "Cannot return: order is cancelled".

settleStockForStatus() extension for cancellation:
  Current netting:  outstanding = RESERVE - RELEASE - SALE
  Extended netting: outstanding = RESERVE - RELEASE - SALE - RETURN

  Where RETURN = SUM(stock_movements.quantity) WHERE
    movement_type = 'RELEASE' ... no, RETURN is a separate type.
  Specifically: subtract RETURN quantities from outstanding.

  This ensures:
  - If all items were returned: outstanding = 0, RELEASE = 0.
  - If some items returned: outstanding = reserved - returned, RELEASE = remainder.
  - If no items returned: outstanding = reserved, RELEASE = full (normal).

Idempotency:
  settleStockForStatus() already handles replay safely via netting.
  Adding RETURN to the net calculation preserves this property.
```

---

## 19. Delivery Interaction

```text
Return-to-stock requires exception_status = RTS_COMPLETED.
Delivery is blocked while any RTS state is active (B.5).
After RTS_COMPLETED, delivery remains blocked (B.5).

Therefore: return-to-stock and delivery cannot race.
  - If RTS is active: delivery blocked, return may proceed.
  - If delivery succeeded: exception → RESOLVED, RTS not completable.
  - If RTS completed: delivery still blocked, return can proceed.

To deliver after RTS: admin must reject RTS first (RTS_PENDING → OPEN),
then proceed with delivery. Return is not relevant (RTS was rejected).
```

---

## 20. Retry Interaction

```text
Retry requires exception_status = OPEN.
RTS states (including RTS_COMPLETED) block retry.
After RTS completion, retry is not possible.
After RTS rejection (→ OPEN), retry becomes eligible again.
Return is only possible after RTS_COMPLETED, so retry and return do not interact.
```

---

## 21. Authorization

| Actor | RTS Completion (B.5) | Return-to-Stock | Condition | Warehouse Override |
|-------|---------------------|-----------------|-----------|-------------------|
| ADMIN | Yes (any) | Yes (any store) | Required | Not allowed in M7.3-C |
| MERCHANT | Yes (own store, non-LOST/DAMAGED approve) | Yes (own store only) | Required | Not allowed in M7.3-C |
| DRIVER | No | No | N/A | N/A |
| BUYER | No | No | N/A | N/A |

```text
Return authorization rules:
  - MERCHANT can return for own store only (store.orgId = caller.activeOrg).
  - ADMIN can return for any store (platform staff).
  - DRIVER has no return authority.
  - BUYER has no return authority.
  - Tenant isolation: assertShipmentAccessibleForException() pattern from B.5.
  - Cross-tenant return → 403/404.
```

---

## 22. Tenant Isolation

```text
Return endpoint uses the same tenant-scoping pattern as B.5 RTS:
  1. Load shipment by ID.
  2. Verify caller has access (ADMIN bypass; MERCHANT store.orgId match).
  3. Load order via shipment.orderId.
  4. Verify order's store matches caller's scope.
  5. Load order items via order.id.
  6. Resolve warehouse from RESERVE movements.
  7. Verify warehouse belongs to same store.
  8. Proceed with return.

Cross-tenant access: Rejected at step 2 or 7.
IDOR: UUID-based lookups prevent enumeration.
```

---

## 23. API Contract

### POST /v1/shipments/:id/return

```text
Method:      POST
Auth:        JwtAuthGuard + PermissionsGuard
Permission:  fulfillment:shipments:write
Actors:      MERCHANT (own store), ADMIN

Request Body:
{
  "items": [
    {
      "orderItemId": "uuid",
      "quantity": 2,
      "condition": "GOOD" | "DAMAGED" | "DEFECTIVE" | "UNSALEABLE"
    }
  ],
  "notes": "optional string"
}

Validation:
  - items: non-empty array
  - items[].orderItemId: must belong to the shipment's order
  - items[].quantity: integer, 0 < qty <= eligible
  - items[].condition: one of 4 controlled values
  - notes: optional string

State Prerequisites:
  - exception_status = RTS_COMPLETED
  - order.status != CANCELLED

Success Response (201 Created):
{
  "shipmentId": "uuid",
  "orderId": "uuid",
  "returnMovements": [
    {
      "movementId": "uuid",
      "orderItemId": "uuid",
      "inventoryItemId": "uuid",
      "warehouseId": "uuid",
      "quantity": 2,
      "condition": "GOOD"
    }
  ],
  "totalReturned": 2,
  "performedBy": "MERCHANT",
  "createdAt": "2026-10-02T..."
}

Idempotency:
  - If identical RETURN movements already exist → 200 with existing data.
  - If quantities differ → 409 Conflict.

Error Cases:
  400: Invalid condition, quantity <= 0, quantity > eligible, empty items
  403: Role not authorized
  404: Shipment not found
  409: Order cancelled, exception not RTS_COMPLETED, concurrent modification
  409: Duplicate return with different quantities

Inventory Effects:
  - qty_on_hand incremented per item
  - qty_reserved unchanged
  - RETURN movements created per item

Events:
  - Shipment event: RETURN_TO_STOCK
  - Outbox event: shipment.return_to_stock
```

---

## 24. Idempotency

```text
Duplicate return request (exact match):
  → 200 OK with existing return data.
  → No additional RETURN movements created.
  → No additional events created.

Duplicate return request (different quantities):
  → 409 Conflict.
  → No changes made.

Detection method:
  Query stock_movements for existing RETURN movements with
  reference_type = 'RETURN' and reference_id IN (orderItemIds).
  Compare quantities and conditions.
  If all match → idempotent 200.
  If any differ → 409.
```

---

## 25. Transaction Boundaries

```text
Return-to-stock transaction:

  BEGIN TX
    1. SELECT FOR UPDATE on inventory_items rows (by resolved inventory_item_ids)
    2. For each returned item:
       a. UPDATE inventory_items SET qty_on_hand = qty_on_hand + quantity
       b. INSERT stock_movements (RETURN, +quantity, metadata with condition)
    3. INSERT shipment_events (RETURN_TO_STOCK)
    4. INSERT outbox_events (shipment.return_to_stock)
  COMMIT

All four steps are atomic. Failure in any step rolls back all.
No nested transactions. No outbox publish outside TX.
```

---

## 26. Concurrency Rules

### Return vs Return

```text
Two concurrent return requests on same shipment:
  - Both TXs compete for SELECT FOR UPDATE on inventory_items.
  - First TX commits RETURN movements.
  - Second TX sees existing RETURN movements → idempotent 200 or 409.
  - Expected: 1 success (201) + 1 idempotent (200) or conflict (409).
  - PostgreSQL test: 100-concurrent returns.
```

### Return vs Cancellation

```text
Concurrent return + cancellation:
  - Both TXs lock inventory_items via FOR UPDATE.
  - If return commits first: cancellation sees RETURN, nets it in RELEASE.
  - If cancellation commits first: return sees order CANCELLED → 409.
  - No double stock adjustment possible.
  - PostgreSQL test: 100-concurrent return-vs-cancel.
```

### Return vs Inventory Adjustment

```text
Concurrent return + manual adjustment on same inventory item:
  - SELECT FOR UPDATE serializes.
  - Both succeed with correct final qty_on_hand.
  - Standard row-lock pattern (same as reserveStock).
```

### Return vs Reservation

```text
Concurrent return + new order reservation on same inventory item:
  - SELECT FOR UPDATE serializes.
  - Return increments qty_on_hand; reservation increments qty_reserved.
  - Both succeed with correct totals.
```

### RTS Completion + Return vs Delivery

```text
Cannot race: delivery is blocked while RTS is active (B.5).
After RTS_COMPLETED, delivery remains blocked.
Return proceeds independently of delivery.
```

---

## 27. Database / Schema Decision

```text
Decision: NO MIGRATION REQUIRED.

Rationale:
  1. RETURN movement type already exists in CHECK constraint (migration 0020).
  2. stock_movements.metadata (JSONB) stores return condition — no new column.
  3. shipment_events already accommodates RETURN_TO_STOCK event type
     (VARCHAR(40), plenty of room).
  4. outbox_events already accommodates shipment.return_to_stock
     (VARCHAR(80), plenty of room).
  5. No new table required.
  6. No new column on shipments, orders, or inventory_items.

Return condition lives in: stock_movements.metadata->>'returnCondition'
Return quantity lives in: stock_movements.quantity (positive integer)
Return reference lives in: stock_movements.reference_type = 'RETURN',
                           reference_id = orderItemId
Return audit lives in: shipment_events (RETURN_TO_STOCK event)
Return downstream lives in: outbox_events (shipment.return_to_stock)
```

---

## 28. Event Model

### Shipment Events

| Event Type | When | Actor | Metadata |
|-----------|------|-------|----------|
| `RETURN_TO_STOCK` | return endpoint succeeds | MERCHANT/ADMIN | `{ exceptionType, returnedItems: [{orderItemId, quantity, condition}], warehouseId, totalReturned }` |

### Existing Events (unchanged)

| Event Type | When | M7.3-C Impact |
|-----------|------|---------------|
| `RTS_REQUESTED` | requestRTS() | No change |
| `RTS_APPROVED` | approveRTS() | No change |
| `RTS_COMPLETED` | completeRTS() | No change |
| `RTS_REJECTED` | rejectRTS() | No change |
| `DELIVERY_EXCEPTION_CLOSED` | cancelOrder() | No change |

`shipment.rts_completed` IS still emitted by completeRTS(). M7.3-C does not modify it.

---

## 29. Outbox Model

### New Outbox Event

```text
Event type: shipment.return_to_stock
Aggregate:  shipmentId
Payload:
{
  "shipmentId": "uuid",
  "orderId": "uuid",
  "storeId": "uuid",
  "exceptionType": "RECIPIENT_REFUSED",
  "returnedItems": [
    {
      "orderItemId": "uuid",
      "variantId": "uuid",
      "inventoryItemId": "uuid",
      "warehouseId": "uuid",
      "quantity": 2,
      "condition": "GOOD"
    }
  ],
  "totalReturned": 2,
  "performedBy": "MERCHANT",
  "notes": "optional"
}
Metadata: { storeId }
Status: PENDING
```

### Existing Outbox Events (unchanged)

| Event | When | M7.3-C Impact |
|-------|------|---------------|
| `shipment.rts_requested` | requestRTS() | No change |
| `shipment.rts_approved` | approveRTS() | No change |
| `shipment.rts_completed` | completeRTS() | No change |

### M7.3-D Interface

M7.3-D (refunds) can consume `shipment.return_to_stock` to determine:
- Which items were returned
- Return condition of each item
- Return quantity of each item
- Whether refund is eligible

No reverse engineering of inventory movements required.

---

## 30. Testing Contract

### Unit Tests

| Category | Tests |
|----------|-------|
| Authorization | DRIVER/BUYER rejected; MERCHANT own-store; ADMIN any |
| Validation | Condition required, quantity bounds, empty items, invalid condition |
| Prerequisites | Non-RTS_COMPLETED rejected; cancelled order rejected |
| Idempotency | Duplicate return → 200; different quantities → 409 |

### PostgreSQL Integration Tests

| Category | Tests |
|----------|-------|
| Full return | All items returned, qty_on_hand correct, RETURN movements exist |
| Partial return | Subset of items, correct quantities |
| LOST return | No RETURN movement, no RELEASE, no inventory effect |
| DAMAGED return | RETURN with condition in metadata |
| Idempotency | Duplicate → 200, no double movement |
| Warehouse resolution | RETURN goes to original RESERVE warehouse |
| Concurrency: return vs return | 100-concurrent → 1 success / 99 idempotent |
| Concurrency: return vs cancel | Return first → cancel nets; Cancel first → return rejected |
| Concurrency: return vs reserve | FOR UPDATE serializes correctly |
| Event atomicity | RETURN + event + outbox in same TX |
| Cancellation after return | settleStockForStatus nets RETURN correctly |
| Over-return prevention | quantity > eligible → 400 |

### Regression

All previous milestones must remain green:
- B.1 (concurrency), B.2 (cancellation), B.3.x (carrier), B.3.4 (race closure)
- B.4 (delivery exceptions), B.5 (RTS lifecycle)
- Shipping, Orders, Inventory unit suites

### Security

- Authorization for return endpoint
- Tenant isolation (cross-merchant → 403)
- IDOR (cross-store → 403/404)

---

## 31. UI Implications

```text
M7.3-C is a backend-only milestone.
No frontend changes are required.
The return endpoint is available for future UI integration.
Admin console and merchant dashboard may add return UI in a future milestone.
```

---

## 32. Future Milestone Interfaces

### M7.3-D (Refunds)

```text
Interface: outbox event shipment.return_to_stock
Consumer: Refund service (future)
Data available: returned items, quantities, conditions, warehouse, store
Refund eligibility: determined by M7.3-D based on condition + business rules
```

### M7.3-E (Buyer Disputes)

```text
Interface: stock_movements with movement_type = 'RETURN'
Consumer: Dispute service (future)
Data available: return quantities, conditions, timestamps
Dispute evidence: RETURN movements prove physical return occurred
```

---

## 33. Architecture Decision Records

### ADR-C0-001: Return Trigger Mechanism

```text
Title: Return-to-stock is a separate explicit endpoint
Status: LOCKED
Decision: POST /v1/shipments/:id/return (separate from completeRTS)
Rationale: Separation of concerns; condition/quantity input at return time;
           LOST exceptions complete RTS without physical return.
Alternatives rejected:
  - Automatic side-effect of completeRTS: rejected (LOST has no physical return)
  - Async outbox consumer: rejected (eventual consistency unacceptable for inventory)
```

### ADR-C0-002: Transaction Scope

```text
Title: Return-to-stock has its own atomic transaction
Status: LOCKED
Decision: Return TX contains: FOR UPDATE + inventory mutation + movements + events + outbox
Rationale: Atomic inventory + events; no divergence possible.
           Separate from completeRTS TX because they are separate operations.
Invariant: No state where return movements exist without corresponding
           inventory update, or vice versa.
```

### ADR-C0-003: Warehouse Resolution

```text
Title: Return goes to original reservation warehouse
Status: LOCKED
Decision: Trace RESERVE movement's inventory_item_id to find warehouse.
Rationale: Most accurate; no user input needed; prevents wrong-warehouse stock.
Alternatives rejected:
  - Store default warehouse: rejected (may differ from reservation source)
  - Caller-supplied: rejected (security risk, adds complexity)
```

---

## 34. Implementation Conditions

All conditions resolved:

```text
C-C0-001
Requirement: Separate return endpoint POST /v1/shipments/:id/return
Implementation: New method returnToStock() in OrdersService; new route in controller
Tests: Authorization, validation, full/partial return, idempotency, concurrency
Affected backend: orders.service.ts, shipment-operations.controller.ts
Migration: NONE
Blocking: NO — resolved

C-C0-002
Requirement: settleStockForStatus() nets RETURN in outstanding calculation
Implementation: Add RETURN to netting: outstanding = RESERVE - RELEASE - SALE - RETURN
Tests: Cancel after full return, cancel after partial return, cancel without return
Affected backend: orders.service.ts settleStockForStatus()
Migration: NONE
Blocking: NO — resolved

C-C0-003
Requirement: LOST creates no inventory movements
Implementation: returnToStock() checks exceptionType; if LOST → 400 "LOST returns not supported"
Tests: LOST return rejected; LOST RTS completion has no inventory effect
Affected backend: orders.service.ts
Migration: NONE
Blocking: NO — resolved

C-C0-004
Requirement: Condition required, 4-value vocabulary, per-item
Implementation: Validation in returnToStock(); stored in stock_movements.metadata
Tests: Missing condition → 400; invalid condition → 400; mixed conditions → OK
Affected backend: orders.service.ts
Migration: NONE
Blocking: NO — resolved

C-C0-005
Requirement: Warehouse traced from RESERVE movement
Implementation: Query stock_movements for RESERVE by orderId; resolve inventory_item_id
Tests: Correct warehouse; multi-warehouse order; no RESERVE found → error
Affected backend: orders.service.ts
Migration: NONE
Blocking: NO — resolved

C-C0-006
Requirement: Partial return at item level
Implementation: Accept items[] array; validate each independently
Tests: Partial return; multiple partial returns; over-return prevention
Affected backend: orders.service.ts
Migration: NONE
Blocking: NO — resolved

C-C0-007
Requirement: Return event + outbox event
Implementation: RETURN_TO_STOCK shipment event; shipment.return_to_stock outbox
Tests: Event exists after return; outbox payload correct; atomic with TX
Affected backend: orders.service.ts
Migration: NONE
Blocking: NO — resolved

C-C0-008
Requirement: Cancellation nets RETURN in settlement
Implementation: Extend settleStockForStatus() netting to include RETURN type
Tests: Full return then cancel → RELEASE=0; partial return then cancel → RELEASE=remainder
Affected backend: orders.service.ts settleStockForStatus()
Migration: NONE
Blocking: NO — resolved
```

---

## 35. Out-of-Scope Enforcement

```text
The following are explicitly verified as NOT implemented:

| Check | Enforcement |
|-------|-------------|
| No order FSM changes | TRANSITIONS map unchanged |
| No master-order FSM changes | recalculateMasterOrderStatus not called |
| No new exception FSM state | EXCEPTION_TRANSITIONS unchanged |
| No migration | No new file in infra/drizzle/migrations/ |
| No financial refund | No refund tables, no refund logic |
| No carrier interaction | No carrier API calls in return flow |
| No buyer return | No buyer authorization for return endpoint |
| No notification expansion | No new notification templates |
| No photo evidence | No image/file upload |
| No automatic redelivery | No worker or scheduled task |
| No RMA workflow | No return authorization table |
```

---

## 36. Final Lock Decision

```text
========================================
SCS-M7.3-C BUSINESS RULES + ARCHITECTURE LOCK
========================================

Status: LOCKED

Open Business Decisions: 0
Open Blocking Architecture Decisions: 0
Implementation Conditions: ALL RESOLVED (8/8)

Business decisions locked: 8
  BD-C0-001 through BD-C0-008

Architecture decisions locked: 3
  ADR-C0-001 through ADR-C0-003

Production Code Modified: NO
Frontend Code Modified: NO
Tests Modified: NO
Migrations Added: NO
Schema Modified: NO
Implementation Started: NO

IMPLEMENTATION AUTHORIZATION:
GRANTED

NEXT STAGE:
M7.3-C IMPLEMENTATION
========================================
```
