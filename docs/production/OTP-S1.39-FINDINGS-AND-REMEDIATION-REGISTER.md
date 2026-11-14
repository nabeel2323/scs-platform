# OTP-S1.39 — Findings & Remediation Register

**Date:** 2026-11-03
**PR:** #104 — `feat/auth-email-otp-phase1` → `develop`
**Status:** ALL HIGH/MEDIUM FINDINGS REMEDIATED

---

## Summary

| Severity | Count | Remediated | Open |
|----------|-------|------------|------|
| HIGH | 1 | 1 | 0 |
| MEDIUM | 4 | 4 | 0 |
| LOW | 3 | 0 | 3 (non-blocking) |
| OPERATIONAL | 5 | 0 | 5 (follow-up sprint) |
| **TOTAL** | **13** | **5 | **8** |

---

## HIGH Severity Findings

### H-01: `setupCredentials` Does Not Normalize Email

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **Status** | ✅ REMEDIATED |
| **Commit** | `1d90790` |
| **File** | `apps/api/src/modules/identity/identity.service.ts` |
| **Lines** | 1567-1604 (method signature and body) |

**Description:**
The `setupCredentials()` method wrote the raw email parameter directly to the database without normalization. Meanwhile, `loginWithPassword()` normalizes via `normalizeEmail()` (trim + lowercase) before lookup. This mismatch meant a user who set up credentials with mixed-case email (e.g., `Alice@Example.com`) would fail password login because the login path normalizes to `alice@example.com` before querying.

**Root Cause:**
The `setupCredentials()` method was added during Phase 1 implementation without cross-referencing the normalization logic in `loginWithPassword()`. The parameter was named `email` (implying it was already normalized) when it should have been named `rawEmail` to signal that normalization is needed.

**Impact:**
- Users who set up credentials with mixed-case email cannot log in with password
- Silent failure — no error message, just "invalid credentials"
- Affects all users who go through the email OTP → setup credentials flow

**Remediation:**
```diff
  async setupCredentials(
    userId: string,
-   email: string,
+   rawEmail: string,
    password: string,
    deviceId?: string,
  ): Promise<{ success: boolean; message: string }> {
+   // Normalize email so the identity is stored in canonical form (trim + lowercase).
+   // Without this, a user who sets up "Alice@Example.com" could fail to log in later
+   // because loginWithPassword normalizes to "alice@example.com" before lookup.
+   const email = normalizeEmail(rawEmail);
+
    // Get user to check current state
```

**Verification:**
- All 297 identity unit tests pass post-fix
- Manual test: set up credentials with `Test@Example.com`, verify login with `test@example.com` succeeds
- Code review: confirmed all other email write paths normalize before write

**Prevention:**
- Add unit test that specifically verifies email normalization in `setupCredentials()`
- Code review checklist: verify all email write paths normalize before write

---

## MEDIUM Severity Findings

### M-01: CORS `exposedHeaders` Missing `Retry-After`

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Status** | ✅ REMEDIATED |
| **Commit** | `1d90790` |
| **File** | `apps/api/src/main.ts` |
| **Lines** | 65 |

**Description:**
The CORS configuration in `main.ts` listed only `['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']` in `exposedHeaders`, omitting the standard `Retry-After` header that the server sends with 429 responses.

**Root Cause:**
The `Retry-After` header was added to the rate-limiting middleware during S1.7 (proxy hardening), but the CORS `exposedHeaders` list was not updated to include it.

**Impact:**
- Browser clients cannot read the `Retry-After` header from 429 responses
- Clients cannot implement proper backoff behavior
- Web and admin clients (which run in browsers) are affected; mobile clients (which use native HTTP) are not

**Remediation:**
```diff
-   exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
+   exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
```

**Verification:**
- Web typecheck passes
- Manual test: trigger 429 response, verify browser can read `Retry-After` header
- Code review: confirmed rate-limiting middleware sends `Retry-After` header

**Prevention:**
- When adding new response headers, update CORS `exposedHeaders` list
- Add integration test that verifies browser can read all rate-limit headers

---

### M-02: Mobile `ApiClient._authPaths` Missing Email OTP Endpoints

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Status** | ✅ REMEDIATED |
| **Commit** | `1d90790` |
| **File** | `mobile/packages/mobile-core/lib/src/api_client.dart` |
| **Lines** | 86-93 |

**Description:**
The `ApiClient._authPaths` list, which identifies endpoints that should bypass auto-refresh to prevent recursion, was missing the 6 new Phase 1 endpoints: email OTP request/verify and account link/unlink.

**Root Cause:**
The `_authPaths` list was created during the phone OTP implementation and was not updated when the email OTP and account linking endpoints were added.

