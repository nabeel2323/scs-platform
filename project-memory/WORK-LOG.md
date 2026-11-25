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
