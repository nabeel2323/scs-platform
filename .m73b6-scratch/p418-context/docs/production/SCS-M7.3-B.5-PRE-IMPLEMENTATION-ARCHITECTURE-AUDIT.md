# SCS-M7.3-B.5 — Pre-Implementation Architecture Audit

**RTS + Reconciliation**

| Field | Value |
|-------|-------|
| Milestone | M7.3-B.5 |
| Task type | Pre-implementation architecture audit — READ-ONLY |
| Status | **COMPLETE** |
| Verdict | **GO WITH CONDITIONS** (7 conditions) |
| Date | 2026-10-02 |
| Branch | develop |
| HEAD | 5aa29bf784c4d01a9d17d614a413c5559643b07f |
| Predecessor | B.4 CLOSED/PASS |
| Parent Lock | SCS-M7.3-B-BUSINESS-RULES-ARCHITECTURE-LOCK.md (LOCKED) |

---

## 1. Audit Identity

This audit determines whether the SCS shipping/delivery architecture can safely progress from the current B.4 closed state into M7.3-B.5 — RTS + Reconciliation. It addresses:

1. The B.4 schema foundation for RTS states (schema-compatible only)
2. The absence of any RTS endpoint or workflow
3. The "Reconciliation" term in the B.5 title — what it means given existing carrier reconciliation
4. Inventory return-to-stock deferral boundary (M7.3-C)
5. Financial refund deferral boundary (M7.3-D)
6. Authorization model for RTS request/approval
7. Carrier interaction (Aramex has no RTS API)
8. Concurrency between RTS and delivery/cancellation/retry
9. Multi-merchant/master-order impact
10. Open business decisions from the B.0 lock

---

## 2. Repository Baseline

```text
Branch:           develop
HEAD:             5aa29bf784c4d01a9d17d614a413c5559643b07f
Working tree:     CLEAN
Migrations:       0001–0050 (latest: 0050_delivery_exceptions.sql)
Latest commit:    test(delivery): add integration and unit tests for delivery exceptions and retries
```

### Milestone Commit Chain

```text
5aa29bf B.4 — delivery exceptions + retry tests
380a3f9 B.3.4 — race closure + reconciliation tests
48e37a7 B.3.3.3 — indeterminate reconciliation
2834fa5 B.3.2 — carrier cancel state tests
2814107 B.3.1 — carrier cancel schema + tests
0a85d45 B.2 — merchant cancellation + shipment sync
e795f82 B.1 — delivery/cancellation concurrency tests
```

---

## 3. Authoritative Roadmap Evidence

### Primary Source: B.0 Lock §36 (Implementation Sequence)

```text
### M7.3-B.5 — RTS + Reconciliation

Goal: RTS operational state, carrier-after-cancel reconciliation
Files: orders.service.ts, orders.controller.ts
Database: Use existing exception columns
API: POST /shipments/:id/rts
Security: Merchant request + admin approve
Tests: RTS lifecycle tests, reconciliation flag tests
Exit criteria: RTS state machine working, reconciliation events emitted
Dependencies: M7.3-B.4
```

### B.0 Lock §9 (ADR-B0-009: RTS Boundary)

```text
Title: M7.3-B records RTS state; inventory/financial handling deferred
Status: LOCKED

M7.3-B records the operational RTS state/event only.
Inventory return-to-stock is deferred to M7.3-C.
Financial refund handling is deferred to M7.3-D.

Implementation impact: exceptionStatus values include RTS_PENDING, RTS_COMPLETED.
                       Outbox event shipment.rts_requested emitted.
Future migration impact: M7.3-C adds return-to-stock action on RTS_COMPLETED.
```

### B.0 Lock §9 (RTS Authorization)

```text
RTS authorization actor: ADMIN (primary), MERCHANT (request with admin approval for LOST/DAMAGED)
RTS triggers: RECIPIENT_REFUSED, MAX_DELIVERY_ATTEMPTS_EXCEEDED
RTS status: Shipment gains exceptionStatus = 'RTS_PENDING' → 'RTS_IN_PROGRESS' → 'RTS_COMPLETED'
Carrier action: None in M7.3-B (Aramex has no RTS API)
Inventory action: DEFERRED to M7.3-C
Order action: Sub-order status remains OUT_FOR_DELIVERY; master aggregation reflects exception
Financial action: DEFERRED to M7.3-D
```

### B.0 Lock §9 (RTS Not Triggered By)

- RECIPIENT_UNAVAILABLE — retry first, RTS only after max attempts
- WRONG_ADDRESS — retry with corrected address first
- DAMAGED — merchant decides disposition (no auto-RTS)
- LOST — admin investigation first; RTS only if confirmed unrecoverable
- CARRIER_EXCEPTION — depends on specific carrier issue
- DRIVER_EXCEPTION — depends on specific driver issue

### Evidence Chain Assessment

The roadmap evidence is **sufficient but ambiguous in three areas**:

1. **RTS_IN_PROGRESS state:** The B.0 lock specifies a three-state RTS lifecycle (RTS_PENDING → RTS_IN_PROGRESS → RTS_COMPLETED), but B.4 only created schema-compatible values for RTS_PENDING and RTS_COMPLETED. The intermediate state RTS_IN_PROGRESS does not exist in the EXCEPTION_TRANSITIONS map or the schema.

2. **"Reconciliation" scope:** The B.5 roadmap title says "RTS + Reconciliation" and the goal says "carrier-after-cancel reconciliation." However, carrier-after-cancel reconciliation was already implemented in B.3.3/B.3.4 (carrier-reconciliation.service.ts, carrier-tracking-poller.ts). The B.5 "Reconciliation" must mean something different — likely RTS-specific reconciliation (confirming physical return).

3. **Migration statement:** The roadmap says "Database: Use existing exception columns." This implies no new migration may be needed, but the audit identifies several columns that may be required for RTS metadata (see §17).

---

## 4. B.5 Business Objective

When delivery exceptions reach a terminal failure point (recipient refused, max attempts exhausted), the platform needs a structured mechanism to:

1. Authorize the return of the physical shipment to the merchant/origin
2. Record the RTS lifecycle (requested → approved → completed)
3. Emit events for downstream consumption (notifications, dashboard, future inventory return)
4. Maintain audit trail of who requested and who approved the RTS
5. Eventually reconcile the physical return with the recorded RTS state

B.5 delivers the **RTS state machine and approval workflow**. Inventory return-to-stock and financial settlement remain deferred to M7.3-C and M7.3-D respectively.

---

## 5. Current Architecture Baseline

### 5.1 Order FSM (orders.service.ts L2622–2639)

```text
DRAFT → [SUBMITTED]
SUBMITTED → [PENDING_CONFIRMATION]
PENDING_CONFIRMATION → [ACCEPTED, PARTIALLY_ACCEPTED, REJECTED, CANCELLED]
ACCEPTED → [PREPARING, CANCELLED]
PARTIALLY_ACCEPTED → [PREPARING, CANCELLED]
PREPARING → [READY, CANCELLED]
READY → [OUT_FOR_DELIVERY, ASSIGNED, DELIVERED, CANCELLED]
ASSIGNED → [PICKED_UP]
PICKED_UP → [OUT_FOR_DELIVERY]
OUT_FOR_DELIVERY → [DELIVERED]
DELIVERED → [COMPLETED, DISPUTED]
COMPLETED → [DISPUTED]
CANCELLED → [] (terminal)
REJECTED → [] (terminal)
DISPUTED → [] (terminal)
```

**Key invariant:** OUT_FOR_DELIVERY → [DELIVERED] is the only forward transition. RTS does NOT change order status.

### 5.2 Exception FSM (orders.service.ts L886–892)

```text
OPEN → [RETRY_PENDING, RESOLVED, CLOSED, RTS_PENDING]
RETRY_PENDING → [OPEN, CLOSED]
RESOLVED → [] (terminal)
CLOSED → [] (terminal)
RTS_PENDING → [RTS_COMPLETED]
RTS_COMPLETED → [CLOSED]
```

**B.4 created these transitions as schema-compatible constants.** No endpoint or service method currently writes RTS_PENDING or RTS_COMPLETED. The transitions exist only in the EXCEPTION_TRANSITIONS map.

### 5.3 Shipment Schema (shipment.schema.ts)

Exception-related columns (migration 0050):
- `exceptionStatus` — VARCHAR(24), nullable — accommodates RTS_PENDING, RTS_COMPLETED
- `exceptionType` — VARCHAR(30), nullable
- `exceptionNotes` — TEXT, nullable
- `exceptionAt` — TIMESTAMPTZ, nullable
- `exceptionResolvedAt` — TIMESTAMPTZ, nullable
- `deliveryAttempts` — INTEGER, NOT NULL, DEFAULT 0
- `maxDeliveryAttempts` — INTEGER, NOT NULL, DEFAULT 3

**No RTS-specific metadata columns exist.** No `rts_requested_at`, `rts_approved_at`, `rts_completed_at`, `rts_requested_by`, `rts_approved_by`.

### 5.4 Inventory Architecture (inventory.schema.ts + inventory.service.ts)

Movement types currently in use:
- `RESERVE` — stock reserved for order (on ACCEPT)
- `RELEASE` — reservation released (on CANCEL/REJECT)
- `SALE` — stock deducted (on DELIVER)
- `IMPORT` — initial stock import
- `ADJUST` — manual adjustment or transfer

**No RETURN or RESTOCK movement type exists.** Return-to-stock would require a new movement type.

### 5.5 Carrier Reconciliation Architecture

**Existing reconciliation (B.3.3/B.3.4):**
- `carrier-reconciliation.service.ts` — scheduled service with separate create/cancel mutexes
- `carrier-tracking-poller.ts` — periodic tracking poll with DELIVERED_AFTER_CANCEL detection
- Reconciliation outcomes: `already_complete`, `recovered`, `retry_safe`, `not_found_deferred`, `routed_to_recovery`, `cancel_succeeded`, `cancel_budget_exhausted`, `cancel_boundary_exceeded`, `cancel_deferred`, `cancel_transport_error`, `cancel_ambiguous`, `error`

This reconciliation is about **carrier shipment state uncertainty** (did the carrier actually create/cancel the shipment?). It is NOT about physical goods return.

### 5.6 Carrier Provider Capabilities (shipping.types.ts)

```typescript
interface ProviderCapabilities {
  canCreateShipment: boolean;
  canCancel: boolean;         // Aramex: false
  canCancelPickup: boolean;   // Aramex: true
  canGenerateLabel: boolean;
  canTrack: boolean;          // Aramex: true
  canValidateAddress: boolean;
  canReceiveWebhooks: boolean;
}
```

**No `canReturnShipment`, `canRTS`, or similar capability exists.** Aramex has no RTS API.

---

## 6. B.4 Dependency Analysis

B.5 depends on B.4 for:

| B.4 Deliverable | B.5 Usage | Status |
|-----------------|-----------|--------|
| exception_status column | RTS_PENDING/RTS_COMPLETED values | Schema-compatible ✓ |
| EXCEPTION_TRANSITIONS map | OPEN → RTS_PENDING, RTS_PENDING → RTS_COMPLETED, RTS_COMPLETED → CLOSED | Constants exist ✓ |
| Exception reporting endpoint | RTS can only be triggered when exception is OPEN | Endpoint exists ✓ |
| Delivery attempt counting | Max attempts is an RTS trigger | Counting works ✓ |
| Outbox event pattern | shipment.rts_requested follows same pattern | Pattern established ✓ |
| Shipment event pattern | RTS_REQUESTED, RTS_APPROVED, RTS_COMPLETED follow same pattern | Pattern established ✓ |

**B.4 provides a sufficient foundation for B.5.** The exception_status column already accepts RTS values. The transition map already defines valid RTS transitions. The outbox and shipment event patterns are well-established.

---

## 7. RTS Domain Model

### 7.1 Aggregate Root

RTS is modeled at the **shipment level**, consistent with B.4's exception model (BD-B4-001). A master order with multiple merchants produces multiple shipments, each with its own RTS lifecycle.

