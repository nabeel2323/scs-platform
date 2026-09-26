# M6 Merchant Offer, Inventory & Pricing — Code Audit

> **Git commit:** `ba6f9f9` (develop)
> **Date:** 2026-09-27
> **Auditor:** Senior full-stack / marketplace architect
> **Scope:** Pre-runtime code audit answering every Section 4 question before any changes are made.

---

## 1. Merchant Offer

### 1.1 How are offers created?

**File:** `apps/api/src/modules/catalog/catalog.offer.service.ts` → `createOffer()`

Offers are created via `POST /merchant/offers` (controller: `catalog.offer.controller.ts`). The merchant supplies:

```
storeId, productId, variantId?, status? (DRAFT|PROPOSED), currency?, basePriceMinor?,
moq?, orderIncrement?, leadTimeDays?, priceListId?, warehouseId?, externalRef?
```

The service:
1. Validates `storeId` is non-empty, `productId` is non-empty.
2. Defaults `status` to `DRAFT`; only `DRAFT` or `PROPOSED` are allowed for new offers.
3. Validates `moq ≥ 1`, `basePriceMinor ≥ 0`, `orderIncrement ≥ 1` (if provided).
4. Verifies the product exists.
5. If `variantId` is supplied, verifies the variant belongs to that product (`productVariants.id = variantId AND productVariants.productId = productId`).
6. Enforces one offer per `(store, variant)` or `(store, product-default)` — see §1.8.
7. Inserts a `merchantOffers` row with `crypto.randomUUID()` PK.
8. Writes an `offer.created` audit event.

### 1.2 Who owns an offer?

An offer is owned by the **store** it references (`merchantOffers.storeId`). Stores belong to organizations (`stores.orgId → organizations.id`). Therefore:

- **Offer → Store → Organization** is the ownership chain.
- The `proposedBy` field records which user created the offer (references `users.id`).
- The `reviewedBy` field records which admin approved/rejected it.

### 1.3 How is merchant/store isolation enforced?

**File:** `apps/api/src/common/tenant-scope.ts`

Every merchant write route passes a `CallerContext` (derived from JWT: `sub`, `role`, `activeOrg`). The service calls `assertStoreInOrg(db, caller, offer.storeId)` which:

1. Looks up `stores.orgId` for the given store.
2. Compares it to `caller.activeOrg`.
3. If mismatch → `403 Forbidden`.
4. Platform staff (`SUPER_ADMIN`, `ADMIN`, `MODERATOR`) bypass (fail-open by design).

This is called in: `createOffer`, `proposeOffer`, `withdrawOffer`, `updateOfferPricing`. The controller applies `@RequirePermissions('catalog:offers:write')` and constructs the caller context from the request.

### 1.4 Can an offer reference another merchant's store?

**No.** The `assertStoreInOrg()` check prevents this. If Merchant A (orgId=X) tries to create an offer with `storeId` belonging to Merchant B (orgId=Y), the store lookup returns orgId=Y ≠ X → 403.

Additionally, `updateOfferPricing()` validates:
- `priceListId` must belong to the same store as the offer (`pl.storeId === offer.storeId`).
- `warehouseId` must belong to the same store as the offer (`wh.storeId === offer.storeId`).

### 1.5 Can a merchant create an offer for a product outside its permitted organization?

The product itself is canonical (may have no store, or may belong to any store). The offer creation validates:
- The product exists (any product can be offered).
- The variant (if specified) belongs to that product.
- The **store** creating the offer belongs to the caller's org.

So a merchant CAN create an offer for any canonical product/variant, but only through their own store. This is the correct marketplace model — canonical products are platform-owned, offers are merchant-owned.

### 1.6 How are variants selected?

The merchant supplies `variantId` (optional) when creating an offer:
- `variantId` present → **variant-scoped offer** (pins to one specific variant).
- `variantId` null → **product-scoped offer** (can back any variant of that product).

