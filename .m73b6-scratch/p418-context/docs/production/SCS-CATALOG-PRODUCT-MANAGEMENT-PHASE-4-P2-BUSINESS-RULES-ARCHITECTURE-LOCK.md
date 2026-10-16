# SCS Catalog Product Management — Phase 4 P2 Business Rules + Architecture Lock

## 1. Executive Summary

This document locks all business rules and architecture decisions for Phase 4 P2 (UpdateProductInput Expansion + Identifier/Type Rules) of the SCS Catalog Product Management milestone (M7.3-C).

P2 builds on the formally closed Phase 4 P1 (Optimistic Locking API/Backend) and the P2 Pre-Implementation Architecture Audit (verdict: GO WITH CONDITIONS). All conditions from the audit are resolved within this lock.

**P2 BUSINESS RULES + ARCHITECTURE: LOCKED / GO**

| Field | Value |
|-------|-------|
| Phase | Phase 4 P2 |
| Name | UpdateProductInput Expansion + Identifier/Type Rules |
| Milestone | M7.3-C — Catalog Import + Product / Variant Management |
| Branch | `develop` |
| HEAD | `0549e1f` |
| Lock date | October 5, 2026 |
| Lock status | **LOCKED / GO** |
| Audit reference | `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-4-P2-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md` |
| Audit verdict | GO WITH CONDITIONS (all conditions resolved) |

## 2. Authoritative Baseline

| Aspect | Value |
|--------|-------|
| Branch | `develop` |
| HEAD | `0549e1f` |
| Latest migration | `0053_attribute_backfill.sql` |
| Migration 0054 | Does NOT exist |
| Phase 3 | CLOSED / PASS |
| P1 | CLOSED / PASS |
| P1 tests | 457/457 PASS (12 unit + 13 integration + 432 regression) |
| TypeScript | 0 errors |
| Nest build | 285 files |
| Production files changed by this lock | 0 |
| Database migrations | 0 |
| Schema changes | 0 |

## 3. P2 Scope

### In scope

- `productTypeId` editing with BD-06 guard
- GTIN editing with normalization and uniqueness
- EAN editing with normalization and uniqueness
- MPN editing with normalization (no uniqueness)
- Product type existence validation
- Product type change guard (variants = 0 AND offers = 0)
- GTIN/EAN uniqueness enforcement on update (excluding self)
- Identifier normalization (trim + empty→null)
- P1 optimistic-locking integration
- Web API TypeScript type alignment
- `createVariant()` FOR SHARE concurrency protection
- Unit tests
- PostgreSQL integration/concurrency tests

### Not in scope

- Admin product editor (P3)
- Admin attributes editor (P4)
- Admin variant management (P5)
- Merchant Product Studio edit mode (P6)
- Merchant variant editing (P7)
- Admin product list redesign (P8)
- Audit trail expansion (P9)
- Frontend conflict UX (P3/P6)
- Variant deactivation (P5/P7)
- GTIN dedup UI (deferred)
- Performance/index redesign
- Mobile redesign
- Shipping, payment, returns, refunds, notifications
- GTIN/EAN check-digit validation (deferred — see §4)
- `createProduct()` redesign (already supports all P2 fields)
- Import pipeline redesign

## 4. BD-05 — Identifier Editing

**LOCKED:** GTIN, EAN, and MPN are editable after product creation.

### Database constraints (authoritative)

| Identifier | Column | Type | Nullable | Unique Index | Non-Unique Index |
|------------|--------|------|----------|--------------|------------------|
| GTIN | `products.gtin` | `varchar(20)` | Yes | `uq_products_gtin` (partial, WHERE NOT NULL) | — |
| EAN | `products.ean` | `varchar(20)` | Yes | `uq_products_ean` (partial, WHERE NOT NULL) | — |
| MPN | `products.mpn` | `varchar(100)` | Yes | — | `idx_products_mpn` |

### Check-digit validation

**DEFERRED.**

P2 must NOT implement:
- GTIN-8/12/13/14 check-digit validation
- EAN check-digit validation

**Reason:** The project Business Rules do not currently define the exact identifier format/check-digit policy. This can be introduced in a future business-rule decision.

## 5. BD-06 — Product Type Editing

**LOCKED:** Product type is NOT freely editable after variants or merchant offers exist.

| Condition | Allowed? |
|-----------|----------|
| No variants AND no merchant offers | Yes — subject to product type existence validation |
| Has variants OR has merchant offers | No — backend rejects with HTTP 400 |

