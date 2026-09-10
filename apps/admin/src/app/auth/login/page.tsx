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

type LoginMode = 'password' | 'otp';
type OtpStage = 'request' | 'verify';

/** Human-friendly wait time for the lockout countdown. */
function formatWait(seconds: number): string {
  if (!seconds || seconds <= 0) return 'a moment';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.ceil(seconds / 60)} min`;
}

export default function AdminLoginPage() {
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
  const [rateLimit, setRateLimit] = useState<{
    message: string;
    remaining: number;
    retryAfter: number;
  } | null>(null);

  // Pre-fill the last admin email and probe device trust for auto-login.
  useEffect(() => {
    const storedEmail =
      typeof window !== 'undefined' ? localStorage.getItem('scs_last_email') : null;
    if (!storedEmail) return;
    setEmail(storedEmail);
    checkDeviceLogin(storedEmail, getDeviceId()).catch(() => {});
  }, []);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setRateLimit(null);
    setLoading(true);
    try {
      const result = await loginPassword(email, password, getDeviceId());
      if ('requiresOtp' in result) {
        setPhone(result.otpPhone);
        setMode('otp');
        setOtpStage('verify');
        setError('New device detected. Enter the OTP sent to your phone to continue.');
        setLoading(false);
        return;
      }
      localStorage.setItem('scs_last_email', email);
      router.push('/');
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
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Invalid OTP');
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 50%, #0c2831 100%)' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 24px' }}>
        {/* Logo / Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56, borderRadius: 14,
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
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.5px',
              }}
            >
              ADMIN CONSOLE
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: '16px 0 4px', letterSpacing: '-0.3px' }}>
            Welcome back
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
            Sign in to your admin account
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#fff', borderRadius: 16, padding: '32px 28px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.1)',
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 24 }}>
            <button
              type="button"
              onClick={() => { setMode('password'); setError(''); }}
              style={tabStyle(mode === 'password')}
            >
              Email/Password
            </button>
            <button
              type="button"
              onClick={() => { setMode('otp'); setError(''); }}
              style={tabStyle(mode === 'otp')}
            >
              Phone OTP
            </button>
          </div>

          {error && (
            <div
              style={{
                background: '#fbeeec',
                color: '#b3372f',
                padding: '10px 14px',
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 14,
                border: '1px solid #f5c6c0',
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

          {mode === 'password' ? (
            <form onSubmit={handlePasswordLogin}>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
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
                  onClick={() => { setMode('otp'); setError(''); }}
                  style={linkBtnStyle}
                >
                  Sign in with OTP
                </button>
              </p>
            </form>
          ) : otpStage === 'request' ? (
            <form onSubmit={handleRequestOtp}>
              <label style={labelStyle}>Admin phone number</label>
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

          {mode === 'otp' && (
            <p style={hintStyle}>
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
  fontSize: 14,
  fontWeight: 600,
  background: 'transparent',
  border: 'none',
  borderBottom: active ? '2px solid #0f3340' : '2px solid transparent',
  color: active ? '#0f3340' : '#5b6b74',
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
  background: '#0f3340',
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
