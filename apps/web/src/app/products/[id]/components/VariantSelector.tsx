import React from 'react';
import { useVariantSelection } from '../../../../hooks/useVariantSelection';
import { formatMinor } from '../../../../components/Shared';
import { analytics } from '../../../../lib/analytics';
import {
  colors, typeScale, radii, shadows, transitions,
} from '@scs/ui-kit';

interface VariantSelectorProps {
  productId: string;
  /** Product MOQ — passed through to the quantity input. */
  moq: number;
  /** Store currency fallback. */
  currency: string;
  /** Called when the buyer clicks "Add to Cart" with the resolved variant. */
  onAddToCart: (variantId: string, qty: number) => void;
  /** Whether the "Added ✓" feedback is active for the resolved variant. */
  addedFeedback?: boolean;
  /** Disable the add button (e.g. out of stock). */
  addDisabled?: boolean;
  /** Called once after the matrix loads to tell the parent whether variant dimensions exist. */
  onHasDimensions?: (has: boolean) => void;
}

/**
 * PHASE 7: Amazon-style dynamic variant selector.
 *
 * Renders one button-group per variant dimension (e.g. Color, Size). Unavailable
 * options are greyed out and disabled. Once all dimensions are selected the
 * resolved variant card appears with pricing, stock and an Add-to-Cart button.
 *
 * When the product has no product type (or no VARIANT-scope dimensions) the
 * selector renders nothing — the parent should fall back to the flat variant
 * list in that case.
 */