- Backend is authoritative — UI must not merely hide the field.
- Reason: changing productTypeId changes the attribute schema and variant dimensions.

### Offer count rule

**CRITICAL:** The BD-06 guard MUST count ALL merchant offers regardless of status.

Do NOT filter by `status = 'ACTIVE'`.

The existing offer-count helper in `searchCanonicalProducts()` filters by ACTIVE status. P2 must NOT reuse that helper for the BD-06 guard. P2 must query `SELECT COUNT(*) FROM merchant_offers WHERE product_id = ?` without any status filter.

**Reason:** Any merchant offer reference — regardless of lifecycle status — means the product type cannot be safely changed.

## 6. Identifier Normalization

**LOCKED:** The following normalization rules are authoritative.

| Step | Rule |
|------|------|
| 1 | Trim leading/trailing whitespace |
| 2 | If the resulting string is empty, store NULL |
| 3 | Do NOT remove internal spaces |
| 4 | Do NOT remove dashes |
| 5 | Do NOT change character casing unless existing code already does so |
| 6 | Do NOT introduce arbitrary identifier normalization |

**Examples:**
- `" 1234567890123 "` → `"1234567890123"`
- `""` → `NULL`
- `"  "` → `NULL`
- `"123-456"` → `"123-456"` (dash preserved)
- `"ABC 123"` → `"ABC 123"` (internal space preserved)

## 7. Identifier Uniqueness

**LOCKED:** GTIN and EAN must remain unique where non-null.

### Update uniqueness rule

The uniqueness lookup MUST exclude the current product (self-match).

| Scenario | Expected |
|----------|----------|
| Product A has GTIN "123". Product A updates GTIN to "123" | ✅ SUCCESS (self-match, no conflict) |
| Product A has GTIN "123". Product B attempts GTIN "123" | ❌ HTTP 400 "GTIN already exists on another product" |
| Product A has GTIN "123". Product A updates GTIN to "456" | ✅ SUCCESS (new unique value) |
| Product A has GTIN "123". Product A updates GTIN to NULL | ✅ SUCCESS (clearing identifier) |

### Error response

```
HTTP 400
{ "statusCode": 400, "message": "GTIN already exists on another product" }
```

Do NOT use 409 for identifier uniqueness. 409 remains reserved for optimistic-locking conflicts only.

### Database race handling

The database unique indexes (`uq_products_gtin`, `uq_products_ean`) remain the final integrity boundary. The implementation must safely handle a database unique violation in case of a concurrent uniqueness race (catch the DB error and return HTTP 400).

## 8. Product Type Existence

**LOCKED:** When `productTypeId` is non-null, the target product type MUST exist.

| Scenario | Expected |
|----------|----------|
| `productTypeId` set to valid UUID that exists | ✅ Proceed |
| `productTypeId` set to UUID that does not exist | ❌ HTTP 404 "Product type not found" |
| `productTypeId` set to `null` | ✅ Clear the assignment (allowed) |
| `productTypeId` not included in request | No change to existing value |

## 9. Product Type Guard

**LOCKED:** The productTypeId change guard MUST execute inside a database transaction with row-level locking.

### Required transaction flow

```
BEGIN TRANSACTION
  1. SELECT ... FROM products WHERE id = ? FOR UPDATE  (lock product row)
  2. Verify target product type exists (if non-null)
  3. SELECT COUNT(*) FROM product_variants WHERE product_id = ?
  4. If variants count > 0 → ROLLBACK → HTTP 400
  5. SELECT COUNT(*) FROM merchant_offers WHERE product_id = ?
  6. If offers count > 0 → ROLLBACK → HTTP 400
  7. Apply the product update (including optimistic locking if updatedAt supplied)
  8. COMMIT atomically
```

### Prohibited pattern

DO NOT implement:
```
SELECT count variants → check → SELECT count offers → check → UPDATE product
```
without a transaction and row lock. This is a race condition.

### Interaction with optimistic locking

When `clientUpdatedAt` is provided AND `productTypeId` is being changed:
1. Lock product row (FOR UPDATE)
2. Check guard conditions
3. Apply conditional UPDATE with `WHERE id = ? AND updated_at = clientDate`
4. If 0 rows → 409 (P1 conflict)
5. Commit

When `clientUpdatedAt` is omitted AND `productTypeId` is being changed:
1. Lock product row (FOR UPDATE)
2. Check guard conditions
3. Apply unconditional UPDATE (legacy path)
4. Commit

## 10. Concurrency Architecture

### Lock compatibility matrix

