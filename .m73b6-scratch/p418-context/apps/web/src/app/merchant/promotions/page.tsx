'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  fetchStorePromotions, createPromotion, updatePromotion,
  Promotion, CreatePromotionInput,
} from '../../../lib/buyer-api';
import { fetchMyStores, Store } from '../../../lib/api';
import { pickStore } from '../../../lib/merchant-store';
import { LoadingSpinner, ErrorBanner, EmptyState, formatMinor } from '../../../components/Shared';
import { PageHeader, Card, Button, colors, typeScale, radii, shadows } from '@scs/ui-kit';

const PROMO_TYPES = ['PERCENT', 'FIXED', 'QTY_DISCOUNT', 'TIME_LIMITED'] as const;
const SCOPES = ['STORE', 'CATEGORY', 'PRODUCT', 'VARIANT'] as const;

const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  PERCENT: { bg: '#ede9fe', fg: '#6d28d9' },
  FIXED: { bg: colors.infoBg ?? '#e3f2fd', fg: colors.info ?? '#1565c0' },
  QTY_DISCOUNT: { bg: '#fef3c7', fg: '#92400e' },
  TIME_LIMITED: { bg: '#fce7f3', fg: '#9d174d' },
};

function TypeBadge({ type }: { type: string }) {
  const c = TYPE_COLORS[type] ?? { bg: colors.bgSubtle, fg: colors.muted };
  return <span style={{ padding: '2px 8px', borderRadius: radii.sm, fontSize: 11, fontWeight: 700, background: c.bg, color: c.fg }}>{type}</span>;
}

function formatDiscount(value: number, type: string): string {
  if (type === 'PERCENT') return `${value}%`;
  return formatMinor(value, 'SAR');
}

function isActiveNow(p: Promotion): boolean {
  const now = new Date();
  return p.isActive && new Date(p.startsAt) <= now && new Date(p.endsAt) >= now;
}

