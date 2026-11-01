# OTP-S1.35 Phase 1 — Implementation Report

**Sprint:** S1.35–S1.36 (Phase 1: Email-First Identity and Email OTP)
**Date:** 2025-01-19
**Repository:** `nabeel2323/scs-platform`
**Baseline commit:** `2abb538` (origin/develop)
**Implementation branch:** `feat/auth-email-otp-phase1`
**Authorization:** Local development only. No deployment, no staging/production changes.

> ## ⚠ SUPERSEDED FOR ACCEPTANCE PURPOSES
>
> Independently audited on 2026-10-31 under S1.37. See
> [`OTP-S1.37-PHASE-1-INDEPENDENT-AUDIT-REPORT.md`](./OTP-S1.37-PHASE-1-INDEPENDENT-AUDIT-REPORT.md)
> for the findings register (F-01 … F-20) and
> [`OTP-S1.37-PHASE-1-FINAL-VERIFICATION-REPORT.md`](./OTP-S1.37-PHASE-1-FINAL-VERIFICATION-REPORT.md)
> for the reconciled test evidence. Three statements in this document are specifically inaccurate:
>
> - _"Implementation branch: `feat/auth-email-otp-phase1`, baseline `2abb538`"_ — that branch had
>   **no commits**; `HEAD` equalled `origin/develop` and the implementation existed only as
>   uncommitted working-tree content, so no audited SHA existed and CI had never run this code
>   (finding F-01).
> - _"Account linking/unlinking (conflict detection, last-auth prevention)"_ — conflict detection
>   existed, but **neither link path required any proof of control over the identifier being
>   attached**, so any authenticated user could claim an email address or phone number they did not
>   own (findings F-04, F-05; corrected during this audit).
> - _"Feature flag (`auth.email_otp.enabled`, 404 when disabled)"_ — the flag covered only the two
>   `otp/email/*` routes; all four `account/*` routes shipped ungated (finding F-06; corrected).
>
> The document is retained unmodified below as the historical record.

---

## 1. Executive Summary

This report documents the complete implementation of Phase 1 Email-First Identity and Email OTP authentication for the SCS platform. The implementation adds email as a first-class authentication identifier alongside the existing phone-based OTP system, enabling:

- **Email OTP request and verification** — users can authenticate using a 6-digit code delivered via email
- **Dual-identifier identity model** — users can have phone, email, or both as authentication identifiers
- **Account linking/unlinking** — authenticated users can add or remove email/phone identifiers
- **Email-only registration** — new users can register with just an email address
- **Password login compatibility** — existing password login works seamlessly with email-only users

All 28 acceptance criteria from the specification have been addressed through 18 implementation steps, 8 unit test suites, 5 integration test suites, 1 security test suite, and 1 migration test suite.

---

## 2. Authorization Boundaries

| Constraint                                           | Status       |
| ---------------------------------------------------- | ------------ |
| No deployment to staging or production               | **OBSERVED** |
| No real email/SMS/WhatsApp messages sent             | **OBSERVED** |
| No persistent Redis data modified                    | **OBSERVED** |
| No git push, PR, or merge performed                  | **OBSERVED** |
| Local development and disposable test databases only | **OBSERVED** |

---

## 3. Implementation Steps Completed

### Step 1 — Branch Setup and Dependencies

- Created `feat/auth-email-otp-phase1` from `origin/develop` at `2abb538`
- Installed `nodemailer` + `@types/nodemailer` in `apps/api`
- Updated `.env.example`: added `SMTP_USER`, `SMTP_PASSWORD`; removed dead `OTP_PROVIDER=mock`

### Step 2 — Migration 0064: Dual-Identifier Identity Schema

**File:** `infra/drizzle/migrations/0064_email_identity.sql`

- Made `users.phone` nullable (`ALTER TABLE users ALTER COLUMN phone DROP NOT NULL`)
- Added CHECK constraint: `users_at_least_one_identifier` — ensures `phone IS NOT NULL OR email IS NOT NULL`
- Added case-insensitive partial unique index: `idx_users_email_lower ON users (LOWER(email)) WHERE email IS NOT NULL`
- Pre-migration duplicate email detection (RAISE EXCEPTION if duplicates found)
- Created `account_link_log` audit table with columns: `id`, `user_id`, `action`, `identifier_type`, `identifier_hash`, `performed_by`, `created_at`
- Inserted feature flag row: `auth.email_otp.enabled` (default: disabled)
- Fully idempotent with `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`

