import React from 'react';
import { formatMinor } from '../../../../components/Shared';
import {
  colors, typeScale, radii, shadows, transitions,
} from '@scs/ui-kit';
import type {
  OfferComparisonRow, OfferSortKey, SortDir,
} from '../../../../hooks/useOfferComparison';

interface OfferComparisonTableProps {
  rows: OfferComparisonRow[];
  competingCount: number;
  sortKey: OfferSortKey;
  sortDir: SortDir;
  toggleSort: (key: OfferSortKey) => void;
  /** Called when the buyer clicks Add to Cart on a competing offer. */
  onAddToCart: (offerId: string, variantId: string | null, storeId: string) => void;
  /** The added-feedback key — matched against `offer:${offerId}`. */
  addedKey: string | null;
  /** The product owner's own offer row (shown separately). */
  currentSellerRow?: OfferComparisonRow | null;
}

/**
 * PHASE 8: B2B offer comparison table.
 *
 * Replaces the old flat "Other Sellers" list with a sortable, accessible
 * comparison table. Columns: Supplier, Price, MOQ, Lead Time, Popularity.
 * Per-row Add to Cart. "Most Popular" badge on the ranked #1 offer.
 *
 * On mobile (< 768px) the table degrades to stacked cards.
 */
export function OfferComparisonTable({
  rows, competingCount, sortKey, sortDir, toggleSort,
  onAddToCart, addedKey, currentSellerRow,
}: OfferComparisonTableProps) {
  if (competingCount === 0 && !currentSellerRow) return null;

  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ ...typeScale.h2, color: colors.brand[700], marginBottom: 12 }}>
        All Offers <span style={{ ...typeScale.bodySm, fontWeight: 400, color: colors.muted }}>({competingCount} competitor{competingCount !== 1 ? 's' : ''})</span>
      </h3>

      {/* Current seller banner */}
      {currentSellerRow && (
        <div style={{
          padding: '10px 16px', marginBottom: 12,
          background: colors.brand[50], border: `1px solid ${colors.brand[300]}`,
          borderRadius: radii.md, display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: 'wrap', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...typeScale.caption, fontWeight: 700, color: colors.brand[700], padding: '2px 8px', background: colors.brand[100], borderRadius: radii.sm }}>
              This Seller
            </span>
            <span style={{ ...typeScale.bodySm, fontWeight: 500 }}>
              {currentSellerRow.storeName}
            </span>
            {currentSellerRow.storeVerified && (
              <span style={{ ...typeScale.caption, color: colors.ok }} title="Verified store">✓ Verified</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 700, color: colors.brand[700] }}>
              {formatMinor(currentSellerRow.basePriceMinor, currentSellerRow.currency)}
            </span>
            {currentSellerRow.moq > 1 && (
              <span style={{ ...typeScale.caption, color: colors.muted }}>MOQ: {currentSellerRow.moq}</span>
            )}
          </div>
        </div>
      )}

      {/* Desktop table */}
      <div className="oct-desktop" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <caption style={{ ...typeScale.caption, color: colors.muted, marginBottom: 8, textAlign: 'left', captionSide: 'top' }}>
            Compare offers from different suppliers for this product
          </caption>
          <thead>
            <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
              <SortHeader label="Supplier" sortKey="storeName" active={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortHeader label="Price" sortKey="price" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
              <SortHeader label="MOQ" sortKey="moq" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
              <SortHeader label="Lead Time" sortKey="leadTime" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
              <SortHeader label="Popularity" sortKey="rank" active={sortKey} dir={sortDir} onClick={toggleSort} />
              <th scope="col" style={{ padding: '8px 12px', textAlign: 'right', ...typeScale.caption, fontWeight: 600, color: colors.muted }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const added = addedKey === `offer:${row.offerId}`;
              const isPopular = row.rank?.isMostPopular === true;
              const hasSales = row.rank ? row.rank.ordersCount > 0 : false;
              const hidden = row.rank?.disclosureHidden === true;
              return (
                <tr
                  key={row.offerId}
                  style={{
                    borderBottom: `1px solid ${colors.border}`,
                    background: isPopular ? '#fffdf5' : 'transparent',
                    transition: `background ${transitions.fast}`,
                  }}
                >
                  {/* Supplier */}
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 500, color: colors.ink }}>{row.storeName}</span>
                      {row.storeVerified && (
                        <span style={{ fontSize: 10, color: colors.ok, fontWeight: 600 }} title="Verified supplier">✓</span>
                      )}
                      {isPopular && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '1px 6px',
                          background: colors.amber, color: '#fff', borderRadius: radii.sm,
                        }} title={`Ranked #1 — ${row.rank!.unitsSold} units sold`}>
                          ★ Most Popular
                        </span>
                      )}
                    </div>
                    {hasSales && !isPopular && !hidden && (
                      <div style={{ ...typeScale.caption, color: colors.muted, marginTop: 2 }}>
                        #{row.rank!.rank} · {row.rank!.unitsSold} sold
                      </div>
                    )}
                    {hidden && (
                      <div style={{ ...typeScale.caption, color: colors.muted, marginTop: 2, fontStyle: 'italic' }}>
                        Sales data not disclosed
                      </div>
                    )}
                  </td>
                  {/* Price */}
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: colors.brand[700], whiteSpace: 'nowrap' }}>
                    {formatMinor(row.basePriceMinor, row.currency)}
                  </td>
                  {/* MOQ */}
                  <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {row.moq > 1 ? row.moq : <span style={{ color: colors.muted }}>1</span>}
                  </td>
                  {/* Lead Time */}
                  <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {row.leadTimeDays != null
                      ? `${row.leadTimeDays}d`
                      : <span style={{ color: colors.muted }}>—</span>}
                  </td>
                  {/* Popularity */}
                  <td style={{ padding: '10px 12px' }}>
                    {!hidden && row.rank && row.rank.rank != null ? (
                      <span style={{ ...typeScale.caption, fontWeight: 600, color: isPopular ? colors.amber : colors.muted }}>
                        #{row.rank.rank}
                      </span>
                    ) : (
                      <span style={{ ...typeScale.caption, color: colors.disabled }}>—</span>
                    )}
                  </td>
                  {/* Action */}
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <button
                      onClick={() => onAddToCart(row.offerId, row.variantId, row.storeId)}
                      style={{
                        padding: '5px 14px', ...typeScale.button, color: '#fff',
                        background: added ? colors.ok : colors.amber,
                        border: '1px solid ' + (added ? colors.ok : '#a88734'),
                        borderRadius: radii.sm, cursor: 'pointer',
                        transition: `background ${transitions.fast}`,
                      }}
                    >
                      {added ? '✓ Added' : 'Add to Cart'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="oct-mobile" style={{ display: 'none' }}>
        {rows.map(row => {
          const added = addedKey === `offer:${row.offerId}`;
          const isPopular = row.rank?.isMostPopular === true;
          const hasSales = row.rank ? row.rank.ordersCount > 0 : false;
          const hidden = row.rank?.disclosureHidden === true;
          return (
            <div
              key={row.offerId}
              style={{
                padding: '12px 14px', marginBottom: 8,
                background: isPopular ? '#fffdf5' : colors.surface,
                border: `1px solid ${isPopular ? colors.amber : colors.border}`,
                borderRadius: radii.md,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, color: colors.ink }}>{row.storeName}</span>
                    {row.storeVerified && <span style={{ fontSize: 10, color: colors.ok }}>✓</span>}
                    {isPopular && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', background: colors.amber, color: '#fff', borderRadius: radii.sm }}>
                        ★ #1
                      </span>
                    )}
                  </div>
                  {hasSales && !isPopular && !hidden && (
                    <div style={{ ...typeScale.caption, color: colors.muted }}>#{row.rank!.rank} · {row.rank!.unitsSold} sold</div>
                  )}
                  {hidden && (
                    <div style={{ ...typeScale.caption, color: colors.muted, fontStyle: 'italic' }}>Sales not disclosed</div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: colors.brand[700], fontSize: 15 }}>
                    {formatMinor(row.basePriceMinor, row.currency)}
                  </div>
                  <div style={{ ...typeScale.caption, color: colors.muted }}>
                    MOQ: {row.moq}{row.leadTimeDays != null ? ` · ${row.leadTimeDays}d` : ''}
                  </div>
                </div>
              </div>
              <button
                onClick={() => onAddToCart(row.offerId, row.variantId, row.storeId)}
                style={{
                  marginTop: 8, width: '100%', padding: '6px 0',
                  ...typeScale.button, color: '#fff',
                  background: added ? colors.ok : colors.amber,
                  border: '1px solid ' + (added ? colors.ok : '#a88734'),
                  borderRadius: radii.sm, cursor: 'pointer',
                }}
              >
                {added ? '✓ Added' : 'Add to Cart'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sortable column header ────────────────────────────────────────

function SortHeader({
  label, sortKey, active, dir, onClick, align,
}: {
  label: string; sortKey: OfferSortKey;
  active: OfferSortKey; dir: SortDir;
  onClick: (key: OfferSortKey) => void;
  align?: 'left' | 'right';
}) {
  const isActive = active === sortKey;
  return (
    <th
      onClick={() => onClick(sortKey)}
      scope="col"
      style={{
        padding: '8px 12px',
        textAlign: align ?? 'left',
        cursor: 'pointer',
        userSelect: 'none',
        ...typeScale.caption,
        fontWeight: isActive ? 700 : 600,
        color: isActive ? colors.brand[700] : colors.muted,
        borderBottom: isActive ? `2px solid ${colors.brand[700]}` : 'none',
        whiteSpace: 'nowrap',
        transition: `color ${transitions.fast}`,
      }}
      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      {label}
      {isActive && <span style={{ marginLeft: 4 }}>{dir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );
}
