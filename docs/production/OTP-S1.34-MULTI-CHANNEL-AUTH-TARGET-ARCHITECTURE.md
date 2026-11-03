# S1.34 Multi-Channel Authentication — Target Architecture

**Sprint:** S1.34 (Deliverable 2 of 4)
**Date:** 2026-10-31
**Repository:** `nabeel2323/scs-platform`
**Baseline commit:** `2abb53881c87724c338e2a2a94b8e9be78e70c23` (origin/develop)
**Companion documents:**
- `OTP-S1.34-MULTI-CHANNEL-AUTH-ARCHITECTURE-ASSESSMENT.md` (Part A — current state audit)
- `OTP-S1.34-MULTI-CHANNEL-AUTH-IMPLEMENTATION-ROADMAP.md` (Parts G–I)
- `OTP-S1.34-MULTI-CHANNEL-AUTH-SECURITY-AND-RELEASE-GATES.md` (acceptance criteria)

---

## Executive Summary

This document defines the target architecture for multi-channel authentication on the SCS platform. It covers the generalized challenge lifecycle, dual-identifier identity model, delivery provider design, TOTP and recovery codes, and passkeys (WebAuthn). All design decisions incorporate the approved architectural decisions D-1 through D-6 and the mandatory requirements from the S1.34 brief.

**Design principles:**
1. **Backward compatible** — existing phone OTP endpoints, JWT flows, and sessions remain unchanged
2. **Explicit channel selection** — no silent fallback between delivery channels
3. **Defense in depth** — HMAC challenge storage, atomic Lua scripts, AES-256-GCM encryption, rate limiting at multiple layers
4. **Modular** — each authentication method is an independent module with clear interfaces
5. **Auditable** — all credential operations logged with metadata

---

## Part B: Modular Architecture

### B.1 Component Map

```
┌─────────────────────────────────────────────────────────────────┐
│                     Authentication API Layer                      │
│  auth.controller.ts — existing endpoints + new TOTP/passkey      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
       ▼                   ▼                   ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│  Identity    │  │  Challenge   │  │  Provider        │
│  Resolution  │  │  Lifecycle   │  │  Registry        │
│  Service     │  │  Service     │  │  Service         │
└──────┬───────┘  └──────┬───────┘  └──────┬───────────┘
       │                 │                  │
       │                 │     ┌────────────┼────────────┐
       │                 │     │            │            │
       │                 │     ▼            ▼            ▼
       │                 │  ┌──────┐   ┌──────┐   ┌──────┐
       │                 │  │ Email│   │ SMS  │   │ WA   │
       │                 │  │ SMTP │   │Twilio│   │ Meta │
       │                 │  └──────┘   └──────┘   └──────┘
       │                 │     │
       │                 │     ▼
       │                 │  ┌──────┐
       │                 │  │ Mock │ (test/development only)
       │                 │  └──────┘
       ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  TOTP        │  │  Recovery    │  │  Passkeys    │
│  Service     │  │  Codes       │  │  (WebAuthn)  │
│              │  │  Service     │  │  Service     │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                  │
       ▼                 ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              Session & JWT Service (existing)                     │
│              Audit Events Service (extended)                      │
└─────────────────────────────────────────────────────────────────┘
```

### B.2 Module Responsibilities

| Module | Responsibility | Depends On |
|--------|---------------|------------|
| **Identity Resolution** | Normalize email/phone, resolve user, prevent duplicates, manage linking | PostgreSQL |
| **Challenge Lifecycle** | Create/verify/consume OTP challenges, rate limiting, replay prevention | Redis, Provider Registry |
| **Provider Registry** | Register providers by channel, explicit selection, no silent fallback, mock isolation | Environment config |
| **Email Provider (SMTP)** | Deliver OTP via email with HTML template | Nodemailer |
| **SMS Provider (Twilio)** | Deliver OTP via SMS (existing) | Twilio API |
| **WhatsApp Provider (Meta)** | Deliver OTP via WhatsApp (existing) | Meta Graph API |
| **Mock Provider** | Generate OTPs for tests without real delivery; never exposed in production API | None |
| **TOTP Service** | Enrollment, secret encryption, verification with time-window, replay protection | PostgreSQL, AES-256-GCM |
| **Recovery Codes Service** | Generation, bcrypt hashing, one-time consumption, regeneration | PostgreSQL |
| **Passkeys Service** | WebAuthn registration/authentication, credential storage, user verification | PostgreSQL, @simplewebauthn |
| **Session & JWT** | Token issuance, refresh rotation, device trust (existing, extended) | Redis, PostgreSQL |
| **Audit Events** | Log all credential operations with metadata (existing, extended) | PostgreSQL |

### B.3 New Files Required

| File | Module | Purpose |
|------|--------|---------|
| `identity-resolution.service.ts` | Identity Resolution | Normalization, lookup, linking |
| `challenge-lifecycle.service.ts` | Challenge Lifecycle | Generalized OTP challenge management |
| `provider-registry.service.ts` | Provider Registry | Channel-based provider selection |
| `smtp-email.provider.ts` | Email Provider | SMTP delivery implementation |
| `mock.provider.ts` | Mock Provider | Test-only OTP adapter |
| `totp.service.ts` | TOTP | Enrollment, verification, rotation |
| `totp-encryption.service.ts` | TOTP | AES-256-GCM encryption/decryption |
| `recovery-codes.service.ts` | Recovery Codes | Generation, hashing, consumption |
| `passkeys.service.ts` | Passkeys | WebAuthn registration/authentication |
| `totp.schema.ts` | TOTP | Database schema for TOTP tables |
| `recovery-codes.schema.ts` | Recovery Codes | Database schema for recovery tables |
| `passkeys.schema.ts` | Passkeys | Database schema for WebAuthn tables |
| `account-linking.schema.ts` | Identity | Schema for linking audit trail |

### B.4 Files Requiring Extension

| File | Changes |
|------|---------|
| `identity.schema.ts` | Make `phone` nullable, add CHECK constraint, add `accountLinkingLog` table |
| `identity.service.ts` | Generalize OTP methods for email, add account linking |
| `auth.controller.ts` | Add endpoints for email OTP, TOTP, recovery, passkeys |
| `auth.dto.ts` | Add DTOs for new endpoints |
| `provider.interface.ts` | Extend `OtpDeliveryChannel` type, generalize `OtpDeliveryRequest` |
| `otp-delivery.service.ts` | Delegate to Provider Registry instead of direct Map |
| `otp-lua.ts` | Generalize key namespace for email subjects |
| `credentialAuditLog` schema | Extend action enum, add metadata JSONB column |
| `.env.example` | Remove dead `OTP_PROVIDER`, add SMTP/TOTP/WebAuthn config |
| `packages/contracts/src/index.ts` | Add Zod schemas for new endpoints |

---

## Part C: Account and Challenge Model

### C.1 Identity Normalization

**Email normalization:**
```typescript
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
```