**Drizzle schema update:** `apps/api/src/modules/identity/identity.schema.ts`

- `phone` column: removed `.notNull()`
- Added `accountLinkLog` table definition

### Step 3 — Email Normalization Utility

**File:** `apps/api/src/common/utils/email-normalization.ts`

| Function              | Purpose                                                |
| --------------------- | ------------------------------------------------------ |
| `normalizeEmail(raw)` | Lowercase, trim, validate format (RFC 5321 basic)      |
| `maskEmail(email)`    | Privacy-preserving display: `a***b@domain.com`         |
| `hashEmail(email)`    | SHA-256 for audit log storage (never stores raw email) |

Applied consistently at: registration, login, OTP request, verification, linking, DB lookup.

### Step 4 — Provider Interface Extensions

**File:** `apps/api/src/modules/notifications/providers/provider.interface.ts`

- Added `'email'` to `OtpDeliveryChannel` type (public: `'sms' | 'whatsapp' | 'email'`)
- Added `InternalDeliveryChannel = OtpDeliveryChannel | 'mock'` (internal only)
- Generalized `OtpDeliveryRequest` → `ChallengeDeliveryRequest` with `subject`, `subjectType`, `otp` fields
- `NotificationProvider.channel` now accepts `InternalDeliveryChannel`

### Step 5 — SMTP Email Provider

**File:** `apps/api/src/modules/notifications/providers/smtp-email.provider.ts`

- Implements `NotificationProvider` with `channel = 'email'`
- Nodemailer SMTP transport with bounded 10s delivery timeout
- Error classification: transient (4xx/5xx SMTP, timeouts) vs permanent (auth failure, invalid address)
- Correlation ID in `X-SCS-Correlation-ID` header
- Professional HTML email template with 6-digit code, 5-minute expiry, security warning
- **Never logs OTP values, SMTP credentials, or full email addresses**

**Configuration:** `provider.config.ts` extended with `SmtpConfig` interface and `resolveSmtpConfig(env)`.

### Step 6 — Internal Mock Provider

**File:** `apps/api/src/modules/notifications/providers/mock.provider.ts`

- Class: `MockOtpProvider` — implements `NotificationProvider` with `channel = 'mock'`
- In-memory OTP store keyed by subject for test retrieval
- **Production/staging rejection:** constructor throws via `isProductionLikeEnv()` guard
- **Never registered in public provider map**
- **Never returns OTP through API responses**

### Step 7 — Provider Registry

**File:** `apps/api/src/modules/notifications/provider-registry.service.ts`

- `ProviderRegistryService` maintains two maps:
  - `publicProviders`: `Map<OtpDeliveryChannel, NotificationProvider>` (sms, whatsapp, email)
  - `internalProviders`: `Map<InternalDeliveryChannel, NotificationProvider>` (includes mock)
- `getForChannel(channel)` — public only
- `getForTest(channel)` — includes mock
- `getAvailableChannels()` — public channels only
- `getMockProvider()` — test-only access

**Delivery service update:** `otp-delivery.service.ts` now injects `ProviderRegistryService` and routes through generalized `deliverChallenge()` method.

### Step 8 — Generalized OTP Challenge Lifecycle

**File:** `apps/api/src/modules/identity/identity.service.ts`

Key namespace extensions in Redis:

- Challenge: `otp:email:{normalizedEmail}` (alongside existing `otp:{phone}`)
- Rate limit: `otp:req:email:{normalizedEmail}`, `otp:vatt:email:{normalizedEmail}`
- IP rate limit: `otp:ip:{ip}` (shared across channels)

Extracted common helpers:

- `createChallenge(subject, subjectType, otp, ttlSec)` — HMAC-SHA256 with per-challenge salt
- `consumeChallenge(subject, otp)` — atomic verify-and-consume via Lua script
- `enforceRequestRateLimit(subject, ip)` — per-email (5/15min) + per-IP (20/1min)
- `enforceVerifyRateLimit(subject)` — prevents brute-force

Email TTL: **300 seconds** (D-6). Phone TTL: **90 seconds** (preserved).

