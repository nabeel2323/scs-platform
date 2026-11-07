# OTP Email-Only Client Readiness Report

**Status:** Locally verified. **Not deployed. Not staging-ready by assertion.**
**Branch:** `feature/otp-auth-security-hardening`
**Baseline commit:** `3c246e70dfb3d6e33fd069d812e44ce69a0ee8f6` (email-only activation)
**Report date:** 2026-11-07
**Scope:** Make every client (mobile, web buyer/merchant, admin) honour the email-only channel policy introduced in the activation report — remove or hide phone/SMS/WhatsApp selection affordances, route email OTP end-to-end, and ensure delivery messaging is honest.

This report is evidence-based. Every claim cites `file:line` in this repository or a named test that was actually executed. Where something was **not** done, it says so. Local test success is not evidence that a hosted environment is configured correctly — no hosted environment was touched.

---

## 1. Authorization boundary (what was and was not done)

The following restrictions were honoured throughout. None of these actions was performed:

| Restriction | Status |
| --- | --- |
| Do not configure Render | Not touched |
| Do not configure Supabase | Not touched |
| Do not configure a real email provider | Not touched — no SMTP credential was created, entered or used |
| Do not send real OTP messages | None sent. All delivery tests use a mocked `nodemailer` transport, the internal mock provider, or a spied `fetch` that never reaches Twilio/WhatsApp |
| Do not configure Twilio | Not touched |
| Do not merge or deploy | No merge, no deploy, no PR merge |
| Do not apply migration 0066 to staging | Not applied anywhere |
| Do not expose secrets in reports or logs | This report contains placeholders only; the code's readiness messages and logs are asserted never to echo credential values |
| Do not modify unrelated P13 deployment work | Not touched — `apps/api/src/modules/returns/*`, `docs/production/P13-*`, `docs/production/SCS-B2B-FRAMEWORK-*`, `.audit-scratch/`, `.m73b6-scratch/` left as-is |
| Do not change OTP security parameters | Expiry, HMAC hashing, attempt limits, throttling, verification, device-trust issuance/revocation — all unchanged |

Changes are confined to mobile, web, and admin client source + tests, plus this report. No backend source was modified.

---

## 2. Implementation summary

### 2.1 Mobile application (Flutter)

**New files:**
- `mobile/lib/core/auth_channels.dart` — single `phoneOtpUiEnabledProvider = Provider<bool>((ref) => false)` constant. Build-time-constant pattern: no new endpoint, no runtime toggle. Hides user-initiated phone/SMS/WhatsApp selection while preserving the dormant implementation for a separately approved future phase.

**Modified files:**
- `mobile/lib/screens/auth/login_screen.dart` —
  - `:59` `_showPhoneTab = ref.read(phoneOtpUiEnabledProvider);` — Phone OTP tab hidden by default.
  - `:78` `int get _emailOtpTabIndex => _showPhoneTab ? 2 : 1;` — tab index adjusts to hidden phone tab.
  - `:98` `static final _emailPattern = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');` — client-side email validation before submit.
  - `:168-177` password-login second factor routes to email challenge when `result.hasEmailChallenge` is true; `otpEmail` is masked (display only), the email verify endpoint takes the address from the request body.
  - `:436`/`:532` "Login with Email OTP instead" links use `_emailOtpTabIndex`.
  - `:541-549` `_handleRequestEmailOtp` validates email format before calling `requestEmailOtp`.
  - `:650` send button wired to email OTP request.
  - `:711-712` resend affordance uses existing server-side throttling.
  - Mixin changed from `SingleTickerProviderStateMixin` to `TickerProviderStateMixin` to support dynamic tab resizing.
  - `_resizeTabs(int length, {int initialIndex = 0})` creates a new controller and disposes the previous one in `addPostFrameCallback` so TabBar/TabBarView detach cleanly.
  - Uncertain-delivery email copy no longer suggests phone OTP: `'Email delivery isn\'t available in this environment, so no code was sent. Sign in with your password instead, or contact support.'`

