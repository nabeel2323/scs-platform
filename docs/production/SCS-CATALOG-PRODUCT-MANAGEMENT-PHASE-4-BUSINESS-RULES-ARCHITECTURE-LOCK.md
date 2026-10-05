# SCS Catalog Product Management — Phase 4 Business Rules + Architecture Decision Lock

## 1. Executive Summary

This document locks all business rules and architecture decisions for Phase 4 (Product Studio / Admin Product Management UX) of the SCS Catalog Product Management milestone (M7.3-C).

Phase 4 delivers production-grade product management experiences for both the Admin Console and the Merchant Web App, building on the stable Phase 3 baseline (typed attribute authority, migration 0053, 432/432 regression green).

**Phase 4 Business Rules + Architecture Decision Lock: LOCKED / GO**

| Field | Value |
|-------|-------|
| Phase | Phase 4 |
| Name | Product Studio / Admin Product Management UX |
| Milestone | M7.3-C — Catalog Import + Product / Variant Management |
| Branch | `develop` |
| HEAD | `0549e1f` |
| Lock date | October 5, 2026 |
| Lock status | **LOCKED / GO** |
| Audit reference | `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-4-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md` |

## 2. Phase 3 Baseline

Phase 3 is **CLOSED / PASS** and constitutes the immutable baseline for Phase 4.

| Aspect | Value |
|--------|-------|
| Latest migration | `0053_attribute_backfill.sql` |
| Migration 0054 | Does NOT exist |
| Typed attribute tables | Authoritative (`product_attribute_values`, `variant_attribute_values`) |
| JSONB attributes | Deprecated — columns physically present, never read or written by authoritative code |
| Typed attribute endpoints | `PUT /v1/products/:id/attribute-values`, `PUT /v1/products/:productId/variants/:variantId/attribute-values` |
| Variant matrix | Reads from typed tables via `getVariantMatrix()` |
| Concurrency protection | `SELECT ... FOR UPDATE` in `setProductAttributeValues()` and `setVariantAttributeValues()` |
| Import compatibility | Phase 2 import writes to typed tables, unaffected |
| Regression | 432/432 PASS |
| Runtime verification | 38/38 PASS, 19/19 gates |

**Phase 4 must not regress any Phase 3 decision.**

## 3. Business Decisions

### BD-01 — Canonical Product Creation

**LOCKED:** Both merchants and authorized platform administrators may create canonical products.

| Surface | Route | Permission | Initial Status |
|---------|-------|------------|----------------|
| Merchant Product Studio | `/merchant/product-studio/new` | `merchant:products:write` | DRAFT |
| Admin Product Management | `/products/new` | `catalog:products:write` (existing) | DRAFT |

- Merchant creation is subject to normal validation rules.
- Admin creation creates DRAFT unless the business workflow explicitly permits direct activation.
- Both surfaces create canonical product rows in the `products` table.

### BD-02 — Canonical Product Editing

**LOCKED:** Both authorized merchants and authorized administrators may edit canonical products.

| Actor | Scope | Restrictions |
|-------|-------|--------------|
| Merchant | Products they are authorized to manage | Cannot modify another merchant's protected data; cannot modify platform taxonomy definitions; cannot modify merchant offers through canonical product fields |
| Admin/Moderator | Any canonical product | May correct merchant-created products; may moderate lifecycle; subject to role permissions |

- All updates must respect optimistic locking (BD-08).
- `assertProductInOrg()` enforces tenant isolation for merchant writes.

### BD-03 — Publishing Authority

**LOCKED:** A merchant may publish (set ACTIVE) when all publish-readiness rules pass.

| Actor | Lifecycle Operations |
|-------|---------------------|
| Merchant | DRAFT → ACTIVE (when validation passes) |
| Admin/Moderator | Approve, Reject, Archive, Restore/rework per existing lifecycle rules |

- Existing `validatePublish()` checks required attributes before DRAFT → ACTIVE.
- No new `PENDING_REVIEW` status is introduced.

### BD-04 — Product Lifecycle

**LOCKED:**

