## PR #157 P4 HTTP diagnostics — CI #1560 queued (26 November 2026)

- PR #157 advanced from `a0f32189b14700bad6701a4b948fd70c5755a0be` to `b2a1131017e6117118a68e33bfd7da26b37bbfd0` with a test-only diagnostic commit. P4 HTTP test harness logs only exception name/message for non-HTTP exceptions and HA-08 prints the RFC 7807 response body in its assertion message. No production behavior or security assertions were changed.
- CI run #1560 (`45778372173`) is QUEUED for exact head `b2a1131017e6117118a68e33bfd7da26b37bbfd0`; wait for exact-head result and do not duplicate the workflow.
- Run #1559 on `a0f32189b14700bad6701a4b948fd70c5755a0be` failed. Unit/Coverage: 4,344 passed, 22 failed, 110 skipped; all 22 failures were in P4 HTTP authorization spec. Integration: 1,615 passed, 17 failed across 82 files, with P4 HTTP authorization/returns/adjustment/pilot failures. Migration Full Apply, E6, lint/typecheck, Flutter and Web/Admin passed.
- The P4 root exception has not yet been established; use #1560 exception name/message and HA-08 response body to identify it before production-code changes. PostgreSQL logs from the integration job include FK failures for settlement adjustment sub_order_id values not present in orders, but these must be correlated to the exact failing spec/request before assigning cause.
- P6 concurrency/user-identifier fixtures are passing in #1559; don't make further P6 changes without new evidence.
- PR #138 remains protected; source and preservation refs synchronized at `56d486e01e54f21e2084a9af4b5487f2e3c99bd6` before this memory-only update. No broad merge or history rewrite.
- No shared database/staging mutation, migrations, grant/RLS change, worker activation, deployment or merge occurred.

---

## PR #157 CI #1559 — exact-head failure triage (26 November 2026)

- Exact head `a0f32189b14700bad6701a4b948fd70c5755a0be`; run #1559 (`45764646880`) completed FAILURE.
- Passed: Lint & Typecheck, Mobile Flutter analyze/test, Migration Full Apply and pg_partman verification, Boundary Lint (E6), Web/Admin App Tests. Failed: Unit/Coverage and Integration Tests. Build, contract/codegen, k6, container smoke and staging release were skipped.
- Unit/Coverage: 4,344 passed, 22 failed, 110 skipped; 220 files passed, 1 failed, 6 skipped. The 22 failures are all in `p4-http-authorization.postgres.spec.ts`, including HA-08, HA-12–HA-34; HTTP responses commonly returned 500. This is a concentrated P4 HTTP/PostgreSQL test failure, not a broad unit failure.
- Integration: 1,615 passed, 17 failed, 0 skipped (82 files). Failure summary includes P4 HTTP authorization, returns, adjustment creation/approval and pilot-gate expectations: empty result sets and unexpected 404/403/400/409/500 status codes. Adjustment creation expected 201 but returned 409 in the structured summary.
- PostgreSQL logs show `settlement_adjustments_sub_order_id_fkey` violations: fixture `sub_order_id` values were absent from `orders`; subsequent adjustment lookup attempted UUID `undefined`. This is the strongest current data-fixture lead, not yet a proven root cause. Source review shows `seedBusinessFixture()` inserts four orders before the per-test `seedFinancialFixture()`; trace row existence and variable values at that exact boundary and identify any deletion/cascade/lifecycle interaction. Also capture the actual response detail for the first unexpected 500/409 rather than relying only on status assertions.
- Do not weaken HTTP authorization/tenant-isolation assertions, skip the P4 suite, or restore silent migration-error swallowing. Dedicated migration full-apply is green but does not validate these application tests.
- Next: isolate P4 fixture lifecycle/foreign-key issue, repair actual cause in a grouped commit, then run one consolidated exact-head CI. P6 concurrency/user-identifier failures from earlier #1558 are no longer in this run's reported failures.
- PR #138 remains protected and unmerged. No database/staging writes, migrations, grant/RLS changes, worker activation, deployment or merge occurred.

---

## PR #157 follow-up — test fixture repair batch (26 November 2026)

- Integration branch advanced to exact head `a0f32189b14700bad6701a4b948fd70c5755a0be`; CI run `45764646880` is QUEUED for that exact head, result pending.
- Fixed P4 migration test harness to use one checked-out PostgreSQL client for each transaction and fail fast with migration filename/error; no silent migration skips.
- Fixed P6 concurrency fixtures to insert ACTIVE organization memberships so the test isolates store-membership activation/deactivation.
- Fixed P6 independent runtime users fixture to provide phone/email values satisfying database identifier constraint.
- These are test fixture/harness corrections, not a claim that production implementation is verified. Wait for exact-head CI and inspect any newly surfaced migration error.
- PR #138 remains OPEN/DRAFT/UNMERGED, dirty and preserved. Continue bounded integration; no wholesale merge.
- No shared DB/staging writes, schema migration, RLS/grant changes, worker activation, deployment or merge.

---

## CI checkpoint — PR #157 run #1558 failed (26 November 2026)

- Exact PR #157 head `0d97dd446d5912d6d0a815d8a931a88f53db009c`; CI run #1558 (`45729671946`) completed FAILURE.
- Passing jobs: Lint & Typecheck, Mobile Flutter analysis/tests, Web & Admin App Tests, Boundary Lint (E6), Migration Full Apply. Failing jobs: Unit Tests + Coverage Gates and Integration Tests. Build/contract/container/staging/k6 jobs were skipped.
- Unit/Coverage: 4,308 passed, 24 failed, 144 skipped; failures include P4 HTTP authorization paths returning 500, P6 concurrency expectations returning 0 instead of 25, and a P6 PostgreSQL user fixture violating `users_at_least_one_identifier`.
- Integration: 1,615 passed, 17 failed; concentrated in P4 HTTP authorization/financial/returns/pilot tests, with empty result sets, unexpected status codes, adjustment conflicts and malformed/missing UUID fixture references.
- Next: inspect the failing P4/P6 test setup and service error paths; repair the related fixtures/implementation as one batch. Do not rerun CI until the batch is complete. Do not treat the green migration job as a substitute for failing application tests.
- PR #138 remains the owner-priority source/evidence branch and must stay preserved. Its broad 1,943-file diff is not merge-ready; use bounded integration slices from refreshed develop. The implementation head preceding the memory-only updates was `e9fb552850f605fd412fc4aa35b812e945f3c702` and has no exact-head CI.
- No database/staging mutation, migration, grant/default-ACL/RLS change, worker activation, deployment or merge occurred.

