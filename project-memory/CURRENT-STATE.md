## Live checkpoint — 26 November 2026 (migration collision reconciled; no application performed)

- PR #145 (G-020) exact head `b3625d390f30794d331c8d74d6f5b3b8a828b058` passed Actions run #1012 (`44708242986`). It changes one file: narrow `0070_normalize_arabic_search_path.sql`. Compared with current develop `fde20420bbb759d2e562f9ff747c9e824ac58e25`, branch is 2 ahead / 3 behind (merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`); keep draft and revalidate/rebase only when ready for review.
- PR #138's `0070_public_access_and_function_search_path_hardening.sql` collides by sequence with #145's 0070 and combines G-020's same function-local search_path hardening with broad revokes of anon/authenticated table/sequence grants and default ACL changes. The two 0070 migrations MUST NOT both be installed. Canonical G-020 is the narrow, CI-passed PR #145 migration 0070. If G-002 grant/default-ACL remediation is separately approved after actual API/migration roles and access requirements are verified, extract it as a separate correctly sequenced migration; do not import its grant changes now.
- PR #138's `0071_auto_complete_claim_leases.sql` and PR #154's `0071_auto_complete_claim_leases.sql` implement the same two nullable lease columns and partial claimable-order index (only comment wording differs). Keep PR #154 as the canonical tested implementation; do not apply duplicate migration 0071 from #138.
- PR #154 exact head `0faaac932faffd6ccc26c8c6fd8df2bcc660ffd4` passed Actions #1549, all ten executable jobs. PR #145 exact head passed #1012. Both remain draft/unmerged pending independent review and proper migration ordering. No staging/shared DB write, migration, grants/default-ACL/RLS change, Render change, worker activation, deployment or release occurred.
- PR #138 remains OPEN / DRAFT / UNMERGED, 1,943 changed files, non-mergeable; protected source/evidence only. Never wholesale merge it. Preserve expected-SHA synchronization between this memory branch and `preservation/pr138-remediation-2026-11-25`.

---

## Live checkpoint — 26 November 2026 (bounded PR validation inventory)

- G-002 foundation PR #157: exact head `435b3fc1c44cb12784da3b72157b0b25f66e0b8d`; Actions run #1572 passed all 10 mandatory jobs. OPEN / DRAFT / UNMERGED, base `develop`, independent review still outstanding.
- G-002 identity PR #158: exact head `703b9d49f27a67dfdd02eb47ed925b3244bc8b8f`; Actions run #1576 passed. Base restored to PR #157 branch; verified 19 commits ahead / 0 behind and exactly six identity/test files. OPEN / DRAFT / UNMERGED, mergeable true; independent review outstanding.
- PR #153 outbox placeholder-dispatch safety: exact head `5294698d8db78e21df972e8ce6213f21237789fa`; prior exact-head Actions run #1523 passed all substantive jobs. OPEN / DRAFT / UNMERGED, mergeable true; independent review outstanding.
- PR #154 order-completion atomicity + durable auto-completion lease: exact head `0faaac932faffd6ccc26c8c6fd8df2bcc660ffd4`; Actions run #1549 (`45700713258`) completed SUCCESS. All 10 executable jobs passed, including integration, full disposable migration apply, coverage, container smoke, build and codegen; k6 and staging release were skipped. OPEN / DRAFT / UNMERGED, mergeable true. Migration 0071 remains unapplied and must be sequenced after independent migration 0070/PR #145; no staging mutation or worker activation.
- PR #155 read-only staging security/access-control audit: exact head `47c8ea7737d45128c5acc57a0d79017d7e8db165`; Actions run #1547 (`45670997394`) passed. OPEN / DRAFT / UNMERGED, mergeable true.
- PR #156 HTTP response-cookie/webhook-token/signature log redaction: exact head `e158c505f8f4758cce4e825cf4ea2dae52051ba4`; Actions run #1541 (`45669270709`) passed. OPEN / DRAFT / UNMERGED, mergeable true.
- All six bounded PRs above still lack independent review. GitHub rejected CODEOWNERS team requests because the teams are not collaborators on this personal repository. Do not self-approve or merge. Reviewer membership must be fixed or valid individual reviewer usernames supplied.
- PR #138 remains the protected source/evidence branch, OPEN / DRAFT / UNMERGED, 1,943 changed files, non-mergeable. Never wholesale merge it. The project-memory branch and preservation branch are synchronized at this commit line; continue expected-SHA fast-forward only.
- No staging/shared DB writes, migrations, grants/default-ACL/RLS changes, Render changes, worker activation, deployment, restart or release action. CI green is not deployment approval.

---

## Live checkpoint — 26 November 2026 (PR #158 exact-head CI passed; stack restored)

- PR #158 exact head `703b9d49f27a67dfdd02eb47ed925b3244bc8b8f` passed GitHub Actions run #1576 (`45819431072`) with conclusion SUCCESS. This run validates the corrected token-revocation fixture mocking both `organizations.findFirst()` and `organizations.findMany()`.
- Restored PR #158 base to `integration/g002-actor-context-foundation` without changing its head. Verified PR metadata: OPEN / DRAFT / UNMERGED, mergeable true; base SHA is PR #157's verified head `435b3fc1c44cb12784da3b72157b0b25f66e0b8d`.
- Verified the PR #157-to-#158 comparison is ahead 19 / behind 0 and exactly six files: `apps/api/src/__tests__/unit/auth/token-revocation.spec.ts`, `apps/api/src/__tests__/unit/identity/identity.active-org-claims.spec.ts`, `apps/api/src/__tests__/unit/identity/identity.n-plus-one.spec.ts`, `apps/api/src/__tests__/unit/identity/profile.controller.spec.ts`, `apps/api/src/modules/identity/identity.service.ts`, `apps/api/src/modules/identity/profile.controller.ts`. PR changed_files is 6.
- PR #157 remains OPEN / DRAFT / UNMERGED at `435b3fc1c44cb12784da3b72157b0b25f66e0b8d`; exact-head Actions run #1572 passed all 10 mandatory jobs. Both PRs still require independent review; do not self-approve or merge.
- Current exact-head status contexts for PR #158 include successful Vercel Web and Admin checks; the consolidated GitHub Actions run #1576 is green.
- PR #138 remains protected source/evidence only; never wholesale merge. Preserve project-memory and preservation refs using expected-SHA fast-forward only. No staging/shared DB writes, migrations, grants/default-ACL/RLS changes, Render changes, worker activation, deployment or release.

