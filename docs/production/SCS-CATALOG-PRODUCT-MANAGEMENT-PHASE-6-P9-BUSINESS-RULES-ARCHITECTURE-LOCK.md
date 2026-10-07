# SCS Catalog Product Management — Phase 6 / P9
## Business Rules & Architecture Lock

**Document:** SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-6-P9-BUSINESS-RULES-ARCHITECTURE-LOCK.md
**Date:** 2026-10-06
**Baseline:** P8 CLOSED / PASS, P9 Audit GO
**Migration Decision:** NOT REQUIRED
**Status:** LOCKED

---

## 1. Status

```
P9 BUSINESS RULES & ARCHITECTURE

Status:     LOCKED
Architecture: GO
Migration:  NOT REQUIRED (latest remains 0055)
Next Gate:  P9 IMPLEMENTATION
```

All business decisions BD-P9-01 through BD-P9-05 are resolved against repository evidence.
Every technical ambiguity is explicitly addressed.
No conditions remain.

---

## 2. Baseline

| Item | Value |
|------|-------|
| Branch | develop |
| HEAD | 8654de3 |
| Latest migration | 0055_import_chunking_inventory_integrity.sql |
| P8 status | CLOSED / PASS |
| P9 audit | GO |
| Findings addressed | F-P9-05, F-P9-14, F-P9-15, F-P9-16 |
| P0/P1 defects | 0 |
| P2 defects | 4 (all in P9 scope) |
| P3 defects | 18 (all deferred) |

---

## 3. P9 Objective

### A. Production-correct buyer search

Move currently client-side behaviors to the server:

- Price range filter (priceMin / priceMax)
- Availability filter (availability=inStock)
- Sorting (price_asc, price_desc, newest, name)

The API must perform filtering and sorting **before** pagination.

### B. Complete merchant catalog export

Upgrade CSV export so it contains:

- One row per variant (not per product)
- Typed attribute columns (`attr:<code>`)
- Data compatible with the existing P8 import format

Goal: `EXPORT → CSV → EXISTING IMPORT PIPELINE → CATALOG` without losing supported catalog information.

---

## 4. Scope

P9 includes **ONLY**:

```
F-P9-05  — Export does not include typed attributes or variant data
F-P9-14  — No server-side price range filter
F-P9-15  — No server-side availability filter
F-P9-16  — No server-side sort
```

P9 **MUST NOT** implement:

- Product publishing/moderation workflow
- Variant media UI
- Orphan media cleanup
- Manufacturer entity
- XLSX import / XLSX export
- Import preview UX
- Inventory receiving / cycle counts / inventory valuation
- Price validity periods / price history
- Promotions / discounts
- Refunds / dispute UI
- RTL layout
- Full-text relevance tuning
- New search engine / search indexing redesign
- Marketplace redesign
- New pricing model / new inventory model

---

## 5. Business Decisions

### BD-P9-01 — Price Filter Implementation

**Decision:** SQL `EXISTS` subquery against `merchant_offers` joined to `price_tiers`.

**Evidence (repository):**

- `merchant_offers` (catalog.offer.schema.ts): `base_price_minor` (bigint), `status` (ACTIVE/DRAFT/...), `store_id`, `product_id`, `variant_id`, `price_list_id`
- `price_tiers` (pricing.schema.ts): `variant_id`, `unit_price_minor`, `min_qty`, `price_list_id`
- `price_lists` (pricing.schema.ts): `store_id`, `is_active`, `channel`, `audience`

**Semantics:**

The "effective searchable offer price" for a canonical product is:

```
lowest active merchant offer base price (merchant_offers.base_price_minor)
where status = 'ACTIVE'
```

- `priceMin`: lowest active offer base price >= priceMin
- `priceMax`: lowest active offer base price <= priceMax
- Both: priceMin <= lowest active offer base price <= priceMax
- Neither: no price filtering applied

**Implementation approach:**

Do NOT denormalize price into the product search record. Use an EXISTS subquery similar to the existing attribute filter pattern already in `search.service.ts` (lines 300-319, 324-340).

The price filter subquery conceptually:

```sql
EXISTS (
  SELECT 1 FROM merchant_offers mo
  WHERE mo.product_id = p.id
    AND mo.status = 'ACTIVE'
    AND mo.base_price_minor IS NOT NULL
    AND (<priceMin condition>)
    AND (<priceMax condition>)
)
```

