import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_core/mobile_core.dart';
import 'package:mocktail/mocktail.dart';
import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/services/api_service.dart';
import 'package:scs_platform/services/push_notification_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ── Mocks ──────────────────────────────────────────────────────
//
// The established dependency boundary for the app's screens is the Riverpod
// provider graph: every screen reaches the backend through
// [apiServiceProvider] and the session through [authStorageProvider] /
// [apiClientProvider]. Overriding those four providers is enough to run the
// real widgets with no network, no secure storage and no Firebase.

class MockApiService extends Mock implements ApiService {}

class MockAuthStorage extends Mock implements AuthStorage {}

class MockApiClient extends Mock implements ApiClient {}

class MockPushNotificationService extends Mock
    implements PushNotificationService {}

/// A single account's server-side state, mutated by the link/unlink fakes so a
/// `profileProvider` invalidation genuinely returns refreshed data — which
/// proves the screen re-reads the profile instead of trusting a local guess.
class FakeAccount {
  FakeAccount({this.email, this.phone, this.fullName = 'Test Buyer'});
  String? email;
  String? phone;
  String fullName;

  UserProfile get profile => UserProfile(
        id: 'usr-1',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00.000Z',
        email: email,
        phone: phone,
        fullName: fullName,
        locale: 'ar',
        role: 'BUYER',
      );
}

/// Builds a DioException shaped like the API's RFC 7807 problem response, so
/// `ApiService.errorMessage` produces the copy a real failure would show.
DioException httpError(int status, {String? detail}) {
  final options = RequestOptions(path: '/v1/auth');
  return DioException(
    requestOptions: options,
    type: DioExceptionType.badResponse,
    response: Response<dynamic>(
      requestOptions: options,
      statusCode: status,
      data: detail == null ? null : <String, dynamic>{'detail': detail},
    ),
  );
}

/// A network-level failure (no HTTP response at all).
DioException networkError() => DioException(
      requestOptions: RequestOptions(path: '/v1/auth'),
      type: DioExceptionType.connectionError,
    );

/// A Future the test controls, for observing in-flight UI state.
class CompleterSlot {
  final Completer<Map<String, dynamic>> _completer =
      Completer<Map<String, dynamic>>();
  Future<Map<String, dynamic>> get future => _completer.future;
  bool get isCompleted => _completer.isCompleted;
  void complete() {
    if (!_completer.isCompleted) _completer.complete(<String, dynamic>{});
  }
}

/// Reusable widget-test harness: mocked providers plus a GoRouter whose
/// destinations are observable, so `context.go(...)` can be asserted.
class TestHarness {
  TestHarness() {
    api = MockApiService();
    storage = MockAuthStorage();
    client = MockApiClient();
    push = MockPushNotificationService();
    account = FakeAccount();

    _stubStorage();
    _stubPush();
    _stubApi();

    container = ProviderContainer(overrides: [
      apiServiceProvider.overrideWithValue(api),
      authStorageProvider.overrideWithValue(storage),
      apiClientProvider.overrideWithValue(client),
      pushNotificationServiceProvider.overrideWithValue(push),
    ]);
  }

  late final MockApiService api;
  late final MockAuthStorage storage;
  late final MockApiClient client;
  late final MockPushNotificationService push;
  late final FakeAccount account;
  late final ProviderContainer container;

  /// Router for the screen currently under test. Rebuilt per [pump] so each
  /// test starts at the screen it asked for instead of wherever the previous
  /// navigation left off.
  late GoRouter router;

  /// Route names the app has navigated to, in order.
  final List<String> navigated = [];

  Widget _screen = const SizedBox.shrink();

  // ── Provider reads (the same values Home watches) ───────────

  String? get currentEmail => container.read(currentUserEmailProvider);
  String get currentPhone => container.read(currentUserPhoneProvider);
  bool get isAuthenticated => container.read(isAuthenticatedProvider);

  // ── Stubbing ────────────────────────────────────────────────

