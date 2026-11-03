# S1.34 Multi-Channel Authentication — Security and Release Gates

**Sprint:** S1.34 (Deliverable 4 of 4)
**Date:** 2026-10-31
**Repository:** `nabeel2323/scs-platform`
**Baseline commit:** `2abb53881c87724c338e2a2a94b8e9be78e70c23` (origin/develop)
**Companion documents:**
- `OTP-S1.34-MULTI-CHANNEL-AUTH-ARCHITECTURE-ASSESSMENT.md` (Part A — current state audit)
- `OTP-S1.34-MULTI-CHANNEL-AUTH-TARGET-ARCHITECTURE.md` (Parts B–F — target design)
- `OTP-S1.34-MULTI-CHANNEL-AUTH-IMPLEMENTATION-ROADMAP.md` (Parts G–I — phased plan)

---

## Executive Summary

This document defines the acceptance criteria, security test plan, release gates, rollback procedures, and production activation checklist for the multi-channel authentication system. Each authentication method has specific security requirements that must be verified before production deployment.

**Document structure:**
1. Acceptance criteria per authentication method
2. Security test plan (20 scenarios)
3. Release gates per phase
4. Rollback procedures
5. Production activation checklist
6. Ongoing security monitoring

---

## 1. Acceptance Criteria by Authentication Method

### 1.1 Email OTP

| ID | Criterion | Verification Method | Pass/Fail |
|----|-----------|-------------------|-----------|
| EO-1 | Email OTP delivered to valid email address | Integration test with SMTP mock | ☐ |
| EO-2 | Email contains 6-digit code prominently displayed | UI review of email template | ☐ |
| EO-3 | Email contains expiration time (5 minutes, D-6) | Email template review | ☐ |
| EO-4 | Email contains security notice for non-requested codes | Email template review | ☐ |
| EO-5 | Email OTP expires after 300 seconds | Unit test with time manipulation | ☐ |
| EO-6 | Email OTP is single-use (consumed after verification) | Integration test: verify twice | ☐ |
| EO-7 | Rate limit: 5 requests per email per 15 minutes | Load test with rate limit check | ☐ |
| EO-8 | Rate limit: 20 requests per IP per minute | Load test with multiple IPs | ☐ |
| EO-9 | Email enumeration prevention: same response for existing/non-existing email | Security test: compare responses | ☐ |
| EO-10 | Challenge supersession: new OTP invalidates previous | Integration test: request twice, verify first | ☐ |
| EO-11 | SMTP credentials never logged | Log audit during delivery failure | ☐ |
| EO-12 | Correlation ID included in email headers | Email header inspection | ☐ |
| EO-13 | Email OTP works for login flow | E2E test: request → verify → JWT | ☐ |
| EO-14 | Email OTP works for account verification | E2E test: request → verify → account linked | ☐ |
| EO-15 | Existing phone OTP flow unchanged | Regression test: phone OTP still works | ☐ |

### 1.2 TOTP Authenticator

| ID | Criterion | Verification Method | Pass/Fail |
|----|-----------|-------------------|-----------|
| TT-1 | TOTP enrollment generates valid QR code URI | Unit test: parse URI format | ☐ |
| TT-2 | QR code scannable by Google Authenticator | Manual test: scan and verify code | ☐ |
| TT-3 | QR code scannable by Authy | Manual test: scan and verify code | ☐ |
| TT-4 | QR code scannable by 1Password | Manual test: scan and verify code | ☐ |
| TT-5 | TOTP secret encrypted with AES-256-GCM (D-3) | Database inspection: verify encrypted blob | ☐ |
| TT-6 | TOTP encryption key independent of HMAC and JWT keys | Configuration review | ☐ |
| TT-6a | No zero-filled key fallback in any environment | Code inspection + unit test: missing key causes startup failure | ☐ |
| TT-6b | Key storage, backup, rotation, and compromise procedures documented | Operations runbook review | ☐ |
| TT-7 | TOTP verification accepts codes within ±1 time step | Unit test: valid, previous, next window | ☐ |
| TT-8 | TOTP verification rejects codes outside window | Unit test: expired code | ☐ |
| TT-9 | TOTP replay protection: same code cannot be used twice | Integration test: verify same code twice | ☐ |
| TT-10 | TOTP rate limit: 5 attempts per user per 5 minutes | Load test | ☐ |
| TT-11 | TOTP enrollment requires user confirmation | E2E test: initiate → confirm with code | ☐ |
| TT-12 | TOTP disablement requires re-authentication | Security test: disable without re-auth fails | ☐ |
| TT-13 | TOTP re-enrollment invalidates old secret | Integration test: re-enroll → old code rejected | ☐ |
| TT-14 | TOTP enrollment logged to audit trail | Audit log inspection | ☐ |
| TT-15 | TOTP verification logged to audit trail | Audit log inspection | ☐ |

### 1.3 Recovery Codes

| ID | Criterion | Verification Method | Pass/Fail |
|----|-----------|-------------------|-----------|
| RC-1 | 10 recovery codes generated per user (D-4) | Unit test: count generated codes | ☐ |
| RC-2 | Recovery codes are 8 characters, hyphenated (XXXX-XXXX) | Unit test: format validation | ☐ |
| RC-3 | Recovery codes use unambiguous character set | Unit test: no 0/O, 1/I/L | ☐ |
| RC-4 | Only bcrypt hashes stored, never plaintext | Database inspection | ☐ |
| RC-5 | Bcrypt cost factor is 12 | Configuration review | ☐ |
| RC-6 | Recovery code is single-use via atomic conditional UPDATE | Integration test: use twice; concurrent test: parallel use same code | ☐ |
| RC-7 | Regeneration atomically invalidates all previous codes in one transaction | Integration test: regenerate → old codes rejected; verify transaction atomicity | ☐ |
| RC-8 | Layered rate limit: per-user 5/15min, per-IP 10/15min, per-account-per-IP 3/1hr | Load test with multiple users, IPs, and combined | ☐ |
| RC-9 | **No automatic account lockout** after any number of failures | Security test: 100+ consecutive failures do not lock account; progressive delays applied | ☐ |
| RC-10 | Progressive delays enforced (3 failures: +2s, 5: +5s, 8: +15s) | Timing test: verify server-side delays increase with failure count | ☐ |
| RC-11 | Successful recovery triggers email notification | Integration test: verify email sent | ☐ |
| RC-12 | Recovery code usage logged to audit trail (code ID only, NEVER code contents or prefixes) | Audit log inspection: verify no code content or prefix in any log entry | ☐ |
| RC-13 | User warned when fewer than 3 codes remain | UI test: check warning display | ☐ |
| RC-14 | Recovery codes displayed once with save warning | UI test: verify one-time display | ☐ |
| RC-15 | Concurrent consumption: same code cannot succeed under parallel requests | Load test: send 10 concurrent requests with same code, exactly 1 succeeds | ☐ |
| RC-16 | No recovery code contents or prefixes in any log output | Log audit with regex patterns across all flows | ☐ |
| RC-17 | Account linking never auto-merges existing accounts | Security test: linking email already on another account rejects with ACCOUNT_EXISTS | ☐ |

