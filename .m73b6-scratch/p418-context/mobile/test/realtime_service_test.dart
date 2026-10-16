import 'package:flutter_test/flutter_test.dart';
import 'package:scs_platform/services/realtime_service.dart';

/// Realtime event-mapping tests (WEB-B6). The Socket.IO payloads pushed by the
/// API gateway are decoded into typed events; missing fields must fall back to
/// empty strings so a partial payload never throws in a listener.
void main() {
  group('OrderStatusEvent.fromMap', () {
    test('parses all fields', () {
      final e = OrderStatusEvent.fromMap({
        'orderId': 'o-1',
        'status': 'ACCEPTED',
        'timestamp': '2026-09-08T00:00:00.000Z',
      });
      expect(e.orderId, 'o-1');
      expect(e.status, 'ACCEPTED');
      expect(e.timestamp, '2026-09-08T00:00:00.000Z');
    });

    test('defaults missing fields to empty strings', () {
      final e = OrderStatusEvent.fromMap(<String, dynamic>{});
      expect(e.orderId, '');
      expect(e.status, '');
      expect(e.timestamp, '');
    });

    test('ignores unexpected extra fields', () {
      final e = OrderStatusEvent.fromMap({
        'orderId': 'o-2',
        'status': 'READY',
        'timestamp': 't',
        'extra': 123,
      });
      expect(e.orderId, 'o-2');
      expect(e.status, 'READY');
    });
  });

  group('NotificationEvent.fromMap', () {
    test('parses all fields', () {
      final e = NotificationEvent.fromMap({
        'notificationId': 'n-1',
        'type': 'TRANSACTIONAL',
        'title': 'Order Accepted',
        'body': 'Your order has been accepted.',
      });
      expect(e.notificationId, 'n-1');
      expect(e.type, 'TRANSACTIONAL');
      expect(e.title, 'Order Accepted');
      expect(e.body, 'Your order has been accepted.');
    });

    test('defaults missing fields to empty strings', () {
      final e = NotificationEvent.fromMap(<String, dynamic>{});
      expect(e.notificationId, '');
      expect(e.type, '');
      expect(e.title, '');
      expect(e.body, '');
    });
  });
}
