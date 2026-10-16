# SCS Catalog Product Management — Next Phase Architecture & Business Audit

**Document:** SCS-CATALOG-PRODUCT-MANAGEMENT-NEXT-PHASE-ARCHITECTURE-AUDIT.md
**Date:** 2026-10-06
**Baseline:** P7 CLOSED / PASS WITH CONDITIONS (34/34 acceptance criteria)
**Gate:** GO WITH CONDITIONS

---

## 1. Executive Summary

This audit examines the SCS Catalog/Product Management platform after P7 closure. The platform has a sound architectural foundation with clean domain separation, comprehensive authorization, and verified concurrency protections. The catalog domain correctly separates canonical products (WHAT) from merchant offers (HOW), typed attributes are authoritative, and store-level membership enforcement is complete.

**Key findings:**
- 0 P0/P1 blockers discovered
- 3 P2 findings (concurrent import protection, import resumability, negative inventory prevention)
- 7 P3 findings (publishing workflow, search filters, variant media UI, orphan cleanup, RTL, manufacturer entity, import typed attributes)
- Production readiness: **YELLOW** (production-ready with operational conditions)

**Recommended next milestone:** Import/Export Production Hardening — addressing concurrent import protection, chunked processing, resumability, and typed attribute support.

**Migration decision:** Migration 0055 will be required for the recommended next milestone (import job chunking state, concurrent job lock).

---

## 2. P7 Baseline

| Item | Status |
|------|--------|
| Branch | develop |
| HEAD | 2164c06 |
| Latest migration | 0054_store_members.sql |
| Migration 0055 | ABSENT |
| P7 acceptance | 34/34 PASS |
| P7 runtime tests | 35/35 PASS |
| P7 concurrency iterations | 300 (0 zero-owner states) |
| P7 defects | 0 |
| TypeScript | API 0 errors, Web 0 errors |

P7 deliverables verified and closed:
- Store Membership Management (CRUD, last-owner protection, outbox events)
- Product Studio production hardening (beforeunload, media UX)
- Import/Export/Offer authorization consistency (assertStoreMember coverage)

---

## 3. Current Architecture

### Authorization Chain (Locked)
```
JWT → Permission → Organization → Store Membership → Operation
```

### Domain Separation (Verified)
```
WHAT (Canonical):  products, product_variants, product_attribute_values
HOW (Merchant):    merchant_offers, price_lists, price_tiers, inventory_items
WHO (Tenant):      stores, store_members, organizations
```

### Schema Layer (54 migrations)
- `catalog.schema.ts`: categories, brands, products, product_variants, product_media, import_jobs, favorites, saved_suppliers, product_sources
- `catalog.taxonomy.schema.ts`: attribute_definitions, attribute_options, attribute_groups, product_types, product_type_attributes, product_attribute_values, variant_attribute_values
- `catalog.offer.schema.ts`: merchant_offers
- `merchant.schema.ts`: stores, warehouses, business_documents, verification_requests, store_members
- `pricing.schema.ts`: price_lists, price_tiers
- `inventory.schema.ts`: inventory_items, stock_movements

### Key Architectural Decisions (Locked)
- products.storeId is nullable (platform-shared canonical products)
- Merchant offers carry storeId for ownership
- Typed attribute tables are authoritative (JSONB deprecated but retained)
- combinationKey enforces variant dimension validity
- Product type changes require variant count = 0 and offer count = 0

---

## 4. Capability Matrix

