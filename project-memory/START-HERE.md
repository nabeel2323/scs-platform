## Live checkpoint — 26 November 2026, 21:00 UTC (bulk integration reconciliation)

- PR #169 Orders cancellation/rejection actor context is merged into develop at 6ce2d0920e319a6623eb7102a4838964c7b4ee35 after exact-head CI run #1605 passed all ten mandatory jobs. No reviewers were requested.
- Bulk branch: integration/pr138-bulk-remediation-2026-11-26. Draft PR #170: https://github.com/nabeel2323/scs-platform/pull/170. Base 6ce2d0920e319a6623eb7102a4838964c7b4ee35; exact current head 2ed6f7dec1f2102fdb8d2bba187882c16a969c72; 604 changed files (99,265 additions / 21,181 deletions). No reviewers requested.
- 574 source-only/non-overlapping paths were overlaid onto current develop in one consolidated batch, preserving develop-only files. Further grouped reconciliation integrated IdentityService/auth/profile controllers, a composite OrdersService, tenant-scoped ShippingCarrierWorker and AutoCompleteWorker, plus aligned integration and unit tests.
- OrdersService uses PR #138 functionality while retaining develop's exact PR #169 implementations of completeOrder, rejectOrder and cancelOrder, and develop's helper implementations for autoAdvanceToPendingConfirmation and recalculateMasterOrderStatus. Keep this composition; do not replace the full service with either branch wholesale.
- Retained develop's DatabaseService runtime identity and lazy actor-context storage, tenant interceptor/scope safeguards, safe non-polling OutboxDispatcher, main bootstrap/log redaction, orders schema, migration runner, current CI workflow and PR #169 actor-aware PostgreSQL harness fixes.
- Excluded scratch artifacts, test-token.txt and the bootstrap-token issuer. No broad merge of PR #138 history and no force-push occurred.
- Migration reconciliation: keep develop's 0070_normalize_arabic_search_path.sql and 0071_auto_complete_claim_leases.sql (0071 DDL is equivalent to PR #138). Added PR #138 migrations 0072–0075. Resolved the 0070 filename collision by adding 0076_public_api_role_privilege_hardening.sql containing table/sequence and default-ACL revocations only; the G-020 function search_path guard remains in develop's 0070. No migration has been applied to staging or production.
- First bulk CI attempt on the initial 574-file head failed TypeScript checks because API service contracts and actor-aware test fixtures had not yet been reconciled. A second attempt on head be05c3b exposed 61 remaining TypeScript errors; the grouped corrections are now committed at 2ed6f7d. Exact-head CI run #1616 / ID 45879868599 is IN PROGRESS with Lint & Typecheck and Mobile Flutter analysis/tests running. Competing run #1615 was canceled by the Actions concurrency group. Do not dispatch another run; poll #1616.
- PR #138 remains OPEN / DRAFT / UNMERGED and is still the recovery source. Source and preservation branches were identical at fd1cb910362cb94c2fd080863ffcca6d64c2d086 before this documentation update; keep them identical by expected-SHA fast-forward only.
- No staging/production DB writes, migration application, grants/default-ACL/RLS changes executed, provider calls, worker activation, Render changes, deployments, restarts or releases occurred. Merging PR #170 to develop triggers the staging-release workflow; do not merge until the user separately authorizes that release/migration step.

**Next:** poll exact-head CI #1616. If it passes, retain PR #170 as a prepared draft and report the staging-release authorization gate. If it fails, group remaining corrections before one subsequent validation campaign; do not run CI after each small change. No reviewers are needed.

---

## Live checkpoint — 26 November 2026 (bulk PR #138 integration started)

- PR #169 (Orders cancellation/rejection actor context) passed exact-head Actions run #1605 (45874247555) on head 550736024ca0c41adadb3b3852b76257ab1c8acf; all ten mandatory jobs passed. It was merged into develop using the expected head SHA. Merge commit: 6ce2d0920e319a6623eb7102a4838964c7b4ee35. No reviewers were requested, per the user's instruction.
- Created integration/pr138-bulk-remediation-2026-11-26 from that exact develop head. One consolidated integration commit ae88605465a108752e9b4c2d6a99f6b3202d6f69 applies 574 non-conflicting PR #138 paths (93,658 additions / 19,072 deletions) without importing source-branch history.
- Draft PR #170: https://github.com/nabeel2323/scs-platform/pull/170. Exact head ae88605465a108752e9b4c2d6a99f6b3202d6f69, base develop at 6ce2d0920e319a6623eb7102a4838964c7b4ee35, 574 changed files, no reviewers requested. Exact-head CI run #1606 / ID 45877581314 is IN PROGRESS; last observed jobs were Lint & Typecheck and Mobile Flutter analysis/tests. Do not dispatch duplicate CI; poll this run.
- Extraction method: compared source, develop and the recorded merge base f74eb588cc58fc99b105e749d39dbfbacb4f9775; only source-changed paths untouched by develop were overlaid onto a tree rooted at current develop. This retained develop-only paths and did not replace changed develop files.
- Held out deliberately: all .m73b6-scratch/ and apps/api/src/__tests__/scratch/ artifacts; test-token.txt; apps/api/src/scripts/bootstrap-issue-token.ts; project-memory files pending this checkpoint; all migration files and workflow changes; and the 40 overlapping paths requiring manual three-way reconciliation. The 23 develop-only paths remain intact.
- PR #138 remains OPEN / DRAFT / UNMERGED. Source branch remediation/phase-0-1-tenant-security and preservation branch preservation/pr138-remediation-2026-11-25 were verified identical at ccebeef7d35e2f271ce174cb19243c67e824f298 before this documentation update. Keep them identical using expected-SHA fast-forward only.
- Manual conflict reconciliation must preserve newer develop work. In particular, keep develop's runtime-database-identity helper and lazy actor-context storage behavior; keep develop's safe OutboxDispatcher behavior (no generic polling or false DISPATCHED acknowledgement). Reconcile orders/shipping worker actor-context with PR #169 and focused outbox/order work already present on develop. Migrations 0070–0075 remain held pending sequence/role/ACL reconciliation.
- No staging/production DB writes, migration application, grants/default-ACL/RLS changes, provider calls, worker activation, Render changes, deployment, restart or release occurred.

**Next:** poll exact-head CI #1606; continue manual reconciliation of the 40 overlapping paths in grouped workstreams; then create one final validation campaign after the bulk extraction is complete. No small-change CI runs and no reviewer requests.

---

## Live checkpoint — 26 November 2026 (PR #168 merged; Catalog Import actor-context slice)

- PR #168 `fix(catalog-import): enforce authenticated actor context` passed exact-head GitHub Actions run #1593 (run ID `45859606206`) on head `83d5635436e5221962a6e7d548d662fb35c572d3`. All ten mandatory jobs succeeded: Mobile, Lint & Typecheck, Migration Full Apply, Integration Tests, Web & Admin App Tests, Unit Tests + Coverage, Boundary Lint (E6), Container Build & Smoke Test, Build, and Contract Spec & Codegen. k6 Smoke Test and Trigger Staging Release were skipped by workflow conditions.
- Verified PR #168 remained OPEN / unmerged / mergeable before merge, base `develop` at `af70ec081bf6ae2c5421cdd8d8200f7ec4252f31`, exact unchanged head `83d5635436e5221962a6e7d548d662fb35c572d3`, ten intended files only (Catalog Import controller/module/service, Excel executor, template generator, two new actor-context unit specs, Phase 2 executor spec, and two integration specs). No schema/migration changes.
- Merged PR #168 using expected head SHA. Merge commit: `64b4a7de3fc6a0c0d824b261eeda0a571cf90fdc`. Vercel Web/Admin statuses still showed external build-rate-limit failures; they are not GitHub Actions failures. No reviewers requested, per user instruction.
- The first exact-head CI run #1592 was obsolete and had failed due to seven old test call sites missing actor args; all were fixed in the final PR head and the successful #1593 validated that correction.
- Follow-up: audit module-external Catalog Import callers and verify the complete import pipeline's DB operations remain inside short actor scopes. Promotions global/per-user redemption-limit check/counter concurrency remains a separate unresolved follow-up from PR #167.
- PR #138 remains OPEN / DRAFT / UNMERGED, 1,943 paths, protected source/evidence only; never merge it wholesale. Before this checkpoint, source branch `remediation/phase-0-1-tenant-security` and preservation branch `preservation/pr138-remediation-2026-11-25` were both verified identical at `77db80ec2518469201e878aa77214ffb64ccd01e`. After updating this memory checkpoint, fast-forward preservation using expected-SHA only and verify equality again.
- No staging/production DB writes, migration application, grants/default-ACL/RLS changes, provider calls, worker activation, Render changes, deployment, restart, or release occurred.

**Next:** continue with a bounded PR #138 extraction from the refreshed develop head, first checking the merge result and identifying the next coherent actor-context slice. Batch related changes, run one exact-head CI per bounded PR, and keep PR #138 preserved.

---

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

## 26 November 2026 — live continuation checkpoint (PR #157 CI smoke repair)

- PR #157 exact head before the repair: `f21b5f4230a0926072cce4415d4754da32016fe9`. Consolidated Actions run #1566 (run ID `45793251965`) completed with **all application and verification jobs passing**: lint/typecheck, Flutter, Web/Admin, E6 boundary lint, full migration apply, unit/coverage, integration, build, and contract/codegen. Container Build & Smoke Test alone failed before starting the API.
- Root cause is isolated to CI fixture setup, not application code or the production DB guard: the GitHub-hosted runner rejects host-side `chown 70:70` on `/tmp/ci-pg-certs/server.key` and `server.crt` (operation not permitted). The smoke TLS design remains required; do not disable certificate verification or relax the production-like database identity guard.
- Fixed the workflow in commit `ea13a81e9c2767eb5f4440c5f8efd897fe62d5bb` on `integration/g002-actor-context-foundation`: generate the short-lived CA/server certificate inside a Docker-managed volume, set PostgreSQL UID/GID ownership from inside the helper container, mount that volume read-only into PostgreSQL and the API, and remove the volume during cleanup. This avoids host bind-mount ownership mutation while preserving verified TLS.
- Exact-head CI for `ea13a81e9c2767eb5f4440c5f8efd897fe62d5bb` is **NOT YET OBSERVED** at this checkpoint. Check the new run/status; do not claim the smoke repair passed until Container Build & Smoke Test passes on this exact SHA. Do not trigger a duplicate run if one is already active.
- PR #157 exact-head CI #1570 (run ID `45797704166`) is now IN PROGRESS on `ea13a81e9c2767eb5f4440c5f8efd897fe62d5bb`; Mobile has passed and Lint & Typecheck is still running at the latest poll. No result is claimed yet.
- Scope review found three PostgreSQL P6 suites still located under `apps/api/src/__tests__/scratch/` in PR #157, despite the extraction map's explicit scratch-exclusion rule. They are substantive store-authorization regression tests (not disposable artifacts); before merge, deliberately review and relocate them into the supported integration-test tree or document a justified exclusion/coverage alternative. Keep them out of any merge as scratch paths until resolved.
- PR #157 also carries six one-line test-helper updates in M7.3b carrier integration suites (replacing prototype-created DatabaseService instances with constructed instances). These are not part of the actor-context acceptance scope and should be assessed for necessity; revert or split them if the lazy ALS initialization makes them unnecessary.
- PR #157 remains OPEN / DRAFT / UNMERGED. Do not merge until exact-head CI is fully green, scope discrepancies are resolved, and the bounded Slice A diff receives independent review.
- PR #158 remains stacked on an obsolete PR #157 parent; reconcile only after #157 is green/reviewed. PR #154 current metadata head is `0faaac932faffd6ccc26c8c6fd8df2bcc660ffd4`; its additional stale-worker release-claim PostgreSQL test still needs one consolidated exact-head CI after #157 is resolved. PR #153 exact-head CI #1523 remains successful, but independent review is outstanding.
- PR #138 remains OPEN / DRAFT / UNMERGED, mergeable=false, 1,943 changed files. Source and `preservation/pr138-remediation-2026-11-25` are identical at `b32e83423ca72b5e5c97eb2d7a0098bf444adc09`; preserve both and do not merge the broad branch wholesale.
- No shared/staging database writes, migrations, grants/default-ACL/RLS changes, Render configuration changes, worker activation, deployment, or release action occurred.

---

## 26 November 2026 — continued PR #157 / #154 checkpoint

