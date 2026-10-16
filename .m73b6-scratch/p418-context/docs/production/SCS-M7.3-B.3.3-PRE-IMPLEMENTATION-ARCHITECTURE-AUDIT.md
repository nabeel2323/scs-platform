# SCS M7.3-B.3.3 — Pre-Implementation Architecture Audit

## Cancel Execution / Retry / UNKNOWN

---

## 1. Executive Summary

**Verdict: GO WITH CONDITIONS**

B3.3 can proceed to implementation. The provider abstraction (B3.2) is CLOSED/PASS. The shipment cancellation state foundation (B3.1) is CLOSED/PASS. The worker infrastructure, retry policy, circuit breaker, reconciliation engine, and outbox infrastructure are all proven in production for the create flow and reusable for cancel.

**Conditions:**

1. **C1 — Outbox event creation**: No code currently creates `shipping.carrier.cancel` outbox events. B3.3 must wire this into `cancelOrder()` or a dedicated carrier-cancel dispatch method.
2. **C2 — `exceptionStatus` column missing**: The B.0 lock (§12) references `shipment.exceptionStatus = 'CARRIER_DELIVERED_AFTER_CANCEL'` but no such column exists in the schema. B3.3 must either add it via migration or adopt an alternative mechanism (e.g., `recovery_status` token).
3. **C3 — Reconciliation extension**: The existing reconciliation service only queries `carrier_create_status`. It must be extended to also claim and process shipments with pending `carrier_cancel_status` values.
4. **C4 — Tracking/webhook post-cancel**: Neither the tracking poller nor the webhook controller checks `carrier_cancel_status`. A DELIVERED after cancel would be processed normally. B3.3 must add cancel-aware guards.

---

## 2. Baseline

| Component | Status | Evidence |
|-----------|--------|----------|
| M7.3-B.3.2 (Provider Abstraction) | CLOSED/PASS | SCS-M7.3-B.3.2-RELEASE-CLOSURE.md |
| M7.3-B.3.1 (Cancel State Foundation) | CLOSED/PASS | SCS-M7.3-B.3.1-RUNTIME-VERIFICATION-RESULTS.md |
| M7.3-B.2 (Merchant Cancellation) | CLOSED/PASS | SCS-M7.3-B.2-RELEASE-CLOSURE.md |
| M7.3-B.1 (Cancellation Concurrency) | CLOSED/PASS | SCS-M7.3-B.1-RUNTIME-VERIFICATION-RESULTS.md |
| M7.2.3-C (Carrier Operations) | CLOSED/PASS | M7.2.3-C implementation verified |
| Branch | develop @ 2834fa5 | git log |

---

## 3. Current Outbox Architecture

**Schema:** `outbox_events` table (audit.schema.ts:30-49, migration 0002 + 0045)

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID PK | Event identifier |
| event_type | VARCHAR(80) | Event type key |
| aggregate_id | UUID | Target entity (shipmentId for carrier events) |
| payload | JSONB | Event data |
| status | VARCHAR(16) | PENDING / PROCESSING / DISPATCHED / DEAD_LETTER |
| attempts | INTEGER | Retry counter |
| last_error | TEXT | Last error message |
| next_attempt_at | TIMESTAMPTZ | Delayed retry scheduling |
| locked_at | TIMESTAMPTZ | Lease start |
| locked_by | VARCHAR(80) | Worker ID holding lease |
| organization_id | UUID | Tenant scoping |
| store_id | UUID | Store scoping |

**CHECK constraint:** Status values managed by migration 0045 (dropped/recreated to add PROCESSING, DEAD_LETTER).

**Key finding:** `shipping.carrier.cancel` is recognized by the worker dispatch switch (line 208) but **NO code creates this event type**. The event must be created inside the same transaction as `cancelOrder()` to guarantee atomicity with order cancellation.

**Outbox publisher:** `OutboxDispatcher.publish(eventType, aggregateId, payload, metadata, organizationId, txClient?)` — accepts optional transaction client for atomic publishing.

---

## 4. Current Worker Architecture

**File:** `shipping-carrier.worker.ts` (675 lines)

### Polling Cycle
1. `recoverStaleLeases()` — reset PROCESSING events older than 5 min → PENDING
2. `claimEvents()` — raw SQL `SELECT ... FOR UPDATE SKIP LOCKED`, batch of 5
3. `processEvent()` — dispatch by event type → handler → mark DISPATCHED or handleFailure