| Lock | FOR SHARE | FOR UPDATE |
|------|-----------|------------|
| FOR SHARE | ✅ Compatible | ❌ Conflicts |
| FOR UPDATE | ❌ Conflicts | ❌ Conflicts |

### Authoritative lock assignments

| Operation | Lock on product row | Effect |
|-----------|-------------------|--------|
| `createVariant()` | `FOR SHARE` | Allows concurrent variant creation; blocks productTypeId change |
| `updateProduct()` with productTypeId change | `FOR UPDATE` | Blocks variant creation; blocks other productTypeId changes |
| `updateProduct()` without productTypeId change | No product lock | P1 optimistic locking only |

### Race condition analysis

| Race | Mitigation | Result |
|------|-----------|--------|
| Two simultaneous productTypeId changes | P1 optimistic locking + FOR UPDATE | One wins, other gets 409 |
| productTypeId change vs variant creation | FOR UPDATE vs FOR SHARE | Serialized — one blocks the other |
| Concurrent variant creations | FOR SHARE vs FOR SHARE | Allowed — both proceed |
| productTypeId change vs identifier update | P1 optimistic locking | One wins, other gets 409 |
| Concurrent identifier updates | P1 optimistic locking | One wins, other gets 409 |

## 11. createVariant Lock

**LOCKED:** `createVariant()` MUST acquire a `FOR SHARE` lock on the parent product before inserting a variant.

### Required flow

```
BEGIN TRANSACTION
  SELECT ... FROM products WHERE id = ? FOR SHARE  (shared lock)
  INSERT INTO product_variants ...
COMMIT
```

### Lock behavior

- Multiple `FOR SHARE` locks are compatible → concurrent variant creation works
- `FOR UPDATE` (productTypeId change) conflicts with `FOR SHARE` → serialized
- This prevents the race where a variant is created under the old product type while a productTypeId change is in progress

### Scope

This lock applies to `createVariant()` in `catalog.service.ts`. It does NOT apply to `bulkVariantOperations()` unless that path also creates variants (which it does — the bulk create path must also acquire `FOR SHARE`).

## 12. Offer Creation Concurrency

### Current state analysis

The existing `createOffer()` in `catalog.offer.service.ts` (L96-172):
- Does NOT use a transaction
- Does NOT acquire a product-row lock
- Reads the product (L112-115), checks for duplicates (L128-138), then inserts (L141-159) — all outside a transaction

### Race analysis

| Race | Severity | Analysis |
|------|----------|----------|
| productTypeId change vs offer creation | LOW | The productTypeId guard (FOR UPDATE) checks offer count. But createOffer does not lock the product, so an offer can be inserted concurrently. |

### Architectural decision

**Document the race; defer the offer lock.**

The race is:
1. T1: productTypeId change → FOR UPDATE → checks offers = 0 → proceeds
2. T2: createOffer → reads product (no lock) → inserts offer
3. Result: productTypeId changed AND offer created concurrently

**Impact assessment:**
- Offers do NOT depend on the product type's attribute schema
- An offer references a product/variant — it is unaffected by product type changes
- The BD-06 guard's primary purpose is to protect variant/attribute integrity, not offer integrity
- The race does not create data corruption or schema mismatch

**Decision:** P2 implementation must document this race in the implementation report. If the implementation agent determines that the race can cause actual data integrity issues beyond the analysis above, they MUST STOP and report rather than silently adding an offer lock.

**If a future business decision requires serializing offer creation against product type changes**, a `FOR SHARE` lock can be added to `createOffer()` following the same pattern as `createVariant()`.

## 13. Optimistic Locking

**LOCKED:** P1 optimistic locking remains authoritative and must be preserved.

### P1 pattern (unchanged)

When `updatedAt` is supplied:
```sql
UPDATE products SET ... WHERE id = ? AND updated_at = ? RETURNING *
```

On mismatch:
```json
{ "statusCode": 409, "message": "CONFLICT", "currentUpdatedAt": "..." }
```

### P2 integration

P2 fields (`productTypeId`, `gtin`, `ean`, `mpn`) are part of the same atomic product update. All fields are updated together in a single UPDATE statement.

- If any conflict occurs, no partial update may be committed
- productTypeId guard + optimistic locking execute within the same transaction
- Stale updatedAt → 409 regardless of which fields are being updated

### Legacy behavior (unchanged from P1)

When `updatedAt` is omitted → legacy unconditional UPDATE. P2 must NOT make `updatedAt` mandatory.

