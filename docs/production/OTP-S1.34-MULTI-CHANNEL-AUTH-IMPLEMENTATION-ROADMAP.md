# S1.34 Multi-Channel Authentication — Implementation Roadmap

**Sprint:** S1.34 (Deliverable 3 of 4)
**Date:** 2026-10-31
**Repository:** `nabeel2323/scs-platform`
**Baseline commit:** `2abb53881c87724c338e2a2a94b8e9be78e70c23` (origin/develop)
**Companion documents:**
- `OTP-S1.34-MULTI-CHANNEL-AUTH-ARCHITECTURE-ASSESSMENT.md` (Part A — current state audit)
- `OTP-S1.34-MULTI-CHANNEL-AUTH-TARGET-ARCHITECTURE.md` (Parts B–F — target design)
- `OTP-S1.34-MULTI-CHANNEL-AUTH-SECURITY-AND-RELEASE-GATES.md` (acceptance criteria)

---

## Executive Summary

This roadmap defines six independently releasable phases for implementing multi-channel authentication. Each phase is designed to be deployed, tested, and rolled back independently. Phases are ordered by dependency: foundational changes (identity schema) come first, followed by delivery providers, credential methods, and finally client integration.

**Phase overview:**

| Phase | Sprint | Scope | Risk | Dependencies |
|-------|--------|-------|------|-------------|
| **Phase 1** | S1.35–S1.36 | Email-first identity + email OTP | HIGH (schema migration) | None |
| **Phase 2** | S1.37 | TOTP + recovery codes | MEDIUM | Phase 1 |
| **Phase 3** | S1.37 | SMS + WhatsApp provider verification | LOW | Phase 1 |
| **Phase 4** | S1.38 | Passkeys (WebAuthn) | MEDIUM | Phase 1 |
| **Phase 5** | S1.38–S1.39 | Web + Flutter client integration | MEDIUM | Phases 1–4 |
| **Phase 6** | S1.39–S1.40 | Security verification + production activation | LOW | Phases 1–5 |

---

## Phase 1: Email-First Identity and Email OTP

**Target sprint:** S1.35–S1.36
**Duration estimate:** 2 weeks
**Risk level:** HIGH (schema migration affects all user data)

### Scope

1. Make `users.phone` nullable with CHECK constraint
2. Implement email normalization and duplicate prevention
3. Implement account linking/unlinking
4. Generalize OTP challenge lifecycle for email subjects
5. Implement SMTP email provider
6. Implement mock/test delivery adapter
7. Add email OTP API endpoints
8. Extend provider registry with explicit channel selection

### Expected Code Areas

| File | Change Type | Description |
|------|-------------|-------------|
| `identity.schema.ts` | Modify | Make `phone` nullable, add CHECK constraint |
| `account-linking.schema.ts` | New | `account_linking_log` table |
| `identity-resolution.service.ts` | New | Normalization, lookup, linking logic |
| `challenge-lifecycle.service.ts` | New | Generalized OTP challenge management |
| `provider-registry.service.ts` | New | Channel-based provider selection |
| `smtp-email.provider.ts` | New | SMTP delivery implementation |
| `mock.provider.ts` | New | Test-only OTP adapter |
| `otp-delivery.service.ts` | Modify | Delegate to Provider Registry |
| `provider.interface.ts` | Modify | Extend `OtpDeliveryChannel`, generalize request |
| `identity.service.ts` | Modify | Add email OTP methods, generalize existing |
| `auth.controller.ts` | Modify | Add email OTP endpoints |
| `auth.dto.ts` | Modify | Add email OTP DTOs |
| `otp-lua.ts` | Modify | Generalize key namespace for email |
| `.env.example` | Modify | Remove dead `OTP_PROVIDER`, add SMTP config |
| `packages/contracts/src/index.ts` | Modify | Add email OTP Zod schemas |

### Schema Changes

**Migration 00XX: Dual-identifier identity**

```sql
-- Step 1: Make phone nullable
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

-- Step 2: Add CHECK constraint
ALTER TABLE users ADD CONSTRAINT users_require_email_or_phone
  CHECK (phone IS NOT NULL OR email IS NOT NULL);

-- Step 3: Add normalized email index
CREATE UNIQUE INDEX users_email_lower_unique_idx
  ON users (LOWER(email)) WHERE email IS NOT NULL;

-- Step 4: Account linking log
CREATE TABLE account_linking_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(32) NOT NULL,
  email VARCHAR(254),
  phone VARCHAR(20),
  performed_by UUID,
  ip_address INET,
  user_agent VARCHAR(256),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX account_linking_log_user_id_idx ON account_linking_log(user_id);
```

### Migration and Rollback Strategy

> **S1.34.1 Correction:** The original rollback procedure restored `phone NOT NULL`. This is **UNSAFE** once email-only accounts exist. The corrected strategy uses forward-fix and feature-disable.

**Pre-migration checks:**
1. Run duplicate detection query (see Target Architecture C.2)
2. If duplicates found: STOP. Resolve manually before proceeding.
3. Verify all existing users have phone: `SELECT COUNT(*) FROM users WHERE phone IS NULL` must return 0

