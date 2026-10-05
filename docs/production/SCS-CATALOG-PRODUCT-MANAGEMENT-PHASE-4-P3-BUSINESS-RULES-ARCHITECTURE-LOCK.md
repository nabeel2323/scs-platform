# SCS Catalog Product Management — Phase 4 P3 Business Rules + Architecture Lock

## 1. Executive Summary

This document locks all business rules and architecture decisions for Phase 4 P3 (Admin Product Create/Edit Page) of the SCS Catalog Product Management milestone (M7.3-C).

P3 delivers production-grade admin product management: the ability for authorized administrators to create and edit canonical products through the Admin Console, with full optimistic locking, typed attribute editing, media management, and conflict resolution.

**Phase 4 P3 Business Rules + Architecture Decision Lock: LOCKED / GO**

| Field | Value |
|-------|-------|
| Phase | Phase 4 P3 |
| Name | Admin Product Create/Edit Page |
| Milestone | M7.3-C — Catalog Import + Product / Variant Management |
| Branch | `develop` |
| HEAD | `40be750` |
| Lock date | October 5, 2026 |
| Lock status | **LOCKED / GO** |
| Audit reference | `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-4-P3-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md` |
| Conditions | 0 blockers, 0 unresolved decisions |

---

## 2. Current Baseline

| Aspect | Value |
|--------|-------|
| Branch | `develop` |
| HEAD | `40be750` |
| Latest migration | `0053_attribute_backfill.sql` |
| Migration 0054 | Does NOT exist |
| Phase 3 | CLOSED / PASS |
| P1 (Optimistic Locking) | CLOSED / PASS |
| P2 (Identifiers + Type Rules) | CLOSED / PASS |
| P3 Audit | GO WITH CONDITIONS |

### What P1 delivered
- Optimistic locking via `updatedAt` comparison on `updateProduct()` and `updateVariant()`
- HTTP 409 CONFLICT with `currentUpdatedAt` in response body
- Backward compatible: omitting `updatedAt` preserves legacy behavior
- 12 unit + 13 PostgreSQL tests (including 10/50-writer concurrency)

### What P2 delivered
- `UpdateProductInput` expanded with `productTypeId`, `gtin`, `ean`, `mpn`
- Identifier normalization (trim, empty → null, preserve spaces/dashes/case)
- GTIN/EAN uniqueness enforcement on update (excluding self, HTTP 400)
- Product type change guard: `SELECT ... FOR UPDATE` + variant count = 0 AND offer count = 0
- `createVariant()` and `bulkVariantOperations()` protected with `SELECT ... FOR SHARE`
- Web API type alignment in `buyer-api.ts`
- 28 unit + 27 PostgreSQL tests

### What P3 must NOT regress
- All P1 optimistic locking behavior
- All P2 identifier/type rules
- Phase 3 typed attribute authority
- All existing catalog, import, and governance tests

---

## 3. P3 Scope

### IN SCOPE

P3 delivers the **Admin Product Create/Edit Page** — canonical product management for administrators.

| Deliverable | Route | Description |
|-------------|-------|-------------|
| Admin product create | `/products/new` | Create DRAFT canonical product |
| Admin product edit | `/products/[id]/edit` | Edit existing canonical product |
| Shared ProductForm | — | Reusable form component for create/edit |
| Identity section | — | Title, description, identifiers, condition, slug |
| Classification section | — | Category, brand, product type |
| Attributes section | — | Typed product attributes from product type schema |
| Variants section (read-only) | — | Display variants without management |
| Media section | — | Add, remove, reorder media |
| Review / Publish section | — | Completeness check, publish action |
| Optimistic locking conflict UX | — | 409 banner with Reload/Discard |
| Unsaved changes protection | — | beforeunload + navigation guard |
| Moderation optimistic locking | — | Extend moderation to use `updatedAt` |

### NON-NEGOTIABLE BOUNDARY

**Canonical product (WHAT) vs Merchant offer (HOW) boundary is preserved.**

P3 admin editor MUST NOT:
- Create or manage merchant offers
- Set pricing, stock, MOQ, lead time, or warehouse
- Absorb offer-owned fields into canonical product forms

---

## 4. Business Rules

