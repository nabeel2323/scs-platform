## 26 November 2026 — CatalogImportService actor preflight hardening

- Baseline verified before this batch: PR #138 was OPEN / DRAFT / UNMERGED at f49d6ad28ac89fcb17710c02f11ae8ba09ec8759; develop was fde20420bbb759d2e562f9ff747c9e824ac58e25; preservation branch was identical (0 ahead / 0 behind).
- Source review found CatalogImportService.upload wrote the workbook to object storage before its first database actor-context call. A malformed/missing service caller could therefore cause an external storage side effect before the database rejected the actor.
- Added a shared fail-closed caller assertion requiring non-empty verified subject and role. Both user and audit actor helpers now validate before opening actor context; upload validates before object storage; execute validates before modifying the cached plan.
- Added catalog-import-service-actor-context.spec.ts covering missing caller, missing/blank subject and missing/blank role. Each case expects ForbiddenException, no object-storage write and no database actor-context call.
- Source/test commits: f9bfccf3ac11b7fbb0904634845c24a31d7c805a, 0b14f11c3fd6f787baa73765da7310bb553b24c4, and import formatting 0f8586e9548a91ad4c56b410e60180ad080e6788. These are source/test authoring changes only.
- Tests, lint, typecheck, formatter execution, build and CI have NOT been run for this change. CI remains intentionally deferred until the bounded G-002 workstream is assembled. PR #138 remains draft/unmerged.
- PR #157 Slice A is separate. Its current exact head at last check was 2d61b22effb31d5f85f75ec0c284b54991f5bd6c; Actions run #1553 had five jobs passed and API unit/coverage plus PostgreSQL integration still in progress. Do not trigger duplicate CI.
- No object-storage call, DB operation, migration, staging/shared DB write, grant/default-ACL/RLS change, worker activation, deployment or merge was performed in this continuation.

**Next:** continue the source-level G-002 FK ownership and raw SQL/function/trigger/partition consumer audit, finish method-level tenant predicates and worker/bootstrap/migration access review, then update the bounded integration manifest. Keep CI consolidated.

---

## 26 November 2026 — final small test-fixture correction

- Updated the operator actor-context unit test to use optional access when reading the first mock call, avoiding a possible strict TypeScript indexed-access warning. Commit: `55b88e6d4f410b93b568ae343e842cd27babd14d`.
- This remains source/test authoring only; no test, typecheck, formatter or CI was run.

## 26 November 2026 — latest continuation checkpoint

- PR #138 remains OPEN / DRAFT / UNMERGED, base `develop`, mergeable=false. Exact current source head: `c0c1ba1828af940ad360b198f4c1bbd23298b98f` before this checkpoint documentation batch.
- `develop` is `fde20420bbb759d2e562f9ff747c9e824ac58e25`; merge base remains `f74eb588cc58fc99b105e749d39dbfbacb4f9775`. Compare is diverged: source 2,798 commits ahead / 3 behind.
- Preservation branch was 4 commits behind source before this checkpoint; fast-forward it to the final documentation commit using expected-SHA protection and verify identical refs.
- **New source change:** the break-glass bootstrap token CLI now calls the shared `setOperatorActorContext` helper instead of inline `set_config`. The helper also resets `app.auth_operation`, which the prior inline statement omitted. The operator helper unit test asserts all six transaction-local actor settings. Commits: `21d9362cdb55e50969999d87bc9fba0a7c116a0a` and `0c2c8b3acaf81e36d6bcb66192adda90f48af7dc`.
- Reviewed all five staging bootstrap entry points: each performs the explicit staging target/approval check, begins a transaction and sets the bootstrap actor before DB writes. No staging script was run or changed.
- Reviewed catalog mixed-operation boundaries: product update/delete split short DB actor scopes from Redis cache invalidation and audit work; import upload/preview/process keep object storage, workbook parsing and Redis outside DB actor transactions and scope DB phases individually. These reviewed areas are not yet fully verified by tests; continue the broader route/service call-graph audit before declaring G-002 complete.
- Updated `docs/remediation/G-002-MIGRATION-OBJECT-AND-OPERATOR-ACCESS-AUDIT-2026-11-24.md` and `project-memory/PR138-LIVE-RECONCILIATION-LEDGER-2026-11-26.md` with the operator-context finding and next source-review area.
- No test runner, formatter, lint, typecheck, build or CI was run. Source/tests remain NOT TESTED / NOT CI-VERIFIED. No CLI token issuance, bootstrap, migration, seed, staging/shared DB write, grant/default-ACL change, RLS enablement, worker activation, deployment or merge occurred.

**Next:** finish mixed catalog/import and remaining service-level actor-context coverage; review the worker/bootstrap/migration access boundaries as a whole; then prepare the bounded G-002 extraction from refreshed `develop`. Keep CI batched until that workstream is ready.

---

## 26 November 2026 — live PR #138 continuation checkpoint

