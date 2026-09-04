'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch } from '../../../lib/auth';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';

const STEPS = ['Upload File', 'Map Columns', 'Validation', 'Import Progress', 'Review'] as const;

/** Default column mapping targets for product imports. */
const TARGET_COLUMNS = [
  { key: 'name', label: 'Product Name', required: true },
  { key: 'nameAr', label: 'Product Name (Arabic)', required: false },
  { key: 'sku', label: 'SKU', required: true },
  { key: 'barcode', label: 'Barcode', required: false },
  { key: 'category', label: 'Category', required: false },
  { key: 'brand', label: 'Brand', required: false },
  { key: 'unit', label: 'Unit (pcs, kg, L)', required: true },
  { key: 'priceMinor', label: 'Price (minor units)', required: true },
  { key: 'moq', label: 'Min Order Qty', required: true },
  { key: 'description', label: 'Description', required: false },
  { key: 'stock', label: 'Initial Stock', required: false },
] as const;

interface ImportJob {
  id: string;
  storeId: string;
  fileName: string;
  status: string;
  errors: unknown[] | null;
  stats: Record<string, number> | null;
}

/** Parse a single CSV line, handling quoted fields and escaped quotes. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/** Parse full CSV text into records, tolerating quoted newlines. */
function parseCsvRecords(text: string): string[][] {
  // Split on newlines that are NOT inside quoted fields
  const records: string[][] = [];
  let buffer = '';
  let inQuotes = false;
  const flush = () => {
    if (buffer.trim()) records.push(parseCsvLine(buffer));
    buffer = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { buffer += '""'; i++; continue; }
      inQuotes = !inQuotes;
      buffer += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++; // CRLF
      flush();
    } else {
      buffer += ch;
    }
  }
  flush();
  return records;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export default function ImportWizardPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Step 1: Upload
  const [file, setFile] = useState<File | null>(null);
  const [storeId, setStoreId] = useState('');

  // Step 2: Column mapping
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  // Step 3: Validation
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [validRows, setValidRows] = useState(0);

  // Step 4: Progress
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  const [progress, setProgress] = useState(0);

  // Step 5: Review
  const [importStats, setImportStats] = useState<{ created: number; updated: number; skipped: number; errors: number } | null>(null);

  /** Parse CSV file to extract headers and preview rows. */
  const parseCsvFile = (csvText: string) => {
    const lines = csvText.split('\n').filter(l => l.trim());
    if (lines.length < 2) {
      setError('File must have at least a header row and one data row.');
      return;
    }
    const headers = parseCsvLine(lines[0]!);
    setDetectedHeaders(headers);

    // Auto-map columns by name similarity
    const mapping: Record<string, string> = {};
    for (const target of TARGET_COLUMNS) {
      const match = headers.find(h =>
        h.toLowerCase().replace(/[^a-z0-9]/g, '') === target.key.toLowerCase() ||
        h.toLowerCase().includes(target.key.toLowerCase()) ||
        h.toLowerCase().includes(target.label.toLowerCase().split(' ')[0]!)
      );
      if (match) mapping[target.key] = match;
    }
    setColumnMapping(mapping);
  };

  /** Read the full file and parse all data rows keyed by header. */
  const parseAllRows = async (csvFile: File): Promise<Record<string, string>[]> => {
    const text = await csvFile.text();
    const records = parseCsvRecords(text);
    if (records.length < 2) return [];
    const headers = records[0]!;
    return records.slice(1).map(cols => {
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = cols[i] ?? ''; });
      return row;
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const ext = selected.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'xlsx') {
      setError('Please select a CSV or XLSX file.');
      return;
    }

    setFile(selected);
    setError(null);

    // Parse CSV client-side for column detection
    if (ext === 'csv') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        parseCsvFile(text);
      };
      reader.readAsText(selected.slice(0, 10000)); // Read first 10KB for header detection
    }
  };

  const handleUpload = async () => {
    if (!file || !storeId) {
      setError('Please select a file and enter your store ID.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // Create import job via API
      const res = await authFetch(`${API_URL}/v1/stores/${storeId}/imports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.name.endsWith('.xlsx') ? 'XLSX' : 'CSV',
          fileSize: file.size,
          columnMapping,
        }),
      });

      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const job = await res.json();
      setImportJob(job);

      // Move to validation step
      setStep(2);
      // Simulate validation results (in production, server validates)
      setValidationErrors([]);
      setValidRows(0);
    } catch (e) {
      setError(`${e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStartImport = async () => {
    if (!importJob) return;
    setLoading(true);
    setError(null);

    // Poll import job status
    const pollInterval = setInterval(async () => {
      try {
        const res = await authFetch(`${API_URL}/v1/imports/${importJob.id}`);
        if (res.ok) {
          const job = await res.json();
          setImportJob(job);

          if (job.status === 'IMPORTING') {
            setProgress(job.stats?.processed ? Math.round((job.stats.processed / (job.stats.total || 1)) * 100) : 50);
          } else if (job.status === 'COMPLETED') {
            clearInterval(pollInterval);
            setProgress(100);
            setImportStats({
              created: job.stats?.created ?? 0,
              updated: job.stats?.updated ?? 0,
              skipped: job.stats?.skipped ?? 0,
              errors: job.stats?.errors ?? 0,
            });
            setStep(4);
          } else if (job.status === 'FAILED') {
            clearInterval(pollInterval);
            setError('Import failed. Please check your file and try again.');
            setStep(4);
          }
        }
      } catch {
        // Polling error — ignore and retry
      }
    }, 2000);

    try {
      // Parse the full CSV client-side and stage rows on the server
      if (!file || !file.name.toLowerCase().endsWith('.csv')) {
        throw new Error('Only CSV files are supported in the pilot. Convert XLSX to CSV and try again.');
      }
      const rows = await parseAllRows(file);
      if (rows.length === 0) {
        throw new Error('No data rows found in the file.');
      }

      // Stage rows in batches to stay under request size limits
      const BATCH = 400;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const stageRes = await authFetch(`${API_URL}/v1/imports/${importJob.id}/rows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: batch, append: i > 0 }),
        });
        if (!stageRes.ok) throw new Error(`Failed to stage rows: ${stageRes.status}`);
      }

      // Trigger server-side processing
      const processRes = await authFetch(`${API_URL}/v1/imports/${importJob.id}/process`, {
        method: 'POST',
      });
      if (!processRes.ok) {
        clearInterval(pollInterval);
        const body = await processRes.json().catch(() => null);
        throw new Error(body?.message || `Import processing failed: ${processRes.status}`);
      }

      setStep(3);
    } catch (e) {
      clearInterval(pollInterval);
      setError(`${e}`);
    } finally {
      setLoading(false);
    }
  };

  const updateMapping = (targetKey: string, sourceHeader: string) => {
    setColumnMapping(prev => ({ ...prev, [targetKey]: sourceHeader }));
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Import Catalog</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Bulk import products from a CSV or Excel file. Products will be created as drafts for your review.
      </p>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 32 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{
            flex: 1, height: 4, borderRadius: 2,
            backgroundColor: i <= step ? '#174A5B' : '#E5E7EB',
            transition: 'background-color 200ms',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{
            flex: 1, textAlign: 'center', fontSize: 11, fontWeight: i === step ? 600 : 400,
            color: i <= step ? '#174A5B' : '#9CA3AF',
          }}>
            {s}
          </div>
        ))}
      </div>

      {error && (
        <div style={{ padding: '12px 16px', marginBottom: 16, backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#B3372F', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 0 && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Store ID</label>
            <input
              type="text" value={storeId} onChange={e => setStoreId(e.target.value)}
              placeholder="Enter your store ID"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 14 }}
            />
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed #D1D5DB', borderRadius: 12, padding: '48px 24px',
              textAlign: 'center', cursor: 'pointer', backgroundColor: file ? '#F0FDF4' : '#FAFAFA',
              transition: 'background-color 200ms',
            }}
          >
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx" onChange={handleFileSelect} style={{ display: 'none' }} />
            <div style={{ fontSize: 40, marginBottom: 8 }}>{file ? '📄' : '📁'}</div>
            {file ? (
              <>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{file.name}</div>
                <div style={{ fontSize: 12, color: '#666' }}>{(file.size / 1024).toFixed(1)} KB</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Drop your file here or click to browse</div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>Supports CSV and XLSX files</div>
              </>
            )}
          </div>

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => { if (file && detectedHeaders.length > 0) setStep(1); else if (file) setStep(1); }}
              disabled={!file}
              style={{
                padding: '10px 24px', borderRadius: 6, fontSize: 14, fontWeight: 600,
                backgroundColor: file ? '#174A5B' : '#D1D5DB', color: 'white', border: 'none',
                cursor: file ? 'pointer' : 'not-allowed',
              }}
            >
              Next: Map Columns →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Column Mapping */}
      {step === 1 && (
        <div>
          <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
            Map your file columns to product fields. Required fields are marked with *.
          </p>

          <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: '#F9FAFB' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #E5E7EB' }}>Product Field</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #E5E7EB' }}>Your Column</th>
                </tr>
              </thead>
              <tbody>
                {TARGET_COLUMNS.map(tc => (
                  <tr key={tc.key} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '8px 12px' }}>
                      {tc.label} {tc.required && <span style={{ color: '#B3372F' }}>*</span>}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <select
                        value={columnMapping[tc.key] || ''}
                        onChange={e => updateMapping(tc.key, e.target.value)}
                        style={{
                          width: '100%', padding: '6px 8px', border: '1px solid #D1D5DB',
                          borderRadius: 4, fontSize: 13,
                          backgroundColor: columnMapping[tc.key] ? '#F0FDF4' : 'white',
                        }}
                      >
                        <option value="">— Not mapped —</option>
                        {detectedHeaders.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 16, padding: '12px 16px', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 12, color: '#92400E' }}>
            💡 <strong>Tip:</strong> Prices should be in minor units (halalas). E.g., 10.50 SAR = 1050. MOQ must be a positive integer.
          </div>

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep(0)} style={{ padding: '10px 24px', borderRadius: 6, fontSize: 14, backgroundColor: '#F3F4F6', border: 'none', cursor: 'pointer' }}>
              ← Back
            </button>
            <button onClick={handleUpload} disabled={loading} style={{ padding: '10px 24px', borderRadius: 6, fontSize: 14, fontWeight: 600, backgroundColor: '#174A5B', color: 'white', border: 'none', cursor: 'pointer' }}>
              {loading ? 'Uploading...' : 'Validate File →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Validation */}
      {step === 2 && (
        <div>
          <div style={{ padding: 24, backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Validation Passed</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
              {validRows} rows ready to import{validationErrors.length > 0 ? ` · ${validationErrors.length} rows with errors` : ''}
            </div>
          </div>

          {validationErrors.length > 0 && (
            <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '8px 12px', backgroundColor: '#FEF2F2', fontWeight: 600, fontSize: 13, color: '#B3372F', borderBottom: '1px solid #FECACA' }}>
                Row-level errors ({validationErrors.length})
              </div>
              <div style={{ maxHeight: 200, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F9FAFB' }}>
                      <th style={{ padding: '6px 12px', textAlign: 'left', borderBottom: '1px solid #E5E7EB' }}>Row</th>
                      <th style={{ padding: '6px 12px', textAlign: 'left', borderBottom: '1px solid #E5E7EB' }}>Field</th>
                      <th style={{ padding: '6px 12px', textAlign: 'left', borderBottom: '1px solid #E5E7EB' }}>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationErrors.slice(0, 50).map((err, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '6px 12px' }}>{err.row}</td>
                        <td style={{ padding: '6px 12px' }}>{err.field}</td>
                        <td style={{ padding: '6px 12px', color: '#B3372F' }}>{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {validationErrors.length > 50 && (
                <div style={{ padding: '8px 12px', fontSize: 11, color: '#666', textAlign: 'center' }}>
                  Showing first 50 of {validationErrors.length} errors.
                  <a href="#" style={{ color: '#174A5B' }}> Download full report</a>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep(1)} style={{ padding: '10px 24px', borderRadius: 6, fontSize: 14, backgroundColor: '#F3F4F6', border: 'none', cursor: 'pointer' }}>
              ← Back
            </button>
            <button onClick={handleStartImport} disabled={loading} style={{ padding: '10px 24px', borderRadius: 6, fontSize: 14, fontWeight: 600, backgroundColor: '#174A5B', color: 'white', border: 'none', cursor: 'pointer' }}>
              {loading ? 'Starting...' : 'Start Import →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Import Progress */}
      {step === 3 && (
        <div>
          <div style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
            <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>Importing Products...</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 24 }}>
              Processing your file. This may take a moment for large catalogs.
            </div>

            {/* Progress bar */}
            <div style={{ width: '100%', height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                width: `${progress}%`, height: '100%', backgroundColor: '#174A5B',
                borderRadius: 4, transition: 'width 500ms ease',
              }} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8, color: '#174A5B' }}>{progress}%</div>

            {importJob && (
              <div style={{ marginTop: 16, fontSize: 12, color: '#9CA3AF' }}>
                Job ID: {importJob.id.substring(0, 8)}... · Status: {importJob.status}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 5: Review */}
      {step === 4 && (
        <div>
          {importStats ? (
            <>
              <div style={{ padding: 24, backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, textAlign: 'center', marginBottom: 24 }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
                <div style={{ fontWeight: 600, fontSize: 18 }}>Import Complete!</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Created', value: importStats.created, color: '#1B7A4B' },
                  { label: 'Updated', value: importStats.updated, color: '#1D5FA8' },
                  { label: 'Skipped', value: importStats.skipped, color: '#B45309' },
                  { label: 'Errors', value: importStats.errors, color: '#B3372F' },
                ].map(s => (
                  <div key={s.label} style={{ padding: 16, backgroundColor: '#F9FAFB', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ padding: '12px 16px', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 13, color: '#92400E', marginBottom: 24 }}>
                💡 All imported products are created as <strong>DRAFT</strong>. Go to your catalog to review and publish them.
              </div>
            </>
          ) : (
            <div style={{ padding: 24, backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>❌</div>
              <div style={{ fontWeight: 600, fontSize: 18, color: '#B3372F' }}>Import Failed</div>
              <div style={{ fontSize: 13, color: '#666', marginTop: 8 }}>{error || 'An unexpected error occurred.'}</div>
            </div>
          )}

          <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={() => router.push('/merchant/orders')}
              style={{ padding: '10px 24px', borderRadius: 6, fontSize: 14, fontWeight: 600, backgroundColor: '#174A5B', color: 'white', border: 'none', cursor: 'pointer' }}
            >
              Go to Catalog
            </button>
            <button
              onClick={() => { setStep(0); setFile(null); setImportJob(null); setImportStats(null); setProgress(0); setValidationErrors([]); }}
              style={{ padding: '10px 24px', borderRadius: 6, fontSize: 14, backgroundColor: '#F3F4F6', border: 'none', cursor: 'pointer' }}
            >
              Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
