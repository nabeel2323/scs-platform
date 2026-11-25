# SCS Platform — Work Log

## 25 November 2026 — outbox safety and order completion atomicity

- Verified repository `nabeel2323/scs-platform`, `develop` baseline `fde20420bbb759d2e562f9ff747c9e824ac58e25`, and successful CI run #1509 on that exact baseline.
- Confirmed PR #147 is merged and carrier events are excluded from the generic outbox query. Confirmed PR #152 OTP log redaction and PR #142 runtime DB identity diagnostics are merged.
- Read the remediation branch's project-memory handoff, decisions, roadmap, open issues, release/CI status, implementation gap register, product inventory, and relevant staging/RLS audit design.
- PR #153: disabled the generic log-only outbox poller while retaining transactional writes as `PENDING`; added tests, event ownership inventory and project-memory handoff.
- PR #153: fixed unknown `shipping.carrier.*` event acknowledgement. Unsupported event types now use `UnsupportedCarrierOperationError` and the existing terminal dead-letter path.
- PR #153 exact head `5294698d8db78e21df972e8ce6213f21237789fa`: CI run #1523 passed. Vercel previews are blocked by provider build-rate-limit quota. PR remains draft pending independent review.
- PR #154: made `OrdersService.completeOrder()` transactional across order state, shipment timestamp/event, status history, order outbox event and master-order recalculation/outbox. Realtime emission occurs only after commit.
- PR #154: changed AutoCompleteWorker candidate selection from a no-op `UPDATE updated_at` to a read-only `SELECT ... FOR UPDATE SKIP LOCKED`; documented that optimistic order status transition is the final concurrency guard, not a durable worker lease.
- PR #154: moved buyer `buyerConfirmedAt` into the same transaction as the guarded DELIVERED → COMPLETED status update for buyer confirmation; added rollback regression coverage.
- PR #154: fixed master-order lock ordering. The master row is now locked before reading current status, so concurrent sub-order completion does not compare against a stale pre-lock snapshot.
- CI #1524 passed on previous PR #154 head `40e7d6891b625e524d1ddd0354fedfa91dd1c8f1`; this is not evidence for subsequent commits.
- CI #1525 on `fb68724bcc67ecfc02c1a92edeff41bc1a697954` failed in unit/coverage and integration jobs. The 23 failures were all caused by transaction mocks in `orders.integration.spec.ts` and `stock-settlement.integration.spec.ts` lacking the `execute()` method now used by the master-row lock. Other mandatory jobs passed: lint/typecheck, mobile, web/admin, migration full apply and boundary lint. Contract/codegen, build and container jobs were skipped because the unit/integration prerequisites failed.
- Corrected both integration fixtures by adding `execute: vi.fn().mockResolvedValue({ rows: [] })`. Commits: `3653a3113d7567e4b3b20d4f9bb4dabe39c7af6a` and `5411e2c8363041b4c3c066226a50f9a62ec38773`. This corrects the test harness contract without weakening production locking.
- A fresh full CI run is required on the corrected branch head. Do not count run #1524 or #1525 as validating the corrected head.
- Full open PR audit: #151/#150/#149/#148/#146/#145/#144/#143/#139/#138 remain open drafts. #150/#146 overlap; #144/#139 overlap; #145 migration 0070 conflicts with a different #138 migration 0070. #138 is thousands of commits ahead and must never be merged wholesale.
- Main/develop diverged at last comparison: 11 commits unique to develop, 4 unique to main. Plan reconciliation after bounded PRs.
- No database, migration, grant, RLS, Render setting, secret, worker activation, staging write, deployment, restart, provider call or business workflow was performed.

### Durable auto-completion lease follow-up

- Rechecked PR #154 head `a392c86e41bb8d777279010a57b98a76e02419af`, `develop` `fde20420bbb759d2e562f9ff747c9e824ac58e25`, and migration sequence (latest committed migration `0069`; PR #145 separately proposes `0070`).
- Adapted lease mechanics from PR #138 without merging/cherry-picking it: atomic CTE claim, five-minute expiry, unique worker owner, owner-fenced completion inside PR #154's transaction, and owner-conditional release.
- Added migration `0071_auto_complete_claim_leases.sql` with two nullable columns and a partial index; no grants, RLS, roles, default ACL or database operation is included.
- Updated worker/service/schema, completion regression specs, remediation note and project-memory handoff. Exact commit/head and CI evidence will be appended after push and CI completion.
- `DatabaseService` on PR #154 does not expose PR #138's `withActorContext` helper; it was not copied or referenced, avoiding an unsupported API.



- CI run #1530 on head `97cf7b1fb7f8da59ecae0e991e6f2a4ff4c3b5cf` exposed two actionable test failures: the lease-fencing unit mock evaluated its `returning()` result before `.set()` populated the update list, and the PostgreSQL idempotency test invoked AUTO_COMPLETION without first establishing the worker lease. The worker unit specs passed; migration full apply, lint/typecheck, mobile, web/admin and boundary lint passed. Build/container/contract and k6/staging jobs were skipped because API test prerequisites failed.
- Corrected the unit mock to evaluate the affected update count when `returning()` executes. Updated the PostgreSQL idempotency fixture to persist a unique worker claim before automatic completion and to pass a worker owner in the post-buyer-confirmation negative case. Fix commit: `1554ea8b6a67aef1a5ba40e5fe2045d715b7e190`.
- Run #1530 is not green and does not validate the test corrections. A new exact-head CI run is required; keep PR #154 draft.