## 14. Error Contract

**LOCKED:** The following application-level error mapping is authoritative.

| Status | Condition | Message |
|--------|-----------|---------|
| 404 | Product not found | "Product not found" |
| 404 | Product type not found | "Product type not found" |
| 400 | Product type change blocked — variants exist | "Cannot change product type: product has variants" |
| 400 | Product type change blocked — offers exist | "Cannot change product type: product has merchant offers" |
| 400 | GTIN already exists on another product | "GTIN already exists on another product" |
| 400 | EAN already exists on another product | "EAN already exists on another product" |
| 400 | Invalid identifier length/validation | Appropriate validation message |
| 400 | Invalid updatedAt format | "Invalid updatedAt timestamp" |
| 409 | Optimistic-locking conflict ONLY | `{ statusCode: 409, message: "CONFLICT", currentUpdatedAt: "..." }` |

**Do NOT use 409 for identifier uniqueness.** 409 is reserved exclusively for optimistic-locking conflicts.

### Order of checks

1. `assertProductInOrg()` → 403/404 (tenant isolation — controller, BEFORE service)
2. `getProduct(id)` → 404
3. Validate `updatedAt` format → 400 (if provided and invalid)
4. Normalize identifiers (trim, empty→null)
5. Validate product type existence → 404 (if productTypeId non-null and not found)
6. Check GTIN/EAN uniqueness (excluding self) → 400
7. If productTypeId changing: transaction with FOR UPDATE → guard check → 400 if blocked
8. Conditional/unconditional UPDATE → 409 if timestamp mismatch

## 15. Lifecycle

**LOCKED:** P2 follows existing lifecycle behavior. No new lifecycle states or restrictions.

| State | P2 Fields Editable? |
|-------|---------------------|
| DRAFT | Yes |
| ACTIVE | Yes |
| REJECTED | Yes (correction) |
| ARCHIVED | No (existing rules — must restore first) |

- Do NOT introduce new P2-specific lifecycle states
- Do NOT change publish behavior
- `validatePublish()` evaluates the product against the current/new productTypeId attribute requirements

## 16. Authorization / Tenant Isolation

**LOCKED:** No new permission introduced.

| Aspect | Rule |
|--------|------|
| Permissions | Existing `catalog:products:write` — unchanged |
| Tenant isolation | `assertProductInOrg()` must remain BEFORE P2 service logic |
| Information leakage | Wrong-tenant access rejected BEFORE P2 guard/uniqueness logic |

**Do NOT move authorization checks after:**
- GTIN lookup
- EAN lookup
- Variant count
- Offer count
- Product type lookup

This prevents cross-tenant information leakage.

## 17. Database / Migration Decision

**LOCKED: NO MIGRATION 0054 REQUIRED.**

All database objects needed for P2 already exist:

| Object | Type | Migration |
|--------|------|-----------|
| `products.product_type_id` | Column (uuid, nullable) | 0025 |
| `products.gtin` | Column (varchar(20), nullable) | 0025 |
| `products.ean` | Column (varchar(20), nullable) | 0025 |
| `products.mpn` | Column (varchar(100), nullable) | 0025 |
| `uq_products_gtin` | Partial unique index | 0025 |
| `uq_products_ean` | Partial unique index | 0025 |
| `idx_products_mpn` | Non-unique index | 0027 |
| `idx_products_ptype` | Partial index | 0025 |
| FK `products.product_type_id → product_types.id` | Foreign key (ON DELETE SET NULL) | 0025 |

P2 is purely a service-layer change. No DDL required.

## 18. Frontend API Contract

**LOCKED:** P2 must update the web API TypeScript type for alignment.

**Target:** `apps/web/src/lib/buyer-api.ts` — `UpdateProductInput` interface

Add optional fields:
```typescript
productTypeId?: string | null;
gtin?: string | null;
ean?: string | null;
mpn?: string | null;
```

This is API contract alignment only. Do NOT implement:
- Admin Product Editor UI
- Merchant Product Studio edit UI

Those belong to later gates (P3, P6).

## 19. Test Contract

### Unit tests (minimum)

