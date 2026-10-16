# SCS-M7.3-A Implementation Results — Delivery Completion & Master Order Consistency

> **Milestone**: M7.3-A — Delivery Completion & Master Order Consistency
> **Pre-Audit**: SCS-M7.3-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md (Verdict: GO WITH CONDITIONS)
> **Status**: IMPLEMENTATION COMPLETE
> **Date**: 2026-09-29
> **Baseline**: develop branch, post M7.2.4-A.1 + M7.3 audit

---

## 1. Executive Summary

M7.3-A delivers the **delivery completion** and **master order status consistency** subsystems identified as critical gaps in the pre-implementation audit. The implementation adds:

1. **Master order status aggregation** — deterministic function computing master status from all sub-order statuses, recalculated on every sub-order transition
2. **DELIVERED → COMPLETED lifecycle** — buyer confirmation + auto-completion after configurable window (default 72h, matching dispute window)
3. **Carrier → Order delivery bridge** — carrier tracking poller triggers order DELIVERED when carrier reports delivery
4. **Completion notifications** — `order.completed` outbox event + in-app notification
5. **Web and Mobile buyer UI** — "Confirm Delivery" button when DELIVERED, "Completed" banner when COMPLETED
6. **PostgreSQL concurrency safety** — FOR UPDATE SKIP LOCKED (auto-complete worker), optimistic locking (all transitions)
7. **Tenant security and RBAC** — buyer-only confirmation, cross-tenant isolation, role enforcement

**Scope boundaries respected**: No returns, refunds, payment, disputes redesign, or cancellation changes — those are later milestones.

**Verification**: TypeScript compiles clean (0 errors), 127 unit tests pass, dart analyze clean (0 errors, 7 info-level hints), 22 new integration tests written.

---

## 2. Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `infra/drizzle/migrations/0047_delivery_completion.sql` | 69 | Schema migration: buyer_confirmed_at, auto_complete_at, partial index, master backfill |
| `apps/api/src/modules/orders/auto-complete.worker.ts` | 125 | Polling worker for auto-completion of DELIVERED orders |
| `apps/api/src/__tests__/integration/m73a-delivery-completion.postgres.spec.ts` | 465 | Concurrency, security, idempotency, master lifecycle tests |

---

## 3. Files Modified

### 3.1 Backend — Core Domain

| File | Change |
|------|--------|
| `apps/api/src/modules/orders/orders.schema.ts` | Added `buyerConfirmedAt` and `autoCompleteAt` timestamp columns |
| `apps/api/src/modules/orders/orders.service.ts` | +335 lines: 5 new methods, 7 modified methods |
| `apps/api/src/modules/orders/orders.controller.ts` | Added `POST /orders/:id/confirm-delivery` endpoint |
| `apps/api/src/modules/orders/orders.module.ts` | Registered AutoCompleteWorker, forwardRef for ShippingModule |
| `apps/api/src/modules/shipping/shipping.module.ts` | Added forwardRef for OrdersModule (carrier bridge) |
| `apps/api/src/modules/shipping/carrier-tracking-poller.ts` | Injected OrdersService, added carrier→order delivery bridge |
| `apps/api/src/modules/notifications/notifications.service.ts` | Added `order.completed` template, updated `order.delivered` text |

### 3.2 Frontend — Web

| File | Change |
|------|--------|
| `apps/web/src/lib/buyer-api.ts` | Added `confirmDelivery(orderId)` API function |
| `apps/web/src/app/orders/[id]/page.tsx` | Added "Confirm Delivery" button (DELIVERED), "Completed" banner (COMPLETED) |

### 3.3 Frontend — Mobile

| File | Change |
|------|--------|
| `mobile/lib/services/api_service.dart` | Added `confirmDelivery(orderId)` method |
| `mobile/lib/screens/orders/order_detail_screen.dart` | Added "Confirm Delivery" button (DELIVERED), "Completed" banner (COMPLETED) |

---

## 4. Implementation Details

### 4.1 Migration 0047 — Schema Changes