  void _stubStorage() {
    // `_completeLogin` calls saveTokens with three named arguments; the
    // optional fourth still has to be declared as `any` for mocktail to match.
    when(() => storage.saveTokens(
          accessToken: any(named: 'accessToken'),
          refreshToken: any(named: 'refreshToken'),
          expiresAt: any(named: 'expiresAt'),
          activeOrgId: any(named: 'activeOrgId'),
        )).thenAnswer((_) async {});
    when(() => storage.clearTokens()).thenAnswer((_) async {});
    when(() => storage.getAccessToken()).thenAnswer((_) async => null);
    when(() => storage.getRefreshToken()).thenAnswer((_) async => null);
    when(() => storage.getActiveOrgId()).thenAnswer((_) async => null);
  }

  void _stubPush() {
    // Both return Future<void>; unstubbed they would hand back null and the
    // screens would swallow that into a red error banner instead of navigating.
    when(() => push.initialize()).thenAnswer((_) async {});
    when(() => push.shutdown()).thenAnswer((_) async {});
  }

  void _stubApi() {
    when(() => api.fetchProfile()).thenAnswer((_) async => account.profile);
    when(() => api.requestEmailOtp(any()))
        .thenAnswer((_) async => <String, dynamic>{'success': true});
    when(() => api.verifyEmailOtp(any(), any())).thenAnswer((_) async =>
        AuthTokens(accessToken: 'access-email', refreshToken: 'refresh-email'));
    when(() => api.requestOtp(any())).thenAnswer((_) async {});
    when(() => api.verifyOtp(any(), any())).thenAnswer((_) async =>
        AuthTokens(accessToken: 'access-phone', refreshToken: 'refresh-phone'));
    when(() => api.loginPassword(any(), any(), any(), any())).thenAnswer(
        (_) async => LoginPasswordResponse(
            accessToken: 'access-password', refreshToken: 'refresh-password'));
    when(() => api.checkDeviceLogin(any(), any())).thenAnswer((_) async =>
        DeviceCheckResponse(
            canAutoLogin: false, requiresOtp: false, hasPassword: true));
    when(() => api.linkEmail(any(), any()))
        .thenAnswer((_) async => AccountLinkResponse(success: true));
    when(() => api.linkPhone(any(), any()))
        .thenAnswer((_) async => AccountLinkResponse(success: true));
    when(() => api.unlinkEmail())
        .thenAnswer((_) async => AccountLinkResponse(success: true));
    when(() => api.unlinkPhone())
        .thenAnswer((_) async => AccountLinkResponse(success: true));
  }

  void requestEmailOtpFails(Object error) =>
      when(() => api.requestEmailOtp(any()))
          .thenAnswer((_) async => throw error);

  void verifyEmailOtpFails(Object error) =>
      when(() => api.verifyEmailOtp(any(), any()))
          .thenAnswer((_) async => throw error);

  void requestOtpFails(Object error) =>
      when(() => api.requestOtp(any())).thenAnswer((_) async => throw error);

  void verifyOtpFails(Object error) => when(() => api.verifyOtp(any(), any()))
      .thenAnswer((_) async => throw error);

  void loginPasswordFails(Object error) =>
      when(() => api.loginPassword(any(), any(), any(), any()))
          .thenAnswer((_) async => throw error);

  void loginPasswordRequiresOtp(String otpPhone) =>
      when(() => api.loginPassword(any(), any(), any(), any())).thenAnswer(
          (_) async =>
              LoginPasswordResponse(requiresOtp: true, otpPhone: otpPhone));

  void linkEmailFails(Object error) => when(() => api.linkEmail(any(), any()))
      .thenAnswer((_) async => throw error);

  void linkPhoneFails(Object error) => when(() => api.linkPhone(any(), any()))
      .thenAnswer((_) async => throw error);

  void unlinkEmailFails(Object error) =>
      when(() => api.unlinkEmail()).thenAnswer((_) async => throw error);

  void unlinkPhoneFails(Object error) =>
      when(() => api.unlinkPhone()).thenAnswer((_) async => throw error);

  // ── Fake-server state transitions ───────────────────────────
  //
  // The screens refresh the profile through `profileProvider` after a successful
  // link/unlink, so the stubs below mutate [account] the way the API would. A
  // refreshed identity on screen then proves the screen re-read the server.