**Phone normalization (existing):**
```typescript
function normalizePhone(phone: string): string {
  return parsePhoneNumber(phone, 'SA').format('E.164'); // +966XXXXXXXXX
}
```

### C.2 Schema Migration: Phone-First to Dual-Identifier

> **S1.34.1 Correction:** The original migration design included a rollback step that would restore `phone NOT NULL`. This is **UNSAFE** once email-only accounts have been created — restoring NOT NULL would make existing email-only users invalid and break the database. The rollback strategy must use forward-fix and feature-disable instead of destructive schema reversal.

**Current state:**
```sql
phone VARCHAR(20) NOT NULL UNIQUE
email VARCHAR(254) UNIQUE  -- optional
```

**Target state:**
```sql
phone VARCHAR(20) UNIQUE  -- nullable
email VARCHAR(254) UNIQUE  -- nullable
CONSTRAINT users_require_email_or_phone CHECK (phone IS NOT NULL OR email IS NOT NULL)
```

**Pre-migration duplicate detection:**

Before creating the case-insensitive email index, detect and resolve duplicates:

```sql
-- Step 0: Check for case-variant email duplicates
-- (e.g., User@Example.com and user@example.com as separate rows)
SELECT LOWER(email) AS normalized, COUNT(*) AS duplicates
FROM users
WHERE email IS NOT NULL
GROUP BY LOWER(email)
HAVING COUNT(*) > 1;

-- If duplicates found: DO NOT proceed with migration.
-- Resolve manually: which account is primary? Link the other as an alias or merge with explicit owner approval.
-- Never auto-merge accounts based on matching email or phone values.
```

**Migration strategy:**

1. **Step 1:** Drop NOT NULL constraint on `phone`
   ```sql
   ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
   ```
   - Safe: all existing rows have phone values
   - No data migration required

2. **Step 2:** Add CHECK constraint
   ```sql
   ALTER TABLE users ADD CONSTRAINT users_require_email_or_phone
     CHECK (phone IS NOT NULL OR email IS NOT NULL);
   ```
   - Safe: all existing rows satisfy the constraint

3. **Step 3:** Add normalized email index (only after Step 0 passes)
   ```sql
   CREATE UNIQUE INDEX users_email_lower_unique_idx
     ON users (LOWER(email)) WHERE email IS NOT NULL;
   ```
   - Enables case-insensitive email lookup
   - Partial index excludes NULL emails

4. **Step 4:** Migration verification queries
   ```sql
   -- Verify no data loss
   SELECT COUNT(*) FROM users;  -- must match pre-migration count
   -- Verify all existing users still satisfy constraint
   SELECT COUNT(*) FROM users WHERE phone IS NULL AND email IS NULL;  -- must be 0
   -- Verify all existing users retained their phone
   SELECT COUNT(*) FROM users WHERE phone IS NULL;  -- must be 0 (until email-only accounts are created)
   -- Verify index created
   SELECT indexdef FROM pg_indexes WHERE indexname = 'users_email_lower_unique_idx';
   ```

**Backward compatibility:**
- All existing users retain their phone numbers
- All existing queries using `users.phone` continue to work
- New queries must handle `phone IS NULL` case
- JWT claims, sessions, org memberships unaffected

**Rollback strategy (SAFE — no destructive reversal):**

> Once email-only accounts exist, the migration **cannot be safely reversed** by restoring `phone NOT NULL`. Instead, use forward-fix and feature-disable:

| Scenario | Rollback Action |
|----------|----------------|
| Schema migration causes application errors | Feature-disable: set `FLAG_AUTH_EMAIL_OTP=false`. Keep schema changes. Fix application code. |
| Email-only accounts created, need to disable email auth | Feature-disable: block new email-only registration. Existing email-only accounts retain access via email OTP. |
| Critical data integrity issue | Forward-fix: add corrective migration. Never drop email-only users or restore NOT NULL. |
| Need to fully revert before any email-only accounts created | Only safe if `SELECT COUNT(*) FROM users WHERE phone IS NULL` returns 0. Then: drop constraint, drop index, restore NOT NULL. |

### C.3 Account Types

| Account Type | Identifiers | Authentication Methods |
|-------------|-------------|----------------------|
| **Phone-only** (existing) | phone | SMS/WhatsApp OTP, password (optional) |
| **Email-only** (new, D-1) | email | Email OTP, password, TOTP, recovery codes, passkeys |
| **Dual-identifier** (linked) | email + phone | All methods from both |

### C.4 Account Linking

**Rules:**
1. Never auto-merge accounts based on matching email or phone
2. Linking requires verified ownership of both identifiers
3. Unlinking requires at least one remaining identifier
4. Unlinking phone requires password + TOTP or passkey configured
5. All link/unlink operations logged to `account_linking_log`

**Linking flow:**
```
User requests link → Verify new identifier (OTP) → Check for conflicts →
Link to user record → Audit log entry → Notify user (email/SMS)
```

**Conflict resolution:**
- If email already linked to different user → reject with `ACCOUNT_EXISTS`
- If phone already linked to different user → reject with `ACCOUNT_EXISTS`
- User must unlink from old account first, or use account recovery

### C.5 Duplicate-Account Prevention

```typescript
async checkDuplicates(email?: string, phone?: string): Promise<{
  emailExists: boolean;
  phoneExists: boolean;
  conflictingUserId?: string;
}> {
  const conflicts: { emailExists: boolean; phoneExists: boolean } = {
    emailExists: false,
    phoneExists: false,
  };

  if (email) {
    const existing = await this.db.query.users.findFirst({
      where: sql`LOWER(${users.email}) = ${normalizeEmail(email)}`,
    });
    if (existing) {
      conflicts.emailExists = true;
      return { ...conflicts, conflictingUserId: existing.id };
    }
  }

  if (phone) {
    const existing = await this.db.query.users.findFirst({
      where: eq(users.phone, normalizePhone(phone)),
    });
    if (existing) {
      conflicts.phoneExists = true;
      return { ...conflicts, conflictingUserId: existing.id };
    }
  }

  return conflicts;
}
```

### C.6 Generalized Challenge Model

**Challenge subject:**
```typescript
type ChallengeSubjectType = 'email' | 'phone';

interface ChallengeSubject {
  type: ChallengeSubjectType;
  normalizedValue: string;
}
```

**Challenge structure:**
```typescript
interface OtpChallenge {
  challengeId: string;          // UUID
  subject: ChallengeSubject;    // email or phone
  purpose: ChallengePurpose;    // login, registration, etc.
  channel: OtpDeliveryChannel;  // email, sms, whatsapp
  otpHash: string;              // HMAC-SHA256 hex
  salt: string;                 // 16-byte hex
  expiresAt: number;            // Unix timestamp (seconds)
  createdAt: number;            // Unix timestamp (milliseconds)
  consumed: boolean;
  attemptCount: number;
}

type ChallengePurpose =
  | 'login'
  | 'registration'
  | 'password-reset'
  | 'account-verification'
  | 'account-linking';
```

