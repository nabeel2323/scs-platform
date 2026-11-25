import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import {
  HTTP_LOG_REDACT_PATHS,
  sanitizeRequestLog,
  sanitizeRequestUrl,
} from '../../../common/logging/http-log-redaction';

describe('HTTP log redaction', () => {
  it('strips query values and redacts credential-like carrier webhook path tokens', () => {
    const webhookUrl =
      '/v1/webhooks/carrier/aramex/credential-token?signature=secret&otp=123456';
    const otpUrl = '/v1/auth/otp/verify?email=user@example.test&otp=123456';

    expect(sanitizeRequestUrl(webhookUrl)).toBe('/v1/webhooks/carrier/aramex/[REDACTED]');
    expect(sanitizeRequestUrl(otpUrl)).toBe('/v1/auth/otp/verify');
  });

  it('redacts credentials and sensitive metadata in actual Pino output', () => {
    const chunks: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const logger = pino(
      {
        base: null,
        timestamp: false,
        redact: {
          paths: [...HTTP_LOG_REDACT_PATHS],
          censor: '[REDACTED]',
        },
      },
      sink,
    );

    const req = sanitizeRequestLog({
      id: 17,
      method: 'POST',
      url: '/v1/webhooks/carrier/aramex/credential-token?signature=secret&otp=123456',
      query: { signature: 'secret', otp: '123456' },
      params: { providerKey: 'aramex', webhookToken: 'credential-token' },
      headers: {
        authorization: 'Bearer access-token',
        cookie: 'session=session-secret',
        'x-webhook-signature': 'hmac-signature-secret',
        'x-device-id': 'device-identifier',
        'cf-connecting-ip': '198.51.100.10',
      },
    });
    const res = {
      statusCode: 201,
      headers: {
        'set-cookie': 'scs_device_trust=device-trust-secret; HttpOnly; Secure',
        authorization: 'Bearer response-token',
      },
    };

    logger.info({ req, res }, 'request completed');
    logger.flush();

    const output = chunks.join('');
    for (const secret of [
      'credential-token',
      'signature=secret',
      '123456',
      'user@example.test',
      'access-token',
      'session-secret',
      'hmac-signature-secret',
      'device-identifier',
      '198.51.100.10',
      'device-trust-secret',
      'response-token',
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain('/v1/webhooks/carrier/aramex/[REDACTED]');
    expect(output).toContain('[REDACTED]');
  });
});
