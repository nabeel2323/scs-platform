import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * S1.3 L-06 — Login delivery-channel switch behavior.
 *
 * The audited login page labeled a button "Resend via [opposite channel]" but
 * did not actually change the selected channel. These tests lock the corrected
 * behavior: the label and the action agree, the selection reaches the API, and
 * it survives the verify ↔ request round trip.
 *
 * Uses only Vitest's core matchers (jest-dom is not installed in this app).
 */

// Mutable handles + error class must be created inside vi.hoisted so they exist
// before the hoisted vi.mock factories run.
const { ctl, FakeLoginRateLimitError } = vi.hoisted(() => {
  class FakeLoginRateLimitError extends Error {
    remainingAttempts: number;
    retryAfterSeconds: number;
    constructor(message: string, remaining: number, retryAfter: number) {
      super(message);
      this.name = 'LoginRateLimitError';
      this.remainingAttempts = remaining;
      this.retryAfterSeconds = retryAfter;
    }
  }
  return {
    ctl: { requestOtp: vi.fn(), verifyOtp: vi.fn() },
    FakeLoginRateLimitError,
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/lib/auth', () => ({
  requestOtp: (...args: unknown[]) => ctl.requestOtp(...args),
  verifyOtp: (...args: unknown[]) => ctl.verifyOtp(...args),
  loginPassword: vi.fn(),
  checkDeviceLogin: vi.fn().mockResolvedValue({ trusted: false }),
  LoginRateLimitError: FakeLoginRateLimitError,
}));

vi.mock('@/lib/device-id', () => ({ getDeviceId: () => 'test-device' }));
vi.mock('@/lib/api', () => ({ fetchProfile: vi.fn().mockResolvedValue({}) }));

// Minimal, deterministic stand-in for the design-system tokens used inline.
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  radii: { md: 8 },
  colors: {
    brand: { 500: '#brand500', 700: '#brand700', 900: '#brand900' },
    border: '#border',
    errBg: '#errBg',
    err: '#err',
    warnBg: '#warnBg',
    warn: '#warn',
    amber: '#amber',
    ok: '#ok',
  },
}));

// Import after mocks are registered.
import LoginPage from '@/app/auth/login/page';

const PHONE_FIELD = '+966 5XX XXX XXXX';

/** Read the checked state of a channel radio without jest-dom. */
function radioChecked(name: 'SMS' | 'WhatsApp'): boolean {
  return (screen.getByRole('radio', { name }) as HTMLInputElement).checked;
}

async function toOtpRequestStage() {
  fireEvent.click(screen.getByRole('button', { name: 'Phone OTP' }));
  fireEvent.change(screen.getByPlaceholderText(PHONE_FIELD), {
    target: { value: '+966500000000' },
  });
}

