# SCS Catalog Product Management — Phase 5 / P7 Business Rules & Architecture Lock

> **Status:** LOCKED
> **Date:** 2026-10-06
> **Predecessor:** P6 Release Closure (CLOSED / PASS WITH CONDITIONS)
> **Audit:** Next Phase Architecture & Business Audit (GO WITH CONDITIONS)

---

## 1. Executive Summary

This document is the **authoritative business rules and architecture contract** for P7 — Store Membership Management & Product Studio Production Hardening. It locks every business decision, authorization rule, concurrency invariant, and acceptance criterion required before implementation begins.

**P7 scope** is fixed to three parts:

- **Part A** — Store Membership Management (CRUD, last-owner protection, audit events, authorization)
- **Part B** — Product Studio Production Hardening (beforeunload, media UX, catalog navigation)
- **Part C** — Security Consistency (import/export/offer authorization patch)

**All seven business decisions (BD-P7-01 through BD-P7-07) are LOCKED.**

**Migration 0055:** NOT REQUIRED — existing `store_members` columns (migration 0054) plus the existing `outbox_events` and `audit_logs` tables fully support all locked requirements.

**Architecture Gate:** GO

---

## 2. P7 Scope

### Part A — Store Membership Management

| ID | Capability |
|----|-----------|
| A-1 | View store members (list with role, status) |
| A-2 | Add member (from org user pool) |
| A-3 | Remove member (hard delete) |
| A-4 | Change role (per role transition matrix) |
| A-5 | Activate / deactivate membership |
| A-6 | Last-owner protection (hard block) |
| A-7 | Membership audit events (5 event types via outbox) |
| A-8 | Store-level authorization for membership operations |

### Part B — Product Studio Production Hardening

| ID | Capability |
|----|-----------|
| B-1 | Create-flow unsaved-change protection (beforeunload) |
| B-2 | Media upload UI (file upload via presigned URL) |
| B-3 | Media reorder UI (drag or button reorder) |
| B-4 | Media delete UI (with confirmation) |
| B-5 | Merchant catalog → Product Studio edit navigation |
| B-6 | Browser verification of create flow |
| B-7 | Browser verification of edit flow |

### Part C — Security Consistency

| ID | Capability |
|----|-----------|
| C-1 | Import endpoints require `assertStoreMember` |
| C-2 | Export endpoint requires `assertStoreMember` |
| C-3 | Offer creation requires `assertStoreMember` |

No other scope is authorized for P7.

---

## 3. P6 Baseline

```
P6 = CLOSED / PASS WITH CONDITIONS
Latest migration: 0054_store_members.sql
Migration 0055: DOES NOT EXIST
```

**P6 authorization chain (authoritative):**

```
JWT → Permission → Organization authorization → Store membership → Operation
```

**P6 helpers (authoritative, in `tenant-scope.ts`):**

| Helper | Purpose |
|--------|---------|
| `assertStoreInOrg` | Store belongs to caller's org |
| `assertProductInOrg` | Product → store → org chain |
| `assertVariantInOrg` | Variant → product → store → org chain |
| `assertStoreMember` | Caller is ACTIVE member of store |
| `assertProductEditableByMerchant` | Combined org + membership for product edits |

**Privileged bypass roles:** `SUPER_ADMIN`, `ADMIN`, `MODERATOR`

**Key invariants preserved from P6:**

- Organization membership ≠ store membership
- Merchant offer ownership ≠ canonical product ownership
- JWT must NOT carry a trusted storeId
- All tenant checks are fail-closed

---

## 4. Business Decision BD-P7-01 — Who Can Manage Store Memberships

**Decision: Option B — Store owners + organization admins**

Store OWNERs are the natural managers of their store's membership. Organization admins retain full cross-store oversight. SUPER_ADMIN retains platform-level access.

```
MEMBERSHIP MANAGEMENT ACTORS: SUPER_ADMIN, ADMIN, STORE OWNER (with constraints)
```

