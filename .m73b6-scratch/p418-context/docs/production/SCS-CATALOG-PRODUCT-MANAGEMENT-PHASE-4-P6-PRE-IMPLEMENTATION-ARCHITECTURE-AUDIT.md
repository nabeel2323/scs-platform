# SCS Platform — Phase 4 P6 Pre-Implementation Architecture Audit

## P6 — Merchant Product Studio Edit Mode

**Date:** 2026-10-05
**Phase:** 4 — Product Management
**Milestone:** P6 — Merchant Product Studio Edit Mode
**Audit Status:** GO WITH CONDITIONS

---

## 1. Executive Summary

This audit inspects the scs-platform codebase after Phase 4 P5 (Admin Variant Management) is formally CLOSED / PASS WITH CONDITIONS, to determine whether P6 (Merchant Product Studio Edit Mode) is ready for Business Rules + Architecture Lock.

**Current baseline:**
- Branch: `develop`
- HEAD: `61990f1` (P5 implementation committed)
- Latest migration: `0053_attribute_backfill.sql`
- Migration 0054: DOES NOT EXIST
- P5: CLOSED / PASS WITH CONDITIONS

**P6 objective:**
Enable merchants to safely edit their own canonical product listings through the existing Merchant Product Studio while preserving the canonical-vs-offer boundary.

**Key findings:**

- **Product Studio currently supports CREATE only, not EDIT.** The wizard at `/merchant/product-studio` creates new products but has no edit mode for existing products.
- **Merchant product ownership is ambiguous.** Products have `storeId` (nullable), but the canonical-vs-offer architecture means merchants may not "own" the canonical products they sell.
- **Editing canonical products affects all merchants.** If Merchant A edits a shared canonical product, it affects Merchant B's offer.
- **No re-moderation workflow exists.** Editing an APPROVED product does not trigger re-review.
- **Import vs Product Studio race condition.** Import writes directly to products/variants without locking against Product Studio edits.
- **Optimistic locking is already implemented.** P1 optimistic locking works for product updates; P6 can reuse it.
- **Tenant isolation is strong but has edge cases.** `assertProductInOrg` prevents cross-tenant access, but products with `storeId = null` are denied.

**Verdict: GO WITH CONDITIONS** — P6 is ready for Business Rules + Architecture Lock after resolving the blocking business decisions listed in Section 21.

---

## 2. Baseline

| Item | Value |
|------|-------|
| Branch | `develop` |
| HEAD | `61990f1` |
| Latest migration | `0053_attribute_backfill.sql` |
| Migration 0054 | DOES NOT EXIST |
| Migration 0055+ | DOES NOT EXIST |
| P1 (Optimistic Locking) | CLOSED / PASS |
| P2 (Identifiers + Type Rules) | CLOSED / PASS |
| P3 (Admin Product Create/Edit) | CLOSED / PASS |
| P5 (Admin Variant Management) | CLOSED / PASS WITH CONDITIONS |
| TypeScript | 0 errors |
| Nest build | 292 files, 0 issues |

---

## 3. Current Product Studio Architecture

### 3.1 Frontend

**Location:** `apps/web/src/app/merchant/product-studio/`

**Files:**
- `page.tsx` (145 lines) — 6-step wizard shell
- `steps/StepIdentity.tsx` (229 lines) — Category, brand, product type, title, identifiers
- `steps/StepSpecifications.tsx` (198 lines) — PRODUCT-scope typed attributes
- `steps/StepVariants.tsx` (148 lines) — Variant matrix or existing variant selector
- `steps/StepOffer.tsx` (107 lines) — Merchant offer (price, MOQ, lead time)
- `steps/StepMedia.tsx` (149 lines) — Product images
- `steps/StepReview.tsx` (120 lines) — Review and submit
- `components/ProgressIndicator.tsx` (46 lines) — Step progress UI
- `components/VariantMatrix.tsx` (152 lines) — Variant combination selector
- `components/CompletenessScore.tsx` (35 lines) — Attribute completeness indicator

**Hook:** `apps/web/src/hooks/useProductStudio.ts` (280 lines)
- 6 steps: identity → specifications → variants → offer → media → review
- `handleSaveProduct()` creates product + attributes + variants + offer
- **NO load-existing-product function**
- **NO update-product function**

**Current behavior:**
- Step 1: Merchant selects store, category, brand, product type, enters title/identifiers
- Step 2: Merchant fills PRODUCT-scope attributes from product type schema
- Step 3: Merchant creates variant combinations OR selects existing variant
- Step 4: Merchant creates offer (price, MOQ, lead time, warehouse)
- Step 5: Merchant uploads images
- Step 6: Review and submit → `POST /products` + `PUT /products/:id/attribute-values` + `POST /products/:id/variants` + `POST /merchant/offers`

**Missing for P6:**
- Edit mode route (`/merchant/product-studio/:id`)
- Load existing product into wizard state
- Update product instead of create
- Update attributes instead of create
- Update variants instead of create
- Update offer instead of create
- Unsaved changes protection
- 409 conflict UX
- Moderation status handling

### 3.2 Backend

**Location:** `apps/api/src/modules/catalog/`

**Controller:** `catalog.controller.ts` (568 lines)

**Merchant product endpoints:**
```
POST   /products                              → createProduct (merchant:products:write)
PATCH  /products/:id                          → updateProduct (merchant:products:write + assertProductInOrg)
DELETE /products/:id                          → deleteProduct (merchant:products:write + assertProductInOrg)
PUT    /products/:id/attribute-values         → setProductAttributeValues (merchant:products:write + assertProductInOrg)
POST   /products/:id/variants                 → createVariant (merchant:products:write + assertProductInOrg)
PATCH  /products/:id/variants/:variantId      → updateVariant (merchant:products:write + assertProductInOrg)
PUT    /products/:id/variants/:variantId/attribute-values → setVariantAttributeValues (merchant:products:write + assertProductInOrg)
POST   /products/:id/variants/bulk            → bulkVariantOperations (merchant:products:write + assertProductInOrg)
POST   /products/:id/media                    → addMedia (merchant:products:write + assertProductInOrg)
DELETE /products/:id/media/:mediaId           → removeMedia (merchant:products:write + assertProductInOrg)
POST   /products/:id/media/reorder            → reorderMedia (merchant:products:write + assertProductInOrg)
```

**Service:** `catalog.service.ts` (2829 lines)

**Key methods:**
- `createProduct(input, userId)` — Creates product with deduplication by GTIN/EAN/MPN
- `updateProduct(id, input, clientUpdatedAt?)` — Updates product with P1 optimistic locking
- `deleteProduct(id)` — Soft delete via `deletedAt`
- `createVariant(productId, input)` — Creates variant with FOR SHARE lock
- `updateVariant(productId, variantId, input, clientUpdatedAt?)` — Updates variant with P1 optimistic locking
- `setProductAttributeValues(productId, values)` — Replaces PRODUCT-scope typed attributes
- `setVariantAttributeValues(productId, variantId, values)` — Replaces VARIANT-scope typed attributes with FOR UPDATE

