'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { isAuthenticated, getUser, logout } from '../lib/auth';
import {
  IconHome, IconUsers, IconPackage, IconStore, IconBuilding,
  IconShield, IconFolder, IconTag, IconScale, IconBox,
  IconBarChart, IconClipboard, IconLock, IconLogOut, IconMenu, IconX,
} from '@scs/ui-kit';

/** Navigation items with SVG icons and permission requirements. */
const navItems: { href: string; label: string; icon: React.ReactNode; perms: string[] }[] = [
  { href: '/', label: 'Dashboard', icon: <IconHome size={18} />, perms: [] },
  { href: '/users', label: 'Users', icon: <IconUsers size={18} />, perms: ['admin:users:read'] },
  { href: '/orders', label: 'Orders', icon: <IconPackage size={18} />, perms: ['admin:orders:read'] },
  { href: '/merchants', label: 'Merchants', icon: <IconStore size={18} />, perms: ['admin:merchants:read'] },
  { href: '/organizations', label: 'Organizations', icon: <IconBuilding size={18} />, perms: ['admin:users:read'] },
  { href: '/verification', label: 'Verification', icon: <IconShield size={18} />, perms: ['merchant:verification:review'] },
  { href: '/categories', label: 'Categories', icon: <IconFolder size={18} />, perms: ['catalog:categories:write'] },
  { href: '/brands', label: 'Brands', icon: <IconTag size={18} />, perms: ['catalog:brands:manage'] },
  { href: '/disputes', label: 'Disputes', icon: <IconScale size={18} />, perms: ['support:disputes:resolve'] },
  { href: '/products', label: 'Products', icon: <IconBox size={18} />, perms: ['admin:merchants:read'] },
    { href: '/offers', label: 'Offers', icon: <IconBox size={18} />, perms: ['catalog:offers:govern'] },
  { href: '/offers-kpis', label: 'Offer KPIs', icon: <IconBarChart size={18} />, perms: ['admin:kpis:read'] },
  { href: '/offers-trend', label: 'Offer Trend', icon: <IconBarChart size={18} />, perms: ['admin:kpis:read'] },
  { href: '/kpis', label: 'KPIs', icon: <IconBarChart size={18} />, perms: ['admin:kpis:read'] },
  { href: '/audit', label: 'Audit Log', icon: <IconClipboard size={18} />, perms: ['admin:audit:read'] },
  { href: '/account', label: 'Account Security', icon: <IconLock size={18} />, perms: [] },
];

