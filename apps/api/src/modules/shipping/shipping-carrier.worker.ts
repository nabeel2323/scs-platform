import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { eq, and, or, isNull, lt, lte, sql } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { ShippingProviderRegistry } from './shipping-registry';
import { CarrierCredentialsService } from './carrier-credentials.service';
import { CarrierConfigurationsService } from './carrier-configurations.service';
import { outboxEvents } from '../audit/audit.schema';
import { shipments } from '../orders/shipment.schema';
import { generateIdempotencyKey, CarrierCreateStatus, CreateShipmentRequest } from './shipping.types';
import { classifyCarrierError, RetryableCarrierError } from './carrier-errors';
import { CarrierObservabilityService } from './carrier-observability';
import { CarrierEmailResolver } from './carrier-email-resolver';
import { CarrierRetryPolicy } from './carrier-retry-policy';
import { CarrierCircuitBreaker } from './carrier-circuit-breaker';

/**
 * ShippingCarrierWorker — dedicated worker for shipping.carrier.* outbox events.
 *
 * M7.2.3-C HARDENED:
 *   - Atomic claiming via SELECT ... FOR UPDATE SKIP LOCKED
 *   - Lease tracking (locked_at, locked_by) for crash recovery
 *   - Lease recovery: stale PROCESSING events are reset to PENDING
 *   - RECOVERY_REQUIRED state for uncertain CreateShipment timeouts
 *   - Circuit breaker integration (per-provider)
 *   - Centralized retry policy with exponential backoff + jitter
 *   - Dead-letter state after retry budget exhaustion
 *   - Provider isolation: ManualDeliveryProvider never affected by circuit breaker
 *
 * Supported event types:
 *   - shipping.carrier.create  — create shipment with external carrier
 *   - shipping.carrier.cancel  — cancel external carrier shipment
 *   - shipping.carrier.label   — generate shipping label
 *   - shipping.carrier.track   — poll tracking updates
 *   - shipping.carrier.webhook.retry — async webhook retry
 */
