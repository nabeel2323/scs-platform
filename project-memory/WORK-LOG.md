# SCS Platform — Work Log

## 25 November 2026 — outbox placeholder-dispatch safety and ownership audit

- Verified repository `nabeel2323/scs-platform`, `develop` baseline `fde20420bbb759d2e562f9ff747c9e824ac58e25`, and successful CI run #1509 on that exact baseline.
- Confirmed PR #147 is merged and carrier events are excluded from the generic outbox query. Confirmed PR #152 OTP log redaction and PR #142 runtime DB identity diagnostics are merged.
- Read the remediation branch's project-memory handoff, decisions, roadmap, open issues, release/CI status, implementation gap register, product inventory, and relevant staging/RLS audit design.
- Identified that the generic outbox poller had no delivery adapter: it only logged non-carrier events and then marked them `DISPATCHED`.
- Created clean branch `fix/outbox-placeholder-dispatch-safety-2026-11-25` from the verified develop baseline.
- Changed OutboxDispatcher to remain a transactional outbox writer only. Automatic generic polling is disabled until a real delivery adapter exists; new events remain `PENDING`.
- Added regression coverage for disabled placeholder polling and pending-event insertion.
- Scanned producer call sites in orders, returns, payments, reviews/disputes, inventory, merchant/store membership, catalog and shipping. Documented event families and the lack of generic consumer wiring in `OUTBOX-EVENT-OWNERSHIP-INVENTORY.md`.
- Found a second false-acknowledgement edge: ShippingCarrierWorker warned on unknown `shipping.carrier.*` types and then marked them `DISPATCHED`. Changed the default branch to throw `UnsupportedCarrierOperationError`, which the existing retry policy classifies as terminal/unsupported and sends to `DEAD_LETTER`.
- Added a focused worker regression spec proving an unknown carrier-prefixed event is dead-lettered, not acknowledged.
- Updated the outbox safety report and this project-memory handoff to include the ownership scan and unsupported-event behavior.
- Tests are authored but not executed. The branch's prior commit used `[skip ci]`; parent CI is not evidence for the branch. Run focused Vitest specs and consolidated CI before merge.
- No database, migration, grant, RLS, Render setting, secret, worker activation, staging write, deployment, restart, provider call or business workflow was performed.

### Next

1. Complete a repository-wide producer scan and reconcile event names/payloads against staging event rows without exposing customer data.
2. Design and implement a real generic publisher only after event ownership, payload contracts, tenant/recipient resolution and acknowledgement semantics are approved in code review.
3. Add PostgreSQL durable-claim, idempotency, duplicate-worker, crash-after-delivery-before-ack and retry/dead-letter tests.
4. Review AutoCompleteWorker and order-completion transaction/realtime side-effect boundaries.
5. Continue G-002 with dedicated API role/TLS and transaction-local tenant context design; do not activate RLS until all role/context/ownership/rollback gates pass.
