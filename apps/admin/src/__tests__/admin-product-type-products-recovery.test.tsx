import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { fetchProductTypeSchema, fetchAttributes, adminRequest } = vi.hoisted(() => ({
  fetchProductTypeSchema: vi.fn(),
  fetchAttributes: vi.fn(),
  adminRequest: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'type-1' }) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('../lib/api', () => ({
  fetchProductTypeSchema: (...args: unknown[]) => fetchProductTypeSchema(...args),
  fetchAttributes: (...args: unknown[]) => fetchAttributes(...args),
  adminRequest: (...args: unknown[]) => adminRequest(...args),
}));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: true, missingPerms: [] }),
  AccessDenied: () => <div>Access denied</div>,
}));
vi.mock('../components/product-type-builder', () => ({
  AttributeTree: () => null,
  AttributeConfigPanel: () => null,
  VariantDimensionSelector: () => null,
}));
vi.mock('../components/detail', () => ({
  AdminDetailHeader: ({ title }: { title: string }) => <header><h1>{title}</h1></header>,
  AdminDetailTabs: ({ tabs, onChange }: { tabs: { key: string; label: string }[]; onChange: (key: string) => void }) => (
    <nav>{tabs.map(tab => <button key={tab.key} type="button" onClick={() => onChange(tab.key)}>{tab.label}</button>)}</nav>
  ),
  AdminDetailSection: ({ title, children }: { title: string; children: React.ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  AdminKeyValueGrid: () => null,
  AdminStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  AdminEntityLink: ({ name }: { name: string }) => <span>{name}</span>,
  AdminCopyButton: () => null,
  AdminLoadingSkeleton: () => <div role="status">Loading</div>,
  AdminErrorState: ({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) => (
    <div role="alert"><span>{title}: {message}</span><button type="button" onClick={onRetry}>Retry product-type products</button></div>
  ),
  AdminEmptyState: ({ title }: { title: string }) => <div>{title}</div>,
  formatDate: () => 'Today',
}));
vi.mock('../components/management.module.css', () => ({ default: {} }));

import ProductTypeBuilderPage from '../app/product-types/[id]/page';

describe('admin product type product read recovery', () => {
  beforeEach(() => {
    fetchProductTypeSchema.mockReset();
    fetchAttributes.mockReset();
    adminRequest.mockReset();
    fetchProductTypeSchema.mockResolvedValue({
      id: 'type-1', name: 'Laptop', code: 'laptop', status: 'PUBLISHED', version: 1,
      attributes: [], variantDimensions: [], createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    fetchAttributes.mockResolvedValue([]);
    adminRequest.mockResolvedValue({ products: [], totalCount: 0, totalVariantCount: 0 });
  });
  afterEach(() => cleanup());

  it('does not show an empty product state after a failed product-type read and retries', async () => {
    adminRequest
      .mockRejectedValueOnce(new Error('Product type products unavailable'))
      .mockResolvedValueOnce({ products: [], totalCount: 0, totalVariantCount: 0 });

    render(<ProductTypeBuilderPage />);
    expect(await screen.findByRole('heading', { name: 'Laptop' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Products' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Product type products unavailable');
    expect(screen.queryByText('No products')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry product-type products' }));
    expect(await screen.findByText('No products')).toBeTruthy();
  });
});
