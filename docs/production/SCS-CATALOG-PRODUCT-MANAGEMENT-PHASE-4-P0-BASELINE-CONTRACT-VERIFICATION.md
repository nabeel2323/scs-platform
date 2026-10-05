# SCS Catalog Product Management — Phase 4 P0 Baseline + Contract Verification

## 1. Executive Summary

Phase 4 P0 verifies the repository baseline before implementation begins. All Phase 3 contracts are intact, all 432 regression tests pass, TypeScript compiles with 0 errors, and the Nest build succeeds with 283 files.

**P0 Verdict: PASS**

No blocking discrepancies found. The repository is ready for P1 (Optimistic Locking API/Backend).

## 2. Verification Scope

P0 verifies:
- Git/repository baseline matches Phase 3 closure
- Phase 3 typed attribute authority is intact
- Product API contracts are documented
- Optimistic locking starting point is identified
- Product type change prerequisites are verified
- Variant lifecycle starting point is documented
- RBAC/tenant isolation is verified
- Product lifecycle matches locked state machine
- Audit infrastructure capabilities are documented
- Admin and merchant frontend baselines are confirmed
- Test suite reproduces Phase 3 regression (432/432)
- No hidden Phase 4 implementation exists

## 3. Git/Repository Baseline

| Aspect | Expected | Actual | Status |
|--------|----------|--------|--------|
| Branch | `develop` | `develop` | ✅ PASS |
| HEAD | `0549e1f` | `0549e1f` | ✅ PASS |
| Working tree | Phase 3 uncommitted changes | 47 changed files (Phase 3 implementation + docs) | ✅ Expected |
| Phase 4 implementation changes | None | None detected | ✅ PASS |

## 4. Database/Migration Baseline

| Aspect | Expected | Actual | Status |
|--------|----------|--------|--------|
| Latest migration | `0053_attribute_backfill.sql` | `0053_attribute_backfill.sql` | ✅ PASS |
| Migration 0054 | Does NOT exist | Does NOT exist | ✅ PASS |
| Migration 0052 | `0052_execution_error_tracking.sql` | Present | ✅ PASS |
| Migration 0051 | `0051_variant_weight_decimal.sql` | Present | ✅ PASS |
| Typed attribute tables | All 8 exist | All 8 exist | ✅ PASS |

**Verified tables present in PostgreSQL:**
- `attribute_definitions` ✅
- `attribute_groups` ✅
- `attribute_options` ✅
- `backfill_errors` ✅
- `product_attribute_values` ✅
- `product_type_attributes` ✅
- `product_types` ✅
- `variant_attribute_values` ✅

## 5. Phase 3 Contract Verification

### 5.1 Typed Attribute Authority

| Contract | Evidence | Status |
|----------|----------|--------|
| `product_attribute_values` is authoritative | `catalog.taxonomy.schema.ts` L139-154 | ✅ PASS |
| `variant_attribute_values` is authoritative | `catalog.taxonomy.schema.ts` L156-171 | ✅ PASS |
| JSONB `products.attributes` deprecated | `catalog.schema.ts` L85: `@deprecated PHASE 3` JSDoc | ✅ PASS |
| JSONB `product_variants.attributes` deprecated | `catalog.schema.ts` L106: `@deprecated PHASE 3` JSDoc | ✅ PASS |
| `CreateVariantInput.attributes` deprecated | `catalog.service.ts` L2532: `@deprecated PHASE 3` JSDoc | ✅ PASS |

### 5.2 Typed Attribute Endpoints

| Endpoint | Controller | Auth | Status |
|----------|-----------|------|--------|
| `PUT /v1/products/:id/attribute-values` | `catalog.controller.ts` L248-258 | JWT + `merchant:products:write` + `assertProductInOrg` | ✅ PASS |
| `PUT /v1/products/:productId/variants/:variantId/attribute-values` | `catalog.controller.ts` L303-314 | JWT + `merchant:products:write` + `assertProductInOrg` | ✅ PASS |

### 5.3 FOR UPDATE Protection

| Method | Location | Strategy | Status |
|--------|----------|----------|--------|
| `setProductAttributeValues()` | `catalog.taxonomy.service.ts` L980 | `db.transaction()` + `SELECT ... FOR UPDATE` + DELETE/INSERT | ✅ PASS |
| `setVariantAttributeValues()` | `catalog.taxonomy.service.ts` L1026 | `db.transaction()` + `SELECT ... FOR UPDATE` + DELETE/INSERT + combination_key recompute | ✅ PASS |

