# SCS Catalog Product Management — Phase 4 Next Milestone Architecture Audit

## 1. Executive Summary

This audit inspects the scs-platform codebase after Phase 4 P3 (Admin Product Create/Edit Page) is formally CLOSED / PASS, to determine the correct next milestone and its readiness for Business Rules + Architecture Lock.

**Recommended next milestone: P5 — Admin Variant Management**

**Key findings:**

- **Admin Console has NO variant management capability.** The admin variant detail page (`/variants/[id]`) is read-only. The admin product editor shows variants as "Read-only". The admin controller has zero variant mutation endpoints.
- **All variant mutation APIs exist but are gated by `merchant:products:write`.** `createVariant()`, `updateVariant()`, `bulkVariantOperations()` are fully implemented in `CatalogService` with P1 optimistic locking, P2 FOR SHARE locks, and Phase 3 typed attribute authority — but the admin controller does not expose them.
- **No `GET /v1/variants/:id` or `GET /v1/admin/variants/:id` endpoint exists.** The admin variant detail page calls `adminRequest('variants/:id')` but no backend route serves it. This is a latent defect.
- **Backend is production-ready for P5.** All variant operations (create, edit, deactivate, delete, bulk) already work through the merchant catalog controller. P5 needs admin controller wrappers + admin UI, mirroring the P3 pattern.
- **No migration required.** The `product_variants` table, `variant_attribute_values` table, and all indexes already exist. P5 is a pure endpoint + UI milestone.
- **Import compatibility is unaffected.** The catalog import executor writes variants directly via `productVariants` INSERT; P5 admin operations use the same tables.

**Verdict: GO WITH CONDITIONS** — P5 is ready for Business Rules + Architecture Lock after resolving the decisions listed in Section 17.

---

## 2. Current Baseline

| Aspect | Value |
|--------|-------|
| Branch | `develop` |
| HEAD | `946dfa0` |
| Latest migration | `0053_attribute_backfill.sql` |
| Migration 0054 | Does NOT exist |
| Phase 3 | CLOSED / PASS |
| P1 (Optimistic Locking) | CLOSED / PASS |
| P2 (Identifiers + Type Rules) | CLOSED / PASS |
| P3 (Admin Product Create/Edit) | CLOSED / PASS |
| P3 unit tests | 91/91 PASS |
| P3 PostgreSQL tests | 69/69 PASS |
| TypeScript | 0 errors |
| Nest build | 290 files, 0 issues |

---

## 3. Phase 4 Roadmap Context

The P3 Business Rules + Architecture Lock (Section 23) defines the Phase 4 milestone sequence:

| Milestone | Scope | Status |
|-----------|-------|--------|
| P1 | Optimistic Locking | CLOSED / PASS |
| P2 | Identifiers + Type Rules | CLOSED / PASS |
| P3 | Admin Product Create/Edit Page | CLOSED / PASS |
| **P5** | **Admin Variant Management** | **NEXT** |
| P6 | Merchant Product Studio Edit Mode | Future |
| P7 | Merchant Variant Editing | Future |
| P8 | Admin Product List Search/Filter Redesign | Future |
| P9 | Audit Trail Expansion | Future |
| P10 | Unsaved Changes in Product Studio | Future |

**Note:** P4 is not defined in the P3 lock document. The sequence proceeds from P3 directly to P5.

### Original Phase 4 Audit Findings (status)

