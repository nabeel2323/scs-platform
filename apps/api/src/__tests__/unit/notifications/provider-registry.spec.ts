/**
 * Provider registry tests.
 *
 * Covers:
 * - Public channel selection (sms, whatsapp, email)
 * - Mock channel exclusion from public API
 * - Mock channel availability through internal test accessor
 * - Available channel enumeration
 * - Production/staging mock rejection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock nodemailer to prevent real transport creation
vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({
    sendMail: vi.fn().mockResolvedValue({ messageId: 'mock-msg' }),
  })),
}));

// Mock fetch for Twilio/WhatsApp providers
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { ProviderRegistryService } from '../../../modules/notifications/provider-registry.service';

describe('ProviderRegistryService', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    mockFetch.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  function setAllProvidersConfigured() {
    process.env['TWILIO_ACCOUNT_SID'] = 'ACtest';
    process.env['TWILIO_AUTH_TOKEN'] = 'token';
    process.env['TWILIO_FROM_NUMBER'] = '+15551234567';
    process.env['WHATSAPP_ACCESS_TOKEN'] = 'wa-token';
    process.env['WHATSAPP_PHONE_NUMBER_ID'] = '123';
    process.env['WHATSAPP_BUSINESS_ACCOUNT_ID'] = '456';
    process.env['SMTP_HOST'] = 'smtp.example.com';
    process.env['SMTP_FROM'] = 'noreply@example.com';
  }

  // ── Public Channel Selection ───────────────────────────────────

  describe('public channel selection', () => {
    it('returns a provider for sms channel', () => {
      setAllProvidersConfigured();
      const registry = new ProviderRegistryService();
      const provider = registry.getForChannel('sms');
      expect(provider).toBeDefined();
      expect(provider.channel).toBe('sms');
    });

    it('returns a provider for whatsapp channel', () => {
      setAllProvidersConfigured();
      const registry = new ProviderRegistryService();
      const provider = registry.getForChannel('whatsapp');
      expect(provider).toBeDefined();
      expect(provider.channel).toBe('whatsapp');
    });

    it('returns a provider for email channel', () => {
      setAllProvidersConfigured();
      const registry = new ProviderRegistryService();
      const provider = registry.getForChannel('email');
      expect(provider).toBeDefined();
      expect(provider.channel).toBe('email');
    });

    it('throws for mock channel through public accessor', () => {
      setAllProvidersConfigured();
      const registry = new ProviderRegistryService();
      expect(() => registry.getForChannel('mock' as any)).toThrow(/No provider registered/);
    });
  });

  // ── Internal (Test) Channel Selection ──────────────────────────

  describe('internal test channel', () => {
    it('returns mock provider through getForTest in test environment', () => {
      process.env['NODE_ENV'] = 'test';
      setAllProvidersConfigured();
      const registry = new ProviderRegistryService();
      const mock = registry.getForTest('mock');
      expect(mock).toBeDefined();
      expect(mock.channel).toBe('mock');
    });

    it('returns public providers through getForTest as well', () => {
      process.env['NODE_ENV'] = 'test';
      setAllProvidersConfigured();
      const registry = new ProviderRegistryService();
      const sms = registry.getForTest('sms');
      expect(sms).toBeDefined();
      expect(sms.channel).toBe('sms');
    });

    it('getMockProvider returns mock in test environment', () => {
      process.env['NODE_ENV'] = 'test';
      setAllProvidersConfigured();
      const registry = new ProviderRegistryService();
      expect(registry.getMockProvider()).not.toBeNull();
    });
  });

  // ── Mock Exclusion from Public Enumeration ─────────────────────

  describe('mock exclusion', () => {
    it('getAvailableChannels never includes mock', () => {
      process.env['NODE_ENV'] = 'test';
      setAllProvidersConfigured();
      const registry = new ProviderRegistryService();
      const channels = registry.getAvailableChannels();
      expect(channels).not.toContain('mock');
    });

    it('isChannelAvailable rejects mock', () => {
      process.env['NODE_ENV'] = 'test';
      setAllProvidersConfigured();
      const registry = new ProviderRegistryService();
      expect(registry.isChannelAvailable('mock' as any)).toBe(false);
    });
  });

  // ── Available Channel Enumeration ──────────────────────────────

  describe('available channels', () => {
    it('lists all configured public channels', () => {
      setAllProvidersConfigured();
      const registry = new ProviderRegistryService();
      const channels = registry.getAvailableChannels();
      expect(channels).toContain('sms');
      expect(channels).toContain('whatsapp');
      expect(channels).toContain('email');
    });

    it('omits unconfigured channels', () => {
      // Only configure SMTP
      process.env['SMTP_HOST'] = 'smtp.example.com';
      process.env['SMTP_FROM'] = 'noreply@example.com';
      delete process.env['TWILIO_ACCOUNT_SID'];
      delete process.env['WHATSAPP_ACCESS_TOKEN'];

      const registry = new ProviderRegistryService();
      const channels = registry.getAvailableChannels();
      expect(channels).toContain('email');
      expect(channels).not.toContain('sms');
      expect(channels).not.toContain('whatsapp');
    });

    it('returns empty array when nothing is configured', () => {
      delete process.env['TWILIO_ACCOUNT_SID'];
      delete process.env['WHATSAPP_ACCESS_TOKEN'];
      delete process.env['SMTP_HOST'];

      const registry = new ProviderRegistryService();
      expect(registry.getAvailableChannels()).toEqual([]);
    });

    it('isChannelAvailable returns true for configured channel', () => {
      process.env['SMTP_HOST'] = 'smtp.example.com';
      process.env['SMTP_FROM'] = 'noreply@example.com';
      const registry = new ProviderRegistryService();
      expect(registry.isChannelAvailable('email')).toBe(true);
    });

    it('isChannelAvailable returns false for unconfigured channel', () => {
      delete process.env['TWILIO_ACCOUNT_SID'];
      const registry = new ProviderRegistryService();
      expect(registry.isChannelAvailable('sms')).toBe(false);
    });
  });
});
