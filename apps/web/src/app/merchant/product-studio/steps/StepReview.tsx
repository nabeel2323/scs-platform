'use client';

import { Category, Brand, ProductTypeSchemaAttribute } from '../../../../lib/buyer-api';
import { type StudioState } from '../../../../hooks/useProductStudio';
import { StepCard } from './StepIdentity';
import CompletenessScore from '../components/CompletenessScore';

interface StepReviewProps {
  state: StudioState;
  stores: Array<{ id: string; displayName: string }>;
  categories: Category[];
  brands: Brand[];
  completenessScore: number;
}

export default function StepReview({ state, stores, categories, brands, completenessScore }: StepReviewProps) {
  const storeName = stores.find(s => s.id === state.storeId)?.displayName ?? '—';
  const categoryName = categories.find(c => c.id === state.categoryId)?.name ?? '—';
  const brandName = brands.find(b => b.id === state.brandId)?.name ?? '—';
  const productTypeName = state.productTypeSchema?.name ?? '—';
  const filledAttrs = Object.keys(state.attributeValues).filter(k => state.attributeValues[k]).length;
  const totalAttrs = state.productTypeSchema?.attributes.filter((a: ProductTypeSchemaAttribute) => a.definition?.scope === 'PRODUCT').length ?? 0;

  return (
    <StepCard title="Review & Publish" subtitle="Verify all information before saving.">
      {/* Completeness score */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, background: '#f7f9fa', borderRadius: 8 }}>
        <CompletenessScore score={completenessScore} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#16232b' }}>
            {state.productId ? 'Updating existing product' : 'Creating new product'}
          </div>
          <div style={{ fontSize: 11, color: '#5b6b74' }}>
            {state.useExistingProductId ? 'Based on existing canonical product' : 'New canonical product'}
          </div>
        </div>
      </div>

      {/* Section: Identity */}
      <ReviewSection title="Identity" status={state.title ? 'complete' : 'incomplete'}>
        <ReviewRow label="Store" value={storeName} />
        <ReviewRow label="Title" value={state.title || '—'} />
        {state.titleAr && <ReviewRow label="Title (Arabic)" value={state.titleAr} />}
        <ReviewRow label="Category" value={categoryName} />
        <ReviewRow label="Brand" value={brandName} />
        <ReviewRow label="Product Type" value={productTypeName} />
        <ReviewRow label="Condition" value={state.condition} />
        {(state.gtin || state.ean || state.mpn) && (
          <>
            {state.gtin && <ReviewRow label="GTIN" value={state.gtin} />}
            {state.ean && <ReviewRow label="EAN" value={state.ean} />}
            {state.mpn && <ReviewRow label="MPN" value={state.mpn} />}
          </>
        )}
      </ReviewSection>

      {/* Section: Specifications */}
      <ReviewSection title="Specifications" status={filledAttrs > 0 ? 'complete' : 'skipped'}>
        <ReviewRow label="Attributes Filled" value={`${filledAttrs} / ${totalAttrs}`} />
        {state.productTypeSchema && filledAttrs > 0 && (
          <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
            {state.productTypeSchema.attributes
              .filter((a: ProductTypeSchemaAttribute) => a.definition?.scope === 'PRODUCT' && state.attributeValues[a.attributeDefinitionId])
              .slice(0, 10)
              .map((a: ProductTypeSchemaAttribute) => (
                <ReviewRow key={a.attributeDefinitionId}
                  label={a.definition?.name ?? a.attributeDefinitionId}
                  value={state.attributeValues[a.attributeDefinitionId] ?? ''}
                />
              ))}
            {filledAttrs > 10 && <div style={{ fontSize: 11, color: '#5b6b74' }}>…and {filledAttrs - 10} more</div>}
          </div>
        )}
      </ReviewSection>

      {/* Section: Variants */}
      <ReviewSection title="Variants" status={state.enabledCombinations.size > 0 ? 'complete' : 'skipped'}>
        <ReviewRow label="Active Combinations" value={String(state.enabledCombinations.size)} />
      </ReviewSection>

      {/* Section: Offer */}
      <ReviewSection title="Offer" status={state.basePriceMinor > 0 ? 'complete' : 'incomplete'}>
        <ReviewRow label="Price" value={state.basePriceMinor > 0 ? `${(state.basePriceMinor / 100).toFixed(2)} ${state.currency}` : '—'} />
        <ReviewRow label="MOQ" value={String(state.moq)} />
        <ReviewRow label="Lead Time" value={`${state.leadTimeDays} day(s)`} />
      </ReviewSection>

      {/* Section: Media */}
      <ReviewSection title="Media" status={state.mediaItems.length > 0 ? 'complete' : 'incomplete'}>
        <ReviewRow label="Images" value={`${state.mediaItems.length} image(s)`} />
        {state.mediaItems.some(m => m.isPrimary) && <ReviewRow label="Primary Image" value="Set" />}
      </ReviewSection>
    </StepCard>
  );
}

/* ── Review helpers ─────────────────────────────────────────── */

function ReviewSection({ title, status, children }: { title: string; status: 'complete' | 'incomplete' | 'skipped'; children: React.ReactNode }) {
  const icon = status === 'complete' ? '✓' : status === 'skipped' ? '–' : '!';
  const color = status === 'complete' ? '#22c55e' : status === 'skipped' ? '#5b6b74' : '#f59e0b';
  return (
    <div style={{ border: '1px solid #e5ecf0', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#f7f9fa', borderBottom: '1px solid #e5ecf0' }}>
        <span style={{ width: 20, height: 20, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#16232b' }}>{title}</span>
      </div>
      <div style={{ padding: '8px 14px' }}>{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f6f9' }}>
      <span style={{ fontSize: 12, color: '#5b6b74' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: '#16232b', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
    </div>
  );
}