### 7.2 RTS Lifecycle (Candidate)

Based on B.0 Lock §9:

```text
(no RTS)
    ↓ [authorized actor requests RTS]
RTS_PENDING
    ↓ [admin approves]
RTS_IN_PROGRESS   ← B.0 lock specifies this; B.4 did not create it
    ↓ [physical return confirmed]
RTS_COMPLETED
    ↓ [lifecycle finalized]
CLOSED
```

### 7.3 Schema Gap Analysis

The B.0 lock specifies `RTS_PENDING → RTS_IN_PROGRESS → RTS_COMPLETED`, but B.4 only created schema-compatible values for `RTS_PENDING` and `RTS_COMPLETED`. The intermediate `RTS_IN_PROGRESS` state is absent from:
- EXCEPTION_TRANSITIONS map (L886-892)
- Any validation logic

**This is a gap that the B.5 lock must resolve.** Options:
- Add RTS_IN_PROGRESS to the transition map (schema already accepts it — VARCHAR(24))
- Collapse to two states (RTS_PENDING → RTS_COMPLETED) and document the deviation
- Use RTS_PENDING as the "approved/in-progress" state and only transition to RTS_COMPLETED on physical confirmation

### 7.4 RTS Metadata Gap

The current schema records **when** an exception was opened (`exception_at`) and **when** it was resolved (`exception_resolved_at`). For RTS, additional metadata may be needed:

| Candidate Column | Purpose | Currently Available? |
|-----------------|---------|---------------------|
| rts_requested_at | When RTS was requested | No — exception_at covers initial exception, not RTS request |
| rts_approved_at | When RTS was approved | No |
| rts_completed_at | When physical return confirmed | No — exception_resolved_at could be repurposed but is ambiguous |
| rts_requested_by | Who requested RTS | No — actor tracked via shipment_events only |
| rts_approved_by | Who approved RTS | No |
| return_condition | Condition of returned goods | No |
| return_quantity | Quantity returned (for partial) | No |

**Recommendation:** B.5 should use shipment_events for actor tracking (already supports actorUserId, actorType, metadata) and consider whether timestamp columns are needed beyond what exception_at/exception_resolved_at provide.

---

## 8. RTS State Machine

### 8.1 Proposed Transitions

| From | To | Trigger | Actor |
|------|----|---------|-------|
| OPEN | RTS_PENDING | RTS requested | MERCHANT (request), ADMIN |
| RTS_PENDING | RTS_IN_PROGRESS | RTS approved | ADMIN |
| RTS_PENDING | CLOSED | RTS rejected/cancelled | ADMIN |
| RTS_IN_PROGRESS | RTS_COMPLETED | Physical return confirmed | MERCHANT, ADMIN, SYSTEM |
| RTS_COMPLETED | CLOSED | Lifecycle finalized | SYSTEM |

### 8.2 Open Business Decisions

1. **Is RTS_IN_PROGRESS actually needed?** The B.0 lock specifies it, but operationally, is there a meaningful distinction between "RTS approved" and "RTS in progress"? If approval and physical dispatch are the same event, the intermediate state adds complexity without value.

2. **Can RTS be rejected?** If admin denies the RTS request, what happens? Does the exception return to OPEN for retry? Or does it go to CLOSED?

3. **Can RTS be requested from RETRY_PENDING?** The B.0 lock says RTS triggers are RECIPIENT_REFUSED and MAX_DELIVERY_ATTEMPTS_EXCEEDED. Both would be in OPEN state. But what if a merchant wants to request RTS while a retry is pending?

4. **Who confirms physical return?** Is this a manual merchant/admin action, or should it be automated via carrier tracking?

---

## 9. Return-to-Stock Architecture

### 9.1 Current Inventory Model

```text
ACCEPT → RESERVE (qtyReserved += qty)
DELIVER → SALE (qtyOnHand -= qty, qtyReserved -= qty)
CANCEL → RELEASE (qtyReserved -= qty)
REJECT → RELEASE (qtyReserved -= qty)
```

All movements are tracked in `stock_movements` with `movementType` VARCHAR(16).

### 9.2 What RTS Means Operationally

When a shipment is returned to the merchant:
- Physical goods are transported back to the merchant's warehouse
- Inventory should eventually reflect the returned goods
- The returned goods may be damaged, partial, or complete

### 9.3 B.5 Boundary (Locked by ADR-B0-009)

```text
B.5 records the RTS operational state and events ONLY.
Inventory return-to-stock is explicitly deferred to M7.3-C.
```

This means B.5 does NOT:
- Create a RETURN or RESTOCK movement type
- Modify inventory_items quantities
- Call settleStockForStatus() with a return parameter

B.5 DOES:
- Record the RTS lifecycle (RTS_PENDING → RTS_COMPLETED)
- Emit outbox events for downstream consumers
- Record shipment events for audit trail
- Eventually (M7.3-C) the outbox events from B.5 will drive inventory return

### 9.4 Open Business Decisions for Return-to-Stock (M7.3-C, not B.5)

These are documented here for architectural awareness but are NOT B.5 scope:

1. When should inventory be returned? (On RTS_COMPLETED? On physical receipt at warehouse?)
2. What inventory state exists while an item is physically returning?
3. What happens if returned quantity differs from shipped quantity?
4. What happens if the product is damaged during return?
5. How should partial returns work?

---

## 10. Reconciliation Architecture

### 10.1 What "Reconciliation" Means in B.5

The B.5 title says "RTS + Reconciliation." The existing reconciliation infrastructure (carrier-reconciliation.service.ts) handles **carrier shipment state uncertainty** — did the carrier actually create/cancel the shipment?

B.5 "Reconciliation" likely refers to **RTS reconciliation** — confirming that the physical return matches the recorded RTS state:

| Aspect | Description |
|--------|-------------|
| RTS vs physical return | Did the shipment actually arrive back at the merchant? |
| RTS vs carrier tracking | Did carrier tracking confirm the return? |
| RTS vs inventory | Does the inventory reflect the return? (deferred to M7.3-C) |

### 10.2 Existing Reconciliation Services

