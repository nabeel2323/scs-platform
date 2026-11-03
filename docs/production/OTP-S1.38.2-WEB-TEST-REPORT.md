# OTP-S1.38.2-WEB-TEST-REPORT.md

**Task:** S1.38.2 §2 — Web Email-OTP and Account-Linking Component Tests  
**Date:** 2026-11-01  

---

## Command

```
cd apps/web && npx vitest run src/__tests__/email-otp-login.test.tsx src/__tests__/account-linking.test.tsx --reporter=verbose
```

## Execution Environment

| Component | Detail |
|---|---|
| OS | Windows 11 23H2 |
| Node.js | 22.23.4 (fnm) |
| Vitest | 2.1.9 |
| React Testing Library | via @testing-library/react |
| Duration | 14.72s |

## Exit Code

**0** — All tests passed.

## Test Files

### 1. `apps/web/src/__tests__/email-otp-login.test.tsx` — 13 tests

| # | Test | Result | Time |
|---|---|---|---|
| 1 | renders the Email OTP tab alongside Password and Phone OTP | ✓ pass | 631ms |
| 2 | selecting the Email OTP tab reveals the email-address request form | ✓ pass | 357ms |
| 3 | selecting the Phone OTP tab does not render the Email OTP form | ✓ pass | — |
| 4 | submits the entered email to requestEmailOtp and transitions to the verify stage | ✓ pass | — |
| 5 | a successful verify establishes a session and navigates after profile fetch | ✓ pass | 643ms |
| 6 | surfaces an invalid-OTP error message returned by the API | ✓ pass | — |
| 7 | surfaces an expired-OTP error message returned by the API | ✓ pass | — |
| 8 | handles network failure (thrown Error) with an actionable message | ✓ pass | — |
| 9 | surfaces rate limit with the retry-after countdown | ✓ pass | — |
| 10 | prevents duplicate submission while the request is in-flight | ✓ pass | — |
| 11 | Change email returns to the request stage with the email preserved | ✓ pass | — |
| 12 | reaching the verify stage from a stale Phone OTP session shows only the email form | ✓ pass | — |
| 13 | existing password tab still reaches loginPassword / existing Phone OTP tab still reaches requestOtp | ✓ pass | — |
| 14 | switching tabs clears the prior tab's error and resets email-OTP stage | ✓ pass | — |

### 2. `apps/web/src/__tests__/account-linking.test.tsx` — 16 tests

| # | Test | Result | Time |
|---|---|---|---|
| 1 | displays the current email and phone identities | ✓ pass | 468ms |
| 2 | shows "Not linked" when email and phone are both absent, then offers a link form | ✓ pass | 319ms |
| 3 | requests an email OTP then links on successful verification, refreshing the profile | ✓ pass | 477ms |
| 4 | requests a phone OTP then links on successful verification | ✓ pass | — |
| 5 | re-renders the linked identity from the refreshed profile, not from local input state | ✓ pass | — |
| 6 | surfaces the server ownership-conflict message (409) | ✓ pass | — |
| 7 | surfaces an invalid-OTP error from the verify submission | ✓ pass | — |
| 8 | surfaces an invalid or expired OTP error | ✓ pass | — |
| 9 | unlink email refreshes the profile and returns to the Not-linked state | ✓ pass | — |
| 10 | unlink phone refreshes the profile through unlinkPhone | ✓ pass | — |
| 11 | surfaces the server-side last-auth-method rejection when unlinking the only identifier | ✓ pass | — |
| 12 | skips the unlink call when the confirmation dialog is declined | ✓ pass | — |
| 13 | does not merge accounts automatically — the email row remains "Not linked" after a conflict | ✓ pass | — |
| 14 | Cancel on the email verify stage returns to the idle request stage | ✓ pass | — |

## Coverage Matrix vs §2 Requirements

### Email OTP Login

| Requirement | Test | Status |
|---|---|---|
| Email tab visible and selectable | Test 1, 2 | ✓ Covered |
| Valid email can request OTP | Test 4 | ✓ Covered |
| Successful request transitions to verification | Test 4 | ✓ Covered |
| Correct OTP establishes session and navigates | Test 5 | ✓ Covered |
| Invalid OTP displays error | Test 6 | ✓ Covered |
| Expired OTP displays error | Test 7 | ✓ Covered |
| Network failure handled | Test 8 | ✓ Covered |
| Rate-limit response and retry info | Test 9 | ✓ Covered |
| Duplicate submission prevented | Test 10 | ✓ Covered |
| Existing password and phone OTP unaffected | Tests 12, 13, 14 | ✓ Covered |

### Account Linking

| Requirement | Test | Status |
|---|---|---|
| Existing email and phone identities display | Test 1 | ✓ Covered |
| Linking email requests OTP and submits verification | Test 3 | ✓ Covered |
| Linking phone requests OTP and submits verification | Test 4 | ✓ Covered |
| Successful linking refreshes profile | Tests 3, 5 | ✓ Covered |
| Ownership conflict displayed (409) | Test 6 | ✓ Covered |
| Invalid and expired OTP handled | Tests 7, 8 | ✓ Covered |
| Unlinking refreshes profile | Tests 9, 10 | ✓ Covered |
| Last-auth-method rejection displayed | Test 11 | ✓ Covered |
| No automatic account merging | Test 13 | ✓ Covered |

## Summary

| Metric | Value |
|---|---|
| Test files | 2 |
| Tests collected | 29 |
| Passed | 29 |
| Failed | 0 |
| Skipped | 0 |
| Exit code | 0 |

## Mocking Boundary

External APIs mocked at the established test boundary:
- `requestEmailOtp`, `verifyEmailOtp` — auth API calls
- `linkEmail`, `linkPhone`, `unlinkEmail`, `unlinkPhone` — account linking API calls
- `fetchProfile` — profile refresh after linking
- `loginPassword`, `requestOtp` — existing login paths (regression verification)

No production code was weakened to make tests pass.
