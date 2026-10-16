'use client';

import { useState, useEffect } from 'react';
import { AttributeDefinition, ProductTypeSchema } from '../../lib/api';

/**
 * Center panel: configuration for the selected attribute within this product type.
 * Controls: required, filterable, searchable, comparable, visibleInListing, visibleInDetail,
 * displayOrder, validation override.
 */
export default function AttributeConfigPanel({
  attribute,
  config,
  onChange,
}: {
  attribute: AttributeDefinition;
  config: ProductTypeSchema['attributes'][0] | null;
  onChange: (updates: Partial<ProductTypeSchema['attributes'][0]>) => void;
}) {
  const isRequired = config?.isRequired ?? false;
  const isFilterable = config?.isFilterable ?? false;
  const isSearchable = config?.isSearchable ?? false;
  const isComparable = config?.isComparable ?? false;
  const visibleInListing = config?.visibleInListing ?? true;
  const visibleInDetail = config?.visibleInDetail ?? true;
  const displayOrder = config?.displayOrder ?? 0;

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{attribute.name}</h3>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: '#5b6b74' }}>
        <code>{attribute.code}</code> · {attribute.type} · {attribute.scope}
        {attribute.unit && ` · Unit: ${attribute.unit}`}
      </p>

      {attribute.description && (
        <p style={{ fontSize: 13, color: '#16232b', marginBottom: 16, padding: 12, background: '#f7f9fa', borderRadius: 6, border: '1px solid #e5ecf0' }}>
          {attribute.description}
        </p>
      )}

      {/* Toggle configuration */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <ToggleField
          label="Required"
          description="Products of this type must have this attribute"
          checked={isRequired}
          onChange={v => onChange({ isRequired: v })}
        />
        <ToggleField
          label="Filterable"
          description="Shown as a search filter facet"
          checked={isFilterable}
          onChange={v => onChange({ isFilterable: v })}
        />
        <ToggleField
          label="Searchable"
          description="Included in full-text search"
          checked={isSearchable}
          onChange={v => onChange({ isSearchable: v })}
        />
        <ToggleField
          label="Comparable"
          description="Shown in product comparison tables"
          checked={isComparable}
          onChange={v => onChange({ isComparable: v })}
        />
        <ToggleField
          label="Visible in Listing"
          description="Shown on product cards in search results"
          checked={visibleInListing}
          onChange={v => onChange({ visibleInListing: v })}
        />
        <ToggleField
          label="Visible in Detail"
          description="Shown on the product detail page"
          checked={visibleInDetail}
          onChange={v => onChange({ visibleInDetail: v })}
        />
      </div>

      {/* Display order */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
          Display Order
        </label>
        <input
          type="number"
          min={0}
          value={displayOrder}
          onChange={e => onChange({ displayOrder: Number(e.target.value) })}
          style={{ width: 80, padding: '8px 10px', fontSize: 13, border: '1px solid #d9e2e6', borderRadius: 6 }}
        />
        <small style={{ display: 'block', marginTop: 4, fontSize: 11, color: '#5b6b74' }}>
          Lower numbers appear first in specifications and forms.
        </small>
      </div>

      {/* Scope warning for variant dimensions */}
      {attribute.scope === 'VARIANT' && (
        <div style={{ padding: 12, background: '#fef3c7', borderRadius: 6, border: '1px solid #fde68a', fontSize: 12, color: '#92400e' }}>
          <strong>VARIANT scope:</strong> This attribute can be used as a variant dimension (e.g. RAM, Color).
          Go to the Variant Dimensions panel to designate it.
        </div>
      )}

      {/* Options preview for SELECT/MULTI_SELECT */}
      {(attribute.type === 'SELECT' || attribute.type === 'MULTI_SELECT') && config?.options && config.options.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Options ({config.options.length})</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {config.options.map(opt => (
              <span key={opt.id} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 4,
                background: '#e0f2fe', color: '#0369a1',
              }}>
                {opt.value}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleField({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12,
      background: checked ? '#f0fdf4' : '#f7f9fa', borderRadius: 8,
      border: `1px solid ${checked ? '#86efac' : '#e5ecf0'}`,
      cursor: 'pointer', transition: 'all 0.12s ease',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ marginTop: 2, width: 'auto' }}
      />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#16232b' }}>{label}</div>
        <div style={{ fontSize: 11, color: '#5b6b74', marginTop: 2 }}>{description}</div>
      </div>
    </label>
  );
}
