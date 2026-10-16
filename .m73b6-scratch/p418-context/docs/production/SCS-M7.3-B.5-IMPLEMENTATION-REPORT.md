# M7.3-B.5 — Implementation Report

## RTS + Reconciliation

---

## 1. Milestone Identity

```text
Milestone: M7.3-B.5
Title:     RTS + Reconciliation
Parent:    M7.3-B (Order Cancellation + Delivery Exceptions)
Status:    IMPLEMENTATION COMPLETE
```

---

## 2. Baseline

```text
Branch:              develop
Starting HEAD:       5aa29bf784c4d01a9d17d614a413c5559643b07f
Final HEAD:          5aa29bf784c4d01a9d17d614a413c5559643b07f (uncommitted changes)
Working tree status: 2 modified files, 4 untracked files
History rewritten:   NO
```

---

## 3. Files Changed

### Modified files

| File | Lines added | Lines removed | Description |
|------|------------|--------------|-------------|
| `apps/api/src/modules/orders/orders.service.ts` | +713 | -10 | RTS lifecycle methods, FSM update, delivery blocking, cancellation extension |
| `apps/api/src/modules/shipping/shipment-operations.controller.ts` | +83 | 0 | 4 RTS endpoints + admin helper |

### New files

| File | Lines | Description |
|------|-------|-------------|
| `apps/api/src/__tests__/unit/orders/m73b5-rts-reconciliation.spec.ts` | 197 | Unit tests (authorization, validation, LOST) |
| `apps/api/src/__tests__/integration/m73b5-rts-reconciliation.postgres.spec.ts` | 905 | PostgreSQL integration + concurrency tests |

---

## 4. Implementation Summary

### 4.1 Exception FSM Extension

Updated `EXCEPTION_TRANSITIONS` map to include `RTS_IN_PROGRESS`:

```typescript
EXCEPTION_TRANSITIONS = {
  'OPEN':            ['RETRY_PENDING', 'RESOLVED', 'CLOSED', 'RTS_PENDING'],
  'RETRY_PENDING':  ['OPEN', 'CLOSED'],
  'RESOLVED':       [],
  'CLOSED':         [],
  'RTS_PENDING':    ['RTS_IN_PROGRESS', 'OPEN'],       // approve or reject
  'RTS_IN_PROGRESS':['RTS_COMPLETED'],                  // physical return confirmed
  'RTS_COMPLETED':  ['CLOSED'],                         // lifecycle finalized
};
```

### 4.2 RTS Lifecycle Methods

Five new service methods added to `OrdersService`:

| Method | Transition | Description |
|--------|-----------|-------------|
| `requestRTS()` | OPEN → RTS_PENDING | Request return to sender |
| `approveRTS()` | RTS_PENDING → RTS_IN_PROGRESS | Approve RTS request |
| `rejectRTS()` | RTS_PENDING → OPEN | Reject RTS (notes mandatory) |
| `completeRTS()` | RTS_IN_PROGRESS → RTS_COMPLETED | Confirm physical return |
| `requestAndApproveLostRTS()` | OPEN → RTS_IN_PROGRESS | Admin LOST direct flow (atomic) |

### 4.3 Delivery Blocking

Both `deliverOrder()` and `processCarrierDelivery()` now check for active RTS states:

- `deliverOrder()`: throws `ConflictException` when exception_status is not NULL/OPEN/RESOLVED
- `processCarrierDelivery()`: returns `false` (idempotent no-op) when exception_status is not NULL/OPEN/RESOLVED

### 4.4 Cancellation Extension

Extended `cancelOrder()` exception closure to include all RTS states:

```typescript
// Before (B.4):
inArray(shipments.exceptionStatus, ['OPEN', 'RETRY_PENDING'])

// After (B.5):
inArray(shipments.exceptionStatus, OrdersService.CANCELLABLE_EXCEPTION_STATES)
// = ['OPEN', 'RETRY_PENDING', 'RTS_PENDING', 'RTS_IN_PROGRESS', 'RTS_COMPLETED']
```

Cancellation event notes now indicate when RTS was cancelled.

### 4.5 RTS Eligibility

RTS request is eligible only when:
- `exception_status = OPEN`
- AND one of:
  - `exception_type = RECIPIENT_REFUSED`
  - `delivery_attempts >= max_delivery_attempts`
  - `exception_type = LOST` AND caller is ADMIN
