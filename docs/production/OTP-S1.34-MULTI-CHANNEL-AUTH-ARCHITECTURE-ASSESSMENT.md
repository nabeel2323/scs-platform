# S1.34 Multi-Channel Authentication Architecture Assessment

**Sprint:** S1.34
**Date:** 2026-10-31
**Repository:** `nabeel2323/scs-platform`
**Baseline commit:** `2abb53881c87724c338e2a2a94b8e9be78e70c23` (origin/develop)
**Purpose:** Comprehensive audit of existing authentication and OTP Foundation implementation

---

## Executive Summary

The current SCS platform implements a **phone-first authentication model** with Redis-backed OTP challenges, HMAC-SHA256 protection, and dual delivery channels (Twilio SMS, Meta WhatsApp). The system supports email+password login with device-trust evaluation, but **all OTP flows are phone-based**. Email OTP, TOTP authenticator apps, recovery codes, and passkeys are **not implemented**.

**Key findings:**
- ✅ Solid foundation: Redis Lua scripts, HMAC challenge storage, device trust, session management
- ⚠️ Critical gap: No email OTP support (phone required for all OTP flows)
- ⚠️ Misleading configuration: `OTP_PROVIDER=mock` is a dead variable
- ❌ Missing: TOTP, recovery codes, passkeys, mock delivery adapter
- ❌ Schema limitation: `users.phone` is NOT NULL, preventing email-first accounts

**Strategic requirement:** Support 8 authentication methods (email OTP, TOTP, recovery codes, passkeys, Twilio SMS, WhatsApp, mock/test, existing password) while preserving SMS/WhatsApp as first-class providers.

---

## 1. Current Implementation Audit

### 1.1 Database Schema

**File:** `apps/api/src/modules/identity/identity.schema.ts`

#### Users Table