- PR #138 remains OPEN / DRAFT / UNMERGED, base `develop`, mergeable=false. Exact current head: `c8dff4e9ba289c2ca800301858a2f01a15412c10`.
- Current `develop`: `fde20420bbb759d2e562f9ff747c9e824ac58e25`; merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`; compare remains diverged (2,784 commits ahead / 3 behind).
- PR changed-file count is now 1,938 after adding the runtime identity helper, its unit/PostgreSQL tests and the live reconciliation ledger. The earlier 1,280 scratch paths remain excluded from release extraction.
- Preservation branch `preservation/pr138-remediation-2026-11-25` was fast-forwarded using expected-SHA protection and is IDENTICAL to this exact head (0 ahead / 0 behind).
- Exact-head Actions lookup returned no workflow runs. Only Vercel Web/Admin build-rate-limit statuses are present; PR #138 is NOT CI-VERIFIED.
- **Implemented in this continuation:** composed develop's runtime database identity helper/tests into PR #138. Extended the helper SQL/result with `owns_public_tables` and `owns_public_schema` because develop's original helper omitted ownership checks present in PR #138's production fail-closed guard. DatabaseService now calls the shared helper and retains strict production checks for role mismatch, superuser, BYPASSRLS, CREATEROLE, CREATEDB, public table/schema ownership and verified TLS. Source commits: `87b274f34c68a8068959dd9caf2900372d7353c7`, `c1039fcb59fe14769e89708d9876e9016fd2894c`, `deaf43df388d75a334c51c798116849237797b72`, `3f09bb084542431d1ab87345110ac973fe072691`.
- **Outbox decision:** PR #153 disables the generic log-only placeholder poller and leaves events PENDING because no generic delivery adapter exists. Do not extract PR #138's log-only dispatcher as canonical. Keep #138 worker actor context as a future requirement when a real adapter is introduced.
- **Order-worker dependency:** PR #154's atomic completion/lease implementation is the preferred service logic, but its worker currently lacks DatabaseService worker actor context. Compose it with PR #138's worker-context boundary only after the actor-context foundation is integrated. PR #138/#154 migration 0071 DDL is identical apart from comments; retain one migration only. PR #154 exact-head Actions lookup returned no run.
- No tests, formatter, typecheck, build or CI were run for this continuation. All source commits used `[skip ci]`; changes remain NOT TESTED / NOT CI-VERIFIED.
- No PR merge, deployment, staging/shared database write, migration, grant/default-ACL change, RLS enablement, worker activation or provider side effect occurred.

**Next:** continue the G-002 actor-context adoption and raw SQL/worker/bootstrap boundaries; build a reviewed file-level extraction manifest from current develop before creating bounded integration PRs. Do not merge PR #138 wholesale. Keep CI batched until a bounded workstream is complete.

---

## 26 November 2026 — USER-APPROVED PRIORITY AND CONTINUATION PLAN

**Standing user instruction:** The most important task is to preserve and safely prepare PR #138 for integration into `develop`. Only after the PR #138 work has been reconciled into safe, bounded integration slices should the remaining PR backlog be repaired. Do not let this priority get lost between sessions.

**Current verified checkpoint (after recording this plan)**
- Repository: `nabeel2323/scs-platform`.
- PR #138: OPEN / DRAFT / UNMERGED, base `develop`, GitHub reports `mergeable=false`.
- Active source branch: `remediation/phase-0-1-tenant-security`.
- PR #138 head before this documentation update: `7374024f6ea01532034799c23129b94a8aa3b91d`.
- Current `develop` head last verified: `fde20420bbb759d2e562f9ff747c9e824ac58e25`.
- Comparison last verified: 2,779 commits ahead / 3 behind; merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.
- PR metadata: 1,934 changed paths, 104,206 additions, 414,508 deletions. 1,277 paths are under `.m73b6-scratch/`; three additional PostgreSQL suites are under `apps/api/src/__tests__/scratch/`.
- Preservation ref `preservation/pr138-remediation-2026-11-25` was synchronized to the same head using an expected-SHA fast-forward. Keep it synchronized with deliberate append-only updates; never reset, force-push, delete, or destructively rebase either ref.
- No GitHub Actions run exists for the exact source head. The two visible Vercel Web/Admin status failures are build-rate-limit/provider failures, not successful or failed application CI. PR #138 remains NOT TESTED / NOT CI-VERIFIED at this head.
- No PR merge, deployment, staging/shared database write, migration, grant/default-ACL change, RLS enablement, worker activation, or provider side effect was performed.

**Integration approach — preserve first, reconcile, then integrate**
1. Never merge PR #138 wholesale. Treat it as the preserved source of remediation work and evidence, not as a directly mergeable release branch.
2. Begin extraction from the latest verified `develop`, not from PR #138's stale base. Reconcile the three commits on `develop` absent from the PR branch (last verified comparison from merge base `f74eb588...` showed three develop-side commits and eight changed paths, including runtime DB identity checks, OTP log-redaction tests, and outbox ownership protection).
3. Maintain a file-by-file extraction/reconciliation ledger: source path, PR #138 version, develop version, overlapping PRs, chosen canonical implementation, tests, migration dependencies, disposition and verification evidence.
4. Exclude `.m73b6-scratch/`, `apps/api/src/__tests__/scratch/`, unresolved token/secret-like artifacts and unreviewed test artifacts from release extraction. Never print, copy or expose token/secret contents. Preserve the original evidence in the source branch; exclusion from a release slice does not mean deletion or loss.
5. Review migrations 0070–0075 as one ordered dependency set. Resolve the distinct migration-0070 collision with PR #145 and the 0071 auto-completion lease overlap with PR #154 before extracting/applying anything. Never renumber or apply migrations ad hoc.
6. Consolidate overlapping work into one canonical implementation before opening clean, bounded PRs. Last verified path overlap against PR #138: #144 7/7; #154 9/13; #153 6/10; #151 5/12; #150 1/2; #156 1/3. #145 has no identical changed path but collides on migration number 0070; #155 has no changed-path overlap. Recompute all refs/overlaps when resuming.
7. Preserve implementation, tests, documentation and decision history. Do not mark an item integrated merely because another PR overlaps it; record exactly what was extracted and what remains.
8. Keep PR #138 and its preservation ref intact while extraction work proceeds. Do not close or delete the source PR merely because bounded slices are created.

**Backlog order after #138 reconciliation**
- Tenant-boundary remediation: reconcile #144 and #139 with G-001 source/tests; verify the latest PR #139 state because it was reported non-mergeable.
- Worker/outbox/order reliability: consolidate #153 and #154, choosing one canonical event-consumer ownership and durable order-completion lease implementation. PR #154 had no Actions run on its last verified head; recheck.
- Security and notification truthfulness: reconcile #156 and #150, accounting for #138 and develop's existing OTP redaction changes.
- Currency and UX: reconcile #151.
- Database search_path: resolve #145 migration 0070 collision before migration extraction.
- Remaining focused changes: #148, #149, #155 and #143; verify exact-head CI and review state before merging any.
- Recheck the complete open-PR list at each continuation; this order is a plan, not a claim that these PRs are still unchanged.

**CI / execution preference**
- User explicitly does not want repeated CI runs for small changes. Work autonomously through related implementation, tests and documentation, grouping changes into cohesive commits.
- Do not dispatch CI for each small edit. Use proportionate local checks if a local checkout is available; otherwise defer CI until a bounded integration workstream is complete, then run one consolidated CI campaign against its exact final head. Run a final release-candidate campaign after all intended slices are integrated.
- Never claim a test, check, review, merge or deployment succeeded unless the exact current SHA has evidence.
- Keep independent review and all existing staging/database/migration/RLS/worker/deployment approval gates. This priority does not authorize bypassing them.

**Next session's first actions**
1. Read this file and the related project-memory documents.
2. Re-query PR #138, active branch, preservation branch, `develop`, exact-head CI and all open PR heads; update stale checkpoint values before acting.
3. Verify preservation branch equals the PR #138 head.
4. Start the file-by-file ledger and reconcile develop-only commits plus high-risk overlapping security/worker/migration slices. Do not merge PR #138 wholesale.

---

## 26 November 2026 — live continuation checkpoint

**Current repository state**
- PR #138 is OPEN / DRAFT / UNMERGED, base `develop`, and GitHub reports `mergeable=false`. The current parent head for this grouped implementation batch is `5ccdbc1a6f58306882e14ab9b55c907784ada7b1`; this batch adds actor-context lifecycle tests and refreshes the project-memory documents.
- Last verified comparison with `develop`: 2,777 commits ahead / 3 behind; merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`; develop head `fde20420bbb759d2e562f9ff747c9e824ac58e25`. PR diff before this batch: 1,933 paths, 103,994 additions, 414,508 deletions. 1,277 paths are under `.m73b6-scratch/`; three additional PostgreSQL suites are under `apps/api/src/__tests__/scratch/`. Do not merge #138 wholesale or extract scratch/token-like artifacts.
- `preservation/pr138-remediation-2026-11-25` was verified identical to the source branch at parent head `5ccdbc1a6f58306882e14ab9b55c907784ada7b1`; fast-forward it to this batch's resulting head using expected-SHA protection.
- Implementation and documentation commits deliberately use `[skip ci]`; no Actions run was triggered. New source/tests remain NOT TESTED / NOT CI-VERIFIED.