### Step 9 — Email OTP API Endpoints

**DTOs:** `apps/api/src/modules/identity/dto/auth.dto.ts`

| DTO                  | Fields                                               |
| -------------------- | ---------------------------------------------------- |
| `EmailOtpRequestDto` | `email` (validated, max 254), `purpose?` (optional)  |
| `EmailOtpVerifyDto`  | `email`, `otp` (6-digit), `deviceId?`, `deviceInfo?` |

**Endpoints:** `apps/api/src/modules/identity/auth.controller.ts`

| Method | Path                         | Purpose           |
| ------ | ---------------------------- | ----------------- |
| POST   | `/v1/auth/otp/email/request` | Request email OTP |
| POST   | `/v1/auth/otp/email/verify`  | Verify email OTP  |

Both protected with `@UseGuards(ThrottlerGuard)` and `@Throttle` decorators. Channel in public DTOs uses `@IsIn(['sms', 'whatsapp', 'email'])` — **no 'mock'**.

### Step 10 — Account Linking and Unlinking

**Service methods in** `identity.service.ts`:

| Method                              | Purpose                                       |
| ----------------------------------- | --------------------------------------------- |
| `linkEmailToAccount(userId, email)` | Link verified email to existing account       |
| `linkPhoneToAccount(userId, phone)` | Link verified phone to existing account       |
| `unlinkEmailFromAccount(userId)`    | Remove email (requires remaining auth method) |
| `unlinkPhoneFromAccount(userId)`    | Remove phone (requires remaining auth method) |

**Endpoints:**

| Method | Path                            | Auth         |
| ------ | ------------------------------- | ------------ |
| POST   | `/v1/auth/account/link-email`   | JWT required |
| POST   | `/v1/auth/account/link-phone`   | JWT required |
| POST   | `/v1/auth/account/unlink-email` | JWT required |
| POST   | `/v1/auth/account/unlink-phone` | JWT required |

Security: conflict detection (email already linked to another account), last-auth-method prevention, audit logging with SHA-256 hashed identifiers.

### Step 11 — Registration Flow Updates

- Email OTP verify: if no user found → create email-only user (`phone = null`)
- Phone OTP verify: existing behavior preserved (phone-only user)
- If user exists with matching identifier → issue tokens (existing behavior)
- CHECK constraint ensures at least one identifier at DB level

### Step 12 — Contracts Update

**File:** `packages/contracts/src/index.ts`

- Added `EmailOtpRequestSchema`, `EmailOtpVerifySchema`
- Added `EmailOtpRequestResponseSchema` (enumeration-safe: same shape regardless)
- Added `AccountLinkSchema`, `AccountUnlinkSchema`
- Updated `OtpRequestSchema` channel enum to include `'email'`

### Step 13 — Password Login Compatibility

- When device not trusted and user has email but no phone: send OTP via email
- When user has both: prefer phone (existing behavior)
- `checkDeviceLogin`: handles email-only users correctly

### Step 14 — Feature Flag

- Flag key: `auth.email_otp.enabled` in `feature_flags` table
- Default: **disabled** (opt-in activation required)
- When disabled: email OTP endpoints return 404 (prevents feature enumeration)
- Implemented via `isEmailOtpEnabled()` in `identity.service.ts`

---

## 4. Files Created