```typescript
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  phone: varchar('phone', { length: 20 }).notNull().unique(),  // ⚠️ REQUIRED
  email: varchar('email', { length: 254 }).unique(),            // ✅ Optional
  fullName: varchar('full_name', { length: 160 }).notNull(),
  locale: varchar('locale', { length: 10 }).notNull().default('en'),
  status: varchar('status', { length: 12 }).notNull().default('ACTIVE'),
  passwordHash: varchar('password_hash', { length: 255 }),      // ✅ Optional
  passwordSetAt: timestamp('password_set_at', { withTimezone: true }),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Finding F-1 (CRITICAL):** `phone` is `NOT NULL` and `UNIQUE`. This prevents email-first accounts.

**Required change:** Make `phone` nullable, add constraint ensuring at least one of `phone` or `email` is present.

**Migration impact:** 
- Existing users all have phone numbers (phone-first model)
- New migration must allow `phone` to be NULL
- Add CHECK constraint: `CHECK (phone IS NOT NULL OR email IS NOT NULL)`
- Preserve all existing user IDs, org memberships, sessions

#### Sessions Table

```typescript
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: char('token_hash', { length: 64 }).notNull().unique(),
  device: varchar('device', { length: 160 }),
  deviceId: varchar('device_id', { length: 128 }),  // Device trust identifier
  ip: inet('ip'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  replacedBy: uuid('replaced_by').references((): any => sessions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Status:** ✅ Suitable for multi-channel auth. `deviceId` supports device trust across all auth methods.

#### Credential Audit Log

```typescript
export const credentialAuditLog = pgTable('credential_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  action: varchar('action', { length: 32 }).notNull(),  // PASSWORD_SET, PASSWORD_CHANGE, EMAIL_CHANGE, CREDENTIAL_SETUP
  deviceId: varchar('device_id', { length: 128 }),
  ipAddress: inet('ip_address'),
  userAgent: varchar('user_agent', { length: 256 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Status:** ✅ Suitable for tracking TOTP enrollment, passkey registration, recovery code generation.

**Required change:** Extend `action` enum to include `TOTP_ENROLLMENT`, `TOTP_DISABLE`, `PASSKEY_REGISTER`, `PASSKEY_REMOVE`, `RECOVERY_CODES_GENERATE`.

### 1.2 Identity Service

**File:** `apps/api/src/modules/identity/identity.service.ts`

#### OTP Request Flow

```typescript
async requestOtp(phone: string, channel: OtpDeliveryChannel = 'sms'): Promise<{
  success: boolean;
  deliveryStatus: string;
  possiblyDelivered?: boolean;
}>
```

**Lifecycle:**
1. Normalize phone to E.164
2. Atomic rate-limit check (Lua: `ACQUIRE_RATE_LIMIT`)
3. Generate 6-digit OTP (`crypto.randomInt`)
4. Compute HMAC-SHA256 with per-challenge salt
5. Atomic challenge creation (Lua: `CREATE_CHALLENGE`)
6. Deliver via provider (SMS or WhatsApp)
7. Handle delivery outcome (preserve challenge on timeout, cleanup on rejection)

**Finding F-2 (CRITICAL):** Method signature requires `phone` parameter. No email OTP support.

**Required change:** Add `requestEmailOtp(email: string)` method or generalize to `requestOtp(identity: string, channel: 'sms' | 'whatsapp' | 'email')`.

#### OTP Verification Flow

```typescript
async verifyOtp(
  phone: string,
  otp: string,
  deviceId?: string,
  deviceInfo?: { platform: string; userAgent: string },
  context?: AuditRequestContext,
): Promise<{ accessToken: string; refreshToken: string }>
```

**Lifecycle:**
1. Normalize phone to E.164
2. Read challenge from Redis (obtain salt)
3. Compute HMAC of user-supplied OTP
4. Atomic verify-and-consume (Lua: `VERIFY_AND_CONSUME`)
5. Handle verification result (-1 expired, -2 already used, 0 invalid, 1 valid)
6. On invalid: enforce verify-failure rate limit (Lua: `ACQUIRE_RATE_LIMIT`)
7. On success: clean up rate-limit keys, find/create user, issue JWT pair

**Finding F-3 (CRITICAL):** Method signature requires `phone` parameter. User lookup is phone-based.

**Required change:** Add `verifyEmailOtp(email, otp, ...)` or generalize to accept identity type.

#### Password Login Flow

```typescript
async loginWithPassword(
  email: string,
  password: string,
  deviceId: string,
  deviceInfo: { platform: string; userAgent: string },
  context: AuditRequestContext,
): Promise<{
  accessToken?: string;
  refreshToken?: string;
  requiresOtp?: boolean;
  otpPhone?: string;
}>
```

**Lifecycle:**
1. Rate limit check (5 attempts per 15 minutes)
2. Find user by email
3. Verify password (bcrypt)
4. Check device trust (`checkDeviceTrust`)
5. If trusted: issue JWT pair
6. If untrusted: send OTP to user's **phone** (not email), return `requiresOtp: true`

**Finding F-4 (HIGH):** When device is untrusted, OTP is sent to the user's phone, not email. This is a UX issue for email-first accounts.

**Required change:** Support email OTP as fallback when phone is not available or user prefers email.

### 1.3 Authentication Controller

**File:** `apps/api/src/modules/identity/auth.controller.ts`

#### Endpoints

```typescript
@Controller('auth')
export class AuthController {
  @Post('otp/request')
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'otp-request': {} })
  async requestOtp(@Body() dto: RequestOtpDto)

  @Post('otp/verify')
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'otp-verify': {} })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req)

  @Post('refresh')
  async refreshToken(@Body() dto: RefreshTokenDto)

  @Post('logout')
  async logout(@Body() dto: RefreshTokenDto)

  @Post('switch-org')
  @UseGuards(JwtAuthGuard)
  async switchOrg(@CurrentUser() user: JwtPayload, @Body() dto: SwitchOrgDto)

  @Post('login/password')
  async loginPassword(@Body() dto: LoginPasswordDto, @Req() req)

  @Post('login/device-check')
  async checkDeviceLogin(@Body() dto: DeviceCheckDto)
}
```

**Status:** ✅ Well-structured. Throttling applied to OTP endpoints.

**Required change:** Add endpoints for TOTP, recovery codes, passkeys (see Part G).

### 1.4 DTOs

**File:** `apps/api/src/modules/identity/dto/auth.dto.ts`

#### RequestOtpDto

```typescript
export class RequestOtpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;

  @IsOptional()
  @IsString()
  @IsIn(['sms', 'whatsapp'])
  channel?: 'sms' | 'whatsapp';
}
```

**Finding F-5 (CRITICAL):** DTO requires `phone`. No email OTP support.

**Required change:** Add `EmailOtpRequestDto` or extend to support `identity: string` and `channel: 'sms' | 'whatsapp' | 'email'`.

#### VerifyOtpDto

```typescript
export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'otp must be a 6-digit code' })
  otp!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo?: DeviceInfoDto;
}
```

**Finding F-6 (CRITICAL):** DTO requires `phone`. No email OTP verification.

**Required change:** Add `EmailOtpVerifyDto` or generalize.

### 1.5 Notification Module

**File:** `apps/api/src/modules/notifications/otp-delivery.service.ts`

#### Provider Selection

```typescript
@Injectable()
export class OtpDeliveryService {
  private readonly providers: Map<OtpDeliveryChannel, NotificationProvider>;

