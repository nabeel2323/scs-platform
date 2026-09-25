'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AttributeDefinition, AttributeOption, AttributeScope, AttributeType,
  fetchAttributes, createAttribute, updateAttribute, deleteAttribute, addAttributeOption,
} from '../../lib/api';
import { useRequirePerms, AccessDenied } from '../../hooks/useRequirePerms';
import { SkeletonTable } from '@scs/ui-kit';
import DetailDialog from '../../components/DetailDialog';
import styles from '../../components/management.module.css';

/* ── Constants ─────────────────────────────────────────────── */

const ATTRIBUTE_TYPES: AttributeType[] = [
  'TEXT', 'LONG_TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'DATETIME',
  'SELECT', 'MULTI_SELECT', 'COLOR', 'URL', 'FILE', 'MEASUREMENT', 'CURRENCY',
];

const SCOPES: AttributeScope[] = ['PRODUCT', 'VARIANT', 'OFFER'];

const HAS_OPTIONS: ReadonlySet<AttributeType> = new Set(['SELECT', 'MULTI_SELECT']);

/* ── Page ──────────────────────────────────────────────────── */

export default function AttributesPage() {
  const { hasAccess, missingPerms } = useRequirePerms(['catalog:attributes:manage']);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const [attrs, setAttrs] = useState<AttributeDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [scopeFilter, setScopeFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [includeDeprecated, setIncludeDeprecated] = useState(false);
  const [search, setSearch] = useState('');

  // Dialogs
  const [editing, setEditing] = useState<AttributeDefinition | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAttributes({
        scope: scopeFilter || undefined,
        type: typeFilter || undefined,
        includeDeprecated: includeDeprecated || undefined,
      });
      setAttrs(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load attributes');
    } finally {
      setLoading(false);
    }
  }, [scopeFilter, typeFilter, includeDeprecated]);

  useEffect(() => { if (ready && hasAccess) load(); }, [ready, hasAccess, load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return attrs;
    const q = search.toLowerCase();
    return attrs.filter(a =>
      a.code.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      (a.nameAr ?? '').toLowerCase().includes(q),
    );
  }, [attrs, search]);

  if (!ready) return <p style={{ padding: 32 }}>Loading…</p>;
  if (!hasAccess) return <AccessDenied requiredPerms={['catalog:attributes:manage']} missingPerms={missingPerms} />;

  return (
    <div className={styles['shell']}>
      <header className={styles['header']}>
        <h1>Attribute Management</h1>
        <p>{filtered.length} attribute{filtered.length !== 1 ? 's' : ''} — define the building blocks for product types</p>
      </header>

      <div className={styles['content']}>
        {/* Toolbar */}
        <div className={styles['toolbar']}>
          <label>Search
            <input value={search} maxLength={100} onChange={e => setSearch(e.target.value)} placeholder="Search by code or name…" />
          </label>
          <label>Scope
            <select value={scopeFilter} onChange={e => setScopeFilter(e.target.value)}>
              <option value="">All scopes</option>
              {SCOPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Type
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">All types</option>
              {ATTRIBUTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={includeDeprecated} onChange={e => setIncludeDeprecated(e.target.checked)} style={{ width: 'auto' }} />
            Include deprecated
          </label>
          <button type="button" onClick={load}>Refresh</button>
          <button type="button" onClick={() => setCreating(true)}>Add attribute</button>
        </div>

        {/* Error / loading */}
        {error && <div className={styles['error']}>{error} <button type="button" onClick={load} style={{ marginLeft: 8 }}>Retry</button></div>}
        {loading ? <SkeletonTable rows={6} cols={7} /> : (
          <div className={styles['tableWrap']}>
            <table>
              <caption style={{ textAlign: 'left', padding: 12 }}>Attributes — {filtered.length} results</caption>
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Name</th>
                  <th scope="col">Type</th>
                  <th scope="col">Scope</th>
                  <th scope="col">Status</th>
                  <th scope="col">Options</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(attr => (
                  <tr key={attr.id} onClick={e => {
                    if (e.target instanceof Element && !e.target.closest('button,a,input,select')) {
                      setEditing(attr);
                    }
                  }}>
                    <td><code style={{ fontSize: 12, background: '#f0f4f6', padding: '2px 6px', borderRadius: 4 }}>{attr.code}</code></td>
                    <td>
                      {attr.name}
                      {attr.nameAr && <small className={styles['muted']} dir="rtl">{attr.nameAr}</small>}
                    </td>
                    <td>{attr.type}{attr.unit && <small className={styles['muted']}>({attr.unit})</small>}</td>
                    <td><ScopeBadge scope={attr.scope} /></td>
                    <td><StatusBadge status={attr.status} /></td>
                    <td>{HAS_OPTIONS.has(attr.type) ? (attr.options?.length ?? 0) : '—'}</td>
                    <td>
                      <div className={styles['actions']}>
                        <Link href={`/attributes/${attr.id}`} className={styles['viewLink']}>View / Edit</Link>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={7}>No attributes found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* Create dialog */}
        {creating && (
          <DetailDialog title="New Attribute" onClose={() => setCreating(false)}>
            <AttributeForm
              mode="create"
              onDone={() => { setCreating(false); load(); }}
              onCancel={() => setCreating(false)}
            />
          </DetailDialog>
        )}

        {/* Edit / view dialog */}
        {editing && (
          <DetailDialog title={`Edit — ${editing.name}`} onClose={() => setEditing(null)}>
            <AttributeForm
              mode="edit"
              attribute={editing}
              onDone={() => { setEditing(null); load(); }}
              onCancel={() => setEditing(null)}
            />
          </DetailDialog>
        )}
      </div>
    </div>
  );
}

/* ── Badges ────────────────────────────────────────────────── */

function ScopeBadge({ scope }: { scope: AttributeScope }) {
  const colors: Record<AttributeScope, { bg: string; fg: string }> = {
    PRODUCT: { bg: '#e0f2fe', fg: '#0369a1' },
    VARIANT: { bg: '#fef3c7', fg: '#92400e' },
    OFFER: { bg: '#ede9fe', fg: '#5b21b6' },
  };
  const c = colors[scope];
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.fg }}>
      {scope}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'ACTIVE';
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
      background: isActive ? '#dcfce7' : '#fee2e2',
      color: isActive ? '#166534' : '#991b1b',
    }}>
      {status}
    </span>
  );
}

