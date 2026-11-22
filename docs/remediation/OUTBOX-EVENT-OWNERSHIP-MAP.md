# Outbox Event Ownership Map

**Date:** 18 November 2026  
**Repository:** `nabeel2323/scs-platform`  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Finding:** G-003 — Generic outbox dispatcher competes with carrier worker  
**Status:** VERIFIED IN CI #687 — SOURCE REVIEW COMPLETE FOR CURRENTLY IDENTIFIED PUBLISHERS

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

- `apps/api/src/common/outbox/outbox.module.ts`: confirms `OutboxDispatcher` is the only provider exported by the global outbox module.
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

## Runtime worker registration (source evidence)

The current NestJS source registers background pollers as providers inside the API application; a separate Render worker service is not required by the current source topology. This is a source-level conclusion, not a claim that the Render runtime was inspected after deployment.

| Worker / dispatcher | Module registration | Startup behavior | Runtime gate |
|---|---|---|---|
| `OutboxDispatcher` | Global `OutboxModule`, imported by `AppModule` | Starts polling after 5 seconds; 1-second interval | No environment gate in source |
| `ShippingCarrierWorker` | `ShippingModule`, imported by `AppModule` | Starts polling after 8 seconds; 5-second interval | No environment gate in source |
| `CarrierTrackingPoller` | `ShippingModule` provider | Starts polling after 15 seconds | No environment gate in source |
| `AutoCompleteWorker` | `OrdersModule` provider | Starts polling after 30 seconds | No environment gate in source |
| `ReturnExpirationWorker` | `ReturnsModule` provider | Starts after configured delay (default 45 seconds) | Explicitly disabled unless `P13_WORKER_ENABLED` is enabled |
| `P13MonitorService` | `OperationsModule` provider | Operational monitor; inspect its own scheduler/lease configuration separately | P13 operational configuration |

All modules above are imported by `AppModule`. Therefore every API process instantiates these providers; multi-instance deployment can run multiple pollers concurrently. Carrier outbox claiming uses `FOR UPDATE SKIP LOCKED` and per-event leases, while the generic dispatcher excludes the carrier namespace. Other workers must be reviewed against their own lease/claim strategy before increasing API replicas.

The inspected Render workspace previously showed one API service and no separate worker service. This aligns with the in-process source topology but does not prove which environment flags are set in the live service. No Render service was restarted or changed during this review.

## Verification state

- CI #687 passed the PostgreSQL Testcontainers integration test that inserts carrier and non-carrier outbox rows, invokes the production `OutboxDispatcher.poll()` and verifies only the non-carrier row is dispatched, then invokes `ShippingCarrierWorker.poll()` and verifies the carrier event is claimed and retried for its unsupported type without being acknowledged.
- CI #687 also passed API unit/coverage tests for carrier-only claim, carrier-only stale-lease recovery and unsupported-event retry behavior.
- The full event-type map is a source scan of current publisher paths, not proof that each non-carrier event has a business side-effect consumer. The generic dispatcher is intentionally documented as a log sink only.
- No live carrier credentials, shipment creation, cancellation, label request or tracking poll was invoked during this remediation.

## Remaining work

- G-003 poller ownership proof is complete for the persisted carrier/non-carrier cases exercised in CI #687; extend coverage only if a new publisher/event family or consumer is introduced.
- Keep G-010 label-generation behavior as a separate finding; this ownership map does not close the label handler no-op.
- P13 activation and alert-sink verification remain separate operational work; no workers were newly activated and no deployment topology was changed.


## Shipping provider registry wiring — 22 November 2026

A source cross-check found that `ShippingModule` registered `AramexProvider` in Nest DI and exported it, but `ShippingService.onModuleInit()` registered only `ManualDeliveryProvider` in `ShippingProviderRegistry`. The carrier worker resolves the persisted provider key through that registry and defaults missing shipment provider keys to `aramex`; therefore Aramex events could fail with an unknown-provider error even though the provider class was present in DI.

The registry wiring now keeps `manual-driver` as the default and registers the injected Aramex adapter as a non-default provider. Registration does not read credentials or invoke Aramex. Per-store carrier configuration and active organization-scoped encrypted credentials remain required at operation time. A focused provider-registration test is added but not executed; no live carrier request or credential change occurred.
