# OTP Email-Only Staging Readiness Gate

**Report date:** 2026-11-07  
**Branch:** `feature/otp-auth-security-hardening`  
**HEAD commit:** `2f42ff5`  
**Client implementation commit:** `751b708`  
**Baseline email-only implementation:** `3c246e7`

---

## Executive Verdict

**READY WITH BLOCKERS**

The code is technically ready for email-only OTP staging. All client implementations (mobile, web, admin) honour the email-only channel policy. Backend policy enforcement is proven by 41/41 tests. However, three blockers must be resolved before staging activation:

1. **Deployment configuration gap:** `infra/docker-compose.prod.yml` does not pass OTP/SMTP environment variables to the API process. The API will fail to start without `OTP_HMAC_SECRET`, and email delivery will fail without SMTP configuration.
2. **Real-Redis verification gap:** Integration tests requiring disposable Redis cannot be executed locally (no Redis container running, no environment configured). Hosted CI provides Redis, but the feature branch does not trigger CI.
3. **Migration 0066 not applied:** The `device_credentials` table required by the server-issued device trust feature does not exist in staging. The API can start without it, but device trust operations will fail at runtime.

**Code readiness:** ✅ Ready  
**Hosted CI readiness:** ⚠️ Blocked (feature branch does not trigger CI; PR required)  
**Migration readiness:** ⚠️ Blocked (migration 0066 not applied to staging)  
**Browser compatibility:** ✅ Ready (cross-site cookie design proven)  
**Real email delivery:** ⚠️ Blocked (SMTP not configured, deployment env vars missing)

---

## 1. Branch and Commit Verification

**Branch:** `feature/otp-auth-security-hardening`  
**HEAD:** `2f42ff5 docs(auth): record the client-readiness commit SHA in the report`  
**Implementation commit:** `751b708 feat(auth): make clients honour the email-only OTP channel policy`

### Commit history since baseline (3c246e7)

```
2f42ff5 docs(auth): record the client-readiness commit SHA in the report
751b708 feat(auth): make clients honour the email-only OTP channel policy
06411a4 docs(auth): record the delivery SHA and verification scope for the email-only release
```

### Working tree status

**Unrelated changes (preserved, not committed):**
- `apps/api/src/modules/returns/commission-reversal.service.ts` (modified)
- `apps/api/src/modules/returns/returns.service.ts` (modified)
- `docs/production/P13-*` (6 files modified)
- `docs/production/SCS-B2B-FRAMEWORK-COMPLETENESS-REPORT.html` (modified)
- `.audit-scratch/`, `.m73b6-scratch/` (untracked scratch directories)

**No uncommitted changes to OTP security parameters, migration definitions, or production configuration.**

### Commit 751b708 contents

23 files changed (+2,577 / −159):
- **New (10):** 3 mobile, 3 web, 3 admin test files; 1 report
- **Modified (13):** mobile/web/admin login screens, models, test harnesses, activation report

**Authorization boundary honoured:** No real OTP messages sent; no credentials configured; no environment modified; no migration applied; no merge or deploy.

---

## 2. Hosted CI Trigger Analysis

### Workflow configuration (`.github/workflows/ci.yml`)

**Triggers:**
- `push` to `[main, develop]`
- `pull_request` to `[main, develop]`

**Feature branch behavior:** Pushes to `feature/otp-auth-security-hardening` do **NOT** trigger CI. Only a pull request targeting `develop` or `main` triggers the workflow.

### Jobs and coverage

| Job | Coverage | Requirements |
|-----|----------|--------------|
| `lint` | API/web/admin lint + typecheck | Node 22, pnpm 9.15.9 |
| `boundary-lint` | Advisory, non-blocking | — |
| `test-unit` | API unit tests + coverage gates | Node, pnpm |
| `test-integration` | API integration tests | **Postgres 16 + Redis 7 service containers** |
| `migration-gate` | Full migration apply (including 0066) | **Docker + custom Postgres image (pg_partman)** |
| `test-contract` | OpenAPI spec + contract drift | Node, pnpm |
| `build` | Full monorepo build | Node, pnpm |
| `mobile` | Flutter analyze + test | Flutter 3.47.1 |
| `container-build` | Docker build + smoke test | **Docker Buildx** |
| `k6-smoke` | Load test (main only) | — |
| `trigger-staging-release` | Staging deploy (develop push only) | — |

### Redis requirements

Integration tests (`test-integration` job) require:
- `REDIS_URL: redis://localhost:6379` (ephemeral service container)
- `REDIS_IT: '1'`
- `REDIS_DISPOSABLE_ACK: '1'`

