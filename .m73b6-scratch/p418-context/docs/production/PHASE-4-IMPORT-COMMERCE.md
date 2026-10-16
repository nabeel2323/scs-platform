# Phase 4 — Import → Catalog → Offer → Commerce

**Status:** ✅ PASSED
**Date:** 2026-09-25
**Test Suite:** `apps/api/src/__tests__/integration/phase4-import-commerce.e2e.spec.ts`
**Tests:** 39/39 passed (12.99s)

---

## Phase Gate

> At least one real imported product completes the full marketplace lifecycle successfully.

**✅ GATE PASSED** — An XLSX-imported canonical product (`imported-laptop-p4`) with variant `IMP-LAPTOP-P4-SILVER-16` completed:

```
XLSX → Import Pipeline → Canonical Product → Variant →
Merchant Offer (DRAFT → PROPOSED → ACTIVE) →
Inventory (50 units) → Pricing (3500.00 SAR) →
Cart (2 units) → Checkout → Order (7000.00 SAR subtotal) →
Master Order with sub-orders
```

---

## 1. Input Workbook

**File:** `import-p4.xlsx` (generated in-test via ExcelJS)

| Sheet | Rows | Key Columns |
|-------|------|-------------|
| Categories | 2 | `electronics-p4`, `laptops-p4` |
| Brands | 1 | `testbrand-p4` |
| Attributes | 2 | `color-p4` (SELECT/VARIANT), `ram-gb-p4` (INTEGER/VARIANT) |
| Attribute Options | 2 | Silver, Black (for color-p4) |
| Product Types | 1 | `laptop-p4` → category `laptops-p4` |
| Product Type Attributes | 2 | laptop-p4 binds color-p4 + ram-gb-p4 |
| Products | 1 | `imported-laptop-p4` → brand + type + category |
| Variants | 1 | `IMP-LAPTOP-P4-SILVER-16` |
| Variant Attributes | 2 | Color=Silver, RAM=16 |

**Total entity rows:** 14 (2 categories + 1 brand + 2 attributes + 2 options + 1 product type + 2 PTAs + 1 product + 1 variant + 2 VAs)

---

## 2. Import Pipeline Results

### Parse
- ✅ 9 sheets recognized (Categories, Brands, Attributes, Attribute Options, Product Types, Product Type Attributes, Products, Variants, Variant Attributes)
- ✅ Headers normalized (lowercase + underscore)
- ✅ Row data extracted per sheet

### Validate
- ✅ Zero errors against empty DB
- ✅ Cross-sheet references verified (brand_slug → Brands, product_type_code → Product Types, etc.)

### Resolve
- ✅ All references registered as `pending:*` placeholders on fresh DB
- ✅ Cross-sheet references resolved correctly:
  - `electronics-p4` → `pending:cat:electronics-p4`
  - `testbrand-p4` → `pending:brand:testbrand-p4`
  - `imported-laptop-p4` → `pending:prod:imported-laptop-p4`
  - `IMP-LAPTOP-P4-SILVER-16` → `pending:var:IMP-LAPTOP-P4-SILVER-16`

### Plan
- ✅ 14 CREATE, 0 UPDATE, 0 UNCHANGED on fresh DB
- ✅ Dependency order respected (categories before product types before products before variants)

### Execute
- ✅ 14 entities created in a single transaction
- ✅ 0 rejected, 0 errors
- ✅ All pending references replaced with real UUIDs

---

## 3. Database Verification After Import

### Categories
| Check | Result |
|-------|--------|
| `laptops-p4` exists with name "Laptops P4" | ✅ |
| `store_id IS NULL` (canonical) | ✅ |

### Brands
| Check | Result |
|-------|--------|
| `testbrand-p4` exists with name "TestBrand P4" | ✅ |

### Attributes
| Check | Result |
|-------|--------|
| `color-p4` type=SELECT, scope=VARIANT | ✅ |
| `ram-gb-p4` type=INTEGER, scope=VARIANT | ✅ |

### Attribute Options
| Check | Result |
|-------|--------|
| Silver + Black options for color-p4 | ✅ |

### Product Types
| Check | Result |
|-------|--------|
| `laptop-p4` exists, name "Laptop P4" | ✅ |
| `category_id` links to `laptops-p4` | ✅ |
| 2 product_type_attributes (color-p4, ram-gb-p4) | ✅ |