The service verifies `variantId` belongs to `productId` via a compound WHERE clause.

### 1.7 Is `offerId` the authoritative identity?

**Yes.** `merchantOffers.id` (UUID PK) is the authoritative offer identity. It is:
- Referenced by `cartItems.offerId` (FK → `merchantOffers.id`).
- Referenced by `orderItems.offerId` (FK → `merchantOffers.id`).
- Stored in `orderItems.offerSnapshot` as a JSONB capture of the offer's terms at checkout time.
- Used in the price resolver (`resolveOfferPrices()`) to determine which offer backs a price.

### 1.8 What are offer lifecycle states?

**Transition matrix** (from `TRANSITIONS` constant):

| From → To | DRAFT | PROPOSED | ACTIVE | SUSPENDED | REJECTED | WITHDRAWN |
|---|---|---|---|---|---|---|
| **DRAFT** | — | ✓ | | | | ✓ |
| **PROPOSED** | | — | ✓ | | ✓ | ✓ |
| **ACTIVE** | | | — | ✓ | | ✓ |
| **SUSPENDED** | | | ✓ | — | | ✓ |
| **REJECTED** | | ✓ | | | — | ✓ |
| **WITHDRAWN** | | | | | | — (terminal) |

Each transition:
- Is validated by `assertTransition()`.
- Writes an audit event (`offer.proposed`, `offer.approved`, `offer.rejected`, `offer.suspended`, `offer.reactivated`, `offer.withdrawn`).
- Updates `updatedAt`.
- `approveOffer` sets `activatedAt` timestamp.
- `suspendOffer` sets `isAvailable = false`.
- `withdrawOffer` sets `isAvailable = false`.

### 1.9 How are MOQ and lead time represented?

- **MOQ:** `merchantOffers.moq` (integer, default 1). Enforced at checkout (see §6.3).
- **Lead time:** `merchantOffers.leadTimeDays` (integer, nullable). Informational — displayed to buyers.
- **Order increment:** `merchantOffers.orderIncrement` (integer, nullable).

### 1.10 Is merchant SKU separate from canonical SKU?

**No separate merchant SKU field exists on the offer.** The canonical SKU lives on `productVariants.sku`. The offer has `externalRef` (varchar 120, nullable) which can store a merchant's external reference, but this is not a "merchant SKU" in the product sense.

Order items snapshot the canonical `sku` and `title` at checkout time (`orderItems.sku`, `orderItems.title`), preserving what was ordered regardless of later canonical changes.

### 1.11 Can duplicate offers be created?

**No.** The service enforces uniqueness via application-level check before insert:

```typescript
// One offer per (store, variant) or (store, product-default)
const dupCond = input.variantId
  ? and(eq(storeId), eq(variantId))
  : and(eq(storeId), eq(productId), isNull(variantId));
```

If a duplicate is detected → `409 ConflictException: "This store already has an offer for the product/variant"`.

**Note:** This is application-level, not a DB unique constraint. A concurrent race could theoretically bypass it, but the low-frequency nature of offer creation makes this acceptable.

---

## 2. Inventory

### 2.1 Is inventory attached to the correct entity?

**Yes.** Inventory is attached to `(variantId, warehouseId)` via `inventoryItems`:

```
inventoryItems:
  variantId → productVariants.id
  warehouseId → warehouses.id
  qtyOnHand, qtyReserved, reorderPoint, maxStock, lowStockAlert
```

A UNIQUE constraint on `(variant_id, warehouse_id)` exists (migration 0005). Inventory is per-variant per-warehouse, NOT per-product and NOT per-offer. This is correct — multiple offers from the same store share the same inventory pool.

### 2.2 Is inventory merchant/store scoped?

**Yes.** Warehouses belong to stores (`warehouses.storeId → stores.id`), and inventory items belong to warehouses. The chain is:

```
inventoryItems → warehouses → stores → organizations
```

