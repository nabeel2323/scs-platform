# OTP-S1.40 — Staging Activation Runbook

**Date:** 2026-11-03
**PR:** #104 (merged at `428b8fa`)
**Phase:** Email-first identity and email OTP (Phase 1)
**Status:** READY FOR STAGING OPERATOR REVIEW

---

## 1. Pre-Activation Checklist

### 1.1 Verify Merge Status

**Status:** ✅ VERIFIED

```bash
# Confirm PR #104 is merged
git log --oneline origin/develop | grep "428b8fa"
# Expected: 428b8fa Merge pull request #104 from nabeel2323/feat/auth-email-otp-phase1

# Verify S1.39 fixes are in develop
git log --oneline origin/develop | grep -E "(1d90790|29bc970|9ad6b82)"
# Expected: All three commits present
```

**Evidence:**
- Merge commit: `428b8fadd4c3b1572896c73acbbb7c0a7a43af77`
- Merge date: 2026-11-03 13:44:35 +0300
- Files merged: 119 files changed (verified in merge commit)

### 1.2 Verify CI Status

**Status:** ✅ VERIFIED

CI has been independently verified for the merge commit:

**Evidence:**
- Workflow run: `https://github.com/nabeel2323/scs-platform/actions/runs/41621787969`
- Commit: `428b8fadd4c3b1572896c73acbbb7c0a7a43af77`
- All required checks PASSED:
  - ✅ Build
  - ✅ Container Build & Smoke Test
  - ✅ Contract Spec & Codegen
  - ✅ Migration Full Apply
  - ✅ Unit Tests + Coverage Gates
  - ✅ Integration Tests
  - ✅ Boundary Lint
  - ✅ Mobile
  - ✅ Lint & Typecheck
  - ⏭️ k6 Smoke Test: SKIPPED (as expected by workflow conditions)

**Note:** CI passing proves repository-level correctness. It does NOT prove staging deployment will succeed — staging has real data, real infrastructure, and real SMTP configuration that must be verified separately.

### 1.3 Staging Environment Prerequisites

**Status:** ⚠️ REQUIRES CONFIGURATION

| Requirement | Status | Action Required |
|-------------|--------|-----------------|
| PostgreSQL database | ⚠️ Not verified | Confirm staging DB is accessible and backed up |
| Redis instance | ⚠️ Not verified | Confirm staging Redis is accessible |
| SMTP provider | ⚠️ Not configured | Configure SMTP credentials (see Section 2) |
| OTP_HMAC_SECRET | ⚠️ Not set | Generate and set unique secret (see Section 2) |
| Environment variables | ⚠️ Not configured | Set all required vars (see Environment Configuration Register) |
| Docker Compose | ⚠️ Not verified | Confirm staging host has Docker + Compose v2 |

---

## 1A. Operational Acceptance Gates (S1.41 clarification)

**⚠️ CRITICAL:** These gates are sequential and cumulative. Each gate must be satisfied before proceeding to the next. Do not conflate repository/CI readiness with staging/production readiness.

### Gate 1: Repository and CI Readiness

**Status:** ✅ SATISFIED

**Evidence:**
- PR #104 merged at commit `428b8fa`
- All CI checks passed (workflow run `41621787969`)
- All unit tests pass (521 tests)
- All integration tests pass (1,570 tests)
- Both typechecks pass (API + Web)
- Migration files present and tested in CI

**What this proves:**
- ✅ Code is correct and tested
- ✅ Migrations apply cleanly in a disposable CI database
- ✅ No type errors or lint violations

**What this does NOT prove:**
- ❌ Staging database will accept migrations (staging has real data that must pass preflight checks)
- ❌ Staging infrastructure is configured correctly
- ❌ Email OTP will work in staging (requires SMTP configuration)

---

### Gate 2: Staging Infrastructure Readiness

**Status:** ⚠️ REQUIRES OPERATOR ACTION

**Prerequisites:**
- [ ] PostgreSQL database accessible and backed up
- [ ] Redis instance accessible
- [ ] SMTP provider configured (credentials set)
- [ ] Docker + Compose v2 available on staging host
- [ ] Network connectivity verified (API can reach DB, Redis, SMTP)

