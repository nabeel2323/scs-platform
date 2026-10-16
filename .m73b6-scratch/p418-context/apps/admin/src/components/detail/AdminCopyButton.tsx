'use client';

/**
 * AdminCopyButton — copy-to-clipboard for IDs, SKUs, slugs.
 *
 * Shows a checkmark + "Copied" indicator on success.
 */
import React, { useState, useCallback, useRef } from 'react';
import { IconCheck, IconClipboard } from '@scs/ui-kit';
import styles from './detail.module.css';

interface AdminCopyButtonProps {
  /** The text value to copy to clipboard. */
  value: string;
  /** Optional visible label (shown next to the icon). */
  label?: string;
  /** Custom className for the button. */
  className?: string;
}

export function AdminCopyButton({ value, label, className }: AdminCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    }
  }, [value]);

  return (
    <button
      type="button"
      className={`${styles['copyBtn']} ${copied ? styles['copyBtnCopied'] : ''} ${className || ''}`}
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : `Copy ${label || value}`}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
    >
      {copied ? <IconCheck size={13} /> : <IconClipboard size={13} />}
      {copied ? 'Copied' : (label || 'Copy')}
    </button>
  );
}
