# SCS-M7.3-B.3.3.3 — PRE-IMPLEMENTATION ARCHITECTURE AUDIT

**Indeterminate Outcome Reconciliation**

| Field | Value |
|---|---|
| Milestone | M7.3-B.3.3.3 |
| Task type | Pre-implementation architecture audit — READ-ONLY |
| Date | 2026-10-01 |
| Branch | develop |
| HEAD | ac000d0 |
| Predecessors | B.3.3.1 CLOSED/PASS, B.3.3.2 CLOSED/PASS, B.3.3.2.1 CLOSED/PASS, B.3.3.2.2 CLOSED/PASS |
| Parent Lock | SCS-M7.3-B.3-BUSINESS-RULES-ARCHITECTURE-LOCK.md (LOCKED) |
| Parent Audit | SCS-M7.3-B.3.3-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md (GO WITH CONDITIONS) |
| Verdict | **GO WITH CONDITIONS** |

---

## 1. Executive Summary

B.3.3.3 addresses a single, well-defined correctness gap: when the carrier cancellation HTTP request fails due to a transport-level uncertainty (timeout, connection reset, DNS failure, aborted request, process crash), the current implementation marks the shipment `carrier_cancel_status = 'FAILED'` and does not retry. This is **unsafe** because the carrier may have actually processed the cancellation. SCS cannot distinguish "carrier definitely did not cancel" from "we don't know what happened."

The fix requires introducing an `UNKNOWN` state and a reconciliation path that queries the carrier to determine the actual cancellation outcome.

**Verdict: GO WITH CONDITIONS**

The infrastructure is proven (B.3.3.1/2/2.1/2.2 all CLOSED/PASS). The state vocabulary (`UNKNOWN`, `RECONCILIATION_REQUIRED`) already exists in `CarrierCancelStatus` (shipping.types.ts:34-36). The recovery tokens (`CANCEL_UNKNOWN`, `CANCEL_TIMEOUT`) are already defined (shipping.types.ts:274-280). Migration 0049 already provides the partial index for UNKNOWN/RECONCILIATION_REQUIRED states. The create flow provides an exact reference implementation (`handleCreate()` timeout → `RECOVERY_REQUIRED`).

**Conditions (must be locked before implementation):**

1. **C1 — UNKNOWN duration bound**: How long may a cancellation remain in UNKNOWN before escalation to admin intervention?
2. **C2 — Reconciliation frequency and budget**: How often should reconciliation poll the carrier, and how many attempts before giving up?
3. **C3 — Retry after UNKNOWN**: Should reconciliation ever transition UNKNOWN back to PENDING for a direct retry, or always resolve to SUCCEEDED/FAILED?
4. **C4 — Provider capability for reconciliation**: Should B.3.3.3 use existing `getTrackingInfo()` for reconciliation, or require a new `getPickupStatus()` provider method?
5. **C5 — Tracking poller interaction**: Should the tracking poller be cancel-aware in B.3.3.3, or defer to B.3.3.4?

---

## 2. Current State

### Cancellation Lifecycle Trace

```
Merchant cancelOrder()
  → OrdersService.cancelOrder() [orders.service.ts]
  → Order FSM: order.status = CANCELLED (terminal)
  → Outbox: shipping.carrier.cancel (aggregateId = shipmentId)
  → ShippingCarrierWorker.claimEvents() [FOR UPDATE SKIP LOCKED]
  → processEvent() → handleCancel()
  → Load shipment, idempotent guard, resolve provider
  → Manual/unsupported → NOT_REQUIRED
  → Missing carrierPickupId → FAILED
  → Circuit breaker check → retryable if OPEN
  → PENDING → IN_PROGRESS
  → provider.cancelPickup()
  → HTTP request/response
  → Outcome:
      Success (cancelled=true)   → SUCCEEDED
      Business failure           → FAILED
      Unsupported result         → NOT_REQUIRED
      Timeout (isTimeoutError)   → FAILED  ← THE GAP
      Retryable (429/5xx)        → PENDING + re-throw → handleFailure()
      Terminal (auth/validation) → FAILED
```

### Where Indeterminate Outcomes Occur

The `isTimeoutError()` branch (shipping-carrier.worker.ts:638-653) is the **exact location** of the gap:

```typescript
if (isTimeout) {
  await this.db.db.update(shipments).set({
    carrierCancelStatus: 'FAILED' as any,  // ← WRONG: assumes failure
    carrierCancelError: `[TIMEOUT — B3.3.3 will set UNKNOWN] ...`,
    carrierCancelErrorClass: 'timeout',
    ...
  });
  return;  // ← No re-throw, no outbox retry, no reconciliation
}
```

The code comment explicitly marks this as the B.3.3.3 upgrade point. The `isTimeoutError()` method (lines 914-925) matches: `timeout`, `etimedout`, `econnreset`, `econnaborted`, `socket hang up`, `aborted`.

---

## 3. Current Error Classification

### Complete Error Taxonomy for Cancel

