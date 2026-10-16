# SCS Platform — M6.1 Web & Mobile UAT Audit

**Date:** 2026-09-27  
**Commit:** 86c85df (develop)  
**Auditor:** Automated + Code Inspection  

---

## 1. Environment

| Component | Version | Status |
|-----------|---------|--------|
| Node.js | v26.4.0 | Running |
| pnpm | 9.15.9 | OK |
| Flutter | 3.47.1 (stable) | OK |
| Dart | 3.13.1 | OK |
| PostgreSQL | 16 (postgis/postgis:16-3.4) | Healthy |
| Redis | 7 (healthy) | Healthy |
| MinIO | Latest | Healthy |
| API | NestJS (port 3000) | Running |
| Web | Next.js 14.2.35 (port 3100) | Running |
| Admin | Next.js 14.2.35 (port 3200) | Running |

---

## 2. Web Buyer Flow

### 2.1 Search (`/search`)
- **Status:** CONNECTED TO API
- **API:** `GET /v1/search`
- **Implementation:** `SearchPageClient.tsx` (744 lines)
- **Features:** Full-text search, category/brand/attribute facet filters, pagination (load more), product cards with store name, price, currency, offer count, availability
- **Offer enrichment:** `activeOfferCount`, `lowestOfferPriceMinor`, `lowestOfferCurrency` displayed on search cards
- **Verdict:** PASS

### 2.2 Product Detail (`/products/[id]`)
- **Status:** CONNECTED TO API
- **APIs:** `GET /v1/products/:id`, `GET /v1/products/:id/offers`, `GET /v1/products/:id/offers/ranked`
- **Implementation:** `ProductDetailClient.tsx` (679 lines)
- **Features:** Image gallery with zoom, variant selector (dynamic matrix), offer comparison table (Amazon-style), per-offer Add to Cart, MOQ display, lead time, popularity ranking, JSON-LD structured data
- **Offer selection:** Each offer has distinct `offerId`; selecting different offers sends different `offerId` to cart API
- **Verdict:** PASS

### 2.3 Cart (`/cart`)
- **Status:** CONNECTED TO API
- **APIs:** `GET /v1/cart`, `PATCH /v1/cart/items/:id`, `DELETE /v1/cart/items/:id`, `DELETE /v1/cart`, `POST /v1/cart/promo`, `POST /v1/cart/validate`
- **Implementation:** `cart/page.tsx` (229 lines)
- **Features:** Grouped by supplier, per-line offer attribution (store name, offer status, lead time, MOQ), quantity adjustment, promo code, validation report (stale/repriced items), mixed-currency totals
- **Multi-merchant:** Different offers for same variant appear as separate lines (protected by partial unique indexes)
- **Verdict:** PASS

### 2.4 Checkout (`/checkout`)
- **Status:** CONNECTED TO API
- **API:** `POST /v1/checkout`
- **Implementation:** `checkout/page.tsx` (176 lines)
- **Features:** Delivery address, city, fulfillment method selector, notes, idempotency key generation, per-supplier subtotals, mixed-currency display, payment disclaimer ("invoiced on delivery — pilot")
- **Multi-merchant:** Creates master order with sub-orders per merchant
- **Verdict:** PASS

### 2.5 Order Detail (`/orders/[id]`)
- **Status:** CONNECTED TO API
- **APIs:** `GET /v1/orders/:id`, `GET /v1/orders/:id/history`
- **Implementation:** `orders/[id]/page.tsx` (448 lines)
- **Features:** Sub-order detail with merchant attribution, SKU, variant, quantity, price, currency, offer snapshot, financial breakdown, status timeline, cancel/reorder/dispute actions, real-time WebSocket updates
- **Snapshot immutability:** Historical orders display snapshotted offer data, not live offer
- **Verdict:** PASS

---

## 3. Web Merchant Flow

### 3.1 Merchant Offers (`/merchant/offers`)
- **Status:** CONNECTED TO API
- **APIs:** `GET /v1/merchant/offers`, `POST /v1/merchant/offers`, `POST /v1/merchant/offers/:id/propose`, `POST /v1/merchant/offers/:id/withdraw`
- **Implementation:** `merchant/offers/page.tsx` (484 lines)
- **Features:** Store selector, offer list with status badges, create offer form (product, variant, price, currency, MOQ, lead time), propose/withdraw lifecycle, offer analytics, trend charts
- **Verdict:** PASS (API verified by M6 regression)

