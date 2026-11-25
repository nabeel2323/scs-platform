# Outbox dispatch safety — 25 November 2026

## Finding

The generic `OutboxDispatcher` had no delivery adapter. Its `dispatch()` method only wrote a log line, after which the poller changed the event status to `DISPATCHED`. That reported successful delivery without publishing to a bus, notification provider, or other consumer.

PR #147 separately established `ShippingCarrierWorker` as the authoritative consumer for `shipping.carrier.*` events and excluded those events from the generic poller. That fixed the carrier-consumer race, but did not make the generic dispatcher's remaining event types deliverable.

## Change in this slice

- Retain `OutboxDispatcher.publish()` as the transactional outbox writer.
- Disable automatic polling while no generic delivery adapter is configured.
- Do not mark generic events `DISPATCHED` merely because they were logged.
- Leave newly written events in `PENDING` until a real consumer can acknowledge delivery.
- Add regression coverage proving startup does not schedule the placeholder poller and event insertion remains `PENDING`.

This is fail-closed containment, not completion of generic event delivery. No new delivery guarantee is claimed.

## Verification status

- Source and regression test changes are committed together.
- The focused test has been authored but not executed in this environment.
- The implementation commit uses `[skip ci]` in accordance with the project's grouped-validation/Actions-budget decision. Existing develop CI #1509 passed on the parent SHA; it does not verify this change.
- Run the focused Vitest spec and the consolidated API/CI campaign before merge.

## Safety boundary

No schema or migration change, database write, grant/RLS/default-ACL change, staging fixture, provider call, Render setting change, restart, worker activation, deployment, or business workflow was performed. The currently deployed staging process is unchanged; this source behavior takes effect only through a separately authorized deployment.

## Remaining work

1. Define the supported event-type inventory and authoritative consumer for each event family.
2. Implement a real publisher/consumer adapter with durable claims, idempotent acknowledgement, retry/backoff, dead-letter visibility and observable delivery outcomes.
3. Add PostgreSQL concurrency/recovery tests proving an event cannot be acknowledged before successful delivery and cannot be lost across worker crashes.
4. Keep `ShippingCarrierWorker` as the sole owner of `shipping.carrier.*` events.
5. Reconcile worker activation and deployment only through the existing separately approved staging/release process.
