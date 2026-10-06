# SCS Platform — Phase 4 Product Management
## P6 — Merchant Product Studio Edit Mode
## Business Rules + Architecture Lock

| Field | Value |
|-------|-------|
| **Document Type** | Business Rules + Architecture Lock |
| **Phase** | Phase 4 — Product Management |
| **Milestone** | P6 — Merchant Product Studio Edit Mode |
| **Status** | **LOCKED / GO** |
| **Predecessor** | P6 Pre-Implementation Architecture Audit (GO WITH CONDITIONS) |
| **Branch** | develop |
| **P6 Audit HEAD** | 61990f1 |
| **Latest Migration** | 0053_attribute_backfill.sql |
| **Migration 0054** | DOES NOT EXIST |
| **Locked Date** | 2026-10-05 |

---

## 1. Executive Summary

This document is the **authoritative Business Rules + Architecture Lock** for P6 — Merchant Product Studio Edit Mode. It converts the completed P6 Pre-Implementation Architecture Audit into an implementation-ready specification with zero unresolved decisions.

**P6 Objective:** Enable an authorized merchant to edit its own canonical product through `/merchant/product-studio/:id` while preserving canonical-vs-offer separation, tenant isolation, typed attribute authority, optimistic locking, and existing architecture.

**Final Decision:** **LOCKED / GO**

All three blocking business decisions identified in the audit are explicitly resolved:
- **BD-P6-01** — Store-level ownership authorization (LOCKED)
- **BD-P6-09** — Direct mutation, no re-moderation (LOCKED)
- **BD-P6-11** — Direct mutation, no draft/published separation (LOCKED)

P6 is **migration-free**. No new database schema is required. All backend endpoints already exist. P6 is primarily a frontend edit-mode milestone with endpoint reuse.

**34 acceptance criteria** (P6-01 through P6-34) are locked.
**19 implementation phases** (P6.0 through P6.18) are locked.
**Deferred scope** is explicitly bounded.

---

## 2. Baseline

| Item | Status |
|------|--------|
| Branch | develop |
| HEAD | 61990f1 |
| Latest migration | 0053_attribute_backfill.sql |
| Migration 0054 | DOES NOT EXIST |
| P1 — Foundation | CLOSED / PASS |
| P2 — Product Identity | CLOSED / PASS |
| P3 — Typed Attribute Authority | CLOSED / PASS |
| P5 — Merchant Product Studio Create | CLOSED / PASS WITH CONDITIONS |
| P6 Audit | GO WITH CONDITIONS |
| P6 Lock | **LOCKED / GO** |

**P5 conditions inherited:**
1. P6 must fix variant matrix N+1 in `getProduct()` if it blocks edit-mode loading performance.
2. P6 must reconcile `merchant_offers.proposedBy` NULL values.
3. P6 must add `product_attribute_values` / `variant_attribute_values` indexes if edit-mode attribute loading introduces N+1 queries.

None of these conditions are migration-creating. They are optimization deferrals.

**Authoritative documents:**
- P6 Pre-Implementation Architecture Audit (source of truth for technical findings)
- P5 Release Closure
- P5 Business Rules + Architecture Lock
- P3 Release Closure
- P1/P2 architecture documents
- Phase 3 typed-attribute authority documents

---

## 3. P6 Objective

P6 = Merchant Product Studio Edit Mode.

Enable an authorized merchant to edit its own canonical product through:

```
/merchant/product-studio/:id
```

while preserving:

1. Canonical-vs-offer separation
2. Merchant tenant isolation
3. Typed attribute authority
4. Optimistic locking (P1)
5. Existing product/variant architecture
6. Existing create workflow
7. Existing merchant offer isolation

P6 is primarily an **edit-mode / product-studio milestone**.

P6 is **NOT** a general catalog redesign.

---

## 4. Locked Business Decisions

### BD-P6-01 — Merchant Ownership / Edit Authorization

**Decision: STORE-LEVEL OWNERSHIP**

ONLY the merchant/store that owns the product through `products.storeId` may edit the canonical product through Product Studio.

**Rules:**
- `products.storeId` identifies the owning store.
- Merchant must belong to the organization of that store.
- Merchant must be authorized for that store.
- A merchant with an offer on another merchant's product does **NOT** gain canonical product editing rights.
- A merchant may **NOT** edit a shared canonical product with `storeId = NULL`.
- A merchant may **NOT** edit another store's product.
- Admin/moderator privileges remain governed by existing admin rules.

