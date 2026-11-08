# Buyer Staging Environment Configuration

**Date:** 2026-11-08  
**Scope:** All environment variables required for SCS buyer staging deployment  
**Applications:** `apps/web` (buyer), `apps/api` (backend)

---

## 1. Frontend Environment Variables (Vercel)

### 1.1 Required Variables

| Variable | Value | Scope | Required | Notes |
|---|---|---|---|---|
| `NODE_ENV` | `production` | Runtime | ✅ YES | Environment mode |
| `NEXT_PUBLIC_API_URL` | `https://scs-api-staging.onrender.com` | Build + Runtime | ✅ YES | SCS API base URL |
| `NEXT_PUBLIC_WS_URL` | `wss://scs-api-staging.onrender.com` | Build + Runtime | ✅ YES | WebSocket URL for realtime |
| `NEXT_PUBLIC_CDN_URL` | (empty or URL) | Build + Runtime | ❌ Optional | CDN for media assets |

### 1.2 Variable Details

#### `NODE_ENV`

- **Type:** Enum
- **Allowed values:** `development`, `staging`, `production`
- **Default:** `development`
- **Purpose:** Controls Next.js behavior (optimization, error handling, logging)
- **Staging value:** `production` (for optimized builds)

#### `NEXT_PUBLIC_API_URL`

- **Type:** URL (string)
- **Default:** `http://localhost:3000`
- **Purpose:** Base URL for all API requests
- **Used by:** `apps/web/src/lib/api.ts`, `auth.ts`, `buyer-api.ts`, `analytics.ts`, `realtime.ts`, `shipops.ts`
- **Staging value:** `https://scs-api-staging.onrender.com`
- **Security:** Exposed to browser (prefixed with `NEXT_PUBLIC_`)

#### `NEXT_PUBLIC_WS_URL`

- **Type:** URL (string)
- **Default:** `ws://localhost:3000`
- **Purpose:** WebSocket URL for realtime features (notifications, live updates)
- **Used by:** `apps/web/src/lib/realtime.ts`
- **Staging value:** `wss://scs-api-staging.onrender.com` (secure WebSocket)
- **Security:** Exposed to browser

#### `NEXT_PUBLIC_CDN_URL`

- **Type:** URL (string, optional)
- **Default:** (none)
- **Purpose:** CDN URL for media assets (product images, documents)
- **Used by:** Media components
- **Staging value:** (leave empty or configure if CDN is set up)
- **Security:** Exposed to browser

### 1.3 Vercel Configuration

**File:** `apps/web/vercel.json`

```json
{
  "env": {
    "NODE_ENV": "production"
  },
  "build": {
    "env": {
      "NEXT_PUBLIC_API_URL": "https://scs-api-staging.onrender.com",
      "NEXT_PUBLIC_WS_URL": "wss://scs-api-staging.onrender.com",
      "NEXT_PUBLIC_CDN_URL": ""
    }
  }
}
```

**Note:** Variables in `vercel.json` are defaults. Vercel dashboard environment variables override these values.

---

## 2. Backend Environment Variables (Render)

### 2.1 Required Variables

| Variable | Value | Scope | Required | Notes |
|---|---|---|---|---|
| `NODE_ENV` | `staging` | Runtime | ✅ YES | Environment mode |
| `DATABASE_URL` | (PostgreSQL URL) | Runtime | ✅ YES | Supabase staging database |
| `REDIS_URL` | (Redis URL) | Runtime | ✅ YES | Redis staging instance |
| `API_CORS_ORIGINS` | `https://scs-buyer-staging.vercel.app` | Runtime | ✅ YES | **CRITICAL: CORS allowlist** |
| `JWT_ACCESS_SECRET` | (32+ char secret) | Runtime | ✅ YES | JWT access token signing |
| `JWT_REFRESH_SECRET` | (32+ char secret) | Runtime | ✅ YES | JWT refresh token signing |
| `OTP_HMAC_SECRET` | (64 char hex) | Runtime | ✅ YES | OTP HMAC signing |

### 2.2 Optional Variables

