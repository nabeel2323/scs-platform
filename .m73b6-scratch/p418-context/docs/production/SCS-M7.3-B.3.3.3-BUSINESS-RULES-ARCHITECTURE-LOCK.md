# SCS-M7.3-B.3.3.3 — BUSINESS RULES & ARCHITECTURE LOCK

**Indeterminate Outcome Reconciliation**

| Field | Value |
|---|---|
| Milestone | M7.3-B.3.3.3 |
| Task type | Business rules & architecture decision lock — READ-ONLY |
| Status | **LOCKED** |
| Decision | **GO** |
| Date | 2026-10-01 |
| Branch | develop |
| HEAD | ac000d0 |
| Audit | SCS-M7.3-B.3.3.3-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md (GO WITH CONDITIONS) |
| Parent Lock | SCS-M7.3-B.3-BUSINESS-RULES-ARCHITECTURE-LOCK.md (LOCKED) |
| Predecessors | B.3.3.1 CLOSED/PASS, B.3.3.2 CLOSED/PASS, B.3.3.2.1 CLOSED/PASS, B.3.3.2.2 CLOSED/PASS |
| Migration | 0049 (existing — no new migration) |

> This document is a decision-lock artifact. No production code, schema, migration, provider, worker, reconciliation, tracking, test, CI, or API was modified. It converts the B.3.3.3 architecture audit into a binding implementation contract.

---

## 1. Objective

Lock the behavior for handling carrier cancellation outcomes that are **indeterminate** because the transport operation may have reached the carrier but SCS did not receive a definitive response.

The critical distinction locked by this document:

```
RETRYABLE:
  The carrier definitively responded with a retryable HTTP result (429, 5xx).
  The request was received and rejected by the carrier.
  A blind retry is safe because the carrier has not processed the cancellation.

INDETERMINATE:
  The carrier outcome cannot be known because transport failed after the
  request may have reached the carrier (timeout, ECONNRESET, ECONNABORTED,
  socket hang up, aborted).
  A blind retry is UNSAFE — the carrier may have already processed the
  cancellation.
```

These categories are **never blurred**. An indeterminate failure is not a retryable failure. A retryable failure is not indeterminate.

---

## 2. Definitions

| Term | Definition |
|---|---|
| **Indeterminate transport failure** | An error where the HTTP request may or may not have reached the carrier and the response was not received by SCS. Detected by `isTimeoutError()` matching: `timeout`, `etimedout`, `econnreset`, `econnaborted`, `socket hang up`, `aborted`. |
| **UNKNOWN** | A `carrier_cancel_status` value indicating that the carrier cancellation outcome cannot be determined. Set by the worker immediately upon indeterminate transport failure. |
| **RECONCILIATION_REQUIRED** | A `carrier_cancel_status` value indicating that automated reconciliation could not establish a definitive carrier state. Set by reconciliation after budget exhaustion or persistent ambiguity. Persistent, admin-visible. |
| **Reconciliation** | A process that queries the carrier (via existing `getTrackingInfo()` or controlled `cancelPickup()` interpretation) to determine the actual cancellation state after UNKNOWN. |
| **Definitive evidence** | A carrier response that unambiguously establishes the pickup state. For Aramex: `HasErrors=false` on CancelPickup = definitively cancelled. An ambiguous error message or code that cannot be reliably interpreted is NOT definitive evidence. |
| **Reconciliation budget** | The maximum number of reconciliation attempts before escalation to admin. Distinct from carrier HTTP outbox retry attempts. |
| **Safe retry** | A cancellation retry that is executed only after reconciliation has established that the pickup remains active at the carrier and the previous cancellation was not applied. |

---

## 3. Locked Business Decisions

### BD-01 — UNKNOWN Duration Bound → **LOCKED**

```
Maximum unresolved duration: 24 hours.
Clock starts: carrier_cancel_attempted_at (the timestamp of the indeterminate attempt).
When reached: carrier_cancel_status → RECONCILIATION_REQUIRED,
              recoveryStatus → CANCEL_RECONCILE,
              nextReconciliationAt → null (stop automated polling).
```

**CONFIRMED IN CODE:** The `carrier_cancel_attempted_at` column (migration 0049, shipment.schema.ts:82) already records the timestamp of the last cancel attempt. The `next_reconciliation_at` column (migration 0049) already supports scheduling. The 24-hour bound is enforced by the reconciliation claim query comparing `carrier_cancel_attempted_at` against `NOW() - 24h`.

### BD-02 — Reconciliation Frequency → **LOCKED**

```
Default interval: 10 minutes.
Configurable: YES, via environment variable CARRIER_CANCEL_RECONCILIATION_INTERVAL_MS.
Default value: 600000 (10 * 60 * 1000).
```

**CONFIRMED IN CODE:** The existing `next_reconciliation_at` column and the reconciliation service's claim query (`carrier-reconciliation.service.ts:124-137`) already implement time-based scheduling. The cancel reconciliation claim uses the same mechanism: claim rows where `next_reconciliation_at IS NULL OR next_reconciliation_at <= NOW()`.

### BD-03 — Maximum Reconciliation Attempts → **LOCKED**

```
Maximum reconciliation attempts: 8.
This is the RECONCILIATION BUDGET, distinct from carrier HTTP outbox retry attempts.
Counted by: a dedicated reconciliation attempt counter.
```

**Implementation note:** The existing `carrier_cancel_retries` column tracks outbox retry attempts (the HTTP retry budget). Reconciliation attempts are a separate counter. The audit (§18) identified that a new column `carrier_cancel_reconciliation_attempts` may be needed if the implementation cannot reuse an existing field. If implementation discovers that `carrier_cancel_retries` can serve dual purpose (with clear semantic separation in code), no new column is needed. If a new column IS genuinely required, implementation must STOP and report it rather than silently creating migration 0050.

