# SCS Catalog Product Management — Phase 4 P5 Business Rules + Architecture Lock

## 1. Executive Summary

This document locks all business rules and architecture decisions for Phase 4 P5 (Admin Variant Management) of the SCS Catalog Product Management milestone (M7.3-C).

P5 delivers production-grade admin variant management: the ability for authorized administrators to create, edit, deactivate/reactivate, and delete product variants through the Admin Console, with full optimistic locking, typed attribute editing, bulk operations, and conflict resolution — mirroring the P3 pattern established for canonical products.

**Phase 4 P5 Business Rules + Architecture Decision Lock: LOCKED / GO**

| Field | Value |
|-------|-------|
| Phase | Phase 4 P5 |
| Name | Admin Variant Management |
| Milestone | M7.3-C — Catalog Import + Product / Variant Management |
| Branch | `develop` |
| HEAD | `946dfa0` |
| Lock date | October 5, 2026 |
| Lock status | **LOCKED / GO** |
| Audit reference | `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-4-NEXT-MILESTONE-ARCHITECTURE-AUDIT.md` |
| Conditions | 0 blockers, 0 unresolved decisions, no migration required |

---

## 2. Baseline

| Aspect | Value |
|--------|-------|
| Branch | `develop` |
| HEAD | `946dfa0` |
| Latest migration | `0053_attribute_backfill.sql` |
| Migration 0054 | Does NOT exist |
| Phase 3 (Typed Attributes) | CLOSED / PASS |
| P1 (Optimistic Locking) | CLOSED / PASS |
| P2 (Identifiers + Type Rules) | CLOSED / PASS |
| P3 (Admin Product Create/Edit) | CLOSED / PASS |
| P3 unit tests | 91/91 PASS |
| P3 PostgreSQL tests | 69/69 PASS |
| P3 concurrency | 0/250 double-success |
| TypeScript | 0 errors |
| Nest build | 290 files, 0 issues |

### What P5 must NOT regress

- All P1 optimistic locking behavior (product + variant)
- All P2 identifier/type rules (FOR SHARE / FOR UPDATE)
- All P3 admin product CRUD and moderation
- Phase 3 typed attribute authority (product + variant)
- All existing catalog, import, and governance tests
- Existing merchant variant APIs

---

## 3. P5 Objective

Administrators currently can view variants read-only but cannot manage them. When merchants have not yet created variants for a canonical product, or when variant data needs correction, administrators have no path to act. P5 closes this gap while preserving the canonical-vs-offer boundary.

**Personas:**
- Platform administrator (cross-org, `catalog:products:write`)

**Workflows:**
1. Admin creates a variant on a canonical product
2. Admin edits variant scalar fields (SKU, title, titleAr, barcode, unit, weightGrams)
3. Admin edits variant typed attributes (VARIANT-scope)
4. Admin deactivates/reactivates a variant
5. Admin deletes a variant (deactivation preferred)
6. Admin uses bulk operations (batch create, batch delete, batch toggle active)
7. Admin views variant detail (fixes latent defect — missing backend endpoint)

---

## 4. Business Rules

### BD-P5-01 — Admin Variant Create Permission (LOCKED)

| Aspect | Detail |
|--------|--------|
| Decision | Admin variant creation uses `catalog:products:write` |
| Rationale | Variant management is part of canonical product management and follows the same permission model established by P3 |
| Alternatives rejected | New `catalog:variants:write` permission — unnecessary granularity, adds seed complexity |
| Consequence | Any admin with product write access can also manage variants |

**DO NOT introduce `catalog:variants:write`.**

### BD-P5-02 — Deactivation vs Delete (LOCKED)

| Aspect | Detail |
|--------|--------|
| Decision | Variant deactivation (`is_active = false`) is the primary lifecycle operation |
| Rationale | Variants may have merchant offers, order history, inventory references, or other downstream references |
| Hard delete | Available as secondary operation requiring explicit confirmation |
| Consequence | Admin UI shows deactivate as primary action; delete requires explicit confirmation dialog |

Do not silently cascade destructive behavior from the UI.

### BD-P5-03 — Optimistic Locking (LOCKED)