**Authorization matrix:**

| Actor | View | Add | Remove | Role Change | Activate | Deactivate |
|-------|------|-----|--------|-------------|----------|------------|
| SUPER_ADMIN | YES | YES | YES | YES | YES | YES |
| ADMIN (org-level) | YES | YES | YES | YES | YES | YES |
| STORE OWNER | Own store | Own store | Own store | Own store | Own store | Own store |
| STORE ADMIN | Own store | Own store (not OWNER) | Own store (not OWNER/ADMIN) | MEMBER only | Own store (not OWNER) | Own store (not OWNER) |
| MEMBER | Own store | NO | NO | NO | NO | NO |
| Non-member | NO | NO | NO | NO | NO | NO |

**Constraints:**

- STORE OWNER cannot manage memberships of other stores
- STORE ADMIN cannot add/remove/change role of OWNER or other ADMINs
- STORE ADMIN can only change MEMBER roles
- Same-org cross-store denial: Owner of Store A cannot manage Store B even if both belong to the same org

**Evidence:**

```
File: apps/api/src/common/tenant-scope.ts
Module: tenant-scope
Current behavior: assertStoreMember checks ACTIVE membership for storeId
Impact: Membership management must add role-aware assertions on top of assertStoreMember
Locked decision: Option B with role-granular constraints
```

---

## 5. Business Decision BD-P7-02 — Last Owner Protection

**Decision: HARD BLOCK**

```
LAST OWNER PROTECTION = HARD BLOCK
INVARIANT: Every store must always have >= 1 ACTIVE OWNER
```

**Denied operations:**

- Remove last ACTIVE OWNER → `409 Conflict`
- Deactivate last ACTIVE OWNER → `409 Conflict`
- Demote last ACTIVE OWNER to ADMIN/MEMBER → `409 Conflict`

**Concurrency requirement:** Atomic via `SELECT ... FOR UPDATE` on the store's membership rows before any mutation that could reduce the ACTIVE OWNER count.

```sql
BEGIN
SELECT COUNT(*) FROM store_members
  WHERE store_id = $1 AND role = 'OWNER' AND status = 'ACTIVE'
  FOR UPDATE;
-- if count = 1 and mutation would remove/demote/deactivate → DENY
-- otherwise proceed
COMMIT
```

Two concurrent requests cannot remove or deactivate the final owner.

---

## 6. Business Decision BD-P7-03 — Multi-Store Membership

**Decision: YES**

```
USER MAY BELONG TO MULTIPLE STORES = YES
```

A user may simultaneously hold different roles in different stores within the same organization. The existing schema `UNIQUE(store_id, user_id)` naturally supports this without additional constraints.

**UI behavior:**

- Store selector shows all stores where the user has ACTIVE membership
- Organization admins see all org stores
- SUPER_ADMIN sees all stores
- Inactive memberships do not appear in the selector

---

## 7. Business Decision BD-P7-04 — Membership Changes: Immediate or Approval

**Decision: IMMEDIATE**

```
MEMBERSHIP EFFECTIVE MODEL = IMMEDIATE
```

- Database state becomes authoritative on commit
- Next HTTP request sees the change
- No JWT refresh required
- Authorization remains database-derived (not JWT-cached)
- Preserves P6 behavior exactly

---

## 8. Business Decision BD-P7-05 — Media Ownership Model

**Decision: PRODUCT + VARIANT**

```
P7 MEDIA MODEL = PRODUCT + VARIANT
```

The existing `product_media` schema already supports both:

```
product_media.product_id  (NOT NULL)
product_media.variant_id  (NULLABLE)
```

**Semantics:**

- Product media: `variant_id IS NULL`
- Variant media: `variant_id IS NOT NULL`
- Primary image: lowest `sort_order` within the same parent (product or variant)
- The same physical image URL may be referenced by both product and variant rows
- Authorization follows the product: editing variant media requires `assertProductEditableByMerchant` on the parent product

