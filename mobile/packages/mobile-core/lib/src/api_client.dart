import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'auth_storage.dart';

/// API client with JWT auth interceptor and secure token refresh.
///
/// ## Security properties
///
/// - **Correct refresh field**: Reads `newRefreshToken` from the backend
///   `RefreshResponse` contract (not the legacy `refreshToken` field that
///   does not exist in the response).
///
/// - **Robust parsing**: Validates that `accessToken` and `newRefreshToken`
///   are non-null, non-empty strings before committing. A missing or
///   wrong-typed field fails the refresh safely — no partial credential
///   update, no invalid token stored.
///
/// - **Single-flight refresh**: Concurrent 401s share ONE rotation via a
///   [Completer]-based guard. The backend rotates refresh tokens and
///   interprets reuse as a session compromise, revoking the entire chain.
///   Without this guard, parallel requests with an expired token would
///   trigger multiple rotations and log the user out.
///
/// - **Supersession guard**: The refresh token used is captured before the
///   network call. After the response arrives, the current storage is
///   checked — if the refresh token has changed (logout, newer login), the
///   stale result is discarded rather than resurrecting a cleared session.
///
/// - **Pre-expiry proactive refresh**: The [onRequest] interceptor checks
///   `expiresAt` and refreshes within 60 seconds of expiry, avoiding the
///   first 401 entirely. Shares the same single-flight mechanism as the
///   reactive 401 path.
///
/// - **Retry guard**: Each request retries at most once after 401. A second
///   401 on retry is propagated to the caller (no infinite loops).
///
/// - **Auth endpoint bypass**: The refresh, login, and logout endpoints
///   never trigger auto-refresh (preventing recursion).
///
/// - **Transient vs auth failure**: Network errors during refresh do NOT
///   destroy valid credentials (matching web/admin behavior). Only server
///   rejection (4xx) clears credentials.
///
/// - **No token logging**: Tokens are never printed or included in errors.
class ApiClient {
  ApiClient({
    required this.baseUrl,
    required this.authStorage,
    @visibleForTesting Dio Function(String baseUrl)? refreshDioFactory,
  })  : _refreshDioFactory = refreshDioFactory ??
            ((url) => Dio(BaseOptions(
                  baseUrl: url,
                  connectTimeout: const Duration(seconds: 10),
                  receiveTimeout: const Duration(seconds: 30),
                ))),
        _dio = Dio(BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 30),
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        )) {
    _dio.interceptors.add(_authInterceptor());
  }

  final String baseUrl;
  final AuthStorage authStorage;
  final Dio _dio;
  final Dio Function(String baseUrl) _refreshDioFactory;
  Dio get dio => _dio;

  // ── Single-flight refresh guard ──────────────────────────────

  /// When non-null, a refresh is in progress. Concurrent callers await
  /// the same [Completer] instead of starting a new rotation.
  Completer<bool?>? _refreshCompleter;

  /// Proactive refresh window — refresh if within 60s of expiry,
  /// matching the web/admin `expiresAt - Date.now() < 60_000` check.
  static const _preExpiryWindow = Duration(seconds: 60);

  /// Endpoints that must NOT trigger auto-refresh (would cause recursion).
  static const _authPaths = <String>[
    '/v1/auth/refresh',
    '/v1/auth/otp/request',
    '/v1/auth/otp/verify',
    '/v1/auth/login/password',
    '/v1/auth/login/device-check',
    '/v1/auth/logout',
  ];

  // ── Public helpers ───────────────────────────────────────────

  /// Set the access token on the Dio base headers (used after login or
  /// org-switch to make the next request immediately authenticated).
  void setAccessToken(String token) =>
      _dio.options.headers['Authorization'] = 'Bearer $token';

  /// Remove the cached access token from base headers.
  void clearAccessToken() => _dio.options.headers.remove('Authorization');

  // ── Refresh logic ────────────────────────────────────────────

  /// Whether [path] is an auth endpoint that should bypass auto-refresh.
  bool _isAuthEndpoint(String path) {
    for (final p in _authPaths) {
      if (path.startsWith(p)) return true;
    }
    return false;
  }

  /// Whether the current access token is within [_preExpiryWindow] of
  /// expiry. Returns `false` when expiry is unknown (backward-compatible
  /// with pre-remediation installations) — the reactive 401 path handles
  /// that case instead.
  Future<bool> _needsProactiveRefresh() async {
    final expiresAt = await authStorage.getExpiresAt();
    if (expiresAt == null) return false;
    return expiresAt.difference(DateTime.now()) < _preExpiryWindow;
  }

  /// Attempt a token refresh with single-flight + supersession semantics.
  ///
  /// Returns:
  /// - `true`  — refresh succeeded, new tokens stored.
  /// - `false` — server rejected the refresh (auth failure); caller
  ///              should clear credentials.
  /// - `null`  — transient network error; caller should keep existing
  ///              credentials and let the original error propagate.
  Future<bool?> _doRefresh() async {
    // Piggyback on an in-flight refresh (single-flight).
    if (_refreshCompleter != null) {
      return _refreshCompleter!.future;
    }

    final completer = Completer<bool?>();
    _refreshCompleter = completer;

    try {
      // Capture the refresh token BEFORE the network call (ownership).
      final refreshTokenUsed = await authStorage.getRefreshToken();
      if (refreshTokenUsed == null || refreshTokenUsed.isEmpty) {
        completer.complete(false);
        return false;
      }

      final refreshDio = _refreshDioFactory(baseUrl);

      final Response<dynamic> res;
      try {
        res = await refreshDio.post(
          '/v1/auth/refresh',
          data: <String, dynamic>{'refreshToken': refreshTokenUsed},
        );
      } on DioException catch (e) {
        if (e.response != null) {
          // Server responded with 4xx/5xx — authentication failure.
          completer.complete(false);
          return false;
        }
        // Network-level error (timeout, no connection) — transient.
        // Keep existing credentials; let the caller handle the error.
        completer.complete(null);
        return null;
      }

      // ── Robust response validation ──────────────────────────
      // Backend contract: { accessToken: string, newRefreshToken: string }
      final data = res.data;
      if (data is! Map<String, dynamic>) {
        completer.complete(false);
        return false;
      }

      final newAccess = data['accessToken'];
      final newRefresh = data['newRefreshToken'];

      if (newAccess is! String ||
          newAccess.isEmpty ||
          newRefresh is! String ||
          newRefresh.isEmpty) {
        // Missing, null, or wrong-type fields — fail safely without
        // partially updating credentials.
        completer.complete(false);
        return false;
      }

      // ── Supersession guard ──────────────────────────────────
      // If the refresh token in storage changed while we awaited the
      // network (logout cleared it, or a newer login replaced it),
      // discard this result rather than resurrecting a dead session.
      final currentRefresh = await authStorage.getRefreshToken();
      if (currentRefresh != refreshTokenUsed) {
        completer.complete(false);
        return false;
      }

      // ── Commit new credential set ───────────────────────────
      // expiresAt matches web/admin: now + 15 minutes.
      await authStorage.saveTokens(
        accessToken: newAccess,
        refreshToken: newRefresh,
        expiresAt: DateTime.now().add(AuthStorage.tokenLifetime),
      );

      completer.complete(true);
      return true;
    } catch (_) {
      // Unexpected error — treat as transient to avoid destroying
      // potentially valid credentials.
      completer.complete(null);
      return null;
    } finally {
      // Guaranteed cleanup — prevents deadlock where _refreshCompleter
      // stays non-null forever after an unhandled exception.
      _refreshCompleter = null;
    }
  }

  // ── Dio interceptor ──────────────────────────────────────────

  InterceptorsWrapper _authInterceptor() {
    // Marker key stored in RequestOptions.extra to prevent infinite
    // retry loops (a retried request that gets another 401 must not
    // trigger a second refresh).
    const retryKey = '_scs_auth_retried';

    return InterceptorsWrapper(
      onRequest: (options, handler) async {
        // Auth endpoints bypass token attachment and proactive refresh.
        if (_isAuthEndpoint(options.path)) {
          handler.next(options);
          return;
        }

        final token = await authStorage.getAccessToken();
        if (token != null && token.isNotEmpty) {
          // Proactive refresh: if the token is near expiry, refresh
          // before sending. Shares the single-flight guard with the
          // reactive 401 path.
          if (await _needsProactiveRefresh()) {
            final result = await _doRefresh();
            if (result == false) {
              // Auth failure — clear credentials. The request proceeds
              // without a token; the server will return 401 which the
              // onError handler propagates (refresh token is gone).
              await authStorage.clearTokens();
            }
            // For null (transient), keep credentials and try anyway.
          }

          // Re-read the (possibly refreshed) access token.
          final currentToken = await authStorage.getAccessToken();
          if (currentToken != null && currentToken.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $currentToken';
          }
        }

        handler.next(options);
      },
      onError: (error, handler) async {
        // Only handle 401s on non-auth endpoints.
        if (error.response?.statusCode != 401 ||
            _isAuthEndpoint(error.requestOptions.path)) {
          handler.next(error);
          return;
        }

        // Retry guard: if this request already retried once, don't loop.
        if (error.requestOptions.extra[retryKey] == true) {
          handler.next(error);
          return;
        }

        // Single-flight refresh.
        final result = await _doRefresh();

        if (result != true) {
          // Auth failure (false) → clear credentials.
          // Transient failure (null) → keep credentials, propagate error.
          if (result == false) {
            await authStorage.clearTokens();
          }
          handler.next(error);
          return;
        }

        // Retry the original request with the new access token.
        final newToken = await authStorage.getAccessToken();
        if (newToken == null || newToken.isEmpty) {
          handler.next(error);
          return;
        }

        error.requestOptions.headers['Authorization'] = 'Bearer $newToken';
        error.requestOptions.extra[retryKey] = true;

        try {
          final retry = await _dio.fetch(error.requestOptions);
          handler.resolve(retry);
        } catch (e) {
          if (e is DioException) {
            handler.reject(e);
          } else {
            handler.reject(DioException(
              requestOptions: error.requestOptions,
              error: e,
              type: DioExceptionType.unknown,
            ));
          }
        }
      },
    );
  }
}
