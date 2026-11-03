# OTP-S1.40 — Staging Smoke Test Plan

**Date:** 2026-11-03
**Scope:** Post-deployment smoke tests for Phase 1 email-first identity activation
**PR:** #104 (merged at `428b8fa`)

---

## 1. Test Execution Order

Tests must be executed in this order. Each phase builds on the previous.

| Phase | Tests | Duration | Gate |
|-------|-------|----------|------|
| 1 | Infrastructure health | 2 min | Must pass before Phase 2 |
| 2 | Feature flag OFF (404) | 3 min | Must pass before Phase 3 |
| 3 | Feature flag activation | 1 min | Must pass before Phase 4 |
| 4 | Email OTP request/verify | 10 min | Must pass before Phase 5 |
| 5 | Account linking flows | 10 min | Must pass before Phase 6 |
| 6 | Rate limiting | 5 min | Must pass before Phase 7 |
| 7 | Regression (phone OTP, password login) | 10 min | Must pass before Phase 8 |
| 8 | Kill switch rollback | 3 min | Final validation |

**Total estimated duration:** 45 minutes

---

## 2. Phase 1: Infrastructure Health

### Test 1.1: API Health Check

```bash
curl -fsS https://staging-api.your-domain.com/v1/healthz
```

**Expected:** `{"status":"ok"}`
**Classification:** Verified in staging

### Test 1.2: API Readiness Check (DB + Redis)

```bash
curl -fsS https://staging-api.your-domain.com/v1/readyz
```

**Expected:** `{"status":"ok"}`
**Classification:** Verified in staging

### Test 1.3: Database Migration State

```sql
SELECT migration_name, applied_at
FROM _migration_log
WHERE migration_name IN ('0064_email_identity.sql', '0065_hmac_identifier_hash.sql')
ORDER BY applied_at;
```

**Expected:** Both migrations logged
**Classification:** Verified in staging

### Test 1.4: Schema Validation

```sql
-- Phone is nullable
SELECT is_nullable FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'phone';
-- Expected: YES

-- CHECK constraint exists
SELECT conname FROM pg_constraint WHERE conname = 'users_at_least_one_identifier';
-- Expected: users_at_least_one_identifier

-- Email unique index exists
SELECT indexname FROM pg_indexes WHERE indexname = 'idx_users_email_lower';
-- Expected: idx_users_email_lower

-- Feature flag seeded
SELECT key, enabled FROM feature_flags WHERE key = 'auth.email_otp.enabled';
-- Expected: auth.email_otp.enabled | f
```

**Classification:** Verified in staging

### Test 1.5: SMTP Configuration

```bash
docker logs api-service | grep "SMTP email provider"
```

**Expected:** `SMTP email provider is configured for <smtp-host>:<port>`
**Classification:** Verified in staging

---

## 3. Phase 2: Feature Flag OFF (404 Verification)

### Test 2.1: Email OTP Request Returns 404

```bash
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/request \
  -H "Content-Type: application/json" \
  -d '{"email": "test@domain.com"}' \
  -w "\nHTTP %{http_code}\n"
```

**Expected:** HTTP 404 (feature flag is OFF)
**Classification:** Verified in staging

### Test 2.2: Email OTP Verify Returns 404

```bash
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/verify \
  -H "Content-Type: application/json" \
  -d '{"email": "test@domain.com", "otp": "123456"}' \
  -w "\nHTTP %{http_code}\n"
```

**Expected:** HTTP 404
**Classification:** Verified in staging

### Test 2.3: Account Link Email Returns 404

```bash
curl -X POST https://staging-api.your-domain.com/v1/auth/account/link-email \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@domain.com", "otp": "123456"}' \
  -w "\nHTTP %{http_code}\n"
```

**Expected:** HTTP 404 (or 401 if no token — both acceptable)
**Classification:** Verified in staging

### Test 2.4: Phone OTP Still Works (Regression)

```bash
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/request \
  -H "Content-Type: application/json" \
  -d '{"phone": "+966500000000"}' \
  -w "\nHTTP %{http_code}\n"
```

**Expected:** HTTP 200 (phone OTP unaffected by email flag)
**Classification:** Verified in staging

---

## 4. Phase 3: Feature Flag Activation

### Test 3.1: Enable Feature Flag

```sql
UPDATE feature_flags SET enabled = true WHERE key = 'auth.email_otp.enabled';
SELECT key, enabled FROM feature_flags WHERE key = 'auth.email_otp.enabled';
```

**Expected:** `auth.email_otp.enabled | t`
**Classification:** Requires staging configuration

### Test 3.2: Verify Email OTP Request No Longer Returns 404

