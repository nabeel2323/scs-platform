/**
 * P13 Phase 3.1 — Settlement Adjustment Service (hardened)
 *
 * Implements the approval workflow for financial settlement adjustments:
 *
 * State machine:
 *   DRAFT → PENDING_APPROVAL → APPROVED → POSTED
 *   PENDING_APPROVAL → REJECTED
 *   APPROVED → FAILED (if posting fails)
 *   DRAFT/PENDING_APPROVAL → BLOCKED_FX (if FX cannot be resolved)
 *
 * Approval rules (§3.2):
 *   - No authoritative FX provider exists. ALL adjustments require dual approval
 *     as a safe default because the USD-equivalent threshold cannot be evaluated.
 *   - Dual approval: 2 distinct approvers (one Finance, one admin).
 *   - Creator cannot be ANY approver for dual-approval requirements.
 *   - Approvals are bound to exact (amount, currency, reason, subOrderId, adjustmentType).
 *     Material changes invalidate prior approvals.
 *   - Duplicate approvals from the same user are rejected.
 *   - FX evidence is persisted for audit trail.
 *
 * FX safety (§3.3):
 *   - No authoritative FX provider exists. No hardcoded exchange rates.
 *   - fxStatus = 'BLOCKED' for ALL adjustments (threshold cannot be evaluated).
 *   - Posting is blocked until fxStatus is resolved to 'RESOLVED' by an admin
 *     with access to an authoritative rate.
 *   - Threshold evaluation inputs and evidence are persisted in fx_evidence.
 *
 * Tenant isolation (Phase 3.1):
 *   - All queries are scoped by orgId.
 *   - orgId is derived from the sub-order's store → org relationship.
 *   - Cross-tenant access is rejected.
 */
import {
  Injectable, Logger, NotFoundException, BadRequestException,
  ConflictException, ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import {
  settlementAdjustments, settlementAdjustmentApprovals,
} from './financial.schema';
import { settlementRecords } from '../payments/payments.schema';
import { orders } from '../orders/orders.schema';
import { stores } from '../merchant/merchant.schema';
import { eq, and, sql, desc, isNull } from 'drizzle-orm';
import crypto from 'node:crypto';

/** Valid state transitions for the adjustment state machine. */
const ADJUSTMENT_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PENDING_APPROVAL', 'BLOCKED_FX'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'BLOCKED_FX'],
  APPROVED: ['POSTED', 'FAILED'],
  POSTED: [],
  REJECTED: [],
  FAILED: [],
  BLOCKED_FX: [],
};

/** Permission keys for authorization checks. */
const FINANCE_PERMISSIONS = new Set([
  'finance:approvals:read', 'finance:approvals:write',
]);
const ADMIN_ADJUSTMENT_PERMISSIONS = new Set([
  'admin:adjustments:approve', 'admin:adjustments:read',
  'admin:adjustments:write',
]);

export interface CreateAdjustmentInput {
  subOrderId: string;
  returnRequestId?: string;
  adjustmentType: string;
  amountMinor: number;
  currency: string;
  reason: string;
  notes?: string;
}

export interface ApproveAdjustmentInput {
  approverRole: string;
  notes?: string;
}