| Capability | Status | Evidence |
|------------|--------|----------|
| Category management | COMPLETE | categories table, materialized path |
| Brand management | COMPLETE | brands table, platform-level |
| Product CRUD | COMPLETE | catalog.service.ts, admin + merchant UI |
| Variant management | COMPLETE | productVariants, combinationKey, bulk ops |
| Typed attributes | COMPLETE | product_attribute_values, variant_attribute_values |
| Product types | COMPLETE | product_types, product_type_attributes, conditional rules |
| Merchant offers | COMPLETE | merchant_offers, full lifecycle |
| Tier pricing | COMPLETE | price_lists, price_tiers |
| Inventory ledger | COMPLETE | inventory_items, stock_movements |
| Import (CSV/XLSX) | PARTIAL | Sequential processing, no chunking, no resumability |
| Export (CSV) | COMPLETE | exportProductsCsv |
| Search (FTS + trigram) | COMPLETE | Arabic normalization, facets, attribute filters |
| Media management | COMPLETE | product_media, presigned upload, reorder |
| Store membership | COMPLETE | store_members, CRUD, last-owner protection |
| Authorization | COMPLETE | assertStoreMember, assertProductEditableByMerchant |
| Publishing workflow | MISSING | No SUBMITTED/REVIEW/APPROVED states |
| Variant media UI | MISSING | No dedicated variant media management |
| Price/availability filters | MISSING | Search lacks price range filters |
| Orphan media cleanup | MISSING | No scheduled cleanup job |
| Manufacturer entity | MISSING | Not required (identifiers on products) |
| RTL/Arabic layout | MISSING | Arabic fields exist, RTL not implemented |

---

## 5. Findings Summary

| ID | Severity | Area | Finding | Migration Required |
|----|----------|------|---------|-------------------|
| F-NP-01 | P2 | Import | No concurrent import job protection | YES |
| F-NP-02 | P2 | Import | Import not resumable after catastrophic failure | YES |
| F-NP-03 | P2 | Inventory | No negative inventory prevention at DB level | YES |
| F-NP-04 | P3 | Publishing | No moderation/review workflow | NO |
| F-NP-05 | P3 | Search | No price/availability filters | NO |
| F-NP-06 | P3 | Media | No variant media UI | NO |
| F-NP-07 | P3 | Media | No orphan media cleanup | NO |
| F-NP-08 | P3 | Import | Import does not handle typed attributes | NO |
| F-NP-09 | P3 | UX | RTL not implemented | NO |
| F-NP-10 | P3 | Identifiers | No manufacturer entity | NO |

---

## 6. Security Audit

### Authorization Coverage (VERIFIED)

| Endpoint | assertStoreInOrg | assertStoreMember | Status |
|----------|------------------|-------------------|--------|
| Product create | YES | YES | CLOSED |
| Product update (11 endpoints) | YES (via assertProductEditableByMerchant) | YES | CLOSED |
| Import create | YES | YES | CLOSED |
| Import stage | YES | YES | CLOSED |
| Import process | YES | YES | CLOSED |
| Export | YES | YES | CLOSED |
| Offer create | YES | YES | CLOSED |

### Privileged Bypass (VERIFIED)
- BYPASS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR']
- isTenantPrivileged() checked in all auth paths
- JWT does NOT contain storeId (verified)

### Tenant Isolation (VERIFIED by P7 runtime)
- 6/6 isolation scenarios PASS
- Cross-org access denied
- Same-org cross-store access denied
- Inactive membership denied

### Findings
- **No new security defects discovered**
- P6 DEFECT-01 (same-org cross-store) is CLOSED via assertStoreMember
- F-SEC-01 (import/export) is CLOSED
- F-SEC-02 (offer creation) is CLOSED

---

## 7. Concurrency Audit

| Scenario | Lock Strategy | Status |
|----------|---------------|--------|
| Product edit vs Product edit | Optimistic locking (updatedAt) | SAFE |
| Product type change vs variants | FOR UPDATE + count guards | SAFE |
| Last-owner protection | FOR UPDATE + count check | SAFE (300 iterations verified) |
| Import vs Import | **NONE** | **RISK (F-NP-01)** |
| Import vs Product edit | Row-level (SKU match) | SAFE |
| Variant creation | FOR SHARE | SAFE |
| Offer update vs checkout | Offer atomization | SAFE |
| Inventory update vs reservation | Row-level | SAFE |
| Media reorder vs delete | Product-level | SAFE |

