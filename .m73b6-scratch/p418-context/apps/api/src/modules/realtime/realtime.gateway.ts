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

/**
 * Realtime WebSocket Gateway — `/realtime`
 *
 * Rooms:
 *   user:{userId}   — personal notifications, order updates
 *   org:{orgId}     — org-wide broadcasts (merchant dashboard)
 *   order:{orderId} — order-specific live updates (tracking, status)
 *
 * Events emitted:
 *   order.status.changed  — { orderId, status, timestamp }
 *   notification.new      — { notificationId, type, title, body }
 *
 * Authentication: every handshake must present a valid, non-revoked access
 * token (see handleConnection). A socket is auto-bound to its own `user:{sub}`
 * room and the `join` handler refuses to subscribe it to another user's
 * personal room, so notifications (which carry order/verification/promo
 * detail) can never be snooped by an unrelated client.
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

    let payload: { sub?: string; activeOrg?: string; jti?: string };
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

  /** Client joins rooms after authentication */
  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { rooms: string[] },
  ) {
    const userId = client.data['userId'] as string | undefined;
    const joined: string[] = [];
    for (const room of data.rooms ?? []) {
      // Validate room format: user:{id}, org:{id}, order:{id}
      const match = /^(user|org|order):(.+)$/.exec(room);
      if (!match) continue;
      const [, scope, id] = match;
      // A socket may only join its OWN personal room — that channel carries
      // notifications (order/verification/promo detail). Org and order rooms
      // only receive low-sensitivity order-status broadcasts, so any
      // authenticated socket may subscribe (e.g. a merchant dashboard joining
      // `org:{storeId}` for its stores, or a tracking page joining
      // `order:{orderId}`).
      if (scope === 'user' && id !== userId) {
        this.logger.debug(`Client ${client.id} denied join to ${room}`);
        continue;
      }
      client.join(room);
      joined.push(room);
      this.logger.debug(`Client ${client.id} joined room ${room}`);
    }
    return { event: 'joined', data: { rooms: joined } };
  }

  @SubscribeMessage('leave')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { rooms: string[] },
  ) {
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
  emitNotification(userId: string, notification: { id: string; type: string; title: string; body: string }) {
    this.server.to(`user:${userId}`).emit('notification.new', {
      notificationId: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
    });
  }

  /**
   * Emit a low-sensitivity "new order" signal to the selling store's room so a
   * merchant dashboard can raise a toast/banner. Carries no buyer PII — the org
   * room is joinable by any authenticated socket (see handleJoin), so the
   * dashboard fetches full detail through the guarded REST endpoints using the
   * ids in this payload.
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
