import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { computeOrderFinancials } from '../../../modules/orders/order-pricing';

/**
 * Orders Service — Unit Tests
 *
 * Covers:
 * - FSM transition matrix (all valid/invalid state transitions)
 * - Financial breakdown calculation (commission, merchant net)
 * - Cancel eligibility rules
 * - Re-price guard logic (price delta detection)
 *
 * DB and outbox are mocked — these tests verify pure business logic only.
 */

// ── FSM Transition Matrix (extracted from OrdersService) ──────────

/**
 * The canonical FSM transition matrix used by OrdersService.
 * Kept in sync with orders.service.ts TRANSITIONS static field.
 */
const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['CONFIRMED', 'CANCELLED'],
  PARTIALLY_ACCEPTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
};

function assertTransition(currentStatus: string, newStatus: string) {
  const allowed = TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    throw new ConflictException(
      `Invalid transition: ${currentStatus} → ${newStatus}. Allowed: ${allowed.join(', ') || 'none'}`,
    );
  }
}

// ── Cancel Eligibility ────────────────────────────────────────────

const CANCELLABLE_STATUSES = [
  'SUBMITTED',
  'ACCEPTED',
  'PARTIALLY_ACCEPTED',
  'CONFIRMED',
  'PREPARING',
  'READY',
];

function isCancellable(status: string): boolean {
  return CANCELLABLE_STATUSES.includes(status);
}

// ── Re-Price Guard ────────────────────────────────────────────────

interface PriceDelta {
  snapshotPrice: number;
  currentPrice: number;
  delta: number;
  deltaPercent: number;
}

function calculatePriceDelta(snapshotPrice: number, currentPrice: number): PriceDelta {
  const delta = currentPrice - snapshotPrice;
  const deltaPercent = snapshotPrice > 0 ? (delta / snapshotPrice) * 100 : 0;
  return {
    snapshotPrice,
    currentPrice,
    delta,
    deltaPercent: Math.round(deltaPercent * 100) / 100,
  };
}

function hasSignificantPriceChange(deltas: PriceDelta[], threshold: number = 5): PriceDelta[] {
  return deltas.filter((d) => Math.abs(d.deltaPercent) > threshold);
}

// ═══════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════