| Service | Purpose | B.5 Impact |
|---------|---------|-----------|
| carrier-reconciliation.service.ts | Create/cancel carrier state reconciliation | No change — different concern |
| carrier-tracking-poller.ts | Periodic tracking poll | May need RTS-aware filtering |
| Outbox dispatcher | Event delivery | New RTS events added |

### 10.3 Recommendation

B.5 reconciliation should be limited to:
1. Emitting outbox events when RTS state changes (for future consumers)
2. Recording shipment events for audit trail
3. Potentially adding a reconciliation flag or status to track whether the physical return has been confirmed

**Open decision:** Does B.5 need a mechanism to confirm physical return, or is that deferred to M7.3-C?

---

## 11. Carrier Interaction

### 11.1 Aramex RTS Capability

```text
Aramex CancelShipment: NOT SUPPORTED (canCancel: false)
Aramex CancelPickup: SUPPORTED (fully implemented)
Aramex GetTrackingInfo: SUPPORTED
Aramex RTS API: DOES NOT EXIST
Aramex Return Shipment API: DOES NOT EXIST (confirmed by B.0 Lock §9)
```

### 11.2 B.5 Carrier Impact

```text
B.5 is entirely SCS-internal.
No Aramex files modified.
No new provider methods.
No new carrier API calls.
No new webhook handling.
No new carrier states.
```

### 11.3 Provider Capabilities Gap

The `ProviderCapabilities` interface has no `canReturnShipment` or `canRTS` field. Since B.5 does not add carrier RTS methods, no capability change is needed.

**If a future carrier adds RTS API support**, the provider interface would need:
- `canReturnShipment: boolean`
- `returnShipment(request): Promise<ReturnShipmentResult>`

This is explicitly out of B.5 scope.

---

## 12. Authorization Model

### 12.1 Proposed Authorization Matrix

| Operation | DRIVER | MERCHANT | ADMIN | BUYER |
|-----------|--------|----------|-------|-------|
| Request RTS | No | Yes (own store) | Yes | No |
| Approve RTS | No | No | Yes | No |
| Reject RTS | No | No | Yes | No |
| Confirm physical return | No | Yes (own store) | Yes | No |
| Complete RTS | No | No | Yes | No |

### 12.2 B.0 Lock Authorization (Locked)

```text
RTS authorization actor: ADMIN (primary), MERCHANT (request with admin approval for LOST/DAMAGED)
```

This implies:
- Merchant can REQUEST RTS (but not approve)
- Admin APPROVES RTS
- For LOST/DAMAGED exceptions, merchant request requires admin approval
- For RECIPIENT_REFUSED / MAX_ATTEMPTS, the approval path may be simpler

### 12.3 Open Business Decisions

1. **Can a merchant self-approve RTS for their own shipment?** The B.0 lock says "admin approve" — this implies merchant cannot self-approve. But for routine cases (recipient refused), admin approval may be burdensome.

2. **Can driver suggest RTS?** B.4 allows driver to report exceptions. Can driver also suggest RTS (without authorization power)?

3. **What are the RTS triggers?** The B.0 lock says RECIPIENT_REFUSED and MAX_DELIVERY_ATTEMPTS_EXCEEDED. Should other exception types also be eligible?

---

## 13. Tenant Isolation

### 13.1 Isolation Model

RTS operations follow the same isolation pattern as B.4 exception operations:

| Dimension | Isolation Mechanism |
|-----------|-------------------|
| Organization | `shipment.storeId.orgId == caller.orgId` |
| Merchant/Store | Same as above — merchant can only RTS own-store shipments |
| Driver | `shipment.assignedDriverId == caller.userId` (if driver can suggest) |
| Admin | BYPASS_ROLES: SUPER_ADMIN, ADMIN, MODERATOR |

### 13.2 IDOR Risks

- RTS endpoint must validate shipment ownership via store → org chain
- UUID primary keys prevent enumeration
- Existing `assertShipmentAccessible()` pattern in ShipmentOperationsController can be reused

### 13.3 Existing Authorization Helpers

The following existing helpers can support B.5:
- `assertShipmentAccessible()` in ShipmentOperationsController — admin bypass + merchant org check
- `assertShipmentAccessibleForException()` in OrdersService — driver assignment check + merchant org check
- `toCallerContext()` — extracts caller context from JWT

**No modification to existing helpers is required.** B.5 can reuse them directly.

---

## 14. Concurrency and Race Analysis

### 14.1 RTS Request vs RTS Request

Two merchants simultaneously request RTS on the same shipment.

**Mitigation:** Optimistic lock: `UPDATE shipments SET exception_status = 'RTS_PENDING' WHERE id = ? AND exception_status = 'OPEN'`. Rows = 0 → 409 Conflict.

### 14.2 RTS Approval vs RTS Approval

Two admins simultaneously approve the same RTS request.

**Mitigation:** Optimistic lock: `UPDATE shipments SET exception_status = 'RTS_IN_PROGRESS' WHERE id = ? AND exception_status = 'RTS_PENDING'`. Rows = 0 → 409.

### 14.3 RTS Completion vs RTS Completion

Two actors simultaneously confirm physical return.

**Mitigation:** Optimistic lock: `UPDATE shipments SET exception_status = 'RTS_COMPLETED' WHERE id = ? AND exception_status = 'RTS_IN_PROGRESS'` (or 'RTS_PENDING' if no intermediate state). Rows = 0 → 409.

### 14.4 RTS vs Cancellation

Order is cancelled while shipment has RTS_PENDING.

