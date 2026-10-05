# SCS Catalog Product Management — Phase 4 Pre-Implementation Architecture Audit

## 1. Executive Summary

This audit inspects the current scs-platform codebase to determine what exists, what is missing, and what decisions are required before implementing Phase 4 (Product Studio / Admin Product Management UX).

**Key findings:**

- The backend API is comprehensive: full product/variant CRUD, typed attribute management, variant matrix, search with facets, media management, import/export, canonical dedup, and bulk operations all exist and are tested.
- The Admin Console has **view-only** product moderation (list + detail with approve/reject/archive) but **no product create/edit form**.
- The Web App has a **create-only** Product Studio wizard (6 steps) but **no product edit mode** — the old editor was redirected.
- The buyer search page is production-quality with FTS, trigram, facets, attribute filters, sorting, pagination.
- The product lifecycle is DRAFT → ACTIVE (publish) with moderation (REJECTED, ARCHIVED). Soft-delete via `deleted_at`.
- Localization exists as parallel `*_ar` columns (name/nameAr, title/titleAr, etc.) with `dir="rtl"` on Arabic fields. No formal i18n framework.
- No optimistic locking exists on product/variant editing.
- Admin product list is titled "Product Moderation" and is read-only; it does not support creating or editing products.

**Verdict: GO WITH CONDITIONS** — Phase 4 is ready for Business Rules + Architecture Lock after resolving the business decisions listed in Section 24.

## 2. Current System Baseline

| Aspect | Value |
|--------|-------|
| Branch | `develop` |
| HEAD | `0549e1f` |
| Latest migration | `0053_attribute_backfill.sql` |
| Phase 3 status | CLOSED / PASS |
| Regression | 432/432 PASS |
| TypeScript | 0 errors |
| Build | 283 files |

### Database tables relevant to Phase 4

| Table | Purpose |
|-------|---------|
| `categories` | Materialized-path hierarchy, bilingual (name/nameAr) |
| `brands` | Platform-level, bilingual |
| `products` | Canonical products, nullable store_id, status DRAFT/ACTIVE/REJECTED/ARCHIVED |
| `product_variants` | SKUs with combination_key for uniqueness |
| `product_media` | Ordered media with variant linkage, alt text bilingual |
| `attribute_definitions` | Typed attribute catalog (14 types, 3 scopes) |
| `attribute_options` | SELECT/MULTI_SELECT option values |
| `attribute_groups` | Attribute grouping for display |
| `product_types` | Governed templates with version, variant_dimensions |
| `product_type_attributes` | Per-type attribute config (required, scope, display order, conditional rules) |
| `product_attribute_values` | Typed product-scope attribute values (Phase 3 authoritative) |
| `variant_attribute_values` | Typed variant-scope attribute values (Phase 3 authoritative) |
| `merchant_offers` | How a merchant sells (price, stock, MOQ, lead time) |
| `import_jobs` | Bulk import tracking |
| `product_sources` | Provenance tracking for canonical data |

## 3. Phase 3 Dependencies

Phase 4 depends on these Phase 3 deliverables (all verified PASS):

1. **Typed attribute authority**: `product_attribute_values` and `variant_attribute_values` are authoritative. JSONB `attributes` columns are deprecated.
2. **Typed attribute endpoints**: `PUT /v1/products/:id/attribute-values` and `PUT /v1/products/:productId/variants/:variantId/attribute-values` with full security.
3. **Variant matrix**: `GET /v1/products/:productId/variant-matrix` reads from typed tables.
4. **Concurrency protection**: `SELECT ... FOR UPDATE` in `setProductAttributeValues()` and `setVariantAttributeValues()`.
5. **Migration 0053**: Idempotent backfill from JSONB to typed tables.
6. **Import compatibility**: Phase 2 import writes to typed tables, unaffected by Phase 3.

## 4. Current Backend Capability

### 4.1 Product APIs (catalog.controller.ts)

| Endpoint | Method | Auth | Permission | Classification |
|----------|--------|------|------------|----------------|
| `POST /v1/products` | createProduct | JWT | `merchant:products:write` | **B. EXISTS BUT INCOMPLETE** — creates product, no attribute write |
| `GET /v1/stores/:storeId/products` | listProducts | JWT (none) | — | **A. EXISTS AND PRODUCTION-READY** — pagination, search, status/category filters |
| `GET /v1/products/:id` | getProduct | JWT (none) | — | **A. EXISTS AND PRODUCTION-READY** — full detail with variants, media, attributes |
| `PATCH /v1/products/:id` | updateProduct | JWT | `merchant:products:write` + `assertProductInOrg` | **A. EXISTS AND PRODUCTION-READY** — title, description, status, condition, category, brand, slug |
| `DELETE /v1/products/:id` | deleteProduct | JWT | `merchant:products:write` + `assertProductInOrg` | **A. EXISTS AND PRODUCTION-READY** — soft delete |
| `POST /v1/stores/:storeId/products/bulk` | bulkProductOperations | JWT | `merchant:products:write` | **A. EXISTS AND PRODUCTION-READY** — delete/archive/draft |
| `GET /v1/stores/:storeId/products/export` | exportProducts | JWT | `merchant:products:write` | **A. EXISTS AND PRODUCTION-READY** — CSV export |

### 4.2 Variant APIs

| Endpoint | Method | Auth | Classification |
|----------|--------|------|----------------|
| `POST /v1/products/:productId/variants` | createVariant | JWT + perm | **A. PRODUCTION-READY** — typed attribute write |
| `GET /v1/products/:productId/variants` | listVariants | JWT (none) | **A. PRODUCTION-READY** |
| `PATCH /v1/products/:productId/variants/:variantId` | updateVariant | JWT + perm | **A. PRODUCTION-READY** — rejects attributes, directs to typed endpoint |
| `POST /v1/products/:productId/variants/bulk` | bulkVariantOperations | JWT + perm | **A. PRODUCTION-READY** — create/delete/toggleActive |
| `GET /v1/products/:productId/variant-matrix` | getVariantMatrix | JWT (none) | **A. PRODUCTION-READY** — typed reads |

### 4.3 Attribute APIs

| Endpoint | Method | Auth | Classification |
|----------|--------|------|----------------|
| `PUT /v1/products/:id/attribute-values` | setProductAttributeValues | JWT + perm + org | **A. PRODUCTION-READY** |
| `PUT /v1/products/:productId/variants/:variantId/attribute-values` | setVariantAttributeValues | JWT + perm + org | **A. PRODUCTION-READY** |
| `GET /v1/attributes` | listAttributes | JWT | **A. PRODUCTION-READY** — scope/type filters |
| `POST /v1/admin/attributes` | createAttribute | JWT + perm | **A. PRODUCTION-READY** |
| `GET /v1/attributes/:id` | getAttribute | JWT | **A. PRODUCTION-READY** |
| `PATCH /v1/admin/attributes/:id` | updateAttribute | JWT + perm | **A. PRODUCTION-READY** |
| `DELETE /v1/admin/attributes/:id` | deleteAttribute | JWT + perm | **A. PRODUCTION-READY** |
| `POST /v1/admin/attributes/:id/options` | addAttributeOption | JWT + perm | **A. PRODUCTION-READY** |

### 4.4 Taxonomy / Product Type APIs (catalog.taxonomy.controller.ts)