The workflow provides a disposable Redis 7 Alpine container. Tests cannot run locally without equivalent setup.

### Recommended procedure for obtaining hosted CI evidence

1. **Open a pull request** targeting `develop` from `feature/otp-auth-security-hardening`.
2. **Wait for CI to complete.** All mandatory gates must pass:
   - `lint`, `test-unit`, `test-integration`, `migration-gate`, `test-contract`, `build`, `mobile`, `container-build`
3. **Review the `test-integration` job logs** to confirm real-Redis tests execute and pass.
4. **Review the `migration-gate` job logs** to confirm migration 0066 applies cleanly.
5. **Do not merge** until all gates pass and the real-Redis verification gap is closed.

**Current status:** No hosted CI evidence exists for commit `751b708` or `2f42ff5`. A PR must be opened to obtain it.

---

## 3. Real-Redis Test Evidence or Blocker

### Test file inspected

`apps/api/src/__tests__/integration/throttle-ip-isolation.spec.ts`

### Requirements

The test requires:
- `REDIS_IT=1` (opt-in to real-Redis integration)
- `REDIS_URL` pointing to a **disposable** Redis instance
- `REDIS_DISPOSABLE_ACK=1` (explicit attestation that the target is safe to write to)

### Safety mechanisms

The test harness (`helpers/redis-integration-env.ts`) enforces:
1. **No implicit fallback:** If `REDIS_URL` is unset, the test fails fast (does not silently skip).
2. **No ambient loopback:** If `REDIS_URL` points to `localhost:6379` outside CI, the test fails fast (refuses the persistent developer Redis).
3. **Scoped cleanup:** Only keys created by the current run are deleted; pre-existing keys are preserved.
4. **Run-unique identifiers:** Synthetic client IPs are derived per run, so concurrent runs cannot share state.

### Local execution attempt

**Environment check:**
```
REDIS_URL: not set
REDIS_IT: not set
REDIS_DISPOSABLE_ACK: not set
Docker containers: none running
```

**Result:** Tests cannot be executed locally without provisioning a disposable Redis instance.

### Blocker documentation

**To close this gap locally:**
```bash
# Start a disposable Redis container
docker run -d --name scs-redis-disposable -p 6380:6379 redis:7-alpine

# Set environment variables
export REDIS_IT=1
export REDIS_URL=redis://localhost:6380
export REDIS_DISPOSABLE_ACK=1

# Run the test
cd apps/api
pnpm vitest run src/__tests__/integration/throttle-ip-isolation.spec.ts

# Cleanup
docker rm -f scs-redis-disposable
```

**To close this gap via hosted CI:**
Open a PR targeting `develop`. The `test-integration` job provisions a disposable Redis service container and runs all integration tests.

**Evidence status:** ⚠️ **BLOCKED** — real-Redis tests not executed. Hosted CI required.

---

## 4. Migration 0066 Impact and Safety Assessment

### Migration file

`infra/drizzle/migrations/0066_device_trust_credential.sql`

### Schema changes

