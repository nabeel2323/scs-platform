# SCS Platform — Phase 4 Product Management
## P6 — Store-Level Authorization Architecture & Business Rules Decision Lock

| Field | Value |
|-------|-------|
| **Document Type** | Architecture & Business Rules Decision Lock |
| **Phase** | Phase 4 — Product Management |
| **Milestone** | P6 — Merchant Product Studio Edit Mode |
| **Status** | **GO WITH CONDITIONS** |
| **Predecessor** | P6 Remediation Report (BLOCKED) |
| **Branch** | develop |
| **HEAD** | 61990f1 |
| **Latest Migration** | 0053_attribute_backfill.sql |
| **Migration 0054** | DOES NOT EXIST (conceptual design in §18) |
| **Decision Date** | 2026-10-05 |

---

## 1. Executive Summary

This document resolves the architectural impasse discovered during P6 Independent Runtime Verification and documented in the P6 Remediation Report (verdict: BLOCKED).

**The Defect:** `assertProductInOrg` validates organization membership only. A merchant from Store B (Org X) can edit Store A's products (Org X) because both stores share the same organization. The P6 business rule BD-P6-01 requires store-level authorization, but no user-to-store membership relationship exists in the schema.

**The Finding:** After exhaustive inspection of the entire repository — all schema files, migrations 0001–0053, all controllers, services, guards, seed data, frontend code, and mobile app code — **no user-to-store membership relationship exists**. The platform's authorization model is purely organization-level.

**The Decision:** Introduce a `store_members` table via migration 0054 to establish explicit user-to-store membership. This is the only architecturally sound path to satisfy BD-P6-01 without inventing incorrect proxies.

**Key Design Decisions:**
- `store_members` with roles: OWNER, ADMIN, MEMBER
- Server-side authorization only — JWT does NOT carry storeId
- Existing `assertStoreInOrg`/`assertProductInOrg` remain for org-level tenant isolation
- New `assertStoreMember` helper for store-level Product Studio authorization
- Backfill via store creation audit trail + administrative assignment
- Admin/moderator bypass preserved
- Fail-closed: unassigned stores deny merchant access until assigned

**Gate Verdict:** **GO WITH CONDITIONS** — all architecture decisions are resolved; migration 0054 is approved in principle; implementation is deferred to the next gate.

---

## 2. Baseline

| Item | Value |
|------|-------|
| Branch | develop |
| HEAD | 61990f1 |
| Working tree | P6 implementation changes (modified + untracked) |
| Latest migration | 0053_attribute_backfill.sql |
| Migration 0054 | DOES NOT EXIST |
| P6 status | BLOCKED (DEFECT-01 HIGH) |
| DEFECT-01 | Same-org-different-store access permitted |
| Cross-org access | Correctly denied |
| P6 Implementation | Complete (code in working tree) |
| P6 Independent Verification | PASS WITH CONDITIONS (31 PASS, 3 CONDITION) |
| P6 Remediation Report | BLOCKED (schema insufficient) |

---

## 3. Current Authorization Architecture

### 3.1 Authentication Flow

```
User → POST /auth/otp/verify → JWT minted
  JWT payload: { sub, activeOrg, role, perms[], sid?, jti?, iat, exp }
```

The JWT carries **org-level** context only. No store information.

### 3.2 Authorization Layers

| Layer | Mechanism | Scope |
|-------|-----------|-------|
| **JwtAuthGuard** | Validates JWT signature + expiry | Request |
| **PermissionsGuard** | Checks `perms[]` from JWT | Org-level |
| **ActiveOrgGuard** | Validates `activeOrg` is set | Org-level |
| **tenant-scope helpers** | `assertStoreInOrg`, `assertProductInOrg`, etc. | Org-level |

### 3.3 Tenant-Scope Helpers (tenant-scope.ts)

```
isTenantPrivileged(caller) → bypass for SUPER_ADMIN, ADMIN, MODERATOR
storeOrgId(db, storeId) → store.orgId
assertStoreInOrg(db, caller, storeId) → store.orgId === caller.activeOrg
assertProductInOrg(db, caller, productId) → product.storeId → assertStoreInOrg
assertVariantInOrg(db, caller, variantId) → variant → product → assertStoreInOrg
assertWarehouseInOrg(db, caller, warehouseId) → warehouse.storeId → assertStoreInOrg
assertInventoryItemInOrg(db, caller, itemId) → item.warehouse → assertStoreInOrg
assertOrderAccessible(db, caller, order) → buyer check OR store.orgId check
```

**All helpers are org-level.** None verify user-to-store membership.

### 3.4 Bypass Roles

```typescript
const BYPASS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'];
```

These roles skip all tenant-scope checks. This is correct and must be preserved.

### 3.5 Permission Model

