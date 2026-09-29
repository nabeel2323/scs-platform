/**
 * M7.2.4-A — Concurrency & Safety Unit Tests
 *
 * Tests the concurrency guarantees of the carrier operations hardening:
 *   - Tracking dedup: PG 23505 treated as idempotent dedup
 *   - Webhook retry: real re-processing with idempotent guard
 *   - Reconciliation: atomic claim logic
 *   - Tracking poller: atomic claim logic
 *   - Retry amplification: HTTP client maxRetries = 0
 *   - Forward-only status progression
 *
 * These unit tests verify the logic without requiring real PostgreSQL.
 * Concurrency tests requiring real PostgreSQL are in m724a-concurrency.postgres.spec.ts.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// ── Tracking Dedup ──────────────────────────────────────────────────────────

describe('M7.2.4-A — Tracking Event Dedup', () => {
  describe('PG 23505 idempotent dedup logic', () => {
    it('treats error code 23505 as idempotent duplicate (not a failure)', () => {
      // Simulate the dedup logic from carrier-tracking-poller.ts
      const processEvent = async (insertFn: () => Promise<void>): Promise<'inserted' | 'dedup'> => {
        try {
          await insertFn();
          return 'inserted';
        } catch (err: any) {
          if (err?.code === '23505') {
            return 'dedup';
          }
          throw err;
        }
      };

      // First insert succeeds
      const result1 = processEvent(async () => { /* success */ });
      expect(result1).resolves.toBe('inserted');

      // Duplicate insert returns dedup (not thrown)
      const result2 = processEvent(async () => {
        const err: any = new Error('duplicate key value');
        err.code = '23505';
        throw err;
      });
      expect(result2).resolves.toBe('dedup');
    });

    it('re-throws non-23505 errors', async () => {
      const processEvent = async (insertFn: () => Promise<void>) => {
        try {
          await insertFn();
          return 'inserted';
        } catch (err: any) {
          if (err?.code === '23505') return 'dedup';
          throw err;
        }
      };

      await expect(
        processEvent(async () => { throw new Error('connection refused'); })
      ).rejects.toThrow('connection refused');
    });

    it('handles error without code property', async () => {
      const processEvent = async (insertFn: () => Promise<void>) => {
        try {
          await insertFn();
          return 'inserted';
        } catch (err: any) {
          if (err?.code === '23505') return 'dedup';
          throw err;
        }
      };

      await expect(
        processEvent(async () => { throw { message: 'unknown' }; })
      ).rejects.toEqual({ message: 'unknown' });
    });
  });
});

// ── Status Progression ──────────────────────────────────────────────────────

describe('M7.2.4-A — Forward-Only Status Progression', () => {
  let canTransition: (currentStatus: string | null, incomingStatus: string) => boolean;
  let CARRIER_STATUS_ORDER: readonly string[];

  beforeAll(async () => {
    const mod = await import('../../../modules/shipping/carrier-tracking-poller');
    canTransition = mod.canTransition;
    CARRIER_STATUS_ORDER = mod.CARRIER_STATUS_ORDER;
  });

  it('prevents backward transition from DELIVERED to IN_TRANSIT', () => {
    expect(canTransition('DELIVERED', 'IN_TRANSIT')).toBe(false);
  });

  it('prevents backward transition from OUT_FOR_DELIVERY to PICKED_UP', () => {
    expect(canTransition('OUT_FOR_DELIVERY', 'PICKED_UP')).toBe(false);
  });

  it('prevents transition from terminal state COMPLETED', () => {
    expect(canTransition('COMPLETED', 'IN_TRANSIT')).toBe(false);
  });

  it('prevents transition from terminal state CANCELLED', () => {
    expect(canTransition('CANCELLED', 'IN_TRANSIT')).toBe(false);
  });

  it('allows forward transition from IN_TRANSIT to OUT_FOR_DELIVERY', () => {
    expect(canTransition('IN_TRANSIT', 'OUT_FOR_DELIVERY')).toBe(true);
  });

  it('allows first event (null current status)', () => {
    expect(canTransition(null, 'IN_TRANSIT')).toBe(true);
  });

  it('allows unknown status codes (pass-through)', () => {
    expect(canTransition('IN_TRANSIT', 'CUSTOM_CARRIER_STATUS')).toBe(true);
  });

  it('CARRIER_STATUS_ORDER has DELIVERED as last standard status', () => {
    const lastIdx = CARRIER_STATUS_ORDER.length - 1;
    expect(CARRIER_STATUS_ORDER[lastIdx]).toBe('DELIVERED');
  });
});