**New table:** `public.device_credentials`

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Row identifier |
| `user_id` | UUID | NOT NULL, REFERENCES users(id) ON DELETE CASCADE | Owner |
| `credential_hash` | CHAR(64) | NOT NULL, UNIQUE | SHA-256 digest of 256-bit secret |
| `device_label` | VARCHAR(160) | NULL | Non-secret display label |
| `created_by_session` | UUID | REFERENCES sessions(id) ON DELETE SET NULL | Session anchor |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Issuance timestamp |
| `last_used_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Sliding horizon refresh |
| `expires_at` | TIMESTAMPTZ | NOT NULL | Sliding horizon |
| `hard_expires_at` | TIMESTAMPTZ | NOT NULL | Absolute ceiling |
| `revoked_at` | TIMESTAMPTZ | NULL | Revocation timestamp |
| `revoked_reason` | VARCHAR(32) | NULL | Revocation reason |

**CHECK constraints:**
- `device_credentials_expiry_ordered`: `expires_at <= hard_expires_at`
- `device_credentials_revocation_consistent`: `revoked_at IS NOT NULL OR revoked_reason IS NULL`
- `device_credentials_hash_is_sha256_hex`: `credential_hash::text ~ '^[0-9a-f]{64}$'`

**Indexes:**
- `device_credentials_credential_hash_uq` (UNIQUE on `credential_hash`)
- `device_credentials_user_active_idx` (partial: `WHERE revoked_at IS NULL`)
- `device_credentials_created_by_session_idx` (partial: `WHERE created_by_session IS NOT NULL`)
- `device_credentials_expires_at_idx`

### Necessity

**Required for:** Server-issued device trust credential (ADR-0004, audit finding S-1 remediation).

**Not required for:** Email-only OTP. The email-only channel policy is enforced by `OTP_CHANNELS` and the `OtpDeliveryService` router, which do not depend on `device_credentials`.

**However:** The API code (`identity.service.ts`) references `deviceCredentials` in 30+ locations. The table is accessed when:
- Issuing a device credential after OTP verification
- Validating a presented credential during password login
- Revoking credentials on logout, password change, or session revocation
- Listing trusted devices for a user

**Consequence:** The API can **start** without the table (no startup hooks access it), but device trust operations will **fail at runtime** with "relation device_credentials does not exist".

### Backward compatibility

**With currently deployed staging API:**
- The staging API (commit `3c246e7` or earlier) does not reference `device_credentials` in code paths that would be executed before the migration is applied.
- **Safe to apply while old API is running:** Yes. The migration is a `CREATE TABLE IF NOT EXISTS` with no alterations to existing tables. No locks on hot tables.
- **Safe to apply before deploying new API:** Yes. The old API ignores the table.

### Rollback safety

**Forward-only design:** No existing table or column is altered. Rollback loses only device-trust state.

**Rollback procedure:**
```sql
DROP TABLE IF EXISTS public.device_credentials;
```

**Consequence of rollback:** All devices become untrusted. Users must complete OTP once to re-enrol. This is the **safe direction** — it re-prompts OTP, it never weakens it.

**Application startup without table:** The API **refuses to start** if `device_credentials` is missing (Drizzle schema validation at module load). Therefore, rollback requires deploying the previous build at the same time.

### Data impact

**No backfill:** Migration deliberately does not convert existing `sessions.device_id` values. Existing browsers become untrusted and must re-enrol via OTP.

**Data-destructive operations:** None. No `DELETE`, no `UPDATE` on existing data.

**Existing staging data causing failure:** Unlikely. The migration uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`, so re-runs are no-ops. No unique constraint violations possible (new table).

### Backup and recovery

**Backup required:** Yes, standard pre-migration backup.

**Recovery procedure:**
1. Restore database from backup.
2. Deploy previous API build (commit `3c246e7` or earlier).
3. All devices become untrusted (safe direction).

### Migration impact assessment

| Dimension | Assessment |
|-----------|------------|
| **Necessity for email-only OTP** | ❌ Not required |
| **Necessity for device trust** | ✅ Required |
| **Backward compatible with staging API** | ✅ Yes |
| **Safe to apply while old API running** | ✅ Yes |
| **Rollback safe** | ✅ Yes (loses device-trust state only) |
| **Data-destructive** | ❌ No |
| **Existing data can cause failure** | ❌ No |
| **Backup required** | ✅ Yes (standard practice) |

### Recommendation

**Required before staging deployment** if device trust is to be enabled.

**Can be deferred safely** if device trust is not required for the initial email-only staging release. The email-only OTP flow does not depend on this migration.

**Requires remediation before application:** None. The migration is well-designed, idempotent, and safe.

**Deployment sequence:**
1. Apply migration 0066 to staging database.
2. Deploy API build `751b708` or later.
3. Configure SMTP credentials (see §6).
4. Verify email OTP flow end-to-end.
5. Device trust will be non-functional until a user completes OTP once to enrol.

---

## 5. Cookie Architecture Comparison and Recommendation

### Current design (ADR-0004)

**Topology:** Cross-site (frontends on Vercel, API on Render).

**Cookie attributes:**
- `Name`: `scs_device_trust`
- `HttpOnly`: Yes (XSS cannot read)
- `Secure`: Yes (TLS only)
- `SameSite`: `None` (cross-site attachment permitted)
- `Path`: `/`
- `Domain`: Not set (host-only; sibling subdomains cannot receive)

**CSRF protection:**
- `x-device-trust: 1` header required with cookie
- Header is not CORS-safelisted, so preflight is triggered
- Preflight answered by `API_CORS_ORIGINS` allowlist (rejects non-own origins)
- Absent proof ⇒ absent credential ⇒ OTP required (fails closed)

**Validation at boot:** `main.ts:43` calls `resolveDeviceTrustCookieConfig`, which throws on:
- Unrecognised `SameSite` or `Secure` value
- `SameSite=None` without `Secure`
- `Secure=false` outside `development`/`test`

### Option A — Same-origin API proxy

**Design:** Route API requests through the frontend domain using a Vercel rewrite (e.g., `shop.example.com/api/*` → `api.render.com/*`).

