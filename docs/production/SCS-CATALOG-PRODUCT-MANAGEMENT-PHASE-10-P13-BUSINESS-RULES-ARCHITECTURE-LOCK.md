# P13 — Business Rules & Architecture Lock

**Phase**: P13 — Returns, Refunds & Disputes Integration  
**Date**: 2026-10-09  
**Predecessor**: P12 = CLOSED / PASS  
**P13 Audit**: COMPLETE  
**Gate**: P13 BUSINESS RULES & ARCHITECTURE LOCK  

---

## 1. Executive Decision

This document locks all business rules and architecture decisions for P13 implementation. It is written so that a coding agent can implement P13 without making any unresolved business decisions.

**Critical finding from P13 audit**: The disputes workflow (`reviews/disputes.service.ts`) is not connected to the payment/refund lifecycle (`payments/payments.service.ts`). There is no formal return request, inspection, or buyer-initiated return-to-stock workflow. P12 implemented the refund infrastructure (`requestRefund()`, `approveRefund()`) but these methods are not callable from disputes or order lifecycle.

**Key decisions locked in this document:**

| ID | Decision | Verdict |
|----|----------|---------|
| BD-P13-001 | Return request workflow | **APPROVED** — new `return_requests` table + FSM |
| BD-P13-002 | Dispute-to-refund integration | **APPROVED** — disputes may create refund requests, not directly approve |
| BD-P13-003 | Inventory restoration | **APPROVED** — after inspection, GOOD → sellable, others → write-off |
| BD-P13-004 | Return window | **14 days** from DELIVERED (not 7 as audit proposed) |
| BD-P13-005 | Return shipping | **DEFERRED** — buyer-arranged manual handover only; no carrier integration |
| BD-P13-006 | Buyer UI | **APPROVED** — web only; mobile deferred |
| BD-P13-007 | Merchant inspection UI | **APPROVED** — web only |
| BD-P13-008 | Admin oversight | **APPROVED** — web admin pages |
| BD-P13-009 | Migration | **REQUIRED** — migration 0059 |
| BD-P13-010 | Financial immutability | **PRESERVED** — no breakdown mutation; refund tracked via `refunds` table |

**P13 scope**: Return request lifecycle, dispute-to-refund wiring, inventory restoration on accepted returns, settlement adjustment, web buyer/merchant/admin UI, migration 0059.

**Out of scope**: Return carrier integration, mobile return UI, chargebacks, legal/tax policy, automated refund approval, payout execution.

---

## 2. Verified Baseline

| Item | Value |
|------|-------|
| Branch | `develop` |
| Latest migration | 0058_payment_financial_architecture.sql |
| Total migrations | 58 |
| Order FSM | 18 statuses (DRAFT through DISPUTED, including PAYMENT_PENDING, PAYMENT_CONFIRMED) |
| DISPUTED | Terminal state reachable from DELIVERED and COMPLETED |
| Payment FSM | 14 states (CREATED through REFUND_FAILED) |
| Refund infrastructure | `requestRefund()`, `approveRefund()` — admin-only approval, FOR UPDATE locking |
| Settlement | `calculateSettlement()` — formula: `net = gross - refunds - commission - fees` |
| Financial immutability | `finalizeFinancialBreakdown()` — `finalizedAt IS NULL` guard |
| Disputes | `disputes.service.ts` — OPEN → EVIDENCE → RESPONSE → REVIEW → RESOLVED/CLOSED |
| Dispute window | 72h from DELIVERED |
| Dispute-financial link | **NONE** — disputes have no import of payments service |
| M7.3-C return-to-stock | `recordReturn()` — RELEASE + ADJUST-out for writeoff conditions |
| Return conditions | GOOD, DAMAGED, DEFECTIVE, UNSALEABLE |
| Stock movement types | ADJUST, RESERVE, RELEASE, SALE, CANCEL, IMPORT, RETURN (CHECK constraint in migration 0020) |
| Inventory reservation | FOR UPDATE on inventory_items at merchant acceptance |
| Idempotency | Payment records, refunds — unique constraints on idempotency_key |
| Outbox | Transactional — `publish()` accepts optional `txClient` |
| Tenant isolation | `assertOrderAccessible()`, `assertStoreInOrg()`, `isTenantPrivileged()` |

**Key verified facts from source inspection:**

1. **Order FSM** (`orders.service.ts` line 3848-3866): DISPUTED is terminal (`DISPUTED: []`). DELIVERED → COMPLETED or DISPUTED. COMPLETED → DISPUTED.
2. **M7.3-C `recordReturn()`** already handles inventory return-to-stock at the shipment level — but this is an operational/shipment-level action, not a buyer-initiated return request.
3. **Refund vocabulary** (`payments.types.ts`): REFUND_REASONS includes CUSTOMER_REQUEST, OUT_OF_STOCK, PRICE_ERROR, etc.
4. **Disputes service** has zero imports from payments — confirmed no financial linkage.
5. **`settlement_records`** has `refund_minor` column — settlement already accounts for refunds.

---

## 3. Scope Decisions

### 3.1 Candidate Capability Evaluation

| # | Capability | Decision | Rationale |
|---|-----------|----------|-----------|
| 1 | Return request workflow | **APPROVED** | Core missing piece — buyer needs structured way to request returns |
| 2 | Dispute-to-refund integration | **APPROVED** | P13-01 from audit; closes the financial loop |
| 3 | Inventory restoration after accepted returns | **APPROVED** | M7.3-C has shipment-level RTS; P13 adds buyer-request-level restoration |
| 4 | Buyer return-request UI and status tracking | **APPROVED (web only)** | Mobile deferred to keep scope bounded |
| 5 | Merchant return approval/rejection and inspection UI | **APPROVED (web only)** | Mobile deferred |
| 6 | Admin return oversight | **APPROVED** | Admin pages for exception queue and return monitoring |
| 7 | Return shipping and carrier integration | **REJECTED** | Aramex exposes no reverse-shipment API; deferred to P14 |

### 3.2 Locked Scope

**IN SCOPE:**
- Return request entity, FSM, and CRUD endpoints
- Return line items (per order_item, with quantity and condition)
- Return events (append-only log)
- Dispute resolution → refund request creation (admin-mediated)
- Refund request → approval flow (using existing P12 `approveRefund()`)
- Inventory restoration on return acceptance (using existing M7.3-C patterns)
- Settlement adjustment when refund succeeds
- Web buyer UI: return initiation, status tracking
- Web merchant UI: return queue, approval/rejection, inspection
- Web admin UI: return oversight, exception queue, dispute-to-refund
- Migration 0059

**OUT OF SCOPE (explicitly deferred):**
- Return carrier integration (no reverse-shipment API exists)
- Return shipping labels
- Mobile return UI (buyer or merchant)
- Chargebacks
- Automated refund approval rules
- Legal/tax policy (jurisdiction-dependent)
- Payout execution (already out of scope in P12)
- XLSX export (separate P2 finding)
- Notification provider integration (separate P2 finding)

---

## 4. Return State Machine

### 4.1 Return Request FSM

