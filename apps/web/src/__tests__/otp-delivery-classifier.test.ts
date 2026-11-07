import { describe, expect, it } from 'vitest';
import { classifyOtpDelivery } from '@scs/contracts';

/**
 * The shared OTP delivery classifier — the single place that decides what a
 * client is allowed to conclude from `POST /v1/auth/otp/request`.
 *
 * Every status string below was read out of the API, not invented:
 *   identity.service.ts:273 / :553  → 'DELIVERY_TIMEOUT' (+ possiblyDelivered)
 *   identity.service.ts:291 / :571  → forwards the delivery layer's errorReason
 *   otp-delivery.service.ts:133     → 'UNKNOWN_CHANNEL'
 *   otp-delivery.service.ts:150     → '<CHANNEL>_PROVIDER_NOT_CONFIGURED'
 *   otp-delivery.service.ts:177     → 'DELIVERY_ERROR' (deliveryOutcome unknown)
 *   providers/twilio-sms|smtp-email|whatsapp.provider.ts → '<PROVIDER>_NOT_CONFIGURED'
 *   identity.service.ts:299         → 'delivered' with success: true
 *
 * Why this file exists: the four outcomes are the whole defense against the
 * audited defect ("delivery failure silently treated as success"). Each UI used
 * to re-read the vocabulary itself, and one of them read only the HTTP status.
 * The web/admin pages cover their copy; this locks the rule once, including the
 * case that made the UIs drift — two different spellings of "not configured".
 */

interface Delivery {
  success: boolean;
  deliveryStatus: string;
  possiblyDelivered?: boolean;
}

const classify = (body: Delivery) => classifyOtpDelivery(body);

describe('classifyOtpDelivery — the only reading clients may make', () => {
  it('reports delivered only when the API said success', () => {
    expect(classify({ success: true, deliveryStatus: 'delivered' })).toBe('delivered');
  });

  it('never reads a missing or false success as delivered', () => {
    // Regression lock for the admin defect: a 2xx with success:false is not a send.
    expect(classify({ success: false, deliveryStatus: 'delivered' })).not.toBe('delivered');
    expect(classify({ success: false, deliveryStatus: '' })).toBe('rejected');
  });

  it('treats a timeout as uncertain, because the challenge stays live', () => {
    expect(
      classify({
        success: false,
        deliveryStatus: 'DELIVERY_TIMEOUT',
        possiblyDelivered: true,
      }),
    ).toBe('uncertain');
    expect(classify({ success: false, deliveryStatus: 'DELIVERY_TIMEOUT' })).toBe('uncertain');
  });

  it('treats a transport error as uncertain even without the flag', () => {
    // otp-delivery.service.ts labels this deliveryOutcome 'unknown'; a client
    // may not claim a definite failure it cannot see.
    expect(classify({ success: false, deliveryStatus: 'DELIVERY_ERROR' })).toBe('uncertain');
    expect(classify({ success: false, deliveryStatus: 'anything', possiblyDelivered: true })).toBe(
      'uncertain',
    );
  });

  it('reads BOTH spellings of "this environment cannot deliver" as unavailable', () => {
    // The router's channel-keyed name and the providers' own names mean the
    // same thing to a user. Keying only on the router's spelling sent the
    // others to 'rejected' — "check the phone number", a retry that can never
    // work, and a regression against the substring test this replaced.
    for (const status of [
      'SMS_PROVIDER_NOT_CONFIGURED',
      'WHATSAPP_PROVIDER_NOT_CONFIGURED',
      'EMAIL_PROVIDER_NOT_CONFIGURED',
      'TWILIO_NOT_CONFIGURED',
      'SMTP_NOT_CONFIGURED',
      'WHATSAPP_NOT_CONFIGURED',
      'UNKNOWN_CHANNEL',
    ]) {
      expect(classify({ success: false, deliveryStatus: status })).toBe('unavailable');
    }
  });

  it('reads a channel the release has disabled as unavailable, not a wrong address', () => {
    // otp-delivery.service.ts refuses non-permitted channels before touching a
    // provider. During the email-only staging release SMS answers with
    // SMS_CHANNEL_DISABLED; telling the user to "check the number" would send
    // them retrying something the deployment will never do.
    for (const status of [
      'SMS_CHANNEL_DISABLED',
      'WHATSAPP_CHANNEL_DISABLED',
      'EMAIL_CHANNEL_DISABLED',
    ]) {
      expect(classify({ success: false, deliveryStatus: status })).toBe('unavailable');
    }
  });

  it('keeps a genuine rejection distinct from an unavailable channel', () => {
    expect(classify({ success: false, deliveryStatus: 'DELIVERY_FAILED' })).toBe('rejected');
    expect(classify({ success: false, deliveryStatus: 'MISSING_PHONE' })).toBe('rejected');
    // Provider reason strings are free text; they must not be swallowed by the
    // config rules above unless they actually say the provider is unconfigured.
    expect(classify({ success: false, deliveryStatus: 'Twilio error 21211' })).toBe('rejected');
  });

  it('is total: no input throws and every outcome is one of four', () => {
    const bodies: Delivery[] = [
      { success: true, deliveryStatus: 'delivered' },
      { success: false, deliveryStatus: 'DELIVERY_TIMEOUT', possiblyDelivered: true },
      { success: false, deliveryStatus: 'SMTP_NOT_CONFIGURED' },
      { success: false, deliveryStatus: 'DELIVERY_FAILED' },
      { success: false, deliveryStatus: '' },
    ];
    for (const body of bodies) {
      expect(['delivered', 'uncertain', 'unavailable', 'rejected']).toContain(classify(body));
    }
  });
});
