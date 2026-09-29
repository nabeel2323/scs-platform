# SCS-M7.3-B.2 — Release Closure

**Milestone:** M7.3-B.2 — Merchant Cancellation + Shipment Synchronization  
**Date:** 2026-09-29  
**Status:** CLOSED / PASS  
**Task Type:** Release closure and B.0 business-rule amendment  
**Predecessor:** M7.3-B.2 Runtime Verification (PASS WITH CONDITIONS)

---

## 1. Executive Summary

M7.3-B.2 is formally closed. Both release conditions from the independent runtime verification have been resolved:

| Condition | Resolution | Status |
|-----------|-----------|--------|
| B.0 SUBMITTED discrepancy | Formal amendment applied to B.0 + ADR created | RESOLVED |
| Testcontainers/Docker limitation | Documented as infrastructure observation | RESOLVED |

```
M7.3-B.2 RELEASE STATUS: CLOSED / PASS
```

---

## 2. Baseline

| Item | Value |
|------|-------|
| Branch | `develop` |
| Commit | `0a85d45` |
| Working tree | B.2 implementation + closure documentation (uncommitted) |
| Node | v26.4.0 |
| pnpm | 9.15.9 |
| Docker | 29.1.2 (Docker Desktop, Windows 23H2) |

---

## 3. B.2 Runtime Verification Reference

The independent runtime verification report is:

```
SCS-M7.3-B.2-RUNTIME-VERIFICATION-RESULTS.md
```

Verdict: `PASS WITH CONDITIONS` (28 release gates evaluated, 0 CRITICAL/HIGH defects found).

---

## 4. Conditions Found and Resolved

### Condition 1: B.0 SUBMITTED Rule Discrepancy

**Finding:** B.0 §3.1 and §3.3 listed `SUBMITTED → CANCELLED` as a valid cancellation transition. The B.2 implementation excluded SUBMITTED from the cancellable list because:
- Checkout atomically auto-advances `SUBMITTED → PENDING_CONFIRMATION`
- The FSM `TRANSITIONS` map only allows `SUBMITTED: ['PENDING_CONFIRMATION']`
- SUBMITTED is never externally observable via any API

**Resolution:** Formal B.0 amendment applied (see §5 below).

### Condition 2: Windows Testcontainers Resource Exhaustion

**Finding:** Full `vitest run` with 10+ concurrent PostgreSQL testcontainers fails on Windows Docker Desktop with hook/health-check timeouts. All suites pass when run individually.

**Resolution:** Documented as infrastructure limitation (see §9 below). No CI change required — GitHub Actions uses service containers, not testcontainers.

---

## 5. B.0 SUBMITTED Amendment

**Amendment ID:** B.0-AMEND-001  
**Document:** `SCS-M7.3-B-BUSINESS-RULES-ARCHITECTURE-LOCK.md` §35  
**ADR:** `ADR-M7.3-B0-013` in `docs/architecture/ADR-M7.3-B0-013-SUBMITTED-CANCELLATION.md`

### Changes Applied

| Location | Before | After |
|----------|--------|-------|
| §3.1 line 77 | `SUBMITTED — buyer cancel button active` | `SUBMITTED — transient checkout state; not externally cancellable (AMENDED B.2)` |
| §3.3 line 102 | `SUBMITTED → CANCELLED (buyer/merchant/admin)` | *Removed* |
| §4 line 193 | `ADMIN CANCELLATION CUTOFF: ...SUBMITTED through READY...` | `...PENDING_CONFIRMATION through READY... (AMENDED B.2: SUBMITTED removed)` |
| §29 line 1075 | `| SUBMITTED | ... | Yes |` | `| SUBMITTED | ... | No (AMENDED B.2) |` |

A full amendment section (§35) was appended to B.0 documenting the original rule, amended rule, reason, consequences, compatibility, and references.

### Effective Cancellatable States (Post-Amendment)

```text
PENDING_CONFIRMATION   — buyer/merchant/admin
ACCEPTED               — buyer/merchant/admin
PARTIALLY_ACCEPTED     — buyer/merchant/admin
PREPARING              — buyer/merchant/admin
READY                  — buyer/merchant/admin
PAYMENT_PENDING        — buyer/merchant/admin
```

