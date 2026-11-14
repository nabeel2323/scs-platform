# ADR-0004: Secure Initial Super Admin Bootstrap (UI-Driven)

**Status:** Accepted (implemented on `feature/ui-driven-super-admin-bootstrap`, based on `origin/develop`)
**Owner:** Platform Security
**Related:** `apps/api/src/modules/system/bootstrap.service.ts`, `apps/api/src/modules/system/bootstrap.controller.ts`, `apps/api/src/modules/system/bootstrap.schema.ts`, `apps/api/src/modules/system/dto/bootstrap.dto.ts`, `apps/api/src/modules/system/bootstrap.module.ts`, `apps/api/src/scripts/bootstrap-issue-token.ts`, `apps/api/src/config/env-gate.ts`, `apps/api/src/main.ts`, `apps/api/src/common/database/database.service.ts`, `apps/api/src/modules/identity/identity.service.ts`, `apps/admin/src/app/bootstrap/page.tsx`, `apps/admin/src/lib/bootstrap.ts`, `apps/admin/src/app/auth/login/page.tsx`, `infra/drizzle/migrations/0067_bootstrap_authorization.sql`, `infra/drizzle/migrations/0068_bootstrap_owner_verification.sql`

---

## 1. Summary

Design and implement a secure, fully guided initial Super Admin provisioning workflow that can be completed entirely through the Admin UI — with no direct database access, SQL commands, terminal commands, manual token generation, or developer assistance.

- If no Super Admin exists, display a dedicated First-Time Administrator Setup experience driven by owner email verification.
- If a Super Admin already exists, display the normal Admin login experience.
- The initial administrator must be created through a secure API-controlled workflow, never through frontend-only checks or unrestricted public registration.
- Once initialization succeeds, the bootstrap mechanism becomes permanently unavailable for that installation unless a separately authorized recovery process is used.

## 2. Authentication Architecture (as of `origin/develop`)

### User model
- `users.phone` is **nullable** (migration `0064_email_identity.sql`) — bootstrap-created administrators have no phone
- `users.email` is **unique** and required
- `users.passwordHash` is nullable (users created via OTP-only flow may not have a password)
- `users.emailVerifiedAt` is nullable — stamped only after successful owner verification

### Authentication flows
- **`POST /v1/auth/login/password`** — email + password → device trust check → if untrusted, OTP via phone (if usable) OR email (if permitted by OTP_CHANNELS)
- **`POST /v1/auth/otp/request`** — phone OTP (gated by PHONE_OTP_UI_ENABLED flag, disabled in email-only release)
- **`POST /v1/auth/otp/email/request`** — email OTP (default channel for email-only release)
- **`POST /v1/auth/otp/verify`** — verify phone OTP
- **`POST /v1/auth/otp/email/verify`** — verify email OTP

### Device trust
- Server-issued via `deviceCredentials` table (SHA-256 digest only)
- `X-Device-Id` header is session provenance only — grants no trust
- `X-Device-Trust` proof header (constant value) is the CSRF control for device-trust cookie

### RBAC
- `SUPER_ADMIN` role exists with **all 87 permissions**
- Role resolved via `organizationMembers.roleId` → `roles.key`
- Super Admin is **organization-scoped**, not a global user flag

## 3. Phoneless Super Admin Authentication

### Decision: Password-only for phoneless accounts is **NOT** acceptable

The bootstrap-created administrator has `phone = NULL`. In the legacy architecture, `loginWithPassword` skipped OTP for phoneless users, which was an authentication bypass. In the current architecture:

- **Email OTP is the second factor** for phoneless accounts
- `loginWithPassword` returns `{ requiresOtp: true, otpEmail: "..." }` when device is untrusted and email channel is permitted
- The admin completes email OTP verification via `verifyEmailOtp`
- Device trust is then established via server-issued credential
- **No OTP bypass exists** — every login requires password + OTP on untrusted devices

## 4. Deployment Configuration: `SCS_BOOTSTRAP_OWNER_EMAIL`

The configured platform owner address is the **root of trust for initial ownership**. It is required for staging and production initial setup.

- **Required outside development/test** — the startup gate `assertBootstrapOwnerEmail()` fails closed if missing or invalid, refusing to boot a deployed platform that cannot be initialized.
- **Normalized** (lowercased, trimmed) at resolution; invalid format is a configuration error in every environment.
- **Never accepted as arbitrary visitor proof** — the bootstrap OTP is sent ONLY to this address, and any email that does not exactly match it is rejected with a generic error (no owner-address enumeration).
- **Never exposed publicly** — the API returns only a masked hint (first character of the local part + domain), e.g. `p****@example.com`.
- Documented in `.env.example` and validated by `config/env-gate.ts`.