### F-NP-01: Concurrent Import Protection (P2)
**Current behavior:** Two import jobs for the same store can process simultaneously, potentially creating duplicate products if they both attempt to create the same SKU.
**Expected behavior:** Import jobs for the same store should serialize or reject concurrent processing.
**Business impact:** Duplicate products, data inconsistency.
**Recommendation:** Add advisory lock or status-based serialization on processImportJob.

---

## 8. Data Integrity Audit

### Identifier Uniqueness (VERIFIED)
- GTIN: unique constraint (uq_products_gtin)
- EAN: unique constraint (uq_products_ean)
- SKU: unique per product (via combinationKey + variant matching)
- MPN: no unique constraint (acceptable — MPNs can be shared)

### Variant Dimension Validity (VERIFIED)
- combinationKey enforces unique dimension combinations per product
- Product type change requires variant count = 0
- Variant dimension attributes validated against product_type.variant_dimensions

### Attribute Authority (VERIFIED)
- product_attribute_values and variant_attribute_values are authoritative
- JSONB attributes columns deprecated but retained for backward compatibility
- No accidental JSONB writes detected in current code paths

### Inventory Integrity
- stock_movements is append-only ledger
- qty_available = qty_on_hand - qty_reserved (computed)
- **F-NP-03:** No CHECK constraint preventing negative quantities

### F-NP-03: Negative Inventory Prevention (P2)
**Current behavior:** qty_on_hand and qty_reserved can become negative without DB-level prevention.
**Expected behavior:** CHECK constraints or application-level guards should prevent negative inventory.
**Business impact:** Inventory corruption, overselling risk.
**Recommendation:** Add CHECK (qty_on_hand >= 0) and CHECK (qty_reserved >= 0) constraints.

---

## 9. Import/Export Audit

### Current Architecture
- Import jobs stored in import_jobs table
- Staged rows stored in Redis (list)
- Sequential row processing in processImportJob
- Progress checkpoints every 25 rows
- Error log capped at 100 entries
- CSV/XLSX support (XLSX parsing deferred)

### Findings

**F-NP-01: No Concurrent Import Protection (P2)**
- Two jobs for same store can process simultaneously
- SKU matching could create duplicates under race
- **Fix:** Advisory lock or status-based serialization

**F-NP-02: Import Not Resumable (P2)**
- Catastrophic failure marks job FAILED
- Staged rows preserved in Redis but processing restarts from row 0
- No checkpoint persistence for partial completion
- **Fix:** Persist last processed row index, resume from checkpoint

**F-NP-08: No Typed Attribute Import (P3)**
- importRow only handles name, sku, priceMinor, barcode, description, category, brand, unit, stock
- Does not import product_attribute_values or variant_attribute_values
- **Fix:** Extend column mapping to support typed attributes

### Import vs Product Edit
- Import matches by SKU within store
- Existing products are updated (description, category, brand, price)
- No conflict detection if product is being edited simultaneously
- **Risk:** Low — row-level updates are atomic

### Export Completeness
- CSV export includes product fields
- Does not export typed attributes
- Does not export variant-level data
- **Status:** Acceptable for current scope

---

## 10. Product Studio Audit

### Create Flow (VERIFIED)
- beforeunload protection (P7)
- Dirty state tracking via JSON.stringify comparison
- Reset after save

### Edit Flow (VERIFIED)
- Product Studio edit page exists (/merchant/product-studio/[id]/edit)
- Media upload UX with presigned URLs, progress, delete confirmation, reorder
- Catalog → Edit navigation

### Findings
- **No production blockers discovered**
- Media UX is complete for product-level images
- Variant media UI is deferred (F-NP-06)
- Drag/drop media is deferred
- Arabic/RTL readiness: Arabic fields exist, RTL layout not implemented

---

## 11. Variant/Attribute Audit

### Variant Creation (VERIFIED)
- combinationKey enforces dimension uniqueness
- FOR SHARE on createVariant
- Bulk variant operations supported

### Product Type Changes (VERIFIED)
- updateProductWithTypeChange uses FOR UPDATE
- Guards: variant count = 0, offer count = 0
- Optimistic locking preserved