  void linkEmailApplies(String email) =>
      when(() => api.linkEmail(any(), any())).thenAnswer((_) async {
        account.email = email;
        return AccountLinkResponse(success: true);
      });

  void linkPhoneApplies(String phone) =>
      when(() => api.linkPhone(any(), any())).thenAnswer((_) async {
        account.phone = phone;
        return AccountLinkResponse(success: true);
      });

  void unlinkEmailApplies() =>
      when(() => api.unlinkEmail()).thenAnswer((_) async {
        account.email = null;
        return AccountLinkResponse(success: true);
      });

  void unlinkPhoneApplies() =>
      when(() => api.unlinkPhone()).thenAnswer((_) async {
        account.phone = null;
        return AccountLinkResponse(success: true);
      });

  /// Holds the email-OTP request open, so a test can observe the in-flight
  /// (duplicate-submission) state.
  ///
  /// Created lazily rather than as a field initializer: a `Completer` captures
  /// the zone it was built in, and everything in `TestHarness()` runs in
  /// `setUp`, i.e. the root zone. Completing a root-zone future schedules its
  /// callbacks on the real event loop, which `testWidgets` never advances while
  /// the fake-async clock is running — the widget's `await` would hang. Building
  /// the slot from inside the test body binds it to the fake-async zone, so
  /// `pump()` drains it like any other pending work.
  CompleterSlot? _pendingEmailOtpRequest;

  CompleterSlot get pendingEmailOtpRequest =>
      _pendingEmailOtpRequest ??= CompleterSlot();

  void requestEmailOtpHangs() {
    final slot = pendingEmailOtpRequest;
    when(() => api.requestEmailOtp(any())).thenAnswer((_) => slot.future);
  }

  /// Restores the default successful behaviour after a failure stub.
  void requestEmailOtpSucceeds() => when(() => api.requestEmailOtp(any()))
      .thenAnswer((_) async => <String, dynamic>{'success': true});

  // ── Pumping ─────────────────────────────────────────────────

