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

## Latest verified continuation

- PR #154 latest branch head: `9efc30a7a3c0f841890a1d0bae839590cf58f8f3`.
- Previous exact-head CI #1533 passed on `d496b0616c9a0cdde2bd891ca47167d9b9dfbabc`; that green run predates the buyer-confirmation race fix and does not validate the current head.
- The buyer-confirmation race fix re-reads state after ConflictException and returns idempotent success only when the competing transition completed the order. Regression test added.
- Next: obtain and inspect full exact-head CI for `9efc30a7a3c0f841890a1d0bae839590cf58f8f3`; keep PR draft pending CI and independent review.
- PR #154 remains unmerged. No database/Render/deployment/worker action was taken.

## Current state — 25 November 2026

### GitHub
- Develop remains `fde20420bbb759d2e562f9ff747c9e824ac58e25`; latest live Render deployment is that SHA.
- PR #154 durable order-completion lease: latest head `68fb028f15d688a033c10d82b0343cbf35bdae68`; CI #1537 passed exact head (substantive jobs green; k6 and staging release skipped); draft, independent review outstanding.
- PR #153 outbox delivery safety: head `5294698d8db78e21df972e8ce6213f21237789fa`; CI #1523 passed exact head; draft, independent review outstanding.
- PR #155 read-only staging audit documentation: head `a311162e8fcbf0cc8f15c36cb023007892e57666`; CI #1542 in progress; draft.
- PR #156 HTTP log credential redaction: latest head `e158c505f8f4758cce4e825cf4ea2dae52051ba4`; CI #1541 pending/in progress; draft.
- PR #145 narrow normalize_arabic search_path migration 0070 remains pending; PR #138 has a conflicting broad 0070 and must not be merged wholesale.

### Staging read-only findings
- 114 public table relations (100 ordinary, one partitioned parent, 13 children); RLS enabled on zero. All 114 are owned by `postgres`.
- `anon`, `authenticated`, and `service_role` have no effective CRUD on these relations, but do have TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on all 114. Schema USAGE is granted; CREATE is not.
- Runtime API identity is `postgres` with BYPASSRLS, CREATEROLE, CREATEDB and `ssl=false`. Do not enable RLS before a dedicated non-owner runtime role and transaction-local actor context are implemented.
- Default ACLs for `postgres` grant the same non-CRUD privileges to those roles on future tables. `supabase_admin` has a broader platform default ACL; do not alter it without confirming object-creation paths.
- Custom migration ledger has 69 entries and ends at 0069. Migrations 0070 and 0071 are not applied.
- PR #152 OTP-provider log redaction is merged/deployed. Accessible OTP logs contain no six-digit values. A separate pino-http gap logs `res.headers["set-cookie"]`; four retained records contained the `scs_device_trust` cookie. Five active pre-deployment device-trust credentials exist across two users; none is hard-expired. No credential was revoked.
- Render has one API service and no separate worker service. OutboxDispatcher and AutoCompleteWorker are active in-process; ReturnExpirationWorker is disabled. One `merchant.store.created` event was falsely marked DISPATCHED by the log-only generic poller; no outbox rows were changed. No orders are currently due for auto-completion.
- Render production startup does not run migrations or seed; the separate staging release workflow does. Runtime DB diagnostic reports TLS false; confirm route/TLS before production.

### Safety
No staging SQL writes, grants, RLS changes, role changes, migrations, seeds, worker activation, Render configuration changes, deployment, restart, credential rotation, or business workflow was performed. See PR #155 for the full audit and PR #156 for the separate HTTP logging fix.
