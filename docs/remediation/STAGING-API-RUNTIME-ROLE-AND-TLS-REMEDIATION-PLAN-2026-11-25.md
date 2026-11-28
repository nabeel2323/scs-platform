# Staging API Runtime Role and TLS Remediation Plan — 25 November 2026

## Confirmed evidence

Read-only Render inspection of workspace `My Workspace`, service `scs-api-staging` (`srv-daklr78ae00c73bstr50`) found:

- Service branch: `develop`; auto-deploy disabled; one Free web-service instance in Frankfurt; start command `pnpm --filter @scs/api start:prod`; no separate Render worker/cron service was returned.
- Latest successful deployment: `fde20420bbb759d2e562f9ff747c9e824ac58e25`, deployed 25 November 2026 at 12:06:17 UTC.
- Five runtime identity diagnostics between 10:21 and 12:30 UTC consistently report `session_user = postgres`, `current_user = postgres`, database `postgres`, `superuser=false`, `BYPASSRLS=true`, `CREATEROLE=true`, `CREATEDB=true`, and `ssl=false`.
- These are logs emitted by the running API process, so they establish the API runtime identity. They are not merely the separate Supabase management/audit connection identity.
- The current `DatabaseService` only adds PostgreSQL TLS options when `PGSSLROOTCERT` points to a CA file. The observed connection reports `ssl=false`.
- The migration runner identity remains unverified. `release.yml` uses `STAGING_DATABASE_URL` and `STAGING_PGSSLROOTCERT_PEM`; the protected read-only `db-access-audit.yml` workflow has not been dispatched.
- No environment-variable values were retrieved. No Render configuration, database role, grant, migration, RLS policy, worker, deployment or secret was changed.

## Why this blocks RLS

The API runtime is using the table-owning `postgres` role, which has `BYPASSRLS`. PostgreSQL RLS policies do not constrain this role. Enabling RLS while the API remains connected as `postgres` would create a false sense of tenant isolation.

The API also currently uses a database connection for which PostgreSQL reports TLS disabled. This must be corrected before production readiness.

## Target role model

### API runtime role

Provision a dedicated login role (proposed name: `scs_api_runtime`) with:

- `LOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEROLE`, `NOCREATEDB`, `NOREPLICATION`.
- No ownership of application tables, sequences, schemas, or functions.
- No `CREATE` on `public`.
- Only the minimum schema `USAGE`, table DML, and sequence privileges required by the API.
- No `TRUNCATE`, `MAINTAIN`, `REFERENCES`, or `TRIGGER` privilege unless a specific reviewed operation proves it is required.
- Tenant isolation enforced by the approved RLS policies using the transaction-local actor context. Platform-control tables must have separately reviewed system/worker policies.

The role password must be provisioned through a protected secret channel. Never put a password in a migration, repository file, commit, workflow output, or log.

### Migration runner role

Use a separate migration-only login (proposed name: `scs_migrator`) for DDL and controlled schema changes. It must not be used by the API process. Its exact ownership/SET ROLE model must be chosen only after the protected audit establishes current owners, role memberships, default ACLs and Supabase-managed role constraints.

Do not assume `STAGING_DATABASE_URL` is different from `DATABASE_URL`; prove its identity with the protected audit workflow.

## TLS configuration

- Configure a Render secret file containing the trusted database CA certificate and set `PGSSLROOTCERT` to its mounted file path.
- Keep `rejectUnauthorized: true`; do not use `rejectUnauthorized: false` or disable TLS to work around certificate errors.
- The current `DatabaseService` already reads `PGSSLROOTCERT` and enables verified TLS when the file is present. The observed `ssl=false` means the current running API connection is not using that path.
- Add a fail-closed startup check for staging/production so a missing CA file or non-TLS connection cannot silently proceed. Implement and test this before any staging rollout.
- The release workflow already writes `STAGING_PGSSLROOTCERT_PEM` to a temporary CA file for migration jobs; keep the API and migration TLS configuration independently explicit.

## Controlled rollout sequence

1. **Protected read-only audit:** dispatch `.github/workflows/db-access-audit.yml` on `develop` and approve its protected `staging` environment. Capture API/migration identity, role flags, schema/table/sequence privileges, object owners, default ACLs, relation kinds, extensions, functions and partition maintenance identity. This workflow is read-only; do not dispatch `release.yml` as an audit.
2. **Privilege and ownership design:** reconcile the 114 live public table/partition relations with the 100 Drizzle declarations and unresolved 116 count. Reconcile `postgres` and `supabase_admin` object/default ACLs; do not alter Supabase-managed defaults ad hoc.
3. **Provision roles:** prepare a reviewed, idempotent staging-only provisioning path for `scs_api_runtime` and `scs_migrator`, with secrets supplied only through protected environment secrets. Confirm rollback and recovery.
4. **Render configuration approval:** separately authorize the Render environment change to replace the API `DATABASE_URL` with the new runtime-role connection and mount the CA secret file for `PGSSLROOTCERT`. No Render setting has been changed in this audit.
5. **Deploy and verify:** only after approval, deploy the reviewed code/config to staging. Startup diagnostics must report `session_user=current_user=scs_api_runtime`, all superuser/BYPASSRLS/CREATEROLE/CREATEDB flags false, and `ssl=true`. Verify readiness and representative read/write operations under the actual API role.
6. **Migration identity:** run the protected read-only audit again or use the migration workflow's non-secret identity diagnostic to prove `scs_migrator` is separate and has only the intended DDL rights.
7. **RLS rollout:** only after the actor-context, table/operation ownership matrix, FK ownership crosswalk and policy tests are complete, apply reviewed RLS policies in a controlled migration. Do not enable RLS before the API role is proven non-owner and non-BYPASSRLS.
8. **Release gate:** preserve staging rollback/recovery evidence and keep production database provisioning separate; no production action is authorized by this staging plan.

