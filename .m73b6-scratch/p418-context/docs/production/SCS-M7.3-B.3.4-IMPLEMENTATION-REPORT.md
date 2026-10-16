# SCS-M7.3-B.3.4 — Implementation Report

> **Tracking/Cancellation Race Closure, Delivered-After-Cancel Exception Detection, and Reconciliation Mutex Separation**

---

## 1. Metadata

| Field | Value |
|---|---|
| Milestone | M7.3 — Carrier Lifecycle & Reconciliation |
| Sub-milestone | B.3.4 |
| Architecture Audit | COMPLETE |
| Business/Architecture Lock | LOCKED (`SCS-M7.3-B.3.4-BUSINESS-RULES-ARCHITECTURE-LOCK.md`, 573 lines) |
| Decision | GO |
| Authorized Migration | 0049 (existing — no new migration) |
| Date | 2026-10-02 |
| Implementation Status | **COMPLETE — awaiting Independent Runtime Verification** |

---

## 2. Lock Reference

All implementation decisions trace to the locked document:

- **`docs/production/SCS-M7.3-B.3.4-BUSINESS-RULES-ARCHITECTURE-LOCK.md`**

Key locked decisions implemented:

| Lock ID | Decision | Section |
|---|---|---|
| BD-3.4-01 | Separate `runningCreate` / `runningCancel` mutexes | §1, §6 |
| BD-3.4-02 | `FOR UPDATE SKIP LOCKED` unchanged | §6, §9 |
| BD-3.4-03 | DELIVERED_AFTER_CANCEL is operational visibility only | §2 |
| BD-3.4-04 | Detection before no-events short-circuit | §2 |
| BD-3.4-05 | CASE B statuses: UNKNOWN, RECONCILIATION_REQUIRED, FAILED | §2, §4 |
| BD-3.4-06 | No processCarrierDelivery on exception | §2 |
| BD-3.4-07 | No carrier_status_mapped advance on exception | §2 |
| BD-3.4-08 | No shipment.status / order status mutation on exception | §2 |
| BD-3.4-09 | PICKUP_CANCELLED branch removed (unreachable via Aramex) | §5 |
| BD-3.4-10 | Flags reset on success / empty / exception / early return | §1 |
| F-02 | Mutex split rationale (from audit finding) | §1 |
| C5 | SUCCEEDED / NOT_REQUIRED excluded from polling (pre-existing) | §2 CASE A |
| C6 | Delivered-after-cancel exception path | §2 CASE B |
| C7 | Reconciliation checks ONLY CANCELLED | §5 |

---

## 3. Files Changed

### Production code (3 files modified)

| File | Lines | Change |
|---|---|---|
| `apps/api/src/modules/shipping/carrier-reconciliation.service.ts` | 615 | Mutex split (`running` → `runningCreate` / `runningCancel`); PICKUP_CANCELLED removal |
| `apps/api/src/modules/shipping/carrier-tracking-poller.ts` | 480 | C6 detection (before no-events short-circuit); `handleDeliveredAfterCancel()` method; `isDeliveredAfterCancel()` type predicate; exported status constants |
| `apps/api/src/__tests__/unit/shipping/m73b333-indeterminate-reconciliation.spec.ts` | — | B333-U-11b expectation updated (PICKUP_CANCELLED → `cancel_deferred`) |

### New test files (2 files created)

| File | Lines | Tests |
|---|---|---|
| `apps/api/src/__tests__/unit/shipping/m73b34-race-closure.spec.ts` | 723 | 28 unit tests |
| `apps/api/src/__tests__/integration/m73b34-race-closure.postgres.spec.ts` | 744 | 13 PostgreSQL integration tests |

**Total diff:** +176 lines production, +1467 lines tests.

---

## 4. Reconciliation Mutex Implementation

### Before

```typescript
private running = false;

async reconcile() {
  if (this.running) return [];
  this.running = true;
  // ...
  finally { this.running = false; }
}

async reconcileCancel() {
  if (this.running) return [];   // ← blocked by create reconciliation
  this.running = true;
  // ...
  finally { this.running = false; }
}
```

### After

```typescript
private runningCreate = false;
private runningCancel = false;

async reconcile() {
  if (this.runningCreate) return [];
  this.runningCreate = true;
  // ...
  finally { this.runningCreate = false; }
}

async reconcileCancel() {
  if (this.runningCancel) return [];
  this.runningCancel = true;
  // ...
  finally { this.runningCancel = false; }
}
```