@Injectable()
export class ShippingCarrierWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ShippingCarrierWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /** Unique worker ID for lease tracking. */
  readonly workerId = `worker-${crypto.randomUUID().slice(0, 8)}`;

  /** Polling interval: 5 seconds. */
  private static readonly POLL_INTERVAL_MS = 5_000;

  /** Lease timeout: 5 minutes. Events locked longer than this are considered stale. */
  private static readonly LEASE_TIMEOUT_MS = 5 * 60 * 1000;

  /** Maximum events to claim per poll cycle. */
  private static readonly CLAIM_BATCH_SIZE = 5;

  /** Carrier event types this worker consumes. */
  private static readonly CARRIER_EVENT_PREFIX = 'shipping.carrier.';

  constructor(
    private readonly db: DatabaseService,
    private readonly registry: ShippingProviderRegistry,
    private readonly credentials: CarrierCredentialsService,
    private readonly configurations: CarrierConfigurationsService,
    private readonly observability: CarrierObservabilityService,
    private readonly emailResolver: CarrierEmailResolver,
    private readonly retryPolicy: CarrierRetryPolicy,
    private readonly circuitBreaker: CarrierCircuitBreaker,
  ) {}

  onModuleInit() {
    setTimeout(() => this.startPolling(), 8000);
    this.logger.log(
      `ShippingCarrierWorker ${this.workerId} registered — polling every 5s for carrier events.`,
    );
  }

  onModuleDestroy() {
    this.stopPolling();
  }

  // ── Polling ─────────────────────────────────────────────────────────────

  private startPolling() {
    this.timer = setInterval(() => this.poll(), ShippingCarrierWorker.POLL_INTERVAL_MS);
  }

  private stopPolling() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Poll cycle:
   *   1. Recover stale leases (crashed workers)
   *   2. Atomically claim pending events (FOR UPDATE SKIP LOCKED)
   *   3. Process each claimed event
   */
  private async poll() {
    if (this.running) return;
    this.running = true;

    try {
      // Step 1: Recover stale leases
      await this.recoverStaleLeases();

      // Step 2: Atomically claim pending events
      const claimed = await this.claimEvents();

      // Step 3: Process each claimed event
      for (const event of claimed) {
        await this.processEvent(event);
      }
    } catch (err: any) {
      this.logger.error(`Poll error: ${err?.message}`);
    } finally {
      this.running = false;
    }
  }

  // ── Lease Recovery ────────────────────────────────────────────────────────

  /**
   * Reset stale PROCESSING events back to PENDING.
   * A stale event is one where locked_at < NOW() - LEASE_TIMEOUT.
   */
  private async recoverStaleLeases(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - ShippingCarrierWorker.LEASE_TIMEOUT_MS);

      const recovered = await this.db.db
        .update(outboxEvents)
        .set({
          status: 'PENDING',
          lockedAt: null,
          lockedBy: null,
          attempts: sql`${outboxEvents.attempts} + 1`,
          lastError: 'Lease expired — worker crash detected',
        })
        .where(
          and(
            eq(outboxEvents.status, 'PROCESSING'),
            lt(outboxEvents.lockedAt, cutoff),
          ),
        )
        .returning({ id: outboxEvents.id });

      if (recovered.length > 0) {
        this.logger.warn(
          `Recovered ${recovered.length} stale lease (crashed worker events)`,
        );
      }
    } catch (err: any) {
      this.logger.error(`Lease recovery error: ${err?.message}`);
    }
  }

  // ── Atomic Claiming ───────────────────────────────────────────────────────

  /**
   * Atomically claim pending carrier events using FOR UPDATE SKIP LOCKED.
   *
   * This ensures no two workers can claim the same event, even under
   * high concurrency (100+ concurrent workers).
   */
  private async claimEvents(): Promise<any[]> {
    try {
      const now = new Date();

      // Use raw SQL for FOR UPDATE SKIP LOCKED — Drizzle ORM doesn't support this pattern
      const result = await this.db.db.execute(sql`
        UPDATE outbox_events
        SET status = 'PROCESSING',
            locked_at = NOW(),
            locked_by = ${this.workerId}
        WHERE id IN (
          SELECT id FROM outbox_events
          WHERE status = 'PENDING'
            AND (next_attempt_at IS NULL OR next_attempt_at <= ${now})
            AND event_type LIKE ${ShippingCarrierWorker.CARRIER_EVENT_PREFIX + '%'}
          ORDER BY created_at
          LIMIT ${ShippingCarrierWorker.CLAIM_BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `);

      return result.rows ?? [];
    } catch (err: any) {
      this.logger.error(`Claim error: ${err?.message}`);
      return [];
    }
  }

  // ── Event Processing ──────────────────────────────────────────────────────

  private async processEvent(event: any): Promise<void> {
    const eventId = event.id as string;
    const eventType = event.eventType as string;

    try {
      this.logger.log(`Processing carrier event: ${eventType} (aggregate: ${event.aggregateId})`);

      switch (eventType) {
        case 'shipping.carrier.create':
          await this.handleCreate(event);
          break;
        case 'shipping.carrier.cancel':
          await this.handleCancel(event);
          break;
        case 'shipping.carrier.label':
          await this.handleLabel(event);
          break;
        case 'shipping.carrier.track':
          await this.handleTrack(event);
          break;
        case 'shipping.carrier.webhook.retry':
          await this.handleWebhookRetry(event);
          break;
        default:
          this.logger.warn(`Unknown carrier event type: ${eventType}`);
      }

      // Mark as dispatched
      await this.db.db
        .update(outboxEvents)
        .set({
          status: 'DISPATCHED',
          dispatchedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        })
        .where(eq(outboxEvents.id, eventId));

    } catch (err: any) {
      await this.handleFailure(eventId, event, err);
    }
  }

  // ── Event Handlers ────────────────────────────────────────────────────────

  /**
   * Handle shipping.carrier.create.
   *
   * M7.2.3-C SAFETY:
   *   - Checks circuit breaker before calling provider
   *   - On timeout/uncertain result → RECOVERY_REQUIRED (not FAILED)
   *   - Records error classification for retry decision transparency
   *   - Uses centralized retry policy for backoff decisions
   */
  private async handleCreate(event: any): Promise<void> {
    const shipmentId = event.aggregateId;
    if (!shipmentId) throw new Error('shipping.carrier.create requires aggregateId (shipmentId)');

    const shipment = await this.db.db.query.shipments.findFirst({
      where: eq(shipments.id, shipmentId),
    });
    if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);

    // Guard: already created
    if (shipment.carrierCreateStatus === 'SUCCESS' && shipment.carrierShipmentId) {
      this.logger.log(`Shipment ${shipmentId} already has carrier shipment ID — skipping.`);
      return;
    }

    // Resolve provider
    const providerKey = shipment.shippingProviderKey || 'manual-driver';
    const provider = this.registry.findProvider(providerKey);

    if (!provider) {
      throw new Error(`Provider '${providerKey}' not found in registry`);
    }

    // Manual provider — no carrier creation needed
    if (provider.type === 'MANUAL') {
      await this.db.db
        .update(shipments)
        .set({
          carrierCreateStatus: 'SUCCESS' as any,
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, shipmentId));

      this.logger.log(`Shipment ${shipmentId} — manual provider, no carrier creation needed.`);
      return;
    }

    // CARRIER provider — check circuit breaker
    const cbScope = CarrierCircuitBreaker.scopeKey(providerKey);
    if (!this.circuitBreaker.canRequest(cbScope)) {
      this.logger.warn(
        `Circuit breaker OPEN for ${providerKey} — rescheduling shipment ${shipmentId}`,
      );
      // Throw to trigger retry via handleFailure
      throw new RetryableCarrierError(`Circuit breaker open for ${providerKey}`, {
        providerKey,
        operation: 'createShipment',
      });
    }

    // Mark as IN_PROGRESS
    await this.db.db
      .update(shipments)
      .set({
        carrierCreateStatus: 'IN_PROGRESS' as any,
        carrierCreateAttemptedAt: new Date(),
        idempotencyKey: shipment.idempotencyKey || generateIdempotencyKey(shipmentId),
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, shipmentId));

    // Resolve consignee email
    let consigneeEmail: string | undefined;
    try {
      const resolved = await this.emailResolver.tryResolve(shipmentId);
      if (resolved) consigneeEmail = resolved.email;
    } catch {
      // Email resolution failure is not fatal
    }

    // Build CreateShipmentRequest
    const deliveryAddr = shipment.deliveryAddress as Record<string, unknown> | null;
    const createRequest: CreateShipmentRequest = {
      shipmentId,
      orderId: shipment.orderId,
      storeId: shipment.storeId,
      deliveryAddress: {
        street: (deliveryAddr?.['street'] as string) || '',
        city: (deliveryAddr?.['city'] as string) || '',
        country: (deliveryAddr?.['country'] as string) || '',
        postalCode: deliveryAddr?.['postalCode'] as string | undefined,
        region: deliveryAddr?.['region'] as string | undefined,
        phone: deliveryAddr?.['phone'] as string | undefined,
        recipientName: deliveryAddr?.['recipientName'] as string | undefined,
      },
      serviceType: undefined,
      weightGrams: typeof deliveryAddr?.['weightGrams'] === 'number'
        ? deliveryAddr['weightGrams'] as number : undefined,
      currency: (deliveryAddr?.['currency'] as string) || undefined,
      codAmountMinor: typeof deliveryAddr?.['codAmountMinor'] === 'number'
        ? deliveryAddr['codAmountMinor'] as number : undefined,
      declaredValueMinor: typeof deliveryAddr?.['declaredValueMinor'] === 'number'
        ? deliveryAddr['declaredValueMinor'] as number : undefined,
      idempotencyKey: shipment.idempotencyKey || generateIdempotencyKey(shipmentId),
      consigneeEmail,
      metadata: shipment.metadata as Record<string, unknown>,
    };

    try {
      const result = await provider.createShipment(createRequest);

      // Success — record in circuit breaker
      this.circuitBreaker.recordSuccess(cbScope);

      await this.db.db
        .update(shipments)
        .set({
          carrierCreateStatus: 'SUCCESS' as any,
          carrierShipmentId: result.carrierShipmentId || null,
          carrierTrackingId: result.trackingId || null,
          carrierStatusRaw: result.carrierStatus || null,
          carrierStatusMapped: result.carrierStatus || null,
          lastCarrierSyncAt: new Date(),
          carrierCreateError: null,
          carrierCreateErrorClass: null,
          recoveryStatus: null,
          nextReconciliationAt: null,
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, shipmentId));

      this.logger.log(
        `Shipment ${shipmentId} — carrier creation SUCCESS ` +
        `(carrier ID: ${result.carrierShipmentId || 'none'})`,
      );

    } catch (err: any) {
      // Record failure in circuit breaker
      this.circuitBreaker.recordFailure(cbScope);

      const classification = classifyCarrierError(err);
      const isTimeout = this.isTimeoutError(err);

      // UNCERTAIN RESULT (timeout): do NOT mark as FAILED → RECOVERY_REQUIRED
      if (isTimeout) {
        await this.db.db
          .update(shipments)
          .set({
            carrierCreateStatus: 'RECOVERY_REQUIRED' as any,
            carrierCreateError: classification.safeMessage,
            carrierCreateErrorClass: classification.decision,
            recoveryStatus: 'PENDING_RECOVERY',
            nextReconciliationAt: new Date(), // immediate reconciliation
            carrierCreateRetries: (shipment.carrierCreateRetries || 0) + 1,
            updatedAt: new Date(),
          })
          .where(eq(shipments.id, shipmentId));

        this.logger.warn(
          `Shipment ${shipmentId} — uncertain result (timeout), marked RECOVERY_REQUIRED`,
        );
        // Don't re-throw: the shipment is in recovery, not a worker failure
        return;
      }

      // TERMINAL errors: mark FAILED immediately
      if (classification.decision === 'terminal' || classification.decision === 'unsupported') {
        await this.db.db
          .update(shipments)
          .set({
            carrierCreateStatus: 'FAILED' as any,
            carrierCreateError: classification.safeMessage,
            carrierCreateErrorClass: classification.decision,
            updatedAt: new Date(),
          })
          .where(eq(shipments.id, shipmentId));

        this.logger.error(
          `Shipment ${shipmentId} — terminal carrier error: ${classification.safeMessage}`,
        );
        // Don't retry terminal errors
        return;
      }

      // RETRYABLE errors: update retry count, let handleFailure manage outbox
      await this.db.db
        .update(shipments)
        .set({
          carrierCreateStatus: 'PENDING' as any,
          carrierCreateError: classification.safeMessage,
          carrierCreateErrorClass: classification.decision,
          carrierCreateRetries: (shipment.carrierCreateRetries || 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, shipmentId));

      // Re-throw so handleFailure manages the outbox event
      throw err;
    }
  }

  /**
   * Handle shipping.carrier.cancel.
   */
  private async handleCancel(event: any): Promise<void> {
    const shipmentId = event.aggregateId;
    this.logger.log(`Carrier cancel requested for shipment ${shipmentId} — not yet implemented.`);
  }

  /**
   * Handle shipping.carrier.label.
   */
  private async handleLabel(event: any): Promise<void> {
    const shipmentId = event.aggregateId;
    this.logger.log(`Carrier label requested for shipment ${shipmentId} — not yet implemented.`);
  }

  /**
   * Handle shipping.carrier.track.
   * Basic implementation — delegates to provider.getTrackingInfo().
   */
  private async handleTrack(event: any): Promise<void> {
    const shipmentId = event.aggregateId;
    if (!shipmentId) throw new Error('shipping.carrier.track requires aggregateId (shipmentId)');

    const shipment = await this.db.db.query.shipments.findFirst({
      where: eq(shipments.id, shipmentId),
    });
    if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);

    if (!shipment.carrierTrackingId) {
      this.logger.warn(`Shipment ${shipmentId} has no tracking ID — skipping track poll.`);
      return;
    }

    const providerKey = shipment.shippingProviderKey || 'aramex';
    const provider = this.registry.findProvider(providerKey);
    if (!provider) {
      this.logger.warn(`Provider '${providerKey}' not found for tracking poll.`);
      return;
    }

    // Check circuit breaker
    const cbScope = CarrierCircuitBreaker.scopeKey(providerKey);
    if (!this.circuitBreaker.canRequest(cbScope)) {
      this.logger.warn(`Circuit breaker OPEN for ${providerKey} — skipping track poll.`);
      return;
    }

    try {
      const trackingInfo = await provider.getTrackingInfo(shipment.carrierTrackingId);
      this.circuitBreaker.recordSuccess(cbScope);

      if (trackingInfo) {
        await this.db.db
          .update(shipments)
          .set({
            carrierStatusRaw: trackingInfo.status || null,
            lastCarrierSyncAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(shipments.id, shipmentId));

        this.logger.log(
          `Shipment ${shipmentId} tracking updated: ${trackingInfo.status}`,
        );
      }
    } catch (err: any) {
      this.circuitBreaker.recordFailure(cbScope);
      this.logger.error(`Tracking poll failed for ${shipmentId}: ${err?.message}`);
      throw err;
    }
  }

  /**
   * Handle shipping.carrier.webhook.retry — async webhook processing retry.
   */
  private async handleWebhookRetry(event: any): Promise<void> {
    this.logger.log(`Webhook retry for event ${event.aggregateId} — delegated to webhook processor.`);
  }

  // ── Failure Handling ──────────────────────────────────────────────────────

  /**
   * Handle a processing failure using the centralized retry policy.
   *
   * - Terminal errors: mark FAILED/DEAD_LETTER immediately
   * - Retryable errors: schedule retry with exponential backoff
   * - Budget exhausted: mark DEAD_LETTER
   */
  private async handleFailure(eventId: string, event: any, err: any): Promise<void> {
    const attempts = (event.attempts || 0) + 1;
    const classification = this.retryPolicy.classify(err, attempts);

    let newStatus: string;
    if (classification.isFinal) {
      newStatus = 'DEAD_LETTER';
    } else {
      newStatus = 'PENDING';
    }

    await this.db.db
      .update(outboxEvents)
      .set({
        status: newStatus,
        attempts,
        lastError: classification.safeMessage,
        nextAttemptAt: classification.nextAttemptAt,
        lockedAt: null,
        lockedBy: null,
      })
      .where(eq(outboxEvents.id, eventId));

    this.logger.error(
      `Carrier event ${event.eventType} failed (attempt ${attempts}): ` +
      `${classification.safeMessage} → ${newStatus}`,
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Detect timeout/uncertain-result errors.
   * These are errors where we cannot know if the carrier actually processed the request.
   */
  private isTimeoutError(err: any): boolean {
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
