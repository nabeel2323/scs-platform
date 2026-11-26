import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { fetchKpis } = vi.hoisted(() => ({ fetchKpis: vi.fn() }));

vi.mock('../lib/api', () => ({
  fetchKpis: (...args: unknown[]) => fetchKpis(...args),
}));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: true, missingPerms: [] }),
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title }: { title: string }) => (
    <header>
      <h1>{title}</h1>
    </header>
  ),
  KpiCard: ({ label, value }: { label: string; value: string }) => (
    <div>
      {label}:{value}
    </div>
  ),
  IconUsers: () => null,
  IconShield: () => null,
  IconPackage: () => null,
  IconDollar: () => null,
  IconActivity: () => null,
  IconXCircle: () => null,
  IconAlertTriangle: () => null,
  IconCheck: () => null,
  IconCheckCircle: () => null,
  IconRefresh: () => null,
  colors: {
    brand: { 50: '#eee', 700: '#333' },
    infoBg: '#eef',
    okBg: '#efe',
    err: '#b00',
    errBg: '#fee',
    warn: '#880',
    warnBg: '#ffe',
    bgSubtle: '#fafafa',
    surface: '#fff',
    border: '#ddd',
    disabled: '#aaa',
    muted: '#888',
  },
  typeScale: {
    body: { fontSize: 14 },
    bodySm: { fontSize: 12 },
    caption: { fontSize: 11 },
    h3: { fontSize: 20 },
    h4: { fontSize: 16 },
  },
  shadows: { md: '' },
  radii: { sm: 6, md: 8, lg: 12 },
  transitions: { fast: '100ms' },
}));

import KpiDashboardPage from '../app/kpis/page';

const kpiResponse = {
  revenue: { totalMinor: 12345 },
  orders: { total: 5, completed: 3, cancelled: 1, completionRate: 60, cancellationRate: 20 },
  users: { total: 10 },
  merchants: { verified: 2, pending: 1 },
  conversion: { firstOrderRate: 40, repeatOrderRate: 10 },
  activationFunnel: { registered: 10, verified: 2, catalogReady: 1, firstOrder: 1, repeatThree: 0 },
  period: { from: '2026-01-01', to: '2026-01-31' },
};

describe('admin KPI dashboard recovery', () => {
  beforeEach(() => {
    fetchKpis.mockReset();
  });
  afterEach(() => cleanup());

  it('surfaces an initial KPI failure and retries without showing fabricated zero values', async () => {
    fetchKpis
      .mockRejectedValueOnce(new Error('KPI service unavailable'))
      .mockResolvedValueOnce(kpiResponse);

    render(<KpiDashboardPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('KPI service unavailable');
    expect(screen.queryByText('Total Revenue:123.45 SAR')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry KPIs' }));

    expect(await screen.findByText('Total Revenue:123.45 SAR')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