- PR #157 current source head f21b5f4230a0926072cce4415d4754da32016fe9. Exact-head CI run #1566 / 45793251965 is still IN_PROGRESS at this checkpoint; mobile passed, lint/typecheck still running, dependent jobs not yet complete.
- CI #1565 (45790430239) showed that service readiness was not the root cause: the API production-like DB identity guard requires verified TLS, while the smoke PostgreSQL instance had no trusted certificate. The workflow now creates an ephemeral certificate with ci-postgres DNS SAN, enables postgres TLS, mounts the CA and configures PGSSLROOTCERT. Certificate verification remains enabled. Alpine postgres key ownership corrected to UID 70.
- PR #157 has no production policy relaxation. Do not merge until exact-head CI #1566 is fully green and Slice A source/diff review is complete.
- PR #154 advanced to head 0faaac932faffd6ccc26c8c6fd8df2bcc660ffd4 with an additional real-PostgreSQL regression: an expired worker's stale releaseClaim() cannot clear a replacement worker's persisted lease. This was a test-only addition committed with [skip ci]; it still needs one consolidated exact-head CI run after PR #157's active run completes.
- PR #154 migration 0071 does not currently exist on develop. When composing with PR #138, retain exactly one canonical migration 0071 copy; do not duplicate the identical claim-lease DDL. Migration 0070 is not on develop either and remains separately governed by the bounded integration manifest.
- PR #153 head 5294698d8db78e21df972e8ce6213f21237789fa has exact-head Actions run #1523 success. Review confirms the generic no-adapter dispatcher stays disabled and unknown carrier events classify unsupported/terminal, reaching DEAD_LETTER. Independent review remains outstanding; no merge yet.
- PR #158 remains stacked on obsolete PR #157 parent 5f9399cd6fa80e51b508c31203dd6b5f80b37757; port its five identity/profile changes onto the current green Slice A head only after validation/review.
- PR #138 remains OPEN/DRAFT/UNMERGED and its preservation branch is kept synchronized via expected-SHA fast-forward only. No wholesale merge, history rewrite, database mutation, migration application, deployment, worker activation, or staging action.

## 26 November 2026 — PR #157 production-like smoke TLS correction

- PR #157 CI #1564 (run 45787029331) had all application checks green; only Container Build & Smoke Test failed. The API exited at DatabaseService.onModuleInit because runtime DB identity diagnostics returned null.
- PR #157 CI #1565 (run 45790430239) proved that waiting for PostgreSQL/Redis readiness alone did not resolve startup. The API smoke process runs NODE_ENV=production and DatabaseService correctly enforces verified TLS; the smoke PostgreSQL service had no trusted TLS certificate configured.
- PR #157 now generates an ephemeral one-day self-signed CA/server certificate with DNS SAN ci-postgres, enables PostgreSQL SSL, mounts the CA into the API container as PGSSLROOTCERT, and retains production certificate verification. The private key is assigned to postgres:16-alpine UID 70 with mode 0600.
- Latest PR #157 head: f21b5f4230a0926072cce4415d4754da32016fe9. Exact-head CI run #1566 (45793251965) was IN_PROGRESS at this checkpoint. Do not claim success until all mandatory jobs complete; inspect container smoke result first.
- This is CI fixture configuration only. No production database identity guard was relaxed, no production source was weakened, and no migration/database/staging/deployment action occurred.
- PR #153 remains open/draft with exact-head Actions run #1523 successful; source review confirms generic non-carrier outbox polling/false acknowledgements are disabled and unsupported carrier event types classify terminal/unsupported into DEAD_LETTER. Independent review and consolidated merge decision remain outstanding.
- PR #154 remains open/draft with no exact-head CI for current head e421e21b1e66386a9d0c259fb83c99f1a05272cb; its migration 0071 and worker/transaction changes still require exact-head validation and independent review.
- PR #158 remains stacked on stale PR #157 parent 5f9399cd6fa80e51b508c31203dd6b5f80b37757; do not merge directly. Port its bounded identity/profile changes only after Slice A is green and reviewed.
- PR #138 remains protected, open/draft/unmerged; no wholesale merge or history rewrite.

## 26 November 2026 — PR #157 smoke workflow syntax correction and current CI

- The first readiness-workflow edit was malformed: the Redis shell block was truncated in the committed YAML, so push runs #1565 (45790087653) and #1566 (45790308776) failed before job creation. These are workflow-definition failures, not application test failures.
- Rebuilt the CI workflow from the known-valid file at 6bb47ee2c707d8955f06aa50aa7d3d4c9139985d, then applied a minimal two-line bounded readiness gate using pg_isready and Redis PING. The repaired workflow is on PR #157 at a1a2837af5cf36f1777a2d648cdec003e45920da.
- Exact-head PR CI #1567 (45790430239) is now IN_PROGRESS for a1a2837af5cf36f1777a2d648cdec003e45920da. At the latest poll, Lint & Typecheck and Mobile were running; no outcome is claimed. Wait for this run; do not trigger duplicate CI.
- PR #157 remains OPEN / DRAFT / UNMERGED. Do not merge until exact-head required checks, including container smoke, pass and Slice A receives review.
- PR #138 source and preservation refs were synchronized via expected-SHA fast-forward at memory commit 3043780957f57545240c9deb8dc88549995940e0. PR #138 remains OPEN / DRAFT / UNMERGED and mergeable=false; never merge its broad diff.
- No database/staging writes, migrations, grants/RLS changes, worker activation, deployment or release action occurred.

## 26 November 2026 — PR #157 Slice A container packaging and smoke follow-up

- PR #157 exact head 16df88d17ac31739d064fe29105ff3da5461f9fa (pending exact-head CI at checkpoint); base remains develop SHA fde20420bbb759d2e562f9ff747c9e824ac58e25.
- CI #1563 (45786814317) exposed that three DatabaseService helper modules lived under apps/api/infra/drizzle, which is not included in the compiled Nest dist tree. Moved migration-lock, migration-config and operator-actor-context into apps/api/src/common/database and updated the migration runner and test imports. No SQL or runtime authorization policy changed.
- CI #1564 (45787029331) on 6bb47ee2c707d8955f06aa50aa7d3d4c9139985d passed lint/typecheck, boundary lint, unit/coverage, integration, migration full apply, contract/codegen, build, Web/Admin and mobile. Container smoke then failed because DatabaseService correctly refused production-like startup when its first database identity query could not be verified.
- The smoke workflow started disposable PostgreSQL/Redis and used a fixed sleep 10. Replaced that timing assumption with bounded readiness probes (pg_isready and Redis PING) and explicit timeout diagnostics. Exact-head run for 16df88d17ac31739d064fe29105ff3da5461f9fa must validate this fix; no CI result is claimed yet.
- Do not weaken the production database identity/TLS/role startup guard to make smoke green. If the smoke test still fails, inspect the actual database identity diagnostic and fix the environment/query root cause.
- PR #157 remains OPEN / DRAFT / UNMERGED. No merge, staging release, shared DB write, migration, grants/RLS change, or worker activation occurred.
- PR #138 remains OPEN / DRAFT / UNMERGED and mergeable=false; preserve its broad source branch and do not merge wholesale.

## 26 November 2026 — PR #157 P4 database lifecycle root cause fixed

- PR #157 exact head advanced to `ba85744e4ce13337f1c16439eec5d33241b77dfa`.
- CI #1561 (`45778570221`) exposed the P4 HTTP root cause: the test starts its own disposable Testcontainers PostgreSQL and manually migrates/seeds it, but Nest invokes `DatabaseService.onModuleInit()`, which creates a second pool from `process.env.DATABASE_URL` and replaces the injected Drizzle handle. CI's unrelated stale DSN pointed to `127.0.0.1:25433`, yielding `ECONNREFUSED` for every P4 HTTP request. This was a test harness wiring defect, not authorization behavior.
- Fixed P4 harness by setting `DATABASE_URL` to `started.getConnectionUri()` immediately after starting the disposable container, so DatabaseService lifecycle pool and request handlers use the same test database. Original environment value is restored in `afterAll`. No production code/security assertions changed.
- CI #1561: Lint & Typecheck SUCCESS; Flutter SUCCESS; Web/Admin SUCCESS; E6 SUCCESS; Migration Full Apply SUCCESS; Unit/Coverage and Integration FAILED solely with P4 HTTP harness fallout caused by the stale DSN. The targeted fix is now pushed; wait for its exact-head CI before further edits.
- Diagnostic output confirms `connect ECONNREFUSED 127.0.0.1:25433` across P4 routes. Other fixture assertions are downstream of the same unavailable database. Do not weaken tests or alter production auth.
- PR #138 source and preservation refs remain identical at `7d2d5eb1b9022abd233d5e0a53572ce47f3ebfdb` before this memory checkpoint; fast-forward preservation after the handoff update.
- No merge, deployment, shared DB/staging mutation, migration apply, grant/RLS change, or worker activation.

---

## 26 November 2026 — PR #157 diagnostic CI compile correction

- Diagnostic CI #1560 (`45778372173`) on `b2a1131017e6117118a68e33bfd7da26b37bbfd0` stopped at Lint & Typecheck; Flutter passed, downstream jobs skipped. The only reported compile error was missing `HttpException` import in the P4 test-only diagnostic harness. Therefore the underlying P4 runtime exception remains unknown.
- Fixed the import in commit `e0f1bc2e3734f5e74384827270ab104752868bf8` (`test(ci): import HTTP exception type for P4 diagnostics`).
- Exact-head CI run #1561 (`45778570221`) is QUEUED for `e0f1bc2e3734f5e74384827270ab104752868bf8`; wait for it and do not trigger another run.
- PR #157 remains OPEN/DRAFT. No production behavior or security assertion has been changed by the diagnostic commits.
- PR #138 source/preservation branch last synced at prior memory commit `1db1fa5676a23964d7fb41c8b229e34613b19d20`; after this update, sync preservation with expected-SHA fast-forward.

---

## 26 November 2026 — focused PR portfolio recheck

- PR #153 remains OPEN/DRAFT at exact head `5294698d8db78e21df972e8ce6213f21237789fa`; Actions run #1523 (`45622306528`) passed on that exact head. Independent review is still outstanding; no merge performed. This remains the canonical outbox safety behavior.
- PR #154 remains OPEN/DRAFT at exact head `e421e21b1e66386a9d0c259fb83c99f1a05272cb`; no exact-head Actions run is recorded. The older successful run does not validate this head. Keep unmerged until its current head is validated and reconciled with #138 actor-context worker design.
- PR #158 remains OPEN/DRAFT at `19b96bcda29d7166a748dd5693b430cce0ea2098`, stacked on PR #157's old parent `5f9399cd6fa80e51b508c31203dd6b5f80b37757`. Do not merge/rebase it yet; after #157 Slice A is green, port its five-file identity claim/profile alignment onto the current #157 head and run exact-head validation.
- PR #157 exact-head CI #1560 (`45778372173`) for diagnostic head `b2a1131017e6117118a68e33bfd7da26b37bbfd0` is currently IN PROGRESS. Latest jobs observed: Lint & Typecheck and Mobile Flutter both in progress. No duplicate run triggered.
- PR #138 remains OPEN/DRAFT/UNMERGED; source and preservation refs synced after this handoff update via expected-SHA fast-forward only. Do not merge its broad diff.

---

## 26 November 2026 — PR #157 P4 HTTP diagnostic commit queued for CI

- PR #157 advanced to `b2a1131017e6117118a68e33bfd7da26b37bbfd0` with a test-only diagnostic improvement: the P4 HTTP integration harness now logs non-HTTP exceptions by name/message before delegating to the same RFC 7807 filter, and HA-08 includes the response body in its failure message. This does not alter production behavior or relax assertions.
- Exact-head CI run #1560 (`45778372173`) is QUEUED for this diagnostic head. Wait for it; do not trigger duplicate CI.
- Prior run #1559 failed: unit/coverage 22 failures (all in P4 HTTP auth spec); integration 17 failures. Dedicated migration full apply, E6 boundary lint, Flutter, lint/typecheck, Web/Admin all passed. The P4 error body/exception root cause is not yet known; #1560 is expected to reveal it.
- P6 concurrency failures from #1558 are no longer present in #1559. Do not revisit or alter those passing fixtures without new evidence.
- PR #138 source and preservation branch are synchronized at `56d486e01e54f21e2084a9af4b5487f2e3c99bd6`; this is a memory-only checkpoint and must remain protected. PR #138 remains open/draft/unmerged and not merge-ready.
- No production code, database, staging, migration, grants/RLS, worker activation, deployment or merge was changed.

---

## 26 November 2026 — PR #157 CI #1559 failure triage

