# SCS-M7.3-B.3.3.2 — PRE-IMPLEMENTATION ARCHITECTURE AUDIT

**Carrier Cancellation Retry Semantics**

| Field | Value |
|---|---|
| Milestone | M7.3-B.3.3.2 |
| Predecessor | M7.3-B.3.3.1 — CLOSED / PASS WITH CONDITIONS |
| Task type | READ-ONLY architecture audit — NO production code changes |
| Date | 2026-10-01 |
| Branch | develop |
| HEAD | 2814107 |

---

## 1. Executive Summary

This audit determines the safest architecture for adding **carrier cancellation retry semantics** to the existing B.3.3.1 cancellation execution foundation.

**Key findings:**

1. The existing `CarrierRetryPolicy` and `handleFailure()` outbox retry path are **directly reusable** for cancellation retry with minimal adaptation.
2. The existing `carrier_cancel_retries` column (B.3.3.1, migration 0049) is **currently unused** — it was provisioned for this milestone.
3. **No new migration is required.** The existing schema supports all retry state: `carrier_cancel_status` (VARCHAR(24) accepts RETRY), `carrier_cancel_retries` (INTEGER DEFAULT 0), `carrier_cancel_error_class` (VARCHAR(40)), and the partial index already includes `'RETRY'` in its WHERE predicate.
4. The recommended approach is **Option A (generic outbox retry)** — re-throw retryable errors from `handleCancel()` and let the existing `handleFailure()` / outbox retry mechanism manage backoff, dead-letter, and lease recovery. This is the same pattern `handleCreate()` already uses.
5. The Retry-After header is **not currently parsed** by the HTTP client — a gap that must be closed in B.3.3.2 for rate-limit-aware cancellation retry.
6. The circuit breaker is **process-local** (in-memory) — horizontal scaling means each worker has independent breaker state. This is acceptable for B.3.3.2 but noted for future improvement.

**Verdict: GO WITH CONDITIONS**

Conditions: 12 business decisions must be locked before implementation (see §18).

---

## 2. Baseline

| Item | Value |
|---|---|
| Branch | develop |
| HEAD | 2814107 |
| Node | v26.4.0 |
| pnpm | 9.15.9 |
| TypeScript | 5.9.3 |
| Predecessor status | B.3.3.1 CLOSED / PASS WITH CONDITIONS |
| Predecessor conditions | C1 (PG tests — infra unavailable), C2 (webhook test flake — pre-existing) |
| Migration 0049 | Applied, idempotent, additive-only |

**Git scope:** Clean. Only B.3.3.1 production files modified (`orders.service.ts`, `shipping-carrier.worker.ts`).

---

## 3. Current Cancellation Architecture (B.3.3.1)

### 3.1 State Machine

```
NULL
  ↓  (cancelOrder() creates outbox event + sets PENDING)
PENDING
  ↓  (worker claims via FOR UPDATE SKIP LOCKED)
IN_PROGRESS
  ├── SUCCEEDED       (carrier confirmed cancellation)
  ├── FAILED          (all errors — B.3.3.1 marks everything FAILED)
  └── NOT_REQUIRED    (manual provider / unsupported capability)
```

### 3.2 Outbox Event

- Event type: `shipping.carrier.cancel`
- Aggregate ID: shipment UUID
- Metadata: `{ storeId }` for tenant verification
- Published atomically inside `cancelOrder()` transaction via `this.outbox.publish(..., tx)`

### 3.3 handleCancel() Flow (21 steps)

1. Load shipment by aggregateId
2. Tenant verification (event storeId === shipment storeId)
3. Idempotent guard (SUCCEEDED / NOT_REQUIRED → skip)
4. Resolve provider
5. Manual provider → NOT_REQUIRED
6. Capability check → NOT_REQUIRED
7. carrierPickupId check → FAILED
8. Circuit breaker check (OPEN → throw RetryableCarrierError)
9. PENDING → IN_PROGRESS
10. Build CancelPickupRequest
11. Call provider.cancelPickup()
12. Unsupported result → NOT_REQUIRED
13. Success → SUCCEEDED
14. Business failure → FAILED
15. Catch block: timeout → FAILED (with `[TIMEOUT — B3.3.3 will set UNKNOWN]` marker)
16. Catch block: all other errors → FAILED

**B.3.3.1 scope:** ALL errors → FAILED. No retry, no UNKNOWN, no reconciliation.

---

## 4. Existing Retry Infrastructure

### 4.1 CarrierRetryPolicy

