import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/organizations/org_detail_screen.dart';

Organization _organization() => Organization(
      id: 'org-1',
      name: 'Taif Merchant',
      type: 'MERCHANT',
      country: 'SA',
      createdAt: '2026-11-22T10:00:00.000Z',
    );
OrgMember _member() => OrgMember(
      userId: 'user-1',
      orgId: 'org-1',
      roleId: 'OWNER',
      userName: 'Alice Admin',
      userEmail: 'alice@example.com',
    );

void main() {
  testWidgets('preserves organization details and members independently on refresh failure',
      (tester) async {
    var orgCalls = 0;
    var memberCalls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          orgDetailProvider('org-1').overrideWith((ref) async {
            orgCalls++;
            if (orgCalls == 1) return _organization();
            throw Exception('Organization details unavailable');
          }),
          orgMembersProvider('org-1').overrideWith((ref) async {
            memberCalls++;
            if (memberCalls == 1) return [_member()];
            throw Exception('Organization members unavailable');
          }),
          profileProvider.overrideWith((ref) async => throw Exception('Profile unavailable')),
        ],
        child: const MaterialApp(home: OrgDetailScreen(orgId: 'org-1')),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Taif Merchant'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh organization'));
    await tester.pumpAndSettle();

    expect(find.text('Taif Merchant'), findsOneWidget);
    expect(find.textContaining('Organization details unavailable'), findsOneWidget);

    await tester.tap(find.text('Members'));
    await tester.pumpAndSettle();

    expect(find.text('Alice Admin'), findsOneWidget);
    expect(find.textContaining('Organization members unavailable'), findsOneWidget);
  });
}
