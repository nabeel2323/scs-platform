import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { useState } from 'react';
import { useAdminResource, useAdminTableQuery } from '../hooks/useAdminTable';
import { managementTables } from '../lib/management-tables';
import DetailDialog from '../components/DetailDialog';
import ManagementPage, { rowClickOpensDetail } from '../components/ManagementPage';
import ProductDetails, { ProductModerationActions } from '../components/ProductDetails';
import UsersPage from '../app/users/page';
import DisputeDetailPage from '../app/disputes/[id]/page';
import AdminReturnsPage from '../app/returns/page';
import ReturnDetailPage from '../app/returns/[id]/page';
import AttributeDetailPage from '../app/attributes/[id]/page';
import AdminPaymentsPage from '../app/payments/page';
import AdminSettlementsPage from '../app/settlements/page';
import ReconciliationPage from '../app/reconciliation/page';
import SettlementAdjustmentsPage from '../app/settlement-adjustments/page';
import {
  adminRequest,
  moderateAdminProduct,
  fetchAdminPayments,
  fetchPaymentVerificationQueue,
  fetchStalePayments,
  fetchAdminSettlements,
  markSettlementPaid,
} from '../lib/api';

const navigation = vi.hoisted(() => ({
  query: '',
  replace: vi.fn(),
  allowed: true,
  allowedPermissions: null as string[] | null,
  requiredPerms: [] as string[],
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => '/products',
  useSearchParams: () => new URLSearchParams(navigation.query),
  useParams: () => ({ id: 'dispute-1' }),
}));
vi.mock('../lib/api', () => ({
  adminRequest: vi.fn(),
  moderateAdminProduct: vi.fn(),
  fetchAdminPayments: vi.fn(),
  fetchPaymentVerificationQueue: vi.fn(),
  fetchStalePayments: vi.fn(),
  verifyPayment: vi.fn(),
  fetchAdminSettlements: vi.fn(),
  markSettlementPaid: vi.fn(),
}));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: (requiredPerms: string[]) => {
    navigation.requiredPerms = requiredPerms;
    const hasAccess =
      navigation.allowed &&
      (navigation.allowedPermissions === null ||
        requiredPerms.every((permission) => navigation.allowedPermissions!.includes(permission)));
    return {
      hasAccess,
      missingPerms: hasAccess
        ? []
        : requiredPerms.filter(
            (permission) => !navigation.allowedPermissions?.includes(permission),
          ),
    };
  },
  AccessDenied: () => <p>Access Denied</p>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  navigation.query = '';
  navigation.allowed = true;
  navigation.allowedPermissions = null;
  navigation.requiredPerms = [];
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() {
      this.open = false;
    },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});


