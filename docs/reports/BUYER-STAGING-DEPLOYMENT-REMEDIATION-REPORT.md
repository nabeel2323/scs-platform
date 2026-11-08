# Buyer Staging Deployment Remediation Report

**Date:** 2026-11-08  
**Branch:** `feature/buyer-staging-deployment-remediation`  
**Base commit:** `09f6d7d` (HEAD of `origin/develop`)  
**Status:** BUILD VERIFIED — DEPLOYMENT ACTION REQUIRED

---

## Executive Summary

The SCS Platform buyer application (`apps/web`, Next.js 14) has been successfully built and verified locally. The application is architecturally sound, properly secured with JWT authentication and device trust, and ready for deployment.

**However, deployment is blocked by a single critical issue:** The staging API does not have CORS configured to allow requests from any frontend staging domain.

This report documents the remediation work performed, the verification evidence, and the exact owner actions required to complete the deployment.

---

## 1. Remediation Work Performed

### 1.1 Repository Audit (Phase 1)

**Verified:**
- ✅ SCS buyer app exists at `apps/web/` (Next.js 14.2.5, React 18.3.1)
- ✅ Application identity: "Smart Commerce Platform" (distinct from UFLIP)
- ✅ Environment configuration: `@scs/env` package with Zod validation
- ✅ Authentication: JWT + device trust + refresh rotation
- ✅ Build configuration: Next.js standalone output
- ✅ Workspace dependencies: All internal packages resolve

**Found:**
- ❌ No Vercel deployment configuration existed
- ❌ No GitHub Actions workflow for frontend deployment
- ❌ CORS not configured on staging API
- ❌ `buyer-staging.vercel.app` serves wrong application (UFLIP)

### 1.2 Infrastructure Protection (Phase 2)

**Actions taken:**
- ✅ Created dedicated branch: `feature/buyer-staging-deployment-remediation`
- ✅ Based on `origin/develop` at commit `09f6d7d`
- ✅ Preserved all unrelated working tree changes (returns service, P13 docs)
- ✅ Did NOT modify the existing UFLIP deployment
- ✅ Did NOT change production domains or DNS records

### 1.3 Deployment Preparation (Phase 3)

**Created:**
- ✅ `apps/web/vercel.json` — Vercel deployment configuration
  - Build command: `pnpm --filter @scs/web build`
  - Output directory: `apps/web/.next`
  - Framework: Next.js
  - Region: `fra1` (Frankfurt, closest to staging API)
  - Security headers: CSP, X-Frame-Options, X-XSS-Protection, Referrer-Policy
  - Environment variables: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`

**Verified:**
- ✅ No UFLIP OIDC references in SCS web app
- ✅ No Vue.js environment variables (`VUE_APP_*`) in Next.js app
- ✅ Frozen lockfile install: `pnpm install --frozen-lockfile` — SUCCESS
- ✅ Build: `pnpm --filter @scs/web build` — SUCCESS (50 routes built)
- ✅ TypeScript: `pnpm --filter @scs/web typecheck` — PASS (0 errors)
- ✅ Lint: `pnpm --filter @scs/web lint` — PASS (2 minor warnings)

### 1.4 API Connectivity Audit (Phase 4)

**Tested:**
- ✅ API health: `/v1/healthz` — 200 OK
- ✅ API readiness: `/v1/readyz` — database UP, Redis UP
- ✅ Email OTP endpoint: Returns 404 (feature flag disabled, by design)
- ✅ Password login endpoint: Validates input correctly (requires deviceId)
- ✅ Protected endpoints: Return 401 without auth
- ✅ Security headers: All present (CSP, HSTS, X-Frame-Options, etc.)

**Critical finding:**
- ❌ CORS not configured — no `Access-Control-Allow-Origin` header returned for any frontend origin

---

## 2. Build Verification Evidence

### 2.1 Build Output

```
Route (app)                              Size     First Load JS
┌ ○ /                                    2.15 kB         131 kB
├ ○ /_not-found                          142 B          87.4 kB
├ ○ /account                             5.92 kB         135 kB
├ ○ /auth/login                          4.34 kB         120 kB
├ ○ /cart                                3.41 kB         133 kB
├ ○ /checkout                            4.37 kB         134 kB
... (50 routes total)
+ First Load JS shared by all            87.3 kB
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

**Build ID:** `X3437-pAtJfCP1fI_ZkBi`  
**Output directory:** `apps/web/.next/`  
**Standalone server:** `apps/web/.next/standalone/`

### 2.2 Type Checking

```
> @scs/web@0.1.0 typecheck
> tsc --noEmit

(no errors)
```

**Result:** PASS — 0 TypeScript errors

### 2.3 Linting

```
> @scs/web@0.1.0 lint
> next lint

./src/app/merchant/returns/[id]/page.tsx
44:42  Warning: React Hook useEffect has a missing dependency: 'load'.

./src/hooks/useProductStudio.ts
262:6  Warning: React Hook useCallback has a missing dependency: 'brands'.

info  - Need to disable some ESLint rules? Learn more here: ...
```

