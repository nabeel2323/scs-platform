'use client';

import { useCallback, useEffect, useState } from 'react';
import { UPDATE_REQUEST_STATUS_LABELS } from '@scs/contracts';
import { AccessDenied, useRequirePerms } from '../../hooks/useRequirePerms';
import { getUser } from '../../lib/auth';
import {
  fetchAdminOrganizations,
  deactivateAdminOrganization,
  fetchAdminOrgUpdateRequests,
  reviewOrgUpdateRequest,
  fetchAdminOrganizationDetail,
  type AdminOrg,
  type AdminOrgDetail,
  type AdminOrgUpdateRequest,
} from '../../lib/api';

/**
 * Organizations management page (G13).
 *
 * Lists all organizations with their verification and active/deactivated
 * status, and lets admins with `admin:users:write` deactivate (soft-delete)
 * or reactivate a merchant organization — previously only reachable through
 * a verification request detail page. Also hosts the review queue for
 * merchant-submitted organization update requests (G5).
 */
export default function OrganizationsPage() {
  const { hasAccess, missingPerms } = useRequirePerms(['admin:users:read']);
  const adminUser = getUser();
  const canManage = (adminUser?.perms ?? []).includes('admin:users:write');

  const [ready, setReady] = useState(false);
  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<{ org: AdminOrg; next: boolean } | null>(null);
  const [working, setWorking] = useState(false);

  // Organization update requests (G5)
  const [updateReqs, setUpdateReqs] = useState<AdminOrgUpdateRequest[]>([]);
  const [reqFilter, setReqFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [reviewTarget, setReviewTarget] = useState<{ req: AdminOrgUpdateRequest; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  // Organization detail panel
  const [detailOrg, setDetailOrg] = useState<AdminOrgDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => setReady(true), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgRows, reqRows] = await Promise.all([
        fetchAdminOrganizations(),
        fetchAdminOrgUpdateRequests(),
      ]);
      setOrgs(orgRows);
      setUpdateReqs(reqRows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready && hasAccess) void load();
  }, [ready, hasAccess, load]);

  async function confirmToggle() {
    if (!confirmTarget) return;
    setWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await deactivateAdminOrganization(confirmTarget.org.id, confirmTarget.next);
      setOrgs(prev => prev.map(o =>
        o.id === confirmTarget.org.id ? { ...o, isActive: confirmTarget.next } : o,
      ));
      setSuccess(
        `${confirmTarget.org.name} ${confirmTarget.next ? 'reactivated' : 'deactivated'} successfully.`,
      );
      setConfirmTarget(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update organization status');
    } finally {
      setWorking(false);
    }
  }

  async function confirmReview() {
    if (!reviewTarget) return;
    setWorking(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await reviewOrgUpdateRequest(
        reviewTarget.req.id,
        reviewTarget.decision,
        reviewNotes.trim() || undefined,
      );
      setUpdateReqs(prev => prev.map(r => (r.id === updated.id ? { ...r, ...updated } : r)));
      setSuccess(
        `Update request for ${reviewTarget.req.orgName ?? 'organization'} ${reviewTarget.decision.toLowerCase()}.`,
      );
      setReviewTarget(null);
      setReviewNotes('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to review update request');
    } finally {
      setWorking(false);
    }
  }

  if (!ready) return <p>Loading…</p>;
  if (!hasAccess) return <AccessDenied requiredPerms={['admin:users:read']} missingPerms={missingPerms} />;

  const filtered = search.trim()
    ? orgs.filter(o =>
        o.name.toLowerCase().includes(search.trim().toLowerCase()) ||
        o.type.toLowerCase().includes(search.trim().toLowerCase()))
    : orgs;
  const deactivatedCount = orgs.filter(o => !o.isActive).length;
  const pendingReqCount = updateReqs.filter(r => r.status === 'PENDING').length;
  const visibleReqs = reqFilter === 'PENDING' ? updateReqs.filter(r => r.status === 'PENDING') : updateReqs;

  return (
    <>
      {/* Header Banner */}
      <div style={{ background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)', padding: '32px 40px 28px', color: '#fff' }}>
        <div style={{ maxWidth: 1320 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Organizations</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>
            {orgs.length} organizations · {deactivatedCount} deactivated
          </p>
        </div>
      </div>

      <div style={{ padding: '28px 40px 48px', maxWidth: 1320 }}>
        {error && (
          <div style={{ padding: '10px 16px', background: '#ffebee', color: '#c62828', borderRadius: 8, marginBottom: 16 }}>
            {error}
          </div>
        )}
        {success && <p role="status" style={{ padding: 16, background: '#e8f5e9', color: '#256029', borderRadius: 8 }}>{success}</p>}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or type…"
            aria-label="Search organizations"
            style={{ flex: 1, maxWidth: 360, padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13 }}
          />
          <button onClick={() => void load()} style={ghostBtn}>Refresh</button>
        </div>

        {loading ? (
          <p style={{ color: '#5b6b74' }}>Loading organizations…</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: '#8a9ba5', fontSize: 14 }}>No organizations found.</p>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)' }}>
                  <th style={th}>Organization</th>
                  <th style={th}>Legal Name</th>
                  <th style={th}>Type</th>
                  <th style={th}>Country</th>
                  <th style={th}>Verification</th>
                  <th style={th}>Status</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(org => (
                  <tr key={org.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: '#0f3340' }}>{org.name}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{org.id}</div>
                    </td>
                    <td style={{ ...td, fontSize: 12, color: '#5b6b74' }}>{org.legalName || '—'}</td>
                    <td style={td}><span style={chip}>{ORG_TYPE_LABELS[org.type] || org.type}</span></td>
                    <td style={td}>{org.country || '—'}</td>
                    <td style={td}>
                      <span style={{
                        padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                        background: org.verificationStatus === 'VERIFIED' ? '#e8f5e9' : org.verificationStatus === 'REJECTED' ? '#ffebee' : '#fff8e1',
                        color: org.verificationStatus === 'VERIFIED' ? '#2e7d32' : org.verificationStatus === 'REJECTED' ? '#c62828' : '#8a6d00',
                      }}>
                        {org.verificationStatus}
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{
                        padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                        background: org.isActive ? '#d1fae5' : '#fef2f2',
                        color: org.isActive ? '#065f46' : '#991b1b',
                        border: `1px solid ${org.isActive ? '#6ee7b7' : '#fca5a5'}`,
                      }}>
                        {org.isActive ? 'ACTIVE' : 'DEACTIVATED'}
                      </span>
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          onClick={async () => {
                            setDetailLoading(true);
                            setDetailOrg(null);
                            try { setDetailOrg(await fetchAdminOrganizationDetail(org.id)); }
                            catch { /* handled by null check */ }
                            finally { setDetailLoading(false); }
                          }}
                          style={viewBtn}
                          aria-label={`View details for ${org.name}`}
                        >
                          View Details
                        </button>
                        {canManage && (
                          <button
                            onClick={() => setConfirmTarget({ org, next: !org.isActive })}
                            style={org.isActive ? dangerBtn : activateBtn}
                            aria-label={`${org.isActive ? 'Deactivate' : 'Reactivate'} ${org.name}`}
                          >
                            {org.isActive ? 'Deactivate' : 'Reactivate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Organization update requests (G5) */}
        <div style={{ marginTop: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f3340', margin: 0 }}>Update Requests</h2>
            {pendingReqCount > 0 && (
              <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#92400e' }}>
                {pendingReqCount} pending
              </span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {(['PENDING', 'ALL'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setReqFilter(f)}
                  style={{
                    padding: '4px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                    background: reqFilter === f ? '#0f3340' : '#fff',
                    color: reqFilter === f ? '#fff' : '#5b6b74',
                    border: '1px solid #d9e2e6',
                  }}
                >
                  {f === 'PENDING' ? 'Pending' : 'All'}
                </button>
              ))}
            </div>
          </div>
      
          {visibleReqs.length === 0 ? (
            <p style={{ color: '#8a9ba5', fontSize: 14 }}>No update requests{reqFilter === 'PENDING' ? ' pending review' : ''}.</p>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)' }}>
                    <th style={th}>Submitted</th>
                    <th style={th}>Organization</th>
                    <th style={th}>Proposed Changes</th>
                    <th style={th}>Status</th>
                    <th style={th}>Decision</th>
                    {canManage && <th style={th}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {visibleReqs.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ ...td, color: '#5b6b74', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ ...td, fontWeight: 600, color: '#0f3340' }}>{r.orgName ?? '—'}</td>
                      <td style={{ ...td, fontSize: 12 }}>{summarizePayload(r.payload)}</td>
                      <td style={td}>
                        <span style={{
                          padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                          background: r.status === 'PENDING' ? '#fef3c7' : r.status === 'APPROVED' ? '#d1fae5' : '#fee2e2',
                          color: r.status === 'PENDING' ? '#92400e' : r.status === 'APPROVED' ? '#065f46' : '#991b1b',
                        }}>
                          {UPDATE_REQUEST_STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      </td>
                      <td style={{ ...td, fontSize: 12, color: '#5b6b74' }}>
                        {r.decisionNotes
                          ? <span style={{ fontStyle: 'italic' }}>“{r.decisionNotes}”</span>
                          : r.decidedAt ? new Date(r.decidedAt).toLocaleDateString() : '—'}
                      </td>
                      {canManage && (
                        <td style={td}>
                          {r.status === 'PENDING' ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => { setReviewNotes(''); setReviewTarget({ req: r, decision: 'APPROVED' }); }}
                                style={activateBtn}
                                aria-label={`Approve update request for ${r.orgName ?? 'organization'}`}
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => { setReviewNotes(''); setReviewTarget({ req: r, decision: 'REJECTED' }); }}
                                style={dangerBtn}
                                aria-label={`Reject update request for ${r.orgName ?? 'organization'}`}
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!canManage && pendingReqCount > 0 && (
            <p style={{ fontSize: 12, color: '#8a9ba5', marginTop: 8 }}>
              Reviewing update requests requires the <code>admin:users:write</code> permission.
            </p>
          )}
        </div>
      </div>

      {/* Confirmation modal */}
      {confirmTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,51,64,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 440, boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', margin: '0 0 8px' }}>
              {confirmTarget.next ? 'Reactivate Organization' : 'Deactivate Organization'}
            </h3>
            <p style={{ fontSize: 13, color: '#5b6b74', marginBottom: 20, lineHeight: 1.5 }}>
              {confirmTarget.next
                ? <>Reactivate <strong style={{ color: '#0f3340' }}>{confirmTarget.org.name}</strong>? The merchant will regain full platform write access.</>
                : <>Deactivate <strong style={{ color: '#0f3340' }}>{confirmTarget.org.name}</strong>? The merchant will immediately lose write access to stores, catalog, documents and verification. Data is preserved and can be restored by reactivating.</>}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmTarget(null)} disabled={working} style={ghostBtn}>Cancel</button>
              <button
                onClick={() => void confirmToggle()}
                disabled={working}
                style={confirmTarget.next ? activateBtn : dangerBtn}
              >
                {working ? 'Working…' : confirmTarget.next ? 'Reactivate' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update request review modal */}
      {reviewTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,51,64,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 480, boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', margin: '0 0 8px' }}>
              {reviewTarget.decision === 'APPROVED' ? 'Approve' : 'Reject'} Update Request
            </h3>
            <p style={{ fontSize: 13, color: '#5b6b74', marginBottom: 12, lineHeight: 1.5 }}>
              {reviewTarget.decision === 'APPROVED'
                ? <>Apply these changes to <strong style={{ color: '#0f3340' }}>{reviewTarget.req.orgName ?? 'the organization'}</strong>? The organization record is updated immediately.</>
                : <>Reject this request from <strong style={{ color: '#0f3340' }}>{reviewTarget.req.orgName ?? 'the organization'}</strong>? The proposed changes are discarded and the merchant can submit a new request.</>}
            </p>
            <div style={{ background: '#f7f9fa', border: '1px solid #d9e2e6', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#1e2d35', marginBottom: 12 }}>
              {summarizePayload(reviewTarget.req.payload)}
            </div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5b6b74', marginBottom: 12 }}>
              Notes for the merchant (optional)
              <textarea
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={reviewTarget.decision === 'REJECTED' ? 'Explain why the request was rejected…' : 'Optional notes…'}
                style={{ marginTop: 4, width: '100%', padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setReviewTarget(null); setReviewNotes(''); }} disabled={working} style={ghostBtn}>Cancel</button>
              <button
                onClick={() => void confirmReview()}
                disabled={working}
                style={reviewTarget.decision === 'APPROVED' ? { ...activateBtn, padding: '8px 16px' } : { ...dangerBtn, padding: '8px 16px' }}
              >
                {working ? 'Working…' : reviewTarget.decision === 'APPROVED' ? 'Approve & Apply' : 'Reject Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Organization detail panel */}
      {(detailOrg || detailLoading) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,51,64,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 0, width: '100%', maxWidth: 780, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            {detailLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#5b6b74' }}>Loading organization details…</div>
            ) : detailOrg ? (
              <>
                {/* Header */}
                <div style={{ background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)', padding: '20px 24px', color: '#fff', borderRadius: '12px 12px 0 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{detailOrg.name}</h2>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '4px 0 0' }}>
                        {detailOrg.legalName || detailOrg.name} · {detailOrg.country}
                      </p>
                    </div>
                    <button onClick={() => setDetailOrg(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 20, cursor: 'pointer', padding: '0 4px' }}>✕</button>
                  </div>
                </div>

                <div style={{ padding: '20px 24px 24px' }}>
                  {/* Business Details */}
                  <h3 style={detailSectionTitle}>Business Details</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
                    <DetailField label="Organization Name" value={detailOrg.name} />
                    <DetailField label="Legal Name" value={detailOrg.legalName || '—'} />
                    <DetailField label="Tax ID" value={detailOrg.taxId || '—'} mono />
                    <DetailField label="Business Type" value={ORG_TYPE_LABELS[detailOrg.type] || detailOrg.type} />
                    <DetailField label="Country" value={detailOrg.country} />
                    <DetailField label="Verification" value={detailOrg.verificationStatus} />
                    <DetailField label="Status" value={detailOrg.isActive ? 'Active' : 'Deactivated'} />
                    <DetailField label="Invite Code" value={detailOrg.inviteCode || '—'} mono />
                    <DetailField label="Registered" value={new Date(detailOrg.createdAt).toLocaleDateString()} />
                  </div>

                  {/* Stores */}
                  <h3 style={detailSectionTitle}>Stores ({detailOrg.stores.length})</h3>
                  {detailOrg.stores.length === 0 ? <p style={noData}>No stores registered</p> : (
                    <div style={{ marginBottom: 20 }}>
                      {detailOrg.stores.map(s => {
                        const addr = (s.address || {}) as Record<string, unknown>;
                        return (
                          <div key={s.id} style={{ background: '#f7f9fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                            <div style={{ fontWeight: 600, color: '#0f3340', fontSize: 13 }}>{s.displayName}</div>
                            <div style={{ fontSize: 11, color: '#5b6b74', marginTop: 4 }}>
                              {s.currency} · {s.locale} · {s.verificationStatus}
                              {String(addr['city'] ?? '') ? ` · ${String(addr['city'])}` : ''}
                            </div>
                            {s.description && <div style={{ fontSize: 11, color: '#8a9ba5', marginTop: 2 }}>{s.description}</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Warehouses */}
                  <h3 style={detailSectionTitle}>Warehouses ({detailOrg.warehouses.length})</h3>
                  {detailOrg.warehouses.length === 0 ? <p style={noData}>No warehouses configured</p> : (
                    <div style={{ marginBottom: 20 }}>
                      {detailOrg.warehouses.map(w => {
                        const addr = (w.address || {}) as Record<string, unknown>;
                        return (
                          <div key={w.id} style={{ background: '#f7f9fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                            <div style={{ fontWeight: 600, color: '#0f3340', fontSize: 13 }}>{w.name}{String(addr['city'] ?? '') ? ` — ${String(addr['city'])}` : ''}</div>
                            <div style={{ fontSize: 11, color: '#5b6b74', marginTop: 2 }}>
                              {w.managerName || 'No manager'}{w.managerPhone ? ` · ${w.managerPhone}` : ''} · {w.status}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Documents */}
                  <h3 style={detailSectionTitle}>Documents ({detailOrg.documents.length})</h3>
                  {detailOrg.documents.length === 0 ? <p style={noData}>No documents uploaded</p> : (
                    <div style={{ marginBottom: 20 }}>
                      {detailOrg.documents.map(d => (
                        <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f2f4' }}>
                          <div>
                            <div style={{ fontWeight: 500, color: '#0f3340', fontSize: 13 }}>{d.fileName}</div>
                            <div style={{ fontSize: 11, color: '#8a9ba5' }}>{d.docType?.replace(/_/g, ' ') || '—'} · {(d.fileSize / 1024).toFixed(1)} KB</div>
                          </div>
                          <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: d.verificationStatus === 'VERIFIED' || d.verificationStatus === 'APPROVED' ? '#d1fae5' : '#fef3c7', color: d.verificationStatus === 'VERIFIED' || d.verificationStatus === 'APPROVED' ? '#065f46' : '#92400e' }}>
                            {d.verificationStatus}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Members */}
                  <h3 style={detailSectionTitle}>Members ({detailOrg.members.length})</h3>
                  {detailOrg.members.length === 0 ? <p style={noData}>No members</p> : (
                    <div>
                      {detailOrg.members.map(m => (
                        <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f2f4' }}>
                          <div>
                            <div style={{ fontWeight: 500, color: '#0f3340', fontSize: 13 }}>{m.user.fullName || 'Unknown'}</div>
                            <div style={{ fontSize: 11, color: '#8a9ba5' }}>{m.user.phone}{m.user.email ? ` · ${m.user.email}` : ''}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#4a5568' }}>{m.role.name}</div>
                            <div style={{ fontSize: 10, color: '#9ca3af' }}>{m.status} · {new Date(m.createdAt).toLocaleDateString()}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#8a9ba5', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#0f3340', fontFamily: mono ? 'monospace' : undefined }}>{value}</div>
    </div>
  );
}

function summarizePayload(p: { name?: string; legalName?: string; taxId?: string }): string {
  const parts: string[] = [];
  if (p.name !== undefined) parts.push(`Name: ${p.name || '—'}`);
  if (p.legalName !== undefined) parts.push(`Legal: ${p.legalName || '—'}`);
  if (p.taxId !== undefined) parts.push(`Tax ID: ${p.taxId || '—'}`);
  return parts.join(' · ') || '—';
}

const th: React.CSSProperties = { textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' };
const td: React.CSSProperties = { padding: '12px 16px', color: '#1e2d35', fontSize: 13 };
const chip: React.CSSProperties = { display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: '#edf2f7', color: '#4a5568' };
const ghostBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#fff', color: '#5b6b74', border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer' };
const dangerBtn: React.CSSProperties = { padding: '5px 12px', fontSize: 12, fontWeight: 600, background: '#fff', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer' };
const activateBtn: React.CSSProperties = { padding: '5px 12px', fontSize: 12, fontWeight: 600, background: '#fff', color: '#065f46', border: '1px solid #6ee7b7', borderRadius: 4, cursor: 'pointer' };
const viewBtn: React.CSSProperties = { padding: '5px 12px', fontSize: 12, fontWeight: 600, background: '#eef4f6', color: '#0f3340', border: '1px solid #b8d4e3', borderRadius: 4, cursor: 'pointer' };
const detailSectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: '#0f3340', marginBottom: 10, marginTop: 16, paddingBottom: 6, borderBottom: '1px solid #e2e8f0' };
const noData: React.CSSProperties = { fontSize: 12, color: '#8a9ba5', fontStyle: 'italic', padding: '8px 0' };
const ORG_TYPE_LABELS: Record<string, string> = { WHOLESALER: 'Wholesaler', RETAILER: 'Retailer', LOGISTICS: 'Logistics Provider' };