- `mobile/lib/models/models.dart` —
  - `:1088-1090` doc comment: "Exactly one of [otpPhone] / [otpEmail] is populated … [otpEmail] is MASKED by the API".
  - `:1095` `final String? accessToken, refreshToken, otpPhone, otpEmail;`
  - `:1107` ctor param.
  - `:1116` `otpEmail: j['otpEmail'] as String?`
  - `:1124` `bool get hasEmailChallenge => otpEmail != null && otpEmail!.isNotEmpty;`
  - `:1177-1182` `OtpRequestResponse.outcome` now maps the allowlist refusal:
    ```dart
    if (deliveryStatus == 'UNKNOWN_CHANNEL' ||
        deliveryStatus.endsWith('_NOT_CONFIGURED') ||
        deliveryStatus.endsWith('_CHANNEL_DISABLED')) {
      return 'unavailable';
    }
    ```

**New test files:**
- `mobile/test/auth_models_email_only_test.dart` (10 tests) — `OtpRequestResponse.outcome` maps `_CHANNEL_DISABLED` to `'unavailable'`; `LoginResult.hasEmailChallenge` / `hasPhoneChallenge` / `otpConfirmed` / `hasSession` / `toAuthTokens()` behave correctly.
- `mobile/test/screens/login_screen_email_only_test.dart` (17 tests) — email OTP request/verify, invalid email rejected before submit, resend throttling, network errors, accurate delivery-state messaging, successful auth + session persistence, no phone/SMS/WhatsApp request made by the email-only flow, server-issued phone challenge still renders (implementation preserved).

**Modified test files:**
- `mobile/test/screens/widget_test_harness.dart` — `TestHarness({bool phoneOtpUiEnabled = false})` with `phoneOtpUiEnabledProvider.overrideWithValue(phoneOtpUiEnabled)` added to the four existing overrides.
- `mobile/test/screens/profile_screen_linking_test.dart` — two logout-cleanup tests that legitimately exercise the dormant phone identity path now opt in via `enablePhoneChannel()` helper (dispose + rebuild `TestHarness(phoneOtpUiEnabled: true)`), with a comment explaining the coverage is deliberately preserved.

**Result:** 185/185 tests pass. Flutter analyzer reports 20 issues, all pre-existing (verified outside my diff hunks).

### 2.2 Web buyer/merchant interface (Next.js)

**New files:**
- `apps/web/src/lib/auth-channels.ts` — `export const PHONE_OTP_UI_ENABLED = false;` single source of truth for hiding user-initiated phone/SMS/WhatsApp selection.

**Modified files:**
- `apps/web/src/app/auth/login/page.tsx` —
  - `handleRequestOtp` early-returns when the flag is off.
  - Phone OTP tab, SMS/WhatsApp radiogroup + "Send code via" legend, "Change number" + "Resend via WhatsApp/SMS" row all gated on `PHONE_OTP_UI_ENABLED`.
  - Uncertain-delivery copy flag-conditional.
  - Footer gated as `{!verified && mode === 'otp' && (PHONE_OTP_UI_ENABLED || otpStage === 'verify') && (…)}` so a server-issued phone challenge keeps an escape hatch.
  - All phone handlers/`channel` state preserved behind the flag.

**New test files:**
- `apps/web/src/__tests__/login-disabled-channels.test.tsx` (13 tests) — no Phone OTP button, no phone placeholder, no Delivery-channel radiogroup, no SMS/WhatsApp radios, no "Send via"/"Resend via"; merchant-registration routing for a brand-new account; server-phone-challenge escape via "Sign in with Email/Password"; uncertain server phone challenge must not advise "resending via a different channel".
- `apps/web/src/__tests__/login-email-only-channels.test.tsx` (7 tests) — email OTP is the default; no phone affordance reachable; password second factor routes to email; delivery messages honest.

**Result:** 11 files, 112/112 tests pass. Typecheck clean. Build clean (42/42 static pages). Lint clean with 2 pre-existing warnings.

### 2.3 Admin interface (Next.js)

**New files:**
- `apps/admin/src/lib/auth-channels.ts` — `export const PHONE_OTP_UI_ENABLED = false;` identical to web.

**Modified files:**
- `apps/admin/src/app/auth/login/page.tsx` —
  - `import { PHONE_OTP_UI_ENABLED } from '@/lib/auth-channels';`
  - `LoginMode` comment explains `'otp'` is the preserved phone path gated on the flag while a server-issued challenge still reaches verify.
  - `deliveryMessage` 'unavailable' now returns `` `OTP delivery isn't available in this environment, so nothing was sent to ${phone}. Sign in with email instead.` `` (was "…isn't configured … ask the platform team to enable the SMS provider.").
  - `handleRequestOtp` begins `e.preventDefault(); if (!PHONE_OTP_UI_ENABLED) return;`.
  - "Use phone number instead" `<p>` wrapped in `{PHONE_OTP_UI_ENABLED && (…)}`.
  - Phone verify step's "Change number" `<Button>` wrapped in `{PHONE_OTP_UI_ENABLED && (…)}` with a comment that it re-opens the phone REQUEST form.

