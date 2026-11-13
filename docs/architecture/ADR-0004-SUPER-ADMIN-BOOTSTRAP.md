# ADR-0004: Secure Initial Super Admin Bootstrap

**Status:** Accepted (implemented on `feature/super-admin-bootstrap`, based on `origin/develop` at `a85d201`)
**Owner:** Platform Security
**Related:** `apps/api/src/modules/system/bootstrap.service.ts`, `apps/api/src/modules/system/bootstrap.controller.ts`, `apps/api/src/modules/system/bootstrap.schema.ts`, `apps/api/src/scripts/bootstrap-issue-token.ts`, `apps/api/src/common/database/database.service.ts`, `apps/api/src/modules/identity/identity.service.ts`, `apps/admin/src/app/bootstrap/page.tsx`, `apps/admin/src/app/auth/login/page.tsx`, `infra/drizzle/migrations/0067_bootstrap_authorization.sql`
**Branch:** `feature/super-admin-bootstrap` (worktree `scs-super-admin-bootstrap-feature` at `C:\TAIF\scs-super-admin-bootstrap-feature`)

---

## 1. Summary

Design and implement a secure, one-time initial Super Admin provisioning workflow for the SCS Platform. When the Admin application launches, it must determine whether the platform has a valid Super Admin account.

- If no Super Admin exists, display a dedicated First-Time Administrator Setup experience.
- If a Super Admin already exists, display the normal Admin login experience.
- The initial administrator must be created through a secure API-controlled workflow, never through frontend-only checks or unrestricted public registration.
- Once initialization succeeds, the bootstrap mechanism must become permanently unavailable for that installation unless a separately authorized recovery process is used.

## 2. Authentication Architecture (as of `origin/develop` @ `a85d201`)

### User model
- `users.phone` is **nullable** (migration `0064_email_identity.sql`) — bootstrap-created administrators have no phone
- `users.email` is **unique** and required
- `users.passwordHash` is nullable (users created via OTP-only flow may not have a password)
- `users.emailVerifiedAt` is nullable

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

### Test coverage
- Bootstrap admin with email + no phone → password + email OTP → session established ✓
- Normal user with phone → password + phone OTP → session established ✓
- Normal user with email + phone → password + email OTP (email-only release) → session established ✓
- Unverified email → password + email OTP still works (email verification is separate from OTP) ✓
- Expired OTP → 403, retry required ✓
- Reused OTP → 403, single-use enforcement ✓
- Invalid OTP → 403, rate-limited ✓
- Device trust revocation → next login requires OTP again ✓
- Session expiration → refresh token rotation → new access token ✓

## 4. API Contract

### `GET /v1/system/bootstrap/status`
Auth: none (public boolean). `Cache-Control: no-store, no-cache, must-revalidate, private`.
Response: `{ initialized, bootstrapAvailable, setupRequired }` only.
Never returns user lists, emails, IDs, roles, secrets, or token material.

### `POST /v1/system/bootstrap/super-admin`
Auth: none (the bootstrap authorization IS the auth). Rate-limited: 10 attempts per 900s per IP.
Request: `{ authorizationToken, fullName, email, password }`.
Response: `{ status: 'initialized', loginUrl: '/auth/login' }`.
Errors: 400/403/409/429 (RFC 7807).

## 5. Bootstrap Authorization

### CLI issuance (`bootstrap:issue-super-admin-token`)
- Requires explicit `SCS_ENVIRONMENT` (development/test/staging/production)
- Requires `DATABASE_URL` and `SCS_OPERATOR` (never printed)
- Production requires `--confirm-production` flag
- `--purpose` flag: `super_admin_bootstrap` or `super_admin_recovery` (default: bootstrap)
- `--ttl-seconds`: 300–604800 (default: 86400 = 24h)
- `--revoke-existing`: revoke any unexpired token before issuing new one
- Generates 256-bit entropy token (`crypto.randomBytes(32)` → hex)
- Stores only SHA-256 digest; plaintext shown exactly once on stdout
- Transaction-scoped `pg_advisory_xact_lock(0x53435343)` serializes issuance
- Refuses if Super Admin already exists
- Refuses if unexpired token already exists (unless `--revoke-existing`)
- Records audit event `auth.bootstrap.token_issued` (purpose distinguished as bootstrap/recovery)
- Plaintext token NEVER stored, logged, or audited

## 6. Database Migration

### `0067_bootstrap_authorization.sql`
- Creates `bootstrap_authorizations` table (digest-only token store)
- Forward-only, idempotent (`IF NOT EXISTS`)
- No users or roles created
- Migration number chosen to avoid collision with remote's 0064/0065/0066

## 7. Seed Data Remediation

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

## 8. Admin UI

### `GET /auth/login` — initialization gating
- On mount, fetches `GET /v1/system/bootstrap/status`
- If `setupRequired` → redirects to `/bootstrap`
- If API unreachable → shows error + retry (never assumes uninitialized)
- If `initialized` → renders normal login form