### Typed Attributes (VERIFIED)
- product_attribute_values and variant_attribute_values authoritative
- Attribute definitions with types, validation, scopes
- Conditional rules engine (conditional-rules.service.ts)
- Product type attributes with display/filter/sort/comparable flags

### Findings
- **No defects discovered**
- Architecture is sound
- Import does not yet handle typed attributes (F-NP-08)

---

## 12. Media Audit

### Current Architecture
- product_media table with product_id (required) and variant_id (optional)
- Presigned upload via StorageService
- MIME validation (JPEG/PNG/WebP)
- Size validation (5 MB max)
- Sort order with primary auto-update

### Findings

**F-NP-06: No Variant Media UI (P3)**
- Schema supports variant_id but no dedicated UI
- Product Studio only manages product-level media
- **Status:** Deferred — not a production blocker

**F-NP-07: No Orphan Media Cleanup (P3)**
- Failed or abandoned uploads leave orphaned S3 objects
- No scheduled cleanup job
- **Status:** Deferred — low business impact

---

## 13. Search Audit

### Current Architecture
- FTS + trigram with Arabic normalization (normalize_arabic)
- SKU/barcode exact match fast path
- Attribute filters via EXISTS subquery (Phase 6)
- Facets via getFacets with Redis caching (120s)
- Product card enrichment with media resolution

### Findings

**F-NP-05: No Price/Availability Filters (P3)**
- Search supports category, brand, attribute filters
- No price range filter
- No availability filter
- **Status:** Deferred — enhancement, not blocker

### Search Performance
- Redis caching for facets (120s) and product detail (300s)
- Composite indexes (Phase 8)
- Slow query metrics via timeQuery wrapper

---

## 14. Offer/Pricing Audit

### Current Architecture
- merchant_offers with full lifecycle (DRAFT/PROPOSED/ACTIVE/SUSPENDED/REJECTED/WITHDRAWN)
- price_lists with tiers (price_tiers)
- Offer atomization for cart (Phase 4)
- resolveOfferPrices shared resolver

### Findings
- **No defects discovered**
- Architecture is complete for B2B marketplace
- Offer selection is deterministic (price + availability)
- No stale price risk (real-time resolution)

---

## 15. Inventory Audit

### Current Architecture
- inventory_items per (variant, warehouse)
- stock_movements append-only ledger
- qtyOnHand, qtyReserved, reorderPoint, maxStock
- Movement types: IN, OUT, RESERVE, RELEASE, ADJUST, etc.

### Findings

**F-NP-03: Negative Inventory Prevention (P2)**
- No CHECK constraints on qty_on_hand or qty_reserved
- Application-level guards exist but DB-level prevention is absent
- **Risk:** Inventory corruption under edge cases
- **Fix:** Add CHECK constraints

### Returns Impact
- Returns milestone is deferred
- Current inventory architecture can accommodate returns via movement types
- **No current integrity risk**

---

## 16. Order/Fulfillment Integration Audit

### Current Architecture
- Orders use immutable snapshots
- Catalog changes do not corrupt existing order data
- Sub-orders reference offers (not live products)

### Findings
- **No defects discovered**
- Order snapshots are properly isolated from catalog mutations
- Variant deletion/deactivation does not affect existing orders

---

## 17. Performance/Scalability Audit

### Current Architecture
- Composite indexes (Phase 8)
- Redis read-through caches
- Slow query metrics (SLOW_QUERY_MS)
- Connection pooling via DatabaseService

### Scalability Estimates
| Metric | Current | 100K Products | 1M Variants |
|--------|---------|---------------|-------------|
| Product list query | ~50ms | ~200ms | N/A |
| Search query | ~100ms | ~500ms | ~1s |
| Import processing | ~100 rows/s | N/A | N/A |

### Findings
- **No immediate scalability blockers**
- Import processing is sequential (not chunked) — becomes slow at scale
- N+1 potential in product card enrichment (mitigated by batch queries)

---

## 18. Observability Audit

### Current Architecture
- AuditService for audit_logs (product governance, offer lifecycle)
- Outbox events for async processing
- Query metrics (timeQuery, recordCacheHit/Miss)
- Error logging via NestJS exception filters

