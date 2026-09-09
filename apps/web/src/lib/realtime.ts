/**
 * Realtime client — Socket.IO connection to the API `/realtime` gateway.
 *
 * Retires the old unread-count / order-status polling (WEB-B6). A single shared
 * socket is authenticated with the current access token; the gateway verifies it
 * (signature + Redis denylist) and auto-joins the caller's own `user:{id}` room,
 * so `notification.new` and the user's own `order.status.changed` events arrive
 * with no explicit join. An order-tracking page can additionally subscribe to a
 * specific `order:{id}` room via `watchOrder`.
 *
 * SSR-safe: no socket is created until a helper runs in the browser. The socket
 * is a module singleton shared across components; the handshake token is kept in
 * sync with auth state so a refresh reconnects cleanly and a logout tears down.
 */
import { io, type Socket } from 'socket.io-client';
import { getSession, onAuthChange } from './auth';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';
const REALTIME_URL = `${API_URL}/realtime`;

/** Server → client payloads (mirror the RealtimeGateway emit helpers). */
export interface OrderStatusEvent {
  orderId: string;
  status: string;
  timestamp: string;
}

export interface NotificationEvent {
  notificationId: string;
  type: string;
  title: string;
  body: string;
}

let socket: Socket | null = null;
let authUnsub: (() => void) | null = null;

/** Keep the handshake token in sync with auth state (refresh → reconnect, logout → teardown). */
function ensureAuthSync(): void {
  if (authUnsub || typeof window === 'undefined') return;
  authUnsub = onAuthChange((user) => {
    if (!socket) return;
    const session = getSession();
    if (!user || !session?.accessToken) {
      disconnectRealtime();
      return;
    }
    socket.auth = { token: session.accessToken };
    if (!socket.connected) socket.connect();
  });
}

/**
 * Connect (or return the existing) authenticated realtime socket. Returns null
 * when running server-side or when there is no active session, so callers can
 * safely no-op during SSR / logged-out states.
 */
export function connectRealtime(): Socket | null {
  if (typeof window === 'undefined') return null;
  const session = getSession();
  if (!session?.accessToken) return null;

  ensureAuthSync();

  if (!socket) {
    socket = io(REALTIME_URL, {
      auth: { token: session.accessToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
    });
  } else if (!socket.connected) {
    socket.auth = { token: session.accessToken };
    socket.connect();
  }
  return socket;
}

/** Disconnect and forget the shared socket (called on logout). */
export function disconnectRealtime(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Subscribe to order-status changes. When `orderId` is given the handler only
 * fires for that order; otherwise it fires for every order the user can see
 * (the gateway pushes the buyer's own orders to their `user:{id}` room).
 * Returns an unsubscribe function.
 */
export function onOrderStatus(
  handler: (evt: OrderStatusEvent) => void,
  orderId?: string,
): () => void {
  const s = connectRealtime();
  if (!s) return () => {};
  const listener = (evt: OrderStatusEvent) => {
    if (!orderId || evt.orderId === orderId) handler(evt);
  };
  s.on('order.status.changed', listener);
  return () => {
    s.off('order.status.changed', listener);
  };
}

/** Subscribe to new in-app notifications for the current user. Returns an unsubscribe function. */
export function onNotification(handler: (evt: NotificationEvent) => void): () => void {
  const s = connectRealtime();
  if (!s) return () => {};
  s.on('notification.new', handler);
  return () => {
    s.off('notification.new', handler);
  };
}

/**
 * Ask the gateway to also track a specific order room (used by the order-detail
 * page so any authenticated viewer — not just the buyer — receives live status).
 * Joins once connected and leaves on teardown. Returns an unsubscribe function.
 */
export function watchOrder(orderId: string): () => void {
  const s = connectRealtime();
  if (!s) return () => {};
  const room = `order:${orderId}`;
  const join = () => s.emit('join', { rooms: [room] });
  if (s.connected) join();
  else s.once('connect', join);
  return () => {
    if (s.connected) s.emit('leave', { rooms: [room] });
    s.off('connect', join);
  };
}