## Current status

<badge>BLOCKED — runtime role and TLS</badge>

- API runtime identity: confirmed unsafe for RLS (`postgres`, `BYPASSRLS=true`).
- API TLS: confirmed disabled (`ssl=false`).
- Migration runner identity: unverified.
- Dedicated API/migration roles: not provisioned.
- Render environment: unchanged.
- RLS/grants/default ACLs/migrations: unchanged.


## Code-side fail-closed guard implemented — 25 November 2026

The PR #138 source branch now includes a fail-closed database startup guard (not deployed):

- `env-gate.ts` adds `resolveDeploymentNodeEnv`; a Render `RENDER_SERVICE_ID` forces production-like validation even if `NODE_ENV` is missing, `development` or `test`. JWT, OTP HMAC, bootstrap-owner, database and Redis config gates use the resolved environment; Render cannot accidentally run development secret fallbacks or development auto-migrations.
- `DatabaseService` enables verified TLS for production-like/Render services. If `PGSSLROOTCERT` is mounted it uses that CA with `rejectUnauthorized=true`; otherwise it uses Node's system trust store with verification enabled.
- Before the API accepts traffic, the runtime identity diagnostic now fails closed if identity cannot be read, TLS is not active, session/effective roles differ, either role is superuser/BYPASSRLS/CREATEROLE/CREATEDB, or the effective role owns the public schema or any public table/partition.
- Source commits: `eba273b7b88a2c374dd8694eb0137bc4d0ec2117`, `a22962612a3a59e93e12d20283bcd34dbe99852c`, `4e387fcf38629669c22e7af7d1fd99adf4a470af`, `3f19eb709558dfb5ccb52111a7ae9af4c45159bc`, `1e3b65f02b39648fdc1bb5af46ba78583533e53c`.
- Tests/typecheck/CI have not been run for this source batch. It remains implementation-in-progress; do not merge or deploy based on source review alone.
- The currently deployed staging API remains on develop SHA `fde20420...` and continues to report `postgres`, `BYPASSRLS=true`, `ssl=false`. The new guard is not deployed. Deploying it before the dedicated runtime role is provisioned will intentionally fail startup. Do not deploy until the role and TLS secret-file configuration are ready.
- No database role/grant/RLS/migration or Render environment setting has been changed. The user authorized staging DB changes, but Render environment changes remain unapproved.


## 28 November 2026 — code-side gates merged; staging remains blocked

- The production-like API startup identity/TLS guard described above is no longer only on the PR #138 source branch: its bounded foundation was merged through PR #157 and subsequent focused work. Current `develop` refuses to start in a production-like environment if identity cannot be verified, session/effective role differ, either role is superuser/BYPASSRLS/CREATEROLE/CREATEDB, the effective role owns public tables/schema, or verified TLS is absent.
- PR #174 separately hardened the standalone bootstrap token CLI with verified TLS, exact session/effective identity and privilege/ownership checks, and transaction-local bootstrap actor context. Exact-head CI #1722 passed all ten mandatory jobs; PR #174 merged at `4c5c755571385b346902c74c9f4f0578f48d9433`.
- The migration runner remains a separate unresolved boundary. `migrate-pg.ts` still treats identity capture as diagnostic/non-fatal and only configures verified TLS when `PGSSLROOTCERT` is set. It does not yet enforce a dedicated `scs_migrator` principal or transaction-local migration actor context. Do not infer migration identity from the API's historical `postgres` runtime evidence.
- Current code-side guard is not evidence of a new staging deployment. No Render settings, secrets, database roles, grants/default ACLs, RLS policies, migrations, worker flags or deployment were changed in this continuation. The last documented deployed staging revision remains `fde20420bbb759d2e562f9ff747c9e824ac58e25` from 25 November; its historical logs showed `postgres`, `BYPASSRLS=true`, `CREATEROLE=true`, `CREATEDB=true`, `ssl=false`. Reconfirm live state through the protected read-only workflow before any rollout.
- The protected `.github/workflows/db-access-audit.yml` remains the next evidence gate. It checks out the selected immutable revision, writes the staging CA from the protected secret, runs `audit-db-access.ts` in a `BEGIN READ ONLY` transaction with audit actor context, and removes the temporary CA. It inspects API/migration login/effective roles, memberships, schema/table/sequence grants, default ACLs, RLS, relation/partition inventory, functions/triggers, extensions and active connections. It has not been dispatched in this continuation; do not use `release.yml` as an audit.
- After the read-only evidence, update the migration role design to account for actual owners, Supabase-managed roles, extension/partition maintenance, default ACLs and migration sequencing. Keep `scs_api_runtime` non-owner/non-BYPASSRLS with minimum DML, and define `scs_migrator` separately with reviewed DDL ownership/SET ROLE semantics. Do not provision either role, alter Render config, apply grants/default ACLs or enable RLS until the audit and rollback plan are approved.
- Deployment remains blocked: deploying the current API guard against the historically observed staging `postgres`/BYPASSRLS/no-TLS identity will intentionally fail startup. Provisioning the runtime identity and verified TLS must precede any deployment.
