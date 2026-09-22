'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  fetchProfile, fetchOrganization, updateOrganization,
  fetchOrgMembers, addOrgMember, removeOrgMember,
  lookupOrgMember, fetchRoles, fetchOrgDocuments, presignDocumentDownload,
  fetchOrgVerifications, submitOrgUpdateRequest, fetchOrgUpdateRequests,
  Organization, OrgMember, UserLookupResult, RoleInfo, BusinessDocument, VerificationRequestInfo, OrgUpdateRequest,
} from '../../../lib/api';
import { hasPerm } from '../../../lib/auth';
import { DOCUMENT_STATUS_LABELS, UPDATE_REQUEST_STATUS_LABELS } from '@scs/contracts';
import { LoadingSpinner, ErrorBanner, EmptyState, StatusBadge, formatDate } from '../../../components/Shared';

export default function MerchantOrganizationPage() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [noOrg, setNoOrg] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  // Editable fields
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [taxId, setTaxId] = useState('');

  // Members
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newRoleId, setNewRoleId] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResults, setLookupResults] = useState<UserLookupResult[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserLookupResult | null>(null);

  // Documents
  const [documents, setDocuments] = useState<BusinessDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState('');
  const [downloadingDoc, setDownloadingDoc] = useState<string | null>(null);

  // Verification history (admin correction feedback)
  const [verifications, setVerifications] = useState<VerificationRequestInfo[]>([]);
  const [membersError, setMembersError] = useState('');

  // Update requests (admin approval workflow for verified orgs)
  const [updateRequests, setUpdateRequests] = useState<OrgUpdateRequest[]>([]);

  // Remove member confirmation
  const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null);
  const [removingMember, setRemovingMember] = useState(false);

  // Invite code copy
  const [copied, setCopied] = useState(false);

  const populate = useCallback((o: Organization) => {
    setOrg(o);
    setName(o.name || '');
    setLegalName(o.legalName || '');
    setTaxId(o.taxId || '');
  }, []);

  const loadMembers = useCallback(async (orgId: string) => {
    try { setMembers(await fetchOrgMembers(orgId)); setMembersError(''); }
    catch (err: any) { setMembersError(err.message || 'Failed to load members'); }
  }, []);

  const loadDocuments = useCallback(async (orgId: string) => {
    setDocsLoading(true);
    try { setDocuments(await fetchOrgDocuments(orgId)); setDocsError(''); }
    catch (err: any) { setDocsError(err.message || 'Failed to load documents'); }
    finally { setDocsLoading(false); }
  }, []);

  const loadVerifications = useCallback(async (orgId: string) => {
    try { setVerifications(await fetchOrgVerifications(orgId)); } catch { /* non-fatal */ }
  }, []);

  const loadUpdateRequests = useCallback(async (orgId: string) => {
    try { setUpdateRequests(await fetchOrgUpdateRequests(orgId)); } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const profile = await fetchProfile();
        let orgId = profile.activeOrgId;
        if (!orgId) orgId = profile.organizations?.[0]?.id ?? null;
        if (!orgId) { setNoOrg(true); return; }
        const fromProfile = profile.organizations?.find(o => o.id === orgId);
        const full = fromProfile ? (fromProfile as Organization) : await fetchOrganization(orgId);
        populate(full);
        await loadMembers(full.id);
        await loadDocuments(full.id);
        await loadVerifications(full.id);
        await loadUpdateRequests(full.id);
      } catch (err: any) {
        setError(err.message || 'Failed to load organization');
      } finally { setLoading(false); }
    })();
  }, [populate, loadMembers, loadDocuments, loadVerifications, loadUpdateRequests]);

  useEffect(() => {
    if (addOpen && roles.length === 0) {
      fetchRoles().then(setRoles).catch(() => {});
    }
  }, [addOpen, roles.length]);

  const handleSave = async () => {
    if (!org) return;
    if (!name.trim()) { setError('Organization name is required'); return; }
    setSaving(true);
    setError('');
    setSavedMsg('');
    try {
      const updated = await updateOrganization(org.id, {
        name: name.trim(),
        legalName: legalName.trim() || undefined,
        taxId: taxId.trim() || undefined,
      });
      populate(updated);
      setSavedMsg('Organization details updated successfully');
      setTimeout(() => setSavedMsg(''), 4000);
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally { setSaving(false); }
  };

  // Verified orgs cannot edit legal details directly — changes go through an
  // admin-approved update request (G5).
  const handleSubmitUpdateRequest = async () => {
    if (!org) return;
    if (!name.trim()) { setError('Organization name is required'); return; }
    setSaving(true);
    setError('');
    setSavedMsg('');
    try {
      await submitOrgUpdateRequest(org.id, {
        name: name.trim(),
        legalName: legalName.trim() || undefined,
        taxId: taxId.trim() || undefined,
      });
      await loadUpdateRequests(org.id);
      setSavedMsg('Update request submitted — it will take effect once an admin approves it');
      setTimeout(() => setSavedMsg(''), 6000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit update request');
    } finally { setSaving(false); }
  };

  const handleAddMember = async () => {
    if (!org || !newUserId.trim() || !newRoleId.trim()) return;
    setAddingMember(true);
    setError('');
    try {
      await addOrgMember(org.id, newUserId.trim(), newRoleId.trim());
      setNewUserId(''); setNewRoleId(''); setAddOpen(false);
      setLookupQuery(''); setLookupResults([]); setSelectedUser(null);
      await loadMembers(org.id);
    } catch (err: any) {
      setError(err.message || 'Add member failed');
    } finally { setAddingMember(false); }
  };

  const handleLookup = async () => {
    if (!org || !lookupQuery.trim() || lookupQuery.trim().length < 3) return;
    setLookingUp(true);
    try {
      const results = await lookupOrgMember(org.id, lookupQuery.trim());
      setLookupResults(results);
    } catch (err: any) {
      setError(err.message || 'Lookup failed');
    } finally { setLookingUp(false); }
  };

  const handleSelectUser = (user: UserLookupResult) => {
    setSelectedUser(user);
    setNewUserId(user.id);
    setLookupResults([]);
    setLookupQuery('');
  };

  const confirmRemoveMember = async () => {
    if (!org || !removeTarget) return;
    setRemovingMember(true);
    setError('');
    try {
      await removeOrgMember(org.id, removeTarget.userId);
      setRemoveTarget(null);
      await loadMembers(org.id);
    } catch (err: any) {
      setError(err.message || 'Remove member failed');
    } finally { setRemovingMember(false); }
  };

  const handleCopyInvite = () => {
    if (!org?.inviteCode) return;
    navigator.clipboard.writeText(org.inviteCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = async (docId: string) => {
    setDownloadingDoc(docId);
    setError('');
    try {
      const url = await presignDocumentDownload(docId);
      window.open(url, '_blank', 'noopener');
    } catch (err: any) {
      setError(err.message || 'Failed to download document');
    } finally {
      setDownloadingDoc(null);
    }
  };

  const canEdit = hasPerm('identity:organizations:write');

  const fmtSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const docStatusLabel = (s: string) => DOCUMENT_STATUS_LABELS[s] || s.replace(/_/g, ' ');

  // Latest verification request drives the correction banner (G8): admins
  // return REVISION/REJECTED with notes the merchant must be able to see.
  const latestVerification = verifications[0];
  const needsCorrection = latestVerification &&
    (latestVerification.status === 'REVISION' || latestVerification.status === 'REJECTED');

  const isVerified = org?.verificationStatus === 'VERIFIED';
  const pendingUpdate = updateRequests.find(r => r.status === 'PENDING');

  if (loading) return <LoadingSpinner />;

  if (noOrg || !org) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
        <nav style={breadcrumb}><Link href="/" style={crumbLink}>Home</Link> <span style={crumbSep}>›</span> <span>Organization</span></nav>
        <h1 style={h1}>Organization</h1>
        <EmptyState
          title="No organization yet"
          description="Register a business organization to get started."
          action={<Link href="/merchant/register" style={primaryLink}>Register Organization</Link>}
        />
      </div>
    );
  }

  return (
    <>
      <style>{`
        .tbl-row { transition: background 0.15s ease; }
        .tbl-row:hover { background: #e6f0f5 !important; }
        .tbl-row:nth-child(even) { background: #f8fafb; }
        .tbl-row:nth-child(even):hover { background: #e6f0f5 !important; }
        .metric-card { transition: box-shadow 0.2s ease; }
        .metric-card:hover { box-shadow: 0 4px 16px rgba(15,51,64,0.10) !important; }
        .quick-link { transition: all 0.15s ease; }
        .quick-link:hover { background: #e6f0f5 !important; border-color: #1e6178 !important; }
      `}</style>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <nav style={breadcrumb}>
          <Link href="/" style={crumbLink}>Home</Link>
          <span style={crumbSep}>›</span>
          <span style={{ color: '#0f3340', fontWeight: 500 }}>Organization</span>
        </nav>

        {/* Header Banner */}
        <div style={{ background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)', padding: '28px 28px 24px', color: '#fff', borderRadius: '12px 12px 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>{org.name}</h1>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>
                {org.legalName || org.name} · {org.country}
              </p>
            </div>
            <StatusBadge status={org.verificationStatus} />
          </div>
        </div>

        <div style={{ padding: '0 28px 48px', background: '#f5f7f9', minHeight: 400 }}>

          {/* Deactivation warning */}
          {org.isActive === false && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', marginTop: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>⚠</span>
              <div>
                <div style={{ fontWeight: 600, color: '#991b1b', fontSize: 14 }}>Organization Deactivated</div>
                <div style={{ fontSize: 12, color: '#7f1d1d', marginTop: 2 }}>Your organization has been deactivated by an administrator. Store, catalog, document and verification actions are blocked until it is reactivated. Contact support for assistance.</div>
              </div>
            </div>
          )}

          {/* Correction requested / rejection banner (admin review feedback) */}
          {needsCorrection && latestVerification && (
            <div style={{
              background: latestVerification.status === 'REJECTED' ? '#fef2f2' : '#fffbeb',
              border: `1px solid ${latestVerification.status === 'REJECTED' ? '#fca5a5' : '#fcd34d'}`,
              borderRadius: 8, padding: '12px 16px', marginTop: org.isActive === false ? 12 : 20,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>{latestVerification.status === 'REJECTED' ? '✕' : '⚠'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: latestVerification.status === 'REJECTED' ? '#991b1b' : '#92400e' }}>
                    {latestVerification.status === 'REJECTED' ? 'Verification Rejected' : 'Correction Requested'}
                  </div>
                  <div style={{ fontSize: 12, color: latestVerification.status === 'REJECTED' ? '#7f1d1d' : '#78350f', marginTop: 2 }}>
                    {latestVerification.status === 'REJECTED'
                      ? 'Your verification request was rejected. Review the reasons below and submit a new request once resolved.'
                      : 'An administrator has requested changes to your verification. Review the notes below and resubmit.'}
                    {latestVerification.reviewedAt ? ` Reviewed ${formatDate(latestVerification.reviewedAt)}.` : ''}
                  </div>
                </div>
              </div>
              {latestVerification.rejectionReasons?.length > 0 && (
                <ul style={{ margin: '8px 0 0', paddingLeft: 34, fontSize: 12, color: '#7f1d1d' }}>
                  {latestVerification.rejectionReasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
              {latestVerification.decisionNotes && (
                <div style={{ margin: '8px 0 0 34', fontSize: 12, color: '#5b6b74', fontStyle: 'italic' }}>
                  Reviewer notes: {latestVerification.decisionNotes}
                </div>
              )}
            </div>
          )}

          {error && <div style={{ marginTop: 20 }}><ErrorBanner message={error} /></div>}
          {savedMsg && <div style={successBanner}>{savedMsg}</div>}

          {/* Metrics Dashboard */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginTop: 20 }}>
            <div className="metric-card" style={metricCard}>
              <div style={metricLabel}>Verification</div>
              <div style={{ marginTop: 6 }}><StatusBadge status={org.verificationStatus} /></div>
            </div>
            <div className="metric-card" style={metricCard}>
              <div style={metricLabel}>Members</div>
              <div style={metricValue}>{members.length}</div>
              <div style={metricHint}>{members.filter(m => m.roleKey === 'MERCHANT_OWNER').length} owner(s)</div>
            </div>
            <div className="metric-card" style={metricCard}>
              <div style={metricLabel}>Documents</div>
              <div style={metricValue}>{documents.length}</div>
              <div style={metricHint}>{documents.filter(d => d.verificationStatus === 'VERIFIED').length} verified</div>
            </div>
            <div className="metric-card" style={{ ...metricCard, cursor: org.inviteCode ? 'pointer' : 'default' }} onClick={handleCopyInvite}>
              <div style={metricLabel}>Invite Code</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0f3340', fontFamily: 'monospace', marginTop: 4, letterSpacing: '1px' }}>
                {org.inviteCode || '—'}
              </div>
              <div style={metricHint}>{copied ? '✓ Copied!' : 'Click to copy'}</div>
            </div>
          </div>

          {/* Business Details */}
          <div style={{ ...card, marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={sectionTitle}>Business Details</h2>
              {!canEdit && <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>Read-only</span>}
            </div>

            <div style={grid}>
              <label style={label}>Organization Name *
                <input type="text" value={name} onChange={e => setName(e.target.value)} style={input} disabled={!canEdit} aria-label="Organization name" />
              </label>
              <label style={label}>Legal Name
                <input type="text" value={legalName} onChange={e => setLegalName(e.target.value)} style={input} disabled={!canEdit} placeholder="As registered with authorities" aria-label="Legal name" />
              </label>
              <label style={label}>Tax ID / VAT Number
                <input type="text" value={taxId} onChange={e => setTaxId(e.target.value)} style={input} disabled={!canEdit} placeholder="e.g. 300000000000003" aria-label="Tax ID" />
              </label>
            </div>

            <div style={readOnlyRow}>
              <ReadOnlyField label="Country" value={org.country} />
              <ReadOnlyField label="Business Type" value={org.type} />
              <ReadOnlyField label="Member Since" value={org.createdAt ? new Date(org.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : '—'} />
            </div>

            {canEdit && isVerified && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', marginTop: 16, fontSize: 12, color: '#1e40af' }}>
                Your organization is verified — changes to business details require admin approval. Submitting creates an update request that takes effect once approved.
              </div>
            )}

            {canEdit && (
              <div style={{ display: 'flex', gap: 8, marginTop: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                {isVerified ? (
                  <>
                    <button
                      onClick={handleSubmitUpdateRequest}
                      disabled={saving || !name.trim() || !!pendingUpdate}
                      style={{ ...primaryBtn, opacity: saving || !!pendingUpdate ? 0.6 : 1 }}
                    >
                      {saving ? 'Submitting…' : 'Submit Update Request'}
                    </button>
                    {pendingUpdate && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: '#fef3c7', color: '#92400e' }}>
                        ⏳ Update pending approval (submitted {formatDate(pendingUpdate.createdAt)})
                      </span>
                    )}
                  </>
                ) : (
                  <button onClick={handleSave} disabled={saving || !name.trim()} style={primaryBtn}>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                )}
                <button onClick={() => { setName(org.name || ''); setLegalName(org.legalName || ''); setTaxId(org.taxId || ''); }} style={ghostBtn}>
                  Reset
                </button>
              </div>
            )}
          </div>

          {/* Update Requests (admin approval history) */}
          {updateRequests.length > 0 && (
            <div style={{ ...card, marginTop: 20 }}>
              <h2 style={sectionTitle}>Update Requests</h2>
              <div style={tableWrap}>
                <table style={table}>
                  <thead><tr style={theadRow}>
                    <th style={th}>Submitted</th>
                    <th style={th}>Proposed Changes</th>
                    <th style={th}>Status</th>
                    <th style={th}>Decision</th>
                  </tr></thead>
                  <tbody>
                    {updateRequests.map(r => (
                      <tr key={r.id} className="tbl-row" style={tbodyRow}>
                        <td style={{ ...td, color: '#5b6b74', fontSize: 12, whiteSpace: 'nowrap' }}>{formatDate(r.createdAt)}</td>
                        <td style={{ ...td, fontSize: 12 }}>{summarizePayload(r.payload)}</td>
                        <td style={td}>
                          <span style={updateReqChip(r.status)}>
                            {UPDATE_REQUEST_STATUS_LABELS[r.status] ?? r.status}
                          </span>
                        </td>
                        <td style={{ ...td, fontSize: 12, color: '#5b6b74' }}>
                          {r.decisionNotes
                            ? <span style={{ fontStyle: 'italic' }}>“{r.decisionNotes}”{r.decidedAt ? ` — ${formatDate(r.decidedAt)}` : ''}</span>
                            : r.decidedAt ? formatDate(r.decidedAt) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Verification Documents */}
          <div style={{ ...card, marginTop: 20 }}>
            <h2 style={sectionTitle}>Verification Documents</h2>
            {docsLoading ? <LoadingSpinner /> : docsError ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <ErrorBanner message={docsError} />
                <button onClick={() => org && loadDocuments(org.id)} style={{ ...ghostBtn, marginTop: 8 }}>Retry</button>
              </div>
            ) : documents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#5b6b74', fontSize: 13 }}>
                No documents submitted yet. Documents are uploaded during the registration process.
              </div>
            ) : (
              <div style={tableWrap}>
                <table style={table}>
                  <thead><tr style={theadRow}>
                    <th style={th}>Document</th>
                    <th style={th}>Type</th>
                    <th style={th}>Status</th>
                    <th style={th}>Size</th>
                    <th style={th}>Uploaded</th>
                    <th style={th}>Action</th>
                  </tr></thead>
                  <tbody>
                    {documents.map(doc => (
                      <tr key={doc.id} className="tbl-row" style={tbodyRow}>
                        <td style={td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={docIcon}>{doc.mimeType?.includes('pdf') ? 'PDF' : 'DOC'}</span>
                            <div>
                              <div style={{ fontWeight: 600, color: '#0f3340', fontSize: 13 }}>{doc.fileName}</div>
                              <div style={{ fontSize: 11, color: '#9ca3af' }}>{doc.mimeType || 'unknown'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={td}><span style={chip}>{doc.docType.replace(/_/g, ' ')}</span></td>
                        <td style={td}><StatusBadge status={docStatusLabel(doc.verificationStatus)} /></td>
                        <td style={{ ...td, color: '#5b6b74', fontSize: 12 }}>{fmtSize(doc.fileSize)}</td>
                        <td style={{ ...td, color: '#5b6b74', fontSize: 12 }}>{formatDate(doc.createdAt)}</td>
                        <td style={td}>
                          <button
                            onClick={() => handleDownload(doc.id)}
                            disabled={downloadingDoc === doc.id}
                            style={downloadBtn}
                            aria-label={`Download ${doc.fileName}`}
                          >
                            {downloadingDoc === doc.id ? '…' : '↓ Download'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Members */}
          <div style={{ ...card, marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ ...sectionTitle, marginBottom: 0 }}>Members ({members.length})</h2>
              {canEdit && <button onClick={() => setAddOpen(v => !v)} style={ghostBtn}>{addOpen ? '✕ Close' : '+ Add Member'}</button>}
            </div>

            {addOpen && (
              <div style={{ background: '#f7f9fa', border: '1px solid #d9e2e6', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: '#5b6b74', marginBottom: 12 }}>
                  Search for a user by phone or email (min 3 characters), then assign a role.
                </p>

                {/* User Lookup */}
                {!selectedUser ? (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input
                        type="text"
                        placeholder="Phone or email…"
                        value={lookupQuery}
                        onChange={e => setLookupQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleLookup()}
                        style={{ ...input, flex: 1 }}
                        aria-label="Search users by phone or email"
                      />
                      <button
                        onClick={handleLookup}
                        disabled={lookingUp || lookupQuery.trim().length < 3}
                        style={{ ...primaryBtn, whiteSpace: 'nowrap', opacity: lookingUp || lookupQuery.trim().length < 3 ? 0.5 : 1 }}
                      >
                        {lookingUp ? 'Searching…' : 'Search'}
                      </button>
                    </div>
                    {lookupResults.length > 0 && (
                      <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 6, maxHeight: 200, overflowY: 'auto' }} role="listbox" aria-label="User search results">
                        {lookupResults.map(user => (
                          <div
                            key={user.id}
                            onClick={() => handleSelectUser(user)}
                            style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f2f4', fontSize: 13 }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f0f7fa')}
                            onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                            role="option"
                            aria-selected={false}
                          >
                            <div style={{ fontWeight: 600, color: '#0f3340' }}>{user.fullName || 'Unknown'}</div>
                            <div style={{ fontSize: 11, color: '#5b6b74' }}>
                              {user.phone}{user.email ? ` · ${user.email}` : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {lookupResults.length === 0 && lookupQuery.trim().length >= 3 && !lookingUp && (
                      <p style={{ fontSize: 12, color: '#8a9ba5', margin: '8px 0 0' }}>No users found. Try a different phone or email.</p>
                    )}
                  </div>
                ) : (
                  <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 6, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#2e7d32', fontSize: 13 }}>{selectedUser.fullName || 'Unknown'}</div>
                      <div style={{ fontSize: 11, color: '#5b6b74' }}>{selectedUser.phone}{selectedUser.email ? ` · ${selectedUser.email}` : ''}</div>
                    </div>
                    <button onClick={() => { setSelectedUser(null); setNewUserId(''); }} style={{ background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                      Change
                    </button>
                  </div>
                )}

                {/* Role Selection */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#5b6b74', marginBottom: 4 }}>Role *</label>
                  <select value={newRoleId} onChange={e => setNewRoleId(e.target.value)} style={{ ...input, fontSize: 13, width: '100%' }} aria-label="Select role">
                    <option value="">Select a role…</option>
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.key})</option>
                    ))}
                  </select>
                </div>

                <button onClick={handleAddMember} disabled={addingMember || !newUserId.trim() || !newRoleId.trim()} style={primaryBtn}>
                  {addingMember ? 'Adding…' : 'Add Member'}
                </button>
              </div>
            )}

            {membersError ? (
              <div style={{ padding: '12px 0' }}><ErrorBanner message={membersError} /></div>
            ) : members.length === 0 ? (
              <p style={{ fontSize: 13, color: '#5b6b74', textAlign: 'center', padding: '20px 0' }}>No members found.</p>
            ) : (
              <div style={tableWrap}>
                <table style={table}>
                  <thead><tr style={theadRow}>
                    <th style={th}>Member</th><th style={th}>Phone</th><th style={th}>Role</th>
                    <th style={th}>Status</th><th style={th}>Joined</th>
                    {canEdit && <th style={th}>Actions</th>}
                  </tr></thead>
                  <tbody>
                    {members.map(m => (
                      <tr key={m.userId} className="tbl-row" style={tbodyRow}>
                        <td style={td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={avatarCircle}>{(m.fullName || '?').charAt(0).toUpperCase()}</div>
                            <span style={{ fontWeight: 600, color: '#0f3340' }}>{m.fullName || 'Unknown'}</span>
                          </div>
                        </td>
                        <td style={{ ...td, color: '#5b6b74' }}>{m.phone || '—'}</td>
                        <td style={td}><span style={roleChip(m.roleKey)}>{m.roleKey.replace(/_/g, ' ')}</span></td>
                        <td style={td}><StatusBadge status={m.status} /></td>
                        <td style={{ ...td, color: '#5b6b74', fontSize: 12 }}>{m.joinedAt ? formatDate(m.joinedAt) : '—'}</td>
                        {canEdit && (
                          <td style={td}>
                            <button onClick={() => setRemoveTarget(m)} style={deleteBtn} aria-label={`Remove ${m.fullName}`}>Remove</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div style={{ ...card, marginTop: 20 }}>
            <h2 style={sectionTitle}>Quick Links</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <Link href="/merchant/stores" className="quick-link" style={quickLink}>
                <span style={quickLinkIcon}>🏪</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#0f3340', fontSize: 13 }}>My Stores</div>
                  <div style={{ fontSize: 11, color: '#5b6b74' }}>Manage store settings</div>
                </div>
              </Link>
              <Link href="/merchant/catalog" className="quick-link" style={quickLink}>
                <span style={quickLinkIcon}>📦</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#0f3340', fontSize: 13 }}>Product Catalog</div>
                  <div style={{ fontSize: 11, color: '#5b6b74' }}>Manage products & variants</div>
                </div>
              </Link>
              <Link href="/merchant/orders" className="quick-link" style={quickLink}>
                <span style={quickLinkIcon}>📋</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#0f3340', fontSize: 13 }}>Orders</div>
                  <div style={{ fontSize: 11, color: '#5b6b74' }}>View & manage orders</div>
                </div>
              </Link>
              <Link href="/merchant/pricing" className="quick-link" style={quickLink}>
                <span style={quickLinkIcon}>💲</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#0f3340', fontSize: 13 }}>Pricing</div>
                  <div style={{ fontSize: 11, color: '#5b6b74' }}>Price lists & tiers</div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Remove Member Confirmation Modal */}
      {removeTarget && (
        <div style={overlay}>
          <div style={dialog}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 8 }}>Remove Member</h3>
            <p style={{ fontSize: 13, color: '#5b6b74', marginBottom: 20, lineHeight: 1.5 }}>
              Are you sure you want to remove <strong style={{ color: '#0f3340' }}>{removeTarget.fullName || 'this user'}</strong> from the organization?
              They will lose access immediately. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setRemoveTarget(null)} style={ghostBtn} disabled={removingMember}>Cancel</button>
              <button onClick={confirmRemoveMember} style={dangerBtn} disabled={removingMember}>
                {removingMember ? 'Removing…' : 'Remove Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ReadOnlyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#5b6b74', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>{label}</div>
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

function updateReqChip(status: string): React.CSSProperties {
  const colors: Record<string, { bg: string; text: string }> = {
    PENDING: { bg: '#fef3c7', text: '#92400e' },
    APPROVED: { bg: '#d1fae5', text: '#065f46' },
    REJECTED: { bg: '#fee2e2', text: '#991b1b' },
  };
  const c = colors[status] || { bg: '#edf2f7', text: '#4a5568' };
  return { display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: c.bg, color: c.text };
}

// ── Styles ────────────────────────────────────────────────────

const breadcrumb: React.CSSProperties = { padding: '16px 0 0', fontSize: 13, color: '#5b6b74', display: 'flex', alignItems: 'center', gap: 6 };
const crumbLink: React.CSSProperties = { color: '#5b6b74', textDecoration: 'none' };
const crumbSep: React.CSSProperties = { color: '#d9e2e6' };
const h1: React.CSSProperties = { fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 };
const primaryLink: React.CSSProperties = { display: 'inline-block', padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', borderRadius: 6, textDecoration: 'none' };
const card: React.CSSProperties = { background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 24, boxShadow: '0 1px 3px rgba(22,35,43,.04)' };
const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 };
const metricCard: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px', boxShadow: '0 1px 3px rgba(22,35,43,.04)' };
const metricLabel: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#5b6b74', textTransform: 'uppercase', letterSpacing: '0.5px' };
const metricValue: React.CSSProperties = { fontSize: 28, fontWeight: 700, color: '#0f3340', marginTop: 4, lineHeight: 1 };
const metricHint: React.CSSProperties = { fontSize: 11, color: '#9ca3af', marginTop: 4 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 };
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#5b6b74', marginBottom: 8 };
const input: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, fontWeight: 400, color: '#1f2937', background: '#fff' };
const primaryBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { padding: '6px 14px', fontSize: 13, fontWeight: 600, background: '#fff', color: '#5b6b74', border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer' };
const dangerBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const deleteBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#fff', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer' };
const downloadBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#e6f0f5', color: '#0f3340', border: '1px solid #b8d4e3', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' };
const successBanner: React.CSSProperties = { background: '#d1fae5', border: '1px solid #6ee7b7', color: '#065f46', borderRadius: 8, padding: '10px 14px', marginTop: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 };
const chip: React.CSSProperties = { display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: '#edf2f7', color: '#4a5568' };
const readOnlyRow: React.CSSProperties = { display: 'flex', gap: 24, flexWrap: 'wrap', padding: '14px 0 0', borderTop: '1px solid #eef2f5', marginTop: 4 };
const tableWrap: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const theadRow: React.CSSProperties = { background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)' };
const tbodyRow: React.CSSProperties = { borderBottom: '1px solid #e2e8f0' };
const th: React.CSSProperties = { textAlign: 'left', padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' };
const td: React.CSSProperties = { padding: '14px 18px', color: '#1e2d35', fontSize: 13 };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,51,64,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 };
const dialog: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 10px 40px rgba(0,0,0,0.2)' };
const avatarCircle: React.CSSProperties = { width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #0f3340, #1e6178)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 };
const docIcon: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, background: '#edf2f7', color: '#0f3340', fontSize: 10, fontWeight: 700, flexShrink: 0 };

function roleChip(key: string): React.CSSProperties {
  const colors: Record<string, { bg: string; text: string }> = {
    MERCHANT_OWNER: { bg: '#fef3c7', text: '#92400e' },
    MERCHANT_STAFF: { bg: '#dbeafe', text: '#1e40af' },
    ADMIN: { bg: '#ede9fe', text: '#5b21b6' },
    SUPER_ADMIN: { bg: '#fce7f3', text: '#9d174d' },
  };
  const c = colors[key] || { bg: '#edf2f7', text: '#4a5568' };
  return { display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: c.bg, color: c.text };
}

const quickLink: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 10, textDecoration: 'none', background: '#fff' };
const quickLinkIcon: React.CSSProperties = { fontSize: 22, flexShrink: 0 };
