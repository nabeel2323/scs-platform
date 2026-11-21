import { describe, expect, it } from 'vitest';
import { NotificationsService } from '../../../modules/notifications/notifications.service';

function makeService(activeTokens: unknown[] = []) {
  const updates: Array<Record<string, unknown>> = [];
  const db = {
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          updates.push(values);
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: async () => activeTokens,
      }),
    }),
  };
  return {
    service: new NotificationsService({ db } as any),
    updates,
  };
}

describe('NotificationsService — truthful external provider states (G-009)', () => {
  it('does not report SMS sent when no SMS adapter is configured', async () => {
    const { service, updates } = makeService();
    await (service as any).sendSms('notification-1', 'user-1', 'message');

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      status: 'NOT_CONFIGURED',
      provider: 'sms-unconfigured',
      failureReason: 'SMS_PROVIDER_NOT_CONFIGURED',
    });
    expect(updates[0]).not.toHaveProperty('sentAt');
    expect(updates[0]).not.toHaveProperty('providerMsgId');
  });

  it('does not report push sent when no active device token exists', async () => {
    const { service, updates } = makeService();
    await (service as any).sendPush('notification-2', 'user-1', 'title', 'message');

    expect(updates[0]).toMatchObject({
      status: 'NOT_CONFIGURED',
      provider: 'fcm-unconfigured',
      failureReason: 'PUSH_NO_ACTIVE_DEVICE_TOKEN',
    });
  });

  it('does not report push sent when tokens exist but FCM adapter is absent', async () => {
    const { service, updates } = makeService([{ token: 'synthetic-token' }]);
    await (service as any).sendPush('notification-3', 'user-1', 'title', 'message');

    expect(updates[0]).toMatchObject({
      status: 'NOT_CONFIGURED',
      provider: 'fcm-unconfigured',
      failureReason: 'PUSH_PROVIDER_NOT_CONFIGURED',
    });
    expect(updates[0]).not.toHaveProperty('providerMsgId');
  });

  it('does not report WhatsApp sent while its adapter is a stub', async () => {
    const { service, updates } = makeService();
    await (service as any).sendWhatsApp('notification-4', 'user-1', 'message');

    expect(updates[0]).toMatchObject({
      status: 'NOT_CONFIGURED',
      provider: 'whatsapp-unconfigured',
      failureReason: 'WHATSAPP_PROVIDER_NOT_CONFIGURED',
    });
    expect(updates[0]).not.toHaveProperty('sentAt');
    expect(updates[0]).not.toHaveProperty('providerMsgId');
  });
});