Do not duplicate pricing-resolution logic. The `base_price_minor` on `merchant_offers` is the authoritative base price for search filtering — not the tier price from `price_tiers`. This is consistent with how `product-card.ts` already reads `merchant_offers.base_price_minor` for card enrichment (line 280).

**Validation:**

- Numeric format only (digits, optional decimal point)
- Non-negative values
- If both provided: priceMin <= priceMax
- Invalid values → `400 Bad Request` with descriptive message
- Do not silently ignore invalid values

---

### BD-P9-02 — Price Sort Semantics

**Decision:** Sort by **lowest active merchant offer base price**.

For each canonical product, the sort value is:

```sql
MIN(mo.base_price_minor)
FROM merchant_offers mo
WHERE mo.product_id = p.id
  AND mo.status = 'ACTIVE'
  AND mo.base_price_minor IS NOT NULL
```

**Important constraints:**

- Do NOT use the merchant's tier price (`price_tiers.unit_price_minor`)
- Do NOT use cart-specific negotiated pricing
- Do NOT use client-provided price
- Do NOT use an arbitrary merchant price
- Ignore inactive offers (status != 'ACTIVE')
- Products with no active offers must be handled deterministically (see §11)

**Tie-breaker (locked):**

```
price_asc:
  PRIMARY: MIN(mo.base_price_minor) ASC NULLS LAST
  SECONDARY: p.created_at DESC
  TERTIARY:  p.id ASC

price_desc:
  PRIMARY: MIN(mo.base_price_minor) DESC NULLS LAST
  SECONDARY: p.created_at DESC
  TERTIARY:  p.id ASC
```

This ensures deterministic ordering across all databases and data distributions.

---

### BD-P9-03 — Availability Filter

**Decision:**

```
availability=inStock
```

means:

> The product has at least one ACTIVE merchant offer whose associated warehouse inventory has `qty_on_hand > 0`.

**SQL semantics:**

```sql
EXISTS (
  SELECT 1
  FROM merchant_offers mo
  JOIN warehouses w ON w.store_id = mo.store_id
  JOIN inventory_items ii ON ii.warehouse_id = w.id
    AND (ii.variant_id = mo.variant_id OR mo.variant_id IS NULL AND ii.variant_id IN (
      SELECT pv.id FROM product_variants pv WHERE pv.product_id = mo.product_id
    ))
  WHERE mo.product_id = p.id
    AND mo.status = 'ACTIVE'
    AND ii.qty_on_hand > 0
)
```

**Do NOT interpret availability as:**

- Product exists
- Variant exists
- Merchant offer exists without stock
- Reserved quantity alone
- Arbitrary client-side flag
- Product-level `is_available` column (deprecated for this purpose)

**API contract:**

- Supported value: `inStock` (only)
- Unknown values → `400 Bad Request`
- Do not create additional availability states

---

### BD-P9-04 — Export Format

**Decision:** Flat CSV, one row per variant.

For a product with 3 variants → 3 CSV rows.
For a product with 0 variants → 1 CSV row (the product itself with empty variant fields — consistent with import which always creates a default variant).

**Evidence (import contract):**

The existing `importRow` function (catalog.service.ts line 2583) matches existing products by SKU within the store:

```typescript
const existing = await db.select(...)
  .from(productVariants)
  .innerJoin(products, eq(products.id, productVariants.productId))
  .where(and(
    eq(productVariants.sku, sku),
    eq(products.storeId, storeId),
    isNull(products.deletedAt),
  )).limit(1);
```

If found → update product fields + upsert price + import typed attributes.
If not found → create product (DRAFT) + create default variant + upsert price + import typed attributes.

The export format must be compatible with this import contract.

---

### BD-P9-05 — Typed Attribute Export

**Decision:** Use `attr:<attribute_code>` column naming, matching the P8 import contract.

**Evidence (import contract):**

The `importTypedAttributes` function (catalog.service.ts line 2734) reads columns from the mapping where `logicalKey.startsWith('attr:')`:

```typescript
for (const [logicalKey, headerName] of Object.entries(mapping)) {
  if (!logicalKey.startsWith('attr:')) continue;
  const code = logicalKey.substring(5).trim();
  // ... resolves attribute definition by code, coerces value, writes to typed tables
}
```

The export must produce columns in the exact same format so the import pipeline can consume them.

**Do NOT introduce:**

- JSON attribute columns
- Separate attribute JSON blob
- Separate attribute sheet
- Proprietary export-only names

