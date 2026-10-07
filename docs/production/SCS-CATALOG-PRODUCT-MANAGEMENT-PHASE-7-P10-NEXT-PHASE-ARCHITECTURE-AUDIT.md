# SCS Catalog Product Management — Phase 7 / P10 Next Phase Architecture & Business Audit

**Document:** SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-7-P10-NEXT-PHASE-ARCHITECTURE-AUDIT.md
**Date:** 2026-10-07
**Branch:** develop
**HEAD:** 8654de39b7e35531fd8919327e959ed487de4895
**Latest migration:** 0055_import_chunking_inventory_integrity.sql
**Predecessor:** P9 CLOSED / PASS (P9 Release Closure, 2026-10-07)

---

## 1. Executive Summary

This audit examines the SCS Catalog/Product Management platform after P9 (Search Enhancement & Export Completeness) closure. The platform has completed nine milestones spanning taxonomy, canonical products, merchant offers, import/export hardening, search filters, and typed-attribute export.

**Key findings:**
- 0 P0/P1 blockers discovered
- 0 P2 defects remaining (all four P2 findings from P8 audit are CLOSED via P9)
- 14 P3 findings remain (previously deferred, still relevant)
- 2 new P2 findings: mobile search lacks P9 filters; no product submission workflow
- Production readiness: **GREEN**

**Recommended next milestone:** P10 — Merchant Import UX & XLSX Production Pipeline

**Migration decision:** NO migration required.

---

## 2. P9 Baseline

| Item | Value |
|------|-------|
| Branch | develop |
| HEAD | 8654de39b7e35531fd8919327e959ed487de4895 |
| Latest migration | 0055_import_chunking_inventory_integrity.sql |
| P9 acceptance | NP-A01..NP-A15: ALL PASS |
| P9 tests | 380/380 PASS |
| P9 TypeScript | API 0 errors, Web 0 errors |
| P9 Nest build | 0 issues, 303 files |
| P9 Web build | EXIT 0, 39/39 pages |
| P9 PostgreSQL integration | 28/28 PASS |
| P9 Performance | PASS (combined: 79.9ms median) |
| P9 Security | PASS |
| P9 defects | P0=0, P1=0, P2=0 |
| P9 Architecture deviations | NONE |

---

## 3. Current Architecture

### Domain Model (Verified from source)

```
Category (materialized path hierarchy)
   ↓
Product Type / Template (conditional rules engine)
   ↓
Canonical Product (nullable store_id — platform-shared)
   ├── Attributes (product_attribute_values — PRODUCT scope, authoritative)
   ├── Variants (product_variants + variant_attribute_values — VARIANT scope)
   │   └── combination_key (partial unique index for dedup)
   ├── Media (product_media — optional variant_id, S3 presigned uploads)
   ├── Identifiers (gtin, ean, mpn — partial unique indexes)
   └── Sources (product_sources)
   ↓
Merchant Offer (store-owned, pricing/stock/MOQ/lead-time)
   ├── Price List → Price Tiers (quantity breaks)
   └── Warehouse → Inventory Items (qty_on_hand, qty_reserved)
   ↓
Merchant Store
   ├── Membership (store_members — ACTIVE/INACTIVE, last-owner protection)
   ├── Products / Offers / Inventory
   └── Import Jobs → Import Job Chunks (P8 hardening)
```

### API Module Inventory (Verified from apps/api/src/modules/)

| Module | Controller | Service | Schema | Key Capabilities |
|--------|-----------|---------|--------|-----------------|
| catalog | 745 lines | 3546 lines | 238 lines | Products, variants, media, categories, brands, import/export, search, dedup |
| catalog (offer) | 211 lines | 710 lines | 70 lines | Offer CRUD, price resolution, store-scoped offers |
| catalog (taxonomy) | 264 lines | 1098 lines | 171 lines | Product types, attributes, conditional rules |
| catalog-import | 203 lines | 724 lines | 93 lines | Admin XLSX import pipeline (parser, planner, resolver, validator, executor) |
| inventory | 173 lines | 659 lines | 40 lines | Stock ledger, movements, reservations, transfers |
| pricing | 99 lines | 252 lines | 39 lines | Price lists, tiers, resolution |
| merchant | 268 lines | 669 lines | 112 lines | Store management, verification |
| store-membership | 206 lines | 476 lines | — | Membership CRUD, last-owner protection |
| admin | 392 lines | 991 lines | — | Moderation, governance, KPIs, audit logs |
| search | — | 549 lines | 21 lines | FTS+trigram, facets, SKU fast-path, P9 filters |

### Web App Pages (43 pages verified)

Key merchant pages: catalog, product-studio (6-step wizard), import (5-step wizard), inventory, offers, pricing, promotions, orders, deliveries, warehouses, members, store, organization.