```
REQUESTED → MERCHANT_APPROVED → BUYER_SHIPPED → RECEIVED → INSPECTED → REFUND_PENDING → REFUNDED
    │              │                                                                       
    │              └→ MERCHANT_REJECTED (terminal)
    │              
    └→ CANCELLED (buyer cancellation, terminal)
    └→ EXPIRED (no merchant action within SLA, terminal)

REFUND_PENDING → REFUNDED (terminal — refund succeeded)
REFUND_PENDING → REFUND_FAILED → REFUND_PENDING (retry)

INSPECTED → REFUND_PENDING (item accepted)
INSPECTED → REJECTED_AFTER_INSPECTION (item rejected — no refund)
```

### 4.2 Locked Transition Map

```text
BD-P13-RETURN-FSM:

REQUESTED:                    ['MERCHANT_APPROVED', 'MERCHANT_REJECTED', 'CANCELLED', 'EXPIRED']
MERCHANT_APPROVED:            ['BUYER_SHIPPED', 'CANCELLED']
BUYER_SHIPPED:                ['RECEIVED']
RECEIVED:                     ['INSPECTED']
INSPECTED:                    ['REFUND_PENDING', 'REJECTED_AFTER_INSPECTION']
REFUND_PENDING:               ['REFUNDED', 'REFUND_FAILED']
REFUND_FAILED:                ['REFUND_PENDING']
REFUNDED:                     []  (terminal)
MERCHANT_REJECTED:            []  (terminal)
CANCELLED:                    []  (terminal)
EXPIRED:                      []  (terminal)
REJECTED_AFTER_INSPECTION:    []  (terminal)
```

### 4.3 Actors and Authorization

| Transition | Actor | Authorization | Notes |
|-----------|-------|---------------|-------|
| REQUESTED | Buyer | `order.buyerId === caller.sub` | Buyer initiates |
| MERCHANT_APPROVED | Merchant owner/admin | `assertStoreInOrg()` + store membership | Merchant accepts return |
| MERCHANT_REJECTED | Merchant owner/admin | Same | Merchant rejects with mandatory reason |
| CANCELLED | Buyer | `return.buyerId === caller.sub` | Only before MERCHANT_APPROVED |
| EXPIRED | System | N/A | Admin-triggered or scheduled |
| BUYER_SHIPPED | Buyer | `return.buyerId === caller.sub` | Buyer confirms handover |
| RECEIVED | Merchant | `assertStoreInOrg()` | Merchant confirms receipt |
| INSPECTED | Merchant | `assertStoreInOrg()` | Merchant records condition |
| REFUND_PENDING | System | Automatic on INSPECTED (accepted) | Triggers refund flow |
| REFUNDED | System | Automatic on refund approval | P12 `approveRefund()` path |
| REJECTED_AFTER_INSPECTION | Merchant | `assertStoreInOrg()` | Item fails inspection |

### 4.4 Terminal States

- **REFUNDED** — return completed, refund issued
- **MERCHANT_REJECTED** — merchant declined the return request
- **CANCELLED** — buyer withdrew the request
- **EXPIRED** — SLA exceeded without merchant action
- **REJECTED_AFTER_INSPECTION** — item failed inspection, no refund

---

## 5. Eligibility Rules

### 5.1 Order/Sub-Order Eligibility

```text
BD-P13-ELIG-001: Only sub-orders in DELIVERED or COMPLETED status are eligible for return requests.
BD-P13-ELIG-002: The order's payment must be in CONFIRMED, CAPTURED, or PARTIALLY_REFUNDED status.
BD-P13-ELIG-003: CANCELLED, REJECTED, DISPUTED orders are NOT eligible.
BD-P13-ELIG-004: Orders with payment status AWAITING_PAYMENT, AWAITING_VERIFICATION, CREATED are NOT eligible (payment not yet confirmed).
```

**Verified**: The order FSM allows DELIVERED → DISPUTED and COMPLETED → DISPUTED. Return requests are an alternative to disputes, not a prerequisite.

### 5.2 Return Window

```text
BD-P13-WINDOW-001: Return window is 14 days from the sub-order's DELIVERED timestamp.
BD-P13-WINDOW-002: The window starts at the sub-order's `updatedAt` when status transitioned to DELIVERED.
BD-P13-WINDOW-003: If the order transitions DELIVERED → COMPLETED → DISPUTED, the return window is based on the DELIVERED timestamp, not COMPLETED.
BD-P13-WINDOW-004: BUSINESS APPROVAL REQUIRED — 14 days is the proposed default. Jurisdiction-dependent (Syria deployment may require different windows). The value is parameterized via `RETURN_WINDOW_DAYS` env var (default 14).
```

**Note**: The audit proposed 7 days. This lock sets 14 days as the default, parameterized for business adjustment. This is an explicit business decision requiring approval.

### 5.3 Eligible Item Quantities

```text
BD-P13-QTY-001: A return request may reference one or more order_items from the same sub-order.
BD-P13-QTY-002: For each order_item, the return quantity must be > 0 and <= the original ordered quantity.
BD-P13-QTY-003: Cumulative returned quantity per order_item must not exceed the original ordered quantity.
BD-P13-QTY-004: Partial-quantity returns are permitted (e.g., return 3 of 10 units).
```

### 5.4 Maximum Refundable Amount

```text
BD-P13-REFUND-001: Maximum refundable amount per return = SUM(line_unit_price × returned_quantity) for the return's line items.
BD-P13-REFUND-002: The refund amount is calculated from the SNAPSHOT unit_price_minor on order_items (never re-read from offers).
BD-P13-REFUND-003: Delivery fees are NOT refundable unless the entire sub-order is returned (all items, full quantity).
BD-P13-REFUND-004: If the entire sub-order is returned, delivery fees ARE refundable.
BD-P13-REFUND-005: Tax (VAT) is recalculated proportionally on the refund amount.
BD-P13-REFUND-006: Discounts are applied proportionally — the refund reflects the discounted price, not the list price.
BD-P13-REFUND-007: Commission is NOT adjusted on refund — the platform retains its commission (business decision, see §15).
```

### 5.5 Return Reasons and Evidence

```text
BD-P13-REASON-001: Return reasons use the existing REFUND_REASONS vocabulary from payments.types.ts:
  CUSTOMER_REQUEST, MERCHANT_UNABLE_TO_FULFILL, OUT_OF_STOCK, PRICE_ERROR,
  PAYMENT_ERROR, DUPLICATE_CHARGE, PRODUCT_NOT_AS_DESCRIBED, MERCHANT_REJECTION,
  SYSTEM_ERROR, ADMINISTRATIVE, OTHER.
BD-P13-REASON-002: Buyer must provide a reason code and optional text description.
BD-P13-REASON-003: Buyer may attach evidence URLs (images) — stored as JSONB array on the return request.
```

### 5.6 Duplicate Requests

```text
BD-P13-DUP-001: Only ONE active return request per sub-order is permitted at a time.
BD-P13-DUP-002: An active return request is one whose status is NOT in a terminal state (REFUNDED, MERCHANT_REJECTED, CANCELLED, EXPIRED, REJECTED_AFTER_INSPECTION).
BD-P13-DUP-003: After a return request reaches a terminal state, a new return request may be created for the same sub-order (subject to the return window and remaining returnable quantities).
BD-P13-DUP-004: Cumulative returned quantity per order_item is tracked across all return requests for the same sub-order.
```

### 5.7 Buyer Cancellation

