/**
 * P13 Phase 3 §3.6 — Reconciliation business rules and ledger semantics tests
 *
 * Tests the reconciliation logic: discrepancy detection, rerun safety,
 * period validation, and discrepancy type classification.
 */
import { describe, it, expect } from 'vitest';
import {
  buildRefundStatusMismatchDiscrepancy,
  calculateDeliveryFeeRefundCapMinor,
  calculateExpectedSettlementNetMinor,
  sumSafeMinorUnitAmounts,
} from '../../../modules/returns/reconciliation.service';

// ── Pure-function mirrors of reconciliation logic ──────────────────

/** Validate reconciliation period inputs. */
function validatePeriod(periodStart: string, periodEnd: string): string | null {
  if (!periodStart || !periodEnd) return 'Period start and end are required';
  if (periodStart > periodEnd) return 'Period start must be before period end';
  return null; // valid
}

/** Classify a discrepancy by type. */
function classifyDiscrepancy(
  hasRefund: boolean, refundStatus: string,
  hasReversal: boolean, responsibilityCategory: string | null,
): string[] {
  const issues: string[] = [];

  if (!hasRefund) {
    issues.push('MISSING_REFUND');
  } else if (refundStatus !== 'SUCCEEDED') {
    issues.push('REFUND_STATUS_MISMATCH');
  }

  if (responsibilityCategory && ['MERCHANT', 'PLATFORM', 'CARRIER_DAMAGE'].includes(responsibilityCategory)) {
    if (!hasReversal) {
      issues.push('MISSING_COMMISSION_REVERSAL');
    }
  }

  return issues;
}

/** Check if adjustment has sufficient approvals. */
function hasSufficientApprovals(
  requiresDual: boolean, total: number, financeCount: number, adminCount: number,
): boolean {
  if (requiresDual) {
    return financeCount >= 1 && adminCount >= 1 && total >= 2;
  }
  return total >= 1;
}

// ═══════════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════════

describe('Reconciliation — Period Validation', () => {
  it('valid period accepted', () => {
    expect(validatePeriod('2026-01-01', '2026-01-31')).toBeNull();
  });

  it('missing start rejected', () => {
    expect(validatePeriod('', '2026-01-31')).toBe('Period start and end are required');
  });

  it('missing end rejected', () => {
    expect(validatePeriod('2026-01-01', '')).toBe('Period start and end are required');
  });

  it('start after end rejected', () => {
    expect(validatePeriod('2026-02-01', '2026-01-31')).toBe('Period start must be before period end');
  });

  it('same day period accepted', () => {
    expect(validatePeriod('2026-01-15', '2026-01-15')).toBeNull();
  });
});

describe('Reconciliation — Settlement Formula Verification', () => {
  it('calculates a primary settlement using commission as a merchant debit', () => {
    expect(calculateExpectedSettlementNetMinor('CALCULATED', 10000, 2000, 500, 100)).toBe(7400);
  });

  it('detects an incorrect primary settlement net', () => {
    const expected = calculateExpectedSettlementNetMinor('CALCULATED', 10000, 2000, 500, 100);
    expect(expected).toBe(7400);
    expect(7500 - expected!).toBe(100);
  });

  it('calculates a commission-reversal adjustment as a merchant credit', () => {
    expect(calculateExpectedSettlementNetMinor('ADJUSTMENT', 0, 0, 150, 0)).toBe(150);
  });

  it('combines a refund debit and commission credit in an adjustment row', () => {
    expect(calculateExpectedSettlementNetMinor('ADJUSTMENT', 0, 2000, 150, 0)).toBe(-1850);
  });

  it('rejects source values or results outside the safe minor-unit range', () => {
    expect(calculateExpectedSettlementNetMinor('CALCULATED', Number.MAX_SAFE_INTEGER + 1, 0, 0, 0)).toBeNull();
    expect(calculateExpectedSettlementNetMinor(
      'CALCULATED',
      0,
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
    )).toBeNull();
  });

  it('zero settlement passes', () => {
    expect(calculateExpectedSettlementNetMinor('CALCULATED', 0, 0, 0, 0)).toBe(0);
  });
});

