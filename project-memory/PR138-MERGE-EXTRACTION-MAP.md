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



# PR #138 — Merge and Extraction Map

**Checkpoint:** 25 November 2026  
**Repository:** `nabeel2323/scs-platform`  
**Source PR:** #138, `remediation/phase-0-1-tenant-security`  
**Policy:** Preserve the source history; do not merge this PR wholesale.

## 1. Current shape and risk

The current PR snapshot has 1,927 changed paths, 103,324 additions and 414,491 deletions. The PR is OPEN / DRAFT / UNMERGED, reports `mergeable=false`, and its comparison to current `develop` is 2,742 commits ahead / 3 behind. The PR base recorded in its metadata is older than current develop.

Changed-path inventory:
- 1,277 paths under `.m73b6-scratch/`.
- Three additional scratch PostgreSQL suites under `apps/api/src/__tests__/scratch/`.
- 650 remaining paths outside `.m73b6-scratch/`.
- Main non-scratch groups: `apps/api` 331, `apps/admin` 87, `apps/web` 72, `mobile/lib` 38, `mobile/test` 31, `docs/remediation` 34, `infra/drizzle` 15.
- The changed-file inventory contains a token-named path whose current-branch content lookup did not resolve. Its status is unresolved; do not print, copy or extract any token-like artifact.

The scratch snapshot and any generated/test-only material are not release candidates. Do not delete them from the preserved source branch; exclude them from extraction unless a specific test is independently reviewed and deliberately moved into a supported test location.

## 2. Confirmed overlap with other open PRs

Counts are path intersections between each PR's changed-file list and PR #138's changed-file list at this checkpoint.

| PR | Changed files | Shared paths with #138 | Integration treatment |
|---|---:|---:|---|
| #144 | 7 | 7 | Reconcile entirely against #138; do not merge both copies blindly |
| #153 | 10 | 6 | Prefer the focused outbox/dispatcher PR after exact-head CI and independent review; remove/supersede duplicate paths in #138 extraction |
| #154 | 13 | 9 | Prefer the focused order auto-completion PR after exact-head CI and independent review; later combine its lease behavior with G-002 worker context |
| #151 | 12 | 5 | Reconcile P6 test/runtime paths and keep scratch suites out of release |
| #150 | 2 | 1 | Reconcile shared code before integration |
| #156 | 3 | 1 | Reconcile credential/log-redaction overlap; require security review and explicit follow-up decision |
| #155 | 1 | 0 | Independent staging-access documentation; retain as a separate evidence item |
| #145 | — | 0 same-path | Distinct migration filename but migration-number collision at 0070; resolve ordering/content before either migration is promoted |

The overlap counts are not a merge authorization. Review the actual diff, dependencies, migrations and acceptance evidence for every shared path.

## 3. Proposed bounded extraction groups

After the focused PRs above are resolved and `develop` is refreshed, extract only the remaining, non-duplicated changes into a small number of workstream PRs:

1. **Database security and tenant context:** DatabaseService actor-context primitive, scoped interceptor/adoption, explicit user/worker/system/bootstrap/audit/anonymous principals, operation/ownership matrix, migration/operator boundaries and G-002 documentation.
2. **Commerce and financial correctness:** order lifecycle, checkout, payments/refunds/settlements, inventory, returns and shipment state transitions. Keep payment and settlement scope decisions intact.
3. **Workers and external integrations:** outbox ownership, carrier processing/reconciliation/webhooks, auto-completion, return expiration, operational controls/alerts and notification reliability. Keep provider I/O outside database actor transactions.
4. **Client workflow parity:** only the remaining reviewed Admin, Web and Flutter/API contract changes, with permission, empty/error/loading and state-transition behavior mapped to backend contracts.

The exact path manifest must be generated from the refreshed PR diff after #153/#154/#156 and other overlaps are reconciled. Do not assume the current path counts equal the final extraction size.

## 4. Required integration order

1. Keep PR #138 and its preservation ref intact; do not rebase or force-push the original source branch.
2. Finish exact-head CI and independent review for focused PRs. PR #154's newly added PostgreSQL lease tests require the current exact-head run; its earlier green run does not validate the new tests.
3. Merge only reviewed focused PRs into `develop`, one dependency-safe batch at a time. Reconcile #145's migration 0070 collision before migration promotion.
4. Refresh `develop`; regenerate the PR #138 changed-file list and overlap matrix against the new base.
5. Create clean branches from current `develop` for the four extraction groups. Cherry-pick only when commit boundaries are clean; otherwise apply selected, reviewed file changes while retaining the source PR and commit references in the manifest.
6. Run targeted/local checks during implementation and one consolidated CI per completed workstream PR. Do not run CI for every small edit.
7. After all extraction PRs are merged, run one consolidated `develop` release-candidate CI and resolve the separate `main`/`develop` history divergence before release promotion.

## 5. Explicit non-actions and release gates

- No wholesale merge of PR #138.
- No deletion, rewrite or reset of the original PR #138 branch or its preservation ref.
- No extraction of scratch artifacts or token-like files.
- No migration, RLS enablement, grant/default-ACL change, shared/staging database write, Render configuration change, worker activation, credential rotation or deployment without the separately required authorization.
- CI success is not independent security approval, live staging identity evidence, production acceptance or release approval.


## 26 November 2026 — first bounded PR extraction