### 5.4 Variant Matrix

| Method | Location | Reads from | Status |
|--------|----------|-----------|--------|
| `getVariantMatrix()` | `catalog.service.ts` L1751 | Typed `variant_attribute_values` via `listVariantsByProduct()` enrichment | ✅ PASS |

### 5.5 Import Compatibility

Phase 2 import writes to typed tables. Verified by 118/118 catalog import unit tests PASS.

## 6. Backend API Contract Matrix

### CreateProductInput (catalog.service.ts L2492-2508)

| Field | Present | Type | Notes |
|-------|---------|------|-------|
| storeId | ✅ | `string \| null` (optional) | Nullable for canonical products |
| title | ✅ | `string` (required) | |
| titleAr | ✅ | `string` (optional) | |
| slug | ✅ | `string` (optional) | |
| description | ✅ | `string` (optional) | |
| descriptionAr | ✅ | `string` (optional) | |
| categoryId | ✅ | `string` (optional) | |
| brandId | ✅ | `string` (optional) | |
| condition | ✅ | `string` (optional) | |
| images | ✅ | `string[]` (optional) | |
| gtin | ✅ | `string` (optional) | Phase 7 dedup |
| ean | ✅ | `string` (optional) | Phase 7 dedup |
| mpn | ✅ | `string` (optional) | Phase 7 dedup |
| productTypeId | ✅ | `string` (optional) | Phase 3 governed template |

### UpdateProductInput (catalog.service.ts L2510-2522)

| Field | Present | Notes |
|-------|---------|-------|
| title | ✅ | |
| titleAr | ✅ | |
| description | ✅ | |
| descriptionAr | ✅ | |
| status | ✅ | DRAFT/ACTIVE/REJECTED/ARCHIVED |
| condition | ✅ | |
| images | ✅ | |
| categoryId | ✅ | |
| brandId | ✅ | |
| slug | ✅ | |
| metadata | ✅ | |
| **productTypeId** | ❌ **MISSING** | P2 will add with variant/offer guard (BD-06) |
| **gtin** | ❌ **MISSING** | P2 will add (BD-05) |
| **ean** | ❌ **MISSING** | P2 will add (BD-05) |
| **mpn** | ❌ **MISSING** | P2 will add (BD-05) |
| **updatedAt** | ❌ **MISSING** | P1 will add for optimistic locking (BD-08) |

### CreateVariantInput (catalog.service.ts L2524-2535)

| Field | Present | Notes |
|-------|---------|-------|
| sku | ✅ (required) | |
| barcode | ✅ | |
| title | ✅ | |
| titleAr | ✅ | |
| unit | ✅ | Default 'PCS' |
| weightGrams | ✅ | |
| dimensionsMm | ✅ | |
| attributes | ✅ (deprecated) | JSONB legacy; redirected to typed endpoint |
| images | ✅ | |

### UpdateVariant (Partial<CreateVariantInput>)

| Aspect | Status |
|--------|--------|
| Accepts same fields as Create | ✅ |
| Rejects `attributes` field | ✅ (L1664-1669: throws BadRequestException) |
| Sets `updatedAt: new Date()` | ✅ (L1677) |
| **Optimistic locking** | ❌ **NOT IMPLEMENTED** — P1 will add |

## 7. Optimistic Locking Baseline

| Question | Answer | Evidence |
|----------|--------|----------|
| A. Is `updatedAt` returned to clients? | **YES** — `products.updatedAt` and `product_variants.updatedAt` are in the schema and returned by `getProduct()` / `getVariant()` | `catalog.schema.ts` L91, L116 |
| B. Is `updatedAt` accepted by update DTOs? | **NO** — neither `UpdateProductInput` nor `CreateVariantInput` include it | L2510-2522, L2524-2535 |
| C. Does `updateProduct()` perform conditional update? | **NO** — simple `UPDATE ... WHERE id = ?` | L1343: `.where(eq(products.id, id))` |
| D. Does `updateVariant()` perform conditional update? | **NO** — simple `UPDATE ... WHERE id = ?` | L1685-1688: `.where(eq(productVariants.id, variantId))` |
| E. Is HTTP 409 already used elsewhere? | **YES** — `ConflictException` used in orders (idempotency), catalog-import (status conflicts), taxonomy (duplicate codes) | `orders.service.ts` L329, L516; `catalog.service.ts` L1961, L1992; `catalog.taxonomy.service.ts` L177, L237, L288, L327, L352 |
| F. Existing conflict infrastructure? | **YES** — NestJS `ConflictException` is imported and used throughout | `catalog.service.ts` L4: `import { ... ConflictException ... }` |
| G. Timestamp precision concerns? | **LOW RISK** — PostgreSQL `timestamp with time zone` has microsecond precision; JavaScript `Date` has millisecond precision. The `updatedAt` column uses `timestamp('updated_at', { withTimezone: true })`. Comparison via `WHERE updated_at = ?` should work since JS milliseconds are a subset of PG microseconds. However, if two updates occur within the same millisecond, there is a theoretical collision. The recommended P1 approach is to use string comparison of the ISO timestamp. | |

