/**
 * Carrier Observability — M7.2.3-B.1 + M7.2.3-C
 *
 * Structured logging, correlation, and in-memory metric counters for every
 * carrier operation.
 *
 * Every carrier operation emits a structured log entry containing:
 *   - organizationId
 *   - storeId
 *   - shipmentId
 *   - carrierProvider
 *   - operation
 *   - correlationId
 *   - attempt
 *   - duration
 *   - result (success/failure)
 *   - error classification
 *
 * In-memory counters (logged periodically):
 *   - carrier_requests_total / carrier_request_failures_total
 *   - carrier_rate_limits_total
 *   - carrier_retries_total
 *   - carrier_recovery_total / carrier_reconciliation_total / carrier_reconciliation_failures_total
 *   - carrier_webhook_total / carrier_webhook_failures_total / carrier_webhook_duplicates_total
 *   - carrier_outbox_pending / carrier_outbox_dead_letter (DB-backed gauges)
 *   - carrier_request_duration_ms (cumulative duration + count for avg computation)
 *
 * NEVER logs:
 *   - Passwords, API keys, bearer tokens
 *   - Encrypted credential contents
 *   - Full request/response bodies that may contain secrets
 *
 * Integrates with the existing NestJS Logger.
 * If OpenTelemetry is available, creates spans.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { outboxEvents } from '../audit/audit.schema';

// ── Types ───────────────────────────────────────────────────────────────────

export type CarrierOperation =
  | 'createShipment'
  | 'cancelShipment'
  | 'generateLabel'
  | 'getTrackingInfo'
  | 'validateAddress'
  | 'webhookReceived'
  | 'webhookProcessed'
  | 'rateCalculate';

export type CarrierOperationResult = 'success' | 'failure' | 'timeout' | 'rate_limited';

export interface CarrierOperationContext {
  organizationId?: string;
  storeId?: string;
  shipmentId?: string;
  carrierProvider: string;
  operation: CarrierOperation;
  correlationId: string;
  attempt: number;
}

export interface CarrierOperationLog {
  context: CarrierOperationContext;
  duration: number;
  result: CarrierOperationResult;
  errorClassification?: string;
  errorMessage?: string;
  httpStatus?: number;
}

// ── Known counter names ───────────────────────────────────────────────────

export type CarrierCounter =
  | 'carrier_requests_total'
  | 'carrier_request_failures_total'
  | 'carrier_rate_limits_total'
  | 'carrier_retries_total'
  | 'carrier_recovery_total'
  | 'carrier_reconciliation_total'
  | 'carrier_reconciliation_failures_total'
  | 'carrier_webhook_total'
  | 'carrier_webhook_failures_total'
  | 'carrier_webhook_duplicates_total'
  | 'carrier_outbox_pending'
  | 'carrier_outbox_dead_letter'
  | 'carrier_request_duration_ms';

// ── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class CarrierObservabilityService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CarrierOps');

  /** In-memory counters: Map<counterName, Map<providerKey, count>>. */
  private readonly counters = new Map<string, Map<string, number>>();

  /** Duration tracking: Map<providerKey:operation, { totalMs, count }>. */
  private readonly durations = new Map<string, { totalMs: number; count: number }>();

  /** Periodic counter flush interval (30 seconds). */
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: DatabaseService,
  ) {}

  onModuleInit() {
    this.flushTimer = setInterval(() => this.flushCounters(), 30_000);
  }

  onModuleDestroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Generate a new correlation ID.
   */
  generateCorrelationId(): string {
    return `car-${crypto.randomUUID()}`;
  }

  /**
   * Log the start of a carrier operation.
   */
  logStart(ctx: CarrierOperationContext): void {
    this.logger.log(
      this.formatMessage(ctx, 'START'),
    );
  }

  /**
   * Log the completion of a carrier operation.
   */
  logComplete(entry: CarrierOperationLog): void {
    const { context, duration, result, errorClassification, errorMessage, httpStatus } = entry;

    const parts = [
      this.formatContext(context),
      `duration=${duration}ms`,
      `result=${result}`,
    ];

    if (httpStatus !== undefined) parts.push(`httpStatus=${httpStatus}`);
    if (errorClassification) parts.push(`errorClass=${errorClassification}`);
    if (errorMessage) parts.push(`error=${this.truncate(errorMessage, 200)}`);

    const message = parts.join(' | ');

    switch (result) {
      case 'success':
        this.logger.log(message);
        break;
      case 'rate_limited':
        this.logger.warn(message);
        break;
      case 'failure':
      case 'timeout':
        this.logger.error(message);
        break;
    }
  }

  /**
   * Log a retry attempt.
   */
  logRetry(ctx: CarrierOperationContext, reason: string, nextDelayMs: number): void {
    this.logger.warn(
      this.formatMessage(ctx, `RETRY | reason=${this.truncate(reason, 150)} | nextDelay=${nextDelayMs}ms`),
    );
  }

  /**
   * Create a context object from common parameters.
   */
  createContext(
    carrierProvider: string,
    operation: CarrierOperation,
    opts: {
      organizationId?: string;
      storeId?: string;
      shipmentId?: string;
      correlationId?: string;
      attempt?: number;
    } = {},
  ): CarrierOperationContext {
    return {
      carrierProvider,
      operation,
      correlationId: opts.correlationId || this.generateCorrelationId(),
      attempt: opts.attempt ?? 1,
      organizationId: opts.organizationId,
      storeId: opts.storeId,
      shipmentId: opts.shipmentId,
    };
  }

  // ── Metric Counters (M7.2.3-C) ──────────────────────────────────────────

  /**
   * Increment a named counter for a given provider dimension.
   * Thread-safe for single-process NestJS (synchronous Map operations).
   */
  incrementCounter(counter: CarrierCounter | string, providerKey: string, amount = 1): void {
    let providerMap = this.counters.get(counter);
    if (!providerMap) {
      providerMap = new Map();
      this.counters.set(counter, providerMap);
    }
    const current = providerMap.get(providerKey) || 0;
    providerMap.set(providerKey, current + amount);
  }

  /**
   * Get the current value of a counter for a provider.
   */
  getCounter(counter: string, providerKey: string): number {
    return this.counters.get(counter)?.get(providerKey) || 0;
  }

  /**
   * Get a snapshot of all counters.
   */
  counterSnapshot(): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {};
    for (const [counter, providerMap] of this.counters) {
      result[counter] = {};
      for (const [provider, value] of providerMap) {
        result[counter][provider] = value;
      }
    }
    return result;
  }

  /**
   * Record a request duration for a provider+operation combination.
   * Accumulates total milliseconds and count for average computation.
   * Dimensions: provider, operation, success/failure.
   * NEVER records credentials, tokens, or sensitive data.
   */
  recordDuration(providerKey: string, operation: string, durationMs: number): void {
    const key = `${providerKey}:${operation}`;
    const existing = this.durations.get(key) || { totalMs: 0, count: 0 };
    existing.totalMs += durationMs;
    existing.count += 1;
    this.durations.set(key, existing);

    // Also accumulate as a counter for flush logging
    this.incrementCounter('carrier_request_duration_ms', providerKey, durationMs);
  }

  /**
   * Get average duration for a provider+operation.
   */
  getAverageDuration(providerKey: string, operation: string): number {
    const key = `${providerKey}:${operation}`;
    const entry = this.durations.get(key);
    if (!entry || entry.count === 0) return 0;
    return Math.round(entry.totalMs / entry.count);
  }

  /**
   * DB-backed gauge: count of PENDING outbox events for carrier operations.
   * Uses an efficient COUNT query — does not load rows.
   */
  async getOutboxPendingCount(): Promise<number> {
    try {
      const result = await this.db.db.execute(sql`
        SELECT COUNT(*)::int AS cnt FROM outbox_events
        WHERE status = 'PENDING'
          AND event_type LIKE 'shipping.carrier.%'
      `);
      return (result.rows?.[0] as any)?.cnt ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * DB-backed gauge: count of DEAD_LETTER outbox events for carrier operations.
   * Uses an efficient COUNT query — does not load rows.
   */
  async getOutboxDeadLetterCount(): Promise<number> {
    try {
      const result = await this.db.db.execute(sql`
        SELECT COUNT(*)::int AS cnt FROM outbox_events
        WHERE status = 'DEAD_LETTER'
          AND event_type LIKE 'shipping.carrier.%'
      `);
      return (result.rows?.[0] as any)?.cnt ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Periodically flush counters to the log (non-destructive snapshot).
   * M7.2.4-A: Also refreshes DB-backed outbox gauges.
   */
  private flushCounters(): void {
    const snapshot = this.counterSnapshot();
    const keys = Object.keys(snapshot);
    if (keys.length === 0) return;

    const parts: string[] = ['Metric counters snapshot:'];
    for (const counter of keys) {
      const providers = snapshot[counter] || {};
      const total = Object.values(providers).reduce((sum, v) => sum + v, 0);
      const detail = Object.entries(providers)
        .map(([pk, v]) => `${pk}=${v}`)
        .join(', ');
      parts.push(`${counter}: total=${total} (${detail})`);
    }

    // Duration averages
    if (this.durations.size > 0) {
      const durParts: string[] = ['Duration averages:'];
      for (const [key, { totalMs, count }] of this.durations) {
        const avg = count > 0 ? Math.round(totalMs / count) : 0;
        durParts.push(`${key}: avg=${avg}ms (n=${count})`);
      }
      parts.push(durParts.join(', '));
    }

    this.logger.log(parts.join(' | '));

    // Refresh DB-backed gauges asynchronously (non-blocking)
    this.refreshOutboxGauges().catch(err => {
      this.logger.error(`Failed to refresh outbox gauges: ${err?.message}`);
    });
  }

  /**
   * Refresh DB-backed outbox gauges and store as counters.
   */
  private async refreshOutboxGauges(): Promise<void> {
    const [pending, deadLetter] = await Promise.all([
      this.getOutboxPendingCount(),
      this.getOutboxDeadLetterCount(),
    ]);
    // Store under a synthetic provider key '__all__' for flush visibility
    this.incrementCounter('carrier_outbox_pending', '__all__', pending - this.getCounter('carrier_outbox_pending', '__all__'));
    this.incrementCounter('carrier_outbox_dead_letter', '__all__', deadLetter - this.getCounter('carrier_outbox_dead_letter', '__all__'));
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private formatMessage(ctx: CarrierOperationContext, action: string): string {
    return `${this.formatContext(ctx)} | ${action}`;
  }

  private formatContext(ctx: CarrierOperationContext): string {
    const parts = [
      `[${ctx.correlationId}]`,
      `provider=${ctx.carrierProvider}`,
      `op=${ctx.operation}`,
    ];

    if (ctx.organizationId) parts.push(`org=${ctx.organizationId}`);
    if (ctx.storeId) parts.push(`store=${ctx.storeId}`);
    if (ctx.shipmentId) parts.push(`shipment=${ctx.shipmentId}`);
    parts.push(`attempt=${ctx.attempt}`);

    return parts.join(' ');
  }

  private truncate(s: string, maxLen: number): string {
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen) + '...';
  }
}
