# SCS Platform — Current State

**Updated:** 25 November 2026  
**Repository:** `nabeel2323/scs-platform`

## Git and CI

| Item | Verified value |
|---|---|
| `develop` baseline | `fde20420bbb759d2e562f9ff747c9e824ac58e25` |
| Latest develop CI at baseline | Run #1509 — SUCCESS |
| `main` | `d3f4aefc41b37ad82f0aeb2eb78121342455eb21` at last inspected check |
| Work branch | `fix/outbox-placeholder-dispatch-safety-2026-11-25` |
| PR | #153 — OPEN / DRAFT; see live PR head for latest inventory follow-up |
| PR head before latest continuation | `aa5c2c3ff6054b52c3e94c8ff27779cc3693bf7d` |

PR #147, #152 and #142 are merged into develop. PR #138 remains open/draft/unmerged and must not be merged wholesale.

## Staging/runtime evidence

The latest recorded Render startup diagnostic reports API database identity `session_user=postgres`, `current_user=postgres`, with `BYPASSRLS=true`, `CREATEROLE=true`, `CREATEDB=true`, and PostgreSQL TLS reported false. This is a highly privileged API identity; enabling RLS without first moving the API to a dedicated non-owner, non-BYPASSRLS role would not provide the intended isolation.

The staging service was recorded as one Frankfurt API instance on `develop`, auto-deploy disabled, with production start command `pnpm --filter @scs/api start:prod`. Migrations/RBAC seed are handled by the separate release workflow, not the API startup command. These are recorded observations, not permission to change the service.

The latest recorded startup logs show in-process OutboxDispatcher, AutoCompleteWorker, ShippingCarrierWorker, CarrierTrackingPoller, CarrierReconciliationService and P13MonitorService registrations. ReturnExpirationWorker was disabled because `P13_WORKER_ENABLED` was unset. No separate Render worker/cron service was found in the inspected workspace.

## Current outbox status

- PR #147 gives `shipping.carrier.*` events one authoritative consumer: `ShippingCarrierWorker`.
- The generic outbox provider had only logged non-carrier events and marked them `DISPATCHED` without a real publisher. PR #153 disables that placeholder poller; newly published non-carrier events remain `PENDING`.
- The bounded producer scan explicitly inspected OrdersService, ReturnsService, PaymentsService, ReviewsService, InventoryService, MerchantService, StoreMembershipService and CatalogService, including direct outbox inserts. It records order/shipment, return, payment, review, inventory, merchant, store-membership and catalog event families with no generic outbox consumer found. Commission/settlement/dispute paths and persisted event history remain unverified; see [event ownership inventory](../docs/remediation/OUTBOX-EVENT-OWNERSHIP-INVENTORY.md).
- Unknown event types inside the `shipping.carrier.*` prefix previously fell through the worker switch and were marked `DISPATCHED`. PR #153's follow-up now classifies them as unsupported and routes them to the existing dead-letter path.
- Generic event delivery remains **NOT IMPLEMENTED**. The inventory is a source scan, not yet a complete reconciliation against every repository producer and persisted database event.

## Evidence limits

- CI #1509 verifies the develop baseline only, not PR #153.
- The outbox regression specs are authored but not yet executed in the current environment.
- PR #153 is still a draft and has not been merged.
- No deployment or staging runtime verification of the current branch has occurred.
- No staging database or Render configuration changes were made by this work.