---

## Owner-directed integration checkpoint — 26 November 2026 (live recheck)

- Live PR #138 source head before this documentation checkpoint: `e9fb552850f605fd412fc4aa35b812e945f3c702`; PR OPEN / DRAFT / UNMERGED, base `develop`, GitHub mergeable=false / dirty.
- Live develop head: `fde20420bbb759d2e562f9ff747c9e824ac58e25`; source compare is DIVERGED, 2,951 commits ahead / 3 behind, merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`. PR metadata reports 1,943 changed files.
- The preservation ref was at the same source head before this documentation-only update. Keep source and preservation synchronized with expected-SHA fast-forwards only.
- No exact-head Actions run was found for `e9fb552850f605fd412fc4aa35b812e945f3c702`; the latest source work remains NOT CI-VERIFIED. No merge is safe at this point.
- Owner priority is to integrate PR #138 remediation with develop without merging its broad branch diff. Use clean bounded integration branches, reconcile the 8 develop-only paths and 3 develop-only commits, retain the shared runtime identity helper/tests, compose DatabaseService, and reconcile #153/#154 before selecting outbox/order-worker code.
- PR #153 remains the canonical safe generic outbox behavior: no placeholder poller and no false delivery acknowledgement. Keep #138 worker actor-context as a boundary for a future real adapter.
- PR #154's atomic order completion and lease fencing should be composed with #138 worker actor-context, after the DatabaseService foundation is integrated. Its visible successful run #457007 was on an older SHA, not its current head.
- Migrations 0070–0075 remain a single ordered dependency block. Resolve the 0070/#145 collision and 0071/#154 overlap; no ad-hoc renumbering or application.
- CI policy: batch related source/test changes, run one consolidated exact-head CI campaign per meaningful integration slice, never bypass required checks.
- No database/staging writes, migration, RLS/grant/default-ACL change, worker activation, deployment, bootstrap/token issuance or release action occurred.

---

# PR #138 live reconciliation ledger — 26 November 2026

## Verified repository checkpoint

- PR #138: OPEN / DRAFT / UNMERGED; base `develop`; GitHub reports `mergeable=false`.
- Source branch: `remediation/phase-0-1-tenant-security`.
- Exact source head: `b72f8ceb8add10276ce81be19d5ee61bf3e1b90c`.
- `develop`: `fde20420bbb759d2e562f9ff747c9e824ac58e25`.
- Merge base: `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.
- Compare: source branch 2,784 commits ahead and 3 behind `develop`; compare reports divergence.
- PR diff metadata: 1,934 paths, 104,368 additions, 414,508 deletions.
- Changed-path inventory: 1,934 total; 1,280 scratch paths (1,277 under `.m73b6-scratch/` plus 3 under `apps/api/src/__tests__/scratch/`); 654 non-scratch paths.
- Preservation branch `preservation/pr138-remediation-2026-11-25` is currently identical to source head `b72f8ceb8add10276ce81be19d5ee61bf3e1b90c` (compare: identical, 0 ahead / 0 behind).
- Exact-head Actions lookup returned no workflow runs. Combined status only has Vercel Web/Admin build-rate-limit failures; these are not application CI. Source remains NOT CI-VERIFIED.
- No merge, deploy, database write, migration, grant/default-ACL/RLS change, worker activation or provider side effect occurred.

## Develop-only delta: mandatory reconciliation before extraction

