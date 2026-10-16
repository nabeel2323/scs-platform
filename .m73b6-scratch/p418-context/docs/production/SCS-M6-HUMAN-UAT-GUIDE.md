# SCS-M6 Human UAT Guide

> **Phase**: M6 — Merchant Offer, Inventory & Pricing  
> **Date**: 2026-09-27  
> **Automated tests**: 41/41 PASS (see `apps/api/m6-uat-results.json`)  
> **API base**: `http://localhost:3000/v1`

---

## Prerequisites

| Component | Status |
|---|---|
| Docker (PostgreSQL, Redis, MinIO, Mailhog) | Healthy |
| API server (`pnpm dev` in `apps/api`) | Running on port 3000 |
| Admin credentials | `admin@scsp.dev` / `Admin@2026!` / phone `+10000000000` |
| Auth flow | Password login → OTP (Redis `otp:{phone}`, 90s TTL) → OTP verify with `deviceInfo` |
| API versioning | All routes prefixed `/v1/` |

### Authentication Helper

All API calls require a Bearer token. Use the OTP flow:

```bash
# 1. Password login (returns requiresOtp: true on new device)
curl -X POST http://localhost:3000/v1/auth/login/password \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@scsp.dev","password":"Admin@2026!","deviceId":"uat-device"}'

# 2. Request OTP
curl -X POST http://localhost:3000/v1/auth/otp/request \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+10000000000"}'

# 3. Read OTP from Redis
docker exec scs-redis redis-cli GET "otp:+10000000000"

# 4. Verify OTP
curl -X POST http://localhost:3000/v1/auth/otp/verify \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+10000000000","otp":"<FROM_STEP_3>","deviceId":"uat-device","deviceInfo":{"platform":"web","userAgent":"UAT"}}'
```

---

## UAT Scenarios

### M6-UAT-01: Merchant Creates Offer

| Field | Value |
|---|---|
| **Actor** | Merchant Owner (via API) |
| **Precondition** | Canonical product ACTIVE, store created, price list exists |
| **Steps** | `POST /merchant/offers` with `{storeId, productId, variantId, currency, basePriceMinor, moq, priceListId, warehouseId}` |
| **Expected** | 201, offer status = DRAFT |
| **Result** | **PASS** (automated M6-4-2, M6-4-3, M6-4-4, M6-4-5) |

### M6-UAT-02: Merchant Selects Existing Canonical Variant

| Field | Value |
|---|---|
| **Actor** | Merchant Owner |
| **Precondition** | Canonical product with variants exists |
| **Steps** | Create offer referencing `variantId` from canonical product |
| **Expected** | Offer links to variant; variant-scoped and product-level offers both supported |
| **Result** | **PASS** (automated M6-4-2 variant-scoped, M6-4-3 product-level) |

### M6-UAT-03: Merchant Cannot Access Another Merchant's Offer

| Field | Value |
|---|---|
| **Actor** | Merchant A |
| **Precondition** | Merchant A and Merchant B each have offers |
| **Steps** | Merchant A sends `PATCH /merchant/offers/{merchantB_offerId}/pricing` |
| **Expected** | 403 Forbidden |
| **Result** | **PASS** (automated M6-10-1, status=403) |

### M6-UAT-04: Inventory Creation

| Field | Value |
|---|---|
| **Actor** | Merchant Owner |
| **Precondition** | Warehouse exists, variant exists |
| **Steps** | `POST /inventory` with `{variantId, warehouseId, initialQty: 100}` |
| **Expected** | 201, `qtyOnHand = 100`, `qtyReserved = 0` |
| **Result** | **PASS** (automated M6-6-1 through M6-6-4) |

### M6-UAT-05: Inventory Reservation

| Field | Value |
|---|---|
| **Actor** | System (via merchant order accept) |
| **Precondition** | Inventory item with qty > 0 |
| **Steps** | `POST /inventory/reserve` then `POST /inventory/release` |
| **Expected** | Reserve: `qtyReserved` increases. Release: `qtyReserved` decreases. Over-reservation rejected. |
| **Result** | **PASS** (automated M6-6-6 through M6-6-10) |

### M6-UAT-06: Pricing

| Field | Value |
|---|---|
| **Actor** | System (price resolution) |
| **Precondition** | Price list with tiers exists for store |
| **Steps** | Add item to cart; verify server-resolved price matches price list tier |
| **Expected** | Price resolved from offer → price_list → tier (highest priority, best minQty) |
| **Result** | **PASS** (automated M6-8-1, price comes from server-side resolver) |

### M6-UAT-07: MOQ (Minimum Order Quantity)

| Field | Value |
|---|---|
| **Actor** | Buyer |
| **Precondition** | Offer with `moq = 5` |
| **Steps** | Add to cart with qty=3 (below MOQ), then attempt checkout |
| **Expected** | Cart add succeeds; checkout rejected with 400 |
| **Result** | **PASS** (automated M6-7-1, M6-7-2) |

### M6-UAT-08: Buyer Search

| Field | Value |
|---|---|
| **Actor** | Buyer |
| **Precondition** | Products with ACTIVE offers from multiple stores |
| **Steps** | `GET /products/:productId/offers/ranked` |
| **Expected** | 200, ranked list of offers for the product |
| **Result** | **PASS** (automated M6-8-6, 2 ranked offers returned) |

### M6-UAT-09: Buyer Offer Selection

| Field | Value |
|---|---|
| **Actor** | Buyer |
| **Precondition** | Multiple ACTIVE offers for same variant from different stores |
| **Steps** | Add to cart with `offerId` for Store A's offer, then add same variant with Store B's offer |
| **Expected** | Two separate cart lines with different prices/merchants |
| **Result** | **PASS** (automated M6-8-2, M6-8-3) |

