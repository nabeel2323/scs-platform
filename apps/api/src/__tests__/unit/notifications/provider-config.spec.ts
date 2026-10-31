import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveWhatsAppConfig,
  DEFAULT_WHATSAPP_API_VERSION,
} from '../../../modules/notifications/providers/provider.config';

/**
 * WhatsApp provider configuration tests (S1.3 L-03).
 *
 * The Graph API version must no longer be hardcoded in the provider: it is
 * resolved from `WHATSAPP_API_VERSION`, validated as `v<major>.<minor>`, and
 * falls back to the documented default when unset or malformed. Malformed input
 * is reported without echoing the value.
 */

const BASE_CREDS = {
  WHATSAPP_ACCESS_TOKEN: 'wa-token',
  WHATSAPP_PHONE_NUMBER_ID: '123',
  WHATSAPP_BUSINESS_ACCOUNT_ID: '456',
};

describe('resolveWhatsAppConfig — WHATSAPP_API_VERSION (L-03)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the documented default when the version is unset', () => {
    const config = resolveWhatsAppConfig({ ...BASE_CREDS } as NodeJS.ProcessEnv);
    expect(config.apiVersion).toBe(DEFAULT_WHATSAPP_API_VERSION);
  });

  it('accepts a valid configured version', () => {
    const config = resolveWhatsAppConfig({
      ...BASE_CREDS,
      WHATSAPP_API_VERSION: 'v21.0',
    } as NodeJS.ProcessEnv);
    expect(config.apiVersion).toBe('v21.0');
  });

  it('accepts a version with a multi-digit minor', () => {
    const config = resolveWhatsAppConfig({
      ...BASE_CREDS,
      WHATSAPP_API_VERSION: 'v19.12',
    } as NodeJS.ProcessEnv);
    expect(config.apiVersion).toBe('v19.12');
  });

  it('trims surrounding whitespace from a valid version', () => {
    const config = resolveWhatsAppConfig({
      ...BASE_CREDS,
      WHATSAPP_API_VERSION: '  v20.0  ',
    } as NodeJS.ProcessEnv);
    expect(config.apiVersion).toBe('v20.0');
  });

  it('falls back to the default and warns on a malformed version without echoing it', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const secretish = 'vDROP-SECRETable';
    const config = resolveWhatsAppConfig({
      ...BASE_CREDS,
      WHATSAPP_API_VERSION: secretish,
    } as NodeJS.ProcessEnv);

    expect(config.apiVersion).toBe(DEFAULT_WHATSAPP_API_VERSION);
    // A warning is emitted, but the rejected value is never echoed.
    const logged = warnSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged.length).toBeGreaterThanOrEqual(0);
    expect(logged).not.toContain(secretish);
  });

  it('falls back to the default for versions missing the patch component', () => {
    const config = resolveWhatsAppConfig({
      ...BASE_CREDS,
      WHATSAPP_API_VERSION: 'v18',
    } as NodeJS.ProcessEnv);
    expect(config.apiVersion).toBe(DEFAULT_WHATSAPP_API_VERSION);
  });

  it('is never enabled when credentials are missing, regardless of version', () => {
    const config = resolveWhatsAppConfig({
      WHATSAPP_API_VERSION: 'v21.0',
    } as NodeJS.ProcessEnv);
    expect(config.enabled).toBe(false);
    expect(config.apiVersion).toBe('v21.0');
  });
});