**Forward migration:**
1. Run migration during maintenance window
2. Verify all existing users have phone (they do — phone-first model)
3. Verify CHECK constraint passes for all rows
4. Verify new index created successfully
5. Run migration verification queries (see Target Architecture C.2 Step 4)
6. Smoke test existing phone OTP flow
7. Smoke test new email OTP flow

**Rollback strategy (SAFE — no destructive reversal):**

| Condition | Action |
|-----------|--------|
| Issue found BEFORE any email-only accounts created | Full reverse migration is safe: drop index, drop constraint, restore NOT NULL |
| Issue found AFTER email-only accounts created | **DO NOT reverse schema.** Use feature-disable: `FLAG_AUTH_EMAIL_OTP=false`. Fix forward. |
| Schema migration causes application errors | Feature-disable. Keep schema changes. Fix application code. |
| Critical data integrity issue | Forward-fix with corrective migration. Never drop email-only users. |

**Rollback decision criteria:**
```sql
-- Check if reverse migration is safe
SELECT COUNT(*) FROM users WHERE phone IS NULL;
-- If result > 0: email-only accounts exist. DO NOT restore NOT NULL.
-- If result = 0: safe to reverse.
```

**Data preservation guarantees:**
- No user data deleted or modified
- No sessions invalidated
- No JWT tokens revoked
- No organization memberships affected
- No account ownership changed

### API Contract Impact

**New endpoints:**
| Method | Path | Request | Response |
|--------|------|---------|----------|
| POST | `/v1/auth/otp/email/request` | `{ email, purpose? }` | `{ success, message }` |
| POST | `/v1/auth/otp/email/verify` | `{ email, otp, deviceId?, deviceInfo? }` | `{ accessToken, refreshToken }` |

**New Zod schemas:**
```typescript
export const EmailOtpRequestSchema = z.object({
  email: z.string().email(),
  purpose: z.enum(['login', 'registration', 'password-reset', 'account-verification']).optional(),
});

export const EmailOtpVerifySchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/),
  deviceId: z.string().max(128).optional(),
  deviceInfo: z.object({
    platform: z.string(),
    userAgent: z.string(),
  }).optional(),
});
```

**Existing endpoints unchanged:**
- `POST /v1/auth/otp/request` — phone OTP (no changes)
- `POST /v1/auth/otp/verify` — phone OTP (no changes)

### Unit Tests

| Test File | Coverage |
|-----------|----------|
| `identity-resolution.service.spec.ts` | Email normalization, phone normalization, duplicate detection |
| `challenge-lifecycle.service.spec.ts` | Challenge creation, consumption, expiration, replay prevention |
| `provider-registry.service.spec.ts` | Provider registration, channel selection, mock isolation |
| `smtp-email.provider.spec.ts` | Email formatting, error classification, timeout handling |
| `mock.provider.spec.ts` | OTP generation, test retrieval, production guard |
| `auth.controller.email-otp.spec.ts` | Email OTP request/verify endpoints |

### Integration Tests

| Test File | Coverage |
|-----------|----------|
| `email-otp-flow.integration.spec.ts` | Full email OTP request → verify → JWT issuance |
| `account-linking.integration.spec.ts` | Link email to phone account, link phone to email account |
| `dual-identifier-registration.integration.spec.ts` | Register with email-only, register with phone-only |
| `mock-provider-isolation.integration.spec.ts` | Mock provider in test env, rejected in production env |

### Security Tests

| Scenario | Test |
|----------|------|
| Email enumeration prevention | Verify same response for existing and non-existing emails |
| Rate limiting (per-email) | Verify 5 requests per 15 min limit |
| Rate limiting (per-IP) | Verify 20 requests per min limit |
| Challenge supersession | Verify new OTP invalidates previous |
| Replay prevention | Verify consumed challenge cannot be reused |
| Mock isolation | Verify mock provider never instantiated in production |
| SMTP credential protection | Verify no credentials logged in error messages |

### Acceptance Criteria

- [ ] Existing phone OTP flow works without changes
- [ ] New email OTP flow works end-to-end
- [ ] `users.phone` is nullable with CHECK constraint
- [ ] Email normalization is case-insensitive
- [ ] Duplicate email/phone detection prevents double registration
- [ ] Account linking requires verified ownership of both identifiers
- [ ] Mock provider only available in test/development
- [ ] SMTP provider delivers email with correct template
- [ ] Rate limiting enforced per-email and per-IP
- [ ] All existing tests pass
- [ ] New tests cover all new functionality
- [ ] No sensitive data logged (OTP values, credentials, PII)
- [ ] API contracts updated and clients regenerated

### Dependencies

| Dependency | Type | Status |
|-----------|------|--------|
| SMTP server (SendGrid/AWS SES/Mailgun) | External | Required for staging |
| Nodemailer library | NPM package | Available |
| Redis (existing) | Infrastructure | Deployed |
| PostgreSQL (existing) | Infrastructure | Deployed |

### Release Blockers

1. SMTP server not configured in staging
2. Schema migration fails on existing data
3. Existing phone OTP tests fail
4. Email enumeration vulnerability detected
5. Mock provider accessible in production environment

---

## Phase 2: TOTP and Recovery Codes

