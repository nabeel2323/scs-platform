# SCS Platform — Current State

**Updated:** 25 November 2026  
**Repository:** `nabeel2323/scs-platform`

## Git and CI

| Item | Verified value |
|---|---|
| `develop` | `fde20420bbb759d2e562f9ff747c9e824ac58e25` |
| `main` | `d3f4aefc41b37ad82f0aeb2eb78121342455eb21` |
| Divergence | develop has 11 unique commits; main has 4 unique commits |
| Develop baseline CI | Run #1509 — SUCCESS |

## Focused implementation PRs

| PR | Exact head | Exact-head CI | State |
|---|---|---|---|
| #153 — outbox safety | `5294698d8db78e21df972e8ce6213f21237789fa` | #1523 SUCCESS | Open / draft; independent review outstanding |
| #154 — atomic completion | `a392c86e41bb8d777279010a57b98a76e02419af` | #1527 SUCCESS | Open / draft; independent review outstanding |
| #150 — truthful notifications | `ad057b638e8dac7904d3d97036e22ce1c185537a` | #1528 SUCCESS | Open / draft; independent review outstanding |

All 10 substantive jobs passed on each listed exact head. k6 smoke and staging-release jobs were skipped, not passed. Vercel preview failures/skips were caused by the provider's daily deployment quota and are separate from GitHub Actions results.

PR #153 and #154 share project-memory files but have no application-code file overlap. Recommended integration order remains #153 first, then rebase and revalidate #154. PR #146 was closed as superseded by #150; it was not merged.

## Implementation details

### PR #153 — outbox safety
- Generic log-only polling is disabled; OutboxDispatcher remains a transactional outbox writer.
- New non-carrier events remain `PENDING` until a real delivery adapter acknowledges delivery.
- `ShippingCarrierWorker` remains the sole identified consumer of `shipping.carrier.*`.
- Unknown carrier-prefixed events follow the terminal unsupported/dead-letter path.
- Generic non-carrier delivery is **NOT IMPLEMENTED**. The producer inventory is source-based; persisted event history and complete helper/dynamic-SQL reconciliation remain outstanding.

### PR #154 — order completion
- Order status, shipment completion timestamp/event, order status history, `order.completed` outbox write, buyer-confirmation timestamp (for buyer-confirmation source), and master-order recalculation/outbox are committed in one transaction.
- Realtime `order:updated` is emitted only after commit; master-order row locking occurs before reading its status.
- AutoCompleteWorker candidate selection no longer mutates `orders.updated_at`. The guarded status transition is authoritative; this is **not** a durable worker lease.
- Unit/integration transaction tests use mocks; CI is exact-head evidence, not runtime concurrency verification.

### PR #150 — notifications
- Unconfigured SMS/WhatsApp/FCM providers fail truthfully rather than reporting synthetic delivery.
- Missing push token is persisted as FAILED; configured-token/unconfigured-FCM regression is covered.
- IN_APP persistence/realtime remains separate; no provider credentials or calls were configured.

## Other open PRs

- #144 merchant-offer authorization: 29 ahead / 3 behind current develop; overlaps #139 in three files and adds service-level authorization.
- #139 merchant-offer tenant scope: 40 ahead / 4 behind; mergeable=false and contains broader unique remediation files. Reconcile scope; do not merge both blindly.
- #145 pins `normalize_arabic` search_path in migration 0070. #138 has a different 0070 containing broad anon/authenticated grants and default-ACL changes. Do not merge #138 wholesale or apply its migration without role/default-ACL review.
- #138 remains open/draft/unmerged, thousands of commits ahead and overlaps multiple bounded PRs. Extract only individually reviewed work.
- #151/#148/#149/#143 and #145/#144 need base refresh and exact-head CI before integration.

## Staging/runtime and safety

The latest recorded Render startup diagnostic reports API identity `session_user=postgres`, `current_user=postgres`, `BYPASSRLS=true`, `CREATEROLE=true`, `CREATEDB=true`, and PostgreSQL TLS reported false. Do not enable RLS under this identity. A dedicated non-owner/non-BYPASSRLS API role, ownership/default-ACL reconciliation, transaction-local tenant context and reviewed migration/rollback plan are prerequisites.

- No production database has been provisioned or deployed.
- No staging DB writes, migrations, grants/RLS/default-ACL changes, Render changes, worker activation, deployment, restart or business workflow were performed in this continuation.
- Never mark outbox events `DISPATCHED` without acknowledged downstream delivery.
- Durable claims require lease/ownership semantics; `FOR UPDATE SKIP LOCKED` alone is not a durable lease.
