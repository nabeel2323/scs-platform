# Order completion atomicity — 25 November 2026

## Finding

`OrdersService.completeOrder()` previously changed the order status first, then performed shipment updates, shipment-history insertion, order-status history insertion, outbox publication and master-order recalculation through separate database operations. A failure after the first update could leave an order marked `COMPLETED` while one or more required records/events were missing. A retry would then fail the state transition and could not reliably repair the partial completion.

The auto-completion worker also used an `UPDATE orders SET updated_at = NOW()` statement as an apparent claim, but did not persist a lease and did not use `updated_at` in candidate eligibility. The row lock ended with that statement, and the update unnecessarily changed a business timestamp.

## Change in this slice

- Wrap the order status flip, shipment completion timestamp, shipment event, order status history and `order.completed` outbox event in one database transaction.
- Recalculate the master order inside the same transaction and write `order.master.status_changed` through that transaction executor.
- Extend `recalculateMasterOrderStatus()` with an optional transaction executor; existing callers retain the standalone transaction behavior.
- Emit realtime `order:updated` only after the database transaction commits.
- Change AutoCompleteWorker candidate selection to a read-only `SELECT ... FOR UPDATE SKIP LOCKED`; it no longer updates `orders.updated_at` while selecting candidates.
- Document the actual concurrency model: row locks reduce overlap during selection, while the conditional order-status update inside `completeOrder()` is the authoritative cross-instance guard. This is not a durable lease.
- Add regression specs for transactional writes, post-commit realtime and failure before outbox/realtime side effects.

## Safety and scope

- No schema or migration is required.
- No inventory movement is added; stock was already consumed at `DELIVERED`.
- Master status and its outbox event now commit/roll back with the sub-order completion.
- No staging database, Render setting, service restart, worker activation, deployment or business workflow was touched.

## Verification

The focused regression spec is authored but has not yet been executed in this environment. Run it with the API Vitest suite and include the orders integration suite in the consolidated validation campaign before merge.


## Follow-up correctness fix — buyer confirmation atomicity

The review found that `confirmDelivery()` previously wrote `buyerConfirmedAt` before calling the completion transaction. If a shipment/history/outbox write then failed, the order could remain `DELIVERED` while the auto-completion worker excluded it and a repeated buyer confirmation was rejected. The confirmation timestamp is now written in the same guarded order update as the `COMPLETED` transition when the source is `BUYER_CONFIRMATION`. A transactional failure therefore rolls back both fields together. A regression spec covers this rollback boundary.

This follow-up is authored but still requires execution in the consolidated validation campaign.
