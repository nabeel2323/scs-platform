import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { useAdminResource, useAdminTableQuery } from '../hooks/useAdminTable';
import { managementTables } from '../lib/management-tables';
import DetailDialog from '../components/DetailDialog';
import ManagementPage, { rowClickOpensDetail } from '../components/ManagementPage';
import ProductDetails, { ProductModerationActions } from '../components/ProductDetails';
import { adminRequest, moderateAdminProduct } from '../lib/api';

const navigation = vi.hoisted(() => ({ query: '', replace: vi.fn(), allowed: true }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => '/products',
  useSearchParams: () => new URLSearchParams(navigation.query),
}));
vi.mock('../lib/api', () => ({ adminRequest: vi.fn(), moderateAdminProduct: vi.fn() }));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: navigation.allowed, missingPerms: navigation.allowed ? [] : ['denied'] }),
  AccessDenied: () => <p>Access Denied</p>,
}));

beforeEach(() => {
  vi.clearAllMocks(); navigation.query = ''; navigation.allowed = true;
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('URL-backed table query', () => {
  it('restores URL state, debounces search, and atomically resets pagination', () => {
    vi.useFakeTimers();
    navigation.query = 'search=old&page=3&limit=50&status=DRAFT';
    const { result, rerender } = renderHook(() => useAdminTableQuery(managementTables.products));
    expect(result.current.query).toMatchObject({ search: 'old', offset: 150, limit: 50, status: 'DRAFT' });
    act(() => result.current.setSearch('needle'));
    act(() => vi.advanceTimersByTime(299));
    expect(navigation.replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(navigation.replace.mock.lastCall?.[0]).toBe('/products?search=needle&limit=50&status=DRAFT');
    navigation.query = 'search=back&page=2'; rerender();
    expect(result.current.search).toBe('back');
    expect(result.current.page).toBe(2);
    act(() => result.current.change({ sortBy: 'title', sortDir: 'asc' }));
    expect(navigation.replace.mock.lastCall?.[0]).toBe('/products?search=back&sortBy=title&sortDir=asc');
    act(() => result.current.reset());
    expect(navigation.replace.mock.lastCall?.[0]).toBe('/products');
  });
  it('does not apply draft filters until Apply', () => {
    navigation.query = 'page=5';
    const { result } = renderHook(() => useAdminTableQuery(managementTables.products));
    act(() => result.current.setDraft({ status: 'ACTIVE', hasImages: 'true' }));
    expect(result.current.query['status']).toBeUndefined();
    act(() => result.current.apply());
    expect(navigation.replace.mock.lastCall?.[0]).toBe('/products?status=ACTIVE&hasImages=true');
  });
});

describe('stale-safe detail requests', () => {
  it('ignores obsolete responses and aborts on permission loss', async () => {
    const pending: ((value: unknown) => void)[] = [];
    vi.mocked(adminRequest).mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    const { result, rerender } = renderHook(({ id, enabled }) => useAdminResource<{ id: string }>(id, enabled), { initialProps: { id: 'first', enabled: true } });
    const signal = vi.mocked(adminRequest).mock.calls[0]?.[1]?.signal;
    rerender({ id: 'second', enabled: true });
    expect(signal?.aborted).toBe(true);
    await act(async () => pending[0]!({ id: 'first' }));
    expect(result.current.data).toBeUndefined();
    await act(async () => pending[1]!({ id: 'second' }));
    expect(result.current.data?.id).toBe('second');
    rerender({ id: 'second', enabled: false });
    expect(result.current.data).toBeUndefined();
  });
  it('shows fetch errors and supports retry', async () => {
    vi.mocked(adminRequest).mockRejectedValueOnce(new Error('Connection failed')).mockResolvedValueOnce({ id: 'ok' });
    const { result } = renderHook(() => useAdminResource('detail'));
    await waitFor(() => expect(result.current.error).toBe('Connection failed'));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toEqual({ id: 'ok' }));
  });
});

describe('accessible dialogs and row actions', () => {
  it('focuses Close, handles Escape, and restores the originating View button', () => {
    function Example() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>View</button>{open && <DetailDialog title="Details" onClose={() => setOpen(false)}>Content</DetailDialog>}</>;
    }
    render(<Example />);
    const view = screen.getByText('View'); view.focus(); fireEvent.click(view);
    expect(document.activeElement).toBe(screen.getByLabelText('Close details'));
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(view);
  });
  it('excludes nested interactive elements and selected text from row opening', () => {
    const { container } = render(<div><span>Plain</span><button><b>Action</b></button><a href="/products">Link</a><input /></div>);
    expect(rowClickOpensDetail(screen.getByText('Plain'))).toBe(true);
    for (const selector of ['b', 'a', 'input']) expect(rowClickOpensDetail(container.querySelector(selector))).toBe(false);
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'selected' } as Selection);
    expect(rowClickOpensDetail(screen.getByText('Plain'))).toBe(false);
  });
  it('prevents duplicate moderation and displays mutation errors', async () => {
    let fail!: (error: Error) => void;
    vi.mocked(moderateAdminProduct).mockImplementation(() => new Promise((_resolve, reject) => { fail = reject; }));
    const done = vi.fn();
    render(<ProductModerationActions id="selected-id" status="DRAFT" onDone={done} />);
    fireEvent.click(screen.getByText('Approve')); fireEvent.click(screen.getByText('Approve'));
    expect(moderateAdminProduct).toHaveBeenCalledTimes(1);
    await act(async () => fail(new Error('Permission revoked')));
    expect(screen.getByText('Permission revoked')).toBeTruthy();
    expect(done).not.toHaveBeenCalled();
  });
});