### BD-04 — Does Unresolved Cancellation Block Shipment Progression? → **LOCKED: NO**

```
An unresolved cancellation (UNKNOWN or RECONCILIATION_REQUIRED) does NOT block
any SCS operation.
```

The order is already `CANCELLED` (terminal). The shipment is already `CANCELLED`. The reconciliation is a side-channel that determines the carrier-side state. It does not resurrect, advance, or modify any SCS order or shipment state.

**CONFIRMED IN CODE:** `OrdersService.processCarrierDelivery()` (orders.service.ts) checks `TRANSITIONS[order.status]` — for `CANCELLED`, `TRANSITIONS['CANCELLED'] = []`, so no carrier event can change the order state. The shipment `status = 'CANCELLED'` is set by `cancelOrder()` in the same transaction and is not affected by the carrier cancellation outcome.

**Invariant preserved:** SCS CANCELLED is authoritative.

### BD-05 — Admin Intervention Threshold → **LOCKED**

```
Escalation trigger: WHICHEVER COMES FIRST of:
  - Time threshold: 24 hours unresolved (BD-01)
  - Attempt threshold: 8 reconciliation attempts exhausted (BD-03)

On escalation:
  carrier_cancel_status = RECONCILIATION_REQUIRED
  recoveryStatus = CANCEL_RECONCILE
  nextReconciliationAt = null (stop automated polling)
```

The shipment becomes visible in the admin recovery queue (`GET /v1/carrier/recovery/queue`) and can be manually resolved via `POST /v1/carrier/shipments/:id/recover`.

### BD-06 — Carrier Confirms Pickup Cancelled → **LOCKED**

```
Carrier evidence that DEFINITIVELY proves pickup cancellation:
  → carrier_cancel_status = SUCCEEDED
  → recoveryStatus cleared (null)
  → nextReconciliationAt cleared (null)
```

**Definition of DEFINITIVE evidence for Aramex:**

| Aramex Response | Definitive? | Action |
|---|---|---|
| `CancelPickup` → `HasErrors: false` | **YES** | → SUCCEEDED |
| Tracking shows explicit cancellation status code that is unambiguously "pickup cancelled" | **YES** (if the status code is verified) | → SUCCEEDED |
| `CancelPickup` → `HasErrors: true` with a message/code that unambiguously means "already cancelled" | **REQUIRES PROVIDER VERIFICATION** — cannot be locked as definitive until the exact Aramex response code is verified against a live API | → RECONCILIATION_REQUIRED (safe default) |

**CRITICAL SAFETY RULE:**

```
An ambiguous Aramex response (unknown error code, generic "not found",
"invalid GUID", or any message that cannot be reliably distinguished from
a new failure) MUST NOT be treated as successful cancellation.

Ambiguous → RECONCILIATION_REQUIRED, never SUCCEEDED.
```

This is the Aramex Safety Boundary (see §14).

### BD-07 — Carrier Confirms Pickup Still Active → **LOCKED**

```
If reconciliation definitively establishes that the pickup remains active
at the carrier (the previous cancellation was NOT processed):

  → The system may attempt to re-cancel the pickup.
  → This is a RECONCILIATION-DRIVEN retry, not a blind outbox retry.
```

**Retry mechanism after reconciliation confirms active:**

```
Option locked: RECONCILIATION-DRIVEN RETRY via PENDING transition.

reconciliation confirms active
  → carrier_cancel_status = PENDING
  → recoveryStatus = null (clear reconciliation claim)
  → nextReconciliationAt = null
  → outbox event re-published: shipping.carrier.cancel
     (same idempotency key: carrier-cancel:<shipmentId>)
  → worker re-claims and re-executes cancelPickup()
```

**Guard:** This transition is permitted ONLY when reconciliation produces **definitive** evidence that the pickup remains active. If the reconciliation response is ambiguous, the state remains `RECONCILIATION_REQUIRED` (admin intervention).

**This is NOT a direct PENDING/outbox retry** — it is a reconciliation action that deterministically concludes retry is safe. The distinction matters because:
- Direct retry after UNKNOWN is forbidden (the carrier may have processed it).
- Retry after reconciliation confirms active is permitted (reconciliation proved the carrier did NOT process it).

### BD-08 — Carrier Response Remains Unknown During Reconciliation → **LOCKED**

```
Unknown/ambiguous reconciliation result:
  → carrier_cancel_status remains UNKNOWN (or transitions to RECONCILIATION_REQUIRED)
  → recoveryStatus = CANCEL_RECONCILE (if transitioning to RECONCILIATION_REQUIRED)
  → nextReconciliationAt = NOW() + interval (if within budget)
  → Do NOT auto-mark FAILED when the carrier state remains uncertain.
```

If the reconciliation attempt itself encounters an indeterminate error (timeout, connection reset during reconciliation carrier query), the attempt counts against the reconciliation budget (BD-03) but the state does not change to FAILED. The next reconciliation cycle retries if budget remains.

### BD-09 — Can UNKNOWN Transition Back to Cancellation Retry? → **LOCKED**

```
YES, but ONLY when reconciliation establishes that retry is safe.

Safe conditions:
  - Carrier definitively says pickup remains active
  - Carrier definitively says cancellation was not applied

Unsafe conditions (never blindly retry):
  - Reconciliation timed out
  - Reconciliation returned ambiguous response
  - Reconciliation budget exhausted solely due to time
```