**Redis key namespace:**
```
# Phone OTP (existing — unchanged)
otp:{phone}                  → Challenge JSON, TTL 90s
otp:req:{phone}              → Request rate limit counter
otp:vatt:{phone}             → Verify failure counter

# Email OTP (new)
otp:email:{normalized_email} → Challenge JSON, TTL 300s (D-6)
otp:email:req:{email}        → Request rate limit counter
otp:email:vatt:{email}       → Verify failure counter

# IP-based (existing — unchanged)
throttle:otp-request:{ip}    → 20/min
throttle:otp-verify:{ip}     → 40/min
```

### C.7 Challenge Lifecycle

```
REQUEST                          VERIFY
   │                               │
   ▼                               ▼
┌──────────┐    ┌──────────┐    ┌──────────┐
│ Rate     │───▶│ Generate │───▶│ Deliver  │
│ Limit    │    │ OTP+HMAC │    │ via      │
│ Check    │    │          │    │ Provider │
└──────────┘    └──────────┘    └──────────┘
                                       │
                    ┌──────────────────┬┴──────────────┐
                    ▼                  ▼               ▼
              ┌──────────┐     ┌──────────┐    ┌──────────┐
              │ Accepted │     │ Rejected │    │ Unknown  │
              │ Retain   │     │ Cleanup  │    │ Retain   │
              │ Challenge│     │ Challenge│    │ Challenge│
              └──────────┘     └──────────┘    └──────────┘
                                                       │
                                                       ▼
                                                ┌──────────┐
                                                │ HMAC     │
                                                │ Compare  │
                                                │ (atomic) │
                                                └──────────┘
                                                       │
                              ┌──────────┬─────────────┬┴─────────┐
                              ▼          ▼             ▼          ▼
                         ┌────────┐ ┌────────┐  ┌────────┐ ┌────────┐
                         │ Valid  │ │Invalid │  │Expired │ │Already │
                         │ Issue  │ │Count   │  │ Return │ │Used    │
                         │ JWT    │ │Failure │  │ Error  │ │Return  │
                         │        │ │       │  │        │ │Error   │
                         └────────┘ └────────┘  └────────┘ └────────┘
```

### C.8 Expiration Policies

| Channel | TTL | Rationale |
|---------|-----|-----------|
| SMS | 90 seconds | Existing behavior, fast delivery |
| WhatsApp | 90 seconds | Existing behavior, fast delivery |
| Email | 300 seconds (5 min) | D-6: accounts for slower email delivery |

### C.9 Rate Limiting

**Per-subject limits:**
| Action | Limit | Window | Key |
|--------|-------|--------|-----|
| OTP request | 5 | 15 min | `otp:req:{subject}` or `otp:email:req:{email}` |
| OTP verify failure | 10 | 15 min | `otp:vatt:{subject}` or `otp:email:vatt:{email}` |

**Per-IP limits (existing):**
| Action | Limit | Window | Key |
|--------|-------|--------|-----|
| OTP request | 20 | 1 min | `throttle:otp-request:{ip}` |
| OTP verify | 40 | 1 min | `throttle:otp-verify:{ip}` |

### C.10 Replay Prevention

1. **Single-active-challenge:** New challenge supersedes existing (CREATE_CHALLENGE Lua)
2. **Atomic consumption:** VERIFY_AND_CONSUME marks challenge as consumed in same operation
3. **Consumed flag:** Once `co: true`, challenge cannot be reused
4. **Redis TTL:** Expired challenges auto-cleaned

### C.11 Supersession Behavior

When a new OTP is requested for the same subject before the previous challenge expires:
- Previous challenge is **overwritten** (not appended)
- Previous OTP becomes invalid
- Rate limit counter is NOT reset
- New TTL starts from creation time

---

## Part D: Delivery Provider Design

### D.1 Provider Interface (Extended)

> **S1.34.1 Correction:** The `OtpDeliveryChannel` type exposed in public API DTOs must NOT include `'mock'`. The mock adapter is an internal test-only construct that must never be selectable through public API endpoints. Public DTOs accept only `'email' | 'sms' | 'whatsapp'`. The mock provider is selected internally by the test harness, not by API consumers.

```typescript
// PUBLIC type — used in API DTOs and client contracts
// 'mock' is deliberately excluded
export type OtpDeliveryChannel = 'sms' | 'whatsapp' | 'email';

// INTERNAL type — used only by the provider registry and test harness
export type InternalDeliveryChannel = OtpDeliveryChannel | 'mock';

export interface OtpDeliveryRequest {
  subject: ChallengeSubject;      // generalized from phone-only
  otp: string;
  channel: InternalDeliveryChannel; // internal use only — API never accepts 'mock'
  correlationId?: string;
  metadata?: {
    userName?: string;            // for email personalization
    appName?: string;             // for email branding
  };
}

export interface OtpDeliveryResult {
  success: boolean;
  status: 'delivered' | 'failed' | 'timeout' | 'skipped';
  messageId?: string;
  errorReason?: string;
  retryable: boolean;
  deliveryOutcome: 'accepted' | 'rejected' | 'unknown';
}

// IMPORTANT: deliveryOutcome 'accepted' means the provider accepted the message
// for delivery. It does NOT confirm that the message reached the end user's
// handset or mailbox. Network failures after provider acceptance are possible.

export interface NotificationProvider {
  readonly name: string;
  readonly channel: InternalDeliveryChannel;
  sendOtp(request: OtpDeliveryRequest): Promise<OtpDeliveryResult>;
  isConfigured(): boolean;
}
```

**Public API DTO (no 'mock' channel):**
```typescript
// This is what API consumers see — 'mock' is not an option
class RequestOtpDto {
  @IsOptional()
  @IsIn(['sms', 'whatsapp', 'email'])
  channel?: 'sms' | 'whatsapp' | 'email';
}
```

### D.2 Provider Registry

> **S1.34.1 Correction:** The registry must separate internal test-provider wiring from public channel selection. The mock provider is wired only through NestJS dependency injection in test/development environments — it is never reachable through API input.

