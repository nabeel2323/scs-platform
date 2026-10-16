# SCS-M7.3-B.3.4 — Pre-Implementation Architecture Audit

**Tracking Redesign, Active-State Verification, and Delivered-After-Cancel**

| Field | Value |
|---|---|
| Milestone | M7.3-B.3.4 |
| Task type | Pre-implementation architecture audit — READ-ONLY |
| Status | **COMPLETE** |
| Verdict | **GO WITH CONDITIONS** (8 conditions) |
| Date | 2026-10-01 |
| Branch | develop |
| HEAD | ac000d0 |
| Predecessor | B.3.3.3 CLOSED/PASS |
| Parent Lock | SCS-M7.3-B.3.3.3-BUSINESS-RULES-ARCHITECTURE-LOCK.md (LOCKED) |

---

## 1. Metadata

This audit investigates whether the SCS shipping/cancellation/tracking architecture can safely progress from the current B.3.3.3 indeterminate outcome reconciliation into a fully reliable cancellation/tracking lifecycle. It specifically addresses:

1. Full tracking redesign requirements
2. Definitive carrier active/cancelled state verification
3. UNKNOWN → PENDING safety
4. Reconciliation-driven re-cancel
5. Delivered-after-cancel handling
6. Tracking poller behavior
7. Webhook/tracking/cancellation races
8. Admin recovery completeness
9. Concurrency and tenant isolation
10. Possible unique index / B.3.3.5 requirement

---

## 2. Scope

### In Scope
- All shipping module source files (worker, reconciliation, poller, admin, webhook, providers)
- Order cancellation and delivery flows
- Inventory settlement flow
- Shipment schema and migration 0049
- Outbox event processing
- Aramex provider (tracking, cancel, status mapping)
- All B.3.3.x test suites and documentation

### Out of Scope
- New carrier integrations
- Payment/returns/refunds/disputes
- Mobile app changes
- Admin console UI changes
- New migrations (audit only)

---

## 3. Evidence Reviewed

### Source Files
| File | Lines | Role |
|---|---|---|
| `shipping-carrier.worker.ts` | 938 | Outbox event processing (create/cancel/track/webhook) |
| `carrier-reconciliation.service.ts` | 602 | Create + cancel reconciliation |
| `carrier-tracking-poller.ts` | 337 | Periodic tracking poll with B.3.3.3 minimal guard |
| `carrier-admin.controller.ts` | 363 | Admin recovery endpoints |
| `carrier-webhook.controller.ts` | 334 | Inbound carrier webhook handler |
| `shipping-provider.ts` | 107 | Abstract provider interface |
| `aramex.provider.ts` | 1117 | Aramex implementation |
| `aramex-status.mapper.ts` | 123 | Aramex tracking status mapping |
| `shipment.schema.ts` | 105 | Shipments + shipment_events Drizzle schema |
| `shipping.types.ts` | 305 | Cancel status vocabulary, recovery tokens, types |
| `orders.service.ts` | 2587 | Order FSM, cancelOrder, processCarrierDelivery, settleStockForStatus |
| `0049_carrier_cancellation.sql` | 45 | Cancel columns + partial index |

### Documentation
| Document | Status |
|---|---|
| `SCS-M7.3-B.3.3.3-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md` | COMPLETE |
| `SCS-M7.3-B.3.3.3-BUSINESS-RULES-ARCHITECTURE-LOCK.md` | LOCKED |
| `SCS-M7.3-B.3.3.3-IMPLEMENTATION-REPORT.md` | COMPLETE |
| `SCS-M7.3-B.3.3.3-FIX-1-IMPLEMENTATION-REPORT.md` | COMPLETE |
| `SCS-M7.3-B.3.3.3-INDEPENDENT-RUNTIME-VERIFICATION.md` | BLOCKED (DEFECT-001) |
| `SCS-M7.3-B.3.3.3-INDEPENDENT-RUNTIME-VERIFICATION-R2.md` | PASS |
| `SCS-M7.3-B.3.3.3-RELEASE-CLOSURE.md` | CLOSED/PASS |

---

## 4. Current Architecture

### Component Topology

```
┌──────────────────────────────────────────────────────────────────────┐
│                         OUTBOX EVENTS                                │
│  shipping.carrier.create  │  shipping.carrier.cancel  │  track/wh   │
└──────────┬────────────────┴──────────┬────────────────┴─────────────┘
           │                           │
           ▼                           ▼
┌──────────────────────┐   ┌──────────────────────┐
│  ShippingCarrierWorker│   │ CarrierReconciliation │
│  (5s poll, 5min lease)│   │ Service (10min cycle) │
│  FOR UPDATE SKIP LOCKED│  │ FOR UPDATE SKIP LOCKED│
└──────────┬───────────┘   └──────────┬────────────┘
           │                           │
           ▼                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     SHIPMENTS TABLE                                   │
│  carrier_create_status  │  carrier_cancel_status  │  recovery_status │
│  carrier_tracking_id    │  carrier_cancel_retries │  next_recon_at   │
└──────────┬───────────────────────────────────────────────────────────┘
           │
     ┌─────┼─────┐
     ▼     ▼     ▼
┌────────┐ ┌──────────────┐ ┌──────────────────┐
│Tracking│ │  Webhook      │ │  Admin Recovery   │
│Poller  │ │  Controller   │ │  Controller       │
│(10min) │ │  (HMAC auth)  │ │  (RBAC gated)     │
└────────┘ └──────────────┘ └──────────────────┘
```

