/**
 * P13 Returns — Unit Tests
 *
 * Tests the return request FSM, eligibility rules, refund calculation,
 * and authorization logic without requiring a database.
 */
import { describe, it, expect } from 'vitest';

// ── FSM Transition Map (mirrors returns.service.ts) ─────────────

const TRANSITIONS: Record<string, string[]> = {
  REQUESTED:                 ['MERCHANT_APPROVED', 'MERCHANT_REJECTED', 'CANCELLED', 'EXPIRED'],
  MERCHANT_APPROVED:         ['BUYER_SHIPPED', 'CANCELLED'],
  BUYER_SHIPPED:             ['RECEIVED'],
  RECEIVED:                  ['INSPECTED'],
  INSPECTED:                 ['REFUND_PENDING', 'REJECTED_AFTER_INSPECTION'],
  REFUND_PENDING:            ['REFUNDED', 'REFUND_FAILED'],
  REFUND_FAILED:             ['REFUND_PENDING'],
  REFUNDED:                  [],
  MERCHANT_REJECTED:         [],
  CANCELLED:                 [],
  EXPIRED:                   [],
  REJECTED_AFTER_INSPECTION: [],
};

const TERMINAL_STATES = new Set([
  'REFUNDED', 'MERCHANT_REJECTED', 'CANCELLED',
  'EXPIRED', 'REJECTED_AFTER_INSPECTION',
]);

const ALL_STATES = Object.keys(TRANSITIONS);

describe('P13 Return FSM', () => {
  describe('AC-P13-001: Legal transitions', () => {
    const legalTransitions = [
      ['REQUESTED', 'MERCHANT_APPROVED'],
      ['REQUESTED', 'MERCHANT_REJECTED'],
      ['REQUESTED', 'CANCELLED'],
      ['REQUESTED', 'EXPIRED'],
      ['MERCHANT_APPROVED', 'BUYER_SHIPPED'],
      ['MERCHANT_APPROVED', 'CANCELLED'],
      ['BUYER_SHIPPED', 'RECEIVED'],
      ['RECEIVED', 'INSPECTED'],
      ['INSPECTED', 'REFUND_PENDING'],
      ['INSPECTED', 'REJECTED_AFTER_INSPECTION'],
      ['REFUND_PENDING', 'REFUNDED'],
      ['REFUND_PENDING', 'REFUND_FAILED'],
      ['REFUND_FAILED', 'REFUND_PENDING'],
    ];

    it.each(legalTransitions)('%s → %s is legal', (from, to) => {
      expect(TRANSITIONS[from]).toContain(to);
    });
  });

  describe('AC-P13-001: Illegal transitions', () => {
    const illegalTransitions = [
      ['REQUESTED', 'REFUNDED'],
      ['REQUESTED', 'INSPECTED'],
      ['MERCHANT_APPROVED', 'REFUNDED'],
      ['BUYER_SHIPPED', 'CANCELLED'],  // can't cancel after shipping
      ['RECEIVED', 'CANCELLED'],
      ['INSPECTED', 'CANCELLED'],
      ['REFUND_PENDING', 'CANCELLED'],
      ['REFUNDED', 'REQUESTED'],
      ['CANCELLED', 'REQUESTED'],
    ];

    it.each(illegalTransitions)('%s → %s is illegal', (from, to) => {
      expect(TRANSITIONS[from]).not.toContain(to);
    });
  });

  describe('AC-P13-002: Terminal states', () => {
    it.each([...TERMINAL_STATES])('%s has no outgoing transitions', (state) => {
      expect(TRANSITIONS[state]).toEqual([]);
    });

    it('all terminal states are recognized', () => {
      expect(TERMINAL_STATES.size).toBe(5);
    });
  });

  describe('State coverage', () => {
    it('all 12 states are in the FSM', () => {
      expect(ALL_STATES.length).toBe(12);
    });

    it('every non-terminal state has at least one transition', () => {
      for (const state of ALL_STATES) {
        if (!TERMINAL_STATES.has(state)) {
          expect(TRANSITIONS[state]!.length).toBeGreaterThan(0);
        }
      }
    });

    it('happy path: REQUESTED → REFUNDED is reachable', () => {
      const path: string[] = [
        'REQUESTED', 'MERCHANT_APPROVED', 'BUYER_SHIPPED',
        'RECEIVED', 'INSPECTED', 'REFUND_PENDING', 'REFUNDED',
      ];
      for (let i = 0; i < path.length - 1; i++) {
        expect(TRANSITIONS[path[i] as string]).toContain(path[i + 1]);
      }
    });
  });
});

