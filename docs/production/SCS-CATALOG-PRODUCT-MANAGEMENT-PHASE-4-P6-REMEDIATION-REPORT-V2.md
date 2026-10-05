# P6 Merchant Product Studio — Remediation Report v2

## Store-Level Authorization Implementation

| Field | Value |
|-------|-------|
| Phase | P6 — Merchant Product Studio Edit Mode |
| Gate | P6 REMEDIATION (IMPLEMENTATION) |
| Type | Security defect remediation |
| Branch | `develop` |
| Baseline HEAD | `61990f10d2f3d168aff74e58b7aba8241345998f` |
| Defect | DEFECT-01 — same-org-different-store cross-access |
| Architecture Decision | GO WITH CONDITIONS |
| Architecture Doc | `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-4-P6-STORE-AUTHORIZATION-ARCHITECTURE-DECISION.md` |

---

## 1. Executive Summary

DEFECT-01 has been fully remediated. A merchant from Store B can no longer edit products owned by Store A, even when both stores belong to the same organization.

**What was done:**

- Created migration 0054 introducing the `store_members` table with locked schema
- Implemented `assertStoreMember()` and `assertProductEditableByMerchant()` authorization helpers
- Protected all 11 P6 Product Studio endpoints plus product create with store-level membership checks
- Existing org-level helpers (`assertStoreInOrg`, `assertProductInOrg`, etc.) remain unchanged
- JWT and CallerContext are unmodified; store authorization is derived server-side from database state
- Wrote 30 security, migration, and concurrency tests — all PASS
- Full regression suite passes with no new failures

**Verdict: PASS**

**Next gate: P6 INDEPENDENT RUNTIME RE-VERIFICATION**

---

## 2. Baseline

```
Branch:       develop
HEAD:         61990f10d2f3d168aff74e58b7aba8241345998f
Latest mig:   0053_attribute_backfill.sql
```

### Files Changed (P6 Remediation only)

| File | Change | Lines |
|------|--------|-------|
| `infra/drizzle/migrations/0054_store_members.sql` | Created | +79 |
| `apps/api/src/modules/merchant/merchant.schema.ts` | Added `storeMembers` Drizzle table | +32 |
| `apps/api/src/common/tenant-scope.ts` | Added `assertStoreMember` + `assertProductEditableByMerchant` | +69 |
| `apps/api/src/modules/catalog/catalog.controller.ts` | Protected 11 P6 endpoints + product create | +87 |
| `apps/api/src/__tests__/scratch/p6-remediation-store-auth.postgres.spec.ts` | Created security tests | +458 |
| `apps/api/src/__tests__/integration/p6-product-studio-edit.postgres.spec.ts` | Updated MIG-01 assertion | +2/-2 |
| `apps/api/src/__tests__/integration/phase3-runtime-verification.postgres.spec.ts` | Updated stale 0054 assertion | +2/-2 |
| `apps/api/src/__tests__/scratch/p6-independent-runtime-verification.postgres.spec.ts` | Updated stale MIG-A/B assertions | +5/-5 |

Note: Additional files in `git status` (web frontend, catalog.service.ts) are from prior P6 implementation gates, not this remediation.

---

## 3. Migration 0054

**File:** `infra/drizzle/migrations/0054_store_members.sql`

### Schema

```sql
CREATE TABLE IF NOT EXISTS store_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    UUID         NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        VARCHAR(16)  NOT NULL DEFAULT 'MEMBER',
    status      VARCHAR(12)  NOT NULL DEFAULT 'ACTIVE',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_store_members_store_user UNIQUE (store_id, user_id),
    CONSTRAINT ck_store_members_role   CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
    CONSTRAINT ck_store_members_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
);
```

### Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_store_members_store       ON store_members (store_id);
CREATE INDEX IF NOT EXISTS idx_store_members_user        ON store_members (user_id);
CREATE INDEX IF NOT EXISTS idx_store_members_store_active ON store_members (store_id, status) WHERE status = 'ACTIVE';
```

### Properties

- **Idempotent:** `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`
- **Safe:** All DDL is non-destructive
- **Resumable:** Backfill uses `ON CONFLICT DO NOTHING`
- **Deterministic:** Phase 2 fallback selects earliest MERCHANT_OWNER by `created_at ASC`
- **No `_migration_log` insert:** Runner owns bookkeeping (per project convention)

---

## 4. Backfill Evidence

### Phase 1 — Authoritative Outbox Events

```sql
INSERT INTO store_members (store_id, user_id, role, status)
SELECT DISTINCT e.aggregate_id, (e.metadata->>'userId')::uuid, 'OWNER', 'ACTIVE'
FROM outbox_events e
WHERE e.event_type = 'merchant.store.created'
  AND ... FK validation ...
