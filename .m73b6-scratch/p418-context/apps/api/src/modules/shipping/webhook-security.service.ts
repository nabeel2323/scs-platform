import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';

/**
 * WebhookSecurityService — HMAC-SHA256 webhook signature verification.
 *
 * SECURITY INVARIANTS:
 *   - Signatures are verified using constant-time comparison.
 *   - Timestamps are validated to prevent replay attacks.
 *   - Request body size is limited to prevent DoS.
 *   - Invalid signatures are rejected before any business logic.
 *   - Security failures are distinguishable from valid duplicate events.
 *
 * HTTP RESPONSE BEHAVIOUR:
 *   - 401 Unauthorized: missing or invalid signature scheme.
 *   - 403 Forbidden: signature mismatch or stale timestamp.
 *   - 413 Payload Too Large: request body exceeds size limit.
 *   - 200 OK: valid signature (even for duplicate events — idempotent).
 *   - 500 Internal Server Error: unexpected processing error.
 *
 * This allows callers to distinguish security rejections (401/403) from
 * duplicate deliveries (200) and server errors (500).
 */
@Injectable()
export class WebhookSecurityService {
  private readonly logger = new Logger(WebhookSecurityService.name);

  /** Maximum request body size: 256 KB. */
  static readonly MAX_BODY_BYTES = 256 * 1024;

  /** Maximum age of a webhook timestamp: 5 minutes. */
  static readonly MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

  /** HMAC algorithm. */
  private static readonly ALGORITHM = 'sha256';

  /**
   * Verify a webhook signature.
   *
   * @param rawBody     Raw request body as a string.
   * @param signature   The signature from the request header (hex or base64).
   * @param secret      The webhook secret (plaintext, decrypted from credential store).
   * @param timestamp   Optional timestamp header value (seconds or milliseconds since epoch).
   * @returns           { valid: true } or { valid: false, reason: string }.
   */
  verifySignature(
    rawBody: string,
    signature: string,
    secret: string,
    timestamp?: string | null,
  ): { valid: true } | { valid: false; reason: string } {
    // 1. Build the signed payload
    const signedPayload = timestamp
      ? `${timestamp}.${rawBody}`
      : rawBody;

    // 2. Compute expected HMAC
    const expected = crypto
      .createHmac(WebhookSecurityService.ALGORITHM, secret)
      .update(signedPayload, 'utf8')
      .digest('hex');

    // 3. Constant-time comparison
    if (!this.timingSafeEqual(expected, signature)) {
      return { valid: false, reason: 'Signature mismatch' };
    }

    // 4. Timestamp validation (if provided)
    if (timestamp) {
      const tsValidation = this.validateTimestamp(timestamp);
      if (!tsValidation.valid) return tsValidation;
    }

    return { valid: true };
  }

  /**
   * Compute a signature for testing or outbound webhook signing.
   */
  computeSignature(rawBody: string, secret: string, timestamp?: string): string {
    const signedPayload = timestamp
      ? `${timestamp}.${rawBody}`
      : rawBody;

    return crypto
      .createHmac(WebhookSecurityService.ALGORITHM, secret)
      .update(signedPayload, 'utf8')
      .digest('hex');
  }

  /**
   * Validate that a timestamp is within the acceptable replay window.
   */
  validateTimestamp(timestamp: string): { valid: true } | { valid: false; reason: string } {
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts)) {
      return { valid: false, reason: 'Invalid timestamp format' };
    }

    // Support both seconds and milliseconds
    const tsMs = ts < 1e12 ? ts * 1000 : ts;
    const now = Date.now();
    const age = Math.abs(now - tsMs);

    if (age > WebhookSecurityService.MAX_TIMESTAMP_AGE_MS) {
      return {
        valid: false,
        reason: `Timestamp too old (${Math.round(age / 1000)}s > ${WebhookSecurityService.MAX_TIMESTAMP_AGE_MS / 1000}s)`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate request body size.
   */
  validateBodySize(body: string | Buffer): { valid: true } | { valid: false; reason: string } {
    const size = typeof body === 'string' ? Buffer.byteLength(body, 'utf8') : body.length;
    if (size > WebhookSecurityService.MAX_BODY_BYTES) {
      return {
        valid: false,
        reason: `Request body too large (${size} bytes > ${WebhookSecurityService.MAX_BODY_BYTES} limit)`,
      };
    }
    return { valid: true };
  }

  /**
   * Constant-time string comparison to prevent timing attacks.
   */
  private timingSafeEqual(expected: string, actual: string): boolean {
    // Both strings must be the same length for timingSafeEqual
    if (expected.length !== actual.length) return false;

    const bufExpected = Buffer.from(expected, 'utf8');
    const bufActual = Buffer.from(actual, 'utf8');

    return crypto.timingSafeEqual(bufExpected, bufActual);
  }
}