---

## Live checkpoint — 26 November 2026 (PR #158 second identity fixture correction)

- PR #157 remains OPEN / DRAFT / UNMERGED at `435b3fc1c44cb12784da3b72157b0b25f66e0b8d`; exact-head Actions run #1572 (`45805365809`) passed all mandatory jobs.
- PR #158 head `27da3d7f65a760d6e9bdf102b843f550a1cf38fb` was tested in Actions run #1575 (`45814538450`). Mobile, lint/typecheck, Web/Admin, E6 boundary lint, integration tests and migration full apply passed; Unit Tests + Coverage failed only four cases in `token-revocation.spec.ts`. The cause is now fully identified: `switchOrg()` performs a separate `organizations.findFirst()` active-organization lookup before `buildClaims()` performs `organizations.findMany()`. The fixture previously mocked only one lookup at a time.
- Corrected the test fixture in commit `703b9d49f27a67dfdd02eb47ed925b3244bc8b8f` to mock BOTH `organizations.findFirst()` and `organizations.findMany()` as active `org-2`. This is test-only; no production authorization logic changed. Wait for the automatically triggered exact-head CI run on `703b9d4`; do not dispatch a duplicate.
- PR #158 remains temporarily based on `develop` for CI trigger eligibility. Once the corrected exact-head CI succeeds, restore its base to `integration/g002-actor-context-foundation` and verify exactly six changed files (five identity-slice files plus the token-revocation fixture).
- Keep PR #157 and #158 draft/unmerged pending independent review. PR #138 remains protected source/evidence only; never wholesale merge. Preserve project-memory and preservation refs with expected-SHA fast-forward only. No staging/shared DB writes, migrations, grants/default-ACL/RLS changes, Render changes, worker activation, deployment or release.

---

## Live checkpoint — 26 November 2026 (PR #158 identity fixture correction)

- PR #157 remains OPEN / DRAFT / UNMERGED at `435b3fc1c44cb12784da3b72157b0b25f66e0b8d`; exact-head Actions run #1572 (`45805365809`) passed all mandatory jobs including P6 integration suites and restricted-role verified-TLS smoke.
- PR #158 is temporarily based on `develop` only to enable the repository's PR workflow (the workflow triggers only for PRs targeting `main` or `develop`). Its synchronized stack commit is `2429003e3a7a19932388f95553d0e5ccd9968c11`, preserving PR #157 and the identity changes. The no-source-change validation trigger commit `f8d85de084da3dfd0182d96935cadff9e4a63ed8` produced Actions run #1573 (`45810050091`), which failed Unit Tests + Coverage only: four failures in the existing API-B9 `token-revocation.spec.ts` because its fixture did not mock the newly required active organization lookup. Integration Tests, lint/typecheck, mobile, web/admin, migration apply and E6 boundary lint passed; container/build/contract were skipped downstream of the unit gate.
- Corrected the fixture in commit `634278fd2afc9066cf182a47670f8fec7869a2e7` by supplying an active `org-2` record to `organizations.findFirst`. This keeps the production authorization rule intact; it repairs the stale unit fixture only. Exact-head Actions run #1574 (`45812366679`) was QUEUED at last poll on `634278fd2afc9066cf182a47670f8fec7869a2e7`. Wait for that run; do not dispatch duplicate CI.
- After exact-head CI completes, restore PR #158 base from `develop` to `integration/g002-actor-context-foundation` without changing its head; verify its diff is exactly five identity files and no longer has the 33 inherited parent paths.
- PR #158 remains draft/unmerged pending exact-head CI and independent review. PR #157 also lacks independent review; CODEOWNERS team requests were rejected because those teams are not collaborators on this personal repository. Do not self-approve or merge.
- PR #138 remains protected source/evidence only; never wholesale merge it. Project-memory and preservation refs must remain synchronized via expected-SHA fast-forward. No staging/shared DB writes, migrations, grants/default-ACL/RLS changes, Render changes, worker activation, deployment or release action.

---

## Live checkpoint — 26 November 2026 (PR #157 green; PR #158 stack synchronized)

- PR #157 exact head `435b3fc1c44cb12784da3b72157b0b25f66e0b8d`, OPEN / DRAFT / UNMERGED, base `develop`. Exact-head Actions run #1572 (`45805365809`) completed SUCCESS: all 10 mandatory jobs passed (Mobile, Lint & Typecheck, Web/Admin, Boundary Lint E6, Unit/Coverage, Migration Full Apply, Integration Tests, Container Build & Smoke Test, Contract/Codegen, Build). k6 smoke and staging release were skipped as intended.
- Integration job logs confirm the command `vitest run src/__tests__/integration --no-file-parallelism`; the three P6 suites are renamed into this supported glob. The integration job and overall run passed.
- PR #157 remains draft because independent review is outstanding. CODEOWNERS references `platform-arch` and `platform-admin`, but GitHub rejected those teams as non-collaborators on this personal repository. No eligible independent reviewer is currently known; do not self-approve or merge without review. Vercel Web status on PR #157 has an external build-rate-limit failure; GitHub Actions mandatory checks are green.
- PR #158 branch was synchronized using a two-parent merge commit `2429003e3a7a19932388f95553d0e5ccd9968c11` (PR #157 head + previous PR #158 head), preserving both histories and overlaying only its five identity files. Compare PR #157 head to the merge commit: ahead 15, behind 0; exactly five changed paths. The base branch was temporarily changed to `develop` to run the workflow, because CI only triggers pull requests targeting `main` or `develop`. A no-source-change CI trigger commit `f8d85de084da3dfd0182d96935cadff9e4a63ed8` was added on top.
- PR #158 exact-head Actions run #1573 (`45810050091`) is IN PROGRESS on `f8d85de`, with temporary base `develop`; wait for all jobs. After it finishes, restore PR #158 base to `integration/g002-actor-context-foundation` (PR #157 branch) without changing its head, and verify the diff returns to exactly five files. Do not dispatch duplicate CI.
- PR #138 remains OPEN / DRAFT / UNMERGED with 1,943 changed files, protected as source/evidence only. Preservation branch and project-memory branch are synchronized at the same memory commit. Never wholesale merge PR #138.
- No shared/staging database writes, migrations, grants/default ACL/RLS changes, Render changes, worker activation, deployment, or release action. No merges authorized or performed.

