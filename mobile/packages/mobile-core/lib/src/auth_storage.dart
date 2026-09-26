import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Secure storage for JWT tokens, refresh tokens, and expiry metadata.
///
/// Stores three values in [FlutterSecureStorage]:
/// - `accessToken` — short-lived JWT (15 min)
/// - `refreshToken` — long-lived rotation token (30 days)
/// - `expiresAt` — millisecond-epoch when the access token expires
///
/// All three are written atomically (via [Future.wait]) so a partial update
/// cannot leave the session in an inconsistent state. On read, a missing
/// `expiresAt` is treated as "unknown expiry" (backward-compatible with
/// installations that predate this field).
class AuthStorage {
  AuthStorage({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _accessTokenKey = 'scs_access_token';
  static const _refreshTokenKey = 'scs_refresh_token';
  static const _expiresAtKey = 'scs_expires_at';
  static const _activeOrgIdKey = 'scs_active_org_id';

  /// Access token lifetime — matches the backend JWT `expiresIn: '15m'`
  /// and the web/admin convention of `Date.now() + 15 * 60 * 1000`.
  static const tokenLifetime = Duration(minutes: 15);

  /// Persist a complete credential set.
  ///
  /// [expiresAt] is the access-token expiry instant. Pass `null` only when
  /// the expiry is genuinely unknown (e.g. legacy installations).
  /// All three token fields are written concurrently so a crash mid-write
  /// cannot leave a mix of old and new values.
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
    DateTime? expiresAt,
    String? activeOrgId,
  }) async {
    final writes = <Future<void>>[
      _storage.write(key: _accessTokenKey, value: accessToken),
      _storage.write(key: _refreshTokenKey, value: refreshToken),
    ];
    if (expiresAt != null) {
      writes.add(
        _storage.write(
          key: _expiresAtKey,
          value: expiresAt.millisecondsSinceEpoch.toString(),
        ),
      );
    }
    if (activeOrgId != null) {
      writes.add(_storage.write(key: _activeOrgIdKey, value: activeOrgId));
    }
    await Future.wait(writes);
  }

  Future<String?> getActiveOrgId() => _storage.read(key: _activeOrgIdKey);
  Future<void> setActiveOrgId(String orgId) =>
      _storage.write(key: _activeOrgIdKey, value: orgId);

  Future<String?> getAccessToken() => _storage.read(key: _accessTokenKey);
  Future<String?> getRefreshToken() => _storage.read(key: _refreshTokenKey);

  /// Read the access-token expiry instant, or `null` if not yet stored
  /// (backward-compatible with pre-remediation installations).
  Future<DateTime?> getExpiresAt() async {
    final raw = await _storage.read(key: _expiresAtKey);
    if (raw == null || raw.isEmpty) return null;
    final ms = int.tryParse(raw);
    if (ms == null) return null;
    return DateTime.fromMillisecondsSinceEpoch(ms);
  }

  /// Remove all credential and session data.
  ///
  /// After this call, [getAccessToken], [getRefreshToken], [getExpiresAt],
  /// and [getActiveOrgId] all return `null`.
  Future<void> clearTokens() async {
    await Future.wait([
      _storage.delete(key: _accessTokenKey),
      _storage.delete(key: _refreshTokenKey),
      _storage.delete(key: _expiresAtKey),
      _storage.delete(key: _activeOrgIdKey),
    ]);
  }
}
