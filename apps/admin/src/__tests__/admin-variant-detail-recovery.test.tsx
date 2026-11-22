import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { adminRequest, hasAccess, push } = vi.hoisted(() => ({
  adminRequest: vi.fn(),
  hasAccess: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'variant-1' }),
  useRouter: () => ({ push }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('../lib/api', () => ({ adminRequest: (...args: unknown[]) => adminRequest(...args) }));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: hasAccess(), missingPerms: [] }),
}));
vi.mock('../components/detail', () => ({
  AdminDetailHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => <header><h1>{title}</h1>{actions}</header>,
  AdminDetailTabs: ({ tabs, onChange }: { tabs: { key: string; label: string }[]; onChange: (key: string) => void }) => <nav>{tabs.map((tab) => <button key={tab.key} onClick={() => onChange(tab.key)}>{tab.label}</button>)}</nav>,
  AdminDetailSection: ({ title, children }: { title: string; children: React.ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  AdminKeyValueGrid: ({ items }: { items: { key: string; label: string; value: React.ReactNode }[] }) => <div>{items.map((item) => <div key={item.key}>{item.label}:{item.value}</div>)}</div>,
  AdminStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  AdminEntityLink: () => null,
  AdminCopyButton: () => null,
  AdminLoadingSkeleton: () => <div>Loading variant</div>,
  AdminErrorState: ({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) => <div role="alert"><strong>{title}</strong><span>{message}</span><button onClick={onRetry}>Retry variant</button></div>,
  formatDate: (value: string) => value,
}));

import VariantDetailPage from '../app/variants/[id]/page';

const variant = {
  id: 'variant-1',
  productId: 'product-1',
  sku: 'SKU-001',
  title: 'Blue Large',
  titleAr: null,
  barcode: null,
  unit: 'PCS',
  weightGrams: 250,
  isActive: true,
  combinationKey: 'color-blue-size-large',
  createdAt: '2026-11-22T10:00:00.000Z',
  updatedAt: '2026-11-22T10:00:00.000Z',
};

describe('admin variant detail read recovery', () => {
  beforeEach(() => {
    hasAccess.mockReset().mockReturnValue(true);
    adminRequest.mockReset().mockResolvedValue(variant);
    push.mockReset();
  });

  afterEach(() => cleanup());

  it('preserves the last successful variant when a same-ID refresh fails', async () => {
    adminRequest
      .mockResolvedValueOnce(variant)
      .mockRejectedValueOnce(new Error('Variant service unavailable'));

    render(<VariantDetailPage />);

    expect(await screen.findByText('SKU-001')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Variant service unavailable');
    expect(screen.getByText('SKU-001')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('last successfully loaded variant');
  });
});