export function VariantSelector({
  productId, moq, currency, onAddToCart, addedFeedback, addDisabled, onHasDimensions,
}: VariantSelectorProps) {
  const {
    matrix, loading, error,
    selectedValues, selectValue,
    resolvedVariant, isUnavailable,
    isOptionAvailable,
  } = useVariantSelection(productId);

  const [qty, setQty] = React.useState(moq || 1);

  // Sync qty when MOQ changes (e.g. product loads after mount)
  React.useEffect(() => {
    if (moq && moq > qty) setQty(moq);
  }, [moq]); // eslint-disable-line react-hooks/exhaustive-deps

  // Notify parent whether this product has variant dimensions
  React.useEffect(() => {
    if (!loading && matrix) {
      onHasDimensions?.(matrix.dimensions.length > 0);
    }
  }, [loading, matrix, onHasDimensions]);

  // PHASE COS-14: fire variant_selected when a resolved variant appears
  const prevVariantRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (resolvedVariant && resolvedVariant.variantId !== prevVariantRef.current) {
      prevVariantRef.current = resolvedVariant.variantId;
      analytics.variantSelected(productId, resolvedVariant.variantId, selectedValues);
    }
  }, [resolvedVariant?.variantId]); // eslint-disable-line react-hooks/exhaustive-deps

  // No product type or no variant dimensions → render nothing so parent can fallback
  if (!loading && matrix && matrix.dimensions.length === 0) {
    return null;
  }

  if (error) {
    return (
      <div style={{ padding: 12, background: colors.errBg, border: `1px solid ${colors.err}`, borderRadius: radii.md, ...typeScale.bodySm, color: colors.err }}>
        Could not load variant options: {error}
      </div>
    );
  }

  if (loading || !matrix) {
    return (
      <div style={{ padding: 16, background: colors.bgSubtle, borderRadius: radii.md, ...typeScale.bodySm, color: colors.muted }}>
        Loading variants…
      </div>
    );
  }

  const resolvedCurrency = resolvedVariant?.pricing?.currency ?? currency;
  const outOfStock = !resolvedVariant || (resolvedVariant.stock?.totalAvailable ?? 0) <= 0;

  return (
    <div>
      {/* Dimension selectors */}
      {matrix.dimensions.map(dim => {
        return (
          <div key={dim.attributeDefinitionId} style={{ marginBottom: 16 }}>
            <div
              id={`vs-dim-${dim.attributeDefinitionId}`}
              style={{ ...typeScale.bodySm, fontWeight: 600, color: colors.ink, marginBottom: 6 }}
            >
              {dim.name}
              {selectedValues[dim.attributeDefinitionId] && (
                <span style={{ fontWeight: 400, color: colors.muted, marginLeft: 6 }}>
                  : {selectedValues[dim.attributeDefinitionId]}
                  {dim.unit ? ` ${dim.unit}` : ''}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="radiogroup" aria-labelledby={`vs-dim-${dim.attributeDefinitionId}`}>
              {dim.options.map(opt => {
                const isSelected = selectedValues[dim.attributeDefinitionId] === opt;
                const isAvail = isOptionAvailable(dim.attributeDefinitionId, opt);
                return (
                  <button
                    key={opt}
                    onClick={() => selectValue(dim.attributeDefinitionId, opt)}
                    disabled={!isAvail}
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`${dim.name}: ${opt}${!isAvail ? ' (unavailable)' : ''}`}
                    tabIndex={isSelected ? 0 : -1}
                    style={{
                      padding: '6px 14px',
                      fontSize: 13,
                      fontWeight: isSelected ? 600 : 400,
                      borderRadius: radii.sm,
                      border: isSelected
                        ? `2px solid ${colors.brand[700]}`
                        : isAvail
                          ? `1px solid ${colors.border}`
                          : `1px solid ${colors.border}`,
                      background: isSelected
                        ? colors.brand[50] ?? colors.bgSubtle
                        : isAvail
                          ? colors.surface
                          : colors.bgSubtle,
                      color: isAvail ? colors.ink : colors.disabled,
                      cursor: isAvail ? 'pointer' : 'not-allowed',
                      opacity: isAvail ? 1 : 0.5,
                      textDecoration: isAvail ? 'none' : 'line-through',
                      transition: `all ${transitions.fast}`,
                      boxShadow: isSelected ? shadows.sm : 'none',
                      outline: 'none',
                    }}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Resolved variant card */}
      {resolvedVariant && (
        <div style={{
          marginTop: 8, padding: '14px 18px',
          background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: radii.md,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ ...typeScale.body, fontWeight: 500, color: colors.brand[700] }}>
                {resolvedVariant.title || resolvedVariant.sku}
                {' '}
                <StockBadge stock={resolvedVariant.stock} />
              </div>
              <div style={{ ...typeScale.bodySm, color: colors.muted, fontFamily: 'monospace' }}>
                SKU: {resolvedVariant.sku}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="number"
                min={moq}
                value={qty}
                onChange={e => setQty(Math.max(moq, parseInt(e.target.value) || moq))}
                aria-label="Quantity"
                style={{
                  width: 64, padding: '4px 8px',
                  border: `1px solid ${colors.border}`, borderRadius: radii.sm,
                  fontSize: 13, textAlign: 'center',
                }}
              />
              <button
                onClick={() => onAddToCart(resolvedVariant.variantId, qty)}
                disabled={addDisabled || outOfStock}
                style={{
                  padding: '6px 18px', ...typeScale.button, color: '#fff',
                  background: addedFeedback ? colors.ok : outOfStock ? colors.disabled : colors.amber,
                  border: '1px solid ' + (addedFeedback ? colors.ok : outOfStock ? colors.disabled : '#a88734'),
                  borderRadius: radii.sm,
                  cursor: (addDisabled || outOfStock) ? 'not-allowed' : 'pointer',
                }}
              >
                {outOfStock ? 'Out of Stock' : addedFeedback ? '✓ Added' : 'Add to Cart'}
              </button>
            </div>
          </div>

          {/* Pricing */}
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            {resolvedVariant.pricing ? (
              <>
                <span style={{ fontSize: 18, fontWeight: 700, color: colors.brand[700] }}>
                  {formatMinor(resolvedVariant.pricing.unitPriceMinor, resolvedCurrency)}
                </span>
                <span style={{ ...typeScale.caption, color: colors.muted }}>
                  / {resolvedCurrency} at qty {qty}
                </span>
                {resolvedVariant.pricing.tiers.length > 1 && (
                  <span style={{ ...typeScale.caption, color: colors.muted }}>
                    · volume: {resolvedVariant.pricing.tiers.map(t => `${t.minQty}+ ${formatMinor(t.unitPriceMinor, resolvedCurrency)}`).join(' · ')}
                  </span>
                )}
              </>
            ) : (
              <span style={{ ...typeScale.bodySm, color: colors.warn }}>
                No active price — the cart will reject until the seller publishes one
              </span>
            )}
          </div>

          {/* Stock detail */}
          {resolvedVariant.stock && resolvedVariant.stock.totalAvailable > 0 && (
            <div style={{ marginTop: 6, ...typeScale.caption, color: colors.muted }}>
              {resolvedVariant.stock.totalAvailable} units available across {resolvedVariant.stock.warehouseCount} warehouse(s)
            </div>
          )}
        </div>
      )}

      {/* Unavailable selection */}
      {isUnavailable && (
        <div style={{
          marginTop: 8, padding: 12,
          background: colors.warnBg, border: `1px solid ${colors.warn}`,
          borderRadius: radii.md, ...typeScale.bodySm, color: colors.warn,
        }}>
          This combination is not available. Try selecting different options.
        </div>
      )}
    </div>
  );
}

// ── Stock badge (mirrors the inline version in page.tsx) ──────────

function StockBadge({ stock }: { stock?: { totalAvailable: number } | null }) {
  const available = stock?.totalAvailable ?? 0;
  if (available > 10) {
    return <span style={{ fontSize: 11, fontWeight: 700, color: colors.ok }}>In Stock</span>;
  }
  if (available > 0) {
    return <span style={{ fontSize: 11, fontWeight: 700, color: colors.err }}>Only {available} left</span>;
  }
  return <span style={{ fontSize: 11, fontWeight: 700, color: colors.muted }}>Out of stock</span>;
}