---

## 26 November 2026 — PR #157 P6 test scope cleanup

- PR #157 exact head: `435b3fc1c44cb12784da3b72157b0b25f66e0b8d`, OPEN / DRAFT / UNMERGED, base `develop`. The parent exact-head CI #1571 (`45802468173`) on `9186c174` completed SUCCESS across all mandatory jobs, including container build/smoke with verified TLS and the least-privilege `scs_api_runtime` role.
- Commit `435b3fc` deliberately moved the three substantive P6 PostgreSQL store-authorization suites from `apps/api/src/__tests__/scratch/` to `apps/api/src/__tests__/integration/`. Both locations have the same directory depth, so imports and migration paths remain unchanged. The integration runner's glob `src/__tests__/integration` now executes these suites; the scratch exclusion rule is respected.
- The same commit reverted six unrelated M7.3b carrier test helper edits to `Object.create(DatabaseService.prototype)`. This is safe because `DatabaseService.getActorContextStorage()` lazily initializes AsyncLocalStorage when accessed, including for prototype-based test doubles.
- Exact-head CI run #1572 (`45805365809`) for `435b3fc` is IN PROGRESS. Do not dispatch duplicate CI; wait for the complete run and inspect integration tests for the newly promoted P6 suites.
- PR #157 has no independent review recorded yet. Keep it draft/unmerged until exact-head CI #1572 succeeds, source/scope review is complete, and independent review is obtained.
- PR #138 remains protected source/evidence only; never wholesale merge it. Keep `preservation/pr138-remediation-2026-11-25` synchronized only by expected-SHA fast-forward. No shared/staging database writes, migrations, grants/default ACL/RLS changes, Render configuration changes, worker activation, deployment, or release action.

---

## 26 November 2026 — PR #157 smoke runtime-role correction

- PR #157 exact head `9186c174254c1098888c15ac61247b858d7fe0ca`, OPEN / DRAFT / UNMERGED, base `develop`. The previous exact-head CI #1570 (run `45797704166`) completed with all application checks successful: lint/typecheck/format, Flutter, Web/Admin, API integration, API unit/coverage, E6 boundary lint, migration full apply (including pg_partman), build and contract/codegen. Container Build & Smoke Test alone failed.
- CI #1570 logs show PostgreSQL TLS and API-to-database connectivity succeeded; the API correctly refused startup because the smoke process connected as `scs`, the privileged PostgreSQL bootstrap account. This is a CI fixture principal error, not a reason to relax the production-like guard.
- Fixed the fixture in commit `9186c174254c1098888c15ac61247b858d7fe0ca`: create `scs_api_runtime` with LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOBYPASSRLS; grant only CONNECT on the disposable database and USAGE on public schema; point the API's DATABASE_URL to this restricted role. Bootstrap account remains confined to disposable DB setup. No production security guard was changed.
- Exact-head Actions run for `9186c17` had not yet appeared at the last poll (Actions run list empty; only Vercel Web/Admin checks pending). Recheck for an automatically triggered run before dispatching anything; never duplicate CI. Container smoke must pass before PR #157 can be considered CI-green.
- Earlier source review still requires deliberate resolution of three P6 PostgreSQL tests under `apps/api/src/__tests__/scratch/` despite the extraction map's scratch-exclusion rule, and six unrelated one-line M7.3b carrier-test helper edits. Review whether to relocate the substantive P6 suites into integration tests and revert/split unnecessary helper edits. No independent review exists; PR remains draft.
- PR #138 remains OPEN / DRAFT / UNMERGED, mergeable=false, 1,943 changed files. It is the protected source/evidence branch, never a wholesale merge candidate. Keep `preservation/pr138-remediation-2026-11-25` synchronized only by expected-SHA fast-forward.
- PR #158 remains stacked on an obsolete #157 parent; reconcile only after #157 is green, scoped and independently reviewed. PR #154 needs consolidated exact-head CI after parent integration; PR #153 exact-head CI had passed but review remains outstanding.
- No PR merge, shared/staging DB write, migration, grant/default-ACL/RLS change, Render setting change, worker activation, deployment or release action occurred.

---

## 26 November 2026 — live SCS continuation snapshot

- `develop` is currently `fde20420bbb759d2e562f9ff747c9e824ac58e25`; `main` is `d3f4aefc41b37ad82f0aeb2eb78121342455eb21`. They are diverged by 11 commits ahead / 4 behind from merge base `9f5bc397467dc92cdc8debd54797b6d730659c36`. Do not promote/reconcile main until the bounded develop integration is complete.
- PR #138 remains OPEN / DRAFT / UNMERGED, mergeable=false, 1,943 changed files. It is a preserved extraction source, not a merge candidate. Source and preservation refs were identical at `898b7878776bb809ab69fb3226f4548412a31347` immediately before this memory refresh; sync preservation to the new memory commit using expected-SHA fast-forward only.
- PR #157 (G-002 Slice A) is OPEN / DRAFT / UNMERGED, current head `ea13a81e9c2767eb5f4440c5f8efd897fe62d5bb`, based on `develop`. CI #1570 / run `45797704166` is IN PROGRESS after fixing the smoke TLS certificate ownership setup. Mobile passed; Lint & Typecheck was still in progress at last poll. Do not start duplicate CI.
- Previous PR #157 CI #1566 passed every application job, including unit/coverage, integration, migration full apply, build and contract/codegen; only container smoke failed because host-side `chown` was denied by the GitHub runner. Commit `ea13a81` creates certificates in a Docker-managed volume and sets ownership inside a helper container, retaining verified TLS and the production DB identity guard.
- Scope review: PR #157 still includes three PostgreSQL P6 suites under `apps/api/src/__tests__/scratch/`, contrary to the extraction map. They are substantive store-authorization tests, but must be deliberately reviewed and relocated to the supported integration tree or explicitly excluded with a coverage rationale before merge. Six one-line M7.3b carrier-test helper changes also need necessity review. No independent review exists for PR #157.
- PR #158 remains stacked on an obsolete #157 parent; reconcile only after #157 CI is green, its scope is corrected and independent review is complete. PR #154 current head is `0faaac932faffd6ccc26c8c6fd8df2bcc660ffd4` with no exact-head Actions run; it needs one consolidated run after the parent foundation is resolved. PR #153 head `5294698d8db78e21df972e8ce6213f21237789fa` passed exact-head CI #1523, but independent review is outstanding.
- No PR was merged. No database writes, migrations, grants/default-ACL/RLS changes, Render configuration changes, worker activation, staging mutation, deployment or release action occurred.