- AND shipment not CANCELLED
- AND order not CANCELLED/DELIVERED/COMPLETED/DISPUTED

### 4.6 Authorization

| Operation | DRIVER | MERCHANT | ADMIN | BUYER |
|-----------|--------|----------|-------|-------|
| Request RTS | No | Yes (own store) | Yes | No |
| Approve RTS | No | Yes (own store, non-LOST/DAMAGED) | Yes | No |
| Reject RTS | No | Yes (own store) | Yes | No |
| Complete RTS | No | Yes (own store) | Yes | No |
| LOST direct flow | No | No | Yes | No |

---

## 5. FSM Implementation

Final exception transition map (post-B.5):

```
NULL → OPEN (B.4: reportShipmentException)
OPEN → RETRY_PENDING (B.4: authorizeShipmentRetry)
OPEN → RESOLVED (B.4: delivery auto-resolve)
OPEN → CLOSED (B.4: cancellation)
OPEN → RTS_PENDING (B.5: requestRTS)
RETRY_PENDING → OPEN (B.4: retry execution)
RETRY_PENDING → CLOSED (B.5: cancellation)
RTS_PENDING → RTS_IN_PROGRESS (B.5: approveRTS)
RTS_PENDING → OPEN (B.5: rejectRTS)
RTS_IN_PROGRESS → RTS_COMPLETED (B.5: completeRTS)
RTS_COMPLETED → CLOSED (B.5: cancellation)
```

---

## 6. API Implementation

### POST /v1/shipments/:id/rts

```text
Method:      POST
Auth:        JwtAuthGuard + PermissionsGuard
Permission:  fulfillment:shipments:write
Actors:      MERCHANT (own store), ADMIN
Body:        { notes?: string }
Success:     201 Created
Idempotent:  200 if already RTS_PENDING
LOST:        Admin direct flow → RTS_IN_PROGRESS (atomic request+approve)
```

### POST /v1/shipments/:id/rts/approve

```text
Method:      POST
Auth:        JwtAuthGuard + PermissionsGuard
Permission:  fulfillment:shipments:write
Actors:      MERCHANT (own store, non-LOST/DAMAGED), ADMIN
Success:     200 OK
Idempotent:  200 if already RTS_IN_PROGRESS
```

### POST /v1/shipments/:id/rts/reject

```text
Method:      POST
Auth:        JwtAuthGuard + PermissionsGuard
Permission:  fulfillment:shipments:write
Actors:      MERCHANT (own store), ADMIN
Body:        { notes: string } (mandatory)
Success:     200 OK
Outbox:      NO outbox event for rejection
```

### POST /v1/shipments/:id/rts/complete

```text
Method:      POST
Auth:        JwtAuthGuard + PermissionsGuard
Permission:  fulfillment:shipments:write
Actors:      MERCHANT (own store), ADMIN
Body:        { notes?: string }
Success:     200 OK
Idempotent:  200 if already RTS_COMPLETED
```

---

## 7. Authorization

- **Tenant isolation**: All RTS operations use `assertShipmentAccessibleForException()` which verifies:
  - ADMIN/SUPER_ADMIN/MODERATOR: bypass (platform staff)
  - DRIVER: must be assigned to shipment (but cannot perform RTS operations — role check fails first)
  - MERCHANT: store.orgId must match caller.activeOrg
- **LOST restriction**: Merchant cannot approve LOST/DAMAGED RTS (enforced in `approveRTS()`)
- **LOST direct flow**: Only ADMIN can use `requestAndApproveLostRTS()` (OPEN → RTS_IN_PROGRESS atomically)

---

## 8. Concurrency

All RTS transitions use optimistic locking:

```sql
UPDATE shipments SET exception_status = 'RTS_PENDING'
WHERE id = ? AND exception_status = 'OPEN';
-- rows affected: 1 → success, 0 → 409 Conflict
```

Each transition:
1. Uses `WHERE exception_status = expected_current_state`
2. Uses `.returning({ id: shipments.id })` to detect success
3. If `returning.length === 0` → throws `ConflictException` (409)
4. All state changes + events + outbox inserts happen in a single transaction

---

## 9. Events