| Endpoint | Method | Auth | Classification |
|----------|--------|------|----------------|
| `GET /v1/product-types` | listProductTypes | JWT | **A. PRODUCTION-READY** |
| `GET /v1/product-types/:id` | getProductType | JWT | **A. PRODUCTION-READY** |
| `GET /v1/product-types/:id/schema` | getProductTypeSchema | JWT | **A. PRODUCTION-READY** — returns attributes, groups, options |
| `POST /v1/admin/product-types` | createProductType | JWT + perm | **A. PRODUCTION-READY** |
| `PUT /v1/admin/product-types/:id/attributes` | setAttributes | JWT + perm | **A. PRODUCTION-READY** |
| `PUT /v1/admin/product-types/:id/variant-dimensions` | setVariantDimensions | JWT + perm | **A. PRODUCTION-READY** |
| `PATCH /v1/admin/product-types/:id/category` | updateCategory | JWT + perm | **A. PRODUCTION-READY** |
| `POST /v1/admin/product-types/:id/publish` | publish | JWT + perm | **A. PRODUCTION-READY** |
| `GET /v1/admin/product-types/:id/publish-readiness` | publishReadiness | JWT + perm | **A. PRODUCTION-READY** |
| `POST /v1/admin/product-types/:id/preview` | preview | JWT + perm | **A. PRODUCTION-READY** |
| `POST /v1/admin/product-types/:id/duplicate` | duplicate | JWT + perm | **A. PRODUCTION-READY** |
| `POST /v1/admin/product-types/:id/versions` | newVersion | JWT + perm | **A. PRODUCTION-READY** |

### 4.5 Category / Brand APIs

| Endpoint | Classification |
|----------|----------------|
| Category CRUD (POST/GET/PATCH/DELETE) | **A. PRODUCTION-READY** — tree, hierarchy, product type association |
| Brand CRUD | **A. PRODUCTION-READY** |
| `GET /v1/categories/tree` | **A. PRODUCTION-READY** |
| `GET /v1/categories/:id/products` | **A. PRODUCTION-READY** |

### 4.6 Search APIs

| Endpoint | Classification |
|----------|----------------|
| `GET /v1/search` | **A. PRODUCTION-READY** — FTS + trigram, attribute filters, pagination |
| `GET /v1/search/facets` | **A. PRODUCTION-READY** — dynamic facets by category |
| `GET /v1/search/categories` | **A. PRODUCTION-READY** |
| `GET /v1/search/brands` | **A. PRODUCTION-READY** |
| `GET /v1/canonical/match` | **A. PRODUCTION-READY** — identifier dedup |
| `GET /v1/canonical/search` | **A. PRODUCTION-READY** — free-text canonical search |

### 4.7 Media APIs

| Endpoint | Classification |
|----------|----------------|
| `POST /v1/products/:productId/media` | **A. PRODUCTION-READY** |
| `GET /v1/products/:productId/media` | **A. PRODUCTION-READY** |
| `DELETE /v1/products/:productId/media/:mediaId` | **A. PRODUCTION-READY** |
| `POST /v1/products/:productId/media/reorder` | **A. PRODUCTION-READY** |
| `POST /v1/media/presign` | **A. PRODUCTION-READY** — S3 presigned URL |

### 4.8 Import/Export APIs (catalog-import.controller.ts)

| Endpoint | Auth | Classification |
|----------|------|----------------|
| `POST /v1/admin/catalog-import/upload` | ADMIN/SUPER_ADMIN | **A. PRODUCTION-READY** — XLSX upload |
| `GET /v1/admin/catalog-import` | ADMIN/SUPER_ADMIN | **A. PRODUCTION-READY** — list jobs |
| `GET /v1/admin/catalog-import/:id` | ADMIN/SUPER_ADMIN | **A. PRODUCTION-READY** |
| `GET /v1/admin/catalog-import/:id/preview` | ADMIN/SUPER_ADMIN | **A. PRODUCTION-READY** |
| `POST /v1/admin/catalog-import/:id/execute` | ADMIN/SUPER_ADMIN | **A. PRODUCTION-READY** |
| `POST /v1/admin/catalog-import/:id/retry` | ADMIN/SUPER_ADMIN | **A. PRODUCTION-READY** |
| `GET /v1/admin/catalog-import/:id/errors` | ADMIN/SUPER_ADMIN | **A. PRODUCTION-READY** |
| `GET /v1/admin/catalog-import/:id/report` | ADMIN/SUPER_ADMIN | **A. PRODUCTION-READY** |
| `GET /v1/admin/catalog-import/template/:type` | ADMIN/SUPER_ADMIN | **A. PRODUCTION-READY** |
| `POST /v1/admin/catalog-import/export` | ADMIN/SUPER_ADMIN | **A. PRODUCTION-READY** |

### 4.9 Data Quality APIs

| Endpoint | Classification |
|----------|----------------|
| `GET /v1/admin/data-quality` | **A. PRODUCTION-READY** — metrics dashboard |
| `GET /v1/admin/corrupted-variants` | **A. PRODUCTION-READY** |
| `GET /v1/canonical/duplicates` | **A. PRODUCTION-READY** |

## 5. Current Frontend Capability

### 5.1 Admin Console (apps/admin)

| Feature | Classification | Evidence |
|---------|----------------|----------|
| Product list (moderation) | **B. EXISTS BUT INCOMPLETE** | `ManagementPage` at `/products` — read-only table with status/condition filters, keyboard shortcuts (j/k, a/x for moderation). No create/edit. |
| Product detail (moderation) | **B. EXISTS BUT INCOMPLETE** | `ProductDetails` at `/products/:id` — 4 tabs (Overview, Variants, Offers, Media). Approve/Reject/Archive buttons. No edit form. |
| Category management | **A. PRODUCTION-READY** | `/categories` — tree view + detail panel with rename, move, disable/enable, delete, product type association |
| Brand management | **A. PRODUCTION-READY** | `/brands` — full CRUD with Arabic name, logo, slug |
| Attribute management | **A. PRODUCTION-READY** | `/attributes` — full CRUD, 14 types, 3 scopes, options for SELECT/MULTI_SELECT, search, filter |
| Attribute groups | **A. PRODUCTION-READY** | `/attribute-groups` — list + create |
| Product type management | **A. PRODUCTION-READY** | `/product-types` — list + detail with attribute tree editor, variant dimension selector, publish workflow, versioning, duplication |
| Catalog import center | **A. PRODUCTION-READY** | `/catalog-import` — XLSX upload, preview, execute, retry, error report |
| Data quality dashboard | **A. PRODUCTION-READY** | `/data-quality` — metrics |
| Offers governance | **A. PRODUCTION-READY** | `/offers` — list + detail |

### 5.2 Web App — Merchant (apps/web)

| Feature | Classification | Evidence |
|---------|----------------|----------|
| Product Studio (create) | **B. EXISTS BUT INCOMPLETE** | `/merchant/product-studio` — 6-step wizard (Identity, Specifications, Variants, Offer, Media, Review). Create-only, no edit mode. |
| Merchant catalog list | **A. PRODUCTION-READY** | `/merchant/catalog` — paginated product list with search, status/category filters, bulk actions (delete/archive/draft), CSV export |
| Merchant catalog product detail | **E. MISSING** | `/merchant/catalog/product/:id` — redirects to Product Studio (new) or Catalog (existing). No edit view. |
| Merchant offers | **A. PRODUCTION-READY** | `/merchant/offers` — list with status, pricing |
| Merchant inventory | **A. PRODUCTION-READY** | `/merchant/inventory` — stock movements |
| Merchant pricing | **A. PRODUCTION-READY** | `/merchant/pricing` — tier pricing |
| Merchant import | **A. PRODUCTION-READY** | `/merchant/import` — XLSX import |