### handleCreate() — Reference Implementation (lines 251-439)
The create handler provides the exact template for handleCancel:
1. Load shipment by aggregateId
2. Idempotent guard (already SUCCESS → skip)
3. Resolve provider from registry
4. Manual provider → mark SUCCESS, return
5. Circuit breaker check
6. Mark IN_PROGRESS
7. Call provider
8. On success → mark SUCCESS, record circuit breaker success
9. On timeout → mark RECOVERY_REQUIRED (not FAILED)
10. On terminal error → mark FAILED
11. On retryable error → update retry count, re-throw for handleFailure

### handleCancel() — Current Stub (lines 445-448)
```typescript
private async handleCancel(event: any): Promise<void> {
    const shipmentId = event.aggregateId;
    this.logger.log(`Carrier cancel requested for shipment ${shipmentId} — not yet implemented.`);
}
```

### handleFailure() — Shared (lines 627-654)
Uses `CarrierRetryPolicy.classify()` to determine:
- Terminal/unsupported → DEAD_LETTER
- Retryable → PENDING with nextAttemptAt (exponential backoff + jitter)
- Budget exhausted → DEAD_LETTER

### Infrastructure Reusable for Cancel
| Feature | Status | Notes |
|---------|--------|-------|
| FOR UPDATE SKIP LOCKED claiming | Proven | Works for all carrier event types |
| Lease recovery | Proven | 5-min timeout, resets stale PROCESSING |
| Circuit breaker | Proven | Per-provider, integrated |
| Retry policy | Proven | Exponential backoff + jitter, max 8 attempts |
| Dead-letter | Proven | After budget exhaustion |
| Error classification | Proven | classifyCarrierError() + RetryPolicy.classify() |
| Observability | Proven | Counters, structured logging |

---

## 5. Current Provider Architecture

**Base class:** `ShippingProvider` (shipping-provider.ts, 107 lines)

| Method | B3.2 Status |
|--------|-------------|
| `cancelPickup(request: CancelPickupRequest): Promise<CancelPickupResult>` | Implemented |
| `capabilities.canCancelPickup` | Implemented |

**Aramex implementation:** `AramexProvider.cancelPickup()` (aramex.provider.ts:672-734)
- POST to `/json/CancelPickup`
- PickupGUID from `request.carrierPickupId`
- Runtime body validation (B3.2 defect fix)
- HasErrors=true → business error (cancelled: false)
- HasErrors=false → success (cancelled: true)
- Malformed → NonRetryableCarrierError

**Manual provider:** `canCancelPickup: false`, inherits base unsupported result.

**Credential resolution:** `resolveCredentials(storeId)` → store → configuration → credential chain. Encrypted secrets decrypted on demand.

---

## 6. Current Shipment Cancellation State

**Migration 0049 columns** (shipment.schema.ts:77-87):

| Column | Type | Purpose |
|--------|------|---------|
| carrier_pickup_id | VARCHAR(200) | Aramex pickup GUID |
| pickup_scheduled | BOOLEAN DEFAULT false | Whether pickup was scheduled |
| carrier_cancel_status | VARCHAR(24) | Cancellation lifecycle state |
| carrier_cancel_error | TEXT | Last cancel error message |
| carrier_cancel_error_class | VARCHAR(40) | Error classification |
| carrier_cancel_retries | INTEGER DEFAULT 0 | Cancel retry counter |
| carrier_cancel_attempted_at | TIMESTAMPTZ | Last cancel attempt time |
| carrier_cancel_idempotency_key | VARCHAR(120) | Deterministic key |

**State vocabulary** (shipping.types.ts:29-37):

```
PENDING | IN_PROGRESS | SUCCEEDED | FAILED | UNKNOWN |
NOT_REQUIRED | RECONCILIATION_REQUIRED | RETRY
```

**Recovery tokens** (shipping.types.ts:274-280):
```
CANCEL_UNKNOWN | CANCEL_TIMEOUT | CANCEL_FAILED |
CANCEL_RECONCILE | DELIVERED_AFTER_CANCEL
```

**Partial index** (migration 0049):
```sql
CREATE INDEX IF NOT EXISTS idx_shipments_carrier_cancel
  ON shipments (carrier_cancel_status, next_reconciliation_at)
  WHERE carrier_cancel_status IN
    ('PENDING', 'IN_PROGRESS', 'UNKNOWN', 'RETRY', 'RECONCILIATION_REQUIRED');
```

**Idempotency key:** `carrier-cancel:<shipmentId>` — deterministic, unique per shipment.

---

## 7. Current Retry Infrastructure

