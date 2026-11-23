import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { fetchDataQualityMetrics, fetchKpis, hasAccess } = vi.hoisted(() => ({
  fetchDataQualityMetrics: vi.fn(),
  fetchKpis: vi.fn(),
  hasAccess: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  fetchDataQualityMetrics: (...args: unknown[]) => fetchDataQualityMetrics(...args),
  fetchKpis: (...args: unknown[]) => fetchKpis(...args),
}));

vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: hasAccess(), missingPerms: [] }),
  AccessDenied: () => <div>Access denied</div>,
}));

import DataQualityPage from '../app/data-quality/page';
import KpiDashboardPage from '../app/kpis/page';

describe('Admin dashboard read permission gates', () => {
  beforeEach(() => {
    hasAccess.mockReset().mockReturnValue(false);
    fetchDataQualityMetrics.mockReset().mockResolvedValue({});
    fetchKpis.mockReset().mockResolvedValue({});
  });

  afterEach(() => cleanup());

  it('does not fetch data quality metrics without catalog management permission', () => {
    render(<DataQualityPage />);

    expect(screen.getByText('Access denied')).toBeTruthy();
    expect(fetchDataQualityMetrics).not.toHaveBeenCalled();
  });

  it('does not fetch KPI data without the KPI read permission', () => {
    render(<KpiDashboardPage />);

    expect(screen.getByText('Access denied')).toBeTruthy();
    expect(fetchKpis).not.toHaveBeenCalled();
  });
});