**Implementation and test work in this continuation**
- Reviewed the fail-closed Render startup guard and found three config assertions still reading raw `NODE_ENV`: OTP HMAC secret, bootstrap-owner email, and OTP delivery readiness. Fixed all three to use `resolveDeploymentNodeEnv(env)`. Added regression tests for Render with development/unset `NODE_ENV`, preserving local development behavior. Source/test commit: `d1d9d8f570e21bf96f2853ce17a8b42aaed0b902`.
- Added `apps/api/src/__tests__/unit/common/database-actor-context.spec.ts` to cover transaction-bound DB routing, normalized user and worker principals, identical nested-context transaction reuse, actor-switch rejection, incomplete-principal rejection, detached async scope closure, and cleanup after transaction failure.
- These tests are authored source only. No test runner, typecheck, formatter, build, GitHub Actions or preview verification was run. Keep the CI budget rule: do not run CI after small changes; use one consolidated campaign after implementation/integration is complete.

**Staging identity and safety**
- Read-only Render runtime evidence confirms the deployed staging API uses `session_user=postgres` and `current_user=postgres`, with `BYPASSRLS=true`, `CREATEROLE=true`, `CREATEDB=true`, and `ssl=false`.
- The fail-closed source guard is NOT deployed. It will refuse startup while the runtime role remains privileged or TLS is not verified. Do not deploy until a dedicated least-privilege API role and TLS configuration are provisioned through the separately authorized process.
- No DB role/grant/default-ACL/RLS/migration change, Render setting/deploy/restart, worker activation, staging business workflow or production action was performed.

**Focused PRs and release sequencing**
- PR #153 current head `5294698d8db78e21df972e8ce6213f21237789fa`; exact-head Actions run #1523 passed. It remains OPEN / DRAFT pending independent review; Vercel quota failures are provider failures.
- PR #154 current head `e421e21b1e66386a9d0c259fb83c99f1a05272cb`; no GitHub Actions run was found for this exact head. Its PostgreSQL integration tests now include two-worker claim exclusivity and expired-lease reclaim/stale-owner fencing, but these latest tests remain unverified by exact-head CI. Keep it draft pending exact-head validation and independent review.
- PR #152 OTP redaction is already merged into `develop`; do not repeat it.
- `main` and `develop` are DIVERGED: develop is 11 commits ahead and 4 behind main, merge base `9f5bc397467dc92cdc8debd54797b6d730659c36`. Reconcile history deliberately before release promotion.

**Next work**
1. Continue source-only G-002 actor-context and DB access-path review. Check context propagation for user, worker, bootstrap, audit, authentication and anonymous paths; do not weaken production method contracts.
2. Finish raw SQL/function/trigger/partition coverage, method-level ownership predicates, FK-to-ownership crosswalk, and worker/bootstrap/CLI actor-context boundaries.
3. Reconcile overlaps with #153/#154/#156 and migration 0070 before creating bounded extraction PRs from refreshed `develop`.
4. Keep staging gates closed until runtime role/TLS, access-model, rollback and authorization requirements are satisfied.

**CI budget rule reaffirmed:** batch related source, tests and docs into cohesive commits; use proportionate local checks where a local checkout is available; defer CI while implementation is in progress; run one consolidated CI per completed workstream and one final release-candidate campaign. Never represent skipped or historical checks as current passes.

---



## 25 November 2026 — latest verified implementation state