ON CONFLICT (store_id, user_id) DO NOTHING;
```

- Uses `aggregate_id` as store_id and `metadata.userId` as creator
- Validates both user and store exist via FK subqueries
- Assigns OWNER + ACTIVE role

### Phase 2 — Fallback

```sql
INSERT INTO store_members (store_id, user_id, role, status)
SELECT DISTINCT ON (s.id) s.id, om.user_id, 'OWNER', 'ACTIVE'
FROM stores s
JOIN organization_members om ON om.org_id = s.org_id
JOIN roles r ON r.id = om.role_id
WHERE r.key = 'MERCHANT_OWNER' AND om.status = 'ACTIVE'
  AND NOT EXISTS (SELECT 1 FROM store_members sm WHERE sm.store_id = s.id)
ORDER BY s.id, om.created_at ASC
ON CONFLICT (store_id, user_id) DO NOTHING;
```

- Deterministic: earliest ACTIVE MERCHANT_OWNER by `created_at`
- Only for stores still without any membership
- Does NOT assign every org member — exactly one per store

### Phase 3 — Fail Closed

Stores without any membership remain inaccessible to merchant Product Studio operations. Privileged admin/moderator roles continue to work.

### Migration Test Results

```
✓ store_members table exists
✓ indexes exist (3 indexes verified)
✓ unique constraint works (duplicate rejected)
✓ role constraint works (invalid role rejected)
✓ status constraint works (invalid status rejected)
✓ backfill produced memberships
✓ re-run migration is safe (idempotent)
```

---

## 5. Authorization Architecture

### Authorization Flow (Post-Remediation)

```
Request
  ↓
JWT Authentication (JwtAuthGuard)
  ↓
Permission Check (PermissionsGuard)
  ↓
assertStoreInOrg / assertProductInOrg  ← EXISTING (unchanged)
  ↓
assertStoreMember / assertProductEditableByMerchant  ← NEW
  ↓
ALLOW / DENY
```

### What Changed

| Component | Status |
|-----------|--------|
| `assertStoreInOrg` | UNCHANGED — org-level isolation |
| `assertProductInOrg` | UNCHANGED — org-level isolation |
| `assertVariantInOrg` | UNCHANGED — org-level isolation |
| `assertWarehouseInOrg` | UNCHANGED — org-level isolation |
| `assertInventoryItemInOrg` | UNCHANGED — org-level isolation |
| `assertStoreMember` | NEW — store-level membership |
| `assertProductEditableByMerchant` | NEW — combined org + store check |
| JWT payload | UNCHANGED — no storeId added |
| CallerContext | UNCHANGED — {sub, role, activeOrg} |

### What Did NOT Change

- Merchant offers authorization
- Inventory authorization
- Warehouse authorization
- Orders authorization
- Fulfillment/shipping authorization
- Unrelated catalog paths (list, search, admin CRUD)

### Privileged Role Bypass

```typescript
const BYPASS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'];