### Findings
- **No dedicated operational dashboards**
- Failed imports visible via import_jobs.status
- Authorization failures logged but not aggregated
- **Status:** Acceptable for initial production

---

## 19. UX/RTL Audit

### Current Architecture
- Arabic fields (nameAr, titleAr, descriptionAr) on products, categories, brands
- Currency hardcoded to SAR
- Date/time uses Asia/Riyadh timezone

### Findings

**F-NP-09: RTL Not Implemented (P3)**
- Arabic content fields exist
- RTL layout direction not implemented
- **Status:** Deferred — enhancement

---

## 20. Database/Migration Audit

### Migration Summary
- 54 migrations through 0054_store_members.sql
- All migrations are idempotent (IF NOT EXISTS / IF EXISTS)
- No reversibility concerns for production
- No large-table migration risks identified

### Key Migrations
- 0025_canonical_products: products.storeId nullable, product_type_id FK
- 0026_merchant_offers: offer-owned pricing
- 0053_attribute_backfill: typed attribute authority cutover
- 0054_store_members: store membership for authorization

### Next Migration Decision
**Migration 0055 will be required** for the recommended next milestone (Import/Export Production Hardening):
- import_job_chunks table for chunked processing
- Advisory lock or status-based serialization for concurrent import protection
- CHECK constraints for negative inventory prevention

---

## 21. Production Readiness Assessment

| Area | Rating | Notes |
|------|--------|-------|
| Catalog domain | GREEN | Sound architecture, verified |
| Authorization | GREEN | Complete coverage, runtime verified |
| Product Studio | GREEN | Create/edit/media complete |
| Import/Export | YELLOW | Functional but lacks chunking/resumability |
| Inventory | YELLOW | Functional but lacks DB-level constraints |
| Search | GREEN | FTS + facets complete |
| Offers/Pricing | GREEN | Complete for B2B |
| Media | GREEN | Product-level complete |
| Observability | YELLOW | Basic logging, no dashboards |

**Overall: YELLOW — Production-ready with operational conditions**

### Conditions
1. Import jobs should be monitored for concurrent processing (operational workaround until F-NP-01 fixed)
2. Inventory should be monitored for negative quantities (operational workaround until F-NP-03 fixed)
3. Failed import jobs require manual intervention (until F-NP-02 fixed)

---

## 22. Severity Matrix

| ID | Severity | Area | Finding | Next Phase |
|----|----------|------|---------|------------|
| F-NP-01 | P2 | Import | No concurrent import protection | YES |
| F-NP-02 | P2 | Import | Import not resumable | YES |
| F-NP-03 | P2 | Inventory | No negative inventory prevention | YES |
| F-NP-04 | P3 | Publishing | No moderation workflow | NO |
| F-NP-05 | P3 | Search | No price/availability filters | NO |
| F-NP-06 | P3 | Media | No variant media UI | NO |
| F-NP-07 | P3 | Media | No orphan media cleanup | NO |
| F-NP-08 | P3 | Import | No typed attribute import | YES |
| F-NP-09 | P3 | UX | RTL not implemented | NO |
| F-NP-10 | P3 | Identifiers | No manufacturer entity | NO |

---

## 23. Candidate Next Milestones

### Option A: Import/Export Production Hardening
**Objective:** Make import production-safe at scale.
**Scope:**
- Concurrent import protection (advisory lock)
- Chunked processing (batches of 100 rows)
- Resumability (checkpoint persistence)
- Typed attribute import support
- Negative inventory CHECK constraints

**Business value:** HIGH — enables reliable bulk catalog management
**Technical value:** HIGH — prevents data corruption at scale
**Migration required:** YES (0055)
**Complexity:** MEDIUM
**Security impact:** LOW
**Blocks production:** NO (operational workarounds exist)

### Option B: Publishing Workflow
**Objective:** Add moderation/review pipeline.
**Scope:**
- SUBMITTED/UNDER_REVIEW/APPROVED states
- Moderator review UI
- Rejection with revision notes
- Re-review after sensitive changes

