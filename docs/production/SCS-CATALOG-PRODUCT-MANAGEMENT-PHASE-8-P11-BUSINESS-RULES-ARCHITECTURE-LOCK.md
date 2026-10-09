# SCS Platform — P11 Business Rules & Architecture Lock

**Document:** SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-8-P11-BUSINESS-RULES-ARCHITECTURE-LOCK.md
**Date:** 2026-10-08
**Predecessor:** P11 Fresh Architecture & Business Audit = COMPLETE
**Gate:** P11 BUSINESS RULES & ARCHITECTURE LOCK

---

## 1. Executive Summary

This document locks all business rules, architecture decisions, and acceptance criteria for P11 — Product Governance & Submission Workflow. Every material question has been resolved through source code inspection, database verification, and architectural analysis.

**Key decisions:**
- Product lifecycle: DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → PUBLISHED (with REJECTED branch)
- Migration 0056 REQUIRED: new `product_moderation` table + `submitted_at`/`reviewed_at`/`rejection_reason` columns on products
- Existing ACTIVE products: grandfathered as PUBLISHED (no re-review required)
- Existing DRAFT products: remain DRAFT (governance applies on next submission)
- Bulk moderation: DEFERRED to P12+
- Idempotency: status transition atomicity sufficient (no idempotency key needed for submission)
- Edit-after-approval: PUBLISHED edits create pending revision (unpublish until re-approved)

**Migration decision:** REQUIRED — migration 0056

**Scope:** Product governance only. Payment, settlement, refunds, returns, inventory receiving remain deferred.

---

## 2. Baseline

| Item | Value |
|------|-------|
| Branch | develop |
| HEAD | 9ca034a839d6c05aedd0edb659c3732edca2383c |
| Latest migration | 0055_import_chunking_inventory_integrity.sql |
| Migration 0056 | ABSENT |
| Product status column | `varchar('status', { length: 16 }).notNull().default('DRAFT')` |
| Current status values in use | DRAFT (158), ACTIVE (10) |
| Products with offers | 0 |
| Total orders | 4 |
| Store membership roles | OWNER, ADMIN, MEMBER |
| Product ownership | All products store-owned (no canonical NULL store_id) |
| Admin moderation | APPROVED → ACTIVE, REJECTED → REJECTED, ARCHIVED → soft-delete |
| Product creation | Always DRAFT, requires storeId + store membership |
| Import behavior | Creates products as DRAFT |

---

## 3. Business Objective

> Establish a controlled product governance workflow in which merchant products are submitted for review, administrators/moderators review them, approved products become publishable, rejected products can be corrected and resubmitted, and edits to approved/published products trigger appropriate re-moderation.

**Preserved architecture:**
```
Category → Product Type → Canonical Product → Variants → Merchant Offer → Store
```

Product governance governs the **catalog product**. Offer activation remains a separate concern.

---

## 4. Locked Product Lifecycle

### 4.1 Canonical Statuses

| Status | Meaning | Searchable | Offerable |
|--------|---------|------------|-----------|
| DRAFT | Merchant working on product; not submitted | NO | NO |
| SUBMITTED | Merchant submitted for review; awaiting queue assignment | NO | NO |
| UNDER_REVIEW | Admin/moderator actively reviewing | NO | NO |
| APPROVED | Passed moderation; ready to publish | NO | YES (if store activates) |
| PUBLISHED | Approved and visible in search/browsing | YES | YES |
| REJECTED | Failed moderation; merchant must correct and resubmit | NO | NO |

**Note:** `APPROVED` is distinct from `PUBLISHED`. APPROVED means the product passed moderation. PUBLISHED means it is visible to buyers. A merchant can choose to keep an approved product unpublished (e.g., seasonal inventory).

### 4.2 Removed Statuses

- `ACTIVE` is replaced by `PUBLISHED` in the governance workflow. For backward compatibility, existing ACTIVE products are migrated to PUBLISHED.
- `INACTIVE` is not used in the governance workflow. Merchants who want to temporarily hide a product set `isAvailable=false` on the offer, not the product status.

### 4.3 State Machine

