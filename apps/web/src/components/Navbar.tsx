'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { logout } from '../lib/auth';
import { useAuth } from './AuthProvider';
import { useEffect, useState } from 'react';
import { fetchUnreadCount } from '../lib/buyer-api';

export function Navbar() {
  const { user } = useAuth();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (user) {
      fetchUnreadCount().then(r => setUnread(r.count)).catch(() => {});
      const interval = setInterval(() => {
        fetchUnreadCount().then(r => setUnread(r.count)).catch(() => {});
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  return (
    <nav style={navStyle}>
      <div style={navInner}>
        <Link href="/" style={logoStyle}>SCS Platform</Link>

        <div style={navLinks}>
          <Link href="/search" style={linkStyle}>Search</Link>
          <Link href="/stores" style={linkStyle}>Stores</Link>
          <Link href="/favorites" style={linkStyle}>♡ Favorites</Link>
          <Link href="/cart" style={linkStyle}>Cart</Link>
          <Link href="/orders" style={linkStyle}>Orders</Link>
          <Link href="/merchant/orders" style={linkStyle}>Merchant</Link>
          <Link href="/notifications" style={{ ...linkStyle, position: 'relative' }}>
            Notifications
            {unread > 0 && <span style={badgeStyle}>{unread > 99 ? '99+' : unread}</span>}
          </Link>
        </div>

        <div style={navRight}>
          {user ? (
            <>
              <Link href="/account" style={linkStyle}>Account</Link>
              <span style={userStyle}>{user.fullName || user.phone}</span>
              <button onClick={handleLogout} style={logoutBtn}>Sign Out</button>
            </>
          ) : (
            <Link href="/auth/login" style={loginBtn}>Sign In</Link>
          )}
        </div>
      </div>
    </nav>
  );
}

const navStyle: React.CSSProperties = {
  background: '#fff',
  borderBottom: '1px solid #d9e2e6',
  position: 'sticky',
  top: 0,
  zIndex: 100,
};

const navInner: React.CSSProperties = {
  maxWidth: 1200,
  margin: '0 auto',
  padding: '0 24px',
  height: 56,
  display: 'flex',
  alignItems: 'center',
  gap: 24,
};

const logoStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: '#0f3340',
  textDecoration: 'none',
  marginRight: 16,
};

const navLinks: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  flex: 1,
};

const linkStyle: React.CSSProperties = {
  color: '#5b6b74',
  textDecoration: 'none',
  fontSize: 14,
  fontWeight: 500,
};

const navRight: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

const userStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#5b6b74',
};

const logoutBtn: React.CSSProperties = {
  background: 'none',
  border: '1px solid #d9e2e6',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: 13,
  color: '#5b6b74',
  cursor: 'pointer',
};

const loginBtn: React.CSSProperties = {
  background: '#0f3340',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '6px 16px',
  fontSize: 13,
  fontWeight: 600,
  textDecoration: 'none',
  cursor: 'pointer',
};

const badgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: -6,
  right: -12,
  background: '#e53e3e',
  color: '#fff',
  fontSize: 10,
  fontWeight: 700,
  borderRadius: 10,
  padding: '1px 5px',
  minWidth: 16,
  textAlign: 'center',
};
