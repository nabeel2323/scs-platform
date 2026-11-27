import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/merchant/inventory_screen.dart';

final _store = Store(
  id: 'store-1',
  orgId: 'org-1',
  slug: 'merchant-store',
  displayName: 'Merchant Store',
  currency: 'SAR',
  status: 'ACTIVE',
  verificationStatus: 'VERIFIED',
  createdAt: '2026-11-22T10:00:00.000Z',
);
final _inventory = PaginatedInventory(
  data: [
    InventoryItem(
      id: 'inventory-1',
      variantId: 'variant-12345678',
      warehouseId: 'warehouse-1',
      qtyOnHand: 10,
      qtyReserved: 2,
      reorderPoint: 3,
    ),
  ],
  total: 1,
);

void main() {
  testWidgets('preserves the last successful inventory page after refresh failure',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          activeStoreProvider.overrideWith((ref) async => _store),
          storeInventoryProvider((storeId: 'store-1', page: 0)).overrideWith((ref) async {
            calls++;
            if (calls == 1) return _inventory;
            throw Exception('Inventory service unavailable');
          }),
          storeWarehousesProvider('store-1').overrideWith((ref) async => <Map<String, dynamic>>[]),
          profileProvider.overrideWith((ref) async => throw Exception('Profile unavailable')),
        ],
        child: const MaterialApp(home: InventoryScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.textContaining('Variant variant-'), findsOneWidget);
    expect(find.textContaining('Available: 8'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh inventory'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Variant variant-'), findsOneWidget);
    expect(find.textContaining('Inventory service unavailable'), findsOneWidget);
    expect(find.textContaining('last successfully loaded page'), findsOneWidget);
  });

  testWidgets('shows a retryable error on initial inventory failure',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          activeStoreProvider.overrideWith((ref) async => _store),
          storeInventoryProvider((storeId: 'store-1', page: 0)).overrideWith((ref) async {
            calls++;
            if (calls == 1) throw Exception('Inventory service unavailable');
            return PaginatedInventory(data: [], total: 0);
          }),
          storeWarehousesProvider('store-1').overrideWith((ref) async => <Map<String, dynamic>>[]),
          profileProvider.overrideWith((ref) async => throw Exception('Profile unavailable')),
        ],
        child: const MaterialApp(home: InventoryScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Could not load inventory'), findsOneWidget);
    expect(find.text('No inventory'), findsNothing);

    await tester.tap(find.byTooltip('Refresh inventory'));
    await tester.pumpAndSettle();

    expect(find.text('No inventory'), findsOneWidget);
  });
}
