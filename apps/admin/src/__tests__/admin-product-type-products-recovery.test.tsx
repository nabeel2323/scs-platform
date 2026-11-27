import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const {
  fetchProductTypeSchema,
  fetchAttributes,
  adminRequest,
  setProductTypeAttributes,
  setVariantDimensions,
  publishProductType,
} = vi.hoisted(() => ({
  fetchProductTypeSchema: vi.fn(),
  fetchAttributes: vi.fn(),
  adminRequest: vi.fn(),
  setProductTypeAttributes: vi.fn(),
  setVariantDimensions: vi.fn(),
  publishProductType: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'type-1' }) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('../lib/api', () => ({
  fetchProductTypeSchema: (...args: unknown[]) => fetchProductTypeSchema(...args),
  fetchAttributes: (...args: unknown[]) => fetchAttributes(...args),
  adminRequest: (...args: unknown[]) => adminRequest(...args),
  setProductTypeAttributes: (...args: unknown[]) => setProductTypeAttributes(...args),
  setVariantDimensions: (...args: unknown[]) => setVariantDimensions(...args),
  publishProductType: (...args: unknown[]) => publishProductType(...args),
}));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: true, missingPerms: [] }),
  AccessDenied: () => <div>Access denied</div>,
}));
vi.mock('../components/product-type-builder', () => ({
  AttributeTree: ({
    allAttributes,
    onAdd,
  }: {
    allAttributes: { id: string }[];
    onAdd: (id: string) => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        const first = allAttributes[0];
        if (first) onAdd(first.id);
      }}
    >
      Add test attribute
    </button>
  ),
  AttributeConfigPanel: () => null,
  VariantDimensionSelector: () => null,
}));
vi.mock('../components/detail', () => ({
  AdminDetailHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
  AdminDetailTabs: ({
    tabs,
    onChange,
  }: {
    tabs: { key: string; label: string }[];
    onChange: (key: string) => void;
  }) => (
    <nav>
      {tabs.map((tab) => (
        <button key={tab.key} type="button" onClick={() => onChange(tab.key)}>
          {tab.label}
        </button>
      ))}
    </nav>
  ),
  AdminDetailSection: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  AdminKeyValueGrid: () => null,
  AdminStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  AdminEntityLink: ({ name }: { name: string }) => <span>{name}</span>,
  AdminCopyButton: () => null,
  AdminLoadingSkeleton: () => <div role="status">Loading</div>,
  AdminErrorState: ({
    title,
    message,
    onRetry,
  }: {
    title: string;
    message: string;
    onRetry: () => void;
  }) => (
    <div role="alert">
      <span>
        {title}: {message}
      </span>
      <button type="button" onClick={onRetry}>
        Retry product-type products
      </button>
    </div>
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
    setProductTypeAttributes.mockReset().mockResolvedValue(undefined);
    setVariantDimensions.mockReset().mockResolvedValue(undefined);
    publishProductType.mockReset().mockResolvedValue({ id: 'type-1', status: 'PUBLISHED' });
    fetchProductTypeSchema.mockResolvedValue({
      id: 'type-1',
      name: 'Laptop',
      code: 'laptop',
      status: 'PUBLISHED',
      version: 1,
      attributes: [],
      variantDimensions: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    fetchAttributes.mockResolvedValue([]);
    adminRequest.mockResolvedValue({
      canPublish: true,
      errors: [],
      warnings: [],
      products: [],
      totalCount: 0,
      totalVariantCount: 0,
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not publish a dirty product type when saving its configuration fails', async () => {
    fetchProductTypeSchema.mockResolvedValueOnce({
      id: 'type-1',
      name: 'Laptop',
      code: 'laptop',
      status: 'DRAFT',
      version: 1,
      attributes: [],
      groups: [],
      variantDimensions: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    fetchAttributes.mockResolvedValueOnce([{ id: 'attribute-1', name: 'RAM' }]);
    setProductTypeAttributes.mockRejectedValueOnce(new Error('Configuration save failed'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ProductTypeBuilderPage />);
    expect(await screen.findByRole('heading', { name: 'Laptop' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Attribute Builder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add test attribute' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Configuration save failed')).toBeTruthy();
    expect(publishProductType).not.toHaveBeenCalled();
    expect(setVariantDimensions).not.toHaveBeenCalled();
  });

  it('does not show an empty product state after a failed product-type read and retries', async () => {
    adminRequest
      .mockRejectedValueOnce(new Error('Product type products unavailable'))
      .mockResolvedValueOnce({ products: [], totalCount: 0, totalVariantCount: 0 });

    render(<ProductTypeBuilderPage />);
    expect(await screen.findByRole('heading', { name: 'Laptop' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Products' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Product type products unavailable',
    );
    expect(screen.queryByText('No products')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry product-type products' }));
    expect(await screen.findByText('No products')).toBeTruthy();
  });
});
