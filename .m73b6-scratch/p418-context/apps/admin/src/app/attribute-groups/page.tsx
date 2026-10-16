'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AttributeGroup, AttributeDefinition,
  fetchAttributeGroups, createAttributeGroup, fetchAttributes,
} from '../../lib/api';
import { useRequirePerms, AccessDenied } from '../../hooks/useRequirePerms';
import { SkeletonTable } from '@scs/ui-kit';
import DetailDialog from '../../components/DetailDialog';
import styles from '../../components/management.module.css';

/* ── Page ──────────────────────────────────────────────────── */

export default function AttributeGroupsPage() {
  const { hasAccess, missingPerms } = useRequirePerms(['catalog:attributes:manage']);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const [groups, setGroups] = useState<AttributeGroup[]>([]);
  const [attrs, setAttrs] = useState<AttributeDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dialogs
  const [creating, setCreating] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<AttributeGroup | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [groupData, attrData] = await Promise.all([
        fetchAttributeGroups(),
        fetchAttributes(),
      ]);
      setGroups(groupData);
      setAttrs(attrData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (ready && hasAccess) load(); }, [ready, hasAccess, load]);

  // Count attributes per group (via metadata or simple heuristic)
  const attrCountByGroup = useCallback((groupId: string) => {
    // The attribute definitions don't carry a groupId directly in the current schema;
    // productTypeAttributes link attributes to groups. We show total attributes for now.
    return attrs.length;
  }, [attrs]);

  if (!ready) return <p style={{ padding: 32 }}>Loading…</p>;
  if (!hasAccess) return <AccessDenied requiredPerms={['catalog:attributes:manage']} missingPerms={missingPerms} />;

  return (
    <div className={styles['shell']}>
      <header className={styles['header']}>
        <h1>Attribute Groups</h1>
        <p>{groups.length} group{groups.length !== 1 ? 's' : ''} — organize attributes into logical sections for product type builders</p>
      </header>

      <div className={styles['content']}>
        <div className={styles['toolbar']}>
          <button type="button" onClick={load}>Refresh</button>
          <button type="button" onClick={() => setCreating(true)}>Create group</button>
        </div>

        {error && <div className={styles['error']}>{error} <button type="button" onClick={load} style={{ marginLeft: 8 }}>Retry</button></div>}
        {loading ? <SkeletonTable rows={4} cols={5} /> : (
          <div className={styles['tableWrap']}>
            <table>
              <caption style={{ textAlign: 'left', padding: 12 }}>Attribute Groups — {groups.length} results</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Name (Arabic)</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Created</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(group => (
                  <tr key={group.id} onClick={e => {
                    if (e.target instanceof Element && !e.target.closest('button,a,input,select')) {
                      setSelectedGroup(group);
                    }
                  }}>
                    <td style={{ fontWeight: 600 }}>{group.name}</td>
                    <td dir="rtl">{group.nameAr ?? '—'}</td>
                    <td>{group.kind ?? '—'}</td>
                    <td><time dateTime={group.createdAt}>{new Date(group.createdAt).toLocaleDateString()}</time></td>
                    <td>
                      <div className={styles['actions']}>
                        <button type="button" onClick={() => setSelectedGroup(group)}>View</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!groups.length && <tr><td colSpan={5}>No attribute groups found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* Create dialog */}
        {creating && (
          <DetailDialog title="New Attribute Group" onClose={() => setCreating(false)}>
            <GroupForm
              onDone={() => { setCreating(false); load(); }}
              onCancel={() => setCreating(false)}
            />
          </DetailDialog>
        )}

        {/* Detail dialog */}
        {selectedGroup && (
          <DetailDialog title={`Group — ${selectedGroup.name}`} onClose={() => setSelectedGroup(null)}>
            <GroupDetail group={selectedGroup} attributes={attrs} />
          </DetailDialog>
        )}
      </div>
    </div>
  );
}

/* ── Group Form ────────────────────────────────────────────── */

function GroupForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [kind, setKind] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) { setFormError('Name is required'); return; }
    setBusy(true);
    setFormError(null);
    try {
      await createAttributeGroup({
        name: name.trim(),
        nameAr: nameAr || undefined,
        kind: kind || undefined,
      });
      onDone();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Failed to create group');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {formError && <div className={styles['error']}>{formError}</div>}
      <div className={styles['fields']}>
        <div>
          <dt>Name *</dt>
          <dd><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Hardware Specifications" maxLength={200} /></dd>
        </div>
        <div>
          <dt>Name (Arabic)</dt>
          <dd><input value={nameAr} onChange={e => setNameAr(e.target.value)} dir="rtl" placeholder="مثال: مواصفات الأجهزة" maxLength={200} /></dd>
        </div>
        <div>
          <dt>Kind</dt>
          <dd>
            <input value={kind} onChange={e => setKind(e.target.value)} placeholder="e.g. SPECIFICATION, PHYSICAL" maxLength={100} />
            <small className={styles['muted']}>Optional category hint for the group.</small>
          </dd>
        </div>
      </div>
      <div className={styles['actions']} style={{ marginTop: 20 }}>
        <button type="button" disabled={busy} onClick={handleSave}>
          {busy ? 'Creating…' : 'Create Group'}
        </button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ── Group Detail ──────────────────────────────────────────── */

function GroupDetail({ group, attributes }: { group: AttributeGroup; attributes: AttributeDefinition[] }) {
  return (
    <div>
      <div className={styles['fields']}>
        <div>
          <dt>ID</dt>
          <dd><code style={{ fontSize: 12 }}>{group.id}</code></dd>
        </div>
        <div>
          <dt>Name</dt>
          <dd>{group.name}</dd>
        </div>
        <div>
          <dt>Name (Arabic)</dt>
          <dd dir="rtl">{group.nameAr ?? '—'}</dd>
        </div>
        <div>
          <dt>Kind</dt>
          <dd>{group.kind ?? '—'}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd><time dateTime={group.createdAt}>{new Date(group.createdAt).toLocaleString()}</time></dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd><time dateTime={group.updatedAt}>{new Date(group.updatedAt).toLocaleString()}</time></dd>
        </div>
      </div>

      <h3 style={{ margin: '20px 0 12px', fontSize: 14, fontWeight: 600 }}>
        All Attributes ({attributes.length})
      </h3>
      <p style={{ fontSize: 12, color: '#5b6b74', marginBottom: 12 }}>
        Attributes are assigned to groups when configuring a Product Type via the Product Type Builder.
      </p>
      {attributes.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {attributes.map(attr => (
            <span key={attr.id} style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 6,
              background: '#e0f2fe', color: '#0369a1', fontWeight: 500,
            }}>
              {attr.name} <small style={{ opacity: 0.7 }}>({attr.code})</small>
            </span>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: '#5b6b74' }}>No attributes defined yet.</p>
      )}
    </div>
  );
}