| Aspect | Detail |
|--------|--------|
| Decision | Admin variant edits MUST use the existing P1 optimistic locking contract |
| Mechanism | `updatedAt` timestamp comparison |
| Client sends | `updatedAt` / `clientUpdatedAt` value from loaded variant |
| Server checks | `WHERE id = ? AND updated_at = clientUpdatedAt` |
| On mismatch | HTTP 409 CONFLICT with established conflict response contract |
| Rationale | Consistency with P1/P3; already implemented in `updateVariant()` |
| Alternatives rejected | No locking (repeats P3-19 defect), last-write-wins, application-level mutexes, automatic retries |

### BD-P5-04 — Typed Variant Attributes (LOCKED)

| Aspect | Detail |
|--------|--------|
| Decision | VARIANT-scope attributes managed through `PUT /v1/admin/products/:productId/variants/:variantId/attribute-values` |
| Authority | Typed variant attribute tables (`variant_attribute_values`) are authoritative |
| Delegation | Endpoint delegates to `TaxonomyService.setVariantAttributeValues()` |
| Serialization | Preserves existing Phase 3 FOR UPDATE serialization |
| JSONB | `product_variants.attributes` remains deprecated — NEVER read or write through JSONB |
| Consequence | No dual-write architecture; typed tables only |

### BD-P5-05 — Bulk Operations (LOCKED)

| Aspect | Detail |
|--------|--------|
| Decision | Bulk backend endpoint IN SCOPE; frontend bulk-selection UI DEFERRED |
| Backend | `POST /v1/admin/products/:productId/variants/bulk` |
| Supported operations | `create` (batch), `deleteIds` (batch), `toggleActive` (batch) |
| Rationale | Existing `bulkVariantOperations()` supports all three operations; backend should expose them |
| Frontend UI | NOT included in P5 — no bulk-selection checkboxes, no bulk action bar |
| Consequence | Backend available for future admin UI iterations; P5 focuses on single-variant CRUD |

**Existing `bulkVariantOperations()` implementation confirmed:**
- `create`: FOR SHARE lock + typed attribute writes + compensation rollback
- `deleteIds`: Scoped DELETE with product_id guard
- `toggleActive`: Per-variant isActive update with `updatedAt` refresh

### BD-P5-06 — Cross-Org Admin Access (LOCKED)

| Aspect | Detail |
|--------|--------|
| Decision | Admins can create, edit, deactivate, reactivate, and delete variants on ANY canonical product |
| assertProductInOrg | NOT used inside admin variant operations |
| Rationale | Follows P3 admin cross-org architecture |
| Merchant isolation | Merchant endpoints MUST retain existing `assertProductInOrg` tenant isolation |

### BD-P5-07 — Variant Detail Endpoint (LOCKED)

| Aspect | Detail |
|--------|--------|
| Decision | Add `GET /v1/admin/variants/:id` endpoint |
| Rationale | Existing admin variant detail page calls `adminRequest('variants/:id')` but no backend route exists — latent defect |
| Authorization | Must use authorization before sensitive lookup; must not introduce IDOR |
| Delegation | Delegates to `catalogService.getVariant()` |
| Consequence | Fixes latent defect; admin variant detail page becomes functional |

---

## 5. Locked Business Decisions Summary

| ID | Decision | Status |
|----|----------|--------|
| BD-P5-01 | Permission: `catalog:products:write` | LOCKED |
| BD-P5-02 | Deactivation primary, delete secondary | LOCKED |
| BD-P5-03 | P1 optimistic locking preserved | LOCKED |
| BD-P5-04 | Typed variant attributes authoritative | LOCKED |
| BD-P5-05 | Bulk backend IN SCOPE, bulk UI DEFERRED | LOCKED |
| BD-P5-06 | Cross-org admin access, no assertProductInOrg | LOCKED |
| BD-P5-07 | GET /v1/admin/variants/:id endpoint required | LOCKED |

All 7 business decisions are LOCKED. Zero PROPOSED decisions remain.

---

## 6. Domain Model

### Entities Affected

