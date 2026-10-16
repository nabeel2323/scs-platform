# P13 Phase 3.1 — PostgreSQL Integration Report

## 1. Migration Verification

### Migration 0061 (Phase 3 — from prior session)
- **File:** `0061_phase3_financial_correctness.sql` (235 lines)
- **Status:** Applied to development PostgreSQL in prior session
- **Tables created:** `commission_reversals`, `settlement_adjustments`, `settlement_adjustment_approvals`, `reconciliation_runs`, `reconciliation_discrepancies`
- **Constraints:** 6 CHECK constraints, 2 unique indexes, multiple FK references
- **Idempotency:** All DDL uses `IF NOT EXISTS` / `IF EXISTS` guards

### Migration 0062 (Phase 3.1 — this session)
- **File:** `0062_phase3_1_hardening.sql` (81 lines)
- **Status:** Created, not yet applied (requires PostgreSQL instance)
- **Changes:**
  - `reconciliation_runs`: +`version`, +`superseded_by`, +`org_id`, +unique index
  - `settlement_adjustments`: +`org_id`, +`fx_evidence`, +`approval_hash`
  - `commission_reversals`: +`org_id`
  - `reconciliation_discrepancies`: +`org_id`
  - Fix `chk_settlement_adjustments_type` to include `DELIVERY_FEE_EXCEPTION`
- **Idempotency:** All `ADD COLUMN IF NOT EXISTS`, constraint drop/recreate guarded

### Rollback Safety
- **No destructive rollback SQL executed.** Per spec §10, no tables dropped, no migration-log deleted.
- Migration 0062 is forward-only. Reversing would require a separate migration 0063.

## 2. Integration Test Status

### Unit Tests (mocked, no PostgreSQL required)
- **Total:** 1819/1819 pass (94 files)
- **Returns-specific:** 208/208 pass (6 files)
- **Duration:** ~39 seconds

### PostgreSQL Integration Tests
- **Status:** NOT re-run in this session
- **Reason:** Docker/testcontainer dependency for PostgreSQL integration tests
- **Files:** `p13-returns.postgres.spec.ts`, `p13-financial-dispute.postgres.spec.ts`
- **Prior session:** Both files updated with new service dependencies (SettlementAdjustmentService, CommissionReversalService)
- **Pre-existing errors:** 7 × TS18048 in integration test files (all `'x' is possibly 'undefined'`)

### Pre-existing Flaky Test
- `webhook-rate-limiting.spec.ts` — timeout known to be flaky under load
- Not related to Phase 3.1 changes

## 3. Schema Constraint Verification (static analysis)

| Constraint | Table | Verified |
|-----------|-------|----------|
| `chk_settlement_status` | settlement_records | Includes ADJUSTMENT, REJECTED |
| `chk_commission_reversals_status` | commission_reversals | POSTED, REVERSED, FAILED |
| `chk_commission_reversals_amount` | commission_reversals | reversal_minor >= 0 AND <= original |
| `chk_commission_reversals_responsibility` | commission_reversals | MERCHANT, PLATFORM, CARRIER_DAMAGE, BUYER_REMORSE |
| `chk_settlement_adjustments_status` | settlement_adjustments | DRAFT..BLOCKED_FX (7 states) |
| `chk_settlement_adjustments_type` | settlement_adjustments | Includes DELIVERY_FEE_EXCEPTION (fixed in 0062) |
| `chk_settlement_adjustments_fx_status` | settlement_adjustments | NOT_REQUIRED, RESOLVED, BLOCKED, PENDING_REVIEW |
| `chk_settlement_adjustments_amount` | settlement_adjustments | amount_minor > 0 |
| `chk_reconciliation_runs_status` | reconciliation_runs | RUNNING, COMPLETED, FAILED, PARTIAL |
| Idempotency unique index | commission_reversals | `idempotency_key` unique |
| Approval unique index | settlement_adjustment_approvals | `(adjustment_id, approver_id)` unique |
| Version unique index | reconciliation_runs | `(period_start, period_end, currency, version)` unique |

## 4. Known Limitations

1. PostgreSQL integration tests not executed — Docker/testcontainer not available in this session.
2. Migration 0062 not applied to any database — requires PostgreSQL instance.
3. Historical orgId backfill not performed — existing records have null orgId.