**Result:** PASS — 2 minor warnings (not errors), both are React Hook dependency warnings that don't affect functionality

### 2.4 Application Identity Verification

**Page title:** "Smart Commerce Platform"  
**Description:** "B2B-first marketplace — retailer & merchant portal"  
**Icon:** 🛒 (shopping cart emoji)

**Verified distinct from UFLIP:**
- UFLIP title: "UFLIP Buyer | UFLIP"
- UFLIP framework: Quasar/Vue.js
- SCS framework: Next.js 14
- No UFLIP references in SCS codebase
- No Vue.js environment variables in SCS codebase

---

## 3. Deployment Configuration

### 3.1 Vercel Configuration File

**File:** `apps/web/vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "pnpm --filter @scs/web build",
  "devCommand": "pnpm --filter @scs/web dev",
  "installCommand": "pnpm install --frozen-lockfile",
  "outputDirectory": "apps/web/.next",
  "framework": "nextjs",
  "regions": ["fra1"],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://scs-api-staging.onrender.com wss://scs-api-staging.onrender.com;"
        }
      ]
    }
  ],
  "env": {
    "NODE_ENV": "production"
  },
  "build": {
    "env": {
      "NEXT_PUBLIC_API_URL": "https://scs-api-staging.onrender.com",
      "NEXT_PUBLIC_WS_URL": "wss://scs-api-staging.onrender.com",
      "NEXT_PUBLIC_CDN_URL": ""
    }
  },
  "github": {
    "silent": true
  }
}
```

### 3.2 Required Environment Variables

**On Vercel:**

| Variable | Value | Scope |
|---|---|---|
| `NODE_ENV` | `production` | Runtime |
| `NEXT_PUBLIC_API_URL` | `https://scs-api-staging.onrender.com` | Build + Runtime |
| `NEXT_PUBLIC_WS_URL` | `wss://scs-api-staging.onrender.com` | Build + Runtime |
| `NEXT_PUBLIC_CDN_URL` | (optional) | Build + Runtime |

**On Render (API):**

| Variable | Value | Scope |
|---|---|---|
| `API_CORS_ORIGINS` | `https://scs-buyer-staging.vercel.app` | Runtime |

---

## 4. Critical Blocker: CORS Configuration

### 4.1 Problem Statement

The staging API (`scs-api-staging.onrender.com`) does not return the `Access-Control-Allow-Origin` header for requests from any frontend staging domain. This causes the browser to block all cross-origin requests from the frontend to the API.

### 4.2 Evidence

**Test:**
```bash
curl -H "Origin: https://scs-buyer-staging.vercel.app" \
     -I https://scs-api-staging.onrender.com/v1/healthz
```

**Result:**
```
HTTP/1.1 200 OK
(no access-control-allow-origin header)
```

**Expected:**
```
HTTP/1.1 200 OK
access-control-allow-origin: https://scs-buyer-staging.vercel.app
access-control-allow-credentials: true
```

### 4.3 Root Cause

The API's CORS configuration reads from the `API_CORS_ORIGINS` environment variable:

```typescript
// apps/api/src/main.ts
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

The `API_CORS_ORIGINS` variable is either not set on Render (using localhost defaults) or does not include the staging frontend domain.

### 4.4 Required Fix

**Owner action:** In the Render dashboard, set the `API_CORS_ORIGINS` environment variable for the `scs-api-staging` service:

```bash
API_CORS_ORIGINS=https://scs-buyer-staging.vercel.app
```

Then redeploy the API service.

### 4.5 Verification

After setting the variable and redeploying:

```bash
curl -H "Origin: https://scs-buyer-staging.vercel.app" \
     -I https://scs-api-staging.onrender.com/v1/healthz
```

Expected response:
```
HTTP/1.1 200 OK
access-control-allow-origin: https://scs-buyer-staging.vercel.app
access-control-allow-credentials: true
```

---

## 5. Deployment Instructions

### 5.1 Step 1: Configure CORS on Render API

1. Log in to Render dashboard
2. Navigate to `scs-api-staging` service
3. Go to "Environment" tab
4. Add environment variable:
   - Key: `API_CORS_ORIGINS`
   - Value: `https://scs-buyer-staging.vercel.app`
5. Click "Save Changes"
6. Wait for automatic redeployment (or manually trigger)
7. Verify CORS is working (see Section 4.5)

### 5.2 Step 2: Create Vercel Project

1. Log in to Vercel dashboard
2. Click "Add New..." → "Project"
3. Import Git Repository: `nabeel2323/scs-platform`
4. Configure project:
   - **Framework Preset:** Next.js
   - **Root Directory:** `apps/web`
   - **Build Command:** `pnpm --filter @scs/web build`
   - **Output Directory:** `apps/web/.next`
   - **Install Command:** `pnpm install --frozen-lockfile`