  async deliverOtp(
    phone: string,
    otp: string,
    channel: OtpDeliveryChannel,
    correlationId?: string,
  ): Promise<OtpDeliveryResult> {
    const provider = this.providers.get(channel);
    if (!provider) {
      return { status: 'failed', errorReason: 'UNKNOWN_CHANNEL', retryable: false, deliveryOutcome: 'rejected' };
    }
    if (!provider.isConfigured()) {
      return { status: 'failed', errorReason: `${channel.toUpperCase()}_PROVIDER_NOT_CONFIGURED`, retryable: false, deliveryOutcome: 'rejected' };
    }
    // ... attempt delivery
  }
}
```

**Finding F-7 (HIGH):** No mock provider implementation. `OTP_PROVIDER=mock` in `.env.example` is a dead variable.

**Required change:** Implement `MockOtpProvider` for staging/testing.

#### Provider Interface

**File:** `apps/api/src/modules/notifications/providers/provider.interface.ts`

```typescript
export type OtpDeliveryChannel = 'sms' | 'whatsapp';

export interface OtpDeliveryRequest {
  phone: string;
  otp: string;
  channel: OtpDeliveryChannel;
  correlationId?: string;
}

export interface OtpDeliveryResult {
  success: boolean;
  status: 'delivered' | 'failed' | 'timeout';
  messageId?: string;
  errorReason?: string;
  retryable: boolean;
  deliveryOutcome: 'accepted' | 'rejected' | 'unknown';
}

export interface NotificationProvider {
  readonly name: string;
  sendOtp(request: OtpDeliveryRequest): Promise<OtpDeliveryResult>;
  isConfigured(): boolean;
}
```

**Finding F-8 (HIGH):** Interface is phone-specific. No email support.

**Required change:** Extend to support email channel, or create separate `EmailDeliveryService`.

### 1.6 Twilio SMS Provider

**File:** `apps/api/src/modules/notifications/providers/twilio-sms.provider.ts`

**Status:** ✅ Well-implemented. 10-second timeout, proper error classification (400/401/403 → rejected, 429/≥500/timeout/network → unknown), no credential logging.

**Gap:** None for SMS delivery. Suitable for production activation.

### 1.7 WhatsApp Provider

**File:** `apps/api/src/modules/notifications/providers/whatsapp.provider.ts`

**Status:** ✅ Well-implemented. Same pattern as Twilio. API version validated against regex `^v\d+\.\d+$`.

**Gap:** None for WhatsApp delivery. Suitable for production activation.

### 1.8 Redis Lua Scripts

**File:** `apps/api/src/common/redis/otp-lua.ts`

**Scripts:**
1. `ACQUIRE_RATE_LIMIT` — atomic rate-limit check-and-increment
2. `CREATE_CHALLENGE` — atomic challenge creation (supersedes existing)
3. `CLEANUP_CHALLENGE` — owner-guarded cleanup
4. `VERIFY_AND_CONSUME` — atomic verify-and-consume

**Status:** ✅ Solid foundation. Atomic operations prevent race conditions. HMAC-SHA256 with per-challenge salt protects OTP storage.

**Gap:** Scripts are phone-keyed (`otp:{phone}`, `otp:req:{phone}`, `otp:vatt:{phone}`). Email OTP requires separate key namespace or generalized identity key.

### 1.9 Environment Configuration

**File:** `.env.example`

```bash
# OTP
OTP_PROVIDER=mock                    # ⚠️ DEAD VARIABLE
OTP_LENGTH=6
OTP_TTL=90
OTP_MAX_ATTEMPTS=5
OTP_HMAC_SECRET=dev-hmac-secret-change-me-in-production-64chars-minimum!!