### 3.2 Merchant Inventory (`/merchant/inventory`)
- **Status:** CONNECTED TO API
- **APIs:** `GET /v1/stores/:storeId/inventory`, `POST /v1/inventory`, `POST /v1/inventory/adjust`, `POST /v1/inventory/transfer`, `POST /v1/inventory/bulk-adjust`, `GET /v1/stores/:storeId/inventory/export`
- **Implementation:** `merchant/inventory/page.tsx` (827 lines)
- **Features:** Warehouse/variant/all view modes, per-row stock adjustment, movement history, create inventory item, CSV export, low-stock check, variant searchable dropdown
- **Verdict:** PASS (API verified by M6 regression + IDOR fix)

### 3.3 Merchant Pricing (`/merchant/pricing`)
- **Status:** CONNECTED TO API
- **APIs:** `GET /v1/stores/:storeId/price-lists`, `POST /v1/price-lists`, `GET /v1/price-lists/:id/tiers`, `POST /v1/price-lists/:id/tiers`, `PATCH /v1/tiers/:id`, `DELETE /v1/tiers/:id`
- **Implementation:** `merchant/pricing/page.tsx` (496 lines)
- **Features:** Price list management, tier ladder editor, variant selection, currency per price list
- **Verdict:** PASS (API verified)

### 3.4 Merchant Orders (`/merchant/orders`)
- **Status:** CONNECTED TO API
- **APIs:** `GET /v1/orders`, `POST /v1/orders/:id/accept`, `POST /v1/orders/:id/reject`, `POST /v1/orders/:id/partial-accept`
- **Implementation:** `merchant/orders/page.tsx` (555 lines) + `merchant/orders/[id]/page.tsx` (412 lines)
- **Features:** Order list with status filters, accept/reject/partial-accept with inventory reservation, optimistic locking for concurrent acceptance
- **Verdict:** PASS (API verified by Phase 2 multi-merchant tests)

---

## 4. Mobile Buyer Flow

### 4.1 Search (`/search`)
- **Status:** CONNECTED TO API
- **API:** `GET /v1/search`
- **Implementation:** `search_screen.dart` (531 lines)
- **Features:** Debounced search, category/brand/attribute facet filters, pagination (load more), product cards
- **Verdict:** PASS (code verified, `dart analyze` clean, 104 tests pass)

### 4.2 Product Detail (`/product/:id`)
- **Status:** CONNECTED TO API
- **APIs:** `GET /v1/products/:id`, `GET /v1/products/:id/offers`, `GET /v1/products/:id/offers/ranked`, `GET /v1/products/:id/variant-matrix`
- **Implementation:** `product_detail_screen.dart` (938 lines)
- **Features:** Variant matrix selector, offer comparison with sort, image gallery with PageView + InteractiveViewer zoom, per-offer Add to Cart, specifications
- **Verdict:** PASS

### 4.3 Cart (`/cart`)
- **Status:** CONNECTED TO API
- **APIs:** `GET /v1/cart`, `PATCH /v1/cart/items/:id`, `DELETE /v1/cart/items/:id`, `POST /v1/cart/promo`
- **Implementation:** `cart_screen.dart` (371 lines)
- **Features:** Quantity stepper with MOQ floor, supplier grouping, offer attribution, promo code, validation
- **Verdict:** PASS

### 4.4 Checkout (`/checkout`)
- **Status:** CONNECTED TO API
- **API:** `POST /v1/checkout`
- **Implementation:** `checkout_screen.dart` (496 lines)
- **Features:** Stepped flow (Address → Fulfillment → Review → Confirmation), idempotency key, per-supplier subtotals
- **Verdict:** PASS

### 4.5 Order Detail (`/orders/:id`)
- **Status:** CONNECTED TO API
- **APIs:** `GET /v1/orders/:id`, `GET /v1/orders/:id/history`
- **Implementation:** `order_detail_screen.dart` (448 lines)
- **Features:** Vertical timeline, financial breakdown, cancel guard, status badges
- **Verdict:** PASS

---

## 5. Mobile Merchant Flow

### 5.1 Merchant Dashboard (`/merchant`)
- **Status:** CONNECTED TO API
- **Implementation:** `merchant_shell_screen.dart` (114 lines) + `merchant_dashboard_screen.dart` (280 lines)
- **Features:** Tab-based navigation (Dashboard/Orders/Catalog/Inventory/Account), KPI strip from `GET /v1/merchant/offers/analytics`, low-stock from `GET /v1/inventory/low-stock`
- **Verdict:** PASS

