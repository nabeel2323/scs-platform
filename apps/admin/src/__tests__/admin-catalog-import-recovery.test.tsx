import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { fetchCatalogImports } = vi.hoisted(() => ({ fetchCatalogImports: vi.fn() }));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('../lib/api', () => ({
  uploadCatalogImport: vi.fn(),
  fetchCatalogImports: (...args: unknown[]) => fetchCatalogImports(...args),
  fetchCatalogImportPreview: vi.fn(),
  executeCatalogImport: vi.fn(),
  retryCatalogImport: vi.fn(),
  fetchCatalogImportErrors: vi.fn(),
  downloadCatalogTemplate: vi.fn(),
  downloadCatalogImportReport: vi.fn(),
  exportCatalog: vi.fn(),
}));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: true, missingPerms: [] }),
  AccessDenied: () => <div>Access denied</div>,
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title }: { title: string }) => <header><h1>{title}</h1></header>,
  colors: {
    surface: '#fff', border: '#ddd', ink: '#111', muted: '#888',
    brand: { 500: '#aaa', 700: '#333' },
  },
  typeScale: { h3: {}, bodySm: {}, body: {} },
  radii: { sm: 4, md: 8, lg: 12 },
  shadows: { sm: '' },
}));

import CatalogImportPage from '../app/catalog-import/page';

describe('admin catalog import history recovery', () => {
  beforeEach(() => {
    fetchCatalogImports.mockReset();
    fetchCatalogImports.mockResolvedValue([]);
  });
  afterEach(() => cleanup());

  it('does not show a successful empty history after a failed import read and retries', async () => {
    fetchCatalogImports
      .mockRejectedValueOnce(new Error('Import history unavailable'))
      .mockResolvedValueOnce([]);

    render(<CatalogImportPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Import history unavailable');
    expect(screen.queryByText('No imports yet. Upload a workbook to get started.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry imports' }));
    expect(await screen.findByText('No imports yet. Upload a workbook to get started.')).toBeTruthy();
    expect(fetchCatalogImports).toHaveBeenCalledTimes(2);
  });
});
