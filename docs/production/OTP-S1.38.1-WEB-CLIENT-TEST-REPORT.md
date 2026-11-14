# S1.38.1 — Web Client Test Report

**Subject:** Next.js 15 web client's coverage of email-OTP login and account linking.

## Files Under Test (S1.38 Web delta)

| File | Role |
| --- | --- |
| `apps/web/src/app/auth/login/page.tsx` | Email OTP tab (three-tab login) |
| `apps/web/src/app/account/page.tsx` | Authentication Methods section (email/phone link/unlink) |
| `apps/web/src/lib/auth.ts` | Wire functions: `requestEmailOtp`, `verifyEmailOtp`, `linkEmail`, `linkPhone`, `unlinkEmail`, `unlinkPhone` |
| `apps/web/src/lib/buyer-api.ts` | `UserProfile` type (phone nullable) |
| `apps/web/src/components/AuthCard.tsx` | Layout — no S1.38.1 change |
| `apps/web/src/components/Navbar.tsx` | Display identity fallback |
| `apps/web/src/app/merchant/organization/page.tsx` | Null-safe phone display |

## Verification Executed

### 1. Static Analysis

| Command | Exit | Result |
| --- | --- | --- |
| `apps/web > npx tsc --noEmit` | 0 | 0 type errors |
| `apps/web > npx vitest run` | 0 | 3 files, 26/26 pass |

### 2. Endpoint Literal Parity (grep cross-check)

Web `auth.ts` fetch calls verified against NestJS `auth.controller.ts`:

```
POST /v1/auth/otp/email/request   → controller @Post('otp/email/request')  ✓
POST /v1/auth/otp/email/verify    → controller @Post('otp/email/verify')   ✓
POST /v1/auth/account/link-email  → controller @Post('account/link-email') ✓
POST /v1/auth/account/link-phone  → controller @Post('account/link-phone') ✓
POST /v1/auth/account/unlink-email → controller @Post('account/unlink-email') ✓
POST /v1/auth/account/unlink-phone → controller @Post('account/unlink-phone') ✓
```

No drift.

### 3. Type Nullable Propagation

`UserProfile.phone` is now `string | null` in `buyer-api.ts`. Verified consumers:
- `apps/web/src/app/account/page.tsx:246` — displays `{profile.phone || '—'}`
- `apps/web/src/app/merchant/organization/page.tsx:871,885` — same null-coalesce pattern
- `apps/web/src/components/AuthCard.tsx` — uses `user.fullName || user.phone || user.email || 'Account'` for the greeting (email-only users see their email, not an empty phone)

### 4. Existing Test Coverage

| Spec | Tests | Focus |
| --- | --- | --- |
| `apps/web/src/__tests__/auth-login-channel.test.tsx` | 9 | OTP channel selector (sms/whatsapp) |
| `apps/web/src/__tests__/merchant-deliveries.test.tsx` | 9 | Merchant delivery flows |
| `apps/web/src/__tests__/shipops.test.ts` | 8 | Shipops logic |

**Total: 26 tests, all pass.**

**Gap:** none of the 3 specs cover the email-OTP path or account linking UI. The `auth-login-channel.test.tsx` file covers the sms/whatsapp channel selector; extending it for the third "Email OTP" tab was considered but deferred (see Outstanding below).

### 5. Production Build Attempt

```
Command: cd apps/web; npx next build
Exit:    1
Error:   Cannot find module 'C:\TAIF\scs-platform\node_modules\.pnpm\next@14.2.35__react@18.3.1\node_modules\next\dist\compiled\jest-worker\processChild.js'
```

Root cause analysis:
- Host Node version is v26.4.0 (current system).
- Repo `.nvmrc` pins Node 22.
- `node_modules/.pnpm/next@14.2.35__react@18.3.1/` tree is incomplete — the `dist/compiled/jest-worker/processChild.js` artefact is missing from the virtual store.
- Same failure documented in the S1.3 second-independent-audit memory (2026-10): "dependencies were not repaired; recorded as NOT VERIFIED rather than contradicting the report's 'success'".

**Verdict:** environmental, not a code regression. The S1.38 report's "420 files compiled successfully" claim refers to API (`nest build`), which this session independently verified at 422 files. It did not explicitly claim Web build success.

## UI Behaviour Verified by Source Inspection

The following claims S1.38 made for Web UI were read directly against source (not exercised at runtime):

### Email OTP Login (`apps/web/src/app/auth/login/page.tsx`)

- Third tab present alongside Password and Phone OTP.
- Two-phase request → verify flow with `emailOtpStage: 'idle' | 'verify'`.
- Error message rendering for network, validation, and rate-limit failures.
- Duplicate-submit prevention via `disabled={isLoading || !email}`.
- Session establishment calls `verifyEmailOtp(email, otp)` and stores tokens via existing `saveSession()` helper.

### Account Linking (`apps/web/src/app/account/page.tsx`)

- "Authentication Methods" card between Profile and Organizations sections.
- Email row shows current email with `Remove` button (calls `unlinkEmail`) or Link form (calls `requestEmailOtp` then `linkEmail`).
- Phone row symmetric.
- On success, `fetchProfile()` re-invoked to refresh displayed identity.
- Rate-limit errors surface as inline messages; server 409 (ownership conflict) surfaces as "already linked to another account".
- Server-side last-auth-method protection: `unlink*` returns 400 when it would leave the account with no reachable identifier; UI surfaces the message but does not attempt client-side pre-validation.

### Rate Limit / Resend Handling

- `apps/web/src/lib/auth.ts` fetch wrapper detects HTTP 429 and parses `X-RateLimit-Reset` into the surfaced error string.
- No dedicated Web test exists for this path; verified by grep that `LoginRateLimitError` handling propagates through the wrapper.

## Outstanding Web Verification Gaps

1. **No new component / integration tests added in S1.38.1.** The 26-test baseline covers sms/whatsapp OTP but not the third email-OTP tab. Adding RTL tests for `page.tsx` and `account/page.tsx` would require `@testing-library/react` and jsdom setup consistent with `auth-login-channel.test.tsx` — feasible but not done in this session due to context budget.
2. **No runtime click-through verification.** Browser-level smoke of email-OTP request/verify flow and account link/unlink flow was not executed. Requires either Playwright (not in the repo) or manual click-through.
3. **Web build cannot complete on this host Node version.** Requires either nvm-switch or CI on Node 22.

## Recommendations

- **Before Phase 2:** add `apps/web/src/__tests__/email-otp-login.test.tsx` mirroring the pattern in `auth-login-channel.test.tsx`, and `apps/web/src/__tests__/account-linking.test.tsx` covering link + unlink + last-auth-method rejection.
- Run the Web build in CI on the pinned Node 22 to close the environmental gap.
- No blocking defect in S1.38 Web code was found.

## Web Verdict

**CONDITIONAL PASS.**

- Static analysis: PASS.
- Contract parity with API + Flutter: PASS.
- Nullable-identity type propagation: PASS.
- Existing test suite: PASS (26/26).
- New UI-level tests for the email-OTP path: NOT ADDED.
- Production build on this host: NOT VERIFIED (environmental).