Key buyer pages: search (Amazon-style with P9 filters), product detail, stores, cart, checkout, orders, compare, favorites, reviews.

### Admin App Pages (45 pages verified)

Key admin pages: products (moderation queue), product-types (builder), categories, brands, attributes, catalog-import, data-quality, audit, organizations, verification, offers, KPIs.

### Mobile App (128 Dart files verified)

Buyer: search (with barcode scanner), product detail, cart, checkout, orders, stores, reviews, notifications, profile.
Merchant: dashboard, catalog, inventory, offers, orders, product edit, store profile, registration.

---

## 4. Current Functional Capabilities

### Complete Capabilities (FACT)

| Capability | Evidence |
|------------|----------|
| Server-side price range filtering | search.service.ts L56-63, L222-228 |
| Server-side availability filtering | search.service.ts L67-78, L229-237 |
| Server-side sorting (4 modes) | search.service.ts L83-98, L242-258 |
| Dynamic attribute facets (backend) | search.service.ts L457+, GET /v1/search/facets |
| Typed attribute CSV export | catalog.service.ts exportProductsCsv |
| One-row-per-variant export | catalog.service.ts variant iteration |
| Export/import round-trip | attr:<code> column symmetry |
| Store membership authorization | assertStoreInOrg + assertStoreMember |
| Chunked import processing | import_job_chunks, 100 rows/chunk |
| Import cancellation/retry | POST imports/:id/cancel, POST imports/:id/retry |
| Product moderation (admin) | POST/PATCH admin/products/:id/moderate |
| Product Studio (merchant) | 6-step wizard: Identity→Specs→Variants→Offer→Media→Review |
| Admin product CRUD | ManagementPage with moderation integration |
| Admin variant management | /variants/[id]/edit, /products/[id]/variants/new |
| GTIN/EAN/MPN dedup | GET /canonical/match, GET /canonical/duplicates |
| Data quality dashboard | GET /admin/data-quality |
| Optimistic locking | updatedAt atomic conditional UPDATE on products/variants |
| Audit trail | AuditService on catalog/offer lifecycle |
| Media presigned uploads | POST /media/presign → S3 PUT |
| Price resolution | resolveOfferPrices shared resolver |
| Stock ledger | inventory_items + stock_movements (append-only) |
| Inventory CHECK constraints | qty_on_hand >= 0, qty_reserved >= 0 (migration 0055) |

---

## 5. Previously Deferred Work Review

### From P8 Audit (all P2 findings CLOSED by P9)

| ID | Original Finding | Current Status |
|----|-----------------|----------------|
| F-P9-05 | Export missing typed attributes | **CLOSED** — P9 delivered attr:<code> columns |
| F-P9-14 | No server-side price filter | **CLOSED** — P9 delivered priceMin/priceMax |
| F-P9-15 | No server-side availability filter | **CLOSED** — P9 delivered inStock |
| F-P9-16 | No server-side sort | **CLOSED** — P9 delivered 4 sort modes |

### From P9 Audit (P3 findings — still deferred)

| ID | Original Finding | Status | Still Relevant? |
|----|-----------------|--------|-----------------|
| F-P9-01 | No product publishing/moderation workflow | PARTIAL — moderation exists (APPROVE/REJECT/ARCHIVE) but no SUBMITTED state | YES — merchants cannot submit for review |
| F-P9-02 | No variant media management UI | OPEN | YES — schema supports it, no UI |
| F-P9-03 | No orphan media cleanup | OPEN | YES — S3 orphans possible |
| F-P9-04 | No manufacturer entity | OPEN | LOW — GTIN/EAN/MPN sufficient for now |
| F-P9-06 | No XLSX import support (merchant) | OPEN | YES — admin has XLSX, merchant CSV only |
| F-P9-07 | No import preview/validation UX | OPEN | YES — rows processed without pre-validation |
| F-P9-08 | No inventory receiving workflow | OPEN | MEDIUM — uses adjustStock |
| F-P9-09 | No cycle count support | OPEN | LOW — not critical for B2B MVP |
| F-P9-10 | No inventory valuation | OPEN | LOW — not critical for B2B MVP |
| F-P9-11 | No price validity periods | OPEN | MEDIUM — no temporal pricing |
| F-P9-12 | No price history | OPEN | MEDIUM — no price change audit |
| F-P9-13 | No promotions/discounts wiring | PARTIAL — promotions module exists with CRUD | MEDIUM — CRUD exists, not wired to cart |
| F-P9-17 | No search freshness metrics | OPEN | LOW — operational concern |

### From P9 Closure (newly deferred)

| Item | Status | Still Relevant? |
|------|--------|-----------------|
| Dynamic search facets (web UI wiring) | Backend COMPLETE, web UI not using facets | YES — facets endpoint exists but unused |
| Full-text search performance (551ms median) | OPEN | MEDIUM — inherent FTS cost |