| Failure | Error Class | Worker Behavior | HTTP Definitely Sent? | Carrier Result Knowable? | Shipment State | Outbox State | Retry Safe? | Reconciliation Required? |
|---|---|---|---|---|---|---|---|---|
| HTTP 429 | RateLimitCarrierError | retry/backoff | YES | YES (carrier said 429) | PENDING | backoff PENDING | YES | NO |
| HTTP 500 | RetryableCarrierError | retry/backoff | YES | YES (carrier said 500) | PENDING | backoff PENDING | YES | NO |
| HTTP 502 | RetryableCarrierError | retry/backoff | YES | YES (gateway said 502) | PENDING | backoff PENDING | YES | NO |
| HTTP 503 | RetryableCarrierError | retry/backoff | YES | YES (carrier said 503) | PENDING | backoff PENDING | YES | NO |
| HTTP 504 | RetryableCarrierError | retry/backoff | YES | YES (gateway said 504) | PENDING | backoff PENDING | YES | NO |
| Timeout | Native Error | **FAILED (no retry)** | MAYBE | **UNKNOWN** | **FAILED** | **DISPATCHED** | **NO** | **YES** |
| Connection reset | Native Error | **FAILED (no retry)** | MAYBE | **UNKNOWN** | **FAILED** | **DISPATCHED** | **NO** | **YES** |
| Connection refused | Native Error | **FAILED (no retry)** | **NO** | **YES (not reached)** | **FAILED** | **DISPATCHED** | YES (safe) | NO |
| DNS failure | Native Error | **FAILED (no retry)** | **NO** | **YES (not reached)** | **FAILED** | **DISPATCHED** | YES (safe) | NO |
| Aborted request | Native Error | **FAILED (no retry)** | MAYBE | **UNKNOWN** | **FAILED** | **DISPATCHED** | **NO** | **YES** |
| Malformed response | NonRetryableCarrierError | FAILED (no retry) | YES | YES (response received) | FAILED | DISPATCHED | NO | NO |
| Auth failure (401) | AuthenticationCarrierError | FAILED (no retry) | YES | YES (carrier rejected) | FAILED | DEAD_LETTER | NO | NO |
| Validation failure | ValidationCarrierError | FAILED (no retry) | YES | YES (carrier rejected) | FAILED | DEAD_LETTER | NO | NO |
| Business failure | CancelPickupResult.cancelled=false | FAILED (no retry) | YES | YES (carrier responded) | FAILED | DISPATCHED | NO | NO |
| Circuit breaker OPEN | RetryableCarrierError | retry/backoff | NO | N/A | PENDING | backoff PENDING | YES | NO |

### RETRYABLE vs INDETERMINATE — Critical Distinction

**RETRYABLE** (HTTP 429/500/502/503/504): The carrier definitively responded with an error. The request was received and rejected. A retry is safe because the carrier has not processed the cancellation.

**INDETERMINATE** (timeout, connection reset, aborted): The request may or may not have reached the carrier. The carrier may or may not have processed the cancellation. A blind retry risks **double cancellation** — calling CancelPickup twice for the same pickup.

**SAFE TO RETRY WITHOUT RECONCILIATION** (connection refused, DNS failure): The request definitively did not leave SCS. No carrier-side state change is possible. A retry is safe.

**Current implementation treats ALL of these as FAILED**, which is correct for connection refused and DNS failure but **incorrect** for timeout, connection reset, and aborted request.

---

## 4. Indeterminate Outcome Threat Model

### T-1: Request Transmitted, Response Lost

The HTTP request reaches the carrier, the carrier processes the cancellation, but the response is lost in transit (network partition, carrier infrastructure failure). SCS receives a timeout.

**Current behavior**: Marks FAILED. Carrier has actually cancelled. Divergence: SCS thinks not cancelled, carrier thinks cancelled.

**Required**: UNKNOWN → reconciliation → carrier tracking confirms cancelled → SUCCEEDED.

### T-2: Response Received by Network, Not by Application

The TCP stack receives the response, but the Node.js process crashes or the AbortSignal fires before `fetch()` resolves. The carrier response exists on the wire but is never processed by SCS.

**Current behavior**: Marks FAILED. Same divergence as T-1.

**Required**: Same as T-1.

### T-3: Socket Timeout After Request Transmission

The `fetch()` timeout fires after the request body has been fully transmitted but before the response headers arrive. The carrier may have processed the request.

**Current behavior**: `isTimeoutError()` matches `timeout`/`etimedout` → FAILED.

**Required**: UNKNOWN → reconciliation.

### T-4: Connection Reset After Transmission

`ECONNRESET` fires during response reading. The request was fully sent. The carrier may have processed it.

**Current behavior**: `isTimeoutError()` matches `econnreset` → FAILED.

**Required**: UNKNOWN → reconciliation.

### T-5: Process Crash During Carrier HTTP Request

The Node.js process crashes (OOM, unhandled exception, deployment) while `await provider.cancelPickup()` is in flight. The outbox event lease expires after 5 minutes.

**Current behavior**: Lease recovery resets to PENDING. Worker re-processes. If the carrier already cancelled, the second CancelPickup may succeed (idempotent) or return a business error ("already cancelled").

**Risk**: If the second call returns a business error like "pickup already cancelled," the worker marks FAILED — but the cancellation actually succeeded. This is a **false negative**.

**Required**: The retry must be aware that a "already cancelled" business response actually means SUCCEEDED.

### T-6: Process Crash After Carrier Success, Before DB Update

The carrier returns `{ cancelled: true }`, but the process crashes before `carrier_cancel_status = 'SUCCEEDED'` is written.

**Current behavior**: Lease recovery → re-process → second CancelPickup → carrier returns "already cancelled" → business failure → FAILED.

**Required**: Same as T-5. The "already cancelled" response must be recognized as success.

### T-7: Worker Lease Expiry During Carrier Request

The carrier request takes longer than `LEASE_TIMEOUT_MS` (5 minutes). Another worker claims the same event.

**Current behavior**: Lease recovery resets the event to PENDING. The original worker may still be processing. Two workers could call CancelPickup concurrently.

**Mitigation**: The idempotency key `carrier-cancel:<shipmentId>` should make the second call safe at the carrier level. Aramex CancelPickup is expected to be idempotent on PickupGUID.

### T-8: Circuit Breaker State Transition

The circuit breaker transitions to OPEN during a cancel attempt. The worker throws `RetryableCarrierError` without calling the carrier.

**Current behavior**: This is safe — the carrier was NOT called. Retry is safe. No UNKNOWN needed.

**No change required**.

### T-9: Duplicate Worker Execution

Two worker instances claim the same outbox event due to a race in `FOR UPDATE SKIP LOCKED`.

**Current behavior**: SKIP LOCKED prevents this — exactly one worker claims the event.

**No change required**.

### T-10: Duplicate Reconciliation

Two reconciliation cycles process the same UNKNOWN shipment concurrently.

**Current behavior**: The existing reconciliation uses `recovery_status = 'RECONCILING'` as a claim marker with `FOR UPDATE SKIP LOCKED`. This pattern must be replicated for cancel reconciliation.

