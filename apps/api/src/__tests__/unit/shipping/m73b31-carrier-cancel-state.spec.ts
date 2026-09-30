/**
 * M7.3-B.3.1 — Carrier-Cancel State Foundation: Unit Tests
 *
 * Pure TypeScript contract checks (no database, no carrier HTTP). Verifies the
 * state vocabulary, recovery-token set, and deterministic idempotency key that
 * migration 0049 + the Drizzle schema rely on. This phase establishes the
 * vocabulary only — no transitions, no provider/worker behavior.
 *
 * Covers:
 *   B31-U-01  Canonical cancel status vocabulary matches B.3.0 lock
 *   B31-U-02  Every cancel status fits VARCHAR(24)
 *   B31-U-03  Cancel vocabulary is independent from create vocabulary
 *   B31-U-04  Recovery tokens match B.3.0 lock and fit VARCHAR(24)
 *   B31-U-05  NOT_SUPPORTED token is rejected (uses NOT_REQUIRED status instead)
 *   B31-U-06  assertCarrierCancelStatus accepts valid / rejects invalid
 *   B31-U-07  generateCarrierCancelIdempotencyKey is deterministic and prefixed
 *   B31-U-08  Cancel key is distinct from create key for the same shipment
 */

import { describe, it, expect } from 'vitest';
import {
  CARRIER_CANCEL_STATUSES,
  CARRIER_CANCEL_RECOVERY_TOKENS,
  CARRIER_CREATE_STATUSES,
  assertCarrierCancelStatus,
  generateCarrierCancelIdempotencyKey,
  generateIdempotencyKey,
} from '../../../modules/shipping/shipping.types';

describe('M7.3-B.3.1 — Carrier-Cancel State Vocabulary', () => {
  it('B31-U-01: exposes exactly the canonical cancel statuses', () => {
    expect([...CARRIER_CANCEL_STATUSES].sort()).toEqual(
      [
        'FAILED',
        'IN_PROGRESS',
        'NOT_REQUIRED',
        'PENDING',
        'RECONCILIATION_REQUIRED',
        'RETRY',
        'SUCCEEDED',
        'UNKNOWN',
      ].sort(),
    );
  });

  it('B31-U-02: every cancel status fits VARCHAR(24)', () => {
    for (const s of CARRIER_CANCEL_STATUSES) {
      expect(s.length).toBeLessThanOrEqual(24);
    }
  });

  it('B31-U-03: cancel vocabulary is modeled independently from create vocabulary', () => {
    // Cancellation uses SUCCEEDED / NOT_REQUIRED / RECONCILIATION_REQUIRED /
    // UNKNOWN / RETRY, none of which are part of the create lifecycle.
    for (const s of ['SUCCEEDED', 'NOT_REQUIRED', 'RECONCILIATION_REQUIRED', 'UNKNOWN', 'RETRY']) {
      expect(CARRIER_CANCEL_STATUSES).toContain(s as any);
      expect(CARRIER_CREATE_STATUSES).not.toContain(s as any);
    }
    // Create uses SUCCESS, which must NOT leak into the cancel vocabulary.
    expect(CARRIER_CREATE_STATUSES).toContain('SUCCESS');
    expect(CARRIER_CANCEL_STATUSES).not.toContain('SUCCESS' as any);
  });

  it('B31-U-04: recovery tokens match the B.3.0 lock and fit VARCHAR(24)', () => {
    expect([...CARRIER_CANCEL_RECOVERY_TOKENS].sort()).toEqual(
      [
        'CANCEL_FAILED',
        'CANCEL_RECONCILE',
        'CANCEL_TIMEOUT',
        'CANCEL_UNKNOWN',
        'DELIVERED_AFTER_CANCEL',
      ].sort(),
    );
    for (const t of CARRIER_CANCEL_RECOVERY_TOKENS) {
      expect(t.length).toBeLessThanOrEqual(24);
    }
  });

  it('B31-U-05: NOT_SUPPORTED token is rejected; unsupported maps to NOT_REQUIRED status', () => {
    const tokens: readonly string[] = CARRIER_CANCEL_RECOVERY_TOKENS;
    expect(tokens).not.toContain('CARRIER_CANCEL_NOT_SUPPORTED');
    // CANCEL_UNKNOWN (14) is the width-safe replacement; the rejected 28-char
    // token would not fit VARCHAR(24), which is why it is excluded.
    expect(tokens).toContain('CANCEL_UNKNOWN');
    expect(CARRIER_CANCEL_STATUSES).toContain('NOT_REQUIRED');
  });
});

describe('M7.3-B.3.1 — Carrier-Cancel Helpers', () => {
  it('B31-U-06: assertCarrierCancelStatus accepts valid and rejects invalid', () => {
    for (const s of CARRIER_CANCEL_STATUSES) {
      expect(() => assertCarrierCancelStatus(s)).not.toThrow();
    }
    expect(() => assertCarrierCancelStatus('SUCCESS')).toThrow(/Invalid carrier cancel status/);
    expect(() => assertCarrierCancelStatus('BOGUS')).toThrow(/Invalid carrier cancel status/);
    expect(() => assertCarrierCancelStatus('')).toThrow();
  });

  it('B31-U-07: cancel idempotency key is deterministic and prefixed', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    const key = generateCarrierCancelIdempotencyKey(id);
    expect(key).toBe(`carrier-cancel:${id}`);
    // Deterministic: same shipment always produces the same key (no UUID).
    expect(generateCarrierCancelIdempotencyKey(id)).toBe(key);
    expect(generateCarrierCancelIdempotencyKey(id)).toBe(key);
    // The key must fit VARCHAR(120).
    expect(key.length).toBeLessThanOrEqual(120);
  });

  it('B31-U-08: cancel key is distinct from create key for the same shipment', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(generateCarrierCancelIdempotencyKey(id)).not.toBe(generateIdempotencyKey(id));
    expect(generateIdempotencyKey(id)).toBe(`carrier-create:${id}`);
  });
});
