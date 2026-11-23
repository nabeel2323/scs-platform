import { describe, it, expect, vi } from 'vitest';
import { RealtimeGateway } from '../../../modules/realtime/realtime.gateway';

const ids = {
  user: '11111111-1111-4111-8111-111111111111',
  otherUser: '22222222-2222-4222-8222-222222222222',
  org: '33333333-3333-4333-8333-333333333333',
  otherOrg: '44444444-4444-4444-8444-444444444444',
  store: '55555555-5555-4555-8555-555555555555',
  order: '66666666-6666-4666-8666-666666666666',
  masterOrder: '77777777-7777-4777-8777-777777777777',
};

/**
 * Realtime gateway unit tests (WEB-B6 / realtime gap).
 *
 * The gateway authenticates every Socket.IO handshake with the same access
 * token + Redis denylist the HTTP guard uses (API-B9), binds the socket to its
 * own `user:{sub}` room, and refuses cross-user personal-room joins so one
 * client can never snoop another's notifications. The emit helpers fan
 * order-status and notification events out to the correct rooms.
 */

interface MockSocketOpts {
  auth?: Record<string, unknown>;
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

function mockSocket(opts: MockSocketOpts = {}) {
  return {
    id: 'sock-1',
    handshake: {
      auth: opts.auth ?? {},
      query: opts.query ?? {},
      headers: opts.headers ?? {},
    },
    data: opts.data ?? {},
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  } as any;
}

function createGateway() {
  const jwt = { verify: vi.fn() };
  const redis = { client: { get: vi.fn().mockResolvedValue(null) } };
  const query = {
    stores: { findFirst: vi.fn().mockResolvedValue({ id: ids.store, orgId: ids.org }) },
    storeMembers: { findFirst: vi.fn().mockResolvedValue({ id: 'membership-1' }) },
  };
  const db = { db: { query } };
  const merchant = {
    getStore: vi.fn().mockResolvedValue({ id: ids.store, orgId: ids.org }),
  };
  const orderAccess = {
    getRoomAccess: vi.fn().mockResolvedValue({
      kind: 'order',
      buyerId: ids.otherUser,
      storeId: ids.store,
    }),
    isDriverAssignedToOrder: vi.fn().mockResolvedValue(false),
  };
  const gateway = new RealtimeGateway(
    jwt as any,
    redis as any,
    db as any,
    merchant as any,
    orderAccess as any,
  );
  // Mock the Socket.IO server: `server.to(room).emit(event, payload)`.
  const roomEmit = vi.fn();
  const to = vi.fn((_room: string) => ({ emit: roomEmit }));
  (gateway as any).server = { to };
  return { gateway, jwt, redis, to, roomEmit, query, merchant, orderAccess };
}

// ── Handshake authentication ─────────────────────────────────────
describe('RealtimeGateway — handshake authentication', () => {
  it('rejects a socket that presents no token', async () => {
    const { gateway, jwt } = createGateway();
    const client = mockSocket();
    await gateway.handleConnection(client);
    expect(jwt.verify).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.emit).toHaveBeenCalledWith('unauthorized', { message: 'Missing access token' });
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rejects a token that fails signature/expiry verification', async () => {
    const { gateway, jwt } = createGateway();
    jwt.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });
    const client = mockSocket({ auth: { token: 'bad.token' } });
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.emit).toHaveBeenCalledWith('unauthorized', {
      message: 'Invalid or expired access token',
    });
  });

  it('rejects a valid-signature token whose jti is denylisted', async () => {
    const { gateway, jwt, redis } = createGateway();
    jwt.verify.mockReturnValue({ sub: 'u1', jti: 'j-revoked' });
    redis.client.get.mockResolvedValue('1');
    const client = mockSocket({ auth: { token: 'revoked.token' } });
    await gateway.handleConnection(client);
    expect(redis.client.get).toHaveBeenCalledWith('jwt:deny:j-revoked');
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.emit).toHaveBeenCalledWith('unauthorized', {
      message: 'Access token has been revoked',
    });
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rejects a verified token with no subject claim', async () => {
    const { gateway, jwt } = createGateway();
    jwt.verify.mockReturnValue({ jti: 'j-1' });
    const client = mockSocket({ auth: { token: 'nosub.token' } });
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.emit).toHaveBeenCalledWith('unauthorized', { message: 'Token missing subject' });
  });

  it('binds an authenticated socket to its own user room', async () => {
    const { gateway, jwt, redis } = createGateway();
    jwt.verify.mockReturnValue({
      sub: ids.user,
      activeOrg: ids.org,
      role: 'MERCHANT_OWNER',
      perms: ['merchant:orders:read'],
      jti: 'j-1',
    });
    const client = mockSocket({ auth: { token: 'good.token' } });
    await gateway.handleConnection(client);
    expect(redis.client.get).toHaveBeenCalledWith('jwt:deny:j-1');
    expect(client.join).toHaveBeenCalledWith(`user:${ids.user}`);
    expect(client.data['userId']).toBe(ids.user);
    expect(client.data['activeOrg']).toBe(ids.org);
    expect(client.data['role']).toBe('MERCHANT_OWNER');
    expect(client.data['perms']).toEqual(['merchant:orders:read']);
    expect(client.emit).toHaveBeenCalledWith('authenticated', { userId: ids.user });
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('accepts a token supplied via the Authorization header', async () => {
    const { gateway, jwt } = createGateway();
    jwt.verify.mockReturnValue({ sub: ids.otherUser });
    const client = mockSocket({ headers: { authorization: 'Bearer header.token' } });
    await gateway.handleConnection(client);
    expect(jwt.verify).toHaveBeenCalledWith('header.token');
    expect(client.join).toHaveBeenCalledWith(`user:${ids.otherUser}`);
    expect(client.data['activeOrg']).toBeNull();
  });
});