- PR #157 exact head: `a0f32189b14700bad6701a4b948fd70c5755a0be`; CI run #1559 (`45764646880`) completed FAILURE.
- Passed: Lint & Typecheck, Flutter analysis/tests, Migration Full Apply (including pg_partman verification), Boundary Lint (E6), Web/Admin tests. Failed: Unit/Coverage and Integration Tests. Build, contract/codegen, k6, container smoke and staging release were skipped.
- Unit/Coverage: 4,344 passed, 22 failed, 110 skipped; 220 test files passed, 1 failed, 6 skipped. All 22 failures are in `p4-http-authorization.postgres.spec.ts` (HA-08, HA-12–HA-34); most requests returned HTTP 500. This isolates the unit/coverage gate failure to the P4 HTTP PostgreSQL harness/spec, not a broad unit regression.
- Integration: 1,615 passed, 17 failed, 0 skipped across 82 files. Failure summary includes P4 HTTP authorization/returns/adjustment tests (empty expected return lists, unexpected 404/403/400/409/500 responses), including adjustment creation returning 409 rather than 201. P6 concurrency probes from the prior run are no longer in the failure summary.
- PostgreSQL service log contains FK violations on `settlement_adjustments.sub_order_id` referencing IDs absent from `orders`; follow-on lookups attempted UUID values `undefined`. This is a concrete fixture/data-ordering lead to investigate, but the cause is not yet established. The P4 spec source does seed four orders in `seedBusinessFixture()` before its `beforeEach` financial fixture; verify actual row survival/IDs at the fixture boundary and identify any cleanup/cascade or lifecycle interaction before changing assertions.
- The P4 migration runner's single-client transaction repair now exposes test failures instead of swallowing migration errors; the dedicated Migration Full Apply job is green. Do not revert to swallowed errors or weaken HTTP authorization assertions.
- Next action: add/inspect narrowly scoped fixture-integrity evidence and trace the exact P4 response/SQL failure; repair underlying setup or service logic in one grouped batch. Then run one consolidated exact-head CI. Do not start a duplicate run before the batch is ready.
- PR #138 remains OPEN/DRAFT/UNMERGED and dirty; its source/preservation history must remain protected. No wholesale merge, force-push, DB/staging mutation, migration, RLS/grant change, worker activation, deployment or release action occurred.

---

## 26 November 2026 — PR #157 test-fixture repair batch committed

- Owner's integration priority is unchanged: protect PR #138, integrate its required remediation safely into develop via bounded slices, then reconcile #153 and #154. Batch related changes and avoid CI runs for small edits.
- PR #157 `integration/g002-actor-context-foundation` advanced from failed CI head `0d97dd446d5912d6d0a815d8a931a88f53db009c` to `a0f32189b14700bad6701a4b948fd70c5755a0be`.
- One grouped commit `a0f32189b14700bad6701a4b948fd70c5755a0be` repairs three evidence-fixture issues:
  1. P4 HTTP test migrations now execute BEGIN/SQL/ledger/COMMIT on a single checked-out PostgreSQL client; migration failures roll back and fail setup with the migration filename and database error instead of being silently swallowed. This removes misleading downstream HTTP 500s and surfaces the actual migration fault if one remains.
  2. P6 concurrency probes now create the required ACTIVE organization membership independently of the store-membership row they toggle, so their 25-allow/25-deny assertions test the intended store-membership transition.
  3. P6 independent runtime fixture now supplies phone/email identifiers required by the users table check constraint.
- GitHub Actions CI run `45764646880` was observed QUEUED for the exact new head `a0f32189b14700bad6701a4b948fd70c5755a0be`. No result is available yet; do not call this green or verified.
- The P4 migration failure is now intentionally fail-fast, not assumed resolved until CI demonstrates it. If it fails, inspect the exact migration named in the setup error and fix the real migration dependency/SQL rather than weakening assertions.
- PR #138 remains OPEN / DRAFT / UNMERGED and dirty (1,943 changed files). Its source head before this documentation-only checkpoint is `7285ab3e87fd28fabe5ca0657333eb3ed80b0abf`; preservation ref is expected at the same SHA. No source history rewrite.
- No database/staging mutations, migration execution against any shared environment, grant/RLS change, worker activation, deployment, or merge occurred.

---

## 26 November 2026 — PR #157 CI #1558 failure triage and PR #138 priority

- PR #138 remains OPEN / DRAFT / UNMERGED, base develop, mergeable=false / dirty, 1,943 changed files. Source and preservation refs were synchronized at `e3ff391b4bd069113d572f9602ef7b5b6c962262` before this memory-only update. The preceding source implementation head was `e9fb552850f605fd412fc4aa35b812e945f3c702`; the two intervening commits updated project memory only. No exact-head CI is available for the implementation, so PR #138 remains NOT CI-VERIFIED. Do not merge its broad branch diff.
- Owner instruction remains: protect PR #138, integrate its required remediation safely with develop through bounded slices, then fix focused PRs #153 and #154. Batch related work and do not rerun CI for small edits.
- PR #157 (`integration/g002-actor-context-foundation`) exact head `0d97dd446d5912d6d0a815d8a931a88f53db009c` was verified by CI #1558 (run ID 45729671946), which completed FAILURE at 2026-11-26 00:45 UTC. Lint/typecheck, Flutter, Web/Admin and E6 passed; Migration Full Apply passed. Unit/Coverage and Integration Tests failed.
- Unit/Coverage: 4,308 passed, 24 failed, 144 skipped; three files failed. Failures include P4 HTTP authorization tests returning HTTP 500 for expected successful/denied paths, P6 concurrency assertions returning 0 instead of 25, and a P6 PostgreSQL fixture violating `users_at_least_one_identifier`.
- Integration Tests: 1,615 passed, 17 failed across 82 files. Failures are concentrated in P4 HTTP authorization/financial/returns/pilot tests (empty expected result sets, unexpected status codes, adjustment conflicts) and one undefined response field assertion. The PostgreSQL log also shows invalid UUID fixture values and missing settlement_adjustments.sub_order_id references.
- Do not rerun the full workflow yet. Triage and repair the underlying P4/P6 fixture and service failures as one related batch, then run one consolidated exact-head CI campaign. A passing migration job does not make these failing tests safe to ignore.
- PR #153 remains the canonical no-placeholder/no-false-acknowledgement outbox slice. PR #154 remains the atomic order-completion/lease slice; combine it with #138 worker actor-context only after the database actor-context foundation is sound. Current PR #154 visible successful CI is for an older head, not its current head.
- Preserve PR #138 source and backup refs with expected-SHA fast-forwards only. Do not rewrite either history.
- No database writes, migrations, grants/default ACL changes, RLS changes, staging mutations, worker activation, deployments, bootstrap/token issuance or merges occurred.

---

## 26 November 2026 — owner-directed PR #138 integration checkpoint (live GitHub recheck)

**Owner priority:** protect PR #138 first, integrate its required remediation safely with current `develop`, then reconcile/fix the remaining focused PRs (initially #153 and #154). Batch related changes and run one consolidated CI campaign per meaningful integration slice; do not trigger CI for documentation or small edits. Never bypass required checks.

### Live GitHub state

- PR #138: OPEN / DRAFT / UNMERGED; base `develop`; source branch `remediation/phase-0-1-tenant-security`; exact head `e9fb552850f605fd412fc4aa35b812e945f3c702`; GitHub reports `mergeable=false`, `mergeable_state=dirty`.
- `develop`: `fde20420bbb759d2e562f9ff747c9e824ac58e25`.
- Compare `develop...`PR #138 head: DIVERGED, 2,951 commits ahead / 3 behind, merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.
- PR metadata reports 1,943 changed files (the live compare reports 2,951 commits ahead). This is not a merge-ready PR and must **not** be merged wholesale.
- Preservation branch `preservation/pr138-remediation-2026-11-25` was observed at the same head as the source branch before this memory-only update. Keep it synchronized using expected-SHA fast-forwards only; never force-push or rewrite either history.
- No GitHub Actions run was found for the exact PR #138 head. Historical CI and Vercel build-rate-limit statuses do not validate it. The latest source changes described in the ledger remain untested unless a later exact-head run proves otherwise.
- PR #153: OPEN / DRAFT, head `5294698d8db78e21df972e8ce6213f21237789fa`, base `develop`, mergeable=true at the PR metadata snapshot.
- PR #154: OPEN / DRAFT, head `e421e21b1e66386a9d0c259fb83c99f1a05272cb`, base `develop`, mergeable=true at the PR metadata snapshot. The visible successful CI run #457007 was for older head `e4a5901102e474c3bdce63ca16431ad20f36a317`, not the current PR head.

### Safe integration decision

1. Preserve PR #138 and its full source history as the remediation evidence/source-of-truth branch. Do not rebase it, force-push it, or merge its broad diff.
2. Create bounded integration branches from the refreshed `develop`, with a path/commit/dependency manifest for each slice. Exclude all scratch/test-artifact paths and unrelated changes.
3. First reconcile the three develop-only commits since merge base and all eight affected paths recorded in `PR138-LIVE-RECONCILIATION-LEDGER-2026-11-26.md`. In particular, compose (do not overwrite) DatabaseService with develop's shared runtime identity helper and tests.
4. Keep the outbox behavior from #153 as canonical (no false success acknowledgement / no placeholder poller). Retain #138's worker actor-context design only as a foundation for a real adapter; reconcile order auto-completion using #154's atomic completion/lease logic plus #138's worker actor context.
5. Treat migrations 0070–0075 as one ordered dependency set. Resolve the 0070 collision with #145 and 0071 overlap with #154; do not renumber or apply migrations ad hoc. Produce explicit disposition and rollback analysis before extraction.
6. Run targeted tests while composing each bounded slice; once the integration slice is complete, run one consolidated CI campaign on its exact head. Do not merge until exact-head required checks are green and the relevant security review is complete.
7. After the PR #138 foundation is safely integrated, continue the user's requested focused PR cleanup (#153, #154), reconciling overlaps rather than merging duplicates.

### Safety boundaries

No database writes, migrations, grant/default-ACL changes, RLS changes, staging mutations, worker activation, deployments, bootstrap/token issuance or release actions are authorized by this integration priority. The source audit and implementation work do not constitute runtime or release approval.

---

## 26 November 2026 — PR #157 consolidated fixture repair checkpoint

- PR #157 current exact head: 0d97dd446d5912d6d0a815d8a931a88f53db009c, OPEN / DRAFT / UNMERGED, base develop. run #1558 is IN PROGRESS for this exact head; do not start another run.
- Previous run #1557 (head 6901389d...) passed non-test jobs and Migration Full Apply but failed Integration Tests and Unit/Coverage. Root causes: missing Drizzle relation-query objects for membership/store lookups, P4 fixture missing order lines and reusing orders with seeded financial records, and scratch specs excluded from coverage.
- Commit d204b9e adds lazy AsyncLocalStorage initialization and parameterized SQL-builder fallbacks. Commit 0d97dd4 restores scratch specs, seeds UUID-backed P6 users and active memberships, initializes real DatabaseService in P6/P12 fixtures, and gives P4 HTTP probes separate orders/products/variants/order items.
- PR #158 current head 19b96bcda29d7166a748dd5693b430cce0ea2098 (5 changed files) covers active membership/organization claims, explicit-null activeOrg alignment and profile-controller forwarding tests. It does not yet include parent commits 6901389d, d204b9e or 0d97dd4; reconcile only after #1558 passes.
- PR #138 source and preservation refs remain synchronized at the current project-memory checkpoint. PR #138 OrdersService cancel/reject actor hardening and bounded SQL scan remain untested; preserve the 1,943-file branch and do not merge wholesale.
- No database writes, migrations, RLS/grant changes, staging mutations, worker activation, deployments or merges occurred.


## 26 November 2026 — PR #158 test alignment checkpoint

- PR #157 remains at d204b9ea18958f623e0379c7cc307fd0545f8863. Run #1557 is still testing prior head 6901389d; Migration Full Apply, lint/typecheck, mobile, Web/Admin and E6 checks passed, while Unit/Coverage and Integration Tests remain in progress. The latest d204b9e follow-up is not yet validated.
- PR #158 has advanced to 19b96bcda29d7166a748dd5693b430cce0ea2098 (5 changed files). The profile-controller test now asserts PATCH /me forwards both a concrete activeOrg and explicit null. It remains based on an older parent and must be reconciled after PR #157's current head is green.
- PR #138 source and preservation refs remain synchronized at the latest memory checkpoint. PR #138 OrdersService cancel/reject hardening and bounded SQL scan remain source-reviewed only, not tested.
- Do not start overlapping CI runs, merge PRs, mutate staging/database access, enable RLS, activate workers or deploy.


