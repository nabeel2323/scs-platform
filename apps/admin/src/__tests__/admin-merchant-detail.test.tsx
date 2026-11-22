import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { adminRequest } = vi.hoisted(() => ({ adminRequest: vi.fn() }));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'store-1' }) }));
vi.mock('../lib/api', () => ({ adminRequest: (...args: unknown[]) => adminRequest(...args) }));
vi.mock('../hooks/useRequirePerms', () => ({ useRequirePerms: () => ({ hasAccess: true }) }));
vi.mock('../components/RecordFields', () => ({
  PreviewImage: ({ reference }: { reference: string }) => <div>Preview {reference}</div>,
  RecordFields: ({ record }: { record: Record<string, unknown> }) => <div>Address {Object.values(record).join(', ')}</div>,
}));
vi.mock('../components/detail', () => ({
  AdminDetailHeader: ({ title }: { title: string }) => <header><h1>{title}</h1></header>,
  AdminDetailTabs: ({ tabs, activeKey, onChange }: { tabs: { key: string; label: string }[]; activeKey: string; onChange: (key: string) => void }) => (
    <nav>{tabs.map(tab => <button key={tab.key} type="button" aria-pressed={activeKey === tab.key} onClick={() => onChange(tab.key)}>{tab.label}</button>)}</nav>
  ),
  AdminDetailSection: ({ title, children }: { title: string; children: React.ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  AdminKeyValueGrid: ({ items }: { items: { label: string; value: React.ReactNode }[] }) => <dl>{items.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>,
  AdminStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  AdminEntityLink: ({ name }: { name: string }) => <span>{name}</span>,
  AdminCopyButton: () => null,
  AdminLoadingSkeleton: () => <div role="status">Loading</div>,
  AdminErrorState: ({ title, message }: { title: string; message: string }) => <div role="alert">{title}: {message}</div>,
  formatDate: () => 'Today',
}));

import MerchantDetailPage from '../app/merchants/[id]/page';

describe('admin merchant store detail', () => {
  beforeEach(() => {
    adminRequest.mockReset();
    adminRequest.mockResolvedValue({
      id: 'store-1',
      orgId: 'org-1',
      orgName: 'North Wholesale',
      displayName: 'North Store',
      slug: 'north-store',
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      currency: 'SAR',
      timezone: 'Asia/Riyadh',
      locale: 'ar',
      description: 'Wholesale store',
      hidePopularityBadge: true,
      logoUrl: 'https://cdn.example.test/logo.png',
      coverUrl: 'https://cdn.example.test/cover.png',
      address: { city: 'Riyadh', country: 'SA' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
  });
  afterEach(() => cleanup());

  it('shows store branding, address, locale and popularity visibility from the store record', async () => {
    render(<MerchantDetailPage />);

    expect(await screen.findByRole('heading', { name: 'North Store' })).toBeTruthy();
    expect(screen.getByText('Store Branding')).toBeTruthy();
    expect(screen.getByText('Preview https://cdn.example.test/logo.png')).toBeTruthy();
    expect(screen.getByText('Preview https://cdn.example.test/cover.png')).toBeTruthy();
    expect(screen.getByText('Store Address')).toBeTruthy();
    expect(screen.getByText('Address Riyadh, SA')).toBeTruthy();
    expect(screen.getByText('Locale')).toBeTruthy();
    expect(screen.getByText('ar')).toBeTruthy();
    expect(screen.getByText('Popularity Badge')).toBeTruthy();
    expect(screen.getByText('Hidden')).toBeTruthy();
  });
});