```
DRAFT → ACTIVE              (merchant publish, admin approve)
DRAFT → REJECTED            (admin reject)
ACTIVE → ARCHIVED           (admin archive, merchant bulk archive)
ACTIVE → REJECTED           (admin reject where existing moderation rules permit)
REJECTED → DRAFT            (merchant correction)
ARCHIVED → DRAFT/ACTIVE     (only through explicitly authorized administrative action)
```

- Publish must continue to validate required attributes via `validatePublish()`.
- No additional lifecycle states are introduced in Phase 4.

### BD-05 — Identifier Editing

**LOCKED:** GTIN, EAN, and MPN are editable after creation.

Requirements:
- Server-side validation of format (length constraints already defined in schema: gtin varchar(20), ean varchar(20), mpn varchar(100))
- Uniqueness rules respected where already defined (canonical dedup via `findProductByIdentifiers()`)
- Changes recorded in audit trail (BD-12)
- Optimistic locking applies (BD-08)
- GTIN deduplication UI is NOT introduced in Phase 4

Implementation: Add `gtin`, `ean`, `mpn` to `UpdateProductInput` (currently omitted per audit FINDING-01).

### BD-06 — Product Type Editing

**LOCKED:** Product type is NOT freely editable after variants or merchant offers exist.

| Condition | Allowed? |
|-----------|----------|
| No variants AND no merchant offers | Yes — subject to compatibility validation |
| Has variants OR has merchant offers | No — change must be rejected |

- Backend is authoritative — UI must not merely hide the field.
- The UI must clearly explain why a type change is unavailable.
- Reason: changing product type changes attribute schema and variant dimensions.

Implementation: Add `productTypeId` to `UpdateProductInput` with a guard that checks `productVariants` count and `merchantOffers` count before allowing the change.

### BD-07 — Variant Deletion

**LOCKED:** Variant deletion must be non-destructive.

| Operation | Behavior |
|-----------|----------|
| Archive/deactivate | Set `is_active = false` — preserves historical references |
| Hard delete | Only when variant has no references to offers, inventory, orders, or history |

- Do not silently hard-delete production variants.
- If the existing backend only supports destructive deletion (via `bulkVariantOperations.deleteIds`), Phase 4 must add a safe lifecycle operation (deactivate) before exposing destructive deletion in the UI.
- The `is_active` boolean column already exists on `product_variants`.

### BD-08 — Optimistic Locking

**LOCKED:** Use existing `updatedAt` timestamp comparison.

| Aspect | Detail |
|--------|--------|
| Strategy | Client sends `updatedAt` timestamp it loaded; server performs conditional update |
| Conflict response | HTTP 409 CONFLICT with message: "This product was changed by another user. Reload before saving." |
| Apply to | Product updates (`updateProduct`), Variant updates (`updateVariant`) |
| NOT applied to | Attribute replacement (already has PostgreSQL FOR UPDATE protection) |
| No version column | Do NOT introduce a `version` column unless `updatedAt` proves insufficient |

Implementation: `updateProduct()` already sets `updatedAt: new Date()`. Add `WHERE updated_at = clientUpdatedAt` condition. Return 409 if no rows updated.

### BD-09 — Admin Product Management

**LOCKED:** Admin Product Management is FULL canonical-product CRUD + governance.

Admin may:
- Create canonical products
- View product details
- Edit canonical product fields (title, description, category, brand, product type, identifiers, condition, slug)
- Moderate lifecycle (approve, reject, archive)
- Restore where permitted
- Manage variants (create, edit, deactivate, archive)
- Manage canonical attributes (via typed attribute endpoints)
- Manage canonical media (add, remove, reorder)
- Correct identifiers (GTIN, EAN, MPN)
- Manage category/brand/product-type assignment

Admin does NOT manage merchant offer economics through Product Studio. Merchant offers remain separate.

### BD-10 — Merchant Product Studio Architecture

**LOCKED:** Extend the existing Product Studio with edit mode.

| Route | Purpose |
|-------|---------|
| `/merchant/product-studio/new` | Create new product (existing wizard) |
| `/merchant/product-studio/:id` | Edit existing product (new edit mode) |

- Reuse the existing `useProductStudio` architecture where practical.
- Do not create a completely separate duplicate product editor.
- Existing six-step workflow remains conceptually: Identity → Specifications → Variants → Offer → Media → Review.
- Edit mode loads the existing product and allows authorized changes.
- Offer management remains clearly separated — do not move offer business logic into canonical product APIs.