---

## 6. Search Contract

### 6.1 API Parameters

Extend the existing `GET /search` endpoint (catalog.controller.ts line 592). Do NOT create a second search API.

**New parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `priceMin` | numeric string | No | Minimum price filter (in major units, e.g. "500.00") |
| `priceMax` | numeric string | No | Maximum price filter (in major units, e.g. "1500.00") |
| `availability` | string | No | Availability filter. Supported: `inStock` |
| `sort` | string | No | Sort order. Supported: `price_asc`, `price_desc`, `newest`, `name` |

**Existing parameters (must continue to work):**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Full-text search query |
| `storeId` | string | Store-scoped search |
| `categoryId` | string | Category filter |
| `brandId` | string | Brand filter |
| `limit` | integer | Page size |
| `offset` | integer | Page offset |
| `attrFilters` | JSON string | Attribute filters |

### 6.2 Filter Composition

All filters compose via AND. Example:

```
GET /search?q=laptop&categoryId=xxx&brandId=yyy&priceMin=500&priceMax=1500&availability=inStock&sort=price_asc
```

The server applies ALL filters before pagination.

### 6.3 SearchOptions Interface Extension

The `SearchOptions` interface (search.service.ts line 433) must be extended:

```typescript
export interface SearchOptions {
  // ... existing fields ...
  priceMin?: number;       // in minor units (halalas)
  priceMax?: number;       // in minor units (halalas)
  availability?: 'inStock';
  sort?: 'price_asc' | 'price_desc' | 'newest' | 'name';
}
```

### 6.4 Query Design

Price and availability filters must use `EXISTS (...)` subqueries (same pattern as existing attribute filters at search.service.ts lines 300-340). This avoids:

- Duplicate products (no Cartesian multiplication from multiple offers)
- N+1 queries
- Incorrect pagination

Search results must remain **one product result per canonical product**. If a product has 20 offers, it must not appear 20 times.

Both code paths (empty-query Drizzle path at line 38, text-query raw SQL path at line 151) must implement the new filters.

### 6.5 Controller Changes

The `@Get('search')` handler (catalog.controller.ts line 592) must accept and parse the new query parameters, converting price from major units (client) to minor units (server).

---

## 7. Export Contract

### 7.1 Column Schema

The export CSV header must contain these fixed columns followed by dynamic `attr:<code>` columns:

| # | Column | Scope | Source Table | Importable? | Import mapping key |
|---|--------|-------|-------------|-------------|-------------------|
| 1 | `title` | product | products.title | YES | `name` |
| 2 | `titleAr` | product | products.title_ar | YES | `nameAr` |
| 3 | `description` | product | products.description | YES | `description` |
| 4 | `category` | product | categories.name (via FK) | YES | `category` |
| 5 | `brand` | product | brands.name (via FK) | YES | `brand` |
| 6 | `status` | product | products.status | NO (import sets DRAFT) | — |
| 7 | `sku` | variant | product_variants.sku | YES | `sku` |
| 8 | `barcode` | variant | product_variants.barcode | YES | `barcode` |
| 9 | `variantTitle` | variant | product_variants.title | NO | — |
| 10 | `unit` | variant | product_variants.unit | YES | `unit` |
| 11 | `priceMinor` | variant | price_tiers.unit_price_minor (base tier) | YES | `priceMinor` |
| 12+ | `attr:<code>` | product or variant | product_attribute_values / variant_attribute_values | YES | `attr:<code>` |

**Notes:**

- `status` is exported for merchant information but the import always creates products as `DRAFT`. This is intentionally not round-trippable — a merchant re-importing exported data should not re-create products as `ACTIVE` without review.
- `variantTitle` is exported for information but is not an import mapping key. The import uses `name` for both product title and variant title.
- `priceMinor` is resolved from the store's base price tier (same logic as current export: `price_tiers` where `min_qty = 1`).

### 7.2 Row Expansion

For each product owned by the store:

1. Fetch all ACTIVE variants (`product_variants` WHERE `product_id = p.id AND is_active = true`)
2. If variants exist → emit one CSV row per variant
3. If no variants exist → emit one CSV row with empty variant fields (sku='', barcode='', etc.)

This is a change from the current behavior (line 1745: `limit: 1`) which only exports the first variant.

### 7.3 Round-Trip Contract

```
EXPORT → CSV → EXISTING IMPORT PIPELINE → CATALOG
```

