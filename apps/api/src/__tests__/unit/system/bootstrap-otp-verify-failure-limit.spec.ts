import { RateLimitException } from '../../../common/exceptions/rate-limit.exception';
import { describe, expect, it } from 'vitest';
import { BootstrapService } from '../../../modules/system/bootstrap.service';
import { createMockRedisStore } from '../helpers/mock-redis';

describe('BootstrapService OTP verification failure limits', () => {
  it('enforces the per-owner-address verification failure limit', async () => {
    const previousEnv = {
      nodeEnv: process.env['NODE_ENV'],
      ownerEmail: process.env['SCS_BOOTSTRAP_OWNER_EMAIL'],
      hmacSecret: process.env['OTP_HMAC_SECRET'],
    };
    process.env['NODE_ENV'] = 'test';
    process.env['SCS_BOOTSTRAP_OWNER_EMAIL'] = 'owner@example.com';
    process.env['OTP_HMAC_SECRET'] = 'test-bootstrap-hmac-secret';

    try {
      const redis = createMockRedisStore();
      const service = new BootstrapService(
        {
          db: { query: { users: { findFirst: async () => null } } },
          withActorContext: async (_context: unknown, operation: () => Promise<unknown>) => operation(),
        } as any,
        {} as any,
        {} as any,
        redis as any,
        {} as any,
        {} as any,
      );
      const email = 'owner@example.com';
      const challenge = {
        salt: 'test-salt',
        otpHash: 'not-the-submitted-otp-hash',
        expiresAt: Date.now() + 300_000,
        attempts: 0,
      };
      redis._store.set(`bootstrap:otp:challenge:${email}`, {
        value: JSON.stringify(challenge),
        ttl: 300,
      });
      redis._store.set(`bootstrap:otp:vatt:email:${email}`, {
        value: '10',
        ttl: 900,
      });

      await expect(service.verifyOwnerOtp(email, '000000', '203.0.113.10')).rejects.toBeInstanceOf(
        RateLimitException,
      );
    } finally {
      if (previousEnv.nodeEnv === undefined) delete process.env['NODE_ENV'];
      else process.env['NODE_ENV'] = previousEnv.nodeEnv;
      if (previousEnv.ownerEmail === undefined) delete process.env['SCS_BOOTSTRAP_OWNER_EMAIL'];
      else process.env['SCS_BOOTSTRAP_OWNER_EMAIL'] = previousEnv.ownerEmail;
      if (previousEnv.hmacSecret === undefined) delete process.env['OTP_HMAC_SECRET'];
      else process.env['OTP_HMAC_SECRET'] = previousEnv.hmacSecret;
    }
  });
});