### New Findings (discovered in this audit)

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| F-P10-01 | P2 | Mobile search lacks P9 server-side filters | api_service.dart L239-245: only q/categoryId/brandId/storeId/limit/offset; search_screen.dart L114-117: "price/in-stock/sort intentionally absent" |
| F-P10-02 | P2 | No product submission workflow for merchants | admin.service.ts L806: moderation is admin-initiated only; merchants set status directly via PATCH products/:id |

---

## 6. Business Gap Analysis

### Platform Administrators

| Capability | Status | Gap |
|------------|--------|-----|
| Manage catalog (categories, brands) | COMPLETE | — |
| Manage product types | COMPLETE | Builder UI with conditional rules |
| Manage attributes | COMPLETE | Full CRUD with groups |
| Manage products | COMPLETE | Moderation queue + detail |
| Moderate products | COMPLETE | APPROVE/REJECT/ARCHIVE with optimistic locking |
| Detect duplicates | COMPLETE | GET /canonical/duplicates |
| Manage identifiers | COMPLETE | GTIN/EAN/MPN with partial unique indexes |
| Manage media | PARTIAL | No orphan cleanup, no variant-specific UI |
| Investigate catalog problems | COMPLETE | Data quality dashboard, corrupted variants, audit logs |
| Correct catalog data safely | COMPLETE | Optimistic locking, audit trail |
| Admin XLSX import | COMPLETE | Full pipeline: parser→planner→resolver→validator→executor |

### Merchants

| Capability | Status | Gap |
|------------|--------|-----|
| Create products | COMPLETE | Product Studio 6-step wizard |
| Edit products | COMPLETE | Product Studio edit mode |
| Manage variants | COMPLETE | Step 3 of Product Studio |
| Manage attributes | COMPLETE | Step 2 (specifications) |
| Upload/import products | PARTIAL | CSV only; no XLSX, no preview |
| Export products | COMPLETE | CSV with typed attributes, one row per variant |
| Manage media | PARTIAL | Presigned upload works; no variant-specific UI |
| Publish products | PARTIAL | Can set status directly; no submission workflow |
| Understand validation failures | PARTIAL | Error log exists; no downloadable error file |
| Multi-store management | COMPLETE | Store selector in Product Studio |
| Search/filter (mobile) | GAP | No P9 filters on mobile search |

### Buyers

| Capability | Status | Gap |
|------------|--------|-----|
| Search (web) | COMPLETE | P9 filters, facets, pagination |
| Search (mobile) | PARTIAL | Missing price/availability/sort filters |
| Filter by price | COMPLETE (web) | Server-side priceMin/priceMax |
| Filter by availability | COMPLETE (web) | Server-side inStock |
| Sort results | COMPLETE (web) | 4 sort modes server-side |
| Dynamic facets | PARTIAL | Backend exists, web UI has attr filters, mobile has none |
| Product detail | COMPLETE | Variant selector, offer comparison |
| Mobile discovery | GAP | No barcode-to-search, no P9 filters |

---

## 7. Search Audit

### Complete (FACT)

| Capability | Evidence |
|------------|----------|
| FTS + trigram dual path | search.service.ts L146-333 |
| SKU/barcode fast path | search.service.ts L150-156 |
| Attribute filters (attrFilters) | search.service.ts L51-52, buildAttributeFilterSql |
| Dynamic facets (backend) | GET /v1/search/facets, search.service.ts L457+ |
| Category/brand filters | search.service.ts L36-49 |
| Price range filter | search.service.ts L56-63 (single EXISTS) |
| Availability filter | search.service.ts L67-78 (4-table join) |
| Sort (4 modes) | search.service.ts L83-98 |
| Redis facet caching | search.service.ts L435-450 (120s TTL) |
| Product card enrichment | product-card.ts (340 lines) |

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| S-01 | P2 | Mobile search has no P9 filters | api_service.dart L239-245, search_screen.dart L114-117 |
| S-02 | P3 | Web UI does not use dynamic facets endpoint for filter sidebar | SearchPageClient.tsx fetches facets but rendering is basic |
| S-03 | P3 | Text search + P9 filters: 551ms median on 10K products | p9-performance.postgres.spec.ts output |
| S-04 | P3 | No search relevance tuning / ranking weights | sim_score used but no configurable weights |

---

## 8. Import / Export Audit

### Admin Import Pipeline (COMPLETE — FACT)

The admin catalog-import module (catalog-import/) provides a full XLSX pipeline:
- excel-parser.service.ts (250 lines): XLSX sheet extraction
- excel-planner.service.ts (548 lines): Entity dependency ordering
- excel-resolver.service.ts (192 lines): Reference resolution
- excel-validator.service.ts (944 lines): Per-entity validation
- excel-executor.service.ts (984 lines): Transactional persistence
- template-generator.service.ts (651 lines): Import template download