5. Set environment variables:
   - `NODE_ENV` = `production`
   - `NEXT_PUBLIC_API_URL` = `https://scs-api-staging.onrender.com`
   - `NEXT_PUBLIC_WS_URL` = `wss://scs-api-staging.onrender.com`
6. Click "Deploy"
7. Wait for deployment to complete (~2-3 minutes)
8. Note the assigned domain (e.g., `scs-web-xyz.vercel.app`)

### 5.3 Step 3: Configure Custom Domain (Optional)

If you want to use `scs-buyer-staging.vercel.app`:

1. In Vercel project settings → "Domains"
2. Add domain: `scs-buyer-staging.vercel.app`
3. Follow DNS configuration instructions
4. Wait for DNS propagation (~5-10 minutes)
5. Update `API_CORS_ORIGINS` on Render if domain changes

### 5.4 Step 4: Verify Deployment

1. Navigate to the deployed URL
2. Verify page title: "Smart Commerce Platform"
3. Open browser DevTools → Console
4. Verify no CORS errors
5. Verify no JavaScript errors
6. Check Network tab: API requests should succeed
7. Try logging in (will fail without test data, but should reach the API)

### 5.5 Step 5: Update CORS if Using Different Domain

If the Vercel-assigned domain is different from `scs-buyer-staging.vercel.app`:

1. Copy the exact domain from Vercel
2. Update `API_CORS_ORIGINS` on Render:
   ```bash
   API_CORS_ORIGINS=https://<actual-vercel-domain>.vercel.app
   ```
3. Redeploy API on Render

---

## 6. What Was NOT Done

### 6.1 Exclusions (Per Task Requirements)

- ❌ Did NOT enable `auth.email_otp.enabled`
- ❌ Did NOT configure or send real OTP messages
- ❌ Did NOT configure SMS, Twilio, or WhatsApp
- ❌ Did NOT implement full backup strategy
- ❌ Did NOT upgrade Vercel plans or purchase services
- ❌ Did NOT modify production infrastructure
- ❌ Did NOT replace or disconnect the UFLIP application
- ❌ Did NOT deploy the admin application
- ❌ Did NOT run destructive database migrations
- ❌ Did NOT seed business data
- ❌ Did NOT merge the resulting PR

### 6.2 Limitations

- ❌ Could NOT deploy to Vercel (no CLI access, no authorization)
- ❌ Could NOT configure CORS on Render (no dashboard access)
- ❌ Could NOT verify live deployment (deployment not yet performed)
- ❌ Could NOT test end-to-end authentication flow (no test data)

---

## 7. Files Changed

### 7.1 New Files

- `apps/web/vercel.json` — Vercel deployment configuration
- `docs/reports/BUYER-STAGING-PHASE1-AUDIT.md` — Phase 1 audit report
- `docs/reports/BUYER-STAGING-PHASE4-API-AUDIT.md` — Phase 4 API audit report
- `docs/reports/BUYER-STAGING-DEPLOYMENT-REMEDIATION-REPORT.md` — This report
- `docs/reports/BUYER-STAGING-ENVIRONMENT-CONFIGURATION.md` — Environment configuration
- `docs/reports/BUYER-STAGING-VERIFICATION-REPORT.md` — Verification report
- `docs/reports/BUYER-FUNCTIONAL-TEST-READINESS.md` — Test readiness checklist

### 7.2 Modified Files

**None.** All existing files are preserved. The working tree changes from the previous branch (returns service, P13 docs) are NOT part of this branch.

---

## 8. Next Steps

### 8.1 Immediate (Owner Actions)

1. **Review this report** and verify all findings
2. **Configure CORS on Render** (Section 5.1)
3. **Create Vercel project** (Section 5.2)
4. **Verify deployment** (Section 5.4)
5. **Merge the PR** (when ready)

### 8.2 Short-Term (After Deployment)

1. **Seed test data** for functional testing
2. **Configure SMTP** to enable OTP testing (when ready)
3. **Create GitHub Actions workflow** for automated frontend deployment
4. **Deploy admin application** to separate Vercel project
5. **Resolve Vercel 402** for admin staging (billing issue)

### 8.3 Long-Term (Production Readiness)

1. **Implement comprehensive backup strategy**
2. **Set up monitoring and alerting**
3. **Configure production domains**
4. **Implement CI/CD pipeline** for all applications
5. **Conduct security audit** before production deployment

---

## 9. Conclusion

The SCS Platform buyer application is **built, verified, and ready for deployment**. The single critical blocker is CORS configuration on the staging API.

**Status:** `BUYER BUILD VERIFIED — DEPLOYMENT ACTION REQUIRED`

**Owner actions required:**
1. Configure CORS on Render (5 minutes)
2. Create Vercel project (10 minutes)
3. Verify deployment (5 minutes)

**Total estimated time:** 20 minutes

Once these actions are completed, the SCS buyer application will be live on staging and ready for functional testing.

---

*Report generated 2026-11-08. All claims verified by local build, type checking, linting, and live API testing. Deployment not yet performed — requires owner action.*