| Role | Permissions | Store-Level Scope? |
|------|-------------|-------------------|
| SUPER_ADMIN | 51 (all) | No — bypasses all checks |
| ADMIN | 36 | No — bypasses all checks |
| MODERATOR | 20 | No — bypasses all checks |
| MERCHANT_OWNER | 32 | No — org-level only |
| MERCHANT_STAFF | 26 | No — org-level only |
| BUYER | 6 | N/A |
| DRIVER | 14 | N/A |

**Critical observation:** MERCHANT_OWNER has `merchant:stores:write` (can create/manage stores) while MERCHANT_STAFF does not. But neither role specifies WHICH stores they can access.

---

## 4. Current Data Model

### 4.1 Identity Schema

```
users (id, phone, email, fullName, status)
organizations (id, type, name, country, inviteCode, isActive)
roles (id, key, name)
permissions (id, key)
role_permissions (roleId, permissionId)
organization_members (id, orgId, userId, roleId, status)
```

### 4.2 Merchant Schema

```
stores (id, orgId, slug, displayName, status, verificationStatus)
warehouses (id, storeId, name)
business_documents (id, orgId, storeId, ...)
verification_requests (id, storeId, orgId, ...)
```

### 4.3 Catalog Schema

```
products (id, storeId, categoryId, brandId, title, slug, ...)
product_variants (id, productId, ...)
product_media (id, productId, ...)
product_attribute_values (productId, attributeId, ...)
variant_attribute_values (variantId, attributeId, ...)
```

### 4.4 Offer Schema (separate from product ownership)

```
merchant_offers (id, productId, storeId, proposedBy, ...)
```

### 4.5 Existing User-to-Store Patterns

```
driver_store_assignments (driverProfileId, storeId) — driver↔store assignment
```

**This is the only existing user-to-store relationship in the entire platform.** It proves the architecture supports user-to-store assignment patterns — just not for merchants yet.

### 4.6 What Does NOT Exist

| Searched For | Result |
|-------------|--------|
| `store_members` table | NOT FOUND |
| `store_member` entity | NOT FOUND |
| `store_owner` column | NOT FOUND |
| `stores.createdBy` | NOT FOUND |
| `products.createdBy` | NOT FOUND |
| `activeStore` in JWT | NOT FOUND |
| `currentStore` in backend | NOT FOUND |
| `merchant_user` assignment | NOT FOUND |
| Store-level role assignment | NOT FOUND |
| Any migration with store membership | NOT FOUND (0001–0053) |

---

## 5. Store Ownership Model

### 5.1 Current Model: Organizational

The platform's actual business model is:

```
Organization
├── Store A (orgId → Organization)
├── Store B (orgId → Organization)
└── Members
    ├── User X (MERCHANT_OWNER)
    └── User Y (MERCHANT_STAFF)
```

**All members can access all stores in their organization.** There is no store-level differentiation.

### 5.2 Evidence

1. **Store creation** (`merchant.service.ts:43-99`): Checks org membership, creates store with `orgId`. No `createdBy` or `ownerId` stored.
2. **Store listing** (`merchant.controller.ts:73-105`): Returns ALL stores in the caller's org.
3. **Frontend** (`useProductStudio.ts:87-97`): Calls `fetchMyStores()`, defaults to first store.
4. **Mobile** (`providers.ts:142-147`): "For a merchant JWT (with activeOrg), GET /v1/stores returns their own org's stores."
5. **Seed data**: Creates org members with MERCHANT_OWNER/MERCHANT_STAFF roles, no store assignment.

### 5.3 Model Classification

| Model | Status |
|-------|--------|
| A. One merchant owns one store | **NO** — multiple users per org |
| B. Multiple users manage one store | **YES** — all org members access all stores |
| C. One user manages multiple stores | **YES** — org members access all org stores |
| D. Store ownership is organizational | **YES** — currently org-level |
| E. Store membership exists indirectly | **NO** — no indirect relationship found |
| F. Hybrid | **TRANSITIONING** — org-level now, needs store-level |

**Conclusion:** The current model is (D) organizational ownership with (B) and (C) multi-user/multi-store access. This is insufficient for the P6 business rule.

---

## 6. Security Defect

### 6.1 DEFECT-01 — Same-Organization-Different-Store Access

```
Organization X
├── Store A
│    └── Product P (storeId = Store A)
└── Store B
     └── Merchant B (org member of Org X)

Merchant B → PATCH /products/P
  → PermissionsGuard: has merchant:products:write ✓
  → assertProductInOrg: product.storeId = Store A
  → assertStoreInOrg: Store A.orgId = Org X = caller.activeOrg ✓
  → ALLOWED ✗ (should be DENIED)
```

### 6.2 Root Cause

`assertStoreInOrg` checks `store.orgId === caller.activeOrg`. This is org-level, not store-level. Two stores in the same org both pass.

### 6.3 Affected Endpoints

All 11 P6 Product Studio mutation/read endpoints use `assertProductInOrg` or `assertVariantInOrg`, which delegate to `assertStoreInOrg`. All are vulnerable.