**Guarantees:**
- Create reconciliation does NOT block cancel reconciliation (BD-3.4-01)
- Cancel reconciliation does NOT block create reconciliation (BD-3.4-01)
- Each flag resets in `finally` — covers success, empty result, exception, and early return (BD-3.4-10)
- Cross-process safety unchanged: `FOR UPDATE SKIP LOCKED` claims remain identical
- No new database coordination mechanism introduced

---

## 5. Delivered-After-Cancel Implementation

### Detection Placement

The C6 guard is placed **immediately after** `provider.getTrackingInfo()` / `circuitBreaker.recordSuccess()` and **before** the `if (!trackingInfo || !trackingInfo.events.length) return;` short-circuit. This ensures a carrier response reporting DELIVERED status without a detailed event list cannot silently miss the anomaly (BD-3.4-04).

```typescript
const cancelStatus = (shipment.carrier_cancel_status ?? null) as string | null;
let deliveredAfterCancel = false;
if (trackingInfo?.status === 'DELIVERED' && isDeliveredAfterCancel(cancelStatus)) {
  deliveredAfterCancel = true;
  await this.handleDeliveredAfterCancel(shipment, providerKey, cancelStatus);
}
```

### CASE A (No Action)

`carrier_cancel_status` IN (`SUCCEEDED`, `NOT_REQUIRED`) — already excluded by the pre-existing C5 polling guard. These shipments are never claimed by the tracking poller.

### CASE B (Exception Path)

`carrier_cancel_status` IN (`UNKNOWN`, `RECONCILIATION_REQUIRED`, `FAILED`):

1. **Record a shipment event** with:
   - `externalEventId`: `dac-${shipmentId}` (deterministic — enables dedup)
   - `carrierEventCode`: `DELIVERED_AFTER_CANCEL`
   - `eventType`: `CARRIER_TRACKING`
   - `actorType`: `CARRIER`
   - `notes`: "Carrier reports DELIVERED after SCS cancellation"
   - `metadata`: `{ carrierStatus: 'DELIVERED', providerKey, source: 'tracking_poll', carrierCancelStatus, exception: 'DELIVERED_AFTER_CANCEL' }`

2. **Set** `recoveryStatus = 'DELIVERED_AFTER_CANCEL'` (with `IS DISTINCT FROM` guard)

3. **NOT called:** `ordersService.processCarrierDelivery()` (BD-3.4-06)
4. **NOT advanced:** `carrier_status_mapped` / `carrier_status_raw` (BD-3.4-07)
5. **NOT mutated:** `shipment.status` (BD-3.4-08)
6. **NOT mutated:** order status (BD-3.4-08)
7. **NOT performed:** inventory SALE (BD-3.4-08)
8. **Logged:** warning with full context

### Idempotency

- **Event dedup:** deterministic `dac-${shipmentId}` + existing `uq_shipment_events_external_id` partial UNIQUE index (migration 0046). PG 23505 caught and logged as debug.
- **Token dedup:** `IS DISTINCT FROM 'DELIVERED_AFTER_CANCEL'` — repeat polls affect zero rows; an operator-cleared token can be re-raised.

### Normal Tracking Preserved

When `carrier_cancel_status` IS NULL / `PENDING` / `IN_PROGRESS`, the `deliveredAfterCancel` flag remains `false` and the existing tracking advance path runs unchanged — including `processCarrierDelivery()` invocation and inventory settlement.

---

## 6. PICKUP_CANCELLED Cleanup

### Before

```typescript
if (status === 'CANCELLED' || status === 'PICKUP_CANCELLED') {
  await this.resolveCancelSucceeded(shipment);
}
```

### After

```typescript
// M7.3-B.3.4 (BD-3.4-09 / C7): PICKUP_CANCELLED removed.
// Aramex mapper has no PICKUP_CANCELLED equivalent (SH012 → CANCELLED is the
// only cancellation code). That condition was unreachable via the tracking path.
// NOT replaced with an invented carrier code — per the Aramex evidence rule.
if (status === 'CANCELLED') {
  await this.resolveCancelSucceeded(shipment);
}
```

**Rationale:** The Aramex status mapper produces only `CANCELLED` (from SH012). `PICKUP_CANCELLED` was never produced, making the condition dead code. Per the locked decision BD-3.4-09/C7, it is removed. No new carrier code is invented.

**Test impact:** B333-U-11b (a B.3.3.3-closed test) was updated to expect `cancel_deferred` instead of `cancel_succeeded` for a synthetic `PICKUP_CANCELLED` input — a required consequence of the locked removal.