### 1.4 Passkeys (WebAuthn)

| ID | Criterion | Verification Method | Pass/Fail |
|----|-----------|-------------------|-----------|
| PK-1 | Passkey registration creates valid credential | E2E test: register → verify stored | ☐ |
| PK-2 | Passkey authentication verifies signature | E2E test: authenticate → JWT issued | ☐ |
| PK-3 | RP ID validation enforced (D-5) | Security test: cross-origin request rejected | ☐ |
| PK-4 | Origin validation enforced | Security test: fake origin rejected | ☐ |
| PK-5 | User verification required (biometric/PIN, D-5) | Security test: registration without UV rejected | ☐ |
| PK-6 | Multiple credentials per user supported | Integration test: register 2 passkeys | ☐ |
| PK-7 | Credential removal requires re-authentication | Security test: remove without re-auth fails | ☐ |
| PK-8 | Counter anomaly handled as heuristic (alert + notify, NOT reject) | Security test: replay old counter value → accepted with alert, not denied | ☐ |
| PK-9 | Challenge expiry enforced (60 seconds) | Unit test: expired challenge rejected | ☐ |
| PK-10 | Credential uniqueness enforced | Integration test: register same credential twice | ☐ |
| PK-11 | Passkey registration logged to audit trail | Audit log inspection | ☐ |
| PK-12 | Passkey authentication logged to audit trail | Audit log inspection | ☐ |
| PK-13 | WebAuthn works on Chrome | Manual test: register and authenticate | ☐ |
| PK-14 | WebAuthn works on Safari | Manual test: register and authenticate | ☐ |
| PK-15 | WebAuthn works on Firefox | Manual test: register and authenticate | ☐ |
| PK-16 | WebAuthn works on iOS (Face ID/Touch ID) | Manual test on iOS device | ☐ |
| PK-17 | WebAuthn works on Android (biometric) | Manual test on Android device | ☐ |
| PK-18 | Authenticator with signCount=0 accepted | Unit test: authenticator always returning 0 is accepted without alert | ☐ |
| PK-19 | Authenticator with non-incrementing counter accepted (with alert) | Unit test: same counter value on successive authn accepted, alert logged | ☐ |
| PK-20 | Flutter passkey NOT released without device validation evidence | Release gate check: validation evidence document exists | ☐ |

### 1.5 SMS OTP (Existing — Verification)

| ID | Criterion | Verification Method | Pass/Fail |
|----|-----------|-------------------|-----------|
| SO-1 | SMS delivered to E.164 phone number | Integration test with Twilio | ☐ |
| SO-2 | SMS contains 6-digit code | SMS content inspection | ☐ |
| SO-3 | SMS OTP expires after 90 seconds | Unit test with time manipulation | ☐ |
| SO-4 | SMS OTP is single-use | Integration test: verify twice | ☐ |
| SO-5 | Rate limit: 5 requests per phone per 15 minutes | Load test | ☐ |
| SO-6 | Timeout after 10 seconds | Integration test: slow provider | ☐ |
| SO-7 | Error classification: 400/401/403 → rejected | Unit test: mock provider errors | ☐ |
| SO-8 | Error classification: 429/5xx → unknown | Unit test: mock provider errors | ☐ |
| SO-9 | Twilio credentials never logged | Log audit during delivery failure | ☐ |
| SO-10 | Phone number masked in logs (last 4 digits) | Log inspection | ☐ |

### 1.6 WhatsApp OTP (Existing — Verification)

| ID | Criterion | Verification Method | Pass/Fail |
|----|-----------|-------------------|-----------|
| WA-1 | WhatsApp message delivered to E.164 phone number | Integration test with Meta API | ☐ |
| WA-2 | Message uses approved template | Template content inspection | ☐ |
| WA-3 | WhatsApp OTP expires after 90 seconds | Unit test with time manipulation | ☐ |
| WA-4 | WhatsApp OTP is single-use | Integration test: verify twice | ☐ |
| WA-5 | API version validated against regex | Unit test: invalid version rejected | ☐ |
| WA-6 | Timeout after 10 seconds | Integration test: slow provider | ☐ |
| WA-7 | Error classification matches SMS pattern | Unit test: mock provider errors | ☐ |
| WA-8 | WhatsApp credentials never logged | Log audit during delivery failure | ☐ |

### 1.7 Mock Provider

| ID | Criterion | Verification Method | Pass/Fail |
|----|-----------|-------------------|-----------|
| MP-1 | Mock provider only instantiated in test/development | Security test: production and staging env reject mock provider initialization | ☐ |
| MP-2 | `mock` is NOT a public API authentication channel | API test: `channel: 'mock'` rejected by public DTO validation | ☐ |
| MP-3 | Mock provider never returns OTP in ordinary API response | API test: verify response format contains no OTP value | ☐ |
| MP-4 | Mock provider exposes getGeneratedOtp only via internal test service | Unit test: retrieve OTP via test service injection, not API | ☐ |
| MP-5 | Mock provider logs with [MOCK] prefix | Log inspection | ☐ |
| MP-6 | Generated OTPs expire after 5 minutes | Unit test: time-based expiry | ☐ |
| MP-7 | Mock provider cannot be enabled via environment variable | Configuration test: OTP_PROVIDER=mock ignored, dead variable | ☐ |
| MP-8 | Provider registry throws fatal error if mock registered in production/staging | Integration test: NODE_ENV=production + mock → Error thrown | ☐ |
| MP-9 | Internal test-provider selection separate from public delivery-channel DTOs | Code review: OtpDeliveryChannel excludes 'mock', InternalDeliveryChannel includes it | ☐ |

