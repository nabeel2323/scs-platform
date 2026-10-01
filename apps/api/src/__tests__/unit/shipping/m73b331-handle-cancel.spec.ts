/**
 * M7.3-B.3.3.1 — Cancellation Execution Foundation: Unit Tests
 *
 * Tests the worker handleCancel() logic with mocked DB and providers.
 * No real database or carrier HTTP.
 *
 * Coverage:
 *   B331-U-01  successful cancellation → SUCCEEDED
 *   B331-U-02  already SUCCEEDED → provider not called
 *   B331-U-03  NOT_REQUIRED → provider not called
 *   B331-U-04  unsupported provider → NOT_REQUIRED
 *   B331-U-05  carrier business failure → FAILED
 *   B331-U-06  authentication error → FAILED
 *   B331-U-07  validation error → FAILED
 *   B331-U-08  malformed response → FAILED
 *   B331-U-09  missing shipment → throws
 *   B331-U-10  wrong tenant/store → throws
 *   B331-U-11  missing carrierPickupId → FAILED
 *   B331-U-12  correct CancelPickupRequest mapping
 *   B331-U-13  provider resolution (uses shipment.shippingProviderKey)
 *   B331-U-14  no credentials in logs/errors
 *   B331-U-15  carrier-neutral worker behavior
 *   B331-U-16  timeout cannot produce SUCCEEDED
 *   B331-U-17  provider returns unsupported result → NOT_REQUIRED
 *   B331-U-18  manual provider → NOT_REQUIRED
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShippingCarrierWorker } from '../../../modules/shipping/shipping-carrier.worker';
import { ShippingProviderRegistry } from '../../../modules/shipping/shipping-registry';
import { ShippingProvider } from '../../../modules/shipping/shipping-provider';
import {
  CancelPickupRequest,
  CancelPickupResult,
  ProviderCapabilities,
  CreateShipmentRequest,
  CreateShipmentResult,
  TrackingInfo,
  CarrierStatusMapping,
  ShippingAddress,
} from '../../../modules/shipping/shipping.types';
import {
  NonRetryableCarrierError,
  AuthenticationCarrierError,
  ValidationCarrierError,
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

class NoCancelProvider extends ShippingProvider {
  readonly type = 'CARRIER' as const;
  readonly key = 'no-cancel-carrier';
  readonly name = 'No Cancel Carrier';
  readonly capabilities: ProviderCapabilities = {
    canCreateShipment: true,
    canCancel: false,
    canCancelPickup: false,
    canGenerateLabel: false,
    canTrack: false,
    canValidateAddress: false,
    canReceiveWebhooks: false,
  };
  async createShipment(_r: CreateShipmentRequest): Promise<CreateShipmentResult> {
    return { providerKey: this.key };
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

function createMocks(shipment: ShipmentRow) {
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
        // Apply relevant fields to the in-memory shipment for subsequent reads
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
    canRequest: vi.fn(() => true),
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

// ── B331-U-01: Successful Cancellation ──────────────────────────────────────

describe('B331-U-01: Successful Cancellation → SUCCEEDED', () => {
  it('sets carrierCancelStatus = SUCCEEDED on provider success', async () => {
    const shipment = makeShipment();
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockResolvedValue({ supported: true, cancelled: true, carrierStatus: 'CANCELLED' });
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(shipment.carrierCancelStatus).toBe('SUCCEEDED');
    expect(shipment.carrierCancelError).toBeNull();
    expect(shipment.carrierCancelErrorClass).toBeNull();
    expect(mocks.circuitBreaker.recordSuccess).toHaveBeenCalled();
  });
});

// ── B331-U-02: Already SUCCEEDED → Provider Not Called ─────────────────────

describe('B331-U-02: Already SUCCEEDED → Idempotent Skip', () => {
  it('does not call provider when already SUCCEEDED', async () => {
    const shipment = makeShipment({ carrierCancelStatus: 'SUCCEEDED' });
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(provider.cancelPickupMock).not.toHaveBeenCalled();
    expect(shipment.carrierCancelStatus).toBe('SUCCEEDED');
  });
});

// ── B331-U-03: NOT_REQUIRED → Provider Not Called ──────────────────────────

describe('B331-U-03: Already NOT_REQUIRED → Idempotent Skip', () => {
  it('does not call provider when already NOT_REQUIRED', async () => {
    const shipment = makeShipment({ carrierCancelStatus: 'NOT_REQUIRED' });
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(provider.cancelPickupMock).not.toHaveBeenCalled();
  });
});

// ── B331-U-04: Unsupported Provider → NOT_REQUIRED ─────────────────────────

describe('B331-U-04: Provider Without canCancelPickup → NOT_REQUIRED', () => {
  it('sets NOT_REQUIRED when provider cannot cancel pickup', async () => {
    const shipment = makeShipment({ shippingProviderKey: 'no-cancel-carrier' });
    const mocks = createMocks(shipment);
    const provider = new NoCancelProvider();
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(shipment.carrierCancelStatus).toBe('NOT_REQUIRED');
  });
});

// ── B331-U-05: Carrier Business Failure → FAILED ───────────────────────────

describe('B331-U-05: Business Failure → FAILED', () => {
  it('sets FAILED when provider returns cancelled=false', async () => {
    const shipment = makeShipment();
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockResolvedValue({
      supported: true,
      cancelled: false,
      reason: 'Pickup already dispatched',
      carrierCode: 'ERR_DISPATCH',
    });
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(shipment.carrierCancelStatus).toBe('FAILED');
    expect(shipment.carrierCancelError).toContain('Pickup already dispatched');
    expect(shipment.carrierCancelErrorClass).toBe('business_failure');
    expect(mocks.circuitBreaker.recordFailure).toHaveBeenCalled();
  });
});

// ── B331-U-06: Authentication Error → FAILED ───────────────────────────────

describe('B331-U-06: Authentication Error → FAILED', () => {
  it('sets FAILED on AuthenticationCarrierError', async () => {
    const shipment = makeShipment();
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockRejectedValue(
      new AuthenticationCarrierError('Invalid API key', {
        providerKey: 'test-carrier',
        operation: 'cancelPickup',
      }),
    );
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(shipment.carrierCancelStatus).toBe('FAILED');
    expect(shipment.carrierCancelErrorClass).toBe('terminal');
    expect(shipment.carrierCancelError).toContain('AuthenticationCarrierError');
  });
});

// ── B331-U-07: Validation Error → FAILED ───────────────────────────────────

describe('B331-U-07: Validation Error → FAILED', () => {
  it('sets FAILED on ValidationCarrierError', async () => {
    const shipment = makeShipment();
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockRejectedValue(
      new ValidationCarrierError('Invalid pickup ID format', {
        providerKey: 'test-carrier',
        operation: 'cancelPickup',
      }),
    );
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(shipment.carrierCancelStatus).toBe('FAILED');
    expect(shipment.carrierCancelErrorClass).toBe('terminal');
  });
});

// ── B331-U-08: Malformed Response → FAILED ─────────────────────────────────

describe('B331-U-08: Malformed Response → FAILED', () => {
  it('sets FAILED on NonRetryableCarrierError (malformed response)', async () => {
    const shipment = makeShipment();
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockRejectedValue(
      new NonRetryableCarrierError('Response missing HasErrors', {
        providerKey: 'test-carrier',
        operation: 'cancelPickup',
      }),
    );
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(shipment.carrierCancelStatus).toBe('FAILED');
    expect(shipment.carrierCancelErrorClass).toBe('terminal');
    expect(shipment.carrierCancelError).toContain('NonRetryableCarrierError');
  });
});

// ── B331-U-09: Missing Shipment → Throws ───────────────────────────────────

describe('B331-U-09: Missing Shipment', () => {
  it('throws when shipment not found', async () => {
    const mocks = createMocks(makeShipment());
    mocks.db.db.query.shipments.findFirst.mockResolvedValue(null as any);
    const worker = createWorker(mocks);

    await expect((worker as any).handleCancel(makeEvent())).rejects.toThrow(/not found/);
  });
});

// ── B331-U-10: Wrong Tenant/Store → Throws ─────────────────────────────────

describe('B331-U-10: Tenant Mismatch', () => {
  it('throws when event storeId does not match shipment storeId', async () => {
    const shipment = makeShipment({ storeId: 'store-B' });
    const mocks = createMocks(shipment);
    const worker = createWorker(mocks);

    await expect(
      (worker as any).handleCancel(makeEvent({ metadata: { storeId: 'store-A' } })),
    ).rejects.toThrow(/Tenant mismatch/);
  });
});

// ── B331-U-11: Missing carrierPickupId → FAILED ────────────────────────────

describe('B331-U-11: Missing carrierPickupId', () => {
  it('sets FAILED when carrierPickupId is null', async () => {
    const shipment = makeShipment({ carrierPickupId: null });
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(shipment.carrierCancelStatus).toBe('FAILED');
    expect(shipment.carrierCancelError).toContain('No carrierPickupId');
    expect(provider.cancelPickupMock).not.toHaveBeenCalled();
  });
});

// ── B331-U-12: Correct CancelPickupRequest Mapping ─────────────────────────

describe('B331-U-12: CancelPickupRequest Mapping', () => {
  it('passes correct carrierPickupId, storeId, shipmentId to provider', async () => {
    const shipment = makeShipment({
      id: 'ship-XYZ',
      storeId: 'store-XYZ',
      carrierPickupId: 'PU-99999',
    });
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockResolvedValue({ supported: true, cancelled: true });
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent({ aggregateId: 'ship-XYZ', metadata: { storeId: 'store-XYZ' } }));

    expect(provider.cancelPickupMock).toHaveBeenCalledWith({
      carrierPickupId: 'PU-99999',
      storeId: 'store-XYZ',
      shipmentId: 'ship-XYZ',
    });
  });
});

// ── B331-U-13: Provider Resolution ─────────────────────────────────────────

describe('B331-U-13: Provider Resolution', () => {
  it('uses shipment.shippingProviderKey to resolve provider', async () => {
    const shipment = makeShipment({ shippingProviderKey: 'test-carrier' });
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockResolvedValue({ supported: true, cancelled: true });
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(provider.cancelPickupMock).toHaveBeenCalled();
  });

  it('defaults to manual-driver when shippingProviderKey is null', async () => {
    const shipment = makeShipment({ shippingProviderKey: null });
    const mocks = createMocks(shipment);
    // Register a manual provider with key 'manual-driver'
    const { ManualDeliveryProvider } = await import(
      '../../../modules/shipping/providers/manual-delivery.provider'
    );
    const manualProvider = new ManualDeliveryProvider();
    const worker = createWorker(mocks, manualProvider);

    await (worker as any).handleCancel(makeEvent());

    expect(shipment.carrierCancelStatus).toBe('NOT_REQUIRED');
  });

  it('throws when provider is not in registry', async () => {
    const shipment = makeShipment({ shippingProviderKey: 'unknown-provider' });
    const mocks = createMocks(shipment);
    // Don't register any provider
    const worker = createWorker(mocks);

    await expect((worker as any).handleCancel(makeEvent())).rejects.toThrow(/not found/);
  });
});

// ── B331-U-14: No Credentials in Errors ────────────────────────────────────

describe('B331-U-14: Credential Safety', () => {
  it('error stored in carrierCancelError uses safe message format (no raw bodies)', async () => {
    const shipment = makeShipment();
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockRejectedValue(
      new AuthenticationCarrierError(
        'Invalid credentials',
        { providerKey: 'test-carrier', operation: 'cancelPickup' },
      ),
    );
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    // The safe message uses the [ClassName] providerKey.operation format.
    // It must NOT contain request/response bodies or structured credentials.
    const storedError = shipment.carrierCancelError || '';
    expect(storedError).toContain('[AuthenticationCarrierError]');
    expect(storedError).toContain('test-carrier.cancelPickup');
    // Verify classification is stored correctly
    expect(shipment.carrierCancelErrorClass).toBe('terminal');
  });
});

// ── B331-U-15: Carrier-Neutral Worker ──────────────────────────────────────

describe('B331-U-15: Carrier-Neutral Worker Behavior', () => {
  it('worker calls provider.cancelPickup — not any carrier-specific method', async () => {
    const shipment = makeShipment();
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockResolvedValue({ supported: true, cancelled: true });
    const worker = createWorker(mocks, provider);

    // Spy on createShipment to ensure it's NOT called
    const createSpy = vi.spyOn(provider, 'createShipment');

    await (worker as any).handleCancel(makeEvent());

    expect(provider.cancelPickupMock).toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });
});

// ── B331-U-16: Timeout Cannot Produce SUCCEEDED ────────────────────────────

describe('B331-U-16: Timeout Boundary Protection', () => {
  it('timeout error CANNOT produce carrierCancelStatus = SUCCEEDED', async () => {
    const shipment = makeShipment();
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockRejectedValue(new Error('ETIMEDOUT: connection timed out'));
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(shipment.carrierCancelStatus).not.toBe('SUCCEEDED');
    expect(shipment.carrierCancelStatus).toBe('FAILED');
    expect(shipment.carrierCancelErrorClass).toBe('timeout');
    expect(shipment.carrierCancelError).toContain('TIMEOUT');
  });

  it('socket hang up cannot produce SUCCEEDED', async () => {
    const shipment = makeShipment();
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockRejectedValue(new Error('socket hang up'));
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(shipment.carrierCancelStatus).not.toBe('SUCCEEDED');
    expect(shipment.carrierCancelStatus).toBe('FAILED');
    expect(shipment.carrierCancelErrorClass).toBe('timeout');
  });
});

// ── B331-U-17: Provider Returns Unsupported Result → NOT_REQUIRED ──────────

describe('B331-U-17: Provider Returns Unsupported Result', () => {
  it('sets NOT_REQUIRED when cancelPickup returns supported=false', async () => {
    const shipment = makeShipment();
    const mocks = createMocks(shipment);
    const provider = new TestCarrierProvider();
    provider.cancelPickupMock.mockResolvedValue({
      supported: false,
      reason: 'Operation not available for this shipment',
    });
    const worker = createWorker(mocks, provider);

    await (worker as any).handleCancel(makeEvent());

    expect(shipment.carrierCancelStatus).toBe('NOT_REQUIRED');
  });
});

// ── B331-U-18: Manual Provider → NOT_REQUIRED ──────────────────────────────

describe('B331-U-18: Manual Provider → NOT_REQUIRED', () => {
  it('sets NOT_REQUIRED for manual-driver provider without calling cancelPickup', async () => {
    const { ManualDeliveryProvider } = await import(
      '../../../modules/shipping/providers/manual-delivery.provider'
    );
    const shipment = makeShipment({ shippingProviderKey: 'manual-driver' });
    const mocks = createMocks(shipment);
    const manualProvider = new ManualDeliveryProvider();
    const cancelSpy = vi.spyOn(manualProvider, 'cancelPickup');
    const worker = createWorker(mocks, manualProvider);

    await (worker as any).handleCancel(makeEvent());

    expect(shipment.carrierCancelStatus).toBe('NOT_REQUIRED');
    expect(cancelSpy).not.toHaveBeenCalled();
  });
});