### Key Invariants
1. **SCS cancellation is authoritative**: `TRANSITIONS['CANCELLED'] = []` — no carrier event can change a cancelled order.
2. **FOR UPDATE SKIP LOCKED** is the sole concurrency mechanism for both worker claims and reconciliation claims.
3. **Create and cancel are separate lifecycles** with separate column groups and separate state machines.
4. **Reconciliation uses a shared `running` flag** — create and cancel cycles are mutually exclusive within a single process.

---

## 5. Current Cancellation State Machine

```
NULL → PENDING           (cancelOrder sets carrierCancelStatus='PENDING')
PENDING → IN_PROGRESS    (worker claims via FOR UPDATE SKIP LOCKED)
IN_PROGRESS → SUCCEEDED  (carrier confirms: HasErrors=false)
IN_PROGRESS → FAILED     (terminal carrier error)
IN_PROGRESS → NOT_REQUIRED (manual provider / unsupported)
IN_PROGRESS → UNKNOWN    (indeterminate transport failure: isTimeoutError=true)
IN_PROGRESS → PENDING    (retryable error: outbox retry via handleFailure)

UNKNOWN → SUCCEEDED              (reconciliation: tracking confirms CANCELLED)
UNKNOWN → RECONCILIATION_REQUIRED (reconciliation: 24h boundary OR 8 attempts)
UNKNOWN → UNKNOWN                (reconciliation: inconclusive, within budget)

RECONCILIATION_REQUIRED → SUCCEEDED (admin/reconciliation resolves)
RECONCILIATION_REQUIRED → PENDING   (admin triggers retry)
```

### Terminal States
- `SUCCEEDED` — terminal, never downgraded
- `NOT_REQUIRED` — terminal, never downgraded
- `FAILED` — terminal after definitive carrier rejection
- `RECONCILIATION_REQUIRED` — persistent, admin-visible, not auto-retried

---

## 6. Current Tracking State Machine

### Tracking Poller (`carrier-tracking-poller.ts`)

**Claim query** (lines 172-189):
```sql
WHERE carrier_create_status = 'SUCCESS'
  AND carrier_tracking_id IS NOT NULL
  AND (carrier_status_mapped IS NULL
       OR carrier_status_mapped NOT IN ('DELIVERED', 'CANCELLED', 'COMPLETED'))
  AND (carrier_cancel_status IS NULL
       OR carrier_cancel_status NOT IN ('SUCCEEDED', 'NOT_REQUIRED'))  -- B.3.3.3 C5 guard
  AND (last_carrier_sync_at IS NULL OR last_carrier_sync_at <= cutoff)
```

**Status progression** (lines 41-49):
```
CREATED → RECORD_CREATED → PICKED_UP → IN_TRANSIT → PROCESSING_AT_FACILITY
→ OUT_FOR_DELIVERY → DELIVERED
```

**Terminal statuses**: DELIVERED, CANCELLED, COMPLETED

**Forward-only rule**: `canTransition()` prevents backward movement. Unknown carrier codes are allowed (pass-through).

**Delivery bridge** (lines 248-260): When tracking reports DELIVERED, calls `ordersService.processCarrierDelivery()`.

### Aramex Status Mapping (`aramex-status.mapper.ts`)

| Aramex Code | Internal Status | Verified? |
|---|---|---|
| SH001 | PICKED_UP | VERIFIED |
| SH002 | IN_TRANSIT | VERIFIED |
| SH003 | OUT_FOR_DELIVERY | VERIFIED |
| SH004/SH005 | DELIVERED | VERIFIED |
| SH006 | RETURN_TO_ORIGIN | VERIFIED |
| SH012 | CANCELLED | VERIFIED |
| SH013 | REJECTED | VERIFIED |
| SH014 | RECORD_CREATED | VERIFIED |
| SH160 | PROCESSING_AT_FACILITY | VERIFIED |

**CRITICAL**: There is NO `PICKUP_CANCELLED` in the Aramex status mapper. The only cancellation code is SH012 → `CANCELLED`. The reconciliation service checks for `PICKUP_CANCELLED` (line 467) but this status is unreachable through the tracking path.

---

## 7. Carrier Reconciliation Flow

### Create Reconciliation
- Claims: `carrier_create_status IN ('RECOVERY_REQUIRED', 'PENDING', 'IN_PROGRESS')` with due `next_reconciliation_at`
- Uses `recoveryStatus = 'RECONCILING'` as claim marker
- Cases: A (complete), B (recover via tracking), C (safe retry), D (defer)

### Cancel Reconciliation (B.3.3.3)
- Claims: `carrier_cancel_status IN ('UNKNOWN', 'RECONCILIATION_REQUIRED')` with due `next_reconciliation_at`
- Same `recoveryStatus = 'RECONCILING'` claim marker
- Same shared `running` flag as create reconciliation
- Cases: CA (terminal), CB (24h boundary), CC (budget), CD (tracking confirms), CE (transport error), CF (ambiguous)

### Shared Mutex Risk
Both create and cancel reconciliation use the same `this.running` boolean (line 63). If create reconciliation is running, cancel reconciliation returns `[]` immediately. In a single-process deployment this is safe but introduces potential delay. In multi-process deployments, FOR UPDATE SKIP LOCKED handles cross-process safety.

---

## 8. Tracking/Cancellation Race Analysis

### Race A: Cancellation → Tracking DELIVERED

**Scenario**: SCS cancels order → worker calls CancelPickup → carrier confirms SUCCEEDED → tracking poller later receives DELIVERED from carrier.

