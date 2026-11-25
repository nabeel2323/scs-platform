
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
