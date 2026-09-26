# SCS Variant Identity, Product Management, Pricing & Currency Audit

## Executive Summary

Full investigation of the SCS Platform's variant identity, product management, pricing, and currency flows across `apps/api/`, `apps/web/`, `mobile/`, and `packages/`. The canonical architecture (Category → Product Type → Canonical Product → Variant → Merchant Offer → Merchant) is correctly represented in the database schema and the core cart/order plumbing. However, **the Product Studio wizard generates corrupted SKUs** by serializing variant attribute JSON into the SKU string, and the merchant workflow forces product recreation instead of selecting existing canonical products.

**Critical findings:**
1. **SKU BUG (CRITICAL)**: `useProductStudio.ts` line 163 generates `SKU: "${slug}-${JSON.stringify([{attrId, value}])}"` — the exact `SKU-[{"attrId"...}]` anti-pattern
2. **Variant title BUG**: Same line sets `title: comboKey` (JSON string) instead of a human-readable title
3. **No existing product search in Studio**: Merchants can only search by GTIN/EAN/MPN, not by free text across the canonical catalog
4. **No variant selector in Studio**: Shows a combination matrix for new variant creation, not existing variant selection
5. **No currency registry**: Currency is `char(3)` with hardcoded dropdown options; no central table
6. **Cross-currency comparison risk**: Offer enrichment compares `basePriceMinor` across offers without checking currency

---

## A. Variant Identity

### Schema (CORRECT)

| Column | Type | Notes |
|--------|------|-------|
| `productVariants.id` | `uuid PK` | App-generated UUIDv7 |
| `productVariants.sku` | `varchar(100) NOT NULL` | Real persistent column |
| `productVariants.title` | `varchar(300)` | Human-readable name |
| `productVariants.combinationKey` | `varchar(255)` | Typed attribute digest, partial unique index |
| `productVariants.attributes` | `jsonb` | Legacy JSONB — superseded by typed values |

**SKU uniqueness**: Partial unique index `product_variants_sku_idx ON (sku) WHERE sku IS NOT NULL` — globally unique.

### Current SKU Source by Location

| Location | Current SKU Source | Correct? | Issue |
|----------|-------------------|----------|-------|
| Web PDP (`ProductDetailClient.tsx`) | `v.sku` from API | YES | Renders `SKU: {v.sku}` |
| Web Cart (`cart/page.tsx`) | `item.sku` from cart API | YES | Projected from variant join |
| Web Orders (`orders/[id]/page.tsx`) | `item.sku` from order API | YES | Projected from order_items |
| Web Search cards | No SKU shown | OK | Cards show title + price |
| Web Merchant catalog | No SKU column | GAP | Should show variant count + SKU |
| Web Merchant Product Studio | `"${slug}-${comboKey}"` | **NO — CRITICAL BUG** | comboKey = JSON.stringify of attributes |
| Web Merchant Offers | No SKU shown | GAP | Should show variant SKU |
| Mobile PDP | `v.sku` from API | YES | Renders SKU line |
| Mobile Cart | `item.sku` | YES | From cart API |
| Mobile Orders | `item.sku` | YES | From order API |
| Mobile Offer create | `v.sku` in variant list | YES | Shows `SKU: ${v.sku}` |
| Mobile Product edit | No variant SKU | GAP | Edit screen has no variant section |
| Excel import | User-provided `sku` column | YES | Not generated, taken from spreadsheet |
| API DTOs | `productVariants.sku` | YES | Direct projection |
| DB projections | `productVariants.sku` | YES | Direct column read |

### Current Title Source by Location

| Location | Current Title Source | Correct? | Issue |
|----------|---------------------|----------|-------|
| Web PDP | `v.title \|\| v.sku` | YES | Falls back to SKU |
| Web Cart | `item.title` | YES | From variant/product join |
| Web Orders | `item.title` | YES | From order_items snapshot |
| Web Product Studio | `comboKey` (JSON string) | **NO — BUG** | Sets variant title to JSON |
| Mobile PDP | `v.title` | YES | |
| Mobile Offer create | `v.title ?? v.sku` | YES | |

### Current Attributes Source

| Location | Source | Correct? |
|----------|--------|----------|
| Web PDP specs | `productAttributeValues` JOIN `attributeDefinitions` → `{code, label, value}` | YES — typed, resolved |
| Web PDP variant matrix | `getVariantMatrix()` → dimensions + combinations from typed attrs | YES |
| Web Cart | No attributes shown (correct) | OK |
| Mobile PDP | `attributeValues` from API | YES |
| Product Studio variant creation | `JSON.parse(comboKey)` → `[{attrId, value}]` | **NO — raw attrId refs** |

