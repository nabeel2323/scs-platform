import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/notifications/notifications_screen.dart';
import 'package:scs_platform/services/api_service.dart';
import 'package:scs_platform/services/realtime_service.dart';

class _MockApiService extends Mock implements ApiService {}

class _MockRealtimeService extends Mock implements RealtimeService {}

AppNotification _notification({String? readAt}) => AppNotification(
      id: 'notification-1',
      userId: 'buyer-1',
      type: 'ORDER_UPDATE',
      channel: 'IN_APP',
      template: 'ORDER_STATUS',
      title: 'Important update',
      body: 'Your order has changed status.',
      status: 'SENT',
      readAt: readAt,
      createdAt: '2026-11-22T10:00:00.000Z',
    );

_MockRealtimeService _realtime() {
  final realtime = _MockRealtimeService();
  when(() => realtime.notifications)
      .thenAnswer((_) => const Stream<NotificationEvent>.empty());
  when(() => realtime.connect()).thenAnswer((_) async {});
  return realtime;
}

void main() {
  testWidgets('preserves the last successful notifications after refresh failure',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          realtimeServiceProvider.overrideWithValue(_realtime()),
          notificationsProvider.overrideWith((ref) async {
            calls++;
            if (calls == 1) return [_notification()];
            throw Exception('Notification service unavailable');
          }),
        ],
        child: const MaterialApp(home: NotificationsScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Important update'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh notifications'));
    await tester.pumpAndSettle();

    expect(find.text('Important update'), findsOneWidget);
    expect(find.textContaining('Notification service unavailable'), findsOneWidget);
    expect(find.textContaining('last successfully loaded list'), findsOneWidget);
  });

  testWidgets('initial notifications failure is retryable and not empty',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          realtimeServiceProvider.overrideWithValue(_realtime()),
          notificationsProvider.overrideWith((ref) async {
            calls++;
            if (calls == 1) throw Exception('Notification service unavailable');
            return <AppNotification>[];
          }),
        ],
        child: const MaterialApp(home: NotificationsScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Error'), findsOneWidget);
    expect(find.text('No notifications'), findsNothing);

    await tester.tap(find.byTooltip('Refresh notifications'));
    await tester.pumpAndSettle();

    expect(find.text('No notifications'), findsOneWidget);
  });

  testWidgets('individual mark-read failure is shown without an uncaught action error',
      (tester) async {
    final api = _MockApiService();
    when(() => api.markNotificationRead('notification-1'))
        .thenThrow(Exception('Notification update unavailable'));

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          realtimeServiceProvider.overrideWithValue(_realtime()),
          apiServiceProvider.overrideWithValue(api),
          notificationsProvider.overrideWith(
            (ref) async => [_notification()],
          ),
        ],
        child: const MaterialApp(home: NotificationsScreen()),
      ),
    );

    await tester.pumpAndSettle();
    await tester.tap(find.text('Important update'));
    await tester.pumpAndSettle();

    expect(
      find.textContaining('Could not mark notification as read'),
      findsOneWidget,
    );
    expect(find.text('Important update'), findsOneWidget);
  });
}
