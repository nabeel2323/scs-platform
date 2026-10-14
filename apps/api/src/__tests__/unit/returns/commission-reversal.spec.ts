/**
 * P13 Phase 3 — Commission Reversal Unit Tests
 *
 * Tests the pure calculation logic for responsibility-based commission reversal.
 * Uses integer minor-unit arithmetic throughout.
 */
import { describe, it, expect } from 'vitest';

// ─── Pure calculation helpers (mirrors service logic) ────────────

/**
 * Calculate the proportional commission reversal for a set of returned items.
 *
 * Uses cumulative-target rounding:
 *   reversal = floor(originalCommission × returnNetGoods / orderNetGoods)
 *   capped at remainingCommission (original - alreadyReversed)
 */
function calculateReversal(
  originalCommission: number,
  orderNetGoods: number,
  returnNetGoods: number,
  alreadyReversed: number,
): number {
  if (originalCommission <= 0 || orderNetGoods <= 0 || returnNetGoods <= 0) return 0;
  const remaining = originalCommission - alreadyReversed;
  if (remaining <= 0) return 0;
  const raw = Math.floor((originalCommission * returnNetGoods) / orderNetGoods);
  return Math.min(raw, remaining);
}

/** Categories that trigger commission reversal. */
const REVERSAL_CATEGORIES = new Set(['MERCHANT', 'PLATFORM', 'CARRIER_DAMAGE']);

function shouldReverse(category: string): boolean {
  return REVERSAL_CATEGORIES.has(category);
}

// ═══════════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════════

describe('Commission Reversal — Responsibility Categories', () => {
  it('MERCHANT: reversal applies', () => {
    expect(shouldReverse('MERCHANT')).toBe(true);
  });

  it('PLATFORM: reversal applies', () => {
    expect(shouldReverse('PLATFORM')).toBe(true);
  });

  it('CARRIER_DAMAGE: reversal applies', () => {
    expect(shouldReverse('CARRIER_DAMAGE')).toBe(true);
  });

  it('BUYER_REMORSE: no reversal', () => {
    expect(shouldReverse('BUYER_REMORSE')).toBe(false);
  });

  it('Unknown category: no reversal', () => {
    expect(shouldReverse('UNKNOWN')).toBe(false);
  });
});

describe('Commission Reversal — Calculation', () => {
  it('full return: reverses entire commission', () => {
    // Commission 500 on net goods 10000, return all 10000
    const reversal = calculateReversal(500, 10000, 10000, 0);
    expect(reversal).toBe(500);
  });

  it('partial return: proportional reversal', () => {
    // Commission 500 on net goods 10000, return 3000 worth
    const reversal = calculateReversal(500, 10000, 3000, 0);
    expect(reversal).toBe(150); // 500 * 3000 / 10000 = 150
  });

  it('reversal capped at remaining commission', () => {
    // Commission 500, already reversed 400, return would calculate 200
    const reversal = calculateReversal(500, 10000, 4000, 400);
    expect(reversal).toBe(100); // min(floor(500*4000/10000)=200, remaining=100) = 100
  });

  it('zero commission: no reversal', () => {
    expect(calculateReversal(0, 10000, 5000, 0)).toBe(0);
  });

  it('fully reversed already: no additional reversal', () => {
    expect(calculateReversal(500, 10000, 5000, 500)).toBe(0);
  });

  it('over-reversed: no additional reversal', () => {
    expect(calculateReversal(500, 10000, 5000, 600)).toBe(0);
  });

  it('zero return goods: no reversal', () => {
    expect(calculateReversal(500, 10000, 0, 0)).toBe(0);
  });

  it('zero order goods: no reversal', () => {
    expect(calculateReversal(500, 0, 5000, 0)).toBe(0);
  });
});

describe('Commission Reversal — Rounding', () => {
  it('under-rounding: floor prevents over-reversal', () => {
    // Commission 100, net goods 700, return 100
    // Raw: floor(100 * 100 / 700) = floor(14.28) = 14
    const reversal = calculateReversal(100, 700, 100, 0);
    expect(reversal).toBe(14);
  });

  it('over-rounding: floor still correct', () => {
    // Commission 100, net goods 300, return 100
    // Raw: floor(100 * 100 / 300) = floor(33.33) = 33
    const reversal = calculateReversal(100, 300, 100, 0);
    expect(reversal).toBe(33);
  });

  it('multiple partial returns: cumulative cap prevents drift', () => {
    const commission = 100;
    const orderNet = 700;

    // First return: 100 goods
    const r1 = calculateReversal(commission, orderNet, 100, 0);
    expect(r1).toBe(14); // floor(100*100/700) = 14

    // Second return: 100 goods
    const r2 = calculateReversal(commission, orderNet, 100, r1);
    expect(r2).toBe(14); // floor(100*100/700) = 14, remaining = 86

    // Third return: 100 goods
    const r3 = calculateReversal(commission, orderNet, 100, r1 + r2);
    expect(r3).toBe(14); // remaining = 72

    // Fourth return: 100 goods
    const r4 = calculateReversal(commission, orderNet, 100, r1 + r2 + r3);
    expect(r4).toBe(14); // remaining = 58

    // Total so far: 56, remaining: 44
    // Fifth return: 300 goods (rest)
    const r5 = calculateReversal(commission, orderNet, 300, r1 + r2 + r3 + r4);
    // floor(100*300/700) = 42, but remaining = 44, so min(42, 44) = 42
    expect(r5).toBe(42);

    // Total: 56 + 42 = 98 (not 100 — residual of 2 due to floor rounding)
    // This is the documented behavior: cumulative-target prevents over-reversal
    // but under-rounding residue may remain.
    const total = r1 + r2 + r3 + r4 + r5;
    expect(total).toBeLessThanOrEqual(commission);
    expect(total).toBe(98);
  });

  it('exact division: no rounding needed', () => {
    // Commission 100, net goods 1000, return 500
    // Raw: floor(100 * 500 / 1000) = 50 exactly
    const reversal = calculateReversal(100, 1000, 500, 0);
    expect(reversal).toBe(50);
  });

  it('single-item full return: exact reversal', () => {
    // Commission 50, net goods 1000, return all 1000
    const reversal = calculateReversal(50, 1000, 1000, 0);
    expect(reversal).toBe(50);
  });
});

describe('Commission Reversal — Edge Cases', () => {
  it('negative commission treated as zero', () => {
    expect(calculateReversal(-100, 1000, 500, 0)).toBe(0);
  });

  it('negative return goods treated as zero', () => {
    expect(calculateReversal(100, 1000, -500, 0)).toBe(0);
  });

  it('very large numbers: no overflow in integer arithmetic', () => {
    // 1 billion minor units (10M in major)
    const commission = 50_000_000; // 5% of 1 billion
    const orderNet = 1_000_000_000;
    const returnNet = 333_333_333;
    const reversal = calculateReversal(commission, orderNet, returnNet, 0);
    // floor(50000000 * 333333333 / 1000000000) = floor(16666666.65) = 16666666
    expect(reversal).toBe(16_666_666);
    expect(reversal).toBeLessThanOrEqual(commission);
  });
});
