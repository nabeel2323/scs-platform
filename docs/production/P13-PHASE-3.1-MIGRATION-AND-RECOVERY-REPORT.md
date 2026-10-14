# P13 Phase 3.1 — Migration and Recovery Report

## 1. Migration Inventory

| Migration | File | Lines | Status |
|-----------|------|-------|--------|
| 0061 | `0061_phase3_financial_correctness.sql` | 235 | Applied to dev PostgreSQL (prior session) |
| 0062 | `0062_phase3_1_hardening.sql` | 82 | Created, NOT applied (this session) |

## 2. Migration 0061 Summary (prior session)

**Tables created:**
- `commission_reversals` — responsibility-based commission recovery ledger
- `settlement_adjustments` — approval-workflow financial corrections
- `settlement_adjustment_approvals` — dual-approver audit trail
- `reconciliation_runs` — reconciliation execution history
- `reconciliation_discrepancies` — individual check failures

**Constraints (6 CHECK + 2 unique indexes):**
- `chk_settlement_status` — adds ADJUSTMENT, REJECTED to settlement_records
- `chk_commission_reversals_status` — POSTED, REVERSED, FAILED
- `chk_commission_reversals_amount` — `reversal_minor >= 0 AND <= original_commission_minor`
- `chk_commission_reversals_responsibility` — MERCHANT, PLATFORM, CARRIER_DAMAGE, BUYER_REMORSE
- `chk_settlement_adjustments_status` — 7 states including BLOCKED_FX
- `chk_settlement_adjustments_type` — 5 types (see defect below)
- `chk_settlement_adjustments_fx_status` — NOT_REQUIRED, RESOLVED, BLOCKED, PENDING_REVIEW
- `chk_settlement_adjustments_amount` — `amount_minor > 0`
- `chk_reconciliation_runs_status` — RUNNING, COMPLETED, FAILED, PARTIAL
- `idx_commission_reversals_idempotency` — unique on `idempotency_key`
- `idx_adjustment_approvals_unique` — unique on `(adjustment_id, approver_id)`

**Additional DDL:**
- `refunds` table: +`return_request_id`, +`dispute_id` columns
- `order_items` table: +`delivery_fee_minor` column (per-item delivery allocation)

## 3. Migration 0062 Summary (this session)

**Schema additions (all `ADD COLUMN IF NOT EXISTS`):**

| Table | Column | Type | Purpose |
|-------|--------|------|---------|
| `reconciliation_runs` | `version` | INTEGER NOT NULL DEFAULT 1 | Version tracking for reruns |
| `reconciliation_runs` | `superseded_by` | UUID FK → self | Link reruns to prior runs |
| `reconciliation_runs` | `org_id` | UUID | Tenant scoping |
| `settlement_adjustments` | `org_id` | UUID | Tenant isolation |
| `settlement_adjustments` | `fx_evidence` | JSONB | FX threshold evaluation audit trail |
| `settlement_adjustments` | `approval_hash` | VARCHAR(120) | Material-change detection |
| `commission_reversals` | `org_id` | UUID | Tenant isolation |
| `reconciliation_discrepancies` | `org_id` | UUID | Tenant isolation |

**New indexes:**
- `idx_reconciliation_runs_unique_version` — UNIQUE on `(period_start, period_end, currency, version)`
- `idx_reconciliation_runs_org` — on `reconciliation_runs(org_id)`
- `idx_settlement_adjustments_org` — on `settlement_adjustments(org_id)`
- `idx_commission_reversals_org` — on `commission_reversals(org_id)`
- `idx_reconciliation_discrepancies_org` — on `reconciliation_discrepancies(org_id)`

**Constraint fix:**
- `chk_settlement_adjustments_type` dropped and recreated to include `DELIVERY_FEE_EXCEPTION`
- Original 0061 constraint allowed 5 types; Phase 3 code uses 6 types including `DELIVERY_FEE_EXCEPTION`
- Without this fix, inserting a `DELIVERY_FEE_EXCEPTION` adjustment would violate the CHECK constraint

## 4. Idempotency Verification (static analysis)

| Statement | Guard | Safe on rerun |
|-----------|-------|---------------|
| `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` | PostgreSQL native guard | YES |
| `CREATE INDEX IF NOT EXISTS` | PostgreSQL native guard | YES |
| `CREATE UNIQUE INDEX IF NOT EXISTS` | PostgreSQL native guard | YES |
| `CREATE TABLE IF NOT EXISTS` | PostgreSQL native guard | YES |
| `ADD CONSTRAINT ... CHECK` | `IF NOT EXISTS` on `pg_constraint` | YES |
| Drop/recreate `chk_settlement_adjustments_type` | `IF EXISTS` on drop, unconditional add | YES (drop is guarded, add replaces) |
| `ALTER TABLE ... ADD CONSTRAINT` (recreate) | After guarded drop | YES |