---

## 7. Architecture Options

### 7.1 Decision Table

| Criterion | Option A: `store_members` | Option B: Org-level (status quo) | Option C: Existing proxy |
|-----------|--------------------------|----------------------------------|--------------------------|
| **Security** | Strong — explicit store-level | Weak — same-org-different-store permitted | Weak — proxies are unreliable |
| **Correctness** | Correct — matches BD-P6-01 | Incorrect — violates BD-P6-01 | Incorrect — offer ≠ ownership |
| **Scalability** | High — supports multi-store future | Low — cannot differentiate stores | N/A |
| **Migration cost** | Medium — new table + backfill | None | None |
| **Implementation cost** | Medium — new helper + endpoint changes | None | Low but incorrect |
| **Compatibility** | High — preserves org-level for non-Product-Studio | Full | Partial |
| **Future multi-store** | Full support | No support | No support |
| **Risk** | Low — follows `driver_store_assignments` precedent | High — security defect remains | High — incorrect semantics |

### 7.2 Option A — `store_members` Table (RECOMMENDED)

**Pros:**
- Correctly implements BD-P6-01
- Follows existing `driver_store_assignments` pattern
- Supports future multi-store scenarios
- Clean separation of concerns
- Scalable

**Cons:**
- Requires migration 0054
- Requires backfill strategy
- New management API needed (future phase)

### 7.3 Option B — Org-Level Status Quo (REJECTED)

**Pros:**
- No migration required
- No code changes

**Cons:**
- DEFECT-01 remains unfixed
- Violates P6 business rule BD-P6-01
- Security defect persists
- P6 cannot be closed

### 7.4 Option C — Existing Proxy (REJECTED)

Attempted proxies:
- `merchant_offers.storeId` — explicitly rejected: "offer ownership ≠ product ownership"
- `import_jobs.createdBy` — weak proxy, import ≠ edit authorization
- Single org member assumption — invents ownership model
- Role-based store assignment — roles are org-level, not store-level

**All proxies rejected.**

### 7.5 Explicit Recommendation

**Option A — `store_members` table.**

This is the only architecturally sound path. The platform already has a precedent (`driver_store_assignments`), the schema gap is confirmed, and no existing proxy is correct.

---

## 8. Recommended Architecture

### 8.1 Authorization Flow (After Remediation)

```
Request → PATCH /products/:id
  ↓
JwtAuthGuard → validate JWT
  ↓
PermissionsGuard → check merchant:products:write
  ↓
assertProductInOrg → product.storeId → store.orgId === caller.activeOrg  [ORG CHECK — preserved]
  ↓
assertStoreMember → store_members(storeId, caller.sub, ACTIVE)  [NEW STORE CHECK]
  ↓
ALLOW / DENY
```

### 8.2 Helper Architecture

| Helper | Purpose | Change? |
|--------|---------|---------|
| `assertStoreInOrg` | Org-level tenant isolation | **UNCHANGED** — used by non-Product-Studio paths |
| `assertProductInOrg` | Product → org check | **UNCHANGED** — used by general catalog paths |
| `assertVariantInOrg` | Variant → org check | **UNCHANGED** — used by general catalog paths |
| `assertStoreMember` | **NEW** — store-level membership check | **NEW** — Product Studio only |
| `assertProductEditableByMerchant` | **NEW** — combines org + store check | **NEW** — Product Studio convenience |

**Rationale:** Existing helpers remain for general tenant isolation. New helpers are added specifically for Product Studio store-level authorization. This avoids breaking existing org-level authorization in non-Product-Studio paths (offers, orders, inventory, etc.).

### 8.3 Why Not Strengthen `assertStoreInOrg` Globally?

Strengthening `assertStoreInOrg` globally would break:
- Offer creation (`catalog.offer.controller.ts` uses `assertStoreInOrg`)
- Order access (`assertOrderAccessible` delegates to `storeOrgId`)
- Inventory management (`assertWarehouseInOrg` delegates to `assertStoreInOrg`)
- Shipping management

These paths currently rely on org-level access. Changing them would be a platform-wide authorization redesign, which is explicitly out of scope.

---

## 9. Store Membership Model

### 9.1 `store_members` Table Design

```sql
CREATE TABLE store_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        VARCHAR(16) NOT NULL DEFAULT 'MEMBER',
  status      VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_store_members_store_user UNIQUE (store_id, user_id),
  CONSTRAINT ck_store_members_role CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
  CONSTRAINT ck_store_members_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE INDEX idx_store_members_store ON store_members(store_id);
CREATE INDEX idx_store_members_user ON store_members(user_id);
CREATE INDEX idx_store_members_store_active ON store_members(store_id, status) WHERE status = 'ACTIVE';
```

### 9.2 Constraints