Comparing merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775` to `develop` confirms 3 develop-only commits affecting these 8 paths:

| Path | Develop state | PR #138 state | Required disposition |
|---|---|---|---|
| `apps/api/src/common/database/runtime-database-identity.ts` | Added | Missing | Retain develop helper; adapt PR #138 DatabaseService to call it. |
| `apps/api/src/__tests__/unit/common/runtime-database-identity.spec.ts` | Added | Missing | Retain and run with consolidated database workstream. |
| `apps/api/src/__tests__/integration/runtime-database-identity.postgres.spec.ts` | Added | Missing | Retain; this is the real PostgreSQL login/effective-role diagnostic regression. |
| `apps/api/src/common/database/database.service.ts` | Modified | Modified differently | Manual three-way reconciliation required. PR #138 contains actor-context transaction primitive, secure-runtime checks and migration/operator work; develop imports the extracted identity helper. Do not overwrite either version. |
| `apps/api/src/common/outbox/outbox-dispatcher.service.ts` | Modified | Modified differently | Manual reconciliation required. Develop excludes carrier-owned events; PR #138 adds worker actor context/claim ownership. Also reconcile with focused PR #153, which corrects false delivery acknowledgement. |
| `apps/api/src/__tests__/unit/outbox/outbox-dispatcher-ownership.spec.ts` | Added | Missing | Retain; reconcile its expectations with canonical dispatcher and #153. |
| `apps/api/src/modules/notifications/otp-delivery.service.ts` | Modified | Same blob as PR #138 | No source conflict; retain current develop version. |
| `apps/api/src/__tests__/unit/identity/otp-delivery-log-redaction.spec.ts` | Added | Same blob as PR #138 | No source conflict; retain current develop version. |

### Initial code-level findings

1. **DatabaseService:** PR #138's version is 582 lines and contains the opt-in AsyncLocalStorage actor-context transaction primitive, plus additional secure-runtime and migration/operator logic. Develop's version is 225 lines and factors runtime identity SQL/logging into the new helper. The correct result is a deliberate composition: preserve the PR actor-context and fail-closed runtime behavior while using the develop helper and its tests. Inspect the entire init/shutdown/migration paths before editing; this table is not permission to copy one whole file over the other.
2. **OutboxDispatcher:** PR #138 adds a worker identity and wraps claim/success/failure DB operations in worker actor context. Develop's implementation adds explicit exclusion of `shipping.carrier.%` events from the generic dispatcher. The focused #153 workstream must be inspected before selecting the canonical event delivery/acknowledgement/retry implementation. Do not retain log-only “success” semantics.
3. **OTP:** the two relevant source/test files are byte-identical between develop and PR #138; do not duplicate or re-edit them.

## Focused PR overlap snapshot (rechecked 26 November)

| PR | Current head | State | Mergeable | Reconciliation |
|---|---|---|---|---|
| #139 | `37e10b95eebb6aff4354354dff554ba9e62967f1` | Open draft | No | Tenant-read overlap; reconcile with #144 and G-001 source. |
| #144 | `3a1d5682b51209b94735ec0136c1f0c737610be7` | Open draft | Yes | All 7 changed paths intersect #138; do not merge/extract duplicate implementations blindly. |
| #145 | `b3625d390f30794d331c8d74d6f5b3b8a828b058` | Open draft | Yes | Distinct migration 0070 filename/content collision. |
| #150 | `ad057b638e8dac7904d3d97036e22ce1c185537a` | Open draft | Yes | Reconcile notification provider truthfulness; one shared path. |
| #151 | `671f9e30d9c75cc515541d16149da4b4af0e74e6` | Open draft | Yes | Reconcile five shared paths; keep scratch suites excluded. |
| #153 | `5294698d8db78e21df972e8ce6213f21237789fa` | Open draft | Yes | Canonical outbox delivery/acknowledgement behavior; six shared paths. |
| #154 | `e421e21b1e66386a9d0c259fb83c99f1a05272cb` | Open draft | Yes | Canonical order-completion lease and worker context; nine shared paths; exact-head CI must be rechecked. |
| #156 | `e158c505f8f4758cce4e825cf4ea2dae52051ba4` | Open draft | Yes | Reconcile HTTP credential redaction; one shared path. |

## Migration dependency block

PR #138 contains migrations 0070–0075:
- `0070_public_access_and_function_search_path_hardening.sql`
- `0071_auto_complete_claim_leases.sql`
- `0072_carrier_webhook_credential_scoping.sql`
- `0073_ops_alert_delivery_claim.sql`
- `0074_reconciliation_tenant_version_integrity.sql`
- `0075_payment_proof_upload_intents.sql`

Do not extract/apply this sequence yet. Migration 0070 collides with PR #145's distinct function-local search_path hardening. Migration 0071 overlaps PR #154's order auto-completion lease. Review all six as one ordered dependency set, compare the migration ledger and role/default-ACL ownership assumptions, then produce an explicit migration disposition and rollback plan. Never renumber ad hoc.

## Next execution batch

1. Reconcile the 8 develop-only paths into the preserved source understanding; use develop's identity helper and tests as canonical evidence, not as a replacement for PR #138 actor-context behavior.
2. Inspect #153/#154 diffs and exact-head CI before selecting canonical outbox and order-worker implementations.
3. Inspect the complete DatabaseService init, actor context, migration/operator identity and shutdown paths; create a clean bounded G-002 integration branch from refreshed develop only after the full source/test/dependency manifest is defined.
4. Build a path-level extraction manifest for the remaining 654 non-scratch paths, grouped by database security, commerce correctness, workers/integrations and client workflow parity.
5. Keep all 1,280 scratch paths and unresolved token-like artifacts out of release extraction. Preserve original PR/evidence.
6. Run one consolidated CI campaign after each bounded workstream is complete; do not run CI for small edits.

## Safety and evidence

- This ledger is a source reconciliation record, not a claim that code was integrated, tested, reviewed, deployed or approved.
- PR #138 remains draft and unmerged. Keep its source and preservation refs intact.
- Keep independent security review and staging/database/migration/RLS/worker/deployment gates in force.


## Reconciliation implementation update — 26 November 2026

A first develop-only delta has now been composed into the preserved PR #138 source branch without rebasing or replacing its actor-context implementation:

- Added `apps/api/src/common/database/runtime-database-identity.ts` and the develop-side unit/PostgreSQL tests to the PR #138 branch.
- Critical review found that develop's original helper query omitted `owns_public_tables` and `owns_public_schema`, even though PR #138's fail-closed startup guard checks both. The helper has been extended to query and return both ownership flags. This prevents the refactor from silently weakening the production startup guard.
- `logRuntimeDatabaseIdentity` now returns the identity or `null`; it remains non-throwing and redacts connection errors. The production-like startup gate in DatabaseService remains authoritative and refuses startup when the identity is unavailable or unsafe.
- DatabaseService now uses the shared helper/query while preserving the PR #138 checks for session/effective role mismatch, superuser, BYPASSRLS, CREATEROLE, CREATEDB, public table/schema ownership and verified TLS.
- Unit and PostgreSQL integration fixtures now assert ownership flags and the helper's return contract.

Commits on `remediation/phase-0-1-tenant-security`:
- `87b274f34c68a8068959dd9caf2900372d7353c7` — add shared runtime identity helper with ownership checks.
- `c1039fcb59fe14769e89708d9876e9016fd2894c` — extend unit tests for identity result/null behavior.
- `deaf43df388d75a334c51c798116849237797b72` — extend PostgreSQL login/effective-role and ownership assertions.
- `3f09bb084542431d1ab87345110ac973fe072691` — compose shared helper into DatabaseService while retaining strict startup checks.

**Verification:** no test runner, formatter, typecheck, build or CI was run; this source change is NOT TESTED / NOT CI-VERIFIED. All four commits use `[skip ci]` in keeping with the agreed CI budget. The preservation branch was fast-forwarded from `dc6bf34b33851af5b542a44774a3fd0434e4e606` to `3f09bb084542431d1ab87345110ac973fe072691` using expected-SHA protection.

## Outbox canonicalization finding

PR #153 head `5294698d8db78e21df972e8ce6213f21237789fa` uses the safer current behavior: it disables the generic placeholder poller and leaves events PENDING because no generic delivery adapter exists. Its test explicitly asserts that no timer/poller starts and that writes remain PENDING. Therefore, do not extract PR #138's log-only poller/worker-claim loop as the canonical generic outbox implementation. Retain the worker actor-context design as a future integration requirement for a real adapter, and reconcile it with PR #153 and carrier-worker ownership before enabling any polling. PR #154 remains the separate auto-completion lease workstream.


## Order-completion worker dependency review — 26 November 2026

Inspected the current #154 head `e421e21b1e66386a9d0c259fb83c99f1a05272cb` and #138 source.

- #154's `AutoCompleteWorker` claims and releases rows using `this.db.db.execute` directly and does not establish a DatabaseService worker actor context. The #138 version wraps claim, completion processing and release in `withActorContext({ actorKind: 'worker', workerId })`.
- #154's updated `OrdersService.completeOrder` adds the required claim-owner argument, five-minute lease-expiry fencing, and a single transaction for order/shipment/history/outbox/master-order changes. Preserve those improvements.
- The safe canonical composition is therefore **#154's atomic completion/service implementation plus #138's worker actor-context boundary**, after the DatabaseService actor-context foundation is integrated. Do not integrate #154 worker/service ahead of the actor-context foundation or assume the focused PR alone is RLS-ready.
- Both #138 and #154 migration 0071 have the same DDL: two claim columns and the partial claimable-order index. Their differences are comments only. Keep one canonical migration file and one migration-ledger entry; do not apply twice or renumber.
- #154 exact-head workflow lookup returned no run. Its latest source/tests remain NOT CI-VERIFIED at the inspected SHA. The PostgreSQL lease concurrency tests need to be included in the consolidated campaign after the worker/actor composition is complete.

No code was changed in #154 and no migration was applied.


## Bootstrap/operator actor-context continuation — 26 November 2026

- Rechecked the live PR #138 and preservation refs before editing. Source branch and preservation branch were identical at the previous checkpoint; the PR remains draft/open/unmerged and mergeable=false.
- Reviewed `apps/api/infra/drizzle/operator-actor-context.ts`, all five staging bootstrap entry points, the staging target guard, the break-glass bootstrap token CLI, `BootstrapService`, the database actor-context tests and the G-002 operator/migration access map.
- Found that the break-glass CLI had its own inline bootstrap `set_config` statement and omitted an explicit transaction-local reset of `app.auth_operation`. Replaced it with the shared `setOperatorActorContext` helper, which sets the six standard actor-context values and clears fields irrelevant to bootstrap.
- Extended `operator-actor-context.spec.ts` to assert actor ID, actor role, active organization, actor kind, worker ID and authentication-operation settings are all transaction-local.
- The five staging bootstrap scripts already use `assertStagingBootstrapTarget`, `BEGIN`, and `setStagingBootstrapActorContext` before their data operations. They were inspected but not executed or modified.
- No test runner, typecheck, formatter or CI was run. This batch is NOT TESTED / NOT CI-VERIFIED. No token was issued; no bootstrap, migration, seed, staging/shared DB write, deployment or worker activation occurred.

Commits in this batch:
- `21d9362cdb55e50969999d87bc9fba0a7c116a0a` — replace inline bootstrap CLI actor SQL with the shared operator helper.
- `0c2c8b3acaf81e36d6bcb66192adda90f48af7dc` — assert all six transaction-local context fields in helper unit coverage.
- `017f19a6b0c3dac31816ee7c52e7ed91e476421f` — update G-002 operator-access audit evidence.

**Next source-review area:** finish the mixed catalog import/product actor-context audit (especially service methods that interleave DB phases with Redis, object storage, workbook parsing and cache/outbox/audit work). Keep each database phase short and actor-scoped; never wrap external I/O in a database transaction. Then reconcile remaining direct DB bootstrap/migration and worker boundaries before defining the bounded G-002 extraction slice.


## 26 November 2026 — catalog import actor-context call-graph review

Live verification before this review: PR #138 is OPEN / DRAFT / UNMERGED, head `af29841dc9f6e9668bf3630a2bd609c61f96bd8b`, base `develop`, GitHub mergeable=false; `develop` is `fde20420bbb759d2e562f9ff747c9e824ac58e25`; compare is diverged (2,805 ahead / 3 behind; merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`). Preservation ref is identical to the source head (0/0). Exact-head Actions has no workflow runs; combined statuses are only Vercel Web/Admin build-rate-limit failures.