### 5.3 Web App — Buyer (apps/web)

| Feature | Classification | Evidence |
|---------|----------------|----------|
| Product search | **A. PRODUCTION-READY** | `/search` — FTS + trigram, category/brand/attribute filters, sort (price, newest, title), pagination, compare list |
| Product detail | **A. PRODUCTION-READY** | `/products/:id` — gallery, variant selector, offer comparison, add-to-cart, specs |
| Store catalog | **A. PRODUCTION-READY** | `/stores/:slug` — store product listing |
| Product comparison | **A. PRODUCTION-READY** | `/compare` — side-by-side comparison |
| Favorites | **A. PRODUCTION-READY** | `/favorites` |

### 5.4 Mobile App

| Feature | Classification | Evidence |
|---------|----------------|----------|
| Product Studio | **E. MISSING** | No product creation/editing screens found in mobile/ |
| Product browsing | **C. BACKEND ONLY** | API exists but no mobile product management UI |

## 6. Product Lifecycle Audit

### Current product status values

| Status | Meaning | How set |
|--------|---------|---------|
| `DRAFT` | Default on creation. Not visible to buyers. | `createProduct()` sets `status: 'DRAFT'` |
| `ACTIVE` | Published. Visible in search and store catalogs. | `updateProduct({ status: 'ACTIVE' })` — triggers `validatePublish()` checking required attributes |
| `REJECTED` | Admin-moderated rejection. | `moderateAdminProduct(id, 'REJECTED')` |
| `ARCHIVED` | Soft-removed. Not visible. | `moderateAdminProduct(id, 'ARCHIVED')` or `bulkProductOperations('archive')` |

### Lifecycle flow

```
createProduct() → DRAFT
                    ↓
        updateProduct({ status: 'ACTIVE' })  ← validates required attributes
                    ↓
                  ACTIVE  ← visible to buyers
                    ↓
        moderateAdminProduct('REJECTED')  ← admin action
        moderateAdminProduct('ARCHIVED')  ← admin action
        bulkProductOperations('archive')  ← merchant action
        deleteProduct()  ← soft delete (deleted_at)
```

### Canonical vs Merchant data

The architecture correctly separates:

- **Canonical product data** (WHAT): products table, variants, attributes, media, categories, brands, product types. Governed by platform admin/moderator.
- **Merchant offer data** (HOW): merchant_offers table — price, stock, MOQ, lead time, warehouse. Owned by the merchant.

`products.store_id` is nullable: canonical products have no owning store; merchant ownership is through `merchant_offers.store_id`.

## 7. Product Form Audit

### Product fields (products table)

| Field | DB Column | API (Create) | API (Update) | Frontend (Studio) | Required | Editable | Owner |
|-------|-----------|--------------|--------------|-------------------|----------|----------|-------|
| Title | `title` varchar(300) | ✅ | ✅ | ✅ Step 1 | Yes (DB NOT NULL) | Yes | Canonical |
| Title (Arabic) | `title_ar` varchar(300) | ✅ | ✅ | ✅ Step 1 | No | Yes | Canonical |
| Slug | `slug` varchar(200) | ✅ | ✅ | ✅ auto-gen | Yes (DB NOT NULL) | Yes | Canonical |
| Description | `description` text | ✅ | ✅ | ✅ Step 1 | No | Yes | Canonical |
| Description (Arabic) | `description_ar` text | ✅ | ✅ | ✅ Step 1 | No | Yes | Canonical |
| Category | `category_id` uuid | ✅ | ✅ | ✅ Step 1 | No | Yes | Canonical |
| Brand | `brand_id` uuid | ✅ | ✅ | ✅ Step 1 | No | Yes | Canonical |
| Product Type | `product_type_id` uuid | ✅ (via input) | ❌ (not in UpdateProductInput) | ✅ Step 1 | No | **No** (set at create only) | Canonical |
| GTIN | `gtin` varchar(20) | ✅ | ❌ (not in UpdateProductInput) | ✅ Step 1 | No | **No** | Canonical |
| EAN | `ean` varchar(20) | ✅ | ❌ | ✅ Step 1 | No | **No** | Canonical |
| MPN | `mpn` varchar(100) | ✅ | ❌ | ✅ Step 1 | No | **No** | Canonical |
| Condition | `condition` varchar(16) | ✅ | ✅ | ✅ Step 1 | No (default NEW) | Yes | Canonical |
| Status | `status` varchar(16) | ❌ (auto DRAFT) | ✅ | ❌ (no UI) | No (auto DRAFT) | Yes | Governance |
| Images (JSONB) | `images` jsonb | ✅ | ✅ | ❌ (uses media) | No | Yes | Legacy |
| Media | product_media table | via media APIs | via media APIs | ✅ Step 5 | No | Yes | Canonical |
| Attributes (JSONB) | `attributes` jsonb | ❌ deprecated | ❌ deprecated | ❌ | — | — | Legacy |
| Attributes (typed) | product_attribute_values | via PUT endpoint | via PUT endpoint | ✅ Step 2 | Per product type | Yes | Canonical |
| Published At | `published_at` | ❌ auto | ✅ auto on ACTIVE | ❌ | Auto | Auto | System |
| Deleted At | `deleted_at` | ❌ | via DELETE | ❌ | Auto | Auto | System |
| Metadata | `metadata` jsonb | ✅ | ✅ | ❌ | No | Yes | Canonical |

### Variant fields (product_variants table)

| Field | DB Column | API | Frontend (Studio) | Required | Editable |
|-------|-----------|-----|-------------------|----------|----------|
| SKU | `sku` varchar(100) | ✅ | ✅ Step 3 | Yes (DB NOT NULL) | Yes |
| Barcode | `barcode` varchar(60) | ✅ | ❌ | No | Yes |
| Title | `title` varchar(300) | ✅ | ✅ auto-gen | No | Yes |
| Title (Arabic) | `title_ar` varchar(300) | ✅ | ❌ | No | Yes |
| Unit | `unit` varchar(30) | ✅ | ❌ | No (default PCS) | Yes |
| Weight (grams) | `weight_grams` numeric(10,2) | ✅ | ❌ | No | Yes |
| Dimensions (mm) | `dimensions_mm` jsonb | ✅ | ❌ | No | Yes |
| Attributes (typed) | variant_attribute_values | via PUT endpoint | ✅ Step 3 (via matrix) | Per product type | Yes |
| Images | `images` jsonb / product_media | ✅ | ✅ Step 5 | No | Yes |
| Active | `is_active` boolean | ✅ | ❌ | No (default true) | Yes |
| Combination Key | `combination_key` varchar(255) | auto | auto | Auto | Auto |

### FINDING-01

| | |
|---|---|
| **ID** | FINDING-01 |
| **Severity** | HIGH |
| **Area** | Product Form |
| **Current State** | `product_type_id`, `gtin`, `ean`, `mpn` are not in `UpdateProductInput` — cannot be changed after creation |
| **Evidence** | `catalog.service.ts` L2510-2522: `UpdateProductInput` omits productTypeId, gtin, ean, mpn |
| **Risk** | Merchants cannot correct identifiers or change product type after creation |
| **Recommendation** | Add these fields to `UpdateProductInput` with appropriate validation |
| **Phase 4 Scope** | MUST HAVE |
| **Blocking?** | NO |