/* ── Attribute Form (Create / Edit) ────────────────────────── */

function AttributeForm({ mode, attribute, onDone, onCancel }: {
  mode: 'create' | 'edit';
  attribute?: AttributeDefinition;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form fields
  const [code, setCode] = useState(attribute?.code ?? '');
  const [name, setName] = useState(attribute?.name ?? '');
  const [nameAr, setNameAr] = useState(attribute?.nameAr ?? '');
  const [description, setDescription] = useState(attribute?.description ?? '');
  const [type, setType] = useState<AttributeType>(attribute?.type ?? 'TEXT');
  const [scope, setScope] = useState<AttributeScope>(attribute?.scope ?? 'PRODUCT');
  const [unit, setUnit] = useState(attribute?.unit ?? '');
  const [status, setStatus] = useState<'ACTIVE' | 'DEPRECATED'>(attribute?.status ?? 'ACTIVE');
  const [validationJson, setValidationJson] = useState(
    attribute?.validation ? JSON.stringify(attribute.validation, null, 2) : '{}',
  );

  // Options (for SELECT / MULTI_SELECT)
  const [options, setOptions] = useState<AttributeOption[]>(attribute?.options ?? []);
  const [newOptValue, setNewOptValue] = useState('');
  const [newOptLabel, setNewOptLabel] = useState('');

  const isEdit = mode === 'edit';
  const showOptions = HAS_OPTIONS.has(type);

  const handleSave = async () => {
    setBusy(true);
    setFormError(null);
    try {
      let parsedValidation: Record<string, unknown> = {};
      try {
        parsedValidation = JSON.parse(validationJson || '{}');
      } catch {
        setFormError('Validation JSON is invalid');
        setBusy(false);
        return;
      }

      if (isEdit && attribute) {
        await updateAttribute(attribute.id, {
          name: name || undefined,
          nameAr: nameAr || undefined,
          description: description || undefined,
          unit: unit || undefined,
          status,
          validation: parsedValidation,
        });
      } else {
        if (!code.trim()) { setFormError('Code is required'); setBusy(false); return; }
        if (!name.trim()) { setFormError('Name is required'); setBusy(false); return; }
        await createAttribute({
          code: code.trim(),
          name: name.trim(),
          nameAr: nameAr || undefined,
          description: description || undefined,
          type,
          unit: unit || undefined,
          scope,
          validation: parsedValidation,
        });
      }
      onDone();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = async () => {
    if (!attribute) return;
    if (!window.confirm(`Deactivate attribute "${attribute.name}"? It will be hidden from new product types.`)) return;
    setBusy(true);
    try {
      await deleteAttribute(attribute.id);
      onDone();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Deactivation failed');
    } finally {
      setBusy(false);
    }
  };

  const handleAddOption = async () => {
    if (!newOptValue.trim()) return;
    setBusy(true);
    setFormError(null);
    try {
      if (isEdit && attribute) {
        // Add via API for persisted attributes
        const newOpt = await addAttributeOption(attribute.id, {
          value: newOptValue.trim(),
          label: newOptLabel || undefined,
        });
        setOptions(prev => [...prev, newOpt]);
      } else {
        // Add to local list for new attributes (will be sent with create payload)
        const localOpt: AttributeOption = {
          id: `local-${Date.now()}`,
          attributeId: '',
          value: newOptValue.trim(),
          valueAr: null,
          label: newOptLabel || null,
          sortOrder: options.length,
          isActive: true,
        };
        setOptions(prev => [...prev, localOpt]);
      }
      setNewOptValue('');
      setNewOptLabel('');
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Failed to add option');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {formError && <div className={styles['error']}>{formError}</div>}
      {success && <div className={styles['notice']}>{success}</div>}

      <div className={styles['fields']}>
        {/* Code — only for create */}
        {!isEdit && (
          <div>
            <dt>Code *</dt>
            <dd>
              <input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. ram_capacity" maxLength={100} />
              <small className={styles['muted']}>Unique identifier. Use snake_case.</small>
            </dd>
          </div>
        )}

        {/* Name */}
        <div>
          <dt>Name {isEdit ? '' : '*'}</dt>
          <dd><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. RAM Capacity" maxLength={200} /></dd>
        </div>

        {/* Name (Arabic) */}
        <div>
          <dt>Name (Arabic)</dt>
          <dd><input value={nameAr} onChange={e => setNameAr(e.target.value)} dir="rtl" placeholder="مثال: سعة الذاكرة" maxLength={200} /></dd>
        </div>

        {/* Description */}
        <div>
          <dt>Description</dt>
          <dd><textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={1000} /></dd>
        </div>

        {/* Type */}
        <div>
          <dt>Type {isEdit ? '(read-only)' : ''}</dt>
          <dd>
            <select value={type} onChange={e => setType(e.target.value as AttributeType)} disabled={isEdit}>
              {ATTRIBUTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <small className={styles['muted']}>{isEdit ? 'Type cannot be changed after creation.' : 'Data type for this attribute.'}</small>
          </dd>
        </div>

        {/* Scope */}
        <div>
          <dt>Scope {isEdit ? '(read-only)' : ''}</dt>
          <dd>
            <select value={scope} onChange={e => setScope(e.target.value as AttributeScope)} disabled={isEdit}>
              {SCOPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <small className={styles['muted']}>
              {scope === 'PRODUCT' && 'Describes the product as a whole.'}
              {scope === 'VARIANT' && 'Differentiates variants (e.g. RAM, Color).'}
              {scope === 'OFFER' && 'Specific to a merchant offer (e.g. warranty).'}
            </small>
          </dd>
        </div>

        {/* Unit */}
        <div>
          <dt>Unit</dt>
          <dd><input value={unit} onChange={e => setUnit(e.target.value)} placeholder="e.g. GB, kg, cm" maxLength={50} /></dd>
        </div>

        {/* Status — edit only */}
        {isEdit && (
          <div>
            <dt>Status</dt>
            <dd>
              <select value={status} onChange={e => setStatus(e.target.value as 'ACTIVE' | 'DEPRECATED')}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="DEPRECATED">DEPRECATED</option>
              </select>
            </dd>
          </div>
        )}
      </div>

      {/* Validation JSON */}
      <div style={{ margin: '16px 0' }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 12 }}>Validation Rules (JSON)</label>
        <textarea
          value={validationJson}
          onChange={e => setValidationJson(e.target.value)}
          rows={4}
          style={{ fontFamily: 'monospace', fontSize: 12, width: '100%' }}
          placeholder='{"min": 1, "max": 128}'
        />
      </div>

      {/* Options management (SELECT / MULTI_SELECT) */}
      {showOptions && (
        <div style={{ margin: '16px 0', padding: 16, background: '#f7f9fa', borderRadius: 10, border: '1px solid #d9e2e6' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
            Options ({options.length})
          </h3>

          {/* Existing options */}
          {options.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {options.map((opt, i) => (
                <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
                  <span style={{ color: '#5b6b74', width: 24, textAlign: 'right' }}>{i + 1}.</span>
                  <strong>{opt.value}</strong>
                  {opt.label && <span style={{ color: '#5b6b74' }}>({opt.label})</span>}
                  {opt.valueAr && <span dir="rtl" style={{ color: '#5b6b74', fontSize: 12 }}>{opt.valueAr}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Add new option */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
            <label style={{ flex: 1 }}>
              Value *
              <input value={newOptValue} onChange={e => setNewOptValue(e.target.value)} placeholder="e.g. 16" maxLength={100} />
            </label>
            <label style={{ flex: 1 }}>
              Label
              <input value={newOptLabel} onChange={e => setNewOptLabel(e.target.value)} placeholder="e.g. 16 GB" maxLength={200} />
            </label>
            <button type="button" disabled={busy || !newOptValue.trim()} onClick={handleAddOption}>
              Add
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className={styles['actions']} style={{ marginTop: 20 }}>
        <button type="button" disabled={busy} onClick={handleSave}>
          {busy ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Attribute'}
        </button>
        {isEdit && attribute?.status === 'ACTIVE' && (
          <button type="button" disabled={busy} onClick={handleDeactivate} style={{ color: '#991b1b' }}>
            Deactivate
          </button>
        )}
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
