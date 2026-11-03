# OTP-S1.41 — Smoke-Test Sequence Verification

**Date:** 2026-11-03
**Scope:** Verification of account-linking smoke-test sequence against actual implementation
**Task:** S1.41-A — Fix account-linking smoke-test sequence

---

## 1. Issue Summary

The S1.40 smoke-test plan contained a contradictory account-linking sequence that would fail in practice.

**Original (incorrect) sequence in Test 5.2:**
```bash
# Request email OTP
POST /v1/auth/otp/email/request {email: "link-test@..."}

# Verify email OTP (CONSUMES the challenge)
POST /v1/auth/otp/email/verify {email: "link-test@...", otp: "<code>"}

# Link email to account (tries to use same OTP — FAILS)
POST /v1/auth/account/link-email {email: "link-test@...", otp: "<same-code>"}
```

**Problem:** The verify endpoint consumes the OTP challenge, so the same OTP cannot be used for linking afterwards.

---

## 2. Implementation Verification

### 2.1 Source Code Analysis

**File:** `apps/api/src/modules/identity/identity.service.ts`

**Method:** `linkEmailToAccount()` (lines 1792-1843)

```typescript
async linkEmailToAccount(
  userId: string,
  rawEmail: string,
  otp: string,
): Promise<{ success: boolean }> {
  // 1. Proof of control — consumes the challenge, so a code cannot be replayed
  //    afterwards to log in.
  const { email } = await this.consumeEmailChallenge(rawEmail, otp);  // ← LINE 1799
  
  // ... rest of linking logic
}
```

**Key finding:** Line 1799 calls `consumeEmailChallenge()`, which CONSUMES the OTP challenge. This means:
- The link endpoint itself consumes the OTP as proof-of-control
- No separate verify step is needed before linking
- The same OTP cannot be replayed after linking succeeds

**Symmetric behavior for phone linking:**

**Method:** `linkPhoneToAccount()` (lines 1857-1908)

```typescript
async linkPhoneToAccount(
  userId: string,
  rawPhone: string,
  otp: string,
): Promise<{ success: boolean }> {
  // 1. Proof of control — consumes the challenge
  const { phone } = await this.consumePhoneChallenge(rawPhone, otp);  // ← LINE 1864
  
  // ... rest of linking logic
}
```

### 2.2 Integration Test Verification

**File:** `apps/api/src/__tests__/integration/account-linking.postgres.spec.ts`

**Test pattern (lines 150-172):**
```typescript
it('links email to a phone-only account with a consumed OTP', async () => {
  const userId = await makePhoneOnlyUser('+966500000099');
  const otp = await issueEmailOtp('NewEmail@Example.COM');  // ← Creates challenge
  
  const result = await service.linkEmailToAccount(
    userId, 
    'NewEmail@Example.COM', 
    otp  // ← Consumes challenge as proof-of-control
  );
  expect(result.success).toBe(true);
  
  // Verify DB state
  const row = await pool.query(
    `SELECT email, email_verified_at FROM users WHERE id = $1`, 
    [userId]
  );
  expect(row.rows[0].email).toBe('newemail@example.com'); // normalized
  expect(row.rows[0].email_verified_at).not.toBeNull();
});
```

**Replay prevention test (lines 206-224):**
```typescript
it('consumes the challenge so a link OTP cannot be replayed (S1.37-F-04)', async () => {
  const userId = await makePhoneOnlyUser('+966500000096');
  const otp = await issueEmailOtp('replay@example.com');
  
  // First link succeeds
  await expect(
    service.linkEmailToAccount(userId, 'replay@example.com', otp)
  ).resolves.toEqual({ success: true });
  
  // Same OTP cannot be used again
  await expect(
    service.linkEmailToAccount(userId, 'replay@example.com', otp)
  ).rejects.toThrow(/OTP|expired|not found/i);
});
```

**Key findings:**
1. Test creates challenge with `issueEmailOtp()`
2. Test calls `linkEmailToAccount()` which consumes the challenge
3. Test confirms the same OTP cannot be replayed
4. No separate verify step is used in the test pattern

### 2.3 Controller Verification

**File:** `apps/api/src/modules/identity/auth.controller.ts`

**Endpoint:** `POST /v1/auth/account/link-email` (lines 113-118)

```typescript
@Post('account/link-email')
@UseGuards(JwtAuthGuard)
async linkEmail(@CurrentUser() user: JwtPayload, @Body() dto: LinkEmailDto) {
  await this.assertEmailIdentityEnabled();
  return this.identityService.linkEmailToAccount(user.sub, dto.email, dto.otp);
}
```

**Key findings:**
1. Endpoint requires JWT authentication (`@UseGuards(JwtAuthGuard)`)
2. Endpoint requires feature flag to be enabled (`assertEmailIdentityEnabled()`)
3. Endpoint passes `dto.otp` directly to `linkEmailToAccount()`, which consumes it

**DTO verification:**

**File:** `apps/api/src/modules/identity/dto/auth.dto.ts`

**LinkEmailDto (lines ~150-160):**
```typescript
export class LinkEmailDto {
  @IsEmail()
  email: string;
  
  @Matches(/^\d{6}$/)
  otp: string;
}
```

**Key findings:**
1. DTO requires `email` (validated as email format)
2. DTO requires `otp` (validated as 6 digits)
3. No separate verification token or challenge ID is needed

---

