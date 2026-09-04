'use client';

import Link from 'next/link';
import { useAuth } from './AuthProvider';

const cardStyle: React.CSSProperties = {
  display: 'block',
  padding: '20px 24px',
  background: '#fff',
  border: '1px solid #d9e2e6',
  borderRadius: 10,
  textDecoration: 'none',
  boxShadow: '0 1px 2px rgba(22,35,43,.06),0 4px 14px rgba(22,35,43,.05)',
};

/** Auth-aware card on the home page — shows Sign In or Account link. */
export function AuthCard() {
  const { user } = useAuth();

  if (user) {
    return (
      <Link href="/account" style={cardStyle}>
        <b>My Account</b>
        <span>Signed in as {user.fullName || user.phone}</span>
      </Link>
    );
  }

  return (
    <Link href="/auth/login" style={cardStyle}>
      <b>Sign In</b>
      <span>OTP-based phone authentication</span>
    </Link>
  );
}
