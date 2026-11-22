import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/services/api_service.dart';

class MockReturnsDio extends Mock implements Dio {}

Map<String, dynamic> returnPayload({
  String id = 'return-1',
  String subOrderId = 'order-1',
  String status = 'REQUESTED',
}) => {
  'id': id, 'subOrderId': subOrderId, 'status': status, 'reason': 'OTHER',
  'description': 'Opened package', 'requestedRefundMinor': 1250,
  'shippingTrackingNumber': null,
  'createdAt': '2026-11-22T10:00:00.000Z',
  'updatedAt': '2026-11-22T10:00:00.000Z',
  'items': [{
    'id': 'return-item-1', 'returnRequestId': id,
    'orderItemId': 'order-item-1', 'quantity': 2,
    'condition': null, 'inventoryItemId': null,
  }],
  'events': [{
    'id': 'event-1', 'returnRequestId': id, 'eventType': 'REQUESTED',
    'fromStatus': null, 'toStatus': status, 'actorId': 'buyer-1',
    'actorType': 'BUYER', 'notes': 'Opened package',
    'createdAt': '2026-11-22T10:00:00.000Z',
  }],
};

void main() {
  late MockReturnsDio dio;
  late ApiService api;
  setUp(() { dio = MockReturnsDio(); api = ApiService(dio); });

  group('Buyer return models', () {
    test('parses detailed and list response shapes', () {
      final detailed = ReturnRequest.fromJson(returnPayload());
      expect(detailed.id, 'return-1');
      expect(detailed.subOrderId, 'order-1');
      expect(detailed.requestedRefundMinor, 1250);
      expect(detailed.items.single.orderItemId, 'order-item-1');
      expect(detailed.events.single.toStatus, 'REQUESTED');
      final listed = ReturnRequest.fromJson({
        'id': 'return-2', 'subOrderId': 'order-1',
        'status': 'MERCHANT_APPROVED', 'reason': 'CUSTOMER_REQUEST',
      });
      expect(listed.items, isEmpty);
      expect(listed.events, isEmpty);
      expect(listed.requestedRefundMinor, 0);
    });
  });

  group('Buyer return endpoints', () {
    test('fetchMyReturns uses buyer-scoped list with optional status', () async {
      when(() => dio.get('/v1/returns/my', queryParameters: {'status': 'REQUESTED'}))
        .thenAnswer((_) async => Response(
          data: [returnPayload()],
          requestOptions: RequestOptions(path: '/v1/returns/my'),
          statusCode: 200,
        ));
      final returns = await api.fetchMyReturns(status: 'REQUESTED');
      expect(returns.single.id, 'return-1');
      verify(() => dio.get('/v1/returns/my', queryParameters: {'status': 'REQUESTED'})).called(1);
    });

    test('fetchReturn reads the existing return detail endpoint', () async {
      when(() => dio.get('/v1/returns/return-1')).thenAnswer((_) async => Response(
        data: returnPayload(),
        requestOptions: RequestOptions(path: '/v1/returns/return-1'),
        statusCode: 200,
      ));
      final request = await api.fetchReturn('return-1');
      expect(request.items.single.quantity, 2);
      verify(() => dio.get('/v1/returns/return-1')).called(1);
    });

    test('createReturn sends the order-item line contract', () async {
      when(() => dio.post('/v1/returns', data: any(named: 'data')))
        .thenAnswer((_) async => Response(
          data: returnPayload(),
          requestOptions: RequestOptions(path: '/v1/returns'),
          statusCode: 201,
        ));
      final request = await api.createReturn(
        subOrderId: 'order-1',
        reason: 'PRODUCT_NOT_AS_DESCRIBED',
        description: 'Damaged item',
        lines: [{'orderItemId': 'order-item-1', 'quantity': 1}],
      );
      expect(request.id, 'return-1');
      verify(() => dio.post('/v1/returns', data: {
        'subOrderId': 'order-1',
        'reason': 'PRODUCT_NOT_AS_DESCRIBED',
        'description': 'Damaged item',
        'lines': [{'orderItemId': 'order-item-1', 'quantity': 1}],
      })).called(1);
    });

    test('cancelReturn posts the buyer cancel transition', () async {
      when(() => dio.post('/v1/returns/return-1/cancel')).thenAnswer((_) async => Response(
        data: returnPayload(status: 'CANCELLED'),
        requestOptions: RequestOptions(path: '/v1/returns/return-1/cancel'),
        statusCode: 200,
      ));
      final updated = await api.cancelReturn('return-1');
      expect(updated.status, 'CANCELLED');
      verify(() => dio.post('/v1/returns/return-1/cancel')).called(1);
    });

    test('markReturnShipped passes optional tracking to buyer transition', () async {
      when(() => dio.post('/v1/returns/return-1/shipped', data: {'trackingNumber': 'TRACK-123'}))
        .thenAnswer((_) async => Response(
          data: returnPayload(status: 'BUYER_SHIPPED'),
          requestOptions: RequestOptions(path: '/v1/returns/return-1/shipped'),
          statusCode: 200,
        ));
      final updated = await api.markReturnShipped('return-1', trackingNumber: 'TRACK-123');
      expect(updated.status, 'BUYER_SHIPPED');
      verify(() => dio.post('/v1/returns/return-1/shipped',
        data: {'trackingNumber': 'TRACK-123'})).called(1);
    });
  });
}