| Constraint | Purpose |
|-----------|---------|
| `UNIQUE(store_id, user_id)` | One membership per user per store |
| `FK store_id → stores(id) CASCADE` | Remove memberships when store deleted |
| `FK user_id → users(id) CASCADE` | Remove memberships when user deleted |
| `CHECK role IN ('OWNER', 'ADMIN', 'MEMBER')` | Valid roles only |
| `CHECK status IN ('ACTIVE', 'INACTIVE')` | Valid statuses only |

---

## 10. Role Model

### 10.1 Store Roles

| Role | Permissions | Can Manage Members? | Can Edit Products? | Can Manage Store Settings? |
|------|-------------|--------------------|--------------------|---------------------------|
| **OWNER** | Full store access | Yes | Yes | Yes |
| **ADMIN** | Full store access | Yes (add/remove MEMBER) | Yes | No |
| **MEMBER** | Product editing | No | Yes | No |

### 10.2 Relationship to Platform Roles

| Platform Role | Store Role | Bypass Store Membership? |
|---------------|------------|--------------------------|
| SUPER_ADMIN | N/A | Yes |
| ADMIN | N/A | Yes |
| MODERATOR | N/A | Yes |
| MERCHANT_OWNER | OWNER or ADMIN | No — must be store member |
| MERCHANT_STAFF | MEMBER | No — must be store member |
| BUYER | N/A | N/A — no store access |

### 10.3 Answers to §4 Questions

| # | Question | Answer |
|---|----------|--------|
| 1 | Can a user belong to multiple stores? | **YES** — multiple `store_members` rows |
| 2 | Can a store have multiple users? | **YES** — multiple `store_members` rows |
| 3 | Must every store have exactly one OWNER? | **YES** — enforced by last-owner protection |
| 4 | Can a store have multiple OWNERs? | **YES** — but at least one must remain |
| 5 | Can OWNER be transferred? | **YES** — via ownership transfer operation |
| 6 | Who can add members? | **OWNER or ADMIN** of the store |
| 7 | Who can remove members? | **OWNER or ADMIN** (cannot remove last OWNER) |
| 8 | Can ADMIN manage members? | **YES** — can add/remove MEMBERs, not OWNERs |
| 9 | Can MEMBER edit products? | **YES** — if they have `merchant:products:write` |
| 10 | Are membership changes audited? | **YES** — via outbox events |
| 11 | Can org ADMIN bypass store membership? | **NO** — MERCHANT_OWNER must be store member |
| 12 | Can SUPER_ADMIN bypass store membership? | **YES** — bypass role |
| 13 | Can MODERATOR bypass store membership? | **YES** — bypass role |
| 14 | Can a merchant belong to multiple orgs? | **YES** — via `organization_members` |
| 15 | How is active store selected? | **Client-side** — store picker UI |
| 16 | Should active store be in JWT? | **NO** — server-side derivation is safer |
| 17 | Server-side or JWT authorization? | **Server-side** — always derive from DB |

---

## 11. Membership Lifecycle

### 11.1 Creation

```
Store created → initial OWNER assigned (from backfill or creation flow)
OWNER/ADMIN invites user → store_members row created with status ACTIVE
```

### 11.2 Modification

```
OWNER/ADMIN changes role → store_members.role updated → audit event
```

### 11.3 Deactivation

```
OWNER/ADMIN deactivates member → store_members.status = 'INACTIVE'
  → member can no longer access store
  → row preserved for audit trail
```

### 11.4 Last-Owner Protection

```
Attempt to remove/deactivate/transfer last OWNER → DENIED
Error: "Cannot remove the last owner of a store"
```

### 11.5 Self-Removal

```
OWNER can leave store ONLY if another OWNER exists
ADMIN/MEMBER can leave store at any time
```

---

## 12. Backfill Strategy

### 12.1 Challenge

Existing stores have no creator/owner field. We cannot reliably determine who created each store from the current schema.

### 12.2 Available Evidence

| Source | Reliability | Notes |
|--------|-------------|-------|
| `outbox_events` for `merchant.store.created` | **HIGH** | Contains `userId` from store creation |
| `organization_members` with MERCHANT_OWNER role | **MEDIUM** | Org owner is likely store owner |
| `merchant_offers` with `storeId` | **LOW** | Offer ≠ ownership |
| `import_jobs.createdBy` | **LOW** | Importer ≠ owner |

### 12.3 Recommended Backfill Strategy

**Phase 1: Outbox-based backfill (authoritative)**

```sql
-- For stores with outbox events, use the creator as OWNER
INSERT INTO store_members (store_id, user_id, role, status)
SELECT
  e.aggregate_id AS store_id,
  (e.metadata->>'userId')::uuid AS user_id,
  'OWNER' AS role,
  'ACTIVE' AS status
FROM outbox_events e
WHERE e.event_type = 'merchant.store.created'
  AND e.metadata->>'userId' IS NOT NULL
ON CONFLICT (store_id, user_id) DO NOTHING;
```