### Next

1. Run full exact-head CI for the durable-lease update to PR #154 and inspect every failed job rather than relying only on the run conclusion.
2. Obtain independent review for #153 and #154. Merge #153 into develop first only after review/required approvals; then rebase/revalidate #154 against updated develop.
3. Consolidate #150/#146 and #144/#139 after complete diff/scope review.
4. Reconcile the migration-number collision between #145 and #138.
5. Rebase stale branches #151/#150/#149/#148/#145/#144/#143 and rerun CI.
6. Keep #138 as a source of individually reviewed changes only.
7. Complete repository-wide outbox producer/persisted-event reconciliation before designing generic delivery.
8. Continue G-002 dedicated API role/TLS and transaction-local tenant context design only under recorded security gates.

### Exact-head CI and buyer-confirmation race follow-up — 25 November 2026

- CI run #1533 passed on exact PR #154 head `d496b0616c9a0cdde2bd891ca47167d9b9dfbabc`. Successful substantive jobs: mobile analysis/tests, lint/typecheck/format, web/admin tests, boundary lint, migration full apply, API unit/coverage, API integration, build, container build/smoke, and contract/codegen. k6 smoke and staging release were skipped; Vercel previews remain blocked by provider daily build-rate limit.
- Independent code review after CI identified a buyer-confirmation race: auto-completion could win after the endpoint's initial DELIVERED read, causing the buyer request to receive ConflictException rather than the documented idempotent success.
- Updated `confirmDelivery()` to re-read the order after a completion conflict and return the completed order with items only when the competing transition has reached COMPLETED; all other conflicts still propagate.
- Added a regression test for the competing auto-completion winner. Commits: `978a7b978e32e77b0a9b1752da60a7066f427fab` (service) and `9efc30a7a3c0f841890a1d0bae839590cf58f8f3` (test). Latest head requires a fresh exact-head CI run; #1533 does not validate these later commits.
- PR #154 remains open/draft. No independent review submission/inline review thread is recorded. No merge, database operation, migration, Render change, worker activation, deployment, restart or business workflow was performed.

### 25 November 2026 — staging audit and HTTP logging exposure

- Completed a read-only staging security/deployment audit; full evidence and a table-classification/policy design are recorded in PR #155: `docs/remediation/STAGING-SECURITY-READONLY-AUDIT-2026-11-25.md`.
- Confirmed 114 public table relations have RLS disabled and are owned by postgres; API runtime identity is postgres with BYPASSRLS/CREATEROLE/CREATEDB and ssl=false. Existing anon/authenticated/service_role grants include TRUNCATE/REFERENCES/TRIGGER/MAINTAIN but no CRUD. Migration ledger ends at 0069.
- Confirmed PR #152 OTP-provider log redaction is deployed; current retained OTP-related logs contain no six-digit OTP values.
- Found a separate pino-http leak: response `Set-Cookie` headers containing the `scs_device_trust` credential were recorded in four retained logs. Carrier webhook URL tokens and signature headers were also unredacted. Five active device-trust credentials issued before the latest deployment exist across two users; none is hard-expired. No credential was revoked.
- Created PR #156 with response-cookie/header/path redaction and a Pino-output regression test. It remains draft pending exact-head CI and independent security review.
- Updated PR #153, #154 and #145 descriptions with read-only runtime evidence. PR #154 exact-head CI #1537 passed; k6 and staging release were skipped.
- No database writes, migrations, grants, RLS/role changes, Render changes, worker activation, deployment, restart, credential rotation, or business workflow was performed.


### 25 November 2026 — PostgreSQL auto-completion concurrency verification source

- Added two PostgreSQL-backed worker-lease tests to PR #154: concurrent claims across two worker instances produce one owner; an expired claim is reclaimed, the stale owner cannot complete, and the replacement owner can complete with lease fields cleared.
- Commit: `b535140b3d88711457aedd204594c2ba7e56d3a9` (`[skip ci]`). Tests remain authored but unexecuted; CI #1548 passed only on the preceding source head `cd1735c0cad7c36f6f6096cec6b719844c09b0d5` and does not validate this change.
- PR #154 remains draft pending one consolidated exact-head CI run and independent review. No staging/database/worker/deployment action occurred.

### 25 November 2026 — consolidated CI and PR #138 handling rules

- Avoid CI after each small change. Group implementation and tests, use targeted/local checks where available, and run one full CI per meaningful integration batch.
- PR #138 current head `16846152af71524f29047b704159f52ab0d73e75` has 1,927 changed files including 1,277 `.m73b6-scratch` files; it remains draft/unmerged and is not safe to merge wholesale. The preservation ref is 22 commits behind current PR head; reconcile before extraction.
- PR #153/#154/#155/#156 remain draft and require independent review. PR #152 is merged.
- main/develop divergence remains 11 develop-only and 4 main-only commits; do not promote until reconciled.
