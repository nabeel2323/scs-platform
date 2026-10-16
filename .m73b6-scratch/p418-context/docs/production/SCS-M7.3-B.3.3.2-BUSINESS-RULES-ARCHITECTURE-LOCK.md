# SCS-M7.3-B.3.3.2 — BUSINESS RULES / ARCHITECTURE LOCK

**Carrier Cancellation Retry Semantics**

| Field | Value |
|---|---|
| Milestone | M7.3-B.3.3.2 |
| Task type | Decision lock — READ-ONLY, no implementation |
| Predecessor | M7.3-B.3.3.1 — CLOSED / PASS WITH CONDITIONS |
| Audit document | SCS-M7.3-B.3.3.2-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md |
| Audit verdict | GO WITH CONDITIONS |
| This document verdict | **GO** (conditions resolved into binding decisions) |
| Date | 2026-10-01 |
| Branch | develop |
| HEAD | 2814107 |

---

## 1. Status

**LOCKED.**

This document converts the audit's GO WITH CONDITIONS verdict into an explicit, immutable implementation contract. All 12 business decisions (BD-01 through BD-12) are binding for the B.3.3.2 implementation phase and its runtime verification.

No decision in this document may be changed during implementation. If a contradiction is discovered, implementation must STOP and the contradiction must be escalated for a formal amendment to this document.

---

## 2. Baseline

| Item | Value |
|---|---|
| Branch | develop |
| HEAD | 2814107 |
| Node | v26.4.0 |
| pnpm | 9.15.9 |
| TypeScript | 5.9.3 |
| Predecessor | B.3.3.1 CLOSED / PASS WITH CONDITIONS |
| Audit verdict | GO WITH CONDITIONS (12 conditions) |
| Migration 0049 | Applied, idempotent, additive-only |
| Production code modified | NO (this task is documentation-only) |

**Source documents read:**

1. `SCS-M7.3-B.3.3-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md`
2. `SCS-M7.3-B.3.3.1-IMPLEMENTATION-RESULTS.md`
3. `SCS-M7.3-B.3.3.1-RUNTIME-VERIFICATION-RESULTS.md`
4. `SCS-M7.3-B.3.3.1-RELEASE-CLOSURE.md`
5. `SCS-M7.3-B.3.3.2-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md`

**Source code inspected:**

- `carrier-retry-policy.ts` — 195 lines
- `carrier-errors.ts` — 241 lines
- `carrier-http-client.ts` — 417 lines
- `carrier-circuit-breaker.ts` — 219 lines
- `shipping-carrier.worker.ts` — 901 lines (handleCancel at lines 462-674, handleFailure at lines 853-880, claimEvents at lines 166-193, recoverStaleLeases at lines 127-156)
- `outbox-dispatcher.service.ts` — 150 lines
- `shipment.schema.ts` — 105 lines (carrier_cancel_* at lines 77-87)
- `audit.schema.ts` — 74 lines (outbox_events at lines 30-49)
- `infra/drizzle/migrations/0049_carrier_cancellation.sql` — 45 lines
- `infra/drizzle/migrations/0045_carrier_operations.sql` (outbox CHECK constraint)
- `aramex.provider.ts` (cancelPickup at lines 672-716)

---

## 3. Decision Table

