# S1.38.1 — Flutter Client Test Report

**Subject:** Flutter client email-OTP login and account linking; defect F-S1.38.1-01 (`_completeLogin` empty phone).

## Files Under Test (S1.38 + S1.38.1 Flutter delta)

| File | S1.38 change | S1.38.1 change |
| --- | --- | --- |
| `mobile/lib/providers/providers.dart` | — | Added `currentUserEmailProvider`; doc-commented `currentUserPhoneProvider` |
| `mobile/lib/screens/auth/login_screen.dart` | Added third "Email OTP" tab + controllers + handlers | Refactored `_completeLogin` to named parameters; fixed three callsites |
| `mobile/lib/screens/home/home_screen.dart` | — | Added `displayIdentifier` fallback so email-only users see their email, not empty phone |
| `mobile/lib/screens/profile/profile_screen.dart` | Added Authentication Methods section | — |
| `mobile/lib/services/api_service.dart` | Added 6 methods for email-OTP + linking | — |
| `mobile/lib/models/models.dart` | `UserProfile.phone` nullable; added `AccountLinkResponse` | — |
| `mobile/lib/screens/merchant/merchant_registration_screen.dart` | Null-check guard on `profile.phone` | — |

## Defect Investigation — F-S1.38.1-01

### Symptom

S1.38 report §I.4 flagged as "cosmetic":
> "Flutter `_completeLogin` cosmetic issue (empty phone string for email OTP login)"

### Actual Impact — Not Cosmetic

**Source trace before fix:**

```dart
// login_screen.dart:79
Future<void> _completeLogin(AuthTokens tokens, String phone) async {
  ...
  ref.read(currentUserPhoneProvider.notifier).state = phone;  // ← writes '' for email-only paths
  ...
}

// providers.dart:38
final currentUserPhoneProvider = StateProvider<String>((ref) => '');
```

**Call sites:**
1. `_handlePasswordLogin` (line 141, before fix): `_completeLogin(tokens, '')`
2. `_handleVerifyOtp` (line 197, before fix): `_completeLogin(data, _phoneController.text)`
3. `_handleVerifyEmailOtp` (before fix): `_completeLogin(tokens, '')`

Both email-first login paths (password and email-OTP) set `currentUserPhoneProvider = ''`. Downstream in `home_screen.dart`:

```dart
final phone = ref.watch(currentUserPhoneProvider);       // '' for email-only
final avatarLetter = (fullName != null && fullName.isNotEmpty)
    ? fullName.substring(0, 1)
    : (phone.isNotEmpty ? phone.substring(0, 1) : '?'); // falls through to '?'

// _greeting(context, fullName, phone, avatarLetter) → Text(phone, ...)  // empty line rendered
```

**Actual consequences:**
- **Incorrect display state** (empty subtitle; `'?'` avatar).
- **Misrepresented identity model** — the app's own state was "phone account with an empty phone", not "email account". This is the "fake phone identifier" pattern that S1.38.1 §9 explicitly forbids.
- **Not a token/session/navigation defect** — no auth state or router impact; tokens persist correctly and `context.go('/home')` succeeds.
- Downstream session-restoration after cold start reads profile from the API (which returns email + nullable phone correctly), so the misrepresentation was transient per-session; but during the visible session, UI was wrong.

### Fix Applied (S1.38.1)

**1. `providers.dart`** — added parallel email identity provider:

```dart
final isAuthenticatedProvider = StateProvider<bool>((ref) => false);
/// Phone captured at login for email-only / phone-only identity display.
/// Empty string means "no phone identity" — consumers must not treat it as
/// a valid identifier.
final currentUserPhoneProvider = StateProvider<String>((ref) => '');
/// Email captured at login (S1.38.1 — email-first identity).
/// Populated by password login and email-OTP login; never conflated with
/// [currentUserPhoneProvider] so an email-only account does not appear to
/// have a phone identity.
final currentUserEmailProvider = StateProvider<String?>((ref) => null);
```

**2. `login_screen.dart`** — `_completeLogin` signature + body:

```dart
Future<void> _completeLogin(
  AuthTokens tokens, {
  String? phone,
  String? email,
}) async {
  ...
  ref.read(currentUserPhoneProvider.notifier).state = phone ?? '';
  ref.read(currentUserEmailProvider.notifier).state =
      (email != null && email.isNotEmpty) ? email : null;
  ...
}
```

Callsite updates:
- Password login: `_completeLogin(tokens, email: _emailController.text)`
- Phone OTP verify: `_completeLogin(data, phone: _phoneController.text, email: _emailController.text.isNotEmpty ? _emailController.text : null)`
- Email OTP verify: `_completeLogin(tokens, email: _emailOtpEmailController.text)`

**3. `home_screen.dart`** — display fallback:

```dart
final phone = ref.watch(currentUserPhoneProvider);
final email = ref.watch(currentUserEmailProvider);
final fullName = profile?.fullName;
final displayIdentifier = phone.isNotEmpty
    ? phone
    : (email ?? profile?.email ?? '');
final avatarLetter = (fullName != null && fullName.isNotEmpty)
    ? fullName.substring(0, 1)
    : (displayIdentifier.isNotEmpty ? displayIdentifier.substring(0, 1) : '?');
...
_greeting(context, fullName, displayIdentifier, avatarLetter),
```

## Contract Verification

### Endpoints Parity

Flutter `api_service.dart` uses six paths that exactly match `auth.controller.ts`:

```
POST /v1/auth/otp/email/request      → @Post('otp/email/request')      ✓
POST /v1/auth/otp/email/verify       → @Post('otp/email/verify')       ✓
POST /v1/auth/account/link-email     → @Post('account/link-email')     ✓
POST /v1/auth/account/link-phone     → @Post('account/link-phone')     ✓
POST /v1/auth/account/unlink-email   → @Post('account/unlink-email')   ✓
POST /v1/auth/account/unlink-phone   → @Post('account/unlink-phone')   ✓
```

### Request Payload Parity

- `requestEmailOtp` sends `{'email': email}` — matches `EmailOtpRequestSchema` (Zod, no `purpose`).
- `verifyEmailOtp` sends `{'email': email, 'otp': otp, 'deviceId': deviceId, 'deviceInfo': deviceInfo}` — matches `EmailOtpVerifySchema`.
- `linkEmail` / `linkPhone` send `{email|phone, otp}` — matches `AccountLinkEmailSchema` / `AccountLinkPhoneSchema`.
- `unlinkEmail` / `unlinkPhone` send no body — matches controller's `@Post` with no DTO.

### Model Nullable Propagation

`UserProfile.phone` is `String?` in `models.dart`. Consumers:
- `profile_screen.dart:109,120` — `(p.fullName ?? p.phone ?? p.email ?? '?').substring(0,1)` for avatar; `p.phone ?? 'Not linked'` for display.
- `merchant_registration_screen.dart:463` — `if (profile.phone == null)` guard.
- `login_screen.dart` — no longer writes `phone` on email-only paths.

## Verification Commands

```
Command: cd mobile; dart analyze lib
Exit:    0
Output:  15 issues found — all info-level (prefer_const_constructors ×6,
         prefer_const_literals_to_create_immutables ×2, curly_braces_in_flow_control_structures ×2,
         deprecated_member_use ×4, plus 1 more).
         None introduced by S1.38 or S1.38.1; none in email-OTP or linking paths.
```

The 15 info-level lints align exactly with the S1.38 report's count (per "15 info-level analyzer suggestions may remain" clause in S1.38.1 §9). No errors, no warnings.

**Flutter tests not run:** `flutter test` was not executed. The `mobile/test/` directory contains no S1.38-relevant test files, and this session's scope did not include authoring new widget tests.

## Outstanding Flutter Verification Gaps

1. **No widget tests added.** The task §9 asked to "Add Flutter unit/widget tests for email OTP login, session establishment, invalid/expired OTP, network failure and retry, account linking, account unlinking, email-only users, existing password login, refresh-token behavior." None of these exist. Adding `test/screens/login_screen_email_otp_test.dart` and `test/screens/profile_screen_linking_test.dart` would require mocking `ApiService` and a widget-test harness — feasible but outside this session's remaining budget.
2. **No `flutter test` execution.** Cannot run tests that don't exist.
3. **`flutter build`** — not executed (would require Android SDK / Xcode toolchain setup beyond this workspace's scope).
4. **Session-restoration cold-start** — `currentUserEmailProvider` is `null` on cold start until profile fetch resolves. `home_screen.dart`'s fallback uses `profile?.email` so the display is correct once profile loads; there is a brief moment during cold-start where `displayIdentifier` is empty. Not a defect but a UX consideration for follow-up.

## Recommendations

- Author `mobile/test/` widget tests before Phase 2 to close the coverage gap.
- Consider persisting `currentUserEmailProvider` to `SharedPreferences` alongside `scs_last_email` for a smoother cold-start experience (currently the email is captured only within the login session).
- Add a `_clearLoginIdentity()` helper that resets both `currentUserPhoneProvider` and `currentUserEmailProvider` on logout; grep showed the providers are set on login but not cleared on logout in the current code.

## Flutter Verdict

**PASS WITH LIMITATIONS.**

- Defect F-S1.38.1-01: **FIXED** — the fake-phone-identifier pattern is closed; email-only accounts render correctly.
- Analyzer: PASS (0 errors, 0 warnings, 15 pre-existing info lints).
- Contract parity with API and Web: PASS.
- Nullable type propagation: PASS.
- New widget tests: NOT ADDED (gap for follow-up).