**Required**: Cancel reconciliation must use the same claim pattern.

---

## 5. Existing Database Model

### Current Cancel Columns (Migration 0049)

| Column | Type | Current Use | Sufficient for B.3.3.3? |
|---|---|---|---|
| `carrier_cancel_status` | VARCHAR(24) | PENDING/IN_PROGRESS/SUCCEEDED/FAILED/NOT_REQUIRED | YES — UNKNOWN and RECONCILIATION_REQUIRED already in vocabulary |
| `carrier_cancel_error` | TEXT | Safe error message | YES |
| `carrier_cancel_error_class` | VARCHAR(40) | 'timeout', 'terminal', 'validation', etc. | YES |
| `carrier_cancel_retries` | INTEGER | 0-based retry counter | YES |
| `carrier_cancel_attempted_at` | TIMESTAMPTZ | Last attempt timestamp | YES |
| `carrier_cancel_idempotency_key` | VARCHAR(120) | `carrier-cancel:<shipmentId>` | YES |
| `recovery_status` | VARCHAR(24) | Create-flow recovery | YES — new tokens already defined (CANCEL_UNKNOWN, etc.) |
| `next_reconciliation_at` | TIMESTAMPTZ | Create reconciliation scheduling | YES — reusable for cancel |

### Partial Index (Migration 0049)

```sql
CREATE INDEX IF NOT EXISTS idx_shipments_carrier_cancel
  ON shipments (carrier_cancel_status, next_reconciliation_at)
  WHERE carrier_cancel_status IN
    ('PENDING', 'IN_PROGRESS', 'UNKNOWN', 'RECONCILIATION_REQUIRED');
```

**This index already covers UNKNOWN and RECONCILIATION_REQUIRED.** Migration 0049 was designed anticipating B.3.3.3.

### Recovery Tokens (shipping.types.ts)

```typescript
export const CARRIER_CANCEL_RECOVERY_TOKENS = [
  'CANCEL_UNKNOWN',         // 14 chars ≤ 24 ✓
  'CANCEL_TIMEOUT',         // 14 chars ≤ 24 ✓
  'CANCEL_FAILED',          // 13 chars ≤ 24 ✓
  'CANCEL_RECONCILE',       // 14 chars ≤ 24 ✓
  'DELIVERED_AFTER_CANCEL', // 22 chars ≤ 24 ✓
] as const;
```

**All tokens already defined. All fit within VARCHAR(24). No migration required for tokens.**

### Migration Requirement

**No new migration is required for B.3.3.3.** All columns, indexes, and vocabulary already exist. The implementation only needs to:
1. Change the timeout branch from `FAILED` to `UNKNOWN`
2. Set `recovery_status` and `next_reconciliation_at` on UNKNOWN
3. Add the reconciliation claim path

---

## 6. Existing Provider Abstraction

### Current Capabilities

```typescript
export interface ProviderCapabilities {
  canCreateShipment: boolean;
  canCancel: boolean;
  canCancelPickup: boolean;
  canGenerateLabel: boolean;
  canTrack: boolean;
  canValidateAddress: boolean;
  canReceiveWebhooks: boolean;
}
```

### Available for Reconciliation

| Method | Purpose | Can Resolve UNKNOWN? |
|---|---|---|
| `cancelPickup(request)` | Cancel a pickup | MAYBE — calling again may return "already cancelled" which indicates success |
| `getTrackingInfo(trackingId)` | Get tracking events | PARTIAL — shows shipment status but may not directly show pickup cancellation |

### Missing for Reconciliation

There is no `getPickupStatus(pickupId)` or `reconcilePickupCancellation(pickupId)` method. The current provider abstraction cannot directly query "is this pickup still scheduled?"

**However**, the Aramex TrackShipments API (already implemented) returns shipment-level status that may include pickup-related events. The CancelPickup endpoint itself, when called with an already-cancelled GUID, returns `HasErrors=true` with a notification message that can be interpreted as "already cancelled."

### Decision Required (C4)

Should B.3.3.3:
- **(A)** Use existing `getTrackingInfo()` + re-`cancelPickup()` interpretation?
- **(B)** Add a new `getPickupStatus()` method to `ShippingProvider`?
- **(C)** Defer provider capability extension to B.3.3.4 and use only tracking in B.3.3.3?

**Recommendation**: Option (A) for B.3.3.3. The Aramex CancelPickup response for an already-cancelled GUID provides sufficient signal. Adding a new provider method is a larger change that belongs in B.3.3.4 if needed.

---

## 7. Aramex Capability Audit

### CancelPickup (CONFIRMED BY CURRENT IMPLEMENTATION)

- **Endpoint**: `POST /json/CancelPickup`
- **Input**: `ClientInfo`, `PickupGUID`, `Comments`
- **Success**: `{ HasErrors: false }` → `{ supported: true, cancelled: true }`
- **Business failure**: `{ HasErrors: true, Notifications: [{ Message, Code }] }` → `{ supported: true, cancelled: false, reason, carrierCode }`
- **Idempotency**: Aramex CancelPickup takes `PickupGUID`. Calling with an already-cancelled GUID is expected to return `HasErrors=true` with a message indicating the pickup is already cancelled or not found. **This behavior is NOT explicitly verified against the live Aramex API** — it is inferred from the API documentation pattern.

### TrackShipments (CONFIRMED BY CURRENT IMPLEMENTATION)

- **Endpoint**: `POST /json/TrackShipments`
- **Input**: `ClientInfo`, `Shipments: [waybillNumber]`
- **Output**: Tracking results with status codes and descriptions
- **Can show cancellation**: If the pickup was cancelled, tracking events may include a cancellation-related status. **The exact Aramex status code for "pickup cancelled" is NOT documented in the current codebase** — `mapAramexStatus()` maps known codes but cancellation codes are not enumerated.

### CreatePickup (CONFIRMED BY CURRENT IMPLEMENTATION)

- Returns `PickupGUID`, `PickupID`, `Reference`
- Status: `SCHEDULED`

### Pickup Status Query (NOT AVAILABLE)

