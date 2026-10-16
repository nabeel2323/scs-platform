# SCS-M7.3-B.4 — Pre-Implementation Architecture Audit

**Delivery Exceptions + Retry**

| Field | Value |
|---|---|
| Milestone | M7.3-B.4 |
| Task type | Pre-implementation architecture audit — READ-ONLY |
| Status | **COMPLETE** |
| Verdict | **GO WITH CONDITIONS** (5 conditions) |
| Date | 2026-10-02 |
| Branch | develop |
| HEAD | 380a3f9ee4b62810ceefec303e1dff2bd9e5dbc6 |
| Predecessor | B.3.4 CLOSED/PASS |
| Parent Lock | SCS-M7.3-B-BUSINESS-RULES-ARCHITECTURE-LOCK.md (LOCKED) |

---

## 1. Metadata

This audit determines whether the SCS shipping/delivery architecture can safely progress from the current B.3.4 closed state into M7.3-B.4 — Delivery Exceptions + Retry. It specifically addresses:

1. The absence of any delivery exception model in the current codebase
2. The shipment schema gap (no exception columns)
3. The API gap (no exception/retry endpoints)
4. The service-layer gap (no exception lifecycle management)
5. The state-machine gap (no exception FSM)
6. Concurrency between exception reporting and delivery/cancellation
7. Security/authorization for exception operations
8. Data model impact (migration 0050)
9. Outbox event contracts
10. Relationship to B.5 (RTS + Reconciliation)

---

## 2. Current Project State

```text
Branch:           develop
HEAD:             380a3f9ee4b62810ceefec303e1dff2bd9e5dbc6
Working tree:     CLEAN
Migrations:       0001–0049 (latest: 0049_carrier_cancellation.sql)
Latest commit:    test(shipping): add comprehensive race closure and reconciliation tests
```

### Handoff Discrepancy

The user's handoff specified HEAD `48e37a79dfdbfad17a353d6929fcf083617a7f31`. The current HEAD is `380a3f9`, which is the B.3.4 implementation commit. This is expected — the handoff HEAD was the pre-implementation baseline; the current HEAD includes the committed B.3.4 work. No discrepancy in behavior.

---

## 3. Previous Milestone Closure

### M7.3-B.3.4 — CLOSED / PASS

| Gate | Evidence |
|---|---|
| Implementation | `SCS-M7.3-B.3.4-IMPLEMENTATION-REPORT.md` |
| Runtime Verification | `SCS-M7.3-B.3.4-INDEPENDENT-RUNTIME-VERIFICATION.md` — PASS |
| Release Closure | `SCS-M7.3-B.3.4-RELEASE-CLOSURE.md` — CLOSED/PASS |
| Unit tests | 28/28 |
| PostgreSQL tests | 13/13 |
| Regression | 730/730 shipping+orders; 1267/1268 full non-PG (1 pre-existing flake) |
| TypeScript | 0 issues |
| Build | 0 issues, 271 files |

### M7.3-B Cumulative Closures

| Sub-milestone | Status |
|---|---|
| B.1 — Cancellation Concurrency Hardening | CLOSED/PASS |
| B.2 — Merchant Cancellation + Shipment Sync | CLOSED/PASS |
| B.3 — Carrier Cancellation (B.3.1–B.3.4) | CLOSED/PASS |
| **B.4 — Delivery Exceptions + Retry** | **NEXT** |
| B.5 — RTS + Reconciliation | PENDING |
| B.6 — Runtime Verification | PENDING |
| B.7 — Release Closure | PENDING |

---

## 4. Roadmap Evidence

### Primary Source

`SCS-M7.3-B-BUSINESS-RULES-ARCHITECTURE-LOCK.md` §36 Implementation Sequence (lines 1439–1451):

```text
### M7.3-B.4 — Delivery Exceptions + Retry

Goal: Fix F-04 (delivery exception model)
Files: orders.service.ts, orders.controller.ts, shipment.schema.ts
Database: Migration 0048 (shipment exception columns)
API: POST /shipments/:id/exception, POST /shipments/:id/retry
Security: Driver/merchant/admin authorization
Tests: Exception lifecycle tests, retry tests, attempt counting
Concurrency tests: Exception vs delivery race
Exit criteria: Exception model working, retry working, max attempts enforced
Dependencies: M7.3-B.3
```

### Migration Numbering Discrepancy

The lock document references "Migration 0048" for B.4 exception columns. However:
- Migration 0048 is already used: `0048_cancellation_metadata.sql` (B.2)
- Migration 0049 is already used: `0049_carrier_cancellation.sql` (B.3.1)
- **B.4 must use migration 0050**

