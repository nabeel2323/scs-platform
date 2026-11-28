## PR #178 merged — carrier tenant actor-context guard — 28 November 2026

- PR #178 is MERGED into `develop`: https://github.com/nabeel2323/scs-platform/pull/178
- Squash merge commit: `9a885762f3040b2761b352e999d1ccc21b396931`; reviewed head: `bc300e93572e9671680dec2d8ea911508e85b5fd`.
- Exact-head CI run #1737 / GitHub run `46135480156` completed successfully: all 10 mandatory jobs passed (Lint & Typecheck, Mobile, Integration, Unit/Coverage, Boundary Lint E6, Web/Admin, Migration Full Apply, Container Build & Smoke, Contract Spec & Codegen, Build). k6 Smoke and Trigger Staging Release were skipped.
- Source review covered all six changed files. Shared `assertCarrierTenantActorContext` permits active user/worker/system actors only when bound to the exact requested org; rejects null-org, mismatched-org and anonymous/authentication/bootstrap/audit contexts. Aramex retains separate store-owner discovery and org-bound credential/configuration scopes; no actor switching inside an active transaction.
- This is actor/tenant contract hardening; no confirmed exploit was established. No staging DB, Render, provider, worker activation, credentials, grants, default ACLs, RLS, deployment or release operation occurred.
- PR #176 remains merged at `f3e9105a075b9a5b37f6acd3469ec91eaa09d9f7`. PR #138 remains OPEN/DRAFT/UNMERGED and its preservation source/ref must remain untouched. PR #175 remains separate and OPEN/DRAFT/UNMERGED.
- Next G-002 work is separate: complete carrier tracking-poller and reconciliation worker operation-to-table / shipment → order → store → organization lineage; define explicit scoped system-worker policy; review webhook/outbox actor nesting and direct PostgreSQL Client/Pool entrypoints. Group source/tests and run one consolidated exact-head CI. Do not broaden the merged PR #178.
- Continue respecting the staging-release hold and do not perform DB/Render/deployment/provider/worker/RLS/grant/credential actions without their separate authorization.

## G-002 carrier actor-context guard — PR #178 — 28 November 2026

- PR #176 is merged to develop at `f3e9105a075b9a5b37f6acd3469ec91eaa09d9f7`; exact-head CI #1727 passed all mandatory jobs, including container smoke.
- PR #178: https://github.com/nabeel2323/scs-platform/pull/178. Draft/open/unmerged, target develop. Branch `fix/g002-carrier-actor-context-guard-20261128`; current head `bc300e93572e9671680dec2d8ea911508e85b5fd`. One initial test fixture typing failure was fixed in a follow-up commit; exact-head CI run #1737 / GitHub run `46135480156` is now testing the corrected head.
- On exact head `bc300e9`, lint, typecheck, format, Flutter analyze/tests, Web/Admin tests, Boundary Lint E6, and Migration Full Apply have passed. API unit/coverage and PostgreSQL integration remain in progress. Do not merge until those pass, and inspect Container Build & Smoke Test / contract-codegen / build once they start. Staging release and k6 are not expected.
- PR #178 adds shared `assertCarrierTenantActorContext`: active user/worker/system contexts must be bound to the exact requested organization; null-org, mismatched-org, anonymous, authentication, bootstrap and audit contexts are rejected. Fresh calls open a dedicated org-bound worker transaction.
- Aramex now constrains store-owner lookup to the current org when already in a tenant context. Unscoped store-owner discovery is permitted only on a fresh short worker transaction; the scope closes before org-bound configuration/credential lookup. Actor switching inside an active transaction remains forbidden.
- This is contract hardening; no exploit was established. SQL predicates already include organization IDs. No staging DB, Render, provider, worker activation, credential, grants, default ACL, RLS or deployment operation was performed.
- Further worker lineage review: `ShippingCarrierWorker.assertOutboxTenantMatchesShipment` verifies event store/org against authoritative store and verifies order.storeId equals shipment.storeId before provider side effects; subsequent shipment updates use the resolved org-bound worker context. The tracking poller and reconciliation service still perform global unscoped worker claims/order-store checks and several shipment updates by ID without a per-tenant actor context. Treat these as a separate G-002 worker/system-principal design and regression-test workstream; do not silently broaden PR #178.
- PR #138 remains OPEN / DRAFT / UNMERGED and its preservation branch/source remain untouched. PR #175 remains OPEN / DRAFT / UNMERGED and separate.
- Next: finish #178 exact-head CI; if green, source-review and merge to develop. Then continue G-002 tracking/reconciliation worker operation-to-table lineage, webhook/outbox nesting, direct PostgreSQL Pool/Client inventory and migration object/ownership crosswalk. Keep implementation grouped and avoid unnecessary CI campaigns.

## PR #177 — carrier credential actor-context hardening — 28 November 2026

- Draft PR: https://github.com/nabeel2323/scs-platform/pull/177
- Branch: `fix/g002-carrier-actor-context-20261128`; exact head `1e79ebac50fb50109d254bca71b94bf7a805242f`; base `develop` at `246f1235bcaa89a7b40614cb65d39ac3ce5ff529`.
- Source changes: carrier credential decryption, carrier configuration resolution and Aramex credential lookup now require an existing actor to be a `worker` with `activeOrgId` exactly equal to the requested org (including exact null-org equality for store-owner discovery). With no active actor, each helper establishes its own worker scope as before.
- Tests added/extended for exact worker context, null-org user, mismatched worker, system/anonymous/authentication actors, null-org Aramex store-owner discovery, and tenant-bound Aramex credential lookup.
- Callsite review: Aramex provider calls are made after short DB actor scopes have completed in ShippingCarrierWorker, CarrierTrackingPoller, CarrierReconciliationService and the shipment tracking route. Provider lookup establishes its own worker contexts. CarrierWebhookController performs global credential discovery in a separate null-org worker scope and secret decryption in a credential-org-bound worker scope. The two-stage lookup is preserved.
- `findCredentialId` has no production callsite in the reviewed shipping module; a complete wider API source scan remains outstanding. The helper behavior is a tenant/actor contract-hardening issue; no exploitability claim is made.
- Exact-head CI run #1733 / `46131141943` is IN PROGRESS. Initial jobs observed: Lint & Typecheck and Mobile Flutter. Vercel Web/Admin checks report external free-plan build-rate-limit failures; do not trigger redundant Vercel builds. Wait for mandatory GitHub Actions results before considering merge.
- Source/tests only. No staging DB access or writes, provider calls, worker activation, Render mutation, deployment, credentials/grants/default-ACL/RLS changes or release occurred.

## G-002 carrier actor-context callsite pass — 28 November 2026

- Reviewed the current `DatabaseService.withActorContext` contract: an existing async actor scope is reused only for an identical normalized actor; attempting to switch actor inside the active transaction throws. This confirms any two-stage store-owner → tenant credential resolution must use separate completed scopes, not nested actor switching.
- Production callsites confirmed in the shipping source tree:
  - `AramexProvider.resolveCredentials` first reads the store's owning `orgId` under a null-org worker context; then resolves configuration and credential data using the resolved exact organization. `resolveCredentialsById` rechecks credential ID + org + provider + active status before decrypting.
  - `CarrierWebhookController` performs webhook-token/provider credential discovery in a separate null-org worker scope, then decrypts the secret inside a worker scope bound to the selected credential's `orgId`.
  - No production callsite for `findCredentialId` was found in the reviewed shipping module files; verify across the complete API source tree before deciding whether to deprecate it.
- Both carrier service helpers currently reuse any existing actor context. For existing user/worker contexts they reject only a non-null mismatched org; null-org user/worker contexts are not rejected. Anonymous/authentication/system/bootstrap/audit actor kinds are also reused without an explicit allowlist. Aramex's helper has the same pattern. This is a contract-hardening target, not yet a proven exploitable vulnerability; SQL predicates currently include explicit organization IDs.
- Existing unit coverage is incomplete for this contract: carrier configuration tests cover the no-active-context worker creation path, but not matching/mismatched/null-org user/worker or actor-kind allowlisting. Add the actor matrix in one grouped source/test change and include the deliberate webhook/platform-system flows.
- Preserve the intentional unscoped credential discovery only where it is explicitly required for webhook-token routing or store-owner discovery; keep all secret decryption and tenant-specific configuration/credential reads org-bound.

## Latest continuation — PR #176 merged, G-002 next — 28 November 2026

- PR #176 (staging bootstrap DB identity guard) passed exact-head CI run #1727 / GitHub run `46125790492` on `dc7572e53b09a38cd9979cd76d0b22717c0f35cb`. All ten mandatory jobs passed, including Container Build & Smoke Test; k6 Smoke and Trigger Staging Release were skipped as expected.
- PR #176 was marked ready (no reviewers requested) and squash-merged into `develop`. Merge commit: `f3e9105a075b9a5b37f6acd3469ec91eaa09d9f7`. The merge used expected-head protection. No staging DB, Render, deployment, provider, worker, grant, RLS or credential operation was performed.
- PR #138 remains OPEN / DRAFT / UNMERGED at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; preserve its source and synchronized preservation ref unchanged. PR #175 remains OPEN / DRAFT / UNMERGED and separate from G-002; do not merge it as part of this remediation.
- G-002 next: continue callsite and actor-context nesting review for carrier credential/configuration services and Aramex. The current `withInternalContext` helpers allow reuse of an existing actor when a user/worker has `activeOrgId === null`, and also reuse other actor kinds; Aramex's helper has the analogous null-org/other-actor behavior. This is a potential contract/tenant-boundary gap, not yet a proven exploitable vulnerability. Trace all callers and distinguish deliberate platform-system cross-org operations before changing behavior.
- Aramex store-owner discovery intentionally uses a null-org context, followed by organization-bound configuration/credential lookup. Preserve this two-stage lookup and do not attempt actor switching inside an active transaction; design any hardening around separate transaction scopes.
- Add grouped tests for exact matching org, mismatched org, null-org user/worker, and explicitly permitted platform-system paths; reject unapproved actor kinds. Complete the worker operation-to-table and shipment → order → store → organization lineage matrix. Then complete the direct PostgreSQL Client/Pool entrypoint and migration DDL/FK/function/trigger/partition/object-owner/default-ACL crosswalk.
- Keep changes source-only until the grouped implementation/tests are ready, then run one consolidated exact-head CI campaign. Do not trigger staging-release/k6 or redundant Vercel builds. Do not mutate staging/Render, activate workers, call carrier providers, alter credentials/grants/default ACLs/RLS, or deploy without separate authorization.

## Latest continuation directive — 28 November 2026

- User explicitly reiterates that all implemented features from PR #138 must be integrated into `develop` and no already-implemented feature should be reimplemented. Follow the completed three-way reconciliation below: 533 identical paths; 95 merged through #170; 12 covered by focused merged PRs; two deliberate exclusions; 20 source-only legacy scripts/conflicting migration/historical docs with no missing application source. Preserve PR #138 and its preservation branch unchanged; only create a bounded PR for a newly proven gap.
- Read-only Render log inspection now directly confirms the live API pool identity from 26 Nov: `postgres`, BYPASSRLS/CREATEROLE/CREATEDB true, TLS false. The standalone migration runner remains a separate principal with non-fatal identity diagnostics and optional TLS. No Render values were changed and no deployment/restart occurred.
- Next G-002 task: complete the 0001–0077 migration DDL/FK/function/trigger/partition/object-owner/default-ACL crosswalk and direct PostgreSQL entrypoint map. Keep runtime/migration role, TLS, grants/default ACLs and RLS changes behind a separate reviewed rollout and authorization. Do not reimplement #170/#157–#174 work.

