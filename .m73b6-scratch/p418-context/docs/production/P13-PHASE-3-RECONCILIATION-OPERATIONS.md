# P13 Phase 3 — Reconciliation Operations

## 1. Overview

The monthly reconciliation process is implemented in `ReconciliationService` (`modules/returns/reconciliation.service.ts`). It produces a deterministic report for a specified period and currency, identifying financial discrepancies without altering finalized records.

## 2. Execution

### API Endpoint

```
POST /v1/admin/reconciliation/run
Authorization: admin:reconciliation:write
Body: { "periodStart": "2026-01-01", "periodEnd": "2026-01-31", "currency": "SYP" }
```

### Response

```json
{
  "runId": "uuid",
  "periodStart": "2026-01-01",
  "periodEnd": "2026-01-31",
  "currency": "SYP",
  "status": "COMPLETED",
  "discrepancyCount": 3,
  "summary": {
    "MISSING_COMMISSION_REVERSAL": 2,
    "SETTLEMENT_MISMATCH": 1
  }
}
```

### Query Endpoints

```
GET /v1/admin/reconciliation          — List all runs
GET /v1/admin/reconciliation/:id      — Get run with discrepancies
```

## 3. Reconciliation Checks

### Check 1: Missing Refunds
Identifies returns in REFUNDED status that have no linked SUCCEEDED refund.
- **Discrepancy type:** `MISSING_REFUND`
- **Source reference:** `return:{returnId}`
- **Action required:** Investigate why refund was not executed

### Check 2: Commission Reversal Consistency
For each REFUNDED return with reversal-eligible responsibility (MERCHANT, PLATFORM, CARRIER_DAMAGE):
- Missing reversal → `MISSING_COMMISSION_REVERSAL`
- Multiple reversals → `DUPLICATE_REVERSAL`
- Reversal exceeds original commission → `EXCESSIVE_REVERSAL`

### Check 3: Settlement Formula Verification
For each settlement in the period, verifies `net = gross - refund - commission - fee`.
- **Discrepancy type:** `SETTLEMENT_MISMATCH`
- **Source reference:** `settlement:{settlementId}`
- **Action required:** Investigate settlement calculation

### Check 4: Adjustment Approval Completeness
For each POSTED settlement adjustment:
- Dual-approval required but missing Finance or admin → `UNAPPROVED_ADJUSTMENT`
- Single-approval required but no approvals → `UNAPPROVED_ADJUSTMENT`

### Check 5: Delivery-Fee Refund Caps
For each DELIVERY_FEE_EXCEPTION adjustment:
- Amount exceeds original delivery fee + VAT → `DELIVERY_FEE_OVER_REFUND`

### Check 6: Duplicate Detection
For each return with multiple SUCCEEDED refunds:
- **Discrepancy type:** `DUPLICATE_REFUND`
- **Source reference:** `return:{returnId}`

## 4. Discrepancy Types

| Type | Description | Severity |
|------|-------------|----------|
| `MISSING_REFUND` | Return REFUNDED but no SUCCEEDED refund | HIGH |
| `EXCESSIVE_REFUND` | Refund exceeds approved amount | HIGH |
| `DUPLICATE_REFUND` | Multiple SUCCEEDED refunds for same return | HIGH |
| `MISSING_COMMISSION_REVERSAL` | Eligible return has no reversal | MEDIUM |
| `EXCESSIVE_REVERSAL` | Reversal exceeds original commission | HIGH |
| `DUPLICATE_REVERSAL` | Multiple reversals for same return | MEDIUM |
| `SETTLEMENT_MISMATCH` | Settlement net doesn't match formula | HIGH |
| `UNAPPROVED_ADJUSTMENT` | Posted without required approvals | HIGH |
| `DELIVERY_FEE_OVER_REFUND` | Delivery fee refund exceeds original | MEDIUM |
| `REFUND_STATUS_MISMATCH` | Refund status inconsistent with return | MEDIUM |
| `INCOMPLETE_SOURCE_DATA` | Expected source record missing | HIGH |

## 5. Rerun Safety

- Reconciliation is **rerunnable** for the same period
- Previous discrepancies are **cleared** before re-execution
- No duplicate ledger entries are created
- Finalized financial records are **never altered**
- The run record is updated with new results

## 6. Operational Procedures

### Monthly Execution

1. At month-end, execute reconciliation for the completed month:
   ```
   POST /v1/admin/reconciliation/run
   { "periodStart": "2026-09-01", "periodEnd": "2026-09-30" }
   ```

2. Review discrepancies via `GET /v1/admin/reconciliation/:id`

3. For each discrepancy:
   - HIGH severity: Investigate immediately
   - MEDIUM severity: Investigate within 5 business days

4. Document resolution in the discrepancy's `resolutionNotes` field

### Discrepancy Resolution

Discrepancies are tracked in `reconciliation_discrepancies`:
- `resolved` (boolean) — marks as addressed
- `resolvedAt` — timestamp of resolution
- `resolvedBy` — who resolved it
- `resolutionNotes` — how it was resolved

**Important:** Resolving a discrepancy does NOT alter the underlying financial records. Corrections must be made through the appropriate adjustment workflow (e.g., settlement adjustments for financial corrections).

## 7. Limitations

1. **FX conversion:** All amounts are in SYP. No FX conversion is performed. If multi-currency support is added, reconciliation must be extended with FX-aware checks.

2. **Threshold:** The reconciliation checks are deterministic but rely on the completeness of source data. If source records are missing (e.g., a refund was executed outside the system), the reconciliation reports `INCOMPLETE_SOURCE_DATA` but cannot quantify the impact.

3. **Performance:** For very large periods, the reconciliation may take time proportional to the number of returns, settlements and adjustments. Consider executing during off-peak hours for periods with high transaction volumes.

4. **Tenant isolation:** The current implementation does not filter by organization. If multi-tenant reconciliation is needed, add org-scoping to the queries.

## 8. Recovery Paths

| Scenario | Recovery |
|----------|----------|
| Reconciliation run fails mid-execution | Re-run for the same period — previous partial data is cleared |
| Discrepancy requires financial correction | Create settlement adjustment through approval workflow |
| Missing commission reversal | Trigger manual reversal via `CommissionReversalService.processCommissionReversal()` |
| Duplicate refund detected | Investigate payment provider; mark one refund as REJECTED if confirmed duplicate |
| Settlement mismatch | Recalculate settlement via `PaymentsService.calculateSettlement()` |