This is a documentation numbering error in the lock document, not an architecture change. The column definitions remain valid.

### Authorization Chain

```text
M7.3-B Pre-Implementation Audit (F-04 identified)
    → M7.3-B.0 Lock (F-04 disposition: shipment-level exception FSM, B.4)
        → B.1 (CLOSED) → B.2 (CLOSED) → B.3 (CLOSED through B.3.4)
            → B.4 (NEXT): Delivery Exceptions + Retry
```

---

## 5. Next Milestone Identification

| Attribute | Value |
|---|---|
| **Identifier** | M7.3-B.4 |
| **Title** | Delivery Exceptions + Retry |
| **Finding** | F-04 (HIGH): Zero delivery exception handling |
| **Explicitly authorized** | Yes — lock document §36, lines 1439–1451 |
| **Business problem** | No mechanism to report, track, or resolve delivery failures |
| **Why it follows** | B.1–B.3 established cancellation/concurrency/carrier foundations; B.4 adds the delivery-failure dimension |
| **Dependencies** | M7.3-B.3 (carrier cancellation) — CLOSED |
| **Successor** | B.5 — RTS + Reconciliation |

---

## 6. Business Objective

The platform currently has no mechanism to handle delivery failures. When a driver arrives and the recipient is unavailable, refuses the package, the address is wrong, the package is damaged, or the package is lost, there is no structured way to:

1. Report the exception
2. Track the exception lifecycle
3. Authorize a retry delivery attempt
4. Enforce maximum delivery attempts
5. Escalate to return-to-sender (RTS)

B.4 delivers the **exception model and retry capability**. RTS operational state recording is B.5.

---

## 7. Current Architecture

### 7.1 Order FSM (orders.service.ts L2205–2222)

```text
DRAFT → SUBMITTED → PENDING_CONFIRMATION → ACCEPTED | PARTIALLY_ACCEPTED | REJECTED | CANCELLED
ACCEPTED/PARTIAL → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED → COMPLETED
ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY
DELIVERED → COMPLETED | DISPUTED
Any pre-DELIVERED → CANCELLED
```

**Key invariant:** OUT_FOR_DELIVERY → [DELIVERED] is the ONLY transition. No exception branch exists.

### 7.2 Shipment Status Flow

```text
PREPARING → ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED → COMPLETED
                                                      → CANCELLED (via order cancellation)
```

### 7.3 Delivery Path (orders.service.ts)

- `deliverOrder()` (L1580): Driver-initiated delivery. Optimistic lock, stock settlement (SALE), shipment update, outbox event, master recalc, auto-complete schedule.
- `processCarrierDelivery()` (L2467): Carrier-initiated delivery bridge. Same core logic without driver ownership check. B.3.4 added DELIVERED_AFTER_CANCEL detection.
- `outForDeliveryOrder()` (L1572): Driver marks PICKED_UP → OUT_FOR_DELIVERY.

### 7.4 Tracking Architecture

- `carrier-tracking-poller.ts`: Periodic poll, atomic claim, backward-transition prevention, terminal-state filtering, DELIVERED_AFTER_CANCEL detection (B.3.4).
- `shipping-carrier.worker.ts` `handleTrack()` (L725): Outbox-driven tracking poll via `provider.getTrackingInfo()`. Updates `carrierStatusRaw` and `lastCarrierSyncAt`.
- `carrier-reconciliation.service.ts`: Create + cancel reconciliation cycles with separate mutexes (B.3.4).

### 7.5 Shipment Schema (shipment.schema.ts)

Current columns: id, orderId, storeId, status, assignedDriverId, timestamps, deliveryAddress, carrierTrackingId, shippingMethodId, shippingProviderKey, carrier state (0043), recovery state (0045), pickup/cancel state (0049).

**No exception columns exist.**

### 7.6 Existing API Endpoints (Delivery-Related)

| Endpoint | Permission | Role |
|---|---|---|
| POST /orders/:id/out-for-delivery | fulfillment:shipments:pickup | Driver |
| POST /orders/:id/deliver | fulfillment:shipments:deliver | Driver |
| POST /orders/:id/confirm-delivery | orders:write | Buyer |
| POST /shipments/:id/create | fulfillment:shipments:write | Merchant |
| POST /shipments/:id/cancel | fulfillment:shipments:write | Merchant |
| GET /shipments/:id/tracking | fulfillment:shipments:read | Merchant |

**No exception or retry endpoints exist.**

---

## 8. Domain Model

### 8.1 Entities / Tables

