import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * S1.38.2 §2 — Account linking UI.
 *
 * Exercises the Authentication Methods section added in S1.38 F-17 to
 * `apps/web/src/app/account/page.tsx`: display of current email/phone identity,
 * request + verify round-trip for linking a new email or phone, conflict +
 * expired-OTP surfacing, unlink round-trip, and the server's last-auth-method
 * rejection message.
 *
 * Mocks are registered at the resolved module specifier so both the account
 * page's relative import (`../../lib/auth`) and this test's `@/` alias (mapped
 * to `src/` via vitest.config.ts resolve.alias) point at the same module
 * identity.
 */

const { ctl, router } = vi.hoisted(() => {
  const ctl = {
    fetchProfile: vi.fn(),
    updateProfile: vi.fn(),
    fetchMyOrganizations: vi.fn(),
    fetchDevices: vi.fn(),
    unregisterDevice: vi.fn(),
    isAuthenticated: vi.fn(),
    switchOrg: vi.fn(),
    hasMerchantAccess: vi.fn(),
    requestEmailOtp: vi.fn(),
    requestOtp: vi.fn(),
    linkEmail: vi.fn(),
    linkPhone: vi.fn(),
    unlinkEmail: vi.fn(),
    unlinkPhone: vi.fn(),
    routerPush: vi.fn(),
    routerRefresh: vi.fn(),
    confirm: vi.fn(),
  };
  // Next's useRouter() hands back a stable object across renders. The account
  // page keeps `router` in an effect dependency array, so a fresh literal per
  // call would re-trigger the load effect forever.
  const router = {
    push: ctl.routerPush,
    replace: vi.fn(),
    refresh: ctl.routerRefresh,
    prefetch: vi.fn(),
  };
  return { ctl, router };
});

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/auth', () => ({
  isAuthenticated: () => ctl.isAuthenticated(),
  switchOrg: (...args: unknown[]) => ctl.switchOrg(...args),
  hasMerchantAccess: () => ctl.hasMerchantAccess(),
  requestEmailOtp: (...args: unknown[]) => ctl.requestEmailOtp(...args),
  requestOtp: (...args: unknown[]) => ctl.requestOtp(...args),
  linkEmail: (...args: unknown[]) => ctl.linkEmail(...args),
  linkPhone: (...args: unknown[]) => ctl.linkPhone(...args),
  unlinkEmail: (...args: unknown[]) => ctl.unlinkEmail(...args),
  unlinkPhone: (...args: unknown[]) => ctl.unlinkPhone(...args),
}));

vi.mock('@/lib/buyer-api', () => ({
  fetchProfile: (...args: unknown[]) => ctl.fetchProfile(...args),
  updateProfile: (...args: unknown[]) => ctl.updateProfile(...args),
  fetchMyOrganizations: (...args: unknown[]) => ctl.fetchMyOrganizations(...args),
  fetchDevices: (...args: unknown[]) => ctl.fetchDevices(...args),
  unregisterDevice: (...args: unknown[]) => ctl.unregisterDevice(...args),
}));

vi.mock('@/components/Shared', () => ({
  ErrorBanner: ({ message }: { message: string }) => <div role="alert">{message}</div>,
}));

vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  ),
  radii: { md: 8 },
  colors: {
    brand: { 500: '#brand500', 700: '#brand700', 900: '#brand900' },
    border: '#border',
    errBg: '#errBg',
    err: '#err',
    errBorder: '#errBorder',
    warnBg: '#warnBg',
    warn: '#warn',
    okBg: '#okBg',
    ok: '#ok',
    amber: '#amber',
    muted: '#muted',
  },
}));

import AccountPage from '@/app/account/page';

function baseProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    fullName: 'Test Buyer',
    email: 'buyer@test.com',
    phone: '+966500000001',
    locale: 'en',
    status: 'ACTIVE',
    ...overrides,
  };
}

async function renderAccount() {
  render(<AccountPage />);
  await waitFor(() => expect(screen.queryByText(/Loading account/)).toBeNull());
}

/** Index a query result without tripping `noUncheckedIndexedAccess`. */
function requireElement<T>(el: T | undefined, what: string): T {
  if (!el) throw new Error(`Missing ${what}`);
  return el;
}

