# SCS Catalog Product Management — Next Phase Architecture & Business Audit

| Field | Value |
|-------|-------|
| Gate | NEXT PHASE ARCHITECTURE AUDIT |
| Branch | `develop` |
| HEAD | `2164c06` |
| Prior Phase | P6 — Merchant Product Studio Edit Mode |
| Prior Phase Status | CLOSED / PASS WITH CONDITIONS |
| Latest Migration | 0054_store_members.sql |
| Audit Date | 2026-10-06 |
| Audit Verdict | **GO WITH CONDITIONS** |

---

## 1. Executive Summary

This audit determines the next business-critical Product Management milestone after the formal closure of P6 — Merchant Product Studio Edit Mode.

P6 established secure store-level authorization via `store_members` (migration 0054) and merchant product editing via the Product Studio edit mode. P6 is CLOSED / PASS WITH CONDITIONS with 42/42 acceptance criteria, 80/80 independent tests, and 298/298 PostgreSQL regression tests.

**The audit examined the complete catalog system:** 54 migrations, 19 catalog module files, 60+ API endpoints, Product Studio (create + edit), Admin Product Management (list, detail, edit, create, variant create), import/export pipeline, search service, offer governance, taxonomy system, and all deferred items from prior phases.

**Recommended Next Milestone: P7 — Store Membership Management & Product Studio Production Hardening**

This combines two tightly coupled needs:
1. **Store Membership Management UI** — P6 created the `store_members` table and authorization model, but no UI exists to manage memberships (add, remove, change role, deactivate). Last-owner protection is absent. This is the #1 deferred item from P6.
2. **Product Studio Production Hardening** — The create flow lacks `beforeunload` protection, media add/reorder UI is unwired, product list navigation is missing, and the overall UX is not production-quality for daily merchant use.

**Migration 0055 Decision: CONDITIONAL** — If membership management requires additional schema (e.g., membership history/audit trail columns), migration 0055 will be needed. The existing `store_members` table may be sufficient for basic CRUD.

**Architecture Gate: GO WITH CONDITIONS** — Business decisions must be locked before implementation begins.

---

## 2. Current Baseline

```
Branch:             develop
HEAD:               2164c06
Latest migration:   0054_store_members.sql
Migration 0055+:    DOES NOT EXIST
P6 status:          CLOSED / PASS WITH CONDITIONS
```

### Schema Summary

| Table | Migration | Purpose |
|-------|-----------|---------|
| categories | 0004 | Materialized-path category hierarchy |
| brands | 0004 | Platform-level brands |
| products | 0004 + 0025 | Canonical products (store-scoped, soft-delete) |
| product_variants | 0004 + 0025 | Purchasable SKUs with typed attributes |
| product_media | 0004 | Rich media (images, thumbnails) |
| import_jobs | 0004 + 0034 | Bulk catalog import tracking |
| product_sources | 0038 | Provenance tracking |
| attribute_definitions | 0023 | Typed attribute governance |
| attribute_options | 0023 | SELECT/MULTI_SELECT options |
| product_types | 0024 | Product type templates |
| product_type_attributes | 0024 | Type-attribute binding with rules |
| product_attribute_values | 0025 | PRODUCT-scope typed values (authoritative) |
| variant_attribute_values | 0025 | VARIANT-scope typed values (authoritative) |
| merchant_offers | 0026 | Multi-seller offer model |
| store_members | 0054 | Store-level authorization (P6) |

### API Surface Summary

| Controller | Endpoints | Auth |
|------------|-----------|------|
| CatalogController | ~35 endpoints | JwtAuthGuard + PermissionsGuard |
| CatalogTaxonomyController | ~18 endpoints | Admin-only writes |
| CatalogOfferController | ~14 endpoints | Mixed read/write |
| AdminController (moderation) | ~5 endpoints | Admin-only |
| SearchService | ~5 endpoints | Public read |

---

## 3. Completed Milestones

| Phase | Name | Status | Latest Migration |
|-------|------|--------|------------------|
| Phase 1 | Import Data Contract + Persistence Fixes | CLOSED / PASS | 0034 |
| Phase 2 | Catalog Persistence / Validation Hardening | CLOSED / PASS | 0052 |
| Phase 3 | Typed Attribute Cutover | CLOSED / PASS | 0053 |
| Phase 4 P1 | Optimistic Locking | CLOSED / PASS | — |
| Phase 4 P2 | Identifiers / Product Type Edit | CLOSED / PASS | — |
| Phase 4 P3 | Admin Product Create/Edit | CLOSED / PASS | — |
| Phase 4 P5 | Admin Variant Management | CLOSED / PASS WITH CONDITIONS | — |
| Phase 4 P6 | Merchant Product Studio Edit + Store Auth | CLOSED / PASS WITH CONDITIONS | 0054 |

**Total migrations:** 0001 through 0054 (54 migrations).

---

## 4. Current Catalog Capability Matrix

| Stage | Status | Evidence |
|-------|--------|----------|
| Category | **IMPLEMENTED** | CRUD, tree hierarchy, materialized path, Arabic names |
| Product Type / Template | **IMPLEMENTED** | Full admin builder, attribute binding, conditional rules, versioning, publish |
| Canonical Product | **IMPLEMENTED** | Create (admin + merchant), edit, typed attributes, identifiers, media, soft-delete |
| Product Variant | **IMPLEMENTED** | Create (admin + merchant), edit, bulk ops, typed attributes, combination key |
| Merchant Offer | **IMPLEMENTED** | Create, propose, pricing, withdraw, admin governance (approve/reject/suspend/activate) |
| Inventory | **IMPLEMENTED** | inventory_items linked via warehouse → offer |
| Pricing | **IMPLEMENTED** | price_lists → price_tiers linked via offer → priceListId |
| Publishing | **PARTIALLY IMPLEMENTED** | DRAFT → ACTIVE via moderation; no REVIEW/APPROVED workflow; validatePublish checks attributes |
| Search / Discovery | **PARTIALLY IMPLEMENTED** | FTS + trigram + attribute filters + facets; no dedicated marketplace search |
| Order | **IMPLEMENTED** | Full order pipeline (separate module) |

---

## 5. Deferred Work Inventory

All catalog-related deferred items from previous audits/reports:

| Item | Origin | Current Status | Assessment |
|------|--------|---------------|------------|
| Store membership management UI | P6 §15 | DEFERRED | **PROMOTE TO P7** — P6 auth model is unusable without admin UI |
| Complete membership lifecycle service | P6 §15 | DEFERRED | **PROMOTE TO P7** — add/remove/role-change/deactivate |
| Last-owner protection | P6 §15 | DEFERRED | **PROMOTE TO P7** — prevent orphaning stores |
| Membership audit events | P6 §15 | DEFERRED | **PROMOTE TO P7** — store_member.added/removed/role_changed |
| Browser/live Product Studio verification | P6 §15 | NOT EXECUTED | **PROMOTE TO P7** — needs live testing |
| GTIN deduplication UI | P6 §15 | DEFERRED | REMAIN DEFERRED — backend exists (Phase 7), UI not urgent |
| Catalog performance/index optimization | P6 §15 | DEFERRED | REMAIN DEFERRED — current indexes adequate for present scale |
| Media add/reorder UI | P3 deferred | DEFERRED | **PROMOTE TO P7** — backend endpoints exist, UI unwired |
| MULTI_SELECT/FILE/MEASUREMENT/CURRENCY widgets | P3 deferred | DEFERRED | REMAIN DEFERRED — lower priority UX items |
| Product taxonomy/category management | General | PARTIALLY IMPLEMENTED | Admin category tree exists; no drag-and-drop reordering |
| Product publishing/moderation workflow | General | PARTIALLY IMPLEMENTED | Basic approve/reject/archive exists; no REVIEW state |
| Bulk product operations | General | PARTIALLY IMPLEMENTED | Backend supports delete/archive/draft; admin UI lacks bulk actions |
| Product search/filtering improvements | General | PARTIALLY IMPLEMENTED | FTS + trigram works; no price/availability filtering in search |
| Catalog observability/auditability | General | PARTIALLY IMPLEMENTED | AuditService wired; admin audit log viewer exists |
| Import/export improvements | Phase 1 | PARTIALLY IMPLEMENTED | Row-by-row processing, no batching/resumability |
| Product validation improvements | Phase 2 | IMPLEMENTED | CatalogValidationService comprehensive |
| Variant management improvements | P5 | IMPLEMENTED | Admin variant create page exists; merchant via Product Studio |
| Product identifiers | Phase 4 P2 | IMPLEMENTED | GTIN/EAN/MPN editable, uniqueness enforced, dedup backend exists |

---

## 6. Canonical Product Audit

### Identity & Core Fields

| Field | Status | Notes |
|-------|--------|-------|
| id (UUID) | ✅ IMPLEMENTED | Primary key |
| storeId | ✅ IMPLEMENTED | Nullable (P3 design: platform-shared products allowed) |
| categoryId | ✅ IMPLEMENTED | FK → categories |
| brandId | ✅ IMPLEMENTED | FK → brands |
| productTypeId | ✅ IMPLEMENTED | FK → product_types (migration 0025) |
| slug | ✅ IMPLEMENTED | Required, unique per product |
| title / titleAr | ✅ IMPLEMENTED | Arabic twin present |
| description / descriptionAr | ✅ IMPLEMENTED | Arabic twin present |

### Identifiers

| Field | Status | Uniqueness | Notes |
|-------|--------|------------|-------|
| gtin | ✅ IMPLEMENTED | Partial unique index (uq_products_gtin WHERE gtin IS NOT NULL) | Migration 0025 |
| ean | ✅ IMPLEMENTED | Partial unique index (uq_products_ean WHERE ean IS NOT NULL) | Migration 0025 |
| mpn | ✅ IMPLEMENTED | Indexed (idx_products_mpn) but NOT unique | Migration 0027 |
| sku | ✅ IMPLEMENTED | UNIQUE per (product_id, sku) — variant-level | Migration 0004 |

**Finding F-ID-01:** MPN has no uniqueness constraint. Multiple products can share the same MPN.
- **Severity:** P3 — MPN is manufacturer-claimed; cross-manufacturer collisions are plausible.
- **Recommendation:** Monitor; do not add unique constraint without business decision.

**Finding F-ID-02:** No store-scoped SKU uniqueness at the product level. SKU is unique per variant within a product (product_id, sku), but two different products in the same store could have variants with the same SKU.
- **Severity:** P2 — Could cause confusion in import/fulfillment.
- **Recommendation:** Business decision needed: should SKU be unique per store?

### Status & Lifecycle

| Field | Status | Notes |
|-------|--------|-------|
| status | ✅ IMPLEMENTED | Values: DRAFT, ACTIVE, ARCHIVED (varchar(16)) |
| isAvailable | ✅ IMPLEMENTED | Boolean, separate from status |
| publishedAt | ✅ IMPLEMENTED | Set when status → ACTIVE |
| deletedAt | ✅ IMPLEMENTED | Soft delete |
| condition | ✅ IMPLEMENTED | NEW (default), also USED/REFURBISHED possible |

**Finding F-LC-01:** No REVIEW or PENDING_APPROVAL status exists. Products go directly from DRAFT to ACTIVE (via moderation APPROVED) or are ARCHIVED. There is no formal "submitted for review" state.
- **Severity:** P2 — Merchants cannot submit products for admin review; admins cannot distinguish "ready for review" from "work in progress."
- **Recommendation:** Evaluate whether a REVIEW state is needed in the next milestone.

### JSONB Legacy

| Field | Status | Notes |
|-------|--------|-------|
| attributes (JSONB) | ⚠️ DEPRECATED | PHASE 3 — column retained, must NOT be read or written |
| images (JSONB) | ✅ IN USE | Product-level image array (legacy; product_media is authoritative) |
| metadata (JSONB) | ✅ IN USE | Generic extensible metadata |

**Finding F-JB-01:** The `images` JSONB column on `products` coexists with the `product_media` table. The Product Studio writes to `images` (JSONB) during create, while the media endpoints use `product_media`. This dual storage is a potential inconsistency source.
- **Severity:** P2 — Data inconsistency risk.
- **Recommendation:** Investigate whether create flow writes to both; consolidate to `product_media` only.

### Typed Attributes

✅ Authoritative via `product_attribute_values` table (migration 0025, backfilled in 0053). JSONB `attributes` column is deprecated and must not be read/written.

### Optimistic Locking

✅ `updatedAt` timestamp with millisecond precision. Atomic conditional UPDATE in both standard and type-change paths (Phase 4 P1).

### Duplicate Detection

✅ Backend: `findProductByIdentifiers()` and `findPotentialDuplicates()` endpoints exist (Phase 7). `createProduct()` checks for identifier matches and returns existing product with `_dedup: true`.
- **UI:** No GTIN dedup UI exists. Merchants can create duplicate products if they don't know to check first.
- **Severity:** P3 — Backend exists; UI is convenience, not blocker.

---

## 7. Variant Audit

| Capability | Status | Evidence |
|------------|--------|----------|
| Variant identity | ✅ IMPLEMENTED | UUID PK, productId FK |
| SKU | ✅ IMPLEMENTED | Required, unique per (product_id, sku) |
| Barcode | ✅ IMPLEMENTED | Optional varchar(60) |
| combinationKey | ✅ IMPLEMENTED | Digest of VARIANT-scope attribute values; partial unique index |
| Typed attributes | ✅ IMPLEMENTED | variant_attribute_values table |
| Create (admin) | ✅ IMPLEMENTED | POST /admin/products/:id/variants + admin UI page |
| Create (merchant) | ✅ IMPLEMENTED | POST /products/:id/variants (via Product Studio) |
| Edit | ✅ IMPLEMENTED | PATCH variant endpoint |
| Bulk operations | ✅ IMPLEMENTED | POST /products/:id/variants/bulk (create, delete, toggleActive) |
| Deactivate | ✅ IMPLEMENTED | isActive boolean + toggleActive bulk op |
| Hard delete | ✅ IMPLEMENTED | Via bulk deleteIds |
| Offer relationships | ✅ IMPLEMENTED | merchant_offers.variantId |
| Inventory relationships | ✅ IMPLEMENTED | Via offer → warehouse → inventory_items |
| Optimistic locking | ✅ IMPLEMENTED | updatedAt comparison in updateVariant |
| IDOR protection | ✅ IMPLEMENTED | Via assertProductEditableByMerchant (product → store → membership) |
| Import compatibility | ✅ IMPLEMENTED | importRow matches by SKU within store |
| Admin UI | ✅ IMPLEMENTED | /products/[id]/variants/new page |
| Merchant UI | ✅ IMPLEMENTED | StepVariants in Product Studio |