---

## 7. Database / Schema Confirmation

### Pre-existing schema elements verified

| Element | Migration | Status |
|---|---|---|
| `shipment_events` table | 0040 | EXISTS — `event_type VARCHAR(24)`, `actor_type VARCHAR(16)`, `metadata JSONB`, `sequence SERIAL` |
| `external_event_id` column | 0043 | EXISTS — `VARCHAR(200)` |
| `carrier_event_code` column | 0043 | EXISTS — `VARCHAR(40)` |
| `uq_shipment_events_external_id` partial UNIQUE index | 0046 | EXISTS — `WHERE external_event_id IS NOT NULL` |
| `recovery_status` column | 0040 | EXISTS — `VARCHAR(24)` |
| `DELIVERED_AFTER_CANCEL` token | 0049 | EXISTS — 22 chars, fits `VARCHAR(24)` |

**No new migration required. No migration 0050 created.**

### Audit correction (F-08)

The architecture audit noted the `uq_shipment_events_external_id` index "existence unverified." Verification confirms it **does** exist (migration 0046). This correction is documented here.

---

## 8. Concurrency Design

### Process-local mutex

| Mutex | Scope | Prevents |
|---|---|---|
| `runningCreate` | `reconcile()` cycle | Overlapping create cycles on same instance |
| `runningCancel` | `reconcileCancel()` cycle | Overlapping cancel cycles on same instance |

Cross-instance safety: unchanged `FOR UPDATE SKIP LOCKED` claims in both create and cancel reconciliation SQL.

### Tracking poller claim

Unchanged: `UPDATE shipments SET last_carrier_sync_at = NOW() WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`.

### Idempotency layers

1. **Event row:** deterministic `dac-${shipmentId}` + UNIQUE index → PG 23505 caught
2. **Recovery token:** `IS DISTINCT FROM` value guard → zero-row no-op on repeat
3. **Tracking events:** existing fingerprint dedup unchanged

---

## 9. Security Review

| Concern | Status |
|---|---|
| Tenant isolation | Unchanged — all queries scoped by shipment ownership |
| Provider tenant scoping | Unchanged — provider registry lookup unchanged |
| Admin RBAC | Unchanged — no new endpoints or permissions |
| Safe error handling | PG 23505 caught specifically; all other errors propagate |
| Credential protection | No credential access changes |
| Shipment IDOR | Unchanged — poller claims via `FOR UPDATE SKIP LOCKED` |
| New unauthenticated endpoints | None |
| New permissions | None |

---

## 10. Test Coverage

### Unit Tests — 28 tests (required: 8+)

| ID | Test | Requirement |
|---|---|---|
| B34-U-01 | create reconciliation does not block cancel reconciliation | §1, §9 |
| B34-U-02 | cancel reconciliation does not block create reconciliation | §1, §9 |
| B34-U-03 | DELIVERED on cancelled shipment (UNKNOWN) creates exception | §2 |
| B34-U-03b | DELIVERED on cancelled shipment (RECONCILIATION_REQUIRED) | §2 |
| B34-U-03c | DELIVERED on cancelled shipment (FAILED) | §2 |
| B34-U-04 | DELIVERED sets DELIVERED_AFTER_CANCEL recovery status | §2 |
| B34-U-05 | processCarrierDelivery is NOT called | §2 |
| B34-U-05b | Detection works even with empty events list | §2, BD-3.4-04 |
| B34-U-06 | DELIVERED on non-cancelled shipment follows normal flow | §3 |
| B34-U-06b | Normal DELIVERED with NULL cancel status | §3 |
| B34-U-06c | Normal DELIVERED with PENDING cancel status | §3 |
| B34-U-07 | PICKUP_CANCELLED condition removed (deferred, not SUCCEEDED) | §5 |
| B34-U-08 | timeout → UNKNOWN regression | §6, §14 |
| B34-U-09 | C5 guard: SUCCEEDED excluded from polling | §2 CASE A |
| B34-U-09b | C5 guard: NOT_REQUIRED excluded | §2 CASE A |
| B34-U-09c | C5 guard: FAILED is included (CASE B) | §2 CASE B |
| B34-U-10 | carrier_cancel_status not mutated by exception | §7 |
| B34-U-11 | isDeliveredAfterCancel status-set correctness | §2 |
| B34-U-12 | C5 guard still excludes SUCCEEDED / NOT_REQUIRED | §2 CASE A |
| B34-U-13 | Idempotency: deterministic event id, repeated polls | §10 |
| B34-U-13b | Idempotency: duplicate event dedup via PG 23505 | §10 |
| B34-U-13c | Idempotency: recovery token IS DISTINCT FROM guard | §10 |
| B34-U-14 | Recovery-token write is value-guarded (IS DISTINCT FROM) | §10 |
| B34-U-15 | DELIVERED_AFTER_CANCEL token fits VARCHAR(24) | §8 |
| B34-U-16 | Normal tracking: carrier_status_mapped advances | §3 |
| B34-U-17 | Normal tracking: processCarrierDelivery invoked | §3 |

