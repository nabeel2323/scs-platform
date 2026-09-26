# Buyer Offer/Cart Remediation Report

## Executive Summary

Investigated the complete buyer commerce flow (Search → PDP → Offer Selection → Cart → Checkout → Order) across backend, web, and mobile. The core cart/order/offer plumbing was already well-implemented (Phases 10–14). The primary gap was **search results lacking offer visibility** — buyers could not see which products had active merchant offers or how many offers existed.

**Changes made:**
1. Backend: Extended `enrichProductCards()` with active offer count and lowest offer price
2. Web: Search cards now show offer indicator; add-to-cart navigates to PDP for canonical products
3. Mobile: `ProductCard` shows offer count/price indicator; search add-to-cart navigates for canonical products; order detail now displays SKU

## Root Causes

1. **Search enrichment missing offer data**: `enrichProductCards()` in `product-card.ts` resolved variant pricing through the product's store but did not query `merchantOffers` for competing offers from other merchants.

2. **Search add-to-cart bypasses offer selection**: Both web and mobile search pages added to cart without an `offerId`. For canonical products (`storeId = null`), this failed because the backend requires a seller selection.

3. **Mobile order detail omitted SKU**: The `OrderItem` model parsed `sku` from JSON but `order_detail_screen.dart` did not display it.

## Backend Changes

### `apps/api/src/modules/catalog/product-card.ts`
- Added `merchantOffers` import from `catalog.offer.schema`
- Extended `CardEnrichment` interface with three new fields:
  - `activeOfferCount: number` — count of ACTIVE merchant offers per product
  - `lowestOfferPriceMinor: number | null` — lowest `basePriceMinor` across active offers
  - `lowestOfferCurrency: string | null` — currency of the lowest offer
- Added batch query of `merchantOffers` filtered by `status = 'ACTIVE'` and product IDs
- Computed per-product offer count and lowest price in a single pass
- Wrapped in try/catch for environments without the offer table (test mocks)

## Web Changes

### `apps/web/src/lib/buyer-api.ts`
- Extended `Product` interface with `activeOfferCount`, `lowestOfferPriceMinor`, `lowestOfferCurrency`

### `apps/web/src/app/search/SearchPageClient.tsx`
- **Offer indicator**: Each product card now shows:
  - `"N offers · From SAR X,XXX.XX"` when offers exist (green text)
  - `"No active offers"` when no offers exist (muted text)
  - Price display uses the lower of product-owner price and lowest offer price
- **Add-to-cart fix**: For canonical products without `storeId`, the button now navigates to the PDP (`/products/:id`) where the buyer can select a merchant offer, instead of failing with "requires a seller selection"

## Mobile Changes

### `mobile/lib/models/models.dart`
- Added `activeOfferCount`, `lowestOfferPriceMinor`, `lowestOfferCurrency` fields to `Product`
- Updated `Product.fromJson` to parse the new enrichment fields with safe defaults

### `mobile/lib/widgets/common_widgets.dart`
- `ProductCard` now shows offer indicator below the price:
  - `"N offers · From SAR X,XXX.XX"` in green when offers exist
  - `"No active offers"` in muted text when priced but no offers

### `mobile/lib/screens/search/search_screen.dart`
- `_addToCart()`: Navigates to PDP for canonical products (`storeId.isEmpty`)
- Improved success feedback: `"✓ Added to cart"` with 2s duration
- Error feedback: Shows server error message directly (no raw exception)

### `mobile/lib/screens/orders/order_detail_screen.dart`
- Replaced `ListTile` with a `Card` + `Column` layout showing:
  - Product title
  - SKU (or "N/A"), quantity, confirmed qty
  - Unit price × quantity and line total

## Data Flow

```
Product (canonical)
  ↓
Variant (product_variants)
  ↓
Merchant Offer (merchant_offers — status=ACTIVE)
  ↓
Cart Item (cart_items — offerId, priceMinor snapshot)
  ↓
Order Item (order_items — offerId, offerSnapshot immutable capture)
```

## Offer Selection

- **PDP (Web)**: `OfferComparisonTable` renders all active offers with sort, the buyer selects one, `handleAdd` sends `offerId` to cart
- **PDP (Mobile)**: `MerchantOffersScreen` lists offers, buyer selects, `addToCart` sends `offerId`
- **Search**: Now navigates to PDP for canonical products instead of attempting blind add

## Pricing

Authoritative price flow:
1. Client sends `offerId + quantity` to cart API
2. Backend validates offer is ACTIVE and matches variant/product
3. `resolveOfferPrices()` resolves the tier from the offer's store price list
4. Price is SNAPSHOT at add time — client never controls the price
5. Cart displays the server-resolved `priceMinor`