```bash
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/request \
  -H "Content-Type: application/json" \
  -d '{"email": "smoke-test@your-domain.com"}' \
  -w "\nHTTP %{http_code}\n"
```

**Expected:** HTTP 200 (not 404)
**Classification:** Verified in staging

---

## 5. Phase 4: Email OTP Request/Verify Flow

### Test 4.1: Request Email OTP

```bash
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/request \
  -H "Content-Type: application/json" \
  -d '{"email": "smoke-test@your-domain.com"}'
```

**Expected:**
```json
{"success": true, "deliveryStatus": "accepted", "possiblyDelivered": true}
```

**Also verify:**
- Check email inbox — OTP email received within 30 seconds
- Check logs: `docker logs api-service | grep "SMTP delivery"`
- Expected log: `SMTP delivery accepted for s***@your-domain.com`

**Classification:** Requires staging configuration (SMTP)

### Test 4.2: Timing Floor Enforcement

```bash
time curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/request \
  -H "Content-Type: application/json" \
  -d '{"email": "timing-test@your-domain.com"}'
```

**Expected:** Response time ≥ 250ms (timing floor)
**Classification:** Verified in staging

### Test 4.3: Enumeration Resistance (Non-Existing Email)

```bash
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/request \
  -H "Content-Type: application/json" \
  -d '{"email": "nonexistent@your-domain.com"}'
```

**Expected:** Same response as Test 4.1 (no disclosure of email existence)
**Classification:** Verified in staging

### Test 4.4: Verify Email OTP

```bash
# Read OTP from email inbox (6-digit code)
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/verify \
  -H "Content-Type: application/json" \
  -d '{"email": "smoke-test@your-domain.com", "otp": "<6-digit-code>", "deviceId": "smoke-test-device"}'
```

**Expected:**
```json
{"accessToken": "<jwt>", "refreshToken": "<uuid>"}
```

**Classification:** Requires staging configuration (SMTP)

### Test 4.5: Access Token Works

```bash
curl https://staging-api.your-domain.com/v1/me \
  -H "Authorization: Bearer <access-token>"
```

**Expected:** 200 OK with user profile (email-only user created)
**Classification:** Verified in staging

### Test 4.6: Replay Prevention

```bash
# Try to verify same OTP again
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/verify \
  -H "Content-Type: application/json" \
  -d '{"email": "smoke-test@your-domain.com", "otp": "<same-code>", "deviceId": "smoke-test-device"}' \
  -w "\nHTTP %{http_code}\n"
```

**Expected:** HTTP 401 (OTP already consumed)
**Classification:** Verified in staging

---

## 6. Phase 5: Account Linking Flows

### Test 5.1: Setup — Create Phone-Only User

```bash
# Request phone OTP
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/request \
  -H "Content-Type: application/json" \
  -d '{"phone": "+966500000001"}'

# Verify phone OTP (read code from SMS/WhatsApp)
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"phone": "+966500000001", "otp": "<code>", "deviceId": "link-test-device"}'
# Save accessToken
```

**Classification:** Requires staging configuration (SMS/WhatsApp)

### Test 5.2: Link Email to Phone Account

```bash
# Request email OTP for linking
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/request \
  -H "Content-Type: application/json" \
  -d '{"email": "link-test@your-domain.com"}'

# Verify email OTP (consumes challenge)
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/verify \
  -H "Content-Type: application/json" \
  -d '{"email": "link-test@your-domain.com", "otp": "<code>"}'

# Link email to account (requires OTP proof-of-control)
curl -X POST https://staging-api.your-domain.com/v1/auth/account/link-email \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{"email": "link-test@your-domain.com", "otp": "<same-code>"}'
```

**Expected:** HTTP 200, `{"success": true}`

**Note:** The OTP must be re-requested after verify consumes it. The link endpoint requires a fresh OTP that proves control.

**Classification:** Requires staging configuration

### Test 5.3: Verify Both Identifiers Present

```bash
curl https://staging-api.your-domain.com/v1/me \
  -H "Authorization: Bearer <access-token>"
```

**Expected:** Profile shows both phone and email
**Classification:** Verified in staging

### Test 5.4: Unlink Phone (Email Remains)

```bash
curl -X POST https://staging-api.your-domain.com/v1/auth/account/unlink-phone \
  -H "Authorization: Bearer <access-token>" \
  -w "\nHTTP %{http_code}\n"
```

**Expected:** HTTP 200, `{"success": true}`
**Classification:** Verified in staging

### Test 5.5: Cannot Unlink Last Identifier

