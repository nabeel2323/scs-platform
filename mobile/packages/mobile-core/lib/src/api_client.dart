import 'package:dio/dio.dart';
import 'auth_storage.dart';

/// API client with JWT auth interceptor and automatic token refresh.
class ApiClient {
  ApiClient({required this.baseUrl, required this.authStorage})
      : _dio = Dio(BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 30),
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
        )) {
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await authStorage.getAccessToken();
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401) {
          final refresh = await authStorage.getRefreshToken();
          if (refresh != null) {
            try {
              final res = await Dio(BaseOptions(baseUrl: baseUrl)).post(
                '/v1/auth/refresh',
                data: {'refreshToken': refresh},
              );
              final newAccess = res.data['accessToken'] as String;
              final newRefresh = res.data['refreshToken'] as String;
              await authStorage.saveTokens(
                  accessToken: newAccess, refreshToken: newRefresh);
              error.requestOptions.headers['Authorization'] =
                  'Bearer $newAccess';
              final retry = await _dio.fetch(error.requestOptions);
              return handler.resolve(retry);
            } catch (_) {
              await authStorage.clearTokens();
            }
          }
        }
        handler.next(error);
      },
    ));
  }

  final String baseUrl;
  final AuthStorage authStorage;
  final Dio _dio;
  Dio get dio => _dio;

  void setAccessToken(String token) =>
      _dio.options.headers['Authorization'] = 'Bearer $token';
  void clearAccessToken() => _dio.options.headers.remove('Authorization');
}
