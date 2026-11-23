import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const {
  adminRequest,
  fetchCategoryContents,
  fetchCategoryProducts,
  fetchCategoryProductTypesForAdmin,
} = vi.hoisted(() => ({
  adminRequest: vi.fn(),
  fetchCategoryContents: vi.fn(),
  fetchCategoryProducts: vi.fn(),
  fetchCategoryProductTypesForAdmin: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'category-1' }) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('../lib/api', () => ({
  adminRequest: (...args: unknown[]) => adminRequest(...args),
  fetchCategoryContents: (...args: unknown[]) => fetchCategoryContents(...args),
  fetchCategoryProducts: (...args: unknown[]) => fetchCategoryProducts(...args),
  fetchCategoryProductTypesForAdmin: (...args: unknown[]) =>
    fetchCategoryProductTypesForAdmin(...args),
  fetchProductTypeSchema: vi.fn(),
}));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: true, missingPerms: [] }),
}));
vi.mock('../components/detail', () => ({
  AdminDetailHeader: ({ title }: { title: string }) => (
    <header>
      <h1>{title}</h1>
    </header>
  ),
  AdminDetailTabs: ({
    tabs,
    activeKey,
    onChange,
  }: {
    tabs: { key: string; label: string }[];
    activeKey: string;
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
        Retry category products
      </button>
    </div>
  ),
  AdminEmptyState: ({ title }: { title: string }) => <div>{title}</div>,
  formatDate: () => 'Today',
}));

import CategoryDetailPage from '../app/categories/[id]/page';

describe('admin category detail auxiliary reads', () => {
  beforeEach(() => {
    adminRequest.mockReset();
    fetchCategoryContents.mockReset();
    fetchCategoryProducts.mockReset();
    fetchCategoryProductTypesForAdmin.mockReset();
    adminRequest.mockResolvedValue({ data: [], total: 0 });
    fetchCategoryContents.mockResolvedValue({
      id: 'category-1',
      name: 'Laptops',
      nameAr: null,
      slug: 'laptops',
      path: 'electronics/laptops',
      isActive: true,
      parent: null,
      children: [],
      sortOrder: 1,
      productTypeCount: 0,
      directProductCount: 0,
      descendantProductCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    fetchCategoryProductTypesForAdmin.mockResolvedValue([]);
    fetchCategoryProducts.mockResolvedValue({ direct: [], descendant: [] });
  });
  afterEach(() => cleanup());

  it('does not show an empty product state after a failed category product read and retries', async () => {
    fetchCategoryProducts
      .mockRejectedValueOnce(new Error('Category products unavailable'))
      .mockResolvedValueOnce({ direct: [], descendant: [] });

    render(<CategoryDetailPage />);
    expect(await screen.findByRole('heading', { name: 'Laptops' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Products' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Category products unavailable',
    );
    expect(screen.queryByText('No direct products')).toBeNull();
    expect(screen.queryByText('No descendant products')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry category products' }));
    expect(await screen.findByText('No direct products')).toBeTruthy();
    expect(await screen.findByText('No descendant products')).toBeTruthy();
  });
});
