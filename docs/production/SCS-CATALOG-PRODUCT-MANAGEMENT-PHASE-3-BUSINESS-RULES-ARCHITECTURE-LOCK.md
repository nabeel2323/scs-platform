# SCS Catalog/Product Management — Phase 3 Business Rules + Architecture Decision Lock

---

## §1 Executive Summary

| Item | Value |
|------|-------|
| **Milestone** | M7.3-C — Catalog Import + Product / Variant Management |
| **Phase** | Phase 3 — Attribute Storage Authority / Cutover |
| **Document type** | Business Rules + Architecture Decision Lock |
| **Predecessor audit** | `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-3-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md` |
| **Audit verdict** | GO WITH CONDITIONS |
| **Lock status** | **LOCKED / GO** |
| **Business Decisions** | BD-01 through BD-22 (22 decisions) |
| **Architecture Decisions** | AD-01 through AD-03 (3 decisions) |
| **Acceptance Criteria** | AC-01 through AC-14 (14 criteria) |
| **Unresolved decisions** | NONE |

All implementation-affecting decisions are locked. No business ambiguity remains. The Phase 3 audit confirmed that all JSONB attribute columns contain `{}` (empty), all typed attribute tables are empty, and the typed schema (migrations 0023–0025) is complete. The cutover reduces to wiring remaining write/read paths to typed tables, adding a production-safe backfill migration, and deprecating JSONB columns.

---

## §2 Predecessor Audit

| Item | Value |
|------|-------|
| Audit report | `docs/production/SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-3-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md` |
| Audit date | 2026-10-04 |
| Audit type | READ-ONLY architecture audit |
| Critical findings | 0 |
| High findings | 3 (F-1: variant matrix JSONB read, F-2: createVariant JSONB write, F-3: missing attribute endpoint) |
| Medium findings | 4 (F-4: CreateVariantInput JSONB type, F-5: DELETE+INSERT concurrency, F-6: missing tenant guard, F-7: updateVariant ignores attributes) |
| Low findings | 2 (F-8: orphaned client code, F-9: CSV export omits attributes) |

All HIGH and MEDIUM findings are addressed by locked decisions in this document.

---

## §3 Baseline

| Item | Value |
|------|-------|
| Branch | `develop` |
| HEAD | `0549e1f` |
| Latest migration | `0052_execution_error_tracking.sql` |
| Phase 1 status | CLOSED / PASS |
| Phase 2 status | CLOSED / PASS |
| Products | 10 rows |
| Variants | 10 rows |
| Non-empty JSONB `products.attributes` | 0 rows |
| Non-empty JSONB `product_variants.attributes` | 0 rows |
| `product_attribute_values` rows | 0 |
| `variant_attribute_values` rows | 0 |
| `attribute_definitions` rows | 0 |
| `attribute_groups` rows | 0 |
| `product_types` rows | 0 |

---

## §4 Business Decisions

### BD-01: Typed Attribute Tables Are Authoritative

**Decision**: The following tables are the sole authoritative storage for attribute data:

- `product_attribute_values`
- `variant_attribute_values`
- `attribute_definitions`
- `attribute_options`
- `attribute_groups`
- `product_types`
- `product_type_attributes`

JSONB columns `products.attributes` and `product_variants.attributes` are legacy/deprecated for attribute storage. After Phase 3, no code path shall treat JSONB as authoritative.

**Evidence**: Audit §4–§7 confirmed typed schema is complete with proper constraints, indexes, and FK relationships. Import executor already writes typed tables exclusively.

---

### BD-02: Backfill Migration Required

**Decision**: Create migration `0053_attribute_backfill.sql`.

The migration must:
- Be idempotent (safe to rerun)
- Be resumable (safe after interruption)
- Preserve valid existing data
- Process JSONB attribute data if it exists
- Safely skip `{}` and `null` JSONB values
- Resolve `attributeDefinitionId` keys against `attribute_definitions`
- Validate/coerce values according to typed attribute definitions
- Create missing typed rows
- Update existing typed rows only per BD-03 conflict policy
- Never silently destroy data