### Recommended P1 Implementation Contract

```
updateProduct(id, input, clientUpdatedAt?):
  1. If clientUpdatedAt provided:
     WHERE id = ? AND updated_at = clientUpdatedAt
     If 0 rows matched → throw ConflictException (409)
  2. Apply updates, set updatedAt = new Date()
  3. Return updated product (including new updatedAt)

updateVariant(productId, variantId, input, clientUpdatedAt?):
  Same pattern as updateProduct
```

## 8. Product Type Change Baseline

### Existing queries for guard implementation

| Query | Method | Location | Reusable? |
|-------|--------|----------|-----------|
| Count variants for product | `listVariantsByProduct()` | `catalog.service.ts` L1700 | ✅ YES — can check `.length === 0` |
| Count offers for product | Via `merchantOffers` query | `catalog.offer.service.ts` | ✅ YES — query `merchantOffers` by `productId` |
| Get product with productTypeId | `getProduct()` | `catalog.service.ts` | ✅ YES — returns `productTypeId` |

### P2 Implementation Plan

```
updateProduct(id, input):
  if input.productTypeId !== undefined && input.productTypeId !== current.productTypeId:
    variantCount = await countVariants(id)
    offerCount = await countOffers(id)
    if variantCount > 0 || offerCount > 0:
      throw BadRequestException('Cannot change product type: product has variants or merchant offers')
    // else allow change
```

## 9. Variant Lifecycle Baseline

| Aspect | Current State | Evidence |
|--------|--------------|----------|
| `isActive` exists | ✅ `boolean('is_active').notNull().default(true)` | `catalog.schema.ts` L109 |
| PATCH supports `isActive` | ❌ **NOT in CreateVariantInput** — but `input['isActive']` could be passed via `Partial<CreateVariantInput>` | L2524-2535: field not listed |
| DELETE exists | ✅ Via `bulkVariantOperations({ deleteIds })` | `catalog.controller.ts` L316-330 |
| DELETE is hard delete | ✅ **YES** — `DELETE FROM product_variants WHERE id IN (...)` | `catalog.service.ts` L1394+ |
| Offers reference variants | ✅ `merchant_offers.variant_id` FK | `catalog.offer.schema.ts` L47 |
| Inventory references variants | Via `inventory_items` → stock_movements | Existing schema |
| Orders/history reference variants | Via order_items → variant_id | Existing schema |
| Safe deactivate exists | ❌ **NO** — only hard delete available | BD-07 requires adding deactivate |

### P5/P7 Implementation Plan

- Add `isActive` to `CreateVariantInput` (or handle via `Partial<>`)
- Add "deactivate" action to `bulkVariantOperations`
- Before hard delete: check for offer/inventory/order references
- UI: show "Deactivate" before "Delete" option

## 10. RBAC/Tenant Verification

### Permission Definitions (seed.ts)

| Permission | Defined | Assigned To | Status |
|------------|---------|-------------|--------|
| `merchant:products:write` | ✅ L38 | MERCHANT_OWNER, MERCHANT_STAFF, MODERATOR | ✅ PASS |
| `catalog:products:read` | ✅ L47 | All roles including BUYER | ✅ PASS |
| `catalog:products:write` | ✅ L48 | ADMIN, MODERATOR, MERCHANT_OWNER, MERCHANT_STAFF | ✅ PASS |
| `catalog:products:delete` | ✅ L49 | ADMIN, MODERATOR, MERCHANT_OWNER, MERCHANT_STAFF | ✅ PASS |
| `catalog:categories:write` | ✅ L51 | ADMIN, MODERATOR, MERCHANT_OWNER, MERCHANT_STAFF | ✅ PASS |
| `catalog:brands:manage` | ✅ L52 | ADMIN, MODERATOR | ✅ PASS |
| `catalog:attributes:manage` | ✅ L54 | ADMIN, MODERATOR | ✅ PASS |
| `catalog:product-types:manage` | ✅ L55 | ADMIN, MODERATOR | ✅ PASS |
| `admin:merchants:read` | ✅ L88 | ADMIN, MODERATOR | ✅ PASS |

