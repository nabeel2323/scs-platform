import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/merchant/merchant_customers_screen.dart';

CustomerSummary _customer() => CustomerSummary(
      buyerId: 'buyer-1',
      buyerName: 'Visible Buyer',
      buyerPhone: '+966500000001',
      buyerEmail: 'buyer@example.test',
      orderCount: 3,
      totalSpentMinor: 25000,
      lastOrderAt: '2026-11-22T10:00:00.000Z',
    );

void main() {
  testWidgets('preserves customers and statistics after refresh failure',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          merchantCustomersProvider.overrideWith((ref) async {
            calls++;
            if (calls == 1) return [_customer()];
            throw Exception('Customer directory unavailable');
          }),
        ],
        child: const MaterialApp(home: MerchantCustomersScreen()),
      ),
    );

    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView), const Offset(0, -500));
    await tester.pumpAndSettle();
    expect(find.textContaining('Visible Buyer'), findsOneWidget);
    expect(find.text('Customers'), findsWidgets);
    expect(find.text('3'), findsWidgets);

    await tester.tap(find.byTooltip('Refresh customers'));
    await tester.pumpAndSettle();

    expect(find.text('Visible Buyer'), findsOneWidget);
    expect(find.textContaining('Customer directory unavailable'), findsOneWidget);
    expect(find.textContaining('last successful results'), findsOneWidget);
    expect(find.text('No customers yet'), findsNothing);
  });

  testWidgets('initial customer failure can recover to a true empty state',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          merchantCustomersProvider.overrideWith((ref) async {
            calls++;
            if (calls == 1) throw Exception('Customer directory unavailable');
            return <CustomerSummary>[];
          }),
        ],
        child: const MaterialApp(home: MerchantCustomersScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Could not load customers'), findsOneWidget);
    expect(find.text('No customers yet'), findsNothing);

    await tester.tap(find.byTooltip('Refresh customers'));
    await tester.pumpAndSettle();

    expect(find.text('No customers yet'), findsOneWidget);
    expect(find.text('Could not load customers'), findsNothing);
  });
}