---

## 26 November 2026 — PR #158 profile-claim alignment follow-up

- PR #158 is OPEN / DRAFT / UNMERGED, stacked on PR #157, current head 5c7e41bf04ec16e9fc0565e57425fcc05f548ffc, mergeable=true, 4 files. It now checks ACTIVE organization membership and active organization for switching/claims/profile, and keeps profile role/perms aligned with an explicitly null JWT activeOrg.
- Follow-up finding: ProfileController passes the verified JWT activeOrg to GET /me. getProfile previously treated explicit null like omitted and selected the first active membership, potentially returning merchant role/perms not present in the current buyer token. Fixed by distinguishing undefined (internal/default selection) from explicit null (no active org); updateProfile now carries the JWT activeOrg through its response. Added regression coverage for an active membership with explicit-null JWT activeOrg.
- PR #158 follow-up commits: 94c8fc5f1a2ae5d69e276909f31b8a539a7001ed (service), 76894a736d7279ba2a523685af38c4bd9936e3c3 (profile controller), 5c7e41bf04ec16e9fc0565e57425fcc05f548ffc (regression spec). Tests, lint, typecheck, build and CI have NOT been run for this follow-up. Exact-head Actions run list is empty; Vercel Web/Admin failures are provider build-rate-limit statuses.
- PR #157 remains OPEN / DRAFT / UNMERGED at 77145bc6262aba99cf7fdbd45139382bebc44fa7. Run #1554 was last observed with five jobs passed and API Integration plus Unit/Coverage still in progress. Do not dispatch duplicate CI; recheck the same run before any new dispatch.
- PR #138 remains OPEN / DRAFT / UNMERGED; latest verified branch head before this memory refresh was f81c3177135fccf815758152488edb77cbcfb89e, with preservation branch identical. Its CatalogImportService actor preflight regression test is authored but not run; exact-head Actions remains empty.
- G-002 source audit now maps the targeted function, analytics partition, auto-complete, operations monitor/alerts, worker lease, returns reconciliation and payment-proof upload-intent consumers. Remaining: full raw SQL/dynamic SQL scan; live pg_partman/partition/scheduler and relation/function/extension ACL inventory; 0075 cleanup worker invocation contract.
- No database operation, migration, storage/provider call, worker activation, staging mutation, deployment or merge occurred.

**Next:** recheck PR #157 run #1554 once; finish remaining G-002 SQL/object inventory and 0075 cleanup callsite mapping; only then run consolidated CI for the stacked integration changes. Keep PR #138 preserved and do not merge it wholesale.

---

## 26 November 2026 — raw SQL and special-object consumer review

- At review start PR #138 was OPEN / DRAFT / UNMERGED at a4eeaeed985c71f2e374775c159167a2a09ae65e; preservation was identical; develop was fde20420bbb759d2e562f9ff747c9e824ac58e25. PR #138 has no exact-head Actions run. The latest documentation-only updates will be synchronized to preservation with an expected-SHA fast-forward.
- PR #157 remains OPEN / DRAFT / UNMERGED at 77145bc6262aba99cf7fdbd45139382bebc44fa7. Run #1554 has five jobs passed and API Integration plus Unit/Coverage still in progress. PR #158 remains OPEN / DRAFT / UNMERGED at 2c294ac7f00e6c87fc741d59a709123dae6eb91b with no exact-head Actions run. Do not dispatch duplicate CI.
- Function consumer: migration 0007_search.sql defines invoker PL/pgSQL IMMUTABLE normalize_arabic(text); 0070 pins its search_path to pg_catalog and verifies the postcondition. Catalog SearchService is the identified runtime consumer via parameterized raw SQL; CatalogController's search route applies TenantDatabaseContextInterceptor.
- Partition consumer: analytics_events is created partitioned in 0002 and reconfigured/replaced by 0013/0018. AnalyticsService writes/reads only the parent table through Drizzle; no child partition references were found in the inspected runtime source. AnalyticsController sets actor context; track routes derive user/org from JWT. Global event counts require analytics:read, which the seed maps to ADMIN and SUPER_ADMIN only (source evidence, not live RBAC proof).
- Raw SQL worker/service consumers inspected: AutoCompleteWorker claim/process/release runs under the worker actor; OpsAlertService SQL is wrapped in system or user actor scopes; P13MonitorService SQL uses the p13-monitor worker actor; WorkerLeaseService SQL uses worker context (forceExpire uses system); ReturnsReconciliationService advisory transaction locks run under the intercepted ReturnsController scope and financialOrgScope; PaymentsService payment-proof intent phases use user actor and cleanup SQL uses a worker actor.
- P13MonitorService is instantiated in OperationsModule and starts its read-only monitor timer on module init (default cadence 60 seconds); the separate P13 business worker switch remains false by default. This review did not activate or alter any worker.
- Migration 0075 is consumed by PaymentsService.submitProof and cleanupStaleProofUploads. PaymentsModule registers no cleanup worker or controller route; no scheduled callsite was identified. Keep cleanup activation separate until race/recovery tests and an explicit worker contract exist.
- Migration source review found no CREATE TRIGGER / CREATE CONSTRAINT TRIGGER, CREATE POLICY, ENABLE ROW LEVEL SECURITY, CREATE VIEW / MATERIALIZED VIEW, CREATE SEQUENCE or SECURITY DEFINER declarations in the numbered migration set. This is source evidence only; it is not a live catalog inventory.
- Remaining gates: verify actual pg_partman version/config/partitions and maintenance schedule; 0013's cron.schedule example is commented out and no scheduler deployment manifest was found. Profile actual 0053 JSONB volume because its 500-row progress logging is not batch commits. Continue source-wide raw SQL/dynamic SQL callsite review and live relation/function/extension/trigger ownership/ACL inventory before G-002 closure.
- No tests, lint, typecheck, formatter, build or CI were run in this review. No database read/write, migration, storage/provider call, worker activation, staging mutation, deployment or merge was performed.