---

## B. Product Management

### Current Capabilities

| Capability | Web | Mobile | Issue |
|------------|-----|--------|-------|
| Search existing products (own store) | YES — `fetchStoreProducts` with search param | YES — `storeProductsProvider` | Only searches merchant's own products |
| Search canonical catalog | PARTIAL — GTIN/EAN/MPN only via `searchCanonicalProducts` | NO | No free-text canonical search |
| Select existing product | YES — `handleUseExisting()` in StepIdentity | NO | Only via identifier match |
| Select existing variant | NO | NO | Studio shows combination matrix, not existing variants |
| Create offer against existing variant | YES (via offers page) | YES (via offer create screen) | But requires knowing the variant ID |
| Accidentally duplicate canonical product | POSSIBLE | POSSIBLE | No duplicate check before create |
| Distinguish canonical from offer | PARTIAL — StepOffer says "merchant offer" | PARTIAL | Terminology not consistent |

### Merchant Workflow Analysis

**Current Product Studio flow:**
```
1. Identity (store, category, brand, product type, GTIN search)
2. Specifications (attribute values)
3. Variants (combination matrix — creates NEW variants)
4. Offer (price, currency, MOQ, lead time)
5. Media
6. Review
```

**Problem:** Step 3 always creates NEW variants with bad SKUs. There is no "Select Existing Variant" step.

**Current Offers page flow:**
```
1. Select product (from own store products)
2. Select variant (optional, from product's variants)
3. Set pricing
4. Set terms
5. Review
```

**Problem:** Only searches the merchant's own products. Cannot search the canonical catalog.

### Mobile Offer Create Flow

```
1. Product selection (from storeProductsProvider — own store only)
2. Variant selection (optional, from productVariantsProvider)
3. Pricing (price, compare-at price, currency)
4. Terms (MOQ, lead time)
5. Review
```

**Same problem:** Only merchant's own products visible.

---

## C. Pricing Architecture

### Schema

```
price_lists
  ├── id (uuid PK)
  ├── store_id (uuid FK → stores)
  ├── name, currency (char(3) DEFAULT 'SAR')
  ├── channel ('B2B'), audience ('PUBLIC' | 'SEGMENT' | 'CONTRACT')
  ├── priority, is_active, valid_from, valid_until
  └── price_tiers
       ├── id (uuid PK)
       ├── price_list_id (uuid FK → price_lists)
       ├── variant_id (uuid FK → product_variants)
       ├── min_qty, max_qty (null = unlimited)
       └── unit_price_minor (bigint — minor units)

merchant_offers
  ├── id (uuid PK)
  ├── store_id, product_id, variant_id (nullable)
  ├── status (DRAFT → PROPOSED → ACTIVE → SUSPENDED)
  ├── currency (char(3) DEFAULT 'SAR')
  ├── base_price_minor, compare_at_price_minor
  ├── moq, lead_time_days
  ├── price_list_id (FK → price_lists — "by reference")
  └── warehouse_id (FK → warehouses — "by reference")
```

### Price Resolution Flow

```
resolveOfferPrices(db, storeId, variantIds, qty)
  1. Fetch variants → product_ids
  2. Fetch ACTIVE offers for (store, variants/products)
  3. Prefer variant-level offer over product-level
  4. For offers with price_list_id → resolve via that list's tiers
  5. For offers without → fall back to legacy resolveVariantPrices
```

### Pricing Issues

| Issue | Severity | Location |
|-------|----------|----------|
| Product Studio asks price in minor units | UX | `StepOffer.tsx` — confusing for merchants |
| No price tier editor in Studio | GAP | Only base price, no quantity tiers |
| No price history/audit | GAP | No audit trail for price changes |
| Offer base_price_minor vs price_list tiers | CONFUSION | Two places to set price; offer references list by design |
| Currency hardcoded in dropdown | GAP | `StepOffer.tsx` and `offer_create_screen.dart` hardcode 8 currencies |

---

## D. Currency Architecture

### Current State

- **No dedicated currency table/registry**
- Currency stored as `char(3)` on `price_lists.currency` and `merchant_offers.currency`
- Default: `'SAR'` everywhere
- Web: hardcoded `<option>` list in StepOffer (8 currencies) and offers page
- Mobile: hardcoded `_currency` dropdown in offer_create_screen.dart
- Formatting: `formatMinor(amount, currency)` utility in web `Shared.tsx` and mobile `common_widgets.dart`

