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
| `order.*`, `order.fulfillment.*`, `order.master.status_changed` | `OrdersService` | No generic outbox consumer found | Pending. Observed examples include `order.submitted`, `order.pending_confirmation`, `order.accepted`, `order.partially_accepted`, `order.rejected`, `order.cancelled`, `order.fulfillment.assigned`, `order.fulfillment.delivered` and master-status transitions. Some transitions also emit WebSocket updates directly; those socket emits are not durable outbox delivery. |
| `shipment.*` | `OrdersService` | No generic outbox consumer found | Pending. Observed examples include `shipment.cancelled`, `shipment.delivery_exception`, `shipment.delivery_exception_resolved`, `shipment.delivery_retry_requested`, `shipment.rts_requested`, `shipment.rts_approved`, `shipment.rts_completed` and `shipment.return_processed`. Shipment lifecycle records are also persisted separately. |
| `return.*` | `ReturnsService` | No generic outbox consumer found | Pending. `P13MonitorService` observes selected failed return/refund events; it does not deliver them. |
| `commission.reversed` | `returns/CommissionReversalService` | No generic outbox consumer found | Pending. The service publishes `commission.reversed`; financial reconciliation/monitoring is not event delivery. |
| `settlement_adjustment.*` | `returns/SettlementAdjustmentService` | No generic outbox consumer found | Pending. Observed examples include submitted, approved, approval_added, rejected and posted. No publisher/consumer adapter is wired. |
| `payment.*` | `PaymentsService` | No generic outbox consumer found | Pending. Observed examples include `payment.proof_submitted`, `payment.confirmed`, `payment.rejected`, `payment.refund_requested`, `payment.refund_succeeded`, `payment.settlement_calculated`, `payment.cancelled` and `payment.expired`. Payment state/provider workflows are separate from outbox notification delivery. |
| `review.created`, `dispute.*` | `ReviewsService` / `DisputesService` | No generic outbox consumer found | Pending. Observed dispute events include opened, resolved and status-history transitions for evidence/response submission; only opened/resolved currently publish through OutboxDispatcher in the inspected service. |
| `inventory.low_stock`, `inventory.transferred` | `InventoryService` | No generic outbox consumer found | Pending. |
| `merchant.store.created`, `merchant.verification.*` | `MerchantService` | No generic outbox consumer found | Pending. Verification events include a direct transactional insert into `outbox_events`. |
| `store_member.*` | `StoreMembershipService` | No generic outbox consumer found | Pending. Observed examples include `store_member.added`, `.removed`, `.role_changed`, `.activated` and `.deactivated`. |
| `catalog.product.published` | `CatalogService` | No generic outbox consumer found | Pending. |

## Producer scan notes

The follow-up source pass explicitly inspected `OrdersService`, `ReturnsService`, `PaymentsService`, `ReviewsService`, `InventoryService`, `MerchantService`, `StoreMembershipService` and `CatalogService` for `OutboxDispatcher.publish()` calls and direct `outbox_events` inserts. It confirmed direct transactional outbox inserts in order submission, shipment delivery/exception/RTS/return-processing paths, and merchant verification decisions. It also confirmed that return and payment event names include dynamic status/action variants, so consumers must validate an allow-list rather than assume every prefix member is supported.

This remains a bounded source pass, not a complete repository-wide proof: commission/settlement/dispute producer paths and any dynamically generated SQL or helper-based inserts still require exact path discovery and review; persisted outbox rows/event history have not been queried. The event family rows above must therefore be treated as a working ownership inventory, not an exhaustive registry.

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