**Current expectation**: 0 JSONB rows require migration on the current database. The migration must nevertheless be production-safe for a database containing real JSONB attribute data.

---

### BD-03: Conflict Policy — Typed Is Authoritative

**Decision**: If JSONB and typed values disagree:
- Do NOT overwrite the typed value automatically
- Record the conflict (observable error/warning)
- Preserve the typed value as authoritative
- Make the conflict observable (log or audit entry)
- Do NOT silently discard either representation

**Implementation guidance**: Prefer the simplest durable mechanism consistent with the existing catalog import/error architecture. Do NOT create a permanent conflict table unless implementation evidence demonstrates persistent storage is required. Log-based conflict reporting is acceptable for the backfill migration.

---

### BD-04: Empty JSONB Policy

**Decision**: For `{}` or `null` JSONB values, the backfill performs no attribute write. Do not create meaningless typed rows.

---

### BD-05: Unknown Attribute Policy

**Decision**: If JSONB contains an attribute definition ID/code that cannot be resolved:
- Classify as an error
- Do NOT create a typed row
- Preserve the source JSONB data (do not delete or modify)
- Produce an observable migration error (log entry)
- Do NOT silently invent an attribute definition

---

### BD-06: Invalid Attribute Value Policy

**Decision**: If an existing JSONB value cannot be safely converted to the attribute definition's declared type:
- Classify as an error
- Do NOT write a corrupted typed value
- Preserve the source JSONB value
- Make the error observable (log entry)
- Continue processing independent records where transaction boundaries permit

No silent rounding, truncation, or type coercion that changes semantic meaning.

---

### BD-07: No Dual-Write Period — Typed-Only Writes

**Decision**: New attribute writes become typed-only during Phase 3. Do NOT write new attribute data into JSONB.

Applies to:
- `createVariant()` — must write `variant_attribute_values`, not `product_variants.attributes`
- Product Studio attribute writes — must use `setProductAttributeValues()`
- Variant attribute writes — must use `setVariantAttributeValues()`
- Product attribute writes — must use `setProductAttributeValues()`

**Rationale**: Current JSONB is always `{}`. Import already writes typed tables. A dual-write period adds complexity without benefit.

---

### BD-08: No Dual-Read Fallback — Typed-Only Reads

**Decision**: Typed tables are the only authoritative read source for attributes. Do NOT implement JSONB fallback reads.

If typed data is absent, return the typed representation according to the existing API contract (empty array or null). Do NOT silently fall back to JSONB.

---

### BD-09: Variant Matrix Must Use Typed Reads

**Decision**: `getVariantMatrix()` must read from `variant_attribute_values` joined with `attribute_definitions` instead of `product_variants.attributes` (JSONB).

The variant matrix must not depend on JSONB attributes. This is mandatory before Phase 3 can be declared complete.

**Addresses**: Audit Finding F-1 (HIGH).

---

### BD-10: createVariant Typed Attribute Persistence

**Decision**: `createVariant()` must no longer persist attribute values into `product_variants.attributes`.

Attribute values supplied during variant creation must be persisted into `variant_attribute_values` using the existing typed attribute validation/coercion mechanisms (`coerceValue()`, `loadDefsForScope()`).

Variant creation and its typed attribute persistence must be atomic (single database transaction per BD-17). If variant creation succeeds but typed attribute persistence fails, the entire operation must roll back.

**Addresses**: Audit Finding F-2 (HIGH).

---

### BD-11: updateVariant Attribute Contract

**Decision**: `updateVariant()` must have an explicit attribute mutation contract. Choose one:

**Selected contract**: **B — A dedicated typed attribute endpoint owns attribute updates.**