**Preserved through round-trip:**

- Product title (→ name), titleAr (→ nameAr), description
- Category mapping (by name → find-or-create)
- Brand mapping (by name → find-or-create)
- Variant SKU (→ match existing)
- Variant barcode
- Variant unit
- Base price (→ upsert base tier)
- Product-scope typed attributes (attr: columns where definition scope = PRODUCT)
- Variant-scope typed attributes (attr: columns where definition scope = VARIANT)

**Intentionally NOT round-trippable:**

- `status` — import always creates DRAFT; exported ACTIVE products re-import as DRAFT
- `variantTitle` — not an import mapping key
- Product-level `moq` — import parses but offer-owned (deprecated)
- Product images/media — not in CSV format
- GTIN/EAN/MPN — not in current export header, not in round-trip scope

---

## 8. Typed Attribute Contract

### 8.1 Attribute Scope Resolution

The export must correctly resolve both scopes:

- **PRODUCT scope:** Read from `product_attribute_values` WHERE `product_id = <id>`
- **VARIANT scope:** Read from `variant_attribute_values` WHERE `variant_id = <id>`

Each CSV row (one per variant) includes both:

- Product-level attributes (same value repeated for each variant of the same product)
- Variant-level attributes (specific to that variant)

### 8.2 Attribute Column Determinism

**Ordering rule (locked):**

1. Query the product types associated with the store's products
2. For each product type, get `product_type_attributes` ordered by `display_order ASC`
3. Collect unique attribute codes in that order
4. Fallback: any attributes not associated with a product type are appended ordered by `code ASC`

The same product type always produces the same column ordering across exports.

### 8.3 Attribute Value Serialization

Each attribute type is serialized to CSV text matching what `coerceAttributeValue` (catalog.service.ts line 2840) expects during import:

| Attribute Type | Storage Column | CSV Serialization | Import expects |
|---------------|---------------|-------------------|----------------|
| TEXT | value_text | Raw text | Raw text |
| LONG_TEXT | value_text | Raw text (quoted if contains comma/quote/newline) | Raw text |
| URL | value_text | Raw URL string | Raw URL string |
| COLOR | value_text | Raw color value (e.g. "#FF0000") | Raw color value |
| FILE | value_text | Raw file reference | Raw file reference |
| INTEGER | value_number | Integer string (e.g. "42") | `parseInt(raw, 10)` |
| MEASUREMENT | value_number | Integer string (e.g. "1500") | `parseInt(raw, 10)` |
| DECIMAL | value_number | Decimal string (e.g. "3.14") | `parseFloat(raw)` |
| CURRENCY | value_number | Decimal string (e.g. "99.99") | `parseFloat(raw)` |
| BOOLEAN | value_boolean | `"true"` or `"false"` | `['true','1','yes']` → true, `['false','0','no']` → false |
| DATE | value_text | ISO date string (e.g. "2026-10-06") | Raw ISO string |
| DATETIME | value_text | ISO datetime string (e.g. "2026-10-06T12:00:00Z") | Raw ISO string |
| SELECT | option_value | Option value string | Raw string (validated against options) |
| MULTI_SELECT | value_json | Comma-separated values, sorted, deduplicated (e.g. "A,B,C") | `split(',').map(s=>s.trim()).filter(Boolean)` → deduplicated array |

**MULTI_SELECT specifics:**

- Deterministic ordering: values sorted alphabetically
- No duplicate options
- Compatible with import parsing: `"A,B,C"` → `['A','B','C']`

---

## 9. Pagination Contract

**Critical rule:** Filtering and sorting occur **BEFORE** pagination.

```
Database WHERE (all filters)
  → Database ORDER BY (sort)
    → LIMIT / OFFSET (pagination)
      → Response
```

**Current pagination (verified):**

- `limit`: integer, default 20
- `offset`: integer, default 0
- `total`: count of matching rows (after filters, before pagination)

**P9 must preserve:**

- `total` reflects the filtered count (not unfiltered)
- No duplicates between pages
- No missing results between pages
- The deterministic tie-breaker (§5 BD-P9-02) ensures stable pagination even when multiple products share the same sort value

---

## 10. Security Contract

### 10.1 Search

Search is **buyer-facing global marketplace search**. The current architecture (verified in search.service.ts) is:

- `storeId` is optional — when absent, search is global across all stores
- When present, limits to that store's products
- Only `ACTIVE` products with `deleted_at IS NULL` are returned
- Product card enrichment (product-card.ts) already exposes `lowestOfferPriceMinor` across ALL stores' offers — this is intentional marketplace behavior

**P9 must NOT:**

- Add merchant-store restrictions to buyer search
- Expose internal inventory quantities (only the boolean `inStock` predicate)
- Expose merchant-private data (tier pricing, cost, etc.)
- Allow cross-tenant private data leakage

**P9 MUST:**

- Only use `merchant_offers.base_price_minor` (public base price) for price filtering
- Only use `inventory_items.qty_on_hand > 0` as a boolean predicate (never expose the actual number)
- Only consider `ACTIVE` offers for both price and availability filters

### 10.2 Export

Export is **store-owned**. The current authorization (catalog.controller.ts line 407-418) is:

```typescript
@Get('stores/:storeId/products/export')
@UseGuards(PermissionsGuard)
@RequirePermission('merchant:products:write')
async exportProducts(@Param('storeId') storeId, @CurrentUser() user) {
  const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
  await assertStoreInOrg(this.db, caller, storeId);
  await assertStoreMember(this.db, caller, storeId);
  return this.catalogService.exportProductsCsv(storeId);
}
```

**P9 must preserve this exact authorization chain:**

| Caller | Result |
|--------|--------|
| ACTIVE store member, same org, same store | ALLOW |
| ACTIVE store member, same org, wrong store | DENY |
| Different org | DENY |
| INACTIVE membership | DENY |
| No membership row | DENY |

Do not create a parallel authorization mechanism.

---

## 11. NULL / No-Offer Sort Behavior

Products with no ACTIVE merchant offers:

| Sort | Behavior |
|------|----------|
| `price_asc` | Products without active offers sorted **LAST** (NULLS LAST) |
| `price_desc` | Products without active offers sorted **LAST** (NULLS LAST) |
| `newest` | N/A — all products have `created_at` |
| `name` | N/A — all products have `title` |

**Implementation:** Use explicit `NULLS LAST` in SQL ORDER BY. Do not leave NULL ordering to database defaults.

Within the no-offer group, tie-break by `created_at DESC, id ASC` (same as other sorts).

---

## 12. Performance Contract

### 12.1 Search Target

```
10,000 products
Multiple offers per product
Multiple inventory records
Filtered search (price + availability + category + brand + attr)
Target: < 200ms
```

**Measurement must use:**

- Real PostgreSQL (not mock databases)
- Realistic data distribution
- EXPLAIN ANALYZE to verify query plans

### 12.2 Query Strategy

- Use `EXISTS (...)` subqueries for price and availability (same pattern as existing attribute filters)
- Do NOT JOIN merchant_offers into the main query (would cause row duplication)
- Do NOT use N+1 queries
- Existing indexes on `merchant_offers(product_id)`, `merchant_offers(status)`, `inventory_items(variant_id, warehouse_id)` should be sufficient

### 12.3 Index Policy

First implement using existing indexes and query patterns. Only introduce a new index if actual measurement demonstrates it is necessary.

**If a new index is genuinely necessary:**

1. STOP implementation
2. Report the requirement
3. Explain the query evidence
4. Propose the smallest migration
5. Do NOT create migration 0056 until the architecture decision is revised

### 12.4 Export Performance

Test exports with:

- 1,000 products with variants
- 10,000 products with variants
- Multiple attributes per product

Verify:

- No N+1 query explosion (batch-fetch attributes, not per-product)
- Deterministic output
- Bounded memory behavior (stream CSV rows, do not accumulate in memory)
- Correct row counts (one per variant)
- No duplicate variants
- No duplicate attribute columns

---

## 13. Web Contract

### 13.1 Current State (verified)

The web search page (`SearchPageClient.tsx`, 745 lines) currently implements:

- **Client-side price filter** (lines 178-187): filters `results` array by `priceFromMinor`
- **Client-side availability filter** (lines 199-202): filters by `isAvailable`
- **Client-side sort** (lines 204-221): sorts `filtered` array in JavaScript
- **URL state** (lines 73-87): `pmin`, `pmax`, `instock`, `sort` already in URL
- **API call** (lines 96-104): `searchProducts()` does NOT send price/availability/sort params

### 13.2 Required Changes