**Explicit record:**
> store ownership ≠ offer ownership

**`assertProductInOrg` is NOT changed by this lock.**

**Rationale:**
- Matches existing Product Studio creation behavior.
- Matches existing ownership architecture.
- Prevents a merchant who merely sells a product from changing canonical data used by other merchants.
- Preserves canonical-vs-offer separation.

---

### BD-P6-09 — Editing Active / Approved Products

**Decision: DIRECT MUTATION — NO RE-MODERATION**

Merchant edits apply directly. No re-moderation is introduced in P6.

**Rules:**
- Merchant may edit its own ACTIVE product.
- Product remains ACTIVE after an ordinary merchant edit.
- Merchant cannot directly modify `status`.
- Merchant cannot approve/reject/archive products.
- Admin moderation remains separate.
- No `PENDING_REVIEW` state is introduced by P6.
- No draft revision is introduced.
- No publication staging is introduced.

**This is an explicit business decision, not an accidental implementation behavior.**

**Rationale:**
- Existing architecture has no draft/published separation.
- Existing `updateProduct()` performs direct mutation.
- Introducing moderation revisions would be a separate architectural milestone.
- P6 must remain migration-free.

---

### BD-P6-11 — Draft vs Published Data

**Decision: DIRECT MUTATION — NO DRAFT/PUBLISHED SEPARATION**

P6 uses direct mutation. There is no draft/published separation in P6.

**Rules:**
- Product Studio edits update the existing canonical product.
- No revision table.
- No draft snapshot.
- No published snapshot.
- No versioned product document.
- No migration for draft state.
- Optimistic locking is mandatory.

**Rationale:**
- Current database model has a single canonical product representation.
- Existing Product Studio uses direct persistence.
- P1 optimistic locking protects against lost updates.
- Draft/published separation is future scope.

---

### BD-P6-02 — Canonical-vs-Offer Boundary Preservation

**Decision:** P6 preserves the canonical-vs-offer boundary established in P5.

Product Studio edits canonical data. Merchant offer data remains isolated.

---

### BD-P6-03 — Product Type Change

**Decision:** Merchant MUST NOT change `productTypeId`. Product type changes remain admin-only.

**Rationale:** Changing product type changes attribute schema and can affect variants and merchant offers.

---

### BD-P6-04 — Identifier Editability

**Decision:** Merchant MAY edit GTIN, EAN, MPN subject to P2 validation, trimming, NULL normalization, and uniqueness enforcement.

---

### BD-P6-05 — Category / Brand Editability

**Decision:** Merchant MAY change `categoryId` and `brandId` subject to existing validation, tenant ownership, optimistic locking, and existing taxonomy rules.

---

### BD-P6-06 — Variant Editability

**Decision:** Merchant may edit variants belonging to its own product. `combinationKey` remains computed and immutable. All variant updates use P1 optimistic locking.

---

### BD-P6-07 — Media Editability

**Decision:** Merchant may manage media belonging to its own product (add, remove, reorder, edit alt text). Every media operation validates `media.productId === productId`.

---

### BD-P6-08 — Attribute Authority

**Decision:** Typed attribute tables (`product_attribute_values`, `variant_attribute_values`) are the ONLY authoritative storage. JSONB attributes are deprecated. P6 MUST NOT read from or write to deprecated JSONB columns.

---

### BD-P6-10 — Import Interaction

**Decision:** Import concurrency is a known limitation. P6 does NOT silently redesign import. P6 does NOT claim import and Product Studio are concurrency-safe. Import optimistic locking is deferred.

---

### BD-P6-12 — Audit Events

**Decision:** P6 uses existing `AuditService`. Records `product.updated`, `variant.updated`, `attribute.updated` with actor/resource metadata. No new audit framework.

---

### BD-P6-13 — Security Model

**Decision:** Permission `merchant:products:write` + `assertProductInOrg` on all merchant Product Studio mutation endpoints. No new permission `merchant:variants:write`. Authorization occurs before sensitive mutation.

---

### BD-P6-14 — Migration Policy

**Decision:** P6 is migration-free. Migration 0054 MUST NOT be created. If implementation discovers a genuine schema requirement: STOP, return to architecture review.

