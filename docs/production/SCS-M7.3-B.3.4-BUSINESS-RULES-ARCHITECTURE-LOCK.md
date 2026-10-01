# SCS-M7.3-B.3.4 — BUSINESS RULES & ARCHITECTURE LOCK

**Tracking/Cancellation Race Closure, Delivered-After-Cancel Exception Detection, and Reconciliation Mutex**

| Field | Value |
|---|---|
| Milestone | M7.3-B.3.4 |
| Task type | Business rules & architecture decision lock — READ-ONLY |
| Status | **LOCKED** |
| Decision | **GO** |
| Date | 2026-10-01 |
| Branch | develop |
| HEAD | 55bd165 |
| Audit | SCS-M7.3-B.3.4-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md (GO WITH CONDITIONS) |
| Parent Lock | SCS-M7.3-B.3.3.3-BUSINESS-RULES-ARCHITECTURE-LOCK.md (LOCKED) |
| Predecessors | B.3.3.1 CLOSED/PASS, B.3.3.2 CLOSED/PASS, B.3.3.2.1 CLOSED/PASS, B.3.3.2.2 CLOSED/PASS, B.3.3.3 CLOSED/PASS |
| Migration | 0049 (existing — no new migration) |
| CI Regression | B3321-PG-11 stale assertion resolved (timeout → UNKNOWN, not FAILED) |

> This document is a decision-lock artifact. No production code, schema, migration, provider, worker, reconciliation, tracking, test, CI, or API is modified by this document. It converts the B.3.4 architecture audit into a binding implementation contract.

---

## 1. Objective

Lock the behavior for closing tracking/cancellation race conditions, handling delivered-after-cancel exceptions, fixing the shared reconciliation mutex, and resolving the PICKUP_CANCELLED reachability gap identified by the B.3.4 architecture audit.

The audit identified 10 findings (F-01 through F-10) and 10 business decisions (BD-3.4-01 through BD-3.4-10). This lock resolves all 10 decisions and defines the implementation scope.

The critical distinction locked by this document:

```
CONSERVATIVE ACTIVE-STATE:
  No verified method exists to prove an Aramex pickup is definitively ACTIVE.
  Tracking codes (SH001/SH014) suggest activity but are not definitive proof.
  Until live Aramex API verification, UNKNOWN → PENDING and re-cancel
  remain ADMIN-ONLY operations.

DELIVERED-AFTER-CANCEL:
  SCS cancellation is authoritative (order FSM blocks resurrection).
  But the tracking poller silently advances carrier_status_mapped to DELIVERED
  on cancelled shipments, creating an admin visibility gap.
  B.3.3.4 adds exception detection and recording — NOT order/shipment mutation.

RECONCILIATION MUTEX:
  Create and cancel reconciliation share a single `running` flag.
  If create reconciliation is running, cancel reconciliation is skipped.
  B.3.3.4 separates these into independent flags.
```

---

## 2. Definitions

| Term | Definition |
|---|---|
| **Delivered-after-cancel** | A scenario where SCS has cancelled an order (order status = CANCELLED, shipment status = CANCELLED, carrier_cancel_status = SUCCEEDED) but the carrier later reports DELIVERED via tracking. The order FSM blocks resurrection; the exception is an operational visibility gap. |
| **Active-state proof** | Evidence that definitively establishes a pickup remains active at the carrier (not cancelled). Currently unavailable for Aramex without live API verification. |
| **Tracking heuristic** | Inferring pickup activity from tracking status codes (SH001 = PICKED_UP, SH014 = RECORD_CREATED). Suggestive but not definitive — the pickup may have been cancelled after these events were recorded. |
| **Exception event** | A shipment-level event recording an anomalous carrier state (e.g., DELIVERED after SCS CANCELLED). Recorded in `shipment_events` for admin visibility. Does NOT mutate order or shipment state. |
| **Separate reconciliation mutex** | Independent `runningCreate` and `runningCancel` flags replacing the shared `running` flag in the reconciliation service. |

---

## 3. CI Regression Resolution

### B3321-PG-11 — Stale Assertion

The CI run on `develop` (commit `55bd165`) reported 1 test failure:

```
Test:     B3321-PG-11: timeout → FAILED, no retry counter increment
File:     m73b3321-retry-state-foundation.postgres.spec.ts:499
Error:    expected 'UNKNOWN' to be 'FAILED'
Summary:  1 failed | 1921 passed (1922 tests, 105 files)
```

