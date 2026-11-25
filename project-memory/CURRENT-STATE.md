# SCS Platform — Current State

**Updated:** 25 November 2026  
**Repository:** `nabeel2323/scs-platform`

## Git and CI

| Item | Verified value |
|---|---|
| `develop` baseline | `fde20420bbb759d2e562f9ff747c9e824ac58e25` |
| Latest develop CI at baseline | Run #1509 — SUCCESS |
| `main` | `d3f4aefc41b37ad82f0aeb2eb78121342455eb21` at last inspected check |
| PR #153 | OPEN / DRAFT; head `5294698d8db78e21df972e8ce6213f21237789fa`; CI #1523 SUCCESS |
| PR #154 | OPEN / DRAFT; latest branch head is the lock-fixture correction; CI #1525 FAILED on its preceding head |

PR #147, #152 and #142 are merged into develop. PR #138 remains open/draft/unmerged and must not be merged wholesale.

## PR #153 — outbox safety

- Generic log-only polling/acknowledgement is disabled; non-carrier events remain PENDING until a real delivery adapter exists.
- Unknown `shipping.carrier.*` event types follow the terminal dead-letter path.
- CI #1523 passed on exact head `5294698d8db78e21df972e8ce6213f21237789fa`.
- Vercel preview checks are blocked by provider build-rate-limit quota, not application test failures.
- Independent review is still required. Generic non-carrier event delivery remains NOT IMPLEMENTED.

## PR #154 — order completion atomicity

- Order state, shipment completion, shipment event, order status history, `order.completed` outbox event, buyer-confirmation timestamp (for buyer-confirmation source), and master-order recalculation/outbox are in one transaction.
- Realtime `order:updated` is emitted only after commit.
- AutoCompleteWorker persists a five-minute owner/timestamp lease using an atomic CTE claim (`FOR UPDATE SKIP LOCKED` + `UPDATE`); it does not mutate `orders.updated_at`.
- `completeOrder()` requires the lease owner for `AUTO_COMPLETION`, checks matching owner plus unexpired lease in the same transaction as the status transition, and clears lease fields atomically. Buyer confirmation also clears claims while competing through the status guard.
- Migration `0071_auto_complete_claim_leases.sql` adds two nullable columns and a partial claimability index; it is separate from the pending `0070` function `search_path` hardening migration.
- Master-order row is locked before reading its current status, preventing stale pre-lock status snapshots in concurrent sub-order completion flows.
- CI #1524 passed on earlier head `40e7d6891b625e524d1ddd0354fedfa91dd1c8f1`; it does not validate later changes.
- CI #1525 on head `fb68724bcc67ecfc02c1a92edeff41bc1a697954` failed: 23 tests across `orders.integration.spec.ts` and `stock-settlement.integration.spec.ts` failed because mock transaction objects lacked `execute()`. Both fixture files were corrected to provide `execute: vi.fn().mockResolvedValue({ rows: [] })`.
- Corrected fixture commit head must receive a fresh exact-head full CI run. Do not claim the new head is green until run results are available.
- Vercel preview checks are blocked by provider build-rate-limit quota.

## Other open PR portfolio

- #150 is the preferred notification delivery implementation candidate; #146 overlaps it and its tests failed due to an incorrect nested DB mock.
- #144 and #139 overlap in merchant-offer tenant authorization; reconcile the full changed-file scope before merging either.
- #145 migration 0070 conflicts by number with a different migration 0070 on #138.
- #151/#150/#149/#148/#145/#144/#143 are stale relative to develop and require rebase/refresh and fresh CI.
- #138 is thousands of commits ahead and overlaps multiple bounded PRs; use only as source for individually reviewed work.
- #143 remediation docs need refresh against current evidence.

## Main/develop divergence

Last comparison: develop has 11 commits not in main; main has 4 commits not in develop. Do not merge feature branches directly into main as a shortcut. Plan the integration after bounded PRs are reviewed and merged into develop.

## Staging/runtime evidence

The latest recorded Render startup diagnostic reports API database identity `session_user=postgres`, `current_user=postgres`, with `BYPASSRLS=true`, `CREATEROLE=true`, `CREATEDB=true`, and PostgreSQL TLS reported false. This is a highly privileged API identity; enabling RLS without first moving the API to a dedicated non-owner, non-BYPASSRLS role would not provide the intended isolation.

The staging service was recorded as one Frankfurt API instance on `develop`, auto-deploy disabled, with production start command `pnpm --filter @scs/api start:prod`. Migrations/RBAC seed are handled by the separate release workflow, not the API startup command. These are recorded observations, not permission to change the service.

The latest recorded startup logs show in-process OutboxDispatcher, AutoCompleteWorker, ShippingCarrierWorker, CarrierTrackingPoller, CarrierReconciliationService and P13MonitorService registrations. ReturnExpirationWorker was disabled because `P13_WORKER_ENABLED` was unset. No separate Render worker/cron service was found in the inspected workspace.

## Safety and evidence limits

- No production database has been provisioned or deployed.
- No staging database writes, migrations, grants/RLS/default ACL changes, Render configuration changes, worker activation, deployment, restart, or business workflow were performed in this work.
- Do not merge PR #138 wholesale.
- Do not treat skipped CI jobs as passing.
- Do not mark outbox events DISPATCHED without confirmed downstream delivery.
- Durable outbox claims require lease/ownership semantics; `FOR UPDATE SKIP LOCKED` alone is not a durable lease.
- `ShippingCarrierWorker` remains the sole identified consumer of `shipping.carrier.*`.
