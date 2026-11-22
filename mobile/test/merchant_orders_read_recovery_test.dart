import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/merchant/merchant_orders_screen.dart';

SubOrder _order({String status = 'SUBMITTED'}) => SubOrder(
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

UserProfile _profile(List<String> perms) => UserProfile(
      id: 'merchant-1',
      status: 'ACTIVE',
      createdAt: '2026-11-22T10:00:00.000Z',
      role: 'MERCHANT_OWNER',
      activeOrgId: 'org-1',
      perms: perms,
    );

void main() {
  testWidgets('driver assignment is hidden without its fulfillment permission',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          activeStoreProvider.overrideWith((ref) async => _store()),
          merchantOrdersProvider.overrideWith((ref) async => [_order(status: 'READY')]),
          profileProvider.overrideWith((ref) async => _profile([
                'merchant:orders:read',
                'merchant:orders:write',
              ])),
        ],
        child: const MaterialApp(home: MerchantOrdersScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Driver assignment requires fulfillment:shipments:assign'),
        findsOneWidget);
    expect(find.text('Assign Driver'), findsNothing);
  });

  testWidgets('driver assignment is visible with fulfillment:shipments:assign',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          activeStoreProvider.overrideWith((ref) async => _store()),
          merchantOrdersProvider.overrideWith((ref) async => [_order(status: 'READY')]),
          profileProvider.overrideWith((ref) async => _profile([
                'merchant:orders:read',
                'merchant:orders:write',
                'fulfillment:shipments:assign',
              ])),
        ],
        child: const MaterialApp(home: MerchantOrdersScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Assign Driver'), findsOneWidget);
  });

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