---

### BD-P6-15 — API Reuse

**Decision:** P6 reuses existing backend APIs. No unnecessary duplicate endpoint family. If an existing endpoint violates locked rules: STOP and report.

---

### BD-P6-16 — Frontend Route Strategy

**Decision:** Existing `/merchant/product-studio` continues for CREATE. P6 adds `/merchant/product-studio/:id` for EDIT. Edit mode reuses the existing six-step wizard.

---

### BD-P6-17 — Performance Policy

**Decision:** P6 must avoid introducing new N+1 behavior. Product, attributes, variants, variant attributes, and media must be loaded efficiently. Variant matrix N+1 optimization remains deferred unless it becomes a release blocker.

---

### BD-P6-18 — Slug Editability

**Decision:** Merchant may edit slug. Existing slug validation and uniqueness behavior are preserved. No new slug system.

---

## 5. Merchant Ownership Model

### 5.1 Ownership Architecture

```
products.storeId → stores.orgId → organization
```

The owning store is identified by `products.storeId`. The merchant must:
1. Belong to the organization that owns the store.
2. Be authorized for that store.
3. Hold `merchant:products:write` permission.

### 5.2 Authorization Chain

```
Request → merchant:products:write → assertProductInOrg(db, caller, productId)
         → product.storeId → store.orgId === caller.activeOrg
         → ALLOWED / DENIED
```

### 5.3 Ownership Rules

| Scenario | Access |
|----------|--------|
| Merchant owns product (storeId matches) | ALLOWED |
| Merchant has offer on another's product | DENIED |
| Merchant in same org, different store | DENIED |
| Merchant in different org | DENIED |
| Product storeId = NULL | DENIED |
| Admin/Moderator/SUPER_ADMIN | BYPASS (existing) |

### 5.4 Critical Distinction

> **Store ownership ≠ Offer ownership**
>
> Having a merchant offer on a product does NOT grant canonical product editing rights. Only the store that owns the product (via `products.storeId`) may edit it.

---

## 6. Canonical-vs-Offer Boundary

### 6.1 Canonical Data (Product Studio Scope)

P6 MAY mutate:
- `products` — title, description, slug, condition, category, brand, identifiers, images
- `product_variants` — SKU, title, barcode, unit, weight, dimensions, isActive
- `product_attribute_values` — PRODUCT-scope typed attributes
- `variant_attribute_values` — VARIANT-scope typed attributes
- `product_media` — add, remove, reorder, alt text

### 6.2 Merchant Offer Data (Outside Product Studio Scope)

P6 MUST NOT mutate:
- `merchant_offers` — price, MOQ, lead time, warehouse, availability
- `price_lists` / `price_tiers`
- `inventory_items`
- `warehouses`
- `orders` / shipping / payment data

### 6.3 Boundary Enforcement

Product Studio must never change merchant price, MOQ, inventory, warehouse, or other merchant-specific operational data merely because a canonical product is edited.

---

## 7. Product Field Editability Matrix

### 7.1 Merchant MAY Edit

| Field | Validation | Notes |
|-------|-----------|-------|
| `title` | Required, trimmed | Canonical identity |
| `titleAr` | Optional, trimmed | Arabic identity |
| `description` | Optional | Canonical description |
| `descriptionAr` | Optional | Arabic description |
| `slug` | Unique, validated | URL-friendly |
| `condition` | Enum validation | NEW/REFURBISHED/USED |
| `categoryId` | FK validation | Must exist |
| `brandId` | FK validation | Must exist |
| `gtin` | Trim, NULL if empty, unique | P2 validation |
| `ean` | Trim, NULL if empty, unique | P2 validation |
| `mpn` | Trim, NULL if empty | May duplicate |
| Product images | URL validation | Via media endpoints |
| PRODUCT-scope typed attributes | Type validation | Via attribute endpoints |

### 7.2 Merchant MUST NOT Edit

| Field | Reason |
|-------|--------|
| `storeId` | Immutable ownership field |
| `status` | Moderation/admin controlled |
| `productTypeId` | Admin-only; affects attribute schema |
| `metadata` | System-controlled |
| `publishedAt` | Admin/moderation controlled |
| `deletedAt` | Admin/moderation controlled |
| `createdAt` | System-controlled |
| `updatedAt` | System-controlled |

---

