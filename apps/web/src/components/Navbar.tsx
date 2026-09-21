'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { logout, isMerchantRole } from '../lib/auth';
import { useAuth } from './AuthProvider';
import { useEffect, useState } from 'react';
import { fetchUnreadCount } from '../lib/buyer-api';
import { connectRealtime, onNotification } from '../lib/realtime';

export function Navbar() {
  const { user } = useAuth();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  // Merchant tooling is hidden from buyers/visitors (audit A1-1); derived from
  // the contextual user so it updates on login/logout without a remount.
  const isMerchant = isMerchantRole(user?.role);

  useEffect(() => {
    if (!user) return;
    const refresh = () => fetchUnreadCount().then((r) => setUnread(r.count)).catch(() => {});
    refresh();
    // Live badge updates over the realtime gateway replace the previous 30s poll
    // (WEB-B6). Each pushed notification refetches the authoritative count, and
    // we also refetch on (re)connect so the badge self-heals after a dropped
    // socket or a read that happened on another page.
    const socket = connectRealtime();
    const onReconnect = () => refresh();
    socket?.on('connect', onReconnect);
    const offNotification = onNotification(() => refresh());
    return () => {
      offNotification();
      socket?.off('connect', onReconnect);
    };
  }, [user]);

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <style>{`
        .nav-links { display: flex; }
        .nav-right-desktop { display: flex; }
        .nav-hamburger { display: none; }
        .nav-mobile-overlay { display: none; }
        @media (max-width: 768px) {
          .nav-links { display: none !important; }
          .nav-right-desktop { display: none !important; }
          .nav-hamburger { display: flex !important; }
          .nav-mobile-overlay { ${menuOpen ? 'display: flex !important;' : ''} }
        }
      `}</style>
      <nav style={navStyle}>
        <div style={navInner}>
          <Link href="/" style={logoStyle}>
            SCS Platform
          </Link>

          <div className="nav-links" style={navLinks}>
            <Link href="/search" style={linkStyle}>Search</Link>
            <Link href="/stores" style={linkStyle}>Stores</Link>
            <Link href="/favorites" style={linkStyle}>♡ Favorites</Link>
            <Link href="/saved-suppliers" style={linkStyle}>★ Suppliers</Link>
            <Link href="/cart" style={linkStyle}>Cart</Link>
            <Link href="/orders" style={linkStyle}>Orders</Link>
            {isMerchant && <Link href="/merchant" style={linkStyle}>Merchant</Link>}
            <Link href="/notifications" style={{ ...linkStyle, position: 'relative' }}>
              Notifications
              {unread > 0 && <span style={badgeStyle}>{unread > 99 ? '99+' : unread}</span>}
            </Link>
          </div>

          <div className="nav-right-desktop" style={navRight}>
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

          <button
            className="nav-hamburger"
            onClick={() => setMenuOpen(v => !v)}
            style={hamburgerBtn}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            <span style={{ fontSize: 22, lineHeight: 1 }}>{menuOpen ? '\u2715' : '\u2630'}</span>
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="nav-mobile-overlay" style={mobileOverlay} onClick={closeMenu}>
          <div style={mobileMenu} onClick={e => e.stopPropagation()}>
            <Link href="/search" style={mobileLink} onClick={closeMenu}>Search</Link>
            <Link href="/stores" style={mobileLink} onClick={closeMenu}>Stores</Link>
            <Link href="/favorites" style={mobileLink} onClick={closeMenu}>Favorites</Link>
            <Link href="/saved-suppliers" style={mobileLink} onClick={closeMenu}>Suppliers</Link>
            <Link href="/cart" style={mobileLink} onClick={closeMenu}>Cart</Link>
            <Link href="/orders" style={mobileLink} onClick={closeMenu}>Orders</Link>
            {isMerchant && <Link href="/merchant" style={mobileLink} onClick={closeMenu}>Merchant</Link>}
            <Link href="/notifications" style={mobileLink} onClick={closeMenu}>
              Notifications{unread > 0 ? ` (${unread})` : ''}
            </Link>
            <div style={{ borderTop: '1px solid #d9e2e6', margin: '8px 0' }} />
            {user ? (
              <>
                <Link href="/account" style={mobileLink} onClick={closeMenu}>Account</Link>
                <div style={{ padding: '8px 16px', fontSize: 13, color: '#5b6b74' }}>{user.fullName || user.phone}</div>
                <button onClick={() => { closeMenu(); handleLogout(); }} style={mobileLinkBtn}>Sign Out</button>
              </>
            ) : (
              <Link href="/auth/login" style={{ ...mobileLink, color: '#0f3340', fontWeight: 600 }} onClick={closeMenu}>Sign In</Link>
            )}
          </div>
        </div>
      )}
    </>
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

const hamburgerBtn: React.CSSProperties = {
  background: 'none',
  border: '1px solid #d9e2e6',
  borderRadius: 6,
  padding: '6px 10px',
  cursor: 'pointer',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#0f3340',
  marginLeft: 'auto',
};

const mobileOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  top: 56,
  background: 'rgba(15,51,64,0.4)',
  zIndex: 99,
  flexDirection: 'column',
};

const mobileMenu: React.CSSProperties = {
  background: '#fff',
  borderBottom: '1px solid #d9e2e6',
  display: 'flex',
  flexDirection: 'column',
  padding: '8px 0',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
};

const mobileLink: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 15,
  fontWeight: 500,
  color: '#1e2d35',
  textDecoration: 'none',
};

const mobileLinkBtn: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 15,
  fontWeight: 500,
  color: '#991b1b',
  background: 'none',
  border: 'none',
  textAlign: 'left',
  cursor: 'pointer',
};
