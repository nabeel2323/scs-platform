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
import { Server, Socket } from 'socket.io';

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

  afterInit() {
    this.logger.log('WebSocket gateway initialized at /realtime');
  }

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  // ── Room management ──────────────────────────────────────────

  /** Client joins rooms after authentication */
  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { rooms: string[] },
  ) {
    for (const room of data.rooms ?? []) {
      // Validate room format: user:{id}, org:{id}, order:{id}
      if (/^(user|org|order):.+$/.test(room)) {
        client.join(room);
        this.logger.debug(`Client ${client.id} joined room ${room}`);
      }
    }
    return { event: 'joined', data: { rooms: data.rooms } };
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
}