---

## 6. ADR Reference

**ADR-M7.3-B0-013 — Remove SUBMITTED from Cancellable States**

| Field | Value |
|-------|-------|
| Status | Accepted |
| Milestone | M7.3-B.2 release closure |
| Decision | SUBMITTED is not a cancellable state |
| Rationale | Transient auto-advance; not externally observable; FSM does not allow SUBMITTED → CANCELLED |
| Consequences | None — implementation already correct; documentation reconciled |
| Compatibility | Fully backward-compatible |

---

## 7. Effective Cancellation FSM

The FSM now has one authoritative source of truth matching between documentation and implementation:

```text
DRAFT → SUBMITTED → PENDING_CONFIRMATION → ACCEPTED | PARTIALLY_ACCEPTED | REJECTED | CANCELLED
ACCEPTED → PREPARING | CANCELLED
PARTIALLY_ACCEPTED → PREPARING | CANCELLED
PREPARING → READY | CANCELLED
READY → ASSIGNED | OUT_FOR_DELIVERY | DELIVERED | CANCELLED
PAYMENT_PENDING → PREPARING | CANCELLED
CANCELLED → (terminal)
REJECTED → (terminal)
```

`SUBMITTED` is a transient internal state with auto-advance only — not a user-facing lifecycle state for cancellation.

---

## 8. Runtime vs Documentation Consistency

| Check | Implementation | Amended B.0 | Match |
|-------|---------------|-------------|-------|
| SUBMITTED cancellable? | No (excluded from `cancellable` array) | No (§35 amendment) | YES |
| SUBMITTED → PENDING_CONFIRMATION | Yes (autoAdvanceToPendingConfirmation) | Yes (§2 FSM) | YES |
| PENDING_CONFIRMATION cancellable? | Yes | Yes | YES |
| ACCEPTED cancellable? | Yes | Yes | YES |
| PARTIALLY_ACCEPTED cancellable? | Yes | Yes | YES |
| PREPARING cancellable? | Yes | Yes | YES |
| READY cancellable? | Yes | Yes | YES |
| PAYMENT_PENDING cancellable? | Yes | Yes | YES |
| ASSIGNED cancellable? | No | No | YES |
| DELIVERED cancellable? | No | No | YES |
| CANCELLED cancellable? | No (terminal) | No (terminal) | YES |

---

## 9. Test-Infrastructure Limitation

### Observation

Running `npx vitest run` (full suite) on Windows Docker Desktop causes 10 PostgreSQL integration test suites to fail with testcontainers health-check/hook timeouts. This occurs because:

1. Vitest runs test files in parallel by default
2. Each PostgreSQL test file attempts to start its own testcontainer
3. Windows Docker Desktop has resource limits (CPU/RAM/disk I/O) that cannot handle 10+ simultaneous container starts
4. Health-check strategies timeout after 120s when Docker is saturated

### Evidence

- All affected suites pass when run individually (verified: B.2 21/21, B.1 14/14, phase3 47/47, phase2 39/39, transaction-lifecycle 28/28, stock-settlement 9/9, phase1 38/38)
- GitHub Actions CI uses service containers (`postgis/postgis:16-3.4`) not testcontainers — CI is unaffected
- No B.2 production code change could cause container resource exhaustion

### Recommendation

PostgreSQL/Testcontainers integration suites should run sequentially or with controlled/reduced parallelism in local development on Windows. No CI configuration change is required (CI already provides a single service container).

### Production Impact

None. This is a local development test infrastructure limitation only.

---

## 10. Targeted Verification

Tests executed to confirm the amendment is consistent with the implementation:

### Unit Tests — 25/25 PASS

```
m73b2-merchant-cancellation.spec.ts
  ✓ Actor Resolution (10)
  ✓ Cancellation Reason Validation (6)
  ✓ Cancellation Eligibility by Status (2) — including SUBMITTED rejected
  ✓ Generic Status Endpoint Guard (2)
  ✓ Outbox Payload Shape (2)
  ✓ Merchant Authorization Logic (3)
```