### Tenant Isolation

| Guard | Location | Used On | Status |
|-------|----------|---------|--------|
| `assertProductInOrg()` | `common/tenant-scope.ts` | 10 call sites in `catalog.controller.ts` | ✅ PASS |
| Import from controller | `catalog.controller.ts` L38 | Product/variant/media write endpoints | ✅ PASS |
| Unit tests | `catalog-ownership.spec.ts` | 7 test cases covering merchant/admin/superAdmin | ✅ PASS |
| Integration tests | `catalog-lifecycle.e2e.spec.ts` | Cross-tenant rejection tests | ✅ PASS |

### Verified Call Sites (assertProductInOrg)

- `updateProduct` (L229) ✅
- `deleteProduct` (L237) ✅
- `setProductAttributeValues` (L256) ✅
- `createVariant` (L276) ✅
- `updateVariant` (L294) ✅
- `setVariantAttributeValues` (L312) ✅
- `bulkVariantOperations` (L328) ✅
- `reorderMedia` (L362) ✅
- `addMedia` (L376) ✅
- `removeMedia` (L393) ✅

## 11. Product Lifecycle Verification

### Current Status Values

| Status | Supported | Evidence |
|--------|-----------|----------|
| DRAFT | ✅ | Default on creation: `status: 'DRAFT'` (L768) |
| ACTIVE | ✅ | Set via `updateProduct({ status: 'ACTIVE' })` (L1324-1326) |
| REJECTED | ✅ | Via `moderateAdminProduct(id, 'REJECTED')` |
| ARCHIVED | ✅ | Via `moderateAdminProduct(id, 'ARCHIVED')` or `bulkProductOperations('archive')` |

### Transition Verification

| Transition | Supported | Evidence |
|------------|-----------|----------|
| DRAFT → ACTIVE | ✅ | `updateProduct` + `validatePublish()` (L1339-1341) |
| DRAFT → REJECTED | ✅ | Admin moderation |
| ACTIVE → ARCHIVED | ✅ | `moderateAdminProduct` or bulk archive |
| ACTIVE → REJECTED | ✅ | Admin moderation |
| REJECTED → DRAFT | ✅ | `updateProduct({ status: 'DRAFT' })` |
| ARCHIVED → DRAFT/ACTIVE | ✅ | `updateProduct({ status: 'DRAFT' })` (admin action) |

### Publish Validation

| Aspect | Status | Evidence |
|--------|--------|----------|
| `validatePublish()` exists | ✅ | `catalog.service.ts` L1241-1310 |
| Checks required attributes | ✅ | Loads `productTypeAttributes`, checks `required` flag |
| Evaluates conditional rules | ✅ | Loads `conditionalRules`, evaluates via `ConditionalRulesService` |
| Blocks publish on missing required | ✅ | Throws `UnprocessableEntityException` |
| Called before DRAFT → ACTIVE | ✅ | L1339: `if (input.status === 'ACTIVE') await this.validatePublish(id)` |

## 12. Audit Infrastructure Verification

### Existing AuditService

| Aspect | Detail | Evidence |
|--------|--------|----------|
| Location | `modules/audit/audit.service.ts` | 100 lines |
| Storage | `audit_logs` table (migration 0002) | Append-only |
| `record()` method | Accepts `AuditEntry` with actorType, actorId, action, resource, resourceId, orgId, metadata | L69-88 |
| Error handling | Never throws — logs error and continues | L83-87 |
| Actor types | BUYER, MERCHANT, DRIVER, ADMIN, SYSTEM | L15 |
| Role mapping | SUPER_ADMIN→ADMIN, ADMIN→ADMIN, MODERATOR→ADMIN, MERCHANT_OWNER→MERCHANT, MERCHANT_STAFF→MERCHANT, BUYER→BUYER | L36-44 |

### Existing Product Audit Events

| Event | Recorded? | Location |
|-------|-----------|----------|
| `product.created` | ✅ | `catalog.service.ts` L779-785 |
| `product.published` | ✅ | `catalog.service.ts` L1353-1359 |
| `product.deleted` | ✅ | `catalog.service.ts` L1378-1383 |
| `product.updated` | ❌ **NOT recorded** | P9 must add |
| `product.rejected` | ❌ **NOT recorded** | P9 must add |
| `product.archived` | ❌ **NOT recorded** | P9 must add |
| `product.restored` | ❌ **NOT recorded** | P9 must add |
| `variant.created` | ❌ **NOT recorded** | P9 must add |
| `variant.updated` | ❌ **NOT recorded** | P9 must add |
| `variant.deactivated` | ❌ **NOT recorded** | P9 must add |

