'use client';

import { type StudioState } from '../../../../hooks/useProductStudio';
import { StepCard } from './StepIdentity';
import VariantMatrix from '../components/VariantMatrix';

interface StepVariantsProps {
  state: StudioState;
  setState: React.Dispatch<React.SetStateAction<StudioState>>;
}

export default function StepVariants({ state, setState }: StepVariantsProps) {
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
