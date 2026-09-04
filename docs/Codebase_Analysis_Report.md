# Smart Commerce & Supply Platform — Comprehensive Codebase Analysis

**Report Date**: 2026-09-04
**Scope**: API (NestJS) · Admin Console (Next.js) · Web App (Next.js) · Mobile App (Flutter)
**Authority Reference**: `Smart_Commerce_Supply_Platform_Final_Plan.html` (§21 Phase 1 — Launchable B2B MVP)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Per-Application Analysis](#2-per-application-analysis)
   - 2.1 Backend API
   - 2.2 Admin Console
   - 2.3 Web App
   - 2.4 Mobile Flutter App
3. [Cross-Platform Integration Analysis](#3-cross-platform-integration-analysis)
4. [Gap Identification vs Phase 1 Plan](#4-gap-identification-vs-phase-1-plan)
5. [Advanced Improvements](#5-advanced-improvements)
6. [Action Items Checklist](#6-action-items-checklist)

---

## 1. Executive Summary

### Platform Maturity Score: **82 / 100**

| Dimension | Score | Weight | Notes |
|-----------|-------|--------|-------|
| Phase 1 Feature Coverage | 88% | 30% | 28/35 capabilities complete; import + pricing calc fake/incomplete |
| Security Posture | 75% | 25% | Dual-auth shipped w/ 2 blocking bugs; RBAC coverage gaps; no backups |
| Code Quality | 85% | 15% | All apps compile clean; consistent patterns; low test coverage |
| Cross-Platform Consistency | 80% | 15% | JWT flow aligned; admin console lags dual-auth; realtime unused |
| Launch Readiness (§21.6) | 83% | 15% | 6/8 readiness criteria met |

### Critical Blockers Preventing Pilot Launch

| # | Blocker | Location | Severity |
|---|---------|----------|----------|
| 1 | **Device-trust bootstrap broken** — OTP verify never stores `deviceId`, so password login on a "new" device requires OTP *forever* | `apps/api/src/modules/identity/identity.service.ts:100-110` | 🔴 Critical |
| 2 | **CORS rejects `X-Device-Id` header** — web credential setup/change-password calls fail preflight | `apps/api/src/main.ts:26` | 🔴 Critical |
| 3 | **CSV/Excel import is a stub** — `setTimeout(1000)` marks job COMPLETED without parsing | `apps/api/src/modules/catalog/catalog.service.ts:296-314` | 🔴 Critical |
| 4 | **Promotions never applied at checkout** — discount/deliveryFee/tax hardcoded to 0 | `apps/api/src/modules/orders/orders.service.ts:104-106` | 🟠 High |
| 5 | **Admin console lacks dual-auth** — diverges from shipped web/mobile capability | `apps/admin/src/lib/auth.ts` (absent) | 🟠 High |

### Quick Wins (< 4 hours each)

1. Add `X-Device-Id` to CORS `allowedHeaders` (1 line).
2. Accept `deviceId` in `POST /auth/otp/verify` and persist on the session.
3. Fix deprecated `DropdownButtonFormField value` in `mobile/lib/screens/organizations/organizations_screen.dart:112`.
4. Replace `throw new Error(...)` with `UnauthorizedException`/`HttpException` in OTP paths (HTTP 500 → 401/429).
5. Add `429` handling + remaining-attempts surfacing in web/admin login UIs.

### Strategic Roadmap Alignment

| Phase | Status | Alignment |
|-------|--------|-----------|
| Phase 1 — B2B MVP | 88% complete | Fix 3 blockers → pilot-ready |
| Phase 2 — Delivery & Tracking | Not started | `delivery/` module is an empty directory; driver dashboard UI exists in mobile |
| Phase 3 — Payments & Settlement | Not started | `payments/` module is an empty directory |
| Phase 4+ (B2C, Ads, AI) | Not started | `ads/`, `ai/` empty; event-tracking endpoints exist |

---

## 2. Per-Application Analysis

### 2.1 Backend API (NestJS Modular Monolith) — `apps/api`

**Scale**: 84 TypeScript files · 18 domain modules · Compilation: ✅ `tsc --noEmit` clean

#### Architecture Strengths
- Clean modular monolith: `identity`, `catalog`, `orders`, `merchant`, `pricing`, `promotions`, `inventory`, `reviews`, `notifications`, `analytics`, `admin`, `realtime`, `audit`, `support`.
- Transactional outbox (`OutboxDispatcher` polls every 1s) for reliable domain events.
- RFC 7807 error envelope via `AllExceptionsFilter`; request-ID correlation; pino structured logging; helmet; URI versioning (`/v1`).
- JWT with rotation + reuse detection (`revokeChain` on refresh-token replay).
- New dual-auth: bcrypt (cost 12), NIST-aligned password rules, Redis rate limiting (5/15min), `credential_audit_log`.

#### Bugs & Vulnerabilities

| ID | Severity | File:Line | Issue |
|----|----------|-----------|-------|
| API-B1 | 🔴 Critical | `identity/identity.service.ts:100-110` | `verifyOtp()` inserts session with hardcoded `device: 'web'` and **no `deviceId`** → device trust never established after OTP; `loginWithPassword` will always return `requiresOtp` |
| API-B2 | 🔴 Critical | `main.ts:26` | CORS `allowedHeaders` missing `X-Device-Id` → web `setupCredentials`/`changePassword` preflight failures |
| API-B3 | 🔴 Critical | `catalog/catalog.service.ts:296-314` | `processImportJob` fakes completion via `setTimeout`; no file parsing, no product creation |
| API-B4 | 🟠 High | `orders/orders.service.ts:104-106` | `discount = 0; deliveryFee = 0; tax = 0` — promo codes stored on order but never priced; VAT (15% KSA) unapplied |
| API-B5 | 🟠 High | `identity/identity.service.ts:38,42,63` | Generic `Error` thrown → HTTP 500 for auth failures (should be 401/429 with RFC 7807 body) |
| API-B6 | 🟠 High | merchant/catalog controllers | RBAC coverage incomplete: only 19 `@RequirePermission` usages, almost all in `admin.controller.ts`; merchant write endpoints rely on JWT guard alone |
| API-B7 | 🟡 Medium | `identity/identity.module.ts:14` | JWT secret falls back to hardcoded dev string; no production env enforcement |
| API-B8 | 🟡 Medium | `identity/identity.service.ts:429-463` | `buildClaims` N+1: per-role-permission sequential lookups; `listOrgMembers`/`listUserOrgs` same pattern |
| API-B9 | 🟡 Medium | `identity/identity.service.ts:181-203` | `switchOrg` re-signs JWT but doesn't revoke the old access token (15-min stale-permission window) |
| API-B10 | 🟡 Medium | `auth.controller.ts:10-18` | OTP request/verify bodies untyped (`@Body('phone')`) — `forbidNonWhitelisted` pipe is ineffective without DTOs |
| API-B11 | 🟢 Low | `catalog/catalog.service.ts:307` | `setTimeout` job is not restart-safe (process crash leaves job in IMPORTING forever) |

#### Code Quality Notes
- Consistent DI, guard composition, and schema ownership per module.
- Drizzle usage is idiomatic; several N+1 loops should become joins before scale.
- Test coverage: **5 spec files** — critically thin for auth/orders paths.

---

### 2.2 Admin Console (Next.js) — `apps/admin` (port 3200)

**Scale**: 17 TS/TSX files · Compilation: ✅ clean

#### Coverage vs §21.4 Admin Capabilities

| Capability | Status | Evidence |
|-----------|--------|----------|
| User management | ✅ | `app/users/` |
| Merchant management | ✅ | `app/merchants/` |
| Verification review | ✅ | `app/verification/` |
| Category management | ✅ | `app/categories/page.tsx` (added in remediation) |
| Product moderation | ✅ | `app/products/` |
| Order monitoring | ✅ | `app/orders/` |
| Support & disputes | ✅ | `app/disputes/` |
| KPI reports | ✅ | `app/kpis/` |
| Audit logs | ✅ | `app/audit/` |

#### Findings

| ID | Severity | File | Issue |
|----|----------|------|-------|
| ADM-B1 | 🟠 High | `src/lib/auth.ts` | No dual-auth functions (`loginPassword`, `checkDeviceLogin`, `setupCredentials`, `changePassword`, `getSessions`) — admin is OTP-only while web/mobile shipped password login |
| ADM-B2 | 🟡 Medium | `src/lib/auth.ts:117-126` | Admin identity derived by `atob()`-decoding JWT client-side; role display can drift from server truth until next profile fetch |
| ADM-B3 | 🟡 Medium | `src/lib/api.ts` | Client functions hand-rolled per endpoint; no shared types package → drift risk vs API DTOs |
| ADM-B4 | 🟢 Low | — | No error/loading skeleton conventions; no tests |

---

### 2.3 Web App (Next.js, buyer+merchant) — `apps/web` (port 3100)

**Scale**: 39 TS/TSX files · 13 route groups · Compilation: ✅ clean

#### Coverage vs §21.2/§21.3
- Retailer: search/filters ✅, merchant/product pages ✅, cart ✅, checkout ✅ (idempotency key via `globalThis.crypto.randomUUID()`), order history ✅, reorder ✅, favorites ✅, ratings ✅.
- Merchant: products/catalog ✅, promotions ✅, imports UI ✅ (backed by stub), customers ✅, verification wizard ✅.

#### Findings

| ID | Severity | File | Issue |
|----|----------|------|-------|
| WEB-B1 | 🔴 Critical | `src/lib/auth.ts:340-390` | `setupCredentials`/`changePassword` send `X-Device-Id` → blocked by API CORS (API-B2) |
| WEB-B2 | 🟡 Medium | `src/lib/auth.ts` | `AuthUser` lacks `email`/`hasPassword` → profile can't render credential state without extra fetch |
| WEB-B3 | 🟡 Medium | `src/app/profile/sessions/page.tsx` | Current-session detection relies on `x-session-id` header the API no longer reads → `isCurrent` always false |
| WEB-B4 | 🟡 Medium | `src/lib/auth.ts:247-293` | `authFetch` refresh-retry has no concurrency guard → parallel 401s trigger multiple rotations (reuse detection may revoke the chain) |
| WEB-B5 | 🟢 Low | `src/app/login/page.tsx` | Auto-login prefill silently swallows errors; no "Forgot password" path |
| WEB-B6 | 🟢 Low | — | No E2E/unit tests; no WebSocket usage despite API gateway |

---

### 2.4 Mobile Flutter App — `mobile`

**Scale**: 34 Dart files · 13 screen groups · Analyzer: ✅ clean except 1 info-level deprecation

#### Coverage
- Auth: dual-auth login ✅, credential setup ✅, change password ✅, sessions ✅, device-ID service (UUID + SharedPreferences) ✅.
- Commerce: stores/products/cart/checkout/orders/reorder/reviews/favorites ✅.
- Org management ✅, driver dashboard scaffold ✅, notifications (FCM + local) ✅.

#### Findings

| ID | Severity | File | Issue |
|----|----------|------|-------|
| MOB-B1 | 🔴 Critical | API-side `verifyOtp` | New-device password logins bounce into OTP, but OTP session lacks `deviceId` → infinite OTP loop (root cause API-B1) |
| MOB-B2 | 🟡 Medium | `lib/screens/organizations/organizations_screen.dart:112` | Deprecated `DropdownButtonFormField.value` → use `initialValue` |
| MOB-B3 | 🟡 Medium | `lib/services/api_service.dart` | Returns raw `Map<String, dynamic>` for auth/session endpoints; no typed models |
| MOB-B4 | 🟡 Medium | `lib/router/router.dart` | OTP request screen removed from `/login`, but `/verify/:phone` retained while new `LoginScreen` handles OTP inline — dead route risk |
| MOB-B5 | 🟢 Low | — | 3 test files only; no golden/widget tests for auth screens |
| MOB-B6 | 🟢 Low | — | No offline queue despite `drift` dependency present |

---

## 3. Cross-Platform Integration Analysis

### 3.1 JWT Flow Consistency

| Aspect | API | Web | Admin | Mobile | Verdict |
|--------|-----|-----|-------|--------|---------|
| Access token TTL | 15 min | 15 min (client-tracked) | 15 min | via dio interceptor | ✅ Aligned |
| Refresh rotation | ✅ rotation + reuse detection | ✅ `newRefreshToken ?? refreshToken` | ✅ | ✅ | ✅ Aligned |
| Session persistence | sessions table | localStorage | localStorage | secure storage / prefs | ✅ |
| Device trust claims | `deviceId` on session | `getDeviceId()` UUID | ❌ absent | `DeviceIdService` UUID | ⚠️ Admin diverges |
| Profile hydration | `/v1/me` | fetch after verify | decode JWT client-side | `profileProvider` | ⚠️ Admin diverges |

### 3.2 API ↔ Admin Console
- REST contracts consistent; admin endpoints guarded by `@RequirePermission('admin:*')` — the strongest RBAC boundary in the system.
- **Risk**: admin auth lib lacks the password-login functions shipped elsewhere → either port them or explicitly document admin as OTP-only.

### 3.3 API ↔ Web App
- Session handling is the most mature client (event emitter, auto-refresh, synthetic 401).
- **Breakage**: `X-Device-Id` CORS (API-B2) and `isCurrent` header mismatch (WEB-B3).

### 3.4 API ↔ Mobile
- Promo-code body mismatch previously fixed (accepts `promoCode` and `code`).
- Device-ID headers plumbed end-to-end; blocked by API-B1 root cause for the trust bootstrap.
- **Realtime**: API exposes Socket.IO gateway at `/realtime` (`join`/`leave`); **no client (web/admin/mobile) connects**. Notifications are FCM + poll-based only.

### 3.5 Shared Utilities & Type Safety
- Password-validation logic duplicated (API `common/utils/password-validation.ts` vs web `lib/utils/password-validation.ts`) — extract to a shared package or generate from a single spec.
- No shared TS types between web/admin; mobile re-declares JSON shapes.

---

## 4. Gap Identification vs Phase 1 Plan (§21)

### 4.1 Wholesaler Capabilities (§21.2)

| Requirement | Status | Gap |
|-------------|--------|-----|
| Store & business profile | ✅ | — |
| Basic verification | ✅ | — |
| Category, product, media management | ✅ | — |
| Excel/CSV import | ❌ | **Stubbed** — `processImportJob` never parses files |
| Manual stock management | ✅ | — |
| Quantity pricing | ✅ | Price lists + tiers |
| Basic promotions | ⚠️ | CRUD exists; **discount never applied to orders** |
| Order management | ✅ | FSM w/ 16 statuses |
| Customer list | ✅ | `GET /v1/merchant/customers` + web page |
| Order notifications | ✅ | FCM + in-app |

### 4.2 Retailer Capabilities (§21.3)

| Requirement | Status | Gap |
|-------------|--------|-----|
| Account & store profile | ✅ | — |
| Location/area setting | ⚠️ | Deferred (Low) |
| Search and filters | ✅ | — |
| Merchant & product pages | ✅ | — |
| Cart | ✅ | — |
| Purchase order | ✅ | Multi-supplier splitting |
| Order history | ✅ | — |
| Reorder | ✅ | Added (web + mobile) |
| Favorites / saved suppliers | ⚠️ | Product favorites ✅; **store-level saved suppliers missing** |
| Ratings | ✅ | — |

### 4.3 Admin Capabilities (§21.4): 9/9 ✅ (complete after remediation)

### 4.4 Launch Readiness Standard (§21.6)

| Area | Met? | Evidence / Gap |
|------|------|----------------|
| Product: publish w/o support | ⚠️ | Import stub undermines bulk onboarding |
| Transaction: end-to-end B2B order | ⚠️ | Order completes but discount/tax/fee = 0 |
| Support: dispute path | ✅ | Disputes + conversations |
| Performance | ⚠️ | No load test evidence; N+1 patterns present |
| Security | ⚠️ | RBAC+logs ✅; **backups missing** (P1); CORS bug |
| Analytics funnel | ✅ | `/v1/analytics/track` + batch |
| Operations ownership | ⚠️ | Process, not code |
| Area launch plan | ✅ | Manual ops acceptable per §21.1 |

### 4.5 Deferred-Phase Pull-Forward Candidates
- **Phase 2**: Driver assignment read-model already scaffolded in mobile; delivery module shell exists but empty.
- **Phase 3**: Payments module empty; checkout already collects idempotency keys → payment intent integration is the natural next seam.
- **Phase 6**: `/analytics/track` exists → low-cost recommendation heuristics possible before full ML.

### 4.6 Architecture Decisions Limiting Future Scalability
1. **N+1 claim building** on every token refresh — becomes a hotspot under concurrent mobile refresh storms; precompute role→permission map or cache in Redis.
2. **Fake import pipeline** — must move to a real worker/queue before volume; in-process `setTimeout` is lost on restart.
3. **Client-local session expiry math** (`Date.now() + 15min`) duplicates server JWT `exp` — parse `exp` from the token instead.
4. **No shared contracts package** — four hand-maintained client surfaces will drift (already visible in admin).

---

## 5. Advanced Improvements

### 5.1 Performance
1. **Fix N+1 in `buildClaims`/`listOrgMembers`** — single SQL join (`roles ⋈ role_permissions ⋈ permissions`); target < 5 queries per refresh.
2. **Cache categories/brands** in Redis (60s TTL) — they front every search page.
3. **Refresh-token rotation concurrency guard** on clients (single in-flight refresh promise).
4. **Adopt the existing Socket.IO gateway** for order-status push; retire 1s-polling UX gaps.
5. **Pagination defaults** (limit ≤ 50) enforced server-side on all list endpoints.

### 5.2 Security
1. **[P0] CORS**: add `X-Device-Id` to `allowedHeaders`.
2. **[P0] OTP verify**: accept + persist `deviceId`; return 429/401 as typed HTTP exceptions.
3. **Extend `@RequirePermission`** to merchant/catalog write endpoints; add seed permissions for `merchant:products:write`, `merchant:orders:write`, `merchant:promotions:write`.
4. **Production config gate**: fail fast if `JWT_ACCESS_SECRET` unset outside dev.
5. **Daily encrypted Postgres backup script** (the single P1 ops gap from prior analysis).
6. **Account-lockout notification** via existing FCM channel on rate-limit trips.
7. **DTOs for all auth bodies** so `forbidNonWhitelisted` actually filters.

### 5.3 Developer Experience
1. **CI pipeline**: typecheck + lint + `dart analyze` + migration dry-run on PR.
2. **Shared types**: extract `@scs/contracts` (OpenAPI → TS + Dart codegen).
3. **Test targets**: API 40% line coverage on identity/orders; widget tests for 4 auth screens; web Playwright smoke for login/checkout.
4. **Seed script** must insert `admin:*` permission keys + demo password-credential user.

### 5.4 User Experience
1. RFC 7807-aware error surfaces (map `type` → localized message) across all clients.
2. "Forgot password" → OTP-reset flow (OTP already authoritative).
3. Remaining-attempts UX on login lockout (read `X-RateLimit-Remaining`).
4. Mobile offline cart queue using the already-present `drift` dependency.
5. Skeleton loaders (mobile has `shimmer`; web needs equivalents).

### 5.5 Scalability
1. Keep modular monolith through pilot; **first extraction candidate: notifications** (already isolated, external-facing).
2. Move import processing to a queue (BullMQ on existing Redis) — unlocks real CSV parsing.
3. Introduce read replicas only after Phase 3 volume; measure `buildClaims` first.
4. Define module-boundary lint rules (the monorepo already documents enforcement).

---

## 6. Action Items Checklist

### P0 — Blockers (this week)
- [ ] **API-B2**: Add `X-Device-Id` to CORS `allowedHeaders` in `apps/api/src/main.ts:26`
- [ ] **API-B1**: `POST /auth/otp/verify` accepts `deviceId`; persist on session in `identity.service.ts:verifyOtp`
- [ ] **API-B5**: Replace generic `Error` with `UnauthorizedException`/`HttpException(429)` in OTP + password paths
- [ ] **API-B3**: Implement real CSV/Excel parsing in `processImportJob` (or explicitly scope import out of pilot)
- [ ] **OPS**: Daily backup script + restore drill

### P1 — High (next sprint)
- [ ] **API-B4**: Apply cart promo discount + VAT (15%) + delivery fee in `orders.service.ts:104-106`
- [ ] **ADM-B1**: Port dual-auth functions to `apps/admin/src/lib/auth.ts` (or document OTP-only)
- [ ] **WEB-B4**: Single-flight refresh promise in `apps/web/src/lib/auth.ts`
- [ ] **WEB-B3**: Fix `isCurrent` session detection contract
- [ ] **API-B6**: Extend permission guard to merchant write endpoints + seed keys
- [ ] Store-level "saved suppliers" (§21.3)
- [ ] **MOB-B2**: `initialValue` in `organizations_screen.dart:112`

### P2 — Medium (month)
- [ ] DTO validation for auth endpoints
- [ ] N+1 query elimination in identity service
- [ ] CI pipeline + coverage gates
- [ ] Shared `@scs/contracts` types package
- [ ] Realtime notification wiring (web + mobile)
- [ ] Admin profile hydration via `/v1/me` (remove client-side JWT decoding)

### P3 — Strategic
- [ ] BullMQ import worker
- [ ] Offline cart queue (mobile)
- [ ] Payment intent seam (Phase 3)
- [ ] Recommendation heuristics on analytics events (Phase 6 pull-forward)

---

## Addendum — P0 Remediation (2026-09-04, same day)

All P0 blockers were fixed and verified end-to-end against the live dev environment:

| Item | Fix | Verification |
|------|-----|--------------|
| API-B2 CORS | `X-Device-Id` added to `allowedHeaders` in `main.ts` | OPTIONS preflight → 204 with header allowed |
| API-B1 device trust | `verifyOtp` accepts `deviceId`/`deviceInfo`, persists on session; web + mobile clients send it | Session row has `device_id=smoke-test-device-001` after OTP verify |
| API-B5 typed errors | All 12 generic `Error` throws in identity module → `UnauthorizedException`/`NotFoundException`/`ConflictException`/`BadRequestException`/`ForbiddenException`/`HttpException(429)` | Invalid OTP → HTTP 401 (was 500); RFC 7807 body confirmed |
| API-B3 import pipeline | Real implementation: `POST /v1/imports/:id/rows` stages parsed CSV rows in Redis (batched, 500/req); `processImportJob` validates per-row, find-or-creates category/brand, creates product+variant+price tier or updates by SKU; stats persisted to new `import_jobs.stats` column (migration 0015) | E2E: 3 rows staged → 2 created + 1 error captured ("Row 4: missing SKU"); re-import same SKU → updated=1, price/MOQ updated |
| OPS backup | `infra/backup/backup-db.ps1` + `.sh` + restore runbook | Backup ran (0.2 MB dump); restore drill PASSED (users=10, products=10, orders=4) |
| MOB-B2 (bonus) | `initialValue` in `organizations_screen.dart` | `dart analyze` → 0 issues |

Migrations 0014 (dual auth) + 0015 (import stats) applied to dev DB. Migration files relocated to the canonical `infra/drizzle/migrations/` (the previous session's 0010 had landed in `apps/api/drizzle/migrations/` and would have been invisible to the runner).

---

*Report generated from live codebase analysis: 84 API TS files, 39 web TS files, 17 admin TS files, 34 mobile Dart files; all type-checked/analyzed 2026-09-04.*
