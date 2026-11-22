import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/merchant/inventory_screen.dart';

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

InventoryItem _item() => InventoryItem(
      id: 'inventory-1',
      variantId: 'v-123456789',
      warehouseId: 'warehouse-1',
      qtyOnHand: 12,
      qtyReserved: 2,
      reorderPoint: 3,
    );

PaginatedInventory _inventory() =>
    PaginatedInventory(data: [_item()], total: 1);

void main() {
  testWidgets('preserves inventory when its refresh fails', (tester) async {
    var inventoryCalls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          profileProvider.overrideWith(
            (ref) async => UserProfile(
              id: 'merchant-1',
              status: 'ACTIVE',
              createdAt: '2026-11-22T10:00:00.000Z',
            ),
          ),
          activeStoreProvider.overrideWith((ref) async => _store()),
          storeInventoryProvider((storeId: 'store-1', page: 0))
              .overrideWith((ref) async {
            inventoryCalls++;
            if (inventoryCalls == 1) return _inventory();
            throw Exception('Inventory service unavailable');
          }),
          storeWarehousesProvider('store-1').overrideWith(
            (ref) async => [
              {'id': 'warehouse-1', 'name': 'Main Warehouse'},
            ],
          ),
        ],
        child: const MaterialApp(home: InventoryScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.textContaining('v-123456'), findsOneWidget);
    expect(find.text('Main Warehouse'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh inventory'));
    await tester.pumpAndSettle();

    expect(find.textContaining('v-123456'), findsOneWidget);
    expect(find.text('Main Warehouse'), findsOneWidget);
    expect(find.textContaining('Inventory service unavailable'), findsOneWidget);
    expect(
      find.textContaining('last successfully loaded page'),
      findsOneWidget,
    );
    expect(find.text('No inventory'), findsNothing);
  });

  testWidgets('warehouse lookup failure is visible and retryable',
      (tester) async {
    var warehouseCalls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          profileProvider.overrideWith(
            (ref) async => UserProfile(
              id: 'merchant-1',
              status: 'ACTIVE',
              createdAt: '2026-11-22T10:00:00.000Z',
            ),
          ),
          activeStoreProvider.overrideWith((ref) async => _store()),
          storeInventoryProvider((storeId: 'store-1', page: 0))
              .overrideWith((ref) async => _inventory()),
          storeWarehousesProvider('store-1').overrideWith((ref) async {
            warehouseCalls++;
            if (warehouseCalls == 1) {
              throw Exception('Warehouse directory unavailable');
            }
            return [
              {'id': 'warehouse-1', 'name': 'Main Warehouse'},
            ];
          }),
        ],
        child: const MaterialApp(home: InventoryScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(
      find.textContaining('Warehouse directory unavailable'),
      findsOneWidget,
    );

    await tester.tap(find.text('Retry warehouses'));
    await tester.pumpAndSettle();

    expect(find.text('Main Warehouse'), findsOneWidget);
    expect(
      find.textContaining('Warehouse directory unavailable'),
      findsNothing,
    );
  });

  testWidgets('initial store lookup failure can recover to a true empty state',
      (tester) async {
    var storeCalls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          profileProvider.overrideWith(
            (ref) async => UserProfile(
              id: 'merchant-1',
              status: 'ACTIVE',
              createdAt: '2026-11-22T10:00:00.000Z',
            ),
          ),
          activeStoreProvider.overrideWith((ref) async {
            storeCalls++;
            if (storeCalls == 1) {
              throw Exception('Store directory unavailable');
            }
            return _store();
          }),
          storeInventoryProvider((storeId: 'store-1', page: 0)).overrideWith(
            (ref) async => PaginatedInventory(data: const [], total: 0),
          ),
          storeWarehousesProvider('store-1').overrideWith(
            (ref) async => <Map<String, dynamic>>[],
          ),
        ],
        child: const MaterialApp(home: InventoryScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Could not load store'), findsOneWidget);
    expect(find.text('No inventory'), findsNothing);

    await tester.tap(find.text('Retry store'));
    await tester.pumpAndSettle();

    expect(find.text('No inventory'), findsOneWidget);
    expect(find.text('Could not load store'), findsNothing);
  });
}