| Entity | Current State | B.4 Impact |
|---|---|---|
| orders | 16-state FSM | No change — order status remains OUT_FOR_DELIVERY during exception |
| shipments | Status lifecycle | New columns: exception_status, exception_type, exception_notes, exception_at, exception_resolved_at, delivery_attempts, max_delivery_attempts |
| shipment_events | Append-only audit trail | New event types: DELIVERY_EXCEPTION, DELIVERY_RETRY_REQUESTED, DELIVERY_RETRY_ATTEMPTED, DELIVERY_EXCEPTION_RESOLVED, DELIVERY_EXCEPTION_CLOSED |
| outbox_events | Transactional outbox | New event names: shipment.delivery_exception, shipment.delivery_retry_requested |

### 8.2 New Exception States (Shipment-Level)

```text
(null)       → OPEN         → RETRY_PENDING  → OPEN (retry outcome)
             → OPEN         → RESOLVED       → CLOSED
             → OPEN         → RTS_PENDING    → RTS_COMPLETED → CLOSED  [RTS states added in B.4 schema but RTS endpoint is B.5]
             → OPEN         → CLOSED
```

### 8.3 Canonical Exception Types

| Code | Reporter | Notes |
|---|---|---|
| RECIPIENT_UNAVAILABLE | DRIVER | Most common; retry first |
| RECIPIENT_REFUSED | DRIVER | RTS recommended after 2 refusals, mandatory after 3 |
| WRONG_ADDRESS | DRIVER | Retry with corrected address |
| DAMAGED | DRIVER/MERCHANT | No retry; merchant decides disposition |
| LOST | CARRIER/ADMIN/SYSTEM | Admin investigation first |
| CARRIER_EXCEPTION | CARRIER/SYSTEM | Via webhook or stale tracking |
| DRIVER_EXCEPTION | DRIVER | Vehicle, weather, safety |
| OTHER | Any | Notes required |

### 8.4 Services

| Service | B.4 Responsibility |
|---|---|
| OrdersService | Exception reporting, retry authorization, attempt counting, outbox events |
| OrdersController | New endpoints: POST /shipments/:id/exception, POST /shipments/:id/retry |

### 8.5 External Integrations

| Integration | B.4 Impact |
|---|---|
| Aramex | No change — no exception-related Aramex API exists |
| Manual Delivery | Driver reports exceptions via existing driver API |
| Carrier Webhooks | Future: may auto-create exceptions for LOST/DAMAGED (not in B.4 scope) |

---

## 9. Existing Invariants

The following invariants MUST be preserved by B.4:

| ID | Invariant | Source |
|---|---|---|
| INV-01 | Order status unchanged during delivery exception | Lock §21 |
| INV-02 | Exception model is shipment-level, not order FSM | Lock §6 |
| INV-03 | Four state dimensions never conflated (shipment status, exception status, order status, carrier status) | Lock §20 |
| INV-04 | Inventory transactional safety — no inventory movement on exception | Lock §13 |
| INV-05 | Optimistic locking for all state transitions | ADR-B0-002 |
| INV-06 | SCS cancellation authority — cancellation wins over delivery | Lock §12 |
| INV-07 | Tenant/merchant/driver isolation | Lock §26 |
| INV-08 | Idempotency — duplicate exception reports handled safely | Lock §15 pattern |
| INV-09 | Concurrency safety — FOR UPDATE SKIP LOCKED where applicable | Existing pattern |
| INV-10 | Auditability — all exception transitions recorded in shipment_events | Lock §19 |
| INV-11 | Transactional outbox — exception events emitted inside same TX | Lock §13 |
| INV-12 | Max delivery attempts enforced (default 3, configurable 1–10) | Lock §25 |
| INV-13 | Master order aggregation unaffected by exception (sub-order stays OUT_FOR_DELIVERY) | Lock §21 |

---

## 10. Architecture Gaps

### Confirmed Requirement

| Gap | Evidence | B.4 Scope |
|---|---|---|
| No exception columns on shipments table | shipment.schema.ts — no exception_status, exception_type, etc. | YES — migration 0050 |
| No exception reporting endpoint | orders.controller.ts / shipment-operations.controller.ts — no /exception route | YES — new endpoint |
| No retry endpoint | Same — no /retry route | YES — new endpoint |
| No exception lifecycle methods | orders.service.ts — no reportException, authorizeRetry, etc. | YES — new methods |
| No exception outbox events | audit schema / outbox — no shipment.delivery_exception event | YES — new events |
| No delivery attempt counter | No delivery_attempts column or incrementing logic | YES — new column + logic |

### Architectural Implication