```
                    ┌──────────────────────────────────────┐
                    │                                      │
                    ▼                                      │
[DRAFT] ──submit──▶ [SUBMITTED] ──start review──▶ [UNDER_REVIEW]
                    │                                      │
                    │                                      ├──approve──▶ [APPROVED] ──publish──▶ [PUBLISHED]
                    │                                      │                    │                      │
                    │                                      │                    │                      ├──edit──▶ [UNDER_REVIEW]
                    │                                      │                    │                      │
                    │                                      │                    └──unpublish──▶ [APPROVED]
                    │                                      │
                    │                                      └──reject──▶ [REJECTED] ──resubmit──▶ [SUBMITTED]
                    │                                                      │
                    └──────────────edit────────────────────────────────────┘
```

---

## 5. Transition Matrix

| Current | Action | Actor | Next | Allowed |
|---------|--------|-------|------|---------|
| DRAFT | submit | merchant (OWNER/ADMIN/MEMBER) | SUBMITTED | YES |
| DRAFT | edit | merchant (owner store) | DRAFT | YES |
| DRAFT | delete | merchant (owner store) | (soft-delete) | YES |
| SUBMITTED | start_review | admin/moderator | UNDER_REVIEW | YES |
| SUBMITTED | withdraw | merchant (owner store) | DRAFT | YES |
| UNDER_REVIEW | approve | admin/moderator | APPROVED | YES |
| UNDER_REVIEW | reject | admin/moderator | REJECTED | YES |
| APPROVED | publish | merchant (owner store) | PUBLISHED | YES |
| APPROVED | edit | merchant (owner store) | UNDER_REVIEW | YES (triggers re-review) |
| APPROVED | unpublish | merchant (owner store) | APPROVED | YES (no status change; isAvailable=false on offers) |
| PUBLISHED | edit | merchant (owner store) | UNDER_REVIEW | YES (triggers re-review; unpublishes immediately) |
| PUBLISHED | unpublish | merchant (owner store) | APPROVED | YES |
| REJECTED | edit | merchant (owner store) | REJECTED | YES (stays REJECTED until resubmit) |
| REJECTED | resubmit | merchant (OWNER/ADMIN/MEMBER) | SUBMITTED | YES |
| Any pre-PUBLISHED | archive | admin | (soft-delete) | YES |

**Terminal states:** None. Every state has at least one outgoing transition.

---

## 6. Actor/Role Matrix

| Action | OWNER | ADMIN | MEMBER | Admin | Moderator | Platform |
|--------|-------|-------|--------|-------|-----------|----------|
| Create product | YES | YES | YES | YES | YES | YES |
| Edit DRAFT | YES | YES | YES | YES | YES | YES |
| Submit | YES | YES | YES | NO | NO | NO |
| Withdraw submission | YES | YES | YES | NO | NO | NO |
| Start review | NO | NO | NO | YES | YES | NO |
| Approve | NO | NO | NO | YES | YES | NO |
| Reject | NO | NO | NO | YES | YES | NO |
| Publish | YES | YES | YES | NO | NO | NO |
| Edit APPROVED/PUBLISHED | YES | YES | YES | YES | YES | YES |
| Unpublish | YES | YES | YES | YES | YES | YES |
| Resubmit after rejection | YES | YES | YES | NO | NO | NO |
| Delete DRAFT/REJECTED | YES | YES | YES | YES | YES | YES |
| Archive any | NO | NO | NO | YES | YES | YES |

**IDOR protection:** All merchant actions enforce `assertStoreInOrg` + `assertStoreMember`. Cross-store/cross-org access returns 403.

---

## 7. Product Ownership Rules

1. **Only the owning store can submit.** The product's `store_id` determines which store's members can manage it.
2. **Another merchant offer-owner cannot submit a canonical product.** Offer ownership does not grant product governance rights.
3. **`store_id IS NULL` products are platform canonical.** They bypass merchant governance (admin-created catalog data).
4. **Admin-owned/shared products do not enter merchant workflow.** Admin products with `store_id IS NULL` are always PUBLISHED.
5. **A merchant can edit a product after publication** but it triggers re-review (see §8).
6. **Offer ownership never grants product governance rights.** Offers are store-scoped; products are store-scoped.