There is no implemented Aramex API call that directly answers "what is the current status of PickupGUID X?" The Aramex API may have a `GetPickup` or `PickupStatus` endpoint, but it is **NOT implemented in the current codebase**.

**REQUIRES PROVIDER VERIFICATION**: Whether Aramex CancelPickup on an already-cancelled GUID returns a distinguishable error code (e.g., "Pickup already cancelled" vs "Pickup not found" vs "Invalid GUID").

### Summary

| Capability | Status | Can Resolve UNKNOWN? |
|---|---|---|
| CancelPickup | CONFIRMED BY CURRENT IMPLEMENTATION | Indirectly — re-calling may reveal "already cancelled" |
| TrackShipments | CONFIRMED BY CURRENT IMPLEMENTATION | Partially — tracking events may show cancellation |
| GetPickupStatus | NOT AVAILABLE | Would be ideal but requires new implementation |
| Aramex "already cancelled" response | REQUIRES PROVIDER VERIFICATION | Critical for reconciliation correctness |

---

## 8. Reconciliation State Machine

### Proposed State Transitions

```
                    ┌──────────────────────────────────────────────┐
                    │                                              │
                    ▼                                              │
 ┌─────────┐   ┌──────────┐   ┌───────────┐   ┌───────────┐      │
 │ PENDING │──▶│IN_PROGRESS│──▶│ SUCCEEDED │   │NOT_REQUIRED│      │
 └─────────┘   └──────────┘   └───────────┘   └───────────┘      │
       ▲              │                                           │
       │              ├───────────┬──────────────┐                │
       │              ▼           ▼              ▼                │
       │         ┌────────┐  ┌──────────┐  ┌──────────────────┐  │
       │         │ RETRY  │  │ UNKNOWN  │  │RECONCILIATION_   │  │
       │         └────────┘  └──────────┘  │    REQUIRED      │  │
       │              ▲              │              │           │
       │              │              ▼              │           │
       │              │     ┌──────────────────┐   │           │
       │              │     │ reconciliation   │   │           │
       │              │     │ confirmed cancel │   │           │
       │              │     │       ↓          │   │           │
       │              │     │   SUCCEEDED      │   │           │
       │              │     └──────────────────┘   │           │
       │              │              │              │           │
       │              │     ┌──────────────────┐   │           │
       │              │     │ reconciliation   │   │           │
       │              │     │ confirms active  │   │           │
       │              │     │       ↓          │   │           │
       │              └─────│   PENDING/retry  │   │           │
       │                    └──────────────────┘   │           │
       │                                           │           │
       └───────────────────────────────────────────┘           │
                    (reconciliation resolves)                   │
                                                                │
                      ┌────────┐                                │
                      │ FAILED │◀── (terminal error or          │
                      └────────┘    budget exhausted) ──────────┘
```

### UNKNOWN vs RECONCILIATION_REQUIRED: Separate or Combined?

**Analysis:**

The B.3 parent lock (§10) distinguishes:
- `UNKNOWN` — the immediate post-transport-failure state
- `RECONCILIATION_REQUIRED` — a state that may result from terminal rejection, delivered-after-cancel, or unresolved UNKNOWN

**Arguments for separation:**
- UNKNOWN is set by the worker immediately upon transport failure
- RECONCILIATION_REQUIRED is set by reconciliation when it cannot resolve the state
- They have different origins and different admin visibility needs
- UNKNOWN is a transient diagnostic state; RECONCILIATION_REQUIRED is a persistent operational state

**Arguments for combination:**
- Both require the same action: query the carrier and resolve
- Simpler state machine with fewer transitions
- The reconciliation claim query is simpler with one state

**Recommendation**: Keep them **separate** per the B.3 parent lock. UNKNOWN is the worker's "I don't know" signal. RECONCILIATION_REQUIRED is the reconciliation service's "I tried but can't resolve" signal. The transition is: UNKNOWN → (reconciliation tries) → SUCCEEDED / FAILED / RECONCILIATION_REQUIRED (unresolved).

---

## 9. Reconciliation Algorithm

### Candidate Algorithm

```
carrier cancel request (cancelPickup)
        │
        ├── definitive success → SUCCEEDED
        │
        ├── definitive business failure → FAILED
        │
        ├── retryable (429/5xx) → PENDING + outbox retry
        │
        └── indeterminate transport failure (timeout/reset/abort)
                    │
                    ▼
                 UNKNOWN
                 recoveryStatus = CANCEL_UNKNOWN/CANCEL_TIMEOUT
                 nextReconciliationAt = NOW()
                    │
                    ▼
             reconciliation cycle claims UNKNOWN rows
                    │
                    ├── query carrier (tracking / re-cancel interpretation)
                    │
                    ├── carrier confirms cancelled → SUCCEEDED
                    │
                    ├── carrier confirms active → FAILED (or PENDING if retry-safe)
                    │
                    ├── carrier returns unknown/timeout → RECONCILIATION_REQUIRED
                    │
                    └── reconciliation budget exhausted → RECONCILIATION_REQUIRED (admin)
```

### Reconciliation Claim Query (Proposed)

```sql
UPDATE shipments
SET recovery_status = 'RECONCILING',
    next_reconciliation_at = ${leaseExpiry},
    updated_at = NOW()
WHERE id IN (
  SELECT id FROM shipments
  WHERE carrier_cancel_status IN ('UNKNOWN', 'RECONCILIATION_REQUIRED')
    AND (next_reconciliation_at IS NULL OR next_reconciliation_at <= NOW())
    AND (recovery_status IS NULL OR recovery_status NOT IN ('RECONCILING', 'RECOVERED'))
  ORDER BY created_at
  LIMIT 20
  FOR UPDATE SKIP LOCKED
)
RETURNING *
```

This mirrors the existing create reconciliation claim pattern exactly, but filters on `carrier_cancel_status` instead of `carrier_create_status`.

---

## 10. Concurrency Analysis

### Concurrent Actors

