# SCS Platform — Work Log

## 25 November 2026 — outbox placeholder-dispatch safety and ownership audit

- Verified repository `nabeel2323/scs-platform`, `develop` baseline `fde20420bbb759d2e562f9ff747c9e824ac58e25`, and successful CI run #1509 on that exact baseline.
- Confirmed PR #147 is merged and carrier events are excluded from the generic outbox query. Confirmed PR #152 OTP log redaction and PR #142 runtime DB identity diagnostics are merged.
- Read the remediation branch's project-memory handoff, decisions, roadmap, open issues, release/CI status, implementation gap register, product inventory, and relevant staging/RLS audit design.
- Identified that the generic outbox poller had no delivery adapter: it only logged non-carrier events and then marked them `DISPATCHED`.
- Created clean branch `fix/outbox-placeholder-dispatch-safety-2026-11-25` from the verified develop baseline.
- Changed OutboxDispatcher to remain a transactional outbox writer only. Automatic generic polling is disabled until a real delivery adapter exists; new events remain `PENDING`.
- Added regression coverage for disabled placeholder polling and pending-event insertion.
- Inspected producer call sites in OrdersService, ReturnsService, CommissionReversalService, SettlementAdjustmentService, PaymentsService, ReviewsService, DisputesService, InventoryService, MerchantService, StoreMembershipService and CatalogService, including direct `outbox_events` inserts. Documented observed event names and lack of generic consumer wiring. Persisted outbox rows and any other helper/dynamic-SQL insertion paths remain unverified.
- Found a second false-acknowledgement edge: ShippingCarrierWorker warned on unknown `shipping.carrier.*` types and then marked them `DISPATCHED`. Changed the default branch to throw `UnsupportedCarrierOperationError`, which the existing retry policy classifies as terminal/unsupported and sends to `DEAD_LETTER`.
- Added a focused worker regression spec proving an unknown carrier-prefixed event is dead-lettered, not acknowledged.
- Updated the outbox safety report and this project-memory handoff to include the ownership scan and unsupported-event behavior.
- Tests are authored but not executed. The branch's prior commit used `[skip ci]`; parent CI is not evidence for the branch. Run focused Vitest specs and consolidated CI before merge.
- No database, migration, grant, RLS, Render setting, secret, worker activation, staging write, deployment, restart, provider call or business workflow was performed.

### Next

1. Reconcile remaining repository helper/dynamic-SQL producer paths and event names/payloads against persisted event history only through an authorized, read-only process; do not expose customer data.
2. Design and implement a real generic publisher only after event ownership, payload contracts, tenant/recipient resolution and acknowledgement semantics are approved in code review.
3. Add PostgreSQL durable-claim, idempotency, duplicate-worker, crash-after-delivery-before-ack and retry/dead-letter tests.
4. Review AutoCompleteWorker and order-completion transaction/realtime side-effect boundaries.
5. Continue G-002 with dedicated API role/TLS and transaction-local tenant context design; do not activate RLS until all role/context/ownership/rollback gates pass.


## 25 November 2026 — open pull-request portfolio review

Refreshed all open PRs in `nabeel2323/scs-platform`, not only the two current remediation slices. All remain drafts and have no independent review submissions/threads recorded at this check.

| PR | Current assessment | Required next step |
|---|---|---|
| #154 order completion atomicity | Open draft; current head `32677613`; no Actions run on exact head; Vercel daily deployment quota failures. Buyer-confirmation timestamp was moved into the completion transaction with a rollback regression spec. | Execute focused tests and consolidated CI; reconcile against PR #138's durable auto-complete lease implementation before any combined remediation integration. |
| #153 outbox dispatch safety | Open draft; current head follows the source-inventory expansion; no Actions run on exact head; Vercel quota failures. | Execute focused tests and consolidated CI; preserve the no-false-ack behavior when reconciling with PR #138. |
| #151 country/currency selectors | Open draft; CI run #44715048598 succeeded; 22 commits ahead / 3 behind develop; Vercel quota failures. | Rebase/update to current develop, re-run CI and review cross-platform currency precision and mobile model overlap with #138. |
| #150 truthful notification delivery | Open draft; CI run #44715420748 succeeded; 4 ahead / 3 behind; touches same notification service as #146. | Prefer this newer, passing implementation as the consolidation candidate; review together with #146 before merge. |
| #149 mixed-currency checkout display | Open draft; CI run #44708820666 succeeded; 1 ahead / 3 behind. | Rebase/update and re-run CI; then review checkout regression tests. |
| #148 reject unsupported digital payment | Open draft; CI run #44708682886 succeeded; 2 ahead / 3 behind. | Rebase/update and re-run CI; review with current payment behavior before merge. |
| #146 truthful notification states | Open draft; CI run #44708460818 failed in unit/coverage: two tests fail because their mock wraps the Drizzle DB at the wrong level (`this.db.db.select is not a function`). Other listed jobs passed; contract/build/container/k6/release jobs were skipped. | Do not merge separately from #150. Fix or supersede its test fixture; #150 changes the same service and has passing CI. |
| #145 normalize_arabic search_path | Open draft; CI run #44708242986 succeeded; 2 ahead / 3 behind. Its migration is numbered 0070, which collides with PR #138's different 0070 migration. | Do not merge as-is; reconcile migration numbering/content with the G-002 migration plan. |
| #144 merchant offer tenant authorization | Open draft; CI run #44708168461 succeeded; 29 ahead / 3 behind; includes read and write service authorization. | Rebase/update and review. It overlaps/diverges from #139; consolidate the authorization changes rather than merging both blindly. |
| #143 remediation tracker docs | Open draft; CI run #44659481564 succeeded; 2 ahead / 3 behind; docs-only and reflects 20 November evidence. | Refresh against current 25 November evidence before merge. |
| #139 merchant offer tenant read scope | Open draft; CI run #44641375950 succeeded, but GitHub reports mergeable=false; 40 ahead / 4 behind; overlaps #144 and contains broader remediation/workflow files. | Do not merge until conflict and scope overlap are resolved; use focused #144 as the likely implementation consolidation base, after diff review. |
| #138 Phase 0–1 tenant remediation | Open draft; GitHub reports mergeable=false; 2,720 commits ahead / 3 behind at the check; no exact-head Actions run. | Never merge wholesale. It contains conflicting/overlapping migrations and older outbox/auto-complete worker code that would undo or conflict with #153/#154. Split into bounded reviewed PRs. |

Merged PRs confirmed: #147 carrier outbox ownership, #152 OTP log redaction, #142 runtime DB identity diagnostics, and #140 read-only DB audit entry point. No PR was merged or closed during this review. No deployment, staging DB write, migration, worker activation or release workflow was run.

The #153/#154 branches are based on develop `fde20420bbb759d2e562f9ff747c9e824ac58e25` and are 0 behind that baseline; do not confuse GitHub's mergeable flag with test/CI readiness. The other older branches are behind current develop and need an update/revalidation campaign before merge.