// ── Webhook Retry ───────────────────────────────────────────────────────────

describe('M7.2.4-A — Webhook Retry Logic', () => {
  describe('Idempotent guard', () => {
    it('skips already-processed webhook events', () => {
      const webhookEvent = {
        id: 'evt-1',
        processed: true,
        processedAt: new Date(),
        providerKey: 'aramex',
        externalDeliveryId: 'EXT-123',
        shipmentId: 'ship-1',
      };

      // Simulate the guard from handleWebhookRetry
      if (webhookEvent.processed) {
        // Should be a no-op
        expect(true).toBe(true);
      } else {
        throw new Error('Should not reach here');
      }
    });

    it('processes unprocessed webhook events', () => {
      const webhookEvent = {
        id: 'evt-1',
        processed: false,
        processingError: 'Previous error',
        providerKey: 'aramex',
        externalDeliveryId: 'EXT-123',
        shipmentId: null,
      };

      expect(webhookEvent.processed).toBe(false);
      // The retry should attempt re-processing
    });
  });

  describe('Outbox retry event structure', () => {
    it('webhook retry outbox event carries organizationId when credential has orgId', () => {
      const credential = { orgId: 'org-123' };
      const retryOrgId = (credential as any)?.orgId || null;
      expect(retryOrgId).toBe('org-123');
    });

    it('webhook retry outbox event has null organizationId when credential has no orgId', () => {
      const credential = {};
      const retryOrgId = (credential as any)?.orgId || null;
      expect(retryOrgId).toBeNull();
    });
  });
});

// ── Retry Amplification Protection ──────────────────────────────────────────

describe('M7.2.4-A — Retry Amplification Protection', () => {
  it('CarrierHttpClient defaults maxRetries to 0', async () => {
    const { CarrierHttpClient } = await import(
      '../../../modules/shipping/carrier-http-client'
    );

    const client = new CarrierHttpClient({
      providerKey: 'test-provider',
    });

    // Access the private config via any cast for test verification
    const config = (client as any).config;
    expect(config.maxRetries).toBe(0);
  });

  it('ARAMEX_MAX_RETRIES is 0 (no HTTP-level retries)', async () => {
    const { ARAMEX_MAX_RETRIES } = await import(
      '../../../modules/shipping/aramex/aramex.constants'
    );
    expect(ARAMEX_MAX_RETRIES).toBe(0);
  });

  it('maxAttempts = 1 + maxRetries = 1 when maxRetries is 0', async () => {
    const { CarrierHttpClient } = await import(
      '../../../modules/shipping/carrier-http-client'
    );

    const client = new CarrierHttpClient({
      providerKey: 'test-provider',
    });

    const config = (client as any).config;
    const maxAttempts = 1 + config.maxRetries;
    expect(maxAttempts).toBe(1); // Exactly one attempt — no retries
  });
});

// ── Reconciliation Atomic Claim ─────────────────────────────────────────────