### Merchant Import (PARTIAL)

| Capability | Status | Evidence |
|------------|--------|----------|
| CSV upload | COMPLETE | POST stores/:storeId/imports |
| Column mapping | COMPLETE | Web import page step 2 |
| Chunked processing | COMPLETE | import_job_chunks (P8) |
| Cancellation | COMPLETE | POST imports/:id/cancel |
| Retry | COMPLETE | POST imports/:id/retry |
| Stale lock recovery | COMPLETE | 30-minute threshold |
| XLSX support | MISSING | fileType column exists but only CSV parsed |
| Import preview | MISSING | Rows processed without pre-validation feedback |
| Downloadable error file | MISSING | error_log JSONB exists but no file download |
| Progress reporting | PARTIAL | Chunk-level stats exist; no real-time push |

### Export (COMPLETE after P9)

| Capability | Status | Evidence |
|------------|--------|----------|
| CSV product export | COMPLETE | exportProductsCsv |
| Typed attribute export | COMPLETE | attr:<code> columns (P9) |
| Variant-level export | COMPLETE | One row per variant (P9) |
| Round-trip compatibility | COMPLETE | Import can re-process export output |
| XLSX export | MISSING | Not implemented |

---

## 9. Catalog Data Quality Audit

### Complete (FACT)

| Check | Evidence |
|-------|----------|
| GTIN/EAN partial unique indexes | migration 0025 |
| MPN partial index | migration 0027 (idx_products_mpn) |
| Identifier match endpoint | GET /canonical/match |
| Duplicate detection | GET /canonical/duplicates |
| Data quality metrics | GET /admin/data-quality |
| Corrupted variant detection | GET /admin/corrupted-variants |
| Variant combination_key dedup | Partial unique index (product_id, combination_key) |
| JSONB attributes deprecated | catalog.schema.ts L85-86, L106-107 (do NOT read or write) |
| Typed attribute authority | product_attribute_values, variant_attribute_values |

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| DQ-01 | P3 | No automated duplicate resolution | Admin can detect but not merge/resolve |
| DQ-02 | P3 | No product completeness scoring | Product Studio has completeness() but not persisted |
| DQ-03 | P3 | No bulk data correction tool | Individual edits only |

---

## 10. Admin Product Management Audit

### Complete (FACT)

| Capability | Evidence |
|------------|----------|
| Product moderation queue | admin.controller.ts L247-250, admin.service.ts L482-484 |
| Moderation actions | POST/PATCH moderateProduct (APPROVE/REJECT/ARCHIVE) |
| Optimistic locking on moderation | admin.service.ts L836-870 (atomic conditional UPDATE) |
| Product detail/edit | /products/[id]/edit, /products/[id]/page.tsx |
| Variant management | /variants/[id]/edit, /products/[id]/variants/new |
| Category management | /categories/page.tsx (484 lines) |
| Brand management | /brands/page.tsx (436 lines) |
| Attribute management | /attributes/page.tsx (483 lines) |
| Product type builder | /product-types/[id]/page.tsx (503 lines) |
| Data quality dashboard | /data-quality/page.tsx (189 lines) |
| Audit logs | /audit/page.tsx (269 lines) |
| Catalog import (admin XLSX) | /catalog-import/page.tsx (726 lines) |

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| AD-01 | P3 | No bulk moderation (approve/reject multiple) | Each moderation is individual |
| AD-02 | P3 | No product merge/dedup UI | Detection exists, resolution does not |

---

## 11. Merchant Product Studio Audit

### Complete (FACT)

| Capability | Evidence |
|------------|----------|
| 6-step creation wizard | product-studio/page.tsx (145 lines) |
| Identity step (canonical dedup) | StepIdentity with searchCanonical |
| Specifications step (typed attrs) | StepSpecifications |
| Variants step | StepVariants with existing variant loading |
| Offer step (pricing/stock) | StepOffer with store selection |
| Media step (presigned upload) | StepMedia |
| Review step (completeness score) | StepReview with completeness() |
| Edit mode | product-studio/[id]/edit/page.tsx (282 lines) |
| Product attribute CRUD | GET/PUT products/:id/attribute-values |
| Variant attribute CRUD | GET/PUT products/:productId/variants/:variantId/attribute-values |
| Store membership check | assertProductEditableByMerchant |

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| PS-01 | P3 | No draft autosave | Manual save only; data loss on navigation |
| PS-02 | P3 | No image drag-reorder | Media reorder endpoint exists but UI may not use it |
| PS-03 | P3 | No variant-specific media assignment | product_media.variant_id exists but Studio doesn't expose it |

---

## 12. Mobile Audit

### Complete (FACT)