### Import route/service findings (source review only)

Reviewed `catalog.controller.ts`, `catalog.service.ts` and `TenantDatabaseContextInterceptor` around all import routes and their service call paths.

- `createImportJob`, list/get job, get chunks, mapping update, cancel and retry routes use the opt-in tenant DB interceptor. Their DB-only call paths run under the authenticated request actor.
- Row staging, file upload, processing, preview and error-report routes intentionally do not use a request-wide interceptor. They first resolve the persisted job/store and verify organization/store membership inside a short explicit user actor scope. Service methods then scope their own DB reads, writes, claims, chunk operations and finalization with `withUserActorContext`.
- Redis row staging/read, object-storage upload/read, XLSX parsing and CSV serialization occur outside DB actor transactions. Chunk product/variant/pricing writes run inside actor-scoped DB transactions. The worker-style stale-import recovery entry point uses a stable worker principal and is dormant/not scheduled by this remediation.
- `updateImportMapping`, `cancelImport`, `retryFailedJob`, `getImportJob` and `getChunks` remain context-dependent service methods rather than accepting an actor argument themselves; current HTTP call sites are covered by the interceptor or an explicit actor wrapper. This is a maintainability boundary to preserve and test if new callers are added; do not infer the methods are safe for unscoped invocation.
- No missing actor-context route was identified in the reviewed import route set. This is not a full catalog module sign-off: continue auditing the remaining catalog service call graph, other controllers and worker entry points before closing G-002.

No code was changed in this review. No tests, typecheck, formatter, build or CI were run. No import job was created/processed, no object storage or Redis was touched, and no staging/shared DB writes, migrations, grants, RLS changes, worker activation, deployment or merge occurred.

**Next:** continue catalog service and worker actor-context coverage; then complete the raw SQL/function/trigger and migration/operator boundaries and prepare a bounded G-002 extraction manifest from refreshed `develop`. Keep CI batched until that bounded workstream is complete.


## 26 November 2026 — worker actor-context and order-completion reconciliation

Reviewed the current PR #138 order auto-completion worker, its unit tests, the #138 OrdersService completion path, focused PR #154 and the #153 outbox implementation.

- The #138 auto-completion worker establishes `withActorContext({ actorKind: 'worker', workerId })` around both claim and the entire `processCompletion` call. The conditional lease release runs in `processCompletion`'s `finally` before that outer actor scope closes, so release inherits the worker context. No production worker code change was required.
- The #138 worker unit-test double did not implement DatabaseService.withActorContext, so the tests did not model the actor-context implementation. Updated the test harness to provide a passthrough scope, assert DB execution and completion occur inside the worker scope, assert the stable worker principal, and cover lease release after failed completion. Commits: `983acb6b5a87c52a21a905745cf404d6c785c47f`, `82998dd808f5800ccfb7c354a373ef63bdf06bf4`, `7b98f58532c66c005c6a3089f9da72e1bc32d495`.
- The #138 `OrdersService.completeOrder` still performs multiple related writes without the single encompassing transaction present in #154. #154's atomic completion and claim-owner/lease fencing are the preferred service implementation, but its worker must be composed with #138's DatabaseService worker actor context before extraction. Keep one canonical migration 0071; its duplicate DDL must not be applied twice.
- #138's generic outbox dispatcher still contains the log-only placeholder that marks events DISPATCHED. Do not extract or enable it. PR #153 is the safer canonical behavior: no generic polling/acknowledgement without a real adapter; carrier-owned events remain with ShippingCarrierWorker. #153 exact-head Actions has a passing CI run; #154 exact-head Actions lookup is empty. Recheck before any merge decision.
- ShippingCarrierWorker's inspected database phases use a worker-context helper; provider/storage operations are outside those short DB scopes. This was a source-level spot check, not full worker sign-off.