| Actor | Scope | Claim Mechanism |
|---|---|---|
| Cancellation worker | `shipping.carrier.cancel` outbox events | FOR UPDATE SKIP LOCKED on outbox_events |
| Retry worker (same worker) | Same outbox events | Same — retries go through handleFailure → outbox PENDING |
| Reconciliation service | Shipments in UNKNOWN/RECONCILIATION_REQUIRED | FOR UPDATE SKIP LOCKED on shipments (proposed) |
| Tracking poller | Shipments with SUCCESS create status | FOR UPDATE SKIP LOCKED on shipments (lastCarrierSyncAt throttle) |
| Admin recovery | Manual trigger | Single-row update |
| Lease recovery | Stale PROCESSING outbox events | Bulk update with cutoff |

### TOCTOU Races

**R-1: Worker retry vs reconciliation**

The cancellation worker retries via outbox (UNKNOWN → PENDING via reconciliation decision). The reconciliation service may be processing the same row. **Race**: reconciliation reads UNKNOWN, worker reads PENDING (just set by reconciliation). Both act on the same shipment.

**Mitigation**: Reconciliation sets `recovery_status = 'RECONCILING'` as a claim marker. The worker should check `recovery_status` before retrying. If RECONCILING, skip.

**R-2: Tracking poller vs reconciliation**

The tracking poller updates `carrier_status_mapped` on the shipment. Reconciliation reads the same status. **Race**: tracking poll overwrites status that reconciliation just set.

**Mitigation**: The tracking poller filters on `carrier_create_status = 'SUCCESS'` and non-terminal `carrier_status_mapped`. It does NOT currently filter on `carrier_cancel_status`. A cancelled/unknown shipment may still be polled. B.3.3.3 should add a filter to exclude shipments with non-null `carrier_cancel_status IN ('UNKNOWN', 'RECONCILIATION_REQUIRED', 'SUCCEEDED')`.

**R-3: Admin recovery vs automated reconciliation**

Admin triggers recovery on a shipment that reconciliation is currently processing. **Race**: admin sets `recovery_status = 'ADMIN_TRIGGERED'`, reconciliation sets `recovery_status = 'RECONCILING'`.

**Mitigation**: The existing pattern handles this — admin sets `ADMIN_TRIGGERED` and calls `reconcileShipment()` directly. The reconciliation cycle skips `ADMIN_TRIGGERED` rows.

**R-4: Duplicate outbox events for the same shipment**

If two `shipping.carrier.cancel` events exist for the same shipment (should not happen due to idempotency, but possible via manual intervention), two workers could call CancelPickup concurrently.

**Mitigation**: The `carrier_cancel_idempotency_key` and the idempotent guard (`carrierCancelStatus === 'SUCCEEDED'` → skip) prevent double execution. The Aramex CancelPickup is expected to be idempotent on PickupGUID.

---

## 11. Process Crash Analysis

| Crash Point | State Before | State After Recovery | Recovery Behavior |
|---|---|---|---|
| **A. Before carrier HTTP request** | IN_PROGRESS, outbox PROCESSING | Lease expires → PENDING | Worker re-claims, retries cancel. Safe — carrier not called. |
| **B. During carrier HTTP request** | IN_PROGRESS, outbox PROCESSING | Lease expires → PENDING | Worker re-claims, retries cancel. **CARRIER MAY HAVE PROCESSED**. Second call may succeed or return "already cancelled." Must handle "already cancelled" as SUCCEEDED. |
| **C. After carrier request reaches provider** | IN_PROGRESS | Same as B. | Same as B. |
| **D. After carrier success, before DB update** | IN_PROGRESS (SUCCEEDED not written) | Lease expires → PENDING | Same as B. Carrier already cancelled. Second call returns "already cancelled." Must interpret as SUCCEEDED. |
| **E. After DB update, before outbox acknowledgement** | SUCCEEDED (written), outbox PROCESSING | Lease expires → PENDING | Worker re-claims, sees `carrierCancelStatus === 'SUCCEEDED'` → idempotent skip. Safe. |
| **F. During reconciliation** | UNKNOWN, recovery RECONCILING | Lease expires → recovery NULL | Next reconciliation cycle re-claims. Safe — reconciliation is idempotent. |

### Critical Insight

Crash points B, C, and D are the **fundamental problem**. The system cannot distinguish "carrier processed the cancellation" from "carrier never received the request" after a transport failure. This is why UNKNOWN + reconciliation is required — the reconciliation phase queries the carrier to determine the actual state.

---

## 12. Retry vs Reconciliation Decision Matrix

| Failure | Retry Directly? | UNKNOWN? | Reconcile? | Reason |
|---|---|---|---|---|
| HTTP 429 (rate limit) | YES | NO | NO | Carrier responded — request not processed. Safe to retry after backoff. |
| HTTP 500 (server error) | YES | NO | NO | Carrier responded with error — request not processed. Safe to retry. |
| HTTP 502/503/504 | YES | NO | NO | Gateway/proxy error — carrier likely not reached. Safe to retry. |
| Timeout (ETIMEDOUT) | **NO** | **YES** | **YES** | Cannot know if carrier processed. Must reconcile. |
| Connection reset (ECONNRESET) | **NO** | **YES** | **YES** | Request may have been fully sent. Must reconcile. |
| Connection refused (ECONNREFUSED) | YES | NO | NO | Carrier definitively not reached. Safe to retry. |
| DNS failure | YES | NO | NO | Carrier definitively not reached. Safe to retry. |
| Aborted request | **NO** | **YES** | **YES** | Request may have been partially sent. Must reconcile. |
| Socket hang up | **NO** | **YES** | **YES** | Connection lost mid-flight. Must reconcile. |
| Auth failure (401) | NO | NO | NO | Terminal — credentials need review. |
| Validation failure | NO | NO | NO | Terminal — request is invalid. |
| Business failure (cancelled=false) | NO | NO | NO | Carrier responded with business error. |
| Circuit breaker OPEN | YES | NO | NO | Carrier not called. Safe to retry later. |
| Process crash during HTTP | **NO** | **YES** | **YES** | Same as timeout — cannot know. |

### Key Distinction

