import 'dart:async';

import 'package:mobile_core/mobile_core.dart';
import 'package:socket_io_client/socket_io_client.dart' as sio;

/// Payload of an `order.status.changed` realtime event.
class OrderStatusEvent {
  const OrderStatusEvent({
    required this.orderId,
    required this.status,
    required this.timestamp,
  });

  final String orderId;
  final String status;
  final String timestamp;

  factory OrderStatusEvent.fromMap(Map<String, dynamic> m) => OrderStatusEvent(
        orderId: m['orderId'] as String? ?? '',
        status: m['status'] as String? ?? '',
        timestamp: m['timestamp'] as String? ?? '',
      );
}

/// Payload of a `notification.new` realtime event.
class NotificationEvent {
  const NotificationEvent({
    required this.notificationId,
    required this.type,
    required this.title,
    required this.body,
  });

  final String notificationId;
  final String type;
  final String title;
  final String body;

  factory NotificationEvent.fromMap(Map<String, dynamic> m) =>
      NotificationEvent(
        notificationId: m['notificationId'] as String? ?? '',
        type: m['type'] as String? ?? '',
        title: m['title'] as String? ?? '',
        body: m['body'] as String? ?? '',
      );
}

/// Single shared Socket.IO connection to the API `/realtime` gateway (WEB-B6 /
/// realtime gap). Replaces notification / order-status polling on mobile.
///
/// The handshake carries the stored access token; the gateway verifies it
/// (signature + Redis denylist) and auto-binds the socket to its own
/// `user:{id}` room, so [notifications] and the user's own [orderStatus] events
/// arrive with no explicit join. An order-detail screen can additionally
/// subscribe to a specific order room via [watchOrder].
///
/// Events are re-exposed as broadcast streams so any number of screens can
/// listen. Call [connect] after login and [disconnect] on logout.
class RealtimeService {
  RealtimeService({required this.baseUrl, required this.authStorage});

  /// API origin, e.g. `http://10.0.2.2:3000` (Android emulator loopback).
  final String baseUrl;
  final AuthStorage authStorage;

  sio.Socket? _socket;
  final StreamController<OrderStatusEvent> _orderStatus =
      StreamController<OrderStatusEvent>.broadcast();
  final StreamController<NotificationEvent> _notifications =
      StreamController<NotificationEvent>.broadcast();

  /// Order-status changes for every order the user can see.
  Stream<OrderStatusEvent> get orderStatus => _orderStatus.stream;

  /// New in-app notifications for the current user.
  Stream<NotificationEvent> get notifications => _notifications.stream;

  bool get isConnected => _socket?.connected ?? false;

  /// Connect (idempotent). No-op when a socket already exists or when there is
  /// no stored access token (logged-out state).
  Future<void> connect() async {
    if (_socket != null) return;
    final token = await authStorage.getAccessToken();
    if (token == null || token.isEmpty) return;

    final socket = sio.io('$baseUrl/realtime', <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': false,
      'auth': {'token': token},
    });
    _socket = socket;

    socket.on('order.status.changed', (data) {
      if (data is Map) {
        _orderStatus
            .add(OrderStatusEvent.fromMap(Map<String, dynamic>.from(data)));
      }
    });
    socket.on('notification.new', (data) {
      if (data is Map) {
        _notifications
            .add(NotificationEvent.fromMap(Map<String, dynamic>.from(data)));
      }
    });

    socket.connect();
  }

  /// Subscribe the socket to a specific order room (order-detail screen) so any
  /// authenticated viewer — not just the buyer — receives live status.
  void watchOrder(String orderId) {
    _socket?.emit('join', {
      'rooms': ['order:$orderId']
    });
  }

  /// Leave a previously watched order room.
  void unwatchOrder(String orderId) {
    _socket?.emit('leave', {
      'rooms': ['order:$orderId']
    });
  }

  /// Tear down and reconnect with a fresh token (e.g. after a refresh/switchOrg).
  Future<void> reconnect() async {
    await disconnect();
    await connect();
  }

  /// Disconnect the socket, keeping the broadcast streams open for reuse.
  Future<void> disconnect() async {
    _socket?.dispose();
    _socket = null;
  }

  /// Release the socket and close the broadcast streams (provider teardown).
  Future<void> dispose() async {
    await disconnect();
    await _orderStatus.close();
    await _notifications.close();
  }
}
