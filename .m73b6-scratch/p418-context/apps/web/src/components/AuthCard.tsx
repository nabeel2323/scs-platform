'use client';

import Link from 'next/link';
import { useAuth } from './AuthProvider';

/** Auth-aware card on the home page — shows Sign In or Account link. */
export function AuthCard() {
  const { user } = useAuth();

  if (user) {
    return (
      <Link href="/account" className="home-quick" style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 20px',
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        textDecoration: 'none',
        boxShadow: '0 1px 3px rgba(22,35,43,.04)',
        transition: 'box-shadow 0.2s ease, transform 0.2s ease',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: '#f2f7f9',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, flexShrink: 0,
        }}>👤</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', marginBottom: 2 }}>My Account</div>
          <div style={{ fontSize: 12, color: '#5b6b74', lineHeight: 1.4 }}>Signed in as {user.fullName || user.phone}</div>
        </div>
        <svg className="home-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="#b0bec5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transition: 'stroke 0.2s ease' }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </Link>
    );
  }

  return (
    <Link href="/auth/login" className="home-quick" style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '16px 20px',
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      textDecoration: 'none',
      boxShadow: '0 1px 3px rgba(22,35,43,.04)',
      transition: 'box-shadow 0.2s ease, transform 0.2s ease',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: '#f2f7f9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, flexShrink: 0,
      }}>🔐</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', marginBottom: 2 }}>Sign In</div>
        <div style={{ fontSize: 12, color: '#5b6b74', lineHeight: 1.4 }}>OTP-based phone authentication</div>
      </div>
      <svg className="home-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="#b0bec5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0, transition: 'stroke 0.2s ease' }}>
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  );
}