# Twilio
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
# TWILIO_FROM_NUMBER=

# WhatsApp
# WHATSAPP_ACCESS_TOKEN=
# WHATSAPP_PHONE_NUMBER_ID=
# WHATSAPP_BUSINESS_ACCOUNT_ID=
# WHATSAPP_TEMPLATE_NAME=authentication
# WHATSAPP_API_VERSION=v18.0
```

**Finding F-9 (CRITICAL):** `OTP_PROVIDER=mock` is not read by the application. Misleading configuration.

**Required change:** Remove `OTP_PROVIDER` from `.env.example` or implement mock provider and wire it to this variable.

**Finding F-10 (HIGH):** No SMTP configuration documented.

**Required change:** Add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` to `.env.example`.

### 1.10 Web Authentication

**File:** `apps/web/src/lib/auth.ts`

**Status:** ✅ Well-structured. JWT pair with refresh rotation, device ID stored in localStorage, supports both OTP and password login.

**Gap:** No UI for TOTP enrollment, recovery codes, passkeys, or email OTP.

### 1.11 Flutter Authentication

**File:** `mobile/lib/screens/auth/login_screen.dart`

**Status:** ✅ Dual authentication (Email/Password tab + Phone OTP tab). Device ID service for trust evaluation.

**Gap:** No UI for TOTP, recovery codes, passkeys, or email OTP.

### 1.12 API Contracts

**File:** `packages/contracts/src/index.ts`

**Status:** ✅ Zod schemas generate OpenAPI 3.1 spec. TypeScript and Dart clients derived from single source of truth.

**Gap:** No schemas for TOTP, recovery codes, passkeys, or email OTP.

### 1.13 Test Coverage

**Unit tests:**
- `auth.controller.spec.ts` — controller delegation
- `auth-dto.spec.ts` — DTO validation
- `identity.*.spec.ts` — service methods
- `phone-validation.spec.ts` — E.164 normalization
- `otp-delivery-providers.spec.ts` — provider error classification
- `otp-delivery-timeout.spec.ts` — timeout handling
- `provider-config.spec.ts` — configuration validation

**Integration tests:**
- `otp-redis-lua.real.spec.ts` — 12 tests for Lua scripts
- `cross-instance-throttling.spec.ts` — 8 tests for distributed throttling
- `http-cross-instance-throttling.spec.ts` — 5 tests for HTTP-level throttling
- `throttle-ip-isolation.spec.ts` — 3 tests for per-IP counters
- `throttle-cleanup-sentinel.real.spec.ts` — 5 tests for exact-key cleanup

**Status:** ✅ Comprehensive coverage for existing phone OTP flows.

**Gap:** No tests for email OTP, TOTP, recovery codes, passkeys.

### 1.14 CI Configuration

**File:** `.github/workflows/ci.yml`

**Status:** ✅ Well-structured. Redis service container for integration tests. Disposable Redis safety guards.

**Gap:** No SMTP service for email delivery testing (acceptable — email tests should use mock).

---

## 2. Findings Register

| ID | Severity | Component | Description | Required Change |
|----|----------|-----------|-------------|-----------------|
| F-1 | 🔴 CRITICAL | Schema | `users.phone` is NOT NULL, preventing email-first accounts | Make `phone` nullable, add CHECK constraint |
| F-2 | 🔴 CRITICAL | Service | `requestOtp` requires phone parameter | Add `requestEmailOtp` or generalize |
| F-3 | 🔴 CRITICAL | Service | `verifyOtp` requires phone parameter | Add `verifyEmailOtp` or generalize |
| F-4 | 🟡 HIGH | Service | Password login sends OTP to phone, not email | Support email OTP fallback |
| F-5 | 🔴 CRITICAL | DTO | `RequestOtpDto` requires phone | Add email OTP DTO or generalize |
| F-6 | 🔴 CRITICAL | DTO | `VerifyOtpDto` requires phone | Add email OTP DTO or generalize |
| F-7 | 🟡 HIGH | Notification | No mock provider implementation | Implement `MockOtpProvider` |
| F-8 | 🟡 HIGH | Interface | `NotificationProvider` is phone-specific | Extend for email or create separate service |
| F-9 | 🔴 CRITICAL | Config | `OTP_PROVIDER=mock` is a dead variable | Remove or implement mock provider |
| F-10 | 🟡 HIGH | Config | No SMTP configuration documented | Add SMTP env vars to `.env.example` |
| F-11 | ⚪ INFO | Schema | No tables for TOTP, recovery codes, passkeys | Add `totp_secrets`, `recovery_codes`, `passkeys` tables |
| F-12 | ⚪ INFO | Service | No TOTP enrollment/verification logic | Implement TOTP service methods |
| F-13 | ⚪ INFO | Service | No recovery code generation/verification | Implement recovery code service |
| F-14 | ⚪ INFO | Service | No passkey registration/authentication | Implement WebAuthn service |
| F-15 | ⚪ INFO | Controller | No endpoints for TOTP, recovery, passkeys | Add new endpoints |
| F-16 | ⚪ INFO | Web | No UI for TOTP, recovery, passkeys | Add UI components |
| F-17 | ⚪ INFO | Flutter | No UI for TOTP, recovery, passkeys | Add UI screens |
| F-18 | ⚪ INFO | Contracts | No schemas for TOTP, recovery, passkeys | Add Zod schemas |
| F-19 | ⚪ INFO | Tests | No tests for email OTP, TOTP, recovery, passkeys | Add test suites |