## 8. Attribute Rules

### 8.1 Authority

Typed attribute tables are the **ONLY** authoritative storage:

- **PRODUCT scope:** `product_attribute_values`
- **VARIANT scope:** `variant_attribute_values`

JSONB `products.attributes` and `product_variants.attributes` are **deprecated**.

### 8.2 P6 MUST NOT

- Read authoritative values from `products.attributes`
- Read authoritative values from `product_variants.attributes`
- Dual-write JSONB + typed storage
- Bypass `TaxonomyService`
- Bypass attribute validation
- Bypass `ConditionalRulesService`

### 8.3 Supported Attribute Types

All 14 types already implemented:

| Type | Storage Column |
|------|---------------|
| TEXT | `valueText` |
| LONG_TEXT | `valueText` |
| INTEGER | `valueNumber` |
| DECIMAL | `valueNumber` |
| BOOLEAN | `valueBoolean` |
| DATE | `valueText` (ISO 8601) |
| DATETIME | `valueText` (ISO 8601) |
| SELECT | `optionValue` |
| MULTI_SELECT | `valueJson` (JSON array) |
| COLOR | `valueText` |
| URL | `valueText` |
| FILE | `valueText` (URL) |
| MEASUREMENT | `valueJson` |
| CURRENCY | `valueJson` |

### 8.4 Reuse Requirements

P6 must reuse:
- Existing Product Studio attribute rendering components
- `ConditionalRulesService` for conditional attribute rules
- `TaxonomyService` for attribute validation and persistence
- Existing attribute upsert endpoints

---

## 9. Variant Rules

### 9.1 Merchant MAY Edit

| Field | Notes |
|-------|-------|
| `sku` | Trimmed |
| `title` | |
| `titleAr` | |
| `barcode` | Trimmed |
| `unit` | |
| `weightGrams` | |
| `dimensionsMm` | If supported by existing API |
| `isActive` | Deactivate/reactivate |
| VARIANT-scope typed attributes | Via attribute endpoints |

### 9.2 Merchant MAY

- Deactivate variants
- Reactivate variants
- Delete variants with explicit confirmation
- Create variants using existing Product Studio flow

### 9.3 Merchant MUST NOT Modify

| Field | Reason |
|-------|--------|
| `combinationKey` | Computed from typed attributes |

### 9.4 Variant Constraints

- All variant updates must use P1 optimistic locking.
- All variant queries must verify `variant.productId === productId`.
- Variant must belong to the product being edited.
- `combinationKey` uniqueness must be preserved.

---

## 10. Category / Brand Rules

### 10.1 Editability

Merchant MAY change:
- `categoryId`
- `brandId`

### 10.2 Constraints

Subject to:
- Existing validation
- Tenant ownership
- Optimistic locking
- Existing taxonomy rules
- Existing identifier/type constraints

### 10.3 No New Moderation

Do NOT introduce a new moderation workflow for category/brand changes.

---

## 11. ProductType Rules

### 11.1 Immutability

Merchant **MUST NOT** change `productTypeId`.

Product type changes remain **admin-only**.

### 11.2 Rationale

Changing product type:
- Changes attribute schema
- Can invalidate existing variant attribute values
- Can affect merchant offers
- Requires P2 transaction with FOR UPDATE lock

### 11.3 P2 Behavior

Do not modify P2 behavior. `updateProductWithTypeChange()` remains admin-only.

---

## 12. Moderation Rules

### 12.1 Direct Mutation Policy

Merchant edits apply **directly** to the canonical product.

- Product remains ACTIVE after ordinary merchant edit.
- No re-moderation triggered by merchant edit.
- No `PENDING_REVIEW` state introduced.
- No draft revision introduced.
- No publication staging introduced.

### 12.2 Merchant Cannot

- Directly modify `status`.
- Approve products.
- Reject products.
- Archive products.

### 12.3 Admin Moderation

Admin moderation remains separate and unchanged:
- APPROVED → status=ACTIVE, isAvailable=true, publishedAt=now()
- REJECTED → status=REJECTED, isAvailable=false
- ARCHIVED → deletedAt=now(), isAvailable=false

### 12.4 Explicit Decision Record

> **BD-P6-09 is an explicit business decision:** Merchant edits to ACTIVE products remain ACTIVE because the direct mutation policy is deliberately locked, not because of an implementation oversight.