### Metadata Capability

The `metadata` field (`Record<string, unknown>`) can store `changedFields: { field: { old, new } }` for field-level audit. No schema change needed.

## 13. Admin UI Baseline

### Product List (`/products`)

| Feature | Status | Evidence |
|---------|--------|----------|
| Page component | `ManagementPage` entity="products" | `apps/admin/src/app/products/page.tsx` (6 lines) |
| Permission | `admin:merchants:read` | `management-tables.ts` L34 |
| Columns | title, slug, storeName, condition, imageCount, status, publishedAt, createdAt, updatedAt | `management-tables.ts` L33-35 |
| Filters | status (DRAFT/ACTIVE/REJECTED), storeId, categoryId, condition, hasImages | `management-tables.ts` L36-37 |
| Pagination | ✅ Server-side via `useAdminTable` | `ManagementPage.tsx` L59-66 |
| Search | ❌ **No search input** for products | P8 must add |
| Category filter | ⚠️ Text filter (categoryId), not tree selector | P8 must enhance |
| Product type filter | ❌ **NOT present** | P8 must add |
| Create action | ❌ **NOT present** | P3/P8 must add |
| Edit action | ❌ **NOT present** | P3 must add |
| Moderation | ✅ Approve/Reject/Archive via keyboard shortcuts (a/x) | `ManagementPage.tsx` L82-99 |
| Sorting | ✅ title, slug, storeName, condition, imageCount, status | `management-tables.ts` L25 |

### Product Detail (`/products/:id`)

| Feature | Status | Evidence |
|---------|--------|----------|
| Component | `ProductDetails` (452 lines) | `apps/admin/src/components/ProductDetails.tsx` |
| Tabs | Overview, Variants, Offers, Media | L7-8 comment |
| Moderation actions | Approve, Reject, Archive | L50-137 |
| Permission | `admin:merchants:read` | L157 |
| Edit mode | ❌ **NOT present** — read-only | P3 must add |
| Variants tab | Read-only table | Related columns rendered |

## 14. Merchant Product Studio Baseline

### Routes

| Route | Status | Evidence |
|-------|--------|----------|
| `/merchant/product-studio` | ✅ Create wizard | `apps/web/src/app/merchant/product-studio/page.tsx` (145 lines) |
| `/merchant/product-studio/:id` | ❌ **NOT present** — edit mode | P6 must add |
| `/merchant/catalog/product/:id` | Redirects to Studio (new) or Catalog (existing) | `apps/web/src/app/merchant/catalog/product/[id]/page.tsx` |

### useProductStudio Hook

| Aspect | Status | Evidence |
|--------|--------|----------|
| Location | `apps/web/src/hooks/useProductStudio.ts` (280 lines) | |
| Steps | 6: identity, specifications, variants, offer, media, review | L15-22 |
| StudioState | Full state interface with all fields | L25-58 |
| Create product | ✅ `handleSaveProduct()` | |
| Load existing product | ❌ **NOT implemented** | P6 must add |
| Typed attribute write | ✅ `upsertProductAttributeValues()` | L6-9 imports |
| Variant creation | ✅ `createVariant()` | |
| Offer creation | ✅ `createMerchantOffer()` | |
| Media upload | ✅ `presignMedia()` + `addMedia()` | |
| Canonical dedup | ✅ `searchCanonicalProducts()` | |
| Existing variant loading | ✅ `loadExistingVariants()` | |

### Step Components

| Step | Component | Lines | Status |
|------|-----------|-------|--------|
| 1. Identity | `StepIdentity.tsx` | 229 | ✅ Create mode |
| 2. Specifications | `StepSpecifications.tsx` | 199 | ✅ Typed attrs with conditional rules |
| 3. Variants | `StepVariants.tsx` | 149 | ✅ Matrix + existing variant selector |
| 4. Offer | `StepOffer.tsx` | 107 | ✅ Merchant offer creation |
| 5. Media | `StepMedia.tsx` | 149 | ✅ Presign + upload |
| 6. Review | `StepReview.tsx` | 120 | ✅ Completeness score |

## 15. Frontend API Contract Baseline

### Admin API Client (`apps/admin/src/lib/api.ts`)

