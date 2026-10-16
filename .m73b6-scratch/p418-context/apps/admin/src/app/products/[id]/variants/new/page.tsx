'use client';

/**
 * Variant Create Page — PHASE 4 P5 admin variant creation.
 *
 * Route: /products/[id]/variants/new
 * Supports:
 * - Create variant on any canonical product (cross-org)
 * - Typed VARIANT-scope attributes
 * - Validation and error handling
 * - Arabic RTL fields
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminRequest, AdminApiError } from '../../../../../lib/api';
import { useRequirePerms } from '../../../../../hooks/useRequirePerms';

interface VariantForm {
  sku: string;
  title: string;
  titleAr: string;
  barcode: string;
  unit: string;
  weightGrams: string;
}

const EMPTY_FORM: VariantForm = {
  sku: '', title: '', titleAr: '', barcode: '', unit: 'PCS', weightGrams: '',
};

export default function VariantCreatePage() {
  const params = useParams();
  const router = useRouter();
  const productId = params['id'] as string;
  const { hasAccess } = useRequirePerms(['catalog:products:write']);

  const [form, setForm] = useState<VariantForm>(EMPTY_FORM);
  const [product, setProduct] = useState<{ id: string; title: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Load parent product
  const loadProduct = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminRequest<{ id: string; title: string }>(`products/${encodeURIComponent(productId)}`);
      setProduct(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load product');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    if (hasAccess) loadProduct();
  }, [hasAccess, loadProduct]);

  // Create handler
  const handleCreate = async () => {
    if (!form.sku.trim()) {
      setError('SKU is required');
      return;
    }

    setCreating(true);
    setError('');
    setSuccessMsg('');

    try {
      const payload: Record<string, unknown> = {
        sku: form.sku.trim(),
        title: form.title.trim() || undefined,
        titleAr: form.titleAr.trim() || undefined,
        barcode: form.barcode.trim() || undefined,
        unit: form.unit,
        weightGrams: form.weightGrams ? parseFloat(form.weightGrams) : undefined,
      };

      const result = await adminRequest<{ id: string }>(
        `admin/products/${encodeURIComponent(productId)}/variants`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      setSuccessMsg('Variant created successfully!');
      // Redirect to the new variant detail page
      setTimeout(() => {
        router.push(`/variants/${result.id}`);
      }, 1000);
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create variant');
      }
    } finally {
      setCreating(false);
    }
  };

  if (!hasAccess) return <div style={{ padding: 32, color: '#991b1b' }}>Access denied.</div>;
  if (loading) return <div style={{ padding: 32 }}>Loading product...</div>;
  if (!product) return <div style={{ padding: 32, color: '#991b1b' }}>{error || 'Product not found'}</div>;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 32px 48px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
          <Link href="/products" style={{ color: '#1e6178' }}>Catalog</Link>
          {' / '}
          <Link href={`/products/${productId}`} style={{ color: '#1e6178' }}>{product.title || 'Product'}</Link>
          {' / New Variant'}
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: '#0f3340', margin: 0 }}>
          Create Variant
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Adding variant to: <strong>{product.title}</strong>
        </p>
      </div>

      {/* Success message */}
      {successMsg && (
        <div style={{
          padding: '12px 16px', marginBottom: 16, background: '#ecfdf5',
          border: '1px solid #a7f3d0', borderRadius: 8, color: '#065f46', fontSize: 13,
        }}>
          {successMsg}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div style={{
          padding: '12px 16px', marginBottom: 16, background: '#fef2f2',
          border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <section style={{ padding: 20, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', margin: '0 0 16px' }}>
            Variant Identity
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                SKU *
              </label>
              <input
                type="text"
                value={form.sku}
                onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                placeholder="e.g., PROD-RED-SM"
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                  borderRadius: 6, fontSize: 14,
                }}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                Barcode
              </label>
              <input
                type="text"
                value={form.barcode}
                onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                placeholder="e.g., 1234567890123"
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                  borderRadius: 6, fontSize: 14,
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                Title
              </label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g., Red - Small"
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                  borderRadius: 6, fontSize: 14,
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                Title (Arabic)
              </label>
              <input
                type="text"
                dir="rtl"
                value={form.titleAr}
                onChange={e => setForm(f => ({ ...f, titleAr: e.target.value }))}
                placeholder="أحمر - صغير"
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                  borderRadius: 6, fontSize: 14, fontFamily: 'Arial, sans-serif',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                Unit
              </label>
              <select
                value={form.unit}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                  borderRadius: 6, fontSize: 14,
                }}
              >
                <option value="PCS">PCS (Pieces)</option>
                <option value="KG">KG (Kilograms)</option>
                <option value="G">G (Grams)</option>
                <option value="L">L (Liters)</option>
                <option value="M">M (Meters)</option>
                <option value="BOX">BOX</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                Weight (grams)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.weightGrams}
                onChange={e => setForm(f => ({ ...f, weightGrams: e.target.value }))}
                placeholder="e.g., 250.5"
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                  borderRadius: 6, fontSize: 14,
                }}
              />
            </div>
          </div>
        </section>

        {/* Info box */}
        <div style={{
          padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe',
          borderRadius: 8, fontSize: 13, color: '#1e40af',
        }}>
          <strong>Note:</strong> After creating the variant, you can edit its typed attributes from the variant detail page.
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <Link
            href={`/products/${productId}`}
            style={{
              padding: '10px 20px', background: '#f3f4f6', color: '#374151',
              borderRadius: 6, fontSize: 14, textDecoration: 'none',
            }}
          >
            Cancel
          </Link>
          <button
            onClick={handleCreate}
            disabled={creating || !form.sku.trim()}
            style={{
              padding: '10px 20px', background: form.sku.trim() ? '#1e6178' : '#9ca3af',
              color: '#fff', borderRadius: 6, fontSize: 14, fontWeight: 500,
              border: 'none', cursor: creating || !form.sku.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {creating ? 'Creating...' : 'Create Variant'}
          </button>
        </div>
      </div>
    </div>
  );
}