**Next:** complete the remaining raw SQL/dynamic SQL consumer scan and map the 0075 cleanup invocation contract; then refresh the bounded G-002 manifest. Keep PR #138 preserved and CI consolidated.

---

## 26 November 2026 — live SCS checkpoint

- PR #138 remains OPEN / DRAFT / UNMERGED, base develop, mergeable=false. Current branch head before this state-document refresh: d1f0cf453f91bcc74143e384ac6ae3e5f4e18bf7; 1,942 changed paths. Preservation branch was verified identical (0 ahead / 0 behind). Develop remains fde20420bbb759d2e562f9ff747c9e824ac58e25. Exact-head Actions has no runs; Vercel Web/Admin rate-limit failures are provider statuses only.
- CatalogImportService hardening is committed in PR #138: assertCaller requires non-empty subject and role; it is enforced before user/audit actor scopes, before upload object-storage writes, and before execute mutates the cached plan. Regression spec covers missing caller, missing/blank subject and missing/blank role, asserting ForbiddenException and no storage/DB actor-context call. Source/test commits: f9bfccf3ac11b7fbb0904634845c24a31d7c805a, 0b14f11c3fd6f787baa73765da7310bb553b24c4, 0f8586e9548a91ad4c56b410e60180ad080e6788. Tests, lint, typecheck, formatter, build and CI have NOT been run for this change.
- PR #157 Slice A is OPEN / DRAFT / UNMERGED, head 77145bc6262aba99cf7fdbd45139382bebc44fa7, mergeable=true. Actions run #1554 is IN PROGRESS: Lint & Typecheck, Mobile, Web/Admin, Boundary Lint and Migration Full Apply passed; API Integration and Unit/Coverage remain in progress. Previous run #1553 was cancelled after the head changed. Do not dispatch duplicate CI.
- PR #158 is OPEN / DRAFT / UNMERGED, stacked on #157, head 2c294ac7f00e6c87fc741d59a709123dae6eb91b, mergeable=true, 3 files. It requires ACTIVE membership and an active/resolved organization for switching, claims and profile role projection; tests, lint, typecheck, build and CI have not run for its exact head.
- Commerce boundary review: InventoryController has class-level TenantDatabaseContextInterceptor and passes verified JWT caller to all exposed InventoryService routes; InventoryModule exports the service, so internal callsites remain to map before changing optional caller contracts. PricingController has class-level actor interception and store/org/membership plus price-list/variant checks; PricingModule exports PricingService, so internal consumers remain to map. CartController derives operations from authenticated user.sub and has actor interception; raw getCart(cartId) is not directly exposed, but OrdersModule exports CartService, so internal consumers remain to map.
- G-002 remains IN PROGRESS. Next: complete exported-service internal-callsite mapping and raw SQL/function/trigger/partition consumer inventory, then update the bounded integration manifest and assemble Slice B from refreshed develop. Keep workers/webhooks and operator/migration slices separate. Never merge PR #138 wholesale.
- No database/catalog write, migration, grants/default ACL/RLS change, staging mutation, provider/storage call, worker activation, bootstrap, deployment or merge occurred.


---

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


## 26 November 2026 — PR #158 fail-closed profile follow-up

- PR #158 now uses an explicit positive predicate for profile projection: membership status must be ACTIVE and the referenced organization row must resolve with isActive === true. Added a missing/unresolved organization regression test.
- Exact PR #158 head: 2c294ac7f00e6c87fc741d59a709123dae6eb91b; branch integration/g002-identity-membership-claims; base integration/g002-actor-context-foundation at 77145bc6262aba99cf7fdbd45139382bebc44fa7. PR is OPEN / DRAFT / UNMERGED, mergeable=true, 3 changed files, 7 commits including the stack. No exact-head Actions run; tests remain NOT RUN.
- PR #157 exact head 77145bc6262aba99cf7fdbd45139382bebc44fa7; OPEN / DRAFT / UNMERGED, mergeable=true, 19 changed files. CI run #1554: five jobs passed (lint/typecheck/format, Flutter, Web/Admin, E6 boundary lint, migration full apply); API integration and API unit/coverage were still running at last check. Previous run #1553 was cancelled and is not a full pass.
- PR #138 exact head at the start of this note: 285b38c8d02ad7cb94e42d1ee44074a775ae444c; OPEN / DRAFT / UNMERGED, mergeable=false, 1,942 changed files. Preservation branch was verified identical. Continue expected-SHA fast-forwards only.
- No new tests were run locally or in CI for PR #138 or #158. No DB write, migration, RLS/grant change, staging mutation, provider/storage action, worker activation, bootstrap, deployment or merge occurred.


## 26 November 2026 — consolidated project checkpoint

### Branch and PR state (re-verified)

