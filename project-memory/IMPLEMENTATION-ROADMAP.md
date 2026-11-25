
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
