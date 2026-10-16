# SCS Catalog Product Management — Phase 4 P3 Pre-Implementation Architecture Audit

## 1. Executive Summary

This audit inspects the scs-platform codebase after Phase 4 P1 (Optimistic Locking) and P2 (UpdateProductInput Expansion + Identifier/Type Rules) are formally CLOSED / PASS, to determine the correct P3 scope and readiness for Business Rules + Architecture Lock.

**Key findings:**

- **Backend is production-ready for P3.** All APIs needed for admin product create/edit already exist: `POST /v1/products`, `PATCH /v1/products/:id`, typed attribute endpoints, variant CRUD, media management, optimistic locking (P1), identifier editing with product-type change guard (P2).
- **Admin Console has NO product create/edit UI.** The admin product list is a read-only `ManagementPage` moderation view. The admin product detail (`ProductDetails.tsx`) shows 4 tabs (Overview, Variants, Offers, Media) with Approve/Reject/Archive buttons but zero edit capability.
- **Merchant Product Studio is create-only.** The 6-step wizard (`useProductStudio` hook) has no edit mode, no `loadProduct()`, no dynamic `[id]` route. The legacy `/merchant/catalog/product/:id` redirects to the catalog list with a comment: "Product Studio edit mode will be added in a future iteration."
- **No unsaved changes protection exists** anywhere in the application (web or admin).
- **Audit trail is incomplete.** Only `product.created`, `product.published`, and `product.deleted` are recorded. Missing: `product.updated`, `product.rejected`, `product.archived`, `product.restored`, and all variant events.
- **Optimistic locking conflict UX is absent.** Backend returns 409 with `currentUpdatedAt`, but no frontend handles this response.
- **Admin moderation does not use optimistic locking.** `admin.service.ts` `moderateProduct()` performs unconditional updates, which could overwrite concurrent merchant edits.

**Verdict: GO WITH CONDITIONS** — P3 is ready for Business Rules + Architecture Lock after resolving the decisions listed in Section 25.

---

## 2. Current Baseline

| Aspect | Value |
|--------|-------|
| Branch | `develop` |
| HEAD | `40be750` |
| Pre-P1/P2 baseline HEAD | `0549e1f` |
| Latest migration | `0053_attribute_backfill.sql` |
| Migration 0054 | Does NOT exist |
| Phase 3 | CLOSED / PASS |
| P1 | CLOSED / PASS |
| P2 | CLOSED / PASS |
| P2 unit tests | 28/28 PASS |
| P2 PostgreSQL tests | 27/27 PASS |
| P1 unit tests | 12/12 PASS |
| P1 PostgreSQL tests | 13/13 PASS |
| Catalog unit (all) | 188/188 PASS |
| Catalog import | 118/118 PASS |
| Governance roundtrip | 30/30 PASS |
| TypeScript | 0 errors |
| Nest build | 287 files |

---

## 3. Phase 4 Historical Context

### What the original Phase 4 audit identified (15 findings)

| ID | Severity | Summary | Status |
|----|----------|---------|--------|
| FINDING-01 | HIGH | productTypeId/gtin/ean/mpn not editable after creation | **RESOLVED by P2** |
| FINDING-02 | MEDIUM | VARIANT-scope attributes have no dedicated editor | OPEN — P5 |
| FINDING-03 | HIGH | No admin UI for variant management | OPEN — P5 |
| FINDING-04 | MEDIUM | Admin product list lacks search and taxonomy filters | OPEN — P8 |
| FINDING-05 | MEDIUM | Admin cannot create/edit canonical products | **P3 SCOPE** |
| FINDING-06 | HIGH | No optimistic locking on product/variant updates | **RESOLVED by P1** |
| FINDING-07 | LOW | No product change audit trail | OPEN — P9 |
| FINDING-08 | HIGH | No version/locking column on products/variants | **RESOLVED by P1** (uses updatedAt) |
| FINDING-09 | LOW | No formal i18n framework | DEFERRED |
| FINDING-10 | MEDIUM | Product reads are unguarded (intentional for buyer) | INFO |
| FINDING-11 | HIGH | Last-write-wins on product/variant field edits | **RESOLVED by P1** |
| FINDING-12 | LOW | Import center not linked from product list | OPEN — P8 |
| FINDING-13 | MEDIUM | No product change history | OPEN — P9 |
| FINDING-14 | MEDIUM | Variant matrix N+1 attribute loading | DEFERRED |
| FINDING-15 | LOW | Missing focus traps, aria attributes, unsaved changes | OPEN — P10 |

### What P1 resolved
- Optimistic locking via `updatedAt` comparison on `updateProduct()` and `updateVariant()`
- HTTP 409 CONFLICT with `currentUpdatedAt` in response body
- Backward compatible: omitting `updatedAt` preserves legacy behavior
- 12 unit + 13 PostgreSQL tests (including 10-writer and 50-writer concurrency)

### What P2 resolved
- `UpdateProductInput` expanded with `productTypeId`, `gtin`, `ean`, `mpn`
- Identifier normalization (trim, empty → null, preserve spaces/dashes/case)
- GTIN/EAN uniqueness enforcement on update (excluding self, HTTP 400)
- Product type existence validation (404 if not found)
- Product type change guard: `SELECT ... FOR UPDATE` + variant count = 0 AND offer count = 0
- `createVariant()` and `bulkVariantOperations()` protected with `SELECT ... FOR SHARE`
- Web API type alignment in `buyer-api.ts`
- 28 unit + 27 PostgreSQL tests

### What was explicitly deferred
- Formal i18n framework
- UI language switching
- Mobile product management
- GTIN deduplication UI
- Broad performance optimization
- Bulk attribute editing
- Admin product comparison
- Offer concurrency hardening (FOR SHARE on createOffer)
- Check-digit validation

---

## 4. Current Backend Architecture

### 4.1 Catalog Module Structure

```
apps/api/src/modules/catalog/
├── catalog.controller.ts          — Product/variant/attribute/media/search endpoints
├── catalog.service.ts             — Core business logic (2900+ lines)
├── catalog.schema.ts              — Drizzle schema: products, variants, media
├── catalog.taxonomy.controller.ts — Product type/attribute definition endpoints
├── catalog.taxonomy.service.ts    — Taxonomy business logic
├── catalog.taxonomy.schema.ts     — Drizzle schema: types, attributes, groups, values
├── catalog.offer.controller.ts    — Merchant offer endpoints
├── catalog.offer.service.ts       — Offer business logic
├── catalog.offer.schema.ts        — Drizzle schema: merchant_offers
├── catalog.validation-service.ts  — Validation helpers
├── conditional-rules.service.ts   — Attribute conditional rules engine
├── search.service.ts              — FTS + trigram search with facets
├── search.schema.ts               — Search-related schema helpers
├── product-card.ts                — Product card projection for listings
├── product-images.ts              — Image eligibility/count logic
└── catalog.module.ts              — DI module wiring
```