**Phase 2: Org-owner fallback (for stores without outbox events)**

```sql
-- For stores without outbox events, assign org MERCHANT_OWNER as OWNER
-- If multiple org members have MERCHANT_OWNER role, assign the first one
INSERT INTO store_members (store_id, user_id, role, status)
SELECT DISTINCT ON (s.id)
  s.id AS store_id,
  om.user_id,
  'OWNER' AS role,
  'ACTIVE' AS status
FROM stores s
JOIN organization_members om ON om.org_id = s.org_id
JOIN roles r ON r.id = om.role_id AND r.key = 'MERCHANT_OWNER'
WHERE om.status = 'ACTIVE'
  AND s.id NOT IN (SELECT store_id FROM store_members)
ORDER BY s.id, om.created_at ASC;
```

**Phase 3: Fail-closed for unassigned stores**

```sql
-- Stores still without members remain inaccessible to merchants
-- Admin can manually assign members through future management API
-- SUPER_ADMIN/ADMIN/MODERATOR bypass still works
```

### 12.4 What We Will NOT Do

- Silently assign every org member to every store
- Use `merchant_offers` as ownership proof
- Invent arbitrary ownership assignments

---

## 13. Authorization Matrix

### 13.1 Product Studio Mutation Endpoints

| Actor | Product Edit | Attribute Update | Variant Create | Variant Edit | Media Add | Media Delete |
|-------|-------------|-----------------|---------------|-------------|-----------|-------------|
| Store A OWNER | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| Store A ADMIN | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| Store A MEMBER | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| Store B OWNER | DENY | DENY | DENY | DENY | DENY | DENY |
| Store B ADMIN | DENY | DENY | DENY | DENY | DENY | DENY |
| Store B MEMBER | DENY | DENY | DENY | DENY | DENY | DENY |
| Same-org non-member | DENY | DENY | DENY | DENY | DENY | DENY |
| Other-org merchant | DENY | DENY | DENY | DENY | DENY | DENY |
| Offer owner (different store) | DENY | DENY | DENY | DENY | DENY | DENY |
| MODERATOR | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| ADMIN | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| SUPER_ADMIN | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |

### 13.2 Product Studio Read Endpoints

| Actor | Read Product | Read Attributes | Read Variants |
|-------|-------------|----------------|--------------|
| Store A member (any role) | ALLOW | ALLOW | ALLOW |
| Store B member | DENY | DENY | DENY |
| Same-org non-member | DENY | DENY | DENY |
| Other-org merchant | DENY | DENY | DENY |
| MODERATOR | ALLOW | ALLOW | ALLOW |
| ADMIN | ALLOW | ALLOW | ALLOW |
| SUPER_ADMIN | ALLOW | ALLOW | ALLOW |

### 13.3 storeId = NULL

| Actor | Edit | Read |
|-------|------|------|
| Any merchant | DENY | Public read only |
| MODERATOR | ALLOW | ALLOW |
| ADMIN | ALLOW | ALLOW |
| SUPER_ADMIN | ALLOW | ALLOW |

---

## 14. JWT / CallerContext Decision

### 14.1 Decision: Do NOT Add storeId to JWT

**Rationale:**
1. Users may belong to multiple stores — which store goes in the JWT?
2. Membership can change — JWT becomes stale
3. Authorization must be authoritative — server-side DB check is authoritative
4. Privilege changes must take effect immediately — JWT expiry delay is unacceptable
5. Multi-tab/multi-store behavior — different tabs may target different stores

### 14.2 Recommended Architecture

```
Client → request with JWT (sub, activeOrg, role, perms)
  ↓
Server → extract sub from JWT
  ↓
Server → query store_members(storeId, sub, ACTIVE)
  ↓
Server → authorize or deny
```

**Store context is always derived server-side from current database state.**

### 14.3 CallerContext

The existing `CallerContext` interface remains unchanged:

```typescript
interface CallerContext {
  sub: string;
  role?: string | null;
  activeOrg?: string | null;
}
```

No `storeId` or `storeIds` field added.

---

## 15. Product Studio Impact

### 15.1 Affected Endpoints

| Endpoint | Current Auth | New Auth | Change |
|----------|-------------|----------|--------|
| `PATCH /products/:id` | `assertProductInOrg` | + `assertStoreMember` | Add store check |
| `PUT /products/:id/attribute-values` | `assertProductInOrg` | + `assertStoreMember` | Add store check |
| `POST /products/:productId/variants` | `assertProductInOrg` | + `assertStoreMember` | Add store check |
| `PATCH /products/:productId/variants/:variantId` | `assertProductInOrg` | + `assertStoreMember` | Add store check |
| `PUT /products/:productId/variants/:variantId/attribute-values` | `assertProductInOrg` | + `assertStoreMember` | Add store check |
| `POST /products/:id/variants/bulk` | `assertProductInOrg` | + `assertStoreMember` | Add store check |
| `POST /products/:id/media` | `assertProductInOrg` | + `assertStoreMember` | Add store check |
| `DELETE /products/:id/media/:mediaId` | `assertProductInOrg` | + `assertStoreMember` | Add store check |
| `POST /products/:id/media/reorder` | `assertProductInOrg` | + `assertStoreMember` | Add store check |
| `GET /products/:id/attribute-values` | `assertProductInOrg` | + `assertStoreMember` | Add store check |
| `GET /products/:productId/variants/:variantId/attribute-values` | `assertProductInOrg` | + `assertStoreMember` | Add store check |