### BD-01 — Canonical Product Creation (CARRIED FORWARD)

Both merchants and authorized platform administrators may create canonical products.

| Surface | Route | Permission | Initial Status |
|---------|-------|------------|----------------|
| Merchant Product Studio | `/merchant/product-studio/new` | `merchant:products:write` | DRAFT |
| Admin Product Management | `/products/new` | `catalog:products:write` | DRAFT |

### BD-02 — Canonical Product Editing (CARRIED FORWARD)

Both authorized merchants and authorized administrators may edit canonical products.

| Actor | Scope | Restrictions |
|-------|-------|--------------|
| Merchant | Products they are authorized to manage | Cannot modify another merchant's data; assertProductInOrg applies |
| Admin/Moderator | Any canonical product | Cross-org by design; no assertProductInOrg |

### BD-03 — Publishing Authority (CARRIED FORWARD)

| Actor | Lifecycle Operations |
|-------|---------------------|
| Merchant | DRAFT → ACTIVE (when validation passes) |
| Admin/Moderator | Approve, Reject, Archive, Restore per existing lifecycle rules |

### BD-04 — Product Lifecycle (CARRIED FORWARD)

```
DRAFT → ACTIVE              (merchant publish, admin approve)
DRAFT → REJECTED            (admin reject)
ACTIVE → ARCHIVED           (admin archive, merchant bulk archive)
ACTIVE → REJECTED           (admin reject where moderation rules permit)
REJECTED → DRAFT            (merchant correction)
ARCHIVED → DRAFT/ACTIVE     (admin restore)
```

No new lifecycle states are introduced.

### BD-05 — Identifier Editing (CARRIED FORWARD, P2 CLOSED)

GTIN, EAN, and MPN are editable after creation. P2 rules are authoritative:
- GTIN: unique where not null, varchar(20)
- EAN: unique where not null, varchar(20)
- MPN: not unique, varchar(100)
- Normalization: trim + empty → null + preserve internal spaces/dashes/case
- No check-digit validation

### BD-06 — Product Type Editing (CARRIED FORWARD, P2 CLOSED)

Product type change is blocked when variants or merchant offers exist. P2 implementation is authoritative:
- Backend: `SELECT ... FOR UPDATE` + count check in transaction
- Frontend (P3): must display clear explanation when change is blocked

### BD-07 — Variant Deletion (CARRIED FORWARD)

Variant deletion is non-destructive. Deactivation preferred over hard delete. P3 does NOT implement variant management.

### BD-08 — Optimistic Locking (CARRIED FORWARD, P1 CLOSED)

`updatedAt` timestamp comparison. HTTP 409 CONFLICT. P1 implementation is authoritative. P3 admin edit must use the existing P1 contract.

### BD-09 — Admin Product Management (CARRIED FORWARD)

Admin product management is FULL canonical-product CRUD + governance. P3 implements the create/edit editor.

### BD-10 — Merchant Product Studio (NOT P3)

Merchant Product Studio edit mode is separate and NOT P3 scope.

### BD-11 — Required Attribute Enforcement (CARRIED FORWARD)

Warnings during editing. Blocking during publish. Server-side validation remains authoritative.

### BD-12 — Audit Trail (NOT P3)

Audit expansion is P9, not P3.

### BD-13 — Admin Moderation Optimistic Locking (NEW — Q-1 RESOLVED)

**LOCKED:** Admin moderation MUST use optimistic locking.

| Aspect | Detail |
|--------|--------|
| Mechanism | `updatedAt` comparison (same as P1) |
| Client sends | `updatedAt` value from the loaded product |
| Server checks | Conditional update in `moderateProduct()` |
| On mismatch | Return HTTP 409 CONFLICT (same P1 semantics) |
| Rationale | Prevents admin moderation from silently overwriting concurrent merchant edits |

### BD-14 — Admin Create Initial Status (NEW — Q-2 RESOLVED)

**LOCKED:** Admin-created products always begin as `status = DRAFT`.

The admin create form MUST NOT allow selecting ACTIVE during creation. Publishing occurs afterward through existing lifecycle mechanisms.

---

## 5. Architecture Rules

