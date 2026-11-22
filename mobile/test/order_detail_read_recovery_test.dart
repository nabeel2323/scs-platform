import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_core/mobile_core.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/orders/order_detail_screen.dart';
import 'package:scs_platform/services/api_service.dart';
import 'package:scs_platform/services/realtime_service.dart';

SubOrder _order(String status) => SubOrder(
      id: 'order-12345678',
      masterOrderId: 'master-1',
      storeId: 'store-1',
      buyerId: 'buyer-1',
      status: status,
      fulfillmentMethod: 'DELIVERY',
      subtotalMinor: 10000,
      discountMinor: 0,
      deliveryFeeMinor: 0,
      taxMinor: 0,
      totalMinor: 10000,
      createdAt: '2026-11-22T10:00:00.000Z',
      currency: 'SAR',
      currencyFromSnapshot: true,
      storeName: 'Merchant Store',
    );

class _FakeApiService extends ApiService {
  _FakeApiService() : super(Dio());
  int orderCalls = 0;

  @override
  Future<SubOrder> fetchOrder(String id) async {
    orderCalls++;
    if (orderCalls == 2) throw Exception('Order service unavailable');
    return _order(orderCalls >= 3 ? 'CANCELLED' : 'ACCEPTED');
  }

  @override
  Future<List<StatusHistoryEntry>> fetchOrderHistory(String orderId) async => [];

  @override
  Future<TrackingInfo> fetchTracking(String masterOrderId) async =>
      TrackingInfo(masterOrderId: masterOrderId, masterStatus: 'PENDING');

  @override
  Future<List<ReturnRequest>> fetchMyReturns({String? status}) async => [];
}

class _NoTokenAuthStorage extends AuthStorage {
  _NoTokenAuthStorage() : super();
  @override
  Future<String?> getAccessToken() async => null;
}

void main() {
  testWidgets('preserves the last successful order after a refresh failure and retries',
      (tester) async {
    final api = _FakeApiService();
    final realtime = RealtimeService(
      baseUrl: 'http://localhost',
      authStorage: _NoTokenAuthStorage(),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiServiceProvider.overrideWithValue(api),
          profileProvider.overrideWith((ref) async => throw Exception('Profile unavailable')),
          realtimeServiceProvider.overrideWithValue(realtime),
        ],
        child: const MaterialApp(
          home: OrderDetailScreen(orderId: 'order-12345678'),
        ),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Sold by Merchant Store'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh order'));
    await tester.pumpAndSettle();

    expect(find.text('Sold by Merchant Store'), findsOneWidget);
    expect(find.textContaining('Order service unavailable'), findsOneWidget);
    expect(find.textContaining('last successfully loaded order'), findsOneWidget);

    await tester.tap(find.text('Retry order'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Order service unavailable'), findsNothing);
    expect(find.text('Sold by Merchant Store'), findsOneWidget);
  });
}