---

## 8. Edit-After-Approval Rules

### DRAFT
No moderation required. Merchant can edit freely until submission.

### REJECTED
Editing allowed. Product stays REJECTED until merchant resubmits.

### UNDER_REVIEW
Editing is **blocked**. Merchant must wait for moderation decision. If merchant needs to change, they must withdraw (→ DRAFT) then edit then resubmit.

### APPROVED
Merchant edits trigger **immediate re-review**: APPROVED → UNDER_REVIEW. Product is not visible in search (was never PUBLISHED). Offers remain activatable.

### PUBLISHED
Merchant edits trigger **immediate re-review AND unpublish**: PUBLISHED → UNDER_REVIEW. Product is removed from search immediately. Existing offers are suspended (isAvailable set to false). Orders already placed are unaffected.

**Consistency model:** No versioning. The product row is mutated in place. The old published version is lost. This is the simplest safe behavior for a B2B marketplace where product changes are infrequent and merchant-driven.

---

## 9. Variant/Attribute Governance

All changes to the following fields trigger re-review when the product is APPROVED or PUBLISHED:

**High-risk (require re-review):**
- title, titleAr
- description, descriptionAr
- categoryId
- brandId
- productTypeId
- gtin, ean, mpn
- images
- variants (add/edit/delete)
- typed attributes (product/variant scope)

**Low-risk (no re-review):**
- metadata (JSONB)
- slug (auto-generated)

**Rationale:** High-risk fields affect buyer-facing catalog data. Low-risk fields are internal/operational.

---

## 10. Active Offer Interaction

| Product Status Change | Offer Impact |
|----------------------|--------------|
| DRAFT → SUBMITTED | No effect (offers cannot exist on DRAFT products) |
| SUBMITTED → UNDER_REVIEW | No effect |
| UNDER_REVIEW → APPROVED | Offers can be created/activated |
| APPROVED → PUBLISHED | Offers remain active |
| PUBLISHED → UNDER_REVIEW (edit) | **Offers suspended** (isAvailable=false) |
| UNDER_REVIEW → APPROVED (re-approved) | Offers reactivated (isAvailable restored) |
| APPROVED → REJECTED (after re-review fail) | Offers suspended |
| Any → REJECTED | Offers suspended |

**Existing carts:** Unaffected. Cart items reference variants, not product status.
**Existing orders:** Unaffected. Orders have immutable snapshots.
**Inventory:** Unaffected. Inventory is offer-scoped, not product-scoped.

---

## 11. Moderation Queue Architecture

### Queue Eligibility
Products with status `SUBMITTED` or `UNDER_REVIEW`.

### Sorting
Default: `createdAt ASC` (oldest first). Configurable: `createdAt DESC`, `title ASC`.

### Filtering
- Status: SUBMITTED, UNDER_REVIEW
- Category: categoryId
- Store: storeId
- Merchant/org: storeId → orgId
- Submission date range

### Pagination
Standard limit/offset (default 20, max 100).

### Concurrency Strategy
**Optimistic locking.** No claim-based locking. Multiple moderators can view the same product. The first to submit a moderation action wins. The second gets a 409 Conflict (stale updatedAt).

**Race scenario:**
```
Moderator A opens product (reads updatedAt=T1)
Moderator B opens product (reads updatedAt=T1)
A approves → UPDATE WHERE updatedAt=T1 → success, updatedAt=T2
B rejects → UPDATE WHERE updatedAt=T1 → 0 rows → 409 Conflict
```

---

## 12. Moderation Actions

| Action | Required Reason | Effect |
|--------|----------------|--------|
| APPROVE | NO | UNDER_REVIEW → APPROVED |
| REJECT | YES (free-text) | UNDER_REVIEW → REJECTED |
| REQUEST_CHANGES | YES (free-text) | UNDER_REVIEW → REJECTED (same as reject; merchant must resubmit) |

**Decision:** `REQUEST_CHANGES` is treated as `REJECT` with a reason. No separate status. The reason field distinguishes it semantically for the merchant.