### Startup gate
`assertBootstrapOwnerEmail()` is invoked from `apps/api/src/main.ts` bootstrap() alongside `assertJwtConfig()` and `assertOtpHmacConfig()`. A failing assertion stops the process before any listener opens.

## 5. API Contract

All bootstrap endpoints are unauthenticated (there is no session yet). The bootstrap authorization — issued internally after owner email verification, or out-of-band via the CLI break-glass path — is the authorization. They are rate-limited and return only the minimum information required by the Admin UI. No user data, role details, secrets, or the complete owner address is disclosed.

### `GET /v1/system/bootstrap/status`
Auth: none (public boolean). `Cache-Control: no-store, no-cache, must-revalidate, private`.
Response:
```ts
{
  initialized: boolean;
  bootstrapAvailable: boolean;
  setupRequired: boolean;
  ownerVerificationRequired: boolean;  // not initialized + owner configured + no usable authorization
  ownerEmailConfigured: boolean;       // SCS_BOOTSTRAP_OWNER_EMAIL is set
  ownerEmailHint: string | null;       // masked hint, safe to render
}
```
Never returns user lists, emails, IDs, roles, secrets, or token material.

### `POST /v1/system/bootstrap/owner-otp/request`
Auth: none. Rate-limited per owner email and per client IP (distributed Redis Lua scripts).
Request: `{ email }`.
Response: `{ success, deliveryStatus, possiblyDelivered?, emailHint }`.
- Sends a dedicated bootstrap OTP ONLY to `SCS_BOOTSTRAP_OWNER_EMAIL`.
- Rejects any email that does not exactly match the configured owner (generic error, no enumeration).
- Reuses the existing OTP infrastructure: HMAC-SHA256 challenge with per-challenge salt, `OtpDeliveryService`, challenge TTL, per-email/per-IP rate limits, under the distinct `bootstrap:otp:*` Redis namespace.

### `POST /v1/system/bootstrap/owner-otp/verify`
Auth: none. Rate-limited per client IP.
Request: `{ email, otp }`.
Response: `{ authorization, expiresInSeconds }`.
- Verifies the OTP (single-use, expiry enforced via atomic `VERIFY_AND_CONSUME`).
- On success, issues a short-lived (15 min), single-use bootstrap authorization: SHA-256 digest stored in `bootstrap_authorizations`, plaintext returned to the caller to hold in **frontend memory only**.
- The challenge is single-use, so concurrent verification serializes — at most one authorization is issued (no replay, no double-issuance).
- Returns the authorization grant only after successful owner verification.

### `POST /v1/system/bootstrap/super-admin`
Auth: none (the bootstrap authorization IS the auth). Rate-limited: 10 attempts per 900s per IP.
Request: `{ authorizationToken, fullName, email, password }`.
Response: `{ status: 'initialized', loginUrl: '/auth/login' }`.
Errors: 400/403/409/429 (RFC 7807).
- Consumes the authorization exactly once (SHA-256 digest match, unconsumed, unexpired) inside a transaction-scoped advisory lock.
- Sets `emailVerifiedAt` from the consumed authorization's owner-verification proof (null for CLI break-glass tokens).
- Creates the user, platform organization membership, and SUPER_ADMIN assignment atomically.
- Preserves audit logging (`auth.bootstrap.super_admin`).

## 6. Bootstrap Authorization Lifecycle

### UI-driven issuance
1. Platform owner requests OTP → `POST /v1/system/bootstrap/owner-otp/request` → OTP sent to `SCS_BOOTSTRAP_OWNER_EMAIL` only.
2. Owner enters OTP → `POST /v1/system/bootstrap/owner-otp/verify` → server verifies (single-use) and issues a short-lived single-use authorization; plaintext held in frontend memory only (never localStorage/sessionStorage/URL/analytics/logs).
3. Admin UI submits `{ authorizationToken, fullName, email, password }` → `POST /v1/system/bootstrap/super-admin` → authorization consumed atomically, Super Admin created with `emailVerifiedAt` stamped.