No tests, typecheck, formatter, build or CI were run for the unit-test update. All source/test changes remain NOT TESTED / NOT CI-VERIFIED. No worker was activated, no outbox polling enabled, no provider call, database write, migration, deployment or merge occurred.

**Next:** finish the remaining worker and database call-graph audit; prepare the bounded G-002 extraction as the composition of #154 atomic completion with #138 actor context, and #153's safe outbox behavior. Run the consolidated CI campaign only after that bounded slice is assembled.


## 26 November 2026 — final worker-test typing cleanup

- Replaced explicit `any[]` in the auto-completion worker test mock with `unknown[]`; behavior and assertions are unchanged. Commit: `2c412732dbbbbde742d43e60f5d2593552aea3cb`.
- This remains unexecuted source/test authoring. No test runner, typecheck, formatter, build or CI was run.


## 26 November 2026 — migration 0070 collision disposition and runner review

- Compared PR #138 migration `0070_public_access_and_function_search_path_hardening.sql` with PR #145's `0070_normalize_arabic_search_path.sql`. They both alter the same `public.normalize_arabic(text)` function and therefore cannot coexist as two migration files with the same sequence/ledger position.
- Consolidated PR #145's postcondition assertion (`pg_proc.proconfig` contains `search_path=pg_catalog`, with the expected `input text` identity arguments) into PR #138's broader 0070 migration. The single canonical 0070 now retains the existing anon/authenticated table/sequence grant and default-ACL revocations, the function-local search_path setting, and an explicit fail-fast verification block. PR #145's standalone migration is to be excluded from the bounded integration slice; retain its verification intent in the canonical file.
- Reviewed `apps/api/infra/drizzle/migrate-pg.ts`: the runner serializes the ledger/apply sequence with a session advisory lock and wraps each individual migration plus its ledger insert in one BEGIN/COMMIT transaction, rolling back the file on failure. It does not make the whole 0070–0075 sequence one transaction. Dry-run only checks that files are nonempty; it does not parse or execute their SQL.
- Migration 0071 is the same two-column/index DDL as PR #154 apart from comments; keep one canonical 0071. Migrations 0072–0075 remain source-only and require separate isolated PostgreSQL validation and reviewed data/rollback plans before any shared/staging application. In particular, 0072 performs historical webhook relinking/detachment with manual-review markers; 0074 rewrites reconciliation supersession pointers and uniqueness; 0075 creates durable payment-proof upload-intent state.
- The 0070 edit is source-only. No migration runner, dry-run, SQL execution, staging/shared DB write, grant/default-ACL change, RLS change, deployment or worker activation occurred. No tests/typecheck/formatter/build/CI were run.

**Next:** assemble the G-002 bounded migration manifest with explicit 0070 canonical disposition, single 0071 ownership, and validation/rollback evidence for 0072–0075. Do not apply any migration until the separately required database-access and deployment approvals are satisfied.


## 26 November 2026 — return/shipping worker actor-context and lease-fencing review

### Return expiration

- `ReturnExpirationWorker.runBatch` establishes the worker actor for the claim SQL and each per-item processing operation. Its nested `WorkerLeaseService` calls use the same `holderId`, so DatabaseService's identical-actor nested-scope rule reuses the active transaction. `ReturnsService.escalateReturn` locks the exact live lease and repeats the holder+epoch+expiry predicate in the return status mutation; the return event and outbox insert are in that same transaction. The caller's worker scope surrounds this service call. No production return-worker change was identified in this pass.
- Fixed unit test doubles for `ReturnExpirationWorker` and `ReturnsService.escalateReturn` to provide the actor-context wrapper and exercise the intended worker/user caller scopes. Test files: `return-expiration-worker-fencing.spec.ts`, `returns-service-worker-escalation-fence.spec.ts`.

### Shipping carrier worker

- Claim and stale-recovery operations run under a stable worker principal. Before provider side effects, handlers resolve the shipment's store→organization relationship and verify the shipment order belongs to that store. Tenant-specific shipment/label writes use the resolved active organization. Carrier API, label URL fetch and object-storage operations are outside DB actor transactions.
- Found a real stale-worker fencing gap: successful event acknowledgement and failure/retry state updates were conditional only on outbox event ID. A worker whose processing lease had expired could overwrite the state after another worker reclaimed the event. Both updates now require the event ID, `status='PROCESSING'`, and `locked_by=this.workerId`. Source commit: `d18a495433460902190bec23d0d39923cc7b346a`.
- Added regression tests for owner-fenced success acknowledgement and failure/retry updates; also repaired carrier-worker test doubles so claim/recovery execute inside the expected worker actor scope. Return worker and ReturnsService tests now model the production caller actor context. Test commits: `7009e69dc04a4d37ea1f7dd8b29c89466c125eff`, `e90276f75e562aeb1ecbd71de0bdc0e661bade6a`, `7fc543a59f6902db811ea903f34bc7a80caf0e26`, `2abac268e2a06b5c6997e00f9f0f23d526d4d836`.
- The generic outbox dispatcher remains excluded: #153's no-poller/no-false-ack behavior is canonical. Carrier-specific worker ownership remains with ShippingCarrierWorker.

### Verification boundary

All changes are source/test authoring only. No test, lint, typecheck, formatter, build or CI was run, per the implementation-first batching decision. No carrier provider, storage, Redis, DB, migration, worker activation, staging workflow, deployment or merge was executed. The live staging ReturnExpirationWorker remains disabled unless separately configured; this source review did not change worker flags.


## 26 November 2026 — shipping worker stale-owner fence and G-002 extraction manifest