Rationale: The existing Product Studio architecture already defines `setVariantAttributeValues()` as the authoritative attribute write method. The `PUT /v1/products/:productId/variants/:variantId/attribute-values` endpoint (BD-13) owns variant attribute updates.

`updateVariant()` must NOT silently accept or ignore attribute fields. If `CreateVariantInput.attributes` is supplied to `updateVariant()`, the API must either:
- Reject with a clear error directing to the typed attribute endpoint, OR
- Explicitly delegate to the typed attribute endpoint

**Addresses**: Audit Finding F-7 (MEDIUM).

---

### BD-12: Product Attribute Endpoint

**Decision**: Wire the existing intended endpoint:

```
PUT /v1/products/:id/attribute-values
```

to `setProductAttributeValues()`.

The endpoint must enforce:
- Authentication (`JwtAuthGuard`)
- RBAC (`PermissionsGuard` with appropriate permission)
- Tenant/product ownership (`assertProductInOrg()`)
- Attribute validation (scope, type coercion)
- Typed persistence (`product_attribute_values`)
- Transaction safety (atomic replacement per BD-16)

It must NOT write JSONB attributes.

**Addresses**: Audit Finding F-3 (HIGH).

---

### BD-13: Variant Attribute Endpoint

**Decision**: Expose the endpoint:

```
PUT /v1/products/:productId/variants/:variantId/attribute-values
```

wired to `setVariantAttributeValues()`.

It must enforce:
- Authentication (`JwtAuthGuard`)
- RBAC (`PermissionsGuard`)
- Product ownership verification
- Variant belongs to product verification
- Tenant isolation (`assertProductInOrg()`)
- Typed validation (`coerceValue()`, `loadDefsForScope()`)
- Transaction safety (atomic replacement per BD-16)
- Combination key recomputation

Do NOT introduce this endpoint if inspection proves an existing equivalent endpoint already exists. (Audit confirmed: no equivalent endpoint exists.)

---

### BD-14: Tenant Security on All Attribute Endpoints

**Decision**: Any attribute write endpoint MUST verify product/variant ownership via `assertProductInOrg()` or equivalent tenant enforcement.

No controller may directly invoke `setProductAttributeValues()` or `setVariantAttributeValues()` without tenant/ownership enforcement.

Cross-organization attribute writes must be rejected with a permission error.

**Addresses**: Audit Finding F-6 (MEDIUM).

---

### BD-15: Concurrency Protection

**Decision**: The existing DELETE + INSERT replacement pattern in `setProductAttributeValues()` and `setVariantAttributeValues()` must be made concurrency-safe.

Protect the parent entity using PostgreSQL row locking:

```sql
SELECT ... FOR UPDATE
```

on the parent product/variant row before performing DELETE + INSERT.

Do NOT introduce process-local locks (e.g., mutex, semaphore) as the primary protection. The database must be the concurrency authority.

**Addresses**: Audit Finding F-5 (MEDIUM).

---

### BD-16: Atomic Attribute Replacement

**Decision**: Attribute replacement operations are atomic.

If the request contains N attributes, the final typed representation must exactly match the validated requested set. No partially updated attribute set may become visible.

Failure must roll back the entire attribute replacement operation.

---

### BD-17: Product/Variant Transaction Boundary

**Decision**: When `createVariant()` creates both the variant row and its typed attributes, they must share one database transaction.

Do NOT create the variant in one committed transaction and typed attributes in a second independent transaction.

---

### BD-18: JSONB API Deprecation

**Decision**: Phase 3 may remove JSONB `attributes` from API response DTOs once typed reads are proven.

At minimum:
- Stop returning JSONB attributes as authoritative data
- Mark the schema fields `@deprecated` in Drizzle schema comments
- Document the deprecation for API consumers

Do NOT drop the database columns during Phase 3 (see BD-19).

---

### BD-19: JSONB Column Removal Deferred

**Decision**: DO NOT DROP `products.attributes` or `product_variants.attributes` during Phase 3.

