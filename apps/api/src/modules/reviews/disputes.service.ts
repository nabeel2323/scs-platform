import { Injectable, NotFoundException, BadRequestException, ConflictException, Optional } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import { disputes, disputeEvents, conversations, messages } from './support.schema';
import { orders } from '../orders/orders.schema';
import { paymentRecords, refunds } from '../payments/payments.schema';
import { eq, and, desc, or } from 'drizzle-orm';
import crypto from 'node:crypto';
import { PaymentsService } from '../payments/payments.service';
import { CallerContext, isTenantPrivileged } from '../../common/tenant-scope';

/**
 * Disputes service — dispute workflow and order-linked conversations.
 *
 * Dispute window: 72h from DELIVERED.
 * Status: OPEN → EVIDENCE → RESPONSE → REVIEW → RESOLVED | CLOSED
 */
@Injectable()
export class DisputesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxDispatcher,
    @Optional() private readonly payments?: PaymentsService,
  ) {}

  // ── Disputes ─────────────────────────────────────────────────

  async createDispute(input: CreateDisputeInput) {
    // Verify order is in DELIVERED state and within 72h window
    const order = await this.db.db.query.orders.findFirst({
      where: eq(orders.id, input.orderId),
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order['status'] !== 'DELIVERED') {
      throw new BadRequestException('Disputes can only be opened for DELIVERED orders');
    }

    // Check 72h window
    const deliveredAt = new Date(order['updatedAt'] || order['createdAt']);
    const windowEnd = new Date(deliveredAt.getTime() + 72 * 60 * 60 * 1000);
    if (new Date() > windowEnd) {
      throw new BadRequestException('Dispute window (72h) has expired');
    }

    // Check for existing open dispute
    const existing = await this.db.db.query.disputes.findFirst({
      where: and(
        eq(disputes.orderId, input.orderId),
        eq(disputes.status, 'OPEN'),
      ),
    });
    if (existing) throw new ConflictException('An open dispute already exists for this order');

    const id = crypto.randomUUID();
    await this.db.db.insert(disputes).values({
      id,
      orderId: input.orderId,
      raisedBy: input.raisedBy,
      againstId: input.againstId,
      reason: input.reason,
    });

    // Record initial event
    await this.db.db.insert(disputeEvents).values({
      id: crypto.randomUUID(),
      disputeId: id,
      actorId: input.raisedBy,
      eventType: 'OPENED',
      body: input.reason,
    });

    await this.outbox.publish('dispute.opened', id, {
      disputeId: id,
      orderId: input.orderId,
      raisedBy: input.raisedBy,
      againstId: input.againstId,
    });

    return this.getDispute(id);
  }

  async getDispute(id: string) {
    const dispute = await this.db.db.query.disputes.findFirst({
      where: eq(disputes.id, id),
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    return dispute;
  }

  async listDisputes(userId?: string, status?: string) {
    const conditions = [];
    if (userId) {
      conditions.push(or(eq(disputes.raisedBy, userId), eq(disputes.againstId, userId)));
    }
    if (status) conditions.push(eq(disputes.status, status));

    return this.db.db.query.disputes.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(disputes.createdAt)],
    });
  }

  async submitEvidence(disputeId: string, userId: string, body: string, attachments?: string[]) {
    const dispute = await this.getDispute(disputeId);

    if (dispute['raisedBy'] !== userId && dispute['againstId'] !== userId) {
      throw new BadRequestException('Not a party to this dispute');
    }

    // Update dispute status to EVIDENCE if OPEN
    if (dispute['status'] === 'OPEN') {
      await this.db.db
        .update(disputes)
        .set({ status: 'EVIDENCE', updatedAt: new Date() })
        .where(eq(disputes.id, disputeId));
    }

    await this.db.db.insert(disputeEvents).values({
      id: crypto.randomUUID(),
      disputeId,
      actorId: userId,
      eventType: 'EVIDENCE_SUBMITTED',
      body,
      attachments: attachments || [],
    });

    return this.getDispute(disputeId);
  }

  async submitResponse(disputeId: string, userId: string, body: string) {
    const dispute = await this.getDispute(disputeId);

    if (dispute['againstId'] !== userId) {
      throw new BadRequestException('Only the respondent can submit a response');
    }

    await this.db.db
      .update(disputes)
      .set({ status: 'RESPONSE', updatedAt: new Date() })
      .where(eq(disputes.id, disputeId));

    await this.db.db.insert(disputeEvents).values({
      id: crypto.randomUUID(),
      disputeId,
      actorId: userId,
      eventType: 'RESPONSE_SUBMITTED',
      body,
    });

    return this.getDispute(disputeId);
  }

  async resolveDispute(
    disputeId: string,
    adminUserId: string,
    resolution: string,
    caller?: CallerContext,
    refundInput?: { amountMinor: number; reason?: string; returnRequestId?: string },
  ) {
    const dispute = await this.getDispute(disputeId);

    if (caller && !isTenantPrivileged(caller)) {
      throw new BadRequestException('Only admins can resolve disputes');
    }

    // P13: a resolved/closed dispute is never re-resolved — prevents duplicate refunds
    // and preserves the original resolution as the audit record.
    if (dispute['status'] === 'RESOLVED' || dispute['status'] === 'CLOSED') {
      throw new ConflictException(`Dispute is already ${dispute['status']}`);
    }

    let refundResult: any = null;

    // If refund requested, create via P12 path
    if (refundInput && this.payments) {
      const payment = await this.db.db.query.paymentRecords.findFirst({
        where: eq(paymentRecords.orderId, dispute['orderId']),
      });
      if (!payment) throw new NotFoundException('No payment found for this order');

      const idempotencyKey = `dispute-refund:${disputeId}`;

      // P13 recovery: if a previous attempt committed the refund but failed before
      // finishing the dispute transition, reuse it instead of hitting the
      // unique idempotency-key constraint (which would make the dispute unresolvable).
      const existingRefund = await this.db.db.query.refunds.findFirst({
        where: eq(refunds.idempotencyKey, idempotencyKey),
      });

      refundResult = existingRefund
        ? {
            refundId: existingRefund.id,
            amountMinor: Number(existingRefund.amountMinor),
            status: existingRefund.status,
          }
        : await this.payments.requestRefund(
            payment.id,
            refundInput.amountMinor,
            refundInput.reason || 'PRODUCT_NOT_AS_DESCRIBED',
            dispute['raisedBy'],
            { sub: adminUserId, role: 'ADMIN' },
            {
              idempotencyKey,
              notes: `Dispute ${disputeId} resolution refund`,
            },
          );
    }

    await this.db.db.transaction(async (tx) => {
      // P13: link the refund back to this dispute inside the resolution transaction
      if (refundResult) {
        await tx
          .update(refunds)
          .set({ disputeId, updatedAt: new Date() })
          .where(eq(refunds.id, refundResult.refundId));
      }

      await tx
        .update(disputes)
        .set({
          status: 'RESOLVED',
          resolution,
          resolvedBy: adminUserId,
          resolvedAt: new Date(),
          updatedAt: new Date(),
          ...(refundInput?.returnRequestId ? { returnRequestId: refundInput.returnRequestId } : {}),
        })
        .where(eq(disputes.id, disputeId));

      await tx.insert(disputeEvents).values({
        id: crypto.randomUUID(),
        disputeId,
        actorId: adminUserId,
        eventType: 'RESOLVED',
        body: resolution,
        metadata: refundResult ? { refundId: refundResult.refundId, amountMinor: refundResult.amountMinor } : {},
      });

      await this.outbox.publish('dispute.resolved', disputeId, {
        disputeId,
        orderId: dispute['orderId'],
        resolution,
        refundId: refundResult?.refundId ?? null,
      }, {}, null, tx);
    });

    return this.getDispute(disputeId);
  }

  async getDisputeEvents(disputeId: string) {
    return this.db.db.query.disputeEvents.findMany({
      where: eq(disputeEvents.disputeId, disputeId),
      orderBy: [disputeEvents.createdAt],
    });
  }

  // ── Conversations ────────────────────────────────────────────

  async createOrGetConversation(orderId: string, userId1: string, userId2: string) {
    const existing = await this.db.db.query.conversations.findFirst({
      where: and(
        eq(conversations.orderId, orderId),
        eq(conversations.participant1, userId1),
        eq(conversations.participant2, userId2),
      ),
    });
    if (existing) return existing;

    const id = crypto.randomUUID();
    await this.db.db.insert(conversations).values({
      id,
      orderId,
      participant1: userId1,
      participant2: userId2,
    });

    return this.getConversation(id);
  }

  async getConversation(id: string) {
    const conv = await this.db.db.query.conversations.findFirst({
      where: eq(conversations.id, id),
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    return conv;
  }

  async sendMessage(conversationId: string, senderId: string, body: string) {
    const conv = await this.getConversation(conversationId);

    if (conv['participant1'] !== senderId && conv['participant2'] !== senderId) {
      throw new BadRequestException('Not a participant in this conversation');
    }

    const id = crypto.randomUUID();
    await this.db.db.insert(messages).values({
      id,
      conversationId,
      senderId,
      body,
    });

    await this.db.db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    return { id, conversationId, senderId, body, createdAt: new Date() };
  }

  async getMessages(conversationId: string) {
    return this.db.db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: [messages.createdAt],
    });
  }

  async markMessagesRead(conversationId: string, _userId: string) {
    await this.db.db
      .update(messages)
      .set({ isRead: true })
      .where(and(
        eq(messages.conversationId, conversationId),
        eq(messages.isRead, false),
      ));

    return { success: true };
  }
}

// ── Input types ──────────────────────────────────────────────────

export interface CreateDisputeInput {
  orderId: string;
  raisedBy: string;
  againstId: string;
  reason: string;
}