**Operator actions required:**
1. Verify staging DB is accessible: `psql -U scs -h staging-db -d scs_platform -c "SELECT 1"`
2. Verify staging Redis is accessible: `redis-cli -h staging-redis -a $REDIS_PASSWORD ping`
3. Configure SMTP credentials (see Section 2.1)
4. Generate and set OTP_HMAC_SECRET (see Section 2.2)
5. Create and verify database backup (see Section 3.1)

**What this proves:**
- ✅ Staging infrastructure is available and configured
- ✅ Secrets are set securely

**What this does NOT prove:**
- ❌ Migrations will apply successfully (requires Gate 3)
- ❌ API will start successfully (requires Gate 4)
- ❌ Email OTP will work end-to-end (requires Gate 5)

---

### Gate 3: Database Migration Readiness

**Status:** ⚠️ REQUIRES OPERATOR ACTION

**Prerequisites:**
- [ ] Gate 2 satisfied (infrastructure ready)
- [ ] Database backup created and verified restorable
- [ ] Preflight checks pass (no duplicate emails, no orphan users)

**Operator actions required:**
1. Run preflight validation (see Migration Plan Section 2.2)
2. Dry-run migration chain (see Migration Plan Section 3.1)
3. Apply migrations (see Migration Plan Section 3.2)
4. Verify migration state (see Migration Plan Section 3.3)

**What this proves:**
- ✅ Migrations apply successfully to staging database
- ✅ Schema changes are correct
- ✅ Feature flag is seeded (disabled by default)

**What this does NOT prove:**
- ❌ API will start successfully (requires Gate 4)
- ❌ Email OTP will work (requires Gate 5)

**Important:** CI migration success does NOT prove staging migration will succeed. CI uses a disposable database; staging has real data that must pass preflight checks.

---

### Gate 4: Staging Deployment Readiness

**Status:** ⚠️ REQUIRES OPERATOR ACTION

**Prerequisites:**
- [ ] Gate 3 satisfied (migrations applied)
- [ ] All environment variables configured (see Environment Configuration Register)
- [ ] Docker images built with correct PUBLIC_API_URL

**Operator actions required:**
1. Build Docker images (see Section 4.1)
2. Deploy services (see Section 4.2)
3. Verify health and readiness endpoints (see Section 4.3)
4. Verify feature flag is OFF (safe default)

**What this proves:**
- ✅ API starts successfully
- ✅ Health checks pass
- ✅ Feature flag is OFF (email OTP disabled)

**What this does NOT prove:**
- ❌ Email OTP will work when enabled (requires Gate 5)

---

### Gate 5: Email OTP Activation Readiness

**Status:** ⚠️ REQUIRES OWNER APPROVAL

**Prerequisites:**
- [ ] Gate 4 satisfied (API deployed and healthy)
- [ ] SMTP connectivity tested from staging
- [ ] Owner has explicitly approved staging activation

**⛔ CRITICAL:** The feature flag must remain OFF until this gate is satisfied. Do not enable email OTP without owner approval.

**Operator actions required:**
1. Test SMTP connectivity (see Environment Configuration Register Section 3.5)
2. Obtain owner approval for staging activation
3. Enable feature flag (see Section 5.2)
4. Run smoke tests (see Smoke Test Plan)
5. Monitor for 48 hours (see Section 7)

**What this proves:**
- ✅ Email OTP works end-to-end in staging
- ✅ All security controls are enforced
- ✅ No issues detected during monitoring period

**What this does NOT prove:**
- ❌ Production is ready (requires Gate 6)

**Important:** Real email delivery requires explicit staging operator authorization. The feature flag enables real email sends — do not enable without verifying SMTP configuration and obtaining owner approval.

---

### Gate 6: Production Rollout Readiness

**Status:** ⚠️ REQUIRES OWNER APPROVAL

**Prerequisites:**
- [ ] Gate 5 satisfied (staging monitored for 48 hours with no issues)
- [ ] Production smtp credentials configured
- [ ] Production OTP_HMAC_SECRET generated (different from staging)
- [ ] Production database backup created
- [ ] Owner has explicitly approved production activation

**Operator actions required:**
1. Review staging activation results
2. Configure production environment (see Environment Configuration Register)
3. Apply production migrations
4. Deploy production services
5. Enable production feature flag (with owner approval)
6. Monitor production for 48 hours