**Transition path:**

```
UNKNOWN → (reconciliation confirms active) → PENDING → outbox retry
```

This transition is executed by the reconciliation service, not the worker. The worker never transitions UNKNOWN → PENDING on its own.

### BD-10 — May Reconciliation Invoke CancelPickup? → **LOCKED**

```
YES, but only when reconciliation has established that the pickup remains
active and therefore the previous request was not applied.
```

The reconciliation-driven CancelPickup invocation:
- Uses the same deterministic idempotency key: `carrier-cancel:<shipmentId>`
- Goes through the same outbox → worker → provider path
- Is subject to the same circuit breaker, retry policy, and error classification
- Produces the same state transitions (SUCCEEDED / FAILED / UNKNOWN)

If the reconciliation-driven CancelPickup itself results in UNKNOWN, the cycle repeats within the remaining reconciliation budget.

### BD-11 — Duplicate Cancellation Prevention → **LOCKED**

```
BOTH mechanisms are required:

1. carrierCancelStatus state guard:
   Worker checks carrier_cancel_status before calling provider.
   If SUCCEEDED or NOT_REQUIRED → idempotent skip (no carrier call).

2. carrier_cancel_idempotency_key:
   Deterministic key: carrier-cancel:<shipmentId>
   Stored in carrier_cancel_idempotency_key column.
   Sent to the carrier as the operation identity.
```

**PostgreSQL concurrency protection preserved:**
- Outbox event claiming: `FOR UPDATE SKIP LOCKED` on `outbox_events` (proven in B.1, B.3.3.1)
- Reconciliation claiming: `FOR UPDATE SKIP LOCKED` on `shipments` (proven in create reconciliation)
- Operation claim: optimistic `UPDATE ... SET carrier_cancel_status='IN_PROGRESS' WHERE id=? AND carrier_cancel_status IS DISTINCT FROM 'IN_PROGRESS'` (B.3.0 lock §8)

### BD-12 — Reconciliation Exhaustion → **LOCKED**

```
After reconciliation time/attempt exhaustion (BD-01 or BD-03, whichever first):

  carrier_cancel_status = RECONCILIATION_REQUIRED
  recoveryStatus = CANCEL_RECONCILE
  nextReconciliationAt = null

Do NOT automatically mark FAILED when the carrier outcome remains uncertain.
Admin intervention is then required.
```

**RECONCILIATION_REQUIRED is persistent and admin-visible.** It appears in:
- `GET /v1/carrier/recovery/queue` (extended to include cancel states)
- Admin recovery endpoint (extended to accept cancel states)
- Partial index `idx_shipments_carrier_cancel` (already covers RECONCILIATION_REQUIRED)

---

## 4. Architecture Decision C4 — Provider Reconciliation Mechanism → **LOCKED: OPTION A**

```
Option A: Use existing getTrackingInfo() + controlled cancelPickup() interpretation.
```

**Mechanism:**

1. **Tracking evidence:** Call `provider.getTrackingInfo(trackingId)`. If tracking events contain a verified cancellation status code, resolve UNKNOWN → SUCCEEDED.

2. **Re-cancel interpretation:** If tracking is inconclusive, the reconciliation service may invoke `cancelPickup()` again (per BD-10) when it has established that the pickup remains active. The response is interpreted:
   - `HasErrors: false` → SUCCEEDED (the cancel now took effect, or was already in effect)
   - `HasErrors: true` with definitive "already cancelled" code → **REQUIRES PROVIDER VERIFICATION** → safe default: RECONCILIATION_REQUIRED
   - `HasErrors: true` with other business error → FAILED (if terminal) or continued reconciliation

**Safety condition:**

```
Only carrier responses with DETERMINISTIC, UNAMBIGUOUS evidence may resolve UNKNOWN.

If an Aramex response cannot be reliably distinguished from a new failure
(ambiguous error code, generic "not found", unverified message text),
it MUST NOT resolve UNKNOWN to SUCCEEDED.

Safe default: UNKNOWN → RECONCILIATION_REQUIRED.
```

**No new provider method required.** A future `getPickupStatus()` capability may be introduced in a later milestone if reconciliation accuracy requires it.

---

## 5. Architecture Decision C5 — Tracking Poller Scope → **LOCKED**

```
B.3.3.3 introduces ONLY the minimal guard required to prevent already-cancelled
shipments from continuing normal tracking progression.
```

**Minimal guard:** Add to the tracking poller claim query a filter that excludes shipments where `carrier_cancel_status IN ('SUCCEEDED', 'NOT_REQUIRED')`. This prevents the poller from advancing `carrier_status_mapped` on shipments where the carrier cancellation is confirmed.

**Deferred to B.3.3.4:**
- Full delivered-after-cancel exception handling (shipment exception events, outbox `shipment.reconciliation_required`)
- Recording post-cancel carrier events as reconciliation evidence
- Full tracking poller cancel-awareness for UNKNOWN/RECONCILIATION_REQUIRED states

**Invariant preserved:**

```
Carrier DELIVERED after SCS cancellation does NOT resurrect:
  - order (TRANSITIONS['CANCELLED'] = [] — confirmed in code)
  - sub-order
  - shipment (status = CANCELLED)
  - completion state

SCS cancellation remains authoritative.
```

**CONFIRMED IN CODE:** `OrdersService.processCarrierDelivery()` returns `false` for cancelled orders before `settleStockForStatus` is called (orders.service.ts). The order-level safety is already proven. B.3.3.3 adds only the tracking poller guard to prevent the shipment-level divergence from occurring silently.

---

## 6. Error Classification → **LOCKED**

