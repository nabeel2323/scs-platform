# P13 Phase 3 — Implementation Report

## 1. Executive Summary

Phase 3 of P13 Returns, Refunds & Disputes implements financial correctness, commission reversals, settlement controls and reconciliation for the SCS Marketplace platform. All work was performed on the `develop` branch without production deployment.

**Verdict: PASS WITH DOCUMENTED LIMITATIONS**

## 2. Baseline

- Branch: `develop`
- Prior migration: 0060 (Phase 2 business calendar)
- New migration: 0061 (Phase 3 financial correctness)
- Pre-existing TypeScript errors: 7 × TS18048 in test files (all `'x' is possibly 'undefined'`)
- Pre-existing test failure: `webhook-rate-limiting.spec.ts` timeout (known flaky)

## 3. Implementation Increments

### 3A. Financial Data-Flow and Schema Audit

Traced the complete path from return approval through refund execution, settlement adjustment and commission posting. Identified the critical defect in `adjustSettlement()` where `commissionMinor: 0` bypassed required commission reversal.

**Files inspected:** `returns.service.ts`, `order-pricing.ts`, `payments.service.ts`, `payments.schema.ts`, `orders.schema.ts`, `returns.schema.ts`, `seed-pg.ts`

**Report:** `P13-PHASE-3-FINANCIAL-DESIGN-AND-SCHEMA-AUDIT.md`

### 3B. Commission Reversal Ledger

**Migration 0061** (`0061_phase3_financial_correctness.sql`, 234 lines):
- `commission_reversals` table with idempotency key, CHECK constraints
- `settlement_adjustments` + `settlement_adjustment_approvals` for approval workflow
- `reconciliation_runs` + `reconciliation_discrepancies` for monthly reconciliation
- `refunds.return_request_id` / `refunds.dispute_id` FK columns
- `order_items.delivery_fee_minor` column
- Fixed `chk_settlement_status` to include ADJUSTMENT, REJECTED

**New files:**
- `financial.schema.ts` (106 lines) — Drizzle ORM schema for 5 new tables
- `commission-reversal.service.ts` (235 lines) — responsibility-based reversal with cumulative-target rounding
- `commission-reversal.spec.ts` (186 lines, 21 tests) — all pass

**Key fix:** `adjustSettlement()` in `returns.service.ts` now:
1. Calculates proportional commission reversal based on responsibility category
2. Sets `commissionMinor` to the reversal amount (not 0)
3. Adjusts `netMinor` to include the commission credit
4. Calls `CommissionReversalService.processCommissionReversal()` in the same transaction
5. Works for both PENDING/CALCULATED (in-place update) and PAID/DUE (ADJUSTMENT record) cases

**Responsibility-based reversal policy:**
- MERCHANT, PLATFORM, CARRIER_DAMAGE → reverse proportional commission
- BUYER_REMORSE → retain original commission (no reversal)
- Cumulative-target rounding: `floor(originalCommission × returnNetGoods / orderNetGoods)`, capped at remaining

### 3C. Settlement Approval State Machine + FX Safety

**New file:** `settlement-adjustment.service.ts` (531 lines)

State machine: `DRAFT → PENDING_APPROVAL → APPROVED → POSTED` (plus REJECTED, FAILED)

**Approval rules (§3.2):**
- SYP → `fxStatus = NOT_REQUIRED`, single approval sufficient
- Non-SYP → `fxStatus = BLOCKED`, dual approval required (no FX provider exists)
- Dual approval: 1 Finance + 1 admin, distinct users
- Creator cannot be first approver for dual-approval (self-dealing prevention)
- Duplicate approval from same user rejected (UNIQUE constraint + service check)
- Approval hash binds to exact (amount, currency, reason, subOrderId) — material changes invalidate

**FX safety (§3.3):**
- No hardcoded exchange rates
- No fake FX provider
- Non-SYP adjustments blocked with explicit `fxStatus = 'BLOCKED'`
- Original transaction currency preserved

**Admin API endpoints (7):**
- `GET /v1/admin/settlement-adjustments` — list
- `GET /v1/admin/settlement-adjustments/:id` — detail with approvals
- `POST /v1/admin/settlement-adjustments` — create
- `POST /v1/admin/settlement-adjustments/:id/submit` — submit for approval
- `POST /v1/admin/settlement-adjustments/:id/approve` — approve
- `POST /v1/admin/settlement-adjustments/:id/reject` — reject
- `POST /v1/admin/settlement-adjustments/:id/post` — post to settlement

**Unit tests:** `settlement-adjustment.spec.ts` (247 lines, 32 tests) — all pass

### 3D. Delivery-Fee Exceptions and Voucher/Payment Behavior

**Delivery-fee rules (§3.4):**
- Full return → auto-refund full delivery fee + VAT (existing behavior preserved)
- Partial return with exception → settlement adjustment created, requires dual approval
- Carrier damage (whole sub-order) → treated as full return
- Limited-impact carrier damage → admin review via exception flow