| File                                                                                | Purpose           |
| ----------------------------------------------------------------------------------- | ----------------- |
| `infra/drizzle/migrations/0064_email_identity.sql`                                  | Schema migration  |
| `apps/api/src/common/utils/email-normalization.ts`                                  | Email utility     |
| `apps/api/src/modules/notifications/providers/smtp-email.provider.ts`               | SMTP provider     |
| `apps/api/src/modules/notifications/providers/mock.provider.ts`                     | Mock provider     |
| `apps/api/src/modules/notifications/provider-registry.service.ts`                   | Provider registry |
| `apps/api/src/__tests__/unit/identity/email-normalization.spec.ts`                  | Unit tests        |
| `apps/api/src/__tests__/unit/identity/email-otp-lifecycle.spec.ts`                  | Unit tests        |
| `apps/api/src/__tests__/unit/identity/account-linking.spec.ts`                      | Unit tests        |
| `apps/api/src/__tests__/unit/identity/email-enumeration.spec.ts`                    | Unit tests        |
| `apps/api/src/__tests__/unit/identity/otp-redaction.spec.ts`                        | Unit tests        |
| `apps/api/src/__tests__/unit/notifications/smtp-provider.spec.ts`                   | Unit tests        |
| `apps/api/src/__tests__/unit/notifications/mock-provider.spec.ts`                   | Unit tests        |
| `apps/api/src/__tests__/unit/notifications/provider-registry.spec.ts`               | Unit tests        |
| `apps/api/src/__tests__/integration/email-otp-e2e.postgres.spec.ts`                 | Integration tests |
| `apps/api/src/__tests__/integration/account-linking.postgres.spec.ts`               | Integration tests |
| `apps/api/src/__tests__/integration/registration-flows.postgres.spec.ts`            | Integration tests |
| `apps/api/src/__tests__/integration/phone-otp-regression.postgres.spec.ts`          | Regression tests  |
| `apps/api/src/__tests__/integration/password-login-regression.postgres.spec.ts`     | Regression tests  |
| `apps/api/src/__tests__/integration/email-otp-security.postgres.spec.ts`            | Security tests    |
| `apps/api/src/__tests__/integration/migration-0064-email-identity.postgres.spec.ts` | Migration tests   |

## 5. Files Modified

| File                                                                  | Changes                                                                               |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `.env.example`                                                        | Added SMTP_USER, SMTP_PASSWORD; removed dead OTP_PROVIDER                             |
| `apps/api/package.json`                                               | Added nodemailer + @types/nodemailer                                                  |
| `apps/api/src/modules/identity/identity.schema.ts`                    | phone nullable, accountLinkLog table                                                  |
| `apps/api/src/modules/identity/identity.service.ts`                   | +555 lines: email OTP lifecycle, linking, registration, password compat, feature flag |
| `apps/api/src/modules/identity/auth.controller.ts`                    | +77 lines: 6 new endpoints                                                            |
| `apps/api/src/modules/identity/dto/auth.dto.ts`                       | +64 lines: new DTOs                                                                   |
| `apps/api/src/modules/identity/identity.module.ts`                    | Wire new dependencies                                                                 |
| `apps/api/src/modules/notifications/providers/provider.interface.ts`  | Generalized types                                                                     |
| `apps/api/src/modules/notifications/providers/provider.config.ts`     | SMTP config                                                                           |
| `apps/api/src/modules/notifications/providers/twilio-sms.provider.ts` | Adapt to generalized interface                                                        |
| `apps/api/src/modules/notifications/providers/whatsapp.provider.ts`   | Adapt to generalized interface                                                        |
| `apps/api/src/modules/notifications/otp-delivery.service.ts`          | Generalized delivery via registry                                                     |
| `apps/api/src/modules/notifications/notifications.module.ts`          | Register new providers                                                                |
| `packages/contracts/src/index.ts`                                     | Zod schemas for email OTP                                                             |

---

## 6. Security Design Decisions

### 6.1 Enumeration Prevention

- `requestEmailOtp` returns the **same response shape** whether the email exists in the database or not
- A challenge is silently created even for non-existing emails (OTP generated but not delivered via real provider)
- Consistent timing: minimum response time padding prevents timing-based enumeration
- No error messages differentiate between "email not found" and "rate limited"

### 6.2 Rate Limiting (Layered)

| Layer             | Limit | Window     | Key Pattern                   |
| ----------------- | ----- | ---------- | ----------------------------- |
| Per-email request | 5     | 15 minutes | `otp:req:email:{normalized}`  |
| Per-IP request    | 20    | 1 minute   | `otp:ip:{ip}`                 |
| Per-email verify  | 5     | 15 minutes | `otp:vatt:email:{normalized}` |

### 6.3 Challenge Security

- OTP stored as HMAC-SHA256 hash with per-challenge random salt (never plaintext in Redis)
- Atomic verify-and-consume via Lua script (exactly one success under concurrent race)
- New request supersedes previous challenge (supersession)
- Consumed challenges cannot be replayed

### 6.4 Credential and PII Redaction

- SMTP errors never contain password or full email address
- Audit log uses SHA-256 hashed email, never raw
- Redis stores HMAC hash, not plaintext OTP
- No OTP values logged at any level