**Current behavior**:
1. Order is CANCELLED (terminal). `TRANSITIONS['CANCELLED'] = []`.
2. `processCarrierDelivery()` checks `TRANSITIONS[order.status]` → `[]` → `allowed.includes('DELIVERED')` = false → returns false.
3. Shipment `carrier_status_mapped` may advance to DELIVERED (no cancel-aware guard for SUCCEEDED cancel status in poller — wait, the C5 guard DOES exclude SUCCEEDED: line 182).
4. **SAFE**: Poller excludes `carrier_cancel_status = 'SUCCEEDED'`. Shipment not polled.

**Verdict**: SAFE. Double-guard: order FSM rejects it AND tracking poller excludes it.

### Race B: Cancellation → Tracking CANCELLED

**Scenario**: SCS cancels → carrier confirms via tracking SH012 (CANCELLED).

**Current behavior**: Tracking poller writes `carrier_status_mapped = 'CANCELLED'`. But `TERMINAL_STATUSES` includes 'CANCELLED' → `canTransition()` returns false for further events → polling stops.

**Verdict**: SAFE. Consistent with SCS cancellation.

### Race C: UNKNOWN → Tracking CANCELLED

**Scenario**: Cancel → UNKNOWN → reconciliation checks tracking → tracking shows SH012 (CANCELLED).

**Current behavior**:
1. Reconciliation calls `provider.getTrackingInfo(trackingId)`.
2. `trackingInfo.status` = 'CANCELLED' (from Aramex mapper SH012).
3. Line 464: `status = 'CANCELLED'.toUpperCase()` = 'CANCELLED'.
4. Line 467: `status === 'CANCELLED'` → TRUE → `resolveCancelSucceeded()` → SUCCEEDED.

**Verdict**: SAFE and CORRECT. This is the designed path.

### Race D: UNKNOWN → Tracking ACTIVE

**Scenario**: Cancel → UNKNOWN → reconciliation checks tracking → tracking shows IN_TRANSIT.

**Current behavior**:
1. `trackingInfo.status` = 'IN_TRANSIT'.
2. Line 467: `'IN_TRANSIT' === 'CANCELLED'` → false. Not matched.
3. Falls through to line 486-496: increment attempt, defer or escalate.

**Verdict**: SAFE. Conservative — does not assume cancellation succeeded.

### Race E: UNKNOWN → Tracking Ambiguous

**Scenario**: Cancel → UNKNOWN → tracking returns no data or unknown status.

**Current behavior**:
1. `trackingInfo` is null or status is unknown.
2. Falls through to defer/escalate.

**Verdict**: SAFE. Conservative.

### Race F: Reconciliation → Cancellation

**Scenario**: Reconciliation is processing a shipment while a new cancel event arrives.

**Current behavior**:
1. Reconciliation sets `recoveryStatus = 'RECONCILING'` (claim marker).
2. Worker `handleCancel()` does NOT check `recoveryStatus` before processing.
3. Worker checks `carrierCancelStatus` idempotent guard (SUCCEEDED/NOT_REQUIRED skip).
4. If cancel status is UNKNOWN, worker proceeds with a new cancel attempt.

**Risk**: Worker could call CancelPickup while reconciliation is also querying the carrier. However, this is not dangerous because:
- The idempotency key `carrier-cancel:<shipmentId>` prevents double-cancel at the carrier.
- Reconciliation's tracking query is read-only.
- Worker's cancel is idempotent.

**Verdict**: SAFE. Idempotency key prevents double execution.

### Race G: Reconciliation → Tracking

**Scenario**: Reconciliation queries tracking while tracking poller also polls.

**Current behavior**: Both call `provider.getTrackingInfo()` independently. Both are read-only carrier queries. Both write to `carrier_status_mapped` / `lastCarrierSyncAt`.

**Risk**: Minor — both write the same status. `lastCarrierSyncAt` is a throttle timestamp. No state corruption possible.

**Verdict**: SAFE. Both are read-only carrier queries with convergent writes.

### Race H: Webhook → Cancellation

**Scenario**: Carrier webhook arrives while cancel worker is processing.

**Current behavior**:
1. Webhook controller persists `carrier_webhook_events` row (dedup via UNIQUE).
2. Webhook processing is essentially: persist + mark processed. No state mutation on shipment.
3. Cancel worker operates independently on `carrier_cancel_status`.

**Verdict**: SAFE. Webhook and cancel operate on different tables/state.

### Race I: Cancellation → Webhook

**Scenario**: Cancel succeeds → carrier sends webhook about the now-cancelled shipment.

**Current behavior**: Webhook is persisted. No state change on shipment. The webhook doesn't trigger any cancel-aware processing.