### CLI issuance (break-glass / recovery)
The existing `bootstrap-issue-token.ts` CLI remains as a restricted break-glass/recovery mechanism. It is NOT required for normal initial setup.
- Issues authorizations with no owner-verification proof (`emailVerifiedAt` stays null on the new user).
- Production requires `--confirm-production`; refuses if a Super Admin already exists.

### Boundaries
- Ordinary login OTPs are **not** reusable as bootstrap authorizations (distinct `bootstrap:otp:*` Redis namespace).
- Bootstrap authorizations are **not** reusable as login OTPs.
- The grant is single-use and short-lived; expired/consumed challenges cannot be replayed.

## 7. Database Migrations

### `0067_bootstrap_authorization.sql`
- Creates `bootstrap_authorizations` table (digest-only token store)
- Forward-only, idempotent (`IF NOT EXISTS`)
- No users or roles created

### `0068_bootstrap_owner_verification.sql`
- Adds `bootstrap_authorizations.email_verified_at` (nullable `TIMESTAMPTZ`)
- Stamped when an authorization is issued after successful owner OTP verification; NULL for break-glass / CLI-issued authorizations
- Copied to the new user's `email_verified_at` on consumption

## 8. Seed Data Remediation

### Removed: `ensureDevAdminUser()` from `database.service.ts`
- Was creating `admin@scsp.dev / Admin@2026!` (SUPER_ADMIN) on every dev/test startup
- **CRITICAL security fix** — no hardcoded default Super Admin remains

### Retained: `seed-pg.ts` (`db:seed`)
- Creates `permissions`/`roles`/`role_permissions` only — no users
- SUPER_ADMIN role defined with all 87 permissions
- Idempotent (`ON CONFLICT DO NOTHING`)

### Restricted: `demo-data.ts` (`db:demo`)
- Runtime guards: development/test only, `SCS_DEMO_SEED_CONFIRM=true` opt-in required
- Refuses production-like `DATABASE_URL`
- Creates predictable demo accounts (incl. Super Admin) — restricted to isolated dev/test

### Staging: `bootstrap-staging-platform.ts`
- Retained as documented staging behavior (creates `+966500000001` Super Admin)
- Recognized as `initialized=true` by the derived RBAC check

## 9. Admin UI

### `GET /auth/login` — initialization gating
- On mount, fetches `GET /v1/system/bootstrap/status`
- If `setupRequired` → redirects to `/bootstrap`
- If API unreachable → shows error + retry (never assumes uninitialized)
- If `initialized` → renders normal login form

### `/bootstrap` — Guided First-Time Administrator Setup (4 steps)
1. **Welcome and readiness** — explains initial setup, checks API/initialization readiness, reports missing deployment configuration (`SCS_BOOTSTRAP_OWNER_EMAIL` not set) clearly; blocked until configured.
2. **Verify platform ownership** — shows the masked configured owner email hint; sends a one-time code to that address only; OTP entry with resend countdown, expiry, and rate-limit messages; no operator token input.
3. **Create administrator** — full name, verified owner email (pre-filled, read-only), password + confirmation with strength feedback.
4. **Complete initialization** — success confirmation, then redirect to `/auth/login` (normal authentication flow; never bypassed).

- Professional responsive design, accessible controls and error messages (role="alert", labelled inputs).
- Loading, retry, expiry, success and failure states.
- No token input, no operator instructions, no client-side role selection, no sensitive server configuration disclosure.

## 10. Security Controls

| Control | Implementation |
|---------|---------------|
| Token entropy | 256 bits (`crypto.randomBytes(32)` → hex) |
| Digest storage | SHA-256 only; plaintext never persisted |
| Single-use | Atomic `UPDATE ... SET consumed = TRUE`; challenge deleted on verify |
| Expiration | `expires_at` checked at consumption; OTP 5 min, authorization 15 min |
| Replay protection | Consumed tokens and challenges cannot be reused |
| Concurrent issuance | Single-use challenge + transaction-scoped advisory lock |
| Concurrent consumption | Advisory lock + fresh existence check in transaction |
| Rate limiting | Per-owner-email + per-IP on OTP request/verify; per-IP on super-admin |
| Advisory locking | Transaction-scoped `pg_advisory_xact_lock(0x53435342)` |
| Audit logging | `auth.bootstrap.token_issued` (CLI), `auth.bootstrap.super_admin` |
| Secret redaction | Plaintext token/OTP/password never logged/audited/embedded |
| Error responses | RFC 7807; no stack traces; generic public errors (no enumeration) |
| Transaction boundaries | All provisioning in single DB transaction with rollback |
| No client-supplied role | Server assigns canonical SUPER_ADMIN role |
| Owner trust | OTP sent only to `SCS_BOOTSTRAP_OWNER_EMAIL`; masked hint only |
| OTP boundaries | Email OTP remains the second factor; no bypass |
| Tenant isolation | SUPER_ADMIN is org-scoped via `organization_members` |
| Fail-closed | Startup gate refuses to boot without a valid owner address outside dev/test |