```text
BD-P13-CANCEL-001: Buyer may cancel a return request only while status is REQUESTED or MERCHANT_APPROVED.
BD-P13-CANCEL-002: After BUYER_SHIPPED, the buyer cannot cancel (item is in transit).
BD-P13-CANCEL-003: Cancellation is idempotent — cancelling an already-cancelled request returns the current state.
```

### 5.8 Exceptions Requiring Admin Review

```text
BD-P13-EXCEPT-001: Return requests exceeding the return window require ADMIN approval (override).
BD-P13-EXCEPT-002: Return requests for orders with payment method VOUCHER require ADMIN review.
BD-P13-EXCEPT-003: Return requests where the refund amount exceeds the confirmed payment amount require ADMIN review (should not happen if eligibility is correct, but defensive).
BD-P13-EXCEPT-004: Merchant has 72 hours to respond to a return request. After 72h, the buyer or admin may escalate to ADMIN for auto-approval or expiry.
```

---

## 6. Dispute / Refund Integration

### 6.1 Entity Relationships

```
return_requests (NEW)
  ├── return_request_id (PK)
  ├── sub_order_id → orders(id)
  ├── payment_record_id → payment_records(id)
  ├── buyer_id → users(id)
  ├── refund_id → refunds(id)  (nullable — set when refund is created)
  │
  └── return_line_items (NEW)
       ├── order_item_id → order_items(id)
       ├── quantity
       ├── condition (GOOD/DAMAGED/DEFECTIVE/UNSALEABLE)
       └── return_request_id → return_requests(id)

disputes (EXISTING)
  ├── dispute_id (PK)
  ├── order_id → orders(id)
  ├── resolution (text)
  └── return_request_id → return_requests(id)  (NEW nullable FK — links dispute to return if created via dispute)

refunds (EXISTING)
  ├── refund_id (PK)
  ├── payment_record_id → payment_records(id)
  ├── order_id → orders(id)
  ├── return_request_id → return_requests(id)  (NEW nullable FK — links refund to return)
  └── dispute_id → disputes(id)  (NEW nullable FK — links refund to dispute if created via dispute)
```

### 6.2 Dispute Resolution → Refund

```text
BD-P13-DISPUTE-001: When a dispute is RESOLVED in favor of the buyer, the admin may specify a refund amount.
BD-P13-DISPUTE-002: Dispute resolution does NOT automatically create a refund. The admin must explicitly approve the refund after dispute resolution.
BD-P13-DISPUTE-003: Dispute resolution creates a "refund recommendation" — a pending refund request with status REQUESTED, linked to the dispute.
BD-P13-DISPUTE-004: The refund recommendation follows the standard P12 refund approval path (`approveRefund()`).
BD-P13-DISPUTE-005: A dispute may be resolved WITHOUT a refund (text-only resolution, apology, store credit, etc.).
BD-P13-DISPUTE-006: If a return request already exists for the same order, the dispute resolution may reference it. The refund amount must not exceed the return's calculated refund amount.
```

### 6.3 Preventing Double Refunds

```text
BD-P13-NODOUBL-001: The existing P12 refund infrastructure prevents over-refund via FOR UPDATE locking and cumulative refund calculation (lines 654-687 of payments.service.ts).
BD-P13-NODOUBL-002: A return request that results in a refund creates a refund via the same `requestRefund()` path — the cumulative cap applies.
BD-P13-NODOUBL-003: A dispute resolution that creates a refund recommendation also goes through `requestRefund()` — the cumulative cap applies.
BD-P13-NODOUBL-004: If both a return request AND a dispute exist for the same order, the total refund across both paths must not exceed the confirmed payment amount.
BD-P13-NODOUBL-005: The `refunds` table's existing idempotency_key constraint prevents duplicate refund creation.
```

### 6.4 Financial Immutability Preservation

```text
BD-P13-IMMUT-001: The `order_financial_breakdown` table is NEVER mutated after finalization (P12 lock D-06).
BD-P13-IMMUT-002: Refunds are tracked in the `refunds` table (append-only with status transitions).
BD-P13-IMMUT-003: Settlement records already have `refund_minor` — when a refund succeeds, the settlement's `refund_minor` is updated (if settlement is PENDING or CALCULATED) or a new adjustment settlement is created (if settlement is PAID).
BD-P13-IMMUT-004: No financial breakdown column is ever updated. All post-finalization financial changes use the `refunds` table as the source of truth.
```


---

## 7. Financial & Settlement Rules

### 7.1 Refund Amount Calculation

```text
BD-P13-FIN-001: Full return (all items, full quantity): refund = confirmed payment amount (including delivery fees).
BD-P13-FIN-002: Partial return (some items or partial quantity): refund = SUM(unit_price × returned_qty) for each return line. Delivery fees are NOT included.
BD-P13-FIN-003: Unit price is the SNAPSHOT `unit_price_minor` from `order_items` at checkout time. Never re-read from offers or price tiers.
BD-P13-FIN-004: Discount is applied proportionally — the refund reflects the discounted unit price, not list price. Formula: refund_line = unit_price × qty × (1 − discount_ratio).
BD-P13-FIN-005: Prices are VAT-EXCLUSIVE (P12 model — see `order-pricing.ts`: VAT is computed on the taxable base and added on top, never embedded in `unit_price_minor`). Refunds therefore recalculate VAT proportionally and add it to the net taxable line value, consistent with BD-P13-REFUND-005 and the original order's price basis. [Corrected 2026-10-09 — see §7.1 Revision note below; supersedes the prior VAT-inclusive wording, which also mis-cited P12 D-03.]
BD-P13-FIN-006: The refund amount must not exceed the confirmed payment amount minus cumulative prior refunds. Enforced by existing P12 `requestRefund()` FOR UPDATE cumulative cap.
```

> **§7.1 Revision — Release-Closure Documentation Correction (2026-10-09).**
> *Original BD-P13-FIN-005:* "VAT is included in the unit_price_minor (prices are VAT-inclusive per P12 D-03). No separate VAT recalculation is needed for refunds."
> *Why corrected:* that wording contradicted (a) this document's own **BD-P13-REFUND-005** ("Tax (VAT) is recalculated proportionally on the refund amount"), (b) the authoritative **P12 pricing implementation** `apps/api/src/modules/orders/order-pricing.ts` (`taxable = netGoods + deliveryFee; tax = round(taxable × vatRate); total = taxable + tax` — VAT-exclusive base, VAT added on top), and (c) **P13 runtime behavior** in `returns.service.ts` (`lineRefund = lineNet + round(lineNet × vatRate)`; delivery fee "pre-VAT; add VAT"). The "P12 D-03" citation was a mis-reference — P12 D-03 defines *merchant of record*, not VAT pricing.
> *Scope:* documentation reconciliation only. The platform-wide pricing model was **not** changed (out of P13 scope). *Verification:* `returns-fsm.spec.ts` AC-P13-014 (VAT-exclusive), `p13-returns.postgres.spec.ts` FIN-P13-01/02/03, and browser E2E refund `250000 × 1.15 = 287500`.

### 7.2 Commission Treatment

