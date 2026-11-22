import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/merchant/offer_detail_screen.dart';

MerchantOffer _offer() => MerchantOffer(
      id: 'offer-1',
      storeId: 'store-1',
      productId: 'product-1',
      status: 'ACTIVE',
      currency: 'SAR',
      basePriceMinor: 1000,
      moq: 1,
      isAvailable: true,
      createdAt: '2026-11-22T10:00:00.000Z',
      updatedAt: '2026-11-22T10:00:00.000Z',
    );

OfferAnalyticsRow _analytics() => OfferAnalyticsRow(
      offerId: 'offer-1',
      storeId: 'store-1',
      productId: 'product-1',
      status: 'ACTIVE',
      currency: 'SAR',
      productTitle: 'Visible Product',
      ordersCount: 2,
      unitsSold: 4,
      revenueMinor: 4000,
    );

UserProfile _profile() => UserProfile(
      id: 'merchant-1',
      status: 'ACTIVE',
      createdAt: '2026-11-22T10:00:00.000Z',
    );

void main() {
  testWidgets('preserves offer and analytics after refresh failures',
      (tester) async {
    var offerCalls = 0;
    var analyticsCalls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          profileProvider.overrideWith((ref) async => _profile()),
          merchantOfferDetailProvider('offer-1').overrideWith((ref) async {
            offerCalls++;
            if (offerCalls == 1) return _offer();
            throw Exception('Offer service unavailable');
          }),
          merchantOfferAnalyticsProvider.overrideWith((ref) async {
            analyticsCalls++;
            if (analyticsCalls == 1) return [_analytics()];
            throw Exception('Offer analytics unavailable');
          }),
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
    expect(find.text('Visible Product'), findsOneWidget);
    expect(find.textContaining('Orders'), findsWidgets);

    await tester.tap(find.byTooltip('Refresh offer'));
    await tester.pumpAndSettle();

    expect(find.text('Visible Product'), findsOneWidget);
    expect(find.textContaining('Offer service unavailable'), findsOneWidget);
    expect(find.textContaining('Offer analytics unavailable'), findsOneWidget);
    expect(find.textContaining('last successfully loaded offer'), findsOneWidget);
    expect(
      find.textContaining('last successful metrics'),
      findsOneWidget,
    );
  });

  testWidgets('initial offer failure is retryable and missing analytics is not zero',
      (tester) async {
    var offerCalls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          profileProvider.overrideWith((ref) async => _profile()),
          merchantOfferDetailProvider('offer-1').overrideWith((ref) async {
            offerCalls++;
            if (offerCalls == 1) throw Exception('Offer service unavailable');
            return _offer();
          }),
          merchantOfferAnalyticsProvider.overrideWith(
            (ref) async => <OfferAnalyticsRow>[],
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
    expect(find.text('Could not load offer'), findsOneWidget);
    expect(find.text('Visible Product'), findsNothing);

    await tester.tap(find.byTooltip('Refresh offer'));
    await tester.pumpAndSettle();

    expect(find.text('Visible Product'), findsNothing);
    expect(find.textContaining('Sales are not assumed to be zero'), findsOneWidget);
  });
}
