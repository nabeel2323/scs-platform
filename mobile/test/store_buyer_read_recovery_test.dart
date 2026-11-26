import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/stores/store_detail_screen.dart';
import 'package:scs_platform/screens/stores/stores_list_screen.dart';

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

Product _product() => Product(
      id: 'product-1',
      storeId: 'store-1',
      slug: 'visible-product',
      title: 'Visible Product',
      status: 'ACTIVE',
      isAvailable: true,
      moq: 1,
      createdAt: '2026-11-22T10:00:00.000Z',
    );

void main() {
  testWidgets('preserves the last successful store directory after refresh failure',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          storesProvider.overrideWith((ref) async {
            calls++;
            if (calls == 1) return [_store()];
            throw Exception('Store directory unavailable');
          }),
        ],
        child: const MaterialApp(home: StoresListScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Visible Store'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh stores'));
    await tester.pumpAndSettle();

    expect(find.text('Visible Store'), findsOneWidget);
    expect(find.textContaining('Store directory unavailable'), findsOneWidget);
    expect(find.textContaining('last successfully loaded list'), findsOneWidget);
  });

  testWidgets('initial store directory failure is retryable and not empty',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          storesProvider.overrideWith((ref) async {
            calls++;
            if (calls == 1) throw Exception('Store directory unavailable');
            return <Store>[];
          }),
        ],
        child: const MaterialApp(home: StoresListScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Error'), findsOneWidget);
    expect(find.text('No stores'), findsNothing);

    await tester.tap(find.byTooltip('Refresh stores'));
    await tester.pumpAndSettle();

    expect(find.text('No stores'), findsOneWidget);
  });

  testWidgets('preserves the last successful store catalogue after refresh failure',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          buyerStoreProductsProvider('store-1').overrideWith((ref) async {
            calls++;
            if (calls == 1) return [_product()];
            throw Exception('Store catalogue unavailable');
          }),
        ],
        child: const MaterialApp(
          home: StoreDetailScreen(storeId: 'store-1'),
        ),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Visible Product'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh store products'));
    await tester.pumpAndSettle();

    expect(find.text('Visible Product'), findsOneWidget);
    expect(find.textContaining('Store catalogue unavailable'), findsOneWidget);
    expect(find.textContaining('last successfully loaded catalogue'), findsOneWidget);
  });

  testWidgets('initial store catalogue failure is retryable and not empty',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          buyerStoreProductsProvider('store-1').overrideWith((ref) async {
            calls++;
            if (calls == 1) throw Exception('Store catalogue unavailable');
            return <Product>[];
          }),
        ],
        child: const MaterialApp(
          home: StoreDetailScreen(storeId: 'store-1'),
        ),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Error'), findsOneWidget);
    expect(find.text('No products'), findsNothing);

    await tester.tap(find.byTooltip('Refresh store products'));
    await tester.pumpAndSettle();

    expect(find.text('No products'), findsOneWidget);
  });
}
