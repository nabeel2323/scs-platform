'use client';

/**
 * Import Job Detail Page — professional import job detail view for Admin.
 *
 * Route: /catalog-import/[id]
 * Shows pipeline progress, summary counts, and error details.
 */
import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { adminRequest, type AdminRecord } from '../../../lib/api';
import { useRequirePerms } from '../../../hooks/useRequirePerms';
import {
  AdminDetailHeader,
  AdminDetailTabs,
  AdminDetailSection,
  AdminKeyValueGrid,
  AdminStatusBadge,
  AdminCopyButton,
  AdminRelatedTable,
  AdminLoadingSkeleton,
  AdminErrorState,
  AdminEmptyState,
  formatDate,
  type KVItem,
  type RelatedColumn,
} from '../../../components/detail';

const PIPELINE_STEPS = ['UPLOADED', 'PARSING', 'VALIDATING', 'READY', 'IMPORTING', 'COMPLETED'];

function getPipelineStage(status: string): number {
  const idx = PIPELINE_STEPS.indexOf(status);
  if (status === 'COMPLETED_WITH_ERRORS') return PIPELINE_STEPS.length - 1;
  if (status === 'FAILED' || status === 'CANCELLED') return PIPELINE_STEPS.indexOf(status) >= 0 ? PIPELINE_STEPS.indexOf(status) : -1;
  return idx;
}

