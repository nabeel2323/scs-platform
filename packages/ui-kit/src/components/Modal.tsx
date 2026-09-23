/**
 * Modal — animated dialog overlay.
 *
 * Replaces the raw <dialog> usage with a consistent modal pattern
 * including backdrop, close button, and entrance animation.
 */
import React, { useEffect, useRef } from 'react';
import { colors, radii, shadows, transitions } from '../tokens';
import { IconX } from '../icons';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: string | number;
  footer?: React.ReactNode;
}

export function Modal({ open, onClose, title, children, width = 560, footer }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event) => { e.preventDefault(); onClose(); };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  if (!open) return null;

  return (
    <>
      <style>{`
        @keyframes taif-modal-in { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
      `}</style>
      <dialog
        ref={dialogRef}
        onClick={(e) => { if (e.target === dialogRef.current) onClose(); }}
        style={{
          border: 'none',
          borderRadius: radii.lg,
          padding: 0,
          width: typeof width === 'number' ? `${width}px` : width,
          maxWidth: '92vw',
          maxHeight: '88vh',
          boxShadow: shadows.xl,
          color: colors.ink,
          overflow: 'hidden',
          animation: 'taif-modal-in 0.2s ease',
        }}
      >
        <style>{`.taif-modal::backdrop{background:${colors.overlay}}`}</style>
        <div className="taif-modal" style={{ display: 'flex', flexDirection: 'column', maxHeight: '88vh' }}>
          {/* Header */}
          {title && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: `1px solid ${colors.borderLight}`,
            }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: colors.brand[700] }}>{title}</h2>
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: colors.muted,
                  padding: 4,
                  display: 'flex',
                  borderRadius: radii.sm,
                  transition: `color ${transitions.fast}`,
                }}
                aria-label="Close"
              >
                <IconX size={18} />
              </button>
            </div>
          )}
          {/* Body */}
          <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
            {children}
          </div>
          {/* Footer */}
          {footer && (
            <div style={{
              padding: '14px 20px',
              borderTop: `1px solid ${colors.borderLight}`,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              background: colors.bgSubtle,
            }}>
              {footer}
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