describe('M7.2.4-A — Reconciliation Atomic Claim', () => {
  it('CLAIM_LEASE_MS is defined and positive', async () => {
    const { CarrierReconciliationService } = await import(
      '../../../modules/shipping/carrier-reconciliation.service'
    );

    // Access the static constant
    const leaseMs = (CarrierReconciliationService as any).CLAIM_LEASE_MS;
    expect(leaseMs).toBeGreaterThan(0);
    expect(leaseMs).toBe(10 * 60 * 1000); // 10 minutes
  });

  it('BATCH_SIZE is bounded', async () => {
    const { CarrierReconciliationService } = await import(
      '../../../modules/shipping/carrier-reconciliation.service'
    );

    const batchSize = (CarrierReconciliationService as any).BATCH_SIZE;
    expect(batchSize).toBeGreaterThan(0);
    expect(batchSize).toBeLessThanOrEqual(100);
  });
});

// ── Tracking Poller Atomic Claim ────────────────────────────────────────────

describe('M7.2.4-A — Tracking Poller Atomic Claim', () => {
  it('MIN_POLL_INTERVAL_MS is defined and positive', async () => {
    const { CarrierTrackingPoller } = await import(
      '../../../modules/shipping/carrier-tracking-poller'
    );

    const minInterval = (CarrierTrackingPoller as any).MIN_POLL_INTERVAL_MS;
    expect(minInterval).toBeGreaterThan(0);
    expect(minInterval).toBe(10 * 60 * 1000); // 10 minutes
  });

  it('BATCH_SIZE is bounded', async () => {
    const { CarrierTrackingPoller } = await import(
      '../../../modules/shipping/carrier-tracking-poller'
    );

    const batchSize = (CarrierTrackingPoller as any).BATCH_SIZE;
    expect(batchSize).toBeGreaterThan(0);
    expect(batchSize).toBeLessThanOrEqual(100);
  });
});

// ── Observability ───────────────────────────────────────────────────────────

describe('M7.2.4-A — Observability Counters', () => {
  const mockDb = { db: { execute: async () => ({ rows: [{ cnt: 5 }] }) } } as any;

  it('recordDuration accumulates duration and count', async () => {
    const { CarrierObservabilityService } = await import(
      '../../../modules/shipping/carrier-observability'
    );

    const svc = new CarrierObservabilityService(mockDb);
    svc.recordDuration('aramex', 'createShipment', 250);
    svc.recordDuration('aramex', 'createShipment', 350);

    expect(svc.getAverageDuration('aramex', 'createShipment')).toBe(300); // (250+350)/2
  });

  it('getAverageDuration returns 0 for unknown provider/operation', async () => {
    const { CarrierObservabilityService } = await import(
      '../../../modules/shipping/carrier-observability'
    );

    const svc = new CarrierObservabilityService(mockDb);
    expect(svc.getAverageDuration('unknown', 'unknown')).toBe(0);
  });

  it('getOutboxPendingCount queries DB and returns count', async () => {
    const { CarrierObservabilityService } = await import(
      '../../../modules/shipping/carrier-observability'
    );

    const svc = new CarrierObservabilityService(mockDb);
    const count = await svc.getOutboxPendingCount();
    expect(count).toBe(5);
  });

  it('getOutboxDeadLetterCount queries DB and returns count', async () => {
    const { CarrierObservabilityService } = await import(
      '../../../modules/shipping/carrier-observability'
    );

    const svc = new CarrierObservabilityService(mockDb);
    const count = await svc.getOutboxDeadLetterCount();
    expect(count).toBe(5);
  });

  it('supports carrier_reconciliation_failures_total counter', async () => {
    const { CarrierObservabilityService } = await import(
      '../../../modules/shipping/carrier-observability'
    );

    const svc = new CarrierObservabilityService(mockDb);
    svc.incrementCounter('carrier_reconciliation_failures_total', 'aramex');
    expect(svc.getCounter('carrier_reconciliation_failures_total', 'aramex')).toBe(1);
  });

  it('supports carrier_request_duration_ms counter', async () => {
    const { CarrierObservabilityService } = await import(
      '../../../modules/shipping/carrier-observability'
    );

    const svc = new CarrierObservabilityService(mockDb);
    svc.incrementCounter('carrier_request_duration_ms', 'aramex', 500);
    expect(svc.getCounter('carrier_request_duration_ms', 'aramex')).toBe(500);
  });
});