| ID | Decision | Locked Value | Source / Rationale |
|---|---|---|---|
| BD-01 | Maximum retry attempts | **8** | Reuse `CARRIER_RETRY_MAX_ATTEMPTS`. Same as create flow. |
| BD-02 | Initial backoff | **30 seconds** | Reuse `CARRIER_RETRY_INITIAL_DELAY_MS`. |
| BD-03 | Maximum backoff | **1 hour** | Reuse `CARRIER_RETRY_MAX_DELAY_MS`. |
| BD-04 | Jitter | **±25% uniform** | Reuse existing `CarrierRetryPolicy` algorithm. No second jitter. |
| BD-05 | Retry-After precedence | **Retry-After overrides exponential backoff; capped at maxDelay** | Already implemented in `CarrierRetryPolicy.calculateDelay()`. |
| BD-06 | Retryable HTTP statuses | **429, 500, 502, 503, 504** | Per audit §5.3. All flow through `CarrierRetryPolicy`. |
| BD-07 | Timeout/network retry | **NONE in B.3.3.2** | Timeout, connection reset, DNS → FAILED (no re-throw). Deferred to B.3.3.3. |
| BD-08 | Retry architecture | **Option A — Generic outbox retry** | Re-throw retryable errors → `handleFailure()` → outbox PENDING/DEAD_LETTER. |
| BD-09 | `carrierCancelRetries` | **0-based retry counter** | 0 on first attempt, incremented after each failure. Outbox `attempts` is authoritative. |
| BD-10 | Circuit breaker OPEN | **Re-throw → outbox retry; consumes budget** | No carrier HTTP call made. Counts as outbox attempt. |
| BD-11 | Retry exhaustion | **Outbox → DEAD_LETTER; shipment → FAILED** | No separate `DEAD_LETTER` cancel status. Outbox is authority. |
| BD-12 | Migration | **None required** | All columns exist in migration 0049. |

---

## 4. Retry State Model

### 4.1 Canonical State Machine

```
NULL
  ↓  (cancelOrder() creates outbox event + sets PENDING)
PENDING
  ↓  (worker claims via FOR UPDATE SKIP LOCKED)
IN_PROGRESS
  │
  ├── carrier confirms cancellation
  │       ↓
  │   SUCCEEDED
  │
  ├── manual / unsupported provider
  │       ↓
  │   NOT_REQUIRED
  │
  ├── terminal error (401, 403, 404, 422, validation, auth, business failure)
  │       ↓
  │   FAILED  (final — no retry)
  │
  ├── timeout / indeterminate network error (B.3.3.1 marker)
  │       ↓
  │   FAILED  (final — no retry; B.3.3.3 will upgrade to UNKNOWN)
  │
  └── retryable error (429, 500, 502, 503, 504, circuit breaker open)
          ↓
      carrierCancelRetries++
          ↓
      re-throw
          ↓
      handleFailure()
          ↓
          ├── retry available → outbox PENDING + nextAttemptAt
          │       ↓
          │   (next poll cycle, after nextAttemptAt)
          │       ↓
          │   IN_PROGRESS  (retry attempt)
          │
          └── budget exhausted → outbox DEAD_LETTER
                  ↓
              shipment carrierCancelStatus = FAILED  (final)
```

### 4.2 Shipment Row State During Retry

The shipment row does NOT use a `RETRY` status value as the retry scheduling authority. The outbox event owns retry scheduling via `status = 'PENDING'` + `nextAttemptAt`.

The shipment row reflects the last known carrier outcome:
- After a retryable failure: `carrierCancelStatus` remains at whatever value handleCancel() set before re-throwing (the error is recorded, retries incremented)
- After final success: `SUCCEEDED`
- After budget exhaustion: `FAILED`

### 4.3 RETRY Observability (Optional)

If the implementation sets `carrierCancelStatus = 'RETRY'` on the shipment row for observability/admin queries, this value:
- MUST NOT be used as a second scheduling system
- MUST NOT affect the outbox event's retry timing
- MUST be treated as a denormalized view of the outbox retry state
- The partial index `idx_shipments_carrier_cancel` already includes `'RETRY'` in its WHERE predicate

---

## 5. Error Classification

### 5.1 Retryable Errors (B.3.3.2)

