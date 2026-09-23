'use client';

import { useState } from 'react';
import { statusColors, colors, radii, typeScale } from '@scs/ui-kit';

const DEFAULT_COLOR = { bg: '#eef1f3', fg: colors.muted };

export function StatusBadge({ status }: { status: string }) {
  const c = statusColors[status] || DEFAULT_COLOR;
  const label = status.replace(/_/g, ' ');

  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: radii.sm,
      ...typeScale.caption,
      fontWeight: 600,
      background: c.bg,
      color: c.fg,
      textTransform: 'capitalize',
    }}>
      {label}
    </span>
  );
}

export function formatMinor(minor: number, currency = 'SAR'): string {
  const major = minor / 100;
  if (currency === 'SAR') {
    return `${major.toFixed(2)} SAR`;
  }
  return `${major.toFixed(2)} ${currency}`;
}

/**
 * First image of a product, from either shape the column has ever held.
 *
 * `products.images` is a JSONB array of URL **strings** (contracts declare
 * `z.array(z.string().url())`, migration 0004 comments "primary image URLs
 * array"), but the listings read `images[0].url` — undefined for a string — so
 * every card rendered `<img src="">`, which the browser resolves against the
 * page URL: a broken image where the 📦 placeholder was meant to be. Objects
 * with a `url` are still accepted, because the column has no constraint.
 */
export function productImageSrc(images: unknown): string | undefined {
  if (!Array.isArray(images) || images.length === 0) return undefined;
  const first: unknown = images[0];
  if (typeof first === 'string') return first || undefined;
  if (first && typeof first === 'object') {
    const url = (first as Record<string, unknown>)['url'];
    if (typeof url === 'string' && url) return url;
  }
  return undefined;
}

/**
 * Listing-card image with graceful degradation.
 *
 * Prefers the API-resolved `imageUrl` (signed storage key or absolute URL),
 * falls back to the legacy `images` JSONB array via {@link productImageSrc},
 * and swaps to the placeholder when the URL fails to load (404 / broken link)
 * — so a card never shows a torn-image icon.
 */
export function ProductCardImage({
  product,
  alt,
  imgStyle,
  placeholderStyle,
  placeholder = '\u{1F4E6}',
}: {
  product: { imageUrl?: string | null; images?: unknown };
  alt: string;
  imgStyle: React.CSSProperties;
  placeholderStyle: React.CSSProperties;
  placeholder?: string;
}) {
  const [failed, setFailed] = useState(false);
  const resolved = product.imageUrl ?? productImageSrc(product.images);
  const src = !failed && resolved ? resolved : undefined;
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        style={imgStyle}
      />
    );
  }
  return <div style={placeholderStyle} aria-label="No image available">{placeholder}</div>;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Compact date for list rows: "Sep 22, 2026" (MMM DD, YYYY). */
export function formatDateCompact(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function EmptyState({ title, description, action }: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 24px' }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>📦</div>
      <h3 style={{ ...typeScale.h2, color: colors.brand[700], marginBottom: 8 }}>{title}</h3>
      {description && <p style={{ ...typeScale.body, color: colors.muted, marginBottom: 16 }}>{description}</p>}
      {action}
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
      <div style={{
        width: 32,
        height: 32,
        border: `3px solid ${colors.border}`,
        borderTopColor: colors.brand[700],
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" style={{
      background: colors.errBg,
      border: `1px solid ${colors.err}`,
      borderRadius: radii.md,
      padding: '12px 16px',
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <span style={{ color: colors.err, ...typeScale.body }}>{message}</span>
      {onRetry && (
        <button onClick={onRetry} style={{
          background: colors.err,
          color: '#fff',
          border: 'none',
          borderRadius: radii.sm,
          padding: '4px 12px',
          ...typeScale.button,
          cursor: 'pointer',
        }}>Retry</button>
      )}
    </div>
  );
}