export function isTenantPrivileged(caller: CallerContext): boolean {
  return BYPASS_ROLES.includes(caller.role || '');
}
```

Both `assertStoreMember` and `assertProductEditableByMerchant` call `isTenantPrivileged()` first and return immediately for platform staff. MERCHANT_OWNER and MERCHANT_STAFF do NOT automatically bypass — they must have ACTIVE store membership.

---

## 6. assertStoreMember Implementation

**File:** `apps/api/src/common/tenant-scope.ts` (lines 154–173)

```typescript
export async function assertStoreMember(
  db: DatabaseService,
  caller: CallerContext,
  storeId: string,
): Promise<void> {
  if (isTenantPrivileged(caller)) return;

  const membership = await db.db.query.storeMembers.findFirst({
    where: and(
      eq(storeMembers.storeId, storeId),
      eq(storeMembers.userId, caller.sub),
      eq(storeMembers.status, 'ACTIVE'),
    ),
    columns: { id: true },
  });

  if (!membership) {
    throw new ForbiddenException('You are not authorized for this store');
  }
}
```

**Properties:**
- Uses indexed lookup via `idx_store_members_store_active` partial index
- Checks ACTIVE status — INACTIVE membership is denied
- No information leakage (generic error message)
- Privileged roles bypass via `isTenantPrivileged`

---

## 7. Product Studio Endpoint Protection

All 11 P6 Product Studio endpoints are protected with `assertProductEditableByMerchant`:

| # | Endpoint | Handler | Protection |
|---|----------|---------|------------|
| 1 | `PATCH /products/:id` | `updateProduct` | `assertProductEditableByMerchant` |
| 2 | `PUT /products/:id/attribute-values` | `setProductAttributeValues` | `assertProductEditableByMerchant` |
| 3 | `POST /products/:productId/variants` | `createVariant` | `assertProductEditableByMerchant` |
| 4 | `PATCH /products/:productId/variants/:variantId` | `updateVariant` | `assertProductEditableByMerchant` |
| 5 | `PUT /products/:productId/variants/:variantId/attribute-values` | `setVariantAttributeValues` | `assertProductEditableByMerchant` |
| 6 | `POST /products/:id/variants/bulk` | `bulkVariantOperations` | `assertProductEditableByMerchant` |
| 7 | `POST /products/:id/media` | `addMedia` | `assertProductEditableByMerchant` |
| 8 | `DELETE /products/:id/media/:mediaId` | `removeMedia` | `assertProductEditableByMerchant` |
| 9 | `POST /products/:id/media/reorder` | `reorderMedia` | `assertProductEditableByMerchant` |
| 10 | `GET /products/:id/attribute-values` | `getProductAttributeValues` | `assertProductEditableByMerchant` |
| 11 | `GET /products/:productId/variants/:variantId/attribute-values` | `getVariantAttributeValues` | `assertProductEditableByMerchant` |

Each call constructs `CallerContext` from the JWT: `{ sub: user.sub, role: user.role, activeOrg: user.activeOrg }`.

---

## 8. Product Create Protection

**File:** `apps/api/src/modules/catalog/catalog.controller.ts` (lines 194–208)

```typescript
@Post('products')
@UseGuards(PermissionsGuard)
@RequirePermission('merchant:products:write')
async createProduct(@CurrentUser() user: JwtPayload, @Body() input: CreateProductInput) {
  const storeId = input.storeId;
  if (!storeId) {
    throw new ForbiddenException('A storeId is required to create a product');
  }
  const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
  await assertStoreInOrg(this.db, caller, storeId);
  await assertStoreMember(this.db, caller, storeId);
  return this.catalogService.createProduct(input, user.sub);
}
```

**Authorization chain:**
1. Permission check (`merchant:products:write`)
2. `storeId` required in request body
3. `assertStoreInOrg` — store belongs to caller's active org
4. `assertStoreMember` — caller is ACTIVE member of that store
5. Then create product

---

## 9. Variant Protection

All variant endpoints resolve the owning product from authoritative DB data via `assertProductEditableByMerchant`:

```typescript
export async function assertProductEditableByMerchant(
  db: DatabaseService, caller: CallerContext, productId: string,
): Promise<void> {
  if (isTenantPrivileged(caller)) return;
  const product = await db.db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { storeId: true },
  });
  if (!product) throw new ForbiddenException('You do not have access to this product');
  if (!product.storeId) throw new ForbiddenException('You do not have access to this product');
  await assertStoreInOrg(db, caller, product.storeId);
  await assertStoreMember(db, caller, product.storeId);
}
```

- Variant create/edit/attribute-update/bulk all pass `productId` from the route
- Product/store/org derived from DB, not client-supplied
- Optimistic locking and combinationKey rules preserved

---

## 10. Media Protection

Media endpoints (add, delete, reorder) all use `assertProductEditableByMerchant` with the owning product's ID from the route parameter.

**Authorization chain:**
```
mediaId → product (via route :id) → product.storeId → store membership
```

Media is never authorized using `mediaId` alone. The owning product's store is always resolved first.

---

## 11. Security Tests

**File:** `apps/api/src/__tests__/scratch/p6-remediation-store-auth.postgres.spec.ts`

### Command Output

```
RUN  v2.1.9 C:/TAIF/scs-platform/apps/api

 ✓ A: Store A OWNER → Store A product → ALLOW
 ✓ B: Store A ADMIN → Store A product → ALLOW
 ✓ C: Store A MEMBER → Store A product → ALLOW
 ✓ D: Store B OWNER → Store A product → DENY
 ✓ E: Store B ADMIN → Store A product → DENY
 ✓ F: Store B MEMBER → Store A product → DENY
 ✓ G: Same org, no store membership → DENY
 ✓ H: Different organization → DENY
 ✓ I: Merchant with offer but no store_members membership → DENY
 ✓ J: product.storeId = NULL → DENY for merchant
 ✓ K: SUPER_ADMIN → ALLOW (bypass)
 ✓ L: ADMIN → ALLOW (bypass)
 ✓ M: MODERATOR → ALLOW (bypass)
 ✓ Inactive membership → DENY
 ✓ Nonexistent membership → DENY
 ✓ assertStoreMember: Store A member → ALLOW
 ✓ assertStoreMember: Store B member on Store A → DENY
 ✓ assertStoreMember: SUPER_ADMIN bypass → ALLOW