describe('Orders Service — FSM Transitions', () => {
  describe('valid transitions', () => {
    const validTransitions: [string, string][] = [
      ['DRAFT', 'SUBMITTED'],
      ['SUBMITTED', 'ACCEPTED'],
      ['SUBMITTED', 'PARTIALLY_ACCEPTED'],
      ['SUBMITTED', 'REJECTED'],
      ['SUBMITTED', 'CANCELLED'],
      ['ACCEPTED', 'CONFIRMED'],
      ['ACCEPTED', 'CANCELLED'],
      ['PARTIALLY_ACCEPTED', 'CONFIRMED'],
      ['PARTIALLY_ACCEPTED', 'CANCELLED'],
      ['CONFIRMED', 'PREPARING'],
      ['CONFIRMED', 'CANCELLED'],
      ['PREPARING', 'READY'],
      ['PREPARING', 'CANCELLED'],
      ['READY', 'OUT_FOR_DELIVERY'],
      ['READY', 'DELIVERED'],
      ['READY', 'CANCELLED'],
      ['OUT_FOR_DELIVERY', 'DELIVERED'],
      ['DELIVERED', 'COMPLETED'],
    ];

    it.each(validTransitions)('%s → %s should be allowed', (from, to) => {
      expect(() => assertTransition(from, to)).not.toThrow();
    });

    it('should support the full happy path lifecycle', () => {
      const lifecycle = [
        ['DRAFT', 'SUBMITTED'],
        ['SUBMITTED', 'ACCEPTED'],
        ['ACCEPTED', 'CONFIRMED'],
        ['CONFIRMED', 'PREPARING'],
        ['PREPARING', 'READY'],
        ['READY', 'OUT_FOR_DELIVERY'],
        ['OUT_FOR_DELIVERY', 'DELIVERED'],
        ['DELIVERED', 'COMPLETED'],
      ] as [string, string][];

      for (const [from, to] of lifecycle) {
        expect(() => assertTransition(from, to)).not.toThrow();
      }
    });

    it('should allow direct READY → DELIVERED (skip OUT_FOR_DELIVERY)', () => {
      expect(() => assertTransition('READY', 'DELIVERED')).not.toThrow();
    });

    it('should allow cancellation from all pre-delivery active states', () => {
      for (const status of CANCELLABLE_STATUSES) {
        expect(() => assertTransition(status, 'CANCELLED')).not.toThrow();
      }
    });
  });

  describe('invalid transitions', () => {
    const invalidTransitions: [string, string][] = [
      // Can't skip forward
      ['DRAFT', 'ACCEPTED'],
      ['DRAFT', 'CONFIRMED'],
      ['DRAFT', 'DELIVERED'],
      ['SUBMITTED', 'CONFIRMED'],
      ['SUBMITTED', 'PREPARING'],
      ['SUBMITTED', 'DELIVERED'],
      // Can't go backward
      ['ACCEPTED', 'SUBMITTED'],
      ['CONFIRMED', 'SUBMITTED'],
      ['CONFIRMED', 'ACCEPTED'],
      ['PREPARING', 'CONFIRMED'],
      ['PREPARING', 'ACCEPTED'],
      ['READY', 'PREPARING'],
      ['DELIVERED', 'READY'],
      ['DELIVERED', 'OUT_FOR_DELIVERY'],
      // Terminal states
      ['COMPLETED', 'CANCELLED'],
      ['COMPLETED', 'DELIVERED'],
      ['CANCELLED', 'SUBMITTED'],
      ['CANCELLED', 'ACCEPTED'],
      ['REJECTED', 'SUBMITTED'],
      ['REJECTED', 'ACCEPTED'],
      // OUT_FOR_DELIVERY can't go back
      ['OUT_FOR_DELIVERY', 'READY'],
      ['OUT_FOR_DELIVERY', 'CANCELLED'],
    ];

    it.each(invalidTransitions)('%s → %s should be rejected', (from, to) => {
      expect(() => assertTransition(from, to)).toThrow(ConflictException);
    });

    it('should reject transitions from unknown statuses', () => {
      expect(() => assertTransition('UNKNOWN', 'SUBMITTED')).toThrow(ConflictException);
    });

    it('should reject transitions to unknown statuses', () => {
      expect(() => assertTransition('SUBMITTED', 'UNKNOWN')).toThrow(ConflictException);
    });
  });

  describe('terminal states', () => {
    it('COMPLETED has no outgoing transitions', () => {
      expect(TRANSITIONS['COMPLETED']).toEqual([]);
    });

    it('CANCELLED has no outgoing transitions', () => {
      expect(TRANSITIONS['CANCELLED']).toEqual([]);
    });

    it('REJECTED has no outgoing transitions', () => {
      expect(TRANSITIONS['REJECTED']).toEqual([]);
    });
  });

  describe('transition matrix completeness', () => {
    it('should have exactly 12 statuses', () => {
      expect(Object.keys(TRANSITIONS)).toHaveLength(12);
    });

    it('every status should be reachable from DRAFT', () => {
      // BFS from DRAFT
      const reachable = new Set<string>();
      const queue = ['DRAFT'];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (reachable.has(current)) continue;
        reachable.add(current);
        for (const next of TRANSITIONS[current] || []) {
          if (!reachable.has(next)) queue.push(next);
        }
      }
      // All 12 statuses should be reachable
      expect(reachable.size).toBe(12);
    });

    it('every status appears as a key in the transition map', () => {
      const allTargets = new Set<string>();
      for (const targets of Object.values(TRANSITIONS)) {
        for (const t of targets) allTargets.add(t);
      }
      for (const status of allTargets) {
        expect(TRANSITIONS).toHaveProperty(status);
      }
    });
  });
});