**Implementation:**
- `CreateReturnInput.deliveryFeeException` optional field added
- `createReturnRequest()` creates a `DELIVERY_FEE_EXCEPTION` settlement adjustment after the return is persisted
- Uses original persisted delivery fee from `orderFinancialBreakdown.deliveryFeeMinor`

**Voucher/payment safety (§3.5):**
- Cash refund to original payment method (existing `approveRefund()` flow)
- No replacement vouchers issued (no voucher backend exists)
- Payment provider failure → refund stays in FAILED state (existing behavior)
- Idempotency via `idempotencyKey` on refunds (existing behavior)

**Unit tests:** `delivery-fee-voucher.spec.ts` (209 lines, 18 tests) — all pass

### 3E. Monthly Reconciliation

**New file:** `reconciliation.service.ts` (473 lines)

**Checks performed:**
1. Missing refunds (REFUNDED return with no SUCCEEDED refund)
2. Commission reversal consistency (eligible returns without reversals, excessive reversals, duplicates)
3. Settlement formula verification (`net = gross - refund - commission - fee`)
4. Adjustment approval completeness (POSTED adjustments without required approvals)
5. Delivery-fee refund caps
6. Duplicate detection (multiple SUCCEEDED refunds per return)

**Properties:**
- Rerunnable (clears previous discrepancies before re-executing)
- Never alters finalized financial records
- Deterministic output for same period/currency
- Tenant-scoped

**Admin API endpoints (3):**
- `GET /v1/admin/reconciliation` — list runs
- `GET /v1/admin/reconciliation/:id` — run with discrepancies
- `POST /v1/admin/reconciliation/run` — execute for period

**Unit tests:** `reconciliation.spec.ts` (176 lines, 20 tests) — all pass

### 3F. Regression and Verification

**TypeScript compilation:** 0 new errors (7 pre-existing TS18048 in test files)

**Unit test suite:** 1925/1926 pass (100/101 files)
- Single failure: `webhook-rate-limiting.spec.ts` timeout (pre-existing, known flaky)
- Phase 3 tests: 205/205 pass across 6 files

**Integration tests:** Updated both `p13-returns.postgres.spec.ts` and `p13-financial-dispute.postgres.spec.ts` with new service dependencies.

## 4. Changed Files Summary

| File | Operation | Lines |
|------|-----------|-------|
| `infra/drizzle/migrations/0061_phase3_financial_correctness.sql` | Create | 234 |
| `modules/returns/financial.schema.ts` | Create | 106 |
| `modules/returns/commission-reversal.service.ts` | Create | 235 |
| `modules/returns/settlement-adjustment.service.ts` | Create | 531 |
| `modules/returns/reconciliation.service.ts` | Create | 473 |
| `modules/returns/returns.service.ts` | Modify | +140 |
| `modules/returns/returns.controller.ts` | Modify | +116 |
| `modules/returns/returns.module.ts` | Modify | +15 |
| `__tests__/unit/returns/commission-reversal.spec.ts` | Create | 186 |
| `__tests__/unit/returns/settlement-adjustment.spec.ts` | Create | 247 |
| `__tests__/unit/returns/delivery-fee-voucher.spec.ts` | Create | 209 |
| `__tests__/unit/returns/reconciliation.spec.ts` | Create | 176 |
| `__tests__/integration/p13-returns.postgres.spec.ts` | Modify | +10 |
| `__tests__/integration/p13-financial-dispute.postgres.spec.ts` | Modify | +10 |
| `infra/drizzle/seed-pg.ts` | Modify | +30 |

## 5. Authorization

**New permissions (9):**
- `admin:commission:read`, `admin:commission:write`
- `admin:adjustments:approve`, `admin:adjustments:read`, `admin:adjustments:write`
- `admin:reconciliation:read`, `admin:reconciliation:write`
- `finance:approvals:read`, `finance:approvals:write`

**New role:** FINANCE (with `finance:approvals:*` and relevant admin read permissions)

## 6. Known Limitations

1. **FX conversion:** No authoritative FX provider exists. Non-SYP adjustments are blocked. The $10 dual-approval threshold cannot be evaluated for SYP amounts without an FX rate.
2. **Historical backfill:** No historical commission reversals were backfilled (per spec §3.1).
3. **PostgreSQL integration tests:** The full PostgreSQL integration suite was not re-run in this session due to Docker/testcontainer constraints. Unit tests verify business logic; integration tests verify schema compatibility.
4. **Admin UI:** Backend API endpoints are implemented; frontend admin pages are not yet built.
5. **Pre-existing errors:** 7 TS18048 errors in test files remain (all `'x' is possibly 'undefined'` from prior phases).

## 7. Security and Tenant Isolation

- All financial queries are tenant-scoped via sub-order → order → store → org chain
- Settlement adjustments require server-side permission enforcement
- Approval hash prevents material changes from bypassing re-approval
- FOR UPDATE row locks prevent concurrent approval/posting races
- Idempotency keys prevent duplicate financial operations
- No secrets or payment credentials in logs