| Entity | Change Required |
|--------|----------------|
| `product_variants` | No schema change |
| `variant_attribute_values` | No schema change |
| `attribute_definitions` | No change |
| `attribute_options` | No change |
| `products` | No change |

### Existing Variant Schema (authoritative)

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

### New Entities/Fields

**None required.** P5 is a pure endpoint + UI milestone.

### Relationships

No new relationships. Variant → Product FK already exists with CASCADE delete.

---

## 7. API Contract

### Admin Variant Endpoints (authoritative)

| Endpoint | Method | Permission | Delegates To | Notes |
|----------|--------|------------|--------------|-------|
| `GET /v1/admin/variants/:id` | GET | `catalog:products:write` | `catalogService.getVariant()` | Fixes latent defect |
| `POST /v1/admin/products/:productId/variants` | POST | `catalog:products:write` | `catalogService.createVariant()` | No assertProductInOrg |
| `PATCH /v1/admin/products/:productId/variants/:variantId` | PATCH | `catalog:products:write` | `catalogService.updateVariant()` | P1 optimistic locking |
| `PUT /v1/admin/products/:productId/variants/:variantId/attribute-values` | PUT | `catalog:products:write` | `taxonomyService.setVariantAttributeValues()` | Typed variant attributes |
| `POST /v1/admin/products/:productId/variants/bulk` | POST | `catalog:products:write` | `catalogService.bulkVariantOperations()` | Batch create/delete/toggle |

### Authorization Rules

All admin variant mutation endpoints:
- MUST require `catalog:products:write`
- MUST NOT use `assertProductInOrg()`
- MUST preserve authorization-before-sensitive-lookup
- MUST preserve IDOR protection
- MUST preserve canonical product ownership rules

### DTO Reuse

- `CreateVariantInput` — already exists, reused for admin variant create
- `UpdateVariantInput` — already exists (includes `updatedAt` for P1 optimistic locking)
- `SetVariantAttributeValuesInput` — may be needed for typed attribute endpoint

### Conflict Response Contract

```
HTTP 409 CONFLICT
{
  "statusCode": 409,
  "message": "CONFLICT",
  "currentUpdatedAt": "2026-10-05T..."
}
```

---

## 8. Authorization / Tenant Rules

| Rule | Detail |
|------|--------|
| Admin permission | `catalog:products:write` (same as P3) |
| Admin cross-org | By design — admins operate across all organizations |
| assertProductInOrg | NOT applied to admin variant operations |
| IDOR protection | Variant scoped to product; variant lookup uses `WHERE product_id = ? AND variant_id = ?` |
| Authorization ordering | Auth before sensitive operation |
| Merchant tenant isolation | Unaffected — merchant endpoints retain `assertProductInOrg` |
| No new permissions | Existing `catalog:products:write` is sufficient |

### Security Tests Required

| # | Test | Expected |
|---|------|----------|
| 1 | Admin with `catalog:products:write` | Success |
| 2 | Admin without permission | 403 Forbidden |
| 3 | Admin cross-org variant access | Success (by design) |
| 4 | Malformed product/variant relationship | Rejected |
| 5 | Variant from another product | Rejected |
| 6 | Merchant tenant isolation | Remains intact |

---

## 9. Attribute Authority

### Variant Attribute Storage

| Aspect | Rule |
|--------|------|
| Authoritative storage | `variant_attribute_values` table |
| Deprecated storage | `product_variants.attributes` JSONB — NEVER used |
| Write endpoint | `PUT /v1/admin/products/:productId/variants/:variantId/attribute-values` |
| Delegation | `TaxonomyService.setVariantAttributeValues()` |
| Concurrency | `SELECT ... FOR UPDATE` + DELETE/INSERT in transaction (Phase 3) |
| Source | Product type schema (`GET /v1/product-types/:id/schema`) |

### Rules

- P5 MUST NOT create a new dual-write architecture
- Do not write both typed and JSONB attributes
- Do not make JSONB authoritative again
- Variant attribute reads in admin UI must use the typed attribute system

---

## 10. Optimistic Locking

### Admin Variant Edit (P1 contract — authoritative)