- PR #138 source branch `remediation/phase-0-1-tenant-security`: head 6af349d3fb53f5f6f3bea8f608142e4745aa2610. Preservation branch `preservation/pr138-remediation-2026-11-25` is synchronized to the same SHA. PR #138 remains OPEN / DRAFT / UNMERGED, base `develop`, mergeable=false, 1,943 changed files. Do not merge this branch wholesale.
- PR #157: head 5f9399cd6fa80e51b508c31203dd6b5f80b37757, OPEN / DRAFT / UNMERGED, base `develop`, 32 changed files. New exact-head CI run #1556 is in progress. Previous run #1554 (old head 77145bc...) had five jobs pass and two API test jobs fail; test fixtures were repaired in commits 21d4e344... and 4341fef0..., then one consolidated run #1556 was started. Do not start another run while #1556 is active.
- PR #158: head 5c7e41bf04ec16e9fc0565e57425fcc05f548ffc, OPEN / DRAFT / UNMERGED, base branch `integration/g002-actor-context-foundation`, 4 changed files. It includes active membership/active organization checks and explicit-null JWT activeOrg profile alignment. It has no exact-head Actions run and is based on the older PR #157 head 77145bc...; rebase/merge the refreshed PR #157 foundation only after run #1556 is green.
- PR #138 remains the preservation/source of truth for unextracted remediation. Do not cherry-pick or merge the entire 1,943-file diff into develop.

### Latest PR #138 source work

- Completed targeted source scan of 75 numbered SQL migrations and 62 API service/worker files; details and limitations are recorded in `docs/remediation/G-002-MIGRATION-OBJECT-AND-OPERATOR-ACCESS-AUDIT-2026-11-24.md`.
- `OrdersService.cancelOrder` now requires CallerContext, validates userId === caller.sub and has no unscoped fallback; `rejectOrder` now has a required CallerContext and validates merchantUserId === caller.sub. Regression tests and lifecycle test actor fixtures were updated. These PR #138 changes have NOT been tested or run in CI.
- Inventory/Pricing/Cart module consumer map and migration object review are recorded. Remaining: complete raw SQL/dynamic SQL scan across controllers/scripts/packages; classify remaining optional OrdersService callers; live pg_partman/partition/function/extension ownership/ACL checks; verify the payment-proof cleanup worker contract; complete operator/migration-runner callsite audit.
- Staging remains read-only. Do not enable RLS or change grants blindly: all 111 tables were previously confirmed with RLS disabled; OTP codes were observed in plain-text logs; worker isolation and startup migration/seed behavior still require remediation and controlled verification.

### Immediate next actions

1. Wait for PR #157 run #1556. Fix only failures from that exact head and avoid duplicate CI.
2. If PR #157 is green, reconcile PR #158 onto the refreshed foundation and run one consolidated validation.
3. Continue bounded G-002 actor-context adoption from refreshed `develop`; preserve PR #138 and its synchronized backup.
4. Keep all database, staging, migration, RLS/grant, worker activation and deployment actions read-only/unauthorized until the separate security/deployment gates are reviewed.



## 26 November 2026 — CI repair checkpoint

- PR #157 current exact head: 6901389d9975fbeb959ee89633024f83ce598272, OPEN / DRAFT / UNMERGED, base develop. Run #1556 (head 5f9399...) completed with five jobs passed and two test jobs failing at Vitest config startup due to a malformed scratch-exclusion array; tests did not execute. Migration Full Apply and pg_partman verification passed. Config syntax was corrected at 6901389d; new exact-head run #1557 is QUEUED. Do not start another run.
- PR #157 test fixture repair commits 21d4e344... and 4341fef0... initialize real DatabaseService/AsyncLocalStorage test instances, include organization_members/roles in Drizzle schemas, seed active organization membership in the P4 fixture, repair tenant-scope/catalog mocks, and replace Object.create test doubles.
- PR #158 current head 5c7e41bf04ec16e9fc0565e57425fcc05f548ffc remains OPEN / DRAFT / UNMERGED, 4 files, based on the older PR #157 foundation commit 77145bc...; the parent branch has advanced to 6901389d. Reconcile PR #158 onto the refreshed parent only after run #1557 is green.
- PR #138 source and preservation refs remain identical at 5052d03a600a98cee0997c3e82644a5ed99af016. PR #138 remains OPEN / DRAFT / UNMERGED, mergeable=false, 1,943 changed files. Do not merge it wholesale.
- PR #138 OrdersService cancel/reject actor hardening and targeted 75-migration/62-service-worker SQL scan are documented; no tests/CI were run for those source changes.
- No database write, migration, RLS/grant change, staging mutation, worker activation, deployment or merge occurred.



## 26 November 2026 — latest concurrent CI checkpoint

- PR #157 current head: d204b9ea18958f623e0379c7cc307fd0545f8863, OPEN / DRAFT / UNMERGED, base develop. Run #1557 is still running against the preceding head 6901389d9975fbeb959ee89633024f83ce598272; Migration Full Apply, lint/typecheck, mobile, Web/Admin and E6 boundary lint have passed so far. Unit/Coverage and Integration Tests remain in progress. This run does NOT validate d204b9e.
- PR #157 follow-up commit d204b9e adds lazy AsyncLocalStorage initialization for prototype-based test doubles, parameterized SQL-builder fallbacks in tenant-scope for missing Drizzle relation query objects, and P4/P12 fixture updates. After run #1557 completes, run one consolidated validation on exact current head d204b9e; do not launch overlapping runs.
- PR #158 current head: 4f2ac7d997aab4ed8c4cae9dd84e97b1f08523f1, OPEN / DRAFT / UNMERGED, 4-file identity-membership slice. It includes earlier parent test fixtures through 5f9399 but lacks parent config correction 6901389d and d204b9e follow-up. Reconcile only after current PR #157 head is green.
- PR #138 source and preservation refs remain synchronized at d8741a83d38a64f3f0a797d6855a5443bb6006ef. PR #138 remains draft/unmerged, mergeable=false, 1,943 changed files. OrdersService cancel/reject actor hardening and the bounded SQL scan are source-reviewed only; no tests/CI have run for PR #138.
- Keep staging read-only. No RLS/grant changes, DB writes, migration, worker activation, deployment or merge is authorized by this checkpoint.



## 26 November 2026 — PR #158 test alignment checkpoint

