# SCS Platform — M6.2 Production Hardening Audit

**Date:** 2026-09-27  
**Predecessor:** M6.1 (PASS)  
**Scope:** Migration formalization, inventory architecture documentation, regression verification  

---

## 1. Migration Formalization

### Finding from M6.1

The M6.1 release gate noted:
> "Migration script (`m6-fix-cart-constraint.ts`) is standalone, not integrated into Drizzle migration system. Should be converted to a formal migration before production deployment."

### Remediation

Created `infra/drizzle/migrations/0039_cart_offer_unique.sql` — a formal, idempotent SQL migration that:

1. Drops the legacy `cart_items_cart_id_variant_id_key` constraint (IF EXISTS)
2. Creates `cart_items_cart_variant_offer_unique` — partial unique index on `(cart_id, variant_id, offer_id) WHERE offer_id IS NOT NULL`
3. Creates `cart_items_cart_variant_legacy_unique` — partial unique index on `(cart_id, variant_id) WHERE offer_id IS NULL`

### Verification

| Check | Result |
|---|---|
| Migration file follows numbering convention | PASS (0039, after 0038) |
| Idempotent DDL only (IF EXISTS / IF NOT EXISTS) | PASS |
| No `_migration_log` writes (runner-owned) | PASS |
| Applied via `pnpm db:migrate` | PASS |
| Tracked in `_migration_log` | PASS |
| Schema matches expected state | PASS |
| Safe on fresh DB (no old constraint) | PASS |
| Safe on existing M6 DB (indexes already exist) | PASS |
| No data rewrite | PASS |

### Files

| File | Action |
|---|---|
| `infra/drizzle/migrations/0039_cart_offer_unique.sql` | NEW (28 lines) |
| `apps/api/scripts/m6-fix-cart-constraint.ts` | RETAINED (reference; no longer needed for production) |

---

## 2. Inventory Reservation Architecture

### ADR Created

`docs/architecture/ADR-0001-INVENTORY-RESERVATION-TIMING.md`

Documents the current reservation-at-acceptance model, its rationale, risks, and conditions for reconsideration.

### Key Findings

| Aspect | Status |
|---|---|
| Current behavior documented | Reservation at merchant ACCEPT |
| Concurrency protection | `SELECT ... FOR UPDATE` pessimistic locking |
| Idempotent release | `Math.max(0, ...)` clamping |
| Idempotent settlement | Net-outstanding calculation |
| Double-accept prevention | Optimistic locking (atomic UPDATE WHERE) |
| Stock movement ledger | RESERVE / RELEASE / SALE movements |
| No correctness bug found | Architecture is sound for B2B pilot |

### Risk Assessment

The primary risk (overselling between checkout and acceptance) is acceptable for the B2B pilot because:
- Low order volume makes conflicts rare
- No pre-payment means no financial impact
- Merchants can see pending orders and proactively reject
- The window is short (minutes to hours)

---

## 3. API Regression

| Suite | Tests | Result |
|---|---|---|
| M6 Runtime Verification | 41/41 | PASS |
| M6.1 Concurrency Stress | 4/4 | PASS |
| M6.1 Security Regression | 12/12 | PASS |
| Unit Tests (vitest) | 1013/1013 + 8 skipped | PASS |
| Catalog Seed (retry) | 8/8 | PASS |
| **Total** | **1078/1078** | **PASS** |

Note: Initial vitest run had 1 test file timeout (catalog-seed.postgres.spec.ts, 120s hook timeout — testcontainers startup delay). Retry passed cleanly. Not a code regression.

---

## 4. Web Regression

| Check | Result |
|---|---|
| `tsc --noEmit` (web) | 0 issues |
| `tsc --noEmit` (admin) | 0 issues |
| `tsc --noEmit` (api) | 0 issues |
| API build (nest build) | 192 files compiled, 0 issues |

---

## 5. Mobile Regression

| Check | Result |
|---|---|
| `dart analyze lib` | 0 issues |
| `flutter test` | 104/104 PASS |

---

## 6. Database Schema Verification

Post-migration schema state for `cart_items`:

```
Indexes:
  cart_items_pkey                          — PRIMARY KEY (id)
  cart_items_cart_variant_offer_unique     — UNIQUE (cart_id, variant_id, offer_id) WHERE offer_id IS NOT NULL
  cart_items_cart_variant_legacy_unique    — UNIQUE (cart_id, variant_id) WHERE offer_id IS NULL
  idx_cart_items_cart                      — INDEX (cart_id)
  idx_cart_items_offer                     — INDEX (offer_id) WHERE offer_id IS NOT NULL
  idx_cart_items_store                     — INDEX (store_id)
  idx_cart_items_variant                   — INDEX (variant_id)

Constraints:
  cart_items_pkey           — PRIMARY KEY
  cart_items_cart_id_fkey   — FK → carts(id)
  cart_items_store_id_fkey  — FK → stores(id)
  cart_items_variant_id_fkey — FK → product_variants(id)
  cart_items_offer_id_fkey  — FK → merchant_offers(id)
```

Old constraint `cart_items_cart_id_variant_id_key` — **NOT PRESENT** (correctly removed).

---

## 7. Migration Chain Verification

```
0001_identity.sql → ... → 0038_product_sources.sql → 0039_cart_offer_unique.sql
```

Total migrations: 37 (36 historical + 1 new)  
All tracked in `_migration_log`  
Excluded from CI: 0013_analytics.sql, 0018_analytics_retention.sql (require pg_partman)

---

## 8. Summary

| Domain | Status |
|---|---|
| Migration formalization | PASS |
| Inventory ADR | PASS |
| API regression (57/57) | PASS |
| Unit tests (1013/1013) | PASS |
| Web TypeScript | PASS |
| Mobile (104/104) | PASS |
| Database schema | PASS |
| Migration chain | PASS |