The following classification is binding for B.3.3.3 implementation. Each error is classified by the **existing** `classifyCarrierError()` function and `isTimeoutError()` method. The classification determines whether the error is RETRYABLE (safe to retry via outbox), INDETERMINATE (must go to UNKNOWN), or TERMINAL (FAILED).

| Error | Current Error Class | Classification | UNKNOWN? | Reason |
|---|---|---|---|---|
| HTTP 429 | `RateLimitCarrierError` | **RETRYABLE** | NO | Carrier definitively responded. Request not processed. Safe to retry after backoff. |
| HTTP 500 | `RetryableCarrierError` | **RETRYABLE** | NO | Carrier definitively responded with error. Safe to retry. |
| HTTP 502 | `RetryableCarrierError` | **RETRYABLE** | NO | Gateway error. Carrier likely not reached. Safe to retry. |
| HTTP 503 | `RetryableCarrierError` | **RETRYABLE** | NO | Carrier temporarily unavailable. Safe to retry. |
| HTTP 504 | `RetryableCarrierError` | **RETRYABLE** | NO | Gateway timeout. Carrier may not have processed. Safe to retry (carrier responded with 504). |
| Timeout (ETIMEDOUT) | Native Error → `isTimeoutError()=true` | **INDETERMINATE** | **YES** | Cannot know if carrier processed. Must reconcile. |
| ECONNRESET | Native Error → `isTimeoutError()=true` | **INDETERMINATE** | **YES** | Request may have been fully sent. Must reconcile. |
| ECONNABORTED | Native Error → `isTimeoutError()=true` | **INDETERMINATE** | **YES** | Request may have been partially sent. Must reconcile. |
| Socket hang up | Native Error → `isTimeoutError()=true` | **INDETERMINATE** | **YES** | Connection lost mid-flight. Must reconcile. |
| Aborted | Native Error → `isTimeoutError()=true` | **INDETERMINATE** | **YES** | Request may have been partially sent. Must reconcile. |
| ECONNREFUSED | Native Error → `isTimeoutError()=false` | **RETRYABLE** | NO | Carrier definitively not reached. Safe to retry. |
| DNS failure (ENOTFOUND) | Native Error → `isTimeoutError()=false` | **RETRYABLE** | NO | Carrier definitively not reached. Safe to retry. |
| Authentication failure (401) | `AuthenticationCarrierError` | **TERMINAL** | NO | Credentials rejected. FAILED. |
| Validation failure | `ValidationCarrierError` | **TERMINAL** | NO | Request rejected as invalid. FAILED. |
| Definitive business rejection | `CancelPickupResult.cancelled=false` | **TERMINAL** | NO | Carrier responded with business error. FAILED. |
| Circuit breaker OPEN | `RetryableCarrierError` (synthetic) | **RETRYABLE** | NO | Carrier NOT called. Safe to retry later. |
| Malformed response | `NonRetryableCarrierError` | **TERMINAL** | NO | Response received but uninterpretable. FAILED. |

**Critical rule:** `isTimeoutError()` (shipping-carrier.worker.ts:914-925) matches: `timeout`, `etimedout`, `econnreset`, `econnaborted`, `socket hang up`, `aborted`. **All of these are INDETERMINATE.** All transition to UNKNOWN, never FAILED, never blind retry.

**ECONNREFUSED and DNS failure are NOT matched by `isTimeoutError()`.** They fall through to `classifyCarrierError()` which treats generic `Error` as retryable. This is correct — the carrier was definitively not reached.

---

## 7. State Machine → **LOCKED**

### Normal Path

```
PENDING → IN_PROGRESS → SUCCEEDED       (carrier confirmed cancellation)
                      → FAILED          (terminal carrier error)
                      → NOT_REQUIRED    (no carrier action needed)
```

### Retryable Path

```
IN_PROGRESS → (retryable error) → outbox retry → PENDING → IN_PROGRESS → ...
```

### Indeterminate Path

```
IN_PROGRESS → (indeterminate transport failure) → UNKNOWN
                                                    ↓
                                            reconciliation
                                              /     |     \
                                   confirmed  ambiguous  exhausted
                                   cancelled     |         |
                                      ↓          ↓         ↓
                                  SUCCEEDED  UNKNOWN   RECONCILIATION_
                                  (if within  (retry     REQUIRED
                                   budget)    if budget   (admin)
                                              remains)
```

### Safe Retry Path (from reconciliation)

```
UNKNOWN → (reconciliation definitively confirms pickup active) → PENDING
  → outbox retry → IN_PROGRESS → ...
```

### State Separation Rule

```
UNKNOWN and RECONCILIATION_REQUIRED are SEPARATE states.

UNKNOWN means:
  "We have lost certainty immediately after a transport failure."
  Set by: the cancellation worker.
  Resolvable by: automated reconciliation.

RECONCILIATION_REQUIRED means:
  "Automated reconciliation could not establish a definitive carrier state."
  Set by: the reconciliation service (after budget exhaustion or persistent ambiguity).
  Resolvable by: admin intervention.

UNKNOWN is a transient diagnostic state.
RECONCILIATION_REQUIRED is a persistent operational state.
```

### Terminal States

```
SUCCEEDED       — terminal, never downgraded
NOT_REQUIRED    — terminal, never downgraded
FAILED          — terminal after reconciliation or definitive carrier rejection
RECONCILIATION_REQUIRED — persistent, admin-visible, not terminal but not auto-retried
```

### Transition Table

