# P13 Phase 3 — Migration and Rollback

## 1. Migration Identifier

**Migration 0061:** `0061_phase3_financial_correctness.sql`
- Location: `scs-platform/infra/drizzle/migrations/`
- Size: 234 lines
- Status: Created and applied to development PostgreSQL

## 2. Migration Contents

### New Tables (5)

| Table | Purpose | Key Constraints |
|-------|---------|-----------------|
| `commission_reversals` | Responsibility-based commission reversal ledger | UNIQUE(idempotency_key), CHECK(status), CHECK(reversal_minor >= 0) |
| `settlement_adjustments` | Approval workflow for financial adjustments | CHECK(status), CHECK(fx_status) |
| `settlement_adjustment_approvals` | Dual-approver tracking | UNIQUE(adjustment_id, approver_id) |
| `reconciliation_runs` | Monthly reconciliation execution records | CHECK(status) |
| `reconciliation_discrepancies` | Identified financial discrepancies | FK to reconciliation_runs |

### Schema Modifications (3)

| Change | Details |
|--------|---------|
| `chk_settlement_status` constraint | Added ADJUSTMENT, REJECTED to allowed values |
| `refunds.return_request_id` | FK to return_requests (nullable) |
| `refunds.dispute_id` | FK to disputes (nullable) |
| `order_items.delivery_fee_minor` | bigint, default 0 |

### Indexes

- `idx_commission_reversals_return` ON commission_reversals(return_request_id)
- `idx_commission_reversals_idempotency` ON commission_reversals(idempotency_key) UNIQUE
- `idx_settlement_adjustments_sub_order` ON settlement_adjustments(sub_order_id)
- `idx_settlement_adjustments_status` ON settlement_adjustments(status)
- `idx_reconciliation_discrepancies_run` ON reconciliation_discrepancies(run_id)

## 3. Migration Conventions

- Forward-only (no rewriting migration 0059 or 0060)
- Idempotent DDL: `IF NOT EXISTS`, `IF EXISTS`, `ON CONFLICT DO NOTHING`
- No `_migration_log` writes (handled by migration runner)
- All amounts in bigint minor units (halalas)
- Tenant isolation preserved (FK chains to orders/stores)
- No destructive operations (no DROP COLUMN, no data deletion)

## 4. Application Order

```
0058_payment_financial_architecture.sql  (P12 — already applied)
0059_return_requests.sql                 (P13 — already applied)
0060_business_calendar.sql               (Phase 2 — already applied)
0061_phase3_financial_correctness.sql    (Phase 3 — NEW)
```

## 5. Rollback Procedure

### Manual Rollback (if needed)

```sql
-- WARNING: Only execute if no financial data has been written to Phase 3 tables.
-- If commission_reversals, settlement_adjustments, or reconciliation_runs contain
-- data, consult the financial team before rolling back.

BEGIN;

-- Drop new tables (cascade drops dependent objects)
DROP TABLE IF EXISTS reconciliation_discrepancies CASCADE;
DROP TABLE IF EXISTS reconciliation_runs CASCADE;
DROP TABLE IF EXISTS settlement_adjustment_approvals CASCADE;
DROP TABLE IF EXISTS settlement_adjustments CASCADE;
DROP TABLE IF EXISTS commission_reversals CASCADE;

-- Remove added columns from refunds
ALTER TABLE refunds DROP COLUMN IF EXISTS return_request_id;
ALTER TABLE refunds DROP COLUMN IF EXISTS dispute_id;

-- Remove added column from order_items
ALTER TABLE order_items DROP COLUMN IF EXISTS delivery_fee_minor;

-- Restore original settlement status constraint
ALTER TABLE settlement_records DROP CONSTRAINT IF EXISTS chk_settlement_status;
ALTER TABLE settlement_records ADD CONSTRAINT chk_settlement_status
  CHECK (status IN ('PENDING', 'CALCULATED', 'DUE', 'PAID'));

-- Remove migration log entry
DELETE FROM _migration_log WHERE name = '0061_phase3_financial_correctness.sql';

COMMIT;
```

### Rollback Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Data in commission_reversals | HIGH | Export data before rollback; manual re-entry required |
| ADJUSTMENT settlements reference new constraint | MEDIUM | Revert settlements to CALCULATED status first |
| Refund-to-return linkage lost | LOW | return_request_id is nullable; existing refunds unaffected |
| Delivery fee data in order_items | LOW | Column default 0; existing orders unaffected |

### Rollback Verification

After rollback, verify:
```sql
-- Confirm tables removed
SELECT COUNT(*) FROM information_schema.tables
WHERE table_name IN ('commission_reversals', 'settlement_adjustments',
  'settlement_adjustment_approvals', 'reconciliation_runs', 'reconciliation_discrepancies');
-- Expected: 0

-- Confirm constraint restored
SELECT check_clause FROM information_schema.check_constraints
WHERE constraint_name = 'chk_settlement_status';
-- Expected: status IN ('PENDING', 'CALCULATED', 'DUE', 'PAID')
```

## 6. Code Rollback

If the migration is rolled back, the following code changes must also be reverted:
- `financial.schema.ts` — Drizzle schema for new tables
- `commission-reversal.service.ts` — Commission reversal logic
- `settlement-adjustment.service.ts` — Approval workflow
- `reconciliation.service.ts` — Monthly reconciliation
- `returns.service.ts` — adjustSettlement() fix, delivery-fee exception
- `returns.controller.ts` — Admin API endpoints
- `returns.module.ts` — Service registrations
- `seed-pg.ts` — New permissions and FINANCE role

## 7. No Production Deployment

**This migration has NOT been deployed to production.** It was applied only to the local development PostgreSQL instance. No production data is affected.
