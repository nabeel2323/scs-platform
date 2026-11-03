# OTP-S1.40 — Environment Configuration Register

**Date:** 2026-11-03
**Scope:** All environment variables, secrets, and configuration required for Phase 1 staging activation
**PR:** #104 (merged at `428b8fa`)

---

## 1. Boot-Blocking Credentials

These variables are **required** for the API to start. Missing or invalid values cause the service to refuse to boot.

### 1.1 JWT_ACCESS_SECRET

| Field | Value |
|-------|-------|
| **Required** | YES |
| **Source** | `apps/api/src/config/env-gate.ts` lines 50-90 |
| **Consumed by** | `config/env-gate.ts`, `modules/identity/identity.module.ts` |
| **Minimum length** | 16 characters |
| **Must NOT be** | Development default (`dev-secret-change-me-min-16-chars!!`) |
| **Purpose** | Signs JWT access tokens |
| **Rotation** | Requires restart; invalidates all existing access tokens |

**Generation:**
```bash
openssl rand -base64 32
# Example: K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/peFcUnhY=
```

**Staging value:** `__REPLACE_ME__`

**Verification:**
```bash
docker logs api-service | grep "JWT"
# Expected: No errors about weak/missing secret
```

---

### 1.2 OTP_HMAC_SECRET

| Field | Value |
|-------|-------|
| **Required** | YES (production/staging) |
| **Source** | `apps/api/src/config/env-gate.ts` lines 94-176 |
| **Consumed by** | `config/env-gate.ts`, `modules/identity/identity.service.ts` |
| **Minimum length** | 32 characters |
| **Must NOT be** | Development default (`dev-hmac-secret-change-me-in-production-64chars-minimum!!`) |
| **Purpose** | HMAC-SHA256 key for OTP challenge storage in Redis |
| **Rotation** | No restart required; invalidates all pending OTP challenges |

**Generation:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Example: a3f5b8c9d2e4f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
```

**Staging value:** `__REPLACE_ME__`

**Verification:**
```bash
docker logs api-service | grep "OTP_HMAC_SECRET"
# Expected: No errors about weak/missing secret
```

**Security note:** This secret protects OTP challenges stored in Redis. If compromised, an attacker with Redis read access could precompute OTP codes. Rotate immediately if suspected compromise.

---

### 1.3 POSTGRES_PASSWORD

| Field | Value |
|-------|-------|
| **Required** | YES |
| **Source** | `infra/deploy/.env.production.example` line 33 |
| **Consumed by** | `infra/docker-compose.prod.yml` (postgres service + DATABASE_URL) |
| **Constraints** | Must be URL-safe: no `@`, `:`, `/`, `#`, `%` |
| **Purpose** | PostgreSQL password for role `scs` |

**Staging value:** `__REPLACE_ME_url_safe__`

**Verification:**
```bash
docker compose exec postgres psql -U scs -d scs_platform -c "SELECT 1"
# Expected: 1 row returned
```

---

### 1.4 REDIS_PASSWORD

| Field | Value |
|-------|-------|
| **Required** | YES |
| **Source** | `infra/deploy/.env.production.example` line 38 |
| **Consumed by** | `redis --requirepass` + `REDIS_URL` |
| **Purpose** | Redis authentication (Redis holds JWT denylist, not just cache) |

**Staging value:** `__REPLACE_ME__`

**Verification:**
```bash
docker compose exec redis redis-cli -a $REDIS_PASSWORD ping
# Expected: PONG
```

---

### 1.5 S3_ACCESS_KEY and S3_SECRET_KEY

| Field | Value |
|-------|-------|
| **Required** | YES |
| **Source** | `infra/deploy/.env.production.example` lines 42-43 |
| **Consumed by** | `common/storage/storage.service.ts` |
| **Constraints** | `S3_SECRET_KEY` minimum 8 characters for MinIO |
| **Purpose** | Object-store credentials (StorageService throws without both) |

**Staging values:** `__REPLACE_ME__`

**Verification:**
```bash
docker logs api-service | grep "Storage"
# Expected: No errors about missing S3 credentials
```

---

## 2. Required Non-Secret Configuration

### 2.1 API_CORS_ORIGINS