**DTOs:**
```typescript
CreateProductInput {
  storeId?: string | null;
  title: string;
  titleAr?: string;
  slug?: string;
  description?: string;
  descriptionAr?: string;
  categoryId?: string;
  brandId?: string;
  condition?: string;
  images?: string[];
  gtin?: string;
  ean?: string;
  mpn?: string;
  productTypeId?: string;
}

UpdateProductInput {
  title?: string;
  titleAr?: string;
  description?: string;
  descriptionAr?: string;
  status?: string;
  condition?: string;
  images?: string[];
  categoryId?: string;
  brandId?: string;
  slug?: string;
  metadata?: Record<string, unknown>;
  updatedAt?: string;  // P1 optimistic locking
  productTypeId?: string | null;  // P2
  gtin?: string | null;  // P2
  ean?: string | null;  // P2
  mpn?: string | null;  // P2
}
```

**Observation:** Backend already supports product editing. The missing piece is the frontend edit mode.

---

## 4. Current Merchant Ownership Model

### 4.1 Product Ownership

**Schema:** `products.storeId` (nullable UUID → stores.id)

**Ownership rules:**
- Products created by Product Studio have `storeId` set to the merchant's store
- Products created by import have `storeId` set to the importing store
- Products with `storeId = null` are platform-shared canonical products (Phase 7 deduplication)
- Merchant offers reference `productId` and `storeId` separately

