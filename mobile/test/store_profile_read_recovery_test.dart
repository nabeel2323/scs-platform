import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/merchant/store_profile_screen.dart';

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

UserProfile _profile() => UserProfile(
      id: 'merchant-1',
      status: 'ACTIVE',
      createdAt: '2026-11-22T10:00:00.000Z',
    );

void main() {
  testWidgets('preserves store profile after store-directory refresh failure',
      (tester) async {
    var storeCalls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          profileProvider.overrideWith((ref) async => _profile()),
          myStoresProvider.overrideWith((ref) async {
            storeCalls++;
            if (storeCalls == 1) return [_store()];
            throw Exception('Store directory unavailable');
          }),
          storeWarehousesProvider('store-1').overrideWith(
            (ref) async => <Map<String, dynamic>>[],
          ),
        ],
        child: const MaterialApp(home: StoreProfileScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Visible Store'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh store profile'));
    await tester.pumpAndSettle();

    expect(find.text('Visible Store'), findsOneWidget);
    expect(find.textContaining('Store directory unavailable'), findsOneWidget);
    expect(
      find.textContaining('last successfully loaded details'),
      findsOneWidget,
    );
  });

  testWidgets('warehouse lookup failure has a retry action', (tester) async {
    var warehouseCalls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          profileProvider.overrideWith((ref) async => _profile()),
          myStoresProvider.overrideWith((ref) async => [_store()]),
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
        child: const MaterialApp(home: StoreProfileScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(
      find.textContaining('Warehouse directory unavailable'),
      findsOneWidget,
    );

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(find.text('Main Warehouse'), findsOneWidget);
    expect(
      find.textContaining('Warehouse directory unavailable'),
      findsNothing,
    );
  });

  testWidgets('initial store lookup failure can recover to the store profile',
      (tester) async {
    var storeCalls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          profileProvider.overrideWith((ref) async => _profile()),
          myStoresProvider.overrideWith((ref) async {
            storeCalls++;
            if (storeCalls == 1) {
              throw Exception('Store directory unavailable');
            }
            return [_store()];
          }),
          storeWarehousesProvider('store-1').overrideWith(
            (ref) async => <Map<String, dynamic>>[],
          ),
        ],
        child: const MaterialApp(home: StoreProfileScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Could not load store profile'), findsOneWidget);

    await tester.tap(find.text('Retry store profile'));
    await tester.pumpAndSettle();

    expect(find.text('Visible Store'), findsOneWidget);
    expect(find.text('No warehouses yet.'), findsOneWidget);
    expect(find.text('Could not load store profile'), findsNothing);
  });
}