| Property | Value |
|---|---|
| File | `carrier-retry-policy.ts` |
| Max attempts | 8 (configurable via `CARRIER_RETRY_MAX_ATTEMPTS`) |
| Initial delay | 30,000ms (configurable via `CARRIER_RETRY_INITIAL_DELAY_MS`) |
| Max delay | 3,600,000ms / 1h (configurable via `CARRIER_RETRY_MAX_DELAY_MS`) |
| Formula | `initialDelay * 2^(attempt-1)`, capped at maxDelay |
| Jitter | ±25% uniform: `capped + capped * 0.25 * (Math.random() * 2 - 1)` |
| Rate-limit delay | `min(retryAfterSeconds * 1000, maxDelay)` if Retry-After present; else 2× normal backoff |
| Attempt counter | **1-based** (the `attempt` parameter is the attempt that just failed) |
| Determinism | Non-deterministic (jitter uses `Math.random()`) |
| Terminal errors | No retry, `isFinal: true`, `nextAttemptAt: null` |
| Budget exhaustion | Returns `decision: 'terminal'`, `isFinal: true`, message includes `(max attempts reached)` |

**Test coverage:** 16 unit tests in `carrier-retry-policy.spec.ts` covering classification, backoff, jitter, rate-limit, and budget exhaustion.

### 4.2 Outbox Retry Mechanism (handleFailure)

```
processEvent()
  ↓ (error thrown)
handleFailure(eventId, event, err)
  ↓
retryPolicy.classify(err, attempts)
  ↓
  ├─ isFinal → DEAD_LETTER
  └─ !isFinal → PENDING + nextAttemptAt
```

- Uses `outbox_events.attempts` (1-based, incremented on each failure)
- Sets `status: 'PENDING'` with `nextAttemptAt` for delayed retry
- Sets `status: 'DEAD_LETTER'` when budget exhausted
- Clears lease (`lockedAt: null, lockedBy: null`)
- Error message stored: `classification.safeMessage` (credential-safe)

**Outbox status CHECK constraint** (migration 0045):
```sql
CHECK (status IN ('PENDING','PROCESSING','DISPATCHED','FAILED','DEAD_LETTER'))
```

### 4.3 Lease Recovery

- `recoverStaleLeases()` runs at the start of each poll cycle
- Resets PROCESSING events with `locked_at < NOW() - 60s` back to PENDING
- Increments `attempts` counter on recovery
- Sets `lastError: 'Lease expired — worker crash detected'`

### 4.4 Atomic Claiming

```sql
UPDATE outbox_events SET status = 'PROCESSING', ...
WHERE id IN (
  SELECT id FROM outbox_events
  WHERE status = 'PENDING'
    AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
    AND event_type LIKE 'shipping.carrier.%'
  ORDER BY created_at
  LIMIT 10
  FOR UPDATE SKIP LOCKED
)
```

### 4.5 Reusability Assessment

| Mechanism | Reusable for cancel? | Adaptation required |
|---|---|---|
| `CarrierRetryPolicy.classify()` | YES — direct reuse | None. Already classifies all carrier errors |
| `handleFailure()` outbox retry | YES — direct reuse | None. Already manages PENDING/DEAD_LETTER transitions |
| `FOR UPDATE SKIP LOCKED` claim | YES — already filters `shipping.carrier.%` | None. Cancel events are already claimed |
| Lease recovery | YES — already resets PROCESSING → PENDING | None. Cancel events in PROCESSING are recovered |
| `nextAttemptAt` delayed retry | YES — already respected by claim query | None. Already part of the claim WHERE clause |
| Circuit breaker | YES — already checked in handleCancel() | See §12 for retry interaction |
| `carrierCancelRetries` column | YES — provisioned in 0049, currently unused | Increment in handleCancel() retry path |

---

## 5. Error Classification

### 5.1 Error Hierarchy (carrier-errors.ts)

```
CarrierError (base)
├── RetryableCarrierError       → decision: 'retry'
├── RateLimitCarrierError       → decision: 'backoff'
├── NonRetryableCarrierError    → decision: 'terminal'
├── AuthenticationCarrierError  → decision: 'terminal'
├── ValidationCarrierError      → decision: 'terminal'
└── UnsupportedCarrierOperationError → decision: 'unsupported'
```

### 5.2 HTTP Status → Error Mapping (carrier-http-client.ts)

| HTTP Status | Error Class | Decision |
|---|---|---|
| 400 | ValidationCarrierError | terminal |
| 401 | AuthenticationCarrierError | terminal |
| 403 | AuthenticationCarrierError | terminal |
| 404 | NonRetryableCarrierError | terminal |
| 422 | ValidationCarrierError | terminal |
| 429 | RateLimitCarrierError | backoff |
| 500 | RetryableCarrierError | retry |
| 502 | RetryableCarrierError | retry |
| 503 | RetryableCarrierError | retry |
| 504 | RetryableCarrierError | retry |
| Other 4xx | NonRetryableCarrierError | terminal |
| Other 5xx | RetryableCarrierError | retry |

### 5.3 Complete Error Classification for Cancellation Retry

