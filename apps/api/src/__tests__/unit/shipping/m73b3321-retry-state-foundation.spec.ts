/**
 * M7.3-B.3.3.2.1 — Retry State Foundation: Unit Tests
 *
 * Tests the worker handleCancel() retry classification with mocked DB/providers.
 * No real database or carrier HTTP.
 *
 * Coverage:
 *   B3321-U-01  429 → re-throw (retryable)
 *   B3321-U-02  500 → re-throw (retryable)
 *   B3321-U-03  502 → re-throw (retryable)
 *   B3321-U-04  503 → re-throw (retryable)
 *   B3321-U-05  504 → re-throw (retryable)
 *   B3321-U-06  retryable failure increments carrierCancelRetries
 *   B3321-U-07  success does NOT increment retry counter
 *   B3321-U-08  terminal failure does NOT increment retry counter
 *   B3321-U-09  401 → FAILED, no throw
 *   B3321-U-10  403 → FAILED, no throw
 *   B3321-U-11  404 → FAILED, no throw
 *   B3321-U-12  validation → FAILED, no throw
 *   B3321-U-13  business failure → FAILED, no throw
 *   B3321-U-14  malformed response → FAILED, no throw
 *   B3321-U-15  timeout → FAILED, no throw (deferred to B.3.3.3)
 *   B3321-U-16  connection reset → FAILED, no throw (deferred to B.3.3.3)
 *   B3321-U-17  circuit breaker OPEN → re-throw, no carrier call
 *   B3321-U-18  circuit breaker OPEN → no carrier HTTP call
 *   B3321-U-19  circuit breaker OPEN → does NOT increment carrierCancelRetries
 *   B3321-U-20  SUCCEEDED idempotent guard → no provider call
 *   B3321-U-21  NOT_REQUIRED idempotent guard → no provider call
 *   B3321-U-22  retryable error sets carrierCancelStatus = PENDING
 *   B3321-U-23  retryable error persists safe error message
 *   B3321-U-24  retryable error persists error class
 *   B3321-U-25  no credential leakage in persisted error
 */

import { describe, it, expect, vi } from 'vitest';
import { ShippingCarrierWorker } from '../../../modules/shipping/shipping-carrier.worker';
import { ShippingProviderRegistry } from '../../../modules/shipping/shipping-registry';
import { ShippingProvider } from '../../../modules/shipping/shipping-provider';
import {
  CancelPickupRequest,
  CancelPickupResult,
  ProviderCapabilities,
  CreateShipmentRequest,
  CreateShipmentResult,
} from '../../../modules/shipping/shipping.types';
import {
  RetryableCarrierError,
  RateLimitCarrierError,
  AuthenticationCarrierError,
  ValidationCarrierError,
  NonRetryableCarrierError,
} from '../../../modules/shipping/carrier-errors';
import { CarrierObservabilityService } from '../../../modules/shipping/carrier-observability';
import { CarrierEmailResolver } from '../../../modules/shipping/carrier-email-resolver';
import { CarrierRetryPolicy } from '../../../modules/shipping/carrier-retry-policy';
import { CarrierCircuitBreaker } from '../../../modules/shipping/carrier-circuit-breaker';

// ── Test Provider Stub ──────────────────────────────────────────────────────

class TestCarrierProvider extends ShippingProvider {
  readonly type = 'CARRIER' as const;
  readonly key = 'test-carrier';
  readonly name = 'Test Carrier';
  readonly capabilities: ProviderCapabilities = {
    canCreateShipment: true,
    canCancel: false,
    canCancelPickup: true,
    canGenerateLabel: false,
    canTrack: false,
    canValidateAddress: false,
    canReceiveWebhooks: false,
  };
  cancelPickupMock = vi.fn() as ReturnType<typeof vi.fn>;
  async createShipment(_r: CreateShipmentRequest): Promise<CreateShipmentResult> {
    return { providerKey: this.key };
  }
  override async cancelPickup(req: CancelPickupRequest): Promise<CancelPickupResult> {
    return this.cancelPickupMock(req) as Promise<CancelPickupResult>;
  }
}