| From | To | Trigger | Guard |
|---|---|---|---|
| NULL | PENDING | cancelOrder() outbox event | pickupScheduled=true AND canCancelPickup=true |
| NULL | NOT_REQUIRED | cancelOrder() outbox event | no carrier action needed |
| PENDING | IN_PROGRESS | worker claims event | FOR UPDATE SKIP LOCKED |
| IN_PROGRESS | SUCCEEDED | carrier confirms cancel | `HasErrors=false` |
| IN_PROGRESS | FAILED | terminal carrier error | auth/validation/business rejection |
| IN_PROGRESS | UNKNOWN | indeterminate transport failure | `isTimeoutError()=true` |
| IN_PROGRESS | (outbox retry) | retryable error + budget | `classifyCarrierError()=retry` |
| UNKNOWN | SUCCEEDED | reconciliation: carrier confirms cancelled | definitive evidence |
| UNKNOWN | PENDING | reconciliation: carrier confirms active | definitive evidence + safe retry (BD-09) |
| UNKNOWN | RECONCILIATION_REQUIRED | reconciliation budget exhausted | BD-01 or BD-03 |
| UNKNOWN | UNKNOWN | reconciliation: carrier unreachable | within budget, defer |
| RECONCILIATION_REQUIRED | SUCCEEDED | admin/reconciliation resolves | definitive evidence |
| RECONCILIATION_REQUIRED | PENDING | admin triggers retry | admin action |

---

## 8. Recovery State → **LOCKED**

| Condition | recoveryStatus | carrier_cancel_status | nextReconciliationAt |
|---|---|---|---|
| UNKNOWN caused by timeout | `CANCEL_TIMEOUT` | UNKNOWN | NOW() |
| UNKNOWN caused by other indeterminate transport failure | `CANCEL_UNKNOWN` | UNKNOWN | NOW() |
| Active reconciliation in progress | `RECONCILING` | UNKNOWN or RECONCILIATION_REQUIRED | lease expiry |
| Reconciliation exhausted | `CANCEL_RECONCILE` | RECONCILIATION_REQUIRED | null |
| Terminal failure | `CANCEL_FAILED` | FAILED | null |
| Successful resolution | null (cleared) | SUCCEEDED | null |
| Admin intervention | `ADMIN_TRIGGERED` | (unchanged) | NOW() |

**CONFIRMED IN CODE:** All recovery tokens (`CANCEL_UNKNOWN`, `CANCEL_TIMEOUT`, `CANCEL_FAILED`, `CANCEL_RECONCILE`, `DELIVERED_AFTER_CANCEL`) are already defined in `shipping.types.ts:274-280`. All fit within VARCHAR(24). The `RECONCILING` and `ADMIN_TRIGGERED` tokens are existing create-flow recovery values.

**Clearing rule:** After successful resolution, `recoveryStatus` is cleared to `null` following the existing reconciliation pattern (confirmed in `carrier-reconciliation.service.ts`).

---

## 9. Scheduling → **LOCKED**

```
Use the existing: nextReconciliationAt column.

No new scheduler.
No new queue.
No setTimeout.
No process-local timer loop.
```

**CONFIRMED IN CODE:** The existing reconciliation service (`carrier-reconciliation.service.ts:106-160`) claims shipments where `next_reconciliation_at IS NULL OR next_reconciliation_at <= NOW()` using `FOR UPDATE SKIP LOCKED`. The cancel reconciliation reuses this exact mechanism, filtering on `carrier_cancel_status` instead of `carrier_create_status`.

---

## 10. Concurrency Rules → **LOCKED**

| Rule | Mechanism | Evidence |
|---|---|---|
| Reconciliation claims use PostgreSQL row locking | `FOR UPDATE SKIP LOCKED` on shipments | Existing pattern in `carrier-reconciliation.service.ts:137` |
| Concurrent workers produce exactly one effective claim | SKIP LOCKED ensures no two workers claim the same row | Proven in B.1 (100-concurrent test) |
| Target test concurrency levels | 2, 10, 50, 100 workers | All must produce exactly 1 claim |
| Reconciliation must not race unsafely with cancellation | Reconciliation sets `recoveryStatus='RECONCILING'`; worker checks before acting | Two-phase claim pattern |
| Reconciliation must not race unsafely with tracking | Minimal tracking poller guard excludes SUCCEEDED/NOT_REQUIRED cancel shipments | C5 lock |
| Tenant isolation preserved | Org resolved from shipment → store → org chain, never from carrier payload | Confirmed in admin controller (carrier-admin.controller.ts:204-216) |
| No process-local mutex as primary guarantee | All coordination via PostgreSQL | B.3.0 lock §18 |

**TOCTOU races identified and mitigated:**

1. **Worker retry vs reconciliation:** Reconciliation sets `recoveryStatus='RECONCILING'`. Worker checks before retrying. If RECONCILING, skip.
2. **Tracking poller vs reconciliation:** Tracking poller excludes shipments with `carrier_cancel_status IN ('SUCCEEDED', 'NOT_REQUIRED')` (C5 minimal guard).
3. **Admin recovery vs automated reconciliation:** Admin sets `ADMIN_TRIGGERED`. Reconciliation skips `ADMIN_TRIGGERED` rows (existing pattern).
4. **Duplicate outbox events:** Idempotency key + state guard prevent double execution (BD-11).

---

## 11. Process Crash Semantics → **LOCKED**