---

## 13. Draft / Published Rules

### 13.1 Direct Mutation

P6 uses **direct mutation**. There is no draft/published separation.

### 13.2 No Versioning Architecture

- No revision table.
- No draft snapshot.
- No published snapshot.
- No versioned product document.
- No migration for draft state.

### 13.3 Protection

Optimistic locking (P1) is the sole concurrency protection.

### 13.4 Future Scope

Draft/published separation is **future scope** — a separate architectural milestone beyond P6.

---

## 14. Optimistic Locking

### 14.1 Product Update

```sql
UPDATE products
SET ...
WHERE id = :productId
  AND "updatedAt" = :clientUpdatedAt
```

### 14.2 Variant Update

```sql
UPDATE product_variants
SET ...
WHERE id = :variantId
  AND "productId" = :productId
  AND "updatedAt" = :clientUpdatedAt
```

### 14.3 Stale Update Response

```json
{
  "statusCode": 409,
  "message": "CONFLICT",
  "currentUpdatedAt": "2026-10-05T12:00:00.000Z"
}
```

### 14.4 Prohibited Behaviors

- No last-write-wins
- No silent overwrite
- No automatic retry
- No automatic merge
- No mutex replacement for optimistic locking

### 14.5 Frontend Conflict UX

- Conflict banner displayed
- **Reload** button — fetches latest data
- **Discard** button — abandons local changes

---

## 15. Security / RBAC / Tenant Isolation

### 15.1 Permission

```
merchant:products:write
```

Do NOT create `merchant:variants:write`.

### 15.2 Authorization Chain

All merchant Product Studio mutation endpoints enforce:

```
@RequirePermission('merchant:products:write')
+ assertProductInOrg(db, caller, productId)
```

Authorization must occur **before** sensitive mutation.

### 15.3 Access Rules

| Rule | Enforcement |
|------|------------|
| Cross-org access | DENIED |
| Other-store product access | DENIED |
| storeId=NULL product access | DENIED |
| Offer ownership → product editing | DENIED |
| Variant must belong to product | ENFORCED |
| Media must belong to product | ENFORCED |

### 15.4 Admin/Moderator Access

Admin/moderator access remains governed by existing admin architecture. `BYPASS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR']`.

### 15.5 IDOR Prevention

- Variant operations verify `variant.productId === productId`.
- Media operations verify `media.productId === productId`.
- Attribute operations verify resource belongs to target product/variant.

---

## 16. Media Rules

### 16.1 Editability

Merchant may manage media belonging to its own product:
- Add media
- Remove media
- Reorder media
- Edit supported alt text fields (`altText`, `altTextAr`)

### 16.2 Validation

Every media operation must validate:

```
media.productId === productId
```

### 16.3 Access Control

Merchant must not access media belonging to another product.

### 16.4 Architecture

Do not introduce a new media architecture. Reuse existing `product_media` table and media endpoints.

---

## 17. Identifier Rules

### 17.1 Editability

Merchant MAY edit:
- GTIN
- EAN
- MPN

### 17.2 Validation Rules

- Trim whitespace
- Empty values become NULL
- GTIN uniqueness enforced (across org)
- EAN uniqueness enforced (across org)
- MPN may duplicate
- Exclude current product from uniqueness checks
- Preserve P2 validation rules
- Never bypass database/application uniqueness rules

### 17.3 Slug

- Merchant may edit slug
- Preserve existing slug validation
- Preserve uniqueness behavior
- Do not introduce a new slug system

---

## 18. Import Interaction

### 18.1 Known Limitation

Import currently does not use optimistic locking. This is a pre-existing concurrency weakness identified in the audit.

### 18.2 P6 Constraints

- Document import concurrency as a **known limitation**.
- Do not claim import concurrency is solved.
- Do not modify import architecture in P6.
- Do not create a false acceptance criterion that import and Product Studio are concurrency-safe.

### 18.3 Deferred

Import concurrency hardening remains **deferred** to a future milestone.

---

## 19. Audit Rules

### 19.1 Service

P6 must use existing `AuditService`.

### 19.2 Events

Record the following events where appropriate:

| Event | Resource | When |
|-------|----------|------|
| `product.updated` | Product | Merchant edits product fields |
| `variant.updated` | Variant | Merchant edits variant fields |
| `attribute.updated` | Attribute values | Merchant edits typed attributes |

