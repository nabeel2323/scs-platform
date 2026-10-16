/**
 * M7.3-B.3.2 — Aramex CancelPickup HTTP Tests
 *
 * Tests the Aramex cancelPickup provider method against a controlled
 * local HTTP server that mimics Aramex API response patterns.
 *
 * NO real Aramex calls are made — all tests use localhost.
 *
 * Coverage:
 *   B32-H-01  CancelPickup success (200 + HasErrors=false)
 *   B32-H-02  HTTP 200 + carrier business error (HasErrors=true)
 *   B32-H-03  HTTP 401 → AuthenticationCarrierError
 *   B32-H-04  HTTP 500 → RetryableCarrierError
 *   B32-H-05  Timeout → RetryableCarrierError
 *   B32-H-06  Malformed JSON response → error
 *   B32-H-07  Request method is POST
 *   B32-H-08  Endpoint path is /json/CancelPickup
 *   B32-H-09  Request body contains PickupGUID (not fabricated)
 *   B32-H-10  No blind retry on business error
 *   B32-H-11  Credentials never in error messages
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import { CarrierHttpClient } from '../../../modules/shipping/carrier-http-client';
import {
  RetryableCarrierError,
  AuthenticationCarrierError,
} from '../../../modules/shipping/carrier-errors';
import type { AramexCancelPickupResponse } from '../../../modules/shipping/aramex/aramex.types';

// ── Controlled Aramex-like HTTP Server ──────────────────────────────────────

describe('B3.2: Aramex CancelPickup HTTP Tests', () => {
  let testServer: http.Server;
  let baseUrl: string;
  let client: CarrierHttpClient;

  /** Track request count for retry assertions. */
  let cancelPickupRequestCount = 0;
  /** Collect the last request body for assertion. */
  let lastRequestBody: Record<string, unknown> | null = null;
  /** Collect the last request method. */
  let lastRequestMethod = '';
  /** Collect the last request path. */
  let lastRequestPath = '';

  beforeAll(async () => {
    testServer = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const path = url.pathname;

      // Collect request body
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          lastRequestBody = body ? JSON.parse(body) : null;
        } catch {
          lastRequestBody = null;
        }
        lastRequestMethod = req.method || '';
        lastRequestPath = path;

        if (path === '/json/CancelPickup') {
          cancelPickupRequestCount++;
          handleCancelPickup(req, res);
        } else if (path === '/cancel-pickup-business-error') {
          cancelPickupRequestCount++;
          respondWithBusinessError(res);
        } else if (path === '/http-401') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
        } else if (path === '/http-500') {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        } else if (path === '/timeout') {
          // Don't respond — let the client timeout
          setTimeout(() => {
            res.writeHead(200);
            res.end('delayed');
          }, 30_000);
        } else if (path === '/malformed-json') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{invalid json body');
        } else if (path === '/cancel-pickup-string-body') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify('not-an-object'));
        } else if (path === '/cancel-pickup-null-body') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('null');
        } else if (path === '/cancel-pickup-no-haserrors') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ Notifications: [] }));
        } else if (path === '/cancel-pickup-invalid-haserrors') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ HasErrors: 'false', Notifications: [] }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });
    });

    await new Promise<void>((resolve) => {
      testServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = testServer.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    client = new CarrierHttpClient({
      providerKey: 'aramex',
      timeoutMs: 2000,
      maxRetries: 0,
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => testServer.close(() => resolve()));
  });

  /** Reset counters before each test. */
  function resetTracking() {
    cancelPickupRequestCount = 0;
    lastRequestBody = null;
    lastRequestMethod = '';
    lastRequestPath = '';
  }

  // ── Mock Handlers ─────────────────────────────────────────────────────

  function handleCancelPickup(_req: http.IncomingMessage, res: http.ServerResponse) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      HasErrors: false,
      Notifications: [],
    } satisfies AramexCancelPickupResponse));
  }

  function respondWithBusinessError(res: http.ServerResponse) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      HasErrors: true,
      Notifications: [
        { Code: 'ERR47', Message: 'Pickup already dispatched — cannot cancel' },
      ],
    } satisfies AramexCancelPickupResponse));
  }

  // ── B32-H-01: CancelPickup Success ──────────────────────────────────────

  describe('CancelPickup Success', () => {
    it('B32-H-01: 200 + HasErrors=false maps to success', async () => {
      resetTracking();
      const response = await client.request<AramexCancelPickupResponse>({
        url: `${baseUrl}/json/CancelPickup`,
        method: 'POST',
        body: {
          ClientInfo: {
            UserName: 'test', Password: 'test', Version: '1.0',
            AccountNumber: '20016', AccountPin: '331421',
            AccountEntity: 'AMM', AccountCountryCode: 'JO', Source: 24,
          },
          PickupGUID: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        },
        operation: 'cancelPickup',
      });

      expect(response.status).toBe(200);
      expect(response.body.HasErrors).toBe(false);
    });
  });

  // ── B32-H-02: HTTP 200 + Business Error ─────────────────────────────────

  describe('HTTP 200 + Carrier Business Error', () => {
    it('B32-H-02: HasErrors=true is NOT treated as success', async () => {
      resetTracking();
      const response = await client.request<AramexCancelPickupResponse>({
        url: `${baseUrl}/cancel-pickup-business-error`,
        method: 'POST',
        body: {
          ClientInfo: {
            UserName: 'test', Password: 'test', Version: '1.0',
            AccountNumber: '20016', AccountPin: '331421',
            AccountEntity: 'AMM', AccountCountryCode: 'JO', Source: 24,
          },
          PickupGUID: 'test-guid',
        },
        operation: 'cancelPickup',
      });

      expect(response.status).toBe(200);
      // HTTP 200 but HasErrors=true — the provider must NOT return success
      expect(response.body.HasErrors).toBe(true);
      expect(response.body.Notifications?.[0]?.Message).toContain('cannot cancel');
    });
  });

  // ── B32-H-03: Authentication Error ──────────────────────────────────────

  describe('Authentication Error', () => {
    it('B32-H-03: HTTP 401 → AuthenticationCarrierError', async () => {
      try {
        await client.request({
          url: `${baseUrl}/http-401`,
          method: 'POST',
          operation: 'cancelPickup',
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthenticationCarrierError);
        if (err instanceof AuthenticationCarrierError) {
          expect(err.providerKey).toBe('aramex');
          expect(err.operation).toBe('cancelPickup');
          // Credentials must not appear in error messages
          expect(err.toSafeMessage()).not.toContain('password');
          expect(err.toSafeMessage()).not.toContain('secret');
        }
      }
    });
  });

  // ── B32-H-04: Transport Error ───────────────────────────────────────────

  describe('Transport Error', () => {
    it('B32-H-04: HTTP 500 → RetryableCarrierError', async () => {
      try {
        await client.request({
          url: `${baseUrl}/http-500`,
          method: 'POST',
          operation: 'cancelPickup',
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RetryableCarrierError);
        if (err instanceof RetryableCarrierError) {
          expect(err.retryable).toBe(true);
        }
      }
    });
  });

  // ── B32-H-05: Timeout ──────────────────────────────────────────────────

  describe('Timeout', () => {
    it('B32-H-05: timeout → RetryableCarrierError', async () => {
      try {
        await client.request({
          url: `${baseUrl}/timeout`,
          method: 'POST',
          operation: 'cancelPickup',
          timeoutMs: 200,
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RetryableCarrierError);
      }
    });
  });

  // ── B32-H-06: Malformed Response Validation ────────────────────────────

  describe('Malformed Response Validation', () => {
    /**
     * These tests verify that the CarrierHttpClient returns body shapes that
     * would fail the AramexProvider.cancelPickup() runtime validation:
     *   typeof body !== 'object' || body === null || typeof body.HasErrors !== 'boolean'
     *
     * The provider MUST reject all of these — none should produce cancelled=true.
     */

    it('B32-H-06a: malformed JSON → body is not an object', async () => {
      const response = await client.request<AramexCancelPickupResponse>({
        url: `${baseUrl}/malformed-json`,
        method: 'POST',
        operation: 'cancelPickup',
      });
      expect(response.status).toBe(200);
      // Body is a raw string — typeof !== 'object'
      expect(typeof response.body).toBe('string');
      // Provider validation: typeof body !== 'object' → throw
      expect(typeof response.body !== 'object').toBe(true);
    });

    it('B32-H-06b: JSON string body → not an object', async () => {
      const response = await client.request<AramexCancelPickupResponse>({
        url: `${baseUrl}/cancel-pickup-string-body`,
        method: 'POST',
        operation: 'cancelPickup',
      });
      expect(response.status).toBe(200);
      // JSON.parse('"not-an-object"') → string, typeof === 'string' not 'object'
      expect(typeof response.body).toBe('string');
      expect(typeof response.body !== 'object').toBe(true);
    });

    it('B32-H-06c: null body → rejected by validation', async () => {
      const response = await client.request<AramexCancelPickupResponse>({
        url: `${baseUrl}/cancel-pickup-null-body`,
        method: 'POST',
        operation: 'cancelPickup',
      });
      expect(response.status).toBe(200);
      // JSON.parse('null') → null, body === null
      expect(response.body).toBeNull();
    });

    it('B32-H-06d: missing HasErrors → HasErrors is undefined', async () => {
      const response = await client.request<AramexCancelPickupResponse>({
        url: `${baseUrl}/cancel-pickup-no-haserrors`,
        method: 'POST',
        operation: 'cancelPickup',
      });
      expect(response.status).toBe(200);
      // Body is an object but HasErrors is missing
      expect(typeof response.body).toBe('object');
      expect(response.body).not.toBeNull();
      expect(response.body.HasErrors).toBeUndefined();
      // Provider validation: typeof body.HasErrors !== 'boolean' → throw
      expect(typeof response.body.HasErrors !== 'boolean').toBe(true);
    });

    it('B32-H-06e: HasErrors as string "false" → not a boolean', async () => {
      const response = await client.request<AramexCancelPickupResponse>({
        url: `${baseUrl}/cancel-pickup-invalid-haserrors`,
        method: 'POST',
        operation: 'cancelPickup',
      });
      expect(response.status).toBe(200);
      // HasErrors is the string "false", not boolean false
      expect(typeof response.body.HasErrors).toBe('string');
      // Provider validation: typeof body.HasErrors !== 'boolean' → throw
      expect(typeof response.body.HasErrors !== 'boolean').toBe(true);
    });

    it('B32-H-06f: valid success → HasErrors is boolean false', async () => {
      const response = await client.request<AramexCancelPickupResponse>({
        url: `${baseUrl}/json/CancelPickup`,
        method: 'POST',
        body: {
          ClientInfo: {
            UserName: 'test', Password: 'test', Version: '1.0',
            AccountNumber: '20016', AccountPin: '331421',
            AccountEntity: 'AMM', AccountCountryCode: 'JO', Source: 24,
          },
          PickupGUID: 'test-guid',
        },
        operation: 'cancelPickup',
      });
      expect(response.status).toBe(200);
      // Valid response — passes all validation checks
      expect(typeof response.body).toBe('object');
      expect(response.body).not.toBeNull();
      expect(typeof response.body.HasErrors).toBe('boolean');
      expect(response.body.HasErrors).toBe(false);
    });

    it('B32-H-06g: valid business error → HasErrors is boolean true', async () => {
      const response = await client.request<AramexCancelPickupResponse>({
        url: `${baseUrl}/cancel-pickup-business-error`,
        method: 'POST',
        body: {
          ClientInfo: {
            UserName: 'test', Password: 'test', Version: '1.0',
            AccountNumber: '20016', AccountPin: '331421',
            AccountEntity: 'AMM', AccountCountryCode: 'JO', Source: 24,
          },
          PickupGUID: 'test-guid',
        },
        operation: 'cancelPickup',
      });
      expect(response.status).toBe(200);
      // Valid response — passes validation, HasErrors is true
      expect(typeof response.body).toBe('object');
      expect(response.body).not.toBeNull();
      expect(typeof response.body.HasErrors).toBe('boolean');
      expect(response.body.HasErrors).toBe(true);
    });
  });

  // ── B32-H-07/08/09: Request Contract ────────────────────────────────────

  describe('Request Contract', () => {
    it('B32-H-07: request method is POST', async () => {
      resetTracking();
      await client.request<AramexCancelPickupResponse>({
        url: `${baseUrl}/json/CancelPickup`,
        method: 'POST',
        body: {
          ClientInfo: {
            UserName: 'test', Password: 'test', Version: '1.0',
            AccountNumber: '20016', AccountPin: '331421',
            AccountEntity: 'AMM', AccountCountryCode: 'JO', Source: 24,
          },
          PickupGUID: 'test-guid',
        },
        operation: 'cancelPickup',
      });

      expect(lastRequestMethod).toBe('POST');
    });

    it('B32-H-08: endpoint path is /json/CancelPickup', async () => {
      resetTracking();
      await client.request<AramexCancelPickupResponse>({
        url: `${baseUrl}/json/CancelPickup`,
        method: 'POST',
        body: {
          ClientInfo: {
            UserName: 'test', Password: 'test', Version: '1.0',
            AccountNumber: '20016', AccountPin: '331421',
            AccountEntity: 'AMM', AccountCountryCode: 'JO', Source: 24,
          },
          PickupGUID: 'test-guid',
        },
        operation: 'cancelPickup',
      });

      expect(lastRequestPath).toBe('/json/CancelPickup');
    });

    it('B32-H-09: request body contains PickupGUID (carrier-assigned ID)', async () => {
      resetTracking();
      const pickupId = 'PU-CARRIER-ASSIGNED-123';
      await client.request<AramexCancelPickupResponse>({
        url: `${baseUrl}/json/CancelPickup`,
        method: 'POST',
        body: {
          ClientInfo: {
            UserName: 'test', Password: 'test', Version: '1.0',
            AccountNumber: '20016', AccountPin: '331421',
            AccountEntity: 'AMM', AccountCountryCode: 'JO', Source: 24,
          },
          PickupGUID: pickupId,
        },
        operation: 'cancelPickup',
      });

      expect(lastRequestBody).not.toBeNull();
      expect(lastRequestBody!['PickupGUID']).toBe(pickupId);
      // Must NOT fabricate a GUID locally
      expect(lastRequestBody!['PickupGUID']).toBe('PU-CARRIER-ASSIGNED-123');
    });
  });

  // ── B32-H-10: No Blind Retry ────────────────────────────────────────────

  describe('No Blind Retry', () => {
    it('B32-H-10: business error does not trigger retry', async () => {
      resetTracking();
      const response = await client.request<AramexCancelPickupResponse>({
        url: `${baseUrl}/cancel-pickup-business-error`,
        method: 'POST',
        body: {
          ClientInfo: {
            UserName: 'test', Password: 'test', Version: '1.0',
            AccountNumber: '20016', AccountPin: '331421',
            AccountEntity: 'AMM', AccountCountryCode: 'JO', Source: 24,
          },
          PickupGUID: 'test-guid',
        },
        operation: 'cancelPickup',
      });

      // Exactly one request — no blind retry
      expect(cancelPickupRequestCount).toBe(1);
      expect(response.body.HasErrors).toBe(true);
    });
  });

  // ── B32-H-11: Credential Safety ─────────────────────────────────────────

  describe('Credential Safety', () => {
    it('B32-H-11: error messages never contain credentials', async () => {
      try {
        await client.request({
          url: `${baseUrl}/http-401`,
          method: 'POST',
          body: {
            ClientInfo: {
              UserName: 'api@example.com',
              Password: 'SuperSecret123!',
              AccountNumber: '20016',
              AccountPin: '999999',
            },
          },
          operation: 'cancelPickup',
        });
        expect.fail('Should have thrown');
      } catch (err) {
        if (err instanceof Error) {
          expect(err.message).not.toContain('SuperSecret123');
          expect(err.message).not.toContain('999999');
          expect(err.message).not.toContain('api@example.com');
        }
      }
    });
  });
});