describe('Login — delivery channel switch (L-06)', () => {
  beforeEach(() => {
    ctl.requestOtp.mockReset();
    ctl.verifyOtp.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('switches SMS → WhatsApp when "Resend via WhatsApp" is clicked', async () => {
    ctl.requestOtp.mockResolvedValue({ success: true });
    render(<LoginPage />);
    await toOtpRequestStage();

    expect(radioChecked('SMS')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Send via SMS/ }));
    await waitFor(() =>
      expect(screen.getByText(/Code sent via SMS/)).toBeTruthy(),
    );

    // The promised action now switches the channel and returns to the request stage.
    fireEvent.click(screen.getByRole('button', { name: 'Resend via WhatsApp' }));
    await waitFor(() =>
      expect(screen.getByPlaceholderText(PHONE_FIELD)).toBeTruthy(),
    );
    expect(radioChecked('WhatsApp')).toBe(true);
    expect(radioChecked('SMS')).toBe(false);
  });

  it('switches WhatsApp → SMS when "Resend via SMS" is clicked', async () => {
    ctl.requestOtp.mockResolvedValue({ success: true });
    render(<LoginPage />);
    await toOtpRequestStage();

    fireEvent.click(screen.getByRole('radio', { name: 'WhatsApp' }));
    fireEvent.click(screen.getByRole('button', { name: /Send via WhatsApp/ }));
    await waitFor(() =>
      expect(screen.getByText(/Code sent via WhatsApp/)).toBeTruthy(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Resend via SMS' }));
    await waitFor(() =>
      expect(screen.getByPlaceholderText(PHONE_FIELD)).toBeTruthy(),
    );
    expect(radioChecked('SMS')).toBe(true);
  });

  it('sends the currently selected channel to the API', async () => {
    ctl.requestOtp.mockResolvedValue({ success: true });
    render(<LoginPage />);
    await toOtpRequestStage();

    fireEvent.click(screen.getByRole('radio', { name: 'WhatsApp' }));
    fireEvent.click(screen.getByRole('button', { name: /Send via WhatsApp/ }));
    await waitFor(() =>
      expect(ctl.requestOtp).toHaveBeenCalledWith('+966500000000', 'whatsapp'),
    );
  });

  it('keeps the switched channel through resend (switch then send uses the new channel)', async () => {
    ctl.requestOtp.mockResolvedValue({ success: true });
    render(<LoginPage />);
    await toOtpRequestStage();

    fireEvent.click(screen.getByRole('button', { name: /Send via SMS/ }));
    await waitFor(() =>
      expect(ctl.requestOtp).toHaveBeenLastCalledWith('+966500000000', 'sms'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Resend via WhatsApp' }));
    await waitFor(() =>
      expect(screen.getByPlaceholderText(PHONE_FIELD)).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Send via WhatsApp/ }));
    await waitFor(() =>
      expect(ctl.requestOtp).toHaveBeenLastCalledWith('+966500000000', 'whatsapp'),
    );
  });

  it('"Change number" keeps the channel but returns to the request stage', async () => {
    ctl.requestOtp.mockResolvedValue({ success: true });
    render(<LoginPage />);
    await toOtpRequestStage();

    fireEvent.click(screen.getByRole('radio', { name: 'WhatsApp' }));
    fireEvent.click(screen.getByRole('button', { name: /Send via WhatsApp/ }));
    await waitFor(() => expect(screen.getByText(/Code sent via WhatsApp/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Change number' }));
    await waitFor(() =>
      expect(screen.getByPlaceholderText(PHONE_FIELD)).toBeTruthy(),
    );
    expect(radioChecked('WhatsApp')).toBe(true);
  });

  it('communicates an uncertain delivery without claiming failure', async () => {
    ctl.requestOtp.mockResolvedValue({
      success: false,
      possiblyDelivered: true,
      deliveryStatus: 'DELIVERY_TIMEOUT',
    });
    render(<LoginPage />);
    await toOtpRequestStage();

    fireEvent.click(screen.getByRole('button', { name: /Send via SMS/ }));
    await waitFor(() =>
      expect(screen.getByText(/Delivery status uncertain/)).toBeTruthy(),
    );
    // Still allows the user to attempt verification of a possibly-delivered code.
    expect(screen.getByRole('button', { name: 'Verify' })).toBeTruthy();
  });

  it('surfaces a definite rejection as an actionable error', async () => {
    ctl.requestOtp.mockResolvedValue({
      success: false,
      deliveryStatus: 'TWILIO_NOT_CONFIGURED',
    });
    render(<LoginPage />);
    await toOtpRequestStage();

    fireEvent.click(screen.getByRole('button', { name: /Send via SMS/ }));
    await waitFor(() =>
      expect(screen.getByText(/currently unavailable/i)).toBeTruthy(),
    );
  });

  it('surfaces rate limiting with retry guidance', async () => {
    ctl.requestOtp.mockRejectedValue(new FakeLoginRateLimitError('Too many requests', 0, 120));
    render(<LoginPage />);
    await toOtpRequestStage();

    fireEvent.click(screen.getByRole('button', { name: /Send via SMS/ }));
    await waitFor(() => expect(screen.getByText('Too many requests')).toBeTruthy());
    expect(screen.getByText(/Try again in 2 min/)).toBeTruthy();
  });

  it('exposes the channel controls to assistive tech as a labelled radiogroup', async () => {
    render(<LoginPage />);
    await toOtpRequestStage();
    expect(screen.getByRole('radiogroup', { name: 'Delivery channel' })).toBeTruthy();
  });
});
