# SCS-M7.3-C — Release Closure

## 1. Release Identity

| Field | Value |
|-------|-------|
| Milestone | M7.3-C |
| Title | Returns — Inventory Return-to-Stock + RTS Physical Handling |
| Parent | M7.3-B — Order Cancellation and Delivery Exceptions |
| Predecessor | M7.3-B.6 — Ship-Ops Visibility — CLOSED / PASS |
| Successor | M7.3-D — Refunds (Fresh Architecture Audit required) |
| Business Objective | Record physical returns against RTS_COMPLETED shipments with correct inventory consequences (RELEASE for GOOD; RELEASE + ADJUST write-off for DAMAGED/DEFECTIVE/UNSALEABLE; 409 for LOST), without touching money, the order FSM, or the settlement engine |
| Baseline Commit | `229949f934f6bfe447d4bce600a84fcbfe4dc365` |
| Branch | `develop` |
| Closure Date | 2026-10-04 |

---

## 2. Release Decision

```text
========================================
M7.3-C RELEASE CLOSURE
========================================

Implementation:                  COMPLETE
Independent Runtime Verification: PASS
Release Closure:                 CLOSED / PASS

Live HTTP matrix:                23/23 PASS
Concurrency:                     10/10 PASS
Event / buyer contract:          12/12 PASS
Database invariants:             6/6 PASS
Playwright browser execution:    30/30 PASS
PostgreSQL regressions:          91/91 PASS
M7.3-C unit tests:               26/26 PASS
API typecheck/build:             PASS
Web typecheck/build:             PASS
Admin typecheck/build:           PASS
Database residue:                ZERO
Process cleanup:                 PASS

CI-05 over-release:              FIXED (lock → recompute → cap → write)
VR-UI-01 acceptance defect:      REFUTED (artifact-only remediation)

No migration introduced:         CONFIRMED
No FSM/state change:             CONFIRMED
No settleStockForStatus change:  CONFIRMED

Next:
  FRESH M7.3-D ARCHITECTURE AUDIT

No M7.3-D implementation started.
========================================
```

**All M7.3-C implementation gates completed.**
**All blocking defects (CI-05, VR-UI-01) were remediated and independently re-verified.**
**All required runtime verification categories passed.**
**No unresolved M7.3-C functional defect remains.**

---

## 3. Evidence Chain

| # | Document | Expected Status | Actual Status |
|---|----------|----------------|---------------|
| 1 | `SCS-M7.3-C-FRESH-ARCHITECTURE-AUDIT.md` | GO WITH CONDITIONS | GO WITH CONDITIONS — 8 conditions, 7 open business decisions, 5 open technical decisions |
| 2 | `SCS-M7.3-C-BUSINESS-RULES-ARCHITECTURE-LOCK.md` | LOCKED | LOCKED — 8/8 BCF + 12/12 ACF resolved, no TBDs, no migration |
| 3 | `SCS-M7.3-C-IMPLEMENTATION-REPORT.md` | COMPLETE | COMPLETE — backend + admin + web + e2e + tests |
| 4 | `SCS-M7.3-C-INDEPENDENT-RUNTIME-VERIFICATION.md` | PASS or BLOCKED | **BLOCKED** — CI-05 concurrency over-release |
| 5 | `SCS-M7.3-C-CONCURRENCY-REMEDIATION-REPORT.md` | FIXED | FIXED — lock → recompute → cap → write |
| 6 | `SCS-M7.3-C-INDEPENDENT-RUNTIME-VERIFICATION.md` (re-run after CI-05 fix) | PASS or BLOCKED | **BLOCKED** — VR-UI-01 acceptance artifact defect |
| 7 | `SCS-M7.3-C-INDEPENDENT-RUNTIME-VERIFICATION-RERUN.md` | PASS | **PASS** — 30/30 browser executions, VR-UI-01 REFUTED |
| 8 | `SCS-M7.3-C-RELEASE-CLOSURE.md` | PENDING → PASS | This document |

