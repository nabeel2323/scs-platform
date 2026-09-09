'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  requestOtp,
  verifyOtp,
  loginPassword,
  checkDeviceLogin,
  LoginRateLimitError,
} from '@/lib/auth';
import { getDeviceId } from '@/lib/device-id';
import { fetchProfile } from '@/lib/api';

type LoginMode = 'password' | 'otp';
type OtpStage = 'request' | 'verify';

/** Human-friendly wait time for the lockout countdown. */
function formatWait(seconds: number): string {
  if (!seconds || seconds <= 0) return 'a moment';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.ceil(seconds / 60)} min`;
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

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [rateLimit, setRateLimit] = useState<{
    message: string;
    remaining: number;
    retryAfter: number;
  } | null>(null);

  // Pre-fill the last email and probe device trust for auto-login.
  useEffect(() => {
    const storedEmail =
      typeof window !== 'undefined' ? localStorage.getItem('scs_last_email') : null;
    if (!storedEmail) return;
    setEmail(storedEmail);
    // Best-effort: a trusted device just means the password field is enough.
    checkDeviceLogin(storedEmail, getDeviceId()).catch(() => {});
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
        // Correct password but untrusted device — the backend already sent an
        // OTP to the account's phone, so jump straight to the verify stage.
        setPhone(result.otpPhone);
        setMode('otp');
        setOtpStage('verify');
        setError('New device detected. Enter the OTP sent to your phone to continue.');
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

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setRateLimit(null);
    setLoading(true);
    try {
      await requestOtp(phone);
      setOtpStage('verify');
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

  return (
    <main style={{ maxWidth: 420, margin: '80px auto', padding: '32px 24px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 24 }}>
        {verified ? 'Welcome!' : 'Sign In'}
      </h1>

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
            background: '#fbeeec',
            color: '#b3372f',
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
            background: '#fffbeb',
            color: '#92400e',
            border: '1px solid #fcd34d',
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
          <div style={{ fontSize: 40, marginBottom: 12 }}>&#10003;</div>
          <p style={{ color: '#174a5b', fontSize: 16, fontWeight: 500 }}>
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
                setMode('otp');
                setError('');
              }}
              style={linkBtnStyle}
            >
              Sign in with OTP
            </button>
          </p>
        </form>
      ) : otpStage === 'request' ? (
        <form onSubmit={handleRequestOtp}>
          <label style={labelStyle}>Phone number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+966 5XX XXX XXXX"
            required
            style={inputStyle}
          />
          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? 'Sending...' : 'Send OTP'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp}>
          <p style={{ color: '#5b6b74', fontSize: 14, marginBottom: 16 }}>Code sent to {phone}</p>
          <label style={labelStyle}>OTP code</label>
          <input
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="123456"
            maxLength={6}
            required
            style={inputStyle}
          />
          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? 'Verifying...' : 'Verify'}
          </button>
          <button
            type="button"
            onClick={() => setOtpStage('request')}
            style={{
              ...buttonStyle,
              background: 'transparent',
              color: '#1e6178',
              border: '1px solid #d9e2e6',
            }}
          >
            Change number
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
  borderBottom: active ? '2px solid #174a5b' : '2px solid transparent',
  color: active ? '#174a5b' : '#5b6b74',
  cursor: 'pointer',
  marginBottom: -1,
});

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#0f3340',
  marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  fontSize: 15,
  border: '1px solid #d9e2e6',
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
  background: '#174a5b',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  marginBottom: 8,
};
const hintStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#5b6b74',
  textAlign: 'center',
  marginTop: 12,
};
const linkBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#1e6178',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 13,
  padding: 0,
};
