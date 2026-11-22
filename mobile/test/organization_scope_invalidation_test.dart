import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';

UserProfile _profile() => UserProfile(
      id: 'user-1',
      status: 'ACTIVE',
      createdAt: '2026-11-22T10:00:00.000Z',
    );

void main() {
  test('organization switch invalidates organization-scoped caches only',
      () async {
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

    await Future.wait([
      container.read(profileProvider.future),
      container.read(myOrganizationsProvider.future),
      container.read(myStoresProvider.future),
      container.read(merchantOrdersProvider.future),
      container.read(merchantCustomersProvider.future),
      container.read(storeWarehousesProvider('store-1').future),
      container.read(ordersProvider.future),
    ]);

    invalidateOrganizationScopedProviders(container);

    await Future.wait([
      container.read(profileProvider.future),
      container.read(myOrganizationsProvider.future),
      container.read(myStoresProvider.future),
      container.read(merchantOrdersProvider.future),
      container.read(merchantCustomersProvider.future),
      container.read(storeWarehousesProvider('store-1').future),
    ]);

    expect(profileReads, 2);
    expect(organizationReads, 2);
    expect(storeReads, 2);
    expect(merchantOrderReads, 2);
    expect(customerReads, 2);
    expect(warehouseReads, 2);
    expect(buyerOrderReads, 1);
  });

  test('session reset clears identities and invalidates user-level reads',
      () async {
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

    resetIdentityProviders(container);

    expect(container.read(currentUserPhoneProvider), '');
    expect(container.read(currentUserEmailProvider), isNull);
    expect(container.read(activeOrgIdProvider), isNull);

    await container.read(ordersProvider.future);
    expect(buyerOrderReads, 2);
  });
}