| Variable | Value | Scope | Required | Notes |
|---|---|---|---|---|
| `API_PORT` | `3000` | Runtime | ❌ Optional | API server port |
| `API_HOST` | `0.0.0.0` | Runtime | ❌ Optional | API server host |
| `LOG_LEVEL` | `info` | Runtime | ❌ Optional | Logging level |
| `JWT_ACCESS_TTL` | `15m` | Runtime | ❌ Optional | Access token TTL |
| `JWT_REFRESH_TTL` | `30d` | Runtime | ❌ Optional | Refresh token TTL |
| `S3_ENDPOINT` | (URL) | Runtime | ❌ Optional | S3/MinIO endpoint |
| `S3_REGION` | `us-east-1` | Runtime | ❌ Optional | S3 region |
| `S3_ACCESS_KEY` | (key) | Runtime | ❌ Optional | S3 access key |
| `S3_SECRET_KEY` | (secret) | Runtime | ❌ Optional | S3 secret key |
| `S3_MEDIA_BUCKET` | `scs-media` | Runtime | ❌ Optional | Media bucket |
| `S3_UPLOADS_BUCKET` | `scs-uploads` | Runtime | ❌ Optional | Uploads bucket |
| `SMTP_HOST` | (hostname) | Runtime | ❌ Optional | SMTP server (for OTP) |
| `SMTP_PORT` | `587` | Runtime | ❌ Optional | SMTP port |
| `SMTP_USER` | (username) | Runtime | ❌ Optional | SMTP username |
| `SMTP_PASS` | (password) | Runtime | ❌ Optional | SMTP password |
| `SMTP_FROM` | (email) | Runtime | ❌ Optional | SMTP from address |

### 2.3 Feature Flags (Database)

| Flag | Default | Purpose | How to Enable |
|---|---|---|---|
| `auth.email_otp.enabled` | `false` | Email OTP authentication | `UPDATE feature_flags SET enabled = true WHERE key = 'auth.email_otp.enabled'` |
| `flags.prepay.enabled` | `false` | Prepayment feature | Database update |
| `flags.b2c.enabled` | `false` | B2C marketplace | Database update |
| `flags.ads.enabled` | `false` | Advertising feature | Database update |

### 2.4 Critical Variable: `API_CORS_ORIGINS`

**Purpose:** Controls which frontend origins can make cross-origin requests to the API.

**Format:** Comma-separated list of URLs

**Current state:** ❌ NOT CONFIGURED (using localhost defaults)

**Required configuration:**
```bash
API_CORS_ORIGINS=https://scs-buyer-staging.vercel.app
```

**Multiple origins:**
```bash
API_CORS_ORIGINS=https://scs-buyer-staging.vercel.app,https://scs-admin-staging.vercel.app,http://localhost:3100
```

**Impact:** Without this variable, the browser blocks all frontend-to-API requests due to CORS policy.

**Source code:** `apps/api/src/main.ts`
```typescript
app.enableCors({
  origin: process.env['API_CORS_ORIGINS']?.split(',') || [
    'http://localhost:3100',
    'http://localhost:3200',
    'http://localhost:3300',
  ],
  credentials: true,
  // ...
});
```

---

## 3. Environment Validation

### 3.1 Frontend Validation

**Package:** `@scs/env`  
**Schema:** `WebEnvSchema`

```typescript
export const WebEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_WS_URL: z.string().url().default('ws://localhost:3000'),
  NEXT_PUBLIC_CDN_URL: z.string().url().optional(),
});
```

**Validation function:**
```typescript
import { WebEnvSchema, validateEnv } from '@scs/env';

const env = validateEnv(WebEnvSchema, process.env);
```

**Behavior:** If validation fails, the application throws an error and refuses to start.

### 3.2 Backend Validation

**Package:** `@scs/env`  
**Schema:** `ApiEnvSchema`

```typescript
export const ApiEnvSchema = DatabaseEnvSchema.merge(RedisEnvSchema).extend({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  API_PORT: z.coerce.number().default(3000),
  API_HOST: z.string().default('0.0.0.0'),
  API_CORS_ORIGINS: z.string().default('http://localhost:3100,http://localhost:3200'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  // ... S3, feature flags
});
```

**Behavior:** Same as frontend — fails fast if validation fails.

---

## 4. Security Considerations

### 4.1 Public vs Private Variables

**Public (exposed to browser):**
- All variables prefixed with `NEXT_PUBLIC_`
- These are embedded in the JavaScript bundle during build
- **DO NOT put secrets here**

**Private (server-side only):**
- All other variables (no `NEXT_PUBLIC_` prefix)
- These are only available on the server
- **Secrets go here** (JWT secrets, database URLs, API keys)

### 4.2 Secret Management

**JWT secrets:**
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be at least 16 characters
- Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- **NEVER commit secrets to git**
- **NEVER log secrets**
- Use Vercel/Render secret management

**OTP HMAC secret:**
- `OTP_HMAC_SECRET` must be at least 32 characters (64 hex chars)
- Generate with: `node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex') + '\\n')"`
- Same security rules as JWT secrets

### 4.3 CORS Security

**Purpose:** Prevents unauthorized cross-origin requests

