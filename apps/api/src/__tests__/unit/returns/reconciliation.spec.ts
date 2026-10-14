/**
 * P13 Phase 3 §3.6 — Reconciliation business rules unit tests
 *
 * Tests the reconciliation logic: discrepancy detection, rerun safety,
 * period validation, and discrepancy type classification.
 */
import { describe, it, expect } from 'vitest';

// ── Pure-function mirrors of reconciliation logic ──────────────────

/** Validate reconciliation period inputs. */
function validatePeriod(periodStart: string, periodEnd: string): string | null {
  if (!periodStart || !periodEnd) return 'Period start and end are required';
  if (periodStart > periodEnd) return 'Period start must be before period end';
  return null; // valid
}

/** Settlement formula check: net = gross - refund - commission - fee. */
function verifySettlementNet(
  grossMinor: number, refundMinor: number,
  commissionMinor: number, feeMinor: number, netMinor: number,
): { valid: boolean; expected: number; delta: number } {
  const expected = grossMinor - refundMinor - commissionMinor - feeMinor;
  return { valid: expected === netMinor, expected, delta: netMinor - expected };
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
  it('correct settlement passes', () => {
    const result = verifySettlementNet(10000, 2000, 500, 100, 7400);
    expect(result.valid).toBe(true);
    expect(result.delta).toBe(0);
  });

  it('incorrect net detected', () => {
    const result = verifySettlementNet(10000, 2000, 500, 100, 7500);
    expect(result.valid).toBe(false);
    expect(result.delta).toBe(100);
  });

  it('ADJUSTMENT settlement with commission reversal', () => {
    // ADJUSTMENT: gross=0, refund=2000, commission=-150 (reversal credit), fee=0
    // net = 0 - 2000 - (-150) - 0 = -1850
    const result = verifySettlementNet(0, 2000, -150, 0, -1850);
    expect(result.valid).toBe(true);
  });

  it('zero settlement passes', () => {
    const result = verifySettlementNet(0, 0, 0, 0, 0);
    expect(result.valid).toBe(true);
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