Tenant scoping is enforced via:
- `assertWarehouseInOrg()` — for warehouse-level queries.
- `assertInventoryItemInOrg()` — for item-level operations (traces: item → warehouse → store → org).
- `listByStore()` — fetches warehouses for the store, then items for those warehouses.

### 2.3 Is warehouse support implemented?

**Yes.** Full warehouse support:
- `warehouses` table with `storeId`, `name`, `address`, `managerName`, `managerPhone`, `status`.
- CRUD via `POST /inventory` (creates item linked to warehouse).
- Warehouse-level queries: `GET /inventory/warehouse/:warehouseId`.
- Cross-warehouse transfers: `POST /inventory/transfer`.
- Store inventory listing: `GET /stores/:storeId/inventory` (aggregates across all store warehouses).

### 2.4 How is available quantity calculated?

```
available = qtyOnHand - qtyReserved
```

This is computed at read time, not stored. Every stock check uses this formula:
- `reserveStock()`: `const available = locked.qtyOnHand - locked.qtyReserved;`
- `transferStock()`: `const availableForTransfer = item.qtyOnHand - item.qtyReserved;`
- `adjustStock()`: `if (newQty < item.qtyReserved)` prevents going below reserved.
- Product cards: `stockByVariant.set(vid, prev + (row.qtyOnHand - row.qtyReserved))`

### 2.5 How are reservations represented?

Reservations are tracked via:
1. **`inventoryItems.qtyReserved`** — running total of reserved quantity.
2. **`stockMovements`** — append-only ledger with `movementType = 'RESERVE'`, signed quantity (negative = reserved), `referenceType = 'ORDER'`, `referenceId = orderId`.

### 2.6 How are reservations released?

Two paths:

1. **Explicit release:** `inventoryService.releaseStock()` — uses `SELECT ... FOR UPDATE`, clamps to `Math.max(0, qtyReserved - quantity)` (idempotent), writes a `RELEASE` movement.

2. **Order FSM settlement:** `orders.service.ts → settleStockForStatus()`:
   - `CANCELLED` / `REJECTED` → releases stock (`RELEASE` movement, decreases `qtyReserved`).
   - `DELIVERED` → consumes stock (`SALE` movement, decreases both `qtyOnHand` and `qtyReserved`).
   - Uses net-outstanding calculation to make replayed transitions idempotent.
   - Locks inventory row with `SELECT ... FOR UPDATE` before mutating.

### 2.7 Are concurrent reservations safe?

**Yes.** Three layers of protection:

1. **`SELECT ... FOR UPDATE`** in `reserveStock()` — serializes concurrent reservations on the same inventory row.
2. **Single transaction** wraps ALL item reservations in an order — atomic all-or-nothing.
3. **Optimistic locking** in `acceptOrder()` — atomic `UPDATE WHERE status = currentStatus` with row count check prevents double-accept.

The `reserveStock()` method in orders.service.ts iterates through store warehouses and reserves from the first with available stock, all within a single transaction.

### 2.8 Can stock go negative?

**No.** Multiple guards:
- `reserveStock()`: checks `available < input.quantity` → throws before updating.
- `adjustStock()`: checks `newQty < item.qtyReserved` and `newQty < 0` → throws.
- `bulkAdjustStock()`: same checks per item.
- `transferStock()`: checks `availableForTransfer < input.quantity` → throws.
- `releaseStock()`: clamps to `Math.max(0, ...)` — safe against double-release.
- `settleStockForStatus()`: uses `GREATEST(..., 0)` SQL — safe against over-consumption.

### 2.9 Is inventory isolated between merchants?

**Yes.** The ownership chain `inventoryItems → warehouses → stores → organizations` ensures isolation. Tenant scoping functions (`assertInventoryItemInOrg`, `assertWarehouseInOrg`) enforce that Merchant A cannot read or modify Merchant B's inventory. Non-staff callers without an explicit warehouse filter are pinned to their own org's warehouses.

