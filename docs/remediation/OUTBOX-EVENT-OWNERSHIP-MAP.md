# Outbox Event Ownership Map

**Date:** 18 November 2026  
**Repository:** `nabeel2323/scs-platform`  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Finding:** G-003 — Generic outbox dispatcher competes with carrier worker  
**Status:** SOURCE REVIEW COMPLETE FOR CURRENTLY IDENTIFIED PUBLISHERS; LATEST WORKER TESTS PENDING CI

## Purpose

Record the authoritative outbox consumer for each event family found in the current API publisher scan. The map distinguishes a domain-event consumer from the generic logging dispatcher. A row marked “generic log sink” means the event is logged and transitioned to `DISPATCHED`; it does **not** mean an email, SMS, payment, shipment, inventory operation or other external side effect was performed.

## Consumer ownership

| Event family / examples | Publisher(s) observed | Authoritative consumer | Actual behavior / boundary |
|---|---|---|---|
| `shipping.carrier.*` — `create`, `cancel`, `label`, `track`, `webhook.retry` | OrdersService, ShippingService and carrier webhook paths | `ShippingCarrierWorker` only | Claims only the carrier prefix with atomic `FOR UPDATE SKIP LOCKED`; uses leases, retry policy and provider idempotency. Generic dispatcher excludes this prefix. Stale lease recovery is now restricted to this prefix. Unsupported carrier event types throw into retry/dead-letter handling and are not acknowledged. |
| `order.*`, `order.fulfillment.*`, `order.master.status_changed`, `shipment.*` | OrdersService | `OutboxDispatcher` (generic log sink) | Logs and marks non-carrier events dispatched. Domain transitions and any direct notification/realtime calls occur in their domain services; do not infer a separate event handler from the outbox row alone. |
| `return.*` | ReturnsService | `OutboxDispatcher` (generic log sink) | Logs and marks dispatched. P13Monitor separately inspects failed return/refund/commission/settlement/adjustment prefixes for operational alerts. |
| `PAYMENT_*` — created, proof submitted, confirmed/rejected, refund requested/succeeded, cancelled/expired | PaymentsService | `OutboxDispatcher` (generic log sink) | Logs and marks dispatched. Payment state changes remain in PaymentsService; no payment gateway or payout side effect is implied by this consumer. |
| `catalog.product.published` | CatalogService | `OutboxDispatcher` (generic log sink) | Logs and marks dispatched. Publication itself is committed by CatalogService. |
| `dispute.*` | DisputesService | `OutboxDispatcher` (generic log sink) | Logs and marks dispatched. Dispute state transitions remain in DisputesService. |
| `merchant.verification.*`, `store_member.*` | MerchantService, StoreMembershipService | `OutboxDispatcher` (generic log sink) | Logs and marks dispatched. Membership/verification mutations are committed by their domain services. |
| `inventory.*` — `low_stock`, `transferred` | InventoryService | `OutboxDispatcher` (generic log sink) | Logs and marks dispatched. Inventory quantities are updated by InventoryService. |
| `refund.*`, `commission.*`, `settlement.*`, `adjustment.*` | Finance/returns lifecycle publishers where present | `OutboxDispatcher` (generic log sink) | P13Monitor scans these prefixes for failed outbox rows. This map does not claim that the generic dispatcher performs financial execution. |

## Enforced routing invariants

1. `OutboxDispatcher.poll()` selects pending events only when `event_type NOT LIKE 'shipping.carrier.%'`.
2. `ShippingCarrierWorker.claimEvents()` selects only `event_type LIKE 'shipping.carrier.%'`, with `FOR UPDATE SKIP LOCKED`.
3. `ShippingCarrierWorker.recoverStaleLeases()` applies the same carrier-prefix predicate; it cannot reset stale `PROCESSING` rows from another event family.
4. An unknown event inside the reserved carrier namespace throws and follows `handleFailure`; it is not silently marked `DISPATCHED`.
5. The worker is registered as a provider in `ShippingModule`.

## Evidence

- `apps/api/src/common/outbox/outbox-dispatcher.service.ts`: generic query exclusion and log-only `dispatch()`.
- `apps/api/src/modules/shipping/shipping-carrier.worker.ts`: carrier-only claim, lease recovery, event switch and retry handling.
- `apps/api/src/modules/shipping/shipping.module.ts`: worker provider registration.
- `apps/api/src/modules/orders/orders.service.ts`: order/shipment publisher family.
- `apps/api/src/modules/returns/returns.service.ts`: return publisher family.
- `apps/api/src/modules/payments/payments.service.ts`: payment publisher family.
- `apps/api/src/modules/catalog/catalog.service.ts`: product publication event.
- `apps/api/src/modules/reviews/disputes.service.ts`: dispute publisher family.
- `apps/api/src/modules/merchant/merchant.service.ts` and `store-membership.service.ts`: merchant verification and membership events.
- `apps/api/src/modules/inventory/inventory.service.ts`: inventory publisher family.
- `apps/api/src/modules/operations/p13-monitor.service.ts`: failed outbox monitoring for `return.`, `refund.`, `commission.`, `settlement.` and `adjustment.`.

## Verification state

- CI #592 passed the generic dispatcher exclusion predicate test in API unit/coverage.
- Latest carrier worker tests cover carrier-only claim, carrier-only stale lease recovery and unsupported carrier event retry behavior; these changes are newer than CI #592 and remain unverified by CI.
- The full event-type map is a source scan of current publisher paths, not proof that each non-carrier event has a business side-effect consumer. The generic dispatcher is intentionally documented as a log sink only.
- No live carrier credentials, shipment creation, cancellation, label request or tracking poll was invoked during this remediation.

## Remaining work

- Obtain CI for the latest worker changes and G-028 canonical lookup/category-count changes.
- Add an integration-level ownership test that persists representative carrier and non-carrier events and proves only the intended poller can claim each class.
- Keep G-010 label-generation behavior as a separate finding; this ownership map does not close the label handler no-op.
- Do not activate new workers or change deployment topology without explicit authorization.
