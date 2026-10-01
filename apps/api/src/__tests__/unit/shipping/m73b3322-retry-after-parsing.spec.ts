/**
 * M7.3-B.3.3.2.2 — Retry-After Header Parsing: Unit Tests
 *
 * Tests:
 *   B3322-U-01  parseRetryAfterSeconds: valid integer values
 *   B3322-U-02  parseRetryAfterSeconds: missing / null / empty
 *   B3322-U-03  parseRetryAfterSeconds: malformed inputs rejected
 *   B3322-U-04  parseRetryAfterSeconds: zero rejected
 *   B3322-U-05  parseRetryAfterSeconds: negative rejected
 *   B3322-U-06  parseRetryAfterSeconds: fractional rejected
 *   B3322-U-07  parseRetryAfterSeconds: upper bound (>86400) rejected
 *   B3322-U-08  parseRetryAfterSeconds: whitespace trimming
 *   B3322-U-09  parseRetryAfterSeconds: duplicate headers rejected
 *   B3322-U-10  parseRetryAfterSeconds: HTTP-date rejected
 *   B3322-U-11  HTTP 429 without Retry-After → retryAfterSeconds undefined
 *   B3322-U-12  HTTP 429 with Retry-After: 30 → retryAfterSeconds = 30
 *   B3322-U-13  HTTP 429 with Retry-After: 7200 → retryAfterSeconds = 7200
 *   B3322-U-14  HTTP 429 with malformed Retry-After → retryAfterSeconds undefined
 *   B3322-U-15  HTTP 429 lowercase retry-after → valid parsing
 *   B3322-U-16  Existing 500/502/503/504 behavior unchanged
 *   B3322-U-17  No credential/raw-header leakage in error messages
 *   B3322-U-18  Retry-After: 0 → retryAfterSeconds undefined
 *   B3322-U-19  Retry-After: "30" (quoted) → undefined
 *   B3322-U-20  Retry-After: 30abc (suffix garbage) → undefined
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CarrierHttpClient, parseRetryAfterSeconds } from '../../../modules/shipping/carrier-http-client';
import { RateLimitCarrierError, RetryableCarrierError } from '../../../modules/shipping/carrier-errors';

// ═══════════════════════════════════════════════════════════════════
//  SECTION 1: parseRetryAfterSeconds() — pure function tests
// ═══════════════════════════════════════════════════════════════════

describe('B3322-U-01: Valid integer values', () => {
  it('parses "30" → 30', () => {
    expect(parseRetryAfterSeconds('30')).toBe(30);
  });

  it('parses "120" → 120', () => {
    expect(parseRetryAfterSeconds('120')).toBe(120);
  });

  it('parses "3600" → 3600', () => {
    expect(parseRetryAfterSeconds('3600')).toBe(3600);
  });

  it('parses "7200" → 7200 (policy caps later)', () => {
    expect(parseRetryAfterSeconds('7200')).toBe(7200);
  });

  it('parses "86400" → 86400 (upper boundary)', () => {
    expect(parseRetryAfterSeconds('86400')).toBe(86400);
  });

  it('parses "1" → 1 (minimum valid)', () => {
    expect(parseRetryAfterSeconds('1')).toBe(1);
  });
});

describe('B3322-U-02: Missing / null / empty', () => {
  it('null → undefined', () => {
    expect(parseRetryAfterSeconds(null)).toBeUndefined();
  });

  it('empty string → undefined', () => {
    expect(parseRetryAfterSeconds('')).toBeUndefined();
  });

  it('whitespace-only → undefined', () => {
    expect(parseRetryAfterSeconds('   ')).toBeUndefined();
  });
});

describe('B3322-U-03: Malformed inputs rejected', () => {
  it('"abc" → undefined', () => {
    expect(parseRetryAfterSeconds('abc')).toBeUndefined();
  });

  it('"NaN" → undefined', () => {
    expect(parseRetryAfterSeconds('NaN')).toBeUndefined();
  });

  it('"Infinity" → undefined', () => {
    expect(parseRetryAfterSeconds('Infinity')).toBeUndefined();
  });

  it('"{{constructor}}" → undefined', () => {
    expect(parseRetryAfterSeconds('{{constructor}}')).toBeUndefined();
  });

  it('"__proto__" → undefined', () => {
    expect(parseRetryAfterSeconds('__proto__')).toBeUndefined();
  });

  it('"0; DROP TABLE" → undefined', () => {
    expect(parseRetryAfterSeconds('0; DROP TABLE')).toBeUndefined();
  });
});

describe('B3322-U-04: Zero rejected', () => {
  it('"0" → undefined', () => {
    expect(parseRetryAfterSeconds('0')).toBeUndefined();
  });
});

describe('B3322-U-05: Negative rejected', () => {
  it('"-1" → undefined', () => {
    expect(parseRetryAfterSeconds('-1')).toBeUndefined();
  });

  it('"-120" → undefined', () => {
    expect(parseRetryAfterSeconds('-120')).toBeUndefined();
  });
});

describe('B3322-U-06: Fractional rejected', () => {
  it('"1.5" → undefined', () => {
    expect(parseRetryAfterSeconds('1.5')).toBeUndefined();
  });

  it('"0.5" → undefined', () => {
    expect(parseRetryAfterSeconds('0.5')).toBeUndefined();
  });

  it('"30.0" → undefined', () => {
    expect(parseRetryAfterSeconds('30.0')).toBeUndefined();
  });
});

describe('B3322-U-07: Upper bound (>86400) rejected', () => {
  it('"999999999999" → undefined', () => {
    expect(parseRetryAfterSeconds('999999999999')).toBeUndefined();
  });

  it('"86401" → undefined', () => {
    expect(parseRetryAfterSeconds('86401')).toBeUndefined();
  });

  it('"999999999999999999999" → undefined', () => {
    expect(parseRetryAfterSeconds('999999999999999999999')).toBeUndefined();
  });
});

describe('B3322-U-08: Whitespace trimming', () => {
  it('" 30 " → 30 (trimmed)', () => {
    expect(parseRetryAfterSeconds(' 30 ')).toBe(30);
  });

  it('"  120" → 120 (leading space)', () => {
    expect(parseRetryAfterSeconds('  120')).toBe(120);
  });

  it('"3600  " → 3600 (trailing space)', () => {
    expect(parseRetryAfterSeconds('3600  ')).toBe(3600);
  });
});

describe('B3322-U-09: Duplicate headers rejected', () => {
  it('"30, 60" → undefined (combined duplicate headers)', () => {
    expect(parseRetryAfterSeconds('30, 60')).toBeUndefined();
  });
});

describe('B3322-U-10: HTTP-date rejected', () => {
  it('"Wed, 21 Oct 2015 07:28:00 GMT" → undefined', () => {
    expect(parseRetryAfterSeconds('Wed, 21 Oct 2015 07:28:00 GMT')).toBeUndefined();
  });
});

describe('B3322-U-18: Zero rejected (explicit)', () => {
  it('"0" → undefined (no immediate retry)', () => {
    expect(parseRetryAfterSeconds('0')).toBeUndefined();
  });
});

describe('B3322-U-19: Quoted value rejected', () => {
  it('"30" (with quotes) → undefined', () => {
    expect(parseRetryAfterSeconds('"30"')).toBeUndefined();
  });
});

describe('B3322-U-20: Suffix garbage rejected', () => {
  it('"30abc" → undefined', () => {
    expect(parseRetryAfterSeconds('30abc')).toBeUndefined();
  });

  it('"120 " → 120 (trailing space is OK after trim)', () => {
    expect(parseRetryAfterSeconds('120 ')).toBe(120);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  SECTION 2: HTTP client integration — 429 with Retry-After
// ═══════════════════════════════════════════════════════════════════

describe('B3322-U-11..17: HTTP client 429 Retry-After integration', () => {
  let client: CarrierHttpClient;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    client = new CarrierHttpClient({
      providerKey: 'test-provider',
      timeoutMs: 5000,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /** Helper: mock fetch to return a specific status + headers */
  function mockFetchResponse(status: number, headers: Record<string, string> = {}, body = '{"error":"test"}') {
    const responseHeaders = new Headers(headers);
    responseHeaders.set('content-type', 'application/json');

    globalThis.fetch = vi.fn(async () =>
      new Response(body, {
        status,
        headers: responseHeaders,
      }),
    ) as typeof fetch;
  }

  it('B3322-U-11: 429 without Retry-After → retryAfterSeconds undefined', async () => {
    mockFetchResponse(429);

    try {
      await client.request({
        url: 'https://carrier.test/cancel',
        method: 'POST',
        operation: 'cancelPickup',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitCarrierError);
      const rateLimitErr = err as RateLimitCarrierError;
      expect(rateLimitErr.retryAfterSeconds).toBeUndefined();
    }
  });

  it('B3322-U-12: 429 with Retry-After: 30 → retryAfterSeconds = 30', async () => {
    mockFetchResponse(429, { 'Retry-After': '30' });

    try {
      await client.request({
        url: 'https://carrier.test/cancel',
        method: 'POST',
        operation: 'cancelPickup',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitCarrierError);
      const rateLimitErr = err as RateLimitCarrierError;
      expect(rateLimitErr.retryAfterSeconds).toBe(30);
    }
  });

  it('429 with Retry-After: 120 → retryAfterSeconds = 120', async () => {
    mockFetchResponse(429, { 'Retry-After': '120' });

    try {
      await client.request({
        url: 'https://carrier.test/cancel',
        method: 'POST',
        operation: 'cancelPickup',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitCarrierError);
      expect((err as RateLimitCarrierError).retryAfterSeconds).toBe(120);
    }
  });

  it('429 with Retry-After: 3600 → retryAfterSeconds = 3600', async () => {
    mockFetchResponse(429, { 'Retry-After': '3600' });

    try {
      await client.request({
        url: 'https://carrier.test/cancel',
        method: 'POST',
        operation: 'cancelPickup',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitCarrierError);
      expect((err as RateLimitCarrierError).retryAfterSeconds).toBe(3600);
    }
  });

  it('B3322-U-13: 429 with Retry-After: 7200 → retryAfterSeconds = 7200 (policy caps later)', async () => {
    mockFetchResponse(429, { 'Retry-After': '7200' });

    try {
      await client.request({
        url: 'https://carrier.test/cancel',
        method: 'POST',
        operation: 'cancelPickup',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitCarrierError);
      const rateLimitErr = err as RateLimitCarrierError;
      // HTTP client passes the raw parsed value; CarrierRetryPolicy caps at 1h
      expect(rateLimitErr.retryAfterSeconds).toBe(7200);
    }
  });

  it('B3322-U-14: 429 with malformed Retry-After: abc → retryAfterSeconds undefined', async () => {
    mockFetchResponse(429, { 'Retry-After': 'abc' });

    try {
      await client.request({
        url: 'https://carrier.test/cancel',
        method: 'POST',
        operation: 'cancelPickup',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitCarrierError);
      expect((err as RateLimitCarrierError).retryAfterSeconds).toBeUndefined();
    }
  });

  it('429 with Retry-After: -1 → retryAfterSeconds undefined', async () => {
    mockFetchResponse(429, { 'Retry-After': '-1' });

    try {
      await client.request({
        url: 'https://carrier.test/cancel',
        method: 'POST',
        operation: 'cancelPickup',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitCarrierError);
      expect((err as RateLimitCarrierError).retryAfterSeconds).toBeUndefined();
    }
  });

  it('429 with Retry-After: 0 → retryAfterSeconds undefined', async () => {
    mockFetchResponse(429, { 'Retry-After': '0' });

    try {
      await client.request({
        url: 'https://carrier.test/cancel',
        method: 'POST',
        operation: 'cancelPickup',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitCarrierError);
      expect((err as RateLimitCarrierError).retryAfterSeconds).toBeUndefined();
    }
  });

  it('429 with Retry-After: 1.5 → retryAfterSeconds undefined', async () => {
    mockFetchResponse(429, { 'Retry-After': '1.5' });

    try {
      await client.request({
        url: 'https://carrier.test/cancel',
        method: 'POST',
        operation: 'cancelPickup',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitCarrierError);
      expect((err as RateLimitCarrierError).retryAfterSeconds).toBeUndefined();
    }
  });

  it('429 with Retry-After: 999999999999 → retryAfterSeconds undefined', async () => {
    mockFetchResponse(429, { 'Retry-After': '999999999999' });

    try {
      await client.request({
        url: 'https://carrier.test/cancel',
        method: 'POST',
        operation: 'cancelPickup',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitCarrierError);
      expect((err as RateLimitCarrierError).retryAfterSeconds).toBeUndefined();
    }
  });

  it('429 with Retry-After: "30" (quoted) → retryAfterSeconds undefined', async () => {
    mockFetchResponse(429, { 'Retry-After': '"30"' });

    try {
      await client.request({
        url: 'https://carrier.test/cancel',
        method: 'POST',
        operation: 'cancelPickup',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitCarrierError);
      expect((err as RateLimitCarrierError).retryAfterSeconds).toBeUndefined();
    }
  });

  it('429 with Retry-After: 30abc (suffix garbage) → retryAfterSeconds undefined', async () => {
    mockFetchResponse(429, { 'Retry-After': '30abc' });

    try {
      await client.request({
        url: 'https://carrier.test/cancel',
        method: 'POST',
        operation: 'cancelPickup',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitCarrierError);
      expect((err as RateLimitCarrierError).retryAfterSeconds).toBeUndefined();
    }
  });

  it('B3322-U-15: lowercase retry-after: 60 → retryAfterSeconds = 60', async () => {
    mockFetchResponse(429, { 'retry-after': '60' });

    try {
      await client.request({
        url: 'https://carrier.test/cancel',
        method: 'POST',
        operation: 'cancelPickup',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitCarrierError);
      expect((err as RateLimitCarrierError).retryAfterSeconds).toBe(60);
    }
  });

  it('429 with empty Retry-After → retryAfterSeconds undefined', async () => {
    mockFetchResponse(429, { 'Retry-After': '' });

    try {
      await client.request({
        url: 'https://carrier.test/cancel',
        method: 'POST',
        operation: 'cancelPickup',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitCarrierError);
      expect((err as RateLimitCarrierError).retryAfterSeconds).toBeUndefined();
    }
  });

  it('429 with HTTP-date Retry-After → retryAfterSeconds undefined', async () => {
    mockFetchResponse(429, { 'Retry-After': 'Wed, 21 Oct 2015 07:28:00 GMT' });

    try {
      await client.request({
        url: 'https://carrier.test/cancel',
        method: 'POST',
        operation: 'cancelPickup',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitCarrierError);
      expect((err as RateLimitCarrierError).retryAfterSeconds).toBeUndefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
//  SECTION 3: Regression — existing behavior unchanged
// ═══════════════════════════════════════════════════════════════════

describe('B3322-U-16: Existing 500/502/503/504 behavior unchanged', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetchResponse(status: number) {
    globalThis.fetch = vi.fn(async () =>
      new Response('{"error":"server error"}', {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch;
  }

  const retryableStatuses = [500, 502, 503, 504];

  for (const status of retryableStatuses) {
    it(`HTTP ${status} → RetryableCarrierError (not RateLimitCarrierError)`, async () => {
      mockFetchResponse(status);
      const client = new CarrierHttpClient({
        providerKey: 'test-provider',
        timeoutMs: 5000,
      });

      try {
        await client.request({
          url: 'https://carrier.test/cancel',
          method: 'POST',
          operation: 'cancelPickup',
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RetryableCarrierError);
        expect(err).not.toBeInstanceOf(RateLimitCarrierError);
      }
    });
  }

  it('HTTP 401 → AuthenticationCarrierError (not rate-limit)', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('{"error":"unauthorized"}', {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch;

    const client = new CarrierHttpClient({ providerKey: 'test-provider', timeoutMs: 5000 });

    try {
      await client.request({ url: 'https://carrier.test/cancel', method: 'POST', operation: 'cancelPickup' });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).not.toBeInstanceOf(RateLimitCarrierError);
    }
  });

  it('HTTP 404 → NonRetryableCarrierError (not rate-limit)', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('{"error":"not found"}', {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch;

    const client = new CarrierHttpClient({ providerKey: 'test-provider', timeoutMs: 5000 });

    try {
      await client.request({ url: 'https://carrier.test/cancel', method: 'POST', operation: 'cancelPickup' });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).not.toBeInstanceOf(RateLimitCarrierError);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
//  SECTION 4: Security — no credential/raw-header leakage
// ═══════════════════════════════════════════════════════════════════

describe('B3322-U-17: No credential/raw-header leakage in error messages', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('toSafeMessage() includes only the integer, not raw header', () => {
    const err = new RateLimitCarrierError('Rate limit exceeded (HTTP 429)', {
      providerKey: 'test-provider',
      operation: 'cancelPickup',
      retryAfterSeconds: 120,
    });
    const safe = err.toSafeMessage();
    expect(safe).toContain('retry after 120s');
    expect(safe).not.toContain('Retry-After');
    expect(safe).not.toContain('header');
  });

  it('toSafeMessage() without retryAfterSeconds does not mention retry-after', () => {
    const err = new RateLimitCarrierError('Rate limit exceeded (HTTP 429)', {
      providerKey: 'test-provider',
      operation: 'cancelPickup',
    });
    const safe = err.toSafeMessage();
    expect(safe).not.toContain('retry after');
    expect(safe).not.toContain('Retry-After');
  });

  it('429 error safe message never contains raw header content', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('{"error":"rate limited"}', {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'Retry-After': '30',
        },
      }),
    ) as typeof fetch;

    const client = new CarrierHttpClient({ providerKey: 'test-provider', timeoutMs: 5000 });

    try {
      await client.request({ url: 'https://carrier.test/cancel', method: 'POST', operation: 'cancelPickup' });
      expect.fail('Should have thrown');
    } catch (err) {
      const safe = (err as RateLimitCarrierError).toSafeMessage();
      // Must contain the parsed integer
      expect(safe).toContain('retry after 30s');
      // Must NOT contain raw header name or untrusted content
      expect(safe).not.toMatch(/password|secret|apikey|token|authorization/i);
    }
  });
});