- Re-verified before this documentation update: PR #138 open/draft/unmerged, head `a4b4921fd11171d48c13bcf69cef4082e1d48301`, base develop `fde20420bbb759d2e562f9ff747c9e824ac58e25`, diverged 2,840 ahead / 3 behind from merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`, mergeable=false. Preservation ref was 11 commits behind and is to be fast-forwarded to the final doc head with expected-SHA protection. Exact-head Actions has no runs; only Vercel Web/Admin build-rate-limit failures are present.
- Fixed a real ShippingCarrierWorker stale-owner race: success acknowledgement and failure/retry finalization now require matching event ID, PROCESSING status and current locked_by worker. Commit `d18a495433460902190bec23d0d39923cc7b346a`. Added regression tests and repaired worker actor-context test doubles in return/shipping/ReturnsService specs (commits `7009e69d`, `e90276f7`, `7fc543a5`, `2abac268`). These are not run yet.
- Reviewed ReturnExpirationWorker and ReturnsService nesting: the same worker principal is used through nested scopes; the escalation transaction locks the live lease and repeats the holder/epoch/expiry fence in the return mutation. No additional production change identified in this pass.
- Added `docs/remediation/G-002-BOUNDED-INTEGRATION-MANIFEST-2026-11-26.md`, with explicit actor-context, application adoption, worker/webhook, operator/migration slices; exclusions; migration 0070–0075 dispositions; and consolidated verification gates. Current #138 changed paths: 1,939 total, 1,280 scratch, 659 non-scratch. Do not import all non-scratch paths; select only reviewed G-002 dependencies. The manifest is a plan, not a merge/deploy/migration authorization.
- No tests, lint, typecheck, formatter, build or CI run. No carrier provider/storage/Redis/DB/migration, worker activation, staging workflow, deployment, grant/default-ACL/RLS change, bootstrap/token issuance or merge occurred.

**Next:** continue the FK-to-ownership crosswalk and raw SQL/function/trigger/partition audit against the 75 numbered migrations and source callsites. Then refresh develop, build clean bounded integration branches using the manifest, and run one consolidated CI campaign once integration is complete. Preserve #138; never merge its 1,939-path tree wholesale.


## 26 November 2026 — initial FK-to-ownership crosswalk

- Added `docs/remediation/G-002-FK-OWNERSHIP-CROSSWALK-2026-11-26.md` after reviewing shipping, payment, return, settlement and reconciliation schemas/services plus `financialOrgScope` and carrier webhook routing.
- Confirmed important independent-FK relationships require runtime consistency checks: shipment.order_id + store_id; carrier configuration org_id + credential_id + optional store_id; webhook credential_id + shipment_id; return sub_order_id + payment_record_id; settlement sub_order/payment/store links. Reviewed service guards exist for carrier config create/resolve, carrier worker shipment/order/store validation, webhook credential routing, commission reversal, settlement adjustment posting and payment-proof cleanup. Continue callsite review; no claim that all paths are covered.
- Financial reconciliation intentionally supports null/global scope for platform roles; non-platform HTTP callers are denied without activeOrg by `financialOrgScope` and the ReturnsController has class-level tenant actor interception. Preserve that distinction in the RLS/policy design.
- Full 75-migration/schema FK inventory and remaining catalog/inventory/document/settlement ownership chains remain open. This crosswalk is partial source evidence only.
- No tests or DB/catalog/migration/provider/storage/worker/deployment actions occurred.


## Final checkpoint — 26 November 2026

- PR #138 source head at this checkpoint: `e410bf44b272eafb8e762636b66877f9e0c4b230`; OPEN / DRAFT / UNMERGED, base `develop`, GitHub mergeable=false.
- Preservation ref `preservation/pr138-remediation-2026-11-25` is identical to this exact head (0 ahead / 0 behind).
- Changed paths: 1,940 total, 1,280 scratch, 660 non-scratch. The non-scratch set still contains unrelated work; the G-002 manifest selects only bounded dependencies.
- `develop` remains `fde20420bbb759d2e562f9ff747c9e824ac58e25` (correct exact SHA: `fde20420bbb759d2e562f9ff747c9e824ac58e25`); source is diverged 2,852 ahead / 3 behind from merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.
- Exact-head Actions has no runs. Combined statuses contain only Vercel Web/Admin build-rate-limit failures. Worker-fencing changes and all authored tests remain NOT TESTED / NOT CI-VERIFIED.
- No DB/catalog access, migration, grant/default-ACL/RLS change, provider/storage call, worker activation, bootstrap, deployment or merge occurred.


## 26 November 2026 — live checkpoint and migration review progress

- Exact source head: `98694426f87ec3142042bbad221819968bdd5160`; preservation ref matches exactly. PR #138 OPEN / DRAFT / UNMERGED, mergeable=false, 1,940 changed paths.
- `develop` `fde20420bbb759d2e562f9ff747c9e824ac58e25`; source compare 2,874 ahead / 3 behind; merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.
- Exact-head Actions lookup: no runs. Combined status: Vercel Web/Admin provider build-rate-limit failures only. No CI result is claimed.
- Continued static review across migration 0007 and 0012–0053; the existing full static FK scan records 183 REFERENCES across 40 of 75 migrations. Cross-column service coverage, raw SQL/function/trigger/partition consumers and live catalog reconciliation remain open.
- New review items: analytics partition retention and legacy-table copy/drop need preflight/recovery evidence; 0053 is one transaction despite progress notices every 500 rows; analytics global event counts require platform-only permission or org scope; promotions redemption should verify buyer/order/store lineage in service; catalog import and shipping actor boundaries have positive source evidence.
- No tests/CI, SQL/catalog access, migration, grant/default-ACL/RLS change, staging/shared DB write, provider/storage call, worker activation, bootstrap, deployment or merge.


## 26 November 2026 — PR #157 created

- Draft PR #157: `integration/g002-actor-context-foundation` → `develop`; head `e3bc1ba21d67ec4947824acf278529e543487eb1`; 17 files; OPEN / DRAFT / UNMERGED; mergeable=true at verification.
- Exact-head Actions has no runs. Combined status has only Vercel Web/Admin provider build-rate-limit failures. No tests, lint, typecheck, build or CI are claimed.
- The branch starts from develop and retains the three develop-only commits. It contains no SQL migration, RLS, grant/default ACL, DB role, staging write, worker activation, provider/storage action or deployment.
- PR #138 remains open/draft/unmerged and separately preserved; continue bounded extraction only.


## 26 November 2026 — CatalogImportService actor preflight hardening

Source review found that CatalogImportService.upload performed the object-storage write before validating the caller through withUserActor. Added a fail-closed assertCaller requiring non-empty subject and role, applied it to user/audit actor helpers, and invoked it before upload storage and execute plan mutation. Added a focused unit spec for missing/blank caller identity proving rejection before object-storage or database actor-context calls.

Commits: f9bfccf3ac11b7fbb0904634845c24a31d7c805a (service), 0b14f11c3fd6f787baa73765da7310bb553b24c4 (regression spec), 0f8586e9548a91ad4c56b410e60180ad080e6788 (import formatting). Tests and CI were not run. This is not runtime verification. No storage, database, migration, staging, worker, deployment or merge action occurred.


## Final live checkpoint before this memory commit — 26 November 2026

