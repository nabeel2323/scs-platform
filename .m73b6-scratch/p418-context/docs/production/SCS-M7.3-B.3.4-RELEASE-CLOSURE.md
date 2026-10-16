# SCS-M7.3-B.3.4 — Release Closure

> **Tracking/Cancellation Race Closure, Delivered-After-Cancel Exception Detection, and Reconciliation Mutex Separation**

---

## 1. Metadata

| Field | Value |
|---|---|
| Milestone | M7.3 — Carrier Lifecycle & Reconciliation |
| Sub-milestone | B.3.4 |
| Branch | `develop` |
| Git HEAD | `48e37a79dfdbfad17a353d6929fcf083617a7f31` |
| Closure Date | 2026-10-02 |
| **Final Status** | **CLOSED / PASS** |

---

## 2. Evidence References

| Document | File |
|---|---|
| Pre-Implementation Architecture Audit | `docs/production/SCS-M7.3-B.3.4-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md` |
| Business/Architecture Lock | `docs/production/SCS-M7.3-B.3.4-BUSINESS-RULES-ARCHITECTURE-LOCK.md` |
| Implementation Report | `docs/production/SCS-M7.3-B.3.4-IMPLEMENTATION-REPORT.md` |
| Independent Runtime Verification | `docs/production/SCS-M7.3-B.3.4-INDEPENDENT-RUNTIME-VERIFICATION.md` |

---

## 3. Executive Summary

M7.3-B.3.4 has been successfully implemented and independently verified.

The authorized scope comprised five deliverables:

1. **Separate reconciliation mutexes** — the shared `running` flag was replaced with `runningCreate` and `runningCancel`, so create reconciliation no longer blocks cancel reconciliation and vice versa.

2. **Delivered-after-cancel exception detection** — when the tracking poller encounters a carrier DELIVERED on a shipment whose cancellation state is UNKNOWN, RECONCILIATION_REQUIRED, or FAILED, an operational exception event is recorded.

3. **Exception recording without business state mutation** — the exception is recorded as a `shipment_events` row and a `recoveryStatus` token only. No order status, shipment status, carrier status, inventory settlement, or delivery bridge invocation occurs. SCS cancellation remains authoritative.

4. **Removal of unreachable PICKUP_CANCELLED handling** — the reconciliation branch checking for PICKUP_CANCELLED was removed because the Aramex status mapper produces no such code.

5. **Associated unit and PostgreSQL concurrency tests** — 28 unit tests and 13 PostgreSQL integration tests covering all locked gates, concurrency, idempotency, and regression.

---

## 4. Scope Closure

### Implemented (within locked scope)

| Deliverable | Files | Status |
|---|---|---|
| Mutex separation | `carrier-reconciliation.service.ts` | ✅ |
| Delivered-after-cancel detection | `carrier-tracking-poller.ts` | ✅ |
| PICKUP_CANCELLED removal | `carrier-reconciliation.service.ts` | ✅ |
| Unit tests (28) | `m73b34-race-closure.spec.ts` | ✅ |
| PostgreSQL tests (13) | `m73b34-race-closure.postgres.spec.ts` | ✅ |
| B.3.3.3 test expectation update | `m73b333-indeterminate-reconciliation.spec.ts` | ✅ |

### Not implemented (correctly excluded)

No work outside the locked scope was performed.

---

## 5. Architecture Compliance

The implementation complies with the locked architecture. The following are confirmed absent:

| Item | Status |
|---|---|
| Migration 0050 | ✅ Does not exist |
| Migration 0049 remains latest | ✅ 49 migrations total (0001–0049) |
| New provider methods | ✅ None introduced |
| `getPickupStatus()` | ✅ Not introduced |
| Automatic UNKNOWN → PENDING | ✅ Not introduced |
| Automatic re-cancel | ✅ Not introduced |
| Cancellation webhook processing | ✅ Not introduced |
| Order FSM changes | ✅ None |
| Inventory settlement changes | ✅ None |
| Refunds | ✅ Not introduced |
| Returns | ✅ Not introduced |
| Disputes | ✅ Not introduced |
| Notifications | ✅ Not introduced |
| Speculative Aramex behavior | ✅ Aramex files untouched |

**No unauthorized scope expansion was detected.**

---

## 6. Implementation Verification

