# Order completion atomicity — 25 November 2026

## Finding

`OrdersService.completeOrder()` previously changed the order status first, then performed shipment updates, shipment-history insertion, order-status history insertion, outbox publication and master-order recalculation through separate database operations. A failure after the first update could leave an order marked `COMPLETED` while one or more required records/events were missing. A retry would then fail the state transition and could not reliably repair the partial completion.

The auto-completion worker also used an `UPDATE orders SET updated_at = NOW()` statement as an apparent claim, but did not persist a lease and did not use `updated_at` in candidate eligibility. The row lock ended with that statement, and the update unnecessarily changed a business timestamp.

## Change in this slice

- Wrap the order status flip, shipment completion timestamp, shipment event, order status history and `order.completed` outbox event in one database transaction.
- Recalculate the master order inside the same transaction and write `order.master.status_changed` through that transaction executor.
- Extend `recalculateMasterOrderStatus()` with an optional transaction executor; existing callers retain the standalone transaction behavior.
- Lock the master-order row before reading its current status. This ensures the status comparison and `previousStatus` event payload use the latest serialized master state.
- Emit realtime `order:updated` only after the database transaction commits.
- Add migration `0071_auto_complete_claim_leases.sql` and matching Drizzle fields for a durable five-minute claim (`auto_complete_claimed_at`, `auto_complete_claimed_by`) plus a partial eligibility index. Migration 0071 is separate from the pending `0070` `normalize_arabic` hardening migration.
- Claim one order at a time with an atomic CTE (`FOR UPDATE SKIP LOCKED` + `UPDATE`) that persists the worker ID and claim timestamp without mutating `orders.updated_at`.
- Fence the `DELIVERED → COMPLETED` update inside the existing completion transaction by matching the worker owner and requiring an unexpired five-minute lease. The same update clears lease fields; buyer confirmation also clears outstanding claims while competing through the status guard.
- Release claims conditionally by worker ID in `finally`; stale workers cannot clear a reassigned lease, and crashed-worker claims become reclaimable after five minutes.
- Record buyer `buyerConfirmedAt` in the same guarded transaction as buyer-triggered completion.
- Add regression specs for transactional writes, post-commit realtime, buyer-confirmation rollback and master-row lock/read ordering.

## CI findings and fixture correction

CI run #1525 on head `fb68724bcc67ecfc02c1a92edeff41bc1a697954` failed in both API unit/coverage and integration jobs. The failure summary reported 23 failed tests, all caused by transaction mocks in `orders.integration.spec.ts` and `stock-settlement.integration.spec.ts` not implementing `execute()` after master-order row locking was introduced.

The production row-lock operation was retained. Both mocked transaction fixtures now provide:

```ts
execute: vi.fn().mockResolvedValue({ rows: [] }),
```

This updates the mock transaction contract; it does not bypass or weaken the production lock. The fixture correction commits are `3653a3113d7567e4b3b20d4f9bb4dabe39c7af6a` and `5411e2c8363041b4c3c066226a50f9a62ec38773`.

On run #1525, lint/typecheck, mobile, web/admin, migration full apply and boundary lint passed. Unit/coverage and integration failed on the missing mock method. Contract/codegen, build and container jobs were skipped because prerequisites failed. A fresh full CI run on the corrected exact head is required; the earlier successful run #1524 and failed run #1525 do not validate the corrected head.

## Safety and scope

- Migration 0071 is additive and limited to two nullable lease columns and one partial index; it changes no grants, RLS, roles or default ACLs.
- No inventory movement is added; stock was already consumed at `DELIVERED`.
- Master status and its outbox event commit/roll back with the sub-order completion.
- No staging database, Render setting, service restart, worker activation, deployment or business workflow was touched.
- The lease is adapted into PR #154's atomic transaction; PR #138 was used only as a reference and was not merged or cherry-picked.
- Keep PR #154 draft pending fresh exact-head CI and independent review.
