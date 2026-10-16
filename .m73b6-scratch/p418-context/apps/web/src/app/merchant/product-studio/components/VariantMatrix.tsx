'use client';

import { useState, useMemo } from 'react';
import { ProductTypeSchemaDetail } from '../../../../lib/buyer-api';

interface VariantMatrixProps {
  schema: ProductTypeSchemaDetail;
  enabledCombinations: Set<string>;
  onToggleCombination: (comboKey: string) => void;
  onToggleAll: (enable: boolean) => void;
}

export default function VariantMatrix({ schema, enabledCombinations, onToggleCombination, onToggleAll }: VariantMatrixProps) {
  const [search, setSearch] = useState('');

  // Extract VARIANT-scope dimensions with their options
  const dimensions = useMemo(() => {
    return schema.attributes
      .filter(a => a.definition?.scope === 'VARIANT' && a.options.length > 0)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map(attr => ({
        attrId: attr.attributeDefinitionId,
        name: attr.definition?.name ?? attr.attributeDefinitionId,
        options: attr.options
          .filter(o => !search || o.label?.toLowerCase().includes(search.toLowerCase()) || o.value.toLowerCase().includes(search.toLowerCase()))
          .sort((a, b) => a.sortOrder - b.sortOrder),
      }));
  }, [schema, search]);

  // Generate all possible combinations
  const allCombinations = useMemo(() => {
    if (dimensions.length === 0) return [];
    let combos: Array<Array<{ attrId: string; value: string; label: string }>> = [[]];
    for (const dim of dimensions) {
      const next: typeof combos = [];
      for (const existing of combos) {
        for (const opt of dim.options) {
          next.push([...existing, { attrId: dim.attrId, value: opt.value, label: opt.label || opt.value }]);
        }
      }
      combos = next;
    }
    return combos;
  }, [dimensions]);

  const totalCombos = allCombinations.length;
  const enabledCount = enabledCombinations.size;

  if (dimensions.length === 0) {
    return (
      <div>
        <p style={{ color: '#5b6b74', fontSize: 13 }}>
          This product type has no variant dimensions defined. Configure variant dimensions in the Product Type Builder.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="Search options…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #d9e2e6', borderRadius: 6, width: 200 }}
        />
        <span style={{ fontSize: 13, color: '#5b6b74' }}>
          <strong>{enabledCount}</strong> of {totalCombos} combinations selected
        </span>
        <button type="button" onClick={() => onToggleAll(true)}
          style={{ padding: '5px 12px', fontSize: 12, border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>
          Select All
        </button>
        <button type="button" onClick={() => onToggleAll(false)}
          style={{ padding: '5px 12px', fontSize: 12, border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>
          Deselect All
        </button>
      </div>

      {totalCombos > 1000 && (
        <div style={{ padding: 10, background: '#fef3c7', color: '#92400e', borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
          Warning: {totalCombos} combinations is very large. Consider reducing dimensions.
        </div>
      )}

      {/* Dimension chips */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        {dimensions.map(dim => (
          <div key={dim.attrId}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#16232b', marginBottom: 6 }}>{dim.name}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {dim.options.map(opt => (
                <span key={opt.value} style={{
                  padding: '4px 10px', fontSize: 12, borderRadius: 16,
                  background: '#e5f2f8', color: '#0f3340', border: '1px solid #b8d9e8',
                }}>
                  {opt.label || opt.value}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Combination grid */}
      {totalCombos <= 200 && (
        <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #d9e2e6', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f7f9fa', position: 'sticky', top: 0 }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #d9e2e6' }}>
                  <input
                    type="checkbox"
                    checked={enabledCount === totalCombos && totalCombos > 0}
                    onChange={e => onToggleAll(e.target.checked)}
                  />
                </th>
                {dimensions.map(d => (
                  <th key={d.attrId} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #d9e2e6', fontWeight: 600 }}>{d.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allCombinations.map((combo, i) => {
                const key = JSON.stringify(combo.map(c => ({ attrId: c.attrId, value: c.value })));
                const isEnabled = enabledCombinations.has(key);
                return (
                  <tr key={i} style={{ background: isEnabled ? '#f0fdf4' : i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                    <td style={{ padding: '6px 12px', borderBottom: '1px solid #eef2f4' }}>
                      <input type="checkbox" checked={isEnabled} onChange={() => onToggleCombination(key)} />
                    </td>
                    {combo.map((c, j) => (
                      <td key={j} style={{ padding: '6px 12px', borderBottom: '1px solid #eef2f4', color: '#16232b' }}>{c.label}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalCombos > 200 && (
        <p style={{ color: '#5b6b74', fontSize: 13 }}>
          Too many combinations to display ({totalCombos}). Use "Select All" or reduce variant dimensions.
        </p>
      )}
    </div>
  );
}