Column removal requires:
- Separate architecture decision
- Separate migration
- Separate release
- Compatibility analysis for external API consumers

Phase 3 must leave the columns physically present in the database.

---

### BD-20: Product Studio UI Not In Scope

**Decision**: Phase 3 implements the backend/API foundation required for Product Studio attributes.

Do NOT redesign Product Studio UI during Phase 3. Product Studio UI redesign belongs to the later Product Management UX phase (Phase 4 of the locked specification).

---

### BD-21: Import Compatibility

**Decision**: Catalog import remains typed-table based.

Phase 3 must NOT regress:
- 12-transaction architecture (Phase 2)
- SAVEPOINT isolation (Phase 2)
- ROOT_ERROR / DEPENDENCY_ERROR classification (Phase 2)
- Retry without re-upload (Phase 2)
- Idempotency (Phase 2)

Import must continue writing `product_attribute_values` and `variant_attribute_values`. Import must NOT begin writing JSONB attributes.

---

### BD-22: Search/Facets Unchanged

**Decision**: Existing search facets that already use `product_attribute_values` remain unchanged.

Do NOT redesign search or facets during Phase 3.

---

## §5 Architecture Decisions

### AD-01: Migration Safety

**Decision**: Migration `0053_attribute_backfill.sql` must:
- Never modify migration 0051 or 0052
- Be idempotent (`IF NOT EXISTS`, `ON CONFLICT`)
- Preserve data (no destructive operations)
- Have deterministic behavior
- Be verified on a fresh database
- Be verified on the existing database
- Be verified on a database containing synthetic JSONB attribute data
- Be safe to rerun without side effects

If implementation requires destructive behavior: STOP and report.

---

### AD-02: Backfill Transaction Strategy

**Decision**: The backfill must be safe for production-scale databases.

Do NOT assume the current 20-row dataset represents production scale.

Use bounded batches. Target batch size: 500–1000 entities (implementation must choose a safe value based on actual query behavior).

Avoid one massive transaction spanning all rows.

The migration must be resumable/idempotent — a second run produces no changes.

---

### AD-03: Backfill Concurrency

**Decision**: Do NOT use unsafe process-local coordination.

Where concurrent execution is possible, use PostgreSQL mechanisms:
- Row locking (`SELECT ... FOR UPDATE`)
- `SKIP LOCKED` for batch selection
- Advisory locks if justified

The implementation must not produce duplicate typed rows or inconsistent attribute values.

---

## §6 Data Authority

| Data Type | Authoritative Source | Deprecated Source |
|-----------|---------------------|-------------------|
| Product attributes | `product_attribute_values` | `products.attributes` (JSONB) |
| Variant attributes | `variant_attribute_values` | `product_variants.attributes` (JSONB) |
| Attribute definitions | `attribute_definitions` | N/A |
| Attribute options | `attribute_options` | N/A |
| Attribute groups | `attribute_groups` | N/A |
| Product type attributes | `product_type_attributes` | N/A |
| Product types | `product_types` | N/A |

---

## §7 Backfill Rules

| Rule | Locked By | Detail |
|------|-----------|--------|
| Idempotent | BD-02, AD-01 | Safe to rerun, no side effects |
| Resumable | BD-02, AD-02 | Safe after interruption |
| Batch-bounded | AD-02 | 500–1000 rows per batch |
| Skip empty | BD-04 | `{}` and `null` → no write |
| Unknown attr → error | BD-05 | Log + skip, no silent invention |
| Invalid value → error | BD-06 | Log + skip, no corruption |
| Conflict → typed wins | BD-03 | Typed value preserved, conflict logged |
| No data destruction | BD-02, AD-01 | Source JSONB never modified |
| DB concurrency | AD-03 | PostgreSQL mechanisms only |

---

## §8 Conflict Rules