**Target sprint:** S1.37
**Duration estimate:** 1.5 weeks
**Risk level:** MEDIUM (new tables, encryption key management)

### Scope

1. Implement TOTP enrollment workflow (pending → confirmed)
2. Implement TOTP secret encryption (AES-256-GCM)
3. Implement TOTP verification with time-window and replay protection
4. Implement TOTP disablement with re-authentication
5. Implement recovery code generation (10 codes, D-4)
6. Implement recovery code hashing (bcrypt) and storage
7. Implement recovery code one-time consumption
8. Implement recovery code regeneration
9. Add TOTP and recovery code API endpoints
10. Extend audit logging for all new operations

### Expected Code Areas

| File | Change Type | Description |
|------|-------------|-------------|
| `totp.schema.ts` | New | `totp_secrets`, `totp_usage_log` tables |
| `recovery-codes.schema.ts` | New | `recovery_codes` table |
| `totp-encryption.service.ts` | New | AES-256-GCM encrypt/decrypt |
| `totp.service.ts` | New | Enrollment, verification, disablement |
| `recovery-codes.service.ts` | New | Generation, hashing, consumption |
| `auth.controller.ts` | Modify | Add TOTP and recovery endpoints |
| `auth.dto.ts` | Modify | Add TOTP and recovery DTOs |
| `credentialAuditLog` schema | Modify | Extend action enum, add metadata |
| `.env.example` | Modify | Add `TOTP_ENCRYPTION_KEY` |
| `packages/contracts/src/index.ts` | Modify | Add TOTP and recovery Zod schemas |

### Schema Changes

**Migration 00XX: TOTP and recovery codes**

```sql
-- TOTP secrets
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

-- TOTP replay protection
CREATE TABLE totp_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  time_step BIGINT NOT NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, time_step)
);

-- Recovery codes
CREATE TABLE recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash VARCHAR(255) NOT NULL,
  used_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX recovery_codes_user_id_idx ON recovery_codes(user_id);

-- Extend audit log
ALTER TABLE credential_audit_log ADD COLUMN IF NOT EXISTS metadata JSONB;
```

### Migration and Rollback Strategy

> **S1.34.1 Correction:** TOTP encryption key must be cryptographically secure in ALL environments. No zero-filled fallback.

**Forward migration:**
1. Create new tables (no existing data affected)
2. Add metadata column to audit log (nullable, backward compatible)
3. Generate `TOTP_ENCRYPTION_KEY` using `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
4. Add key to environment (required — application refuses to start without it)
5. Store key backup in secrets manager
6. Deploy new services and endpoints
7. Smoke test TOTP enrollment flow
8. Smoke test recovery code generation

**Key management requirements:**
- Production: key stored in secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
- Development: key stored in `.env.local` (never committed)
- Backup: at least 2 independent backups in separate secure locations
- Rotation: see Target Architecture E.4 key rotation procedure
- Compromise: see Target Architecture E.4 key compromise procedure

**Rollback procedure:**
```sql
DROP TABLE IF EXISTS totp_usage_log;
DROP TABLE IF EXISTS totp_secrets;
DROP TABLE IF EXISTS recovery_codes;
ALTER TABLE credential_audit_log DROP COLUMN IF EXISTS metadata;
```

**Rollback conditions:**
- Encryption key compromised and rotation fails
- TOTP enrollment creates invalid secrets
- Recovery codes not properly hashed
- Recovery code atomic consumption fails under concurrent load

### API Contract Impact

**New endpoints:** See Target Architecture Part G.2

**New Zod schemas:**
```typescript
export const TotpEnrollmentSchema = z.object({
  // No input required — enrollment initiated server-side
});

export const TotpVerifyEnrollmentSchema = z.object({
  enrollmentId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
});

export const TotpVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

export const RecoveryCodeVerifySchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/),
});
```

### Unit Tests

| Test File | Coverage |
|-----------|----------|
| `totp-encryption.service.spec.ts` | Encrypt/decrypt, key validation (no zero-fill), IV uniqueness, fail-closed without key |
| `totp.service.spec.ts` | Enrollment, confirmation, verification, disablement, time-window |
| `recovery-codes.service.spec.ts` | Generation, hashing, atomic consumption, atomic regeneration |
| `recovery-codes-concurrency.spec.ts` | Concurrent consumption: prove same code cannot be used twice under parallel requests |
| `totp-replay.spec.ts` | Time step logging, replay detection |

### Integration Tests

| Test File | Coverage |
|-----------|----------|
| `totp-enrollment-flow.integration.spec.ts` | Full enrollment: initiate → QR → confirm → verify |
| `totp-verification.integration.spec.ts` | Valid code, expired code, replay attempt |
| `recovery-code-flow.integration.spec.ts` | Generate → use → verify consumed → regenerate atomically |
| `recovery-code-concurrent.integration.spec.ts` | Parallel verification: only one succeeds |

### Security Tests

| Scenario | Test |
|----------|------|
| TOTP secret encryption | Verify secrets encrypted at rest with AES-256-GCM |
| Key independence | Verify TOTP key ≠ HMAC key ≠ JWT key |
| Key required | Verify application refuses to start without TOTP_ENCRYPTION_KEY |
| No zero-fill fallback | Verify no zero-filled key used in any environment |
| Time-window validation | Verify codes outside ±1 step rejected |
| Replay protection | Verify same time step cannot be used twice |
| Recovery code hashing | Verify only bcrypt hashes stored |
| Recovery code atomic consumption | Verify conditional UPDATE prevents concurrent double-use |
| Recovery code atomic regeneration | Verify transaction invalidates all previous codes atomically |
| Recovery code layered rate limiting | Verify per-user, per-IP, and per-account-per-IP limits |
| Recovery code no lockout | Verify no automatic account lockout after failures |
| Recovery code no prefix logging | Verify no code contents or prefixes in logs |
| Re-authentication for disable | Verify TOTP disable requires password/OTP |
| Audit trail completeness | Verify all operations logged |
| Key rotation | Verify rotation does not cause unrecoverable secrets |

### Acceptance Criteria

- [ ] TOTP enrollment generates valid QR code URI
- [ ] TOTP verification accepts codes within ±1 time step
- [ ] TOTP replay protection prevents same code reuse
- [ ] TOTP secrets encrypted with AES-256-GCM
- [ ] TOTP encryption key independent of other secrets
- [ ] Recovery codes: 10 generated, bcrypt hashed
- [ ] Recovery codes: single-use enforced
- [ ] Recovery codes: regeneration invalidates all previous
- [ ] TOTP disablement requires re-authentication
- [ ] All operations logged to audit trail
- [ ] Atomic consumption: conditional UPDATE prevents concurrent double-use
- [ ] Atomic regeneration: transaction invalidates all previous codes
- [ ] Layered rate limiting: per-user, per-IP, per-account-per-IP enforced
- [ ] No automatic lockout: progressive delays replace hard lockout
- [ ] No code prefix logging: recovery code contents/prefixes never in logs
- [ ] Rate limiting enforced for TOTP and recovery verification

### Dependencies

| Dependency | Type | Status |
|-----------|------|--------|
| `@simplewebauthn/server` | NPM package | Required for Phase 4 |
| `otpauth` or `speakeasy` | NPM package | Required for TOTP |
| `TOTP_ENCRYPTION_KEY` | Environment variable | Required for production |
| Phase 1 (email identity) | Internal | Must be complete |

### Release Blockers

1. TOTP encryption key not configured
2. TOTP library not installed
3. Replay protection not working
4. Recovery codes not properly hashed
5. Audit events not logged

---

## Phase 3: SMS and WhatsApp Provider Verification

**Target sprint:** S1.37 (parallel with Phase 2)
**Duration estimate:** 0.5 weeks
**Risk level:** LOW (existing providers, no new functionality)

### Scope

1. Verify existing Twilio SMS provider against production acceptance criteria
2. Verify existing WhatsApp provider against production acceptance criteria
3. Update providers to use generalized `ChallengeSubject` model
4. Confirm error classification and timeout handling
5. Confirm no sensitive data logging
6. Document production configuration requirements

### Expected Code Areas

| File | Change Type | Description |
|------|-------------|-------------|
| `twilio-sms.provider.ts` | Modify | Generalize subject model |
| `whatsapp.provider.ts` | Modify | Generalize subject model |
| `otp-delivery-providers.real.spec.ts` | Modify | Update tests for generalized model |

### Schema Changes

None.

### Migration and Rollback Strategy

**No migration required.** Provider changes are backward-compatible code updates.

**Rollback:** Revert to previous provider implementation (no data changes).

### API Contract Impact

None. Provider changes are internal.

### Unit Tests

| Test File | Coverage |
|-----------|----------|
| `twilio-sms.provider.spec.ts` | Subject extraction, error classification, timeout |
| `whatsapp.provider.spec.ts` | Subject extraction, error classification, timeout |
| `provider-interface-compatibility.spec.ts` | Both providers implement extended interface |

### Integration Tests

| Test File | Coverage |
|-----------|----------|
| `sms-delivery.integration.spec.ts` | Real SMS delivery to approved test number |
| `whatsapp-delivery.integration.spec.ts` | Real WhatsApp delivery to approved test number |

**Note:** Integration tests require real provider credentials and approved test destinations. Use mock provider for CI.

### Security Tests

| Scenario | Test |
|----------|------|
| Credential protection | Verify no Twilio/WhatsApp credentials logged |
| Phone masking | Verify logs show only last 4 digits |
| Error classification | Verify 400/401/403 → rejected, 429/5xx → unknown |
| Timeout handling | Verify 10-second timeout enforced |

### Acceptance Criteria

- [ ] Twilio SMS provider delivers to E.164 phone numbers
- [ ] WhatsApp provider delivers to approved test numbers
- [ ] Both providers use generalized `ChallengeSubject`
- [ ] Error classification matches specification
- [ ] 10-second timeout enforced
- [ ] No credentials or PII logged
- [ ] Phone numbers masked in logs

### Dependencies

| Dependency | Type | Status |
|-----------|------|--------|
| Twilio account credentials | External | Required for production |
| WhatsApp Business credentials | External | Required for production |
| Approved test destinations | External | Required for integration tests |

### Release Blockers

1. Provider credentials not configured
2. Test destinations not approved
3. Error classification not matching specification
4. Sensitive data found in logs

---

## Phase 4: Passkeys (WebAuthn)

**Target sprint:** S1.38
**Duration estimate:** 2 weeks
**Risk level:** MEDIUM (new technology, platform-specific behavior)

### Scope

1. Implement WebAuthn registration flow
2. Implement WebAuthn authentication flow
3. Implement credential storage and management
4. Implement counter heuristic handling (alert on anomaly, do not reject)
5. Implement credential revocation
6. Add passkey API endpoints
7. Configure RP ID and origin validation

### Expected Code Areas

| File | Change Type | Description |
|------|-------------|-------------|
| `passkeys.schema.ts` | New | `webauthn_credentials`, `webauthn_challenges` tables |
| `passkeys.service.ts` | New | Registration, authentication, credential management |
| `auth.controller.ts` | Modify | Add passkey endpoints |
| `auth.dto.ts` | Modify | Add passkey DTOs |
| `.env.example` | Modify | Add WebAuthn config |
| `packages/contracts/src/index.ts` | Modify | Add passkey Zod schemas |

### Schema Changes

**Migration 00XX: WebAuthn credentials**

```sql
CREATE TABLE webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id VARCHAR(512) NOT NULL UNIQUE,
  public_key BYTEA NOT NULL,
  sign_count BIGINT NOT NULL DEFAULT 0,
  aaguid UUID,
  device_name VARCHAR(160),
  device_type VARCHAR(20),
  transports VARCHAR(100),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX webauthn_credentials_user_id_idx ON webauthn_credentials(user_id);