### 4.2 Product API Endpoints (after P1 + P2)

| Endpoint | Method | Auth | Permission | P1/P2 Impact |
|----------|--------|------|------------|--------------|
| `POST /v1/products` | createProduct | JWT | `merchant:products:write` | — |
| `GET /v1/stores/:storeId/products` | listProducts | JWT | — | — |
| `GET /v1/products/:id` | getProduct | JWT | — | — |
| `PATCH /v1/products/:id` | updateProduct | JWT | `merchant:products:write` + assertProductInOrg | P1: optimistic locking, P2: identifiers + type change |
| `DELETE /v1/products/:id` | deleteProduct | JWT | `merchant:products:write` + assertProductInOrg | — |
| `POST /v1/stores/:storeId/products/bulk` | bulkProductOperations | JWT | `merchant:products:write` | — |
| `GET /v1/stores/:storeId/products/export` | exportProducts | JWT | `merchant:products:write` | — |

### 4.3 Variant API Endpoints

| Endpoint | Method | Auth | Permission | P1/P2 Impact |
|----------|--------|------|------------|--------------|
| `POST /v1/products/:productId/variants` | createVariant | JWT | `merchant:products:write` | P2: FOR SHARE |
| `GET /v1/products/:productId/variants` | listVariants | JWT | — | — |
| `PATCH /v1/products/:productId/variants/:variantId` | updateVariant | JWT | `merchant:products:write` | P1: optimistic locking |
| `POST /v1/products/:productId/variants/bulk` | bulkVariantOperations | JWT | `merchant:products:write` | P2: FOR SHARE |
| `GET /v1/products/:productId/variant-matrix` | getVariantMatrix | JWT | — | — |

### 4.4 Admin Moderation Endpoints

| Endpoint | Method | Auth | Permission |
|----------|--------|------|------------|
| `POST /v1/admin/products/:id/moderate` | moderateProductPost | JWT | `admin:merchants:read` |
| `PATCH /v1/admin/products/:id/moderate` | moderateProduct | JWT | `admin:merchants:read` |
| `GET /v1/admin/products/:id/media-previews` | productMediaPreviews | JWT | `admin:merchants:read` |

### 4.5 UpdateProductInput (current, after P1 + P2)

```typescript
export interface UpdateProductInput {
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
  updatedAt?: string;           // P1 — optimistic locking
  productTypeId?: string | null; // P2 — BD-06
  gtin?: string | null;          // P2 — BD-05
  ean?: string | null;           // P2 — BD-05
  mpn?: string | null;           // P2 — BD-05
}
```

---

## 5. Current Frontend Architecture

### 5.1 Admin Console (`apps/admin`)

| Page | Route | Component | Capability |
|------|-------|-----------|------------|
| Product list | `/products` | `ManagementPage` (entity="products") | Read-only table, status/condition filters, keyboard shortcuts (j/k, a/x). No search input. No create/edit. |
| Product detail | `/products/[id]` | `ProductDetails` (451 lines) | 4 tabs (Overview, Variants, Offers, Media). Approve/Reject/Archive buttons. No edit form. |
| Category management | `/categories` | `CategoryTree` | Full CRUD, tree view, product type association |
| Brand management | `/brands` | CRUD | Full CRUD with Arabic name, logo, slug |
| Attribute management | `/attributes` | CRUD | 14 types, 3 scopes, options, search, filter |
| Product type management | `/product-types` | List + detail | Attribute tree editor, variant dimensions, publish, version |
| Catalog import | `/catalog-import` | Upload + execute | XLSX pipeline, preview, retry, error report |

**Key observation:** No `/products/new` route exists. No `/products/[id]/edit` route exists. The admin has zero product create/edit capability.

### 5.2 Web App — Merchant (`apps/web`)

| Page | Route | Component | Capability |
|------|-------|-----------|------------|
| Product Studio | `/merchant/product-studio` | 6-step wizard | Create-only. No edit mode. No `[id]` route. |
| Merchant catalog | `/merchant/catalog` | Product list | Search, category/status filters, bulk actions, CSV export. No edit links on rows. |
| Legacy redirect | `/merchant/catalog/product/:id` | Redirect component | `new` → Studio, `:id` → catalog list. Comment: "Product Studio edit mode will be added in a future iteration" |

**Key observation:** The `useProductStudio` hook has no `loadProduct()`, no `editMode` flag, no existing-product initialization. The `StudioState` includes `productId: string | null` but this is only set after creation during the wizard flow.

### 5.3 Web App — Buyer (`apps/web`)

| Page | Route | Status |
|------|-------|--------|
| Product search | `/search` | PRODUCTION-READY — FTS + trigram, facets, attribute filters |
| Product detail | `/products/:id` | PRODUCTION-READY — gallery, variant selector, offers |
| Store catalog | `/stores/:slug` | PRODUCTION-READY |
| Product comparison | `/compare` | PRODUCTION-READY |

---

## 6. Current Database Architecture

### 6.1 Products Table

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | NO | PK |
| store_id | uuid | YES | Nullable since migration 0025 |
| category_id | uuid | YES | |
| brand_id | uuid | YES | |
| slug | varchar(200) | NO | |
| title | varchar(300) | NO | |
| title_ar | varchar(300) | YES | |
| description | text | YES | |
| description_ar | text | YES | |
| status | varchar(16) | YES | DRAFT/ACTIVE/REJECTED/ARCHIVED |
| condition | varchar(16) | YES | |
| is_available | boolean | YES | |
| moq | integer | YES | |
| images | jsonb | YES | Legacy |
| attributes | jsonb | YES | Deprecated — always `{}` |
| metadata | jsonb | YES | |
| published_at | timestamptz | YES | |
| deleted_at | timestamptz | YES | Soft delete |
| created_at | timestamptz | YES | |
| updated_at | timestamptz | YES | Used for P1 optimistic locking |
| product_type_id | uuid | YES | FK to product_types |
| gtin | varchar(20) | YES | Partial unique (uq_products_gtin) |
| ean | varchar(20) | YES | Partial unique (uq_products_ean) |
| mpn | varchar(100) | YES | Not unique |