| Implication | Impact |
|---|---|
| New migration required | Migration 0050 — additive columns, backward-compatible |
| New controller endpoints | Exception and retry routes with proper authorization |
| Exception FSM | New state machine orthogonal to order FSM and shipment status |
| Outbox event contract | Two new events: shipment.delivery_exception, shipment.delivery_retry_requested |
| Test surface | Unit + PostgreSQL + concurrency + security tests required |

### Open Business Decision

None — all B.4 business decisions are locked in the B.0 document. OQ-3 (refused → OPEN vs RTS_PENDING) and OQ-4 (per-shipment vs per-order attempts) are LOCKED with defaults.

### Implementation Detail

| Detail | Resolution |
|---|---|
| Migration number | 0050 (lock doc says 0048, which is taken — documentation error) |
| Column naming | snake_case in DB, camelCase in Drizzle (consistent with existing schema) |
| Exception endpoint location | Shipment-operations controller or orders controller (lock doc specifies POST /shipments/:id/exception) |
| RTS columns in B.4 schema | exception_status supports RTS_PENDING/RTS_COMPLETED values, but RTS endpoint is B.5 |

---

## 11. Data Model Impact

### Migration 0050 — Shipment Exception Columns (PROPOSED)

Based on lock document §33 Database Change Plan (L1218–1247):

| Table | Column | Type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| shipments | exception_status | VARCHAR(24) | Yes | NULL | Current exception lifecycle state |
| shipments | exception_type | VARCHAR(30) | Yes | NULL | Type of current/most-recent exception |
| shipments | exception_notes | TEXT | Yes | NULL | Free-text exception details |
| shipments | exception_at | TIMESTAMPTZ | Yes | NULL | When exception was opened |
| shipments | exception_resolved_at | TIMESTAMPTZ | Yes | NULL | When exception was resolved/closed |
| shipments | delivery_attempts | INTEGER | No | 0 | Number of delivery attempts made |
| shipments | max_delivery_attempts | INTEGER | No | 3 | Maximum allowed delivery attempts |

**Proposed Index:**
```sql
CREATE INDEX IF NOT EXISTS idx_shipments_exception_status
  ON shipments(exception_status)
  WHERE exception_status IS NOT NULL;
```

**Safety:**
- All columns additive (nullable or defaulted)
- No column drops or renames
- No data migration required
- Zero-downtime safe
- Idempotent (IF NOT EXISTS)

**NOT added (and why):**
- No order table changes (order status is unchanged during exception)
- No new tables (exception lifecycle tracked via existing shipment_events)
- RTS-specific columns deferred — exception_status column accommodates RTS states

---

## 12. API Impact

### POST /v1/shipments/:id/exception (NEW)

```text
Actor: DRIVER, MERCHANT, ADMIN
Permission: 'shipments:write' (driver/admin) or 'merchant:orders:write' (merchant)
Request: { "type": "RECIPIENT_UNAVAILABLE", "notes": "...", "evidence": "optional" }
Response: { "shipmentId", "exceptionStatus": "OPEN", "exceptionType", "createdAt" }
Errors: 404 (not found), 409 (already has open exception), 400 (invalid type)
State: Shipment in OUT_FOR_DELIVERY (driver); shipment exists and not terminal (merchant/admin)
Idempotency: Same exception type already OPEN → return existing (idempotent)
Tenant: Driver → assignedDriverId check; Merchant → storeId.orgId check; Admin → bypass
```

### POST /v1/shipments/:id/retry (NEW)

```text
Actor: MERCHANT, ADMIN
Permission: 'merchant:orders:write' or 'shipments:write'
Request: { "notes": "optional" }
Response: { "shipmentId", "exceptionStatus": "RETRY_PENDING", "attemptNumber" }
Errors: 404, 409 (no open exception / max attempts reached), 403
State: Exception OPEN, deliveryAttempts < maxDeliveryAttempts
Idempotency: Second retry while RETRY_PENDING → 409
Tenant: Merchant → storeId.orgId check; Admin → bypass
```

### Authorization Matrix (from lock §26)

| Action | DRIVER | MERCHANT | ADMIN |
|---|---|---|---|
| Report exception | Yes (assigned shipments; specific types) | Yes (own store shipments) | Yes (any) |
| Resolve exception | No | Yes (own store) | Yes |
| Request retry | Suggest only | Yes (own store) | Yes |
| Request RTS | No | Yes (request) | Yes |
| Close exception | No | Yes | Yes |

---

## 13. State Machine Impact

### Order FSM

**No change.** The order remains OUT_FOR_DELIVERY during the entire exception lifecycle. This is the core architectural decision (Lock §6, §21).

