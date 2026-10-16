'use client';

import Link from 'next/link';
import { ProductDetail, MediaItem } from '../lib/buyer-api';
import { colors, typeScale, radii } from '@scs/ui-kit';

interface ComparisonRow {
  code: string;
  label: string;
  values: Array<{ productId: string; value: unknown }>;
  differs: boolean;
}

interface Props {
  products: ProductDetail[];
  sharedAttributes: ComparisonRow[];
  compatible: boolean;
}

/**
 * PHASE COS-13: Side-by-side product comparison table.
 * Products as columns, shared attributes as rows.
 * Differences are highlighted. Max 4 products.
 */
export default function ProductComparison({ products, sharedAttributes, compatible }: Props) {
  if (products.length < 2) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: colors.muted }}>
        Select at least 2 products to compare.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      {!compatible && products.length >= 2 && (
        <div style={{
          padding: '10px 16px', marginBottom: 16, borderRadius: radii.md,
          background: colors.warnBg, color: colors.warn, fontSize: 13, fontWeight: 500,
        }}>
          These products have different product types. Comparison may be less meaningful.
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={thStyle}>Attribute</th>
            {products.map(p => (
              <th key={p.id} style={{ ...thStyle, minWidth: 180, textAlign: 'center' }}>
                <Link href={`/products/${p.id}`} style={{ color: colors.brand[700], textDecoration: 'none', fontWeight: 600 }}>
                  {p.title}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Image row */}
          <tr>
            <td style={labelStyle}>Image</td>
            {products.map(p => {
              const firstImage = (p.media ?? []).find((m: MediaItem) => m.mediaType === 'IMAGE');
              const src = firstImage?.displayUrl ?? firstImage?.thumbSrc;
              return (
                <td key={p.id} style={cellStyle}>
                  {src ? (
                    <img
                      src={src}
                      alt={p.title}
                      style={{ width: 80, height: 80, objectFit: 'contain', borderRadius: radii.sm, border: `1px solid ${colors.border}` }}
                    />
                  ) : (
                    <div style={{ width: 80, height: 80, background: colors.bgSubtle, borderRadius: radii.sm, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.muted, fontSize: 24 }}>
                      📦
                    </div>
                  )}
                </td>
              );
            })}
          </tr>

          {/* Price row */}
          <tr>
            <td style={labelStyle}>Price</td>
            {products.map(p => (
              <td key={p.id} style={{ ...cellStyle, fontWeight: 700, fontSize: 15, color: colors.brand[700] }}>
                {p.priceFromMinor != null
                  ? `${p.priceCurrency || 'SAR'} ${(p.priceFromMinor / 100).toFixed(2)}`
                  : 'On request'}
              </td>
            ))}
          </tr>

          {/* Brand */}
          <tr>
            <td style={labelStyle}>Brand</td>
            {products.map(p => (
              <td key={p.id} style={cellStyle}>{p.brandName ?? '—'}</td>
            ))}
          </tr>

          {/* Category */}
          <tr>
            <td style={labelStyle}>Category</td>
            {products.map(p => (
              <td key={p.id} style={cellStyle}>{p.categoryName ?? '—'}</td>
            ))}
          </tr>

          {/* MOQ */}
          <tr>
            <td style={labelStyle}>Min. Order</td>
            {products.map(p => (
              <td key={p.id} style={cellStyle}>{p.moq} units</td>
            ))}
          </tr>

          {/* Condition */}
          <tr>
            <td style={labelStyle}>Condition</td>
            {products.map(p => (
              <td key={p.id} style={cellStyle}>{p.condition ?? '—'}</td>
            ))}
          </tr>

          {/* Shared attribute rows */}
          {sharedAttributes.map(row => (
            <tr key={row.code} style={row.differs ? { background: '#fffbe6' } : undefined}>
              <td style={labelStyle}>
                {row.label}
                {row.differs && <span style={{ marginLeft: 6, fontSize: 10, color: colors.warn }}>✦</span>}
              </td>
              {row.values.map(v => (
                <td key={v.productId} style={{ ...cellStyle, background: row.differs ? '#fffbe6' : undefined }}>
                  {formatValue(v.value)}
                </td>
              ))}
            </tr>
          ))}

          {/* Seller row */}
          <tr>
            <td style={labelStyle}>Seller</td>
            {products.map(p => (
              <td key={p.id} style={cellStyle}>
                {p.store?.name ?? '—'}
                {p.store?.verificationStatus === 'VERIFIED' && (
                  <span style={{ marginLeft: 4, color: colors.ok, fontSize: 11 }}>✓</span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

const thStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderBottom: `2px solid ${colors.border}`,
  background: colors.bgSubtle,
  position: 'sticky',
  top: 0,
  zIndex: 1,
  fontSize: 13,
  fontWeight: 600,
  color: colors.ink,
};

const labelStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontWeight: 600,
  color: colors.ink,
  borderBottom: `1px solid ${colors.borderLight}`,
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
  minWidth: 120,
};

const cellStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: `1px solid ${colors.borderLight}`,
  textAlign: 'center',
  verticalAlign: 'top',
};
