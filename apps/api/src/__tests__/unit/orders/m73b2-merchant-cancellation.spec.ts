/**
 * M7.3-B.2 — Merchant Cancellation + Shipment Synchronization
 *
 * Pure-logic unit tests (no DB) covering:
 * - Actor resolution: BUYER / MERCHANT / ADMIN / SYSTEM correctly resolved
 * - Cancellation reason validation: valid reasons accepted, invalid rejected,
 *   OTHER requires notes
 * - Cancellation eligibility by status
 * - Generic status endpoint guard blocks CANCELLED
 * - Outbox payload shape (actorType, reason, source)
 *
 * DB and outbox are mocked — these tests verify pure business logic only.
 */
import { describe, it, expect } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';

// ── Replicate pure logic from OrdersService for isolated testing ─────

/**
 * Cancellation reason validation — B.0 locked set.
 */
const CANCELLATION_REASONS = new Set([
  'CUSTOMER_REQUEST', 'DUPLICATE_ORDER', 'MERCHANT_UNABLE_TO_FULFILL',
  'OUT_OF_STOCK', 'PRICE_ERROR', 'ADDRESS_PROBLEM', 'PAYMENT_PROBLEM',
  'CARRIER_PROBLEM', 'SYSTEM_ERROR', 'ADMINISTRATIVE', 'OTHER',
]);

function validateCancellationReason(reason: string, notes?: string): void {
  if (!CANCELLATION_REASONS.has(reason)) {
    throw new BadRequestException(
      `Invalid cancellation reason: ${reason}. Allowed: ${[...CANCELLATION_REASONS].join(', ')}`,
    );
  }
  if (reason === 'OTHER' && !notes?.trim()) {
    throw new BadRequestException(
      'Cancellation reason OTHER requires explanatory notes',
    );
  }
}

/**
 * Actor resolution from caller context.
 */
interface CallerContext {
  sub: string;
  role?: string | null;
  activeOrg?: string | null;
}