### AD-01 — Admin Editor Architecture (CARRIED FORWARD)

New `/products/[id]/edit` page with tabbed/sectioned layout. Shared `ProductForm` component used by both create and edit routes.

### AD-02 — State Management (CARRIED FORWARD)

`useState` consistent with existing codebase. No Redux, Zustand, MobX, or new global state architecture.

### AD-03 — Form Validation (CARRIED FORWARD)

Both client-side (UX) and server-side (security). Client validation does NOT replace server validation.

### AD-04 — API Calls (CARRIED FORWARD)

Use existing `adminRequest()` for admin API calls. Consistent with admin codebase patterns.

### AD-05 — Component Reuse (LOCKED)

Shared `ProductForm` component for create and edit. Do not duplicate the complete form unnecessarily.

---

## 6. Admin Create Contract

| Aspect | Rule |
|--------|------|
| Route | `/products/new` |
| Permission | `catalog:products:write` |
| API | `POST /v1/products` (existing) |
| Initial status | DRAFT (always — BD-14) |
| Form sections | Identity, Classification, Attributes, Variants (read-only), Media, Review |

### Create Fields

| Field | Source | Required |
|-------|--------|----------|
| title | products.title | Yes (DB NOT NULL) |
| titleAr | products.title_ar | No |
| description | products.description | No |
| descriptionAr | products.description_ar | No |
| slug | products.slug | Yes (DB NOT NULL) |
| condition | products.condition | No (default NEW) |
| categoryId | products.category_id | No |
| brandId | products.brand_id | No |
| productTypeId | products.product_type_id | No |
| gtin | products.gtin | No |
| ean | products.ean | No |
| mpn | products.mpn | No |

No new product fields are introduced. No merchant offer fields.

---

## 7. Admin Edit Contract

| Aspect | Rule |
|--------|------|
| Route | `/products/[id]/edit` |
| Permission | `catalog:products:write` |
| API | `PATCH /v1/products/:id` (existing) |
| Optimistic locking | P1 contract — `updatedAt` in request body |
| Identifier rules | P2 rules — normalization, uniqueness, type guard |

### Edit Fields (UpdateProductInput — authoritative)

| Field | Editable? | Notes |
|-------|-----------|-------|
| title | Yes | |
| titleAr | Yes | |
| description | Yes | |
| descriptionAr | Yes | |
| status | Yes | Lifecycle rules apply (BD-04) |
| condition | Yes | |
| categoryId | Yes | |
| brandId | Yes | |
| slug | Yes | |
| metadata | Yes | |
| updatedAt | Yes | P1 optimistic locking |
| productTypeId | Yes | P2 guard: blocked when variants/offers exist |
| gtin | Yes | P2 rules: unique, normalized |
| ean | Yes | P2 rules: unique, normalized |
| mpn | Yes | P2 rules: not unique, normalized |

---

## 8. Product Type Rules

| Condition | Type Changeable? |
|-----------|-----------------|
| Product has 0 variants AND 0 merchant offers | YES — with compatibility validation |
| Product has ≥1 variant OR ≥1 merchant offer | NO — backend rejects (400), UI explains why |

P3 UI behavior:
- Display clear explanation when type cannot change
- Do not silently discard the attempted change
- Do not corrupt other unsaved changes
- Backend remains authoritative

---

## 9. Attribute Rules

| Rule | Detail |
|------|--------|
| Storage authority | `product_attribute_values` — never JSONB |
| Write endpoint | `PUT /v1/products/:id/attribute-values` |
| Source | Product type schema (`GET /v1/product-types/:id/schema`) |
| Render | All 14 attribute types: TEXT, LONG_TEXT, INTEGER, DECIMAL, BOOLEAN, DATE, DATETIME, SELECT, MULTI_SELECT, COLOR, URL, FILE, MEASUREMENT, CURRENCY |
| Required | Display required/optional status; warn during edit; block during publish |
| Conditional rules | Evaluated server-side (backend validation) |
| Grouping | By `attribute_groups` |
| Concurrency | `SELECT ... FOR UPDATE` + DELETE/INSERT in transaction (Phase 3) |

JSONB attributes are NEVER written as authoritative storage.

---

## 10. Variant Rules

