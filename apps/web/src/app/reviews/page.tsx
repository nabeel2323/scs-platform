'use client';

import { useState } from 'react';
import { createReview, createDispute } from '../../lib/buyer-api';
import { ErrorBanner } from '../../components/Shared';
import { PageHeader, colors, radii } from '@scs/ui-kit';

export default function ReviewDisputePage() {
  const [tab, setTab] = useState<'review' | 'dispute'>('review');
  const [orderId, setOrderId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [subjectType, setSubjectType] = useState('STORE');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeAgainst, setDisputeAgainst] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleReview = async () => {
    if (!orderId || !subjectId) { setError('Order ID and Subject ID required'); return; }
    setSubmitting(true); setError(''); setSuccess('');
    try {
      await createReview(orderId, { subjectId, subjectType, rating, comment: comment || undefined });
      setSuccess('Review submitted successfully!');
      setOrderId(''); setSubjectId(''); setComment('');
    } catch (err: any) { setError(err.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleDispute = async () => {
    if (!orderId || !disputeAgainst || !disputeReason) { setError('Order ID, against ID, and reason required'); return; }
    setSubmitting(true); setError(''); setSuccess('');
    try {
      await createDispute(orderId, { againstId: disputeAgainst, reason: disputeReason });
      setSuccess('Dispute opened successfully!');
      setOrderId(''); setDisputeReason(''); setDisputeAgainst('');
    } catch (err: any) { setError(err.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <PageHeader title="Reviews & Disputes" subtitle="Write reviews or open disputes" />
      <div style={{ padding: '20px 24px 48px' }}>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24 }}>
        <button onClick={() => setTab('review')} style={{ ...tabStyle, background: tab === 'review' ? colors.brand[700] : '#fff', color: tab === 'review' ? '#fff' : colors.muted, borderRadius: '8px 0 0 8px' }}>Write a Review</button>
        <button onClick={() => setTab('dispute')} style={{ ...tabStyle, background: tab === 'dispute' ? colors.brand[700] : '#fff', color: tab === 'dispute' ? '#fff' : colors.muted, borderRadius: '0 8px 8px 0' }}>Open a Dispute</button>
      </div>

      {error && <ErrorBanner message={error} />}
      {success && <div style={{ background: colors.okBg, border: `1px solid ${colors.okBorder}`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: colors.ok, fontSize: 13 }}>{success}</div>}

      {tab === 'review' ? (
        <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Order ID *</label>
            <input type="text" value={orderId} onChange={e => setOrderId(e.target.value)} placeholder="Order UUID" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Subject ID (Store/User) *</label>
            <input type="text" value={subjectId} onChange={e => setSubjectId(e.target.value)} placeholder="Subject UUID" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Subject Type</label>
            <select value={subjectType} onChange={e => setSubjectType(e.target.value)} style={inputStyle}>
              <option value="STORE">Store</option>
              <option value="DRIVER">Driver</option>
              <option value="BUYER">Buyer</option>
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Rating</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setRating(n)} style={{ width: 40, height: 40, fontSize: 20, background: n <= rating ? '#fef3c7' : '#f7f9fa', border: `1px solid ${n <= rating ? '#f59e0b' : '#d9e2e6'}`, borderRadius: 6, cursor: 'pointer' }}>★</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Comment</label>
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} placeholder="Write your review..." style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <button onClick={handleReview} disabled={submitting} style={{ width: '100%', padding: '10px 0', fontSize: 14, fontWeight: 600, background: submitting ? colors.muted : colors.brand[700], color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            {submitting ? 'Submitting...' : 'Submit Review'}
          </button>
        </div>
      ) : (
        <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Order ID *</label>
            <input type="text" value={orderId} onChange={e => setOrderId(e.target.value)} placeholder="Order UUID" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Against (Store/Merchant ID) *</label>
            <input type="text" value={disputeAgainst} onChange={e => setDisputeAgainst(e.target.value)} placeholder="Store or Merchant UUID" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Additional Notes</label>
            <textarea value={disputeReason} onChange={e => setDisputeReason(e.target.value)} rows={4} placeholder="Describe the issue in detail..." style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <button onClick={handleDispute} disabled={submitting || !orderId || !disputeAgainst || !disputeReason} style={{ width: '100%', padding: '10px 0', fontSize: 14, fontWeight: 600, background: (submitting || !orderId || !disputeAgainst || !disputeReason) ? colors.muted : colors.err, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            {submitting ? 'Opening...' : 'Open Dispute'}
          </button>
        </div>
      )}
      </div>
    </div>
  );
}

const tabStyle: React.CSSProperties = { flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 600, border: `1px solid ${colors.border}`, cursor: 'pointer' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: colors.brand[700], marginBottom: 6 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' as const };