## G-002 runtime identity and actor-context audit — 28 November 2026

- The application runtime identity guard in `DatabaseService.onModuleInit` rejects production-like runtime sessions that are superuser, BYPASSRLS, CREATEROLE, CREATEDB, own public tables/schema, or lack verified TLS. The source includes a dedicated non-secret identity diagnostic query.
- `DatabaseService.withActorContext` is transaction-bound and uses transaction-local `set_config(..., true)`, but it is explicitly opt-in. `TenantDatabaseContextInterceptor` is also explicitly opt-in, not global; it requires JWT-authenticated request context and revalidates active organization membership inside the same transaction. `AppModule` currently registers AuditLogMiddleware, not this interceptor globally.
- Therefore, do not assume all API routes have database actor context. Continue a route/service callsite inventory and test coverage audit before RLS or runtime-role changes. Include raw SQL, worker, auth, bootstrap, migration, audit and realtime paths.
- Supabase PostgreSQL logs over the inspected last 24 hours showed only the MCP management connection as `postgres` (`application_name=mgmt-api`) plus a `supabase_admin` connection; no `scs-api-staging`/Render application connection was visible. This does not prove the API runtime identity. The live Render service configuration must be inspected to verify the deployed API and migration credentials and TLS.
- The only listed Render workspace is `My Workspace`; a workspace selection is required before reading the staging service's Render configuration. Do not guess the workspace or mutate the service.
- Supabase currently reports PostgreSQL `17.6.1.166`. The current Supabase changelog notes the 17.11 minor release includes security fixes; schedule an upgrade review and downtime/reindex assessment rather than initiating an upgrade blindly.
- Staging DB migration authorization does not authorize RLS activation, runtime credential rotation, Render env changes, service restarts, or deployment. Those require the complete access matrix and a separate controlled rollout plan.

## Staging database authorization and latest state — 28 November 2026

- The user confirms **no production database exists or is provisioned**. Do not describe any environment as production or claim production readiness/verification.
- The user explicitly authorizes source-reviewed changes and forward migrations on the SCS staging database to improve migration cleanliness, schema quality, security and readiness for the future production database. Preserve useful staging data; do not reset/truncate or seed demo data. Destructive changes still require careful preflight and a reversible plan.
- Confirmed staging DB: Supabase project `SCS-PlatForm`, ref `wplsxxevoevzqbgtpctw`, region `eu-west-1`, PostgreSQL `17.6.1.166`. Render hosts the `scs-api-staging` service; this is not a Render PostgreSQL database.
- Applied repository migrations 0072–0077 to staging on 28 Nov 2026 in one transaction, protected by the repository advisory-lock key. The application's `public._migration_log` now contains 77 entries through `0077_carrier_webhook_legacy_manual_review.sql`. Full preflight and post-apply evidence: [Staging database migration reconciliation](../docs/remediation/STAGING-DATABASE-MIGRATION-2026-11-28.md).
- Post-apply checks confirmed credential-scoped webhook FK/indexes, updated ops-alert index, organization-scoped reconciliation version uniqueness, payment-proof upload-intent table and API-role privilege revocation. No webhook/reconciliation history rows were rewritten; existing ops alert was RESOLVED.
- The SQL session used for the staging migration reported `current_user=postgres`, `rolbypassrls=true`, `rolsuper=false`. This is the MCP session identity, not proof of the Render API runtime identity. Verify the actual deployed API and migration-runner roles and TLS independently.
- `anon` and `authenticated` now have no table privileges on public tables; RLS remains disabled on all 115 public tables pending least-privilege runtime role and per-table actor/tenant policy design. Do not enable RLS wholesale.
- Remaining advisor findings: `pg_trgm` is in `public` and owned by `supabase_admin`; 55 unindexed FKs, one pg_partman template table without a primary key, and 275 unused-index observations. Do not mass-move extensions or create/drop indexes without ownership and workload evidence.
- Staging DB changes are authorized. Production DB creation/changes, application deployments/restarts, provider calls, worker activation and staging/production release remain separate actions and are not authorized by this database instruction.
- Do not dispatch the protected staging audit or release workflows automatically. Keep changes grouped and run one consolidated exact-head CI after source implementation is complete.

## Current continuation — 28 November 2026

**Live repository state (verified 28 Nov 2026):**
- Repository: `nabeel2323/scs-platform`; integration baseline: `develop`, source baseline before the documentation-only handoff updates was `2f6bb106e7147b83cdcc98ad93b4ef688e163e84`; the current `develop` tip includes only the subsequent project-memory documentation commits.
- PR #170 and #171 are MERGED. PR #173 (carrier configuration/provider credential binding) and PR #174 (bootstrap CLI database identity and actor context) are also MERGED.
- PR #138 remains OPEN / DRAFT / UNMERGED at `81f30f5c30654b233ef373c15fd3f2cb867aba01`. Preserve the source and synchronized preservation ref; never merge it wholesale, reset, force-push, delete or destructively rebase it.
- Latest develop CI run #1723 / `46085878528` targets prior develop head `4c5c755571385b346902c74c9f4f0578f48d9433`. All ten mandatory jobs passed, including Build and Container Build & Smoke. k6 Smoke and Trigger Staging Release were skipped. Run conclusion SUCCESS; see the [CI run](https://github.com/nabeel2323/scs-platform/actions/runs/46085878528).
- PR #173 exact-head run `46077477944` and PR #174 exact-head run `46080913174` completed SUCCESS. The prior develop run `46080692700` also completed SUCCESS.
- Vercel Web/Admin contexts currently show external free-plan build-rate-limit failures. Do not trigger redundant Vercel builds.
- Open PRs currently include #138 (protected remediation source) and #175 (unrelated draft country/currency reference-data work). Keep #175 separate from G-002 and do not merge it as part of this remediation. No GitHub reviewers are required or should be requested.

**Next implementation priority — G-002 (continue from merged develop):**
1. Complete the source inventory for raw SQL and database functions/triggers/partitions; verify each sensitive operation's exact ownership predicate.
2. Finish the FK-to-tenant ownership crosswalk and actor-context nesting audit across worker, migration, bootstrap/CLI, carrier credential lifecycle/retry/recovery, audit middleware and realtime paths.
3. Reconcile the new PR #173/#174 implementations against the G-002 evidence matrix; do not repeat already merged work.
4. Keep protected read-only catalog/runtime identity verification separate and use only the authorized staging process. Do not dispatch protected audit workflows automatically.
5. Once the grouped source/test batch is complete, run one consolidated exact-head mandatory CI campaign. No per-file CI, no unnecessary Vercel builds.

**Hard safety boundaries remain unchanged:** no staging/production DB writes or migrations; no RLS/grant/default-ACL changes; no provider calls or worker activation; no Render mutations, deployments, restarts or releases; no staging-release workflow dispatch. Do not prepare/apply the dedicated least-privilege API/migration role or TLS rollout until role ownership, actual migration identity, rollback and TLS evidence are verified and separately authorized. Preserve the staging-release safety hold. Never weaken tenant/actor guards or relax state-machine rules to satisfy stale tests.


# SCS Platform — Start Here