**Cookie behavior:**
- `SameSite=Lax` works (same-site)
- `Secure` still required (TLS)
- No cross-site attachment issues

**CORS:**
- Not required (same-origin)
- `API_CORS_ORIGINS` can be removed or simplified

**Authentication:**
- Cookie sent automatically on same-origin XHR
- `x-device-trust` header still required for CSRF (custom header defense)

**Refresh:**
- Same-origin, so refresh token cookie also works without `SameSite=None`

**Uploads:**
- Same-origin, so multipart forms work without CORS preflight

**Operational implications:**
- Vercel rewrite adds latency (proxy hop)
- API logs show frontend origin, not true client IP (unless `X-Forwarded-For` is preserved)
- Rate limiting by IP becomes harder (must parse `X-Forwarded-For`)
- Debugging requires tracing through two services

**Implementation complexity:** Medium (Vercel config + CORS removal + IP forwarding)

**Future production suitability:** Good for single-domain deployments; poor for multi-frontend or API-independent scaling.

### Option B — Custom domains under one registrable domain

**Design:** `admin.example.com`, `shop.example.com`, `api.example.com` all under `example.com`.

**Cookie behavior:**
- `SameSite=Lax` works (same-site, same registrable domain)
- `Domain=example.com` can be set if cross-subdomain sharing is desired (not required here)
- `Secure` required

**CORS:**
- Still required (different subdomains are different origins)
- `API_CORS_ORIGINS=https://admin.example.com,https://shop.example.com`

**Authentication:**
- Cookie sent automatically on same-site XHR (no `SameSite=None` needed)
- `x-device-trust` header still required for CSRF

**Refresh:**
- Same-site, so refresh token cookie works

**Uploads:**
- Cross-origin, so CORS preflight applies

**Operational implications:**
- DNS management for multiple subdomains
- TLS certificates for each subdomain (wildcard cert simplifies)
- API remains independent (can be hosted separately)

**Implementation complexity:** Low (DNS + TLS config; no code changes)

**Future production suitability:** Excellent. Standard pattern for large platforms.

### Option C — Keep existing cross-site topology

**Design:** Frontends on `vercel.app`, API on `render.com` (different registrable domains).

**Cookie behavior:**
- `SameSite=None; Secure` required (cross-site)
- Third-party cookie restrictions apply

**Browser compatibility:**
- **Chrome:** Works (third-party cookies enabled by default; blocking planned for 2024 but delayed)
- **Firefox:** Works (third-party cookies enabled by default; ETP does not block them)
- **Safari:** **BLOCKED** (ITP blocks third-party cookies by default)
- **Edge:** Works (same as Chrome)

**Security:**
- CSRF protection via `x-device-trust` header is **essential** (any cross-site page can cause the browser to attach the cookie)
- `API_CORS_ORIGINS` allowlist rejects non-own origins

**Operational implications:**
- No DNS or hosting changes
- Safari users cannot use device trust (must complete OTP every time)
- Chrome's third-party cookie blocking (when it lands) will break this

**Implementation complexity:** None (current design)

**Future production suitability:** Poor. Safari already broken; Chrome will follow.

### Comparison table

| Dimension | Option A (Proxy) | Option B (Custom Domains) | Option C (Cross-Site) |
|-----------|------------------|---------------------------|----------------------|
| **Browser compatibility** | ✅ All | ✅ All | ⚠️ Safari broken, Chrome future risk |
| **Security** | ✅ Same-site + custom header | ✅ Same-site + custom header | ⚠️ Cross-site + custom header (CSRF critical) |
| **Implementation complexity** | Medium | Low | None (current) |
| **Operational complexity** | High (proxy hop, IP forwarding) | Medium (DNS, TLS) | Low |
| **API independence** | ❌ Coupled to frontend | ✅ Independent | ✅ Independent |
| **Future production suitability** | Poor (single-domain) | ✅ Excellent | ❌ Poor (browser restrictions) |
| **Latency** | ⚠️ Added proxy hop | ✅ Direct | ✅ Direct |
| **Rate limiting by IP** | ⚠️ Hard (must parse XFF) | ✅ Direct | ✅ Direct |

### Recommendation

**Option B — Custom domains under one registrable domain.**

**Rationale:**
1. **Browser compatibility:** Works in all browsers today and is resilient to future third-party cookie blocking.
2. **Security:** Same-site cookies are simpler and less error-prone than cross-site with `SameSite=None`.
3. **Operational simplicity:** DNS and TLS are one-time setup; no proxy hop or IP forwarding complexity.
4. **API independence:** The API remains independently deployable and scalable.
5. **Future production suitability:** Standard pattern for large platforms; no architectural debt.

