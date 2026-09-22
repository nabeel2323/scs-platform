'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { logout, isMerchantRole, switchOrg } from '../lib/auth';
import { useAuth } from './AuthProvider';
import { useEffect, useState, useRef } from 'react';
import { fetchUnreadCount } from '../lib/buyer-api';
import { fetchMyOrganizations, type Organization } from '../lib/api';
import { connectRealtime, onNotification } from '../lib/realtime';

type OrgWithMembership = Organization & { membershipStatus: string };

export function Navbar() {
  const { user } = useAuth();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [orgs, setOrgs] = useState<OrgWithMembership[]>([]);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const orgDropdownRef = useRef<HTMLDivElement>(null);
  // Merchant tooling is hidden from buyers/visitors (audit A1-1); derived from
  // the contextual user so it updates on login/logout without a remount.
  const isMerchant = isMerchantRole(user?.role);
  const activeOrg = orgs.find(o => o.id === user?.activeOrgId);

  // Fetch the user's organizations for the switcher (only when logged in).
  useEffect(() => {
    if (!user) { setOrgs([]); return; }
    fetchMyOrganizations().then(setOrgs).catch(() => {});
  }, [user]);

  // Close the org dropdown when clicking outside.
  useEffect(() => {
    if (!orgDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (orgDropdownRef.current && !orgDropdownRef.current.contains(e.target as Node)) {
        setOrgDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [orgDropdownOpen]);

  const handleSwitchOrg = async (orgId: string) => {
    if (orgId === user?.activeOrgId) { setOrgDropdownOpen(false); return; }
    setSwitching(true);
    try {
      await switchOrg(orgId);
      setOrgDropdownOpen(false);
      router.refresh();
    } catch {
      // Silently fail — the user can retry
    } finally {
      setSwitching(false);
    }
  };

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
    // The notifications page dispatches this event after any individual or
    // bulk mark-read / mark-unread so the badge updates without waiting for
    // a realtime push or socket reconnect.
    const onBadgeChange = () => refresh();
    window.addEventListener('unreadCountChanged', onBadgeChange);
    return () => {
      offNotification();
      socket?.off('connect', onReconnect);
      window.removeEventListener('unreadCountChanged', onBadgeChange);
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
            {user && <Link href="/favorites" style={linkStyle}>♡ Favorites</Link>}
            {user && <Link href="/saved-suppliers" style={linkStyle}>★ Suppliers</Link>}
            <Link href="/cart" style={linkStyle}>Cart</Link>
            {user && <Link href="/orders" style={linkStyle}>Orders</Link>}
            {isMerchant && <Link href="/merchant" style={linkStyle}>Merchant</Link>}
            {user && <Link href="/notifications" style={{ ...linkStyle, position: 'relative' }}>
              Notifications
              {unread > 0 && <span style={badgeStyle}>{unread > 99 ? '99+' : unread}</span>}
            </Link>}
          </div>

          {/* Organization Switcher — desktop */}
          {user && orgs.length > 1 && (
            <div style={{ position: 'relative' }} ref={orgDropdownRef}>
              <button
                onClick={() => setOrgDropdownOpen(v => !v)}
                style={orgSwitcherBtn}
                aria-label="Switch organization"
                aria-expanded={orgDropdownOpen}
              >
                <span style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1 }}>Org</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f3340', lineHeight: 1.2, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {switching ? 'Switching…' : activeOrg?.name || 'Select Org'}
                </span>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>{orgDropdownOpen ? '▲' : '▼'}</span>
              </button>
              {orgDropdownOpen && (
                <div style={orgDropdownStyle}>
                  <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #f0f4f6' }}>Switch Organization</div>
                  {orgs.map(org => (
                    <button
                      key={org.id}
                      onClick={() => handleSwitchOrg(org.id)}
                      disabled={switching}
                      style={{
                        ...orgDropdownItem,
                        background: org.id === user.activeOrgId ? '#f0f9ff' : '#fff',
                        fontWeight: org.id === user.activeOrgId ? 600 : 400,
                      }}
                    >
                      <span style={{ fontSize: 13, color: '#0f3340' }}>{org.name}</span>
                      <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>{org.type}</span>
                      {org.id === user.activeOrgId && <span style={{ fontSize: 11, color: '#065f46' }}>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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
            {user && <Link href="/favorites" style={mobileLink} onClick={closeMenu}>Favorites</Link>}
            {user && <Link href="/saved-suppliers" style={mobileLink} onClick={closeMenu}>Suppliers</Link>}
            <Link href="/cart" style={mobileLink} onClick={closeMenu}>Cart</Link>
            {user && <Link href="/orders" style={mobileLink} onClick={closeMenu}>Orders</Link>}
            {isMerchant && <Link href="/merchant" style={mobileLink} onClick={closeMenu}>Merchant</Link>}
            {user && <Link href="/notifications" style={mobileLink} onClick={closeMenu}>
              Notifications{unread > 0 ? ` (${unread})` : ''}
            </Link>}
            {/* Organization Switcher — mobile */}
            {user && orgs.length > 1 && (
              <div style={{ padding: '8px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Organization</div>
                <select
                  value={user.activeOrgId || ''}
                  onChange={e => handleSwitchOrg(e.target.value)}
                  disabled={switching}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid #d9e2e6', borderRadius: 6, background: '#fff', color: '#0f3340' }}
                >
                  {orgs.map(org => (
                    <option key={org.id} value={org.id}>{org.name} ({org.type})</option>
                  ))}
                </select>
              </div>
            )}
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

const orgSwitcherBtn: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
  padding: '4px 12px',
  background: '#f7f9fa',
  border: '1px solid #d9e2e6',
  borderRadius: 6,
  cursor: 'pointer',
  minWidth: 80,
};

const orgDropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: 4,
  background: '#fff',
  border: '1px solid #d9e2e6',
  borderRadius: 8,
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  minWidth: 200,
  zIndex: 200,
  overflow: 'hidden',
};

const orgDropdownItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '8px 12px',
  border: 'none',
  borderBottom: '1px solid #f7f9fa',
  cursor: 'pointer',
  textAlign: 'left',
};
