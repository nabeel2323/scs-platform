'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AdminRecord, PaginatedResult } from '../lib/api';
import { fieldLabel, FilterDefinition, managementTables, ManagementEntity } from '../lib/management-tables';
import { useRequirePerms, AccessDenied } from '../hooks/useRequirePerms';
import { useAdminResource, useAdminTableQuery } from '../hooks/useAdminTable';
import TablePagination from './TablePagination';
import DetailDialog from './DetailDialog';
import ProductDetails, { ProductModerationActions } from './ProductDetails';
import { ErrorNotice, PreviewImage, RecordFields, textValue } from './RecordFields';
import { CategoryEditor, BrandEditor, DisputeActions, useAdminMutation, UserMemberships, UserStatusActions, userDetailKeys } from './EntityActions';
import styles from './management.module.css';

export default function ManagementPage({ entity }: { entity: ManagementEntity }) {
  return <Suspense fallback={<p>Loading management table…</p>}><ManagementTable entity={entity} /></Suspense>;
}

export function rowClickOpensDetail(target: EventTarget | null): boolean {
  return target instanceof Element && !target.closest('button,a,input,select,textarea,label,[role="button"]') && !window.getSelection()?.toString();
}

function Cell({ row, field }: { row: AdminRecord; field: string }) {
  const value = row[field];
  if (field === 'totalMinor') return <>{Number(value).toLocaleString()} minor units · {textValue(row['currency'] || 'Unknown currency')}</>;
  if (field.endsWith('At') && typeof value === 'string') return <time dateTime={value}>{new Date(value).toLocaleDateString()}</time>;
  return <>
    <span dir={field.endsWith('Ar') ? 'rtl' : 'auto'}>{textValue(value)}</span>
    {field === 'storeName' && <><small className={styles['muted']}>{textValue(row['storeSlug'] || row['storeId'])}</small>
      {row['orgName'] ? <small className={styles['muted']}>{textValue(row['orgName'])}</small> : null}</>}
    {field === 'title' && <small className={styles['muted']}>{row.id}</small>}
  </>;
}
function VerificationLink({ entity, row }: { entity: ManagementEntity; row: AdminRecord }) {
  const { hasAccess } = useRequirePerms(['merchant:verification:review']);
  if (!hasAccess || !['merchants', 'verification'].includes(entity)) return null;
  return <Link href={entity === 'verification' ? `/verification/${row.id}` : row['verificationRequestId'] ? `/verification/${row['verificationRequestId']}` : `/verification?storeId=${row.id}`}>Review / View</Link>;
}