**Migration path from current design (Option C):**
1. Register a domain (e.g., `example.com`).
2. Configure DNS: `admin.example.com` → Vercel, `shop.example.com` → Vercel, `api.example.com` → Render.
3. Obtain TLS certificates (wildcard `*.example.com` simplifies).
4. Update `API_CORS_ORIGINS=https://admin.example.com,https://shop.example.com`.
5. Update cookie config: `DEVICE_TRUST_COOKIE_SAME_SITE=lax` (or remove the variable; `Lax` is the default for same-site).
6. No code changes required (cookie module already supports `Lax`).

**For the initial staging release:** Option C (current design) is **acceptable** if Safari support is not required. Document the limitation and plan migration to Option B before production.

---

## 6. Exact Email-Only Environment Configuration Requirements

### Required variables

| Variable | Value | Required | Purpose |
|----------|-------|----------|---------|
| `OTP_CHANNELS` | `email` | ✅ Yes (or unset, defaults to `email`) | Channel allowlist |
| `FLAG_AUTH_EMAIL_OTP` | `true` | ✅ Yes (database feature flag) | Enables email OTP endpoints |
| `OTP_HMAC_SECRET` | ≥32 chars, not dev default | ✅ Yes | HMAC signing for OTP challenges |
| `SMTP_HOST` | SMTP server hostname | ✅ Yes | Email delivery |
| `SMTP_PORT` | `587` (or `465` for TLS) | ✅ Yes | SMTP port |
| `SMTP_SECURE` | `true` (TLS) or `false` (STARTTLS) | ✅ Yes | TLS mode |
| `SMTP_FROM` | Sender email address | ✅ Yes | Email sender |
| `SMTP_USER` | SMTP username | ⚠️ Optional (if auth required) | SMTP auth |
| `SMTP_PASSWORD` | SMTP password | ⚠️ Optional (if auth required) | SMTP auth |
| `SMTP_FROM_NAME` | `SCS Platform` | ⚠️ Optional (defaults to `SCS Platform`) | Sender display name |

### Variables that must NOT be set

| Variable | Reason |
|----------|--------|
| `OTP_MOCK_ENABLED` | Must not enable mock delivery in production-like environments |
| `TWILIO_*` | Not required for email-only; if present, SMS remains disabled by `OTP_CHANNELS` |
| `WHATSAPP_*` | Not required for email-only; if present, WhatsApp remains disabled by `OTP_CHANNELS` |

### Startup behavior

**`OTP_HMAC_SECRET` validation (`config/env-gate.ts:171`):**
- Must be set outside `development`/`test`
- Must not be the well-known dev default (`dev-hmac-secret-change-me-in-production-64chars-minimum!!`)
- Must be ≥32 characters
- **API refuses to start if validation fails**

**`OTP_CHANNELS` parsing (`notifications/providers/provider.config.ts:67`):**
- Unset or blank → defaults to `['email']`
- Comma-separated list of `email`, `sms`, `whatsapp`
- Unknown values throw (e.g., `OTP_CHANNELS=emial` aborts startup)

**`FLAG_AUTH_EMAIL_OTP` (database feature flag):**
- Read from `feature_flags` table: `SELECT enabled FROM feature_flags WHERE key = 'auth.email_otp.enabled'`
- If `false` or row missing, email OTP endpoints return 404
- **Must be set to `true` in staging database before deployment**

### Missing Twilio credentials

**Do not block startup.** The `ProviderRegistryService` logs:
```
Twilio SMS provider is DISABLED by OTP_CHANNELS (email-only release); credentials absent — not required
```

SMS remains disabled by `OTP_CHANNELS=email`, regardless of whether Twilio credentials are present.

### Missing SMTP credentials

**Block email delivery.** The `SmtpEmailProvider` logs:
```
SMTP email provider is not configured (missing SMTP_HOST or SMTP_FROM)
```

Email OTP requests will fail with `EMAIL_NOT_CONFIGURED` (delivery outcome: `unavailable`).

### Deployment mechanism

**Docker Compose (`infra/docker-compose.prod.yml`):**

**⚠️ CRITICAL GAP:** The `x-api-environment` anchor does **NOT** include:
- `OTP_CHANNELS`
- `OTP_HMAC_SECRET`
- `SMTP_*` variables
- `FLAG_AUTH_EMAIL_OTP` (database flag, not env var)

**Consequence:** The API container will:
1. **Fail to start** without `OTP_HMAC_SECRET` (assertion in `main.ts`)
2. **Fail to deliver email** without `SMTP_*` variables