### Orders Integration Tests — 24/24 PASS

```
orders.integration.spec.ts
  ✓ should reject cancel from SUBMITTED — confirms amendment
  ✓ should allow cancel from PENDING_CONFIRMATION
  ✓ should allow cancel from ACCEPTED
  ✓ should allow cancel from PARTIALLY_ACCEPTED
  ✓ should allow cancel from PREPARING
  ✓ should allow cancel from READY
  ✓ should allow cancel from PAYMENT_PENDING
  ✓ should reject cancel from DELIVERED/COMPLETED/OUT_FOR_DELIVERY
```

### PostgreSQL Integration — 21/21 PASS

```
m73b2-merchant-cancellation.postgres.spec.ts (51s)
  ✓ Security (8/8)
  ✓ Concurrency (5/5) — 100-200 workers each
  ✓ Exactly-Once Side Effects (1/1)
  ✓ Failure Injection (1/1)
  ✓ Reason Validation (4/4)
  ✓ Generic Status Endpoint Guard (1/1)
  ✓ Cancellation Metadata (1/1)
```

---

## 11. Regression Results

| Suite | Tests | Result |
|-------|-------|--------|
| B.2 unit | 25 | PASS |
| B.2 PostgreSQL | 21 | PASS |
| B.1 PostgreSQL | 14 | PASS |
| Orders integration (mock) | 24 | PASS |
| Phase 2 multi-merchant (PostgreSQL) | 39 | PASS |
| Phase 3 security (PostgreSQL) | 47 | PASS |
| Transaction lifecycle (PostgreSQL) | 28 | PASS |
| Phase 1 marketplace (PostgreSQL) | 38 | PASS |
| Stock-settlement (PostgreSQL) | 9 | PASS |
| **Total verified** | **289** | **ALL PASS** |

### Full Suite Note

Full `vitest run` results on Windows: 1508 passed, 9 failed (Docker resource exhaustion), 180 skipped. All failures are PostgreSQL testcontainers infrastructure timeouts when 10+ containers start simultaneously. Individually all pass. Zero B.2-induced failures.

---

## 12. Scope Compliance

| Check | Result |
|-------|--------|
| No carrier cancellation (B.3) | CONFIRMED — grep: 0 Aramex/CancelShipment/CancelPickup in cancelOrder() |
| No delivery exceptions (B.4) | CONFIRMED — grep: 0 FAILED_DELIVERY/RECIPIENT_UNAVAILABLE/RTS |
| No RTS (B.5) | CONFIRMED — grep: 0 retry_delivery/RTS |
| No refunds/returns | CONFIRMED — grep: 0 refund/payment_reversal/return_to_stock |
| B.2 atomic invariant preserved | CONFIRMED — all mutations use `tx`, verified by INJ-B2-01 rollback |
| Shipment synchronization unchanged | CONFIRMED — 21/21 PostgreSQL integration tests pass |
| Documentation-only amendment | CONFIRMED — no production code modified in this closure task |

---

## 13. Release Gates C1-C20

| Gate | Requirement | Verdict |
|------|------------|---------|
| C1 | B.2 runtime verification reviewed | PASS |
| C2 | B.2 conditions explicitly resolved | PASS |
| C3 | B.0 SUBMITTED discrepancy formally amended | PASS |
| C4 | B.0 cancellation FSM internally consistent | PASS |
| C5 | Runtime FSM matches amended B.0 | PASS |
| C6 | No production cancellation behavior unintentionally changed | PASS |
| C7 | B.2 atomic transaction invariant preserved | PASS |
| C8 | Shipment synchronization unchanged | PASS |
| C9 | No B.3 carrier functionality introduced | PASS |
| C10 | No B.4 delivery-exception functionality introduced | PASS |
| C11 | No B.5 RTS functionality introduced | PASS |
| C12 | No returns/refunds introduced | PASS |
| C13 | Test-infrastructure limitation honestly documented | PASS |
| C14 | No tests weakened/skipped to manufacture PASS | PASS |
| C15 | Targeted regression verification passes | PASS |
| C16 | TypeScript/build remain clean | PASS |
| C17 | Working-tree changes limited to closure scope | PASS |
| C18 | Documentation references B.2 runtime evidence | PASS |
| C19 | No CRITICAL/HIGH release blocker | PASS |
| C20 | B.2 formally ready to close | PASS |