**Finding F-VAR-01:** Variant combinations can become inconsistent with the product type's allowed dimensions if the product type is changed after variants exist. The type-change guard (FOR UPDATE) protects the transaction but does not validate that existing variant combination keys remain valid under the new type.
- **Severity:** P2 — Data integrity risk on product type change.
- **Recommendation:** Add post-change validation or warning when type change invalidates existing variant dimensions.

---

## 8. Attribute System Audit

| Capability | Status | Evidence |
|------------|--------|--------|
| Product attributes | ✅ IMPLEMENTED | product_attribute_values table |
| Variant attributes | ✅ IMPLEMENTED | variant_attribute_values table |
| Attribute definitions | ✅ IMPLEMENTED | attribute_definitions with code, type, scope, validation |
| Attribute types | ✅ IMPLEMENTED | 14 types: TEXT, LONG_TEXT, INTEGER, DECIMAL, BOOLEAN, DATE, DATETIME, SELECT, MULTI_SELECT, COLOR, URL, FILE, MEASUREMENT, CURRENCY |
| Attribute options | ✅ IMPLEMENTED | attribute_options table |
| Validation | ✅ IMPLEMENTED | CatalogValidationService validates all types |
| Required attributes | ✅ IMPLEMENTED | productTypeAttributes.required flag |
| Allowed per product type | ✅ IMPLEMENTED | productTypeAttributes binding |
| Variant dimensions | ✅ IMPLEMENTED | productTypes.variantDimensions JSONB + combinationKey |
| Uniqueness | ✅ IMPLEMENTED | Partial unique (product_id, combination_key) |
| Conditional rules | ✅ IMPLEMENTED | conditionalRules JSONB + ConditionalRulesService |
| Attribute deletion | ✅ IMPLEMENTED | Soft delete (deletedAt) on definitions |
| Import compatibility | ✅ PARTIAL | Import does not write typed attributes |
| Export compatibility | ✅ PARTIAL | Export CSV does not include typed attribute values |
| JSONB authority | ✅ VERIFIED | No accidental reintroduction; JSONB columns deprecated |

**Finding F-ATTR-01:** Import does not populate typed attribute values. Imported products get DRAFT status with no attribute data, requiring manual completion via Product Studio.
- **Severity:** P3 — Known limitation; import focuses on product/variant/price creation.

**Finding F-ATTR-02:** Export CSV does not include typed attribute values. Exported data is incomplete for catalog migration or backup purposes.
- **Severity:** P3 — Export is basic; full attribute export would be a UX improvement.

**Architecture Integrity:** ✅ The typed attribute system is authoritative. JSONB `attributes` columns are deprecated and not read/written by any current code path. No regression to JSONB authority was found.

---

## 9. Product Type / Taxonomy Audit

| Capability | Status | Evidence |
|------------|--------|----------|
| Category-specific attributes | ✅ IMPLEMENTED | Via product_type → category binding |
| Product-type-specific attributes | ✅ IMPLEMENTED | productTypeAttributes table |
| Variant dimensions | ✅ IMPLEMENTED | productTypes.variantDimensions |
| Required/optional attributes | ✅ IMPLEMENTED | required flag per binding |
| Allowed options | ✅ IMPLEMENTED | attribute_options + allowedValues |
| Attribute inheritance | ✅ IMPLEMENTED | Via product type → attribute binding |
| Category/product-type relationship | ✅ IMPLEMENTED | productTypes.categoryId |
| Publishing product types | ✅ IMPLEMENTED | DRAFT → PUBLISHED with publish-readiness check |
| Product type versioning | ✅ IMPLEMENTED | version column + createNewVersion |
| Conditional rules engine | ✅ IMPLEMENTED | ConditionalRulesService + preview endpoint |
| Admin Product Type Builder | ✅ IMPLEMENTED | /admin/product-types/[id] three-panel builder |

**Finding F-TAX-01:** Category path (`categories.path`) is written inconsistently by the importer (noted in catalog.service.ts line 48 comment). BFS graph traversal is used instead of path-prefix matching.
- **Severity:** P3 — Works correctly via BFS; path column is unreliable for direct queries.
- **Recommendation:** Fix path writing in importer or document that path is not authoritative.

---

## 10. Import / Export Audit

### Import Pipeline

| Capability | Status | Evidence |
|------------|--------|----------|
| File upload | ✅ IMPLEMENTED | POST /stores/:storeId/imports |
| Row staging | ✅ IMPLEMENTED | POST /imports/:id/rows (Redis-backed) |
| Column mapping | ✅ IMPLEMENTED | columnMapping JSONB on import_jobs |
| Processing | ✅ IMPLEMENTED | processImportJob — row-by-row |
| Validation | ✅ IMPLEMENTED | Per-row validation with error log |
| Create/Update semantics | ✅ IMPLEMENTED | Match by SKU within store |
| Error handling | ✅ IMPLEMENTED | Per-row error collection (max 100) |
| Progress tracking | ✅ IMPLEMENTED | Checkpoint every 25 rows |
| XLSX parsing | ❌ DEFERRED | "XLSX parsing is deferred for the pilot" — error thrown |
| Idempotency | ⚠️ PARTIAL | SKU match prevents duplicate creation, but no idempotency key |
| Resumability | ⚠️ PARTIAL | FAILED jobs can be reprocessed, but no cursor-based resume |
| Batch size | ⚠️ CONCERN | All rows loaded from Redis at once; no chunking |
| Transaction boundaries | ⚠️ CONCERN | Each row is independent; no atomic batch |
| Typed attributes | ❌ NOT IMPORTED | Import does not write product_attribute_values |
| Concurrent import vs edit | ⚠️ RISK | No FOR UPDATE lock during import; could race with Product Studio edit |

**Finding F-IMP-01:** Import processing loads all staged rows from Redis into memory at once (`lrange key 0 -1`). For large catalogs (10,000+ rows), this could cause memory pressure.
- **Severity:** P2 — Production risk for large imports.
- **Recommendation:** Implement chunked processing (e.g., 100 rows per batch).

**Finding F-IMP-02:** Import does not participate in optimistic locking. An import update and a concurrent Product Studio edit could silently overwrite each other.
- **Severity:** P2 — Data integrity risk.
- **Recommendation:** Add updatedAt check in import update path.

### Export

| Capability | Status | Notes |
|------------|--------|-------|
| CSV export | ✅ IMPLEMENTED | GET /stores/:storeId/products/export |
| Columns | ⚠️ LIMITED | title, titleAr, sku, priceMinor, category, brand, status, description only |
| Typed attributes | ❌ NOT EXPORTED | Attribute values not included |
| Variants | ❌ NOT EXPORTED | Only product-level export |

---

## 11. Product Studio Audit

### Create Flow (/merchant/product-studio)

