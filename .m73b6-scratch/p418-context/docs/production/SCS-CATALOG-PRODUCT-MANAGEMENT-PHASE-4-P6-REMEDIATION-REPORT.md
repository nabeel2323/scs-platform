# SCS Catalog — Product Management Phase 4 (P6) Remediation Report

## DEFECT-01: Same-Organization-Different-Store Access Permitted

**Report Date:** 2026-10-05  
**Severity:** HIGH  
**Status:** BLOCKED — Schema Insufficient  
**Verdict:** **BLOCKED**

---

## 1. Defect Summary

**DEFECT-01:** The P6 Independent Runtime Verification demonstrated that a merchant from Store B (Organization X) can edit products owned by Store A (Organization X) because the authorization check is org-level, not store-level.

```
Organization X
├── Store A
│    └── Product P (storeId = Store A)
└── Store B
     └── Merchant B (org member of Org X)

Merchant B → PATCH /products/P → ALLOWED (DEFECT)
Expected: DENIED
```

---

## 2. Root Cause Analysis

### Current Authorization Flow

```
PATCH /products/:id
  ↓
PermissionsGuard → checks merchant:products:write (org-level)
  ↓
assertProductInOrg(db, caller, productId)
  ↓
loads product → gets storeId
  ↓
assertStoreInOrg(db, caller, storeId)
  ↓
loads store → gets orgId
  ↓
checks: store.orgId === caller.activeOrg
  ↓
ALLOW (if same org)
```

### The Problem

`assertStoreInOrg` validates **organization membership**, not **store membership**:

```typescript
// tenant-scope.ts:45-55
export async function assertStoreInOrg(db, caller, storeId): Promise<void> {
  if (isTenantPrivileged(caller)) return;
  const orgId = await storeOrgId(db, storeId);
  if (!orgId || orgId !== caller.activeOrg) {
    throw new ForbiddenException('You do not have access to this store');
  }
}
```

This check ensures the store belongs to the caller's organization, but it does **not** verify that the caller is authorized for that specific store. All members of an organization can access all stores in that organization.

### Why This Exists

The platform's authorization model is **org-level**, not store-level:

- `organization_members` table: links users to organizations (org-level membership)
- `stores` table: links stores to organizations via `orgId`
- **No `store_members` table exists** — there is no user-to-store membership relationship

---

## 3. Architecture Inspection Results

### JWT Payload Structure

```typescript
interface JwtPayload {
  sub: string;        // user ID
  activeOrg: string;  // organization ID
  role: string;       // SUPER_ADMIN, ADMIN, MODERATOR, MERCHANT
  perms: string[];    // permissions array (org-level)
}
```

**No `storeId` in JWT** — the caller context has no store-level information.

### CallerContext Interface

```typescript
interface CallerContext {
  sub: string;
  role?: string | null;
  activeOrg?: string | null;
}
```

**No store-level field** — the caller context cannot express store membership.

### Existing Schema Analysis

| Table | Relationship | Store-Level? |
|-------|--------------|--------------|
| `users` | User identity | No |
| `organizations` | Organization identity | No |
| `organization_members` | User → Organization | **Org-level only** |
| `stores` | Store → Organization | No user link |
| `products` | Product → Store | No user link |
| `merchant_offers` | Offer → Store | No user link |

**Critical Finding:** There is **no user-to-store membership table** in the existing schema.

### Searched For (Not Found)

- `store_members` table — does not exist
- `store_member` table — does not exist
- `merchant_store` table — does not exist
- `products.createdBy` — does not exist
- Any migration creating store membership — none found (migrations 0001–0053)

---

## 4. Why Existing Schema Is Insufficient

The P6 business rule requires:

> "ONLY the merchant/store that owns the product through `products.storeId` may edit the canonical product through Merchant Product Studio."

This requires **store-level authorization**: verifying that the caller is authorized for the specific store that owns the product.

The existing schema provides only **org-level authorization**: verifying that the caller is a member of the organization that owns the store.

**Gap:** There is no data in the existing schema that can establish "User U is authorized for Store S."

### Attempted Proxies (Rejected)

| Proxy | Why Rejected |
|-------|--------------|
| `merchant_offers.storeId` | Spec explicitly states: "offer ownership ≠ product ownership" |
| `import_jobs.createdBy` | Weak proxy — import ≠ edit authorization |
| Single org member assumption | Invents ownership model; multiple merchants can join an org |
| Role-based store assignment | Roles are org-level, not store-level |