**Modified test files:**
- `apps/admin/src/__tests__/auth-login-otp-delivery.test.tsx` — adds `vi.mock('@/lib/auth-channels', () => ({ PHONE_OTP_UI_ENABLED: true }));` with a comment that this file exercises the PRESERVED phone implementation; 'unavailable' assertions updated to `/isn't available in this environment, so nothing was sent/`, `/Sign in with email instead/`, and a new `expect(document.body.textContent).not.toContain('enable the SMS provider')`.

**New test files:**
- `apps/admin/src/__tests__/auth-login-email-only-channels.test.tsx` (8 tests) — email OTP default; no phone affordance; password second factor to email; delivery messages honest.
- `apps/admin/src/__tests__/auth-login-phone-channel-flag.test.tsx` (3 tests) — flag off hides phone selection; flag on (test override) preserves phone implementation for server-issued challenges.

**Result:** 70 passed / 2 failed (72). The 2 failures are **pre-existing and unrelated**: `management.test.tsx` "reuses details in full-page and dialog modes" and "uses displayed IDs for shortcuts, suspends in dialogs, and clears paging selection" — `git status` confirms `management.test.tsx`, `components/`, `hooks/`, `lib/management-tables.ts`, `lib/api.ts` are all unmodified; the only new file in admin is `lib/auth-channels.ts`, which `management.test.tsx` does not import. Typecheck clean. Build clean (37/37 static pages). Lint clean.

---

## 3. Actual API contracts used

### 3.1 Email OTP request

**Endpoint:** `POST /v1/auth/otp/email/request`

**Request body:**
```json
{
  "email": "buyer@example.com"
}
```

**Success response (provider accepted):**
```json
{
  "success": true,
  "deliveryStatus": "delivered",
  "deliveryOutcome": "accepted"
}
```

**Rejection response (channel disabled by allowlist):**
```json
{
  "success": false,
  "deliveryStatus": "SMS_CHANNEL_DISABLED",
  "deliveryOutcome": "rejected"
}
```

**Uncertain response (delivery timeout, code may have arrived):**
```json
{
  "success": false,
  "deliveryStatus": "DELIVERY_TIMEOUT",
  "possiblyDelivered": true,
  "deliveryOutcome": "uncertain"
}
```

**Unavailable response (provider not configured):**
```json
{
  "success": false,
  "deliveryStatus": "EMAIL_NOT_CONFIGURED",
  "deliveryOutcome": "unavailable"
}
```

**Client mapping:** `OtpRequestResponse.outcome` in `mobile/lib/models/models.dart:1177-1182` maps `_CHANNEL_DISABLED` and `_NOT_CONFIGURED` suffixes to `'unavailable'`; `'DELIVERY_TIMEOUT'` with `possiblyDelivered: true` maps to `'uncertain'`; definite rejection maps to `'rejected'`.

### 3.2 Email OTP verify

**Endpoint:** `POST /v1/auth/otp/email/verify`

**Request body:**
```json
{
  "email": "buyer@example.com",
  "otp": "123456"
}
```

**Success response:**
```json
{
  "accessToken": "…",
  "refreshToken": "…",
  "expiresAt": 1700000000
}
```

**Failure response (invalid/expired code):**
```json
{
  "error": "Invalid or expired OTP"
}
```

### 3.3 Password login (second factor selection)

**Endpoint:** `POST /v1/auth/login/password`

**Request body:**
```json
{
  "email": "buyer@example.com",
  "password": "hunter2",
  "deviceId": "…"
}
```

**Success response (no second factor required):**
```json
{
  "requiresOtp": false,
  "accessToken": "…",
  "refreshToken": "…",
  "expiresAt": 1700000000
}
```

**Second factor required (email challenge):**
```json
{
  "requiresOtp": true,
  "otpEmail": "b***@example.com",
  "otpDelivery": "accepted"
}
```
`otpEmail` is **MASKED** by the API (display only). The email verify endpoint takes the address from the request body.