### 1.8 Password Authentication (Existing — Compatibility)

| ID | Criterion | Verification Method | Pass/Fail |
|----|-----------|-------------------|-----------|
| PW-1 | Existing password login flow unchanged | Regression test | ☐ |
| PW-2 | Device trust evaluation unchanged | Regression test | ☐ |
| PW-3 | JWT issuance unchanged | Regression test | ☐ |
| PW-4 | Session rotation unchanged | Regression test | ☐ |
| PW-5 | Password login works for email-only accounts | Integration test | ☐ |
| PW-6 | Password login works for phone-only accounts | Integration test | ☐ |
| PW-7 | Password login works for dual-identifier accounts | Integration test | ☐ |

---

## 2. Security Test Plan

### 2.1 Test Scenarios

| # | Scenario | Category | Severity | Test Type |
|---|----------|----------|----------|-----------|
| 1 | OTP expiry enforcement | OTP | HIGH | Automated |
| 2 | Incorrect OTP rejection | OTP | HIGH | Automated |
| 3 | OTP replay prevention | OTP | CRITICAL | Automated |
| 4 | Concurrent OTP verification | OTP | MEDIUM | Load test |
| 5 | Challenge supersession | OTP | HIGH | Automated |
| 6 | Per-account rate limiting | Rate limit | HIGH | Load test |
| 7 | Per-IP rate limiting | Rate limit | HIGH | Load test |
| 8 | Redis outage handling | Infrastructure | MEDIUM | Chaos test |
| 9 | SMTP failure and timeout | Email | MEDIUM | Automated |
| 10 | Twilio failure and timeout | SMS | MEDIUM | Automated |
| 11 | WhatsApp failure and timeout | WhatsApp | MEDIUM | Automated |
| 12 | Provider-disabled behavior | Provider | HIGH | Automated |
| 13 | Mock provider isolation | Mock | CRITICAL | Security test |
| 14 | TOTP enrollment security | TOTP | HIGH | Security test |
| 15 | TOTP verification with time skew | TOTP | MEDIUM | Automated |
| 16 | Recovery code single-use | Recovery | HIGH | Automated |
| 17 | Passkey registration validation | Passkey | HIGH | Security test |
| 18 | Passkey authentication validation | Passkey | HIGH | Security test |
| 19 | Session rotation and revocation | Session | CRITICAL | Automated |
| 20 | Secret and PII redaction in logs | Logging | CRITICAL | Audit |

### 2.2 Detailed Test Specifications

#### Test 1: OTP Expiry Enforcement

**Objective:** Verify OTP codes expire after TTL.

**Steps:**
1. Request OTP via email/SMS/WhatsApp
2. Wait for TTL + 1 second (90s for phone, 300s for email)
3. Attempt verification with correct OTP

**Expected result:** Verification fails with `OTP_EXPIRED` error.

**Automation:** Unit test with time manipulation (`jest.useFakeTimers`).

---

#### Test 2: Incorrect OTP Rejection

**Objective:** Verify incorrect OTP codes are rejected.

**Steps:**
1. Request OTP
2. Attempt verification with incorrect code

**Expected result:** Verification fails with `INVALID_OTP` error. Attempt counter incremented.

**Automation:** Unit test.

---

#### Test 3: OTP Replay Prevention

**Objective:** Verify consumed OTP cannot be reused.

**Steps:**
1. Request OTP
2. Verify OTP successfully (receive JWT)
3. Attempt verification again with same OTP

**Expected result:** Second verification fails with `OTP_ALREADY_USED` error.

**Automation:** Integration test.

---

#### Test 4: Concurrent OTP Verification

**Objective:** Verify race condition handling when multiple verification attempts occur simultaneously.

**Steps:**
1. Request OTP
2. Send 10 concurrent verification requests with correct OTP

**Expected result:** Exactly one request succeeds. All others fail with `OTP_ALREADY_USED`.

**Automation:** Load test with `Promise.all`.

---

#### Test 5: Challenge Supersession

**Objective:** Verify new OTP request invalidates previous challenge.

**Steps:**
1. Request OTP (first)
2. Request OTP again (second)
3. Attempt verification with first OTP

**Expected result:** Verification fails with `OTP_EXPIRED` or `CHALLENGE_SUPERSEDED`.

**Automation:** Integration test.

---

#### Test 6: Per-Account Rate Limiting

**Objective:** Verify rate limit enforced per email/phone.

**Steps:**
1. Request 6 OTPs for same email within 15 minutes
2. Attempt 7th request

**Expected result:** 7th request rejected with `RATE_LIMIT_EXCEEDED` error. Retry-After header included.

**Automation:** Load test.

---

#### Test 7: Per-IP Rate Limiting

**Objective:** Verify rate limit enforced per IP address.

**Steps:**
1. Request 21 OTPs from same IP within 1 minute (across different accounts)
2. Attempt 22nd request

**Expected result:** 22nd request rejected with `RATE_LIMIT_EXCEEDED` error.

**Automation:** Load test with IP spoofing.

---

#### Test 8: Redis Outage Handling

**Objective:** Verify graceful degradation when Redis is unavailable.

**Steps:**
1. Stop Redis service
2. Attempt OTP request

**Expected result:** Request fails with `SERVICE_UNAVAILABLE` error. No crash. No data loss.

**Automation:** Chaos test with Redis container stop.

---

#### Test 9: SMTP Failure and Timeout

**Objective:** Verify email delivery failure handling.

**Steps:**
1. Configure invalid SMTP credentials
2. Request email OTP
3. Verify error response

**Steps (timeout):**
1. Configure slow SMTP server (> 10s response)
2. Request email OTP
3. Verify timeout handling

**Expected result:** Failure returns `deliveryOutcome: 'rejected'`. Timeout returns `deliveryOutcome: 'unknown'` with challenge retained.

**Automation:** Integration test with mock SMTP server.

---