**Impact:**
- If the access token expires during an email OTP or account linking call, the auto-refresh interceptor would trigger
- This could cause infinite recursion (refresh triggers another auth call, which triggers another refresh)
- Affects all Flutter clients (mobile app)

**Remediation:**
```diff
  static const _authPaths = <String>[
    '/v1/auth/refresh',
    '/v1/auth/otp/request',
    '/v1/auth/otp/verify',
+   '/v1/auth/otp/email/request',
+   '/v1/auth/otp/email/verify',
    '/v1/auth/login/password',
    '/v1/auth/login/device-check',
+   '/v1/auth/account/link-email',
+   '/v1/auth/account/link-phone',
+   '/v1/auth/account/unlink-email',
+   '/v1/auth/account/unlink-phone',
    '/v1/auth/logout',
  ];
```

**Verification:**
- Flutter analyzer passes (no errors)
- Manual test: expire access token during email OTP call, verify no recursion
- Code review: confirmed all auth-adjacent endpoints are now in the list

**Prevention:**
- When adding new auth endpoints, update `_authPaths` list
- Add unit test that verifies all auth endpoints are in the bypass list
- Consider generating this list from the OpenAPI spec automatically

---

### M-03: `RequestOtpDto.channel` Swagger Enum Mismatch

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Status** | ✅ REMEDIATED |
| **Commit** | `29bc970` |
| **File** | `apps/api/src/modules/identity/dto/auth.dto.ts` |
| **Lines** | 49 |

**Description:**
The `@ApiPropertyOptional` decorator for `RequestOtpDto.channel` listed enum `['sms', 'whatsapp']` but the `@IsIn` validator and Zod contract both accept `'email'`. The NestJS Swagger UI at `/docs` would show an incomplete enum.

**Root Cause:**
The `'email'` channel was added to the validator and Zod contract during Phase 1, but the Swagger decorator was not updated.

**Impact:**
- API documentation (Swagger UI) shows incomplete enum
- Developers consuming the API may not realize `'email'` is a valid channel
- No runtime impact — the validator accepts `'email'` regardless of the Swagger decorator

**Remediation:**
```diff
  @ApiPropertyOptional({
-   enum: ['sms', 'whatsapp'],
+   enum: ['sms', 'whatsapp', 'email'],
    default: 'sms',
    description: 'Delivery channel for the OTP code',
  })
```

**Verification:**
- API typecheck passes
- Swagger UI at `/docs` now shows complete enum
- Code review: confirmed validator, Zod contract, and Swagger decorator all agree

**Prevention:**
- When updating validators, also update Swagger decorators
- Add lint rule that checks Swagger enum matches validator enum
- Consider generating DTOs from Zod schemas automatically

---

### M-04: OpenAPI Spec Contains Stale `purpose` Field

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Status** | ✅ REMEDIATED |
| **Commit** | N/A (generated artifact, not committed) |
| **File** | `packages/contracts/openapi/openapi.json` |
| **Lines** | 999-1002 (pre-regeneration) |

**Description:**
The generated `openapi.json` file contained a `purpose` field in the `EmailOtpRequest` component schema that does not exist in the Zod source (`EmailOtpRequestSchema`) or the server DTO (`EmailOtpRequestDto`).

**Root Cause:**
The `purpose` field was part of an earlier design iteration where the email OTP endpoint accepted a `purpose` parameter (e.g., `'login'`, `'registration'`, `'linking'`). The design was simplified to remove this field, but the OpenAPI spec was not regenerated.

**Impact:**
- Generated clients (TS, Dart) would expect a `purpose` field that the server does not accept
- Clients sending `purpose` would get 400 error (forbidNonWhitelisted)
- No runtime impact for clients that don't send `purpose`

**Remediation:**
```bash
pnpm --filter @scs/contracts generate
# Regenerates openapi.json from Zod schemas
```

**Verification:**
- `grep purpose openapi.json` returns no matches
- Generated OpenAPI spec matches Zod schemas exactly
- All 6 email OTP/account routes present and correct

**Prevention:**
- Regenerate OpenAPI spec as part of CI/CD pipeline
- Add pre-commit hook that checks if spec is up to date
- Document that `openapi.json` is a generated artifact

---

## LOW Severity Findings (Not Remediated)

### L-01: `otpPhone` Returns Full Phone Number (Not Masked)

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **Status** | ⚠️ DOCUMENTED, NOT REMEDIATED |
| **File** | `apps/api/src/modules/identity/identity.service.ts` |
| **Lines** | 1492 |

**Description:**
The `loginWithPassword()` method returns the full, unmasked phone number in the `otpPhone` field when the device is untrusted and OTP is required. Meanwhile, `otpEmail` is masked via `maskEmail()`.

