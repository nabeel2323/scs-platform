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
import {
  Button, TextInput,
  colors, typeScale, radii, shadows, transitions, brand,
} from '@scs/ui-kit';

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
              onClick={() => { setMode('otp'); setError(''); }}
              style={tabStyle(mode === 'otp')}
            >
              Phone OTP
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
              <strong>{rateLimit.message}</strong>
              <div style={{ marginTop: 4, ...typeScale.bodySm }}>
                {rateLimit.remaining > 0
                  ? `${rateLimit.remaining} attempt${rateLimit.remaining === 1 ? '' : 's'} remaining before a temporary lock.`
                  : `Locked temporarily. Try again in ${formatWait(rateLimit.retryAfter)}.`}
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
                  onClick={() => { setMode('otp'); setError(''); }}
                  style={linkBtnStyle}
                >
                  Sign in with OTP
                </button>
              </p>
            </form>
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
              <Button type="submit" disabled={loading} size="lg" style={{ width: '100%', marginBottom: 8 }}>
                {loading ? 'Sending...' : 'Send OTP'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp}>
              <p style={{ color: colors.muted, ...typeScale.body, marginBottom: 16 }}>Code sent to {phone}</p>
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
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => setOtpStage('request')}
                style={{ width: '100%' }}
              >
                Change number
              </Button>
            </form>
          )}

          {mode === 'otp' && (
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
  borderBottom: active ? `2px solid ${brand[700]}` : '2px solid transparent',
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