**P7 UI scope:** Product-level media only in Product Studio. Variant media management is deferred (backend support preserved, no new UI).

---

## 9. Business Decision BD-P7-06 — Import / Export Authorization

**Decision: Store membership required**

```
Import/export require ACTIVE store membership.
```

**Applies to:**

- `POST stores/:storeId/imports` (createImportJob)
- `POST imports/:id/rows` (stageImportRows)
- `POST imports/:id/process` (processImportJob)
- `GET stores/:storeId/products/export` (exportProductsCsv)

**Authorization chain (post-fix):**

```
JWT → merchant:products:write → assertStoreInOrg → assertStoreMember → Operation
```

**Privileged bypass:** SUPER_ADMIN, ADMIN, MODERATOR bypass via `isTenantPrivileged` (existing behavior).

**`storeId = NULL`:** NOT allowed for merchant import/export. Fail-closed with `403`.

**Evidence:**

```
File: apps/api/src/modules/catalog/catalog.controller.ts
Lines: 483-519 (import), 407-412 (export)
Current behavior: RequirePermission('merchant:products:write') but NO assertStoreMember
Impact: Any org member with merchant:products:write can import/export to any store in org
Locked decision: Add assertStoreMember after existing assertStoreInOrg
```

---

## 10. Business Decision BD-P7-07 — Membership Audit Events

**Decision: Option A — Five core events**

```
store_member.added
store_member.removed
store_member.role_changed
store_member.activated
store_member.deactivated
```

**Event payload (written to `outbox_events`):**

```json
{
  "event_type": "store_member.<action>",
  "aggregate_id": "<store_id>",
  "payload": {
    "target_user_id": "<uuid>",
    "actor_user_id": "<uuid>",
    "previous_role": "<role|null>",
    "new_role": "<role|null>",
    "previous_status": "<status|null>",
    "new_status": "<status|null>"
  },
  "metadata": {
    "organization_id": "<org_id>"
  }
}
```

**No invitation workflow.** P7 does not implement `invited` or `accepted` events.

**No outbox schema modification.** The existing `outbox_events` table (event_type VARCHAR(80), aggregate_id UUID, payload JSONB, metadata JSONB) fully supports these events.

---

## 11. Membership Role Matrix

### OWNER

| Permission | Granted |
|-----------|---------|
| Product CRUD | YES |
| Variant management | YES |
| Media management | YES |
| Import/Export | YES |
| Offer creation | YES |
| View members | YES |
| Add member | YES |
| Remove member (not self if last OWNER) | YES |
| Change any role | YES |
| Activate/deactivate | YES |
| Store administration | YES |

### ADMIN

| Permission | Granted |
|-----------|---------|
| Product CRUD | YES |
| Variant management | YES |
| Media management | YES |
| Import/Export | YES |
| Offer creation | YES |
| View members | YES |
| Add member (MEMBER only) | YES |
| Remove MEMBER | YES |
| Remove ADMIN | NO |
| Remove OWNER | NO |
| Change MEMBER role | YES |
| Change ADMIN role | NO |
| Change OWNER role | NO |
| Deactivate MEMBER | YES |
| Deactivate OWNER | NO |
| Deactivate ADMIN | NO |

### MEMBER

| Permission | Granted |
|-----------|---------|
| Product CRUD | YES |
| Variant management | YES |
| Media management | YES |
| Import/Export | YES |
| Offer creation | YES |
| View members | YES (own store) |
| Modify membership | NO |

---

## 12. Membership Lifecycle

### Add Member

1. Actor must have `Add` permission (per matrix)
2. Target user must be in the same organization
3. Target user must not already be a member of the store (UNIQUE constraint)
4. Insert `store_members` row with `status = ACTIVE`
5. Emit `store_member.added` outbox event
6. All in one transaction

### Remove Member

1. Actor must have `Remove` permission
2. Last-owner check: if target is OWNER and is the last ACTIVE OWNER → `409`
3. Delete `store_members` row
4. Emit `store_member.removed` outbox event
5. All in one transaction