## 8. Attribute UX Audit

### Current state

The admin has a full attribute management UI at `/attributes`:
- Create/edit/delete attribute definitions
- 14 attribute types: TEXT, LONG_TEXT, INTEGER, DECIMAL, BOOLEAN, DATE, DATETIME, SELECT, MULTI_SELECT, COLOR, URL, FILE, MEASUREMENT, CURRENCY
- 3 scopes: PRODUCT, VARIANT, OFFER
- Options management for SELECT/MULTI_SELECT
- Bilingual labels (name/nameAr)
- Filter by scope, type, include deprecated

The Product Studio Step 2 (Specifications) renders attributes from the product type schema:
- Groups attributes by `attribute_groups`
- Evaluates conditional rules (show/hide/require)
- Renders appropriate input per type (text, number, boolean, select dropdown)
- Shows required/optional status
- Progress counter (filled/required)

### What exists for Phase 4 to consume

| Capability | Status |
|------------|--------|
| Attribute definitions CRUD | ✅ Admin UI + API |
| Attribute options (SELECT/MULTI_SELECT) | ✅ Admin UI + API |
| Attribute groups | ✅ Admin UI + API |
| Product type attribute assignment | ✅ Admin UI + API |
| Product type schema endpoint | ✅ Returns attributes, groups, options, conditional rules |
| Typed attribute write (product) | ✅ PUT endpoint |
| Typed attribute write (variant) | ✅ PUT endpoint |
| Conditional rules evaluation | ✅ Backend + frontend |
| Display ordering | ✅ `display_order` column |
| Filterable/searchable/sortable flags | ✅ `product_type_attributes` columns |
| Arabic labels | ✅ `name_ar` on definitions and options |

### FINDING-02

| | |
|---|---|
| **ID** | FINDING-02 |
| **Severity** | MEDIUM |
| **Area** | Attribute UX |
| **Current State** | Product Studio Step 2 renders PRODUCT-scope attributes only. VARIANT-scope attributes are handled implicitly through the variant matrix (Step 3) but there is no dedicated variant attribute editor |
| **Evidence** | `StepSpecifications.tsx` L46: `filter(a => a.definition?.scope === 'PRODUCT')` |
| **Risk** | Variant-scope attributes may not be editable in a dedicated UI |
| **Recommendation** | Phase 4 product editor should include a variant attribute editing section |
| **Phase 4 Scope** | MUST HAVE |
| **Blocking?** | NO |

## 9. Variant UX Audit

### Current state

| Capability | Backend | Admin UI | Web (Merchant) UI |
|------------|---------|----------|-------------------|
| Create variant | ✅ API | ❌ | ✅ Product Studio Step 3 |
| Edit variant | ✅ API | ❌ | ❌ |
| Delete variant | ✅ API (bulk) | ❌ | ✅ Product Studio (bulk) |
| List variants | ✅ API | ✅ (in ProductDetails tab) | ✅ (in Studio) |
| Variant matrix | ✅ API | ❌ | ✅ VariantMatrix component |
| Bulk variant ops | ✅ API | ❌ | ❌ |
| Variant attributes | ✅ PUT endpoint | ❌ | ✅ (via matrix) |
| SKU generation | ✅ (sku-utils) | ❌ | ✅ (auto-generate) |
| Combination uniqueness | ✅ (combination_key + partial unique index) | ❌ | ✅ (frontend) |
| Stock linkage | ✅ (via warehouse) | ❌ | ✅ (offer step) |
| Offer linkage | ✅ (merchant_offers) | ✅ (offers tab) | ✅ (offer step) |
| Image linkage | ✅ (product_media.variant_id) | ❌ | ✅ (media step) |

### FINDING-03

| | |
|---|---|
| **ID** | FINDING-03 |
| **Severity** | HIGH |
| **Area** | Variant UX |
| **Current State** | No admin UI for variant management. Admin can view variants in ProductDetails tab but cannot create/edit/delete them |
| **Evidence** | `ProductDetails.tsx` renders an "AdminRelatedTable" for variants (read-only columns) |
| **Risk** | Admins/moderators cannot manage variants for governance purposes |
| **Recommendation** | Phase 4 should add variant management to the admin product detail page |
| **Phase 4 Scope** | SHOULD HAVE |
| **Blocking?** | NO |

## 10. Product List / Admin List Audit

### Admin product list (`/products`)

| Capability | Status |
|------------|--------|
| Pagination | ✅ Server-side via `useAdminTable` |
| Search | ❌ Not implemented for products (text search filter exists in config but no search input in ManagementPage for products) |
| Category filter | ❌ Not in admin product list |
| Product type filter | ❌ Not implemented |
| Status filter | ✅ Dropdown (DRAFT/ACTIVE/REJECTED) |
| Merchant filter | ❌ (storeId text filter exists in config) |
| Sorting | ✅ title, slug, storeName, condition, imageCount, status |
| Bulk operations | ✅ Keyboard shortcuts: a=approve, x=reject (moderation only) |
| Column configuration | ❌ Fixed columns |
| Product count | ✅ Total shown in pagination |
| Empty state | ✅ (via ManagementPage) |
| Loading state | ✅ SkeletonTable |
| Error state | ✅ ErrorNotice |
| Responsive behavior | ⚠️ Basic — table scrolls horizontally |
| Create product | ❌ Not available |
| Edit product | ❌ Not available |

### Merchant catalog list (`/merchant/catalog`)

| Capability | Status |
|------------|--------|
| Pagination | ✅ Infinite scroll (PAGE_SIZE=20) |
| Search | ✅ Debounced text search |
| Category filter | ✅ Dropdown |
| Status filter | ✅ Dropdown |
| Sorting | ❌ Not implemented |
| Bulk operations | ✅ Select + delete/archive/draft |
| CSV export | ✅ Button |
| Create product | ✅ Link to Product Studio |
| Edit product | ❌ No edit link (redirects to catalog) |

### FINDING-04

| | |
|---|---|
| **ID** | FINDING-04 |
| **Severity** | MEDIUM |
| **Area** | Product List |
| **Current State** | Admin product list is moderation-only. No product creation or editing. No search input. No category/product-type filters |
| **Evidence** | `management-tables.ts` L33-37: products config has filters for status/condition/storeId/categoryId but ManagementPage renders generic filters; no dedicated search |
| **Risk** | Admins cannot efficiently find products to moderate in large catalogs |
| **Recommendation** | Phase 4 should enhance the admin product list with search, category tree filter, and product type filter |
| **Phase 4 Scope** | MUST HAVE |
| **Blocking?** | NO |

## 11. Admin vs Merchant UX

### Current separation

| Surface | Users | Product Operations |
|---------|-------|-------------------|
| Admin Console | SUPER_ADMIN, ADMIN, MODERATOR | View, moderate (approve/reject/archive), manage taxonomy (categories, brands, attributes, product types) |
| Web App (Merchant) | MERCHANT_OWNER, MERCHANT_STAFF | Create (Product Studio), list, bulk actions, export, import |
| Web App (Buyer) | BUYER | Search, view, compare, add to cart |

