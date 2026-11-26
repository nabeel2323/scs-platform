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

## 26 November 2026 — PR #157 CI smoke repair and extraction-scope review

- Revalidated repository state: `develop` is `fde20420bbb759d2e562f9ff747c9e824ac58e25`; `main` is `d3f4aefc41b37ad82f0aeb2eb78121342455eb21`; they remain 11 ahead / 4 behind from `9f5bc397467dc92cdc8debd54797b6d730659c36`. Do not begin release promotion while the remediation extraction is in progress.
- PR #138 remains the protected source/evidence branch, OPEN / DRAFT / UNMERGED and mergeable=false. It has 1,943 changed files. No wholesale merge or history rewrite. The source and preservation refs were identical at `898b7878776bb809ab69fb3226f4548412a31347` before this memory batch.
- PR #157 current exact head is `ea13a81e9c2767eb5f4440c5f8efd897fe62d5bb`. Its prior exact-head run #1566 passed all substantive application checks but failed only in Container Build & Smoke Test: GitHub-hosted runner denied host-side `chown 70:70` on the certificate bind mount. The failure was CI fixture ownership, not application behavior.
- Fixed the smoke fixture in `ea13a81`: create a Docker-managed named volume, generate the short-lived TLS certificate inside an Alpine helper container, set PostgreSQL UID/GID ownership inside that container, mount the volume read-only into PostgreSQL and the API, and clean up the volume. TLS verification remains enabled; no production identity guard was relaxed.
- Exact-head CI #1570 (run ID `45797704166`) is IN PROGRESS. Mobile passed; Lint & Typecheck was still running at last poll. Wait for this run; do not trigger a duplicate. The smoke job is the critical acceptance check for the new fixture.
- Source review found three P6 PostgreSQL suites still under `apps/api/src/__tests__/scratch/` in PR #157, contrary to the explicit extraction rule. They are substantive store-authorization regression tests, not disposable artifacts. Before merge, deliberately review and relocate them into `src/__tests__/integration/` or record a justified exclusion/coverage alternative. Also assess six one-line helper changes in M7.3b carrier integration specs; they are outside Slice A's acceptance scope and should be reverted/split if lazy ALS initialization makes them unnecessary.
- PR #157 has no independent review yet and must remain draft/unmerged until exact-head CI is fully green, scope discrepancies are resolved, and independent review is completed. PR #158 remains stacked on an obsolete #157 parent; do not reconcile/merge until the parent is green and reviewed.
- PR #154 current head `0faaac932faffd6ccc26c8c6fd8df2bcc660ffd4` has no exact-head Actions run; its new stale-worker releaseClaim regression requires one consolidated CI run after #157. PR #153 exact-head CI #1523 passed, but no independent review exists.
- No PR merge, database/staging write, migration application, grant/default-ACL/RLS change, Render configuration change, worker activation, deployment or release action occurred.

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

## 26 November 2026 — current integration and service-boundary checkpoint

- PR #138 remains OPEN / DRAFT / UNMERGED at source head f7894abe85b9e9c053e51a730dbfd1c51f6adf21, base develop, mergeable=false. Preservation branch preservation/pr138-remediation-2026-11-25 is identical (0 ahead / 0 behind). Develop remains fde20420bbb759d2e562f9ff747c9e824ac58e25. No exact-head GitHub Actions run exists for #138; Vercel Web/Admin rate-limit failures are provider statuses only.
- The CatalogImportService preflight guard and regression spec are committed on #138. Tests, lint, typecheck, formatter, build and CI remain unexecuted for these changes.
- PR #157 Slice A is OPEN / DRAFT / UNMERGED, head 77145bc6262aba99cf7fdbd45139382bebc44fa7, mergeable=true. GitHub Actions run #1554 is IN PROGRESS: Lint & Typecheck, Mobile, Web/Admin, Boundary Lint and Migration Full Apply have passed; API Integration and Unit/Coverage remain in progress. Previous run #1553 was cancelled after the head changed. Do not start a duplicate CI run.
- PR #158 is OPEN / DRAFT / UNMERGED, stacked on #157 at head 2e57a2deed1efb5c02de05d23b7ec10b668271c0. It adds active organization membership checks for identity claims/profile projection. No exact-head Actions run exists; Vercel failures are provider rate-limit statuses only.
- Commerce boundary spot-check: InventoryController has class-level TenantDatabaseContextInterceptor and passes the verified JWT caller to every exposed InventoryService route; InventoryModule exports InventoryService, so direct internal callsites still require mapping before caller-optional service methods can be tightened. PricingController similarly has class-level actor interception and performs store/org/membership and price-list/variant checks before service calls; PricingModule exports PricingService, so direct internal consumers remain an audit item. CartController uses the authenticated user ID and actor interceptor; getCart(cartId) is not directly exposed as an HTTP route, but OrdersModule exports CartService, so direct internal consumers must be mapped before changing its visibility/contract.
- No tests or CI were run for the latest PR #138 changes. No database, migration, grant/default-ACL/RLS, storage/provider, worker, staging, deployment or merge action occurred.