### 5.2 Merchant Offers (`/merchant/offers`)
- **Status:** CONNECTED TO API
- **Implementation:** `merchant_offers_screen.dart` (407 lines), `offer_create_screen.dart` (793 lines), `offer_detail_screen.dart` (769 lines)
- **Features:** Offer list, create/edit, lifecycle transitions, pricing
- **Verdict:** PASS

### 5.3 Merchant Inventory (`/merchant/inventory`)
- **Status:** CONNECTED TO API
- **Implementation:** `inventory_screen.dart` (494 lines)
- **Features:** Inventory list, stock adjustment, transfer
- **Verdict:** PASS

---

## 6. Authentication

| Client | Method | Status |
|--------|--------|--------|
| Web | Email/password + OTP challenge | PASS (OTP via Redis, 90s TTL) |
| Admin | Email/password + OTP challenge | PASS |
| Mobile | Email/password + OTP challenge | PASS |
| API | `/v1/auth/login/password` → access token or OTP | PASS |

**Note:** OTP is stored in Redis (`otp:{phone}`) and not displayed in the UI. This is by design for security. In dev/test, OTP can be retrieved from Redis or server console.

---

## 7. Authorization

| Guard | Implementation | Verified |
|-------|---------------|----------|
| JWT auth | `JwtAuthGuard` on all protected routes | PASS |
| Permission | `PermissionsGuard` + `@RequirePermission()` | PASS |
| Roles | `RolesGuard` + `@Roles()` | PASS |
| Tenant scope | `assertStoreInOrg()` on store-scoped endpoints | PASS (M6 BUG-M6-002 fix) |
| Route protection | Mobile `router.dart` redirect for merchant routes | PASS |

---

## 8. Error/Loading/Empty States

| State | Web | Mobile |
|-------|-----|--------|
| Loading | `LoadingSpinner` component | `AppSkeletonProductCard`, `CircularProgressIndicator` |
| Empty | `EmptyState` component | `EmptyState` widget |
| Error | `ErrorBanner` component | `SnackBar` with `ApiService.errorMessage(e)` |
| Auth redirect | `AuthProvider` + route guards | `sessionRestorationProvider` + redirect |

---

## 9. Currency Handling

- **Web cart:** Mixed-currency detection → per-supplier subtotals displayed in each supplier's currency
- **Web checkout:** Per-supplier grouping with currency labels
- **Mobile cart:** Same grouping logic via `CartItem.currency`
- **Search results:** `lowestOfferCurrency` displayed alongside `lowestOfferPriceMinor`
- **PDP:** Base currency from first active variant's pricing or store currency
- **Verdict:** PASS — currencies are never silently mixed

---

## 10. MOQ Enforcement

- **Web PDP:** MOQ displayed, quantity stepper respects floor
- **Web cart:** MOQ shown per line, quantity stepper with MOQ floor
- **Mobile cart:** `QuantityStepper` with `_floorFor(item)` from `item.offer.moq`
- **API:** Checkout rejects below-MOQ quantities (M6-7-2 verified)
- **Verdict:** PASS

---

## 11. Offer Identity

- **Web PDP:** Each offer shows supplier name, price, MOQ, lead time, popularity rank; distinct "Add to Cart" per offer
- **Mobile PDP:** Offer comparison section with sort by price/popularity; distinct add per offer
- **Cart:** Each line shows `offer.status`, `offer.leadTimeDays`, `offer.moq`
- **Order:** `offerSnapshot` JSONB preserved on `orderItems` — never updated after creation
- **Verdict:** PASS

---

## 12. Multi-Merchant Behavior

- **Web cart:** Items grouped by `storeId`; different offers for same variant = separate lines
- **Web checkout:** Master order with sub-orders per merchant; per-supplier subtotals
- **Mobile cart:** Same grouping logic
- **DB constraint:** Partial unique indexes ensure `(cart_id, variant_id, offer_id)` uniqueness
- **Verdict:** PASS

---

## Summary

| Area | Web | Mobile | API |
|------|-----|--------|-----|
| Buyer search | PASS | PASS | PASS |
| Product detail | PASS | PASS | PASS |
| Offer selection | PASS | PASS | PASS |
| Add to cart | PASS | PASS | PASS |
| Cart | PASS | PASS | PASS |
| Checkout | PASS | PASS | PASS |
| Order detail | PASS | PASS | PASS |
| Merchant offers | PASS | PASS | PASS |
| Merchant inventory | PASS | PASS | PASS |
| Merchant pricing | PASS | N/A | PASS |
| Merchant orders | PASS | PASS | PASS |
| Auth | PASS | PASS | PASS |
| Authz/IDOR | PASS | PASS | PASS |

**All screens are connected to the real API. No mocked data detected.**
