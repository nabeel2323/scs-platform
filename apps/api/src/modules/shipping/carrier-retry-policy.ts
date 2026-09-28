/**
 * Carrier Retry Policy — M7.2.3-C
 *
 * Centralized, configurable retry policy for all carrier operations.
 *
 * Features:
 *   - Uses existing classifyCarrierError() for error classification
 *   - Exponential backoff with configurable initial/max delay
 *   - Jitter to prevent thundering herd
 *   - Rate-limit aware: respects Retry-After from RateLimitCarrierError
 *   - Terminal errors: no retry
 *   - Configurable via CARRIER_RETRY_* env vars
 *
 * Does NOT:
 *   - Perform the retry itself (that's the worker's job)
 *   - Know about specific carrier providers
 *   - Log anything (observability is the caller's responsibility)
 */

import { Injectable } from '@nestjs/common';
import {
  classifyCarrierError,
  RateLimitCarrierError,
} from './carrier-errors';

// ── Types ───────────────────────────────────────────────────────────────────

export type RetryDecision = 'retry' | 'backoff' | 'terminal' | 'unsupported';

export interface RetryClassification {
  /** What the worker should do. */
  decision: RetryDecision;
  /** When to next attempt (null = no more attempts). */
  nextAttemptAt: Date | null;
  /** Human-readable redacted message safe for logging/persistence. */
  safeMessage: string;
  /** Whether the retry budget is exhausted. */
  isFinal: boolean;
}

export interface BackoffOptions {
  /** Initial delay in milliseconds. Default: 30_000 (30s). */
  initialDelayMs?: number;
  /** Maximum delay cap in milliseconds. Default: 3_600_000 (1h). */
  maxDelayMs?: number;
  /** Maximum number of attempts before dead-letter. Default: 8. */
  maxAttempts?: number;
  /** Whether to add jitter. Default: true. */
  jitter?: boolean;
}

// ── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_INITIAL_DELAY_MS = 30_000;
const DEFAULT_MAX_DELAY_MS = 3_600_000;
const DEFAULT_MAX_ATTEMPTS = 8;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// ── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class CarrierRetryPolicy {
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxAttempts: number;

  constructor() {
    this.initialDelayMs = envInt('CARRIER_RETRY_INITIAL_DELAY_MS', DEFAULT_INITIAL_DELAY_MS);
    this.maxDelayMs = envInt('CARRIER_RETRY_MAX_DELAY_MS', DEFAULT_MAX_DELAY_MS);
    this.maxAttempts = envInt('CARRIER_RETRY_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS);
  }

  /**
   * Classify an error and compute the next retry date.
   *
   * @param err          The error thrown by the carrier provider.
   * @param attempt      The attempt number that just failed (1-based).
   * @param opts         Optional per-call overrides.
   */
  classify(
    err: unknown,
    attempt: number,
    opts: BackoffOptions = {},
  ): RetryClassification {
    const base = classifyCarrierError(err);
    const isFinal = attempt >= this.resolveMaxAttempts(opts);

    // Terminal or unsupported — no retry regardless of budget
    if (base.decision === 'terminal' || base.decision === 'unsupported') {
      return {
        decision: base.decision,
        nextAttemptAt: null,
        safeMessage: base.safeMessage,
        isFinal: true,
      };
    }

    // Budget exhausted — dead-letter
    if (isFinal) {
      return {
        decision: 'terminal',
        nextAttemptAt: null,
        safeMessage: `${base.safeMessage} (max attempts reached)`,
        isFinal: true,
      };
    }

    // Compute delay
    const delayMs = this.calculateDelay(err, attempt, opts);

    return {
      decision: base.decision,
      nextAttemptAt: new Date(Date.now() + delayMs),
      safeMessage: base.safeMessage,
      isFinal: false,
    };
  }

  /**
   * Calculate backoff delay in milliseconds.
   *
   * Rate-limit errors:
   *   - If Retry-After is set, use it (converted to ms).
   *   - Otherwise, use 2x the normal exponential backoff.
   *
   * Normal retryable errors:
   *   - Exponential backoff: initialDelay * 2^(attempt-1), capped at maxDelay.
   *   - With ±25% jitter when enabled.
   */
  calculateDelay(
    err: unknown,
    attempt: number,
    opts: BackoffOptions = {},
  ): number {
    const initial = opts.initialDelayMs ?? this.initialDelayMs;
    const max = opts.maxDelayMs ?? this.maxDelayMs;
    const useJitter = opts.jitter ?? true;

    // Rate-limit: respect Retry-After
    if (err instanceof RateLimitCarrierError && err.retryAfterSeconds) {
      return Math.min(err.retryAfterSeconds * 1000, max);
    }

    // Rate-limit without Retry-After: 2x normal backoff
    const multiplier = err instanceof RateLimitCarrierError ? 2 : 1;

    // Exponential: initial * 2^(attempt-1)
    const exponential = initial * Math.pow(2, Math.max(0, attempt - 1)) * multiplier;
    const capped = Math.min(exponential, max);

    if (!useJitter) return capped;

    // ±25% jitter
    const jitterRange = capped * 0.25;
    const jitter = jitterRange * (Math.random() * 2 - 1);
    return Math.max(0, Math.round(capped + jitter));
  }

  /**
   * Pure backoff calculation (static, no instance needed).
   * Useful for tests and external callers.
   */
  static calculateBackoff(
    attempt: number,
    opts: BackoffOptions = {},
  ): number {
    const initial = opts.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    const max = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    const useJitter = opts.jitter ?? true;

    const exponential = initial * Math.pow(2, Math.max(0, attempt - 1));
    const capped = Math.min(exponential, max);

    if (!useJitter) return capped;

    const jitterRange = capped * 0.25;
    const jitter = jitterRange * (Math.random() * 2 - 1);
    return Math.max(0, Math.round(capped + jitter));
  }

  getMaxAttempts(): number {
    return this.maxAttempts;
  }

  private resolveMaxAttempts(opts: BackoffOptions): number {
    return opts.maxAttempts ?? this.maxAttempts;
  }
}