| Capability | Status | Evidence |
|------------|--------|----------|
| 6-step wizard | ✅ IMPLEMENTED | Identity → Specs → Variants → Offer → Media → Review |
| Store selection | ✅ IMPLEMENTED | Auto-selects first store |
| Category/brand selection | ✅ IMPLEMENTED | Dropdowns from API |
| Product type selection | ✅ IMPLEMENTED | Filtered to PUBLISHED types |
| Canonical dedup check | ✅ IMPLEMENTED | searchCanonical + canonicalMatches |
| Typed attribute editor | ✅ IMPLEMENTED | StepSpecifications |
| Variant matrix | ✅ IMPLEMENTED | StepVariants + VariantMatrix component |
| Offer configuration | ✅ IMPLEMENTED | StepOffer (price, currency, MOQ) |
| Media upload | ✅ IMPLEMENTED | StepMedia |
| Completeness score | ✅ IMPLEMENTED | CompletenessScore component |
| beforeunload protection | ❌ MISSING | No dirty-state guard on create flow |
| Mobile responsiveness | ⚠️ UNKNOWN | Inline styles; no responsive breakpoints observed |
| Arabic/RTL | ⚠️ PARTIAL | dir="rtl" on titleAr/descriptionAr inputs only |

### Edit Flow (/merchant/product-studio/[id]/edit)

| Capability | Status | Evidence |
|------------|--------|----------|
| 5-step wizard (no offer) | ✅ IMPLEMENTED | Identity → Specs → Variants → Media → Review |
| Loading states | ✅ IMPLEMENTED | loading, forbidden, notfound, error |
| Conflict detection (409) | ✅ IMPLEMENTED | Conflict banner with Reload/Discard |
| beforeunload protection | ✅ IMPLEMENTED | isDirty → beforeunload handler |
| Dirty state tracking | ✅ IMPLEMENTED | JSON comparison of state |
| Existing variants display | ✅ IMPLEMENTED | existingVariants + variantAttributeValues |
| Existing media display | ✅ IMPLEMENTED | existingMedia |
| Store/productType locked | ✅ IMPLEMENTED | editMode disables identity fields |
| Product list navigation | ❌ MISSING | No "back to catalog" link in header; must use browser |
| Media add/reorder | ⚠️ PARTIAL | Backend endpoints exist; UI may be unwired |

**Finding F-PS-01:** Create flow lacks `beforeunload` protection. Merchants can accidentally navigate away and lose all product data.
- **Severity:** P1 — Data loss risk for the primary merchant workflow.
- **Evidence:** `useProductStudio.ts` hook has no `beforeunload` handler; only `useProductStudioEdit.ts` has one (line 192-201).
- **Recommendation:** Add `beforeunload` protection to create flow immediately.

**Finding F-PS-02:** No product list/search within Product Studio. After creating a product, the merchant is redirected to `/merchant/catalog`. There is no way to navigate directly from the catalog list to the edit mode.
- **Severity:** P2 — UX gap; merchants cannot efficiently manage existing products.
- **Evidence:** Merchant catalog page (`/merchant/catalog/page.tsx`) shows product list with edit links, but the edit link must navigate to `/merchant/product-studio/[id]/edit`.
- **Recommendation:** Verify edit link routing; add "Edit" action to catalog list.

---

## 12. Admin Product Management Audit

| Capability | Status | Evidence |
|------------|--------|----------|
| Product list | ✅ IMPLEMENTED | ManagementPage with generic table, keyboard shortcuts (j/k/a/x) |
| Product detail | ✅ IMPLEMENTED | ProductDetails with tabs (Overview, Variants, Offers, Media) |
| Product create | ✅ IMPLEMENTED | ProductForm in create mode |
| Product edit | ✅ IMPLEMENTED | ProductForm in edit mode with typed attributes |
| Moderation | ✅ IMPLEMENTED | Approve/Reject/Archive with optimistic locking |
| Variant create | ✅ IMPLEMENTED | /products/[id]/variants/new page |
| Variant management | ✅ IMPLEMENTED | Via ProductDetails Variants tab |
| Media management | ⚠️ PARTIAL | Media tab exists; add/reorder may be limited |
| Bulk actions | ❌ MISSING | No bulk approve/reject in admin UI |
| Search/filter | ✅ IMPLEMENTED | Generic ManagementPage search + filters |
| Status filtering | ✅ IMPLEMENTED | Via ManagementPage filter config |
| Ownership identification | ✅ IMPLEMENTED | ProductDetails shows store/org |
| Duplicate identification | ⚠️ PARTIAL | Backend endpoint exists; no admin UI integration |
| Attribute management | ✅ IMPLEMENTED | ProductForm typed attribute editor |
| Deactivate/Archive | ✅ IMPLEMENTED | Via moderation ARCHIVED |

**Finding F-ADM-01:** Admin product list uses generic `ManagementPage` component. While functional (with keyboard shortcuts), it lacks product-specific features like inline status badges, bulk moderation, and identifier display.
- **Severity:** P3 — Functional but not optimized for catalog management workflows.

---

## 13. Identifier / Deduplication Audit

| Identifier | Authoritative | Unique | Scope | Nullable | Normalization |
|------------|--------------|--------|-------|----------|---------------|
| GTIN | ✅ Yes | ✅ Yes (partial unique index) | Global | ✅ Yes | None |
| EAN | ✅ Yes | ✅ Yes (partial unique index) | Global | ✅ Yes | None |
| MPN | ✅ Yes | ❌ No (indexed only) | Global | ✅ Yes | None |
| SKU | ✅ Yes | ✅ Yes per (product_id, sku) | Per-product | ❌ No (variant) | None |
| Brand | ✅ Yes | ✅ Yes (slug unique) | Platform | ❌ No | Slug |
| Manufacturer | ⚠️ Not modeled | N/A | N/A | N/A | N/A |

**Finding F-DED-01:** GTIN/EAN uniqueness is global (not scoped to store or org). A GTIN entered by Store A prevents Store B from using the same GTIN. This is correct for canonical product deduplication but means cross-org GTIN conflicts are possible.
- **Severity:** INFO — This is the intended design for a canonical catalog.

**Finding F-DED-02:** No manufacturer entity exists. MPN is a free-text field on products. There is no way to look up all products by a specific manufacturer.
- **Severity:** P3 — Manufacturer could be modeled as a reference entity in a future phase.

**Deduplication Backend:**
- `GET /canonical/match?gtin=&ean=&mpn=` — finds existing product by identifiers
- `GET /canonical/duplicates` — finds potential duplicates by title + category
- `GET /admin/data-quality` — aggregate quality metrics
- `createProduct()` checks identifiers and returns existing product with `_dedup: true`

**Deduplication UI:** ❌ NOT IMPLEMENTED. The backend exists (Phase 7) but no UI surfaces duplicate detection to merchants or admins.

---

## 14. Media Audit

| Capability | Status | Evidence |
|------------|--------|----------|
| Product media table | ✅ IMPLEMENTED | product_media with sort_order, alt_text, mime_type |
| Variant media | ✅ IMPLEMENTED | variantId FK on product_media |
| Add media | ✅ IMPLEMENTED | POST /products/:id/media |
| Delete media | ✅ IMPLEMENTED | DELETE /products/:id/media/:mediaId |
| Reorder media | ✅ IMPLEMENTED | POST /products/:id/media/reorder |
| Presigned upload | ✅ IMPLEMENTED | POST /media/presign (S3) |
| Primary image | ⚠️ IMPLICIT | Lowest sort_order; no explicit is_primary flag |
| Thumbnail | ✅ IMPLEMENTED | thumb_url column |
| BlurHash | ✅ IMPLEMENTED | blurhash column for lazy loading |
| Arabic alt text | ✅ IMPLEMENTED | alt_text_ar column |
| Orphan cleanup | ❌ NOT IMPLEMENTED | No scheduled job to clean unreferenced media |
| Duplicate detection | ❌ NOT IMPLEMENTED | Same image can be added multiple times |
| Import media | ❌ NOT IMPLEMENTED | Import does not handle media |
| Admin UI | ⚠️ PARTIAL | Media tab in ProductDetails; add/reorder may be limited |
| Product Studio UI | ⚠️ PARTIAL | StepMedia exists; integration with edit mode needs verification |

