'use client';

import { useMemo, useState } from 'react';
import { AttributeDefinition, AttributeGroup, AttributeOption } from '../../lib/api';
import styles from '../management.module.css';

/**
 * Left panel: attributes organized by group, with search/filter.
 * Shows which attributes are already assigned to the product type.
 */
export default function AttributeTree({
  allAttributes,
  groups,
  assignedIds,
  selectedId,
  onSelect,
  onAdd,
  onRemove,
}: {
  allAttributes: AttributeDefinition[];
  groups: AttributeGroup[];
  assignedIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState('');
  const [showUnassigned, setShowUnassigned] = useState(true);

  const filtered = useMemo(() => {
    let attrs = allAttributes;
    if (search.trim()) {
      const q = search.toLowerCase();
      attrs = attrs.filter(a =>
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q),
      );
    }
    if (scopeFilter) {
      attrs = attrs.filter(a => a.scope === scopeFilter);
    }
    return attrs;
  }, [allAttributes, search, scopeFilter]);

  // Group attributes: assigned first (by group), then unassigned
  const assignedByGroup = useMemo(() => {
    const map = new Map<string | null, AttributeDefinition[]>();
    for (const attr of filtered) {
      if (!assignedIds.has(attr.id)) continue;
      // Find which group this attr belongs to (if any) — for now show flat
      const key = null; // Groups are assigned at product-type level, not attribute level
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(attr);
    }
    return map;
  }, [filtered, assignedIds]);

  const unassigned = useMemo(() => {
    return filtered.filter(a => !assignedIds.has(a.id));
  }, [filtered, assignedIds]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #d9e2e6', background: '#f7f9fa' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search attributes…"
          style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d9e2e6', borderRadius: 6 }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <select
            value={scopeFilter}
            onChange={e => setScopeFilter(e.target.value)}
            style={{ flex: 1, padding: '6px 8px', fontSize: 12, border: '1px solid #d9e2e6', borderRadius: 6 }}
          >
            <option value="">All scopes</option>
            <option value="PRODUCT">PRODUCT</option>
            <option value="VARIANT">VARIANT</option>
            <option value="OFFER">OFFER</option>
          </select>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {/* Assigned attributes */}
        <div style={{ padding: '4px 16px' }}>
          <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5b6b74', letterSpacing: '0.5px', margin: '8px 0 4px' }}>
            Assigned ({assignedIds.size})
          </h4>
        </div>
        {Array.from(assignedByGroup.entries()).flatMap(([, attrs]) =>
          attrs.map(attr => (
            <AttributeRow
              key={attr.id}
              attr={attr}
              isAssigned
              isSelected={selectedId === attr.id}
              onSelect={() => onSelect(attr.id)}
              onToggle={() => onRemove(attr.id)}
            />
          )),
        )}
        {assignedIds.size === 0 && (
          <p style={{ padding: '8px 16px', fontSize: 12, color: '#5b6b74' }}>No attributes assigned yet.</p>
        )}

        {/* Unassigned (available to add) */}
        {showUnassigned && (
          <>
            <div style={{ padding: '4px 16px', borderTop: '1px solid #e5ecf0', marginTop: 8 }}>
              <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5b6b74', letterSpacing: '0.5px', margin: '8px 0 4px' }}>
                Available to Add ({unassigned.length})
              </h4>
            </div>
            {unassigned.map(attr => (
              <AttributeRow
                key={attr.id}
                attr={attr}
                isAssigned={false}
                isSelected={selectedId === attr.id}
                onSelect={() => onSelect(attr.id)}
                onToggle={() => onAdd(attr.id)}
              />
            ))}
            {unassigned.length === 0 && (
              <p style={{ padding: '8px 16px', fontSize: 12, color: '#5b6b74' }}>All matching attributes are assigned.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AttributeRow({ attr, isAssigned, isSelected, onSelect, onToggle }: {
  attr: AttributeDefinition;
  isAssigned: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const scopeColors: Record<string, { bg: string; fg: string }> = {
    PRODUCT: { bg: '#e0f2fe', fg: '#0369a1' },
    VARIANT: { bg: '#fef3c7', fg: '#92400e' },
    OFFER: { bg: '#ede9fe', fg: '#5b21b6' },
  };
  const sc = scopeColors[attr.scope] ?? { bg: '#f0f4f6', fg: '#16232b' };

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
        cursor: 'pointer', background: isSelected ? '#e5f2f8' : 'transparent',
        borderLeft: isSelected ? '3px solid #1e6178' : '3px solid transparent',
        transition: 'background 0.1s ease',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {attr.name}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 2, alignItems: 'center' }}>
          <code style={{ fontSize: 10, color: '#5b6b74' }}>{attr.code}</code>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 6, background: sc.bg, color: sc.fg }}>
            {attr.scope}
          </span>
          <span style={{ fontSize: 10, color: '#5b6b74' }}>{attr.type}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onToggle(); }}
        style={{
          padding: '3px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
          border: '1px solid',
          borderColor: isAssigned ? '#fca5a5' : '#86efac',
          color: isAssigned ? '#991b1b' : '#166534',
          background: isAssigned ? '#fee2e2' : '#dcfce7',
        }}
        title={isAssigned ? 'Remove from product type' : 'Add to product type'}
      >
        {isAssigned ? 'Remove' : 'Add'}
      </button>
    </div>
  );
}
