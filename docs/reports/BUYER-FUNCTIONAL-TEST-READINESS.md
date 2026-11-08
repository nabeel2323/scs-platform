# Buyer Staging — Functional Test Readiness

**Purpose:** Define the minimum functional-test checklist and prerequisite test data required to validate the SCS Platform buyer application (`apps/web`) once deployed to a dedicated staging frontend connected to `https://scs-api-staging.onrender.com`.

**Status:** PRE-DEPLOYMENT — not yet executable until CORS and Vercel deployment are completed by the platform owner.

---

## 1. Prerequisites

| Prerequisite | Status | Owner Action Required |
|---|---|---|
| `API_CORS_ORIGINS` set on Render staging API | BLOCKED | Add the Vercel project's production URL to the comma-separated list |
| SCS buyer app deployed to Vercel (separate from UFLIP) | BLOCKED | Create new Vercel project pointing to `apps/web/vercel.json` |
| Staging API health check passes (`/v1/readyz` → 200) | PASS | None |
| Staging API authentication endpoints respond | PASS | None |
| Test user account exists in staging database | UNKNOWN | Create via `/v1/auth/register` or database seed |
| Test merchant store with products exists | UNKNOWN | Seed or manually create via merchant portal |
| SMTP configured for email OTP (if testing OTP flows) | NOT CONFIGURED | Do NOT enable email OTP until SMTP is independently verified |

---

## 2. Test Environment URLs

| Component | URL | Notes |
|---|---|---|
| SCS Buyer Staging (new) | `https://<new-project>.vercel.app` | Must NOT be `buyer-staging.vercel.app` (that serves UFLIP) |
| SCS API Staging | `https://scs-api-staging.onrender.com` | Already live |
| UFLIP Buyer (existing, do not modify) | `https://buyer-staging.vercel.app` | Quasar/Vue.js — separate application |

---

## 3. Functional Test Checklist

### 3.1 Public Pages (No Authentication Required)

| # | Test Case | Expected Result | Priority |
|---|---|---|---|
| P-01 | Navigate to `/` (home page) | Page renders with "Smart Commerce Platform" title, no console errors | P1 |
| P-02 | Verify site logo and branding | SCS Platform logo/identity displayed (not UFLIP branding) | P1 |
| P-03 | Navigate to `/search` or category listing | Search page renders, accepts query input | P1 |
| P-04 | Browse product categories (if seeded) | Category navigation renders, links are clickable | P2 |
| P-05 | View product detail page (if products seeded) | Product title, description, images, pricing render | P1 |
| P-06 | Verify product attributes and variants display | Attribute table renders; variant selector works if variants exist | P2 |
| P-07 | Check product images load from CDN/S3 | Images display correctly (requires `S3_ENDPOINT` and bucket access) | P2 |
| P-08 | Verify pricing display (base price, offer price) | Price shown in correct currency format with minor-units conversion | P2 |
| P-09 | Test search functionality with query parameter | Results filter correctly; facets display if enabled | P2 |
| P-10 | Verify responsive layout (mobile viewport) | Navigation collapses to mobile menu; content reflows | P3 |

### 3.2 Authentication Flows

| # | Test Case | Expected Result | Priority |
|---|---|---|---|
| A-01 | Navigate to `/login` | Login form renders with phone and password fields | P1 |
| A-02 | Submit valid credentials (test user) | Redirect to dashboard/account page; session stored in localStorage | P1 |
| A-03 | Submit invalid credentials | Error message displayed; no session created | P1 |
| A-04 | Verify JWT tokens in localStorage after login | `scs_web_session` and `scs_web_user` keys present with valid JSON | P1 |
| A-05 | Navigate to `/register` | Registration form renders with required fields | P1 |
| A-06 | Submit registration with valid data | Account created; redirected to login or auto-authenticated | P2 |
| A-07 | Submit registration with duplicate phone | Error message indicating phone already registered | P2 |
| A-08 | Verify device trust header sent on login request | `X-Device-Trust-Proof` header present in network tab | P2 |
| A-09 | Test token refresh (wait for access token expiry or manually trigger) | Refresh succeeds silently; new tokens stored; user not logged out | P1 |
| A-10 | Test concurrent 401 handling (single-flight refresh) | Only ONE refresh request sent; parallel 401s share the rotation | P2 |
| A-11 | Verify login rate limiting (429 response) | `LoginRateLimitError` surfaced; retry-after message displayed | P3 |