```text
BD-P13-COMM-001: Commission is NOT adjusted when a refund is issued. The platform retains its original commission.
BD-P13-COMM-002: Rationale: the platform has already incurred operational costs (payment processing, logistics coordination). Commission adjustment would create complex settlement reconciliation with minimal business benefit.
BD-P13-COMM-003: BUSINESS APPROVAL REQUIRED — this is a commercial policy decision. The Syria deployment may require different commission treatment based on merchant agreements.
```

**Note**: P12 lock §17.3 described commission recalculation on refund, but the implemented `calculateSettlement()` (payments.service.ts line 879) uses `breakdown.commissionMinor` directly — the original commission is retained. BD-P13-COMM-001 locks the implemented behavior.

### 7.3 Delivery Fee Treatment

```text
BD-P13-FEE-001: Delivery fees are refunded ONLY when the entire sub-order is returned (all items, full quantity).
BD-P13-FEE-002: Partial returns do NOT include delivery fee refund.
BD-P13-FEE-003: Delivery fee refund amount = `order_financial_breakdown.deliveryFeeMinor` (the original charged amount).
```

### 7.4 Settlement Adjustment

```text
BD-P13-SETTLE-001: When a refund succeeds (status → SUCCEEDED), the associated settlement record must be adjusted.
BD-P13-SETTLE-002: If settlement status is PENDING or CALCULATED: update `refund_minor` in place, recalculate `net_minor = gross_minor - refund_minor - commission_minor - fee_minor`. This is safe because the settlement has not been paid.
BD-P13-SETTLE-003: If settlement status is PAID: do NOT modify the existing settlement. Instead, create a NEW settlement record with status ADJUSTMENT, negative `net_minor` equal to the refund impact. This preserves the audit trail of the paid settlement.
BD-P13-SETTLE-004: If settlement status is DUE: same as PAID — create a new ADJUSTMENT settlement. Do not modify a DUE settlement.
BD-P13-SETTLE-005: If no settlement exists yet: no action needed. The next `calculateSettlement()` call will pick up the refund via the existing `SUM(refunds)` query.
BD-P13-SETTLE-006: ADJUSTMENT settlements have status 'ADJUSTMENT' (new status value, requires CHECK constraint extension in migration 0059).
```

### 7.5 Paid Settlement Recovery

```text
BD-P13-RECOVER-001: When a PAID settlement requires adjustment (refund after payout), the ADJUSTMENT settlement creates a negative balance.
BD-P13-RECOVER-002: The negative balance is tracked as a merchant receivable — the merchant owes the platform money.
BD-P13-RECOVER-003: P13 does NOT implement automated recovery. The admin sees the negative balance in the admin dashboard and handles recovery manually (bank transfer, deduction from next settlement, etc.).
BD-P13-RECOVER-004: BUSINESS APPROVAL REQUIRED — recovery workflow details (dunning, write-off threshold) are commercial decisions.
```

---

## 8. Inventory Rules

### 8.1 Return Inventory Lifecycle

```text
BD-P13-INV-001: Inventory restoration occurs ONLY after the return request reaches INSPECTED status with condition GOOD.
BD-P13-INV-002: The inspection step is mandatory. Stock is never restored merely because a refund was issued.
BD-P13-INV-003: Condition GOOD: RELEASE the reservation (qty_reserved ↓), then increment qty_on_hand (item becomes sellable again).
BD-P13-INV-004: Condition DAMAGED, DEFECTIVE, UNSALEABLE: RELEASE the reservation (qty_reserved ↓), then ADJUST-out (qty_on_hand ↓ by same amount). Net effect: reservation cleared, item written off, no sellable stock increase.
BD-P13-INV-005: These rules mirror the existing M7.3-C `recordReturn()` pattern (orders.service.ts lines 3154-3196). P13 reuses the same RELEASE + conditional ADJUST-out approach.
```

**Important**: Per the M7.3-C memory, pre-SALE RTS returns use RELEASE only (no RETURN +qty_on_hand) because SALE hasn't fired yet. P13 buyer-initiated returns occur post-DELIVERED, so SALE has already decremented qty_on_hand. Therefore P13 restoration for GOOD condition correctly increments qty_on_hand (the item was already sold/delivered, SALE already fired).

### 8.2 Inventory Restoration Trigger

```text
BD-P13-INVTRIG-001: Inventory restoration is triggered when the merchant records the inspection result (transition RECEIVED → INSPECTED).
BD-P13-INVTRIG-002: The restoration is performed inside the same database transaction as the return request state transition — atomic with the inspection.
BD-P13-INVTRIG-003: If the inspection result is REJECTED_AFTER_INSPECTION, no inventory restoration occurs (the item was not accepted for return).
```

### 8.3 Inventory Restoration Mechanics

```text
BD-P13-INVMECH-001: Use the existing `inventoryItems` table and `stockMovements` ledger.
BD-P13-INVMECH-002: FOR UPDATE lock on the inventory_items row before any read-check-write sequence (same pattern as `reserveStock()` and `releaseStock()`).
BD-P13-INVMECH-003: Stock movement type for GOOD restoration: RETURN (sellable, +qty_on_hand). For write-off: ADJUST (negative, -qty_on_hand). The RETURN movement type already exists in the CHECK constraint (migration 0020).
BD-P13-INVMECH-004: Each restoration creates a `stock_movements` row with `referenceType = 'RETURN_REQUEST'` and `referenceId = return_request.id`.
BD-P13-INVMECH-005: Restoration is idempotent — tracked by the return request state machine. A return request can only reach INSPECTED once, so restoration happens exactly once per return request.
```

### 8.4 Inventory Restoration Safety

```text
BD-P13-INVSAFE-001: Restoration must be tenant-safe — the inventory item's warehouse must belong to the merchant's store (via `assertInventoryItemInOrg()`).
BD-P13-INVSAFE-002: Restoration must be concurrency-safe — FOR UPDATE on inventory_items row, same pattern as existing `releaseStock()`.
BD-P13-INVSAFE-003: Restoration must be auditable — every stock movement is recorded in `stock_movements` with full metadata.
BD-P13-INVSAFE-004: Outbox event `return.inventory_restored` emitted atomically with the restoration (via `txClient` parameter on `outbox.publish()`).
```

### 8.5 Relationship to M7.3-C `recordReturn()`

```text
BD-P13-INVREL-001: M7.3-C `recordReturn()` operates at the SHIPMENT level — it is an operational response to a delivery exception (RTS_COMPLETED).
BD-P13-INVREL-002: P13 inventory restoration operates at the RETURN REQUEST level — it is a buyer-initiated return that has been approved and inspected.
BD-P13-INVREL-003: These are distinct workflows. A single order may have both: M7.3-C handles shipment-level exceptions, P13 handles buyer-request-level returns.
BD-P13-INVREL-004: The cumulative cap logic from M7.3-C (preventing over-return beyond reserved quantity) is reused conceptually but applied at the return-request level against the original ordered quantity.
```

---

## 9. Shipping Rules

### 9.1 Return Shipping Decision

```text
BD-P13-SHIP-001: P13 does NOT integrate with any carrier for return shipments.
BD-P13-SHIP-002: Verified: the existing shipping provider registry (`shipping-provider.ts`) supports `createShipment()` and `cancelShipment()`. No reverse-shipment API exists. The `ShippingProvider` interface has no `createReturnShipment()` method.
BD-P13-SHIP-003: Aramex and the manual delivery provider do not expose reverse logistics endpoints.
```