| ID | Test |
|----|------|
| U1 | GTIN update with correct updatedAt → 200 |
| U2 | EAN update with correct updatedAt → 200 |
| U3 | MPN update with correct updatedAt → 200 |
| U4 | productTypeId update with no variants/offers → 200 |
| U5 | productTypeId blocked by variants → 400 |
| U6 | productTypeId blocked by offers → 400 |
| U7 | productTypeId set to null → 200 |
| U8 | Non-existent productTypeId → 404 |
| U9 | GTIN duplicate → 400 |
| U10 | EAN duplicate → 400 |
| U11 | MPN duplicate allowed → 200 |
| U12 | Combined productTypeId + identifiers → 200 |
| U13 | Stale updatedAt with P2 fields → 409 |
| U14 | Empty string identifier → stored as null |
| U15 | Whitespace trimming |
| U16 | Self-identifier update (same GTIN) → 200 |
| U17 | Authorization (wrong tenant) |
| U18 | Lifecycle behavior (DRAFT/ACTIVE/REJECTED) |
| U19 | Invalid identifier length |

### PostgreSQL integration tests (minimum)

| ID | Test | Expected |
|----|------|----------|
| T1 | Identifier update + optimistic locking | 200, updated |
| T2 | Stale identifier update | 409 |
| T3 | Concurrent productTypeId changes | 1 win, 1 gets 409 |
| T4 | productTypeId vs variant creation | Serialized (FOR UPDATE vs FOR SHARE) |
| T5 | productTypeId vs offer creation | Documented race (§12) |
| T6 | Existing variants block productTypeId | 400 |
| T7 | Existing offers block productTypeId | 400 |
| T8 | Concurrent identifier updates | 1 win, 1 gets 409 |
| T9 | productTypeId vs normal product update | 1 win, 1 gets 409 |
| T10 | Wrong tenant | 403/404 |
| T11 | Missing product | 404 |
| T12 | Invalid identifier (too long) | 400 |
| T13 | Successful identifier update | 200 |
| T14 | Combined productTypeId + identifiers | 200 |
| T15 | GTIN uniqueness | 400 |
| T16 | Multiple concurrent variant creators (FOR SHARE) | All succeed; no productTypeId change crosses boundary |

All concurrency tests must use real PostgreSQL (Testcontainers).

## 20. Acceptance Criteria

| ID | Criterion | Status |
|----|-----------|--------|
| P2-01 | `UpdateProductInput` accepts optional `productTypeId` (string or null) | LOCKED |
| P2-02 | `UpdateProductInput` accepts optional `gtin` (string or null) | LOCKED |
| P2-03 | `UpdateProductInput` accepts optional `ean` (string or null) | LOCKED |
| P2-04 | `UpdateProductInput` accepts optional `mpn` (string or null) | LOCKED |
| P2-05 | GTIN update with correct updatedAt succeeds (200) | LOCKED |
| P2-06 | EAN update with correct updatedAt succeeds (200) | LOCKED |
| P2-07 | MPN update with correct updatedAt succeeds (200) | LOCKED |
| P2-08 | productTypeId update succeeds when no variants and no offers exist | LOCKED |
| P2-09 | productTypeId update rejected (400) when variants exist | LOCKED |
| P2-10 | productTypeId update rejected (400) when merchant offers exist (ALL statuses) | LOCKED |
| P2-11 | productTypeId can be set to null (clear type assignment) | LOCKED |
| P2-12 | Non-existent productTypeId → 404 | LOCKED |
| P2-13 | GTIN uniqueness enforced on update, excluding self (400 if taken) | LOCKED |
| P2-14 | EAN uniqueness enforced on update, excluding self (400 if taken) | LOCKED |
| P2-15 | MPN allows duplicates (no uniqueness constraint) | LOCKED |
| P2-16 | Stale updatedAt with P2 fields → 409 (P1 preserved) | LOCKED |
| P2-17 | Omitted updatedAt with P2 fields → legacy update (P1 preserved) | LOCKED |
| P2-18 | Tenant isolation: wrong-tenant P2 update → 403/404 | LOCKED |
| P2-19 | RBAC: no new permissions required | LOCKED |
| P2-20 | Lifecycle: P2 fields editable in DRAFT, ACTIVE, REJECTED | LOCKED |
| P2-21 | Transactional product row locking (FOR UPDATE for productTypeId, FOR SHARE for createVariant) | LOCKED |
| P2-22 | Empty string identifier stored as null | LOCKED |
| P2-23 | Backward compatible: existing clients unaffected | LOCKED |
| P2-24 | No migration 0054 required | LOCKED |
| P2-25 | Phase 3 regression: 432/432 baseline PASS | LOCKED |
| P2-26 | P1 regression: 12/12 unit + 13/13 integration PASS | LOCKED |
| P2-27 | TypeScript: 0 errors | LOCKED |
| P2-28 | Nest build: succeeds | LOCKED |

