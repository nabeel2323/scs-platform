# Buyer Commerce Display & Offer Flow Audit

## Executive Summary

Investigation of the complete buyer flow (Search → PDP → Offer Selection → Cart → Checkout → Order) across `apps/api/`, `apps/web/`, and `mobile/`.

**Finding:** The core cart/order/offer plumbing is already well-implemented (Phase 10–14). Cart items carry `offerId`, prices are server-resolved through `resolveOfferPrices()`, order items snapshot offer terms, and both web and mobile cart pages display merchant name, offer status, lead time, and MOQ.

**Primary gap:** Search results lack offer visibility — buyers cannot see which products have active merchant offers, how many offers exist, or what the lowest offer price is. This means the buyer cannot make an informed decision before navigating to the PDP.

---

## Data Flow — Stage by Stage

### 1. Search

| Aspect | Current State | Gap |
|--------|--------------|-----|
| API endpoint | `GET /search` → `SearchService.search()` | No offer enrichment |
| Card enrichment | `enrichProductCards()` in `product-card.ts` | Returns `priceFromMinor` (cheapest variant price from product store), `stockStatus`, `imageUrl`, `store`. **Missing:** `activeOfferCount`, `lowestOfferPriceMinor`, `lowestOfferCurrency` |
| Web search cards | `SearchPageClient.tsx` | Shows product price, store name, MOQ. **No offer count/indicator** |
| Mobile search cards | `ProductCard` in `common_widgets.dart` | Shows title, "from" price, store, MOQ. **No offer count/indicator** |
| Web add-to-cart from search | `handleAddToCart()` fetches first active variant, calls `addToCart({ variantId, storeId, quantity })` | **No offerId** — adds without offer selection. For canonical products (no storeId), this will fail with "requires a seller selection" |
| Mobile add-to-cart from search | `_addToCart()` calls `apiService.addProductToCart(p)` | Same issue — no offer selection |

### 2. Product Detail Page (PDP)

| Aspect | Current State | Gap |
|--------|--------------|-----|
| Web PDP | `ProductDetailClient.tsx` | ✅ Has `OfferComparisonTable` with offer selection, add-to-cart with offerId |
| Mobile PDP | Product detail screen | ✅ Has offer selection via `MerchantOffersScreen` |
| Offer display | Both platforms | ✅ Merchant name, price, MOQ, lead time, verified badge all shown |

### 3. Add to Cart

| Aspect | Current State | Gap |
|--------|--------------|-----|
| Web PDP → Cart | `handleAdd(variantId, storeId, offerId?)` | ✅ Sends offerId. Button shows "✓ Added" feedback for 2s |
| Mobile PDP → Cart | Via `MerchantOffersScreen` | ✅ Sends offerId. SnackBar feedback |
| Web search → Cart | `handleAddToCart(product)` | ❌ No offer selection. Will fail for canonical products |
| Mobile search → Cart | `_addToCart(product)` | ❌ No offer selection |
| Duplicate protection | Web: `addedId` state, Mobile: async/await | ✅ Both prevent double-tap |

### 4. Cart

| Aspect | Current State | Gap |
|--------|--------------|-----|
| Backend | `cart.service.ts` `listCartItems()` | ✅ Joins variants, products, stores, merchantOffers. Returns title, sku, storeName, offer metadata |
| Web display | `cart/page.tsx` | ✅ Shows title, SKU, price × qty, line total, store name, offer status/lead/MOQ |
| Mobile display | `cart_screen.dart` | ✅ Shows title, price, offer status/lead/MOQ, qty stepper, line total |
| Cart merging | Keyed by `(cartId, variantId, offerId)` | ✅ Different offers = different lines |
| Pricing | Server-side `resolveOfferPrices()` | ✅ Client never controls price |
| MOQ enforcement | `QuantityStepper` (mobile), `min={product.moq}` (web) | ✅ Mobile uses offer MOQ as floor |

### 5. Checkout → Order

| Aspect | Current State | Gap |
|--------|--------------|-----|
| Order item schema | `orders.schema.ts` `orderItems` | ✅ Has `offerId`, `offerSnapshot` (immutable capture of offer terms) |
| Order item display (web) | `orders/[id]/page.tsx` | ✅ Shows title, SKU, qty, line total, offer status/lead/MOQ |
| Order item display (mobile) | `order_detail_screen.dart` | ⚠️ Shows title, qty × unit price, line total. **Missing: SKU display** |

### 6. Variant / Attribute Display

| Aspect | Current State | Gap |
|--------|--------------|-----|
| Raw JSON attributes | `products.attributes` (JSONB) exists in DB | ✅ **Not rendered in buyer-facing UI.** Web PDP uses `product.attributeValues` (typed, resolved labels). Cart/order use projected `title` (variant title or product title) |
| SKU | `productVariants.sku` (real column) | ✅ Used everywhere — cart, order detail, PDP. No JSON-derived SKU found |
| Attribute resolution | `productAttributeValues` typed table | ✅ Web PDP shows `av.label: av.value` (resolved through `AttributeDefinition`) |

---

## Root Causes

1. **Search enrichment missing offer data**: `enrichProductCards()` resolves variant pricing through the product's store but does not query `merchantOffers` for competing offers from other merchants. The `priceFromMinor` it returns is the product-owner's store price, not necessarily the lowest offer price.

2. **Search add-to-cart bypasses offer selection**: Both web and mobile search pages add to cart without an offerId. For products with `storeId = null` (canonical products post-migration 0025), this fails because the backend requires a seller selection.

3. **Mobile order detail omits SKU**: The mobile `OrderItem` model parses `sku` from JSON but the `order_detail_screen.dart` does not display it.

---

## Required Changes

### Backend (Priority: HIGH)
- Extend `enrichProductCards()` to query `merchantOffers` for active offer count and lowest offer price per product
- Add `activeOfferCount`, `lowestOfferPriceMinor`, `lowestOfferCurrency` to `CardEnrichment`

### Web Search (Priority: HIGH)
- Show offer indicator on product cards (e.g., "3 offers · From SAR 2,499")
- Fix add-to-cart from search: navigate to PDP for products without storeId, or show offer selection inline

### Mobile Search (Priority: HIGH)
- Add offer count indicator to `ProductCard`
- Fix add-to-cart from search: same as web

### Mobile Order Detail (Priority: MEDIUM)
- Add SKU display to order item rendering

### Tests
- Backend: search enrichment with offers
- Web: offer indicator rendering
- Mobile: offer indicator, SKU display in orders