```sql
-- New columns on orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_confirmed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS auto_complete_at TIMESTAMPTZ;

-- Partial index for auto-complete scheduler
CREATE INDEX IF NOT EXISTS idx_orders_auto_complete
  ON orders (auto_complete_at ASC)
  WHERE status = 'DELIVERED'
    AND auto_complete_at IS NOT NULL
    AND buyer_confirmed_at IS NULL;

-- Backfill master_orders.status from sub-order aggregation
UPDATE master_orders SET status = computed.status FROM (...) computed
  WHERE master_orders.id = computed.master_order_id;
```

**Idempotent**: All DDL uses `IF NOT EXISTS`. Backfill is safe to re-run.

### 4.2 Master Order Status Aggregation

**Static deterministic function** — `OrdersService.computeMasterStatus(subOrderStatuses: string[]): string`

Priority rules (first match wins):
| Condition | Master Status |
|-----------|---------------|
| ALL COMPLETED | COMPLETED |
| ALL CANCELLED/REJECTED | CANCELLED |
| ALL DELIVERED or COMPLETED | DELIVERED |
| ANY DISPUTED | DISPUTED |
| ANY OUT_FOR_DELIVERY/ASSIGNED/PICKED_UP | OUT_FOR_DELIVERY |
| ANY PREPARING/READY | PREPARING |
| ANY ACCEPTED/PARTIALLY_ACCEPTED | ACCEPTED |
| ANY SUBMITTED/PENDING_CONFIRMATION | SUBMITTED |

**Recalculation trigger**: `recalculateMasterOrderStatus(masterOrderId)` is called after every sub-order transition. Uses `SELECT ... FOR UPDATE` on the master row to prevent lost updates. Idempotent — publishes `order.master.status_changed` outbox event only on actual change.

**Modified methods that trigger recalculation**: `deliverOrder()`, `transitionStatus()`, `fulfillmentTransition()`, `driverFulfillmentTransition()`, `acceptOrder()`, `partiallyAcceptOrder()`, `rejectOrder()`, `completeOrder()`, `processCarrierDelivery()`.

### 4.3 Delivery Completion — Canonical Path

**Single canonical method**: `completeOrder(orderId, userId, actorType, source)`

- Validates DELIVERED → COMPLETED transition via FSM
- Atomic optimistic lock: `UPDATE ... WHERE id = X AND status = currentStatus`
- **No inventory movement** — stock SALE was already consumed at DELIVERED
- Updates shipment `completedAt`, records status history, publishes `order.completed` outbox
- Emits realtime event, recalculates master order

**Three entry points** (all use the same canonical method):
1. **Buyer confirmation**: `confirmDelivery()` → records `buyerConfirmedAt` → `completeOrder(source='BUYER_CONFIRMATION')`
2. **Auto-completion**: `AutoCompleteWorker` → `completeOrder(source='AUTO_COMPLETION')`
3. **Future triggers**: Any new trigger just calls `completeOrder()`

### 4.4 Buyer Confirmation — Security Model

```
POST /v1/orders/:id/confirm-delivery
Guards: @UseGuards(PermissionsGuard) + @RequirePermission('orders:write')
```