- PR #157 remains at d204b9ea18958f623e0379c7cc307fd0545f8863. Run #1557 is still testing prior head 6901389d; Migration Full Apply, lint/typecheck, mobile, Web/Admin and E6 checks passed, while Unit/Coverage and Integration Tests remain in progress. The latest d204b9e follow-up is not yet validated.
- PR #158 has advanced to 19b96bcda29d7166a748dd5693b430cce0ea2098 (5 changed files). The profile-controller test now asserts PATCH /me forwards both a concrete activeOrg and explicit null. It remains based on an older parent and must be reconciled after PR #157's current head is green.
- PR #138 source and preservation refs remain synchronized at the latest memory checkpoint. PR #138 OrdersService cancel/reject hardening and bounded SQL scan remain source-reviewed only, not tested.
- Do not start overlapping CI runs, merge PRs, mutate staging/database access, enable RLS, activate workers or deploy.



## 26 November 2026 — PR #157 consolidated fixture repair checkpoint

- PR #157 current exact head: 0d97dd446d5912d6d0a815d8a931a88f53db009c, OPEN / DRAFT / UNMERGED, base develop. run #1558 is IN PROGRESS for this exact head; do not start another run.
- Previous run #1557 (head 6901389d...) passed non-test jobs and Migration Full Apply but failed Integration Tests and Unit/Coverage. Root causes: missing Drizzle relation-query objects for membership/store lookups, P4 fixture missing order lines and reusing orders with seeded financial records, and scratch specs excluded from coverage.
- Commit d204b9e adds lazy AsyncLocalStorage initialization and parameterized SQL-builder fallbacks. Commit 0d97dd4 restores scratch specs, seeds UUID-backed P6 users and active memberships, initializes real DatabaseService in P6/P12 fixtures, and gives P4 HTTP probes separate orders/products/variants/order items.
- PR #158 current head 19b96bcda29d7166a748dd5693b430cce0ea2098 (5 changed files) covers active membership/organization claims, explicit-null activeOrg alignment and profile-controller forwarding tests. It does not yet include parent commits 6901389d, d204b9e or 0d97dd4; reconcile only after #1558 passes.
- PR #138 source and preservation refs remain synchronized at the current project-memory checkpoint. PR #138 OrdersService cancel/reject actor hardening and bounded SQL scan remain untested; preserve the 1,943-file branch and do not merge wholesale.
- No database writes, migrations, RLS/grant changes, staging mutations, worker activation, deployments or merges occurred.



## 26 November 2026 — integration update: PR #157 and #158 merged

- Reviewer policy: user explicitly waived independent GitHub reviewer requirements. Missing reviews are not a blocker; continue using exact-head CI and source/scope/safety verification. Do not self-approve or invent reviews.
- PR #157 merged to `develop` with merge commit `daabd25cd00a6d2e9d6613d3c0edba23e56b6603`. Head `435b3fc1c44cb12784da3b72157b0b25f66e0b8d`; Actions #1572 passed all 10 mandatory jobs.
- PR #158 merged to `develop` with merge commit `f58047c363adb69054a92b98dbdfe226dc17da21`. Head `703b9d49f27a67dfdd02eb47ed925b3244bc8b8f`; Actions #1576 passed all 10 mandatory jobs. The PR diff was verified as exactly six identity/test files after retargeting to develop.
- Current develop SHA: `f58047c363adb69054a92b98dbdfe226dc17da21`.
- Next integration candidates: #145 narrow canonical migration 0070, #154 canonical lease migration 0071 + atomic order completion, #153 outbox false-ack protection. Reconcile against the new develop head and avoid duplicate migration content from #138. #155/#156 remain separate security slices.
- PR #138 remains OPEN / DRAFT / UNMERGED and protected source/evidence only. No wholesale merge.
- No shared/staging DB mutation, migration application, grant/default-ACL/RLS change, Render setting, worker activation, deployment, restart or release.

## 26 November 2026 — post-merge dependency refresh

- After merging #157/#158, rechecked remaining PRs against current develop `f58047c363adb69054a92b98dbdfe226dc17da21`.
- #145 remains one-file narrow migration 0070; #153 remains ten files; #154 remains thirteen files; #155 one audit document; #156 three source/test files. Their heads and previously successful exact-head CI are unchanged, but their base snapshots are stale and GitHub currently reports mergeable=false. Current comparisons show develop has advanced 51–54 commits beyond their old merge bases. Do not attempt merges on these stale PR branches.
- Next step is to reconcile each bounded PR against refreshed develop, preserve its exact intended diff (especially the canonical 0070 and 0071 migration uniqueness), then run one consolidated exact-head CI per refreshed workstream before merge. Do not blindly merge develop into the branches or import unrelated project-memory changes.
- PR #138 remains OPEN / DRAFT / UNMERGED, protected source/evidence only. Its source/preservation refs are synchronized at `873dce655c71833115db63f8ec527f4f743b44e6`.
- No migration was applied and no staging/shared DB, grants/default-ACL/RLS, Render, worker, deployment, restart or release action occurred.

## 26 November 2026 — refreshed remediation workstreams on current develop

- Current develop baseline remains `f58047c363adb69054a92b98dbdfe226dc17da21` after #157/#158 merges.
- Rebuilt stale PR workstreams on top of this baseline rather than merging stale branches or overwriting current files:
  - PR #159: refreshed G-020 migration 0070 plus atomic order-completion/durable auto-completion lease migration 0071 and its source/tests. The PR is intentionally one ordered 11-file workstream (0070 before 0071), with no broad grants/default ACL/RLS changes. Head `8a3319a2f7319f0ca89e86d5fa63048633cd17b1`. Exact-head CI run #45829417417 is pending.
  - PR #160: refreshed outbox false-acknowledgement containment. Six intended source/test/docs files only; stale project-memory files excluded. Head `0307b56074382cc05fd27da96e09f2d060fe7291`. Exact-head CI run #45828822024 is in progress.
  - PR #162: combined read-only staging security audit evidence with HTTP request/response credential log-redaction hardening. Four files. Its `main.ts` integration was applied to the current develop file and explicitly preserves the existing request-body/response-body/password/OTP redaction protections. Head `636cb6fa3f918aee2567d525bd83e548336fead9`. Exact-head CI run #45829305179 is in progress.