#### Test 10: Twilio Failure and Timeout

**Objective:** Verify SMS delivery failure handling.

**Steps:** Similar to Test 9, using Twilio API mock.

**Expected result:** Same as Test 9.

**Automation:** Integration test with Twilio API mock.

---

#### Test 11: WhatsApp Failure and Timeout

**Objective:** Verify WhatsApp delivery failure handling.

**Steps:** Similar to Test 9, using WhatsApp API mock.

**Expected result:** Same as Test 9.

**Automation:** Integration test with WhatsApp API mock.

---

#### Test 12: Provider-Disabled Behavior

**Objective:** Verify behavior when requested channel is not configured.

**Steps:**
1. Disable email provider (remove SMTP config)
2. Request email OTP

**Expected result:** Request rejected with `PROVIDER_NOT_CONFIGURED` error. No silent fallback to SMS.

**Automation:** Unit test with provider registry mock.

---

#### Test 13: Mock Provider Isolation

**Objective:** Verify mock provider cannot be enabled in production or staging, and is not reachable through public API.

**Steps (initialization guard):**
1. Set `NODE_ENV=production`
2. Attempt to register mock provider via ProviderRegistryService constructor

**Expected result:** Constructor throws `FATAL: MockNotificationProvider cannot be registered in production environment`.

**Steps (staging guard):**
1. Set `NODE_ENV=staging`
2. Attempt to register mock provider

**Expected result:** Same fatal error as production.

**Steps (API channel exclusion):**
1. Set `NODE_ENV=production`
2. Call `/v1/auth/otp/request` with any channel value

**Expected result:** Only `'sms'`, `'whatsapp'`, `'email'` are accepted. `'mock'` is rejected by DTO validation (IsIn constraint). The string `'mock'` does not appear in the public `OtpDeliveryChannel` type.

**Steps (test retrieval isolation):**
1. Set `NODE_ENV=test`
2. Retrieve generated OTP via `getTestProvider().getGeneratedOtp(subject)`

**Expected result:** OTP returned only through internal test service, never through API response.

**Automation:** Security test.

---

#### Test 14: TOTP Enrollment Security

**Objective:** Verify TOTP enrollment requires confirmation.

**Steps:**
1. Initiate TOTP enrollment
2. Receive QR code URI and secret
3. Attempt to use TOTP without confirmation

**Expected result:** Verification fails with `TOTP_NOT_ENROLLED` error.

**Steps (secret protection):**
1. Initiate TOTP enrollment
2. Inspect database for `totp_secrets` record
3. Verify `encrypted_secret` is encrypted (not plaintext)

**Expected result:** Secret is encrypted with AES-256-GCM. IV and auth tag present.

**Automation:** Security test + database inspection.

---

#### Test 15: TOTP Verification with Time Skew

**Objective:** Verify TOTP accepts codes with clock drift.

**Steps:**
1. Enroll TOTP
2. Generate code with device clock +30 seconds ahead
3. Verify code

**Expected result:** Code accepted (within ±1 step window).

**Steps (outside window):**
1. Generate code with device clock +60 seconds ahead
2. Verify code

**Expected result:** Code rejected (outside window).

**Automation:** Unit test with time manipulation.

---

#### Test 16: Recovery Code Single-Use and Atomic Consumption

**Objective:** Verify recovery code cannot be reused, including under concurrent access.

**Steps (sequential):**
1. Generate recovery codes
2. Use first code successfully
3. Attempt to use same code again

**Expected result:** Second use fails with `RECOVERY_CODE_ALREADY_USED` error.

**Steps (concurrent):**
1. Generate recovery codes
2. Send 10 concurrent verification requests with the same code

**Expected result:** Exactly one request succeeds. All others fail with `RECOVERY_CODE_ALREADY_USED`. The atomic conditional UPDATE (`WHERE used_at IS NULL`) ensures PostgreSQL row-level locking prevents double consumption.

**Steps (no prefix logging):**
1. Use a recovery code
2. Inspect all log output (application logs, audit logs, error logs)

**Expected result:** No recovery code contents or prefixes appear in any log entry. Only the internal code ID (UUID) is recorded in audit metadata.

**Automation:** Integration test + load test + log audit.

---

#### Test 17: Passkey Registration Validation

**Objective:** Verify passkey registration validates all fields.

**Steps:**
1. Initiate registration
2. Submit attestation with invalid RP ID
3. Submit attestation with invalid origin
4. Submit attestation without user verification

**Expected result:** All invalid submissions rejected with appropriate error codes.

**Automation:** Security test with WebAuthn mock.

---

#### Test 18: Passkey Authentication Validation

**Objective:** Verify passkey authentication validates signature and handles counter as heuristic.

**Steps:**
1. Register passkey
2. Submit assertion with invalid signature
3. Submit assertion with old counter value (regression)
4. Submit assertion with signCount=0 (non-implementing authenticator)
5. Submit assertion with same counter as previous (non-incrementing)
6. Submit assertion with valid signature and incremented counter

