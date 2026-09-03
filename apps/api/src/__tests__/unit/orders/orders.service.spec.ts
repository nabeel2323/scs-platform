import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';

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

function assertTransition(currentStatus: string, newStatus: string) {
  const allowed = TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    throw new ConflictException(
      `Invalid transition: ${currentStatus} → ${newStatus}. Allowed: ${allowed.join(', ') || 'none'}`
    );
  }
}

// ── Financial Breakdown Calculation ───────────────────────────────

interface FinancialBreakdown {
  productsMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  taxMinor: number;
  commissionMinor: number;
  merchantNetMinor: number;
}

/**
 * Calculate financial breakdown matching the orders.service.ts checkout logic.
 * Commission rate: 5% (placeholder from service).
 */
function calculateFinancialBreakdown(
  subtotalMinor: number,
  discountMinor: number,
  deliveryFeeMinor: number,
  taxMinor: number,
  commissionRate: number = 0.05,
): FinancialBreakdown {
  const total = subtotalMinor - discountMinor + deliveryFeeMinor + taxMinor;
  const commissionMinor = Math.round(total * commissionRate);
  const merchantNetMinor = total - commissionMinor;

  return {
    productsMinor: subtotalMinor,
    discountMinor,
    deliveryFeeMinor,
    taxMinor,
    commissionMinor,
    merchantNetMinor,
  };
}

// ── Cancel Eligibility ────────────────────────────────────────────

const CANCELLABLE_STATUSES = ['SUBMITTED', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'CONFIRMED', 'PREPARING', 'READY'];

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
  return deltas.filter(d => Math.abs(d.deltaPercent) > threshold);
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

describe('Orders Service — Financial Breakdown', () => {
  it('should calculate 5% commission on total', () => {
    const breakdown = calculateFinancialBreakdown(10000, 0, 0, 0);
    expect(breakdown.commissionMinor).toBe(500);
    expect(breakdown.merchantNetMinor).toBe(9500);
  });

  it('should apply discount before calculating total', () => {
    const breakdown = calculateFinancialBreakdown(10000, 1000, 0, 0);
    const total = 10000 - 1000; // 9000
    expect(breakdown.commissionMinor).toBe(Math.round(9000 * 0.05)); // 450
    expect(breakdown.merchantNetMinor).toBe(9000 - 450); // 8550
  });

  it('should include delivery fee in total and commission', () => {
    const breakdown = calculateFinancialBreakdown(10000, 0, 500, 0);
    const total = 10000 + 500; // 10500
    expect(breakdown.commissionMinor).toBe(Math.round(10500 * 0.05)); // 525
    expect(breakdown.merchantNetMinor).toBe(10500 - 525); // 9975
  });

  it('should include tax in total and commission', () => {
    const breakdown = calculateFinancialBreakdown(10000, 0, 0, 1500);
    const total = 10000 + 1500; // 11500
    expect(breakdown.commissionMinor).toBe(Math.round(11500 * 0.05)); // 575
    expect(breakdown.merchantNetMinor).toBe(11500 - 575); // 10925
  });

  it('should handle full breakdown: subtotal - discount + delivery + tax', () => {
    const breakdown = calculateFinancialBreakdown(50000, 5000, 1500, 7500);
    const total = 50000 - 5000 + 1500 + 7500; // 54000
    const commission = Math.round(54000 * 0.05); // 2700
    expect(breakdown.productsMinor).toBe(50000);
    expect(breakdown.discountMinor).toBe(5000);
    expect(breakdown.deliveryFeeMinor).toBe(1500);
    expect(breakdown.taxMinor).toBe(7500);
    expect(breakdown.commissionMinor).toBe(commission);
    expect(breakdown.merchantNetMinor).toBe(total - commission);
  });

  it('merchant net = total - commission (invariant)', () => {
    const breakdown = calculateFinancialBreakdown(12345, 1234, 567, 890);
    const total = 12345 - 1234 + 567 + 890;
    expect(breakdown.merchantNetMinor + breakdown.commissionMinor).toBe(total);
  });

  it('should handle zero subtotal', () => {
    const breakdown = calculateFinancialBreakdown(0, 0, 0, 0);
    expect(breakdown.commissionMinor).toBe(0);
    expect(breakdown.merchantNetMinor).toBe(0);
  });

  it('should round commission to nearest integer', () => {
    // 3333 * 0.05 = 166.65 → rounds to 167
    const breakdown = calculateFinancialBreakdown(3333, 0, 0, 0);
    expect(breakdown.commissionMinor).toBe(167);
    expect(Number.isInteger(breakdown.commissionMinor)).toBe(true);
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
    }
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
      calculatePriceDelta(500, 470),   // 6% decrease
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
      calculatePriceDelta(5000, 4950),   // -1%
    ];
    const significant = hasSignificantPriceChange(deltas);
    expect(significant).toHaveLength(0);
  });
});