P3 admin editor displays variants READ-ONLY.

| Display Field | Source |
|---------------|--------|
| SKU | product_variants.sku |
| Title | product_variants.title |
| Active status | product_variants.is_active |
| Combination | variant_attribute_values |

P3 MUST NOT provide:
- Create variant
- Edit variant
- Deactivate/reactivate variant
- Delete variant
- Bulk variant operations

Those remain P5 scope.

---

## 11. Media Rules

P3 admin editor supports existing media management:

| Operation | API |
|-----------|-----|
| Add media | `POST /v1/products/:productId/media` |
| List media | `GET /v1/products/:productId/media` |
| Remove media | `DELETE /v1/products/:productId/media/:mediaId` |
| Reorder | `POST /v1/products/:productId/media/reorder` |
| Presign URL | `POST /v1/media/presign` |

No media architecture redesign. No new media table.

---

## 12. Lifecycle / Publish Rules

| Context | Behavior |
|---------|----------|
| During editing | Required fields show warnings; missing values permitted in DRAFT |
| During publish | Required attributes MUST be satisfied; `validatePublish()` remains authoritative |
| Admin create | Always DRAFT (BD-14) |
| Admin edit | Can change status per lifecycle rules (BD-04) |

Review/Publish section must show:
- Missing required attributes
- Invalid fields
- Identifier conflicts
- Product type restrictions

Client validation is for UX only. Server validation is authoritative.

---

## 13. Optimistic Locking Rules

### Product/Variant Edit (P1 — authoritative)

| Aspect | Rule |
|--------|------|
| Mechanism | `updatedAt` timestamp comparison |
| Client sends | `updatedAt` value from loaded product |
| Server checks | `WHERE id = ? AND updated_at = clientUpdatedAt` |
| On match | Apply update, set new `updatedAt`, return updated record |
| On mismatch | HTTP 409 CONFLICT `{ statusCode: 409, message: 'CONFLICT', currentUpdatedAt: '...' }` |
| Scope | `updateProduct()`, `updateVariant()` |

### P3 Frontend Conflict UX

When 409 is received:
1. Detect the conflict
2. Stop treating the save as successful
3. Display clear conflict banner
4. Explain that another user changed the product
5. Provide Reload option
6. Provide Discard/Cancel option
7. Do NOT silently overwrite newer data
8. Do NOT implement automatic merge

---

## 14. Moderation Concurrency Rules

### Admin Moderation (NEW — BD-13)

| Aspect | Rule |
|--------|------|
| Mechanism | `updatedAt` comparison (same as P1) |
| Client sends | `updatedAt` value from loaded product |
| Server performs | Conditional update in `moderateProduct()` |
| On mismatch | HTTP 409 CONFLICT (same P1 semantics) |
| No last-write-wins | Stale moderation is rejected |

Implementation may use `updatedAt` in request body or equivalent. Must preserve P1 semantics.

### Concurrency Scenarios

| Scenario | Expected Result |
|----------|----------------|
| Admin edit vs merchant edit | Exactly 1 winner, 1 gets 409 |
| Admin edit vs admin edit | Exactly 1 winner, 1 gets 409 |
| Admin moderation vs merchant edit | Stale moderation gets 409 |
| Product type change vs variant creation | P2 FOR UPDATE vs FOR SHARE serialization |
| Product attribute writes | Phase 3 FOR UPDATE serialization |

---

## 15. Unsaved Changes Rules

| Behavior | Implementation |
|----------|---------------|
| Dirty state detection | Compare current form state to loaded state |
| Navigation warning | `beforeunload` event + route guard |
| User options | Stay (continue editing) / Discard (navigate away) |
| Data protection | Never silently lose entered product data |

---

## 16. Security / RBAC

| Rule | Detail |
|------|--------|
| Admin create permission | `catalog:products:write` |
| Admin edit permission | `catalog:products:write` |
| Admin moderation | Existing `admin:merchants:read` (unchanged) |
| Admin cross-org | By design — admins operate across all organizations |
| assertProductInOrg | NOT applied to admin operations |
| IDOR | No new IDOR risks — admin has legitimate cross-org access |
| Authorization ordering | Maintain authorization-before-sensitive-operation pattern |
| No new permissions | Existing permission keys are sufficient |