### Architecture compliance

The system correctly maintains the separation:

- **Canonical catalog governance** (Admin/Moderator): categories, brands, attributes, product types — all behind `catalog:*:manage` permissions in Admin Console
- **Merchant-owned product data**: product creation via Product Studio in Web App — behind `merchant:products:write`
- **Merchant offers**: separate from Product Studio, managed in `/merchant/offers`

### FINDING-05

| | |
|---|---|
| **ID** | FINDING-05 |
| **Severity** | MEDIUM |
| **Area** | Admin vs Merchant UX |
| **Current State** | Admin has no product create/edit form. If a moderator needs to create or correct a canonical product, they cannot do so through the Admin Console |
| **Evidence** | Admin `/products` page is read-only ManagementPage; `/products/:id` is read-only ProductDetails with moderation actions only |
| **Risk** | Platform governance requires the ability to create/edit canonical products (e.g., when a merchant proposes a product that needs admin correction) |
| **Recommendation** | Phase 4 should add a product editor to the Admin Console for canonical product management |
| **Phase 4 Scope** | MUST HAVE |
| **Blocking?** | NO |

## 12. API Gap Analysis

| UX Workflow | Existing API | Works? | Missing API? | Required Change |
|-------------|-------------|--------|--------------|-----------------|
| Product list (admin) | `GET /v1/admin/products` | ✅ | ❌ | None |
| Product list (merchant) | `GET /v1/stores/:storeId/products` | ✅ | ❌ | None |
| Product create | `POST /v1/products` | ✅ | ❌ | None |
| Product edit | `PATCH /v1/products/:id` | ✅ | ⚠️ | Add productTypeId, gtin, ean, mpn to UpdateProductInput |
| Product delete | `DELETE /v1/products/:id` | ✅ | ❌ | None |
| Product detail | `GET /v1/products/:id` | ✅ | ❌ | None |
| Product attributes | `PUT /v1/products/:id/attribute-values` | ✅ | ❌ | None |
| Variant create | `POST /v1/products/:productId/variants` | ✅ | ❌ | None |
| Variant edit | `PATCH /v1/products/:productId/variants/:variantId` | ✅ | ❌ | None |
| Variant delete | Via bulk endpoint | ✅ | ❌ | None |
| Variant matrix | `GET /v1/products/:productId/variant-matrix` | ✅ | ❌ | None |
| Variant attributes | `PUT .../variants/:variantId/attribute-values` | ✅ | ❌ | None |
| Category tree | `GET /v1/categories/tree` | ✅ | ❌ | None |
| Product type schema | `GET /v1/product-types/:id/schema` | ✅ | ❌ | None |
| Media upload | `POST /v1/media/presign` + `POST .../media` | ✅ | ❌ | None |
| Search | `GET /v1/search` | ✅ | ❌ | None |
| Bulk product ops | `POST /v1/stores/:storeId/products/bulk` | ✅ | ❌ | None |
| Bulk variant ops | `POST /v1/products/:productId/variants/bulk` | ✅ | ❌ | None |
| Product publish validation | `GET /v1/admin/product-types/:id/publish-readiness` | ✅ | ❌ | None |
| Optimistic locking | ❌ | ❌ | ⚠️ | Need `version` or `updatedAt` check on product/variant updates |
| Product audit history | ❌ | ❌ | ⚠️ | No product change history API exists |

### FINDING-06

| | |
|---|---|
| **ID** | FINDING-06 |
| **Severity** | HIGH |
| **Area** | API Gap |
| **Current State** | No optimistic locking on product or variant updates. Two concurrent editors can silently overwrite each other |
| **Evidence** | `updateProduct()` L1316: simple `UPDATE ... WHERE id = ?` with no version check. `updateVariant()` L1663: same pattern |
| **Risk** | Data loss from concurrent edits — especially in admin + merchant simultaneous editing |
| **Recommendation** | Add `updatedAt` comparison: reject update if `updatedAt` in DB is newer than the client's loaded version |
| **Phase 4 Scope** | MUST HAVE |
| **Blocking?** | NO (can be implemented as part of Phase 4) |

### FINDING-07

| | |
|---|---|
| **ID** | FINDING-07 |
| **Severity** | LOW |
| **Area** | API Gap |
| **Current State** | No product change audit trail. The `audit_logs` table exists but product updates are not logged |
| **Evidence** | `catalog.service.ts` update methods do not write to audit_logs |
| **Risk** | Cannot determine who changed what on a product and when |
| **Recommendation** | Add product change events via the existing outbox pattern. Classify as SHOULD HAVE for Phase 4 |
| **Phase 4 Scope** | SHOULD HAVE |
| **Blocking?** | NO |

## 13. Database Gap Analysis

### Schema changes likely needed for Phase 4

| Area | Current | Needed | Migration? |
|------|---------|--------|------------|
| Optimistic locking | No version column | Add `version integer` to products and product_variants | Yes (0054) |
| Product audit trail | No product-specific audit | Use existing `audit_logs` or add product_events table | Possibly |
| Product status enum | varchar(16) with DRAFT/ACTIVE/REJECTED/ARCHIVED | Sufficient | No |
| Variant deletion | No soft delete on variants | Consider `deleted_at` if archive needed | Possibly |
| Attribute ordering | `display_order` exists on product_type_attributes | Sufficient | No |
| Required attributes | `required` boolean on product_type_attributes | Sufficient | No |

### FINDING-08

| | |
|---|---|
| **ID** | FINDING-08 |
| **Severity** | HIGH |
| **Area** | Database |
| **Current State** | No optimistic locking column on products or product_variants tables |
| **Evidence** | `catalog.schema.ts` products table: no `version` column; product_variants: no `version` column |
| **Risk** | Concurrent edits cause silent data loss |
| **Recommendation** | Add `version integer NOT NULL DEFAULT 1` to both tables. Increment on each update. API rejects update if version mismatch |
| **Phase 4 Scope** | MUST HAVE |
| **Blocking?** | NO |

## 14. UX Architecture

### Current frontend architecture

**Admin Console** (Next.js on port 3200):
- `ManagementPage` generic component: configurable table with filters, pagination, detail dialog
- `DetailDialog`: modal for viewing/editing record fields
- `ProductDetails`: dedicated component with tabs (Overview, Variants, Offers, Media)
- `CategoryTree`: searchable tree with inline actions
- `AttributeTree` / `AttributeConfigPanel`: product type attribute builder
- `@scs/ui-kit`: shared primitive components (SkeletonTable, PageHeader, etc.)
- State: plain `useState`/`useEffect` + `useAdminResource` hook (fetch-based)
- Forms: inline HTML forms, no react-hook-form or zod

**Web App** (Next.js on port 3100):
- Product Studio: 6-step wizard with `useProductStudio` hook
- `buyer-api.ts`: API client for all catalog operations
- Shared components: LoadingSpinner, ErrorBanner, EmptyState, ProductCardImage
- State: plain `useState`/`useEffect`
- Forms: inline HTML forms

### Recommended Phase 4 UX architecture

**Admin product editor:**
- Extend `ProductDetails` with an "Edit" mode that renders form fields
- Or create a dedicated `/products/:id/edit` page with tabbed sections (Identity, Attributes, Variants, Media)
- Use existing `adminRequest()` for API calls
- Add optimistic locking via `updatedAt` comparison