- PR #138: OPEN / DRAFT / UNMERGED, mergeable=false, 1,942 changed files. Source head before this documentation commit: `f7894abe85b9e9c053e51a730dbfd1c51f6adf21`; preservation ref identical. `develop` `fde20420bbb759d2e562f9ff747c9e824ac58e25`; compare 2,892 ahead / 3 behind from merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`. Exact-head Actions: no runs.
- PR #157: OPEN / DRAFT / UNMERGED, mergeable=true, 19 files, head `77145bc6262aba99cf7fdbd45139382bebc44fa7`, base `develop` at `fde20420bbb759d2e562f9ff747c9e824ac58e25`.
- PR #158: OPEN / DRAFT / UNMERGED, mergeable=true, 3 files, head `2e57a2deed1efb5c02de05d23b7ec10b668271c0`, base PR #157 branch at `77145bc6262aba99cf7fdbd45139382bebc44fa7`.
- PR #157/#158 exact-head Actions lookups: no runs. Vercel Web/Admin build-rate-limit failures only. No tests, lint, typecheck, build or CI have run for either slice.
- The preservation branch will be fast-forwarded to the new source documentation commit without force. PR #138 remains the source/evidence branch; do not merge it wholesale.
- No migrations, SQL/catalog access, RLS/grants/default ACL, staging/shared DB writes, worker activation, provider/storage calls, bootstrap, deployment or merge occurred.


## 26 November 2026 — promotion and catalog-import lineage continuation

- Added a service-level promotion redemption guard. The redemption now requires an order and verifies the exact order ID, buyer ID, promotion store, promotion ID and recorded discount amount before writing the redemption row or incrementing the promotion counter. Source commit ab59c9b4019dcc6a0a306e604b7e32d139b1b14c; regression-test commit 53990e08318e0deb54b41bb258c76ce5e6e41713. The concurrent global/per-user redemption-limit race remains a separate open item.
- The CatalogImportService actor preflight hardening was added in commits f9bfccf3ac11b7fbb0904634845c24a31d7c805a, 0b14f11c3fd6f787baa73765da7310bb553b24c4 and 0f8586e9548a91ad4c56b410e60180ad080e6788. It validates the caller before upload storage writes and before execute plan mutation; a focused regression spec covers missing/blank identity.
- PR #138 remains OPEN / DRAFT / UNMERGED. Source and preservation refs were kept identical with expected-SHA fast-forwards after each deliberate commit. The live source head should be re-read before future writes.
- PR #157 current exact head is 77145bc6262aba99cf7fdbd45139382bebc44fa7, 19 changed paths from develop. CI run #1553 was cancelled after five successful jobs and is not a full pass; newer run #1554 is in progress. Vercel quota statuses are provider failures, not application CI.
- PR #158 is stacked on PR #157 at 2e57a2deed1efb5c02de05d23b7ec10b668271c0 and adds only IdentityService plus two focused test files for active organization membership and active organization claim/profile checks. No exact-head Actions run exists.
- All newly authored promotion/catalog-import tests remain unexecuted. No database/catalog writes, migrations, grant/default-ACL/RLS changes, staging mutation, storage/provider calls, worker activation, bootstrap, deployment or merge occurred.
- Next: complete source review of PR #157/#158 and their dependency relationship, inspect #157's active CI run, continue the FK ownership and raw SQL/function/trigger/partition audit, then prepare the next bounded application-adoption slice from refreshed develop. Keep worker/webhook and operator/migration slices separate; do not merge PR #138 wholesale.


## 26 November 2026 — raw SQL and special-object consumer review

### Function and search path
- Migration 0007_search.sql creates public.normalize_arabic(text) as PL/pgSQL IMMUTABLE, invoker (no SECURITY DEFINER). Migration 0070 sets its search_path to pg_catalog and asserts the postcondition.
- Catalog SearchService is the identified runtime consumer: its full-text/trigram queries call normalize_arabic through parameterized Drizzle SQL. CatalogController's GET search route applies TenantDatabaseContextInterceptor. No additional runtime consumer was identified in the inspected source paths.
- pg_trgm is installed by 0007 for indexes. Extension schema/owner/ACL still requires live catalog verification.

### Analytics partition parent
- Migration 0002 creates analytics_events partitioned by created_at; 0013 replaces/reconfigures the parent and calls partman.create_parent (monthly, premake 3, start 2026-01-01); 0018 corrects retention matching to public.analytics_events with 12-month retention and keep_table/index false.
- AnalyticsService reads/writes only the parent through Drizzle; no direct child partition references were found in inspected runtime source. AnalyticsController sets tenant actor context and derives userId/orgId from JWT on track routes.
- GET /analytics/events is global aggregation, but analytics:read is seeded only for ADMIN and inherited by SUPER_ADMIN; merchant/staff/buyer roles receive analytics:track only. This is source-level seed evidence, not a live RBAC proof.
- The 0013 cron.schedule example is commented out; no pg_cron/pg_partman scheduler deployment manifest was found. Extension version, partition coverage, default partition, retention job and relation ownership/ACL remain live/deployment gates.

### Raw SQL runtime consumers
- AutoCompleteWorker uses parameterized SQL with FOR UPDATE SKIP LOCKED for claim/update. Claim and process execute under worker actor context; releaseClaim runs in processCompletion's worker scope.
- OpsAlertService wraps ops_alerts SQL with user or system actor helpers. P13MonitorService wraps its raw reads with the p13-monitor worker actor; its read-only timer starts from OnModuleInit at the configured interval (default 60s). WorkerLeaseService wraps lease SQL in worker context; forceExpire uses a system actor.
- ReturnsReconciliationService uses pg_advisory_xact_lock inside its DB transactions and tenant/version predicates. Its identified production entry is ReturnsController, which has TenantDatabaseContextInterceptor and applies financialOrgScope to reconciliation routes.
- PaymentsService consumes migration 0075 payment_proof_upload_intents: request DB phases use user actor, external object storage remains outside DB actor transactions, and cleanup claims/updates use a worker actor. PaymentsModule has no registered cleanup worker or controller route; no scheduled callsite was identified. Do not activate cleanup without an explicit worker contract and race/recovery tests.
- AnalyticsService uses Drizzle on analytics_events; SearchService uses raw SQL and normalize_arabic; neither directly references partition children.
- This consumer map is a targeted source review, not proof that every raw SQL or dynamic SQL callsite in the monorepo has been inspected.