---

## 17. API Contract

| Operation | Contract |
|-----------|----------|
| Admin create | `POST /v1/products` — existing `CreateProductInput` |
| Admin edit | `PATCH /v1/products/:id` — existing `UpdateProductInput` (P1+P2) |
| Conflict response | HTTP 409 `{ statusCode: 409, message: 'CONFLICT', currentUpdatedAt: string }` |
| Moderation | Must accept `updatedAt` and return 409 for stale state |
| Attributes | `PUT /v1/products/:id/attribute-values` — existing |
| Media | Existing CRUD endpoints |
| Variants | `GET /v1/products/:productId/variants` — read-only |

---

## 18. Routes

| Route | Purpose | Status |
|-------|---------|--------|
| `/products` | Admin product list | Existing — unchanged |
| `/products/new` | Admin product create | **NEW (P3)** |
| `/products/[id]` | Admin product detail (read-only) | Existing — unchanged |
| `/products/[id]/edit` | Admin product edit | **NEW (P3)** |

Merchant routes are NOT modified by P3.

---

## 19. UI Structure

```
Product Editor (/products/new or /products/[id]/edit)
├── Identity
│   ├── title, titleAr
│   ├── description, descriptionAr
│   ├── slug, condition
│   └── identifiers (GTIN, EAN, MPN)
├── Classification
│   ├── categoryId
│   ├── brandId
│   └── productTypeId (with change rules)
├── Attributes
│   └── Typed attributes from product type schema
├── Variants (read-only)
│   └── SKU, title, active status, combination
├── Media
│   └── Add, remove, reorder
└── Review / Publish
    ├── Completeness check
    └── Publish action
```

---

## 20. Arabic / RTL

| Aspect | Rule |
|--------|------|
| Formal i18n framework | NOT introduced |
| Bilingual data fields | Continue supporting (title/titleAr, description/descriptionAr) |
| RTL rendering | `dir="rtl"` on all Arabic fields |
| UI language switching | Deferred |
| Validation messages | English only for P3 |

---

## 21. Validation

| Layer | Role |
|-------|------|
| Client-side | UX, immediate feedback, required field guidance |
| Server-side | Authoritative — security, business rules, identifier uniqueness, product type restrictions, lifecycle validation, typed attribute validation |

Client validation MUST NOT replace server validation. Do not create a second independent validation system.

---

## 22. Audit Boundary

P3 does NOT expand audit history.

Existing audit infrastructure remains unchanged. P9 remains responsible for:
- `product.updated`, `product.rejected`, `product.archived`, `product.restored`
- `variant.created`, `variant.updated`, `variant.deactivated`
- Other field-level product/variant events

P3 must not duplicate or partially implement P9.

---

## 23. Out-of-Scope

Explicitly locked OUT OF SCOPE for P3:

| Item | Target Phase |
|------|-------------|
| Merchant Product Studio edit mode | P6 |
| Merchant variant editing | P7 |
| Admin variant create/edit/deactivate/delete | P5 |
| Admin product list search/filter redesign | P8 |
| Audit trail expansion | P9 |
| Unsaved changes in Product Studio | P10 |
| Formal i18n framework | Future |
| UI language switching | Future |
| Mobile product management | Future |
| GTIN deduplication UI | Future |
| Broad performance optimization | Future |
| Import/export changes | — |
| Offer management | Never (by design) |
| Merchant offer creation from admin editor | Never (by design) |
| Shipping / payment / refund / return / notification | Outside Phase 4 |

---

## 24. Migration Decision

**NO MIGRATION REQUIRED FOR P3.**

No schema changes. No migration 0054 or later.

All P3 functionality uses existing:
- `products` table (with P2 fields: product_type_id, gtin, ean, mpn)
- `product_variants` table
- `product_types` table
- Typed attribute tables (`product_attribute_values`)
- `product_media` table
- Existing indexes (including partial unique on gtin/ean)
- Existing optimistic-locking fields (`updated_at`)

If implementation discovers a genuine schema requirement, STOP and return to architecture review.

---

## 25. Concurrency Strategy