### Shipment Status FSM

**No change.** The shipment status remains unchanged during exception handling. The exception is tracked via the new `exception_status` column, which is orthogonal to `status`.

### Exception FSM (NEW)

```text
           (no exception)
                 │
          ┌──────┴──────┐
          │  exception   │
          │  reported    │
          └──────┬──────┘
                 ▼
              ┌──────┐
              │ OPEN │◄──────── retry failed (new exception)
              └──┬───┘
         ┌───────┼────────┬──────────┐
         ▼       ▼        ▼          ▼
   RETRY_PENDING  RESOLVED  RTS_PENDING  CLOSED
         │                    │
         ▼                    ▼
       OPEN             RTS_COMPLETED
                              │
                              ▼
                           CLOSED
```

### Carrier Lifecycle

**No change.** Carrier status tracking remains independent.

### Recovery Lifecycle

**No change.** Existing recovery/reconciliation continues to operate on its own state dimensions.

---

## 14. Concurrency Analysis

### Race: Exception Report vs Exception Report

Two drivers/merchants simultaneously report an exception on the same shipment.

**Mitigation:** Optimistic lock: `UPDATE shipments SET exception_status = 'OPEN' WHERE id = ? AND exception_status IS NULL`. Rows affected = 0 → 409 Conflict. Second caller sees existing OPEN exception (idempotent if same type).

### Race: Retry vs Retry

Two merchants simultaneously request retry.

**Mitigation:** Optimistic lock: `UPDATE shipments SET exception_status = 'RETRY_PENDING' WHERE id = ? AND exception_status = 'OPEN'`. Rows affected = 0 → 409.

### Race: Exception Report vs Delivery

Driver reports exception while another driver confirms delivery.

**Mitigation:** Delivery uses order-level optimistic lock (WHERE status = 'OUT_FOR_DELIVERY'). Exception uses shipment-level check. If delivery commits first, order is DELIVERED and the exception report should be rejected (shipment is no longer in a reportable state). If exception commits first, delivery's order-level lock still succeeds — but the shipment now has an open exception. **This requires careful ordering:** exception reporting must verify order status is still OUT_FOR_DELIVERY before recording.

### Race: Exception vs Cancellation

Order is cancelled while shipment has an open exception.

**Mitigation:** Cancellation sets shipment status = CANCELLED. Exception operations should check shipment status is not terminal. If cancellation commits first, exception report is rejected. If exception is open and cancellation occurs, the exception is implicitly closed (shipment cancelled).

### Race: Carrier Delivery vs Exception

Carrier tracking reports DELIVERED while an exception is open.

**Mitigation:** processCarrierDelivery() transitions order to DELIVERED. If an exception is open, the delivery should resolve the exception (exception_status → RESOLVED) as part of the delivery transaction, or the delivery should be rejected because an exception is open. **Decision required:** Does carrier delivery auto-resolve open exceptions?

### Concurrent Workers

The shipping-carrier.worker.ts processes tracking events concurrently. If a tracking event triggers exception creation (future: LOST detection), it must not race with manual exception reporting. Currently, tracking only updates carrierStatusRaw — no exception creation in B.4 scope.

---

## 15. Failure and Recovery Analysis

| Failure | Impact | Recovery |
|---|---|---|
| TX fails after exception recorded but before outbox event | Exception persisted, no notification | Outbox is inside same TX — either both commit or both roll back |
| TX fails after retry authorized but before attempt counter incremented | Retry state set but counter wrong | Both inside same TX — atomic |
| Driver crashes after reporting exception | Exception partially recorded | TX ensures all-or-nothing |
| Retry requested but driver never attempts re-delivery | Exception stuck in RETRY_PENDING | Manual admin intervention; no automatic timeout in B.4 |
| Duplicate exception report (network retry) | Two OPEN exceptions | Idempotency: second report returns existing OPEN exception |
| Max attempts miscounted | Premature or delayed RTS | delivery_attempts column with DEFAULT 0, incremented atomically in TX |

---

## 16. Security / Tenant Isolation

| Threat | Protection |
|---|---|
| Driver reporting exception on unassigned shipment | `assignedDriverId = caller.userId` check |
| Merchant managing exception on another merchant's shipment | `shipment.storeId.orgId = caller.orgId` check |
| Cross-tenant exception access | Org isolation in tenant-scope.ts |
| Driver escalating to admin operations | Role check: DRIVER cannot resolve/close/retry |
| Merchant approving RTS without admin | RTS approval is B.5; B.4 merchant can request but not approve |
| Admin bypass exposure | BYPASS_ROLES limited to SUPER_ADMIN, ADMIN, MODERATOR; logged |
| IDOR on exception endpoint | UUID PKs + ownership/org checks |
| Horizontal privilege escalation | Tenant isolation checks on all exception operations |

