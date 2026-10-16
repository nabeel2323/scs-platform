/**
 * Carrier Circuit Breaker — M7.2.3-C
 *
 * Per-provider circuit breaker to prevent cascading failures when a
 * carrier API is down or consistently failing.
 *
 * States:
 *   CLOSED    — normal operation, requests pass through
 *   OPEN      — carrier is failing, requests are blocked
 *   HALF_OPEN — testing if carrier has recovered
 *
 * Scope: providerKey + environment (e.g. 'aramex:sandbox').
 *        Org A's failures do NOT affect Org B unless they share
 *        the same provider+environment scope.
 *
 * Manual providers are NEVER affected (provider isolation).
 *
 * Configuration via CARRIER_CB_* env vars or constructor opts.
 */

import { Injectable, Logger } from '@nestjs/common';

// ── Types ───────────────────────────────────────────────────────────────────

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /** Consecutive failures before opening. Default: 5. */
  failureThreshold?: number;
  /** Milliseconds to wait before transitioning OPEN → HALF_OPEN. Default: 60_000. */
  cooldownMs?: number;
  /** Successful test requests in HALF_OPEN to close. Default: 1. */
  successThreshold?: number;
}

interface BreakerEntry {
  state: CircuitBreakerState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureAt: number;
  lastStateChangeAt: number;
}

// ── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_COOLDOWN_MS = 60_000;
const DEFAULT_SUCCESS_THRESHOLD = 1;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// ── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class CarrierCircuitBreaker {
  private readonly logger = new Logger(CarrierCircuitBreaker.name);
  private readonly breakers = new Map<string, BreakerEntry>();

  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly successThreshold: number;

  constructor() {
    this.failureThreshold = envInt('CARRIER_CB_FAILURE_THRESHOLD', DEFAULT_FAILURE_THRESHOLD);
    this.cooldownMs = envInt('CARRIER_CB_COOLDOWN_MS', DEFAULT_COOLDOWN_MS);
    this.successThreshold = envInt('CARRIER_CB_SUCCESS_THRESHOLD', DEFAULT_SUCCESS_THRESHOLD);
  }

  /**
   * Check if a request to the given provider is allowed.
   *
   * Returns true if the circuit is CLOSED or HALF_OPEN (request may proceed).
   * Returns false if OPEN (request should be skipped/rescheduled).
   *
   * Automatically transitions OPEN → HALF_OPEN when cooldown expires.
   */
  canRequest(scopeKey: string): boolean {
    const entry = this.getOrCreate(scopeKey);

    // Check if OPEN breaker should transition to HALF_OPEN
    if (entry.state === 'OPEN') {
      const elapsed = Date.now() - entry.lastFailureAt;
      if (elapsed >= this.cooldownMs) {
        this.transition(entry, 'HALF_OPEN', scopeKey);
        return true;
      }
      return false;
    }

    // CLOSED or HALF_OPEN — allow
    return true;
  }

  /**
   * Record a successful request to the given provider.
   *
   * In HALF_OPEN: increments success counter; if threshold reached → CLOSED.
   * In CLOSED: resets consecutive failure counter.
   */
  recordSuccess(scopeKey: string): void {
    const entry = this.getOrCreate(scopeKey);
    entry.consecutiveFailures = 0;

    if (entry.state === 'HALF_OPEN') {
      entry.consecutiveSuccesses++;
      if (entry.consecutiveSuccesses >= this.successThreshold) {
        this.transition(entry, 'CLOSED', scopeKey);
      }
    }
  }

  /**
   * Record a failed request to the given provider.
   *
   * In CLOSED: increments failure counter; if threshold reached → OPEN.
   * In HALF_OPEN: immediately → OPEN (test request failed).
   */
  recordFailure(scopeKey: string): void {
    const entry = this.getOrCreate(scopeKey);
    entry.consecutiveFailures++;
    entry.consecutiveSuccesses = 0;
    entry.lastFailureAt = Date.now();

    if (entry.state === 'HALF_OPEN') {
      // Test request failed — reopen
      this.transition(entry, 'OPEN', scopeKey);
      return;
    }

    if (entry.state === 'CLOSED' && entry.consecutiveFailures >= this.failureThreshold) {
      this.transition(entry, 'OPEN', scopeKey);
    }
  }

  /**
   * Get the current state of a breaker.
   */
  getState(scopeKey: string): CircuitBreakerState {
    const entry = this.getOrCreate(scopeKey);

    // Auto-transition OPEN → HALF_OPEN on query
    if (entry.state === 'OPEN') {
      const elapsed = Date.now() - entry.lastFailureAt;
      if (elapsed >= this.cooldownMs) {
        this.transition(entry, 'HALF_OPEN', scopeKey);
      }
    }

    return entry.state;
  }

  /**
   * Build a scope key from provider key and environment.
   */
  static scopeKey(providerKey: string, environment = 'production'): string {
    return `${providerKey}:${environment}`;
  }

  /**
   * Reset a breaker (for admin use or testing).
   */
  reset(scopeKey: string): void {
    this.breakers.delete(scopeKey);
    this.logger.log(`Circuit breaker reset: ${scopeKey}`);
  }

  /**
   * Get a snapshot of all breaker states (for observability).
   */
  snapshot(): Record<string, { state: CircuitBreakerState; failures: number }> {
    const result: Record<string, { state: CircuitBreakerState; failures: number }> = {};
    for (const [key, entry] of this.breakers) {
      result[key] = { state: entry.state, failures: entry.consecutiveFailures };
    }
    return result;
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private getOrCreate(scopeKey: string): BreakerEntry {
    let entry = this.breakers.get(scopeKey);
    if (!entry) {
      entry = {
        state: 'CLOSED',
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        lastFailureAt: 0,
        lastStateChangeAt: Date.now(),
      };
      this.breakers.set(scopeKey, entry);
    }
    return entry;
  }

  private transition(entry: BreakerEntry, newState: CircuitBreakerState, scopeKey: string): void {
    const oldState = entry.state;
    entry.state = newState;
    entry.lastStateChangeAt = Date.now();

    if (newState === 'CLOSED') {
      entry.consecutiveFailures = 0;
      entry.consecutiveSuccesses = 0;
    }
    if (newState === 'HALF_OPEN') {
      entry.consecutiveSuccesses = 0;
    }

    this.logger.warn(
      `Circuit breaker ${scopeKey}: ${oldState} → ${newState} ` +
      `(failures: ${entry.consecutiveFailures})`,
    );
  }
}