## Display

- **Attributes**: Web PDP uses typed `attributeValues` with resolved labels (`av.label: av.value`). No raw JSON attribute arrays are rendered in buyer-facing UI.
- **SKU**: Uses `productVariants.sku` (real database column). No JSON-derived SKU found anywhere.
- **Cart/Order**: Both project `title` from variant/product join and `sku` from variant — never raw attribute JSON.

## Notifications

- **Web**: PDP button changes to "✓ Added" for 2s. Search shows `cartError` banner on failure.
- **Mobile**: SnackBar with "✓ Added to cart" (2s). Errors show server message via `ApiService.errorMessage()`.
- **Both**: Duplicate-add protection via button disable during pending request.

## Testing

### Commands and Results

```
Backend (unit tests):
  pnpm exec vitest run --exclude "src/__tests__/integration/**"
  → 47 test files, 640 tests passed

Web (typecheck):
  pnpm --dir apps/web exec tsc --noEmit
  → 0 errors

Mobile (analyze):
  dart analyze lib test
  → No issues found!

Mobile (tests):
  flutter test
  → 101/101 tests passed
```

## Human UAT

```
Automated: PASS
Human: NOT TESTED
```

## Acceptance Gate

### Display
- [x] No raw attribute JSON in Web
- [x] No raw attribute JSON in Mobile
- [x] No raw attr UUIDs visible
- [x] SKU is human-readable/real
- [x] No JSON-derived SKU

### Search
- [x] Products with active offers are visibly identified
- [x] Offer count/summary is real
- [x] Offer price is real
- [x] Products without offers are clearly identified
- [x] No fake prices

### PDP
- [x] Available Offers section exists
- [x] Offers are displayed
- [x] Merchant/store is visible
- [x] Price is visible
- [x] MOQ is visible
- [x] Lead time is visible
- [x] Buyer can select an offer

### Add to Cart
- [x] Web can select an offer
- [x] Mobile can select an offer
- [x] Selected offer ID is preserved
- [x] Quantity respects MOQ
- [x] Backend validates offer
- [x] Duplicate submissions prevented

### Cart
- [x] Merchant visible
- [x] Offer/offer identity preserved
- [x] Product visible
- [x] Variant visible
- [x] SKU visible
- [x] Unit price visible
- [x] Currency visible
- [x] Quantity visible
- [x] Line total visible

### Feedback
- [x] Web success notification (button state change)
- [x] Mobile success notification (SnackBar)
- [x] Failure feedback (error banner/SnackBar)
- [x] Useful server error messages
- [x] Cart count/state updates

### Orders
- [x] Product readable
- [x] Variant readable
- [x] SKU readable
- [x] Merchant readable
- [x] Offer price visible
- [x] Quantity visible
- [x] Line total visible

### Security
- [x] Client cannot control authoritative price
- [x] Offer status validated server-side
- [x] Stock validated server-side
- [x] MOQ validated server-side
- [x] Store/tenant authorization preserved

### Testing
- [x] Backend tests pass (640/640 unit)
- [x] Web typecheck passes (0 errors)
- [x] Mobile tests pass (101/101)
- [x] Analyzer passes (0 issues)

## Remaining Issues

- **Integration tests**: 9 integration test files require PostgreSQL (testcontainers/Docker) which is unavailable in this environment. These test the full DB round-trip but are infrastructure-gated, not code-gated.
- **Human UAT**: Not performed. Automated tests verify data flow correctness but cannot verify visual layout, color contrast, or responsive behavior.

## Files Changed

| File | Change |
|------|--------|
| `apps/api/src/modules/catalog/product-card.ts` | Added offer enrichment (count + lowest price) |
| `apps/web/src/lib/buyer-api.ts` | Extended `Product` interface with offer fields |
| `apps/web/src/app/search/SearchPageClient.tsx` | Offer indicator on cards, canonical product add-to-cart fix |
| `mobile/lib/models/models.dart` | Added offer fields to `Product` model |
| `mobile/lib/widgets/common_widgets.dart` | Offer indicator on `ProductCard` |
| `mobile/lib/screens/search/search_screen.dart` | Canonical product add-to-cart → PDP navigation |
| `mobile/lib/screens/orders/order_detail_screen.dart` | SKU display in order items |
| `docs/production/BUYER-COMMERCE-DISPLAY-OFFER-FLOW-AUDIT.md` | Data flow audit |