The `isTimeoutError()` method currently matches: `timeout`, `etimedout`, `econnreset`, `econnaborted`, `socket hang up`, `aborted`.

**All of these are INDETERMINATE** — the request may or may not have reached the carrier. All should transition to UNKNOWN, not FAILED.

**Connection refused** (`ECONNREFUSED`) is NOT matched by `isTimeoutError()`. It falls through to the `classifyCarrierError()` path, which treats it as a generic Error → `RetryableCarrierError` → retry. This is **correct** — connection refused means the carrier was definitively not reached.

---

## 13. Interaction With Tracking

### Current Tracking Poller Behavior

The tracking poller (`carrier-tracking-poller.ts`) claims shipments where:
- `carrier_create_status = 'SUCCESS'`
- `carrier_tracking_id IS NOT NULL`
- `carrier_status_mapped NOT IN ('DELIVERED', 'CANCELLED', 'COMPLETED')`
- `last_carrier_sync_at IS NULL OR stale`

**It does NOT check `carrier_cancel_status`.** A shipment with `carrier_cancel_status = 'UNKNOWN'` or `'SUCCEEDED'` will still be polled for tracking if its create status is SUCCESS and tracking ID exists.

### Post-Cancel DELIVERED Problem

If a shipment has `carrier_cancel_status = 'SUCCEEDED'` (carrier confirmed cancellation) but the tracking poller picks up a later `DELIVERED` status from the carrier, the poller will:
1. Update `carrier_status_mapped = 'DELIVERED'`
2. Call `ordersService.processCarrierDelivery(orderId)`
3. `processCarrierDelivery()` checks `TRANSITIONS[order.status]` — if order is CANCELLED, `TRANSITIONS['CANCELLED'] = []`, so `'DELIVERED'` is not allowed → returns false

**The order is protected.** But the shipment shows `carrier_status_mapped = 'DELIVERED'` while `carrier_cancel_status = 'SUCCEEDED'` — a silent divergence with no exception recorded.

### B.3.3.3 Scope Decision (C5)

Should B.3.3.3 add cancel-awareness to the tracking poller, or defer to B.3.3.4?

**Recommendation**: B.3.3.3 should add a **minimal guard** — exclude shipments with `carrier_cancel_status IN ('SUCCEEDED', 'NOT_REQUIRED')` from the tracking poller claim query. The full delivered-after-cancel exception handling belongs in B.3.3.4.

### Can Tracking Provide Cancellation Evidence?

Yes. If the carrier's tracking API returns a status like "Pickup Cancelled" or "Shipment Cancelled," the reconciliation service can use this to resolve UNKNOWN → SUCCEEDED. However, the exact Aramex status codes for cancellation are not documented in the current codebase. **REQUIRES PROVIDER VERIFICATION.**

---

## 14. Interaction With Existing Recovery

### Current Admin Recovery

`POST /v1/carrier/shipments/:id/recover` (carrier-admin.controller.ts:187-268):
- RBAC: `admin:shipping:recovery`
- Recoverable statuses: `['PENDING', 'IN_PROGRESS', 'FAILED', 'RECOVERY_REQUIRED']` on `carrierCreateStatus`
- Sets `recoveryStatus = 'ADMIN_TRIGGERED'`, runs `reconcileShipment()`

**Gap**: Only checks `carrierCreateStatus`. Does NOT check `carrierCancelStatus`. An admin cannot trigger recovery for a shipment stuck in UNKNOWN cancel state.

### Current Recovery Queue

`GET /v1/carrier/recovery/queue` (carrier-admin.controller.ts:279-346):
- Lists shipments with `carrierCreateStatus IN ('RECOVERY_REQUIRED', 'PENDING', 'IN_PROGRESS', 'FAILED')`
- Does NOT include shipments with pending cancel statuses

### Required Extension for B.3.3.3

The recovery endpoint and queue must be extended to include cancel-specific recovery:
- Add `carrierCancelStatus IN ('UNKNOWN', 'RECONCILIATION_REQUIRED')` to the recoverable status check
- Add cancel-specific reconciliation cases to `CarrierReconciliationService`

**This is a bounded extension** — the existing endpoint, RBAC, audit, and tenant isolation are preserved.

---

## 15. Security / Tenant Isolation

| Area | Current State | B.3.3.3 Impact |
|---|---|---|
| Tenant ownership | Shipment → store → org chain (CONFIRMED IN CODE) | No change — reconciliation resolves org from shipment/store |
| Shipment access | RBAC + tenant guard on recovery endpoints | No change — same endpoints extended |
| Store/org isolation | `isTenantPrivileged` + store filter | No change |
| Recovery endpoint | `admin:shipping:recovery` permission | Extended to include cancel states |
| Reconciliation jobs | FOR UPDATE SKIP LOCKED, tenant-scoped | Cancel reconciliation adds same pattern |
| Carrier credentials | Per-org encrypted, decrypted only for outbound call | No change — reconciliation uses same credential chain |
| Provider selection | Shipment's `shippingProviderKey` only | No change — reconciliation uses same provider |
| Pickup identifiers | `carrierPickupId` from shipment row | No change |
| Logs | `toSafeMessage()` redacts credentials | No change |
| Error messages | Safe messages only, no raw headers/credentials | No change |

**No cross-tenant reconciliation is possible.** The reconciliation service resolves the provider from the shipment's `shippingProviderKey`, credentials from the shipment's store → org chain. There is no path for Org A's reconciliation to affect Org B's shipment.

---

## 16. Observability

### Required Observable State

| State | What Should Be Observable |
|---|---|
| UNKNOWN | `carrier_cancel_status = 'UNKNOWN'`, `recovery_status = 'CANCEL_UNKNOWN'` or `'CANCEL_TIMEOUT'`, `carrier_cancel_error_class = 'timeout'` |
| RECONCILIATION_REQUIRED | `carrier_cancel_status = 'RECONCILIATION_REQUIRED'`, `recovery_status = 'CANCEL_RECONCILE'` |
| Reconciliation attempt | `recovery_status = 'RECONCILING'`, `next_reconciliation_at` updated |
| Reconciliation success | `carrier_cancel_status = 'SUCCEEDED'`, `recovery_status = null` |
| Reconciliation failure | `carrier_cancel_status` unchanged, `recovery_status` updated |
| Permanently unresolved | `carrier_cancel_status = 'RECONCILIATION_REQUIRED'`, `next_reconciliation_at` null, admin alert needed |