**P2-21 concurrency coverage:** Includes explicit testing of `createVariant()` FOR SHARE behavior (T16). Multiple concurrent variant creators must succeed; no productTypeId change may cross the variant-creation boundary.

## 21. Implementation Sequence

| Stage | Deliverable | Dependencies |
|-------|-------------|--------------|
| P2.0 | Baseline verification | P1 closed |
| P2.1 | UpdateProductInput expansion (add 4 fields) | P2.0 |
| P2.2 | Identifier normalization + update validation | P2.1 |
| P2.3 | GTIN/EAN uniqueness enforcement on update | P2.2 |
| P2.4 | Product type existence validation | P2.2 |
| P2.5 | Transactional productTypeId guard (FOR UPDATE) | P2.3, P2.4 |
| P2.6 | createVariant FOR SHARE concurrency protection | P2.5 |
| P2.7 | P1 optimistic locking integration verification | P2.5 |
| P2.8 | Web API TypeScript contract update | P2.1 |
| P2.9 | Unit tests | P2.1–P2.7 |
| P2.10 | PostgreSQL integration/concurrency tests | P2.5, P2.6 |
| P2.11 | Full regression (457+ baseline) | P2.9, P2.10 |
| P2.12 | Independent runtime verification | P2.11 |
| P2.13 | Release closure | P2.12 |

Do not skip the independent verification gate.

## 22. Non-Goals

Explicitly excluded from P2:

- Admin editor, admin attributes editor, admin variant management
- Merchant Product Studio edit mode, merchant variant editing
- Admin product list redesign
- Audit trail expansion
- Frontend conflict UX
- Variant deactivation
- GTIN dedup UI
- Performance/index redesign
- Mobile redesign
- Shipping, payment, returns, refunds, notifications
- GTIN/EAN check-digit validation
- createProduct redesign
- Import pipeline redesign
- JSONB attribute column removal
- Migration 0054

## 23. Risks

### RISK-P2-01: Offer creation concurrency race

**Severity:** LOW
**Description:** `createOffer()` does not acquire a product-row lock. A productTypeId change (FOR UPDATE) and offer creation can interleave. The offer is inserted without waiting for the product lock.
**Impact:** Offers don't depend on product type attribute schema. No data corruption. The BD-06 guard's primary purpose is variant/attribute integrity.
**Mitigation:** Documented in §12. Implementation agent must verify during implementation and report if actual data integrity issues are found.

### RISK-P2-02: bulkVariantOperations FOR SHARE coverage

**Severity:** MEDIUM
**Description:** `bulkVariantOperations()` in `catalog.service.ts` also creates variants (bulk create path). It must also acquire FOR SHARE on the product row.
**Mitigation:** P2 implementation must ensure ALL variant creation paths (single + bulk) acquire FOR SHARE.

### RISK-P2-03: Pre-P1 timestamp precision

**Severity:** LOW (inherited from P1)
**Description:** Rows created before P1 may have microsecond-precision `updatedAt`. P2 optimistic locking on these rows returns 409 on first attempt.
**Mitigation:** Same as P1 — safe behavior, no data loss.

## 24. Final Architecture Verdict

**P2 BUSINESS RULES + ARCHITECTURE: LOCKED / GO**

| Decision | Resolution |
|----------|------------|
| Conditions from P2 audit | ALL RESOLVED |
| Migration 0054 | NOT REQUIRED |
| Check-digit validation | DEFERRED |
| Normalization | TRIM + EMPTY→NULL ONLY |
| createVariant FOR SHARE | INCLUDED IN P2 |
| productTypeId guard | FOR UPDATE + TRANSACTION |
| GTIN/EAN uniqueness | ENFORCED ON UPDATE, EXCLUDING SELF |
| P1 optimistic locking | PRESERVED |
| Offer creation lock | DOCUMENTED RACE, DEFERRED (§12) |
| Offer count scope | ALL statuses (not just ACTIVE) |

**Conditions:** 0 unresolved
**Blockers:** 0

## 25. Next Step

**P2 IMPLEMENTATION**

Begin with P2.0 — Baseline Verification:
- Confirm branch `develop`, HEAD `0549e1f`
- Confirm migration 0053, no migration 0054
- Confirm 457/457 tests PASS
- Confirm TypeScript 0 errors, Nest build succeeds
- Then proceed to P2.1 — UpdateProductInput expansion

---

**Production files changed by this lock: 0**
**Database migrations created: 0**
**Schema changes: 0**
**Frontend implementation changes: 0**