### 3.3 Authenticated Buyer Flows

| # | Test Case | Expected Result | Priority |
|---|---|---|---|
| B-01 | View account/profile page after login | User profile data (name, phone, email, role) displayed correctly | P1 |
| B-02 | Add product to cart | Cart item count increments; cart page shows new item | P1 |
| B-03 | View cart page | All cart items listed with quantities, prices, totals | P1 |
| B-04 | Update cart item quantity | Total recalculates; backend reflects updated quantity | P2 |
| B-05 | Remove item from cart | Item removed; totals recalculated | P2 |
| B-06 | Proceed to checkout (if prepay enabled) | Checkout flow initiates; order summary displayed | P2 |
| B-07 | Place order (end-to-end) | Order confirmation displayed; order appears in order history | P2 |
| B-08 | View order history | Past orders listed with status, dates, totals | P2 |
| B-09 | View order detail | Line items, shipping address, payment status shown | P3 |
| B-10 | Test logout | Session cleared from localStorage; redirect to home/login | P1 |
| B-11 | Verify authenticated API calls include Authorization header | `Bearer <token>` present in network tab for protected endpoints | P1 |
| B-12 | Test organization switching (if user has multiple orgs) | Active org changes; permissions and UI update accordingly | P3 |

### 3.4 Error Handling and Edge Cases

| # | Test Case | Expected Result | Priority |
|---|---|---|---|
| E-01 | API unreachable (simulate network failure) | Graceful error message displayed; no unhandled exceptions | P1 |
| E-02 | CORS blocked (before API_CORS_ORIGINS is set) | Browser console shows CORS error; UI shows connection error | P1 |
| E-03 | Expired session (manual token tampering) | Redirect to login; stale localStorage cleared | P2 |
| E-04 | 404 page (navigate to unknown route) | Next.js 404 page renders; navigation back to home works | P3 |
| E-05 | Empty product catalog (no seeded data) | "No products found" or similar empty state renders gracefully | P2 |
| E-06 | Image load failure (S3 bucket misconfigured) | Broken image placeholder or alt text displayed; no crash | P3 |

---

## 4. Minimum Test Data Requirements

### 4.1 User Accounts

| Account | Purpose | Required Data |
|---|---|---|
| Buyer test user | Authentication and purchase flows | Phone, password, full name, email (optional), locale |
| Merchant owner | Verify buyer cannot access merchant UI | Phone, password, role=MERCHANT_OWNER, active org |
| Merchant staff | Verify role-based access | Phone, password, role=MERCHANT_STAFF, active org |
| Admin user | Verify admin gating | Phone, password, role=SUPER_ADMIN or ADMIN |

### 4.2 Catalog Data

| Entity | Purpose | Required Data |
|---|---|---|
| At least 1 category | Category navigation and filtering | Name, slug, parent (optional) |
| At least 5 products | Search, listing, and detail pages | Title, slug, description, status=ACTIVE, categoryId, storeId |
| Product images | Image rendering verification | At least 1 image per product uploaded to S3 |
| Product attributes | Attribute display verification | Color, size, or other attribute values |
| Product variants (optional) | Variant selector testing | At least 2 variants per product with different prices |

### 4.3 Store and Organization Data

