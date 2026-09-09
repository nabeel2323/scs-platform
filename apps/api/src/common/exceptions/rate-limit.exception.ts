import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Rate-limit context carried alongside a 429 so clients can render a
 * "remaining attempts / retry after" UX (Quick win 5).
 */
export interface RateLimitDetail {
  /** Maximum attempts allowed in the window. */
  limit: number;
  /** Attempts still allowed in the current window (0 when locked out). */
  remaining: number;
  /** Seconds until the window resets and attempts are restored. */
  retryAfterSeconds: number;
}

/**
 * 429 exception that carries RFC-6585-style rate-limit context.
 *
 * The global {@link AllExceptionsFilter} reads `remainingAttempts`,
 * `retryAfterSeconds` and `limit` from the response body to emit the
 * `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` and
 * `Retry-After` headers (already whitelisted in CORS `exposedHeaders`), and
 * keeps them in the RFC 7807 body so browser clients can surface them.
 */
export class RateLimitException extends HttpException {
  constructor(
    message: string,
    public readonly detail: RateLimitDetail,
  ) {
    super(
      {
        message,
        title: 'Too many requests',
        type: 'https://api.scsp.dev/errors/client/429',
        limit: detail.limit,
        remainingAttempts: detail.remaining,
        retryAfterSeconds: detail.retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