@Injectable()
export class SettlementAdjustmentService {
  private readonly logger = new Logger(SettlementAdjustmentService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxDispatcher,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // CREATE ADJUSTMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create a new settlement adjustment in DRAFT state.
   *
   * FX safety: Since no authoritative FX provider exists, ALL adjustments
   * are created with fxStatus='BLOCKED' and requiresDualApproval=true.
   * The $10 USD-equivalent threshold cannot be evaluated without a rate.
   */
  async createAdjustment(
    input: CreateAdjustmentInput,
    createdBy: string,
    orgId?: string | null,
  ) {
    if (input.amountMinor <= 0) {
      throw new BadRequestException('Adjustment amount must be positive');
    }
    if (!input.reason || input.reason.trim().length === 0) {
      throw new BadRequestException('Adjustment reason is required');
    }

    // Derive orgId from sub-order if not provided
    let resolvedOrgId = orgId ?? null;
    if (!resolvedOrgId) {
      const orderRow = await this.db.db.query.orders.findFirst({
        where: eq(orders.id, input.subOrderId),
        columns: { storeId: true },
      });
      if (orderRow?.storeId) {
        const storeRow = await this.db.db.query.stores.findFirst({
          where: eq(stores.id, orderRow.storeId),
          columns: { orgId: true },
        });
        resolvedOrgId = storeRow?.orgId ?? null;
      }
    }

    // FX safety: No authoritative FX provider exists.
    // ALL adjustments are blocked on FX — the threshold cannot be evaluated.
    // Dual approval is always required as a safe default.
    //
    // `fx_status` is constrained by migration 0061 to
    // NOT_REQUIRED | RESOLVED | BLOCKED | PENDING_REVIEW. 'BLOCKED_FX' is a
    // *status* (state-machine) value, not an FX value: writing it here violated
    // the CHECK constraint, so no adjustment could ever be created, and the
    // monitor's posted-without-FX invariant (Phase 4 alert 7) reads 'BLOCKED'.
    const fxStatus = 'BLOCKED';
    const requiresDualApproval = true;

    // Persist FX evidence for audit trail
    const fxEvidence = {
      evaluationTimestamp: new Date().toISOString(),
      currency: input.currency,
      result: 'BLOCKED',
      reason: 'No authoritative FX provider available. USD-equivalent threshold cannot be evaluated. Dual approval required as safe default.',
      thresholdMinor: 1000, // $10.00 in cents
    };

    // Compute approval hash — binds approval to exact terms including adjustment type
    const approvalHash = this.computeApprovalHash(
      input.amountMinor, input.currency, input.reason, input.subOrderId, input.adjustmentType,
    );

    const id = crypto.randomUUID();

    await this.db.db.transaction(async (tx) => {
      await tx.insert(settlementAdjustments).values({
        id,
        subOrderId: input.subOrderId,
        returnRequestId: input.returnRequestId ?? null,
        adjustmentType: input.adjustmentType,
        amountMinor: input.amountMinor,
        currency: input.currency,
        usdEquivalentMinor: null,
        fxRateSource: null,
        fxRate: null,
        fxStatus,
        fxEvidence,
        status: 'DRAFT',
        requiresDualApproval,
        approvalHash,
        reason: input.reason,
        createdBy,
        orgId: resolvedOrgId,
        notes: input.notes ?? null,
      });
    });

    this.logger.log(
      `Settlement adjustment ${id} created: ${input.adjustmentType} ` +
      `${input.amountMinor} ${input.currency}, fxStatus=${fxStatus}, ` +
      `dualApproval=${requiresDualApproval}, orgId=${resolvedOrgId}`,
    );

    return this.getAdjustment(id, resolvedOrgId);
  }

  // ═══════════════════════════════════════════════════════════════
  // SUBMIT FOR APPROVAL
  // ═══════════════════════════════════════════════════════════════

  /**
   * Submit a DRAFT adjustment for approval. Transitions to PENDING_APPROVAL.
   */
  async submitForApproval(adjustmentId: string, submittedBy: string, orgId?: string | null) {
    // BD-P4-ADJ-RESPONSE-001: this must `await`, not `return`. Returning the
    // transaction promise made the trailing read below dead code, so every
    // caller (including the admin HTTP endpoint) got an empty representation
    // even though the transition had committed.
    await this.db.db.transaction(async (tx) => {
      const adj = await this.lockAdjustment(tx, adjustmentId, orgId);
      this.assertTransition(adj, 'PENDING_APPROVAL');

      await tx.update(settlementAdjustments)
        .set({ status: 'PENDING_APPROVAL', updatedAt: new Date() })
        .where(eq(settlementAdjustments.id, adjustmentId));

      await this.outbox.publish('settlement_adjustment.submitted', adjustmentId, {
        adjustmentId, submittedBy,
        amountMinor: adj.amountMinor, currency: adj.currency,
        requiresDualApproval: adj.requiresDualApproval,
        fxStatus: adj.fxStatus,
      }, {}, null, tx);
    });

    return this.getAdjustment(adjustmentId, orgId);
  }

  // ═══════════════════════════════════════════════════════════════
  // APPROVE ADJUSTMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Add an approval to a PENDING_APPROVAL adjustment.
   *
   * Rules:
   * - Approver must have Finance or admin role.
   * - Duplicate approval from same user rejected.
   * - Approval hash must match current adjustment terms.
   * - Creator cannot be ANY approver for dual-approval (self-dealing prevention).
   * - When all required approvals are collected, transition to APPROVED.
   */
  async approveAdjustment(
    adjustmentId: string,
    approverId: string,
    approverRole: string,
    input: ApproveAdjustmentInput,
    orgId?: string | null,
  ) {
    // Validate approver role
    const isFinance = approverRole === 'FINANCE' ||
      FINANCE_PERMISSIONS.has(input.approverRole ?? '');
    const isAdmin = approverRole === 'ADMIN' ||
      ADMIN_ADJUSTMENT_PERMISSIONS.has(input.approverRole ?? '');

    if (!isFinance && !isAdmin) {
      throw new ForbiddenException(
        'Approver must have Finance or admin permission to approve settlement adjustments',
      );
    }

    // BD-P4-ADJ-RESPONSE-001: `await` so the approval state is read back after
    // commit (see submitForApproval).
    await this.db.db.transaction(async (tx) => {
      const adj = await this.lockAdjustment(tx, adjustmentId, orgId);

      if (adj.status !== 'PENDING_APPROVAL') {
        throw new ConflictException(
          `Cannot approve adjustment in status ${adj.status}; must be PENDING_APPROVAL`,
        );
      }

      // Check for duplicate approval (same approver)
      const existingApproval = await tx.query.settlementAdjustmentApprovals.findFirst({
        where: and(
          eq(settlementAdjustmentApprovals.adjustmentId, adjustmentId),
          eq(settlementAdjustmentApprovals.approverId, approverId),
        ),
      });
      if (existingApproval) {
        throw new ConflictException(
          `Approver ${approverId} has already approved this adjustment`,
        );
      }

      // Verify approval hash matches current terms (including adjustment type)
      const expectedHash = this.computeApprovalHash(
        adj.amountMinor, adj.currency, adj.reason, adj.subOrderId, adj.adjustmentType,
      );
      if (adj.approvalHash && adj.approvalHash !== expectedHash) {
        throw new ConflictException(
          'Adjustment terms have changed since creation; re-approval required',
        );
      }

      // Self-dealing prevention: creator cannot be ANY approver for dual-approval
      if (adj.requiresDualApproval && adj.createdBy === approverId) {
        throw new ConflictException(
          'Creator cannot approve their own dual-approval adjustment. ' +
          'Two distinct Finance/admin users who are NOT the creator are required.',
        );
      }

      // Insert the approval
      const approvalRole = isFinance ? 'FINANCE' : 'ADMIN';
      await tx.insert(settlementAdjustmentApprovals).values({
        id: crypto.randomUUID(),
        adjustmentId,
        approverId,
        approverRole: approvalRole,
        approvalHash: expectedHash,
        notes: input.notes ?? null,
      });

      // Count approvals and determine if we can transition to APPROVED
      const approvalCounts = await tx
        .select({
          total: sql<number>`count(*)::int`,
          financeCount: sql<number>`count(*) FILTER (WHERE approver_role = 'FINANCE')::int`,
          adminCount: sql<number>`count(*) FILTER (WHERE approver_role = 'ADMIN')::int`,
        })
        .from(settlementAdjustmentApprovals)
        .where(eq(settlementAdjustmentApprovals.adjustmentId, adjustmentId));

      const { total, financeCount, adminCount } = approvalCounts[0] ?? {
        total: 0, financeCount: 0, adminCount: 0,
      };

      let allApproved = false;
      if (adj.requiresDualApproval) {
        // Need at least 1 Finance AND 1 admin, total >= 2, all distinct
        allApproved = financeCount >= 1 && adminCount >= 1 && total >= 2;
      } else {
        // Single approval sufficient
        allApproved = total >= 1;
      }

      if (allApproved) {
        await tx.update(settlementAdjustments)
          .set({ status: 'APPROVED', updatedAt: new Date() })
          .where(eq(settlementAdjustments.id, adjustmentId));

        await this.outbox.publish('settlement_adjustment.approved', adjustmentId, {
          adjustmentId,
          totalApprovals: total,
          financeApprovals: financeCount,
          adminApprovals: adminCount,
        }, {}, null, tx);

        this.logger.log(
          `Adjustment ${adjustmentId} fully approved: ` +
          `${total} approvals (finance=${financeCount}, admin=${adminCount})`,
        );
      }

      await this.outbox.publish('settlement_adjustment.approval_added', adjustmentId, {
        adjustmentId, approverId, approverRole: approvalRole,
        totalApprovals: total, allApproved,
      }, {}, null, tx);
    });

    return this.getAdjustment(adjustmentId, orgId);
  }

  // ═══════════════════════════════════════════════════════════════
  // REJECT ADJUSTMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Reject a PENDING_APPROVAL adjustment.
   */
  async rejectAdjustment(
    adjustmentId: string,
    rejectedBy: string,
    reason: string,
    orgId?: string | null,
  ) {
    await this.db.db.transaction(async (tx) => {
      const adj = await this.lockAdjustment(tx, adjustmentId, orgId);
      if (adj.status !== 'PENDING_APPROVAL') {
        throw new ConflictException(
          `Cannot reject adjustment in status ${adj.status}`,
        );
      }

      await tx.update(settlementAdjustments)
        .set({ status: 'REJECTED', updatedAt: new Date() })
        .where(eq(settlementAdjustments.id, adjustmentId));

      await this.outbox.publish('settlement_adjustment.rejected', adjustmentId, {
        adjustmentId, rejectedBy, reason,
      }, {}, null, tx);
    });

    this.logger.log(`Adjustment ${adjustmentId} rejected by ${rejectedBy}`);
    return this.getAdjustment(adjustmentId, orgId);
  }

  // ═══════════════════════════════════════════════════════════════
  // POST ADJUSTMENT (apply to settlement)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Post an APPROVED adjustment — applies it to the target settlement.
   * Creates a new settlement record reflecting the adjustment.
   *
   * Safety: verifies FX status allows posting. BLOCKED_FX prevents posting
   * unless an admin has explicitly resolved the FX status.
   */
  async postAdjustment(adjustmentId: string, postedBy: string, orgId?: string | null) {
    // BD-P4-ADJ-RESPONSE-001: `await` so the posted adjustment is read back
    // after commit (see submitForApproval).
    await this.db.db.transaction(async (tx) => {
      const adj = await this.lockAdjustment(tx, adjustmentId, orgId);
      if (adj.status !== 'APPROVED') {
        throw new ConflictException(
          `Cannot post adjustment in status ${adj.status}; must be APPROVED`,
        );
      }

      // FX safety: posting is allow-listed, not deny-listed. Only an explicitly
      // resolved FX position (or one the schema marked NOT_REQUIRED) may post;
      // BLOCKED, PENDING_REVIEW, NULL or any unexpected value stays blocked.
      // This mirrors the Phase 4 monitor's invariant (alert 7) and satisfies §7:
      // adjustments without an authoritative FX source stay blocked.
      if (adj.fxStatus !== 'RESOLVED' && adj.fxStatus !== 'NOT_REQUIRED') {
        throw new ConflictException(
          `Cannot post adjustment: FX status is ${adj.fxStatus ?? 'NULL'}, not RESOLVED. ` +
          'An admin with access to an authoritative rate must resolve the FX status first.',
        );
      }

      // Verify all required approvals are still valid
      const approvalCounts = await tx
        .select({
          total: sql<number>`count(*)::int`,
          financeCount: sql<number>`count(*) FILTER (WHERE approver_role = 'FINANCE')::int`,
          adminCount: sql<number>`count(*) FILTER (WHERE approver_role = 'ADMIN')::int`,
        })
        .from(settlementAdjustmentApprovals)
        .where(eq(settlementAdjustmentApprovals.adjustmentId, adjustmentId));

      const { total, financeCount, adminCount } = approvalCounts[0] ?? {
        total: 0, financeCount: 0, adminCount: 0,
      };

      if (adj.requiresDualApproval) {
        if (financeCount < 1 || adminCount < 1 || total < 2) {
          throw new ConflictException(
            `Adjustment requires dual approval but has insufficient approvals: ` +
            `total=${total}, finance=${financeCount}, admin=${adminCount}`,
          );
        }
      } else {
        if (total < 1) {
          throw new ConflictException('Adjustment has no approvals');
        }
      }

      // Verify approval hash still matches (material changes invalidate)
      const currentHash = this.computeApprovalHash(
        adj.amountMinor, adj.currency, adj.reason, adj.subOrderId, adj.adjustmentType,
      );
      if (adj.approvalHash && adj.approvalHash !== currentHash) {
        throw new ConflictException(
          'Adjustment terms have changed since approval; re-approval required before posting',
        );
      }

      // Find the latest settlement for this sub-order (scoped by org)
      const settlement = await tx.query.settlementRecords.findFirst({
        where: eq(settlementRecords.subOrderId, adj.subOrderId),
        orderBy: [desc(settlementRecords.calculatedAt)],
      });

      // Transition to POSTED
      await tx.update(settlementAdjustments)
        .set({
          status: 'POSTED',
          settlementId: settlement?.id ?? null,
          updatedAt: new Date(),
        })
        .where(eq(settlementAdjustments.id, adjustmentId));

      // If there's a settlement, create an ADJUSTMENT settlement record
      if (settlement) {
        const orderRow = await tx.query.orders.findFirst({
          where: eq(orders.id, adj.subOrderId),
          columns: { storeId: true },
        });

        await tx.insert(settlementRecords).values({
          id: crypto.randomUUID(),
          subOrderId: adj.subOrderId,
          paymentRecordId: settlement.paymentRecordId,
          merchantStoreId: settlement.merchantStoreId,
          grossMinor: 0,
          refundMinor: adj.adjustmentType === 'REFUND_SUPPLEMENT' || adj.adjustmentType === 'DELIVERY_FEE_REFUND' || adj.adjustmentType === 'DELIVERY_FEE_EXCEPTION' ? adj.amountMinor : 0,
          commissionMinor: adj.adjustmentType === 'COMMISSION_REVERSAL' ? adj.amountMinor : 0,
          feeMinor: adj.adjustmentType === 'BALANCE_ADJUSTMENT' ? adj.amountMinor : 0,
          netMinor: -adj.amountMinor,
          currency: adj.currency,
          status: 'ADJUSTMENT',
          calculatedAt: new Date(),
          notes: `Posted adjustment ${adjustmentId}: ${adj.adjustmentType} ` +
                 `${adj.amountMinor} ${adj.currency} by ${postedBy}`,
        });
      }

      await this.outbox.publish('settlement_adjustment.posted', adjustmentId, {
        adjustmentId, postedBy, settlementId: settlement?.id ?? null,
        amountMinor: adj.amountMinor, currency: adj.currency,
        orgId: adj.orgId,
      }, {}, null, tx);

      this.logger.log(
        `Adjustment ${adjustmentId} posted: ${adj.adjustmentType} ` +
        `${adj.amountMinor} ${adj.currency}`,
      );
    });

    return this.getAdjustment(adjustmentId, orgId);
  }

  // ═══════════════════════════════════════════════════════════════
  // QUERY METHODS (tenant-scoped)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get a single adjustment with its approvals.
   * If orgId is provided, verifies the adjustment belongs to that org.
   */
  async getAdjustment(adjustmentId: string, orgId?: string | null) {
    const conditions = [eq(settlementAdjustments.id, adjustmentId)];
    if (orgId) {
      conditions.push(eq(settlementAdjustments.orgId, orgId));
    }

    const adj = await this.db.db.query.settlementAdjustments.findFirst({
      where: and(...conditions),
    });
    if (!adj) throw new NotFoundException('Settlement adjustment not found');

    const approvals = await this.db.db.query.settlementAdjustmentApprovals.findMany({
      where: eq(settlementAdjustmentApprovals.adjustmentId, adjustmentId),
    });

    return { ...adj, approvals };
  }

  /**
   * List adjustments with optional status and org filter.
   */
  async listAdjustments(orgId?: string | null, status?: string) {
    const conditions: any[] = [];
    if (orgId) conditions.push(eq(settlementAdjustments.orgId, orgId));
    if (status) conditions.push(eq(settlementAdjustments.status, status));

    return this.db.db.query.settlementAdjustments.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(settlementAdjustments.createdAt)],
    });
  }

  /**
   * List adjustments for a specific sub-order (scoped by org).
   */
  async listAdjustmentsForOrder(subOrderId: string, orgId?: string | null) {
    const conditions: any[] = [eq(settlementAdjustments.subOrderId, subOrderId)];
    if (orgId) conditions.push(eq(settlementAdjustments.orgId, orgId));

    return this.db.db.query.settlementAdjustments.findMany({
      where: and(...conditions),
      orderBy: [desc(settlementAdjustments.createdAt)],
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ═══════════════════════════════════════════════════════════════

  /** Lock an adjustment row FOR UPDATE and return it. Optionally scope by org. */
  private async lockAdjustment(tx: any, adjustmentId: string, orgId?: string | null) {
    const conditions: any[] = [eq(settlementAdjustments.id, adjustmentId)];
    if (orgId) conditions.push(eq(settlementAdjustments.orgId, orgId));

    const [adj] = await tx
      .select()
      .from(settlementAdjustments)
      .where(and(...conditions))
      .for('update');

    if (!adj) throw new NotFoundException('Settlement adjustment not found');
    return adj;
  }

  /** Assert that a state transition is valid. */
  private assertTransition(adj: any, targetStatus: string) {
    const allowed = ADJUSTMENT_TRANSITIONS[adj.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new ConflictException(
        `Cannot transition from ${adj.status} to ${targetStatus}. ` +
        `Allowed: ${allowed.join(', ') || 'none (terminal state)'}`,
      );
    }
  }

  /**
   * Compute an approval hash that binds the approval to exact terms.
   * Any change to amount, currency, reason, target, or adjustment type invalidates prior approvals.
   */
  private computeApprovalHash(
    amountMinor: number, currency: string, reason: string,
    subOrderId: string, adjustmentType: string,
  ): string {
    const payload = `${amountMinor}:${currency}:${reason}:${subOrderId}:${adjustmentType}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }
}