| Field | Value |
|-------|-------|
| **Required** | YES |
| **Source** | `infra/deploy/.env.production.example` line 51 |
| **Consumed by** | `apps/api/src/main.ts` line 57 (`API_CORS_ORIGINS?.split(',')`) |
| **Format** | Comma-separated list of origins |
| **Default if unset** | Falls back to `http://localhost:3100,http://localhost:3200` (wrong for staging!) |
| **Purpose** | Browser origins allowed to call the API |

**Staging value:**
```bash
API_CORS_ORIGINS=https://staging-shop.your-domain.com,https://staging-admin.your-domain.com
```

**Verification:**
```bash
curl -H "Origin: https://staging-shop.your-domain.com" \
  https://staging-api.your-domain.com/v1/healthz \
  -I | grep -i access-control-allow-origin
# Expected: access-control-allow-origin: https://staging-shop.your-domain.com
```

---

### 2.2 PUBLIC_API_URL

| Field | Value |
|-------|-------|
| **Required** | YES |
| **Source** | `infra/deploy/.env.production.example` line 56 |
| **Consumed by** | Build argument for web/admin Dockerfiles (`NEXT_PUBLIC_*`) |
| **Baked at** | Build time (not runtime) |
| **Purpose** | Origin browsers use to reach the API |

**Staging value:**
```bash
PUBLIC_API_URL=https://staging-api.your-domain.com
```

**Build command:**
```bash
docker build -f infra/deploy/web.Dockerfile -t scs-web:staging \
  --build-arg NEXT_PUBLIC_API_URL=https://staging-api.your-domain.com .
```

**Verification:**
```bash
# Check web bundle for API URL
docker run --rm scs-web:staging grep -r "staging-api.your-domain.com" /app/.next/
# Expected: Matches found in client bundle
```

---

### 2.3 DATABASE_URL

| Field | Value |
|-------|-------|
| **Required** | YES |
| **Source** | `.env.example` line 9 |
| **Consumed by** | `common/database/database.service.ts` |
| **Format** | PostgreSQL connection string |
| **Staging format** | `postgresql://scs:PASSWORD@staging-db:5432/scs_platform` |

**Staging value:**
```bash
DATABASE_URL=postgresql://scs:STAGING_PASSWORD@staging-db:5432/scs_platform
```

**Verification:**
```bash
docker compose exec api psql $DATABASE_URL -c "SELECT 1"
# Expected: 1 row returned
```

---

### 2.4 REDIS_URL

| Field | Value |
|-------|-------|
| **Required** | YES |
| **Source** | `.env.example` line 14 |
| **Consumed by** | `common/redis/redis.service.ts` |
| **Format** | Redis connection string |
| **Staging format** | `redis://:PASSWORD@staging-redis:6379` |

**Staging value:**
```bash
REDIS_URL=redis://:STAGING_REDIS_PASSWORD@staging-redis:6379
```

**Verification:**
```bash
docker compose exec api redis-cli -u $REDIS_URL ping
# Expected: PONG
```

---

## 3. SMTP Configuration (Required for Email OTP)

### 3.1 SMTP_HOST

| Field | Value |
|-------|-------|
| **Required** | YES (for email delivery) |
| **Source** | `.env.example` line 26 |
| **Consumed by** | `modules/notifications/providers/provider.config.ts` line 153 |
| **Default** | `localhost` |
| **Purpose** | SMTP server hostname |

**Staging value:** `smtp.provider.com` (or your SMTP provider)

**Verification:**
```bash
docker logs api-service | grep "SMTP email provider"
# Expected: "SMTP email provider is configured for smtp.provider.com:587"
```

---

### 3.2 SMTP_PORT

| Field | Value |
|-------|-------|
| **Required** | NO |
| **Source** | `.env.example` line 27 |
| **Consumed by** | `modules/notifications/providers/provider.config.ts` line 154 |
| **Default** | `587` |
| **Purpose** | SMTP server port |

**Staging value:** `587` (TLS) or `465` (SSL)

---

### 3.3 SMTP_SECURE

| Field | Value |
|-------|-------|
| **Required** | NO |
| **Source** | `.env.example` line 28 |
| **Consumed by** | `modules/notifications/providers/provider.config.ts` line 155 |
| **Default** | `false` |
| **Purpose** | Whether to use TLS |

**Staging value:** `true` (recommended for production)

---

### 3.4 SMTP_FROM

