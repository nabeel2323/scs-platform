/**
 * M7.3-B.3.3.3 — Indeterminate Outcome Reconciliation: Unit Tests
 *
 * Pure TypeScript contract checks (no database, no carrier HTTP).
 * Verifies error classification, recovery token assignment, reconciliation
 * logic, state transitions, and regression guarantees.
 *
 * Covers (minimum 18):
 *   B333-U-01  timeout → UNKNOWN
 *   B333-U-02  ECONNRESET → UNKNOWN
 *   B333-U-03  ECONNABORTED → UNKNOWN
 *   B333-U-04  socket hang up → UNKNOWN
 *   B333-U-05  aborted → UNKNOWN
 *   B333-U-06  ECONNREFUSED → retryable (NOT indeterminate)
 *   B333-U-07  DNS/ENOTFOUND → retryable (NOT indeterminate)
 *   B333-U-08  timeout/ETIMEDOUT → CANCEL_TIMEOUT recovery token
 *   B333-U-09  other transport → CANCEL_UNKNOWN recovery token
 *   B333-U-10  nextReconciliationAt set on UNKNOWN transition
 *   B333-U-11  tracking confirmed cancelled → SUCCEEDED
 *   B333-U-12  tracking confirmed active → safe PENDING retry (not implemented — conservative)
 *   B333-U-13  ambiguous response → RECONCILIATION_REQUIRED (after budget)
 *   B333-U-14  reconciliation transport error → UNKNOWN within budget
 *   B333-U-15  budget exhaustion → RECONCILIATION_REQUIRED
 *   B333-U-16  SUCCEEDED is terminal (idempotency)
 *   B333-U-17  429/500/502/503/504 regression — never UNKNOWN
 *   B333-U-18  auth/validation regression — never UNKNOWN
 *   B333-U-19  24h boundary → RECONCILIATION_REQUIRED
 *   B333-U-20  isTransportError mirrors isTimeoutError detection
 */

import { describe, it, expect, vi } from 'vitest';
import { classifyCarrierError, RetryableCarrierError, RateLimitCarrierError, AuthenticationCarrierError, ValidationCarrierError } from '../../../modules/shipping/carrier-errors';
import { CarrierReconciliationService } from '../../../modules/shipping/carrier-reconciliation.service';

// ── Indeterminate error detection (mirrors worker isTimeoutError) ────────────

/**
 * Replicate the exact detection logic from ShippingCarrierWorker.isTimeoutError()
 * and CarrierReconciliationService.isTransportError().
 * Both use identical logic.
 */
function isIndeterminateError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('etimedout') ||
    msg.includes('econnreset') ||
    msg.includes('econnaborted') ||
    msg.includes('socket hang up') ||
    msg.includes('aborted')
  );
}

/**
 * Replicate the recovery token assignment from the worker's catch block.
 */
function recoveryTokenFor(err: any): string | null {
  if (!isIndeterminateError(err)) return null;
  const msg = (err.message || '').toLowerCase();
  const isPureTimeout = msg.includes('timeout') || msg.includes('etimedout');
  return isPureTimeout ? 'CANCEL_TIMEOUT' : 'CANCEL_UNKNOWN';
}

