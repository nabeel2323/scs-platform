import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:scs_platform/screens/auth/login_screen.dart';

import 'widget_test_harness.dart';

/// S1.38.2 — Email-OTP login widget tests for the Flutter client.
///
/// Everything runs against the real [LoginScreen] with the provider boundary
/// mocked (see [TestHarness]); no HTTP, no secure storage, no Firebase.
void main() {
  late TestHarness harness;

  setUp(() => harness = TestHarness());
  tearDown(() => harness.dispose());

  group('Email OTP login', () {
    testWidgets('the three login tabs are visible and Email OTP is selectable',
        (tester) async {
      await harness.pump(tester, const LoginScreen());

      expect(find.text('Email/Password'), findsOneWidget);
      expect(find.text('Phone OTP'), findsOneWidget);
      expect(find.text('Email OTP'), findsOneWidget);

      await harness.openTab(tester, 'Email OTP');

      expect(harness.labeledField('Email address'), findsOneWidget);
      expect(harness.emailOtpSendButton, findsOneWidget);
      // The password form must not stay mounted under the email-OTP tab.
      expect(harness.labeledField('Password'), findsNothing);
      expect(harness.labeledField('Phone Number'), findsNothing);
    });

    testWidgets('a valid email can request a code and moves to verification',
        (tester) async {
      await harness.pump(tester, const LoginScreen());
      await harness.openTab(tester, 'Email OTP');

      await tester.enterText(
          harness.labeledField('Email address'), 'buyer-a@test.invalid');
      await tester.tap(harness.emailOtpSendButton);
      await tester.pumpAndSettle();

      verify(() => harness.api.requestEmailOtp('buyer-a@test.invalid'))
          .called(1);
      expect(find.text('Code sent to buyer-a@test.invalid'), findsOneWidget);
      expect(harness.emailOtpVerifyButton, findsOneWidget);
      // No session exists yet — requesting a code must not sign anybody in.
      expect(harness.isAuthenticated, isFalse);
      verifyNever(() => harness.storage.saveTokens(
            accessToken: any(named: 'accessToken'),
            refreshToken: any(named: 'refreshToken'),
            expiresAt: any(named: 'expiresAt'),
            activeOrgId: any(named: 'activeOrgId'),
          ));
    });

    testWidgets('the correct code opens a session and enters the app',
        (tester) async {
      await harness.pump(tester, const LoginScreen());
      await harness.loginWithEmailOtp(tester, email: 'buyer-a@test.invalid');

      verify(() => harness.api.verifyEmailOtp('buyer-a@test.invalid', '123456'))
          .called(1);
      verify(() => harness.storage.saveTokens(
            accessToken: any(named: 'accessToken'),
            refreshToken: any(named: 'refreshToken'),
            expiresAt: any(named: 'expiresAt'),
            activeOrgId: any(named: 'activeOrgId'),
          )).called(1);
      verify(() => harness.client.setAccessToken('access-email')).called(1);
      verify(() => harness.push.initialize()).called(1);

      expect(harness.isAuthenticated, isTrue);
      expect(harness.navigated, contains('home'));
    });

    testWidgets('an email-only sign-in records the email and no phone',
        (tester) async {
      await harness.pump(tester, const LoginScreen());
      await harness.loginWithEmailOtp(tester, email: 'buyer-a@test.invalid');

      expect(harness.currentEmail, 'buyer-a@test.invalid');
      // An empty string is the "no phone identity" marker; it must never be
      // replaced by a fabricated number.
      expect(harness.currentPhone, '');
    });

    testWidgets('an invalid code shows an understandable error and stays put',
        (tester) async {
      harness.verifyEmailOtpFails(
          httpError(400, detail: 'That code is not valid. Please try again.'));
      await harness.pump(tester, const LoginScreen());
      await harness.openTab(tester, 'Email OTP');
      await tester.enterText(
          harness.labeledField('Email address'), 'buyer-a@test.invalid');
      await tester.tap(harness.emailOtpSendButton);
      await tester.pumpAndSettle();
      await tester.enterText(harness.codeField, '000000');
      await tester.tap(harness.emailOtpVerifyButton);
      await tester.pumpAndSettle();

      expect(find.text('That code is not valid. Please try again.'),
          findsOneWidget);
      expect(harness.isAuthenticated, isFalse);
      expect(harness.currentEmail, isNull);
      expect(harness.navigated, isNot(contains('home')));
    });

    testWidgets('an expired code shows an understandable error',
        (tester) async {
      harness.verifyEmailOtpFails(
          httpError(400, detail: 'This code has expired. Request a new one.'));
      await harness.pump(tester, const LoginScreen());
      await harness.openTab(tester, 'Email OTP');
      await tester.enterText(
          harness.labeledField('Email address'), 'buyer-a@test.invalid');
      await tester.tap(harness.emailOtpSendButton);
      await tester.pumpAndSettle();
      await tester.enterText(harness.codeField, '111111');
      await tester.tap(harness.emailOtpVerifyButton);
      await tester.pumpAndSettle();

      expect(find.text('This code has expired. Request a new one.'),
          findsOneWidget);
      expect(harness.isAuthenticated, isFalse);
    });

    testWidgets('a network failure is reported and retrying succeeds',
        (tester) async {
      harness.requestEmailOtpFails(networkError());
      await harness.pump(tester, const LoginScreen());
      await harness.openTab(tester, 'Email OTP');
      await tester.enterText(
          harness.labeledField('Email address'), 'buyer-a@test.invalid');
      await tester.tap(harness.emailOtpSendButton);
      await tester.pumpAndSettle();

      expect(
          find.text(
              'No internet connection. Please check your network and retry.'),
          findsOneWidget);
      // The form stays on the request step so the user can retry in place.
      expect(harness.emailOtpSendButton, findsOneWidget);

      harness.requestEmailOtpSucceeds();
      await tester.tap(harness.emailOtpSendButton);
      await tester.pumpAndSettle();

      expect(find.text('Code sent to buyer-a@test.invalid'), findsOneWidget);
      verify(() => harness.api.requestEmailOtp('buyer-a@test.invalid'))
          .called(2);
    });

    testWidgets('a rate-limited request surfaces the retry message',
        (tester) async {
      harness.requestEmailOtpFails(httpError(429));
      await harness.pump(tester, const LoginScreen());
      await harness.openTab(tester, 'Email OTP');
      await tester.enterText(
          harness.labeledField('Email address'), 'buyer-a@test.invalid');
      await tester.tap(harness.emailOtpSendButton);
      await tester.pumpAndSettle();

      expect(
          find.text('Too many attempts. Please wait a moment and try again.'),
          findsOneWidget);
      expect(harness.isAuthenticated, isFalse);
    });

    testWidgets(
        'duplicate submission is prevented while a request is in flight',
        (tester) async {
      harness.requestEmailOtpHangs();
      await harness.pump(tester, const LoginScreen());
      await harness.openTab(tester, 'Email OTP');
      await tester.enterText(
          harness.labeledField('Email address'), 'buyer-a@test.invalid');

      await tester.tap(harness.emailOtpSendButton);
      await tester.pump();

      // While the request is in flight the button swaps its label for a
      // spinner and its onPressed is nulled, so a second tap cannot re-send.
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      final busyButton = find.byType(ElevatedButton);
      expect(harness.isEnabled(tester, busyButton), isFalse);

      await tester.tap(busyButton, warnIfMissed: false);
      await tester.pump();

      verify(() => harness.api.requestEmailOtp('buyer-a@test.invalid'))
          .called(1);

      harness.pendingEmailOtpRequest.complete();
      // Explicit timed pumps rather than pumpAndSettle: the awaited response
      // resumes on a microtask that only runs when the fake-async clock moves,
      // so the rebuild that drops the in-flight spinner lands a frame later.
      for (var i = 0; i < 4; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        if (find
            .text('Code sent to buyer-a@test.invalid')
            .evaluate()
            .isNotEmpty) {
          break;
        }
      }
      expect(find.text('Code sent to buyer-a@test.invalid'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });

    testWidgets('changing the email returns to the request step',
        (tester) async {
      await harness.pump(tester, const LoginScreen());
      await harness.openTab(tester, 'Email OTP');
      await tester.enterText(
          harness.labeledField('Email address'), 'buyer-a@test.invalid');
      await tester.tap(harness.emailOtpSendButton);
      await tester.pumpAndSettle();

      await tester.tap(find.text('Change email'));
      await tester.pumpAndSettle();

      expect(harness.labeledField('Email address'), findsOneWidget);
      expect(harness.emailOtpSendButton, findsOneWidget);
    });
  });

  group('existing login methods are unaffected', () {
    testWidgets('password login still opens a session', (tester) async {
      await harness.pump(tester, const LoginScreen());
      await tester.enterText(
          harness.labeledField('Email'), 'buyer-a@test.invalid');
      await tester.enterText(harness.labeledField('Password'), 'hunter2!');
      await tester.tap(harness.passwordLoginButton);
      await tester.pumpAndSettle();

      verify(() => harness.api.loginPassword(
          'buyer-a@test.invalid', 'hunter2!', any(), any())).called(1);
      expect(harness.isAuthenticated, isTrue);
      verify(() => harness.client.setAccessToken('access-password')).called(1);
      expect(harness.currentEmail, 'buyer-a@test.invalid');
      expect(harness.currentPhone, '');
      expect(harness.navigated, contains('home'));
    });

    testWidgets('password login on a new device falls back to phone OTP',
        (tester) async {
      harness.loginPasswordRequiresOtp('+966500000022');
      await harness.pump(tester, const LoginScreen());
      await tester.enterText(
          harness.labeledField('Email'), 'buyer-a@test.invalid');
      await tester.enterText(harness.labeledField('Password'), 'hunter2!');
      await tester.tap(harness.passwordLoginButton);
      await tester.pumpAndSettle();

      expect(find.text('New device detected. Please verify with OTP.'),
          findsOneWidget);
      expect(find.text('Enter OTP sent to +966500000022'), findsOneWidget);
      expect(harness.isAuthenticated, isFalse);

      await tester.enterText(harness.codeField, '123456');
      await tester.tap(harness.phoneVerifyButton);
      await tester.pumpAndSettle();

      expect(harness.isAuthenticated, isTrue);
      expect(harness.currentPhone, '+966500000022');
    });

    testWidgets('phone OTP login still works and keeps the phone identity',
        (tester) async {
      await harness.pump(tester, const LoginScreen());
      await harness.openTab(tester, 'Phone OTP');
      await tester.enterText(
          harness.labeledField('Phone Number'), '+966500000022');
      await tester.tap(harness.phoneSendButton);
      await tester.pumpAndSettle();

      verify(() => harness.api.requestOtp('+966500000022')).called(1);

      await tester.enterText(harness.codeField, '123456');
      await tester.tap(harness.phoneVerifyButton);
      await tester.pumpAndSettle();

      expect(harness.isAuthenticated, isTrue);
      expect(harness.currentPhone, '+966500000022');
      expect(harness.currentEmail, isNull);
      expect(harness.navigated, contains('home'));
    });

    testWidgets('a failed password login leaves no session behind',
        (tester) async {
      harness.loginPasswordFails(httpError(401, detail: 'Wrong credentials.'));
      await harness.pump(tester, const LoginScreen());
      await tester.enterText(
          harness.labeledField('Email'), 'buyer-a@test.invalid');
      await tester.enterText(harness.labeledField('Password'), 'wrong');
      await tester.tap(harness.passwordLoginButton);
      await tester.pumpAndSettle();

      expect(find.text('Wrong credentials.'), findsOneWidget);
      expect(harness.isAuthenticated, isFalse);
      expect(harness.currentEmail, isNull);
      expect(harness.currentPhone, '');
    });
  });

  group('session handling on the login screen', () {
    testWidgets('signing in as a second user replaces the first session',
        (tester) async {
      await harness.pump(tester, const LoginScreen());
      await harness.loginWithEmailOtp(tester, email: 'buyer-a@test.invalid');
      expect(harness.currentEmail, 'buyer-a@test.invalid');

      await harness.pump(tester, const LoginScreen());
      await harness.loginWithEmailOtp(tester,
          email: 'buyer-b@test.invalid', code: '654321');

      expect(harness.currentEmail, 'buyer-b@test.invalid');
      expect(harness.isAuthenticated, isTrue);
      verify(() => harness.storage.saveTokens(
            accessToken: any(named: 'accessToken'),
            refreshToken: any(named: 'refreshToken'),
            expiresAt: any(named: 'expiresAt'),
            activeOrgId: any(named: 'activeOrgId'),
          )).called(2);
      verify(() => harness.client.setAccessToken('access-email')).called(2);
    });
  });
}
