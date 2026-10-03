import { describe, expect, it } from 'vitest';
import { EXCEPTION_TYPES, exceptionLabel, isRtsStatus } from '../lib/shipops';
import { buyerDeliveryNote, buyerEventLabel } from '../lib/buyer-api';

/**
 * M7.3-B.6 — Merchant/buyer ship-ops projection logic tests.
 *
 * Covers the pure helpers the delivery UIs depend on: exception labelling and
 * RTS classification (merchant) and the buyer-safe delivery note projection.
 */

describe('merchant exception helpers', () => {
  it('exposes the eight canonical exception types', () => {
    expect(EXCEPTION_TYPES).toHaveLength(8);
    expect(EXCEPTION_TYPES).toContain('RECIPIENT_UNAVAILABLE');
    expect(EXCEPTION_TYPES).toContain('LOST');
  });

  it('humanises an exception state and appends the type when relevant', () => {
    expect(exceptionLabel('OPEN', 'DAMAGED')).toBe('Open · DAMAGED');
    expect(exceptionLabel('RETRY_PENDING')).toBe('Retry Pending');
    // Completed RTS should not re-surface the type.
    expect(exceptionLabel('RTS_COMPLETED', 'LOST')).toBe('Rts Completed');
  });

  it('classifies return-to-sender stages', () => {
    expect(isRtsStatus('RTS_PENDING')).toBe(true);
    expect(isRtsStatus('RTS_IN_PROGRESS')).toBe(true);
    expect(isRtsStatus('RTS_COMPLETED')).toBe(true);
    expect(isRtsStatus('OPEN')).toBe(false);
    expect(isRtsStatus(null)).toBe(false);
  });
});

describe('buyer delivery note projection', () => {
  it('translates active exception and RTS states into buyer-facing copy', () => {
    expect(buyerDeliveryNote('OPEN')).toMatch(/delivery issue/);
    expect(buyerDeliveryNote('RETRY_PENDING')).toMatch(/redelivery/i);
    expect(buyerDeliveryNote('RESOLVED')).toMatch(/resolved/i);
    expect(buyerDeliveryNote('RTS_PENDING')).toMatch(/returned to the seller/i);
    expect(buyerDeliveryNote('RTS_IN_PROGRESS')).toMatch(/on its way back/i);
    expect(buyerDeliveryNote('RTS_COMPLETED')).toMatch(/has been returned/i);
  });

  it('never exposes internal admin states to buyers', () => {
    expect(buyerDeliveryNote('CLOSED')).toBeNull();
    expect(buyerDeliveryNote('SOMETHING_INTERNAL')).toBeNull();
  });
});

describe('buyer event label projection (defense-in-depth)', () => {
  it('maps known buyer-safe events to human-readable labels', () => {
    expect(buyerEventLabel('PREPARING')).toBe('Order being prepared');
    expect(buyerEventLabel('READY')).toBe('Ready for pickup');
    expect(buyerEventLabel('ASSIGNED')).toBe('Driver assigned');
    expect(buyerEventLabel('PICKED_UP')).toBe('Picked up');
    expect(buyerEventLabel('OUT_FOR_DELIVERY')).toBe('Out for delivery');
    expect(buyerEventLabel('DELIVERED')).toBe('Delivered');
    expect(buyerEventLabel('DELIVERY_EXCEPTION')).toBe('Delivery issue reported');
    expect(buyerEventLabel('DELIVERY_EXCEPTION_RESOLVED')).toBe('Delivery issue resolved');
    expect(buyerEventLabel('DELIVERY_EXCEPTION_CLOSED')).toBe('Delivery issue closed');
    expect(buyerEventLabel('DELIVERY_RETRY_REQUESTED')).toBe('Redelivery being arranged');
    expect(buyerEventLabel('CANCELLED')).toBe('Cancelled');
  });

  it('returns null for all internal RTS event types', () => {
    expect(buyerEventLabel('RTS_REQUESTED')).toBeNull();
    expect(buyerEventLabel('RTS_APPROVED')).toBeNull();
    expect(buyerEventLabel('RTS_REJECTED')).toBeNull();
    expect(buyerEventLabel('RTS_COMPLETED')).toBeNull();
  });

  it('returns null for unknown event types (deny-by-default)', () => {
    expect(buyerEventLabel('SOME_FUTURE_EVENT')).toBeNull();
    expect(buyerEventLabel('')).toBeNull();
    expect(buyerEventLabel('INTERNAL_ADMIN_ONLY')).toBeNull();
  });
});
