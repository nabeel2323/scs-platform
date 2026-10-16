# P13 Phase 3.1.1 — PostgreSQL Integration Report

**Date:** 2026-10-14
**Branch:** develop @ 8d60e36
**Database:** PostgreSQL 16 (scs-postgres container, port 25433)

## Executive Summary

All 49 PostgreSQL-backed integration tests pass across 4 test files.

## Test Results Summary

| Test File | Tests | Result | Duration |
|-----------|-------|--------|----------|
| `p13-returns.postgres.spec.ts` | 24 | **24/24 PASS** | ~80s |
| `p13-financial-dispute.postgres.spec.ts` | 10 | **10/10 PASS** | ~40s |
| `p311-tenant-isolation.postgres.spec.ts` | 9 | **9/9 PASS** | ~14s |
| `p311-concurrency.postgres.spec.ts` | 6 | **6/6 PASS** | ~13s |
| **TOTAL** | **49** | **49/49 PASS** | ~115s |

## Command Output

```
$ npx vitest run src/__tests__/integration/p13-returns.postgres.spec.ts \
    src/__tests__/integration/p13-financial-dispute.postgres.spec.ts \
    src/__tests__/integration/p311-tenant-isolation.postgres.spec.ts \
    --reporter=verbose

 ✓ p13-returns.postgres.spec.ts (24 tests)
 ✓ p13-financial-dispute.postgres.spec.ts (10 tests)
 ✓ p311-tenant-isolation.postgres.spec.ts (9 tests)

 Test Files  3 passed (3)
      Tests  43 passed (43)
   Duration  115.48s

$ npx vitest run src/__tests__/integration/p311-concurrency.postgres.spec.ts --reporter=verbose

 ✓ TC-01: commission reversal idempotency key → unique constraint prevents duplicate
 ✓ TC-02: concurrent approve by different users → both succeed for dual approval
 ✓ TC-03: concurrent post of same adjustment → only one wins
 ✓ TC-04: concurrent reconciliation for same period/org → unique version constraint
 ✓ TC-05: duplicate approval from same user → rejected
 ✓ TC-06: concurrent reject + approve → row lock serializes, one wins

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Duration  12.60s
```

## Test Categories

### P13 Returns (24 tests)
- Return request FSM transitions (REQUESTED → MERCHANT_APPROVED/REJECTED)
- Escalation lifecycle (REQUESTED → ESCALATED → APPROVE/REJECT)
- Concurrent return creation and approval
- Outbox event emission
- Security: buyer isolation, cross-org rejection

### P13 Financial Dispute (10 tests)
- Refund VAT calculation
- Commission reversal categories
- Settlement adjustment workflow
- Reconciliation run execution
- Discrepancy detection

### Tenant Isolation (9 tests)
- TISO-01: Listing adjustments scoped by orgId
- TISO-02: getAdjustment with wrong orgId throws NotFoundException
- TISO-03: approveAdjustment with wrong orgId throws
- TISO-04: listReversals scoped by orgId
- TISO-05: listReconciliationRuns scoped by orgId
- TISO-06: resolveDiscrepancy with wrong orgId throws
- TISO-07: Unscoped listing (admin super-query) vs scoped queries
- TISO-08: Knowing UUID of another org's record does not grant access
- TISO-09: Concurrent cross-org listing returns isolated results

### Concurrency (6 tests)
- TC-01: Commission reversal idempotency key constraint
- TC-02: Concurrent dual-approval by different users
- TC-03: Concurrent posting (only one wins)
- TC-04: Concurrent reconciliation (unique version)
- TC-05: Duplicate approval rejection
- TC-06: Concurrent reject + approve (row lock serialization)

## Infrastructure

- All tests run against real PostgreSQL (not mocked)
- Disposable database pattern (create DB → run migrations → seed → test → drop DB)
- Existing scs-postgres container (port 25433) reused to avoid testcontainer health-check timeouts
- Drizzle ORM with full schema for transaction support

## Conclusion

**PASS** — All 49 PostgreSQL integration tests pass. No mocked tests reported as integration tests.