1. **Remove** client-side price filtering logic (lines 178-187)
2. **Remove** client-side availability filtering (lines 199-202)
3. **Remove** client-side sort logic (lines 204-221)
4. **Add** `priceMin`, `priceMax`, `availability`, `sort` parameters to the `searchProducts()` API call in `buyer-api.ts`
5. **Send** these parameters from the UI state to the API
6. **Use** server-returned `total` and `items` directly (no post-processing)
7. **Preserve** URL state format (`pmin`, `pmax`, `instock`, `sort`) for deep-link/refresh
8. **Preserve** verified-seller filter (client-side — not in P9 scope, operates on enrichment data)
9. **Preserve** multi-category client-side filter (not in P9 scope — API accepts single categoryId)

### 13.3 Sort Value Mapping

| Web UI value | API `sort` parameter |
|-------------|---------------------|
| `featured` | (omit — default behavior) |
| `price-asc` | `price_asc` |
| `price-desc` | `price_desc` |
| `newest` | `newest` |
| `title-asc` | `name` |

### 13.4 API Client Extension

The `searchProducts` function (buyer-api.ts line 319) must be extended:

```typescript
export async function searchProducts(params: {
  q?: string;
  categoryId?: string;
  brandId?: string;
  storeId?: string;
  limit?: number;
  offset?: number;
  attrFilters?: Record<string, string[]>;
  priceMin?: number;     // NEW
  priceMax?: number;     // NEW
  availability?: string; // NEW
  sort?: string;         // NEW
}): Promise<SearchResult> {
```

---

## 14. Mobile Contract

### 14.1 Current State (verified)

The mobile `SearchScreen` (search_screen.dart, 531 lines) currently supports:

- Category filter (chip bar)
- Brand filter (bottom sheet)
- Dynamic attribute facet filters (PHASE COS-15)
- Barcode scanner
- Pagination (load more)

**Does NOT support:**

- Price range filter
- Availability filter
- Sort control

The code explicitly documents (line 115-117):

```dart
/// Brand filter bottom sheet. Price / in-stock / verified-seller / sort are
/// intentionally absent: the search endpoint does not accept them yet
/// (BG-3 — tracked in docs/production/BACKEND-EXTENSION-SPEC.md).
```

### 14.2 P9 Mobile Scope

**Minimal:** The mobile search screen does not have price/availability/sort controls. P9 does NOT add them. The rationale:

- Adding mobile UI controls is a separate UX task, not a search correctness fix
- The mobile screen already documents the absence as intentional (BG-3)
- The API changes are backward-compatible — the mobile app continues to work without sending the new parameters

**If the mobile app sends search requests:** The `api_service.dart` search method should be updated to accept and forward the new parameters when they are provided, so future UI controls can be wired trivially. But no new UI is mandated.

---

## 15. Migration Decision

```
Migration: NOT REQUIRED
Latest migration remains: 0055
```

**Rationale:**

- Search filters operate on existing tables: `products`, `merchant_offers`, `price_tiers`, `inventory_items`, `warehouses`
- Export reads from existing tables: `products`, `product_variants`, `categories`, `brands`, `price_tiers`, `product_attribute_values`, `variant_attribute_values`
- No new columns needed
- Sort can be implemented via SQL ORDER BY with subqueries on existing columns
- Existing indexes should be sufficient (see §12.3)

---

## 16. Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| NP-A01 | `GET /search?priceMin=100&priceMax=500` returns only products with at least one ACTIVE offer with `base_price_minor` between 10000 and 50000 (minor units) | PostgreSQL integration test |
| NP-A02 | `GET /search?availability=inStock` returns only products with at least one ACTIVE offer having associated inventory with `qty_on_hand > 0` | PostgreSQL integration test |
| NP-A03 | `GET /search?sort=price_asc` returns products ordered by `MIN(ACTIVE offer base_price_minor)` ASC, NULLS LAST, then `created_at DESC, id ASC` | PostgreSQL integration test |
| NP-A04 | `GET /search?sort=price_desc` returns products ordered by `MIN(ACTIVE offer base_price_minor)` DESC, NULLS LAST, then `created_at DESC, id ASC` | PostgreSQL integration test |
| NP-A05 | `GET /search?sort=newest` returns products ordered by `created_at DESC, id ASC` | PostgreSQL integration test |
| NP-A06 | `GET /search?sort=name` returns products ordered by `title ASC, id ASC` | PostgreSQL integration test |
| NP-A07 | Combined filters (price + availability + category + brand + attr) produce correct intersection | PostgreSQL integration test |
| NP-A08 | Search pagination (limit/offset) works correctly with all filters applied server-side; no duplicates, no missing results | PostgreSQL integration test |
| NP-A09 | `GET /stores/:storeId/products/export` includes `attr:<code>` columns for all typed attributes used by the store's products | Source-level + integration test |
| NP-A10 | Export produces one row per variant (not per product) when variants exist | Integration test with multi-variant products |
| NP-A11 | Export CSV can be re-imported via the existing import pipeline without data loss for round-trippable fields (§7.3) | End-to-end integration test |
| NP-A12 | Search filters respect tenant/privacy correctness — no cross-tenant private data leakage, no inventory quantities exposed | Security test |
| NP-A13 | Export respects store membership — assertStoreInOrg + assertStoreMember enforced; same-org wrong-store DENY; inactive DENY; no membership DENY | Security test |
| NP-A14 | Web search page sends priceMin/priceMax/availability/sort to API; removes client-side filtering/sorting logic; URL state preserved | Browser verification |
| NP-A15 | Filtered search query completes within 200ms for 10,000 products with multiple offers and inventory records | Performance test against real PostgreSQL |

