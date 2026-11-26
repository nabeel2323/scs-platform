import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/merchant/offer_detail_screen.dart';

void main() {
  final offer = MerchantOffer(
    id: 'offer-1',
    storeId: 'store-1',
    productId: 'product-1',
    status: 'DRAFT',
    currency: 'SAR',
    basePriceMinor: 10000,
    createdAt: '2026-11-22T10:00:00.000Z',
    updatedAt: '2026-11-22T10:00:00.000Z',
  );

  testWidgets('does not present analytics failure as a successful zero-sales state',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          merchantOfferDetailProvider('offer-1').overrideWith(
            (ref) async => offer,
          ),
          merchantOfferAnalyticsProvider.overrideWith(
            (ref) async => throw Exception('analytics unavailable'),
          ),
          merchantOfferTrendProvider((
            offerId: 'offer-1',
            granularity: 'day',
            days: 30,
          )).overrideWith((ref) async => <OfferTrendPoint>[]),
        ],
        child: const MaterialApp(
          home: OfferDetailScreen(offerId: 'offer-1'),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.textContaining('Performance metrics are unavailable'), findsOneWidget);
    expect(find.text('No sales data yet'), findsNothing);
    expect(find.text('Retry performance'), findsOneWidget);
  });
}