CREATE TABLE webauthn_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  challenge VARCHAR(255) NOT NULL UNIQUE,
  purpose VARCHAR(20) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX webauthn_challenges_challenge_idx ON webauthn_challenges(challenge);
```

### Migration and Rollback Strategy

**Forward migration:**
1. Create new tables (no existing data affected)
2. Configure `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGIN`
3. Deploy new service and endpoints
4. Smoke test registration flow
5. Smoke test authentication flow

**Rollback procedure:**
```sql
DROP TABLE IF EXISTS webauthn_challenges;
DROP TABLE IF EXISTS webauthn_credentials;
```

### API Contract Impact

**New endpoints:** See Target Architecture Part G.2

**New Zod schemas:**
```typescript
export const PasskeyRegisterOptionsSchema = z.object({
  deviceName: z.string().max(160).optional(),
});

export const PasskeyRegisterVerifySchema = z.object({
  id: z.string(),
  rawId: z.string(),
  type: z.literal('public-key'),
  response: z.object({
    clientDataJSON: z.string(),
    attestationObject: z.string(),
  }),
});

export const PasskeyAuthVerifySchema = z.object({
  id: z.string(),
  rawId: z.string(),
  type: z.literal('public-key'),
  response: z.object({
    clientDataJSON: z.string(),
    authenticatorData: z.string(),
    signature: z.string(),
    userHandle: z.string().optional(),
  }),
});
```

### Unit Tests

| Test File | Coverage |
|-----------|----------|
| `passkeys.service.spec.ts` | Registration, authentication, credential management |
| `webauthn-validation.spec.ts` | RP ID validation, origin validation, user verification |
| `authenticator-counter.spec.ts` | Counter handling: zero counters, non-incrementing, normal increment, anomaly alerting (no rejection) |

### Integration Tests

| Test File | Coverage |
|-----------|----------|
| `passkey-registration-flow.integration.spec.ts` | Full registration: options → attestation → verify |
| `passkey-authentication-flow.integration.spec.ts` | Full auth: options → assertion → verify → JWT |

**Note:** Integration tests require WebAuthn-compatible browser or mock authenticator.

### Security Tests

| Scenario | Test |
|----------|------|
| RP ID validation | Verify credential bound to correct domain |
| Origin validation | Verify cross-origin requests rejected |
| User verification | Verify biometric/PIN required (D-5) |
| Counter: zero value | Verify authenticators with signCount=0 are accepted |
| Counter: non-incrementing | Verify authenticators that don't increment counters are accepted |
| Counter: anomaly alerting | Verify counter regression triggers alert and user notification, NOT access denial |
| Challenge expiry | Verify expired challenges rejected |
| Credential uniqueness | Verify same credential cannot be registered twice |

### Acceptance Criteria

- [ ] WebAuthn registration creates valid credential
- [ ] WebAuthn authentication verifies signature
- [ ] RP ID and origin validation enforced
- [ ] User verification required (D-5)
- [ ] Multiple credentials per user supported
- [ ] Credential removal requires re-authentication
- [ ] Authenticator counter handled as heuristic (not assumed monotonic)
- [ ] Counter anomalies trigger alerts, not access denial
- [ ] Challenge expiry enforced (60 seconds)
- [ ] All operations logged to audit trail

### Dependencies

| Dependency | Type | Status |
|-----------|------|--------|
| `@simplewebauthn/server` | NPM package | Required |
| `@simplewebauthn/browser` | NPM package | Required for web client |
| WebAuthn-compatible browser | External | Required for testing |
| Phase 1 (email identity) | Internal | Must be complete |

### Release Blockers

1. WebAuthn library not installed
2. RP ID not configured
3. User verification not enforced
4. Counter anomaly alerting not working (must alert, not deny)
5. Origin validation not working

---

## Phase 5: Web and Flutter Client Integration

**Target sprint:** S1.38–S1.39
**Duration estimate:** 2 weeks
**Risk level:** MEDIUM (client-side changes, UX testing required)

### Scope

1. Add email OTP login flow to web client
2. Add TOTP enrollment and verification UI to web client
3. Add recovery code display and entry UI to web client
4. Add passkey registration and authentication UI to web client
5. Add credential management UI to web client
6. Add email OTP login flow to Flutter client
7. Add TOTP enrollment and verification UI to Flutter client
8. Add recovery code display and entry UI to Flutter client
9. Add passkey registration and authentication to Flutter client (platform channels)
10. Add credential management UI to Flutter client
11. Regenerate TypeScript and Dart clients from updated contracts

### Expected Code Areas

**Web client:**
| File | Change Type | Description |
|------|-------------|-------------|
| `apps/web/src/lib/auth.ts` | Modify | Add email OTP, TOTP, passkey methods |
| `apps/web/src/components/auth/EmailOtpLogin.tsx` | New | Email OTP login form |
| `apps/web/src/components/auth/TotpEnrollment.tsx` | New | TOTP setup with QR code |
| `apps/web/src/components/auth/TotpVerify.tsx` | New | TOTP verification form |
| `apps/web/src/components/auth/RecoveryCodes.tsx` | New | Recovery code display/save |
| `apps/web/src/components/auth/PasskeyRegister.tsx` | New | Passkey registration |
| `apps/web/src/components/auth/PasskeyLogin.tsx` | New | Passkey authentication |
| `apps/web/src/components/auth/CredentialManagement.tsx` | New | Manage all credentials |

**Flutter client:**
| File | Change Type | Description |
|------|-------------|-------------|
| `mobile/lib/screens/auth/login_screen.dart` | Modify | Add email OTP tab |
| `mobile/lib/screens/auth/totp_enrollment_screen.dart` | New | TOTP setup |
| `mobile/lib/screens/auth/totp_verify_screen.dart` | New | TOTP verification |
| `mobile/lib/screens/auth/recovery_codes_screen.dart` | New | Recovery codes |
| `mobile/lib/screens/auth/passkey_register_screen.dart` | New | Passkey registration |
| `mobile/lib/screens/auth/passkey_login_screen.dart` | New | Passkey authentication |
| `mobile/lib/screens/auth/credential_management_screen.dart` | New | Credential management |
| `mobile/lib/services/passkey_service.dart` | New | Platform channel for WebAuthn |

**Contracts:**
| File | Change Type | Description |
|------|-------------|-------------|
| `packages/contracts/src/index.ts` | Modify | All new Zod schemas |
| Generated TypeScript client | Regenerate | `pnpm --filter @scs/contracts generate` |
| Generated Dart client | Regenerate | Update Flutter imports |

### Schema Changes

None (schema changes completed in Phases 1–4).

### Migration and Rollback Strategy

**No database migration required.** Client changes are additive.

**Rollback:** Revert client code to previous version. API remains backward-compatible.

### API Contract Impact

All new endpoints defined in Phases 1–4. Client integration uses existing contract generation pipeline.

### Unit Tests

**Web client:**
| Test File | Coverage |
|-----------|----------|
| `EmailOtpLogin.test.tsx` | Form validation, API calls, error handling |
| `TotpEnrollment.test.tsx` | QR code display, manual entry, confirmation |
| `RecoveryCodes.test.tsx` | Display, copy, save confirmation |
| `PasskeyRegister.test.tsx` | WebAuthn API calls, error handling |
| `CredentialManagement.test.tsx` | List, remove, re-authentication |

**Flutter client:**
| Test File | Coverage |
|-----------|----------|
| `login_screen_test.dart` | Email OTP tab, form validation |
| `totp_enrollment_screen_test.dart` | QR scanner, manual entry |
| `recovery_codes_screen_test.dart` | Display, copy functionality |
| `passkey_service_test.dart` | Platform channel mocking |

### Integration Tests

| Test File | Coverage |
|-----------|----------|
| `web-auth-flow.e2e.spec.ts` | Full web login with each method |
| `flutter-auth-flow.e2e.spec.ts` | Full Flutter login with each method |
| `cross-client-session.spec.ts` | Session shared between web and Flutter |

### Security Tests

| Scenario | Test |
|----------|------|
| Client-side secret storage | Verify no secrets stored in localStorage/shared preferences |
| XSS prevention | Verify OTP codes not reflected in DOM |
| CSRF protection | Verify state-changing requests use POST with CSRF token |
| Passkey phishing | Verify RP ID validation prevents fake origin |

### Acceptance Criteria

- [ ] Web client supports all 8 authentication methods
- [ ] Flutter client supports all 8 authentication methods
- [ ] Existing phone OTP flow unchanged in both clients
- [ ] Existing password flow unchanged in both clients
- [ ] TOTP QR code scannable by Google Authenticator, Authy, 1Password
- [ ] Recovery codes displayed once with save warning
- [ ] Passkey registration works on Chrome, Safari, Firefox
- [ ] Passkey authentication works on iOS (Face ID/Touch ID) and Android
- [ ] **Flutter passkey support NOT claimed** until native implementation validated on real devices (see Target Architecture F.12)
- [ ] Flutter clients gracefully degrade to email OTP + password + TOTP when passkeys unavailable
- [ ] Credential management UI shows all registered methods
- [ ] Session persistence works across client restarts
- [ ] Generated clients updated from contracts

### Dependencies

| Dependency | Type | Status |
|-----------|------|--------|
| Phase 1 (email OTP API) | Internal | Must be complete |
| Phase 2 (TOTP + recovery API) | Internal | Must be complete |
| Phase 4 (passkeys API) | Internal | Must be complete |
| `mobile_scanner` Flutter package | Pub package | Required for QR scanning |
| `local_auth` Flutter package | Pub package | Required for biometric |
| `flutter_web_auth_2` Flutter package | Pub package | Required for WebAuthn fallback |

### Release Blockers

1. Web client does not support all authentication methods
2. Flutter client does not support all authentication methods (passkeys may be excluded until validated)
3. TOTP QR code not scannable by major authenticator apps
4. Passkey registration fails on major browsers
5. Flutter passkey support claimed without device validation evidence
6. Generated clients not updated

---

## Phase 6: Security Verification and Production Activation

**Target sprint:** S1.39–S1.40
**Duration estimate:** 1 week
**Risk level:** LOW (verification only, no new functionality)

### Scope

1. Independent security review of all new authentication methods
2. Penetration testing of API endpoints
3. Performance testing under load
4. Production environment configuration
5. Monitoring and alerting setup
6. Documentation finalization
7. Production activation (enable real providers)

### Expected Code Areas

| File | Change Type | Description |
|------|-------------|-------------|
| `.env.example` | Finalize | Production-ready configuration |
| `docker-compose.yml` | Modify | Add SMTP service for staging |
| Monitoring dashboards | New | Grafana/Datadog for auth metrics |
| Runbook documentation | New | Operational procedures |

### Schema Changes

None.

### Migration and Rollback Strategy

**No migration required.** Verification and configuration only.

**Rollback:** Disable new authentication methods via feature flags. Revert to phone OTP + password only.

### Security Audit Checklist

**Email OTP:**
- [ ] Email enumeration prevention verified
- [ ] Rate limiting tested (per-email and per-IP)
- [ ] Challenge expiry enforced (5 minutes)
- [ ] Replay prevention working
- [ ] SMTP credentials not logged
- [ ] Mock provider isolated from production

**TOTP:**
- [ ] Secret encryption verified (AES-256-GCM)
- [ ] Key independence confirmed
- [ ] Time-window validation tested
- [ ] Replay protection working
- [ ] Disablement requires re-authentication
- [ ] Audit trail complete

**Recovery codes:**
- [ ] Hashing verified (bcrypt, cost 12)
- [ ] Single-use enforced via atomic conditional UPDATE
- [ ] Atomic regeneration invalidates all previous codes in one transaction
- [ ] Layered rate limiting tested (per-user, per-IP, per-account-per-IP)
- [ ] Progressive delays verified (3 failures: +2s, 5: +5s, 8: +15s)
- [ ] No automatic account lockout after any number of failures
- [ ] No recovery code contents or prefixes in logs
- [ ] Concurrent consumption test: same code cannot succeed twice
- [ ] Audit trail complete

**Passkeys:**
- [ ] RP ID validation tested
- [ ] Origin validation tested
- [ ] User verification enforced
- [ ] Counter handled as heuristic (anomaly alerting, NOT rejection)
- [ ] Zero-value counter accepted
- [ ] Non-incrementing counter accepted with alert
- [ ] Challenge expiry enforced
- [ ] Credential uniqueness verified
- [ ] Flutter passkey NOT released without device validation evidence

**General:**
- [ ] No sensitive data in logs (OTP values, secrets, PII)
- [ ] No sensitive data in API responses (OTP values, secrets)
- [ ] JWT claims do not leak authentication method details
- [ ] Session rotation working for all auth methods
- [ ] Device trust evaluation working for all auth methods

### Performance Tests

| Scenario | Target | Measurement |
|----------|--------|-------------|
| Email OTP request | < 2 seconds | Time from request to email delivery |
| Email OTP verify | < 500 ms | Time from verify to JWT issuance |
| TOTP verify | < 200 ms | Time from verify to JWT issuance |
| Recovery code verify | < 500 ms | Time from verify to JWT issuance |
| Passkey registration | < 3 seconds | Time from options to credential stored |
| Passkey authentication | < 1 second | Time from options to JWT issuance |
| Concurrent OTP requests | 100 req/s | Throughput without degradation |
| Concurrent TOTP verifications | 200 req/s | Throughput without degradation |

### Production Configuration

**Environment variables required:**

```bash
# Email (SMTP)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASSWORD=<production-value>
SMTP_FROM=noreply@scsp.dev

