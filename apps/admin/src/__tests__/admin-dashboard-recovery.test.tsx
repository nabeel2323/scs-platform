import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const {
  fetchKpis,
  fetchAdminOrgUpdateRequests,
  fetchCatalogImports,
  fetchAdminCatalogRequests,
} = vi.hoisted(() => ({
  fetchKpis: vi.fn(),
  fetchAdminOrgUpdateRequests: vi.fn(),
  fetchCatalogImports: vi.fn(),
  fetchAdminCatalogRequests: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('../lib/api', () => ({
  fetchKpis: (...args: unknown[]) => fetchKpis(...args),
  fetchAdminOrgUpdateRequests: (...args: unknown[]) => fetchAdminOrgUpdateRequests(...args),
  fetchCatalogImports: (...args: unknown[]) => fetchCatalogImports(...args),
  fetchAdminCatalogRequests: (...args: unknown[]) => fetchAdminCatalogRequests(...args),
}));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: true }),
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title }: { title: string }) => <header><h1>{title}</h1></header>,
  KpiCard: ({ label, value }: { label: string; value: string }) => <div>{label}:{value}</div>,
  QuickLink: ({ title }: { title: string }) => <div>{title}</div>,
  IconUsers: () => null,
  IconShield: () => null,
  IconPackage: () => null,
  IconDollar: () => null,
  IconActivity: () => null,
  IconBarChart: () => null,
  IconClipboard: () => null,
  IconRefresh: () => null,
  colors: {
    brand: { 50: '#eee', 300: '#ddd', 500: '#aaa', 700: '#333' },
    ok: '#080', okBg: '#efe', warn: '#880', warnBg: '#ffe',
    info: '#008', infoBg: '#eef', muted: '#888', surface: '#fff',
    border: '#ddd', borderLight: '#eee', bgSubtle: '#fafafa', err: '#b00',
  },
  typeScale: { caption: {}, body: {}, bodySm: {}, label: {}, h4: {} },
  shadows: { md: '' },
  radii: { md: 8, full: 999, sm: 4 },
  transitions: {},
}));

import AdminHomePage from '../app/page';

const kpiResponse = {
  users: { total: 1 },
  merchants: { verified: 2, pending: 3 },
  orders: { total: 4, completionRate: 50 },
  revenue: { totalMinor: 12345 },
};

describe('admin dashboard read recovery', () => {
  beforeEach(() => {
    fetchKpis.mockReset();
    fetchAdminOrgUpdateRequests.mockReset();
    fetchCatalogImports.mockReset();
    fetchAdminCatalogRequests.mockReset();
    fetchKpis.mockResolvedValue(kpiResponse);
    fetchAdminOrgUpdateRequests.mockResolvedValue([]);
    fetchCatalogImports.mockResolvedValue([]);
    fetchAdminCatalogRequests.mockResolvedValue([]);
  });
  afterEach(() => cleanup());

  it('keeps KPI, organization update and catalog operation failures independent and retryable', async () => {
    fetchKpis.mockRejectedValueOnce(new Error('KPI service unavailable'));
    fetchAdminOrgUpdateRequests.mockRejectedValueOnce(new Error('Organization updates unavailable'));
    fetchCatalogImports.mockRejectedValueOnce(new Error('Catalog imports unavailable'));
    fetchAdminCatalogRequests.mockRejectedValueOnce(new Error('Catalog requests unavailable'));

    render(<AdminHomePage />);

    expect(await screen.findByText('KPI service unavailable')).toBeTruthy();
    expect(await screen.findByText('Organization updates unavailable')).toBeTruthy();
    expect(await screen.findByText('Catalog imports unavailable')).toBeTruthy();
    expect(await screen.findByText('Catalog requests unavailable')).toBeTruthy();
    expect(screen.queryByText('No pending update requests')).toBeNull();
    expect(screen.queryByText('No catalog imports yet.')).toBeNull();
    expect(screen.queryByText('No pending catalog requests.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry KPIs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry organization updates' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry imports' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry requests' }));

    expect(await screen.findByText('Total Users:1')).toBeTruthy();
    expect(await screen.findByText('No pending update requests')).toBeTruthy();
    expect(await screen.findByText('No catalog imports yet.')).toBeTruthy();
    expect(await screen.findByText('No pending catalog requests.')).toBeTruthy();
  });
});
