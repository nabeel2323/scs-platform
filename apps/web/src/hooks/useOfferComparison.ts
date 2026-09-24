'use client';

import { useState, useMemo, useCallback } from 'react';
import type { Offer, RankedProductOffer } from '../lib/buyer-api';

/** A single row in the offer comparison table, merging base + ranked data. */
export interface OfferComparisonRow {
  offerId: string;
  storeId: string;
  storeName: string;
  storeSlug: string | null;
  storeVerified: boolean;
  variantId: string | null;
  currency: string;
  basePriceMinor: number;
  moq: number;
  leadTimeDays: number | null;
  /** Popularity data — null when the ranked endpoint hasn't returned this offer. */
  rank: RankedProductOffer | null;
  /** True for the current product owner's offer (shown but not in comparison). */
  isCurrentSeller: boolean;
}

export type OfferSortKey = 'price' | 'moq' | 'leadTime' | 'rank' | 'storeName';
export type SortDir = 'asc' | 'desc';

interface UseOfferComparisonResult {
  /** All comparison rows (excludes the current seller), sorted. */
  rows: OfferComparisonRow[];
  /** The current seller's own offer row, if any. */
  currentSellerRow: OfferComparisonRow | null;
  /** Total number of competing offers (excludes current seller). */
  competingCount: number;
  /** Current sort column. */
  sortKey: OfferSortKey;
  /** Current sort direction. */
  sortDir: SortDir;
  /** Toggle sort on a column — clicking the active column reverses direction. */
  toggleSort: (key: OfferSortKey) => void;
}

/**
 * PHASE 8: Merges the base offer list with ranked-offer analytics into sorted
 * comparison rows. The current seller is separated so the table only shows
 * competing offers.
 */
export function useOfferComparison(
  offers: Offer[],
  ranked: RankedProductOffer[],
  currentStoreId: string | null,
): UseOfferComparisonResult {
  const [sortKey, setSortKey] = useState<OfferSortKey>('price');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toggleSort = useCallback((key: OfferSortKey) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      setSortDir(key === 'price' ? 'asc' : 'asc');
      return key;
    });
  }, []);

  const rankedByOffer = useMemo(
    () => new Map(ranked.map(r => [r.offerId, r])),
    [ranked],
  );

  const { competing, currentSellerRow } = useMemo(() => {
    const activeOffers = offers.filter(o => o.status === 'ACTIVE');
    let currentSellerRow: OfferComparisonRow | null = null;
    const competing: OfferComparisonRow[] = [];

    for (const o of activeOffers) {
      const r = rankedByOffer.get(o.id);
      const row: OfferComparisonRow = {
        offerId: o.id,
        storeId: o.storeId,
        storeName: r?.storeName ?? o.storeId.slice(0, 8) + '…',
        storeSlug: r?.storeSlug ?? null,
        storeVerified: r?.storeVerified ?? false,
        variantId: o.variantId,
        currency: o.currency,
        basePriceMinor: o.basePriceMinor,
        moq: o.moq,
        leadTimeDays: o.leadTimeDays,
        rank: r ?? null,
        isCurrentSeller: o.storeId === currentStoreId,
      };
      if (row.isCurrentSeller) {
        currentSellerRow = row;
      } else {
        competing.push(row);
      }
    }
    return { competing, currentSellerRow };
  }, [offers, rankedByOffer, currentStoreId]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...competing].sort((a, b) => {
      switch (sortKey) {
        case 'price':
          return (a.basePriceMinor - b.basePriceMinor) * dir;
        case 'moq':
          return (a.moq - b.moq) * dir;
        case 'leadTime': {
          const al = a.leadTimeDays ?? 9999;
          const bl = b.leadTimeDays ?? 9999;
          return (al - bl) * dir;
        }
        case 'rank': {
          const ar = a.rank?.rank ?? 9999;
          const br = b.rank?.rank ?? 9999;
          return (ar - br) * dir;
        }
        case 'storeName':
          return a.storeName.localeCompare(b.storeName) * dir;
        default:
          return 0;
      }
    });
  }, [competing, sortKey, sortDir]);

  return {
    rows: sorted,
    currentSellerRow,
    competingCount: competing.length,
    sortKey,
    sortDir,
    toggleSort,
  };
}