**Verification sequence history (preserved — do not erase the earlier failures):**

```text
Fresh Architecture Audit              → GO WITH CONDITIONS
Business Rules + Architecture Lock    → LOCKED
Implementation                        → COMPLETE
Initial Independent Runtime Verify    → BLOCKED (CI-05 concurrency over-release)
Concurrency Remediation               → FIXED (lock → recompute → cap → write)
Second Independent Runtime Verify     → BLOCKED (VR-UI-01 acceptance artifact)
UI Acceptance Artifact Remediation    → COMPLETE (test artifact only, no app code)
Full Independent Runtime Re-run       → PASS (30/30 browser, 23/23 HTTP, 10/10 concurrency)
Release Closure                       → CLOSED / PASS
```

---

## 4. Gate History (preserved — historical blocked states are not erased)

```text
Fresh Architecture Audit
    GO WITH CONDITIONS

Business Rules + Architecture Lock
    LOCKED

Implementation
    COMPLETE

Initial Independent Runtime Verification
    BLOCKED — CI-05 (concurrency over-release)

Concurrency Remediation
    COMPLETE

Second Independent Runtime Verification
    BLOCKED — VR-UI-01 (acceptance artifact defect)

UI Acceptance Artifact Remediation
    COMPLETE

Full Independent Runtime Verification Re-run
    PASS

Release Closure
    CLOSED / PASS
```

---

## 5. Concurrency Closure (CI-05)

### 5.1 Historical failure

```text
reserve = 10
concurrent requested = [3,4,5]
released = 12  (> 10)  →  qty_reserved driven below zero
```

```text
reserve = 10
concurrent requested = [1,2,3,4,5,6]
released = 21  (> 10)  →  qty_reserved driven below zero
```

### 5.2 Root cause

`recordReturn()` built the return ledger view **once at transaction start**, took the inventory-row `SELECT … FOR UPDATE` locks **afterwards**, then validated the cumulative return cap against that same pre-lock snapshot. Under PostgreSQL READ COMMITTED, every concurrent transaction reads the ledger before any sibling has committed, so each observes `returned = 0`.

### 5.3 Remediation

```text
LOCK  →  RECOMPUTE LEDGER  →  CHECK CAP  →  WRITE
```

The volatile cumulative cap is re-evaluated from a **fresh** ledger view taken **after** the inventory-row `FOR UPDATE` locks and **before** the write.

### 5.4 Final independent verification

```text
C1:  released=8  ≤ 10, conflicts=1                    PASS
C2:  released=10 ≤ 10, conflicts=2                    PASS
C3:  5/5 repetitions held invariant                    PASS
C4:  identical concurrent requests applied exactly once PASS
C5:  cancellation race passed                          PASS
```

### 5.5 Database-wide invariants (across all 119 fixture tags)

```text
negative inventory         = 0
over-release               = 0
duplicate return apply     = 0
atomicity violations       = 0
LOST return movements      = 0
```

---

## 6. UI Closure (VR-UI-01)

### 6.1 Historical status

```text
BLOCKED
```

### 6.2 Cause

Unscoped Playwright locator `getByText(/Recorded return of \d+ unit\(s\)/)` matched **both** the ReturnPanel confirmation **and** the tracking-timeline echo, causing Playwright strict-mode rejection (2 elements found).

### 6.3 Targeted remediation

Playwright assertions scoped to the owning `<section>` via `panelOn(page, heading)`:
- `record.getByText(/Recorded return of \d+ unit\(s\)/)` — ReturnPanel result
- `timeline.getByText(/MERCHANT\s*—\s*Recorded return of \d+ unit\(s\)/)` — tracking-timeline echo

Both surfaces are now asserted **independently**, which is strictly stronger than the minimum `.first()` fix the predecessor gate proposed.

### 6.4 Final verification

