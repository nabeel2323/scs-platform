/**
 * PHASE COS-14: Lightweight client-side analytics tracker.
 *
 * Wraps POST /v1/analytics/track with fire-and-forget semantics — analytics
 * must never break UX, so all errors are silently swallowed. Events are
 * batched on a 2-second debounce to minimise network chatter.
 *
 * The BUYER role already carries the `analytics:track` permission so the
 * endpoint accepts these calls without extra auth wiring.
 */
import { authFetch } from './auth';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';
const FLUSH_INTERVAL_MS = 2_000;
const MAX_BATCH = 20;

interface PendingEvent {
  eventType: string;
  properties?: Record<string, unknown>;
}

let buffer: PendingEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** Flush buffered events to the API. Silently drops on failure. */
function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (buffer.length === 0) return;

  const batch = buffer.splice(0, MAX_BATCH);
  // If there are still events left, schedule another flush
  if (buffer.length > 0) scheduleFlush();

  const first = batch[0]!;
  const body = batch.length === 1
    ? JSON.stringify({ eventType: first.eventType, properties: first.properties })
    : JSON.stringify({
      events: batch.map(e => ({ eventType: e.eventType, properties: e.properties })),
    });

  const path = batch.length === 1 ? '/v1/analytics/track' : '/v1/analytics/track/batch';

  // Fire-and-forget: we don't await or handle errors
  authFetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => { /* analytics failures are silent */ });
}

function scheduleFlush() {
  if (!timer) timer = setTimeout(flush, FLUSH_INTERVAL_MS);
}

/**
 * Track an analytics event. Events are batched and flushed every 2s.
 *
 * @param eventType - Event name (e.g. 'product_viewed', 'search_performed')
 * @param properties - Optional event properties
 */
export function trackEvent(eventType: string, properties?: Record<string, unknown>) {
  buffer.push({ eventType, properties });
  if (buffer.length >= MAX_BATCH) { flush(); return; }
  scheduleFlush();
}

// ── Pre-defined event helpers (type-safe + consistent naming) ────

export const analytics = {
  productViewed(productId: string, storeId: string, title?: string) {
    trackEvent('product_viewed', { product_id: productId, store_id: storeId, title });
  },
  variantSelected(productId: string, variantId: string, dimensionValues: Record<string, string>) {
    trackEvent('variant_selected', { product_id: productId, variant_id: variantId, ...dimensionValues });
  },
  offerViewed(productId: string, offerCount: number) {
    trackEvent('offer_viewed', { product_id: productId, offer_count: offerCount });
  },
  offerSelected(offerId: string, productId: string, storeId: string) {
    trackEvent('offer_selected', { offer_id: offerId, product_id: productId, store_id: storeId });
  },
  searchPerformed(query: string, resultCount: number, categoryId?: string) {
    trackEvent('search_performed', { query, result_count: resultCount, category_id: categoryId });
  },
  filterUsed(filterType: string, filterValue: string) {
    trackEvent('filter_used', { filter_type: filterType, filter_value: filterValue });
  },
};