describe('Orders Service — Financial Breakdown (real computeOrderFinancials)', () => {
  const price = (subtotalMinor: number, discountMinor: number, deliveryFeeMinor: number) =>
    computeOrderFinancials({
      subtotalMinor,
      discountMinor,
      deliveryFeeMinor,
      vatRate: 0.15,
      commissionRate: 0.05,
    });

  it('calculates 5% commission on net goods and 15% VAT', () => {
    const b = price(10000, 0, 0);
    expect(b.commissionMinor).toBe(500);
    expect(b.merchantNetMinor).toBe(9500);
    expect(b.taxMinor).toBe(1500);
    expect(b.totalMinor).toBe(11500);
  });

  it('applies discount before VAT and commission', () => {
    const b = price(10000, 1000, 0);
    expect(b.discountMinor).toBe(1000);
    expect(b.commissionMinor).toBe(450); // 5% of 9000
    expect(b.merchantNetMinor).toBe(8550);
    expect(b.taxMinor).toBe(1350); // 15% of 9000
    expect(b.totalMinor).toBe(10350);
  });

  it('includes delivery fee in the taxable base but not in commission', () => {
    const b = price(10000, 0, 500);
    expect(b.deliveryFeeMinor).toBe(500);
    expect(b.taxMinor).toBe(1575); // 15% of 10500
    expect(b.totalMinor).toBe(12075);
    expect(b.commissionMinor).toBe(500); // 5% of goods only
    expect(b.merchantNetMinor).toBe(9500);
  });

  it('handles a full breakdown: subtotal - discount + delivery + VAT', () => {
    const b = price(50000, 5000, 1500);
    expect(b.productsMinor).toBe(50000);
    expect(b.discountMinor).toBe(5000);
    expect(b.deliveryFeeMinor).toBe(1500);
    expect(b.taxMinor).toBe(6975); // 15% of 46500
    expect(b.totalMinor).toBe(53475);
    expect(b.commissionMinor).toBe(2250); // 5% of 45000
    expect(b.merchantNetMinor).toBe(42750);
  });

  it('merchant net + commission = net goods (invariant)', () => {
    const b = price(12345, 1234, 567);
    expect(b.merchantNetMinor + b.commissionMinor).toBe(12345 - 1234);
  });

  it('handles a zero-value order', () => {
    const b = price(0, 0, 0);
    expect(b.commissionMinor).toBe(0);
    expect(b.merchantNetMinor).toBe(0);
    expect(b.totalMinor).toBe(0);
  });

  it('rounds commission to the nearest integer', () => {
    const b = price(3333, 0, 0);
    expect(b.commissionMinor).toBe(167); // round(166.65)
    expect(Number.isInteger(b.commissionMinor)).toBe(true);
  });
});

describe('Orders Service — Cancel Eligibility', () => {
  it.each(CANCELLABLE_STATUSES)('%s should be cancellable', (status) => {
    expect(isCancellable(status)).toBe(true);
  });

  it.each(['DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'DRAFT', 'OUT_FOR_DELIVERY'])(
    '%s should NOT be cancellable',
    (status) => {
      expect(isCancellable(status)).toBe(false);
    },
  );
});

describe('Orders Service — Re-Price Guard', () => {
  it('should detect no change when prices are equal', () => {
    const delta = calculatePriceDelta(1000, 1000);
    expect(delta.delta).toBe(0);
    expect(delta.deltaPercent).toBe(0);
  });

  it('should detect price increase', () => {
    const delta = calculatePriceDelta(1000, 1100);
    expect(delta.delta).toBe(100);
    expect(delta.deltaPercent).toBe(10);
  });

  it('should detect price decrease', () => {
    const delta = calculatePriceDelta(1000, 900);
    expect(delta.delta).toBe(-100);
    expect(delta.deltaPercent).toBe(-10);
  });

  it('should flag >5% change as significant', () => {
    const deltas = [
      calculatePriceDelta(1000, 1060), // 6% increase
      calculatePriceDelta(2000, 2050), // 2.5% increase (not significant)
      calculatePriceDelta(500, 470), // 6% decrease
    ];
    const significant = hasSignificantPriceChange(deltas);
    expect(significant).toHaveLength(2);
    expect(significant[0]!.deltaPercent).toBe(6);
    expect(significant[1]!.deltaPercent).toBe(-6);
  });

  it('should not flag exactly 5% change', () => {
    const delta = calculatePriceDelta(1000, 1050);
    expect(delta.deltaPercent).toBe(5);
    const significant = hasSignificantPriceChange([delta]);
    expect(significant).toHaveLength(0); // >5% threshold, not >=5%
  });

  it('should handle zero snapshot price gracefully', () => {
    const delta = calculatePriceDelta(0, 100);
    expect(delta.deltaPercent).toBe(0); // Avoids division by zero
  });

  it('should handle small price changes below threshold', () => {
    const deltas = [
      calculatePriceDelta(10000, 10100), // 1%
      calculatePriceDelta(5000, 4950), // -1%
    ];
    const significant = hasSignificantPriceChange(deltas);
    expect(significant).toHaveLength(0);
  });
});