| Crash Point | State Before Crash | Recovery Behavior | Invariant |
|---|---|---|---|
| **A. Before carrier HTTP request** | IN_PROGRESS, outbox PROCESSING | Lease expires (5 min) → PENDING. Worker re-claims. Safe — carrier not called. | No UNKNOWN needed. |
| **B. During carrier HTTP request** | IN_PROGRESS, outbox PROCESSING | Lease expires → PENDING. Worker re-claims. **CARRIER MAY HAVE PROCESSED.** Second call may return "already cancelled." | Must handle "already cancelled" as potential SUCCEEDED (BD-06). |
| **C. After request reaches carrier** | IN_PROGRESS | Same as B. | Same as B. |
| **D. After carrier success, before DB update** | IN_PROGRESS (SUCCEEDED not written) | Lease expires → PENDING. Worker re-claims. Second call returns "already cancelled." | Must interpret as SUCCEEDED (BD-06). |
| **E. After DB update, before outbox ack** | SUCCEEDED (written), outbox PROCESSING | Lease expires → PENDING. Worker re-claims, sees `carrierCancelStatus='SUCCEEDED'` → idempotent skip. | Safe. |
| **F. During reconciliation** | UNKNOWN, recovery RECONCILING | Lease expires → recovery null. Next cycle re-claims. | Safe — reconciliation is idempotent. |

**Critical invariant:**

```
A transport failure that may have reached the carrier MUST NOT be treated
as a definitive carrier failure.

Crash points B, C, D: the system cannot know if the carrier processed
the cancellation. The recovery behavior (lease → PENDING → re-claim) may
result in a second CancelPickup call. If the carrier returns "already
cancelled," this is evidence that the FIRST call succeeded, and must be
interpreted as SUCCEEDED (subject to BD-06 definitive evidence rules).
```

---

## 12. Aramex Safety Boundary → **LOCKED**

The architecture audit identifies a **CRITICAL** provider verification risk:

```
The exact Aramex response for an already-cancelled PickupGUID is NOT
verified against a live Aramex API.
```

**Locked safety rules:**

1. **DO NOT** lock an undocumented Aramex response code or message as proof of successful cancellation.

2. **DO NOT** treat a generic Aramex error (e.g., "Pickup not found", "Invalid GUID", generic `HasErrors=true`) as definitive evidence of prior cancellation.

3. **DO** treat `HasErrors=false` on CancelPickup as definitive evidence of successful cancellation. This is confirmed by the current implementation (aramex.provider.ts:729-733).

4. **If** provider-specific evidence is unavailable or ambiguous:
   ```
   UNKNOWN → RECONCILIATION_REQUIRED
   NOT
   UNKNOWN → SUCCEEDED
   ```

5. **A future live Aramex verification** may establish that specific error codes (e.g., a specific `Code` value in `Notifications[0].Code`) definitively mean "already cancelled." When that verification is performed, the implementation may be updated to recognize those codes as definitive evidence. Until then, ambiguous responses remain RECONCILIATION_REQUIRED.

**Classification:**

| Category | Status |
|---|---|
| `CancelPickup` → `HasErrors: false` | **CONFIRMED BY CURRENT IMPLEMENTATION** → SUCCEEDED |
| `CancelPickup` → `HasErrors: true` with specific "already cancelled" code | **REQUIRES PROVIDER VERIFICATION** → safe default: RECONCILIATION_REQUIRED |
| `TrackShipments` → cancellation status code | **REQUIRES PROVIDER VERIFICATION** — exact Aramex cancellation status codes not documented in codebase |
| `GetPickupStatus` API | **NOT AVAILABLE** — not implemented in current codebase |

---

## 13. Migration Decision → **LOCKED**

```
NO NEW MIGRATION for B.3.3.3.
```

**CONFIRMED IN CODE:** Migration 0049 (`0049_carrier_cancellation.sql`) already provides:

| Column/Index | Type | Sufficient? |
|---|---|---|
| `carrier_cancel_status` | VARCHAR(24) | YES — UNKNOWN, RECONCILIATION_REQUIRED in vocabulary |
| `carrier_cancel_error` | TEXT | YES |
| `carrier_cancel_error_class` | VARCHAR(40) | YES |
| `carrier_cancel_retries` | INTEGER DEFAULT 0 | YES |
| `carrier_cancel_attempted_at` | TIMESTAMPTZ | YES |
| `carrier_cancel_idempotency_key` | VARCHAR(120) | YES |
| `recovery_status` | VARCHAR(24) | YES — new tokens already defined |
| `next_reconciliation_at` | TIMESTAMPTZ | YES — reusable for cancel scheduling |
| `idx_shipments_carrier_cancel` | Partial index | YES — covers PENDING, IN_PROGRESS, UNKNOWN, RETRY, RECONCILIATION_REQUIRED |

**State vocabulary** (shipping.types.ts:29-37): PENDING, IN_PROGRESS, SUCCEEDED, FAILED, UNKNOWN, NOT_REQUIRED, RECONCILIATION_REQUIRED, RETRY — all already defined.

**Recovery tokens** (shipping.types.ts:274-280): CANCEL_UNKNOWN (14), CANCEL_TIMEOUT (14), CANCEL_FAILED (13), CANCEL_RECONCILE (14), DELIVERED_AFTER_CANCEL (22) — all already defined, all ≤ 24 chars.

**If implementation discovers that a genuinely new field is required** (e.g., a separate reconciliation attempt counter that cannot share existing columns), implementation must **STOP and report** rather than silently creating migration 0050.

---

## 14. Admin Recovery Extension → **LOCKED**

**Existing endpoints** (CONFIRMED IN CODE, carrier-admin.controller.ts):

- `POST /v1/carrier/shipments/:id/recover` — RBAC: `admin:shipping:recovery`, tenant-scoped, audited
- `GET /v1/carrier/recovery/queue` — RBAC: `admin:shipping:recovery`, tenant-scoped