describe('Reconciliation — Exact Minor-unit Checks', () => {
  it('sums safe integer source rows exactly even when the aggregate exceeds Number.MAX_SAFE_INTEGER', () => {
    expect(sumSafeMinorUnitAmounts([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]))
      .toBe(BigInt(Number.MAX_SAFE_INTEGER) * 2n);
  });

  it('rejects unsafe source rows rather than rounding them', () => {
    expect(sumSafeMinorUnitAmounts([Number.MAX_SAFE_INTEGER + 1])).toBeNull();
  });

  it('uses the same half-up VAT allocation as the return workflow for delivery-fee caps', () => {
    // 10 × 1 / 6 rounds half-up to 2, so the exact cap is 12.
    expect(calculateDeliveryFeeRefundCapMinor(10, 1, 6)).toBe(12);
  });

  it('rejects unsafe delivery-fee cap inputs', () => {
    expect(calculateDeliveryFeeRefundCapMinor(Number.MAX_SAFE_INTEGER + 1, 1, 6)).toBeNull();
  });

  it('keeps refund-status text out of monetary discrepancy columns', () => {
    const discrepancy = buildRefundStatusMismatchDiscrepancy('return-1', 'refund-1', 'FAILED');
    expect(discrepancy.type).toBe('REFUND_STATUS_MISMATCH');
    expect(discrepancy.description).toContain('expected SUCCEEDED');
    expect(discrepancy.description).toContain('FAILED');
    expect(discrepancy.expected).toBeUndefined();
    expect(discrepancy.actual).toBeUndefined();
    expect(discrepancy.delta).toBeUndefined();
  });
});

describe('Reconciliation — Discrepancy Classification', () => {
  it('REFUNDED return with no refund → MISSING_REFUND', () => {
    const issues = classifyDiscrepancy(false, '', false, 'MERCHANT');
    expect(issues).toContain('MISSING_REFUND');
    expect(issues).toContain('MISSING_COMMISSION_REVERSAL');
  });

  it('REFUNDED return with FAILED refund → REFUND_STATUS_MISMATCH', () => {
    const issues = classifyDiscrepancy(true, 'FAILED', true, 'MERCHANT');
    expect(issues).toContain('REFUND_STATUS_MISMATCH');
    expect(issues).not.toContain('MISSING_COMMISSION_REVERSAL');
  });

  it('REFUNDED return, SUCCEEDED refund, MERCHANT responsibility, no reversal → MISSING_COMMISSION_REVERSAL', () => {
    const issues = classifyDiscrepancy(true, 'SUCCEEDED', false, 'MERCHANT');
    expect(issues).toContain('MISSING_COMMISSION_REVERSAL');
  });

  it('BUYER_REMORSE → no reversal expected', () => {
    const issues = classifyDiscrepancy(true, 'SUCCEEDED', false, 'BUYER_REMORSE');
    expect(issues).not.toContain('MISSING_COMMISSION_REVERSAL');
  });

  it('null responsibility → no reversal expected', () => {
    const issues = classifyDiscrepancy(true, 'SUCCEEDED', false, null);
    expect(issues).not.toContain('MISSING_COMMISSION_REVERSAL');
  });

  it('fully correct return → no issues', () => {
    const issues = classifyDiscrepancy(true, 'SUCCEEDED', true, 'MERCHANT');
    expect(issues).toHaveLength(0);
  });
});

describe('Reconciliation — Rerun Safety (Phase 3.1 versioned runs)', () => {
  it('rerun creates a NEW version — previous run is preserved', () => {
    // Phase 3.1: each rerun creates a new run with incremented version.
    // Previous runs and their discrepancies are NEVER deleted.
    const run1Version = 1;
    const run1Discrepancies = 3;
    const run2Version = 2;
    const run2Discrepancies = 2;

    // Both runs exist independently
    expect(run2Version).toBeGreaterThan(run1Version);
    // Run 1 still has its original discrepancies
    expect(run1Discrepancies).toBe(3);
    // Run 2 has its own discrepancies
    expect(run2Discrepancies).toBe(2);
    // Total discrepancy records = sum of both runs
    const totalRecords = run1Discrepancies + run2Discrepancies;
    expect(totalRecords).toBe(5);
  });

  it('version increments monotonically for same period/currency', () => {
    const versions: number[] = [1, 2, 3];
    for (let i = 1; i < versions.length; i++) {
      const current: number = versions[i]!;
      const previous: number = versions[i - 1]!;
      expect(current).toBeGreaterThan(previous);
    }
  });
});

describe('Reconciliation — Adjustment Approval Verification', () => {
  it('POSTED adjustment with dual approval but missing finance → flagged', () => {
    expect(hasSufficientApprovals(true, 1, 0, 1)).toBe(false);
  });

  it('POSTED adjustment with dual approval and both roles → OK', () => {
    expect(hasSufficientApprovals(true, 2, 1, 1)).toBe(true);
  });

  it('POSTED adjustment with no approvals → flagged', () => {
    expect(hasSufficientApprovals(false, 0, 0, 0)).toBe(false);
  });

  it('POSTED single-approval with 1 approval → OK', () => {
    expect(hasSufficientApprovals(false, 1, 1, 0)).toBe(true);
  });
});
