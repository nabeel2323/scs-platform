import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/products/product_detail_screen.dart';
import 'package:scs_platform/services/api_service.dart';

class _MockApiService extends Mock implements ApiService {}

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

UserProfile _profile() => UserProfile(
      id: 'buyer-1',
      status: 'ACTIVE',
      createdAt: '2026-11-22T10:00:00.000Z',
    );

void _stubAuxiliaryReads(_MockApiService api) {
  when(() => api.fetchVariantMatrix(any()))
      .thenThrow(Exception('Variant matrix unavailable'));
  when(() => api.fetchProductOffers(any()))
      .thenAnswer((_) async => <Offer>[]);
  when(() => api.fetchProductOffersRanked(any()))
      .thenAnswer((_) async => <RankedProductOffer>[]);
}

void main() {
  testWidgets('keeps product details after refresh failure and avoids rebuild refetches',
      (tester) async {
    var detailCalls = 0;
    final api = _MockApiService();
    _stubAuxiliaryReads(api);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiServiceProvider.overrideWithValue(api),
          profileProvider.overrideWith((ref) async => _profile()),
          productDetailProvider('product-1').overrideWith((ref) async {
            detailCalls++;
            if (detailCalls == 1) return _product();
            throw Exception('Product service unavailable');
          }),
          productMediaProvider('product-1')
              .overrideWith((ref) async => <MediaItem>[]),
          storeReviewsProvider('store-1')
              .overrideWith((ref) async => <Review>[]),
        ],
        child: const MaterialApp(
          home: ProductDetailScreen(productId: 'product-1'),
        ),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Visible Product'), findsOneWidget);
    expect(detailCalls, 1);

    // Matrix/offer completion rebuilds the stateful PDP but must not create a
    // second product-detail HTTP request.
    await tester.pumpAndSettle();
    expect(detailCalls, 1);

    await tester.tap(find.byTooltip('Refresh product'));
    await tester.pumpAndSettle();

    expect(detailCalls, 2);
    expect(find.text('Visible Product'), findsOneWidget);
    expect(find.textContaining('Product service unavailable'), findsOneWidget);
    expect(find.textContaining('last successfully loaded product'), findsOneWidget);
  });

  testWidgets('initial product detail failure is retryable',
      (tester) async {
    var detailCalls = 0;
    final api = _MockApiService();
    _stubAuxiliaryReads(api);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiServiceProvider.overrideWithValue(api),
          profileProvider.overrideWith((ref) async => _profile()),
          productDetailProvider('product-1').overrideWith((ref) async {
            detailCalls++;
            if (detailCalls == 1) {
              throw Exception('Product service unavailable');
            }
            return _product();
          }),
          productMediaProvider('product-1')
              .overrideWith((ref) async => <MediaItem>[]),
          storeReviewsProvider('store-1')
              .overrideWith((ref) async => <Review>[]),
        ],
        child: const MaterialApp(
          home: ProductDetailScreen(productId: 'product-1'),
        ),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Error'), findsOneWidget);
    expect(find.text('Visible Product'), findsNothing);

    await tester.tap(find.byTooltip('Refresh product'));
    await tester.pumpAndSettle();

    expect(find.text('Visible Product'), findsOneWidget);
    expect(detailCalls, 2);
  });
}