```typescript
@Injectable()
export class ProviderRegistryService {
  // Public channels — reachable through API
  private readonly publicProviders = new Map<OtpDeliveryChannel, NotificationProvider>();
  // Internal test channel — never reachable through API
  private readonly testProvider?: MockNotificationProvider;

  constructor(
    @Optional() smtp?: SmtpEmailProvider,
    @Optional() twilio?: TwilioSmsProvider,
    @Optional() whatsapp?: WhatsAppProvider,
    @Optional() mock?: MockNotificationProvider,
  ) {
    const env = process.env['NODE_ENV'];
    const isProductionLike = env === 'production' || env === 'staging';

    // Guard: mock provider must NEVER be registered in production or staging
    if (mock && isProductionLike) {
      throw new Error(
        `FATAL: MockNotificationProvider cannot be registered in ${env} environment`
      );
    }

    if (smtp?.isConfigured()) this.publicProviders.set('email', smtp);
    if (twilio?.isConfigured()) this.publicProviders.set('sms', twilio);
    if (whatsapp?.isConfigured()) this.publicProviders.set('whatsapp', whatsapp);

    // Mock: stored separately, only in test/development
    if (!isProductionLike && mock) {
      this.testProvider = mock;
    }
  }

  // Public API — only returns real providers
  getProvider(channel: OtpDeliveryChannel): NotificationProvider | undefined {
    return this.publicProviders.get(channel);
  }

  // Test-only — not accessible from controllers
  getTestProvider(): MockNotificationProvider | undefined {
    const env = process.env['NODE_ENV'];
    if (env === 'production' || env === 'staging') {
      throw new Error('getTestProvider is not available in production or staging');
    }
    return this.testProvider;
  }

  isChannelConfigured(channel: OtpDeliveryChannel): boolean {
    return this.publicProviders.has(channel);
  }
}
```

### D.3 No Silent Fallback

```typescript
async deliverOtp(request: OtpDeliveryRequest): Promise<OtpDeliveryResult> {
  const provider = this.registry.getProvider(request.channel);

  // No fallback — reject if channel not configured
  if (!provider) {
    return {
      success: false,
      status: 'failed',
      errorReason: `${request.channel.toUpperCase()}_PROVIDER_NOT_CONFIGURED`,
      retryable: false,
      deliveryOutcome: 'rejected',
    };
  }

  // Validate subject type matches channel
  if (request.channel === 'email' && request.subject.type !== 'email') {
    return {
      success: false,
      status: 'failed',
      errorReason: 'EMAIL_CHANNEL_REQUIRES_EMAIL_SUBJECT',
      retryable: false,
      deliveryOutcome: 'rejected',
    };
  }

  if (
    (request.channel === 'sms' || request.channel === 'whatsapp') &&
    request.subject.type !== 'phone'
  ) {
    return {
      success: false,
      status: 'failed',
      errorReason: 'PHONE_CHANNEL_REQUIRES_PHONE_SUBJECT',
      retryable: false,
      deliveryOutcome: 'rejected',
    };
  }

  // Attempt delivery with timeout
  try {
    return await this.withTimeout(provider.sendOtp(request), 10_000);
  } catch (error) {
    return {
      success: false,
      status: 'timeout',
      errorReason: 'DELIVERY_TIMEOUT',
      retryable: true,
      deliveryOutcome: 'unknown',
    };
  }
}
```

### D.4 Mock Provider Constraints (D-2)

| Constraint | Implementation |
|-----------|----------------|
| Never in production | Constructor throws if `NODE_ENV=production` or `staging` |
| Never return OTP in API response | `sendOtp()` returns `{ status: 'skipped' }` without OTP value |
| Test retrieval method | `getGeneratedOtp(subject)` only available via direct service injection |
| Clear logging | All mock deliveries logged with `[MOCK]` prefix |
| Auto-cleanup | Generated OTPs expire after 5 minutes |

### D.5 Production Authorization

Real external messages (SMS, WhatsApp, email) require:
1. Explicit provider configuration in environment
2. Approved test destinations in staging (whitelisted phone numbers/emails)
3. `NODE_ENV` must not be `test` or `development` for real delivery
4. Provider must pass `isConfigured()` check

### D.6 SMTP Email Provider

**Email template requirements:**
- Plain text and HTML versions
- 6-digit OTP code prominently displayed
- Expiration time (5 minutes) clearly stated
- Security notice for non-requested codes
- Branding elements consistent with platform
- Correlation ID in `X-SCS-Correlation-Id` header
- No external images or linked CSS

**Error classification:**
| Error Code | Classification | Retryable |
|-----------|----------------|-----------|
| ETIMEDOUT, ECONNRESET | unknown | Yes |
| ECONNREFUSED | rejected | No |
| 429 | unknown | Yes |
| 500, 502, 503, 504 | unknown | Yes |
| 400, 401, 403, 404 | rejected | No |
| 550 (mailbox not found) | rejected | No |

---

## Part E: TOTP and Recovery Design

### E.1 TOTP Enrollment Workflow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  User    │    │  API     │    │  TOTP    │    │  Redis   │    │  Postgres│
│  Request │───▶│  Endpoint│───▶│  Service │───▶│  (N/A)   │    │  (Store) │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                     │                                  │
                     ▼                                  │
              ┌──────────┐                              │
              │ Generate │                              │
              │ Secret   │                              │
              │ (32B)    │                              │
              └────┬─────┘                              │
                   │                                    │
                   ▼                                    │
          ┌────────────────┐                            │
          │ Create Pending │                            │
          │ Enrollment     │                            │
          │ (Redis, 15min) │                            │
          └────┬───────────┘                            │
               │                                        │
               ▼                                        │
        ┌──────────────┐                                │
        │ Generate QR  │                                │
        │ URI          │                                │
        │ (otpauth://) │                                │
        └────┬─────────┘                                │
             │                                          │
             ▼                                          │
        ┌──────────────┐                                │
        │ Return to    │                                │
        │ Client       │─────── User scans QR ─────────▶│
        │ (secret +    │                                │
        │  QR URI)     │                                │
        └──────────────┘                                │
                                                        │
             User enters 6-digit code from app          │
                     │                                  │
                     ▼                                  │
              ┌──────────┐                              │
              │ Verify   │                              │
              │ Code     │                              │
              └────┬─────┘                              │
                   │                                    │
                   ▼                                    │
            ┌──────────────┐                            │
            │ Encrypt      │                            │
            │ Secret       │                            │
            │ (AES-256-GCM)│                            │
            └────┬─────────┘                            │
                 │                                      │
                 ▼                                      │
          ┌──────────────┐                              │
          │ Store Active │                              │
          │ Secret       │─────────────────────────────▶│
          │ (status=     │                              │
          │  ACTIVE)     │                              │
          └──────────────┘                              │
```

### E.2 TOTP Secret Generation

```typescript
function generateTotpSecret(): string {
  const buffer = crypto.randomBytes(32); // 256 bits
  return base32.encode(buffer).toString(); // base32-encoded for QR
}
```

### E.3 QR Provisioning URI

```
otpauth://totp/SCS%20Platform:{email}?
  secret={base32_secret}
  &issuer=SCS%20Platform
  &algorithm=SHA1
  &digits=6
  &period=30
```

### E.4 AES-256-GCM Encryption (D-3)

**Key management:**
- Encryption key: `TOTP_ENCRYPTION_KEY` environment variable (32 bytes hex)
- Independent of `OTP_HMAC_SECRET` and JWT secrets
- **Production:** Cryptographically secure key REQUIRED. Application must fail closed (refuse to start) if key is missing or too short.
- **Development:** Use a securely generated local-only key (e.g., `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) stored in `.env.local`. Never commit development keys. Never use a zero-filled or hardcoded fallback buffer.
- **No zero-filled fallback:** The previous design used `Buffer.alloc(32, 0)` when the key was absent in development. This is REMOVED. Both production and development must provide a real key or fail closed.