**Reason validation:** Mandatory for REJECT. Free-text, max 1000 chars. Stored in `products.rejection_reason` and in `product_moderation.reason`.

---

## 13. Rejection/Resubmission

- Rejection reason is **mandatory**.
- Merchant does NOT need to change anything before resubmission (they may agree and fix later).
- Same product can be resubmitted **indefinitely** (no limit).
- Submission count is tracked in `product_moderation` (append-only history).
- Previous moderation history remains **immutable** (append-only table).

---

## 14. Moderation History

**New table:** `product_moderation`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | NO | PK |
| product_id | uuid | NO | FK → products.id |
| action | varchar(16) | NO | SUBMITTED, APPROVED, REJECTED, WITHDRAWN, PUBLISHED, UNPUBLISHED |
| from_status | varchar(16) | YES | Previous status |
| to_status | varchar(16) | NO | New status |
| actor_user_id | uuid | NO | FK → users.id |
| actor_role | varchar(16) | NO | ADMIN, MODERATOR, MERCHANT |
| reason | text | YES | For REJECT/REQUEST_CHANGES |
| created_at | timestamptz | NO | default now() |

**Indexes:**
- `idx_product_moderation_product_id` ON (product_id)
- `idx_product_moderation_created_at` ON (created_at DESC)

**Immutability:** No UPDATE or DELETE. INSERT only. Enforced at application layer (no DB-level trigger needed for Phase 1).

**Existing AuditService:** Insufficient. AuditService records generic events. `product_moderation` is a dedicated, queryable moderation ledger with structured fields.

**Outbox events:** YES. Each moderation action publishes an outbox event:
- `product.submitted`
- `product.approved`
- `product.rejected`
- `product.published`
- `product.unpublished`

---

## 15. Notification Contract

| Event | Template ID | Channels | Timing |
|-------|------------|----------|--------|
| Product submitted | `product.submitted` | IN_APP (admin) | Synchronous |
| Product approved | `product.approved` | IN_APP, PUSH (merchant) | Outbox |
| Product rejected | `product.rejected` | IN_APP, PUSH, SMS (merchant) | Outbox |
| Product published | `product.published` | IN_APP (merchant) | Outbox |

**Retry behavior:** Best-effort. Notification failure does not roll back moderation action.
**Idempotency:** Notification deduplication by (template_id, product_id, created_at minute).

---

## 16. Bulk Moderation Decision

**DEFERRED.** Bulk moderation is not included in P11.

**Rationale:** P11 establishes the single-product governance workflow. Bulk operations can be added later without schema changes. The `product_moderation` table supports per-product audit regardless.

---

## 17. Idempotency Decision

**No idempotency key required for submission.**

**Rationale:** Submission is a status transition (DRAFT → SUBMITTED). The atomic conditional UPDATE (`WHERE status = 'DRAFT'`) ensures exactly-once semantics. A second submit attempt returns 409 Conflict.

**For moderation actions:** Same rationale. Atomic conditional UPDATE (`WHERE status = 'UNDER_REVIEW' AND updatedAt = clientUpdatedAt`) ensures exactly-once.

---

## 18. Concurrency Contract

| Scenario | Expected Behavior |
|----------|-------------------|
| A: Two submissions of same product | First succeeds (DRAFT → SUBMITTED). Second gets 409 (product no longer DRAFT). |
| B: Merchant submission vs merchant edit | Edit blocked while SUBMITTED/UNDER_REVIEW. Merchant must withdraw first. |
| C: Merchant edit vs moderator approval | Atomic conditional UPDATE. If moderator approves first (updatedAt changes), merchant edit gets 409. If merchant edits first (status → UNDER_REVIEW), moderator approval gets 409 (status no longer UNDER_REVIEW). |
| D: Two moderators approve/reject simultaneously | First succeeds. Second gets 409 (stale updatedAt). |
| E: Moderator action vs merchant resubmission | Moderator action on UNDER_REVIEW product. Merchant cannot resubmit while UNDER_REVIEW. |
| F: Bulk vs individual moderation | N/A (bulk deferred) |