// ── Mock Helpers ────────────────────────────────────────────────────────────

interface ShipmentRow {
  id: string;
  orderId: string;
  storeId: string;
  shippingProviderKey: string | null;
  carrierPickupId: string | null;
  carrierCancelStatus: string | null;
  carrierCancelError: string | null;
  carrierCancelErrorClass: string | null;
  carrierCancelRetries: number;
  carrierCancelAttemptedAt: Date | null;
  carrierCancelIdempotencyKey: string | null;
  carrierCreateStatus: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  [key: string]: any;
}

function makeShipment(overrides: Partial<ShipmentRow> = {}): ShipmentRow {
  return {
    id: 'ship-001',
    orderId: 'order-001',
    storeId: 'store-001',
    shippingProviderKey: 'test-carrier',
    carrierPickupId: 'PU-12345',
    carrierCancelStatus: 'PENDING',
    carrierCancelError: null,
    carrierCancelErrorClass: null,
    carrierCancelRetries: 0,
    carrierCancelAttemptedAt: null,
    carrierCancelIdempotencyKey: null,
    carrierCreateStatus: 'SUCCESS',
    cancelledAt: null,
    cancellationReason: null,
    ...overrides,
  };
}

function createMocks(shipment: ShipmentRow, circuitBreakerOpen = false) {
  const updateSets: Record<string, any>[] = [];

  const innerDb = {
    query: {
      shipments: {
        findFirst: vi.fn(async () => shipment),
      },
      carrierWebhookEvents: {
        findFirst: vi.fn(async () => null),
      },
    },
    update: vi.fn((_table: any) => ({
      set: vi.fn((data: any) => {
        updateSets.push(data);
        for (const [k, v] of Object.entries(data)) {
          if (k in shipment) {
            (shipment as any)[k] = v;
          }
        }
        return {
          where: vi.fn(async () => undefined),
        };
      }),
    })),
    execute: vi.fn(async () => ({ rows: [] })),
  };

  const db = { db: innerDb };
  const registry = new ShippingProviderRegistry();
  const credentials = {} as any;
  const configurations = {} as any;
  const observability = {
    incrementCounter: vi.fn(),
    recordHistogram: vi.fn(),
  } as unknown as CarrierObservabilityService;
  const emailResolver = {
    tryResolve: vi.fn(async () => null),
  } as unknown as CarrierEmailResolver;
  const retryPolicy = {
    classify: vi.fn((err: any, attempts: number) => ({
      isFinal: attempts >= 8,
      safeMessage: err?.message || 'Unknown',
      nextAttemptAt: null,
    })),
  } as unknown as CarrierRetryPolicy;
  const circuitBreaker = {
    canRequest: vi.fn(() => !circuitBreakerOpen),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
  } as unknown as CarrierCircuitBreaker;

  return { db, registry, credentials, configurations, observability, emailResolver, retryPolicy, circuitBreaker, updateSets };
}

function createWorker(mocks: ReturnType<typeof createMocks>, provider?: ShippingProvider): ShippingCarrierWorker {
  if (provider) {
    mocks.registry.register(provider);
  }
  return new (ShippingCarrierWorker as any)(
    mocks.db,
    mocks.registry,
    mocks.credentials,
    mocks.configurations,
    mocks.observability,
    mocks.emailResolver,
    mocks.retryPolicy,
    mocks.circuitBreaker,
  );
}

function makeEvent(overrides: Record<string, any> = {}): any {
  return {
    id: 'evt-001',
    eventType: 'shipping.carrier.cancel',
    aggregateId: 'ship-001',
    metadata: { storeId: 'store-001' },
    ...overrides,
  };
}

// ── B3321-U-01 to U-05: Retryable HTTP errors → re-throw ───────────────────

