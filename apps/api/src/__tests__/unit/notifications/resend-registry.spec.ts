import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock nodemailer to prevent real transport creation (SMTP path)
vi.mock('nodemailer', () => {
  const mockSendMail = vi.fn();
  const mockCreateTransport = vi.fn(() => ({
    sendMail: mockSendMail,
  }));
  return {
    createTransport: mockCreateTransport,
    __mockSendMail: mockSendMail,
    __mockCreateTransport: mockCreateTransport,
  };
});

// Stub global fetch for Twilio/WhatsApp providers
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import * as nodemailer from 'nodemailer';
const mockSendMail = (nodemailer as any).__mockSendMail as ReturnType<typeof vi.fn>;
const mockCreateTransport = (nodemailer as any).__mockCreateTransport as ReturnType<typeof vi.fn>;

import { ProviderRegistryService } from '../../../modules/notifications/provider-registry.service';
import { ResendEmailProvider } from '../../../modules/notifications/providers/resend-email.provider';
import { SmtpEmailProvider } from '../../../modules/notifications/providers/smtp-email.provider';

describe('ProviderRegistryService — Resend selection', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    mockFetch.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  function setEmailProviderEnvironment(emailProvider: string, resendConfigured: boolean) {
    process.env['EMAIL_PROVIDER'] = emailProvider;
    process.env['OTP_CHANNELS'] = 'email';
    if (resendConfigured) {
      process.env['RESEND_API_KEY'] = 're_test_key';
      process.env['RESEND_FROM'] = 'noreply@scs.example.com';
    } else {
      delete process.env['RESEND_API_KEY'];
      delete process.env['RESEND_FROM'];
    }
    delete process.env['SMTP_HOST'];
    delete process.env['SMTP_FROM'];
  }

  function setSmtpEnvironment() {
    process.env['EMAIL_PROVIDER'] = 'smtp';
    process.env['OTP_CHANNELS'] = 'email';
    process.env['SMTP_HOST'] = 'smtp.example.test';
    process.env['SMTP_PORT'] = '587';
    process.env['SMTP_SECURE'] = 'false';
    process.env['SMTP_USER'] = 'smtp-user';
    process.env['SMTP_PASSWORD'] = 'smtp-pass';
    process.env['SMTP_FROM'] = 'noreply@scs.example.test';
    delete process.env['RESEND_API_KEY'];
    delete process.env['RESEND_FROM'];
  }

  // ── Provider Registry Selection ────────────────────────────────

  describe('email provider selection', () => {
    it('selects ResendEmailProvider when EMAIL_PROVIDER=resend', () => {
      setEmailProviderEnvironment('resend', true);
      const registry = new ProviderRegistryService();
      const provider = registry.getForChannel('email');
      expect(provider).toBeInstanceOf(ResendEmailProvider);
      expect(provider.name).toBe('resend-email');
      expect(provider.channel).toBe('email');
    });

    it('selects SmtpEmailProvider when EMAIL_PROVIDER=smtp', () => {
      setSmtpEnvironment();
      const registry = new ProviderRegistryService();
      const provider = registry.getForChannel('email');
      expect(provider).toBeInstanceOf(SmtpEmailProvider);
      expect(provider.name).toBe('smtp-email');
      expect(provider.channel).toBe('email');
    });

    it('selects SmtpEmailProvider when EMAIL_PROVIDER is unset (defaults to smtp)', () => {
      delete process.env['EMAIL_PROVIDER'];
      process.env['OTP_CHANNELS'] = 'email';
      process.env['SMTP_HOST'] = 'smtp.example.test';
      process.env['SMTP_FROM'] = 'noreply@scs.example.test';
      delete process.env['RESEND_API_KEY'];
      delete process.env['RESEND_FROM'];
      const registry = new ProviderRegistryService();
      const provider = registry.getForChannel('email');
      expect(provider).toBeInstanceOf(SmtpEmailProvider);
    });

    it('creates unconfigured ResendEmailProvider when EMAIL_PROVIDER=resend but credentials are missing', () => {
      setEmailProviderEnvironment('resend', false);
      const registry = new ProviderRegistryService();
      const provider = registry.getForChannel('email');
      expect(provider).toBeInstanceOf(ResendEmailProvider);
      expect(provider.isConfigured()).toBe(false);
    });
  });

  // ── MailHog Development Compatibility ──────────────────────────

  describe('mailhog development compatibility', () => {
    it('sends via SMTP MailHog without auth', async () => {
      process.env['EMAIL_PROVIDER'] = 'smtp';
      process.env['OTP_CHANNELS'] = 'email';
      process.env['SMTP_HOST'] = 'localhost';
      process.env['SMTP_PORT'] = '1025';
      process.env['SMTP_SECURE'] = 'false';
      process.env['SMTP_USER'] = '';
      process.env['SMTP_PASSWORD'] = '';
      process.env['SMTP_FROM'] = 'noreply@scs.dev';
      delete process.env['RESEND_API_KEY'];
      delete process.env['RESEND_FROM'];

      mockSendMail.mockResolvedValue({ messageId: 'mailhog-msg-1' });

      const registry = new ProviderRegistryService();
      const provider = registry.getForChannel('email');

      const result = await provider.sendOtp({
        otp: '123456',
        channel: 'email',
        email: 'user@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.deliveryOutcome).toBe('accepted');
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@scs.dev',
          to: 'user@example.com',
          subject: 'Your verification code',
        }),
      );
    });

    it('creates MailHog transport without auth when user is empty', () => {
      process.env['EMAIL_PROVIDER'] = 'smtp';
      process.env['OTP_CHANNELS'] = 'email';
      process.env['SMTP_HOST'] = 'localhost';
      process.env['SMTP_PORT'] = '1025';
      process.env['SMTP_SECURE'] = 'false';
      process.env['SMTP_USER'] = '';
      process.env['SMTP_PASSWORD'] = '';
      process.env['SMTP_FROM'] = 'noreply@scs.dev';
      delete process.env['RESEND_API_KEY'];
      delete process.env['RESEND_FROM'];

      new ProviderRegistryService();

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 1025,
          secure: false,
          auth: undefined,
        }),
      );
    });
  });
});