| Aspect | Rule |
|--------|------|
| Mechanism | `updatedAt` timestamp comparison |
| Client sends | `updatedAt` / `clientUpdatedAt` value from loaded variant |
| Server checks | `UPDATE ... WHERE id = ? AND updated_at = clientUpdatedAt` |
| On match | Apply update, set new `updatedAt`, return updated record |
| On mismatch | HTTP 409 CONFLICT `{ statusCode: 409, message: 'CONFLICT', currentUpdatedAt: '...' }` |
| Scope | `updateVariant()` — already implemented |

### Frontend Conflict UX

When 409 is received:
1. Detect the conflict
2. Stop treating the save as successful
3. Display clear conflict banner
4. Explain that another user changed the variant
5. Provide Reload option
6. Provide Discard/Cancel option
7. Do NOT silently overwrite newer data
8. Do NOT implement automatic merge or retry

Reuse the P3 conflict banner pattern exactly.

---

## 11. Transaction Boundaries

| Operation | Transaction Boundary | Lock Type |
|-----------|---------------------|-----------|
| Admin variant create | FOR SHARE on product row → INSERT variant → typed attributes | FOR SHARE (P2) |
| Admin variant edit | `UPDATE ... WHERE updated_at = clientUpdatedAt` | Optimistic (P1) |
| Admin variant attribute write | `SELECT ... FOR UPDATE` on variant → DELETE/INSERT typed values | FOR UPDATE (Phase 3) |
| Admin bulk variant create | FOR SHARE on product → loop INSERT + typed attributes | FOR SHARE (P2) |
| Admin bulk variant delete | Scoped DELETE with product_id guard | None (scoped) |
| Admin bulk variant toggle | Per-variant UPDATE with `updatedAt` refresh | Optimistic (P1) |
| Admin variant delete | CASCADE via FK (product_variants → products) | FK CASCADE |

### Existing Protections Preserved

- `createVariant()` — FOR SHARE lock blocks productTypeId changes
- `updateVariant()` — P1 optimistic locking
- `bulkVariantOperations()` create path — FOR SHARE lock
- `setVariantAttributeValues()` — FOR UPDATE serialization
- `adminUpdateProduct()` productTypeId change — FOR UPDATE blocks when variants exist

---

## 12. Concurrency Rules

### Mandatory Concurrency Scenarios

| # | Scenario | Strategy | Expected Result |
|---|----------|----------|----------------|
| 1 | Admin vs Admin variant edit | Optimistic locking (P1) | Exactly 1 winner, 1 gets 409 |
| 2 | Admin vs Merchant variant edit | Optimistic locking (P1) | Exactly 1 winner, 1 gets 409 |
| 3 | Admin variant create vs productTypeId change | FOR SHARE / FOR UPDATE serialization | Create blocks or type change blocks |
| 4 | Admin variant attribute write vs admin variant attribute write | FOR UPDATE serialization (Phase 3) | Exactly 1 winner, no lost updates |
| 5 | Bulk variant create vs productTypeId change | FOR SHARE blocks type change | Serialization preserved |
| 6 | Variant delete vs concurrent offer creation | FK CASCADE behavior | Verify actual DB behavior |

### Mandatory Concurrency Tests

| Test | Iterations | Expected |
|------|-----------|----------|
| Admin vs Admin variant edit | 50 | 0 double-success |
| Admin vs Merchant variant edit | 50 | 0 double-success |
| Concurrent variant attribute replacement | 50 | 0 lost updates |
| Variant create vs productTypeId change | Verify | Actual PostgreSQL serialization |

Do not accept mock-only evidence for concurrency.

---

## 13. Database / Migration Rules

**NO MIGRATION REQUIRED FOR P5.**

### Existing Infrastructure (sufficient)

| Resource | Status |
|----------|--------|
| `product_variants` table | Exists, full schema |
| `variant_attribute_values` table | Exists (Phase 3) |
| `combination_key` partial unique index | Exists |
| `updated_at` column | Exists (P1 optimistic locking) |
| Foreign keys | Existing (CASCADE delete) |
| All indexes | Existing |

### Migration Decision