**Finding F-MED-01:** Media management is functional at the API level but the UI is incomplete. The P3 deferred items list notes "media add/reorder UI unwired." This remains the case.
- **Severity:** P2 — Merchants cannot manage product images effectively.
- **Recommendation:** Include media UI completion in Product Studio hardening.

---

## 15. Publishing / Moderation Audit

### Current State Machine

```
DRAFT ──(admin APPROVED)──→ ACTIVE ──(admin ARCHIVED)──→ ARCHIVED
  ↑                                                      
  └──────(admin REJECTED → stays DRAFT)──────────────────┘
```

| Capability | Status | Evidence |
|------------|--------|----------|
| Create as DRAFT | ✅ IMPLEMENTED | Admin + merchant both create DRAFT |
| Admin approve | ✅ IMPLEMENTED | moderateProduct → status = ACTIVE |
| Admin reject | ✅ IMPLEMENTED | moderateProduct → stays DRAFT |
| Admin archive | ✅ IMPLEMENTED | moderateProduct → deletedAt set |
| validatePublish | ✅ IMPLEMENTED | Checks required attributes before ACTIVE |
| publishedAt timestamp | ✅ IMPLEMENTED | Set on transition to ACTIVE |
| Outbox event | ✅ IMPLEMENTED | catalog.product.published on ACTIVE |
| Optimistic locking | ✅ IMPLEMENTED | Atomic conditional UPDATE (BD-13 remediation) |
| Merchant submit for review | ❌ NOT IMPLEMENTED | No REVIEW/PENDING state |
| Merchant self-publish | ❌ NOT IMPLEMENTED | Only admins can approve |
| Batch moderation | ❌ NOT IMPLEMENTED | One product at a time |
| Moderation reason | ✅ IMPLEMENTED | Optional reason on REJECTED |
| Edit after publish | ✅ IMPLEMENTED | ACTIVE products can be edited (status unchanged) |
| Merchant edit on published | ✅ IMPLEMENTED | P6 allows edit; status not changed by edit |

**Finding F-PUB-01:** No formal REVIEW/PENDING_APPROVAL state exists. Merchants create DRAFT products; admins discover them through the moderation queue and approve/reject. There is no way for a merchant to signal "ready for review."
- **Severity:** P2 — Workflow gap for marketplace governance.
- **Recommendation:** Evaluate whether a SUBMITTED/REVIEW state is needed. This is a business decision that must be locked before implementation.

**Finding F-PUB-02:** Merchants cannot publish their own products. All publishing requires admin moderation. This is correct for a governed marketplace but creates a bottleneck if the platform scales.
- **Severity:** INFO — This is a deliberate business model choice, not a defect.

---

## 16. Search / Discovery Audit

| Capability | Status | Evidence |
|------------|--------|----------|
| Full-text search | ✅ IMPLEMENTED | tsvector + plainto_tsquery with Arabic normalization |
| Trigram fuzzy | ✅ IMPLEMENTED | similarity() > 0.3 fallback |
| SKU/barcode exact | ✅ IMPLEMENTED | Fast path — returns immediately |
| Category filter | ✅ IMPLEMENTED | categoryId query param |
| Brand filter | ✅ IMPLEMENTED | brandId query param |
| Attribute filter | ✅ IMPLEMENTED | attrFilters JSON → EXISTS subquery |
| Facets | ✅ IMPLEMENTED | Dynamic facet aggregation from typed attributes |
| Price filter | ❌ NOT IMPLEMENTED | No price range filter in search |
| Availability filter | ❌ NOT IMPLEMENTED | No isAvailable filter in search |
| Sorting | ⚠️ LIMITED | By relevance score or created_at DESC only |
| Pagination | ✅ IMPLEMENTED | limit + offset |
| Redis cache | ✅ IMPLEMENTED | Facets cached 120s; product detail cached 300s |
| Search analytics | ✅ IMPLEMENTED | search_queries table for logging |
| Store-scoped search | ✅ IMPLEMENTED | storeId filter |

**Finding F-SRCH-01:** Search does not filter by price range or availability. For a marketplace, this is a significant discovery gap.
- **Severity:** P2 — Buyers cannot narrow results by price.
- **Recommendation:** This belongs in a marketplace search milestone, not the next product management milestone.

**Assessment:** Search is functional for the current catalog scale but is not marketplace-ready. This is a separate milestone from product management and should not be included in the next phase.

---

## 17. Database / Performance Audit

### Index Inventory (Products)

| Index | Migration | Coverage |
|-------|-----------|----------|
| idx_products_store | 0004 | store_id |
| idx_products_category | 0004 | category_id (partial) |
| idx_products_brand | 0004 | brand_id (partial) |
| idx_products_status | 0004 | status = ACTIVE (partial) |
| idx_products_available | 0004 | is_available = TRUE (partial) |
| idx_products_title_trgm | 0007 | GIN trigram on title |
| idx_products_title | 0007 | GIN tsvector on title |
| idx_products_search_title | 0007 | GIN weighted title |
| idx_products_search_desc | 0007 | GIN weighted description |
| uq_products_gtin | 0025 | Unique GTIN (partial) |
| uq_products_ean | 0025 | Unique EAN (partial) |
| idx_products_ptype | 0025 | product_type_id (partial) |
| idx_products_store_status_cat | 0027 | Composite (store, status, category) |
| idx_products_mpn | 0027 | MPN (partial) |

### Index Inventory (Variants, Attributes, Offers)

| Index | Migration | Coverage |
|-------|-----------|----------|
| idx_variant_product_combkey | 0027 | (product_id, combination_key) partial |
| idx_pav_product_attr | 0027 | (product_id, attribute_definition_id) |
| idx_offer_store_status_product | 0027 | (store_id, status, product_id) |
| idx_offer_store_status_variant | 0027 | (store_id, status, variant_id) partial |
| idx_audit_resource_action_created | 0027 | (resource, action, created_at DESC) |
| idx_store_members_store | 0054 | store_id |
| idx_store_members_user | 0054 | user_id |
| idx_store_members_store_active | 0054 | (store_id) WHERE status = ACTIVE (partial) |

**Finding F-PERF-01:** No index on `products.updated_at` for optimistic locking conflict detection. The atomic conditional UPDATE uses `WHERE updated_at = $1` which does a sequential scan without an index.
- **Severity:** P3 — At current scale (<100K products), sequential scan is fast. At scale, this would need attention.

**Finding F-PERF-02:** The `product_attribute_values` table has a composite index on `(product_id, attribute_definition_id)` but no index on `attribute_definition_id` alone for facet aggregation queries.
- **Severity:** P3 — Facet queries use the composite index with a full scan of the definition_id column.

**Assessment:** Current indexing is adequate for the present catalog scale. Performance optimization is not the next milestone unless scale increases significantly.

