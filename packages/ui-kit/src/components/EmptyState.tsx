/**
 * EmptyState — contextual empty page message.
 *
 * Every empty state answers: What is missing? Why? What to do next?
 */
import React from 'react';
import { colors, typeScale } from '../tokens';
import { IconBox } from '../icons';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 24px' }}>
      <div style={{
        width: 56,
        height: 56,
        borderRadius: '50%',
        background: colors.bgSubtle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 16px',
        color: colors.muted,
      }}>
        {icon || <IconBox size={24} />}
      </div>
      <h3 style={{
        fontSize: typeScale.h3.fontSize,
        fontWeight: typeScale.h3.fontWeight,
        color: colors.brand[700],
        marginBottom: 8,
        marginTop: 0,
      }}>
        {title}
      </h3>
      {description && (
        <p style={{ color: colors.muted, fontSize: typeScale.body.fontSize, marginBottom: 16, maxWidth: 400, margin: '0 auto 16px' }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