Created draft PR #157, **G-002 Slice A: Database actor-context foundation**.

- Source branch `integration/g002-actor-context-foundation` starts from current `develop` (`fde20420bbb759d2e562f9ff747c9e824ac58e25`).
- PR #157 head `e3bc1ba21d67ec4947824acf278529e543487eb1`, 17 files, 1,040 additions / 43 deletions, OPEN / DRAFT / UNMERGED, mergeable=true at verification.
- Slice contains the actor-context primitive, runtime identity guard, tenant interceptor/scope helpers, environment/OTP gates, required operator context/local migration config dependencies and focused tests. It contains no migration or RLS/grant changes.
- It preserves the three commits present only on develop: `9530d87`, `d800e5b`, `fde2042`. No wholesale PR #138 merge or cherry-pick of unrelated paths occurred.
- Exact-head Actions has no runs; Vercel Web/Admin show build-rate-limit failures only. No tests/lint/typecheck/build/CI run.
- Next slices: (B) bounded application actor-context adoption, (C) workers/webhooks, (D) operator/migration runner. Keep each separate and run one consolidated CI campaign after the workstream is assembled.


## Final live checkpoint before this memory commit — 26 November 2026

- PR #138: OPEN / DRAFT / UNMERGED, mergeable=false, 1,942 changed files. Source head before this documentation commit: `f7894abe85b9e9c053e51a730dbfd1c51f6adf21`; preservation ref identical. `develop` `fde20420bbb759d2e562f9ff747c9e824ac58e25`; compare 2,892 ahead / 3 behind from merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`. Exact-head Actions: no runs.
- PR #157: OPEN / DRAFT / UNMERGED, mergeable=true, 19 files, head `77145bc6262aba99cf7fdbd45139382bebc44fa7`, base `develop` at `fde20420bbb759d2e562f9ff747c9e824ac58e25`.
- PR #158: OPEN / DRAFT / UNMERGED, mergeable=true, 3 files, head `2e57a2deed1efb5c02de05d23b7ec10b668271c0`, base PR #157 branch at `77145bc6262aba99cf7fdbd45139382bebc44fa7`.
- PR #157/#158 exact-head Actions lookups: no runs. Vercel Web/Admin build-rate-limit failures only. No tests, lint, typecheck, build or CI have run for either slice.
- The preservation branch will be fast-forwarded to the new source documentation commit without force. PR #138 remains the source/evidence branch; do not merge it wholesale.
- No migrations, SQL/catalog access, RLS/grants/default ACL, staging/shared DB writes, worker activation, provider/storage calls, bootstrap, deployment or merge occurred.


## Live integration checkpoint — 28 November 2026, 23:00 UTC

- PR #181 was merged into `develop` with merge commit `fc5e077e8043926db65732f3f6f1bcf204a5997e`. Its tested source head was `cd345553d6afe5d7e1562e56fb67bd9d030b40d3`; exact-head CI #1769 / run `46181607343` completed SUCCESS across all 10 mandatory jobs. k6 and staging release were skipped. PR #181 brought in refund actor-context coverage, read-only staging-user diagnostic hardening and fail-closed local migration-verification guards with fake-psql tests.
- The current `develop` head is `fc5e077e8043926db65732f3f6f1bcf204a5997e`. No GitHub Actions run was returned for the merge commit; do not imply merge-commit CI. The current workflow `.github/workflows/ci.yml` explicitly hard-disables automatic staging release (`if: false && ...`), so merge to develop did not authorize or trigger the separate manual release workflow.
- Focused predecessors are now merged: PR #170 (638 paths), #157 (33 paths), #158 (6 paths), and #169 (13 paths). Their merged implementations are already in develop; do not reimplement them. PR #181 is also merged. PR #138 remains OPEN / DRAFT / UNMERGED at source head `81f30f5c30654b233ef373c15fd3f2cb867aba01`; preservation ref was verified identical at the same SHA before this memory update.
- Recomputed PR #138's non-scratch tree blob differences against current develop using complete, non-truncated recursive trees: 165 paths differ by blob SHA. This set includes 51 API integration tests, 53 API unit tests, 31 API source/scripts (including three under `apps/api/src/__tests__/scratch/`), 10 Web/Admin paths, five migration/verifier scripts, three docs, eleven project-memory files and one workflow. This is a raw blob-difference inventory, not the final extraction manifest; paths already delivered by merged PRs, generated/scratch tests, token-named artifacts and stale/overlapping code must be separately excluded. Do not rely on the older estimate of 41 paths without revalidation.
- Remaining migration files 0070, 0071 and 0074 are held for sequencing/ownership/ACL reconciliation; PR #181 has merged the manual local verification target guards, not the migration DDL. Do not apply migrations or modify staging grants/default ACL/RLS without the protected approval process.
- Next: compare each of the 165 differing paths with the merged PR manifests and current implementation, then create a clean extraction manifest for only still-needed non-scratch source/tests/docs. Preserve develop's newer DatabaseService, interceptor, OutboxDispatcher, bootstrap issuer, shipping worker and actor-context code. Review frontend UX files as a separate bounded slice. PR #138 source and preservation refs must remain synchronized by expected-SHA fast-forward only; never merge PR #138 wholesale.
- No database connection/script execution, staging or production DB write, migration, seed/reset/bootstrap, grants/default ACL/RLS change, provider call, worker activation, Render change, deployment, restart or release occurred.
