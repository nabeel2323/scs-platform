/**
 * Carrier Tracking Dedup & Ordering — Unit Tests (M7.2.3-C)
 *
 * Tests:
 *   - canTransition() forward-only status progression
 *   - trackingEventFingerprint() deterministic dedup
 *   - Terminal state protection
 *   - Unknown status pass-through
 */

import { describe, it, expect } from 'vitest';
import {
  canTransition,
  trackingEventFingerprint,
  CARRIER_STATUS_ORDER,
} from '../../../modules/shipping/carrier-tracking-poller';

describe('Tracking Status Progression', () => {
  describe('canTransition()', () => {
    it('allows first event (null current status)', () => {
      expect(canTransition(null, 'CREATED')).toBe(true);
      expect(canTransition(null, 'IN_TRANSIT')).toBe(true);
    });

    it('allows forward transitions', () => {
      expect(canTransition('CREATED', 'PICKED_UP')).toBe(true);
      expect(canTransition('CREATED', 'IN_TRANSIT')).toBe(true);
      expect(canTransition('PICKED_UP', 'IN_TRANSIT')).toBe(true);
      expect(canTransition('IN_TRANSIT', 'OUT_FOR_DELIVERY')).toBe(true);
      expect(canTransition('OUT_FOR_DELIVERY', 'DELIVERED')).toBe(true);
    });

    it('blocks backward transitions', () => {
      expect(canTransition('IN_TRANSIT', 'CREATED')).toBe(false);
      expect(canTransition('OUT_FOR_DELIVERY', 'IN_TRANSIT')).toBe(false);
      expect(canTransition('DELIVERED', 'IN_TRANSIT')).toBe(false);
      expect(canTransition('DELIVERED', 'OUT_FOR_DELIVERY')).toBe(false);
    });

    it('blocks transitions from same status', () => {
      expect(canTransition('IN_TRANSIT', 'IN_TRANSIT')).toBe(false);
      expect(canTransition('CREATED', 'CREATED')).toBe(false);
    });

    it('blocks transitions from terminal states', () => {
      expect(canTransition('DELIVERED', 'IN_TRANSIT')).toBe(false);
      expect(canTransition('CANCELLED', 'CREATED')).toBe(false);
      expect(canTransition('COMPLETED', 'DELIVERED')).toBe(false);
    });

    it('allows unknown statuses (pass-through)', () => {
      // Unknown carrier-specific codes should not be blocked
      expect(canTransition('IN_TRANSIT', 'CUSTOMS_HOLD')).toBe(true);
      expect(canTransition('UNKNOWN_STATUS', 'IN_TRANSIT')).toBe(true);
    });
  });

  describe('CARRIER_STATUS_ORDER', () => {
    it('has correct ordering', () => {
      expect(CARRIER_STATUS_ORDER.indexOf('CREATED')).toBeLessThan(CARRIER_STATUS_ORDER.indexOf('PICKED_UP'));
      expect(CARRIER_STATUS_ORDER.indexOf('PICKED_UP')).toBeLessThan(CARRIER_STATUS_ORDER.indexOf('IN_TRANSIT'));
      expect(CARRIER_STATUS_ORDER.indexOf('IN_TRANSIT')).toBeLessThan(CARRIER_STATUS_ORDER.indexOf('OUT_FOR_DELIVERY'));
      expect(CARRIER_STATUS_ORDER.indexOf('OUT_FOR_DELIVERY')).toBeLessThan(CARRIER_STATUS_ORDER.indexOf('DELIVERED'));
    });
  });
});

describe('Tracking Event Fingerprint', () => {
  it('generates deterministic fingerprints', () => {
    const fp1 = trackingEventFingerprint('aramex', 'ship-1', 'IT01', '2024-01-01T10:00:00Z', 'In transit');
    const fp2 = trackingEventFingerprint('aramex', 'ship-1', 'IT01', '2024-01-01T10:00:00Z', 'In transit');
    expect(fp1).toBe(fp2);
  });

  it('generates different fingerprints for different inputs', () => {
    const fp1 = trackingEventFingerprint('aramex', 'ship-1', 'IT01', '2024-01-01T10:00:00Z', 'In transit');
    const fp2 = trackingEventFingerprint('aramex', 'ship-1', 'IT02', '2024-01-01T10:00:00Z', 'At facility');
    expect(fp1).not.toBe(fp2);
  });

  it('differentiates by provider', () => {
    const fp1 = trackingEventFingerprint('aramex', 'ship-1', 'IT01', '2024-01-01T10:00:00Z', 'In transit');
    const fp2 = trackingEventFingerprint('smsa', 'ship-1', 'IT01', '2024-01-01T10:00:00Z', 'In transit');
    expect(fp1).not.toBe(fp2);
  });

  it('differentiates by shipment', () => {
    const fp1 = trackingEventFingerprint('aramex', 'ship-1', 'IT01', '2024-01-01T10:00:00Z', 'In transit');
    const fp2 = trackingEventFingerprint('aramex', 'ship-2', 'IT01', '2024-01-01T10:00:00Z', 'In transit');
    expect(fp1).not.toBe(fp2);
  });

  it('handles null event code and description', () => {
    const fp = trackingEventFingerprint('aramex', 'ship-1', null, '2024-01-01T10:00:00Z', null);
    expect(fp).toBeTruthy();
    expect(fp.startsWith('fp-')).toBe(true);
  });

  it('always starts with fp- prefix', () => {
    for (let i = 0; i < 10; i++) {
      const fp = trackingEventFingerprint('test', `ship-${i}`, `code-${i}`, `2024-01-0${i}T00:00:00Z`, `desc-${i}`);
      expect(fp.startsWith('fp-')).toBe(true);
    }
  });
});
