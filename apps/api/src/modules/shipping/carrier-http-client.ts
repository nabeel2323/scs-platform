/**
 * Carrier HTTP Client — M7.2.3-B.1
 *
 * Carrier-neutral HTTP client for external carrier API calls.
 *
 * Features:
 *   - HTTPS with configurable timeout
 *   - Cancellation via AbortController
 *   - Correlation / request ID tracking
 *   - Structured logging with secret redaction
 *   - Response parsing (JSON, XML, plain text)
 *   - Retry classification (uses carrier-errors.ts)
 *   - Exponential backoff with jitter
 *   - Rate-limit detection
 *   - Safe error extraction (never logs credentials)
 *   - Transport-neutral: REST/JSON, REST/XML, SOAP
 *
 * Does NOT:
 *   - Install SOAP-specific dependencies
 *   - Hard-code any carrier-specific logic
 *   - Log passwords, API keys, tokens, or encrypted credential contents
 *
 * Uses Node.js native fetch() — no additional HTTP library required.
 */

import { Logger } from '@nestjs/common';
import {
  CarrierError,
  RetryableCarrierError,
  RateLimitCarrierError,
  AuthenticationCarrierError,
  ValidationCarrierError,
  NonRetryableCarrierError,
} from './carrier-errors';

// ── Types ───────────────────────────────────────────────────────────────────

export interface CarrierHttpClientConfig {
  /** Provider key for error classification (e.g. 'aramex'). */
  providerKey: string;
  /** Default request timeout in milliseconds. */
  timeoutMs?: number;
  /** Maximum number of retries for retryable errors. */
  maxRetries?: number;
  /** Base delay for exponential backoff in milliseconds. */
  baseDelayMs?: number;
  /** Maximum delay cap in milliseconds. */
  maxDelayMs?: number;
  /** Custom headers to include in every request. */
  defaultHeaders?: Record<string, string>;
}

export interface CarrierHttpRequest {
  /** Full URL to call. */
  url: string;
  /** HTTP method. */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Request headers. */
  headers?: Record<string, string>;
  /** Request body (string or object — objects are JSON-serialized). */
  body?: string | Record<string, unknown>;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
  /** Override timeout for this specific request. */
  timeoutMs?: number;
  /** Correlation ID for tracing. */
  correlationId?: string;
  /** Carrier operation name for error reporting. */
  operation: string;
}

export interface CarrierHttpResponse<T = unknown> {
  /** HTTP status code. */
  status: number;
  /** Response headers. */
  headers: Record<string, string>;
  /** Parsed response body. */
  body: T;
  /** Raw response body as string (for debugging). */
  rawBody: string;
  /** Time taken in milliseconds. */
  durationMs: number;
  /** Correlation ID echoed back. */
  correlationId?: string;
}

// ── Retry-After parsing (M7.3-B.3.3.2.2) ────────────────────────────────────

/**
 * Parse the Retry-After header value as positive integer seconds.
 *
 * Accepts ONLY positive decimal integers (1–86400).
 * Returns undefined for missing, empty, malformed, zero, negative,
 * fractional, or out-of-range values. Never throws.
 *
 * HTTP-date format is NOT supported (deferred).
 */
export function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (value === null || value === '') return undefined;

  const trimmed = value.trim();
  if (trimmed === '') return undefined;

  // Strict: digits only, optional leading minus (to reject before parseInt)
  if (!/^-?\d+$/.test(trimmed)) return undefined;

  const parsed = parseInt(trimmed, 10);

  // Guard against NaN / Infinity (regex already prevents most cases)
  if (!Number.isFinite(parsed)) return undefined;

  // Zero and negative are invalid (BD-05, BD-06)
  if (parsed <= 0) return undefined;

  // Upper validation boundary — defense-in-depth (BD-07)
  // CarrierRetryPolicy remains the single authority for the operational cap.
  if (parsed > 86400) return undefined;

  return parsed;
}

// ── Secret redaction ────────────────────────────────────────────────────────

/**
 * Patterns that indicate sensitive data in request/response bodies.
 */