**Key storage and backup:**
- Store key in a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault) or encrypted environment variable store
- Maintain at least 2 independent backups in separate secure locations
- Document key location in operations runbook
- Restrict access to key material to deployment pipeline and on-call security team

**Key rotation procedure:**
1. Generate new `TOTP_ENCRYPTION_KEY`
2. Deploy application with both old and new keys (new key primary, old key fallback for decryption)
3. Background job re-encrypts all active secrets with new key
4. Verify all secrets decrypt correctly with new key
5. Remove old key from configuration
6. Confirm no unrecoverable secrets (any secret that cannot be decrypted with either key must trigger an alert and force user re-enrollment)

**Key compromise procedure:**
1. Immediately rotate to new key
2. Force re-enrollment for all users with active TOTP secrets
3. Invalidate all existing TOTP secrets
4. Notify affected users
5. Audit log review for unauthorized access

**Encryption process:**
```typescript
encrypt(plaintext: string): { encrypted: Buffer; iv: Buffer; authTag: Buffer } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { encrypted, iv, authTag };
}
```

### E.5 Time-Window Policy

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Algorithm | SHA1 | Standard TOTP (RFC 6238) |
| Digits | 6 | User-friendly, sufficient entropy |
| Period | 30 seconds | Standard time step |
| Window | ±1 step | Accept codes from previous, current, and next window (90s total) |
| Clock skew tolerance | ±30 seconds | Accounts for device clock drift |

### E.6 TOTP Replay Protection

```sql
-- Log each verified time step
CREATE TABLE totp_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  time_step BIGINT NOT NULL,  -- floor(unix_timestamp / 30)
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, time_step)  -- prevent same time step reuse
);
```

**Verification logic:**
1. Compute current time step: `floor(Date.now() / 1000 / 30)`
2. Check time steps: `current - 1`, `current`, `current + 1`
3. For each: check `totp_usage_log` for existing entry
4. If code matches and time step not used → accept, insert log entry
5. If time step already used → reject with `REPLAY_DETECTED`

### E.7 TOTP Rate Limits

| Action | Limit | Window | Key |
|--------|-------|--------|-----|
| Verification | 5 attempts | 5 minutes | `totp:verify:{userId}` |
| Enrollment | 3 attempts | 1 hour | `totp:enroll:{userId}` |

### E.8 TOTP Disablement

**Requires re-authentication:**
1. User must provide valid password OR verify OTP via email/phone
2. Re-authentication token validated before disablement
3. Secret marked as `DISABLED` (not deleted — audit trail)
4. Audit event logged with device info

### E.9 TOTP Database Schema

```sql
CREATE TABLE totp_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_secret BYTEA NOT NULL,
  iv BYTEA NOT NULL,
  auth_tag BYTEA NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  confirmed_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX totp_secrets_active_per_user_idx
  ON totp_secrets(user_id) WHERE status = 'ACTIVE';

CREATE INDEX totp_secrets_user_id_idx ON totp_secrets(user_id);
```

### E.10 Recovery Code Generation (D-4)

**Algorithm:**
```typescript
function generateRecoveryCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`; // XXXX-XXXX format
}

function generateRecoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => generateRecoveryCode());
}
```

**Properties:**
- 10 codes per user (D-4)
- 8 characters each, hyphenated for readability
- Character set excludes ambiguous characters (0/O, 1/I/L)
- ~4.7 × 10^11 possible codes per format

### E.11 Recovery Code Hashing and Storage

```typescript
// Hashing (bcrypt, cost factor 12)
async function hashRecoveryCode(code: string): Promise<string> {
  return bcrypt.hash(code.toUpperCase(), 12);
}

// Storage: only hashes stored, never plaintext
async function storeRecoveryCodes(userId: string, plaintextCodes: string[]) {
  const hashes = await await Promise.all(plaintextCodes.map(hashRecoveryCode));
  await db.insert(recoveryCodes).values(
    hashes.map(hash => ({ userId, codeHash: hash }))
  );
}
```

### E.12 Recovery Code Consumption

> **S1.34.1 Correction:** Consumption must be **atomic** using a conditional UPDATE. The previous design used a read-then-write pattern that allowed concurrent requests to consume the same code. Additionally, recovery code contents or prefixes must **never** be logged.

```typescript
async function verifyRecoveryCode(userId: string, inputCode: string) {
  // 1. Rate limit check (layered — see E.14)
  const rateLimitOk = await this.checkRateLimit(userId, 'recovery-verify', 5, 300);
  if (!rateLimitOk) return { valid: false, reason: 'RATE_LIMITED' };

  // 2. Get all unused codes for user
  const codes = await db.query.recoveryCodes.findMany({
    where: and(
      eq(recoveryCodes.userId, userId),
      isNull(recoveryCodes.usedAt),
      isNull(recoveryCodes.invalidatedAt),
    ),
  });

  // 3. Check input against each hash
  for (const code of codes) {
    const match = await bcrypt.compare(inputCode.toUpperCase(), code.codeHash);
    if (match) {
      // 4. ATOMIC consumption via conditional UPDATE
      //    Only succeeds if used_at is still NULL (prevents concurrent double-use)
      const result = await db.update(recoveryCodes)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(recoveryCodes.id, code.id),
            isNull(recoveryCodes.usedAt),  // conditional: only if not already consumed
          )
        )
        .returning({ id: recoveryCodes.id });

      if (result.length === 0) {
        // Concurrent request already consumed this code
        return { valid: false, reason: 'ALREADY_USED' };
      }

      // 5. Audit log — NEVER log code contents or prefixes
      await this.auditService.log({
        userId,
        action: 'RECOVERY_CODE_USED',
        metadata: { codeId: code.id },  // only internal ID, no code content
      });

      return { valid: true };
    }
  }

  return { valid: false, reason: 'INVALID_CODE' };
}
```

**Concurrency proof:**
- The conditional `WHERE used_at IS NULL` in the UPDATE ensures that exactly one concurrent request can mark a code as used
- PostgreSQL row-level locking guarantees atomicity
- If two requests arrive simultaneously with the same code, one succeeds and the other receives `ALREADY_USED`
- No application-level lock is needed; the database enforces single-use

### E.13 Recovery Code Regeneration

> **S1.34.1 Correction:** Regeneration must **atomically** invalidate all previous codes in a single transaction.

- Generating new set **atomically invalidates all previous codes** in a single database transaction
- Transaction: `BEGIN` → `UPDATE ... SET invalidated_at = NOW()` for all unused codes → `INSERT` new codes → `COMMIT`
- Previous codes marked with `invalidated_at` timestamp (not deleted — audit trail preserved)
- New set of 10 codes generated and hashed
- User shown new codes once (not stored in plaintext)
- If transaction fails, no codes are changed (atomic all-or-nothing)

```sql
-- Atomic regeneration in a single transaction
BEGIN;
UPDATE recovery_codes
  SET invalidated_at = NOW()
  WHERE user_id = $1 AND used_at IS NULL AND invalidated_at IS NULL;
INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2), ($1, $3), ...;
COMMIT;
```

### E.14 Account Denial-of-Service Protection

> **S1.34.1 Correction:** Automatic account lockout after N failures is REMOVED. Lockout creates a denial-of-service vector against legitimate account owners — an attacker can intentionally exhaust someone's recovery codes or lock their account. Instead, use layered rate limiting, progressive delays, monitoring, and notification.

| Protection | Mechanism |
|-----------|-----------|
| **Layered rate limiting** | Per-user: 5 attempts per 15 min. Per-IP: 10 attempts per 15 min. Per-account-per-IP: 3 attempts per 1 hour. |
| **Progressive delay** | After 3 consecutive failures: +2s delay. After 5: +5s. After 8: +15s. Delays are server-side and apply before bcrypt comparison. |
| **Monitoring and alerting** | Alert security team when a user account has >5 failures in 1 hour. Alert on unusual geographic distribution of attempts. |
| **User notification** | Email user after each successful recovery code use. Email user if >3 failures detected within 1 hour. |
| **Audit trail** | Log all attempts (success and failure) with IP, user agent, and timestamp. Never log recovery code contents or prefixes. |
| **Code exhaustion warning** | Warn user when fewer than 3 codes remain. |
| **No automatic lockout** | Legitimate users must never be locked out of their own accounts. Progressive delays and monitoring replace hard lockout. |
| **No code prefix logging** | Recovery code contents and prefixes are NEVER written to logs, audit metadata, or error messages. |

### E.15 Recovery Database Schema

```sql
CREATE TABLE recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash VARCHAR(255) NOT NULL,
  used_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,  -- set when regenerated
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX recovery_codes_user_id_idx ON recovery_codes(user_id);
CREATE INDEX recovery_codes_unused_idx ON recovery_codes(user_id)
  WHERE used_at IS NULL AND invalidated_at IS NULL;
```

---

## Part F: Passkey (WebAuthn) Design

### F.1 WebAuthn Configuration

```typescript
const WEBAUTHN_CONFIG = {
  rpId: process.env['WEBAUTHN_RP_ID'] || 'localhost',
  rpName: process.env['WEBAUTHN_RP_NAME'] || 'SCS Platform',
  origin: process.env['WEBAUTHN_ORIGIN'] || 'http://localhost:3100',
  timeout: 60_000,                    // 60 seconds
  attestationType: 'none' as const,   // privacy-preserving
  userVerification: 'required' as const, // D-5: always require
};
```

### F.2 Registration Flow

```
┌──────┐        ┌──────┐        ┌──────────┐        ┌──────────┐
│ User │        │ API  │        │ Passkeys │        │ Postgres │
│      │        │      │        │ Service  │        │          │
└──┬───┘        └──┬───┘        └────┬─────┘        └────┬─────┘
   │ 1. Request    │                 │                    │
   │   registration│                 │                    │
   ├──────────────▶│                 │                    │
   │               │ 2. Generate     │                    │
   │               │    challenge    │                    │
   │               ├────────────────▶│                    │
   │               │                 │ 3. Store challenge │
   │               │                 │    (Redis/DB)      │
   │               │ 4. Return       │                    │
   │               │    options      │                    │
   │               │◀────────────────┤                    │
   │ 5. Return     │                 │                    │
   │    options    │                 │                    │
   │◀──────────────┤                 │                    │
   │               │                 │                    │
   │ 6. Platform authenticator       │                    │
   │    (biometric/PIN)              │                    │
   │    creates credential           │                    │
   │               │                 │                    │
   │ 7. Send       │                 │                    │
   │    attestation│                 │                    │
   │    response   │                 │                    │
   ├──────────────▶│                 │                    │
   │               │ 8. Verify       │                    │
   │               │    attestation  │                    │
   │               ├────────────────▶│                    │
   │               │                 │ 9. Store credential│
   │               │                 │    public key      │
   │               │                 ├───────────────────▶│
   │               │ 10. Success     │                    │
   │               │◀────────────────┤                    │
   │ 11. Return    │                 │                    │
   │     success   │                 │                    │
   │◀──────────────┤                 │                    │
```

### F.3 Authentication Flow

```
┌──────┐        ┌──────┐        ┌──────────┐        ┌──────────┐
│ User │        │ API  │        │ Passkeys │        │ Postgres │
│      │        │      │        │ Service  │        │          │
└──┬───┘        └──┬───┘        └────┬─────┘        └────┬─────┘
   │ 1. Request    │                 │                    │
   │   auth options│                 │                    │
   ├──────────────▶│                 │                    │
   │               │ 2. Generate     │                    │
   │               │    challenge    │                    │
   │               │    + get user's │                    │
   │               │      credentials│                    │
   │               ├────────────────▶│                    │
   │               │                 │ 3. Query credentials
   │               │                 │◀───────────────────┤
   │               │ 4. Return       │                    │
   │               │    auth options │                    │
   │               │◀────────────────┤                    │
   │ 5. Return     │                 │                    │
   │    options    │                 │                    │
   │◀──────────────┤                 │                    │
   │               │                 │                    │
   │ 6. Platform authenticator       │                    │
   │    (biometric/PIN)              │                    │
   │    signs assertion              │                    │
   │               │                 │                    │
   │ 7. Send       │                 │                    │
   │    assertion  │                 │                    │
   │    response   │                 │                    │
   ├──────────────▶│                 │                    │
   │               │ 8. Verify       │                    │
   │               │    signature    │                    │
   │               │    + counter    │                    │
   │               ├────────────────▶│                    │
   │               │                 │ 9. Update counter  │
   │               │                 ├───────────────────▶│
   │               │ 10. Issue JWT   │                    │
   │               │    +    +       │                    │
   │               │◀────────────────┤                    │
   │ 11. Return    │                 │                    │
   │     JWT pair  │                 │                    │
   │◀──────────────┤                 │                    │
```

### F.4 RP ID and Origin Validation

| Field | Value | Purpose |
|-------|-------|---------|
| RP ID | `scsp.dev` (production), `localhost` (dev) | Domain for credential binding |
| Origin | `https://app.scsp.dev` (production) | Prevents cross-origin attacks |
| Validation | Exact match required | No subdomain wildcards |

### F.5 User Verification (D-5)

- `userVerification: 'required'` for both registration and authentication
- Platform authenticator must perform biometric or PIN verification
- Cross-platform authenticators (security keys) must support user verification
- Credentials without user verification capability are rejected

