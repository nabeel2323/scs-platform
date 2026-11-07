import 'package:flutter_test/flutter_test.dart';
import 'package:scs_platform/models/models.dart';

/// Contract tests for the email-only staging release.
///
/// The shapes asserted here are the ones the API actually emits — see
/// `apps/api/src/modules/identity/identity.service.ts` (the `requiresOtp`
/// branch of `loginPassword`) and
/// `apps/api/src/modules/notifications/providers/provider-registry.service.ts`
/// (the `<CHANNEL>_CHANNEL_DISABLED` refusal). Nothing is invented: the client
/// has to read the channel the server chose, not assume it.
void main() {
  group('LoginPasswordResponse second-factor channel', () {
    test('an email challenge carries the masked otpEmail and no otpPhone', () {
      final response = LoginPasswordResponse.fromJson(<String, dynamic>{
        'requiresOtp': true,
        'otpEmail': 'b***@example.com',
        'otpDelivery': 'accepted',
      });

      expect(response.requiresOtp, isTrue);
      expect(response.otpEmail, 'b***@example.com');
      expect(response.otpPhone, isNull);
      expect(response.hasEmailChallenge, isTrue);
      expect(response.hasPhoneChallenge, isFalse);
      expect(response.otpConfirmed, isTrue);
      // A challenge is not a session.
      expect(response.toAuthTokens(), isNull);
    });

    test('a phone challenge carries otpPhone and no otpEmail', () {
      final response = LoginPasswordResponse.fromJson(<String, dynamic>{
        'requiresOtp': true,
        'otpPhone': '+971501234567',
        'otpDelivery': 'accepted',
      });

      expect(response.otpPhone, '+971501234567');
      expect(response.otpEmail, isNull);
      expect(response.hasPhoneChallenge, isTrue);
      expect(response.hasEmailChallenge, isFalse);
    });

    test('an empty identifier is not a challenge on that channel', () {
      // The API serialises the unused channel as `undefined`, which some
      // gateways normalise to an empty string. Neither may be read as "the
      // server sent a code here".
      final response = LoginPasswordResponse.fromJson(<String, dynamic>{
        'requiresOtp': true,
        'otpEmail': '',
        'otpPhone': '',
      });

      expect(response.hasEmailChallenge, isFalse);
      expect(response.hasPhoneChallenge, isFalse);
    });

    test('an older API that never named a channel leaves both absent', () {
      final response =
          LoginPasswordResponse.fromJson(<String, dynamic>{'requiresOtp': true});

      expect(response.otpEmail, isNull);
      expect(response.hasEmailChallenge, isFalse);
      expect(response.otpConfirmed, isFalse);
    });

    test('an unconfirmed email delivery is not reported as confirmed', () {
      final response = LoginPasswordResponse.fromJson(<String, dynamic>{
        'requiresOtp': true,
        'otpEmail': 'b***@example.com',
        'otpDelivery': 'uncertain',
      });

      expect(response.hasEmailChallenge, isTrue);
      expect(response.otpConfirmed, isFalse);
    });
  });

  group('OtpRequestResponse disabled-channel classification', () {
    test('SMS_CHANNEL_DISABLED is unavailable, not a rejected address', () {
      final response = OtpRequestResponse(
          success: false, deliveryStatus: 'SMS_CHANNEL_DISABLED');

      expect(response.outcome, 'unavailable');
      expect(response.delivered, isFalse);
    });

    test('WHATSAPP_CHANNEL_DISABLED is unavailable', () {
      final response = OtpRequestResponse(
          success: false, deliveryStatus: 'WHATSAPP_CHANNEL_DISABLED');

      expect(response.outcome, 'unavailable');
    });

    test('EMAIL_CHANNEL_DISABLED is unavailable', () {
      final response = OtpRequestResponse(
          success: false, deliveryStatus: 'EMAIL_CHANNEL_DISABLED');

      expect(response.outcome, 'unavailable');
      expect(response.delivered, isFalse);
    });

    test('a disabled channel survives a JSON round trip', () {
      final response = OtpRequestResponse.fromJson(<String, dynamic>{
        'success': false,
        'deliveryStatus': 'SMS_CHANNEL_DISABLED',
        'possiblyDelivered': false,
      });

      expect(response.outcome, 'unavailable');
    });

    test('a genuine provider failure is still rejected, not unavailable', () {
      // The new suffix rule must not swallow real rejections: a bad address is
      // the user's problem to fix, a disabled channel is not.
      expect(
          OtpRequestResponse(success: false, deliveryStatus: 'DELIVERY_FAILED')
              .outcome,
          'rejected');
      expect(
          OtpRequestResponse(success: false, deliveryStatus: 'INVALID_ADDRESS')
              .outcome,
          'rejected');
    });
  });
}