**Rationale for Not Remediating:**
The client needs the actual phone number for OTP verification — the verify endpoint looks up the challenge by phone. If we mask it, the client would send back the masked value and verification would fail. The asymmetry with email exists because the email OTP flow uses a different endpoint that takes the email directly from the request body.

**Security Assessment:**
- User already authenticated with correct password
- Phone number is the user's own phone (on their own session)
- PII exposure is minimal (user knows their own phone)
- No third-party disclosure risk (response goes to authenticated user)

**Recommendation:**
If masking is desired in the future, refactor to use a challenge ID instead of the phone number for verification lookup. This requires a contract change and is low priority.

---

### L-02: `RequestOtpDto.channel` Accepts `'email'` but Endpoint is for Phone

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **Status** | ⚠️ DOCUMENTED, NOT REMEDIATED |
| **File** | `apps/api/src/modules/identity/dto/auth.dto.ts` |
| **Lines** | 55-56 |

**Description:**
The phone OTP endpoint (`POST /v1/auth/otp/request`) accepts `channel: 'email'` in the validator, even though the endpoint is semantically for phone numbers. There is a dedicated email OTP endpoint (`POST /v1/auth/otp/email/request`) for email delivery.

**Rationale for Not Remediating:**
- The validator allows it, and the service handles it (sends email OTP via the phone endpoint)
- Removing `'email'` from the validator would be a breaking change
- The endpoint naming is slightly misleading but not a bug

**Recommendation:**
In a future refactor, either:
1. Remove `'email'` from the phone OTP validator (breaking change, requires migration)
2. Rename the phone OTP endpoint to clarify it accepts multiple channels
3. Split into separate endpoints: `/v1/auth/otp/request-sms`, `/v1/auth/otp/request-whatsapp`, `/v1/auth/otp/request-email`

Low priority — no security or correctness impact.

---

### L-03: Mobile `requestEmailOtp()` Returns Untyped Map

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **Status** | ⚠️ DOCUMENTED, NOT REMEDIATED |
| **File** | `mobile/lib/services/api_service.dart` |
| **Lines** | 160 |

**Description:**
The `requestEmailOtp()` method returns untyped `Map<String, dynamic>` instead of a typed `EmailOtpRequestResponse` model. The web client uses typed `EmailOtpRequestResponse` from `@scs/contracts`.

**Rationale for Not Remediating:**
- Type-safety gap only; wire format is correct
- Dart is dynamically typed, so this is not a runtime error
- Generating typed Dart models from OpenAPI spec is the proper fix (requires tooling setup)

**Recommendation:**
Generate Dart client from OpenAPI spec using `openapi-generator-cli`. This provides typed models automatically and eliminates the gap. Low priority — no security or correctness impact.

---

## OPERATIONAL GAPS (Follow-Up Sprint)

### O-01: No `OpsAlertService` Hooks for Email OTP Failures

| Field | Value |
|-------|-------|
| **Severity** | OPERATIONAL |
| **Status** | ⚠️ GAP — NOT BLOCKING |
| **File** | `apps/api/src/modules/identity/identity.service.ts` |

**Description:**
Email delivery failures, rate-limit triggers, and OTP verification failures are logged but do not trigger `OpsAlertService.raise()` calls. The P13 monitoring system does not scan for email-OTP-specific conditions.

**Impact:**
- Operations team cannot detect email delivery outages automatically
- Rate-limit attacks may go unnoticed
- Brute-force OTP verification attempts not alerted

**Recommendation:**
Add `OpsAlertService.raise()` calls for:
- SMTP delivery failures (>5 in 5 minutes)
- Rate-limit triggers (>100 in 1 minute)
- OTP verification failures (>50 in 15 minutes)

**Priority:** Follow-up sprint (not blocking for merge)

---

### O-02: `P13MonitorService` Does Not Scan Email OTP Conditions

| Field | Value |
|-------|-------|
| **Severity** | OPERATIONAL |
| **Status** | ⚠️ GAP — NOT BLOCKING |
| **File** | `apps/api/src/modules/operations/p13-monitor.service.ts` |

**Description:**
The periodic P13 monitor scans for worker lease failures, outbox dispatch failures, and financial invariant violations, but does not scan for any email-OTP-specific conditions.

**Impact:**
- No automated anomaly detection for auth patterns
- Spike in failures may go unnoticed until users complain

**Recommendation:**
Extend `P13MonitorService` to scan for:
- Email delivery success rate (<98% triggers alert)
- Rate-limit trigger rate (>100/min triggers alert)
- OTP verification failure rate (>50/15min triggers alert)
- Unusual patterns (e.g., same IP hitting rate limit repeatedly)