### Counters (Proposed, Not Yet Implemented)

```
carrier_cancel_unknown_total          — increments when UNKNOWN is set
carrier_cancel_reconciliation_total   — increments per reconciliation attempt
carrier_cancel_reconciled_total       — increments when reconciliation resolves
carrier_cancel_unresolved_total       — increments when reconciliation gives up
```

These are additive, non-blocking, and use the existing `CarrierObservabilityService` in-memory counter pattern.

---

## 17. Business Decisions Required

The following decisions **MUST be locked** before B.3.3.3 implementation:

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| BD-01 | How long UNKNOWN may remain unresolved | (a) Indefinite (b) Time-bounded (e.g., 24h) (c) Attempt-bounded | Time-bounded + attempt-bounded. Default: 24h or 8 reconciliation attempts, then admin escalation. |
| BD-02 | Reconciliation frequency | (a) Same as create (10min) (b) Faster (5min) (c) Slower (30min) | 10min default (match create). Configurable via env var. |
| BD-03 | Maximum reconciliation attempts | (a) 3 (b) 5 (c) 8 (d) Unlimited | 8 (match retry policy max attempts). |
| BD-04 | Does unresolved cancellation block shipment progression? | (a) YES (b) NO | NO — the order is already CANCELLED. The shipment is in a side-channel reconciliation. It does not block other operations. |
| BD-05 | Admin intervention threshold | (a) After max attempts (b) After time bound (c) Both | Both — whichever comes first. |
| BD-06 | Carrier says pickup is cancelled | → SUCCEEDED | Direct resolution. No further action. |
| BD-07 | Carrier says pickup is still scheduled | → FAILED (or PENDING if retry-safe) | If the carrier says the pickup is still active, the original cancel was NOT processed. Transition to FAILED and allow admin retry. |
| BD-08 | Carrier returns unknown/error during reconciliation | → RECONCILIATION_REQUIRED | Defer to next cycle or admin. |
| BD-09 | Can cancellation retry after UNKNOWN? | (a) YES, via reconciliation (b) NO, only reconcile | (a) — reconciliation may determine that retry is safe (e.g., carrier says "not found"). |
| BD-10 | May reconciliation invoke CancelPickup again? | (a) YES (b) NO | (a) — if the carrier says the pickup is still active, reconciliation may re-invoke CancelPickup as the resolution action. |
| BD-11 | How are duplicate cancellation requests prevented? | (a) Idempotency key (b) State guard (c) Both | Both — `carrier_cancel_idempotency_key` + `carrierCancelStatus` guard. |
| BD-12 | Final state after reconciliation exhaustion | (a) FAILED (b) RECONCILIATION_REQUIRED (admin) | (b) — RECONCILIATION_REQUIRED with admin escalation. Never auto-FAIL an uncertain cancellation. |

---

## 18. Proposed Migration

**No new migration is required.** Migration 0049 already provides all necessary columns, indexes, and vocabulary. The `CarrierCancelStatus` type already includes `UNKNOWN` and `RECONCILIATION_REQUIRED`. The recovery tokens are already defined.

If the business lock decisions require additional columns (e.g., `carrier_cancel_reconciliation_attempts`), a migration 0050 would be needed:

| Field | Recommendation |
|---|---|
| Migration number | 0050 (if required) |
| Table | shipments |
| Column | `carrier_cancel_reconciliation_attempts` |
| Type | INTEGER NOT NULL DEFAULT 0 |
| Purpose | Track reconciliation attempt count per cancellation |
| Rollback | DROP COLUMN (safe — no data dependency) |

**However**, the existing `carrier_cancel_retries` column may be sufficient if reconciliation attempts are counted separately from worker retry attempts. This is a design decision for the business lock.

---

## 19. Proposed Test Matrix

### Unit Tests

| Test | Category |
|---|---|
| Timeout → UNKNOWN (not FAILED) | Indeterminate transport failure |
| ECONNRESET → UNKNOWN | Indeterminate transport failure |
| ECONNABORTED → UNKNOWN | Indeterminate transport failure |
| Socket hang up → UNKNOWN | Indeterminate transport failure |
| Aborted → UNKNOWN | Indeterminate transport failure |
| ECONNREFUSED → retryable (not UNKNOWN) | Safe retry |
| DNS failure → retryable (not UNKNOWN) | Safe retry |
| UNKNOWN sets recovery_status = CANCEL_UNKNOWN | State transition |
| UNKNOWN sets recovery_status = CANCEL_TIMEOUT | State transition |
| UNKNOWN sets nextReconciliationAt = NOW() | State transition |
| Reconciliation: UNKNOWN + carrier confirms cancelled → SUCCEEDED | Reconciliation classification |
| Reconciliation: UNKNOWN + carrier confirms active → FAILED | Reconciliation classification |
| Reconciliation: UNKNOWN + carrier timeout → RECONCILIATION_REQUIRED | Reconciliation classification |
| Idempotency: SUCCEEDED → skip | Idempotency |
| Idempotency: NOT_REQUIRED → skip | Idempotency |
| "Already cancelled" business response → SUCCEEDED | Error mapping |
| HTTP 429/500/502/503/504 → retry (not UNKNOWN) | Regression |
| Auth failure → FAILED (not UNKNOWN) | Regression |

### PostgreSQL Tests

| Test | Category |
|---|---|
| Concurrent reconciliation: 2 workers, 1 UNKNOWN → exactly 1 claim | Concurrency |
| Concurrent reconciliation: 10 workers | Concurrency |
| Concurrent reconciliation: 50 workers | Concurrency |
| Concurrent reconciliation: 100 workers | Concurrency |
| Crash recovery: stale RECONCILING lease → re-claim | Lease recovery |
| Duplicate outbox events for same shipment → single effective cancel | Duplicate events |
| Tenant isolation: Org A cannot reconcile Org B's shipment | Tenant isolation |
| Reconciliation vs cancel retry race | Race condition |
| Reconciliation vs tracking poller race | Race condition |

