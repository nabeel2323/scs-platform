import {
  WebSocketGateway as WsGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { RedisService } from '../../common/redis/redis.service';
import { denylistKey } from '../../common/auth/token-denylist';
import { DatabaseService } from '../../common/database/database.service';
import {
  assertStoreInOrg,
  assertStoreMember,
  isTenantPrivileged,
  type CallerContext,
} from '../../common/tenant-scope';
import { MerchantService } from '../merchant/index';
import { OrderRealtimeAccessService } from '../orders/index';

/**
 * Realtime WebSocket Gateway — `/realtime`
 *
 * Rooms:
 *   user:{userId}   — personal notifications, order updates
 *   org:{storeId}   — store-scoped broadcasts (merchant dashboard)
 *   order:{orderId} — order-specific live updates (tracking, status)
 *
 * Events emitted:
 *   order.status.changed  — { orderId, status, timestamp }
 *   notification.new      — { notificationId, type, title, body }
 *
 * Authentication: every handshake must present a valid, non-revoked access
 * token (see handleConnection). A socket is auto-bound to its own `user:{sub}`
 * room. Additional store/order room joins are checked against active store
 * membership, order ownership or shipment assignment, and JWT permissions.
 */
@WsGateway({
  namespace: '/realtime',
  cors: {
    origin: process.env['API_CORS_ORIGINS']?.split(',') || ['http://localhost:3100'],
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly db: DatabaseService,
    private readonly merchant: MerchantService,
    private readonly orderAccess: OrderRealtimeAccessService,
  ) {}

  afterInit() {
    this.logger.log('WebSocket gateway initialized at /realtime');
  }

  /**
   * Authenticate the handshake before any room traffic. The client presents its
   * access token via `auth: { token }` (preferred), the `token` query param, or
   * an `Authorization: Bearer` header. We verify signature/expiry and honour the
   * same Redis denylist the HTTP guard uses (API-B9), so a token revoked on
   * switchOrg cannot open a realtime session. On success the socket is bound to
   * `user:{sub}` and its identity is stashed on `client.data` for join checks.
   */
  async handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      this.reject(client, 'Missing access token');
      return;
    }

    let payload: {
      sub?: string;
      activeOrg?: string | null;
      jti?: string;
      role?: string;
      perms?: unknown;
    };
    try {
      payload = this.jwt.verify(token);
    } catch {
      this.reject(client, 'Invalid or expired access token');
      return;
    }

    // Reject tokens explicitly revoked before expiry (mirrors JwtAuthGuard).
    if (payload.jti) {
      const revoked = await this.redis.client.get(denylistKey(payload.jti));
      if (revoked) {
        this.reject(client, 'Access token has been revoked');
        return;
      }
    }

    if (!payload.sub) {
      this.reject(client, 'Token missing subject');
      return;
    }

    client.data['userId'] = payload.sub;
    client.data['activeOrg'] = payload.activeOrg ?? null;
    client.data['role'] = payload.role ?? null;
    client.data['perms'] = Array.isArray(payload.perms)
      ? payload.perms.filter((permission): permission is string => typeof permission === 'string')
      : [];

    // Auto-join the caller's personal room so user-scoped events (their
    // notifications and order updates) flow without an explicit join.
    client.join(`user:${payload.sub}`);

    this.logger.debug(`Client ${client.id} authenticated as user ${payload.sub}`);
    client.emit('authenticated', { userId: payload.sub });
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  /** Pull the access token from handshake auth, query, or Authorization header. */
  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    if (typeof auth?.token === 'string' && auth.token) return auth.token;

    const query = client.handshake.query as { token?: unknown } | undefined;
    if (typeof query?.token === 'string' && query.token) return query.token;

    const header = client.handshake.headers?.['authorization'];
    if (typeof header === 'string') {
      const [type, token] = header.split(' ');
      if (type === 'Bearer' && token) return token;
    }
    return undefined;
  }

  /** Emit an `unauthorized` event and drop the socket. */
  private reject(client: Socket, message: string) {
    this.logger.debug(`Rejecting socket ${client.id}: ${message}`);
    client.emit('unauthorized', { message });
    client.disconnect(true);
  }

  // ── Room management ──────────────────────────────────────────

  /** Client joins rooms only after scope-specific authorization. */
  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() data: { rooms: string[] }) {
    const caller = this.callerFromSocket(client);
    const joined: string[] = [];
    if (!caller) return { event: 'joined', data: { rooms: joined } };

    for (const room of data.rooms ?? []) {
      // All room identifiers are UUIDs: user:{id}, org:{storeId}, order:{id}.
      const match =
        /^(user|org|order):([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(
          room,
        );
      if (!match) continue;
      const scope = match[1];
      const id = match[2];
      if (!scope || !id) continue;

      let allowed = false;
      try {
        if (scope === 'user') {
          allowed = id === caller.sub;
        } else if (scope === 'org') {
          allowed = await this.withSocketActor(caller, () =>
            this.canJoinStoreRoom(client, caller, id),
          );
        } else if (scope === 'order') {
          allowed = await this.withSocketActor(caller, () =>
            this.canJoinOrderRoom(client, caller, id),
          );
        }
      } catch {
        // Fail closed without disclosing whether a foreign room exists.
        allowed = false;
      }

      if (!allowed) {
        this.logger.debug(`Client ${client.id} denied join to ${room}`);
        continue;
      }

      client.join(room);
      joined.push(room);
      this.logger.debug(`Client ${client.id} joined room ${room}`);
    }
    return { event: 'joined', data: { rooms: joined } };
  }

  private withSocketActor<T>(caller: CallerContext, operation: () => Promise<T>): Promise<T> {
    return this.db.withActorContext(
      {
        actorKind: 'user',
        actorId: caller.sub,
        actorRole: caller.role ?? 'UNKNOWN',
        activeOrgId: caller.activeOrg,
      },
      operation,
    );
  }

  private callerFromSocket(client: Socket): CallerContext | null {
    const sub = client.data['userId'];
    if (typeof sub !== 'string' || !sub) return null;
    const role = client.data['role'];
    const activeOrg = client.data['activeOrg'];
    return {
      sub,
      role: typeof role === 'string' ? role : null,
      activeOrg: typeof activeOrg === 'string' ? activeOrg : null,
    };
  }

  private socketPermissions(client: Socket): string[] {
    const permissions = client.data['perms'];
    return Array.isArray(permissions)
      ? permissions.filter((permission): permission is string => typeof permission === 'string')
      : [];
  }

  /** Store rooms carry merchant order signals; require order-read permission
   * plus current active-store membership, not merely a valid JWT. */
  private async canJoinStoreRoom(
    client: Socket,
    caller: CallerContext,
    storeId: string,
  ): Promise<boolean> {
    const permissions = this.socketPermissions(client);
    const privileged = isTenantPrivileged(caller);
    if (
      !permissions.includes('merchant:orders:read') &&
      !(privileged && permissions.includes('orders:read'))
    ) {
      return false;
    }

    let store: Awaited<ReturnType<MerchantService['getStore']>>;
    try {
      store = await this.merchant.getStore(storeId);
    } catch {
      return false;
    }
    // Room identifiers are canonical store IDs, not public slugs.
    if (store.id !== storeId) return false;
    if (privileged) return true;

    try {
      await assertStoreInOrg(this.db, caller, storeId);
      await assertStoreMember(this.db, caller, storeId);
      return true;
    } catch {
      return false;
    }
  }

  /** Order rooms are limited to the buyer, an active member of the fulfilling
   * store, an assigned driver, or platform staff with the matching read grant. */
  private async canJoinOrderRoom(
    client: Socket,
    caller: CallerContext,
    orderId: string,
  ): Promise<boolean> {
    const permissions = this.socketPermissions(client);
    const roomAccess = await this.orderAccess.getRoomAccess(orderId);
    if (!roomAccess) return false;

    if (roomAccess.kind === 'masterOrder') {
      // Buyer tracking may use the master-order identifier rather than a
      // merchant sub-order identifier.
      if (isTenantPrivileged(caller)) return permissions.includes('orders:read');
      return roomAccess.buyerId === caller.sub && permissions.includes('orders:read');
    }

    if (isTenantPrivileged(caller)) {
      return permissions.includes('orders:read') || permissions.includes('merchant:orders:read');
    }

    if (roomAccess.buyerId === caller.sub && permissions.includes('orders:read')) {
      return true;
    }

    if (
      (caller.role === 'MERCHANT_OWNER' || caller.role === 'MERCHANT_STAFF') &&
      permissions.includes('merchant:orders:read')
    ) {
      try {
        await assertStoreInOrg(this.db, caller, roomAccess.storeId);
        await assertStoreMember(this.db, caller, roomAccess.storeId);
        return true;
      } catch {
        return false;
      }
    }

    if (caller.role === 'DRIVER' && permissions.includes('fulfillment:shipments:read')) {
      return this.orderAccess.isDriverAssignedToOrder(orderId, caller.sub);
    }

    return false;
  }

  @SubscribeMessage('leave')
  handleLeave(@ConnectedSocket() client: Socket, @MessageBody() data: { rooms: string[] }) {
    for (const room of data.rooms ?? []) {
      client.leave(room);
    }
    return { event: 'left', data: { rooms: data.rooms } };
  }

  // ── Public emit helpers (called by services) ─────────────────

  /** Emit order status change to order room + user room */
  emitOrderStatusChanged(orderId: string, status: string, buyerId?: string, storeId?: string) {
    const payload = { orderId, status, timestamp: new Date().toISOString() };

    // To order-specific room
    this.server.to(`order:${orderId}`).emit('order.status.changed', payload);

    // To buyer's personal room
    if (buyerId) {
      this.server.to(`user:${buyerId}`).emit('order.status.changed', payload);
    }

    // To merchant org room
    if (storeId) {
      this.server.to(`org:${storeId}`).emit('order.status.changed', payload);
    }
  }

  /** Emit new notification to user room */
  emitNotification(
    userId: string,
    notification: { id: string; type: string; title: string; body: string },
  ) {
    this.server.to(`user:${userId}`).emit('notification.new', {
      notificationId: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
    });
  }

  /**
   * Emit a low-sensitivity "new order" signal to the selling store's room so a
   * merchant dashboard can raise a toast/banner. Carries no buyer PII; the org
   * room is restricted to active store members with merchant:orders:read.
   */
  emitNewOrder(
    storeId: string,
    payload: {
      masterOrderId: string;
      orderId: string;
      storeId: string;
      totalMinor: number;
      itemCount: number;
      createdAt: string;
    },
  ) {
    this.server.to(`org:${storeId}`).emit('new_order', payload);
  }
}