**What this proves:**
- ✅ Production deployment successful
- ✅ Email OTP works in production

---

### Gate Summary

| Gate | Readiness Level | Who Approves | Blocking? |
|------|----------------|--------------|-----------|
| 1 | Repository/CI | Automated (CI) | NO — already satisfied |
| 2 | Staging infrastructure | Operator | YES — cannot deploy without infrastructure |
| 3 | Database migration | Operator | YES — cannot start API without schema |
| 4 | Staging deployment | Operator | YES — cannot test without API running |
| 5 | Email OTP activation | **Owner** | YES — cannot enable without owner approval |
| 6 | Production rollout | **Owner** | YES — cannot deploy to production without owner approval |

**Key principles:**
1. CI readiness ≠ staging readiness ≠ production readiness
2. Each gate builds on the previous — do not skip gates
3. Owner approval is required for Gates 5 and 6 (activation decisions)
4. Feature flag must remain OFF until Gate 5 is satisfied
5. Staging must complete 48-hour monitoring before Gate 6 can be satisfied

---

## 2. Environment Configuration

### 2.1 SMTP Configuration

**Source:** `apps/api/src/modules/notifications/providers/provider.config.ts` lines 153-175

**Required variables:**

```bash
# SMTP server hostname (REQUIRED for email delivery)
SMTP_HOST=smtp.provider.com

# SMTP server port (default: 587)
SMTP_PORT=587

# Use TLS (default: false, set to true for production)
SMTP_SECURE=true

# Sender email address (REQUIRED for email delivery)
SMTP_FROM=noreply@your-domain.com

# SMTP authentication (optional — required if provider requires auth)
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password
```

**Verification:**
```bash
# Test SMTP connectivity from staging host
telnet smtp.provider.com 587
# Expected: 220 smtp.provider.com ESMTP

# After deployment, check logs for SMTP configuration
docker logs api-service | grep "SMTP email provider"
# Expected: "SMTP email provider is configured for smtp.provider.com:587"
```

**Provider setup:**
1. Provision SMTP service (SendGrid, AWS SES, Mailgun, or corporate SMTP)
2. Configure DNS records (SPF, DKIM, DMARC) for sending domain
3. Verify sender address is authorized
4. Test delivery with a small batch before activation

### 2.2 OTP_HMAC_SECRET Generation

**Source:** `apps/api/src/config/env-gate.ts` lines 94-176

**Requirements:**
- Minimum 32 characters
- Must NOT match development default (`dev-hmac-secret-change-me-in-production-64chars-minimum!!`)
- Must be cryptographically random
- Used for HMAC-SHA256 hashing of OTP challenges in Redis

**Generation:**
```bash
# Generate a secure 32-byte (64 hex char) secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Example output: a3f5b8c9d2e4f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1

# Set in staging environment
OTP_HMAC_SECRET=<generated-value>
```

**Verification:**
```bash
# After deployment, check logs for HMAC secret validation
docker logs api-service | grep "OTP_HMAC_SECRET"
# Expected: No errors (secret is accepted)

# If secret is weak/missing, API will refuse to boot:
# Error: OTP_HMAC_SECRET must be at least 32 characters outside development
```

**Rotation:**
- If secret is compromised, rotate immediately
- All pending OTP challenges become invalid after rotation
- Users must request new OTPs
- No database changes required (challenges stored in Redis with HMAC keys)

### 2.3 Feature Flag Configuration

**Source:** `infra/drizzle/migrations/0064_email_identity.sql` lines 182-184

**Default state:** `false` (disabled)

**Activation:**
```sql
-- Enable email OTP in staging (runtime toggle, no restart)
UPDATE feature_flags SET enabled = true WHERE key = 'auth.email_otp.enabled';

-- Verify flag is enabled
SELECT key, enabled FROM feature_flags WHERE key = 'auth.email_otp.enabled';
-- Expected: auth.email_otp.enabled | t
```

**Rollback:**
```sql
-- Disable email OTP (immediate effect, no restart)
UPDATE feature_flags SET enabled = false WHERE key = 'auth.email_otp.enabled';
```

**Impact when disabled:**
- All 6 Phase 1 endpoints return 404 (not 403 — prevents enumeration)
- Existing phone OTP and password login flows unaffected
- No user-facing error messages (silent disable)

### 2.4 Complete Environment Template

