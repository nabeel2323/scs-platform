/**
 * Tabs — tab navigation for segmenting content within a page.
 */
import React from 'react';
import { colors, radii, transitions, typeScale } from '../tokens';

interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeKey: string;
  onChange: (key: string) => void;
  style?: React.CSSProperties;
}

export function Tabs({ tabs, activeKey, onChange, style }: TabsProps) {
  return (
    <div style={{
      display: 'flex',
      gap: 0,
      borderBottom: `1px solid ${colors.border}`,
      ...style,
    }} role="tablist">
      {tabs.map(tab => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 16px',
              fontSize: typeScale.body.fontSize,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? colors.brand[700] : colors.muted,
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${isActive ? colors.brand[700] : 'transparent'}`,
              marginBottom: -1,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: `color ${transitions.fast}, border-color ${transitions.fast}`,
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                background: isActive ? colors.brand[50] : colors.bgSubtle,
                color: isActive ? colors.brand[700] : colors.muted,
                padding: '1px 7px',
                borderRadius: radii.full,
              }}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