**Mandatory guarantees:**
- Atomic conditional status transition (UPDATE WHERE status = expected AND updatedAt = clientUpdatedAt)
- Optimistic locking on all moderation actions
- No double-success (exactly one winner)
- Immutable moderation history (INSERT only)
- Transactional outbox for events

---

## 19. Import Interaction

1. **Imported NEW products become DRAFT.** Import cannot bypass governance.
2. **Import cannot directly create PUBLISHED products.** All imports go through the submission workflow.
3. **Import can modify PUBLISHED products** but triggers re-review (PUBLISHED → UNDER_REVIEW).
4. **Import modification of UNDER_REVIEW products is blocked.** Import must skip rows that match products in SUBMITTED/UNDER_REVIEW status.
5. **Import cannot bypass governance.** The import pipeline must check product status before processing.

**Fail-safe rule:** Import must not publish products without moderation.

---

## 20. Product Studio Interaction

| Product Status | Editable | Submit Button | Resubmit Button | Rejection Display | Read-Only |
|---------------|----------|---------------|-----------------|-------------------|-----------|
| DRAFT | YES | YES (if valid) | NO | NO | NO |
| SUBMITTED | NO | NO | NO | NO | YES (with "Submitted" badge) |
| UNDER_REVIEW | NO | NO | NO | NO | YES (with "Under Review" badge) |
| APPROVED | YES (triggers re-review) | NO | NO | NO | NO (with warning) |
| PUBLISHED | YES (triggers re-review + unpublish) | NO | NO | NO | NO (with warning) |
| REJECTED | YES | NO | YES | YES (reason displayed) | NO |

**Dirty-state behavior:** If merchant edits APPROVED/PUBLISHED product, a warning modal explains: "Editing will unpublish this product and send it for re-review. Continue?"

**Optimistic-lock conflict:** If merchant gets 409, the UI shows "This product was modified by someone else. Please reload and try again."

---

## 21. API Contract

### 21.1 Merchant Endpoints

**POST /v1/merchant/products/:id/submit**
- Actor: Merchant (store member)
- Permission: `merchant:products:write`
- Tenant scope: assertStoreInOrg + assertStoreMember
- Input: `{}` (no body required)
- Output: `{ id, status: 'SUBMITTED', submittedAt }`
- Errors: 403 (not member), 404 (not found), 409 (not in DRAFT/REJECTED status)
- Concurrency: Atomic UPDATE WHERE status IN ('DRAFT', 'REJECTED')

**POST /v1/merchant/products/:id/withdraw**
- Actor: Merchant (store member)
- Permission: `merchant:products:write`
- Input: `{}`
- Output: `{ id, status: 'DRAFT' }`
- Errors: 403, 404, 409 (not SUBMITTED)

**POST /v1/merchant/products/:id/publish**
- Actor: Merchant (store member)
- Permission: `merchant:products:write`
- Input: `{}`
- Output: `{ id, status: 'PUBLISHED', publishedAt }`
- Errors: 403, 404, 409 (not APPROVED)

**POST /v1/merchant/products/:id/unpublish**
- Actor: Merchant (store member)
- Permission: `merchant:products:write`
- Input: `{}`
- Output: `{ id, status: 'APPROVED' }`
- Errors: 403, 404, 409 (not PUBLISHED)

**GET /v1/merchant/products/:id/moderation-history**
- Actor: Merchant (store member)
- Output: `{ history: ProductModeration[] }`
- Errors: 403, 404

### 21.2 Admin Endpoints

**POST /v1/admin/products/:id/moderate**
- Actor: Admin/Moderator
- Permission: `admin:merchants:read` (existing)
- Input: `{ decision: 'APPROVED' | 'REJECTED', reason?: string, updatedAt: string }`
- Output: `{ id, decision, status, moderatedAt }`
- Errors: 400 (invalid decision/missing reason), 404, 409 (stale updatedAt)
- Concurrency: Atomic UPDATE WHERE status = 'UNDER_REVIEW' AND updatedAt = clientUpdatedAt

**GET /v1/admin/products/moderation-queue**
- Actor: Admin/Moderator
- Query params: status, categoryId, storeId, limit, offset, sort
- Output: `{ products: Product[], total: number }`