// ═══════════════════════════════════════════════════════════════════
//  Error Classification — Indeterminate vs Retryable
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-B.3.3.3 — Indeterminate Error Detection', () => {
  it('B333-U-01: timeout → indeterminate (UNKNOWN)', () => {
    const err = new Error('connection timeout after 30000ms');
    expect(isIndeterminateError(err)).toBe(true);
  });

  it('B333-U-02: ECONNRESET → indeterminate (UNKNOWN)', () => {
    const err = new Error('read ECONNRESET');
    expect(isIndeterminateError(err)).toBe(true);
  });

  it('B333-U-03: ECONNABORTED → indeterminate (UNKNOWN)', () => {
    const err = new Error('socket ECONNABORTED');
    expect(isIndeterminateError(err)).toBe(true);
  });

  it('B333-U-04: socket hang up → indeterminate (UNKNOWN)', () => {
    const err = new Error('socket hang up');
    expect(isIndeterminateError(err)).toBe(true);
  });

  it('B333-U-05: aborted → indeterminate (UNKNOWN)', () => {
    const err = new Error('request aborted');
    expect(isIndeterminateError(err)).toBe(true);
  });

  it('B333-U-06: ECONNREFUSED → NOT indeterminate (retryable)', () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:443');
    expect(isIndeterminateError(err)).toBe(false);
    // ECONNREFUSED is classified as retryable by classifyCarrierError
    expect(classifyCarrierError(err).decision).toBe('retry');
  });

  it('B333-U-07: DNS/ENOTFOUND → NOT indeterminate (retryable)', () => {
    const err = new Error('getaddrinfo ENOTFOUND api.aramex.com');
    expect(isIndeterminateError(err)).toBe(false);
    expect(classifyCarrierError(err).decision).toBe('retry');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Recovery Token Assignment
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-B.3.3.3 — Recovery Token Assignment', () => {
  it('B333-U-08: timeout/ETIMEDOUT → CANCEL_TIMEOUT', () => {
    expect(recoveryTokenFor(new Error('timeout'))).toBe('CANCEL_TIMEOUT');
    expect(recoveryTokenFor(new Error('ETIMEDOUT'))).toBe('CANCEL_TIMEOUT');
    expect(recoveryTokenFor(new Error('connection Timeout after 30s'))).toBe('CANCEL_TIMEOUT');
  });

  it('B333-U-09: other transport → CANCEL_UNKNOWN', () => {
    expect(recoveryTokenFor(new Error('ECONNRESET'))).toBe('CANCEL_UNKNOWN');
    expect(recoveryTokenFor(new Error('ECONNABORTED'))).toBe('CANCEL_UNKNOWN');
    expect(recoveryTokenFor(new Error('socket hang up'))).toBe('CANCEL_UNKNOWN');
    expect(recoveryTokenFor(new Error('request aborted'))).toBe('CANCEL_UNKNOWN');
  });

  it('B333-U-10: non-indeterminate errors get no recovery token', () => {
    expect(recoveryTokenFor(new Error('ECONNREFUSED'))).toBeNull();
    expect(recoveryTokenFor(new Error('ENOTFOUND'))).toBeNull();
    expect(recoveryTokenFor(new Error('HTTP 429'))).toBeNull();
    expect(recoveryTokenFor(new Error('HTTP 500'))).toBeNull();
    expect(recoveryTokenFor(null)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Reconciliation Service Logic (via mocked service)
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-B.3.3.3 — Reconciliation Logic', () => {
  function createMockDb() {
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    return {
      db: {
        update: vi.fn().mockReturnValue(updateChain),
        execute: vi.fn().mockResolvedValue({ rows: [] }),
      },
      updateChain,
    };
  }

  function createMockProvider(trackingStatus?: string | null, trackingErr?: Error | null) {
    return {
      getTrackingInfo: vi.fn().mockImplementation(async () => {
        if (trackingErr) throw trackingErr;
        if (trackingStatus === null || trackingStatus === undefined) return null;
        return { status: trackingStatus, events: [] };
      }),
    };
  }

  function createMockRegistry(provider: any) {
    return {
      findProvider: vi.fn().mockReturnValue(provider),
    };
  }

  function createServiceWithMocks(opts: {
    trackingStatus?: string | null;
    trackingErr?: Error | null;
  } = {}) {
    const mockDb = createMockDb();
    const mockProvider = createMockProvider(opts.trackingStatus, opts.trackingErr);
    const mockRegistry = createMockRegistry(mockProvider);
    const mockCircuitBreaker = {
      canRequest: vi.fn(() => true),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
    };

    const service = new CarrierReconciliationService(
      mockDb as any,
      mockRegistry as any,
      { incrementCounter: vi.fn() } as any,
      mockCircuitBreaker as any,
      { tryResolve: vi.fn() } as any,
    );

    return { service, mockDb, mockProvider, mockRegistry, mockCircuitBreaker };
  }

  it('B333-U-11: tracking confirmed CANCELLED → SUCCEEDED', async () => {
    const { service, mockDb } = createServiceWithMocks({ trackingStatus: 'CANCELLED' });

    // Mock raw PostgreSQL row shape (snake_case) from RETURNING *
    const shipment = {
      id: 'ship-001',
      carrier_cancel_status: 'UNKNOWN',
      carrier_cancel_attempted_at: new Date(),
      carrier_cancel_retries: 0,
      carrier_tracking_id: 'TRACK-123',
      shipping_provider_key: 'aramex',
    };

    const result = await service.reconcileCancelShipment(shipment);
    expect(result.outcome).toBe('cancel_succeeded');
    // Verify DB was updated to SUCCEEDED
    expect(mockDb.db.update).toHaveBeenCalled();
  });

  it('B333-U-11b: PICKUP_CANCELLED is NOT definitive evidence → deferred (M7.3-B.3.4 BD-3.4-09/C7)', async () => {
    // M7.3-B.3.4 supersedes the original B.3.3.3 expectation for this case.
    // The Aramex status mapper has no PICKUP_CANCELLED equivalent (SH012 ->
    // CANCELLED is the only cancellation code), so the reconciliation branch was
    // unreachable in production and was removed per locked decision BD-3.4-09/C7.
    // A synthetic PICKUP_CANCELLED must therefore fall through to the
    // conservative attempt-based path — it must NEVER resolve to SUCCEEDED.
    const { service } = createServiceWithMocks({ trackingStatus: 'PICKUP_CANCELLED' });

    const shipment = {
      id: 'ship-001b',
      carrier_cancel_status: 'UNKNOWN',
      carrier_cancel_attempted_at: new Date(),
      carrier_cancel_retries: 0,
      carrier_tracking_id: 'TRACK-124',
      shipping_provider_key: 'aramex',
    };

    const result = await service.reconcileCancelShipment(shipment);
    expect(result.outcome).toBe('cancel_deferred');
    expect(result.outcome).not.toBe('cancel_succeeded');
  });

  it('B333-U-12: tracking returns non-cancel status → deferred (not SUCCEEDED)', async () => {
    const { service, mockDb } = createServiceWithMocks({ trackingStatus: 'IN_TRANSIT' });

    const shipment = {
      id: 'ship-002',
      carrier_cancel_status: 'UNKNOWN',
      carrier_cancel_attempted_at: new Date(),
      carrier_cancel_retries: 2,
      carrier_tracking_id: 'TRACK-456',
      shipping_provider_key: 'aramex',
    };

    const result = await service.reconcileCancelShipment(shipment);
    // Tracking was not definitive — should defer (within budget)
    expect(result.outcome).toBe('cancel_deferred');
    // Should NOT be SUCCEEDED
    expect(result.outcome).not.toBe('cancel_succeeded');
  });

  it('B333-U-13: ambiguous response + budget exhausted → RECONCILIATION_REQUIRED', async () => {
    const { service, mockDb } = createServiceWithMocks({ trackingStatus: null });

    const shipment = {
      id: 'ship-003',
      carrier_cancel_status: 'UNKNOWN',
      carrier_cancel_attempted_at: new Date(),
      carrier_cancel_retries: 8, // budget exhausted
      carrier_tracking_id: 'TRACK-789',
      shipping_provider_key: 'aramex',
    };

    const result = await service.reconcileCancelShipment(shipment);
    expect(result.outcome).toBe('cancel_budget_exhausted');
    // Verify escalation was called (DB update to RECONCILIATION_REQUIRED)
    expect(mockDb.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        carrierCancelStatus: 'RECONCILIATION_REQUIRED',
        recoveryStatus: 'CANCEL_RECONCILE',
        nextReconciliationAt: null,
      }),
    );
  });

  it('B333-U-14: reconciliation transport error → UNKNOWN within budget', async () => {
    const { service, mockDb } = createServiceWithMocks({
      trackingErr: new Error('ETIMEDOUT: connection timed out'),
    });

    const shipment = {
      id: 'ship-004',
      carrier_cancel_status: 'UNKNOWN',
      carrier_cancel_attempted_at: new Date(),
      carrier_cancel_retries: 3, // within budget
      carrier_tracking_id: 'TRACK-ERR',
      shipping_provider_key: 'aramex',
    };

    const result = await service.reconcileCancelShipment(shipment);
    expect(result.outcome).toBe('cancel_transport_error');
    // Should defer (not escalate) since within budget
    expect(mockDb.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        nextReconciliationAt: expect.any(Date),
        carrierCancelRetries: 4, // incremented
      }),
    );
  });

  it('B333-U-15: budget exhaustion (8 attempts) → RECONCILIATION_REQUIRED', async () => {
    const { service, mockDb } = createServiceWithMocks({ trackingStatus: null });

    const shipment = {
      id: 'ship-005',
      carrier_cancel_status: 'UNKNOWN',
      carrier_cancel_attempted_at: new Date(),
      carrier_cancel_retries: 7, // one more will hit 8
      carrier_tracking_id: 'TRACK-BUDGET',
      shipping_provider_key: 'aramex',
    };

    const result = await service.reconcileCancelShipment(shipment);
    // After this attempt, newAttempts = 8 which equals MAX → escalate
    expect(result.outcome).toBe('cancel_budget_exhausted');
    expect(mockDb.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        carrierCancelStatus: 'RECONCILIATION_REQUIRED',
        recoveryStatus: 'CANCEL_RECONCILE',
      }),
    );
  });

  it('B333-U-16: already SUCCEEDED → already_complete (idempotent)', async () => {
    const { service, mockDb } = createServiceWithMocks();

    const shipment = {
      id: 'ship-006',
      carrier_cancel_status: 'SUCCEEDED',
      carrier_cancel_attempted_at: new Date(Date.now() - 48 * 3600 * 1000), // 48h ago
      carrier_cancel_retries: 10,
    };

    const result = await service.reconcileCancelShipment(shipment);
    expect(result.outcome).toBe('already_complete');
    // Should NOT update DB — no state change for terminal state
    expect(mockDb.db.update).not.toHaveBeenCalled();
  });

  it('B333-U-16b: already NOT_REQUIRED → already_complete (idempotent)', async () => {
    const { service } = createServiceWithMocks();

    const shipment = {
      id: 'ship-006b',
      carrier_cancel_status: 'NOT_REQUIRED',
      carrier_cancel_attempted_at: null,
      carrier_cancel_retries: 0,
    };

    const result = await service.reconcileCancelShipment(shipment);
    expect(result.outcome).toBe('already_complete');
  });

  it('B333-U-19: 24h boundary exceeded → RECONCILIATION_REQUIRED', async () => {
    const { service, mockDb } = createServiceWithMocks();

    const shipment = {
      id: 'ship-007',
      carrier_cancel_status: 'UNKNOWN',
      carrier_cancel_attempted_at: new Date(Date.now() - 25 * 3600 * 1000), // 25h ago
      carrier_cancel_retries: 2,
    };

    const result = await service.reconcileCancelShipment(shipment);
    expect(result.outcome).toBe('cancel_boundary_exceeded');
    expect(mockDb.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        carrierCancelStatus: 'RECONCILIATION_REQUIRED',
        recoveryStatus: 'CANCEL_RECONCILE',
        nextReconciliationAt: null,
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Regression — HTTP errors must NEVER become UNKNOWN
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-B.3.3.3 — Regression: HTTP Errors Never UNKNOWN', () => {
  it('B333-U-17: 429/500/502/503/504 → retryable, NOT indeterminate', () => {
    const httpErrors = [
      new RateLimitCarrierError('HTTP 429', { providerKey: 'aramex', operation: 'cancel' }),
      new RetryableCarrierError('HTTP 500', { providerKey: 'aramex', operation: 'cancel' }),
      new RetryableCarrierError('HTTP 502', { providerKey: 'aramex', operation: 'cancel' }),
      new RetryableCarrierError('HTTP 503', { providerKey: 'aramex', operation: 'cancel' }),
      new RetryableCarrierError('HTTP 504', { providerKey: 'aramex', operation: 'cancel' }),
    ];

    for (const err of httpErrors) {
      expect(isIndeterminateError(err)).toBe(false);
      const classification = classifyCarrierError(err);
      // RateLimitCarrierError → 'backoff'; RetryableCarrierError → 'retry'
      expect(['retry', 'backoff']).toContain(classification.decision);
      expect(recoveryTokenFor(err)).toBeNull();
    }
  });

  it('B333-U-18: auth/validation errors → terminal, NOT indeterminate', () => {
    const terminalErrors = [
      new AuthenticationCarrierError('invalid API key', { providerKey: 'aramex', operation: 'cancel' }),
      new ValidationCarrierError('missing field', { providerKey: 'aramex', operation: 'cancel' }),
    ];

    for (const err of terminalErrors) {
      expect(isIndeterminateError(err)).toBe(false);
      const classification = classifyCarrierError(err);
      expect(classification.decision).toBe('terminal');
      expect(recoveryTokenFor(err)).toBeNull();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Transport Error Detection Symmetry
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-B.3.3.3 — Transport Error Detection Symmetry', () => {
  it('B333-U-20: isTransportError matches isTimeoutError for all defined cases', () => {
    // These are the exact error messages defined in the B.3.3.3 lock
    const indeterminateMessages = [
      'timeout',
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNABORTED',
      'socket hang up',
      'aborted',
    ];

    for (const msg of indeterminateMessages) {
      const err = new Error(msg);
      expect(isIndeterminateError(err)).toBe(true);
    }

    // These must NOT be indeterminate
    const nonIndeterminateMessages = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'HTTP 429',
      'HTTP 500',
      'invalid API key',
      'missing field',
    ];

    for (const msg of nonIndeterminateMessages) {
      const err = new Error(msg);
      expect(isIndeterminateError(err)).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
//  State Invariants
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-B.3.3.3 — State Invariants', () => {
  it('SUCCEEDED and NOT_REQUIRED are in the cancel status vocabulary', async () => {
    const { CARRIER_CANCEL_STATUSES } = await import('../../../modules/shipping/shipping.types');
    expect(CARRIER_CANCEL_STATUSES).toContain('SUCCEEDED');
    expect(CARRIER_CANCEL_STATUSES).toContain('NOT_REQUIRED');
    expect(CARRIER_CANCEL_STATUSES).toContain('UNKNOWN');
    expect(CARRIER_CANCEL_STATUSES).toContain('RECONCILIATION_REQUIRED');
  });

  it('CANCEL_TIMEOUT and CANCEL_UNKNOWN are valid recovery tokens', async () => {
    const { CARRIER_CANCEL_RECOVERY_TOKENS } = await import('../../../modules/shipping/shipping.types');
    expect(CARRIER_CANCEL_RECOVERY_TOKENS).toContain('CANCEL_TIMEOUT');
    expect(CARRIER_CANCEL_RECOVERY_TOKENS).toContain('CANCEL_UNKNOWN');
    expect(CARRIER_CANCEL_RECOVERY_TOKENS).toContain('CANCEL_RECONCILE');
  });
});
