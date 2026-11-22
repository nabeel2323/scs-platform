import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/cart/checkout_screen.dart';
import 'package:scs_platform/services/api_service.dart';

class _MockApiService extends Mock implements ApiService {}

Cart _cart() => Cart(
      id: 'cart-1',
      userId: 'buyer-1',
      status: 'ACTIVE',
      totalMinor: 1000,
      items: [
        CartItem(
          id: 'line-1',
          cartId: 'cart-1',
          storeId: 'store-1',
          variantId: 'variant-12345678',
          quantity: 1,
          priceMinor: 1000,
          tierMinQty: 1,
          lineTotalMinor: 1000,
          title: 'Test Product',
          storeName: 'Test Supplier',
          currency: 'SAR',
        ),
      ],
    );

MasterOrder _placedOrder() => MasterOrder(
      id: 'master-12345678',
      buyerId: 'buyer-1',
      status: 'SUBMITTED',
      deliveryAddress: const {'street': '1 Main Street', 'city': 'Riyadh'},
      createdAt: '2026-11-22T10:00:00.000Z',
      subOrders: const [],
    );

void main() {
  testWidgets('reuses key for identical retries and rotates it when payment changes',
      (tester) async {
    final api = _MockApiService();
    final keys = <String>[];
    var checkoutCalls = 0;

    when(() => api.fetchShippingEstimate(
          storeId: any(named: 'storeId'),
          subtotalMinor: any(named: 'subtotalMinor'),
          city: any(named: 'city'),
        )).thenAnswer((_) async => {
          'storeId': 'store-1',
          'deliveryAvailable': false,
          'methods': <dynamic>[],
          'estimateUnavailable': true,
        });

    when(() => api.previewCheckout(
          deliveryAddress: any(named: 'deliveryAddress'),
          shippingSelections: any(named: 'shippingSelections'),
        )).thenAnswer((_) async => {
          'stores': [
            {
              'storeId': 'store-1',
              'currency': 'SAR',
              'subtotalMinor': 1000,
              'deliveryFeeMinor': 0,
              'taxMinor': 0,
              'totalMinor': 1000,
            },
          ],
          'totalsByCurrency': {'SAR': 1000},
          'hasUnpricedAmounts': false,
        });

    when(() => api.checkout(
          deliveryAddress: any(named: 'deliveryAddress'),
          notes: any(named: 'notes'),
          idempotencyKey: any(named: 'idempotencyKey'),
          shippingSelections: any(named: 'shippingSelections'),
          paymentMethod: any(named: 'paymentMethod'),
        )).thenAnswer((invocation) async {
      checkoutCalls++;
      keys.add(invocation.namedArguments[#idempotencyKey] as String);
      if (checkoutCalls < 3) throw Exception('Temporary network failure');
      return _placedOrder();
    });

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiServiceProvider.overrideWithValue(api),
          cartProvider.overrideWith((ref) async => _cart()),
        ],
        child: const MaterialApp(home: CheckoutScreen()),
      ),
    );

    await tester.enterText(find.byType(TextField).at(0), '1 Main Street');
    await tester.enterText(find.byType(TextField).at(1), 'Riyadh');
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Store pickup'));
    await tester.tap(find.text('Review order'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Place order'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Temporary network failure'), findsOneWidget);

    // Same payload retry must keep the same idempotency key.
    await tester.tap(find.text('Place order'));
    await tester.pumpAndSettle();
    expect(checkoutCalls, 2);
    expect(keys[0], keys[1]);
    expect(find.textContaining('Temporary network failure'), findsOneWidget);

    // Payment method changes the checkout payload and therefore must rotate
    // the key before the next submission.
    await tester.ensureVisible(find.text('Bank transfer'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Bank transfer'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Place order'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Place order'));
    await tester.pumpAndSettle();

    expect(checkoutCalls, 3);
    expect(keys[2], isNot(keys[1]));
    expect(find.text('Order placed'), findsOneWidget);
  });
}