- Migration 0054 is NOT planned for P5
- If implementation discovers a genuine schema requirement: **STOP and return to architecture review**
- Do not create an unplanned migration during P5 implementation

---

## 14. Frontend / UX Architecture

### Required P5 Frontend Deliverables

| # | Deliverable | Description |
|---|-------------|-------------|
| 1 | Variant detail | Functional `/variants/[id]` page (currently broken — latent defect) |
| 2 | Variant create | Form accessible from admin product detail / product editor |
| 3 | Variant edit | Edit form on variant detail page or inline |
| 4 | Active/inactive state | Deactivate/reactivate toggle |
| 5 | Delete confirmation | Explicit confirmation dialog before hard delete |
| 6 | Typed variant attributes | VARIANT-scope attribute editor from product type schema |
| 7 | 409 conflict UX | Conflict banner with Reload / Discard options (P3 pattern) |
| 8 | Unsaved-change protection | `beforeunload` on variant edit forms |
| 9 | Arabic/RTL fields | `dir="rtl"` on Arabic variant fields |

### UX Patterns to Follow

- P3 ProductForm pattern: sectioned form, typed attribute editor
- P3 409 conflict banner: Reload / Discard options
- P3 beforeunload: unsaved changes protection
- Existing admin detail page patterns (breadcrumbs, tabs, KV grids)

### Routes

| Route | Purpose | Status |
|-------|---------|--------|
| `/variants/[id]` | Admin variant detail | **EXISTING — becomes functional (P5)** |
| `/products/[id]` | Admin product detail | Existing — variant management entry point |
| `/products/[id]/edit` | Admin product edit | Existing (P3) — variant section may link to variant management |

### Do Not

- Redesign the entire Admin Product Management experience
- Implement P8 product-list redesign
- Implement bulk-selection UI (deferred)

---

## 15. Bulk Operation Rules

### Backend (IN SCOPE)

| Operation | Endpoint | Description |
|-----------|----------|-------------|
| Batch create | `POST /v1/admin/products/:productId/variants/bulk` | `create: CreateVariantInput[]` |
| Batch delete | Same endpoint | `deleteIds: string[]` |
| Batch toggle active | Same endpoint | `toggleActive: Array<{ id, isActive }>` |

### Frontend Bulk UI (DEFERRED)

- No bulk-selection checkboxes in P5
- No bulk action bar in P5
- Backend endpoint available for future iterations

### Safe Operations Only

- Do not add arbitrary new bulk behavior
- Only expose existing safe operations: create, delete, toggleActive
- Preserve existing FOR SHARE locking semantics for bulk create

---

## 16. Security Requirements

### RBAC

| Check | Requirement |
|-------|-------------|
| Admin with `catalog:products:write` | Success |
| Admin without permission | 403 Forbidden |
| Admin cross-org | Success (by design) |
| Merchant tenant isolation | Unaffected |

### IDOR Protection

- Variant lookup scoped to product: `WHERE product_id = ? AND variant_id = ?`
- Variant from another product → rejected
- Malformed product/variant relationship → rejected

### Mass Assignment

- `CreateVariantInput` DTO restricts writable fields
- Admin wrapper must use the same DTO
- No new mass-assignment risks

### Authorization Ordering

- Authorization before sensitive lookup (maintain pattern)
- No IDOR introduction

---

## 17. Import / Export Compatibility

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

## 18. Performance Constraints

| Risk | Severity | Mitigation |
|------|----------|------------|
| Variant matrix N+1 attribute loading | MEDIUM | Already deferred; not P5 scope |
| Large variant list loading in admin editor | LOW | Bounded variant counts in admin context |
| Bulk variant operations on large products | LOW | Existing sequential iteration |

No premature optimization. Only concrete risks supported by the repository are listed.

---

## 19. IN SCOPE