---

## 17. Testing Strategy

### Unit Tests

- Price parameter parsing and validation (numeric, non-negative, min <= max)
- Price boundary conditions (min only, max only, both, neither)
- Availability value validation (inStock accepted, unknown → 400)
- Sort mapping (string → SQL ORDER BY clause)
- NULL/no-offer ordering (NULLS LAST verified)
- Export CSV row generation (one row per variant)
- Attribute serialization for all 14 types
- MULTI_SELECT deterministic serialization (sorted, deduplicated)

### PostgreSQL Integration Tests

- Multiple offers per product → correct lowest price
- Multiple stores → correct store isolation
- Inventory availability → correct inStock predicate
- Price boundary values (exact match, just below, just above)
- Sort correctness with tied prices (tie-breaker verified)
- Pagination after filtering (no duplicates, no gaps)
- Typed attributes: PRODUCT scope, VARIANT scope, both
- Variant expansion (3 variants → 3 rows)
- Export → import round-trip (all round-trippable fields preserved)
- Empty export (no products → header only)

### Security Tests

- Same store member → export allowed
- Same org, wrong store → export DENIED
- Different org → export DENIED
- Inactive member → export DENIED
- No membership → export DENIED
- Buyer search → no inventory quantities leaked
- Buyer search → no merchant-private prices leaked

### Regression Tests

- All existing catalog tests pass
- All existing search tests pass
- All existing import tests pass
- All existing product tests pass

### Web Tests (Browser)

- Price filter sends params to API, results reflect server-side filtering
- Availability checkbox sends `availability=inStock`
- Sort dropdown sends correct sort value
- Combined filters work correctly
- URL state preserves all parameters on refresh/deep-link
- Pagination works with all filters active

### Performance Tests

- 10,000 products with multiple offers and inventory records
- Measure filtered query latency (target: < 200ms)
- Verify no N+1 query patterns
- Export 1,000+ products with variants and attributes

---

## 18. Out-of-Scope

The following remain explicitly deferred:

```
Product publishing/moderation workflow    (F-P9-01)
Variant media management UI               (F-P9-02)
Orphan media cleanup                      (F-P9-03)
Manufacturer entity                       (F-P9-04)
XLSX import                               (F-P9-06)
Import preview/validation UX               (F-P9-07)
Inventory receiving workflow               (F-P9-08)
Cycle count support                        (F-P9-09)
Inventory valuation                        (F-P9-10)
Price validity periods                     (F-P9-11)
Price history                              (F-P9-12)
Promotions/discounts                       (F-P9-13)
Search freshness metrics                   (F-P9-17)
Merchant rating/reputation display         (F-P9-18)
Refund workflow                            (F-P9-19)
Dispute resolution UI                      (F-P9-20)
RTL layout                                 (F-P9-21)
Promotions page wiring                     (F-P9-22)
Full-text search relevance tuning
```

---