| Error | Error Class | Decision | Behavior |
|---|---|---|---|
| HTTP 429 | `RateLimitCarrierError` | backoff | Re-throw → outbox retry. Retry-After respected if present. |
| HTTP 500 | `RetryableCarrierError` | retry | Re-throw → outbox retry. |
| HTTP 502 | `RetryableCarrierError` | retry | Re-throw → outbox retry. |
| HTTP 503 | `RetryableCarrierError` | retry | Re-throw → outbox retry. |
| HTTP 504 | `RetryableCarrierError` | retry | Re-throw → outbox retry. |
| Circuit breaker OPEN | `RetryableCarrierError` (thrown by handleCancel) | retry | Re-throw → outbox retry. No carrier HTTP call made. |

### 5.2 Terminal Errors (No Retry)

| Error | Error Class | Decision | Behavior |
|---|---|---|---|
| HTTP 400 | `ValidationCarrierError` | terminal | → FAILED. No re-throw. |
| HTTP 401 | `AuthenticationCarrierError` | terminal | → FAILED. No re-throw. |
| HTTP 403 | `AuthenticationCarrierError` | terminal | → FAILED. No re-throw. |
| HTTP 404 | `NonRetryableCarrierError` | terminal | → FAILED. No re-throw. |
| HTTP 422 | `ValidationCarrierError` | terminal | → FAILED. No re-throw. |
| Other non-retryable 4xx | `NonRetryableCarrierError` | terminal | → FAILED. No re-throw. |
| Validation error | `ValidationCarrierError` | terminal | → FAILED. No re-throw. |
| Authentication error | `AuthenticationCarrierError` | terminal | → FAILED. No re-throw. |
| Unsupported operation | `UnsupportedCarrierOperationError` | unsupported | → NOT_REQUIRED. No re-throw. |
| Business failure (carrier said no) | Deterministic result | terminal | → FAILED. No re-throw. |
| Malformed carrier response | `NonRetryableCarrierError` | terminal | → FAILED. No re-throw. |

### 5.3 Deferred Errors (B.3.3.3 — NOT in B.3.3.2)

| Error | Current Behavior | B.3.3.3 Behavior |
|---|---|---|
| Request timeout | FAILED (B.3.3.1 marker) | UNKNOWN |
| Connection reset | FAILED (B.3.3.1 marker) | UNKNOWN |
| Connection aborted | FAILED (B.3.3.1 marker) | UNKNOWN |
| Socket hang up | FAILED (B.3.3.1 marker) | UNKNOWN |
| DNS failure | FAILED (B.3.3.1 marker) | UNKNOWN |

**Critical rule:** B.3.3.2 must NOT change the timeout/network error behavior. These errors are NOT retryable in B.3.3.2. They remain FAILED with no re-throw.

---

## 6. Retry-After Contract

### 6.1 HTTP Client Requirements

The HTTP client (`carrier-http-client.ts`) must be enhanced to parse the `Retry-After` header on HTTP 429 responses:

| Scenario | Behavior |
|---|---|
| 429 with valid integer `Retry-After: 120` | Set `retryAfterSeconds = 120` on `RateLimitCarrierError` |
| 429 without `Retry-After` header | `retryAfterSeconds` remains `undefined` → normal 2× backoff |
| 429 with malformed `Retry-After: abc` | Ignore header, `retryAfterSeconds` remains `undefined` → normal 2× backoff |
| 429 with `Retry-After` exceeding maxDelay | `CarrierRetryPolicy` caps at `maxDelayMs` (already implemented) |

### 6.2 Format Support

| Format | B.3.3.2 Requirement |
|---|---|
| Integer seconds | **REQUIRED** |
| HTTP-date | **NOT REQUIRED** — explicitly deferred. Document this limitation. |

### 6.3 Safety Rules

1. Malformed `Retry-After` MUST NOT crash the worker
2. `Retry-After` MUST NOT exceed `CARRIER_RETRY_MAX_DELAY_MS`
3. Missing `Retry-After` MUST fall through to normal retry policy (2× exponential backoff for rate-limit)
4. The existing `CarrierRetryPolicy.calculateDelay()` already handles all three cases correctly once `retryAfterSeconds` is populated

### 6.4 Current Gap

