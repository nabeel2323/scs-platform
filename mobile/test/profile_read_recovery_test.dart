import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/profile/profile_screen.dart';

UserProfile _profile() => UserProfile(
      id: 'user-1',
      status: 'ACTIVE',
      createdAt: '2026-11-22T10:00:00.000Z',
      fullName: 'Nabeel Ahmad',
      email: 'nabeel@example.com',
      locale: 'en',
    );

void main() {
  testWidgets('preserves the last successful profile when refresh fails',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          profileProvider.overrideWith((ref) async {
            calls++;
            if (calls == 1) return _profile();
            throw Exception('Profile service unavailable');
          }),
        ],
        child: const MaterialApp(home: ProfileScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Nabeel Ahmad'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh profile'));
    await tester.pumpAndSettle();

    expect(find.text('Nabeel Ahmad'), findsOneWidget);
    expect(find.textContaining('Profile service unavailable'), findsOneWidget);
    expect(find.textContaining('last successfully loaded details'), findsOneWidget);
  });
}