**Verdict**: SAFE but see Finding F-06 (webhook doesn't process cancellation events).

### Race J: Admin Recovery → Worker

**Scenario**: Admin triggers recovery while worker is processing the same shipment.

**Current behavior**:
1. Admin sets `recoveryStatus = 'ADMIN_TRIGGERED'`, `nextReconciliationAt = NOW()`.
2. Admin calls `reconciliation.reconcileShipment(freshShipment)`.
3. Reconciliation claim query excludes `recoveryStatus = 'ADMIN_TRIGGERED'` (line 374).
4. But admin calls `reconcileShipment()` directly, bypassing the claim.

**Risk**: Worker and admin could process the same shipment concurrently. However, the admin call is synchronous and the worker processes via outbox events. The shipment's `carrierCancelStatus` is the final authority. Both paths use Drizzle ORM `.update().where()` which is atomic.

**Verdict**: SAFE. Atomic DB writes prevent corruption. Admin may see stale data but the final state is correct.

### Race K: Worker → Admin Recovery

**Scenario**: Worker resolves UNKNOWN → SUCCEEDED while admin is viewing recovery queue.

**Current behavior**: Admin sees stale data until refresh. No state corruption.

**Verdict**: SAFE. UI consistency issue only.

### Race L: Carrier Delayed Response → SCS Cancellation

**Scenario**: CancelPickup times out (UNKNOWN) → carrier later processes the cancel → carrier sends delayed confirmation via tracking.

**Current behavior**:
1. UNKNOWN set by worker.
2. Reconciliation picks up on next cycle.
3. Tracking shows CANCELLED → SUCCEEDED.

**Verdict**: SAFE. This is the designed reconciliation path.

### Race M: Carrier Reports DELIVERED After SCS CANCELLED

**Scenario**: SCS cancels order → carrier cancel fails silently (UNKNOWN) → carrier delivers the package.

**Current behavior**:
1. Order is CANCELLED.
2. `processCarrierDelivery()` checks `TRANSITIONS['CANCELLED']` → `[]` → returns false.
3. **No inventory SALE settlement** — `settleStockForStatus` is never called.
4. Shipment `carrier_status_mapped` may advance to DELIVERED via tracking poller (UNKNOWN cancel status is NOT excluded from polling).
5. Shipment `status` remains 'CANCELLED' (set by cancelOrder).

**Risk**: Shipment `carrier_status_mapped` diverges from shipment `status`. The physical package is delivered but SCS considers it cancelled. This is a **business-level exception** that requires human intervention.

**Verdict**: ORDER SAFE (no incorrect inventory/order transition). But see Finding F-03 (shipment state divergence) and F-04 (no exception event recorded).

---

## 9. Delivered-After-Cancel Analysis

### Trace: SCS CANCELLED + Carrier DELIVERED

```
cancelOrder() transaction:
  1. orders.status = 'CANCELLED' (optimistic lock)
  2. settleStockForStatus('CANCELLED') → RELEASE outstanding reservations
  3. shipments.status = 'CANCELLED'
  4. outbox: shipping.carrier.cancel

Worker handleCancel():
  5. carrierCancelStatus = 'IN_PROGRESS'
  6. provider.cancelPickup() → timeout → carrierCancelStatus = 'UNKNOWN'

Carrier delivers the package (physical world):
  7. Carrier tracking shows DELIVERED

Tracking poller (if carrier_cancel_status = UNKNOWN, NOT excluded):
  8. carrier_status_mapped = 'DELIVERED'
  9. processCarrierDelivery(orderId) called
  10. TRANSITIONS['CANCELLED'] = [] → returns false
  11. No inventory SALE, no order transition
```

### What Does NOT Happen (Safe)
- ❌ Shipment `status` does NOT become DELIVERED (only `carrier_status_mapped` does)
- ❌ Sub-order does NOT become DELIVERED (order FSM blocks it)
- ❌ Master order does NOT become DELIVERED (aggregation reads sub-order statuses)
- ❌ Inventory SALE does NOT happen (settleStockForStatus never called for DELIVERED)
- ❌ No refund is triggered
- ❌ No duplicate inventory settlement

### What DOES Happen (Gap)
- ✅ `carrier_status_mapped` advances to DELIVERED (cosmetic divergence)
- ❌ No exception event is recorded (no `shipment.exception` or `shipment.reconciliation_required`)
- ❌ No admin notification
- ❌ The physical delivery is invisible to SCS operations

### Required Architecture (Not Implemented)
To handle this properly, B.3.3.4/B.3.3.5 would need:
1. Tracking poller detects DELIVERED on a cancelled shipment → writes exception event
2. Outbox event: `shipment.exception.delivered_after_cancel`
3. Admin recovery queue entry with `recoveryStatus = 'DELIVERED_AFTER_CANCEL'`
4. Human decides: accept delivery (reverse cancel) or initiate return

---

## 10. Aramex Evidence Matrix

| Capability | Evidence Level | Source | Detail |
|---|---|---|---|
| CancelPickup success | **VERIFIED** | `aramex.provider.ts:729-733` | `HasErrors=false` → `cancelled:true` |
| CancelPickup business error | **VERIFIED** | `aramex.provider.ts:718-726` | `HasErrors=true` → `cancelled:false` + reason |
| CancelPickup malformed response | **VERIFIED** | `aramex.provider.ts:707-716` | Structural guard throws NonRetryableCarrierError |
| Tracking SH012 = Cancelled | **VERIFIED** | `aramex-status.mapper.ts:40` | SH012 → CANCELLED |
| Tracking PICKUP_CANCELLED | **UNKNOWN** | Not in mapper | No Aramex code maps to PICKUP_CANCELLED |
| CancelPickup "already cancelled" response | **UNKNOWN** | Not verified | No live API verification of what Aramex returns for double-cancel |
| GetPickupStatus API | **NOT AVAILABLE** | Not in codebase | No Aramex pickup-status endpoint implemented |
| Active pickup detection via tracking | **ASSUMPTION** | Inference | SH014 (RECORD_CREATED) or SH001 (PICKED_UP) suggest active, but NOT definitive proof |
| Aramex idempotent CancelPickup | **UNKNOWN** | Not verified | Whether calling CancelPickup twice with same GUID is safe is not known |

### Key Uncertainty
The fundamental gap: **there is no verified way to definitively establish that a pickup remains active at Aramex after a cancellation attempt.** Tracking codes SH001/SH014 suggest activity but are not proof that the specific cancellation was not processed. This blocks:
- UNKNOWN → PENDING safe retry (BD-09)
- Reconciliation-driven re-cancel (BD-10)

---

## 11. Active-State Verification Analysis

### Can the Current Provider Abstraction Establish Definitive States?

| State | Can Establish? | Method | Confidence |
|---|---|---|---|
| Definitively cancelled | **YES** | CancelPickup `HasErrors=false` OR tracking SH012 | HIGH |
| Definitively active | **NO** | No verified method | NONE |
| Ambiguous/unknown | **YES** | Everything else | HIGH |

### Why Active-State Cannot Be Proven
1. `getTrackingInfo()` returns shipment tracking status, not pickup status. A shipment may show IN_TRANSIT even after a successful pickup cancellation (carrier may not update tracking immediately).
2. No `getPickupStatus()` exists in the provider interface or Aramex implementation.
3. Aramex's CancelPickup with `HasErrors=true` could mean "already cancelled" OR "invalid GUID" OR "not found" — these cannot be reliably distinguished without live API verification.

### Is `getPickupStatus()` Genuinely Required?
**YES, for the full lifecycle.** Without it:
- UNKNOWN → PENDING safe retry remains blocked (cannot prove pickup active)
- Reconciliation-driven re-cancel remains blocked (same reason)
- Reconciliation accuracy is limited to tracking-based cancellation confirmation only

### If `getPickupStatus()` Were Implemented

**Required return value:**
```typescript
interface PickupStatusResult {
  status: 'ACTIVE' | 'CANCELLED' | 'UNKNOWN';
  pickupId: string;
  carrierStatus?: string;  // raw carrier response
  verifiedAt: Date;
}
```

**Provider capability implications:**
- Add `canGetPickupStatus: boolean` to `ProviderCapabilities`
- Default: `false` (ManualDeliveryProvider, unknown providers)
- Aramex: requires live API verification first

**Tenant/security implications:**
- Same credential resolution as other Aramex operations
- Same tenant-scoped provider registry lookup
- No new attack surface

**Testing requirements:**
- Unit tests for each status response
- HTTP mock tests for Aramex response parsing
- PostgreSQL tests for state transitions
- Live Aramex sandbox verification before production use

---

## 12. UNKNOWN → PENDING Analysis

### Evidence Required Before Safe

Before UNKNOWN → PENDING is safe, the system must prove:
1. The pickup **remains active** at the carrier (the cancellation was NOT processed)
2. A new CancelPickup call will not produce a duplicate cancellation
3. The idempotency key is still valid

### Current Blockers
1. **No active-state proof** (Section 11)
2. **No Aramex idempotency verification** — unknown whether CancelPickup with same GUID is safe
3. **No carrier-side cancellation state check**

### Recommended Transition Design

**Automatic**: NO — too risky without definitive active proof.

**Reconciliation-only**: YES — but only when reconciliation produces definitive active evidence.

**Admin-assisted**: YES — admin can manually verify with carrier and trigger retry.

**Recommended path:**
```
UNKNOWN → (reconciliation definitively proves active via getPickupStatus)
  → PENDING → outbox cancel event → worker → CancelPickup

UNKNOWN → (admin verifies with carrier)
  → admin triggers recovery → PENDING → outbox cancel event
```

**Guard conditions (all must be true):**
1. `getPickupStatus()` returns `ACTIVE` (or equivalent definitive evidence)
2. `carrier_cancel_idempotency_key` exists (deterministic key available)
3. Reconciliation budget not exhausted
4. 24h boundary not exceeded

---

## 13. Re-Cancel Analysis

### Can Reconciliation Safely Invoke CancelPickup?

**Current answer**: NO — because active state cannot be proven.

**Required invariant**: Carrier state must first be proven ACTIVE before CancelPickup is called.

**If active state could be proven:**
```
reconcileCancelShipment():
  1. getPickupStatus() → ACTIVE
  2. carrierCancelStatus = PENDING
  3. recoveryStatus = null
  4. nextReconciliationAt = null
  5. Publish outbox event: shipping.carrier.cancel
  6. Worker re-claims and re-executes CancelPickup
```

**Until active state can be proven:**
- Reconciliation remains conservative (current B.3.3.3 behavior)
- Ambiguous → defer/escalate, never re-cancel
- Admin is the only path for manual intervention

---

## 14. Tracking Poller Analysis

### Current Behavior

| Shipment State | Polled? | Rationale |
|---|---|---|
| `carrier_cancel_status = NULL` | YES | Normal tracking |
| `carrier_cancel_status = 'PENDING'` | YES | Cancel not yet attempted |
| `carrier_cancel_status = 'IN_PROGRESS'` | YES | Cancel in flight |
| `carrier_cancel_status = 'SUCCEEDED'` | **NO** | C5 guard excludes |
| `carrier_cancel_status = 'NOT_REQUIRED'` | **NO** | C5 guard excludes |
| `carrier_cancel_status = 'FAILED'` | YES | Terminal cancel, but tracking continues |
| `carrier_cancel_status = 'UNKNOWN'` | YES | Minimal guard — full cancel-aware tracking deferred |
| `carrier_cancel_status = 'RECONCILIATION_REQUIRED'` | YES | Same as UNKNOWN |

### Issues Identified

**F-03: Shipment state divergence for cancelled orders**
When a cancelled order's shipment is still polled (UNKNOWN/FAILED), tracking can advance `carrier_status_mapped` to DELIVERED while shipment `status` remains CANCELLED. This creates a divergence visible in admin views.

**Recommendation**: B.3.3.4 should extend the tracking poller guard to exclude additional cancel states OR record an exception event when DELIVERED is detected on a cancelled shipment.

### Is Tracking Monotonic?
YES — `canTransition()` enforces forward-only progression. Terminal states (DELIVERED, CANCELLED, COMPLETED) block further transitions.

### Can Tracking Resurrect Cancelled Shipments?
**Shipment status**: NO — the poller writes `carrier_status_mapped`, not `status`. Shipment `status = 'CANCELLED'` is set by `cancelOrder()` and never touched by the poller.

**Order status**: NO — `processCarrierDelivery()` checks `TRANSITIONS['CANCELLED'] = []` → returns false.

**Inventory**: NO — `settleStockForStatus('DELIVERED')` is only called inside `processCarrierDelivery()` which returns false for cancelled orders.

### Does Tracking Cause Inventory Settlement?
Only through `processCarrierDelivery()`. For cancelled orders, this is a no-op. For non-cancelled orders, DELIVERED triggers SALE settlement.

---

## 15. Webhook Analysis

### Current Webhook Processing

1. **Inbound**: HMAC-SHA256 verification, tenant routing via webhook token
2. **Dedup**: UNIQUE(provider_key, external_delivery_id) on `carrier_webhook_events`
3. **Processing**: Persist event + link to shipment + mark processed
4. **Retry**: On failure, insert outbox `shipping.carrier.webhook.retry` event

### Webhook vs Cancellation

**Critical finding**: The webhook controller does NOT process carrier cancellation events. It persists them but takes no action. Specifically:
- No check for cancellation-related event types
- No state change on `carrier_cancel_status`
- No outbox event for cancel-related webhooks

**Impact**: If a carrier sends a webhook confirming cancellation, SCS ignores it. The only cancellation confirmation path is the synchronous CancelPickup response.

### Webhook vs Tracking

Webhook and tracking poller can both receive the same carrier event (e.g., DELIVERED). The tracking poller writes `carrier_status_mapped` and calls `processCarrierDelivery()`. The webhook only persists the event.

**Dedup gap**: Webhook dedup is by `UNIQUE(provider_key, external_delivery_id)`. Tracking dedup is by fingerprint on `shipment_events.external_event_id`. These are independent — the same event can exist in both `carrier_webhook_events` and `shipment_events`.

### Race: Webhook + Tracking Poller
Both can process the same carrier event. The tracking poller advances `carrier_status_mapped`; the webhook persists the raw event. No state corruption — they write different columns/tables.

### Race: Webhook + Worker
Webhook processing is HTTP-side (persist + mark processed). Worker processing is outbox-side (state machine). They operate on different tables. No race.

---

## 16. Concurrency Analysis

### Existing Mechanisms

| Mechanism | Location | Purpose |
|---|---|---|
| FOR UPDATE SKIP LOCKED (outbox) | `shipping-carrier.worker.ts:171-186` | Worker event claiming |
| FOR UPDATE SKIP LOCKED (reconciliation) | `carrier-reconciliation.service.ts:183,377` | Reconciliation claiming |
| FOR UPDATE SKIP LOCKED (tracking) | `carrier-tracking-poller.ts:186` | Tracking poll claiming |
| Optimistic lock (order FSM) | `orders.service.ts:2229-2236` | Order status transitions |
| UNIQUE (webhook dedup) | `carrier_webhook_events` | Webhook deduplication |
| PG 23505 catch (tracking dedup) | `carrier-tracking-poller.ts:325` | Tracking event dedup |
| Idempotency key | `carrier-cancel:<shipmentId>` | Cancel double-execution prevention |
| State guard | `carrierCancelStatus` checks | Worker idempotent skip |

### Additional Locks Needed?

**1. Two reconciliation workers**: Protected by FOR UPDATE SKIP LOCKED. Proven at 100 workers.

**2. Reconciliation + tracking**: Both read carrier state. Tracking writes `carrier_status_mapped`; reconciliation reads tracking. No write-write conflict. SAFE.

**3. Reconciliation + cancellation**: Worker writes `carrierCancelStatus`; reconciliation reads it. Reconciliation sets `recoveryStatus = 'RECONCILING'`. Worker does NOT check `recoveryStatus`. Potential for concurrent writes to same row, but atomic UPDATE WHERE prevents corruption. SAFE.

**4. Tracking + cancellation**: Tracking poller writes `carrier_status_mapped`; cancel worker writes `carrierCancelStatus`. Different columns. SAFE.

**5. Webhook + tracking**: Different tables. SAFE.

**6. Admin recovery + worker**: Admin calls `reconcileShipment()` directly; worker processes outbox events. Both write `carrierCancelStatus` atomically. SAFE.

### Unique Index Question (B.3.3.5)

**What invariant would it enforce?** At-most-one pending cancel event per shipment.

**What duplicate currently remains possible?** Multiple `shipping.carrier.cancel` outbox events for the same shipment (e.g., from duplicate outbox inserts). However, the worker's idempotent guard (`carrierCancelStatus === 'SUCCEEDED'` → skip) prevents double execution.

**Are application-level guards sufficient?** YES for correctness. The state guard + idempotency key prevent any double execution even without a DB constraint.

**Is DB-level uniqueness still desirable?** YES as defense-in-depth. A partial unique index on `outbox_events(event_type, aggregate_id) WHERE status IN ('PENDING', 'PROCESSING')` would prevent multiple active cancel events at the DB level.

**Migration required**: Yes — a new migration would be needed.

---

## 17. Database Analysis

### Migration 0049 Sufficiency

| Column | Type | Sufficient? | Notes |
|---|---|---|---|
| `carrier_cancel_status` | VARCHAR(24) | YES | All B.3.3.3 states fit |
| `carrier_cancel_error` | TEXT | YES | — |
| `carrier_cancel_error_class` | VARCHAR(40) | YES | — |
| `carrier_cancel_retries` | INTEGER DEFAULT 0 | YES | Repurposed as reconciliation attempt counter |
| `carrier_cancel_attempted_at` | TIMESTAMPTZ | YES | 24h boundary clock |
| `carrier_cancel_idempotency_key` | VARCHAR(120) | YES | `carrier-cancel:<shipmentId>` |
| `recovery_status` | VARCHAR(24) | YES | Cancel tokens fit |
| `next_reconciliation_at` | TIMESTAMPTZ | YES | Scheduling |
| `idx_shipments_carrier_cancel` | Partial index | YES | Covers active cancel states |

### Is Additional Schema Required?

**For B.3.3.4**: Possibly.
- If `getPickupStatus()` is implemented, no new shipment column needed (result is transient).
- If delivered-after-cancel exception events are recorded, `shipment_events` can hold them (existing schema).
- If a separate reconciliation attempt counter is needed, a new column would be required (but current reuse of `carrier_cancel_retries` works).

**For B.3.3.5**:
- Partial unique index on `outbox_events` for at-most-one-pending-cancel (new migration).

### Tracking Event Dedup Gap

The `shipment_events.external_event_id` column has NO database-level UNIQUE constraint. Dedup is application-level via PG 23505 catch on insert. However, the unique index that the poller relies on may not exist — the poller's comment says "UNIQUE constraint on externalEventId" but migration review shows only non-unique indexes on `external_event_id`.

**Risk**: Concurrent tracking poller instances could insert duplicate tracking events. The PG 23505 catch handles this gracefully (idempotent ded), but only if the unique index actually exists.

---

## 18. Security Analysis

| Check | Status | Evidence |
|---|---|---|
| Tenant isolation (reconciliation) | SAFE | Provider resolved from shipment → store → org chain |
| Tenant isolation (admin recovery) | SAFE | `isTenantPrivileged()` + store.orgId check (lines 208-216) |
| Provider resolution tenant-scoped | SAFE | Registry lookup by `shipping_provider_key` on shipment row |
| Shipment IDOR | SAFE | Cross-tenant → 404 (not 403) to avoid existence revelation |
| Admin recovery RBAC | SAFE | `@RequirePermission('admin:shipping:recovery')` + `PermissionsGuard` |
| Webhook authentication | SAFE | HMAC-SHA256 + webhook token routing |
| Carrier credential access | SAFE | Encrypted at rest, decrypted only for API calls, never in responses |
| Error leakage | SAFE | `toSafeMessage()` / `classification.safeMessage` strips credentials |
| Cross-tenant tracking | SAFE | Tracking poller uses shipment's own `shippingProviderKey` |
| Cross-tenant reconciliation | SAFE | Reconciliation resolves provider from shipment row (tenant-scoped) |

---

## 19. Observability Analysis

| Metric | Implemented? | Notes |
|---|---|---|
| `carrier_cancel_unknown_total` | NO | Deferred per B.3.3.3 lock §15 |
| `carrier_cancel_reconciliation_total` | NO | Deferred |
| `carrier_cancel_reconciled_total` | NO | Deferred |
| `carrier_cancel_unresolved_total` | NO | Deferred |
| Circuit breaker per-provider | YES | `CarrierCircuitBreaker` |
| Webhook counters | YES | `carrier_webhook_total`, `carrier_webhook_failures_total` |
| DB state as observable | YES | `carrier_cancel_status`, `recovery_status`, `next_reconciliation_at` |

**Assessment**: Database state is sufficient for operational visibility. Counters are additive and non-blocking — can be added in any future milestone.

---

## 20. Findings Table

| ID | Severity | Component | Current Behavior | Risk | Evidence | Recommendation | Implementation Required? |
|---|---|---|---|---|---|---|---|
| **F-01** | HIGH | Provider | No verified method to establish Aramex pickup active state | UNKNOWN → PENDING and re-cancel remain blocked indefinitely | No `getPickupStatus()` in provider interface; tracking codes are not definitive active proof | B.3.3.4 must decide: implement `getPickupStatus()`, accept tracking-heuristic active proof, or keep conservative | YES (decision required) |
| **F-02** | HIGH | Reconciliation | Shared `running` flag for create and cancel cycles | Cancel reconciliation delayed if create is running | `carrier-reconciliation.service.ts:63,153,356` | Separate `runningCreate` and `runningCancel` flags | YES |
| **F-03** | MEDIUM | Tracking poller | `carrier_status_mapped` advances to DELIVERED on cancelled shipments | Admin visibility divergence; no exception recorded | Poller excludes only SUCCEEDED/NOT_REQUIRED cancel status; UNKNOWN/FAILED still polled | Record exception event when DELIVERED detected on cancelled shipment | YES |
| **F-04** | MEDIUM | Delivered-after-cancel | No exception event or admin notification when carrier delivers after SCS cancel | Physical delivery invisible to operations | `processCarrierDelivery()` returns false for CANCELLED; no else-path | Add `DELIVERED_AFTER_CANCEL` exception path in tracking poller | YES |
| **F-05** | MEDIUM | Aramex mapper | No `PICKUP_CANCELLED` status in Aramex mapper | Reconciliation check for `PICKUP_CANCELLED` is unreachable via tracking | `aramex-status.mapper.ts` has SH012→CANCELLED only; no PICKUP_CANCELLED mapping | Either add PICKUP_CANCELLED mapping (if Aramex has one) or remove the unreachable check | YES (investigation required) |
| **F-06** | MEDIUM | Webhook | Webhook does not process cancellation events | Carrier cancellation confirmation via webhook is ignored | `carrier-webhook.controller.ts` persists events but takes no cancel action | Evaluate whether webhook cancel events should update `carrierCancelStatus` | MAYBE (depends on Aramex webhook behavior) |
| **F-07** | LOW | B.3.3.5 | No DB-level unique constraint on at-most-one-pending-cancel | Defense-in-depth gap (application guards are sufficient) | Worker idempotent guard prevents double execution; no outbox unique index | Add partial unique index in future migration | DESIRABLE (not blocking) |
| **F-08** | LOW | Tracking dedup | Tracking event dedup relies on application-level PG 23505 catch; unique index existence unverified | Concurrent poller duplicate events (handled gracefully by catch) | Poller comment says UNIQUE but migration review shows non-unique indexes | Verify unique index exists; add if missing | DESIRABLE |
| **F-09** | INFO | Observability | Cancel-specific metrics not implemented | No operational visibility beyond DB state | B.3.3.3 lock §15 deferred counters | Add when metrics infrastructure available | OPTIONAL |
| **F-10** | INFO | Aramex | CancelPickup idempotency with same GUID not verified | Unknown whether double-cancel is safe at carrier | No live API verification | Verify with Aramex sandbox before enabling re-cancel | REQUIRED before re-cancel |

---

## 21. Business Decisions Required

Before B.3.3.4 implementation, the following business decisions must be explicitly locked:

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| **BD-3.4-01** | Definition of "definitive carrier ACTIVE state" | (a) `getPickupStatus()` only, (b) tracking heuristic (SH001/SH014 = active), (c) keep conservative (no active proof possible) | (c) until live Aramex verification; then (a) |
| **BD-3.4-02** | UNKNOWN → PENDING transition authority | (a) reconciliation-only (automatic when active proven), (b) admin-only, (c) both | (c) both, with reconciliation requiring definitive proof |
| **BD-3.4-03** | Reconciliation-driven re-cancel safety invariant | (a) active proof required, (b) always safe (idempotency key), (c) never | (a) active proof required |
| **BD-3.4-04** | Delivered-after-cancel handling scope | (a) exception event + admin notification, (b) full exception lifecycle (accept/reverse), (c) ignore | (a) for B.3.3.4; (b) deferred |
| **BD-3.4-05** | Tracking poller cancel-awareness | (a) extend guard to exclude all non-null cancel statuses, (b) keep current + add exception detection, (c) full cancel-aware tracking | (b) extend guard + exception detection |
| **BD-3.4-06** | Webhook cancellation processing | (a) process cancel webhooks → update carrierCancelStatus, (b) keep current (persist only), (c) evaluate per-carrier | (b) until Aramex webhook behavior verified |
| **BD-3.4-07** | `getPickupStatus()` implementation | (a) implement now, (b) defer until live Aramex verification, (c) implement interface only (no Aramex override) | (b) defer; (c) acceptable as preparation |
| **BD-3.4-08** | B.3.3.5 unique index | (a) implement now, (b) defer, (c) implement as part of B.3.3.4 | (b) defer; application guards sufficient |
| **BD-3.4-09** | PICKUP_CANCELLED tracking status | (a) add to Aramex mapper (if Aramex has equivalent), (b) remove from reconciliation check, (c) keep as future-proof | (b) remove or (a) add with verification |
| **BD-3.4-10** | Shared reconciliation mutex | (a) separate running flags, (b) keep shared, (c) use DB-level coordination | (a) separate flags — trivial fix, eliminates delay risk |

---

## 22. Verdict

**GO WITH CONDITIONS**

The platform can safely progress to B.3.3.4 implementation, but the scope must be carefully bounded based on the Aramex evidence gap.

### Conditions

1. **No speculative provider logic**: Do not implement `getPickupStatus()` Aramex override without live API verification.
2. **Conservative active-state**: Until Aramex active-state is verified, UNKNOWN → PENDING and re-cancel remain admin-only.
3. **Tracking poller exception detection**: B.3.3.4 must add delivered-after-cancel exception recording.
4. **Separate reconciliation mutex**: Fix the shared `running` flag (F-02).
5. **PICKUP_CANCELLED resolution**: Either verify and add to mapper, or remove the unreachable check.
6. **No new migration**: B.3.3.4 must not create migration 0050 unless genuinely required (report first).
7. **Webhook scope unchanged**: Do not expand webhook processing until Aramex webhook behavior is verified.
8. **B.3.3.5 deferred**: Unique index is desirable but not blocking.

### Recommended B.3.3.4 Scope

1. Fix F-02 (separate reconciliation running flags) — trivial
2. Fix F-03/F-04 (tracking poller delivered-after-cancel exception detection)
3. Fix F-05 (resolve PICKUP_CANCELLED reachability)
4. Document Aramex evidence requirements for future active-state verification
5. Evaluate tracking poller guard extension (BD-3.4-05)

### NOT Recommended for B.3.3.4

- `getPickupStatus()` implementation (blocked on Aramex verification)
- UNKNOWN → PENDING automatic transition (blocked on active-state proof)
- Reconciliation-driven re-cancel (blocked on active-state proof)
- Full delivered-after-cancel lifecycle (complex; exception recording is sufficient)
- Webhook cancellation processing (blocked on Aramex webhook behavior verification)
- B.3.3.5 unique index (desirable but not blocking)

---

*Audit completed: 2026-10-01*
*Verdict: GO WITH CONDITIONS (8 conditions)*
*No production code was modified during this audit.*