---

## 17. External Provider Impact

### Aramex

| Capability | Status | Evidence |
|---|---|---|
| CancelShipment | NOT SUPPORTED | `canCancel: false` in aramex.provider.ts L122 |
| CancelPickup | SUPPORTED | `canCancelPickup: true` — used by B.3 |
| GetTrackingInfo | SUPPORTED | `canTrack: true` — used by tracking poller |
| RTS API | DOES NOT EXIST | Lock §9: "Aramex has no RTS API" |
| Exception reporting API | DOES NOT EXIST | Exception reporting is SCS-internal |
| Webhook exception events | UNKNOWN / NOT IN B.4 SCOPE | Aramex webhook parser exists but no exception mapping |

### Manual Delivery

No external API. Driver reports exceptions through the SCS driver API.

### Verified vs Speculated

```text
Verified:   Aramex has no RTS API
Verified:   Aramex has no exception reporting API
Verified:   Exception reporting is entirely SCS-internal in B.4
Verified:   Manual delivery drivers use SCS API for exception reporting
Speculated: None — no new carrier behavior is assumed
```

---

## 18. Scope Boundary

### In Scope

1. Migration 0050: shipment exception columns (exception_status, exception_type, exception_notes, exception_at, exception_resolved_at, delivery_attempts, max_delivery_attempts)
2. Exception lifecycle: report → OPEN → resolve/retry/close
3. Delivery retry: authorize retry → RETRY_PENDING → attempt → OPEN (success/fail)
4. Delivery attempt counting: increment on each physical delivery attempt
5. Max delivery attempts enforcement: configurable (default 3, range 1–10), env DELIVERY_MAX_ATTEMPTS
6. API: POST /shipments/:id/exception, POST /shipments/:id/retry
7. Authorization: driver/merchant/admin matrix per lock §26
8. Outbox events: shipment.delivery_exception, shipment.delivery_retry_requested
9. Shipment event types: DELIVERY_EXCEPTION, DELIVERY_RETRY_REQUESTED, DELIVERY_RETRY_ATTEMPTED, DELIVERY_EXCEPTION_RESOLVED, DELIVERY_EXCEPTION_CLOSED
10. Exception type validation (8 canonical types)
11. Unit tests, PostgreSQL integration tests, concurrency tests, security tests

### Out of Scope

1. **RTS endpoint** (POST /shipments/:id/rts) — B.5 scope
2. **RTS approval flow** — B.5 scope
3. **Inventory return-to-stock** — M7.3-C scope
4. **Financial refund handling** — M7.3-D scope
5. **Buyer-initiated exception reporting** — M7.3-E scope
6. **Notification expansion** — M7.3-F scope
7. **Photo evidence storage** — future milestone
8. **Carrier webhook → auto-exception** — not authorized in B.4
9. **Stale tracking → auto-LOST** — not authorized in B.4
10. **Order FSM changes** — explicitly excluded
11. **New carrier integration methods** — no Aramex API changes
12. **getPickupStatus** — explicitly deferred
13. **UNKNOWN → PENDING** — explicitly deferred
14. **Automatic re-cancel** — explicitly deferred
15. **Cancellation webhook processing** — explicitly deferred

### Requires Business Decision

None — all B.4 decisions are locked.

### Requires External Verification

None — B.4 is entirely SCS-internal. No carrier API verification needed.

---

## 19. Architecture Recommendation

### Layer Architecture

```text
Business Capability
    │  Report delivery exceptions, authorize retries, enforce max attempts
    ▼
Domain Model
    │  Shipment exception FSM (OPEN → RETRY_PENDING/RESOLVED/CLOSED)
    │  Exception types (8 canonical)
    │  Delivery attempt counter
    ▼
Application Services
    │  OrdersService.reportDeliveryException()
    │  OrdersService.authorizeDeliveryRetry()
    │  OrdersService.resolveDeliveryException()
    │  (all inside single TX with outbox events)
    ▼
Persistence
    │  Migration 0050: 7 additive columns on shipments
    │  Partial index on exception_status WHERE NOT NULL
    │  Optimistic locking: WHERE exception_status = expected
    ▼
Events / Workers
    │  Outbox: shipment.delivery_exception, shipment.delivery_retry_requested
    │  Shipment events: DELIVERY_EXCEPTION, DELIVERY_RETRY_REQUESTED, etc.
    │  No new workers — exception handling is synchronous/API-driven
    ▼
External Providers
    │  No change — B.4 is entirely SCS-internal
    │  Aramex untouched
```