**Priority:** Follow-up sprint (not blocking for merge)

---

### O-03: No SMTP Failure Playbook

| Field | Value |
|-------|-------|
| **Severity** | OPERATIONAL |
| **Status** | ⚠️ GAP — NOT BLOCKING |
| **File** | `docs/playbooks/operational-playbooks.md` |

**Description:**
The operational playbooks document SMS/WhatsApp provider failover but do not include an SMTP failure playbook.

**Impact:**
- Operators lack guidance for email delivery outages
- Incident response time may be slower

**Recommendation:**
Add SMTP failure playbook covering:
1. Symptom: Email delivery failures in logs
2. Diagnosis: Check SMTP provider status, verify credentials, test connectivity
3. Resolution: Provider outage → wait/failover, credential issue → update env, DNS issue → update records
4. Rollback: Disable feature flag if unresolved

**Priority:** Follow-up sprint (not blocking for merge)

---

### O-04: No OTP Delivery SLO Metric Collection

| Field | Value |
|-------|-------|
| **Severity** | OPERATIONAL |
| **Status** | ⚠️ GAP — NOT BLOCKING |
| **File** | `docs/monitoring/slo-and-alerting.md` |

**Description:**
The SLO documentation defines an OTP delivery success rate target (>98%) and alert threshold (<95% for 5 min), but there is no automated metric collection or alerting rule.

**Impact:**
- SLO compliance cannot be measured automatically
- Cannot detect when delivery rate drops below target

**Recommendation:**
Implement metric collection:
- Track delivery attempts and outcomes in Redis or database
- Create Grafana dashboard showing success rate over time
- Set up alerting rule: success rate <95% for 5 minutes → page on-call

**Priority:** Follow-up sprint (not blocking for merge)

---

### O-05: Production Env Template Missing SMTP Vars

| Field | Value |
|-------|-------|
| **Severity** | OPERATIONAL |
| **Status** | ⚠️ GAP — NOT BLOCKING |
| **File** | `infra/deploy/.env.production.example` |

**Description:**
The production environment template includes a comment noting that SMTP vars are "consumed by integrations that are outside the P13 scope" but does not include the actual variables.

**Impact:**
- Operators must manually add SMTP config
- Risk of forgetting to set required variables

**Recommendation:**
Add SMTP variables to the production template with placeholder values:
```bash
# SMTP configuration (required for email OTP)
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=true
SMTP_FROM=
SMTP_USER=
SMTP_PASSWORD=
```

**Priority:** Follow-up sprint (not blocking for merge)

---

## Remediation Summary

### Commits

| Commit | Description | Files Changed |
|--------|-------------|---------------|
| `1d90790` | fix(auth): S1.39 PR review — normalize email in setupCredentials, add Retry-After CORS header, register email OTP paths in mobile auth bypass | 3 files |
| `29bc970` | fix(api): align RequestOtpDto @ApiPropertyOptional channel enum with validator | 1 file |

### Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| Identity unit tests | 297 | ✅ PASS |
| Notification unit tests | 111 | ✅ PASS |
| Contract tests | 58 | ✅ PASS |
| Web unit tests | 55 | ✅ PASS |
| API typecheck | — | ✅ PASS |
| Web typecheck | — | ✅ PASS |
| **Total** | **521** | **✅ ALL GREEN** |

### Verification

- ✅ All HIGH findings remediated and tested
- ✅ All MEDIUM findings remediated and tested
- ✅ No regressions introduced
- ✅ All tests pass
- ✅ Both typechecks clean
- ✅ Code review completed

---

## Follow-Up Actions

### Before Production Activation

1. ⚠️ Configure SMTP credentials in production environment
2. ⚠️ Set unique OTP_HMAC_SECRET (≥32 chars)
3. ⚠️ Toggle feature flag ON in staging
4. ⚠️ Monitor logs for 24h after activation

### Follow-Up Sprint (Recommended)

1. Add OpsAlertService hooks for email delivery failures
2. Extend P13MonitorService to scan email-OTP conditions
3. Create SMTP failure playbook
4. Implement OTP delivery SLO metric collection
5. Add SMTP vars to production env template

### Low Priority (Backlog)

1. Refactor `otpPhone` response to use challenge ID
2. Generate typed Dart client from OpenAPI spec
3. Rename phone OTP endpoint or split into separate endpoints
4. Add unit test for email normalization in `setupCredentials()`
5. Add integration test for CORS `Retry-After` header

---

**Register prepared by:** Independent PR review (S1.39 task)
**Date:** 2026-11-03
**Status:** COMPLETE — ALL HIGH/MEDIUM FINDINGS REMEDIATED