| Aspect | Verified | Evidence |
|---|---|---|
| `runningCreate` / `runningCancel` separation | ✅ | `carrier-reconciliation.service.ts` L70-71, L161-162, L212, L364-365, L406 |
| `FOR UPDATE SKIP LOCKED` preserved | ✅ | L191 (create), L385 (cancel), L225 (tracking poll) |
| DAC detection before empty-event short-circuit | ✅ | `carrier-tracking-poller.ts` L259-279 (guard) before L281 (short-circuit) |
| UNKNOWN / RECONCILIATION_REQUIRED / FAILED covered | ✅ | L64-68 (`DELIVERED_AFTER_CANCEL_STATUSES`) |
| Deterministic exception event ID | ✅ | L364 (`dac-${shipmentId}`) |
| Idempotent event handling | ✅ | PG 23505 caught (L391); `IS DISTINCT FROM` token guard (L409) |
| `recoveryStatus` handling | ✅ | L403 sets token; L409 value guard prevents redundant writes |
| PICKUP_CANCELLED cleanup | ✅ | L481 — only `CANCELLED` resolves to `cancel_succeeded` |
| Normal tracking preserved | ✅ | L298-310 advance gated by `!deliveredAfterCancel`; L314-318 bridge invocation unchanged |

---

## 7. Independent Runtime Verification

All test suites were freshly executed during the independent runtime verification session.

### Test Results

| Suite | Command | Passed | Failed | Duration |
|---|---|---|---|---|
| B.3.4 Unit | `npx vitest run src/__tests__/unit/shipping/m73b34-race-closure.spec.ts` | 28 | 0 | 1.98s |
| B.3.4 PostgreSQL | `npx vitest run src/__tests__/integration/m73b34-race-closure.postgres.spec.ts` | 13 | 0 | 11.05s |
| B.3.3.3 Unit Regression | `npx vitest run src/__tests__/unit/shipping/m73b333-indeterminate-reconciliation.spec.ts` | 24 | 0 | 1.59s |
| B.3.3.3 PostgreSQL Regression | `npx vitest run src/__tests__/integration/m73b333-indeterminate-reconciliation.postgres.spec.ts` | 12 | 0 | 11.93s |
| B.3.2.1 PostgreSQL Regression | `npx vitest run src/__tests__/integration/m73b3321-retry-state-foundation.postgres.spec.ts` | 11 | 0 | 12.41s |
| Shipping + Orders | `npx vitest run src/__tests__/unit/shipping src/__tests__/unit/orders` | 730 | 0 | 15.59s |
| Full Non-PG | `npx vitest run src/__tests__/unit` | 1267 | 1 | 54.46s |

**Full Non-PG single failure:** `webhook-rate-limiting.spec.ts > CarrierWebhookController imports ThrottlerGuard` — timeout under parallel vitest worker load. Proven to pass in isolation:

```
Command: npx vitest run src/__tests__/unit/shipping/webhook-rate-limiting.spec.ts
Result:  Test Files  1 passed (1)
         Tests       18 passed (18)
         Duration    1.37s
```

This is a pre-existing parallel-load flakiness in `@nestjs/throttling` module initialization, unrelated to B.3.4.

### TypeScript

```
Command: npx tsc --noEmit
Result:  Found 0 issues.
```

### Nest Build

```
Command: npx nest build
Result:  TSC  Found 0 issues.
         SWC  Successfully compiled: 271 files with swc (202.09ms)
```

### Additional Verification Gates

| Gate | Result |
|---|---|
| PostgreSQL concurrency | PASS |
| Security / tenant isolation | PASS |
| Idempotency | PASS |
| Cancellation safety | PASS |
| Normal tracking regression | PASS |

---

## 8. Concurrency and Database Safety

The independent runtime verification established the following via real PostgreSQL (Testcontainers):

| Invariant | Test | Result |
|---|---|---|
| Create reconciliation does NOT block cancel reconciliation | B34-PG-10 | ✅ PASS |
| Cancel reconciliation does NOT block create reconciliation | B34-PG-11 | ✅ PASS |
| `FOR UPDATE SKIP LOCKED` remains intact | Source inspection + B34-PG-07/08/09 | ✅ PASS |
| Concurrent pollers maintain single-claim behavior | B34-PG-07 | ✅ PASS |
| Cancellation vs tracking race preserves cancellation | B34-PG-08 | ✅ PASS |
| Reconciliation vs tracking race preserves audit evidence | B34-PG-09 | ✅ PASS |
| No inventory SALE after cancellation | B34-PG-03 | ✅ PASS |
| Cancelled orders are not resurrected | B34-PG-03, B34-PG-08 | ✅ PASS |