```text
30/30 browser executions PASS
J1 = 10/10 PASS
J4 = 10/10 PASS
```

### 6.5 Critical fact

```text
No application-code change was required to resolve VR-UI-01.
```

The UI acceptance artifact was corrected and independently verified. The product file `apps/web/src/app/merchant/deliveries/[id]/page.tsx` has mtime 2026-10-03 16:18 (before the blocked gate); the spec's mtime is 2026-10-04 00:52. The category flipped **solely** because the test artifact was fixed.

---

## 7. Inventory Semantics (locked)

```text
GOOD
    RELEASE only (qty_reserved decreases; qty_on_hand unchanged)

DAMAGED
    RELEASE then ADJUST-out (write-off)

DEFECTIVE
    RELEASE then ADJUST-out (write-off)

UNSALEABLE
    RELEASE then ADJUST-out (write-off)

LOST
    no movement through /return
    HTTP 409
    cancellation remains responsible for releasing reservation
```

Additional locked properties:

```text
warehouse = original RESERVE origin (per-line, from inventoryItemId → inventory_items.warehouseId)
partial return = item-level cumulative cap (append-only ledger, no qty_returned column)
over-return = HTTP 409, zero mutation
idempotency = SHA-256 fingerprint over sorted orderItemId:quantity:condition
concurrency = lock → recompute → cap → write
movement ordering = RELEASE before ADJUST (CI-02)
server-controlled fields = warehouseId, inventoryItemId, qtyOnHand, price rejected with 400
```

---

## 8. API Contract (locked)

```text
POST /v1/shipments/:id/return
```

**Authorization** (subject to locked tenant/store/permission rules):

```text
SuperAdmin
Admin
Moderator
Merchant Owner
Merchant Staff
Merchant Manager
```

**Denied:**

```text
Driver                           → 403
Buyer                            → 403
Unauthorized principals          → 403
Cross-tenant merchant            → 403 (Shipment does not belong to your organization)
Missing fulfillment:shipments:return → 403
```

**Permission:**

```text
fulfillment:shipments:return
```

**Events:**

```text
RETURN_PROCESSED (shipment_events)
shipment.return_processed (outbox)
```

**Buyer projection:**

```text
RETURN_PROCESSED added to BUYER_INTERNAL_EVENT_TYPES
Internal return details are hidden from buyer tracking
Buyer-facing payload omits warehouseId, inventoryItemId, fingerprint
```

---

## 9. No-Migration / No-FSM Closure

```text
Database migration introduced:              NONE
New FSM/state:                              NONE
Master order state changes:                 NONE
Shipment FSM changes:                       NONE
settleStockForStatus modification:          NONE
```

These are release-boundary guarantees. M7.3-C operates exclusively through `stock_movements` (RELEASE / ADJUST) and `shipment_events.RETURN_PROCESSED` without altering any existing state machine.

---

## 10. Test / Verification Evidence

| Verification Area | Result | Evidence |
|---|---|---|
| Live HTTP matrix (A1–A9, conditions, cap, idempotency, tamper, warehouse, event/outbox, buyer projection) | **23/23 PASS** | RERUN §2 |
| Concurrency (C1, C2, C3×5, C4, C5) over real parallel HTTP | **10/10 PASS** — CI-05 NOT reproducible | RERUN §3 |
| Event / outbox contract (§15) + buyer boundary (§16) | **12/12 PASS** | RERUN §4 |
| Database-wide invariants (negative inventory, over-release, duplicate apply, LOST) | **6/6 PASS**, zero violations | RERUN §5 |
| Playwright real browser execution (J1–J5, 2 full-suite rounds, 2 per-journey matrix rounds, 10 controlled repeats) | **30/30 PASS** — VR-UI-01 REFUTED | RERUN §6 |
| PostgreSQL regressions (5 files) | **91/91 PASS** | RERUN §7 |
| M7.3-C unit tests | **26/26 PASS** | RERUN §7 |
| API typecheck + build | **PASS** (exit 0) | RERUN §8 |
| Web typecheck + build | **PASS** (exit 0) | RERUN §8 |
| Admin typecheck + build | **PASS** (exit 0) | RERUN §8 |
| Database residue after GC | **ZERO** (census restored to pre-harness baseline) | RERUN §10 |
| Process cleanup | **PASS** (ports 3000/3100/3200 free, infra untouched) | RERUN §10 |

