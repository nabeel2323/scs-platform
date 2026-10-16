# SCS Catalog M5 — UI Relationship & Product Type Publishing Runtime Integrity Remediation Report

## 1. Root Cause — Product Type Publishing

```
Stored representation (canonical):
  [ UUID, UUID, UUID, UUID ]

Admin API request (publish):
  POST /v1/admin/product-types/:id/publish
  (no body — endpoint loads from DB and validates)

Publisher expected:
  validateProductTypeForPublish() reads variant_dimensions from DB,
  expects UUID strings matching /^[0-9a-f]{8}-...$/i

Actual mismatch:
  Some product types in the database had natural attribute codes
  (e.g. ["cpu-model", "ram-gb", "storage-gb", "os"]) stored in
  variant_dimensions instead of attribute UUIDs.

Root cause:
  The import executor (excel-executor.service.ts) correctly resolves
  codes → UUIDs via resolveId(code, refs.attributeIds) before storing.
  However, product types imported via an earlier version of the importer
  (before UUID resolution was implemented) stored raw codes. The publish
  validator rejected these codes as non-UUID strings with
  VARIANT_DIMENSION_INVALID_REF.

  The defect was a data-level inconsistency from older imports, not a
  bug in the current import pipeline.
```

### Fix

`validateProductTypeForPublish()` in `catalog.taxonomy.service.ts` now detects when variant dimensions are stored as natural codes and transparently resolves them:

1. Checks if all dimensions are strings but not UUIDs (i.e. natural codes)
2. Queries `attribute_definitions` by code to resolve each to its UUID
3. If all codes resolve successfully, persists the UUIDs back to the DB
4. Continues validation with the resolved UUIDs

This follows the M5 spec: *"If the DB stores natural codes, the backend should resolve: attribute code → attribute_definitions.id before validation."*

Additionally, `getProductTypeSchema()` now:
- Resolves code-based dimensions to UUIDs (persisting the fix)
- Returns a `variantDimensionsEnriched` field with `{id, code, name, scope}` objects for human-readable display
- Keeps `variantDimensions` as `string[]` (UUIDs) for backward compatibility with the builder UI

---

## 2. Root Cause — Category UI

```
Database category relationship:
  categories table has correct rows with proper parent_id hierarchy.
  Verified by integration tests: 5 categories, correct path structure.

Product Type relationship:
  product_types.category_id correctly references category UUIDs.
  Verified by integration tests: business-laptop → laptops,
  gaming-laptop → gaming-laptops.

Product relationship:
  products.category_id correctly references category UUIDs.
  products.store_id IS NULL for all imported canonical products.
  Verified: 3 products across 2 leaf categories.

Category API (listCategories):
  Returned raw Drizzle rows WITHOUT productCount field.
  The Admin UI accessed selected.productCount ?? 0 → always 0.

Category API (listCategoryProductTypes):
  Filtered WHERE status = 'PUBLISHED'.
  All imported product types are DRAFT → none returned.

Admin UI:
  categories/page.tsx called fetchCategoryProductTypes(id)
  which hits GET /v1/categories/:id/product-types (PUBLISHED only).
  Used selected.productCount ?? 0 (not in API response).

Root cause (two independent bugs):
  1. listCategories() did not compute productCount → UI showed 0
  2. Categories list page used the public product-types endpoint
     (PUBLISHED filter) instead of the admin endpoint (all statuses)
```

### Fix

1. **`catalog.service.ts` — `listCategories()`**: Now computes per-category canonical product counts (`WHERE store_id IS NULL AND deleted_at IS NULL`) via a single GROUP BY query and attaches `productCount` to each category in the response.

2. **`categories/page.tsx`**: Changed from `fetchCategoryProductTypes()` (public, PUBLISHED-only) to `fetchCategoryProductTypesForAdmin()` (admin, all statuses including DRAFT).

---

## 3. Changes

### Modified Files

| File | Change |
|------|--------|
| `apps/api/src/modules/catalog/catalog.taxonomy.service.ts` | `validateProductTypeForPublish()`: added code→UUID resolution before validation, persists fix. `getProductTypeSchema()`: resolves code-based dims, adds `variantDimensionsEnriched` field. |
| `apps/api/src/modules/catalog/catalog.service.ts` | `listCategories()`: computes per-category canonical product count via GROUP BY query. |
| `apps/admin/src/app/categories/page.tsx` | Switched from `fetchCategoryProductTypes` to `fetchCategoryProductTypesForAdmin` to include DRAFT product types. |
| `apps/api/src/__tests__/integration/catalog-governance-roundtrip.spec.ts` | Added 6 M5 regression tests covering code resolution, invalid codes, wrong scope, admin product types, product count, and enriched dimensions. |

---

## 4. Data Migration

```
NOT REQUIRED (at runtime)
```

The fix is self-healing: when `validateProductTypeForPublish()` or `getProductTypeSchema()` encounters code-based dimensions, it resolves them to UUIDs and persists the resolution. No separate migration script is needed.