### BD-11 — Required Attribute Enforcement

**LOCKED:**

| Context | Behavior |
|---------|----------|
| During editing | Required fields/attributes display clearly; missing required values produce warnings/errors; user may save DRAFT with incomplete required attributes |
| During publish | Required attributes MUST be satisfied; server-side `validatePublish()` remains authoritative |

- This preserves the existing lifecycle while improving UX.
- The frontend shows validation state but does not block DRAFT saves.

### BD-12 — Product/Variant Audit Trail

**LOCKED:** Implement field-level auditability for Phase 4 product and variant changes.

| Captured Data | Detail |
|---------------|--------|
| Actor | User ID |
| Organization | Organization ID |
| Entity | `product` or `variant` |
| Entity ID | UUID |
| Action | `created`, `updated`, `archived`, `restored`, `published`, `rejected` |
| Timestamp | ISO 8601 |
| Changed fields | Field name → { old, new } |

- Use existing audit infrastructure (`this.audit.record()`) and outbox patterns.
- `updateProduct()` already records `product.published` events — extend to all update actions.
- Do not create an unnecessary parallel audit architecture.

## 4. Canonical Product vs Merchant Offer Boundary

**NON-NEGOTIABLE.**

### Canonical Product = WHAT

| Field | Table |
|-------|-------|
| title, titleAr | `products` |
| description, descriptionAr | `products` |
| category | `products.category_id` |
| brand | `products.brand_id` |
| product type | `products.product_type_id` |
| identifiers (gtin, ean, mpn) | `products` |
| product attributes | `product_attribute_values` |
| variants | `product_variants` |
| variant attributes | `variant_attribute_values` |
| canonical media | `product_media` |
| lifecycle (status) | `products.status` |

### Merchant Offer = HOW

| Field | Table |
|-------|-------|
| price | `merchant_offers.base_price_minor` |
| stock | via `warehouse_id` → `inventory_items` |
| warehouse | `merchant_offers.warehouse_id` |
| MOQ | `merchant_offers.moq` |
| lead time | `merchant_offers.lead_time_days` |
| currency | `merchant_offers.currency` |
| availability | `merchant_offers.is_available` |

**Phase 4 Product Studio MUST NOT absorb merchant-offer responsibilities.**

## 5. Role and Permission Rules

### Existing permissions reused

| Permission | Used By | Scope |
|------------|--------|-------|
| `merchant:products:write` | MERCHANT_OWNER, MERCHANT_STAFF, MODERATOR | Merchant product CRUD |
| `catalog:products:read` | All roles including BUYER | Read product data |
| `catalog:products:write` | ADMIN, MODERATOR, MERCHANT_OWNER, MERCHANT_STAFF | Write product data |
| `catalog:products:delete` | ADMIN, MODERATOR, MERCHANT_OWNER, MERCHANT_STAFF | Delete products |
| `catalog:categories:write` | ADMIN, MODERATOR | Category management |
| `catalog:brands:manage` | ADMIN, MODERATOR | Brand management |
| `catalog:attributes:manage` | ADMIN, MODERATOR | Attribute definition management |
| `catalog:product-types:manage` | ADMIN, MODERATOR | Product type management |
| `admin:merchants:read` | ADMIN, MODERATOR | Admin product list view |

### Permission rules

- Do not broaden permissions implicitly.
- Existing permissions are reused wherever possible.
- No new permission keys are introduced unless repository evidence requires it.
- Admin product create/edit uses existing `catalog:products:write`.
- Merchant product create/edit uses existing `merchant:products:write`.

### App-to-role partition (preserved)

| Surface | Roles |
|---------|-------|
| Admin Console | SUPER_ADMIN, ADMIN, MODERATOR |
| Web App (Merchant) | MERCHANT_OWNER, MERCHANT_STAFF |
| Web App (Buyer) | BUYER |

## 6. Product Lifecycle

### State machine

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
    │            │            │
    │            │            │
    ▼            ▼            ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│ ARCHIVED │ │  DRAFT   │ │  DRAFT   │
└──────────┘ │ (correct) │ │(admin re)│
             └──────────┘ └──────────┘