---

## 5. Required Schema Change

To implement store-level authorization, the following schema change is required:

### Proposed Migration 0054

```sql
-- Migration 0054: Store-level membership for Product Studio authorization
-- Enables store-scoped authorization for merchant product editing

CREATE TABLE IF NOT EXISTS store_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'MEMBER', -- OWNER, ADMIN, MEMBER
  status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(store_id, user_id)
);

-- Index for fast lookup
CREATE INDEX idx_store_members_store ON store_members(store_id);
CREATE INDEX idx_store_members_user ON store_members(user_id);
```

### Affected Authorization Behavior

With this table, `assertStoreInOrg` could be strengthened to:

```typescript
export async function assertStoreInOrg(db, caller, storeId): Promise<void> {
  if (isTenantPrivileged(caller)) return;
  
  // Check org-level membership (existing)
  const orgId = await storeOrgId(db, storeId);
  if (!orgId || orgId !== caller.activeOrg) {
    throw new ForbiddenException('You do not have access to this store');
  }
  
  // Check store-level membership (NEW)
  const membership = await db.db.query.storeMembers.findFirst({
    where: and(
      eq(storeMembers.storeId, storeId),
      eq(storeMembers.userId, caller.sub),
      eq(storeMembers.status, 'ACTIVE')
    )
  });
  
  if (!membership) {
    throw new ForbiddenException('You are not authorized for this store');
  }
}
```

---

## 6. Security Implications

### Current State (Org-Level)

- All members of an organization can access all stores in that organization
- This is the platform's **current design**
- Cross-organization access is properly denied

### Required State (Store-Level)

- Only members of a specific store can edit products for that store
- Same-org-different-store access must be denied
- This requires a **new schema table** (`store_members`)

### Risk Assessment

| Scenario | Current | Required | Risk |
|----------|---------|----------|------|
| Cross-org access | DENIED | DENIED | None |
| Same-org, same-store | ALLOWED | ALLOWED | None |
| Same-org, different-store | **ALLOWED** | **DENIED** | **HIGH** |
| Admin/moderator bypass | ALLOWED | ALLOWED | None |

The DEFECT-01 finding is a **HIGH security issue** because it violates the P6 business rule that only the owning store's merchant can edit the product.

---

## 7. Remediation Options

### Option A: Create Migration 0054 (Recommended)

**Action:** Create `store_members` table and backfill with existing data.

**Pros:**
- Proper store-level authorization
- Enforces P6 business rule
- Scalable for future multi-merchant stores

**Cons:**
- Requires migration 0054 (forbidden by P6 spec)
- Requires data migration/backfill
- Requires new architecture decision

**Status:** BLOCKED by P6 constraint "Do not create migration 0054"

### Option B: Strengthen Org-Level Check (Insufficient)

**Action:** Add additional org-level checks (e.g., role-based).

**Pros:**
- No schema change required

**Cons:**
- Does not solve same-org-different-store problem
- Invents ownership model
- Violates P6 business rule

**Status:** REJECTED — does not meet requirements

### Option C: Use Offer Ownership as Proxy (Rejected)

**Action:** Check if caller has offers for the store.

**Pros:**
- Uses existing data

**Cons:**
- Spec explicitly rejects: "offer ownership ≠ product ownership"
- Weak proxy — offer ≠ edit authorization
- Violates P6 business rule

**Status:** REJECTED by P6 spec

### Option D: STOP and Report (Current Action)

**Action:** Document that schema is insufficient and report to architecture team.

**Pros:**
- Follows P6 remediation spec instructions
- Does not invent ownership model
- Preserves existing behavior

**Cons:**
- DEFECT-01 remains unfixed
- P6 cannot be closed until resolved

**Status:** **CURRENT ACTION**

---

## 8. Test Results

### Verification Tests Run

Despite being BLOCKED, the following tests were executed to confirm the defect:

| Test | Expected | Actual | Result |
|------|----------|--------|--------|
| Same-org, different-store → edit | DENIED | ALLOWED | **DEFECT CONFIRMED** |
| Cross-org → edit | DENIED | DENIED | PASS |
| Owner store → edit | ALLOWED | ALLOWED | PASS |
| Admin bypass | ALLOWED | ALLOWED | PASS |

