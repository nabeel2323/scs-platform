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
 * - Concurrent runs are prevented by unique index on (period, currency, version)
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

    // Determine the next version for this period/currency/org
    const latestRun = await this.db.db.query.reconciliationRuns.findFirst({
      where: and(
        eq(reconciliationRuns.periodStart, periodStart),
        eq(reconciliationRuns.periodEnd, periodEnd),
        eq(reconciliationRuns.currency, currency),
        orgId ? eq(reconciliationRuns.orgId, orgId) : isNull(reconciliationRuns.orgId),
      ),
      orderBy: [sql`${reconciliationRuns.version} DESC`],
    });

    const nextVersion = (latestRun?.version ?? 0) + 1;

    // Create a new run (never reuse an existing run)
    const runId = crypto.randomUUID();
    await this.db.db.insert(reconciliationRuns).values({
      id: runId,
      periodStart,
      periodEnd,
      currency,
      version: nextVersion,
      status: 'RUNNING',
      summary: {},
      discrepancyCount: 0,
      executedBy,
      orgId: orgId ?? null,
    });

    // If there was a prior run, link it via supersededBy on the new run
    // (We update the new run to point to the latest prior run)
    if (latestRun) {
      await this.db.db.update(reconciliationRuns)
        .set({ supersededBy: latestRun.id } as any)
        .where(eq(reconciliationRuns.id, runId));
    }

    const discrepancies: Array<{
      type: DiscrepancyType; sourceRef: string;
      expected?: number; actual?: number; delta?: number;
      description: string;
    }> = [];

    // ── Check 1: Returns with approved refunds but no executed refund ──
    await this.checkMissingRefunds(startDate, endDate, orgId, discrepancies);

    // ── Check 2: Commission reversal consistency ──
    await this.checkCommissionReversals(startDate, endDate, currency, orgId, discrepancies);

    // ── Check 3: Settlement net formula consistency ──
    await this.checkSettlementConsistency(startDate, endDate, currency, orgId, discrepancies);

    // ── Check 4: Adjustment approval completeness ──
    await this.checkAdjustmentApprovals(startDate, endDate, orgId, discrepancies);

    // ── Check 5: Delivery-fee refund caps ──
    await this.checkDeliveryFeeCaps(startDate, endDate, orgId, discrepancies);

    // ── Check 6: Duplicate detection ──
    await this.checkDuplicates(startDate, endDate, orgId, discrepancies);

    // Record discrepancies (all in the new run)
    const summary: Record<string, number> = {};
    for (const d of discrepancies) {
      summary[d.type] = (summary[d.type] ?? 0) + 1;
      await this.db.db.insert(reconciliationDiscrepancies).values({
        id: crypto.randomUUID(),
        runId,
        discrepancyType: d.type,
        sourceRef: d.sourceRef,
        expectedMinor: d.expected ?? null,
        actualMinor: d.actual ?? null,
        deltaMinor: d.delta ?? null,
        description: d.description,
        orgId: orgId ?? null,
      });
    }

    // Update run record to COMPLETED
    await this.db.db.update(reconciliationRuns)
      .set({
        status: 'COMPLETED',
        summary,
        discrepancyCount: discrepancies.length,
        completedAt: new Date(),
      } as any)
      .where(eq(reconciliationRuns.id, runId));

    this.logger.log(
      `Reconciliation ${runId} v${nextVersion} completed: ${periodStart} to ${periodEnd} ` +
      `(${currency}) — ${discrepancies.length} discrepancies found`,
    );

    return {
      runId,
      version: nextVersion,
      periodStart,
      periodEnd,
      currency,
      status: 'COMPLETED',
      discrepancyCount: discrepancies.length,
      summary,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK IMPLEMENTATIONS (all tenant-scoped via orgId)
  // ═══════════════════════════════════════════════════════════════

  /** Check for returns that reached REFUNDED status but have no SUCCEEDED refund. */
  private async checkMissingRefunds(
    startDate: Date, endDate: Date,
    orgId: string | null | undefined,
    discrepancies: Array<any>,
  ) {
    // Build org-scoped query: return → sub-order → store → org
    const refundedReturns = await this.db.db
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

      const refund = await this.db.db.query.refunds.findFirst({
        where: eq(refunds.id, ret.refundId),
      });
      if (!refund) {
        discrepancies.push({
          type: 'INCOMPLETE_SOURCE_DATA' as DiscrepancyType,
          sourceRef: `return:${ret.id}:refund:${ret.refundId}`,
          description: `Return ${ret.id} references refund ${ret.refundId} which does not exist`,
        });
      } else if (refund.status !== 'SUCCEEDED') {
        discrepancies.push({
          type: 'REFUND_STATUS_MISMATCH' as DiscrepancyType,
          sourceRef: `return:${ret.id}:refund:${refund.id}`,
          expected: 'SUCCEEDED',
          actual: refund.status as any,
          description: `Return ${ret.id} is REFUNDED but linked refund is ${refund.status}`,
        });
      }
    }
  }

  /** Check commission reversal consistency for eligible returns. */
  private async checkCommissionReversals(
    startDate: Date, endDate: Date, currency: string,
    orgId: string | null | undefined,
    discrepancies: Array<any>,
  ) {
    const REVERSAL_CATEGORIES = ['MERCHANT', 'PLATFORM', 'CARRIER_DAMAGE'];

    const eligibleReturns = await this.db.db
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

      const reversals = await this.db.db.query.commissionReversals.findMany({
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

      const breakdown = await this.db.db.query.orderFinancialBreakdown.findFirst({
        where: eq(orderFinancialBreakdown.orderId, ret.subOrderId),
      });
      if (breakdown) {
        const totalReversed = reversals.reduce((sum, r) => sum + Number(r.reversalMinor), 0);
        if (totalReversed > breakdown.commissionMinor) {
          discrepancies.push({
            type: 'EXCESSIVE_REVERSAL' as DiscrepancyType,
            sourceRef: `return:${ret.id}`,
            expected: breakdown.commissionMinor,
            actual: totalReversed,
            delta: totalReversed - breakdown.commissionMinor,
            description: `Return ${ret.id} reversal ${totalReversed} exceeds original commission ${breakdown.commissionMinor}`,
          });
        }
      }
    }
  }

  /** Check settlement net = gross - refund - commission - fee. */
  private async checkSettlementConsistency(
    startDate: Date, endDate: Date, currency: string,
    orgId: string | null | undefined,
    discrepancies: Array<any>,
  ) {
    // Settlement records are scoped by merchantStoreId → store → org
    // For simplicity, we query all settlements in the period with matching currency
    // and filter by org through the store relationship
    const settlements = await this.db.db
      .select({
        id: settlementRecords.id,
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
      const expectedNet = Number(s.grossMinor) - Number(s.refundMinor) -
        Number(s.commissionMinor) - Number(s.feeMinor);
      const actualNet = Number(s.netMinor);

      if (expectedNet !== actualNet) {
        discrepancies.push({
          type: 'SETTLEMENT_MISMATCH' as DiscrepancyType,
          sourceRef: `settlement:${s.id}`,
          expected: expectedNet,
          actual: actualNet,
          delta: actualNet - expectedNet,
          description: `Settlement ${s.id} net ${actualNet} != formula result ${expectedNet}`,
        });
      }
    }
  }

  /** Check that POSTED adjustments have required approvals. */
  private async checkAdjustmentApprovals(
    startDate: Date, endDate: Date,
    orgId: string | null | undefined,
    discrepancies: Array<any>,
  ) {
    const conditions: any[] = [
      eq(settlementAdjustments.status, 'POSTED'),
      gte(settlementAdjustments.createdAt, startDate),
      lte(settlementAdjustments.createdAt, endDate),
    ];
    if (orgId) conditions.push(eq(settlementAdjustments.orgId, orgId));

    const postedAdjustments = await this.db.db
      .select()
      .from(settlementAdjustments)
      .where(and(...conditions));

    for (const adj of postedAdjustments) {
      const approvals = await this.db.db.query.settlementAdjustmentApprovals.findMany({
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
    startDate: Date, endDate: Date,
    orgId: string | null | undefined,
    discrepancies: Array<any>,
  ) {
    const conditions: any[] = [
      eq(settlementAdjustments.adjustmentType, 'DELIVERY_FEE_EXCEPTION'),
      gte(settlementAdjustments.createdAt, startDate),
      lte(settlementAdjustments.createdAt, endDate),
    ];
    if (orgId) conditions.push(eq(settlementAdjustments.orgId, orgId));

    const adjustments = await this.db.db
      .select()
      .from(settlementAdjustments)
      .where(and(...conditions));

    for (const adj of adjustments) {
      const breakdown = await this.db.db.query.orderFinancialBreakdown.findFirst({
        where: eq(orderFinancialBreakdown.orderId, adj.subOrderId),
      });
      if (breakdown) {
        // The delivery fee refund should not exceed the original delivery fee + VAT
        // VAT is calculated from the breakdown's taxMinor / productsMinor ratio
        const vatRate = breakdown.productsMinor > 0
          ? breakdown.taxMinor / breakdown.productsMinor
          : 0;
        const maxRefundable = Number(breakdown.deliveryFeeMinor) * (1 + vatRate);
        if (Number(adj.amountMinor) > maxRefundable) {
          discrepancies.push({
            type: 'DELIVERY_FEE_OVER_REFUND' as DiscrepancyType,
            sourceRef: `adjustment:${adj.id}`,
            expected: Number(breakdown.deliveryFeeMinor),
            actual: Number(adj.amountMinor),
            description: `Delivery fee adjustment ${adj.id} amount ${adj.amountMinor} ` +
              `exceeds original fee ${breakdown.deliveryFeeMinor} + VAT (max refundable: ${maxRefundable})`,
          });
        }
      }
    }
  }

  /** Check for duplicate refunds (same return, multiple SUCCEEDED refunds). */
  private async checkDuplicates(
    startDate: Date, endDate: Date,
    orgId: string | null | undefined,
    discrepancies: Array<any>,
  ) {
    const returnRefunds = await this.db.db
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

    await this.db.db.update(reconciliationDiscrepancies)
      .set({
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy,
        resolutionNotes: notes,
      } as any)
      .where(eq(reconciliationDiscrepancies.id, discrepancyId));

    return { ...disc, resolved: true, resolvedAt: new Date(), resolvedBy, resolutionNotes: notes };
  }
}
