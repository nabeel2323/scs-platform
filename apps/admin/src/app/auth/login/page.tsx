'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { classifyOtpDelivery, type OtpDeliveryOutcome } from '@scs/contracts';
import {
  requestOtp,
  verifyOtp,
  requestEmailOtp,
  verifyEmailOtp,
  loginPassword,
  LoginRateLimitError,
} from '@/lib/auth';
import { fetchBootstrapStatus, type BootstrapStatus } from '@/lib/bootstrap';
import { getDeviceId } from '@/lib/device-id';
import { PHONE_OTP_UI_ENABLED } from '@/lib/auth-channels';
import {
  Button, TextInput,
  colors, typeScale, radii, shadows, transitions, brand,
} from '@scs/ui-kit';

type PageStatus = 'loading' | 'initialized' | 'setup-required' | 'error';

/** Human-friendly wait time for the lockout countdown. */
function formatWait(seconds: number): string {
  if (!seconds || seconds <= 0) return 'a moment';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.ceil(seconds / 60)} min`;
}

/** Platform initialization gate — API-owned, never localStorage/config. */
type InitStatus = 'loading' | 'initialized' | 'setup-required' | 'error';

type LoginMode = 'password' | 'otp' | 'email-otp';
type OtpStage = 'request' | 'verify';

/**
 * What to tell the admin when the OTP request came back without a code.
 */
function deliveryMessage(outcome: Exclude<OtpDeliveryOutcome, 'delivered'>, phone: string): string {
  switch (outcome) {
    case 'unavailable':
      // Email-only release: the allowlist refuses this channel before any
      // provider is touched, so "enable the SMS provider" would be advice that
      // cannot apply. Point at the channel that IS available instead.
      return `OTP delivery isn't available in this environment, so nothing was sent to ${phone}. Sign in with email instead.`;
    case 'uncertain':
      return `We couldn't confirm that a code reached ${phone}. It may still arrive — if it does, you can enter it below.`;
    default:
      return `The code couldn't be sent to ${phone}. Check the number and try again.`;
  }
}

/**
 * Same honesty rule for the EMAIL channel (the default for the email-only
 * release): never claim a code was sent unless the API said success:true.
 * 'unavailable' (provider not configured, or the channel disabled by the
 * deployment's OTP_CHANNELS allowlist) must not pitch a retry that cannot work.
 */
