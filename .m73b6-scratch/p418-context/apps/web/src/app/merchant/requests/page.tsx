'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchMyStores, fetchMerchantRequests, createCatalogRequest, CatalogRequest } from '../../../lib/api';
import { pickStore } from '../../../lib/merchant-store';
import { LoadingSpinner, EmptyState } from '../../../components/Shared';
import { PageHeader, Card, colors, typeScale, radii } from '@scs/ui-kit';

type RequestType = 'CATEGORY' | 'BRAND' | 'ATTRIBUTE' | 'OPTION';

const TYPE_LABELS: Record<RequestType, string> = {
  CATEGORY: 'Category',
  BRAND: 'Brand',
  ATTRIBUTE: 'Attribute',
  OPTION: 'Attribute Option',
};

const STATUS_STYLES: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: '#fff8e1', fg: '#8a6d00' },
  APPROVED: { bg: '#eaf5ef', fg: '#1b7a4b' },
  REJECTED: { bg: '#fbeeec', fg: '#991b1b' },
};

export default function MerchantRequestsPage() {
  const [storeId, setStoreId] = useState('');
  const [requests, setRequests] = useState<CatalogRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [type, setType] = useState<RequestType>('CATEGORY');
  const [payload, setPayload] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Resolve active store
  useEffect(() => {
    (async () => {
      try {
        const stores = await fetchMyStores();
        const s = pickStore(stores);
        if (s) setStoreId(s.id);
      } catch { /* handled below */ }
      finally { setLoading(false); }
    })();
  }, []);

  const reload = useCallback(async () => {
    if (!storeId) return;
    try {
      const data = await fetchMerchantRequests(storeId);
      setRequests(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load requests');
    }
  }, [storeId]);

  useEffect(() => { if (storeId) void reload(); }, [storeId, reload]);

  const updateField = (key: string, value: string) => {
    setPayload(prev => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setPayload({});
    setSuccess('');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await createCatalogRequest({
        storeId,
        type,
        payload: Object.fromEntries(
          Object.entries(payload).filter(([, v]) => v.trim() !== ''),
        ),
      });
      setSuccess(`Request submitted successfully!`);
      resetForm();
      void reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!storeId) return <EmptyState title="No store found" description="You need an active store to submit catalog requests." />;

  return (
    <div>
      <PageHeader title="Catalog Requests" subtitle="Request new categories, brands, or attributes for the platform catalog" />

      <div style={{ padding: '24px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        {/* ── Submission Form ──────────────────────────────────── */}
        <Card>
          <h2 style={{ ...typeScale.h2, marginBottom: 16 }}>Submit New Request</h2>

          {error && <div style={{ padding: 12, color: '#991b1b', background: '#fbeeec', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}
          {success && <div style={{ padding: 12, color: '#1b7a4b', background: '#eaf5ef', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{success}</div>}

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
                Request Type
                <select
                  value={type}
                  onChange={e => { setType(e.target.value as RequestType); setPayload({}); }}
                  style={{ padding: '9px 11px', border: '1px solid #d9e2e6', borderRadius: 6, font: 'inherit', background: '#fff' }}
                >
                  <option value="CATEGORY">Category</option>
                  <option value="BRAND">Brand</option>
                  <option value="ATTRIBUTE">Attribute</option>
                  <option value="OPTION">Attribute Option</option>
                </select>
              </label>

              {/* Dynamic fields based on type */}
              {type === 'CATEGORY' && (
                <>
                  <FormField label="Category Name *" value={payload['name'] ?? ''} onChange={v => updateField('name', v)} required />
                  <FormField label="Name (Arabic)" value={payload['nameAr'] ?? ''} onChange={v => updateField('nameAr', v)} dir="rtl" />
                  <FormField label="Slug (optional)" value={payload['slug'] ?? ''} onChange={v => updateField('slug', v)} placeholder="auto-generated from name" />
                  <FormField label="Description" value={payload['description'] ?? ''} onChange={v => updateField('description', v)} />
                </>
              )}

              {type === 'BRAND' && (
                <>
                  <FormField label="Brand Name *" value={payload['name'] ?? ''} onChange={v => updateField('name', v)} required />
                  <FormField label="Name (Arabic)" value={payload['nameAr'] ?? ''} onChange={v => updateField('nameAr', v)} dir="rtl" />
                  <FormField label="Logo URL" value={payload['logoUrl'] ?? ''} onChange={v => updateField('logoUrl', v)} placeholder="https://..." />
                  <FormField label="Description" value={payload['description'] ?? ''} onChange={v => updateField('description', v)} />
                </>
              )}

              {type === 'ATTRIBUTE' && (
                <>
                  <FormField label="Attribute Name *" value={payload['name'] ?? ''} onChange={v => updateField('name', v)} required />
                  <FormField label="Code *" value={payload['code'] ?? ''} onChange={v => updateField('code', v)} required placeholder="e.g. material, color_code" />
                  <FormField label="Name (Arabic)" value={payload['nameAr'] ?? ''} onChange={v => updateField('nameAr', v)} dir="rtl" />
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
                    Type
                    <select value={payload['type'] ?? 'TEXT'} onChange={e => updateField('type', e.target.value)} style={{ padding: '9px 11px', border: '1px solid #d9e2e6', borderRadius: 6, font: 'inherit', background: '#fff' }}>
                      <option value="TEXT">Text</option>
                      <option value="NUMBER">Number</option>
                      <option value="BOOLEAN">Boolean</option>
                      <option value="SELECT">Select</option>
                      <option value="MULTISELECT">Multi-select</option>
                    </select>
                  </label>
                </>
              )}

              {type === 'OPTION' && (
                <>
                  <FormField label="Attribute ID *" value={payload['attributeId'] ?? ''} onChange={v => updateField('attributeId', v)} required placeholder="UUID of the parent attribute" />
                  <FormField label="Option Value *" value={payload['value'] ?? ''} onChange={v => updateField('value', v)} required placeholder="e.g. Red, Cotton" />
                  <FormField label="Value (Arabic)" value={payload['valueAr'] ?? ''} onChange={v => updateField('valueAr', v)} dir="rtl" />
                  <FormField label="Label (display text)" value={payload['label'] ?? ''} onChange={v => updateField('label', v)} />
                </>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '10px 16px',
                  background: colors.brand[500],
                  color: '#fff',
                  border: 'none',
                  borderRadius: radii.md,
                  fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </form>
        </Card>

        {/* ── Request History ──────────────────────────────────── */}
        <Card>
          <h2 style={{ ...typeScale.h2, marginBottom: 16 }}>Your Requests</h2>

          {requests.length === 0 ? (
            <p style={{ color: colors.muted, fontSize: 13 }}>No requests yet. Submit your first request using the form.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {requests.map(r => (
                <div key={r.id} style={{ padding: 14, border: '1px solid #d9e2e6', borderRadius: 8, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ fontSize: 13 }}>{TYPE_LABELS[r.type]}</strong>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: STATUS_STYLES[r.status]?.bg ?? '#f7f9fa',
                      color: STATUS_STYLES[r.status]?.fg ?? '#5b6b74',
                    }}>
                      {r.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: colors.muted, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {Object.entries(r.payload).filter(([, v]) => v).map(([k, v]) => (
                      <span key={k} style={{ background: '#f7f9fa', padding: '2px 6px', borderRadius: 4 }}>
                        <strong>{k}:</strong> {String(v)}
                      </span>
                    ))}
                  </div>
                  {r.reviewReason && (
                    <div style={{ fontSize: 12, color: '#991b1b', marginTop: 8, fontStyle: 'italic' }}>
                      Reason: {r.reviewReason}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>
                    {new Date(r.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ── Reusable form field ─────────────────────────────────────── */
function FormField({ label, value, onChange, required, placeholder, dir }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  dir?: string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
      {label}
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        dir={dir}
        style={{ padding: '9px 11px', border: '1px solid #d9e2e6', borderRadius: 6, font: 'inherit', background: '#fff', maxWidth: '100%' }}
      />
    </label>
  );
}