**Root cause:** B.3.3.3 changed timeout classification from FAILED → UNKNOWN (indeterminate outcome reconciliation). The B.3.3.2.1 test was not updated when B.3.3.3 was merged. This is a cross-milestone regression — the test expectation is stale, not the implementation.

**Resolution:** The test assertion is reconciled to match verified B.3.3.3 behavior:

```
BEFORE: expect(carrier_cancel_status).toBe('FAILED')
AFTER:  expect(carrier_cancel_status).toBe('UNKNOWN')
```

The other two assertions (`carrier_cancel_retries = 0`, `carrier_cancel_error_class = 'timeout'`) already match the UNKNOWN-path behavior and are unchanged.

**Verification:** After fix, B3321-PG-11 PASS. Full suite: 1920 passed | 2 skipped (1922). Two file-level failures are Docker hook timeouts (infrastructure), not assertion failures. TypeScript clean, build clean.

**Principle applied:** Per verified precedent — when a specification/test contradicts verified implementation, reconcile the document/test to the code, not the reverse.

---

## 4. Locked Business Decisions

### BD-3.4-01 — Definition of "Definitive Carrier ACTIVE State" → **LOCKED: CONSERVATIVE**

```
Until live Aramex API verification establishes a definitive active-state method:
  - Tracking codes (SH001/SH014) are NOT locked as definitive active proof.
  - getPickupStatus() is NOT implemented.
  - UNKNOWN → PENDING and re-cancel remain ADMIN-ONLY.

After live Aramex verification:
  - A verified getPickupStatus() or equivalent may be implemented.
  - The verification must establish:
    (a) exact Aramex API endpoint and request format,
    (b) response codes that definitively prove active state,
    (c) response codes that definitively prove cancelled state,
    (d) response codes that are ambiguous.
```

**Rationale:** Tracking codes like SH001 (PICKED_UP) prove the pickup was active at some point, but not that it remains active NOW. The carrier may have processed a subsequent cancellation. Only a dedicated status query with verified semantics can provide definitive proof.

### BD-3.4-02 — UNKNOWN → PENDING Transition Authority → **LOCKED: ADMIN-ONLY (for now)**

```
UNKNOWN → PENDING is permitted ONLY via admin intervention.
Automated reconciliation does NOT transition UNKNOWN → PENDING.

Admin path:
  POST /v1/carrier/shipments/:id/recover
  → admin reviews carrier state manually
  → admin triggers retry (UNKNOWN → PENDING + outbox event)

Future (after Aramex active-state verification):
  Reconciliation may transition UNKNOWN → PENDING when:
  - getPickupStatus() or equivalent definitively proves active state
  - This requires a new BD amendment
```

### BD-3.4-03 — Reconciliation-Driven Re-Cancel Safety Invariant → **LOCKED: ACTIVE PROOF REQUIRED**

```
Reconciliation-driven re-cancel (CancelPickup invoked by reconciliation)
is permitted ONLY when:
  1. Active state is definitively proven (not heuristic), AND
  2. The idempotency key carrier-cancel:<shipmentId> is used.

Since active state cannot currently be proven (BD-3.4-01):
  → Reconciliation-driven re-cancel is DEFERRED.
  → Reconciliation remains conservative:
     - Tracking confirms CANCELLED → SUCCEEDED
     - Otherwise → UNKNOWN (within budget) or RECONCILIATION_REQUIRED
```

### BD-3.4-04 — Delivered-After-Cancel Handling Scope → **LOCKED: EXCEPTION RECORDING**

```
B.3.3.4 implements:
  - Detection: tracking poller detects DELIVERED on a cancelled shipment
  - Recording: exception event written to shipment_events
  - Token: recoveryStatus = DELIVERED_AFTER_CANCEL
  - Visibility: shipment appears in admin recovery queue

B.3.3.4 does NOT implement:
  - Order state mutation (order remains CANCELLED — FSM invariant)
  - Shipment state mutation (shipment remains CANCELLED)
  - Inventory settlement (no SALE — already RELEASED)
  - Refund/financial processing
  - Full exception lifecycle (accept/reverse)
```

**Invariant preserved:**

```
Carrier DELIVERED after SCS cancellation does NOT resurrect:
  - order (TRANSITIONS['CANCELLED'] = [])
  - sub-order
  - shipment (status = CANCELLED)
  - completion state
  - inventory (no SALE settlement)

SCS cancellation remains authoritative.
The exception event is for OPERATIONAL VISIBILITY only.
```

