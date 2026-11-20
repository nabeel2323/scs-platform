import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from '../../../modules/notifications/notifications.service';

function makeService(tokens: Array<{ token: string }> = []) {
  const set = vi.fn(() => ({
    where: vi.fn(async () => undefined),
  }));
  const db = {
    select: () => ({
      from: () => ({
        where: vi.fn(async () => tokens),
      }),
    }),
    update: () => ({ set }),
  };
  return {
    service: new NotificationsService({ db: { db } } as any),
    set,
  };
}

describe('NotificationsService unconfigured delivery channels', () => {
  it('does not report SMS provider stubs as successful', async () => {
    const { service } = makeService();
    await expect((service as any).smsProviderPrimary('+10000000000', 'body'))
      .rejects.toThrow('SMS_PRIMARY_NOT_CONFIGURED');
    await expect((service as any).smsProviderFallback('+10000000000', 'body'))
      .rejects.toThrow('SMS_FALLBACK_NOT_CONFIGURED');
  });

  it('does not report WhatsApp placeholder as sent', async () => {
    const { service, set } = makeService();
    await expect((service as any).sendWhatsApp('notification-1', 'user-1', 'body'))
      .rejects.toThrow('WHATSAPP_NOT_CONFIGURED');
    expect(set).not.toHaveBeenCalled();
  });

  it('does not report push as sent when no active device tokens exist', async () => {
    const { service, set } = makeService([]);
    await expect((service as any).sendPush('notification-1', 'user-1', 'title', 'body'))
      .rejects.toThrow('PUSH_NOT_CONFIGURED');
    expect(set).not.toHaveBeenCalled();
  });

  it('does not report push as sent while the FCM adapter is a stub', async () => {
    const { service, set } = makeService([{ token: 'synthetic-device-token' }]);
    await expect((service as any).sendPush('notification-1', 'user-1', 'title', 'body'))
      .rejects.toThrow('PUSH_PROVIDER_NOT_CONFIGURED');
    expect(set).not.toHaveBeenCalled();
  });
});