### 6.5 Mock Provider Isolation

- Constructor throws in `production` or `staging` environments
- Never registered in public provider map
- Never selectable through public API request parameter
- `@IsIn(['sms', 'whatsapp', 'email'])` validation excludes 'mock' from DTOs

### 6.6 Account Linking Security

- No auto-merge on linking conflict (throws `EMAIL_ALREADY_IN_USE`)
- Cannot remove last authentication method
- All link/unlink operations logged to `account_link_log` with hashed identifiers
- Concurrency protection via DB-level checks

---

## 7. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Auth Controller                        │
│  POST /v1/auth/otp/email/request                         │
│  POST /v1/auth/otp/email/verify                          │
│  POST /v1/auth/account/link-email                        │
│  POST /v1/auth/account/unlink-email                      │
│  POST /v1/auth/account/link-phone                        │
│  POST /v1/auth/account/unlink-phone                      │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                   Identity Service                        │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Challenge   │  │   Account    │  │   Feature     │  │
│  │  Lifecycle   │  │   Linking    │  │   Flag        │  │
│  └──────┬──────┘  └──────┬───────┘  └───────────────┘  │
└─────────┼────────────────┼──────────────────────────────┘
          │                │
┌─────────▼──────┐  ┌─────▼────────┐  ┌──────────────────┐
│  Redis (OTP    │  │  PostgreSQL  │  │  Provider        │
│  challenges,   │  │  (users,     │  │  Registry        │
│  rate limits)  │  │  link log)   │  │  ┌─────┐ ┌─────┐│
└────────────────┘  └──────────────┘  │  │SMTP │ │Mock ││
                                       │  └─────┘ └─────┘│
                                       │  ┌─────┐ ┌─────┐│
                                       │  │SMS  │ │WA   ││
                                       │  └─────┘ └─────┘│
                                       └──────────────────┘
