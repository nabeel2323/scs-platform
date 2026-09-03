import { Injectable, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { notifications, notificationPreferences, deviceTokens } from './notifications.schema';
import { eq, and, desc, isNull, sql } from 'drizzle-orm';
import crypto from 'node:crypto';

/**
 * Notifications service — template-driven, multi-channel, quiet-hours aware.
 *
 * Channels: SMS (two-provider failover), PUSH (FCM), IN_APP, WHATSAPP
 * Types: TRANSACTIONAL (always sent), PROMOTIONAL (opt-in), BEHAVIORAL (opt-in)
 * Quiet hours: 22:00–07:00 local for PROMOTIONAL/BEHAVIORAL
 *
 * Templates are rendered here. In production, these would be in a template registry
 * with localization support. For Phase 1, inline templates suffice.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(private readonly db: DatabaseService) {}

  onModuleInit() {
    // In production, this would start polling for PENDING notifications
    // For now, notifications are sent synchronously via send()
  }

  // ── Template Registry ────────────────────────────────────────

  private static readonly TEMPLATES: Record<string, NotificationTemplate> = {
    'otp.login': {
      type: 'TRANSACTIONAL',
      channels: ['SMS'],
      render: (data) => ({
        title: 'Login Code',
        body: `Your login code is ${data['code']}. Valid for 5 minutes.`,
      }),
    },
    'order.submitted': {
      type: 'TRANSACTIONAL',
      channels: ['IN_APP', 'PUSH'],
      render: (data) => ({
        title: 'New Order Received',
        body: `Order #${String(data['orderId'] || '').slice(0, 8)} has been placed. Please review and accept.`,
      }),
    },
    'order.accepted': {
      type: 'TRANSACTIONAL',
      channels: ['IN_APP', 'PUSH'],
      render: (data) => ({
        title: 'Order Accepted',
        body: `Your order #${String(data['orderId'] || '').slice(0, 8)} has been accepted by the merchant.`,
      }),
    },
    'order.partially_accepted': {
      type: 'TRANSACTIONAL',
      channels: ['IN_APP', 'PUSH'],
      render: (data) => ({
        title: 'Order Partially Accepted',
        body: `Your order #${String(data['orderId'] || '').slice(0, 8)} has been partially accepted. Some items may be unavailable.`,
      }),
    },
    'order.rejected': {
      type: 'TRANSACTIONAL',
      channels: ['IN_APP', 'PUSH'],
      render: (data) => ({
        title: 'Order Rejected',
        body: `Your order #${String(data['orderId'] || '').slice(0, 8)} has been rejected. ${String(data['reason'] || '')}`,
      }),
    },
    'order.confirmed': {
      type: 'TRANSACTIONAL',
      channels: ['IN_APP'],
      render: (data) => ({
        title: 'Order Confirmed',
        body: `Your order #${String(data['orderId'] || '').slice(0, 8)} is being prepared.`,
      }),
    },
    'order.ready': {
      type: 'TRANSACTIONAL',
      channels: ['IN_APP', 'PUSH', 'SMS'],
      render: (data) => ({
        title: 'Order Ready',
        body: `Your order #${String(data['orderId'] || '').slice(0, 8)} is ready for pickup/delivery.`,
      }),
    },
    'order.delivered': {
      type: 'TRANSACTIONAL',
      channels: ['IN_APP', 'PUSH'],
      render: (data) => ({
        title: 'Order Delivered',
        body: `Your order #${String(data['orderId'] || '').slice(0, 8)} has been delivered. Please rate your experience.`,
      }),
    },
    'order.cancelled': {
      type: 'TRANSACTIONAL',
      channels: ['IN_APP', 'PUSH'],
      render: (data) => ({
        title: 'Order Cancelled',
        body: `Your order #${String(data['orderId'] || '').slice(0, 8)} has been cancelled. ${String(data['reason'] || '')}`,
      }),
    },
    'verification.approved': {
      type: 'TRANSACTIONAL',
      channels: ['IN_APP', 'SMS'],
      render: () => ({
        title: 'Store Verified',
        body: 'Your store has been verified! You can now start listing products.',
      }),
    },
    'verification.rejected': {
      type: 'TRANSACTIONAL',
      channels: ['IN_APP'],
      render: (data) => ({
        title: 'Verification Update Needed',
        body: `Your verification was not approved. Reason: ${data['reason'] || 'Please review your submission.'}`,
      }),
    },
    'promo.applied': {
      type: 'PROMOTIONAL',
      channels: ['IN_APP', 'PUSH'],
      render: (data) => ({
        title: 'Special Offer!',
        body: `Use code ${data['code']} for ${data['discount']}% off!`,
      }),
    },
  };

  // ── Send Notification ────────────────────────────────────────

  async send(userId: string, templateName: string, data: Record<string, unknown> = {}) {
    const template = NotificationsService.TEMPLATES[templateName];
    if (!template) {
      console.warn(`[Notifications] Unknown template: ${templateName}`);
      return;
    }

    // Quiet hours check for non-transactional
    if (template.type !== 'TRANSACTIONAL' && this.isQuietHours()) {
      // Queue for later — in production, schedule via Redis/Bull
      console.log(`[Notifications] Quiet hours — deferring ${templateName} for user ${userId}`);
      return;
    }

    const rendered = template.render(data);

    for (const channel of template.channels) {
      // Check preferences for non-transactional
      if (template.type !== 'TRANSACTIONAL') {
        const pref = await this.getPreference(userId, template.type, channel);
        if (pref && !pref['isEnabled']) continue;
      }

      const id = crypto.randomUUID();
      await this.db.db.insert(notifications).values({
        id,
        userId,
        type: template.type,
        channel,
        template: templateName,
        title: rendered.title,
        body: rendered.body,
        data,
        status: 'PENDING',
      });

      // Dispatch based on channel
      try {
        await this.dispatch(id, channel, userId, rendered);
      } catch (err: any) {
        await this.db.db
          .update(notifications)
          .set({
            status: 'FAILED',
            failureReason: err?.message || 'Unknown error',
            failedAt: new Date(),
          })
          .where(eq(notifications.id, id));
      }
    }
  }

  // ── Channel Dispatchers ──────────────────────────────────────

  private async dispatch(id: string, channel: string, userId: string, rendered: { title?: string; body: string }) {
    switch (channel) {
      case 'SMS':
        await this.sendSms(id, userId, rendered.body);
        break;
      case 'PUSH':
        await this.sendPush(id, userId, rendered.title || '', rendered.body);
        break;
      case 'IN_APP':
        // In-app notifications are just stored — client polls or uses WebSocket
        await this.db.db
          .update(notifications)
          .set({ status: 'SENT', sentAt: new Date() })
          .where(eq(notifications.id, id));
        break;
      case 'WHATSAPP':
        await this.sendWhatsApp(id, userId, rendered.body);
        break;
    }
  }

  // SMS with two-provider failover
  private async sendSms(notificationId: string, userId: string, body: string) {
    // Get user phone from users table
    const user = await this.db.db.query.users.findFirst({
      where: eq((await import('../identity/identity.schema')).users.id, userId),
    });
    if (!user) throw new Error('User not found');
    const phone = user['phone'];

    // Primary provider
    try {
      const result = await this.smsProviderPrimary(phone, body);
      await this.db.db
        .update(notifications)
        .set({ status: 'SENT', provider: 'primary-sms', providerMsgId: result, sentAt: new Date() })
        .where(eq(notifications.id, notificationId));
      return;
    } catch {
      console.warn('[SMS] Primary provider failed, trying fallback');
    }

    // Fallback provider
    try {
      const result = await this.smsProviderFallback(phone, body);
      await this.db.db
        .update(notifications)
        .set({ status: 'SENT', provider: 'fallback-sms', providerMsgId: result, sentAt: new Date() })
        .where(eq(notifications.id, notificationId));
    } catch (err: any) {
      // WhatsApp fallback
      try {
        await this.sendWhatsApp(notificationId, userId, body);
      } catch {
        throw new Error(`All SMS providers failed: ${err?.message}`);
      }
    }
  }

  private async sendPush(notificationId: string, userId: string, title: string, body: string) {
    const tokens = await this.db.db.select().from(deviceTokens)
      .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.isActive, true)));

    if (tokens.length === 0) {
      await this.db.db
        .update(notifications)
        .set({ status: 'SENT', provider: 'fcm-no-token', sentAt: new Date() })
        .where(eq(notifications.id, notificationId));
      return;
    }

    // FCM send (placeholder — in production, use firebase-admin SDK)
    const fcmResult = await this.fcmSend(tokens.map((t: any) => t.token), title, body);

    await this.db.db
      .update(notifications)
      .set({ status: 'SENT', provider: 'fcm', providerMsgId: fcmResult, sentAt: new Date() })
      .where(eq(notifications.id, notificationId));
  }

  private async sendWhatsApp(notificationId: string, userId: string, body: string) {
    // Placeholder — in production, integrate WhatsApp Business API
    await this.db.db
      .update(notifications)
      .set({ status: 'SENT', provider: 'whatsapp', sentAt: new Date() })
      .where(eq(notifications.id, notificationId));
  }

  // ── Provider Stubs ───────────────────────────────────────────

  private async smsProviderPrimary(phone: string, body: string): Promise<string> {
    // In production: call primary SMS API (e.g., Unifonic, Twilio)
    // For now, simulate success
    return `primary-${crypto.randomUUID().slice(0, 8)}`;
  }

  private async smsProviderFallback(phone: string, body: string): Promise<string> {
    // In production: call fallback SMS API
    return `fallback-${crypto.randomUUID().slice(0, 8)}`;
  }

  private async fcmSend(tokens: string[], title: string, body: string): Promise<string> {
    // In production: use firebase-admin SDK
    // admin.messaging().sendEachForMulticast({ tokens, notification: { title, body } })
    return `fcm-${crypto.randomUUID().slice(0, 8)}`;
  }

  // ── Preferences ──────────────────────────────────────────────

  async getPreference(userId: string, type: string, channel: string) {
    const rows = await this.db.db.select().from(notificationPreferences)
      .where(and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.type, type),
        eq(notificationPreferences.channel, channel),
      ))
      .limit(1);
    return rows[0] ?? null;
  }

  async getPreferences(userId: string) {
    return this.db.db.select().from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));
  }

  async updatePreference(userId: string, type: string, channel: string, isEnabled: boolean) {
    const existing = await this.getPreference(userId, type, channel);
    if (existing) {
      await this.db.db
        .update(notificationPreferences)
        .set({ isEnabled, updatedAt: new Date() })
        .where(eq(notificationPreferences.id, existing['id']));
    } else {
      await this.db.db.insert(notificationPreferences).values({
        id: crypto.randomUUID(),
        userId,
        type,
        channel,
        isEnabled,
      });
    }
    return this.getPreferences(userId);
  }

  // ── Device Tokens ────────────────────────────────────────────

  async registerDeviceToken(userId: string, token: string, platform: string, appVersion?: string) {
    const existingRows = await this.db.db.select().from(deviceTokens)
      .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.token, token)))
      .limit(1);
    const existing = existingRows[0] ?? null;

    if (existing) {
      await this.db.db
        .update(deviceTokens)
        .set({ isActive: true, appVersion: appVersion || existing['appVersion'], lastSeenAt: new Date() })
        .where(eq(deviceTokens.id, existing['id']));
    } else {
      await this.db.db.insert(deviceTokens).values({
        id: crypto.randomUUID(),
        userId,
        token,
        platform,
        appVersion: appVersion || null,
      });
    }
    return { success: true };
  }

  async unregisterDeviceToken(userId: string, token: string) {
    await this.db.db
      .update(deviceTokens)
      .set({ isActive: false })
      .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.token, token)));
    return { success: true };
  }

  // ── Queries ──────────────────────────────────────────────────

  async listNotifications(userId: string, limit = 50, offset = 0) {
    return this.db.db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getUnreadCount(userId: string) {
    const result = await this.db.db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return result[0]?.count || 0;
  }

  async markAsRead(notificationId: string, userId: string) {
    const rows = await this.db.db.select().from(notifications)
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
      .limit(1);
    if (!rows[0]) return { success: false };

    await this.db.db
      .update(notifications)
      .set({ readAt: new Date(), status: 'READ' })
      .where(eq(notifications.id, notificationId));
    return { success: true };
  }

  async markAllAsRead(userId: string) {
    await this.db.db
      .update(notifications)
      .set({ readAt: new Date(), status: 'READ' })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return { success: true };
  }

  // ── Quiet Hours ──────────────────────────────────────────────

  private isQuietHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    // 22:00–07:00 local time
    return hour >= 22 || hour < 7;
  }
}

// ── Types ────────────────────────────────────────────────────────

interface NotificationTemplate {
  type: 'TRANSACTIONAL' | 'PROMOTIONAL' | 'BEHAVIORAL';
  channels: string[];
  render: (data: Record<string, unknown>) => { title?: string; body: string };
}
