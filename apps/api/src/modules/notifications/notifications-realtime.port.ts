/**
 * Runtime-neutral notification → realtime bridge.
 *
 * Kept outside the gateway module so NotificationsService does not import
 * RealtimeGateway (which itself depends on OrdersModule, which imports
 * NotificationsModule). RealtimeModule binds this token to its gateway.
 */
export const NOTIFICATION_REALTIME_EMITTER = Symbol.for('scs.notifications.realtime-emitter');

export interface NotificationRealtimeEmitter {
  emitNotification(
    userId: string,
    payload: { id: string; type: string; title: string; body: string },
  ): void;
}
