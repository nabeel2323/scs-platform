# SCS Platform — Current State

**Updated:** 25 November 2026  
**Repository:** `nabeel2323/scs-platform`

## Git and CI

| Item | Verified value |
|---|---|
| `develop` baseline | `fde20420bbb759d2e562f9ff747c9e824ac58e25` |
| Latest develop CI at baseline | Run #1509 — SUCCESS |
| `main` | `d3f4aefc41b37ad82f0aeb2eb78121342455eb21` at last inspected check |
| PR #153 | OPEN / DRAFT; head `23a96506c835b604a6595f820aa34866172d40d6` at last check |
| PR #154 | New order-completion atomicity branch; head SHA to be verified after push |

PR #147, #152 and #142 are merged into develop. PR #138 remains open/draft/unmerged and must not be merged wholesale.

## Staging/runtime evidence

The latest recorded Render startup diagnostic reports API database identity `session_user=postgres`, `current_user=postgres`, with `BYPASSRLS=true`, `CREATEROLE=true`, `CREATEDB=true`, and PostgreSQL TLS reported false. This is a highly privileged API identity; enabling RLS without first moving the API to a dedicated non-owner, non-BYPASSRLS role would not provide the intended isolation.

The staging service was recorded as one Frankfurt API instance on `develop`, auto-deploy disabled, with production start command `pnpm --filter @scs/api start:prod`. Migrations/RBAC seed are handled by the separate release workflow, not the API startup command. These are recorded observations, not permission to change the service.

The latest recorded startup logs show in-process OutboxDispatcher, AutoCompleteWorker, ShippingCarrierWorker, CarrierTrackingPoller, CarrierReconciliationService and P13MonitorService registrations. ReturnExpirationWorker was disabled because `P13_WORKER_ENABLED` was unset. No separate Render worker/cron service was found in the inspected workspace.

## Current outbox status

- PR #147 gives `shipping.carrier.*` events one authoritative consumer: `ShippingCarrierWorker`.
- PR #153 disables the generic log-only poller; new non-carrier events remain `PENDING`.
- PR #153 also sends unknown carrier-prefixed events to the existing terminal dead-letter path.
- The producer scan identifies order, shipment, return, commission, settlement-adjustment, payment, review/dispute, inventory, merchant, store-membership and catalog event families with no generic outbox consumer found. See [event ownership inventory](../docs/remediation/OUTBOX-EVENT-OWNERSHIP-INVENTORY.md).
- Generic event delivery remains **NOT IMPLEMENTED**; the inventory is a source scan, not yet a complete reconciliation against all producers and persisted event rows.

## Order completion

PR #154 moves the order flip, shipment completion record, order status history, order outbox event and master-order aggregation/outbox into one transaction. Realtime emission occurs after commit. AutoCompleteWorker candidate selection no longer mutates `orders.updated_at`; optimistic status transition remains the authoritative cross-instance completion guard. See [order completion atomicity](../docs/remediation/ORDER-COMPLETION-ATOMICITY-2026-11-25.md).

## Evidence limits

- CI #1509 verifies the develop baseline only, not PR #153 or #154.
- Focused regression specs for the outbox and order completion changes are authored but not yet executed.
- PR #153 had Vercel web success and Vercel admin failure due to a reported build-rate-limit/plan response at the last check; GitHub Actions had no run for its `[skip ci]` commits.
- No deployment or staging runtime verification of either branch has occurred.
- No staging database or Render configuration changes were made by this work.