## 26 November 2026 — latest concurrent CI checkpoint

- PR #157 current head: d204b9ea18958f623e0379c7cc307fd0545f8863, OPEN / DRAFT / UNMERGED, base develop. Run #1557 is still running against the preceding head 6901389d9975fbeb959ee89633024f83ce598272; Migration Full Apply, lint/typecheck, mobile, Web/Admin and E6 boundary lint have passed so far. Unit/Coverage and Integration Tests remain in progress. This run does NOT validate d204b9e.
- PR #157 follow-up commit d204b9e adds lazy AsyncLocalStorage initialization for prototype-based test doubles, parameterized SQL-builder fallbacks in tenant-scope for missing Drizzle relation query objects, and P4/P12 fixture updates. After run #1557 completes, run one consolidated validation on exact current head d204b9e; do not launch overlapping runs.
- PR #158 current head: 4f2ac7d997aab4ed8c4cae9dd84e97b1f08523f1, OPEN / DRAFT / UNMERGED, 4-file identity-membership slice. It includes earlier parent test fixtures through 5f9399 but lacks parent config correction 6901389d and d204b9e follow-up. Reconcile only after current PR #157 head is green.
- PR #138 source and preservation refs remain synchronized at d8741a83d38a64f3f0a797d6855a5443bb6006ef. PR #138 remains draft/unmerged, mergeable=false, 1,943 changed files. OrdersService cancel/reject actor hardening and the bounded SQL scan are source-reviewed only; no tests/CI have run for PR #138.
- Keep staging read-only. No RLS/grant changes, DB writes, migration, worker activation, deployment or merge is authorized by this checkpoint.


## 26 November 2026 — CI repair checkpoint

- PR #157 current exact head: 6901389d9975fbeb959ee89633024f83ce598272, OPEN / DRAFT / UNMERGED, base develop. Run #1556 (head 5f9399...) completed with five jobs passed and two test jobs failing at Vitest config startup due to a malformed scratch-exclusion array; tests did not execute. Migration Full Apply and pg_partman verification passed. Config syntax was corrected at 6901389d; new exact-head run #1557 is QUEUED. Do not start another run.
- PR #157 test fixture repair commits 21d4e344... and 4341fef0... initialize real DatabaseService/AsyncLocalStorage test instances, include organization_members/roles in Drizzle schemas, seed active organization membership in the P4 fixture, repair tenant-scope/catalog mocks, and replace Object.create test doubles.
- PR #158 current head 5c7e41bf04ec16e9fc0565e57425fcc05f548ffc remains OPEN / DRAFT / UNMERGED, 4 files, based on the older PR #157 foundation commit 77145bc...; the parent branch has advanced to 6901389d. Reconcile PR #158 onto the refreshed parent only after run #1557 is green.
- PR #138 source and preservation refs remain identical at 5052d03a600a98cee0997c3e82644a5ed99af016. PR #138 remains OPEN / DRAFT / UNMERGED, mergeable=false, 1,943 changed files. Do not merge it wholesale.
- PR #138 OrdersService cancel/reject actor hardening and targeted 75-migration/62-service-worker SQL scan are documented; no tests/CI were run for those source changes.
- No database write, migration, RLS/grant change, staging mutation, worker activation, deployment or merge occurred.


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

## 26 November 2026 — PR #158 defensive profile fallback refinement

- PR #158 branch integration/g002-identity-membership-claims now requires a resolved organization row with isActive === true before projecting an active organization/merchant role from getProfile. This fails closed if an ACTIVE membership's organization cannot be resolved.
- Added a regression test for the unresolved-organization case. Source commit 99e187146f5fda577a3984a11868113878cbdee2; test commit 2c294ac7f00e6c87fc741d59a709123dae6eb91b.
- PR #158 remains OPEN / DRAFT / UNMERGED, stacked on PR #157 head 77145bc6262aba99cf7fdbd45139382bebc44fa7; exact PR #158 head is now 2c294ac7f00e6c87fc741d59a709123dae6eb91b (3 changed files; 7 commits total including stack). No exact-head Actions run; tests remain NOT RUN.
- PR #157 exact-head run #1554 was last observed with four jobs passed (lint/typecheck/format, Flutter, Web/Admin tests, E6 boundary lint) and three running (API integration, full migration apply, API unit/coverage). Do not start another run.
- PR #138 source and preservation refs remain protected and must be kept identical through expected-SHA fast-forwards. No merge, DB write, migration, RLS/grant change, staging mutation, worker activation or deployment occurred.


## 26 November 2026 — current integration and service-boundary checkpoint

- PR #138 remains OPEN / DRAFT / UNMERGED at source head f7894abe85b9e9c053e51a730dbfd1c51f6adf21, base develop, mergeable=false. Preservation branch preservation/pr138-remediation-2026-11-25 is identical (0 ahead / 0 behind). Develop remains fde20420bbb759d2e562f9ff747c9e824ac58e25. No exact-head GitHub Actions run exists for #138; Vercel Web/Admin rate-limit failures are provider statuses only.
- The CatalogImportService preflight guard and regression spec are committed on #138. Tests, lint, typecheck, formatter, build and CI remain unexecuted for these changes.
- PR #157 Slice A is OPEN / DRAFT / UNMERGED, head 77145bc6262aba99cf7fdbd45139382bebc44fa7, mergeable=true. GitHub Actions run #1554 is IN PROGRESS: Lint & Typecheck, Mobile, Web/Admin, Boundary Lint and Migration Full Apply have passed; API Integration and Unit/Coverage remain in progress. Previous run #1553 was cancelled after the head changed. Do not start a duplicate CI run.
- PR #158 is OPEN / DRAFT / UNMERGED, stacked on #157 at head 2e57a2deed1efb5c02de05d23b7ec10b668271c0. It adds active organization membership checks for identity claims/profile projection. No exact-head Actions run exists; Vercel failures are provider rate-limit statuses only.
- Commerce boundary spot-check: InventoryController has class-level TenantDatabaseContextInterceptor and passes the verified JWT caller to every exposed InventoryService route; InventoryModule exports InventoryService, so direct internal callsites still require mapping before caller-optional service methods can be tightened. PricingController similarly has class-level actor interception and performs store/org/membership and price-list/variant checks before service calls; PricingModule exports PricingService, so direct internal consumers remain an audit item. CartController uses the authenticated user ID and actor interceptor; getCart(cartId) is not directly exposed as an HTTP route, but OrdersModule exports CartService, so direct internal consumers must be mapped before changing its visibility/contract.
- No tests or CI were run for the latest PR #138 changes. No database, migration, grant/default-ACL/RLS, storage/provider, worker, staging, deployment or merge action occurred.

**Next:** complete the exported-service internal-callsite map and raw SQL/function/trigger/partition consumer inventory; update the G-002 manifest from that evidence. Keep #138 preserved and CI consolidated.

---

## 26 November 2026 — latest SCS continuation and stacked G-002 slices

- Baseline before this memory update: PR #138 source head 9697e61fe47bac5cd221d9b2af12ae8a19e1ad6f; the preservation ref was verified identical. PR #138 remains OPEN / DRAFT / UNMERGED to develop. Develop remains fde20420bbb759d2e562f9ff747c9e824ac58e25.
- PR #138 remediation work added during this continuation: PromotionsService now validates order ID, buyer ID, promotion store, promotion ID and recorded discount before redemption writes. Source commit ab59c9b4019dcc6a0a306e604b7e32d139b1b14c; direct service tests commit 53990e08318e0deb54b41bb258c76ce5e6e41713. The separate concurrent redemption-limit race remains open. Crosswalk documentation records this.
- CatalogImportService caller preflight is also present: upload rejects a missing/blank verified subject or role before object-storage writes; user/audit actor helpers validate before opening context; execute validates before plan mutation. Commits f9bfccf3ac11b7fbb0904634845c24a31d7c805a, 0b14f11c3fd6f787baa73765da7310bb553b24c4 and 0f8586e9548a91ad4c56b410e60180ad080e6788. Tests are authored, not run.
- PR #157 is the bounded actor-context foundation, current exact head 77145bc6262aba99cf7fdbd45139382bebc44fa7, 19 changed paths, based on develop. CI run #1553 was cancelled after five successful jobs; it is not a complete pass. A newer exact-head CI run #1554 is in progress. Vercel quota failures are separate provider statuses.
- PR #158 is a stacked identity-membership slice based on PR #157; exact head 2e57a2deed1efb5c02de05d23b7ec10b668271c0. It changes IdentityService and two focused test files, requiring ACTIVE membership and active organization for switching, claims and profile role projection. No exact-head Actions run exists yet. Both PRs remain draft/unmerged.
- No PR was merged. No DB/catalog write, migration, grants/default ACL/RLS change, staging mutation, provider/storage call, worker activation, bootstrap, deployment or production action occurred.
- New source/test changes remain untested unless an exact-head CI result above proves otherwise. Do not trigger duplicate CI while #157 run #1554 is active.

**Next:** finish the file-level review of PR #157 and the stacked PR #158; inspect the active CI run and reconcile any cancelled jobs once, without repeating completed checks. Continue the remaining FK-to-ownership and raw SQL/function/trigger/partition audit, then prepare the next bounded application-adoption slice from refreshed develop. Keep workers/webhooks and operator/migration work separate. Never merge PR #138 wholesale.

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

## 26 November 2026 — PR #138 integration-priority checkpoint

**User priority:** Prepare the safe integration of PR #138 into `develop` before addressing the remaining focused PRs. This is merge preparation, not authorization to merge unfinished work or to bypass required review/release gates.

**Verified live GitHub state**
- PR #138 is OPEN / DRAFT / UNMERGED; base `develop`; GitHub reports `mergeable=false`.
- Exact PR head: `fc0fe5cda0245e1e4cad3b1fb6d354eba00cea0f`. Current `develop` head: `fde20420bbb759d2e562f9ff747c9e824ac58e25`.
- Comparison: 2,779 commits ahead / 3 behind; merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.
- PR changed-file metadata: 1,934 paths, 104,172 additions, 414,508 deletions. 1,277 paths are under `.m73b6-scratch/`; three additional PostgreSQL suites are under `apps/api/src/__tests__/scratch/`. Treat scratch, token-like and test-artifact paths as excluded until individually reviewed; never print or extract secret/token contents.
- The preservation ref `preservation/pr138-remediation-2026-11-25` was verified identical to the active PR branch at this checkpoint. Keep both refs; no reset, force-push, deletion or destructive rebase.
- No GitHub Actions run is associated with this exact head. The only combined status contexts are Vercel Web/Admin build-rate-limit failures; these are external provider failures, not application CI results.
- Six live migration files are present: 0070–0075. Migration 0070 collides by sequence number with PR #145's distinct 0070 migration; 0071 overlaps PR #154's auto-completion lease migration. Do not renumber/apply migrations ad hoc.

**Required integration approach — do not merge PR #138 wholesale**
1. Keep the original PR and preservation ref immutable except for normal append-only implementation/documentation commits.
2. Start integration from the latest `develop`, not from the old PR base. Reconcile the three commits now on `develop` but absent from the PR branch.
3. Build a file-by-file extraction ledger. Exclude all scratch trees and unresolved token-like artifacts. Review the six migrations as a single dependency sequence before extracting any migration.
4. Consolidate overlaps into one canonical implementation before creating clean, bounded PRs. Current changed-file overlap counts against PR #138: #144 7/7; #154 9/13; #153 6/10; #151 5/12; #150 1/2; #156 1/3. #145 has no identical changed path but has a 0070 migration-number collision. #155 has no changed-path overlap.
5. Preserve original source/test/docs evidence and commit history in PR #138; extraction must not imply that unextracted work is discarded or already integrated.
6. Only after the bounded slices are reconciled, run one consolidated CI campaign per completed workstream, not CI for every small edit. Do not claim tests passed until run against the exact extracted head.
7. Keep independent review and all staging/database/migration/RLS/worker/deployment gates intact.