### 15.2 Non-Product-Studio Endpoints (UNCHANGED)

| Endpoint | Auth | Change? |
|----------|------|---------|
| `POST /merchant/offers` | `assertStoreInOrg` | **NO** |
| `PATCH /merchant/offers/:id/pricing` | `assertStoreInOrg` | **NO** |
| `POST /stores/:storeId/imports` | `assertStoreInOrg` (future) | **NO** |
| `GET /stores/:storeId/products` | None (public) | **NO** |
| Warehouse/inventory endpoints | `assertWarehouseInOrg` | **NO** |

### 15.3 Product Create Flow

Product create (`POST /products`) currently takes `storeId` from the request body. After remediation, the create flow must also verify store membership:

```
POST /products → PermissionsGuard → assertStoreMember(storeId from body) → create
```

---

## 16. Import Impact

Import endpoints (`POST /stores/:storeId/imports`) currently use `assertStoreInOrg` (or no tenant check). After remediation:

- Import job creation should verify store membership
- Import row processing should verify store membership
- This is a **future-phase concern**, not P6 scope

---

## 17. Future Phase Impact

| Phase | Dependency | Impact |
|-------|-----------|--------|
| P7 — Merchant Variant Management | Store membership | Must use `assertStoreMember` |
| P8 — Admin Product List | None | Admin bypass preserved |
| P9 — Audit | Store membership changes | Must audit membership CRUD |
| P10 — Unsaved Changes | None | Frontend only |
| Merchant Offers | `assertStoreInOrg` | Unchanged — offer auth is separate |
| Inventory | `assertWarehouseInOrg` | Future: may need store membership |
| Warehouses | `assertWarehouseInOrg` | Future: may need store membership |
| Fulfillment | `assertStoreInOrg` | Future: may need store membership |
| Store Administration | `store_members` CRUD | New feature — requires management API |

---

## 18. Migration 0054 Concept

### 18.1 Design (NOT CREATED YET)

```sql
-- Migration 0054: Store-level membership for Product Studio authorization
-- Enables store-scoped authorization for merchant product editing.
-- Idempotent: safe to run multiple times.

-- 1. Create store_members table
CREATE TABLE IF NOT EXISTS store_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        VARCHAR(16) NOT NULL DEFAULT 'MEMBER',
  status      VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_store_members_store_user UNIQUE (store_id, user_id),
  CONSTRAINT ck_store_members_role CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
  CONSTRAINT ck_store_members_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_store_members_store
  ON store_members(store_id);
CREATE INDEX IF NOT EXISTS idx_store_members_user
  ON store_members(user_id);
CREATE INDEX IF NOT EXISTS idx_store_members_store_active
  ON store_members(store_id, status) WHERE status = 'ACTIVE';

-- 3. Backfill from outbox events (authoritative source)
INSERT INTO store_members (store_id, user_id, role, status)
SELECT DISTINCT
  e.aggregate_id::uuid AS store_id,
  (e.metadata->>'userId')::uuid AS user_id,
  'OWNER' AS role,
  'ACTIVE' AS status
FROM outbox_events e
WHERE e.event_type = 'merchant.store.created'
  AND e.metadata->>'userId' IS NOT NULL
  AND (e.metadata->>'userId')::uuid IN (SELECT id FROM users)
  AND e.aggregate_id::uuid IN (SELECT id FROM stores)
ON CONFLICT (store_id, user_id) DO NOTHING;

-- 4. Backfill from org MERCHANT_OWNER (fallback for stores without outbox events)
INSERT INTO store_members (store_id, user_id, role, status)
SELECT DISTINCT ON (s.id)
  s.id AS store_id,
  om.user_id,
  'OWNER' AS role,
  'ACTIVE' AS status
FROM stores s
JOIN organization_members om ON om.org_id = s.org_id
JOIN roles r ON r.id = om.role_id AND r.key = 'MERCHANT_OWNER'
WHERE om.status = 'ACTIVE'
  AND s.id NOT IN (SELECT store_id FROM store_members)
ORDER BY s.id, om.created_at ASC
ON CONFLICT (store_id, user_id) DO NOTHING;

-- 5. Updated_at trigger
CREATE OR REPLACE FUNCTION store_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_store_members_updated_at ON store_members;
CREATE TRIGGER trg_store_members_updated_at
  BEFORE UPDATE ON store_members
  FOR EACH ROW EXECUTE FUNCTION store_members_updated_at();
```