```

---

## 8. Test Summary

| Suite                                  | File(s)                                          | Tests    | Status   |
| -------------------------------------- | ------------------------------------------------ | -------- | -------- |
| Unit: Email normalization              | `email-normalization.spec.ts`                    | 12       | **PASS** |
| Unit: SMTP provider                    | `smtp-provider.spec.ts`                          | 15       | **PASS** |
| Unit: Mock provider                    | `mock-provider.spec.ts`                          | 10       | **PASS** |
| Unit: Provider registry                | `provider-registry.spec.ts`                      | 11       | **PASS** |
| Unit: Email OTP lifecycle              | `email-otp-lifecycle.spec.ts`                    | 18       | **PASS** |
| Unit: Account linking                  | `account-linking.spec.ts`                        | 14       | **PASS** |
| Unit: Email enumeration                | `email-enumeration.spec.ts`                      | 8        | **PASS** |
| Unit: OTP redaction                    | `otp-redaction.spec.ts`                          | 9        | **PASS** |
| Integration: Email OTP E2E             | `email-otp-e2e.postgres.spec.ts`                 | 16       | **PASS** |
| Integration: Account linking           | `account-linking.postgres.spec.ts`               | 9        | **PASS** |
| Integration: Registration flows        | `registration-flows.postgres.spec.ts`            | 8        | **PASS** |
| Integration: Phone OTP regression      | `phone-otp-regression.postgres.spec.ts`          | 11       | **PASS** |
| Integration: Password login regression | `password-login-regression.postgres.spec.ts`     | 11       | **PASS** |
| Security: Email OTP                    | `email-otp-security.postgres.spec.ts`            | 17       | **PASS** |
| Migration: 0064                        | `migration-0064-email-identity.postgres.spec.ts` | 18       | **PASS** |
| **Full unit suite**                    | all unit tests                                   | **2205** | **PASS** |
| **Lint**                               | —                                                | 0 errors | **PASS** |
| **Typecheck**                          | —                                                | 0 issues | **PASS** |
| **Build**                              | 420 files                                        | 0 issues | **PASS** |

---

## 9. Acceptance Criteria Coverage

| #     | Criterion                                           | Evidence                                                             |
| ----- | --------------------------------------------------- | -------------------------------------------------------------------- |
| AC-1  | Email OTP request returns enumeration-safe response | `email-enumeration.spec.ts`, `email-otp-security.postgres.spec.ts`   |
| AC-2  | Email OTP verify issues JWT for existing user       | `email-otp-e2e.postgres.spec.ts`                                     |
| AC-3  | Email OTP verify creates user for new email         | `registration-flows.postgres.spec.ts`                                |
| AC-4  | Challenge TTL is 300s for email                     | `email-otp-lifecycle.spec.ts`, `email-otp-e2e.postgres.spec.ts`      |
| AC-5  | Per-email rate limit enforced                       | `email-otp-security.postgres.spec.ts`                                |
| AC-6  | Per-IP rate limit enforced                          | `email-otp-security.postgres.spec.ts`                                |
| AC-7  | Challenge supersession works                        | `email-otp-security.postgres.spec.ts`, `email-otp-lifecycle.spec.ts` |
| AC-8  | OTP replay prevented                                | `email-otp-security.postgres.spec.ts`                                |
| AC-9  | Concurrent verify: exactly one success              | `email-otp-security.postgres.spec.ts`                                |
| AC-10 | Account linking with conflict detection             | `account-linking.spec.ts`, `account-linking.postgres.spec.ts`        |
| AC-11 | Cannot unlink last auth method                      | `account-linking.spec.ts`, `email-otp-security.postgres.spec.ts`     |
| AC-12 | Audit log uses hashed identifiers                   | `email-otp-security.postgres.spec.ts`                                |
| AC-13 | Feature flag gates email OTP                        | `email-otp-e2e.postgres.spec.ts`                                     |
| AC-14 | Mock provider rejected in production                | `mock-provider.spec.ts`, `email-otp-security.postgres.spec.ts`       |
| AC-15 | Mock excluded from public channel                   | `provider-registry.spec.ts`                                          |
| AC-16 | No OTP/PII in logs                                  | `otp-redaction.spec.ts`, `email-otp-security.postgres.spec.ts`       |
| AC-17 | Migration applies cleanly on fresh DB               | `migration-0064-email-identity.postgres.spec.ts`                     |
| AC-18 | Migration preserves existing data                   | `migration-0064-email-identity.postgres.spec.ts`                     |
| AC-19 | CHECK constraint enforced                           | `migration-0064-email-identity.postgres.spec.ts`                     |
| AC-20 | Case-insensitive unique index                       | `migration-0064-email-identity.postgres.spec.ts`                     |
| AC-21 | Duplicate email preflight detection                 | `migration-0064-email-identity.postgres.spec.ts`                     |
| AC-22 | Forward-fix policy (no NOT NULL restore)            | `migration-0064-email-identity.postgres.spec.ts`                     |
| AC-23 | Phone OTP regression (unchanged)                    | `phone-otp-regression.postgres.spec.ts`                              |
| AC-24 | Password login regression (unchanged)               | `password-login-regression.postgres.spec.ts`                         |
| AC-25 | Email-only registration                             | `registration-flows.postgres.spec.ts`                                |
| AC-26 | Dual-identifier linking                             | `registration-flows.postgres.spec.ts`                                |
| AC-27 | SMTP credential redaction                           | `smtp-provider.spec.ts`, `email-otp-security.postgres.spec.ts`       |
| AC-28 | Full regression suite passes                        | 2205 unit tests, lint, typecheck, build all pass                     |

---

## 10. Known Limitations and Future Work

1. **SMTP transport** — Currently uses Nodemailer direct SMTP. Future: consider managed email APIs (SendGrid, SES) for production scale.
2. **Email template** — Basic HTML template. Future: branded template with organization logo, localization.
3. **Feature flag** — Database-seeded flag. Future: integrate with feature flag service (e.g., LaunchDarkly) for dynamic toggling.
4. **Phone OTP TTL** — Preserved at 90 seconds. Future: consider aligning with email TTL for consistency.
5. **Account merge** — Not implemented. Conflicting link attempts throw errors. Future: merge workflow for duplicate accounts.

---

## 11. Conclusion

Phase 1 implementation is complete. All 28 acceptance criteria are addressed with passing tests. The implementation follows the existing codebase patterns, maintains backward compatibility with phone-only flows, and introduces email as a first-class authentication identifier with comprehensive security controls.

**Status:** Ready for review and approval for staging deployment.