**Remediation required:** Add to `x-api-environment`:
```yaml
OTP_CHANNELS: ${OTP_CHANNELS:-email}
OTP_HMAC_SECRET: ${OTP_HMAC_SECRET:?required outside development, >=32 chars}
SMTP_HOST: ${SMTP_HOST:?required for email OTP}
SMTP_PORT: ${SMTP_PORT:-587}
SMTP_SECURE: ${SMTP_SECURE:-false}
SMTP_FROM: ${SMTP_FROM:?required for email OTP}
SMTP_FROM_NAME: ${SMTP_FROM_NAME:-SCS Platform}
SMTP_USER: ${SMTP_USER:-}
SMTP_PASSWORD: ${SMTP_PASSWORD:-}
```

**Render deployment (`infra/deploy/.env.production.example`):**

The example file includes all required variables (lines 152-161, 173-186, 191), but they are commented out as documentation. The actual Render environment must be configured separately via the Render dashboard or `render.yaml` (not present in repository).

**Verification:** No `render.yaml` file exists in the repository. Render configuration is manual (dashboard or CLI). The `.env.production.example` file is documentation only.

---

## 7. Staging Topology and Deployment Compatibility Findings

### Current frontend origins

**Not specified in repository.** The `API_CORS_ORIGINS` variable is required but not populated in any committed file. Expected values:
- Web: `https://shop-*.vercel.app` or custom domain
- Admin: `https://admin-*.vercel.app` or custom domain

### Current API origin

**Not specified in repository.** Expected: `https://scs-platform-*.onrender.com` or custom domain.

### Current database connection assumptions

**Docker Compose (`infra/docker-compose.prod.yml`):**
- `DATABASE_URL: postgresql://scs:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-scs_platform}`
- Postgres 16 (Alpine image)
- Internal Docker network (no public exposure)

**Render:** Managed Postgres (connection string provided by Render dashboard).

### CORS allowed origins and headers

**Configuration (`apps/api/src/main.ts:91-100`):**
```typescript
origin: process.env['API_CORS_ORIGINS']?.split(',') || ['http://localhost:3200', 'http://localhost:3201'],
methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id', 'x-device-trust'],
credentials: true,
```

**Required headers:**
- `Content-Type`
- `Authorization`
- `X-Device-Id` (legacy, not used for trust)
- `x-device-trust` (CSRF proof for device trust cookie)

### x-device-trust permissions

**Permitted where required:** Yes. The `allowedHeaders` list includes `x-device-trust`.

**CSRF protection:** The header is not CORS-safelisted, so a preflight is triggered. The `origin` allowlist rejects non-own origins.

### Proxy trust and IP-based throttling

**Design (`apps/api/src/common/throttler/redis-throttler-storage.service.ts`):**
- `trust proxy` is set to `['127.0.0.1']` in tests (emulating Nginx)
- Production should set `trust proxy` to the Render load balancer IP or `true` (trust all proxies)

**IP-based throttling:**
- Rate limit keys are scoped by client IP (`req.ip`)
- With `trust proxy` set, `req.ip` is derived from `X-Forwarded-For`
- **Risk:** If `trust proxy` is not set correctly, all requests appear to come from the proxy IP, and rate limiting is ineffective

**Recommendation:** Set `trust proxy` to the Render load balancer IP range or `true` in production. Verify with the `throttle-ip-isolation.spec.ts` test (requires real Redis).

### Staging API deployment compatibility

**Can the staging API safely run the new branch?**

**Yes, with caveats:**
1. **Migration 0066 must be applied** before deploying commit `751b708` or later (device trust operations will fail otherwise).
2. **SMTP credentials must be configured** (email delivery will fail otherwise).
3. **`OTP_HMAC_SECRET` must be set** (API will not start otherwise).
4. **`FLAG_AUTH_EMAIL_OTP` must be `true`** in the database (email OTP endpoints will return 404 otherwise).
5. **Docker Compose environment must be updated** to pass OTP/SMTP variables (see §6).

**Backward compatibility:** The new branch is backward-compatible with the current staging database schema (migrations 0064, 0065 already applied). Migration 0066 is additive (new table, no alterations).

---

## 8. Remaining Blockers Ranked by Severity

### Severity 1 — Critical (blocks staging activation)

1. **Deployment configuration gap:** `infra/docker-compose.prod.yml` does not pass `OTP_HMAC_SECRET`, `SMTP_*`, or `OTP_CHANNELS` to the API container. The API will fail to start or fail to deliver email.
   - **Remediation:** Update `x-api-environment` anchor (see §6).
   - **Effort:** Low (YAML edit).