The HTTP client currently creates `RateLimitCarrierError` on 429 **without** reading the `Retry-After` header. The `retryAfterSeconds` field exists on the error class but is always `undefined`. B.3.3.2 closes this gap.

---

## 7. Retry Architecture

### 7.1 Option A — Generic Outbox Retry (LOCKED)

```
handleCancel()
      ↓
retryable carrier error caught
      ↓
carrierCancelRetries++ (shipment row)
carrierCancelError = safeMessage
carrierCancelErrorClass = classification.decision
      ↓
re-throw retryable error
      ↓
processEvent() catch block
      ↓
handleFailure(eventId, event, err)
      ↓
retryPolicy.classify(err, attempts)
      ↓
      ├── !isFinal → outbox: PENDING + nextAttemptAt + clear lease
      │       ↓
      │   (next poll cycle, after nextAttemptAt)
      │       ↓
      │   claimEvents() picks up the event
      │       ↓
      │   handleCancel() runs again
      │
      └── isFinal → outbox: DEAD_LETTER
              ↓
          shipment: carrierCancelStatus = FAILED (set by last handleCancel)
```

### 7.2 What This Reuses (No New Infrastructure)

| Component | Already exists? | Reused? |
|---|---|---|
| `CarrierRetryPolicy.classify()` | YES | YES — direct reuse |
| `handleFailure()` outbox retry | YES | YES — direct reuse |
| `FOR UPDATE SKIP LOCKED` claim | YES | YES — already filters `shipping.carrier.%` |
| `recoverStaleLeases()` | YES | YES — already resets PROCESSING → PENDING |
| `nextAttemptAt` delayed retry | YES | YES — already in claim WHERE clause |
| Outbox `attempts` counter | YES | YES — authoritative attempt counter |
| `DEAD_LETTER` outbox status | YES (0045) | YES — set by handleFailure |

### 7.3 What This Does NOT Create

- No second retry scheduler
- No new retry outbox events
- No new retry columns
- No new retry services
- No new retry tables

### 7.4 Pattern Parity with handleCreate()

`handleCreate()` already uses this exact pattern:
- Terminal errors → mark FAILED → return (no re-throw)
- Timeout → mark RECOVERY_REQUIRED → return (no re-throw)
- Retryable errors → increment retries → re-throw → handleFailure manages outbox

`handleCancel()` in B.3.3.2 follows the same pattern:
- Terminal errors → mark FAILED → return (no re-throw)
- Timeout → mark FAILED (B.3.3.1 marker) → return (no re-throw)
- Retryable errors → increment retries → re-throw → handleFailure manages outbox

---

## 8. Counter Semantics

### 8.1 Two Counters, Two Purposes

| Counter | Location | Meaning | Authority |
|---|---|---|---|
| `outbox_events.attempts` | Outbox row | Total worker attempts (1-based) | **Authoritative** for retry budget |
| `shipments.carrier_cancel_retries` | Shipment row | Retries after first attempt (0-based) | **Observability** for admin/queries |

### 8.2 Progression

| Event | outbox `attempts` | `carrierCancelRetries` |
|---|---|---|
| Outbox event created | 0 | 0 |
| First attempt starts (claim) | 0 | 0 |
| First attempt fails (retryable) | 1 (set by handleFailure) | 1 (incremented by handleCancel) |
| Second attempt starts | 1 | 1 |
| Second attempt fails (retryable) | 2 | 2 |
| ... | ... | ... |
| Eighth attempt fails (retryable) | 8 | 8 |
| handleFailure: `attempts >= maxAttempts(8)` | → DEAD_LETTER | → final |

### 8.3 Non-Interchangeability

These counters MUST NOT be treated as interchangeable:
- `outbox_events.attempts` includes lease recoveries (which increment attempts without a real carrier call)
- `carrierCancelRetries` is incremented only when handleCancel() actually executes and encounters a retryable error
- In crash scenarios, `attempts` may be higher than `carrierCancelRetries`