**Double-application safety:** Running migration 0062 twice produces the same schema state. All `ADD COLUMN` use `IF NOT EXISTS`. All `CREATE INDEX` use `IF NOT EXISTS`. The constraint drop/recreate is wrapped in `IF EXISTS` + unconditional add.

## 5. Rollback Safety

### What was NOT done (per spec §10)
- **No tables dropped** — migration 0062 is additive-only
- **No migration-log entries deleted** — the runner owns bookkeeping
- **No destructive rollback SQL executed**
- **No production database modified**

### Rollback considerations
- Migration 0062 is **forward-only**. No rollback migration is provided.
- Reversing would require a new migration 0063 that:
  1. Drops the 5 new `org_id` columns (after data backfill or export)
  2. Drops `fx_evidence` and `approval_hash` columns
  3. Drops `version` and `superseded_by` from `reconciliation_runs`
  4. Recreates `chk_settlement_adjustments_type` without `DELIVERY_FEE_EXCEPTION`
  5. Drops 5 new indexes
- **Any rollback must be reviewed separately** and only after verifying whether financial data exists in the new columns.

### Recovery procedures
- **If migration 0062 fails mid-execution:** PostgreSQL transactional DDL ensures atomicity — either all statements succeed or none do (when wrapped in a transaction by the migration runner).
- **If constraint fix fails:** The old constraint (without DELIVERY_FEE_EXCEPTION) remains. Adjustments of type `DELIVERY_FEE_EXCEPTION` would fail until the constraint is fixed.
- **If org_id columns cause issues:** Columns are nullable, so existing application code that doesn't pass orgId continues to work. New code passes orgId optionally.

## 6. Baseline Verification

### Migration chain integrity
```
0058_payment_financial_architecture.sql
0059_*.sql (if exists)
0060_escalated_and_business_calendar.sql
0061_phase3_financial_correctness.sql  ← applied
0062_phase3_1_hardening.sql            ← created, pending application
```

### Prerequisites for migration 0062
- Migration 0061 must be applied first (creates the tables that 0062 modifies)
- Migration 0061 depends on tables from migrations 0001–0058 (users, orders, stores, settlement_records, return_requests, refunds)

### Schema consistency
- Drizzle schema (`financial.schema.ts`) updated to match post-0062 state
- All new columns have matching Drizzle column definitions
- No orphaned Drizzle columns without migration backing

## 7. Disposable PostgreSQL Verification

### Status: NOT EXECUTED
- **Reason:** Docker/testcontainer not available in this session environment
- **What would be tested:**
  1. Clean apply of migrations 0001–0062 on empty database
  2. Re-run of migration 0062 to verify idempotency
  3. CHECK constraint validation (insert valid/invalid data)
  4. Foreign key integrity (orphan rejection)
  5. Unique index enforcement (duplicate idempotency key rejection)
  6. org_id column presence and nullability
  7. Version column default and increment behavior

### Static verification performed
- All SQL syntax reviewed for PostgreSQL 14+ compatibility
- `IF NOT EXISTS` / `IF EXISTS` guards verified on all statements
- Column types match Drizzle schema definitions
- FK references point to existing tables/columns
- Index column orders match query patterns in service code

## 8. Known Limitations

1. **Migration 0062 not applied** — No PostgreSQL instance available in this session. Application to dev/test database is required before integration testing.
2. **No rollback migration** — Forward-only by design. Rollback would require separate migration 0063.
3. **Historical orgId backfill not performed** — Existing records in `settlement_adjustments`, `commission_reversals`, `reconciliation_runs`, `reconciliation_discrepancies` have `org_id = NULL`. A backfill query joining through `orders → stores → orgs` is recommended before production use.
4. **Constraint fix ordering** — If any `DELIVERY_FEE_EXCEPTION` records were somehow inserted before migration 0062 (which would have failed the old constraint), the drop/recreate is safe. If no such records exist, the constraint change is a no-op risk.
5. **Version default** — Existing `reconciliation_runs` rows get `version = 1` from the DEFAULT. If a rerun is attempted for the same period, the unique index on `(period_start, period_end, currency, version)` would reject version 1 if it already exists, forcing version 2+. This is correct behavior.