### Concurrency Tests

Not run — remediation is BLOCKED.

---

## 9. Affected Endpoints

All P6 Product Studio mutation endpoints are affected:

| Endpoint | Authorization | Status |
|----------|---------------|--------|
| `PATCH /products/:id` | `assertProductInOrg` | **VULNERABLE** |
| `PUT /products/:id/attribute-values` | `assertProductInOrg` | **VULNERABLE** |
| `POST /products/:productId/variants` | `assertProductInOrg` | **VULNERABLE** |
| `PATCH /products/:productId/variants/:variantId` | `assertVariantInOrg` | **VULNERABLE** |
| `PUT /products/:productId/variants/:variantId/attribute-values` | `assertVariantInOrg` | **VULNERABLE** |
| `POST /products/:id/variants/bulk` | `assertProductInOrg` | **VULNERABLE** |
| `POST /products/:id/media` | `assertProductInOrg` | **VULNERABLE** |
| `DELETE /products/:id/media/:mediaId` | `assertProductInOrg` | **VULNERABLE** |
| `POST /products/:id/media/reorder` | `assertProductInOrg` | **VULNERABLE** |
| `GET /products/:id/attribute-values` | `assertProductInOrg` | **VULNERABLE** |
| `GET /products/:productId/variants/:variantId/attribute-values` | `assertVariantInOrg` | **VULNERABLE** |

---

## 10. Recommendation

### Immediate Action

1. **STOP P6 closure** — DEFECT-01 is HIGH severity and cannot be fixed without schema change
2. **Escalate to architecture team** — requires decision on store-level membership model
3. **Create migration 0054** — `store_members` table with proper backfill strategy

### Proposed Architecture Decision

**Question:** Should the platform support store-level membership?

**Options:**
- **Yes:** Create `store_members` table, backfill with existing org members, enforce store-level authorization
- **No:** Accept org-level authorization as the platform model, update P6 spec to reflect this

**Impact:**
- If Yes: Requires migration 0054, data backfill, frontend changes for store selection
- If No: P6 spec must be updated to accept org-level authorization; DEFECT-01 becomes "by design"

---

## 11. Rollback Plan

Not applicable — no code changes were made.

---

## 12. Final Remediation Verdict

### **BLOCKED**

**Reason:** The existing database schema does not contain a user-to-store membership relationship. Implementing store-level authorization requires a new `store_members` table (migration 0054), which is forbidden by the P6 remediation spec.

**Next Steps:**
1. Architecture decision required on store-level membership model
2. If approved: create migration 0054, backfill data, re-attempt remediation
3. If rejected: update P6 spec to accept org-level authorization as platform design

**DEFECT-01 Status:** OPEN — requires architecture decision

---

## Appendix A: Files Inspected

| File | Purpose |
|------|---------|
| `apps/api/src/common/tenant-scope.ts` | Authorization helpers |
| `apps/api/src/modules/identity/identity.schema.ts` | User/org schema |
| `apps/api/src/modules/merchant/merchant.schema.ts` | Store schema |
| `apps/api/src/modules/catalog/catalog.schema.ts` | Product schema |
| `apps/api/src/common/guards/current-user.decorator.ts` | JWT payload |
| `infra/drizzle/migrations/0001–0053` | All migrations |

## Appendix B: Migration Search Results

- Searched for `store_members`, `store_member`, `merchant_store` — not found
- Searched for `createdBy` on products — not found
- Latest migration: 0053_attribute_backfill.sql
- No store membership table exists in any migration

## Appendix C: P6 Remediation Spec Compliance

| Spec Requirement | Status |
|------------------|--------|
| Inspect auth architecture | ✅ COMPLETE |
| Determine safest store membership source | ✅ COMPLETE — none exists |
| Do not create migration 0054 | ✅ COMPLIANT |
| STOP if schema insufficient | ✅ STOPPED |
| Report why schema insufficient | ✅ COMPLETE |
| Propose schema change | ✅ COMPLETE |
| Document affected behavior | ✅ COMPLETE |

---

**Report prepared by:** P6 Remediation Gate  
**Date:** 2026-10-05  
**Verdict:** **BLOCKED** — requires architecture decision on store-level membership