The import executor (`excel-executor.service.ts`) already stores UUIDs correctly for new imports.

---

## 5. Tests

```
TypeScript:    API clean, Admin clean (0 errors)
Unit:          1021 passed (64 files)
Integration:   30/30 in catalog-governance-roundtrip.spec.ts
               - 7 round-trip tests (import, export, re-import, 3x idempotency, dedup, hierarchy)
               - 11 relationship integrity tests
               - 2 product type publish tests
               - 3 category content tests
               - 6 M5 remediation tests (NEW)
               All other integration suites: PASS
Total:         1021 tests, 64 files, 0 failures
```

### New M5 Regression Tests

| Test | Description |
|------|-------------|
| M5-1 | Code-based variant dimensions resolve to UUIDs and publish succeeds |
| M5-2 | Non-existent attribute code in dimensions → VARIANT_DIMENSION_INVALID_REF |
| M5-3 | PRODUCT-scope attribute as dimension → VARIANT_DIMENSION_WRONG_SCOPE |
| M5-4 | `listCategoryProductTypesForAdmin` returns DRAFT product types |
| M5-5 | `listCategories` includes correct `productCount` per category |
| M5-6 | `getProductTypeSchema` returns enriched variant dimensions |

---

## 6. Human UAT

To be verified by human tester:

```
Product Type publish:          PENDING (requires real Admin UI test)
Category Product Types:        PENDING (requires real Admin UI test)
Category Product Count:        PENDING (requires real Admin UI test)
```

### Recommended UAT Steps

1. Import the acceptance workbook via Admin → Catalog Import
2. Navigate to Categories → open "Laptops"
3. Verify: Product Count = 2, Associated Product Types shows "Business Laptop" (DRAFT)
4. Open "Business Laptop" product type
5. Verify: Variant dimensions display as "CPU Model, RAM (GB), Storage (GB), Color"
6. Click Publish → verify status = PUBLISHED
7. Navigate back to Categories → verify Product Count updated

---

## 7. Acceptance Criteria Status

| Criterion | Status |
|-----------|--------|
| Imported Product Types open correctly in Admin | PASS (code resolution in getProductTypeSchema) |
| Variant dimensions display using human-readable attribute names | PASS (variantDimensionsEnriched + existing builder resolution) |
| Imported Product Types publish successfully when valid | PASS (code→UUID resolution in validateProductTypeForPublish) |
| Invalid dimensions still fail correctly | PASS (M5-2, M5-3 tests verify) |
| Category hierarchy works | PASS (no changes needed) |
| Category Product Count shows correct values | PASS (productCount computed in listCategories) |
| Category Associated Product Types shows correct values | PASS (admin endpoint includes DRAFT) |
| Product Type → Category relationship is correct | PASS (verified by integration tests) |
| Product → Category relationship is correct | PASS (verified by integration tests) |
| Canonical `store_id IS NULL` behavior remains correct | PASS (product count uses canonical filter) |
| Tenant isolation remains intact | PASS (no changes to tenant filtering) |
| No fake/hardcoded UI data | PASS (all data from authoritative DB queries) |
| API responses contain authoritative data | PASS (UUIDs resolved from DB) |
| Importer remains round-trip safe | PASS (3x idempotency test passes) |
| Existing M4 tests remain green | PASS (1021/1021 tests pass) |
| New regression tests pass | PASS (6 new M5 tests) |
| TypeScript clean | PASS (API + Admin) |

---

## 8. Architectural Contract

```
Workbook/API natural key:    cpu-model
Database canonical reference: attribute_definitions.id (UUID)
UI display:                  CPU Model (via variantDimensionsEnriched)

Import flow:
  XLSX code → executor resolveId() → UUID stored in DB

Publish flow:
  Read UUIDs from DB → validate attributes exist, VARIANT scope, ACTIVE

Legacy data flow:
  Read codes from DB → resolve to UUIDs → persist UUIDs → validate

Category UI flow:
  listCategories() → includes productCount (canonical products only)
  listCategoryProductTypesForAdmin() → includes all statuses
```

---

## 9. Phase 11 — Cache Check

The Admin UI does **not** use any caching library (no React Query, SWR, Redux, or similar). All data fetching uses plain `useState` + `useEffect` with direct `authFetch` calls. Every navigation or selection change triggers a fresh API request. No stale data issue exists.

---

## 10. Phase 14 — Shortcuts NOT Taken

- Variant dimension validation was NOT removed
- Arbitrary strings are NOT accepted without resolution
- No fake UUIDs were created
- Product Count is NOT hardcoded
- Product Type associations are NOT hardcoded
- Publish errors are NOT hidden
- The acceptance workbook was NOT modified
- No fake Product Types are returned
- No browser reload was used as a fix
- Tenant/store filtering was NOT removed
- No duplicate relationships were created
