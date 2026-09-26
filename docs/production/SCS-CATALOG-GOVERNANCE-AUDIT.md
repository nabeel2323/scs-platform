# SCS Catalog Governance Audit

**Date:** 2026-09-26
**Scope:** Catalog Import Center, Export, Product Type Publishing, Category Governance
**Status:** Pre-implementation findings — no runtime code changed in this document

---

## 1. Purpose

This audit reproduces the three stated problems and maps each to a concrete root cause in the codebase, then documents what has already been remediated in prior phases and what gaps remain for this phase.

**Invariant under test:**

> Import → Database → Admin UI → Export → Re-import must preserve the complete catalog meaning without losing relationships or creating duplicates.

---

## 2. Problem A — Imported Product Types Cannot Be Published

### Symptom

After importing a valid catalog workbook, attempting to publish a Product Type via the Admin UI fails with validation errors.

### Root Cause (resolved in prior phase)

The previous export implementation (`template-generator.service.ts`) did not emit a **Product Type Attributes** sheet. The round-trip cycle was:

```
Import (PTA rows written to DB) → Export (PTA sheet missing) → Re-import (zero PTA rows)
```

After re-import, `validateProductTypeForPublish()` found zero `productTypeAttributes` rows and returned:

```json
{ "code": "NO_ATTRIBUTES", "severity": "ERROR" }
```

### Current State

The export now emits all 12 sheets including **Product Type Attributes** with proper JOINs:
- `product_type_code` ← `productTypes.code`
- `attribute_code` ← `attributeDefinitions.code`
- `group_name` ← `attributeGroups.name`
- `required`, `scope`, `display_order`, `filterable`, `searchable`, `visible_in_listing`, `visible_in_detail`

The publish validator (`catalog.taxonomy.service.ts` `validateProductTypeForPublish()`) checks:

| Code | Severity | Condition |
|------|----------|-----------|
| `PRODUCT_TYPE_NOT_FOUND` | ERROR | PT row missing |
| `CATEGORY_MISSING` | ERROR | `categoryId` is null |
| `CATEGORY_NOT_FOUND` | ERROR | FK target does not exist |
| `NO_ATTRIBUTES` | ERROR | Zero PTA rows |
| `VARIANT_DIMENSION_INVALID_REF` | ERROR | Non-UUID in dimensions |
| `VARIANT_DIMENSION_NOT_FOUND` | ERROR | UUID not in `attributeDefinitions` |
| `VARIANT_DIMENSION_WRONG_SCOPE` | ERROR | Dimension attr scope ≠ VARIANT |
| `CATEGORY_NOT_PLATFORM` | WARNING | Category is store-scoped |
| `NO_REQUIRED_ATTRIBUTES` | WARNING | No attr marked required |
| `VARIANT_DIM_INACTIVE` | WARNING | Dimension attr not ACTIVE |

### Remaining Gap

- **Import preview does not run publish validation.** The validator checks structural correctness (codes resolve, types match) but does not call `validateProductTypeForPublish()` on planned Product Types. Users cannot see publishability before executing.
- **Import result does not include publishability counts.** After execution, the `ExecutionResult` has `{ created, updated, unchanged, rejected, errors }` but no publishability breakdown.

---

## 3. Problem B — Admin Cannot See What Products Belong to Each Category

### Symptom

The category detail page shows Overview, Hierarchy, and Product Types tabs but no Products tab.

### Root Cause

The admin category detail page (`apps/admin/src/app/categories/[id]/page.tsx`) was built without a Products section. The backend API already exists:

- `GET /categories/:id/products` → `getCategoryProducts()` with `scope=DIRECT|DESCENDANT|BOTH`
- `GET /categories/:id` → `getCategoryContents()` with `directProductCount`, `descendantProductCount`

### Current State

Backend APIs are fully implemented:
- `getCategoryContents()` returns parent, children, productTypeCount, directProductCount, descendantProductCount
- `getCategoryProducts()` returns `{ direct[], descendant[], directCount, descendantCount }` with joined brand/category/productType names
- `getCategoryTree()` returns hierarchical nodes with rolled-up descendant counts
- `listCategoryProductTypesForAdmin()` returns all statuses + variant/attribute counts

### Remaining Gap

- **Category detail page has no Products tab** (spec §12–13)
- **Category list page right panel has no products section** (shows only product types)
- **Product type detail page has no Products tab** (spec §22–23)
- **No `GET /product-types/:id/products` endpoint** — products by product type is not queryable

---

## 4. Problem C — Export Does Not Faithfully Reproduce Relationships

### Symptom

Re-importing an exported workbook loses all product relationships (brand, category, product type) and category hierarchy.

### Root Cause (resolved in prior phase)

The previous exporter wrote literal empty strings for:
- `Categories.parent_slug` — never selected `parentId`, never joined
- `Products.brand_slug` — never joined `brands`
- `Products.product_type_code` — never joined `productTypes`
- `Products.category_slug` — never joined `categories`

Additionally, 6 sheets were entirely missing: Attribute Groups, Product Type Attributes, Product Attributes, Variant Attributes, Sources, README.

### Current State

All 12 export methods now produce correct output:

| Sheet | JOIN strategy | Status |
|-------|--------------|--------|
| Categories | Self-lookup via `idToSlug` Map for `parent_slug` | ✅ Fixed |
| Brands | Direct select | ✅ OK |
| Attribute Groups | Direct select | ✅ Added |
| Attributes | Direct select with validation JSON serialization | ✅ OK |
| Attribute Options | JOIN `attributeDefinitions` for `attribute_code` | ✅ OK |
| Product Types | LEFT JOIN `categories` for `category_slug`; UUID→code mapping for `variant_dimensions` | ✅ Fixed |
| Product Type Attributes | INNER JOIN `productTypes`, `attributeDefinitions`; LEFT JOIN `attributeGroups` | ✅ Added |
| Products | LEFT JOIN `brands`, `productTypes`, `categories` for natural keys | ✅ Fixed |
| Product Attributes | INNER JOIN `products`, `attributeDefinitions`; typed value columns | ✅ Added |
| Variants | Product slug via `idToSlug` lookup | ✅ OK |
| Variant Attributes | INNER JOIN `productVariants`, `attributeDefinitions`; typed values | ✅ Added |
| Sources | Empty sheet (no `sources` table exists) | ✅ Structural placeholder |

README metadata sheet records per-sheet counts.

### Remaining Gap

- **Sources sheet is empty** — no `sources`/`product_sources` table exists in the Drizzle schema. This is documented and tracked as a follow-up.
- **MULTI_SELECT attribute values** stored in `value_json` are not exported (no sheet column for JSON arrays). Documented limitation; importer cannot ingest `value_json` either, so round-trip parity is maintained.

---

## 5. Corrupted SKU Variants

### Finding

One variant in the acceptance database has:

```
sku:    SKU-[{"attrId":"15505572-...","value"
title:  [{"attrId":"15505572-...","value":"Intel Core i3-1315U"},{"attrId":"...","value":"16GB"}...]
```

### Root Cause

The SKU generation bug was in `useProductStudio.ts` line 163:

```ts
const comboKey = JSON.stringify([{attrId, value}]);
const sku = `${state.slug || 'SKU'}-${comboKey}`;
```

This produced non-deterministic SKUs (UUIDs in attrId), non-human-readable strings, and exceeded `varchar(100)`.

### Current State

- **Bug fixed** in the Variant Identity remediation phase — `useProductStudio.ts` now uses a deterministic SKU generator
- **Existing corrupted variant NOT migrated** — the previous phase documented this as requiring a separate migration script

### Remaining Gap

- No migration script to fix existing `SKU-[%` variants
- No query to identify all corrupted variants for admin review

---

## 6. Category Content Model

### Definition (per spec §11)

| Concept | Definition |
|---------|-----------|
| Direct Products | Products whose `categoryId` equals this category's `id` |
| Descendant Products | Products belonging to child/descendant categories |
| Product Types | Product Types linked via `productTypes.categoryId` OR referenced by products in this category/descendants |

### Current State

The backend correctly separates these:
- `getCategoryContents()` returns `directProductCount` and `descendantProductCount` separately
- `getCategoryProducts()` returns `{ direct[], descendant[] }` with scope filtering
- `listCategoryProductTypesForAdmin()` returns the union of linked types and types referenced by products

---

## 7. Import Dependency Order

### Current Implementation

The executor processes entities in this order:

```
1. Categories → 2. Brands → 3. Attribute Groups → 4. Attributes →
5. Attribute Options → 6. Product Types → 7. Product Type Attributes →
8. Products → 9. Product Attributes → 10. Variants → 11. Variant Attributes
```

This matches the spec §20 dependency order. Cross-sheet references use `ResolvedReferences` maps seeded from DB, with pending UUIDs resolved after inserts.

---

## 8. Export Schema Compatibility

The export uses the same `SHEET_HEADERS` constant that defines the importer's expected columns. Column names match exactly:

| Importer sheet name | Export sheet name | Match |
|--------------------|-------------------|-------|
| Categories | Categories | ✅ |
| Brands | Brands | ✅ |
| Attribute Groups | Attribute Groups | ✅ |
| Attributes | Attributes | ✅ |
| Attribute Options | Attribute Options | ✅ |
| Product Types | Product Types | ✅ |
| Product Type Attributes | Product Type Attributes | ✅ |
| Products | Products | ✅ |
| Product Attributes | Product Attributes | ✅ |
| Variants | Variants | ✅ |
| Variant Attributes | Variant Attributes | ✅ |
| Sources | Sources | ✅ |

Stable identifiers (`slug`, `code`, `sku`) are used instead of database UUIDs.

---

## 9. Summary of Remaining Work

| # | Gap | Spec Reference | Priority |
|---|-----|---------------|----------|
| 1 | Products tab on category detail page | §12–13 | High |
| 2 | Products tab on product type detail page | §22–23 | High |
| 3 | `GET /product-types/:id/products` endpoint | §23 | High |
| 4 | Post-import publishability check | §19, §21 | High |
| 5 | Corrupted SKU migration script | §26 | Medium |
| 6 | Round-trip integration test | §29 | Medium |
| 7 | Relationship integrity test | §30 | Medium |
| 8 | Category content test | §31 | Medium |
| 9 | Product type publish test | §32 | Medium |

---

## 10. Security Notes

All category/product-type management endpoints are gated by:
- `PermissionsGuard` + `@RequirePermission('catalog:categories:write')` or `'catalog:product-types:manage'`
- `RolesGuard` + `@RequireRole('ADMIN', 'MODERATOR')`

The import/export endpoints require `catalog:imports:manage`.

Merchants cannot modify platform-owned catalog entities — the RBAC layer prevents this.