### PostgreSQL Integration Tests — 13 tests (required: 3+)

| ID | Test | Requirement |
|---|---|---|
| B34-PG-01 | Exception event is persisted in shipment_events | §12 |
| B34-PG-02 | carrier_status_mapped does NOT advance on delivered-after-cancel | §2, §7 |
| B34-PG-03 | Order remains CANCELLED, no inventory SALE, bridge not called | §2, §7 |
| B34-PG-04 | All three CASE B statuses detected in real SQL | §2 |
| B34-PG-05 | Repeated DELIVERED → one exception row (UNIQUE dedup) | §10 |
| B34-PG-06 | carrier_cancel_status not mutated by exception recording | §7 |
| B34-PG-07 | Concurrent pollers — single claim, single exception row | §9 |
| B34-PG-08 | Cancellation vs tracking race — invariants hold | §9 |
| B34-PG-09 | Reconciliation vs tracking race — audit survives | §9 |
| B34-PG-10 | Create reconciliation running does NOT block cancel reconciliation | §1, §9 |
| B34-PG-11 | Cancel reconciliation running does NOT block create reconciliation | §1, §9 |
| B34-PG-12 | C5 guard: SUCCEEDED / NOT_REQUIRED never polled (CASE A) | §2 CASE A |
| B34-PG-13 | Normal non-cancelled DELIVERED advances + invokes bridge | §3 |

---

## 11. Test Results

### B.3.4 Unit Tests

```
✓ m73b34-race-closure.spec.ts (28 tests) 66ms
  Test Files  1 passed (1)
  Tests       28 passed (28)
```

### B.3.4 PostgreSQL Tests

```
✓ m73b34-race-closure.postgres.spec.ts (13 tests) 14115ms
  Test Files  1 passed (1)
  Tests       13 passed (13)
```

### B.3.3.3 Regression (unit)

```
✓ m73b333-indeterminate-reconciliation.spec.ts (24 tests)
  Test Files  1 passed (1)
  Tests       24 passed (24)
```

### B.3.3.3 Regression (PostgreSQL)

```
✓ m73b333-indeterminate-reconciliation.postgres.spec.ts (12 tests) 9376ms
  Test Files  1 passed (1)
  Tests       12 passed (12)
```

### B.3.2.1 Regression (PostgreSQL — §14)

```
✓ m73b3321-retry-state-foundation.postgres.spec.ts (11 tests) 6673ms
  Test Files  1 passed (1)
  Tests       11 passed (11)
```

B3321-PG-11 confirms: timeout → UNKNOWN (not FAILED), `carrier_cancel_retries = 0`, `carrier_cancel_error_class = timeout`. Assertions intact and passing.

---

## 12. Full Regression

### Shipping + Orders Unit Tests

```
Test Files  30 passed (30)
Tests       730 passed (730)
Duration    14.52s
```

### Full Non-PG Unit Regression

```
Test Files  72 passed | 1 failed (73)
Tests       1267 passed | 1 failed (1268)
Duration    40.71s
```

**Single failure:** `webhook-rate-limiting.spec.ts > CarrierWebhookController imports ThrottlerGuard` — timeout in parallel batch. **Passes in isolation** (18/18, 3.23s). Pre-existing parallel-load flakiness unrelated to B.3.4 changes. The test imports `@nestjs/throttling` which has module-initialization timing sensitivity under concurrent vitest worker loads.

---

## 13. TypeScript Result

```
npx tsc --noEmit
Found 0 issues.
```

---

## 14. Build Result

```
npx nest build
TSC  Found 0 issues.
SWC  Successfully compiled: 271 files with swc (54.61ms)
```

---

## 15. Scope Integrity

### What was implemented (all within locked scope)

1. **Separate reconciliation mutex** — `running` → `runningCreate` / `runningCancel`
2. **Delivered-after-cancel exception detection** — C6 guard before no-events short-circuit
3. **PICKUP_CANCELLED cleanup** — unreachable branch removed
4. **Associated tests** — 28 unit + 13 PostgreSQL