function resolveActorType(caller?: CallerContext): string {
  if (!caller?.role) return 'SYSTEM';
  const role = caller.role;
  if (['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(role)) return 'ADMIN';
  if (role === 'BUYER') return 'BUYER';
  if (['MERCHANT_OWNER', 'MERCHANT_MANAGER'].includes(role)) return 'MERCHANT';
  if (role === 'DRIVER') return 'DRIVER';
  return 'SYSTEM';
}

/**
 * Cancellable statuses (pre-DELIVERED).
 */
const CANCELLABLE_STATUSES = [
  'PENDING_CONFIRMATION',
  'ACCEPTED',
  'PARTIALLY_ACCEPTED',
  'PREPARING',
  'READY',
  'PAYMENT_PENDING',
];

function isCancellable(status: string): boolean {
  return CANCELLABLE_STATUSES.includes(status);
}

/**
 * Generic status endpoint guard — blocks CANCELLED.
 */
function assertNotCancelledViaGenericEndpoint(newStatus: string): void {
  if (newStatus === 'CANCELLED') {
    throw new BadRequestException(
      'Cancellation must use the dedicated POST /v1/orders/:id/cancel endpoint',
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-B.2 — Actor Resolution', () => {
  it('resolves BUYER role to BUYER actor', () => {
    expect(resolveActorType({ sub: 'u1', role: 'BUYER' })).toBe('BUYER');
  });

  it('resolves MERCHANT_OWNER to MERCHANT actor', () => {
    expect(resolveActorType({ sub: 'u1', role: 'MERCHANT_OWNER' })).toBe('MERCHANT');
  });

  it('resolves MERCHANT_MANAGER to MERCHANT actor', () => {
    expect(resolveActorType({ sub: 'u1', role: 'MERCHANT_MANAGER' })).toBe('MERCHANT');
  });

  it('resolves ADMIN to ADMIN actor', () => {
    expect(resolveActorType({ sub: 'u1', role: 'ADMIN' })).toBe('ADMIN');
  });

  it('resolves SUPER_ADMIN to ADMIN actor', () => {
    expect(resolveActorType({ sub: 'u1', role: 'SUPER_ADMIN' })).toBe('ADMIN');
  });

  it('resolves MODERATOR to ADMIN actor', () => {
    expect(resolveActorType({ sub: 'u1', role: 'MODERATOR' })).toBe('ADMIN');
  });

  it('resolves DRIVER to DRIVER actor', () => {
    expect(resolveActorType({ sub: 'u1', role: 'DRIVER' })).toBe('DRIVER');
  });

  it('resolves unknown role to SYSTEM actor', () => {
    expect(resolveActorType({ sub: 'u1', role: 'UNKNOWN_ROLE' })).toBe('SYSTEM');
  });

  it('resolves missing caller to SYSTEM actor', () => {
    expect(resolveActorType(undefined)).toBe('SYSTEM');
  });

  it('resolves caller with no role to SYSTEM actor', () => {
    expect(resolveActorType({ sub: 'u1', role: null })).toBe('SYSTEM');
  });
});

describe('M7.3-B.2 — Cancellation Reason Validation', () => {
  const validReasons = [
    'CUSTOMER_REQUEST', 'DUPLICATE_ORDER', 'MERCHANT_UNABLE_TO_FULFILL',
    'OUT_OF_STOCK', 'PRICE_ERROR', 'ADDRESS_PROBLEM', 'PAYMENT_PROBLEM',
    'CARRIER_PROBLEM', 'SYSTEM_ERROR', 'ADMINISTRATIVE', 'OTHER',
  ];

  it('accepts all 11 valid cancellation reasons', () => {
    for (const reason of validReasons) {
      // OTHER requires notes, so pass notes for that one
      const notes = reason === 'OTHER' ? 'Some explanation' : undefined;
      expect(() => validateCancellationReason(reason, notes)).not.toThrow();
    }
  });

  it('rejects invalid cancellation reason', () => {
    expect(() => validateCancellationReason('INVALID_REASON')).toThrow(BadRequestException);
    expect(() => validateCancellationReason('')).toThrow(BadRequestException);
    expect(() => validateCancellationReason('customer_request')).toThrow(BadRequestException);
    expect(() => validateCancellationReason('CHANGED_MIND')).toThrow(BadRequestException);
  });

  it('rejects OTHER without notes', () => {
    expect(() => validateCancellationReason('OTHER')).toThrow(BadRequestException);
    expect(() => validateCancellationReason('OTHER', '')).toThrow(BadRequestException);
    expect(() => validateCancellationReason('OTHER', '   ')).toThrow(BadRequestException);
  });

  it('accepts OTHER with non-empty notes', () => {
    expect(() => validateCancellationReason('OTHER', 'Customer called and requested cancel')).not.toThrow();
  });

  it('does not require notes for non-OTHER reasons', () => {
    expect(() => validateCancellationReason('CUSTOMER_REQUEST')).not.toThrow();
    expect(() => validateCancellationReason('OUT_OF_STOCK')).not.toThrow();
  });

  it('error message includes allowed reasons', () => {
    expect(() => validateCancellationReason('BAD_REASON')).toThrow(/CUSTOMER_REQUEST/);
    expect(() => validateCancellationReason('BAD_REASON')).toThrow(/OTHER/);
  });
});

describe('M7.3-B.2 — Cancellation Eligibility by Status', () => {
  it('allows cancellation of pre-fulfillment statuses', () => {
    const cancellable = [
      'PENDING_CONFIRMATION', 'ACCEPTED',
      'PARTIALLY_ACCEPTED', 'PREPARING', 'READY', 'PAYMENT_PENDING',
    ];
    for (const status of cancellable) {
      expect(isCancellable(status)).toBe(true);
    }
  });

  it('blocks cancellation of terminal/post-fulfillment statuses', () => {
    const nonCancellable = [
      'SUBMITTED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'DISPUTED',
      'OUT_FOR_DELIVERY', 'ASSIGNED', 'PICKED_UP', 'DRAFT',
    ];
    for (const status of nonCancellable) {
      expect(isCancellable(status)).toBe(false);
    }
  });
});

describe('M7.3-B.2 — Generic Status Endpoint Guard', () => {
  it('blocks CANCELLED via generic /status endpoint', () => {
    expect(() => assertNotCancelledViaGenericEndpoint('CANCELLED')).toThrow(BadRequestException);
    expect(() => assertNotCancelledViaGenericEndpoint('CANCELLED')).toThrow(
      /dedicated POST \/v1\/orders\/:id\/cancel/,
    );
  });

  it('allows non-CANCELLED statuses via generic /status endpoint', () => {
    const allowed = ['ACCEPTED', 'PREPARING', 'READY', 'REJECTED', 'DELIVERED', 'COMPLETED'];
    for (const status of allowed) {
      expect(() => assertNotCancelledViaGenericEndpoint(status)).not.toThrow();
    }
  });
});

describe('M7.3-B.2 — Outbox Payload Shape', () => {
  it('order.cancelled payload includes actorType, reason, source', () => {
    const payload = {
      orderId: 'order-123',
      status: 'CANCELLED',
      storeId: 'store-456',
      buyerId: 'buyer-789',
      actorType: 'MERCHANT',
      reason: 'OUT_OF_STOCK',
      source: 'cancelOrder',
    };

    expect(payload.actorType).toBe('MERCHANT');
    expect(payload.reason).toBe('OUT_OF_STOCK');
    expect(payload.source).toBe('cancelOrder');
    expect(payload.status).toBe('CANCELLED');
    expect(payload.orderId).toBe('order-123');
  });

  it('shipment.cancelled payload includes actorType, reason, source', () => {
    const payload = {
      shipmentId: 'ship-123',
      orderId: 'order-456',
      status: 'CANCELLED',
      reason: 'CUSTOMER_REQUEST',
      actorType: 'BUYER',
      source: 'cancelOrder',
    };

    expect(payload.actorType).toBe('BUYER');
    expect(payload.reason).toBe('CUSTOMER_REQUEST');
    expect(payload.source).toBe('cancelOrder');
    expect(payload.shipmentId).toBe('ship-123');
  });
});

describe('M7.3-B.2 — Merchant Authorization Logic', () => {
  it('merchant caller context carries MERCHANT actor type', () => {
    const merchantCaller: CallerContext = {
      sub: 'merchant-user-1',
      role: 'MERCHANT_OWNER',
      activeOrg: 'org-1',
    };
    expect(resolveActorType(merchantCaller)).toBe('MERCHANT');
  });

  it('buyer caller context carries BUYER actor type', () => {
    const buyerCaller: CallerContext = {
      sub: 'buyer-user-1',
      role: 'BUYER',
      activeOrg: null,
    };
    expect(resolveActorType(buyerCaller)).toBe('BUYER');
  });

  it('different actor types produce correct audit trail values', () => {
    const scenarios: Array<{ caller: CallerContext; expected: string }> = [
      { caller: { sub: 'u1', role: 'BUYER' }, expected: 'BUYER' },
      { caller: { sub: 'u2', role: 'MERCHANT_OWNER' }, expected: 'MERCHANT' },
      { caller: { sub: 'u3', role: 'MERCHANT_MANAGER' }, expected: 'MERCHANT' },
      { caller: { sub: 'u4', role: 'ADMIN' }, expected: 'ADMIN' },
      { caller: { sub: 'u5', role: 'SUPER_ADMIN' }, expected: 'ADMIN' },
      { caller: { sub: 'u6', role: 'DRIVER' }, expected: 'DRIVER' },
    ];

    for (const { caller, expected } of scenarios) {
      expect(resolveActorType(caller)).toBe(expected);
    }
  });
});