## 11. Recovery Procedure

Recovery uses the same CLI mechanism as initial bootstrap (break-glass, not required for normal setup):

1. Confirm no active Super Admin exists (CLI checks RBAC)
2. Authorize recovery (operator runs CLI with `--confirm-production` for production)
3. Issue new short-lived bootstrap token (`--purpose super_admin_recovery`)
4. Audit issuance (`auth.bootstrap.token_issued` with `purpose: 'super_admin_recovery'`)
5. Complete recovery via Admin app setup UI
6. Invalidate unused recovery authorizations (`--revoke-existing`)

Recovery is never public self-service registration. CLI refuses to create a second Super Admin when an active one exists.

## 12. Verification Evidence

| Suite | Result |
|-------|--------|
| API typecheck | Pass (0 errors) |
| API lint | Pass (0 errors) |
| Admin typecheck | Pass (0 errors) |
| Admin lint | Pass (0 warnings/errors) |
| API production build | Pass (440 files compiled with SWC) |
| Admin production build | Blocked by Next.js 14 / Node 26 worker module resolution (environment, not code) |
| Bootstrap integration tests (PostgreSQL) | 9/11 passed (2 pre-existing hook timeouts - container startup delay) |
| Bootstrap service unit tests | 6/6 passed |
| Env-gate unit tests | 29/29 passed |
| Bootstrap API concurrency test | "concurrent bootstrap attempts produce exactly one Super Admin" — passed |
| Admin bootstrap UI tests | 18/18 passed |

**Builds:** Typecheck and lint pass on both API and Admin. API production build succeeds. Admin typecheck passes; Admin production build is blocked by a Next.js 14 + Node 26 internal worker resolution issue unrelated to these source changes.

## 13. Files Changed

**Added:**
- `docs/architecture/ADR-0004-SUPER-ADMIN-BOOTSTRAP.md` (this document, updated for UI-driven flow)
- `infra/drizzle/migrations/0068_bootstrap_owner_verification.sql`
- `apps/api/src/__tests__/unit/system/bootstrap.service.spec.ts`
- `apps/api/src/__tests__/unit/config/env-gate.spec.ts` (new bootstrap-owner-email cases)
- `apps/admin/src/__tests__/bootstrap.test.tsx` (rewritten for 4-step UI)

**Modified:**
- `apps/api/src/config/env-gate.ts` (added `resolveBootstrapOwnerEmail` / `assertBootstrapOwnerEmail`)
- `apps/api/src/main.ts` (wired `assertBootstrapOwnerEmail` into bootstrap)
- `apps/api/src/modules/system/bootstrap.service.ts` (owner OTP request/verify, extended status, emailVerifiedAt)
- `apps/api/src/modules/system/bootstrap.controller.ts` (owner-otp/request, owner-otp/verify routes)
- `apps/api/src/modules/system/bootstrap.module.ts` (NotificationsModule + RedisModule imports)
- `apps/api/src/modules/system/bootstrap.schema.ts` (emailVerifiedAt column)
- `apps/api/src/modules/system/dto/bootstrap.dto.ts` (extended status + OTP DTOs)
- `apps/api/src/__tests__/integration/bootstrap.postgres.spec.ts` (constructor arg update)
- `apps/admin/src/lib/bootstrap.ts` (OTP + super-admin client; no token persistence)
- `apps/admin/src/app/bootstrap/page.tsx` (4-step guided UI)
- `.env.example` (documented `SCS_BOOTSTRAP_OWNER_EMAIL`)

## 14. Execution Boundaries Confirmation

- No production or live staging data modified
- No OTP settings changed
- No SMTP changes
- No trusted-device credentials manufactured
- No sessions/JWTs minted outside normal flow
- No existing administrator accounts deleted
- No production deployment performed
- No staging deployment performed
- No Super Admin account created
- No bootstrap token issued
- No databases reset
- No Render/Vercel environment variables changed
- No PR merged
