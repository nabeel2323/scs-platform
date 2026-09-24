'use client';

import { useMemo } from 'react';
import { AttributeDefinition, ProductTypeSchema } from '../../lib/api';

/**
 * Right panel: checklist of VARIANT-scope attributes that serve as variant dimensions.
 * Only attributes with scope=VARIANT can be selected. Explains why an attribute qualifies.
 */
export default function VariantDimensionSelector({
  allAttributes,
  assignedIds,
  variantDimensionIds,
  onToggle,
}: {
  allAttributes: AttributeDefinition[];
  assignedIds: Set<string>;
  variantDimensionIds: Set<string>;
  onToggle: (attributeId: string) => void;
}) {
  // Only VARIANT-scope attributes that are assigned to this product type
  const variantCandidates = useMemo(() => {
    return allAttributes.filter(a => a.scope === 'VARIANT' && assignedIds.has(a.id));
  }, [allAttributes, assignedIds]);

  // Non-VARIANT attributes assigned — show as info
  const nonVariantAssigned = useMemo(() => {
    return allAttributes.filter(a => a.scope !== 'VARIANT' && assignedIds.has(a.id));
  }, [allAttributes, assignedIds]);

  // Compute potential combination count
  const dimensions = useMemo(() => {
    return allAttributes.filter(a => variantDimensionIds.has(a.id));
  }, [allAttributes, variantDimensionIds]);

  const combinationCount = useMemo(() => {
    if (dimensions.length === 0) return 0;
    // Each dimension's option count (for SELECT types, use options count; otherwise 2 as default)
    return dimensions.reduce((acc, dim) => {
      // We don't have option counts here, so use a placeholder
      return acc * 2; // Will be refined when options are loaded
    }, 1);
  }, [dimensions]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #d9e2e6', background: '#f7f9fa' }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#16232b' }}>Variant Dimensions</h4>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#5b6b74' }}>
          Select which VARIANT-scope attributes define product variants (e.g. RAM, Color, Size).
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {/* Selected dimensions */}
        {variantCandidates.length > 0 ? (
          variantCandidates.map(attr => {
            const isDimension = variantDimensionIds.has(attr.id);
            return (
              <label
                key={attr.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px',
                  cursor: 'pointer',
                  background: isDimension ? '#fef3c7' : 'transparent',
                  borderLeft: isDimension ? '3px solid #f59e0b' : '3px solid transparent',
                  transition: 'all 0.1s ease',
                }}
              >
                <input
                  type="checkbox"
                  checked={isDimension}
                  onChange={() => onToggle(attr.id)}
                  style={{ marginTop: 2, width: 'auto' }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: isDimension ? 600 : 400, color: '#16232b' }}>
                    {attr.name}
                    {attr.unit && <small style={{ color: '#5b6b74', marginLeft: 4 }}>({attr.unit})</small>}
                  </div>
                  <div style={{ fontSize: 11, color: '#5b6b74', marginTop: 2 }}>
                    <code>{attr.code}</code> · {attr.type}
                  </div>
                </div>
              </label>
            );
          })
        ) : (
          <div style={{ padding: '16px' }}>
            <p style={{ fontSize: 12, color: '#5b6b74', margin: 0 }}>
              No VARIANT-scope attributes assigned yet. Add VARIANT-scope attributes from the left panel to use them as variant dimensions.
            </p>
          </div>
        )}

        {/* Info: non-VARIANT attributes */}
        {nonVariantAssigned.length > 0 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #e5ecf0', marginTop: 8 }}>
            <h5 style={{ fontSize: 11, fontWeight: 600, color: '#5b6b74', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>
              Cannot be Variant Dimensions
            </h5>
            {nonVariantAssigned.map(attr => (
              <div key={attr.id} style={{ fontSize: 11, color: '#5b6b74', padding: '2px 0' }}>
                {attr.name} <small>({attr.scope} scope)</small>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #d9e2e6', background: '#f7f9fa' }}>
        <div style={{ fontSize: 12, color: '#16232b' }}>
          <strong>{variantDimensionIds.size}</strong> dimension{variantDimensionIds.size !== 1 ? 's' : ''} selected
        </div>
        {variantDimensionIds.size > 0 && (
          <div style={{ fontSize: 11, color: '#5b6b74', marginTop: 4 }}>
            Variants are unique combinations of these dimensions. Each merchant offer targets a specific variant.
          </div>
        )}
      </div>
    </div>
  );
}