### 19.3 Metadata

Include useful actor/resource metadata:
- `actorType`: MERCHANT
- `actorId`: merchant user sub
- `action`: update
- `resource`: product / variant / attribute
- `resourceId`: entity ID
- `orgId`: caller activeOrg
- `metadata`: relevant change details

### 19.4 No New Framework

Do not create a new audit framework.

---

## 20. Frontend UX Contract

### 20.1 Routes

| Route | Purpose |
|-------|---------|
| `/merchant/product-studio` | CREATE (existing, unchanged) |
| `/merchant/product-studio/:id` | EDIT (P6 new) |

### 20.2 Edit Mode Requirements

Edit mode must:

1. Load existing product
2. Load typed product attributes
3. Load variants
4. Load typed variant attributes
5. Load media
6. Populate existing six-step wizard
7. Allow editing according to this lock
8. Save updates (PATCH) rather than recreate
9. Preserve existing create behavior

### 20.3 Required UX Elements

| Element | Description |
|---------|------------|
| Loading state | Skeleton/spinner while data loads |
| 403 handling | "Access denied" — not owner |
| 404 handling | "Product not found" |
| Server error handling | Generic error display |
| 409 conflict handling | Conflict banner + Reload/Discard |
| Unsaved changes | `beforeunload` + navigation guard |
| Arabic RTL | All Arabic fields render RTL |

### 20.4 No Redesign

Do not redesign the entire Product Studio. Extend the existing wizard.

---

## 21. API Contract

### 21.1 Reused Endpoints

