import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ShippingService } from '../../../modules/shipping/shipping.service';

/**
 * M7.2.2 Remediation — Checkout Validation Unit Tests
 *
 * Tests the validateCheckoutSelection method which enforces:
 *  1. PICKUP: shippingMethodId must be null
 *  2. Delivery: requires shippingMethodId
 *  3. Method must exist, be active, belong to the store
 *  4. Zero-zone policy: no zones = unrestricted delivery
 *  5. Zone matching: if zones exist, must match address
 *  6. Zone-method availability: if zone has associations, method must be available
 *
 * Also tests the fulfillment-method compatibility matrix:
 *  - PLATFORM_DELIVERY + active method → PASS
 *  - MERCHANT_DELIVERY + active method → PASS
 *  - PICKUP + null → PASS
 *  - PICKUP + delivery method → REJECT
 *  - any + inactive method → REJECT
 *  - any + method from another store → REJECT
 */

function createMockDb() {
  const queryMock = {
    shippingMethods: {
      findFirst: vi.fn(),
    },
    deliveryZones: {
      findMany: vi.fn(),
    },
  };
  const selectMock = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  });
  return {
    db: {
      query: queryMock,
      select: selectMock,
    },
    queryMock,
    selectMock,
  };
}

function createService(mockDb: ReturnType<typeof createMockDb>) {
  const service = new ShippingService(
    { db: mockDb.db } as any,
    new (class {
      createShipment() { return Promise.resolve({}); }
    })() as any,
    {} as any,
  );
  return service;
}

// ── Fulfillment Compatibility ──────────────────────────────────────────────

describe('validateCheckoutSelection — fulfillment compatibility', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let service: ShippingService;

  beforeEach(() => {
    mockDb = createMockDb();
    service = createService(mockDb);
  });

  it('PICKUP with no shippingMethodId → PASS (returns null method)', async () => {
    const result = await service.validateCheckoutSelection(
      'store-1', 'PICKUP', undefined, { city: 'Riyadh', country: 'SA' },
    );
    expect(result.method).toBeNull();
    expect(result.zoneId).toBeNull();
  });

  it('PICKUP with shippingMethodId → REJECT', async () => {
    await expect(
      service.validateCheckoutSelection(
        'store-1', 'PICKUP', 'method-1', { city: 'Riyadh', country: 'SA' },
      ),
    ).rejects.toThrow('PICKUP fulfillment must not have a shippingMethodId');
  });

  it('PLATFORM_DELIVERY without shippingMethodId → REJECT', async () => {
    await expect(
      service.validateCheckoutSelection(
        'store-1', 'PLATFORM_DELIVERY', undefined, { city: 'Riyadh', country: 'SA' },
      ),
    ).rejects.toThrow('PLATFORM_DELIVERY requires a shippingMethodId');
  });

  it('MERCHANT_DELIVERY without shippingMethodId → REJECT', async () => {
    await expect(
      service.validateCheckoutSelection(
        'store-1', 'MERCHANT_DELIVERY', undefined, { city: 'Riyadh', country: 'SA' },
      ),
    ).rejects.toThrow('MERCHANT_DELIVERY requires a shippingMethodId');
  });

  it('delivery method that is inactive → REJECT', async () => {
    mockDb.queryMock.shippingMethods.findFirst.mockResolvedValue({
      id: 'method-1', storeId: 'store-1', name: 'Standard', isActive: false,
    });
    await expect(
      service.validateCheckoutSelection(
        'store-1', 'PLATFORM_DELIVERY', 'method-1', { city: 'Riyadh', country: 'SA' },
      ),
    ).rejects.toThrow('not active');
  });

  it('delivery method from another store → REJECT (not found)', async () => {
    // The query filters by storeId, so a method from another store returns null
    mockDb.queryMock.shippingMethods.findFirst.mockResolvedValue(null);
    await expect(
      service.validateCheckoutSelection(
        'store-1', 'PLATFORM_DELIVERY', 'method-other-store', { city: 'Riyadh', country: 'SA' },
      ),
    ).rejects.toThrow('not found for store');
  });

  it('PLATFORM_DELIVERY + active method + no zones → PASS (unrestricted)', async () => {
    mockDb.queryMock.shippingMethods.findFirst.mockResolvedValue({
      id: 'method-1', storeId: 'store-1', name: 'Standard', isActive: true,
    });
    mockDb.queryMock.deliveryZones.findMany.mockResolvedValue([]);

    const result = await service.validateCheckoutSelection(
      'store-1', 'PLATFORM_DELIVERY', 'method-1', { city: 'Riyadh', country: 'SA' },
    );
    expect(result.method).not.toBeNull();
    expect(result.zoneId).toBeNull(); // no zones = unrestricted
  });

  it('MERCHANT_DELIVERY + active method + no zones → PASS', async () => {
    mockDb.queryMock.shippingMethods.findFirst.mockResolvedValue({
      id: 'method-1', storeId: 'store-1', name: 'Merchant Delivery', isActive: true,
    });
    mockDb.queryMock.deliveryZones.findMany.mockResolvedValue([]);

    const result = await service.validateCheckoutSelection(
      'store-1', 'MERCHANT_DELIVERY', 'method-1', { city: 'Riyadh', country: 'SA' },
    );
    expect(result.method).not.toBeNull();
  });
});