---

## 3. Pricing

### 3.1 Where is authoritative pricing stored?

Pricing is stored in **`priceTiers`** (linked to `priceLists`):

```
priceLists: id, storeId, name, currency, priority, isActive
priceTiers: id, priceListId, variantId, minQty, maxQty, unitPriceMinor
```

Offers reference a price list via `merchantOffers.priceListId`. The offer's `basePriceMinor` is a display/fallback value; the actual transaction price comes from the price list tiers.

### 3.2 How are currencies represented?

- **Store level:** `stores.currency` (char(3), default 'SAR').
- **Offer level:** `merchantOffers.currency` (char(3), default 'SAR').
- **Price list level:** `priceLists.currency` (char(3)).
- **Order level:** `orders.currency` (char(3), nullable — snapshot at checkout).
- All monetary amounts use **integer minor units** (halalas) via `bigint`.

### 3.3 Are prices server authoritative?

**Yes.** The price resolution flow is entirely server-side:

1. `resolveOfferPrices()` in `price-resolution.ts` is the single source of truth.
2. It is called by: cart `addItem()`, cart `addItems()`, cart `updateItemQuantity()`, cart `validateCart()`, orders `checkout()`, orders `checkPriceDeltas()`, product cards `enrichProductCards()`.
3. The client never supplies a price. The `AddCartItemInput` DTO has no price field — only `variantId`, `quantity`, and optional `offerId`.
4. The cart snapshots the resolved price (`cartItems.priceMinor`) at add time.

### 3.4 Are tier prices supported?

**Yes.** Full tier ladder support:
- `priceTiers` table with `minQty`, `maxQty`, `unitPriceMinor`.
- `resolveOfferPrices()` selects the tier with the highest `minQty` that is ≤ the requested quantity, within the highest-priority active price list.
- Cart re-resolves tier when quantity changes (`updateItemQuantity()`).
- Tier display ladder available via `{ ladder: true }` option.

### 3.5 Is MOQ enforced server-side?

**Yes.** MOQ enforcement happens at checkout:

```typescript
const authoritativeMoq = offerSnapshot?.moq ?? product?.moq ?? 1;
if (authoritativeMoq > item.quantity) throw BadRequestException(...)
```

The offer's MOQ takes precedence over the product's MOQ. This check runs inside the checkout flow, after offer re-validation.

**Note:** MOQ is NOT enforced at cart-add time — only at checkout. The cart allows adding below-MOQ quantities but checkout will reject them.

### 3.6 Can client-submitted prices influence totals?

**No.** The client has no mechanism to submit prices:
- `AddCartItemInput` has no price field.
- `CheckoutInput` has no price field — only `buyerId`, `deliveryAddress`, `notes`, `idempotencyKey`, `fulfillmentMethod`.
- Prices are resolved server-side by `resolveOfferPrices()` and snapshotted.
- Order totals are computed by `computeOrderFinancials()` from server-side line totals.

### 3.7 Are currency mismatches prevented?

**Partially.** The product-card enrichment (`product-card.ts`) tracks lowest offer price **per currency** — it never compares 100 SAR against 100 USD numerically:

```typescript
const lowestByCurrency = new Map<string, number>();
// ... tracks lowest price per currency independently
```

The card reports the lowest price in the product's own store currency when available, otherwise the first available currency. The `lowestOfferCurrency` field accompanies `lowestOfferPriceMinor`.

At checkout, each sub-order has a single `currency` taken from its store. Cross-currency orders result in `masterOrder.currency = null` with `totalsByCurrency` providing the per-currency breakdown.

**Gap:** The search/listing card does show a single `lowestOfferPriceMinor` — if multiple currencies exist and the store currency isn't among them, it picks "the first currency's lowest" (non-deterministic Map iteration order). This is a display concern, not a transaction concern.