### Currency Concepts

| Concept | Current Representation | Issue |
|---------|----------------------|-------|
| Platform base currency | Implicit SAR | Not explicitly configured |
| Organization currency | Not represented | Orgs may want default currency |
| Store currency | `stores.currency` | Correct |
| Merchant offer currency | `merchant_offers.currency` | Correct |
| Price list currency | `price_lists.currency` | Correct |
| Buyer display currency | Uses offer/store currency | No buyer preference |
| Exchange rates | NOT IMPLEMENTED | No conversion exists |

### Cross-Currency Safety

| Location | Safe? | Issue |
|----------|-------|-------|
| `enrichProductCards()` — `lowestOfferPriceMinor` | **NO** | Compares `basePriceMinor` across offers without checking currency |
| `resolveOfferPrices()` | YES | Resolves within a single store's price lists (same currency) |
| Cart pricing | YES | Single offer per line item, price from that offer's currency |
| Order snapshot | YES | Captures offer currency at checkout time |

**CRITICAL**: The `enrichProductCards()` function (from previous session's offer enrichment) compares `basePriceMinor` values across offers to find the "lowest" without verifying they share the same currency. If Merchant A offers 3250 SAR and Merchant B offers 900 USD, the function would incorrectly report 900 as "lowest."

---

## E. Dangerous Pattern Search Results

| Pattern | Found? | Location |
|---------|--------|----------|
| `SKU-${JSON.stringify` | NO (exact pattern) | Not in codebase |
| `sku: \`${slug}-${comboKey}\`` | **YES** | `useProductStudio.ts:163` |
| `attrId.*sku` | NO | Not in codebase |
| `JSON.stringify.*attr` in UI | YES (benign) | `VariantMatrix.tsx:127` — React key, not SKU |
| Raw `attrId` in display | **YES** | `useProductStudio.ts:165` — variant `attributes: JSON.parse(comboKey)` stores raw attrIds |

---

## F. Existing API Endpoints

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /v1/products/search` | EXISTS | Buyer search with enrichment |
| `GET /v1/products/:id` | EXISTS | Product detail with variants, pricing, attributes |
| `GET /v1/products/:id/variants` | EXISTS | List variants for product |
| `GET /v1/products/:id/variant-matrix` | EXISTS | Dimension-based matrix |
| `GET /v1/products/:id/offers` | EXISTS | List offers for product |
| `GET /v1/merchant/offers` | EXISTS | Merchant's own offers |
| `POST /v1/merchant/offers` | EXISTS | Create offer |
| `GET /v1/canonical/match` | EXISTS | Find by GTIN/EAN/MPN |
| `GET /v1/stores/:storeId/products` | EXISTS | Store products with search |
| `GET /v1/stores/:storeId/price-lists` | EXISTS | Store price lists |
| `GET /v1/currencies` | **MISSING** | No currency registry endpoint |
| `GET /v1/products/search?canonical=true` | **MISSING** | No canonical catalog search for merchants |

---

## G. Summary of Gaps

### CRITICAL (Must Fix)

1. **SKU generation bug** in `useProductStudio.ts:163` — produces `SKU-[{"attrId"...}]`
2. **Variant title bug** in `useProductStudio.ts:163` — sets title to JSON string
3. **Cross-currency comparison** in `product-card.ts` — compares prices without currency check

### HIGH (Major UX Gaps)

4. **No canonical product search** for merchants — only GTIN/EAN/MPN matching
5. **No existing variant selector** — Studio creates new variants instead of selecting existing
6. **No product request workflow** — merchants cannot propose new canonical products for approval
7. **Merchant catalog doesn't show variants** — no variant table with SKU, attributes, offer status

### MEDIUM (Improvements Needed)

8. **No currency registry** — currencies hardcoded in dropdowns
9. **No price tier editor** in Product Studio — only base price
10. **Minor units confusing** for merchants — should accept major units
11. **No SKU generator utility** — reusable, deterministic, human-readable
12. **Mobile merchant catalog** — no variant management, no existing product selection for offers

### LOW (Nice to Have)

13. **No barcode/GTIN search** in merchant product selector
14. **No price history** or audit trail
15. **No bulk offer editing**
16. **No multi-currency display** on search cards