**CarrierRetryPolicy** (carrier-retry-policy.ts, 195 lines):
- Exponential backoff: 30s initial, 1h max
- ±25% jitter
- Rate-limit aware: respects Retry-After from RateLimitCarrierError
- Max 8 attempts → dead-letter
- Configurable via CARRIER_RETRY_* env vars

**Classification chain:**
```
Error → classifyCarrierError() → retry/backoff/terminal/unsupported
     → RetryPolicy.classify() → RetryClassification {
         decision, nextAttemptAt, safeMessage, isFinal
       }
```

**Error hierarchy** (carrier-errors.ts):
| Error Class | retryable | classifyCarrierError decision |
|-------------|-----------|-------------------------------|
| RetryableCarrierError | true | retry |
| RateLimitCarrierError | true | backoff |
| AuthenticationCarrierError | false | terminal |
| ValidationCarrierError | false | terminal |
| NonRetryableCarrierError | false | terminal |
| UnsupportedCarrierOperationError | false | unsupported |
| Generic Error (timeout, network) | — | retry (fallback) |

**CRITICAL DISTINCTION for B3.3:** The `classifyCarrierError` fallback treats unknown errors as `retry`. But for cancellation, a timeout is NOT a clean retry scenario — it means we don't know if the carrier actually cancelled. B3.3 must distinguish:
- **Retryable with known outcome** (5xx, rate limit) → safe to retry
- **Unknown outcome** (timeout, network disconnect) → must go to UNKNOWN, not blind retry

---

## 8. Current Reconciliation Infrastructure

**CarrierReconciliationService** (carrier-reconciliation.service.ts, 295 lines):

### Current Claim Query (lines 119-140)
Claims shipments where:
```sql
carrier_create_status = 'RECOVERY_REQUIRED'
OR (carrier_create_status IN ('PENDING', 'IN_PROGRESS')
    AND (next_reconciliation_at IS NULL OR next_reconciliation_at <= NOW()))
```
AND `recovery_status NOT IN ('RECONCILING', 'RECOVERED', 'ADMIN_TRIGGERED')`

**Gap:** This query does NOT consider `carrier_cancel_status` at all. B3.3 must extend it to also claim shipments where `carrier_cancel_status IN ('UNKNOWN', 'RECONCILIATION_REQUIRED', 'RETRY')`.

### Current Reconciliation Cases
| Case | Condition | Action |
|------|-----------|--------|
| A | SUCCESS + carrierShipmentId | Already complete — no-op |
| B | PENDING + carrier has it | Recover via tracking → SUCCESS |
| C | PENDING + carrier doesn't | Safe retry if idempotency key exists |
| D | IN_PROGRESS or unknown | Defer for manual review |

**B3.3 must add cancel-specific cases:**
| Case | Condition | Action |
|------|-----------|--------|
| CA | carrier_cancel_status = SUCCEEDED | Already cancelled — no-op |
| CB | UNKNOWN + carrier says cancelled | Mark SUCCEEDED |
| CC | UNKNOWN + carrier says active | RECONCILIATION_REQUIRED |
| CD | UNKNOWN + carrier unreachable | Defer, keep UNKNOWN |
| CE | RETRY + budget not exhausted | Schedule retry via outbox |
| CF | RETRY + budget exhausted | FAILED |

---

## 9. Current Tracking/Webhook Interaction

### Tracking Poller (carrier-tracking-poller.ts, 331 lines)

**Current claim query** (lines 168-183):
```sql
WHERE carrier_create_status = 'SUCCESS'
  AND carrier_tracking_id IS NOT NULL
  AND (carrier_status_mapped IS NULL
       OR carrier_status_mapped NOT IN ('DELIVERED', 'CANCELLED', 'COMPLETED'))
  AND (last_carrier_sync_at IS NULL OR last_carrier_sync_at <= cutoff)
```

**Gap:** No check on `carrier_cancel_status`. If a shipment has been cancelled at the SCS level but the carrier hasn't confirmed, the poller will continue polling and may process a DELIVERED status, which would trigger `processCarrierDelivery()` on an already-cancelled order.

**B.0 lock §12 says:** SCS cancellation is authoritative. DELIVERED after cancel → `recoveryStatus = 'RECONCILIATION_REQUIRED'`. But `processCarrierDelivery()` in orders.service.ts currently doesn't check for prior cancellation explicitly — it relies on the order status being CANCELLED.

### Webhook Controller (carrier-webhook.controller.ts, 334 lines)