describe('B3321-U-01..05: Retryable HTTP errors → re-throw', () => {
  const retryableCases: Array<{ name: string; err: Error }> = [
    { name: '429 RateLimitCarrierError', err: new RateLimitCarrierError('Rate limit exceeded', { providerKey: 'test-carrier', operation: 'cancelPickup' }) },
    { name: '500 RetryableCarrierError', err: new RetryableCarrierError('Server error (HTTP 500)', { providerKey: 'test-carrier', operation: 'cancelPickup' }) },
    { name: '502 RetryableCarrierError', err: new RetryableCarrierError('Server error (HTTP 502)', { providerKey: 'test-carrier', operation: 'cancelPickup' }) },
    { name: '503 RetryableCarrierError', err: new RetryableCarrierError('Server error (HTTP 503)', { providerKey: 'test-carrier', operation: 'cancelPickup' }) },
    { name: '504 RetryableCarrierError', err: new RetryableCarrierError('Server error (HTTP 504)', { providerKey: 'test-carrier', operation: 'cancelPickup' }) },
  ];

  for (const { name, err } of retryableCases) {
    it(`${name} → re-throws for handleFailure()`, async () => {
      const shipment = makeShipment();
      const mocks = createMocks(shipment);
      const provider = new TestCarrierProvider();
      provider.cancelPickupMock.mockRejectedValue(err);
      const worker = createWorker(mocks, provider);

      await expect((worker as any).handleCancel(makeEvent())).rejects.toThrow();
    });
  }
});

// ── B3321-U-06: Retryable failure increments carrierCancelRetries ───────────

describe('B3321-U-06: Retryable failure increments carrierCancelRetries', () => {
  it('increments carrierCancelRetries from 0 to 1 on first retryable failure', async () => {
    const shipment = makeShipment({ carrierCancelRetries: 0 });
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockRejectedValue(
      new RetryableCarrierError('Server error', { providerKey: 'test-carrier', operation: 'cancelPickup' }),
    );
    const worker = createWorker(mocks, provider);

    await expect((worker as any).handleCancel(makeEvent())).rejects.toThrow();

    expect(shipment.carrierCancelRetries).toBe(1);
  });

  it('increments carrierCancelRetries from 3 to 4 on subsequent retry', async () => {
    const shipment = makeShipment({ carrierCancelRetries: 3 });
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockRejectedValue(
      new RetryableCarrierError('Server error', { providerKey: 'test-carrier', operation: 'cancelPickup' }),
    );
    const worker = createWorker(mocks, provider);

    await expect((worker as any).handleCancel(makeEvent())).rejects.toThrow();

    expect(shipment.carrierCancelRetries).toBe(4);
  });
});

// ── B3321-U-07: Success does NOT increment retry counter ────────────────────

describe('B3321-U-07: Success does NOT increment retry counter', () => {
  it('carrierCancelRetries stays 0 on successful cancellation', async () => {
    const shipment = makeShipment({ carrierCancelRetries: 0 });
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockResolvedValue({ supported: true, cancelled: true });
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(shipment.carrierCancelRetries).toBe(0);
    expect(shipment.carrierCancelStatus).toBe('SUCCEEDED');
  });
});

// ── B3321-U-08: Terminal failure does NOT increment retry counter ───────────

describe('B3321-U-08: Terminal failure does NOT increment retry counter', () => {
  it('carrierCancelRetries stays 0 on terminal error', async () => {
    const shipment = makeShipment({ carrierCancelRetries: 0 });
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockRejectedValue(
      new AuthenticationCarrierError('Invalid API key', { providerKey: 'test-carrier', operation: 'cancelPickup' }),
    );
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(shipment.carrierCancelRetries).toBe(0);
    expect(shipment.carrierCancelStatus).toBe('FAILED');
  });
});

// ── B3321-U-09..14: Terminal errors → FAILED, no throw ─────────────────────