### 18.2 Rollback

```sql
DROP TABLE IF EXISTS store_members;
```

### 18.3 Idempotency

- `CREATE TABLE IF NOT EXISTS` — safe to re-run
- `CREATE INDEX IF NOT EXISTS` — safe to re-run
- `ON CONFLICT DO NOTHING` — safe to re-run
- Backfill is resumable

### 18.4 Fail-Safe Behavior

- Stores without `store_members` rows: merchants DENIED, admin bypass works
- This is correct: fail-closed for unassigned stores

---

## 19. Concurrency Requirements

| Scenario | Guarantee | Enforcement |
|----------|-----------|-------------|
| A. Store A member edits product | ALLOW | `store_members` check |
| B. Store B member edits same product | DENY | `store_members` check fails |
| C. Membership revoked during edit | DENY on next request | Server-side DB check |
| D. Membership added during edit | ALLOW on next request | Server-side DB check |
| E. Owner transfer race | Serialized | Optimistic locking or SELECT FOR UPDATE |
| F. Last-owner removal race | DENIED | Transactional check |
| G. Member deactivation vs mutation | DENY after deactivation | Server-side DB check |

**Key principle:** All authorization checks are server-side, database-derived, and transactional. JWT staleness is not a factor.

---

## 20. Security Requirements

| Requirement | Implementation |
|-------------|---------------|
| Store-level authorization | `assertStoreMember` helper |
| Org-level isolation preserved | `assertStoreInOrg` unchanged |
| Admin bypass preserved | `isTenantPrivileged` unchanged |
| Fail-closed | No membership = DENY |
| Last-owner protection | Transactional check on removal |
| Cross-org denial | Existing `assertStoreInOrg` preserved |
| Offer ownership separation | No change to offer auth |
| storeId NULL denial | Existing check preserved |
| Membership audit trail | Outbox events for CRUD |

---

## 21. Audit Requirements

| Event | Trigger | Data |
|-------|---------|------|
| `store_member.added` | Member added to store | storeId, userId, role |
| `store_member.removed` | Member removed | storeId, userId |
| `store_member.role_changed` | Role changed | storeId, userId, oldRole, newRole |
| `store_member.deactivated` | Member deactivated | storeId, userId |
| `store_member.reactivated` | Member reactivated | storeId, userId |
| `store_member.owner_transferred` | Ownership transferred | storeId, fromUserId, toUserId |

---

## 22. Business Rules Lock

| Rule | Decision | Status |
|------|----------|--------|
| **BD-P6-AUTH-01** — Store ownership authorization | `products.storeId` identifies owning store. Store membership required to edit. | **LOCKED** |
| **BD-P6-AUTH-02** — Store membership | `store_members` table with `UNIQUE(store_id, user_id)`. | **LOCKED** |
| **BD-P6-AUTH-03** — Store roles | OWNER, ADMIN, MEMBER. OWNER has full control. ADMIN can manage MEMBERs. MEMBER can edit products. | **LOCKED** |
| **BD-P6-AUTH-04** — Membership lifecycle | Created by OWNER/ADMIN. Deactivation preserves row. Last-owner protection. | **LOCKED** |
| **BD-P6-AUTH-05** — Product.storeId | Owning store identifier. Nullable for platform-shared canonical products. | **LOCKED** |
| **BD-P6-AUTH-06** — storeId NULL | DENY for all non-privileged merchants. Admin/moderator may edit. | **LOCKED** |
| **BD-P6-AUTH-07** — Admin bypass | SUPER_ADMIN, ADMIN, MODERATOR bypass store membership checks. | **LOCKED** |
| **BD-P6-AUTH-08** — Moderator behavior | MODERATOR bypasses store membership. Same as current `isTenantPrivileged`. | **LOCKED** |
| **BD-P6-AUTH-09** — Offer ownership separation | `merchant_offers` ownership ≠ product ownership. Offer auth unchanged. | **LOCKED** |
| **BD-P6-AUTH-10** — JWT/store context | JWT does NOT carry storeId. Store authorization derived server-side from DB. | **LOCKED** |
| **BD-P6-AUTH-11** — Membership backfill | Phase 1: outbox events. Phase 2: org MERCHANT_OWNER fallback. Phase 3: fail-closed. | **LOCKED** |
| **BD-P6-AUTH-12** — Audit | All membership changes audited via outbox events. | **LOCKED** |
| **BD-P6-AUTH-13** — Concurrency | All auth checks server-side, transactional, DB-derived. No JWT staleness. | **LOCKED** |
| **BD-P6-AUTH-14** — Migration strategy | Migration 0054 creates `store_members`, backfills, idempotent, resumable. | **LOCKED** |
| **BD-P6-AUTH-15** — P6 scope impact | All 11 Product Studio mutation/read endpoints gain `assertStoreMember`. Non-Product-Studio endpoints unchanged. | **LOCKED** |