**No cancel-specific handling.** Webhooks are processed generically:
1. HMAC verification
2. Dedup via UNIQUE(provider_key, external_delivery_id)
3. Link to shipment via carrierShipmentId
4. Mark processed

**Gap:** A carrier cancellation confirmation webhook would be processed as a generic event with no cancel-specific state update. B3.3 may need to handle cancel-specific webhook events.

---

## 10. Current Admin Recovery

**CarrierAdminController** (carrier-admin.controller.ts, 348 lines):

### POST /v1/carrier/shipments/:id/recover (lines 187-268)
- RBAC: `admin:shipping:recovery`
- Tenant isolation: shipment → store → org chain
- Recoverable statuses: `['PENDING', 'IN_PROGRESS', 'FAILED', 'RECOVERY_REQUIRED']` on `carrierCreateStatus`
- Sets `recoveryStatus = 'ADMIN_TRIGGERED'`, runs `reconcileShipment()`

**Gap:** Only checks `carrierCreateStatus`. Does NOT check `carrierCancelStatus`. B3.3 must add cancel-specific recovery or extend the recoverable status check.

### GET /v1/carrier/recovery/queue (lines 279-346)
- Lists shipments with `carrierCreateStatus IN ('RECOVERY_REQUIRED', 'PENDING', 'IN_PROGRESS', 'FAILED')`
- Tenant-scoped

**Gap:** Does NOT include shipments with pending cancel statuses.

---

## 11. State Machine

### Carrier Cancel Lifecycle — Required States and Transitions

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
       │              │              │              │           │
       │              └──────────────┘              │           │
       │              (reconciliation               │           │
       │               says retry safe)             │           │
       │                                            │           │
       └────────────────────────────────────────────┘           │
                    (reconciliation resolves)                   │
                                                                │
                      ┌────────┐                                │
                      │ FAILED │◀── (terminal error or          │
                      └────────┘    budget exhausted) ──────────┘