## 19. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | Price filter EXISTS subquery causes performance regression at scale | LOW | MEDIUM | Use same pattern as existing attribute filters; measure with EXPLAIN ANALYZE; add index only if necessary (§12.3) |
| R2 | Export with many typed attributes produces very wide CSV | LOW | LOW | Limit columns to attributes actually used by the store's product types; stream rows |
| R3 | Client-side filter removal breaks existing search UX | LOW | MEDIUM | Coordinate web changes with API deployment; verify in browser before closing |
| R4 | Sort by price ambiguous when multiple offers exist | MEDIUM | LOW | Locked: lowest ACTIVE offer base_price_minor (§5 BD-P9-02) |
| R5 | Export N+1 query pattern for attributes | MEDIUM | MEDIUM | Batch-fetch all attribute values for all products in the export, not per-product |
| R6 | Multi-select attribute serialization mismatch with import | LOW | HIGH | Use comma-separated, sorted, deduplicated — verified against `coerceAttributeValue` (line 2871-2874) |

---

## 20. Release Gate

P9 may be marked CLOSED only if ALL of the following are true:

| Gate | Condition |
|------|-----------|
| Acceptance | NP-A01..NP-A15 = 15/15 PASS |
| Security | Tenant isolation PASS, store membership PASS |
| Concurrency | Read-only operations — no concurrency tests required |
| Migration | Not applicable (0055 remains latest) |
| Regression | Full relevant suite PASS (0 unexpected failures) |
| TypeScript | 0 errors (API + Web) |
| Nest Build | 0 issues |
| Web Build | 0 errors |
| Defects | P0 = 0, P1 = 0, P2 = 0, remaining P3 unchanged |
| Architecture | Deviations = NONE |

---

## 21. Architecture Deviations Policy

If during implementation a mandatory schema change or new index is discovered:

1. **STOP** implementation immediately
2. **Document** the query evidence (EXPLAIN ANALYZE output)
3. **Propose** the smallest possible migration
4. **Report** the architecture deviation
5. **Do NOT** create migration 0056 without explicit architecture revision

The current audit says "Migration: NOT REQUIRED." This stands unless implementation proves otherwise through measured evidence.

---

## 22. Architecture Principles (Preserved)

### Catalog

```
Canonical Product ≠ Merchant Offer
```

Products are platform-governed; offers are store-owned. Search filters use offer data without conflating the two.

### Attributes

```
Typed attribute tables are authoritative.
JSONB is not authoritative (deprecated per P3).
```

Export reads from `product_attribute_values` and `variant_attribute_values`, never from `products.attributes` JSONB.

### Search

```
Database filtering/sorting before pagination.
```

No client-side filtering of server results.

### Export

```
Flat variant rows.
```

One CSV row per variant. No nested JSON. No hierarchical structure.

### Security

```
JWT → Permission → Organization → Store membership → Operation
```

No new authorization mechanism. Existing `assertStoreInOrg` + `assertStoreMember` for export. Search remains buyer-facing (no membership required).

### Inventory

```
Inventory remains store/warehouse scoped.
```

The availability filter traverses: offer → store → warehouse → inventory_items. It does not aggregate across stores.

### Compatibility

```
Existing P1–P8 behavior must not regress.
```

All existing search parameters, response format, and pagination behavior are preserved. The export authorization chain is unchanged.

---

## 23. Final Decision

```
P9 BUSINESS RULES & ARCHITECTURE

Status:     LOCKED
Architecture: GO
Migration:  NOT REQUIRED
Next Gate:  P9 IMPLEMENTATION
```

All business decisions resolved:

- BD-P9-01: Price filter — EXISTS subquery on merchant_offers.base_price_minor ✓
- BD-P9-02: Price sort — lowest active offer base price, tie-breaker locked ✓
- BD-P9-03: Availability — ACTIVE offer + inventory qty_on_hand > 0 ✓
- BD-P9-04: Export format — flat CSV, one row per variant ✓
- BD-P9-05: Typed attribute export — attr:<code> matching P8 import ✓

All technical ambiguities resolved:

- Search API contract: 4 new params, existing params preserved ✓
- Export column schema: 11 fixed + dynamic attr columns ✓
- Round-trip contract: explicitly defined what is/isn't preserved ✓
- Attribute serialization: all 14 types mapped ✓
- Attribute column ordering: deterministic by product-type display_order ✓
- NULL/no-offer sort: NULLS LAST ✓
- Pagination: server-side before response ✓
- Security: search buyer-facing, export membership-gated ✓
- Performance: 10K products < 200ms target ✓
- Web: remove client-side filtering, send params to API ✓
- Mobile: no new UI, API backward-compatible ✓
- Migration: not required, deviation policy locked ✓

---

*END OF P9 BUSINESS RULES & ARCHITECTURE LOCK*