**Next:** complete the exported-service internal-callsite map and raw SQL/function/trigger/partition consumer inventory; update the G-002 manifest from that evidence. Keep #138 preserved and CI consolidated.

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


## 26 November 2026 — final small test-fixture correction

- Updated the operator actor-context unit test to use optional access when reading the first mock call, avoiding a possible strict TypeScript indexed-access warning. Commit: `55b88e6d4f410b93b568ae343e842cd27babd14d`.
- This remains source/test authoring only; no test, typecheck, formatter or CI was run.


## 26 November 2026 — catalog import actor-context call-graph review

- Re-verified PR #138 head `af29841dc9f6e9668bf3630a2bd609c61f96bd8b` (open draft, unmerged, mergeable=false), develop `fde20420bbb759d2e562f9ff747c9e824ac58e25`, divergence 2,805 ahead / 3 behind from merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`, preservation identical, no exact-head Actions run. Vercel Web/Admin statuses are build-rate-limit failures only.
- Reviewed import controller routes, CatalogService DB operations and TenantDatabaseContextInterceptor. Route context coverage and short actor-scoped service DB phases were found for the import route set. Redis, object storage, workbook parsing and CSV serialization remain outside DB actor transactions. A few service methods rely on current controller wrappers; documented that contract and follow-up requirement in the G-002 ledger.
- No code changed and no tests/typecheck/formatter/build/CI ran. No DB, storage, Redis, worker, staging, migration, grant/RLS, deployment or merge side effect occurred.
- Next: continue the remaining catalog service and worker call-graph audit, then complete G-002 extraction manifest from refreshed develop. Keep CI consolidated.


## 26 November 2026 — worker/order completion review

- Reviewed auto-completion worker actor scope and confirmed releaseClaim runs in the surrounding worker context. Updated its unit-test harness to model DatabaseService.withActorContext and assert scoped claim, completion and release behavior (commits `983acb6b`, `82998dd8`, `7b98f585`). No tests/typecheck/CI run.
- Reconciled worker dependencies: #154 atomic order-completion service and lease fencing plus #138 worker actor context; one migration 0071. #153 no-poller/no-false-ack outbox behavior is canonical; do not extract #138 log-only dispatcher. #154 exact-head Actions absent; #153 exact-head CI passed.
- No worker activation, DB write, migration, provider call, deployment or merge occurred. Next: complete worker/DB access audit and prepare bounded G-002 extraction; keep CI consolidated.


## 26 November 2026 — final worker-test typing cleanup

- Replaced explicit `any[]` in the auto-completion worker test mock with `unknown[]`; behavior and assertions are unchanged. Commit: `2c412732dbbbbde742d43e60f5d2593552aea3cb`.
- This remains unexecuted source/test authoring. No test runner, typecheck, formatter, build or CI was run.


## 26 November 2026 — migration reconciliation

- Consolidated PR #145's `normalize_arabic` search_path postcondition into PR #138 migration 0070. Keep one 0070; standalone #145 migration is excluded from the integration slice. PR #138/#154 0071 DDL is duplicate and must appear once.
- Reviewed migration runner: advisory lock across ledger/apply sequence; each migration plus ledger insert is atomic per file; dry-run only checks nonempty SQL. 0072–0075 remain source-only pending isolated PostgreSQL validation and data/rollback review.
- No SQL, migration, DB write, grant/default-ACL/RLS change, deployment or worker action occurred. No tests/typecheck/CI run. Next: complete G-002 migration manifest and validation plan.


## 26 November 2026 — worker fencing source correction

- Fixed ShippingCarrierWorker success and failure event finalization to require event ID + PROCESSING state + current locked_by worker, preventing an expired worker from overwriting a reclaimed event. Commit `d18a4954`.
- Added regression specs for ack/failure lease fencing and corrected return/shipping worker test doubles to model DatabaseService.withActorContext. ReturnsService worker-escalation spec now invokes the service within the expected caller actor context. Commits: `7009e69d`, `e90276f7`, `7fc543a5`, `2abac268`.
- Reviewed return worker nesting and atomic lease fence. No additional production change identified. No tests/lint/typecheck/build/CI run. No provider/storage/DB/migration/worker/deployment/merge side effect occurred.


## 26 November 2026 — worker fencing and G-002 manifest