### 6.2 Product Variants Table

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| product_id | uuid | FK to products |
| sku | varchar(100) | NOT NULL |
| barcode | varchar(60) | |
| title | varchar(300) | |
| title_ar | varchar(300) | |
| unit | varchar(30) | Default PCS |
| weight_grams | numeric(10,2) | Migration 0051 |
| dimensions_mm | jsonb | |
| attributes | jsonb | Deprecated — always `{}` |
| images | jsonb | |
| is_active | boolean | Default true |
| created_at | timestamptz | |
| updated_at | timestamptz | Used for P1 optimistic locking |
| combination_key | varchar(255) | Partial unique (uq_variant_combination) |

### 6.3 Indexes

**Products:** 14 indexes including `products_pkey`, `products_store_id_slug_key`, `uq_products_gtin`, `uq_products_ean`, `idx_products_store_status_cat`, `idx_products_title_trgm`, `idx_products_mpn`, `idx_products_ptype`, `idx_products_search_title`, `idx_products_search_desc`.

**Product Variants:** 9 indexes including `product_variants_pkey`, `product_variants_product_id_sku_key`, `uq_variant_combination`, `idx_variant_product_combkey`, `idx_variants_sku_trgm`, `idx_variants_barcode_trgm`.

### 6.4 Migration Status

| Migration | Purpose | Status |
|-----------|---------|--------|
| 0051 | weight_grams INT → NUMERIC(10,2) | Applied |
| 0052 | Execution error tracking for import | Applied |
| 0053 | Attribute backfill (JSONB → typed tables) | Applied |
| 0054 | **DOES NOT EXIST** | — |

---

## 7. Product Studio Audit

### Current State

The Product Studio at `/merchant/product-studio` is a **create-only** 6-step wizard:

| Step | Component | Lines | Purpose |
|------|-----------|-------|---------|
| 1. Identity | `StepIdentity.tsx` | 229 | Title, description, category, brand, product type, identifiers, condition |
| 2. Specifications | `StepSpecifications.tsx` | 198 | PRODUCT-scope typed attributes from product type schema |
| 3. Variants | `StepVariants.tsx` | 148 | Variant matrix with `VariantMatrix` component |
| 4. Offer | `StepOffer.tsx` | 107 | Merchant offer configuration (price, MOQ, currency) |
| 5. Media | `StepMedia.tsx` | 149 | Media upload and ordering |
| 6. Review | `StepReview.tsx` | 120 | Completeness score, summary |

### Missing for P3 (Merchant Edit Mode — NOT P3 scope)

- No `/merchant/product-studio/[id]` route
- No `loadProduct(id)` in `useProductStudio` hook
- No `editMode` state flag
- No `PATCH /v1/products/:id` call path in `handleSaveProduct()`
- No conflict handling (409 response)
- No unsaved changes protection

### Assessment

The Product Studio edit mode is a significant deliverable (P6 per the lock document). It is NOT P3 scope. P3 focuses on the admin product create/edit page.

---

## 8. Admin Product Management Audit

### Current State

**Product list (`/products`):**
- Renders `<ManagementPage entity="products" />`
- Backend config (`admin-tables.ts`): supports search on `id, title, titleAr, slug, storeName, storeSlug, orgName`, filters on `status, storeId, categoryId, condition, isAvailable, hasImages, moqMin, moqMax`
- Frontend: only renders generic status/condition filters. No search input. No category tree filter. No product type filter.
- Moderation: keyboard shortcuts `a` (approve), `x` (reject)

**Product detail (`/products/[id]`):**
- `ProductDetails.tsx` (451 lines)
- 4 tabs: Overview, Variants, Offers, Media
- Overview: read-only key-value display
- Variants: read-only table via `AdminRelatedTable`
- Offers: read-only list with empty state
- Media: read-only grid
- Actions: Approve (green), Reject (red), Archive (gray) buttons
- Permission: `admin:merchants:read`
- **No edit form. No edit mode. No create route.**

### What P3 Must Deliver

1. **`/products/new` route** — Admin product creation form
2. **`/products/[id]/edit` route** — Admin product edit form
3. **Form sections:** Identity, Classification, Attributes, Variants (read-only for P3), Media, Review/Publish
4. **Optimistic locking conflict UX** — Handle 409 responses
5. **Product type change rules UI** — Explain why type can't change when variants/offers exist
6. **Permission model** — Admin create uses `catalog:products:write`; edit uses same

---

## 9. Variant Management Audit

### Current State

| Capability | Backend | Admin UI | Merchant UI |
|------------|---------|----------|-------------|
| Create | ✅ API + FOR SHARE (P2) | ❌ | ✅ Studio Step 3 |
| Edit | ✅ API + optimistic locking (P1) | ❌ | ❌ |
| Delete | ✅ API (bulk, hard delete) | ❌ | ✅ Studio (bulk) |
| Deactivate/Reactivate | ✅ API (bulk toggleActive) | ❌ | ❌ |
| List | ✅ API | ✅ Read-only tab | ✅ Studio |
| Variant matrix | ✅ API | ❌ | ✅ VariantMatrix |
| Attributes | ✅ PUT endpoint | ❌ | ✅ Via matrix |
| SKU generation | ✅ sku-utils | ❌ | ✅ Auto-generate |

### Concurrency Controls (after P1 + P2)

- `createVariant()`: `SELECT ... FOR SHARE` on product row before INSERT
- `updateVariant()`: Conditional UPDATE with `updatedAt` comparison
- `bulkVariantOperations()`: `SELECT ... FOR SHARE` before creation loop
- Attribute replacement: `SELECT ... FOR UPDATE` + DELETE/INSERT in transaction

### P3 Scope for Variants

P3 admin product editor should display variants (read-only list) but NOT manage them. Variant management (create/edit/deactivate) is P5 scope.

---

## 10. Attribute Management Audit

### Current State

| Capability | Backend | Admin UI | Merchant UI |
|------------|---------|----------|-------------|
| Attribute definitions CRUD | ✅ | ✅ `/attributes` | ❌ |
| Attribute options | ✅ | ✅ | ❌ |
| Attribute groups | ✅ | ✅ `/attribute-groups` | ❌ |
| Product type attribute assignment | ✅ | ✅ `/product-types` | ❌ |
| Product attribute values (typed) | ✅ PUT endpoint | ❌ | ✅ Studio Step 2 |
| Variant attribute values (typed) | ✅ PUT endpoint | ❌ | ✅ Via matrix |
| Conditional rules | ✅ Engine | ✅ Evaluation in Step 2 | ✅ |