**Merchant product editor:**
- Extend Product Studio with an "edit" mode (load existing product into wizard state)
- Or create a separate `/merchant/product-studio/:id` route
- Reuse `useProductStudio` hook with a `loadProduct(id)` initialization

## 15. Localization / RTL Audit

### Current state

| Aspect | Status |
|--------|--------|
| Arabic columns | ✅ `name_ar`, `title_ar`, `description_ar`, `value_ar` on relevant tables |
| RTL rendering | ✅ `dir="rtl"` on Arabic input fields and display elements |
| Bilingual labels | ✅ Admin attribute/category/brand forms have Arabic fields |
| Product Studio | ✅ Title (Arabic), Description (Arabic) fields with `dir="rtl"` |
| Search | ⚠️ Arabic normalization in FTS (`normalize_arabic()` in migration 0007) |
| i18n framework | ❌ No formal i18n — hardcoded English UI labels |
| Locale switching | ❌ No language toggle in admin or web app |
| Validation messages | ❌ English only |

### FINDING-09

| | |
|---|---|
| **ID** | FINDING-09 |
| **Severity** | LOW |
| **Area** | Localization |
| **Current State** | Bilingual data fields exist (name_ar, title_ar, description_ar) with RTL rendering. No formal i18n framework for UI labels. No language switching |
| **Evidence** | `StepIdentity.tsx` L176-187: Arabic fields with `dir="rtl"`. No i18n library in package.json |
| **Risk** | Arabic UI users see English labels. Not a Phase 4 blocker — data model supports Arabic |
| **Recommendation** | Defer formal i18n to a later phase. Phase 4 should continue the existing pattern of bilingual data fields |
| **Phase 4 Scope** | DEFERRED |
| **Blocking?** | NO |

## 16. Security Audit

### Verified security controls

| Control | Status | Evidence |
|---------|--------|----------|
| JwtAuthGuard | ✅ | Class-level on CatalogController and CatalogTaxonomyController |
| PermissionsGuard | ✅ | On all write endpoints |
| `merchant:products:write` | ✅ | Required for product/variant CRUD |
| `catalog:categories:write` | ✅ | Required for category CRUD (admin) |
| `catalog:brands:manage` | ✅ | Required for brand CRUD (admin) |
| `catalog:attributes:manage` | ✅ | Required for attribute CRUD (admin) |
| `catalog:product-types:manage` | ✅ | Required for product type CRUD (admin) |
| Organization isolation | ✅ | `assertProductInOrg()` on product/variant/attribute writes |
| Cross-tenant protection | ✅ | Verified in Phase 3 runtime tests |
| Cross-product variant rejection | ✅ | `setVariantAttributeValues()` checks variant belongs to product |
| Mass assignment | ✅ | `UpdateProductInput` explicitly lists allowed fields |
| Role-based access | ✅ | `@RequireRole('ADMIN', 'MODERATOR')` on category write endpoints |
| Import role restriction | ✅ | `@RequireRole('ADMIN', 'SUPER_ADMIN')` on catalog-import controller |

### FINDING-10

| | |
|---|---|
| **ID** | FINDING-10 |
| **Severity** | MEDIUM |
| **Area** | Security |
| **Current State** | `GET /v1/products/:id` and `GET /v1/products/:productId/variants` have no permission guard — any authenticated user (or possibly unauthenticated) can read any product |
| **Evidence** | `catalog.controller.ts` L216-219: `getProduct()` has no `@UseGuards(PermissionsGuard)` |
| **Risk** | This may be intentional for buyer-facing product detail pages. However, admin product detail should verify the admin has `admin:merchants:read` |
| **Recommendation** | Verify this is intentional (buyer needs to see products). If admin needs gating, the admin frontend already checks permissions client-side |
| **Phase 4 Scope** | INFO |
| **Blocking?** | NO |

## 17. Concurrency Audit

### Current concurrency controls

| Operation | Strategy | Evidence |
|-----------|----------|----------|
| Attribute replacement (product) | `SELECT ... FOR UPDATE` + DELETE/INSERT in transaction | `setProductAttributeValues()` |
| Attribute replacement (variant) | `SELECT ... FOR UPDATE` + DELETE/INSERT + combination_key recompute | `setVariantAttributeValues()` |
| Product update | None (last-write-wins) | `updateProduct()` |
| Variant update | None (last-write-wins) | `updateVariant()` |
| Bulk operations | Sequential within transaction | `bulkVariantOperations()` |
| Import execution | Job-level locking via status | `import_jobs.status` |

### Concurrency scenarios

| Scenario | Current behavior | Risk |
|----------|-----------------|------|
| Two users edit same product | Last write wins | Data loss |
| Two users edit same product attributes | FOR UPDATE serializes — last complete replacement wins | Low (atomic replacement) |
| Two users edit same variant | Last write wins | Data loss |
| User edits while import runs | Import creates new products; edit touches existing — no conflict | Low |
| Admin edits while merchant edits | Last write wins | Data loss |

### FINDING-11

| | |
|---|---|
| **ID** | FINDING-11 |
| **Severity** | HIGH |
| **Area** | Concurrency |
| **Current State** | No optimistic locking on product or variant updates. Attribute replacement is safe (FOR UPDATE). Product/variant field edits are not |
| **Evidence** | `updateProduct()` and `updateVariant()` have no version/updatedAt check |
| **Risk** | Silent data loss when two editors modify the same product |
| **Recommendation** | Implement optimistic locking: client sends `updatedAt`, server rejects if DB `updatedAt` is newer. Return 409 Conflict |
| **Phase 4 Scope** | MUST HAVE |
| **Blocking?** | NO |

## 18. Import / Export Audit

### Current state

| Capability | Admin | Merchant |
|------------|-------|----------|
| XLSX upload | ✅ `/admin/catalog-import` | ✅ `/merchant/import` |
| Preview/dry-run | ✅ | ✅ |
| Execute | ✅ | ✅ |
| Retry failed rows | ✅ | ❌ |
| Error report | ✅ | ✅ |
| Template download | ✅ | ❌ |
| CSV export | ❌ | ✅ (via `GET /v1/stores/:storeId/products/export`) |
| Full XLSX export | ✅ | ❌ |

Import is admin-only (`catalog:imports:manage` + ADMIN/SUPER_ADMIN role). Merchant import is a separate controller.

### FINDING-12

| | |
|---|---|
| **ID** | FINDING-12 |
| **Severity** | LOW |
| **Area** | Import/Export |
| **Current State** | Import/export infrastructure is mature. Admin has full XLSX pipeline. Merchant has basic import and CSV export |
| **Evidence** | `catalog-import.controller.ts`: 10 endpoints with upload, preview, execute, retry, errors, report, template, export |
| **Risk** | None — import/export is well-covered |
| **Recommendation** | Phase 4 should integrate the import center link into the product list page for easy access |
| **Phase 4 Scope** | SHOULD HAVE |
| **Blocking?** | NO |

## 19. Audit / History Audit

### Current state

| Capability | Status |
|------------|--------|
| `audit_logs` table | ✅ Exists |
| Product change logging | ❌ Not implemented |
| Attribute change logging | ❌ Not implemented |
| Variant change logging | ❌ Not implemented |
| Who changed what | ❌ Not tracked for products |
| Old/new values | ❌ Not stored |
| Organization-scoped audit | ❌ Not for products |

### FINDING-13