| Field | Value |
|-------|-------|
| **Required** | YES (for email delivery) |
| **Source** | `.env.example` line 29 |
| **Consumed by** | `modules/notifications/providers/provider.config.ts` line 156 |
| **Default** | `noreply@scsp.dev` |
| **Purpose** | Sender email address |

**Staging value:** `noreply@staging.your-domain.com`

**DNS requirements:**
- SPF record: `v=spf1 include:provider.com ~all`
- DKIM record: (provided by SMTP provider)
- DMARC record: `v=DMARC1; p=quarantine; rua=mailto:dmarc@your-domain.com`

---

### 3.5 SMTP_USER and SMTP_PASSWORD

| Field | Value |
|-------|-------|
| **Required** | NO (optional — required if SMTP provider requires authentication) |
| **Source** | `.env.example` lines 30-31 |
| **Consumed by** | `modules/notifications/providers/provider.config.ts` lines 157-158 |
| **Default** | Unset (anonymous relay) |
| **Purpose** | SMTP authentication credentials |

**Staging values:** Set if your SMTP provider requires authentication

**Verification:**
```bash
# Test SMTP authentication
docker compose exec api node -e "
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  } : undefined
});
transporter.verify().then(() => console.log('SMTP OK')).catch(e => console.error(e));
"
# Expected: SMTP OK
```

---

## 4. OTP Configuration

### 4.1 OTP_LENGTH

| Field | Value |
|-------|-------|
| **Required** | NO |
| **Source** | `.env.example` line 40 |
| **Consumed by** | `modules/identity/identity.service.ts` |
| **Default** | `6` |
| **Purpose** | OTP code length (digits) |

**Staging value:** `6` (default is fine)

---

### 4.2 OTP_TTL

| Field | Value |
|-------|-------|
| **Required** | NO |
| **Source** | `.env.example` line 41 |
| **Consumed by** | `modules/identity/identity.service.ts` |
| **Default** | `90` (seconds) |
| **Purpose** | Phone OTP time-to-live |
| **Note** | Email OTP uses 300s (hardcoded in service) |

**Staging value:** `90` (default is fine)

---

### 4.3 OTP_MAX_ATTEMPTS

| Field | Value |
|-------|-------|
| **Required** | NO |
| **Source** | `.env.example` line 42 |
| **Consumed by** | `modules/identity/identity.service.ts` |
| **Default** | `5` |
| **Purpose** | Maximum verification attempts before challenge expires |

**Staging value:** `5` (default is fine)

---

### 4.4 OTP_MOCK_ENABLED

| Field | Value |
|-------|-------|
| **Required** | NO |
| **Source** | `.env.example` line 52 |
| **Consumed by** | `modules/notifications/provider-registry.service.ts` |
| **Default** | `true` |
| **Purpose** | Enable internal mock OTP delivery provider |
| **Staging value** | **MUST BE `false`** |

**⚠️ CRITICAL:** This must be `false` in staging. If `true`, the mock provider will intercept email delivery and no real emails will be sent.

**Triple-gating (source: `provider-registry.service.ts` lines 50-100):**
1. `NODE_ENV` must be `development` or `test`
2. `OTP_MOCK_ENABLED` must be `true`
3. Mock provider excluded from public API

**Staging value:**
```bash
OTP_MOCK_ENABLED=false
```

**Verification:**
```bash
docker logs api-service | grep "mock"
# Expected: No mention of mock provider being active
```

---

## 5. Application Configuration

### 5.1 NODE_ENV

| Field | Value |
|-------|-------|
| **Required** | YES |
| **Source** | `.env.example` line 80 |
| **Consumed by** | Multiple (boot gates, mock provider, logging) |
| **Staging value** | `staging` |
| **Purpose** | Environment name (affects boot gates, logging, mock provider) |

**Verification:**
```bash
docker compose exec api printenv NODE_ENV
# Expected: staging
```

---

### 5.2 API_PORT and API_HOST

| Field | Value |
|-------|-------|
| **Required** | NO |
| **Source** | `.env.example` lines 81-82 |
| **Default** | `3000` and `0.0.0.0` |
| **Purpose** | API server port and bind address |

**Staging values:** Defaults are fine

---

### 5.3 LOG_LEVEL