### P3 Scope for Attributes

P3 admin product editor should include a typed attribute editor section that:
- Loads attributes from product type schema
- Renders appropriate input per type (TEXT, INTEGER, SELECT, etc.)
- Evaluates conditional rules
- Uses `PUT /v1/products/:id/attribute-values`
- Shows required/optional status
- Groups by `attribute_groups`

This reuses the existing backend endpoint and the pattern from `StepSpecifications.tsx`.

---

## 11. Product Lifecycle / Publishing Audit

### Current State Machine

```
         ┌──────────┐
         │  DRAFT   │ ← initial state on creation
         └────┬─────┘
              │
    ┌─────────┼─────────┐
    │         │         │
    ▼         ▼         ▼
┌────────┐ ┌──────────┐ ┌──────────┐
│ ACTIVE │ │ REJECTED │ │ ARCHIVED │
└────────┘ └──────────┘ └──────────┘
```

### Transition Rules (current implementation)

| From | To | Who | How | Validation |
|------|----|-----|-----|------------|
| — | DRAFT | Merchant, Admin | `createProduct()` | Title required |
| DRAFT | ACTIVE | Merchant | `updateProduct({ status: 'ACTIVE' })` | `validatePublish()` checks required attributes |
| DRAFT | ACTIVE | Admin | `moderateProduct(id, 'APPROVED')` | Sets status + publishedAt |
| DRAFT | REJECTED | Admin | `moderateProduct(id, 'REJECTED')` | None |
| ACTIVE | ARCHIVED | Admin | `moderateProduct(id, 'ARCHIVED')` | None |
| ACTIVE | ARCHIVED | Merchant | `bulkProductOperations('archive')` | None |
| REJECTED | DRAFT | Merchant | `updateProduct({ status: 'DRAFT' })` | None |
| Any | deleted | Merchant | `deleteProduct()` (soft delete) | None |

### Gaps Found

1. **Admin moderation does not use optimistic locking.** `moderateProduct()` in `admin.service.ts` performs unconditional `UPDATE ... WHERE id = ?`. A concurrent merchant edit could be overwritten.
2. **No audit events for moderation.** `moderateProduct()` does not call `this.audit.record()`.
3. **No ARCHIVED → DRAFT/ACTIVE restoration path in UI.** The backend supports it via `updateProduct()`, but the admin has no "Restore" button.
4. **Publish validation is server-side only.** `validatePublish()` checks product type required attributes. No frontend UI shows publish readiness.

---

## 12. Audit History Audit

### Current State

| Event | Recorded? | Where |
|-------|-----------|-------|
| `product.created` | ✅ | `catalog.service.ts` L781 |
| `product.published` | ✅ | `catalog.service.ts` L1438, L1459, L1551 |
| `product.deleted` | ✅ | `catalog.service.ts` L1576 |
| `product.updated` | ❌ | — |
| `product.rejected` | ❌ | — |
| `product.archived` | ❌ | — |
| `product.restored` | ❌ | — |
| `variant.created` | ❌ | — |
| `variant.updated` | ❌ | — |
| `variant.deactivated` | ❌ | — |
| Offer lifecycle events | ✅ | `catalog.offer.service.ts` (7 events) |

### Assessment

The audit infrastructure exists (`AuditService` with `this.audit.record()`), but product and variant CRUD operations do not fully use it. This is a P9 deliverable per the lock document. P3 should not add audit events — it should use the existing pattern and let P9 extend it.

---

## 13. Search / Filtering Audit

### Current State

| Capability | Backend | Admin Frontend | Merchant Frontend |
|------------|---------|----------------|-------------------|
| Full-text search | ✅ FTS + trigram | ❌ No search input on product list | ✅ Debounced text |
| Category filter | ✅ | ❌ Not in admin product list | ✅ Dropdown |
| Product type filter | ❌ Not in search API | ❌ | ❌ |
| Status filter | ✅ | ✅ Dropdown | ✅ Dropdown |
| Brand filter | ✅ | ❌ | ❌ |
| Identifier filter | ❌ | ❌ | ❌ |
| Pagination | ✅ Server-side | ✅ | ✅ Infinite scroll |
| Sorting | ✅ | ✅ (column config) | ❌ |

### Backend Admin Product List Config

The `admin-tables.ts` products config already supports:
- Search: `['id', 'title', 'titleAr', 'slug', 'storeName', 'storeSlug', 'orgName']`
- Filters: `status, storeId, categoryId, condition, isAvailable, hasImages, moqMin, moqMax`
- Sorts: `title, slug, storeName, status, condition, moq, imageCount, isAvailable`

**The backend is ready.** The admin frontend `ManagementPage` does not expose search or category/product-type filters for products. This is a P8 deliverable.

---

## 14. Import / Export Audit

### Current State

The catalog import module (`catalog-import.*`) is production-ready:
- XLSX upload, preview, execute, retry, error report, template download
- Handles `productTypeId`, `gtin`, `ean`, `mpn` in product data
- Writes typed attribute values (Phase 3 compatible)
- Transactional execution with error tracking (migration 0052)
- Retry functionality (HEAD `40be750` commit)

### P1/P2 Compatibility

- Import already writes `productTypeId` on product creation ✅
- Import already writes `gtin`, `ean`, `mpn` ✅
- Import writes to typed attribute tables ✅
- Import does NOT use optimistic locking on product UPDATE (existing products updated during import) — **LOW risk** since import is admin-only and not concurrent with merchant editing of the same product.

### Assessment

Import is compatible with P1/P2 changes. No changes needed for P3.

---

## 15. Canonical Deduplication Audit

### Current State

| Capability | Endpoint | Status |
|------------|----------|--------|
| Identifier match | `GET /v1/canonical/match` | ✅ PRODUCTION-READY |
| Potential duplicates | `GET /v1/canonical/duplicates` | ✅ PRODUCTION-READY |
| `findProductByIdentifiers()` | Internal service method | ✅ |
| `findPotentialDuplicates()` | Internal service method | ✅ |

### P2 Impact on Deduplication

P2 added GTIN/EAN uniqueness enforcement on update (partial unique indexes `uq_products_gtin`, `uq_products_ean`). This means:
- Creating a product with a duplicate GTIN/EAN → DB unique constraint violation → HTTP 400
- The existing dedup endpoints complement the uniqueness constraint