---

## 3. Existing Functionality Reuse Analysis

### 3.1 Can Be Reused As-Is

- ✅ Redis Lua scripts (atomic operations, HMAC challenge storage)
- ✅ Twilio SMS provider (production-ready)
- ✅ WhatsApp provider (production-ready)
- ✅ Device trust system (`deviceId`, `checkDeviceTrust`)
- ✅ Session management (refresh token rotation, reuse detection)
- ✅ JWT issuance (claims structure, signing)
- ✅ Rate limiting (per-phone, per-IP throttling)
- ✅ Audit logging (`credentialAuditLog` table)
- ✅ Phone validation (E.164 normalization, masking)
- ✅ Error classification (`deliveryOutcome`: accepted/rejected/unknown)

### 3.2 Requires Extension

- ⚠️ `users` table schema (make `phone` nullable)
- ⚠️ `identity.service.ts` (add email OTP methods)
- ⚠️ `auth.controller.ts` (add email OTP endpoints)
- ⚠️ `auth.dto.ts` (add email OTP DTOs)
- ⚠️ `otp-delivery.service.ts` (add email channel)
- ⚠️ `provider.interface.ts` (extend for email)
- ⚠️ `credentialAuditLog.action` enum (add TOTP/passkey/recovery actions)
- ⚠️ `.env.example` (add SMTP config, remove/fix `OTP_PROVIDER`)
- ⚠️ `packages/contracts/src/index.ts` (add email OTP schemas)
- ⚠️ Web and Flutter UI (add email OTP flows)

### 3.3 Must Be Implemented From Scratch

- ❌ SMTP email provider
- ❌ Mock/test delivery adapter
- ❌ TOTP enrollment workflow
- ❌ TOTP verification logic
- ❌ TOTP secret encryption at rest
- ❌ Recovery code generation
- ❌ Recovery code hashing and storage
- ❌ Recovery code verification
- ❌ Passkey/WebAuthn registration
- ❌ Passkey/WebAuthn authentication
- ❌ Passkey credential storage
- ❌ UI for TOTP enrollment/management
- ❌ UI for recovery code management
- ❌ UI for passkey management
- ❌ API contracts for TOTP, recovery, passkeys
- ❌ Test suites for all new functionality

---

## 4. Backward Compatibility Risks

### 4.1 Database Migration Risks

**Risk R-1 (HIGH):** Making `users.phone` nullable may break existing queries that assume phone is always present.

**Mitigation:** Audit all queries using `users.phone`. Add null checks where necessary. Preserve existing user data (all current users have phone numbers).

**Risk R-2 (MEDIUM):** Adding new tables (`totp_secrets`, `recovery_codes`, `passkeys`) increases schema complexity.

**Mitigation:** Use foreign keys with `ON DELETE CASCADE` to ensure cleanup when users are deleted. Add indexes for performance.

### 4.2 API Contract Risks

**Risk R-3 (HIGH):** Changing `RequestOtpDto` to support email may break existing phone-only clients.

**Mitigation:** Keep existing `phone` field, add optional `email` field. Clients can use either. Add new endpoints for email-specific flows if needed.

**Risk R-4 (MEDIUM):** Adding new endpoints for TOTP, recovery, passkeys increases API surface.