# TOTP encryption
TOTP_ENCRYPTION_KEY=<64-char-hex>

# WebAuthn
WEBAUTHN_RP_ID=scsp.dev
WEBAUTHN_RP_NAME=SCS Platform
WEBAUTHN_ORIGIN=https://app.scsp.dev

# Twilio (existing)
TWILIO_ACCOUNT_SID=<production-value>
TWILIO_AUTH_TOKEN=<production-value>
TWILIO_FROM_NUMBER=<production-value>

# WhatsApp (existing)
WHATSAPP_ACCESS_TOKEN=<production-value>
WHATSAPP_PHONE_NUMBER_ID=<production-value>
WHATSAPP_BUSINESS_ACCOUNT_ID=<production-value>

# OTP (updated)
OTP_TTL_PHONE=90
OTP_TTL_EMAIL=300
OTP_MAX_ATTEMPTS=5
OTP_HMAC_SECRET=<64-char-minimum>
```

**Feature flags:**

```bash
# Enable authentication methods
FLAG_AUTH_EMAIL_OTP=true
FLAG_AUTH_TOTP=true
FLAG_AUTH_RECOVERY_CODES=true
FLAG_AUTH_PASSKEYS=true

# Disable mock provider
FLAG_AUTH_MOCK_PROVIDER=false
```

### Monitoring and Alerting

**Metrics to track:**
- OTP request rate (per channel)
- OTP verification success rate
- OTP verification failure rate (per reason)
- TOTP enrollment count
- TOTP verification success rate
- Recovery code usage count
- Passkey registration count
- Passkey authentication success rate
- Email delivery success rate
- SMS delivery success rate
- WhatsApp delivery success rate

**Alerts to configure:**
- OTP verification failure rate > 20% (potential attack)
- Email delivery failure rate > 10% (SMTP issue)
- TOTP replay attempts detected (security incident)
- Passkey counter anomaly detected (possible cloned authenticator — alert, do not deny)
- Recovery code concurrent consumption attempt detected
- Recovery code progressive delay triggered (>3 failures)
- Rate limit triggers > 100/hour (potential DDoS)

### Acceptance Criteria

- [ ] Security audit passed with no critical findings
- [ ] Performance tests meet targets
- [ ] Production environment configured
- [ ] Monitoring dashboards created
- [ ] Alerts configured
- [ ] Runbook documented
- [ ] Feature flags set for production
- [ ] Mock provider disabled
- [ ] Real providers enabled
- [ ] All authentication methods working end-to-end

### Dependencies

| Dependency | Type | Status |
|-----------|------|--------|
| Phases 1–5 complete | Internal | Required |
| Security audit team | External | Required |
| Production SMTP credentials | External | Required |
| Production Twilio credentials | External | Existing |
| Production WhatsApp credentials | External | Existing |
| Domain for WebAuthn RP ID | External | Required |

### Release Blockers

1. Security audit finds critical vulnerabilities
2. Performance tests fail to meet targets
3. Production credentials not configured
4. Monitoring not set up
5. Runbook not documented

---

## Implementation Sequence and Dependencies

```
S1.35 ──────┐
            ├─▶ Phase 1: Email Identity + Email OTP
