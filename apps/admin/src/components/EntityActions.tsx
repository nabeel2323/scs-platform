'use client';

import { useRef, useState } from 'react';
import { AdminOrg, AdminRecord, adminRequest, PaginatedResult, RoleInfo } from '../lib/api';
import { useRequirePerms } from '../hooks/useRequirePerms';
import { useAdminResource } from '../hooks/useAdminTable';
import { ErrorNotice, RecordFields, textValue } from './RecordFields';
import { getUser } from '../lib/auth';
import styles from './management.module.css';

export function useAdminMutation(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  async function run(path: string, method: string, body?: unknown) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      await adminRequest(path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : 'Action failed'); }
    finally { pending.current = false; setBusy(false); }
  }
  return { run, busy, error };
}

export function UserStatusActions({ record, onDone }: { record: AdminRecord; onDone: () => void }) {
  const { hasAccess } = useRequirePerms(['admin:users:write']);
  const action = useAdminMutation(onDone);
  if (!hasAccess) return null;
  return <div><div className={styles['actions']}>
    {['ACTIVE', 'SUSPENDED', 'INACTIVE'].filter(status => status !== record['status']).map(status => <button key={status} type="button" disabled={action.busy}
      onClick={() => action.run(`admin/users/${record.id}`, 'PATCH', { status })}>{status === 'ACTIVE' ? 'Activate' : status === 'SUSPENDED' ? 'Suspend' : 'Deactivate'}</button>)}
  </div><ErrorNotice message={action.error} /></div>;
}

export const userDetailKeys = ['id', 'fullName', 'email', 'phone', 'locale', 'status', 'emailVerifiedAt', 'passwordSetAt', 'createdAt', 'updatedAt'];
export function UserMemberships({ record, onDone }: { record: AdminRecord; onDone: () => void }) {
  const { hasAccess } = useRequirePerms(['admin:users:write']);
  const [editing, setEditing] = useState(false);
  const [orgId, setOrgId] = useState('');
  const [roleId, setRoleId] = useState('');
  const roles = useAdminResource<RoleInfo[]>(editing ? 'admin/roles' : null, hasAccess);
  const orgs = useAdminResource<AdminOrg[]>(editing ? 'admin/organizations' : null, hasAccess);
  const action = useAdminMutation(() => { setEditing(false); onDone(); });
  const memberships = Array.isArray(record['organizations']) ? record['organizations'] as AdminRecord[] : [];
  return <section><h3>Organization memberships ({memberships.length})</h3>
    {memberships.map(membership => <div key={String(membership['orgId'])} className={styles['card']}>
      <RecordFields record={membership} />
      {hasAccess && <button type="button" disabled={action.busy} onClick={() => {
        if (window.confirm('Remove this membership?')) action.run(`admin/users/${record.id}/roles/${membership['orgId']}`, 'DELETE');
      }}>Remove membership</button>}
    </div>)}
    <ErrorNotice message={action.error} />
    {hasAccess && !editing && <button type="button" onClick={() => setEditing(true)}>Assign role</button>}
    {editing && <form className={styles['card']} onSubmit={event => { event.preventDefault(); if (orgId && roleId) action.run(`admin/users/${record.id}/assign-role`, 'POST', { orgId, roleId }); }}>
      <ErrorNotice message={roles.error} retry={roles.reload} /><ErrorNotice message={orgs.error} retry={orgs.reload} />
      <div className={styles['toolbar']}>
        <label>Organization<select value={orgId} required onChange={e => setOrgId(e.target.value)}><option value="">Select organization</option>
          {orgs.data?.map(org => <option key={org.id} value={org.id}>{org.name} ({org.type})</option>)}</select></label>
        <label>Role<select value={roleId} required onChange={e => setRoleId(e.target.value)}><option value="">Select role</option>
          {roles.data?.map(role => <option key={role.id} value={role.id}>{role.key} — {role.name}</option>)}</select></label>
      </div>
      {roleId && <p>Permissions: {roles.data?.find(role => role.id === roleId)?.permissions.join(', ') || 'None'}</p>}
      <div className={styles['actions']}><button disabled={action.busy || !orgId || !roleId}>Assign</button><button type="button" onClick={() => setEditing(false)}>Cancel</button></div>
    </form>}
  </section>;
}