| Scenario | Classification | Resolution |
|----------|---------------|------------|
| JSONB has value, typed missing | CREATE | Insert typed row from JSONB |
| Typed has value, JSONB missing | SKIP | Typed is authoritative, no action |
| Both have same value | SKIP | Already consistent |
| Both have different values | CONFLICT | Preserve typed, log conflict |
| JSONB has unknown attribute | ERROR | Log error, skip row |
| JSONB has invalid value type | ERROR | Log error, skip row |
| JSONB is `{}` or `null` | SKIP | No action per BD-04 |

---

## §9 API Rules

| Rule | Locked By | Detail |
|------|-----------|--------|
| Product attribute endpoint | BD-12 | `PUT /v1/products/:id/attribute-values` |
| Variant attribute endpoint | BD-13 | `PUT /v1/products/:pid/variants/:vid/attribute-values` |
| Tenant guard required | BD-14 | `assertProductInOrg()` on all attribute writes |
| No JSONB writes | BD-07 | All new writes go to typed tables |
| No JSONB reads | BD-08 | All reads from typed tables |
| JSONB API deprecation | BD-18 | Mark deprecated in DTOs/schema |

---

## §10 Product Studio Backend Rules

| Rule | Locked By | Detail |
|------|-----------|--------|
| Backend endpoints wired | BD-12, BD-13 | Product + variant attribute value endpoints |
| RBAC enforced | BD-14 | Permission guards on all endpoints |
| Tenant isolation | BD-14 | `assertProductInOrg()` |
| Typed validation | BD-10 | `coerceValue()` + `loadDefsForScope()` |
| Atomic replacement | BD-16 | DELETE + INSERT in single TX with FOR UPDATE |
| No UI changes | BD-20 | Backend only; UI redesign is Phase 4 |

---

## §11 Variant Rules

| Rule | Locked By | Detail |
|------|-----------|--------|
| createVariant typed writes | BD-10 | Write `variant_attribute_values`, not JSONB |
| createVariant atomic | BD-17 | Variant + attributes in single TX |
| updateVariant contract | BD-11 | Dedicated endpoint owns attribute updates |
| Variant matrix typed read | BD-09 | Read from `variant_attribute_values` |
| Combination key | BD-13 | Recomputed on typed attribute write |

---

## §12 Tenant/RBAC Rules

| Rule | Locked By | Detail |
|------|-----------|--------|
| Product ownership | BD-14 | `assertProductInOrg()` before any attribute write |
| Cross-org rejection | BD-14 | Permission error for cross-organization writes |
| Permission guard | BD-12, BD-13 | `PermissionsGuard` with appropriate permission key |
| Auth guard | BD-12, BD-13 | `JwtAuthGuard` on all attribute endpoints |

---

## §13 Concurrency Rules

| Rule | Locked By | Detail |
|------|-----------|--------|
| Row locking | BD-15 | `SELECT ... FOR UPDATE` on parent entity |
| No process locks | BD-15 | Database is concurrency authority |
| Atomic replacement | BD-16 | No partial attribute sets visible |
| Backfill batch safety | AD-03 | `SKIP LOCKED` or advisory locks |
| No duplicate rows | AD-03 | UNIQUE constraints + proper locking |

---

## §14 Transaction Rules

| Rule | Locked By | Detail |
|------|-----------|--------|
| Variant + attributes atomic | BD-17 | Single TX for `createVariant()` + typed attrs |
| Attribute replacement atomic | BD-16 | DELETE + INSERT in single TX |
| Import unchanged | BD-21 | Phase 2 12-TX architecture preserved |
| Backfill batched | AD-02 | Bounded batches, not one giant TX |
| Rollback on failure | BD-10, BD-16 | Entire operation rolls back on error |

---

## §15 Migration Rules

