/**
 * Carrier Reconciliation Service — M7.2.3-C
 *
 * Scheduled service that reconciles uncertain carrier shipment states.
 *
 * Reconciliation cases:
 *   A. SUCCESS + carrierShipmentId → nothing (already complete)
 *   B. PENDING + carrier has it   → recover carrierShipmentId → SUCCESS
 *   C. PENDING + carrier doesn't  → safe retry if provider allows
 *   D. RECOVERY_REQUIRED          → lookup, then route through B or C
 *
 * Never blindly recreates shipments.
 * Bounded batch processing, tenant-aware, configurable cadence.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { eq, and, isNull, lte, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { ShippingProviderRegistry } from './shipping-registry';
import { shipments } from '../orders/shipment.schema';
import { CarrierObservabilityService } from './carrier-observability';
import { CarrierCircuitBreaker } from './carrier-circuit-breaker';
import { CarrierEmailResolver } from './carrier-email-resolver';
import { generateIdempotencyKey, CreateShipmentRequest } from './shipping.types';
import { classifyCarrierError } from './carrier-errors';

// ── Types ───────────────────────────────────────────────────────────────────

export type ReconciliationOutcome =
  | 'already_complete'    // Case A
  | 'recovered'           // Case B
  | 'retry_safe'          // Case C (retry triggered)
  | 'not_found_deferred'  // Case C (not found, not safe to retry)
  | 'routed_to_recovery'  // Case D
  | 'error';

export interface ReconciliationResult {
  shipmentId: string;
  outcome: ReconciliationOutcome;
  detail?: string;
}

// ── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class CarrierReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CarrierReconciliationService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /** Reconciliation interval: 10 minutes (configurable). */
  private readonly intervalMs: number;

  /** Maximum shipments to reconcile per cycle. */
  private static readonly BATCH_SIZE = 20;

  constructor(
    private readonly db: DatabaseService,
    private readonly registry: ShippingProviderRegistry,
    private readonly observability: CarrierObservabilityService,
    private readonly circuitBreaker: CarrierCircuitBreaker,
    private readonly emailResolver: CarrierEmailResolver,
  ) {
    this.intervalMs = parseInt(
      process.env['CARRIER_RECONCILIATION_INTERVAL_MS'] || '600000',
      10,
    );
  }

  onModuleInit() {
    setTimeout(() => this.startCycle(), 20_000);
    this.logger.log('CarrierReconciliationService registered.');
  }

  onModuleDestroy() {
    this.stopCycle();
  }

  private startCycle() {
    this.timer = setInterval(() => this.reconcile(), this.intervalMs);
  }

  private stopCycle() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Run a reconciliation cycle.
   * Can also be called directly (e.g., from admin recovery endpoint).
   */
  async reconcile(): Promise<ReconciliationResult[]> {
    if (this.running) return [];
    this.running = true;

    const results: ReconciliationResult[] = [];

    try {
      // Find shipments needing reconciliation
      const candidates = await this.db.db
        .select()
        .from(shipments)
        .where(
          or(
            // RECOVERY_REQUIRED state
            eq(shipments.carrierCreateStatus, 'RECOVERY_REQUIRED' as any),
            // Stuck PENDING/IN_PROGRESS with reconciliation due
            and(
              or(
                eq(shipments.carrierCreateStatus, 'PENDING' as any),
                eq(shipments.carrierCreateStatus, 'IN_PROGRESS' as any),
              ),
              lte(shipments.nextReconciliationAt, new Date()),
            ),
          ),
        )
        .orderBy(shipments.createdAt)
        .limit(CarrierReconciliationService.BATCH_SIZE);

      this.logger.log(`Reconciliation cycle: ${candidates.length} candidates.`);

      for (const shipment of candidates) {
        const result = await this.reconcileShipment(shipment);
        results.push(result);
      }

      if (results.length > 0) {
        this.logger.log(
          `Reconciliation complete: ${results.map(r => r.outcome).join(', ')}`,
        );
      }
    } catch (err: any) {
      this.logger.error(`Reconciliation cycle error: ${err?.message}`);
    } finally {
      this.running = false;
    }

    return results;
  }

  /**
   * Reconcile a single shipment.
   */
  async reconcileShipment(shipment: any): Promise<ReconciliationResult> {
    const shipmentId = shipment.id as string;
    const providerKey = shipment.shippingProviderKey || 'aramex';
    const provider = this.registry.findProvider(providerKey);

    if (!provider) {
      return { shipmentId, outcome: 'error', detail: `Provider '${providerKey}' not found` };
    }

    // Case A: Already complete
    if (shipment.carrierCreateStatus === 'SUCCESS' && shipment.carrierShipmentId) {
      return { shipmentId, outcome: 'already_complete' };
    }

    // Check circuit breaker
    const cbScope = CarrierCircuitBreaker.scopeKey(providerKey);
    if (!this.circuitBreaker.canRequest(cbScope)) {
      return { shipmentId, outcome: 'error', detail: `Circuit breaker open for ${providerKey}` };
    }

    // Try to look up the shipment via carrier tracking
    const trackingId = shipment.carrierTrackingId || shipment.carrierShipmentId;

    if (trackingId) {
      try {
        const trackingInfo = await provider.getTrackingInfo(trackingId);
        this.circuitBreaker.recordSuccess(cbScope);

        if (trackingInfo) {
          // Case B: Carrier has the shipment — recover
          await this.db.db
            .update(shipments)
            .set({
              carrierCreateStatus: 'SUCCESS' as any,
              carrierShipmentId: trackingInfo.carrierShipmentId || trackingId,
              carrierStatusRaw: trackingInfo.status || null,
              carrierStatusMapped: trackingInfo.status || null,
              recoveryStatus: 'RECOVERED',
              nextReconciliationAt: null,
              lastCarrierSyncAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(shipments.id, shipmentId));

          this.logger.log(
            `Reconciliation: shipment ${shipmentId} recovered via tracking ` +
            `(status: ${trackingInfo.status})`,
          );

          return { shipmentId, outcome: 'recovered', detail: trackingInfo.status };
        }
      } catch (err: any) {
        this.circuitBreaker.recordFailure(cbScope);
        this.logger.warn(
          `Reconciliation tracking lookup failed for ${shipmentId}: ${err?.message}`,
        );
        // Fall through to Case C/D
      }
    }

    // Case C: Carrier doesn't have it — can we safely retry?
    if (shipment.carrierCreateStatus === 'PENDING' || shipment.carrierCreateStatus === 'RECOVERY_REQUIRED') {
      // Check if it's safe to retry (idempotency key exists)
      if (shipment.idempotencyKey) {
        // Schedule a retry via outbox
        await this.scheduleRetry(shipment);

        return { shipmentId, outcome: 'retry_safe', detail: 'Retry scheduled via outbox' };
      }

      // Not safe to retry — defer
      await this.deferReconciliation(shipment);
      return { shipmentId, outcome: 'not_found_deferred', detail: 'No idempotency key, deferred' };
    }

    // Case D: IN_PROGRESS or unknown — route through recovery
    await this.deferReconciliation(shipment);
    return { shipmentId, outcome: 'routed_to_recovery', detail: 'Deferred for manual review' };
  }

  /**
   * Schedule a retry by creating an outbox event.
   */
  private async scheduleRetry(shipment: any): Promise<void> {
    const { randomUUID } = await import('node:crypto');
    const { outboxEvents } = await import('../audit/audit.schema');

    await this.db.db.insert(outboxEvents).values({
      id: randomUUID(),
      eventType: 'shipping.carrier.create',
      aggregateId: shipment.id,
      payload: { source: 'reconciliation', retryCount: (shipment.carrierCreateRetries || 0) + 1 },
      status: 'PENDING',
      organizationId: null, // resolved by worker from shipment
    });

    // Update shipment to indicate retry is scheduled
    await this.db.db
      .update(shipments)
      .set({
        recoveryStatus: 'RETRY_SCHEDULED',
        nextReconciliationAt: null,
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, shipment.id));
  }

  /**
   * Defer reconciliation to a later time.
   */
  private async deferReconciliation(shipment: any): Promise<void> {
    // Exponential backoff for reconciliation: 10min, 20min, 40min, 1h, 2h, 4h (max)
    const currentRetries = shipment.carrierCreateRetries || 0;
    const delayMs = Math.min(
      10 * 60 * 1000 * Math.pow(2, currentRetries),
      4 * 60 * 60 * 1000,
    );

    await this.db.db
      .update(shipments)
      .set({
        recoveryStatus: 'DEFERRED',
        nextReconciliationAt: new Date(Date.now() + delayMs),
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, shipment.id));
  }
}
