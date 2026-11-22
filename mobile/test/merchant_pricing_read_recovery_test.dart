import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/merchant/merchant_pricing_screen.dart';
import 'package:scs_platform/screens/merchant/price_list_detail_screen.dart';

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

PriceList _list() => PriceList(
      id: 'price-list-1',
      storeId: 'store-1',
      name: 'Standard B2B',
      currency: 'SAR',
      channel: 'B2B',
      audience: 'PUBLIC',
      priority: 1,
    );

PriceTier _tier() => PriceTier(
      id: 'tier-1',
      priceListId: 'price-list-1',
      variantId: 'variant-1',
      minQty: 5,
      unitPriceMinor: 900,
      variantTitle: 'Main Variant',
      productTitle: 'Visible Product',
    );

UserProfile _profile() => UserProfile(
      id: 'merchant-1',
      status: 'ACTIVE',
      createdAt: '2026-11-22T10:00:00.000Z',
    );

void main() {
  testWidgets('preserves price lists after a failed refresh', (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          profileProvider.overrideWith((ref) async => _profile()),
          activeStoreProvider.overrideWith((ref) async => _store()),
          merchantPriceListsProvider.overrideWith((ref) async {
            await ref.watch(activeStoreProvider.future);
            calls++;
            if (calls == 1) return [_list()];
            throw Exception('Price list service unavailable');
          }),
        ],
        child: const MaterialApp(home: MerchantPricingScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Standard B2B'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh price lists'));
    await tester.pumpAndSettle();

    expect(find.text('Standard B2B'), findsOneWidget);
    expect(find.textContaining('Price list service unavailable'), findsOneWidget);
    expect(find.textContaining('last successful results'), findsOneWidget);
    expect(find.text('No price lists yet'), findsNothing);
  });

  testWidgets('initial price-list failure can recover to a true empty state',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          profileProvider.overrideWith((ref) async => _profile()),
          activeStoreProvider.overrideWith((ref) async => _store()),
          merchantPriceListsProvider.overrideWith((ref) async {
            await ref.watch(activeStoreProvider.future);
            calls++;
            if (calls == 1) throw Exception('Price list service unavailable');
            return <PriceList>[];
          }),
        ],
        child: const MaterialApp(home: MerchantPricingScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Could not load price lists'), findsOneWidget);
    expect(find.text('No price lists yet'), findsNothing);

    await tester.tap(find.byTooltip('Refresh price lists'));
    await tester.pumpAndSettle();

    expect(find.text('No price lists yet'), findsOneWidget);
    expect(find.text('Could not load price lists'), findsNothing);
  });

  testWidgets('preserves quantity tiers after a failed refresh', (tester) async {
    var tierCalls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          profileProvider.overrideWith((ref) async => _profile()),
          priceListDetailProvider('price-list-1').overrideWith(
            (ref) async => _list(),
          ),
          priceListTiersProvider('price-list-1').overrideWith((ref) async {
            tierCalls++;
            if (tierCalls == 1) return [_tier()];
            throw Exception('Tier service unavailable');
          }),
        ],
        child: const MaterialApp(
          home: PriceListDetailScreen(priceListId: 'price-list-1'),
        ),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.textContaining('Main Variant'), findsOneWidget);
    expect(find.text('1 tiers'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh price list'));
    await tester.pumpAndSettle();

    expect(find.text('Main Variant'), findsOneWidget);
    expect(find.textContaining('Tier service unavailable'), findsOneWidget);
    expect(find.text('1 tiers'), findsOneWidget);
    expect(find.text('No quantity tiers'), findsNothing);
  });

  testWidgets('initial tier failure is retryable and does not report zero tiers',
      (tester) async {
    var tierCalls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          profileProvider.overrideWith((ref) async => _profile()),
          priceListDetailProvider('price-list-1').overrideWith(
            (ref) async => _list(),
          ),
          priceListTiersProvider('price-list-1').overrideWith((ref) async {
            tierCalls++;
            if (tierCalls == 1) throw Exception('Tier service unavailable');
            return <PriceTier>[];
          }),
        ],
        child: const MaterialApp(
          home: PriceListDetailScreen(priceListId: 'price-list-1'),
        ),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Could not load tiers'), findsOneWidget);
    expect(find.text('0 tiers'), findsNothing);

    await tester.tap(find.byTooltip('Refresh price list'));
    await tester.pumpAndSettle();

    expect(find.text('No quantity tiers'), findsOneWidget);
    expect(find.text('0 tiers'), findsOneWidget);
    expect(find.text('Could not load tiers'), findsNothing);
  });
}