### 3.8 Is price snapshotting correct?

**Yes.** Multiple layers of snapshotting:

1. **Cart snapshot:** `cartItems.priceMinor` = price at add-time. Never re-read from price tiers on cart read.
2. **Checkout re-validation:** `checkout()` calls `resolveOfferPrices()` again to verify the current price matches. If the offer is no longer ACTIVE → checkout fails.
3. **Order item snapshot:** `orderItems.unitPriceMinor` = cart's `priceMinor` (which was server-resolved).
4. **Offer snapshot:** `orderItems.offerSnapshot` (JSONB) captures the full offer terms at checkout: `{ id, storeId, priceListId, warehouseId, basePriceMinor, compareAtPriceMinor, currency, moq, orderIncrement, leadTimeDays, snapshotStatus, capturedAt }`.
5. **Re-price guard:** `acceptOrder()` calls `checkPriceDeltas()` — if any item's current price differs from snapshot by >5%, accept is rejected with 409.
6. **Historical reads:** `getOrderWithItems()` prefers `offerSnapshot` over the live `merchantOffers` row for display.

---

## 4. Buyer Search

### 4.1 Does search expose active offers?

**Yes.** The `enrichProductCards()` function in `product-card.ts` queries `merchantOffers` for all ACTIVE offers matching the search result products:

```typescript
const offerRows = await db.query.merchantOffers.findMany({
  where: and(
    inArray(merchantOffers.productId, productIds),
    eq(merchantOffers.status, 'ACTIVE'),
  ),
  columns: { productId: true, basePriceMinor: true, currency: true },
});
```

### 4.2 Is offer count correct?

**Yes.** `activeOfferCount` is computed as the count of ACTIVE offers for each product across all stores. It is exposed on the `CardEnrichment` interface.

### 4.3 Is lowest active offer price correct?

**Yes, with a caveat.** `lowestOfferPriceMinor` tracks the lowest `basePriceMinor` across active offers, **per currency**. The selection prefers the product's own store currency when available. The caveat (see §3.7) is that when no offer exists in the store currency, the "first" currency is picked non-deterministically.

### 4.4 Is currency handling correct?

**Mostly.** Prices are tracked per-currency (no cross-currency numeric comparison). The card exposes both `lowestOfferPriceMinor` and `lowestOfferCurrency` so the UI can display "From SAR 3,250" with the currency label.

### 4.5 Does a buyer know whether a product has offers?

**Yes.** `activeOfferCount > 0` tells the buyer that competing sellers exist. The ranked offers endpoint (`GET /products/:productId/offers/ranked`) provides full seller comparison with store name, verification status, price, MOQ, lead time, and popularity ranking.

### 4.6 Can a buyer select a specific offer?

**Yes.** The `AddCartItemInput` accepts an `offerId` field. The cart service validates:
1. The offer exists.
2. The offer is `ACTIVE`.
3. The offer's scope matches (variant-scoped → exact variant match; product-scoped → any variant of that product).
4. The cart line is keyed by `(cartId, variantId, offerId)` so different sellers create separate lines.

---

## 5. Cart

### 5.1 Is cart identity `(cartId, variantId, offerId)`?

**Yes.** The merge key for cart items is:

```typescript
const existingConditions = [
  eq(cartItems.cartId, cart.id),
  eq(cartItems.variantId, variant.id),
  selectedOfferId ? eq(cartItems.offerId, selectedOfferId) : undefined,
];
```

When `offerId` is provided, the merge key is `(cartId, variantId, offerId)`. Without an offer, it falls back to `(cartId, variantId)`.

### 5.2 Can two offers for the same variant coexist?

**Yes.** Because the merge key includes `offerId`, adding the same variant from Merchant A and Merchant B creates two separate cart lines. This is the correct marketplace behavior.

### 5.3 Is merchant identity preserved?