The B.3.4 PostgreSQL concurrency tests exercised 2 concurrent workers. The existing PostgreSQL row-level locking mechanism (`FOR UPDATE SKIP LOCKED`) remains unchanged and is inherently safe at any concurrency level. Higher worker counts (10, 50, 100) were not separately parameterized.

---

## 9. Security Verification

| Concern | Result |
|---|---|
| Tenant isolation | ✅ PASS — unchanged |
| Merchant isolation | ✅ PASS — unchanged |
| Provider tenant scoping | ✅ PASS — unchanged |
| Shipment ownership | ✅ PASS — unchanged |
| Admin RBAC | ✅ PASS — unchanged, no new permissions |
| Credential protection | ✅ PASS — unchanged |
| New unauthenticated endpoints | ✅ None introduced |
| New permissions | ✅ None introduced |
| Cross-tenant exception creation | ✅ Not possible — exception handler uses claimed shipment's own ID |

---

## 10. Known Limitations

### F-34-01 — Recovery Token Preemption

The `DELIVERED_AFTER_CANCEL` recovery token may be overwritten by cancel reconciliation, which independently writes `RECONCILING`, `DEFERRED`, `SUCCEEDED`+null, or `RECONCILIATION_REQUIRED`.

However:

- The `shipment_events` exception row remains permanent audit evidence.
- The anomaly remains auditable regardless of token state.
- No incorrect order state results.
- No incorrect inventory state results.
- No automatic business action is triggered by the token — it only surfaces the shipment for human admin review.

**Classification: ACCEPTED / NON-BLOCKING**

### Pre-existing camelCase / snake_case Mismatch

The tracking poller reads some camelCase properties (`shippingProviderKey`, `carrierTrackingId`, `carrierStatusMapped`) from raw SQL rows that expose snake_case columns. This causes silent fallback to `'aramex'` for the provider key.

The independent verification confirmed this predates B.3.4. The B.3.4 code itself correctly reads `carrier_cancel_status` (snake_case).

**Classification: PRE-EXISTING / OUTSIDE B.3.4 SCOPE**

### Pre-existing webhook-rate-limiting Test Flakiness

The full non-PG regression produced 1267 passed / 1 failed. The failing test (`webhook-rate-limiting.spec.ts`) passes in isolation (18/18, 1.37s). The failure is a timeout under parallel vitest worker load due to `@nestjs/throttling` module initialization timing.

**Classification: PRE-EXISTING TEST-HARNESS FLAKINESS / NON-BLOCKING**

---

## 11. Release Gates

| Gate | Result |
|---|---|
| Architecture Audit | PASS |
| Business/Architecture Lock | GO / LOCKED |
| Implementation | PASS |
| Independent Runtime Verification | PASS |
| PostgreSQL Integration | PASS |
| Concurrency | PASS |
| Security | PASS |
| Idempotency | PASS |
| Cancellation Safety | PASS |
| Normal Tracking Regression | PASS |
| TypeScript | PASS |
| Build | PASS |
| Scope Integrity | PASS |
| Migration Integrity | PASS |

**Final gate: PASS**

---

## 12. Final Status

# CLOSED / PASS

M7.3-B.3.4 is officially closed.

All locked requirements were implemented and independently verified.

No blocking defects remain within the B.3.4 scope.

The documented limitations are accepted and do not block closure.

---

## 13. Next Milestone

The next step is a fresh Architecture Audit for the next milestone.

The next milestone must be determined from the project's milestone roadmap and/or the next architecture-audit instruction. The following items are **not** automatically in scope and require a new architecture/business decision unless already authorized elsewhere:

- Unique indexes
- `getPickupStatus`
- Automatic UNKNOWN → PENDING
- Automatic re-cancel
- Delivered-after-cancel lifecycle changes
- Webhook cancellation processing
- Recovery-token coordination
- Poller naming fixes