- Branch `remediation/phase-0-1-tenant-security`, PR #138 `OPEN / DRAFT / UNMERGED`, base `develop`; head `8e2c08953442a6d0f67568f0c5567898f7eb12e7`; ahead 2,725 / behind 3; 1,909 PR files. Exact-head Actions lookup is empty by intentional `[skip ci]`.
- Five grouped code/test commits on this branch: `bc87ece`, `ee083c0`, `8525fa7`, `8e8ce34`, `8e2c089`. Order transition actor propagation now passes the verified caller to the auto-advance helper; accept/partial accept/reject fail closed on missing/invalid caller. Checkout captures optional idempotency key before async callbacks. Taxonomy's `CATEGORY_INACTIVE` stable validation result is included in the declared issue union. Focused regression and strict test typing corrections have been authored/committed.
- **No validation has been rerun.** Current implementation state is implemented, verification pending. Historical CI #45586306936 on `ed685b0d` failed TypeScript (250 diagnostics); Lint and Flutter passed; downstream jobs skipped. This predates the five commits and must not be represented as current-head verification.
- Current next task: complete test-helper and call-site actor/context migration for the historic 227 TS2554 missing-argument errors without relaxing production service contracts. Then finish the G-002 static raw-SQL/FK/ownership/worker/CLI matrix. Tests and consolidated CI remain deferred until implementation/integration is complete.
- PR #152 OTP redaction merged at `a16a7ef6`; Actions #1507 passed. PRs #153–#156 remain draft/open; their exact-head Actions (#1523, #1548, #1547, #1541) completed successfully. Vercel build rate-limit previews are not application test results.
- Protected migration role is `postgres` with BYPASSRLS/CREATEROLE/CREATEDB; the live API runtime role is still unknown. The live access audit is 114 public table/partition relations, RLS disabled on all, zero policies; anon/authenticated have no direct DML on current relations but excessive TRUNCATE/MAINTAIN/REFERENCES/TRIGGER grants; postgres/supabase_admin defaults differ. No DB writes, RLS, grants, migrations, Render changes/deploys, worker activation, business workflows, PR #138 merge or release performed.

## 25 November 2026 — verified staging identity, CI and worker audit update

- PR #142 (safe runtime database identity diagnostic) is merged into `develop` at `9530d87b3aa26efce5b5692b6bc575d899f8c716`. Its CI run #44953735602 completed successfully: lint/typecheck/format, Flutter, disposable full migration apply, integration tests, E6, unit/coverage, Web/Admin tests, container smoke, contract/codegen and build all passed. k6 smoke and protected staging release were skipped by workflow conditions.
- Render staging deployment `dep-dc3blvcipgvc7387balg` is LIVE on `develop` at that SHA. Startup diagnostic confirms API `session_user=postgres`, `current_user=postgres`, database `postgres`, superuser=false, BYPASSRLS=true, CREATEROLE=true, CREATEDB=true, and `pg_stat_ssl.ssl=false`. The API is therefore using the same highly privileged identity as the migration runner; RLS cannot isolate requests under this identity. The API connection is not using PostgreSQL TLS in this observed session.
- Render service remains one Frankfurt instance, `develop`, auto-deploy disabled, start command `pnpm --filter @scs/api start:prod`. Production start runs `node dist/main`; migrations/RBAC seed are separate release workflow operations, not API startup.
- Current startup logs confirm these in-process workers are registered: OutboxDispatcher (1s), AutoCompleteWorker (60s), ShippingCarrierWorker (5s), CarrierTrackingPoller (10m default), CarrierReconciliationService (10m default plus cancel cycle), and P13MonitorService (60s). ReturnExpirationWorker is disabled because `P13_WORKER_ENABLED` is unset. No separate Render worker/cron service was found in the inspected workspace.
- Worker safety finding: OutboxDispatcher currently selects all PENDING outbox rows, logs each as dispatched, and marks it DISPATCHED without publishing to an event bus. ShippingCarrierWorker independently claims `shipping.carrier.*` events from the same outbox table. Because the generic dispatcher has no event-type exclusion, it can consume carrier events before the carrier worker. AutoCompleteWorker is active and mutates eligible DELIVERED orders to COMPLETED. Carrier tracking/reconciliation pollers are active and can call configured carrier providers. Do not run controlled business workflows until these registrations and dispatch ownership are made explicit.
- OTP source finding: develop's OtpDeliveryService logged provider `errorReason`, raw exception messages, recipient subject, provider message IDs and correlation IDs. Focused remediation plus regression tests are now isolated in PR #152: https://github.com/nabeel2323/scs-platform/pull/152. PR #152 is open; no GitHub Actions run is visible yet (Vercel checks are green). Do not merge until GitHub CI runs and passes. Sampled Render OTP logs from 22–25 Nov did not contain a six-digit OTP value, but that does not negate the earlier exposure report; verify after the source fix is deployed.
- No database grants, default ACLs, migrations, RLS policies, fixtures or business records were changed. Do not apply migration 0070 or enable RLS until a dedicated non-owner/non-BYPASSRLS API identity, transaction-context coverage, object ownership and rollback-safe migration plan are complete. Do not change Render environment/configuration or worker flags without separate explicit authorization.
- Current main remediation PR #138 remains OPEN/DRAFT/UNMERGED and is 1 commit behind develop, 2,715 commits ahead with a very large diff. Do not merge it as a single unit. Continue by splitting verified, bounded remediation slices into clean PRs targeting develop.
- Next: obtain CI for PR #152; continue worker registration/dispatch hardening in a clean branch; prepare a dedicated runtime DB role and TLS plan plus full per-table RLS/transaction-context design. Keep staging database mutations on hold until the API identity transition is safely prepared and explicitly coordinated with the service configuration.

---


## 25 November 2026 — staging access-control, OTP and worker audit

A read-only Supabase catalog/privilege audit found 114 public table/partition relations (113 ordinary + 1 partitioned), all with RLS disabled and zero policies. Existing effective grants: anon/authenticated have no SELECT/INSERT/UPDATE/DELETE on the 114 relations, but each has TRUNCATE, MAINTAIN, REFERENCES and TRIGGER on all 114. service_role has BYPASSRLS and the same non-DML privileges; postgres owns all public relations and has BYPASSRLS. authenticator can SET ROLE to anon/authenticated/service_role. Postgres default ACL reproduces the excessive anon/auth grants; supabase_admin default ACL additionally grants full DML for objects it creates. The Supabase SQL tool's current_user is postgres and is not proof of API runtime identity.