**Mitigation:** Use consistent naming conventions (`/v1/auth/totp/*`, `/v1/auth/recovery/*`, `/v1/auth/passkeys/*`). Document in OpenAPI spec.

### 4.3 Client Compatibility Risks

**Risk R-5 (HIGH):** Web and Flutter clients must be updated to support new authentication methods.

**Mitigation:** Implement new UI components incrementally. Keep existing phone OTP flow working. Add feature flags for new methods.

**Risk R-6 (MEDIUM):** Generated TypeScript and Dart clients must be regenerated after contract changes.

**Mitigation:** Run `pnpm --filter @scs/contracts generate` after schema updates. Update client imports.

---

## 5. Security Considerations

### 5.1 Existing Security Controls

- ✅ HMAC-SHA256 challenge storage (OTP never stored in plaintext)
- ✅ Per-challenge salt (prevents rainbow table attacks)
- ✅ Atomic Lua scripts (prevent race conditions)
- ✅ Rate limiting (per-phone, per-IP)
- ✅ Device trust (prevents unauthorized access from new devices)
- ✅ Session rotation (refresh token reuse detection)
- ✅ Audit logging (credential changes tracked)
- ✅ Phone masking (logs show only last 4 digits)
- ✅ No sensitive data logging (OTP, HMAC secret, salt, credentials never logged)

### 5.2 New Security Requirements

- ⚠️ Email OTP: must prevent email enumeration (don't reveal if email exists)
- ⚠️ TOTP: must encrypt secrets at rest, use time-window validation, prevent replay
- ⚠️ Recovery codes: must hash before storage, enforce single-use, rate-limit verification
- ⚠️ Passkeys: must validate relying party ID/origin, enforce user verification, prevent credential theft
- ⚠️ Mock provider: must never be enabled in production, must be clearly distinguishable from real delivery

### 5.3 Threat Model

**Threat T-1 (Email OTP interception):** Attacker intercepts email OTP via compromised email account.

**Mitigation:** Short TTL (90s), single-use, rate limiting, device trust evaluation.

**Threat T-2 (TOTP secret theft):** Attacker gains access to database and decrypts TOTP secrets.

**Mitigation:** Encrypt secrets at rest with AES-256-GCM, use separate encryption key stored in environment variable, rotate secrets periodically.

**Threat T-3 (Recovery code brute force):** Attacker attempts to guess recovery codes.

**Mitigation:** Hash codes with bcrypt, rate-limit verification attempts, lock account after N failures, require additional verification (email/SMS) after recovery.

**Threat T-4 (Passkey phishing):** Attacker creates fake login page to steal passkey credentials.

**Mitigation:** Validate relying party ID and origin, enforce user verification (biometric/PIN), use platform authenticators when available.

---

## 6. Recommendations

### 6.1 Immediate Actions (S1.34)

1. **Fix F-9:** Remove `OTP_PROVIDER=mock` from `.env.example` or implement mock provider
2. **Fix F-10:** Add SMTP configuration to `.env.example`
3. **Document F-1:** Plan migration to make `users.phone` nullable
4. **Design F-2, F-3:** Generalize OTP methods to support email

### 6.2 Short-Term Actions (S1.35–S1.36)

1. **Implement F-7:** Create `MockOtpProvider` for staging/testing
2. **Implement F-8:** Extend `NotificationProvider` interface for email
3. **Implement F-2, F-3:** Add email OTP methods to `IdentityService`
4. **Implement F-5, F-6:** Add email OTP DTOs
5. **Fix F-1:** Migrate `users` table schema

### 6.3 Medium-Term Actions (S1.37–S1.38)

1. **Implement F-11:** Add `totp_secrets`, `recovery_codes`, `passkeys` tables
2. **Implement F-12, F-13:** Add TOTP and recovery code service methods
3. **Implement F-14:** Add passkey/WebAuthn service methods
4. **Implement F-15:** Add new controller endpoints
5. **Implement F-18:** Add API contract schemas

### 6.4 Long-Term Actions (S1.39–S1.40)

1. **Implement F-16:** Add web UI for TOTP, recovery, passkeys
2. **Implement F-17:** Add Flutter UI for TOTP, recovery, passkeys
3. **Implement F-19:** Add comprehensive test suites
4. **Security review:** Independent audit of all new authentication methods
5. **Production activation:** Configure real SMS, WhatsApp, email providers

---

## 7. Proposed Architectural Decisions

> **S1.34.1 Correction:** The following decisions were initially labeled as "approved" in the S1.34 deliverables. After review, they are re-classified as **PROPOSED — PENDING PROJECT-OWNER APPROVAL**. The recommendations remain but must not be treated as authorized for implementation until the project owner explicitly approves each one.

### 7.1 Account Model

**Decision D-1:** Should email-first accounts be allowed to exist without a phone number?

**Status:** `PROPOSED — PENDING PROJECT-OWNER APPROVAL`

**Options:**
- A) Yes, email-only accounts supported (requires F-1 migration)
- B) No, phone always required (email is secondary identifier only)
- C) Hybrid: phone required for initial signup, can be removed later if email+password+TOTP configured