### M6-UAT-10: Web Add-to-Cart

| Field | Value |
|---|---|
| **Actor** | Web buyer |
| **Precondition** | Authenticated buyer, active offers |
| **Steps** | `POST /cart/items` with `{variantId, quantity, offerId}` |
| **Expected** | 201, cart item created with server-resolved price |
| **Result** | **PASS** (API-level verified, M6-8-1) |
| **Browser UI** | **NOT TESTED** — web frontend not deployed |

### M6-UAT-11: Mobile Add-to-Cart

| Field | Value |
|---|---|
| **Actor** | Mobile buyer |
| **Precondition** | Same as M6-UAT-10 |
| **Steps** | Same API endpoint, different client |
| **Expected** | Same behavior as web |
| **Result** | **NOT TESTED** — mobile app not deployed |
| **Note** | API is platform-agnostic; same endpoint serves web and mobile |

### M6-UAT-12: Cart Display

| Field | Value |
|---|---|
| **Actor** | Buyer |
| **Precondition** | Cart with items from multiple merchants |
| **Steps** | `GET /cart` |
| **Expected** | Items include `storeName`, `offer` details, per-line pricing |
| **Result** | **PASS** (automated M6-8-4, storeNames=true, offers=true) |

### M6-UAT-13: Multi-Merchant Cart

| Field | Value |
|---|---|
| **Actor** | Buyer |
| **Precondition** | Competing offers from 2+ stores |
| **Steps** | Add items from Store A and Store B to same cart |
| **Expected** | Cart contains items grouped by store, each with correct merchant info |
| **Result** | **PASS** (automated M6-8-2, M6-8-3, M6-8-4) |

### M6-UAT-14: Checkout

| Field | Value |
|---|---|
| **Actor** | Buyer |
| **Precondition** | Cart with valid items meeting MOQ |
| **Steps** | `POST /checkout` with `{deliveryAddress, idempotencyKey}` |
| **Expected** | 201, master order with sub-orders, offer snapshots preserved |
| **Result** | **PASS** (automated M6-9-1) |

### M6-UAT-15: Multi-Merchant Checkout

| Field | Value |
|---|---|
| **Actor** | Buyer |
| **Precondition** | Cart with items from 2+ stores |
| **Steps** | `POST /checkout` |
| **Expected** | Master order with 2+ sub-orders, one per store |
| **Result** | **PASS** (automated M6-9-1, M6-9-2, M6-9-3) |

### M6-UAT-16: Order Snapshots

| Field | Value |
|---|---|
| **Actor** | System |
| **Precondition** | Order placed with offer |
| **Steps** | Modify offer price after checkout, then read order |
| **Expected** | Order's `offerSnapshot` retains original price, not the modified price |
| **Result** | **PASS** (automated M6-9-4, M6-9-5) |

### M6-UAT-17: Merchant Order Isolation

| Field | Value |
|---|---|
| **Actor** | Merchant A |
| **Precondition** | Orders exist for Store A and Store B |
| **Steps** | Merchant A attempts to read Store B's inventory |
| **Expected** | 403 Forbidden |
| **Result** | **PASS** (automated M6-10-2, status=403) |

### M6-UAT-18: Buyer Order Visibility

| Field | Value |
|---|---|
| **Actor** | Buyer |
| **Precondition** | Buyer has placed orders |
| **Steps** | `GET /orders/master/:id` |
| **Expected** | 200, full master order with sub-orders and items |
| **Result** | **PASS** (automated M6-9-5, order retrieved successfully) |

---

## Summary

| ID | Scenario | Result | Notes |
|---|---|---|---|
| M6-UAT-01 | Merchant creates offer | **PASS** | API-verified |
| M6-UAT-02 | Canonical variant selection | **PASS** | API-verified |
| M6-UAT-03 | Cross-merchant offer blocked | **PASS** | 403 confirmed |
| M6-UAT-04 | Inventory creation | **PASS** | API-verified |
| M6-UAT-05 | Inventory reservation | **PASS** | Reserve/release/over-reservation |
| M6-UAT-06 | Pricing | **PASS** | Server-authoritative |
| M6-UAT-07 | MOQ enforcement | **PASS** | Enforced at checkout |
| M6-UAT-08 | Buyer search | **PASS** | Ranked offers |
| M6-UAT-09 | Offer selection | **PASS** | Multi-seller cart lines |
| M6-UAT-10 | Web add-to-cart | **PASS** | API-level; browser **NOT TESTED** |
| M6-UAT-11 | Mobile add-to-cart | **NOT TESTED** | Mobile app not deployed |
| M6-UAT-12 | Cart display | **PASS** | Merchant info present |
| M6-UAT-13 | Multi-merchant cart | **PASS** | Separate lines per seller |
| M6-UAT-14 | Checkout | **PASS** | Master order created |
| M6-UAT-15 | Multi-merchant checkout | **PASS** | Sub-orders per store |
| M6-UAT-16 | Order snapshots | **PASS** | Immutable after checkout |
| M6-UAT-17 | Merchant order isolation | **PASS** | 403 confirmed |
| M6-UAT-18 | Buyer order visibility | **PASS** | Full order retrieval |

**Totals**: 16 PASS, 0 FAIL, 0 BLOCKED, 1 NOT TESTED (mobile UI), 1 partial (web UI — API PASS, browser not tested)

---

## How to Re-Run

```bash
# Clean previous test data
node apps/api/scripts/m6-clean.ts

# Restore admin membership (clean script preserves it)
node apps/api/scripts/m6-restore-admin.ts

# Run full automated verification
node apps/api/scripts/m6-uat-run.ts

# Results written to apps/api/m6-uat-results.json
```