| # | Deliverable | Description |
|---|-------------|-------------|
| 1 | Admin variant detail endpoint | `GET /v1/admin/variants/:id` — fixes latent defect |
| 2 | Admin variant create endpoint | `POST /v1/admin/products/:productId/variants` |
| 3 | Admin variant edit endpoint | `PATCH /v1/admin/products/:productId/variants/:variantId` |
| 4 | Admin variant typed-attribute endpoint | `PUT .../variants/:variantId/attribute-values` |
| 5 | Admin variant bulk endpoint | `POST .../products/:productId/variants/bulk` |
| 6 | Admin variant create UI | Form accessible from product editor / product detail |
| 7 | Admin variant edit UI | Edit form on variant detail page or inline |
| 8 | Admin variant detail UI integration | Functional `/variants/[id]` page |
| 9 | Admin variant deactivate/reactivate | Toggle on variant detail page and/or table |
| 10 | Admin variant delete | With explicit confirmation dialog |
| 11 | VARIANT-scope typed attribute editor | From product type schema |
| 12 | P1-compatible 409 conflict handling | Reuse P3 conflict UX |
| 13 | Unsaved changes protection | `beforeunload` on variant edit forms |
| 14 | Arabic/RTL variant fields | `dir="rtl"` on Arabic fields |
| 15 | Security/RBAC | `catalog:products:write` enforcement |
| 16 | Tenant/cross-org authorization | No assertProductInOrg for admin |
| 17 | PostgreSQL concurrency protection | FOR SHARE, FOR UPDATE, optimistic locking |
| 18 | Regression coverage | P1/P2/P3/Phase 3 intact |

---

## 20. OUT OF SCOPE

| Item | Target Phase |
|------|-------------|
| Merchant Product Studio edit mode | P6 |
| Merchant variant editing | P7 |
| Admin product-list search/filter redesign | P8 |
| Audit trail expansion | P9 |
| Product Studio unsaved-changes redesign | P10 |
| Variant matrix N+1 optimization | Deferred |
| Media add/upload UI | Deferred UX |
| Media reorder UI | Deferred UX |
| Next.js navigation guard redesign | Deferred UX |
| Specialized attribute widgets (SELECT, MULTI_SELECT, FILE, MEASUREMENT, CURRENCY) | Deferred UX |
| Merchant offers | Never (by design) |
| Offer pricing | Never (by design) |
| Inventory/stock management | Outside Phase 4 |
| Shipping | Outside Phase 4 |
| Payment | Outside Phase 4 |
| Refunds | Outside Phase 4 |
| Returns | Outside Phase 4 |
| Notifications | Outside Phase 4 |
| Import/export redesign | — |
| Excel bulk-import redesign | — |
| New database migration | Not required |

### NON-NEGOTIABLE BOUNDARY

**Canonical product (WHAT) vs Merchant offer (HOW) boundary is preserved.**

P5 MUST NOT introduce:
- Offer pricing
- Merchant inventory
- Stock quantities
- MOQ
- Merchant lead time
- Merchant shipping
- Merchant offer lifecycle

---

## 21. DEFERRED

| Item | Reason |
|------|--------|
| Frontend bulk-selection UI | Backend available; UI deferred to future iteration |
| Media add/upload UI wiring | Not P5 scope — separate UX phase |
| Media reorder UI wiring | Not P5 scope — separate UX phase |
| Next.js navigation guard | Not P5 scope — separate UX phase |
| SELECT/MULTI_SELECT/FILE/MEASUREMENT/CURRENCY widgets | Not P5 scope — separate UX phase |
| Variant matrix N+1 optimization | Performance deferred |

---

## 22. Dependencies

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
| `combination_key` partial unique index | Schema | Exists |
| P3 admin CRUD pattern | Architecture | Established |
| P1 optimistic locking | Architecture | Established |
| P2 FOR SHARE locking | Architecture | Established |

---

## 23. Test Strategy

### A. Unit Tests

| Area | Coverage |
|------|----------|
| Admin variant create | Delegation to CatalogService, no assertProductInOrg |
| Admin variant update | Optimistic locking pass-through |
| Admin variant deactivate | isActive toggle |
| Admin variant reactivate | isActive toggle |
| Admin variant delete | Hard delete behavior |
| Admin variant typed attributes | Typed attribute delegation |
| Admin bulk operations | Batch create/delete/toggle |
| Permission enforcement | `catalog:products:write` required |
| Admin cross-org behavior | No assertProductInOrg |

### B. PostgreSQL Integration Tests (Testcontainers)