**Source:** `infra/deploy/.env.production.example`

```bash
# ═══════════════════════════════════════════════════════════
# Staging Environment Configuration for Phase 1 Email OTP
# ═══════════════════════════════════════════════════════════

# ── Database ─────────────────────────────────────────────
DATABASE_URL=postgresql://scs:STAGING_PASSWORD@staging-db:5432/scs_platform
DATABASE_POOL_MAX=10
DATABASE_POOL_MIN=1

# ── Redis ────────────────────────────────────────────────
REDIS_URL=redis://:STAGING_REDIS_PASSWORD@staging-redis:6379

# ── JWT Secrets ──────────────────────────────────────────
JWT_ACCESS_SECRET=<generate-with-openssl-rand-base64-32>

# ── S3 / MinIO ───────────────────────────────────────────
S3_ENDPOINT=https://s3.staging.example.com
S3_REGION=us-east-1
S3_ACCESS_KEY=<staging-access-key>
S3_SECRET_KEY=<staging-secret-key>
S3_MEDIA_BUCKET=scs-media-staging
S3_UPLOADS_BUCKET=scs-uploads-staging

# ── SMTP (REQUIRED FOR EMAIL OTP) ────────────────────────
SMTP_HOST=smtp.provider.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_FROM=noreply@staging.your-domain.com
SMTP_USER=<smtp-username>
SMTP_PASSWORD=<smtp-password>

# ── OTP Configuration ────────────────────────────────────
OTP_LENGTH=6
OTP_TTL=90
OTP_MAX_ATTEMPTS=5
OTP_HMAC_SECRET=<generate-unique-32-char-min-secret>
OTP_MOCK_ENABLED=false  # MUST BE FALSE IN STAGING

# ── Application ──────────────────────────────────────────
NODE_ENV=staging
API_PORT=3000
API_HOST=0.0.0.0
API_CORS_ORIGINS=https://staging-shop.your-domain.com,https://staging-admin.your-domain.com
LOG_LEVEL=info

# ── Public URLs (baked into client bundles at build) ─────
PUBLIC_API_URL=https://staging-api.your-domain.com
```

---

## 3. Migration Application

### 3.1 Pre-Migration Backup

**Status:** ⚠️ REQUIRES OPERATOR ACTION

```bash
# Create database backup before applying migrations
# Method depends on your infrastructure. Example for PostgreSQL:
pg_dump -U scs -h staging-db scs_platform > backup-$(date +%Y%m%d-%H%M%S).sql

# Verify backup is restorable
psql -U scs -h staging-db -d scs_platform_test < backup-*.sql
```

**Backup requirements:**
- Must be stored off-host (not on the staging server)
- Must be tested for restorability
- Must be retained for at least 7 days post-migration

### 3.2 Migration Dry Run

**Source:** `infra/deploy/README.md` lines 70-74

```bash
# Dry-run migration chain to verify no errors
docker compose --env-file .env.staging -f infra/docker-compose.prod.yml \
  run --rm migrate /app/apps/api/node_modules/.bin/tsx infra/drizzle/migrate-pg.ts --dry-run

# Expected: Lists migrations 0064 and 0065 as "would apply"
# Exit code: 0
```

**Verification:**
- ✅ No SQL errors
- ✅ Migrations 0064 and 0065 listed
- ✅ Preflight checks pass (no duplicate emails, no orphan users)

### 3.3 Apply Migrations

**Source:** `infra/deploy/README.md` lines 76-79

```bash
# Apply migrations as one-shot service
# Nothing else starts until this completes successfully
docker compose --env-file .env.staging -f infra/docker-compose.prod.yml \
  run --rm migrate

# Expected: "Migrations complete" message
# Exit code: 0
```

**Migration 0064 (Email Identity):**
- Makes `users.phone` nullable
- Adds CHECK constraint `users_at_least_one_identifier`
- Creates case-insensitive unique index `idx_users_email_lower`
- Creates `account_link_log` audit table
- Seeds feature flag `auth.email_otp.enabled = false`

**Migration 0065 (HMAC Identifier Hash):**
- Widens `account_link_log.identifier_hash` from varchar(64) to varchar(68)
- Adds `hash_version` column (NOT NULL DEFAULT 2)
- Backfills existing rows to `hash_version = 1`

