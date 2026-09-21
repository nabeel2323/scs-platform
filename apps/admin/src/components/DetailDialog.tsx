'use client';

import { ReactNode, useEffect, useId, useRef } from 'react';
import styles from './management.module.css';

export default function DetailDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!element.open) element.showModal();
    closeButton.current?.focus();
    return () => { element.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} className={styles['dialog']} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className={styles['dialogHeader']}>
      <h2 id={titleId}>{title}</h2>
      <button ref={closeButton} type="button" onClick={onClose} aria-label="Close details">Close ×</button>
    </div>
    {children}
  </dialog>;
}