function ManagementTable({ entity }: { entity: ManagementEntity }) {
  const config = managementTables[entity];
  const { hasAccess, missingPerms } = useRequirePerms([config.permission]);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const state = useAdminTableQuery(config);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state.query)) if (value !== undefined && value !== '') params.set(key, String(value));
  const queryKey = params.toString();
  const list = useAdminResource<PaginatedResult<AdminRecord>>(`admin/${config.endpoint}?${queryKey}`, ready && hasAccess);
  const rows = useMemo(() => list.data?.data || [], [list.data]);
  const { page, limit, change } = state;
  const total = list.data?.total ?? 0;
  const [selected, setSelected] = useState<AdminRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const deletion = useAdminMutation(() => { setSelected(null); list.reload(); });
  useEffect(() => { setSelected(null); setSelectedId(null); setEditing(false); setCreating(false); }, [queryKey]);
  useEffect(() => {
    if (!list.data || list.loading) return;
    const lastPage = Math.max(0, Math.ceil(list.data.total / limit) - 1);
    if (page > lastPage) change({ page: String(lastPage) }, false);
    if (selectedId && !rows.some(row => row.id === selectedId)) setSelectedId(null);
  }, [list.data, list.loading, page, limit, change, selectedId, rows]);
  useEffect(() => {
    if (entity !== 'products' || !hasAccess || list.loading) return;
    function shortcut(event: KeyboardEvent) {
      if (selected || creating || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest('input,select,textarea,button,a,[contenteditable=true],dialog')) return;
      if (event.key === '/') { event.preventDefault(); searchInput.current?.focus(); return; }
      const index = rows.findIndex(row => row.id === selectedId);
      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        const next = rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === 'j' ? 1 : -1)))];
        if (next) setSelectedId(next.id);
      }
      if ((event.key === 'a' || event.key === 'x') && index >= 0) {
        event.preventDefault();
        root.current?.querySelector<HTMLButtonElement>(`tr[data-row-id="${rows[index]!.id}"] button[data-moderation="${event.key === 'a' ? 'APPROVED' : 'REJECTED'}"]`)?.click();
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [entity, hasAccess, list.loading, rows, selectedId, selected, creating]);
  if (!ready) return <p>Loading management table…</p>;
  if (!hasAccess) return <AccessDenied requiredPerms={[config.permission]} missingPerms={missingPerms} />;
  const sortKeys = ['id', ...config.sorts, ...config.dates];
  const filterFields: FilterDefinition[] = [...config.filters,
    { key: 'dateField', label: 'Date field (UTC)', options: config.dates }, { key: 'from', label: 'From (UTC)', type: 'date' }, { key: 'to', label: 'To (UTC)', type: 'date' }];
  const open = (row: AdminRecord, edit = false) => { setSelectedId(row.id); setSelected(row); setEditing(edit); };
  const remove = (row: AdminRecord) => {
    const label = entity === 'brands' ? 'brand' : 'category';
    if (window.confirm(`Delete this ${label}?`)) deletion.run(`${entity}/${row.id}`, 'DELETE');
  };
  const sort = (field: string) => state.change({ sortBy: field, sortDir: state.sortBy === field && state.sortDir === 'asc' ? 'desc' : 'asc' });
  return <div ref={root} className={styles['shell']}>
    <header className={styles['header']}><h1>{config.title}</h1><p>{total} matching records · Search and sorting apply across all records</p></header>
    <div className={styles['content']}>
      <div className={styles['toolbar']}>
        <label>Search<input ref={searchInput} value={state.search} maxLength={200} onChange={e => state.setSearch(e.target.value)} placeholder="Search all records…" /></label>
        <label>Sort by<select value={state.sortBy} onChange={e => state.change({ sortBy: e.target.value })}>
          {sortKeys.map(key => <option key={key} value={key} disabled={entity === 'orders' && key === 'totalMinor' && !state.applied['currency']}>{fieldLabel(key)}</option>)}
        </select></label>
        <label>Direction<select value={state.sortDir} onChange={e => state.change({ sortDir: e.target.value })}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
        <button type="button" onClick={list.reload}>Refresh</button>
        {entity === 'categories' && <button type="button" onClick={() => setCreating(true)}>Add category</button>}
        {entity === 'brands' && <button type="button" onClick={() => setCreating(true)}>Add brand</button>}
      </div>
      <details className={styles['filters']}><summary>Advanced filters</summary>
        <form onSubmit={event => { event.preventDefault(); state.apply(); }}>
          <div className={styles['toolbar']}>{filterFields.map(filter => <label key={filter.key}>{filter.label}
            {filter.options ? <select value={state.draft[filter.key] || ''} onChange={e => state.setDraft({ ...state.draft, [filter.key]: e.target.value })}>
              <option value="">{filter.key === 'dateField' ? fieldLabel(config.dates[0]!) : 'All'}</option>
              {filter.options.map(option => <option key={option} value={option}>{option === 'true' ? 'Yes' : option === 'false' ? 'No' : fieldLabel(option)}</option>)}
            </select> : <input type={filter.type || 'text'} min={filter.type === 'number' ? 0 : undefined} step={filter.type === 'number' ? 1 : undefined}
              value={state.draft[filter.key] || ''} onChange={e => state.setDraft({ ...state.draft, [filter.key]: e.target.value })} />}
          </label>)}</div>
          {entity === 'orders' && <p>Amount filters use minor units (100 = 1.00). Select a currency before filtering or sorting totals.</p>}
          <div className={styles['actions']}><button>Apply filters</button><button type="button" onClick={state.reset}>Reset all</button></div>
        </form>
      </details>
      <p className={styles['muted']}>Click a row or View for details. {entity === 'products' && 'Shortcuts: j/k select, a approve, x reject, / search.'}</p>
      <ErrorNotice message={list.error} retry={list.reload} /><ErrorNotice message={deletion.error} />
      {list.loading ? <p role="status">Loading records…</p> : !list.error && <div className={styles['tableWrap']}>
        <table><caption style={{ textAlign: 'left', padding: 12 }}>{config.title} — {total} results</caption><thead><tr>
          {config.columns.map(field => <th key={field} scope="col" aria-sort={state.sortBy === field ? state.sortDir === 'asc' ? 'ascending' : 'descending' : undefined}>
            {sortKeys.includes(field) ? <button type="button" onClick={() => sort(field)} disabled={entity === 'orders' && field === 'totalMinor' && !state.applied['currency']}>
              {fieldLabel(field)} {state.sortBy === field ? state.sortDir === 'asc' ? '↑' : '↓' : '↕'}</button> : fieldLabel(field)}
          </th>)}<th scope="col">Actions</th>
        </tr></thead><tbody>
          {rows.map(row => <tr key={row.id} data-row-id={row.id} data-selected={selectedId === row.id} onClick={event => {
            if (rowClickOpensDetail(event.target)) { event.currentTarget.querySelector<HTMLButtonElement>('[data-view]')?.focus(); open(row); }
          }}>
            {config.columns.map(field => <td key={field}><Cell row={row} field={field} /></td>)}
            <td><div className={styles['actions']}>
              <button type="button" data-view onClick={() => open(row)} aria-label={`View ${row['title'] || row['fullName'] || row['displayName'] || row['name'] || row.id}`}>View</button>
              {entity === 'products' && <ProductModerationActions id={row.id} status={String(row['status'])} onDone={list.reload} />}
              {entity === 'users' && <UserStatusActions record={row} onDone={list.reload} />}
              <VerificationLink entity={entity} row={row} />
              {entity === 'categories' && <><button type="button" onClick={() => open(row, true)}>Edit</button><button type="button" disabled={deletion.busy} onClick={() => remove(row)}>Delete</button></>}
              {entity === 'brands' && <><button type="button" onClick={() => open(row, true)}>Edit</button><button type="button" disabled={deletion.busy} onClick={() => remove(row)}>Deactivate</button></>}
            </div></td>
          </tr>)}
          {!rows.length && <tr><td colSpan={config.columns.length + 1}>No matching records.</td></tr>}
        </tbody></table>
      </div>}
      <TablePagination page={state.page} total={total} limit={state.limit} onPageChange={page => state.change({ page: String(page) }, false)} onLimitChange={limit => state.change({ limit: String(limit) })} />
      {selected && <DetailDialog title={`${editing ? 'Edit' : 'Details'} — ${textValue(selected['title'] || selected['name'] || selected['fullName'] || selected['displayName'] || selected.id)}`} onClose={() => setSelected(null)}>
        {entity === 'products' ? <ProductDetails key={selected.id} id={selected.id} returnTo={state.returnTo} onChanged={list.reload} />
          : editing && (entity === 'categories' || entity === 'brands') ? (entity === 'categories' ? <CategoryEditor key={selected.id} record={selected} onCancel={() => setEditing(false)} onDone={() => { setSelected(null); list.reload(); }} /> : <BrandEditor key={selected.id} record={selected} onCancel={() => setEditing(false)} onDone={() => { setSelected(null); list.reload(); }} />)
          : <EntityDetails key={selected.id} entity={entity} row={selected} onChanged={list.reload} onEdit={() => setEditing(true)} />}
      </DetailDialog>}
      {creating && <DetailDialog title={entity === 'brands' ? 'New brand' : 'New category'} onClose={() => setCreating(false)}>
        {entity === 'brands' ? <BrandEditor onCancel={() => setCreating(false)} onDone={() => { setCreating(false); list.reload(); }} /> : <CategoryEditor onCancel={() => setCreating(false)} onDone={() => { setCreating(false); list.reload(); }} />}
      </DetailDialog>}
    </div>
  </div>;
}