describe('Admin return oversight recovery', () => {
  const returnFixture = {
    id: 'return-1',
    subOrderId: 'order-1',
    buyerId: 'buyer-1',
    status: 'ESCALATED',
    reason: 'Damaged item',
    requestedRefundMinor: 12500,
    actualRefundMinor: null,
    createdAt: '2026-11-20T10:00:00.000Z',
    escalatedAt: '2026-11-21T10:00:00.000Z',
    escalationDeadline: '2026-11-24T10:00:00.000Z',
    responsibilityCategory: null,
    resolvedBy: null,
    resolvedAt: null,
  };

  it('shows a retryable error for the return queue and recovers on retry', async () => {
    vi.mocked(adminRequest)
      .mockRejectedValueOnce(new Error('Connection failed'))
      .mockResolvedValueOnce([]);

    render(<AdminReturnsPage />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Connection failed')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText('No return requests found.')).toBeTruthy());
    expect(adminRequest).toHaveBeenCalledTimes(2);
  });

  it('shows a retryable detail error and clears it after a successful reload', async () => {
    vi.mocked(adminRequest)
      .mockRejectedValueOnce(new Error('Temporary read failure'))
      .mockResolvedValueOnce(returnFixture);

    render(<ReturnDetailPage />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Temporary read failure')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText(/Return #return-1/)).toBeTruthy());
    expect(adminRequest).toHaveBeenCalledTimes(2);
  });
});

describe('URL-backed table query', () => {
  it('restores URL state, debounces search, and atomically resets pagination', () => {
    vi.useFakeTimers();
    navigation.query = 'search=old&page=3&limit=50&status=DRAFT';
    const { result, rerender } = renderHook(() => useAdminTableQuery(managementTables.products));
    expect(result.current.query).toMatchObject({
      search: 'old',
      offset: 150,
      limit: 50,
      status: 'DRAFT',
    });
    act(() => result.current.setSearch('needle'));
    act(() => vi.advanceTimersByTime(299));
    expect(navigation.replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(navigation.replace.mock.lastCall?.[0]).toBe(
      '/products?search=needle&limit=50&status=DRAFT',
    );
    navigation.query = 'search=back&page=2';
    rerender();
    expect(result.current.search).toBe('back');
    expect(result.current.page).toBe(2);
    act(() => result.current.change({ sortBy: 'title', sortDir: 'asc' }));
    expect(navigation.replace.mock.lastCall?.[0]).toBe(
      '/products?search=back&sortBy=title&sortDir=asc',
    );
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
    vi.mocked(adminRequest).mockImplementation(
      () => new Promise((resolve) => pending.push(resolve)),
    );
    const { result, rerender } = renderHook(
      ({ id, enabled }) => useAdminResource<{ id: string }>(id, enabled),
      { initialProps: { id: 'first', enabled: true } },
    );
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
    vi.mocked(adminRequest)
      .mockRejectedValueOnce(new Error('Connection failed'))
      .mockResolvedValueOnce({ id: 'ok' });
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
      return (
        <>
          <button onClick={() => setOpen(true)}>View</button>
          {open && (
            <DetailDialog title="Details" onClose={() => setOpen(false)}>
              Content
            </DetailDialog>
          )}
        </>
      );
    }
    render(<Example />);
    const view = screen.getByText('View');
    view.focus();
    fireEvent.click(view);
    expect(document.activeElement).toBe(screen.getByLabelText('Close details'));
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(view);
  });
  it('excludes nested interactive elements and selected text from row opening', () => {
    const { container } = render(
      <div>
        <span>Plain</span>
        <button>
          <b>Action</b>
        </button>
        <a href="/products">Link</a>
        <input />
      </div>,
    );
    expect(rowClickOpensDetail(screen.getByText('Plain'))).toBe(true);
    for (const selector of ['b', 'a', 'input'])
      expect(rowClickOpensDetail(container.querySelector(selector))).toBe(false);
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'selected' } as Selection);
    expect(rowClickOpensDetail(screen.getByText('Plain'))).toBe(false);
  });
  it('prevents duplicate moderation and displays mutation errors', async () => {
    let fail!: (error: Error) => void;
    vi.mocked(moderateAdminProduct).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const done = vi.fn();
    render(<ProductModerationActions id="selected-id" status="DRAFT" onDone={done} />);
    fireEvent.click(screen.getByText('Approve'));
    fireEvent.click(screen.getByText('Approve'));
    expect(moderateAdminProduct).toHaveBeenCalledTimes(1);
    await act(async () => fail(new Error('Permission revoked')));
    expect(screen.getByText('Permission revoked')).toBeTruthy();
    expect(done).not.toHaveBeenCalled();
  });

  it('requires the dedicated product moderation permission and hides actions when denied', () => {
    navigation.allowed = false;
    render(<ProductModerationActions id="selected-id" status="DRAFT" onDone={vi.fn()} />);
    expect(navigation.requiredPerms).toEqual(['admin:products:moderate']);
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByText('Reject')).toBeNull();
    expect(screen.queryByText('Archive')).toBeNull();
  });

  it('hides product edit controls from users with read and moderation but no product-write permission', async () => {
    navigation.allowedPermissions = ['admin:merchants:read', 'admin:products:moderate'];
    vi.mocked(adminRequest).mockImplementation(async (path) =>
      path.includes('media-previews') ? { previews: {} } : product,
    );
    render(<ProductDetails id={product.id} fullPage />);
    await screen.findByText('Complete description');
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.getByText('Approve')).toBeTruthy();
  });

  it('hides create controls from read-only users on product and user management lists', async () => {
    navigation.allowedPermissions = ['admin:merchants:read', 'admin:users:read'];
    vi.mocked(adminRequest).mockResolvedValue({ data: [], total: 0 });
    const { unmount } = render(<ManagementPage entity="products" />);
    await screen.findByText('Product Moderation');
    expect(screen.queryByText('Create product')).toBeNull();
    unmount();
    render(<UsersPage />);
    await screen.findByText('User Management');
    expect(screen.queryByText('Create User')).toBeNull();
  });

  it('uses the seeded dispute permission for the dispute detail route', async () => {
    navigation.allowedPermissions = ['support:disputes:resolve'];
    vi.mocked(adminRequest).mockResolvedValue({
      id: 'dispute-1',
      status: 'OPEN',
      reason: 'Damaged goods',
      amountMinor: 1000,
      currency: 'SAR',
    });
    render(<DisputeDetailPage />);
    await screen.findByText('Dispute #dispute-1');
    expect(navigation.requiredPerms).toEqual(['support:disputes:resolve']);
    expect(adminRequest).toHaveBeenCalledWith('admin/disputes/dispute-1');
  });

  it('uses the canonical attribute-management permission for attribute detail', async () => {
    navigation.allowedPermissions = ['catalog:attributes:manage'];
    vi.mocked(adminRequest).mockResolvedValue({
      id: 'attribute-1',
      name: 'Screen size',
      type: 'NUMERIC',
      scope: 'PRODUCT',
    });
    render(<AttributeDetailPage />);
    await screen.findByText('Screen size');
    expect(navigation.requiredPerms).toEqual(['catalog:attributes:manage']);
    expect(adminRequest).toHaveBeenCalledWith('attributes/dispute-1');
  });

  it('keeps payment verification controls behind admin:payments:verify', async () => {
    navigation.allowedPermissions = ['admin:payments:read'];
    vi.mocked(fetchAdminPayments).mockResolvedValue([]);
    vi.mocked(fetchPaymentVerificationQueue).mockResolvedValue([]);
    vi.mocked(fetchStalePayments).mockResolvedValue([]);
    render(<AdminPaymentsPage />);
    await screen.findByText('Payments');
    expect(fetchAdminPayments).toHaveBeenCalledOnce();
    expect(fetchPaymentVerificationQueue).not.toHaveBeenCalled();
    expect(screen.queryByText('Verification Queue')).toBeNull();
    expect(screen.queryByText('Confirm')).toBeNull();
    expect(screen.queryByText('Reject')).toBeNull();
  });

  it('hides settlement payment action from users with read-only settlement access', async () => {
    navigation.allowedPermissions = ['admin:settlements:read'];
    vi.mocked(fetchAdminSettlements).mockResolvedValue([
      {
        id: 'settlement-1',
        subOrderId: 'sub-order-1',
        merchantStoreId: 'store-1',
        paymentRecordId: 'payment-1',
        grossMinor: 1000,
        refundMinor: 0,
        commissionMinor: 100,
        feeMinor: 0,
        netMinor: 900,
        currency: 'SAR',
        status: 'DUE',
        createdAt: '2026-11-19T10:00:00.000Z',
      },
    ]);
    render(<AdminSettlementsPage />);
    await screen.findByText('DUE');
    expect(screen.queryByText('Mark Paid')).toBeNull();
    expect(markSettlementPaid).not.toHaveBeenCalled();
  });

  it('allows reconciliation read access without exposing write operations', async () => {
    navigation.allowedPermissions = ['admin:reconciliation:read'];
    vi.mocked(adminRequest).mockResolvedValue([]);
    render(<ReconciliationPage />);
    await screen.findByText('Execution History');
    expect(screen.queryByText('Execute Reconciliation')).toBeNull();
    expect(screen.queryByText('Run')).toBeNull();
    expect(screen.queryByText('Resolve')).toBeNull();
  });

  it('allows settlement adjustment reads without exposing submit, approve or post actions', async () => {
    navigation.allowedPermissions = ['admin:adjustments:read'];
    const adjustments = [
      {
        id: 'adj-draft',
        subOrderId: 'order-1',
        returnRequestId: null,
        adjustmentType: 'REFUND_SUPPLEMENT',
        amountMinor: 1000,
        currency: 'SAR',
        fxStatus: 'BLOCKED',
        fxEvidence: null,
        status: 'DRAFT',
        reason: 'Draft',
        requiresDualApproval: true,
        approvalHash: 'hash-1',
        createdBy: 'user-1',
        notes: null,
        createdAt: '2026-11-19T10:00:00.000Z',
        approvals: [],
      },
      {
        id: 'adj-pending',
        subOrderId: 'order-2',
        returnRequestId: null,
        adjustmentType: 'REFUND_SUPPLEMENT',
        amountMinor: 2000,
        currency: 'SAR',
        fxStatus: 'BLOCKED',
        fxEvidence: null,
        status: 'PENDING_APPROVAL',
        reason: 'Pending',
        requiresDualApproval: true,
        approvalHash: 'hash-2',
        createdBy: 'user-2',
        notes: null,
        createdAt: '2026-11-19T10:00:00.000Z',
        approvals: [],
      },
      {
        id: 'adj-approved',
        subOrderId: 'order-3',
        returnRequestId: null,
        adjustmentType: 'REFUND_SUPPLEMENT',
        amountMinor: 3000,
        currency: 'SAR',
        fxStatus: 'RESOLVED',
        fxEvidence: null,
        status: 'APPROVED',
        reason: 'Approved',
        requiresDualApproval: true,
        approvalHash: 'hash-3',
        createdBy: 'user-3',
        notes: null,
        createdAt: '2026-11-19T10:00:00.000Z',
        approvals: [],
      },
    ];
    vi.mocked(adminRequest).mockResolvedValue(adjustments as never);
    render(<SettlementAdjustmentsPage />);
    await screen.findByText('Settlement Adjustments');
    expect(screen.queryByText('Submit')).toBeNull();
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByText('Post')).toBeNull();
  });
});