| Capability | Evidence |
|------------|----------|
| Search with text/voice | search_screen.dart (530 lines) |
| Barcode scanner | mobile_scanner integration, search_screen.dart L189-191 |
| Category filter | _selectedCategory with Home handoff |
| Brand filter | _selectedBrand with bottom sheet |
| Attribute filters | _attrFilters (PHASE COS-15) |
| Pagination | Load-more with offset/limit |
| Product detail | product_detail_screen.dart (937 lines) |
| Cart/checkout | cart_screen.dart, checkout_screen.dart |
| Merchant dashboard | merchant_dashboard_screen.dart (280 lines) |
| Merchant catalog | merchant_catalog_screen.dart (385 lines) |
| Merchant inventory | inventory_screen.dart (494 lines) |
| Merchant offers | merchant_offers_screen.dart (407 lines) |
| Merchant orders | merchant_orders_screen.dart (500 lines) |
| Product edit | product_edit_screen.dart (538 lines) |

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| M-01 | P2 | No P9 price range filter | api_service.dart search() L239-245: no priceMin/priceMax params |
| M-02 | P2 | No P9 availability filter | api_service.dart search(): no availability param |
| M-03 | P2 | No P9 sort options | api_service.dart search(): no sort param |
| M-04 | P3 | No XLSX import on mobile | Not expected — mobile is not an import platform |
| M-05 | P3 | Search filter sheet comment acknowledges gap | search_screen.dart L114-117: "Price/in-stock/sort intentionally absent" |

**Critical finding:** The mobile search_screen.dart explicitly documents at L114-117 that price/in-stock/sort filters are "intentionally absent" because "the search endpoint does not accept them yet (BG-3)." This comment is now STALE — P9 added these parameters to the API. The mobile app needs to be updated to use the now-available server-side filters.

---

## 13. Security Audit

### Tenant Isolation (FACT — VERIFIED)

```
JWT (JwtAuthGuard — class-level on catalog.controller.ts L46)
  ↓
PermissionsGuard (method-level)
  ↓
RequirePermission ('merchant:products:write' / 'merchant:products:read')
  ↓
assertStoreInOrg (store belongs to caller's organization)
  ↓
assertStoreMember (caller is ACTIVE member of the store)
```

All catalog mutation endpoints follow this chain. Read endpoints (search, product detail) are store-scoped via store_id filter.

### IDOR Protection (FACT)

| Endpoint | Protection | Evidence |
|----------|-----------|----------|
| PATCH products/:id | assertProductEditableByMerchant | catalog.controller.ts L242 |
| DELETE products/:id | assertProductEditableByMerchant | catalog.controller.ts L252 |
| POST products/:id/variants | assertProductEditableByMerchant | catalog.controller.ts L315 |
| PATCH variants/:variantId | assertProductEditableByMerchant | catalog.controller.ts L333 |
| Export products | assertStoreInOrg + assertStoreMember | catalog.controller.ts L416-418 |
| Import jobs | assertStoreInOrg + assertStoreMember | catalog.controller.ts L500-502 |
| Import chunks/cancel/retry | assertStoreInOrg + assertStoreMember | catalog.controller.ts L557-588 |

### RBAC (FACT)

| Role | Permissions Verified |
|------|---------------------|
| ADMIN | catalog:categories:write, catalog:brands:manage, admin:merchants:read |
| MODERATOR | catalog:categories:write, catalog:brands:manage |
| Merchant owner/admin | merchant:products:write (via store membership) |
| Merchant member | merchant:products:read (via store membership) |

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| SEC-01 | P3 | Product creation does not verify store membership on all paths | Some create paths rely on input.storeId validation only |
| SEC-02 | INFO | Search endpoint is unauthenticated | GET /v1/search has no @UseGuards — intentional for buyer browsing |

---

## 14. Concurrency / Integrity Audit

### Complete (FACT)

| Mechanism | Coverage | Evidence |
|-----------|----------|----------|
| Optimistic locking (products) | PATCH products/:id | catalog.controller.ts L244-245 |
| Optimistic locking (variants) | PATCH variants/:variantId | catalog.controller.ts L334-336 |
| Optimistic locking (moderation) | POST/PATCH moderateProduct | admin.service.ts L836-870 |
| Atomic conditional UPDATE | Import chunk processing | P8 migration 0055 |
| FOR UPDATE | Stock reservations | inventory.service.ts |
| FOR SHARE | Variant creation | P4 implementation |
| Concurrent import protection | 409 CONFLICT on chunk claim | catalog.service.ts |
| Stale lock recovery | 30-minute threshold | catalog.service.ts |

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| C-01 | P3 | No import vs Product Studio concurrency guard | Simultaneous import + manual edit could conflict |
| C-02 | P3 | No bulk operation serialization | bulkProductOperations/bulkVariantOperations not guarded against concurrent edits |

