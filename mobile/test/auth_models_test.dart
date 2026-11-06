import 'package:flutter_test/flutter_test.dart';
import 'package:scs_platform/models/models.dart';

/// Unit tests for the typed auth/session models (P2: typed mobile models).
/// These lock the wire contract from @scs/contracts so a server-side rename or
/// nullability change fails here rather than silently in the UI.
void main() {
  group('AuthTokens', () {
    test('fromJson reads the token pair', () {
      final t = AuthTokens.fromJson({
        'accessToken': 'a',
        'refreshToken': 'r',
      });
      expect(t.accessToken, 'a');
      expect(t.refreshToken, 'r');
    });

    test('fromJson defaults missing keys to empty strings (never throws)', () {
      final t = AuthTokens.fromJson({});
      expect(t.accessToken, '');
      expect(t.refreshToken, '');
    });
  });

  group('LoginPasswordResponse', () {
    test('trusted device yields a usable token pair', () {
      final r = LoginPasswordResponse.fromJson({
        'accessToken': 'a',
        'refreshToken': 'r',
      });
      expect(r.requiresOtp, false);
      expect(r.hasSession, true);
      final tokens = r.toAuthTokens();
      expect(tokens, isNotNull);
      expect(tokens!.accessToken, 'a');
      expect(tokens.refreshToken, 'r');
    });

    test('new device returns requiresOtp + otpPhone and no session', () {
      final r = LoginPasswordResponse.fromJson({
        'requiresOtp': true,
        'otpPhone': '+966500000000',
      });
      expect(r.requiresOtp, true);
      expect(r.otpPhone, '+966500000000');
      expect(r.hasSession, false);
      expect(r.toAuthTokens(), isNull);
    });

    test('a half-populated pair is not treated as a session', () {
      final r = LoginPasswordResponse.fromJson({'accessToken': 'a'});
      expect(r.hasSession, false);
      expect(r.toAuthTokens(), isNull);
    });

    test('only an accepted delivery may be shown as "code sent"', () {
      LoginPasswordResponse parsed(String? delivery) => LoginPasswordResponse(
            requiresOtp: true,
            otpPhone: '+966500000000',
            otpDelivery: delivery,
          );
      expect(parsed('accepted').otpConfirmed, true);
      expect(parsed('uncertain').otpConfirmed, false);
      // A server that never answered the question is not an answer either:
      // absence must not become a delivery claim.
      expect(parsed(null).otpConfirmed, false);
      expect(LoginPasswordResponse.fromJson({'requiresOtp': true}).otpConfirmed,
          false);
    });
  });

  group('DeviceCheckResponse', () {
    // S-2: the route answers a constant acknowledgement. The old model carried
    // canAutoLogin / requiresOtp / hasPassword — i.e. it let an unauthenticated
    // caller learn whether an account exists, whether it has a password, and
    // whether this device had been trusted before. Those getters are gone, so
    // a reply that still carries them parses to the single `checked` flag and
    // nothing else is reachable.
    test('fromJson reads the constant acknowledgement', () {
      final d = DeviceCheckResponse.fromJson({'checked': true});
      expect(d.checked, true);
    });

    test('fromJson defaults a missing acknowledgement to true', () {
      expect(DeviceCheckResponse.fromJson({}).checked, true);
    });

    test('legacy disclosure fields are not represented on the model', () {
      final d = DeviceCheckResponse.fromJson({
        'checked': true,
        'canAutoLogin': true,
        'requiresOtp': true,
        'hasPassword': true,
      });
      expect(d.checked, true);
      // Read through `dynamic` so the absent members fail at runtime instead of
      // at compile time: the disclosure values must have nowhere to land.
      final dynamic loose = d;
      expect(() => loose.canAutoLogin, throwsA(isA<NoSuchMethodError>()));
      expect(() => loose.requiresOtp, throwsA(isA<NoSuchMethodError>()));
      expect(() => loose.hasPassword, throwsA(isA<NoSuchMethodError>()));
    });
  });

  group('OtpRequestResponse — delivery outcome', () {
    test('success is the only value that counts as delivered', () {
      final r = OtpRequestResponse.fromJson({'success': true});
      expect(r.outcome, 'accepted');
      expect(r.delivered, true);
    });

    test('an unconfigured channel is unavailable, not a failed send', () {
      final r = OtpRequestResponse.fromJson(
          {'success': false, 'deliveryStatus': 'UNKNOWN_CHANNEL'});
      expect(r.outcome, 'unavailable');
      expect(r.delivered, false);
    });

    test('a channel whose provider has no credentials is unavailable', () {
      // Names taken from the providers themselves, not invented: twilio-sms
      // .provider.ts, smtp-email.provider.ts and whatsapp.provider.ts each
      // return their own `<PROVIDER>_NOT_CONFIGURED` reason, which the API
      // forwards verbatim as deliveryStatus. A classifier keyed on the router's
      // `_PROVIDER_NOT_CONFIGURED` spelling alone read all three as a failed
      // send and told the user to check the number.
      for (final status in [
        'SMS_PROVIDER_NOT_CONFIGURED',
        'TWILIO_NOT_CONFIGURED',
        'SMTP_NOT_CONFIGURED',
        'WHATSAPP_NOT_CONFIGURED',
      ]) {
        final r = OtpRequestResponse.fromJson({
          'success': false,
          'deliveryStatus': status,
        });
        expect(r.outcome, 'unavailable', reason: status);
        expect(r.delivered, false, reason: status);
      }
    });

    test('a transport error is uncertain, not a confirmed failure', () {
      final r = OtpRequestResponse.fromJson({
        'success': false,
        'deliveryStatus': 'DELIVERY_ERROR',
      });
      expect(r.outcome, 'uncertain');
      expect(r.delivered, false);
    });

    test('a timeout that may still deliver is uncertain', () {
      final r = OtpRequestResponse.fromJson({
        'success': false,
        'deliveryStatus': 'DELIVERY_TIMEOUT',
      });
      expect(r.outcome, 'uncertain');
      expect(r.delivered, false);
    });

    test('possiblyDelivered is uncertain even without a timeout status', () {
      final r = OtpRequestResponse.fromJson({
        'success': false,
        'deliveryStatus': 'Twilio error 21211',
        'possiblyDelivered': true,
      });
      expect(r.outcome, 'uncertain');
    });

    test('a plain rejection stays rejected', () {
      final r = OtpRequestResponse.fromJson({
        'success': false,
        'deliveryStatus': 'DELIVERY_FAILED',
      });
      expect(r.outcome, 'rejected');
    });

    test('a body with no delivery information is treated as not delivered', () {
      final r = OtpRequestResponse.fromJson({});
      expect(r.success, false);
      expect(r.outcome, 'rejected');
    });
  });

  group('SwitchOrgResponse', () {
    test('fromJson surfaces the re-minted access token', () {
      final s = SwitchOrgResponse.fromJson({'accessToken': 'new-token'});
      expect(s.accessToken, 'new-token');
    });

    test('fromJson defaults a missing token to empty string', () {
      final s = SwitchOrgResponse.fromJson({});
      expect(s.accessToken, '');
    });
  });

  group('SessionInfo', () {
    test('fromJson reads all fields including isCurrent (WEB-B3)', () {
      final s = SessionInfo.fromJson({
        'id': 'sess-1',
        'device': 'Chrome on Windows',
        'deviceId': 'dev-1',
        'ip': '10.0.0.1',
        'createdAt': '2024-01-01T00:00:00Z',
        'expiresAt': '2024-01-08T00:00:00Z',
        'isCurrent': true,
        'isRevoked': false,
      });
      expect(s.id, 'sess-1');
      expect(s.device, 'Chrome on Windows');
      expect(s.deviceId, 'dev-1');
      expect(s.ip, '10.0.0.1');
      expect(s.createdAt, '2024-01-01T00:00:00Z');
      expect(s.expiresAt, '2024-01-08T00:00:00Z');
      expect(s.isCurrent, true);
      expect(s.isRevoked, false);
    });

    test('fromJson keeps nullable fields null and defaults flags to false', () {
      final s = SessionInfo.fromJson({
        'id': 'sess-2',
        'device': '',
        'createdAt': '',
        'expiresAt': '',
      });
      expect(s.deviceId, isNull);
      expect(s.ip, isNull);
      expect(s.isCurrent, false);
      expect(s.isRevoked, false);
    });
  });
}
