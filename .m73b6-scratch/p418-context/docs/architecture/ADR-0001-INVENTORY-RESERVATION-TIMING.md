# ADR-0001: Inventory Reservation Timing

**Date:** 2026-09-27  
**Status:** Accepted  
**Deciders:** M6.2 production hardening pass  

---

## Context

The Smart Commerce platform is a B2B marketplace where buyers purchase from multiple merchant offers. Each offer references inventory held in the merchant's warehouses. The platform must ensure that merchants can fulfill accepted orders without overselling stock.

Two design options exist for when inventory is reserved:

1. **Reserve at checkout** — stock is reserved immediately when the buyer places the order
2. **Reserve at merchant acceptance** — stock is reserved only when the merchant explicitly accepts the order

---

## Current Behavior

Inventory is reserved at **merchant acceptance**, not at checkout.

```
Buyer checkout
    ↓
Master order + sub-orders created (status: SUBMITTED → PENDING_CONFIRMATION)
    ↓
Merchant reviews order
    ↓
Merchant ACCEPTS order
    ↓
reserveStock() called — SELECT ... FOR UPDATE within transaction
    ↓
qtyReserved incremented, RESERVE movement written
    ↓
Order status → ACCEPTED
```

This is implemented in `orders.service.ts → acceptOrder()`:
1. Validates the order and caller permissions
2. Calls `this.reserveStock(orderId, storeId)` which queries `orderItems` and calls `inventoryService.reserveStock()` for each item
3. Records the status change and publishes an outbox event

Stock settlement on later transitions:
- **REJECTED / CANCELLED** → `settleStockForStatus()` releases reserved stock (RELEASE movement, decreases `qtyReserved`)
- **DELIVERED** → `settleStockForStatus()` consumes stock (SALE movement, decreases both `qtyOnHand` and `qtyReserved`)

Concurrency protection:
- `reserveStock()` uses `SELECT ... FOR UPDATE` pessimistic locking within a PostgreSQL transaction
- `releaseStock()` uses the same pattern with `Math.max(0, ...)` clamping (idempotent double-release)
- `settleStockForStatus()` uses net-outstanding calculation to make replayed transitions idempotent
- Accept uses optimistic locking (atomic `UPDATE WHERE status = 'PENDING_CONFIRMATION'`) to prevent concurrent double-accept

---

## Decision

**Keep reservation at merchant acceptance for the current B2B pilot phase.**

---

## Benefits of Reservation at Acceptance

1. **Merchant control** — The merchant explicitly reviews and commits to fulfilling the order before stock is set aside. This matches B2B wholesale workflows where merchants may need to verify stock quality, batch availability, or shipping logistics before committing.

2. **No phantom reservations** — If a merchant rejects an order, no stock was ever reserved. There is no need for automatic release timers or cleanup jobs for unaccepted orders.

3. **Simpler cancellation** — A buyer can cancel before acceptance without any inventory side-effects. The order simply transitions to CANCELLED with no stock movements.

4. **Partial acceptance support** — Merchants can partially accept orders (confirming some items, rejecting others). Stock is reserved only for the confirmed subset, with no need to release the rejected items.

5. **Consistent with B2B norms** — In wholesale/B2B commerce, order confirmation by the supplier is the standard commitment point. Stock reservation before confirmation would create obligations the merchant hasn't agreed to.

---

## Risks

### Primary Risk: Overselling Between Checkout and Acceptance

Between the time a buyer checks out and the merchant accepts, the stock is **not reserved**. If another buyer purchases the same stock during this window and the merchant has already accepted their order, the first order may not be fulfillable.

**Example scenario:**
1. Buyer A checks out 10 units of Widget X from Merchant A (stock = 15)
2. Buyer B checks out 10 units of Widget X from Merchant A (stock = 15, nothing reserved)
3. Merchant A accepts Buyer A's order → reserves 10 (stock: 15 on-hand, 10 reserved, 5 available)
4. Merchant A accepts Buyer B's order → attempts to reserve 10, but only 5 available → **FAILS**

**Impact:** Buyer B has a confirmed order that cannot be fulfilled. The merchant must manually resolve the shortage.

### Mitigating Factors

1. **Low order volume** — In the pilot phase, the window between checkout and acceptance is short (minutes to hours), and order volume is low enough that stock conflicts are rare.

2. **Merchant communication** — Merchants can see pending orders and stock levels. They can proactively adjust inventory or reject orders they cannot fulfill.

3. **Order status visibility** — Buyers can see their order status. If an order cannot be fulfilled, the merchant can reject it and the buyer is notified.

4. **No financial commitment** — In the current pilot, payment is invoiced on delivery. There is no pre-authorization or charge at checkout, so an unfulfillable order has no financial impact beyond the inconvenience.

---

## Conditions for Reconsideration

Reservation at checkout should be reconsidered when any of the following conditions are met:

1. **High order volume** — The time between checkout and acceptance becomes long enough, or order volume high enough, that stock conflicts become frequent.

2. **Pre-paid orders** — If the platform introduces pre-payment or payment authorization at checkout, buyers expect their stock to be guaranteed.

3. **SLA requirements** — If merchant acceptance SLAs are introduced (e.g., "must accept within 15 minutes"), the gap between checkout and acceptance becomes bounded and reservation at checkout becomes more appropriate.

4. **Multi-warehouse fulfillment** — If orders can be fulfilled from multiple warehouses, the reservation model needs to account for split fulfillment, which is easier with checkout-time reservation.

5. **Buyer guarantees** — If the platform offers "guaranteed fulfillment" as a buyer-facing promise, checkout-time reservation is required.

---

## Architectural Changes Required for Checkout-Time Reservation

If the decision is made to move to checkout-time reservation:

1. **Move `reserveStock()` call** from `acceptOrder()` to `checkout()` in `orders.service.ts`. The checkout transaction would atomically create the order and reserve stock.

2. **Handle reservation on rejection/cancellation** — When a merchant rejects or a buyer cancels before acceptance, the already-reserved stock must be released. The existing `settleStockForStatus()` already handles this for CANCELLED and REJECTED.

3. **Handle acceptance without re-reservation** — `acceptOrder()` must detect that stock is already reserved (by checking stock_movements for this order's RESERVE rows) and skip the duplicate reservation.

4. **Handle insufficient stock at checkout** — If stock is unavailable at checkout time, the checkout must fail with a clear error. This is a behavior change: currently checkout succeeds even if stock is low, because reservation happens later.

5. **Add reservation TTL** — If merchants don't accept within a timeout, the reservation should be automatically released. This requires a background job or event-driven timeout.

6. **Update order status FSM** — Consider adding a `RESERVED` or `PENDING_RESERVATION` status to track the reservation state independently of the order lifecycle.

7. **Update inventory display** — Show "reserved for pending orders" separately from "reserved for accepted orders" so merchants understand their commitment exposure.

---

## Consequences

- **Short-term (pilot):** No changes needed. The current model is correct and well-tested.
- **Medium-term (scale):** Monitor the checkout-to-acceptance window and stock conflict frequency. If conflicts exceed ~2% of orders, begin planning the migration to checkout-time reservation.
- **Long-term (marketplace maturity):** Checkout-time reservation is the industry standard for B2C marketplaces. The migration path is documented above and can be executed as a single milestone.