### Canonical Product
| Check | Result |
|-------|--------|
| `imported-laptop-p4` exists | ✅ |
| `store_id IS NULL` (canonical, not store-owned) | ✅ |
| `brand_id` NOT NULL → links to testbrand-p4 | ✅ |
| `category_id` NOT NULL → links to laptops-p4 | ✅ |
| `product_type_id` NOT NULL → links to laptop-p4 | ✅ |

### Variant
| Check | Result |
|-------|--------|
| `IMP-LAPTOP-P4-SILVER-16` exists | ✅ |
| `product_id` links to imported-laptop-p4 | ✅ |
| title = "Imported Laptop Silver 16GB" | ✅ |

### Variant Attributes
| Check | Result |
|-------|--------|
| 2 variant_attribute_values linked | ✅ |
| Color=Silver, RAM=16 | ✅ |

---

## 4. Import Idempotency

### Re-import same workbook

| Metric | Value |
|--------|-------|
| CREATE | 4 (relationship tables: 2 product_type_attributes + 2 variant_attributes — always INSERT, upsert on conflict) |
| UPDATE | 0 |
| UNCHANGED | 10 (categories, brands, attributes, options, product types, products, variants) |

- ✅ No duplicate products after re-import (count = 1)
- ✅ No duplicate variants after re-import (count = 1)
- ✅ Core entities correctly detected as UNCHANGED
- ✅ Relationship tables use defensive upserts (UNIQUE constraint prevents duplicates)

---

## 5. Offer Creation on Imported Product

| Step | Result |
|------|--------|
| Create offer (DRAFT) for imported canonical product | ✅ |
| Offer links: storeId=storeA, productId=importedProductId, variantId=importedVariantId | ✅ |
| Propose (DRAFT → PROPOSED) | ✅ |
| Approve (PROPOSED → ACTIVE) | ✅ |

**Offer details:**
- Currency: SAR
- Base price: 3500.00 (350000 minor units)
- MOQ: 1
- Lead time: 5 days

---

## 6. Inventory & Pricing

| Operation | Result |
|-----------|--------|
| Create inventory item (variant ↔ warehouse) | ✅ |
| Initial stock: 50 units | ✅ |
| Stock movement recorded (IMPORT) | ✅ |
| Price list "P4 Retail" created (SAR, store-scoped) | ✅ |
| Price tier: 3500.00 SAR at min_qty=1 | ✅ |

---

## 7. Real Commerce Lifecycle

### Cart
| Step | Result |
|------|--------|
| Buyer adds 2 × IMP-LAPTOP-P4-SILVER-16 to cart | ✅ |
| Cart line: quantity=2, offer linked | ✅ |
| Price resolved server-side from offer's price list | ✅ |

### Checkout
| Step | Result |
|------|--------|
| Buyer checks out | ✅ |
| Sub-order created for storeA | ✅ |
| Order items contain imported variant | ✅ |
| Price server-resolved: 350000 minor units | ✅ |
| Offer snapshot captured (basePriceMinor=350000) | ✅ |

### Order
| Step | Result |
|------|--------|
| Order exists with status PENDING_CONFIRMATION | ✅ |
| Subtotal: 700000 (2 × 350000) | ✅ |
| Total > 0 | ✅ |
| Master order links sub-orders | ✅ |

---

## 8. Import Error Handling

| Test | Result |
|------|--------|
| Rejects malformed workbook (not valid XLSX) | ✅ |
| Rejects unsupported file extension (.csv) | ✅ |
| Rejects macro-enabled workbook (.xlsm) | ✅ |
| Rejects empty file (0 bytes) | ✅ |
| Rejects oversized file (>25MB) | ✅ |
| Detects invalid cross-sheet references (UNKNOWN_REFERENCE) | ✅ |
| Detects duplicate keys within workbook (DUPLICATE_KEY) | ✅ |
| Detects invalid attribute type values (INVALID_VALUE) | ✅ |

---

## 9. Regression — Existing Flows Intact

