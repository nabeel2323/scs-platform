/**
 * Toast — notification system.
 *
 * Provides a ToastProvider (wraps the app), a useToast() hook, and
 * the ToastContainer that renders notifications.
 *
 * Usage:
 *   // In layout.tsx:
 *   <ToastProvider>{children}</ToastProvider>
 *
 *   // In any page:
 *   const { success, error } = useToast();
 *   success('Product saved');
 */
import React, { createContext, useContext, useCallback, useState, useRef, useEffect } from 'react';
import { colors, radii, shadows, transitions } from '../tokens';
import { IconCheck, IconX, IconAlertTriangle, IconInfo, IconXCircle } from '../icons';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  success: (msg: string) => void;
  error: (msg: string) => void;
  warning: (msg: string) => void;
  info: (msg: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4000;

const typeConfig: Record<ToastType, { bg: string; border: string; iconColor: string; icon: React.ReactNode }> = {
  success: { bg: colors.okBg, border: colors.ok, iconColor: colors.ok, icon: <IconCheck size={16} /> },
  error: { bg: colors.errBg, border: colors.err, iconColor: colors.err, icon: <IconXCircle size={16} /> },
  warning: { bg: colors.warnBg, border: colors.warn, iconColor: colors.warn, icon: <IconAlertTriangle size={16} /> },
  info: { bg: colors.infoBg, border: colors.info, iconColor: colors.info, icon: <IconInfo size={16} /> },
};

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback((type: ToastType, message: string) => {
    const id = nextId++;
    setToasts(prev => [...prev.slice(-4), { id, type, message }]);
    const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    timersRef.current.set(id, timer);
  }, [dismiss]);

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(t => clearTimeout(t)); };
  }, []);

  const value: ToastContextValue = {
    success: useCallback((msg: string) => push('success', msg), [push]),
    error: useCallback((msg: string) => push('error', msg), [push]),
    warning: useCallback((msg: string) => push('warning', msg), [push]),
    info: useCallback((msg: string) => push('info', msg), [push]),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes taif-toast-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <div style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 380,
      }}>
        {toasts.map(toast => {
          const cfg = typeConfig[toast.type];
          return (
            <div key={toast.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              background: cfg.bg,
              border: `1px solid ${cfg.border}`,
              borderRadius: radii.md,
              boxShadow: shadows.md,
              animation: 'taif-toast-in 0.2s ease',
              fontSize: 13,
              fontWeight: 500,
              color: colors.ink,
            }}>
              <span style={{ color: cfg.iconColor, flexShrink: 0 }}>{cfg.icon}</span>
              <span style={{ flex: 1, lineHeight: 1.4 }}>{toast.message}</span>
              <button
                onClick={() => onDismiss(toast.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: colors.muted,
                  padding: 2,
                  flexShrink: 0,
                  display: 'flex',
                  transition: `color ${transitions.fast}`,
                }}
                aria-label="Dismiss"
              >
                <IconX size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