export default function MerchantPromotionsPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [filterType, setFilterType] = useState('');

  // Create form
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formType, setFormType] = useState<string>('PERCENT');
  const [formScope, setFormScope] = useState<string>('STORE');
  const [formScopeId, setFormScopeId] = useState('');
  const [formDiscount, setFormDiscount] = useState('');
  const [formMinOrder, setFormMinOrder] = useState('0');
  const [formMaxDiscount, setFormMaxDiscount] = useState('');
  const [formMaxRedemptions, setFormMaxRedemptions] = useState('');
  const [formPerUser, setFormPerUser] = useState('1');
  const [formStarts, setFormStarts] = useState('');
  const [formEnds, setFormEnds] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Load stores
  useEffect(() => {
    fetchMyStores().then(data => {
      setStores(data);
      const active = pickStore(data);
      if (active) setStoreId(active.id);
    }).catch(err => setError(err.message || 'Failed to load stores'));
  }, []);

  const loadPromotions = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchStorePromotions(storeId);
      setPromotions(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load promotions');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { if (storeId) loadPromotions(); }, [storeId, loadPromotions]);

  const handleCreate = async () => {
    if (!storeId || !formName || !formDiscount || !formStarts || !formEnds) return;
    setCreating(true);
    setCreateError('');
    try {
      const input: CreatePromotionInput = {
        storeId,
        name: formName,
        code: formCode || undefined,
        description: formDesc || undefined,
        promoType: formType as CreatePromotionInput['promoType'],
        scope: formScope as CreatePromotionInput['scope'],
        scopeId: formScopeId || undefined,
        discountValue: parseInt(formDiscount, 10),
        minOrderMinor: formMinOrder ? parseInt(formMinOrder, 10) : undefined,
        maxDiscountMinor: formMaxDiscount ? parseInt(formMaxDiscount, 10) : undefined,
        maxRedemptions: formMaxRedemptions ? parseInt(formMaxRedemptions, 10) : undefined,
        perUserLimit: formPerUser ? parseInt(formPerUser, 10) : undefined,
        startsAt: new Date(formStarts).toISOString(),
        endsAt: new Date(formEnds).toISOString(),
      };
      await createPromotion(input);
      resetForm();
      setShowCreate(false);
      await loadPromotions();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create promotion');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (p: Promotion) => {
    try {
      await updatePromotion(p.id, { isActive: !p.isActive } as any);
      await loadPromotions();
    } catch (err: any) {
      setError(err.message || 'Failed to update promotion');
    }
  };

  const resetForm = () => {
    setFormName(''); setFormCode(''); setFormDesc('');
    setFormType('PERCENT'); setFormScope('STORE'); setFormScopeId('');
    setFormDiscount(''); setFormMinOrder('0'); setFormMaxDiscount('');
    setFormMaxRedemptions(''); setFormPerUser('1');
    setFormStarts(''); setFormEnds('');
  };

  const filtered = filterType ? promotions.filter(p => p.promoType === filterType) : promotions;
  const activeStore = stores.find(s => s.id === storeId);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader
        title="Promotions"
        subtitle={activeStore ? `Manage discount promotions for ${activeStore.displayName}` : 'Manage promotions'}
        trailing={
          <Button onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? 'Cancel' : '+ New Promotion'}
          </Button>
        }
      />
      <div style={{ padding: '20px 24px 48px' }}>

        {/* Store selector */}
        {stores.length > 1 && (
          <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ ...typeScale.bodySm, fontWeight: 600, color: colors.muted }}>Store:</label>
            <select
              value={storeId}
              onChange={e => setStoreId(e.target.value)}
              style={{ padding: '6px 10px', border: `1px solid ${colors.border}`, borderRadius: radii.sm, fontSize: typeScale.body.fontSize, fontFamily: 'inherit' }}
            >
              {stores.map(s => <option key={s.id} value={s.id}>{s.displayName}</option>)}
            </select>
          </div>
        )}

        {error && <ErrorBanner message={error} />}

        {/* Create form */}
        {showCreate && (
          <Card style={{ marginBottom: 20, padding: 20 }}>
            <h3 style={{ ...typeScale.h4, color: colors.brand[700], marginBottom: 16 }}>Create Promotion</h3>
            {createError && <ErrorBanner message={createError} />}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Name *" value={formName} onChange={setFormName} placeholder="Summer Sale" />
              <Field label="Promo Code" value={formCode} onChange={setFormCode} placeholder="SUMMER25" />
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Description" value={formDesc} onChange={setFormDesc} placeholder="Optional description" />
              </div>
              <div>
                <label style={labelStyle}>Type *</label>
                <select value={formType} onChange={e => setFormType(e.target.value)} style={inputStyle}>
                  {PROMO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Scope</label>
                <select value={formScope} onChange={e => setFormScope(e.target.value)} style={inputStyle}>
                  {SCOPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {formScope !== 'STORE' && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Scope ID" value={formScopeId} onChange={setFormScopeId} placeholder={`Enter ${formScope.toLowerCase()} ID`} />
                </div>
              )}
              <Field label="Discount Value *" value={formDiscount} onChange={setFormDiscount} placeholder={formType === 'PERCENT' ? 'e.g. 15 (percent)' : 'e.g. 500 (minor units)'} />
              <Field label="Min Order (minor units)" value={formMinOrder} onChange={setFormMinOrder} placeholder="0" />
              <Field label="Max Discount (minor units)" value={formMaxDiscount} onChange={setFormMaxDiscount} placeholder="Optional cap" />
              <Field label="Max Redemptions" value={formMaxRedemptions} onChange={setFormMaxRedemptions} placeholder="Unlimited" />
              <Field label="Per-User Limit" value={formPerUser} onChange={setFormPerUser} placeholder="1" />
              <div>
                <label style={labelStyle}>Starts At *</label>
                <input type="datetime-local" value={formStarts} onChange={e => setFormStarts(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Ends At *</label>
                <input type="datetime-local" value={formEnds} onChange={e => setFormEnds(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="danger" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating || !formName || !formDiscount || !formStarts || !formEnds}>
                {creating ? 'Creating...' : 'Create Promotion'}
              </Button>
            </div>
          </Card>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
          <label style={{ ...typeScale.bodySm, fontWeight: 600, color: colors.muted }}>Filter:</label>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            style={{ padding: '6px 10px', border: `1px solid ${colors.border}`, borderRadius: radii.sm, fontSize: typeScale.body.fontSize, fontFamily: 'inherit' }}
          >
            <option value="">All types</option>
            {PROMO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <span style={{ ...typeScale.bodySm, color: colors.muted, marginLeft: 'auto' }}>
            {filtered.length} promotion{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* List */}
        {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
          <EmptyState
            title="No promotions"
            description={filterType ? `No ${filterType} promotions found.` : 'Create your first promotion to offer discounts to buyers.'}
            action={!filterType ? <Button onClick={() => setShowCreate(true)}>Create Promotion</Button> : undefined}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(p => {
              const active = isActiveNow(p);
              return (
                <Card key={p.id} style={{ padding: 0, overflow: 'hidden', opacity: active ? 1 : 0.7 }}>
                  <div style={{
                    padding: '14px 18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 12,
                    borderBottom: `1px solid ${colors.borderLight}`,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ ...typeScale.body, fontWeight: 600, color: colors.brand[700] }}>{p.name}</span>
                        <TypeBadge type={p.promoType} />
                        {active ? (
                          <span style={{ padding: '2px 6px', borderRadius: radii.sm, fontSize: 10, fontWeight: 700, background: colors.okBg, color: colors.ok }}>ACTIVE</span>
                        ) : (
                          <span style={{ padding: '2px 6px', borderRadius: radii.sm, fontSize: 10, fontWeight: 700, background: colors.bgSubtle, color: colors.muted }}>
                            {p.isActive ? 'SCHEDULED' : 'INACTIVE'}
                          </span>
                        )}
                      </div>
                      {p.code && (
                        <div style={{ ...typeScale.bodySm, fontFamily: 'monospace', color: colors.brand[500], marginBottom: 2 }}>
                          Code: <strong>{p.code}</strong>
                        </div>
                      )}
                      {p.description && (
                        <div style={{ ...typeScale.bodySm, color: colors.muted, marginBottom: 4 }}>{p.description}</div>
                      )}
                      <div style={{ ...typeScale.caption, color: colors.muted, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <span>Discount: <strong style={{ color: colors.brand[700] }}>{formatDiscount(p.discountValue, p.promoType)}</strong></span>
                        {p.minOrderMinor != null && p.minOrderMinor > 0 && <span>Min order: {formatMinor(p.minOrderMinor, 'SAR')}</span>}
                        {p.maxDiscountMinor != null && <span>Max discount: {formatMinor(p.maxDiscountMinor, 'SAR')}</span>}
                        <span>Scope: {p.scope}</span>
                        <span>Redeemed: {p.redemptionCount}{p.maxRedemptions ? ` / ${p.maxRedemptions}` : ''}</span>
                        <span>Per-user: {p.perUserLimit ?? 1}</span>
                      </div>
                      <div style={{ ...typeScale.caption, color: colors.muted, marginTop: 4 }}>
                        {new Date(p.startsAt).toLocaleDateString()} — {new Date(p.endsAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => handleToggleActive(p)}
                        style={{
                          padding: '6px 12px', fontSize: 12, fontWeight: 600,
                          background: p.isActive ? '#fff' : colors.okBg,
                          color: p.isActive ? colors.err : colors.ok,
                          border: `1px solid ${p.isActive ? colors.border : colors.ok}`,
                          borderRadius: radii.sm, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        {p.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 4, ...typeScale.bodySm, fontWeight: 600, color: colors.muted,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: `1px solid ${colors.border}`,
  borderRadius: radii.sm, fontSize: typeScale.body.fontSize, fontFamily: 'inherit',
};

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}