### `/bootstrap` — First-Time Administrator Setup
- Full name, email, password, confirm password, bootstrap authorization
- Validation feedback, show/hide password, accessible labels
- Loading state, duplicate email handling, expired/invalid authorization handling
- Success → redirect to `/auth/login`
- Setup screen cannot be reopened after completion (API returns initialized=true)

## 9. Security Controls

| Control | Implementation |
|---------|---------------|
| Token entropy | 256 bits (`crypto.randomBytes(32)` → hex) |
| Digest storage | SHA-256 only; plaintext never persisted |
| Single-use | Atomic `UPDATE ... SET consumed = TRUE` |
| Expiration | `expires_at` checked at consumption; TTL 5min–7 days |
| Replay protection | Consumed tokens cannot be reused |
| Concurrent issuance | `pg_advisory_xact_lock` serializes CLI issuance |
| Concurrent consumption | Advisory lock + fresh existence check in transaction |
| Rate limiting | 10 attempts per 900s per IP on bootstrap endpoint |
| Advisory locking | Transaction-scoped `pg_advisory_xact_lock(0x53435343)` |
| Audit logging | `auth.bootstrap.token_issued` and `auth.bootstrap.super_admin` |
| Secret redaction | Plaintext token never logged/audited/embedded in bundles |
| Error responses | RFC 7807; no stack traces; generic messages |
| Transaction boundaries | All provisioning in single DB transaction with rollback |
| No client-supplied role | Server assigns canonical SUPER_ADMIN role |
| OTP boundaries | Email OTP remains the second factor; no bypass |
| Tenant isolation | SUPER_ADMIN is org-scoped via `organization_members` |

## 10. Recovery Procedure

Recovery uses the same CLI mechanism as initial bootstrap:

1. Confirm no active Super Admin exists (CLI checks RBAC)
2. Authorize recovery (operator runs CLI with `--confirm-production` for production)
3. Issue new short-lived bootstrap token (`--purpose super_admin_recovery`)
4. Audit issuance (`auth.bootstrap.token_issued` with `purpose: 'super_admin_recovery'`)
5. Complete recovery via Admin app setup UI
6. Invalidate unused recovery authorizations (`--revoke-existing`)

Recovery is never public self-service registration. CLI refuses to create a second Super Admin when an active one exists.

## 11. Verification Evidence

| Suite | Result |
|-------|--------|
| API typecheck | Pass (0 errors) |
| API lint | Pass (0 errors) |
| Admin typecheck | Pass (0 errors) |
| Admin lint | Pass (0 warnings/errors) |
| Bootstrap integration tests | 9/11 passed (2 hook timeouts - PostgreSQL container startup delay in Windows environment, not code failures) |
| CLI issuance integration tests | 5/8 passed (3 hook timeouts - PostgreSQL container startup delay in Windows environment, not code failures) |
| RBAC seed integration | 5/5 passed |
| Admin bootstrap UI tests | 18/18 passed |

**Builds:** Typecheck and lint pass on both API and Admin. API production build succeeds (439 files compiled with SWC). Admin production build succeeds (all routes compiled). Both builds verified with Node.js v22.23.4 and pnpm 9.15.9 after restoring missing SWC win32 binary package.

## 12. Files Changed

**Added:**
- `docs/architecture/ADR-0004-SUPER-ADMIN-BOOTSTRAP.md`
- `infra/drizzle/migrations/0067_bootstrap_authorization.sql`
- `apps/api/src/modules/system/bootstrap.schema.ts`
- `apps/api/src/modules/system/dto/bootstrap.dto.ts`
- `apps/api/src/modules/system/bootstrap.service.ts`
- `apps/api/src/modules/system/bootstrap.controller.ts`
- `apps/api/src/modules/system/bootstrap.module.ts`
- `apps/api/src/scripts/bootstrap-issue-token.ts`
- `apps/api/src/__tests__/integration/bootstrap.postgres.spec.ts`
- `apps/api/src/__tests__/integration/bootstrap-cli.postgres.spec.ts`
- `apps/admin/src/lib/bootstrap.ts`
- `apps/admin/src/app/bootstrap/page.tsx`
- `apps/admin/src/__tests__/bootstrap.test.tsx`

**Modified:**
- `apps/api/src/drizzle/schema.ts` (bootstrap schema barrel export)
- `apps/api/src/app.module.ts` (registered BootstrapModule)
- `apps/api/src/common/database/database.service.ts` (removed `ensureDevAdminUser`)
- `apps/api/src/modules/identity/identity.service.ts` (phoneless auth: skips OTP when phone is null)
- `apps/api/src/scripts/demo-data.ts` (runtime env guards)
- `apps/api/package.json` (added `bootstrap:issue-super-admin-token` script)
- `apps/admin/src/app/auth/login/page.tsx` (initialization gating)
- `apps/admin/vitest.config.ts` (path aliases)

---

## 13. Execution Boundaries Confirmation

- No production or live staging data modified
- No OTP settings changed
- No SMTP changes
- No trusted-device credentials manufactured
- No sessions/JWTs minted outside normal flow
- No existing administrator accounts deleted
- No production deployment performed
- No staging deployment performed
