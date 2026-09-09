import { describe, it, expect, vi } from 'vitest';
import { RealtimeGateway } from '../../../modules/realtime/realtime.gateway';

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
  const gateway = new RealtimeGateway(jwt as any, redis as any);
  // Mock the Socket.IO server: `server.to(room).emit(event, payload)`.
  const roomEmit = vi.fn();
  const to = vi.fn((_room: string) => ({ emit: roomEmit }));
  (gateway as any).server = { to };
  return { gateway, jwt, redis, to, roomEmit };
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
    jwt.verify.mockReturnValue({ sub: 'u1', activeOrg: 'org-9', jti: 'j-1' });
    const client = mockSocket({ auth: { token: 'good.token' } });
    await gateway.handleConnection(client);
    expect(redis.client.get).toHaveBeenCalledWith('jwt:deny:j-1');
    expect(client.join).toHaveBeenCalledWith('user:u1');
    expect(client.data['userId']).toBe('u1');
    expect(client.data['activeOrg']).toBe('org-9');
    expect(client.emit).toHaveBeenCalledWith('authenticated', { userId: 'u1' });
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('accepts a token supplied via the Authorization header', async () => {
    const { gateway, jwt } = createGateway();
    jwt.verify.mockReturnValue({ sub: 'u2' });
    const client = mockSocket({ headers: { authorization: 'Bearer header.token' } });
    await gateway.handleConnection(client);
    expect(jwt.verify).toHaveBeenCalledWith('header.token');
    expect(client.join).toHaveBeenCalledWith('user:u2');
    expect(client.data['activeOrg']).toBeNull();
  });
});

// ── Join authorization ───────────────────────────────────────────
describe('RealtimeGateway — join authorization', () => {
  it('allows the socket to join its own user room plus org and order rooms', () => {
    const { gateway } = createGateway();
    const client = mockSocket({ data: { userId: 'u1', activeOrg: 'org-1' } });
    const res = gateway.handleJoin(client, { rooms: ['user:u1', 'org:org-1', 'order:o-1'] });
    expect(client.join).toHaveBeenCalledWith('user:u1');
    expect(client.join).toHaveBeenCalledWith('org:org-1');
    expect(client.join).toHaveBeenCalledWith('order:o-1');
    expect(res).toEqual({
      event: 'joined',
      data: { rooms: ['user:u1', 'org:org-1', 'order:o-1'] },
    });
  });

  it("refuses to join another user's personal room", () => {
    const { gateway } = createGateway();
    const client = mockSocket({ data: { userId: 'u1' } });
    const res = gateway.handleJoin(client, { rooms: ['user:u2'] });
    expect(client.join).not.toHaveBeenCalled();
    expect(res).toEqual({ event: 'joined', data: { rooms: [] } });
  });

  it('ignores malformed room names', () => {
    const { gateway } = createGateway();
    const client = mockSocket({ data: { userId: 'u1' } });
    const res = gateway.handleJoin(client, { rooms: ['bogus', 'user:', 'channel:u1'] });
    expect(client.join).not.toHaveBeenCalled();
    expect(res).toEqual({ event: 'joined', data: { rooms: [] } });
  });
});

// ── Emit helpers ─────────────────────────────────────────────────
describe('RealtimeGateway — emit helpers', () => {
  it('fans an order-status change to the order, buyer and store rooms', () => {
    const { gateway, to, roomEmit } = createGateway();
    gateway.emitOrderStatusChanged('o-1', 'ACCEPTED', 'buyer-1', 'store-1');
    expect(to.mock.calls.map((c) => c[0])).toEqual([
      'order:o-1',
      'user:buyer-1',
      'org:store-1',
    ]);
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
});