**Authoritative evidence source:** `docs/production/SCS-M7.3-C-INDEPENDENT-RUNTIME-VERIFICATION-RERUN.md`

---

## 11. Security / Tenant Closure

Verified successful:

```text
Driver denied                              → 403, released=0
Buyer denied                               → 403
Missing return permission denied           → 403, released=0
Cross-tenant merchant denied               → 403, detail="Shipment does not belong to your organization"
Foreign buyer denied                       → 400, seesData=false, detail="Cannot access tracking for another buyer's order"
Buyer cannot read internal return origin   → 403 via return-eligibility
```

Buyer-facing responses confirmed to **not** expose:

```text
warehouseId          — structurally absent from buyer payload
inventoryItemId      — structurally absent from buyer payload
fingerprint          — internal only
internal RETURN_PROCESSED details — hidden via BUYER_INTERNAL_EVENT_TYPES
```

---

## 12. UI / API Parity

Verified UI surfaces:

```text
Merchant
    return action (ReturnPanel with condition selector)
    quantity entry
    successful return confirmation
    partial return (remainder stays returnable)
    remaining quantity visible
    correct confirmation ("Recorded return of N unit(s)")
    tracking timeline echo ("MERCHANT — Recorded return of N unit(s)")

Admin
    return operation (from shipment console)
    all-returned state
    LOST no-return-control behavior

Buyer
    tracking remains buyer-safe (no internal return detail)

Driver
    no return affordance
```

The browser suite passed against the **real** API/database stack (not mocked). Every browser execution was corroborated by persisted database state (ledger, movements, events, outbox).

---

## 13. Files Changed (implementation)

### 13.1 Backend

| File | Change | Purpose |
|---|---|---|
| `apps/api/src/modules/orders/orders.service.ts` | +425 | `RETURN_PROCESSED` in `BUYER_INTERNAL_EVENT_TYPES`; `recordReturn`, `getReturnEligibility`, `computeReturnFingerprint`, `buildReturnLedgerView`; concurrency fix (lock → recompute → cap → write) |
| `apps/api/src/modules/shipping/shipment-operations.controller.ts` | +74 | `POST /v1/shipments/:id/return`, `GET /v1/shipments/:id/return-eligibility`, `validateReturnBody` |
| `apps/api/infra/drizzle/seed-pg.ts` | +14 / −7 | New permission `fulfillment:shipments:return`; total 69 → 70 |

### 13.2 Admin console

| File | Change | Purpose |
|---|---|---|
| `apps/admin/src/lib/shipops.ts` | +41 | `ReturnEligibility` types, `getReturnEligibility()`, `recordReturn()` |
| `apps/admin/src/app/shipments/[id]/page.tsx` | +89 / −0 | Return action in admin shipment console |

### 13.3 Web (merchant)

| File | Change | Purpose |
|---|---|---|
| `apps/web/src/lib/shipops.ts` | +57 | Return eligibility + record return helpers |
| `apps/web/src/app/merchant/deliveries/[id]/page.tsx` | +126 | ReturnPanel (condition selector, submit, confirmation, timeline echo) |

### 13.4 Tests

| File | Change | Purpose |
|---|---|---|
| `apps/api/src/__tests__/integration/m73c-inventory-return.postgres.spec.ts` | new (24 tests) | PostgreSQL integration |
| `apps/api/src/__tests__/unit/orders/m73c-inventory-return.spec.ts` | new (26 tests) | Unit tests |
| `apps/e2e/tests/m73c-return-flow.spec.ts` | new (5 journeys) | Playwright acceptance suite |

