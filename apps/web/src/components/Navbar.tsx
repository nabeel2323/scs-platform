'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { logout, isMerchantRole, switchOrg } from '../lib/auth';
import { useAuth } from './AuthProvider';
import { useEffect, useState, useRef, useCallback } from 'react';
import { fetchUnreadCount } from '../lib/buyer-api';
import { fetchMyOrganizations, type Organization } from '../lib/api';
import { connectRealtime, onNotification } from '../lib/realtime';
import {
  IconSearch, IconShoppingCart, IconBell, IconHeart, IconStar,
  IconUser, IconLogOut, IconMenu, IconX, IconChevronDown, IconStore,
} from '@scs/ui-kit';

type OrgWithMembership = Organization & { membershipStatus: string };

export function Navbar() {
  const { user } = useAuth();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [orgs, setOrgs] = useState<OrgWithMembership[]>([]);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const orgDropdownRef = useRef<HTMLDivElement>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const isMerchant = isMerchantRole(user?.role);
  const activeOrg = orgs.find(o => o.id === user?.activeOrgId);

  // Fetch organizations for the switcher
  useEffect(() => {
    if (!user) { setOrgs([]); return; }
    fetchMyOrganizations().then(setOrgs).catch(() => {});
  }, [user]);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [userMenuOpen]);

  // Close org dropdown on outside click
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
    } catch { /* retry */ }
    finally { setSwitching(false); }
  };

  // Notification badge
  useEffect(() => {
    if (!user) return;
    const refresh = () => fetchUnreadCount().then((r) => setUnread(r.count)).catch(() => {});
    refresh();
    const socket = connectRealtime();
    const onReconnect = () => refresh();
    socket?.on('connect', onReconnect);
    const offNotification = onNotification(() => refresh());
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

  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const q = searchValue.trim();
    if (q) {
      router.push(`/search?q=${encodeURIComponent(q)}`);
      setSearchValue('');
    }
  }, [searchValue, router]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <style>{`
        .nav-links { display: flex; }
        .nav-search { display: flex; }
        .nav-right-desktop { display: flex; }
        .nav-hamburger { display: none; }
        .nav-mobile-overlay { display: none; }
        @media (max-width: 768px) {
          .nav-links { display: none !important; }
          .nav-search { display: none !important; }
          .nav-right-desktop { display: none !important; }
          .nav-hamburger { display: flex !important; }
          .nav-mobile-overlay { ${menuOpen ? 'display: flex !important;' : ''} }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .nav-links { display: none !important; }
        }
        .nav-link { color: #5b6b74; text-decoration: none; font-size: 13px; font-weight: 500; padding: 4px 0; transition: color 0.15s ease; display: flex; align-items: center; gap: 4px; }
        .nav-link:hover { color: #0f3340; }
        .nav-menu-item { display: flex; align-items: center; gap: 8px; padding: 10px 14px; font-size: 13px; color: #0f3340; text-decoration: none; transition: background 0.15s ease; }
        .nav-menu-item:hover { background: #f7f9fa; }
        .nav-menu-logout { display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 14px; font-size: 13px; color: #991b1b; background: none; border: none; cursor: pointer; text-align: left; transition: background 0.15s ease; }
        .nav-menu-logout:hover { background: #fef2f2; }
        .nav-icon-link { position: relative; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; color: #5b6b74; text-decoration: none; transition: background 0.15s ease, color 0.15s ease; }
        .nav-icon-link:hover { background: #f2f5f6; color: #0f3340; }
        .nav-badge { position: absolute; top: 2px; right: 2px; background: #e53e3e; color: #fff; font-size: 9px; font-weight: 700; border-radius: 10px; padding: 1px 4px; min-width: 15px; text-align: center; line-height: 1.3; }
      `}</style>

      <nav style={{
        background: '#fff',
        borderBottom: '1px solid #d9e2e6',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{
          maxWidth: 1320, margin: '0 auto', padding: '0 24px',
          height: 56, display: 'flex', alignItems: 'center', gap: 16,
        }}>
          {/* Logo */}
          <Link href="/" style={{ fontSize: 17, fontWeight: 700, color: '#0f3340', textDecoration: 'none', marginRight: 8, whiteSpace: 'nowrap' }}>
            SCS Platform
          </Link>

          {/* Search Bar */}
          <form className="nav-search" onSubmit={handleSearchSubmit} style={{ flex: 1, maxWidth: 420 }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', display: 'flex', pointerEvents: 'none' }}>
                <IconSearch size={16} />
              </span>
              <input
                type="search"
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                placeholder="Search products, stores..."
                style={{
                  width: '100%', padding: '7px 12px 7px 32px',
                  fontSize: 13, fontFamily: 'inherit',
                  border: '1px solid #d9e2e6', borderRadius: 8,
                  background: '#f7f9fa', color: '#16232b',
                  outline: 'none', transition: 'border-color 0.15s ease, background 0.15s ease',
                }}
                onFocus={e => { e.target.style.borderColor = '#1e6178'; e.target.style.background = '#fff'; }}
                onBlur={e => { e.target.style.borderColor = '#d9e2e6'; e.target.style.background = '#f7f9fa'; }}
              />
            </div>
          </form>

          {/* Nav Links */}
          <div className="nav-links" style={{ display: 'flex', gap: 14, flex: 1 }}>
            <Link href="/search" className="nav-link">Search</Link>
            <Link href="/stores" className="nav-link">Stores</Link>
            {user && <Link href="/orders" className="nav-link">Orders</Link>}
            {isMerchant && <Link href="/merchant" className="nav-link">Merchant</Link>}
          </div>

          {/* Icon Links */}
          <div className="nav-right-desktop" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {user && (
              <>
                <Link href="/favorites" className="nav-icon-link" title="Favorites">
                  <IconHeart size={18} />
                </Link>
                <Link href="/cart" className="nav-icon-link" title="Cart">
                  <IconShoppingCart size={18} />
                </Link>
                <Link href="/notifications" className="nav-icon-link" title="Notifications">
                  <IconBell size={18} />
                  {unread > 0 && <span className="nav-badge">{unread > 99 ? '99+' : unread}</span>}
                </Link>
              </>
            )}

            {/* Organization Switcher */}
            {user && orgs.length > 1 && (
              <div style={{ position: 'relative' }} ref={orgDropdownRef}>
                <button
                  onClick={() => setOrgDropdownOpen(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px', background: '#f7f9fa',
                    border: '1px solid #d9e2e6', borderRadius: 8,
                    cursor: 'pointer', fontSize: 12,
                  }}
                  aria-label="Switch organization"
                  aria-expanded={orgDropdownOpen}
                >
                  <IconStore size={14} color="#5b6b74" />
                  <span style={{ fontWeight: 600, color: '#0f3340', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {switching ? 'Switching...' : activeOrg?.name || 'Org'}
                  </span>
                  <IconChevronDown size={12} color="#94a3b8" />
                </button>
                {orgDropdownOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 4,
                    background: '#fff', border: '1px solid #d9e2e6',
                    borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    minWidth: 200, zIndex: 200, overflow: 'hidden',
                  }}>
                    <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #f0f4f6' }}>
                      Switch Organization
                    </div>
                    {orgs.map(org => (
                      <button
                        key={org.id}
                        onClick={() => handleSwitchOrg(org.id)}
                        disabled={switching}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          width: '100%', padding: '8px 12px',
                          border: 'none', borderBottom: '1px solid #f7f9fa',
                          cursor: 'pointer', textAlign: 'left',
                          background: org.id === user.activeOrgId ? '#f0f9ff' : '#fff',
                          fontWeight: org.id === user.activeOrgId ? 600 : 400,
                        }}
                      >
                        <span style={{ fontSize: 13, color: '#0f3340' }}>{org.name}</span>
                        <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginLeft: 'auto' }}>{org.type}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* User menu */}
            {user ? (
              <div style={{ position: 'relative', marginLeft: 4 }} ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 8px', background: userMenuOpen ? '#f2f5f6' : 'transparent',
                    border: '1px solid #d9e2e6', borderRadius: 8,
                    cursor: 'pointer', transition: 'background 0.15s ease',
                  }}
                  aria-label="User menu"
                  aria-expanded={userMenuOpen}
                >
                  <IconUser size={18} color="#5b6b74" />
                  <IconChevronDown size={12} color="#94a3b8" />
                </button>
                {userMenuOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 4,
                    background: '#fff', border: '1px solid #d9e2e6',
                    borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    minWidth: 180, zIndex: 200, overflow: 'hidden',
                  }}>
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f4f6' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f3340' }}>{user.fullName || user.phone || 'Account'}</div>
                    </div>
                    <Link
                      href="/account"
                      className="nav-menu-item"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <IconUser size={14} color="#5b6b74" />
                      Account
                    </Link>
                    <div style={{ borderTop: '1px solid #f0f4f6' }} />
                    <button
                      onClick={() => { setUserMenuOpen(false); handleLogout(); }}
                      className="nav-menu-logout"
                    >
                      <IconLogOut size={14} color="#991b1b" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/auth/login" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', fontSize: 13, fontWeight: 600,
                background: '#0f3340', color: '#fff',
                borderRadius: 8, textDecoration: 'none',
              }}>
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="nav-hamburger"
            onClick={() => setMenuOpen(v => !v)}
            style={{
              background: 'none', border: '1px solid #d9e2e6',
              borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
              alignItems: 'center', justifyContent: 'center',
              color: '#0f3340', marginLeft: 'auto',
            }}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <IconX size={20} /> : <IconMenu size={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile overlay menu */}
      {menuOpen && (
        <div className="nav-mobile-overlay" style={{
          position: 'fixed', inset: 0, top: 56,
          background: 'rgba(15,51,64,0.4)', zIndex: 99,
          flexDirection: 'column',
        }} onClick={closeMenu}>
          <div style={{
            background: '#fff', borderBottom: '1px solid #d9e2e6',
            display: 'flex', flexDirection: 'column',
            padding: '8px 0', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }} onClick={e => e.stopPropagation()}>
            {/* Mobile search */}
            <form onSubmit={(e) => { e.preventDefault(); const q = searchValue.trim(); if (q) { router.push(`/search?q=${encodeURIComponent(q)}`); setSearchValue(''); closeMenu(); } }} style={{ padding: '8px 16px' }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', display: 'flex' }}>
                  <IconSearch size={16} />
                </span>
                <input
                  type="search" value={searchValue}
                  onChange={e => setSearchValue(e.target.value)}
                  placeholder="Search products..."
                  style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: 14, border: '1px solid #d9e2e6', borderRadius: 8, background: '#f7f9fa' }}
                />
              </div>
            </form>

            <Link href="/search" className="nav-link" style={{ padding: '12px 16px', fontSize: 15 }} onClick={closeMenu}>Search</Link>
            <Link href="/stores" className="nav-link" style={{ padding: '12px 16px', fontSize: 15 }} onClick={closeMenu}>Stores</Link>
            {user && <Link href="/favorites" className="nav-link" style={{ padding: '12px 16px', fontSize: 15 }} onClick={closeMenu}>Favorites</Link>}
            {user && <Link href="/cart" className="nav-link" style={{ padding: '12px 16px', fontSize: 15 }} onClick={closeMenu}>Cart</Link>}
            {user && <Link href="/orders" className="nav-link" style={{ padding: '12px 16px', fontSize: 15 }} onClick={closeMenu}>Orders</Link>}
            {isMerchant && <Link href="/merchant" className="nav-link" style={{ padding: '12px 16px', fontSize: 15 }} onClick={closeMenu}>Merchant</Link>}
            {user && <Link href="/notifications" className="nav-link" style={{ padding: '12px 16px', fontSize: 15 }} onClick={closeMenu}>
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
                <Link href="/account" className="nav-link" style={{ padding: '12px 16px', fontSize: 15 }} onClick={closeMenu}>Account</Link>
                <div style={{ padding: '8px 16px', fontSize: 13, color: '#5b6b74' }}>{user.fullName || user.phone}</div>
                <button onClick={() => { closeMenu(); handleLogout(); }} style={{
                  padding: '12px 16px', fontSize: 15, fontWeight: 500,
                  color: '#991b1b', background: 'none', border: 'none',
                  textAlign: 'left', cursor: 'pointer', width: '100%',
                }}>Sign Out</button>
              </>
            ) : (
              <Link href="/auth/login" style={{ padding: '12px 16px', fontSize: 15, fontWeight: 600, color: '#0f3340', textDecoration: 'none' }} onClick={closeMenu}>Sign In</Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