### Assessment

No new deduplication risks from P1/P2. GTIN deduplication UI remains deferred.

---

## 16. Concurrency Audit

### Current Concurrency Controls

| Operation | Strategy | Lock Type | Evidence |
|-----------|----------|-----------|----------|
| Product update | Optimistic locking (P1) | `WHERE updated_at = ?` | `updateProduct()` L1425 |
| Variant update | Optimistic locking (P1) | `WHERE updated_at = ?` | `updateVariant()` L1924 |
| Product type change | Pessimistic (P2) | `SELECT ... FOR UPDATE` | `updateProductWithTypeChange()` L1489 |
| Create variant | Pessimistic (P2) | `SELECT ... FOR SHARE` | `createVariant()` L1612 |
| Bulk variant create | Pessimistic (P2) | `SELECT ... FOR SHARE` | `bulkVariantOperations()` L1839 |
| Attribute replacement | Pessimistic (Phase 3) | `SELECT ... FOR UPDATE` | `setProductAttributeValues()`, `setVariantAttributeValues()` |
| Admin moderation | **NONE** | Last-write-wins | `admin.service.ts` `moderateProduct()` |

### Race Conditions Identified

| Scenario | Current Behavior | Risk | P3 Action |
|----------|-----------------|------|-----------|
| Two users edit same product | 409 CONFLICT (P1) | Safe | P3 UX must handle 409 |
| Admin moderates while merchant edits | Last-write-wins | Medium | Recommend adding optimistic locking to moderation (P3 or P9) |
| User edits product while import runs | Import uses separate path | Low | No action |
| Admin edits while merchant edits | 409 CONFLICT (P1) | Safe | P3 UX must handle 409 |
| Concurrent variant creation (5×) | All succeed (FOR SHARE compatible) | Safe | No action |
| Product type change vs variant creation | Serialized (FOR UPDATE vs FOR SHARE) | Safe | No action |

### Lock Compatibility Matrix

| Lock A | Lock B | Compatible? |
|--------|--------|-------------|
| FOR SHARE | FOR SHARE | ✅ Yes |
| FOR SHARE | FOR UPDATE | ❌ No (serialized) |
| FOR UPDATE | FOR UPDATE | ❌ No (serialized) |

---

## 17. Security / Tenant / RBAC Audit

### Current Security Controls

| Control | Status | Evidence |
|---------|--------|----------|
| JwtAuthGuard | ✅ | Class-level on CatalogController |
| PermissionsGuard | ✅ | On all write endpoints |
| `merchant:products:write` | ✅ | Product/variant CRUD |
| `admin:merchants:read` | ✅ | Admin product list + detail + moderation |
| `catalog:products:write` | ✅ | Defined in seed.ts, available for admin product create/edit |
| Organization isolation | ✅ | `assertProductInOrg()` on 10+ call sites |
| Cross-tenant protection | ✅ | Phase 3 runtime tests verified |
| Mass assignment | ✅ | `UpdateProductInput` explicitly lists allowed fields |
| IDOR prevention | ✅ | `assertProductInOrg()` before sensitive operations |
| Admin moderation auth | ✅ | `@RequirePermission('admin:merchants:read')` |

### P3 Security Considerations

1. **Admin product create** should use `catalog:products:write` (already defined in seed.ts).
2. **Admin product edit** should use `catalog:products:write` + verify product exists.
3. **Admin does NOT need `assertProductInOrg()`** — admins operate across all orgs by design.
4. **Merchant product edit** continues to use `merchant:products:write` + `assertProductInOrg()`.
5. **No new permissions need to be created** — existing permissions are sufficient.

### Assessment

Security posture is strong. P3 must maintain authorization-before-sensitive-operation ordering. No IDOR risks identified for P3 candidate operations.

---

## 18. API / Frontend Contract Audit

### Backend-to-Frontend Type Alignment

| Type | Backend (`catalog.service.ts`) | Frontend (`buyer-api.ts`) | Match? |
|------|-------------------------------|---------------------------|--------|
| UpdateProductInput | 15 fields (incl. P1 + P2) | 15 fields (incl. P1 + P2) | ✅ |
| CreateProductInput | 12 fields | 12 fields | ✅ |
| CreateVariantInput | 8 fields | 8 fields | ✅ |

### Missing Frontend Types

| Type | Needed By | Status |
|------|-----------|--------|
| Admin product create form data | P3 | Must be created |
| Admin product edit form data | P3 | Must be created |
| 409 Conflict response type | P3 | Must be created: `{ statusCode: 409, message: 'CONFLICT', currentUpdatedAt: string }` |
| Product audit history entry | P9 | Deferred |

### Error Response Contracts

| Scenario | Backend Response | Frontend Handling |
|----------|-----------------|-------------------|
| Product not found | 404 `{ statusCode: 404, message: '...' }` | ❌ Not handled in admin |
| Optimistic lock conflict | 409 `{ statusCode: 409, message: 'CONFLICT', currentUpdatedAt: '...' }` | ❌ Not handled anywhere |
| Permission denied | 403 `{ statusCode: 403, message: 'Forbidden' }` | ✅ `useRequirePerms` in admin |
| Identifier duplicate | 400 `{ statusCode: 400, message: '...already exists...' }` | ❌ Not handled in admin |
| Product type change blocked | 400 `{ statusCode: 400, message: 'Cannot change product type: ...' }` | ❌ Not handled in admin |

---

## 19. UX / Accessibility Audit

### Current State

| Aspect | Admin | Web (Merchant) |
|--------|-------|-----------------|
| Keyboard navigation | ✅ j/k on lists | ⚠️ Basic tab order |
| Focus management | ⚠️ No focus traps | ⚠️ No explicit management |
| Form labels | ✅ HTML `<label>` | ✅ `<Field>` component |
| Unsaved changes | ❌ None (except product-types dirty flag) | ❌ None |
| Conflict handling | ❌ None | ❌ None |
| Loading states | ✅ SkeletonTable, AdminLoadingSkeleton | ✅ LoadingSpinner |
| Empty states | ✅ AdminEmptyState | ✅ EmptyState |
| Error states | ✅ ErrorNotice | ✅ ErrorBanner |
| RTL/Arabic | ✅ `dir="rtl"` on Arabic fields | ✅ `dir="rtl"` on Arabic fields |
| Destructive confirmation | ✅ `window.confirm()` | ⚠️ Inconsistent |