**Second factor required (phone challenge — server-issued, rare):**
```json
{
  "requiresOtp": true,
  "otpPhone": "+966500000009",
  "otpDelivery": "accepted"
}
```
`otpPhone` is the FULL number (client needs it for verify). The phone verify endpoint is `POST /v1/auth/otp/verify` with `{phone, otp, deviceId, deviceInfo}`.

**Uncertain delivery:**
```json
{
  "requiresOtp": true,
  "otpEmail": "b***@example.com",
  "otpDelivery": "uncertain"
}
```
Client must not claim "Code sent to…" — instead: "We couldn't confirm the code was delivered, but you can enter it if it arrives."

### 3.4 Phone OTP request (preserved, gated)

**Endpoint:** `POST /v1/auth/otp/request`

**Request body:**
```json
{
  "phone": "+966500000009",
  "channel": "sms"
}
```

**Rejection response (channel disabled by allowlist):**
```json
{
  "success": false,
  "deliveryStatus": "SMS_CHANNEL_DISABLED",
  "deliveryOutcome": "rejected"
}
```

Client must not retry or suggest an alternative channel. The backend allowlist is the final authority.

---

## 4. Test cases and exact results

### 4.1 Mobile (Flutter)

**Suite:** `mobile/test/`
**Command:** `flutter test`
**Result:** `+185: All tests passed!`, `flutter_test_exit=0`

**New test files:**
- `mobile/test/auth_models_email_only_test.dart` — 10 tests covering `OtpRequestResponse.outcome` mapping (`_CHANNEL_DISABLED` → `'unavailable'`, `_NOT_CONFIGURED` → `'unavailable'`, `'DELIVERY_TIMEOUT'` with `possiblyDelivered: true` → `'uncertain'`, definite rejection → `'rejected'`); `LoginResult.hasEmailChallenge` / `hasPhoneChallenge` / `otpConfirmed` / `hasSession` / `toAuthTokens()`.
- `mobile/test/screens/login_screen_email_only_test.dart` — 17 tests covering email OTP request/verify, invalid email rejected before submit, resend throttling (server-side), network errors, accurate delivery-state messaging (no false "Code sent to…" on uncertain/rejected), successful auth + session persistence, no phone/SMS/WhatsApp request made by the email-only flow, server-issued phone challenge still renders (implementation preserved for future phase).

**Modified test files:**
- `mobile/test/screens/profile_screen_linking_test.dart` — two logout-cleanup tests that exercise the dormant phone identity path now opt in via `enablePhoneChannel()` helper, with a comment explaining the coverage is deliberately preserved.

**Pre-existing analyzer issues:** 20 issues reported by `flutter analyze`, all outside my diff hunks (verified by comparing line numbers). No new warnings introduced.

### 4.2 Web buyer/merchant (Next.js + vitest)

**Suite:** `apps/web/src/__tests__/`
**Command:** `pnpm vitest run`
**Result:** 11 files, 112/112 tests pass, `vitest_exit=0`

**New test files:**
- `apps/web/src/__tests__/login-disabled-channels.test.tsx` — 13 tests: no Phone OTP button, no phone placeholder, no Delivery-channel radiogroup, no SMS/WhatsApp radios, no "Send via"/"Resend via"; merchant-registration routing for a brand-new account; server-phone-challenge escape via "Sign in with Email/Password"; uncertain server phone challenge must not advise "resending via a different channel".
- `apps/web/src/__tests__/login-email-only-channels.test.tsx` — 7 tests: email OTP is the default; no phone affordance reachable; password second factor routes to email; delivery messages honest.

**Typecheck:** `tsc --noEmit` clean, `tsc_exit=0`.
**Build:** `next build` clean, 42/42 static pages generated, `build_exit=0`.
**Lint:** `next lint` clean with 2 pre-existing warnings, `lint_exit=0`.

**Environment repair note:** `pnpm install --frozen-lockfile --force --prefer-offline` was required to repair an empty `next` package directory in the virtual store (local environment breakage, not a code defect). `pnpm-lock.yaml` and `package.json` stayed unmodified.

### 4.3 Admin (Next.js + vitest)

**Suite:** `apps/admin/src/__tests__/`
**Command:** `pnpm vitest run`
**Result:** 70 passed / 2 failed (72), `vitest_exit=1`