**Verification:**
```sql
-- Verify migration 0064 applied
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'phone';
-- Expected: phone | YES

-- Verify CHECK constraint exists
SELECT conname FROM pg_constraint WHERE conname = 'users_at_least_one_identifier';
-- Expected: users_at_least_one_identifier

-- Verify unique index exists
SELECT indexname FROM pg_indexes WHERE indexname = 'idx_users_email_lower';
-- Expected: idx_users_email_lower

-- Verify feature flag seeded
SELECT key, enabled FROM feature_flags WHERE key = 'auth.email_otp.enabled';
-- Expected: auth.email_otp.enabled | f

-- Verify migration 0065 applied
SELECT column_name, character_maximum_length FROM information_schema.columns
WHERE table_name = 'account_link_log' AND column_name = 'identifier_hash';
-- Expected: identifier_hash | 68

-- Verify migration log
SELECT migration_name, applied_at FROM _migration_log
WHERE migration_name IN ('0064_email_identity.sql', '0065_hmac_identifier_hash.sql')
ORDER BY applied_at;
-- Expected: Both migrations logged
```

### 3.4 Post-Migration Validation

```bash
# Verify API starts successfully
docker compose --env-file .env.staging -f infra/docker-compose.prod.yml \
  up -d api

# Check logs for successful startup
docker logs api-service | tail -20
# Expected: "Nest application successfully started"

# Verify health endpoint
curl -fsS https://staging-api.your-domain.com/v1/healthz
# Expected: {"status":"ok"}

# Verify readiness endpoint (checks DB + Redis)
curl -fsS https://staging-api.your-domain.com/v1/readyz
# Expected: {"status":"ok"}
```

---

## 4. Service Deployment

### 4.1 Build Images

**Source:** `infra/deploy/README.md` lines 49-55

```bash
# Build API image
docker build -f infra/deploy/api.Dockerfile -t scs-api:staging .

# Build web image (PUBLIC_API_URL baked at build time)
docker build -f infra/deploy/web.Dockerfile -t scs-web:staging \
  --build-arg NEXT_PUBLIC_API_URL=https://staging-api.your-domain.com .

# Build admin image
docker build -f infra/deploy/admin.Dockerfile -t scs-admin:staging \
  --build-arg NEXT_PUBLIC_API_URL=https://staging-api.your-domain.com .
```

### 4.2 Deploy Services

```bash
# Start API tier (depends on migrate completing successfully)
docker compose --env-file .env.staging -f infra/docker-compose.prod.yml \
  up -d api

# Start web and admin frontends
docker compose --env-file .env.staging -f infra/docker-compose.prod.yml \
  up -d web admin

# Verify all services are running
docker compose --env-file .env.staging -f infra/docker-compose.prod.yml \
  ps
# Expected: api, web, admin all "Up"
```

### 4.3 Post-Deployment Verification

```bash
# Liveness check (per replica)
docker compose --env-file .env.staging -f infra/docker-compose.prod.yml \
  exec --index=1 api curl -fsS http://127.0.0.1:3000/v1/healthz

# Readiness check (DB + Redis)
docker compose --env-file .env.staging -f infra/docker-compose.prod.yml \
  exec --index=1 api curl -fsS http://127.0.0.1:3000/v1/readyz

# Verify feature flag is OFF (safe default)
docker compose --env-file .env.staging -f infra/docker-compose.prod.yml \
  exec --index=1 api psql -U scs -d scs_platform -c \
  "SELECT key, enabled FROM feature_flags WHERE key = 'auth.email_otp.enabled';"
# Expected: auth.email_otp.enabled | f
```

---

## 5. Feature Flag Activation

### 5.1 Pre-Activation Checks

**Before enabling the feature flag, verify:**

```bash
# 1. SMTP is configured and tested
docker logs api-service | grep "SMTP email provider"
# Expected: "SMTP email provider is configured for ..."

# 2. OTP_HMAC_SECRET is set (no startup errors)
docker logs api-service | grep "OTP_HMAC_SECRET"
# Expected: No errors

# 3. All services are healthy
curl -fsS https://staging-api.your-domain.com/v1/readyz
# Expected: {"status":"ok"}

# 4. Migrations are applied
# (Run verification SQL from Section 3.3)
```

### 5.2 Enable Feature Flag

