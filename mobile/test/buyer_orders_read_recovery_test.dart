import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/orders/orders_list_screen.dart';

SubOrder _order() => SubOrder(
      id: 'order-12345678',
      masterOrderId: 'master-123',
      storeId: 'store-1',
      buyerId: 'buyer-1',
      status: 'PENDING',
      fulfillmentMethod: 'DELIVERY',
      subtotalMinor: 12000,
      discountMinor: 0,
      deliveryFeeMinor: 0,
      taxMinor: 0,
      totalMinor: 12000,
      createdAt: '2026-11-22T10:00:00.000Z',
      currency: 'SAR',
      storeName: 'Visible Seller',
      itemCount: 1,
    );

void main() {
  testWidgets('preserves the last successful buyer orders after refresh failure',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ordersProvider.overrideWith((ref) async {
            calls++;
            if (calls == 1) return [_order()];
            throw Exception('Order history unavailable');
          }),
        ],
        child: const MaterialApp(home: OrdersListScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.textContaining('Visible Seller'), findsOneWidget);
    expect(find.text('Order #order-12'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh orders'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Visible Seller'), findsOneWidget);
    expect(find.textContaining('Order history unavailable'), findsOneWidget);
    expect(find.textContaining('last successfully loaded list'), findsOneWidget);
  });

  testWidgets('initial buyer order failure is retryable and not an empty history',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ordersProvider.overrideWith((ref) async {
            calls++;
            if (calls == 1) throw Exception('Order history unavailable');
            return <SubOrder>[];
          }),
        ],
        child: const MaterialApp(home: OrdersListScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Error'), findsOneWidget);
    expect(find.text('No orders yet'), findsNothing);

    await tester.tap(find.byTooltip('Refresh orders'));
    await tester.pumpAndSettle();

    expect(find.text('No orders yet'), findsOneWidget);
  });

  testWidgets('keeps the selected filter empty state distinct from a read failure',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ordersProvider.overrideWith((ref) async {
            calls++;
            if (calls == 1) return [_order()];
            throw Exception('Order history unavailable');
          }),
        ],
        child: const MaterialApp(home: OrdersListScreen()),
      ),
    );

    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ChoiceChip, 'Completed'));
    await tester.pumpAndSettle();

    expect(find.text('Nothing here'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh orders'));
    await tester.pumpAndSettle();

    expect(find.text('Nothing here'), findsOneWidget);
    expect(find.textContaining('Order history unavailable'), findsOneWidget);
  });
}