function ImportJobDetailContent({ id }: { id: string }) {
  const { hasAccess } = useRequirePerms(['catalog:imports:manage']);
  const [ready, setReady] = useState(false);
  const [job, setJob] = useState<AdminRecord | null>(null);
  const [errors, setErrors] = useState<AdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!ready || !hasAccess) return;
    setLoading(true);
    adminRequest<AdminRecord>(`admin/catalog-imports/${encodeURIComponent(id)}`)
      .then(data => { setJob(data); setLoading(false); })
      .catch(err => { setError(err instanceof Error ? err.message : 'Failed to load import job'); setLoading(false); });
  }, [id, ready, hasAccess]);

  // Load errors when errors tab is active
  useEffect(() => {
    if (activeTab !== 'errors' || !ready || !hasAccess || !job) return;
    adminRequest<AdminRecord[]>(`admin/catalog-imports/${encodeURIComponent(id)}/errors`)
      .then(data => setErrors(Array.isArray(data) ? data : []))
      .catch(() => { /* errors tab is optional */ });
  }, [activeTab, id, ready, hasAccess, job]);

  if (!ready) return <AdminLoadingSkeleton kvRows={6} />;
  if (!hasAccess) return <div style={{ padding: 32, color: '#991b1b' }}>Access denied. Required: catalog:imports:manage</div>;
  if (loading) return <AdminLoadingSkeleton kvRows={6} />;
  if (error) return <AdminErrorState title="Unable to load import job" message={error} />;
  if (!job) return null;

  const status = String(job['status'] || '');
  const fileName = String(job['fileName'] || 'Unknown file');
  const currentStage = getPipelineStage(status);

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'summary', label: 'Summary' },
    { key: 'errors', label: `Errors (${Number(job['errorCount'] ?? 0)})` },
  ];

  const overviewItems: KVItem[] = [
    { key: 'id', label: 'Import ID', value: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{id}</span>
        <AdminCopyButton value={id} label="" />
      </span>
    )},
    { key: 'fileName', label: 'File Name', value: fileName },
    { key: 'fileSize', label: 'File Size', value: job['fileSize'] ? `${(Number(job['fileSize']) / 1024).toFixed(1)} KB` : '—' },
    { key: 'importType', label: 'Import Type', value: String(job['importType'] || 'Full') },
    { key: 'status', label: 'Status', value: <AdminStatusBadge status={status} /> },
    { key: 'totalRows', label: 'Total Rows', value: String(job['totalRows'] ?? '—') },
    { key: 'processedRows', label: 'Processed', value: String(job['processedRows'] ?? '—') },
    { key: 'createdAt', label: 'Uploaded', value: formatDate(job['createdAt'] as string) },
    { key: 'startedAt', label: 'Started', value: formatDate(job['startedAt'] as string) },
    { key: 'completedAt', label: 'Completed', value: formatDate(job['completedAt'] as string) },
  ];

  const summaryItems: KVItem[] = [
    { key: 'createdRows', label: 'Created', value: String(job['createdRows'] ?? 0) },
    { key: 'updatedRows', label: 'Updated', value: String(job['updatedRows'] ?? 0) },
    { key: 'unchangedRows', label: 'Unchanged', value: String(job['unchangedRows'] ?? 0) },
    { key: 'rejectedRows', label: 'Rejected', value: String(job['rejectedRows'] ?? 0) },
    { key: 'errorCount', label: 'Errors', value: String(job['errorCount'] ?? 0) },
    { key: 'warningCount', label: 'Warnings', value: String(job['warningCount'] ?? 0) },
  ];

  const errorColumns: RelatedColumn[] = [
    { key: 'sheet', label: 'Sheet', render: (val) => String(val || '—') },
    { key: 'rowNumber', label: 'Row', render: (val) => String(val ?? '—') },
    { key: 'entityType', label: 'Entity', render: (val) => String(val || '—') },
    { key: 'field', label: 'Field', render: (val) => (
      <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{String(val || '—')}</span>
    )},
    { key: 'errorMessage', label: 'Message', render: (val) => String(val || '—') },
    { key: 'severity', label: 'Severity', render: (val) => (
      <AdminStatusBadge status={String(val || 'ERROR')} />
    )},
  ];

  return (
    <div>
      <AdminDetailHeader
        breadcrumbs={[{ label: 'Catalog Import', href: '/catalog-import' }]}
        backLabel="Back to Catalog Import"
        backHref="/catalog-import"
        title={`Import: ${fileName}`}
        subtitle={
          <>
            <span>{formatDate(job['createdAt'] as string)}</span>
            {job['fileSize'] && <><span style={{ color: '#d9e2e6' }}> · </span><span>{(Number(job['fileSize']) / 1024).toFixed(1)} KB</span></>}
          </>
        }
        status={status}
        entityId={id}
      />

      {/* Pipeline visualization */}
      <div style={{
        margin: '0 32px 16px', padding: '16px 20px', background: '#f7f9fa', borderRadius: 8,
        border: '1px solid #e5ecf0',
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Import Pipeline</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {PIPELINE_STEPS.map((step, i) => {
            const isComplete = i < currentStage;
            const isCurrent = i === currentStage;
            const isFailed = status === 'FAILED' && i === currentStage;
            return (
              <div key={step} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div style={{
                  padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  whiteSpace: 'nowrap',
                  background: isFailed ? '#fee2e2' : isComplete ? '#d1fae5' : isCurrent ? '#dbeafe' : '#f3f4f6',
                  color: isFailed ? '#991b1b' : isComplete ? '#065f46' : isCurrent ? '#1e40af' : '#9ca3af',
                  border: `1px solid ${isFailed ? '#fca5a5' : isComplete ? '#6ee7b7' : isCurrent ? '#93c5fd' : '#e5e7eb'}`,
                }}>
                  {isComplete ? '✓ ' : isFailed ? '✗ ' : isCurrent ? '● ' : ''}{step}
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: isComplete ? '#6ee7b7' : '#e5e7eb', margin: '0 4px' }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <AdminDetailTabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />

      <div style={{ padding: '0 32px 48px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {activeTab === 'overview' && (
          <AdminDetailSection title="Import Job Details">
            <AdminKeyValueGrid items={overviewItems} />
          </AdminDetailSection>
        )}

        {activeTab === 'summary' && (
          <AdminDetailSection title="Import Results">
            <AdminKeyValueGrid items={summaryItems} />
          </AdminDetailSection>
        )}

        {activeTab === 'errors' && (
          <AdminDetailSection title={`Import Errors (${errors.length})`}>
            {errors.length > 0 ? (
              <AdminRelatedTable columns={errorColumns} data={errors} />
            ) : (
              <AdminEmptyState title="No errors" description="This import job has no recorded errors." />
            )}
          </AdminDetailSection>
        )}
      </div>
    </div>
  );
}

export default function ImportJobDetailPage() {
  const params = useParams();
  const id = params['id'] as string;
  return <Suspense fallback={<AdminLoadingSkeleton kvRows={6} />}><ImportJobDetailContent id={id} /></Suspense>;
}
