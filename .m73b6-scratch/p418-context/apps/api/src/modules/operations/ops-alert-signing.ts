/**
 * P13 Phase 4.1.6 — Webhook HMAC-SHA256 signing with replay protection.
 *
 * Signature protocol (v2 — backward incompatible with v1)
 * ─────────────────────────────────────────────────────────
 * 1. Generate a UTC Unix timestamp (seconds since epoch).
 * 2. Serialize the JSON payload to a UTF-8 string exactly once.
 * 3. Compute the canonical signed input: `<timestamp>.<body>`
 *    where `<timestamp>` is the decimal string representation of the Unix timestamp
 *    and `<body>` is the exact UTF-8 request body. The dot (`.`) is the separator.
 * 4. Compute HMAC-SHA256 over the canonical signed input bytes.
 * 5. Send the hex digest in `X-SCS-Alert-Signature` as `sha256=<hex>`.
 * 6. Send the timestamp in `X-SCS-Alert-Timestamp` as a decimal string.
 * 7. The receiver must:
 *    a. Reject requests where the timestamp is outside the freshness window.
 *    b. Recompute the HMAC over `<timestamp>.<body>` and compare using constant-time
 *       comparison.
 *    c. Deduplicate by alert `id` or `dedupKey` to prevent replay.
 *
 * Receiver compatibility: v1 receivers (Phase 4.1.5) that only check the body
 * signature will reject v2 signed payloads because the canonical input includes
 * the timestamp prefix. Operators must update receivers before enabling webhook
 * delivery. External delivery remains disabled until receiver compatibility is
 * confirmed.
 *
 * This module is deliberately free of NestJS dependencies so that external
 * receivers and test harnesses can import it directly.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Header name carrying the HMAC signature (lowercase). */
export const SIGNATURE_HEADER = 'x-scs-alert-signature';

/** Header name carrying the UTC Unix timestamp (lowercase). */
export const TIMESTAMP_HEADER = 'x-scs-alert-timestamp';

/** Signature prefix used in the header value. */
export const SIGNATURE_PREFIX = 'sha256=';

/** Default freshness window: 5 minutes (300 seconds). */
export const DEFAULT_FRESHNESS_WINDOW_SECONDS = 300;

/**
 * Build the canonical signed input from a timestamp and body.
 *
 * @param timestamp - UTC Unix timestamp in seconds (as a number or string).
 * @param body - The exact UTF-8 request body string.
 * @returns The canonical string `<timestamp>.<body>`.
 */
export function buildCanonicalInput(timestamp: number | string, body: string): string {
  return `${timestamp}.${body}`;
}

/**
 * Compute the HMAC-SHA256 signature for a webhook body with timestamp.
 *
 * @param timestamp - UTC Unix timestamp in seconds.
 * @param body - The exact UTF-8 request body string that will be sent.
 * @param secret - The shared HMAC secret (>= 32 characters recommended).
 * @returns The signature string in the format `sha256=<hex-digest>`.
 */
export function computeSignature(
  timestamp: number | string,
  body: string,
  secret: string,
): string {
  const canonical = buildCanonicalInput(timestamp, body);
  const digest = createHmac('sha256', secret).update(canonical, 'utf-8').digest('hex');
  return `${SIGNATURE_PREFIX}${digest}`;
}

/**
 * Verify a webhook body against its HMAC signature and timestamp.
 *
 * @param body - The raw request body bytes as a UTF-8 string.
 * @param signature - The value of the `X-SCS-Alert-Signature` header.
 * @param timestamp - The value of the `X-SCS-Alert-Timestamp` header (string or number).
 * @param secret - The shared HMAC secret.
 * @param freshnessWindowSeconds - Maximum allowed age of the timestamp (default 300).
 * @returns `true` if the signature is valid and timestamp is fresh, `false` otherwise.
 */
export function verifySignature(
  body: string,
  signature: string,
  timestamp: string | number,
  secret: string,
  freshnessWindowSeconds: number = DEFAULT_FRESHNESS_WINDOW_SECONDS,
): boolean {
  // Validate signature format.
  if (!signature || !signature.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  // Validate and parse timestamp.
  const tsNum = typeof timestamp === 'number' ? timestamp : Number.parseInt(timestamp as string, 10);
  if (!Number.isFinite(tsNum) || tsNum <= 0) {
    return false;
  }

  // Check freshness window.
  const now = Math.floor(Date.now() / 1000);
  const age = Math.abs(now - tsNum);
  if (age > freshnessWindowSeconds) {
    return false;
  }

  // Compute expected signature over canonical input.
  const expected = computeSignature(tsNum, body, secret);

  // Constant-time comparison.
  const sigBuf = Buffer.from(signature, 'utf-8');
  const expBuf = Buffer.from(expected, 'utf-8');

  if (sigBuf.length !== expBuf.length) {
    return false;
  }

  return timingSafeEqual(sigBuf, expBuf);
}