**Focused PR order after #138 reconciliation**
- First reconcile tenant-boundary overlap (#144) with G-001 source/tests.
- Consolidate worker/outbox/order-completion overlap (#153/#154), selecting one canonical lease and event-consumer implementation.
- Reconcile HTTP log redaction (#156) and notification truthfulness (#150).
- Reconcile country/currency UX (#151).
- Resolve the migration 0070 sequence collision with #145 before any migration extraction.
- Retain #155 as documentation-only evidence; verify its content against the reconciled source state.

**Exact-head verification rule:** PR #138's current source/tests are NOT TESTED / NOT CI-VERIFIED. Historical CI and the Vercel quota checks do not validate this head. No merge, deployment, staging/shared-database write, migration, grant/default-ACL change, RLS enablement, worker activation or provider side effect was performed by this checkpoint.

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





## Follow-up source-diff reconciliation — 25 November 2026

The historical TypeScript failure inventory was rechecked against current source history. Comparing failed head `ed685b0d0c9a1dd8e28009fa8fc208b766540061` with the code head `16846152af71524f29047b704159f52ab0d73e75` shows 34 commits and 52 changed files; importantly, all 41 files that contained historical compiler diagnostics have subsequent changes. Inspected current examples show actor-aware helper wrappers and explicit caller fixtures in the large Phase 1/2, P6, optimistic-locking and independent-runtime suites. Therefore the historical 227 TS2554 count is not a current error count and must not be blindly replayed. No current typecheck has been run, so the result remains IMPLEMENTATION_UPDATED / VERIFICATION_PENDING, not verified.

Next source-only work should review the changed fixture semantics without weakening security, then advance the remaining G-002 inventory: raw SQL/function/trigger/partition access, per-operation ownership predicates, FK-to-ownership crosswalk, worker/bootstrap/CLI principals, and actor-context nesting/reuse. Defer the consolidated verification campaign until implementation/integration is complete. The current code head remains the source checkpoint; later project-memory commits are documentation-only.

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

## 25 November 2026 — continuation after protected database audit

Read `docs/remediation/STAGING-ACCESS-CONTROL-OTP-WORKER-AUDIT-2026-11-25.md`, `docs/remediation/RENDER-STAGING-READONLY-CHECK-2026-11-25.md`, and `docs/remediation/G-002-RLS-ARCHITECTURE-DESIGN.md` before any access-control or database change.

Latest branch head: `2e7ac31011eac303c45acadec4d839d02f63f2ec`; PR #138 remains OPEN / DRAFT / UNMERGED to `develop`. Protected read-only audit run [#45590012595](https://github.com/nabeel2323/scs-platform/actions/runs/45590012595) succeeded on this exact SHA at 10:01 UTC. It used `STAGING_DATABASE_URL`, which is also the migration credential consumed by the release workflow. The observed migration/audit identity is login/effective role `postgres`, PostgreSQL 17.6, non-superuser but BYPASSRLS, CREATEROLE and CREATEDB. This confirms the staging migration credential identity; it does **not** prove the Render API's separate `DATABASE_URL` identity.

Live database facts rechecked after the workflow: 114 public table/partition relations (113 ordinary + 1 partitioned), plus one sequence; all public relations are owned by postgres; 0 RLS-enabled tables and 0 policies. Effective table privileges for anon/authenticated/service_role are SELECT/INSERT/UPDATE/DELETE = 0 on all 114, but TRUNCATE/MAINTAIN/REFERENCES/TRIGGER = 114 each. The postgres default ACL repeats these non-DML grants. The supabase_admin default ACL grants full DML and other privileges to API roles for objects created under that owner. Do not describe the existing relations as directly DML-exposed to anon/authenticated: direct catalog privilege checks do not support that claim. The excessive privileges/defaults and absence of RLS remain remediation items.

The live `public._migration_log` contains 69 migrations through `0069_organization_onboarding_permission.sql`; branch migrations 0070–0075 remain unapplied. Render's live API remains on `develop` SHA `f74eb588`, auto-deploy off, one instance. The API source branch already contains a non-secret startup identity diagnostic, but it is not deployed and no runtime identity log exists. Therefore the actual API role remains unknown.

User authorizes staging-database-only schema, privilege, default-ACL, RLS, migration and controlled fixture changes; no production database exists. This does not authorize Render service/environment changes, restart/deploy, worker activation, business workflows, production provisioning, or bypassing the protected staging approval. Do not apply migration 0070 or enable RLS yet: the API runtime identity and full non-owner transaction-context coverage remain unverified, and the proposed release workflow also seeds and deploys (it is not a migration-only dry run). Preserve existing data.

Next: obtain actual API runtime identity through a separately authorized deployment/diagnostic path; complete DB operation-to-context coverage and least-privilege role/policy design; reconcile postgres and supabase_admin default-ACL ownership; prepare a migration-only, rollback-reviewed staging execution path. Do not dispatch release.yml or change the database ad hoc.

---

## 25 November 2026 — current continuation checkpoint

Read `docs/remediation/STAGING-ACCESS-CONTROL-OTP-WORKER-AUDIT-2026-11-25.md` and `docs/remediation/RENDER-STAGING-READONLY-CHECK-2026-11-25.md` before database or worker changes.

Current branch: `remediation/phase-0-1-tenant-security`; PR #138 remains OPEN / DRAFT / UNMERGED to `develop`. Source commit `ed685b0d0c9a1dd8e28009fa8fc208b766540061` applies OTP delivery log redaction and adds direct provider failure/exception regression specs. Tests remain unexecuted; no deployment occurred.

The user explicitly authorizes necessary staging database schema, privilege, default-ACL, RLS, migration, and controlled test-fixture/data changes to prepare the first production launch. **No production database has been provisioned or deployed.** This does not authorize production DB provisioning, Render service/environment changes, restarts, worker activation, business workflows, or bypassing protected GitHub staging approval. Establish API and migration identities and review rollback safety before staging DB writes.

Render read-only inspection is complete: one Frankfurt `scs-api-staging` service, branch develop, auto-deploy disabled, one instance, start command `pnpm --filter @scs/api start:prod`, last live SHA `f74eb588`. OutboxDispatcher and AutoCompleteWorker register; ReturnExpirationWorker is disabled because P13_WORKER_ENABLED is unset. No separate worker/cron service or Render Workflow was found. Runtime DB identity is not present in the inspected logs.

Three older OTP success logs contained masked recipient plus provider message ID/correlation ID; the remediation removes these. The source is not deployed/runtime-verified.

Next: obtain protected read-only `db-access-audit.yml` evidence for API/migration role identities; reconcile migration 0070 and both postgres/supabase_admin default ACL ownership; design least-privilege runtime role and table-specific tenant policies; then prepare a reviewed staging migration/rollback sequence. Continue the implementation backlog from exact-head typecheck evidence without rerunning tests or CI until implementation is complete.

Previous audit checkpoint follows as historical context.


## 25 November 2026 — live staging access/OTP/worker audit checkpoint

Read the full report `docs/remediation/STAGING-ACCESS-CONTROL-OTP-WORKER-AUDIT-2026-11-25.md` before making RLS, grants, migration, OTP logging, or worker changes. The connected Supabase database has 114 public table/partition relations, all RLS disabled and no policies. `anon`/`authenticated` have no DML on existing tables but have TRUNCATE and MAINTAIN on all 114; the postgres default ACL reproduces those privileges. `supabase_admin` default ACLs additionally grant full DML to anon/authenticated/service_role for objects it creates. `postgres` owns all public tables and BYPASSRLS; the actual API runtime role is not yet confirmed.

The live migration ledger is 69 and matches `develop`; remediation branch has six unapplied migrations (0070–0075). Do not run release.yml or apply migrations during this audit. The protected read-only `db-access-audit.yml` workflow is the next evidence source for actual API/migration identities.

OTP trace found a raw provider exception-message log in deployed SHA 9f5bc397/develop OtpDeliveryService. A local patch with redaction and service-level regression tests is at `/mnt/data/otp-log-redaction.patch`; it is not applied/committed/deployed. Current remediation branch sanitizes exception class but still logs caller subject/provider errorReason.

Workers are registered inside the API process: OutboxDispatcher, ShippingCarrierWorker, CarrierTrackingPoller, CarrierReconciliationService, AutoCompleteWorker, P13MonitorService; ReturnExpirationWorker is gated by P13_WORKER_ENABLED. Render runtime configuration/logs have not been freshly checked. Ask the user to confirm the listed Render workspace before inspecting it. Do not activate workers or business workflows.

Orders checkout was corrected to support canonical products with merchant seller offers and to preserve store/offer/variant ownership validation. New tests are authored but unexecuted. No quality gates were run.


## PR #138 integration map

See [`PR138-MERGE-EXTRACTION-MAP.md`](./PR138-MERGE-EXTRACTION-MAP.md) for the verified 1,927-path inventory, 1,277 scratch-artifact exclusion, focused-PR overlap matrix, bounded extraction groups, dependency order and no-wholesale-merge rule. Regenerate the overlap matrix after each focused PR merges into `develop`.


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


## 26 November 2026 — G-002 migration lineage review

- Re-verified PR #138 head `a56a6bbe70ea5ed03f40a4278072dd81b1df556c`, `develop` `fde20420bbb759d2e562f9ff747c9e824ac58e25`, and preservation branch equality. PR remains OPEN / DRAFT / UNMERGED; exact-head Actions has no runs. No tests or CI were run.
- Continued the G-002 source audit across migrations 0054, 0058, 0059, 0061 and 0070–0075, plus return, settlement-adjustment, commission-reversal and carrier-webhook routing services. Detailed evidence and open questions are in `docs/remediation/G-002-FK-OWNERSHIP-CROSSWALK-2026-11-26.md`.
- New review items: 0070 default ACLs are revoked only for the migration executor, so all object-creating roles must be inventoried; 0072 can leave legacy webhook rows with NULL credential_id but a retained shipment_id, so every consumer must refuse unauthenticated legacy association; 0074's forward-only reconciliation pointer rewrite needs cross-scope/cycle/duplicate-version preflight evidence.
- Confirmed independent FK relationships remain important for refunds, returns, return items, settlements, reversals and adjustments. Reviewed service paths contain several lineage checks, but internal/direct callsite coverage is not complete.
- Repository tree contains 75 numbered SQL migrations (0001–0075). This is a focused subset review, not a complete 75-file audit. Continue identity/auth, org/merchant, catalog, inventory, cart/order, shipping, outbox/notification and governance migrations.
- No DB/catalog access, SQL execution, migration, grants/default ACL, RLS, staging/shared DB write, provider/storage call, worker activation, deployment, merge or CI occurred. No test/typecheck/lint/build result is claimed.

**Next:** finish migration and callsite coverage, resolve the three migration review questions with isolated evidence, then refresh develop and construct the bounded file-level extraction ledger. Keep the single consolidated CI campaign deferred until integration is assembled.


## 26 November 2026 — foundational migration audit continuation

- Static source review now covers foundational migrations 0001–0006 and 0008–0011 in addition to the previously recorded focused financial/latest migration set. Key independent-FK boundaries are business documents/verification requests (org+store), product/category, product media variant/product, inventory variant/warehouse, price tier list/variant, cart item cart/store/variant, order item order/variant, and trust/conversation participant/order links.
- Prioritized next service-callsite checks: same-store variant/category/media, variant↔warehouse, variant↔price-list, cart owner/store/variant, order buyer/store/variant/promotion, document org/store, and conversation/dispute participant ownership. These are schema-level risks to reconcile with service guards, not confirmed vulnerabilities.
- Full 75-migration audit remains INCOMPLETE. No tests, CI, database operations, migrations, RLS/grant changes, deployment or merge occurred.
- Detailed matrix appended to `docs/remediation/G-002-FK-OWNERSHIP-CROSSWALK-2026-11-26.md`.


## 26 November 2026 — commerce service callsite spot-check

- Reviewed Catalog, Inventory, Pricing, Cart and Orders service/controller paths against the foundational migration crosswalk. Positive guards: product creation checks category scope; inventory HTTP routes pass authenticated caller and inventory create/transfer check variant↔warehouse store equality; pricing controller/service check variant↔price-list store; cart derives store from variant→product and validates selected offer scope; OrdersService establishes user actor context for checkout mutations.
- Remaining risks: InventoryService caller-optional methods and no-caller helper require complete internal-callsite audit; PricingService has service methods relying on controller scope for store/member authorization; cart getCart-by-ID helper must remain internal and owner-scoped; revalidate cart/order item/offer/store lineage at checkout; review catalog updates/imports/media/category reparenting.
- Crosswalk updated with exact scope and evidence gaps. These are not claims of complete G-002 closure. No source changes, tests, CI, DB operations, migrations, RLS/grant changes, deployment or merge occurred.


## 26 November 2026 — migration 0007–0053 and service boundary continuation

- Reverified PR #138 at head `98694426f87ec3142042bbad221819968bdd5160`, OPEN / DRAFT / UNMERGED, mergeable=false, 1,940 changed paths. `develop` is `fde20420bbb759d2e562f9ff747c9e824ac58e25`; compare is 2,874 ahead / 3 behind from merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`. Preservation branch is identical. Exact-head Actions has no runs; combined statuses show only Vercel Web/Admin build-rate-limit failures.
- Continued migration review through 0007 and 0012–0053, filling the previously open source-review sequence. Combined with the existing migration-reference scan, all 75 numbered migrations have static source-reference coverage (183 explicit REFERENCES across 40 files); no protected live catalog or RLS/ACL evidence is implied.
- Added findings for analytics partition retention (0013/0018), offer/order/cart independent references, shipping driver and zone-method relationships, catalog import actor boundaries, and attribute backfill transaction behavior (0053).
- Reviewed CatalogImport DB actor scopes and per-entity transactions; ShippingService same-store zone/method and driver-org/member checks; CatalogOfferService product/variant/store/price-list/warehouse checks; OrdersService locked checkout revalidation; Analytics batch identity derivation.
- Open service-level questions: analytics event-count global aggregation must be restricted to platform analytics readers or tenant-scoped; promotions redemption should validate order buyer/store against promotion inside the service; caller-optional inventory and controller-dependent pricing methods still need internal-callsite coverage. Raw SQL/function/trigger/partition consumer audit and live schema reconciliation remain open.
- No tests, CI, SQL/catalog access, migration, grants/default ACL/RLS, staging/shared DB write, storage/provider call, worker activation, bootstrap, deployment or merge occurred.

**Next:** finish raw-query/function/trigger and internal-callsite coverage, resolve the analytics/promotion service-boundary questions, refresh the three develop-only commits and prepare the exact file-level extraction ledger. Preserve PR #138; no wholesale merge. Run one consolidated CI campaign only after the integration slice is assembled.


## 26 November 2026 — PR #157 integration checkpoint

- Created draft PR #157: `integration/g002-actor-context-foundation` → `develop`, head `e3bc1ba21d67ec4947824acf278529e543487eb1`, 17 files, OPEN / DRAFT / UNMERGED, mergeable=true.
- PR #157 is the first bounded extraction from PR #138: DatabaseService actor context, runtime DB identity guard, tenant interceptor/scope helpers, env/OTP gates and required operator/local migration dependencies. No SQL migration, RLS, grants, staging DB or deployment changes.
- Branch starts at `develop` SHA `fde20420bbb759d2e562f9ff747c9e824ac58e25` and retains develop-only commits `9530d87`, `d800e5b`, `fde2042`. Exactly 17 files in the slice.
- Exact-head Actions: no runs. Vercel Web/Admin build-rate-limit failures only. Tests, lint, typecheck and build remain unrun.
- PR #138 remains separate, preserved and unmerged. Continue application/worker/operator extraction only after the relevant method-level review.


## Final live checkpoint before this memory commit — 26 November 2026

- PR #138: OPEN / DRAFT / UNMERGED, mergeable=false, 1,942 changed files. Source head before this documentation commit: `f7894abe85b9e9c053e51a730dbfd1c51f6adf21`; preservation ref identical. `develop` `fde20420bbb759d2e562f9ff747c9e824ac58e25`; compare 2,892 ahead / 3 behind from merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`. Exact-head Actions: no runs.
- PR #157: OPEN / DRAFT / UNMERGED, mergeable=true, 19 files, head `77145bc6262aba99cf7fdbd45139382bebc44fa7`, base `develop` at `fde20420bbb759d2e562f9ff747c9e824ac58e25`.
- PR #158: OPEN / DRAFT / UNMERGED, mergeable=true, 3 files, head `2e57a2deed1efb5c02de05d23b7ec10b668271c0`, base PR #157 branch at `77145bc6262aba99cf7fdbd45139382bebc44fa7`.
- PR #157/#158 exact-head Actions lookups: no runs. Vercel Web/Admin build-rate-limit failures only. No tests, lint, typecheck, build or CI have run for either slice.
- The preservation branch will be fast-forwarded to the new source documentation commit without force. PR #138 remains the source/evidence branch; do not merge it wholesale.
- No migrations, SQL/catalog access, RLS/grants/default ACL, staging/shared DB writes, worker activation, provider/storage calls, bootstrap, deployment or merge occurred.


## 26 November 2026 — PR #157 container packaging repair checkpoint

- PR #157 exact head before packaging repair: `ba85744e4ce13337f1c16439eec5d33241b77dfa`. Exact-head CI #1562 (run `45784051453`) completed with **10 of 11 executable jobs successful**. Lint/typecheck, Flutter, E6, Web/Admin, Migration Full Apply, Integration Tests, Unit/Coverage, Build and Contract/Codegen passed; Container Build & Smoke failed. k6 and staging release were skipped.
- CI #1562 container logs show the image builds, but the API process exits at startup with `MODULE_NOT_FOUND: ../../../infra/drizzle/migration-lock` from `apps/api/dist/common/database/database.service.js`. The Nest SWC build compiles the configured `src` source tree; DatabaseService had runtime imports pointing to TypeScript helper files under `infra/drizzle`, which are not emitted as JavaScript in `dist`. The Dockerfile copies infra source for migration tooling, but Node cannot resolve those TypeScript modules from compiled application JS.
- Fixed the packaging boundary in one grouped commit `930865a2111270315cd2da4d29eee8f7ef2f69e0`: moved the shared migration lock, local migration-exclusion config and operator actor helper into `src/common/database` so Nest compiles them; updated DatabaseService imports; updated the TSX migration runner and PostgreSQL migration-lock spec to import the shared source helper; removed the three infra helper copies. No authorization assertions, production database policy, migration SQL or runtime deployment settings were changed.
- Exact-head CI run `45786814317` is QUEUED for `930865a2111270315cd2da4d29eee8f7ef2f69e0`. Do not start a duplicate run. This packaging fix is NOT verified until container smoke and all required checks pass.
- Live PR #157 remains OPEN / DRAFT / UNMERGED, base develop `fde20420bbb759d2e562f9ff747c9e824ac58e25`, latest head `930865a2111270315cd2da4d29eee8f7ef2f69e0`, 38 changed paths, mergeable=true at last snapshot. PR #158 remains stacked on old PR #157 parent `5f9399cd6fa80e51b508c31203dd6b5f80b37757`; do not merge/rebase it until #157 is fully green, then port its identity/profile fix onto the current parent and validate.
- PR #153 remains OPEN/DRAFT at `5294698d8db78e21df972e8ce6213f21237789fa`; exact-head CI #1523 previously passed, independent review still outstanding. PR #154 remains OPEN/DRAFT at `e421e21b1e66386a9d0c259fb83c99f1a05272cb`; exact-head validation is still required.
- PR #138 remains OPEN / DRAFT / UNMERGED at `cf967590891eb446a41b5de91429755a8be10d05`, mergeable=false. Keep its source and preservation refs intact and synchronized only by expected-SHA fast-forward; never merge its broad diff wholesale.
- No shared DB/catalog access, migration execution, grant/default-ACL/RLS change, staging mutation, worker activation, bootstrap/token issuance, deployment or merge occurred. The green migration job was isolated CI-only disposable database evidence.


## Live checkpoint — 26 November 2026 (G-002 foundation and identity slices merged)

- User explicitly confirmed that independent GitHub reviewers are not required for this project. Do not treat missing reviewer submissions as a blocker; use exact-head mandatory CI, source/scope verification, mergeability and explicit safety boundaries instead. Never self-approve or fabricate reviews.
- PR #157 G-002 actor-context foundation was marked ready and merged into `develop` using a merge commit. Exact head `435b3fc1c44cb12784da3b72157b0b25f66e0b8d`; exact-head Actions run #1572 (`45805365809`) passed all 10 mandatory jobs. Merge commit: `daabd25cd00a6d2e9d6613d3c0edba23e56b6603`.
- PR #158 active-organization identity claims was retargeted to `develop` after #157 merged, verified to contain exactly six files, marked ready and merged. Exact head `703b9d49f27a67dfdd02eb47ed925b3244bc8b8f`; exact-head Actions run #1576 (`45819431072`) passed all 10 mandatory jobs. Merge commit: `f58047c363adb69054a92b98dbdfe226dc17da21`.
- Current `develop` head after both merges: `f58047c363adb69054a92b98dbdfe226dc17da21`. #157/#158 are no longer open PRs; their branch refs are retained as historical evidence.
- This is the first successful bounded integration of PR #138 remediation work. PR #138 itself remains protected source/evidence only; never wholesale merge it.
- Next: reconcile #145 (canonical narrow migration 0070), #154 (canonical additive lease migration 0071), #153 (outbox no-false-ack safety), then separately assess #155/#156. Revalidate each PR against refreshed develop and migration ordering before merge. Do not apply migrations to staging or deploy.
- No staging/shared database writes, migration application, grants/default-ACL/RLS changes, Render changes, worker activation, deployment, restart or release occurred.

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


## Live checkpoint — 26 November 2026 (PR #159 merged; #163/#164 refreshed)

- PR #159 merged into develop after exact-head Actions run #1582 (`45829417417`) passed all 10 mandatory jobs. Merge commit/current develop baseline at checkpoint: `a1d53acd14cd66901a2002ce1a05c9edf0c61c5c`. Migration 0070 narrow G-020 precedes additive 0071 durable auto-completion lease; no shared DB migration applied.
- PR #160 and #162 became divergent after #159. Their intended source files were reconstructed onto the new develop head as PR #163 (six outbox safety files, head `e57a33e4f0658d17fbd11caaf346ee1a31c761b1`) and PR #164 (four HTTP log-redaction/audit files, head `0687481e106f0d625a0e51a0e1fba6d457386c20`). Both exact-head CI runs are in progress; require all mandatory jobs to pass before merge. Do not force-merge stale #160/#162.
- Keep PR #138 OPEN / DRAFT / UNMERGED, protected source/evidence only. No wholesale merge. No staging/production DB writes, migration application, grants/default-ACL/RLS changes, Render changes, worker activation, deployment, restart or release.
- User waives independent reviewer requirement. Exact-head mandatory CI, scope/safety review and mergeability remain required. Minimize CI by one consolidated run per refreshed workstream.

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


## 26 November 2026 — PR #165 merged; Promotions extraction refreshed as PR #167

- PR #165 HTTP credential redaction + read-only staging audit evidence passed exact-head Actions CI #1587 (run 45849606536): all 10 mandatory jobs succeeded, including unit/coverage, integration, migration full apply, contract/codegen, build and container smoke. k6 smoke and staging release jobs were skipped by workflow conditions. Vercel Web/Admin build-rate-limit statuses are external provider failures and do not negate mandatory Actions success.
- PR #165 merged into develop using expected head b010559cbe2d720335141cd7f7fdb524edb3285e. Merge commit: 5523dba6763298d3df388143ebd38614952f47eb. PR #164 closed without merging as superseded; its intended changes are included in #165.
- PR #166 was prepared on the pre-#165 base but develop advanced after #165 merged. It was closed without merging and without CI; its four intended files were reapplied cleanly on the latest develop baseline as PR #167.
- PR #167: OPEN / READY / UNMERGED, exactly four Promotions files, 167 additions / 25 deletions, head d13e795f32ee9fa5d5be62a8d8a106ce96b434f6, base develop at 5523dba6763298d3df388143ebd38614952f47eb. Scope: verified JWT caller context and tenant/store membership for store-scoped Promotions routes; validate buyer/store/promotion/discount order lineage before recording redemption; regression tests. No migration.
- PR #167 exact-head Actions CI #1590 (run 45853558385) is IN PROGRESS. At latest poll Lint & Typecheck and Mobile were running; do not claim any checks passed yet. No overlapping CI should be dispatched.
- Known follow-up explicitly retained: global/per-user promotion redemption-limit check and counter update are not concurrency-safe in this slice; do not claim that race is fixed.
- PR #163 merged at 3f55809d8680961a61aa9235418cde69f86a42c1; PR #165 merge #5523dba6763298d3df388143ebd38614952f47eb is current develop baseline. PR #138 remains OPEN / DRAFT / UNMERGED and must never be merged wholesale.
- PR #138 source and preservation refs were synchronized at a5cc64792f60e830477803b74c1e64a391ebf2ce before this memory update. Synchronize preservation via expected-SHA fast-forward only.
- User explicitly waived independent GitHub reviewer requirements. Do not request reviewers or treat missing review as blocker; require exact-head mandatory CI, source/scope/safety checks and mergeability.
- No shared/staging database writes, migration application, grants/default-ACL/RLS changes, provider calls, worker activation, Render changes, deployment, restart or release occurred.

**Next:** monitor existing PR #167 CI #1590 only. If all mandatory jobs pass, verify mergeability and merge using exact head SHA. Then continue bounded extraction from PR #138 onto refreshed develop; do not create duplicate CI campaigns or merge the large source PR wholesale.


## 26 November 2026 — PR #167 merged; Catalog Import actor-context extraction reviewed

- PR #167 Promotions tenant-ownership and redemption-order-lineage slice was merged into `develop` using expected head SHA `d13e795f32ee9fa5d5be62a8d8a106ce96b434f6`. Merge commit/current `develop` head: `af70ec081bf6ae2c5421cdd8d8200f7ec4252f31`.
- Exact-head Actions run #1590 (`45853558385`) completed successfully across all 10 mandatory jobs: Lint & Typecheck, Mobile, Boundary Lint, Migration Full Apply, Integration Tests, Unit Tests + Coverage, Web & Admin App Tests, Contract Spec & Codegen, Container Build & Smoke Test, and Build. k6 Smoke Test and Trigger Staging Release were skipped by workflow conditions. Vercel Web/Admin build-rate-limit failures were external provider statuses only.
- PR #167 was exactly four Promotions controller/module/service/unit-test files, 167 additions / 25 deletions, based directly on the then-current develop head `5523dba6763298d3df388143ebd38614952f47eb`; no migration. The existing global/per-user redemption-limit check/counter race remains unresolved and must not be represented as fixed.
- PR #138 remains OPEN / DRAFT / UNMERGED, 1,943 changed paths, protected as source/evidence only. Never merge it wholesale. The source branch `remediation/phase-0-1-tenant-security` and preservation branch `preservation/pr138-remediation-2026-11-25` are identical at `77d56a76696d779ea257216707a779549be250fa`; preserve this using expected-SHA fast-forward only.
- Next candidate reviewed: Catalog Import actor-context adoption from PR #138 (service/controller/module, Excel executor/template generator, and focused regression specs). It rejects missing/blank actor identity before upload storage side effects and uses short actor-scoped DB phases around import operations while keeping storage/workbook/Redis work outside DB actor transactions. The source changes span nine relevant files including the existing Phase 2 executor test updates.
- Do NOT copy the old PR #138 files wholesale onto current `develop`: the current Catalog Import controller/module/service/executor/template-generator files all differ from the preserved source branch, and the two new actor-context tests do not yet exist on develop. A three-way/targeted merge is required to retain intervening develop changes. This slice is not yet implemented, opened as a PR, or CI-validated. Continue by comparing the source patch against current develop and applying only the intended actor-context hunks; then add the tests and run one consolidated exact-head CI.
- PR #167's former branch `integration/promotions-tenant-lineage-post165` is now one commit behind `develop` after merge; it is not an active integration branch.
- User explicitly waived GitHub reviewers and asked to avoid repeated CI for small changes. Do not request reviewers; batch related code/tests and run one exact-head CI per bounded PR. No shared/staging DB writes, migrations, grants/default-ACL/RLS changes, provider calls, worker activation, Render changes, deployment, restart or release occurred.


## 26 November 2026 — PR #168 opened; Catalog Import actor-context slice

- Created `integration/catalog-import-actor-context-develop` directly from current `develop` head `af70ec081bf6ae2c5421cdd8d8200f7ec4252f31`.
- Opened PR #168: https://github.com/nabeel2323/scs-platform/pull/168, title `fix(catalog-import): enforce authenticated actor context`, head `c1a322adeef5b76ecfb9afe9bbaf56cb9131a2f0`, base `develop`. Eight files: controller, module, service, executor, template generator, two new actor-context regression specs, and Phase 2 executor transaction spec. Compare verified 445 additions / 203 deletions, no unrelated files, no schema/migration changes.
- Integration method: apply PR #138's relevant patch hunks to each current develop file by exact context matching; all five implementation-file patches applied cleanly. New tests added separately. This retained develop's intervening catalog-import implementation rather than copying old whole files.
- CI run #1592 (`45859306428`) is in progress on exact head. At checkpoint, Mobile (flutter analyze/test) and Lint & Typecheck were in progress; other required jobs had not yet appeared in the first jobs response. Poll this same run only; do not start another CI.
- Vercel Web/Admin contexts report external build-rate-limit failures; do not treat those as GitHub Actions failures. No reviewers requested, per user instruction.
- PR #168 is not merged. Merge only after all mandatory exact-head Actions jobs pass and PR head/base remain unchanged. Inspect failures and fix in one consolidated update if necessary.
- PR #138 remains open/draft/unmerged as source evidence. Preservation branch `preservation/pr138-remediation-2026-11-25` must remain identical to this memory branch using expected-SHA fast-forward only.
- No staging/production database access, migration application, grants/default-ACL/RLS changes, provider calls, worker activation, Render changes, deployment, restart, or release.


## 26 November 2026 — PR #168 CI remediation checkpoint

- PR #168 first exact-head CI run #1592 (`45859306428`) failed Lint & Typecheck because seven existing integration-test call sites still used the old executor/template signatures. Specifically: six in `catalog-governance-roundtrip.spec.ts` (3 executor calls + 3 export calls) and one executor call in `phase4-import-commerce.e2e.spec.ts`. No product implementation error was reported by that job; lint reported 0 errors (warnings only).
- Updated both integration specs to pass a valid test actor. Their isolated PostgreSQL DatabaseService adapters now implement a no-op `withActorContext` wrapper; those integration tests do not exercise production RLS/session GUCs. Updated PR body to explain this explicitly.
- New PR #168 head: `83d5635436e5221962a6e7d548d662fb35c572d3`; now ten files (includes two integration specs), 456 additions / 212 deletions, no schema/migration changes. PR remains OPEN, not merged; mergeable reported true at last metadata read.
- New exact-head Actions run #1593 (`45859606206`) is in progress. Poll only this latest run; do not start duplicate CI. The earlier run #1592 is obsolete for merge gating and should not be rerun.
- User waiver on reviewers remains in force. Vercel preview rate-limit statuses remain external. No staging/production DB access, migration application, grants/default-ACL/RLS changes, provider calls, worker activation, Render changes, deployment, restart, or release.


## Live checkpoint — 26 November 2026, 22:58 UTC (PR #170 exact-head recheck)

- PR #170 remains OPEN / DRAFT / UNMERGED on `integration/pr138-bulk-remediation-2026-11-26`, base `develop`, current head `266380d8a2a4665c5f2c827b94753b8a1f3e0940`, 604 changed files. No reviewers were requested. Its merge is still blocked by the separate staging-release authorization boundary; do not merge merely because CI becomes green.
- PR #170 CI run #1616 (run ID `45879868599`) is now COMPLETE / FAILURE, not in progress. Mobile Flutter passed; Lint passed; API typecheck failed on three TS2554 call sites in `apps/api/src/modules/orders/orders.service.ts` (lines 1041, 1200, 1265 in that run), where actor context was passed to a three-argument `autoAdvanceToPendingConfirmation` helper. Other jobs were skipped after the required lint/typecheck job failed. Do not treat skipped jobs as passes.
- The current PR #170 head is two commits beyond the tested `2ed6f7d` head. The intervening source commit changes `orders.service.ts` (48 lines) and restores the actor-aware four-argument helper plus `withUserActorContext(actor, ...)`; the three call sites now match that signature. The second commit updates `docs/remediation/IMPLEMENTATION-PROGRESS.md`. This is a plausible targeted correction, but **current head `266380d` has no associated GitHub Actions run yet** and remains NOT CI-VERIFIED.
- Current-head Vercel statuses were pending at inspection; previous Vercel build-rate-limit failures are external preview-provider failures, not application test results.
- Do not rerun the obsolete #1616 head. The next validation must be one consolidated CI run against exact head `266380d8a2a4665c5f2c827b94753b8a1f3e0940` (or a newer grouped fix head if review finds another defect). The connected GitHub actions currently available here do not expose workflow dispatch, so do not claim that run was started.
- PR #138 remains OPEN / DRAFT / UNMERGED, 1,943 changed files. Its source head is `c15b9f20ac7a43b2566cac2c2e81eb9df91f4e88`; the preservation branch was verified identical before this memory update. Keep source and preservation refs identical using expected-SHA fast-forward only. Never wholesale merge #138.
- No staging/production DB writes, migration application, grants/default-ACL/RLS changes, provider calls, worker activation, Render changes, deployment, restart or release occurred.

**Next:** run one exact-head consolidated CI for PR #170 at `266380d`; inspect every substantive job. If green, retain it as a prepared draft and report that merging it triggers staging release and still requires separate authorization. If red, batch the related corrections before another CI run. No reviewer requests and no duplicate/small-change CI runs.


## Latest continuation checkpoint — 26 November 2026, 20:10 UTC (PR #170 consolidated CI diagnosis)

- Current develop baseline remains 6ce2d0920e319a6623eb7102a4838964c7b4ee35. PR #170 remains OPEN / DRAFT / UNMERGED against develop, branch integration/pr138-bulk-remediation-2026-11-26, exact source head 266380d8a2a4665c5f2c827b94753b8a1f3e0940, 604 changed files. The branch compares 10 commits ahead / 0 behind develop; it is mergeable but not release-authorized.
- Exact-head Actions run #1617 (run ID 45880442111) on 266380d completed FAILURE. Lint & Typecheck, Mobile Flutter analysis/tests, Migration Full Apply against disposable PostgreSQL, and E6 Boundary Lint passed. Unit Tests + Coverage, Integration Tests, and Web & Admin App Tests failed. Build, Contract/Codegen, Container Smoke, k6 and Staging Release were skipped downstream. Vercel success contexts are not substitutes for the failed mandatory Actions jobs.
- Root-cause clusters from failed job logs:
  1. API unit fixtures still mock the pre-actor-context database interface: missing withActorContext, incomplete Drizzle query chains (select/from/innerJoin), and outdated dispatcher/worker fixtures. Some assertions also encode superseded authorization/status behavior; update fixtures to current contracts without weakening production guards.
  2. PostgreSQL integration fixtures need the current DatabaseService.withActorContext wrapper and real tenant/caller context. Worker fixtures also omit the injected tenant-context service (getStoreTenantContextForSystem); fix test module providers and actor-scoped fixture setup, not production fallbacks.
  3. Web recovery/navigation tests expose actual or fixture-level regressions in buyer self-service loading/error recovery, merchant returns default-store selection, merchant route hydration/redirects, and Product Studio disabling navigation during save. Inspect component behavior and tests together; do not simply delete or relax regression expectations.
- Do not merge PR #170 yet. The next implementation pass must group API unit fixtures, shipping/worker + PostgreSQL integration fixtures, and Web/Admin regressions into one coherent correction set. Then run one consolidated exact-head CI only after grouped repairs are ready. Do not rerun the old run, dispatch per-file CI, or count skipped jobs as passes.
- PR #138 remains OPEN / DRAFT / UNMERGED and protected as source/evidence only; its 1,943-file diff is not a release merge candidate. Source branch remediation/phase-0-1-tenant-security and preservation branch preservation/pr138-remediation-2026-11-25 were verified identical at the previous checkpoint and have been synchronized after this memory update using a non-force expected-SHA fast-forward. Never wholesale merge PR #138.
- No reviewers are required or requested, per user instruction. No shared/staging/production database writes, migrations applied, grants/default-ACL/RLS changes, provider calls, worker activation, Render changes, deployment, restart or release occurred. Merging PR #170 may trigger staging release and remains explicitly unauthorized without separate user approval.

Next: complete the grouped PR #170 fixture and Web/Admin repairs, preserve the current develop-only behavior, then perform one exact-head consolidated CI. Keep PR #170 draft until mandatory checks pass and staging-release authorization is separately granted.


## Continuation investigation — PR #170 failed-suite root-cause refinement (26 November 2026)

- Reconfirmed exact PR #170 head remains 266380d8a2a4665c5f2c827b94753b8a1f3e0940; PR #170 OPEN / DRAFT / UNMERGED, base develop at 6ce2d0920e319a6623eb7102a4838964c7b4ee35, 604 changed files, 10 commits ahead / 0 behind. No newer PR-triggered workflow run is associated with this exact SHA. Do not merge.
- Detailed failed-run #1617 / 45880442111 log triage: API Integration Tests had 472 failed assertions spanning many suites; Unit Tests + Coverage also failed across identity, catalog, orders, returns, shipping and outbox tests. The failures are not one isolated test fixture. Repeated root signatures include withActorContext missing on plain `{ db: innerDb }` test doubles, services passed raw Drizzle handles instead of DatabaseService, stale actor/tenant authorization fixtures, and worker test constructors that still pass only the old eight dependencies although ShippingCarrierWorker now requires twelve (including storage, merchant tenant-context lookup and webhook routing).
- Shipping worker proof points: m73b331-handle-cancel.spec.ts and m73b3321-retry-state-foundation.spec.ts create `{ db: innerDb }` without withActorContext and instantiate ShippingCarrierWorker with eight arguments; production worker now calls DatabaseService.withActorContext and MerchantService.getStoreTenantContextForSystem. Repair test doubles with an explicit actor-scope adapter and required merchant/webhook collaborators; never add a production fallback that bypasses tenant validation.
- Integration proof points: p4-http-authorization uses the real DatabaseService wrapper but still emits errors where a service's expected tenant/actor context is absent. Other suites instantiate services with a DatabaseService wrapper or raw Drizzle handles inconsistently; classify each suite and correct fixtures/actor principals. Do not relax authorization expectations or use a permissive default actor.
- Web/Admin job result: Web app test suite had 9 failures / 221 tests (6 files failed, 31 passed). Confirmed test-harness issue in buyer-self-service-recovery.test.tsx: mocked useAuth creates a new user object on every render, changing the useCallback dependency and retriggering reads; use one stable hoisted user object. Hydration merchant-route tests render MerchantLayout without AuthProvider, so useAuth stays at its default `{user:null, loading:true}` and the gate never resolves; wrap the document-root tree with the real AuthProvider and retain the real route gate assertions. Merchant returns display truncation currently slices the subOrderId to 8 characters while the test expects the separating hyphen too; inspect and align the display/test contract deliberately.
- Product Studio test failures need a focused contract review before changing logic: continueProductStudioStep currently skips persistence whenever productId exists, while one test expects an existing-product update attempt on failure and another expects no duplicate creation after a product ID is already persisted. Resolve the distinction (dirty/update state vs already-persisted state) from useProductStudio/handleSaveProduct semantics; do not guess. ProgressIndicator already computes `canNavigate = !disabled && ...`; inspect the exact failing rendered button set before changing this guard.
- No code fixes or new CI runs were made during this diagnostic pass. No staging/production DB writes, migrations, provider calls, worker activation, deployments, restarts, or releases. User waives reviewer requests and asks to batch related fixes into fewer CI campaigns.

**Next:** make a bounded, source-reviewed correction batch for shared API test adapters and worker constructor fixtures, then align Web test harness and confirmed display issues. Separately reconcile actor identity/tenant fixture setup across integration suites and resolve Product Studio's save-state contract. Run one consolidated exact-head CI only after the whole correction batch is implemented and locally validated; preserve PR #138 and do not merge PR #170 without separate staging-release authorization.


## PR #170 grouped fixture correction commit — 26 November 2026

- Added one consolidated source commit to PR #170 branch `integration/pr138-bulk-remediation-2026-11-26`: `ee6d99fb016a41a4451fdc90a8cd8baef20c3447` (message includes `[skip ci]`; no CI run was started). PR #170 is now OPEN / DRAFT / UNMERGED at this head, 606 changed files, base develop `6ce2d0920e319a6623eb7102a4838964c7b4ee35`.
- Six paths updated in that grouped commit: stable `useAuth` mock identity in buyer self-service recovery tests; real `AuthProvider` wrapper in both merchant hydration gate tests; merchant returns suborder display truncation adjusted from 8 to 9 characters to retain the hyphen expected by the UI contract; two carrier-worker unit fixture files now supply a no-op test actor-context wrapper, authoritative store→org and order→store fixtures, plus the three constructor collaborators added after the worker signature expanded (storage, merchant tenant-context provider, webhook routing). Constructor has 11 dependencies total; prior memory note calling it 12 was a count error.
- These changes are code-reviewed against the current PR #170 source and exact CI failure traces but are NOT locally executed or CI-validated yet. The commit was deliberately marked skip-ci to avoid a partial validation campaign while the much larger API integration/unit fixture remediation remains in progress. Do not claim these tests pass.
- Exact-head PR #170 run #1617 remains the last validation: API unit/integration and Web tests failed; lint, Flutter, disposable migration full apply and E6 boundary lint passed. Continue resolving broad API actor-context fixture failures and the Product Studio save-state ambiguity before one consolidated exact-head CI run.
- PR #138 remains OPEN / DRAFT / UNMERGED and protected. Its source branch and preservation branch are synchronized after this memory update by expected-SHA non-force fast-forward only. No PR merge, shared/staging/production DB write, migration application, deployment, worker activation, provider call or release occurred. No reviewers requested.


## PR #170 Product Studio save-state correction — 26 November 2026

- Added grouped commit `c2df23f6500a4b4b7a40ebe5ddbd1fc8eabc2d22` to `integration/pr138-bulk-remediation-2026-11-26` (commit message includes `[skip ci]`). PR #170 remains OPEN / DRAFT / UNMERGED at this exact head, base `develop` at `6ce2d0920e319a6623eb7102a4838964c7b4ee35`, 606 changed files, mergeable true. No PR-triggered workflow run is associated with this commit; it is not CI-validated.
- Product Studio's save contract is now explicit: `continueProductStudioStep` accepts `isDirty`; on the Offer step it persists a new product or dirty existing product before advancing, but does not redundantly save an already-persisted clean product. `ProductStudioPage` forwards the hook's `isDirty` state from both progress-step navigation and the Next button. The regression test for failed existing-product update marks the product dirty; the clean persisted-product test continues to assert no duplicate save. This is based on `useProductStudio`'s existing dirty-state tracking and `handleSaveProduct` create/update semantics.
- This commit and prior grouped fixture commit are source changes only. No local test execution or CI validation has occurred; do not claim the fixes pass. The remaining `ProgressIndicator` failing test still needs exact rendered-button triage, and the API unit/integration suites still have broad actor-context fixture failures (483 logged missing-method occurrences in Unit Tests, 26 in Integration Tests, plus tenant-context, DB mock and outbox test-contract errors).
- No reviewer requests, PR merges, staging/production DB writes, migration application, deployment, worker activation, provider calls, restarts or release occurred. Preserve PR #138; do not merge PR #170 until all mandatory exact-head CI jobs pass and staging-release authorization is separately granted.

## PR #170 outbox test-contract correction — 26 November 2026

- Reconfirmed PR #170 is OPEN / DRAFT / UNMERGED against develop, 606 changed files. The current branch head after this correction batch is `c5f3ee0d29b31d5743040c71766986e68663ede1`; no Actions run is associated with this head. The previous exact-head run #1617 (`45880442111`) remains historical evidence only.
- Reviewed the production `OutboxDispatcher` contract in `apps/api/src/common/outbox/outbox-dispatcher.service.ts`: it is intentionally a transactional outbox writer only. It has no generic poll/dispatch method until a real delivery adapter is configured; it must leave rows PENDING and must never treat logging or an absent publisher as successful delivery.
- Corrected stale tests accordingly:
  - `apps/api/src/__tests__/unit/common/outbox/outbox-dispatcher.spec.ts` now verifies automatic polling remains disabled, events are persisted as PENDING, and an explicitly supplied transaction client is used.
  - `apps/api/src/__tests__/integration/m723c-carrier-operations.postgres.spec.ts` now verifies generic dispatcher initialization leaves both generic and carrier events PENDING, then tests the dedicated carrier worker independently.
  - `apps/api/src/__tests__/integration/p13-financial-dispute.postgres.spec.ts` FIN-DSH-42 now verifies two generic dispatcher instances do not mutate a pending event while no delivery adapter exists; removed stale dispatch/poll assertions.
- These are source-reviewed contract corrections only. They have not been locally executed or CI-validated. Commits: `7c1d094cf73fe46e2803f3583abbedfecb540bf8` and `c5f3ee0d29b31d5743040c71766986e68663ede1`, both marked `[skip ci]` to avoid fragmented CI while the larger API actor-context and tenant fixture repair remains unfinished.
- Remaining API failures are still broad: old unit mocks lack `withActorContext` and/or Drizzle query methods; integration suites still construct DatabaseService/service fixtures inconsistently and omit explicit actor/tenant context; shipping worker tests need tenant-context collaborators; other stale assertions remain. Do not add permissive production fallbacks or weaken authorization.
- Web/Admin run #1617 was on the older head and its Product Studio save-state failure is now addressed by the later dirty-state commit `c2df23f6500a4b4b7a40ebe5ddbd1fc8eabc2d22`; progress-navigation failure still needs focused triage. The current ProgressIndicator source already disables all mapped steps when its `disabled` prop is true; inspect the exact test/runtime setup before changing component guard logic.
- PR #138 remains OPEN / DRAFT / UNMERGED and is preservation/source material only. Its source and preservation refs were verified identical at `eb3a1e0bdeb25aa3c760b559261e4fda0113a2ae` before this memory update. Keep them identical with expected-SHA non-force fast-forward only; never merge PR #138 wholesale.
- PR #170 is not merge-ready. A fresh consolidated exact-head CI is still required only after the bounded API actor-context, tenant-aware worker/integration, and web test repairs are complete. No reviewers requested. No shared/staging/production database writes, migration application, provider calls, worker activation, Render changes, deployment, restart, or release occurred. Merging PR #170 may trigger staging release and remains unauthorized without separate user approval.

## PR #170 grouped actor-context fixture repairs — 26 November 2026

- Latest PR #170 branch head: `6fd15bc53f329fbb3caea2f7ce51acbb40ed6256`, OPEN / DRAFT / UNMERGED against `develop` at `6ce2d0920e319a6623eb7102a4838964c7b4ee35`; 606 changed files. No workflow runs exist for the latest head. The historical run #1617 (`45880442111`) predates these later corrections and must not be represented as validation of them.
- CI log analysis found broad stale test fixtures, not justification to weaken production actor/tenant checks. Historical unit log contained 154 `withActorContext is not a function` occurrences plus raw Drizzle query-shape failures. The three highest-volume identity integration fixtures (password login, account linking, device-trust lifecycle) were passing `{ db }` plain objects around a raw Drizzle instance. Replaced those with actual `DatabaseService` instances and assigned the test Drizzle handle through the public `db` setter, so the real transaction-local actor context is exercised.
- Repaired additional test doubles:
  - `ops-alert-concurrent-delivery.spec.ts`: provide an explicit async `withActorContext` wrapper for system-scoped alert operations.
  - Catalog category ownership, media read actor-context, and media/variant scope fixtures now provide the organization-member and active-organization query methods used by tenant scope, rather than failing through a missing Drizzle `select` fallback.
  - `order-carrier-lookup.spec.ts`: now provides the Drizzle select/from/innerJoin/where/limit chain required by the production query.
  - `m73a-delivery-completion.postgres.spec.ts` and `p415-webhook-delivery.postgres.spec.ts`: replaced plain object casts `{ db } as DatabaseService` with real DatabaseService instances, so worker and OpsAlertService actor scopes run on the test transaction.
- Related commits on PR #170:
  - `a024e1d6e3f053acd12aacde54a53dd87be945ad` — actor-aware DatabaseService wrappers for three identity PostgreSQL suites.
  - `0380c419aa5f2a9eb3dec8aa7d332e8e9681d6af` — OpsAlert and catalog actor/tenant-aware unit fixtures.
  - `6fd15bc53f329fbb3caea2f7ce51acbb40ed6256` — delivery worker/webhook integration DB wrappers and carrier lookup query fixture.
- These changes are source-reviewed but have not been locally executed or CI-validated. All commits are `[skip ci]` to avoid fragmented runs while the larger API fixture backlog is still being repaired.
- Earlier commits `7c1d094` and `c5f3ee0` corrected obsolete generic outbox polling tests to match the current write-only OutboxDispatcher contract; the generic dispatcher must leave events PENDING until a real delivery adapter exists. Do not reintroduce generic polling/acknowledgement assertions.
- The prior CI Web/Admin failures were on an older head: buyer recovery stable auth mock, AuthProvider hydration fixtures, returns suborder display, and Product Studio dirty-save behavior have subsequent source fixes. The ProgressIndicator disabled-navigation test remains to be rechecked on the current source; the component guard already uses `!disabled`, so inspect exact rendered controls before changing it.
- Remaining API fixture clusters still require review, including additional tenant-aware worker/service tests and integration suites. Do not use a permissive global test monkey-patch; tests must provide explicit caller/worker context and real query contracts. No production fallback, actor authorization, or tenant isolation guard may be weakened.
- PR #138 remains OPEN / DRAFT / UNMERGED and is source/preservation only. Its source and preservation refs must remain identical using expected-SHA non-force fast-forward. Never merge PR #138 wholesale.
- No reviewers requested. No shared/staging/production database writes, migrations, provider calls, worker activation, Render changes, deployments, restarts, or releases occurred. PR #170 remains draft; do not merge until mandatory exact-head CI passes and the user separately authorizes the staging-release/migration step.
