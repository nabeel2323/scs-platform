/**
 * P13 Phase 3.1 — Monthly Reconciliation Service (hardened)
 *
 * Implements a repeatable monthly reconciliation process that:
 * - Compares approved return/refund obligations against actual outcomes
 * - Verifies commission and commission reversal consistency
 * - Checks settlement adjustment approval completeness
 * - Validates delivery-fee refund caps
 * - Detects duplicate, missing, excessive or mismatched entries
 * - Records discrepancies with stable source references
 *
 * Key invariants (Phase 3.1 hardened):
 * - Versioned runs: each rerun creates a NEW run with incremented version
 * - Previous runs and their discrepancies are NEVER deleted
 * - Concurrent runs are serialized per tenant/period/currency and protected by a tenant-scoped unique index
 * - Tenant-scoped: all queries filtered by orgId
 * - Never alters finalized financial records
 * - Deterministic output for the same period, currency and version
 */
import { Injectable, Logger, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { reconciliationRuns, reconciliationDiscrepancies, settlementAdjustments, settlementAdjustmentApprovals, commissionReversals } from './financial.schema';
import { returnRequests, returnRequestItems } from './returns.schema';
import { refunds, settlementRecords } from '../payments/payments.schema';
import { orders, orderFinancialBreakdown } from '../orders/orders.schema';
import { stores } from '../merchant/merchant.schema';
import { roundProportionalMinorUnits } from './returns-financials';
import { eq, and, sql, gte, lte, inArray, isNull } from 'drizzle-orm';
import crypto from 'node:crypto';

/** Discrepancy types produced by the reconciliation. */
export type DiscrepancyType =
  | 'MISSING_REFUND'
  | 'EXCESSIVE_REFUND'
  | 'DUPLICATE_REFUND'
  | 'MISSING_COMMISSION_REVERSAL'
  | 'EXCESSIVE_REVERSAL'
  | 'DUPLICATE_REVERSAL'
  | 'SETTLEMENT_MISMATCH'
  | 'UNAPPROVED_ADJUSTMENT'
  | 'DELIVERY_FEE_OVER_REFUND'
  | 'REFUND_STATUS_MISMATCH'
  | 'INCOMPLETE_SOURCE_DATA';

export interface ReconciliationResult {
  runId: string;
  version: number;
  periodStart: string;
  periodEnd: string;
  currency: string;
  status: string;
  discrepancyCount: number;
  summary: Record<string, number>;
}

export interface ReconciliationDiscrepancyDraft {
  type: DiscrepancyType;
  sourceRef: string;
  expected?: number;
  actual?: number;
  delta?: number;
  description: string;
}

/**
 * Recalculate a settlement row using its ledger semantics. Primary settlements
 * debit commission, while ADJUSTMENT rows can contain a positive commission
 * reversal credit. Minor-unit arithmetic stays exact and refuses unsafe inputs.
 */
export function calculateExpectedSettlementNetMinor(
  status: string,
  grossMinor: number,
  refundMinor: number,
  commissionMinor: number,
  feeMinor: number,
): number | null {
  const amounts = [grossMinor, refundMinor, commissionMinor, feeMinor];
  if (amounts.some(amount => !Number.isSafeInteger(amount))) {
    return null;
  }

  const commission = BigInt(commissionMinor);
  const expected =
    BigInt(grossMinor) -
    BigInt(refundMinor) +
    (status === 'ADJUSTMENT' ? commission : -commission) -
    BigInt(feeMinor);
  const result = Number(expected);
  return Number.isSafeInteger(result) ? result : null;
}

/** Sum non-negative minor-unit amounts without Number precision loss. */
export function sumSafeMinorUnitAmounts(amounts: number[]): bigint | null {
  if (amounts.some(amount => !Number.isSafeInteger(amount) || amount < 0)) {
    return null;
  }
  return amounts.reduce((total, amount) => total + BigInt(amount), 0n);
}

/**
 * Match the return workflow's half-up tax allocation when calculating the
 * maximum refundable delivery fee. Returns null for unsafe source data.
 */
export function calculateDeliveryFeeRefundCapMinor(
  deliveryFeeMinor: number,
  taxMinor: number,
  netGoodsMinor: number,
): number | null {
  if (
    !Number.isSafeInteger(deliveryFeeMinor) || deliveryFeeMinor < 0 ||
    !Number.isSafeInteger(taxMinor) || taxMinor < 0 ||
    !Number.isSafeInteger(netGoodsMinor)
  ) {
    return null;
  }

  const deliveryTaxMinor = netGoodsMinor > 0
    ? roundProportionalMinorUnits(BigInt(deliveryFeeMinor), taxMinor, netGoodsMinor)
    : 0;
  const cap = deliveryFeeMinor + deliveryTaxMinor;
  return Number.isSafeInteger(cap) ? cap : null;
}

/** Status mismatches are descriptive evidence, not monetary minor-unit values. */
export function buildRefundStatusMismatchDiscrepancy(
  returnId: string,
  refundId: string,
  refundStatus: string,
): ReconciliationDiscrepancyDraft {
  return {
    type: 'REFUND_STATUS_MISMATCH',
    sourceRef: `return:${returnId}:refund:${refundId}`,
    description: `Return ${returnId} is REFUNDED but linked refund ${refundId} has status ${refundStatus}; expected SUCCEEDED`,
  };
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Execute a reconciliation for the specified period and currency.
   *
   * Phase 3.1: Each execution creates a NEW versioned run. Previous runs
   * are never modified or deleted. The new run's discrepancies are independent
   * of prior runs, preserving full audit history.
   */
  async executeReconciliation(
    periodStart: string,
    periodEnd: string,
    currency: string,
    executedBy: string,
    orgId?: string | null,
  ): Promise<ReconciliationResult> {
    if (!periodStart || !periodEnd) {
      throw new BadRequestException('Period start and end are required');
    }
    if (periodStart > periodEnd) {
      throw new BadRequestException('Period start must be before period end');
    }

    const startDate = new Date(periodStart + 'T00:00:00.000Z');
    const endDate = new Date(periodEnd + 'T23:59:59.999Z');
    const tenantId = orgId ?? null;
    const lockKey = `reconciliation:${tenantId ?? 'global'}:${periodStart}:${periodEnd}:${currency}`;
    let failedRunId: string | null = null;

    try {
      const result = await this.db.db.transaction(async (tx) => {
        const txDb = tx as any;
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

        const latestRun = await txDb.query.reconciliationRuns.findFirst({
          where: and(
            eq(reconciliationRuns.periodStart, periodStart),
            eq(reconciliationRuns.periodEnd, periodEnd),
            eq(reconciliationRuns.currency, currency),
            tenantId ? eq(reconciliationRuns.orgId, tenantId) : isNull(reconciliationRuns.orgId),
          ),
          orderBy: [sql`${reconciliationRuns.version} DESC`],
        });
        const nextVersion = (latestRun?.version ?? 0) + 1;
        const runId = crypto.randomUUID();
        failedRunId = runId;

        await txDb.insert(reconciliationRuns).values({
          id: runId, periodStart, periodEnd, currency, version: nextVersion,
          status: 'RUNNING', summary: {}, discrepancyCount: 0, executedBy, orgId: tenantId,
        });

        // The predecessor points forward to the new run through superseded_by.
        if (latestRun) {
          const linked = await txDb.update(reconciliationRuns)
            .set({ supersededBy: runId })
            .where(and(eq(reconciliationRuns.id, latestRun.id), isNull(reconciliationRuns.supersededBy)))
            .returning({ id: reconciliationRuns.id });
          if (linked.length !== 1) {
            throw new ConflictException('Latest reconciliation run already has a successor; retry the reconciliation');
          }
        }

        const discrepancies: ReconciliationDiscrepancyDraft[] = [];
        await this.checkMissingRefunds(txDb, startDate, endDate, tenantId, discrepancies);
        await this.checkCommissionReversals(txDb, startDate, endDate, currency, tenantId, discrepancies);
        await this.checkSettlementConsistency(txDb, startDate, endDate, currency, tenantId, discrepancies);
        await this.checkAdjustmentApprovals(txDb, startDate, endDate, tenantId, discrepancies);
        await this.checkDeliveryFeeCaps(txDb, startDate, endDate, tenantId, discrepancies);
        await this.checkDuplicates(txDb, startDate, endDate, tenantId, discrepancies);

        const summary: Record<string, number> = {};
        for (const discrepancy of discrepancies) {
          summary[discrepancy.type] = (summary[discrepancy.type] ?? 0) + 1;
          await txDb.insert(reconciliationDiscrepancies).values({
            id: crypto.randomUUID(), runId, discrepancyType: discrepancy.type,
            sourceRef: discrepancy.sourceRef, expectedMinor: discrepancy.expected ?? null,
            actualMinor: discrepancy.actual ?? null, deltaMinor: discrepancy.delta ?? null,
            description: discrepancy.description, orgId: tenantId,
          });
        }

        await txDb.update(reconciliationRuns).set({
          status: 'COMPLETED', summary, discrepancyCount: discrepancies.length, completedAt: new Date(),
        }).where(eq(reconciliationRuns.id, runId));

        return { runId, version: nextVersion, periodStart, periodEnd, currency,
          status: 'COMPLETED', discrepancyCount: discrepancies.length, summary };
      });

      this.logger.log(
        `Reconciliation ${result.runId} v${result.version} completed: ${periodStart} to ${periodEnd} ` +
        `(${currency}) — ${result.discrepancyCount} discrepancies found`,
      );
      return result;
    } catch (error) {
      // The execution transaction has rolled back, so no partial discrepancy rows remain.
      // Persist a separate FAILED run for audit history when the database is available.
      if (failedRunId) {
        try {
          await this.db.db.transaction(async (tx) => {
            const txDb = tx as any;
            await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
            const latestRun = await txDb.query.reconciliationRuns.findFirst({
              where: and(
                eq(reconciliationRuns.periodStart, periodStart),
                eq(reconciliationRuns.periodEnd, periodEnd),
                eq(reconciliationRuns.currency, currency),
                tenantId ? eq(reconciliationRuns.orgId, tenantId) : isNull(reconciliationRuns.orgId),
              ),
              orderBy: [sql`${reconciliationRuns.version} DESC`],
            });
            const failedVersion = (latestRun?.version ?? 0) + 1;
            await txDb.insert(reconciliationRuns).values({
              id: failedRunId, periodStart, periodEnd, currency, version: failedVersion,
              status: 'FAILED', summary: { executionError: 1 }, discrepancyCount: 0,
              executedBy, orgId: tenantId, completedAt: new Date(),
            });
            if (latestRun) {
              const linked = await txDb.update(reconciliationRuns)
                .set({ supersededBy: failedRunId })
                .where(and(eq(reconciliationRuns.id, latestRun.id), isNull(reconciliationRuns.supersededBy)))
                .returning({ id: reconciliationRuns.id });
              if (linked.length !== 1) {
                throw new ConflictException('Latest reconciliation run already has a successor');
              }
            }
          });
        } catch (recordError) {
          this.logger.error(`Unable to persist failed reconciliation run ${failedRunId}: ${recordError instanceof Error ? recordError.message : 'unknown error'}`);
        }
      }
      throw error;
    }
  }
  // ═══════════════════════════════════════════════════════════════
  // CHECK IMPLEMENTATIONS (all tenant-scoped via orgId)
  // ═══════════════════════════════════════════════════════════════

  /** Check for returns that reached REFUNDED status but have no SUCCEEDED refund. */
  private async checkMissingRefunds(
    db: any,
    startDate: Date, endDate: Date,
    orgId: string | null | undefined,
    discrepancies: ReconciliationDiscrepancyDraft[],
  ) {
    // Build org-scoped query: return → sub-order → store → org
    const refundedReturns = await db
      .select({
        id: returnRequests.id,
        requestedRefundMinor: returnRequests.requestedRefundMinor,
        actualRefundMinor: returnRequests.actualRefundMinor,
        refundId: returnRequests.refundId,
      })
      .from(returnRequests)
      .innerJoin(orders, eq(returnRequests.subOrderId, orders.id))
      .innerJoin(stores, eq(orders.storeId, stores.id))
      .where(and(
        eq(returnRequests.status, 'REFUNDED'),
        gte(returnRequests.createdAt, startDate),
        lte(returnRequests.createdAt, endDate),
        orgId ? eq(stores.orgId, orgId) : undefined,
      ));

    for (const ret of refundedReturns) {
      if (!ret.refundId) {
        discrepancies.push({
          type: 'MISSING_REFUND' as DiscrepancyType,
          sourceRef: `return:${ret.id}`,
          expected: Number(ret.requestedRefundMinor),
          actual: 0,
          delta: Number(ret.requestedRefundMinor),
          description: `Return ${ret.id} is REFUNDED but has no linked refund record`,
        });
        continue;
      }

      const refund = await db.query.refunds.findFirst({
        where: eq(refunds.id, ret.refundId),
      });
      if (!refund) {
        discrepancies.push({
          type: 'INCOMPLETE_SOURCE_DATA' as DiscrepancyType,
          sourceRef: `return:${ret.id}:refund:${ret.refundId}`,
          description: `Return ${ret.id} references refund ${ret.refundId} which does not exist`,
        });
      } else if (refund.status !== 'SUCCEEDED') {
        discrepancies.push(
          buildRefundStatusMismatchDiscrepancy(ret.id, refund.id, refund.status),
        );
      }
    }
  }

  /** Check commission reversal consistency for eligible returns. */
  private async checkCommissionReversals(
    db: any,
    startDate: Date, endDate: Date, currency: string,
    orgId: string | null | undefined,
    discrepancies: ReconciliationDiscrepancyDraft[],
  ) {
    const REVERSAL_CATEGORIES = ['MERCHANT', 'PLATFORM', 'CARRIER_DAMAGE'];

    const eligibleReturns = await db
      .select({
        id: returnRequests.id,
        subOrderId: returnRequests.subOrderId,
        responsibilityCategory: returnRequests.responsibilityCategory,
        status: returnRequests.status,
      })
      .from(returnRequests)
      .innerJoin(orders, eq(returnRequests.subOrderId, orders.id))
      .innerJoin(stores, eq(orders.storeId, stores.id))
      .where(and(
        eq(returnRequests.status, 'REFUNDED'),
        gte(returnRequests.createdAt, startDate),
        lte(returnRequests.createdAt, endDate),
        orgId ? eq(stores.orgId, orgId) : undefined,
      ));

    for (const ret of eligibleReturns) {
      if (!ret.responsibilityCategory || !REVERSAL_CATEGORIES.includes(ret.responsibilityCategory)) {
        continue;
      }

      const reversals = await db.query.commissionReversals.findMany({
        where: eq(commissionReversals.returnRequestId, ret.id),
      });

      if (reversals.length === 0) {
        discrepancies.push({
          type: 'MISSING_COMMISSION_REVERSAL' as DiscrepancyType,
          sourceRef: `return:${ret.id}`,
          description: `Return ${ret.id} has ${ret.responsibilityCategory} responsibility but no commission reversal`,
        });
        continue;
      }

      if (reversals.length > 1) {
        discrepancies.push({
          type: 'DUPLICATE_REVERSAL' as DiscrepancyType,
          sourceRef: `return:${ret.id}`,
          actual: reversals.length,
          description: `Return ${ret.id} has ${reversals.length} commission reversals (expected 1)`,
        });
      }

      const breakdown = await db.query.orderFinancialBreakdown.findFirst({
        where: eq(orderFinancialBreakdown.orderId, ret.subOrderId),
      });
      if (breakdown) {
        const originalCommissionMinor = Number(breakdown.commissionMinor);
        const totalReversed = sumSafeMinorUnitAmounts(
          reversals.map(reversal => Number(reversal.reversalMinor)),
        );

        if (
          !Number.isSafeInteger(originalCommissionMinor) ||
          originalCommissionMinor < 0 ||
          totalReversed === null
        ) {
          discrepancies.push({
            type: 'INCOMPLETE_SOURCE_DATA',
            sourceRef: `return:${ret.id}`,
            description: `Return ${ret.id} commission reversal totals contain an unsafe minor-unit value; exact comparison is unavailable`,
          });
          continue;
        }

        const originalCommission = BigInt(originalCommissionMinor);
        if (totalReversed > originalCommission) {
          const delta = totalReversed - originalCommission;
          const totalReversedNumber = Number(totalReversed);
          const deltaNumber = Number(delta);
          discrepancies.push({
            type: 'EXCESSIVE_REVERSAL',
            sourceRef: `return:${ret.id}`,
            expected: originalCommissionMinor,
            ...(Number.isSafeInteger(totalReversedNumber) ? { actual: totalReversedNumber } : {}),
            ...(Number.isSafeInteger(deltaNumber) ? { delta: deltaNumber } : {}),
            description: `Return ${ret.id} reversal ${totalReversed.toString()} exceeds original commission ${originalCommissionMinor}`,
          });
        }
      }
    }
  }

  /** Check settlement net = gross - refund - commission - fee. */
  private async checkSettlementConsistency(
    db: any,
    startDate: Date, endDate: Date, currency: string,
    orgId: string | null | undefined,
    discrepancies: ReconciliationDiscrepancyDraft[],
  ) {
    // Settlement records are scoped by merchantStoreId → store → org
    // For simplicity, we query all settlements in the period with matching currency
    // and filter by org through the store relationship
    const settlements = await db
      .select({
        id: settlementRecords.id,
        status: settlementRecords.status,
        grossMinor: settlementRecords.grossMinor,
        refundMinor: settlementRecords.refundMinor,
        commissionMinor: settlementRecords.commissionMinor,
        feeMinor: settlementRecords.feeMinor,
        netMinor: settlementRecords.netMinor,
        currency: settlementRecords.currency,
        merchantStoreId: settlementRecords.merchantStoreId,
      })
      .from(settlementRecords)
      .innerJoin(stores, eq(settlementRecords.merchantStoreId, stores.id))
      .where(and(
        eq(settlementRecords.currency, currency),
        gte(settlementRecords.calculatedAt, startDate),
        lte(settlementRecords.calculatedAt, endDate),
        orgId ? eq(stores.orgId, orgId) : undefined,
      ));

    for (const s of settlements) {
      const expectedNet = calculateExpectedSettlementNetMinor(
        s.status,
        Number(s.grossMinor),
        Number(s.refundMinor),
        Number(s.commissionMinor),
        Number(s.feeMinor),
      );
      const actualNet = Number(s.netMinor);

      if (expectedNet === null || !Number.isSafeInteger(actualNet)) {
        discrepancies.push({
          type: 'INCOMPLETE_SOURCE_DATA',
          sourceRef: `settlement:${s.id}`,
          description: `Settlement ${s.id} contains a minor-unit value outside the safe integer range; exact reconciliation is unavailable`,
        });
        continue;
      }

      if (expectedNet !== actualNet) {
        const delta = Number(BigInt(actualNet) - BigInt(expectedNet));
        discrepancies.push({
          type: 'SETTLEMENT_MISMATCH',
          sourceRef: `settlement:${s.id}`,
          expected: expectedNet,
          actual: actualNet,
          ...(Number.isSafeInteger(delta) ? { delta } : {}),
          description: `Settlement ${s.id} net ${actualNet} != ledger formula result ${expectedNet}`,
        });
      }
    }
  }

  /** Check that POSTED adjustments have required approvals. */
  private async checkAdjustmentApprovals(
    db: any,
    startDate: Date, endDate: Date,
    orgId: string | null | undefined,
    discrepancies: ReconciliationDiscrepancyDraft[],
  ) {
    const conditions: any[] = [
      eq(settlementAdjustments.status, 'POSTED'),
      gte(settlementAdjustments.createdAt, startDate),
      lte(settlementAdjustments.createdAt, endDate),
    ];
    if (orgId) conditions.push(eq(settlementAdjustments.orgId, orgId));

    const postedAdjustments = await db
      .select()
      .from(settlementAdjustments)
      .where(and(...conditions));

    for (const adj of postedAdjustments) {
      const approvals = await db.query.settlementAdjustmentApprovals.findMany({
        where: eq(settlementAdjustmentApprovals.adjustmentId, adj.id),
      });

      if (adj.requiresDualApproval) {
        const financeApprovals = approvals.filter(a => a.approverRole === 'FINANCE');
        const adminApprovals = approvals.filter(a => a.approverRole === 'ADMIN');
        if (financeApprovals.length < 1 || adminApprovals.length < 1) {
          discrepancies.push({
            type: 'UNAPPROVED_ADJUSTMENT' as DiscrepancyType,
            sourceRef: `adjustment:${adj.id}`,
            description: `Adjustment ${adj.id} is POSTED but lacks required dual approval ` +
              `(finance=${financeApprovals.length}, admin=${adminApprovals.length})`,
          });
        }
      } else {
        if (approvals.length < 1) {
          discrepancies.push({
            type: 'UNAPPROVED_ADJUSTMENT' as DiscrepancyType,
            sourceRef: `adjustment:${adj.id}`,
            description: `Adjustment ${adj.id} is POSTED without any approval`,
          });
        }
      }
    }
  }

  /** Check delivery-fee refund caps. */
  private async checkDeliveryFeeCaps(
    db: any,
    startDate: Date, endDate: Date,
    orgId: string | null | undefined,
    discrepancies: ReconciliationDiscrepancyDraft[],
  ) {
    const conditions: any[] = [
      inArray(
        settlementAdjustments.adjustmentType,
        ['DELIVERY_FEE_EXCEPTION', 'DELIVERY_FEE_REFUND'],
      ),
      gte(settlementAdjustments.createdAt, startDate),
      lte(settlementAdjustments.createdAt, endDate),
    ];
    if (orgId) conditions.push(eq(settlementAdjustments.orgId, orgId));

    const adjustments = await db
      .select()
      .from(settlementAdjustments)
      .where(and(...conditions));

    for (const adj of adjustments) {
      const breakdown = await db.query.orderFinancialBreakdown.findFirst({
        where: eq(orderFinancialBreakdown.orderId, adj.subOrderId),
      });
      if (breakdown) {
        const productsMinor = Number(breakdown.productsMinor);
        const discountMinor = Number(breakdown.discountMinor);
        const deliveryFeeMinor = Number(breakdown.deliveryFeeMinor);
        const taxMinor = Number(breakdown.taxMinor);
        const amountMinor = Number(adj.amountMinor);
        const netGoodsMinor = productsMinor - discountMinor;

        const maxRefundable = (
          Number.isSafeInteger(productsMinor) &&
          Number.isSafeInteger(discountMinor) &&
          productsMinor >= 0 &&
          discountMinor >= 0 &&
          discountMinor <= productsMinor
        )
          ? calculateDeliveryFeeRefundCapMinor(deliveryFeeMinor, taxMinor, netGoodsMinor)
          : null;

        if (maxRefundable === null || !Number.isSafeInteger(amountMinor) || amountMinor < 0) {
          discrepancies.push({
            type: 'INCOMPLETE_SOURCE_DATA',
            sourceRef: `adjustment:${adj.id}`,
            description: `Delivery-fee adjustment ${adj.id} contains unsafe or inconsistent minor-unit source values; exact cap verification is unavailable`,
          });
          continue;
        }

        if (amountMinor > maxRefundable) {
          discrepancies.push({
            type: 'DELIVERY_FEE_OVER_REFUND',
            sourceRef: `adjustment:${adj.id}`,
            expected: maxRefundable,
            actual: amountMinor,
            delta: amountMinor - maxRefundable,
            description: `Delivery-fee adjustment ${adj.id} amount ${amountMinor} exceeds the exact refundable fee-plus-VAT cap ${maxRefundable}`,
          });
        }
      } else {
        discrepancies.push({
          type: 'INCOMPLETE_SOURCE_DATA',
          sourceRef: `adjustment:${adj.id}`,
          description: `Delivery-fee adjustment ${adj.id} has no order financial breakdown; exact cap verification is unavailable`,
        });
      }
    }
  }

  /** Check for duplicate refunds (same return, multiple SUCCEEDED refunds). */
  private async checkDuplicates(
    db: any,
    startDate: Date, endDate: Date,
    orgId: string | null | undefined,
    discrepancies: ReconciliationDiscrepancyDraft[],
  ) {
    const returnRefunds = await db
      .select({
        returnId: returnRequests.id,
        count: sql<number>`count(*)::int`,
      })
      .from(refunds)
      .innerJoin(returnRequests, eq(refunds.returnRequestId, returnRequests.id))
      .innerJoin(orders, eq(returnRequests.subOrderId, orders.id))
      .innerJoin(stores, eq(orders.storeId, stores.id))
      .where(and(
        eq(refunds.status, 'SUCCEEDED'),
        gte(returnRequests.createdAt, startDate),
        lte(returnRequests.createdAt, endDate),
        orgId ? eq(stores.orgId, orgId) : undefined,
      ))
      .groupBy(returnRequests.id);

    for (const row of returnRefunds) {
      if (row.count > 1) {
        discrepancies.push({
          type: 'DUPLICATE_REFUND' as DiscrepancyType,
          sourceRef: `return:${row.returnId}`,
          actual: row.count,
          description: `Return ${row.returnId} has ${row.count} SUCCEEDED refunds (expected 1)`,
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // QUERY METHODS (tenant-scoped)
  // ═══════════════════════════════════════════════════════════════

  /** Get a reconciliation run with its discrepancies. */
  async getReconciliationRun(runId: string, orgId?: string | null) {
    const conditions: any[] = [eq(reconciliationRuns.id, runId)];
    if (orgId) conditions.push(eq(reconciliationRuns.orgId, orgId));

    const run = await this.db.db.query.reconciliationRuns.findFirst({
      where: and(...conditions),
    });
    if (!run) throw new NotFoundException('Reconciliation run not found');

    const discConditions: any[] = [eq(reconciliationDiscrepancies.runId, runId)];
    if (orgId) discConditions.push(eq(reconciliationDiscrepancies.orgId, orgId));

    const discrepancies = await this.db.db.query.reconciliationDiscrepancies.findMany({
      where: and(...discConditions),
    });

    return { ...run, discrepancies };
  }

  /** List reconciliation runs (tenant-scoped). */
  async listReconciliationRuns(orgId?: string | null) {
    const conditions: any[] = [];
    if (orgId) conditions.push(eq(reconciliationRuns.orgId, orgId));

    return this.db.db.query.reconciliationRuns.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [sql`${reconciliationRuns.createdAt} DESC`],
    });
  }

  /**
   * Resolve a discrepancy — marks it as resolved with notes.
   * Does NOT modify financial records.
   */
  async resolveDiscrepancy(
    discrepancyId: string,
    resolvedBy: string,
    notes: string,
    orgId?: string | null,
  ) {
    const conditions: any[] = [eq(reconciliationDiscrepancies.id, discrepancyId)];
    if (orgId) conditions.push(eq(reconciliationDiscrepancies.orgId, orgId));

    const disc = await this.db.db.query.reconciliationDiscrepancies.findFirst({
      where: and(...conditions),
    });
    if (!disc) throw new NotFoundException('Discrepancy not found');

    const updateConditions: any[] = [eq(reconciliationDiscrepancies.id, discrepancyId)];
    if (orgId) {
      updateConditions.push(eq(reconciliationDiscrepancies.orgId, orgId));
    }
    const resolvedAt = new Date();
    const updated = await this.db.db
      .update(reconciliationDiscrepancies)
      .set({
        resolved: true,
        resolvedAt,
        resolvedBy,
        resolutionNotes: notes,
      } as any)
      .where(and(...updateConditions))
      .returning({ id: reconciliationDiscrepancies.id });

    if (updated.length === 0) {
      throw new NotFoundException('Discrepancy not found');
    }

    return { ...disc, resolved: true, resolvedAt, resolvedBy, resolutionNotes: notes };
  }
}
