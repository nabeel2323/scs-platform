import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/merchant/store_profile_screen.dart';

Store _store() => Store(
      id: 'store-1',
      orgId: 'org-1',
      slug: 'merchant-store',
      displayName: 'Merchant Store',
      currency: 'SAR',
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      createdAt: '2026-11-22T10:00:00.000Z',
      address: {'city': 'Riyadh'},
    );

UserProfile _profile() => UserProfile(
      id: 'user-1',
      status: 'ACTIVE',
      createdAt: '2026-11-22T10:00:00.000Z',
      activeOrgId: 'org-1',
      perms: ['merchant:stores:write'],
    );

void main() {
  testWidgets('preserves the last successful same-organization store profile after refresh failure',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          activeStoreProvider.overrideWith((ref) async {
            calls++;
            if (calls == 1) return _store();
            throw Exception('Store service unavailable');
          }),
          profileProvider.overrideWith((ref) async => _profile()),
          storeWarehousesProvider('store-1').overrideWith((ref) async => <Map<String, dynamic>>[]),
        ],
        child: const MaterialApp(home: StoreProfileScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Merchant Store'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh store profile'));
    await tester.pumpAndSettle();

    expect(find.text('Merchant Store'), findsOneWidget);
    expect(find.textContaining('Store service unavailable'), findsOneWidget);
    expect(find.textContaining('last successfully loaded details'), findsOneWidget);
  });
}