**Authorization chain**:
1. `assertOrderAccessible()` — tenant scoping (buyer owns order, or caller's org owns store, or platform admin)
2. **Buyer-only check**: `order.buyerId === caller.sub` OR `isTenantPrivileged(caller)` (SUPER_ADMIN/ADMIN/MODERATOR)
3. Merchants and drivers are explicitly rejected with `ForbiddenException`

**Idempotency**: Uses `buyer_confirmed_at IS NULL` as additional optimistic lock condition. If already confirmed, returns success without side effects. If order already COMPLETED (by auto-complete), returns success.

### 4.5 Auto-Complete Worker

```typescript
@Injectable() AutoCompleteWorker implements OnModuleInit, OnModuleDestroy
```

- Polls every 60s (configurable via `AUTO_COMPLETE_POLL_INTERVAL_MS`)
- Claims DELIVERED orders where `auto_complete_at <= NOW()` and `buyer_confirmed_at IS NULL`
- Uses `FOR UPDATE SKIP LOCKED` for multi-instance safety
- Batch size: 20 orders per cycle
- Crash-safe: if worker dies between claim and completion, row lock releases and next cycle re-claims
- Calls canonical `completeOrder()` with `source='AUTO_COMPLETION'`
- Handles `ConflictException` as idempotent no-op (buyer already confirmed)

**Auto-complete window**: `ORDER_AUTO_COMPLETE_HOURS` env var (default 72h, matching dispute window). Set on the order when `deliverOrder()` transitions to DELIVERED.

### 4.6 Carrier → Order Delivery Bridge

**Entry point**: `processCarrierDelivery(orderId, carrierShipmentId, source)`

- Called by `CarrierTrackingPoller` when carrier status becomes DELIVERED
- Idempotent: if order is already DELIVERED or beyond, returns `false` (no-op)
- Uses optimistic lock internally via `deliverOrder()` path
- Settles stock (SALE), updates shipment, records history, sets `autoCompleteAt`, recalculates master

**Circular dependency**: OrdersModule ↔ ShippingModule resolved via NestJS `forwardRef()` on both sides.

### 4.7 Notification Templates

| Template | Channel | Trigger |
|----------|---------|---------|
| `order.completed` | IN_APP | `completeOrder()` publishes via outbox |
| `order.delivered` | IN_APP | Updated text to mention confirmation/dispute window |

### 4.8 Web Buyer UI

**Order Detail Page** (`apps/web/src/app/orders/[id]/page.tsx`):

- **DELIVERED state**: Yellow prompt banner — "Received your order?" with "Confirm Delivery" button
- **COMPLETED state**: Green success banner — "Order completed — Delivery has been confirmed"
- Button shows loading state during confirmation
- Error banner on failure

### 4.9 Mobile Buyer UI

**Order Detail Screen** (`mobile/lib/screens/orders/order_detail_screen.dart`):

- **DELIVERED state**: Warning-colored container with "Received your order?" text and green "Confirm Delivery" button
- **COMPLETED state**: Success-colored banner with check icon — "Order completed — delivery confirmed"
- Uses `TaifTokens.ok` and `TaifTokens.warn` from the design system
- Busy state disables all actions during confirmation

---

## 5. Concurrency Safety

| Scenario | Mechanism | Outcome |
|----------|-----------|---------|
| Double buyer confirm | `buyer_confirmed_at IS NULL` guard | One transitions, other is idempotent success |
| Buyer confirm vs auto-complete | Optimistic lock on status | One COMPLETED result, no double transition |
| Double carrier delivery | Idempotent check (already DELIVERED+) | One succeeds, other returns false |
| Double completeOrder | Optimistic lock `WHERE status = currentStatus` | One succeeds, one ConflictException |
| Auto-complete worker multi-instance | `FOR UPDATE SKIP LOCKED` | Each instance claims different orders |
| Master status concurrent updates | `SELECT ... FOR UPDATE` on master row | No lost updates |

---

## 6. Test Coverage

### 6.1 New Integration Tests (`m73a-delivery-completion.postgres.spec.ts`)

**Unit — Master Status Aggregation (6 tests)**:
| ID | Test |
|----|------|
| MST-01 | All COMPLETED → master COMPLETED |
| MST-02 | All DELIVERED or COMPLETED → master DELIVERED |
| MST-03 | One DISPUTED → master DISPUTED |
| MST-04 | All CANCELLED/REJECTED → master CANCELLED |
| MST-05 | Mixed active statuses → correct priority |
| MST-06 | Empty sub-orders → SUBMITTED |

**Security (5 tests)**:
| ID | Test |
|----|------|
| SEC-M73A-01 | Buyer A cannot confirm Buyer B's order |
| SEC-M73A-02 | Merchant cannot confirm delivery |
| SEC-M73A-03 | Cross-organization confirm blocked |
| SEC-M73A-04 | Non-DELIVERED order fails |
| SEC-M73A-05 | Driver cannot confirm delivery |

**Concurrency (4 tests)**:
| ID | Test |
|----|------|
| CON-M73A-01 | Double buyer confirm — idempotent |
| CON-M73A-02 | Buyer confirm vs auto-complete race |
| CON-M73A-03 | Double carrier delivery bridge |
| CON-M73A-04 | Double completeOrder — one conflict |

**Idempotency (3 tests)**:
| ID | Test |
|----|------|
| IDE-M73A-01 | Confirm after auto-complete returns success |
| IDE-M73A-02 | Auto-complete after buyer confirm is no-op |
| IDE-M73A-03 | Carrier delivery on already-DELIVERED is no-op |

**Master Lifecycle (5 tests)**:
| ID | Test |
|----|------|
| MST-INT-01 | Delivering all sub-orders → master DELIVERED |
| MST-INT-02 | Completing all sub-orders → master COMPLETED |
| MST-INT-03 | buyer_confirmed_at set on confirmation |
| MST-INT-04 | auto_complete_at set on delivery (~72h) |
| MST-INT-05 | Outbox event published on completion |

**Total: 23 new tests**

### 6.2 Regression Results

| Check | Result |
|-------|--------|
| `tsc --noEmit` | ✅ Clean (0 errors) |
| Unit tests (`orders/`) | ✅ 127/127 passed (6 files) |
| `dart analyze` (mobile) | ✅ 0 errors, 0 warnings, 7 info hints |

---

## 7. Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `ORDER_AUTO_COMPLETE_HOURS` | `72` | Hours after delivery before auto-completion triggers |
| `AUTO_COMPLETE_POLL_INTERVAL_MS` | `60000` | Worker poll interval in milliseconds |

---

## 8. Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Deterministic static aggregation (not MIN/MAX) | Order statuses are not linearly ordered; explicit priority rules handle all combinations |
| No inventory movement on COMPLETED | Stock SALE settlement already happened at DELIVERED; moving again would double-consume |
| Single canonical `completeOrder()` | Avoids duplicating transition logic across buyer confirm, auto-complete, and future triggers |
| `forwardRef()` for circular dependency | NestJS standard pattern; OrdersModule ↔ ShippingModule need each other for carrier bridge |
| `FOR UPDATE SKIP LOCKED` on auto-complete | Multi-instance safe; crash-safe (lock releases on connection close) |
| `buyer_confirmed_at IS NULL` as idempotency guard | Allows distinguishing buyer-confirmed from auto-completed in analytics |
| Partial index for scheduler | Only indexes rows the worker actually needs; avoids full table scan |
| 72h auto-complete window | Matches the dispute window — buyer has 72h to dispute before auto-completion |

---

## 9. Outbox Events

| Topic | Aggregate | Payload | Publisher |
|-------|-----------|---------|-----------|
| `order.completed` | order ID | `{ orderId, storeId, source }` | `completeOrder()` |
| `order.master.status_changed` | master order ID | `{ masterOrderId, previousStatus, newStatus, buyerId }` | `recalculateMasterOrderStatus()` (only on change) |

---

## 10. API Endpoints

| Method | Path | Guard | Description |
|--------|------|-------|-------------|
| POST | `/v1/orders/:id/confirm-delivery` | `PermissionsGuard` + `orders:write` | Buyer confirms delivery → COMPLETED |

---

## 11. Scope Exclusions (Deferred to Later Milestones)

The following were explicitly **not** implemented in M7.3-A:

- Payment capture/authorization/settlement
- Refund processing
- Return merchandise authorization (RMA)
- Inventory return-to-stock
- Dispute financial resolution
- Cancellation flow redesign
- Order splitting/merging
- Multi-currency master order totals

These are tracked as subsequent M7.3 sub-milestones.

---

## 12. Migration Path

**For existing deployments**:
1. Run migration `0047_delivery_completion.sql` — all DDL is idempotent (`IF NOT EXISTS`)
2. The backfill UPDATE computes master_orders.status from current sub-order statuses
3. No downtime required — new columns are nullable, index is partial
4. Auto-complete worker starts polling after module init (30s warmup)
5. Set `ORDER_AUTO_COMPLETE_HOURS` env var if different from 72h default is desired

---

*End of M7.3-A Implementation Results*