| Scenario | Strategy | Evidence |
|----------|----------|----------|
| Product edit | Optimistic locking (P1) | `WHERE updated_at = ?` |
| Variant edit | Optimistic locking (P1) | `WHERE updated_at = ?` |
| Product type change | Pessimistic (P2) | `SELECT ... FOR UPDATE` |
| Create variant | Pessimistic (P2) | `SELECT ... FOR SHARE` |
| Attribute replacement | Pessimistic (Phase 3) | `SELECT ... FOR UPDATE` |
| Admin moderation | **Optimistic locking (P3 — BD-13)** | `WHERE updated_at = ?` |

No new locking strategies without explicit architecture change.

---

## 26. Test Strategy

### Unit Tests

| Area | Coverage |
|------|----------|
| ProductForm create | Form rendering, field validation |
| ProductForm edit | Load existing product, save changes |
| Validation | Required fields, identifier format, type validation |
| Conflict handling | 409 response parsing, banner rendering |
| Dirty state | beforeunload, navigation guard |
| Product type guard UX | Explanation display when variants/offers exist |
| Media management | Add, remove, reorder |
| Permission behavior | catalog:products:write enforcement |
| Lifecycle/publish UI | Publish validation display |

### Backend/API Tests

| Area | Coverage |
|------|----------|
| Admin create | Product creation with all fields |
| Admin edit | Product update with optimistic locking |
| Moderation optimistic locking | 409 on stale moderation |
| Product type restrictions | Guard enforcement |
| Identifier uniqueness | GTIN/EAN duplicate rejection |

### PostgreSQL Integration Tests (Testcontainers)

| Area | Coverage |
|------|----------|
| Admin create | Create with P2 fields |
| Admin edit + optimistic locking | 409 on conflict |
| Concurrent admin edits | Exactly 1 winner |
| Admin vs merchant edits | Exactly 1 winner |
| Moderation vs merchant edit | Stale moderation gets 409 |

### Security Tests

| Area | Coverage |
|------|----------|
| Permission allowed | Admin with catalog:products:write succeeds |
| Permission denied | Admin without permission gets 403 |
| Admin cross-org | Admin can access any product |
| IDOR | No unauthorized resource access |
| Authorization ordering | Auth before sensitive operation |

### Regression Tests

| Suite | Expected |
|-------|----------|
| P1 unit | 12/12 PASS |
| P1 PostgreSQL | 13/13 PASS |
| P2 unit | 28/28 PASS |
| P2 PostgreSQL | 27/27 PASS |
| Catalog unit | 188/188 PASS |
| Catalog import | 118/118 PASS |
| Governance roundtrip | 30/30 PASS |
| TypeScript | 0 errors |
| Nest build | PASS |

Do not accept mock-only evidence for concurrency.

---

## 27. Performance

No major performance optimization is part of P3.

Expected editor loading:
- Product detail (cached, 300s TTL)
- Product type schema
- Variant list
- Typed attributes
- Media list

This is acceptable for admin editing context. Variant matrix N+1 optimization remains deferred.

---

## 28. Risks

| ID | Risk | Mitigation |
|----|------|------------|
| R1 | Admin editor form complexity | Reuse existing form patterns; shared ProductForm |
| R2 | Optimistic locking UX unfamiliarity | Follow P1 409 contract exactly |
| R3 | Product type restrictions confuse users | Clear UI explanation from backend error |
| R4 | Admin moderation concurrency | NOW LOCKED as optimistic locking (BD-13) |
| R5 | Typed attribute editor complexity | Reuse StepSpecifications pattern |

---

## 29. Implementation Sequence

| Stage | Deliverable |
|-------|-------------|
| P3.0 | Baseline verification |
| P3.1 | Admin ProductForm shared architecture |
| P3.2 | Admin create route `/products/new` |
| P3.3 | Admin edit route `/products/[id]/edit` |
| P3.4 | Identity / Classification sections |
| P3.5 | Typed Attributes section |
| P3.6 | Read-only Variants section |
| P3.7 | Media section |
| P3.8 | Review / Publish section |
| P3.9 | Unsaved changes protection |
| P3.10 | 409 optimistic-lock conflict UX |
| P3.11 | Admin moderation optimistic locking |
| P3.12 | Permission / security verification |
| P3.13 | Unit/frontend tests |
| P3.14 | PostgreSQL/backend integration tests |
| P3.15 | Concurrency tests |
| P3.16 | Full regression |
| P3.17 | P3 implementation report |
| P3.18 | Independent Runtime Verification |
| P3.19 | Release Closure |