---

## 9. Circuit Breaker Semantics

### 9.1 Behavior When OPEN

| Aspect | Behavior |
|---|---|
| Carrier HTTP request | NOT made |
| Error produced | `RetryableCarrierError('Circuit breaker open for {providerKey}')` |
| Re-thrown? | YES |
| Consumes outbox retry attempt? | YES |
| Consumes retry budget? | YES |
| Counts as carrier HTTP attempt? | NO |
| `carrierCancelRetries` incremented? | NO (no carrier call was made; handleCancel re-throws before incrementing) |

**Correction:** The circuit breaker check in handleCancel() (line 544-554) throws BEFORE the IN_PROGRESS transition and BEFORE the carrier call. The re-throw goes to processEvent() catch → handleFailure(). The `carrierCancelRetries` is NOT incremented because the error is thrown before the retry counter update in the catch block.

### 9.2 Process-Local Limitation

The circuit breaker is in-memory (`Map<string, BreakerEntry>`). Each worker process has independent state. This means:
- Worker A's failures don't affect Worker B's breaker
- A retry on Worker B might proceed even if Worker A's breaker is OPEN
- This is a known limitation, accepted for B.3.3.2
- Shared breaker (Redis) is future work, outside B.3.3.2 scope

### 9.3 No Circuit Breaker Changes

B.3.3.2 must NOT modify `CarrierCircuitBreaker` in any way.

---

## 10. Dead-Letter Semantics

### 10.1 Retry Exhaustion

When `handleFailure()` determines `isFinal = true` (attempts >= maxAttempts):

| Component | State |
|---|---|
| `outbox_events.status` | `DEAD_LETTER` |
| `outbox_events.lastError` | Terminal safe message including `(max attempts reached)` |
| `shipments.carrierCancelStatus` | `FAILED` |
| `shipments.carrierCancelError` | Last safe error message |
| `shipments.carrierCancelRetries` | Final retry count |
| `shipments.carrierCancelErrorClass` | Last error classification |

### 10.2 No Separate DEAD_LETTER Cancel Status

The shipment row does NOT gain a `DEAD_LETTER` value for `carrierCancelStatus`. The canonical final state remains `FAILED`.

**Rationale:**
- The outbox event already carries `DEAD_LETTER` — this is the dead-letter signal
- Adding a separate cancel status would duplicate information
- Admin queries can join `shipments` with `outbox_events` to find dead-lettered cancellations
- The `carrierCancelError` records the terminal error including budget exhaustion

### 10.3 Recovery

Dead-lettered cancel events have no automated recovery in B.3.3.2. Admin recovery endpoints (B.3.3.5) will provide manual recovery for dead-lettered cancellations.

---

## 11. Migration Decision

### BD-12: No Migration Required

| Column | Type | Exists Since | Supports Retry? |
|---|---|---|---|
| `carrier_cancel_status` | VARCHAR(24) | 0049 | YES — RETRY ≤ 24 chars |
| `carrier_cancel_retries` | INTEGER NOT NULL DEFAULT 0 | 0049 | YES — currently unused |
| `carrier_cancel_error` | TEXT | 0049 | YES — stores safe error |
| `carrier_cancel_error_class` | VARCHAR(40) | 0049 | YES — stores 'retry'/'backoff'/'terminal' |
| `carrier_cancel_attempted_at` | TIMESTAMPTZ | 0049 | YES — last attempt timestamp |
| `carrier_cancel_idempotency_key` | VARCHAR(120) | 0049 | YES — already set |
| Partial index `idx_shipments_carrier_cancel` | — | 0049 | YES — includes 'RETRY' in WHERE |

Outbox status CHECK constraint (0045): `CHECK (status IN ('PENDING','PROCESSING','DISPATCHED','FAILED','DEAD_LETTER'))` — already supports the full retry lifecycle.