---

## 18. Security Audit

| Check | Status | Evidence |
|-------|--------|----------|
| Organization isolation | ✅ PASS | assertStoreInOrg on product create; org-scoped queries |
| Store isolation | ✅ PASS | assertProductEditableByMerchant (P6) |
| Merchant membership | ✅ PASS | assertStoreMember checks ACTIVE membership |
| Privileged roles bypass | ✅ PASS | BYPASS_ROLES = [SUPER_ADMIN, ADMIN, MODERATOR] |
| Product IDOR | ✅ PASS | All product mutations go through assertProductEditableByMerchant |
| Variant IDOR | ✅ PASS | Via product → store → membership chain |
| Media IDOR | ✅ PASS | Via product → store → membership chain |
| Attribute IDOR | ✅ PASS | Via product → store → membership chain |
| Import IDOR | ⚠️ PARTIAL | Import endpoints check permission but not assertStoreMember |
| Export IDOR | ⚠️ PARTIAL | Export endpoint checks permission but not assertStoreMember |
| Offer/product boundary | ✅ PASS | Offer ownership separate from product ownership |
| Membership lifecycle | ✅ PASS | Deactivation takes effect immediately (no JWT cache) |
| Stale authorization | ✅ PASS | Server-side DB check on every request |
| Optimistic locking | ✅ PASS | Atomic conditional UPDATE |
| Mass assignment | ✅ PASS | Explicit field selection in update payloads |

**Finding F-SEC-01:** Import and export endpoints (`POST /stores/:storeId/imports`, `GET /stores/:storeId/products/export`) check `merchant:products:write` permission but do not call `assertStoreMember`. A user with the permission who is not a store member could potentially create import jobs or export products for a store.
- **Severity:** P1 — Authorization gap on import/export endpoints.
- **Evidence:** `catalog.controller.ts` lines 483-519 — createImportJob, stageImportRows, processImportJob do not call assertStoreMember.
- **Recommendation:** This should be fixed as part of the next milestone or as an immediate security patch.

**Finding F-SEC-02:** Offer creation (`POST /merchant/offers`) calls `assertStoreInOrg` but not `assertStoreMember`. The offer controller follows the pre-P6 authorization model.
- **Severity:** P2 — Offer creation should also require store membership for consistency with P6.
- **Evidence:** `catalog.offer.controller.ts` line 135 — only assertStoreInOrg, no assertStoreMember.

---

## 19. Concurrency Audit

| Race Scenario | Protected? | Mechanism |
|---------------|-----------|-----------|
| Product edit × Product edit | ✅ YES | Optimistic locking (updatedAt atomic conditional UPDATE) |
| Product edit × Import | ❌ NO | Import does not check updatedAt |
| Variant edit × Variant edit | ✅ YES | Optimistic locking on variant |
| Variant create × Variant create | ✅ YES | Unique (product_id, sku) + unique (product_id, combination_key) |
| Variant delete × Offer creation | ⚠️ PARTIAL | Cascade delete removes variant; offer FK has ON DELETE CASCADE |
| Product type change × Variant creation | ✅ YES | FOR UPDATE guard on type change (P2) |
| Attribute update × Product edit | ⚠️ PARTIAL | Attribute replacement is atomic; product edit does not lock attributes |
| Membership deactivation × Product mutation | ✅ YES | Server-side check on every request (P6) |
| Membership activation × Product mutation | ✅ YES | Server-side check on every request (P6) |
| Moderation × Product edit | ✅ YES | Atomic conditional UPDATE (BD-13 remediation) |
| Import × Import (same store) | ❌ NO | No mutual exclusion; two concurrent imports could create duplicate products |

**Finding F-CONC-01:** Import does not participate in optimistic locking. A concurrent import and Product Studio edit on the same product could result in a lost update.
- **Severity:** P2 — Data integrity risk.
- **Recommendation:** Add updatedAt check in import update path.

---

## 20. Arabic / RTL Audit

| Surface | Status | Evidence |
|---------|--------|----------|
| Product titleAr | ✅ IMPLEMENTED | Schema + API + ProductForm + StepIdentity |
| Product descriptionAr | ✅ IMPLEMENTED | Schema + API + ProductForm + StepIdentity |
| Category nameAr | ✅ IMPLEMENTED | Schema |
| Brand nameAr | ✅ IMPLEMENTED | Schema |
| Attribute nameAr | ✅ IMPLEMENTED | attribute_definitions.name_ar |
| Attribute option valueAr | ✅ IMPLEMENTED | attribute_options.value_ar |
| Product type nameAr | ✅ IMPLEMENTED | product_types.name_ar |
| Media alt_text_ar | ✅ IMPLEMENTED | product_media.alt_text_ar |
| dir="rtl" on Arabic inputs | ✅ IMPLEMENTED | StepIdentity, Variant Create, ProductForm |
| Full RTL layout | ❌ NOT IMPLEMENTED | No RTL page layout; only individual input fields |
| Arabic validation errors | ❌ NOT IMPLEMENTED | All error messages in English |
| Arabic navigation/UI text | ❌ NOT IMPLEMENTED | UI labels are English-only |

**Assessment:** Arabic field support is implemented at the data level. Full RTL layout and Arabic UI localization are not implemented. This is downstream UX work and should not be in the next milestone.

---

## 21. Findings and Severity Matrix

### P0 — Critical (None Found)

No P0 findings. The catalog system is production-functional after P6 closure.

### P1 — High

| ID | Finding | Section | Impact |
|----|---------|---------|--------|
| F-SEC-01 | Import/export endpoints lack assertStoreMember | §18 | Authorization gap — non-members can import/export |
| F-PS-01 | Create flow lacks beforeunload protection | §11 | Data loss — merchants lose work on accidental navigation |

### P2 — Medium

| ID | Finding | Section | Impact |
|----|---------|---------|--------|
| F-ID-02 | No store-scoped SKU uniqueness at product level | §6 | Potential SKU confusion across products |
| F-LC-01 | No REVIEW/PENDING_APPROVAL status | §6 | Cannot signal "ready for review" |
| F-JB-01 | Dual image storage (JSONB + product_media) | §6 | Data inconsistency risk |
| F-VAR-01 | Type change doesn't validate existing variants | §7 | Variant dimension inconsistency |
| F-IMP-01 | Import loads all rows at once | §10 | Memory pressure for large imports |
| F-IMP-02 | Import doesn't participate in optimistic locking | §10 | Lost update on concurrent import + edit |
| F-PS-02 | No product list navigation in Studio | §11 | UX gap for product management |
| F-PUB-01 | No submit-for-review workflow | §15 | Marketplace governance gap |
| F-MED-01 | Media add/reorder UI incomplete | §14 | Merchants can't manage images |
| F-SEC-02 | Offer creation lacks assertStoreMember | §18 | Authorization inconsistency |
| F-SRCH-01 | No price/availability filter in search | §16 | Discovery gap |
| F-CONC-01 | Import × edit race unprotected | §19 | Lost update risk |

### P3 — Low

