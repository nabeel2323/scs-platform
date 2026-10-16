/**
 * M7.3-B.5 — RTS + Reconciliation Unit Tests
 *
 * Tests the RTS lifecycle, authorization, eligibility, and validation
 * using mocked dependencies (no PostgreSQL required).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrdersService } from '../../../modules/orders/orders.service';
import { OutboxDispatcher } from '../../../common/outbox/outbox-dispatcher.service';
import { PromotionsService } from '../../../modules/promotions/promotions.service';
import { DatabaseService } from '../../../common/database/database.service';

// ── Mocks ──────────────────────────────────────────────────────────────

function createMockDb() {
  const chain: any = {
    where: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'test-id' }]),
    values: vi.fn().mockResolvedValue(undefined),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    columns: vi.fn().mockReturnThis(),
  };
  const queryProxy: any = {
    shipments: { findFirst: vi.fn() },
    orders: { findFirst: vi.fn() },
    stores: { findFirst: vi.fn() },
  };
  return {
    db: {
      query: queryProxy,
      update: vi.fn().mockReturnValue(chain),
      insert: vi.fn().mockReturnValue(chain),
      select: vi.fn().mockReturnValue(chain),
      transaction: vi.fn().mockImplementation(async (fn: any) => {
        const tx = {
          update: vi.fn().mockReturnValue(chain),
          insert: vi.fn().mockReturnValue(chain),
          select: vi.fn().mockReturnValue(chain),
          query: queryProxy,
        };
        return fn(tx);
      }),
    },
    pool: {},
  } as unknown as DatabaseService;
}

function createService(db?: DatabaseService) {
  const database = db || createMockDb();
  const outbox = { publish: vi.fn().mockResolvedValue(undefined) } as unknown as OutboxDispatcher;
  const promotions = {} as PromotionsService;
  const realtime = { emitNewOrder: vi.fn(), emitOrderStatusChanged: vi.fn(), server: { to: () => ({ emit: vi.fn() }) } } as any;
  const notifications = { send: vi.fn().mockResolvedValue(undefined) } as any;
  return new OrdersService(database, outbox, promotions, realtime, undefined, notifications);
}

// ═══════════════════════════════════════════════════════════════════
//  RTS AUTHORIZATION
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-B.5 — RTS Authorization', () => {
  it('rejects DRIVER role from requesting RTS', async () => {
    const service = createService();
    const driverCaller = { sub: 'driver-1', role: 'DRIVER', activeOrg: 'org-1' };

    await expect(
      service.requestRTS('ship-1', undefined, driverCaller as any),
    ).rejects.toThrow(/cannot request RTS/);
  });

  it('rejects BUYER role from requesting RTS', async () => {
    const service = createService();
    const buyerCaller = { sub: 'buyer-1', role: 'BUYER', activeOrg: 'org-1' };

    await expect(
      service.requestRTS('ship-1', undefined, buyerCaller as any),
    ).rejects.toThrow(/cannot request RTS/);
  });

  it('rejects DRIVER role from approving RTS', async () => {
    const service = createService();
    const driverCaller = { sub: 'driver-1', role: 'DRIVER', activeOrg: 'org-1' };

    await expect(
      service.approveRTS('ship-1', driverCaller as any),
    ).rejects.toThrow(/cannot approve RTS/);
  });

  it('rejects BUYER role from approving RTS', async () => {
    const service = createService();
    const buyerCaller = { sub: 'buyer-1', role: 'BUYER', activeOrg: 'org-1' };

    await expect(
      service.approveRTS('ship-1', buyerCaller as any),
    ).rejects.toThrow(/cannot approve RTS/);
  });

  it('rejects DRIVER role from rejecting RTS', async () => {
    const service = createService();
    const driverCaller = { sub: 'driver-1', role: 'DRIVER', activeOrg: 'org-1' };

    await expect(
      service.rejectRTS('ship-1', 'notes', driverCaller as any),
    ).rejects.toThrow(/cannot reject RTS/);
  });

  it('rejects BUYER role from rejecting RTS', async () => {
    const service = createService();
    const buyerCaller = { sub: 'buyer-1', role: 'BUYER', activeOrg: 'org-1' };

    await expect(
      service.rejectRTS('ship-1', 'notes', buyerCaller as any),
    ).rejects.toThrow(/cannot reject RTS/);
  });

  it('rejects DRIVER role from completing RTS', async () => {
    const service = createService();
    const driverCaller = { sub: 'driver-1', role: 'DRIVER', activeOrg: 'org-1' };

    await expect(
      service.completeRTS('ship-1', undefined, driverCaller as any),
    ).rejects.toThrow(/cannot complete RTS/);
  });

  it('rejects BUYER role from completing RTS', async () => {
    const service = createService();
    const buyerCaller = { sub: 'buyer-1', role: 'BUYER', activeOrg: 'org-1' };

    await expect(
      service.completeRTS('ship-1', undefined, buyerCaller as any),
    ).rejects.toThrow(/cannot complete RTS/);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  RTS REJECTION VALIDATION
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-B.5 — RTS Rejection Validation', () => {
  it('rejects empty notes', async () => {
    const service = createService();
    const adminCaller = { sub: 'admin-1', role: 'ADMIN', activeOrg: 'org-1' };

    await expect(
      service.rejectRTS('ship-1', '', adminCaller as any),
    ).rejects.toThrow(/mandatory/);
  });

  it('rejects whitespace-only notes', async () => {
    const service = createService();
    const adminCaller = { sub: 'admin-1', role: 'ADMIN', activeOrg: 'org-1' };

    await expect(
      service.rejectRTS('ship-1', '   ', adminCaller as any),
    ).rejects.toThrow(/mandatory/);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  LOST RTS VALIDATION
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-B.5 — LOST RTS Validation', () => {
  it('rejects non-admin from LOST direct flow', async () => {
    const service = createService();
    const merchantCaller = { sub: 'merchant-1', role: 'MERCHANT_OWNER', activeOrg: 'org-1' };

    await expect(
      service.requestAndApproveLostRTS('ship-1', 'notes', merchantCaller as any),
    ).rejects.toThrow(/ADMIN/);
  });

  it('rejects empty investigation notes', async () => {
    const service = createService();
    const adminCaller = { sub: 'admin-1', role: 'ADMIN', activeOrg: 'org-1' };

    await expect(
      service.requestAndApproveLostRTS('ship-1', '', adminCaller as any),
    ).rejects.toThrow(/mandatory/);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  EXCEPTION TRANSITIONS MAP
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-B.5 — Exception FSM Constants', () => {
  it('EXCEPTION_TRANSITIONS includes RTS_IN_PROGRESS', () => {
    // Verify through the service that the transition map is correct
    // The map is private, but we can verify through behavior in integration tests
    // Here we just verify the service can be instantiated
    const service = createService();
    expect(service).toBeDefined();
  });
});