S1.36 ──────┘
                  │
                  ▼
S1.37 ──────┐
            ├─▶ Phase 2: TOTP + Recovery Codes
            ├─▶ Phase 3: SMS/WhatsApp Verification (parallel)
            │
S1.38 ──────┐
            ├─▶ Phase 4: Passkeys
            │
S1.38─S1.39─┤
            ├─▶ Phase 5: Web + Flutter Integration
            │
S1.39─S1.40─┘
            │
            ▼
         Phase 6: Security Verification + Production
```

**Critical path:** Phase 1 → Phase 2 → Phase 4 → Phase 5 → Phase 6

**Parallel opportunities:**
- Phase 3 can run in parallel with Phase 2
- Phase 5 can begin for completed phases while others are still in development

---

## Estimated Total Effort

| Phase | Duration | Sprint |
|-------|----------|--------|
| Phase 1: Email Identity + OTP | 2 weeks | S1.35–S1.36 |
| Phase 2: TOTP + Recovery | 1.5 weeks | S1.37 |
| Phase 3: SMS/WhatsApp Verification | 0.5 weeks | S1.37 (parallel) |
| Phase 4: Passkeys | 2 weeks | S1.38 |
| Phase 5: Client Integration | 2 weeks | S1.38–S1.39 |
| Phase 6: Security + Production | 1 week | S1.39–S1.40 |
| **Total** | **~8 weeks** | **S1.35–S1.40** |

---

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Schema migration breaks existing users | HIGH | Test migration on copy of production data; rollback procedure documented |
| TOTP encryption key compromised | HIGH | Key rotation procedure; separate from other secrets |
| Passkey platform incompatibility | MEDIUM | Test on all major browsers and mobile platforms; WebView fallback |
| Email delivery failures | MEDIUM | Retry logic; error classification; monitoring |
| Rate limiting insufficient | MEDIUM | Tunable limits; per-IP and per-subject; monitoring |
| Client UX confusion | LOW | Clear feature flags; progressive rollout; user testing |

---

**Report compiled:** 2026-10-31
**Sprint:** S1.34 Part G–I
**Status:** COMPLETE (Parts G–I)