**Analysis:** Cancellation is authoritative (B.0 §11). If cancellation commits first, shipment is CANCELLED and RTS is moot. If RTS is pending and cancellation occurs, the cancellation TX should close the RTS (exception_status → CLOSED, consistent with B.4's BD-B4-008).

**Current B.4 cancellation code (L1136-1149):** Already handles this — `WHERE exception_status IN ('OPEN', 'RETRY_PENDING')`. B.5 must extend this to include 'RTS_PENDING' (and 'RTS_IN_PROGRESS' if added).

### 14.5 RTS vs Delivery

Delivery succeeds while RTS is pending.

**Analysis:** If delivery commits first (order → DELIVERED), the exception auto-resolves (B.4 BD-B4-007). The RTS becomes moot. If RTS completes first, the shipment is in RTS state and delivery should be rejected (order no longer in a deliverable state? — requires investigation).

**Open decision:** Can a shipment be delivered after RTS is requested? Physically, the package is being returned — delivery should be blocked.

### 14.6 RTS vs Retry

Retry is authorized while RTS is pending.

**Analysis:** If RTS is pending, retry should be rejected — the package is being returned, not re-delivered. The EXCEPTION_TRANSITIONS map already prevents this: RTS_PENDING has no transition to RETRY_PENDING.

### 14.7 RTS vs Inventory Movement

RTS completion triggers inventory return (M7.3-C, not B.5).

**Analysis:** In B.5, no inventory movement occurs. The concern is future: when M7.3-C adds inventory return, the RTS completion and inventory return must be atomic or at least consistent.

---

## 15. Idempotency

| Operation | Mechanism | Behavior |
|-----------|-----------|----------|
| RTS request (already RTS_PENDING) | exception_status = 'OPEN' guard | 409 Conflict |
| RTS approval (already RTS_IN_PROGRESS) | exception_status = 'RTS_PENDING' guard | 409 Conflict |
| RTS completion (already RTS_COMPLETED) | exception_status guard | 409 or no-op |
| RTS after delivery | Order status check | 409 (order DELIVERED) |
| RTS after cancellation | Shipment status check | 409 (shipment CANCELLED) |

**Duplicate RTS request could cause:**
- Duplicate shipment events (mitigated by optimistic lock)
- Duplicate outbox events (mitigated by optimistic lock)
- No inventory risk in B.5 (no inventory movement)

---

## 16. Event and Outbox Architecture

### 16.1 Candidate Shipment Events

| Event Type | When | Actor | Notes |
|-----------|------|-------|-------|
| `RTS_REQUESTED` | RTS requested | MERCHANT/ADMIN | exceptionType, reason in metadata |
| `RTS_APPROVED` | RTS approved | ADMIN | approvedBy in metadata |
| `RTS_REJECTED` | RTS rejected | ADMIN | rejection reason in metadata |
| `RTS_COMPLETED` | Physical return confirmed | MERCHANT/ADMIN/SYSTEM | returnCondition in metadata |

### 16.2 Candidate Outbox Events

| Event Name | When | Payload |
|-----------|------|---------|
| `shipment.rts_requested` | RTS requested | shipmentId, orderId, exceptionType, requestedBy, storeId |
| `shipment.rts_approved` | RTS approved | shipmentId, orderId, approvedBy, storeId |
| `shipment.rts_completed` | RTS completed | shipmentId, orderId, storeId |

### 16.3 B.0 Lock §9 (ADR-B0-009) Statement

```text
Outbox event shipment.rts_requested emitted.
```

The lock explicitly mentions `shipment.rts_requested` as an outbox event.

### 16.4 Event Type Length Check

All candidate event types fit within VARCHAR(40):
- RTS_REQUESTED: 11 chars ✓
- RTS_APPROVED: 12 chars ✓
- RTS_REJECTED: 12 chars ✓
- RTS_COMPLETED: 13 chars ✓

---

## 17. Database / Migration Analysis

### 17.1 Existing B.4 Foundation

The `exception_status` column (VARCHAR(24)) already accepts RTS_PENDING and RTS_COMPLETED. The question is whether B.5 needs additional columns.

### 17.2 Candidate Schema Changes

| Column | Type | Purpose | Needed in B.5? |
|--------|------|---------|---------------|
| (exception_status values) | VARCHAR(24) | RTS_PENDING, RTS_IN_PROGRESS, RTS_COMPLETED | Already schema-compatible ✓ |
| rts_requested_at | TIMESTAMPTZ | When RTS was requested | RECOMMENDATION — enables SLA tracking |
| rts_approved_at | TIMESTAMPTZ | When RTS was approved | RECOMMENDATION — enables audit |
| rts_completed_at | TIMESTAMPTZ | When physical return confirmed | Could reuse exception_resolved_at |
| rts_requested_by | UUID | Who requested | Tracked via shipment_events |
| rts_approved_by | UUID | Who approved | Tracked via shipment_events |
| return_condition | VARCHAR(20) | Condition of returned goods | DEFERRED to M7.3-C |
| return_quantity | INTEGER | Quantity returned | DEFERRED to M7.3-C |

### 17.3 Migration Analysis

**Option A: No new migration (roadmap intent)**
- Use existing exception_status column
- Track RTS timestamps via shipment_events
- Minimal schema change
- Risk: insufficient metadata for RTS SLA tracking

**Option B: Migration 0051 — RTS metadata columns**
- Add rts_requested_at, rts_approved_at, rts_completed_at
- Additive-only, backward-compatible
- Enables SLA tracking and audit
- Risk: minor schema expansion

**Option C: Reuse exception_at / exception_resolved_at**
- exception_at = when exception opened (not when RTS requested)
- exception_resolved_at = when exception resolved (could mean RTS completed)
- Ambiguous — not recommended

**Recommendation:** Option B (migration 0051) provides the cleanest separation. However, the B.0 lock says "Use existing exception columns" which suggests Option A. This is an **open decision for the B.5 lock phase**.

### 17.4 RTS_IN_PROGRESS State

If the B.5 lock adopts the three-state model (RTS_PENDING → RTS_IN_PROGRESS → RTS_COMPLETED), the EXCEPTION_TRANSITIONS map must be extended. No schema change needed — VARCHAR(24) accommodates 'RTS_IN_PROGRESS' (15 chars).

---

## 18. Order FSM Interaction

### 18.1 Order FSM — NO CHANGE

The order FSM is unchanged during RTS. The order remains OUT_FOR_DELIVERY (or whatever state it was in when the exception was reported).

### 18.2 Can an Order Be Terminal While RTS Is Pending?

**Scenario:** Order is DELIVERED (via carrier delivery auto-resolve), then merchant discovers the delivery was wrong and requests RTS.

**Analysis:** In the current architecture, once the order is DELIVERED, the exception is auto-resolved (B.4 BD-B4-007). RTS can only be requested when exception_status is OPEN. If the exception is already RESOLVED, RTS cannot be requested.

**This means RTS is only reachable while the order is still OUT_FOR_DELIVERY (exception OPEN).** Once delivery occurs, RTS is no longer available.

**Open decision:** Should there be a post-delivery RTS path? (This is essentially a "return" workflow, which is M7.3-C/D scope.)

### 18.3 Master Order Aggregation

RTS on a sub-order shipment does not affect the master order status. The master order aggregation is based on sub-order statuses, and RTS does not change sub-order status.

---

## 19. Master Order / Multi-Merchant Impact

### 19.1 RTS Granularity

RTS is **shipment-level**, consistent with B.4's exception model. Each shipment has its own RTS lifecycle.

### 19.2 Multi-Merchant Scenarios

| Scenario | Behavior |
|----------|----------|
| One master order, two merchants, one shipment RTS | Only the RTS'd shipment is affected; other shipments continue |
| One master order, two merchants, both shipments RTS | Both shipments independently RTS; master order unaffected |
| Partial delivery + RTS | Some sub-orders delivered, one RTS'd; master reflects active sub-orders |

### 19.3 Master Order Status During RTS

The master order aggregation function (`recalculateMasterOrderStatus`) considers sub-order statuses. Since RTS does not change sub-order status, the master order status is unaffected by RTS.

---

## 20. Failure and Recovery

| Failure | Impact | Recovery |
|---------|--------|----------|
| RTS approval succeeds but physical return never happens | RTS stuck in RTS_PENDING/RTS_IN_PROGRESS | Admin manual intervention; no automatic timeout in B.5 |
| RTS completion submitted twice | Idempotent via optimistic lock | Second submission → 409 |
| Carrier reports return after manual RTS completion | No carrier interaction in B.5 | Out of scope |
| Inventory operation fails | No inventory operation in B.5 | N/A |
| Database TX rolls back | All state changes atomic | No partial state |
| Outbox event fails | Inside same TX — both commit or both roll back | No partial state |
| Reconciliation finds discrepancy | No reconciliation in B.5 (state recording only) | Deferred to M7.3-C |
| Returned product is damaged | No condition tracking in B.5 | Deferred to M7.3-C |
| Returned quantity differs | No quantity tracking in B.5 | Deferred to M7.3-C |
| Shipment is lost during RTS | RTS stuck in RTS_PENDING | Admin investigation |
| Retry attempted after RTS begins | RTS_PENDING has no transition to RETRY_PENDING | Rejected by FSM |
| Cancellation after RTS begins | Cancellation wins; exception → CLOSED | B.4 cancel TX extended |

---

## 21. Security Analysis

| Threat | Protection |
|--------|-----------|
| Merchant requesting RTS on another merchant's shipment | `shipment.storeId.orgId == caller.orgId` |
| Driver approving RTS | Role check: DRIVER cannot approve |
| Buyer requesting RTS | Permission check: buyer lacks `fulfillment:shipments:write` |
| Cross-tenant RTS access | Org isolation |
| Admin bypass exposure | BYPASS_ROLES limited; logged |
| IDOR on RTS endpoint | UUID PKs + ownership checks |
| Duplicate RTS requests | Optimistic lock |
| RTS on cancelled shipment | Shipment status check |
| RTS on delivered shipment | Exception status check (must be OPEN) |
| Unauthorized inventory manipulation | No inventory movement in B.5 |

---

## 22. Testing Strategy

### Unit Tests

| Area | Cases |
|------|-------|
| RTS type validation | Valid/invalid RTS triggers |
| RTS state transitions | All valid/invalid transitions |
| Authorization matrix | Driver/merchant/admin/buyer checks |
| Idempotency | Duplicate request, duplicate approval |
| FSM constants | RTS transitions in EXCEPTION_TRANSITIONS |

### PostgreSQL Integration Tests

| Area | Cases |
|------|-------|
| RTS lifecycle | OPEN → RTS_PENDING → RTS_COMPLETED → CLOSED |
| Concurrent RTS requests | 100 simultaneous → 1 succeeds |
| Concurrent RTS approvals | 100 simultaneous → 1 succeeds |
| RTS vs delivery race | One wins deterministically |
| RTS vs cancellation | Cancellation wins, closes RTS |
| RTS vs retry | Retry rejected when RTS pending |
| Outbox atomicity | RTS event + state in same TX |
| Migration safety | Applies to fresh + existing DB |

### Security Tests

| Test | Expected |
|------|----------|
| Cross-merchant RTS → 403 | Forbidden |
| Cross-tenant RTS → 403 | Forbidden |
| Driver RTS approval → 403 | Forbidden |
| Buyer RTS request → 403 | Forbidden |

### Regression

| Suite | Expected |
|-------|----------|
| B.4 (delivery exceptions) | All green |
| B.3.4 (race closure) | All green |
| B.3.x (carrier cancellation) | All green |
| B.2 (merchant cancellation) | All green |
| B.1 (concurrency hardening) | All green |
| Shipping unit | All green |
| Orders unit | All green |
| TypeScript | 0 errors |
| Build | 0 issues |

---

## 23. Architectural Risks

| ID | Risk | Impact | Likelihood | Affected Invariant | Mitigation | Open Decision? | Blocking? |
|----|------|--------|-----------|-------------------|-----------|---------------|-----------|
| R-01 | RTS_IN_PROGRESS state not in B.4 schema foundation | MEDIUM — transition map mismatch | HIGH | FSM consistency | Add to transition map or collapse to two-state | YES — B.5 lock must decide | NO |
| R-02 | RTS vs delivery race leaves inconsistent state | HIGH — package being returned but delivered | MEDIUM | INV-06 (cancellation authority) | RTS request must verify order status; delivery auto-resolves exception | NO — follows B.4 pattern | NO |
| R-03 | No RTS metadata columns (timestamps, actors) | LOW — audit trail via shipment_events only | MEDIUM | Auditability | Add migration 0051 or use shipment_events | YES — B.5 lock must decide | NO |
| R-04 | Cancellation TX must be extended for RTS states | MEDIUM — RTS stuck if not closed | HIGH | INV-06 | Extend cancel TX WHERE clause to include RTS_PENDING/RTS_IN_PROGRESS | NO — implementation detail | NO |
| R-05 | "Reconciliation" scope ambiguity | MEDIUM — unclear exit criteria | HIGH | N/A | Clarify in B.5 lock: state recording only vs. active reconciliation | YES — B.5 lock must decide | NO |
| R-06 | Post-delivery RTS path | LOW — return workflow confusion | LOW | INV-02 | Explicitly exclude — post-delivery returns are M7.3-C scope | NO — by design | NO |
| R-07 | RTS on LOST exception | MEDIUM — lost package cannot be returned | MEDIUM | Business logic | LOST requires admin investigation before RTS; no auto-RTS for LOST | YES — B.5 lock must decide | NO |
| R-08 | Master order aggregation during RTS | LOW — master status confusion | LOW | INV-13 | RTS does not change sub-order status; master unaffected | NO — by design | NO |

---

## 24. Open Business Decisions

| ID | Decision | Options | Recommendation | Blocking? |
|----|----------|---------|---------------|-----------|
| OBD-01 | RTS_IN_PROGRESS state: include or collapse? | (a) Three-state: RTS_PENDING → RTS_IN_PROGRESS → RTS_COMPLETED (b) Two-state: RTS_PENDING → RTS_COMPLETED | Two-state is simpler; three-state matches B.0 lock | YES |
| OBD-02 | RTS metadata: new columns or shipment_events only? | (a) Migration 0051 with rts_*_at columns (b) Use shipment_events + exception_at/resolved_at | Recommend migration for SLA tracking | YES |
| OBD-03 | What does "Reconciliation" mean in B.5? | (a) State recording only (events + audit) (b) Active reconciliation (worker + confirmation) | State recording only; active reconciliation deferred | YES |
| OBD-04 | Can merchant self-approve RTS? | (a) No — admin must approve (b) Yes — for own-store, non-LOST/DAMAGED | No — B.0 lock says admin approve | NO (locked by B.0) |
| OBD-05 | RTS triggers: which exception types? | (a) RECIPIENT_REFUSED + MAX_ATTEMPTS only (b) Any OPEN exception | (a) per B.0 lock; others require admin investigation | NO (locked by B.0) |
| OBD-06 | Can RTS be rejected? What happens to exception? | (a) Return to OPEN (b) Close exception | Return to OPEN for retry | YES |
| OBD-07 | Who can confirm physical return? | (a) Merchant (own store) (b) Admin only (c) System (via carrier tracking) | Merchant + Admin in B.5; system deferred | YES |

---

## 25. Open Technical Decisions

| ID | Decision | Options | Recommendation |
|----|----------|---------|---------------|
| OTD-01 | Migration number | (a) No migration (existing columns) (b) Migration 0051 (RTS metadata) | Depends on OBD-02 |
| OTD-02 | RTS endpoint location | (a) ShipmentOperationsController (b) New RTSController | ShipmentOperationsController (consistent with B.4) |
| OTD-03 | RTS outbox event names | (a) shipment.rts_requested/approved/completed (b) shipment.rts_requested only (per B.0 lock) | All three for full lifecycle |
| OTD-04 | RTS shipment event types | (a) RTS_REQUESTED/APPROVED/REJECTED/COMPLETED (b) RTS_REQUESTED/COMPLETED only | Full set for audit trail |
| OTD-05 | Cancellation TX extension | (a) Add RTS_PENDING/RTS_IN_PROGRESS to WHERE clause (b) Separate RTS closure logic | Extend existing WHERE clause |

---

## 26. Conditions for Implementation

The following conditions must be resolved in the B.5 Business/Architecture Lock before implementation:

1. **RTS state model:** Decide between two-state (RTS_PENDING → RTS_COMPLETED) and three-state (RTS_PENDING → RTS_IN_PROGRESS → RTS_COMPLETED). The B.0 lock specifies three-state; B.4 created schema for two-state. The lock must explicitly choose.

2. **Reconciliation scope:** Clarify whether B.5 "Reconciliation" means (a) state recording and event emission only, or (b) active reconciliation with a worker/confirmation mechanism. Recommendation: (a) only.

3. **Migration decision:** If RTS metadata columns are needed (rts_requested_at, rts_approved_at, rts_completed_at), migration 0051 must be specified. If shipment_events are sufficient, no migration needed.

4. **RTS rejection behavior:** Define what happens when admin rejects an RTS request. Does the exception return to OPEN? Does it close?

5. **Physical return confirmation:** Define who can confirm physical return (merchant, admin, or system). Define what the confirmation does (transitions RTS_PENDING/RTS_IN_PROGRESS → RTS_COMPLETED).

6. **Cancellation TX extension:** The cancelOrder() WHERE clause must be extended to include RTS_PENDING and RTS_IN_PROGRESS (if three-state). This is an implementation detail but must be explicitly authorized.

7. **LOST exception RTS:** Define whether LOST exceptions can enter RTS (admin investigation required first) or are categorically excluded from RTS.

---

## 27. Scope Boundary

### IN SCOPE

1. RTS state machine (OPEN → RTS_PENDING → [RTS_IN_PROGRESS →] RTS_COMPLETED → CLOSED)
2. RTS request endpoint (POST /v1/shipments/:id/rts)
3. RTS approval workflow (merchant request + admin approve)
4. RTS rejection (if authorized)
5. RTS completion confirmation
6. RTS shipment events (audit trail)
7. RTS outbox events (downstream consumers)
8. Authorization (driver/merchant/admin matrix)
9. Concurrency safety (optimistic locking)
10. Cancellation interaction (close RTS on cancel)
11. Delivery interaction (delivery auto-resolves exception, blocking RTS)
12. Unit tests, PostgreSQL integration tests, concurrency tests, security tests
13. Regression verification

### OUT OF SCOPE

```text
Inventory return-to-stock                           — M7.3-C
Financial refund handling                           — M7.3-D
Buyer exception reporting                           — M7.3-E
Notification expansion                              — M7.3-F
Photo evidence storage                              — future
Carrier RTS API integration                         — not authorized (Aramex has no RTS API)
New carrier provider methods                        — not authorized
Post-delivery return workflow                       — M7.3-C
Order FSM changes                                   — explicitly excluded
Recovery-token redesign                             — explicitly deferred
Poller cleanup                                      — explicitly deferred
Unrelated tracking improvements                     — explicitly deferred
Automatic redelivery dispatch                       — not authorized
New workers (beyond potential RTS reconciliation)   — not authorized
```

---

## 28. Final Architecture Verdict

### Recommendation: GO WITH CONDITIONS

The architecture is well-understood. B.4 created a sufficient schema foundation (exception_status accepts RTS values, transition map includes RTS transitions). The core RTS state machine is a straightforward extension of the B.4 exception lifecycle. No carrier API changes are required. No order FSM changes are needed.

However, seven open decisions must be resolved in the B.5 lock before implementation can proceed safely.

### Conditions

1. **RTS state model** — Must explicitly choose two-state vs three-state. B.0 lock specifies three-state; B.4 schema supports both.
2. **Reconciliation scope** — Must clarify whether B.5 includes active reconciliation or state recording only.
3. **Migration decision** — Must determine if migration 0051 is needed for RTS metadata.
4. **RTS rejection** — Must define behavior when admin rejects RTS.
5. **Physical return confirmation** — Must define who confirms and what it does.
6. **Cancellation TX extension** — Must authorize extending cancelOrder() for RTS states.
7. **LOST exception RTS** — Must define whether LOST can enter RTS.

### Risk Assessment

All identified risks are MEDIUM or LOW impact with clear mitigations. No HIGH-risk items require blocking the milestone.

### Dependencies

| Dependency | Status |
|-----------|--------|
| M7.3-B.4 (Delivery Exceptions + Retry) | CLOSED / PASS |
| M7.3-B.3 (Carrier Cancellation) | CLOSED / PASS |
| M7.3-B.2 (Merchant Cancellation) | CLOSED / PASS |
| M7.3-B.1 (Concurrency Hardening) | CLOSED / PASS |

### External Verification

None required — B.5 is entirely SCS-internal.

---

## 29. Files Inspected

### Source Files

| File | Lines | Role |
|------|-------|------|
| `orders.service.ts` | 3049 | Order FSM, delivery, cancellation, exception lifecycle |
| `shipment.schema.ts` | 117 | Shipments + shipment_events Drizzle schema |
| `shipment-operations.controller.ts` | 348 | Shipment CRUD + exception/retry endpoints |
| `shipping-provider.ts` | ~107 | Abstract provider interface |
| `shipping.types.ts` | ~305 | Status vocabulary, provider capabilities |
| `inventory.schema.ts` | 41 | Inventory items + stock movements |
| `inventory.service.ts` | 648 | Inventory operations (RESERVE/RELEASE/SALE/IMPORT/ADJUST) |
| `carrier-reconciliation.service.ts` | ~602 | Create + cancel carrier reconciliation |
| `carrier-tracking-poller.ts` | ~337 | Periodic tracking poll |

### Documentation

| Document | Status |
|----------|--------|
| `SCS-M7.3-B-BUSINESS-RULES-ARCHITECTURE-LOCK.md` | LOCKED (1672 lines) |
| `SCS-M7.3-B.4-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md` | COMPLETE (786 lines) |
| `SCS-M7.3-B.4-BUSINESS-RULES-ARCHITECTURE-LOCK.md` | LOCKED (1012 lines) |
| `SCS-M7.3-B.4-IMPLEMENTATION-REPORT.md` | COMPLETE (405 lines) |
| `SCS-M7.3-B.4-INDEPENDENT-RUNTIME-VERIFICATION.md` | PASS (709 lines) |
| `SCS-M7.3-B.4-RELEASE-CLOSURE.md` | CLOSED/PASS (564 lines) |

### Migrations

| Migration | Content |
|-----------|---------|
| 0048 | Cancellation metadata (B.2) |
| 0049 | Carrier cancellation state (B.3.1) |
| 0050 | Delivery exception columns (B.4) |
| 0051 | Does not exist — candidate for B.5 RTS metadata |

---

## 30. Confirmation

**NO implementation changes were made.** This audit is strictly read-only. No source code, tests, migrations, configuration, or documentation files were modified. This document is the only artifact produced.

**The audit stopped after completing the architecture analysis.** No implementation, migration, test, or endpoint changes were made. The next stage is the B.5 Business/Architecture Lock.

```text
========================================
M7.3-B.5 PRE-IMPLEMENTATION ARCHITECTURE AUDIT COMPLETE
========================================

Branch: develop
HEAD:   5aa29bf784c4d01a9d17d614a413c5559643b07f

Next milestone: M7.3-B.5 — RTS + Reconciliation
Authorization:  B.0 Lock §36 (EXPLICIT)
Goal:           RTS operational state, carrier-after-cancel reconciliation

Scope summary:
  - RTS state machine (OPEN → RTS_PENDING → [RTS_IN_PROGRESS →] RTS_COMPLETED → CLOSED)
  - RTS request endpoint (POST /shipments/:id/rts)
  - Merchant request + admin approve authorization
  - RTS shipment events + outbox events
  - Cancellation/delivery interaction
  - No carrier API changes
  - No order FSM changes
  - No inventory movement (deferred to M7.3-C)
  - No financial settlement (deferred to M7.3-D)

Dependencies: M7.3-B.4 CLOSED/PASS
Successor:    M7.3-B.6 — Runtime Verification

Verdict: GO WITH CONDITIONS (7 conditions)

Open business decisions: 4 (OBD-01, OBD-02, OBD-03, OBD-06, OBD-07)
Open technical decisions: 5
External verification:   None required

Architecture Audit Phase: COMPLETE
Implementation Performed: NO
Business/Architecture Lock: NOT YET CREATED
Implementation Authorization: NOT GRANTED

NEXT STAGE:
M7.3-B.5 BUSINESS RULES + ARCHITECTURE DECISION LOCK
========================================
```