```bash
# Try to unlink email (only identifier remaining)
curl -X POST https://staging-api.your-domain.com/v1/auth/account/unlink-email \
  -H "Authorization: Bearer <access-token>" \
  -w "\nHTTP %{http_code}\n"
```

**Expected:** HTTP 400 (cannot remove last identifier)
**Classification:** Verified in staging

---

## 7. Phase 6: Rate Limiting

### Test 6.1: Per-Email Rate Limit (5/15min)

```bash
for i in {1..6}; do
  curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/request \
    -H "Content-Type: application/json" \
    -d '{"email": "rate-limit-test@your-domain.com"}' \
    -w "\nRequest $i: HTTP %{http_code}\n"
done
```

**Expected:** First 5 return 200, 6th returns 429
**Classification:** Verified in staging

### Test 6.2: Rate Limit Headers

```bash
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/request \
  -H "Content-Type: application/json" \
  -d '{"email": "header-test@your-domain.com"}' \
  -D -
```

**Expected headers present:**
- `X-RateLimit-Limit: 5`
- `X-RateLimit-Remaining: <n>`
- `X-RateLimit-Reset: <unix-timestamp>`

**After 429:**
- `Retry-After: <seconds>`

**Classification:** Verified in staging

### Test 6.3: CORS Exposes Retry-After

```bash
curl -X OPTIONS https://staging-api.your-domain.com/v1/auth/otp/email/request \
  -H "Origin: https://staging-shop.your-domain.com" \
  -H "Access-Control-Request-Method: POST" \
  -D - | grep -i access-control-expose-headers
```

**Expected:** `Retry-After` in exposed headers list
**Classification:** Verified in staging

---

## 8. Phase 7: Regression Tests

### Test 7.1: Phone OTP Request/Verify

```bash
# Request
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/request \
  -H "Content-Type: application/json" \
  -d '{"phone": "+966500000002"}'
# Expected: 200 OK

# Verify
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"phone": "+966500000002", "otp": "<code>", "deviceId": "regression-test"}'
# Expected: 200 OK with tokens
```

**Classification:** Requires staging configuration (SMS/WhatsApp)

### Test 7.2: Password Login (Existing User)

```bash
curl -X POST https://staging-api.your-domain.com/v1/auth/login/password \
  -H "Content-Type: application/json" \
  -d '{"email": "smoke-test@your-domain.com", "password": "<password>", "deviceId": "regression-test"}'
```

**Expected:** 200 OK with tokens (if device trusted) or `requiresOtp: true` (if untrusted)
**Classification:** Verified in staging

### Test 7.3: Email Normalization in setupCredentials

```bash
# This test verifies the S1.39 fix: setupCredentials normalizes email

# 1. Create new user via email OTP with mixed case
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/request \
  -H "Content-Type: application/json" \
  -d '{"email": "Mixed.Case@Your-Domain.com"}'

# 2. Verify OTP
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/verify \
  -H "Content-Type: application/json" \
  -d '{"email": "Mixed.Case@Your-Domain.com", "otp": "<code>", "deviceId": "norm-test"}'

# 3. Setup credentials
curl -X POST https://staging-api.your-domain.com/v1/me/credentials/setup \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{"email": "Mixed.Case@Your-Domain.com", "password": "TestPassword123!"}'

# 4. Login with lowercase email
curl -X POST https://staging-api.your-domain.com/v1/auth/login/password \
  -H "Content-Type: application/json" \
  -d '{"email": "mixed.case@your-domain.com", "password": "TestPassword123!", "deviceId": "norm-test"}'
# Expected: 200 OK (login succeeds with normalized email)
```

**Classification:** Verified in staging

---

## 9. Phase 8: Kill Switch Rollback

### Test 8.1: Disable Feature Flag

```sql
UPDATE feature_flags SET enabled = false WHERE key = 'auth.email_otp.enabled';
```

**Classification:** Requires staging configuration

### Test 8.2: Email OTP Returns 404 After Disable

```bash
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/email/request \
  -H "Content-Type: application/json" \
  -d '{"email": "test@domain.com"}' \
  -w "\nHTTP %{http_code}\n"
```

**Expected:** HTTP 404 (not 403 — prevents enumeration)
**Classification:** Verified in staging

### Test 8.3: Phone OTP Unaffected

```bash
curl -X POST https://staging-api.your-domain.com/v1/auth/otp/request \
  -H "Content-Type: application/json" \
  -d '{"phone": "+966500000003"}' \
  -w "\nHTTP %{http_code}\n"
```

**Expected:** HTTP 200 (phone OTP unaffected)
**Classification:** Verified in staging

### Test 8.4: Re-Enable Feature Flag

```sql
UPDATE feature_flags SET enabled = true WHERE key = 'auth.email_otp.enabled';
```