P6 reuses existing backend APIs:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/products/:id` | Load product for editing |
| PATCH | `/products/:id` | Update product fields |
| PUT | `/products/:id/attribute-values` | Update product attributes |
| POST | `/products/:id/variants` | Create variant |
| PATCH | `/products/:id/variants/:variantId` | Update variant |
| PUT | `/products/:id/variants/:variantId/attribute-values` | Update variant attributes |
| POST | `/products/:id/variants/bulk` | Bulk create variants |
| POST | `/products/:id/media` | Upload media |
| DELETE | `/products/:id/media/:mediaId` | Delete media |
| POST | `/products/:id/media/reorder` | Reorder media |

### 21.2 No Duplicate Endpoints

No unnecessary duplicate endpoint family should be introduced.

### 21.3 Violation Protocol

If an existing endpoint violates the locked business/security rules: **STOP and report** rather than silently weakening the lock.

---

## 22. Database / Migration Decision

### 22.1 Migration Policy

**P6 is LOCKED as migration-free.**

Migration 0054 **MUST NOT** be created.

### 22.2 No New Schema Required For

- Edit mode
- Optimistic locking (already exists)
- Typed attributes (already exists)
- Variants (already exists)
- Media (already exists)
- Ownership (already exists)
- Audit (already exists)

### 22.3 Emergency Protocol

If implementation discovers a genuine schema requirement:

1. **STOP** implementation.
2. Do not improvise.
3. Return to architecture review.
4. Do not create a migration under P6 without a new architecture decision.

---

## 23. Performance Rules

### 23.1 N+1 Avoidance

P6 must avoid introducing new N+1 behavior.

### 23.2 Loading Requirements

At minimum:
- Product loaded efficiently (single query)
- Product attributes loaded efficiently (batch query)
- Variants loaded efficiently (single query with productId filter)
- Variant attributes loaded efficiently (batch query)
- Media loaded efficiently (single query with productId filter)

### 23.3 Deferred

Variant matrix N+1 finding from P5 remains deferred unless P6 implementation makes it a release blocker.

Do not expand P6 into a general performance project.

---

## 24. Acceptance Criteria

### 24.1 Functional Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| P6-01 | Merchant can edit own product title/titleAr/description/descriptionAr | Integration test |
| P6-02 | Merchant can edit slug/condition/categoryId/brandId | Integration test |
| P6-03 | Merchant can edit GTIN/EAN/MPN with P2 validation | Integration test |
| P6-04 | Merchant can edit PRODUCT-scope typed attributes | Integration test |
| P6-05 | Merchant can edit own variants | Integration test |
| P6-06 | Merchant can edit VARIANT-scope typed attributes | Integration test |
| P6-07 | Merchant can add/remove/reorder own product media | Integration test |
| P6-17 | Edit mode loads existing product correctly | Integration test |
| P6-18 | Arabic fields support RTL | Visual/UX test |
| P6-19 | Unsaved changes protection implemented | Integration test |
| P6-26 | P6 does not mutate merchant offers | Integration test |
| P6-27 | Import/export compatibility preserved | Regression test |
| P6-28 | combination_key uniqueness preserved | Integration test |
| P6-33 | Merchant edits to ACTIVE products remain ACTIVE (direct mutation policy) | Integration test |
| P6-34 | Audit events generated for merchant product/variant/attribute updates | Integration test |

### 24.2 Security Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| P6-08 | Product optimistic locking works; stale update returns 409 | Integration test |
| P6-09 | Variant optimistic locking works; stale update returns 409 | Integration test |
| P6-10 | 409 UX provides Reload and Discard | UX test |
| P6-11 | `merchant:products:write` enforced | Security test |
| P6-12 | `assertProductInOrg` enforced | Security test |
| P6-13 | Cross-organization product access denied | Security test |
| P6-14 | Merchant cannot change productTypeId | Security test |
| P6-15 | Merchant cannot change status | Security test |
| P6-16 | Merchant cannot change storeId | Security test |
| P6-29 | Store-level ownership enforced | Security test |
| P6-30 | storeId=NULL products cannot be merchant-edited | Security test |
| P6-31 | Variant productId scoping prevents IDOR | Security test |
| P6-32 | Media productId scoping prevents IDOR | Security test |

### 24.3 Quality Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| P6-20 | API TypeScript = 0 errors | `pnpm turbo run typecheck --filter=api` |
| P6-21 | Web TypeScript = 0 errors | `pnpm turbo run typecheck --filter=web` |
| P6-22 | No P1/P2/P3/P5 regression | Full regression suite |
| P6-23 | Migration 0054 does not exist | File system check |

### 24.4 Concurrency Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| P6-24 | Merchant-vs-merchant concurrency: 50 iterations, 0 double-success | Concurrency test |
| P6-25 | Merchant-vs-admin concurrency: 50 iterations, 0 double-success | Concurrency test |

---

## 25. Test Strategy

### 25.1 Unit Tests

- Field editability matrix validation
- Ownership authorization logic
- Identifier validation (trim, NULL, uniqueness)
- Attribute type validation
- Variant constraint validation

### 25.2 PostgreSQL Integration Tests

- Product edit end-to-end
- Variant edit end-to-end
- Attribute edit end-to-end
- Media management end-to-end
- Optimistic locking (product + variant)
- Ownership enforcement (cross-org, cross-store, NULL storeId)
- IDOR prevention (variant, media)
- Identifier uniqueness
- Status immutability
- ProductType immutability

### 25.3 Concurrency Tests

| Scenario | Iterations | Pass Criteria |
|----------|-----------|---------------|
| Merchant vs Merchant product edit | 50 | Exactly 1 winner, exactly 1 × 409, 0 double-success |
| Merchant vs Admin product edit | 50 | 0 double-success |
| Merchant vs Moderation | 50 | 0 double-success |
| Merchant attribute vs Merchant attribute | 50 | 0 corruption, 0 duplicate rows, 0 lost updates |
| Merchant variant vs Merchant variant | 50 | 0 double-success |

### 25.4 Regression Tests

- Full P1/P2/P3/P5 regression suite
- Import/export compatibility
- Existing create workflow unchanged

### 25.5 UX Tests

- 409 conflict banner + Reload/Discard
- 403/404/error handling
- Unsaved changes protection
- Arabic RTL rendering
- Loading states

---

## 26. Implementation Sequence

| Phase | Description | Dependencies |
|-------|------------|-------------|
| P6.0 | Baseline verification | None |
| P6.1 | Edit mode route (`/merchant/product-studio/:id`) | P6.0 |
| P6.2 | Product loading (GET + typed attributes + variants + media) | P6.1 |
| P6.3 | Product scalar editing (title, description, slug, condition, category, brand, identifiers) | P6.2 |
| P6.4 | Typed product attributes (PRODUCT-scope) | P6.3 |
| P6.5 | Variant loading/editing | P6.2 |
| P6.6 | Typed variant attributes (VARIANT-scope) | P6.5 |
| P6.7 | Media management (add/remove/reorder/alt text) | P6.2 |
| P6.8 | Optimistic locking + 409 UX (conflict banner, Reload, Discard) | P6.3, P6.5 |
| P6.9 | Unsaved changes protection (beforeunload + navigation guard) | P6.3 |
| P6.10 | Security/ownership hardening (IDOR, cross-org, NULL storeId) | P6.3, P6.5, P6.7 |
| P6.11 | Audit events (product.updated, variant.updated, attribute.updated) | P6.3, P6.5 |
| P6.12 | Unit tests | P6.1–P6.11 |
| P6.13 | PostgreSQL integration tests | P6.1–P6.11 |
| P6.14 | Concurrency tests | P6.13 |
| P6.15 | Full regression (P1/P2/P3/P5) | P6.14 |
| P6.16 | Implementation report | P6.15 |
| P6.17 | Independent runtime verification | P6.16 |
| P6.18 | Release closure | P6.17 |

---

## 27. Deferred Scope

The following are **explicitly deferred** from P6:

| Deferred Item | Reason |
|--------------|--------|
| ProductType changes by merchants | Admin-only; affects attribute schema |
| Draft/published separation | Future architectural milestone |
| Revision/versioning architecture | Future architectural milestone |
| Re-moderation workflow | Separate milestone |
| Import optimistic locking | Pre-existing; separate hardening milestone |
| Variant matrix N+1 optimization | Deferred unless blocking |
| New specialized attribute widgets | Reuse existing |
| Complete navigation guard redesign | P6 uses basic beforeunload |
| P7 — Merchant Variant Editing | Separate milestone if still applicable |
| P8 — Admin Product List Redesign | Separate milestone |
| P9 — Audit Trail Expansion | Separate milestone |
| Unrelated offer/pricing/inventory/shipping/payment work | Out of scope |

Do not accidentally reintroduce deferred work during P6 implementation.

---

## 28. Release / Rollback Safety

### 28.1 Rollback Strategy

P6 is migration-free. Rollback consists of:
1. Reverting the P6 commit(s) on `develop`.
2. Redeploying the previous build.
3. No database rollback required.

### 28.2 Feature Isolation

P6 changes are isolated to:
- Frontend: new edit mode route and components
- Backend: no new endpoints; existing endpoints unchanged unless hardened

### 28.3 Regression Safety

Full P1/P2/P3/P5 regression suite must pass before P6 release.

---

## 29. Final Lock Checklist

| Check | Status |
|-------|--------|
| BD-P6-01 (ownership) resolved | ✅ LOCKED |
| BD-P6-09 (re-moderation) resolved | ✅ LOCKED |
| BD-P6-11 (draft/published) resolved | ✅ LOCKED |
| Canonical-vs-offer boundary locked | ✅ LOCKED |
| Merchant ownership locked | ✅ LOCKED |
| Product field editability locked | ✅ LOCKED |
| Variant policy locked | ✅ LOCKED |
| Attribute authority locked | ✅ LOCKED |
| Optimistic locking locked | ✅ LOCKED |
| Security locked | ✅ LOCKED |
| Moderation behavior locked | ✅ LOCKED |
| Draft/published behavior locked | ✅ LOCKED |
| Migration policy locked | ✅ LOCKED |
| Acceptance criteria locked | ✅ LOCKED (34 criteria) |
| Deferred scope locked | ✅ LOCKED |
| Implementation sequence locked | ✅ LOCKED (19 phases) |
| Test strategy locked | ✅ LOCKED |
| Unresolved business decisions | **0** |
| Unresolved architecture decisions | **0** |
| Migration ambiguity | **0** |
| Scope ambiguity | **0** |

---

## 30. Final Decision

### **LOCKED / GO**

All conditions for LOCKED / GO are satisfied:

- ✅ Three blocking decisions explicitly resolved (BD-P6-01, BD-P6-09, BD-P6-11)
- ✅ No unresolved business decisions remain
- ✅ No unresolved architecture decisions remain
- ✅ No migration required (migration-free)
- ✅ Scope is bounded
- ✅ Acceptance criteria are testable (34 criteria)
- ✅ Implementation sequence is locked (19 phases)
- ✅ Deferred scope is explicit

**P6 is ready for implementation.**

---

**NEXT GATE:**
**P6 IMPLEMENTATION**