### Key Design Decisions

1. **Exception reporting is synchronous** — no outbox worker needed for exception creation. The API call directly creates the exception inside a TX.
2. **Retry is synchronous** — merchant/admin authorizes retry via API. The actual re-delivery is a driver operation (existing OUT_FOR_DELIVERY flow).
3. **No new workers** — exception handling is request-driven, not event-driven. Outbox events are emitted for downstream consumers (notifications, dashboard) but no new worker consumes them in B.4.
4. **Exception columns on shipments table** — not a separate exceptions table. The shipment is the aggregate root for delivery exceptions.
5. **Retry reuses existing shipment** — no new shipment created for retry (lock §8).

---

## 20. Verification Strategy

### Unit Tests

| Test Area | Cases |
|---|---|
| Exception type validation | 8 valid types, invalid type rejected |
| Exception state transitions | All valid/invalid transitions |
| Delivery attempt counting | Increment, max detection, boundary (1, 3, 10) |
| Max attempts enforcement | At max, over max, configurable max |
| Authorization matrix | Driver/merchant/admin permission checks |
| Idempotency | Duplicate exception report, duplicate retry |
| Order status unchanged | Exception does not affect order FSM |
| Shipment state checks | Exception only in valid shipment states |

### PostgreSQL Integration Tests

| Test Area | Cases |
|---|---|
| Exception lifecycle | OPEN → RETRY_PENDING → OPEN → RESOLVED → CLOSED |
| Attempt counting | Counter increments atomically in TX |
| Concurrent exception reports | 100 simultaneous → exactly 1 succeeds |
| Concurrent retry requests | 100 simultaneous → exactly 1 succeeds |
| Exception vs delivery race | Exception report vs deliverOrder → one wins |
| Exception vs cancellation race | Exception open + order cancelled → exception implicitly closed |
| TX atomicity | Exception + outbox event in same TX |
| Migration safety | 0050 applies to fresh DB and existing DB |

### Regression

| Suite | Expected |
|---|---|
| M7.3-B.1 (concurrency) | All green |
| M7.3-B.2 (merchant cancel) | All green |
| M7.3-B.3 (carrier cancel, all sub-milestones) | All green |
| M7.3-A (delivery completion) | All green |
| M7.2.x (shipping/carrier) | All green |
| Full non-PG suite | 0 new failures |
| TypeScript | 0 issues |
| Nest build | 0 issues |

### Security Tests

| Test | Expected |
|---|---|
| Driver A reports exception on Driver B's shipment | 403 Forbidden |
| Merchant A reports exception on Merchant B's shipment | 403 Forbidden |
| Cross-tenant exception access | 403 Forbidden |
| Driver attempts to resolve exception | 403 Forbidden |
| Merchant attempts admin-only operation | 403 Forbidden |
| Admin bypass logged | Audit trail present |

---

## 21. Risk Register

| ID | Risk | Evidence | Impact | Likelihood | Mitigation | Requires Decision |
|---|---|---|---|---|---|---|
| R-01 | Exception vs delivery race leaves inconsistent state | deliverOrder() uses order-level lock; exception uses shipment-level | HIGH | MEDIUM | Exception report must verify order status is OUT_FOR_DELIVERY; if delivery commits first, exception is rejected | No — implementation detail |
| R-02 | Migration 0050 numbering confusion (lock doc says 0048) | Lock §33 says "0048"; 0048 and 0049 already exist | LOW | HIGH | Use 0050; document the discrepancy | No — clear from evidence |
| R-03 | RETRY_PENDING state with no automatic re-delivery mechanism | B.4 retry is authorization only; actual re-delivery is manual driver action | MEDIUM | MEDIUM | Driver must be notified (future M7.3-F); in B.4, retry sets status and emits outbox event; no automatic dispatch | No — by design |
| R-04 | Exception open when order cancelled | Cancellation sets shipment CANCELLED; exception may still be OPEN | LOW | LOW | Cancellation should clear open exceptions (set exception_status = CLOSED) inside the cancel TX | No — implementation detail |
| R-05 | delivery_attempts drift from actual attempts | Counter incremented in TX but driver may not actually attempt | LOW | LOW | Counter incremented when driver transitions through delivery attempt flow, not when exception reported | No — implementation detail |
| R-06 | Pre-existing camelCase/snake_case mismatch affects exception queries | B.3.4 verification identified poller reads camelCase from raw SQL | LOW | LOW | B.4 uses Drizzle ORM for all queries (not raw SQL); consistent with existing pattern | No — pre-existing |