**Expected result:**
- Invalid signature: REJECTED.
- Counter regression (step 3): ACCEPTED with `PASSKEY_COUNTER_ANOMALY` audit event and user email notification. NOT rejected.
- Zero counter (step 4): ACCEPTED without alert (authenticator doesn't implement counters).
- Non-incrementing counter (step 5): ACCEPTED with alert logged.
- Valid assertion (step 6): ACCEPTED, counter updated.

**Key principle:** Counter is a heuristic signal, not a definitive clone detector. Legitimate users are never locked out based on counter value alone.

**Automation:** Security test with WebAuthn mock.

---

#### Test 19: Session Rotation and Revocation

**Objective:** Verify session management works across all auth methods.

**Steps:**
1. Authenticate via email OTP → receive JWT pair
2. Use refresh token → receive new pair
3. Reuse old refresh token → detect reuse
4. Authenticate via TOTP → receive JWT pair
5. Revoke session → verify all tokens invalidated

**Expected result:** Refresh rotation works. Reuse detected. Revocation effective across all methods.

**Automation:** Integration test.

---

#### Test 20: Secret and PII Redaction in Logs

**Objective:** Verify no sensitive data logged.

**Steps:**
1. Perform all authentication flows
2. Inspect logs for:
   - OTP values (plaintext codes)
   - TOTP secrets (encrypted or plaintext)
   - Recovery codes (plaintext)
   - Passkey credentials (private keys)
   - Email addresses (full)
   - Phone numbers (full)
   - Passwords
   - JWT tokens
   - HMAC secrets
   - Encryption keys

**Expected result:** None of the above found in logs. Phone numbers masked (last 4 digits). Emails masked (first char + domain).

**Automation:** Log audit with regex patterns.

---

### 2.3 Test Execution Matrix

| Test | Unit | Integration | Security | Load | Chaos | Manual |
|------|------|-------------|----------|------|-------|--------|
| 1 | ✅ | | | | | |
| 2 | ✅ | | | | | |
| 3 | | ✅ | | | | |
| 4 | | | | ✅ | | |
| 5 | | ✅ | | | | |
| 6 | | | | ✅ | | |
| 7 | | | | ✅ | | |
| 8 | | | | | ✅ | |
| 9 | | ✅ | | | | |
| 10 | | ✅ | | | | |
| 11 | | ✅ | | | | |
| 12 | ✅ | | | | | |
| 13 | | | ✅ | | | |
| 14 | | | ✅ | | | |
| 15 | ✅ | | | | | |
| 16 | | ✅ | | | | |
| 17 | | | ✅ | | | |
| 18 | | | ✅ | | | |
| 19 | | ✅ | | | | |
| 20 | | | | | | ✅ |

---

## 3. Release Gates by Phase

### 3.1 Phase 1 Release Gate: Email Identity + Email OTP

**Pre-release checklist:**

| # | Gate | Verification | Pass/Fail |
|---|------|-------------|-----------|
| 1 | Schema migration tested | Migration run on copy of production data | ☐ |
| 1a | Pre-migration duplicate detection run | `SELECT LOWER(email), COUNT(*) ... HAVING COUNT(*) > 1` returns 0 | ☐ |
| 2 | All existing users have phone | Query: `SELECT COUNT(*) FROM users WHERE phone IS NULL` returns 0 | ☐ |
| 3 | CHECK constraint validated | All existing rows satisfy constraint | ☐ |
| 4 | Email normalization working | Unit tests pass | ☐ |
| 5 | Duplicate detection working | Integration tests pass | ☐ |
| 6 | Email OTP flow working | E2E tests pass | ☐ |
| 7 | Phone OTP flow unchanged | Regression tests pass | ☐ |
| 8 | Rate limiting enforced | Load tests pass | ☐ |
| 9 | Email enumeration prevented | Security tests pass | ☐ |
| 10 | Mock provider isolated | Security tests pass | ☐ |
| 11 | SMTP credentials protected | Log audit passes | ☐ |
| 12 | All acceptance criteria met | EO-1 through EO-15 pass | ☐ |
| 13 | Code review completed | PR approved by 2 reviewers | ☐ |
| 14 | CI pipeline green | All tests pass | ☐ |
| 15 | Rollback procedure tested | Rollback executed in staging | ☐ |

**Release decision:** All gates must pass. Any failure blocks release.

---

### 3.2 Phase 2 Release Gate: TOTP + Recovery Codes

**Pre-release checklist:**

| # | Gate | Verification | Pass/Fail |
|---|------|-------------|-----------|
| 1 | TOTP encryption key generated | Key present in environment (32 bytes hex, cryptographically secure) | ☐ |
| 1a | No zero-filled key fallback | Code inspection: missing key causes startup failure | ☐ |
| 1b | Key management procedures documented | Storage, backup, rotation, compromise procedures in runbook | ☐ |
| 2 | TOTP secrets encrypted at rest | Database inspection | ☐ |
| 3 | Key independence verified | TOTP key ≠ HMAC key ≠ JWT key | ☐ |
| 4 | TOTP enrollment working | E2E tests pass | ☐ |
| 5 | TOTP verification working | Integration tests pass | ☐ |
| 6 | Time-window validation working | Unit tests pass | ☐ |
| 7 | Replay protection working | Integration tests pass | ☐ |
| 8 | Recovery codes generated | 10 codes per user | ☐ |
| 9 | Recovery codes hashed | Only bcrypt hashes in database | ☐ |
| 10 | Recovery codes single-use | Integration tests pass | ☐ |
| 10a | Recovery codes atomic consumption | Concurrent test: parallel requests, exactly one succeeds | ☐ |
| 10b | Recovery codes atomic regeneration | Transaction test: all previous codes invalidated atomically | ☐ |
| 10c | Recovery codes layered rate limiting | Per-user, per-IP, per-account-per-IP limits enforced | ☐ |
| 10d | No automatic account lockout | 100+ failures do not lock account; progressive delays applied | ☐ |
| 10e | No code prefix logging | Log audit: no recovery code contents or prefixes in any log | ☐ |
| 11 | Re-authentication required | Security tests pass | ☐ |
| 12 | Audit logging complete | All operations logged | ☐ |
| 13 | All acceptance criteria met | TT-1 through TT-15, RC-1 through RC-17 pass | ☐ |
| 14 | Code review completed | PR approved by 2 reviewers | ☐ |
| 15 | CI pipeline green | All tests pass | ☐ |
| 16 | Rollback procedure tested | Rollback executed in staging | ☐ |

**Release decision:** All gates must pass. Any failure blocks release.

---

### 3.3 Phase 3 Release Gate: SMS/WhatsApp Provider Verification

**Pre-release checklist:**

| # | Gate | Verification | Pass/Fail |
|---|------|-------------|-----------|
| 1 | SMS provider delivers | Integration test with real Twilio | ☐ |
| 2 | WhatsApp provider delivers | Integration test with real Meta API | ☐ |
| 3 | Generalized subject model | Unit tests pass | ☐ |
| 4 | Error classification correct | Unit tests pass | ☐ |
| 5 | Timeout handling correct | Integration tests pass | ☐ |
| 6 | No credentials logged | Log audit passes | ☐ |
| 7 | Phone masking working | Log inspection | ☐ |
| 8 | All acceptance criteria met | SO-1 through SO-10, WA-1 through WA-8 pass | ☐ |
| 9 | Code review completed | PR approved by 2 reviewers | ☐ |
| 10 | CI pipeline green | All tests pass | ☐ |

**Release decision:** All gates must pass. Any failure blocks release.

---

### 3.4 Phase 4 Release Gate: Passkeys

**Pre-release checklist:**

| # | Gate | Verification | Pass/Fail |
|---|------|-------------|-----------|
| 1 | WebAuthn library installed | `@simplewebauthn/server` in dependencies | ☐ |
| 2 | RP ID configured | Environment variable set | ☐ |
| 3 | Origin configured | Environment variable set | ☐ |
| 4 | Registration working | E2E tests pass | ☐ |
| 5 | Authentication working | E2E tests pass | ☐ |
| 6 | User verification enforced | Security tests pass | ☐ |
| 7 | Counter handled as heuristic | Security tests pass: anomaly alerting works, access NOT denied | ☐ |
| 7a | Zero-value counter accepted | Unit test: signCount=0 authenticator works without alert | ☐ |
| 7b | Non-incrementing counter accepted | Unit test: same counter value accepted with alert logged | ☐ |
| 8 | Multiple credentials supported | Integration tests pass | ☐ |
| 9 | Credential removal working | Integration tests pass | ☐ |
| 10 | Cross-browser tested | Chrome, Safari, Firefox manual tests pass | ☐ |
| 11 | Mobile tested | iOS and Android manual tests pass | ☐ |
| 12 | All acceptance criteria met | PK-1 through PK-20 pass | ☐ |
| 13 | Code review completed | PR approved by 2 reviewers | ☐ |
| 14 | CI pipeline green | All tests pass | ☐ |
| 15 | Rollback procedure tested | Rollback executed in staging | ☐ |

**Release decision:** All gates must pass. Any failure blocks release.

---

### 3.5 Phase 5 Release Gate: Web + Flutter Integration

**Pre-release checklist:**

| # | Gate | Verification | Pass/Fail |
|---|------|-------------|-----------|
| 1 | Web client supports all methods | Manual testing on web | ☐ |
| 2 | Flutter client supports all methods | Manual testing on iOS and Android | ☐ |
| 3 | Existing flows unchanged | Regression testing | ☐ |
| 4 | TOTP QR scannable | Test with Google Authenticator, Authy, 1Password | ☐ |
| 5 | Recovery codes displayed once | UI test | ☐ |
| 6 | Passkey registration works | Cross-browser test | ☐ |
| 7 | Credential management UI working | Manual test | ☐ |
| 8 | Generated clients updated | TypeScript and Dart clients regenerated | ☐ |
| 9 | All acceptance criteria met | Phase 5 criteria pass | ☐ |
| 10 | Code review completed | PR approved by 2 reviewers | ☐ |
| 11 | CI pipeline green | All tests pass | ☐ |
| 12 | UX review completed | Product team approval | ☐ |

**Release decision:** All gates must pass. Any failure blocks release.

---

### 3.6 Phase 6 Release Gate: Security Verification + Production

**Pre-release checklist:**

| # | Gate | Verification | Pass/Fail |
|---|------|-------------|-----------|
| 1 | Security audit passed | Independent audit report | ☐ |
| 2 | Penetration test passed | Pentest report with no critical findings | ☐ |
| 3 | Performance tests passed | All targets met | ☐ |
| 4 | Production credentials configured | Environment variables set | ☐ |
| 5 | Monitoring dashboards created | Grafana/Datadog configured | ☐ |
| 6 | Alerts configured | Alert rules active | ☐ |
| 7 | Runbook documented | Operations manual complete | ☐ |
| 8 | Feature flags set | Production flags configured | ☐ |
| 9 | Mock provider disabled | Flag set to false | ☐ |
| 10 | Real providers enabled | SMTP, Twilio, WhatsApp configured | ☐ |
| 11 | All acceptance criteria met | All method criteria pass | ☐ |
| 12 | All 20 security tests pass | Test execution matrix complete | ☐ |
| 13 | Code review completed | Final PR approved | ☐ |
| 14 | CI pipeline green | All tests pass | ☐ |
| 15 | Rollback procedure tested | Rollback executed in staging | ☐ |
| 16 | Production deployment plan approved | Stakeholder sign-off | ☐ |

**Release decision:** All gates must pass. Any failure blocks production deployment.

---

## 4. Rollback Procedures

### 4.1 Phase 1 Rollback: Email Identity + Email OTP

> **S1.34.1 Correction:** The original rollback procedure restored `phone NOT NULL`. This is **UNSAFE** once email-only accounts have been created — it would make existing users invalid and break the database. The corrected strategy uses forward-fix and feature-disable.

**Trigger conditions:**
- Schema migration corrupts user data
- Email OTP flow breaks existing phone OTP
- Critical security vulnerability discovered

**Rollback decision criteria:**
```sql
-- Check if reverse migration is safe
SELECT COUNT(*) FROM users WHERE phone IS NULL;
-- If result > 0: email-only accounts exist. DO NOT restore NOT NULL.
-- If result = 0: safe to reverse schema.
```

**Rollback steps (SAFE — no destructive reversal):**
1. Disable email OTP feature flag: `FLAG_AUTH_EMAIL_OTP=false`
2. Revert API code to previous version
3. **If no email-only accounts exist** (count = 0):
   ```sql
   DROP TABLE IF EXISTS account_linking_log;
   DROP INDEX IF EXISTS users_email_lower_unique_idx;
   ALTER TABLE users DROP CONSTRAINT IF EXISTS users_require_email_or_phone;
   ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
   ```
4. **If email-only accounts exist** (count > 0):
   - **DO NOT reverse schema.** Keep all schema changes.
   - Feature-disable: `FLAG_AUTH_EMAIL_OTP=false` blocks new email-only registration
   - Existing email-only accounts retain access via email OTP
   - Fix forward with corrective migration if needed
5. Verify phone OTP flow working
6. Monitor logs for errors

**Data preservation:**
- No user data deleted
- No sessions invalidated
- No JWT tokens revoked
- No organization memberships affected
- No account ownership changed
- Existing phone OTP flow restored

**Estimated rollback time:** 15 minutes

---

### 4.2 Phase 2 Rollback: TOTP + Recovery Codes

**Trigger conditions:**
- TOTP encryption key compromised
- Recovery codes not properly hashed
- Critical security vulnerability discovered

**Rollback steps:**
1. Disable TOTP and recovery code feature flags:
   ```
   FLAG_AUTH_TOTP=false
   FLAG_AUTH_RECOVERY_CODES=false
   ```
2. Revert API code to previous version
3. Run reverse migration:
   ```sql
   DROP TABLE IF EXISTS totp_usage_log;
   DROP TABLE IF EXISTS totp_secrets;
   DROP TABLE IF EXISTS recovery_codes;
   ALTER TABLE credential_audit_log DROP COLUMN IF EXISTS metadata;
   ```
4. Verify users cannot access TOTP or recovery endpoints
5. Monitor logs for errors

**Data preservation:**
- TOTP secrets deleted (encrypted, not recoverable without key)
- Recovery codes deleted (hashed, not recoverable)
- Users must re-enroll TOTP if feature re-enabled
- Existing password and OTP flows unaffected

**Estimated rollback time:** 10 minutes

---

### 4.3 Phase 3 Rollback: SMS/WhatsApp Provider Verification

**Trigger conditions:**
- Provider changes break existing SMS/WhatsApp flow
- Error classification incorrect
- Credentials leaked in logs

**Rollback steps:**
1. Revert provider code to previous version
2. Verify SMS and WhatsApp delivery working
3. Monitor logs for errors

**Data preservation:**
- No data changes
- Existing flows restored

**Estimated rollback time:** 5 minutes

---

### 4.4 Phase 4 Rollback: Passkeys

**Trigger conditions:**
- WebAuthn library vulnerability
- Passkey registration creates invalid credentials
- Critical security vulnerability discovered

**Rollback steps:**
1. Disable passkey feature flag: `FLAG_AUTH_PASSKEYS=false`
2. Revert API code to previous version
3. Run reverse migration:
   ```sql
   DROP TABLE IF EXISTS webauthn_challenges;
   DROP TABLE IF EXISTS webauthn_credentials;
   ```
4. Verify users cannot access passkey endpoints
5. Monitor logs for errors

**Data preservation:**
- Passkey credentials deleted (public keys, not private)
- Users must re-register passkeys if feature re-enabled
- Existing authentication flows unaffected

**Estimated rollback time:** 10 minutes

---

### 4.5 Phase 5 Rollback: Web + Flutter Integration

**Trigger conditions:**
- Client UI breaks existing flows
- Generated client incompatible with API
- Critical UX issue discovered

**Rollback steps:**
1. Revert client code to previous version
2. Regenerate clients from previous API contract
3. Deploy updated clients
4. Verify existing flows working

**Data preservation:**
- No data changes
- Existing flows restored

**Estimated rollback time:** 30 minutes (client deployment)

---

### 4.6 Phase 6 Rollback: Production Activation

**Trigger conditions:**
- Security audit finds critical vulnerability
- Performance tests fail under production load
- Production credentials compromised

**Rollback steps:**
1. Disable all new authentication method feature flags:
   ```
   FLAG_AUTH_EMAIL_OTP=false
   FLAG_AUTH_TOTP=false
   FLAG_AUTH_RECOVERY_CODES=false
   FLAG_AUTH_PASSKEYS=false
   ```
2. Disable real providers (revert to existing phone-only flows for testing)
3. Monitor logs for errors
4. Investigate and fix issue
5. Re-run security audit
6. Re-attempt production activation

**Data preservation:**
- No data changes
- Existing phone OTP + password flows remain active

**Estimated rollback time:** 5 minutes (feature flag toggle)

---

## 5. Production Activation Checklist

### 5.1 Pre-Activation Verification

| # | Check | Verification | Pass/Fail |
|---|-------|-------------|-----------|
| 1 | All phases deployed to staging | Deployment logs | ☐ |
| 2 | All release gates passed | Gate checklists complete | ☐ |
| 3 | Security audit passed | Audit report signed | ☐ |
| 4 | Penetration test passed | Pentest report signed | ☐ |
| 5 | Performance tests passed | Load test report | ☐ |
| 6 | Rollback procedures tested | Rollback drill completed | ☐ |
| 7 | Monitoring dashboards active | Grafana/Datadog screenshots | ☐ |
| 8 | Alerts configured and tested | Alert test fired | ☐ |
| 9 | Runbook documented | Operations manual reviewed | ☐ |
| 10 | On-call team briefed | Meeting minutes | ☐ |

### 5.2 Environment Configuration

**Production environment variables:**

```bash
# Email (SMTP)
SMTP_HOST=<production-smtp-host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<production-smtp-user>
SMTP_PASSWORD=<production-smtp-password>
SMTP_FROM=noreply@scsp.dev

# TOTP encryption
TOTP_ENCRYPTION_KEY=<64-char-hex-generated-for-production>

# WebAuthn
WEBAUTHN_RP_ID=scsp.dev
WEBAUTHN_RP_NAME=SCS Platform
WEBAUTHN_ORIGIN=https://app.scsp.dev

# Twilio (existing)
TWILIO_ACCOUNT_SID=<production-twilio-sid>
TWILIO_AUTH_TOKEN=<production-twilio-token>
TWILIO_FROM_NUMBER=<production-twilio-number>

# WhatsApp (existing)
WHATSAPP_ACCESS_TOKEN=<production-whatsapp-token>
WHATSAPP_PHONE_NUMBER_ID=<production-whatsapp-phone-id>
WHATSAPP_BUSINESS_ACCOUNT_ID=<production-whatsapp-business-id>

# OTP
OTP_TTL_PHONE=90
OTP_TTL_EMAIL=300
OTP_MAX_ATTEMPTS=5
OTP_HMAC_SECRET=<64-char-minimum-production-secret>

# Feature flags
FLAG_AUTH_EMAIL_OTP=true
FLAG_AUTH_TOTP=true
FLAG_AUTH_RECOVERY_CODES=true
FLAG_AUTH_PASSKEYS=true
FLAG_AUTH_MOCK_PROVIDER=false
```

### 5.3 Activation Sequence

1. **T-60 minutes:** Notify on-call team of impending activation
2. **T-30 minutes:** Verify all monitoring dashboards active
3. **T-15 minutes:** Verify all alerts configured
4. **T-5 minutes:** Final verification of environment configuration
5. **T-0:** Enable feature flags in production:
   ```
   FLAG_AUTH_EMAIL_OTP=true
   FLAG_AUTH_TOTP=true
   FLAG_AUTH_RECOVERY_CODES=true
   FLAG_AUTH_PASSKEYS=true
   ```
6. **T+5 minutes:** Verify all authentication methods working
7. **T+15 minutes:** Monitor error rates and performance metrics
8. **T+30 minutes:** Confirm stable operation
9. **T+60 minutes:** Declare activation complete

### 5.4 Post-Activation Monitoring

**First 24 hours:**
- Monitor error rates for all authentication methods
- Track OTP delivery success rates
- Watch for unusual patterns (rate limit triggers, failed verifications)
- Review audit logs for security events

**First week:**
- Analyze usage patterns for new authentication methods
- Gather user feedback on UX
- Review performance metrics
- Update monitoring thresholds based on real data

**First month:**
- Conduct post-activation review
- Document lessons learned
- Update runbook with operational experience
- Plan any necessary adjustments

---

## 6. Ongoing Security Monitoring

### 6.1 Metrics to Track

| Metric | Source | Alert Threshold |
|--------|--------|----------------|
| OTP request rate (per channel) | API logs | > 100/min |
| OTP verification success rate | API logs | < 80% |
| OTP verification failure rate | API logs | > 20% |
| Rate limit triggers | Redis | > 50/hour |
| TOTP enrollment count | Database | N/A (informational) |
| TOTP verification success rate | API logs | < 90% |
| TOTP replay attempts | Database | > 0 |
| Recovery code usage count | Database | > 5/day |
| Passkey registration count | Database | N/A (informational) |
| Passkey authentication success rate | API logs | < 95% |
| Passkey counter regressions | Database | > 0 |
| Email delivery success rate | SMTP logs | < 90% |
| SMS delivery success rate | Twilio logs | < 95% |
| WhatsApp delivery success rate | Meta logs | < 95% |

### 6.2 Security Incident Response

**Incident categories:**

| Category | Severity | Response Time | Escalation |
|----------|----------|---------------|------------|
| OTP brute force attack | HIGH | 15 minutes | Security team + on-call |
| TOTP secret compromise | CRITICAL | 5 minutes | Security team + management |
| Recovery code abuse | MEDIUM | 1 hour | Security team |
| Passkey credential theft | CRITICAL | 5 minutes | Security team + management |
| SMTP credential leak | HIGH | 15 minutes | Security team + DevOps |
| Mock provider in production | CRITICAL | 5 minutes | Security team + DevOps |
| Rate limit bypass | HIGH | 15 minutes | Security team |
| Session hijacking | CRITICAL | 5 minutes | Security team + management |

**Response procedures:**

1. **Detect:** Alert triggered or incident reported
2. **Triage:** Assess severity and scope
3. **Contain:** Disable affected feature flag
4. **Investigate:** Review logs and audit trail
5. **Remediate:** Fix vulnerability, rotate credentials
6. **Recover:** Re-enable feature flag, notify users
7. **Review:** Post-incident analysis, update procedures

### 6.3 Regular Security Reviews

**Weekly:**
- Review audit logs for unusual patterns
- Check rate limit trigger counts
- Monitor delivery success rates

**Monthly:**
- Review all authentication method usage
- Analyze failure patterns
- Update monitoring thresholds
- Review and rotate secrets (if needed)

**Quarterly:**
- Conduct security audit
- Perform penetration test
- Review and update security policies
- Train team on security procedures

**Annually:**
- Comprehensive security review
- Update threat model
- Review and update incident response plan
- Compliance audit (if applicable)

---

## 7. Summary of Proposed Decisions

> **S1.34.1 Correction:** These decisions are **PROPOSED — PENDING PROJECT-OWNER APPROVAL**. They were initially labeled as "approved" in the S1.34 deliverables. They must not be treated as authorized for implementation until the project owner explicitly approves each one.

| ID | Decision | Status | Rationale | Document Reference |
|----|----------|--------|-----------|-------------------|
| D-1 | Support email-only accounts | `PROPOSED` | Free authentication methods, user choice | Target Architecture Part C |
| D-2 | Mock provider for tests only; `mock` not in public API channel; separate internal test selection from public DTOs; never return OTP in API response | `PROPOSED` | Security isolation | Target Architecture Part D |
| D-3 | AES-256-GCM encryption for TOTP secrets; no zero-filled key fallback; key independent of HMAC and JWT secrets | `PROPOSED` | Protect sensitive data at rest | Target Architecture Part E |
| D-4 | 10 recovery codes per user; atomic consumption via conditional UPDATE; atomic regeneration; no automatic lockout; never log code contents or prefixes | `PROPOSED` | Industry standard (Google, GitHub) | Target Architecture Part E |
| D-5 | WebAuthn user verification required | `PROPOSED` | Security-critical authentication | Target Architecture Part F |
| D-6 | Email OTP 5 min, phone OTP 90 sec | `PROPOSED` | Account for email delivery delays | Target Architecture Part C |

---

## 8. Open Decisions Requiring Human Approval

| ID | Question | Options | Recommendation | Status |
|----|----------|---------|----------------|--------|
| OD-1 | Should account linking require admin approval? | A) Self-service only, B) Admin approval required, C) Hybrid | A) Self-service with verification | Open |
| OD-2 | Should TOTP secrets be backupable by user? | A) Yes, allow export, B) No, enrollment only | B) No export (security) | Open |
| OD-3 | Should recovery codes be downloadable as file? | A) Yes, encrypted file, B) No, display only | B) Display only (simpler) | Open |
| OD-4 | Should passkey removal notify user via email? | A) Yes, always, B) No | A) Yes (security) | Open |
| OD-5 | Should there be a maximum number of passkeys per user? | A) No limit, B) 5, C) 10 | C) 10 (reasonable) | Open |

---

**Report compiled:** 2026-10-31
**Sprint:** S1.34 — Security and Release Gates (corrected by S1.34.1)
**Status:** COMPLETE (decisions re-labeled as PROPOSED — PENDING PROJECT-OWNER APPROVAL)
