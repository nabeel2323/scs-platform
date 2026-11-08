# Phase 1 — Repository and Deployment Architecture Audit

**Date:** 2026-11-08  
**Auditor:** Automated code inspection  
**Scope:** SCS Platform buyer application deployment configuration

---

## Executive Summary

The SCS Platform buyer application (`apps/web`) is a **Next.js 14** application with proper JWT authentication, device trust security, and environment-based configuration. However, **no deployment infrastructure exists** for this application — no Vercel configuration, no GitHub Actions workflow, and CORS is not configured on the staging API to allow requests from any frontend domain.

The existing `buyer-staging.vercel.app` serves a completely different application (UFLIP buyer, Quasar/Vue.js) and is non-functional due to CORS blocking its OIDC initialization.

---

## 1. SCS Buyer Application Architecture

### 1.1 Application Identity

| Property | Value |
|---|---|
| **Package name** | `@scs/web` |
| **Framework** | Next.js 14.2.5 |
| **React** | 18.3.1 |
| **Title** | "Smart Commerce Platform" |
| **Description** | "B2B-first marketplace — retailer & merchant portal" |
| **Icon** | 🛒 (shopping cart emoji) |
| **Dev port** | 3100 |
| **Build output** | `standalone` (optimized for deployment) |

**Conclusion:** The SCS buyer app is clearly distinct from the UFLIP application (different framework, different identity, different purpose).

### 1.2 Application Structure

**Pages** (`apps/web/src/app/`):
- `account` — User account management
- `auth` — Authentication flows
- `cart` — Shopping cart
- `checkout` — Checkout flow
- `compare` — Product comparison
- `favorites` — Saved products
- `login` — Login page
- `merchant` — Merchant portal
- `notifications` — User notifications
- `orders` — Order history and details
- `products` — Product catalog
- `profile` — User profile
- `returns` — Return requests
- `reviews` — Product reviews
- `saved-suppliers` — Saved suppliers
- `search` — Product search
- `stores` — Store browsing

**Authentication:** JWT-based with refresh token rotation, device trust headers, localStorage session persistence.

### 1.3 Environment Variables

**Required** (from `@scs/env` package):

| Variable | Type | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | enum | `development` | Environment (development/staging/production) |
| `NEXT_PUBLIC_API_URL` | URL | `http://localhost:3000` | SCS API base URL |
| `NEXT_PUBLIC_WS_URL` | URL | `ws://localhost:3000` | WebSocket URL for realtime features |
| `NEXT_PUBLIC_CDN_URL` | URL | optional | CDN URL for media assets |

**Usage:** All API client files (`api.ts`, `auth.ts`, `buyer-api.ts`, `analytics.ts`, `realtime.ts`, `shipops.ts`) use `NEXT_PUBLIC_API_URL` consistently.

**Security:** All variables are prefixed with `NEXT_PUBLIC_`, meaning they are exposed to the browser. No server-side secrets are used.

### 1.4 Authentication Architecture

**File:** `apps/web/src/lib/auth.ts`

**Features:**
- JWT access + refresh token pair
- Refresh token rotation with single-flight guard (prevents concurrent refresh races)
- Device trust proof header (CSRF protection for cross-origin cookies)
- localStorage session persistence (SSR-safe)
- Rate limit error handling (429 responses)
- Session expiration checking
- User profile hydration from `/v1/me`

**Security headers:**
```typescript
credentials: 'include',  // Cross-origin cookie attachment
headers: {
  'Content-Type': 'application/json',
  [DEVICE_TRUST_PROOF_HEADER]: DEVICE_TRUST_PROOF_VALUE,  // CSRF control
}
```

**Conclusion:** Authentication is properly implemented with security best practices. No mock auth, no OIDC dependency on external identity providers.

---

## 2. Deployment Infrastructure Audit

### 2.1 Vercel Configuration

**Status:** ❌ NOT FOUND

- No `vercel.json` in repository root
- No `vercel.json` in `apps/web/`
- No Vercel project configuration files
- No deployment scripts referencing Vercel

**Conclusion:** The SCS buyer app has never been configured for Vercel deployment.

### 2.2 GitHub Actions Workflows

**Status:** ❌ NO FRONTEND DEPLOYMENT WORKFLOW

Searched `.github/workflows/*.yml` for references to:
- `apps/web`
- `@scs/web`
- `vercel`

**Result:** No workflows deploy the frontend application. Only the API backend has a deployment workflow (`release.yml` for Render).

**Conclusion:** Frontend deployment is entirely manual or non-existent.

### 2.3 CORS Configuration

**API CORS setup** (`apps/api/src/main.ts`):
```typescript
app.enableCors({
  origin: process.env['API_CORS_ORIGINS']?.split(',') || [
    'http://localhost:3100', // web
    'http://localhost:3200', // admin
    'http://localhost:3300', // mobile
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Idempotency-Key',
    'If-Match',
    'X-Device-Id',
    DEVICE_TRUST_PROOF_HEADER,
  ],
});
```

**Staging API CORS test:**
```bash
curl -H "Origin: https://buyer-staging.vercel.app" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://scs-api-staging.onrender.com/v1/auth/login/password -I
```

**Result:** ❌ No `Access-Control-Allow-Origin` header returned