**Yes.** Each cart item stores `storeId` (derived from the offer's store or the product's store). The `listCartItems()` query LEFT JOINs `stores` to expose `storeName`, `storeSlug`, `storeCurrency`. Offer metadata (`leadTimeDays`, `moq`, `status`) is also joined and exposed per line.

### 5.4 Is price server-resolved?

**Yes.** `resolveOfferPrices()` is called server-side during `addItem()`, `addItems()`, and `updateItemQuantity()`. The resolved `unitPriceMinor` is snapshotted on the cart item. The client never supplies a price.

### 5.5 Is MOQ enforced?

**At checkout, yes. At cart-add, no.** The cart allows adding any quantity ≥ 1. MOQ is enforced during checkout validation (see §3.5).

### 5.6 Is inventory validated?

**Not at cart-add time.** The cart does not check inventory availability when adding items. Inventory is checked during:
- `acceptOrder()` → `reserveStock()` — reserves stock with `SELECT ... FOR UPDATE`.
- If insufficient stock, the reservation is partial (best-effort per warehouse).

The `enrichProductCards()` function does compute a `stockStatus` (IN_STOCK / LOW_STOCK / OUT_OF_STOCK) for display, so the buyer can see availability before adding to cart.

### 5.7 Does cart display merchant, offer, SKU and price correctly?

**Yes.** `listCartItems()` returns:
- `title` (from variant or product), `sku` (from variant), `storeName`, `storeSlug`, `storeCurrency`.
- `offer` object: `{ id, leadTimeDays, moq, status }` when the line is backed by an offer.
- `priceMinor`, `lineTotalMinor`, `quantity`, `tierMinQty`.

---

## 6. Checkout

### 6.1 Does checkout validate offers again?

**Yes.** Checkout performs offer re-validation:

```typescript
const fullOffers = await db.query.merchantOffers.findMany({
  where: inArray(merchantOffers.id, offerIds),
});
const activeSet = new Set(fullOffers.filter(o => o.status === 'ACTIVE').map(o => o.id));
for (const item of items) {
  if (oid && !activeSet.has(oid)) {
    throw new BadRequestException('A seller\'s offer for one of your items is no longer active');
  }
}
```

If any referenced offer is no longer ACTIVE (suspended, withdrawn, rejected), checkout fails.

### 6.2 Does checkout validate inventory again?

**Not at checkout time.** Inventory reservation happens at `acceptOrder()`, not at checkout. Checkout creates the order; the merchant's accept action triggers stock reservation. This is the documented reservation policy: "stock reserved at merchant acceptance, not at cart."

### 6.3 Does checkout use server-side pricing?

**Yes.** Checkout re-resolves prices via `resolveOfferPrices()` for the re-price guard. The actual charged price is the cart's snapshotted `priceMinor` (which was server-resolved at add time). If the current price differs from the snapshot by >5%, the `checkPriceDeltas()` guard blocks merchant accept.

### 6.4 Is checkout atomic?

**Yes.** The entire checkout is wrapped in a single DB transaction:

```typescript
await this.db.db.transaction(async (tx) => {
  // Insert master order
  // For each store group: insert sub-order, items, financial breakdown, status history
  // Mark cart as CONVERTED
  // Write outbox event
});
```

If any step fails, everything rolls back. Additionally, idempotency key race conditions are handled by catching PostgreSQL unique violation (error 23505) and returning the existing order.

### 6.5 Is idempotency implemented?

**Yes.** Full idempotency with fingerprint comparison:

1. Client supplies `idempotencyKey` (string, max 64 chars).
2. Server computes a SHA-256 fingerprint of `(sorted cart items, fulfillmentMethod, deliveryAddress)`.
3. If a matching key exists:
   - Same fingerprint → return existing order (idempotent retry).
   - Different fingerprint → 409 Conflict.
   - Legacy order (no fingerprint) → return existing.
4. The `masterOrders.idempotencyKey` column has a UNIQUE constraint.

