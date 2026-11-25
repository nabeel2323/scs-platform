import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/merchant/merchant_catalog_screen.dart';

UserProfile _profile() => UserProfile(
      id: 'merchant-1',
      status: 'ACTIVE',
      createdAt: '2026-11-22T10:00:00.000Z',
      perms: const [
        'catalog:products:read',
        'merchant:products:write',
      ],
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
  testWidgets('preserves merchant products after catalogue refresh failure',
      (tester) async {
    var productCalls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          profileProvider.overrideWith((ref) async => _profile()),
          activeStoreProvider.overrideWith((ref) async => _store()),
          storeProductsProvider('store-1').overrideWith((ref) async {
            productCalls++;
            if (productCalls == 1) return [_product()];
            throw Exception('Merchant catalogue unavailable');
          }),
        ],
        child: const MaterialApp(home: MerchantCatalogScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Visible Product'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh catalog'));
    await tester.pumpAndSettle();

    expect(find.text('Visible Product'), findsOneWidget);
    expect(find.textContaining('Merchant catalogue unavailable'), findsOneWidget);
    expect(
      find.textContaining('last successfully loaded catalogue'),
      findsOneWidget,
    );
    expect(find.text('No products'), findsNothing);
  });

  testWidgets('initial merchant catalogue failure is retryable and not empty',
      (tester) async {
    var productCalls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          profileProvider.overrideWith((ref) async => _profile()),
          activeStoreProvider.overrideWith((ref) async => _store()),
          storeProductsProvider('store-1').overrideWith((ref) async {
            productCalls++;
            if (productCalls == 1) {
              throw Exception('Merchant catalogue unavailable');
            }
            return <Product>[];
          }),
        ],
        child: const MaterialApp(home: MerchantCatalogScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Error'), findsOneWidget);
    expect(find.text('No products'), findsNothing);

    await tester.tap(find.byTooltip('Refresh catalog'));
    await tester.pumpAndSettle();

    expect(find.text('No products'), findsOneWidget);
  });
}