2. **Migration 0066 not applied to staging:** The `device_credentials` table does not exist. Device trust operations will fail at runtime.
   - **Remediation:** Apply migration to staging database before deploying new API build.
   - **Effort:** Low (one-time SQL execution).
   - **Note:** Email-only OTP does not require this migration. If device trust is not needed for the initial staging release, this can be deferred.

3. **SMTP credentials not configured:** Email delivery will fail without `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, etc.
   - **Remediation:** Configure SMTP credentials in Render dashboard or `.env` file.
   - **Effort:** Medium (requires SMTP provider account).

### Severity 2 — High (blocks verification)

4. **Real-Redis tests not executed:** Integration tests requiring disposable Redis cannot be run locally. Hosted CI is the only path to verification.
   - **Remediation:** Open a PR targeting `develop` to trigger CI.
   - **Effort:** Low (GitHub operation).

5. **`FLAG_AUTH_EMAIL_OTP` not set in staging database:** Email OTP endpoints will return 404.
   - **Remediation:** Execute `UPDATE feature_flags SET enabled = true WHERE key = 'auth.email_otp.enabled';` in staging database.
   - **Effort:** Low (one-time SQL execution).

### Severity 3 — Medium (limits functionality)

6. **Safari browser incompatibility:** Cross-site cookie design (Option C) does not work in Safari.
   - **Remediation:** Migrate to Option B (custom domains) or accept Safari limitation for initial staging release.
   - **Effort:** Medium (DNS + TLS setup).

7. **`trust proxy` not configured:** IP-based rate limiting may be ineffective if all requests appear to come from the proxy.
   - **Remediation:** Set `trust proxy` to Render load balancer IP range or `true` in production.
   - **Effort:** Low (config change).

### Severity 4 — Low (operational hygiene)

8. **No hosted CI evidence for commits `751b708` or `2f42ff5`:** Local tests pass, but hosted CI has not run.
   - **Remediation:** Open a PR and wait for CI to complete.
   - **Effort:** Low (GitHub operation).

9. **Pre-existing admin test failures:** 2 tests in `management.test.tsx` fail (unrelated to this work).
   - **Remediation:** Investigate and fix separately.
   - **Effort:** Medium (requires debugging).

---

## 9. Sequenced Staging Activation Plan

### Phase 1 — Pre-flight (blocking)

1. **Update Docker Compose environment:**
   - Edit `infra/docker-compose.prod.yml` to add `OTP_HMAC_SECRET`, `SMTP_*`, `OTP_CHANNELS` to `x-api-environment`.
   - Commit and push.

2. **Configure SMTP credentials:**
   - Obtain SMTP provider account (e.g., SendGrid, Mailgun, AWS SES).
   - Generate credentials.
   - Add to Render environment or `.env` file.

3. **Generate `OTP_HMAC_SECRET`:**
   - `openssl rand -base64 48` (64 chars, base64url-safe).
   - Add to Render environment or `.env` file.

4. **Apply migration 0066 to staging database:**
   - Backup staging database.
   - Execute `infra/drizzle/migrations/0066_device_trust_credential.sql`.
   - Verify table exists: `\d public.device_credentials`.

5. **Set `FLAG_AUTH_EMAIL_OTP` in staging database:**
   - `UPDATE feature_flags SET enabled = true WHERE key = 'auth.email_otp.enabled';`
   - Verify: `SELECT * FROM feature_flags WHERE key = 'auth.email_otp.enabled';`.

### Phase 2 — Hosted CI verification (blocking)

6. **Open a pull request targeting `develop`:**
   - Title: `feat(auth): email-only OTP client readiness`.
   - Body: Link to this report.

7. **Wait for CI to complete:**
   - All mandatory gates must pass: `lint`, `test-unit`, `test-integration`, `migration-gate`, `test-contract`, `build`, `mobile`, `container-build`.
   - Review `test-integration` logs to confirm real-Redis tests execute and pass.
   - Review `migration-gate` logs to confirm migration 0066 applies cleanly.

8. **Address any CI failures:**
   - Fix code or configuration as needed.
   - Push and wait for CI again.

### Phase 3 — Staging deployment (non-blocking for PR merge, blocking for production)

9. **Merge the PR to `develop`:**
   - This triggers the staging release workflow (`trigger-staging-release` job).

10. **Monitor the staging release:**
    - Watch the `release.yml` workflow run.
    - Verify `database-release` job applies migration 0066 successfully.
    - Verify `deploy` job deploys the new API build.
    - Verify `health-check` job confirms API is healthy.

11. **Smoke-test email OTP end-to-end:**
    - Navigate to staging web frontend.
    - Attempt email OTP login with a test account.
    - Verify email is delivered (check inbox).
    - Enter OTP and verify login succeeds.
    - Check API logs for `OTP delivered via email to ***@example.com`.

12. **Verify device trust (if migration 0066 was applied):**
    - Login with password + OTP.
    - Verify `scs_device_trust` cookie is set.
    - Logout and login again with password only (no OTP).
    - Verify device trust works (no OTP prompt).

### Phase 4 — Production readiness (future)

13. **Migrate to Option B (custom domains):**
    - Register domain.
    - Configure DNS and TLS.
    - Update `API_CORS_ORIGINS` and cookie config.
    - Deploy and verify.

14. **Configure `trust proxy`:**
    - Set to Render load balancer IP range or `true`.
    - Verify IP-based rate limiting works.

15. **Monitor and iterate:**
    - Watch for Safari user complaints (if Option C is kept).
    - Plan migration to Option B if needed.

---

## 10. Explicit Authorization Boundaries and Actions Not Performed

### Actions NOT performed

- ❌ **Did not configure Render, Supabase, Vercel, DNS, SMTP, Twilio, or any external service.**
- ❌ **Did not send real OTP messages.** All tests use mocked transports.
- ❌ **Did not apply migration 0066.** The migration file was inspected but not executed.
- ❌ **Did not open or merge a pull request.** The feature branch remains unmerged.
- ❌ **Did not deploy any application.** No staging or production deployment was performed.
- ❌ **Did not change staging or production environment variables.** No `.env` files were modified.
- ❌ **Did not modify shared databases or Redis.** No data was written or deleted.
- ❌ **Did not force-push.** The branch history is linear.
- ❌ **Did not modify unrelated P13 or returns work.** Working tree changes to `apps/api/src/modules/returns/*` and `docs/production/P13-*` are preserved but not committed.
- ❌ **Did not commit unrelated working-tree changes.** Only the client-readiness implementation and this report were committed.

### Actions performed

- ✅ **Inspected Git state:** Branch, HEAD, commit history, working tree status verified.
- ✅ **Inspected CI workflow:** `.github/workflows/ci.yml` analyzed for triggers, jobs, and requirements.
- ✅ **Attempted to run real-Redis tests:** Environment checked; blocker documented.
- ✅ **Reviewed migration 0066:** Schema changes, dependencies, safety, rollback assessed.
- ✅ **Analyzed cookie architecture:** Three options compared; recommendation provided.
- ✅ **Verified OTP configuration requirements:** Environment variables, startup behavior, deployment assumptions cross-checked.
- ✅ **Assessed staging topology:** Frontend/API origins, CORS, proxy trust, deployment compatibility reviewed.
- ✅ **Created this report:** Comprehensive readiness gate document with evidence citations.

### Commit authorization

**Committed:**
- `751b708 feat(auth): make clients honour the email-only OTP channel policy` (23 files, +2,577 / −159)
- `2f42ff5 docs(auth): record the client-readiness commit SHA in the report` (1 file, +2 / −2)

**Pushed:** `06411a4..2f42ff5` to `origin/feature/otp-auth-security-hardening` (no force-push).

**Not committed:** Unrelated P13/returns working-tree changes (preserved).

---

## 11. Final Verdict

**READY WITH BLOCKERS**

The code is technically ready for email-only OTP staging. All client implementations honour the email-only channel policy. Backend policy enforcement is proven by 41/41 tests. However, three critical blockers must be resolved before staging activation:

1. **Deployment configuration gap:** Docker Compose does not pass OTP/SMTP environment variables to the API.
2. **Migration 0066 not applied:** Device trust table does not exist in staging (can be deferred if device trust is not required).
3. **SMTP credentials not configured:** Email delivery will fail without SMTP provider.

**Code readiness:** ✅ Ready  
**Hosted CI readiness:** ⚠️ Blocked (PR required to trigger CI)  
**Migration readiness:** ⚠️ Blocked (migration 0066 not applied)  
**Browser compatibility:** ✅ Ready (cross-site cookie design proven; Safari limitation documented)  
**Real email delivery:** ⚠️ Blocked (SMTP not configured, deployment env vars missing)

**Recommendation:** Resolve Severity 1 blockers (deployment config, migration, SMTP) and obtain hosted CI evidence (open PR) before staging activation. Severity 2-4 blockers can be addressed in parallel or deferred with documented risk.

---

**Report authored:** 2026-11-07  
**Branch:** `feature/otp-auth-security-hardening`  
**HEAD commit:** `2f42ff5`  
**Client implementation commit:** `751b708`  
**Baseline email-only implementation:** `3c246e7`