Retry-After header parsing is an application-layer change in `carrier-http-client.ts`, not a schema change.

---

## 12. Deferred Scope

### B.3.3.3 — Indeterminate Outcome Reconciliation (OUT OF SCOPE)

- UNKNOWN state
- Timeout → UNKNOWN (replaces current FAILED marker)
- Connection reset → UNKNOWN
- DNS failure → UNKNOWN
- Carrier state query after uncertain result
- Recovery tokens: CANCEL_UNKNOWN, CANCEL_TIMEOUT
- `recovery_status` integration for cancel

### B.3.3.4 — Cancellation Reconciliation (OUT OF SCOPE)

- Periodic reconciliation of stuck cancellations
- Carrier state query for IN_PROGRESS/RETRY cancellations
- Recovery tokens: CANCEL_RECONCILE

### B.3.3.5 — Delivered-After-Cancel (OUT OF SCOPE)

- Tracking poller cancel-awareness
- Webhook cancel-state handling
- `exceptionStatus` / `CARRIER_DELIVERED_AFTER_CANCEL`
- Admin recovery endpoints for stuck cancellations

**Confirmation:** This lock document implements NONE of the above. The timeout branch in handleCancel() retains the B.3.3.1 marker `[TIMEOUT — B3.3.3 will set UNKNOWN]` and does NOT change its behavior.

---

## 13. Implementation Constraints

When B.3.3.2 implementation begins, it **MUST**:

| # | Constraint | Rationale |
|---|---|---|
| 1 | Reuse `CarrierRetryPolicy` | BD-01 through BD-04 |
| 2 | Reuse `handleFailure()` | BD-08 |
| 3 | Reuse existing outbox lease recovery | BD-08 |
| 4 | Reuse `FOR UPDATE SKIP LOCKED` | BD-08 |
| 5 | Preserve tenant verification | Security — line 472-478 |
| 6 | Preserve credential-safe errors | Security — `toSafeMessage()` |
| 7 | Preserve circuit breaker | BD-10 |
| 8 | Preserve idempotency | Idempotent guard at line 480-489 |
| 9 | Preserve timeout → FAILED behavior | BD-07 |
| 10 | Avoid migrations | BD-12 |
| 11 | Avoid a second retry scheduler | BD-08 |
| 12 | Avoid new retry outbox events | BD-08 |
| 13 | Avoid changes to tracking/webhooks/reconciliation | §12 deferred scope |
| 14 | Avoid implementing UNKNOWN | BD-07 |
| 15 | Avoid feature creep | This contract is exhaustive |

---

## 14. Test Requirements

### 14.1 Unit Tests (minimum)

| # | Test | Validates |
|---|---|---|
| 1 | HTTP 429 → retry | BD-06 |
| 2 | HTTP 500 → retry | BD-06 |
| 3 | HTTP 502 → retry | BD-06 |
| 4 | HTTP 503 → retry | BD-06 |
| 5 | HTTP 504 → retry | BD-06 |
| 6 | Retry-After respected | BD-05 |
| 7 | Malformed Retry-After → fallback | §6.3 safety |
| 8 | Exponential backoff progression | BD-02, BD-03 |
| 9 | Jitter bounds ±25% | BD-04 |
| 10 | Retry counter increment | BD-09 |
| 11 | Terminal 401 → no retry | §5.2 |
| 12 | Terminal 403 → no retry | §5.2 |
| 13 | Terminal 404 → no retry | §5.2 |
| 14 | Validation failure → no retry | §5.2 |
| 15 | Business failure → no retry | §5.2 |
| 16 | Circuit breaker OPEN → retry | BD-10 |
| 17 | Retry exhaustion → FAILED | BD-11 |
| 18 | Timeout → FAILED (no retry) | BD-07 |
| 19 | Idempotency guard on retry | §4.2 |

### 14.2 PostgreSQL Integration Tests (minimum)

