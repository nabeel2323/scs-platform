/**
 * Carrier Reconciliation Service — M7.2.3-C + M7.3-B.3.3.3
 *
 * Scheduled service that reconciles uncertain carrier shipment states.
 *
 * Create reconciliation cases:
 *   A. SUCCESS + carrierShipmentId → nothing (already complete)
 *   B. PENDING + carrier has it   → recover carrierShipmentId → SUCCESS
 *   C. PENDING + carrier doesn't  → safe retry if provider allows
 *   D. RECOVERY_REQUIRED          → lookup, then route through B or C
 *
 * Cancel reconciliation cases (B.3.3.3):
 *   CA. SUCCEEDED               → already complete (no-op)
 *   CB. 24h boundary exceeded   → RECONCILIATION_REQUIRED
 *   CC. Budget exhausted        → RECONCILIATION_REQUIRED
 *   CD. Tracking confirms cancel → SUCCEEDED
 *   CE. Transport error         → UNKNOWN (within budget) or RECONCILIATION_REQUIRED
 *   CF. Ambiguous result        → UNKNOWN (within budget) or RECONCILIATION_REQUIRED
 *
 * Never blindly recreates shipments. Never blindly retries cancellations.
 * Bounded batch processing, tenant-aware, configurable cadence.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { eq, and, isNull, lte, or, sql, ne } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { ShippingProviderRegistry } from './shipping-registry';
import { shipments } from '../orders/shipment.schema';
import { CarrierObservabilityService } from './carrier-observability';
import { CarrierCircuitBreaker } from './carrier-circuit-breaker';
import { CarrierEmailResolver } from './carrier-email-resolver';
import { generateIdempotencyKey, CreateShipmentRequest, CancelPickupRequest } from './shipping.types';
import { classifyCarrierError } from './carrier-errors';

// ── Types ───────────────────────────────────────────────────────────────────

export type ReconciliationOutcome =
  | 'already_complete'              // Case A / CA
  | 'recovered'                     // Case B
  | 'retry_safe'                    // Case C (retry triggered)
  | 'not_found_deferred'            // Case C (not found, not safe to retry)
  | 'routed_to_recovery'            // Case D
  | 'cancel_succeeded'              // Case CD: tracking confirmed cancellation
  | 'cancel_budget_exhausted'       // Case CC: reconciliation attempts exhausted
  | 'cancel_boundary_exceeded'      // Case CB: 24h boundary exceeded
  | 'cancel_deferred'               // Case CE/CF: within budget, scheduled next
  | 'cancel_transport_error'        // Case CE: carrier query failed
  | 'cancel_ambiguous'              // Case CF: carrier response inconclusive
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

  /** B.3.3.3: Cancel reconciliation interval. */
  private readonly cancelIntervalMs: number;

  /** B.3.3.3: Separate timer for cancel reconciliation cycles. */
  private cancelTimer: ReturnType<typeof setInterval> | null = null;
  /** Maximum shipments to reconcile per cycle. */
  private static readonly BATCH_SIZE = 20;

  /** Claim lease timeout: 10 minutes. If a worker crashes, the claim expires after this. */
  private static readonly CLAIM_LEASE_MS = 10 * 60 * 1000;

  /** B.3.3.3: Maximum reconciliation attempts before escalation (BD-03). */
  private static readonly MAX_CANCEL_RECONCILIATION_ATTEMPTS = 8;

  /** B.3.3.3: Maximum time UNKNOWN may remain unresolved (BD-01). */
  private static readonly CANCEL_UNKNOWN_MAX_DURATION_MS = 24 * 60 * 60 * 1000;

  /** B.3.3.3: Cancel reconciliation interval (BD-02), default 10 minutes. */
  private static readonly CANCEL_RECONCILIATION_INTERVAL_MS = parseInt(
    process.env['CARRIER_CANCEL_RECONCILIATION_INTERVAL_MS'] || '600000',
    10,
  );

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
    this.cancelIntervalMs = CarrierReconciliationService.CANCEL_RECONCILIATION_INTERVAL_MS;
  }

  onModuleInit() {
    setTimeout(() => this.startCycle(), 20_000);
    setTimeout(() => this.startCancelCycle(), 25_000);
    this.logger.log('CarrierReconciliationService registered.');
  }

  onModuleDestroy() {
    this.stopCycle();
    this.stopCancelCycle();
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

  /** B.3.3.3: Start cancel reconciliation cycle on a separate timer. */
  private startCancelCycle() {
    this.cancelTimer = setInterval(() => this.reconcileCancel(), this.cancelIntervalMs);
  }

  private stopCancelCycle() {
    if (this.cancelTimer) {
      clearInterval(this.cancelTimer);
      this.cancelTimer = null;
    }
  }

  /**
   * Run a reconciliation cycle.
   * Can also be called directly (e.g., from admin recovery endpoint).
   *
   * M7.2.4-A: Atomic claim via UPDATE ... RETURNING.
   * Uses recoveryStatus = 'RECONCILING' as a claim marker and
   * nextReconciliationAt as a lease timeout. Two-phase:
   *   1. Short claim transaction (UPDATE ... RETURNING)
   *   2. Process each claimed shipment without holding a transaction
   *
   * Two reconciliation workers (even across separate processes) will never
   * process the same shipment as a normal candidate.
   */
  async reconcile(): Promise<ReconciliationResult[]> {
    if (this.running) return [];
    this.running = true;

    const results: ReconciliationResult[] = [];

    try {
      // M7.2.4-A: Atomic claim via UPDATE ... RETURNING.
      // Claims shipments that need reconciliation by setting recoveryStatus = 'RECONCILING'
      // and nextReconciliationAt to a future lease timestamp.
      // Other workers see recoveryStatus = 'RECONCILING' and skip those rows.
      const leaseExpiry = new Date(Date.now() + CarrierReconciliationService.CLAIM_LEASE_MS);

      const claimed = await this.db.db.execute(sql`
        UPDATE shipments
        SET recovery_status = 'RECONCILING',
            next_reconciliation_at = ${leaseExpiry},
            updated_at = NOW()
        WHERE id IN (
          SELECT id FROM shipments
          WHERE (
            carrier_create_status = 'RECOVERY_REQUIRED'
            OR (
              carrier_create_status IN ('PENDING', 'IN_PROGRESS')
              AND (next_reconciliation_at IS NULL OR next_reconciliation_at <= NOW())
            )
          )
          AND (recovery_status IS NULL
               OR recovery_status NOT IN ('RECONCILING', 'RECOVERED', 'ADMIN_TRIGGERED'))
          ORDER BY created_at
          LIMIT ${CarrierReconciliationService.BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `);

      const candidates = claimed.rows ?? [];
      this.logger.log(`Reconciliation cycle: ${candidates.length} candidates claimed.`);

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

    // B.3.3.3: Route cancel reconciliation if shipment has pending cancel state
    const cancelStatus = shipment.carrierCancelStatus as string | null;
    if (cancelStatus && ['UNKNOWN', 'RECONCILIATION_REQUIRED'].includes(cancelStatus)) {
      return this.reconcileCancelShipment(shipment);
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

  // ── B.3.3.3: Cancel Reconciliation ───────────────────────────────────────

  /**
   * Run a cancel-specific reconciliation cycle.
   * Claims shipments with carrier_cancel_status IN ('UNKNOWN', 'RECONCILIATION_REQUIRED')
   * that are due for reconciliation. Uses the same FOR UPDATE SKIP LOCKED pattern
   * as the create reconciliation path.
   */
  async reconcileCancel(): Promise<ReconciliationResult[]> {
    if (this.running) return [];
    this.running = true;

    const results: ReconciliationResult[] = [];

    try {
      const leaseExpiry = new Date(Date.now() + CarrierReconciliationService.CLAIM_LEASE_MS);

      const claimed = await this.db.db.execute(sql`
        UPDATE shipments
        SET recovery_status = 'RECONCILING',
            next_reconciliation_at = ${leaseExpiry},
            updated_at = NOW()
        WHERE id IN (
          SELECT id FROM shipments
          WHERE carrier_cancel_status IN ('UNKNOWN', 'RECONCILIATION_REQUIRED')
            AND (next_reconciliation_at IS NULL OR next_reconciliation_at <= NOW())
            AND (recovery_status IS NULL
                 OR recovery_status NOT IN ('RECONCILING', 'RECOVERED', 'ADMIN_TRIGGERED'))
          ORDER BY created_at
          LIMIT ${CarrierReconciliationService.BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `);

      const candidates = claimed.rows ?? [];
      this.logger.log(`Cancel reconciliation cycle: ${candidates.length} candidates claimed.`);

      for (const shipment of candidates) {
        const result = await this.reconcileCancelShipment(shipment);
        results.push(result);
      }

      if (results.length > 0) {
        this.logger.log(
          `Cancel reconciliation complete: ${results.map(r => `${r.shipmentId}:${r.outcome}`).join(', ')}`,
        );
      }
    } catch (err: any) {
      this.logger.error(`Cancel reconciliation cycle error: ${err?.message}`);
    } finally {
      this.running = false;
    }

    return results;
  }

  /**
   * Reconcile a single shipment's cancel state.
   *
   * B.3.3.3 cases:
   *   CA. Already SUCCEEDED → no-op
   *   CB. 24h boundary exceeded → RECONCILIATION_REQUIRED
   *   CC. Budget exhausted (8 attempts) → RECONCILIATION_REQUIRED
   *   CD. Tracking confirms cancellation → SUCCEEDED
   *   CE. Transport error during query → UNKNOWN (within budget) or RECONCILIATION_REQUIRED
   *   CF. Ambiguous result → UNKNOWN (within budget) or RECONCILIATION_REQUIRED
   */
  async reconcileCancelShipment(shipment: any): Promise<ReconciliationResult> {
    const shipmentId = shipment.id as string;
    const cancelStatus = shipment.carrier_cancel_status as string | null;

    // CA: Already terminal
    if (cancelStatus === 'SUCCEEDED' || cancelStatus === 'NOT_REQUIRED') {
      return { shipmentId, outcome: 'already_complete', detail: `Cancel ${cancelStatus}` };
    }

    // CB: 24-hour boundary check (BD-01)
    const attemptedAt = shipment.carrier_cancel_attempted_at
      ? new Date(shipment.carrier_cancel_attempted_at).getTime()
      : 0;
    const elapsed = Date.now() - attemptedAt;
    if (attemptedAt > 0 && elapsed > CarrierReconciliationService.CANCEL_UNKNOWN_MAX_DURATION_MS) {
      await this.escalateCancelReconciliation(shipment, '24h boundary exceeded');
      return { shipmentId, outcome: 'cancel_boundary_exceeded', detail: '24h boundary exceeded' };
    }

    // CC: Reconciliation budget check (BD-03)
    // carrier_cancel_retries was reset to 0 when UNKNOWN was set.
    // It now counts reconciliation attempts (not HTTP retries).
    const reconciliationAttempts = shipment.carrier_cancel_retries || 0;
    if (reconciliationAttempts >= CarrierReconciliationService.MAX_CANCEL_RECONCILIATION_ATTEMPTS) {
      await this.escalateCancelReconciliation(shipment, 'budget exhausted');
      return { shipmentId, outcome: 'cancel_budget_exhausted', detail: `${reconciliationAttempts} attempts` };
    }

    const providerKey = shipment.shipping_provider_key || 'aramex';
    const provider = this.registry.findProvider(providerKey);
    if (!provider) {
      return { shipmentId, outcome: 'error', detail: `Provider '${providerKey}' not found` };
    }

    // Check circuit breaker
    const cbScope = CarrierCircuitBreaker.scopeKey(providerKey);
    if (!this.circuitBreaker.canRequest(cbScope)) {
      await this.deferCancelReconciliation(shipment);
      return { shipmentId, outcome: 'cancel_deferred', detail: 'Circuit breaker open' };
    }

    // CD: Try tracking lookup for definitive cancellation evidence
    const trackingId = shipment.carrier_tracking_id;
    if (trackingId) {
      try {
        const trackingInfo = await provider.getTrackingInfo(trackingId);
        this.circuitBreaker.recordSuccess(cbScope);

        if (trackingInfo) {
          const status = (trackingInfo.status || '').toUpperCase();
          // Only verified cancellation statuses resolve to SUCCEEDED.
          // Without verified Aramex cancellation codes, this path is conservative.
          if (status === 'CANCELLED' || status === 'PICKUP_CANCELLED') {
            await this.resolveCancelSucceeded(shipment);
            return { shipmentId, outcome: 'cancel_succeeded', detail: `Tracking: ${status}` };
          }
          // Tracking returned a non-cancellation status — not definitive.
          // Fall through to attempt-based resolution.
        }
      } catch (err: any) {
        this.circuitBreaker.recordFailure(cbScope);
        // Transport error during reconciliation (BD-08/H)
        if (this.isTransportError(err)) {
          return this.handleCancelTransportError(shipment, reconciliationAttempts);
        }
        // Non-transport error (auth, validation, etc.) — defer
        await this.deferCancelReconciliation(shipment);
        return { shipmentId, outcome: 'cancel_transport_error', detail: err?.message?.slice(0, 200) };
      }
    }

    // No tracking ID or tracking was inconclusive.
    // Per Aramex safety boundary: cannot definitively resolve without verified evidence.
    // Increment reconciliation attempt counter and defer or escalate.
    const newAttempts = reconciliationAttempts + 1;
    if (newAttempts >= CarrierReconciliationService.MAX_CANCEL_RECONCILIATION_ATTEMPTS) {
      await this.escalateCancelReconciliation(shipment, 'budget exhausted after attempt');
      return { shipmentId, outcome: 'cancel_budget_exhausted', detail: `${newAttempts} attempts` };
    }

    await this.deferCancelReconciliation(shipment);
    return { shipmentId, outcome: 'cancel_deferred', detail: `Attempt ${newAttempts}, scheduled next` };
  }

  /**
   * Escalate to RECONCILIATION_REQUIRED (admin intervention needed).
   * BD-05/BD-12: After time or budget exhaustion.
   */
  private async escalateCancelReconciliation(shipment: any, reason: string): Promise<void> {
    await this.db.db
      .update(shipments)
      .set({
        carrierCancelStatus: 'RECONCILIATION_REQUIRED' as any,
        recoveryStatus: 'CANCEL_RECONCILE' as any,
        nextReconciliationAt: null,
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, shipment.id));

    this.logger.warn(
      `Cancel reconciliation escalated for shipment ${shipment.id}: ${reason}`,
    );
  }

  /**
   * Resolve cancel as SUCCEEDED (definitive carrier evidence).
   * BD-06: Only on unambiguous proof of cancellation.
   */
  private async resolveCancelSucceeded(shipment: any): Promise<void> {
    await this.db.db
      .update(shipments)
      .set({
        carrierCancelStatus: 'SUCCEEDED' as any,
        carrierCancelError: null,
        carrierCancelErrorClass: null,
        recoveryStatus: null,
        nextReconciliationAt: null,
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, shipment.id));

    this.logger.log(`Cancel reconciliation: shipment ${shipment.id} → SUCCEEDED`);
  }

  /**
   * Handle a transport error during cancel reconciliation (BD-08/H).
   * Do NOT mark FAILED. Count the attempt. Defer or escalate.
   */
  private async handleCancelTransportError(
    shipment: any,
    currentAttempts: number,
  ): Promise<ReconciliationResult> {
    const newAttempts = currentAttempts + 1;

    if (newAttempts >= CarrierReconciliationService.MAX_CANCEL_RECONCILIATION_ATTEMPTS) {
      await this.escalateCancelReconciliation(shipment, 'transport error + budget exhausted');
      return {
        shipmentId: shipment.id,
        outcome: 'cancel_budget_exhausted',
        detail: `Transport error, ${newAttempts} attempts`,
      };
    }

    await this.deferCancelReconciliation(shipment);
    return {
      shipmentId: shipment.id,
      outcome: 'cancel_transport_error',
      detail: `Transport error, attempt ${newAttempts}, deferred`,
    };
  }

  /**
   * Schedule next cancel reconciliation attempt.
   * Increments carrier_cancel_retries (reconciliation attempt counter).
   */
  private async deferCancelReconciliation(shipment: any): Promise<void> {
    const currentAttempts = shipment.carrier_cancel_retries || 0;
    const intervalMs = CarrierReconciliationService.CANCEL_RECONCILIATION_INTERVAL_MS;

    await this.db.db
      .update(shipments)
      .set({
        recoveryStatus: null,
        nextReconciliationAt: new Date(Date.now() + intervalMs),
        carrierCancelRetries: currentAttempts + 1,
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, shipment.id));
  }

  /**
   * Detect transport-level uncertainty errors.
   * Same detection as ShippingCarrierWorker.isTimeoutError().
   */
  private isTransportError(err: any): boolean {
    if (!err) return false;
    const msg = (err.message || '').toLowerCase();
    return (
      msg.includes('timeout') ||
      msg.includes('etimedout') ||
      msg.includes('econnreset') ||
      msg.includes('econnaborted') ||
      msg.includes('socket hang up') ||
      msg.includes('aborted')
    );
  }
}