### P3 UX Requirements

1. **Unsaved changes protection** — `beforeunload` event + route guard (P10 per lock, but should be included in P3 editor)
2. **Conflict banner** — Show 409 conflict with Reload/Cancel options
3. **Form validation** — Client-side for UX, server-side for security
4. **Arabic fields** — `dir="rtl"` on all Arabic inputs
5. **Focus management** — Focus on first error after failed save

---

## 20. Performance Audit

### Identified Concerns

| Area | Concern | Severity | Classification |
|------|---------|----------|----------------|
| Variant matrix N+1 | `getVariantMatrix()` enriches variants one-by-one | MEDIUM | Future optimization |
| Product detail cache | Redis cache (300s TTL) — invalidation on update/delete | LOW | Working |
| Search | FTS + trigram with Redis cache (120s) | LOW | Working |
| Admin product list | Server-side pagination with LIMIT/OFFSET | LOW | Standard |
| Attribute loading | `getProductTypeSchema()` — 3-4 queries per load | LOW | Acceptable for admin |

### P3 Performance Impact

P3 admin editor will add:
- Product detail load (cached) + attribute schema load + variant list load = ~5 queries
- This is acceptable for an admin editing context (not high-traffic)
- No new N+1 risks identified

---

## 21. Data Integrity Audit

### Current Integrity Controls

| Check | Mechanism | Status |
|-------|-----------|--------|
| Product slug uniqueness | `products_store_id_slug_key` partial unique | ✅ |
| GTIN uniqueness | `uq_products_gtin` partial unique (WHERE NOT NULL) | ✅ (P2) |
| EAN uniqueness | `uq_products_ean` partial unique (WHERE NOT NULL) | ✅ (P2) |
| Variant SKU uniqueness | `product_variants_product_id_sku_key` | ✅ |
| Variant combination uniqueness | `uq_variant_combination` partial unique | ✅ |
| Product type FK | `products.product_type_id` → `product_types.id` | ✅ |
| Orphaned variants | Cascade delete on `product_id` FK | ✅ |
| Orphaned attributes | Cascade delete on parent FKs | ✅ |
| Archived + active offers | No constraint — allowed | INFO |

### Assessment

Data integrity is strong. No orphan risks from P3 candidate operations. The admin editor will use the same backend endpoints that enforce these constraints.

---

## 22. Findings Matrix

| ID | Severity | Area | Current Behavior | Expected Behavior | Impact | Blocks P3? | Business Decision? | Arch Decision? |
|----|----------|------|-----------------|-------------------|--------|-----------|-------------------|----------------|
| F-01 | HIGH | Admin UI | No admin product create/edit form | Admin can create and edit canonical products | Admin cannot govern canonical products | NO — this IS P3 | BD-01, BD-02, BD-09 already locked | AD-1, AD-2 |
| F-02 | HIGH | Merchant UI | Product Studio is create-only | Merchants can edit existing products | Merchants cannot correct products | NO — P6 scope | BD-10 already locked | AD-2 |
| F-03 | HIGH | Concurrency | Admin moderation has no optimistic locking | Moderation uses optimistic locking or is documented as admin-override | Admin could overwrite merchant edits | NO — P3 or P9 | None | Locking strategy |
| F-04 | MEDIUM | Audit | Only 3 product events recorded | All lifecycle events recorded | Cannot determine who changed what | NO — P9 scope | BD-12 already locked | None |
| F-05 | MEDIUM | UX | No unsaved changes protection | Warning on navigation with dirty form | Data loss on accidental navigation | NO — included in P3 editor | None | State model |
| F-06 | MEDIUM | UX | No 409 conflict handling UI | Conflict banner with Reload/Cancel | User cannot resolve edit conflicts | NO — P3 must include | None | UX pattern |
| F-07 | MEDIUM | Admin UI | Admin product list lacks search/filters | Search + category/type filters exposed | Slow moderation workflow | NO — P8 scope | None | None |
| F-08 | MEDIUM | Variant UX | No admin variant management UI | Admin can create/edit/deactivate variants | Admin cannot manage variants for governance | NO — P5 scope | BD-07 already locked | AD-4 |
| F-09 | LOW | Import | Import product UPDATE not optimistic | Import uses optimistic locking on existing products | Theoretical conflict with concurrent merchant edit | NO — LOW risk | None | None |
| F-10 | LOW | Perf | Variant matrix N+1 attribute loading | Batch-load attributes for all variants | Slow for 50+ variants | NO — deferred | None | None |
| F-11 | LOW | a11y | Missing focus traps, aria attributes | Full a11y compliance | Poor screen reader experience | NO — deferred | None | None |
| F-12 | INFO | Security | Product reads unguarded | Intentional for buyer access | No issue | NO | None | None |

**Summary:** 3 HIGH, 5 MEDIUM, 3 LOW, 1 INFO. None block P3 — all HIGH items are either P3 scope or already have locked business rules.

---

## 23. Proposed P3 Scope

### P3 IN-SCOPE

**P3 — Admin Product Create/Edit Page**

| Item | Business Reason | Technical Reason | Migration? | API Changes? | Frontend? | Concurrency? | Security? |
|------|----------------|-----------------|------------|--------------|-----------|--------------|-----------|
| Admin product create (`/products/new`) | BD-01, BD-09: Admin can create canonical products | Backend `POST /v1/products` exists | NO | NO | YES | NO (create) | YES — `catalog:products:write` |
| Admin product edit (`/products/[id]/edit`) | BD-02, BD-09: Admin can edit canonical products | Backend `PATCH /v1/products/:id` exists with P1+P2 | NO | NO | YES | YES — 409 handling | YES — `catalog:products:write` |
| Identity form section | BD-05: Identifiers editable | All fields in UpdateProductInput | NO | NO | YES | NO | NO |
| Classification form section | BD-06: Product type change rules | Backend guard exists (P2) | NO | NO | YES | NO | NO |
| Attributes form section | Phase 3 typed attribute authority | `PUT /v1/products/:id/attribute-values` exists | NO | NO | YES | YES — FOR UPDATE | NO |
| Variants display (read-only) | BD-09: Admin can view variants | `GET /v1/products/:productId/variants` exists | NO | NO | YES | NO | NO |
| Media management section | BD-09: Admin can manage media | Media CRUD endpoints exist | NO | NO | YES | NO | NO |
| Optimistic locking conflict UX | BD-08: 409 handling | Backend returns 409 with currentUpdatedAt | NO | NO | YES | NO | NO |
| Product type change rules UI | BD-06: Explain why type can't change | Backend returns 400 with reason | NO | NO | YES | NO | NO |
| Review/publish section | BD-03, BD-11: Publish validation | `validatePublish()` exists | NO | NO | YES | NO | NO |

