import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/screens/auth/login_screen.dart';

import 'widget_test_harness.dart';

/// Email-only staging release — the mobile login surface.
///
/// The backend `OTP_CHANNELS` allowlist is the final authority; these tests
/// prove the client never *offers* a channel the release does not permit, never
/// claims a delivery the API did not confirm, and still renders a challenge the
/// server itself issued on the phone channel (so nobody is trapped).
void main() {
  late TestHarness harness;

  setUp(() => harness = TestHarness());
  tearDown(() => harness.dispose());

  /// Stubs the password-login second factor exactly as the API answers it when
  /// the chosen channel is email: a MASKED address, no phone, no tokens.
  void emailSecondFactor({String? delivery = 'accepted'}) {
    when(() => harness.api.loginPassword(any(), any(), any(), any()))
        .thenAnswer((_) async => LoginPasswordResponse(
              requiresOtp: true,
              otpEmail: 'b***@test.invalid',
              otpDelivery: delivery,
            ));
  }

  Future<void> openEmailOtp(WidgetTester tester) async {
    await harness.pump(tester, const LoginScreen());
    await harness.openTab(tester, 'Email OTP');
  }

  Future<void> requestCode(WidgetTester tester,
      {String email = 'buyer-a@test.invalid'}) async {
    await tester.enterText(harness.labeledField('Email address'), email);
    await tester.tap(harness.emailOtpSendButton);
    await tester.pumpAndSettle();
  }

  group('the email-only channel surface', () {
    testWidgets('only the supported login tabs are offered', (tester) async {
      await harness.pump(tester, const LoginScreen());

      expect(find.text('Email/Password'), findsOneWidget);
      expect(find.text('Email OTP'), findsOneWidget);
      // SMS and WhatsApp are not permitted in this release, so the tab that
      // requests them must not be selectable.
      expect(find.text('Phone OTP'), findsNothing);
    });

    testWidgets('no link invites the user into a disabled channel',
        (tester) async {
      await harness.pump(tester, const LoginScreen());
      expect(find.text('Login with Phone OTP instead'), findsNothing);

      await harness.openTab(tester, 'Email OTP');
      expect(find.text('Login with Phone OTP instead'), findsNothing);
    });

    testWidgets('the email request step does not advertise phone OTP',
        (tester) async {
      await openEmailOtp(tester);

      expect(harness.labeledField('Phone Number'), findsNothing);
      expect(harness.phoneSendButton, findsNothing);
    });

    testWidgets(
        'the dormant phone implementation still works when it is re-enabled',
        (tester) async {
      // The SMS/WhatsApp code stays in the app for a separately approved future
      // phase. Overriding the UI flag proves it was hidden, not deleted.
      harness.dispose();
      harness = TestHarness(phoneOtpUiEnabled: true);
      await harness.pump(tester, const LoginScreen());
      await harness.openTab(tester, 'Phone OTP');

      await tester.enterText(
          harness.labeledField('Phone Number'), '+971501234567');
      await tester.tap(harness.phoneSendButton);
      await tester.pumpAndSettle();
      await tester.enterText(harness.codeField, '123456');
      await tester.tap(harness.phoneVerifyButton);
      await tester.pumpAndSettle();

      expect(harness.isAuthenticated, isTrue);
      expect(harness.currentPhone, '+971501234567');
      verifyNever(() => harness.api.requestEmailOtp(any()));
    });
  });

  group('email address validation', () {
    testWidgets('an address without an @ never reaches the API', (tester) async {
      await openEmailOtp(tester);
      await requestCode(tester, email: 'not-an-address');

      verifyNever(() => harness.api.requestEmailOtp(any()));
      expect(find.text('Please enter a valid email address'), findsOneWidget);
      expect(harness.emailOtpVerifyButton, findsNothing);
    });

    testWidgets('an address without a domain dot never reaches the API',
        (tester) async {
      await openEmailOtp(tester);
      await requestCode(tester, email: 'buyer@localhost');

      verifyNever(() => harness.api.requestEmailOtp(any()));
      expect(find.text('Please enter a valid email address'), findsOneWidget);
    });

    testWidgets('an empty address never reaches the API', (tester) async {
      await openEmailOtp(tester);
      await requestCode(tester, email: '   ');

      verifyNever(() => harness.api.requestEmailOtp(any()));
      expect(harness.emailOtpVerifyButton, findsNothing);
    });

    testWidgets('surrounding whitespace is trimmed before the request',
        (tester) async {
      await openEmailOtp(tester);
      await requestCode(tester, email: '  buyer-a@test.invalid  ');

      verify(() => harness.api.requestEmailOtp('buyer-a@test.invalid'))
          .called(1);
      expect(find.text('Code sent to buyer-a@test.invalid'), findsOneWidget);
    });
  });

  group('resending a code', () {
    testWidgets('a code can be resent from the verification step',
        (tester) async {
      await openEmailOtp(tester);
      await requestCode(tester);

      final resend = find.widgetWithText(TextButton, 'Resend code');
      expect(resend, findsOneWidget);
      await tester.tap(resend);
      await tester.pumpAndSettle();

      verify(() => harness.api.requestEmailOtp('buyer-a@test.invalid'))
          .called(2);
      // Still on the code-entry step: a resend must not throw away the user's
      // place in the flow.
      expect(harness.emailOtpVerifyButton, findsOneWidget);
      expect(harness.isAuthenticated, isFalse);
    });

    testWidgets('a throttled resend shows the rate limit and keeps code entry',
        (tester) async {
      await openEmailOtp(tester);
      await requestCode(tester);

      harness.requestEmailOtpFails(httpError(429,
          detail: 'Too many code requests. Please wait before trying again.'));
      await tester.tap(find.widgetWithText(TextButton, 'Resend code'));
      await tester.pumpAndSettle();

      expect(
          find.text(
              'Too many code requests. Please wait before trying again.'),
          findsOneWidget);
      expect(harness.emailOtpVerifyButton, findsOneWidget);
      expect(harness.isAuthenticated, isFalse);
    });

    testWidgets('a resend the provider did not accept never claims delivery',
        (tester) async {
      await openEmailOtp(tester);
      await requestCode(tester);

      harness.requestEmailOtpDelivery(OtpRequestResponse(
          success: false,
          deliveryStatus: 'DELIVERY_TIMEOUT',
          possiblyDelivered: true));
      await tester.tap(find.widgetWithText(TextButton, 'Resend code'));
      await tester.pumpAndSettle();

      expect(find.text('Code sent to buyer-a@test.invalid'), findsNothing);
      expect(
          find.textContaining('If a code arrived for buyer-a@test.invalid'),
          findsOneWidget);
    });
  });

  group('password-login second factor', () {
    testWidgets('an email challenge routes to Email OTP and names the address',
        (tester) async {
      emailSecondFactor();
      await harness.pump(tester, const LoginScreen());
      await tester.enterText(
          harness.labeledField('Email'), 'buyer-a@test.invalid');
      await tester.enterText(
          harness.labeledField('Password'), 'correct-horse-battery');
      await tester.tap(harness.passwordLoginButton);
      await tester.pumpAndSettle();

      // The server chose email; the client must land on the email code step,
      // not on a phone step the release cannot deliver to.
      expect(harness.emailOtpVerifyButton, findsOneWidget);
      expect(harness.phoneVerifyButton, findsNothing);
      expect(find.text('Phone OTP'), findsNothing);
      expect(find.textContaining('b***@test.invalid'), findsOneWidget);
      expect(harness.isAuthenticated, isFalse);
      // The server already sent this code. The client must not send a second
      // one, and must never touch the phone endpoints.
      verifyNever(() => harness.api.requestEmailOtp(any()));
      verifyNever(() => harness.api.requestOtp(any()));
    });

    testWidgets('an unconfirmed email challenge does not claim the code was sent',
        (tester) async {
      emailSecondFactor(delivery: 'uncertain');
      await harness.pump(tester, const LoginScreen());
      await tester.enterText(
          harness.labeledField('Email'), 'buyer-a@test.invalid');
      await tester.enterText(
          harness.labeledField('Password'), 'correct-horse-battery');
      await tester.tap(harness.passwordLoginButton);
      await tester.pumpAndSettle();

      expect(harness.emailOtpVerifyButton, findsOneWidget);
      expect(find.textContaining('If a code arrived'), findsOneWidget);
      expect(find.textContaining('Code sent to'), findsNothing);
    });

    testWidgets('verifying the emailed second factor opens a session',
        (tester) async {
      emailSecondFactor();
      await harness.pump(tester, const LoginScreen());
      await tester.enterText(
          harness.labeledField('Email'), 'buyer-a@test.invalid');
      await tester.enterText(
          harness.labeledField('Password'), 'correct-horse-battery');
      await tester.tap(harness.passwordLoginButton);
      await tester.pumpAndSettle();
      await tester.enterText(harness.codeField, '123456');
      await tester.tap(harness.emailOtpVerifyButton);
      await tester.pumpAndSettle();

      // Verification uses the address the user authenticated with, never the
      // masked one the server returned for display.
      verify(() => harness.api.verifyEmailOtp('buyer-a@test.invalid', '123456'))
          .called(1);
      verify(() => harness.storage.saveTokens(
            accessToken: any(named: 'accessToken'),
            refreshToken: any(named: 'refreshToken'),
            expiresAt: any(named: 'expiresAt'),
            activeOrgId: any(named: 'activeOrgId'),
          )).called(1);
      expect(harness.isAuthenticated, isTrue);
      expect(harness.currentEmail, 'buyer-a@test.invalid');
      expect(harness.currentPhone, '');
      expect(harness.navigated, contains('home'));
    });

    testWidgets(
        'a challenge the server issued on the phone channel is still rendered',
        (tester) async {
      // The allowlist is server-side. If a deployment ever answers with a phone
      // challenge, hiding the phone step would trap the user mid-login.
      harness.loginPasswordRequiresOtp('+971501234567', delivery: 'accepted');
      await harness.pump(tester, const LoginScreen());
      await tester.enterText(
          harness.labeledField('Email'), 'dual@test.invalid');
      await tester.enterText(
          harness.labeledField('Password'), 'correct-horse-battery');
      await tester.tap(harness.passwordLoginButton);
      await tester.pumpAndSettle();

      expect(find.text('Phone OTP'), findsOneWidget);
      expect(harness.phoneVerifyButton, findsOneWidget);
      await tester.enterText(harness.codeField, '123456');
      await tester.tap(harness.phoneVerifyButton);
      await tester.pumpAndSettle();

      verify(() => harness.api.verifyOtp('+971501234567', '123456')).called(1);
      expect(harness.isAuthenticated, isTrue);
    });
  });

  group('no disabled-channel request is made', () {
    testWidgets('the whole email-only journey stays off the phone endpoints',
        (tester) async {
      await openEmailOtp(tester);
      await requestCode(tester);
      await tester.enterText(harness.codeField, '123456');
      await tester.tap(harness.emailOtpVerifyButton);
      await tester.pumpAndSettle();

      verify(() => harness.api.requestEmailOtp('buyer-a@test.invalid'))
          .called(1);
      verify(() => harness.api.verifyEmailOtp('buyer-a@test.invalid', '123456'))
          .called(1);
      verifyNever(() => harness.api.requestOtp(any()));
      verifyNever(() => harness.api.verifyOtp(any(), any()));
      expect(harness.isAuthenticated, isTrue);
    });

    testWidgets('an unavailable email channel is not solved by suggesting SMS',
        (tester) async {
      harness.requestEmailOtpDelivery(OtpRequestResponse(
          success: false, deliveryStatus: 'EMAIL_CHANNEL_DISABLED'));
      await openEmailOtp(tester);
      await requestCode(tester);

      expect(harness.emailOtpVerifyButton, findsNothing);
      expect(find.textContaining('no code was sent'), findsOneWidget);
      expect(find.textContaining('phone OTP'), findsNothing);
      expect(find.textContaining('SMS'), findsNothing);
      expect(find.textContaining('WhatsApp'), findsNothing);
      verifyNever(() => harness.api.requestOtp(any()));
    });
  });
}