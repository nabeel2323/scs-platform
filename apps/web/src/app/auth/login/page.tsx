'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { requestOtp, verifyOtp, getUser } from '@/lib/auth';
import { fetchProfile } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await requestOtp(phone);
      setStep('otp');
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
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
      setVerified(true);
      // Check if user has any org memberships — new users should register
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
    } catch (err: any) {
      setError(err.message || 'Invalid OTP');
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 400, margin: '80px auto', padding: '32px 24px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 24 }}>
        {verified ? 'Welcome!' : step === 'phone' ? 'Sign In' : 'Enter OTP'}
      </h1>

      {error && (
        <div style={{ background: '#fbeeec', color: '#b3372f', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      {verified ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>&#10003;</div>
          <p style={{ color: '#174a5b', fontSize: 16, fontWeight: 500 }}>Signed in successfully. Redirecting…</p>
        </div>
      ) : step === 'phone' ? (
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
          <p style={{ color: '#5b6b74', fontSize: 14, marginBottom: 16 }}>
            Code sent to {phone}
          </p>
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
            onClick={() => setStep('phone')}
            style={{ ...buttonStyle, background: 'transparent', color: '#1e6178', border: '1px solid #d9e2e6' }}
          >
            Change number
          </button>
        </form>
      )}
    </main>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: '#0f3340', marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', fontSize: 15, border: '1px solid #d9e2e6',
  borderRadius: 8, marginBottom: 16, outline: 'none', boxSizing: 'border-box',
};
const buttonStyle: React.CSSProperties = {
  width: '100%', padding: '12px 0', fontSize: 15, fontWeight: 600, color: '#fff',
  background: '#174a5b', border: 'none', borderRadius: 8, cursor: 'pointer', marginBottom: 8,
};