### Change Role

1. Actor must have `Role Change` permission for the target role
2. Last-owner check: if demoting last ACTIVE OWNER → `409`
3. Update `role` column + `updated_at`
4. Emit `store_member.role_changed` outbox event
5. All in one transaction

### Activate

1. Actor must have `Activate` permission
2. Update `status = 'ACTIVE'` + `updated_at`
3. Emit `store_member.activated` outbox event
4. All in one transaction

### Deactivate

1. Actor must have `Deactivate` permission
2. Last-owner check: if target is OWNER and is the last ACTIVE OWNER → `409`
3. Update `status = 'INACTIVE'` + `updated_at`
4. Emit `store_member.deactivated` outbox event
5. All in one transaction

---

## 13. Role Transition Matrix

| From → To | OWNER | ADMIN | MEMBER |
|-----------|-------|-------|--------|
| **OWNER** | — | ALLOWED (last-owner check) | ALLOWED (last-owner check) |
| **ADMIN** | ALLOWED (requires OWNER/SUPER_ADMIN) | — | ALLOWED (requires OWNER/SUPER_ADMIN) |
| **MEMBER** | ALLOWED (requires OWNER/SUPER_ADMIN) | ALLOWED (requires OWNER/ADMIN/SUPER_ADMIN) | — |

**Constraints:**

- OWNER → anything: requires last-owner invariant check
- Promoting TO OWNER: only by existing OWNER, org ADMIN, or SUPER_ADMIN
- Promoting TO ADMIN: only by OWNER, org ADMIN, or SUPER_ADMIN
- MEMBER ↔ ADMIN: ADMIN can manage MEMBER; only OWNER can manage ADMIN

---

## 14. Self-Management Rules

| Action | Allowed? | Condition |
|--------|----------|-----------|
| Remove self | YES | Unless last ACTIVE OWNER |
| Deactivate self | YES | Unless last ACTIVE OWNER |
| Change own role | NO | Must be done by another authorized actor |
| Last OWNER self-removal | DENIED | Hard block |
| Last OWNER self-deactivation | DENIED | Hard block |
| OWNER self-demotion | DENIED | Must be done by another OWNER or org ADMIN |

**Rationale:** Preventing self-role-change eliminates the risk of an OWNER accidentally locking themselves out of management capabilities. Another authorized actor must make the change.

---

## 15. Last-Owner Concurrency Rules

All mutations that could reduce the ACTIVE OWNER count to zero must be atomic.

**Required pattern:**

```
BEGIN
  SELECT store_id, role, status FROM store_members
    WHERE store_id = $1 AND role = 'OWNER' AND status = 'ACTIVE'
    FOR UPDATE;

  IF count = 1 AND mutation targets that row:
    ROLLBACK → 409 Conflict

  Perform mutation
  Write outbox event
COMMIT
```

**Race scenarios covered:**

| Scenario | Resolution |
|----------|-----------|
| Concurrent remove × deactivate OWNER | First to acquire FOR UPDATE wins; second sees count = 0 → DENY |
| Concurrent deactivate × role change | First wins; second sees no ACTIVE OWNER → DENY |
| Concurrent role change × remove | First wins; second sees no ACTIVE OWNER → DENY |
| Two admins removing same member | First succeeds; second gets `404 Not Found` (row deleted) |
| Two admins deactivating same OWNER | First succeeds; second either hits last-owner DENY or no-op |
| Last-owner race | Serialized by FOR UPDATE; exactly one succeeds |
| add × remove | Independent; add does not conflict with remove |
| activate × deactivate | Serialized by FOR UPDATE on affected row |

---

## 16. User Selection Rules

```
ALLOWED MEMBER CANDIDATES = Same-organization users only (Option B)
```

**Rules:**