---

## 23. Acceptance Criteria

| Criteria | Status |
|----------|--------|
| AUTH-01 Current auth architecture fully inspected | ✅ PASS |
| AUTH-02 Current schema fully inspected | ✅ PASS |
| AUTH-03 Store-user relationship confirmed or discovered | ✅ PASS — confirmed absent, `driver_store_assignments` precedent found |
| AUTH-04 Product ownership semantics confirmed | ✅ PASS — `products.storeId` = owning store |
| AUTH-05 Same-org-different-store behavior documented | ✅ PASS — currently ALLOWED, must be DENIED |
| AUTH-06 Store membership decision made | ✅ PASS — `store_members` required |
| AUTH-07 Store role model decided | ✅ PASS — OWNER, ADMIN, MEMBER |
| AUTH-08 Membership lifecycle decided | ✅ PASS — create, modify, deactivate, last-owner protection |
| AUTH-09 Admin behavior decided | ✅ PASS — bypass preserved |
| AUTH-10 Moderator behavior decided | ✅ PASS — bypass preserved |
| AUTH-11 storeId NULL behavior decided | ✅ PASS — DENY for merchants |
| AUTH-12 JWT/store context decision made | ✅ PASS — no storeId in JWT |
| AUTH-13 Existing store backfill strategy decided | ✅ PASS — outbox → org owner → fail-closed |
| AUTH-14 Migration 0054 concept documented | ✅ PASS — §18 |
| AUTH-15 Product Studio impact documented | ✅ PASS — §15 |
| AUTH-16 Import impact documented | ✅ PASS — §16 |
| AUTH-17 P7/P8/P9/P10 impact documented | ✅ PASS — §17 |
| AUTH-18 Offer ownership remains separate | ✅ PASS — BD-P6-AUTH-09 |
| AUTH-19 Concurrency requirements documented | ✅ PASS — §19 |
| AUTH-20 Security requirements documented | ✅ PASS — §20 |
| AUTH-21 Audit requirements documented | ✅ PASS — §21 |
| AUTH-22 No application code changed | ✅ PASS |
| AUTH-23 No migration 0054 created | ✅ PASS |
| AUTH-24 Final architecture decision explicitly stated | ✅ PASS — Option A: `store_members` |
| AUTH-25 Exact next implementation gate stated | ✅ PASS — P6 REMEDIATION (implementation) |

---

## 24. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Backfill assigns wrong owner | MEDIUM | Outbox events are authoritative; admin can reassign |
| Stores without outbox events or org owners | LOW | Fail-closed; admin manual assignment |
| Migration 0054 breaks existing tests | LOW | Existing tests use bypass roles or org-level checks |
| Performance impact of additional DB query | LOW | Indexed `store_members` lookup; single row |
| Scope creep to other endpoints | LOW | P6 scope limited to Product Studio endpoints only |
| Membership management API not yet built | MEDIUM | Future phase; admin manual assignment in interim |

---

## 25. Rollback Strategy

1. **Migration rollback:** `DROP TABLE IF EXISTS store_members;`
2. **Code rollback:** Remove `assertStoreMember` calls from Product Studio endpoints
3. **Behavior rollback:** Revert to org-level authorization (DEFECT-01 returns)
4. **Data preservation:** `store_members` data preserved until explicitly dropped

---

## 26. Final Gate Verdict

### **GO WITH CONDITIONS**

**Conditions:**
1. Migration 0054 must be created and tested before P6 remediation implementation
2. Backfill must be verified against real PostgreSQL with test data
3. All 11 Product Studio endpoints must be tested with store membership checks
4. Concurrency regression must pass (5 × 50 iterations)
5. Full regression must show zero P6 regressions

**All architecture decisions are LOCKED. No unresolved decisions remain.**

---

## 27. Exact Next Gate

**P6 REMEDIATION (Implementation)**

The next gate is to implement the store-level authorization fix:
1. Create migration 0054 (`store_members` table + backfill)
2. Add `assertStoreMember` helper to `tenant-scope.ts`
3. Add store membership check to all 11 Product Studio endpoints
4. Write security tests (scenarios A–I from §14)
5. Run concurrency regression (5 × 50 iterations)
6. Run full regression
7. Create P6 Remediation Report (v2)

After successful remediation:
**P6 INDEPENDENT RUNTIME RE-VERIFICATION**

After successful re-verification:
**P6 RELEASE CLOSURE**

---

**Document prepared by:** P6 Store Authorization Architecture Decision Gate  
**Date:** 2026-10-05  
**Verdict:** **GO WITH CONDITIONS** — all architecture decisions LOCKED, migration 0054 approved in principle