### 9.2 Manual Return Shipping Process

```text
BD-P13-SHIP-004: Return shipping is BUYER-ARRANGED. The buyer is responsible for getting the item back to the merchant.
BD-P13-SHIP-005: After MERCHANT_APPROVED, the buyer marks the return as BUYER_SHIPPED by providing a tracking number (optional) and/or a handover confirmation note.
BD-P13-SHIP-006: The merchant marks the return as RECEIVED when the item physically arrives. No carrier integration is involved.
BD-P13-SHIP-007: If the buyer never ships (stays in MERCHANT_APPROVED), the return expires after the SLA period (72 hours) → EXPIRED terminal state.
```

### 9.3 Extensibility

```text
BD-P13-SHIP-008: The return request entity includes a `shipping_tracking_number` field (nullable) and `shipping_notes` field (nullable) to support future carrier integration.
BD-P13-SHIP-009: When a reverse-shipment carrier integration is added (P14+), it plugs into the BUYER_SHIPPED → RECEIVED transition without changing the return FSM.
BD-P13-SHIP-010: Return labels are OUT OF SCOPE for P13.
```

---

## 10. Authorization Matrix

### 10.1 Return Request Permissions

| Action | Buyer | Merchant Owner/Admin | Merchant Staff | Moderator | Admin/Super Admin |
|--------|-------|---------------------|----------------|-----------|-------------------|
| Create return request | ✅ (own orders) | ❌ | ❌ | ❌ | ❌ |
| View return request | ✅ (own) | ✅ (own store) | ✅ (own store) | ✅ (cross-org) | ✅ (all) |
| Cancel return request | ✅ (own, pre-shipment) | ❌ | ❌ | ❌ | ❌ |
| Approve/reject return | ❌ | ✅ | ✅ (if store member) | ✅ | ✅ |
| Mark buyer shipped | ✅ (own) | ❌ | ❌ | ❌ | ❌ |
| Mark received | ❌ | ✅ | ✅ (if store member) | ✅ | ✅ |
| Record inspection | ❌ | ✅ | ✅ (if store member) | ✅ | ✅ |
| Escalate to admin | ✅ (own) | ✅ (own store) | ✅ | ❌ | N/A |

### 10.2 Authorization Rules

```text
BD-P13-AUTH-001: Buyer may only create return requests for orders where `order.buyerId === caller.sub`.
BD-P13-AUTH-002: Merchant actions require `assertStoreInOrg()` AND `assertStoreMember()` on the fulfilling store.
BD-P13-AUTH-003: Admin/moderator actions use `isTenantPrivileged()` bypass — cross-org access permitted.
BD-P13-AUTH-004: Refund approval (via P12 `approveRefund()`) remains admin-only — merchant cannot directly approve refunds.
BD-P13-AUTH-005: Inventory restoration is a system action triggered by inspection, not a directly callable endpoint. Only the inspection actor triggers it indirectly.
```

### 10.3 IDOR Protection

```text
BD-P13-IDOR-001: Return request endpoints validate ownership at the return_request level: `return_request.buyer_id === caller.sub` for buyer actions.
BD-P13-IDOR-002: Return request endpoints validate store membership for merchant actions: the return request's sub_order → store → org chain is verified.
BD-P13-IDOR-003: A buyer cannot access another buyer's return request even if they guess the UUID.
BD-P13-IDOR-004: A merchant cannot access a return request for an order fulfilled by a different store (even in the same org) — `assertStoreMember()` enforced.
BD-P13-IDOR-005: Cross-store access within the same org is blocked by the `assertStoreMember()` check (P7 remediation).
```

### 10.4 Refund Authorization

```text
BD-P13-REFUND-AUTH-001: Return-initiated refunds follow the P12 path: `requestRefund()` creates a REQUESTED refund, `approveRefund()` requires `isTenantPrivileged(caller)`.
BD-P13-REFUND-AUTH-002: Merchant cannot approve refunds — they can only approve/reject the return request itself.
BD-P13-REFUND-AUTH-003: Admin approval of the refund is a separate step from merchant approval of the return.
BD-P13-REFUND-AUTH-004: Dispute-initiated refunds also require admin approval via the same `approveRefund()` path.
```

---

## 11. Concurrency & Idempotency

### 11.1 Concurrent Return Requests

```text
BD-P13-CONC-001: Only one active return request per sub-order (BD-P13-DUP-001). Enforced by a conditional check at creation time: query for existing non-terminal return requests for the same sub_order_id.
BD-P13-CONC-002: Race condition: two simultaneous create requests for the same sub-order. Mitigated by a database-level partial unique index: `UNIQUE(sub_order_id) WHERE status NOT IN ('REFUNDED', 'MERCHANT_REJECTED', 'CANCELLED', 'EXPIRED', 'REJECTED_AFTER_INSPECTION')`. The second INSERT fails with a unique violation → 409 Conflict.
```

### 11.2 Duplicate Submissions

```text
BD-P13-CONC-004: Return request creation uses an `idempotency_key` (unique per buyer + sub_order + request fingerprint). Duplicate POST with same key returns the existing request.
BD-P13-CONC-005: The idempotency_key is stored on the `return_requests` table with a UNIQUE constraint (same pattern as `payment_records` and `refunds`).
```

### 11.3 Simultaneous Dispute and Return

```text
BD-P13-CONC-006: A return request and a dispute may exist simultaneously for the same order. They are independent workflows.
BD-P13-CONC-007: Both paths may create refund requests. The P12 cumulative cap (FOR UPDATE on payment_record) prevents over-refund regardless of how many refund requests are created.
BD-P13-CONC-008: If a return request's refund and a dispute's refund together would exceed the confirmed payment amount, the second `requestRefund()` call fails with a clear error.
```

### 11.4 Concurrent Refund Approval

```text
BD-P13-CONC-009: P12 `approveRefund()` already uses optimistic locking: `UPDATE refunds SET status = 'SUCCEEDED' WHERE id = ? AND status = 'REQUESTED'`. Concurrent approvals → ConflictException.
BD-P13-CONC-010: No changes needed — P13 reuses the existing approval path.
```

### 11.5 Concurrent Inventory Restoration

```text
BD-P13-CONC-011: Inventory restoration happens inside the inspection transaction (BD-P13-INVTRIG-002). The inspection transition uses optimistic locking on the return request status.
BD-P13-CONC-012: FOR UPDATE on `inventory_items` row during restoration (BD-P13-INVMECH-002). Same pattern as existing `releaseStock()`.
BD-P13-CONC-013: Two concurrent inspections on the same return request → only one succeeds (optimistic lock on return_request status). The other gets ConflictException.
```

### 11.6 Refund vs. Cancellation

```text
BD-P13-CONC-014: Order cancellation and return refund are independent. An order in DELIVERED/COMPLETED status with a pending return request can still transition to DISPUTED.
BD-P13-CONC-015: If an order is CANCELLED before a return request is created, the return request is rejected (BD-P13-ELIG-003).
BD-P13-CONC-016: If a return request is active and the order is somehow cancelled, the return request continues independently (it has its own FSM).
```

### 11.7 Refund vs. Settlement