- When adding a member, the selector shows users who belong to the same organization as the store
- Cross-organization user selection is denied
- Users already members of the store are excluded from the selector
- Inactive org members may be shown but flagged
- SUPER_ADMIN may select from any organization's user pool

---

## 17. Store Selection Rules

| Actor | Visible Stores |
|-------|---------------|
| SUPER_ADMIN | All stores |
| ADMIN (org-level) | All stores in their organization |
| STORE OWNER | Stores where they have ACTIVE membership |
| STORE ADMIN | Stores where they have ACTIVE membership |
| MEMBER | Stores where they have ACTIVE membership |

**Management page access:**

- Must be an ACTIVE member of the store to access membership management UI
- Organization admins can manage any store in their organization (bypass via `isTenantPrivileged`)
- SUPER_ADMIN can manage any store
- Inactive members cannot access the management UI for that store
- Store selection is via URL parameter or store selector; never placed into JWT

---

## 18. Import/Export Authorization

**Post-P7 authorization chain:**

```
JWT → merchant:products:write → assertStoreInOrg → assertStoreMember → Operation
```

**Endpoints to patch:**

| Endpoint | Current | Post-P7 |
|----------|---------|---------|
| `POST stores/:storeId/imports` | Permission only | + assertStoreInOrg + assertStoreMember |
| `POST imports/:id/rows` | Permission only | + store membership via import job's storeId |
| `POST imports/:id/process` | Permission only | + store membership via import job's storeId |
| `GET stores/:storeId/products/export` | Permission only | + assertStoreInOrg + assertStoreMember |

**Invariant:**

```
A merchant cannot import into or export from a store
unless the caller is an ACTIVE member of that store.
```

**`storeId = NULL`:** Fail-closed. Merchant import/export requires a valid storeId.

**Privileged bypass:** SUPER_ADMIN, ADMIN, MODERATOR bypass via existing `isTenantPrivileged`.

---

## 19. Offer Authorization

**Post-P7 authorization chain for `POST /merchant/offers`:**

```
JWT → catalog:offers:write → assertStoreInOrg → assertStoreMember → Operation
```

**Current behavior (catalog.offer.controller.ts line 130-137):**

```
assertStoreInOrg(this.db, caller, input.storeId)  // YES
assertStoreMember(this.db, caller, input.storeId)  // MISSING
```

**Fix:** Add `assertStoreMember` after `assertStoreInOrg`.

**Invariant preserved:**

```
offer ownership ≠ canonical product ownership
```

An offer seller must be authorized for the offer's store, but the offer does not need to relate to a product owned by that store.

---

## 20. Product Studio Dirty-State Rules

**Create flow (`/merchant/product-studio`):**

`isDirty = true` when any of:

- Any form field has been modified from initial state
- Media items have been added, removed, or reordered
- Any step has been visited and modified

`isDirty = false` when:

- Successful product creation (review step completes)
- Explicit discard (confirmation dialog → reset state)
- Fresh page load with no modifications

**Trigger warnings:**

| Navigation Type | Warning? |
|----------------|----------|
| Browser refresh | YES (beforeunload) |
| Browser back | YES (beforeunload) |
| Closing tab | YES (beforeunload) |
| Internal navigation (step change) | YES (custom dialog) |
| External navigation (URL change) | YES (beforeunload) |

**No warning when `isDirty = false`.**

**Evidence:**

```
File: apps/web/src/hooks/useProductStudioEdit.ts
Current behavior: beforeunload handler present in edit flow (lines 192-201)
File: apps/web/src/hooks/useProductStudio.ts
Current behavior: NO beforeunload handler in create flow
Impact: Create flow data lost on accidental navigation
Locked decision: Add beforeunload + isDirty to create flow
```

---

## 21. Media UX Rules

### Upload