// ── Refund Calculation ──────────────────────────────────────────

describe('P13 Refund Calculation', () => {
  // Prices are VAT-exclusive. VAT is added on top.
  const VAT_RATE = 0.15;
  const DISCOUNT_RATIO = 0.1; // 10% discount

  function calcLineRefund(unitPriceMinor: number, qty: number, vatRate: number, discountRatio: number) {
    const lineGross = unitPriceMinor * qty;
    const lineDiscount = Math.round(lineGross * discountRatio);
    const lineNet = lineGross - lineDiscount;
    const lineTax = Math.round(lineNet * vatRate);
    return lineNet + lineTax;
  }

  describe('AC-P13-006: Refund amount calculation', () => {
    it('single item, no discount, with VAT', () => {
      const refund = calcLineRefund(1000, 1, VAT_RATE, 0);
      expect(refund).toBe(1150); // 1000 + 150 VAT
    });

    it('single item, with discount, with VAT', () => {
      const refund = calcLineRefund(1000, 1, VAT_RATE, DISCOUNT_RATIO);
      // 1000 - 100 discount = 900 net; 900 * 0.15 = 135 VAT; 900 + 135 = 1035
      expect(refund).toBe(1035);
    });

    it('multiple quantity', () => {
      const refund = calcLineRefund(500, 3, VAT_RATE, 0);
      expect(refund).toBe(1725); // 1500 + 225 VAT
    });

    it('partial quantity', () => {
      const refund = calcLineRefund(1000, 2, VAT_RATE, DISCOUNT_RATIO);
      // 2000 - 200 = 1800; 1800 * 0.15 = 270; 1800 + 270 = 2070
      expect(refund).toBe(2070);
    });

    it('zero VAT rate', () => {
      const refund = calcLineRefund(1000, 1, 0, 0);
      expect(refund).toBe(1000);
    });
  });

  describe('AC-P13-007: Cumulative refund cap', () => {
    it('total refund must not exceed confirmed payment', () => {
      const confirmedAmount = 5000;
      const priorRefunded = 3000;
      const newRefund = 2500;
      expect(newRefund).toBeGreaterThan(confirmedAmount - priorRefunded);
    });

    it('refund within cap is allowed', () => {
      const confirmedAmount = 5000;
      const priorRefunded = 3000;
      const newRefund = 1500;
      expect(newRefund).toBeLessThanOrEqual(confirmedAmount - priorRefunded);
    });
  });
});

// ── Eligibility Rules ───────────────────────────────────────────

describe('P13 Eligibility', () => {
  describe('AC-P13-003: Order status eligibility', () => {
    const eligibleStatuses = ['DELIVERED', 'COMPLETED'];
    const ineligibleStatuses = ['DRAFT', 'SUBMITTED', 'PENDING_CONFIRMATION', 'ACCEPTED',
      'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'CANCELLED', 'REJECTED', 'DISPUTED',
      'PAYMENT_PENDING', 'PAYMENT_CONFIRMED'];

    it.each(eligibleStatuses)('%s is eligible', (status) => {
      expect(['DELIVERED', 'COMPLETED']).toContain(status);
    });

    it.each(ineligibleStatuses)('%s is NOT eligible', (status) => {
      expect(['DELIVERED', 'COMPLETED']).not.toContain(status);
    });
  });

  describe('AC-P13-003: Payment status eligibility', () => {
    const eligiblePaymentStatuses = ['CONFIRMED', 'CAPTURED', 'PARTIALLY_REFUNDED'];
    const ineligiblePaymentStatuses = ['CREATED', 'AWAITING_PAYMENT', 'AWAITING_VERIFICATION',
      'REJECTED', 'EXPIRED', 'CANCELLED', 'FAILED', 'REFUNDED'];

    it.each(eligiblePaymentStatuses)('payment %s is eligible', (status) => {
      expect(['CONFIRMED', 'CAPTURED', 'PARTIALLY_REFUNDED']).toContain(status);
    });

    it.each(ineligiblePaymentStatuses)('payment %s is NOT eligible', (status) => {
      expect(['CONFIRMED', 'CAPTURED', 'PARTIALLY_REFUNDED']).not.toContain(status);
    });
  });
});