| Function | Returns updatedAt? | Returns productTypeId? | Returns gtin/ean/mpn? |
|----------|-------------------|----------------------|----------------------|
| Product fetch | ✅ (from API response) | ✅ (from API response) | ✅ (from API response) |
| `AdminProduct` type | Includes all product fields | Includes productTypeId | Includes identifiers |

### Web API Client (`apps/web/src/lib/buyer-api.ts`)

| Function | Returns updatedAt? | Returns productTypeId? | Returns gtin/ean/mpn? | Returns typed attrs? |
|----------|-------------------|----------------------|----------------------|---------------------|
| `fetchProduct()` | ✅ | ✅ | ✅ | ✅ (via product detail) |
| `fetchProductVariants()` | ✅ | N/A | N/A | ✅ (via variant enrichment) |
| `createProduct()` | Returns created product | ✅ | ✅ | N/A |
| `upsertProductAttributeValues()` | N/A | N/A | N/A | Writes typed attrs |

### What P1-P7 Need to Consume

| Feature | Frontend Needs | Currently Available? |
|---------|---------------|---------------------|
| Optimistic locking | Client must send `updatedAt` on save | ❌ Not in update DTOs |
| Product type editing | `productTypeId` in update call | ❌ Not in UpdateProductInput |
| Identifier editing | `gtin`/`ean`/`mpn` in update call | ❌ Not in UpdateProductInput |
| 409 conflict handling | UI must show conflict banner | ❌ Not implemented |
| Variant deactivation | `isActive` toggle in variant edit | ⚠️ Partially (not in DTO) |
| Edit mode loading | Load product into Studio state | ❌ Not implemented |

## 16. Test Baseline

### Test Execution Results

| Suite | Tests | Result | Command |
|-------|-------|--------|---------|
| Catalog unit tests | 148 | 148/148 PASS | `vitest run src/__tests__/unit/catalog/` |
| Catalog import unit tests | 118 | 118/118 PASS | `vitest run src/__tests__/unit/catalog-import/` |
| Governance roundtrip | 30 | 30/30 PASS | `vitest run src/__tests__/integration/catalog-governance-roundtrip.spec.ts` |
| Phase 3 attribute cutover | 21 | 21/21 PASS | `vitest run src/__tests__/integration/phase3-attribute-cutover.postgres.spec.ts` |
| Phase 3 runtime verification | 38 | 38/38 PASS | `vitest run src/__tests__/integration/phase3-runtime-verification.postgres.spec.ts` |
| Phase 1 integration | 38 | 38/38 PASS | `vitest run src/__tests__/integration/phase1-marketplace.e2e.spec.ts` |
| Phase 2 integration | 39 | 39/39 PASS | `vitest run src/__tests__/integration/phase2-multi-merchant.e2e.spec.ts` |
| **Total** | **432** | **432/432 PASS** | |

### Build Verification

| Gate | Result | Command |
|------|--------|---------|
| TypeScript | 0 errors | `tsc --noEmit` |
| Nest build | 283 files compiled, 0 issues | `nest build` |

## 17. Phase 3 Regression Result

| Metric | Phase 3 Closure | P0 Verification | Delta |
|--------|----------------|-----------------|-------|
| Total tests | 432 | 432 | 0 |
| Pass | 432 | 432 | 0 |
| Fail | 0 | 0 | 0 |
| TypeScript errors | 0 | 0 | 0 |
| Build files | 283 | 283 | 0 |

**Phase 3 regression is fully reproduced. No regression detected.**

## 18. Hidden/Existing Phase 4 Functionality

Search for any implementation that may already partially satisfy Phase 4:

| Feature | Already Exists? | Evidence |
|---------|----------------|----------|
| `updatedAt` conditional update | ❌ NO | `updateProduct()` L1343: no `AND updated_at =` condition |
| Optimistic locking | ❌ NO | No version column, no conditional WHERE |
| HTTP 409 for product conflicts | ❌ NO | `ConflictException` used in other modules but not for product/variant updates |
| `productTypeId` in UpdateProductInput | ❌ NO | L2510-2522: not listed |
| `gtin`/`ean`/`mpn` in UpdateProductInput | ❌ NO | L2510-2522: not listed |
| Admin product create page | ❌ NO | `/products` is read-only ManagementPage |
| Admin product edit page | ❌ NO | `/products/:id` is read-only ProductDetails |
| Merchant product edit mode | ❌ NO | `/merchant/product-studio/:id` does not exist |
| Variant deactivate (non-destructive) | ❌ NO | Only hard delete via `bulkVariantOperations` |
| Product audit events (updated/rejected/archived) | ❌ PARTIAL | Only `created`, `published`, `deleted` recorded |
| Admin product search/filter | ❌ NO | No search input; only status/condition text filters |
| Product Studio edit mode | ❌ NO | `useProductStudio` has no `loadProduct()` |