```sql
-- Connect to staging database
psql -U scs -h staging-db -d scs_platform

-- Enable email OTP
UPDATE feature_flags SET enabled = true WHERE key = 'auth.email_otp.enabled';

-- Verify
SELECT key, enabled, updated_at FROM feature_flags WHERE key = 'auth.email_otp.enabled';
-- Expected: auth.email_otp.enabled | t | <current-timestamp>

-- Exit
\q
```

### 5.3 Post-Activation Verification

```bash
# Test email OTP request endpoint (should no longer return 404)
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/request \
  -H "Content-Type: application/json" \
  -d '{"email": "test@your-domain.com"}'
# Expected: 200 OK with delivery status (or 429 if rate-limited)

# Check logs for email delivery attempt
docker logs api-service | grep "SMTP delivery"
# Expected: "SMTP delivery accepted for t***@your-domain.com"

# Verify email was sent (check SMTP provider dashboard or inbox)
```

---

## 6. Smoke Testing

### 6.1 Email OTP Flow

**Test procedure:**

1. **Request email OTP:**
   ```bash
   curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/request \
     -H "Content-Type: application/json" \
     -d '{"email": "your-test-email@domain.com"}'
   # Expected: 200 OK, {"success":true,"deliveryStatus":"accepted","possiblyDelivered":true}
   ```

2. **Check email inbox:**
   - Verify OTP email received
   - Note: OTP value is 6 digits
   - Email should arrive within 30 seconds

3. **Verify email OTP:**
   ```bash
   curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/verify \
     -H "Content-Type: application/json" \
     -d '{"email": "your-test-email@domain.com", "otp": "123456", "deviceId": "test-device-1"}'
   # Expected: 200 OK with accessToken and refreshToken
   ```

4. **Verify session created:**
   ```bash
   curl https://staging-api.your-domain.com/v1/me \
     -H "Authorization: Bearer <access-token>"
   # Expected: 200 OK with user profile
   ```

### 6.2 Account Linking Flow

**Test procedure:**

1. **Login with existing phone account:**
   - Use phone OTP flow to authenticate
   - Obtain access token

2. **Link email to account:**

   **Proof-of-control contract (verified against `identity.service.ts:1792-1843`):**
   The `POST /v1/auth/account/link-email` endpoint itself consumes the OTP as proof-of-control. There is NO separate verify step for linking. The same OTP cannot be replayed after the link succeeds.

   **Correct sequence:**

   ```bash
   # Step 1: Request OTP for the email to be linked
   curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/request \
     -H "Content-Type: application/json" \
     -d '{"email": "new-email@domain.com"}'
   # Expected: 200 OK, {"success":true,"deliveryStatus":"accepted","possiblyDelivered":true}

   # Step 2: Read OTP from email inbox (6-digit code)

   # Step 3: Link email to account (consumes OTP as proof-of-control)
   curl -X POST https://staging-api.your-domain.com/v1/auth/account/link-email \
     -H "Authorization: Bearer <access-token>" \
     -H "Content-Type: application/json" \
     -d '{"email": "new-email@domain.com", "otp": "123456"}'
   # Expected: 200 OK, {"success":true}
   ```

   **Important:** Do NOT verify the OTP separately before linking. The link endpoint consumes the OTP directly. Attempting to verify first will consume the challenge and cause the link to fail.

   **Regression reference:** See `apps/api/src/__tests__/integration/account-linking.postgres.spec.ts` lines 150-224 for the exact test pattern.

3. **Verify email is linked:**
   ```bash
   curl https://staging-api.your-domain.com/v1/me \
     -H "Authorization: Bearer <access-token>"
   # Expected: Profile shows both phone and email
   ```

### 6.3 Rate Limiting

**Test procedure:**

```bash
# Send 6 requests in quick succession (limit is 5/15min)
for i in {1..6}; do
  curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/request \
    -H "Content-Type: application/json" \
    -d '{"email": "rate-limit-test@domain.com"}' \
    -w "\nRequest $i: HTTP %{http_code}\n"
done

# Expected: First 5 return 200, 6th returns 429
# Check response headers for rate limit info:
# X-RateLimit-Limit: 5
# X-RateLimit-Remaining: 0
# X-RateLimit-Reset: <unix-timestamp>
# Retry-After: <seconds>
```