---

## 15. Database / Performance Audit

### Indexes (FACT — from migration 0027)

| Index | Covers |
|-------|--------|
| idx_products_store_status_cat | Store product listings by status+category |
| idx_products_mpn | MPN dedup lookups |
| idx_offer_store_status_product | Offer resolution by store+status+product |
| idx_offer_store_status_variant | Offer resolution by store+status+variant |
| idx_pav_product_attr | Product attribute detail + facets |
| idx_variant_product_combkey | Variant combination dedup |
| idx_audit_resource_action_created | Audit log queries |

### Performance (FACT — from P9 EXPLAIN ANALYZE)

| Query | Execution Time | Target |
|-------|---------------|--------|
| Combined filters + price sort | 2.763ms | <200ms ✓ |
| Price filter only | 0.785ms | <200ms ✓ |
| Availability filter | 48.326ms | <200ms ✓ |
| Price sort (full 10K) | 80.240ms | <200ms ✓ |
| Text search + P9 filters | 551ms median | >200ms ⚠ |

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| DB-01 | P3 | Text search + filters exceeds 200ms target | Inherent trigram+FTS cost; not a P9 violation |
| DB-02 | P3 | No index on product_attribute_values for facet aggregation | Facets use sequential scan on attribute values |
| DB-03 | INFO | JSONB attributes columns retained but deprecated | catalog.schema.ts L85-86, L106-107 |

---

## 16. Architectural Debt

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| DEBT-01 | P3 | Dual legacy/typed attribute storage | JSONB attributes columns retained alongside typed tables |
| DEBT-02 | P3 | pnpm virtual store corruption on Windows | bcrypt EPERM, has-flag missing — infrastructure only |
| DEBT-03 | P3 | testcontainers Ryuk reaper fails on Windows Docker Desktop | Requires TESTCONTAINERS_RYUK_DISABLED=true |
| DEBT-04 | INFO | Stale mobile comment about missing search params | search_screen.dart L114-117 references BG-3 (now closed by P9) |
| DEBT-05 | INFO | Multiple search query paths (Drizzle + raw SQL) | Two code paths must be maintained for P9 filters |

---

## 17. Findings Matrix

| ID | Severity | Area | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F-P10-01 | P2 | Mobile | Mobile search lacks P9 filters (price/availability/sort) | api_service.dart L239-245 | P10 or dedicated mobile milestone |
| F-P10-02 | P2 | Governance | No product submission workflow for merchants | admin.service.ts L806, products.status set directly | P10 or governance milestone |
| F-P9-06 | P3 | Import | No XLSX import support (merchant) | catalog-import has XLSX; merchant only CSV | P10 scope |
| F-P9-07 | P3 | Import | No import preview/validation UX | Rows processed without pre-validation | P10 scope |
| F-P9-01 | P3 | Governance | No SUBMITTED/PENDING_REVIEW state | products.status has DRAFT/ACTIVE/REJECTED only | Combine with F-P10-02 |
| F-P9-02 | P3 | Media | No variant media management UI | product_media.variant_id exists, no UI | Deferred |
| F-P9-03 | P3 | Media | No orphan media cleanup | No scheduled S3 cleanup job | Deferred |
| F-P9-08 | P3 | Inventory | No inventory receiving workflow | Uses adjustStock | Deferred |
| F-P9-09 | P3 | Inventory | No cycle count support | No physical count reconciliation | Deferred |
| F-P9-10 | P3 | Inventory | No inventory valuation | No FIFO/weighted-average cost | Deferred |
| F-P9-11 | P3 | Pricing | No price validity periods | No valid_from/valid_to on price_tiers | Deferred |
| F-P9-12 | P3 | Pricing | No price history | No audit trail for price changes | Deferred |
| F-P9-13 | P3 | Promotions | Promotions CRUD exists but not wired to cart | promotions.service.ts exists | Separate milestone |
| S-02 | P3 | Search | Web UI does not fully leverage dynamic facets | SearchPageClient.tsx basic facet rendering | P10 scope |
| PS-01 | P3 | Studio | No draft autosave in Product Studio | Manual save only | Deferred |
| DEBT-04 | P3 | Mobile | Stale comment about missing search params | search_screen.dart L114-117 | P10 mobile fix |

---

## 18. Candidate Next Milestones

### Candidate A: P10 — Merchant Import UX & XLSX Production Pipeline