### Acceptance Criteria (PROPOSED — REQUIRES BUSINESS/ARCHITECTURE LOCK)

| ID | Criterion | Measurable? | Testable? |
|----|-----------|-------------|-----------|
| P3-01 | Admin can create a DRAFT canonical product through Admin Console | YES | E2E |
| P3-02 | Admin can edit an existing canonical product through Admin Console | YES | E2E |
| P3-03 | Admin product edit form shows all P2 fields (title, description, category, brand, product type, GTIN, EAN, MPN, condition, slug) | YES | Component |
| P3-04 | Admin product edit form loads and saves typed product attributes | YES | Component |
| P3-05 | Product type change shows explanation when variants/offers exist | YES | Component |
| P3-06 | Optimistic locking conflict shows 409 banner with Reload option | YES | Component |
| P3-07 | Admin can view variants (read-only) in product editor | YES | Component |
| P3-08 | Admin can manage product media (add, remove, reorder) | YES | Component |
| P3-09 | Admin publish action validates required attributes | YES | Component |
| P3-10 | Permission `catalog:products:write` enforced on admin create/edit | YES | RBAC test |
| P3-11 | Unsaved changes warning on navigation | YES | Component |
| P3-12 | Arabic fields render with `dir="rtl"` | YES | Component |
| P3-13 | TypeScript 0 errors | YES | Build |
| P3-14 | Nest build succeeds | YES | Build |
| P3-15 | No regression in existing tests | YES | Regression |

---

## 24. Out-of-Scope Items

The following are explicitly NOT P3 scope:

| Item | Reason | Target Phase |
|------|--------|--------------|
| Merchant Product Studio edit mode | Separate deliverable | P6 |
| Merchant variant editing | Depends on P6 | P7 |
| Admin variant management (create/edit/deactivate) | Separate deliverable | P5 |
| Admin product list enhancement (search/filters) | Separate deliverable | P8 |
| Audit trail expansion | Separate deliverable | P9 |
| Unsaved changes in Product Studio | Depends on P6 | P10 |
| Full accessibility audit | Deferred | Future |
| Formal i18n framework | Deferred | Future |
| Mobile product management | Deferred | Future |
| GTIN deduplication UI | Deferred | Future |
| Performance optimization | Deferred | Future |
| Offer management in admin editor | BD-09: Admin does NOT manage offers | Never (by design) |
| Import/export changes | Not needed | — |
| Shipping/payment/refund/return changes | Outside Phase 4 | — |

---

## 25. Business Decisions Required

### ALREADY LOCKED (from Phase 4 Business Rules + Architecture Lock)

| Decision | Locked Value | Reference |
|----------|-------------|-----------|
| BD-01: Who can create canonical products? | Both merchants and admins | Lock §3 |
| BD-02: Who can edit canonical products? | Both merchants and admins | Lock §3 |
| BD-03: Publishing authority | Merchant self-publish with validation; admin approve/reject/archive | Lock §3 |
| BD-04: Lifecycle states | DRAFT, ACTIVE, REJECTED, ARCHIVED (no new states) | Lock §3 |
| BD-05: Identifier editing | GTIN/EAN/MPN editable after creation | Lock §3, P2 CLOSED |
| BD-06: Product type editing | Blocked when variants or offers exist | Lock §3, P2 CLOSED |
| BD-07: Variant deletion | Non-destructive (deactivate preferred) | Lock §3 |
| BD-08: Optimistic locking | `updatedAt` comparison, 409 CONFLICT | Lock §3, P1 CLOSED |
| BD-09: Admin product management scope | Full canonical CRUD + governance | Lock §3 |
| BD-10: Merchant editor architecture | Extend Product Studio with edit mode | Lock §3 |
| BD-11: Required attribute enforcement | Warnings during edit; blocking during publish | Lock §3 |
| BD-12: Audit trail | Field-level auditability for product/variant changes | Lock §3 |

### REQUIRES BUSINESS DECISION

**NONE.** All 12 business decisions are already locked. P3 operates entirely within the locked framework.

### REQUIRES CLARIFICATION (not a new decision, but an implementation detail)

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| Q-1 | Should admin moderation use optimistic locking? | (a) Yes, add updatedAt check (b) No, admin override is intentional | (a) Yes — add to P3 or P9 |
| Q-2 | Should admin product create set initial status to DRAFT always, or allow admin to choose? | (a) Always DRAFT (b) Admin can choose DRAFT or ACTIVE | (a) Always DRAFT (per BD-01) |

---

## 26. Architecture Decisions Required

### ALREADY LOCKED (from Phase 4 Business Rules + Architecture Lock)

| Decision | Locked Value | Reference |
|----------|-------------|-----------|
| AD-1: Admin editor architecture | New `/products/:id/edit` page with tabbed sections | Lock §12 |
| AD-2: Merchant editor architecture | Extend Product Studio with edit mode | Lock §13 |
| AD-3: Attribute editor component | Separate "Attributes" tab/section | Lock §12 |
| AD-4: Variant editor architecture | Separate "Variants" tab with matrix view | Lock §12 |
| AD-5: Optimistic locking implementation | `updatedAt` comparison — no migration needed | Lock §11 |
| AD-6: State management | `useState` (consistent with existing codebase) | Lock §12 |
| AD-7: Form validation | Both client-side and server-side | Lock §12 |
| AD-8: Product list filter architecture | URL params | Lock §12 |

### REQUIRES ARCHITECTURE DECISION

**NONE new.** All architecture decisions are already locked. P3 implementation follows the locked architecture.

### IMPLEMENTATION NOTES

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Admin create route | `/products/new` (new page) | Per AD-1 |
| Admin edit route | `/products/[id]/edit` (new page) | Per AD-1 |
| Form component reuse | Create shared `ProductForm` component used by both create and edit | Avoid duplication |
| API calls | Use existing `adminRequest()` for admin API calls | Consistent with admin codebase |
| Conflict UX | Banner component with Reload and Discard options | Per BD-08 |
| Attribute editor | Reuse pattern from `StepSpecifications.tsx` (admin version) | Consistent rendering |

---

## 27. Migration Assessment

**NO MIGRATION REQUIRED.**

