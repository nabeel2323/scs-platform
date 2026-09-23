'use client';

/**
 * Tooltip — hover tooltip for collapsed sidebar and other contexts.
 */
import React, { useState, useRef, useEffect } from 'react';
import { colors, radii, shadows } from '../tokens';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'right' | 'top' | 'bottom';
}

export function Tooltip({ content, children, position = 'right' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const show = () => {
    timeoutRef.current = setTimeout(() => setVisible(true), 300);
  };
  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  const positionStyles: Record<string, React.CSSProperties> = {
    right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: 8 },
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 8 },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 8 },
  };

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible && (
        <div style={{
          position: 'absolute',
          ...positionStyles[position],
          background: colors.brand[900],
          color: '#fff',
          fontSize: 12,
          fontWeight: 500,
          padding: '5px 10px',
          borderRadius: radii.sm,
          boxShadow: shadows.md,
          whiteSpace: 'nowrap',
          zIndex: 1000,
          pointerEvents: 'none',
        }}>
          {content}
        </div>
      )}
    </div>
  );
}
