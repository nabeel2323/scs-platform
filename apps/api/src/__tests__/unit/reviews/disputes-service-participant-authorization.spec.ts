import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { DisputesService } from '../../../modules/reviews/disputes.service';

const buyer = { sub: 'buyer-a', role: 'BUYER', activeOrg: null };
const attacker = { sub: 'attacker', role: 'BUYER', activeOrg: null };

describe('DisputesService participant authorization', () => {
  it('does not return a dispute to a non-participant', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'dispute-a',
      raisedBy: 'buyer-a',
      againstId: 'merchant-a',
    });
    const service = new DisputesService(
      { db: { query: { disputes: { findFirst } } } } as any,
      {} as any,
    );

    await expect(service.getDispute('dispute-a', attacker as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not return dispute events before participant authorization', async () => {
    const disputeFindFirst = vi.fn().mockResolvedValue({
      id: 'dispute-a',
      raisedBy: 'buyer-a',
      againstId: 'merchant-a',
    });
    const eventsFindMany = vi.fn();
    const service = new DisputesService(
      { db: { query: { disputes: { findFirst: disputeFindFirst }, disputeEvents: { findMany: eventsFindMany } } } } as any,
      {} as any,
    );

    await expect(service.getDisputeEvents('dispute-a', attacker as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(eventsFindMany).not.toHaveBeenCalled();
  });

  it('rejects conversations and messages for non-participants', async () => {
    const conversationFindFirst = vi.fn().mockResolvedValue({
      id: 'conversation-a',
      participant1: 'buyer-a',
      participant2: 'merchant-a',
    });
    const messagesFindMany = vi.fn();
    const service = new DisputesService(
      { db: { query: { conversations: { findFirst: conversationFindFirst }, messages: { findMany: messagesFindMany } } } } as any,
      {} as any,
    );

    await expect(service.getConversation('conversation-a', attacker as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getMessages('conversation-a', attacker as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(messagesFindMany).not.toHaveBeenCalled();
  });

  it('marks only incoming messages as read and requires conversation membership', async () => {
    const conversationFindFirst = vi.fn().mockResolvedValue({
      id: 'conversation-a',
      participant1: 'buyer-a',
      participant2: 'merchant-a',
    });
    const where = vi.fn().mockResolvedValue([]);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const service = new DisputesService(
      { db: { query: { conversations: { findFirst: conversationFindFirst } }, update } } as any,
      {} as any,
    );

    await expect(service.markMessagesRead('conversation-a', 'buyer-a')).resolves.toEqual({ success: true });
    const compiled = new PgDialect().sqlToQuery(where.mock.calls[0]?.[0]);
    expect(compiled.params).toContain('buyer-a');

    await expect(service.markMessagesRead('conversation-a', 'attacker')).rejects.toBeInstanceOf(NotFoundException);
    expect(where).toHaveBeenCalledOnce();
  });

  it('rejects dispute creation by users unrelated to the order', async () => {
    const orderFindFirst = vi.fn().mockResolvedValue({
      id: 'order-a',
      buyerId: 'buyer-a',
      storeId: 'store-a',
      status: 'DELIVERED',
      updatedAt: new Date(),
      createdAt: new Date(),
    });
    const storeMemberFindFirst = vi.fn().mockResolvedValue(null);
    const insert = vi.fn();
    const service = new DisputesService(
      { db: { query: { orders: { findFirst: orderFindFirst }, storeMembers: { findFirst: storeMemberFindFirst } }, insert } } as any,
      {} as any,
    );

    await expect(
      service.createDispute({
        orderId: 'order-a',
        raisedBy: 'attacker',
        againstId: 'merchant-a',
        reason: 'Not delivered',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(insert).not.toHaveBeenCalled();
  });

  it('requires a participant or privileged moderator to submit a response', async () => {
    const disputeFindFirst = vi.fn().mockResolvedValue({
      id: 'dispute-a',
      raisedBy: 'buyer-a',
      againstId: 'merchant-a',
      status: 'OPEN',
    });
    const update = vi.fn();
    const service = new DisputesService(
      { db: { query: { disputes: { findFirst: disputeFindFirst } }, update } } as any,
      {} as any,
    );

    await expect(
      service.submitResponse('dispute-a', 'attacker', 'response', attacker as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });
});