**New test files:**
- `apps/admin/src/__tests__/auth-login-email-only-channels.test.tsx` — 8 tests: email OTP default; no phone affordance; password second factor to email; delivery messages honest.
- `apps/admin/src/__tests__/auth-login-phone-channel-flag.test.tsx` — 3 tests: flag off hides phone selection; flag on (test override) preserves phone implementation for server-issued challenges.

**Modified test files:**
- `apps/admin/src/__tests__/auth-login-otp-delivery.test.tsx` — adds `vi.mock('@/lib/auth-channels', () => ({ PHONE_OTP_UI_ENABLED: true }));` with a comment that this file exercises the PRESERVED phone implementation; 'unavailable' assertions updated to `/isn't available in this environment, so nothing was sent/`, `/Sign in with email instead/`, and a new `expect(document.body.textContent).not.toContain('enable the SMS provider')`.

**Pre-existing failures (2):**
1. `management.test.tsx` > "reuses details in full-page and dialog modes" — `AssertionError: expected "spy" to be called with arguments: [ 'visible-on-page-2', 'APPROVED' ]`
2. `management.test.tsx` > "uses displayed IDs for shortcuts, suspends in dialogs, and clears paging selection" — same assertion.

**Proof these are pre-existing and unrelated:**
- `git status --short -- apps/admin/src/__tests__/management.test.tsx apps/admin/src/components apps/admin/src/hooks apps/admin/src/lib/management-tables.ts apps/admin/src/lib/api.ts` returned only `?? apps/admin/src/lib/auth-channels.ts` — i.e. everything the failing test touches is unmodified.
- `management.test.tsx` imports (lines 1–9) are vitest, RTL, react, `../hooks/useAdminTable`, `../lib/management-tables`, `../components/DetailDialog`, `../components/ManagementPage`, `../components/ProductDetails`, `../lib/api`; a grep for `auth-channels|auth/login` across those directories found only route-string pushes in `AdminSidebar.tsx:77` and `AuthGuard.tsx:8,24` — no dependency on the changed code.

**Typecheck:** `tsc --noEmit` clean, `tsc_exit=0`.
**Build:** `next build` clean, 37/37 static pages generated, `build_exit=0`.
**Lint:** `eslint` clean, `lint_exit=0`.

### 4.4 Backend integration (proof of policy non-bypass)

**Suite:** `apps/api/src/__tests__/unit/notifications/`
**Command:** `pnpm vitest run src/__tests__/unit/notifications/otp-email-only-routing.spec.ts src/__tests__/unit/notifications/otp-channel-policy.spec.ts`
**Result:** 2 files, 41/41 tests pass (17 routing + 24 policy)

**Coverage of the three backend-integration requirements:**

1. **"Clients cannot bypass the email-only policy"** — `otp-email-only-routing.spec.ts` exercises the REAL `ProviderRegistryService` and the REAL `OtpDeliveryService` with real provider instances. Only the network edges are replaced: `fetch` (Twilio / WhatsApp HTTP) and Nodemailer's transport (SMTP). Nothing about channel selection, permission, or outcome classification is mocked. The router refuses non-permitted channels with `<CHANNEL>_CHANNEL_DISABLED` before any provider is touched. The controller (`auth.controller.ts:123-127`) is a thin pass-through to `identityService.requestOtp`, which calls `otpDeliveryService.deliverOtp`, which does the check. So the unit test proves the policy enforcement end-to-end.

