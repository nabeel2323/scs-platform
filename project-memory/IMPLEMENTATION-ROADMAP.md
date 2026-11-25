## 25 November 2026 — continuation priority (implementation phase)

The live branch state is PR #138 (`remediation/phase-0-1-tenant-security`) at `8e2c08953442a6d0f67568f0c5567898f7eb12e7`, OPEN / DRAFT / UNMERGED, 2,725 ahead / 3 behind `develop`. Keep it unmerged; use bounded PRs for completed slices.

1. **Next task — actor-context test-callsite migration.** Work through the 227 TS2554 errors identified in historical CI #45586306936 (SHA `ed685b0d`), grouped by the service method/signature change. Add correct actor fixtures and parameters to legacy test helpers, with explicit identity/tenant semantics. Never downgrade production method signatures or pass a generic privileged actor to tests whose purpose is tenant isolation.
2. Continue G-002 source inventory and method-to-data ownership crosswalk: raw SQL/functions/triggers/partitions, every DB access predicate, migration FK mapping, nested actor context lifecycle/reuse, worker and operator contexts.
3. Obtain actual API database runtime identity and TLS facts through an authorized diagnostic or safe operator evidence. Migration identity was confirmed `postgres` + BYPASSRLS/CREATEROLE/CREATEDB; this does not establish the current Render API identity. No Render config/deploy/restart is included in this step without separate authorization.
4. Reconcile object ownership/default ACLs under postgres and supabase_admin without speculative changes to managed roles. Prepare a migration-only staging workflow with backup/restore, ledger, lock, rollback/recovery and explicit protected approval.
5. Keep database changes blocked until steps 2–4 and actor coverage are complete. Then design least-privilege role transition and table-specific RLS as a separate, reviewed phase.
6. Finish all implementation and cross-client integration before the consolidated validation campaign. Only afterwards run formatter, lint, typecheck, unit/integration/migration/E6/build/contract/Flutter and exact-head CI once.

PR #152 OTP logging remediation is merged and must not be repeated. PRs #153–#156 are separate draft remediation slices. No DB mutation, RLS/grant/migration action, Render change/deploy, worker activation, business workflow, protected release or PR #138 merge was made in this continuation.

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


## 25 November 2026 — next sequence: finish evidence before RLS

Read `docs/remediation/STAGING-ACCESS-CONTROL-OTP-WORKER-AUDIT-2026-11-25.md`.

1. Obtain the actual API and migration connection role identities using the protected read-only `db-access-audit.yml` workflow and Render startup logs.
2. Reconcile existing ACLs and defaults, including postgres and supabase_admin default ACL ownership; do not run migration 0070 until the migration identity and default-ACL scope are verified.
3. Confirm Render service start command, deployed SHA, instance count, worker flags, cron jobs and current OTP logs. Do not dispatch the mutating release workflow.
4. Apply/test OTP log-redaction patch only after the user requests repository application; patch is currently local at /mnt/data/otp-log-redaction.patch.
5. Finalize a least-privilege API runtime role and tenant RLS policy design. Never enable RLS while the API uses a table-owner/BYPASSRLS role without an explicit migration plan.
6. Audit generic outbox event delivery, auto-complete pre-commit realtime emission, and in-process carrier/auto-complete worker gates.
7. After implementation/integration is complete, run unit tests, formatter, lint, typecheck, E6 and CI; then prepare a separately approved staging rollout plan.

No RLS/grant/migration/deployment/worker activation or business workflow is authorized by this audit checkpoint.

## 25 November 2026 — continuation after Render inspection and OTP remediation

1. Obtain actual API and migration connection identities using the protected read-only `db-access-audit.yml` workflow. This workflow has not been dispatched; its protected `staging` environment approval must not be bypassed.
2. Reconcile current grants and default ACLs, including the `postgres` and `supabase_admin` object-creation paths. Review migration 0070 and any follow-up migration; do not apply until role and ownership evidence is complete.
3. Design the least-privilege API runtime role and table-specific RLS policies using the verified tenant/worker actor model. Never enable RLS for a table accessed by a table-owner or BYPASSRLS API role without a deliberate role migration.
4. Prepare a staging-only migration and rollback/recovery sequence under the user's explicit staging-database authorization. Production database provisioning remains outside scope.
5. Continue Orders actor-context completion, fix the recorded typecheck implementation gaps, and resolve generic outbox delivery and AutoCompleteWorker side-effect boundaries. Keep tests authored but unexecuted until implementation/integration is complete.
6. Complete implementation and integration before the consolidated test/CI campaign. Do not rerun Actions during implementation.

The Render audit is recorded in `docs/remediation/RENDER-STAGING-READONLY-CHECK-2026-11-25.md`. OTP source changes are committed but not deployed or runtime-verified.

## 25 November 2026 — updated after protected audit

The protected read-only audit is complete: [workflow #45590012595](https://github.com/nabeel2323/scs-platform/actions/runs/45590012595) confirms the staging migration credential is `postgres` (BYPASSRLS, CREATEROLE, CREATEDB). It does not establish the Render API's separate runtime identity; the live API remains on `f74eb588` and the identity diagnostic on PR #138 is not deployed.

Next sequence:
1. Keep PR #138 draft/open. Review the audit output and correct the evidence record: current anon/authenticated/service_role effective DML on existing tables is zero; non-DML privileges are excessive; postgres and supabase_admin default ACLs differ.
2. Obtain actual Render API runtime identity through a separately authorized diagnostic deployment or equivalent safe operator evidence. Do not change Render service configuration or deploy without separate authorization.
3. Complete the API/worker/bootstrap/audit transaction-context and DB operation matrix; RLS cannot protect queries executed as postgres/table owner/BYPASSRLS, and partial context coverage risks breaking workflows.
4. Reconcile future-object ACLs under postgres and supabase_admin. Do not alter Supabase-managed ownership or defaults without an independently reviewed, supported mechanism.
5. Prepare a dedicated migration-only staging execution path and rollback/recovery evidence. The existing release workflow is mutating (migrate + seed + deploy) and is not an audit/dry run. Do not dispatch it for a database-only change.
6. Only after 2–5, finalize table-specific policies and a least-privilege runtime role, then run the approved staging migration and focused runtime checks. Preserve data; no reset.