describe('B3321-U-09..14: Terminal errors → FAILED, no throw', () => {
  const terminalCases: Array<{ name: string; err: Error }> = [
    { name: '401 AuthenticationCarrierError', err: new AuthenticationCarrierError('Auth failed', { providerKey: 'test-carrier', operation: 'cancelPickup' }) },
    { name: '403 AuthenticationCarrierError', err: new AuthenticationCarrierError('Forbidden', { providerKey: 'test-carrier', operation: 'cancelPickup' }) },
    { name: '404 NonRetryableCarrierError', err: new NonRetryableCarrierError('Not found', { providerKey: 'test-carrier', operation: 'cancelPickup' }) },
    { name: 'ValidationCarrierError', err: new ValidationCarrierError('Bad input', { providerKey: 'test-carrier', operation: 'cancelPickup' }) },
  ];

  for (const { name, err } of terminalCases) {
    it(`${name} → FAILED, does not throw`, async () => {
      const shipment = makeShipment();
      const mocks = createMocks(shipment);
      const provider = new TestCarrierProvider();
      provider.cancelPickupMock.mockRejectedValue(err);
      const worker = createWorker(mocks, provider);

      await (worker as any).handleCancel(makeEvent());

      expect(shipment.carrierCancelStatus).toBe('FAILED');
      expect(shipment.carrierCancelError).toBeTruthy();
      expect(shipment.carrierCancelRetries).toBe(0);
    });
  }

  it('business failure (result.cancelled=false) → FAILED, does not throw', async () => {
    const shipment = makeShipment();
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockResolvedValue({ supported: true, cancelled: false, reason: 'Pickup already departed' });
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(shipment.carrierCancelStatus).toBe('FAILED');
    expect(shipment.carrierCancelError).toContain('Pickup already departed');
    expect(shipment.carrierCancelRetries).toBe(0);
  });

  it('malformed response (NonRetryableCarrierError) → FAILED, does not throw', async () => {
    const shipment = makeShipment();
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockRejectedValue(
      new NonRetryableCarrierError('Aramex CancelPickup response missing HasErrors', { providerKey: 'test-carrier', operation: 'cancelPickup' }),
    );
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(shipment.carrierCancelStatus).toBe('FAILED');
    expect(shipment.carrierCancelRetries).toBe(0);
  });
});

// ── B3321-U-15..16: Timeout / connection reset → FAILED, no throw ──────────

describe('B3321-U-15..16: Timeout / indeterminate → FAILED, no throw (deferred to B.3.3.3)', () => {
  it('timeout → FAILED with B.3.3.3 marker, does not throw', async () => {
    const shipment = makeShipment();
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockRejectedValue(new Error('ETIMEDOUT: connection timed out'));
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(shipment.carrierCancelStatus).toBe('FAILED');
    expect(shipment.carrierCancelError).toContain('[TIMEOUT — B3.3.3 will set UNKNOWN]');
    expect(shipment.carrierCancelErrorClass).toBe('timeout');
    expect(shipment.carrierCancelRetries).toBe(0);
  });

  it('connection reset (ECONNRESET) → FAILED, does not throw', async () => {
    const shipment = makeShipment();
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    const connErr = new Error('read ECONNRESET');
    connErr.name = 'Error';
    provider.cancelPickupMock.mockRejectedValue(connErr);
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(shipment.carrierCancelStatus).toBe('FAILED');
    expect(shipment.carrierCancelErrorClass).toBe('timeout');
    expect(shipment.carrierCancelRetries).toBe(0);
  });
});

// ── B3321-U-17..19: Circuit breaker OPEN ────────────────────────────────────

