import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/cart/cart_screen.dart';

Cart _cart({List<CartItem>? items}) => Cart(
      id: 'cart-1',
      userId: 'buyer-1',
      status: 'ACTIVE',
      totalMinor: items?.fold<int>(0, (sum, item) => sum + item.lineTotalMinor) ?? 0,
      items: items ?? [],
    );

CartItem _item() => CartItem(
      id: 'cart-item-1',
      cartId: 'cart-1',
      storeId: 'store-1',
      variantId: 'variant-1',
      quantity: 2,
      priceMinor: 5000,
      tierMinQty: 1,
      lineTotalMinor: 10000,
      title: 'Sample Product',
      storeName: 'Merchant Store',
      currency: 'SAR',
    );

void main() {
  testWidgets('preserves the last successful cart after a refresh failure',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          cartProvider.overrideWith((ref) async {
            calls++;
            if (calls == 1) return _cart(items: [_item()]);
            throw Exception('Cart service unavailable');
          }),
          cartValidationProvider.overrideWith((ref) async => {
                'stale': <dynamic>[],
                'repriced': <dynamic>[],
              }),
        ],
        child: const MaterialApp(home: CartScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Sample Product'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh cart'));
    await tester.pumpAndSettle();

    expect(find.text('Sample Product'), findsOneWidget);
    expect(find.textContaining('Cart service unavailable'), findsOneWidget);
    expect(find.textContaining('last successfully loaded cart'), findsOneWidget);
    expect(find.text('Cart is empty'), findsNothing);
  });

  testWidgets('shows a retryable initial read error and then a true empty cart',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          cartProvider.overrideWith((ref) async {
            calls++;
            if (calls == 1) throw Exception('Cart service unavailable');
            return _cart();
          }),
          cartValidationProvider.overrideWith((ref) async => {
                'stale': <dynamic>[],
                'repriced': <dynamic>[],
              }),
        ],
        child: const MaterialApp(home: CartScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Error'), findsOneWidget);
    expect(find.text('Cart is empty'), findsNothing);

    await tester.tap(find.byTooltip('Refresh cart'));
    await tester.pumpAndSettle();

    expect(find.text('Cart is empty'), findsOneWidget);
  });
}
