'use client';

import { useEffect } from 'react';
import { ProductVariant } from '../../../../lib/buyer-api';
import { type StudioState } from '../../../../hooks/useProductStudio';
import { StepCard } from './StepIdentity';
import VariantMatrix from '../components/VariantMatrix';

interface StepVariantsProps {
  state: StudioState;
  setState: React.Dispatch<React.SetStateAction<StudioState>>;
  existingVariants?: ProductVariant[];
  onLoadExistingVariants?: (productId: string) => Promise<ProductVariant[]>;
}

export default function StepVariants({ state, setState, existingVariants = [], onLoadExistingVariants }: StepVariantsProps) {
  // When an existing canonical product is selected, load its variants
  useEffect(() => {
    if (state.useExistingProductId && onLoadExistingVariants) {
      onLoadExistingVariants(state.useExistingProductId);
    }
  }, [state.useExistingProductId, onLoadExistingVariants]);

  // ── Existing product: show variant selector ─────────────────────
  if (state.useExistingProductId) {
    const selectedVariant = existingVariants.find(v => v.id === state.selectedExistingVariantId);

    return (
      <StepCard title="Existing Variants" subtitle={`This product has ${existingVariants.length} existing variant(s). Select one to attach your offer, or skip to create an offer at the product level.`}>
        {existingVariants.length === 0 ? (
          <div style={{ padding: 16, background: '#f7f9fa', borderRadius: 6, textAlign: 'center', color: '#5b6b74' }}>
            <p style={{ margin: '0 0 8px' }}>This product has no variants yet.</p>
            <p style={{ margin: 0, fontSize: 12 }}>You can create an offer at the product level, or go back and create variants first.</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
              {existingVariants.map(v => (
                <div
                  key={v.id}
                  onClick={() => setState(prev => ({ ...prev, selectedExistingVariantId: v.id }))}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', borderRadius: 6, cursor: 'pointer',
                    border: state.selectedExistingVariantId === v.id ? '2px solid #0f3340' : '1px solid #e5ecf0',
                    background: state.selectedExistingVariantId === v.id ? '#f0fdf4' : '#fff',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#16232b', fontFamily: 'monospace' }}>{v.sku}</div>
                    <div style={{ fontSize: 12, color: '#5b6b74' }}>{v.title || 'Untitled variant'}</div>
                  </div>
                  <div style={{ fontSize: 11, color: v.isActive ? '#166534' : '#991b1b' }}>
                    {v.isActive ? 'Active' : 'Inactive'}
                  </div>
                </div>
              ))}
            </div>
            {selectedVariant && (
              <div style={{ padding: 10, background: '#eaf5ef', color: '#1b7a4b', borderRadius: 6, fontSize: 12 }}>
                ✓ Selected variant: <strong>{selectedVariant.sku}</strong> — {selectedVariant.title || 'Untitled'}
              </div>
            )}
            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, selectedExistingVariantId: null }))}
              style={{ padding: '8px 14px', fontSize: 12, border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer', background: '#fff', color: '#5b6b74' }}
            >
              Clear selection (create offer at product level)
            </button>
          </>
        )}
      </StepCard>
    );
  }

  // ── New product: show variant matrix builder ────────────────────
  const schema = state.productTypeSchema;

  if (!schema || schema.variantDimensions.length === 0) {
    return (
      <StepCard title="Variant Matrix" subtitle="Select variant dimensions and combinations">
        <p style={{ color: '#5b6b74' }}>
          This product type has no variant dimensions. Skip to the next step.
        </p>
        {schema && (
          <div style={{ padding: 10, background: '#f7f9fa', borderRadius: 6, fontSize: 12, color: '#5b6b74' }}>
            Variant dimensions are configured by admins in the Product Type Builder.
            The current product type &quot;{schema.name}&quot; does not define any VARIANT-scope attributes.
          </div>
        )}
      </StepCard>
    );
  }

  const toggleCombination = (comboKey: string) => {
    setState(prev => {
      const next = new Set(prev.enabledCombinations);
      if (next.has(comboKey)) {
        next.delete(comboKey);
      } else {
        next.add(comboKey);
      }
      return { ...prev, enabledCombinations: next };
    });
  };

  const toggleAll = (enable: boolean) => {
    if (!schema) return;
    // Generate all combinations to enable/disable
    const variantAttrs = schema.attributes.filter((a: { definition?: { scope: string } | null; options: unknown[] }) => a.definition?.scope === 'VARIANT' && a.options.length > 0);
    if (variantAttrs.length === 0) return;

    let combos: Array<Array<{ attrId: string; value: string }>> = [[]];
    for (const attr of variantAttrs) {
      const next: typeof combos = [];
      for (const existing of combos) {
        for (const opt of attr.options) {
          next.push([...existing, { attrId: attr.attributeDefinitionId, value: (opt as { value: string }).value }]);
        }
      }
      combos = next;
    }

    if (enable) {
      setState(prev => ({
        ...prev,
        enabledCombinations: new Set(combos.map(c => JSON.stringify(c))),
      }));
    } else {
      setState(prev => ({ ...prev, enabledCombinations: new Set() }));
    }
  };

  return (
    <StepCard title="Variant Matrix" subtitle={`Select variant combinations. ${state.enabledCombinations.size} active.`}>
      <p style={{ fontSize: 13, color: '#5b6b74', marginBottom: 8 }}>
        Variant dimensions: <strong>{schema.variantDimensions.join(', ')}</strong>
      </p>
      <VariantMatrix
        schema={schema}
        enabledCombinations={state.enabledCombinations}
        onToggleCombination={toggleCombination}
        onToggleAll={toggleAll}
      />
    </StepCard>
  );
}