```

### State Definitions

| State | Created By | Terminal? | Worker Retries? | Reconciliation? | Admin? |
|-------|-----------|-----------|-----------------|-----------------|--------|
| PENDING | cancelOrder() outbox | No | Yes (claims event) | No | No |
| IN_PROGRESS | worker before carrier call | No | No (lease held) | No | No |
| SUCCEEDED | worker after carrier confirms | **Yes** | No | No-op | No |
| FAILED | worker on terminal error or budget exhausted | **Yes** | No | No | Can view |
| UNKNOWN | worker on timeout/indeterminate | No | **NOT blindly** | **Yes** | Can trigger |
| NOT_REQUIRED | worker when no carrier action needed | **Yes** | No | No | No |
| RECONCILIATION_REQUIRED | worker or reconciliation | No | No | **Yes** | Can trigger |
| RETRY | reconciliation says retry safe | No | Yes (via outbox) | No | No |

### Transition Rules

| From | To | Trigger | Guard |
|------|-----|---------|-------|
| NULL | PENDING | cancelOrder() | pickup_scheduled=true AND provider.canCancelPickup=true |
| NULL | NOT_REQUIRED | cancelOrder() | no carrier action needed |
| NULL | RECONCILIATION_REQUIRED | cancelOrder() | carrier action needed but can't determine |
| PENDING | IN_PROGRESS | worker claims event | FOR UPDATE SKIP LOCKED |
| IN_PROGRESS | SUCCEEDED | carrier confirms cancel | HasErrors=false |
| IN_PROGRESS | FAILED | terminal carrier error | NonRetryable/Auth/Validation |
| IN_PROGRESS | UNKNOWN | timeout/network disconnect | isTimeoutError() |
| IN_PROGRESS | RETRY | retryable error + budget | RetryableCarrierError |
| UNKNOWN | SUCCEEDED | reconciliation: carrier says cancelled | tracking lookup |
| UNKNOWN | RECONCILIATION_REQUIRED | reconciliation: carrier says active | tracking lookup |
| UNKNOWN | UNKNOWN | reconciliation: carrier unreachable | defer |
| RETRY | IN_PROGRESS | worker claims retry event | same as PENDING→IN_PROGRESS |
| RETRY | FAILED | budget exhausted | max attempts |
| RECONCILIATION_REQUIRED | SUCCEEDED | reconciliation resolves | carrier confirms |
| RECONCILIATION_REQUIRED | FAILED | reconciliation gives up | manual review |

---

## 12. Error Classification

### For Cancellation — Required Mapping

| Error Scenario | Error Class | B3.3 Behavior |
|---------------|-------------|---------------|
| HTTP 200 + HasErrors=false | (success) | → SUCCEEDED |
| HTTP 200 + HasErrors=true | (business error) | → FAILED (carrier said no) |
| HTTP 401 | AuthenticationCarrierError | → FAILED (terminal) |
| HTTP 429 | RateLimitCarrierError | → RETRY (backoff) |
| HTTP 500 | RetryableCarrierError | → RETRY (exponential backoff) |
| Timeout | RetryableCarrierError (timeout) | → **UNKNOWN** (not blind retry!) |
| Network disconnect | Generic Error | → **UNKNOWN** (not blind retry!) |
| Malformed response | NonRetryableCarrierError | → FAILED (structural) |
| Provider unsupported | UnsupportedCarrierOperationError | → NOT_REQUIRED |
| No pickup scheduled | (pre-check) | → NOT_REQUIRED |

### CRITICAL: Timeout ≠ Retryable for Cancellation

For the create flow, a timeout → RECOVERY_REQUIRED → reconciliation determines outcome.
For the cancel flow, a timeout must → UNKNOWN → reconciliation determines outcome.

The key difference: with create, we can safely retry because the idempotency key prevents duplicate creation. With cancel, a blind retry could double-cancel if the first attempt actually succeeded but the response was lost.

**B3.3 must NOT blindly retry timeouts.** The `isTimeoutError()` check in the worker must route to UNKNOWN, not RETRY.

---

## 13. UNKNOWN Semantics

### When Does Cancellation Become UNKNOWN?

1. **Timeout:** HTTP request to carrier timed out — we don't know if carrier processed it
2. **Network disconnect:** Connection reset/aborted during response — response may have been lost
3. **Malformed response with partial data:** Response received but uninterpretable

### When May UNKNOWN Be Retried?

**Only after reconciliation confirms the carrier state:**
- Reconciliation queries carrier tracking → carrier says "cancelled" → SUCCEEDED
- Reconciliation queries carrier tracking → carrier says "active" → can safely retry → RETRY
- Reconciliation can't reach carrier → stay UNKNOWN, defer

### When Must UNKNOWN Go to Reconciliation?

**Immediately.** UNKNOWN must always set `nextReconciliationAt = NOW()` and `recoveryStatus = 'CANCEL_UNKNOWN'`.

### What Prevents Duplicate Carrier Cancellation?

1. **Idempotency key:** `carrier-cancel:<shipmentId>` is deterministic — same shipment always produces same key
2. **State guard:** Worker checks `carrierCancelStatus` before calling provider — if SUCCEEDED, skip
3. **Aramex:** CancelPickup with same PickupGUID — Aramex may or may not be idempotent (NOT ASSUMED)
4. **Reconciliation:** Before retrying, MUST verify carrier state first

### What If Reconciliation Says Cancel Succeeded?
→ `carrier_cancel_status = 'SUCCEEDED'`, `recoveryStatus = null`

### What If Reconciliation Says Cancel Failed?
→ `carrier_cancel_status = 'RETRY'` or `'RECONCILIATION_REQUIRED'` depending on carrier response

### What If Carrier Says Shipment Is Already Cancelled?
→ `carrier_cancel_status = 'SUCCEEDED'` (desired outcome achieved)

### What If Carrier Reports DELIVERED?
→ `recoveryStatus = 'DELIVERED_AFTER_CANCEL'` per B.0 §12. SCS cancellation is authoritative.

---

## 14. Idempotency Analysis

### Key: `carrier-cancel:<shipmentId>`

| Safety Requirement | Assessment |
|-------------------|------------|
| Duplicate worker safety | **YES** — FOR UPDATE SKIP LOCKED prevents two workers claiming same outbox event |
| Duplicate outbox delivery | **PARTIAL** — deterministic key prevents duplicate *creation* if guarded, but no UNIQUE constraint on idempotency key in DB |
| Worker crash safety | **YES** — lease recovery resets stale PROCESSING → PENDING |
| Timeout safety | **NO** — if worker crashes after carrier processes but before DB update, UNKNOWN + reconciliation handles it |
| Retry safety | **CONDITIONAL** — retry is safe ONLY after reconciliation confirms carrier state |
| Multiple process safety | **YES** — all coordination via DB (FOR UPDATE SKIP LOCKED, leases) |

### Aramex Native Idempotency

**NOT ASSUMED.** Aramex CancelPickup with the same PickupGUID may or may not be idempotent. The B.3.0 lock explicitly states: "Native carrier idempotency is not assumed."

**Consequence:** B3.3 must NOT blindly repeat an uncertain cancellation. After UNKNOWN, reconciliation must determine carrier state before any retry.

### Gap: No UNIQUE Constraint on Idempotency Key

The `carrier_cancel_idempotency_key` column has no UNIQUE constraint. This means:
- Two concurrent `cancelOrder()` calls could create two outbox events with the same idempotency key
- The idempotency key is currently a logical guard, not a database-enforced one
- **Recommendation:** B3.3 should add a UNIQUE partial index or rely on the outbox event creation being inside the cancel transaction (which is already single-writer via optimistic lock)

---

## 15. Concurrency Analysis

### Scenario A: 100 Workers / One Cancel Event
**Resolution:** FOR UPDATE SKIP LOCKED — exactly one worker claims the event. Others skip it.
**Infrastructure:** Proven in B.1/M7.2.3-C create flow (100-concurrent test passes).

### Scenario B: Duplicate Cancel Events for Same Shipment
**Resolution:** The deterministic idempotency key is the same. The worker's idempotent guard (`carrierCancelStatus === 'SUCCEEDED'` → skip) prevents duplicate execution.
**Risk:** Between claim and execution, two events could both pass the guard if they race. Mitigation: the IN_PROGRESS state + lease prevents this.

### Scenario C: Worker Crashes After Claiming Event
**Resolution:** Lease recovery (5 min timeout) resets PROCESSING → PENDING. Another worker picks it up.
**Infrastructure:** Proven in M7.2.3-C.

### Scenario D: Worker Crashes After Carrier Request but Before DB Success
**Resolution:** This is the UNKNOWN scenario. The carrier may have processed the cancellation. The worker's DB write never happened, so `carrierCancelStatus` remains IN_PROGRESS. Lease recovery resets to PENDING. But B3.3 should recognize this and route to UNKNOWN instead of blindly retrying.
**Key insight:** The current `isTimeoutError()` check in `handleCreate()` routes to RECOVERY_REQUIRED. B3.3 cancel must route to UNKNOWN.

### Scenario E: Two Workers Race Retry
**Resolution:** Outbox event claiming is atomic (FOR UPDATE SKIP LOCKED). Only one worker gets the retry event.

### Scenario F: Cancel Races with Carrier DELIVERED
**Resolution:** Per B.0 §12, SCS cancellation is authoritative. `processCarrierDelivery()` must check order status = CANCELLED and reject the delivery, setting `recoveryStatus = 'DELIVERED_AFTER_CANCEL'`.

### Scenario G: Reconciliation Races with Cancellation Worker
**Resolution:** Reconciliation claims via `recoveryStatus = 'RECONCILING'` + lease. Worker claims via outbox event `status = 'PROCESSING'`. They operate on different state fields. If reconciliation sees `carrierCancelStatus = 'IN_PROGRESS'`, it should defer (worker is handling it).

### Scenario H: Multiple Application Processes
**Resolution:** No process-local assumptions. All coordination via PostgreSQL (FOR UPDATE SKIP LOCKED, leases, timestamps).

---

## 16. Failure Matrix

| # | Failure | Detection | State | Recovery |
|---|---------|-----------|-------|----------|
| 1 | Auth error (401) | AuthenticationCarrierError | FAILED | Admin fixes credentials |
| 2 | Rate limit (429) | RateLimitCarrierError | RETRY | Backoff with Retry-After |
| 3 | Server error (500) | RetryableCarrierError | RETRY | Exponential backoff |
| 4 | Timeout | isTimeoutError() | **UNKNOWN** | Reconciliation |
| 5 | Network disconnect | isTimeoutError() | **UNKNOWN** | Reconciliation |
| 6 | Business error (HasErrors=true) | CancelPickupResult | FAILED | No retry — carrier said no |
| 7 | Malformed response | NonRetryableCarrierError | FAILED | No retry — structural |
| 8 | Unsupported | UnsupportedCarrierOperationError | NOT_REQUIRED | No action needed |
| 9 | No pickup scheduled | Pre-check | NOT_REQUIRED | No carrier call |
| 10 | Circuit breaker open | canRequest()=false | RETRY | Backoff, try later |
| 11 | Budget exhausted | isFinal=true | FAILED | Dead-letter, admin review |
| 12 | Worker crash | Lease expiry | PENDING (recovered) | Re-claim |
| 13 | Crash after carrier call | Lease expiry + UNKNOWN | UNKNOWN | Reconciliation |

---

## 17. Security Analysis

| Check | Status | Notes |
|-------|--------|-------|
| Tenant isolation | OK | `resolveCredentials(storeId)` chain |
| Store isolation | OK | Shipment → store → org verified |
| Shipment ownership | OK | Worker loads by ID, verifies existence |
| Credential resolution | OK | Encrypted at rest, decrypted on demand |
| Admin recovery permissions | OK | `admin:shipping:recovery` + org scope |
| Worker payload safety | OK | aggregateId = shipmentId, no secrets in payload |
| Webhook tenant routing | OK | Token-based multi-org routing |
| SSRF protection | OK | `resolveCarrierEndpoint()` + allowlist |
| Error message safety | OK | `toSafeMessage()` redacts credentials |

### IDOR Risks

| Endpoint | Risk | Mitigation |
|----------|------|------------|
| Admin recovery | Shipment ID in URL | Org-scope check (line 208-216) |
| Recovery queue | List filter | Org-store scope (line 292-302) |
| Worker | Shipment lookup by ID | Internal only, no external input |
| Reconciliation | Shipment claim | Internal service, no external input |

**Assessment:** No new IDOR risks introduced by B3.3 if the existing patterns are followed.

---

## 18. Observability Analysis

### Current Observability
- `CarrierObservabilityService` — in-memory counters with periodic flush
- Structured logging via NestJS Logger
- Correlation IDs per carrier request
- Circuit breaker state tracking

### Required B3.3 Metrics/Dimensions

| Dimension | Current | B3.3 Need |
|-----------|---------|-----------|
| shipmentId | In logs | In logs + counters |
| carrierCancelStatus | Not tracked | Counter per state transition |
| attempt | Outbox attempts | Counter |
| idempotencyKey | Not tracked | Log field |
| error class | carrierCreateErrorClass | carrierCancelErrorClass |
| recoveryStatus | Tracked for create | Extend for cancel tokens |
| providerKey | Tracked | Same |
| storeId | In shipment | Log field |

### Missing
- `carrier_cancel_total` counter (attempts)
- `carrier_cancel_failures_total` counter
- `carrier_cancel_unknown_total` counter
- `carrier_cancel_succeeded_total` counter
- Reconciliation cycle metrics for cancel

---

## 19. Migration Assessment

**No new migration required.**

All required columns exist from migration 0049:
- carrier_cancel_status, carrier_cancel_error, carrier_cancel_error_class
- carrier_cancel_retries, carrier_cancel_attempted_at, carrier_cancel_idempotency_key
- carrier_pickup_id, pickup_scheduled

The partial index `idx_shipments_carrier_cancel` already covers the cancel states.

**Exception:** Condition C2 — if `exceptionStatus` is needed for DELIVERED_AFTER_CANCEL, a migration would be required. **Recommendation:** Use `recovery_status = 'DELIVERED_AFTER_CANCEL'` (already a valid recovery token) instead of adding a new column. This avoids a migration.

---

## 20. Required Implementation Phases

### B3.3.1 — Cancellation Execution Foundation
**Scope:**
- Wire `shipping.carrier.cancel` outbox event creation into `cancelOrder()` (or a new `dispatchCarrierCancel()` method)
- Implement `handleCancel()` in the worker (modeled on `handleCreate()`)
- State transitions: NULL → PENDING → IN_PROGRESS → SUCCEEDED/FAILED/NOT_REQUIRED
- Idempotent guard: check `carrierCancelStatus` before calling provider
- Error classification: terminal errors → FAILED, unsupported → NOT_REQUIRED

**Tests:** Unit + PostgreSQL integration

### B3.3.2 — Retry Semantics
**Scope:**
- Retryable errors → RETRY state + outbox retry event
- Exponential backoff via existing CarrierRetryPolicy
- Circuit breaker integration
- Retry budget tracking via `carrierCancelRetries`
- Dead-letter after budget exhaustion → FAILED

**Tests:** Unit + PostgreSQL integration

### B3.3.3 — UNKNOWN / Timeout Handling
**Scope:**
- Timeout detection → UNKNOWN (NOT blind retry)
- Network disconnect → UNKNOWN
- Set `recoveryStatus = 'CANCEL_UNKNOWN'`, `nextReconciliationAt = NOW()`
- UNKNOWN state is terminal from the worker's perspective — only reconciliation can resolve it

**Tests:** Unit + PostgreSQL integration

### B3.3.4 — Reconciliation Integration
**Scope:**
- Extend `CarrierReconciliationService.reconcile()` claim query to include cancel states
- Add cancel-specific reconciliation cases (CA through CF)
- Reconciliation looks up carrier state via tracking
- UNKNOWN + carrier says cancelled → SUCCEEDED
- UNKNOWN + carrier says active → RETRY or RECONCILIATION_REQUIRED
- Admin recovery extension for cancel

**Tests:** PostgreSQL integration

### B3.3.5 — Concurrency / Failure / Recovery Hardening
**Scope:**
- Tracking poller cancel-aware guard (don't advance DELIVERED on cancelled shipment)
- Webhook cancel-event handling (if applicable)
- DELIVERED_AFTER_CANCEL detection in `processCarrierDelivery()`
- 100-concurrent-worker test for cancel
- Worker crash recovery test for cancel
- Failure injection test (rollback proof)

**Tests:** PostgreSQL integration (adversarial)

### B3.3.6 — Independent Runtime Verification
**Scope:** Read-only verification of all B3.3 behavior

### B3.3.7 — Release Closure

---

## 21. Runtime Verification Plan

| Gate | Method |
|------|--------|
| Cancel execution correctness | PostgreSQL integration test |
| Retry semantics | Unit + integration |
| UNKNOWN handling | Integration + timeout injection |
| Reconciliation | Integration with real cancel states |
| Concurrency (100 workers) | Integration test |
| Crash recovery | Integration + lease expiry test |
| Failure injection | Rename table → full rollback proof |
| Idempotency | Duplicate event test |
| DELIVERED_AFTER_CANCEL | Integration test |
| Security (tenant isolation) | Cross-org test |
| TypeScript | `tsc --noEmit` |
| Nest build | `nest build` |
| Full regression | All existing suites |

---

## 22. Risks

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | Timeout creates UNKNOWN but lease recovery resets to PENDING → blind retry | HIGH | handleCancel must check isTimeoutError BEFORE marking IN_PROGRESS→UNKNOWN, and the guard must prevent re-execution of UNKNOWN shipments |
| R2 | No UNIQUE constraint on idempotency key | MEDIUM | Rely on outbox event creation inside cancel transaction (optimistic lock prevents double-cancel) |
| R3 | Reconciliation doesn't know about cancel states | HIGH | B3.3.4 explicitly extends reconciliation |
| R4 | Tracking poller advances DELIVERED on cancelled shipment | HIGH | B3.3.5 adds cancel-aware guard |
| R5 | `exceptionStatus` column doesn't exist | LOW | Use `recovery_status` token instead |
| R6 | Aramex CancelPickup not idempotent at carrier | MEDIUM | Never blindly retry after UNKNOWN; reconciliation first |
| R7 | Webhook cancel events not processed | LOW | Current webhook processing is generic; cancel confirmation would update carrier status. B3.3.5 can add specific handling if needed |

---

## 23. Business Decisions Still Requiring Lock

All critical business decisions are already locked in B.0:

| Decision | Status | Location |
|----------|--------|----------|
| SCS cancellation authoritative | LOCKED | B.0 §11 |
| Aramex canCancelPickup = true | LOCKED | B.0 §11 |
| Manual driver = NOT_REQUIRED | LOCKED | B.0 §11 |
| Timeout = unknown result | LOCKED | B.0 §11 |
| Failure = reconciliation flag | LOCKED | B.0 §11 |
| DELIVERED_AFTER_CANCEL = SCS wins | LOCKED | B.0 §12 |
| Deterministic key format | LOCKED | B.3.0 |
| State vocabulary (8 values) | LOCKED | B.3.1 |
| Recovery tokens (5 tokens) | LOCKED | B.3.1 |

**No additional business decisions required.** The architecture audit confirms all semantics are defined.

---

## 24. Final Verdict

### GO WITH CONDITIONS

B3.3 can proceed to implementation. The infrastructure is mature, the provider abstraction is proven, the state foundation is in place, and all business rules are locked.

**Conditions to resolve during implementation:**

| # | Condition | Phase | Resolution |
|---|-----------|-------|------------|
| C1 | Outbox event creation wiring | B3.3.1 | Add `dispatchCarrierCancel()` inside cancelOrder transaction |
| C2 | `exceptionStatus` column missing | B3.3.5 | Use `recovery_status = 'DELIVERED_AFTER_CANCEL'` (no migration needed) |
| C3 | Reconciliation cancel extension | B3.3.4 | Extend claim query + add cancel cases |
| C4 | Tracking/webhook cancel guards | B3.3.5 | Add `carrierCancelStatus` checks |

**No NO-GO issues identified.** All risks have clear mitigations within the phased plan.
