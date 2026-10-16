'use client';

import { useMemo } from 'react';
import { ProductTypeSchemaDetail, ProductTypeSchemaAttribute } from '../../../../lib/buyer-api';
import { type StudioState } from '../../../../hooks/useProductStudio';
import { StepCard, Field } from './StepIdentity';
import { evaluateConditionalRules, type ConditionalRule, type AttributeEffect } from '../../../../lib/conditionalRules';

interface StepSpecificationsProps {
  state: StudioState;
  setState: React.Dispatch<React.SetStateAction<StudioState>>;
}

export default function StepSpecifications({ state, setState }: StepSpecificationsProps) {
  const schema = state.productTypeSchema;
  const attributes = useMemo(() => schema?.attributes ?? [], [schema]);

  // Hooks must run unconditionally on every render to preserve hook order.
  const allRules: ConditionalRule[] = useMemo(() => {
    const rules: ConditionalRule[] = [];
    for (const attr of attributes) {
      if (Array.isArray(attr.conditionalRules)) {
        rules.push(...(attr.conditionalRules as ConditionalRule[]));
      }
    }
    return rules;
  }, [attributes]);

  const allAttrIds = useMemo(() => attributes.map(a => a.attributeDefinitionId), [attributes]);

  const conditionalEffects: Map<string, AttributeEffect> = useMemo(
    () => evaluateConditionalRules(allRules, state.attributeValues, allAttrIds),
    [allRules, state.attributeValues, allAttrIds],
  );

  if (!schema) {
    return (
      <StepCard title="Specifications" subtitle="Fill in the attributes defined by the product type">
        <p style={{ color: '#5b6b74' }}>No product type selected. Go back to Identity and select a product type first.</p>
      </StepCard>
    );
  }

  // Group attributes by their group (if assigned), then ungrouped
  const productAttrs = schema.attributes
    .filter((a: ProductTypeSchemaAttribute) => a.definition?.scope === 'PRODUCT')
    .sort((a: ProductTypeSchemaAttribute, b: ProductTypeSchemaAttribute) => a.displayOrder - b.displayOrder);

  // Determine effective required/hidden state per attribute
  const isEffectivelyRequired = (attr: ProductTypeSchemaAttribute): boolean => {
    if (attr.required) return true;
    return conditionalEffects.get(attr.attributeDefinitionId)?.required ?? false;
  };
  const isHidden = (attr: ProductTypeSchemaAttribute): boolean => {
    return conditionalEffects.get(attr.attributeDefinitionId)?.hidden ?? false;
  };

  // Group by group name (use definition grouping or fallback)
  const grouped = new Map<string, typeof productAttrs>();
  const ungrouped: typeof productAttrs = [];
  for (const attr of productAttrs) {
    // Find which group this attribute belongs to (if any)
    const group = schema.groups.find((g: ProductTypeSchemaDetail['groups'][number]) =>
      schema.attributes.some((a: ProductTypeSchemaAttribute) => a.attributeDefinitionId === attr.attributeDefinitionId)
    );
    const groupName = group?.name ?? 'General';
    if (!grouped.has(groupName)) grouped.set(groupName, []);
    grouped.get(groupName)!.push(attr);
  }

  const updateAttrValue = (_attrId: string, value: string) => {
    setState(prev => ({
      ...prev,
      attributeValues: { ...prev.attributeValues, [_attrId]: value },
    }));
  };

  const visibleAttrs = productAttrs.filter((a: ProductTypeSchemaAttribute) => !isHidden(a));
  const filledCount = visibleAttrs.filter((a: ProductTypeSchemaAttribute) => state.attributeValues[a.attributeDefinitionId]).length;
  const requiredCount = visibleAttrs.filter((a: ProductTypeSchemaAttribute) => isEffectivelyRequired(a)).length;
  const filledRequired = visibleAttrs.filter((a: ProductTypeSchemaAttribute) => isEffectivelyRequired(a) && state.attributeValues[a.attributeDefinitionId]).length;

  return (
    <StepCard title="Specifications" subtitle={`Fill in the attributes defined by "${schema.name}". ${filledCount}/${productAttrs.length} filled, ${filledRequired}/${requiredCount} required.`}>
      {/* Progress bar */}
      <div style={{ height: 4, background: '#e5ecf0', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', background: filledRequired === requiredCount ? '#22c55e' : '#f59e0b',
          width: `${requiredCount > 0 ? (filledRequired / requiredCount) * 100 : 100}%`,
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* Render grouped attributes */}
      {Array.from(grouped.entries()).map(([groupName, attrs]) => (
        <div key={groupName}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f3340', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #e5ecf0' }}>
            {groupName}
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            {attrs.map((attr: ProductTypeSchemaAttribute) => {
              if (isHidden(attr)) return null;
              const conditionallyRequired = !attr.required && isEffectivelyRequired(attr);
              return renderAttributeField(
                attr,
                state.attributeValues[attr.attributeDefinitionId] ?? '',
                (value) => updateAttrValue(attr.attributeDefinitionId, value),
                conditionallyRequired,
              );
            })}
          </div>
        </div>
      ))}
    </StepCard>
  );
}