---

## 14. What M7.3-C Did NOT Do (scope boundary)

```text
Refunds:                    NOT IMPLEMENTED (M7.3-D)
Payment processing:         NOT IMPLEMENTED (Phase 3)
Credit notes / invoices:    NOT IMPLEMENTED
Financial settlement:       NOT IMPLEMENTED (M7.3-D)
Buyer RMA:                  NOT IMPLEMENTED (post-delivery returns — distinct from RTS returns)
Post-delivery returns:      NOT IMPLEMENTED (F-063 — separate scope)
Notification expansion:     NOT IMPLEMENTED (M7.3-F)
Order FSM changes:          NONE
Shipment FSM changes:       NONE
Master order state changes: NONE
```

---

## 15. Governance Synchronization

The following governance documents have been updated to reflect M7.3-C CLOSED / PASS:

| Document | Change |
|---|---|
| `SCS-B2B-FRAMEWORK-COMPLETENESS-REPORT.html` | M7.3-C status → IMPLEMENTATION COMPLETE / VERIFICATION PASS / RELEASE CLOSURE CLOSED / PASS; baseline updated; F-053 → COMPLETE; roadmap position updated |
| `SCS-B2B-FEATURE-COMPLETENESS-MATRIX.csv` | F-053 (Return-to-stock) → COMPLETE across all dimensions |
| `SCS-B2B-API-UI-PARITY-MATRIX.csv` | Returns row updated: `POST /v1/shipments/:id/return` + `GET /v1/shipments/:id/return-eligibility` → ALIGNED |
| `SCS-B2B-FRAMEWORK-ROADMAP.md` | Phase R1 (M7.3-C) → CLOSED / PASS; next = Fresh M7.3-D Architecture Audit |

---

## 16. Repository State

```text
branch:        develop
HEAD:          229949f934f6bfe447d4bce600a84fcbfe4dc365
M7.3-C changes: uncommitted in the working tree (11 tracked modifications + 8 untracked deliverables)
Nothing committed during this gate.
No application behavior was changed during release closure.
```

---

## 17. Successor Milestone / Next Action

**M7.3-C is complete.** The milestone sequence:

1. Fresh Architecture Audit — GO WITH CONDITIONS
2. Business Rules + Architecture Lock — LOCKED
3. Implementation — COMPLETE
4. Initial Independent Runtime Verification — BLOCKED (CI-05)
5. Concurrency Remediation — FIXED
6. Second Independent Runtime Verification — BLOCKED (VR-UI-01)
7. UI Acceptance Artifact Remediation — COMPLETE
8. Full Independent Runtime Verification Re-run — PASS
9. Release Closure — CLOSED / PASS

**No production implementation changes were made during release closure.** This document is a governance artifact only.

**The next engineering step is:**

```text
FRESH M7.3-D ARCHITECTURE AUDIT
```

The M7.3-C release changes the repository baseline (uncommitted working-tree changes at `229949f`), so the M7.3-D audit must be performed against the actual post-M7.3-C repository state.

```text
M7.3-C Release Closure
        ↓
Fresh M7.3-D Architecture Audit
        ↓
M7.3-D Business Rules + Architecture Decision Lock
        ↓
M7.3-D Implementation
        ↓
Independent Runtime Verification
        ↓
M7.3-D Release Closure
```

**DO NOT IMPLEMENT M7.3-D YET.**

---

## 18. Final Verdict

```text
========================================
M7.3-C — RELEASE CLOSURE

IMPLEMENTATION COMPLETE
INDEPENDENT RUNTIME VERIFICATION PASS
RELEASE CLOSURE CLOSED / PASS
========================================

Next Engineering Gate:

FRESH M7.3-D ARCHITECTURE AUDIT
========================================
```

---

*No code was modified during release closure. This document is a governance artifact only.*
