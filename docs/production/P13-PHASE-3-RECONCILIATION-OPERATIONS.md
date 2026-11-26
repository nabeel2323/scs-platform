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
  "version": 1,
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

For each settlement in the period, verifies the ledger formula using the row status:

- Primary settlement rows: `net = gross - refund - commission - fee` (commission is a merchant debit).
- `ADJUSTMENT` rows: `net = gross - refund + commission - fee` (a positive commission-reversal amount is a merchant credit; refund and fee adjustments remain debits).
- Unsafe or out-of-safe-integer minor-unit source values are reported as `INCOMPLETE_SOURCE_DATA` rather than rounded for comparison.
- **Discrepancy type:** `SETTLEMENT_MISMATCH`
- **Source reference:** `settlement:{settlementId}`
- **Action required:** Investigate settlement calculation or the originating adjustment

### Check 4: Adjustment Approval Completeness

For each POSTED settlement adjustment:

- Dual-approval required but missing Finance or admin → `UNAPPROVED_ADJUSTMENT`
- Single-approval required but no approvals → `UNAPPROVED_ADJUSTMENT`

### Check 5: Delivery-Fee Refund Caps

For each `DELIVERY_FEE_EXCEPTION` or `DELIVERY_FEE_REFUND` adjustment:

- The cap uses the order's net-goods basis and the same half-up minor-unit allocation as return posting.
- Amount exceeds the original refundable delivery fee plus its allocated tax → `DELIVERY_FEE_OVER_REFUND`.
- Unsafe/missing breakdown amounts are reported as `INCOMPLETE_SOURCE_DATA`.

### Check 6: Duplicate Detection

For each return with multiple SUCCEEDED refunds:

- **Discrepancy type:** `DUPLICATE_REFUND`
- **Source reference:** `return:{returnId}`

## 4. Discrepancy Types

| Type                          | Description                                | Severity |
| ----------------------------- | ------------------------------------------ | -------- |
| `MISSING_REFUND`              | Return REFUNDED but no SUCCEEDED refund    | HIGH     |
| `EXCESSIVE_REFUND`            | Refund exceeds approved amount             | HIGH     |
| `DUPLICATE_REFUND`            | Multiple SUCCEEDED refunds for same return | HIGH     |
| `MISSING_COMMISSION_REVERSAL` | Eligible return has no reversal            | MEDIUM   |
| `EXCESSIVE_REVERSAL`          | Reversal exceeds original commission       | HIGH     |
| `DUPLICATE_REVERSAL`          | Multiple reversals for same return         | MEDIUM   |
| `SETTLEMENT_MISMATCH`         | Settlement net doesn't match formula       | HIGH     |
| `UNAPPROVED_ADJUSTMENT`       | Posted without required approvals          | HIGH     |
| `DELIVERY_FEE_OVER_REFUND`    | Delivery fee refund exceeds original       | MEDIUM   |
| `REFUND_STATUS_MISMATCH`      | Refund status inconsistent with return     | MEDIUM   |
| `INCOMPLETE_SOURCE_DATA`      | Expected source record missing             | HIGH     |

## 5. Rerun Safety

- Reconciliation is rerunnable for the same period; each successful execution creates a new versioned run.
- Previous run records and their discrepancy rows are preserved as audit history; a rerun does not clear prior discrepancies.
- Each discrepancy belongs to the specific run that produced it.
- Finalized financial/settlement records are never altered by reconciliation.
- Current implementation limitation (FIN-021): run creation, check execution and result persistence are not yet fully failure-atomic. An exception can leave a run in RUNNING or leave partial discrepancy rows. Do not assume a rerun clears this state; inspect the run and preserve its evidence.
- Current implementation limitation (FIN-021): version lookup is organization-scoped, but the existing unique-version index omits `org_id`; independent organizations can collide on the same period/currency/version. This must be corrected before relying on cross-organization run concurrency.
- The exact `superseded_by` pointer convention is under review; do not use it as an operator-facing "latest run" indicator until FIN-021 is closed.

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

4. **Tenant isolation and version allocation:** API execution and run/discrepancy reads are scoped to the caller's financial organization. FIN-021 serializes version allocation per organization/period/currency and migration 0074 makes the unique index organization-scoped, treating NULL organization as one global scope. Migration 0074 must be applied only through the approved deployment process; this repository change does not authorize a shared-database migration.

## 8. Recovery Paths

| Scenario                                  | Recovery                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reconciliation run fails mid-execution    | FIN-021 runs checks and discrepancy persistence in one transaction. The transaction rolls back all partial rows; a separate best-effort transaction records a FAILED run with zero discrepancies and a generic execution-error summary. If the database is unavailable for the failure record too, no failed-run row may be available. Retry only after reviewing the failure and source data. |
| Discrepancy requires financial correction | Create settlement adjustment through approval workflow                                                                                                                                                                                                                                                                                                                                         |
| Missing commission reversal               | Trigger manual reversal via `CommissionReversalService.processCommissionReversal()`                                                                                                                                                                                                                                                                                                            |
| Duplicate refund detected                 | Investigate payment provider; mark one refund as REJECTED if confirmed duplicate                                                                                                                                                                                                                                                                                                               |
| Settlement mismatch                       | Recalculate settlement via `PaymentsService.calculateSettlement()`                                                                                                                                                                                                                                                                                                                             |

## 9. Current implementation and release checkpoint — 23 November 2026

- FIN-020 corrected adjustment-aware settlement arithmetic, exact commission-reversal aggregation, delivery-fee cap rounding and refund-status discrepancy type safety.
- FIN-DSH-36 and the focused unit regressions are committed but have **not been executed**. The reconciliation run-lifecycle and cross-organization versioning limitations above remain open as FIN-021.
- No shared/staging database writes, schema migration, grants/RLS, worker activation, deployment, gateway, automatic payout or release action is authorized by this runbook update.
- PR #138 remains OPEN / DRAFT / UNMERGED. Treat the runbook as operational documentation only; do not interpret it as production authorization.

## FIN-021 — Reconciliation run lifecycle — 23 November 2026

- Version allocation is serialized by a transaction-scoped advisory lock keyed by tenant, period and currency; the unique index is organization-scoped and treats NULL organization as one global scope.
- The run row, all checks, discrepancy inserts and COMPLETED transition share one transaction. Any exception rolls back the run and all discrepancy rows; a separate best-effort transaction records a FAILED run with zero discrepancies and a generic execution-error summary.
- `superseded_by` now points from the prior run to its successor. Migration 0074 repairs the historical backward links and replaces the global unique index. It is committed as source only and has not been applied to a shared/staging database.
- FIN-DSH-37 and FIN-DSH-38 cover concurrent same-tenant versions, independent tenant version 1, forward links, and failure rollback/FAILED persistence. Tests are added but not executed.

## FIN-021 implementation correction — 23 November 2026

A follow-up runtime-source audit found that Drizzle relational `db.query.*` accessors were called on the transaction client. The implementation now uses transaction-compatible core selects for latest-run and source-record reads. The transaction still owns the full run/check/discrepancy/completion lifecycle. Correction commit: `1997ee604f58328faf580328817ec5b7b326fabf`. FIN-DSH-37/38 remain added but unexecuted; migration 0074 remains source-only.
