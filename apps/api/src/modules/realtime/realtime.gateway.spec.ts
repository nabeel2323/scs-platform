import { describe, expect, it, vi } from 'vitest';
import type { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import type { DatabaseService } from '../../common/database/database.service';
import type { RedisService } from '../../common/redis/redis.service';
import { RealtimeGateway } from './realtime.gateway';

const ids = {
  user: '11111111-1111-4111-8111-111111111111',
  otherUser: '22222222-2222-4222-8222-222222222222',
  org: '33333333-3333-4333-8333-333333333333',
  otherOrg: '44444444-4444-4444-8444-444444444444',
  store: '55555555-5555-4555-8555-555555555555',
  order: '66666666-6666-4666-8666-666666666666',
  masterOrder: '77777777-7777-4777-8777-777777777777',
};

function setup(
  identity: {
    userId?: string;
    role?: string;
    activeOrg?: string | null;
    perms?: string[];
  } = {},
) {
  const query = {
    stores: { findFirst: vi.fn().mockResolvedValue({ id: ids.store, orgId: ids.org }) },
    storeMembers: { findFirst: vi.fn().mockResolvedValue({ id: 'membership-1' }) },
    orders: {
      findFirst: vi.fn().mockResolvedValue({ buyerId: ids.otherUser, storeId: ids.store }),
    },
    masterOrders: { findFirst: vi.fn().mockResolvedValue(null) },
    shipments: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  const db = { db: { query } } as unknown as DatabaseService;
  const gateway = new RealtimeGateway({} as JwtService, {} as RedisService, db);
  const socket = {
    id: 'socket-1',
    data: {
      userId: identity.userId ?? ids.user,
      role: identity.role ?? 'MERCHANT_OWNER',
      activeOrg: identity.activeOrg === undefined ? ids.org : identity.activeOrg,
      perms: identity.perms ?? ['merchant:orders:read'],
    },
    join: vi.fn(),
  } as unknown as Socket;
  return { gateway, socket, query };
}

describe('RealtimeGateway room authorization', () => {
  it('allows only an active merchant store member with merchant:orders:read into store and order rooms', async () => {
    const { gateway, socket } = setup();

    const result = await gateway.handleJoin(socket, {
      rooms: [
        `org:${ids.store}`,
        `order:${ids.order}`,
        `user:${ids.user}`,
      ],
    });

    expect(result.data.rooms).toEqual([
      `org:${ids.store}`,
      `order:${ids.order}`,
      `user:${ids.user}`,
    ]);
    expect(socket.join).toHaveBeenCalledTimes(3);
  });

  it('denies foreign organization rooms and orders when active organization does not own the store', async () => {
    const { gateway, socket, query } = setup();
    query.stores.findFirst.mockResolvedValue({
      id: ids.store,
      orgId: ids.otherOrg,
    });

    const result = await gateway.handleJoin(socket, {
      rooms: [`org:${ids.store}`, `order:${ids.order}`],
    });

    expect(result.data.rooms).toEqual([]);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('denies merchant room joins when active store membership is missing', async () => {
    const { gateway, socket, query } = setup();
    query.storeMembers.findFirst.mockResolvedValue(null);

    const result = await gateway.handleJoin(socket, {
      rooms: [`org:${ids.store}`, `order:${ids.order}`],
    });

    expect(result.data.rooms).toEqual([]);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('allows a buyer to join only their own sub-order or master-order room', async () => {
    const { gateway, socket, query } = setup({
      role: 'BUYER',
      activeOrg: null,
      perms: ['orders:read'],
    });
    query.orders.findFirst.mockResolvedValue({
      buyerId: ids.user,
      storeId: ids.store,
    });

    const ownOrder = await gateway.handleJoin(socket, {
      rooms: [`order:${ids.order}`, `org:${ids.store}`],
    });
    expect(ownOrder.data.rooms).toEqual([`order:${ids.order}`]);

    query.orders.findFirst.mockResolvedValue(null);
    query.masterOrders.findFirst.mockResolvedValue({ buyerId: ids.user });
    const ownMasterOrder = await gateway.handleJoin(socket, {
      rooms: [`order:${ids.masterOrder}`],
    });
    expect(ownMasterOrder.data.rooms).toEqual([`order:${ids.masterOrder}`]);

    query.orders.findFirst.mockResolvedValue({
      buyerId: ids.otherUser,
      storeId: ids.store,
    });
    const foreignOrder = await gateway.handleJoin(socket, {
      rooms: [`order:${ids.order}`],
    });
    expect(foreignOrder.data.rooms).toEqual([]);
  });

  it('allows a driver to join only an order with a shipment assigned to that driver', async () => {
    const { gateway, socket, query } = setup({
      role: 'DRIVER',
      activeOrg: null,
      perms: ['fulfillment:shipments:read'],
    });
    query.shipments.findFirst.mockResolvedValue({ id: 'shipment-1' });

    const allowed = await gateway.handleJoin(socket, {
      rooms: [`order:${ids.order}`],
    });
    expect(allowed.data.rooms).toEqual([`order:${ids.order}`]);

    query.shipments.findFirst.mockResolvedValue(null);
    const denied = await gateway.handleJoin(socket, {
      rooms: [`order:${ids.order}`],
    });
    expect(denied.data.rooms).toEqual([]);
  });

  it('keeps platform staff permission-gated and rejects another user personal room', async () => {
    const { gateway, socket } = setup({
      role: 'ADMIN',
      activeOrg: null,
      perms: ['orders:read'],
    });

    const result = await gateway.handleJoin(socket, {
      rooms: [`org:${ids.store}`, `user:${ids.otherUser}`],
    });

    expect(result.data.rooms).toEqual([`org:${ids.store}`]);
  });
});