| Error | Retry? | Reason | Target state |
|---|---|---|---|
| 401 | NO | Credential problem — retrying won't help | FAILED |
| 403 | NO | Authorization problem — retrying won't help | FAILED |
| 404 | NO | Pickup not found — won't appear on retry | FAILED |
| 429 | YES | Rate limited — retry after backoff/Retry-After | RETRY (via outbox PENDING) |
| 500 | YES | Transient server error | RETRY |
| 502 | YES | Transient gateway error | RETRY |
| 503 | YES | Transient service unavailable | RETRY |
| 504 | YES | Transient gateway timeout | RETRY |
| timeout | DEFERRED | B.3.3.3 — indeterminate outcome | FAILED (B.3.3.1 marker) |
| connection reset | DEFERRED | B.3.3.3 — indeterminate outcome | FAILED (B.3.3.1 marker) |
| malformed response | NO | Carrier bug — retrying same request won't help | FAILED |
| business failure | NO | Carrier said "no" deterministically | FAILED |
| validation | NO | Bad input — retrying won't help | FAILED |
| authentication | NO | Credential problem | FAILED |
| circuit breaker open | YES | Provider-level backoff signal | RETRY (via re-throw) |
| DNS failure | DEFERRED | B.3.3.3 — indeterminate (may be transient) | FAILED (B.3.3.1 marker) |
| unsupported operation | NO | Provider doesn't support cancel | NOT_REQUIRED |

### 5.4 Critical Distinction: Retryable-Determinate vs. Indeterminate

**Retryable-determinate failure (B.3.3.2 scope):**
The carrier definitively rejected the request (503, 429, 500). We know the cancel did NOT execute. Retry is safe because the carrier state is known.

**Indeterminate carrier outcome (B.3.3.3 scope):**
Timeout, connection reset, DNS failure. We do NOT know if the carrier processed the cancel. Blind retry could double-cancel. These require reconciliation (UNKNOWN state + carrier status query), not simple retry.

B.3.3.2 must NOT implement UNKNOWN semantics.

---

## 6. Retry-After Analysis

### 6.1 Current State

| Component | Retry-After support |
|---|---|
| `RateLimitCarrierError` | Has `retryAfterSeconds` field |
| `CarrierRetryPolicy.calculateDelay()` | Reads `err.retryAfterSeconds` and uses it as delay |
| `CarrierHttpClient.classifyHttpStatus()` | Creates `RateLimitCarrierError` on 429 **without** parsing the header |
| Aramex provider | Does not parse Retry-After |

### 6.2 Gap

The HTTP client creates `RateLimitCarrierError` on HTTP 429 but **never reads the `Retry-After` response header**. The `retryAfterSeconds` field exists on the error class but is always `undefined` in practice.

### 6.3 Required Adaptation for B.3.3.2

