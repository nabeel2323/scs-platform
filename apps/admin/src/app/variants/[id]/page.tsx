'use client';

/**
 * Variant Detail Page — PHASE 4 P5 functional variant management.
 *
 * Route: /variants/[id]
 * Shows variant configuration with Edit, Deactivate/Reactivate, Delete actions.
 * Fixes latent defect: backend GET /v1/admin/variants/:id now exists.
 */
import { Suspense, useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminRequest, AdminApiError, type AdminRecord } from '../../../lib/api';
import { useRequirePerms } from '../../../hooks/useRequirePerms';
import {
  AdminDetailHeader,
  AdminDetailTabs,
  AdminDetailSection,
  AdminKeyValueGrid,
  AdminStatusBadge,
  AdminEntityLink,
  AdminCopyButton,
  AdminLoadingSkeleton,
  AdminErrorState,
  formatDate,
  type KVItem,
} from '../../../components/detail';

function VariantDetailContent({ id }: { id: string }) {
  const router = useRouter();
  const { hasAccess } = useRequirePerms(['catalog:products:write']);
  const [ready, setReady] = useState(false);
  const [variant, setVariant] = useState<AdminRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('configuration');
  const [actionLoading, setActionLoading] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const loadVariant = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminRequest<AdminRecord>(`admin/variants/${encodeURIComponent(id)}`);
      setVariant(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load variant');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!ready || !hasAccess) return;
    loadVariant();
  }, [id, ready, hasAccess, loadVariant]);

  // Deactivate/Reactivate handler
  const handleToggleActive = async () => {
    if (!variant) return;
    const productId = variant['productId'] as string;
    const isActive = variant['isActive'] as boolean;
    const action = isActive ? 'deactivate' : 'reactivate';
    setActionLoading(action);
    try {
      await adminRequest(`admin/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive, updatedAt: variant['updatedAt'] }),
      });
      await loadVariant();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} variant`);
    } finally {
      setActionLoading('');
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (!variant) return;
    const productId = variant['productId'] as string;
    setActionLoading('delete');
    try {
      // Use bulk endpoint for delete
      await adminRequest(`admin/products/${encodeURIComponent(productId)}/variants/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteIds: [id] }),
      });
      router.push(`/products/${productId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete variant');
      setActionLoading('');
      setShowDeleteConfirm(false);
    }
  };

  if (!ready) return <AdminLoadingSkeleton kvRows={6} />;
  if (!hasAccess) return <div style={{ padding: 32, color: '#991b1b' }}>Access denied.</div>;
  if (loading) return <AdminLoadingSkeleton kvRows={6} />;
  if (error && !variant) return <AdminErrorState title="Unable to load variant" message={error} />;
  if (!variant) return null;

  const productId = variant['productId'] as string;
  const sku = variant['sku'] as string | null;
  const title = variant['title'] as string | null;
  const titleAr = variant['titleAr'] as string | null;
  const barcode = variant['barcode'] as string | null;
  const unit = variant['unit'] as string | null;
  const weightGrams = variant['weightGrams'] as number | null;
  const isActive = variant['isActive'] as boolean;
  const combinationKey = variant['combinationKey'] as string | null;

  const tabs = [
    { key: 'configuration', label: 'Configuration' },
    { key: 'technical', label: 'Technical' },
  ];

  const configItems: KVItem[] = [
    { key: 'sku', label: 'SKU', value: sku ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{sku}</span>
        <AdminCopyButton value={sku} label="" />
      </span>
    ) : 'Not set' },
    { key: 'title', label: 'Title', value: title || 'Not set' },
    { key: 'titleAr', label: 'Title (Arabic)', value: titleAr ? (
      <span dir="rtl" style={{ fontFamily: 'Arial, sans-serif' }}>{titleAr}</span>
    ) : 'Not set' },
    { key: 'barcode', label: 'Barcode', value: barcode ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace' }}>{barcode}</span>
        <AdminCopyButton value={barcode} label="" />
      </span>
    ) : 'Not set' },
    { key: 'unit', label: 'Unit', value: unit || 'PCS' },
    { key: 'weightGrams', label: 'Weight (grams)', value: weightGrams != null ? String(weightGrams) : 'Not set' },
    { key: 'isActive', label: 'Status', value: (
      <AdminStatusBadge status={isActive ? 'ACTIVE' : 'INACTIVE'} />
    )},
    { key: 'productId', label: 'Parent Product', value: productId ? (
      <AdminEntityLink type="product" id={productId} name="View Product" showIcon />
    ) : 'Not set' },
  ];

  const technicalItems: KVItem[] = [
    { key: 'id', label: 'Variant ID', value: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{id}</span>
        <AdminCopyButton value={id} label="" />
      </span>
    )},
    { key: 'productId', label: 'Product ID', value: productId ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{productId}</span>
        <AdminCopyButton value={productId} label="" />
      </span>
    ) : 'Not set' },
    { key: 'combinationKey', label: 'Combination Key', value: combinationKey || 'None' },
    { key: 'createdAt', label: 'Created', value: formatDate(variant['createdAt'] as string) },
    { key: 'updatedAt', label: 'Updated', value: formatDate(variant['updatedAt'] as string) },
  ];

  return (
    <div>
      <AdminDetailHeader
        breadcrumbs={[
          { label: 'Catalog', href: '/products' },
          { label: 'Products', href: '/products' },
          ...(productId ? [{ label: 'Product', href: `/products/${productId}` }] : []),
          { label: sku || 'Variant', href: `/variants/${id}` },
        ]}
        backLabel="Back to Product"
        backHref={productId ? `/products/${productId}` : '/products'}
        title={sku || title || 'Variant'}
        subtitle={<span style={{ fontFamily: 'monospace', fontSize: 12, color: '#5b6b74' }}>Variant</span>}
        status={isActive ? 'ACTIVE' : 'INACTIVE'}
        entityId={id}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link
              href={`/variants/${id}/edit`}
              style={{
                padding: '8px 16px', background: '#1e6178', color: '#fff',
                borderRadius: 6, fontSize: 13, fontWeight: 500, textDecoration: 'none',
              }}
            >
              Edit
            </Link>
            <button
              onClick={handleToggleActive}
              disabled={!!actionLoading}
              style={{
                padding: '8px 16px',
                background: isActive ? '#dc2626' : '#16a34a',
                color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 500,
                border: 'none', cursor: actionLoading ? 'wait' : 'pointer',
                opacity: actionLoading ? 0.7 : 1,
              }}
            >
              {actionLoading === 'deactivate' || actionLoading === 'reactivate' ? '...' : (isActive ? 'Deactivate' : 'Reactivate')}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={!!actionLoading}
              style={{
                padding: '8px 16px', background: '#fff', color: '#dc2626',
                borderRadius: 6, fontSize: 13, fontWeight: 500,
                border: '1px solid #dc2626', cursor: actionLoading ? 'wait' : 'pointer',
              }}
            >
              Delete
            </button>
          </div>
        }
      />

      {error && (
        <div style={{
          margin: '0 32px 16px', padding: '12px 16px',
          background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: 8, color: '#991b1b', fontSize: 13,
        }}>
          {error}
          <button onClick={() => setError('')} style={{ marginLeft: 12, background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer' }}>×</button>
        </div>
      )}

      <AdminDetailTabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />

      <div style={{ padding: '0 32px 48px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {activeTab === 'configuration' && (
          <>
            <AdminDetailSection title="Variant Identity">
              <AdminKeyValueGrid items={configItems} />
            </AdminDetailSection>

            {/* Hierarchy indicator */}
            <div style={{
              padding: '12px 16px', background: '#f7f9fa', borderRadius: 8,
              border: '1px solid #e5ecf0', fontSize: 13, color: '#5b6b74',
            }}>
              <strong style={{ color: '#0f3340' }}>Marketplace hierarchy:</strong>
              <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8 }}>
                <span>Product (canonical)</span>
                <br />
                <span>&nbsp;&nbsp;→ Variant <span style={{ color: '#1e6178', fontWeight: 600 }}>({sku || id.slice(0, 12)} — this entity)</span></span>
                <br />
                <span>&nbsp;&nbsp;&nbsp;&nbsp;→ Merchant Offers</span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'technical' && (
          <AdminDetailSection title="Technical Identifiers">
            <AdminKeyValueGrid items={technicalItems} columns={1} />
          </AdminDetailSection>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 24, maxWidth: 420, width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <h3 style={{ margin: '0 0 12px', color: '#991b1b', fontSize: 18 }}>Delete Variant</h3>
            <p style={{ margin: '0 0 8px', fontSize: 14, color: '#374151' }}>
              This action is <strong>destructive and irreversible</strong>.
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
              Variant <strong>{sku || id.slice(0, 12)}</strong> will be permanently deleted.
              Any merchant offers referencing this variant may be affected.
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#6b7280' }}>
              Consider <strong>deactivating</strong> the variant instead if you need to preserve references.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={!!actionLoading}
                style={{
                  padding: '8px 16px', background: '#f3f4f6', color: '#374151',
                  borderRadius: 6, fontSize: 13, border: 'none', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!!actionLoading}
                style={{
                  padding: '8px 16px', background: '#dc2626', color: '#fff',
                  borderRadius: 6, fontSize: 13, fontWeight: 500,
                  border: 'none', cursor: actionLoading ? 'wait' : 'pointer',
                }}
              >
                {actionLoading === 'delete' ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VariantDetailPage() {
  const params = useParams();
  const id = params['id'] as string;
  return <Suspense fallback={<AdminLoadingSkeleton kvRows={6} />}><VariantDetailContent id={id} /></Suspense>;
}