The live migration ledger has 69 entries and matches develop's 69 migration files; remediation branch has 75 files (0070–0075 pending). Migration 0070 addresses anon/auth current/default grants and normalize_arabic search_path but does not address supabase_admin defaults. No migration, grant, policy, RLS, or data changes were applied. Full details are in docs/remediation/STAGING-ACCESS-CONTROL-OTP-WORKER-AUDIT-2026-11-25.md.

OTP source trace: deployed SHA 9f5bc397/develop OtpDeliveryService logs raw provider exception.message, and also logs request.subject/result.errorReason. IdentityService and provider logger paths otherwise use masked values/no OTP. A local patch/test file is prepared at /mnt/data/otp-log-redaction.patch; not applied, committed or deployed. Fresh Render logs remain unverified.

Worker source inventory shows OutboxDispatcher, ShippingCarrierWorker, CarrierTrackingPoller, CarrierReconciliationService, AutoCompleteWorker and P13MonitorService start inside the API process; ReturnExpirationWorker is gated by P13_WORKER_ENABLED. OutboxDispatcher logs then marks non-shipping events dispatched without a real event-bus publish. Render runtime settings/flags and cron jobs require a fresh read-only check. Auto-complete currently emits realtime before actor transaction commit; follow-up needed.

Orders checkout now supports canonical products whose selected seller offer supplies store ownership, while validating product/offer/variant/store relationships and cart conversion CAS. Tests authored, not executed. No formatter/lint/typecheck/E6/CI.

## 25 November 2026 — continuation update

Read-only Render inspection confirms one Frankfurt web service on develop with auto-deploy disabled and start command `pnpm --filter @scs/api start:prod`; migrations/seeds are performed only by the separate mutating release workflow. The live SHA is `f74eb588`. OutboxDispatcher and AutoCompleteWorker register; ReturnExpirationWorker is disabled because `P13_WORKER_ENABLED` is unset. No separate Render worker/cron service or Render Workflow was found. No runtime DB identity was logged.

OTP delivery logs on 22–23 November showed masked recipients but included provider message IDs and correlation IDs. Source commit `ed685b0d0c9a1dd8e28009fa8fc208b766540061` removes these identifiers and provider error text from OTP logs and adds direct provider failure/exception regression specs. Tests remain unexecuted and the source is not deployed.

The user explicitly authorizes staging database changes needed for first production launch; no production database has been provisioned/deployed. API and migration runtime identities are still unknown, so no RLS/grant/default-ACL/migration change has yet been applied. The protected read-only database audit remains the next evidence gate.

## 25 November 2026 — protected audit result (10:01 UTC)

