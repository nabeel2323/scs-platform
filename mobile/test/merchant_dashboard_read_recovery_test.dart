import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/merchant/merchant_dashboard_screen.dart';

UserProfile _profile() => UserProfile(
      id: 'merchant-1',
      status: 'ACTIVE',
      activeOrgId: 'org-1',
      perms: const ['merchant:stores:read'],
      createdAt: '2026-11-22T10:00:00.000Z',
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

void main() {
  testWidgets('preserves merchant identity and storefront after refresh failures',
      (tester) async {
    var profileCalls = 0;
    var storeCalls = 0;

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          profileProvider.overrideWith((ref) async {
            profileCalls++;
            if (profileCalls == 1) return _profile();
            throw Exception('Merchant profile unavailable');
          }),
          activeStoreProvider.overrideWith((ref) async {
            storeCalls++;
            if (storeCalls == 1) return _store();
            throw Exception('Storefront unavailable');
          }),
          merchantKpisProvider.overrideWith(
            (ref) async => MerchantKpis.empty,
          ),
        ],
        child: const MaterialApp(home: MerchantDashboardScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Visible Store'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh merchant dashboard'));
    await tester.pumpAndSettle();

    expect(find.text('Visible Store'), findsOneWidget);
    expect(find.textContaining('Merchant profile unavailable'), findsOneWidget);
    expect(find.textContaining('Storefront unavailable'), findsOneWidget);
    expect(
      find.textContaining('last successfully loaded'),
      findsNWidgets(2),
    );
  });
}