| Test | Result |
|------|--------|
| Create store-scoped product via catalog service | ✅ |
| Create variant on non-imported product | ✅ |
| Create offer on non-imported product (DRAFT → PROPOSED → ACTIVE) | ✅ |
| Add non-imported variant to cart and checkout | ✅ |
| Imported and non-imported products coexist (≥2 products, ≥2 variants) | ✅ |
| No negative inventory after all commerce operations | ✅ |
| All orders have valid master orders | ✅ |

---

## 10. Defects Found & Fixed

### DEFECT-1: Executor `onConflictDoUpdate` target mismatch (CRITICAL)

**File:** `apps/api/src/modules/catalog-import/excel-executor.service.ts`

**Root cause:** The `upsertProduct` method used `onConflictDoUpdate({ target: products.slug })` but the database has `UNIQUE(store_id, slug)` — a composite constraint, not a single-column constraint on `slug`. This caused PostgreSQL to reject the INSERT with:
```
ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification
```

Since canonical products have `store_id = NULL` and PostgreSQL treats NULLs as distinct in unique constraints, the composite `(store_id, slug)` constraint never fires for canonical products anyway.

**Fix:** Removed the broken `onConflictDoUpdate` clause. The planner already determines CREATE vs UPDATE correctly, so CREATE actions use a plain INSERT. The executor's UPDATE path uses `WHERE id = existingId` (no conflict target needed).

**Impact:** Without this fix, NO import execution could succeed — all 25 downstream tests failed.

### DEFECT-2: `createVariant` auto-creates price tier (DISCOVERY)

**File:** `apps/api/src/modules/catalog/catalog.service.ts` (line 1063)

**Discovery:** `catalog.createVariant()` calls `ensureVariantPricing(storeId, variantId)` which auto-creates a base price tier (price=0) in the store's default B2B price list. This caused a duplicate key violation when the regression test tried to manually insert a price tier for the same variant.

**Resolution:** Test updated to UPDATE the auto-created tier rather than INSERT a new one.

---

## 11. Security Results

| Check | Result |
|-------|--------|
| Parser rejects .xlsm (macro-enabled) | ✅ |
| Parser never evaluates formulas | ✅ |
| Parser rejects oversized files (>25MB) | ✅ |
| Parser rejects empty files | ✅ |
| VARCHAR length limits enforced pre-flight | ✅ |
| Transaction rollback on any failure | ✅ |
| Canonical products bypass tenant-scope for internal calls | ✅ |
| Offer creation validates product/variant existence | ✅ |
| Cart requires ACTIVE offer for canonical products | ✅ |
| Price resolved server-side (never client-supplied) | ✅ |

---

## 12. Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                     IMPORT PIPELINE                              │
│  ExcelParserService → ExcelValidatorService → ExcelResolverService│
│       → ExcelPlannerService → ExcelExecutorService               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CATALOG LAYER                                 │
│  Categories → Brands → Attributes → Product Types → Products    │
│  → Variants → Variant Attributes                                │
│  (Canonical products: store_id = NULL)                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   OFFER LAYER                                    │
│  MerchantOffer (DRAFT → PROPOSED → ACTIVE)                      │
│  Links canonical product/variant to store + pricing             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                 COMMERCE LAYER                                   │
│  Inventory → Pricing → Cart → Checkout → Order → Master Order   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase Gate Verification

| Requirement | Status |
|-------------|--------|
| XLSX workbook parsed and validated | ✅ |
| Import plan generated (CREATE/UPDATE/UNCHANGED) | ✅ |
| Execution creates all entities in DB | ✅ |
| Catalog DB relationships verified (FK integrity) | ✅ |
| Idempotent re-import (no duplicates) | ✅ |
| Merchant offer created on imported product | ✅ |
| Offer lifecycle (DRAFT → PROPOSED → ACTIVE) | ✅ |
| Inventory tracked for imported variant | ✅ |
| Pricing resolved from offer's price list | ✅ |
| Cart accepts imported variant with offer | ✅ |
| Checkout completes with server-resolved price | ✅ |
| Order created with correct financial totals | ✅ |
| Master order links sub-orders | ✅ |
| Regression: non-imported flows unaffected | ✅ |
| Error handling: malformed/invalid/oversized rejected | ✅ |
| Security: macros, formulas, tenant-scope enforced | ✅ |

**Phase 4 PASSES.** The full marketplace lifecycle from XLSX import to completed order is proven with real APIs and a real PostgreSQL database.
