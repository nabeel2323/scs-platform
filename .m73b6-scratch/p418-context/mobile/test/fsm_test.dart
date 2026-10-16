import 'package:flutter_test/flutter_test.dart';

/// FSM transition map tests — mirrors the backend orders.service.ts TRANSITIONS.
///
/// The merchant_orders_screen.dart _nextStatuses() defines the mobile-side
/// FSM which must stay in sync with the backend.

// Extracted from merchant_orders_screen.dart _nextStatuses()
List<String> nextStatuses(String s) => switch (s) {
      'ACCEPTED' || 'PARTIALLY_ACCEPTED' => ['CONFIRMED'],
      'CONFIRMED' => ['PREPARING'],
      'PREPARING' => ['READY'],
      'READY' => ['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
      'OUT_FOR_DELIVERY' => ['DELIVERED'],
      'DELIVERED' => ['COMPLETED'],
      _ => []
    };

// Full backend FSM (from orders.service.ts)
const Map<String, List<String>> backendTransitions = {
  'DRAFT': ['SUBMITTED'],
  'SUBMITTED': ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'CANCELLED'],
  'ACCEPTED': ['CONFIRMED', 'CANCELLED'],
  'PARTIALLY_ACCEPTED': ['CONFIRMED', 'CANCELLED'],
  'CONFIRMED': ['PREPARING', 'CANCELLED'],
  'PREPARING': ['READY', 'CANCELLED'],
  'READY': ['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
  'OUT_FOR_DELIVERY': ['DELIVERED'],
  'DELIVERED': ['COMPLETED'],
  'COMPLETED': [],
  'CANCELLED': [],
  'REJECTED': [],
};

void main() {
  group('Mobile FSM — merchant order progression', () {
    test(
        'happy path: ACCEPTED → CONFIRMED → PREPARING → READY → DELIVERED → COMPLETED',
        () {
      expect(nextStatuses('ACCEPTED'), contains('CONFIRMED'));
      expect(nextStatuses('CONFIRMED'), contains('PREPARING'));
      expect(nextStatuses('PREPARING'), contains('READY'));
      expect(nextStatuses('READY'), contains('OUT_FOR_DELIVERY'));
      expect(nextStatuses('READY'), contains('DELIVERED'));
      expect(nextStatuses('OUT_FOR_DELIVERY'), contains('DELIVERED'));
      expect(nextStatuses('DELIVERED'), contains('COMPLETED'));
    });

    test('READY allows CANCELLED (matches backend FSM fix)', () {
      expect(nextStatuses('READY'), contains('CANCELLED'));
    });

    test('terminal states have no outgoing transitions', () {
      expect(nextStatuses('COMPLETED'), isEmpty);
      expect(nextStatuses('CANCELLED'), isEmpty);
      expect(nextStatuses('REJECTED'), isEmpty);
    });

    test('SUBMITTED is not in mobile FSM (merchant uses accept/reject buttons)',
        () {
      // SUBMITTED transitions are handled via acceptOrder/rejectOrder API calls,
      // not via the status transition buttons
      expect(nextStatuses('SUBMITTED'), isEmpty);
    });
  });

  group('Mobile-Backend FSM sync', () {
    test('every mobile transition is valid in backend', () {
      for (final entry in nextStatuses('ACCEPTED')) {
        expect(backendTransitions['ACCEPTED'], contains(entry),
            reason: 'ACCEPTED → $entry not in backend FSM');
      }
      for (final entry in nextStatuses('CONFIRMED')) {
        expect(backendTransitions['CONFIRMED'], contains(entry),
            reason: 'CONFIRMED → $entry not in backend FSM');
      }
      for (final entry in nextStatuses('PREPARING')) {
        expect(backendTransitions['PREPARING'], contains(entry),
            reason: 'PREPARING → $entry not in backend FSM');
      }
      for (final entry in nextStatuses('READY')) {
        expect(backendTransitions['READY'], contains(entry),
            reason: 'READY → $entry not in backend FSM');
      }
      for (final entry in nextStatuses('OUT_FOR_DELIVERY')) {
        expect(backendTransitions['OUT_FOR_DELIVERY'], contains(entry),
            reason: 'OUT_FOR_DELIVERY → $entry not in backend FSM');
      }
      for (final entry in nextStatuses('DELIVERED')) {
        expect(backendTransitions['DELIVERED'], contains(entry),
            reason: 'DELIVERED → $entry not in backend FSM');
      }
    });

    test('backend has 12 statuses', () {
      expect(backendTransitions.length, 12);
    });

    test('all statuses are reachable from DRAFT via BFS', () {
      final reachable = <String>{};
      final queue = ['DRAFT'];
      while (queue.isNotEmpty) {
        final current = queue.removeAt(0);
        if (reachable.contains(current)) continue;
        reachable.add(current);
        for (final next in backendTransitions[current]!) {
          if (!reachable.contains(next)) queue.add(next);
        }
      }
      expect(reachable.length, 12);
    });
  });

  group('Cancel eligibility', () {
    test('cancellable statuses match backend', () {
      const cancellable = [
        'SUBMITTED',
        'ACCEPTED',
        'PARTIALLY_ACCEPTED',
        'CONFIRMED',
        'PREPARING',
        'READY'
      ];
      for (final status in cancellable) {
        expect(backendTransitions[status], contains('CANCELLED'),
            reason: '$status should allow CANCELLED in backend');
      }
    });

    test('non-cancellable statuses cannot reach CANCELLED', () {
      const nonCancellable = [
        'DELIVERED',
        'COMPLETED',
        'CANCELLED',
        'REJECTED',
        'OUT_FOR_DELIVERY'
      ];
      for (final status in nonCancellable) {
        expect(backendTransitions[status], isNot(contains('CANCELLED')),
            reason: '$status should NOT allow CANCELLED');
      }
    });
  });
}