### 6.6 Does multi-merchant checkout split correctly?

**Yes.** Items are grouped by `storeId`:

```typescript
const grouped = new Map<string, typeof items>();
for (const item of items) {
  const storeId = item.storeId;
  if (!grouped.has(storeId)) grouped.set(storeId, []);
  grouped.get(storeId).push(item);
}
```

Each group becomes a separate sub-order under one master order:

```
Master Order (1)
  ├── Sub Order A (store A)
  │   ├── items for store A
  │   └── financial breakdown A
  └── Sub Order B (store B)
      ├── items for store B
      └── financial breakdown B
```

Each sub-order gets its own:
- Financial calculation (subtotal, discount, delivery, tax, commission, merchant net).
- Currency (from its store).
- Status history.
- Promotion resolution (per-store).

---

## 7. Orders

### 7.1 Are Master Orders and Sub Orders created correctly?

**Yes.** Checkout creates:
1. One `masterOrders` row (buyer, status=SUBMITTED, delivery address, idempotency key, fingerprint).
2. One `orders` row per store group (sub-order with store-specific financials).
3. `orderItems` rows per line item (with SKU/title snapshot, offer snapshot).
4. `orderFinancialBreakdown` per sub-order (products, discount, delivery, tax, commission, merchant net).
5. `orderStatusHistory` per sub-order (initial SUBMITTED entry).
6. Outbox event `order.submitted` inside the transaction.

### 7.2 Are merchant ownership boundaries preserved?

**Yes.** Each sub-order references exactly one `storeId`. Access control:
- `assertOrderAccessible()` — checks buyer ownership OR store's org membership OR platform staff.
- `assertMasterOrderAccessible()` — checks buyer ownership OR any sub-order store's org membership.
- `listOrders()` — non-staff callers without a store filter are pinned to their own buyer ID; with a store filter, `assertStoreInOrg()` is enforced.

### 7.3 Are offer terms snapshotted?

**Yes.** `orderItems.offerSnapshot` (JSONB) captures:
```json
{
  "id": "offer-uuid",
  "storeId": "store-uuid",
  "priceListId": "pricelist-uuid",
  "warehouseId": "warehouse-uuid",
  "basePriceMinor": 325000,
  "compareAtPriceMinor": null,
  "currency": "SAR",
  "moq": 1,
  "orderIncrement": null,
  "leadTimeDays": 3,
  "snapshotStatus": "ACTIVE",
  "capturedAt": "2026-09-27T10:00:00.000Z"
}
```

### 7.4 Are price/currency/MOQ/merchant SKU snapshots immutable?

**Yes.**
- `orderItems.unitPriceMinor` — written once at checkout, never updated.
- `orderItems.offerSnapshot` — written once at checkout, never updated.
- `orderItems.sku` / `orderItems.title` — canonical snapshots written at checkout.
- `orders.currency` — store currency snapshot at checkout.
- `orderFinancialBreakdown` — written atomically with the order, never updated (except by `partiallyAcceptOrder` which correctly recomputes via `computeOrderFinancials()`).

### 7.5 Can later offer changes modify historical orders?

**No.** The `offerSnapshot` is written once at checkout and never updated. Historical order reads (`getOrderWithItems()`) prefer the snapshot over the live offer row:

```typescript
const snap = item.offerSnapshot;
const offer = snap
  ? { leadTimeDays: snap.leadTimeDays, moq: snap.moq, status: snap.snapshotStatus, storeId: snap.storeId, source: 'snapshot' }
  : oid && offerMap ? { ...offerMap.get(oid), source: 'live' } : null;
```

Even if the offer is later suspended, deleted (FK `ON DELETE SET NULL` clears `offer_id`), or repriced, the historical order retains its original terms.

---

## 8. Order FSM

The 16-state order FSM:

```
DRAFT → SUBMITTED → PENDING_CONFIRMATION → ACCEPTED | PARTIALLY_ACCEPTED | REJECTED | CANCELLED
ACCEPTED / PARTIAL → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED → COMPLETED
READY → ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY (P2 driver flow)
DELIVERED / COMPLETED → DISPUTED (≤72h)
PAYMENT_PENDING → PREPARING | CANCELLED (P3 prepay)
```

Key invariants:
- Any pre-DELIVERED state can transition to CANCELLED.
- Stock is reserved at ACCEPT, released at CANCEL/REJECT, consumed at DELIVER.
- Status history is append-only.
- Every transition emits an outbox event.

---

## 9. Summary of Findings

### Strengths
1. **Clean canonical/merchant separation** — offers reference canonical products but own commercial terms.
2. **Server-authoritative pricing** — client never supplies prices; shared resolver backs cart, PDP, and checkout.
3. **Atomic checkout** — single transaction wraps master order, sub-orders, items, financials, cart conversion, outbox.
4. **Offer snapshotting** — immutable JSONB capture preserves historical truth.
5. **Tenant isolation** — `assertStoreInOrg()`, `assertInventoryItemInOrg()`, `assertOrderAccessible()` enforce org boundaries.
6. **Concurrency safety** — `SELECT ... FOR UPDATE` on inventory rows, optimistic locking on accept.
7. **Idempotency with fingerprint** — prevents duplicate checkout and detects key reuse with different intent.
8. **Cross-currency safety** — per-currency price tracking on search cards, per-currency sub-order totals.
9. **Comprehensive FSM** — 16 states with append-only history and outbox events.
10. **Re-price guard** — merchant accept blocked if price changed >5% since checkout.

### Gaps / Risks Identified (to verify at runtime)
1. **MOQ not enforced at cart-add** — only at checkout. Buyer can add below-MOQ quantities and discover the error only at checkout.
2. **Inventory not validated at cart-add** — no real-time stock check when adding to cart. Stock status on cards is informational.
3. **Duplicate offer check is application-level** — no DB unique constraint. Concurrent creation could theoretically bypass.
4. **Search card lowest price currency selection** — when no offer matches the store currency, "first currency" is non-deterministic.
5. **No separate merchant SKU** — `externalRef` exists but is not a first-class merchant SKU field.
6. **Reservation at accept, not checkout** — stock is not reserved when the order is placed, only when the merchant accepts. Between checkout and accept, stock could be sold to another buyer.
7. **Partial reservation is acceptable** — if a warehouse doesn't have enough stock, the reservation is best-effort per item. The order can still be accepted with unreserved items.

---

## 10. Files Inspected

| File | Lines | Purpose |
|---|---|---|
| `catalog.offer.schema.ts` | 71 | Merchant offer table definition |
| `catalog.offer.controller.ts` | 210 | Offer API routes (read, write, governance) |
| `catalog.offer.service.ts` | 711 | Offer creation, lifecycle, analytics, pricing |
| `inventory.schema.ts` | 41 | Inventory items + stock movements tables |
| `inventory.controller.ts` | 151 | Inventory API routes |
| `inventory.service.ts` | 649 | Stock CRUD, reservation, transfer, movements |
| `cart.schema.ts` | 44 | Cart + cart items tables |
| `cart.service.ts` | 593 | Multi-supplier cart with offer selection |
| `orders.schema.ts` | 120 | Master orders, sub-orders, items, financials, history |
| `orders.service.ts` | 1410 | Checkout, FSM, accept/reject, stock settlement |
| `order-pricing.ts` | 114 | Financial calculations (VAT, commission, delivery) |
| `price-resolution.ts` | 318 | Shared price resolver (offer-aware + legacy fallback) |
| `product-card.ts` | 341 | Search card enrichment (offers, stock, pricing) |
| `merchant.schema.ts` | 83 | Stores, warehouses, documents, verification |
| `tenant-scope.ts` | 163 | Object-level tenant isolation assertions |
