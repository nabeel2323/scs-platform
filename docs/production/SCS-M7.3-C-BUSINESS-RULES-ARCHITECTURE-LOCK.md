# SCS-M7.3-C — BUSINESS RULES + ARCHITECTURE DECISION LOCK

## Returns — Inventory Return-to-Stock + RTS Physical Handling

| Field | Value |
|-------|-------|
| Milestone | M7.3-C |
| Phase | Business Rules + Architecture Decision Lock |
| Status | **LOCKED** |
| Baseline | `develop` @ `229949f934f6bfe447d4bce600a84fcbfe4dc365` (verified, clean tree) |
| Authoritative Input | docs/production/SCS-M7.3-C-FRESH-ARCHITECTURE-AUDIT.md (GO WITH CONDITIONS) |
| Supersedes | SCS-M7.3-C-BUSINESS-RULES-ARCHITECTURE-LOCK.md (B.5 `5c6649d`) — **NOT authoritative** |
| Parent Lock | SCS-M7.3-B-BUSINESS-RULES-ARCHITECTURE-LOCK.md (LOCKED) |
| Predecessor Milestone | M7.3-B.6 — CLOSED / PASS |
| Business Decisions | 8/8 resolved (BCF-001 … BCF-008) |
| Architecture Decisions | 12/12 resolved (ACF-001 … ACF-012) |
| Migration | **NONE** |
| Implementation | **AUTHORIZED** (specification only in this phase — no code written here) |
| Next Gate | M7.3-C — Implementation |

---

## 1. Lock Identity

This document converts the fresh, post-B.6 architecture audit into a formally locked, implementation-ready specification for M7.3-C. It is the **sole authoritative** M7.3-C decision baseline. The earlier B.5-based lock is superseded in full (see §31); its implementation authorization is **void**.

All 8 open business decisions and 12 architecture decisions surfaced by the audit are resolved here with **no TBDs**. Every resolution is grounded in code verified against `229949f`. This phase writes **no** code, tests, migrations, endpoints, or UI — only this specification.

**Business objective (revised):** When an RTS confirms the physical return of **pre-SALE** goods, the inventory ledger must release the outstanding reservation (and, for non-sellable conditions, write the units off), recording quantity, condition, and warehouse — **without inflating `qty_on_hand`,** without touching the order/master/shipment/exception FSMs, carrier integrations, or financial settlement.

---

## 2. Authoritative Documents

| Document | Role | Baseline | Status |
|----------|------|----------|--------|
| SCS-M7.3-C-FRESH-ARCHITECTURE-AUDIT.md | Primary input to this lock | `229949f` | Authoritative input |
| This document | The locked M7.3-C specification | `229949f` | LOCKED |
| SCS-M7.3-B-BUSINESS-RULES-ARCHITECTURE-LOCK.md | Parent lock (cancellation/RTS precedence) | — | LOCKED |
| SCS-M7.3-B.6-RELEASE-CLOSURE.md | Predecessor closure | `d554fd7` docs / HEAD `229949f` | CLOSED / PASS |
| SCS-M7.3-C-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md | Historical audit | `5c6649d` | Traceability only |
| SCS-M7.3-C-BUSINESS-RULES-ARCHITECTURE-LOCK.md (previous) | Historical lock | `5c6649d` | **SUPERSEDED** |

---

## 3. Current Baseline

```text
branch:        develop
HEAD:          229949f934f6bfe447d4bce600a84fcbfe4dc365
working tree:  CLEAN
```

`229949f` is the B.6 **code** commit (child of the docs-only `d554fd7`). The B.6 server change relevant to M7.3-C is confined to buyer-projection filtering (`BUYER_INTERNAL_EVENT_TYPES`, L911-916) and read surfaces (`shipment-operations.controller.ts` GET list/detail); it altered **no** inventory, settlement, reservation, or RTS-transition logic. The RTS/exception FSM and the inventory ledger behave as audited.

Do **not** revert to `5c6649d` or reuse its lock.

---

## 4. Superseded Historical Decisions

The historical lock's inventory model rests on `RETURN = +qty_on_hand`. Verified against `229949f`, that premise is invalid for in-scope RTS returns (§8). Disposition of each historical decision:

| Historical | Disposition | Replaced by |
|------------|-------------|-------------|
| BD-C0-001 (no order FSM change) | **RETAINED** | BCF/ACF-012 |
| BD-C0-002 (separate explicit endpoint) | **RETAINED** | ACF-002 |
| BD-C0-003 (LOST no movement) | **RETAINED + sharpened** | BCF-003 |
| BD-C0-004 (DAMAGED → RETURN +qty_on_hand) | **REVOKED** | BCF-001 + BCF-002 |
| BD-C0-005 (cancellation nets RETURN) | **SUPERSEDED** (RETURN not used; RELEASE already nets) | BCF-001 + ACF-003 |
| BD-C0-006 (partial item-level) | **RETAINED as decided model** | BCF-004 |
| BD-C0-007 (qty in movements.quantity) | **RETAINED** | BCF-004 |
| BD-C0-008 (condition in metadata) | **RETAINED** | ACF-004 |
| ADR-C0-001/002/003 | RETAINED (endpoint / no-migration / reservation-traced warehouse) | ACF-002 / §26 / BCF-005 |

---

## 5. Business Objective

Record the physical consequence of a completed pre-SALE RTS in the inventory ledger correctly and idempotently, expose it as an explicit operator action, keep it invisible to buyers, and leave financial refund automation to M7.3-D.

---

## 6. Scope

### IN SCOPE
1. Pre-SALE physical RTS return handling (movement semantics).
2. Return quantity (per line).
3. Return condition (controlled vocabulary).
4. Correct warehouse resolution from the original reservation.
5. Reservation release + condition-driven write-off.
6. LOST protection (never restock a lost shipment).
7. Partial / item-level return.
8. Return idempotency.
9. Concurrency (cancellation-wins; serialized returns).
10. Shipment return events.
11. Outbox events for M7.3-D.
12. Buyer-projection protection for new events.
13. Admin/merchant authorization + new write permission name.
14. Tenant isolation.
15. B.6 console integration (contract only).

### OUT OF SCOPE
See §28 (Scope Exclusions) — enumerated exhaustively there.

---

## 7. Locked Business Rules (summary)

```text
RULE-1  Return operates ONLY on a shipment whose exception_status = RTS_COMPLETED.
RULE-2  Return is pre-SALE: qty_on_hand is NEVER incremented by the return itself.
RULE-3  Physical return of GOOD goods = RELEASE the outstanding reservation.
RULE-4  Physical return of non-sellable goods = RELEASE, then ADJUST-out the unit(s).
RULE-5  LOST creates NO inventory movement; /return MUST reject a LOST shipment.
RULE-6  Warehouse is server-resolved from the original RESERVE movement; never client-supplied.
RULE-7  Return is idempotent by operation fingerprint; replays never double-release.
RULE-8  Cancellation always wins over / runs after return without double-release (ledger netting).
RULE-9  No order/master/shipment/exception FSM state is added or changed.
RULE-10 Every new internal return event is hidden from the buyer projection.
RULE-11 No migration; condition + quantity live in existing stock_movements columns.
```

---

## 8. BCF-001 Resolution — Movement Semantics

> What inventory movement represents the physical return of a pre-SALE RTS shipment?

**LOCKED: Option A — RELEASE semantics.** Option C (RETURN `+qty_on_hand`) is **explicitly rejected** for M7.3-C.