### Migration special-object disposition
- The numbered migration source scan found no trigger/constraint-trigger creation, RLS policy/enablement, view/materialized-view, sequence or SECURITY DEFINER declarations. Function creation is limited to normalize_arabic in 0007; partition management is the analytics parent in 0002/0013/0018; PL/pgSQL blocks include 0053 and DO checks in 0070–0074.
- 0053 logs progress every 500 rows but remains one migration transaction; it does not commit 500-row batches. Preflight actual JSONB volume and long-transaction/lock impact.
- 0070 uses dynamic EXECUTE format for privilege/search_path hardening; 0072 and 0074 use DO blocks for conditional constraints/integrity checks. These still require owner/default-ACL authority and rollback review.

**Open:** live pg_partman/partition/scheduler and physical relation/function/extension ownership/ACL checks; full raw SQL/dynamic SQL consumer scan; 0075 cleanup invocation/worker contract. No database operation or CI was run.


## 26 November 2026 — PR #158 explicit-null active organization profile alignment

The PR #158 review found that GET /me passed the JWT activeOrg but getProfile treated explicit null like an omitted argument, selecting the first active membership and potentially projecting merchant role/permissions that were absent from the current token. The fix distinguishes undefined (default membership selection for internal callers) from explicit null (no active organization), and carries the caller's JWT activeOrg through updateProfile. Added a regression test for an active membership with explicit-null JWT activeOrg.

Commits: 94c8fc5f1a2ae5d69e276909f31b8a539a7001ed, 76894a736d7279ba2a523685af38c4bd9936e3c3, 5c7e41bf04ec16e9fc0565e57425fcc05f548ffc. No test/lint/typecheck/build/CI execution yet; exact-head Actions list empty; Vercel statuses are provider build-rate-limit failures.


## 26 November 2026 — PR #138 OrdersService and SQL audit checkpoint

- Source/preservation refs are synchronized; current PR #138 source head at this checkpoint is d3a01fb31a897b1f9f4c3c44815bd85828b95af7 (documentation-only commits after the code changes).
- Added fail-closed actor requirements to OrdersService.cancelOrder and rejectOrder: CallerContext is required, supplied actor ID must equal caller.sub, and cancellation no longer falls back to an unscoped DB operation. Updated lifecycle/actor-context regression tests. No tests run for these PR #138 changes.
- Targeted scan covered 75 numbered SQL migrations and 62 API service/worker files. Dynamic sql.raw interpolation was limited to allowlisted day/week date_trunc literals and internally generated SAVEPOINT IDs. No CREATE TRIGGER/PROCEDURE/EXECUTE FUNCTION/CREATE RULE was found in the numbered migrations; normalize_arabic remains the application-defined function and analytics partition management is in 0002/0013/0018. Full controller/script/package SQL inventory and live catalog/ACL verification remain open.
- PR #157 head 5f9399cd6fa80e51b508c31203dd6b5f80b37757 has consolidated CI run #1556 in progress. PR #158 head 5c7e41bf04ec16e9fc0565e57425fcc05f548ffc remains stacked on the older PR #157 head and must be reconciled only after #1556 is green.
- No database write, migration, RLS/grant change, staging mutation, worker activation, deployment or merge occurred.


## 26 November 2026 — PR #157 test-repair CI checkpoint

- PR #157 exact head is 6901389d9975fbeb959ee89633024f83ce598272. Run #1556 (older head 5f9399...) completed with five jobs passing, including migration full apply and pg_partman verification; Integration Tests and Unit/Coverage failed before test discovery because vitest.config.ts had a malformed exclude array. Fixed the syntax at 6901389d; run #1557 is queued for the corrected head.
- Test fixture repair commits 21d4e344... and 4341fef0... updated DatabaseService test initialization, membership schema/seed fixtures, catalog/tenant-scope mocks and scratch spec exclusion. The actual test suites have not yet been validated after these changes.
- PR #158 head 5c7e41bf... remains stacked on old parent 77145bc...; do not rebase until #1557 is green.
- PR #138 source/preservation refs remain identical at the latest memory commit; the PR #138 cancel/reject actor hardening and SQL scan are source-reviewed only, not tested.


## 26 November 2026 — latest PR #157 parent-stack status

- PR #157 head advanced to d204b9ea18958f623e0379c7cc307fd0545f8863 after the 6901389d config correction. Run #1557 is still validating 6901389d, not d204b9e; migration full apply, lint/typecheck, mobile, Web/Admin and E6 checks passed, while Unit/Coverage and Integration Tests are still running.
- d204b9e adds lazy AsyncLocalStorage initialization for prototype-based DatabaseService test doubles, parameterized SQL-builder fallback for organization/store lookups when Drizzle relation query objects are unavailable, and P4/P12 fixture changes. Wait for #1557 to finish, then run one consolidated check on d204b9e.
- PR #158 head 4f2ac7d... includes earlier parent fixture work but not the 6901389d/d204b9e parent commits; keep it stacked and reconcile only after PR #157 is green.
- PR #138 source and preservation refs remain identical at the latest project-memory checkpoint. OrdersService actor hardening and bounded SQL scan remain untested; no DB writes, staging mutations, RLS/grant changes, worker activation or deployment occurred.


## 26 November 2026 — PR #158 profile-controller test alignment

- PR #158 current head is 19b96bcda29d7166a748dd5693b430cce0ea2098 (5 changed files). Its profile-controller tests now verify updateProfile forwards a concrete activeOrg and explicit null, matching the controller/service contract.
- PR #157 current head remains d204b9ea18958f623e0379c7cc307fd0545f8863; run #1557 still validates prior head 6901389d. Migration full apply and non-test jobs passed; Unit/Coverage and Integration Tests remain in progress. d204b9e is not yet validated.
- Keep PR #158 stacked and reconcile only after PR #157's exact current head is green. PR #138 source/preservation refs remain identical; its actor hardening/SQL scan remain untested. No DB writes, staging changes, RLS/grant changes, worker activation or deployment.


## 26 November 2026 — PR #157 run #1558 queued

- PR #157 exact head 0d97dd446d5912d6d0a815d8a931a88f53db009c; consolidated CI run #1558 is IN PROGRESS.
- Run #1557 on 6901389d passed migration full apply and non-test jobs but failed integration/coverage: membership/store relation lookups lacked Drizzle query relations, P4 lacked valid order lines and isolated adjustment orders, and excluding scratch specs lowered coverage. Commit d204b9e adds safe parameterized SQL-builder fallbacks; 0d97dd4 restores scratch specs and repairs P4/P6/P12 fixtures.
- PR #158 head 19b96bcda29d7166a748dd5693b430cce0ea2098 remains stacked and behind parent; reconcile only after #1558 is green.
- PR #138 actor hardening and SQL source scan remain untested; source/preservation refs are identical. No DB writes, staging changes, RLS/grant changes, worker activation or deployment.