| ID | Severity | Summary | Status |
|----|----------|---------|--------|
| FINDING-01 | HIGH | productTypeId/gtin/ean/mpn not editable | RESOLVED (P2) |
| FINDING-02 | MEDIUM | VARIANT-scope attributes have no dedicated admin editor | **P5 SCOPE** |
| FINDING-03 | HIGH | No admin UI for variant management | **P5 SCOPE** |
| FINDING-04 | MEDIUM | Admin product list lacks search/filters | P8 |
| FINDING-05 | HIGH | Admin cannot create/edit canonical products | RESOLVED (P3) |
| FINDING-06 | HIGH | No optimistic locking | RESOLVED (P1) |
| FINDING-07 | LOW | No product change audit trail | P9 |
| FINDING-08 | HIGH | No version/locking column | RESOLVED (P1) |
| FINDING-09 | LOW | No formal i18n framework | DEFERRED |
| FINDING-10 | MEDIUM | Product reads unguarded (intentional) | INFO |
| FINDING-11 | HIGH | Last-write-wins | RESOLVED (P1) |
| FINDING-12 | LOW | Import center not linked | P8 |
| FINDING-13 | MEDIUM | No product change history | P9 |
| FINDING-14 | MEDIUM | Variant matrix N+1 | DEFERRED |
| FINDING-15 | LOW | Missing focus traps, unsaved changes | P10 |

---

## 4. Recommended Next Milestone

**P5 — Admin Variant Management**

This milestone gives administrators the ability to create, edit, deactivate/reactivate, and delete product variants through the Admin Console, mirroring the P3 pattern for canonical products.

---

## 5. Business Objective

Administrators currently can view variants read-only but cannot manage them. When merchants have not yet created variants for a canonical product, or when variant data needs correction, administrators have no path to act. P5 closes this gap while preserving the canonical-vs-offer boundary.

**Personas:**
- Platform administrator (cross-org, `catalog:products:write`)

**Workflows:**
1. Admin creates a variant on a canonical product
2. Admin edits variant scalar fields (SKU, title, barcode, unit, weight)
3. Admin edits variant typed attributes (VARIANT-scope)
4. Admin deactivates/reactivates a variant
5. Admin deletes a variant (soft — deactivate preferred)
6. Admin uses bulk operations (batch create, batch delete, batch toggle)

---

## 6. Current-State Repository Audit

### 6.1 Backend Variant APIs (catalog.controller.ts)

| Endpoint | Method | Permission | P5 Relevance |
|----------|--------|------------|--------------|
| `POST /v1/products/:productId/variants` | createVariant | `merchant:products:write` + assertProductInOrg | Reuse via admin wrapper |
| `PATCH /v1/products/:productId/variants/:variantId` | updateVariant | `merchant:products:write` + assertProductInOrg | Reuse via admin wrapper; P1 optimistic locking |
| `POST /v1/products/:productId/variants/bulk` | bulkVariantOperations | `merchant:products:write` + assertProductInOrg | Reuse via admin wrapper |
| `GET /v1/products/:productId/variants` | listVariants | None (JWT) | Already usable |
| `GET /v1/products/:productId/variant-matrix` | getVariantMatrix | None (JWT) | Already usable |
| `GET /v1/stores/:storeId/variants` | listStoreVariants | None (JWT) | Already usable |

**Critical gap:** No `GET /v1/variants/:id` or `GET /v1/admin/variants/:id` endpoint exists. The admin variant detail page (`/variants/[id]`) calls `adminRequest('variants/:id')` but no backend route serves it.

### 6.2 Admin Controller (admin.controller.ts)

The admin controller has **zero variant endpoints**. All variant operations are under the merchant catalog controller. P5 must add admin variant endpoints following the P3 pattern:
- `POST /v1/admin/products/:productId/variants`
- `PATCH /v1/admin/products/:productId/variants/:variantId`
- `POST /v1/admin/products/:productId/variants/bulk`
- `GET /v1/admin/variants/:id` (also fixes the latent defect)

### 6.3 Admin Service (admin.service.ts)

No variant management methods exist. P5 must add:
- `adminCreateVariant()`
- `adminUpdateVariant()`
- `adminBulkVariantOperations()`
- `adminGetVariant()` (for the detail endpoint)

### 6.4 Variant Schema (catalog.schema.ts)

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
  attributes     JSONB NOT NULL DEFAULT {}  [DEPRECATED — Phase 3]
  images         JSONB NOT NULL DEFAULT []
  is_active      BOOLEAN NOT NULL DEFAULT true
  combination_key VARCHAR(255)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