**Conclusion:** The staging API does not allow CORS from `buyer-staging.vercel.app` or any other tested origin. The `API_CORS_ORIGINS` environment variable is either not set on Render (using localhost defaults) or does not include the staging frontend domain.

---

## 3. Workspace Configuration

**File:** `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "!apps/scs-platform-b2-test"
  - "packages/*"
  - "mobile/packages/*"
```

**Apps in workspace:**
- `apps/api` — NestJS backend
- `apps/web` — Next.js buyer/merchant frontend
- `apps/admin` — Next.js admin frontend
- `apps/e2e` — End-to-end tests

**Dependencies:**
- `@scs/contracts` — Shared TypeScript types and schemas
- `@scs/ui-kit` — Shared React component library
- `@scs/env` — Zod-validated environment schemas

**Conclusion:** Workspace is properly configured. All dependencies are internal packages.

---

## 4. Build Configuration

**File:** `apps/web/next.config.js`

```javascript
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@scs/ui-kit', '@scs/contracts', '@scs/env'],
  output: 'standalone',
};
```

**Key settings:**
- `reactStrictMode: true` — React best practice
- `transpilePackages` — Workspace packages are transpiled (required for monorepo)
- `output: 'standalone'` — Optimized for deployment (creates standalone Node.js server)

**Build command:** `pnpm --filter @scs/web build`  
**Start command:** `pnpm --filter @scs/web start` (port 3100)

**Conclusion:** Build configuration is correct and deployment-ready.

---

## 5. Critical Findings

### 5.1 Blockers for Deployment

| # | Issue | Severity | Impact |
|---|---|---|---|
| 1 | No Vercel deployment configuration | **BLOCKER** | Cannot deploy frontend |
| 2 | No GitHub Actions workflow for frontend | **HIGH** | No automated deployment |
| 3 | CORS not configured on staging API | **BLOCKER** | Frontend cannot communicate with API |
| 4 | `buyer-staging.vercel.app` serves wrong app | **HIGH** | Confusion about deployment target |

### 5.2 What Works

| # | Feature | Status | Evidence |
|---|---|---|---|
| 1 | SCS buyer app exists | ✅ VERIFIED | `apps/web/` with complete page structure |
| 2 | Environment configuration | ✅ VERIFIED | `@scs/env` with Zod validation |
| 3 | Authentication implementation | ✅ VERIFIED | JWT + device trust + refresh rotation |
| 4 | Build configuration | ✅ VERIFIED | Next.js standalone output |
| 5 | Workspace dependencies | ✅ VERIFIED | All internal packages resolve |
| 6 | App identity | ✅ VERIFIED | "Smart Commerce Platform" (distinct from UFLIP) |

---

## 6. Required Actions for Deployment

### 6.1 Immediate (Blockers)

1. **Configure CORS on staging API:**
   - Set `API_CORS_ORIGINS` environment variable on Render to include the SCS buyer staging domain
   - Example: `API_CORS_ORIGINS=https://scs-buyer-staging.vercel.app,https://buyer-staging.vercel.app`
   - Or create a new Vercel project with a distinct domain

2. **Create Vercel deployment configuration:**
   - Create `vercel.json` in `apps/web/` or repository root
   - Configure build command: `pnpm --filter @scs/web build`
   - Configure output directory: `apps/web/.next`
   - Set environment variables: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`

3. **Deploy to a NEW Vercel project:**
   - Do NOT use `buyer-staging.vercel.app` (serves UFLIP app)
   - Create new project: `scs-buyer-staging` or similar
   - Connect to repository and configure automatic deployments

### 6.2 Recommended (High Priority)

4. **Create GitHub Actions workflow for frontend deployment:**
   - Trigger on push to `develop` branch
   - Build and deploy `apps/web` to Vercel
   - Pass environment variables as secrets

5. **Add deployment verification automation:**
   - Verify deployed app returns correct title ("Smart Commerce Platform")
   - Verify API connectivity (no CORS errors)
   - Verify authentication flow initializes

### 6.3 Optional (Medium Priority)

6. **Document the deployment process:**
   - Create `docs/deployment/FRONTEND-STAGING-DEPLOYMENT.md`
   - Include Vercel project setup steps
   - Include environment variable configuration
   - Include rollback procedures

7. **Clean up the UFLIP deployment:**
   - Disconnect `buyer-staging.vercel.app` from UFLIP app
   - Or delete the Vercel project if not needed
   - Prevent confusion about which app is the SCS buyer client

---

## 7. Conclusion

The SCS Platform buyer application is **architecturally sound** and **deployment-ready** from a code perspective. The application has proper authentication, environment configuration, and build settings.

However, **no deployment infrastructure exists**. The critical blockers are:
1. CORS not configured on staging API
2. No Vercel deployment configuration
3. No automated deployment workflow

The existing `buyer-staging.vercel.app` is a **red herring** — it serves a completely different application (UFLIP) and should not be used for the SCS buyer deployment.

**Recommendation:** Create a new Vercel project for the SCS buyer app, configure CORS on the staging API, and deploy to a distinct staging URL (e.g., `scs-buyer-staging.vercel.app`).

---

*Audit completed 2026-11-08. All findings verified by source code inspection and live API testing.*