**Business value:** MEDIUM — required for regulated marketplaces
**Technical value:** MEDIUM
**Migration required:** NO
**Complexity:** HIGH
**Security impact:** LOW
**Blocks production:** NO

### Option C: Search Enhancement
**Objective:** Add price/availability filters.
**Scope:**
- Price range filter
- Availability filter
- Sort by price

**Business value:** MEDIUM — improves buyer experience
**Technical value:** LOW
**Migration required:** NO
**Complexity:** LOW
**Security impact:** NONE
**Blocks production:** NO

---

## 24. Recommended Next Milestone

**Option A: Import/Export Production Hardening**

**Rationale:**
1. Import is the primary catalog ingestion mechanism for merchants
2. Concurrent import protection prevents data corruption (P2)
3. Resumability prevents data loss on failure (P2)
4. Typed attribute import completes the attribute authority cutover
5. Negative inventory prevention protects data integrity (P2)
6. All three P2 findings can be addressed in a single milestone
7. Migration 0055 is straightforward (chunking table, constraints)

**Scope:**
- F-NP-01: Concurrent import protection (advisory lock)
- F-NP-02: Import resumability (checkpoint persistence)
- F-NP-03: Negative inventory CHECK constraints
- F-NP-08: Typed attribute import support

**Out of scope:**
- Publishing workflow (F-NP-04)
- Search filters (F-NP-05)
- Variant media UI (F-NP-06)
- Orphan cleanup (F-NP-07)
- RTL (F-NP-09)
- Manufacturer entity (F-NP-10)

---

## 25. Business Decisions Required

| ID | Question | Options | Recommended | Reason |
|----|----------|---------|-------------|--------|
| BD-NP-01 | Import chunk size? | 50, 100, 250 rows | 100 | Balance between progress visibility and transaction overhead |
| BD-NP-02 | Concurrent import behavior? | Reject, Queue, Serialize | Reject | Simplest, prevents confusion |
| BD-NP-03 | Typed attribute import format? | Column per attribute, JSON column | Column per attribute | Consistent with existing import UX |
| BD-NP-04 | Negative inventory handling? | Hard block, Warning | Hard block | Prevents data corruption |

---

## 26. Migration Decision

**Migration 0055 will be required** for the recommended next milestone.

**Contents:**
1. `import_job_chunks` table for chunked processing state
2. CHECK constraints: `inventory_items.qty_on_hand >= 0`, `inventory_items.qty_reserved >= 0`
3. Advisory lock function or status-based serialization for processImportJob

**No migration required for:**
- Publishing workflow (state machine only)
- Search filters (query changes only)
- Variant media UI (schema already supports it)
- Orphan cleanup (scheduled job only)

---

## 27. Architecture Gate

**GO WITH CONDITIONS**

**Conditions:**
1. Business decisions BD-NP-01 through BD-NP-04 must be locked before implementation
2. Migration 0055 must be reviewed and approved before application
3. P2 findings (F-NP-01, F-NP-02, F-NP-03) must be addressed in the next milestone
4. P3 findings remain deferred unless promoted by future audit

**Rationale:**
- No P0/P1 blockers discovered
- Platform is production-ready with operational conditions
- Recommended next milestone addresses all P2 findings
- Architecture is sound and verified

---

## 28. Final Recommendation

**Proceed to Next Phase Business Rules & Architecture Lock** for Import/Export Production Hardening.

**Locked decisions required:**
- BD-NP-01: Import chunk size (100 rows recommended)
- BD-NP-02: Concurrent import behavior (Reject recommended)
- BD-NP-03: Typed attribute import format (Column per attribute recommended)
- BD-NP-04: Negative inventory handling (Hard block recommended)

**Migration 0055 decision:** CONDITIONAL — required for next milestone, not for P7 closure.

**Next gate after lock:** Implementation of F-NP-01, F-NP-02, F-NP-03, F-NP-08.

---

*END OF NEXT PHASE ARCHITECTURE & BUSINESS AUDIT*