```text
BD-P13-CONC-017: If a refund succeeds while settlement is being calculated, the settlement calculation must see the updated refund. Mitigated by: settlement calculation queries `SUM(refunds WHERE status = 'SUCCEEDED')` inside its own transaction.
BD-P13-CONC-018: If a refund succeeds after settlement is PAID, the ADJUSTMENT settlement path (BD-P13-SETTLE-003) handles it without modifying the paid settlement.
BD-P13-CONC-019: Concurrent refund approval and settlement calculation: both use transactions. The settlement reads committed refund data. If the refund commits first, settlement sees it. If settlement commits first, the ADJUSTMENT path handles the late refund.
```

### 11.8 Outbox Event Creation

```text
BD-P13-CONC-020: All return state transitions emit outbox events atomically (using `txClient` parameter on `outbox.publish()`).
BD-P13-CONC-021: Outbox events for return transitions: `return.requested`, `return.approved`, `return.rejected`, `return.shipped`, `return.received`, `return.inspected`, `return.refund_pending`, `return.refunded`, `return.cancelled`, `return.expired`, `return.rejected_after_inspection`, `return.inventory_restored`.
BD-P13-CONC-022: Outbox events are idempotent — each event is inserted inside the same transaction as the state transition. If the transaction rolls back, the event is not created.
```

---

## 12. Database & Migration Decision

### 12.1 Decision

```text
BD-P13-MIG-001: Migration 0059 is REQUIRED.
BD-P13-MIG-002: Migration file: `0059_return_requests.sql`
BD-P13-MIG-003: Idempotent migration (safe on fresh DB, existing DB, repeated runs). Same pattern as migrations 0057 and 0058.
```

### 12.2 Schema (Conceptual — not implemented during lock)

**Table: `return_requests`**

