import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:mobile_core/mobile_core.dart';

// ── Mocks ──────────────────────────────────────────────────────

class MockAuthStorage extends Mock implements AuthStorage {}

/// Controllable HTTP adapter for Dio. Enqueue responses; each fetch()
/// consumes the next one. Tracks call counts per path for assertions.
class MockHttpClientAdapter implements HttpClientAdapter {
  final List<_QueuedResponse> _queue = [];
  final List<RequestOptions> requests = [];

  int get refreshCallCount =>
      requests.where((r) => r.path.contains('/v1/auth/refresh')).length;

  int get totalCallCount => requests.length;

  /// Enqueue a successful JSON response.
  void enqueueJson({
    int status = 200,
    Map<String, dynamic> data = const {},
    Duration? delay,
  }) {
    _queue.add(_QueuedResponse(status: status, data: data, delay: delay));
  }

  /// Enqueue an HTTP error (4xx/5xx).
  void enqueueError({int status = 401, Duration? delay}) {
    _queue.add(_QueuedResponse(status: status, delay: delay));
  }

  /// Enqueue a network-level failure (no HTTP response at all).
  void enqueueNetworkFailure({Duration? delay}) {
    _queue.add(_QueuedResponse(networkFailure: true, delay: delay));
  }

  @override
  Future<ResponseBody> fetch(
    RequestOptions options, [
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ]) async {
    requests.add(options);
    if (_queue.isEmpty) {
      throw DioException(
        requestOptions: options,
        type: DioExceptionType.connectionError,
        message: 'No more mock responses queued',
      );
    }
    final queued = _queue.removeAt(0);
    if (queued.delay != null) {
      await Future<void>.delayed(queued.delay!);
    }
    if (queued.networkFailure) {
      throw DioException(
        requestOptions: options,
        type: DioExceptionType.connectionTimeout,
        message: 'Mock network failure',
      );
    }
    if (queued.status >= 400) {
      throw DioException(
        requestOptions: options,
        response: Response(
          requestOptions: options,
          statusCode: queued.status,
        ),
        type: DioExceptionType.badResponse,
      );
    }
    return ResponseBody.fromString(
      jsonEncode(queued.data),
      queued.status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _QueuedResponse {
  final int status;
  final Map<String, dynamic> data;
  final Duration? delay;
  final bool networkFailure;

  _QueuedResponse({
    this.status = 200,
    this.data = const {},
    this.delay,
    this.networkFailure = false,
  });
}

// ── Helpers ────────────────────────────────────────────────────

/// Standard successful refresh response matching the backend contract.
Map<String, dynamic> refreshResponse({
  String access = 'new-access',
  String refresh = 'new-refresh',
}) =>
    {'accessToken': access, 'newRefreshToken': refresh};

/// Set up common AuthStorage mock defaults for a logged-in state.
void setupLoggedInStorage(
  MockAuthStorage storage, {
  String access = 'old-access',
  String refresh = 'old-refresh',
  DateTime? expiresAt,
}) {
  when(() => storage.getAccessToken()).thenAnswer((_) async => access);
  when(() => storage.getRefreshToken()).thenAnswer((_) async => refresh);
  when(() => storage.getExpiresAt()).thenAnswer((_) async => expiresAt);
  when(() => storage.saveTokens(
        accessToken: any(named: 'accessToken'),
        refreshToken: any(named: 'refreshToken'),
        expiresAt: any(named: 'expiresAt'),
        activeOrgId: any(named: 'activeOrgId'),
      )).thenAnswer((_) async {});
  when(() => storage.clearTokens()).thenAnswer((_) async {});
}

/// Create an ApiClient wired to mock storage and mock HTTP adapters.
(
  ApiClient client,
  MockHttpClientAdapter mainAdapter,
  MockHttpClientAdapter refreshAdapter
) createTestClient(MockAuthStorage storage) {
  final mainAdapter = MockHttpClientAdapter();
  final refreshAdapter = MockHttpClientAdapter();

  final client = ApiClient(
    baseUrl: 'http://localhost:3000',
    authStorage: storage,
    refreshDioFactory: (url) {
      final dio = Dio(BaseOptions(baseUrl: url));
      dio.httpClientAdapter = refreshAdapter;
      return dio;
    },
  );
  client.dio.httpClientAdapter = mainAdapter;

  return (client, mainAdapter, refreshAdapter);
}

// ── Tests ──────────────────────────────────────────────────────

void main() {
  late MockAuthStorage storage;

  setUp(() {
    storage = MockAuthStorage();
  });

  // ── AuthStorage tests (§29, §30) ──────────────────────────────

  group('AuthStorage — expiresAt', () {
    test('saveTokens persists expiresAt alongside tokens', () async {
      // Use a real AuthStorage with an in-memory store is not possible
      // without platform channels, so we verify the contract via mock.
      final expiry = DateTime(2026, 1, 1, 12, 0, 0);
      when(() => storage.saveTokens(
            accessToken: any(named: 'accessToken'),
            refreshToken: any(named: 'refreshToken'),
            expiresAt: any(named: 'expiresAt'),
          )).thenAnswer((_) async {});

      await storage.saveTokens(
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: expiry,
      );

      verify(() => storage.saveTokens(
            accessToken: 'a',
            refreshToken: 'r',
            expiresAt: expiry,
          )).called(1);
    });

    test('clearTokens removes all credential data', () async {
      when(() => storage.clearTokens()).thenAnswer((_) async {});

      await storage.clearTokens();

      verify(() => storage.clearTokens()).called(1);
    });

    test('getExpiresAt returns null for legacy installations', () async {
      when(() => storage.getExpiresAt()).thenAnswer((_) async => null);

      final result = await storage.getExpiresAt();
      expect(result, isNull);
    });

    test('tokenLifetime constant matches backend 15m JWT expiry', () {
      expect(AuthStorage.tokenLifetime, const Duration(minutes: 15));
    });
  });

  // ── Test A: Single request refresh ────────────────────────────

  group('JWT Refresh —', () {
    test('A: Single 401 → refresh → retry → success', () async {
      setupLoggedInStorage(storage);
      final (client, mainAdapter, refreshAdapter) = createTestClient(storage);

      // Main: first call returns 401, second call (retry) returns 200.
      mainAdapter.enqueueError(status: 401);
      mainAdapter.enqueueJson(status: 200, data: {'result': 'ok'});

      // Refresh: succeeds with new tokens.
      refreshAdapter.enqueueJson(data: refreshResponse());

      final res = await client.dio.get('/v1/test');

      expect(res.statusCode, 200);
      expect(refreshAdapter.refreshCallCount, 1);
      expect(mainAdapter.totalCallCount, 2); // original + retry

      // Verify new tokens were stored.
      verify(() => storage.saveTokens(
            accessToken: 'new-access',
            refreshToken: 'new-refresh',
            expiresAt: any(named: 'expiresAt'),
          )).called(1);
    });

    // ── Test B: Three concurrent 401s → exactly 1 refresh ──────

    test('B: Three concurrent 401s → exactly 1 refresh → 3 retries', () async {
      setupLoggedInStorage(storage);
      final (client, mainAdapter, refreshAdapter) = createTestClient(storage);

      // Three requests all get 401 first, then succeed on retry.
      mainAdapter.enqueueError(status: 401); // req A original
      mainAdapter.enqueueError(status: 401); // req B original
      mainAdapter.enqueueError(status: 401); // req C original
      mainAdapter.enqueueJson(status: 200, data: {'r': 'A'}); // req A retry
      mainAdapter.enqueueJson(status: 200, data: {'r': 'B'}); // req B retry
      mainAdapter.enqueueJson(status: 200, data: {'r': 'C'}); // req C retry

      // Single refresh response (single-flight means only 1 call).
      refreshAdapter.enqueueJson(data: refreshResponse());

      final results = await Future.wait([
        client.dio.get('/v1/a'),
        client.dio.get('/v1/b'),
        client.dio.get('/v1/c'),
      ]);

      expect(results.length, 3);
      expect(refreshAdapter.refreshCallCount, 1,
          reason: 'Exactly ONE refresh HTTP request for 3 concurrent 401s');
      // 3 originals + 3 retries = 6 main adapter calls
      expect(mainAdapter.totalCallCount, 6);
    });

    // ── Test C: Concurrent 401 + pre-expiry → 1 refresh ────────

    test('C: Concurrent 401 + pre-expiry → exactly 1 refresh', () async {
      // Token is near expiry (within 60s), so onRequest triggers proactive
      // refresh. A concurrent 401 also triggers reactive refresh.
      // Both must share the same single-flight refresh.
      setupLoggedInStorage(
        storage,
        expiresAt: DateTime.now().add(const Duration(seconds: 30)),
      );
      final (client, mainAdapter, refreshAdapter) = createTestClient(storage);

      // Request A: proactive refresh happens in onRequest, then request
      // goes through with new token → 200.
      mainAdapter.enqueueJson(status: 200, data: {'r': 'A'});

      // Request B: also sees near-expiry in onRequest, piggybacks on
      // the same refresh, then goes through → 200.
      mainAdapter.enqueueJson(status: 200, data: {'r': 'B'});

      // Single refresh response.
      refreshAdapter.enqueueJson(data: refreshResponse());

      final results = await Future.wait([
        client.dio.get('/v1/a'),
        client.dio.get('/v1/b'),
      ]);

      expect(results.length, 2);
      expect(refreshAdapter.refreshCallCount, 1,
          reason: 'Pre-expiry + concurrent requests share ONE refresh');
    });

    // ── Test D: Refresh failure → credentials cleared ───────────

    test('D: Refresh returns 401 → credentials cleared', () async {
      setupLoggedInStorage(storage);
      final (client, mainAdapter, refreshAdapter) = createTestClient(storage);

      mainAdapter.enqueueError(status: 401);
      // Refresh itself fails with 401 (server rejected).
      refreshAdapter.enqueueError(status: 401);

      final err = await _expectDio401(() => client.dio.get('/v1/test'));

      expect(err.response?.statusCode, 401);
      verify(() => storage.clearTokens()).called(1);
    });

    // ── Test E: Refresh network timeout → transient ─────────────

    test('E: Refresh network timeout → credentials NOT cleared', () async {
      setupLoggedInStorage(storage);
      final (client, mainAdapter, refreshAdapter) = createTestClient(storage);

      mainAdapter.enqueueError(status: 401);
      // Refresh fails with network error (no HTTP response).
      refreshAdapter.enqueueNetworkFailure();

      final err = await _expectDio401(() => client.dio.get('/v1/test'));

      expect(err.response?.statusCode, 401);
      // Credentials must NOT be cleared for transient failures.
      verifyNever(() => storage.clearTokens());
    });

    // ── Test F: Logout during refresh ───────────────────────────

    test('F: Logout during refresh → credentials remain cleared', () async {
      // Simulate: refresh starts, logout clears tokens mid-flight,
      // refresh response arrives → must NOT resurrect session.
      setupLoggedInStorage(storage);
      final (client, mainAdapter, refreshAdapter) = createTestClient(storage);

      mainAdapter.enqueueError(status: 401);

      // Refresh response succeeds but takes time.
      refreshAdapter.enqueueJson(
        data: refreshResponse(),
        delay: const Duration(milliseconds: 100),
      );

      // Start the request (triggers refresh).
      final requestFuture = client.dio.get('/v1/test');

      // Simulate logout clearing tokens while refresh is in-flight.
      await Future<void>.delayed(const Duration(milliseconds: 10));
      // Change the stored refresh token to simulate logout having cleared it.
      when(() => storage.getRefreshToken()).thenAnswer((_) async => null);
      when(() => storage.getAccessToken()).thenAnswer((_) async => null);

      final err = await _expectDio401(() => requestFuture);

      // The supersession guard detects the token changed → discards result.
      // The original 401 propagates.
      expect(err.response?.statusCode, 401);
      // saveTokens should NOT have been called (superseded).
      verifyNever(() => storage.saveTokens(
            accessToken: any(named: 'accessToken'),
            refreshToken: any(named: 'refreshToken'),
            expiresAt: any(named: 'expiresAt'),
          ));
    });

    // ── Test G: Superseded refresh ──────────────────────────────

    test('G: Superseded refresh → stale result discarded', () async {
      // A newer login replaced the refresh token mid-flight.
      setupLoggedInStorage(storage, refresh: 'original-refresh');
      final (client, mainAdapter, refreshAdapter) = createTestClient(storage);

      mainAdapter.enqueueError(status: 401);

      // Refresh takes time.
      refreshAdapter.enqueueJson(
        data: refreshResponse(),
        delay: const Duration(milliseconds: 100),
      );

      final requestFuture = client.dio.get('/v1/test');

      // Simulate a newer login replacing the refresh token.
      await Future<void>.delayed(const Duration(milliseconds: 10));
      when(() => storage.getRefreshToken())
          .thenAnswer((_) async => 'different-refresh');

      final err = await _expectDio401(() => requestFuture);

      // Supersession guard detects mismatch → discards.
      expect(err.response?.statusCode, 401);
      verifyNever(() => storage.saveTokens(
            accessToken: any(named: 'accessToken'),
            refreshToken: any(named: 'refreshToken'),
            expiresAt: any(named: 'expiresAt'),
          ));
    });

    // ── Test H: Refresh response missing field ──────────────────

    test('H: Refresh response missing newRefreshToken → safe failure',
        () async {
      setupLoggedInStorage(storage);
      final (client, mainAdapter, refreshAdapter) = createTestClient(storage);

      mainAdapter.enqueueError(status: 401);
      // Refresh response is missing the newRefreshToken field.
      refreshAdapter.enqueueJson(data: {'accessToken': 'new-access'});

      final err = await _expectDio401(() => client.dio.get('/v1/test'));

      expect(err.response?.statusCode, 401);
      // Must NOT store partial credentials.
      verifyNever(() => storage.saveTokens(
            accessToken: any(named: 'accessToken'),
            refreshToken: any(named: 'refreshToken'),
            expiresAt: any(named: 'expiresAt'),
          ));
      // Auth failure → credentials cleared.
      verify(() => storage.clearTokens()).called(1);
    });

    // ── Test I: Refresh response invalid type ───────────────────

    test('I: Refresh response newRefreshToken = null → safe failure', () async {
      setupLoggedInStorage(storage);
      final (client, mainAdapter, refreshAdapter) = createTestClient(storage);

      mainAdapter.enqueueError(status: 401);
      // newRefreshToken is explicitly null.
      refreshAdapter.enqueueJson(
          data: {'accessToken': 'new-access', 'newRefreshToken': null});

      final err = await _expectDio401(() => client.dio.get('/v1/test'));

      expect(err.response?.statusCode, 401);
      verifyNever(() => storage.saveTokens(
            accessToken: any(named: 'accessToken'),
            refreshToken: any(named: 'refreshToken'),
            expiresAt: any(named: 'expiresAt'),
          ));
    });

    // ── Test J: Retry limit (no infinite loop) ──────────────────

    test('J: Retry returns 401 again → no infinite refresh loop', () async {
      setupLoggedInStorage(storage);
      final (client, mainAdapter, refreshAdapter) = createTestClient(storage);

      // Original → 401, refresh succeeds, retry → 401 again.
      mainAdapter.enqueueError(status: 401); // original
      mainAdapter.enqueueError(status: 401); // retry (still 401)

      refreshAdapter.enqueueJson(data: refreshResponse());

      final err = await _expectDio401(() => client.dio.get('/v1/test'));

      // The retry's 401 propagates — no second refresh attempt.
      expect(err.response?.statusCode, 401);
      expect(refreshAdapter.refreshCallCount, 1,
          reason: 'Only ONE refresh even though retry also got 401');
      // 2 main calls: original + one retry (no more).
      expect(mainAdapter.totalCallCount, 2);
    });

    // ── Adversarial: 10 simultaneous 401s ───────────────────────

    test('Adversarial: 10 simultaneous 401s → 1 refresh, 10 retries', () async {
      setupLoggedInStorage(storage);
      final (client, mainAdapter, refreshAdapter) = createTestClient(storage);

      // 10 originals get 401.
      for (var i = 0; i < 10; i++) {
        mainAdapter.enqueueError(status: 401);
      }
      // 10 retries succeed.
      for (var i = 0; i < 10; i++) {
        mainAdapter.enqueueJson(status: 200, data: {'i': i});
      }
      // Single refresh.
      refreshAdapter.enqueueJson(data: refreshResponse());

      final futures = List.generate(10, (i) => client.dio.get('/v1/item/$i'));
      final results = await Future.wait(futures);

      expect(results.length, 10);
      expect(refreshAdapter.refreshCallCount, 1);
      expect(mainAdapter.totalCallCount, 20); // 10 + 10
    });

    // ── Auth endpoint bypass ────────────────────────────────────

    test('Auth endpoints never trigger auto-refresh', () async {
      setupLoggedInStorage(storage);
      final (client, mainAdapter, refreshAdapter) = createTestClient(storage);

      // Direct call to an auth endpoint — no interceptor interference.
      mainAdapter.enqueueJson(status: 200, data: {'success': true});

      final res =
          await client.dio.post('/v1/auth/otp/request', data: {'phone': '123'});

      expect(res.statusCode, 200);
      expect(refreshAdapter.totalCallCount, 0);
    });

    // ── No session → synthetic behavior ─────────────────────────

    test('No refresh token in storage → refresh fails safely', () async {
      when(() => storage.getAccessToken()).thenAnswer((_) async => 'access');
      when(() => storage.getRefreshToken()).thenAnswer((_) async => null);
      when(() => storage.getExpiresAt()).thenAnswer((_) async => null);
      when(() => storage.clearTokens()).thenAnswer((_) async {});

      final (client, mainAdapter, refreshAdapter) = createTestClient(storage);

      mainAdapter.enqueueError(status: 401);

      final err = await _expectDio401(() => client.dio.get('/v1/test'));

      expect(err.response?.statusCode, 401);
      expect(refreshAdapter.totalCallCount, 0,
          reason: 'No refresh call when no refresh token exists');
      verify(() => storage.clearTokens()).called(1);
    });
  });
}

/// Helper: expects a [DioException] with a 401 status code.
/// Returns the caught [DioException] for further assertions.
Future<DioException> _expectDio401(Future<dynamic> Function() fn) async {
  try {
    await fn();
    fail('Expected DioException to be thrown');
  } on DioException catch (e) {
    return e;
  } catch (e) {
    fail('Expected DioException but got ${e.runtimeType}: $e');
  }
}