### F.6 Credential Storage

```sql
CREATE TABLE webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id VARCHAR(512) NOT NULL UNIQUE,
  public_key BYTEA NOT NULL,
  sign_count BIGINT NOT NULL DEFAULT 0,
  aaguid UUID,
  device_name VARCHAR(160),
  device_type VARCHAR(20), -- 'platform' or 'cross-platform'
  transports VARCHAR(100), -- JSON array: '["internal","hybrid"]'
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX webauthn_credentials_user_id_idx ON webauthn_credentials(user_id);
```

### F.7 Multiple Credentials Per User

- Users can register multiple passkeys (e.g., phone + laptop)
- Each credential has unique `credential_id`
- Authentication returns list of allowed credentials for user
- User can select which credential to use via platform UI

### F.8 Credential Revocation

**Removal flow:**
1. User authenticates with password or another passkey (re-authentication)
2. User selects credential to remove
3. Credential marked as revoked (`revoked_at` timestamp)
4. Audit event logged
5. User notified via email

**Safety constraint:** Cannot remove last credential if no other authentication method is configured.

### F.9 Lost-Device Recovery

**Scenario:** User loses device with platform authenticator.

**Recovery options (in priority order):**
1. Use another registered passkey on different device
2. Use recovery code + password
3. Use email OTP + password to access account, then re-register passkey
4. Account recovery flow (email verification + admin approval)

**Prevention:** Encourage users to register at least 2 passkeys and save recovery codes.

### F.10 Authenticator Counter Handling

> **S1.34.1 Correction:** The previous design assumed all authenticators provide a monotonically increasing sign counter and treated any regression as a cloned authenticator. This is incorrect. Not all authenticators implement sign counters — some always return 0, and some may not increment consistently. The counter must be treated as a **heuristic signal**, not a definitive clone detector.

**Counter handling policy:**

| Stored `signCount` | Received `signCount` | Action |
|-------------------|---------------------|--------|
| 0 | 0 | **Accept.** Authenticator does not implement counters. Update not needed. |
| 0 | >0 | **Accept.** First non-zero counter value. Store it. |
| >0 | >stored | **Accept.** Normal increment. Update stored value. |
| >0 | =stored | **Accept but log warning.** Possible authenticator sync issue or concurrent use of same authenticator. Do not reject. |
| >0 | <stored | **Flag and alert.** Possible cloned authenticator. Accept the authentication (do not lock out the legitimate user) but log a `PASSKEY_COUNTER_ANOMALY` audit event and notify the user via email. |

```typescript
// Corrected counter handling — does NOT assume monotonic counter
function handleCounter(
  stored: bigint,
  received: bigint,
  credentialId: string,
  userId: string,
): { accept: boolean; updateTo: bigint; alert: boolean } {
  // Both zero: authenticator doesn't track counters
  if (stored === 0n && received === 0n) {
    return { accept: true, updateTo: 0n, alert: false };
  }

  // Normal increment
  if (received > stored) {
    return { accept: true, updateTo: received, alert: false };
  }

  // Equal (non-zero): suspicious but don't reject
  if (received === stored && stored > 0n) {
    return { accept: true, updateTo: stored, alert: true };
  }

  // Regression: possible clone — alert but do NOT lock out user
  if (received < stored) {
    return { accept: true, updateTo: stored, alert: true };
  }

  return { accept: true, updateTo: stored, alert: false };
}
```

**Key principle:** Never reject an authentication solely based on counter value. Counter anomalies trigger alerts and user notification, not access denial. This prevents authenticator bugs or sync issues from locking out legitimate users.

### F.11 Web Platform Implementation

**Browser API:**
```typescript
// Registration
const options = await fetch('/v1/auth/passkeys/register/options').then(r => r.json());
const credential = await navigator.credentials.create({ publicKey: options });
await fetch('/v1/auth/passkeys/register/verify', {
  method: 'POST',
  body: JSON.stringify(credential),
});

// Authentication
const options = await fetch('/v1/auth/passkeys/authenticate/options').then(r => r.json());
const credential = await navigator.credentials.get({ publicKey: options });
const response = await fetch('/v1/auth/passkeys/authenticate/verify', {
  method: 'POST',
  body: JSON.stringify(credential),
});
// response contains { accessToken, refreshToken }
```

**Libraries:** `@simplewebauthn/browser` for WebAuthn API wrapper.

### F.12 Flutter Platform Implementation

> **S1.34.1 Correction:** Flutter passkey support is **NOT validated** and must NOT be claimed as complete in any release gate. The native implementation approach must be validated against actual iOS and Android devices before any Flutter passkey feature is released. Until validation is complete, Flutter users must use alternative authentication methods (email OTP, TOTP, recovery codes, password).

**Challenge:** Flutter does not have a built-in WebAuthn API.

**Candidate approaches (all require validation before release):**
1. **WebView approach:** Use `webview_flutter` to embed browser-based WebAuthn — compatibility varies across iOS/Android WebView versions
2. **Platform channels:** Native iOS (`ASAuthorizationSecurityKeyPublicKeyCredentialProvider`) and Android (`Fido2ApiClient`) — requires custom native code and platform-channel bridge
3. **Third-party package:** `flutter_passkeys` or similar community packages — maturity and maintenance status must be evaluated

**Required validation before release:**
- [ ] Test on iOS 16+ with Face ID and Touch ID
- [ ] Test on Android 14+ with fingerprint and screen lock
- [ ] Verify credential storage and retrieval across app restarts
- [ ] Verify behavior when multiple authenticators are registered
- [ ] Test error handling for unsupported devices
- [ ] Verify WebView fallback on older OS versions

**Until validation is complete:**
- Flutter passkey registration and authentication endpoints must be feature-flagged off
- Flutter clients must gracefully degrade to email OTP + password + TOTP
- Release gates must include explicit Flutter passkey validation evidence

### F.13 Session Issuance via Passkey

Passkey authentication follows the same JWT issuance flow as other methods:
1. Verify WebAuthn assertion
2. Update credential counter
3. Find user by credential ID
4. Check device trust (existing flow)
5. Issue JWT access + refresh tokens
6. Create session record with `authMethod: 'passkey'`

### F.14 Passkey Audit Events

| Event | Metadata |
|-------|----------|
| `PASSKEY_REGISTRATION_INITIATED` | `{ deviceType }` |
| `PASSKEY_REGISTERED` | `{ credentialId (masked), deviceName, deviceType }` |
| `PASSKEY_AUTHENTICATION_SUCCESS` | `{ credentialId (masked) }` |
| `PASSKEY_AUTHENTICATION_FAILURE` | `{ reason, credentialId (masked) }` |
| `PASSKEY_CLONE_DETECTED` | `{ credentialId (masked), previousCount, receivedCount }` |
| `PASSKEY_REMOVED` | `{ credentialId (masked), deviceName }` |

---

## Part G: API and Client Compatibility

