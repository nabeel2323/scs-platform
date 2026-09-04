import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'api_service.dart';

/// FCM push notification service.
///
/// Handles:
/// - Firebase initialization
/// - Permission request
/// - FCM token registration with the backend
/// - Token refresh listener (re-registers when FCM rotates tokens)
/// - Foreground message display via local notifications
///
/// Backend integration:
/// - Calls `POST /v1/me/devices` via [ApiService.registerDevice]
/// - Calls `DELETE /v1/me/devices/:token` via [ApiService.unregisterDevice]
/// - Backend's `sendPush` reads `device_tokens` table and dispatches via FCM
class PushNotificationService {
  PushNotificationService(this._api);
  final ApiService _api;

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  String? _currentToken;
  bool _initialized = false;

  /// Initialize Firebase, request permissions, register token.
  /// Call this after successful OTP verification.
  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    try {
      // Initialize Firebase (requires google-services.json / GoogleService-Info.plist)
      await Firebase.initializeApp();

      // Request permissions
      final settings = await _messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );

      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        debugPrint('[Push] Permission denied — push disabled');
        return;
      }

      // Setup local notifications for foreground messages
      await _setupLocalNotifications();

      // Get and register the FCM token
      await _registerCurrentToken();

      // Listen for token refresh
      _messaging.onTokenRefresh.listen(_onTokenRefresh);

      // Handle foreground messages
      FirebaseMessaging.onMessage.listen(_onForegroundMessage);

      // Handle background message tap
      FirebaseMessaging.onMessageOpenedApp.listen(_onMessageOpened);

      // Check if app was opened from terminated state
      final initialMessage = await _messaging.getInitialMessage();
      if (initialMessage != null) {
        _handleMessageNavigation(initialMessage);
      }

      debugPrint('[Push] Initialized successfully');
    } catch (e) {
      debugPrint('[Push] Initialization failed: $e');
      // Non-fatal — app works without push
    }
  }

  /// Unregister device token on logout.
  Future<void> shutdown() async {
    if (_currentToken != null) {
      try {
        await _api.unregisterDevice(_currentToken!);
      } catch (e) {
        debugPrint('[Push] Failed to unregister device: $e');
      }
      _currentToken = null;
    }
    _initialized = false;
  }

  Future<void> _setupLocalNotifications() async {
    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    const settings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );
    await _localNotifications.initialize(settings);
  }

  Future<void> _registerCurrentToken() async {
    final token = await _messaging.getToken();
    if (token == null) {
      debugPrint('[Push] No FCM token obtained');
      return;
    }

    _currentToken = token;
    final platform = Platform.isIOS ? 'ios' : 'android';

    try {
      await _api.registerDevice(
        token: token,
        platform: platform,
      );
      debugPrint('[Push] Token registered: ${token.substring(0, 20)}...');
    } catch (e) {
      debugPrint('[Push] Failed to register token: $e');
    }
  }

  void _onTokenRefresh(String newToken) {
    debugPrint('[Push] Token refreshed, re-registering...');
    _currentToken = newToken;
    final platform = Platform.isIOS ? 'ios' : 'android';
    _api.registerDevice(token: newToken, platform: platform).catchError((e) {
      debugPrint('[Push] Failed to re-register refreshed token: $e');
    });
  }

  void _onForegroundMessage(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null) return;

    _localNotifications.show(
      notification.hashCode,
      notification.title,
      notification.body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'default_channel',
          'Default',
          channelDescription: 'Default notification channel',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      payload: message.data['type'] ?? 'notification',
    );
  }

  void _onMessageOpened(RemoteMessage message) {
    _handleMessageNavigation(message);
  }

  void _handleMessageNavigation(RemoteMessage message) {
    final data = message.data;
    final type = data['type'];
    // Navigation is handled by the app's router based on notification type.
    // The app can listen to a stream or check a flag on startup.
    debugPrint('[Push] Message opened: type=$type, data=$data');
  }
}
