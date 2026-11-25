# SCS Platform — Current State

**Updated:** 25 November 2026  
**Repository:** `nabeel2323/scs-platform`

## Git and CI

| Item | Verified value |
|---|---|
| `develop` parent SHA | `fde20420bbb759d2e562f9ff747c9e824ac58e25` |
| Latest develop CI at parent | Run #1509 — SUCCESS |
| `main` SHA | `d3f4aefc41b37ad82f0aeb2eb78121342455eb21` |
| Current work branch | `fix/outbox-placeholder-dispatch-safety-2026-11-25` |
| Work branch base | `fde20420bbb759d2e562f9ff747c9e824ac58e25` |

PR #147, #152 and #142 are merged into develop. PR #138 remains open/draft/unmerged and must not be merged wholesale. PR #143 and several focused UX/security changes remain independently reviewable drafts.

## Staging/runtime evidence

The latest recorded Render startup diagnostic reports API database identity `session_user=postgres`, `current_user=postgres`, with `BYPASSRLS=true`, `CREATEROLE=true`, `CREATEDB=true`, and PostgreSQL TLS reported false. This is a highly privileged API identity; enabling RLS without first moving the API to a dedicated non-owner, non-BYPASSRLS role would not provide the intended isolation.

The staging service was recorded as one Frankfurt API instance on `develop`, auto-deploy disabled, with production start command `pnpm --filter @scs/api start:prod`. Migrations/RBAC seed are handled by the separate release workflow, not the API startup command. These are recorded observations, not permission to change the service.

The latest recorded startup logs show in-process OutboxDispatcher, AutoCompleteWorker, ShippingCarrierWorker, CarrierTrackingPoller, CarrierReconciliationService and P13MonitorService registrations. ReturnExpirationWorker was disabled because `P13_WORKER_ENABLED` was unset. No separate Render worker/cron service was found in the inspected workspace.

## Current outbox status

- PR #147 gives `shipping.carrier.*` events one authoritative consumer: `ShippingCarrierWorker`.
- The generic outbox provider had only logged non-carrier events and marked them `DISPATCHED` without a real publisher.
- The current branch removes that false-success poller while preserving transactional outbox writes as `PENDING`.
- Generic event delivery remains **NOT IMPLEMENTED** and must not be reported as delivered.

## Evidence limits

- CI #1509 verifies the parent develop SHA only, not the current work branch.
- The current focused test is authored but not yet executed.
- No deployment or staging runtime verification of the current branch has occurred.
- No staging database or Render configuration changes were made by this work.