| Rule | Locked By | Detail |
|------|-----------|--------|
| Migration number | BD-02 | `0053_attribute_backfill.sql` |
| No prior migration changes | AD-01 | 0051, 0052 untouched |
| Idempotent DDL | AD-01 | `IF NOT EXISTS`, `ON CONFLICT` |
| Data preservation | AD-01 | No destructive operations |
| Deterministic | AD-01 | Same input → same output |
| Fresh DB verified | AD-01 | Must apply to empty database |
| Existing DB verified | AD-01 | Must apply to current state |
| Synthetic data verified | AD-01 | Must handle real JSONB data |
| Safe to rerun | AD-01 | Second run produces no changes |
| Batch-bounded | AD-02 | 500–1000 rows per batch |
| DB concurrency | AD-03 | PostgreSQL mechanisms |

---

## §16 Deprecation Rules

| Rule | Locked By | Detail |
|------|-----------|--------|
| JSONB columns stay | BD-19 | No DROP COLUMN in Phase 3 |
| Schema marked deprecated | BD-18 | `@deprecated` JSDoc on JSONB columns |
| API DTOs updated | BD-18 | Stop returning JSONB as authoritative |
| Column removal deferred | BD-19 | Separate decision + migration + release |

---

## §17 Scope

### In Scope

1. Migration `0053_attribute_backfill.sql`
2. Typed-table authority enforcement
3. Typed-only new attribute writes
4. `getVariantMatrix()` typed read fix
5. Product attribute endpoint (`PUT /products/:id/attribute-values`)
6. Variant attribute endpoint (`PUT /products/:pid/variants/:vid/attribute-values`)
7. `createVariant()` typed attribute persistence
8. `updateVariant()` attribute contract resolution
9. Tenant enforcement on all attribute endpoints
10. Concurrency protection (SELECT FOR UPDATE)
11. Atomic replacement semantics
12. API/schema JSONB deprecation
13. Phase 3 regression tests (T1–T20)
14. Migration verification (fresh, existing, synthetic)
15. Independent runtime verification
16. Release closure

### Non-Goals (Out of Scope)

- Dropping JSONB columns (BD-19)
- Product Studio UI redesign (BD-20)
- Admin Product Management redesign
- Search/facet redesign (BD-22)
- GTIN deduplication (Phase 5)
- Performance indexes (Phase 6)
- Payment, refunds, shipping, fulfillment, returns
- Notifications, Arabic/RTL, mobile catalog
- Unrelated infrastructure
- Future phases (4, 5, 6)

---

## §18 Implementation Sequence

| Stage | Description | Dependencies |
|-------|-------------|--------------|
| **P0** | Data/schema readiness verification | None |
| **P1** | Migration `0053_attribute_backfill.sql` | P0 |
| **P2** | Fix `getVariantMatrix()` → typed read | P0 |
| **P3** | Wire typed attribute endpoints + tenant guards | P0 |
| **P4** | Redirect `createVariant()` to typed writes | P1, P3 |
| **P5** | Resolve `updateVariant()` attribute contract | P3 |
| **P6** | Concurrency/transaction hardening (FOR UPDATE) | P3 |
| **P7** | API/schema JSONB deprecation | P2, P4 |
| **P8** | Full regression + migration verification | P1–P7 |
| **P9** | Independent Runtime Verification | P8 |
| **P10** | Release Closure | P9 |

P9 and P10 are separate gates — do NOT begin automatically during implementation.

---

## §19 Test Contract