### 6.4 Feature Flag Kill Switch

**Test procedure:**

```sql
-- Disable feature flag
UPDATE feature_flags SET enabled = false WHERE key = 'auth.email_otp.enabled';
```

```bash
# Try to request email OTP (should return 404)
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/request \
  -H "Content-Type: application/json" \
  -d '{"email": "test@domain.com"}' \
  -w "\nHTTP %{http_code}\n"
# Expected: 404 Not Found

# Verify phone OTP still works (unaffected)
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/request \
  -H "Content-Type: application/json" \
  -d '{"phone": "+966500000000"}'
# Expected: 200 OK (phone OTP unaffected by email flag)
```

```sql
-- Re-enable feature flag
UPDATE feature_flags SET enabled = true WHERE key = 'auth.email_otp.enabled';
```

---

## 7. Monitoring

### 7.1 Log Patterns to Monitor

**Email delivery failures:**
```bash
docker logs api-service | grep "SMTP delivery failed" | wc -l
# Alert if count > 10 in 5 minutes
```

**Rate limit triggers:**
```bash
docker logs api-service | grep "Rate limit exceeded" | wc -l
# Alert if count > 100 in 1 minute (may indicate attack)
```

**OTP verification failures:**
```bash
docker logs api-service | grep "Invalid or expired OTP" | wc -l
# Alert if count > 50 in 15 minutes (may indicate brute force)
```

**Feature flag changes:**
```bash
docker logs api-service | grep "Feature flag" | grep "auth.email_otp.enabled"
# Monitor for unexpected toggles
```

### 7.2 Database Queries for Monitoring

```sql
-- Check email OTP success rate (last 1 hour)
SELECT
  COUNT(*) AS total_attempts,
  SUM(CASE WHEN metadata->>'deliveryStatus' = 'accepted' THEN 1 ELSE 0 END) AS successful,
  ROUND(100.0 * SUM(CASE WHEN metadata->>'deliveryStatus' = 'accepted' THEN 1 ELSE 0 END) / COUNT(*), 2) AS success_rate
FROM audit_log
WHERE action = 'auth.otp_request'
  AND metadata->>'channel' = 'email'
  AND created_at > NOW() - INTERVAL '1 hour';
-- Target: success_rate > 98%

-- Check rate limit triggers (last 15 minutes)
SELECT COUNT(*) AS rate_limit_events
FROM audit_log
WHERE action = 'rate_limit_exceeded'
  AND created_at > NOW() - INTERVAL '15 minutes';
-- Alert if count > 100

-- Check feature flag status
SELECT key, enabled, updated_at FROM feature_flags WHERE key = 'auth.email_otp.enabled';
-- Verify matches expected state
```

---

## 8. Rollback Procedures

### 8.1 Soft Rollback (Feature Flag)

**When to use:** Issues with email OTP flow, but no data corruption

**Procedure:**
```sql
-- Disable feature flag (immediate effect, no restart)
UPDATE feature_flags SET enabled = false WHERE key = 'auth.email_otp.enabled';
```

**Impact:**
- All 6 Phase 1 endpoints return 404
- Existing phone OTP and password login unaffected
- No data loss or corruption
- No user-facing error messages

**Verification:**
```bash
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/request \
  -H "Content-Type: application/json" \
  -d '{"email": "test@domain.com"}'
# Expected: 404 Not Found
```

### 8.2 Hard Rollback (Schema Revert) — EXCEPTIONAL ONLY

**⛔ STOP — READ BEFORE PROCEEDING:**

Hard rollback is a **DESTRUCTIVE, OWNER-APPROVED, LAST-RESORT** operation. It is NOT a routine recovery step.

**When to consider:** ONLY for critical data corruption or security vulnerabilities that cannot be resolved through soft rollback (feature flag) + forward-fix.

**Mandatory prerequisites:**
1. ✅ Soft rollback has been attempted and is insufficient
2. ✅ Database owner has explicitly approved in writing
3. ✅ Verified backup exists and is restorable
4. ✅ Stakeholders notified of downtime (5-10 minutes)

**⚠️ CRITICAL DATA-LOSS WARNINGS:**

1. **Email-only users:** Reverting migration 0064 makes `phone` NOT NULL again, which FAILS if any email-only users exist. You MUST handle them first (see Migration Plan Section 4.2 for options).