**Configuration:**
- Only allow trusted frontend origins
- Use exact URLs (no wildcards)
- Include protocol (`https://`)
- Update when frontend domain changes

**Risk:** If misconfigured, allows CSRF attacks from unauthorized origins

---

## 5. Deployment Checklist

### 5.1 Frontend (Vercel)

- [ ] Create Vercel project
- [ ] Connect to `nabeel2323/scs-platform` repository
- [ ] Set root directory: `apps/web`
- [ ] Set build command: `pnpm --filter @scs/web build`
- [ ] Set output directory: `apps/web/.next`
- [ ] Set install command: `pnpm install --frozen-lockfile`
- [ ] Add environment variable: `NODE_ENV` = `production`
- [ ] Add environment variable: `NEXT_PUBLIC_API_URL` = `https://scs-api-staging.onrender.com`
- [ ] Add environment variable: `NEXT_PUBLIC_WS_URL` = `wss://scs-api-staging.onrender.com`
- [ ] (Optional) Add environment variable: `NEXT_PUBLIC_CDN_URL`
- [ ] Deploy
- [ ] Note the assigned domain
- [ ] (Optional) Configure custom domain

### 5.2 Backend (Render)

- [ ] Navigate to `scs-api-staging` service
- [ ] Go to "Environment" tab
- [ ] Add environment variable: `API_CORS_ORIGINS` = `https://<vercel-domain>`
- [ ] Verify all required variables are present:
  - [ ] `NODE_ENV`
  - [ ] `DATABASE_URL`
  - [ ] `REDIS_URL`
  - [ ] `JWT_ACCESS_SECRET`
  - [ ] `JWT_REFRESH_SECRET`
  - [ ] `OTP_HMAC_SECRET`
- [ ] Save changes
- [ ] Wait for redeployment
- [ ] Verify CORS is working (see test below)

### 5.3 Verification

**Test CORS:**
```bash
curl -H "Origin: https://<vercel-domain>" \
     -I https://scs-api-staging.onrender.com/v1/healthz
```

**Expected response:**
```
HTTP/1.1 200 OK
access-control-allow-origin: https://<vercel-domain>
access-control-allow-credentials: true
```

**Test frontend:**
1. Navigate to `https://<vercel-domain>`
2. Open browser DevTools → Console
3. Verify no CORS errors
4. Verify no JavaScript errors
5. Check Network tab: API requests should succeed

---

## 6. Troubleshooting

### 6.1 CORS Errors

**Symptom:** Browser console shows "Access to fetch at ... has been blocked by CORS policy"

**Cause:** `API_CORS_ORIGINS` not set or doesn't include the frontend domain

**Fix:**
1. Check `API_CORS_ORIGINS` on Render
2. Ensure it includes the exact frontend URL (with `https://`)
3. Redeploy API on Render
4. Clear browser cache and retry

### 6.2 API Connection Errors

**Symptom:** Frontend shows "Failed to fetch" or network errors

**Cause:** `NEXT_PUBLIC_API_URL` is incorrect or API is down

**Fix:**
1. Check `NEXT_PUBLIC_API_URL` on Vercel
2. Verify API is running: `curl https://scs-api-staging.onrender.com/v1/healthz`
3. Check Render logs for errors
4. Redeploy frontend if variable was changed

### 6.3 Build Errors

**Symptom:** Vercel build fails

**Cause:** Missing dependencies, incorrect build command, or environment validation failure

**Fix:**
1. Check build logs on Vercel
2. Verify build command: `pnpm --filter @scs/web build`
3. Verify all required environment variables are set
4. Check `pnpm-lock.yaml` is up to date
5. Try local build: `pnpm install --frozen-lockfile && pnpm --filter @scs/web build`

### 6.4 Authentication Errors

**Symptom:** Login fails with 401 or 400 errors

**Cause:** Missing `deviceId` in login request, or JWT secrets misconfigured

**Fix:**
1. Check browser console for error details
2. Verify `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are set on Render
3. Verify secrets are at least 16 characters
4. Check API logs for validation errors
5. Ensure frontend is sending `deviceId` with login requests

---

## 7. References

- **Vercel documentation:** https://vercel.com/docs/concepts/projects/environment-variables
- **Render documentation:** https://render.com/docs/environment-variables
- **Next.js environment variables:** https://nextjs.org/docs/basic-features/environment-variables
- **CORS documentation:** https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
- **SCS Platform deployment guide:** `docs/deployment/PHASE-4-STAGING-RECOVERY.md`

---

*Configuration guide generated 2026-11-08. All variable names and values verified against source code.*