**Recommendation:** Option A (email-only accounts supported). Aligns with strategic requirement for "free authentication methods."

### 7.2 Mock Provider Scope

**Decision D-2:** How should the mock/test delivery adapter be scoped?

**Status:** `PROPOSED — PENDING PROJECT-OWNER APPROVAL`

**Options:**
- A) Internal test-only adapter, never exposed as a public API channel. Separate internal test-provider selection from public delivery-channel DTOs.
- B) Return OTP values in API response (easier to test, security risk if exposed)
- C) Both: log to console AND return in response (only in non-production environments)

**Recommendation:** Option A. Mock provider must never be enabled in production or staging. OTP values must never appear in ordinary API responses. A secure test-only retrieval method must be defined that is inaccessible in production-like environments.

### 7.3 TOTP Secret Encryption

**Decision D-3:** Should TOTP secrets be encrypted at rest?

**Status:** `PROPOSED — PENDING PROJECT-OWNER APPROVAL`

**Options:**
- A) Yes, encrypt with AES-256-GCM using a dedicated environment key (most secure)
- B) No, store in plaintext (simpler, but security risk if database compromised)
- C) Hash with bcrypt (prevents decryption, but cannot display QR code for re-enrollment)

**Recommendation:** Option A. Balances security and usability. Key must be cryptographically secure in production — no zero-filled fallback. Development must use a securely generated local-only key or fail closed.

### 7.4 Recovery Code Quantity

**Decision D-4:** How many recovery codes should be generated per user?

**Status:** `PROPOSED — PENDING PROJECT-OWNER APPROVAL`

**Options:**
- A) 5 codes (fewer codes to manage, higher risk of exhaustion)
- B) 10 codes (industry standard, balanced)
- C) 20 codes (more codes, lower risk of exhaustion, but more to store securely)

**Recommendation:** Option B (10 codes). Industry standard (Google, GitHub, etc.).

### 7.5 Passkey User Verification

**Decision D-5:** Should passkeys require user verification (biometric/PIN)?

**Status:** `PROPOSED — PENDING PROJECT-OWNER APPROVAL`

**Options:**
- A) Yes, always require user verification (most secure)
- B) No, allow passwordless login without verification (more convenient, less secure)
- C) Configurable per user preference (flexible, but complex)

**Recommendation:** Option A (always require user verification). Security-critical authentication method.

### 7.6 Email OTP TTL

**Decision D-6:** Should email OTP have the same TTL as SMS/WhatsApp OTP (90 seconds)?

**Status:** `PROPOSED — PENDING PROJECT-OWNER APPROVAL`

**Options:**
- A) Yes, same TTL (90s) for all channels (consistent, but email may be slower)
- B) No, longer TTL for email (5 minutes) to account for delivery delays
- C) Configurable per channel (flexible, but complex)

**Recommendation:** Option B (5 minutes for email). Email delivery can be slower than SMS/WhatsApp.

---

## 8. Dependencies

### 8.1 External Dependencies

- **SMTP server:** Required for email OTP delivery (e.g., SendGrid, AWS SES, Mailgun)
- **TOTP library:** Required for TOTP generation/verification (e.g., `otpauth`, `speakeasy`)
- **WebAuthn library:** Required for passkey registration/authentication (e.g., `@simplewebauthn/server`)
- **Encryption library:** Required for TOTP secret encryption (e.g., Node.js `crypto` module)

### 8.2 Internal Dependencies