Test Files  1 passed (1)
     Tests  18 passed (18)
```

### Test Setup

- 2 organizations (OrgX, OrgY)
- 3 stores (StoreA/StoreB in OrgX, StoreY in OrgY)
- 9 users with various store membership configurations
- 7 roles seeded (SUPER_ADMIN, ADMIN, MODERATOR, MERCHANT_OWNER, MERCHANT_STAFF, BUYER, DRIVER)

---

## 12. Concurrency Tests

**File:** `apps/api/src/__tests__/scratch/p6-remediation-store-auth.postgres.spec.ts`

### Command Output

```
 ✓ CONC-1: 5 concurrent authorized edits by Store A members (50 iter) 3121ms
 ✓ CONC-2: 5 concurrent unauthorized edits by Store B members → all DENY (50 iter) 905ms
 ✓ CONC-3: membership deactivation vs product mutation (50 iter) 1397ms
 ✓ CONC-4: membership activation vs product mutation (50 iter) 858ms
 ✓ CONC-5: optimistic locking conflict still works (50 iter) 1287ms

Test Files  1 passed (1)
     Tests  5 passed (5)
```

### Results Summary

| Test | Iterations | Result |
|------|-----------|--------|
| 5 concurrent authorized edits | 50 | 0 double-success |
| 5 concurrent unauthorized edits | 50 | 100% DENY |
| Membership deactivation vs mutation | 50 | Correct behavior |
| Membership activation vs mutation | 50 | Correct behavior |
| Optimistic locking conflict | 50 | Exactly 1 winner |

**Total: 250 iterations, 0 authorization defects**

---

## 13. Migration Tests

### Tests Executed

```
 ✓ store_members table exists
 ✓ indexes exist (idx_store_members_store, idx_store_members_user, idx_store_members_store_active)
 ✓ unique constraint works (duplicate (store_id, user_id) rejected)
 ✓ role constraint works (invalid role 'SUPERVISOR' rejected)
 ✓ status constraint works (invalid status 'PENDING' rejected)
 ✓ backfill produced memberships
 ✓ re-run migration is safe (idempotent — second execution causes no errors)