// ── Join authorization ───────────────────────────────────────────
describe('RealtimeGateway — join authorization', () => {
  it('allows a current store member with merchant:orders:read into their store and order rooms', async () => {
    const { gateway } = createGateway();
    const client = mockSocket({
      data: {
        userId: ids.user,
        role: 'MERCHANT_OWNER',
        activeOrg: ids.org,
        perms: ['merchant:orders:read'],
      },
    });
    const res = await gateway.handleJoin(client, {
      rooms: [`user:${ids.user}`, `org:${ids.store}`, `order:${ids.order}`],
    });
    expect(client.join).toHaveBeenCalledWith(`user:${ids.user}`);
    expect(client.join).toHaveBeenCalledWith(`org:${ids.store}`);
    expect(client.join).toHaveBeenCalledWith(`order:${ids.order}`);
    expect(res).toEqual({
      event: 'joined',
      data: { rooms: [`user:${ids.user}`, `org:${ids.store}`, `order:${ids.order}`] },
    });
  });

  it("refuses to join another user's personal room", async () => {
    const { gateway } = createGateway();
    const client = mockSocket({ data: { userId: ids.user } });
    const res = await gateway.handleJoin(client, { rooms: [`user:${ids.otherUser}`] });
    expect(client.join).not.toHaveBeenCalled();
    expect(res).toEqual({ event: 'joined', data: { rooms: [] } });
  });

  it('rejects slug-based store room identifiers', async () => {
    const { gateway, merchant } = createGateway();
    merchant.getStore.mockResolvedValue({ id: ids.store, orgId: ids.org });
    const client = mockSocket({
      data: {
        userId: ids.user,
        role: 'MERCHANT_OWNER',
        activeOrg: ids.org,
        perms: ['merchant:orders:read'],
      },
    });

    const result = await gateway.handleJoin(client, { rooms: ['org:store-slug'] });

    expect(result.data.rooms).toEqual([]);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('denies merchant store rooms without merchant:orders:read', async () => {
    const { gateway } = createGateway();
    const client = mockSocket({
      data: {
        userId: ids.user,
        role: 'MERCHANT_OWNER',
        activeOrg: ids.org,
        perms: ['merchant:stores:read'],
      },
    });
    const result = await gateway.handleJoin(client, {
      rooms: [`org:${ids.store}`, `order:${ids.order}`],
    });
    expect(result.data.rooms).toEqual([]);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('denies store and order rooms for a foreign active organization or missing membership', async () => {
    const foreign = createGateway();
    foreign.query.stores.findFirst.mockResolvedValue({ id: ids.store, orgId: ids.otherOrg });
    foreign.merchant.getStore.mockResolvedValue({ id: ids.store, orgId: ids.otherOrg });
    const foreignSocket = mockSocket({
      data: {
        userId: ids.user,
        role: 'MERCHANT_OWNER',
        activeOrg: ids.org,
        perms: ['merchant:orders:read'],
      },
    });
    const foreignResult = await foreign.gateway.handleJoin(foreignSocket, {
      rooms: [`org:${ids.store}`, `order:${ids.order}`],
    });
    expect(foreignResult.data.rooms).toEqual([]);

    const noMember = createGateway();
    noMember.query.storeMembers.findFirst.mockResolvedValue(null);
    const noMemberSocket = mockSocket({
      data: {
        userId: ids.user,
        role: 'MERCHANT_STAFF',
        activeOrg: ids.org,
        perms: ['merchant:orders:read'],
      },
    });
    const noMemberResult = await noMember.gateway.handleJoin(noMemberSocket, {
      rooms: [`org:${ids.store}`, `order:${ids.order}`],
    });
    expect(noMemberResult.data.rooms).toEqual([]);
  });

  it('allows buyers to join only their own order rooms, including master-order tracking', async () => {
    const { gateway, orderAccess } = createGateway();
    const client = mockSocket({
      data: { userId: ids.user, role: 'BUYER', activeOrg: null, perms: ['orders:read'] },
    });
    orderAccess.getRoomAccess.mockResolvedValue({
      kind: 'order',
      buyerId: ids.user,
      storeId: ids.store,
    });
    const own = await gateway.handleJoin(client, { rooms: [`order:${ids.order}`] });
    expect(own.data.rooms).toEqual([`order:${ids.order}`]);

    orderAccess.getRoomAccess.mockResolvedValue({
      kind: 'masterOrder',
      buyerId: ids.user,
    });
    const master = await gateway.handleJoin(client, { rooms: [`order:${ids.masterOrder}`] });
    expect(master.data.rooms).toEqual([`order:${ids.masterOrder}`]);

    orderAccess.getRoomAccess.mockResolvedValue({
      kind: 'order',
      buyerId: ids.otherUser,
      storeId: ids.store,
    });
    const foreign = await gateway.handleJoin(client, { rooms: [`order:${ids.order}`] });
    expect(foreign.data.rooms).toEqual([]);
  });

  it('allows drivers to join only orders with an assigned shipment', async () => {
    const { gateway, orderAccess } = createGateway();
    const client = mockSocket({
      data: {
        userId: ids.user,
        role: 'DRIVER',
        activeOrg: null,
        perms: ['fulfillment:shipments:read'],
      },
    });
    orderAccess.isDriverAssignedToOrder.mockResolvedValue(true);
    const assigned = await gateway.handleJoin(client, { rooms: [`order:${ids.order}`] });
    expect(assigned.data.rooms).toEqual([`order:${ids.order}`]);

    orderAccess.isDriverAssignedToOrder.mockResolvedValue(false);
    const unassigned = await gateway.handleJoin(client, { rooms: [`order:${ids.order}`] });
    expect(unassigned.data.rooms).toEqual([]);
  });

  it('keeps platform staff permission-gated and rejects foreign personal rooms', async () => {
    const { gateway } = createGateway();
    const client = mockSocket({
      data: { userId: ids.user, role: 'ADMIN', activeOrg: null, perms: ['orders:read'] },
    });
    const res = await gateway.handleJoin(client, {
      rooms: [`org:${ids.store}`, `order:${ids.order}`, `user:${ids.otherUser}`],
    });
    expect(res.data.rooms).toEqual([`org:${ids.store}`, `order:${ids.order}`]);
  });

  it('ignores malformed room names', async () => {
    const { gateway } = createGateway();
    const client = mockSocket({ data: { userId: ids.user } });
    const res = await gateway.handleJoin(client, { rooms: ['bogus', 'user:', 'channel:u1'] });
    expect(client.join).not.toHaveBeenCalled();
    expect(res).toEqual({ event: 'joined', data: { rooms: [] } });
  });
});

// ── Emit helpers ─────────────────────────────────────────────────
describe('RealtimeGateway — emit helpers', () => {
  it('fans an order-status change to the order, buyer and store rooms', () => {
    const { gateway, to, roomEmit } = createGateway();
    gateway.emitOrderStatusChanged('o-1', 'ACCEPTED', 'buyer-1', 'store-1');
    expect(to.mock.calls.map((c) => c[0])).toEqual(['order:o-1', 'user:buyer-1', 'org:store-1']);
    expect(roomEmit).toHaveBeenCalledTimes(3);
    expect(roomEmit.mock.calls[0]![0]).toBe('order.status.changed');
    expect(roomEmit.mock.calls[0]![1]).toMatchObject({ orderId: 'o-1', status: 'ACCEPTED' });
  });

  it('skips the buyer/store rooms when their ids are absent', () => {
    const { gateway, to } = createGateway();
    gateway.emitOrderStatusChanged('o-1', 'READY');
    expect(to.mock.calls.map((c) => c[0])).toEqual(['order:o-1']);
  });

  it('emits a new notification to the user room', () => {
    const { gateway, to, roomEmit } = createGateway();
    gateway.emitNotification('u1', {
      id: 'n-1',
      type: 'TRANSACTIONAL',
      title: 'Order Accepted',
      body: 'Your order has been accepted.',
    });
    expect(to).toHaveBeenCalledWith('user:u1');
    expect(roomEmit).toHaveBeenCalledWith('notification.new', {
      notificationId: 'n-1',
      type: 'TRANSACTIONAL',
      title: 'Order Accepted',
      body: 'Your order has been accepted.',
    });
  });

  it('emits a new_order signal scoped to the selling store room', () => {
    const { gateway, to, roomEmit } = createGateway();
    gateway.emitNewOrder('store-9', {
      masterOrderId: 'm-1',
      orderId: 'o-1',
      storeId: 'store-9',
      totalMinor: 12500,
      itemCount: 3,
      createdAt: '2026-09-23T10:00:00.000Z',
    });
    expect(to).toHaveBeenCalledWith('org:store-9');
    expect(roomEmit).toHaveBeenCalledWith('new_order', {
      masterOrderId: 'm-1',
      orderId: 'o-1',
      storeId: 'store-9',
      totalMinor: 12500,
      itemCount: 3,
      createdAt: '2026-09-23T10:00:00.000Z',
    });
  });
});