---

## 22. Recommendation

### Verdict: GO WITH CONDITIONS

The architecture is well-understood and the B.4 scope is clearly defined by the locked B.0 document. The implementation is straightforward: additive schema change, new service methods, new endpoints, new tests. No carrier API changes required.

### Conditions

1. **Migration 0050** — must use 0050 (not 0048 as the lock document states). The lock document has a numbering error.
2. **Exception vs delivery race** — exception reporting must verify order status is OUT_FOR_DELIVERY inside the same transaction.
3. **Cancellation clears exceptions** — order cancellation TX must close any open exception on the shipment.
4. **RTS schema in B.4, RTS logic in B.5** — the exception_status column supports RTS_PENDING/RTS_COMPLETED values, but the RTS endpoint and approval flow are B.5 scope.
5. **No automatic re-delivery** — retry authorization sets RETRY_PENDING and emits an outbox event. Actual driver dispatch for retry is manual (notification deferred to M7.3-F).

---

## 23. Architecture Audit Conclusion

```text
========================================
SCS M7.3-B.4 — ARCHITECTURE AUDIT COMPLETE
========================================

Branch: develop
HEAD:   380a3f9ee4b62810ceefec303e1dff2bd9e5dbc6

Next milestone: M7.3-B.4 — Delivery Exceptions + Retry
Authorization:  Lock document §36 lines 1439–1451 (EXPLICIT)
Finding:        F-04 (HIGH): Zero delivery exception handling

Scope summary:
  - Migration 0050: 7 additive shipment columns
  - 2 new API endpoints (exception, retry)
  - Exception FSM (OPEN → RETRY_PENDING/RESOLVED/CLOSED)
  - 8 canonical exception types
  - Delivery attempt counting + max enforcement
  - Driver/merchant/admin authorization matrix
  - 2 new outbox events
  - No carrier API changes
  - No order FSM changes
  - No inventory movement

Dependencies: M7.3-B.3 CLOSED/PASS
Successor:    M7.3-B.5 — RTS + Reconciliation

Verdict: GO WITH CONDITIONS (5 conditions)

Open business decisions: 0
Open blocking decisions: 0
External verification:   None required

Implementation performed: NO
========================================
```

---

## 24. Files Inspected

### Source Files

| File | Lines | Role |
|---|---|---|
| `orders.service.ts` | 2587 | Order FSM, delivery, cancellation, settlement |
| `orders.controller.ts` | 215 | API endpoints for orders |
| `shipment.schema.ts` | 105 | Shipments + shipment_events Drizzle schema |
| `shipping.schema.ts` | 199 | Carrier/shipping tables |
| `shipment-operations.controller.ts` | ~260 | Shipment CRUD endpoints |
| `shipping-carrier.worker.ts` | 938 | Outbox event processing (create/cancel/track/webhook) |
| `carrier-tracking-poller.ts` | ~337 | Periodic tracking poll |
| `carrier-reconciliation.service.ts` | ~602 | Create + cancel reconciliation |
| `shipping-provider.ts` | ~107 | Abstract provider interface |
| `aramex/aramex.provider.ts` | 1116 | Aramex implementation |
| `shipping.types.ts` | ~305 | Status vocabulary, types |

### Documentation

| Document | Status |
|---|---|
| `SCS-M7.3-B-BUSINESS-RULES-ARCHITECTURE-LOCK.md` | LOCKED (1672 lines) |
| `SCS-M7.3-B-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md` | COMPLETE (1499 lines) |
| `SCS-M7.3-B.3.4-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md` | COMPLETE (808 lines) |
| `SCS-M7.3-B.3.4-RELEASE-CLOSURE.md` | CLOSED/PASS (281 lines) |
| `SCS-M7.3-B.3.4-IMPLEMENTATION-REPORT.md` | COMPLETE |
| `SCS-M7.3-B.3.4-INDEPENDENT-RUNTIME-VERIFICATION.md` | PASS |

### Migrations

| Migration | Lines | Content |
|---|---|---|
| `0048_cancellation_metadata.sql` | 9 | Order cancellation columns (B.2) |
| `0049_carrier_cancellation.sql` | 44 | Carrier cancel columns + index (B.3.1) |
| 0050 | Does not exist | Required for B.4 |

---

## 25. Confirmation

**NO implementation changes were made.** This audit is strictly read-only. No source code, tests, migrations, configuration, or documentation files were modified. This document is the only artifact produced.

**The audit stopped after completing the architecture analysis.** No implementation, migration, test, or endpoint changes were made. The next stage is the Business/Architecture Lock.
