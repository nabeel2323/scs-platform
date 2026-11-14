# OTP-S1.38.2-FLUTTER-TEST-REPORT.md

**Task:** S1.38.2 §3 — Flutter Email-OTP and Account-Linking Widget Tests  
**Date:** 2026-11-01  

---

## Commands

```
cd mobile && flutter test test/screens/login_screen_email_otp_test.dart test/screens/profile_screen_linking_test.dart --reporter=compact
cd mobile && flutter test  (full suite)
cd mobile && dart analyze lib
```

## Execution Environment

| Component | Detail |
|---|---|
| OS | Windows 11 23H2 |
| Flutter | 3.47.1 |
| Dart | 3.13.1 |
| mocktail | ^1.0.3 |
| flutter_riverpod | 2.6.1 |
| go_router | ^14.2.0 |
| Duration (S1.38.2 tests) | ~29s |

## Exit Codes

| Command | Exit |
|---|---|
| `flutter test` (full suite) | **0** |
| `dart analyze lib` | **0** (15 pre-existing info-level lints) |
| `dart analyze test` | **0** (no issues) |

## Test Files

### 1. `mobile/test/screens/login_screen_email_otp_test.dart` — 15 tests

| # | Test | Result |
|---|---|---|
| 1 | email OTP tab is visible and selectable | ✓ pass |
| 2 | selecting email tab shows email address form | ✓ pass |
| 3 | requesting OTP with valid email transitions to verification | ✓ pass |
| 4 | successful OTP verification navigates to home | ✓ pass |
| 5 | invalid OTP displays error message | ✓ pass |
| 6 | expired OTP displays error message | ✓ pass |
| 7 | network failure displays actionable error | ✓ pass |
| 8 | rate-limit response shows retry-after information | ✓ pass |
| 9 | duplicate submission prevented during in-flight request | ✓ pass |
| 10 | existing password login still works | ✓ pass |
| 11 | existing phone OTP login still works | ✓ pass |
| 12 | a failed password login leaves no session behind | ✓ pass |
| 13-15 | session handling: signing in as second user replaces first session | ✓ pass |

### 2. `mobile/test/screens/profile_screen_linking_test.dart` — 18 tests

| # | Test | Result |
|---|---|---|
| 1 | displays current email identity | ✓ pass |
| 2 | displays current phone identity | ✓ pass |
| 3 | shows "Not linked" when identity absent | ✓ pass |
| 4 | linking email requests OTP and submits verification | ✓ pass |
| 5 | linking phone requests OTP and submits verification | ✓ pass |
| 6 | successful linking refreshes profile | ✓ pass |
| 7 | ownership conflict displayed correctly | ✓ pass |
| 8 | invalid OTP handled | ✓ pass |
| 9 | expired OTP handled | ✓ pass |
| 10 | unlinking email refreshes profile | ✓ pass |
| 11 | unlinking phone refreshes profile | ✓ pass |
| 12 | last-auth-method rejection displayed | ✓ pass |
| 13 | no automatic account merging on conflict | ✓ pass |
| 14 | cancelling confirmation dialog removes nothing | ✓ pass |
| 15-16 | logout identity cleanup: clears phone and email | ✓ pass |
| 17 | logout leaves no placeholder identifier | ✓ pass |
| 18 | next user on same device sees only their own identity | ✓ pass |

## Logout Identity Cleanup

### Implementation

`resetIdentityProviders(WidgetRef ref)` in `mobile/lib/providers/providers.dart`:

```dart
void resetIdentityProviders(WidgetRef ref) {
  ref.read(currentUserPhoneProvider.notifier).state = '';
  ref.read(currentUserEmailProvider.notifier).state = null;
}
```

### Wiring

Called from `ProfileScreen._signOut()` — the single logout path in the Flutter app:

```dart
Future<void> _signOut() async {
  ref.read(pushNotificationServiceProvider).shutdown();
  await ref.read(authStorageProvider).clearTokens();
  ref.read(apiClientProvider).clearAccessToken();
  ref.read(isAuthenticatedProvider.notifier).state = false;
  resetIdentityProviders(ref);
  if (mounted) context.go('/login');
}
```

### Test Coverage

5 tests prove that logging out cannot leave the previous user's identity visible:
- Signing out clears the previous user's phone identity
- Signing out clears the previous user's email identity
- Signing out leaves no placeholder identifier behind
- The next user on the same device sees only their own identity
- Session replacement: signing in as second user replaces first session

## Full Flutter Suite

| Metric | Value |
|---|---|
| Test files (all) | 10+ |
| Tests collected | 137 |
| Passed | 137 |
| Failed | 0 |
| Skipped | 0 |
| Exit code | 0 |

## Dart Analyze

| Scope | Exit | Issues |
|---|---|---|
| `lib` | 0 | 15 info-level (pre-existing, not S1.38.2) |
| `test` | 0 | 0 issues |

## Test Harness

Reusable test harness with mocked API dependencies:
- `MockApiService` — mocktail-based mock for all API calls
- `MockAuthStorage` — mock for token persistence
- `MockPushNotificationService` — mock for push notifications
- Provider overrides via `ProviderScope` for Riverpod state isolation
- `CompleterSlot<T>` pattern for async operation simulation (lazy initialization to bind to fake-async zone)
