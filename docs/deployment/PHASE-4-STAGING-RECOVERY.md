# Phase 4 — Staging Recovery and Deployment Hardening

**Scope:** staging only. This runbook separates code readiness from live Render configuration and deployment.

## Known state from the Phase 3 investigation

- The candidate deployment failed before NestJS application creation because OTP_HMAC_SECRET was missing or blank.
- Migrations 0064_email_identity.sql and 0065_hmac_identifier_hash.sql were already committed to the staging migration ledger. Do not roll them back or manually re-run their SQL.
- The auth.email_otp.enabled feature flag was false at the time of investigation. Keep it false during this recovery.
- The prior API deployment remained live and served the readiness endpoint.
- The staging service start command currently chains migration, RBAC seed, and API startup. This runbook removes database mutation from the web-service boot path.

## 1. Prepare the OTP HMAC secret securely

Generate a unique value in a trusted local terminal. Do not paste it into chat, commit it, put it in a ticket, or print it in deployment logs.

```bash
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex') + '\\n')"
```

In the Render dashboard, add or update only OTP_HMAC_SECRET for the staging API service. Use the generated value directly in Render's secret-value field. Do not replace the complete environment-variable set.

The application requires at least 32 characters and rejects its documented development placeholder. A 32-byte random value encoded as hex is 64 characters.

## 2. Separate release database work from API startup

Use a dedicated one-off release operation against the staging database, with the intended migration database identity:

```bash
pnpm --filter @scs/api db:migrate
pnpm --filter @scs/api db:seed
```

The migration runner now takes a session-level PostgreSQL advisory lock around the migration ledger check and migration sequence. This prevents two independent runner processes from applying the same pending migration concurrently. The lock is released explicitly on normal completion and automatically by PostgreSQL when the owning session closes.

Do not run catalog/demo/bootstrap seed commands as part of this recovery. The existing RBAC seed is additive; it does not reconcile stale role-permission mappings.

After the one-off release operation succeeds, set the Render web service start command to:

```bash
pnpm --filter @scs/api start:prod
```

Do not deploy this command change until the secret is configured and the release operation has been reviewed.

## 3. Verify before and after deployment

Before deployment:
- Confirm OTP_HMAC_SECRET is present in Render without copying its value into logs or chat.
- Confirm NODE_ENV, DATABASE_URL, REDIS_URL, and required alert configuration are present and valid.
- Confirm the staging database ledger contains migrations 0064 and 0065.
- Confirm the email OTP feature flag remains disabled.
- Confirm the release migration command reports no pending migrations.
- Confirm the RBAC seed reports existing rows preserved and no unexpected additions.

After deployment:
- Confirm the new deploy reaches /v1/readyz and returns HTTP 200.
- Confirm startup logs contain no secret values.
- Confirm the new deployment is serving the candidate commit.
- Exercise existing password/login and refresh flows.
- Verify OTP request behavior remains disabled by the feature flag.
- Check logs for worker duplication, repeated migration/seed execution, database connection failures, and unexpected 4xx/5xx responses.
- Confirm the previous deployment can be restored through Render's normal rollback mechanism if smoke tests fail.

## 4. Operational hardening follow-ups

- Keep the migration command out of the long-running web service start command.
- Use a dedicated least-privilege migration database role where the migration set permits it; keep the runtime role separate.
- Restrict the Render service IP allowlist if the staging access model supports known source ranges. Network allowlisting does not replace application authentication.
- Verify SMTP configuration with an actual controlled delivery test before enabling email OTP.
- Do not enable auth.email_otp.enabled in this recovery step.
- Do not roll back migrations 0064/0065 in response to the startup-secret failure.

## 5. Acceptance criteria

- [ ] The migration runner serializes concurrent invocations using a PostgreSQL advisory lock.
- [ ] Integration tests prove mutual exclusion and lock release after session disconnect.
- [ ] The staging release migration command completes with no pending migrations.
- [ ] The RBAC seed completes without unexpected changes.
- [ ] Render API startup runs only start:prod.
- [ ] The OTP HMAC secret is set securely and is never exposed in logs or source control.
- [ ] The new staging deployment serves the candidate commit and passes readiness and smoke tests.
- [ ] Email OTP remains disabled until SMTP and end-to-end OTP delivery are independently verified.
