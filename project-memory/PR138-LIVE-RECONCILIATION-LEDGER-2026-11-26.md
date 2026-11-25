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