| Field | Value |
|-------|-------|
| **Required** | NO |
| **Source** | `.env.example` line 84 |
| **Consumed by** | `apps/api/src/main.ts` line 72 (pino-http) |
| **Default** | `debug` (dev), `info` (production) |
| **Purpose** | Logging verbosity |

**Staging value:** `info` (recommended for production-like environments)

---

## 6. Database Pool Configuration

### 6.1 DATABASE_POOL_MAX

| Field | Value |
|-------|-------|
| **Required** | NO |
| **Source** | `.env.example` line 11 |
| **Consumed by** | `common/database/database.service.ts` |
| **Default** | `20` |
| **Purpose** | Maximum database connections in pool |

**Staging value:** `10` (recommended for staging)

---

### 6.2 DATABASE_POOL_MIN

| Field | Value |
|-------|-------|
| **Required** | NO |
| **Source** | `.env.example` line 10 |
| **Consumed by** | Not read by code (listed for Compose passthrough) |
| **Default** | `2` |
| **Purpose** | Minimum database connections in pool (no effect today) |

**Staging value:** `1` (recommended for staging)

---

## 7. Feature Flags

### 7.1 FLAG_AUTH_EMAIL_OTP (Environment Variable)

| Field | Value |
|-------|-------|
| **Required** | NO |
| **Source** | `.env.example` line 95 |
| **Consumed by** | **NOT READ BY CODE** — listed for documentation only |
| **Default** | `false` |
| **Purpose** | Documentation placeholder (actual flag is in database) |

**⚠️ IMPORTANT:** This environment variable is **NOT** read by the application. The actual feature flag is stored in the `feature_flags` database table and is seeded by migration 0064.

**Actual feature flag:**
```sql
-- Check current state
SELECT key, enabled FROM feature_flags WHERE key = 'auth.email_otp.enabled';

-- Enable (runtime toggle, no restart)
UPDATE feature_flags SET enabled = true WHERE key = 'auth.email_otp.enabled';

-- Disable (runtime toggle, no restart)
UPDATE feature_flags SET enabled = false WHERE key = 'auth.email_otp.enabled';
```

---

## 8. Observability Configuration

### 8.1 OTEL_ENABLED

| Field | Value |
|-------|-------|
| **Required** | NO |
| **Source** | `.env.example` line 87 |
| **Default** | `false` |
| **Purpose** | Enable OpenTelemetry tracing |

**Staging value:** `false` (unless you have an OTLP endpoint configured)

---

### 8.2 OTEL_EXPORTER_OTLP_ENDPOINT

| Field | Value |
|-------|-------|
| **Required** | NO (if OTEL_ENABLED=false) |
| **Source** | `.env.example` line 88 |
| **Default** | `http://localhost:4318` |
| **Purpose** | OpenTelemetry collector endpoint |

---

### 8.3 OTEL_SERVICE_NAME

| Field | Value |
|-------|-------|
| **Required** | NO |
| **Source** | `.env.example` line 89 |
| **Default** | `scs-api` |
| **Purpose** | Service name in traces |

---

## 9. P13 Operational Posture

### 9.1 P13_PILOT_MODE

| Field | Value |
|-------|-------|
| **Required** | NO |
| **Source** | `infra/deploy/.env.production.example` line 96 |
| **Consumed by** | `modules/operations/p13-ops.config.ts` |
| **Default** | `legacy` |
| **Purpose** | Pilot enforcement mode (`legacy` or `allowlist`) |

**Staging value:** `legacy` (safe default — keeps pre-P13 behavior)

---

### 9.2 P13_EXPECTED_WORKER_COUNT

| Field | Value |
|-------|-------|
| **Required** | NO |
| **Source** | `infra/deploy/.env.production.example` line 100 |
| **Default** | `0` |
| **Purpose** | Expected worker count for monitor check |

**Staging value:** `0` (unless P13 worker is enabled)

---

### 9.3 P13_OPS_ALERT_WEBHOOK_URL

| Field | Value |
|-------|-------|
| **Required** | NO |
| **Source** | `infra/deploy/.env.production.example` line 106 |
| **Default** | Empty (log-only) |
| **Purpose** | Alert webhook URL (empty = alerts logged but not sent) |

**Staging value:** Empty (safe default — alerts are persisted and logged)

---

## 10. Complete Staging Environment Template