| Area | Coverage |
|------|----------|
| Admin variant create | Create with typed attributes |
| Admin variant update | Update with optimistic locking |
| Stale update → 409 | Conflict detection |
| Admin variant typed attributes | FOR UPDATE serialization |
| Admin bulk operations | Create + delete + toggle in batch |
| `combination_key` uniqueness | Duplicate prevention |
| ProductTypeId locking | FOR SHARE vs FOR UPDATE |

### C. Concurrency Tests (MANDATORY)

| Test | Iterations | Expected |
|------|-----------|----------|
| Admin vs Admin variant edit | 50 | 0 double-success |
| Admin vs Merchant variant edit | 50 | 0 double-success |
| Concurrent variant attribute replacement | 50 | 0 lost updates |
| Variant create vs productTypeId change | Verify | Actual PostgreSQL serialization |

### D. Security Tests

| Area | Coverage |
|------|----------|
| RBAC | `catalog:products:write` enforcement |
| IDOR | Variant scoped to product |
| Tenant isolation | Merchant endpoints unaffected |
| Cross-org | Admin access by design |

### E. Regression Tests

| Suite | Expected |
|-------|----------|
| P1 unit | 12/12 PASS |
| P1 PostgreSQL | 13/13 PASS |
| P2 unit | 28/28 PASS |
| P2 PostgreSQL | 27/27 PASS |
| P3 unit | 91/91 PASS |
| P3 PostgreSQL | 69/69 PASS |
| Phase 3 typed attribute authority | All PASS |
| Catalog unit | All PASS |
| Catalog import | All PASS |
| Governance | All PASS |
| Existing merchant variant APIs | All PASS |

### F. Build

| Check | Expected |
|-------|----------|
| API TypeScript | 0 errors |
| Admin TypeScript | 0 errors |
| Nest build | PASS |
| Admin build | PASS |

Do not accept mock-only evidence for concurrency.

---

## 24. Independent Runtime Verification

After implementation, independent verification must prove:

| # | Verification Area | Evidence Required |
|---|-------------------|-------------------|
| 1 | All admin variant endpoints | Against real PostgreSQL |
| 2 | UI functionality/build | Admin build PASS |
| 3 | Optimistic locking | 409 on conflict |
| 4 | 409 contract | Conflict response shape |
| 5 | Concurrency | 50 iterations per scenario |
| 6 | Typed attribute authority | FOR UPDATE serialization |
| 7 | Tenant/RBAC security | Permission enforcement |
| 8 | Import/export compatibility | No regression |
| 9 | `combination_key` uniqueness | Duplicate prevention |
| 10 | No offer mutation | Canonical-vs-offer boundary |
| 11 | No migration | 0054 does not exist |
| 12 | Regression | P1/P2/P3/Phase 3 intact |
| 13 | TypeScript/build | 0 errors |

**Implementation PASS is NOT release PASS.**

The independent verifier must NOT simply trust implementation test results.

---

## 25. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| P5-01 | Admin can create a variant on any canonical product |
| P5-02 | Admin can edit variant scalar fields: SKU, title, titleAr, barcode, unit, weightGrams |
| P5-03 | Admin can edit VARIANT-scope typed attributes |
| P5-04 | Admin can deactivate and reactivate a variant |
| P5-05 | Admin can delete a variant with explicit confirmation |
| P5-06 | Admin variant edit uses optimistic locking and stale updates return 409 |
| P5-07 | Admin variant create preserves FOR SHARE locking against productTypeId changes |
| P5-08 | `catalog:products:write` is enforced on all admin variant mutation endpoints |
| P5-09 | Admin cross-org variant access works as designed |
| P5-10 | Admin can view variant detail at `/variants/[id]` |
| P5-11 | 409 conflict UX provides Reload and Discard/Cancel |
| P5-12 | Arabic variant fields render correctly with RTL |
| P5-13 | API TypeScript has 0 errors |
| P5-14 | Nest build succeeds |
| P5-15 | Full regression introduces no P1/P2/P3 regression |
| P5-16 | No migration 0054 is created |
| P5-17 | Concurrent admin + merchant variant edits produce exactly one winner and one 409 |
| P5-18 | Concurrent admin + admin variant edits produce exactly one winner and one 409 |
| P5-19 | Admin variant management does not modify merchant offers |
| P5-20 | Admin bulk variant backend operations work correctly |
| P5-21 | Import/export compatibility remains intact |
| P5-22 | Variant `combination_key` uniqueness remains enforced |

