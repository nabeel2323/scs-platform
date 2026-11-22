import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/merchant/merchant_orders_screen.dart';

SubOrder _order() => SubOrder(
      id: 'order-12345678',
      masterOrderId: 'master-1',
      storeId: 'store-1',
      buyerId: 'buyer-1',
      status: 'SUBMITTED',
      fulfillmentMethod: 'DELIVERY',
      subtotalMinor: 10000,
      discountMinor: 0,
      deliveryFeeMinor: 0,
      taxMinor: 0,
      totalMinor: 10000,
      createdAt: '2026-11-22T10:00:00.000Z',
      currency: 'SAR',
      itemCount: 1,
    );

Store _store() => Store(
      id: 'store-1',
      orgId: 'org-1',
      slug: 'visible-store',
      displayName: 'Visible Store',
      currency: 'SAR',
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      createdAt: '2026-11-22T10:00:00.000Z',
    );

void main() {
  testWidgets('keeps the last successful orders visible after a refresh failure',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          activeStoreProvider.overrideWith((ref) async => _store()),
          merchantOrdersProvider.overrideWith((ref) async {
            await ref.watch(activeStoreProvider.future);
            calls++;
            if (calls == 1) return [_order()];
            throw Exception('Orders service unavailable');
          }),
          profileProvider.overrideWith((ref) async => throw Exception('Profile unavailable')),
        ],
        child: const MaterialApp(home: MerchantOrdersScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Order #order-12'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh'));
    await tester.pumpAndSettle();

    expect(find.text('Order #order-12'), findsOneWidget);
    expect(find.textContaining('Orders service unavailable'), findsOneWidget);
    expect(find.textContaining('last successfully loaded results'), findsOneWidget);
    expect(find.text('No orders'), findsNothing);
  });

  testWidgets('shows an initial load error and can recover to a true empty state',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          activeStoreProvider.overrideWith((ref) async => _store()),
          merchantOrdersProvider.overrideWith((ref) async {
            await ref.watch(activeStoreProvider.future);
            calls++;
            if (calls == 1) throw Exception('Orders service unavailable');
            return <SubOrder>[];
          }),
          profileProvider.overrideWith((ref) async => throw Exception('Profile unavailable')),
        ],
        child: const MaterialApp(home: MerchantOrdersScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Could not load orders'), findsOneWidget);
    expect(find.text('No orders'), findsNothing);

    await tester.tap(find.byTooltip('Refresh'));
    await tester.pumpAndSettle();

    expect(find.text('No orders'), findsOneWidget);
  });

  testWidgets('empty order history remains pull-to-refreshable', (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          activeStoreProvider.overrideWith((ref) async => _store()),
          merchantOrdersProvider.overrideWith((ref) async {
            await ref.watch(activeStoreProvider.future);
            calls++;
            if (calls == 1) return <SubOrder>[];
            throw Exception('Orders service unavailable');
          }),
          profileProvider.overrideWith(
            (ref) async => throw Exception('Profile unavailable'),
          ),
        ],
        child: const MaterialApp(home: MerchantOrdersScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('No orders'), findsOneWidget);

    await tester.drag(find.byType(ListView), const Offset(0, 420));
    await tester.pumpAndSettle();

    expect(find.text('No orders'), findsOneWidget);
    expect(find.textContaining('Orders service unavailable'), findsOneWidget);
  });
}
