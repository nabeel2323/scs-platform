'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { isAuthenticated, getUser, logout } from '../lib/auth';

const navItems = [
  { href: '/', label: 'Dashboard', icon: '⌂' },
  { href: '/users', label: 'Users', icon: '👥' },
  { href: '/orders', label: 'Orders', icon: '📦' },
  { href: '/merchants', label: 'Merchants', icon: '🏪' },
  { href: '/verification', label: 'Verification', icon: '✓' },
  { href: '/disputes', label: 'Disputes', icon: '⚖' },
  { href: '/products', label: 'Products', icon: '📋' },
  { href: '/kpis', label: 'KPIs', icon: '📊' },
  { href: '/audit', label: 'Audit Log', icon: '📋' },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUser();

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  return (
    <aside style={{
      position: 'fixed',
      top: 0,
      left: 0,
      bottom: 0,
      width: 220,
      background: '#0f3340',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 0',
      zIndex: 100,
    }}>
      <div style={{ padding: '0 20px 24px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' }}>SCS Admin</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Platform Operations</div>
      </div>

      <nav style={{ flex: 1, padding: '16px 0' }}>
        {navItems.map(item => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
                background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                textDecoration: 'none',
                borderRight: isActive ? '3px solid #38bdf8' : '3px solid transparent',
                transition: 'background 0.15s',
              }}
            >
              <span style={{ fontSize: 15, width: 20, textAlign: 'center' }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        {user && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>{user.fullName}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{user.role}</div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>v1.0.0 — Phase 1</span>
          {isAuthenticated() && (
            <button onClick={handleLogout}
              style={{ padding: '3px 8px', fontSize: 10, color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, cursor: 'pointer' }}>
              Logout
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