  Future<void> pump(WidgetTester tester, Widget screen) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    // A tall surface so long screens (Account has ~10 cards) lay out their
    // lower sections without scrolling them into view first.
    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    _screen = screen;
    router = GoRouter(
      initialLocation: '/',
      routes: [
        GoRoute(path: '/', builder: (context, state) => _screen),
        GoRoute(path: '/login', builder: (context, state) => _dest('login')),
        GoRoute(path: '/home', builder: (context, state) => _dest('home')),
        GoRoute(
            path: '/profile/credentials',
            builder: (context, state) => _dest('credentials')),
        GoRoute(
            path: '/profile/change-password',
            builder: (context, state) => _dest('change-password')),
        GoRoute(
            path: '/profile/sessions',
            builder: (context, state) => _dest('sessions')),
        GoRoute(
            path: '/notifications',
            builder: (context, state) => _dest('notifications')),
      ],
    );
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
  }

  void dispose() => container.dispose();

  // ── Finders that survive the three-tab TabBarView ───────────

  /// TextField by its `InputDecoration.labelText`.
  Finder labeledField(String label) => find.byWidgetPredicate(
      (w) => w is TextField && w.decoration?.labelText == label);

  /// The 6-digit OTP entry field (number keyboard, no label). Unique per tab:
  /// the phone tab only exposes one once its own OTP has been sent.
  Finder get codeField => find.byWidgetPredicate(
      (w) => w is TextField && w.keyboardType == TextInputType.number);

  Finder get emailOtpSendButton =>
      find.widgetWithText(ElevatedButton, 'Send code to email');

  Finder get emailOtpVerifyButton =>
      find.widgetWithText(ElevatedButton, 'Verify');

  Finder get phoneSendButton => find.widgetWithText(ElevatedButton, 'Send OTP');

  Finder get phoneVerifyButton =>
      find.widgetWithText(ElevatedButton, 'Verify OTP');

  Finder get passwordLoginButton =>
      find.widgetWithText(ElevatedButton, 'Login');

  /// An Authentication Methods row whose subtitle marks the identity as absent.
  /// Scoped to the ListTile because the account header repeats the same copy,
  /// and only this row drives whether Link/Remove is offered.
  Finder unlinkedIdentityRow(String title) => find.byWidgetPredicate((w) =>
      w is ListTile &&
      w.title is Text &&
      (w.title as Text).data == title &&
      w.subtitle is Text &&
      (w.subtitle as Text).data == 'Not linked');

  /// An Authentication Methods row currently linked to [value].
  Finder linkedIdentityRow(String title, String value) =>
      find.byWidgetPredicate((w) =>
          w is ListTile &&
          w.title is Text &&
          (w.title as Text).data == title &&
          w.subtitle is Text &&
          (w.subtitle as Text).data == value);

  ElevatedButton button(WidgetTester tester, Finder finder) =>
      tester.widget<ElevatedButton>(finder);

  /// Whether the primary button of [finder] is currently tappable — the screens
  /// disable their submit buttons while a request is in flight.
  bool isEnabled(WidgetTester tester, Finder finder) =>
      button(tester, finder).onPressed != null;

  /// Selects a login tab by its label.
  Future<void> openTab(WidgetTester tester, String label) async {
    await tester.tap(find.text(label));
    await tester.pumpAndSettle();
  }

  // ── Login flows shared by more than one test ────────────────

  /// Runs the full email-OTP sign-in for [email] and waits for the app to
  /// leave the login screen.
  Future<void> loginWithEmailOtp(
    WidgetTester tester, {
    required String email,
    String code = '123456',
  }) async {
    await openTab(tester, 'Email OTP');
    await tester.enterText(labeledField('Email address'), email);
    await tester.tap(emailOtpSendButton);
    await tester.pumpAndSettle();
    await tester.enterText(codeField, code);
    await tester.tap(emailOtpVerifyButton);
    await tester.pumpAndSettle();
  }

  /// Taps "Sign out" on the Account screen and waits for the route change.
  Future<void> signOut(WidgetTester tester) async {
    final button = find.widgetWithText(OutlinedButton, 'Sign out');
    await tester.ensureVisible(button);
    await tester.pumpAndSettle();
    await tester.tap(button);
    await tester.pumpAndSettle();
  }

  /// Opens the link dialog for an identity row. The Email card is laid out
  /// before the Phone card, so `first` is always the email row.
  Future<void> openLinkDialog(WidgetTester tester,
      {required bool email}) async {
    final linkButtons = find.widgetWithText(TextButton, 'Link');
    final target = email ? linkButtons.first : linkButtons.last;
    await tester.ensureVisible(target);
    await tester.pumpAndSettle();
    await tester.tap(target);
    await tester.pumpAndSettle();
  }

  /// Confirms the "Send OTP" step inside a link dialog.
  Future<void> sendDialogOtp(WidgetTester tester) async {
    await tester.tap(find.widgetWithText(ElevatedButton, 'Send OTP'));
    await tester.pumpAndSettle();
  }

  /// Submits the code inside a link dialog.
  Future<void> confirmDialogLink(WidgetTester tester) async {
    await tester.tap(find.widgetWithText(ElevatedButton, 'Link'));
    await tester.pumpAndSettle();
  }

  /// Taps an identity row's "Remove" button and confirms in the dialog.
  Future<void> confirmUnlink(WidgetTester tester, {required bool email}) async {
    final removeButtons = find.widgetWithText(TextButton, 'Remove');
    final target = email ? removeButtons.first : removeButtons.last;
    await tester.ensureVisible(target);
    await tester.pumpAndSettle();
    await tester.tap(target);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ElevatedButton, 'Remove'));
    await tester.pumpAndSettle();
  }

  /// Taps "Remove" and then cancels the confirmation dialog.
  Future<void> cancelUnlink(WidgetTester tester, {required bool email}) async {
    final removeButtons = find.widgetWithText(TextButton, 'Remove');
    final target = email ? removeButtons.first : removeButtons.last;
    await tester.ensureVisible(target);
    await tester.pumpAndSettle();
    await tester.tap(target);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextButton, 'Cancel'));
    await tester.pumpAndSettle();
  }

  Widget _dest(String name) {
    navigated.add(name);
    return Scaffold(body: Center(child: Text('destination:$name')));
  }
}