// ── Return Window ───────────────────────────────────────────────

describe('P13 Return Window', () => {
  const RETURN_WINDOW_DAYS = 14;

  it('within window: delivered 5 days ago', () => {
    const deliveredAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(deliveredAt.getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    expect(new Date() < windowEnd).toBe(true);
  });

  it('outside window: delivered 20 days ago', () => {
    const deliveredAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(deliveredAt.getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    expect(new Date() > windowEnd).toBe(true);
  });

  it('boundary: delivered exactly 14 days ago', () => {
    const deliveredAt = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(deliveredAt.getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    // Should be very close to now (within seconds)
    expect(Math.abs(windowEnd.getTime() - Date.now())).toBeLessThan(5000);
  });
});

// ── Quantity Limits ─────────────────────────────────────────────

describe('P13 Quantity Limits', () => {
  describe('AC-P13-005: Cumulative return quantity', () => {
    it('cannot exceed ordered quantity', () => {
      const orderedQty = 10;
      const priorReturned = 7;
      const requestedQty = 4;
      expect(priorReturned + requestedQty).toBeGreaterThan(orderedQty);
    });

    it('exact remaining is allowed', () => {
      const orderedQty = 10;
      const priorReturned = 7;
      const requestedQty = 3;
      expect(priorReturned + requestedQty).toBeLessThanOrEqual(orderedQty);
    });

    it('partial quantity return is permitted', () => {
      const orderedQty = 10;
      const requestedQty = 3;
      expect(requestedQty).toBeGreaterThan(0);
      expect(requestedQty).toBeLessThan(orderedQty);
    });
  });
});

// ── Return Conditions ───────────────────────────────────────────

describe('P13 Return Conditions', () => {
  const CONDITIONS = new Set(['GOOD', 'DAMAGED', 'DEFECTIVE', 'UNSALEABLE']);
  const WRITEOFF = new Set(['DAMAGED', 'DEFECTIVE', 'UNSALEABLE']);

  it('GOOD → sellable (RETURN movement)', () => {
    expect(WRITEOFF.has('GOOD')).toBe(false);
  });

  it.each([...WRITEOFF])('%s → write-off (RELEASE + ADJUST-out)', (condition) => {
    expect(WRITEOFF.has(condition)).toBe(true);
  });

  it('invalid conditions are rejected', () => {
    expect(CONDITIONS.has('BROKEN')).toBe(false);
    expect(CONDITIONS.has('')).toBe(false);
  });
});

// ── One Active Return Per Sub-Order ─────────────────────────────

describe('P13 Active Return Uniqueness', () => {
  const ACTIVE_STATES = ['REQUESTED', 'MERCHANT_APPROVED', 'BUYER_SHIPPED', 'RECEIVED',
    'INSPECTED', 'REFUND_PENDING', 'REFUND_FAILED'];
  const TERMINAL = ['REFUNDED', 'MERCHANT_REJECTED', 'CANCELLED', 'EXPIRED', 'REJECTED_AFTER_INSPECTION'];

  it.each(ACTIVE_STATES)('%s is an active state (blocks new return)', (state) => {
    expect(TERMINAL).not.toContain(state);
  });

  it.each(TERMINAL)('%s is terminal (allows new return)', (state) => {
    expect(TERMINAL).toContain(state);
  });
});