- **Redis:** Required for OTP challenge storage, rate limiting, throttling (already deployed)
- **PostgreSQL:** Required for user data, sessions, TOTP secrets, recovery codes, passkeys (already deployed)
- **JWT service:** Required for token issuance (already implemented)
- **Audit service:** Required for credential audit logging (already implemented)

---

## 9. Conclusion

The current SCS platform has a **solid foundation** for multi-channel authentication:
- ✅ Redis-backed OTP challenges with HMAC protection
- ✅ Production-ready SMS and WhatsApp providers
- ✅ Device trust and session management
- ✅ Comprehensive test coverage for existing flows

**Critical gaps** must be addressed before multi-channel auth can be implemented:
- ❌ Phone-first schema prevents email-only accounts
- ❌ No email OTP support
- ❌ No TOTP, recovery codes, or passkeys
- ❌ Misleading `OTP_PROVIDER=mock` configuration

**Recommended approach:**
1. **S1.34:** Assessment and architecture design (this document)
2. **S1.35–S1.36:** Email OTP implementation (fix F-1 through F-10)
3. **S1.37–S1.38:** TOTP and recovery codes implementation
4. **S1.39–S1.40:** Passkeys implementation and production activation

**Estimated effort:** 6–8 weeks for full multi-channel auth implementation.

**Risk level:** MEDIUM. Existing functionality is well-tested. New functionality requires careful schema migration and security review.

---

## 10. Proposed Architectural Decisions

> **S1.34.1 Correction:** These decisions are **PROPOSED — PENDING PROJECT-OWNER APPROVAL**. They were initially labeled as "approved" in the S1.34 deliverables. After review, they must not be treated as authorized for implementation until the project owner explicitly approves each one.

The following decisions are incorporated into the target architecture and implementation roadmap as **proposed recommendations**:

| ID | Decision | Status | Rationale |
|----|----------|--------|-----------|
| **D-1** | Support email-only accounts. Existing phone-first accounts must remain compatible. | `PROPOSED` | Enables free authentication methods (email OTP, TOTP, recovery codes, passkeys) without requiring phone. Preserves backward compatibility. |
| **D-2** | Implement mock provider only for isolated automated tests and explicitly controlled non-production development. Never return OTP values through ordinary API responses. Never enable in production or staging. Do not expose `mock` as a public API authentication channel. Separate internal test-provider selection from public delivery-channel DTOs. Define secure test-only OTP retrieval inaccessible in production-like environments. | `PROPOSED` | Security isolation. Prevents OTP leakage through API. Clear separation between test and production. |
| **D-3** | Encrypt TOTP secrets using AES-256-GCM with dedicated encryption key independent of OTP_HMAC_SECRET and JWT secrets. No zero-filled key fallback. Require cryptographically secure key in production; development must use a securely generated local-only key or fail closed. | `PROPOSED` | Protects sensitive data at rest. Key independence limits blast radius of compromise. |
| **D-4** | Generate 10 one-time recovery codes. Store only secure hashes. Regeneration atomically invalidates all previous codes. No automatic account lockout. Never log recovery-code contents or prefixes. | `PROPOSED` | Industry standard (Google, GitHub). Hash-only storage prevents plaintext recovery. Atomic regeneration ensures clean state. |
| **D-5** | Require WebAuthn user verification for passkey authentication. | `PROPOSED` | Security-critical authentication method. Biometric/PIN verification prevents unauthorized use. |
| **D-6** | Set email OTP expiry to 5 minutes. Retain existing 90-second phone OTP behavior. | `PROPOSED` | Accounts for email delivery delays while maintaining security for fast channels. |

**Companion documents incorporating these decisions (all as PROPOSED):**
- `OTP-S1.34-MULTI-CHANNEL-AUTH-TARGET-ARCHITECTURE.md` (Parts B–F)
- `OTP-S1.34-MULTI-CHANNEL-AUTH-IMPLEMENTATION-ROADMAP.md` (Parts G–I)
- `OTP-S1.34-MULTI-CHANNEL-AUTH-SECURITY-AND-RELEASE-GATES.md` (acceptance criteria)
- `OTP-S1.34.1-CORRECTION-AND-APPROVAL-REPORT.md` (corrections and traceability)

---

**Report compiled:** 2026-10-31
**Sprint:** S1.34 Part A (corrected by S1.34.1)
**Status:** COMPLETE (decisions re-labeled as PROPOSED — PENDING PROJECT-OWNER APPROVAL)
