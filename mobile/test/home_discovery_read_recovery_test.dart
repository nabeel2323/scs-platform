import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/home/home_screen.dart';

UserProfile _profile() => UserProfile(
      id: 'buyer-1',
      status: 'ACTIVE',
      createdAt: '2026-11-22T10:00:00.000Z',
      perms: const [
        'catalog:products:read',
        'merchant:stores:read',
      ],
    );

Category _category() => Category(
      id: 'category-1',
      name: 'Computers',
      slug: 'computers',
      path: '/computers',
      productCount: 3,
      isActive: true,
    );

void main() {
  testWidgets('preserves home categories after refresh failure and does not fake unread zero',
      (tester) async {
    var categoryCalls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          profileProvider.overrideWith((ref) async => _profile()),
          unreadCountProvider.overrideWith((ref) async {
            throw Exception('Unread count unavailable');
          }),
          categoriesProvider.overrideWith((ref) async {
            categoryCalls++;
            if (categoryCalls == 1) return [_category()];
            throw Exception('Category service unavailable');
          }),
          featuredProductsProvider.overrideWith(
            (ref) async => SearchResult(
              products: const [],
              total: 0,
              query: '',
            ),
          ),
          storesProvider.overrideWith((ref) async => <Store>[]),
        ],
        child: const MaterialApp(home: HomeScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Computers'), findsOneWidget);
    expect(find.text('0'), findsNothing);

    await tester.tap(find.byTooltip('Refresh home'));
    await tester.pumpAndSettle();

    expect(find.text('Computers'), findsOneWidget);
    expect(find.textContaining('Category service unavailable'), findsOneWidget);
    expect(find.textContaining('last successfully loaded list'), findsOneWidget);
  });

  testWidgets('initial home category failure is visible and retryable',
      (tester) async {
    var categoryCalls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          profileProvider.overrideWith((ref) async => _profile()),
          unreadCountProvider.overrideWith((ref) async => 0),
          categoriesProvider.overrideWith((ref) async {
            categoryCalls++;
            if (categoryCalls == 1) {
              throw Exception('Category service unavailable');
            }
            return <Category>[];
          }),
          featuredProductsProvider.overrideWith(
            (ref) async => SearchResult(
              products: const [],
              total: 0,
              query: '',
            ),
          ),
          storesProvider.overrideWith((ref) async => <Store>[]),
        ],
        child: const MaterialApp(home: HomeScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.textContaining('Categories unavailable'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh home'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Categories unavailable'), findsNothing);
    expect(find.text('Computers'), findsNothing);
  });
}