const resolutions = [
  ['Full refund to buyer', 'REFUND_FULL'], ['Partial refund (50%)', 'REFUND_PARTIAL_50'],
  ['Partial refund (25%)', 'REFUND_PARTIAL_25'], ['No action — merchant prevails', 'NO_ACTION_MERCHANT'], ['Escalate to platform review', 'ESCALATE'],
];
export function DisputeActions({ record, onDone }: { record: AdminRecord; onDone: () => void }) {
  const { hasAccess } = useRequirePerms(['support:disputes:resolve']);
  const [resolution, setResolution] = useState('');
  const action = useAdminMutation(onDone);
  if (!hasAccess || ['RESOLVED', 'CLOSED'].includes(String(record['status']))) return null;
  return <form className={styles['card']} onSubmit={event => { event.preventDefault(); if (resolution.trim()) action.run(`disputes/${record.id}/resolve`, 'PATCH', { resolution: resolution.trim() }); }}>
    <h3>Resolve dispute</h3><div className={styles['toolbar']}><label>Decision template<select onChange={e => setResolution(e.target.value)} value={resolutions.some(([, code]) => code === resolution) ? resolution : ''}>
      <option value="">Custom decision</option>{resolutions.map(([label, value]) => <option key={value} value={value}>{label}</option>)}
    </select></label></div>
    <label>Resolution<textarea required maxLength={5000} value={resolution} onChange={e => setResolution(e.target.value)} /></label>
    <ErrorNotice message={action.error} /><button disabled={action.busy || !resolution.trim()}>Submit resolution</button>
  </form>;
}