### What was NOT implemented (correctly excluded)

- No migration 0050
- No new provider methods
- No Aramex endpoint changes
- No order FSM changes
- No inventory settlement changes
- No cancellation semantics changes
- No refunds / returns / disputes
- No cancellation webhook processing
- No automatic UNKNOWN → PENDING
- No automatic re-cancel
- No Aramex PICKUP_CANCELLED carrier code invention
- No AramexProvider modifications for getPickupStatus / active-state detection

### Test file outside locked scope (minimal, justified)

`m73b333-indeterminate-reconciliation.spec.ts` — B333-U-11b expectation updated from `cancel_succeeded` to `cancel_deferred`. This is a **required consequence** of the locked PICKUP_CANCELLED removal (BD-3.4-09/C7): the test asserted behavior that is no longer reachable in production.

---

## 16. Known Limitations

### F-34-01: Recovery token preemption

The poller's unconditional `recoveryStatus` write (`DELIVERED_AFTER_CANCEL`) can be preempted bidirectionally by cancel reconciliation:
- Cancel reconciliation may set `RECONCILING` / `DEFERRED` / `SUCCEEDED` + null recovery
- The poller may overwrite these with `DELIVERED_AFTER_CANCEL`

**Impact:** The `recoveryStatus` token may be transient. However, the exception **event row** in `shipment_events` is permanent audit evidence — the anomaly is always visible regardless of token state.

**Decision:** Document, do not fix. Fixing would require cross-path coordination beyond locked scope.

### Pre-existing: camelCase / snake_case mismatch in poller

`pollShipment` and `reconcileShipment` read `shipment.shippingProviderKey`, `shipment.carrierTrackingId`, `shipment.carrierStatusMapped` (camelCase), but the claim SQL returns raw snake_case rows. This causes silent fallback to `'aramex'` provider key.

**Decision:** Document, do not fix. Out of locked scope.

### Pre-existing: webhook-rate-limiting flakiness

`webhook-rate-limiting.spec.ts` times out under parallel vitest worker loads but passes in isolation. Pre-existing, unrelated to B.3.4.

---

## 17. Deferred Work

The following items are explicitly deferred to future milestones:

1. **F-34-01 resolution** — cross-path recovery token coordination (poller vs cancel reconciliation)
2. **Poller camelCase/snake_case alignment** — ensure claim SQL returns camelCase or poller reads snake_case consistently
3. **Aramex cancellation code verification** — if actual Aramex PICKUP_CANCELLED-equivalent codes are discovered, the conservative branch can be re-evaluated with verified evidence
4. **B.3.3.4** — full tracking/cancel interaction redesign (referenced in B.3.3.3 lock)
5. **Admin recovery UX for DELIVERED_AFTER_CANCEL** — the token surfaces in the recovery queue, but admin workflow for resolving the exception is not yet defined

---

## 18. Final Implementation Verdict

### PASS — Implementation Complete

All locked B.3.4 requirements have been implemented and verified:

| Requirement | Status |
|---|---|
| Separate reconciliation mutex | ✅ Implemented + tested |
| Delivered-after-cancel detection (C6) | ✅ Implemented + tested |
| Normal tracking unchanged | ✅ Verified |
| UNKNOWN / RECONCILIATION_REQUIRED polling | ✅ Unchanged |
| PICKUP_CANCELLED cleanup | ✅ Implemented + tested |
| Cancellation safety preserved | ✅ Regression passing |
| Order/inventory invariants preserved | ✅ PG tests confirm |
| No new migration | ✅ Confirmed |
| Concurrency protections | ✅ Unchanged + tested |
| Idempotency | ✅ Two-layer dedup |
| Security | ✅ Unchanged |
| Unit tests (8+ required) | ✅ 28 tests |
| PostgreSQL tests (3+ required) | ✅ 13 tests |
| Full regression | ✅ 1267/1268 (1 pre-existing flake) |
| TypeScript | ✅ 0 issues |
| Nest build | ✅ 0 issues, 271 files |
| B3321-PG-11 (§14) | ✅ timeout → UNKNOWN, committed |
| Aramex unchanged | ✅ Confirmed |
| Scope integrity | ✅ No speculative expansion |

### Milestone Status

This report **does not claim release closure.**

The milestone path remains:

```
Implementation ✅ (this report)
    → Independent Runtime Verification (pending)
    → Release Closure (pending)
```
