import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from '../../../modules/notifications/notifications.service';

describe('NotificationsService OTP persistence boundary', () => {
  it('refuses to persist OTP codes through generic notifications', async () => {
    const insert = vi.fn();
    const service = new NotificationsService({ db: { insert } } as any);

    await expect(service.send('user-a', 'otp.login', { code: '123456' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(insert).not.toHaveBeenCalled();
  });
});
