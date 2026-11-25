# Outbox event ownership inventory

**Reviewed:** 25 November 2026  
**Repository baseline:** `develop` at `fde20420bbb759d2e562f9ff747c9e824ac58e25`

## Purpose and evidence boundary

This inventory records event families found in the API source producers and the consumer ownership that is actually wired in the current code. A producer calling `OutboxDispatcher.publish()` or inserting into `outbox_events` does not establish that a consumer exists. Likewise, direct WebSocket emits, audit rows, analytics events and notification sends are separate paths, not evidence of outbox consumption.

The scan covers the API module producers inspected for the outbox remediation. Dynamic status/action event names are shown as patterns. Before a publisher is enabled, this inventory must be reconciled against a complete repository-wide producer scan and database event history.

## Current consumer ownership

| Event family / examples | Producer area | Authoritative consumer found | Current disposition |
|---|---|---|---|
| `shipping.carrier.create`, `.cancel`, `.label`, `.track`, `.webhook.retry` | Orders/shipping | `ShippingCarrierWorker` | Dedicated consumer. Unknown events under the carrier prefix must be dead-lettered, never acknowledged as dispatched. |
| `order.*`, `order.fulfillment.*`, `order.master.status_changed` | `OrdersService` | No generic outbox consumer found | Pending; some status changes also emit WebSocket updates directly. Those socket emits are not durable outbox delivery. |
| `shipment.cancelled` | `OrdersService` | No generic outbox consumer found | Pending. Shipment lifecycle records are also persisted separately. |
| `return.*` | `ReturnsService` | No generic outbox consumer found | Pending. `P13MonitorService` observes selected failed return/refund events; it does not deliver them. |
| `commission.reversed` | `CommissionReversalService` | No generic outbox consumer found | Pending. Financial reconciliation/monitoring is not event delivery. |
| `settlement_adjustment.*` | `SettlementAdjustmentService` | No generic outbox consumer found | Pending. No publisher/consumer adapter is wired. |
| `payment.*` | `PaymentsService` | No generic outbox consumer found | Pending. Payment state and provider workflows are separate from outbox notification delivery. |
| `review.created`, `dispute.opened`, `dispute.resolved` | Reviews/disputes | No generic outbox consumer found | Pending. |
| `inventory.low_stock`, `inventory.transferred` | `InventoryService` | No generic outbox consumer found | Pending. |
| `merchant.store.created`, `merchant.verification.*` | `MerchantService` | No generic outbox consumer found | Pending. Verification events include a direct transactional insert into `outbox_events`. |
| `store_member.*` | `StoreMembershipService` | No generic outbox consumer found | Pending. |
| `catalog.product.published` | `CatalogService` | No generic outbox consumer found | Pending. |

## Important distinction: notification delivery

`NotificationsService` currently creates notification rows and dispatches channels through its own service path. The inspected module does not register an outbox-event consumer that maps the domain events above into notification templates. It must not be described as the consumer for these outbox families until that explicit routing and idempotent delivery integration exists.

## Required delivery contract before enabling a generic consumer

1. Assign exactly one authoritative consumer/adapter to each supported event type or explicitly declare the event informational/unconsumed.
2. Define a versioned payload contract, tenant/recipient resolution rules and data-minimization policy per event.
3. Claim rows atomically with durable ownership/lease fields; a transaction-scoped `SKIP LOCKED` claim alone is not a lease after commit.
4. Acknowledge `DISPATCHED` only after the downstream adapter confirms success. Use an idempotency key stable across retries.
5. Persist bounded, redacted failure details; apply retry/backoff and a visible dead-letter path. Unknown event types must never be silently acknowledged.
6. Test duplicate workers, concurrent claims, crash after claim, crash after downstream success but before acknowledgement, retry exhaustion, and tenant isolation against PostgreSQL.
7. Keep `shipping.carrier.*` exclusively owned by `ShippingCarrierWorker`; do not let a generic notification adapter claim those events.
8. Do not activate the generic poller in staging/production until the adapter, migration requirements, operational alerts and rollout/rollback plan are reviewed and separately authorized.

## Findings

- The generic `OutboxDispatcher` was only a log-only placeholder, not a delivery adapter. PR #153 disables that false-success poller while retaining transactional event writes.
- The dedicated carrier worker is the only concrete outbox event consumer found in this scan.
- The carrier worker previously logged unknown `shipping.carrier.*` event types and then marked them `DISPATCHED`. The remediation in this slice changes unknown types to terminal/unsupported errors so they enter the existing dead-letter path.
- No generic event delivery is implemented by this inventory. Non-carrier event rows remain `PENDING` until a separately implemented consumer owns them.