**Tenant isolation:** `assertProductInOrg(db, caller, productId)`
- Looks up `product.storeId`
- If `storeId` is null → **DENIES access** (even for the merchant's own products)
- If `storeId` is set → checks `store.orgId === caller.activeOrg`
- ADMIN/MODERATOR/SUPER_ADMIN bypass the check

**Critical finding:** Products with `storeId = null` cannot be edited by merchants, even if they created them. This is a latent defect for Phase 7 deduplicated products.

### 4.2 Canonical vs Merchant Offer

**Canonical product (WHAT you sell):**
- `products` table — shared across all merchants
- `product_variants` table — shared across all merchants
- `product_attribute_values` table — shared across all merchants
- `variant_attribute_values` table — shared across all merchants
- `product_media` table — shared across all merchants

**Merchant offer (HOW you sell it):**
- `merchant_offers` table — one per merchant per product/variant
- `price_lists` / `price_tiers` — merchant-specific pricing
- `inventory_items` — merchant-specific stock
- `warehouses` — merchant-specific fulfillment

**Boundary:** P5 established that admin variant management operates ONLY on canonical tables. P6 must preserve this boundary.

### 4.3 Merchant Product Relationship

**Current state:**
- Merchant creates product → `products.storeId = merchant's store` → merchant "owns" the canonical product
- Merchant attaches offer → `merchant_offers.productId + storeId` → merchant sells the product
- Merchant finds existing product by GTIN/EAN/MPN → attaches offer to shared canonical product

**Ambiguity:** When a merchant attaches an offer to a shared canonical product, do they gain editing rights? The current code says NO (`assertProductInOrg` denies access if `storeId` doesn't match).

---

## 5. Canonical-vs-Offer Analysis

### 5.1 What P6 Can Mutate

**Canonical tables (shared across merchants):**
- `products` — title, description, attributes, images, identifiers
- `product_variants` — SKU, barcode, title, unit, weight, dimensions
- `product_attribute_values` — PRODUCT-scope typed attributes
- `variant_attribute_values` — VARIANT-scope typed attributes
- `product_media` — product images

**Merchant tables (per merchant):**
- `merchant_offers` — price, MOQ, lead time, warehouse, availability
- `price_lists` / `price_tiers` — tier pricing
- `inventory_items` — stock quantities

### 5.2 Operations That Affect Other Merchants

**If Merchant A edits a shared canonical product:**
- Title change → affects all merchants selling the product
- Description change → affects all merchants
- Attribute change → affects search facets, filters, variant matching
- Image change → affects all merchants
- Variant change → affects all merchants (SKU, barcode, attributes)
- Category change → affects search visibility for all merchants
- Brand change → affects brand association for all merchants
- Product type change → affects attribute schema for all merchants

**If Merchant A edits their own offer:**
- Price change → affects only Merchant A
- MOQ change → affects only Merchant A
- Stock change → affects only Merchant A
- Lead time change → affects only Merchant A

### 5.3 P6 Boundary Rule

**P6 MUST NOT introduce accidental coupling.**

P6 operations on canonical products must:
- Only mutate canonical tables (`products`, `product_variants`, `product_attribute_values`, `variant_attribute_values`, `product_media`)
- Never mutate merchant-specific tables (`merchant_offers`, `price_lists`, `inventory_items`)
- Preserve the canonical-vs-offer boundary established by P5

---

## 6. Field-Level Editability Matrix

### 6.1 Product Fields

| Field | Merchant Editable | Admin Editable | Immutable | Requires Moderation | Scope | Reason |
|-------|-------------------|----------------|-----------|---------------------|-------|--------|
| `title` | YES (own products) | YES | NO | NO | Canonical | Merchant-owned canonical data |
| `titleAr` | YES (own products) | YES | NO | NO | Canonical | Arabic twin |
| `description` | YES (own products) | YES | NO | NO | Canonical | Merchant-owned canonical data |
| `descriptionAr` | YES (own products) | YES | NO | NO | Canonical | Arabic twin |
| `slug` | YES (own products) | YES | NO | NO | Canonical | URL identifier, uniqueness enforced |
| `condition` | YES (own products) | YES | NO | NO | Canonical | NEW/USED/REFURBISHED |
| `categoryId` | YES (own products) | YES | NO | MAYBE | Canonical | Affects search/taxonomy |
| `brandId` | YES (own products) | YES | NO | MAYBE | Canonical | Affects brand association |
| `productTypeId` | NO | YES | NO | NO | Canonical | P2: blocked when variants/offers exist |
| `gtin` | YES (own products) | YES | NO | NO | Canonical | P2: uniqueness enforced |
| `ean` | YES (own products) | YES | NO | NO | Canonical | P2: uniqueness enforced |
| `mpn` | YES (own products) | YES | NO | NO | Canonical | P2: not unique |
| `images` | YES (own products) | YES | NO | NO | Canonical | JSONB array |
| `status` | NO | YES | NO | NO | Canonical | Controlled by moderation |
| `storeId` | NO | NO | YES | NO | Canonical | Set at creation, immutable |
| `moq` | NO | NO | NO | NO | Legacy | Offer-owned (deprecated on product) |
| `isAvailable` | NO | NO | NO | NO | Legacy | Offer-owned (deprecated on product) |

### 6.2 Attribute Fields

| Field | Merchant Editable | Admin Editable | Immutable | Requires Moderation | Scope | Reason |
|-------|-------------------|----------------|-----------|---------------------|-------|--------|
| PRODUCT-scope attributes | YES (own products) | YES | NO | NO | Canonical | Typed attribute values |
| VARIANT-scope attributes | YES (own products) | YES | NO | NO | Canonical | Typed attribute values |
| OFFER-scope attributes | YES (own offers) | YES | NO | NO | Merchant | Offer-specific data |
| JSONB attributes | NO | NO | NO | NO | Deprecated | Phase 3: never read/write |

### 6.3 Variant Fields

| Field | Merchant Editable | Admin Editable | Immutable | Requires Moderation | Scope | Reason |
|-------|-------------------|----------------|-----------|---------------------|-------|--------|
| `sku` | YES (own products) | YES | NO | NO | Canonical | Unique per product |
| `barcode` | YES (own products) | YES | NO | NO | Canonical | Optional |
| `title` | YES (own products) | YES | NO | NO | Canonical | e.g. "Large / Red" |
| `titleAr` | YES (own products) | YES | NO | NO | Canonical | Arabic twin |
| `unit` | YES (own products) | YES | NO | NO | Canonical | PCS/KG/L/BOX |
| `weightGrams` | YES (own products) | YES | NO | NO | Canonical | Numeric |
| `dimensionsMm` | YES (own products) | YES | NO | NO | Canonical | JSONB {l, w, h} |
| `isActive` | YES (own products) | YES | NO | NO | Canonical | Deactivation |
| `combinationKey` | NO | NO | NO | NO | Canonical | Auto-computed from attributes |

### 6.4 Offer Fields

| Field | Merchant Editable | Admin Editable | Immutable | Requires Moderation | Scope | Reason |
|-------|-------------------|----------------|-----------|---------------------|-------|--------|
| `basePriceMinor` | YES (own offers) | YES | NO | NO | Merchant | Offer pricing |
| `compareAtPriceMinor` | YES (own offers) | YES | NO | NO | Merchant | Reference price |
| `moq` | YES (own offers) | YES | NO | NO | Merchant | Offer-owned |
| `orderIncrement` | YES (own offers) | YES | NO | NO | Merchant | Offer-owned |
| `leadTimeDays` | YES (own offers) | YES | NO | NO | Merchant | Offer-owned |
| `isAvailable` | YES (own offers) | YES | NO | NO | Merchant | Offer-owned |
| `priceListId` | YES (own offers) | YES | NO | NO | Merchant | Pricing reference |
| `warehouseId` | YES (own offers) | YES | NO | NO | Merchant | Fulfillment source |
| `status` | NO | YES | NO | NO | Merchant | DRAFT/PROPOSED/ACTIVE/SUSPENDED |

---

## 7. Attribute Architecture

### 7.1 Typed Attribute Authority (Phase 3)

**Authoritative storage:**
- `product_attribute_values` — PRODUCT-scope attributes
- `variant_attribute_values` — VARIANT-scope attributes

**Deprecated storage:**
- `products.attributes` JSONB — NEVER read/write
- `product_variants.attributes` JSONB — NEVER read/write

**Supported attribute types:**
```
TEXT, LONG_TEXT, INTEGER, DECIMAL, BOOLEAN, DATE, DATETIME,
SELECT, MULTI_SELECT, COLOR, URL, FILE, MEASUREMENT, CURRENCY
```

**Current implementation:**
- TEXT: ✅ Implemented (valueText)
- LONG_TEXT: ✅ Implemented (valueText)
- INTEGER: ✅ Implemented (valueNumber)
- DECIMAL: ✅ Implemented (valueNumber)
- BOOLEAN: ✅ Implemented (valueBoolean)
- SELECT: ✅ Implemented (optionValue)
- MULTI_SELECT: ✅ Implemented (valueJson)
- DATE: ✅ Implemented (valueText)
- DATETIME: ✅ Implemented (valueText)
- COLOR: ✅ Implemented (valueText)
- URL: ✅ Implemented (valueText)
- FILE: ✅ Implemented (valueText)
- MEASUREMENT: ✅ Implemented (valueJson)
- CURRENCY: ✅ Implemented (valueJson)

**P6 impact:** Product Studio Step 2 already renders PRODUCT-scope attributes. P6 must reuse the same rendering for edit mode.

### 7.2 Conditional Rules

**Schema:** `product_type_attributes.conditionalRules` JSONB

**Evaluation:** `ConditionalRulesService.evaluate(rules, attributeValues, allAttrIds)`

**Effects:** `required`, `hidden`, `disabled`, `readOnly`

**Frontend:** `StepSpecifications.tsx` evaluates rules and hides/shows fields dynamically

**P6 impact:** Edit mode must re-evaluate conditional rules when loading existing attributes.

---

## 8. Variant Architecture

### 8.1 Variant Schema

```
product_variants:
  id             UUID PK
  product_id     UUID NOT NULL → products.id ON DELETE CASCADE
  sku            VARCHAR(100) NOT NULL
  barcode        VARCHAR(60)
  title          VARCHAR(300)
  title_ar       VARCHAR(300)
  unit           VARCHAR(30) NOT NULL DEFAULT 'PCS'
  weight_grams   NUMERIC(10,2)
  dimensions_mm  JSONB DEFAULT {}
  attributes     JSONB NOT NULL DEFAULT {}  [DEPRECATED]
  images         JSONB NOT NULL DEFAULT []
  is_active      BOOLEAN NOT NULL DEFAULT true
  combination_key VARCHAR(255)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Constraints:**
- UNIQUE (product_id, sku) — SKU unique per product
- Partial unique index (product_id, combination_key) WHERE combination_key IS NOT NULL — prevents duplicate variant combinations

### 8.2 Variant Operations

**Create:** `catalogService.createVariant(productId, input)`
- FOR SHARE lock on product → blocks productTypeId changes
- Validates SKU uniqueness
- Writes typed attributes via `taxonomyService.setVariantAttributeValues()`
- Computes `combination_key` from VARIANT-scope attributes

**Update:** `catalogService.updateVariant(productId, variantId, input, clientUpdatedAt?)`
- P1 optimistic locking via `updatedAt` comparison
- Rejects `attributes` field (deprecated)
- Updates typed attributes if provided

**Deactivate/Reactivate:** `catalogService.bulkVariantOperations(productId, { toggleActive: [...] })`
- Batch update `is_active` flag

**Delete:** `catalogService.bulkVariantOperations(productId, { deleteIds: [...] })`
- Scoped DELETE with product_id guard
- CASCADE to `variant_attribute_values`

### 8.3 P6 Variant Editing

**P6 must enable merchants to:**
- Edit variant scalar fields (SKU, title, barcode, unit, weight)
- Edit variant typed attributes (VARIANT-scope)
- Deactivate/reactivate variants
- Delete variants (with confirmation)

**P6 must NOT enable merchants to:**
- Change `combination_key` directly (auto-computed)
- Mutate merchant offers through variant editing

---

## 9. ProductType/Category Analysis

### 9.1 Product Type Change

**Current behavior (P2):**
```typescript
if (isProductTypeChanging) {
  // Transaction with FOR UPDATE lock
  // Guard: variant count must be 0
  // Guard: ALL merchant offers count must be 0
  // Perform update with optimistic locking
}
```

**Policy:** Product type change is BLOCKED when variants or merchant offers exist.

**P6 decision:** Merchants CANNOT change `productTypeId` through Product Studio. This is admin-only.

**Rationale:** Changing product type changes the attribute schema, which affects all variants and offers. This is too risky for merchant editing.

### 9.2 Category Change

**Current behavior:** `categoryId` is in `UpdateProductInput` — merchants can change it.

**Impact:**
- Affects search visibility
- Affects taxonomy association
- Does NOT affect variants or offers directly
- May require re-moderation (see Section 10)

**P6 decision:** Merchants CAN change `categoryId` through Product Studio, but it may trigger re-moderation.

### 9.3 Brand Change

**Current behavior:** `brandId` is in `UpdateProductInput` — merchants can change it.

**Impact:**
- Affects brand association
- Does NOT affect variants or offers directly
- May require re-moderation

**P6 decision:** Merchants CAN change `brandId` through Product Studio, but it may trigger re-moderation.

---

## 10. Moderation Analysis

### 10.1 Current Moderation Workflow

**Status values:** `DRAFT`, `ACTIVE`, `REJECTED`, `ARCHIVED`

**Moderation endpoint:** `PATCH /v1/admin/products/:id/moderate`

**Admin service:** `adminService.moderateProduct(id, decision, reason?, clientUpdatedAt?)`

**Moderation decisions:**
- `APPROVED` → status = `ACTIVE`, isAvailable = true, publishedAt = now()
- `REJECTED` → status = `REJECTED`, isAvailable = false
- `ARCHIVED` → deletedAt = now(), isAvailable = false

**Optimistic locking:** Moderation uses P1 optimistic locking (P3 remediation)

### 10.2 Merchant Editing and Moderation

**Current state:**
- Product Studio creates products as `DRAFT`
- Merchants cannot change `status` directly (not in `CreateProductInput`)
- Admin approves/rejects products
- **NO re-moderation workflow when merchant edits an APPROVED product**

**Critical gap:** If a merchant edits an APPROVED product (title, description, attributes), the changes go directly to the database without re-review. This violates the moderation model.

### 10.3 P6 Moderation Policy

**Option A: Direct mutation (current model)**
- Merchant edits go directly to database
- No re-moderation
- Risk: merchants can change approved content without review

**Option B: Draft revision model**
- Merchant edits create a draft revision
- Admin must approve the revision
- Published data remains unchanged until approval
- Complexity: requires versioning/staging system

**Option C: Re-moderation trigger**
- Merchant edits immediately apply
- Product status changes to `PENDING_REVIEW`
- Admin must re-approve
- Risk: product disappears from search during review

**Recommendation:** Option A (direct mutation) for P6, with explicit business decision that merchants can edit their own approved products without re-moderation. This is the simplest model and matches the current architecture.

**Blocking business decision:** BD-P6-09 — Does editing an approved product require re-moderation?

---

## 11. Draft/Published Analysis

### 11.1 Current Data Model

**Single data model:** No draft/published separation. Edits go directly to `products` table.

**Status field:** `DRAFT`, `ACTIVE`, `REJECTED`, `ARCHIVED`

**Published data:** Products with `status = 'ACTIVE'` are visible to buyers

### 11.2 P6 Draft/Published Policy

**Option A: Direct mutation (current model)**
- Edits apply immediately
- No versioning
- No staging
- Simple model

**Option B: Draft/published separation**
- Edits create a draft version
- Published version remains unchanged
- Admin approves draft → published
- Complexity: requires schema changes (draft columns or separate table)

**Recommendation:** Option A (direct mutation) for P6. The current architecture does not support draft/published separation, and introducing it would require a migration (which P6 should avoid if possible).

**Blocking business decision:** BD-P6-11 — Does P6 use direct mutation or draft/published separation?

---

## 12. Optimistic Locking Analysis

### 12.1 Existing Optimistic Locking (P1)

**Product update:**
```typescript
const [updated] = await this.db.db.update(products)
  .set(updates)
  .where(and(eq(products.id, id), eq(products.updatedAt, clientDate)))
  .returning();

if (!updated) {
  throw new ConflictException({
    statusCode: 409,
    message: 'CONFLICT',
    currentUpdatedAt: current['updatedAt'],
  });
}
```

**Variant update:** Same pattern

**Moderation:** Same pattern (P3 remediation)

### 12.2 P6 Concurrency Scenarios

**Required concurrency tests:**

1. **Merchant vs Merchant (same product, different tabs)**
   - Expected: Exactly 1 winner, 1 gets 409
   - Strategy: P1 optimistic locking

2. **Merchant vs Admin (merchant edits, admin moderates)**
   - Expected: Exactly 1 winner, 1 gets 409
   - Strategy: P1 optimistic locking

3. **Merchant vs Import (merchant edits, import updates)**
   - Expected: Exactly 1 winner, 1 gets 409
   - Strategy: P1 optimistic locking (import must also use it)

4. **Merchant attribute edit vs Merchant attribute edit**
   - Expected: FOR UPDATE serialization
   - Strategy: Phase 3 typed attribute locking

5. **Merchant variant edit vs Merchant variant edit**
   - Expected: Exactly 1 winner, 1 gets 409
   - Strategy: P1 optimistic locking

### 12.3 P6 Optimistic Locking Requirements

**P6 MUST:**
- Extract `updatedAt` from request body
- Pass `clientUpdatedAt` to `catalogService.updateProduct()`
- Handle 409 CONFLICT response in frontend
- Display conflict banner with Reload/Discard options
- NOT silently overwrite newer data

**P6 can reuse:**
- Existing P1 optimistic locking infrastructure
- Existing 409 conflict response contract
- Existing P3 conflict banner pattern

---

## 13. Security/RBAC/IDOR/Tenant Isolation

### 13.1 Current Security Model

**Permission:** `merchant:products:write`

**Tenant isolation:** `assertProductInOrg(db, caller, productId)`
- Checks `product.storeId → store.orgId === caller.activeOrg`
- Denies access if `storeId` is null
- ADMIN/MODERATOR/SUPER_ADMIN bypass

**IDOR protection:** All merchant endpoints use `assertProductInOrg` before operations

### 13.2 P6 Security Requirements

**RBAC:**
- P6 uses existing `merchant:products:write` permission
- No new permission required

**Tenant isolation:**
- P6 must use `assertProductInOrg` on all product mutations
- P6 must deny access to products with `storeId = null`
- P6 must deny access to products from other organizations

**IDOR protection:**
- P6 must validate `productId` belongs to merchant's store
- P6 must validate `variantId` belongs to `productId`
- P6 must validate `mediaId` belongs to `productId`

### 13.3 P6 Security Findings

| ID | Severity | Area | Current Behavior | Expected Behavior | Evidence | Risk | Recommended Resolution | Blocks? |
|----|----------|------|------------------|-------------------|----------|------|------------------------|---------|
| F6-SEC-01 | HIGH | Tenant | Products with `storeId = null` cannot be edited by merchants | Merchants should be able to edit their own products even if `storeId` is null | `assertProductInOrg` denies if `storeId` is null | Merchants cannot edit deduplicated products | Clarify business rule: are `storeId = null` products editable? | NO |
| F6-SEC-02 | MEDIUM | RBAC | No distinction between product owner and other merchants in same org | Only product owner should edit? | `assertProductInOrg` allows any merchant in same org | Multiple merchants in same org can edit each other's products | Clarify business rule: is org-level or store-level ownership? | NO |
| F6-SEC-03 | LOW | IDOR | Variant lookup not scoped to product in all endpoints | All variant operations must validate `variant.productId === productId` | Some endpoints may not validate | IDOR: merchant could edit variant from another product | Audit all variant endpoints for product scoping | NO |

---

## 14. Media Analysis

### 14.1 Current Media Architecture

**Schema:**
- `products.images` JSONB — legacy image array
- `product_media` table — rich media with metadata

**Endpoints:**
```
POST   /products/:id/media          → addMedia
DELETE /products/:id/media/:mediaId → removeMedia
POST   /products/:id/media/reorder  → reorderMedia
GET    /products/:id/media          → listMedia
```

**Media ownership:** Canonical (shared across merchants)

### 14.2 P6 Media Requirements

**P6 must enable merchants to:**
- Add images to their products
- Remove images from their products
- Reorder images
- Set alt text (English + Arabic)

**P6 must NOT enable merchants to:**
- Edit media from other merchants' products
- Delete media that doesn't belong to their product

**P3 deferred:** Media add/reorder UI was deferred. P6 can implement it.

---

## 15. Identifier Analysis

### 15.1 Current Identifier Rules (P2)

**GTIN:** `varchar(20)`, unique where not null
**EAN:** `varchar(20)`, unique where not null
**MPN:** `varchar(100)`, not unique

**Uniqueness check:**
```typescript
private async checkIdentifierUniqueness(field, value, excludeProductId, label) {
  const existing = await this.db.db.query.products.findFirst({
    where: and(eq(field, value), isNull(products.deletedAt)),
    columns: { id: true },
  });
  if (existing && existing.id !== excludeProductId) {
    throw new BadRequestException(`${label} already exists on another product`);
  }
}
```

**Slug:** `varchar(200)`, auto-generated if not provided

### 15.2 P6 Identifier Requirements

**P6 must:**
- Normalize identifiers (trim whitespace, empty → null)
- Check uniqueness before update
- Reject duplicate GTIN/EAN
- Allow duplicate MPN
- Auto-generate slug if changed

**P6 must NOT:**
- Allow merchants to change identifiers on shared canonical products (if they don't own it)
- Bypass uniqueness checks

---

## 16. Import/Export Interaction

### 16.1 Current Import Architecture

**Import flow:**
1. Merchant uploads Excel file
2. `CatalogService.createImportJob()` creates job record
3. Merchant maps columns
4. `CatalogService.processImportJob()` executes import
5. `importRow()` finds or creates products/variants

**Import writes:**
- `products` table — title, description, category, brand
- `product_variants` table — SKU, barcode, title, unit
- `price_lists` / `price_tiers` — base price
- `inventory_items` — stock (if 'stock' column present)

### 16.2 Import vs Product Studio Race Condition

**Scenario:** Merchant edits product in Product Studio while import is running.

**Current state:**
- Import does NOT use optimistic locking
- Import does NOT check `updatedAt`
- Import writes directly to database

**Risk:** Import could overwrite Product Studio edits, or vice versa.

**P6 requirement:** Import must also use optimistic locking, OR import must run in a transaction that locks the product row.

**Finding:** This is a pre-existing defect, not introduced by P6. P6 should document it but not fix it (out of scope).

---

## 17. Audit/History

### 17.1 Current Audit System

**Schema:** `audit_logs` table

**Service:** `AuditService.record(entry)`

**Fields:**
- `actorType` — MERCHANT, ADMIN, SYSTEM
- `actorId` — user ID
- `action` — e.g. "product.published"
- `resource` — e.g. "product"
- `resourceId` — product ID
- `metadata` — JSONB with context

**Current audit events:**
- `product.published` — when status changes to ACTIVE
- `product.created` — when product is created (not implemented?)
- `product.updated` — when product is updated (not implemented?)

### 17.2 P6 Audit Requirements

**P6 must:**
- Record `product.updated` event when merchant edits product
- Record `variant.updated` event when merchant edits variant
- Record `attribute.updated` event when merchant edits attributes
- Include `fromStatus` and `toStatus` in metadata if status changes

**P6 can reuse:**
- Existing `AuditService` infrastructure
- Existing audit log schema

---

## 18. Performance

### 18.1 Current Performance Risks

**Variant matrix N+1:** Loading variants with attributes causes N+1 queries
- Severity: MEDIUM
- Status: Deferred (FINDING-14)
- P6 impact: Edit mode will load variants, so N+1 may occur

**Product loading:** Loading product with attributes, variants, media
- Severity: LOW
- P6 impact: Edit mode must load full product state

### 18.2 P6 Performance Requirements

**P6 must:**
- Load product with attributes in a single query (or batched)
- Load variants with attributes in a single query (or batched)
- Load media in a single query

**P6 must NOT:**
- Introduce new N+1 queries
- Load unnecessary data

---

## 19. Frontend UX

### 19.1 Current Product Studio UX

**Strengths:**
- 6-step wizard is clear and guided
- Step progress indicator
- Conditional rules evaluation
- Arabic RTL support (partial)

**Weaknesses:**
- No loading states
- No error handling
- No 409 conflict UX
- No unsaved changes protection
- No edit mode

### 19.2 P6 UX Requirements

**P6 must implement:**
- Edit mode route (`/merchant/product-studio/:id`)
- Load existing product into wizard state
- Loading state while fetching product
- Error handling (403, 404, 500)
- 409 conflict banner with Reload/Discard options
- Unsaved changes protection (`beforeunload`)
- Arabic RTL for all Arabic fields

**P6 can reuse:**
- Existing wizard structure
- Existing step components (with modifications)
- Existing P3 conflict banner pattern

---

## 20. Findings

### 20.1 Findings Matrix

| ID | Severity | Area | Current Behavior | Expected Behavior | Evidence | Risk | Recommended Resolution | Blocks? |
|----|----------|------|------------------|-------------------|----------|------|------------------------|---------|
| F6-01 | HIGH | Architecture | Product Studio supports CREATE only | Product Studio must support EDIT | `useProductStudio.ts` has no load/update functions | Merchants cannot edit products | Implement edit mode | NO |
| F6-02 | HIGH | Ownership | Products with `storeId = null` cannot be edited | Clarify business rule | `assertProductInOrg` denies if `storeId` is null | Deduplicated products cannot be edited | Business decision BD-P6-01 | NO |
| F6-03 | HIGH | Moderation | No re-moderation when merchant edits APPROVED product | Clarify business rule | `updateProduct()` does not trigger moderation | Merchants can change approved content | Business decision BD-P6-09 | NO |
| F6-04 | MEDIUM | Concurrency | Import does not use optimistic locking | Import must use optimistic locking or lock product row | `importRow()` writes directly | Import vs Product Studio race | Document as known limitation | NO |
| F6-05 | MEDIUM | Security | Org-level ownership allows multiple merchants in same org to edit | Clarify if store-level or org-level ownership | `assertProductInOrg` checks `store.orgId` | Multiple merchants can edit | Business decision BD-P6-01 | NO |
| F6-06 | LOW | Performance | Variant matrix N+1 | Optimize or defer | FINDING-14 from P5 | Slow variant loading | Defer (not P6 scope) | NO |
| F6-07 | LOW | UX | No unsaved changes protection | Implement `beforeunload` | P10 deferred | Users lose unsaved work | Implement in P6 | NO |

**Summary:** 0 CRITICAL, 3 HIGH, 2 MEDIUM, 2 LOW. No blockers (all HIGH findings require business decisions, not technical fixes).

---

## 21. Business Decisions

### BD-P6-01 — Merchant Ownership/Edit Authorization

**BLOCKING BUSINESS DECISION**

| Aspect | Detail |
|--------|--------|
| Question | Who can edit a canonical product through Product Studio? |
| Option A | Only the merchant who created the product (store-level ownership) |
| Option B | Any merchant in the same organization (org-level ownership) |
| Option C | Any merchant who has an offer on the product (offer-level ownership) |
| Option D | Merchants can only edit their own products; shared canonical products are admin-only |
| Current evidence | `assertProductInOrg` uses org-level ownership; products with `storeId = null` are denied |
| Impact | Determines which merchants can edit which products |
| Recommendation | Option A (store-level ownership) — simplest, matches current architecture |

### BD-P6-02 — Canonical vs Merchant-Specific Edit Boundary

**LOCKED (by P5)**

| Aspect | Detail |
|--------|--------|
| Decision | P6 operates ONLY on canonical tables (`products`, `product_variants`, `product_attribute_values`, `variant_attribute_values`, `product_media`) |
| Rationale | P5 established canonical-vs-offer boundary |
| Consequence | P6 MUST NOT mutate `merchant_offers`, `price_lists`, `inventory_items` |

### BD-P6-03 — Editable Product Fields

**PROPOSED**

| Aspect | Detail |
|--------|--------|
| Decision | Merchants can edit: title, titleAr, description, descriptionAr, slug, condition, categoryId, brandId, gtin, ean, mpn, images |
| Rationale | These are merchant-owned canonical data |
| Consequence | Merchants can change product identity, classification, identifiers |

### BD-P6-04 — Immutable Product Fields

**PROPOSED**

| Aspect | Detail |
|--------|--------|
| Decision | Merchants CANNOT edit: storeId, status, productTypeId |
| Rationale | `storeId` is set at creation; `status` is controlled by moderation; `productTypeId` is blocked when variants/offers exist |
| Consequence | Merchants cannot transfer ownership, publish, or change product type |

### BD-P6-05 — ProductType Change Policy

**LOCKED (by P2)**

| Aspect | Detail |
|--------|--------|
| Decision | Merchants CANNOT change `productTypeId` through Product Studio |
| Rationale | Changing product type changes attribute schema, affects all variants/offers |
| Consequence | Product type change is admin-only |

### BD-P6-06 — Category Change Policy

**PROPOSED**

| Aspect | Detail |
|--------|--------|
| Decision | Merchants CAN change `categoryId` through Product Studio |
| Rationale | Category is merchant-owned canonical data |
| Condition | May trigger re-moderation (see BD-P6-09) |
| Consequence | Merchants can move products between categories |

### BD-P6-07 — Attribute Editing Policy

**PROPOSED**

| Aspect | Detail |
|--------|--------|
| Decision | Merchants can edit PRODUCT-scope and VARIANT-scope typed attributes |
| Rationale | Attributes are merchant-owned canonical data |
| Constraint | Must use typed attribute tables, NOT JSONB |
| Consequence | Merchants can change product specifications and variant attributes |

### BD-P6-08 — Variant Editing Policy

**PROPOSED**

| Aspect | Detail |
|--------|--------|
| Decision | Merchants can edit variant scalar fields and typed attributes |
| Rationale | Variants are part of canonical product data |
| Constraint | Must use P1 optimistic locking |
| Consequence | Merchants can change SKU, title, barcode, unit, weight, attributes |

### BD-P6-09 — Published Product Editing Policy

**BLOCKING BUSINESS DECISION**

| Aspect | Detail |
|--------|--------|
| Question | Does editing an APPROVED (ACTIVE) product require re-moderation? |
| Option A | No re-moderation — edits apply immediately |
| Option B | Re-moderation required — edits change status to PENDING_REVIEW |
| Option C | Draft revision — edits create draft, published remains unchanged |
| Current evidence | No re-moderation workflow exists; `updateProduct()` does not trigger moderation |
| Impact | Determines whether merchants can change approved content without review |
| Recommendation | Option A (no re-moderation) — simplest, matches current architecture |

### BD-P6-10 — Moderation After Edit

**PROPOSED (depends on BD-P6-09)**

| Aspect | Detail |
|--------|--------|
| Decision | If BD-P6-09 = Option A: no moderation after edit |
| Decision | If BD-P6-09 = Option B: status changes to PENDING_REVIEW after edit |
| Decision | If BD-P6-09 = Option C: edits go to draft, no moderation until publish |
| Consequence | Depends on BD-P6-09 |

### BD-P6-11 — Draft vs Published Data

**BLOCKING BUSINESS DECISION**

| Aspect | Detail |
|--------|--------|
| Question | Does P6 use direct mutation or draft/published separation? |
| Option A | Direct mutation — edits apply immediately |
| Option B | Draft/published separation — edits create draft version |
| Current evidence | Single data model, no draft/published separation |
| Impact | Determines schema complexity and migration requirements |
| Recommendation | Option A (direct mutation) — no migration required |

### BD-P6-12 — Optimistic Locking

**LOCKED (by P1)**

| Aspect | Detail |
|--------|--------|
| Decision | P6 MUST use P1 optimistic locking for all product/variant edits |
| Mechanism | `updatedAt` timestamp comparison → 409 CONFLICT on mismatch |
| Rationale | P1 established optimistic locking as mandatory architectural rule |
| Consequence | Frontend must handle 409 responses |

### BD-P6-13 — Media Policy

**PROPOSED**

| Aspect | Detail |
|--------|--------|
| Decision | Merchants can add, remove, reorder media for their own products |
| Rationale | Media is part of canonical product data |
| Constraint | Must validate media belongs to product |
| Consequence | Merchants can manage product images |

### BD-P6-14 — Identifier Policy

**LOCKED (by P2)**

| Aspect | Detail |
|--------|--------|
| Decision | Merchants can edit GTIN, EAN, MPN with uniqueness enforcement |
| Rationale | P2 established identifier rules |
| Constraint | GTIN/EAN uniqueness checked; MPN not unique |
| Consequence | Merchants can change product identifiers |

### BD-P6-15 — Import vs Product Studio Conflict Policy

**PROPOSED**

| Aspect | Detail |
|--------|--------|
| Decision | Import and Product Studio both use optimistic locking |
| Current state | Import does NOT use optimistic locking (defect) |
| Recommendation | Document as known limitation; fix in future milestone |
| Consequence | Race condition possible between import and Product Studio |

### BD-P6-16 — Audit/History Policy

**PROPOSED**

| Aspect | Detail |
|--------|--------|
| Decision | P6 must record audit events for product/variant/attribute edits |
| Rationale | Audit trail is mandatory for compliance |
| Implementation | Reuse existing `AuditService` |
| Consequence | All edits logged |

### BD-P6-17 — Cross-Tenant Security Policy

**LOCKED (by existing architecture)**

| Aspect | Detail |
|--------|--------|
| Decision | P6 MUST use `assertProductInOrg` for all product mutations |
| Rationale | Tenant isolation is mandatory |
| Constraint | Deny access if `storeId` is null or doesn't match |
| Consequence | Merchants can only edit their own products |

### BD-P6-18 — Migration Policy

**PROPOSED**

| Aspect | Detail |
|--------|--------|
| Decision | P6 does NOT require a database migration |
| Rationale | All required tables/columns already exist |
| Consequence | P6 is a pure frontend + endpoint milestone |

---

## 22. Proposed API Contract

### 22.1 Frontend Routes

| Route | Purpose | Status |
|-------|---------|--------|
| `/merchant/product-studio` | Create wizard | EXISTING |
| `/merchant/product-studio/:id` | Edit mode | P6 MUST ADD |

### 22.2 Backend Endpoints

**P6 reuses existing endpoints:**
```
GET    /products/:id                          → getProduct (no permission required)
PATCH  /products/:id                          → updateProduct (merchant:products:write + assertProductInOrg)
PUT    /products/:id/attribute-values         → setProductAttributeValues (merchant:products:write + assertProductInOrg)
POST   /products/:id/variants                 → createVariant (merchant:products:write + assertProductInOrg)
PATCH  /products/:id/variants/:variantId      → updateVariant (merchant:products:write + assertProductInOrg)
PUT    /products/:id/variants/:variantId/attribute-values → setVariantAttributeValues (merchant:products:write + assertProductInOrg)
POST   /products/:id/variants/bulk            → bulkVariantOperations (merchant:products:write + assertProductInOrg)
POST   /products/:id/media                    → addMedia (merchant:products:write + assertProductInOrg)
DELETE /products/:id/media/:mediaId           → removeMedia (merchant:products:write + assertProductInOrg)
POST   /products/:id/media/reorder            → reorderMedia (merchant:products:write + assertProductInOrg)
```

**No new backend endpoints required.**

### 22.3 Frontend API Calls

**Edit mode initialization:**
```typescript
// Load product
const product = await fetchProduct(productId);

// Load attributes
const attributes = await fetchProductAttributeValues(productId);

// Load variants
const variants = await fetchProductVariants(productId);

// Load variant attributes
for (const variant of variants) {
  variant.attributes = await fetchVariantAttributeValues(productId, variant.id);
}

// Load media
const media = await fetchProductMedia(productId);
```

**Edit mode save:**
```typescript
// Update product
await updateProduct(productId, { ...productData, updatedAt: product.updatedAt });

// Update attributes
await upsertProductAttributeValues(productId, attributeValues);

// Update variants
for (const variant of variantsToUpdate) {
  await updateVariant(productId, variant.id, { ...variantData, updatedAt: variant.updatedAt });
}

// Update variant attributes
await upsertVariantAttributeValues(productId, variantId, variantAttributeValues);
```

---

## 23. Database/Migration Analysis

### 23.1 Schema Sufficiency

**NO MIGRATION REQUIRED FOR P6.**

All required tables, columns, indexes, and constraints already exist:
- `products` — full product schema with `updatedAt` for optimistic locking
- `product_variants` — full variant schema with `updatedAt` for optimistic locking
- `product_attribute_values` — typed PRODUCT-scope attributes (Phase 3)
- `variant_attribute_values` — typed VARIANT-scope attributes (Phase 3)
- `product_media` — rich media management
- `merchant_offers` — offer-owned data (not mutated by P6)

### 23.2 Migration Decision

- Migration 0054 is NOT planned for P6
- P6 is a pure frontend + endpoint milestone
- If implementation discovers a genuine schema requirement: **STOP and return to architecture review**

---

## 24. Test Strategy

### 24.1 Unit Tests

| Area | Coverage |
|------|----------|
| Product update | Delegation to CatalogService, assertProductInOrg |
| Variant update | Optimistic locking pass-through |
| Attribute update | Typed attribute delegation |
| Permission enforcement | merchant:products:write required |
| Tenant isolation | assertProductInOrg enforced |

### 24.2 PostgreSQL Integration Tests (Testcontainers)

| Area | Coverage |
|------|----------|
| Product edit | Update with optimistic locking |
| Variant edit | Update with optimistic locking |
| Attribute edit | FOR UPDATE serialization |
| Stale update → 409 | Conflict detection |
| Combination key uniqueness | Duplicate prevention |

### 24.3 Concurrency Tests (MANDATORY)

| Test | Iterations | Expected |
|------|-----------|----------|
| Merchant vs Merchant product edit | 50 | 0 double-success |
| Merchant vs Admin product edit | 50 | 0 double-success |
| Merchant vs Moderation | 50 | 0 double-success |
| Merchant attribute edit vs Merchant attribute edit | 50 | 0 lost updates |
| Merchant variant edit vs Merchant variant edit | 50 | 0 double-success |

### 24.4 Security Tests

| Area | Coverage |
|------|----------|
| RBAC | merchant:products:write enforcement |
| IDOR | Product scoped to store |
| Tenant isolation | Cross-org access denied |
| Store-level ownership | Only product owner can edit |

### 24.5 Regression Tests

| Suite | Expected |
|-------|----------|
| P1 unit | 12/12 PASS |
| P1 PostgreSQL | 13/13 PASS |
| P2 unit | 28/28 PASS |
| P2 PostgreSQL | 27/27 PASS |
| P3 unit | 91/91 PASS |
| P3 PostgreSQL | 69/69 PASS |
| P5 unit | 13/13 PASS |
| P5 PostgreSQL | 139/139 PASS |
| Phase 3 typed attribute authority | All PASS |
| Catalog unit | All PASS |
| Catalog import | All PASS |

### 24.6 Build

| Check | Expected |
|-------|----------|
| API TypeScript | 0 errors |
| Admin TypeScript | 0 errors |
| Web TypeScript | 0 errors |
| Nest build | PASS |
| Web build | PASS |

---

## 25. Acceptance Criteria

### 25.1 Proposed P6 Acceptance Matrix

| ID | Criterion |
|----|-----------|
| P6-01 | Merchant can edit their own product's title, titleAr, description, descriptionAr through Product Studio |
| P6-02 | Merchant can edit their own product's slug, condition, categoryId, brandId |
| P6-03 | Merchant can edit their own product's GTIN, EAN, MPN with uniqueness enforcement |
| P6-04 | Merchant can edit their own product's PRODUCT-scope typed attributes |
| P6-05 | Merchant can edit their own product's variants (SKU, title, barcode, unit, weight) |
| P6-06 | Merchant can edit their own product's VARIANT-scope typed attributes |
| P6-07 | Merchant can add, remove, reorder product images |
| P6-08 | Product edit uses P1 optimistic locking; stale edits return 409 |
| P6-09 | Variant edit uses P1 optimistic locking; stale edits return 409 |
| P6-10 | 409 conflict UX displays conflict banner with Reload and Discard options |
| P6-11 | `merchant:products:write` permission is enforced on all edit endpoints |
| P6-12 | `assertProductInOrg` is enforced on all edit endpoints |
| P6-13 | Merchant cannot edit products from other organizations |
| P6-14 | Merchant cannot edit `productTypeId` (admin-only) |
| P6-15 | Merchant cannot edit `status` (moderation-controlled) |
| P6-16 | Merchant cannot edit `storeId` (immutable) |
| P6-17 | Product Studio edit mode loads existing product into wizard state |
| P6-18 | Arabic fields render with `dir="rtl"` |
| P6-19 | Unsaved changes protection (`beforeunload`) is implemented |
| P6-20 | API TypeScript has 0 errors |
| P6-21 | Web TypeScript has 0 errors |
| P6-22 | Full regression introduces no P1/P2/P3/P5 regression |
| P6-23 | No migration 0054 is created |
| P6-24 | Concurrent merchant vs merchant edits produce exactly one winner and one 409 |
| P6-25 | Concurrent merchant vs admin edits produce exactly one winner and one 409 |
| P6-26 | Product Studio does not mutate merchant offers |
| P6-27 | Import/export compatibility remains intact |
| P6-28 | Variant `combination_key` uniqueness remains enforced |

---

## 26. Implementation Phases

### 26.1 Proposed Implementation Sequence

| Phase | Deliverable |
|-------|-------------|
| P6.0 | Baseline verification |
| P6.1 | Business Rules + Architecture Lock |
| P6.2 | Edit mode route (`/merchant/product-studio/:id`) |
| P6.3 | Load existing product into wizard state |
| P6.4 | Update product (instead of create) |
| P6.5 | Update attributes (instead of create) |
| P6.6 | Update variants (instead of create) |
| P6.7 | Update variant attributes |
| P6.8 | Media management (add, remove, reorder) |
| P6.9 | 409 conflict UX |
| P6.10 | Unsaved changes protection |
| P6.11 | Arabic RTL |
| P6.12 | Permission / security verification |
| P6.13 | Unit tests |
| P6.14 | PostgreSQL integration tests |
| P6.15 | Concurrency tests |
| P6.16 | Full regression |
| P6.17 | P6 implementation report |
| P6.18 | Independent Runtime Verification |
| P6.19 | Release Closure |

---

## 27. Release/Rollback Safety

### 27.1 Migration Safety

- P6 does NOT require a migration
- If migration is discovered during implementation: STOP and return to architecture review

### 27.2 API Compatibility

- P6 reuses existing endpoints
- No breaking changes to API contract
- Backward compatible with existing Product Studio create flow

### 27.3 Frontend/Backend Deployment Order

- Backend is already ready (endpoints exist)
- Frontend adds edit mode route
- Deployment order: backend first (no changes), then frontend

### 27.4 Rollback Strategy

- Frontend rollback: remove edit mode route
- Backend rollback: not required (no changes)
- Data rollback: not required (no schema changes)

### 27.5 Data Safety

- P6 does not mutate merchant offers
- P6 does not change canonical-vs-offer boundary
- P6 preserves P1 optimistic locking
- P6 preserves Phase 3 typed attribute authority

### 27.6 Merchant Isolation

- P6 uses `assertProductInOrg` for tenant isolation
- P6 denies access to products with `storeId = null`
- P6 denies cross-org access

### 27.7 Published-Product Safety

- P6 uses P1 optimistic locking to prevent lost updates
- P6 handles 409 conflicts gracefully
- P6 does not silently overwrite newer data

---

## 28. Deferred Scope

| Item | Target Phase |
|------|--------------|
| Product type change (admin-only) | Never (by design) |
| Draft/published separation | Future (requires migration) |
| Re-moderation workflow | Future (requires business decision) |
| Import optimistic locking | Future (pre-existing defect) |
| Variant matrix N+1 optimization | Deferred (FINDING-14) |
| Specialized attribute widgets | Deferred UX (from P3) |
| Navigation guard redesign | Deferred UX (from P3) |
| P7 Merchant Variant Editing | P7 |
| P8 Admin Product List Redesign | P8 |
| P9 Audit Trail Expansion | P9 |
| P10 Unsaved Changes in Product Studio | P10 (P6 implements basic version) |

---

## 29. GO / GO WITH CONDITIONS / BLOCKED Decision

### 29.1 Decision

**GO WITH CONDITIONS**

### 29.2 Conditions

| ID | Condition | Severity | Resolution |
|----|-----------|----------|------------|
| COND-P6-01 | BD-P6-01 (Merchant ownership) must be locked | HIGH | Business Rules Lock document |
| COND-P6-02 | BD-P6-09 (Published product editing) must be locked | HIGH | Business Rules Lock document |
| COND-P6-03 | BD-P6-11 (Draft vs published) must be locked | HIGH | Business Rules Lock document |

### 29.3 Rationale

- Backend is 100% ready — all endpoints exist
- No migration required — pure frontend + endpoint milestone
- Business rules follow P1/P2/P3/P5 patterns
- P1 optimistic locking already implemented
- Phase 3 typed attribute authority already implemented
- No blocking technical defects (all HIGH findings require business decisions, not technical fixes)

### 29.4 Blocking Business Decisions

Three business decisions must be locked before implementation:

1. **BD-P6-01:** Who can edit a canonical product? (store-level vs org-level vs offer-level ownership)
2. **BD-P6-09:** Does editing an approved product require re-moderation?
3. **BD-P6-11:** Does P6 use direct mutation or draft/published separation?

These decisions cannot be made by the architect alone. They require business stakeholder approval.

---

## 30. Exact Next Gate

**PHASE 4 P6 BUSINESS RULES + ARCHITECTURE LOCK**

This audit recommends proceeding to the Business Rules + Architecture Lock step for P6. The lock document should:

1. Formalize BD-P6-01 through BD-P6-18
2. Lock the proposed acceptance criteria (P6-01 through P6-28)
3. Confirm no migration is required
4. Confirm the test strategy including concurrency tests
5. Lock the P6 scope as defined in this audit
6. Resolve the 3 blocking business decisions (BD-P6-01, BD-P6-09, BD-P6-11)

**Exact next gate:**

PHASE 4 P6 BUSINESS RULES + ARCHITECTURE LOCK

Do NOT proceed directly to P6 implementation.

---

## Document Trail

| Document | Purpose |
|----------|---------|
| SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-4-P5-RELEASE-CLOSURE.md | P5 closure (baseline) |
| SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-4-P6-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md | This document |
| SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-4-P6-BUSINESS-RULES-ARCHITECTURE-LOCK.md | Next (PENDING) |
| SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-4-P6-IMPLEMENTATION-REPORT.md | Future (PENDING) |
| SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-4-P6-INDEPENDENT-RUNTIME-VERIFICATION.md | Future (PENDING) |
| SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-4-P6-RELEASE-CLOSURE.md | Future (PENDING) |

---

**Audit completed:** 2026-10-05
**Audit status:** GO WITH CONDITIONS
**Next gate:** PHASE 4 P6 BUSINESS RULES + ARCHITECTURE LOCK
