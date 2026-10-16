# P13 Phase 3.1 — Financial Hardening Report

## 1. Executive Summary

Phase 3.1 hardens the Phase 3 financial correctness implementation by resolving critical FX safety, tenant isolation, reconciliation audit integrity, delivery-fee accounting, and authorization defects identified during code inspection.

**Branch:** `develop` @ `8d60e36`
**New migration:** `0062_phase3_1_hardening.sql` (81 lines, forward-only, idempotent)
**Verdict: PASS WITH DOCUMENTED LIMITATIONS**

## 2. Defects Identified and Corrected

### Correction A — USD-Equivalent Settlement Approval Threshold

**Defect:** SYP adjustments were assigned `fxStatus = 'NOT_REQUIRED'` and allowed single approval, even though no FX provider exists to evaluate the $10 USD threshold.

**Fix:**
- ALL adjustments now get `fxStatus = 'BLOCKED_FX'` regardless of currency
- `requiresDualApproval = true` for ALL adjustments (safe default)
- Posting is blocked when `fxStatus === 'BLOCKED_FX'` — requires explicit admin resolution
- FX evidence (evaluation timestamp, currency, result, reason) persisted in `fx_evidence` JSONB column
- Approval hash now includes `adjustmentType` — prevents type-swap attacks

**Files:** `settlement-adjustment.service.ts`, `financial.schema.ts`, migration 0062

### Correction B — Tenant Isolation

**Defect:** Financial service queries (list, get, create, approve, post, reconciliation) had no organization-level filtering. Any authenticated admin could see all tenants' data.

**Fix:**
- Added `orgId` column to `settlement_adjustments`, `commission_reversals`, `reconciliation_runs`, `reconciliation_discrepancies` (migration 0062)
- All service methods accept optional `orgId` parameter and filter queries accordingly
- Controller endpoints pass `user.activeOrg` to all service calls
- `getAdjustment()`, `lockAdjustment()`, `listAdjustments()` all scope by orgId
- Reconciliation checks join through `orders → stores → orgId` for tenant scoping
- Settlement consistency check joins through `settlement_records → stores → orgId`

**Files:** All 4 financial services, controller, migration 0062

### Correction C — Reconciliation Audit Integrity

**Defect:** Rerunning reconciliation for the same period deleted previous discrepancies, destroying audit history.

**Fix:**
- Each rerun creates a NEW `reconciliation_runs` row with incremented `version`
- Added `version` column (INTEGER, default 1) and `superseded_by` FK to `reconciliation_runs`
- Previous runs and their discrepancies are NEVER deleted
- Unique index on `(period_start, period_end, currency, version)` prevents concurrent duplicates
- Discrepancy resolution is a separate endpoint that marks individual items resolved with notes
- Explicit notice: "Marking a discrepancy resolved does NOT change financial records"

**Files:** `reconciliation.service.ts`, `financial.schema.ts`, migration 0062

### Correction D — Delivery-Fee Accounting

**Defect:** Migration 0061 CHECK constraint `chk_settlement_adjustments_type` did not include `DELIVERY_FEE_EXCEPTION`, causing constraint violations. Reconciliation delivery-fee check used hardcoded 15% VAT margin instead of actual rate.

**Fix:**
- Migration 0062 drops and recreates constraint to include `DELIVERY_FEE_EXCEPTION`
- Delivery-fee cap check now uses actual VAT rate from `orderFinancialBreakdown`
- Formula: `maxRefundable = deliveryFeeMinor × (1 + taxMinor/productsMinor)`
- Never refunds more than the authoritative refundable original amount

**Files:** `reconciliation.service.ts`, migration 0062

### Correction E — Refund and Commission Transaction Integrity

**Verified:**
- Refund succeeds before return is finalized as REFUNDED (markRefunded checks refundRow.status === 'SUCCEEDED')
- Commission reversal is in same transaction as refund (externalTx parameter)
- Idempotency key on commission_reversals prevents duplicate reversals
- Cumulative-target rounding caps at remaining commission
- BUYER_REMORSE retains commission; MERCHANT/PLATFORM/CARRIER_DAMAGE reverse
- FOR UPDATE row locks prevent concurrent approval/posting races

**Documented limitation:** Payment provider is manual-verification, not a live external integration. Live payment-network correctness cannot be verified.

### Correction F — Authorization and Approval Integrity

**Fix:**
- Creator cannot be ANY approver for dual-approval (was: only first approver blocked)
- Posting re-verifies approval hash and approval counts
- Posting blocked when `fxStatus === 'BLOCKED_FX'`
- All controller endpoints use `@UseGuards(PermissionsGuard)` with specific permissions
- Finance role has only Finance-specific permissions (no write access to adjustments)
- Duplicate approval prevented by UNIQUE index + service-level check

## 3. Changed Files Summary

| File | Operation | Lines Changed |
|------|-----------|---------------|
| `infra/drizzle/migrations/0062_phase3_1_hardening.sql` | Create | +81 |
| `modules/returns/financial.schema.ts` | Modify | +8 columns |
| `modules/returns/settlement-adjustment.service.ts` | Rewrite | +162/-97 |
| `modules/returns/reconciliation.service.ts` | Rewrite | +185/-100 |
| `modules/returns/commission-reversal.service.ts` | Modify | +36/-3 |
| `modules/returns/returns.controller.ts` | Modify | +51/-14 |
| `__tests__/unit/returns/settlement-adjustment.spec.ts` | Rewrite | +127/-111 |
| `__tests__/unit/returns/reconciliation.spec.ts` | Modify | +26/-13 |
| `apps/admin/src/app/commission/page.tsx` | Create | +130 |
| `apps/admin/src/app/settlement-adjustments/page.tsx` | Create | +174 |
| `apps/admin/src/app/reconciliation/page.tsx` | Create | +214 |

## 4. Test Results

- **TypeScript compilation:** 0 new errors (7 pre-existing TS18048 in test files)
- **Unit tests:** 1819/1819 pass (94 files)
- **Returns unit tests:** 208/208 pass (6 files)
- **Admin frontend:** 0 TypeScript errors

## 5. Known Limitations

1. **FX conversion:** No authoritative FX provider exists. All adjustments are BLOCKED_FX. Posting requires admin to manually resolve FX status (no API for this yet).
2. **PostgreSQL integration tests:** Not re-run in this session (Docker/testcontainer dependency).
3. **Historical records:** Existing adjustments created before migration 0062 have `orgId = null`. A backfill query can populate orgId from the sub-order relationship when ready.
4. **Payment provider:** Manual-verification only. Live payment-network correctness not verifiable.
5. **Pre-existing errors:** 7 TS18048 errors in integration test files remain from prior phases.