const SENSITIVE_KEYS = new Set([
  'password', 'passwd', 'secret', 'apikey', 'api_key', 'apikey',
  'accesstoken', 'access_token', 'token', 'authorization',
  'credentialsencrypted', 'credentials_encrypted',
  'webhooksecretencrypted', 'webhook_secret_encrypted',
  'accountpin', 'account_pin', 'passwordhash', 'password_hash',
]);

/**
 * Redact sensitive values from an object for safe logging.
 */
export function redactSecrets(obj: unknown, depth = 0): unknown {
  if (depth > 5) return '[MAX_DEPTH]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSecrets(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase().replace(/[_-]/g, '');
      if (SENSITIVE_KEYS.has(lowerKey)) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = redactSecrets(value, depth + 1);
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  }

  return obj;
}

// ── HTTP Client ─────────────────────────────────────────────────────────────

export class CarrierHttpClient {
  private readonly logger: Logger;
  private readonly config: Required<CarrierHttpClientConfig>;

  constructor(config: CarrierHttpClientConfig) {
    this.config = {
      providerKey: config.providerKey,
      timeoutMs: config.timeoutMs ?? 30_000,
      maxRetries: config.maxRetries ?? 0, // Default: no retries (caller decides)
      baseDelayMs: config.baseDelayMs ?? 1_000,
      maxDelayMs: config.maxDelayMs ?? 60_000,
      defaultHeaders: config.defaultHeaders ?? {},
    };
    this.logger = new Logger(`CarrierHTTP:${config.providerKey}`);
  }

  /**
   * Execute an HTTP request with retry, classification, and logging.
   */
  async request<T = unknown>(req: CarrierHttpRequest): Promise<CarrierHttpResponse<T>> {
    const correlationId = req.correlationId || `car-${crypto.randomUUID()}`;
    const maxAttempts = 1 + this.config.maxRetries;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startTime = Date.now();

      try {
        const response = await this.executeRequest(req, correlationId, attempt);
        const durationMs = Date.now() - startTime;

        // Parse response
        const rawBody = await response.text();
        const body = this.parseBody<T>(rawBody, response.headers.get('content-type'));
        const status = response.status;

        // Classify HTTP-level errors
        if (status >= 400) {
          const classified = this.classifyHttpStatus(status, req, rawBody, response.headers);
          if (classified.retryable && attempt < maxAttempts) {
            this.logger.warn(
              `[${correlationId}] Attempt ${attempt}/${maxAttempts} — ` +
              `${req.operation} returned ${status}, retrying...`,
            );
            await this.backoff(attempt);
            continue;
          }
          throw classified;
        }

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        this.logger.log(
          `[${correlationId}] ${req.operation} completed: ${status} in ${durationMs}ms`,
        );

        return {
          status,
          headers: responseHeaders,
          body: body as T,
          rawBody,
          durationMs,
          correlationId,
        };

      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // If it's a carrier error, check retryability
        if (err instanceof CarrierError) {
          if (!err.retryable || attempt >= maxAttempts) {
            throw err;
          }
          this.logger.warn(
            `[${correlationId}] Attempt ${attempt}/${maxAttempts} — ` +
            `${req.operation} failed: ${err.toSafeMessage()}, retrying...`,
          );
          await this.backoff(attempt);
          continue;
        }

        // Network/timeout errors are retryable
        if (attempt >= maxAttempts) {
          throw new RetryableCarrierError(
            `Request failed after ${maxAttempts} attempts: ${lastError.message}`,
            { providerKey: this.config.providerKey, operation: req.operation },
          );
        }

        this.logger.warn(
          `[${correlationId}] Attempt ${attempt}/${maxAttempts} — ` +
          `${req.operation} network error: ${lastError.message}, retrying...`,
        );
        await this.backoff(attempt);
      }
    }

