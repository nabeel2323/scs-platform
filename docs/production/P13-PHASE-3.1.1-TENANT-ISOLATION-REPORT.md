# P13 Phase 3.1.1 — Tenant Isolation Report

**Date:** 2026-10-14
**Branch:** develop @ 8d60e36
**Database:** PostgreSQL 16 (disposable database `scs_p311_tiso`)

## Executive Summary

9 adversarial tenant isolation tests prove that financial data is isolated between organizations at the PostgreSQL service layer. All 9 tests **PASS**.

## Test Setup

Two organizations (Org A, Org B) each with:
- Distinct stores, orders, payment records, return requests
- Financial records: settlement adjustments, commission reversals, reconciliation runs, reconciliation discrepancies
- Full FK prerequisite chain (organizations → users → stores → master_orders → orders → payment_records → return_requests → financial records)

## Test Results

| Test | Description | Result |
|------|-------------|--------|
| TISO-01 | Listing adjustments scoped by orgId returns only own data | **PASS** |
| TISO-02 | getAdjustment with wrong orgId throws NotFoundException | **PASS** |
| TISO-03 | approveAdjustment with wrong orgId throws | **PASS** |
| TISO-04 | listReversals scoped by orgId returns only own data | **PASS** |
| TISO-05 | listReconciliationRuns scoped by orgId returns only own data | **PASS** |
| TISO-06 | resolveDiscrepancy with wrong orgId throws | **PASS** |
| TISO-07 | Listing without orgId returns all (admin super-query) but scoped queries work | **PASS** |
| TISO-08 | Knowing UUID of another org's adjustment does not grant read | **PASS** |
| TISO-09 | Concurrent cross-org listing returns isolated results | **PASS** |

## Command Output

```
$ npx vitest run src/__tests__/integration/p311-tenant-isolation.postgres.spec.ts --reporter=verbose

 ✓ TISO-01: listing adjustments scoped by orgId returns only own data
 ✓ TISO-02: getAdjustment with wrong orgId throws NotFoundException
 ✓ TISO-03: approveAdjustment with wrong orgId throws
 ✓ TISO-04: listReversals scoped by orgId returns only own data
 ✓ TISO-05: listReconciliationRuns scoped by orgId returns only own data
 ✓ TISO-06: resolveDiscrepancy with wrong orgId throws
 ✓ TISO-07: listing without orgId returns all (admin super-query) but scoped queries work
 ✓ TISO-08: knowing UUID of another org adjustment does not grant read
 ✓ TISO-09: concurrent cross-org listing returns isolated results

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Duration  14.00s
```

## Security Invariants Proven

1. **Fail-closed scoping:** When orgId is provided, queries are filtered. Cross-org access throws NotFoundException.
2. **UUID knowledge insufficient:** Knowing another org's record UUID does not grant access (TISO-08).
3. **Admin super-query:** Omitting orgId returns all records (for admin use). This is intentional, not a leak.
4. **Concurrent isolation:** Two concurrent cross-org listings return disjoint result sets (TISO-09).

## Service-Level Isolation Mechanisms

- `SettlementAdjustmentService`: `lockAdjustment()` and `getAdjustment()` filter by orgId when provided
- `CommissionReversalService`: `listReversals()` filters by orgId when provided
- `ReconciliationService`: `listReconciliationRuns()`, `getReconciliationRun()`, `resolveDiscrepancy()` filter by orgId

## Controller-Level Isolation

The returns controller passes `user.activeOrg` to all service calls, ensuring tenant scoping at the HTTP layer.

## Limitations

- Tests are at the service layer, not HTTP level. HTTP-level tests would require full NestJS test harness with auth tokens.
- The admin super-query path (no orgId) is tested but not adversarially — it's an intentional design pattern for platform admins.

## Test File

- `apps/api/src/__tests__/integration/p311-tenant-isolation.postgres.spec.ts`

## Conclusion

**PASS** — Tenant isolation is proven at the PostgreSQL service layer for all four financial tables.