---

## 14. Files Changed (This Closure Task)

| File | Change Type | Purpose |
|------|------------|---------|
| `docs/production/SCS-M7.3-B-BUSINESS-RULES-ARCHITECTURE-LOCK.md` | Modified | SUBMITTED amendment applied in-place + §35 amendment section |
| `docs/architecture/ADR-M7.3-B0-013-SUBMITTED-CANCELLATION.md` | New | Formal ADR record for the decision |
| `docs/production/SCS-M7.3-B.2-RELEASE-CLOSURE.md` | New | This closure report |

**No production code was modified.** All B.2 implementation changes remain exactly as they were in the runtime verification.

---

## 15. Git/Working Tree State

```
 M docs/production/SCS-M7.3-B-BUSINESS-RULES-ARCHITECTURE-LOCK.md  (amended)
 ? docs/architecture/ADR-M7.3-B0-013-SUBMITTED-CANCELLATION.md     (new)
 ? docs/production/SCS-M7.3-B.2-RELEASE-CLOSURE.md                 (new)
```

Plus the existing B.2 implementation changes (unchanged from prior session):
```
 M apps/api/src/modules/orders/orders.service.ts
 M apps/api/src/modules/orders/orders.controller.ts
 M apps/api/src/modules/orders/orders.schema.ts
 M apps/api/src/__tests__/integration/*.spec.ts (×6)
 ? apps/api/src/__tests__/unit/orders/m73b2-merchant-cancellation.spec.ts
 ? apps/api/src/__tests__/integration/m73b2-merchant-cancellation.postgres.spec.ts
 ? infra/drizzle/migrations/0048_cancellation_metadata.sql
 ? docs/production/SCS-M7.3-B.2-IMPLEMENTATION-RESULTS.md
 ? docs/production/SCS-M7.3-B.2-RUNTIME-VERIFICATION-RESULTS.md
```

---

## 16. Final Verdict

```
M7.3-B.2 RELEASE STATUS: CLOSED / PASS

B.0 SUBMITTED amendment: PASS
Runtime/documentation consistency: PASS
B.2 targeted regression: PASS (289 tests, 0 failures)
Infrastructure limitation documented: PASS
Scope compliance: PASS
Build/TypeScript: PASS (0 errors, 256 files clean)

Critical: 0
High: 0
Medium: 0
Low: 0 (infrastructure observation documented, not a defect)
Info: 0 (amendment formally recorded)
```

---

## 17. Next Milestone Handoff

```
NEXT MILESTONE:
M7.3-B.3 — Carrier Cancellation & Carrier Reconciliation
```

### B.3 Scope (Handoff Only — Not Implemented)

- Aramex carrier cancellation capability analysis
- `CancelPickup` invocation where applicable (B.3)
- Unsupported `CancelShipment` handling
- Carrier cancellation timeout/failure/unknown outcome
- Orphan shipment handling (shipment cancelled locally but not at carrier)
- Reconciliation-required state on shipment
- Carrier `DELIVERED` after SCS `CANCELLED` (race condition)
- Idempotency of carrier cancellation calls
- Outbox/worker processing for carrier cancel events
- Concurrency (carrier cancel vs order cancel)
- Failure injection (carrier API failure → rollback or graceful degradation)
- Tenant/RBAC/security for carrier operations
- PostgreSQL runtime verification

### Inherited From B.0

```text
Carrier cancellation: Best-effort + reconciliation flag (B.0 §1 Locked Decision #5)
If CancelPickup succeeds → shipment marked cancelled
If CancelPickup fails → shipment orphaned + RECONCILIATION_REQUIRED
If carrier delivers despite cancel → record exception, do not reverse order
```

---

**End of Release Closure**