P3 is purely a frontend deliverable. All backend APIs already exist:
- `POST /v1/products` — admin product create
- `PATCH /v1/products/:id` — admin product edit (with P1 optimistic locking + P2 identifier/type fields)
- `PUT /v1/products/:id/attribute-values` — typed attribute write
- Media CRUD endpoints — media management
- `GET /v1/products/:id` — product detail load
- `GET /v1/products/:productId/variants` — variant list
- `GET /v1/product-types/:id/schema` — attribute schema for editor

No new tables, columns, indexes, or constraints are needed.

---

## 28. Test Strategy

### Unit Tests

| Area | Coverage |
|------|----------|
| Admin product form validation | Required fields, identifier format, type validation |
| Product type change guard UI | Variant/offer count check, explanation display |
| Conflict handling | 409 response parsing, banner rendering |
| Permission checks | `catalog:products:write` enforcement |

### PostgreSQL Integration Tests

| Area | Coverage |
|------|----------|
| Admin product create → DRAFT | Verify creation with all P2 fields |
| Admin product edit + optimistic locking | Verify 409 on conflict |
| Admin product edit + identifiers | Verify GTIN/EAN uniqueness |
| Admin product type change | Verify guard (variants/offers block) |
| Admin attribute write | Verify typed attribute replacement |

### Security Tests

| Area | Coverage |
|------|----------|
| RBAC | Admin with `catalog:products:write` can create/edit |
| RBAC | Admin without `catalog:products:write` cannot create/edit |
| Tenant isolation | N/A for admin (cross-org by design) |

### Concurrency Tests

| Area | Coverage |
|------|----------|
| Admin + merchant concurrent edit | Exactly 1 winner, 1 gets 409 |
| Two admin concurrent edits | Exactly 1 winner, 1 gets 409 |

### Regression Tests

| Suite | Expected |
|-------|----------|
| Catalog unit | 188/188 PASS |
| Catalog import | 118/118 PASS |
| Governance roundtrip | 30/30 PASS |
| P1 unit | 12/12 PASS |
| P1 PostgreSQL | 13/13 PASS |
| P2 unit | 28/28 PASS |
| P2 PostgreSQL | 27/27 PASS |

---

## 29. Proposed Acceptance Criteria

**PROPOSED — REQUIRES BUSINESS/ARCHITECTURE LOCK**

| ID | Criterion | Source |
|----|-----------|--------|
| P3-01 | Admin can create a DRAFT canonical product through Admin Console at `/products/new` | BD-01, BD-09 |
| P3-02 | Admin can edit an existing canonical product through Admin Console at `/products/[id]/edit` | BD-02, BD-09 |
| P3-03 | Admin product form includes all P2 fields: title, titleAr, description, descriptionAr, slug, condition, categoryId, brandId, productTypeId, gtin, ean, mpn | BD-05, BD-06 |
| P3-04 | Admin product form loads and saves typed product attributes via `PUT /v1/products/:id/attribute-values` | Phase 3 baseline |
| P3-05 | Product type change displays clear explanation when variants or offers exist (backend returns 400) | BD-06 |
| P3-06 | Optimistic locking conflict (409) displays banner with Reload and Discard options | BD-08 |
| P3-07 | Admin can view product variants (read-only) in product editor | BD-09 |
| P3-08 | Admin can manage product media (add, remove, reorder) | BD-09 |
| P3-09 | Admin publish action validates required attributes server-side | BD-03, BD-11 |
| P3-10 | Permission `catalog:products:write` enforced on admin create/edit routes | Section 5 |
| P3-11 | Unsaved changes warning displayed on navigation with dirty form | Section 16 |
| P3-12 | Arabic fields render with `dir="rtl"` | Section 17 |
| P3-13 | TypeScript compilation: 0 errors | Build gate |
| P3-14 | Nest build: succeeds | Build gate |
| P3-15 | Full regression suite: no regression from P1/P2 baseline | Regression gate |
| P3-16 | No migration 0054 created | Architecture constraint |
| P3-17 | Admin + merchant concurrent edit: exactly 1 winner, 1 gets 409 | Concurrency gate |

---

## 30. Risks

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|------------|
| R-01 | Admin editor form complexity exceeds estimate | MEDIUM | MEDIUM | Reuse form patterns from existing admin pages; share ProductForm between create/edit |
| R-02 | Optimistic locking UX is unfamiliar pattern | LOW | MEDIUM | Follow P1 contract exactly; 409 response is well-defined |
| R-03 | Product type change rules create confusing UX | LOW | LOW | Backend returns clear error messages; UI displays them verbatim |
| R-04 | Admin moderation overwrites merchant edits | MEDIUM | MEDIUM | Document as known limitation; address in P9 (add optimistic locking to moderation) |
| R-05 | Attribute editor complexity for 14 types | LOW | LOW | Reuse StepSpecifications pattern; admin version needs no conditional rules evaluation (server validates) |

---

## 31. GO / GO WITH CONDITIONS / NO-GO

**GO WITH CONDITIONS**

P3 (Admin Product Create/Edit Page) can proceed to Business Rules + Architecture Lock.

**Conditions:**
1. All 12 business decisions (BD-01 through BD-12) are already locked — no new decisions needed.
2. All 8 architecture decisions (AD-1 through AD-8) are already locked — no new decisions needed.
3. The two clarification questions (Q-1: moderation optimistic locking, Q-2: admin create initial status) should be addressed in the lock document but are not blockers.

**Rationale:**
- Backend is 100% ready — all APIs exist with P1 optimistic locking and P2 identifier/type rules
- No migration required — pure frontend deliverable
- Business rules are fully locked from the Phase 4 lock document
- P1 and P2 resolved all HIGH-severity backend findings from the original audit
- The remaining HIGH findings (F-01 admin create/edit) ARE the P3 scope
- No blocking defects exist

---

## 32. Recommended Next Step

**P3 BUSINESS RULES + ARCHITECTURE LOCK**

This audit recommends proceeding to the Business Rules + Architecture Lock step for P3. The lock document should:

1. Reference the already-locked BD-01 through BD-12 and AD-1 through AD-8
2. Address clarification questions Q-1 and Q-2
3. Lock the proposed acceptance criteria (P3-01 through P3-17)
4. Confirm no migration is required
5. Confirm the test strategy
6. Lock the P3 scope as defined in Section 23

**Exact next gate:**

PHASE 4 P3 BUSINESS RULES + ARCHITECTURE LOCK

Do NOT proceed directly to P3 implementation.