| | |
|---|---|
| **ID** | FINDING-13 |
| **Severity** | MEDIUM |
| **Area** | Audit / History |
| **Current State** | No product change audit trail. The `audit_logs` table exists but product CRUD operations do not write to it |
| **Evidence** | `catalog.service.ts` create/update/delete methods do not call any audit logging |
| **Risk** | Cannot determine who changed a product, when, or what changed |
| **Recommendation** | Add product change events via the existing outbox/audit pattern. Classify as SHOULD HAVE |
| **Phase 4 Scope** | SHOULD HAVE |
| **Blocking?** | NO |

## 20. Performance Audit

### Identified performance concerns

| Area | Concern | Severity |
|------|---------|----------|
| Product list pagination | Server-side with LIMIT/OFFSET — standard | LOW |
| Search | FTS + trigram with Redis cache — optimized | LOW |
| Variant matrix | Loads all variants + typed attributes per product — could be N+1 for many variants | MEDIUM |
| Attribute loading | `getProductTypeSchema()` loads definitions + options + groups in separate queries — acceptable for admin | LOW |
| Product detail | Single product fetch with variants + media + offers — 3-4 queries | LOW |
| Image loading | Presigned URLs via S3 — no local image processing | LOW |
| N+1 attribute queries | `getVariantMatrix()` enriches variants one-by-one with attribute values | MEDIUM |

### FINDING-14

| | |
|---|---|
| **ID** | FINDING-14 |
| **Severity** | MEDIUM |
| **Area** | Performance |
| **Current State** | `getVariantMatrix()` loads variants then enriches each with typed attribute values in a loop |
| **Evidence** | `catalog.service.ts` L1751 `getVariantMatrix()` calls `listVariantsByProduct()` which enriches each variant |
| **Risk** | Products with 50+ variants will have slow matrix loading |
| **Recommendation** | Batch-load attribute values for all variants in a single query. Defer to Phase 4 performance work if needed |
| **Phase 4 Scope** | DEFERRED (unless blocking) |
| **Blocking?** | NO |

## 21. Accessibility / UX Quality Audit

### Admin Console

| Aspect | Status |
|--------|--------|
| Keyboard navigation | ✅ j/k navigation on product list, / for search, a/x for moderation |
| Focus management | ⚠️ Basic — no focus trap in dialogs |
| Form labels | ✅ HTML `<label>` elements used |
| Error association | ⚠️ Inline error messages but not aria-describedby |
| Modal accessibility | ⚠️ DetailDialog uses `<dialog>` element but no focus trap |
| Table accessibility | ⚠️ Semantic `<table>` but no aria-label on action buttons |
| Loading indicators | ✅ SkeletonTable, AdminLoadingSkeleton |
| Empty states | ✅ AdminEmptyState component |
| Destructive confirmation | ✅ `window.confirm()` for archive |
| Unsaved changes | ❌ No unsaved changes detection |

### Web App

| Aspect | Status |
|--------|--------|
| Keyboard navigation | ⚠️ Basic tab order |
| Focus management | ⚠️ No explicit management |
| Form labels | ✅ `<Field>` component with `<label>` |
| Error association | ⚠️ Error div above form |
| Loading indicators | ✅ LoadingSpinner |
| Empty states | ✅ EmptyState component |
| Destructive confirmation | ⚠️ Inconsistent |
| Unsaved changes | ❌ No detection |

### FINDING-15

| | |
|---|---|
| **ID** | FINDING-15 |
| **Severity** | LOW |
| **Area** | Accessibility |
| **Current State** | Basic accessibility: semantic HTML, keyboard shortcuts on admin list, loading/empty states. Missing: focus traps, aria attributes, unsaved changes detection |
| **Evidence** | `ManagementPage.tsx` L83-99: keyboard shortcuts. No `aria-` attributes found in components |
| **Risk** | Poor screen reader experience. No protection against accidental navigation with unsaved data |
| **Recommendation** | Phase 4 should add unsaved changes detection and basic aria attributes. Full a11y audit deferred |
| **Phase 4 Scope** | SHOULD HAVE (unsaved changes), DEFERRED (full a11y) |
| **Blocking?** | NO |

## 22. Phase 4 Proposed Scope

### MUST HAVE

| Item | Reason |
|------|--------|
| Admin product editor (create/edit) | Admin has no way to create or edit canonical products |
| Merchant product editor (edit mode) | Product Studio is create-only; merchants cannot edit existing products |
| Optimistic locking on product/variant updates | Prevent silent data loss from concurrent edits |
| Add productTypeId/gtin/ean/mpn to UpdateProductInput | Identifiers and type cannot be corrected after creation |
| Product list enhancement (admin) | Search, category filter, product type filter needed for governance |
| Variant management in admin | Admin cannot view/edit variants beyond read-only tab |

### SHOULD HAVE

| Item | Reason |
|------|--------|
| Product change audit trail | No way to determine who changed what |
| Unsaved changes detection | No protection against accidental navigation |
| Import center integration in product list | Easy access from product management context |
| Variant attribute editor in product editor | VARIANT-scope attributes need dedicated UI |
| Keyboard shortcuts in product editor | Efficiency for power users |

### DEFERRED

| Item | Reason |
|------|--------|
| Formal i18n framework | No existing framework; bilingual data fields sufficient for now |
| RTL UI switching | Requires i18n framework first |
| Performance optimization (variant matrix batching) | Not blocking for typical product sizes |
| Mobile product management | No mobile product management screens exist; defer to later phase |
| GTIN deduplication UI | Backend exists (`/v1/canonical/match`); UI integration deferred |
| Bulk attribute editing | Not currently needed |
| Product comparison in admin | Buyer feature exists; admin doesn't need it |

## 23. Implementation Sequence

| Stage | Deliverable |
|-------|-------------|
| P0 | Baseline verification, optimistic locking design, UX architecture lock |
| P1 | Migration for optimistic locking (version column on products + product_variants) |
| P2 | API hardening: optimistic locking on updateProduct/updateVariant, add fields to UpdateProductInput |
| P3 | Admin product editor — create form (canonical product with category, brand, product type, identifiers) |
| P4 | Admin product editor — edit form (all fields + typed attribute editor) |
| P5 | Admin variant management (create/edit/delete in product detail) |
| P6 | Merchant product editor — edit mode (extend Product Studio or create separate route) |
| P7 | Admin product list enhancement (search, category tree filter, product type filter) |
| P8 | Product change audit trail (outbox events on product CRUD) |
| P9 | Unsaved changes detection + keyboard shortcuts in editors |
| P10 | Full regression + TypeScript + build verification |
| P11 | Independent runtime verification |
| P12 | Release closure |

## 24. Required Business Decisions

The following decisions must be locked before Phase 4 implementation:

| # | Decision | Options | Impact |
|---|----------|---------|--------|
| BD-1 | Who can create canonical products? | (a) Merchants propose, admin approves (current Product Studio flow) (b) Admin creates, merchants can only propose (c) Both can create | Determines whether Product Studio or Admin Console is the primary creation surface |
| BD-2 | Who can edit canonical products? | (a) Merchant owner of the product's store (b) Admin/moderator only (c) Both with optimistic locking | Determines which surfaces need edit forms |
| BD-3 | Can merchants publish (set ACTIVE) their own products? | (a) Yes, self-publish (b) No, requires admin approval (current: yes, with validatePublish) | Determines if moderation workflow is required |
| BD-4 | Product lifecycle — what statuses exist? | Current: DRAFT, ACTIVE, REJECTED, ARCHIVED. Add PENDING_REVIEW? SUSPENDED? | Affects UI state machine and admin workflows |
| BD-5 | Should identifiers (GTIN/EAN/MPN) be editable after creation? | (a) Yes, always (b) Only by admin (c) Never (current) | Affects UpdateProductInput changes |
| BD-6 | Product type — editable after creation? | (a) Yes (b) Only if no variants exist (c) Never (current) | Affects data integrity — changing type changes attribute schema |
| BD-7 | Variant deletion — soft or hard? | (a) Soft delete (add deleted_at) (b) Hard delete (current via cascade) (c) Archive (add status) | Affects inventory/offer linkage |
| BD-8 | Optimistic locking strategy | (a) `version` integer column (b) `updatedAt` timestamp comparison (c) No locking (accept last-write-wins) | Affects migration and API changes |
| BD-9 | Admin product management — full CRUD or governance-only? | (a) Full CRUD (admin can create/edit/delete canonical products) (b) Governance-only (admin moderates merchant proposals) | Determines scope of admin editor |
| BD-10 | Merchant product editor — extend wizard or separate page? | (a) Extend Product Studio wizard with edit mode (b) Separate `/merchant/product-studio/:id` page (c) Inline editing in catalog list | Affects UX architecture |
| BD-11 | Required attribute enforcement — when? | (a) On publish (current) (b) On save (c) Never enforced, warnings only | Affects product creation/editing UX |
| BD-12 | Audit trail — what level of detail? | (a) Full field-level diff (b) Event-level (product.created, product.updated) (c) None | Affects storage and API design |

## 25. Required Architecture Decisions

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| AD-1 | Admin product editor architecture | (a) Extend ProductDetails component (b) New dedicated page (c) Dialog-based editor | (b) New `/products/:id/edit` page with tabbed sections |
| AD-2 | Merchant product editor architecture | (a) Extend Product Studio wizard (b) Separate edit page (c) Inline in catalog list | (a) Extend Product Studio with edit mode — reuse useProductStudio hook |
| AD-3 | Attribute editor component | (a) Inline in product form (b) Separate tab/section (c) Dialog | (b) Separate "Attributes" tab in product editor |
| AD-4 | Variant editor architecture | (a) Inline table in product editor (b) Separate tab with matrix (c) Dialog per variant | (b) Separate "Variants" tab with matrix view + add/edit dialogs |
| AD-5 | Optimistic locking implementation | (a) New `version` column (b) `updatedAt` comparison (c) ETag header | (b) `updatedAt` comparison — no migration needed, uses existing column |
| AD-6 | State management for product editor | (a) useState (current pattern) (b) useReducer (c) React Hook Form | (a) useState for consistency with existing codebase |
| AD-7 | Form validation approach | (a) Client-side only (b) Server-side only (c) Both | (c) Both — client-side for UX, server-side for security (current pattern) |
| AD-8 | Product list filter architecture | (a) URL params (current search page pattern) (b) Component state (c) Both | (a) URL params for shareability |

## 26. Test Strategy

### Backend

| Test type | Coverage |
|-----------|----------|
| Unit | Product CRUD, variant CRUD, attribute operations, optimistic locking |
| Integration (PostgreSQL) | Migration for version column, typed attribute writes, concurrent updates |
| RBAC | Verify each role can/cannot perform each operation |
| Tenant isolation | Cross-org product access rejection |
| Concurrency | Optimistic locking conflict detection, FOR UPDATE attribute serialization |

### Frontend

| Test type | Coverage |
|-----------|----------|
| Component | Product form rendering, attribute editor, variant matrix |
| Form validation | Required fields, type validation, identifier format |
| Route guards | Permission checks on editor pages |
| API error handling | 409 Conflict (optimistic locking), 403 (permission), 404 (not found) |
| State transitions | DRAFT → ACTIVE publish flow, moderation actions |

### E2E

| Workflow | Steps |
|----------|-------|
| Merchant product creation | Product Studio → Identity → Specs → Variants → Offer → Media → Review → Save |
| Merchant product editing | Catalog → Select product → Edit → Modify fields → Save |
| Admin product moderation | Products list → Select → Approve/Reject/Archive |
| Admin product editing | Products → Select → Edit → Modify → Save |
| Concurrent editing | Two users edit same product → second gets conflict warning |
| Permission enforcement | MERCHANT_STAFF tries admin action → 403 |

## 27. Findings and Risk Register

| ID | Severity | Area | Summary | Blocking? |
|----|----------|------|---------|-----------|
| FINDING-01 | HIGH | Product Form | productTypeId/gtin/ean/mpn not editable after creation | NO |
| FINDING-02 | MEDIUM | Attribute UX | VARIANT-scope attributes have no dedicated editor | NO |
| FINDING-03 | HIGH | Variant UX | No admin UI for variant management | NO |
| FINDING-04 | MEDIUM | Product List | Admin product list lacks search and taxonomy filters | NO |
| FINDING-05 | MEDIUM | Admin vs Merchant | Admin cannot create/edit canonical products | NO |
| FINDING-06 | HIGH | API Gap | No optimistic locking on product/variant updates | NO |
| FINDING-07 | LOW | API Gap | No product change audit trail | NO |
| FINDING-08 | HIGH | Database | No version/locking column on products/variants | NO |
| FINDING-09 | LOW | Localization | No formal i18n framework; bilingual data only | NO |
| FINDING-10 | MEDIUM | Security | Product reads are unguarded (may be intentional) | NO |
| FINDING-11 | HIGH | Concurrency | Last-write-wins on product/variant field edits | NO |
| FINDING-12 | LOW | Import/Export | Import center not linked from product list | NO |
| FINDING-13 | MEDIUM | Audit | No product change history | NO |
| FINDING-14 | MEDIUM | Performance | Variant matrix N+1 attribute loading | NO |
| FINDING-15 | LOW | Accessibility | Missing focus traps, aria attributes, unsaved changes | NO |

**Summary**: 5 HIGH, 6 MEDIUM, 4 LOW. Zero are blocking — all can be addressed within Phase 4 implementation.

## 28. Recommended Next Step

Phase 4 is ready for the **Business Rules + Architecture Lock** step once the business decisions in Section 24 are resolved.

The 12 business decisions (BD-1 through BD-12) must be answered before implementation begins. The architecture decisions (AD-1 through AD-8) have recommended defaults that can be accepted or overridden.

## 29. Final Verdict

**GO WITH CONDITIONS**

Phase 4 (Product Studio / Admin Product Management UX) is ready for Business Rules + Architecture Lock.

**Conditions:**
1. The 12 business decisions in Section 24 must be resolved before implementation
2. Optimistic locking strategy must be agreed (FINDING-06/08/11)
3. Admin vs merchant product ownership model must be locked (BD-1, BD-2, BD-9)

**What must be resolved first:**
- BD-1: Who can create canonical products
- BD-2: Who can edit canonical products
- BD-3: Publish authority (self-publish vs admin approval)
- BD-9: Admin product management scope (full CRUD vs governance-only)
- BD-8: Optimistic locking strategy

**Exact next governance step:**
Phase 4 Business Rules + Architecture Lock document, to be created after the user resolves the business decisions listed above.
