'use client';

/**
 * Attribute Detail Page — professional attribute detail view for Admin.
 *
 * Route: /attributes/[id]
 * Shows attribute definition, type-specific validation, and allowed options.
 */
import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { adminRequest, type AdminRecord } from '../../../lib/api';
import { useRequirePerms } from '../../../hooks/useRequirePerms';
import {
  AdminDetailHeader,
  AdminDetailSection,
  AdminKeyValueGrid,
  AdminStatusBadge,
  AdminCopyButton,
  AdminLoadingSkeleton,
  AdminErrorState,
  AdminEmptyState,
  formatDate,
  type KVItem,
} from '../../../components/detail';

function AttributeDetailContent({ id }: { id: string }) {
  const { hasAccess } = useRequirePerms(['catalog:categories:write']);
  const [ready, setReady] = useState(false);
  const [attr, setAttr] = useState<AdminRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!ready || !hasAccess) return;
    setLoading(true);
    adminRequest<AdminRecord>(`attributes/${encodeURIComponent(id)}`)
      .then(data => { setAttr(data); setLoading(false); })
      .catch(err => { setError(err instanceof Error ? err.message : 'Failed to load attribute'); setLoading(false); });
  }, [id, ready, hasAccess]);

  if (!ready) return <AdminLoadingSkeleton kvRows={6} />;
  if (!hasAccess) return <div style={{ padding: 32, color: '#991b1b' }}>Access denied.</div>;
  if (loading) return <AdminLoadingSkeleton kvRows={6} />;
  if (error) return <AdminErrorState title="Unable to load attribute" message={error} />;
  if (!attr) return null;

  const attrType = String(attr['type'] || 'TEXT').toUpperCase();
  const scope = String(attr['scope'] || 'PRODUCT');

  const defItems: KVItem[] = [
    { key: 'name', label: 'Name', value: String(attr['name'] || 'Not set') },
    { key: 'code', label: 'Code', value: <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{String(attr['code'] || attr['name'] || 'Not set')}</span> },
    { key: 'type', label: 'Type', value: <AdminStatusBadge status={attrType} /> },
    { key: 'scope', label: 'Scope', value: <AdminStatusBadge status={scope} /> },
    { key: 'unit', label: 'Unit', value: attr['unit'] ? String(attr['unit']) : '—' },
    { key: 'isFilterable', label: 'Filterable', value: attr['isFilterable'] !== false ? 'Yes' : 'No' },
    { key: 'isSearchable', label: 'Searchable', value: attr['isSearchable'] !== false ? 'Yes' : 'No' },
    { key: 'createdAt', label: 'Created', value: formatDate(attr['createdAt'] as string) },
    { key: 'updatedAt', label: 'Updated', value: formatDate(attr['updatedAt'] as string) },
    { key: 'id', label: 'Attribute ID', value: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{id}</span>
        <AdminCopyButton value={id} label="" />
      </span>
    )},
  ];

  // Type-specific validation items
  const validationItems: KVItem[] = [];
  if (attrType === 'NUMERIC' || attrType === 'NUMBER') {
    validationItems.push(
      { key: 'minValue', label: 'Minimum', value: attr['minValue'] != null ? String(attr['minValue']) : '—' },
      { key: 'maxValue', label: 'Maximum', value: attr['maxValue'] != null ? String(attr['maxValue']) : '—' },
      { key: 'precision', label: 'Precision', value: attr['precision'] != null ? String(attr['precision']) : '—' },
    );
  }
  if (attrType === 'BOOLEAN') {
    validationItems.push(
      { key: 'defaultValue', label: 'Default', value: attr['defaultValue'] != null ? String(attr['defaultValue']) : '—' },
    );
  }

  // Options (for ENUM type)
  const options = Array.isArray(attr['options']) ? attr['options'] as AdminRecord[] : [];

  return (
    <div>
      <AdminDetailHeader
        breadcrumbs={[{ label: 'Catalog', href: '/attributes' }, { label: 'Attributes', href: '/attributes' }]}
        backLabel="Back to Attributes"
        backHref="/attributes"
        title={String(attr['name'] || 'Attribute')}
        subtitle={<AdminStatusBadge status={attrType} />}
        entityId={id}
      />
      <div style={{ padding: '0 32px 48px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <AdminDetailSection title="Definition">
          <AdminKeyValueGrid items={defItems} />
        </AdminDetailSection>

        {validationItems.length > 0 && (
          <AdminDetailSection title="Validation Rules">
            <AdminKeyValueGrid items={validationItems} />
          </AdminDetailSection>
        )}

        {attrType === 'ENUM' && (
          <AdminDetailSection title={`Allowed Options (${options.length})`}>
            {options.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {options.map((opt, i) => (
                  <div key={(opt['id'] as string) || i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 14px', border: '1px solid #d9e2e6', borderRadius: 6, background: '#fff',
                  }}>
                    <span style={{ fontWeight: 500 }}>{String(opt['value'] || opt['name'] || '—')}</span>
                    {opt['valueAr'] != null && <span dir="rtl" style={{ color: '#5b6b74', fontSize: 13 }}>{String(opt['valueAr'])}</span>}
                    {opt['label'] != null && <span style={{ fontSize: 12, color: '#5b6b74' }}>{String(opt['label'])}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <AdminEmptyState title="No options defined" description="This ENUM attribute has no allowed options configured." />
            )}
          </AdminDetailSection>
        )}
      </div>
    </div>
  );
}

export default function AttributeDetailPage() {
  const params = useParams();
  const id = params['id'] as string;
  return <Suspense fallback={<AdminLoadingSkeleton kvRows={6} />}><AttributeDetailContent id={id} /></Suspense>;
}