**No hidden Phase 4 implementation found. All Phase 4 work starts from scratch.**

## 19. Contract Matrix

| # | Contract | Expected | Actual | Status | Evidence |
|---|----------|----------|--------|--------|----------|
| 1 | Phase 3 typed attribute authority | Typed tables authoritative | ✅ Confirmed | `catalog.taxonomy.schema.ts` L139-171 |
| 2 | JSONB deprecation | Never read/written by authoritative code | ✅ Confirmed | `@deprecated` JSDoc on both columns |
| 3 | Product CRUD | Full create/read/update/delete | ✅ Confirmed | `catalog.controller.ts` L191-239 |
| 4 | Variant CRUD | Full create/read/update/delete | ✅ Confirmed | `catalog.controller.ts` L268-330 |
| 5 | UpdateProductInput | title, titleAr, description, descriptionAr, status, condition, categoryId, brandId, slug | ✅ Matches | L2510-2522 |
| 6 | UpdateVariantInput | Partial<CreateVariantInput>; rejects attributes | ✅ Matches | L1663-1689 |
| 7 | updatedAt | Set on every update, returned to clients | ✅ Set; ✅ Returned; ❌ Not in DTOs | L1318, L1677 |
| 8 | Product type relationship | `products.product_type_id` exists | ✅ Confirmed | `catalog.schema.ts` L69 |
| 9 | Merchant offers relationship | `merchant_offers.product_id` + `variant_id` | ✅ Confirmed | `catalog.offer.schema.ts` L44-47 |
| 10 | Variant isActive | `is_active` boolean, default true | ✅ Confirmed | `catalog.schema.ts` L109 |
| 11 | Lifecycle | DRAFT/ACTIVE/REJECTED/ARCHIVED | ✅ Confirmed | L80, L1324-1326, moderation |
| 12 | Publish validation | `validatePublish()` checks required attrs | ✅ Confirmed | L1241-1310, L1339 |
| 13 | Permissions | All 9 locked permissions defined and assigned | ✅ Confirmed | `seed.ts` L25-243 |
| 14 | Tenant isolation | `assertProductInOrg()` on all product writes | ✅ Confirmed | 10 call sites in controller |
| 15 | Audit infrastructure | `AuditService.record()` with metadata | ✅ Confirmed | `audit.service.ts` L54-88 |
| 16 | Admin product list | Read-only ManagementPage | ✅ Confirmed | `products/page.tsx` (6 lines) |
| 17 | Merchant Product Studio | 6-step create wizard | ✅ Confirmed | `product-studio/page.tsx` (145 lines) |
| 18 | Frontend API contracts | Products return updatedAt, productTypeId, identifiers | ✅ Confirmed | Schema includes all fields |
| 19 | Phase 3 regression | 432/432 PASS | ✅ 432/432 PASS | Test execution above |
| 20 | TypeScript/build | 0 errors, 283 files | ✅ 0 errors, 283 files | Build execution above |

## 20. Findings

### FINDING-P0-01

| | |
|---|---|
| **ID** | FINDING-P0-01 |
| **Severity** | INFO |
| **Area** | API Contract |
| **Current State** | `UpdateProductInput` is missing `productTypeId`, `gtin`, `ean`, `mpn`, and `updatedAt` |
| **Evidence** | `catalog.service.ts` L2510-2522 |
| **Risk** | P1/P2 must add these fields — this is expected and planned |
| **Recommendation** | P1 adds `updatedAt`; P2 adds `productTypeId`, `gtin`, `ean`, `mpn` |
| **Blocking?** | NO — this is the planned starting point |

### FINDING-P0-02

| | |
|---|---|
| **ID** | FINDING-P0-02 |
| **Severity** | INFO |
| **Area** | Variant Lifecycle |
| **Current State** | Variant deletion is hard-delete only; no deactivate/reactivate operation exists |
| **Evidence** | `bulkVariantOperations` L1394+ uses `DELETE FROM` |
| **Risk** | BD-07 requires non-destructive deletion — P5/P7 must implement |
| **Recommendation** | P5 adds `isActive` toggle and deactivation action |
| **Blocking?** | NO — planned for P5/P7 |

### FINDING-P0-03

