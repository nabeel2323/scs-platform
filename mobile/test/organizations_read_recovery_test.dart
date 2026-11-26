import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/organizations/organizations_screen.dart';

OrgMembership _membership() => OrgMembership(
      orgId: 'org-1',
      role: 'OWNER',
      orgName: 'Taif Merchant',
      orgType: 'MERCHANT',
    );

void main() {
  testWidgets('preserves the last successful organization list after refresh failure',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          myOrganizationsProvider.overrideWith((ref) async {
            calls++;
            if (calls == 1) return [_membership()];
            throw Exception('Organization service unavailable');
          }),
          profileProvider.overrideWith((ref) async => throw Exception('Profile unavailable')),
        ],
        child: const MaterialApp(home: OrganizationsScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Taif Merchant'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh organizations'));
    await tester.pumpAndSettle();

    expect(find.text('Taif Merchant'), findsOneWidget);
    expect(find.textContaining('Organization service unavailable'), findsOneWidget);
    expect(find.textContaining('last successfully loaded list'), findsOneWidget);
    expect(find.text('No organizations'), findsNothing);
  });

  testWidgets('shows a retryable initial failure and then a true empty state',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          myOrganizationsProvider.overrideWith((ref) async {
            calls++;
            if (calls == 1) throw Exception('Organization service unavailable');
            return <OrgMembership>[];
          }),
          profileProvider.overrideWith((ref) async => throw Exception('Profile unavailable')),
        ],
        child: const MaterialApp(home: OrganizationsScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Error'), findsOneWidget);
    expect(find.text('No organizations'), findsNothing);

    await tester.tap(find.byTooltip('Refresh organizations'));
    await tester.pumpAndSettle();

    expect(find.text('No organizations'), findsOneWidget);
  });
}