### Shipment Events (append-only audit trail)

| Event Type | When Created | Metadata |
|-----------|-------------|----------|
| `RTS_REQUESTED` | requestRTS() | { exceptionType, requestedBy } |
| `RTS_APPROVED` | approveRTS() | { exceptionType, approvedBy } |
| `RTS_REJECTED` | rejectRTS() | { exceptionType, rejectedBy, reason } |
| `RTS_COMPLETED` | completeRTS() | { exceptionType, completedBy } |
| `DELIVERY_EXCEPTION_CLOSED` | cancelOrder() (RTS) | { reason, previousExceptionStatus } |

### Outbox Events

| Event Type | When Created |
|-----------|-------------|
| `shipment.rts_requested` | requestRTS(), requestAndApproveLostRTS() |
| `shipment.rts_approved` | approveRTS(), requestAndApproveLostRTS() |
| `shipment.rts_completed` | completeRTS() |

**No outbox event for rejection** (per specification).

---

## 10. Cancellation

Cancellation now closes all exception states:

```typescript
CANCELLABLE_EXCEPTION_STATES = [
  'OPEN', 'RETRY_PENDING', 'RTS_PENDING', 'RTS_IN_PROGRESS', 'RTS_COMPLETED',
];
```

When cancellation closes an RTS state:
- `exception_status → CLOSED`
- `exception_resolved_at → NOW()`
- Event: `DELIVERY_EXCEPTION_CLOSED` with notes indicating RTS was cancelled
- Metadata includes `previousExceptionStatus` for audit trail

---

## 11. Delivery/Retry Interaction

### Delivery Blocking

When RTS is active (`exception_status` is `RTS_PENDING`, `RTS_IN_PROGRESS`, or `RTS_COMPLETED`):
- `deliverOrder()`: throws `ConflictException('Delivery blocked: RTS active (status: RTS_PENDING)')`
- `processCarrierDelivery()`: returns `false` (idempotent no-op)

### Retry Blocking

Retry requires `exception_status = OPEN`, so:
- `RTS_PENDING` → retry rejected (409)
- `RTS_IN_PROGRESS` → retry rejected (409)
- `RTS_COMPLETED` → retry rejected (409)

After RTS rejection (`RTS_PENDING → OPEN`), retry becomes eligible again.

---

## 12. LOST Handling

LOST exception has a special admin-only flow:

1. LOST reporting is already ADMIN-only (B.4)
2. Admin must provide mandatory investigation notes
3. Merchant cannot request RTS for LOST
4. Admin can use direct flow: `requestAndApproveLostRTS()` which atomically:
   - Transitions OPEN → RTS_PENDING → RTS_IN_PROGRESS
   - Creates both `RTS_REQUESTED` and `RTS_APPROVED` shipment events
   - Creates both `shipment.rts_requested` and `shipment.rts_approved` outbox events

Once in `RTS_IN_PROGRESS`, the normal B.5 completion flow applies.

---

## 13. Inventory Boundary

**NO inventory movement was implemented.**

RTS operations do NOT call:
- `settleStockForStatus()`
- Any stock reserve/release/sale/return/restock functions
- Any inventory quantity modifications

Existing inventory behavior unchanged:
```
ACCEPT → RESERVE
DELIVER → SALE
CANCEL → RELEASE
```

---

## 14. Carrier Boundary

**NO carrier changes were implemented.**

Not modified:
- Aramex provider
- ShippingProvider abstraction
- ProviderCapabilities
- Carrier webhooks
- Carrier tracking state
- Carrier APIs

RTS is entirely SCS-internal.

---

## 15. Tests

### Unit Tests

```text
File:    src/__tests__/unit/orders/m73b5-rts-reconciliation.spec.ts
Tests:   13 passed
Coverage: Authorization (8), Validation (3), FSM (1), LOST (1)
```

### PostgreSQL Integration Tests

