'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  uploadCatalogImport,
  fetchCatalogImports,
  fetchCatalogImportPreview,
  executeCatalogImport,
  fetchCatalogImportErrors,
  downloadCatalogTemplate,
  downloadCatalogImportReport,
  exportCatalog,
  type CatalogImport,
  type CatalogImportPreview,
  type CatalogImportError,
  type ImportOverrides,
} from '../../lib/api';
import { useRequirePerms, AccessDenied } from '../../hooks/useRequirePerms';
import {
  PageHeader,
  colors, typeScale, radii, shadows,
} from '@scs/ui-kit';

type Stage = 'dashboard' | 'uploading' | 'preview' | 'executing' | 'result';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  UPLOADED: { bg: '#e0e7ff', text: '#3730a3' },
  PARSING: { bg: '#fef3c7', text: '#92400e' },
  VALIDATING: { bg: '#fef3c7', text: '#92400e' },
  READY: { bg: '#d1fae5', text: '#065f46' },
  IMPORTING: { bg: '#dbeafe', text: '#1e40af' },
  COMPLETED: { bg: '#d1fae5', text: '#065f46' },
  COMPLETED_WITH_ERRORS: { bg: '#fef3c7', text: '#92400e' },
  FAILED: { bg: '#fee2e2', text: '#991b1b' },
  CANCELLED: { bg: '#f3f4f6', text: '#6b7280' },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function CatalogImportPage() {
  const { hasAccess, missingPerms } = useRequirePerms(['catalog:imports:manage']);
  const [stage, setStage] = useState<Stage>('dashboard');
  const [imports, setImports] = useState<CatalogImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentImport, setCurrentImport] = useState<CatalogImport | null>(null);
  const [preview, setPreview] = useState<CatalogImportPreview | null>(null);
  const [importErrors, setImportErrors] = useState<CatalogImportError[]>([]);
  const [executionResult, setExecutionResult] = useState<{
    created: number; updated: number; unchanged: number; rejected: number; errors: string[];
  } | null>(null);
  const [overrides, setOverrides] = useState<ImportOverrides>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadImports = useCallback(() => {
    setLoading(true);
    fetchCatalogImports({ limit: 20 })
      .then(setImports)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load imports'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadImports(); }, [loadImports]);

  if (!hasAccess) return <AccessDenied requiredPerms={['catalog:imports:manage']} missingPerms={missingPerms} />;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStage('uploading');
    setError('');

    try {
      const result = await uploadCatalogImport(file);
      setCurrentImport(result);

      // Load preview
      const prev = await fetchCatalogImportPreview(result.id);
      setPreview(prev);
      setStage('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setStage('dashboard');
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExecute = async () => {
    if (!currentImport) return;
    setStage('executing');
    setError('');

    try {
      const result = await executeCatalogImport(
        currentImport.id,
        Object.keys(overrides).length > 0 ? overrides : undefined,
      );
      setExecutionResult(result);
      setStage('result');
      loadImports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
      setStage('preview');
    }
  };

  const handleOverrideChange = (entityType: string, externalKey: string, field: string, value: string) => {
    setOverrides(prev => {
      const next = { ...prev };
      if (!next[entityType]) next[entityType] = {};
      if (!next[entityType][externalKey]) next[entityType] = { ...next[entityType], [externalKey]: {} };
      next[entityType][externalKey] = { ...next[entityType][externalKey], [field]: value };
      return next;
    });
  };

  const overrideCount = Object.values(overrides).reduce(
    (sum, keys) => sum + Object.values(keys).reduce((s2, fields) => s2 + Object.keys(fields).length, 0), 0,
  );

  const handleViewErrors = async (importId: string) => {
    try {
      const errs = await fetchCatalogImportErrors(importId);
      setImportErrors(errs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load errors');
    }
  };

  const handleBackToDashboard = () => {
    setStage('dashboard');
    setCurrentImport(null);
    setPreview(null);
    setExecutionResult(null);
    setImportErrors([]);
    loadImports();
  };

  return (
    <>
      <PageHeader
        title="Catalog Import Center"
        subtitle="Import catalog data from Excel workbooks (.xlsx)"
      />
      <div style={{ padding: '20px 24px 48px', maxWidth: 1200, margin: '0 auto' }}>
        {error && (
          <div style={{ padding: 14, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: radii.md, marginBottom: 20, color: '#991b1b', ...typeScale.bodySm }}>
            {error}
            <button onClick={() => setError('')} style={{ marginLeft: 12, background: 'none', border: '1px solid #991b1b', borderRadius: radii.sm, padding: '2px 10px', cursor: 'pointer', color: '#991b1b', fontSize: 12 }}>
              Dismiss
            </button>
          </div>
        )}

        {stage === 'dashboard' && (
          <DashboardStage
            imports={imports}
            loading={loading}
            fileInputRef={fileInputRef}
            onFileSelect={handleFileSelect}
            onRefresh={loadImports}
            onViewErrors={handleViewErrors}
            onDownloadReport={downloadCatalogImportReport}
            onDownloadTemplate={downloadCatalogTemplate}
            onExportCatalog={exportCatalog}
            importErrors={importErrors}
          />
        )}
        {stage === 'uploading' && <UploadingStage />}
        {stage === 'preview' && currentImport && preview && (
          <PreviewStage
            importJob={currentImport}
            preview={preview}
            overrides={overrides}
            overrideCount={overrideCount}
            onOverrideChange={handleOverrideChange}
            onExecute={handleExecute}
            onBack={handleBackToDashboard}
          />
        )}
        {stage === 'executing' && <ExecutingStage />}
        {stage === 'result' && executionResult && (
          <ResultStage result={executionResult} onBack={handleBackToDashboard} />
        )}
      </div>
    </>
  );
}

// ── Dashboard Stage ─────────────────────────────────────────────

function DashboardStage({ imports, loading, fileInputRef, onFileSelect, onRefresh, onViewErrors, onDownloadReport, onDownloadTemplate, onExportCatalog, importErrors }: {
  imports: CatalogImport[];
  loading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRefresh: () => void;
  onViewErrors: (id: string) => void;
  onDownloadReport: (id: string) => void;
  onDownloadTemplate: (type: string) => void;
  onExportCatalog: () => void;
  importErrors: CatalogImportError[];
}) {
  return (
    <>
      {/* Upload area */}
      <div style={{
        padding: '32px 24px', marginBottom: 24, textAlign: 'center',
        background: colors.surface, border: `2px dashed ${colors.border}`,
        borderRadius: radii.lg, cursor: 'pointer',
        transition: 'border-color 0.2s',
      }}
        onClick={() => fileInputRef.current?.click()}
        onMouseOver={e => (e.currentTarget.style.borderColor = colors.brand[500])}
        onMouseOut={e => (e.currentTarget.style.borderColor = colors.border)}
      >
        <input ref={fileInputRef} type="file" accept=".xlsx" onChange={onFileSelect} style={{ display: 'none' }} />
        <div style={{ fontSize: 40, marginBottom: 8 }}>📤</div>
        <div style={{ ...typeScale.h3, color: colors.ink, marginBottom: 4 }}>Upload Catalog Workbook</div>
        <div style={{ ...typeScale.bodySm, color: colors.muted }}>
          Drop an .xlsx file or click to browse. Max 25 MB.
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button onClick={() => onDownloadTemplate('full')} style={btnSecondary}>
          📋 Full Template
        </button>
        <button onClick={() => onDownloadTemplate('products')} style={btnSecondary}>
          📦 Products Template
        </button>
        <button onClick={() => onDownloadTemplate('categories')} style={btnSecondary}>
          📁 Categories Template
        </button>
        <button onClick={() => onDownloadTemplate('attributes')} style={btnSecondary}>
          🏷️ Attributes Template
        </button>
        <button onClick={onExportCatalog} style={btnSecondary}>
          📥 Export Current Catalog
        </button>
        <button onClick={onRefresh} style={btnSecondary}>
          🔄 Refresh
        </button>
      </div>

      {/* Error detail panel */}
      {importErrors.length > 0 && (
        <div style={{ marginBottom: 24, padding: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: radii.md }}>
          <div style={{ ...typeScale.h4, color: '#991b1b', marginBottom: 12 }}>Import Errors ({importErrors.length})</div>
          <div style={{ maxHeight: 300, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', ...typeScale.bodySm }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #fecaca' }}>
                  <th style={thStyle}>Sheet</th>
                  <th style={thStyle}>Row</th>
                  <th style={thStyle}>Entity</th>
                  <th style={thStyle}>Field</th>
                  <th style={thStyle}>Message</th>
                  <th style={thStyle}>Severity</th>
                </tr>
              </thead>
              <tbody>
                {importErrors.slice(0, 50).map((e, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #fee2e2' }}>
                    <td style={tdStyle}>{e.sheet}</td>
                    <td style={tdStyle}>{e.rowNumber}</td>
                    <td style={tdStyle}>{e.entityType}</td>
                    <td style={tdStyle}>{e.field}</td>
                    <td style={tdStyle}>{e.errorMessage}</td>
                    <td style={tdStyle}>
                      <span style={{ padding: '2px 8px', borderRadius: radii.sm, fontSize: 11, background: e.severity === 'ERROR' ? '#fee2e2' : '#fef3c7', color: e.severity === 'ERROR' ? '#991b1b' : '#92400e' }}>
                        {e.severity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent imports table */}
      <div style={{ ...typeScale.h3, color: colors.ink, marginBottom: 12 }}>Recent Imports</div>
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: colors.muted }}>Loading…</div>
      ) : imports.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: colors.muted, background: colors.surface, borderRadius: radii.md, border: `1px solid ${colors.border}` }}>
          No imports yet. Upload a workbook to get started.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', ...typeScale.bodySm }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                <th style={thStyle}>File</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Rows</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Updated</th>
                <th style={thStyle}>Errors</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {imports.map(imp => {
                const sc = STATUS_COLORS[imp.status] ?? { bg: '#f3f4f6', text: '#6b7280' };
                return (
                  <tr key={imp.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={tdStyle}>{imp.fileName}</td>
                    <td style={tdStyle}>
                      <span style={{ padding: '2px 8px', borderRadius: radii.sm, fontSize: 11, background: sc.bg, color: sc.text, fontWeight: 600 }}>
                        {imp.status}
                      </span>
                    </td>
                    <td style={tdStyle}>{imp.totalRows}</td>
                    <td style={tdStyle}>{imp.createdRows}</td>
                    <td style={tdStyle}>{imp.updatedRows}</td>
                    <td style={tdStyle}>{imp.errorCount}</td>
                    <td style={tdStyle}>{formatDate(imp.createdAt)}</td>
                    <td style={tdStyle}>
                      {imp.errorCount > 0 && (
                        <button onClick={() => onViewErrors(imp.id)} style={btnSmall}>Errors</button>
                      )}
                      {(imp.status === 'COMPLETED' || imp.status === 'COMPLETED_WITH_ERRORS') && (
                        <button onClick={() => onDownloadReport(imp.id)} style={btnSmall}>Report</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Uploading Stage ─────────────────────────────────────────────

function UploadingStage() {
  return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
      <div style={{ ...typeScale.h3, color: colors.ink }}>Uploading and validating…</div>
      <div style={{ ...typeScale.bodySm, color: colors.muted, marginTop: 8 }}>
        Parsing workbook, validating data, and generating import plan.
      </div>
    </div>
  );
}

// ── Preview Stage ───────────────────────────────────────────────

function PreviewStage({ importJob, preview, overrides, overrideCount, onOverrideChange, onExecute, onBack }: {
  importJob: CatalogImport;
  preview: CatalogImportPreview;
  overrides: ImportOverrides;
  overrideCount: number;
  onOverrideChange: (entityType: string, externalKey: string, field: string, value: string) => void;
  onExecute: () => void;
  onBack: () => void;
}) {
  const { summary } = preview.plan;
  const hardErrors = preview.errors.filter(e => e.severity === 'ERROR');
  const hasErrors = hardErrors.length > 0;

  // Errors that can be corrected via overrides (have externalKey + field)
  const fixableErrors = hardErrors.filter(e => e.externalKey && e.field);
  const unfixableErrors = hardErrors.filter(e => !e.externalKey || !e.field);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ ...typeScale.h2, color: colors.ink }}>Import Preview</div>
          <div style={{ ...typeScale.bodySm, color: colors.muted }}>
            {importJob.fileName} — {formatBytes(importJob.fileSize)}
          </div>
        </div>
        <button onClick={onBack} style={btnSecondary}>← Back</button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <SummaryCard label="Create" value={summary.totalCreate} color="#059669" bg="#d1fae5" />
        <SummaryCard label="Update" value={summary.totalUpdate} color="#2563eb" bg="#dbeafe" />
        <SummaryCard label="Unchanged" value={summary.totalUnchanged} color="#6b7280" bg="#f3f4f6" />
        <SummaryCard label="Errors" value={preview.errors.filter(e => e.severity === 'ERROR').length} color="#dc2626" bg="#fee2e2" />
      </div>

      {/* Per-entity breakdown */}
      {Object.keys(summary.byEntity).length > 0 && (
        <div style={{ marginBottom: 24, padding: 16, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radii.md }}>
          <div style={{ ...typeScale.h4, color: colors.ink, marginBottom: 12 }}>Entity Breakdown</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', ...typeScale.bodySm }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                <th style={thStyle}>Entity</th>
                <th style={thStyle}>Create</th>
                <th style={thStyle}>Update</th>
                <th style={thStyle}>Unchanged</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(summary.byEntity).map(([entity, counts]) => (
                <tr key={entity} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={tdStyle}>{entity}</td>
                  <td style={tdStyle}>{counts.create}</td>
                  <td style={tdStyle}>{counts.update}</td>
                  <td style={tdStyle}>{counts.unchanged}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Interactive corrections */}
      {fixableErrors.length > 0 && (
        <div style={{ marginBottom: 24, padding: 16, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: radii.md }}>
          <div style={{ ...typeScale.h4, color: '#92400e', marginBottom: 8 }}>
            ✏️ Corrections ({fixableErrors.length})
          </div>
          <div style={{ ...typeScale.bodySm, color: '#78350f', marginBottom: 12 }}>
            Enter corrected values below to fix these errors before importing.
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', ...typeScale.bodySm }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #fde68a' }}>
                <th style={thStyle}>Entity</th>
                <th style={thStyle}>Key</th>
                <th style={thStyle}>Field</th>
                <th style={thStyle}>Current Value</th>
                <th style={thStyle}>Error</th>
                <th style={{ ...thStyle, minWidth: 200 }}>Correction</th>
              </tr>
            </thead>
            <tbody>
              {fixableErrors.map((e, i) => {
                const et = e.entityType!;
                const ek = e.externalKey!;
                const fld = e.field!;
                const currentOverride = overrides[et]?.[ek]?.[fld] ?? '';
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #fde68a' }}>
                    <td style={tdStyle}>{et}</td>
                    <td style={tdStyle}>{ek}</td>
                    <td style={tdStyle}><code>{fld}</code></td>
                    <td style={{ ...tdStyle, color: colors.muted, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.rawValue ?? '—'}
                    </td>
                    <td style={{ ...tdStyle, color: '#991b1b' }}>{e.errorMessage}</td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={currentOverride}
                        onChange={ev => onOverrideChange(et, ek, fld, ev.target.value)}
                        placeholder="Enter corrected value…"
                        style={{
                          width: '100%', padding: '6px 8px', border: '1px solid #d1d5db',
                          borderRadius: radii.sm, fontSize: 13,
                          outline: 'none',
                        }}
                        onFocus={ev => (ev.target.style.borderColor = colors.brand[500])}
                        onBlur={ev => (ev.target.style.borderColor = '#d1d5db')}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Unfixable errors */}
      {unfixableErrors.length > 0 && (
        <div style={{ marginBottom: 24, padding: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: radii.md }}>
          <div style={{ ...typeScale.h4, color: '#991b1b', marginBottom: 8 }}>
            Errors That Require File Changes ({unfixableErrors.length})
          </div>
          <div style={{ maxHeight: 120, overflow: 'auto' }}>
            {unfixableErrors.slice(0, 10).map((e, i) => (
              <div key={i} style={{ ...typeScale.bodySm, color: '#991b1b', padding: '3px 0', borderBottom: '1px solid #fecaca' }}>
                {e.sheet} row {e.rowNumber}: {e.errorMessage}
                {e.suggestedFix ? ` — ${e.suggestedFix}` : ''}
              </div>
            ))}
            {unfixableErrors.length > 10 && (
              <div style={{ ...typeScale.caption, color: colors.muted, padding: '6px 0' }}>
                … and {unfixableErrors.length - 10} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Execute button */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button onClick={onBack} style={btnSecondary}>Cancel</button>
        <button
          onClick={onExecute}
          disabled={unfixableErrors.length > 0}
          style={{
            ...btnPrimary,
            opacity: unfixableErrors.length > 0 ? 0.5 : 1,
            cursor: unfixableErrors.length > 0 ? 'not-allowed' : 'pointer',
          }}
          title={unfixableErrors.length > 0 ? 'Fix unfixable errors in the Excel file first' : overrideCount > 0 ? `Execute with ${overrideCount} correction(s)` : 'Execute the import'}
        >
          {unfixableErrors.length > 0
            ? '⚠️ Fix File Errors First'
            : overrideCount > 0
              ? `✅ Import with ${overrideCount} Correction(s)`
              : `✅ Import (${summary.totalCreate} new, ${summary.totalUpdate} updates)`}
        </button>
      </div>
    </>
  );
}

// ── Executing Stage ─────────────────────────────────────────────

function ExecutingStage() {
  return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
      <div style={{ ...typeScale.h3, color: colors.ink }}>Executing import…</div>
      <div style={{ ...typeScale.bodySm, color: colors.muted, marginTop: 8 }}>
        Writing catalog data to database. This may take a moment.
      </div>
    </div>
  );
}

// ── Result Stage ────────────────────────────────────────────────

function ResultStage({ result, onBack }: {
  result: { created: number; updated: number; unchanged: number; rejected: number; errors: string[] };
  onBack: () => void;
}) {
  return (
    <>
      <div style={{ padding: '40px 24px', textAlign: 'center', marginBottom: 24, background: result.rejected > 0 ? '#fffbeb' : '#f0fdf4', border: `1px solid ${result.rejected > 0 ? '#fde68a' : '#bbf7d0'}`, borderRadius: radii.lg }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>{result.rejected > 0 ? '⚠️' : '✅'}</div>
        <div style={{ ...typeScale.h2, color: colors.ink, marginBottom: 8 }}>
          Import {result.rejected > 0 ? 'Completed with Issues' : 'Successful'}
        </div>
        <div style={{ ...typeScale.bodySm, color: colors.muted }}>
          {result.created + result.updated + result.unchanged} rows processed
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <SummaryCard label="Created" value={result.created} color="#059669" bg="#d1fae5" />
        <SummaryCard label="Updated" value={result.updated} color="#2563eb" bg="#dbeafe" />
        <SummaryCard label="Unchanged" value={result.unchanged} color="#6b7280" bg="#f3f4f6" />
        <SummaryCard label="Rejected" value={result.rejected} color="#dc2626" bg="#fee2e2" />
      </div>

      {result.errors.length > 0 && (
        <div style={{ marginBottom: 24, padding: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: radii.md }}>
          <div style={{ ...typeScale.h4, color: '#991b1b', marginBottom: 8 }}>Execution Errors</div>
          {result.errors.map((e, i) => (
            <div key={i} style={{ ...typeScale.bodySm, color: '#991b1b', padding: '4px 0' }}>{e}</div>
          ))}
        </div>
      )}

      <div style={{ textAlign: 'center' }}>
        <button onClick={onBack} style={btnPrimary}>← Back to Dashboard</button>
      </div>
    </>
  );
}

// ── Shared components ───────────────────────────────────────────

function SummaryCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div style={{ padding: '16px 20px', background: bg, borderRadius: radii.md, textAlign: 'center' }}>
      <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ ...typeScale.bodySm, color, fontWeight: 600, marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ── Shared styles ───────────────────────────────────────────────

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 12px', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '8px 12px' };

const btnPrimary: React.CSSProperties = {
  padding: '10px 20px', ...typeScale.button, color: '#fff',
  background: colors.brand[700], border: 'none', borderRadius: radii.sm,
  cursor: 'pointer', fontWeight: 600,
};

const btnSecondary: React.CSSProperties = {
  padding: '8px 16px', ...typeScale.button, color: colors.ink,
  background: colors.surface, border: `1px solid ${colors.border}`,
  borderRadius: radii.sm, cursor: 'pointer',
};

const btnSmall: React.CSSProperties = {
  padding: '2px 8px', fontSize: 11, color: colors.brand[700],
  background: 'transparent', border: `1px solid ${colors.brand[300]}`,
  borderRadius: radii.sm, cursor: 'pointer', marginRight: 4,
};