function EntityDetails({ entity, row, onChanged, onEdit }: { entity: ManagementEntity; row: AdminRecord; onChanged: () => void; onEdit: () => void }) {
  const path = entity === 'users' || entity === 'orders' || entity === 'disputes' ? `admin/${entity}/${row.id}`
    : entity === 'verification' ? `verification/${row.id}` : entity === 'merchants' ? `stores/${row.id}` : entity === 'categories' ? `categories/${row.id}` : entity === 'brands' ? `brands/${row.id}` : null;
  const detail = useAdminResource<AdminRecord>(path);
  if (detail.loading) return <p role="status">Loading details…</p>;
  if (detail.error) return <ErrorNotice message={detail.error} retry={detail.reload} />;
  const record = { ...row, ...detail.data };
  const changed = () => { detail.reload(); onChanged(); };
  return <section>
    <div className={styles['toolbar']}>
      <VerificationLink entity={entity} row={record} />
      {entity === 'users' && <UserStatusActions record={record} onDone={changed} />}
      {entity === 'categories' && <button type="button" onClick={onEdit}>Edit category</button>}
      {entity === 'brands' && <button type="button" onClick={onEdit}>Edit brand</button>}
    </div>
    <RecordFields record={record} keys={entity === 'users' ? userDetailKeys : undefined} omit={['items', 'history', 'events', 'organizations']} />
    {entity === 'categories' && typeof record['imageUrl'] === 'string' && <div className={styles['gallery']}><PreviewImage reference={record['imageUrl']} /></div>}
    {entity === 'users' && <UserMemberships record={record} onDone={changed} />}
    {['items', 'history', 'events'].filter(key => Array.isArray(record[key])).map(key => <section key={key}><h3>{fieldLabel(key)} ({(record[key] as unknown[]).length})</h3>
      {(record[key] as AdminRecord[]).map((item, index) => <div className={styles['card']} key={item.id || index}><RecordFields record={item} /></div>)}
    </section>)}
    {entity === 'disputes' && <DisputeActions record={record} onDone={changed} />}
  </section>;
}