Protected read-only workflow [#45590012595](https://github.com/nabeel2323/scs-platform/actions/runs/45590012595) passed on branch head `2e7ac31011eac303c45acadec4d839d02f63f2ec`. The workflow connects through `STAGING_DATABASE_URL`, also used by the release migration runner. Its exact login/effective identity is `postgres` on PostgreSQL 17.6; superuser=false, BYPASSRLS=true, CREATEROLE=true, CREATEDB=true. Treat this as the staging migration credential identity, not proof of the Render API runtime identity.

The live database recheck confirms 114 public table/partition relations plus one sequence, all owned by postgres; RLS enabled=0 and policies=0. anon/authenticated/service_role have no effective SELECT/INSERT/UPDATE/DELETE on the existing 114 relations, but each has TRUNCATE/MAINTAIN/REFERENCES/TRIGGER on all 114. postgres default ACLs reproduce those non-DML grants. supabase_admin default ACLs additionally grant full DML and other privileges to anon/authenticated/service_role for future objects it creates. Direct catalog checks therefore do not support saying existing application tables are currently directly readable/writable through anon/authenticated; the excessive privileges/default ACLs and missing RLS remain critical defense-in-depth findings.

The live `public._migration_log` has 69 applied migrations through `0069_organization_onboarding_permission.sql`; migrations 0070–0075 on PR #138 remain pending. Migration 0070 revokes anon/authenticated privileges and pins `normalize_arabic` search_path, but does not address supabase_admin defaults or service_role. No database changes were made.

Render inspection reconfirms the API is on `develop` SHA `f74eb588`, auto-deploy disabled, one instance. Runtime identity diagnostics exist in PR #138 source but are not deployed; no API runtime identity log was found. Actual API `DATABASE_URL` role remains unknown. PR #138 remains draft/open/unmerged. Do not enable RLS or apply 0070 until API runtime identity, transaction-bound context coverage, and a reviewed migration/rollback plan are complete. The user authorizes staging DB changes but not Render deployment/configuration changes or bypassing the protected staging gate.


## 25 November 2026 — live continuation checkpoint (PR #138 head 16846152af71524f29047b704159f52ab0d73e75)

- Repository: `nabeel2323/scs-platform`; PR #138 branch `remediation/phase-0-1-tenant-security`, base `develop`; PR remains OPEN / DRAFT / UNMERGED and mergeable=false.
- Exact PR head: `16846152af71524f29047b704159f52ab0d73e75`, latest commit `test(catalog): scope independent P6 suites to persisted store principals [skip ci]`. It adds three scratch PostgreSQL test files under `apps/api/src/__tests__/scratch/`; these are authored source, not executed evidence.
- Current PR diff: 1,927 changed paths, 103,324 additions and 414,491 deletions. 1,277 paths are under `.m73b6-scratch/`. The branch comparison is 2,742 commits ahead / 3 behind current `develop`; no GitHub Actions run is associated with the exact current head. Historical run #45586306936 on earlier commit `ed685b0d0c9a1dd8e28009fa8fc208b766540061` failed TypeScript with 250 diagnostics, including 227 TS2554 call-site errors; its result is not evidence for current head.
- The preservation ref `preservation/pr138-remediation-2026-11-25` was safely fast-forwarded from `14f9871d40b2e6e88c1cffe480c3751e9393c597` to `16846152af71524f29047b704159f52ab0d73e75` using an expected-SHA check. It is now identical to the PR head. Preserve both refs; do not reset, force-push, delete or wholesale-merge.
- Extraction overlap audit against PR #138: PR #144 overlaps 7/7 files; #154 overlaps 9/13; #153 overlaps 6/10; #151 overlaps 5/12; #150 overlaps 1/2; #156 overlaps 1/3; #155 overlaps 0/1. PR #145 has no same-path overlap but collides by migration number 0070. These overlaps require file-by-file reconciliation, not wholesale merge.
- A token-named path appears in the PR changed-file inventory, but a direct current-branch content lookup did not resolve it. Treat its status as unresolved; do not print, copy, or extract any token-like artifact. Exclude scratch/test artifacts from release extraction unless independently reviewed and deliberately relocated.
- Next implementation task remains G-002 actor-context test-fixture migration: use the historical TS2554 inventory only as a starting index, re-check each current callsite/signature on the current head, and supply explicit verified actors/roles/tenant scope/operation arguments. Never weaken required production method signatures to satisfy tests. Continue raw SQL/function/trigger/partition, ownership predicate, FK ownership, worker/bootstrap/CLI principal, and actor-context nesting inventories.
- CI budget rule: group related implementation, tests and docs; no workflow per small edit. Keep [skip ci] while implementation remains in progress. Run one consolidated full CI after the implementation/integration batch is complete. A skipped or historical job is never a pass.
- Related PR status at this checkpoint: #152 merged; #153/#154/#155/#156 remain open drafts. PR #154's latest code/test batch is being verified separately on its own branch; its lease implementation must be reconciled with the overlapping PR #138 copy before integration. No PR #138 item is discarded or treated as integrated merely because another PR overlaps.
- No merge, database write/migration, grant/RLS/role/default-ACL change, Render configuration/deploy/restart, worker activation, credential rotation, production provisioning or business workflow occurred.


## Follow-up source-diff reconciliation — 25 November 2026

The historical TypeScript failure inventory was rechecked against current source history. Comparing failed head `ed685b0d0c9a1dd8e28009fa8fc208b766540061` with the code head `16846152af71524f29047b704159f52ab0d73e75` shows 34 commits and 52 changed files; importantly, all 41 files that contained historical compiler diagnostics have subsequent changes. Inspected current examples show actor-aware helper wrappers and explicit caller fixtures in the large Phase 1/2, P6, optimistic-locking and independent-runtime suites. Therefore the historical 227 TS2554 count is not a current error count and must not be blindly replayed. No current typecheck has been run, so the result remains IMPLEMENTATION_UPDATED / VERIFICATION_PENDING, not verified.

Next source-only work should review the changed fixture semantics without weakening security, then advance the remaining G-002 inventory: raw SQL/function/trigger/partition access, per-operation ownership predicates, FK-to-ownership crosswalk, worker/bootstrap/CLI principals, and actor-context nesting/reuse. Defer the consolidated verification campaign until implementation/integration is complete. The current code head remains the source checkpoint; later project-memory commits are documentation-only.


## 25 November 2026 — fresh Render runtime identity confirmation

Read-only Render inspection confirmed the deployed `scs-api-staging` service is on `develop`, with latest successful deployment `fde20420bbb759d2e562f9ff747c9e824ac58e25` at 12:06:17 UTC. Five API-process `DatabaseService` diagnostics between 10:21 and 12:30 UTC consistently report `session_user=postgres`, `current_user=postgres`, database `postgres`, `superuser=false`, `BYPASSRLS=true`, `CREATEROLE=true`, `CREATEDB=true`, and `ssl=false`. This confirms the actual API runtime role and TLS state, not merely the Supabase management connection. No environment values were retrieved or changed.

This is a hard RLS blocker: the API uses the table-owning `postgres` role with BYPASSRLS, so RLS would not constrain it. The database connection also has TLS disabled. The current DatabaseService only enables verified TLS when `PGSSLROOTCERT` is mounted. Migration-runner identity remains unverified; the protected read-only `db-access-audit.yml` workflow has not been dispatched. See `docs/remediation/STAGING-API-RUNTIME-ROLE-AND-TLS-REMEDIATION-PLAN-2026-11-25.md` for the least-privilege role/TLS rollout. No DB role/grant/RLS/migration, Render configuration, deployment, worker activation or production action occurred.


## Code-side fail-closed guard implemented — 25 November 2026

The PR #138 source branch now includes a fail-closed database startup guard (not deployed):

- `env-gate.ts` adds `resolveDeploymentNodeEnv`; a Render `RENDER_SERVICE_ID` forces production-like validation even if `NODE_ENV` is missing, `development` or `test`. JWT, OTP HMAC, bootstrap-owner, database and Redis config gates use the resolved environment; Render cannot accidentally run development secret fallbacks or development auto-migrations.
- `DatabaseService` enables verified TLS for production-like/Render services. If `PGSSLROOTCERT` is mounted it uses that CA with `rejectUnauthorized=true`; otherwise it uses Node's system trust store with verification enabled.
- Before the API accepts traffic, the runtime identity diagnostic now fails closed if identity cannot be read, TLS is not active, session/effective roles differ, either role is superuser/BYPASSRLS/CREATEROLE/CREATEDB, or the effective role owns the public schema or any public table/partition.
- Source commits: `eba273b7b88a2c374dd8694eb0137bc4d0ec2117`, `a22962612a3a59e93e12d20283bcd34dbe99852c`, `4e387fcf38629669c22e7af7d1fd99adf4a470af`, `3f19eb709558dfb5ccb52111a7ae9af4c45159bc`, `1e3b65f02b39648fdc1bb5af46ba78583533e53c`.
- Tests/typecheck/CI have not been run for this source batch. It remains implementation-in-progress; do not merge or deploy based on source review alone.
- The currently deployed staging API remains on develop SHA `fde20420...` and continues to report `postgres`, `BYPASSRLS=true`, `ssl=false`. The new guard is not deployed. Deploying it before the dedicated runtime role is provisioned will intentionally fail startup. Do not deploy until the role and TLS secret-file configuration are ready.
- No database role/grant/RLS/migration or Render environment setting has been changed. The user authorized staging DB changes, but Render environment changes remain unapproved.


## 26 November 2026 — catalog import actor-context review

- Re-verified PR #138 OPEN/DRAFT/UNMERGED at `af29841dc9f6e9668bf3630a2bd609c61f96bd8b`, `develop` at `fde20420bbb759d2e562f9ff747c9e824ac58e25`, compare 2,805 ahead / 3 behind from merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`, preservation ref identical, and no exact-head Actions run. Only Vercel Web/Admin build-rate-limit statuses are present.
- Reviewed the catalog import controller routes, service methods and tenant DB interceptor. Authenticated import routes either use the interceptor or explicitly establish a short user actor scope; service DB phases are actor-scoped, while Redis/object storage/XLSX parsing/CSV serialization remain outside DB transactions. No missing actor context was identified in the reviewed import route set.
- Several service methods rely on their current controller call sites to provide context (`updateImportMapping`, `cancelImport`, `retryFailedJob`, `getImportJob`, `getChunks`); preserve this contract and test any future non-controller caller.
- This was source review only. No code or external state was changed; no tests/typecheck/build/CI were run. Continue the broader catalog and worker call-graph audit before declaring G-002 complete.


## 26 November 2026 — worker/order completion review

- Reviewed PR #138 auto-completion actor-context lifecycle, OrdersService completion and overlaps with #153/#154. Confirmed lease release executes inside the surrounding worker actor scope; no production worker code change needed.
- Fixed the auto-completion worker unit-test double to model DatabaseService.withActorContext and assert database execution, completion and lease release occur inside the worker principal. Commits: `983acb6b5a87c52a21a905745cf404d6c785c47f`, `82998dd808f5800ccfb7c354a373ef63bdf06bf4`, `7b98f58532c66c005c6a3089f9da72e1bc32d495`. Tests were not run.
- Integration decision reaffirmed: #154 atomic completion/lease-fenced service logic plus #138 worker actor context; retain one migration 0071. #153 safe outbox behavior is canonical; do not extract #138 log-only dispatcher. #154 exact-head Actions has no run; #153 has a passing exact-head CI run.
- No worker activation, DB/migration/provider/deployment side effect occurred. Continue remaining worker/DB access audit, then assemble bounded G-002 slice before one consolidated CI campaign.


## 26 November 2026 — final worker-test typing cleanup

- Replaced explicit `any[]` in the auto-completion worker test mock with `unknown[]`; behavior and assertions are unchanged. Commit: `2c412732dbbbbde742d43e60f5d2593552aea3cb`.
- This remains unexecuted source/test authoring. No test runner, typecheck, formatter, build or CI was run.


## 26 November 2026 — migration sequence reconciliation

- Resolved the PR #138 / PR #145 migration-0070 collision in the preserved source: kept PR #138's broader privilege/default-ACL hardening migration and added PR #145's explicit postcondition assertion for `normalize_arabic` search_path. Use one canonical 0070; exclude PR #145's standalone duplicate from extraction.
- Confirmed migration runner uses a session advisory lock and per-file transaction with ledger insert; dry-run only checks nonempty SQL and is not SQL validation. 0071 is duplicate DDL with #154 and must appear once. 0072–0075 remain unvalidated source-only migrations requiring isolated tests and data/rollback review.
- No migration or DB changes were executed. No grants/default ACL/RLS, deployment or worker changes occurred. No CI was run.


## 26 November 2026 — shipping/return worker lease-fencing correction

- Fixed a real stale-owner race in `ShippingCarrierWorker`: both success acknowledgement and failure/retry updates now require matching event ID, `PROCESSING` status and current `locked_by` worker. Commit `d18a495433460902190bec23d0d39923cc7b346a`.
- Added regression coverage for both finalization paths and corrected ReturnExpirationWorker, ShippingCarrierWorker and ReturnsService test doubles to model the production actor-context boundary. Commits `7009e69d`, `e90276f7`, `7fc543a5`, `2abac268`. Not executed yet.
- Source review confirmed return expiration uses a stable worker scope and a live lease lock plus repeated holder/epoch/expiry fence in the atomic return transition; carrier external I/O remains outside DB actor transactions. Generic log-only outbox dispatcher stays excluded in favor of PR #153 behavior.
- No tests/typecheck/build/CI or provider/storage/DB/migration/worker/deployment action occurred. Continue to the bounded G-002 extraction manifest; do not merge PR #138 wholesale.


## 26 November 2026 — latest worker and extraction checkpoint

- Fixed ShippingCarrierWorker finalization to require event ID + PROCESSING + current locked_by worker for both success acknowledgement and failure/retry state, preventing stale workers from overwriting reclaimed events. Commit `d18a495433460902190bec23d0d39923cc7b346a`.
- Added carrier finalization regression tests and repaired return/shipping worker actor-context test fixtures. ReturnExpirationWorker/ReturnsService call paths were reviewed; no further production change identified. Tests remain unexecuted.
- Added `docs/remediation/G-002-BOUNDED-INTEGRATION-MANIFEST-2026-11-26.md` defining bounded extraction slices, explicit exclusions, migration 0070–0075 dispositions and the deferred consolidated verification campaign.
- Current #138 inventory: 1,939 changed paths, 1,280 scratch, 659 non-scratch. The 659 non-scratch files are not all G-002; select only reviewed dependencies. PR #138 remains open/draft/unmerged and must not be merged wholesale.
- No tests/lint/typecheck/build/CI, DB/migration/grant/RLS change, worker activation, provider/storage call, bootstrap, deployment or merge occurred. Next: complete FK ownership and raw SQL/function/trigger/partition audit, then create bounded integration branches from refreshed develop.


## 26 November 2026 — FK ownership crosswalk progress

- Added `docs/remediation/G-002-FK-OWNERSHIP-CROSSWALK-2026-11-26.md` with reviewed shipping, carrier, payment-proof, return, settlement and reconciliation FK/ownership relationships and open gaps.
- Key independent-FK combinations need explicit service consistency checks (shipment order/store, carrier configuration org/credential/store, webhook credential/shipment, return order/payment, settlement order/payment/store). Reviewed guards exist in the named services, but full callsite and 75-migration crosswalk remains incomplete.
- Financial global reconciliation scope is intentional for platform roles only; `financialOrgScope` rejects non-platform HTTP callers without activeOrg. No tests or external side effects occurred.


## Final live checkpoint — 26 November 2026

PR #138 is OPEN / DRAFT / UNMERGED at `e410bf44b272eafb8e762636b66877f9e0c4b230`, base develop, mergeable=false. Preservation branch is identical (0/0). PR changed paths: 1,940 total (1,280 scratch; 660 non-scratch; not all non-scratch belong to G-002). Develop is `fde20420bbb759d2e562f9ff747c9e824ac58e25`; branch is diverged 2,852 ahead / 3 behind from `f74eb588cc58fc99b105e749d39dbfbacb4f9775`. Exact-head Actions has no runs; only Vercel Web/Admin build-rate-limit failures are reported. All newly authored worker tests remain unexecuted. Next: finish full migration/FK and raw SQL/function/trigger/partition inventory, refresh develop, create bounded integration PRs from the manifest, then one consolidated CI campaign.


## G-002 source audit — 26 November 2026

PR #138 remains open/draft/unmerged at `a56a6bbe70ea5ed03f40a4278072dd81b1df556c`; `develop` remains `fde20420bbb759d2e562f9ff747c9e824ac58e25`; preservation ref is identical. No exact-head Actions run exists. The G-002 FK crosswalk was extended with static review of migrations 0054, 0058, 0059, 0061 and 0070–0075 and related service paths. Important open checks: default ACLs for every object-creating role (0070), consumers of legacy webhook rows with NULL credential_id (0072), and cross-scope/cyclic/duplicate reconciliation history before 0074. The numbered migration set is 75 files; audit remains partial. No tests, CI, database operations, migrations, deployment or merge occurred. See `docs/remediation/G-002-FK-OWNERSHIP-CROSSWALK-2026-11-26.md` for evidence and next actions.


## G-002 audit progress — 26 November 2026 (foundational commerce schema)

Reviewed migration source for 0001–0006 and 0008–0011. The FK crosswalk now includes org/store mismatch candidates in business documents and verification requests; category/product/media; inventory variant/warehouse; pricing list/variant; cart item cart/store/variant; order item order/variant and buyer/store; and dispute/conversation participant/order links. These are pending service-callsite reconciliation, not confirmed defects. Migration 0007 and migrations 0012–0069 remain unreviewed in this migration-by-migration pass. Full audit is not complete. No tests or CI, DB operations, migrations, grants/RLS, deployment or merge occurred. See the G-002 FK ownership crosswalk.


## G-002 commerce service spot-check — 26 November 2026

Static review of Catalog, Inventory, Pricing, Cart and Orders service/controller paths found several positive ownership checks (category scope, variant↔warehouse store, variant↔price-list store, server-derived cart store/offer scope, checkout actor context). Remaining review is required for caller-optional inventory methods and internal callers, pricing methods relying on controller gates, cart ID helper exposure, checkout revalidation, and catalog update/import/media/category-parent paths. G-002 remains IN PROGRESS. No tests, CI, DB operations, migrations, grants/RLS, deployment or merge occurred. Details are in the FK ownership crosswalk.


## Current checkpoint — 26 November 2026

- PR #138: OPEN / DRAFT / UNMERGED; head `98694426f87ec3142042bbad221819968bdd5160`; 1,940 changed files; mergeable=false.
- `develop`: `fde20420bbb759d2e562f9ff747c9e824ac58e25`; source is 2,874 commits ahead / 3 behind; merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.
- Preservation ref `preservation/pr138-remediation-2026-11-25` is identical to source head using non-force expected-SHA updates.
- Exact-head GitHub Actions: no runs. Combined statuses: Vercel Web/Admin build-rate-limit failures only. No current CI verification.
- Static migration-reference inventory covers all 75 numbered migrations (183 explicit REFERENCES across 40 files). Service-level cross-column and raw SQL/trigger/partition consumer audit remains in progress.
- Newly reviewed concerns: analytics global event-count query must be platform-only or tenant-scoped; promotions redemption should verify order buyer/store against promotion; 0013/0018 partition retention and 0053 backfill need data/rollback preflight before migration approval.
- No tests, CI, database/catalog access, migration, grants/default-ACL/RLS change, provider/storage action, worker activation, bootstrap, deployment or merge occurred.


## Current checkpoint — 26 November 2026 (bounded integration started)

- PR #157 is the first bounded G-002 integration slice: `integration/g002-actor-context-foundation` → `develop`; head `e3bc1ba21d67ec4947824acf278529e543487eb1`; 17 files; OPEN / DRAFT / UNMERGED; mergeable=true at verification.
- PR #157 starts from `develop` SHA `fde20420bbb759d2e562f9ff747c9e824ac58e25` and retains develop-only runtime identity, OTP log redaction and outbox ownership commits. It contains no migrations, RLS, grant/ACL, DB role or deployment changes.
- PR #157 exact-head Actions: no runs; Vercel Web/Admin rate-limit failures only. No tests, lint, typecheck, build or CI run.
- PR #138 remains OPEN / DRAFT / UNMERGED and preserved separately; do not merge it wholesale.
- RBAC seed confirms `analytics:read` is assigned only to SUPER_ADMIN and ADMIN; the global analytics aggregate remains platform-admin scoped under seeded roles. Promotion redemption service-level order/store lineage remains a defense-in-depth follow-up.
- Next: review PR #157 source/dependency composition, then build Slice B from refreshed develop. Keep workers/webhooks and operator/migration paths separate; one consolidated CI campaign after integration assembly.


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
