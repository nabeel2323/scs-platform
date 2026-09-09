import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { RateLimitException } from '../../../common/exceptions/rate-limit.exception';
import { AllExceptionsFilter } from '../../../common/filters/all-exceptions.filter';
import { RateLimitService } from '../../../common/services/rate-limit.service';

/**
 * Rate-limit 429 contract (Quick win 5).
 *
 * Verifies the server side of the "surface 429 + remaining-attempts" UX:
 *  - RateLimitException carries remaining/limit/retryAfter in its RFC 7807 body,
 *  - AllExceptionsFilter promotes those to X-RateLimit-* / Retry-After headers
 *    (whitelisted in CORS) without leaking them onto non-429 responses,
 *  - RateLimitService.getResetSeconds maps Redis TTL to a sane Retry-After.
 */

// ── Host mock for the exception filter ────────────────────────────
function createHost() {
  const headers: Record<string, string> = {};
  let statusCode = 0;
  let body: Record<string, unknown> | null = null;

  const res = {
    setHeader: vi.fn((k: string, v: string) => {
      headers[k] = v;
    }),
    status: vi.fn((code: number) => {
      statusCode = code;
      return {
        json: vi.fn((b: Record<string, unknown>) => {
          body = b;
        }),
      };
    }),
  };
  const req = { url: '/v1/auth/login/password' };
  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as any;

  return {
    host,
    headers,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
}

describe('RateLimitException', () => {
  it('carries remaining/limit/retryAfter in a 429 RFC 7807 body', () => {
    const ex = new RateLimitException('Too many login attempts.', {
      limit: 5,
      remaining: 2,
      retryAfterSeconds: 300,
    });
    expect(ex.getStatus()).toBe(429);
    const body = ex.getResponse() as Record<string, unknown>;
    expect(body['remainingAttempts']).toBe(2);
    expect(body['limit']).toBe(5);
    expect(body['retryAfterSeconds']).toBe(300);
    expect(body['type']).toBe('https://api.scsp.dev/errors/client/429');
  });
});

describe('AllExceptionsFilter — 429 headers', () => {
  it('emits X-RateLimit-* and Retry-After headers for a RateLimitException', () => {
    const h = createHost();
    const filter = new AllExceptionsFilter();
    const ex = new RateLimitException('Too many login attempts.', {
      limit: 5,
      remaining: 0,
      retryAfterSeconds: 900,
    });

    filter.catch(ex, h.host);

    expect(h.statusCode).toBe(429);
    expect(h.headers['X-RateLimit-Limit']).toBe('5');
    expect(h.headers['X-RateLimit-Remaining']).toBe('0');
    expect(h.headers['Retry-After']).toBe('900');
    const nowSec = Math.ceil(Date.now() / 1000);
    expect(Number(h.headers['X-RateLimit-Reset'])).toBeGreaterThanOrEqual(nowSec + 900 - 2);
    // The RFC 7807 body still carries the fields for clients that read JSON.
    expect(h.body!['remainingAttempts']).toBe(0);
    expect(h.body!['retryAfterSeconds']).toBe(900);
  });

  it('does not attach rate-limit headers to non-429 responses', () => {
    const h = createHost();
    const filter = new AllExceptionsFilter();
    filter.catch(new BadRequestException('bad input'), h.host);

    expect(h.statusCode).toBe(400);
    expect(h.headers['X-RateLimit-Remaining']).toBeUndefined();
    expect(h.headers['Retry-After']).toBeUndefined();
  });
});

describe('RateLimitService.getResetSeconds', () => {
  function svcWithTtl(ttl: number) {
    const redis = { client: { ttl: vi.fn().mockResolvedValue(ttl) } } as any;
    return new RateLimitService(redis);
  }

  it('returns the positive TTL as the retry-after window', async () => {
    expect(await svcWithTtl(120).getResetSeconds('password_login', 'a@b.c')).toBe(120);
  });

  it('maps a missing key (-2) to 0', async () => {
    expect(await svcWithTtl(-2).getResetSeconds('password_login', 'a@b.c')).toBe(0);
  });

  it('maps a key with no expiry (-1) to 0', async () => {
    expect(await svcWithTtl(-1).getResetSeconds('password_login', 'a@b.c')).toBe(0);
  });
});
