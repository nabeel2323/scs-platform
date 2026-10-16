/**
 * Carrier Circuit Breaker — Unit Tests (M7.2.3-C)
 *
 * Tests:
 *   - State transitions (CLOSED → OPEN → HALF_OPEN → CLOSED)
 *   - Failure/success thresholds
 *   - Per-provider isolation
 *   - Cooldown auto-transition
 *   - Reset and snapshot
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CarrierCircuitBreaker, CircuitBreakerState } from '../../../modules/shipping/carrier-circuit-breaker';

describe('CarrierCircuitBreaker', () => {
  let cb: CarrierCircuitBreaker;

  beforeEach(() => {
    // Use low thresholds for testing
    process.env['CARRIER_CB_FAILURE_THRESHOLD'] = '3';
    process.env['CARRIER_CB_COOLDOWN_MS'] = '100';
    process.env['CARRIER_CB_SUCCESS_THRESHOLD'] = '1';
    cb = new CarrierCircuitBreaker();
  });

  afterEach(() => {
    delete process.env['CARRIER_CB_FAILURE_THRESHOLD'];
    delete process.env['CARRIER_CB_COOLDOWN_MS'];
    delete process.env['CARRIER_CB_SUCCESS_THRESHOLD'];
  });

  // ── Initial State ────────────────────────────────────────────────────

  it('starts in CLOSED state', () => {
    expect(cb.getState('aramex:production')).toBe('CLOSED');
  });

  it('canRequest returns true when CLOSED', () => {
    expect(cb.canRequest('aramex:production')).toBe(true);
  });

  // ── CLOSED → OPEN ────────────────────────────────────────────────────

  it('transitions to OPEN after consecutive failures reach threshold', () => {
    const scope = 'aramex:production';
    cb.recordFailure(scope);
    expect(cb.getState(scope)).toBe('CLOSED');
    cb.recordFailure(scope);
    expect(cb.getState(scope)).toBe('CLOSED');
    cb.recordFailure(scope); // 3rd failure = threshold
    expect(cb.getState(scope)).toBe('OPEN');
  });

  it('blocks requests when OPEN', () => {
    const scope = 'aramex:production';
    cb.recordFailure(scope);
    cb.recordFailure(scope);
    cb.recordFailure(scope);
    expect(cb.canRequest(scope)).toBe(false);
  });

  // ── OPEN → HALF_OPEN ─────────────────────────────────────────────────

  it('transitions to HALF_OPEN after cooldown expires', async () => {
    const scope = 'aramex:production';
    cb.recordFailure(scope);
    cb.recordFailure(scope);
    cb.recordFailure(scope);
    expect(cb.getState(scope)).toBe('OPEN');

    // Wait for cooldown (100ms)
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(cb.canRequest(scope)).toBe(true);
    expect(cb.getState(scope)).toBe('HALF_OPEN');
  });

  // ── HALF_OPEN → CLOSED ──────────────────────────────────────────────

  it('transitions to CLOSED after success in HALF_OPEN', async () => {
    const scope = 'aramex:production';
    cb.recordFailure(scope);
    cb.recordFailure(scope);
    cb.recordFailure(scope);

    await new Promise(resolve => setTimeout(resolve, 150));

    // Now in HALF_OPEN
    expect(cb.canRequest(scope)).toBe(true);

    // Record a success → should close
    cb.recordSuccess(scope);
    expect(cb.getState(scope)).toBe('CLOSED');
  });

  // ── HALF_OPEN → OPEN ────────────────────────────────────────────────

  it('reopens on failure in HALF_OPEN', async () => {
    const scope = 'aramex:production';
    cb.recordFailure(scope);
    cb.recordFailure(scope);
    cb.recordFailure(scope);

    await new Promise(resolve => setTimeout(resolve, 150));

    // Now in HALF_OPEN — fail again
    cb.recordFailure(scope);
    expect(cb.getState(scope)).toBe('OPEN');
  });

  // ── Per-Provider Isolation ──────────────────────────────────────────

  it('isolates breakers per provider scope', () => {
    const aramex = 'aramex:production';
    const smsa = 'smsa:production';

    // Fail aramex
    cb.recordFailure(aramex);
    cb.recordFailure(aramex);
    cb.recordFailure(aramex);
    expect(cb.getState(aramex)).toBe('OPEN');

    // smsa should still be CLOSED
    expect(cb.getState(smsa)).toBe('CLOSED');
    expect(cb.canRequest(smsa)).toBe(true);
  });

  // ── Success Resets Failures ──────────────────────────────────────────

  it('resets consecutive failures on success', () => {
    const scope = 'aramex:production';
    cb.recordFailure(scope);
    cb.recordFailure(scope);
    cb.recordSuccess(scope); // resets
    cb.recordFailure(scope);
    expect(cb.getState(scope)).toBe('CLOSED'); // only 1 consecutive failure
  });

  // ── Scope Key Helper ─────────────────────────────────────────────────

  it('scopeKey builds provider:environment format', () => {
    expect(CarrierCircuitBreaker.scopeKey('aramex')).toBe('aramex:production');
    expect(CarrierCircuitBreaker.scopeKey('aramex', 'sandbox')).toBe('aramex:sandbox');
  });

  // ── Reset ────────────────────────────────────────────────────────────

  it('reset clears breaker state', () => {
    const scope = 'aramex:production';
    cb.recordFailure(scope);
    cb.recordFailure(scope);
    cb.recordFailure(scope);
    expect(cb.getState(scope)).toBe('OPEN');

    cb.reset(scope);
    expect(cb.getState(scope)).toBe('CLOSED');
  });

  // ── Snapshot ─────────────────────────────────────────────────────────

  it('snapshot returns all breaker states', () => {
    cb.recordFailure('aramex:production');
    cb.recordFailure('aramex:production');
    cb.recordFailure('smsa:production');

    const snap = cb.snapshot();
    expect(snap['aramex:production']).toEqual({ state: 'CLOSED', failures: 2 });
    expect(snap['smsa:production']).toEqual({ state: 'CLOSED', failures: 1 });
  });
});