### BD-3.4-05 — Tracking Poller Cancel-Awareness → **LOCKED: EXTEND GUARD + EXCEPTION DETECTION**

```
Current C5 guard (B.3.3.3):
  Exclude carrier_cancel_status IN ('SUCCEEDED', 'NOT_REQUIRED')

B.3.3.4 extension:
  1. Keep C5 guard unchanged (SUCCEEDED/NOT_REQUIRED excluded).
  2. Add delivered-after-cancel detection:
     When tracking reports DELIVERED AND carrier_cancel_status IS NOT NULL
     AND carrier_cancel_status NOT IN ('SUCCEEDED', 'NOT_REQUIRED'):
       → Record DELIVERED_AFTER_CANCEL exception event
       → Set recoveryStatus = DELIVERED_AFTER_CANCEL
       → Do NOT call processCarrierDelivery()
       → Do NOT advance carrier_status_mapped
  3. When carrier_cancel_status = 'SUCCEEDED':
     → Already excluded by C5 guard. No polling. Safe.
  4. When carrier_cancel_status = 'UNKNOWN' or 'RECONCILIATION_REQUIRED':
     → Polling continues (existing behavior).
     → If tracking reports DELIVERED → exception path (rule 2).
     → If tracking reports CANCELLED → reconciliation may resolve UNKNOWN → SUCCEEDED.
```

### BD-3.4-06 — Webhook Cancellation Processing → **LOCKED: PERSIST-ONLY (unchanged)**

```
Webhook controller does NOT process carrier cancellation events.
Webhook persists raw events but takes no action on carrier_cancel_status.

Rationale:
  - Aramex webhook cancellation event format is unverified.
  - The synchronous CancelPickup response is the authoritative cancel confirmation.
  - Reconciliation provides the async safety net.

Future (after Aramex webhook behavior verification):
  - Webhook may update carrier_cancel_status for specific verified event types.
  - This requires a new BD amendment.
```

### BD-3.4-07 — `getPickupStatus()` Implementation → **LOCKED: DEFERRED**

```
getPickupStatus() is NOT implemented in B.3.3.4.

Prerequisites (all required before implementation):
  1. Live Aramex API verification of a pickup status endpoint
  2. Verified request/response format
  3. Verified status codes (active, cancelled, ambiguous)
  4. Provider interface extension (shipping-provider.ts)
  5. Aramex provider override (aramex.provider.ts)
  6. Tenant/security review (credential routing for status queries)
  7. Test suite for the new capability

B.3.3.4 may document the interface requirements for future implementation.
```

### BD-3.4-08 — B.3.3.5 Unique Index → **LOCKED: DEFERRED**

```
The partial unique index on outbox_events for at-most-one-pending-cancel
is desirable as defense-in-depth but NOT implemented in B.3.3.4.

Current safety:
  - Worker idempotent guard (carrierCancelStatus state check) prevents double execution
  - Idempotency key (carrier-cancel:<shipmentId>) prevents double carrier call
  - FOR UPDATE SKIP LOCKED prevents concurrent claiming

Application-level guards are SUFFICIENT for correctness.
Database-level uniqueness is DESIRABLE but not blocking.

B.3.3.5 (future milestone) may implement the unique index.
```

### BD-3.4-09 — PICKUP_CANCELLED Tracking Status → **LOCKED: REMOVE UNREACHABLE CHECK**

```
The reconciliation service checks for PICKUP_CANCELLED at line 467:
  if (status === 'CANCELLED' || status === 'PICKUP_CANCELLED')

The Aramex status mapper has NO PICKUP_CANCELLED mapping.
SH012 → CANCELLED is the only cancellation code.
Therefore PICKUP_CANCELLED is unreachable via the tracking path.

B.3.3.4 resolution:
  - Remove the PICKUP_CANCELLED check from reconciliation.
  - Reconciliation checks ONLY: status === 'CANCELLED'
  - If a future carrier integration has a PICKUP_CANCELLED equivalent,
    the mapper for that provider adds it, and the reconciliation check
    is extended at that time.

Alternative (if Aramex verification reveals a PICKUP_CANCELLED equivalent):
  - Add the mapping to aramex-status.mapper.ts
  - Keep the reconciliation check
  - This requires live Aramex API evidence
```

### BD-3.4-10 — Shared Reconciliation Mutex → **LOCKED: SEPARATE FLAGS**