function renderAttributeField(
  attr: ProductTypeSchemaDetail['attributes'][number],
  value: string,
  onChange: (value: string) => void,
  conditionallyRequired?: boolean,
) {
  const def = attr.definition;
  if (!def) return null;

  const isRequired = attr.required || conditionallyRequired;
  const label = `${def.name}${isRequired ? ' *' : ''}${def.unit ? ` (${def.unit})` : ''}`;
  const helpText = def.description ?? '';
  const requiredBadge = conditionallyRequired && !attr.required
    ? <span style={{ fontSize: 10, color: '#d97706', fontWeight: 600, marginLeft: 6 }}>(conditionally required)</span>
    : null;

  // SELECT / MULTI_SELECT → dropdown from options
  if (attr.options.length > 0) {
    return (
      <Field key={attr.attributeDefinitionId} label={<>{label}{requiredBadge}</>}>
        <select value={value} onChange={e => onChange(e.target.value)}>
          <option value="">Select…</option>
          {attr.options.map(o => <option key={o.id} value={o.value}>{o.label || o.value}</option>)}
        </select>
        {helpText && <span style={{ fontSize: 11, color: '#5b6b74' }}>{helpText}</span>}
      </Field>
    );
  }

  // BOOLEAN → yes/no dropdown
  if (def.type === 'BOOLEAN') {
    return (
      <Field key={attr.attributeDefinitionId} label={<>{label}{requiredBadge}</>}>
        <select value={value} onChange={e => onChange(e.target.value)}>
          <option value="">Select…</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
        {helpText && <span style={{ fontSize: 11, color: '#5b6b74' }}>{helpText}</span>}
      </Field>
    );
  }

  // INTEGER / DECIMAL → number input
  if (def.type === 'INTEGER' || def.type === 'DECIMAL') {
    return (
      <Field key={attr.attributeDefinitionId} label={<>{label}{requiredBadge}</>}>
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={helpText || `Enter ${def.type === 'INTEGER' ? 'whole number' : 'decimal number'}`}
          step={def.type === 'INTEGER' ? '1' : 'any'}
        />
        {helpText && <span style={{ fontSize: 11, color: '#5b6b74' }}>{helpText}</span>}
      </Field>
    );
  }

  // DATE → date input
  if (def.type === 'DATE') {
    return (
      <Field key={attr.attributeDefinitionId} label={<>{label}{requiredBadge}</>}>
        <input type="date" value={value} onChange={e => onChange(e.target.value)} />
        {helpText && <span style={{ fontSize: 11, color: '#5b6b74' }}>{helpText}</span>}
      </Field>
    );
  }

  // Default: text input (TEXT, RICH_TEXT, etc.)
  return (
    <Field key={attr.attributeDefinitionId} label={<>{label}{requiredBadge}</>}>
      {def.type === 'RICH_TEXT' ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} placeholder={helpText || `Enter ${def.name}`} />
      ) : (
        <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={helpText || `Enter ${def.name}`} />
      )}
      {helpText && <span style={{ fontSize: 11, color: '#5b6b74' }}>{helpText}</span>}
    </Field>
  );
}