**GET /v1/admin/products/:id/moderation-history**
- Actor: Admin/Moderator
- Output: `{ history: ProductModeration[] }`

---

## 22. Database/Schema Decision

**Migration REQUIRED.**

### New columns on `products`:
- `submitted_at` timestamptz NULL
- `reviewed_at` timestamptz NULL
- `reviewed_by` uuid NULL (FK → users.id)
- `rejection_reason` text NULL (repurpose existing column)
- `published_at` timestamptz NULL (already exists)

### New table: `product_moderation`
(See §14 for schema)

### Status values:
The `status` column remains `varchar(16)`. New values: SUBMITTED, UNDER_REVIEW, APPROVED, PUBLISHED. Old values: DRAFT (retained), ACTIVE (migrated to PUBLISHED), REJECTED (retained).

---

## 23. Migration Decision

**Migration 0056 REQUIRED.**

**Schema changes:**
1. Add columns to `products`: `submitted_at`, `reviewed_at`, `reviewed_by`
2. Create table `product_moderation`
3. Backfill: UPDATE products SET status = 'PUBLISHED' WHERE status = 'ACTIVE'

**Idempotent:** YES (IF NOT EXISTS for table, conditional UPDATE for backfill)
**Fresh database:** Works (migration runs in sequence)
**Existing database:** Works (backfill migrates ACTIVE → PUBLISHED)
**Rollback:** Not supported (status change is one-way). Document in migration comments.
**Data loss:** NONE. All existing products preserved.

---

## 24. Backward Compatibility

| Client | Impact |
|--------|--------|
| Existing API clients | `status = 'ACTIVE'` no longer returned. Clients must handle 'PUBLISHED'. |
| Existing web app | Search page filters on `status = 'ACTIVE'` must change to `status = 'PUBLISHED'`. |
| Mobile clients | Same as web app. |
| Admin clients | Moderation queue is new. Existing moderate endpoint unchanged (APPROVED/REJECTED/ARCHIVED). |
| Existing imports | Import creates DRAFT products (unchanged). Import must check product status before updating. |
| Existing exports | Export includes all products regardless of status (unchanged). |
| Existing offers | Offers on PUBLISHED products remain active. Offers on non-PUBLISHED products are suspended. |
| Existing ACTIVE products | Migrated to PUBLISHED (no behavior change). |

**Breaking change:** `status = 'ACTIVE'` is replaced by `status = 'PUBLISHED'`. This is a **controlled breaking change** justified by the governance requirement. Clients must update.

---

## 25. Security Model

| Control | Implementation |
|---------|---------------|
| Store membership | assertStoreMember on all merchant submission endpoints |
| Org isolation | assertStoreInOrg on all merchant submission endpoints |
| Cross-tenant isolation | Product ownership enforced via store_id |
| Admin authorization | @RequirePermission('admin:merchants:read') on moderation endpoints |
| IDOR protection | Product ID resolved through store membership; cannot access other stores' products |
| History authorization | Merchant can only see own store's product history. Admin can see all. |

---

## 26. Acceptance Criteria

### Functional

| ID | Criterion |
|----|-----------|
| P11-A01 | Merchant can submit a DRAFT product for review |
| P11-A02 | Submission validates product has required fields (title, storeId) |
| P11-A03 | Admin sees moderation queue with SUBMITTED/UNDER_REVIEW products |
| P11-A04 | Admin can approve a product (UNDER_REVIEW → APPROVED) |
| P11-A05 | Admin can reject a product with mandatory reason (UNDER_REVIEW → REJECTED) |
| P11-A06 | Merchant can resubmit a REJECTED product |
| P11-A07 | Editing an APPROVED/PUBLISHED product triggers re-review |
| P11-A08 | Moderation history is visible and immutable |
| P11-A09 | Merchant sees submission status and rejection reason |
| P11-A10 | Admin sees all submitted products across stores |
| P11-A11 | Notifications sent on approve/reject/publish |
| P11-A12 | Existing ACTIVE products migrated to PUBLISHED |
| P11-A13 | Import creates DRAFT products; cannot bypass governance |
| P11-A14 | Product Studio reflects governance status |