**Current gap** (carrier-admin.controller.ts:219-221): Only checks `carrierCreateStatus` for recoverable statuses. Does NOT check `carrierCancelStatus`.

**Locked extension:**

```
Recoverable statuses extended to include:
  carrierCancelStatus IN ('UNKNOWN', 'RECONCILIATION_REQUIRED')

Recovery queue extended to list:
  shipments with carrierCancelStatus IN ('UNKNOWN', 'RECONCILIATION_REQUIRED')
```

**Preserved invariants:**
- `admin:shipping:recovery` permission (unchanged)
- Tenant isolation: shipment → store → org chain (unchanged)
- Audit trail via `AuditService` (unchanged)
- `recoveryStatus = 'ADMIN_TRIGGERED'` pattern (unchanged)
- No cross-tenant recovery (unchanged)

---

## 15. Observability → **LOCKED**

Database state is the authoritative operational observable. No telemetry infrastructure introduced in this lock.

| State | carrier_cancel_status | recoveryStatus | nextReconciliationAt |
|---|---|---|---|
| UNKNOWN (timeout) | UNKNOWN | CANCEL_TIMEOUT | set (next cycle) |
| UNKNOWN (other transport) | UNKNOWN | CANCEL_UNKNOWN | set (next cycle) |
| RECONCILING | (unchanged) | RECONCILING | lease expiry |
| RECONCILIATION_REQUIRED | RECONCILIATION_REQUIRED | CANCEL_RECONCILE | null |
| SUCCEEDED | SUCCEEDED | null | null |
| FAILED (terminal) | FAILED | CANCEL_FAILED | null |
| ADMIN_TRIGGERED | (unchanged) | ADMIN_TRIGGERED | NOW() |

**Recommended additive counters** (non-blocking, existing `CarrierObservabilityService` pattern):

```
carrier_cancel_unknown_total          — increments when UNKNOWN is set
carrier_cancel_reconciliation_total   — increments per reconciliation attempt
carrier_cancel_reconciled_total       — increments when reconciliation resolves
carrier_cancel_unresolved_total       — increments when reconciliation gives up
```

These are additive and non-blocking. Implementation may add them if time permits but they are not a gate.

---

## 16. Scope → **LOCKED**

### B.3.3.3 WILL Implement

- Indeterminate transport failure → UNKNOWN (upgrade from current FAILED at shipping-carrier.worker.ts:638-653)
- Recovery token assignment (CANCEL_TIMEOUT for timeout, CANCEL_UNKNOWN for other indeterminate)
- `nextReconciliationAt` scheduling for UNKNOWN shipments
- Cancel reconciliation claim in `CarrierReconciliationService` (extend claim query to filter on `carrier_cancel_status`)
- Reconciliation state resolution (UNKNOWN → SUCCEEDED / PENDING / RECONCILIATION_REQUIRED)
- Safe retry when carrier state is definitively active (BD-09, BD-10)
- Definitive success handling (BD-06)
- Ambiguous carrier response → RECONCILIATION_REQUIRED (BD-08, §12)
- Minimal tracking poller guard (exclude SUCCEEDED/NOT_REQUIRED cancel shipments per C5)
- Admin recovery extension (accept cancel states in recoverable status check per §14)
- Required unit, PostgreSQL, carrier HTTP, and end-to-end tests

### B.3.3.3 WILL NOT Implement (Explicit Non-Goals)

| Deferred To | Scope |
|---|---|
| B.3.3.4 | Full delivered-after-cancel exception handling (shipment exception events, outbox `shipment.reconciliation_required`, full recording) |
| B.3.3.4 | Full tracking poller cancel-awareness (suppress progression for UNKNOWN, record post-cancel events as reconciliation evidence) |
| B.3.3.5 | Additional concurrency hardening (partial unique index on outbox for at-most-one-pending-cancel) |
| Future | New provider capability `getPickupStatus()` |
| Future | HTTP-date Retry-After parsing (already deferred from B.3.3.2.2) |
| Out of scope | Returns, refunds, payment, disputes, notifications |
| Out of scope | Unrelated tracking redesign |
| Out of scope | Unrelated reconciliation redesign (create path untouched) |
| Out of scope | New carrier integrations |
| Out of scope | New pickup-status provider abstraction |

---

## 17. Test Gates → **LOCKED**

### Unit Tests: 18+ minimum

| # | Test | Category |
|---|---|---|
| 1 | Timeout → UNKNOWN (not FAILED) | Indeterminate transport failure |
| 2 | ECONNRESET → UNKNOWN | Indeterminate transport failure |
| 3 | ECONNABORTED → UNKNOWN | Indeterminate transport failure |
| 4 | Socket hang up → UNKNOWN | Indeterminate transport failure |
| 5 | Aborted → UNKNOWN | Indeterminate transport failure |
| 6 | ECONNREFUSED → retryable (not UNKNOWN) | Safe retry |
| 7 | DNS failure → retryable (not UNKNOWN) | Safe retry |
| 8 | UNKNOWN sets recoveryStatus = CANCEL_TIMEOUT (for timeout) | Recovery token |
| 9 | UNKNOWN sets recoveryStatus = CANCEL_UNKNOWN (for other transport) | Recovery token |
| 10 | UNKNOWN sets nextReconciliationAt | Scheduling |
| 11 | Reconciliation: carrier confirms cancelled → SUCCEEDED | Reconciliation classification |
| 12 | Reconciliation: carrier confirms active → safe retry (PENDING) | Reconciliation classification |
| 13 | Reconciliation: ambiguous carrier response → RECONCILIATION_REQUIRED | Aramex safety |
| 14 | Reconciliation: timeout during reconciliation → stays UNKNOWN (within budget) | Reconciliation timeout |
| 15 | Reconciliation: budget exhausted → RECONCILIATION_REQUIRED | Reconciliation exhaustion |
| 16 | Idempotency: SUCCEEDED → skip | Idempotency |
| 17 | HTTP 429/500/502/503/504 → retry (not UNKNOWN) | Regression |
| 18 | Auth/validation → FAILED (not UNKNOWN) | Regression |