- **Method:** Presigned PUT URL via `POST media/presign`
- **Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`
- **Maximum file size:** 5 MB per file (backend has no enforced limit; UI enforces)
- **Maximum images:** 20 per product (backend has no enforced limit; UI enforces)
- **Progress:** Show upload progress indicator per file
- **Failure:** Show error message with retry button
- **Retry:** Re-attempt upload of failed file; does not affect other files

### Delete

- **Confirmation:** Required before delete ("Delete this image?")
- **Primary image deletion:** If deleted image is primary, next image (lowest sort_order) becomes primary automatically
- **Last image:** Deletion allowed; product may have zero images

### Reorder

- **Method:** Button-based (↑/↓) in create flow; drag-and-drop optional
- **Persistence:** Reorder calls `POST products/:productId/media/reorder` in edit mode
- **Create mode:** Order stored in local state; persisted on product creation

### Existing Backend Limits

```
File: apps/api/src/modules/catalog/catalog.service.ts
addMedia: No file size validation (accepts fileSize from client)
presignMedia: No MIME type restriction (accepts any mimeType)
Locked decision: UI enforces limits; backend validation deferred
```

---

## 22. Media Ownership Rules

**Product media:** `product_media` rows where `variant_id IS NULL`

**Variant media:** `product_media` rows where `variant_id IS NOT NULL`

**Primary image semantics:** Lowest `sort_order` within the same parent scope (product or variant). No `is_primary` column.

**Authorization:** All media mutations on a product (including variant media) require `assertProductEditableByMerchant` on the parent product.

**Shared images:** The same storage key / URL may appear in both product-level and variant-level media rows. No deduplication required.

---

## 23. Product Studio Navigation Rules

**Flow:**

```
Merchant Catalog (/merchant/catalog)
      ↓
  [Edit button]
      ↓
Product Studio Edit (/merchant/product-studio/:id/edit)
```

**Button specification:**

- **Label:** "Edit"
- **Visibility:** Shown only when the user has `assertProductEditableByMerchant` access
- **Disabled state:** Not disabled; hidden if unauthorized
- **Unauthorized behavior:** Button not rendered
- **Not-found behavior:** Product Studio edit page shows "Product not found"
- **Store mismatch:** If product's storeId doesn't match user's selected store, show "This product belongs to a different store"

---

## 24. Audit Event Contract

**Five event types via `outbox_events`:**

| Event Type | Trigger | Payload Fields |
|-----------|---------|---------------|
| `store_member.added` | Add member | target_user_id, new_role, actor_user_id |
| `store_member.removed` | Remove member | target_user_id, previous_role, actor_user_id |
| `store_member.role_changed` | Change role | target_user_id, previous_role, new_role, actor_user_id |
| `store_member.activated` | Activate | target_user_id, new_status='ACTIVE', actor_user_id |
| `store_member.deactivated` | Deactivate | target_user_id, previous_status='ACTIVE', new_status='INACTIVE', actor_user_id |

**Common metadata:**

```json
{
  "organization_id": "<store's org_id>",
  "store_id": "<store_id>"
}
```

**No outbox schema modification required.** The existing `outbox_events` table supports all fields via `payload` and `metadata` JSONB columns.

---

## 25. Transactional Guarantees

**Invariant:**

```
membership state change + audit/outbox event = ATOMIC
```

- If the membership mutation fails → no outbox event is written
- If the outbox event cannot be persisted → the membership mutation does NOT commit
- Both succeed or both fail within a single database transaction

**Pattern:**

```sql
BEGIN
  -- Lock and validate
  SELECT ... FOR UPDATE
  -- Perform mutation
  UPDATE/INSERT/DELETE store_members
  -- Write outbox event
  INSERT INTO outbox_events (...)