The HTTP client must be enhanced to:
1. Read `Retry-After` header from 429 responses
2. Parse seconds format (integer)
3. Parse HTTP-date format (optional — lower priority)
4. Handle malformed values safely (ignore, don't crash)
5. Cap at `maxDelayMs` (already done by `CarrierRetryPolicy`)
6. Set `retryAfterSeconds` on the `RateLimitCarrierError`

### 6.4 Safety Assessment

- The retry policy already caps Retry-After at `maxDelayMs` (1h default)
- Minimum delay: the policy's normal backoff for attempt 1 is 30s — Retry-After values below this are respected as-is (could be 1s)
- No provider-specific limits exist
- Malformed values: must be handled by the parser (return undefined → fall through to 2× backoff)

---

## 7. Retry Policy Analysis

### 7.1 CarrierRetryPolicy Configuration

| Parameter | Default | Env var | Cancel-specific override? |
|---|---|---|---|
| Max attempts | 8 | `CARRIER_RETRY_MAX_ATTEMPTS` | No — reuse as-is |
| Initial delay | 30s | `CARRIER_RETRY_INITIAL_DELAY_MS` | No — reuse as-is |
| Max delay | 1h | `CARRIER_RETRY_MAX_DELAY_MS` | No — reuse as-is |
| Jitter | ±25% | N/A | No — reuse as-is |

### 7.2 carrierCancelRetries Semantics

**Recommendation:** `carrierCancelRetries` counts **retries after the first attempt** (0-based retry counter).

**Rationale:**
- The outbox `attempts` column counts total attempts (1-based)
- `carrierCancelRetries` is a shipment-level sidecar that records how many times the cancel was retried
- On first attempt: `carrierCancelRetries = 0`, outbox `attempts = 1`
- On first retry: `carrierCancelRetries = 1`, outbox `attempts = 2`
- This mirrors `carrierCreateRetries` behavior (incremented after first failure)

### 7.3 Interaction with Outbox attempts

The outbox `attempts` column is the authoritative retry counter. `carrierCancelRetries` is a **denormalized copy** on the shipment row for observability and admin queries without joining to outbox_events.

Both must be incremented atomically in the same handleCancel() execution.

---

## 8. Retry Budget Analysis

### 8.1 Existing Field

| Column | Type | Default | Currently used? |
|---|---|---|---|
| `carrier_cancel_retries` | INTEGER NOT NULL | 0 | **NO** — provisioned in 0049, never written by B.3.3.1 |

### 8.2 Budget Source

The retry budget is governed by `CarrierRetryPolicy.maxAttempts` (default 8). When `attempt >= maxAttempts`, `isFinal = true` and `handleFailure()` sets the outbox event to `DEAD_LETTER`.

### 8.3 Additional Fields Required

**None.** The existing schema is sufficient:
- `carrier_cancel_status` VARCHAR(24) — accepts RETRY (≤24 chars)
- `carrier_cancel_retries` INTEGER — counts retries
- `carrier_cancel_error` TEXT — stores last error
- `carrier_cancel_error_class` VARCHAR(40) — stores classification
- `carrier_cancel_attempted_at` TIMESTAMPTZ — last attempt timestamp
- Outbox `next_attempt_at` — schedules the retry
- Outbox `attempts` — authoritative attempt counter

### 8.4 Migration Decision

**No migration required.** All columns exist. The partial index `idx_shipments_carrier_cancel` already includes `'RETRY'` in its WHERE predicate (line 44 of migration 0049).

---

## 9. Outbox Interaction

### 9.1 Option A: Generic Outbox Retry (RECOMMENDED)

```
handleCancel()
  ↓ (retryable error)
throw err  (re-throw)
  ↓
processEvent() catch block
  ↓
handleFailure(eventId, event, err)
  ↓
retryPolicy.classify(err, attempts)
  ↓
  ├─ isFinal → outbox status = DEAD_LETTER
  └─ !isFinal → outbox status = PENDING + nextAttemptAt
  ↓
(lease cleared, event re-claimable after nextAttemptAt)
```

**Advantages:**
- Zero new infrastructure — reuses existing `handleFailure()`, `claimEvents()`, `recoverStaleLeases()`
- Same pattern as `handleCreate()` (re-throw retryable errors)
- Crash-safe: if process dies after re-throw, lease recovery resets the event
- Dead-letter is automatic via outbox `attempts` counter
- `FOR UPDATE SKIP LOCKED` prevents duplicate processing
- `nextAttemptAt` is already respected by the claim query

**Disadvantages:**
- The outbox event is the retry authority, not the shipment row
- If the shipment row says RETRY but the outbox event says DISPATCHED, there's a consistency gap (mitigated by the fact that handleCancel() updates the shipment BEFORE re-throwing)

### 9.2 Option B: Cancellation-Specific Retry

```
handleCancel()
  ↓ (retryable error)
carrierCancelStatus = RETRY
nextAttemptAt = calculateDelay()
carrierCancelRetries++
  ↓
Create NEW outbox event for retry
  ↓
Mark current event DISPATCHED
```

**Advantages:**
- Full control over retry semantics
- Shipment row is the authority

**Disadvantages:**
- Duplicates outbox retry infrastructure
- New outbox event creation is not atomic with status transition
- Crash between status update and new event creation → orphaned RETRY state
- Must implement own lease recovery for RETRY state
- Breaks the existing pattern

### 9.3 Recommendation: Option A (Generic Outbox Retry)

**Rationale:**
1. `handleCreate()` already uses this exact pattern successfully
2. The existing infrastructure (claim, lease, recovery, dead-letter) works without modification
3. The shipment row's `carrierCancelStatus` is updated to reflect the outcome BEFORE the error is re-thrown
4. Crash safety is inherited from the outbox mechanism
5. No new code paths for retry scheduling

**Implementation pattern:**
```
handleCancel() catch block:
  ├─ timeout → FAILED (B.3.3.1 marker) → return (no re-throw)
  ├─ terminal/unsupported → FAILED → return (no re-throw)
  └─ retryable → update carrierCancelRetries++, set error → throw err
      ↓
  handleFailure() manages outbox retry/backoff/dead-letter
```

**Important:** The `carrierCancelStatus` on the shipment row is NOT set to RETRY in Option A. The retry state lives in the outbox event (PENDING + nextAttemptAt). The shipment row shows the last known carrier outcome (e.g., FAILED with error class 'retry' and incremented retries). This is identical to how `handleCreate()` works — the shipment shows PENDING/FAILED while the outbox event manages retry timing.

---

## 10. Crash Safety

### Scenario A: Carrier returns 503 → process crashes before state update

**Recovery:**
- Outbox event still in PROCESSING with a lease
- Lease expires (60s) → `recoverStaleLeases()` resets to PENDING
- `attempts` incremented by recovery
- Next poll claims the event, handleCancel() runs again
- Carrier returns 503 again → retryable → re-throw → handleFailure schedules retry

**Outcome:** SAFE. No data loss. Retry proceeds normally.

### Scenario B: Retry state persisted → process crashes before re-throw

**Recovery:**
- Shipment row updated with `carrierCancelRetries++` and error info
- Outbox event still in PROCESSING
- Lease expires → recovery resets to PENDING
- Next poll claims event, handleCancel() runs
- Idempotent guard: carrierCancelStatus is not SUCCEEDED/NOT_REQUIRED → proceeds
- Carrier call succeeds or fails → normal path

**Outcome:** SAFE. The retry counter may be incremented one extra time (harmless — it's a denormalized counter). The outbox `attempts` counter is authoritative.

### Scenario C: Two workers wake simultaneously for the same retry

**Recovery:**
- `FOR UPDATE SKIP LOCKED` ensures only ONE worker claims the event
- The other worker skips it (SKIP LOCKED)
- No duplicate carrier calls

**Outcome:** SAFE. Guaranteed by PostgreSQL row-level locking.

### Scenario D: Retry attempt succeeds → process crashes before SUCCEEDED update

**Recovery:**
- Outbox event in PROCESSING, lease expires
- Recovery resets to PENDING
- Next poll claims event, handleCancel() runs
- Idempotent guard: carrierCancelStatus is not SUCCEEDED (crash happened before update)
- Carrier cancelPickup() called again with same idempotency key
- Carrier returns success (idempotent) or "already cancelled" → SUCCEEDED

**Outcome:** SAFE. Carrier-side idempotency key (`carrier-cancel:<shipmentId>`) prevents double cancellation. The second call is a no-op at the carrier.

### Scenario E: Retry budget exhausted → process crashes during DEAD_LETTER transition

**Recovery:**
- Outbox event in PROCESSING, lease expires
- Recovery resets to PENDING with `attempts++`
- Next poll claims event, handleCancel() runs
- Carrier call fails again → handleFailure: `attempts >= maxAttempts` → DEAD_LETTER

**Outcome:** SAFE. The event eventually reaches DEAD_LETTER through normal retry cycle. The crash just adds one more attempt.

### Scenario F: Cancellation retry vs. carrier webhook

**Implication for B.3.3.5:**
- A carrier webhook indicating "pickup cancelled" could arrive while retry is in progress
- B.3.3.5 must handle the race: if webhook confirms cancellation, retry should be short-circuited
- B.3.3.2 does NOT modify webhook handling. The idempotent guard in handleCancel() provides partial protection (SUCCEEDED → skip)
- Full webhook reconciliation is B.3.3.5 scope

---

## 11. Concurrency

### 11.1 Locking Strategy

**Primary guarantee:** At most one effective carrier cancellation attempt for a shipment at a time.

**How guaranteed:**
1. **Outbox level:** `FOR UPDATE SKIP LOCKED` on `claimEvents()` — only one worker claims a given outbox event
2. **Shipment level:** The `carrierCancelStatus` transition to `IN_PROGRESS` uses an unconditional UPDATE (no WHERE predicate on status). If two workers somehow ran handleCancel() simultaneously for the same shipment, both would set IN_PROGRESS. However, this is prevented by the outbox-level lock.
3. **Carrier level:** The idempotency key `carrier-cancel:<shipmentId>` prevents double cancellation at the carrier.

### 11.2 Retry Counter Atomicity

`carrierCancelRetries` is incremented with a simple read-then-write:
```typescript
carrierCancelRetries: (shipment.carrierCancelRetries || 0) + 1,
```

This is safe because:
- Only one worker processes the event at a time (FOR UPDATE SKIP LOCKED)
- The shipment row is read at the start of handleCancel()
- The update happens before the error is re-thrown

### 11.3 Multiple Retries for Same Shipment

Each retry cycle:
1. Outbox event transitions PENDING → PROCESSING → (failure) → PENDING/DEAD_LETTER
2. Shipment `carrierCancelRetries` increments
3. `nextAttemptAt` schedules the next attempt
4. The claim query respects `nextAttemptAt <= NOW()`

No special handling needed — the existing outbox mechanism handles this correctly.

---

## 12. Circuit Breaker

### 12.1 Current Behavior

- Process-local in-memory `Map<string, BreakerEntry>`
- Per-provider + environment scope (e.g., `aramex:production`)
- States: CLOSED → OPEN (after 5 consecutive failures) → HALF_OPEN (after 60s cooldown)
- OPEN: `canRequest()` returns false → handleCancel() throws RetryableCarrierError

### 12.2 Circuit Breaker Open → Retry?

**Current B.3.3.1 behavior:** Throws `RetryableCarrierError` which is caught by the catch-all and marked FAILED.

**B.3.3.2 recommended behavior:** Re-throw the `RetryableCarrierError` so `handleFailure()` schedules an outbox retry. The breaker is process-local — another worker on another instance might have a CLOSED breaker.

**Should it consume retry budget?** YES. Circuit breaker open is a transient signal. If the breaker never closes after 8 attempts, the event reaches DEAD_LETTER. This is correct behavior.

**Should it consume a carrier attempt?** NO. The breaker prevented the carrier call — no carrier resources were consumed. However, the outbox `attempts` counter still increments (it counts worker attempts, not carrier calls). This is acceptable.

### 12.3 Horizontal Worker Implications

- Each worker process has its own circuit breaker state
- Worker A's failures don't affect Worker B's breaker
- This means a retry on Worker B might proceed even if Worker A's breaker is OPEN
- This is acceptable: the carrier might have recovered, and the breaker on Worker B will track independently
- Future improvement: shared breaker via Redis. Not in B.3.3.2 scope.

---

## 13. Dead-Letter Semantics

### 13.1 Final State After Budget Exhaustion

When `handleFailure()` determines `isFinal = true`:
- Outbox event → `DEAD_LETTER`
- Shipment `carrierCancelStatus` → remains at whatever it was set to in the last handleCancel() call (typically the error-updated state)

### 13.2 Separate DEAD_LETTER State for Cancellation?

**NO.** The canonical final state for cancellation after retry exhaustion remains `FAILED`.

**Rationale:**
- The outbox event already carries `DEAD_LETTER` status — this is the dead-letter signal
- Adding a separate `DEAD_LETTER` value to `carrierCancelStatus` would duplicate information
- Admin recovery queries can join `shipments` with `outbox_events` to find dead-lettered cancellations
- The `carrierCancelError` field records the terminal error message

### 13.3 Recording Budget Exhaustion

The `carrierCancelError` field is updated with the terminal error message including `(max attempts reached)` from the retry policy. The `carrierCancelRetries` field shows the final retry count.

No new schema needed — the existing fields capture all required information.

---

## 14. Migration Decision

### Decision: A. No migration required

**Justification:**

| Column | Exists? | Supports retry? |
|---|---|---|
| `carrier_cancel_status` VARCHAR(24) | YES (0049) | YES — RETRY ≤ 24 chars |
| `carrier_cancel_retries` INTEGER DEFAULT 0 | YES (0049) | YES — currently unused |
| `carrier_cancel_error` TEXT | YES (0049) | YES — stores last error |
| `carrier_cancel_error_class` VARCHAR(40) | YES (0049) | YES — stores 'retry'/'backoff'/'terminal' |
| `carrier_cancel_attempted_at` TIMESTAMPTZ | YES (0049) | YES — last attempt timestamp |
| `carrier_cancel_idempotency_key` VARCHAR(120) | YES (0049) | YES — already set in handleCancel() |
| Partial index `idx_shipments_carrier_cancel` | YES (0049) | YES — includes 'RETRY' in WHERE |

**Retry-After header parsing** requires a code change in `carrier-http-client.ts`, not a migration.

---

## 15. Security

### 15.1 Tenant Isolation

- handleCancel() already verifies `event.storeId === shipment.storeId` (line 472-478)
- Retry does not change tenant context — the outbox event retains its original `storeId` metadata
- No cross-tenant retry possible: the claim query does not filter by tenant, but the handler verifies on every execution

### 15.2 Credential Safety

- `classifyCarrierError()` → `toSafeMessage()` never includes credentials
- `carrierCancelError` stores only `safeMessage` (redacted)
- Retry path uses the same `toSafeMessage()` path

### 15.3 Carrier Response Safety

- No carrier response bodies are persisted
- Only error class names and safe messages are stored
- Retry does not log or persist additional carrier data

### 15.4 SSRF Protections

- Unchanged — the HTTP client uses `redirect: 'error'` (no redirect following)
- Provider URLs come from configuration, not user input

### 15.5 Retry Metadata Safety

- `carrierCancelRetries` is an integer — no leakage risk
- `carrierCancelErrorClass` is a fixed vocabulary string
- `nextAttemptAt` is a timestamp — no sensitive data

---

## 16. Test Strategy

### 16.1 Unit Tests

| Test | Description |
|---|---|
| Retryable 429 | RateLimitCarrierError → re-throw, retry counter incremented |
| Retryable 500 | RetryableCarrierError → re-throw, retry counter incremented |
| Retryable 502 | RetryableCarrierError → re-throw |
| Retryable 503 | RetryableCarrierError → re-throw |
| Retryable 504 | RetryableCarrierError → re-throw |
| Retry-After respected | RateLimitCarrierError with retryAfterSeconds → delay matches |
| Exponential backoff | Verify delay progression: 30s, 60s, 120s, 240s... |
| Jitter bounds | Verify ±25% jitter stays within bounds |
| Retry counter increment | carrierCancelRetries increments on each retry |
| Retry budget exhaustion | attempt >= maxAttempts → FAILED, no re-throw |
| Terminal 401 no retry | AuthenticationCarrierError → FAILED, no re-throw |
| Terminal 403 no retry | AuthenticationCarrierError → FAILED, no re-throw |
| Terminal 404 no retry | NonRetryableCarrierError → FAILED, no re-throw |
| Terminal validation no retry | ValidationCarrierError → FAILED, no re-throw |
| Circuit breaker open retry | OPEN breaker → RetryableCarrierError → re-throw |
| Budget exhaustion terminal | 8th attempt failure → FAILED (final) |
| Idempotency guard retry | RETRY state re-enters handleCancel() correctly |
| Timeout still FAILED | Timeout → FAILED with marker, no re-throw (B.3.3.1 behavior preserved) |

### 16.2 PostgreSQL Integration Tests

| Test | Description |
|---|---|
| Retry state persistence | carrierCancelRetries persisted after retry |
| Retry counter atomicity | Concurrent increments don't lose counts |
| Concurrent retry workers | 2/10/50/100 workers → only 1 processes the retry |
| One effective carrier call | No duplicate carrier calls per retry cycle |
| Retry scheduling | nextAttemptAt respected — event not claimed before time |
| Crash/recovery | PROCESSING → lease expiry → PENDING → re-claim |
| Budget exhaustion | 8 failures → DEAD_LETTER on outbox event |
| Duplicate outbox event | Two cancel events for same shipment → idempotent handling |
| Tenant isolation | Retry event with wrong storeId → rejected |

### 16.3 Concurrency Tests

| Workers | Description |
|---|---|
| 2 workers | Basic concurrency — one claims, one skips |
| 10 workers | Moderate concurrency — no double processing |
| 50 workers | High concurrency — FOR UPDATE SKIP LOCKED holds |
| 100 workers | Stress — exactly one effective attempt per cycle |

---

## 17. Deferred Scope

### B.3.3.3 — Indeterminate Outcome Reconciliation

- UNKNOWN state
- Timeout → UNKNOWN (replaces current FAILED marker)
- Connection reset → UNKNOWN
- DNS failure → UNKNOWN
- Carrier status query after uncertain result
- `recovery_status` tokens: CANCEL_UNKNOWN, CANCEL_TIMEOUT

### B.3.3.4 — Cancellation Reconciliation

- Periodic reconciliation of stuck cancellations
- Carrier state query for IN_PROGRESS/RETRY cancellations
- `recovery_status` tokens: CANCEL_RECONCILE

### B.3.3.5 — Delivered-After-Cancel

- Tracking poller cancel-awareness
- Webhook cancel-state handling
- `exceptionStatus` / `CARRIER_DELIVERED_AFTER_CANCEL`
- Admin recovery endpoints for stuck cancellations

**Confirmation:** This audit implements NONE of the above. The timeout branch in handleCancel() retains the B.3.3.1 marker `[TIMEOUT — B3.3.3 will set UNKNOWN]` and does NOT change its behavior.

---

## 18. Business Decisions Required

The following decisions must be locked before implementation. Where previous architecture documents have already locked a value, the existing decision is cited.

| # | Decision | Recommendation | Source |
|---|---|---|---|
| 1 | Max cancellation retry attempts | 8 (reuse `CARRIER_RETRY_MAX_ATTEMPTS`) | Same as create — already configurable |
| 2 | Backoff base | 30s (reuse `CARRIER_RETRY_INITIAL_DELAY_MS`) | Same as create |
| 3 | Backoff maximum | 1h (reuse `CARRIER_RETRY_MAX_DELAY_MS`) | Same as create |
| 4 | Jitter range | ±25% uniform | Same as create |
| 5 | Retry-After precedence | Retry-After overrides exponential backoff | Already implemented in CarrierRetryPolicy |
| 6 | Retryable HTTP statuses | 429, 500, 502, 503, 504 | Per §5.3 |
| 7 | Retryable network failures (non-indeterminate) | NONE in B.3.3.2 — all network/timeout errors deferred to B.3.3.3 | Per §5.4 distinction |
| 8 | Dead-letter behavior | Outbox event → DEAD_LETTER; shipment → FAILED | Per §13 |
| 9 | Circuit-breaker-open behavior | Re-throw RetryableCarrierError → outbox retry | Per §12.2 |
| 10 | Does circuit breaker retry consume budget? | YES — counts as an outbox attempt | Per §12.2 |
| 11 | Maximum total retry duration | ~4.5h (sum of 8 exponential backoff intervals: 30+60+120+240+480+960+1920+3600 ≈ 77 min without jitter; with jitter ≈ 57-97 min; worst case with Retry-After caps at 8×1h = 8h) | Emerges from parameters |
| 12 | carrierCancelRetries semantics | 0-based retry counter (0 on first attempt, incremented after each failure) | Per §7.2 |

**These decisions are derived from existing locked parameters or are explicit recommendations. No silent inventions.**

---

## 19. Risks

| ID | Severity | Risk | Mitigation |
|---|---|---|---|
| R-1 | MEDIUM | Retry-After header not parsed by HTTP client | Add header parsing in B.3.3.2; until then, 429 uses 2× exponential backoff (safe but suboptimal) |
| R-2 | LOW | Process-local circuit breaker means horizontal workers have independent state | Acceptable for B.3.3.2; shared breaker is future work |
| R-3 | LOW | `carrierCancelRetries` read-then-write is not atomic at SQL level | Safe because FOR UPDATE SKIP LOCKED ensures single writer per event |
| R-4 | LOW | Outbox `attempts` and `carrierCancelRetries` could diverge if crash between updates | `attempts` is authoritative; `carrierCancelRetries` is denormalized observability |
| R-5 | LOW | Dead-lettered cancel events have no automated recovery | Admin recovery endpoint (B.3.3.5) will provide manual recovery |
| R-6 | MEDIUM | B.3.3.1 timeout marker text (`[TIMEOUT — B3.3.3 will set UNKNOWN]`) could be confusing if retry also produces FAILED | Timeout branch does NOT re-throw (returns early), so retry path never sees timeout errors |

---

## 20. Proposed Implementation Phases

### B.3.3.2.1 — Retry State Foundation

- Modify handleCancel() catch block: classify errors, re-throw retryable
- Increment `carrierCancelRetries` before re-throw
- Preserve timeout → FAILED (no re-throw) and terminal → FAILED (no re-throw)
- Preserve B.3.3.1 idempotent guard, tenant verification, capability check
- **No new columns, no migration**

### B.3.3.2.2 — Retry-After Header Parsing

- Enhance `CarrierHttpClient.classifyHttpStatus()` to read `Retry-After` header on 429
- Parse seconds format; handle malformed values safely
- Set `retryAfterSeconds` on `RateLimitCarrierError`
- Existing `CarrierRetryPolicy.calculateDelay()` already uses it

### B.3.3.2.3 — Retry Classification and Policy

- Verify `CarrierRetryPolicy` works correctly for cancel operations
- Add cancel-specific test coverage (all error classes)
- Verify circuit breaker open → re-throw → outbox retry path

### B.3.3.2.4 — Concurrency and Crash Hardening

- PostgreSQL integration tests: 2/10/50/100 concurrent workers
- Crash/recovery tests: lease expiry, PROCESSING → PENDING
- Idempotency tests: duplicate events, double-claim prevention
- Tenant isolation tests

### B.3.3.2.5 — Independent Runtime Verification

- Full regression suite
- TypeScript check
- Nest build
- Scope audit (no B.3.3.3+ behavior)

### B.3.3.2.6 — Release Closure

- Formally close B.3.3.2
- Verify deferred scope
- Update handoff to B.3.3.3

---

## 21. Go / No-Go Recommendation

### Verdict: GO WITH CONDITIONS

**Conditions (must be locked before implementation):**

1. Max retry attempts = 8 (reuse existing `CARRIER_RETRY_MAX_ATTEMPTS`)
2. Backoff base = 30s, max = 1h (reuse existing)
3. Jitter = ±25% (reuse existing)
4. Retry-After precedence over exponential backoff (already implemented)
5. Retryable statuses: 429, 500, 502, 503, 504
6. No network/timeout retry in B.3.3.2 (deferred to B.3.3.3)
7. Dead-letter = outbox DEAD_LETTER + shipment FAILED
8. Circuit breaker open → retry (consumes budget)
9. `carrierCancelRetries` = 0-based retry counter
10. No migration required
11. Timeout branch unchanged from B.3.3.1 (FAILED, no re-throw)
12. No UNKNOWN state in B.3.3.2

**Rationale:** The existing retry infrastructure (`CarrierRetryPolicy`, `handleFailure()`, `FOR UPDATE SKIP LOCKED`, lease recovery, `nextAttemptAt`) is production-proven through `handleCreate()` and M7.2.3-C. Cancellation retry reuses this infrastructure with minimal code changes — primarily modifying the handleCancel() catch block to classify errors and re-throw retryable ones.

**No migration required.** The schema was provisioned for this in migration 0049.

**No new services required.** `CarrierRetryPolicy` and `CarrierCircuitBreaker` are already injected into the worker.

---

*End of audit. NO production code was modified.*