| ID | Scenario | Category | Priority |
|----|----------|----------|----------|
| T1 | Clean JSONB → typed backfill | Backfill | HIGH |
| T2 | Empty JSONB `{}` → SKIP | Backfill | HIGH |
| T3 | Missing typed row → CREATE | Backfill | HIGH |
| T4 | Existing typed row → idempotent behavior | Backfill | HIGH |
| T5 | Conflicting JSONB/typed values | Backfill | MEDIUM |
| T6 | Unknown attribute definition → ERROR | Backfill | MEDIUM |
| T7 | Partial failure + safe resume | Backfill | HIGH |
| T8 | Second backfill run → no duplicate/corruption | Backfill | HIGH |
| T9 | `createVariant()` writes typed attributes | Variant | HIGH |
| T10 | Product attribute replacement (atomic) | Endpoint | HIGH |
| T11 | Variant attribute replacement (atomic) | Endpoint | HIGH |
| T12 | Variant matrix typed read | Read path | HIGH |
| T13 | Product detail typed attributes | Read path | HIGH |
| T14 | Search facets regression | Read path | HIGH |
| T15 | Concurrent product attribute updates | Concurrency | MEDIUM |
| T16 | Concurrent variant attribute updates | Concurrency | MEDIUM |
| T17 | Import vs attribute update concurrency | Concurrency | MEDIUM |
| T18 | Cross-tenant rejection | Security | HIGH |
| T19 | Transaction rollback | Safety | HIGH |
| T20 | JSONB API deprecation behavior | Deprecation | MEDIUM |

Real PostgreSQL/Testcontainers required for database behavior, concurrency, and migration tests. Mocks alone are insufficient.

---

## §20 Acceptance Criteria

| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| AC-01 | Typed tables are authoritative | Code review + runtime test |
| AC-02 | No new attribute writes go to JSONB | Code review + integration test |
| AC-03 | No attribute reads depend on JSONB | Code review + integration test |
| AC-04 | Variant matrix uses typed attributes | Runtime test with typed data |
| AC-05 | Product Studio backend attribute endpoint works securely | Endpoint test + tenant test |
| AC-06 | create/update variant attribute behavior is explicit and correct | Integration test |
| AC-07 | Tenant isolation is verified | Cross-org rejection test |
| AC-08 | Concurrent attribute updates are safe | Concurrency test with FOR UPDATE |
| AC-09 | Migration 0053 is idempotent and data-safe | Fresh DB + existing DB + rerun test |
| AC-10 | Synthetic JSONB backfill test passes | Insert synthetic JSONB → backfill → verify |
| AC-11 | Import regression remains green | Full catalog-import test suite |
| AC-12 | Phase 1/Phase 2 regression remains green | Phase 1 (16 tests) + Phase 2 (14 tests) |
| AC-13 | TypeScript/build passes | `tsc --noEmit` for API + Admin |
| AC-14 | Independent runtime verification passes | 26+ VR items against live PostgreSQL |

---

## §21 Governance / Release Gates

Phase 3 follows the standard four-gate sequence:

```
Gate 1: Pre-Implementation Audit        → COMPLETE (GO WITH CONDITIONS)
Gate 2: Business Rules / Arch Lock      → THIS DOCUMENT (LOCKED / GO)
Gate 3: Implementation                  → PENDING (P0–P8)
Gate 4: Independent Runtime Verification → PENDING (P9)
Gate 5: Release Closure                  → PENDING (P10)
```

Hard stops between gates:
- Implementation must not begin verification/closure
- Verification must not modify production code
- Closure must not implement next phase

---

## §22 Final Decision

```
PHASE 3 BUSINESS RULES + ARCHITECTURE DECISION LOCK: LOCKED / GO
```

| Item | Value |
|------|-------|
| Lock document | `docs/production/SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-3-BUSINESS-RULES-ARCHITECTURE-LOCK.md` |
| Business Decisions | 22 (BD-01 through BD-22) |
| Architecture Decisions | 3 (AD-01 through AD-03) |
| Acceptance Criteria | 14 (AC-01 through AC-14) |
| Test Requirements | 20 (T1 through T20) |
| Implementation Stages | 11 (P0 through P10) |
| Unresolved decisions | NONE |
| Lock status | **LOCKED / GO** |

**NEXT STEP**: Phase 3 Implementation — beginning with P0 (data/schema readiness verification), P1 (migration 0053), P2 (variant matrix fix), P3 (typed attribute endpoints).

**DO NOT IMPLEMENT IN THIS TASK.**