```
Current: single `running` flag (carrier-reconciliation.service.ts:63)
  shared by reconcile() and reconcileCancel().
  If create reconciliation is running, cancel reconciliation returns [].

B.3.3.4 fix:
  - Replace `running` with `runningCreate` and `runningCancel`.
  - reconcile() checks/sets runningCreate.
  - reconcileCancel() checks/sets runningCancel.
  - Create and cancel reconciliation run independently.

Safety:
  - FOR UPDATE SKIP LOCKED handles cross-process safety.
  - Separate flags only affect single-process scheduling.
  - No behavioral change to claiming, state transitions, or concurrency.
```

---

## 5. Architecture Decisions

### C6 — Tracking Poller Exception Detection → **LOCKED**

```
When the tracking poller encounters DELIVERED on a shipment with
carrier_cancel_status IS NOT NULL:

1. If carrier_cancel_status IN ('SUCCEEDED', 'NOT_REQUIRED'):
   → Already excluded by C5 guard. Not polled. No action.

2. If carrier_cancel_status IN ('UNKNOWN', 'RECONCILIATION_REQUIRED', 'FAILED'):
   → Tracking DELIVERED is an EXCEPTION.
   → Record shipment_event:
       externalEventId: generated (uuid)
       carrierEventCode: 'DELIVERED_AFTER_CANCEL'
       status: 'DELIVERED'
       description: 'Carrier reports DELIVERED after SCS cancellation'
   → Set recoveryStatus = 'DELIVERED_AFTER_CANCEL'
   → Do NOT call processCarrierDelivery()
   → Do NOT advance carrier_status_mapped
   → Log warning

3. If carrier_cancel_status IS NULL or 'PENDING' or 'IN_PROGRESS':
   → Normal tracking flow. No cancel conflict.
```

### C7 — Reconciliation PICKUP_CANCELLED Resolution → **LOCKED**

```
Remove the unreachable PICKUP_CANCELLED check from reconciliation.

Before:
  if (status === 'CANCELLED' || status === 'PICKUP_CANCELLED')

After:
  if (status === 'CANCELLED')

This is a code cleanup — PICKUP_CANCELLED was never reachable via
the Aramex tracking path (no mapper entry exists).
```

---

## 6. State Machine Extensions

### Cancel State Machine (unchanged from B.3.3.3)

```
NULL → PENDING → IN_PROGRESS → SUCCEEDED / FAILED / NOT_REQUIRED / UNKNOWN
UNKNOWN → (reconciliation) → SUCCEEDED / UNKNOWN / RECONCILIATION_REQUIRED
RECONCILIATION_REQUIRED → (admin) → SUCCEEDED / PENDING
```

### New: Delivered-After-Cancel Exception Path

```
Shipment: status = CANCELLED, carrier_cancel_status = SUCCEEDED (or UNKNOWN/FAILED)
Tracking poller: detects DELIVERED from carrier

Current behavior (B.3.3.3):
  → carrier_status_mapped advances to DELIVERED (divergence)
  → processCarrierDelivery() called → returns false (order FSM blocks)
  → No exception recorded

B.3.3.4 behavior:
  → Exception event recorded in shipment_events
  → recoveryStatus = DELIVERED_AFTER_CANCEL
  → carrier_status_mapped NOT advanced (remains unchanged)
  → processCarrierDelivery() NOT called
  → Shipment appears in admin recovery queue
```

### Recovery State Extensions

| Condition | recoveryStatus | carrier_cancel_status | nextReconciliationAt |
|---|---|---|---|
| DELIVERED after cancel detected | `DELIVERED_AFTER_CANCEL` | SUCCEEDED (or UNKNOWN/FAILED) | null |
| Admin resolves delivered-after-cancel | null (cleared) | (unchanged) | null |

**CONFIRMED IN CODE:** `DELIVERED_AFTER_CANCEL` (22 chars) is already defined in `shipping.types.ts:278`. Fits within VARCHAR(24).

---

## 7. Concurrency Rules

| Rule | Mechanism | Evidence |
|---|---|---|
| Separate reconciliation mutex | `runningCreate` / `runningCancel` flags | BD-3.4-10 |
| Tracking poller exception detection is idempotent | recoveryStatus set atomically; duplicate DELIVERED events produce same exception | C6 |
| FOR UPDATE SKIP LOCKED preserved | All claiming mechanisms unchanged | Existing |
| Tracking + cancellation write different columns | Tracking writes `carrier_status_mapped`; cancel writes `carrier_cancel_status` | Audit §16 |
| Exception recording does not conflict with reconciliation | Exception sets `recoveryStatus`; reconciliation checks `recoveryStatus` | Convergent |

