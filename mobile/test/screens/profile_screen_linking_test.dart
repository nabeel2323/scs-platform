import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:scs_platform/screens/auth/login_screen.dart';
import 'package:scs_platform/screens/profile/profile_screen.dart';

import 'widget_test_harness.dart';

/// S1.38.2 — account linking/unlinking and logout identity cleanup, driven
/// through the real Account screen with the provider boundary mocked.
void main() {
  late TestHarness harness;

  setUp(() => harness = TestHarness());
  tearDown(() => harness.dispose());

  /// The phone-identity cleanup cases below deliberately exercise the dormant
  /// SMS channel: the email-only release hides the Phone OTP tab, but the
  /// implementation stays for a separately approved phase, and signing out must
  /// still clear a phone identity left behind by an earlier session. Opting in
  /// here keeps that coverage instead of deleting it.
  void enablePhoneChannel() {
    harness.dispose();
    harness = TestHarness(phoneOtpUiEnabled: true);
  }

  group('identity display', () {
    testWidgets('linked email and phone are both shown', (tester) async {
      harness.account.email = 'buyer-a@test.invalid';
      harness.account.phone = '+966500000022';
      await harness.pump(tester, const ProfileScreen());

      expect(find.text('buyer-a@test.invalid'), findsWidgets);
      expect(find.text('+966500000022'), findsWidgets);
      expect(find.text('Not linked'), findsNothing);
    });

    testWidgets('an email-only account shows no phone identity',
        (tester) async {
      harness.account.email = 'buyer-a@test.invalid';
      harness.account.phone = null;
      await harness.pump(tester, const ProfileScreen());

      expect(find.text('buyer-a@test.invalid'), findsWidgets);
      // The header repeats the phone line, so the assertion is scoped to the
      // Authentication Methods row that actually governs sign-in.
      expect(harness.unlinkedIdentityRow('Phone'), findsOneWidget);
      // No placeholder identifier is ever invented for the missing identity.
      expect(find.text('N/A'), findsNothing);
      expect(find.text('null'), findsNothing);
      expect(find.text('Not set'), findsNothing);
    });
  });

  group('linking', () {
    testWidgets('linking an email requests a code, verifies it and refreshes',
        (tester) async {
      harness.account.email = null;
      harness.account.phone = '+966500000022';
      harness.linkEmailApplies('buyer-new@test.invalid');
      await harness.pump(tester, const ProfileScreen());

      await harness.openLinkDialog(tester, email: true);
      expect(find.text('Link Email'), findsOneWidget);

      await tester.enterText(
          harness.labeledField('Email address'), 'buyer-new@test.invalid');
      await harness.sendDialogOtp(tester);
      verify(() => harness.api.requestEmailOtp('buyer-new@test.invalid'))
          .called(1);

      await tester.enterText(harness.labeledField('OTP'), '123456');
      await harness.confirmDialogLink(tester);

      verify(() => harness.api.linkEmail('buyer-new@test.invalid', '123456'))
          .called(1);
      expect(find.text('Email linked successfully.'), findsOneWidget);
      // The refreshed profile comes from a second fetch, not a local guess.
      verify(() => harness.api.fetchProfile()).called(2);
      expect(find.text('buyer-new@test.invalid'), findsWidgets);
    });

    testWidgets('linking a phone requests an SMS code and submits it',
        (tester) async {
      harness.account.email = 'buyer-a@test.invalid';
      harness.account.phone = null;
      harness.linkPhoneApplies('+971501234567');
      await harness.pump(tester, const ProfileScreen());

      await harness.openLinkDialog(tester, email: false);
      expect(find.text('Link Phone'), findsOneWidget);

      await tester.enterText(
          harness.labeledField('Phone number'), '+971501234567');
      await harness.sendDialogOtp(tester);
      verify(() => harness.api.requestOtp('+971501234567')).called(1);

      await tester.enterText(harness.labeledField('OTP'), '123456');
      await harness.confirmDialogLink(tester);

      verify(() => harness.api.linkPhone('+971501234567', '123456')).called(1);
      expect(find.text('Phone linked successfully.'), findsOneWidget);
      verify(() => harness.api.fetchProfile()).called(2);
      expect(find.text('+971501234567'), findsWidgets);
    });

    testWidgets('an ownership conflict is shown and links nothing',
        (tester) async {
      harness.account.email = null;
      harness.account.phone = '+966500000022';
      harness.linkEmailFails(httpError(409,
          detail: 'That email is already linked to another account.'));
      await harness.pump(tester, const ProfileScreen());

      await harness.openLinkDialog(tester, email: true);
      await tester.enterText(
          harness.labeledField('Email address'), 'taken@test.invalid');
      await harness.sendDialogOtp(tester);
      await tester.enterText(harness.labeledField('OTP'), '123456');
      await harness.confirmDialogLink(tester);

      expect(find.text('That email is already linked to another account.'),
          findsOneWidget);
      expect(find.text('Email linked successfully.'), findsNothing);
      // No merge: the profile is never refreshed off the back of a failure.
      verify(() => harness.api.fetchProfile()).called(1);
      expect(harness.unlinkedIdentityRow('Email'), findsOneWidget);
    });

    testWidgets('an invalid code during linking keeps the dialog open',
        (tester) async {
      harness.account.email = null;
      harness.account.phone = '+966500000022';
      harness.linkEmailFails(
          httpError(400, detail: 'That code is not valid. Please try again.'));
      await harness.pump(tester, const ProfileScreen());

      await harness.openLinkDialog(tester, email: true);
      await tester.enterText(
          harness.labeledField('Email address'), 'buyer-new@test.invalid');
      await harness.sendDialogOtp(tester);
      await tester.enterText(harness.labeledField('OTP'), '000000');
      await harness.confirmDialogLink(tester);

      expect(find.text('That code is not valid. Please try again.'),
          findsOneWidget);
      expect(find.text('Link Email'), findsOneWidget);
    });

    testWidgets('an expired code during linking is reported', (tester) async {
      harness.account.email = null;
      harness.account.phone = '+966500000022';
      harness.linkEmailFails(
          httpError(400, detail: 'This code has expired. Request a new one.'));
      await harness.pump(tester, const ProfileScreen());

      await harness.openLinkDialog(tester, email: true);
      await tester.enterText(
          harness.labeledField('Email address'), 'buyer-new@test.invalid');
      await harness.sendDialogOtp(tester);
      await tester.enterText(harness.labeledField('OTP'), '111111');
      await harness.confirmDialogLink(tester);

      expect(find.text('This code has expired. Request a new one.'),
          findsOneWidget);
      expect(find.text('Email linked successfully.'), findsNothing);
    });

    testWidgets('a failed code request is reported inside the dialog',
        (tester) async {
      harness.account.email = null;
      harness.account.phone = '+966500000022';
      harness.requestEmailOtpFails(networkError());
      await harness.pump(tester, const ProfileScreen());

      await harness.openLinkDialog(tester, email: true);
      await tester.enterText(
          harness.labeledField('Email address'), 'buyer-new@test.invalid');
      await harness.sendDialogOtp(tester);

      expect(
          find.text(
              'No internet connection. Please check your network and retry.'),
          findsOneWidget);
      // Still on the address step, so the user can retry.
      expect(harness.labeledField('Email address'), findsOneWidget);
    });

    testWidgets('an unconfigured email provider stops the link at the address',
        (tester) async {
      harness.account.email = null;
      harness.account.phone = '+966500000022';
      harness.requestEmailOtpDelivery(TestHarness.emailProviderUnavailable());
      await harness.pump(tester, const ProfileScreen());

      await harness.openLinkDialog(tester, email: true);
      await tester.enterText(
          harness.labeledField('Email address'), 'buyer-new@test.invalid');
      await harness.sendDialogOtp(tester);

      expect(find.textContaining('no code was sent'), findsOneWidget);
      expect(find.text('Code sent to buyer-new@test.invalid'), findsNothing);
      expect(harness.labeledField('OTP'), findsNothing);
      expect(harness.labeledField('Email address'), findsOneWidget);
    });

    testWidgets('an unconfirmed send still offers the code box, with a hedge',
        (tester) async {
      harness.account.email = null;
      harness.account.phone = '+966500000022';
      harness.requestEmailOtpDelivery(TestHarness.deliveryUncertain());
      await harness.pump(tester, const ProfileScreen());

      await harness.openLinkDialog(tester, email: true);
      await tester.enterText(
          harness.labeledField('Email address'), 'buyer-new@test.invalid');
      await harness.sendDialogOtp(tester);

      expect(harness.labeledField('OTP'), findsOneWidget);
      expect(find.text('Code sent to buyer-new@test.invalid'), findsNothing);
      expect(
          find.text(
              'If a code arrived for buyer-new@test.invalid, enter it below.'),
          findsOneWidget);
    });

    testWidgets('a rejected SMS send keeps the phone link dialog on input',
        (tester) async {
      harness.account.email = 'buyer-a@test.invalid';
      harness.account.phone = null;
      harness.requestPhoneOtpDelivery(TestHarness.deliveryRejected());
      await harness.pump(tester, const ProfileScreen());

      await harness.openLinkDialog(tester, email: false);
      await tester.enterText(
          harness.labeledField('Phone number'), '+971501234567');
      await harness.sendDialogOtp(tester);

      expect(find.textContaining("couldn't be sent"), findsOneWidget);
      expect(find.text('Code sent to +971501234567'), findsNothing);
      expect(harness.labeledField('OTP'), findsNothing);
    });

    testWidgets('linking never starts a new session or merges accounts',
        (tester) async {
      harness.account.email = null;
      harness.account.phone = '+966500000022';
      harness.linkEmailApplies('buyer-new@test.invalid');
      await harness.pump(tester, const ProfileScreen());

      await harness.openLinkDialog(tester, email: true);
      await tester.enterText(
          harness.labeledField('Email address'), 'buyer-new@test.invalid');
      await harness.sendDialogOtp(tester);
      await tester.enterText(harness.labeledField('OTP'), '123456');
      await harness.confirmDialogLink(tester);

      verifyNever(() => harness.api.verifyEmailOtp(any(), any()));
      verifyNever(() => harness.api.loginPassword(any(), any(), any(), any()));
      verifyNever(() => harness.storage.saveTokens(
            accessToken: any(named: 'accessToken'),
            refreshToken: any(named: 'refreshToken'),
            expiresAt: any(named: 'expiresAt'),
            activeOrgId: any(named: 'activeOrgId'),
          ));
      // Same signed-in user, one account, two identities.
      expect(harness.account.fullName, 'Test Buyer');
      expect(find.text('Test Buyer'), findsWidgets);
    });
  });

  group('unlinking', () {
    testWidgets('unlinking an email refreshes the profile', (tester) async {
      harness.account.email = 'buyer-a@test.invalid';
      harness.account.phone = '+966500000022';
      harness.unlinkEmailApplies();
      await harness.pump(tester, const ProfileScreen());

      await harness.confirmUnlink(tester, email: true);

      verify(() => harness.api.unlinkEmail()).called(1);
      expect(find.text('Email removed from account.'), findsOneWidget);
      verify(() => harness.api.fetchProfile()).called(2);
      expect(find.text('buyer-a@test.invalid'), findsNothing);
      expect(harness.unlinkedIdentityRow('Email'), findsOneWidget);
      expect(
          harness.linkedIdentityRow('Phone', '+966500000022'), findsOneWidget);
    });

    testWidgets('unlinking a phone refreshes the profile', (tester) async {
      harness.account.email = 'buyer-a@test.invalid';
      harness.account.phone = '+966500000022';
      harness.unlinkPhoneApplies();
      await harness.pump(tester, const ProfileScreen());

      await harness.confirmUnlink(tester, email: false);

      verify(() => harness.api.unlinkPhone()).called(1);
      expect(find.text('Phone removed from account.'), findsOneWidget);
      verify(() => harness.api.fetchProfile()).called(2);
      expect(find.text('+966500000022'), findsNothing);
    });

    testWidgets('cancelling the confirmation removes nothing', (tester) async {
      harness.account.email = 'buyer-a@test.invalid';
      harness.account.phone = '+966500000022';
      await harness.pump(tester, const ProfileScreen());

      await harness.cancelUnlink(tester, email: true);

      verifyNever(() => harness.api.unlinkEmail());
      expect(find.text('buyer-a@test.invalid'), findsWidgets);
      verify(() => harness.api.fetchProfile()).called(1);
    });

    testWidgets('removing the last reachable method is refused and displayed',
        (tester) async {
      // Email-only account: unlinking email would leave nothing to sign in with.
      harness.account.email = 'buyer-a@test.invalid';
      harness.account.phone = null;
      harness.unlinkEmailFails(httpError(400,
          detail: 'You cannot remove your last sign-in method.'));
      await harness.pump(tester, const ProfileScreen());

      await harness.confirmUnlink(tester, email: true);

      expect(find.text('You cannot remove your last sign-in method.'),
          findsOneWidget);
      expect(find.text('Email removed from account.'), findsNothing);
      // The identity stays linked and the profile is not refreshed away.
      expect(find.text('buyer-a@test.invalid'), findsWidgets);
      verify(() => harness.api.fetchProfile()).called(1);
    });

    testWidgets('a network failure during unlinking is reported',
        (tester) async {
      harness.account.email = 'buyer-a@test.invalid';
      harness.account.phone = '+966500000022';
      harness.unlinkEmailFails(networkError());
      await harness.pump(tester, const ProfileScreen());

      await harness.confirmUnlink(tester, email: true);

      expect(
          find.text(
              'No internet connection. Please check your network and retry.'),
          findsOneWidget);
      expect(find.text('buyer-a@test.invalid'), findsWidgets);
    });
  });

  group('logout identity cleanup', () {
    testWidgets('signing out clears the previous user\'s email identity',
        (tester) async {
      await harness.pump(tester, const LoginScreen());
      await harness.loginWithEmailOtp(tester, email: 'buyer-a@test.invalid');
      expect(harness.currentEmail, 'buyer-a@test.invalid');

      await harness.pump(tester, const ProfileScreen());
      await harness.signOut(tester);

      expect(harness.currentEmail, isNull);
      expect(harness.isAuthenticated, isFalse);
      expect(harness.navigated, contains('login'));
      verify(() => harness.storage.clearTokens()).called(1);
      verify(() => harness.client.clearAccessToken()).called(1);
    });

    testWidgets('signing out clears the previous user\'s phone identity',
        (tester) async {
      enablePhoneChannel();
      await harness.pump(tester, const LoginScreen());
      await harness.openTab(tester, 'Phone OTP');
      await tester.enterText(
          harness.labeledField('Phone Number'), '+966500000022');
      await tester.tap(harness.phoneSendButton);
      await tester.pumpAndSettle();
      await tester.enterText(harness.codeField, '123456');
      await tester.tap(harness.phoneVerifyButton);
      await tester.pumpAndSettle();
      expect(harness.currentPhone, '+966500000022');

      await harness.pump(tester, const ProfileScreen());
      await harness.signOut(tester);

      expect(harness.currentPhone, isEmpty);
      expect(harness.currentEmail, isNull);
    });

    testWidgets('signing out leaves no placeholder identifier behind',
        (tester) async {
      await harness.pump(tester, const LoginScreen());
      await harness.loginWithEmailOtp(tester, email: 'buyer-a@test.invalid');

      await harness.pump(tester, const ProfileScreen());
      await harness.signOut(tester);

      // '' / null are the agreed "no identity" markers; nothing is invented.
      expect(harness.currentPhone, '');
      expect(harness.currentEmail, isNull);
      expect(find.text('buyer-a@test.invalid'), findsNothing);
    });

    testWidgets('the next user on the same device sees only their own identity',
        (tester) async {
      enablePhoneChannel();
      // User A signs in with email OTP, then signs out.
      await harness.pump(tester, const LoginScreen());
      await harness.loginWithEmailOtp(tester, email: 'buyer-a@test.invalid');
      await harness.pump(tester, const ProfileScreen());
      await harness.signOut(tester);

      // User B then signs in with a phone OTP on the same device.
      await harness.pump(tester, const LoginScreen());
      await harness.openTab(tester, 'Phone OTP');
      await tester.enterText(
          harness.labeledField('Phone Number'), '+971501234567');
      await tester.tap(harness.phoneSendButton);
      await tester.pumpAndSettle();
      await tester.enterText(harness.codeField, '654321');
      await tester.tap(harness.phoneVerifyButton);
      await tester.pumpAndSettle();

      expect(harness.currentPhone, '+971501234567');
      expect(harness.currentEmail, isNull);
      expect(harness.isAuthenticated, isTrue);
    });
  });
}