export function CategoryEditor({ record, onDone, onCancel }: { record?: AdminRecord; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(String(record?.['name'] || ''));
  const [nameAr, setNameAr] = useState(String(record?.['nameAr'] || ''));
  const [parentId, setParentId] = useState(String(record?.['parentId'] || ''));
  const [isActive, setActive] = useState(record?.['isActive'] !== false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const { hasAccess } = useRequirePerms(['catalog:categories:write']);
  const params = new URLSearchParams({ search, limit: '20', offset: String(page * 20), sortBy: 'name', sortDir: 'asc',
    ...(record ? { excludeTreeId: record.id } : {}),
    ...(record?.['storeId'] ? { storeId: String(record['storeId']) } : { scope: 'global' }),
  });
  const parents = useAdminResource<PaginatedResult<AdminRecord>>(`admin/categories?${params}`, hasAccess);
  const action = useAdminMutation(onDone);
  if (!hasAccess) return null;
  const parentOptions = parents.data?.data || [];
  return <form onSubmit={event => {
    event.preventDefault(); if (!name.trim()) return;
    action.run(record ? `categories/${record.id}` : 'categories', record ? 'PATCH' : 'POST', {
      name: name.trim(), nameAr: nameAr.trim(), parentId: parentId || (record ? null : undefined), ...(record ? { isActive } : {}),
    });
  }}>
    <div className={styles['toolbar']}><label>Name (English)<input required maxLength={200} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Name (Arabic)<input dir="rtl" maxLength={200} value={nameAr} onChange={e => setNameAr(e.target.value)} /></label>
      {record && <label>Active<input type="checkbox" checked={isActive} onChange={e => setActive(e.target.checked)} /></label>}
    </div>
    <div className={styles['card']}><h3>Parent category</h3>
      <label>Find parent<input value={search} maxLength={200} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search all eligible categories" /></label>
      <ErrorNotice message={parents.error} retry={parents.reload} />
      <label>Parent<select value={parentId} onChange={e => setParentId(e.target.value)}>
        <option value="">None (root category)</option>
        {parentId && !parentOptions.some(option => option.id === parentId) && <option value={parentId}>{textValue(record?.['parentName'] || parentId)} (selected)</option>}
        {parentOptions.map(option => <option key={option.id} value={option.id}>{textValue(option['name'])} — {textValue(option['path'])}</option>)}
      </select></label>
      <div className={styles['toolbar']}><button type="button" disabled={page === 0 || parents.loading} onClick={() => setPage(p => p - 1)}>Previous parents</button>
        <span>Page {page + 1} · {parents.data?.total ?? 0} matches</span>
        <button type="button" disabled={parents.loading || (page + 1) * 20 >= (parents.data?.total ?? 0)} onClick={() => setPage(p => p + 1)}>More parents</button></div>
    </div>
    <ErrorNotice message={action.error} />
    <div className={styles['actions']}><button disabled={action.busy || !name.trim()}>Save category</button><button type="button" onClick={onCancel}>Cancel</button></div>
  </form>;
}

export function BrandEditor({ record, onDone, onCancel }: { record?: AdminRecord; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(String(record?.['name'] || ''));
  const [nameAr, setNameAr] = useState(String(record?.['nameAr'] || ''));
  const [logoUrl, setLogoUrl] = useState(String(record?.['logoUrl'] || ''));
  const [description, setDescription] = useState(String(record?.['description'] || ''));
  const [isActive, setActive] = useState(record?.['isActive'] !== false);
  const action = useAdminMutation(onDone);
  const { hasAccess } = useRequirePerms(['catalog:brands:manage']);
  if (!hasAccess) return null;
  return <form onSubmit={event => {
    event.preventDefault(); if (!name.trim()) return;
    const body: Record<string, unknown> = { name: name.trim(), nameAr: nameAr.trim() || undefined, logoUrl: logoUrl.trim() || undefined, description: description.trim() || undefined };
    if (record) body['isActive'] = isActive;
    action.run(record ? `brands/${record.id}` : 'brands', record ? 'PATCH' : 'POST', body);
  }}>
    <div className={styles['toolbar']}><label>Name (English)<input required maxLength={200} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Name (Arabic)<input dir="rtl" maxLength={200} value={nameAr} onChange={e => setNameAr(e.target.value)} /></label>
      {record && <label>Active<input type="checkbox" checked={isActive} onChange={e => setActive(e.target.checked)} /></label>}
    </div>
    <label>Logo URL<input type="url" maxLength={1000} value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." /></label>
    <label>Description<textarea maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /></label>
    <ErrorNotice message={action.error} />
    <div className={styles['actions']}><button disabled={action.busy || !name.trim()}>Save brand</button><button type="button" onClick={onCancel}>Cancel</button></div>
  </form>;
}

// ── PHASE 9: Offer governance row actions ──────────────────────

/**
 * Governance actions for merchant offers. Renders context-sensitive buttons
 * based on the offer's current status:
 * - PROPOSED → Approve / Reject
 * - ACTIVE   → Suspend
 * - SUSPENDED → Activate
 */
export function OfferGovernanceActions({ record, onDone }: { record: AdminRecord; onDone: () => void }) {
  const { hasAccess } = useRequirePerms(['catalog:offers:govern']);
  const action = useAdminMutation(onDone);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const status = String(record['status'] || '');

  if (!hasAccess) return null;

  const reviewerId = getUser()?.id || '';

  const approve = () => {
    if (!window.confirm('Approve this offer? It will become ACTIVE and visible to buyers.')) return;
    action.run(`admin/offers/${record.id}/approve`, 'POST', { reviewerId });
  };

  const submitReject = () => {
    if (!reason.trim()) return;
    action.run(`admin/offers/${record.id}/reject`, 'POST', { reviewerId, reason: reason.trim() });
    setRejecting(false);
    setReason('');
  };

  const suspend = () => {
    if (!window.confirm('Suspend this offer? It will no longer be visible to buyers.')) return;
    action.run(`admin/offers/${record.id}/suspend`, 'POST');
  };

  const activate = () => {
    if (!window.confirm('Reactivate this offer? It will become visible to buyers again.')) return;
    action.run(`admin/offers/${record.id}/activate`, 'POST');
  };

  return <div>
    <div className={styles['actions']}>
      {status === 'PROPOSED' && <>
        <button type="button" disabled={action.busy} onClick={approve}>Approve</button>
        <button type="button" disabled={action.busy} onClick={() => setRejecting(true)}>Reject</button>
      </>}
      {status === 'ACTIVE' && (
        <button type="button" disabled={action.busy} onClick={suspend}>Suspend</button>
      )}
      {status === 'SUSPENDED' && (
        <button type="button" disabled={action.busy} onClick={activate}>Activate</button>
      )}
    </div>
    {rejecting && (
      <form className={styles['card']} onSubmit={e => { e.preventDefault(); submitReject(); }}>
        <h3>Reject offer</h3>
        <label>Reason<textarea required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain why this offer is rejected…" /></label>
        <ErrorNotice message={action.error} />
        <div className={styles['actions']}>
          <button type="submit" disabled={action.busy || !reason.trim()}>Confirm rejection</button>
          <button type="button" onClick={() => { setRejecting(false); setReason(''); }}>Cancel</button>
        </div>
      </form>
    )}
    <ErrorNotice message={action.error} />
  </div>;
}