### Carrier HTTP Tests

| Test | Category |
|---|---|
| Timeout during cancelPickup → UNKNOWN | Timeout |
| Connection reset during cancelPickup → UNKNOWN | Connection reset |
| Aborted request → UNKNOWN | Aborted request |
| DNS failure → retryable (not UNKNOWN) | DNS failure |
| Response lost after successful carrier processing → UNKNOWN | Response lost |

### End-to-End Tests

| Test | Category |
|---|---|
| Cancel → UNKNOWN → reconciliation → SUCCEEDED | Happy path |
| Cancel → UNKNOWN → reconciliation → FAILED | Carrier confirms active |
| Cancel → UNKNOWN → reconciliation → unresolved → admin | Exhaustion |
| Cancel → UNKNOWN → carrier later DELIVERED → exception | Delivered-after-cancel |

---

## 20. Scope Boundary

### B.3.3.3 WILL Implement

- Timeout/indeterminate → UNKNOWN state transition (upgrade from current FAILED)
- Recovery status token assignment (CANCEL_UNKNOWN, CANCEL_TIMEOUT)
- `nextReconciliationAt` scheduling for UNKNOWN shipments
- Cancel-aware reconciliation claim query in `CarrierReconciliationService`
- Reconciliation cases for UNKNOWN: query carrier, resolve to SUCCEEDED/FAILED/RECONCILIATION_REQUIRED
- "Already cancelled" business response interpretation as SUCCEEDED
- Minimal tracking poller guard (exclude SUCCEEDED/NOT_REQUIRED cancel shipments)
- Admin recovery extension (accept cancel states in recoverable status check)

### B.3.3.3 WILL NOT Implement (Deferred)

| Deferred To | Scope |
|---|---|
| B.3.3.4 | Full delivered-after-cancel exception handling (shipment exception events, outbox `shipment.reconciliation_required`) |
| B.3.3.4 | Full tracking poller cancel-awareness (suppress progression, record post-cancel events as reconciliation evidence) |
| B.3.3.5 | Additional concurrency hardening (partial unique index on outbox for at-most-one-pending-cancel) |
| Future | New provider capability `getPickupStatus()` |
| Future | HTTP-date Retry-After parsing |
| Out of scope | Returns, refunds, payment, disputes, notifications |
| Out of scope | Unrelated tracking redesign |
| Out of scope | New carrier integrations |

---

## 21. Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | Aramex CancelPickup on already-cancelled GUID returns an ambiguous error that cannot be distinguished from a new failure | **CRITICAL** | Requires provider verification. If ambiguous, reconciliation cannot safely resolve UNKNOWN and must defer to admin. |
| R-2 | Process crash between UNKNOWN write and outbox event update leaves inconsistent state | **HIGH** | Mitigated by lease recovery — the outbox event remains PROCESSING, lease expires, re-claimed. The UNKNOWN status on the shipment is the authoritative signal. |
| R-3 | Reconciliation service and cancel worker both attempt to resolve the same shipment simultaneously | **HIGH** | Mitigated by `recovery_status = 'RECONCILING'` claim marker + FOR UPDATE SKIP LOCKED. |
| R-4 | Tracking poller overwrites reconciliation state with stale carrier data | **MEDIUM** | Mitigated by the proposed minimal tracking poller guard. |
| R-5 | `isTimeoutError()` substring matching is fragile — a carrier error message containing "timeout" could be misclassified | **MEDIUM** | Current risk is low because `isTimeoutError()` is only called on caught exceptions, not carrier error messages. Carrier errors go through `classifyCarrierError()`. |
| R-6 | No `getPickupStatus()` provider method limits reconciliation to indirect signals | **MEDIUM** | Acceptable for B.3.3.3. Reconciliation uses tracking + re-cancel interpretation. `getPickupStatus()` can be added in a later milestone if needed. |
| R-7 | Reconciliation loop: UNKNOWN → reconciliation → re-cancel → timeout → UNKNOWN → reconciliation → ... | **LOW** | Mitigated by reconciliation attempt budget (BD-03). After max attempts, escalate to admin. |

---

## 22. Final Recommendation

### Verdict: **GO WITH CONDITIONS**

### Blockers

None. The infrastructure is proven, the schema is sufficient, and the state vocabulary is already defined.

### Required Business Decisions

All 12 decisions in §17 (BD-01 through BD-12) must be locked before implementation. The most critical are:

- **BD-01/BD-03**: Time/attempt bounds for UNKNOWN resolution
- **BD-06/BD-07**: How to interpret carrier responses during reconciliation
- **BD-09/BD-10**: Whether reconciliation may re-invoke CancelPickup

### Required Architecture Decisions

- **C4**: Provider capability for reconciliation (recommend: use existing `getTrackingInfo()` + re-cancel interpretation)
- **C5**: Tracking poller interaction scope (recommend: minimal guard in B.3.3.3)

### Migration Requirement

**No new migration required.** All schema elements exist in migration 0049.

### Provider Capability Requirement

**No new provider method required.** Existing `cancelPickup()` and `getTrackingInfo()` are sufficient for initial reconciliation. A `getPickupStatus()` method may be added in a later milestone if reconciliation accuracy requires it.

### Test Requirements

- 18+ unit tests (indeterminate failures, state transitions, reconciliation classification, idempotency, error mapping, regression)
- 9+ PostgreSQL integration tests (concurrency 2/10/50/100, crash recovery, lease recovery, duplicate events, tenant isolation, race conditions)
- 5+ carrier HTTP tests (timeout, connection reset, aborted, DNS, response lost)
- 4+ end-to-end tests (full lifecycle paths)

---

**M7.3-B.3.3.3 — PRE-IMPLEMENTATION ARCHITECTURE AUDIT COMPLETE**

**Verdict: GO WITH CONDITIONS**

*No production code was modified during this audit.*
