import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Secure storage for JWT tokens and refresh tokens.
class AuthStorage {
  AuthStorage({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _accessTokenKey = 'scs_access_token';
  static const _refreshTokenKey = 'scs_refresh_token';
  static const _activeOrgIdKey = 'scs_active_org_id';

  Future<void> saveTokens({required String accessToken, required String refreshToken, String? activeOrgId}) async {
    final writes = <Future<void>>[
      _storage.write(key: _accessTokenKey, value: accessToken),
      _storage.write(key: _refreshTokenKey, value: refreshToken),
    ];
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

  Future<void> clearTokens() async {
    await Future.wait([
      _storage.delete(key: _accessTokenKey),
      _storage.delete(key: _refreshTokenKey),
      _storage.delete(key: _activeOrgIdKey),
    ]);
  }
}
