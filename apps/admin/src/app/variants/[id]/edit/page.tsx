'use client';

/**
 * Variant Edit Page — PHASE 4 P5 admin variant editing.
 *
 * Route: /variants/[id]/edit
 * Supports:
 * - Edit variant scalar fields (SKU, title, titleAr, barcode, unit, weightGrams)
 * - Typed VARIANT-scope attribute editing
 * - P1 optimistic locking with 409 conflict UX
 * - Unsaved changes protection (beforeunload)
 * - Arabic RTL fields
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminRequest, AdminApiError, type AdminRecord } from '../../../../lib/api';
import { useRequirePerms } from '../../../../hooks/useRequirePerms';

interface VariantForm {
  sku: string;
  title: string;
  titleAr: string;
  barcode: string;
  unit: string;
  weightGrams: string;
}

interface AttrValue {
  attributeDefinitionId: string;
  value: string;
}

const EMPTY_FORM: VariantForm = {
  sku: '', title: '', titleAr: '', barcode: '', unit: 'PCS', weightGrams: '',
};

export default function VariantEditPage() {
  const params = useParams();
  const router = useRouter();
  const variantId = params['id'] as string;
  const { hasAccess } = useRequirePerms(['catalog:products:write']);

  // Core state
  const [form, setForm] = useState<VariantForm>(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState<VariantForm>(EMPTY_FORM);
  const [variant, setVariant] = useState<AdminRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Conflict state (P5.12)
  const [conflict, setConflict] = useState<{ currentUpdatedAt: string } | null>(null);

  // Typed attributes
  const [attrValues, setAttrValues] = useState<AttrValue[]>([]);
  const [initialAttrValues, setInitialAttrValues] = useState<AttrValue[]>([]);
  const [attrDefinitions, setAttrDefinitions] = useState<Array<{ id: string; label: string; code: string; type: string }>>([]);

  // Dirty tracking
  const isDirty = useMemo(() => {
    const formChanged = JSON.stringify(form) !== JSON.stringify(initialForm);
    const attrsChanged = JSON.stringify(attrValues) !== JSON.stringify(initialAttrValues);
    return formChanged || attrsChanged;
  }, [form, initialForm, attrValues, initialAttrValues]);

  // Load variant
  const loadVariant = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminRequest<AdminRecord>(`admin/variants/${encodeURIComponent(variantId)}`);
      setVariant(data);
      const formData: VariantForm = {
        sku: (data['sku'] as string) || '',
        title: (data['title'] as string) || '',
        titleAr: (data['titleAr'] as string) || '',
        barcode: (data['barcode'] as string) || '',
        unit: (data['unit'] as string) || 'PCS',
        weightGrams: data['weightGrams'] != null ? String(data['weightGrams']) : '',
      };
      setForm(formData);
      setInitialForm(formData);

      // Load typed attributes
      const productId = data['productId'] as string;
      try {
        const attrData = await adminRequest<Array<{ attributeDefinitionId: string; value: string }>>(
          `admin/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}/attribute-values`
        );
        const attrs = attrData.map(a => ({ attributeDefinitionId: a.attributeDefinitionId, value: a.value }));
        setAttrValues(attrs);
        setInitialAttrValues(attrs);
      } catch {
        // Attributes may not exist yet
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load variant');
    } finally {
      setLoading(false);
    }
  }, [variantId]);

  useEffect(() => {
    if (hasAccess) loadVariant();
  }, [hasAccess, loadVariant]);

  // Unsaved changes protection (P5.13)
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes.';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Save handler
  const handleSave = async () => {
    if (!variant) return;
    const productId = variant['productId'] as string;
    const updatedAt = variant['updatedAt'] as string;

    setSaving(true);
    setError('');
    setSuccessMsg('');
    setConflict(null);

    try {
      // Update variant scalar fields
      const payload: Record<string, unknown> = {
        sku: form.sku,
        title: form.title || undefined,
        titleAr: form.titleAr || undefined,
        barcode: form.barcode || undefined,
        unit: form.unit,
        weightGrams: form.weightGrams ? parseFloat(form.weightGrams) : undefined,
        updatedAt, // P1 optimistic locking
      };

      await adminRequest(
        `admin/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      // Update typed attributes if changed
      if (JSON.stringify(attrValues) !== JSON.stringify(initialAttrValues)) {
        await adminRequest(
          `admin/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}/attribute-values`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              values: attrValues.map(a => ({ attributeDefinitionId: a.attributeDefinitionId, value: a.value })),
            }),
          }
        );
      }

      setSuccessMsg('Variant updated successfully.');
      await loadVariant();
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409) {
        setConflict({ currentUpdatedAt: err.body['currentUpdatedAt'] as string });
      } else {
        setError(err instanceof Error ? err.message : 'Failed to save variant');
      }
    } finally {
      setSaving(false);
    }
  };

  // Reload on conflict
  const handleReload = async () => {
    setConflict(null);
    await loadVariant();
  };

  // Discard changes
  const handleDiscard = () => {
    setConflict(null);
    setForm(initialForm);
    setAttrValues(initialAttrValues);
  };

  if (!hasAccess) return <div style={{ padding: 32, color: '#991b1b' }}>Access denied.</div>;
  if (loading) return <div style={{ padding: 32 }}>Loading variant...</div>;
  if (!variant) return <div style={{ padding: 32, color: '#991b1b' }}>{error || 'Variant not found'}</div>;

  const productId = variant['productId'] as string;
  const sku = variant['sku'] as string;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 32px 48px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
          <Link href="/products" style={{ color: '#1e6178' }}>Catalog</Link>
          {' / '}
          <Link href={`/products/${productId}`} style={{ color: '#1e6178' }}>Product</Link>
          {' / '}
          <Link href={`/variants/${variantId}`} style={{ color: '#1e6178' }}>{sku || 'Variant'}</Link>
          {' / Edit'}
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: '#0f3340', margin: 0 }}>
          Edit Variant
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4, fontFamily: 'monospace' }}>
          {variantId}
        </p>
      </div>

      {/* Conflict banner (P5.12) */}
      {conflict && (
        <div style={{
          padding: '16px 20px', marginBottom: 20, background: '#fef3c7',
          border: '1px solid #f59e0b', borderRadius: 8,
        }}>
          <h3 style={{ margin: '0 0 8px', color: '#92400e', fontSize: 15 }}>
            Conflict Detected
          </h3>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#78350f' }}>
            Another user has modified this variant. Your changes cannot be saved without overwriting their updates.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleReload}
              style={{
                padding: '6px 14px', background: '#1e6178', color: '#fff',
                borderRadius: 4, fontSize: 13, border: 'none', cursor: 'pointer',
              }}
            >
              Reload
            </button>
            <button
              onClick={handleDiscard}
              style={{
                padding: '6px 14px', background: '#fff', color: '#374151',
                borderRadius: 4, fontSize: 13, border: '1px solid #d1d5db', cursor: 'pointer',
              }}
            >
              Discard Changes
            </button>
          </div>
        </div>
      )}

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
      {error && !conflict && (
        <div style={{
          padding: '12px 16px', marginBottom: 16, background: '#fef2f2',
          border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Scalar fields */}
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
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                  borderRadius: 6, fontSize: 14,
                }}
              />
            </div>
          </div>
        </section>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <Link
            href={`/variants/${variantId}`}
            style={{
              padding: '10px 20px', background: '#f3f4f6', color: '#374151',
              borderRadius: 6, fontSize: 14, textDecoration: 'none',
            }}
          >
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            style={{
              padding: '10px 20px', background: isDirty ? '#1e6178' : '#9ca3af',
              color: '#fff', borderRadius: 6, fontSize: 14, fontWeight: 500,
              border: 'none', cursor: saving || !isDirty ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {/* Dirty state indicator */}
        {isDirty && (
          <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
            You have unsaved changes.
          </p>
        )}
      </div>
    </div>
  );
}