| ID | Finding | Section | Impact |
|----|---------|---------|--------|
| F-ID-01 | MPN not unique | §6 | Cross-manufacturer MPN collisions possible |
| F-TAX-01 | Category path written inconsistently | §9 | BFS workaround needed |
| F-ATTR-01 | Import doesn't populate typed attributes | §8 | Manual completion required |
| F-ATTR-02 | Export doesn't include typed attributes | §8 | Incomplete export data |
| F-DED-02 | No manufacturer entity | §13 | MPN is free-text only |
| F-ADM-01 | Admin list uses generic ManagementPage | §12 | Not optimized for catalog |
| F-PERF-01 | No index on products.updated_at | §17 | Sequential scan on locking |
| F-PERF-02 | No standalone index on attribute_definition_id | §17 | Facet query optimization |

### INFO

| ID | Finding | Section | Impact |
|----|---------|---------|--------|
| F-DED-01 | GTIN/EAN uniqueness is global | §13 | Intentional canonical design |
| F-PUB-02 | Merchants cannot self-publish | §15 | Deliberate business model |

---

## 22. Candidate Next Milestones

### Candidate A — Product Identifier & Deduplication
Backend exists (Phase 7). UI would add GTIN dedup warnings, duplicate detection dashboard, identifier management. **Assessment:** Backend is solid; UI is convenience, not critical.

### Candidate B — Product Studio UX / Production Hardening
Fix beforeunload, media UI, product list navigation, create flow polish. **Assessment:** Directly impacts daily merchant workflows. High UX value.

### Candidate C — Admin Product Management UX / Bulk Operations
Dedicated product list, bulk moderation, identifier display. **Assessment:** Admin efficiency improvement. Lower urgency than merchant-facing gaps.

### Candidate D — Product Publishing & Moderation Workflow
REVIEW state, submit-for-review, batch moderation. **Assessment:** Requires business decision on workflow. Important for marketplace governance.

### Candidate E — Catalog Performance & Index Optimization
Missing indexes, query optimization, import chunking. **Assessment:** Not needed at current scale. Premature optimization.

### Candidate F — Import/Export Production Hardening
XLSX support, chunked processing, typed attribute import/export, optimistic locking. **Assessment:** Important for large catalogs but not the most critical gap.

### Candidate G — Store Membership Management
Admin UI for add/remove/role-change/deactivate members, last-owner protection, audit events. **Assessment:** P6 foundation exists; UI is missing. Critical for governance.

### Candidate H — Catalog Search / Discovery Readiness
Price filters, availability filters, sorting options. **Assessment:** Marketplace milestone, not product management. Separate phase.

### Candidate I — Media Management
Complete media UI, orphan cleanup, duplicate detection. **Assessment:** Part of Product Studio hardening; not standalone.

### Candidate J — Import/Export Security Patch
Fix assertStoreMember gap on import/export endpoints. **Assessment:** Should be done immediately or as part of next milestone.

---

## 23. Business Priority Ranking

| Rank | Candidate | Business Value | Customer Impact | Security Risk | Data Integrity Risk | Production Readiness | Overall |
|------|-----------|---------------|-----------------|---------------|--------------------|--------------------|---------|
| 1 | **G + B: Store Membership Management + Product Studio Hardening** | HIGH | HIGH | HIGH (F-SEC-01) | MEDIUM | LOW without these | **#1** |
| 2 | D: Publishing & Moderation Workflow | HIGH | MEDIUM | LOW | LOW | MEDIUM | #2 |
| 3 | F: Import/Export Production Hardening | MEDIUM | MEDIUM | MEDIUM | HIGH | MEDIUM | #3 |
| 4 | A: Product Identifier & Deduplication UI | MEDIUM | LOW | LOW | MEDIUM | MEDIUM | #4 |
| 5 | C: Admin Product Management UX | MEDIUM | LOW | LOW | LOW | MEDIUM | #5 |
| 6 | I: Media Management | LOW | MEDIUM | LOW | LOW | MEDIUM | #6 |
| 7 | H: Search / Discovery | HIGH | HIGH | LOW | LOW | MEDIUM | #7 (separate milestone) |
| 8 | E: Performance Optimization | LOW | LOW | LOW | LOW | HIGH | #8 |

**Rationale for #1:** P6 established the store-level authorization model, but:
1. No UI exists to manage the memberships that P6 depends on.
2. Import/export endpoints have an authorization gap (F-SEC-01, P1).
3. The Product Studio create flow can lose merchant data (F-PS-01, P1).
4. Media management UI is incomplete.

These are the most critical gaps to production readiness. Combining membership management with Product Studio hardening addresses the two P1 findings and the P6 deferred items in a single milestone.

---

## 24. Recommended Next Milestone

```
NEXT MILESTONE: P7 — Store Membership Management & Product Studio Production Hardening
```

### Scope

**Part A — Store Membership Management:**
1. Admin UI for store membership CRUD (add member, remove member, change role, activate/deactivate)
2. Last-owner protection (prevent removing/deactivating the last OWNER)
3. Membership audit events (store_member.added, store_member.removed, store_member.role_changed, store_member.activated, store_member.deactivated)
4. Fix F-SEC-01: Add assertStoreMember to import/export endpoints
5. Fix F-SEC-02: Add assertStoreMember to offer creation endpoint

**Part B — Product Studio Production Hardening:**
1. Add beforeunload protection to create flow (fix F-PS-01)
2. Complete media add/reorder/delete UI in both create and edit modes
3. Add product list navigation (edit link from catalog → studio edit)
4. Add "Edit" action button on merchant catalog page
5. Verify end-to-end Product Studio flow in browser

**Part C — Import/Export Security:**
1. Patch assertStoreMember on all import endpoints
2. Patch assertStoreMember on export endpoint

### Explicitly Out of Scope

- REVIEW/PENDING_APPROVAL workflow (Candidate D — separate milestone)
- Import chunking/resumability (Candidate F — separate milestone)
- GTIN deduplication UI (Candidate A — separate milestone)
- Admin product list redesign (Candidate C — separate milestone)
- Search/discovery improvements (Candidate H — separate milestone)
- Arabic/RTL full layout (downstream UX work)
- Performance/index optimization (Candidate E — not needed at current scale)
- Migration 0055 creation (audit only — implementation phase decides)

---

## 25. Migration 0055 Decision

```
CONDITIONAL
```

**If** membership management requires additional schema (e.g., membership history table, invited_by column, or membership audit trail columns on store_members), **then** migration 0055 will be needed.

**If** the existing `store_members` table is sufficient for basic CRUD (add, remove, role change, activate/deactivate), **then** no migration is needed for Part A.

**Parts B and C** do not require schema changes.

**Recommendation:** Plan for a minimal migration 0055 that adds any necessary columns to `store_members` (e.g., `invited_by`, `joined_at`) if the business decisions require them. Do not create the migration during this audit.

---

## 26. Business Decisions Required

Before P7 implementation can begin, the following business decisions must be explicitly locked:

| ID | Decision | Options | Impact |
|----|----------|---------|--------|
| BD-P7-01 | Who can manage store memberships? | (a) Org admins only, (b) Store owners + org admins, (c) SUPER_ADMIN only | Determines authorization model for membership CRUD |
| BD-P7-02 | Last-owner protection rule | (a) Hard block — cannot remove/deactivate last OWNER, (b) Soft warning with confirmation | Determines enforcement level |
| BD-P7-03 | Can a user be a member of multiple stores in the same org? | (a) Yes, (b) No, one store per user per org | Determines unique constraint design |
| BD-P7-04 | Should membership changes require approval? | (a) Immediate effect, (b) Requires admin approval | Determines workflow complexity |
| BD-P7-05 | Should Product Studio support product-level vs variant-level media? | (a) Product-level only, (b) Both product and variant | Determines media UI scope |
| BD-P7-06 | Should import/export require store membership? | (a) Yes (consistent with P6), (b) No (org-level is sufficient) | Determines authorization model for import |
| BD-P7-07 | What audit events are required for membership lifecycle? | (a) add/remove/role_change, (b) Full CRUD events + activation/deactivation | Determines audit scope |