| # | Test | Validates |
|---|---|---|
| 1 | Retry state persistence | BD-09 |
| 2 | Retry counter atomicity | BD-09 |
| 3 | nextAttemptAt respected | BD-08 |
| 4 | Budget exhaustion → DEAD_LETTER | BD-11 |
| 5 | Lease recovery for cancel retry | BD-08 |
| 6 | Duplicate outbox events | §4.2 idempotency |
| 7 | Tenant isolation on retry | Security |
| 8 | One effective carrier call per cycle | Concurrency |

### 14.3 Concurrency Tests (minimum)

| Workers | Property |
|---|---|
| 2 | No double processing |
| 10 | No double processing |
| 50 | FOR UPDATE SKIP LOCKED holds |
| 100 | Exactly one effective attempt per cycle |

**Invariant:** No more than one effective carrier cancellation attempt is executing for the same shipment at a time.

---

## 15. Risks

| ID | Severity | Risk | Mitigation |
|---|---|---|---|
| R-1 | MEDIUM | Retry-After header not currently parsed by HTTP client | B.3.3.2 closes this gap (§6). Until then, 429 uses 2× backoff (safe). |
| R-2 | LOW | Process-local circuit breaker → horizontal workers have independent state | Accepted for B.3.3.2. Shared breaker is future work. |
| R-3 | LOW | `carrierCancelRetries` read-then-write not atomic at SQL level | Safe because FOR UPDATE SKIP LOCKED ensures single writer per event. |
| R-4 | LOW | Outbox `attempts` and `carrierCancelRetries` could diverge after crash | `attempts` is authoritative; `carrierCancelRetries` is observability. |
| R-5 | LOW | Dead-lettered cancel events have no automated recovery | B.3.3.5 admin recovery endpoints will address this. |
| R-6 | LOW | B.3.3.1 timeout marker text could be confusing alongside retry FAILED | Timeout branch does NOT re-throw (returns early). Retry path never sees timeout errors. |

---

## 16. Formal Approval / Lock

**M7.3-B.3.3.2 — BUSINESS RULES / ARCHITECTURE LOCK**

The following 12 decisions are **binding** for the B.3.3.2 implementation phase:

| Decision | Locked |
|---|---|
| BD-01 — Maximum retry attempts = 8 | LOCKED |
| BD-02 — Initial backoff = 30s | LOCKED |
| BD-03 — Maximum backoff = 1h | LOCKED |
| BD-04 — Jitter = ±25% uniform | LOCKED |
| BD-05 — Retry-After overrides exponential backoff | LOCKED |
| BD-06 — Retryable HTTP: 429, 500, 502, 503, 504 | LOCKED |
| BD-07 — No timeout/network retry in B.3.3.2 | LOCKED |
| BD-08 — Generic outbox retry (Option A) | LOCKED |
| BD-09 — carrierCancelRetries = 0-based | LOCKED |
| BD-10 — Circuit breaker open → retry, consumes budget | LOCKED |
| BD-11 — Exhaustion → outbox DEAD_LETTER, shipment FAILED | LOCKED |
| BD-12 — No migration required | LOCKED |

**No unresolved ambiguities.** The audit's GO WITH CONDITIONS verdict had 12 conditions; all 12 are now explicitly locked with no contradictions discovered.

---

## 17. Next Implementation Phase

**M7.3-B.3.3.2.1 — Retry State Foundation**

Scope:
- Modify handleCancel() catch block to classify errors and re-throw retryable
- Increment `carrierCancelRetries` before re-throw
- Preserve timeout → FAILED (no re-throw)
- Preserve terminal → FAILED (no re-throw)
- No new columns, no migration

---

**M7.3-B.3.3.2 — BUSINESS RULES / ARCHITECTURE LOCK COMPLETE**

**Decision: GO**

The audit's conditions are now converted into an explicit implementation contract.

Next milestone: **M7.3-B.3.3.2.1 — Retry State Foundation**

*No production code was modified in this task.*