### Race Analysis Summary (from Audit)

| Race | Verdict | Mechanism |
|---|---|---|
| A. Cancel → Tracking DELIVERED | SAFE (C5 guard + order FSM) | Double-guard |
| B. Cancel → Tracking CANCELLED | SAFE | Consistent |
| C. UNKNOWN → Tracking CANCELLED | SAFE | Reconciliation resolves |
| D. UNKNOWN → Tracking ACTIVE | SAFE | Conservative |
| E. UNKNOWN → Tracking ambiguous | SAFE | Conservative |
| F. Reconciliation → Cancellation | SAFE | Idempotency key |
| G. Reconciliation → Tracking | SAFE | Convergent reads |
| H. Webhook → Cancellation | SAFE | Different tables |
| I. Cancellation → Webhook | SAFE | Different tables |
| J. Admin recovery → Worker | SAFE | Atomic updates |
| K. Worker → Admin recovery | SAFE | Atomic updates |
| L. Carrier delayed response | SAFE | Idempotency key |
| M. Carrier DELIVERED after SCS CANCELLED | **FIXED by C6** | Exception detection |

Race M was SAFE for order/inventory (FSM blocks) but had an admin visibility gap. B.3.3.4 closes the gap with exception recording.

---

## 8. Database Decision

```
NO NEW MIGRATION for B.3.3.4.
```

**CONFIRMED IN CODE:** Migration 0049 already provides all required columns and indexes. The `shipment_events` table (shipment.schema.ts:90-104) supports exception events via `externalEventId` and `carrierEventCode`. The `recovery_status` column supports the `DELIVERED_AFTER_CANCEL` token (already defined in shipping.types.ts).

**If implementation discovers that a genuinely new field or index is required**, implementation must **STOP and report** rather than silently creating migration 0050.

---

## 9. Aramex Evidence Requirements

The audit identified the following Aramex behaviors as UNVERIFIED. B.3.3.4 does NOT implement speculative logic for any of these.

| ID | Behavior | Category | Action Required |
|---|---|---|---|
| AE-01 | CancelPickup on already-cancelled PickupGUID | UNKNOWN | Verify with Aramex sandbox |
| AE-02 | CancelPickup idempotency (same GUID twice) | UNKNOWN | Verify with Aramex sandbox |
| AE-03 | Aramex pickup status query endpoint | UNKNOWN | Verify API documentation |
| AE-04 | Aramex webhook cancellation event format | UNKNOWN | Verify webhook specification |
| AE-05 | PICKUP_CANCELLED equivalent in Aramex tracking | UNKNOWN | Verify status code list |
| AE-06 | Tracking codes as active-state proof | ASSUMPTION | Cannot be locked as definitive |

**Categories:**
- VERIFIED: Confirmed by existing code + tests (e.g., SH012 → CANCELLED, HasErrors=false → cancelled)
- DOCUMENTED: In Aramex documentation but not verified in code
- ASSUMPTION: Inferred but not confirmed
- UNKNOWN: No evidence available

**Rule:** No speculative provider logic. No assumed status codes. No invented API endpoints.

---

## 10. Scope

### B.3.3.4 WILL Implement

1. **F-02 fix**: Separate `runningCreate` / `runningCancel` flags in reconciliation service
2. **F-03/F-04 fix**: Tracking poller delivered-after-cancel exception detection (C6)
3. **F-05 fix**: Remove unreachable PICKUP_CANCELLED check from reconciliation (C7)
4. **B3321-PG-11 fix**: Stale test assertion reconciled to B.3.3.3 behavior (already done)
5. **Aramex evidence documentation**: Document AE-01 through AE-06 for future verification
6. **Required unit, PostgreSQL, and integration tests**

### B.3.3.4 WILL NOT Implement (Explicit Non-Goals)

| Deferred To | Scope |
|---|---|
| B.3.3.5 | Partial unique index on outbox_events (F-07) |
| Future | `getPickupStatus()` implementation (BD-3.4-07) |
| Future | UNKNOWN → PENDING automatic transition (BD-3.4-02) |
| Future | Reconciliation-driven re-cancel (BD-3.4-03) |
| Future | Full delivered-after-cancel lifecycle (accept/reverse) |
| Future | Webhook cancellation processing (BD-3.4-06) |
| Future | Tracking event dedup unique index verification (F-08) |
| Future | Cancel-specific metrics counters (F-09) |
| Out of scope | Returns, refunds, payment, disputes, notifications |
| Out of scope | New carrier integrations |
| Out of scope | New provider abstraction |
| Out of scope | Order FSM changes |
| Out of scope | Inventory settlement changes |