const product = { id: 'product-2', title: 'Full product', titleAr: 'منتج', description: 'Complete description', descriptionAr: 'وصف', slug: 'full-product', status: 'DRAFT', images: [], imageCount: 0, media: [], variants: [], store: null };
describe('management pages and shared product details', () => {
  it('reuses details in full-page and dialog modes', async () => {
    vi.mocked(adminRequest).mockImplementation(async path => path.includes('media-previews') ? { previews: {} } : product);
    const { unmount } = render(<ProductDetails id={product.id} />);
    await screen.findByText('Complete description');
    expect(screen.getByText('وصف').getAttribute('dir')).toBe('rtl');
    expect(screen.getByText('Open full page ↗')).toBeTruthy();
    unmount();
    render(<ProductDetails id={product.id} fullPage />);
    await screen.findByText('Complete description');
    expect(screen.queryByText('Open full page ↗')).toBeNull();
  });
  it('uses displayed IDs for shortcuts, suspends in dialogs, and clears paging selection', async () => {
    vi.mocked(adminRequest).mockImplementation(async path => path.startsWith('admin/products?')
      ? { data: [{ ...product, id: 'visible-on-page-2' }], total: 100 }
      : path.includes('media-previews') ? { previews: {} } : product);
    vi.mocked(moderateAdminProduct).mockResolvedValue({} as never);
    navigation.query = 'page=1';
    const { rerender } = render(<ManagementPage entity="products" />);
    await screen.findByLabelText('View Full product');
    fireEvent.keyDown(window, { key: 'j' }); fireEvent.keyDown(window, { key: 'a' });
    await waitFor(() => expect(moderateAdminProduct).toHaveBeenCalledWith('visible-on-page-2', 'APPROVED'));
    await screen.findByLabelText('View Full product');
    fireEvent.click(screen.getByLabelText('View Full product'));
    await screen.findByText('Complete description');
    fireEvent.keyDown(window, { key: 'x' });
    expect(moderateAdminProduct).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText('Close details'));
    navigation.query = 'page=2'; rerender(<ManagementPage entity="products" />);
    await screen.findByLabelText('View Full product');
    fireEvent.keyDown(window, { key: 'x' });
    expect(moderateAdminProduct).toHaveBeenCalledTimes(1);
  });
  it('denies requests without read permission', async () => {
    navigation.allowed = false;
    render(<ManagementPage entity="products" />);
    expect(await screen.findByText('Access Denied')).toBeTruthy();
    expect(adminRequest).not.toHaveBeenCalled();
  });
});
