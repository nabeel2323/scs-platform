import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/merchant/merchant_dashboard_screen.dart';

final _profile = UserProfile(
  id: 'user-1',
  status: 'ACTIVE',
  createdAt: '2026-11-22T10:00:00.000Z',
  activeOrgId: 'org-1',
  perms: [
    'merchant:orders:read',
    'merchant:inventory:read',
    'merchant:stores:read',
  ],
);
final _store = Store(
  id: 'store-1',
  orgId: 'org-1',
  slug: 'merchant-store',
  displayName: 'Merchant Store',
  currency: 'SAR',
  status: 'ACTIVE',
  verificationStatus: 'VERIFIED',
  createdAt: '2026-11-22T10:00:00.000Z',
);
const _kpis = MerchantKpis(
  revenueMinor: 12000,
  unitsSold: 4,
  ordersCount: 3,
  pendingCount: 1,
  lowStockCount: 2,
  currency: 'SAR',
);

void main() {
  testWidgets('preserves last successful KPI values when refresh fails',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          profileProvider.overrideWith((ref) async => _profile),
          activeStoreProvider.overrideWith((ref) async => _store),
          merchantKpisProvider.overrideWith((ref) async {
            calls++;
            if (calls == 1) return _kpis;
            throw Exception('Merchant analytics unavailable');
          }),
        ],
        child: const MaterialApp(home: MerchantDashboardScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('120.00 SAR'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh'));
    await tester.pumpAndSettle();

    expect(find.text('120.00 SAR'), findsOneWidget);
    expect(find.textContaining('Merchant analytics unavailable'), findsOneWidget);
    expect(find.textContaining('last successful values'), findsOneWidget);
  });
}