Verified premise: an RTS shipment is at `OUT_FOR_DELIVERY`; SALE fires **only** at `DELIVERED` ([settleStockForStatus L3144-3146](file:///c:/TAIF/scs-platform/apps/api/src/modules/orders/orders.service.ts#L3144-L3146)), so at RTS time `qty_reserved` still holds the units and `qty_on_hand` was never decremented. Incrementing `qty_on_hand` would double-count.

Counter effects of the locked return movement (GOOD):

```text
qty_reserved:  GREATEST(qty_reserved - returnedQty, 0)     // decremented
qty_on_hand:   unchanged
qty_available: increases (generated column = qty_on_hand - qty_reserved)
movement:      stock_movements(movement_type='RELEASE', quantity=+returnedQty,
               referenceType='ORDER', referenceId=orderId, inventoryItemId=<origin>)
```

**RETURN vocabulary is NOT used by M7.3-C.** The DB `RETURN`/`CANCEL` types (`0020` CHECK) remain reserved for the later post-delivery RMA milestone, where a genuine SALE-first sequence makes `RETURN = +qty_on_hand` correct.

**Rationale for A over B:** the existing settlement netting already understands `RELEASE` (§17/ACF-003), so choosing RELEASE needs **no** netting change and makes cancellation-vs-return idempotency fall out for free; Option B (`CANCEL`) is ignored by the netting (delta 0) and would require code change plus a double-release proof. Option A is the correctness-preserving minimum.

---

## 9. BCF-002 Resolution — DAMAGED / DEFECTIVE / UNSALEABLE

**LOCKED: Model A — RELEASE + condition-driven ADJUST-out write-off.**

```text
GOOD:
    RELEASE only                       → unit returns to sellable availability
DAMAGED / DEFECTIVE / UNSALEABLE:
    RELEASE (clear reservation),  THEN
    ADJUST-out for the returned qty    → qty_on_hand -= returnedQty (write-off; NOT sellable)
```

Counter effects for a non-sellable return of `k` units of an item with `qty_on_hand=H`, `qty_reserved=n`:

```text
after RELEASE:    qty_reserved = n - k        qty_on_hand = H          available unchanged for these k
after ADJUST-out: qty_reserved = n - k        qty_on_hand = H - k       available unchanged (k removed from both)
```

**Hard ordering invariant (evidence-derived):** ADJUST-out MUST follow RELEASE within the same transaction. [adjustStock L271-284](file:///c:/TAIF/scs-platform/apps/api/src/modules/inventory/inventory.service.ts#L271-L284) rejects any negative adjustment that drives `qty_on_hand` below `qty_reserved`. Releasing first lowers the reserved floor so the write-off passes; reversing the order can fail the guard for reserved units.

Rejected alternatives: Model B (metadata-only) would return damaged goods to **sellable** availability — inventory-incorrect. Model C (dedicated non-sellable location) introduces a new inventory model the brief forbids "merely for convenience". Model A preserves correctness with zero new structures.

---

## 10. BCF-003 Resolution — LOST

**LOCKED:**

- A LOST shipment produces **zero** inventory movement — no RELEASE, no ADJUST, no RETURN.
- `POST /v1/shipments/:id/return` **MUST reject** a shipment whose `exception_type = 'LOST'` with **409 Conflict**; no event/outbox is emitted on rejection.
- The LOST reservation **remains outstanding** and is released **only** by order cancellation (cancelOrder → `settleStockForStatus('CANCELLED')`). Cancellation is the sole release authority; no separate LOST terminal operation is introduced in M7.3-C.
- **Rationale:** LOST goods are unrecoverable — physically restocking would inflate stock; auto-releasing at RTS would race with, and be preempted by, the authoritative cancellation path (RULE-8, parent M7.3-B lock: cancellation always wins).
- Event representation: LOST is already audited by its RTS events (`RTS_REQUESTED`/`RTS_APPROVED`, L2684-2702). M7.3-C adds no LOST-specific event.

---

## 11. BCF-004 Resolution — Full vs Partial Return

**LOCKED: item-level partial return, movement-per-line, migration-free.**

- Each return request carries one entry per line: `{ orderItemId, quantity, condition }`.
- Per-line `quantity` is written to `stock_movements.quantity` (BD-C0-007 retained).
- **Maximum returnable per line** = reserved quantity for that line's `inventoryItemId` (magnitude of its `RESERVE` movement) **minus** cumulative already-returned quantity for that same `(orderId, inventoryItemId)`.
- **Cumulative returned** = Σ of prior return `RELEASE` movements for `(orderId, inventoryItemId)` (identified by `metadata.return`, see ACF-004/ACF-007). Enforced: `cumulative + new ≤ reserved`.
- Multiple return operations on the same shipment are permitted until every line reaches its cap.
- Over-return (`new > remaining`) → **409**.
- Concurrent partial returns on the same inventory item are serialized by `SELECT ... FOR UPDATE` + in-transaction recompute of remaining (ACF-006/ACF-008).
- No first-class `qty_returned` column is introduced; cumulative state is derived from the append-only ledger (idempotent + race-safe under the FOR UPDATE serialization). A migration is deliberately avoided (§26).

---

## 12. BCF-005 Resolution — Warehouse Destination Rule

**LOCKED: hard invariant — return destination is resolved from the original reservation, per line.**

```text
order → RESERVE movement (referenceType='ORDER', referenceId=orderId)
      → stock_movements.inventoryItemId
      → inventory_items.warehouseId   (authoritative destination)
```

- `shipments.storeId` does **not** identify a warehouse; `warehouses` is keyed by `storeId` with **no unique constraint** (multiple warehouses per store, [merchant.schema L36-46](file:///c:/TAIF/scs-platform/apps/api/src/modules/merchant/merchant.schema.ts#L36-L46)).
- The implementation **MUST NOT**: select the store's first warehouse; select a store default; or accept a client-supplied `warehouseId`/`inventoryItemId`.
- Multi-line orders that reserved across different warehouses resolve **each line independently** (reservation breaks at the first in-stock warehouse per line, L3056-3099, so origin differs per line).

---

## 13. BCF-006 Resolution — Return Idempotency / Duplicate Key

**LOCKED: operation-fingerprint idempotency, mirroring the existing `computeCheckoutFingerprint` pattern ([L3286-3309](file:///c:/TAIF/scs-platform/apps/api/src/modules/orders/orders.service.ts#L3286-L3309)).**

- **Line identity** = `shipmentId + orderItemId` (which line).
- **Operation identity (fingerprint)** = SHA-256 over the sorted request lines `orderItemId:quantity:condition`, recorded in `stock_movements.metadata.return.fingerprint`.
- Semantics:
  ```text
  replay of same shipment + same fingerprint (already present)  → return original result (200), NO new movement/event/outbox
  same line, DIFFERENT quantity/fingerprint                      → treated as a NEW operation (allowed, capped by BCF-004)
  same line, multiple distinct valid partial returns             → each carries its own fingerprint; all counted toward cumulative cap
  concurrent identical requests                                  → FOR UPDATE serializes; loser re-checks fingerprint, then returns original result (no double release)
  ```
- The fingerprint rule **must** prevent duplicate inventory release (RULE-7) while not blocking legitimate later partial returns (different fingerprint).

---

## 14. BCF-007 Resolution — Buyer / Post-Delivery RMA

**LOCKED: EXCLUDED from M7.3-C.** Deferred to the later buyer-return/RMA milestone (M7.3-E).

Verified absent in the current repo: buyer return endpoint, RMA schema/table, `RETURNED` order state, buyer return UI. Post-delivery restock is precisely the `RETURN = +qty_on_hand` semantic that is only correct **after** a SALE — out of place for pre-SALE RTS.

Preserved boundary:
```text
M7.3-C:  pre-SALE physical RTS inventory handling (RELEASE / write-off)
M7.3-E:  post-DELIVERED buyer return + true RETURN / +qty_on_hand semantics
```
No buyer RMA is designed or implemented in M7.3-C.

---

## 15. BCF-008 Resolution — Return Confirmation Actor

**LOCKED authorization model (mirrors `completeRTS` guard, L2480-2497):**

| Actor | Return allowed | Scope |
|-------|----------------|-------|
| ADMIN / SUPER_ADMIN / MODERATOR | YES | any store |
| MERCHANT_OWNER / MERCHANT_STAFF / MERCHANT_MANAGER | YES | own store only |
| DRIVER | NO | — |
| BUYER | NO | — |

- Tenant enforcement reuses `assertShipmentAccessibleForException(shipment, caller)` — merchant must match the shipment's store org; admin bypasses; driver/buyer denied.
- **New, distinct WRITE permission is required:** `fulfillment:shipments:return`. It **must not** be inferred from B.6's `fulfillment:shipments:read` grant. The permission is *named* here; it is seeded only during implementation under this authorization.
- Actor type for the event is resolved via the existing `resolveActorType` (L937-945) → `MERCHANT` | `ADMIN`.

---

## 16. Architecture Decisions (ACF-001 … ACF-012)

| ID | Decision | Resolution |
|----|----------|-----------|
| **ACF-001** | Transaction boundary | Movement(s) + `shipment_events` + `outbox` atomic in one PG TX; `SELECT … FOR UPDATE` on each target `inventory_items` row. Any failure → full rollback. **No partial movement, no orphan event, no orphan outbox.** |
| **ACF-002** | Explicit endpoint vs auto | Separate `POST /v1/shipments/:id/return`; **never** a side effect of `/rts/complete` (`completeRTS` stays inventory-free, L2475-2573). Condition/qty known only after physical inspection; LOST must not auto-restock. |
| **ACF-003** | Settlement-netting interaction | **NO change to `settleStockForStatus`.** Return writes `RELEASE` with `referenceType='ORDER'`, which the existing netting (`RESERVE − RELEASE − SALE`, L3161-3172) already subtracts → later cancellation releases only the remainder, idempotently. RETURN/CANCEL semantics unused, so no netting extension required. |
| **ACF-004** | Condition/disposition model | Vocabulary `GOOD/DAMAGED/DEFECTIVE/UNSALEABLE` in `stock_movements.metadata` (shape §24). Operational meaning bound to BCF-002 (GOOD→sellable; others→written off). |
| **ACF-005** | Warehouse resolution | Server-resolved from reservation (BCF-005); per line; never client-supplied; never store-first/default. |
| **ACF-006** | Concurrency | 9-step model §22; race policy **CANCELLATION-WINS** (parent M7.3-B lock). |
| **ACF-007** | Idempotency | Operation-fingerprint replay semantics (BCF-006). |
| **ACF-008** | Partial representation | Movement-per-line; cumulative cap enforced by ledger recompute under FOR UPDATE; block `returned > reserved`. |
| **ACF-009** | Events/outbox + buyer filter | `shipment_events.RETURN_PROCESSED` + `outbox shipment.return_processed`; **MANDATORY** addition to `BUYER_INTERNAL_EVENT_TYPES`. |
| **ACF-010** | API boundary | Contract §17/§24. |
| **ACF-011** | UI boundary | Reuse B.6 consoles; additive controls. |
| **ACF-012** | Order-FSM boundary | No new order/master/shipment/exception state (§26 note; verified `TRANSITIONS` has no RETURNED, L3333-3350). |

---

## 17. API Contract (locked)

New endpoint: `POST /v1/shipments/:id/return`

**Request (trusted = shipment id + line intent only):**
```json
{
  "lines": [
    { "orderItemId": "uuid", "quantity": 2, "condition": "GOOD" }
  ]
}
```
- Server **rejects** client-supplied `warehouseId`, `inventoryItemId`, `qtyOnHand`, or price fields (400) — inventory/warehouse are resolved from the reservation.
- `condition` required per line and must be in the locked vocabulary; `quantity` integer ≥ 1.

**Response (200):**
```json
{
  "shipmentId": "uuid",
  "orderId": "uuid",
  "idempotent": false,
  "linesReturned": [
    { "orderItemId": "uuid", "inventoryItemId": "uuid", "warehouseId": "uuid",
      "quantity": 2, "condition": "GOOD", "writtenOff": false }
  ],
  "returnEventId": "uuid"
}
```

**State precondition:** `exception_status = RTS_COMPLETED` **and** `exception_type ≠ 'LOST'` **and** order not `CANCELLED`.

---

## 18. UI Contract (locked — additive on B.6 pages, not built here)

- **Merchant:** `apps/web/src/app/merchant/deliveries/[id]` — add a "Record Return" action on eligible (`RTS_COMPLETED`, non-LOST) shipments.
- **Admin:** `apps/admin/src/app/shipments/[id]` — same action, any store.
- The form: lists eligible lines with remaining returnable quantity; collects `quantity` + `condition` per line; shows server-resolved warehouse **read-only**; no warehouse selector; renders result + validation/conflict errors.
- **Buyer:** NO new return controls (return is internal).
- **Driver/mobile:** NO return operation.

---

## 19. Authorization (locked)

Guard order (mirror `completeRTS`): resolve caller role → require one of `MERCHANT_OWNER/STAFF/MANAGER` or `ADMIN/SUPER_ADMIN/MODERATOR` → require permission `fulfillment:shipments:return` → tenant check via `assertShipmentAccessibleForException`. DRIVER/BUYER → 403. Permissions are not changed by this phase; the new write permission is named for implementation-time seeding.

---

## 20. Tenant Isolation (locked)

- Merchant operations restricted to shipments whose `store_id` belongs to the caller's org, enforced by `assertShipmentAccessibleForException` (L2497/L2740).
- Admin bypasses store scoping but is still audited (`actorType='ADMIN'`).
- Inventory items touched are always the org's own (derived from the order's reservation), so no cross-org `inventory_items` row is ever targeted.
- No new tenant model introduced.

---

## 21. Inventory Semantics (locked — canonical ledger effects)

For a return of `k` units of `(orderId, inventoryItemId)` reserved quantity `n`:

```text
GOOD:
  inventory_items.qty_reserved = GREATEST(qty_reserved - k, 0)
  inventory_items.qty_on_hand  = unchanged
  movement:  RELEASE   quantity = +k   metadata.return{condition:'GOOD', fingerprint}

DAMAGED / DEFECTIVE / UNSALEABLE:
  (1) RELEASE   qty_reserved = GREATEST(qty_reserved - k, 0);  movement quantity = +k
  (2) ADJUST    qty_on_hand  = GREATEST(qty_on_hand - k, 0);   movement quantity = -k
      metadata.return{condition, fingerprint} on both;  ordering (1)→(2) mandatory (BCF-002)

qty_available (generated): GOOD → +k ; non-sellable → unchanged
RETURN / CANCEL movement_type: NEVER written by M7.3-C
```

All writes in one TX, each target row locked with `SELECT … FOR UPDATE` before update; the same netting contract that already governs cancellation SALE/RELEASE applies.

---

## 22. Concurrency (locked — 9-step + cancellation-wins)

```text
1. Load + validate shipment state (RTS_COMPLETED, not LOST, order not CANCELLED).
2. Authorize + tenant-check caller.
3. Resolve per-line inventoryItemId + warehouseId from the original RESERVE movement.
4. SELECT ... FOR UPDATE each target inventory_items row (deterministic order by inventoryItemId to avoid deadlock).
5. Recompute remaining returnable per line from the ledger (reserved − cumulative returned).
6. Validate new quantities ≤ remaining; else 409 over-return.
7. Apply RELEASE (+ mandatory ADJUST-out) counter updates.
8. Insert shipment_events.RETURN_PROCESSED + outbox shipment.return_processed.
9. Commit atomically.
```

**CANCELLATION-WINS:**
- If cancellation commits first → order `CANCELLED`, exception `CLOSED`; a subsequent `/return` fails precondition (RULE-1/§17) → **409**; no release occurs (cancellation already settled).
- If return commits first → a subsequent cancellation's `settleStockForStatus` recomputes outstanding (already net of the return's RELEASE) and releases **only the remainder** → no double release (ACF-003).
- Concurrent return vs return vs adjustment serialize on the same FOR UPDATE row locks.

---

## 23. Idempotency (locked)

- Replay of the identical operation (same `shipmentId` + `metadata.return.fingerprint`) → **200 returning the original result**, with `idempotent: true`, and **no** second movement / release / event / outbox.
- A genuinely different operation (different quantity/condition → different fingerprint) is processed normally, subject to the cumulative cap.
- The fingerprint is recomputed inside the transaction after the FOR UPDATE lock, so two simultaneous identical requests cannot both insert movements (the second sees the first's fingerprint and short-circuits to the original result).

---

## 24. Events / Outbox (locked names + payload)

Canonical names (use exactly):

```text
shipment_events.event_type : "RETURN_PROCESSED"   (VARCHAR(40), fits)
outbox_events.event_type   : "shipment.return_processed"
```

`shipment_events.metadata.return` (single authoritative shape):
```json
{
  "return": {
    "shipmentId": "uuid",
    "fingerprint": "sha256hex",
    "actorType": "MERCHANT | ADMIN",
    "lines": [
      { "orderItemId": "uuid", "inventoryItemId": "uuid", "warehouseId": "uuid",
        "quantity": 2, "condition": "GOOD|DAMAGED|DEFECTIVE|UNSALEABLE",
        "writtenOff": false }
    ]
  }
}
```

`stock_movements.metadata` carries the same `return` block (per-movement, filtered to that line) so cumulative-return counting and idempotency are ledger-derivable. The outbox payload includes `shipmentId`, `orderId`, `storeId`, and the `lines[]` (quantity + condition) — sufficient for M7.3-D refunds **without** M7.3-C implementing any financial effect (milestone boundary preserved).

---

## 25. Buyer Projection Boundary (mandatory invariant)

Because B.6 closed a buyer-projection leak, **every** new internal return event MUST be excluded from the buyer tracking projection. Implementation MUST add `RETURN_PROCESSED` to `BUYER_INTERNAL_EVENT_TYPES` (L911-916) — the set consumed by `getTracking()`. A return event that is not in this set is a **release-blocking defect**. Buyers continue to see only the derived `buyerDeliveryNote()` state; no raw return/RTS event reaches them.

---

## 26. Database / Migration Decision

**LOCKED: NO MIGRATION.**

The chosen model needs no schema change:
- Movement type — `RELEASE`/`ADJUST` already permitted (`0020` CHECK L33-35).
- Quantity — signed `stock_movements.quantity`.
- Condition + fingerprint + warehouse — `stock_movements.metadata` / `shipment_events.metadata` JSONB.
- Warehouse — derived from existing `RESERVE` movement `inventoryItemId`.
- Cumulative enforcement — derived by ledger scan under `FOR UPDATE`, not a first-class column.

Had a DB-enforced `qty_returned` cap or a dedicated `shipment_return_lines` table been required, `0051` would have been specified. They are **not** required; the append-only ledger is the single source of truth, which also keeps settlement netting (§ACF-003) correct. **No `0051` is created in this phase or authorized.**

---

## 27. Testing Contract (mandatory implementation gates)

**Unit** — condition validation (required + vocabulary), quantity validation (≥1, ≤remaining), warehouse resolution from `inventoryItemId`, LOST guard, authorization (merchant own-store / admin any / driver+buyer denied), idempotency (fingerprint replay), movement semantics (GOOD=RELEASE-only; non-sellable=RELEASE+ADJUST; ordering).

**PostgreSQL integration** — actual movement written; `qty_reserved` ↓, `qty_on_hand` unchanged for GOOD / ↓ for non-sellable, `qty_available` generated value observed; full return; partial (multi-line, multi-op); duplicate (fingerprint) returns original with no second release; LOST rejection (409, no movement); DAMAGED/DEFECTIVE/UNSALEABLE write-off; **return/cancellation race both orders**; concurrent returns; return/release race; event atomicity (rollback removes movement + event + outbox together); outbox atomicity; tenant isolation.

**Playwright (after implementation)** — merchant return happy path; admin return path; LOST rejection; buyer does **not** see the internal `RETURN_PROCESSED` event.

Implementation may not be declared complete without the applicable tests.

---

## 28. Scope Exclusions (locked)

```text
1. Financial refunds                      → M7.3-D
2. Payment-provider interaction           → M7.3-D
3. Credit notes / financial settlement    → M7.3-D
4. Buyer post-delivery RMA                → M7.3-E (BCF-007)
5. Post-DELIVERED restock (RETURN +on_hand)→ M7.3-E
6. New order / master-order / shipment / exception FSM states  → none (ACF-012)
7. Carrier return API                     → not modeled
8. Reconciliation worker                  → not required
9. Automatic redelivery                   → out
10. Photo evidence                        → out
11. Notification expansion                → M7.3-F
12. Unrelated carrier configuration        → out
```

Scope does not expand silently; any addition requires a fresh lock amendment.

---

## 29. Implementation Conditions (carry into coding phase)

```text
CI-01  Use RELEASE semantics; NEVER write RETURN/CANCEL for RTS return (BCF-001).
CI-02  Non-sellable write-off MUST order RELEASE before ADJUST-out (adjustStock reserved-floor guard).
CI-03  Reject /return when exception_type='LOST' (409) before any movement.
CI-04  Resolve warehouse per line from RESERVE movement inventoryItemId; ignore storeId for routing.
CI-05  Recompute cumulative return inside the FOR UPDATE transaction; cap at reserved.
CI-06  Implement operation-fingerprint idempotency mirroring computeCheckoutFingerprint.
CI-07  Reuse settleStockForStatus unchanged; assert no netting modification is needed (ACF-003).
CI-08  Add RETURN_PROCESSED to BUYER_INTERNAL_EVENT_TYPES in the same change that emits it.
CI-09  Emit shipment.return_processed outbox atomically with movement + event.
CI-10  Enforce authorization via assertShipmentAccessibleForException + new fulfillment:shipments:return.
CI-11  Deterministic row-lock ordering (sort inventoryItemId) to prevent deadlock.
CI-12  No migration; no schema change; no seed beyond the permission named here.
```

---

## 30. Risks and Mitigations

| ID | Risk | P | I | Mitigation (locked) | Blocking? |
|----|------|---|---|---------------------|-----------|
| R-01 | Inventory **inflation** via RETURN +qty_on_hand | H | H | RELEASE semantics (BCF-001); RETURN unused | Resolved |
| R-02 | Return/cancellation **double release** | H | H | Existing netting subtracts return RELEASE (ACF-003); cancellation-wins precondition (ACF-006) | Resolved |
| R-03 | **LOST** mis-restock | M | H | Hard 409 guard before any movement (BCF-003) | Resolved |
| R-04 | **Wrong warehouse** (multi-warehouse) | M | H→L | Server-resolved per line from reservation (BCF-005) | Resolved |
| R-05 | **Damaged becomes sellable** | M | M | Model A write-off (BCF-002) | Resolved |
| R-06 | **Over/partial return** inconsistency | M | M | Ledger cumulative cap under FOR UPDATE (BCF-004) | Resolved |
| R-07 | **Duplicate** return | M | M | Operation fingerprint (BCF-006) | Resolved |
| R-08 | **Tenant/auth bypass** | L | H | Reuse accessor guard + named write permission (BCF-008) | Resolved |
| R-09 | **Buyer leak** of return event | M | H | Mandatory BUYER_INTERNAL_EVENT_TYPES addition (§25) | Resolved |
| R-10 | **Scope creep** into refunds | M | M | Milestone boundary §28; M7.3-C emits events only | Resolved |

All previously-HIGH risks (R-01, R-02, R-03) are addressed by explicit locked rules; none remain blocking.

---

## 31. Historical Decision Revocations

```text
REVOKED — Historical BD-C0-004:
  "DAMAGED RTS → RETURN → +qty_on_hand"
  is REVOKED for M7.3-C pre-SALE RTS. Replaced by BCF-001 (RELEASE) + BCF-002
  (RELEASE then ADJUST-out write-off). Incrementing qty_on_hand would inflate
  stock because the SALE decrement never occurred for an OUT_FOR_DELIVERY order.

SUPERSEDED — Historical BD-C0-005:
  "cancellation nets RETURN (outstanding = RESERVE − RELEASE − SALE − RETURN)"
  is SUPERSEDED. RETURN is not used, so the "− RETURN" term is moot; the real
  interaction is handled automatically because returns write RELEASE, which the
  existing settleStockForStatus netting already subtracts. No netting change.

VOID — Historical lock authorization:
  The previous M7.3-C lock's "implementation authorization granted" (against B.5
  5c6649d) is SUPERSEDED and VOID. An implementation agent MUST treat THIS
  document (baseline 229949f) as the only authoritative M7.3-C specification.
```

---

## 32. Implementation Authorization

```text
BCF resolved: 8/8   (BCF-001 … BCF-008)
ACF resolved: 12/12 (ACF-001 … ACF-012)
Migration:    NONE
Inventory-inflation premise: REVOKED and corrected
```

Every blocking business and architecture decision is explicitly resolved with repository-verified semantics; no TBDs remain.

```text
M7.3-C BUSINESS RULES + ARCHITECTURE DECISION LOCK
STATUS: LOCKED

Implementation: AUTHORIZED
```

Authorization to *begin implementation* is granted **to the next phase only**. This document itself contains **no** code, test, migration, endpoint, or UI change.

---

## 33. Next Gate

```text
M7.3-C IMPLEMENTATION
```

Implementation must follow §29 (CI-01…CI-12) and be gated by the §27 testing contract, then proceed to independent runtime verification and release closure per the four-gate sequence. No runtime verification, matrix update, or M7.3-D work begins from this lock.

---

*End of M7.3-C Business Rules + Architecture Decision Lock. Baseline `229949f`; working tree clean; supersedes the B.5-based lock; no production code, tests, migrations, endpoints, or UI modified in this phase.*
