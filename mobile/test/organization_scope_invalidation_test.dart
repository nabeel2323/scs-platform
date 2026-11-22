import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';

Store _store(String id, String orgId) => Store(
      id: id,
      orgId: orgId,
      slug: id,
      displayName: id,
      currency: 'SAR',
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      createdAt: '2026-11-22T10:00:00.000Z',
    );

UserProfile _profile() => UserProfile(
      id: 'user-1',
      status: 'ACTIVE',
      createdAt: '2026-11-22T10:00:00.000Z',
    );

class _RunInvalidation extends ConsumerWidget {
  final bool resetSession;
  const _RunInvalidation({this.resetSession = false});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (resetSession) {
      resetIdentityProviders(ref);
    } else {
      invalidateOrganizationScopedProviders(ref);
    }
    return const SizedBox.shrink();
  }
}

void main() {
  test('active store resolution never falls back across organizations',
      () async {
    final container = ProviderContainer(
      overrides: [
        myStoresProvider.overrideWith((ref) async => [
              _store('store-old', 'org-old'),
              _store('store-new', 'org-new'),
            ]),
      ],
    );
    addTearDown(container.dispose);

    container.read(activeOrgIdProvider.notifier).state = 'org-new';
    final activeStore = await container.read(activeStoreProvider.future);
    expect(activeStore?.id, 'store-new');

    container.read(activeOrgIdProvider.notifier).state = 'org-missing';
    final missingStore = await container.read(activeStoreProvider.future);
    expect(missingStore, isNull);
  });

  testWidgets('organization switch invalidates org caches but retains buyer orders',
      (tester) async {
    var profileReads = 0;
    var organizationReads = 0;
    var storeReads = 0;
    var merchantOrderReads = 0;
    var customerReads = 0;
    var warehouseReads = 0;
    var buyerOrderReads = 0;

    final container = ProviderContainer(
      overrides: [
        profileProvider.overrideWith((ref) async {
          profileReads++;
          return _profile();
        }),
        myOrganizationsProvider.overrideWith((ref) async {
          organizationReads++;
          return <OrgMembership>[];
        }),
        myStoresProvider.overrideWith((ref) async {
          storeReads++;
          return <Store>[];
        }),
        merchantOrdersProvider.overrideWith((ref) async {
          merchantOrderReads++;
          return <SubOrder>[];
        }),
        merchantCustomersProvider.overrideWith((ref) async {
          customerReads++;
          return <CustomerSummary>[];
        }),
        storeWarehousesProvider('store-1').overrideWith((ref) async {
          warehouseReads++;
          return <Map<String, dynamic>>[];
        }),
        ordersProvider.overrideWith((ref) async {
          buyerOrderReads++;
          return <SubOrder>[];
        }),
      ],
    );
    addTearDown(container.dispose);

    await container.read(profileProvider.future);
    await container.read(myOrganizationsProvider.future);
    await container.read(myStoresProvider.future);
    await container.read(merchantOrdersProvider.future);
    await container.read(merchantCustomersProvider.future);
    await container.read(storeWarehousesProvider('store-1').future);
    await container.read(ordersProvider.future);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: _RunInvalidation()),
      ),
    );
    await tester.pumpAndSettle();

    await container.read(profileProvider.future);
    await container.read(myOrganizationsProvider.future);
    await container.read(myStoresProvider.future);
    await container.read(merchantOrdersProvider.future);
    await container.read(merchantCustomersProvider.future);
    await container.read(storeWarehousesProvider('store-1').future);

    expect(profileReads, 2);
    expect(organizationReads, 2);
    expect(storeReads, 2);
    expect(merchantOrderReads, 2);
    expect(customerReads, 2);
    expect(warehouseReads, 2);
    expect(buyerOrderReads, 1);

    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('session reset clears identity and invalidates user-level reads',
      (tester) async {
    var buyerOrderReads = 0;
    final container = ProviderContainer(
      overrides: [
        ordersProvider.overrideWith((ref) async {
          buyerOrderReads++;
          return <SubOrder>[];
        }),
      ],
    );
    addTearDown(container.dispose);

    container.read(currentUserPhoneProvider.notifier).state = '+966500000001';
    container.read(currentUserEmailProvider.notifier).state = 'old@example.test';
    container.read(activeOrgIdProvider.notifier).state = 'old-org';
    await container.read(ordersProvider.future);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(
          home: _RunInvalidation(resetSession: true),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(container.read(currentUserPhoneProvider), '');
    expect(container.read(currentUserEmailProvider), isNull);
    expect(container.read(activeOrgIdProvider), isNull);

    await container.read(ordersProvider.future);
    expect(buyerOrderReads, 2);

    await tester.pumpWidget(const SizedBox.shrink());
  });
}