### Security

| ID | Criterion |
|----|-----------|
| P11-S01 | Only store members can submit products |
| P11-S02 | Same-org different-store members cannot submit |
| P11-S03 | Cross-tenant submission returns 403 |
| P11-S04 | Only admin/moderator can approve/reject |
| P11-S05 | Moderation IDOR: admin cannot moderate other org's products without permission |
| P11-S06 | History authorization: merchant sees own store only |

### Concurrency

| ID | Criterion |
|----|-----------|
| P11-C01 | Concurrent submission: exactly one succeeds |
| P11-C02 | Submit vs edit: edit blocked while SUBMITTED |
| P11-C03 | Edit vs approval: exactly one succeeds (409 for loser) |
| P11-C04 | Moderator race: exactly one succeeds |
| P11-C05 | Rejection vs resubmission: cannot resubmit while UNDER_REVIEW |
| P11-C06 | Bulk vs individual: N/A (bulk deferred) |

### Performance

| Metric | Target |
|--------|--------|
| Moderation queue (page 1) | < 200ms |
| Submission | < 100ms |
| Moderation action | < 100ms |

---

## 27. Migration Acceptance

| ID | Criterion |
|----|-----------|
| MIG-01 | Fresh database: migration 0056 runs successfully |
| MIG-02 | Existing database: migration 0056 runs successfully |
| MIG-03 | Idempotent rerun: second run is no-op |
| MIG-04 | Deterministic backfill: all ACTIVE → PUBLISHED |
| MIG-05 | No data loss: all products preserved |
| MIG-06 | Existing ACTIVE products become PUBLISHED |

---

## 28. Scope Boundaries

**OUT OF SCOPE (explicitly deferred):**
- Payment processing
- Merchant settlement
- Commission collection
- Refunds
- Returns
- Inventory receiving
- Mobile search parity
- XLSX export
- Accounting integration
- Carrier sandbox
- Distributed tracing
- Prometheus/Grafana
- Admin 2FA
- Search relevance
- Manufacturer entity
- Product merge/dedup
- Variant media UI
- Orphan S3 cleanup
- Membership invitation system
- Bulk moderation

---

## 29. P12 Dependency

```
P11 Product Governance
        ↓
P12 Payment & Financial Settlement
        ↓
P13 Inventory Operations
        ↓
P14 Returns & Refunds
```

Payment, merchant settlement, and commission collection are P1 production blockers. P12 is the next major milestone after P11 governance is complete.

---

## 30. Implementation Sequence

1. Migration 0056 (schema changes + backfill)
2. Product moderation service + table
3. Submission endpoints (merchant)
4. Moderation endpoints (admin)
5. Edit-after-approval governance
6. Import interaction (check product status)
7. Notification wiring
8. Product Studio UI updates
9. Admin moderation queue UI
10. Acceptance tests

---

## 31. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking change: ACTIVE → PUBLISHED | Clients must update | Document in release notes; provide migration guide |
| Imported products blocked by governance | Merchants cannot bulk-publish | Import creates DRAFT; merchants submit individually |
| Re-review on every edit | Merchant friction | Low-risk fields (metadata) do not trigger re-review |
| Moderation queue backlog | Products stuck in SUBMITTED | Admin SLA: review within 48h (operational, not technical) |

---

## 32. Final Architecture Gate

**Verification checklist:**
- [x] No unresolved business-rule ambiguity
- [x] No undefined status transition
- [x] No undefined actor
- [x] No undefined authorization rule
- [x] No undefined concurrency behavior
- [x] No undefined existing-data behavior
- [x] No undefined import interaction
- [x] No undefined Product Studio interaction
- [x] No undefined moderation history behavior
- [x] Migration decision finalized (REQUIRED — 0056)
- [x] API contract finalized
- [x] Acceptance criteria measurable
- [x] Implementation scope bounded
- [x] P12 dependency preserved

---

```text
P11 BUSINESS RULES & ARCHITECTURE LOCK = LOCKED / GO
```

```text
Next gate:
P11 IMPLEMENTATION
```

---

**End of P11 Business Rules & Architecture Lock**