**Classification:** Requires staging configuration

---

## 10. Test Data Cleanup

After smoke testing, clean up test data:

```sql
-- Delete smoke test users
DELETE FROM users WHERE email LIKE '%smoke-test@%' OR email LIKE '%link-test@%' OR email LIKE '%rate-limit-test@%' OR email LIKE '%timing-test@%' OR email LIKE '%header-test@%' OR email LIKE '%Mixed.Case@%';

-- Clean up audit log entries
DELETE FROM account_link_log WHERE identifier_hash LIKE '%smoke-test%' OR identifier_hash LIKE '%link-test%';

-- Verify cleanup
SELECT COUNT(*) FROM users WHERE email LIKE '%test@%';
-- Expected: 0
```

---

## 11. Acceptance Criteria

### Phase 1 (Infrastructure): ALL MUST PASS
- [ ] Test 1.1: API health check returns 200
- [ ] Test 1.2: API readiness check returns 200
- [ ] Test 1.3: Both migrations logged
- [ ] Test 1.4: Schema validation passes
- [ ] Test 1.5: SMTP configured

### Phase 2 (Flag OFF): ALL MUST PASS
- [ ] Test 2.1: Email OTP request returns 404
- [ ] Test 2.2: Email OTP verify returns 404
- [ ] Test 2.3: Account link returns 404
- [ ] Test 2.4: Phone OTP still works

### Phase 3 (Activation): ALL MUST PASS
- [ ] Test 3.1: Feature flag enabled
- [ ] Test 3.2: Email OTP request returns 200

### Phase 4 (Email OTP): ALL MUST PASS
- [ ] Test 4.1: Email OTP request succeeds
- [ ] Test 4.2: Timing floor ≥ 250ms
- [ ] Test 4.3: Non-existing email returns same response
- [ ] Test 4.4: Email OTP verify succeeds
- [ ] Test 4.5: Access token works
- [ ] Test 4.6: Replay prevented

### Phase 5 (Account Linking): ALL MUST PASS
- [ ] Test 5.1: Phone-only user created
- [ ] Test 5.2: Email linked successfully
- [ ] Test 5.3: Both identifiers present
- [ ] Test 5.4: Phone unlinked successfully
- [ ] Test 5.5: Cannot unlink last identifier

### Phase 6 (Rate Limiting): ALL MUST PASS
- [ ] Test 6.1: 6th request returns 429
- [ ] Test 6.2: Rate limit headers present
- [ ] Test 6.3: Retry-After exposed in CORS

### Phase 7 (Regression): ALL MUST PASS
- [ ] Test 7.1: Phone OTP works
- [ ] Test 7.2: Password login works
- [ ] Test 7.3: Email normalization works

### Phase 8 (Kill Switch): ALL MUST PASS
- [ ] Test 8.1: Feature flag disabled
- [ ] Test 8.2: Email OTP returns 404
- [ ] Test 8.3: Phone OTP unaffected
- [ ] Test 8.4: Feature flag re-enabled

---

## 12. Failure Procedures

### If Phase 1 Fails
**Action:** STOP. Do not proceed. Fix infrastructure issues before continuing.

### If Phase 2 Fails
**Action:** Feature flag may already be ON. Check database. If ON, skip to Phase 3.

### If Phase 3 Fails
**Action:** STOP. Migration may not be applied. Check `_migration_log`.

### If Phase 4 Fails
**Action:** Soft rollback (disable feature flag). Investigate SMTP configuration. Check logs.

### If Phase 5 Fails
**Action:** Soft rollback. Investigate account linking logic. Check audit log.

### If Phase 6 Fails
**Action:** Soft rollback. Investigate Redis connectivity. Check rate limit configuration.

### If Phase 7 Fails
**Action:** Soft rollback. This indicates a regression. Investigate code changes.

### If Phase 8 Fails
**Action:** Feature flag may be stuck. Check database. Manual intervention required.

---

## 13. References

**Test files:**
- `apps/api/src/__tests__/integration/email-otp-e2e.postgres.spec.ts`
- `apps/api/src/__tests__/integration/account-linking.postgres.spec.ts`
- `apps/api/src/__tests__/unit/identity/email-enumeration.spec.ts`

**Documentation:**
- `docs/production/OTP-S1.40-STAGING-ACTIVATION-RUNBOOK.md`
- `docs/production/OTP-S1.40-ENVIRONMENT-CONFIGURATION-REGISTER.md`

---

**Plan prepared by:** S1.40 staging activation preparation
**Date:** 2026-11-03
**Status:** COMPLETE — READY FOR STAGING EXECUTION