```bash
# ═══════════════════════════════════════════════════════════
# SCS Platform — Staging Environment Configuration
# Phase 1 Email OTP Activation
# Date: 2026-11-03
# ═══════════════════════════════════════════════════════════

# ── Boot-Blocking Credentials ────────────────────────────
JWT_ACCESS_SECRET=<generate-with-openssl-rand-base64-32>
OTP_HMAC_SECRET=<generate-with-node-crypto-randomBytes-32>
POSTGRES_PASSWORD=<url-safe-password>
REDIS_PASSWORD=<secure-password>
S3_ACCESS_KEY=<staging-access-key>
S3_SECRET_KEY=<staging-secret-key-min-8-chars>

# ── Required Non-Secret Configuration ────────────────────
API_CORS_ORIGINS=https://staging-shop.your-domain.com,https://staging-admin.your-domain.com
PUBLIC_API_URL=https://staging-api.your-domain.com
DATABASE_URL=postgresql://scs:POSTGRES_PASSWORD@staging-db:5432/scs_platform
REDIS_URL=redis://:REDIS_PASSWORD@staging-redis:6379

# ── SMTP Configuration (REQUIRED FOR EMAIL OTP) ──────────
SMTP_HOST=smtp.provider.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_FROM=noreply@staging.your-domain.com
SMTP_USER=<smtp-username-if-required>
SMTP_PASSWORD=<smtp-password-if-required>

# ── OTP Configuration ────────────────────────────────────
OTP_LENGTH=6
OTP_TTL=90
OTP_MAX_ATTEMPTS=5
OTP_MOCK_ENABLED=false  # MUST BE FALSE IN STAGING

# ── Application Configuration ────────────────────────────
NODE_ENV=staging
API_PORT=3000
API_HOST=0.0.0.0
LOG_LEVEL=info

# ── Database Pool Configuration ──────────────────────────
DATABASE_POOL_MAX=10
DATABASE_POOL_MIN=1

# ── Observability (Optional) ─────────────────────────────
OTEL_ENABLED=false
# OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
# OTEL_SERVICE_NAME=scs-api-staging

# ── P13 Operational Posture ──────────────────────────────
P13_PILOT_MODE=legacy
P13_EXPECTED_WORKER_COUNT=0
P13_OPS_ALERT_WEBHOOK_URL=
```

---

## 11. Verification Checklist

Before deployment, verify all required variables are set:

```bash
# Check boot-blocking credentials
for var in JWT_ACCESS_SECRET OTP_HMAC_SECRET POSTGRES_PASSWORD REDIS_PASSWORD S3_ACCESS_KEY S3_SECRET_KEY; do
  if [ -z "${!var}" ]; then
    echo "❌ $var is not set"
  else
    echo "✅ $var is set"
  fi
done

# Check SMTP configuration
for var in SMTP_HOST SMTP_FROM; do
  if [ -z "${!var}" ]; then
    echo "❌ $var is not set (required for email OTP)"
  else
    echo "✅ $var is set"
  fi
done

# Check critical flags
if [ "$OTP_MOCK_ENABLED" = "true" ]; then
  echo "❌ OTP_MOCK_ENABLED must be false in staging"
else
  echo "✅ OTP_MOCK_ENABLED is false"
fi

if [ "$NODE_ENV" = "development" ] || [ "$NODE_ENV" = "test" ]; then
  echo "⚠️  NODE_ENV is $NODE_ENV (should be 'staging' for staging environment)"
else
  echo "✅ NODE_ENV is $NODE_ENV"
fi
```

---

## 12. References

**Implementation files:**
- `apps/api/src/config/env-gate.ts` — Boot gates for JWT and HMAC secrets
- `apps/api/src/modules/notifications/providers/provider.config.ts` — SMTP configuration
- `apps/api/src/modules/notifications/provider-registry.service.ts` — Mock provider triple-gating
- `infra/deploy/.env.production.example` — Production environment template
- `.env.example` — Development environment template

**Documentation:**
- `infra/deploy/README.md` — Deployment procedures
- `docs/production/OTP-S1.40-STAGING-ACTIVATION-RUNBOOK.md` — Staging activation runbook

---

**Register prepared by:** S1.40 staging activation preparation
**Date:** 2026-11-03
**Status:** COMPLETE — ALL VARIABLES DOCUMENTED