2. **Audit trail lost:** `account_link_log` table will be dropped — all link/unlink audit records are permanently lost.

3. **Feature flag removed:** Cannot re-enable email OTP without re-applying migrations.

**Recommendation:** Avoid hard rollback unless absolutely necessary. Prefer soft rollback + forward-fix. See `OTP-S1.40-MIGRATION-AND-ROLLBACK-PLAN.md` Section 4.2 for detailed procedure and safety gates.

---

## 9. Acceptance Criteria

### 9.1 Deployment Success

- ✅ Migrations 0064 and 0065 applied without errors
- ✅ API services start and pass health checks
- ✅ Feature flag is OFF by default
- ✅ Email OTP endpoints return 404 when flag is OFF
- ✅ Phone OTP and password login flows unaffected

### 9.2 Activation Success

- ✅ Feature flag toggled ON
- ✅ Email OTP request returns 200 with delivery status
- ✅ Email OTP verify returns 200 with JWT tokens
- ✅ Account linking works with OTP proof-of-control
- ✅ Rate limiting enforced (5 req/15min per email, 20 req/60s per IP)
- ✅ Timing floor enforced (250ms minimum response time)
- ✅ No PII in logs (emails and phones masked)
- ✅ No OTP values in logs

### 9.3 Operational Success (24h Monitoring)

- ✅ Email delivery success rate >98%
- ✅ Rate limit triggers <100/hour (normal usage)
- ✅ OTP verification failures <50/day (normal usage)
- ✅ No security incidents (enumeration, brute force, data leaks)
- ✅ No user complaints or support tickets

---

## 10. Owner Actions Required

### 10.1 Before Staging Deployment

1. ⚠️ **Configure SMTP credentials** in staging environment
2. ⚠️ **Generate and set OTP_HMAC_SECRET** (≥32 chars, unique, random)
3. ⚠️ **Verify staging database** is accessible and backed up
4. ⚠️ **Verify staging Redis** is accessible
5. ⚠️ **Test SMTP connectivity** from staging servers

### 10.2 Before Production Activation

1. ⚠️ **Deploy to staging** and run full smoke test suite
2. ⚠️ **Monitor staging for 48 hours** — verify no issues
3. ⚠️ **Configure production SMTP** credentials
4. ⚠️ **Generate production OTP_HMAC_SECRET** (different from staging)
5. ⚠️ **Review and approve** staging activation results

### 10.3 Follow-Up Sprint (Recommended)

1. ⚠️ **Add OpsAlertService hooks** for email delivery failures
2. ⚠️ **Extend P13MonitorService** to scan email-OTP conditions
3. ⚠️ **Create SMTP failure playbook** in operational runbooks
4. ⚠️ **Implement OTP delivery SLO metric** collection and alerting

---

## 11. References

**Implementation files:**
- `apps/api/src/modules/identity/identity.service.ts` — Core identity service
- `apps/api/src/modules/identity/auth.controller.ts` — Auth endpoints
- `apps/api/src/modules/notifications/providers/smtp-email.provider.ts` — SMTP delivery
- `apps/api/src/config/env-gate.ts` — Production boot gates
- `infra/drizzle/migrations/0064_email_identity.sql` — Email identity migration
- `infra/drizzle/migrations/0065_hmac_identifier_hash.sql` — HMAC hash migration

**Documentation:**
- `infra/deploy/README.md` — Deployment procedures
- `infra/deploy/.env.production.example` — Environment template
- `docs/production/OTP-S1.37-PHASE-1-MIGRATION-AND-ROLLBACK-RUNBOOK.md` — Migration runbook
- `docs/production/OTP-S1.39-STAGING-READINESS-ASSESSMENT.md` — Staging readiness

**Tests:**
- `apps/api/src/__tests__/integration/email-otp-e2e.postgres.spec.ts` — E2E tests
- `apps/api/src/__tests__/integration/migration-0064-email-identity.postgres.spec.ts` — Migration tests
- `apps/api/src/__tests__/unit/identity/email-enumeration.spec.ts` — Enumeration resistance tests

---

**Runbook prepared by:** S1.40 staging activation preparation
**Date:** 2026-11-03
**Status:** READY FOR STAGING OPERATOR REVIEW