describe('Account — authentication methods (S1.38.2)', () => {
  beforeEach(() => {
    // Call history is module-scoped, so reset every boundary before each test.
    Object.values(ctl).forEach((fn) => fn.mockReset());
    ctl.isAuthenticated.mockReturnValue(true);
    ctl.hasMerchantAccess.mockReturnValue(false);
    ctl.fetchProfile.mockResolvedValue(baseProfile());
    ctl.fetchMyOrganizations.mockResolvedValue([]);
    ctl.fetchDevices.mockResolvedValue([]);
    window.localStorage.clear();
    // Unlink is destructive, so the page gates it behind a confirmation dialog.
    ctl.confirm.mockReturnValue(true);
    vi.spyOn(window, 'confirm').mockImplementation(() => ctl.confirm());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('displays the current email and phone identities', async () => {
    await renderAccount();
    expect(screen.getByText('Authentication Methods')).toBeTruthy();
    // Section shows the linked email and phone (both present).
    expect(screen.getAllByText('buyer@test.com').length).toBeGreaterThan(0);
    expect(screen.getAllByText('+966500000001').length).toBeGreaterThan(0);
  });

  it('shows "Not linked" when email and phone are both absent, then offers a link form', async () => {
    ctl.fetchProfile.mockResolvedValue(
      baseProfile({ email: null, phone: null }),
    );
    await renderAccount();
    expect(screen.getAllByText('Not linked').length).toBe(2);
    expect(screen.getAllByPlaceholderText('you@example.com').length).toBeGreaterThan(0);
    expect(screen.getAllByPlaceholderText('+966 5XX XXX XXXX').length).toBeGreaterThan(0);
  });

  it('requests an email OTP then links on successful verification, refreshing the profile', async () => {
    ctl.fetchProfile.mockResolvedValue(
      baseProfile({ email: null }),
    );
    ctl.requestEmailOtp.mockResolvedValue({ success: true });
    ctl.linkEmail.mockResolvedValue({ success: true });
    await renderAccount();
    const callsBefore = ctl.fetchProfile.mock.calls.length;

    // Step 1 — request OTP.
    const emailInput = screen.getByPlaceholderText('you@example.com');
    fireEvent.change(emailInput, { target: { value: 'new@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));

    await waitFor(() => expect(ctl.requestEmailOtp).toHaveBeenCalledWith('new@test.com'));
    await waitFor(() => expect(screen.getByText(/Code sent to new@test.com/)).toBeTruthy());

    // Step 2 — submit OTP.
    const otpInput = screen.getByPlaceholderText('123456');
    fireEvent.change(otpInput, { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));

    await waitFor(() =>
      expect(ctl.linkEmail).toHaveBeenCalledWith('new@test.com', '654321'),
    );
    await waitFor(() =>
      expect(screen.getByText(/Email new@test.com linked successfully/)).toBeTruthy(),
    );
    // Profile is refreshed after a successful link.
    await waitFor(() =>
      expect(ctl.fetchProfile.mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });

  it('requests a phone OTP then links on successful verification', async () => {
    ctl.fetchProfile.mockResolvedValue(
      baseProfile({ phone: null }),
    );
    ctl.requestOtp.mockResolvedValue({ success: true, deliveryStatus: 'SENT' });
    ctl.linkPhone.mockResolvedValue({ success: true });
    await renderAccount();

    const phoneInput = screen.getByPlaceholderText('+966 5XX XXX XXXX');
    fireEvent.change(phoneInput, { target: { value: '+966500000099' } });
    fireEvent.click(requireElement(screen.getAllByRole('button', { name: 'Send OTP' })[0], 'phone Send OTP button'));

    await waitFor(() =>
      expect(ctl.requestOtp).toHaveBeenCalledWith('+966500000099', 'sms'),
    );
    await waitFor(() =>
      expect(screen.getByText(/Code sent to \+966500000099/)).toBeTruthy(),
    );

    const otpInput = screen.getByPlaceholderText('123456');
    fireEvent.change(otpInput, { target: { value: '246810' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));

    await waitFor(() =>
      expect(ctl.linkPhone).toHaveBeenCalledWith('+966500000099', '246810'),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Phone \+966500000099 linked successfully/),
      ).toBeTruthy(),
    );
  });

  it('re-renders the linked identity from the refreshed profile, not from local input state', async () => {
    let emailLinked = false;
    ctl.fetchProfile.mockImplementation(async () =>
      baseProfile({ email: emailLinked ? 'new@test.com' : null }),
    );
    ctl.requestEmailOtp.mockResolvedValue({ success: true });
    ctl.linkEmail.mockImplementation(async () => {
      emailLinked = true;
      return { success: true };
    });
    await renderAccount();

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'new@test.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
    await waitFor(() => expect(screen.getByText(/Code sent to/)).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText('123456'), {
      target: { value: '654321' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));

    // The displayed identity comes from the server profile after the refresh.
    await waitFor(() =>
      expect(
        screen.getByText('Email new@test.com linked successfully.'),
      ).toBeTruthy(),
    );
    // The row flips from a link form to a linked identity with a Remove control.
    await waitFor(() =>
      expect(screen.getAllByText('new@test.com').length).toBeGreaterThan(0),
    );
    expect(screen.getAllByRole('button', { name: 'Remove' }).length).toBeGreaterThan(0);
    expect(screen.queryByPlaceholderText('you@example.com')).toBeNull();
  });

  it('surfaces the server ownership-conflict message (409)', async () => {
    ctl.fetchProfile.mockResolvedValue(baseProfile({ email: null }));
    ctl.requestEmailOtp.mockResolvedValue({ success: true });
    ctl.linkEmail.mockRejectedValue(
      new Error('EMAIL_ALREADY_IN_USE: already linked to another account'),
    );
    await renderAccount();

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'taken@test.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
    await waitFor(() => expect(screen.getByText(/Code sent to/)).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText('123456'), {
      target: { value: '111111' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));

    await waitFor(() =>
      expect(screen.getByText(/already linked to another account/)).toBeTruthy(),
    );
  });

  it('surfaces an invalid-OTP error from the verify submission', async () => {
    ctl.fetchProfile.mockResolvedValue(baseProfile({ email: null }));
    ctl.requestEmailOtp.mockResolvedValue({ success: true });
    ctl.linkEmail.mockRejectedValue(new Error('Email OTP verify failed: 401'));
    await renderAccount();

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'new@test.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
    await waitFor(() => expect(screen.getByText(/Code sent to/)).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText('123456'), {
      target: { value: '000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));

    await waitFor(() =>
      expect(screen.getByText(/Email OTP verify failed: 401/)).toBeTruthy(),
    );
    // The verify stage stays open so the code can be corrected, and the
    // identity row is still reported as not linked.
    expect(screen.getByPlaceholderText('123456')).toBeTruthy();
    expect(screen.getAllByText('Not linked').length).toBeGreaterThan(0);
  });

  it('surfaces an invalid or expired OTP error', async () => {
    ctl.fetchProfile.mockResolvedValue(baseProfile({ email: null }));
    ctl.requestEmailOtp.mockResolvedValue({ success: true });
    ctl.linkEmail.mockRejectedValue(new Error('OTP expired'));
    await renderAccount();

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'new@test.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
    await waitFor(() => expect(screen.getByText(/Code sent to/)).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText('123456'), {
      target: { value: '000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));

    await waitFor(() => expect(screen.getByText(/OTP expired/)).toBeTruthy());
  });

  it('unlink email refreshes the profile and returns to the Not-linked state', async () => {
    // Server state is modelled explicitly so the assertion is about what the UI
    // shows after the refresh, not about how many fetches the page happened to make.
    let emailLinked = true;
    ctl.fetchProfile.mockImplementation(async () =>
      baseProfile({ email: emailLinked ? 'buyer@test.com' : null }),
    );
    ctl.unlinkEmail.mockImplementation(async () => {
      emailLinked = false;
      return { success: true };
    });
    await renderAccount();
    expect(screen.getAllByText('buyer@test.com').length).toBeGreaterThan(0);
    const callsBefore = ctl.fetchProfile.mock.calls.length;

    // Email is the first identity row, so its Remove control is index 0.
    fireEvent.click(requireElement(screen.getAllByRole('button', { name: 'Remove' })[0], 'email Remove button'));

    await waitFor(() => expect(ctl.unlinkEmail).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText('Email removed from account.')).toBeTruthy(),
    );
    // Profile is re-fetched after the unlink succeeds and reflects the removal.
    await waitFor(() =>
      expect(ctl.fetchProfile.mock.calls.length).toBeGreaterThan(callsBefore),
    );
    await waitFor(() =>
      expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy(),
    );
    expect(screen.getAllByText('Not linked').length).toBeGreaterThan(0);
  });

  it('unlink phone refreshes the profile through unlinkPhone', async () => {
    let phoneLinked = true;
    ctl.fetchProfile.mockImplementation(async () =>
      baseProfile({ phone: phoneLinked ? '+966500000001' : null }),
    );
    ctl.unlinkPhone.mockImplementation(async () => {
      phoneLinked = false;
      return { success: true };
    });
    await renderAccount();
    const callsBefore = ctl.fetchProfile.mock.calls.length;

    // Phone is the second identity row.
    fireEvent.click(requireElement(screen.getAllByRole('button', { name: 'Remove' })[1], 'phone Remove button'));

    await waitFor(() => expect(ctl.unlinkPhone).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText('Phone removed from account.')).toBeTruthy(),
    );
    await waitFor(() =>
      expect(ctl.fetchProfile.mock.calls.length).toBeGreaterThan(callsBefore),
    );
    await waitFor(() =>
      expect(screen.getByPlaceholderText('+966 5XX XXX XXXX')).toBeTruthy(),
    );
  });

  it('surfaces the server-side last-auth-method rejection when unlinking the only identifier', async () => {
    ctl.unlinkEmail.mockRejectedValue(
      new Error('cannot remove your only sign-in method'),
    );
    await renderAccount();
    const callsBefore = ctl.fetchProfile.mock.calls.length;

    fireEvent.click(requireElement(screen.getAllByRole('button', { name: 'Remove' })[0], 'email Remove button'));

    await waitFor(() =>
      expect(screen.getByText(/cannot remove your only sign-in method/)).toBeTruthy(),
    );
    // The identity must remain displayed — nothing was removed locally.
    expect(screen.getAllByText('buyer@test.com').length).toBeGreaterThan(0);
    expect(ctl.fetchProfile.mock.calls.length).toBe(callsBefore);
  });

  it('skips the unlink call when the confirmation dialog is declined', async () => {
    ctl.confirm.mockReturnValue(false);
    await renderAccount();
    const callsBefore = ctl.fetchProfile.mock.calls.length;

    fireEvent.click(requireElement(screen.getAllByRole('button', { name: 'Remove' })[0], 'email Remove button'));

    expect(ctl.unlinkEmail).not.toHaveBeenCalled();
    expect(ctl.unlinkPhone).not.toHaveBeenCalled();
    expect(ctl.fetchProfile.mock.calls.length).toBe(callsBefore);
  });

  it('does not merge accounts automatically — the email row remains "Not linked" after a conflict', async () => {
    ctl.fetchProfile.mockResolvedValue(baseProfile({ email: null }));
    ctl.requestEmailOtp.mockResolvedValue({ success: true });
    ctl.linkEmail.mockRejectedValue(new Error('EMAIL_ALREADY_IN_USE'));
    await renderAccount();

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'conflict@test.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
    await waitFor(() => expect(screen.getByText(/Code sent to/)).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText('123456'), {
      target: { value: '111111' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    await waitFor(() => expect(screen.getByText(/EMAIL_ALREADY_IN_USE/)).toBeTruthy());

    // The email row remains "Not linked"; the profile was never re-fetched
    // after the failure, so no data merge happened client-side.
    expect(screen.getAllByText('Not linked').length).toBeGreaterThan(0);
    expect(ctl.linkEmail).toHaveBeenCalledTimes(1); // no retry without a user action
  });

  it('Cancel on the email verify stage returns to the idle request stage', async () => {
    ctl.fetchProfile.mockResolvedValue(baseProfile({ email: null }));
    ctl.requestEmailOtp.mockResolvedValue({ success: true });
    await renderAccount();

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'cancel@test.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
    await waitFor(() => expect(screen.getByText(/Code sent to/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send OTP' })).toBeTruthy(),
    );
    expect(screen.queryByPlaceholderText('123456')).toBeNull();
  });
});