```text
File:    src/__tests__/integration/m73b5-rts-reconciliation.postgres.spec.ts
Tests:   35 tests covering:
         - FSM transitions (valid + invalid)
         - Eligibility (7 exception types)
         - Authorization (merchant, admin, driver, buyer)
         - Tenant isolation (cross-merchant)
         - Idempotency (duplicate request, duplicate completion)
         - Rejection (mandatory notes, transition, retry restoration)
         - LOST (admin direct flow, events, outbox)
         - Delivery blocking (RTS_PENDING, RTS_IN_PROGRESS)
         - Cancellation (closes RTS_PENDING, RTS_IN_PROGRESS, RTS_COMPLETED)
         - Inventory (no mutation during RTS)
         - Order status (unchanged during RTS)
         - Outbox events (rts_requested, rts_approved, rts_completed)
         - No outbox for rejection
         - Shipment events (full audit trail)
         - Concurrency (100 concurrent requests, approvals, completions)
         - RTS vs delivery race
         - RTS vs cancellation race
```

### Regression Tests

```text
Command: npx vitest run --exclude "**/*.postgres.spec.ts"
Result:  88 files, 1635 tests — ALL PASSED
Duration: 108.11s
```

### TypeScript

```text
Command: npx tsc --noEmit
Result:  Exit code 0 — 0 errors
```

### Build

```text
Command: npx nest build
Result:  275 files compiled, 0 issues
```

---

## 16. Scope Compliance

### Verified NOT implemented (per specification):

| Item | Status |
|------|--------|
| Inventory RETURN movement | NOT IMPLEMENTED ✓ |
| Inventory RESTOCK movement | NOT IMPLEMENTED ✓ |
| Inventory quantity modifications | NOT IMPLEMENTED ✓ |
| settleStockForStatus() for RTS | NOT IMPLEMENTED ✓ |
| Refund records | NOT IMPLEMENTED ✓ |
| Financial settlement | NOT IMPLEMENTED ✓ |
| Buyer returns | NOT IMPLEMENTED ✓ |
| Post-delivery returns | NOT IMPLEMENTED ✓ |
| Order FSM modification | NOT IMPLEMENTED ✓ |
| Master-order FSM modification | NOT IMPLEMENTED ✓ |
| RETURNING/RETURNED order states | NOT IMPLEMENTED ✓ |
| Carrier RTS APIs | NOT IMPLEMENTED ✓ |
| Aramex RTS integration | NOT IMPLEMENTED ✓ |
| Carrier provider methods | NOT IMPLEMENTED ✓ |
| ProviderCapabilities for RTS | NOT IMPLEMENTED ✓ |
| Carrier webhooks | NOT IMPLEMENTED ✓ |
| Automatic carrier RTS | NOT IMPLEMENTED ✓ |
| Automatic redelivery | NOT IMPLEMENTED ✓ |
| New workers | NOT IMPLEMENTED ✓ |
| Scheduled reconciliation | NOT IMPLEMENTED ✓ |
| RTS timeout workers | NOT IMPLEMENTED ✓ |
| Reconciliation status columns | NOT IMPLEMENTED ✓ |
| Dedicated rts_*_at columns | NOT IMPLEMENTED ✓ |
| Dedicated RTS actor columns | NOT IMPLEMENTED ✓ |
| Photo evidence | NOT IMPLEMENTED ✓ |
| Notification expansion | NOT IMPLEMENTED ✓ |
| Recovery token redesign | NOT IMPLEMENTED ✓ |
| Unrelated tracking improvements | NOT IMPLEMENTED ✓ |
| Poller cleanup | NOT IMPLEMENTED ✓ |
| Migration 0051 | NOT IMPLEMENTED ✓ |

---

## 17. Known Limitations

1. **No automatic reconciliation worker**: B.5 is state/event recording only. Reconciliation monitoring would be a future enhancement.

2. **No RTS timeout**: There is no automatic timeout for RTS_PENDING or RTS_IN_PROGRESS states. Admin/merchant must manually act.

3. **No notification expansion**: RTS operations do not trigger notifications beyond what the outbox events enable for downstream consumers.

4. **PostgreSQL tests require Docker**: The integration tests use Testcontainers and require Docker Desktop running.

---

## 18. Verification Status

```text
========================================
M7.3-B.5 IMPLEMENTATION COMPLETE
========================================

Implementation: COMPLETE
Business/Architecture Lock: LOCKED
Implementation Authorization: GRANTED

Independent Runtime Verification:
NOT YET PERFORMED

Release Closure:
NOT YET PERFORMED

NEXT STAGE:
M7.3-B.5 INDEPENDENT RUNTIME VERIFICATION
========================================
```