| Attribute | Value |
|-----------|-------|
| Objective | Bring merchant import to production parity with admin XLSX pipeline |
| Business value | HIGH — merchants need XLSX for bulk catalog management |
| Technical value | MEDIUM — reuses existing admin XLSX infrastructure |
| Scope | XLSX parsing for merchant imports, import preview/validation, downloadable error reports, progress reporting |
| Out of scope | Admin import changes, export XLSX, product submission workflow |
| Dependencies | None — builds on catalog-import module and import_jobs |
| Database changes? | NO |
| API changes? | YES — XLSX content-type support, preview endpoint |
| Web changes? | YES — import wizard XLSX support, preview step, error download |
| Mobile changes? | NO |
| Security risks | LOW — existing store membership authorization |
| Concurrency risks | LOW — existing chunk protection |
| Performance risks | LOW — XLSX parsing is memory-bound |
| Estimated complexity | MEDIUM |
| Why now? | Deferred since P8; admin has XLSX but merchants don't; import UX gaps block production use |
| Why not later? | Merchants cannot practically manage large catalogs via CSV alone |

### Candidate B: P10 — Mobile Search Parity & Buyer Discovery

| Attribute | Value |
|-----------|-------|
| Objective | Bring mobile search to feature parity with web search (P9 filters + facets) |
| Business value | HIGH — mobile buyers cannot filter/sort like web buyers |
| Technical value | MEDIUM — backend already supports all parameters |
| Scope | Mobile price range filter, availability toggle, sort options, facet UI, stale comment cleanup |
| Out of scope | Web search changes, mobile import, mobile merchant features |
| Dependencies | None — API already supports P9 params |
| Database changes? | NO |
| API changes? | NO |
| Web changes? | NO |
| Mobile changes? | YES — api_service.dart, search_screen.dart, filter sheet |
| Security risks | NONE — read-only query parameters |
| Concurrency risks | NONE |
| Performance risks | LOW — same server-side queries |
| Estimated complexity | LOW-MEDIUM |
| Why now? | P9 closed the server-side gap; mobile is now the only client without filters |
| Why not later? | Every mobile search session is degraded without filters |

### Candidate C: P10 — Product Governance & Submission Workflow

| Attribute | Value |
|-----------|-------|
| Objective | Enable merchants to submit products for review; formalize publish lifecycle |
| Business value | MEDIUM — prevents unreviewed products from going live |
| Technical value | MEDIUM — requires status FSM and notification wiring |
| Scope | SUBMITTED status, submit-for-review action, admin notification, moderation queue enhancement |
| Out of scope | Bulk moderation, product merge, XLSX import |
| Dependencies | None |
| Database changes? | MAYBE — new status value (no schema change needed if varchar) |
| API changes? | YES — POST products/:id/submit, moderation queue filters |
| Web changes? | YES — submit button in Product Studio, moderation queue UI |
| Mobile changes? | NO |
| Security risks | LOW — existing authorization boundaries |
| Concurrency risks | LOW — optimistic locking already in place |
| Performance risks | NONE |
| Estimated complexity | MEDIUM |
| Why now? | Moderation exists but merchants cannot submit; status set directly |
| Why not later? | Without submission workflow, moderation is reactive only |

---

## 19. Recommended P10 Milestone

```
Recommended Milestone:
P10 — Merchant Import UX & XLSX Production Pipeline

Why:
1. XLSX import has been deferred since P8 — merchants can only use CSV, which is impractical for large catalogs
2. The admin XLSX pipeline (parser/planner/resolver/validator/executor) already exists and can be adapted
3. Import preview/validation is the #1 merchant UX gap — errors are discovered only after processing
4. Builds naturally on P8 (chunked processing) and P9 (typed attribute symmetry)

Primary user:
Merchant

Primary problem:
Merchants cannot import XLSX files and cannot preview/validate before processing.
Large catalog imports fail silently or produce errors that are hard to diagnose.

Expected outcome:
Merchants can upload XLSX files, preview validation results, download error reports,
and track import progress in real-time. Import error rate decreases through pre-validation.
```

---

## 20. Preliminary Scope

### In Scope

1. **XLSX parsing for merchant imports** — Adapt admin excel-parser for merchant import_jobs pipeline
2. **Import preview/validation** — Pre-process uploaded file and show validation results before committing
3. **Downloadable error reports** — Export import_job error_log as CSV/downloadable file
4. **Progress reporting** — Real-time chunk progress via existing SSE or polling
5. **Import history** — List past imports with status, row counts, error counts
6. **Stale mobile comment cleanup** — Update search_screen.dart L114-117 to reflect P9 completion

### Out of Scope

1. Admin import pipeline changes (already complete)
2. XLSX export (not requested)
3. Product submission workflow (Candidate C — separate milestone)
4. Mobile search filters (Candidate B — separate milestone)
5. Inventory receiving/cycle count (deferred)
6. Price validity/history (deferred)
7. Promotions wiring (deferred)

---

## 21. Preliminary Acceptance Criteria