const SIDEBAR_WIDTH = 220;
const COLLAPSED_WIDTH = 56;

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUser();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Responsive breakpoint detection
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 1080;
      setIsMobile(mobile);
      if (mobile) setCollapsed(false);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Close mobile overlay on navigation
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/auth/login');
  }, [router]);

  const sidebarWidth = isMobile ? 0 : (collapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH);

  // Sync sidebar width to a CSS variable so the layout content area can respond
  useEffect(() => {
    document.documentElement.style.setProperty('--admin-sidebar-width', `${sidebarWidth}px`);
    return () => { document.documentElement.style.removeProperty('--admin-sidebar-width'); };
  }, [sidebarWidth]);

  const sidebarContent = (
    <>
      <style>{`
        .admin-sidebar-nav::-webkit-scrollbar { width: 4px; }
        .admin-sidebar-nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
        .admin-sidebar-link { display: flex; align-items: center; gap: 10px; text-decoration: none; transition: background 0.15s ease, color 0.15s ease; position: relative; }
        .admin-sidebar-link:hover { background: rgba(255,255,255,0.08); }
        .admin-sidebar-link[data-active="true"] { background: rgba(255,255,255,0.12); }
        .admin-sidebar-link[data-active="true"]::before { content: ''; position: absolute; left: 0; top: 4px; bottom: 4px; width: 3px; background: #38bdf8; border-radius: 0 2px 2px 0; }
        .admin-sidebar-tooltip { display: none; position: absolute; left: calc(100% + 8px); top: 50%; transform: translateY(-50%); background: #0c2831; color: #fff; font-size: 12px; padding: 4px 10px; border-radius: 4px; white-space: nowrap; z-index: 1001; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
        .admin-sidebar-collapsed .admin-sidebar-link:hover .admin-sidebar-tooltip { display: block; }
      `}</style>

      {/* Header */}
      <div style={{ padding: collapsed && !isMobile ? '24px 12px 20px' : '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: collapsed && !isMobile ? 'center' : 'space-between' }}>
        {(!collapsed || isMobile) && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' }}>SCS Admin</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Platform Operations</div>
          </div>
        )}
        {collapsed && !isMobile && (
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>S</div>
        )}
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: 4 }} aria-label="Close menu">
            <IconX size={20} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="admin-sidebar-nav" style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
        {navItems
          .filter((item) => {
            if (item.perms.length === 0) return true;
            const userPerms = user?.perms ?? [];
            return item.perms.every((p) => userPerms.includes(p));
          })
          .map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className="admin-sidebar-link"
                data-active={isActive}
                style={{
                  padding: collapsed && !isMobile ? '10px 0' : '10px 20px',
                  justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
                }}
              >
                <span style={{ color: isActive ? '#fff' : 'rgba(255,255,255,0.55)', flexShrink: 0, display: 'flex' }}>
                  {item.icon}
                </span>
                {(!collapsed || isMobile) && item.label}
                {collapsed && !isMobile && (
                  <span className="admin-sidebar-tooltip">{item.label}</span>
                )}
              </Link>
            );
          })}
      </nav>

      {/* Footer */}
      <div style={{ padding: collapsed && !isMobile ? '12px 8px' : '12px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        {(!collapsed || isMobile) && user && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.fullName}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{user.role}</div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: collapsed && !isMobile ? 'center' : 'space-between', alignItems: 'center' }}>
          {(!collapsed || isMobile) && (
            <button
              onClick={() => setCollapsed(true)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', padding: 4, display: 'flex' }}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <IconMenu size={16} />
            </button>
          )}
          {collapsed && !isMobile && (
            <button
              onClick={() => setCollapsed(false)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', padding: 4, display: 'flex' }}
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <IconMenu size={16} />
            </button>
          )}
          {isAuthenticated() && (
            <button
              onClick={handleLogout}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: collapsed && !isMobile ? '4px' : '4px 8px',
                fontSize: 11, color: 'rgba(255,255,255,0.5)',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 4, cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
              title="Logout"
            >
              <IconLogOut size={14} />
              {(!collapsed || isMobile) && 'Logout'}
            </button>
          )}
        </div>
      </div>
    </>
  );

  // Mobile: overlay sidebar
  if (isMobile) {
    return (
      <>
        {/* Hamburger button */}
        {!mobileOpen && (
          <button
            onClick={() => setMobileOpen(true)}
            style={{
              position: 'fixed', top: 12, left: 12, zIndex: 99,
              width: 40, height: 40, borderRadius: 8,
              background: '#0f3340', color: '#fff',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
            aria-label="Open navigation menu"
          >
            <IconMenu size={20} />
          </button>
        )}
        {/* Overlay */}
        {mobileOpen && (
          <>
            <div
              onClick={() => setMobileOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(7,30,50,0.5)', zIndex: 100 }}
            />
            <aside style={{
              position: 'fixed', top: 0, left: 0, bottom: 0,
              width: SIDEBAR_WIDTH, background: '#0f3340', color: '#fff',
              display: 'flex', flexDirection: 'column', zIndex: 101,
            }}>
              {sidebarContent}
            </aside>
          </>
        )}
        {/* Spacer to offset the main content when sidebar is hidden */}
        <div style={{ display: 'none' }} />
      </>
    );
  }

  // Desktop: fixed sidebar
  return (
    <aside
      className={collapsed ? 'admin-sidebar-collapsed' : ''}
      style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: sidebarWidth,
        background: '#0f3340', color: '#fff',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.2s ease',
        zIndex: 100,
        overflow: 'hidden',
      }}
    >
      {sidebarContent}
    </aside>
  );
}