```

### Transition rules

| From | To | Who | Condition |
|------|----|-----|-----------|
| — | DRAFT | Merchant, Admin | On creation |
| DRAFT | ACTIVE | Merchant | `validatePublish()` passes |
| DRAFT | ACTIVE | Admin | Admin approve |
| DRAFT | REJECTED | Admin | Admin reject |
| ACTIVE | ARCHIVED | Admin, Merchant | Archive action |
| ACTIVE | REJECTED | Admin | Admin reject |
| REJECTED | DRAFT | Merchant | Correction |
| ARCHIVED | DRAFT | Admin | Admin restore |
| ARCHIVED | ACTIVE | Admin | Admin restore + publish |

## 7. Product Type Rules

| Condition | Type Changeable? |
|-----------|-----------------|
| Product has 0 variants AND 0 merchant offers | YES — with compatibility validation |
| Product has ≥1 variant OR ≥1 merchant offer | NO — backend rejects, UI explains why |

- Backend is authoritative.
- UI must display a clear explanation, not merely hide the field.
- Compatibility validation: the new product type's attribute schema must be loadable.

## 8. Identifier Rules

| Identifier | Editable? | Validation |
|------------|-----------|------------|
| GTIN | Yes | varchar(20), format check |
| EAN | Yes | varchar(20), format check |
| MPN | Yes | varchar(100), format check |

- Changes recorded in audit trail.
- Optimistic locking applies.
- Existing canonical dedup (`findProductByIdentifiers()`) continues to operate.
- GTIN deduplication UI is NOT introduced in Phase 4.

## 9. Variant Lifecycle

| Operation | Method | Effect |
|-----------|--------|--------|
| Create | `POST /v1/products/:productId/variants` | New variant, `is_active = true` |
| Edit | `PATCH /v1/products/:productId/variants/:variantId` | Update fields |
| Deactivate | Via update: `{ isActive: false }` | `is_active = false`, preserved |
| Reactivate | Via update: `{ isActive: true }` | `is_active = true` |
| Hard delete | Only when no references | `DELETE` — last resort |

- The `is_active` boolean column already exists on `product_variants`.
- Phase 4 adds a "deactivate" UI action before exposing "delete".
- Variant attributes use typed `variant_attribute_values` (Phase 3 authority).
- Combination key is recomputed on attribute change.

## 10. Attribute Rules

| Rule | Detail |
|------|--------|
| Storage authority | `product_attribute_values` and `variant_attribute_values` — never JSONB |
| Write endpoints | `PUT /v1/products/:id/attribute-values`, `PUT .../variants/:variantId/attribute-values` |
| Concurrency | `SELECT ... FOR UPDATE` + DELETE/INSERT in transaction (Phase 3) |
| Product attributes | Rendered from product type schema, grouped by `attribute_groups` |
| Variant attributes | Rendered from variant-scope attributes in product type schema |
| Conditional rules | Evaluated client-side (frontend) and server-side (backend validation) |
| Required enforcement | Warnings during edit; blocking during publish |
| JSONB | Never written; columns retained for backward compat only |

## 11. Optimistic Locking Rules

| Aspect | Rule |
|--------|------|
| Mechanism | `updatedAt` timestamp comparison |
| Client sends | `updatedAt` value from the loaded product/variant |
| Server checks | `WHERE id = ? AND updated_at = clientUpdatedAt` |
| On match | Apply update, set new `updatedAt`, return updated record |
| On mismatch | Return HTTP 409 CONFLICT |
| 409 response body | `{ statusCode: 409, message: 'CONFLICT', currentUpdatedAt: '...' }` |
| UX behavior | Show conflict banner with Reload and Cancel options |
| Scope | `updateProduct()`, `updateVariant()` |
| NOT applied to | Attribute replacement (FOR UPDATE), bulk operations |

## 12. Admin UX Architecture

### Product list (`/products`)

Enhanced with:
- Server-side pagination (existing)
- Search (text search on title/slug)
- Status filter (DRAFT/ACTIVE/REJECTED/ARCHIVED)
- Category filter (tree selector)
- Product type filter (dropdown)
- Sorting (title, status, createdAt, updatedAt)
- Create product action (button → `/products/new`)
- Edit product action (row action → `/products/:id/edit`)
- Moderation actions (approve/reject/archive)
- Permission checks (`admin:merchants:read` for view, `catalog:products:write` for edit)

### Product editor (`/products/:id/edit`)

Dedicated page with tab/section architecture:

1. **Identity** — title, titleAr, slug, description, descriptionAr, condition, identifiers (GTIN/EAN/MPN)
2. **Classification** — category, brand, product type (with change rules)
3. **Attributes** — typed attribute editor from product type schema
4. **Variants** — variant matrix/list with create/edit/deactivate
5. **Media** — media management (add, remove, reorder)
6. **Review / Publish** — completeness check, publish action, audit history

### Product detail (`/products/:id`)

Existing `ProductDetails` component remains the read/view page. Not turned into an editor.

## 13. Merchant UX Architecture

### Product Studio routes

| Route | Purpose |
|-------|---------|
| `/merchant/product-studio/new` | Create new product (existing wizard) |
| `/merchant/product-studio/:id` | Edit existing product (extended wizard) |

### Edit mode behavior

- Loads existing product data into `StudioState`
- Same six-step workflow: Identity → Specifications → Variants → Offer → Media → Review
- All fields are editable subject to validation rules
- Product type change subject to BD-06 rules
- Offer step manages the merchant's own offer (not canonical product data)
- Save updates the product via `PATCH /v1/products/:id`

### Merchant catalog list (`/merchant/catalog`)

Enhanced with:
- Clear "Edit" action on each product row → `/merchant/product-studio/:id`
- Existing search, category/status filters, bulk operations, export preserved

## 14. Product List Architecture

### Admin product list

| Feature | Implementation |
|---------|---------------|
| Pagination | Server-side (existing `useAdminTable`) |
| Search | Server-side text search on title/slug |
| Status filter | Dropdown (DRAFT/ACTIVE/REJECTED/ARCHIVED) |
| Category filter | Tree selector or dropdown |
| Product type filter | Dropdown |
| Sorting | Column headers (title, status, createdAt) |
| Create action | Button → `/products/new` |
| Edit action | Row click or button → `/products/:id/edit` |
| Moderation | Approve/Reject/Archive buttons |
| Permissions | `admin:merchants:read` for view; `catalog:products:write` for CRUD |

### Merchant product list

| Feature | Implementation |
|---------|---------------|
| Pagination | Infinite scroll (existing) |
| Search | Debounced text (existing) |
| Status filter | Dropdown (existing) |
| Category filter | Dropdown (existing) |
| Bulk operations | Select + action (existing) |
| Export | CSV button (existing) |
| Edit action | **NEW** — link to `/merchant/product-studio/:id` |

## 15. Audit Trail

### Required audit events

| Entity | Events |
|--------|--------|
| Product | `product.created`, `product.updated`, `product.published`, `product.rejected`, `product.archived`, `product.restored` |
| Variant | `variant.created`, `variant.updated`, `variant.deactivated`, `variant.reactivated` |
| Attribute | Old/new values recorded where practical via product/variant update metadata |

### Audit record structure

| Field | Source |
|-------|--------|
| actor | `user.sub` |
| actorType | `MERCHANT` or `ADMIN` |
| organization | `user.activeOrg` |
| action | Event name |
| resource | `product` or `variant` |
| resourceId | Entity UUID |
| metadata | `{ changedFields: { field: { old, new } } }` |

- Use existing `this.audit.record()` infrastructure.
- `updateProduct()` already records `product.published` — extend to all update actions.

## 16. Accessibility / Unsaved Changes

### Unsaved changes protection

| Behavior | Implementation |
|----------|---------------|
| Dirty state detection | Compare current form state to loaded state |
| Navigation warning | `beforeunload` event + route guard |
| User options | Stay (continue editing) / Discard (navigate away) |
| Data protection | Never silently lose entered product data |

### Accessibility baseline

| Requirement | Status |
|-------------|--------|
| Form labels | All inputs must have associated `<label>` |
| Keyboard navigation | Tab order through form fields; Enter to submit |
| Validation messages | Associated with inputs via `aria-describedby` where practical |
| Action names | Clear, descriptive (e.g., "Save Product", "Deactivate Variant") |
| Focus behavior | Focus on first error after failed save |
| Full WCAG audit | Deferred |

## 17. Localization Scope

| Aspect | Phase 4 Decision |
|--------|-----------------|
| Formal i18n framework | NOT introduced |
| Bilingual data fields | Continue supporting (title/titleAr, description/descriptionAr, name/nameAr) |
| RTL rendering | Continue `dir="rtl"` on Arabic fields |
| UI language switching | Deferred |
| Validation message localization | English only for Phase 4 |

## 18. Phase 4 Scope

### MUST HAVE

| # | Item | BD Reference |
|---|------|-------------|
| 1 | Admin product create | BD-01, BD-09 |
| 2 | Admin product edit | BD-02, BD-09 |
| 3 | Merchant product edit | BD-02, BD-10 |
| 4 | Product identifiers editable (GTIN/EAN/MPN) | BD-05 |
| 5 | Safe product-type change rules | BD-06 |
| 6 | Optimistic locking (`updatedAt` comparison) | BD-08 |
| 7 | Admin product list search/filter improvements | BD-09 |
| 8 | Admin variant management | BD-07, BD-09 |
| 9 | Merchant variant editing | BD-07, BD-10 |
| 10 | Typed product/variant attribute editing | Phase 3 baseline |
| 11 | Publish validation UX | BD-03, BD-11 |
| 12 | Unsaved changes protection | Section 16 |
| 13 | Permission/tenant enforcement | Section 5 |
| 14 | Basic audit trail | BD-12 |

### SHOULD HAVE

| # | Item |
|---|------|
| 15 | Import center link from product list |
| 16 | Keyboard shortcuts in editor |
| 17 | Enhanced accessibility attributes |
| 18 | Variant attribute dedicated editor |

### DEFERRED

| # | Item |
|---|------|
| 19 | Formal i18n framework |
| 20 | UI language switching |
| 21 | Mobile product management |
| 22 | GTIN deduplication UI |
| 23 | Broad performance optimization |
| 24 | Bulk attribute editing |
| 25 | Admin product comparison |

## 19. Non-Goals

Explicitly excluded from Phase 4:

- Merchant offer redesign
- Inventory redesign
- Checkout changes
- Payment changes
- Shipping changes
- Returns/refunds changes
- Mobile Product Studio
- Formal localization framework
- JSONB attribute column removal
- Migration 0054 solely for removing JSONB
- Unrelated catalog performance overhaul

## 20. Implementation Sequence

| Stage | Deliverable | Dependencies |
|-------|-------------|--------------|
| P0 | Baseline verification + contract verification | Phase 3 closed |
| P1 | Optimistic locking API/backend (updatedAt comparison on updateProduct/updateVariant) | None |
| P2 | UpdateProductInput expansion (gtin, ean, mpn, productTypeId) + product type change rules (BD-06) | P1 |
| P3 | Admin product create/edit page (`/products/:id/edit`) | P1, P2 |
| P4 | Admin attributes editor (typed attribute section in product editor) | P3 |
| P5 | Admin variant management (variants tab in product editor) | P3 |
| P6 | Merchant Product Studio edit mode (`/merchant/product-studio/:id`) | P1, P2 |
| P7 | Merchant variant editing (extend Studio variant step) | P6 |
| P8 | Admin product list enhancement (search, category/type filters, create/edit actions) | P3 |
| P9 | Audit trail (extend audit.record to all product/variant CRUD) | P1 |
| P10 | Unsaved changes + accessibility hardening | P3, P6 |
| P11 | Full regression (all existing + new tests) | P0–P10 |
| P12 | Independent runtime/UI verification | P11 |
| P13 | Release closure | P12 |

## 21. Test Strategy

### Backend

| Test type | Coverage |
|-----------|----------|
| Unit | Product CRUD, variant CRUD, optimistic locking, product type change rules, identifier validation |
| PostgreSQL integration | Optimistic locking concurrency, typed attribute writes, variant deactivation, product type change with/without variants/offers |
| RBAC | Each role can/cannot perform each operation |
| Tenant isolation | Cross-org product access rejection |
| Concurrency | Two concurrent product edits → 409; FOR UPDATE attribute serialization preserved |

### Frontend

| Test type | Coverage |
|-----------|----------|
| Component | Product form rendering, attribute editor, variant matrix, conflict banner |
| Form validation | Required fields, identifier format, type validation |
| Route guards | Permission checks on editor pages |
| API error handling | 409 Conflict, 403 Forbidden, 404 Not Found |
| State transitions | DRAFT → ACTIVE publish flow, moderation actions |
| Unsaved changes | Navigation warning on dirty form |

### E2E Workflows

| # | Workflow |
|---|----------|
| 1 | Merchant creates product via Product Studio |
| 2 | Merchant edits product via Product Studio |
| 3 | Admin creates product via Admin Console |
| 4 | Admin edits product via Admin Console |
| 5 | Admin moderates product (approve/reject/archive) |
| 6 | Admin edits variants |
| 7 | Merchant edits variants |
| 8 | Concurrent editors produce 409 |
| 9 | Unauthorized merchant receives rejection |
| 10 | Required attributes block publish |
| 11 | Product type cannot change when variants/offers exist |
| 12 | Variant cannot be destructively deleted when referenced |

Real PostgreSQL required for backend concurrency/data-integrity tests.

## 22. Acceptance Criteria

| ID | Criteria | Status |
|----|----------|--------|
| AC-01 | Admin can create canonical product through Admin Console | LOCKED |
| AC-02 | Admin can edit canonical product through Admin Console | LOCKED |
| AC-03 | Merchant can edit authorized product through Product Studio | LOCKED |
| AC-04 | Identifiers (GTIN/EAN/MPN) can be corrected safely with optimistic locking | LOCKED |
| AC-05 | Product type change rules enforced (blocked when variants/offers exist) | LOCKED |
| AC-06 | Typed product attributes remain authoritative (no JSONB writes) | LOCKED |
| AC-07 | Typed variant attributes remain authoritative (no JSONB writes) | LOCKED |
| AC-08 | Admin can manage variants (create/edit/deactivate) | LOCKED |
| AC-09 | Merchant can edit variants through Product Studio | LOCKED |
| AC-10 | Optimistic locking prevents silent overwrite (409 on conflict) | LOCKED |
| AC-11 | Publish validation remains authoritative (server-side) | LOCKED |
| AC-12 | Admin product list supports search, category filter, product type filter | LOCKED |
| AC-13 | Tenant/RBAC boundaries enforced on all write operations | LOCKED |
| AC-14 | Variant deletion is safe/non-destructive (deactivate preferred) | LOCKED |
| AC-15 | Unsaved changes protected (warning on navigation) | LOCKED |
| AC-16 | Audit trail records required product/variant changes | LOCKED |
| AC-17 | Phase 3 regression remains green (432/432 baseline) | LOCKED |
| AC-18 | TypeScript/build remain green | LOCKED |

## 23. Governance Gates

| Gate | Description | Status |
|------|-------------|--------|
| Audit | Pre-implementation architecture audit | COMPLETE (GO WITH CONDITIONS) |
| Business Rules + Architecture Lock | This document | **LOCKED / GO** |
| P0–P10 Implementation | Per sequence in Section 20 | NOT STARTED |
| P11 Regression | Full test suite | NOT STARTED |
| P12 Independent Verification | Runtime + UI verification | NOT STARTED |
| P13 Release Closure | Final release document | NOT STARTED |

## 24. Final Decision

**PHASE 4 BUSINESS RULES + ARCHITECTURE DECISION LOCK: LOCKED / GO**

All 12 business decisions (BD-01 through BD-12) are documented and internally consistent.
All architecture decisions (admin editor, merchant editor, attribute editor, variant editor, optimistic locking, product list) are locked.
Phase 3 baseline is preserved.
Canonical product vs merchant offer boundary is non-negotiable.
Scope (14 MUST HAVE, 4 SHOULD HAVE, 7 DEFERRED) is agreed.
Implementation sequence (P0–P13) is locked.
Test strategy is defined.
Acceptance criteria (AC-01 through AC-18) are locked.

**Phase 4 implementation is NOT started.**

**NEXT STEP: Phase 4 implementation P0 — Baseline + contract verification.**