These decisions must be locked in a **P7 Business Rules & Architecture Lock** document before implementation begins.

---

## 27. Proposed Scope

### Part A — Store Membership Management (Estimated: 4-5 days)

| Task | Description |
|------|-------------|
| A1 | Admin membership list page (shows all members of a store with role, status) |
| A2 | Add member dialog (search user, select role OWNER/ADMIN/MEMBER) |
| A3 | Remove member action (with last-owner protection) |
| A4 | Change role action (with last-owner protection) |
| A5 | Activate/deactivate member action |
| A6 | Backend: membership CRUD endpoints with authorization |
| A7 | Backend: last-owner protection service logic |
| A8 | Backend: audit event recording for all membership changes |
| A9 | Fix F-SEC-01: assertStoreMember on import/export |
| A10 | Fix F-SEC-02: assertStoreMember on offer creation |

### Part B — Product Studio Hardening (Estimated: 3-4 days)

| Task | Description |
|------|-------------|
| B1 | Add beforeunload protection to create flow |
| B2 | Complete media upload UI (drag-and-drop, progress indicator) |
| B3 | Complete media reorder UI (drag-and-drop ordering) |
| B4 | Complete media delete UI (confirmation dialog) |
| B5 | Add "Edit" action to merchant catalog product list |
| B6 | Verify edit link routing from catalog → studio edit |
| B7 | Browser verification of complete create + edit flows |

### Part C — Security Patch (Estimated: 0.5 day)

| Task | Description |
|------|-------------|
| C1 | Add assertStoreMember to createImportJob |
| C2 | Add assertStoreMember to stageImportRows |
| C3 | Add assertStoreMember to processImportJob |
| C4 | Add assertStoreMember to exportProductsCsv |

---

## 28. Explicitly Out of Scope

The following are explicitly NOT part of P7:

- REVIEW/PENDING_APPROVAL product status workflow
- Product publishing workflow changes
- Import chunking, resumability, or XLSX support
- Typed attribute import/export
- GTIN deduplication UI
- Admin product list redesign
- Bulk admin moderation
- Search/discovery improvements (price filters, availability)
- Performance/index optimization
- Full Arabic/RTL layout
- Manufacturer entity modeling
- Category path correction
- Media orphan cleanup
- Any migration 0055+ creation (unless business decisions require it)

---

## 29. Dependencies

| Dependency | Status | Impact |
|------------|--------|--------|
| P6 CLOSED | ✅ SATISFIED | store_members table exists |
| Migration 0054 applied | ✅ SATISFIED | store_members operational |
| assertStoreMember + assertProductEditableByMerchant | ✅ SATISFIED | Authorization helpers available |
| Business decisions locked (BD-P7-01 through BD-P7-07) | ❌ REQUIRED | Must be locked before implementation |
| Admin UI framework | ✅ AVAILABLE | ManagementPage, ProductForm, detail components |
| Product Studio framework | ✅ AVAILABLE | useProductStudio, useProductStudioEdit hooks |
| AuditService | ✅ AVAILABLE | Audit event recording infrastructure |

---

## 30. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Business decisions take too long | MEDIUM | HIGH | Lock decisions in dedicated session before implementation |
| Membership CRUD reveals edge cases | MEDIUM | MEDIUM | Comprehensive test coverage from day one |
| Product Studio media UI is more complex than expected | MEDIUM | MEDIUM | Scope media to basic add/delete/reorder; defer drag-and-drop |
| Import/export authorization fix breaks existing integrations | LOW | HIGH | Backward-compatible: only adds additional check |
| beforeunload has browser compatibility issues | LOW | LOW | Standard Web API; all modern browsers support it |

---

## 31. Acceptance Criteria Proposal

### Part A — Store Membership Management

| ID | Criterion |
|----|-----------|
| P7-A01 | Admin can view all members of a store they own/admin |
| P7-A02 | Admin can add a user as OWNER, ADMIN, or MEMBER |
| P7-A03 | Admin can remove a member (with last-owner protection) |
| P7-A04 | Admin can change a member's role |
| P7-A05 | Admin can activate/deactivate a member |
| P7-A06 | Last-owner protection prevents removing/deactivating the last OWNER |
| P7-A07 | All membership changes generate audit events |
| P7-A08 | Import/export endpoints require store membership |
| P7-A09 | Offer creation requires store membership |
| P7-A10 | Non-members cannot import, export, or create offers for a store |

### Part B — Product Studio Hardening

| ID | Criterion |
|----|-----------|
| P7-B01 | Create flow shows browser warning on unsaved changes |
| P7-B02 | Merchants can upload images in create and edit modes |
| P7-B03 | Merchants can reorder images in create and edit modes |
| P7-B04 | Merchants can delete images in create and edit modes |
| P7-B05 | Merchant catalog page has "Edit" button linking to studio edit |
| P7-B06 | Complete create flow works end-to-end in browser |
| P7-B07 | Complete edit flow works end-to-end in browser |

### Part C — Security

| ID | Criterion |
|----|-----------|
| P7-C01 | All import endpoints call assertStoreMember |
| P7-C02 | Export endpoint calls assertStoreMember |
| P7-C03 | Non-member import attempt → 403 Forbidden |
| P7-C04 | Non-member export attempt → 403 Forbidden |
| P7-C05 | Existing regression tests still pass |

---

## 32. Recommended Implementation Phases

| Phase | Name | Duration | Dependencies |
|-------|------|----------|--------------|
| Phase 1 | Business Rules & Architecture Lock | 1 session | This audit |
| Phase 2 | Security Patch (F-SEC-01, F-SEC-02) | 0.5 day | Phase 1 |
| Phase 3 | Membership Backend (CRUD + last-owner + audit) | 2 days | Phase 1 |
| Phase 4 | Membership Admin UI | 2 days | Phase 3 |
| Phase 5 | Product Studio beforeunload + navigation | 1 day | Phase 1 |
| Phase 6 | Product Studio Media UI | 2 days | Phase 5 |
| Phase 7 | Independent Runtime Verification | 1 day | Phases 2-6 |
| Phase 8 | Release Closure | 0.5 day | Phase 7 |

**Total estimated duration:** 8-10 days including verification and closure.

---

## 33. Final Architecture Gate

```
ARCHITECTURE AUDIT: GO WITH CONDITIONS
```

**Conditions:**
1. Business decisions BD-P7-01 through BD-P7-07 must be locked before implementation begins.
2. Security findings F-SEC-01 and F-SEC-02 should be patched as the first implementation task.
3. P6 deferred items (store membership UI, last-owner protection, audit events) are formally promoted to P7 scope.

```
RECOMMENDED NEXT MILESTONE:
P7 — Store Membership Management & Product Studio Production Hardening

IMPLEMENTATION MAY BEGIN:
ONLY AFTER BUSINESS / ARCHITECTURE LOCK
```