**Last updated:** 27 November 2026  
**Repository:** `nabeel2323/scs-platform`  
**Merged integration:** [PR #170](https://github.com/nabeel2323/scs-platform/pull/170) + [PR #171](https://github.com/nabeel2323/scs-platform/pull/171) — bounded PR #138 remediation extraction  
**Protected remediation source:** [#138 — Phase 0–1 tenant/security remediation](https://github.com/nabeel2323/scs-platform/pull/138)

## Read these documents first

1. [PR #138 integration checkpoint](../docs/remediation/PR138-INTEGRATION-CHECKPOINT.md) — branch, reconciliation decisions, validation status and safety gates.
2. [Implementation progress tracker](../docs/remediation/IMPLEMENTATION-PROGRESS.md) — authoritative task-level remediation and evidence log.
3. [Implementation plan](../docs/remediation/IMPLEMENTATION-PLAN.md) — phase order, acceptance criteria and release gates.
4. [Staging database migration reconciliation](../docs/remediation/STAGING-DATABASE-MIGRATION-2026-11-28.md) — live staging migration 0072–0077 preflight, apply and verification evidence.\n5. [README](../README.md) — repository structure and commands.

The newest dated entries in the checkpoint and progress tracker override older historical entries.

## Integration state — 27 November 2026 (PR #170 merged)

- PR #170 was merged into `develop` using a merge commit: `d078fe0124ac04fb0da3fc26f3ff02306c45a33f`.
- The merged integration head was `a249d7368aefa715d32e8480452e8aff61535af6`; tested implementation head `5ba67eb00810d4419b0dfb901596a1eb948b8595` passed exact-head CI #1707 (run `46048745793`): all 10 mandatory jobs passed, including API unit/coverage, integration, migration full apply in disposable CI PostgreSQL, E6, Web/Admin, build and container smoke/health checks. The only later head change before merge was documentation-only.
- k6 Smoke and Trigger Staging Release were skipped. No staging/production database write, migration, deployment, worker activation, provider call or release occurred as part of this merge.
- PR #138 remains **OPEN / DRAFT / UNMERGED** with 1,943 changed files. Source branch `remediation/phase-0-1-tenant-security` and preservation branch `preservation/pr138-remediation-2026-11-25` remain identical at `81f30f5c30654b233ef373c15fd3f2cb867aba01`. Never merge PR #138 wholesale.
- Use the merged `develop` as the only integration baseline. Continue bounded, source-reviewed extraction of remaining work from PR #138, comparing each candidate against current `develop`; preserve PR #138 and its preservation ref unchanged.

## Immediate remaining work

- G-002 remains IN PROGRESS / NOT VERIFIED. Continue the source callsite/nesting and ownership-predicate audit across carrier credential lifecycle/retry/recovery, audit middleware, migration/bootstrap/CLI paths and raw SQL database objects (functions, triggers, partitions); complete exact operation predicates, FK-to-ownership evidence and protected read-only API/migration identity/catalog verification.
- G-001 remains PARTIAL pending independent security review; G-007 full buyer journey/order-detail UAT remains pending.
- Other tracked decisions remain explicit: G-012 (automatic gateway/payout) is a product-scope decision, G-013 has no workload evidence justifying index DDL, G-014 requires repository-admin branch protection, G-021 is absent procurement scope, and G-022 remains a database extension/schema decision. Do not silently implement deferred product or DB changes.
- After implementation/integration is complete, run one consolidated exact-head verification campaign. Do not dispatch per-file CI or unnecessary Vercel builds; no reviewers are required.
- Staging/production migrations, RLS/grant/default-ACL changes, worker activation, provider calls, Render changes, deployments, restarts and releases remain separately controlled actions; this merge did not authorize them.

## Operating decisions and safety boundaries

- Preserve PR #138 and its synchronized preservation branch. Never close, delete, reset, force-push, destructively rebase, or merge PR #138 wholesale.
- Extract only reviewed, bounded, non-conflicting changes into PR #170; preserve newer `develop` behavior and reconcile migrations deliberately.
- Batch related implementation and test changes. Use focused checks where available, then one consolidated exact-head CI campaign.
- Do not request GitHub reviewers.
- Keep PR #170 draft/unmerged until mandatory exact-head CI passes and the user separately authorizes the staging-release/migration step.
- Keep the staging-release safety hold disabled.
- No staging/production DB writes, migrations, RLS/grant/default-ACL changes, provider calls, worker activation, Render changes, deployments, restarts or releases without separate authorization.
- Keep this file, the integration checkpoint, progress tracker and PR description synchronized after meaningful grouped work.


## Latest continuation update — 27 November 2026 (buyer confirmation atomicity + API fixture batch)

- Production fix `3aa3358e5d213876988bcfe4f20930237873b2b5`: buyer confirmation timestamp now commits in the same transaction as order completion, with a `buyerConfirmedAt IS NULL` compare-and-set and idempotent concurrent-loser handling.
- Grouped test fixture corrections:
  - `3151fc2f460a72fc0b1ef720360618c6093f4e2c` — privileged RTS admin fixture retains valid shipment/store lineage while testing cross-org bypass.
  - `574f3a4626c7a2ebd6cfc19a509d1790ad988320` — ReturnsService worker escalation mock follows `db.db.transaction` and provides result projection queries.
  - `0b1ec543232310f6c333b17bd03ae5a895135446` — DisputesService authorization tests provide transaction/locking mocks.
  - `358ac213c1f632340336c542e9b6361040e60621` — Catalog saved-favorites fixture supports `where().limit(1)`.
- Tracker/checkpoint updated in commits `103d7140f0594e6fc50546923647045103eff98f` and `e4f1124472ef9e70fae072def2e08af620e6a560`.
- All changes are UNVERIFIED: no local runner or exact-head CI has executed them. Historical CI #1659 still identifies carrier reconciliation mutex tests B34-PG-10/11, shipping/carrier tenant-context mocks, catalog publication visibility assertions, orders checkout fixtures, P4.1.8 signing-exception mock, and other payment/returns/admin assertions. Re-check each against current source before changing; some may have been superseded.
- Next task: source-review B34-PG-10/11 carrier reconciliation mutex separation and the remaining current unit fixture failures. Group related fixes, do not weaken tenant/actor guards, and run only one consolidated exact-head CI after the batch is complete.


## Further grouped API follow-ups — 27 November 2026

- `4bd5521f44eb411251162b8c8336649027c2e611`: corrected B34-PG-10/11 barrier to intercept the transaction-scoped Drizzle handle inside DatabaseService.withActorContext; the old root-handle patch could not hold the real worker claim query.
- `ea2e17f011f0503e96a24d2b2094ee244218673c`: P4.1.8 signing exception mock now inspects compiled Drizzle SQL to detect INSERT and return its ID.
- `d65e8ad42a4c5d6518eb8167f0850cb65981a12b` and `b88a68dbd5b4ae6435bd8e52a4f2b08cc2bd88e6`: Catalog visibility assertions now match the actor-aware product detail contract and verify active membership predicate.
- Tracker/checkpoint updates: `b5e1d6d9a85972b5437b120671508aed11b3b930`, `cb048757d1ab50e16c0375130ac219b57e070307`.
- These remain unverified; no local tests or exact-head CI run. Continue source review of remaining API fixture and behavior failures, batch related changes, and use one consolidated exact-head CI campaign only when the batch is complete. Keep PR #170 draft/unmerged and preserve PR #138 unchanged.


## Latest continuation update — 27 November 2026 (shipping tenant validation)

- Commit `035bd65269c07c6c3a3e447c190932607870b439` now rejects mismatched event/expected organization immediately after resolving the authoritative shipment store tenant and before the order-lineage lookup. The mandatory order/store lineage check still runs before provider side effects.
- Tracker/checkpoint updates: `c330fcd8839912b2cc5ca35323fc7cd1eef5b181` and `06a3762b1467176ee8d23c556ba6aaa39c532097`.
- No tests have run locally and there is no exact-head Actions run. The latest known Vercel contexts are free-plan build-rate-limit failures, not application test evidence. Do not trigger extra Vercel builds.
- Keep working through remaining API tests with source review; never weaken authorization or tenant boundaries. Consolidate before one exact-head CI run. Do not merge PR #170 or alter PR #138; no staging or production operations.


### Current continuation — 27 November 2026

- PR #170 exact-head CI #1685 (`45918515070`) failed at API typecheck only after lint and Flutter passed. The failure was a strict typing issue in the saved-suppliers unit test query mocks; no downstream suites ran. Test-only correction committed as `baef54ec07160733c3c18e119e63a0182ea02adb`; not yet verified.
- Continue grouped source-level audit before a single consolidated exact-head CI run. Do not run per-fix CI or additional Vercel previews. PR #138 and its preservation branch remain identical at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; never merge PR #138 wholesale.
- PR #170 remains OPEN / DRAFT / UNMERGED. Do not merge until exact-head mandatory CI passes and separate staging-release/migration authorization is received. No reviewers are needed.


## Exact-head CI #1689 follow-up — 27 November 2026

- Live PR metadata confirms PR #170 is OPEN / DRAFT / UNMERGED against `develop`; current head is `1925acc8750292e29eb09d18eb8b3ccd731d2d85`, base SHA is `118174a644a197d72a033c22f0ee5af430617f44`, 149 commits ahead, 0 behind, and 633 changed files. GitHub currently reports mergeable=true; this is not test evidence or merge authorization.
- Exact-head CI #1689 (run ID `45966568112`) completed FAILURE. Lint/typecheck, Flutter, migration full apply, E6 boundary lint and Web/Admin tests passed. API Unit/Coverage and API Integration failed. Container/build/k6/contract and staging-release jobs were skipped. Vercel previews were successful on the prior inspection; do not trigger additional preview builds.
- Confirmed fixture cascade: both `m73b4-delivery-exceptions.postgres.spec.ts` and `m73b5-rts-reconciliation.postgres.spec.ts` inject a ShippingService test double with `assertDriverEligibleForStore` only. Their shared order-setup helper calls checkout; current `OrdersService.checkout` invokes `validateCheckoutSelection` whenever a shipping collaborator is supplied, so the tests throw before exercising their intended delivery-exception/RTS assertions.
- Grouped test-only correction prepared: add a resolved `validateCheckoutSelection` stub to both fixtures, retaining the explicit driver eligibility stub. These suites do not test shipping checkout policy; production validation and fail-closed behavior remain unchanged. This correction is not yet validated by tests or CI.
- CI #1689 also exposes independent API unit/integration failures, including Product Studio PostgreSQL membership fixtures (active organization membership denied), legacy Phase 1 marketplace lifecycle tests still calling transitions that bypass the current FSM, catalog/search assertion mismatches, and other API unit failures. These must be source-reviewed individually; do not weaken tenant/actor boundaries or relax FSM rules to satisfy stale tests.
- No local test runner is available through the connected GitHub tools. Do not dispatch per-fix CI. Continue the grouped source audit, then run one consolidated exact-head mandatory CI campaign.
- PR #138 remains OPEN / DRAFT / UNMERGED at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; its preservation branch remains synchronized. Never merge PR #138 wholesale. Keep PR #170 draft/unmerged; staging-release/migration authorization remains separate. No reviewers, staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, Render mutations, deployments, restarts or releases.


## API integration fixture follow-up — 27 November 2026

- After the shipping collaborator correction, source review of the same CI #1689 run identified two additional tenant-fixture issues:
  - `p6-product-studio-edit.postgres.spec.ts` seeded an ACTIVE store-owner row but omitted the distinct ACTIVE `organization_members` row required by `assertProductEditableByMerchant`. The fixture now seeds both memberships and ensures the MERCHANT_OWNER role exists. Production authorization remains unchanged.
  - `phase1-marketplace.e2e.spec.ts` inserted organization memberships without explicitly setting `status: ACTIVE`; the fixture now seeds explicit ACTIVE status for both merchant and buyer memberships. All generic FSM transition calls in the lifecycle section now pass the real caller context, preserving tenant checks rather than using the optional unscoped path.
- These are test-fixture corrections only. They have not been executed locally or in CI; remain UNVERIFIED until consolidated exact-head CI.
- Current integration head before this follow-up: `b53b99abc4a00cfa7773a9b5a5be61558fc384f6`. The shipping fixture + handover synchronization commit is `b53b99abc4a00cfa7773a9b5a5be61558fc384f6`.
- Keep PR #170 OPEN / DRAFT / UNMERGED. PR #138 and its preservation branch remain identical at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; never merge wholesale. No reviewers, staging/production changes, migrations, releases or deployments.


## Shipping/Payments actor-fixture follow-up — 27 November 2026

- Additional CI #1689 stack traces identified two bounded fixture issues:
  - `m73c-inventory-return.postgres.spec.ts` instantiated OrdersService without the optional ShippingService collaborator, then exercised `assignDriver`; production correctly fails closed when driver eligibility cannot be validated. The test harness now supplies an explicit `assertDriverEligibleForStore` stub because the suite tests inventory-return behavior, not carrier eligibility policy.
  - `p12-independent-runtime-verification.postgres.spec.ts` supplied `role: null` for buyer callers even though `PaymentsService.submitProof` requires an authenticated role before opening user actor context. The fixtures now use the actual `BUYER` role. Production role enforcement is unchanged.
- These are test-only changes and remain UNVERIFIED; no local test runner is available here. Keep the consolidated CI hold until the remaining source-reviewed failure clusters are corrected.
- Current integration head before this batch: `02c7133d78cf9e63334ab945f90ecc3459978ea3`. Earlier grouped fixture commits: `b53b99abc4a00cfa7773a9b5a5be61558fc384f6` (shipping checkout + docs) and `02c7133d78cf9e63334ab945f90ecc3459978ea3` (tenant membership + lifecycle fixtures).
- PR #170 remains OPEN / DRAFT / UNMERGED; PR #138 source/preservation refs remain identical at `81f30f5c30654b233ef373c15fd3f2cb867aba01`. No reviewer requests or staging/production operations.


## P13 return/payment state-machine corrections — 27 November 2026

- Source review of CI #1689 identified that `PaymentsService.submitProof` explicitly accepts a previously REJECTED bank-transfer payment for replacement proof, but the payment transition map rejected the resulting `REJECTED → AWAITING_VERIFICATION` transition. Added that direct replacement-proof transition and its `PAYMENT_PROOF_SUBMITTED` event mapping; the existing `REJECTED → AWAITING_PAYMENT` method-selection path remains valid. This is a production state-machine correction, not a test bypass.
- The P13 financial integration helper attempted the protected `REFUND_PENDING` system transition using a merchant caller. It now receives the seeded platform-admin caller for that system-only step; buyer and merchant steps retain their own callers. Test return reasons were changed from unsupported `DAMAGED` to the supported `PRODUCT_NOT_AS_DESCRIBED` category; damage remains represented by the descriptive details/inspection condition. The reconciliation-versioning test now inserts its second organization before creating tenant-scoped reconciliation runs. A refund-limit assertion now matches the actual error contract.
- These source/test changes have not been run locally or in CI. They remain UNVERIFIED until one consolidated exact-head campaign. No financial invariants, authorization checks or tenant guards were relaxed.
- Prior grouped commits: `b53b99abc4a00cfa7773a9b5a5be61558fc384f6`, `02c7133d78cf9e63334ab945f90ecc3459978ea3`, `98a3337737c9a9f88750b2c15e945bc00c255ebd`.
- PR #170 remains OPEN / DRAFT / UNMERGED. PR #138 and its preservation branch remain identical at `81f30f5c30654b233ef373c15fd3f2cb867aba01`. No reviewers or staging/production operations.


## P4 HTTP authorization harness wiring — 27 November 2026

- The P4 HTTP integration log recorded two deterministic Nest harness exceptions: `PilotControlService` attempted `identity.getOrg` and `merchant.getStore`, but its manually supplied `design:paramtypes` listed only the original three constructor dependencies. The production constructor now requires both `IdentityService` and `MerchantService`. Updated the test metadata and registered real read-only service instances backed by the same disposable PostgreSQL DatabaseService; only their unrelated collaborators are inert because `getOrg`/`getStore` do not use them.
- This explains the missing `getOrg`/ `getStore` errors in P4. Other `withActorContext` failures in the same harness still require verification; the P4 suite remains a known unresolved CI cluster until a rerun.
- No production HTTP authorization or permission behavior was changed. No mocks were added for the service methods under test.
- Current head before this batch: `41ae36d1b3a96768d0c86baf807052bb740beb97`; latest grouped payment-state-machine commit: `41ae36d1b3a96768d0c86baf807052bb740beb97`.
- PR #170 remains OPEN / DRAFT / UNMERGED; PR #138 remains preserved and unmerged. No reviewers or deployment/staging actions.


## CI #1694 failure analysis — grouped integration follow-up — 27 November 2026

- Exact tested code head `88e6b4943491192920e2e17b7dea566a76a3635b`; run #1694 / `45982465536` completed FAILURE. Passed: Lint & Typecheck, Mobile Flutter, Migration Full Apply, Web/Admin Tests, Boundary Lint E6, and both Vercel previews. Failed: API Unit/Coverage and API Integration. Container/build/contract/k6/staging-release jobs were skipped. No merge or deployment occurred.
- Integration failure clusters and grouped corrections in this batch:
  - M73-C fixture now implements checkout's required `validateCheckoutSelection` collaborator in addition to driver eligibility.
  - P12 same-key refund retries are intentionally idempotent for all callers; assert five successful responses and one DB row. The settlement service retry is also idempotent, so the unique-index test now attempts a direct duplicate SQL insert.
  - P13 orphan-refund recovery now uses the actual payment currency. System-only `REFUND_PENDING` transitions use the seeded admin caller; the expiry-race test updates the returned order ID rather than its payment ID; bigint assertions normalize to numbers.
  - P13-returns idempotent escalation expectation now matches the service's null return. Phase 1 FSM setup clears the prior active cart and selects the sub-order for storeA, preserving tenant authorization. P311 TC-03 now seeds the required primary settlement row.
  - P3 and P4 test harnesses now print exception stacks so remaining TypeErrors/HTTP 500s can be fixed at the actual dependency boundary.
- These are fixture/assertion/debugging changes; no financial invariants, tenant authorization, or FSM rules were weakened. They remain UNVERIFIED until consolidated exact-head CI.
- PR #170 remains OPEN / DRAFT / UNMERGED. PR #138 remains protected and unmerged. No reviewers required. No staging/production writes, migrations, grants/RLS changes, provider calls, worker activation, Render mutations, deployments, restarts or releases.


## CI #1694 unit-test follow-up — 27 November 2026

- The exact-head run #1694 (`45982465536`) failed API Unit/Coverage. Grouped test-only corrections in this batch:
  - P418 signing test now returns the row for the alert-claim UPDATE, allowing the test to reach the HMAC failure path and verify FAILED rather than prematurely observing UNKNOWN.
  - Shipping tenant-context tests now provide the worker's actor-context database collaborator before asserting a tenant mismatch.
  - Catalog P2 transaction mock now exposes relational query methods used by the service. SKU search mock now honors the ACTIVE-only predicate instead of returning a PUBLISHED-only row regardless of the DB filter.
  - Catalog ownership/read and inventory tests now reflect the actual scoped call sequence; the offer compare-and-set test compares the serialized timestamp value rather than Date object identity. Controller/publication tests assert membership checks occur without pinning a brittle internal call count.
- The preceding integration batch corrected M73-C checkout collaborator, P12 idempotency/unique-index expectations, P13 financial caller/currency/race fixtures, P13 returns null contract, Phase 1 cart isolation, P311 primary settlement prerequisite, and added P3/P4 stack diagnostics.
- These are test harness/expectation corrections only; production tenant authorization, inventory safeguards, financial transitions and publication rules remain unchanged. All remain UNVERIFIED until consolidated exact-head CI.
- Current branch before this batch: `bfe51c442902bcacfbe3ad3e760c8b225729b5f5`. Keep PR #170 OPEN / DRAFT / UNMERGED and PR #138 protected/unmerged. No reviewers, staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, deployments, restarts or releases.


## Phase 1 FSM cart-isolation ordering correction — 27 November 2026

- Follow-up review caught an ordering mistake in the Phase 1 test fixture: the active cart was being cleared after the new storeA item was added. Moved cleanup/conversion before `cartService.addItem`, then the FSM checkout selects the storeA sub-order. This is test-only isolation and does not change production authorization.
- Previous exact-head validation: run #1694 (`45982465536`) failed API Unit/Coverage and API Integration; passed Lint & Typecheck, Flutter, Migration Full Apply, Web/Admin, Boundary Lint E6, and both Vercel previews. The follow-up grouped commits address the observed test harness and financial fixture failures. The next consolidated run will be the validation gate for current head.
- Current code head before this correction: `feaa9a1dee2c902b2c62c52f915b599fce527e88`. PR #170 remains OPEN / DRAFT / UNMERGED; PR #138 remains protected and unmerged. No reviewers or staging/production operations.


## CI #1697 typecheck correction — 27 November 2026

- Run #1697 (`45985542987`) on head `5d3fdcf9e0d91ca59f5996c283e9d7f90f04ce64` stopped at API typecheck before Unit/Coverage or Integration ran. Mobile Flutter passed; downstream gates were skipped. Typecheck reported only two errors from the newest test-harness batch: an index-signature property access in the SKU-search mock and a test-scoped alert ID referenced from a shared P418 mock.
- Corrected the search mock to use bracket access and made the P418 mock derive the returned row ID from the insert/update query parameters. No production code changed. Next push-triggered CI is required; run #1697 does not validate the integration/unit changes.
- PR #170 remains OPEN / DRAFT / UNMERGED; PR #138 remains preserved and unmerged. No reviewers or staging/production actions.


## CI #1698 focused failure follow-up — 27 November 2026

- Run #1698 (`45985851063`) on head `8410dfb91e2a9f663d4735e6e74cc7de2a048583` passed Lint & Typecheck, Flutter, Migration Full Apply, Web/Admin, and Boundary Lint E6; API Unit/Coverage and API Integration failed. Downstream build/contract/staging/k6 jobs were skipped.
- Exact remaining failures and grouped corrections:
  - P4 HTTP 500s traced to `TenantDatabaseContextInterceptor` being attached to `ReturnsController` but omitted from the Vitest module's explicit constructor metadata/providers. Register the real interceptor with the real DatabaseService; do not bypass tenant context.
  - P3 moderation race TypeError traced to the test Drizzle schema omitting `storeMembers`, although the test seeded that table and production tenant-scope queries it. Include the table in the test schema.
  - P311 concurrent post is idempotent: both callers receive the same posted adjustment. Assert two successful retries and one primary settlement row, rather than expecting one caller to fail.
  - M73-B create/cancel mutex tests seeded `next_reconciliation_at` at the application wall-clock instant, which can still be ahead of PostgreSQL `NOW()`. Seed a safely-past timestamp to make both independent claim queries deterministic.
  - P13 FIN-DSH-28 now asserts the independent order update affected exactly one row, making any remaining RLS/identifier issue explicit rather than silently ignored.
  - Inventory scope assertion reflects two org membership checks and two store membership checks in the nested guard path.
- No production authorization, financial, reconciliation or tenant invariants are weakened. All changes remain UNVERIFIED until the next consolidated exact-head CI.
- PR #170 remains OPEN / DRAFT / UNMERGED; PR #138 remains protected and unmerged. No reviewers, staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, deployments, restarts or releases.


## CI #1699 investigation refinement — 27 November 2026

- Run #1699 (`45987890950`) passed Lint & Typecheck, Flutter, Migration Full Apply, Web/Admin and E6. Unit/Coverage failed five assertions; Integration failed two assertions. No build/contract/k6/staging-release downstream job ran.
- M73-B.3.4 mutex tests failed at the 5-second test timeout, not an assertion. Replaced the brittle SQL-execution barrier (which held a claim transaction open) with a deterministic barrier at the worker actor-context boundary: first cycle holds after setting its process-local running flag but before claiming; the opposite cycle must complete. Both tests get a 30-second allowance and the barrier releases in `finally` to prevent leaked transactions.
- P311 TC-03: service explicitly supports idempotent replay after POSTED, so both callers must fulfill. The previous failure was the assertion counting both primary settlement and adjustment ledger row as if only one row should exist. Now assert exactly one adjustment ledger row keyed to the adjustment and exactly one non-adjustment primary row.
- Inventory active warehouse access calls the store-membership spy once; restore the correct one-call assertion. Organization membership is separately asserted.
- P13 FIN-DSH-28 remains the sole unresolved integration assertion. The independent update reported rowCount=1 but the final row remained PAYMENT_PENDING. The next fixture revision verifies the returned order ID equals the intended sub-order and that a fresh pool query sees ACCEPTED immediately after the independent update, before expiry continues. If that check passes but the final row changes back, investigate service transaction/trigger behavior; do not weaken the conditional update.
- Current PR #170 stays OPEN / DRAFT / UNMERGED; PR #138 stays protected/unmerged. No reviewers, no staging/production operations, migrations, RLS/grant changes, provider calls, worker activation, deployments, restarts or releases. Current corrections are unverified until a consolidated exact-head run.


## CI #1700 result and P13 expiry correction — 27 November 2026

- Run #1700 (`46033444622`) on head `82b5d29c099241324fb7a30044060f93d80f74aa`: Lint & Typecheck, Flutter, Boundary Lint E6, Web/Admin, and Migration Full Apply passed. Unit/Coverage and Integration each failed only FIN-DSH-28 in `p13-financial-dispute.postgres.spec.ts`. All other previously failing unit/integration areas passed, including M73-B mutex separation, P311 idempotent adjustment posting, inventory tenant scope, P4, P3 and financial fixtures. Downstream build/contract/k6/staging-release jobs skipped.
- Root cause refinement: `expirePayment` performed a status read before a conditional UPDATE. The read was redundant and introduced a stale-read window. Production now attempts the single atomic `UPDATE orders ... WHERE status='PAYMENT_PENDING' RETURNING id` directly and appends cancellation history only when that UPDATE returns a row. This preserves the payment-expiry invariant and closes the read/write gap.
- FIN-DSH-28 test is now deterministic: it commits an order transition to ACCEPTED before expiry attempts its conditional update, then verifies payment expiry does not overwrite the order or append cancellation history. The test title reflects this exact ordering; no false claim of a controlled mid-transaction race.
- Current head before this correction: `82b5d29c099241324fb7a30044060f93d80f74aa`. New code/test changes are not yet CI-verified. PR #170 remains OPEN / DRAFT / UNMERGED; PR #138 remains protected and unmerged. No reviewers, no staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, deployments, restarts or releases.


## CI #1701 FIN-DSH-28 fixture correction — 27 November 2026

- Run #1701 (`46035005436`) on head `70b67f6158b1355b01986e472d66483452ce6992`: lint/typecheck, Flutter, E6, Web/Admin, and Migration Full Apply passed. Unit/Coverage failed one FIN-DSH-28 assertion; integration result was still running at the time of this note.
- The remaining unit failure showed the test's payment retained `CASH_ON_DELIVERY` from `createDeliveredOrder`. Production correctly returns early for COD payments, so the test never exercised expiration and payment stayed AWAITING_PAYMENT. Correct the fixture to `BANK_TRANSFER` when resetting payment status to AWAITING_PAYMENT. This is a test setup correction; production COD protection remains intact.
- Production expiry now uses the atomic conditional order UPDATE and writes cancellation history only if a PAYMENT_PENDING row was actually transitioned. Current test fixture and implementation require a new exact-head validation run.
- PR #170 remains OPEN / DRAFT / UNMERGED; PR #138 remains protected and unmerged. No reviewers, no staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, deployments, restarts or releases.


## CI #1702 runtime smoke finding — notification/realtime import cycle — 27 November 2026

- Run #1702 (`46036124557`) passed Lint & Typecheck, Flutter, Unit/Coverage, Integration, Web/Admin, Migration Full Apply, E6, Contract/Codegen, and Build. Container Build & Smoke failed at API startup with `ReferenceError: Cannot access 'NotificationsService' before initialization` from compiled `notifications.controller.js`.
- Root cause is the static import cycle: NotificationsService imports RealtimeGateway; RealtimeGateway imports OrdersModule; OrdersModule imports NotificationsModule and OrdersService imports NotificationsService. This makes the controller's service reference execute while NotificationsService is still initializing.
- Break the runtime cycle with a narrow notification realtime port/token. NotificationsService now injects the interface via `NOTIFICATION_REALTIME_EMITTER` without importing RealtimeGateway; RealtimeModule binds that token to its existing RealtimeGateway using `useExisting` and exports it. IN_APP persistence and live emit behavior remain intact.
- This grouped code change is UNVERIFIED until exact-head CI, especially container startup and health checks, pass. No merge/deploy/staging operation.
- PR #170 remains OPEN / DRAFT / UNMERGED; PR #138 remains protected/unmerged. No reviewers; no staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, deployments, restarts or releases.


## CI #1703 container smoke follow-up — second circular barrel import — 27 November 2026

- Run #1703 (`46038700205`) passed Lint/Typecheck, Flutter, Unit/Coverage, Integration, Web/Admin, Migration Full Apply, E6, Contract/Codegen and Build. Container startup progressed past the NotificationsService cycle but failed on a second runtime cycle: `ReferenceError: Cannot access '_ordersservice' before initialization` at `modules/orders/index.js`, imported by `shipping/carrier-webhook-routing.js`.
- Root cause: `carrier-webhook-routing.ts` imports `OrdersService` through the `../orders/index` barrel. That barrel eagerly re-exports OrdersModule, which imports ShippingModule, which imports CarrierWebhookRoutingService, creating the class initialization cycle. Change only this type/provider import to the direct `../orders/orders.service` module path, bypassing the OrdersModule barrel. Existing `forwardRef(() => OrdersService)` injection remains in place.
- The previous NotificationsService → RealtimeGateway cycle has been removed using the notification realtime port. The current direct-import correction is not yet verified; rerun exact-head CI and require the container health endpoints to pass.
- PR #170 remains OPEN / DRAFT / UNMERGED; PR #138 remains protected/unmerged. No reviewers, staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, deployments, restarts or releases.


## CI #1704 runtime smoke follow-up — realtime gateway barrel import — 27 November 2026

- Exact PR head `2a98fdd33b1645848df674466af4b64f5388c878`; CI run #1704 (`46041178822`). Lint & Typecheck, Flutter, API Unit/Coverage, API Integration, Web/Admin, Migration Full Apply, E6 Boundary Lint, Contract/Codegen and Build all PASSED. Both Vercel preview checks are SUCCESS. Only Container Build & Smoke failed during API module initialization; k6 and staging-release were skipped.
- Container log: `ReferenceError: Cannot access '_orderrealtimeaccessservice' before initialization` from `modules/orders/index.js`, reached via `modules/realtime/realtime.gateway.js`. This is the same barrel-export cycle pattern already fixed for CarrierWebhookRoutingService. RealtimeGateway imported OrderRealtimeAccessService through `../orders/index`; the barrel eagerly re-exports OrdersModule, which imports ShippingModule and brings the gateway path back into initialization.
- Corrected the gateway to import `OrderRealtimeAccessService` directly from `../orders/order-realtime-access.service`. Constructor injection and the existing authorization checks remain unchanged; this only bypasses the eager barrel re-export. No production business logic or tenant policy changed.
- Current correction is not yet verified. Run one consolidated exact-head CI after source-level cycle review; require Container Build & Smoke health checks to pass. Do not rerun Vercel previews unnecessarily.
- PR #170 remains OPEN / DRAFT / UNMERGED against `develop` at `118174a644a197d72a033c22f0ee5af430617f44`. PR #138 remains OPEN / DRAFT / UNMERGED and preserved at source/preservation SHA `81f30f5c30654b233ef373c15fd3f2cb867aba01`; never merge it wholesale. No reviewers. No staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, Render changes, deployments, restarts or releases.


## CI #1705 runtime smoke follow-up — IdentityModule barrel cycle — 27 November 2026

- Exact-head run #1705 (`46043968375`) on `85b3099df844e83a1c5a1a941fbf913817fcc3cd`: Lint/Typecheck, Flutter, API Unit/Coverage (312 passed, 6 skipped), API Integration, Web/Admin, Migration Full Apply, E6 Boundary Lint, Contract/Codegen and Build all PASSED. Container Build & Smoke failed at module initialization with `ReferenceError: Cannot access 'IdentityModule' before initialization` from `identity/index.js`, imported by `shipping.module.js`. k6/staging release were skipped.
- Root cause is the eager barrel-export pattern: ShippingModule imports IdentityModule through `../identity/index`, which also re-exports IdentityService and evaluates the barrel while the Nest module graph is loading. The correction uses direct module/service file imports across the affected startup graph: ShippingModule → IdentityModule/MerchantModule, RealtimeModule → OrdersModule/MerchantModule, RealtimeGateway → MerchantService, and CarrierWebhookRoutingService → MerchantService. Existing direct imports for OrdersService and OrderRealtimeAccessService remain. This removes barrel side effects without changing providers, constructor injection, route authorization, or tenant policy.
- This grouped import-graph correction is UNVERIFIED until exact-head CI confirms container startup and liveness/readiness. All non-container checks passed on #1705; do not repeat CI per file.
- PR #170 remains OPEN / DRAFT / UNMERGED against `develop` at `118174a644a197d72a033c22f0ee5af430617f44`. PR #138 remains OPEN / DRAFT / UNMERGED and protected at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; never merge wholesale. No reviewers, staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, Render changes, deployments, restarts or releases.


## CI #1706 runtime smoke follow-up — deferred IdentityModule reference — 27 November 2026

- Exact-head run #1706 (`46046356695`) on `92faf963dff173e9f9a85a32bedbe14ab2f4b918`: Lint/Typecheck, Flutter, Unit/Coverage (312 passed, 6 skipped), Integration, Web/Admin, Migration Full Apply, E6, Contract/Codegen and Build all PASSED. Container Build & Smoke failed during startup with `ReferenceError: Cannot access 'IdentityModule' before initialization` while OrdersModule loaded ShippingModule.
- The direct-import cleanup removed barrel re-exports but confirmed a module initialization cycle remains between the Orders → Shipping startup path and Identity's module graph. ShippingModule retains the real IdentityModule dependency and now wraps it in Nest's `forwardRef(() => IdentityModule)`, deferring resolution until the module graph is assembled. No provider was removed, mocked, or bypassed; IdentityService remains the production dependency for organization lookups.
- This module-reference correction is UNVERIFIED until exact-head CI passes Container Build & Smoke and both liveness/readiness checks. All other gates passed on #1706. Avoid per-file CI retries.
- PR #170 remains OPEN / DRAFT / UNMERGED against `develop` at `118174a644a197d72a033c22f0ee5af430617f44`. PR #138 remains OPEN / DRAFT / UNMERGED and protected at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; never merge wholesale. No reviewers, staging/production writes, migrations, RLS/grant changes, provider calls, worker activation, Render changes, deployments, restarts or releases.


## CI #1707 — full validation passed — 27 November 2026

- Tested implementation head: `5ba67eb00810d4419b0dfb901596a1eb948b8595`; workflow run #1707 / `46048745793` completed with all mandatory jobs SUCCESS: Lint & Typecheck, Flutter, Migration Full Apply, E6 Boundary Lint, API Unit/Coverage, API Integration, Web/Admin, Build, Contract/Codegen, and Container Build & Smoke.
- API Unit/Coverage passed 312 test files; 6 tests were skipped. API Integration passed. No remaining API test failures.
- Container Build & Smoke passed. API container remained running; `/v1/healthz` returned `{"status":"ok"}`; `/v1/readyz` returned `{"status":"ok"}` with PostgreSQL and Redis both `up`. The IdentityModule deferred reference resolved the final observed startup cycle.
- Vercel Web and Admin status checks are SUCCESS. k6 Smoke Test and Trigger Staging Release were SKIPPED by workflow conditions; no staging deployment or release was performed.
- PR #170 metadata at validation: OPEN / DRAFT / UNMERGED, 638 changed files, 167 commits, base `develop` at `118174a644a197d72a033c22f0ee5af430617f44`, mergeable=true, no requested reviewers. The current PR branch may receive this documentation-only checkpoint; the tested code SHA remains `5ba67eb00810d4419b0dfb901596a1eb948b8595`.
- PR #138 remains OPEN / DRAFT / UNMERGED. Source branch `remediation/phase-0-1-tenant-security` and preservation branch `preservation/pr138-remediation-2026-11-25` were rechecked and are identical at `81f30f5c30654b233ef373c15fd3f2cb867aba01`. Keep this source protected; never merge PR #138 wholesale.
- No staging/production DB writes, migrations, RLS/grant changes, provider calls, worker activation, Render changes, deployment, restart or release occurred. Keep PR #170 draft/unmerged until the user separately authorizes the staging-release/migration step; passing CI and GitHub mergeability do not provide that authorization.
- This checkpoint is documentation-only and uses `[skip ci]`; no redundant code CI should be launched for this note.


## Latest continuation — PR #171 merged; PR #172 implementation prepared (27 November 2026)

- PR #171 was merged into `develop` at `f37ebaf97e2ce6330e69ded9b41d58c7229f4c40`. Exact head `9202bfac403e0bb8480b6b1fe90f06d4055d8845` passed all 10 mandatory jobs in CI #1710 (run `46056460442`), including API unit/coverage, PostgreSQL integration, migration full apply, E6, build and container smoke. k6 and staging release were skipped.
- PR #138 remains OPEN / DRAFT / UNMERGED at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; source and preservation refs remain identical. Never merge PR #138 wholesale or rewrite its refs.
- [PR #172](https://github.com/nabeel2323/scs-platform/pull/172) is MERGED into `develop` at `825f19b9214af97d34b4abdea1ff104325104361`. Its implementation head was `a3a0d1199a08e62f6382c710006aa3e794d862ca`.
- PR #172 implementation batch now includes: (1) carrier webhook retries fail closed whenever credential_id is absent, even if shipment_id is already linked; (2) migration 0077 detaches legacy uncredentialed shipment links for manual review without changing processed/processed_at, with a PostgreSQL integration test; (3) migration 0074 preflights dangling, cross-scope, non-monotonic, branching and duplicate-version history before rewriting pointers, with PostgreSQL tests proving valid three-version chain conversion and rollback on invalid history; (4) PaymentProofCleanupWorker is registered but only schedules when PAYMENT_PROOF_CLEANUP_WORKER_ENABLED=true, with bounded interval, overlap protection and unit tests. The cleanup service continues checking all payment references before object deletion and uses existing leases/backoff.
- Exact-head CI #1713 (run `46062206421`, attempt 2) passed all 10 mandatory jobs for PR #172, including unit/coverage, PostgreSQL integration, migration full apply, E6, build and container smoke. The initial container-smoke attempt encountered a transient PostgreSQL shutdown during disposable-service setup; only that failed job was rerun, and it passed. k6 and staging-release jobs were skipped. No staging/production migrations, database writes, worker activation, provider calls, Render changes, deployments, restarts or releases occurred.
- G-002 remains IN PROGRESS / NOT VERIFIED overall. Previously confirmed protected read-only migration identity was postgres with BYPASSRLS, CREATEROLE and CREATEDB; latest historical API runtime evidence was also postgres with BYPASSRLS and TLS disabled. Migration TLS has not been confirmed. Do not enable RLS or deploy fail-closed guards until least-privilege role ownership/ACL and TLS transition are separately prepared and authorized.
- G-001 independent security review remains PARTIAL; G-007 buyer journey/order-detail UAT remains pending. No reviewers are required. Keep PR #138 protected and batch related changes to avoid redundant CI.


## Latest continuation — PR #173 carrier provider binding and CI correction (28 November 2026)

- PR #173 targets `develop` and contains the G-002 carrier-configuration provider-binding fix. The source requires provider-scoped configuration lookup, checks that the linked credential is active and matches both organization and provider, rejects mismatched credential/provider pairs on creation, and makes the Aramex adapter request only the Aramex configuration.
- Exact PR head `5acd0d5822f947a08524527e48eb531c1b778378` ran CI #1716 (`46069073203`). Lint/typecheck, mobile, PostgreSQL integration, E6, Web/Admin and full migration apply passed. API Unit/Coverage failed one stale assertion in `shipping-tenant-context.spec.ts`: the Aramex provider now correctly calls `resolveForStore(orgId, storeId, 'aramex')`, while the test expected only two arguments.
- Corrected all three legacy call/expectation sites in that unit spec. Fix commit: `bb2b7edc4d045d25daf3c8de1e7b07f818c74303`. This is test-only; provider/tenant validation remains unchanged. The correction is **NOT YET VERIFIED** by a new exact-head CI run.
- PR #173 branch compares 3 commits ahead / 0 behind `develop` at base `bb39cb6488acd958a6079b60c2da4a2cfdbcab28`. PR remains OPEN / DRAFT / UNMERGED. Do not merge until a consolidated exact-head CI passes.
- PR #138 remains OPEN / DRAFT / UNMERGED at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; its preservation branch is identical. Never merge or rewrite either ref.
- No reviewers, no per-fix CI, and no Vercel retry for the admin build-rate-limit status. No staging/production DB writes or migrations, RLS/grant/default-ACL changes, provider calls, worker activation, Render mutations, deployments, restarts or releases.


## 28 November 2026 — PR #173 integration CI triage

- CI #1717 (46074130374) on code/test head bb2b7edc4d045d25daf3c8de1e7b07f818c74303 passed lint/typecheck, Mobile, Web/Admin, E6, API Unit/Coverage and Migration Full Apply. API Integration had one failure in cross-instance-throttling.spec.ts: the test asserted that the last Promise.all input had the threshold-crossing count, which is invalid because Promise.all preserves input order, not Redis execution order.
- Reviewed the atomic Redis Lua script and corrected the test to assert the maximum observed count is exactly limit + 1, with at least one blocked result. This checks the intended atomic behavior without depending on scheduling.
- Test-only correction commit: 442d993e569eb77c435256ac0300c322600bb9d8. It is NOT YET VERIFIED. Continue grouped source review and run one consolidated exact-head CI only after the batch is complete.
- PR #173 remains OPEN / DRAFT / UNMERGED. PR #138 and its preservation branch remain identical at 81f30f5c30654b233ef373c15fd3f2cb867aba01; never merge PR #138 wholesale. No reviewers, extra Vercel builds, or staging/production operations.


## PR #173 merged — 28 November 2026

- PR #173 (G-002 carrier provider-binding integrity) was merged into `develop` at merge commit `6ba7e575648bdffeacf12050bc5e040d72c73853`. Exact PR head `545f0015f1b5b0a44ad583bbeb0df2e27ae138f4` passed all 10 mandatory CI jobs in CI #1720 (run `46077477944`): Lint & Typecheck, Mobile, API Unit/Coverage, API Integration, Web/Admin, Migration Full Apply, E6 Boundary Lint, Contract/Codegen, Build, and Container Build & Smoke. k6 Smoke Test and Trigger Staging Release were skipped; no staging release was performed.
- Implementation constrains carrier configuration lookup by requested provider, requires the credential to be active and match both organization and provider, rejects mismatched credential-provider assignments, and makes the Aramex adapter request only Aramex configuration. No migration was introduced.
- The CI correction replaced an invalid Promise.all completion-order assumption in the Redis throttling test with assertions on maximum observed atomic counter and at least one blocked request. This test-only correction was included in the exact validated head.
- PR #138 remains OPEN / DRAFT / UNMERGED at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; its preservation branch remains identical. Never merge PR #138 wholesale or rewrite either ref.
- Next work: continue G-002 source-level raw SQL/function/trigger/partition inventory, ownership-predicate/FK crosswalk, and worker/bootstrap/CLI/audit/realtime actor-context audit. Continue preparing the least-privilege API/migration role and verified TLS transition. Historical API runtime evidence reports `postgres` with BYPASSRLS and TLS disabled; do not enable RLS or deploy the fail-closed runtime guard until role ownership/ACL and TLS are reconciled and separately authorized.
- No staging/production DB writes or migrations, RLS/grant/default-ACL changes, provider calls, worker activation, Render changes, deployments, restarts or releases occurred. No reviewers were requested. Documentation checkpoint only; use `[skip ci]`.


## 28 November 2026 — G-002 bootstrap CLI database boundary follow-up

- Source review found the break-glass `bootstrap-issue-token.ts` CLI used a standalone PostgreSQL client without verified TLS enforcement, runtime role/ownership validation, or transaction-local operator actor context. This bypassed the safeguards already present in the API and migration runner.
- New bounded branch `remediation/bootstrap-cli-db-identity-context-2026-11-28` adds verified TLS (system trust store or explicit `PGSSLROOTCERT`) for staging/production, checks the exact issuing session for session/effective-role equality, superuser/BYPASSRLS/CREATEROLE/CREATEDB and public ownership, and sets a transaction-local `bootstrap` operator context before reading or writing bootstrap state. Failed connection attempts are closed safely.
- Added disposable-PostgreSQL regression coverage for production-like TLS fail-closed behavior and a trigger-based assertion that the audit insert sees the bootstrap operator context. The test-only trigger/function is created and removed inside the disposable test database; no production migration or database object is added.
- A targeted scan of migrations 0064–0077 found no CREATE FUNCTION/PROCEDURE/TRIGGER/RULE or PARTITION BY declarations. Explicit FK references in this range include device-trust user/session links, carrier credential linkage, and payment-proof upload-intent linkage. This supplements (but does not replace) the earlier 75-migration inventory.
- Superseded: PR #174 was subsequently verified on exact head and merged; see the merged checkpoint below.
- No staging/production DB writes or migrations, RLS/grant/default-ACL changes, provider calls, worker activation, Render changes, deployments, restarts or releases occurred. PR #138 remains protected and unmerged.


Superseded: PR #174 is merged into develop; see the exact-head CI and merge checkpoint below.


## PR #174 merged — 28 November 2026

- PR #174 (G-002 bootstrap CLI database identity and actor context) merged into `develop` at `4c5c755571385b346902c74c9f4f0578f48d9433`. Exact PR head `96c0276a7cd68a2125197d85d16b8e739d9cd5ef`; base was `57130a37a27a4d960f396b985c599274b91caa9e`.
- Exact-head GitHub Actions CI #1722 (run `46080913174`) completed successfully. All 10 mandatory jobs passed: Lint & Typecheck, Mobile, Migration Full Apply, E6 Boundary Lint, Web/Admin Tests, Integration Tests, Unit/Coverage, Container Build & Smoke, Build, and Contract/Codegen. k6 Smoke Test and Trigger Staging Release were skipped.
- Two external Vercel preview status contexts reported build-rate-limit failures; these are provider preview-build failures, not failures in the mandatory GitHub Actions test/build campaign. No preview deployment was triggered by this merge.
- The CLI now enforces verified TLS for staging/production, checks the exact database session/effective identity and unsafe privileges/ownership, and sets transaction-local bootstrap actor context before bootstrap-state reads/writes. Disposable PostgreSQL regression tests cover TLS fail-closed behavior and audit-trigger actor attribution.
- PR #138 remains OPEN / DRAFT / UNMERGED. Preserve its implementation and preservation branch; never merge it wholesale or rewrite either ref.
- G-002 is still IN PROGRESS overall: this bounded CLI fix does not authorize changes to runtime/migration roles, grants/default ACLs, RLS, or TLS environment. Continue the source inventory, ownership/FK crosswalk, worker/realtime/audit actor-context review, and prepare the least-privilege role/TLS transition as a separately reviewed and authorized step.
- No staging/production DB writes or migrations, grants/default-ACL changes, RLS enablement, provider calls, worker activation, Render changes, deployments, restarts or releases occurred. No reviewers were requested.


## G-002 source-audit continuation — 28 November 2026

- Reviewed the deployed API startup gate in `DatabaseService.onModuleInit`: production-like API startup already requires verified TLS and rejects missing identity, session/effective role mismatch, superuser, BYPASSRLS, CREATEROLE, CREATEDB, and ownership of public tables/schema. This is an API-pool check, not proof that the separate migration runner uses the same identity.
- Re-reviewed `apps/api/infra/drizzle/migrate-pg.ts` and `migration-identity.ts`: the migration runner still treats identity capture as diagnostic/non-fatal; it only configures verified TLS when `PGSSLROOTCERT` is explicitly supplied, otherwise node-postgres TLS is not forced. It also applies migrations through a direct PoolClient without transaction-local actor context. This remains a gated migration-role/TLS/ownership design item; do not make it fail-closed or change its privileges/TLS configuration until the migration principal and target DB ownership/ACL have been reconciled and the transition is separately authorized.
- Realtime review: WebSocket store/order room authorization wraps its DB work in `withSocketActor` using the authenticated JWT subject/role/org; room joins fail closed. Worker lease operations use `actorKind: worker` and stable process holder ID. The manual `forceExpire` recovery path uses an explicit `system` actor context, consistent with its operator-only runbook scope. No source change was made from this review.
- Next bounded audit: finish repository-wide raw PostgreSQL client/Pool callsite inventory, map migration-created ownership and FK references to runtime principals, and test the remaining realtime/worker actor-context boundaries. Keep runtime/migration role transition, grants/default ACLs, RLS and staging audit behind their existing authorization gates.


## G-002 raw database access and worker-context inventory — 28 November 2026

Scope reviewed: production API database startup, migration/seed/reset CLIs, manual staging bootstrap scripts, local Docker database utilities, worker entrypoints, audit writes and realtime room authorization. This is a source review only; no database connection, migration, seed, reset, provider call, worker activation or deployment was performed.

### Direct PostgreSQL entrypoints

- `apps/api/infra/drizzle/migrate-pg.ts`: standalone `PoolClient` migration runner. Identity metadata is diagnostic/non-fatal; verified TLS is configured only when `PGSSLROOTCERT` is present; no transaction-local operator actor context is established. This remains the highest-priority migration-boundary gap. Do not change runtime role, migration role, grants/default ACLs or TLS rollout until the actual migration principal, object ownership and target-environment TLS requirements have been reconciled.
- `apps/api/infra/drizzle/seed-pg.ts` and `seed-catalog.ts`: standalone pools; both establish a transaction-local `system` actor context for their seed transactions, but both treat `PGSSLROOTCERT` as optional and neither performs the production API's full session/effective role and ownership check nor an explicit environment/database target allowlist. Catalog seed defaults to the `production` profile. Treat as potentially mutating entrypoints; never invoke during audit. Design explicit environment/target/identity gates as a separate compatibility-reviewed change.
- `apps/api/infra/drizzle/reset-pg.ts`: standalone `Client`; requires a CA and verified TLS, restricts environment to development/test/staging, restricts dev/test to local hosts, checks exact target database, requires `DROP:<environment>:<database>`, and requires an additional exact staging approval. It does not establish operator actor context or validate session/effective role capabilities. The reset was not run.
- Manual staging bootstrap scripts (`bootstrap-staging-merchant.ts`, `-platform.ts`, `-rbac.ts`, `-staff.ts`, `-store.ts`) require `PGSSLROOTCERT` and verified TLS, use the shared explicit staging + exact database + confirmation + separate approval guard, and establish transaction-local `bootstrap` actor context before writes. The guard currently validates `current_database()` and `current_user`, but not `session_user`, role flags, ownership or `pg_stat_ssl` independently. This is a narrower manual-staging control, not a substitute for the API/migration identity gate.
- `verify-staging-bootstrap-target.ts` is read-only preflight and uses the same staging guard with verified TLS.
- `apps/api/src/scripts/bootstrap-issue-token.ts` was addressed by merged PR #174: verified TLS, exact connection identity/privilege/ownership checks and transaction-local bootstrap actor context.
- `apps/api/src/scripts/seed.ts`, `infra/drizzle/migrate.ts` and `infra/drizzle/reset.ts` use fixed local Docker container/user/database via `docker exec psql`, not arbitrary `DATABASE_URL`. They are local utilities; keep their use limited to disposable/local DBs.
- `infra/catalog-import-cli.ts` only reads/writes XLSX files and does not connect to PostgreSQL. `infra/pg-proxy.ts` is a local development proxy.

### Runtime actor-context coverage

- Worker DB work reviewed in `auto-complete.worker.ts`, `return-expiration.worker.ts`, `shipping-carrier.worker.ts`, and payment proof cleanup (`PaymentProofCleanupWorker` / `PaymentsService.cleanupStaleProofUploads`) uses `actorKind: worker` with a worker-specific ID around DB operations. Auto-complete claim/process/release calls are scoped by `withActorContext`; payment cleanup wraps claim, reference checks, and state transitions in worker context.
- `WorkerLeaseService` uses `actorKind: worker` for lease operations; the manual force-expire operation uses explicit `system` context. `worker-count-monitor.ts` has no direct SQL client.
- Audit service writes use `actorKind: audit`; the deferred response-finish middleware wraps its deferred write explicitly. Realtime store/order room authorization uses `withSocketActor` derived from authenticated socket identity and fails closed on authorization errors.
- No worker/realtime/audit code change was required by this bounded review.

### Migration observations

- Repository currently contains 77 numbered SQL migrations (0001–0077).
- Migration 0076 explicitly revokes table/sequence privileges from Supabase `anon` and `authenticated` roles and alters default privileges for the migration's `current_user`. Its comments state that server-only `service_role` and the configured API database role are untouched; it does not enable RLS. Treat its default-ACL scope as migration-principal-dependent and include it in the ownership/default-privilege crosswalk; do not replay or modify it as part of this audit.
- Migration 0077 is a bounded DML quarantine of carrier webhook rows missing credential binding; it detaches the shipment link and preserves processed state.
- Previously completed targeted review of migrations 0064–0077 found no CREATE FUNCTION/PROCEDURE/TRIGGER/RULE or PARTITION BY declarations in that range. This does not establish that the full 0001–0077 set has no such objects; the full migration DDL/FK/ownership crosswalk remains open.

### CI and protected remediation work

- PR #174 merge commit `4c5c755571385b346902c74c9f4f0578f48d9433` has CI run #1723 (`46085878528`) in progress at this checkpoint. Mobile, Lint/Typecheck, Web/Admin, Migration Full Apply and Boundary Lint had succeeded; Integration Tests and Unit/Coverage were still running. This push CI is on the merge commit; the following documentation-only `[skip ci]` commits are not part of that run.
- PR #138 remains OPEN / DRAFT / UNMERGED at exact head `81f30f5c30654b233ef373c15fd3f2cb867aba01`. Its preservation branch remains present. Never merge it wholesale or rewrite either ref.
- Next: complete the full 0001–0077 migration DDL/FK/ownership/default-ACL crosswalk; finish direct PostgreSQL import/client inventory beyond the reviewed API CLI entrypoints; prepare a least-privilege migration principal and verified TLS rollout plan without applying it; then batch the necessary source changes into one reviewable PR and one exact-head CI campaign.


## PR #138 preservation and mergeability reassessment — 28 November 2026

A fresh GitHub compare against current `develop` confirms PR #138 is not a safe merge candidate:

- PR #138 remains OPEN / DRAFT / UNMERGED. Its exact head is still `81f30f5c30654b233ef373c15fd3f2cb867aba01`; its PR base SHA is `f74eb588cc58fc99b105e749d39dbfbacb4f9775`, while current `develop` has advanced to `e0244b49303c1f76b0812ebf5765e4fd5718cf9d`.
- `develop...81f30f5c30654b233ef373c15fd3f2cb867aba01` reports DIVERGED: 3,044 commits ahead and 315 behind. The PR metadata reports 1,943 changed files, 108,107 additions and 414,514 deletions. The compare endpoint returns a capped file list, so these counts are repository metadata, not a full manual diff review.
- The original source branch `remediation/phase-0-1-tenant-security` and preservation branch `preservation/pr138-remediation-2026-11-25` are both at the unchanged SHA `81f30f5c30654b233ef373c15fd3f2cb867aba01`.
- The older `integration/pr138-bulk-remediation-2026-11-26` branch is at `a249d7368aefa715d32e8480452e8aff61535af6`; compare against current develop reports 0 ahead / 46 behind. It contains no unique commits to bring forward and is not a current integration candidate.
- Do not merge PR #138 or move either source/preservation ref. Treat the PR branch as read-only recovery source. The next safe PR #138 work is a deliberate logical-area salvage: enumerate changed production source/test/docs files, exclude scratch/archive deletions and unrelated history, compare each selected implementation against current develop, then cherry-pick or reimplement only verified deltas onto a fresh branch from current develop with focused tests. Group by cohesive remediation area and run one exact-head CI campaign per grouped PR.


## PR #138 three-way extraction reconciliation — 28 November 2026

A three-way Git tree comparison was run using merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775`, preserved source head `81f30f5c30654b233ef373c15fd3f2cb867aba01`, and current `develop` head `91795390cff5115dee475e07fd87d0c870a6e821`. The comparison excludes `.m73b6-scratch/`, `__tests__/scratch/`, and token-like artifacts; all three trees were complete (not truncated).

- 533 paths are byte-identical between PR #138 and current develop.
- 109 paths changed on both sides since the merge base and differ: 81 tests, 22 source files, 3 docs, 2 migrations and 1 workflow.
- 95 of those 109 paths were already part of the merged PR #170 file set. Of the remaining 14, twelve are covered by focused merged follow-ups: PR #157 (database actor context/runtime identity/tenant scope), #159 (orders schema), #169 (cancel/reject actor context tests), #171 (migration runner/lock test), and #174 (bootstrap CLI). The focused PR file list also confirms the relevant paths for #158/#172/#173 as appropriate.
- The two remaining differences are intentionally not copied: current develop's `outbox-dispatcher.service.ts` is safer than PR #138's old polling implementation (the source version logs events and marks them DISPATCHED without a real delivery adapter; current develop leaves events PENDING and disables polling). The source version of `catalog-governance-roundtrip.spec.ts` uses a random fixture UUID, while current develop uses its fixed isolated fixture.
- 60 paths are develop-only and must remain untouched.
- The 20 paths changed only on PR #138 are ten legacy migration verification/apply scripts, the old migration `0070_public_access_and_function_search_path_hardening.sql`, and ten historical project-memory files. None is a missing application source file. The old 0070 collides with current develop's `0070_normalize_arabic_search_path.sql` and overlaps security/default-ACL hardening now represented by develop migration 0076; do not import or apply it. Keep historical project-memory and shell evidence on the preserved source branch unless a specific document is deliberately promoted after review.

### PR #138 integration decision

- PR #170 (the 574-path non-conflicting extraction) merged at `d078fe0124ac04fb0da3fc26f3ff02306c45a33f` on 27 November. Current develop contains this merge commit (compare reports 0 ahead / 47 behind from the merge commit).
- Focused follow-ups #157, #158, #159, #169, #171, #172, #173 and #174 are also merged. Their exact changes replace/reconcile the overlapping actor-context, identity, order, worker, carrier, migration-audit and bootstrap paths.
- No further bulk extraction from PR #138 is justified by the current tree comparison. Its substantive application changes have been extracted or superseded by safer current-develop implementations. The residual PR-only files are historical project-memory/legacy verification artifacts and the colliding 0070 migration.
- PR #138 remains OPEN / DRAFT / UNMERGED at unchanged head `81f30f5c30654b233ef373c15fd3f2cb867aba01`; preservation ref is verified identical. Do not merge, rebase, reset, delete or force-push either source or preservation ref. Keep PR #138 as the preserved evidence/source archive. Any genuinely missing behavior must be raised as a new bounded PR from current develop with exact file provenance and focused tests.


## PR backlog reconciliation and new ISO reference-data PR — 28 November 2026

- Closed as already integrated/superseded without merging stale branches: PR #139 (merchant-offer tenant authorization / identity diagnostic), #143 (historical docs sync), #144 (merchant-offer tenant authorization), #148 (digital payment rejection), #149 (per-currency checkout totals), #150 (truthful notification status), #151 (country/currency selector source branch), #160 (outbox dispatch safety refresh), and #162 (HTTP credential redaction/audit evidence). The source branches were not rewritten or deleted.
- Evidence for closures: current develop has stronger merchant offer org/store membership and governance checks; OTP/HTTP log redaction; explicit payment method whitelist plus regression test rejecting DIGITAL before provider calls/inserts; `computeCheckoutTotalsByCurrency` and mixed-currency tests; notification external-channel `NOT_CONFIGURED` status rather than false SENT; and outbox polling disabled until a real delivery adapter exists, with unknown carrier events dead-lettered. PR #162's four files were byte-identical to develop. PR #160's outbox files/docs were identical and its worker/test were superseded by newer actor-context-aware versions.
- PR #151's useful 12-file ISO reference-data feature was ported to current develop as draft PR #175: https://github.com/nabeel2323/scs-platform/pull/175. Branch `feat/iso-country-currency-selectors-2026-11-28`, one grouped commit `b48e2a463c28eb7bcb1c880634c4f4f388ad5b5b`, base `6a89b471329a22dce239b17873063f8eabf15b9f`. Adds 249 country options and 155 currency options for web/mobile, currency-specific 0–4 minor-unit formatting and offer price conversion, and web/Flutter tests. No DB/schema/FX/provider/deployment changes. PR #175 remains DRAFT pending exact-head CI #1724; Lint/Typecheck and Mobile were in progress at last poll. No reviewers requested.
- PR #151 is closed as superseded by #175; its original source branch remains unchanged. PR #138 remains the only other open PR and remains protected OPEN/DRAFT/UNMERGED at `81f30f5c30654b233ef373c15fd3f2cb867aba01`.
- PR #174 merge commit CI #1723 (`46085878528`) has all jobs passed except Container Build & Smoke Test still in progress; k6 was skipped. No staging release was triggered. Exact-head PR #174 run #1722 passed all ten mandatory jobs.
- Current open PR backlog is intentionally reduced to #138 (preserved source archive) and #175 (current-base country/currency feature). Continue with the G-002 migration-principal/TLS evidence gate; do not change staging/production DB roles, grants/default ACLs, RLS, Render settings, deploy or activate workers before protected read-only catalog evidence and explicit approval.


## CI completion update — 28 November 2026

- Post-merge CI run #1723 (`46085878528`) on PR #174 merge commit `4c5c755571385b346902c74c9f4f0578f48d9433` has now COMPLETED SUCCESSFULLY. All ten mandatory jobs passed, including Container Build & Smoke Test, Build, Mobile, Web/Admin, Integration, Unit/Coverage, Migration Full Apply, Contract/Codegen and E6 Boundary Lint. k6 was skipped on develop; the staging release gate remained disabled. No staging deployment occurred.
- PR #175 CI run #1724 (`46087426872`) is still running on exact head `b48e2a463c28eb7bcb1c880634c4f4f388ad5b5b`. Lint & Typecheck and Mobile analyze/test have passed; Web/Admin tests, API Unit/Coverage, Integration Tests, Migration Full Apply and Boundary Lint were still in progress at last poll. Keep PR #175 draft until every mandatory job passes.


## PR #175 CI progress — 28 November 2026

- Exact-head run #1724 (`46087426872`) on `b48e2a463c28eb7bcb1c880634c4f4f388ad5b5b`: Lint & Typecheck, Mobile analyze/test, Web & Admin App Tests, Migration Full Apply and E6 Boundary Lint have passed. API Unit Tests/Coverage and Integration Tests remain in progress. Build/container/contract gates have not yet reported at this poll. PR #175 stays draft; do not merge until all mandatory checks complete successfully.


## G-002 migration object crosswalk — 28 November 2026

- Added [G-002 Migration Object and Tenant-Ownership Crosswalk](../docs/remediation/G-002-MIGRATION-OBJECT-CROSSWALK.md), source-reviewed against all 77 numbered migrations on develop. The scan found the single application-defined function `public.normalize_arabic(TEXT)` in 0007 (IMMUTABLE, not SECURITY DEFINER); migration 0070 pins its function-local search_path to pg_catalog and verifies the catalog config. Analytics partitioning is introduced in 0002 and re-established/configured with pg_partman in 0013, with retention in 0018.
- No CREATE TRIGGER, CREATE PROCEDURE, CREATE RULE, explicit OWNER TO, or migration-authored SECURITY DEFINER declaration was found in the numbered migrations. This is source evidence only; it does not prove the live catalog contains no externally-created objects or ownership overrides.
- Migration 0076 is the only numbered migration changing table/sequence grants and default ACLs; it revokes anon/authenticated privileges and applies future-object revocations for object-creating roles. Actual object creators/owners and the migration principal still require protected read-only catalog verification.
- The migration FK scan shows predominantly single-column references; these provide referential integrity but do not by themselves enforce same-tenant ownership. Complete the sensitive operation→authoritative tenant predicate matrix before any RLS/role transition.
- Reconfirmed source-level entrypoint distinctions: API runtime pool has a fail-closed production-like identity/TLS gate; standalone migrate-pg remains diagnostic/non-fatal with optional CA TLS and no transaction-local migration actor; seed/catalog, reset, and five manual bootstrap scripts have distinct guard/actor-context behavior. Do not execute seed/reset/bootstrap scripts during this audit.
- PR #175 exact-head CI #1724 (run 46087426872) is now SUCCESS: all 10 mandatory jobs passed (lint/typecheck, mobile, Web/Admin, unit/coverage, integration, migration full apply, E6, build, container smoke, contract/codegen); k6 and staging release skipped. It remains a separate draft PR; no merge or staging action was taken.
- Current develop documentation update starts from the previously verified develop baseline. No application code, staging DB, Render configuration, role, credential, grant, RLS, worker, provider or deployment state was changed.


## G-002 live staging catalog and access-predicate review — 28 November 2026

- Added live read-only catalog evidence to `docs/remediation/G-002-MIGRATION-OBJECT-CROSSWALK.md`. Supabase SQL-tool session was `postgres` over TLS, with BYPASSRLS/CREATEROLE/CREATEDB; this is the SQL tool's identity and must not be confused with Render API or migration-runner identity.
- Staging catalog: 114 ordinary public tables, one partitioned parent and one sequence owned by postgres; 115 public tables/partitioned relations have RLS disabled and none forced; 182 public FKs; no non-internal public triggers; application function `normalize_arabic(TEXT)` owned by postgres, not SECURITY DEFINER, search_path pinned to pg_catalog; pg_partman 5.3.1 is owned by postgres and analytics_events uses monthly partitions/12-month retention.
- Privileges: anon/authenticated have zero table CRUD/TRUNCATE access across 115 relations; postgres owns all app relations. service_role has zero CRUD but has TRUNCATE/REFERENCES/TRIGGER (and MAINTAIN where supported) across all 115 relations, granted by postgres; treat as highly privileged/server-only. Postgres-owned-object default ACLs exclude anon/authenticated, but retain service_role Dxtm. Supabase_admin public default ACL still grants broad table/sequence privileges to anon/authenticated/service_role; no current app relations are owned by supabase_admin, but this is a future-object risk if that role creates public app objects. No ACL changes made.
- Source callsite review confirmed direct pools/clients in DatabaseService, standalone migrate-pg, seed-pg, seed-catalog, reset-pg, five staging bootstrap scripts, read-only audit-db-access, local-only create-admin-user and bootstrap-issue-token. The five staging bootstrap scripts require CA TLS and exact target confirmation but their shared helper only checks database/current_user and does not enforce role flags/ownership/TLS itself. No seed/reset/bootstrap script was run.
- `audit-db-access.ts` is read-only by design but has optional CA TLS and reports unsafe identity rather than rejecting; it was not executed through Render's actual DATABASE_URL. The Supabase catalog SELECTs were separate and use the SQL tool's own connection.
- Spot-checked domain predicates: merchant offers assert store/org and store membership; inventory verifies store/org, warehouse/variant same-store; shipping validates org membership and driver/store assignment; carrier credentials are org-scoped with explicit context; payment and cart paths validate order/store/buyer and resolve store from persisted product/offer. This is a positive spot-check, not complete route-level proof.
- TenantDatabaseContextInterceptor remains opt-in/not globally registered. AppModule globally registers audit middleware only. Explicit withActorContext exists in a subset of catalog/orders/payments/merchant/carrier flows; several services rely on caller arguments and service-level predicates without transaction-bound actor context. Do not enable RLS until every route/service/worker/raw SQL path is inventoried and tested.
- No database mutation, grants/default ACL change, role/credential change, RLS, Render env change, deploy/restart, worker activation, seed/reset/bootstrap or provider call was performed. PR #138 refs remain protected; PR #175 remains separate and draft despite its successful exact-head mandatory CI.


## Latest continuation update — 28 November 2026 (G-002 source audit)

- PR #138 remains OPEN/DRAFT/UNMERGED at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; its source and preservation refs remain protected. The completed three-way reconciliation is final for bulk extraction; do not reimplement already integrated work.
- PR #170 and #174 are merged. PR #175 exact-head CI #1724 (run `46087426872`) passed all ten mandatory jobs; k6 and staging release were skipped. Keep #175 separate and draft: it is 1 commit ahead / 26 behind the current develop comparison baseline and is not part of G-002. Do not merge it as part of this remediation.
- The latest develop mandatory CI run #1723 (`46085878528`) passed all ten mandatory jobs on merge commit `4c5c755571385b346902c74c9f4f0578f48d9433`; later handoff/documentation-only commits were not covered by that run. Current Vercel Web free-plan rate-limit failure is external; do not trigger redundant builds.
- Read-only source review details and exact file hashes are recorded in `docs/remediation/IMPLEMENTATION-PROGRESS.md`. Key follow-ups: complete direct PostgreSQL client/pool inventory; trace carrier credential/configuration internal helper callers where activeOrgId may be null; complete per-shipment worker organization attribution and operation-to-table ownership predicates; reconcile audit/worker actor-context nesting.
- Keep migration runner identity/TLS hardening behind the separate migration-principal, object-ownership and rollback plan. Preserve advisory-lock and per-migration transaction semantics. No database/RLS/grant/credential/Render/deployment/worker/provider changes and no CI were performed for the source audit.
- Next: finish the grouped G-002 source and focused-test batch, then run one consolidated exact-head mandatory CI campaign. Do not dispatch protected staging audits or release workflows automatically; no reviewers are required.
 

## PR #176 continuation — 28 November 2026, 08:26 UTC

- PR #176 remains OPEN/DRAFT, targets `develop`, and contains four commits on `fix/g002-bootstrap-identity-guard-20261128`. It changes the shared staging bootstrap guard, its unit tests, and the CI container-smoke PostgreSQL readiness sequence. Do not merge until the latest exact-head mandatory CI run passes.
- First CI run #1725 (`46109661958`) passed Lint & Typecheck, Mobile Flutter analyze/tests, Migration Full Apply, Unit Tests + Coverage Gates, Web & Admin App Tests, Boundary Lint (E6), Integration Tests, Contract Spec & Codegen, and Build. Only Container Build & Smoke Test failed; k6 and staging release were skipped.
- Failure evidence: smoke job #140873148300 showed `pg_isready` caught the temporary PostgreSQL server started by the official Docker entrypoint during first-time initialization. That temporary server then shut down before the role-creation command (`FATAL: the database system is shutting down`). The failure occurred before the API container was started; do not classify it as an application startup defect.
- Workflow correction committed in PR #176: wait for `PostgreSQL init process complete; ready for start up.`, fail with container logs if PostgreSQL exits, then require three consecutive successful `pg_isready` probes before creating the least-privileged API smoke role. This avoids accepting the transient init server.
- New PR #176 head is `dc7572e53b09a38cd9979cd76d0b22717c0f35cb`; follow-up CI status must be checked on this exact SHA. Vercel pending/success checks are external preview deploys and are not substitutes for GitHub Actions mandatory CI.
- No database/staging access, migration execution, role/grant/RLS change, Render/deployment operation, or reviewer request was made. PR #138 preservation remains unchanged; PR #175 remains separate.
- Next: inspect exact-head CI #176 follow-up; if the workflow fix validates and all mandatory jobs pass, perform a final source/diff check and merge PR #176 into develop. If smoke still fails, inspect the PostgreSQL container logs before any further retry. Then continue G-002: inventory all raw pg clients/pools and bootstrap scripts; test carrier internal-helper org binding and worker lineage/actor attribution; complete operation-to-table ownership matrix. Batch related changes and run CI once.


### Additional G-002 finding — carrier actor context

The 28 November source review also identified null-org actor-context reuse in the internal credential/configuration helpers and Aramex provider helper. See the detailed callsite analysis and required test/refactor sequence in `docs/remediation/IMPLEMENTATION-PROGRESS.md` under “G-002 follow-up: carrier helper actor-context edge cases”. Treat this as a high-priority tenant-boundary correctness gap pending focused regression tests; do not claim exploitability without proof. The refactor must separate unscoped store-owner discovery from org-bound credential access because nested actor switching is intentionally forbidden by DatabaseService.