```

### 6.5 Admin Frontend

- **ProductDetails.tsx** — Variants tab shows a read-only table (SKU, status, images, stock, View link). Empty state says "Variants are created through Product Studio."
- **`/variants/[id]/page.tsx`** — Read-only variant detail page (Configuration, Technical tabs). No edit/create/delete buttons.
- **ProductForm.tsx** — Variants section explicitly labeled "Read-only" (P3.6).

### 6.6 Merchant Product Studio

- **StepVariants.tsx** — Variant selector for existing products (read-only selection for offer attachment). No variant creation/editing in the wizard.
- **Legacy editor** — `/merchant/catalog/product/:id` redirects to catalog list. Comment: "Product Studio edit mode will be added in a future iteration."

---

## 7. Domain Model Audit

### Entities Affected

| Entity | Change Required |
|--------|----------------|
| `product_variants` | No schema change |
| `variant_attribute_values` | No schema change |
| `attribute_definitions` | No change |
| `attribute_options` | No change |
| `products` | No change |

### New Entities/Fields

**None required.** P5 is a pure endpoint + UI milestone.

### Relationships

No new relationships. Variant → Product FK already exists with CASCADE delete.

---

## 8. Database / Migration Audit

**NO MIGRATION REQUIRED FOR P5.**

All required tables, columns, indexes, and constraints already exist:
- `product_variants` — full variant schema with `is_active`, `combination_key`
- `variant_attribute_values` — typed variant attributes (Phase 3 authoritative)
- `combination_key` partial unique index — prevents duplicate variant combinations
- P1 optimistic locking — `updated_at` column on `product_variants`

P5 uses existing infrastructure only. If implementation discovers a genuine schema requirement, STOP and return to architecture review.

---

## 9. API / Backend Audit

### Required Admin Endpoints

| Endpoint | Permission | Delegates To | Notes |
|----------|------------|--------------|-------|
| `GET /v1/admin/variants/:id` | `catalog:products:write` | `catalogService.getVariant()` | Fix latent defect |
| `POST /v1/admin/products/:productId/variants` | `catalog:products:write` | `catalogService.createVariant()` | No assertProductInOrg |
| `PATCH /v1/admin/products/:productId/variants/:variantId` | `catalog:products:write` | `catalogService.updateVariant()` | P1 optimistic locking |
| `PUT /v1/admin/products/:productId/variants/:variantId/attribute-values` | `catalog:products:write` | `taxonomyService.setVariantAttributeValues()` | Typed variant attributes |
| `POST /v1/admin/products/:productId/variants/bulk` | `catalog:products:write` | `catalogService.bulkVariantOperations()` | Batch create/delete/toggle |

### Key Design Decisions

- Admin variant endpoints MUST NOT use `assertProductInOrg` — admins are cross-org by design (same as P3).
- Admin variant create/edit MUST delegate to existing `CatalogService` methods — no duplicate logic.
- P1 optimistic locking on `updateVariant()` is already implemented — P5 admin wrapper passes `clientUpdatedAt` through.
- Variant attributes are written through the typed endpoint, never through the deprecated JSONB column.

### DTOs

`CreateVariantInput` already exists and is reused by P3's `adminCreateProduct` pattern. No new DTOs needed for scalar fields. A `SetVariantAttributeValuesInput` DTO may be needed for the typed attribute endpoint.

---

## 10. Frontend / UX Audit

### Current State

- Admin variant detail page (`/variants/[id]`) is read-only with no action buttons.
- Admin product editor shows variants as read-only table.
- No variant create form exists in admin.

### Required P5 Frontend Deliverables

1. **Variant create form** — accessible from admin product detail page or product editor
2. **Variant edit form** — accessible from variant detail page or product editor variants section
3. **Variant deactivate/reactivate toggle** — on variant detail page and/or variants table
4. **Variant delete** — with confirmation dialog
5. **Variant typed attribute editor** — for VARIANT-scope attributes
6. **409 conflict UX** — reuse P3 conflict banner pattern
7. **Bulk operations** — optional, could be deferred to a sub-iteration

### UX Patterns to Follow

- P3 ProductForm pattern: sectioned form, typed attribute editor, media section
- P3 409 conflict banner: Reload / Discard options
- P3 beforeunload: unsaved changes protection
- Existing admin detail page patterns (breadcrumbs, tabs, KV grids)

---

## 11. Security Audit

### RBAC

| Check | Current State | P5 Requirement |
|-------|---------------|----------------|
| Admin variant permission | None (all under `merchant:products:write`) | `catalog:products:write` (same as P3 admin product CRUD) |
| assertProductInOrg | Applied in merchant controller | NOT applied to admin operations (cross-org by design) |
| Authorization ordering | Auth before sensitive operation | Maintain pattern |

### IDOR

No new IDOR risks. Admin variant endpoints use product-scoped variant lookups (`WHERE product_id = ? AND variant_id = ?`), same as merchant endpoints.

### Tenant Isolation

Admin cross-org access is by design. No tenant isolation changes required.

### Mass Assignment

`CreateVariantInput` DTO already restricts writable fields. Admin wrapper must use the same DTO.

### Findings

| ID | Severity | Area | Finding |
|----|----------|------|---------|
| F5-SEC-01 | MEDIUM | API | No `GET /v1/admin/variants/:id` endpoint exists — admin variant detail page is broken |
| F5-SEC-02 | LOW | RBAC | Admin has no variant permission key — must reuse `catalog:products:write` |

---

## 12. Tenant Isolation Audit

| Aspect | Status |
|--------|--------|
| Admin cross-org variant access | By design — same as P3 product access |
| assertProductInOrg | NOT applied to admin variant operations |
| Merchant tenant isolation | Unaffected — merchant endpoints retain assertProductInOrg |
| Variant → Product → Store chain | Variant inherits product's org context |

**Status:** PASS — No tenant isolation changes required.

---

## 13. Concurrency / Transaction Audit

This is the most critical audit area given the P3 moderation concurrency defect history.

### Existing Concurrency Protections

| Operation | Strategy | Implementation |
|-----------|----------|----------------|
| `createVariant()` | Pessimistic (FOR SHARE) | Blocks productTypeId changes during variant creation |
| `updateVariant()` | Optimistic locking (P1) | `WHERE updated_at = clientUpdatedAt` → 409 on mismatch |
| `bulkVariantOperations()` create | Pessimistic (FOR SHARE) | Same as createVariant |
| `setVariantAttributeValues()` | Pessimistic (FOR UPDATE) | Phase 3 typed attribute serialization |
| `adminUpdateProduct()` → productTypeId change | Pessimistic (FOR UPDATE) | P2: blocks when variants exist |

### Required Concurrency Scenarios for P5 Testing

| Scenario | Expected Result |
|----------|----------------|
| Admin variant edit vs admin variant edit | Exactly 1 winner, 1 gets 409 |
| Admin variant edit vs merchant variant edit | Exactly 1 winner, 1 gets 409 |
| Admin variant create vs admin productTypeId change | Serialization via FOR SHARE / FOR UPDATE |
| Admin variant attribute write vs admin variant attribute write | FOR UPDATE serialization (Phase 3) |
| Admin variant delete vs concurrent offer creation | Variant CASCADE → offer cleanup |
| Bulk variant create vs productTypeId change | FOR SHARE blocks type change |

### PostgreSQL Runtime Tests Required

1. 50 iterations: concurrent admin/admin variant edit — 0 double-success
2. 50 iterations: concurrent admin/merchant variant edit — 0 double-success
3. 50 iterations: concurrent admin variant attribute replacement — 0 lost updates
4. FOR SHARE vs FOR UPDATE serialization: variant create vs type change

---

## 14. Import / Export Compatibility

| Check | Status |
|-------|--------|
| Admin Excel import creates variants | Existing — unaffected |
| Import writes to `product_variants` | Existing — P5 uses same table |
| Import writes to `variant_attribute_values` | Existing — P5 uses same table |
| Import `combination_key` update | Existing — P5 does not change |
| CSV export includes variants | Existing — unaffected |
| Round-trip import → edit → re-import | P5 edits do not break import dedup |

**Status:** PASS — No breaking changes to import/export flows.

---

## 15. Performance Considerations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Variant matrix N+1 attribute loading | MEDIUM | Already deferred; not P5 scope |
| Large variant list loading in admin editor | LOW | Pagination deferred; admin context has bounded variant counts |
| Bulk variant operations on large products | LOW | Existing `bulkVariantOperations()` iterates sequentially |

No premature optimization. Only concrete risks supported by the repository are listed.

---

## 16. Findings Matrix

| ID | Severity | Area | Current State | Evidence | Risk | Required Decision/Fix | Recommended Direction | Blocks? |
|----|----------|------|---------------|----------|------|----------------------|----------------------|---------|
| F5-01 | HIGH | API | No admin variant endpoints | admin.controller.ts has 0 variant routes | Admins cannot manage variants | Add admin variant CRUD endpoints | Delegate to CatalogService without assertProductInOrg | NO |
| F5-02 | HIGH | API | No `GET /v1/admin/variants/:id` | Admin variant detail page calls nonexistent route | Admin variant detail page is broken | Add endpoint | `GET /v1/admin/variants/:id` → `catalogService.getVariant()` | NO |
| F5-03 | HIGH | Frontend | Admin variant UI is read-only | ProductDetails.tsx variants tab, `/variants/[id]` page | No create/edit/deactivate/delete | Add variant management UI | Follow P3 ProductForm pattern | NO |
| F5-04 | MEDIUM | Security | No admin variant permission | All variant ops require `merchant:products:write` | Admin needs separate permission path | Reuse `catalog:products:write` | Consistent with P3 admin product CRUD | NO |
| F5-05 | MEDIUM | Concurrency | Variant attribute writes use FOR UPDATE | Phase 3 `setVariantAttributeValues()` | Admin concurrent writes need same protection | Reuse existing Phase 3 protection | No new locking strategy needed | NO |
| F5-06 | LOW | Frontend | Variant detail page reads from deprecated JSONB | `attributes` field rendered as key-value | JSONB attributes are deprecated (Phase 3) | Switch to typed attribute display | Read from `variant_attribute_values` | NO |
| F5-07 | LOW | Schema | `dimensions_mm` is JSONB | catalog.schema.ts line 105 | Unstructured data in JSONB column | Accept as-is | Not P5 scope to restructure | NO |

**Summary:** 0 CRITICAL, 3 HIGH, 2 MEDIUM, 2 LOW. No blockers.

---

## 17. Business Decisions

### BD-NEXT-01 — Admin Variant Create Permission

**LOCKED**

| Aspect | Detail |
|--------|--------|
| Decision | Admin variant create uses `catalog:products:write` (same as P3 admin product CRUD) |
| Rationale | Consistency with P3; admin variant management is canonical product management |
| Alternatives rejected | New `catalog:variants:write` permission — unnecessary granularity, adds seed complexity |
| Consequence | Any admin with product write access can also manage variants |

### BD-NEXT-02 — Admin Variant Deactivation vs Deletion

**LOCKED**

| Aspect | Detail |
|--------|--------|
| Decision | Deactivation (set `is_active = false`) is the primary mechanism. Hard delete is available but secondary. |
| Rationale | Variants may have merchant offers, order history, or inventory references. Deactivation preserves referential integrity. |
| Alternatives rejected | Hard-delete only — would cascade to offers and order items |
| Consequence | Admin UI shows deactivate as primary action; delete requires explicit confirmation |

### BD-NEXT-03 — Admin Variant Optimistic Locking

**LOCKED**

| Aspect | Detail |
|--------|--------|
| Decision | P1 optimistic locking contract is reused for admin variant edits |
| Rationale | Consistency with P1/P3; already implemented in `updateVariant()` |
| Alternatives rejected | No locking — repeats the P3-19 defect pattern |
| Consequence | Admin variant edit sends `updatedAt`; 409 on mismatch; same conflict UX as P3 |

### BD-NEXT-04 — Admin Variant Attribute Editing

**LOCKED**

| Aspect | Detail |
|--------|--------|
| Decision | Admin edits VARIANT-scope typed attributes through `PUT /v1/admin/products/:productId/variants/:variantId/attribute-values` |
| Rationale | Phase 3 established typed attribute authority; admin needs the same capability for variant attributes |
| Alternatives rejected | Edit through JSONB — deprecated since Phase 3 |
| Consequence | New admin endpoint delegates to `taxonomyService.setVariantAttributeValues()` |

### BD-NEXT-05 — Admin Variant Bulk Operations

**PROPOSED**

| Aspect | Detail |
|--------|--------|
| Decision | Bulk operations (batch create, batch delete, batch toggle active) are available through admin endpoint |
| Rationale | Existing `bulkVariantOperations()` supports all three operations |
| Alternatives rejected | Single-operation only — inefficient for variant matrix management |
| Consequence | Admin UI may provide bulk selection in a later iteration; backend supports it immediately |

### BD-NEXT-06 — Admin Variant Create on Any Product

**LOCKED**

| Aspect | Detail |
|--------|--------|
| Decision | Admin can create variants on any canonical product regardless of which merchant owns it |
| Rationale | Admin cross-org access is by design (same as P3 product editing) |
| Alternatives rejected | Restrict to admin's "own" products — admins have no org affiliation |
| Consequence | No assertProductInOrg on admin variant operations |

### BD-NEXT-07 — Variant Detail Endpoint

**LOCKED**

| Aspect | Detail |
|--------|--------|
| Decision | Add `GET /v1/admin/variants/:id` endpoint to admin controller |
| Rationale | The admin variant detail page already exists but calls a nonexistent backend route |
| Alternatives rejected | Reroute through product-scoped variant list — unnecessary indirection |
| Consequence | Fixes latent defect; admin variant detail page becomes functional |

---

## 18. Proposed Scope

### IN SCOPE

| Deliverable | Description |
|-------------|-------------|
| Admin variant CRUD endpoints | `POST`, `PATCH`, `GET` on admin controller |
| Admin variant typed attribute endpoint | `PUT .../variants/:variantId/attribute-values` |
| Admin variant bulk endpoint | `POST .../products/:productId/variants/bulk` |
| Admin variant create UI | Form accessible from product editor / product detail |
| Admin variant edit UI | Edit form on variant detail page or inline |
| Admin variant deactivate/reactivate | Toggle on variant detail page |
| Admin variant delete | With confirmation dialog |
| Variant typed attribute editor | VARIANT-scope attributes from product type schema |
| 409 conflict UX for variant edits | Reuse P3 conflict banner pattern |
| Unsaved changes protection | `beforeunload` on variant edit forms |
| Arabic RTL for variant fields | `dir="rtl"` on Arabic fields |

### OUT OF SCOPE

| Item | Target |
|------|--------|
| Merchant Product Studio edit mode | P6 |
| Merchant variant editing | P7 |
| Admin product list search/filter | P8 |
| Audit trail expansion | P9 |
| Unsaved changes in Product Studio | P10 |
| Variant matrix N+1 optimization | Deferred |
| Media add/reorder UI (P3 deferred) | Deferred UX |
| Navigation guard (P3 deferred) | Deferred UX |
| Specialized attribute widgets (P3 deferred) | Deferred UX |
| Offer management | Never (by design) |
| Pricing / inventory / shipping | Outside Phase 4 |

### DEFERRED (from P3)

| Item | Reason |
|------|--------|
| Media add/upload UI wiring | Not P5 scope — separate UX phase |
| Media reorder UI wiring | Not P5 scope — separate UX phase |
| Next.js navigation guard | Not P5 scope — separate UX phase |
| SELECT/MULTI_SELECT/FILE/MEASUREMENT/CURRENCY widgets | Not P5 scope — separate UX phase |

### DEPENDENCIES

| Dependency | Status |
|------------|--------|
| P1 optimistic locking | CLOSED / PASS |
| P2 identifier/type rules | CLOSED / PASS |
| P3 admin product CRUD | CLOSED / PASS |
| Phase 3 typed attribute authority | CLOSED / PASS |
| Existing `CatalogService` variant methods | Production-ready |
| `product_variants` table | Exists, no schema change needed |
| `variant_attribute_values` table | Exists, no schema change needed |

---

## 19. Explicit Out-of-Scope

The following are explicitly locked OUT OF SCOPE for P5:

| Item | Reason |
|------|--------|
| Merchant offers | Canonical-vs-offer boundary |
| Pricing | Offer-owned |
| Inventory / stock | Offer-owned |
| Shipping | Outside Phase 4 |
| Payment | Outside Phase 4 |
| Refunds / returns | Outside Phase 4 |
| Notifications | Outside Phase 4 |
| Import/export changes | P5 does not modify import flows |
| Migration 0054+ | Not required |
| Variant matrix redesign | Deferred |
| Bulk import of variants via Excel | Existing import flow unaffected |

---

## 20. Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| `catalog:products:write` permission key | RBAC | Exists (seeded) |
| `CatalogService.createVariant()` | Backend | Production-ready |
| `CatalogService.updateVariant()` | Backend | Production-ready (P1 optimistic locking) |
| `CatalogService.bulkVariantOperations()` | Backend | Production-ready |
| `CatalogService.getVariant()` | Backend | Production-ready |
| `TaxonomyService.setVariantAttributeValues()` | Backend | Production-ready (Phase 3) |
| `product_variants` table | Schema | Exists |
| `variant_attribute_values` table | Schema | Exists |
| P3 admin CRUD pattern | Architecture | Established |

---

## 21. Required Test Strategy

### Unit Tests

| Area | Coverage |
|------|----------|
| Admin variant create | Delegation to CatalogService, no assertProductInOrg |
| Admin variant edit | Optimistic locking pass-through |
| Admin variant deactivate | isActive toggle |
| Admin variant delete | Soft/hard delete behavior |
| Admin variant attributes | Typed attribute delegation |
| Permission enforcement | catalog:products:write required |

### PostgreSQL Integration Tests (Testcontainers)

| Area | Coverage |
|------|----------|
| Admin variant create | Create with typed attributes |
| Admin variant edit + optimistic locking | 409 on conflict |
| Concurrent admin/admin variant edit | Exactly 1 winner |
| Concurrent admin/merchant variant edit | Exactly 1 winner |
| Admin variant attribute replacement | FOR UPDATE serialization |
| Bulk variant operations | Create + delete + toggle in batch |

### Concurrency Tests (mandatory)

| Scenario | Iterations | Expected |
|----------|-----------|----------|
| Admin vs admin variant edit | 50 | 0 double-success |
| Admin vs merchant variant edit | 50 | 0 double-success |
| Admin variant attribute write vs admin variant attribute write | 50 | 0 lost updates |

### Security Tests

| Area | Coverage |
|------|----------|
| Admin with catalog:products:write | Succeeds |
| Admin without permission | 403 |
| Admin cross-org variant access | Succeeds (by design) |
| No IDOR | Variant scoped to product |

### Regression Tests

| Suite | Expected |
|-------|----------|
| P1 unit | 12/12 PASS |
| P1 PostgreSQL | 13/13 PASS |
| P2 unit | 28/28 PASS |
| P2 PostgreSQL | 27/27 PASS |
| P3 unit | 11/11 PASS |
| P3 PostgreSQL | 11/11 PASS |
| Admin moderation | 18/18 PASS |
| Catalog unit | All PASS |
| Catalog import | All PASS |
| TypeScript | 0 errors |
| Nest build | PASS |

---

## 22. Required Independent Runtime Verification

After implementation, the independent runtime verification must prove:

1. All admin variant CRUD operations work against real PostgreSQL
2. Optimistic locking on variant edits produces 409 on conflict
3. Concurrent admin/admin and admin/merchant variant edits produce exactly 1 winner
4. Typed variant attribute writes are properly serialized
5. No regression in P1/P2/P3 tests
6. Import/export compatibility is maintained
7. Security: permission enforcement, cross-org access, no IDOR

---

## 23. Acceptance Criteria Draft

**PROPOSED — REQUIRES BUSINESS/ARCHITECTURE LOCK**

| ID | Criterion |
|----|-----------|
| P5-01 | Admin can create a variant on any canonical product through Admin Console |
| P5-02 | Admin can edit variant scalar fields (SKU, title, titleAr, barcode, unit, weightGrams) |
| P5-03 | Admin can edit VARIANT-scope typed attributes through the admin variant editor |
| P5-04 | Admin can deactivate and reactivate a variant |
| P5-05 | Admin can delete a variant with confirmation |
| P5-06 | Admin variant edit uses optimistic locking (P1 contract); stale edit returns 409 |
| P5-07 | Admin variant create uses FOR SHARE lock (blocks productTypeId change) |
| P5-08 | `catalog:products:write` permission is enforced on all admin variant endpoints |
| P5-09 | Admin cross-org variant access works (no assertProductInOrg) |
| P5-10 | Admin can view variant detail at `/variants/[id]` (backend endpoint fixed) |
| P5-11 | 409 conflict UX displays conflict banner with Reload and Discard options |
| P5-12 | Arabic variant fields render with `dir="rtl"` |
| P5-13 | TypeScript compilation: 0 errors |
| P5-14 | Nest build: succeeds |
| P5-15 | Full regression suite: no regression from P3 baseline |
| P5-16 | No migration 0054 created |
| P5-17 | Admin + merchant concurrent variant edit: exactly 1 winner, 1 gets 409 |
| P5-18 | Two concurrent admin variant edits: exactly 1 winner, 1 gets 409 |
| P5-19 | Admin variant operations do not modify merchant offers |
| P5-20 | Admin bulk variant operations (create, delete, toggle) work correctly |
| P5-21 | Import/export compatibility: admin variant edits do not break import flows |
| P5-22 | Variant combination_key uniqueness is preserved |

---

## 24. Implementation Readiness Gate

**GO WITH CONDITIONS**

P5 (Admin Variant Management) is ready for Business Rules + Architecture Lock.

**Conditions:**

1. All 7 business decisions (BD-NEXT-01 through BD-NEXT-07) must be formally locked.
2. BD-NEXT-05 (bulk operations) is PROPOSED — must be confirmed or deferred.
3. The 22 acceptance criteria (P5-01 through P5-22) must be formally locked.
4. No migration is required — confirmed by schema inspection.

**Rationale:**
- Backend is 100% ready — all variant operations exist in CatalogService
- No migration required — pure endpoint + UI deliverable
- Business rules follow P3 patterns exactly
- P1 optimistic locking already implemented for variants
- Phase 3 typed attribute authority already implemented for variants
- No blocking defects exist (F5-02 latent defect is IN the P5 scope)

---

## 25. Recommended Next Step

**PHASE 4 P5 BUSINESS RULES + ARCHITECTURE LOCK**

This audit recommends proceeding to the Business Rules + Architecture Lock step for P5. The lock document should:

1. Formalize BD-NEXT-01 through BD-NEXT-07
2. Lock the proposed acceptance criteria (P5-01 through P5-22)
3. Confirm no migration is required
4. Confirm the test strategy including concurrency tests
5. Lock the P5 scope as defined in Section 18
6. Reference P3 deferred conditions as still deferred

**Exact next gate:**

PHASE 4 P5 BUSINESS RULES + ARCHITECTURE LOCK

Do NOT proceed directly to P5 implementation.