- Added current-worker ownership predicates to ShippingCarrierWorker success ack and failure/retry updates (event ID + PROCESSING + locked_by); regression tests authored. Commit `d18a4954`.
- Corrected return/shipping worker test doubles to include DatabaseService.withActorContext and exercised ReturnsService escalation under caller actor context. Commits `7009e69d`, `e90276f7`, `7fc543a5`, `2abac268`. Not executed.
- Reviewed return-expiration nested actor scope and lease fencing; no further production change identified.
- Added G-002 bounded integration manifest. PR #138 inventory now 1,939 paths: 1,280 scratch and 659 non-scratch; do not assume all non-scratch files belong in G-002.
- No tests/lint/typecheck/build/CI or DB/migration/provider/storage/worker/deployment/merge side effect. Next: complete FK-to-ownership and raw SQL/function/trigger/partition review, then build bounded integration branches from refreshed develop.


## 26 November 2026 — FK ownership crosswalk

- Added initial source-level crosswalk for shipping/carrier, payment proof, returns, settlements and reconciliation. Documented independent-FK combinations and existing runtime consistency checks, plus open areas for catalog/inventory/documents and all 75 migration files.
- Confirmed financial global/null reconciliation scope is limited at HTTP edge by `financialOrgScope` (platform roles only; non-platform roles require activeOrg) and class-level ReturnsController actor interception.
- No tests/CI or DB/catalog/migration/provider/storage/worker/deployment action occurred. Next: complete remaining migration and module ownership crosswalk and raw SQL/function/trigger inventory.


## Final live checkpoint — 26 November 2026

- PR #138 head `e410bf44b272eafb8e762636b66877f9e0c4b230`, open/draft/unmerged, mergeable=false. Preservation branch identical (0/0).
- 1,940 changed paths: 1,280 scratch and 660 non-scratch. Do not treat the non-scratch count as the G-002 extraction set.
- Develop `fde20420bbb759d2e562f9ff747c9e824ac58e25`; divergence 2,852 ahead / 3 behind from merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.
- No exact-head Actions run; Vercel Web/Admin build-rate-limit statuses only. No tests or CI run for current worker-fencing/test-fixture changes.
- No database/migration/grant/RLS/provider/storage/worker/deployment/merge action. Next: finish the full FK and raw SQL/function/trigger/partition inventory, then build bounded integration branches from refreshed develop and run one consolidated CI campaign.

## 26 November 2026 — foundational commerce migration crosswalk

Continued G-002 static review across migrations 0001–0006 and 0008–0011. Added independent-FK consistency checks to the crosswalk for org/store document relationships, product/category/media, inventory variant/warehouse, pricing list/variant, cart item cart/store/variant, order item order/variant, buyer/store lineage and trust/conversation participants. These are candidates requiring service-callsite review and data profiling, not confirmed vulnerabilities. Migration 0007 and 0012–0069 remain outstanding; 75-file audit is still partial. No tests, CI, DB writes, migrations, grants/RLS, deployment or merge occurred.


## 26 November 2026 — commerce service callsite spot-check

Static review of Catalog, Inventory, Pricing, Cart and Orders service/controller paths identified positive store/tenant guards and remaining internal-callsite gaps. Inventory caller-optional methods, pricing controller-dependent authorization, cart getCart-by-ID helper exposure, checkout lineage revalidation and catalog update/import/media/category-parent operations remain open. No source change, tests, CI, DB operation, migration, RLS/grant change, deployment or merge occurred. Full G-002 audit remains partial.


## 26 November 2026 — migration and service-boundary audit continuation

- Reverified PR #138 at `98694426f87ec3142042bbad221819968bdd5160`, OPEN / DRAFT / UNMERGED, mergeable=false; `develop` `fde20420bbb759d2e562f9ff747c9e824ac58e25`; 2,874 ahead / 3 behind from merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`; preservation branch identical; exact-head Actions no runs; Vercel Web/Admin rate-limit failures only.
- Reviewed migrations 0007 and 0012–0053, completing the remaining source-review sequence when combined with the earlier reviewed groups and the existing 75-migration static FK scan (183 REFERENCES across 40 files). This is not a live catalog verification.
- Added crosswalk findings for analytics partitions/retention, catalog import actor scopes, merchant offer lineage, cart/order offer revalidation, shipping zone/method and driver/store checks, and 0053 backfill transaction semantics.
- Open questions: analytics event counts have no org predicate (verify analytics:read is platform-only or add tenant scope); promotion redemption service should independently validate buyer/order/store against promotion; internal caller inventory remains open for optional inventory helpers and pricing controller-dependent authorization. Continue raw SQL/function/trigger/partition consumer audit.
- No tests, CI, database/catalog access, migration, grants/default ACL/RLS, staging/shared DB write, storage/provider call, worker activation, bootstrap, deployment or merge occurred.

**Next:** resolve these service-level questions, finish the internal-callsite/raw-query inventory, reconcile develop-only commits and build a file-by-file bounded extraction ledger. CI stays deferred until the slice is assembled.