```sql
CREATE TABLE IF NOT EXISTS return_requests (
  id                      UUID PRIMARY KEY,
  sub_order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_record_id       UUID NOT NULL REFERENCES payment_records(id) ON DELETE CASCADE,
  buyer_id                UUID NOT NULL REFERENCES users(id),
  refund_id               UUID REFERENCES refunds(id),  -- set when refund is created
  status                  VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
  reason                  VARCHAR(40) NOT NULL,
  description             TEXT,
  evidence_urls           JSONB NOT NULL DEFAULT '[]',
  requested_refund_minor  BIGINT NOT NULL,  -- buyer's expected refund amount
  actual_refund_minor     BIGINT,           -- actual approved refund amount
  shipping_tracking_number VARCHAR(200),
  shipping_notes          TEXT,
  merchant_notes          TEXT,
  inspection_condition    VARCHAR(20),      -- GOOD, DAMAGED, DEFECTIVE, UNSALEABLE
  inspection_notes        TEXT,
  inspected_by            UUID REFERENCES users(id),
  inspected_at            TIMESTAMPTZ,
  idempotency_key         VARCHAR(120),
  expires_at              TIMESTAMPTZ,      -- SLA expiry
  metadata                JSONB NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Table: `return_request_items`**

```sql
CREATE TABLE IF NOT EXISTS return_request_items (
  id                  UUID PRIMARY KEY,
  return_request_id   UUID NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  order_item_id       UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  quantity            INTEGER NOT NULL,
  condition           VARCHAR(20),          -- set during inspection
  inventory_item_id   UUID REFERENCES inventory_items(id),  -- resolved during inspection
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Table: `return_request_events`**

```sql
CREATE TABLE IF NOT EXISTS return_request_events (
  id                  UUID PRIMARY KEY,
  return_request_id   UUID NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  event_type          VARCHAR(40) NOT NULL,
  from_status         VARCHAR(30),
  to_status           VARCHAR(30) NOT NULL,
  actor_id            UUID REFERENCES users(id),
  actor_type          VARCHAR(16) NOT NULL DEFAULT 'SYSTEM',
  notes               TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 12.3 Constraints and Indexes

```sql
-- CHECK constraints
ALTER TABLE return_requests ADD CONSTRAINT chk_return_requests_status
  CHECK (status IN (
    'REQUESTED', 'MERCHANT_APPROVED', 'BUYER_SHIPPED', 'RECEIVED',
    'INSPECTED', 'REFUND_PENDING', 'REFUND_FAILED', 'REFUNDED',
    'MERCHANT_REJECTED', 'CANCELLED', 'EXPIRED', 'REJECTED_AFTER_INSPECTION'
  ));

ALTER TABLE return_request_items ADD CONSTRAINT chk_return_items_condition
  CHECK (condition IS NULL OR condition IN ('GOOD', 'DAMAGED', 'DEFECTIVE', 'UNSALEABLE'));

ALTER TABLE return_request_items ADD CONSTRAINT chk_return_items_quantity
  CHECK (quantity > 0);

-- Unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_return_requests_idempotency
  ON return_requests(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Active-return uniqueness (one active return per sub-order)
CREATE UNIQUE INDEX IF NOT EXISTS idx_return_requests_active_per_order
  ON return_requests(sub_order_id)
  WHERE status NOT IN ('REFUNDED', 'MERCHANT_REJECTED', 'CANCELLED', 'EXPIRED', 'REJECTED_AFTER_INSPECTION');

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_return_requests_buyer
  ON return_requests(buyer_id);

CREATE INDEX IF NOT EXISTS idx_return_requests_sub_order
  ON return_requests(sub_order_id);

CREATE INDEX IF NOT EXISTS idx_return_requests_status
  ON return_requests(status);

CREATE INDEX IF NOT EXISTS idx_return_request_items_request
  ON return_request_items(return_request_id);

CREATE INDEX IF NOT EXISTS idx_return_request_events_request
  ON return_request_events(return_request_id);
```

### 12.4 Refunds Table Extension

```sql
-- Add return_request_id and dispute_id to refunds (nullable FKs)
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS return_request_id UUID REFERENCES return_requests(id);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS dispute_id UUID REFERENCES disputes(id);
```

### 12.5 Settlement CHECK Constraint Extension

```sql
-- Extend settlement_statuses CHECK to include ADJUSTMENT
ALTER TABLE settlement_records DROP CONSTRAINT IF EXISTS chk_settlement_statuses;
ALTER TABLE settlement_records ADD CONSTRAINT chk_settlement_statuses
  CHECK (status IN ('PENDING', 'CALCULATED', 'DUE', 'PAID', 'ADJUSTMENT'));
```

### 12.6 Migration Safety

```text
BD-P13-MIGSAFE-001: All CREATE TABLE IF NOT EXISTS — safe on repeated runs.
BD-P13-MIGSAFE-002: All ADD COLUMN IF NOT EXISTS — safe on repeated runs.
BD-P13-MIGSAFE-003: UUID primary keys without DEFAULT — explicit `crypto.randomUUID()` in code (matches existing pattern from migration 0058).
BD-P13-MIGSAFE-004: Foreign keys use ON DELETE CASCADE — consistent with existing schema.
BD-P13-MIGSAFE-005: No data migration required — all new tables.
BD-P13-MIGSAFE-006: The CHECK constraint extension for settlement_statuses uses DROP IF EXISTS + ADD — idempotent.
```

---

## 13. UI Scope

### 13.1 Web Buyer UI

```text
BD-P13-UI-BUYER-001: Return initiation page — accessible from order detail page for eligible orders.
BD-P13-UI-BUYER-002: Return request form: select items, quantities, reason code, description, optional evidence URLs.
BD-P13-UI-BUYER-003: Return status tracking page: shows current status, history timeline, inspection result, refund status.
BD-P13-UI-BUYER-004: Cancel return button: visible only when status is REQUESTED or MERCHANT_APPROVED.
BD-P13-UI-BUYER-005: Mark as shipped: buyer enters tracking number (optional) and confirms handover.
```

### 13.2 Web Merchant UI

```text
BD-P13-UI-MERCH-001: Return queue: list of pending return requests for the merchant's stores. Filterable by status, store, date.
BD-P13-UI-MERCH-002: Return detail page: shows request details, order items, buyer's reason, evidence.
BD-P13-UI-MERCH-003: Approve/reject action: merchant selects approve or reject with mandatory reason for rejection.
BD-P13-UI-MERCH-004: Inspection page: merchant records condition (GOOD/DAMAGED/DEFECTIVE/UNSALEABLE) per line item, adds inspection notes.
BD-P13-UI-MERCH-005: Mark as received: confirms physical receipt of returned items.
```

### 13.3 Web Admin UI

```text
BD-P13-UI-ADMIN-001: Return oversight dashboard: all return requests across all orgs. Filterable by status, org, buyer, merchant.
BD-P13-UI-ADMIN-002: Exception queue: expired returns, window-overrides, VOUCHER reviews.
BD-P13-UI-ADMIN-003: Refund approval queue: pending refunds from return requests and dispute resolutions.
BD-P13-UI-ADMIN-004: Dispute-to-refund: admin can create a refund recommendation when resolving a dispute.
BD-P13-UI-ADMIN-005: Settlement adjustment view: shows ADJUSTMENT settlements and merchant receivables.
```

### 13.4 Mobile UI

```text
BD-P13-UI-MOBILE-001: Mobile return UI is OUT OF SCOPE for P13.
BD-P13-UI-MOBILE-002: Buyers can initiate returns via the web browser on mobile devices (responsive web).
BD-P13-UI-MOBILE-003: Mobile native return UI may be added in a future phase.
```

### 13.5 Order/Payment/Refund History

```text
BD-P13-UI-HIST-001: Order detail page shows linked return requests (if any).
BD-P13-UI-HIST-002: Payment detail shows linked refunds (existing P12 behavior).
BD-P13-UI-HIST-003: Refund detail shows linked return request (if created via return flow).
```

---

## 14. Out-of-Scope Items (Consolidated)

| # | Item | Reason | Future Phase |
|---|------|--------|-------------|
| 1 | Return carrier integration | No reverse-shipment API exists in provider registry | P14+ |
| 2 | Return shipping labels | Depends on carrier integration | P14+ |
| 3 | Mobile return UI (native) | Scope reduction for bounded release | P14+ |
| 4 | Chargebacks | No payment provider chargeback webhook implemented | P14+ |
| 5 | Automated refund approval rules | Requires business policy definition first | P14+ |
| 6 | Legal/tax policy | Jurisdiction-dependent, not implemented | Business decision |
| 7 | Payout execution | Already out of scope in P12 | P14+ |
| 8 | XLSX export | Separate P2 finding | P14+ |
| 9 | Notification provider integration | Separate P2 finding (placeholder providers) | P14+ |
| 10 | Automated settlement recovery / dunning | Commercial decision required | P14+ |
| 11 | Return demand analytics / reporting | Not critical for MVP | P14+ |
| 12 | Multi-currency returns | P12 is single-currency (SYP) | P14+ |

---

## 15. Risks & Unresolved Business Decisions

### 15.1 Business Decisions Requiring Explicit Approval

| ID | Decision | Default | Risk if Not Approved |
|----|----------|---------|---------------------|
| BD-P13-APPROVE-001 | Return window duration | 14 days from DELIVERED | May not comply with Syrian consumer protection regulations |
| BD-P13-APPROVE-002 | Commission retention on refund | Platform retains full commission | Merchants may dispute; could affect merchant acquisition |
| BD-P13-APPROVE-003 | Delivery fee refund on full return | Included | Financial impact on platform (delivery cost not recovered) |
| BD-P13-APPROVE-004 | Merchant SLA for return response | 72 hours | May be too short for small merchants |
| BD-P13-APPROVE-005 | Paid settlement recovery process | Manual admin process | No automated dunning; merchant receivables may accumulate |
| BD-P13-APPROVE-006 | VOUCHER payment return handling | Requires admin review | Voucher returns may need special issuer coordination |

### 15.2 Technical Risks

| ID | Risk | Mitigation |
|----|------|------------|
| RISK-P13-001 | Partial unique index for active-return-per-order may have edge cases with concurrent inserts | PostgreSQL handles this correctly under READ COMMITTED; tested in P12 with similar patterns |
| RISK-P13-002 | Settlement ADJUSTMENT records could accumulate if many refunds occur after payout | Admin dashboard visibility; manual recovery process; monitoring alert on negative balance |
| RISK-P13-003 | Dispute + return simultaneous refund attempts | P12 cumulative cap prevents over-refund; clear error messages needed |
| RISK-P13-004 | Migration 0059 adds FK from refunds → return_requests (table may not exist yet on partial migration) | Migration ordering ensures return_requests created before ALTER TABLE refunds |
| RISK-P13-005 | Inventory restoration for post-DELIVERED returns differs from M7.3-C pre-DELIVERED RTS | Documented in §8.1 Important note; P13 uses RETURN movement type (+qty_on_hand) because SALE already fired |

---

## 16. Acceptance Criteria

### 16.1 Traceable Acceptance Matrix

| ID | Category | Expected Behavior | Verification Method | Pass Criteria |
|----|----------|-------------------|--------------------|---------------|
| AC-P13-001 | FSM | Return request follows locked state machine (12 states, legal transitions only) | Unit tests + integration tests | 100% transition coverage; illegal transitions throw ConflictException |
| AC-P13-002 | FSM | Terminal states (REFUNDED, MERCHANT_REJECTED, CANCELLED, EXPIRED, REJECTED_AFTER_INSPECTION) have no outgoing transitions | Unit test | All terminal states verified |
| AC-P13-003 | Eligibility | Only DELIVERED/COMPLETED sub-orders with CONFIRMED/CAPTURED/PARTIALLY_REFUNDED payment are eligible | Integration test | Return creation rejected for ineligible orders |
| AC-P13-004 | Eligibility | Return window enforced (14 days from DELIVERED timestamp) | Integration test with mocked clock | Return rejected after window; accepted within window |
| AC-P13-005 | Eligibility | Cumulative returned quantity per order_item does not exceed ordered quantity | Integration test with multiple returns | Over-return rejected with ConflictException |
| AC-P13-006 | Refund | Refund amount = SUM(unit_price × qty) for partial; includes delivery fee for full sub-order return | Integration test comparing to financial breakdown | Exact amount match |
| AC-P13-007 | Refund | Cumulative refund does not exceed confirmed payment amount | Integration test with multiple refunds | Over-refund rejected |
| AC-P13-008 | Refund | No duplicate refunds (idempotency key enforced) | Integration test with duplicate POST | Second POST returns existing refund |
| AC-P13-009 | Tenant | Buyer can only access own return requests | Integration test with IDOR attempts | 403 for cross-buyer access |
| AC-P13-010 | Tenant | Merchant can only access returns for own store (assertStoreMember enforced) | Integration test with cross-store attempts | 403 for cross-store access within same org |
| AC-P13-011 | Tenant | Admin can access all return requests cross-org | Integration test | Admin access succeeds across orgs |
| AC-P13-012 | Financial | Order financial breakdown is never mutated after finalization | Integration test + code review | No UPDATE on orderFinancialBreakdown after finalize |
| AC-P13-013 | Financial | Settlement adjustment creates new ADJUSTMENT record when settlement is PAID | Integration test | Original PAID settlement unchanged; new ADJUSTMENT record created |
| AC-P13-014 | Financial | Settlement refund_minor updated in place when PENDING/CALCULATED | Integration test | net_minor recalculated correctly |
| AC-P13-015 | Inventory | GOOD condition → qty_on_hand incremented, reservation released | Integration test | Stock movement RETURN recorded; qtyOnHand +qty |
| AC-P13-016 | Inventory | DAMAGED/DEFECTIVE/UNSALEABLE → RELEASE then ADJUST-out | Integration test | Two movements: RELEASE + ADJUST; net qty_on_hand unchanged |
| AC-P13-017 | Inventory | No inventory restoration on REJECTED_AFTER_INSPECTION | Integration test | No stock movements created |
| AC-P13-018 | Inventory | FOR UPDATE lock on inventory_items during restoration | Code review + PostgreSQL concurrency test | Two concurrent inspections → one succeeds, one ConflictException |
| AC-P13-019 | Concurrency | Two simultaneous return requests for same sub-order → one rejected | PostgreSQL concurrency test (pg_isolation_test or application-level) | 409 Conflict on second request |
| AC-P13-020 | Concurrency | Concurrent refund approval → one succeeds, one ConflictException | PostgreSQL concurrency test | Optimistic lock on refund status |
| AC-P13-021 | Dispute | Dispute resolution can create a refund recommendation | Integration test | Refund created with status REQUESTED, linked to dispute |
| AC-P13-022 | Dispute | Dispute + return refund total does not exceed confirmed payment | Integration test | Second refund rejected by cumulative cap |
| AC-P13-023 | Outbox | Every return state transition emits an outbox event atomically | Integration test | Outbox event exists for each transition; event absent on rollback |
| AC-P13-024 | Migration | Migration 0059 runs successfully on fresh DB | Fresh DB migration test | All tables, constraints, indexes created |
| AC-P13-025 | Migration | Migration 0059 runs successfully on existing DB (idempotent) | Existing DB migration test | No errors; no data loss |
| AC-P13-026 | UI (Web) | Buyer can create, view, cancel return requests via web UI | E2E test (Playwright) | Full return lifecycle completed via UI |
| AC-P13-027 | UI (Web) | Merchant can approve/reject, receive, inspect returns via web UI | E2E test (Playwright) | Full merchant return workflow via UI |
| AC-P13-028 | UI (Web) | Admin can view all returns, approve refunds, manage exceptions | E2E test (Playwright) | Admin return oversight workflow via UI |
| AC-P13-029 | Regression | All existing P12 tests continue to pass | `npm test` + PostgreSQL regression | 0 failures |
| AC-P13-030 | Build | Project builds without errors | `npm run build` | Exit code 0 |

---

## 17. Release Gates

### 17.1 Pre-Implementation Gates

| Gate | Criteria | Status |
|------|----------|--------|
| P13 Audit | Complete | ✅ COMPLETE |
| P13 Business Rules Lock | All sections approved | ✅ THIS DOCUMENT |
| P12 status | CLOSED / PASS | ✅ VERIFIED |

### 17.2 Implementation Gates

| Gate | Criteria |
|------|----------|
| Migration 0059 | Runs on fresh DB; runs on existing DB; all constraints verified |
| Unit tests | All return FSM transitions tested; eligibility rules tested; authorization tested |
| Integration tests | Full return lifecycle (create → approve → ship → receive → inspect → refund); dispute-to-refund; settlement adjustment |
| Concurrency tests | PostgreSQL-level tests for concurrent return creation, concurrent refund approval, concurrent inventory restoration |
| IDOR tests | Cross-buyer, cross-store, cross-org access attempts all return 403 |
| Financial immutability | No UPDATE on orderFinancialBreakdown after finalization during entire return flow |
| E2E tests (Playwright) | Buyer return workflow; merchant inspection workflow; admin oversight workflow |
| Regression | All P1-P12 tests pass; 0 new failures |
| Build | `npm run build` succeeds |

### 17.3 Release Criteria

```text
BD-P13-RELEASE-001: All 30 acceptance criteria (AC-P13-001 through AC-P13-030) must PASS.
BD-P13-RELEASE-002: All 6 business decisions requiring approval (BD-P13-APPROVE-001 through 006) must have explicit approval BEFORE release.
BD-P13-RELEASE-003: No P0 or P1 defects open.
BD-P13-RELEASE-004: P12 remains CLOSED / PASS (no regression).
BD-P13-RELEASE-005: Migration 0059 verified on both fresh and existing databases.
```

---

## 18. Final Decision

### 18.1 Summary

This document locks all business rules and architecture decisions for P13 — Returns, Refunds & Disputes Integration. Every proposed capability has been evaluated against the verified codebase. All state machines, eligibility rules, financial rules, inventory rules, authorization, concurrency, and migration decisions are specified at a level of detail sufficient for implementation without unresolved business decisions.

**Six business decisions require explicit approval before release** (see §15.1). These are commercial/policy decisions that cannot be made by the architecture team alone. The locked defaults are reasonable and implementable, but require business sign-off.

### 18.2 Decisions Classification

- **Verified existing behavior**: BD-P13-IMMUT-*, BD-P13-NODOUBL-*, BD-P13-INVREL-*, BD-P13-SHIP-002/003 — confirmed by source code inspection.
- **Proposed rule (locked)**: All BD-P13-RETURN-FSM, BD-P13-ELIG-*, BD-P13-QTY-*, BD-P13-FIN-*, BD-P13-INV-*, BD-P13-AUTH-*, BD-P13-CONC-*, BD-P13-MIG-* — new rules designed for P13, verified against existing architecture patterns.
- **Explicit business approval required**: BD-P13-APPROVE-001 through 006, BD-P13-COMM-003, BD-P13-RECOVER-004, BD-P13-WINDOW-004 — commercial, legal, or tax policy decisions.

### 18.3 Critical Business Decisions Pending

The following require explicit business approval. Implementation may proceed with the locked defaults, but release requires approval:

1. **Return window**: 14 days (default, parameterized via RETURN_WINDOW_DAYS)
2. **Commission retention**: Platform retains full commission on refund
3. **Delivery fee refund on full return**: Included in refund
4. **Merchant response SLA**: 72 hours
5. **Settlement recovery**: Manual admin process
6. **VOUCHER returns**: Require admin review

### 18.4 Final Gate Decision

**P13 BUSINESS RULES & ARCHITECTURE LOCK = LOCKED / GO**

All architecture decisions are locked. All business rules are specified. Six business approvals are flagged for sign-off before release but do not block implementation (defaults are locked and implementable).

**Implementation may begin = YES**

**Next gate**: `P13 IMPLEMENTATION`
