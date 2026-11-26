import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/driver/driver_shipments_screen.dart';

DriverShipment _shipment() => DriverShipment(
      id: 'shipment-1',
      orderId: 'order-12345678',
      storeId: 'store-1',
      status: 'ASSIGNED',
      assignedAt: '2026-11-22T10:00:00.000Z',
      createdAt: '2026-11-22T10:00:00.000Z',
      updatedAt: '2026-11-22T10:00:00.000Z',
    );

void main() {
  testWidgets('keeps the last successful shipment list after refresh failure',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          driverShipmentsProvider.overrideWith((ref) async {
            calls++;
            if (calls == 1) return [_shipment()];
            throw Exception('Shipment service unavailable');
          }),
          profileProvider.overrideWith((ref) async => throw Exception('Profile unavailable')),
        ],
        child: const MaterialApp(home: DriverShipmentsScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Order #order-12'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh'));
    await tester.pumpAndSettle();

    expect(find.text('Order #order-12'), findsOneWidget);
    expect(find.textContaining('Shipment service unavailable'), findsOneWidget);
    expect(find.textContaining('last successfully loaded results'), findsOneWidget);
    expect(find.text('No shipments'), findsNothing);
  });

  testWidgets('shows a retryable error instead of a false empty state on initial failure',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          driverShipmentsProvider.overrideWith((ref) async {
            calls++;
            if (calls == 1) throw Exception('Shipment service unavailable');
            return <DriverShipment>[];
          }),
          profileProvider.overrideWith((ref) async => throw Exception('Profile unavailable')),
        ],
        child: const MaterialApp(home: DriverShipmentsScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Error'), findsOneWidget);
    expect(find.text('No shipments'), findsNothing);

    await tester.tap(find.byTooltip('Refresh'));
    await tester.pumpAndSettle();

    expect(find.text('No shipments'), findsOneWidget);
  });
}