---

## 26. Implementation Rules

### Implementation Sequence

| Stage | Deliverable |
|-------|-------------|
| P5.0 | Baseline verification |
| P5.1 | Admin variant detail endpoint (`GET /v1/admin/variants/:id`) |
| P5.2 | Admin variant create endpoint (`POST .../variants`) |
| P5.3 | Admin variant edit endpoint (`PATCH .../variants/:variantId`) |
| P5.4 | Admin variant typed-attribute endpoint (`PUT .../attribute-values`) |
| P5.5 | Admin variant bulk endpoint (`POST .../variants/bulk`) |
| P5.6 | Admin variant detail UI (fix `/variants/[id]` page) |
| P5.7 | Admin variant create UI |
| P5.8 | Admin variant edit UI |
| P5.9 | Deactivate/reactivate toggle |
| P5.10 | Delete with confirmation |
| P5.11 | Typed variant attribute editor |
| P5.12 | 409 conflict UX |
| P5.13 | Unsaved changes protection |
| P5.14 | Arabic/RTL fields |
| P5.15 | Permission / security verification |
| P5.16 | Unit tests |
| P5.17 | PostgreSQL integration tests |
| P5.18 | Concurrency tests |
| P5.19 | Full regression |
| P5.20 | P5 implementation report |
| P5.21 | Independent Runtime Verification |
| P5.22 | Release Closure |

### Rules

- Do NOT combine implementation and independent verification
- Do NOT duplicate variant business logic inside admin controller — delegate to CatalogService
- Do NOT introduce new locking strategies
- Do NOT create migration 0054

---

## 27. Release Gate

### Release Criteria

| Aspect | Requirement |
|--------|-------------|
| All acceptance criteria | P5-01 through P5-22 PASS |
| Concurrency tests | 0 double-success in mandatory scenarios |
| Regression | P1/P2/P3/Phase 3 intact |
| TypeScript | 0 errors |
| Build | Nest build + Admin build PASS |
| Migration | 0054 does NOT exist |
| Security | All RBAC/IDOR/tenant tests PASS |
| Import/export | No regression |
| Canonical-vs-offer | No offer mutation |
| Independent verification | Separate from implementation |

### Document Sequence

| Document | Status |
|----------|--------|
| Phase 4 Next Milestone Architecture Audit | COMPLETE (GO WITH CONDITIONS) |
| Phase 4 P5 Business Rules + Architecture Lock | **COMPLETE (LOCKED / GO)** |
| Phase 4 P5 Implementation Report | PENDING |
| Phase 4 P5 Independent Runtime Verification | PENDING |
| Phase 4 P5 Release Closure | PENDING |

---

## 28. Final Decision

**P5 BUSINESS RULES + ARCHITECTURE: LOCKED / GO**

| Aspect | Status |
|--------|--------|
| Business decisions | 7/7 LOCKED (BD-P5-01 through BD-P5-07) |
| Acceptance criteria | 22 LOCKED (P5-01 through P5-22) |
| Scope | 18 deliverables explicitly defined |
| Out-of-scope | 20+ items explicitly locked |
| Concurrency rules | 6 mandatory scenarios defined |
| Security rules | 6 mandatory tests defined |
| Migration required | NO |
| Canonical-vs-offer boundary | Explicit and non-negotiable |
| Implementation blockers | 0 |
| Unresolved decisions | 0 |

### Verification

- All business decisions locked: YES
- P5 scope unambiguous: YES
- Acceptance criteria locked: YES
- Concurrency rules explicit: YES
- Security rules explicit: YES
- No implementation blocker: YES
- No migration required: YES
- Canonical-vs-offer boundary explicit: YES

---

**NEXT STEP: PHASE 4 P5 IMPLEMENTATION**