- Superseded stale PRs closed without merging: #145, #153, #154, #155, #156. Temporary stacked PR #161 closed without merging after its order-completion changes were consolidated into #159. These closures do not discard source; refreshed commits/PRs above retain the intended changes.
- #159 includes the canonical narrow 0070 and canonical additive 0071 in numeric order. PR #138 duplicate/broader migrations remain excluded.
- No shared/staging DB writes, migration application, grants/default-ACL/RLS changes, Render changes, worker activation, deployment, restart or release.
- User explicitly waived independent GitHub reviewer requirements. Continue with exact-head CI and source/scope/safety verification; no reviewer gate.


## 26 November 2026 — integration status update

- `develop` current head: `a1d53acd14cd66901a2002ce1a05c9edf0c61c5c` after PR #159 merge.
- PR #159 merged successfully at `a1d53acd14cd66901a2002ce1a05c9edf0c61c5c`. Exact-head Actions run #1582 / `45829417417`: all ten mandatory jobs passed; k6 and staging-release trigger skipped. It carries canonical migration 0070 followed by 0071, atomic order completion and durable owner-fenced worker leases.
- PR #160 and #162 were not mergeable after #159 advanced develop. Rebuilt their exact intended file sets directly on the new head: PR #163 (outbox dispatch safety, six files, head `e57a33e4f0658d17fbd11caaf346ee1a31c761b1`) and PR #164 (HTTP log redaction + read-only audit evidence, four files, head `0687481e106f0d625a0e51a0e1fba6d457386c20`). Both report mergeable true; exact-head Actions runs #1584 (`45833214705`) and #1585 (`45833292699`) are in progress at checkpoint. Poll; do not dispatch duplicates.
- Old PR #160/#162 remain open pending validation of replacements; close as superseded only after replacement PRs pass and are merged. Do not force merge stale branches.
- PR #138 remains protected source/evidence only; never wholesale merge. No staging/production DB mutation, migration application, grants/default ACL/RLS changes, Render, worker activation, deployment, restart or release.
- User explicitly waived independent reviewers. Continue exact-head mandatory CI and scope/operational-safety gates; no reviewer gate.

## 26 November 2026 — PR #163 merged; PR #165 refreshed and validating

- PR #163 outbox dispatch-safety slice passed exact-head Actions run #1584 (45833214705) and was merged to develop using the expected head SHA. Merge commit/current develop head at this checkpoint: 3f55809d8680961a61aa9235418cde69f86a42c1.
- PR #164's original head 0687481e106f0d625a0e51a0e1fba6d457386c20 passed exact-head CI #1585 (45833292699), but became diverged after #163 merged. Its four intended files were reconstructed on the new develop head without overwriting develop-only work.
- Replacement PR #165: branch integration/http-credential-redaction-post-163, exactly four paths (HTTP redaction test/helper, main.ts integration, read-only staging audit evidence), 449 additions / 3 deletions. Head b010559cbe2d720335141cd7f7fdb524edb3285e, base develop at 3f55809d8680961a61aa9235418cde69f86a42c1. PR is OPEN / READY / UNMERGED, mergeable=true.
- Exact-head CI run #1587 (45849606536) is IN PROGRESS for PR #165. At last poll, Mobile and Lint/Typecheck were running; no result is yet claimed. Previous #164 CI does not validate #165. Vercel Web/Admin build-rate-limit failures remain external provider statuses.
- PR #164 is retained open temporarily as superseded source until #165 passes and is merged; then close #164 without merging.
- PR #138 remains OPEN / DRAFT / UNMERGED, protected source/evidence only. Source and preservation refs were identical at 160d8a06cf50f4b66f60cf7ba78629cab559552e before this memory update. Do not merge its 1,943-path diff wholesale; continue bounded file-by-file extraction from refreshed develop and preserve the branch.
- User explicitly waived independent GitHub reviewers. Do not request reviewers or treat missing reviews as a blocker; require exact-head mandatory CI, scope/safety verification and mergeability.
- No shared/staging database writes, migration application, grants/default-ACL/RLS changes, Render changes, worker activation, provider calls, deployment, restart or release occurred.

**Next:** monitor existing #165 run #1587 only; if all mandatory jobs pass, merge #165 with expected head SHA, then close #164 as superseded. Keep PR #138 preserved and continue the bounded remediation extraction plan.


## 26 November 2026 — next bounded PR #138 extraction prepared

- While PR #165's exact-head CI run #1587 (45849606536) is running, prepared draft PR #166 from refreshed develop for the next bounded application-adoption slice. PR #166 has exactly four Promotions files (controller, module, service and unit spec), 167 additions / 25 deletions, head e83cc4dfa74a19a369f80b04cd9bc836cbcfc12c, base develop at 3f55809d8680961a61aa9235418cde69f86a42c1. It is OPEN / DRAFT / UNMERGED. Do not trigger CI until #165's run completes, to preserve the Actions-budget decision.
- PR #166 adopts the merged tenant actor-context foundation for Promotions HTTP routes, forwards verified JWT caller context, enforces active store/org membership for store-scoped operations, and checks redemption order lineage (buyer, store, promotion, discount) before writing a redemption or incrementing the counter.
- Explicit limitation: global/per-user redemption-limit check/counter concurrency remains unresolved and is not claimed as fixed by #166.
- PR #165 remains OPEN / READY / UNMERGED, exact head b010559cbe2d720335141cd7f7fdb524edb3285e, run #1587 IN PROGRESS. Previous #164 head CI #1585 passed but does not validate #165. #164 remains open temporarily as superseded source until #165 passes and merges.
- PR #163 is merged at 3f55809d8680961a61aa9235418cde69f86a42c1. Current develop baseline for #165/#166 is that merge commit.
- PR #138 remains OPEN / DRAFT / UNMERGED and must remain preserved, never merged wholesale. Source and preservation refs were identical at cd917c6f4ca0f73d3d1d228e311e6c4530a78874 before this memory update.
- No shared/staging database writes, migration application, grants/default-ACL/RLS changes, provider calls, worker activation, Render changes, deployment, restart or release occurred. No reviewers are required per the user's instruction.

**Next:** finish only the already-running #165 CI; if green, merge #165 and close #164 as superseded. Then mark #166 ready and run one consolidated exact-head CI. Continue PR #138 extraction only in bounded slices from refreshed develop.