// ── Zone Enforcement ───────────────────────────────────────────────────────

describe('validateCheckoutSelection — zone enforcement', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let service: ShippingService;

  beforeEach(() => {
    mockDb = createMockDb();
    service = createService(mockDb);
    // Default: active method
    mockDb.queryMock.shippingMethods.findFirst.mockResolvedValue({
      id: 'method-1', storeId: 'store-1', name: 'Standard', isActive: true,
    });
  });

  it('no zones → unrestricted delivery (zero-zone policy A)', async () => {
    mockDb.queryMock.deliveryZones.findMany.mockResolvedValue([]);

    const result = await service.validateCheckoutSelection(
      'store-1', 'PLATFORM_DELIVERY', 'method-1', { city: 'AnyCity', country: 'SA' },
    );
    expect(result.method).not.toBeNull();
    expect(result.zoneId).toBeNull();
  });

  it('zones exist + matching zone → PASS', async () => {
    mockDb.queryMock.deliveryZones.findMany.mockResolvedValue([
      { id: 'zone-1', storeId: 'store-1', name: 'Riyadh', city: 'Riyadh', region: null, postalCode: null, country: 'SA', isActive: true },
    ]);
    // No zone-method associations
    mockDb.selectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await service.validateCheckoutSelection(
      'store-1', 'PLATFORM_DELIVERY', 'method-1', { city: 'Riyadh', country: 'SA' },
    );
    expect(result.zoneId).toBe('zone-1');
  });

  it('zones exist + no matching zone → REJECT', async () => {
    mockDb.queryMock.deliveryZones.findMany.mockResolvedValue([
      { id: 'zone-1', storeId: 'store-1', name: 'Damascus', city: 'Damascus', region: null, postalCode: null, country: 'SY', isActive: true },
    ]);

    await expect(
      service.validateCheckoutSelection(
        'store-1', 'PLATFORM_DELIVERY', 'method-1', { city: 'Riyadh', country: 'SA' },
      ),
    ).rejects.toThrow('No delivery zone matches');
  });

  it('zone with method associations + method available → PASS', async () => {
    mockDb.queryMock.deliveryZones.findMany.mockResolvedValue([
      { id: 'zone-1', storeId: 'store-1', name: 'Riyadh', city: 'Riyadh', region: null, postalCode: null, country: 'SA', isActive: true },
    ]);
    // Zone has method associations and our method is included
    mockDb.selectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { zoneId: 'zone-1', shippingMethodId: 'method-1' },
        ]),
      }),
    });

    const result = await service.validateCheckoutSelection(
      'store-1', 'PLATFORM_DELIVERY', 'method-1', { city: 'Riyadh', country: 'SA' },
    );
    expect(result.zoneId).toBe('zone-1');
  });

  it('zone with method associations + method NOT available → REJECT', async () => {
    mockDb.queryMock.deliveryZones.findMany.mockResolvedValue([
      { id: 'zone-1', storeId: 'store-1', name: 'Riyadh', city: 'Riyadh', region: null, postalCode: null, country: 'SA', isActive: true },
    ]);
    // Zone has method associations but our method is NOT included
    mockDb.selectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { zoneId: 'zone-1', shippingMethodId: 'method-other' },
        ]),
      }),
    });

    await expect(
      service.validateCheckoutSelection(
        'store-1', 'PLATFORM_DELIVERY', 'method-1', { city: 'Riyadh', country: 'SA' },
      ),
    ).rejects.toThrow('not available in delivery zone');
  });

  it('inactive zone is excluded from matching', async () => {
    mockDb.queryMock.deliveryZones.findMany.mockResolvedValue([
      { id: 'zone-1', storeId: 'store-1', name: 'Riyadh', city: 'Riyadh', region: null, postalCode: null, country: 'SA', isActive: false },
    ]);

    // matchDeliveryZone filters inactive zones, so no match
    await expect(
      service.validateCheckoutSelection(
        'store-1', 'PLATFORM_DELIVERY', 'method-1', { city: 'Riyadh', country: 'SA' },
      ),
    ).rejects.toThrow('No delivery zone matches');
  });

  it('delivery address required for delivery methods', async () => {
    mockDb.queryMock.deliveryZones.findMany.mockResolvedValue([]);

    await expect(
      service.validateCheckoutSelection(
        'store-1', 'PLATFORM_DELIVERY', 'method-1', {},
      ),
    ).rejects.toThrow('Delivery address required');
  });
});

// ── Zero-Zone Policy ───────────────────────────────────────────────────────

describe('validateCheckoutSelection — zero-zone policy', () => {
  it('store with zero zones allows delivery to any address (unrestricted)', async () => {
    const mockDb = createMockDb();
    const service = createService(mockDb);

    mockDb.queryMock.shippingMethods.findFirst.mockResolvedValue({
      id: 'method-1', storeId: 'store-1', name: 'Standard', isActive: true,
    });
    mockDb.queryMock.deliveryZones.findMany.mockResolvedValue([]);

    // Even a foreign address should be allowed
    const result = await service.validateCheckoutSelection(
      'store-1', 'PLATFORM_DELIVERY', 'method-1',
      { city: 'Tokyo', country: 'JP' },
    );
    expect(result.method).not.toBeNull();
    expect(result.zoneId).toBeNull();
  });
});