function emailDeliveryMessage(outcome: Exclude<OtpDeliveryOutcome, 'delivered'>, email: string): string {
  switch (outcome) {
    case 'unavailable':
      return `Email delivery isn't available in this environment, so nothing was sent to ${email}. Sign in with email and password, or ask the platform team to enable email delivery.`;
    case 'uncertain':
      return `We couldn't confirm that a code reached ${email}. It may still arrive — if it does, you can enter it below.`;
    default:
      return `The code couldn't be sent to ${email}. Check the address and try again.`;
  }
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>('password');
  const [otpStage, setOtpStage] = useState<'request' | 'verify'>('request');

  // Email/password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // OTP state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');

  // Email OTP state (default OTP channel). The address reuses `email` above,
  // shared with the password tab exactly as the web app does.
  const [emailOtp, setEmailOtp] = useState('');
  const [emailOtpStage, setEmailOtpStage] = useState<'request' | 'verify'>('request');
  const [emailDeliveryNote, setEmailDeliveryNote] = useState<'sent' | 'uncertain' | null>(null);

  /**
   * How the code got here, so the verify step can describe it truthfully.
   * 'sent' only ever follows an accepted delivery; 'uncertain' follows a
   * timeout where the code may or may not have been delivered.
   */
  const [deliveryNote, setDeliveryNote] = useState<'sent' | 'uncertain' | null>(null);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rateLimit, setRateLimit] = useState<{
    message: string;
    remaining: number;
    retryAfter: number;
  } | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  // Platform initialization gate — API-owned. The frontend must never decide
  // initialization from localStorage or config. If no Super Admin exists,
  // route to first-time setup instead of login.
  const [initStatus, setInitStatus] = useState<InitStatus>('loading');
  const [initError, setInitError] = useState<string | null>(null);

  // Second-by-second countdown while the server has us locked out, so the
  // retry affordance disappears exactly when the API says it may work again.
  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const t = setTimeout(() => setLockoutRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [lockoutRemaining]);

  /**
   * Guards duplicate sends. A double-click or a re-submitted form used to fire
   * two OTP requests, which burned the caller's rate budget and left two
   * challenges live for one number. Checked synchronously, before any await,
   * because React state only settles after the handler returns.
   */
  const otpInFlight = useRef(false);

  // Pre-fill the last admin email. Nothing else happens on mount: the
  // device-trust pre-flight this used to make asked an unauthenticated endpoint
  // whether the account had a password and whether the device was trusted,
  // which is exactly the disclosure finding S-2 removed. The login call itself
  // now answers all of it.
  useEffect(() => {
    const storedEmail =
      typeof window !== 'undefined' ? localStorage.getItem('scs_last_email') : null;
    if (storedEmail) setEmail(storedEmail);
  }, []);

  // Platform initialization gate — API-owned. The frontend must never decide
  // initialization from localStorage or config. If no Super Admin exists,
  // route to first-time setup instead of login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await fetchBootstrapStatus();
        if (cancelled) return;
        if (status.setupRequired) {
          setInitStatus('setup-required');
          void router.push('/bootstrap');
        } else {
          setInitStatus('initialized');
        }
      } catch (err: any) {
        if (cancelled) return;
        setInitStatus('error');
        setInitError(
          err?.message || 'Unable to reach the platform. Please check your connection and try again.',
        );
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  /** Records a 429 and starts the countdown the retry affordance obeys. */
  function noteRateLimit(err: LoginRateLimitError) {
    setRateLimit({
      message: err.message,
      remaining: err.remainingAttempts,
      retryAfter: err.retryAfterSeconds,
    });
    setLockoutRemaining(err.remainingAttempts > 0 ? 0 : err.retryAfterSeconds);
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setRateLimit(null);
    setLoading(true);
    try {
      const result = await loginPassword(email, password, getDeviceId());
      if ('requiresOtp' in result) {
        // The server chose the channel from this release's allowlist and
        // reports how confidently the send went. Mirror BOTH instead of
        // assuming phone: under `OTP_CHANNELS=email` an admin account that
        // also has a phone number receives its second factor by email, and a
        // phone form could never verify a challenge stored under an email key.
        const accepted = result.otpDelivery === 'accepted';
        const unconfirmedMessage =
          'This device needs a second factor. We could not confirm the code was delivered, but you can enter it if it arrives.';

        if (!result.otpPhone && result.otpEmail) {
          // `otpEmail` is masked and only signals the channel. The verify
          // endpoint takes the address from the body, and the page already
          // holds the full address the admin authenticated with.
          setMode('email-otp');
          setEmailOtpStage('verify');
          setEmailOtp('');
          setEmailDeliveryNote(accepted ? 'sent' : 'uncertain');
          setError(
            accepted
              ? 'New device detected. Enter the code emailed to you to continue.'
              : unconfirmedMessage,
          );
        } else {
          setPhone(result.otpPhone);
          setMode('otp');
          setOtpStage('verify');
          // 'uncertain' gets the maybe-arrived wording; only 'accepted' may
          // claim a code was sent.
          setDeliveryNote(accepted ? 'sent' : 'uncertain');
          setError(
            accepted
              ? 'New device detected. Enter the OTP sent to your phone to continue.'
              : unconfirmedMessage,
          );
        }
        setLoading(false);
        return;
      }
      localStorage.setItem('scs_last_email', email);
      router.push('/');
    } catch (err: any) {
      if (err instanceof LoginRateLimitError) {
        noteRateLimit(err);
      } else {
        setError(err.message || 'Login failed');
      }
      setLoading(false);
    }
  }

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    // Belt-and-braces: the UI entry points are already gated, but no admin
    // action may reach the phone endpoint while the release is email-only.
    if (!PHONE_OTP_UI_ENABLED) return;
    if (otpInFlight.current || lockoutRemaining > 0) return;
    otpInFlight.current = true;
    setError('');
    setRateLimit(null);
    setDeliveryNote(null);
    setLoading(true);
    try {
      // HTTP 200 here is not delivery: the API reports the provider's answer in
      // the body. Only an accepted outcome moves to code entry (finding S-1's
      // "silently treated as success" defect). A timeout is NOT advanced past:
      // delivery is unknown, so the admin stays on this step and is offered an
      // explicit, un-urged choice to enter a code that happens to arrive.
      const result = await requestOtp(phone);
      const outcome = classifyOtpDelivery(result);
      if (outcome === 'delivered') {
        setDeliveryNote('sent');
        setOtpStage('verify');
      } else {
        setDeliveryNote(outcome === 'uncertain' ? 'uncertain' : null);
        setError(deliveryMessage(outcome, phone));
      }
    } catch (err: any) {
      if (err instanceof LoginRateLimitError) {
        noteRateLimit(err);
      } else {
        setError(err.message || 'Failed to send OTP');
      }
    } finally {
      otpInFlight.current = false;
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otpInFlight.current) return;
    otpInFlight.current = true;
    setError('');
    setLoading(true);
    try {
      await verifyOtp(phone, otp);
      if (email) localStorage.setItem('scs_last_email', email);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Invalid OTP');
      setLoading(false);
    } finally {
      otpInFlight.current = false;
    }
  }

  async function handleRequestEmailOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otpInFlight.current || lockoutRemaining > 0) return;
    otpInFlight.current = true;
    setError('');
    setRateLimit(null);
    setEmailDeliveryNote(null);
    setLoading(true);
    try {
      // Identical contract to the phone channel: HTTP 200 is not delivery.
      // Only success:true (classified 'delivered') advances to code entry; an
      // ambiguous timeout stays here with an explicit, un-urged "Enter it"
      // choice, and unavailable/rejected get their own honest copy.
      const result = await requestEmailOtp(email);
      const outcome = classifyOtpDelivery(result);
      if (outcome === 'delivered') {
        setEmailDeliveryNote('sent');
        setEmailOtpStage('verify');
      } else {
        setEmailDeliveryNote(outcome === 'uncertain' ? 'uncertain' : null);
        setError(emailDeliveryMessage(outcome, email));
      }
    } catch (err: any) {
      if (err instanceof LoginRateLimitError) {
        noteRateLimit(err);
      } else {
        // A 404 arrives here as the lib's "not enabled in this environment"
        // message (server feature flag off) — shown verbatim, not genericised.
        setError(err.message || 'Failed to send email code');
      }
    } finally {
      otpInFlight.current = false;
      setLoading(false);
    }
  }

  async function handleVerifyEmailOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otpInFlight.current) return;
    otpInFlight.current = true;
    setError('');
    setLoading(true);
    try {
      await verifyEmailOtp(email, emailOtp);
      localStorage.setItem('scs_last_email', email);
      router.push('/');
    } catch (err: any) {
      if (err instanceof LoginRateLimitError) {
        noteRateLimit(err);
      } else {
        setError(err.message || 'Invalid OTP');
      }
      setLoading(false);
    } finally {
      otpInFlight.current = false;
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${brand[900]} 0%, ${brand[500]} 50%, ${brand[900]} 100%)` }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 24px' }}>
        {/* Logo / Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56, borderRadius: radii.lg,
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
            marginBottom: 16, backdropFilter: 'blur(8px)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                background: 'rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.8)',
                borderRadius: radii.sm,
                ...typeScale.caption,
                fontWeight: 700,
                letterSpacing: '0.5px',
              }}
            >
              ADMIN CONSOLE
            </span>
          </div>
          <h1 style={{ ...typeScale.display, color: '#fff', margin: '16px 0 4px' }}>
            Welcome back
          </h1>
          <p style={{ ...typeScale.body, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
            Sign in to your admin account
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: colors.surface, borderRadius: radii.lg + 2, padding: '32px 28px',
          boxShadow: shadows.xl,
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${colors.border}`, marginBottom: 24 }}>
            <button
              type="button"
              onClick={() => { setMode('password'); setError(''); }}
              style={tabStyle(mode === 'password')}
            >
              Email/Password
            </button>
            <button
              type="button"
              onClick={() => { setMode('email-otp'); setError(''); }}
              style={tabStyle(mode !== 'password')}
            >
              Email OTP
            </button>
          </div>

          {error && (
            <div
              style={{
                background: colors.errBg,
                color: colors.err,
                padding: '10px 14px',
                borderRadius: radii.sm,
                marginBottom: 16,
                ...typeScale.body,
                border: `1px solid ${colors.err}33`,
              }}
            >
              {error}
            </div>
          )}

          {rateLimit && (
            <div
              style={{
                background: colors.warnBg,
                color: colors.warn,
                border: `1px solid ${colors.amber}`,
                padding: '10px 14px',
                borderRadius: radii.sm,
                marginBottom: 16,
                ...typeScale.body,
              }}
            >
              <strong>{rateLimit!.message}</strong>
              <div style={{ marginTop: 4, ...typeScale.bodySm }}>
                {rateLimit!.remaining > 0
                  ? `${rateLimit!.remaining} attempt${rateLimit!.remaining === 1 ? '' : 's'} remaining before a temporary lock.`
                  : `Locked temporarily. Try again in ${formatWait(lockoutRemaining || rateLimit!.retryAfter)}.`}
              </div>
            </div>
          )}

          {mode === 'password' ? (
            <form onSubmit={handlePasswordLogin}>
              <TextInput
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
                style={{ marginBottom: 16 }}
              />
              <TextInput
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                style={{ marginBottom: 16 }}
              />
              <Button type="submit" disabled={loading} size="lg" style={{ width: '100%', marginBottom: 8 }}>
                {loading ? 'Logging in...' : 'Login'}
              </Button>
              <p style={{ ...typeScale.bodySm, color: colors.muted, textAlign: 'center', marginTop: 12 }}>
                Don&apos;t have a password yet?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('email-otp'); setError(''); }}
                  style={linkBtnStyle}
                >
                  Sign in with OTP
                </button>
              </p>
            </form>
          ) : mode === 'email-otp' ? (
            emailOtpStage === 'request' ? (
              <form onSubmit={handleRequestEmailOtp}>
                <TextInput
                  label="Admin email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  style={{ marginBottom: 16 }}
                />
                <Button
                  type="submit"
                  disabled={loading || lockoutRemaining > 0}
                  size="lg"
                  style={{ width: '100%', marginBottom: 8 }}
                >
                  {lockoutRemaining > 0
                    ? `Try again in ${formatWait(lockoutRemaining)}`
                    : loading
                      ? 'Sending...'
                      : 'Send code to email'}
                </Button>
                {/* Same un-urged affordance as the phone channel: only shown
                    after an UNCONFIRMED delivery, never claims a code exists. */}
                {emailDeliveryNote === 'uncertain' && (
                  <p style={{ ...typeScale.bodySm, color: colors.muted, textAlign: 'center', marginTop: 12 }}>
                    Already have a code?{' '}
                    <button
                      type="button"
                      onClick={() => setEmailOtpStage('verify')}
                      style={linkBtnStyle}
                    >
                      Enter it
                    </button>
                  </p>
                )}
                {/* The phone/SMS path is preserved for the separately approved
                    SMS phase but is NOT user-selectable in the email-only
                    release: the server allowlist refuses the channel, so the
                    affordance only renders when PHONE_OTP_UI_ENABLED is on. */}
                {PHONE_OTP_UI_ENABLED && (
                  <p style={{ ...typeScale.bodySm, color: colors.muted, textAlign: 'center', marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={() => { setMode('otp'); setError(''); }}
                      style={linkBtnStyle}
                    >
                      Use phone number instead
                    </button>
                  </p>
                )}
              </form>
            ) : (
              <form onSubmit={handleVerifyEmailOtp}>
                <p style={{ color: colors.muted, ...typeScale.body, marginBottom: 16 }}>
                  {/* 'sent' only follows success:true, and even then the copy
                      says "on its way" — the provider accepted, not delivered. */}
                  {emailDeliveryNote === 'uncertain'
                    ? `If a code arrived for ${email}, enter it below.`
                    : `A code is on its way to ${email}. Enter it below.`}
                </p>
                <TextInput
                  label="OTP code"
                  type="text"
                  value={emailOtp}
                  onChange={(e) => setEmailOtp(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  required
                  style={{ marginBottom: 16 }}
                />
                <Button type="submit" disabled={loading} size="lg" style={{ width: '100%', marginBottom: 8 }}>
                  {loading ? 'Verifying...' : 'Verify'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => {
                    setEmailOtpStage('request');
                    setEmailOtp('');
                    setEmailDeliveryNote(null);
                    setError('');
                  }}
                  style={{ width: '100%' }}
                >
                  Change email
                </Button>
              </form>
            )
          ) : otpStage === 'request' ? (
            <form onSubmit={handleRequestOtp}>
              <TextInput
                label="Admin phone number"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+966 5XX XXX XXXX"
                required
                style={{ marginBottom: 16 }}
              />
              <Button
                type="submit"
                disabled={loading || lockoutRemaining > 0}
                size="lg"
                style={{ width: '100%', marginBottom: 8 }}
              >
                {lockoutRemaining > 0
                  ? `Try again in ${formatWait(lockoutRemaining)}`
                  : loading
                    ? 'Sending...'
                    : 'Send OTP'}
              </Button>
              {/*
                  Only reached when the API reported an UNCONFIRMED delivery.
                  The code may exist in the admin's inbox, so offer the entry
                  step without ever stating that it was sent — and without
                  re-firing a request that would spend rate budget.
              */}
              {deliveryNote === 'uncertain' && (
                <p style={{ ...typeScale.bodySm, color: colors.muted, textAlign: 'center', marginTop: 12 }}>
                  Already have a code?{' '}
                  <button
                    type="button"
                    onClick={() => setOtpStage('verify')}
                    style={linkBtnStyle}
                  >
                    Enter it
                  </button>
                </p>
              )}
              <p style={{ ...typeScale.bodySm, color: colors.muted, textAlign: 'center', marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => { setMode('email-otp'); setError(''); }}
                  style={linkBtnStyle}
                >
                  Use email instead
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp}>
              <p style={{ color: colors.muted, ...typeScale.body, marginBottom: 16 }}>
                {/* The wording tracks what the server actually reported. Never
                    "Code sent" after a timeout or a rejection. */}
                {deliveryNote === 'uncertain'
                  ? `If a code arrived for ${phone}, enter it below.`
                  : `Code sent to ${phone}`}
              </p>
              <TextInput
                label="OTP code"
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                maxLength={6}
                required
                style={{ marginBottom: 16 }}
              />
              <Button type="submit" disabled={loading} size="lg" style={{ width: '100%', marginBottom: 8 }}>
                {loading ? 'Verifying...' : 'Verify'}
              </Button>
              {/* "Change number" re-opens the phone REQUEST form — a
                  user-initiated SMS send the email-only release refuses — so
                  it is gated on the same flag. The verify step itself stays
                  reachable for a server-issued phone challenge. */}
              {PHONE_OTP_UI_ENABLED && (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => {
                    setOtpStage('request');
                    setDeliveryNote(null);
                    setError('');
                  }}
                  style={{ width: '100%' }}
                >
                  Change number
                </Button>
              )}
            </form>
          )}

          {(mode === 'otp' || mode === 'email-otp') && (
            <p style={{ ...typeScale.bodySm, color: colors.muted, textAlign: 'center', marginTop: 12 }}>
              Have a password?{' '}
              <button
                type="button"
                onClick={() => { setMode('password'); setError(''); }}
                style={linkBtnStyle}
              >
                Sign in with Email/Password
              </button>
            </p>
          )}
        </div>
      </div>
    </main>
  );

  // ── initialization gating ────────────────────────────────────────
  // If setup is required and we haven't redirected yet (defensive), go to
  // bootstrap. If the API is unreachable, do NOT assume uninitialized — show
  // the error state instead.
  if (initStatus === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: colors.bgSubtle, color: colors.muted, ...typeScale.body }}>
        Checking platform…
      </div>
    );
  }

  if (initStatus === 'setup-required') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: colors.bgSubtle, color: colors.muted, ...typeScale.body }}>
        Opening administrator setup…
      </div>
    );
  }

  if (initStatus === 'error') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: colors.bgSubtle, padding: '0 24px' }}>
        <div style={{ maxWidth: 520, width: '100%', textAlign: 'center', padding: '40px 32px', background: colors.surface, borderRadius: radii.lg + 2, border: `1px solid ${colors.border}`, boxShadow: '0 24px 48px rgba(0,0,0,0.12)' }}>
          <div style={{ ...typeScale.h3, color: colors.ink, margin: '0 0 10px' }}>{initError}</div>
          <button
            onClick={() => { setInitError(null); setInitStatus('loading'); }}
            style={{ marginTop: 14, background: brand[700], color: '#fff', border: 'none', padding: '8px 18px', borderRadius: radii.sm, cursor: 'pointer', fontWeight: 600 }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (initStatus !== 'initialized') {
    return null;
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${brand[900]} 0%, ${brand[500]} 50%, ${brand[900]} 100%)`, padding: '0 24px' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 24px' }}>
        {/* Logo / Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56, borderRadius: radii.lg,
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
            marginBottom: 16, backdropFilter: 'blur(8px)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                background: 'rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.8)',
                borderRadius: radii.sm,
                ...typeScale.caption,
                fontWeight: 700,
                letterSpacing: '0.5px',
              }}
            >
              ADMIN CONSOLE
            </span>
          </div>
          <h1 style={{ ...typeScale.display, color: '#fff', margin: '16px 0 4px' }}>
            Welcome back
          </h1>
          <p style={{ ...typeScale.body, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
            Sign in to your admin account
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: colors.surface, borderRadius: radii.lg + 2, padding: '32px 28px',
          boxShadow: shadows.xl,
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${colors.border}`, marginBottom: 24 }}>
            <button
              type="button"
              onClick={() => { setMode('password'); setError(''); }}
              style={tabStyle(mode === 'password')}
            >
              Email/Password
            </button>
            <button
              type="button"
              onClick={() => { setMode('email-otp'); setError(''); }}
              style={tabStyle(mode !== 'password')}
            >
              Email OTP
            </button>
          </div>

          {error && (
            <div
              style={{
                background: colors.errBg,
                color: colors.err,
                padding: '10px 14px',
                borderRadius: radii.sm,
                marginBottom: 16,
                ...typeScale.body,
                border: `1px solid ${colors.err}33`,
              }}
            >
              {error}
            </div>
          )}

          {rateLimit && (
            <div
              style={{
                background: colors.warnBg,
                color: colors.warn,
                border: `1px solid ${colors.amber}`,
                padding: '10px 14px',
                borderRadius: radii.sm,
                marginBottom: 16,
                ...typeScale.body,
              }}
            >
              <strong>{rateLimit!.message}</strong>
              <div style={{ marginTop: 4, ...typeScale.bodySm }}>
                {rateLimit!.remaining > 0
                  ? `${rateLimit!.remaining} attempt${rateLimit!.remaining === 1 ? '' : 's'} remaining before a temporary lock.`
                  : `Locked temporarily. Try again in ${formatWait(lockoutRemaining || rateLimit!.retryAfter)}.`}
              </div>
            </div>
          )}

          {mode === 'password' ? (
            <form onSubmit={handlePasswordLogin}>
              <TextInput
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
                style={{ marginBottom: 16 }}
              />
              <TextInput
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                style={{ marginBottom: 16 }}
              />
              <Button type="submit" disabled={loading} size="lg" style={{ width: '100%', marginBottom: 8 }}>
                {loading ? 'Logging in...' : 'Login'}
              </Button>
              <p style={{ ...typeScale.bodySm, color: colors.muted, textAlign: 'center', marginTop: 12 }}>
                Don&apos;t have a password yet?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('email-otp'); setError(''); }}
                  style={linkBtnStyle}
                >
                  Sign in with OTP
                </button>
              </p>
            </form>
          ) : mode === 'email-otp' ? (
            emailOtpStage === 'request' ? (
              <form onSubmit={handleRequestEmailOtp}>
                <TextInput
                  label="Admin email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  style={{ marginBottom: 16 }}
                />
                <Button
                  type="submit"
                  disabled={loading || lockoutRemaining > 0}
                  size="lg"
                  style={{ width: '100%', marginBottom: 8 }}
                >
                  {lockoutRemaining > 0
                    ? `Try again in ${formatWait(lockoutRemaining)}`
                    : loading
                      ? 'Sending...'
                      : 'Send code to email'}
                </Button>
                {emailDeliveryNote === 'uncertain' && (
                  <p style={{ ...typeScale.bodySm, color: colors.muted, textAlign: 'center', marginTop: 12 }}>
                    Already have a code?{' '}
                    <button
                      type="button"
                      onClick={() => setEmailOtpStage('verify')}
                      style={linkBtnStyle}
                    >
                      Enter it
                    </button>
                  </p>
                )}
                {PHONE_OTP_UI_ENABLED && (
                  <p style={{ ...typeScale.bodySm, color: colors.muted, textAlign: 'center', marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={() => { setMode('otp'); setError(''); }}
                      style={linkBtnStyle}
                    >
                      Use phone number instead
                    </button>
                  </p>
                )}
              </form>
            ) : (
              <form onSubmit={handleVerifyEmailOtp}>
                <p style={{ color: colors.muted, ...typeScale.body, marginBottom: 16 }}>
                  {emailDeliveryNote === 'uncertain'
                    ? `If a code arrived for ${email}, enter it below.`
                    : `A code is on its way to ${email}. Enter it below.`}
                </p>
                <TextInput
                  label="OTP code"
                  type="text"
                  value={emailOtp}
                  onChange={(e) => setEmailOtp(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  required
                  style={{ marginBottom: 16 }}
                />
                <Button type="submit" disabled={loading} size="lg" style={{ width: '100%', marginBottom: 8 }}>
                  {loading ? 'Verifying...' : 'Verify'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => {
                    setEmailOtpStage('request');
                    setEmailOtp('');
                    setEmailDeliveryNote(null);
                    setError('');
                  }}
                  style={{ width: '100%' }}
                >
                  Change email
                </Button>
              </form>
            )
          ) : otpStage === 'request' ? (
            <form onSubmit={handleRequestOtp}>
              <TextInput
                label="Admin phone number"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+966 5XX XXX XXXX"
                required
                style={{ marginBottom: 16 }}
              />
              <Button
                type="submit"
                disabled={loading || lockoutRemaining > 0}
                size="lg"
                style={{ width: '100%', marginBottom: 8 }}
              >
                {lockoutRemaining > 0
                  ? `Try again in ${formatWait(lockoutRemaining)}`
                  : loading
                    ? 'Sending...'
                    : 'Send OTP'}
                </Button>
                {deliveryNote === 'uncertain' && (
                  <p style={{ ...typeScale.bodySm, color: colors.muted, textAlign: 'center', marginTop: 12 }}>
                    Already have a code?{' '}
                    <button
                      type="button"
                      onClick={() => setOtpStage('verify')}
                      style={linkBtnStyle}
                    >
                      Enter it
                    </button>
                  </p>
                )}
                <p style={{ ...typeScale.bodySm, color: colors.muted, textAlign: 'center', marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => { setMode('email-otp'); setError(''); }}
                    style={linkBtnStyle}
                  >
                    Use email instead
                  </button>
                </p>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp}>
              <p style={{ color: colors.muted, ...typeScale.body, marginBottom: 16 }}>
                {deliveryNote === 'uncertain'
                  ? `If a code arrived for ${phone}, enter it below.`
                  : `Code sent to ${phone}`}
              </p>
              <TextInput
                label="OTP code"
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                maxLength={6}
                required
                style={{ marginBottom: 16 }}
              />
              <Button type="submit" disabled={loading} size="lg" style={{ width: '100%', marginBottom: 8 }}>
                {loading ? 'Verifying...' : 'Verify'}
              </Button>
              {PHONE_OTP_UI_ENABLED && (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => {
                    setOtpStage('request');
                    setDeliveryNote(null);
                    setError('');
                  }}
                  style={{ width: '100%' }}
                >
                  Change number
                </Button>
              )}
            </form>
          )}

          {(mode === 'otp' || mode === 'email-otp') && (
            <p style={{ ...typeScale.bodySm, color: colors.muted, textAlign: 'center', marginTop: 12 }}>
              Have a password?{' '}
              <button
                type="button"
                onClick={() => { setMode('password'); setError(''); }}
                style={linkBtnStyle}
              >
                Sign in with Email/Password
              </button>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
const tabStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '10px 0',
  ...typeScale.body,
  fontWeight: 600,
  background: 'transparent',
  border: 'none',
  borderBottom: active ? `2px solid ${brand[700]}` : `2px solid transparent`,
  color: active ? brand[700] : colors.muted,
  cursor: 'pointer',
  marginBottom: -1,
  fontFamily: 'inherit',
});

const linkBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: brand[500],
  cursor: 'pointer',
  fontSize: typeScale.bodySm.fontSize,
  fontWeight: 600,
  lineHeight: typeScale.bodySm.lineHeight,
  padding: 0,
};