## 3. Corrected Smoke-Test Sequence

### 3.1 Email Linking (Test 5.2)

**Correct sequence:**

```bash
# Step 1: Authenticate as existing phone user (get JWT)
# (Use phone OTP flow to obtain access token)
POST /v1/auth/otp/request {phone: "+966500000001"}
POST /v1/auth/otp/verify {phone: "+966500000001", otp: "<code>", deviceId: "link-test-device"}
# Save accessToken from response

# Step 2: Request email OTP for the email to be linked
POST /v1/auth/otp/email/request 
  -H "Authorization: Bearer <access-token>"
  {email: "link-test@your-domain.com"}
# Expected: 200 OK, {"success":true,"deliveryStatus":"accepted","possiblyDelivered":true}

# Step 3: Read OTP from email inbox (6-digit code)

# Step 4: Link email to account (consumes OTP as proof-of-control)
POST /v1/auth/account/link-email
  -H "Authorization: Bearer <access-token>"
  {email: "link-test@your-domain.com", otp: "<6-digit-code>"}
# Expected: 200 OK, {"success":true}

# Step 5: Verify both identifiers present
GET /v1/me
  -H "Authorization: Bearer <access-token>"
# Expected: 200 OK, profile shows both phone and email
```

**Important notes:**
- Do NOT verify the OTP separately before linking
- The link endpoint consumes the OTP directly as proof-of-control
- The same OTP cannot be replayed after linking succeeds
- JWT authentication is required for the link endpoint

### 3.2 Phone Linking (symmetric pattern)

**Correct sequence:**

```bash
# Step 1: Authenticate as existing email user (get JWT)
# (Use email OTP flow to obtain access token)
POST /v1/auth/otp/email/request {email: "existing@your-domain.com"}
POST /v1/auth/otp/email/verify {email: "existing@your-domain.com", otp: "<code>", deviceId: "link-test-device"}
# Save accessToken from response

# Step 2: Request phone OTP for the phone to be linked
POST /v1/auth/otp/request
  -H "Authorization: Bearer <access-token>"
  {phone: "+966500000002"}
# Expected: 200 OK

# Step 3: Read OTP from SMS/WhatsApp (6-digit code)

# Step 4: Link phone to account (consumes OTP as proof-of-control)
POST /v1/auth/account/link-phone
  -H "Authorization: Bearer <access-token>"
  {phone: "+966500000002", otp: "<6-digit-code>"}
# Expected: 200 OK, {"success":true}
```

---

## 4. Files Corrected

### 4.1 Smoke Test Plan

**File:** `docs/production/OTP-S1.40-STAGING-SMOKE-TEST-PLAN.md`

**Section:** Test 5.2 (lines 277-301)

**Changes:**
- Removed contradictory verify step
- Added explanation of proof-of-control contract
- Referenced integration test pattern
- Emphasized that link endpoint consumes OTP directly

### 4.2 Activation Runbook

**File:** `docs/production/OTP-S1.40-STAGING-ACTIVATION-RUNBOOK.md`

**Section:** 6.2 (lines 500-518)

**Changes:**
- Removed contradictory verify step
- Added explanation of proof-of-control contract
- Referenced integration test pattern
- Emphasized that link endpoint consumes OTP directly

---

## 5. Verification Checklist

- [x] Account-linking sequence matches actual implementation
- [x] Proof-of-control contract correctly documented
- [x] Integration test pattern referenced
- [x] No separate verify step before linking
- [x] JWT authentication requirement documented
- [x] Feature flag requirement documented
- [x] Replay prevention behavior documented
- [x] Symmetric phone-linking pattern documented
- [x] All endpoint paths correct
- [x] All DTO fields correct
- [x] All expected HTTP statuses correct

---

## 6. Regression Reference

**Integration test file:** `apps/api/src/__tests__/integration/account-linking.postgres.spec.ts`

**Key tests:**
- Lines 150-172: Link email with consumed OTP
- Lines 174-190: Refuse link without proof-of-control
- Lines 192-204: Refuse wrong OTP
- Lines 206-224: OTP cannot be replayed
- Lines 226-245: Case-variant collision surfaces as 409
- Lines 247-270: Reject email already owned by another user

**Test helper functions:**
- `issueEmailOtp(email)` — Creates email OTP challenge (lines 118-121)
- `issuePhoneOtp(phone)` — Creates phone OTP challenge (lines 128-131)
- `makePhoneOnlyUser(phone)` — Creates phone-only test user (lines 133-140)
- `cleanup(...userIds)` — Cleans up test data (lines 142-145)

---

## 7. Conclusion

The account-linking smoke-test sequence has been corrected to match the actual implementation. The key insight is that the link endpoint itself consumes the OTP as proof-of-control — there is no separate verify step needed before linking.

**Correct flow:**
1. Authenticate (get JWT)
2. Request OTP for identifier to be linked
3. Call link endpoint with OTP (consumes it as proof-of-control)
4. Done

**Incorrect flow (original S1.40):**
1. Authenticate (get JWT)
2. Request OTP
3. Verify OTP (consumes challenge)
4. Try to link with same OTP (fails — challenge already consumed)

All documentation has been corrected to reflect the actual implementation.

---

**Report prepared by:** S1.41 smoke-test sequence verification
**Date:** 2026-11-03
**Status:** ✅ COMPLETE — SEQUENCE VERIFIED AGAINST IMPLEMENTATION
