/**
 * Carrier Error Hierarchy — M7.2.3-B.1
 *
 * Carrier-neutral error classification for external carrier operations.
 *
 * Hierarchy:
 *   CarrierError (base)
 *   ├── RetryableCarrierError       → retry per backoff policy
 *   ├── RateLimitCarrierError       → backoff (longer than normal retry)
 *   ├── NonRetryableCarrierError    → terminal failure
 *   ├── AuthenticationCarrierError  → do NOT blindly retry
 *   ├── ValidationCarrierError      → do NOT retry (bad input)
 *   └── UnsupportedCarrierOperationError → terminal / unsupported
 *
 * The ShippingCarrierWorker uses the error type to decide retry behaviour.
 * Provider adapters throw the appropriate subclass; the worker inspects
 * `instanceof` to classify.
 *
 * SECRET REDACTION:
 *   The `toSafeMessage()` method returns a redacted string safe for logging
 *   and persistence.  It never includes request/response bodies that might
 *   contain credentials.
 */

// ── Base ────────────────────────────────────────────────────────────────────

export class CarrierError extends Error {
  /** Provider key that raised the error (e.g. 'aramex'). */
  readonly providerKey: string;

  /** The carrier operation being performed (e.g. 'createShipment'). */
  readonly operation: string;

  /** Optional carrier-native error code (e.g. Aramex 'ERR01'). */
  readonly carrierCode?: string;

  /** Whether the worker should retry this error. */
  readonly retryable: boolean;

  constructor(
    message: string,
    opts: {
      providerKey: string;
      operation: string;
      carrierCode?: string;
      retryable?: boolean;
    },
  ) {
    super(message);
    this.name = new.target.name;
    this.providerKey = opts.providerKey;
    this.operation = opts.operation;
    this.carrierCode = opts.carrierCode;
    this.retryable = opts.retryable ?? false;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Return a redacted error message safe for logging and database persistence.
   * Subclasses may override to include additional safe context.
   */
  toSafeMessage(): string {
    return `[${this.name}] ${this.providerKey}.${this.operation}: ${this.message}` +
      (this.carrierCode ? ` (carrier code: ${this.carrierCode})` : '');
  }
}

// ── Retryable ───────────────────────────────────────────────────────────────

/**
 * Transient failure — network timeout, 5xx response, temporary carrier outage.
 * Worker SHOULD retry according to backoff policy.
 */
export class RetryableCarrierError extends CarrierError {
  constructor(
    message: string,
    opts: { providerKey: string; operation: string; carrierCode?: string },
  ) {
    super(message, { ...opts, retryable: true });
  }
}

// ── Rate Limit ──────────────────────────────────────────────────────────────

/**
 * Carrier rate limit exceeded.
 * Worker SHOULD back off for longer than a normal retry.
 * Some carriers return this inside a "fake 200" envelope.
 */
export class RateLimitCarrierError extends CarrierError {
  /** Seconds the carrier asked us to wait (if provided). */
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    opts: {
      providerKey: string;
      operation: string;
      carrierCode?: string;
      retryAfterSeconds?: number;
    },
  ) {
    super(message, { ...opts, retryable: true });
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }

  override toSafeMessage(): string {
    const base = super.toSafeMessage();
    return this.retryAfterSeconds
      ? `${base} — retry after ${this.retryAfterSeconds}s`
      : base;
  }
}

// ── Non-Retryable ───────────────────────────────────────────────────────────

/**
 * Terminal failure — the operation cannot succeed by retrying.
 * Examples: account suspended, service unavailable for this route,
 * invalid credentials format, etc.
 */
export class NonRetryableCarrierError extends CarrierError {
  constructor(
    message: string,
    opts: { providerKey: string; operation: string; carrierCode?: string },
  ) {
    super(message, { ...opts, retryable: false });
  }
}

// ── Authentication ──────────────────────────────────────────────────────────

/**
 * Authentication / authorisation failure.
 * Worker MUST NOT blindly retry — credentials need human review.
 * Examples: invalid API key, expired token, wrong account number.
 */
export class AuthenticationCarrierError extends CarrierError {
  constructor(
    message: string,
    opts: { providerKey: string; operation: string; carrierCode?: string },
  ) {
    super(message, { ...opts, retryable: false });
  }
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Input validation error from the carrier.
 * Worker MUST NOT retry — the request itself is invalid.
 * Examples: missing required field, invalid address, overweight package.
 */
export class ValidationCarrierError extends CarrierError {
  /** Field-level validation errors returned by the carrier. */
  readonly fieldErrors?: ReadonlyArray<{ field: string; message: string }>;

  constructor(
    message: string,
    opts: {
      providerKey: string;
      operation: string;
      carrierCode?: string;
      fieldErrors?: ReadonlyArray<{ field: string; message: string }>;
    },
  ) {
    super(message, { ...opts, retryable: false });
    this.fieldErrors = opts.fieldErrors;
  }

  override toSafeMessage(): string {
    const base = super.toSafeMessage();
    if (!this.fieldErrors?.length) return base;
    const fields = this.fieldErrors.map((f) => `${f.field}: ${f.message}`).join('; ');
    return `${base} — fields: [${fields}]`;
  }
}

// ── Unsupported Operation ───────────────────────────────────────────────────

/**
 * The provider does not support the requested operation.
 * Terminal — the worker should mark the event as unsupported and move on.
 */
export class UnsupportedCarrierOperationError extends CarrierError {
  constructor(
    message: string,
    opts: { providerKey: string; operation: string },
  ) {
    super(message, { ...opts, retryable: false });
  }
}

// ── Classification helper ───────────────────────────────────────────────────

/**
 * Classify any error into a retry decision.
 *
 * Returns:
 *   'retry'          — transient, retry per backoff
 *   'backoff'        — rate limited, retry with extended delay
 *   'terminal'       — do not retry, mark as failed
 *   'unsupported'    — operation not supported, mark as skipped
 */
export function classifyCarrierError(err: unknown): {
  decision: 'retry' | 'backoff' | 'terminal' | 'unsupported';
  safeMessage: string;
} {
  if (err instanceof UnsupportedCarrierOperationError) {
    return { decision: 'unsupported', safeMessage: err.toSafeMessage() };
  }
  if (err instanceof RateLimitCarrierError) {
    return { decision: 'backoff', safeMessage: err.toSafeMessage() };
  }
  if (err instanceof RetryableCarrierError) {
    return { decision: 'retry', safeMessage: err.toSafeMessage() };
  }
  if (err instanceof AuthenticationCarrierError) {
    return { decision: 'terminal', safeMessage: err.toSafeMessage() };
  }
  if (err instanceof ValidationCarrierError) {
    return { decision: 'terminal', safeMessage: err.toSafeMessage() };
  }
  if (err instanceof NonRetryableCarrierError) {
    return { decision: 'terminal', safeMessage: err.toSafeMessage() };
  }
  if (err instanceof CarrierError) {
    // Generic carrier error — use the retryable flag
    return {
      decision: err.retryable ? 'retry' : 'terminal',
      safeMessage: err.toSafeMessage(),
    };
  }

  // Non-carrier error — treat as retryable transient (network, timeout, etc.)
  const msg = err instanceof Error ? err.message : String(err);
  return { decision: 'retry', safeMessage: `[UnknownError] ${msg}` };
}