| ID | Criterion |
|----|-----------|
| P10-A01 | Merchant can upload XLSX file via POST stores/:storeId/imports with fileType=XLSX |
| P10-A02 | XLSX upload parses all sheets and extracts product rows |
| P10-A03 | Import preview shows row count, column mapping, and validation status before processing |
| P10-A04 | Preview includes per-row validation results (errors, warnings) |
| P10-A05 | Merchant can cancel import during preview (before processing) |
| P10-A06 | Downloadable error report available for completed/failed imports |
| P10-A07 | Error report includes row number, field, error code, message, and suggested fix |
| P10-A08 | Import progress shows chunk-level completion (processed/total chunks) |
| P10-A09 | Import history lists all imports for a store with status and statistics |
| P10-A10 | CSV import continues to work unchanged (backward compatibility) |
| P10-A11 | Typed attribute import (attr:<code> columns) works for XLSX same as CSV |
| P10-A12 | Import respects store membership authorization |

---

## 22. Security Criteria

| ID | Criterion |
|----|-----------|
| P10-S01 | XLSX upload requires store membership (assertStoreInOrg + assertStoreMember) |
| P10-S02 | Import preview does not persist data — read-only validation |
| P10-S03 | Error report download requires store membership |
| P10-S04 | XLSX parsing does not execute macros or external references |
| P10-S05 | File size limits enforced (prevent memory exhaustion) |

---

## 23. Concurrency Criteria

| ID | Criterion |
|----|-----------|
| P10-C01 | Concurrent import + manual edit protection maintained (existing chunk lock) |
| P10-C02 | Preview validation does not acquire write locks |
| P10-C03 | Error report generation is read-only |

---

## 24. Performance Criteria

| ID | Criterion |
|----|-----------|
| P10-P01 | XLSX parsing: 1000 rows < 5 seconds |
| P10-P02 | Import preview: 1000 rows < 3 seconds |
| P10-P03 | Error report generation: 10000 errors < 2 seconds |

---

## 25. Migration Assessment

```
Migration:
NOT REQUIRED
```

**Rationale:**
- XLSX parsing uses existing admin pipeline (excel-parser.service.ts)
- import_jobs.fileType column already exists (migration 0034)
- Import preview uses existing staged rows mechanism (Redis)
- Error report reads from existing catalogImportErrors / import_jobs.error_log
- No new tables, columns, or indexes needed

---

## 26. Release Strategy

```
P10-A — XLSX Foundation
  Backend: Adapt excel-parser for merchant import_jobs
  Backend: XLSX content-type routing in import controller
  Test: XLSX parsing unit + integration tests

P10-B — Import Preview & Validation
  Backend: Preview endpoint (validate without processing)
  Web: Preview step in import wizard
  Test: Preview validation tests

P10-C — Error Reporting & Progress
  Backend: Error report download endpoint
  Web: Error report download UI, progress bar
  Test: Error report generation tests

P10-D — Independent Runtime Verification
  Full regression suite
  XLSX import end-to-end tests
  Security verification
```

---

## 27. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| XLSX parsing memory usage for large files | MEDIUM | MEDIUM | Stream parsing, row limit enforcement |
| Admin XLSX pipeline not designed for merchant context | LOW | MEDIUM | Adapter pattern; merchant-specific validation rules |
| Import preview adds latency to import flow | LOW | LOW | Preview is optional step; direct processing still available |
| XLSX library dependency adds bundle size | LOW | LOW | Server-side only; no client impact |

---

## 28. Dependencies

| Dependency | Status |
|------------|--------|
| Admin XLSX pipeline (excel-parser, planner, resolver, validator, executor) | COMPLETE |
| Merchant import_jobs schema | COMPLETE (migration 0034) |
| Import chunk processing | COMPLETE (migration 0055) |
| Typed attribute import (attr:<code>) | COMPLETE (P8) |
| Store membership authorization | COMPLETE (P7) |
| Template generator | COMPLETE (651 lines) |

---

## 29. Final Recommendation

**P10 — Merchant Import UX & XLSX Production Pipeline**

The platform has a complete admin XLSX import pipeline and a functional merchant CSV import. The gap between these two paths is the highest-value next milestone because:

1. **Merchant productivity** — XLSX is the standard format for bulk catalog management; CSV-only limits merchants to small catalogs
2. **Data quality** — Import preview prevents bad data from entering the system
3. **Operational efficiency** — Downloadable error reports reduce support burden
4. **Architecture continuity** — Builds directly on P8 (chunked imports) and P9 (typed attributes); reuses existing admin infrastructure
5. **No migration required** — Zero schema risk

**Alternative milestones** (mobile search parity, product governance) are valuable but less urgent than closing the merchant import gap.

---

## 30. Next Gate

```
NEXT GATE:
P10 BUSINESS RULES & ARCHITECTURE LOCK
```

---

*END OF FRESH ARCHITECTURE & BUSINESS AUDIT*