## 26 November 2026 — first bounded integration PR

- Created draft PR #157, branch `integration/g002-actor-context-foundation`, base `develop` SHA `fde20420bbb759d2e562f9ff747c9e824ac58e25`, head `e3bc1ba21d67ec4947824acf278529e543487eb1`. PR has 17 files, 1,040 additions / 43 deletions, OPEN / DRAFT / UNMERGED, mergeable=true at verification.
- Slice A includes actor-context foundation, runtime identity guard, tenant interceptor/scope, environment/OTP gates, local migration config/operator actor helper dependencies and focused tests. It starts from develop and retains develop-only commits 9530d87 (runtime identity diagnostics), d800e5b (OTP redaction), and fde2042 (carrier outbox ownership).
- No tests/lint/typecheck/build/CI run for exact head; GitHub Actions returned no runs and Vercel Web/Admin failures are provider build-rate-limit only. No migration, DB, RLS/grant, worker/provider/storage or deployment action.
- Reviewed RBAC seed: analytics:read belongs to SUPER_ADMIN and ADMIN only, so the global event-count aggregate is platform-admin scoped by default. Preserve this assignment restriction.
- PR #138 remains OPEN / DRAFT / UNMERGED and is preserved separately. No wholesale merge. Next slices are application adoption, workers/webhooks, and operator/migration runner.


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


## 26 November 2026 — G-002 foundation and identity slices integrated

- User confirmed independent GitHub reviewers are not required; removed review submissions as a gating condition. Continue to require exact-head mandatory CI and verify source scope, mergeability, migration collisions and operational safety.
- PR #157: marked ready and merged to develop. Exact head `435b3fc1c44cb12784da3b72157b0b25f66e0b8d`; Actions run #1572 (`45805365809`) passed Mobile, Lint/Typecheck, Web/Admin, Boundary Lint, Unit/Coverage, Migration Full Apply, Integration Tests, Container Build/Smoke, Contract/Codegen and Build. k6 and staging release skipped. Merge commit `daabd25cd00a6d2e9d6613d3c0edba23e56b6603`.
- PR #158: after #157 merge, retargeted to develop; GitHub compare verified six changed files only. Marked ready and merged. Exact head `703b9d49f27a67dfdd02eb47ed925b3244bc8b8f`; Actions #1576 (`45819431072`) passed all 10 mandatory jobs. k6 and staging release skipped. Merge commit/current develop head `f58047c363adb69054a92b98dbdfe226dc17da21`.
- Preserved the ancestry by using merge commits. No duplicate parent foundation files entered the six-file identity slice.
- Next: refresh #145/#153/#154 against develop `f58047c`; preserve #145 as the narrow canonical migration 0070 and #154 as the canonical migration 0071. Keep #138 duplicate/broader migration content excluded. Then assess #155 and #156 independently.
- No tests rerun unnecessarily, no staging/shared DB writes, migration application, grants/default-ACL/RLS changes, Render changes, worker activation, deployment, restart or release.

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


## 26 November 2026 — PR #159 integration and refreshed follow-on workstreams

- Verified exact-head CI for PR #159 (`8a3319a2f7319f0ca89e86d5fa63048633cd17b1`): Actions run #1582 (`45829417417`) SUCCESS. All ten mandatory jobs passed: lint/typecheck, mobile, unit/coverage, migration full apply, integration, Web/Admin, boundary lint, build, contract/codegen, container build/smoke. k6 and staging-release jobs were skipped.
- Merged PR #159 using expected head SHA. Merge commit: `a1d53acd14cd66901a2002ce1a05c9edf0c61c5c`. Includes canonical narrow migration 0070 then additive 0071, atomic order/shipment/history/outbox/master-order completion, post-commit realtime and durable five-minute owner-fenced worker leases. No migration applied to staging/shared DB.
- After develop advanced, #160/#162 were no longer mergeable. Reconstructed only their exact reviewed source/test/doc files onto `a1d53acd`: PR #163 outbox safety (six files; head `e57a33e4f0658d17fbd11caaf346ee1a31c761b1`) and PR #164 HTTP credential redaction/read-only audit (four files; head `0687481e106f0d625a0e51a0e1fba6d457386c20`). Both PRs opened against develop and report mergeable true.
- Exact-head CI for #163 run `45833214705` and #164 run `45833292699` was in progress at checkpoint. Wait for both; do not duplicate runs. After all mandatory jobs pass, merge #163 then recheck/merge #164 against updated develop; close old #160/#162 only once replacements are safely merged.
- PR #138 remains protected source/evidence only. No production/staging database writes, migration application, grants/default-ACL/RLS, Render, worker activation, deployment, restart or release. Independent reviewers are not a gate per user instruction.

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
