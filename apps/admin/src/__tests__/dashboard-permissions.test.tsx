import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  perms: [] as string[], adminRequest: vi.fn(), fetchKpis: vi.fn(),
  fetchAdminOrgUpdateRequests: vi.fn(), fetchCatalogImports: vi.fn(), fetchAdminCatalogRequests: vi.fn(),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock('../lib/auth', () => ({ getUser: () => ({ id: 'admin-1', role: 'ADMIN', perms: mocks.perms }) }));
vi.mock('../lib/api', () => ({
  adminRequest: mocks.adminRequest, fetchKpis: mocks.fetchKpis,
  fetchAdminOrgUpdateRequests: mocks.fetchAdminOrgUpdateRequests,
  fetchCatalogImports: mocks.fetchCatalogImports, fetchAdminCatalogRequests: mocks.fetchAdminCatalogRequests,
}));
vi.mock('@scs/ui-kit', () => {
  const Icon = () => null;
  return {
    PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
    Card: () => null,
    KpiCard: ({ label, value }: { label: string; value: string }) => (
      <div data-testid="kpi-card"><span>{label}</span><span>{value}</span></div>
    ),
    QuickLink: ({ title }: { title: string }) => <span>{title}</span>,
    IconUsers: Icon, IconShield: Icon, IconPackage: Icon, IconDollar: Icon,
    IconActivity: Icon, IconBarChart: Icon, IconClipboard: Icon, IconRefresh: Icon,
    colors: {
      brand: { 50: '#eee', 300: '#ddd', 500: '#999', 700: '#333' },
      ok: '#080', okBg: '#efe', warn: '#880', warnBg: '#ffe', info: '#008', infoBg: '#eef',
      surface: '#fff', border: '#ddd', borderLight: '#eee', muted: '#777', bgSubtle: '#f5f5f5', err: '#800',
    },
    typeScale: { caption: { fontSize: 12 }, bodySm: { fontSize: 13 }, body: { fontSize: 14 }, h4: { fontSize: 18 }, label: { fontSize: 11 } },
    shadows: { md: 'none' }, radii: { sm: 4, md: 8, full: 999 }, transitions: {},
  };
});
import AdminHomePage from '../app/page';
import CommissionOversightPage from '../app/commission/page';
const kpiFixture = {
  users: { total: 10 }, merchants: { verified: 5, pending: 2 },
  orders: { total: 12, completionRate: 50 }, revenue: { totalMinor: 100000 },
};
beforeEach(() => {
  mocks.perms = [];
  mocks.adminRequest.mockReset().mockResolvedValue([]);
  mocks.fetchKpis.mockReset().mockResolvedValue(kpiFixture);
  mocks.fetchAdminOrgUpdateRequests.mockReset().mockResolvedValue([]);
  mocks.fetchCatalogImports.mockReset().mockResolvedValue([]);
  mocks.fetchAdminCatalogRequests.mockReset().mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('Admin dashboard read permissions', () => {
  it('does not request or render KPI and organization data without their permissions', async () => {
    render(<AdminHomePage />);
    await waitFor(() => {
      expect(mocks.fetchKpis).not.toHaveBeenCalled();
      expect(mocks.fetchAdminOrgUpdateRequests).not.toHaveBeenCalled();
    });
    expect(screen.queryByText('Total Users')).toBeNull();
    expect(screen.queryByText('Pending Organization Updates')).toBeNull();
  });
  it('loads KPI data only with admin:kpis:read', async () => {
    mocks.perms = ['admin:kpis:read'];
    render(<AdminHomePage />);
    await waitFor(() => expect(mocks.fetchKpis).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Total Users')).toBeTruthy();
    expect(mocks.fetchAdminOrgUpdateRequests).not.toHaveBeenCalled();
    expect(screen.queryByText('Pending Organization Updates')).toBeNull();
  });
  it('loads organization updates only with admin:users:read', async () => {
    mocks.perms = ['admin:users:read'];
    render(<AdminHomePage />);
    await waitFor(() => expect(mocks.fetchAdminOrgUpdateRequests).toHaveBeenCalledWith('PENDING'));
    expect(screen.getByText('Pending Organization Updates')).toBeTruthy();
    expect(screen.queryByText('Total Users')).toBeNull();
    expect(mocks.fetchKpis).not.toHaveBeenCalled();
  });
});
describe('Commission oversight read permission', () => {
  it('denies the page and makes no request without admin:commission:read', async () => {
    render(<CommissionOversightPage />);
    expect(screen.getByText('Access Denied')).toBeTruthy();
    expect(screen.getByText('admin:commission:read')).toBeTruthy();
    await waitFor(() => expect(mocks.adminRequest).not.toHaveBeenCalled());
  });
  it('loads reversals only with admin:commission:read', async () => {
    mocks.perms = ['admin:commission:read'];
    render(<CommissionOversightPage />);
    await waitFor(() => expect(mocks.adminRequest).toHaveBeenCalledWith('admin/commission-reversals'));
  });
});
