import { describe, it, expect } from 'vitest';
import {
  assertOtpDeliveryConfig,
  OtpDeliveryConfigurationError,
} from '../../../config/otp-delivery-gate';

describe('OTP delivery boot gate — deployed environment detection', () => {
  it('does not accept the development OTP mock path inside a Render service', () => {
    expect(() =>
      assertOtpDeliveryConfig({
        RENDER_SERVICE_ID: 'srv-test',
        NODE_ENV: 'development',
      } as NodeJS.ProcessEnv),
    ).toThrow(OtpDeliveryConfigurationError);
  });

  it('fails closed when a Render service has no NODE_ENV', () => {
    expect(() =>
      assertOtpDeliveryConfig({
        RENDER_SERVICE_ID: 'srv-test',
      } as NodeJS.ProcessEnv),
    ).toThrow(OtpDeliveryConfigurationError);
  });

  it('keeps the local development gate permissive when no Render marker exists', () => {
    expect(() =>
      assertOtpDeliveryConfig({ NODE_ENV: 'development' } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});