describe('B3321-U-17..19: Circuit breaker OPEN → retryable, no carrier call', () => {
  it('breaker OPEN → throws RetryableCarrierError (reaches generic retry)', async () => {
    const shipment = makeShipment();
    const mocks = createMocks(shipment, true); // circuitBreakerOpen = true
    const provider = new TestCarrierProvider();
    const worker = createWorker(mocks, provider);

    await expect((worker as any).handleCancel(makeEvent())).rejects.toThrow();
  });

  it('breaker OPEN → does NOT call carrier cancelPickup', async () => {
    const shipment = makeShipment();
    const mocks = createMocks(shipment, true);
    const provider = new TestCarrierProvider();
    const worker = createWorker(mocks, provider);

    try { await (worker as any).handleCancel(makeEvent()); } catch { /* expected */ }

    expect(provider.cancelPickupMock).not.toHaveBeenCalled();
  });

  it('breaker OPEN → does NOT increment carrierCancelRetries (no carrier call occurred)', async () => {
    const shipment = makeShipment({ carrierCancelRetries: 0 });
    const mocks = createMocks(shipment, true);
    const provider = new TestCarrierProvider();
    const worker = createWorker(mocks, provider);

    try { await (worker as any).handleCancel(makeEvent()); } catch { /* expected */ }

    // carrierCancelRetries stays 0 because the breaker threw before the
    // try/catch block where retries are incremented
    expect(shipment.carrierCancelRetries).toBe(0);
  });
});

// ── B3321-U-20..21: Idempotency guards ─────────────────────────────────────

describe('B3321-U-20..21: Idempotency guards', () => {
  it('SUCCEEDED → no provider call', async () => {
    const shipment = makeShipment({ carrierCancelStatus: 'SUCCEEDED' });
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(provider.cancelPickupMock).not.toHaveBeenCalled();
  });

  it('NOT_REQUIRED → no provider call', async () => {
    const shipment = makeShipment({ carrierCancelStatus: 'NOT_REQUIRED' });
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(provider.cancelPickupMock).not.toHaveBeenCalled();
  });
});

// ── B3321-U-22..24: Retryable error persists correct state ─────────────────

describe('B3321-U-22..24: Retryable error persists correct state', () => {
  it('sets carrierCancelStatus = PENDING on retryable failure', async () => {
    const shipment = makeShipment();
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockRejectedValue(
      new RetryableCarrierError('Server error', { providerKey: 'test-carrier', operation: 'cancelPickup' }),
    );
    const worker = createWorker(mocks, provider);

    await expect((worker as any).handleCancel(makeEvent())).rejects.toThrow();

    expect(shipment.carrierCancelStatus).toBe('PENDING');
  });

  it('persists safe error message (no credentials)', async () => {
    const shipment = makeShipment();
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockRejectedValue(
      new RetryableCarrierError('Server error', { providerKey: 'test-carrier', operation: 'cancelPickup' }),
    );
    const worker = createWorker(mocks, provider);

    await expect((worker as any).handleCancel(makeEvent())).rejects.toThrow();

    expect(shipment.carrierCancelError).toBeTruthy();
    expect(shipment.carrierCancelError).not.toContain('password');
    expect(shipment.carrierCancelError).not.toContain('api_key');
    expect(shipment.carrierCancelError).not.toContain('token');
  });

  it('persists error class from classification', async () => {
    const shipment = makeShipment();
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockRejectedValue(
      new RateLimitCarrierError('Rate limited', { providerKey: 'test-carrier', operation: 'cancelPickup' }),
    );
    const worker = createWorker(mocks, provider);

    await expect((worker as any).handleCancel(makeEvent())).rejects.toThrow();

    expect(shipment.carrierCancelErrorClass).toBe('backoff');
  });
});

// ── B3321-U-25: No credential leakage ──────────────────────────────────────

describe('B3321-U-25: No credential leakage in persisted error', () => {
  it('error message from RetryableCarrierError does not contain secrets', async () => {
    const shipment = makeShipment();
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockRejectedValue(
      new RetryableCarrierError('Server error', { providerKey: 'test-carrier', operation: 'cancelPickup' }),
    );
    const worker = createWorker(mocks, provider);

    await expect((worker as any).handleCancel(makeEvent())).rejects.toThrow();

    const safeMsg = shipment.carrierCancelError as string;
    // toSafeMessage format: [ClassName] providerKey.operation: message
    expect(safeMsg).toContain('[RetryableCarrierError]');
    expect(safeMsg).toContain('test-carrier.cancelPickup');
    // Must never contain credential-like values
    expect(safeMsg).not.toMatch(/password|secret|apikey|api_key|token|authorization/i);
  });
});