const product = {
  id: 'product-2',
  title: 'Full product',
  titleAr: 'منتج',
  description: 'Complete description',
  descriptionAr: 'وصف',
  slug: 'full-product',
  status: 'DRAFT',
  images: [],
  imageCount: 0,
  media: [],
  variants: [],
  store: null,
};
describe('management pages and shared product details', () => {
  it('reuses details in full-page and dialog modes', async () => {
    vi.mocked(adminRequest).mockImplementation(async (path) =>
      path.includes('media-previews') ? { previews: {} } : product,
    );
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
    vi.mocked(adminRequest).mockImplementation(async (path) =>
      path.startsWith('admin/products?')
        ? { data: [{ ...product, id: 'visible-on-page-2' }], total: 100 }
        : path.includes('media-previews')
          ? { previews: {} }
          : product,
    );
    vi.mocked(moderateAdminProduct).mockResolvedValue({} as never);
    navigation.query = 'page=1';
    const { rerender } = render(<ManagementPage entity="products" />);
    await screen.findByLabelText('View Full product');
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'a' });
    await waitFor(() =>
      expect(moderateAdminProduct).toHaveBeenCalledWith('visible-on-page-2', 'APPROVED'),
    );
    await screen.findByLabelText('View Full product');
    fireEvent.click(screen.getByLabelText('View Full product'));
    await screen.findByText('Complete description');
    fireEvent.keyDown(window, { key: 'x' });
    expect(moderateAdminProduct).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText('Close details'));
    navigation.query = 'page=2';
    rerender(<ManagementPage entity="products" />);
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