Do NOT combine implementation and independent verification.

---

## 30. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| P3-01 | Admin can create a DRAFT canonical product through Admin Console at `/products/new` |
| P3-02 | Admin can edit an existing canonical product through Admin Console at `/products/[id]/edit` |
| P3-03 | Admin product form includes: title, titleAr, description, descriptionAr, slug, condition, categoryId, brandId, productTypeId, gtin, ean, mpn |
| P3-04 | Admin product form loads and saves typed product attributes using existing typed attribute endpoint |
| P3-05 | Product type change displays clear explanation when variants or offers exist |
| P3-06 | Optimistic locking conflict returns 409 and displays conflict banner with Reload and Discard/Cancel |
| P3-07 | Admin can view product variants read-only in the editor |
| P3-08 | Admin can manage existing product media: add, remove, reorder |
| P3-09 | Admin publish/review action validates required attributes server-side |
| P3-10 | `catalog:products:write` is enforced for admin create/edit |
| P3-11 | Unsaved changes warning is displayed when leaving a dirty editor |
| P3-12 | Arabic fields render with `dir="rtl"` |
| P3-13 | TypeScript compilation has 0 errors |
| P3-14 | Nest build succeeds |
| P3-15 | Existing P1/P2/catalog regression has no regression |
| P3-16 | No migration 0054 or later migration is created for P3 |
| P3-17 | Admin + merchant concurrent edit: exactly one winner, one 409 conflict |
| P3-18 | Two concurrent admin edits: exactly one winner, one 409 conflict |
| P3-19 | Admin moderation uses optimistic locking; stale moderation receives 409 |
| P3-20 | Admin-created products always begin in DRAFT |
| P3-21 | Admin editor does not create or manage merchant offers |
| P3-22 | Admin editor does not manage variants beyond read-only display |

---

## 31. Final Lock Verdict

**P3 BUSINESS RULES + ARCHITECTURE: LOCKED / GO**

| Aspect | Status |
|--------|--------|
| Conditions | 0 blockers |
| Unresolved business decisions | 0 |
| Unresolved architecture decisions | 0 |
| Q-1 (moderation optimistic locking) | RESOLVED — YES |
| Q-2 (admin create initial status) | RESOLVED — always DRAFT |
| Migration required | NO |
| Acceptance criteria | 22 (P3-01 through P3-22) |
| Out-of-scope items | 15 explicitly locked |
| Implementation stages | 20 (P3.0 through P3.19) |

### Document Sequence

| Document | Status |
|----------|--------|
| Phase 4 Pre-Implementation Architecture Audit | COMPLETE (GO WITH CONDITIONS) |
| Phase 4 Business Rules + Architecture Lock | COMPLETE (LOCKED / GO) |
| Phase 4 P0 Baseline Verification | COMPLETE (PASS) |
| Phase 4 P1 Implementation Report | COMPLETE (PASS) |
| Phase 4 P1 Independent Runtime Verification | COMPLETE (PASS) |
| Phase 4 P1 Release Closure | COMPLETE (CLOSED / PASS) |
| Phase 4 P2 Pre-Implementation Architecture Audit | COMPLETE (GO WITH CONDITIONS) |
| Phase 4 P2 Business Rules + Architecture Lock | COMPLETE (LOCKED / GO) |
| Phase 4 P2 Implementation Report | COMPLETE (PASS) |
| Phase 4 P2 Independent Runtime Verification | COMPLETE (PASS) |
| Phase 4 P2 Release Closure | COMPLETE (CLOSED / PASS) |
| Phase 4 P3 Pre-Implementation Architecture Audit | COMPLETE (GO WITH CONDITIONS) |
| Phase 4 P3 Business Rules + Architecture Lock | COMPLETE (LOCKED / GO) |

**NEXT STEP: PHASE 4 P3 IMPLEMENTATION**