COMMIT
```

---

## 26. Tenant Isolation Rules

**Preserved invariants:**

```
Store A in Org A  →  accessible only by Org A members
Store B in Org A  →  accessible only by Org A members
Store C in Org B  →  NOT accessible by Org A members
```

- A user authorized for Store A does NOT gain access to Store B merely because both belong to the same organization
- Store membership is per-store, not per-org
- Cross-organization access: always denied
- Privileged roles (SUPER_ADMIN, ADMIN, MODERATOR): intentional bypass only

---

## 27. Migration 0055 Decision

```
MIGRATION 0055 = NOT REQUIRED
```

**Justification:**

The existing `store_members` table (migration 0054) provides all columns needed:

| Requirement | Existing Column |
|------------|----------------|
| Store membership | `store_id`, `user_id` |
| Role | `role` (OWNER/ADMIN/MEMBER) |
| Status | `status` (ACTIVE/INACTIVE) |
| Uniqueness | `uq_store_members_store_user` |
| Timestamps | `created_at`, `updated_at` |

Audit events use the existing `outbox_events` table. Audit trail entries use the existing `audit_logs` table. No new columns, indexes, or tables are required.

---

## 28. P7 Acceptance Criteria

### Membership

| ID | Criterion | Verification |
|----|-----------|-------------|
| P7-A01 | View members lists all ACTIVE/INACTIVE members with roles | API + UI test |
| P7-A02 | Add member creates ACTIVE membership for org user | API + UI test |
| P7-A03 | Remove member deletes row; emits `store_member.removed` | API test |
| P7-A04 | Change role updates role; emits `store_member.role_changed` | API test |
| P7-A05 | Activate/deactivate toggles status; emits event | API test |
| P7-A06 | Last-owner protection blocks final OWNER removal/deactivation/demotion with 409 | API test |
| P7-A07 | All 5 audit events written to outbox_events atomically | API test |
| P7-A08 | Membership operations require appropriate role (per matrix) | API test |
| P7-A09 | User can belong to multiple stores simultaneously | API test |
| P7-A10 | Self-removal/deactivation allowed unless last OWNER; self-role-change denied | API test |

### Security

| ID | Criterion | Verification |
|----|-----------|-------------|
| P7-S01 | Import endpoints reject non-members with 403 | API test |
| P7-S02 | Export endpoint rejects non-members with 403 | API test |
| P7-S03 | Offer creation rejects non-members with 403 | API test |
| P7-S04 | Same-org cross-store membership denied | API test |
| P7-S05 | Cross-org access denied | API test |
| P7-S06 | INACTIVE membership denied for all store operations | API test |
| P7-S07 | SUPER_ADMIN/ADMIN/MODERATOR bypass membership checks | API test |
| P7-S08 | storeId=NULL fails closed with 403 for merchant import/export | API test |

### Product Studio

| ID | Criterion | Verification |
|----|-----------|-------------|
| P7-B01 | Create flow triggers beforeunload when isDirty=true | Browser test |
| P7-B02 | Media upload via presigned URL works in create flow | Browser test |
| P7-B03 | Media upload via presigned URL works in edit flow | Browser test |
| P7-B04 | Media delete with confirmation works in create flow | Browser test |
| P7-B05 | Media delete with confirmation works in edit flow | Browser test |
| P7-B06 | Media reorder persists in create flow | Browser test |
| P7-B07 | Media reorder persists in edit flow | Browser test |
| P7-B08 | Catalog list has Edit button → Product Studio edit | Browser test |
| P7-B09 | Full create flow verified end-to-end in browser | Browser test |
| P7-B10 | Full edit flow verified end-to-end in browser | Browser test |

### Concurrency

| ID | Criterion | Verification |
|----|-----------|-------------|
| P7-C01 | Concurrent last-owner removal: exactly one succeeds, other gets 409 | Integration test |
| P7-C02 | Concurrent last-owner deactivation: exactly one succeeds | Integration test |
| P7-C03 | Concurrent role changes on same member: serialized correctly | Integration test |
| P7-C04 | Concurrent membership removal: no duplicate events | Integration test |
| P7-C05 | Concurrent import authorization: consistent results | Integration test |
| P7-C06 | Concurrent offer authorization: consistent results | Integration test |

---

## 29. Out-of-Scope Items

The following are explicitly excluded from P7:

```
REVIEW/PENDING_APPROVAL workflow
Import chunking
Import resumability
XLSX import
Typed attribute import/export
GTIN dedup UI
Admin product list redesign
Bulk moderation
Search price filters
Search availability filters
Performance optimization
Full Arabic/RTL redesign
Manufacturer entity
Category path correction
Media orphan cleanup
Media duplicate detection
New marketplace search
Payment/refund/returns
Variant media UI (backend support preserved)
Drag-and-drop media (button-based is sufficient)
Invitation workflow
```

These items remain deferred for future milestones.

---

## 30. Implementation Phase Plan

| Phase | Name | Description | Est. Duration |
|-------|------|-------------|--------------|
| 1 | Security Patch | Add `assertStoreMember` to import/export/offer endpoints | 0.5 day |
| 2 | Membership Backend | CRUD service, controller, authorization helpers | 2 days |
| 3 | Membership Concurrency + Security Verification | FOR UPDATE locking, last-owner invariant, integration tests | 1 day |
| 4 | Membership Admin UI | View/add/remove/role-change/activate/deactivate UI | 2 days |
| 5 | Product Studio Create Hardening | beforeunload + isDirty in create flow | 0.5 day |
| 6 | Product Studio Media UX | File upload, delete, reorder in create + edit | 1.5 days |
| 7 | Browser E2E Verification | Create flow + edit flow end-to-end browser tests | 1 day |
| 8 | Independent Runtime Verification | Full regression + acceptance criteria verification | 1 day |
| 9 | Release Closure | P7 closure report | 0.5 day |

**Total estimated: 10 days**

---

## 31. Risks

| ID | Risk | Severity | Mitigation |
|----|------|----------|-----------|
| R-1 | Last-owner edge case with concurrent self-removal | HIGH | FOR UPDATE serialization; comprehensive integration tests |
| R-2 | Import job storeId resolution for stage/process endpoints | MEDIUM | stageImportRows/processImportJob must resolve storeId from import job record |
| R-3 | Presigned URL accepts any MIME type | LOW | UI enforces MIME; backend validation deferred to post-P7 |
| R-4 | Media file size not validated server-side | LOW | UI enforces 5MB limit; backend validation deferred |
| R-5 | Existing stores without any OWNER after backfill | MEDIUM | Migration 0054 backfill ensures at least one OWNER per store; verify before P7 start |

---

## 32. Final Architecture Gate

```
P7 BUSINESS DECISIONS:
BD-P7-01 = LOCKED — Store owners + organization admins manage memberships
BD-P7-02 = LOCKED — Hard block last-owner protection
BD-P7-03 = LOCKED — Multi-store membership allowed
BD-P7-04 = LOCKED — Immediate effect (no approval workflow)
BD-P7-05 = LOCKED — Product + variant media (product UI only in P7)
BD-P7-06 = LOCKED — Import/export require store membership
BD-P7-07 = LOCKED — Five core audit events via outbox

MIGRATION 0055:
NOT REQUIRED

P7 BUSINESS RULES:
LOCKED

P7 ARCHITECTURE:
GO
```

All seven business decisions have been explicitly resolved. No unresolved decisions remain. Implementation may proceed.

---

## Final Summary

```
P6 STATUS:
CLOSED / PASS WITH CONDITIONS

NEXT MILESTONE:
P7 — Store Membership Management & Product Studio Production Hardening

BUSINESS DECISIONS:
BD-P7-01 = Store owners + organization admins manage memberships
BD-P7-02 = Hard block last-owner protection
BD-P7-03 = Multi-store membership allowed
BD-P7-04 = Immediate effect
BD-P7-05 = Product + variant media (product UI only)
BD-P7-06 = Import/export require store membership
BD-P7-07 = Five core audit events via outbox

MIGRATION 0055:
NOT REQUIRED

P7 BUSINESS RULES:
LOCKED

P7 ARCHITECTURE:
GO

NEXT GATE:
P7 IMPLEMENTATION
```
