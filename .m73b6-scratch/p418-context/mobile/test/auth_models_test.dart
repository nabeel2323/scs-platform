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
  });

  group('DeviceCheckResponse', () {
    test('fromJson reads all flags', () {
      final d = DeviceCheckResponse.fromJson({
        'canAutoLogin': true,
        'requiresOtp': false,
        'hasPassword': true,
      });
      expect(d.canAutoLogin, true);
      expect(d.requiresOtp, false);
      expect(d.hasPassword, true);
    });

    test('fromJson defaults missing flags to false', () {
      final d = DeviceCheckResponse.fromJson({});
      expect(d.canAutoLogin, false);
      expect(d.requiresOtp, false);
      expect(d.hasPassword, false);
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