    // Should not reach here, but just in case
    throw new RetryableCarrierError(
      `Request exhausted all ${maxAttempts} attempts`,
      {
        providerKey: this.config.providerKey,
        operation: req.operation,
      },
    );
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * Execute a single HTTP request.
   */
  private async executeRequest(
    req: CarrierHttpRequest,
    correlationId: string,
    _attempt: number,
  ): Promise<Response> {
    const timeoutMs = req.timeoutMs ?? this.config.timeoutMs;

    // Build headers
    const headers: Record<string, string> = {
      ...this.config.defaultHeaders,
      ...req.headers,
      'X-Correlation-ID': correlationId,
      'User-Agent': `SCS-Platform/1.0 (${this.config.providerKey})`,
    };

    // Prepare body
    let bodyStr: string | undefined;
    if (req.body !== undefined) {
      if (typeof req.body === 'string') {
        bodyStr = req.body;
      } else {
        bodyStr = JSON.stringify(req.body);
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      }
    }

    // Timeout via AbortController
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    // Combine with caller-provided signal
    if (req.signal) {
      req.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      // Log request (with redaction)
      this.logger.debug(
        `[${correlationId}] → ${req.method} ${req.url} ` +
        `(body: ${bodyStr ? `${bodyStr.length} bytes` : 'none'})`,
      );

      const response = await fetch(req.url, {
        method: req.method,
        headers,
        body: bodyStr,
        signal: controller.signal,
        redirect: 'error', // Do NOT follow redirects (SSRF protection)
      });

      return response;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new RetryableCarrierError(
          `Request timed out after ${timeoutMs}ms`,
          { providerKey: this.config.providerKey, operation: req.operation },
        );
      }
      throw new RetryableCarrierError(
        `Network error: ${err.message}`,
        { providerKey: this.config.providerKey, operation: req.operation },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Parse a response body based on Content-Type.
   */
  private parseBody<T>(rawBody: string, contentType: string | null): T {
    const ct = (contentType || '').toLowerCase();

    if (ct.includes('application/json')) {
      try {
        return JSON.parse(rawBody) as T;
      } catch {
        // Return raw string if JSON parsing fails
        return rawBody as unknown as T;
      }
    }

    if (ct.includes('xml') || ct.includes('text/xml') || ct.includes('application/xml')) {
      // Return raw XML string — caller parses with their XML library
      return rawBody as unknown as T;
    }

    // Default: return as string
    return rawBody as unknown as T;
  }

  /**
   * Classify an HTTP error status into a CarrierError subclass.
   */
  private classifyHttpStatus(
    status: number,
    req: CarrierHttpRequest,
    rawBody: string,
    responseHeaders?: Headers,
  ): CarrierError {
    const opts = {
      providerKey: this.config.providerKey,
      operation: req.operation,
    };

    // 401/403 → Authentication
    if (status === 401 || status === 403) {
      return new AuthenticationCarrierError(
        `Authentication failed (HTTP ${status})`,
        opts,
      );
    }

    // 400/422 → Validation
    if (status === 400 || status === 422) {
      return new ValidationCarrierError(
        `Validation error (HTTP ${status})`,
        opts,
      );
    }

    // 404 → Non-retryable (resource not found)
    if (status === 404) {
      return new NonRetryableCarrierError(
        `Resource not found (HTTP 404)`,
        opts,
      );
    }

    // 429 → Rate limit (read Retry-After header if present)
    if (status === 429) {
      const retryAfterSeconds = responseHeaders
        ? parseRetryAfterSeconds(responseHeaders.get('retry-after'))
        : undefined;
      return new RateLimitCarrierError(
        'Rate limit exceeded (HTTP 429)',
        { ...opts, retryAfterSeconds },
      );
    }

    // 5xx → Retryable
    if (status >= 500) {
      return new RetryableCarrierError(
        `Server error (HTTP ${status})`,
        opts,
      );
    }

    // Other 4xx → Non-retryable
    return new NonRetryableCarrierError(
      `Unexpected HTTP status ${status}`,
      opts,
    );
  }

  /**
   * Exponential backoff with ±20% jitter.
   */
  private async backoff(attempt: number): Promise<void> {
    const baseDelay = this.config.baseDelayMs;
    const delay = Math.min(
      baseDelay * Math.pow(2, attempt - 1),
      this.config.maxDelayMs,
    );
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    const waitMs = Math.max(0, delay + jitter);

    return new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}