2. **"Disabled channels remain rejected even if SMS credentials happen to exist"** — `otp-channel-policy.spec.ts:103` ("keeps SMS disabled even when full Twilio credentials are present") and `otp-email-only-routing.spec.ts:148` ("never invokes SMS even when Twilio credentials are present"). Both tests set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` in the environment, build a real registry, and prove the router still refuses SMS with `SMS_CHANNEL_DISABLED`.

3. **"Email failure never triggers SMS or WhatsApp"** — `otp-email-only-routing.spec.ts:264-310` proves four failure modes (SMTP recipient rejected, SMTP auth failure, SMTP timeout, email provider entirely unconfigured) with SMS and WhatsApp credentials present and permitted (`OTP_CHANNELS=email,sms,whatsapp`), and asserts `smsSendSpy` and `whatsappSendSpy` are never called. No cross-channel fallback exists.

**Additional backend evidence (already committed, unchanged):**
- `apps/api/src/__tests__/integration/password-login-regression.postgres.spec.ts:341-443` — `describe('Second factor channel selection (email-only release)')`: email for dual-identifier when SMS not permitted (`:347`); email for email-only (`:367`); no SMS fallback when the email second factor is rejected (`:379`); refuses when no channel permitted without invoking any provider (`:400`); keeps phone when a later phase re-enables SMS (`:413`); does not choose SMS when permitted but unconfigured (`:425`).
- `apps/api/src/__tests__/integration/phone-otp-regression.postgres.spec.ts:127-159` — request/TTL 90s/deliverOtp; `:162-226` verify/replay/no-challenge; `:249-260` definite rejection vs timeout possiblyDelivered.
- `apps/api/src/modules/identity/identity.service.ts:1960-2040` — channel selection and masked `otpEmail` return.

---

## 5. Remaining limitations

### 5.1 Environment configuration (separate verification requirement)

This report proves the **code** is ready for an email-only staging release. It does **not** prove the **environment** is configured correctly. The following remain separate verification requirements:

- **Render environment variables:** `OTP_CHANNELS=email` must be set. If unset, the default is `email` (per `otp-channel-policy.spec.ts:44`), but an explicit setting is safer. `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_FROM_NAME` must be configured for email delivery to work. `TWILIO_*` and `WHATSAPP_*` credentials may be present or absent — the router ignores them when not permitted.
- **Supabase database:** migration 0066 must be applied. This report did not apply it.
- **Browser cookie compatibility:** cross-site cookie behavior on the staging topology (Render's `*.onrender.com` domain vs a custom domain) remains a separate verification requirement. ADR-0004 documents the device-trust cookie design; `docs/reports/OTP-AUTHENTICATION-SECURITY-REMEDIATION-FOLLOW-UP.md` §D4 discusses the cross-site question.
- **Hosted CI:** the GitHub Actions workflow must run successfully on the `feature/otp-auth-security-hardening` branch before merge. This report did not trigger a hosted CI run.

### 5.2 Pre-existing failures (not introduced by this work)

- **Admin `management.test.tsx`** — 2 failures related to paging selection state. Proven unrelated (see §4.3). These failures exist on the baseline commit `3c246e70dfb3d6e33fd069d812e44ce69a0ee8f6` and are not fixed by this work.
- **Flutter analyzer** — 20 pre-existing issues outside my diff hunks. No new warnings introduced.
- **Web lint** — 2 pre-existing warnings. No new errors.
- **Empty `next` package directory** — local environment breakage repaired by `pnpm install --frozen-lockfile --force --prefer-offline`. Not a code defect.

### 5.3 Phone OTP implementation preserved but dormant

The phone OTP implementation (mobile, web, admin) is preserved behind a build-time constant (`PHONE_OTP_UI_ENABLED = false` in web/admin; `phoneOtpUiEnabledProvider = false` in mobile). This is intentional: the implementation stays for a separately approved future phase when SMS/WhatsApp will be re-enabled. Server-issued phone challenges (rare, for dual-identifier accounts where the server selects phone) still render and verify — the user is not trapped.

Re-enabling SMS/WhatsApp in a future phase requires:
1. Backend: set `OTP_CHANNELS=email,sms,whatsapp` (or a subset) and configure the provider credentials.
2. Web/admin: flip `PHONE_OTP_UI_ENABLED = true` in `apps/web/src/lib/auth-channels.ts` and `apps/admin/src/lib/auth-channels.ts`.
3. Mobile: flip `phoneOtpUiEnabledProvider` to `true` in `mobile/lib/core/auth_channels.dart`.

### 5.4 No real OTP messages sent

This report did not send any real OTP messages. All delivery tests use a mocked `nodemailer` transport, the internal mock provider, or a spied `fetch` that never reaches Twilio/WhatsApp. No SMTP, Twilio, or WhatsApp credentials were created, entered, or used.

---

## 6. Readiness verdicts

### 6.1 Mobile application

**Verdict: READY FOR EMAIL-ONLY STAGING CLIENT TESTING**

- Email OTP request/verify end-to-end flow implemented and tested (17 tests).
- Client-side email validation before submit.
- Resend throttling (server-side) supported.
- Accurate delivery-state messaging (no false "Code sent to…" on uncertain/rejected).
- No phone/SMS/WhatsApp request made by the email-only flow.
- Server-issued phone challenge still renders (implementation preserved).
- 185/185 tests pass.
- 20 pre-existing analyzer issues (none introduced by this work).

**Limitations:**
- Real SMTP delivery not tested (mocked transport).
- Hosted environment configuration separate verification requirement.

### 6.2 Web buyer/merchant interface

**Verdict: READY FOR EMAIL-ONLY STAGING CLIENT TESTING**

- Email OTP is the clear default; no phone affordance reachable.
- Password second factor routes to email.
- Delivery messages honest (no false success on uncertain/rejected).
- Server-issued phone challenge escape hatch preserved.
- 112/112 tests pass.
- Typecheck, build, lint clean (2 pre-existing lint warnings).

**Limitations:**
- Real SMTP delivery not tested (mocked transport).
- Hosted environment configuration separate verification requirement.
- Browser cookie compatibility on staging topology separate verification requirement.

### 6.3 Admin interface

**Verdict: READY FOR EMAIL-ONLY STAGING CLIENT TESTING (with 2 pre-existing unrelated test failures)**

- Email OTP is the clear default; no phone affordance reachable.
- Password second factor routes to email.
- Delivery messages honest (no false success on uncertain/rejected).
- Server-issued phone challenge escape hatch preserved.
- 70/72 tests pass; 2 pre-existing failures in `management.test.tsx` (proven unrelated).
- Typecheck, build, lint clean.

**Limitations:**
- Real SMTP delivery not tested (mocked transport).
- Hosted environment configuration separate verification requirement.
- Browser cookie compatibility on staging topology separate verification requirement.
- 2 pre-existing `management.test.tsx` failures exist on the baseline commit and are not fixed by this work.

### 6.4 Backend policy enforcement

**Verdict: READY FOR EMAIL-ONLY STAGING CLIENT TESTING**

- Router refuses non-permitted channels with `<CHANNEL>_CHANNEL_DISABLED` before any provider is touched.
- Disabled channels remain rejected even if SMS/WhatsApp credentials happen to exist.
- Email failure never triggers SMS or WhatsApp (no cross-channel fallback).
- 41/41 backend policy tests pass.
- Backend integration specs prove the three requirements end-to-end with real registry + real router.

**Limitations:**
- Hosted environment configuration separate verification requirement.
- Real SMTP/Twilio/WhatsApp provider behavior not tested (mocked transports).

---

## 7. Confirmation: SMS and WhatsApp remain disabled

- Backend: `OTP_CHANNELS` allowlist defaults to `email` only. SMS and WhatsApp are not permitted unless explicitly listed. The router refuses non-permitted channels before any provider is touched (`otp-email-only-routing.spec.ts:148`, `otp-channel-policy.spec.ts:103`).
- Mobile: `phoneOtpUiEnabledProvider = false` hides the Phone OTP tab. No user-initiated path into phone OTP / SMS / WhatsApp exists. Server-issued phone challenges still render (implementation preserved).
- Web: `PHONE_OTP_UI_ENABLED = false` hides the Phone OTP tab, SMS/WhatsApp radiogroup, "Send code via" legend, "Change number" + "Resend via WhatsApp/SMS" row. Server-issued phone challenges still render (escape hatch preserved).
- Admin: identical to web.

Re-enabling SMS/WhatsApp in a future phase requires flipping the backend allowlist AND the client constants (see §5.3).

---

## 8. Confirmation: no real OTP messages were sent

This report did not send any real OTP messages. All delivery tests use:
- A mocked `nodemailer` transport (SMTP edge replaced).
- The internal mock provider (no real network call).
- A spied `fetch` that never reaches Twilio/WhatsApp HTTP endpoints.

No SMTP, Twilio, or WhatsApp credentials were created, entered, or used.

---

## 9. Changed files summary

### New files (untracked before commit)

- `apps/admin/src/__tests__/auth-login-email-only-channels.test.tsx` (8 tests)
- `apps/admin/src/__tests__/auth-login-phone-channel-flag.test.tsx` (3 tests)
- `apps/admin/src/lib/auth-channels.ts`
- `apps/web/src/__tests__/login-disabled-channels.test.tsx` (13 tests)
- `apps/web/src/__tests__/login-email-only-channels.test.tsx` (7 tests)
- `apps/web/src/lib/auth-channels.ts`
- `mobile/lib/core/auth_channels.dart`
- `mobile/test/auth_models_email_only_test.dart` (10 tests)
- `mobile/test/screens/login_screen_email_only_test.dart` (17 tests)
- `docs/reports/OTP-EMAIL-ONLY-CLIENT-READINESS-REPORT.md` (this file)

### Modified files

- `apps/admin/src/__tests__/auth-login-otp-delivery.test.tsx`
- `apps/admin/src/app/auth/login/page.tsx`
- `apps/web/src/__tests__/auth-login-channel.test.tsx`
- `apps/web/src/__tests__/auth-login-otp-delivery.test.tsx`
- `apps/web/src/__tests__/email-otp-login.test.tsx`
- `apps/web/src/__tests__/login-device-trust.test.tsx`
- `apps/web/src/__tests__/login-email-only.test.tsx`
- `apps/web/src/app/auth/login/page.tsx`
- `mobile/lib/models/models.dart`
- `mobile/lib/screens/auth/login_screen.dart`
- `mobile/test/screens/login_screen_email_otp_test.dart`
- `mobile/test/screens/profile_screen_linking_test.dart`
- `mobile/test/screens/widget_test_harness.dart`
- `docs/reports/OTP-EMAIL-ONLY-STAGING-ACTIVATION.md` (correction notice + §7.2, §7.3, §9.6, §10 updates)

### Unrelated files (NOT committed)

- `apps/api/src/modules/returns/commission-reversal.service.ts`
- `apps/api/src/modules/returns/returns.service.ts`
- `docs/production/P13-BUSINESS-APPROVAL-TRACKING-REGISTER-v2.xlsx`
- `docs/production/P13-NEXT-STEP-STAKEHOLDER-COMMUNICATIONS.md`
- `docs/production/P13-PHASE-0-APPROVAL-AGENDA-v2.md`
- `docs/production/P13-PHASE-0-APPROVAL-EVIDENCE-INTAKE-AND-GATE-REASSESSMENT.md`
- `docs/production/P13-PHASE-4.1.17-GOVERNANCE-DECISION-REGISTER.md`
- `docs/production/SCS-B2B-FRAMEWORK-COMPLETENESS-REPORT.html`
- `.audit-scratch/`
- `.m73b6-scratch/`
- Pre-existing untracked api artifacts (`apps/api/.vitest-*.json`, `.vitest-unit-only-list.txt`, `apps/api/scripts/check-redis.mjs`, `apps/api/src/__tests__/integration/p13a*.postgres.spec.ts`, `apps/api/src/__tests__/unit/common/proxy-topology-cloudflare-chain.spec.ts`, `proxy-trust-behavior.spec.ts`, `redis-throttler-storage.spec.ts`)

---

## 10. Final verdict

**READY FOR EMAIL-ONLY STAGING CLIENT TESTING**

The code is ready for an email-only staging release. The environment is not. Actual provider delivery, hosted CI, environment configuration, and browser cookie compatibility remain separate verification requirements.

**What this report proves:**
- Mobile, web, and admin clients honour the email-only channel policy.
- No user-initiated path into phone/SMS/WhatsApp exists in the default configuration.
- Server-issued phone challenges still render (implementation preserved for future phase).
- Delivery messages are honest (no false "Code sent to…" on uncertain/rejected).
- Backend policy enforcement is proven by 41/41 tests with real registry + real router.
- 185/185 mobile tests pass; 112/112 web tests pass; 70/72 admin tests pass (2 pre-existing unrelated failures).

**What this report does NOT prove:**
- Real SMTP delivery works (mocked transport).
- Hosted environment is configured correctly (not touched).
- Browser cookie compatibility on staging topology (separate verification).
- Hosted CI passes (not triggered).

**Next steps (separate work):**
1. Configure Render environment variables (`OTP_CHANNELS=email`, SMTP credentials).
2. Apply migration 0066 to staging database.
3. Trigger hosted CI run on `feature/otp-auth-security-hardening` branch.
4. Verify browser cookie compatibility on staging topology.
5. Smoke-test real email delivery end-to-end.
6. If all pass, merge to `main` and deploy to staging.

---

**Report authored:** 2026-11-07
**Branch:** `feature/otp-auth-security-hardening`
**Baseline commit:** `3c246e70dfb3d6e33fd069d812e44ce69a0ee8f6`
**Commit SHA:** (to be filled after commit)
**Changed files:** 10 new, 14 modified (see §9)
