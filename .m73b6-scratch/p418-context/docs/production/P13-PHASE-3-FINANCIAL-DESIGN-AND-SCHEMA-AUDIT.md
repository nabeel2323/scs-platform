# P13 Phase 3 — Financial Design & Schema Audit

**Date:** 2026-10-13
**Branch:** `develop` (HEAD: `8d60e36`)

---

## 1. Existing Financial Architecture

### 1.1 Commission Calculation

**Location:** `apps/api/src/modules/orders/order-pricing.ts`

```typescript
commissionMinor = Math.round(netGoods * commissionRate)
```

- Commission is calculated on **net goods only** (subtotal − discount), NOT on VAT or delivery
- Default rate: 5% (`COMMISSION_RATE` env var)
- Stored in `order_financial_breakdown.commission_minor` (immutable after checkout)
- Also captured in `settlement_records.commission_minor` at settlement calculation time

### 1.2 Settlement Records

**Schema:** `settlement_records` (migration 0058)

| Column | Type | Purpose |
|--------|------|---------|
| `gross_minor` | bigint | Original confirmed payment amount |
| `refund_minor` | bigint | Total refunded amount |
| `commission_minor` | bigint | Original commission (NOT adjusted for returns) |
| `fee_minor` | bigint | Delivery fees |
| `net_minor` | bigint | gross − refund − commission − fee |
| `status` | varchar | PENDING, CALCULATED, DUE, PAID |

**Formula:** `net = gross - refund - commission - fee`

**Key invariant:** `order_financial_breakdown` is immutable after checkout. Settlement derives from it.

### 1.3 Current adjustSettlement() — THE DEFECT

**Location:** `returns.service.ts` line 898-935

When a return is refunded after settlement is PAID/DUE:
```typescript
await tx.insert(settlementRecords).values({
  grossMinor: 0,
  refundMinor: refundAmountMinor,
  commissionMinor: 0,     // ← DEFECT: should reverse proportional commission
  feeMinor: 0,
  netMinor: -refundAmountMinor,
  status: 'ADJUSTMENT',   // ← Note: not in CHECK constraint!
});
```

**Defects identified:**
1. `commissionMinor: 0` — no commission reversal occurs
2. `status: 'ADJUSTMENT'` — not in the CHECK constraint `chk_settlement_status` (PENDING, CALCULATED, DUE, PAID only)
3. No responsibility-based logic — all returns get the same treatment regardless of category
4. No approval workflow for post-paid adjustments
5. No idempotency key — concurrent calls could create duplicate adjustments

### 1.4 Refund Flow

1. Return transitions to `REFUND_PENDING` → `createRefundRequest()` calls `payments.requestRefund()`
2. Refund created with status `REQUESTED`, idempotency key `return-refund:{returnId}`
3. Admin approves via `payments.approveRefund()` → status `SUCCEEDED`
4. Payment status updated (PARTIALLY_REFUNDED or REFUNDED)
5. Outbox event `payment.refund_succeeded` published

### 1.5 Payment Provider

- `ManualVerificationProvider` — only provider registered
- Supports: `verifyPayment()`, `refund()` (marks as SUCCEEDED immediately)
- No real external payment integration
- Voucher is a payment method but has no dedicated balance table

### 1.6 Currency / FX

- All amounts in `SYP` (Syrian Pound)
- No FX provider configured
- No exchange rate table exists
- **Decision:** Implement safe blocked/pending-review state for USD threshold checks

### 1.7 Roles & Permissions

**Existing relevant permissions:**
- `admin:refunds:approve` — approve refund requests
- `admin:settlements:write` / `admin:settlements:read` — settlement oversight
- `admin:returns:read` / `admin:returns:write` — return management

**Missing for Phase 3:**
- No `FINANCE` role (needed for dual-approver threshold)
- No `admin:commission:read/write` permissions
- No `admin:reconciliation:read/write` permissions
- No `admin:adjustments:approve` permission

### 1.8 Voucher Model

- `payment_records.voucher_code` — stores voucher code used
- No dedicated voucher balance/redemption table
- No mechanism to preserve unused voucher balance on refund
- **Decision:** Document as unsupported; refund goes to original cash payment method only

---

## 2. Schema Gaps Requiring New Migration(s)

### 2.1 Commission Reversals Table
```sql
commission_reversals (
  id, return_request_id, refund_id, settlement_id,
  original_commission_minor, reversal_minor,
  responsibility_category, idempotency_key,
  status, created_by, notes, created_at
)
```

### 2.2 Settlement Adjustments Table (Approval Workflow)
```sql
settlement_adjustments (
  id, settlement_id, sub_order_id, return_request_id,
  type, amount_minor, currency, usd_equivalent_minor,
  fx_rate_source, fx_rate, fx_status,
  status, reason, created_by,
  requires_dual_approval, approval_count,
  notes, created_at, updated_at
)
```

### 2.3 Settlement Adjustment Approvals
```sql
settlement_adjustment_approvals (
  id, adjustment_id, approver_id, approver_role,
  approved_at, notes
)
-- UNIQUE(adjustment_id, approver_id) prevents duplicate approval
```

### 2.4 Reconciliation
```sql
reconciliation_runs (
  id, period_start, period_end, currency,
  status, summary, discrepancy_count,
  executed_by, created_at, completed_at
)

reconciliation_discrepancies (
  id, run_id, discrepancy_type, source_ref,
  expected_minor, actual_minor, delta_minor,
  description, resolved, resolved_at, resolved_by
)
```

### 2.5 Schema Constraint Fixes
- Add `ADJUSTMENT` to `chk_settlement_status` CHECK constraint
- Add new permissions to seed data
- Add FINANCE role

---

## 3. Financial Invariants Discovered

1. **`order_financial_breakdown` is immutable** — never mutated after checkout
2. **Settlement formula is deterministic** — `net = gross - refund - commission - fee`
3. **Commission basis is net goods** — VAT and delivery excluded
4. **Refund idempotency** — `return-refund:{returnId}` key prevents duplicate refunds
5. **Cumulative refund cap** — enforced by FOR UPDATE locking in P12
6. **All amounts are integer minor units** — no floats in financial calculations
7. **Outbox pattern** — events published inside same transaction as state changes
8. **Tenant isolation** — all queries scoped by org/store membership

---

## 4. Implementation Sequence

Based on this audit, the implementation order is:

1. **Migration 0061**: Commission reversals, settlement adjustments, approvals, reconciliation tables, constraint fixes, new permissions/roles
2. **Commission reversal service**: Responsibility-based reversal with cumulative-target rounding
3. **Settlement adjustment service**: Approval workflow with threshold and FX safety
4. **Fix adjustSettlement()**: Integrate commission reversal into return refund flow
5. **Delivery-fee refund logic**: Full/partial/carrier-damage rules
6. **Reconciliation service**: Monthly report generation and discrepancy detection
7. **Admin UI**: Commission, adjustment, reconciliation oversight pages
8. **Tests**: Unit, integration, concurrency, authorization