```

### Backfill Validation

- No duplicate memberships (UNIQUE constraint + ON CONFLICT DO NOTHING)
- Deterministic backfill (Phase 2 uses ORDER BY created_at ASC)
- Valid foreign keys (subqueries validate user/store existence)
- Valid roles (all backfilled rows have role = 'OWNER')
- Valid statuses (all backfilled rows have status = 'ACTIVE')
- Unassigned stores remain fail-closed

---

## 14. Regression Results

### PostgreSQL Integration Tests

| Suite | Tests | Result | Duration |
|-------|-------|--------|----------|
| P6 Remediation Security | 30 | **30/30 PASS** | 37s |
| P6 Product Studio Edit | 29 | **29/29 PASS** | 23s |
| P6 Independent Runtime Verification | 34 | **34/34 PASS** | 32s |
| P3 Admin Product CRUD | 11 | **11/11 PASS** | 41s |
| P5 Runtime Verification | 16 | **16/16 PASS** | 64s |
| Phase 3 Attribute Cutover | 21 | **21/21 PASS** | 74s |
| Phase 3 Runtime Verification | 38 | **38/38 PASS** | 143s |
| Phase 4 Optimistic Locking | 13 | **13/13 PASS** | 85s |
| Phase 4 P2 Identifiers Type | 27 | **27/27 PASS** | 24s |
| Admin Moderation | 18 | **18/18 PASS** | 32s |
| Catalog Seed | 8 | **8/8 PASS** | 23s |

**Total PostgreSQL: 245/245 PASS**

### Unit Tests

| Suite | Tests | Result |
|-------|-------|--------|
| Catalog unit tests | 188 | **188/188 PASS** (16 files) |
| Full unit test suite | 1352 | **1351/1352 PASS** (77/82 files) |

### Pre-existing Unit Test Failures (NOT caused by P6 remediation)

| File | Error | Root Cause |
|------|-------|------------|
| `catalog-import/*.spec.ts` (4 files) | `MODULE_NOT_FOUND: uuid/dist/v1.js` | exceljs dependency corruption |
| `realtime/realtime.gateway.spec.ts` | `Cannot find module './gateway-metadata.interface'` | @nestjs/websockets package issue |
| `shipping/webhook-rate-limiting.spec.ts` | Test timeout (5000ms) | Pre-existing timing issue |

All 5 file-level failures are pre-existing infrastructure issues unrelated to P6 remediation.

---

## 15. Build Results

### TypeScript Check

**Command:** `pnpm exec tsc --noEmit`

```
src/modules/realtime/realtime.gateway.ts(3,3): error TS2305: Module '"@nestjs/websockets"' has no exported member 'WebSocketServer'.
src/modules/realtime/realtime.gateway.ts(4,3): error TS2305: Module '"@nestjs/websockets"' has no exported member 'SubscribeMessage'.
src/modules/realtime/realtime.gateway.ts(5,3): error TS2305: Module '"@nestjs/websockets"' has no exported member 'OnGatewayInit'.
src/modules/realtime/realtime.gateway.ts(6,3): error TS2724: '"@nestjs/websockets"' has no exported member named 'OnGatewayConnection'.
src/modules/realtime/realtime.gateway.ts(9,3): error TS2305: Module '"@nestjs/websockets"' has no exported member 'ConnectedSocket'.

Found 5 errors in the same file, starting at: src/modules/realtime/realtime.gateway.ts:3

EXIT_CODE: 2
```

**Conclusion:** 5 errors, all in `realtime.gateway.ts` — pre-existing `@nestjs/websockets` package resolution issue. **Zero new errors from P6 remediation.**

### Nest Build

**Command:** `pnpm exec nest build`

```
EXIT_CODE: 1
```

Same 5 `realtime.gateway.ts` errors. **No new build failures from P6 remediation.**

---

## 16. Security Matrix

| Scenario | Expected | Actual | Status |
|----------|----------|--------|--------|
| A. Store A OWNER → Store A product | ALLOW | ALLOW | ✅ |
| B. Store A ADMIN → Store A product | ALLOW | ALLOW | ✅ |
| C. Store A MEMBER → Store A product | ALLOW | ALLOW | ✅ |
| D. Store B OWNER → Store A product | DENY | DENY | ✅ |
| E. Store B ADMIN → Store A product | DENY | DENY | ✅ |
| F. Store B MEMBER → Store A product | DENY | DENY | ✅ |
| G. Same org, no store membership | DENY | DENY | ✅ |
| H. Different organization | DENY | DENY | ✅ |
| I. Offer but no store_members | DENY | DENY | ✅ |
| J. product.storeId = NULL | DENY | DENY | ✅ |
| K. SUPER_ADMIN | ALLOW | ALLOW | ✅ |
| L. ADMIN | ALLOW | ALLOW | ✅ |
| M. MODERATOR | ALLOW | ALLOW | ✅ |
| Inactive membership | DENY | DENY | ✅ |
| Nonexistent membership | DENY | DENY | ✅ |

**15/15 security scenarios correct.**

---

## 17. Acceptance Criteria

| ID | Criterion | Status |
|----|-----------|--------|
| P6-R01 | Migration 0054 exists and applies successfully | ✅ PASS |
| P6-R02 | Migration is idempotent | ✅ PASS |
| P6-R03 | store_members schema matches locked architecture | ✅ PASS |
| P6-R04 | Required indexes exist (3 indexes) | ✅ PASS |
| P6-R05 | FK constraints work | ✅ PASS |
| P6-R06 | Role/status constraints work | ✅ PASS |
| P6-R07 | Outbox backfill works | ✅ PASS |
| P6-R08 | Fallback backfill works | ✅ PASS |
| P6-R09 | Unassigned stores fail closed | ✅ PASS |
| P6-R10 | assertStoreMember implemented | ✅ PASS |
| P6-R11 | Privileged bypass preserved | ✅ PASS |
| P6-R12 | Product edit protected | ✅ PASS |
| P6-R13 | Product attribute update protected | ✅ PASS |
| P6-R14 | Variant create protected | ✅ PASS |
| P6-R15 | Variant edit protected | ✅ PASS |
| P6-R16 | Variant attribute update protected | ✅ PASS |
| P6-R17 | Bulk variant operation protected | ✅ PASS |
| P6-R18 | Media add protected | ✅ PASS |
| P6-R19 | Media delete protected | ✅ PASS |
| P6-R20 | Media reorder protected | ✅ PASS |
| P6-R21 | Attribute read endpoints protected | ✅ PASS |
| P6-R22 | Product create protected | ✅ PASS |
| P6-R23 | Owner access works | ✅ PASS |
| P6-R24 | Same-store admin/member access works | ✅ PASS |
| P6-R25 | Same-org different-store denied | ✅ PASS |
| P6-R26 | Cross-org denied | ✅ PASS |
| P6-R27 | Offer-owner-only access denied | ✅ PASS |
| P6-R28 | Inactive membership denied | ✅ PASS |
| P6-R29 | storeId NULL merchant access denied | ✅ PASS |
| P6-R30 | SUPER_ADMIN bypass works | ✅ PASS |
| P6-R31 | ADMIN bypass works | ✅ PASS |
| P6-R32 | MODERATOR bypass works | ✅ PASS |
| P6-R33 | 5×50 concurrency regression passes | ✅ PASS |
| P6-R34 | Optimistic locking remains correct | ✅ PASS |
| P6-R35 | Typed attributes remain correct | ✅ PASS |
| P6-R36 | Canonical-vs-offer boundary preserved | ✅ PASS |
| P6-R37 | P3/P5/P6 regression passes | ✅ PASS |
| P6-R38 | TypeScript/build — infrastructure condition proven | ✅ PASS |
| P6-R39 | No migration 0055+ | ✅ PASS |
| P6-R40 | No unrelated authorization redesign | ✅ PASS |
| P6-R41 | No feature creep | ✅ PASS |
| P6-R42 | Report created | ✅ PASS |

**42/42 acceptance criteria met.**

---

## 18. Known Limitations

1. **TypeScript/Nest Build:** 5 pre-existing errors in `realtime.gateway.ts` due to `@nestjs/websockets` package resolution. These existed before P6 remediation and are unrelated. Exit code 2 (tsc) / exit code 1 (nest build) are entirely attributable to this single file.

2. **Unit Test Infrastructure:** 5 pre-existing test file failures (exceljs/uuid corruption, @nestjs/websockets module resolution, webhook timeout). All proven non-regressions.

3. **Store Membership Management UI:** Not implemented per spec. The architecture document notes future audit events (`store_member.added`, `store_member.removed`, etc.) but explicitly defers the management UI.

4. **Last OWNER Protection:** The architecture specifies every store must retain at least one OWNER. No membership management service was implemented in this remediation (per spec: "Do not implement an incomplete membership-management feature merely to satisfy this requirement"). This constraint must be enforced when the management UI is built.

5. **Backfill Completeness:** In a production database with stores that have no outbox creation events and no MERCHANT_OWNER org members, those stores will remain unassigned (fail-closed). This is by design — privileged roles can still access them, and an admin can manually assign members once the management UI exists.

---

## 19. Final Verdict

### **PASS**

All 42 acceptance criteria are met. The security defect DEFECT-01 is fully remediated:

- Migration 0054 creates the `store_members` table with correct schema, constraints, and indexes
- Backfill is safe, deterministic, and idempotent
- `assertStoreMember` and `assertProductEditableByMerchant` correctly enforce store-level membership
- All 11 P6 Product Studio endpoints plus product create are protected
- 15/15 security scenarios produce correct results
- 250 concurrency iterations show 0 authorization defects
- P3/P5/P6 regression suites pass (245/245 PostgreSQL tests)
- No new TypeScript errors or build failures introduced
- No global authorization redesign occurred
- No feature creep

---

## 20. Exact Next Gate

**P6 INDEPENDENT RUNTIME RE-VERIFICATION**

The independent verifier must independently verify:

1. Migration 0054 applies correctly
2. Security authorization (all 15 scenarios)
3. Concurrency regression (5×50)
4. P6 integration tests (29 tests)
5. P3/P5 regression
6. TypeScript/build status
7. All 42 acceptance criteria

Only after independent re-verification passes should P6 Release Closure be performed.

**P6 is NOT closed.**
