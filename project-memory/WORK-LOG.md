## 26 November 2026 — live continuation checkpoint (latest PR #138 head `d1d9d8f570e21bf96f2853ce17a8b42aaed0b902`)

**Repository state freshly checked**
- PR #138 remains OPEN / DRAFT / UNMERGED, base `develop`, and GitHub reports `mergeable=false`. Current PR head: `d1d9d8f570e21bf96f2853ce17a8b42aaed0b902`; latest commit: `fix(config): enforce production gates on Render services [skip ci]` (implementation batch), followed by this documentation checkpoint when committed.
- Current comparison against `develop`: 2,776 commits ahead / 3 behind; merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`; current develop head `fde20420bbb759d2e562f9ff747c9e824ac58e25`. PR diff: 1,933 paths, 103,874 additions, 414,508 deletions. 1,277 paths remain under `.m73b6-scratch/`; three additional PostgreSQL suites are under `apps/api/src/__tests__/scratch/`. Do not merge this branch wholesale or extract scratch/token-like artifacts.
- Preservation branch `preservation/pr138-remediation-2026-11-25` was verified identical to the source branch at `6b17ae6e9e2b3810afabae42a2e049e550120e40` before this continuation's two grouped commits. Fast-forward it to the final updated source head using an expected-SHA check after the documentation checkpoint; never reset or force-push either branch.
- No GitHub Actions run is associated with the implementation head because the grouped implementation commit uses `[skip ci]`. The only reported status contexts on the preceding head were Vercel preview daily-quota failures; these are provider limits, not application CI results. Do not claim tests or CI passed for the new source changes.

**Implementation performed in this continuation**
- Reviewed the Render production fail-closed startup guard added in the preceding 33-commit source-diff batch. Found three configuration assertions still using raw `NODE_ENV`: OTP HMAC, bootstrap-owner email, and OTP delivery readiness. A Render service with `NODE_ENV=development` or unset could therefore still enter a development fallback path despite the new deployment-environment resolver.
- Fixed all three to use `resolveDeploymentNodeEnv(env)`. Added regression coverage for Render with `NODE_ENV=development` and missing `NODE_ENV`, while preserving local development behavior. JWT already used the resolver.
- Grouped source/test changes into commit `d1d9d8f570e21bf96f2853ce17a8b42aaed0b902` (`[skip ci]`): `env-gate.ts`, `otp-delivery-gate.ts`, existing `env-gate.spec.ts`, and new `otp-delivery-gate.spec.ts`.
- This is source-reviewed but **NOT TESTED / NOT CI-VERIFIED**. Continue implementation without running CI after small edits; run one consolidated validation campaign after the planned implementation/integration batch.

**Focused PRs and release sequencing**
- PR #153 current head `5294698d8db78e21df972e8ce6213f21237789fa`; its exact-head Actions run #1523 passed, but it remains OPEN / DRAFT pending independent review. Current Vercel preview status is a provider daily-quota failure.
- PR #154 current head `e421e21b1e66386a9d0c259fb83c99f1a05272cb`; no GitHub Actions run was found for this exact head. Earlier green runs apply only to earlier SHAs. It remains OPEN / DRAFT; review the newest PostgreSQL-backed worker-claim concurrency coverage and independent review before advancing it.
- PR #152 OTP redaction is already merged into `develop`; do not repeat it.
- `main` and `develop` are currently DIVERGED: `develop` is 11 commits ahead and 4 behind `main`, merge base `9f5bc397467dc92cdc8debd54797b6d730659c36`. Do not promote to `main` until the separate history divergence is reconciled deliberately.

**Next work**
1. Continue source-only G-002 actor-context and DB access-path review on the current PR #138 head; keep production method contracts strict and tests explicit about actor, role, tenant and worker principal.
2. Finish raw SQL/function/trigger/partition coverage, method-level ownership predicates, FK-to-ownership crosswalk, and worker/bootstrap/CLI actor-context boundaries.
3. Reconcile overlaps with #153/#154/#156 and migration 0070 before creating bounded extraction PRs from refreshed `develop`.
4. Preserve the staging safety boundary: no RLS/grant/default-ACL/migration changes, Render environment changes/deploy/restart, worker activation or business workflow until the documented identity, role/TLS, rollback and authorization gates are satisfied.

**CI budget rule reaffirmed:** local/targeted checks during implementation where a local checkout is available; group related source, tests and docs into cohesive commits; use `[skip ci]` while the implementation batch is in progress; one consolidated CI per completed workstream, then one final release-candidate campaign. Never represent skipped or historical checks as current passes.

---

## 25 November 2026 — verified continuation checkpoint (latest: `8e2c08953442a6d0f67568f0c5567898f7eb12e7`)

**Repository / PR state**
- Repository: `nabeel2323/scs-platform`; active remediation branch: `remediation/phase-0-1-tenant-security`; base: `develop`.
- PR [#138](https://github.com/nabeel2323/scs-platform/pull/138) is **OPEN / DRAFT / UNMERGED**. Its exact head is `8e2c08953442a6d0f67568f0c5567898f7eb12e7` (message: `fix(tests): align actor fixtures and mock row types [skip ci]`). Current comparison: **2,725 commits ahead / 3 behind** `develop`; PR reports 1,909 changed files. Keep this historical remediation PR draft and unmerged; never merge the entire branch.
- No GitHub Actions run is associated with the current head because implementation commits deliberately use `[skip ci]`. Do not trigger tests/CI during implementation.

**What changed in this continuation**
Five skip-CI commits were added after the previous handoff:
1. `bc87ecee41ae0f6f42fe8d2fb393d3c36e642ec6` — capture checkout idempotency key for strict optional narrowing; fail closed on missing/invalid merchant actor in accept/partial-accept/reject; propagate the same verified actor into order auto-advance; add `CATEGORY_INACTIVE` to the taxonomy publish-issue union.
2. `ee083c03df259b37d44e17308d4d1948d3aba6d6` — add missing-caller rejection and inactive-category validation regression source.
3. `8525fa7dee81c11aab0b3da69fc0c044372f8e2f` — fix Drizzle `SQL` type imports and strict index-signature access in three unit specs; correct a publish-validation mock contract.
4. `8e8ce34dad2db1cbc3fef9ecaee55a37e588b5fc` — correct more Drizzle type imports and optional mock-call access.
5. `8e2c08953442a6d0f67568f0c5567898f7eb12e7` — complete actor-context/JWT/mock strict-typing corrections in three catalog/shipping specs.

Status is **IMPLEMENTATION_UPDATED / VERIFICATION_PENDING**. These source changes and regression tests are committed, but no tests, typecheck, lint, formatter, local build, Actions or preview verification has been run on these commits. Do not describe the historical typecheck as fixed or passing.

**Current CI evidence (historical vs exact head)**
- Historical run #45586306936 / CI #1505 was on `ed685b0d0c9a1dd8e28009fa8fc208b766540061`: lint passed; API TypeScript typecheck failed with 250 compiler diagnostics (227 TS2554 missing required arguments across legacy tests, plus strict test typings, four Orders optional-idempotency narrowing errors and one taxonomy error-union mismatch); Flutter analyze/tests passed. Dependent API unit/coverage, PostgreSQL integration, migrations, E6, Web/Admin, build/container, contract/codegen, k6 and staging release jobs were skipped. This is not a result for the current head.
- PR #152 OTP log redaction is now **MERGED** into `develop` at `a16a7ef6db3c57b2e335757cbf2897ceede5d199`; its exact-head Actions run #45598306657 / CI #1507 completed successfully. Do not repeat its implementation.
- PRs #153 (outbox delivery), #154 (order completion atomicity), #155 (staging audit documentation), and #156 (HTTP request-log redaction) remain OPEN/DRAFT. Exact-head Actions runs #1523, #1548, #1547 and #1541 respectively completed successfully. Vercel preview build-rate-limit statuses are provider limits, not application test failures; protected staging release jobs are not approval/deployment evidence.

**Next implementation task**
Continue the G-002 actor-context conversion of legacy unit/integration/scratch test call sites to satisfy the now-required authenticated principal and method-specific parameters. The historical run identified 227 TS2554 call-site errors over many test files; the source/API security signatures must remain required—do not weaken them merely to make fixtures compile. Use the error inventory in the 25-Nov run #45586306936 and update test helpers to supply explicit, valid actors, roles, tenant scopes and operation parameters. Then continue the outstanding G-002 source inventory: raw SQL/function/trigger/partition paths, complete per-operation ownership predicates, FK-to-ownership crosswalk, worker/bootstrap/CLI principal coverage, and actor-context nesting/reuse. Defer all test execution and consolidated CI until planned implementation and integration are complete, per the standing user decision.

**Staging / release gates remain closed**
- The protected migration credential is `postgres` with `BYPASSRLS`, `CREATEROLE`, and `CREATEDB`; this is **not** proof of the live Render API `DATABASE_URL` identity. The actual API runtime identity on the inspected live service remains unknown.
- Latest catalog evidence: 114 public table/partition relations, 0 RLS-enabled, 0 policies. `anon`/`authenticated` have no direct DML on existing relations but retain excessive `TRUNCATE`, `MAINTAIN`, `REFERENCES`, `TRIGGER` privileges; `postgres` and `supabase_admin` defaults differ. Do not claim direct existing-table DML exposure without new evidence.
- No staging database writes, grant/default-ACL/RLS/migration changes, Render config/deploy/restart, worker activation, business workflows, production DB provisioning, PR #138 merge, protected approval or release occurred. Preserve migration ledger and data.
- Do not apply 0070–0075 or enable RLS until the real API/migration identities, ownership/default-ACL authority, full actor-context access map and rollback-reviewed migration-only path are complete and the protected approval is granted.

Read the existing decisions, handoff, audit and tracker below before making the next change. Preserve the implementation-first, no-CI rule and all independent-review/release gates.

---

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


## 25 November 2026 — checkout correction and staging access/worker audit

Orders checkout correction:
- Canonical products may have storeId=null; a selected active seller offer supplies the cart line store. Checkout now validates offer store/product and optional variant scope, while merchant-owned products must match the line store.
- Added regression coverage for product-level and variant-level seller offers, store mismatch, active-cart conversion CAS failure, and verified actor fixtures.
- Tests remain unexecuted; no formatter/lint/typecheck/E6/CI.

Read-only Supabase audit:
- 114 public table/partition relations, 0 RLS enabled, 0 policies.
- anon/authenticated: no SELECT/INSERT/UPDATE/DELETE on existing public relations, but TRUNCATE/MAINTAIN/REFERENCES/TRIGGER on all 114. service_role also has BYPASSRLS and those non-DML privileges. postgres owns all relations and has BYPASSRLS.
- postgres default ACL repeats anon/auth non-DML grants; supabase_admin default ACL grants full DML for objects it creates. postgres cannot SET ROLE to supabase_admin.
- 32 public functions, none SECURITY DEFINER; normalize_arabic mutable search_path; pg_trgm in public; 0 non-internal triggers.
- pg_partman 5.3.1 analytics_events retention 12 months, but no pg_cron extension/job, partman BGW config, or scheduled GitHub workflow found.
- Supabase advisors: 55 unindexed FKs, 271 unused indexes, 1 no-PK finding referencing a relation absent from live public catalog.

Migration boundary:
- Live ledger 69; develop has 69 migrations; remediation branch has 75 (0070–0075 pending).
- 0070 addresses anon/auth grants and normalize_arabic search_path, but supabase_admin default ACL remains an ownership question.
- No SQL writes, RLS/grant changes, migrations, seeds, or staging actions.

OTP source trace:
- deployed SHA 9f5bc397/develop OtpDeliveryService catch logs raw error.message; service also logs subject and errorReason. IdentityService/provider logs otherwise avoid OTP values.
- Prepared local patch with service-level log regression tests: /mnt/data/otp-log-redaction.patch. Not applied, committed, or deployed. Actual Render logs still need verification.

Worker/deployment source audit:
- OutboxDispatcher, ShippingCarrierWorker, CarrierTrackingPoller, CarrierReconciliationService, AutoCompleteWorker, P13MonitorService start in API process. ReturnExpirationWorker gated by P13_WORKER_ENABLED.
- Generic OutboxDispatcher marks non-shipping events dispatched after logging only; no event bus call.
- OrdersService.completeOrder emits realtime inside actor transaction.
- Render live service config/logs/flags and cron jobs not freshly verified. Release workflow is mutating; db-access-audit workflow is read-only and staging-protected.

## 25 November 2026 — Render runtime audit and OTP log redaction

Read-only Render inspection confirmed one Frankfurt `scs-api-staging` service on `develop`, auto-deploy disabled, one instance, and start command `pnpm --filter @scs/api start:prod`. The separate release workflow performs migrations, RBAC seed, and deployment. Logs show OutboxDispatcher polling registration (1s), AutoCompleteWorker registration (60s), and ReturnExpirationWorker disabled because `P13_WORKER_ENABLED` is unset. No separate Render worker/cron service or Render Workflow was found. No environment values, service configuration or secrets were changed.

Three historical OTP delivery success logs contained masked recipients plus provider message IDs and correlation IDs. The deployed SHA is still `f74eb588`; no runtime update occurred. Source commit `ed685b0d0c9a1dd8e28009fa8fc208b766540061` removes recipient, provider errorReason, provider message ID, correlation ID and raw exception information from OTP delivery logs. Direct service-level regression specs cover provider failure and thrown provider exceptions with synthetic secrets. Tests remain unexecuted.

The user explicitly authorized necessary staging database changes for the first production launch; no production DB is provisioned/deployed. No staging DB writes were made because actual API/migration identities and the `supabase_admin` default-ACL ownership path remain unverified.

CI #45586306936 was unintentionally triggered by the source commit (missing skip-CI marker): lint passed, typecheck failed with 250 diagnostic lines, Flutter passed, and downstream jobs were skipped. No rerun will occur during implementation. The diagnostics are recorded for the implementation backlog.

## 25 November 2026 — protected database audit completed

- User clarified that the connected Supabase project is the only current SCS database, the API connects to it, and no production database exists. User explicitly authorized necessary staging-only database schema, privilege, default-ACL, RLS, migration and controlled fixture/data changes. This does not authorize production provisioning, Render deployment/configuration changes, worker activation, business workflows or bypassing the protected staging approval.
- Read-only database audit workflow [#45590012595](https://github.com/nabeel2323/scs-platform/actions/runs/45590012595) passed on PR #138 head `2e7ac31011eac303c45acadec4d839d02f63f2ec`. It uses `STAGING_DATABASE_URL`, also used by the release migration runner. Observed identity: session/current role postgres, PostgreSQL 17.6, superuser=false, BYPASSRLS=true, CREATEROLE=true, CREATEDB=true. This establishes migration credential identity only.
- Live SQL recheck: migration ledger has 69 entries through 0069; 114 public table/partition relations plus one sequence, all owned by postgres; 0 RLS-enabled tables, 0 policies. anon/authenticated/service_role have no effective DML on current relations but retain TRUNCATE/MAINTAIN/REFERENCES/TRIGGER on all 114. postgres default ACL repeats non-DML grants; supabase_admin defaults include full DML and other privileges for objects created under that owner.
- Evidence correction: Supabase advisor wording suggested all rows were directly exposed to anon/authenticated, but direct effective privilege checks found SELECT/INSERT/UPDATE/DELETE = 0 across existing relations. Do not claim current direct table DML exposure; retain the excessive grants/default ACL and no-RLS findings.
- Render read-only inspection: one `scs-api-staging` service on develop, deployed SHA `f74eb588`, auto-deploy off, one instance. API runtime identity log absent; PR #138 already contains safe non-secret startup identity diagnostics but has not been deployed. Actual Render `DATABASE_URL` identity remains unknown.
- No database grants, default ACLs, policies, RLS, migrations, seeds or data were changed. Do not apply 0070 or enable RLS until API runtime identity, actor-context coverage and migration/rollback path are verified. Existing release workflow also seeds and deploys; do not dispatch it as a DB-only operation.


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


## 25 November 2026 — current-source actor-context reconciliation

This source review supersedes the earlier 24-November statements that ReturnExpirationWorker, ShippingCarrierWorker and realtime socket authorization were unwrapped. Current PR #138 code now shows:

- `ReturnExpirationWorker` uses a dedicated worker principal for lease acquire/renew/fence, pause checks, claim SQL, each per-return processing operation, alerting and cycle recording. It scopes per item rather than wrapping the whole batch, preserving lease/fencing behavior.
- `ShippingCarrierWorker` has a `withWorkerContext` wrapper around its database-only lease recovery, claim, shipment/credential lookup, persistence and acknowledgement operations. Provider HTTP and storage operations remain outside database transactions; tenant organization context is supplied where derived from authoritative shipment/store/credential rows.
- `RealtimeGateway` uses a verified socket-user actor around store/order room authorization queries after connection authentication; room membership still requires permission plus the relevant ownership/membership/assignment checks.
- `P13MonitorService`, `OpsAlertService`, `OpsControlService` and `PilotControlService` use explicit worker/system/user/audit scopes for their database operations. `IdentityService` uses operation-specific authentication contexts for OTP, email OTP, password login, refresh and logout. `ProfileController`, `OrdersController` and `PaymentsController` select the scoped tenant interceptor for authenticated routes.
- `OrdersService` and `PaymentsService` also establish explicit user/worker scopes at their internal operation boundaries; service methods that rely on an enclosing verified HTTP/worker scope must be reviewed for every non-controller callsite.
- Catalog import's DB-only phases use caller context; object storage, workbook parsing/generation and other external I/O remain outside actor transactions.

This is static source evidence only. No tests or CI were run for PR #138 during this review. Do not infer that all 53 candidate paths are fully proven: the remaining work is a complete cached-handle/detached-task/nested-scope audit, method-level table/operation/ownership predicate review, FK cross-column consistency, and protected live API/migration identity plus relation-kind inventory. The historical 114 public relation snapshot, current 100 pgTable declarations and unexplained 116 count remain distinct. No RLS, grants, migration, shared/staging database or deployment action occurred.


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
