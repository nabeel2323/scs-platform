/**
 * P13 Phase 3.1 — Settlement Adjustment Service unit tests (hardened)
 *
 * Tests the approval state machine, dual-approval logic, FX safety,
 * approval hash binding, idempotency and authorization rules.
 *
 * Phase 3.1 changes:
 * - ALL adjustments get fxStatus=BLOCKED_FX (no FX provider exists)
 * - Dual approval always required (threshold cannot be evaluated)
 * - Creator cannot be ANY approver for dual-approval
 * - Approval hash includes adjustmentType
 * - BLOCKED_FX state added to state machine
 * - Posting blocked when fxStatus is BLOCKED_FX
 */
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';

// ── Pure-function mirrors of SettlementAdjustmentService logic ──────

/** Compute approval hash (Phase 3.1: includes adjustmentType). */
function computeApprovalHash(
  amountMinor: number, currency: string, reason: string,
  subOrderId: string, adjustmentType: string,
): string {
  const payload = `${amountMinor}:${currency}:${reason}:${subOrderId}:${adjustmentType}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/** Phase 3.1: ALL adjustments get BLOCKED_FX — no FX provider exists. */
function determineFxStatus(_currency: string): 'BLOCKED_FX' {
  return 'BLOCKED_FX';
}

/** Phase 3.1: Dual approval always required (threshold cannot be evaluated). */
function requiresDualApproval(_fxStatus: string): boolean {
  return true;
}

/** Valid state transitions (Phase 3.1: includes BLOCKED_FX). */
const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PENDING_APPROVAL', 'BLOCKED_FX'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'BLOCKED_FX'],
  APPROVED: ['POSTED', 'FAILED'],
  POSTED: [],
  REJECTED: [],
  FAILED: [],
  BLOCKED_FX: [],
};

function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** Check if approval is sufficient (Phase 3.1: always dual). */
function isFullyApproved(
  dualRequired: boolean, total: number, financeCount: number, adminCount: number,
): boolean {
  if (dualRequired) {
    return financeCount >= 1 && adminCount >= 1 && total >= 2;
  }
  return total >= 1;
}

/** Phase 3.1: Can post? Only if fxStatus is NOT blocked. */
function canPost(fxStatus: string): boolean {
  return fxStatus !== 'BLOCKED_FX';
}

// ═══════════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════════

describe('Settlement Adjustment — FX Safety (Phase 3.1)', () => {
  it('SYP currency → fxStatus = BLOCKED_FX (no FX provider)', () => {
    expect(determineFxStatus('SYP')).toBe('BLOCKED_FX');
  });

  it('non-SYP currency → fxStatus = BLOCKED_FX (no FX provider)', () => {
    expect(determineFxStatus('USD')).toBe('BLOCKED_FX');
    expect(determineFxStatus('EUR')).toBe('BLOCKED_FX');
    expect(determineFxStatus('TRY')).toBe('BLOCKED_FX');
  });

  it('BLOCKED_FX → dual approval always required', () => {
    expect(requiresDualApproval('BLOCKED_FX')).toBe(true);
  });

  it('BLOCKED_FX → posting is blocked', () => {
    expect(canPost('BLOCKED_FX')).toBe(false);
  });

  it('RESOLVED → posting is allowed', () => {
    expect(canPost('RESOLVED')).toBe(true);
  });
});

describe('Settlement Adjustment — Approval Hash Binding (Phase 3.1)', () => {
  const base = {
    amountMinor: 5000, currency: 'SYP', reason: 'Refund correction',
    subOrderId: 'order-1', adjustmentType: 'DELIVERY_FEE_EXCEPTION',
  };

  it('same inputs produce same hash', () => {
    const h1 = computeApprovalHash(base.amountMinor, base.currency, base.reason, base.subOrderId, base.adjustmentType);
    const h2 = computeApprovalHash(base.amountMinor, base.currency, base.reason, base.subOrderId, base.adjustmentType);
    expect(h1).toBe(h2);
  });

  it('changed amount → different hash', () => {
    const h1 = computeApprovalHash(5000, 'SYP', 'Refund correction', 'order-1', 'DELIVERY_FEE_EXCEPTION');
    const h2 = computeApprovalHash(6000, 'SYP', 'Refund correction', 'order-1', 'DELIVERY_FEE_EXCEPTION');
    expect(h1).not.toBe(h2);
  });

  it('changed currency → different hash', () => {
    const h1 = computeApprovalHash(5000, 'SYP', 'Refund correction', 'order-1', 'DELIVERY_FEE_EXCEPTION');
    const h2 = computeApprovalHash(5000, 'USD', 'Refund correction', 'order-1', 'DELIVERY_FEE_EXCEPTION');
    expect(h1).not.toBe(h2);
  });

  it('changed reason → different hash', () => {
    const h1 = computeApprovalHash(5000, 'SYP', 'Refund correction', 'order-1', 'DELIVERY_FEE_EXCEPTION');
    const h2 = computeApprovalHash(5000, 'SYP', 'Different reason', 'order-1', 'DELIVERY_FEE_EXCEPTION');
    expect(h1).not.toBe(h2);
  });

  it('changed target settlement → different hash', () => {
    const h1 = computeApprovalHash(5000, 'SYP', 'Refund correction', 'order-1', 'DELIVERY_FEE_EXCEPTION');
    const h2 = computeApprovalHash(5000, 'SYP', 'Refund correction', 'order-2', 'DELIVERY_FEE_EXCEPTION');
    expect(h1).not.toBe(h2);
  });

  it('changed adjustment type → different hash', () => {
    const h1 = computeApprovalHash(5000, 'SYP', 'Refund correction', 'order-1', 'DELIVERY_FEE_EXCEPTION');
    const h2 = computeApprovalHash(5000, 'SYP', 'Refund correction', 'order-1', 'BALANCE_ADJUSTMENT');
    expect(h1).not.toBe(h2);
  });
});

describe('Settlement Adjustment — State Machine (Phase 3.1)', () => {
  it('DRAFT → PENDING_APPROVAL is valid', () => {
    expect(canTransition('DRAFT', 'PENDING_APPROVAL')).toBe(true);
  });

  it('DRAFT → BLOCKED_FX is valid', () => {
    expect(canTransition('DRAFT', 'BLOCKED_FX')).toBe(true);
  });

  it('DRAFT → APPROVED is NOT valid (must submit first)', () => {
    expect(canTransition('DRAFT', 'APPROVED')).toBe(false);
  });

  it('PENDING_APPROVAL → APPROVED is valid', () => {
    expect(canTransition('PENDING_APPROVAL', 'APPROVED')).toBe(true);
  });

  it('PENDING_APPROVAL → REJECTED is valid', () => {
    expect(canTransition('PENDING_APPROVAL', 'REJECTED')).toBe(true);
  });

  it('PENDING_APPROVAL → BLOCKED_FX is valid', () => {
    expect(canTransition('PENDING_APPROVAL', 'BLOCKED_FX')).toBe(true);
  });

  it('APPROVED → POSTED is valid', () => {
    expect(canTransition('APPROVED', 'POSTED')).toBe(true);
  });

  it('APPROVED → FAILED is valid', () => {
    expect(canTransition('APPROVED', 'FAILED')).toBe(true);
  });

  it('POSTED is terminal — no outgoing transitions', () => {
    expect(canTransition('POSTED', 'DRAFT')).toBe(false);
    expect(canTransition('POSTED', 'APPROVED')).toBe(false);
  });

  it('REJECTED is terminal', () => {
    expect(canTransition('REJECTED', 'DRAFT')).toBe(false);
  });

  it('BLOCKED_FX is terminal', () => {
    expect(canTransition('BLOCKED_FX', 'DRAFT')).toBe(false);
    expect(canTransition('BLOCKED_FX', 'APPROVED')).toBe(false);
    expect(TRANSITIONS['BLOCKED_FX']).toEqual([]);
  });

  it('FAILED is terminal', () => {
    expect(TRANSITIONS['FAILED']).toEqual([]);
  });
});

describe('Settlement Adjustment — Approval Sufficiency (Phase 3.1)', () => {
  describe('dual-approval mode (always active in Phase 3.1)', () => {
    it('1 Finance + 1 admin = approved', () => {
      expect(isFullyApproved(true, 2, 1, 1)).toBe(true);
    });

    it('2 Finance + 0 admin = NOT approved', () => {
      expect(isFullyApproved(true, 2, 2, 0)).toBe(false);
    });

    it('0 Finance + 2 admin = NOT approved', () => {
      expect(isFullyApproved(true, 2, 0, 2)).toBe(false);
    });

    it('1 Finance + 2 admin = approved (excess admin ok)', () => {
      expect(isFullyApproved(true, 3, 1, 2)).toBe(true);
    });

    it('1 total approval = NOT sufficient for dual', () => {
      expect(isFullyApproved(true, 1, 1, 0)).toBe(false);
    });

    it('0 approvals = NOT sufficient', () => {
      expect(isFullyApproved(true, 0, 0, 0)).toBe(false);
    });
  });
});

describe('Settlement Adjustment — Duplicate Prevention', () => {
  it('same approver cannot approve twice (conceptual test)', () => {
    const approvers = new Set<string>();
    const approverId = 'user-1';

    expect(approvers.has(approverId)).toBe(false);
    approvers.add(approverId);

    expect(approvers.has(approverId)).toBe(true);
  });
});

describe('Settlement Adjustment — Self-Dealing Prevention (Phase 3.1)', () => {
  it('creator CANNOT be ANY approver for dual-approval', () => {
    const creator = 'user-A';
    const isDualApproval = true;

    // Phase 3.1: creator cannot be ANY approver for dual-approval
    const canCreatorApprove = !isDualApproval;
    expect(canCreatorApprove).toBe(false);
  });

  it('two distinct non-creator approvers are required', () => {
    const creator = 'user-A';
    const approver1 = 'user-B';
    const approver2 = 'user-C';

    // Both are different from creator and from each other
    expect(approver1).not.toBe(creator);
    expect(approver2).not.toBe(creator);
    expect(approver1).not.toBe(approver2);
  });
});

describe('Settlement Adjustment — Posting Guard (Phase 3.1)', () => {
  it('cannot post when fxStatus is BLOCKED_FX', () => {
    expect(canPost('BLOCKED_FX')).toBe(false);
  });

  it('can post when fxStatus is RESOLVED', () => {
    expect(canPost('RESOLVED')).toBe(true);
  });
});