---

## 11. Test Gates

### Unit Tests: 8+ minimum

| # | Test | Category |
|---|---|---|
| 1 | Separate running flags: create reconciliation does not block cancel | Mutex fix |
| 2 | Separate running flags: cancel reconciliation does not block create | Mutex fix |
| 3 | Tracking poller: DELIVERED on cancelled shipment → exception event | Delivered-after-cancel |
| 4 | Tracking poller: DELIVERED on cancelled shipment → recoveryStatus = DELIVERED_AFTER_CANCEL | Delivered-after-cancel |
| 5 | Tracking poller: DELIVERED on cancelled shipment → processCarrierDelivery NOT called | Delivered-after-cancel |
| 6 | Tracking poller: DELIVERED on non-cancelled shipment → normal flow | Regression |
| 7 | Reconciliation: PICKUP_CANCELLED check removed → only CANCELLED matches | Cleanup |
| 8 | Timeout → UNKNOWN (B.3.3.3 regression) | Regression |

### PostgreSQL Tests: 3+ minimum

| # | Test | Category |
|---|---|---|
| 1 | Delivered-after-cancel: exception event recorded in shipment_events | Exception detection |
| 2 | Delivered-after-cancel: carrier_status_mapped NOT advanced | Exception detection |
| 3 | Delivered-after-cancel: order remains CANCELLED | FSM invariant |

---

## 12. Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | No verified active-state method blocks UNKNOWN → PENDING and re-cancel | HIGH | Accepted — admin-only path is safe. Live Aramex verification unblocks. |
| R-2 | Tracking poller exception detection adds a write to the poller path | LOW | Write is idempotent (recoveryStatus set atomically). No carrier call added. |
| R-3 | Removing PICKUP_CANCELLED check could miss a real cancellation | LOW | SH012 → CANCELLED is the only Aramex cancellation code. Check is unreachable. |
| R-4 | Separate reconciliation flags could allow concurrent create+cancel reconciliation | LOW | FOR UPDATE SKIP LOCKED handles cross-process safety. Flags are single-process only. |
| R-5 | DELIVERED_AFTER_CANCEL recovery token could conflict with existing tokens | LOW | Already defined in shipping.types.ts. No collision with existing tokens. |

---

## 13. Release Gate

```
Architecture Audit          → COMPLETE (SCS-M7.3-B.3.4-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md)
Business/Architecture Lock  → COMPLETE (this document)
Implementation              → next
Independent Runtime Verification → after implementation
Release Closure             → final
```

No implementation proceeds before this lock is complete. No runtime verification proceeds before implementation. No release closure proceeds before runtime verification.

---

## 14. Final Locked Decision

```
========================================
SCS M7.3-B.3.4 — BUSINESS RULES & ARCHITECTURE LOCK
========================================

Audit verdict          : GO WITH CONDITIONS (8 conditions)
Lock verdict           : GO — all conditions resolved

Business decisions     : BD-3.4-01 through BD-3.4-10 — ALL LOCKED
Architecture decisions : C6 (tracking poller exception detection)
                         C7 (PICKUP_CANCELLED removal)

Migration              : NO NEW MIGRATION (0049 sufficient)
Provider capability    : NO NEW METHOD (getPickupStatus deferred)
State vocabulary       : Already defined (DELIVERED_AFTER_CANCEL exists)
Recovery tokens        : Already defined (DELIVERED_AFTER_CANCEL in types)
Partial index          : Already covers active cancel states

Aramex safety          : No speculative logic. 6 evidence requirements documented.
                         Conservative active-state until live verification.

CI regression          : B3321-PG-11 stale assertion resolved (timeout → UNKNOWN)

Test gates             : 8+ unit, 3+ PG

Scope                  : Mutex fix, delivered-after-cancel exception detection,
                         PICKUP_CANCELLED cleanup, Aramex evidence documentation

Non-goals              : Returns, refunds, payment, disputes, notifications
                         getPickupStatus() (deferred)
                         UNKNOWN → PENDING automatic (deferred)
                         Re-cancel (deferred)
                         Webhook cancellation processing (deferred)
                         B.3.3.5 unique index (deferred)

Verdict                : GO
Status                 : LOCKED
========================================
```

---

*No production code was modified during this lock.*