| Entity | Purpose | Required Data |
|---|---|---|
| At least 1 active organization | Org context for all operations | Name, country, verificationStatus=VERIFIED |
| At least 1 active store | Product listing context | Slug, displayName, currency, timezone, status=ACTIVE |
| Price lists (optional) | Pricing verification | At least 1 ACTIVE price list covering test products |
| Merchant offers (optional) | Offer display verification | At least 1 ACTIVE offer per test product |

### 4.4 Feature Flags

| Flag | Required State | Rationale |
|---|---|---|
| `FLAGS_PREPAY_ENABLED` | `false` (initial) | Checkout flows require payment gateway; test without first |
| `FLAGS_B2C_ENABLED` | `false` or `true` | Depending on whether B2C buyer flows are in scope |
| `FLAGS_ADS_ENABLED` | `false` | Ads not relevant to core buyer testing |
| `auth.email_otp.enabled` | `false` | Email OTP not configured; do NOT enable without SMTP verification |

---

## 5. Test Execution Procedure

### Step 1: Verify Deployment

1. Confirm the Vercel project URL loads (not `buyer-staging.vercel.app`)
2. Open browser DevTools → Network tab
3. Navigate to the staging URL
4. Verify no CORS errors in console
5. Verify API calls go to `https://scs-api-staging.onrender.com`

### Step 2: Public Page Tests (P-01 through P-10)

1. Execute each public page test case
2. Record pass/fail with screenshots for failures
3. Note any console errors or network failures

### Step 3: Authentication Tests (A-01 through A-11)

1. Register a new test user or use pre-seeded credentials
2. Execute each auth test case in order
3. Verify localStorage contents after login
4. Monitor network tab for correct headers and token refresh

### Step 4: Buyer Flow Tests (B-01 through B-12)

1. Complete authentication first
2. Execute each buyer flow test case
3. Verify cart persistence across page reloads
4. Verify order creation if checkout is in scope

### Step 5: Error Handling Tests (E-01 through E-06)

1. Simulate failure conditions as described
2. Verify graceful degradation
3. Confirm no unhandled exceptions in console

---

## 6. Acceptance Criteria for Functional Test Completion

- [ ] All P1 test cases pass (13 cases across public, auth, buyer, and error handling)
- [ ] All P2 test cases pass or have documented defects (14 cases)
- [ ] P3 test cases executed where time permits (6 cases)
- [ ] No critical defects blocking core buyer journey (home → search → product → cart → checkout)
- [ ] Authentication flow fully validated (login, register, refresh, logout)
- [ ] CORS correctly configured (no cross-origin errors in browser console)
- [ ] All API calls route to staging API (not localhost or production)
- [ ] Test data seeded and documented for regression testing
- [ ] Defect register updated with any failures (link to STAGING-DEFECT-REGISTER.md)

---

## 7. Defect Reporting

Any failures discovered during functional testing must be recorded in `docs/reports/STAGING-DEFECT-REGISTER.md` with:

- Defect ID (incrementing from last entry)
- Severity (P1/P2/P3)
- Test case reference (from this document)
- Steps to reproduce
- Expected vs actual result
- Screenshots or console logs
- Environment details (browser, URL, timestamp)

---

## 8. Regression Testing

Once functional tests pass, the following regression scenarios should be automated or manually re-executed after each deployment:

1. **Smoke test:** Home page loads → Login → View profile → Logout (5 minutes)
2. **Catalog test:** Search → View product → Add to cart → View cart (10 minutes)
3. **Auth test:** Login → Wait 15 min → Verify still authenticated (token refresh) (20 minutes)
4. **Error test:** Disable API → Verify error handling → Re-enable API (5 minutes)

---

## 9. Sign-Off

| Role | Name | Date | Status |
|---|---|---|---|
| QA Lead | TBD | TBD | PENDING DEPLOYMENT |
| Product Owner | TBD | TBD | PENDING DEPLOYMENT |
| Engineering Lead | TBD | TBD | PENDING DEPLOYMENT |

**This document is not executable until Sections 1 (Prerequisites) are resolved.**