### PostgreSQL Tests: 9+ minimum

| # | Test | Category |
|---|---|---|
| 1 | 2-worker concurrency: 1 UNKNOWN → exactly 1 reconciliation claim | Concurrency |
| 2 | 10-worker concurrency | Concurrency |
| 3 | 50-worker concurrency | Concurrency |
| 4 | 100-worker concurrency | Concurrency |
| 5 | Stale RECONCILING lease → re-claim | Lease recovery |
| 6 | Duplicate outbox events → single effective cancel | Duplicate events |
| 7 | Tenant isolation: Org A cannot reconcile Org B's shipment | Tenant isolation |
| 8 | Reconciliation vs cancellation worker race | Race condition |
| 9 | Reconciliation vs tracking poller race | Race condition |

### Carrier HTTP Tests: 5+ minimum

| # | Test | Category |
|---|---|---|
| 1 | Timeout during cancelPickup → UNKNOWN | Timeout |
| 2 | Connection reset during cancelPickup → UNKNOWN | Connection reset |
| 3 | Aborted request → UNKNOWN | Aborted request |
| 4 | DNS failure → retryable (not UNKNOWN) | DNS failure |
| 5 | Response lost after successful carrier processing → UNKNOWN | Response lost |

### End-to-End Tests: 4+ minimum

| # | Test | Category |
|---|---|---|
| 1 | Cancel → UNKNOWN → reconciliation → SUCCEEDED | Happy path |
| 2 | Cancel → UNKNOWN → reconciliation → safe retry → SUCCEEDED/FAILED | Active pickup |
| 3 | Cancel → UNKNOWN → reconciliation → unresolved → RECONCILIATION_REQUIRED → admin | Exhaustion |
| 4 | Cancel → later carrier DELIVERED → SCS CANCELLED authoritative | Delivered-after-cancel |

---

## 18. Release Gate → **LOCKED**

```
Architecture Audit          → COMPLETE (this document's predecessor)
Business/Architecture Lock  → COMPLETE (this document)
Implementation              → next
Independent Runtime Verification → after implementation
Release Closure             → final
```

No implementation proceeds before this lock is complete. No runtime verification proceeds before implementation. No release closure proceeds before runtime verification.

---

## 19. Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | Aramex CancelPickup on already-cancelled GUID returns an ambiguous error that cannot be distinguished from a new failure | **CRITICAL** | Locked: ambiguous → RECONCILIATION_REQUIRED, never SUCCEEDED. Live Aramex verification required. |
| R-2 | Process crash between UNKNOWN write and outbox event update leaves inconsistent state | HIGH | Lease recovery — outbox event remains PROCESSING, lease expires, re-claimed. UNKNOWN on shipment is the authoritative signal. |
| R-3 | Reconciliation service and cancel worker both attempt to resolve the same shipment | HIGH | `recoveryStatus='RECONCILING'` claim marker + FOR UPDATE SKIP LOCKED. |
| R-4 | Tracking poller overwrites reconciliation state with stale carrier data | MEDIUM | Minimal tracking poller guard (C5). |
| R-5 | `isTimeoutError()` substring matching is fragile | MEDIUM | Low risk — `isTimeoutError()` is called on caught exceptions, not carrier error messages. Carrier errors go through `classifyCarrierError()`. |
| R-6 | No `getPickupStatus()` limits reconciliation to indirect signals | MEDIUM | Acceptable for B.3.3.3. Can be added later if needed. |
| R-7 | Reconciliation loop: UNKNOWN → re-cancel → timeout → UNKNOWN → ... | LOW | Mitigated by reconciliation budget (BD-03). After max attempts → admin. |

---

## 20. Final Locked Decision

```
========================================
SCS M7.3-B.3.3.3 — BUSINESS RULES & ARCHITECTURE LOCK
========================================

Audit verdict          : GO WITH CONDITIONS (5 conditions)
Lock verdict           : GO — all conditions resolved

Business decisions     : BD-01 through BD-12 — ALL LOCKED
Architecture decisions : C4 (Option A — existing provider methods)
                         C5 (minimal tracking guard)

Migration              : NO NEW MIGRATION (0049 sufficient)
Provider capability    : NO NEW METHOD (existing cancelPickup + getTrackingInfo)
State vocabulary       : Already defined (UNKNOWN, RECONCILIATION_REQUIRED)
Recovery tokens        : Already defined (CANCEL_UNKNOWN, CANCEL_TIMEOUT, etc.)
Partial index          : Already covers UNKNOWN, RECONCILIATION_REQUIRED

Aramex safety          : Ambiguous → RECONCILIATION_REQUIRED, never SUCCEEDED
                         Live verification required for "already cancelled" codes

Test gates             : 18+ unit, 9+ PG, 5+ carrier HTTP, 4+ E2E

Scope                  : Indeterminate → UNKNOWN → reconciliation → resolution
                         Minimal tracking guard, admin recovery extension

Non-goals              : Returns, refunds, payment, disputes, notifications
                         Full delivered-after-cancel (B.3.3.4)
                         New provider abstraction (future)

Verdict                : GO
Status                 : LOCKED
========================================
```

---

*No production code was modified during this lock.*