| | |
|---|---|
| **ID** | FINDING-P0-03 |
| **Severity** | INFO |
| **Area** | Audit Trail |
| **Current State** | Only 3 product audit events recorded: `created`, `published`, `deleted`. Missing: `updated`, `rejected`, `archived`, `restored`. No variant audit events |
| **Evidence** | `catalog.service.ts` L779, L1353, L1378 |
| **Risk** | BD-12 requires field-level auditability — P9 must implement |
| **Recommendation** | P9 extends `this.audit.record()` calls to all product/variant CRUD operations |
| **Blocking?** | NO — planned for P9 |

### FINDING-P0-04

| | |
|---|---|
| **ID** | FINDING-P0-04 |
| **Severity** | INFO |
| **Area** | Timestamp Precision |
| **Current State** | `updatedAt` uses `timestamp with time zone` (microsecond precision in PostgreSQL). JavaScript `Date` has millisecond precision. |
| **Evidence** | `catalog.schema.ts` L91: `timestamp('updated_at', { withTimezone: true })` |
| **Risk** | Theoretical collision if two updates occur within the same millisecond. Very low probability in practice. |
| **Recommendation** | P1 should use ISO string comparison for `updatedAt`. If precision issues arise, consider adding a `version` integer column later (BD-08 allows this if evidence requires) |
| **Blocking?** | NO |

## 21. P1/P2 Implementation Prerequisites

### P1 — Optimistic Locking API/Backend

| Prerequisite | Status | Notes |
|--------------|--------|-------|
| `updatedAt` column exists on products | ✅ Ready | `catalog.schema.ts` L91 |
| `updatedAt` column exists on product_variants | ✅ Ready | `catalog.schema.ts` L116 |
| `updatedAt` set on every update | ✅ Ready | L1318, L1677 |
| `ConflictException` available | ✅ Ready | Already imported in `catalog.service.ts` L4 |
| `updatedAt` returned to clients | ✅ Ready | Part of product/variant response |
| No existing optimistic locking | ✅ Confirmed | Clean starting point |

**P1 must:**
1. Add `updatedAt?: string` to `UpdateProductInput`
2. Modify `updateProduct()` to conditionally update with `WHERE updated_at = clientUpdatedAt`
3. Throw `ConflictException` on 0 rows matched
4. Same for `updateVariant()`
5. Add tests for concurrent edit → 409

### P2 — UpdateProductInput + Identifier/Type Rules

| Prerequisite | Status | Notes |
|--------------|--------|-------|
| `gtin`/`ean`/`mpn` in CreateProductInput | ✅ Ready | L2503-2506 |
| `productTypeId` in CreateProductInput | ✅ Ready | L2507 |
| `getProduct()` returns all fields | ✅ Ready | Full product row |
| Variant count query | ✅ Ready | `listVariantsByProduct()` |
| Offer count query | ✅ Ready | `merchantOffers` table queryable |
| `findProductByIdentifiers()` for dedup | ✅ Ready | L797-812 |

**P2 must:**
1. Add `productTypeId`, `gtin`, `ean`, `mpn` to `UpdateProductInput`
2. Add product type change guard (BD-06)
3. Add identifier format validation
4. Add tests

## 22. P0 Verdict

**P0 VERDICT: PASS**

| Criterion | Result |
|-----------|--------|
| Repository baseline understood | ✅ |
| Phase 3 contracts verified | ✅ 432/432 tests pass |
| Current API contracts documented | ✅ |
| Current frontend contracts documented | ✅ |
| Permission boundaries verified | ✅ 9 permissions confirmed |
| Tenant isolation verified | ✅ `assertProductInOrg` on 10 call sites |
| Lifecycle verified | ✅ DRAFT/ACTIVE/REJECTED/ARCHIVED |
| Audit infrastructure verified | ✅ AuditService exists with metadata support |
| Optimistic locking starting point verified | ✅ Clean starting point, `ConflictException` available |
| Product type relationship verified | ✅ Guard implementable with existing queries |
| Variant lifecycle starting point verified | ✅ `isActive` exists, deactivate must be added |
| Existing tests executed | ✅ 432/432 PASS |
| No unresolved critical ambiguity for P1/P2 | ✅ |
| No Phase 3 regression | ✅ 432/432 = 432/432 |

**Conditions:** None

**Blockers:** None

**Files created:**
- `docs/production/SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-4-P0-BASELINE-CONTRACT-VERIFICATION.md`

**Files modified:** None (P0 is verification only)

**Git diff summary:** No production code changes. Only the verification document was created.

---

**NEXT STEP:**
Phase 4 P1 — Optimistic Locking API/Backend