### G.1 Existing Endpoints (Unchanged)

| Method | Path | Status |
|--------|------|--------|
| POST | `/v1/auth/otp/request` | ✅ Unchanged (phone OTP) |
| POST | `/v1/auth/otp/verify` | ✅ Unchanged (phone OTP) |
| POST | `/v1/auth/refresh` | ✅ Unchanged |
| POST | `/v1/auth/logout` | ✅ Unchanged |
| POST | `/v1/auth/switch-org` | ✅ Unchanged |
| POST | `/v1/auth/login/password` | ✅ Unchanged |
| POST | `/v1/auth/login/device-check` | ✅ Unchanged |

### G.2 New Endpoints

#### Email OTP

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/auth/otp/email/request` | Request email OTP |
| POST | `/v1/auth/otp/email/verify` | Verify email OTP |

**Request DTO:**
```typescript
class EmailOtpRequestDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsIn(['login', 'registration', 'password-reset', 'account-verification'])
  purpose?: string;
}

class EmailOtpVerifyDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  deviceInfo?: DeviceInfoDto;
}
```

#### TOTP

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/auth/totp/enroll` | Initiate TOTP enrollment |
| POST | `/v1/auth/totp/verify-enrollment` | Confirm enrollment |
| POST | `/v1/auth/totp/verify` | Verify TOTP code (2FA) |
| DELETE | `/v1/auth/totp/disable` | Disable TOTP |
| POST | `/v1/auth/totp/re-enroll` | Re-enroll (rotation) |
| GET | `/v1/auth/totp/status` | Check enrollment status |

#### Recovery Codes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/auth/recovery/generate` | Generate new codes |
| POST | `/v1/auth/recovery/verify` | Verify code for account access |
| GET | `/v1/auth/recovery/remaining` | Get remaining count |

#### Passkeys

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/auth/passkeys/register/options` | Get registration options |
| POST | `/v1/auth/passkeys/register/verify` | Verify registration |
| POST | `/v1/auth/passkeys/authenticate/options` | Get auth options |
| POST | `/v1/auth/passkeys/authenticate/verify` | Verify authentication |
| GET | `/v1/auth/passkeys/credentials` | List user's credentials |
| DELETE | `/v1/auth/passkeys/credentials/:id` | Remove credential |

#### Account Management

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/auth/account/link-email` | Link email to account |
| POST | `/v1/auth/account/link-phone` | Link phone to account |
| POST | `/v1/auth/account/unlink-email` | Unlink email |
| POST | `/v1/auth/account/unlink-phone` | Unlink phone |
| GET | `/v1/auth/account/identifiers` | Get linked identifiers |

### G.3 Response Contracts

**Email OTP request response:**
```typescript
{ success: true; message: 'Verification code sent to your email' }
// Note: does NOT reveal whether email exists (anti-enumeration)
```

**TOTP enrollment response:**
```typescript
{
  secret: string;         // base32-encoded
  qrCodeUri: string;      // otpauth:// URI
  enrollmentId: string;   // pending enrollment ID
  expiresAt: string;      // ISO timestamp
}
```

**Recovery code generation response:**
```typescript
{
  codes: string[];        // 10 plaintext codes (shown once)
  generatedAt: string;    // ISO timestamp
  message: 'Save these codes securely. They will not be shown again.'
}
```

**Passkey registration options response:**
```typescript
{
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: Array<{ type: 'public-key'; alg: number }>;
  timeout: number;
  attestation: string;
  authenticatorSelection: object;
}
```

### G.4 Error Responses

**Standard error format (existing):**
```typescript
{
  statusCode: number;
  error: string;
  message: string;
  code?: string;  // machine-readable error code
}
```

**New error codes:**
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `TOTP_NOT_ENROLLED` | 400 | User has no active TOTP secret |
| `TOTP_ALREADY_ENROLLED` | 409 | User already has active TOTP |
| `TOTP_INVALID_CODE` | 401 | TOTP code verification failed |
| `TOTP_REPLAY_DETECTED` | 409 | TOTP code already used |
| `RECOVERY_CODE_INVALID` | 401 | Recovery code verification failed |
| `RECOVERY_CODE_USED` | 409 | Recovery code already consumed |
| `PASSKEY_CREDENTIAL_NOT_FOUND` | 404 | WebAuthn credential not registered |
| `PASSKEY_SIGNATURE_INVALID` | 401 | WebAuthn assertion verification failed |
| `PASSKEY_COUNTER_REGRESSION` | 409 | Possible cloned authenticator |
| `IDENTIFIER_ALREADY_LINKED` | 409 | Email/phone linked to another account |
| `CANNOT_UNLINK_LAST_IDENTIFIER` | 400 | Must retain at least one identifier |
| `REAUTHENTICATION_REQUIRED` | 403 | Sensitive operation requires re-auth |

### G.5 Web Client Compatibility

**Existing flows preserved:**
- Phone OTP login (SMS/WhatsApp)
- Email + password login
- Device trust evaluation
- Session refresh

**New flows added:**
- Email OTP login
- TOTP enrollment and verification (2FA)
- Recovery code entry
- Passkey registration and authentication
- Account linking/unlinking UI

**Feature detection:**
```typescript
// Check if WebAuthn is available
const supportsPasskeys = typeof PublicKeyCredential !== 'undefined'
  && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();

// Check authenticator attachment
const supportsPlatformAuth = supportsPasskeys; // platform = built-in
const supportsCrossPlatform = supportsPasskeys; // USB/NFC/BT
```

### G.6 Flutter Client Compatibility

**Existing flows preserved:**
- Phone OTP tab (SMS/WhatsApp)
- Email/Password tab
- Device ID service

**New flows added:**
- Email OTP tab/flow
- TOTP enrollment screen (QR code scanner + manual entry)
- Recovery codes screen (display + save)
- Passkey registration/authentication (platform channel)
- Credential management screen

**Platform-specific considerations:**
- iOS: Face ID / Touch ID via `local_auth` package
- Android: BiometricPrompt via `local_auth` package
- QR code scanning: `mobile_scanner` package
- WebAuthn fallback: WebView-based implementation

### G.7 Backward Compatibility Guarantees

| Guarantee | Implementation |
|-----------|----------------|
| Existing phone OTP endpoints unchanged | No modifications to `RequestOtpDto` or `VerifyOtpDto` |
| Existing JWT claims unchanged | New claims are optional additions |
| Existing sessions valid | No session invalidation during migration |
| Existing phone-first users unaffected | All their flows continue to work |
| API versioning | New endpoints under same `/v1/` namespace (non-breaking additions) |
| Client version tolerance | Old clients continue to work; new features are opt-in |

---

**Document continues in next section with Part H (Security and Test Plan) and Part I (Migration Strategy)...**

---

**Report compiled:** 2026-10-31
**Sprint:** S1.34 Part B–F
**Status:** COMPLETE (Parts B–F)
