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
import { getDeviceId } from '@/lib/device-id';
import { fetchProfile } from '@/lib/api';
import { PageHeader, colors, radii } from '@scs/ui-kit';

type LoginMode = 'password' | 'otp' | 'email-otp';
type OtpStage = 'request' | 'verify';
type OtpChannel = 'sms' | 'whatsapp';

/** Human-friendly wait time for the lockout countdown. */
function formatWait(seconds: number): string {
  if (!seconds || seconds <= 0) return 'a moment';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.ceil(seconds / 60)} min`;
}

/**
 * Copy for an OTP request the API did NOT confirm as delivered.
 *
 * `deliveryStatus` carries provider vocabulary (`SMS_PROVIDER_NOT_CONFIGURED`,
 * a raw provider reason, …) which is useless to a shopper and is not shown to
 * them; what they need is the distinction between "this environment cannot send
 * at all", "we don't know", and "that failed". 'uncertain' is deliberate: the
 * challenge is live, so a code may still land and the verify step is offered
 * with wording that does not claim it did.
 */
function deliveryMessage(
  outcome: Exclude<OtpDeliveryOutcome, 'delivered'>,
  destination: string,
  channelLabel: string,
): string {
  switch (outcome) {
    case 'unavailable':
      return `${channelLabel} delivery isn't available right now, so nothing was sent to ${destination}. Try a different method, or sign in with email and password.`;
    case 'uncertain':
      return `We couldn't confirm that a code reached ${destination}. It may still arrive — if it does, you can enter it.`;
    default:
      return `The code couldn't be sent to ${destination}. Check the number and try again, or use another delivery method.`;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>('password');
  const [otpStage, setOtpStage] = useState<OtpStage>('request');

  // Email/password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // OTP state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [channel, setChannel] = useState<OtpChannel>('sms');
  /**
   * What the API actually reported about delivery, so the copy can match it:
   * 'sent' only ever follows an accepted send, 'uncertain' a timeout.
   */
  const [deliveryNote, setDeliveryNote] = useState<'sent' | 'uncertain' | null>(null);

  // Email OTP state
  const [emailOtp, setEmailOtp] = useState('');
  const [emailOtpStage, setEmailOtpStage] = useState<OtpStage>('request');
  const [emailDeliveryNote, setEmailDeliveryNote] = useState<'sent' | 'uncertain' | null>(null);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [rateLimit, setRateLimit] = useState<{
    message: string;
    remaining: number;
    retryAfter: number;
  } | null>(null);

  // Pre-fill the last email. The device-trust pre-flight this used to fire on
  // mount is gone: it asked an unauthenticated endpoint whether the account had
  // a password and whether this device had been trusted before, which is the
  // disclosure finding S-2 removed. The login call answers all of that itself,
  // from the server-issued credential.
  useEffect(() => {
    const storedEmail =
      typeof window !== 'undefined' ? localStorage.getItem('scs_last_email') : null;
    if (storedEmail) setEmail(storedEmail);
  }, []);

  // Shared post-login redirect: new buyers with no org go to merchant registration.
  async function redirectAfterLogin() {
    setVerified(true);
    let redirectUrl = '/';
    try {
      const profile = await fetchProfile();
      if (!profile.organizations || profile.organizations.length === 0) {
        redirectUrl = '/merchant/register';
      }
    } catch {
      // Best-effort; default redirect to home
    }
    setTimeout(() => router.push(redirectUrl), 400);
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setRateLimit(null);
    setLoading(true);
    try {
      const result = await loginPassword(email, password, getDeviceId());
      if ('requiresOtp' in result) {
        // Correct password but untrusted device — the backend requested the OTP
        // itself, chose the channel from the release's allowlist, and reports how
        // confidently it went out. Mirror both instead of assuming a phone send:
        // the initial staging release permits email only, so an account that also
        // has a phone number now receives its second factor by email.
        const accepted = result.otpDelivery === 'accepted';
        const unconfirmedMessage =
          'This device needs a second factor. We could not confirm the code was delivered, but you can enter it if it arrives.';

        if (!result.otpPhone && result.otpEmail) {
          // The email verify endpoint takes the address from the request body and
          // the page already holds the full address the user authenticated with;
          // `otpEmail` is masked and serves only as the channel signal.
          setMode('email-otp');
          setEmailOtpStage('verify');
          setEmailOtp('');
          setEmailDeliveryNote(accepted ? 'sent' : 'uncertain');
          setError(
            accepted
              ? 'New device detected. Enter the code sent to your email to continue.'
              : unconfirmedMessage,
          );
        } else {
          setPhone(result.otpPhone);
          setMode('otp');
          setOtpStage('verify');
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
      await redirectAfterLogin();
    } catch (err: any) {
      if (err instanceof LoginRateLimitError) {
        setRateLimit({
          message: err.message,
          remaining: err.remainingAttempts,
          retryAfter: err.retryAfterSeconds,
        });
      } else {
        setError(err.message || 'Login failed');
      }
      setLoading(false);
    }
  }

  /**
   * Guards duplicate OTP sends. Two requests for one number burn the caller's
   * rate budget twice and leave two live challenges, so the check happens
   * synchronously, before the first await.
   */
  const otpInFlight = useRef(false);

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otpInFlight.current) return;
    otpInFlight.current = true;
    setError('');
    setRateLimit(null);
    setDeliveryNote(null);
    setLoading(true);
    try {
      // A 2xx here means "request processed". The provider's answer travels in
      // the body, so nothing may be presented as sent until it says accepted.
      const result = await requestOtp(phone, channel);
      const outcome = classifyOtpDelivery(result);
      if (outcome === 'delivered') {
        setDeliveryNote('sent');
        setOtpStage('verify');
      } else if (outcome === 'uncertain') {
        // The challenge exists and may yet arrive: offer code entry, but label
        // it as unconfirmed instead of claiming a send.
        setDeliveryNote('uncertain');
        setOtpStage('verify');
      } else {
        setError(deliveryMessage(outcome, phone, channel === 'sms' ? 'SMS' : 'WhatsApp'));
      }
    } catch (err: any) {
      if (err instanceof LoginRateLimitError) {
        setRateLimit({
          message: err.message,
          remaining: err.remainingAttempts,
          retryAfter: err.retryAfterSeconds,
        });
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
    setError('');
    setLoading(true);
    try {
      await verifyOtp(phone, otp);
      if (email) localStorage.setItem('scs_last_email', email);
      await redirectAfterLogin();
    } catch (err: any) {
      setError(err.message || 'Invalid OTP');
      setLoading(false);
    }
  }

  async function handleRequestEmailOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otpInFlight.current) return;
    otpInFlight.current = true;
    setError('');
    setRateLimit(null);
    setEmailDeliveryNote(null);
    setLoading(true);
    try {
      // Same rule as the phone channel: only an accepted send is a send.
      const result = await requestEmailOtp(email);
      const outcome = classifyOtpDelivery(result);
      if (outcome === 'delivered') {
        setEmailDeliveryNote('sent');
        setEmailOtpStage('verify');
      } else if (outcome === 'uncertain') {
        setEmailDeliveryNote('uncertain');
        setEmailOtpStage('verify');
      } else {
        setError(deliveryMessage(outcome, 'your inbox', 'Email'));
      }
    } catch (err: any) {
      if (err instanceof LoginRateLimitError) {
        setRateLimit({
          message: err.message,
          remaining: err.remainingAttempts,
          retryAfter: err.retryAfterSeconds,
        });
      } else {
        // 404 means the email-OTP feature flag is off in this environment;
        // the API's own message says that without naming internals.
        setError(err.message || 'Failed to send email code');
      }
    } finally {
      otpInFlight.current = false;
      setLoading(false);
    }
  }

  async function handleVerifyEmailOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verifyEmailOtp(email, emailOtp);
      localStorage.setItem('scs_last_email', email);
      await redirectAfterLogin();
    } catch (err: any) {
      setError(err.message || 'Invalid OTP');
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '80px auto 0' }}>
      <PageHeader
        title={verified ? 'Welcome!' : 'Sign In'}
        subtitle={verified ? 'Your account is verified' : 'Access your Smart Commerce account'}
        background={`linear-gradient(135deg, ${colors.brand[900]} 0%, ${colors.brand[500]} 100%)`}
      />
      <div style={{ padding: '20px 24px 32px', background: '#fff', borderRadius: '0 0 12px 12px', border: '1px solid #e2e8f0', borderTop: 'none' }}>

      {!verified && (
        <div style={{ display: 'flex', borderBottom: '1px solid #d9e2e6', marginBottom: 24 }}>
          <button
            type="button"
            onClick={() => {
              setMode('password');
              setError('');
            }}
            style={tabStyle(mode === 'password')}
          >
            Email/Password
          </button>
          {/* Email OTP is the release's only permitted delivery channel, so it is
              the primary passwordless tab. Phone OTP stays reachable but dormant
              (requirement 11) until a later phase re-enables SMS. */}
          <button
            type="button"
            onClick={() => {
              setMode('email-otp');
              setEmailOtpStage('request');
              setEmailOtp('');
              setError('');
            }}
            style={tabStyle(mode === 'email-otp')}
          >
            Email OTP
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('otp');
              setError('');
            }}
            style={tabStyle(mode === 'otp')}
          >
            Phone OTP
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            background: colors.errBg,
            color: colors.err,
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
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
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          <strong>{rateLimit.message}</strong>
          <div style={{ marginTop: 4, fontSize: 13 }}>
            {rateLimit.remaining > 0
              ? `${rateLimit.remaining} attempt${rateLimit.remaining === 1 ? '' : 's'} remaining before a temporary lock.`
              : `Locked temporarily. Try again in ${formatWait(rateLimit.retryAfter)}.`}
          </div>
        </div>
      )}

      {verified ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12, color: colors.ok }}>&#10003;</div>
          <p style={{ color: colors.brand[900], fontSize: 16, fontWeight: 500 }}>
            Signed in successfully. Redirecting…
          </p>
        </div>
      ) : mode === 'password' ? (
        <form onSubmit={handlePasswordLogin}>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            style={inputStyle}
          />
          <label style={labelStyle}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            required
            style={inputStyle}
          />
          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
          <p style={hintStyle}>
            Don&apos;t have a password yet?{' '}
            <button
              type="button"
              onClick={() => {
                // Email-only release: the primary passwordless entry point must
                // not open the phone tab, which asks for a number and then sends
                // over a channel this release refuses.
                setMode('email-otp');
                setEmailOtpStage('request');
                setEmailOtp('');
                setError('');
              }}
              style={linkBtnStyle}
            >
              Sign in with email OTP
            </button>
          </p>
        </form>
      // S1.38.2: the phone branches must stay gated on `mode === 'otp'`, otherwise
      // the phone request/verify form renders underneath the Email OTP form.
      ) : mode === 'otp' && otpStage === 'request' ? (
        <form onSubmit={handleRequestOtp}>
          <label style={labelStyle}>Phone number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+966 5XX XXX XXXX"
            required
            disabled={loading}
            style={inputStyle}
          />
          <fieldset style={{ marginBottom: 16, padding: 0, border: 'none' }} role="radiogroup" aria-label="Delivery channel">
            <legend style={{ fontSize: 13, fontWeight: 600, color: colors.brand[700], marginBottom: 6 }}>
              Send code via
            </legend>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                <input
                  type="radio"
                  name="channel"
                  value="sms"
                  checked={channel === 'sms'}
                  onChange={() => setChannel('sms')}
                  disabled={loading}
                  aria-label="SMS"
                />
                SMS
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                <input
                  type="radio"
                  name="channel"
                  value="whatsapp"
                  checked={channel === 'whatsapp'}
                  onChange={() => setChannel('whatsapp')}
                  disabled={loading}
                  aria-label="WhatsApp"
                />
                WhatsApp
              </label>
            </div>
          </fieldset>
          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? `Sending via ${channel === 'sms' ? 'SMS' : 'WhatsApp'}...` : `Send via ${channel === 'sms' ? 'SMS' : 'WhatsApp'}`}
          </button>
        </form>
      ) : mode === 'otp' ? (
        <form onSubmit={handleVerifyOtp}>
          <p style={{ color: '#5b6b74', fontSize: 14, marginBottom: 16 }}>
            {deliveryNote === 'uncertain'
              ? `If a code arrived on ${phone}, enter it below.`
              : `Code sent via ${channel === 'sms' ? 'SMS' : 'WhatsApp'} to ${phone}`}
          </p>
          {deliveryNote === 'uncertain' && (
            <div
              style={{
                background: colors.warnBg,
                color: colors.warn,
                border: `1px solid ${colors.amber}`,
                padding: '10px 14px',
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 13,
              }}
              role="alert"
              aria-live="polite"
            >
              Delivery status uncertain &mdash; you may have received the code. If not, try resending via a different channel.
            </div>
          )}
          <label style={labelStyle}>OTP code</label>
          <input
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="123456"
            maxLength={6}
            required
            disabled={loading}
            style={inputStyle}
          />
          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? 'Verifying...' : 'Verify'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                setOtpStage('request');
                setError('');
                setDeliveryNote(null);
              }}
              style={{
                ...buttonStyle,
                flex: 1,
                background: 'transparent',
                color: colors.brand[500],
                border: `1px solid ${colors.border}`,
              }}
            >
              Change number
            </button>
            <button
              type="button"
              onClick={() => {
                // L-06: the label promises the opposite channel, so actually switch to
                // it and return to the request stage where the selection is shown and
                // used for the next OTP request.
                setChannel(channel === 'sms' ? 'whatsapp' : 'sms');
                setOtpStage('request');
                setError('');
                setDeliveryNote(null);
              }}
              style={{
                ...buttonStyle,
                flex: 1,
                background: 'transparent',
                color: colors.brand[500],
                border: `1px solid ${colors.border}`,
              }}
            >
              Resend via {channel === 'sms' ? 'WhatsApp' : 'SMS'}
            </button>
          </div>
        </form>
      ) : null}

      {mode === 'email-otp' && emailOtpStage === 'request' && (
        <form onSubmit={handleRequestEmailOtp}>
          <label style={labelStyle}>Email address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            disabled={loading}
            style={inputStyle}
          />
          <p style={{ fontSize: 13, color: '#5b6b74', marginBottom: 16 }}>
            We&apos;ll send a 6-digit code to your email. Sign in or create an account instantly.
          </p>
          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? 'Sending code...' : 'Send code to email'}
          </button>
        </form>
      )}

      {mode === 'email-otp' && emailOtpStage === 'verify' && (
        <form onSubmit={handleVerifyEmailOtp}>
          <p style={{ color: '#5b6b74', fontSize: 14, marginBottom: 16 }}>
            {emailDeliveryNote === 'uncertain'
              ? 'We could not confirm delivery. If a code reached your inbox, enter it below.'
              : (
                  <>
                    Code sent to <strong>{email}</strong>
                  </>
                )}
          </p>
          <label style={labelStyle}>OTP code</label>
          <input
            type="text"
            value={emailOtp}
            onChange={(e) => setEmailOtp(e.target.value)}
            placeholder="123456"
            maxLength={6}
            required
            disabled={loading}
            style={inputStyle}
          />
          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? 'Verifying...' : 'Verify'}
          </button>
          <button
            type="button"
            onClick={() => {
              setEmailOtpStage('request');
              setEmailOtp('');
              setEmailDeliveryNote(null);
              setError('');
            }}
            style={{
              ...buttonStyle,
              background: 'transparent',
              color: colors.brand[500],
              border: `1px solid ${colors.border}`,
            }}
          >
            Change email
          </button>
        </form>
      )}

      {!verified && mode === 'otp' && (
        <p style={hintStyle}>
          Have a password?{' '}
          <button
            type="button"
            onClick={() => {
              setMode('password');
              setError('');
            }}
            style={linkBtnStyle}
          >
            Sign in with Email/Password
          </button>
        </p>
      )}
      </div>
    </main>
  );
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '10px 0',
  fontSize: 14,
  fontWeight: 600,
  background: 'transparent',
  border: 'none',
  borderBottom: active ? `2px solid ${colors.brand[900]}` : '2px solid transparent',
  color: active ? colors.brand[900] : colors.muted,
  cursor: 'pointer',
  marginBottom: -1,
});

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: colors.brand[700],
  marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  fontSize: 15,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  marginBottom: 16,
  outline: 'none',
  boxSizing: 'border-box',
};
const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 0',
  fontSize: 15,
  fontWeight: 600,
  color: '#fff',
  background: colors.brand[900],
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  marginBottom: 8,
};
const hintStyle: React.CSSProperties = {
  fontSize: 13,
  color: colors.muted,
  textAlign: 'center',
  marginTop: 12,
};
const linkBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: colors.brand[500],
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 13,
  padding: 0,
};
