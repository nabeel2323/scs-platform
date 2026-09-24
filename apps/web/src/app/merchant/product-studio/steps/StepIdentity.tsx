'use client';

import React, { useState } from 'react';
import { Category, Brand, ProductTypeSummary, Product } from '../../../../lib/buyer-api';
import { type StudioState } from '../../../../hooks/useProductStudio';

interface StepIdentityProps {
  state: StudioState;
  setState: React.Dispatch<React.SetStateAction<StudioState>>;
  stores: Array<{ id: string; displayName: string }>;
  categories: Category[];
  brands: Brand[];
  productTypes: ProductTypeSummary[];
  canonicalMatches: Product[];
  onSearchCanonical: (query: { gtin?: string; ean?: string; mpn?: string; title?: string }) => Promise<Product[]>;
}

export default function StepIdentity({
  state, setState, stores, categories, brands, productTypes, canonicalMatches, onSearchCanonical,
}: StepIdentityProps) {
  const [searching, setSearching] = useState(false);

  const handleIdentifierSearch = async () => {
    if (!state.gtin && !state.ean && !state.mpn) return;
    setSearching(true);
    await onSearchCanonical({
      gtin: state.gtin || undefined,
      ean: state.ean || undefined,
      mpn: state.mpn || undefined,
    });
    setSearching(false);
  };

  const useExisting = (product: Product) => {
    setState(prev => ({
      ...prev,
      useExistingProductId: product.id,
      title: product.title,
      titleAr: product.titleAr ?? '',
      categoryId: product.categoryId ?? '',
      brandId: product.brandId ?? '',
    }));
  };

  return (
    <StepCard title="Product Identity" subtitle="Choose category, brand, product type, and basic info. Search by GTIN/EAN/MPN to find existing products.">
      <Field label="Store *">
        <select value={state.storeId} onChange={e => setState(prev => ({ ...prev, storeId: e.target.value }))}>
          <option value="">Select store…</option>
          {stores.map(s => <option key={s.id} value={s.id}>{s.displayName}</option>)}
        </select>
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Field label="Category">
          <select value={state.categoryId} onChange={e => setState(prev => ({ ...prev, categoryId: e.target.value }))}>
            <option value="">Select category…</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Brand">
          <select value={state.brandId} onChange={e => setState(prev => ({ ...prev, brandId: e.target.value }))}>
            <option value="">Select brand…</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Product Type">
          <select value={state.productTypeId} onChange={e => setState(prev => ({ ...prev, productTypeId: e.target.value }))}>
            <option value="">Select product type…</option>
            {productTypes.filter(pt => !state.categoryId || pt.categoryId === state.categoryId)
              .map(pt => <option key={pt.id} value={pt.id}>{pt.name} (v{pt.version})</option>)}
          </select>
        </Field>
      </div>

      {/* Identifier search */}
      <div style={{ padding: 12, background: '#f7f9fa', borderRadius: 8, border: '1px solid #e5ecf0' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#16232b', marginBottom: 8 }}>Find Existing Product (optional)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <Field label="GTIN"><input value={state.gtin} onChange={e => setState(prev => ({ ...prev, gtin: e.target.value }))} placeholder="Global Trade Item Number" /></Field>
          <Field label="EAN"><input value={state.ean} onChange={e => setState(prev => ({ ...prev, ean: e.target.value }))} /></Field>
          <Field label="MPN"><input value={state.mpn} onChange={e => setState(prev => ({ ...prev, mpn: e.target.value }))} placeholder="Manufacturer Part Number" /></Field>
          <button type="button" onClick={handleIdentifierSearch} disabled={searching}
            style={{ padding: '9px 16px', fontSize: 13, border: '1px solid #d9e2e6', borderRadius: 6, cursor: searching ? 'wait' : 'pointer', background: '#fff', fontWeight: 500 }}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
        {canonicalMatches.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#16232b', marginBottom: 6 }}>Found {canonicalMatches.length} match(es):</div>
            {canonicalMatches.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#fff', borderRadius: 6, marginBottom: 4, border: '1px solid #e5ecf0' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#16232b' }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: '#5b6b74' }}>{p.id.substring(0, 8)}…</div>
                </div>
                <button type="button" onClick={() => useExisting(p)}
                  style={{ padding: '5px 12px', fontSize: 12, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                  Use This Product
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {state.useExistingProductId && (
        <div style={{ padding: 10, background: '#eaf5ef', color: '#1b7a4b', borderRadius: 6, fontSize: 12 }}>
          ✓ Using existing canonical product. You will create a merchant offer for it.
        </div>
      )}

      <Field label="Product Title *">
        <input value={state.title} onChange={e => setState(prev => ({ ...prev, title: e.target.value }))} placeholder="e.g. Dell Latitude 5540 Laptop" />
      </Field>
      <Field label="Title (Arabic)">
        <input value={state.titleAr} onChange={e => setState(prev => ({ ...prev, titleAr: e.target.value }))} dir="rtl" />
      </Field>
      <Field label="Slug">
        <input value={state.slug} onChange={e => setState(prev => ({ ...prev, slug: e.target.value }))} placeholder="auto-generated from title" />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Description">
          <textarea value={state.description} onChange={e => setState(prev => ({ ...prev, description: e.target.value }))} rows={3} />
        </Field>
        <Field label="Description (Arabic)">
          <textarea value={state.descriptionAr} onChange={e => setState(prev => ({ ...prev, descriptionAr: e.target.value }))} rows={3} dir="rtl" />
        </Field>
      </div>
      <Field label="Condition">
        <select value={state.condition} onChange={e => setState(prev => ({ ...prev, condition: e.target.value }))}>
          <option value="NEW">New</option>
          <option value="REFURBISHED">Refurbished</option>
          <option value="USED">Used</option>
        </select>
      </Field>
    </StepCard>
  );
}

/* ── Shared card/field helpers (used by all steps) ──────────── */

export function StepCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #d9e2e6', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#16232b' }}>{title}</h2>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: '#5b6b74' }}>{subtitle}</p>
      <div style={{ display: 'grid', gap: 16 }}>{children}</div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600, color: '#16232b' }}>
      {label}
      <div style={{ fontWeight: 400 }}>
        {React.Children.map(children, child => {
          if (typeof child === 'object' && child !== null && 'props' in child) {
            return React.cloneElement(child as React.ReactElement<any>, {
              style: { width: '100%', padding: '9px 11px', fontSize: 13, border: '1px solid #d9e2e6', borderRadius: 6, ...(child as any).props?.style },
            });
          }
          return child;
        })}
      </div>
    </label>
  );
}
