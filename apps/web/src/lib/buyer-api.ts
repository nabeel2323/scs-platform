/**
 * Buyer API client — search, cart, orders, notifications.
 */
import { authFetch } from './auth';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';

// ── Error handling ───────────────────────────────────────────

/**
 * HTTP-aware error thrown by every API function.  Carries the status code so
 * UI layers can differentiate 409 (conflict), 422 (validation), 429 (rate
 * limit), etc. from generic 500 failures.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }

  /**
   * Build an ApiError from a failed Response.  Reads the problem+json body
   * when available, otherwise falls back to a status-keyed message.
   */
  static async from(res: Response, fallback: string): Promise<ApiError> {
    let detail = '';
    try {
      const body = await res.clone().json();
      detail = body?.detail || body?.message || '';
    } catch { /* non-JSON body — use status map */ }

    if (!detail) {
      detail = fallback;
    }
    return new ApiError(res.status, detail);
  }
}

// ── Types ────────────────────────────────────────────────────

export interface FacetEntry {
  code: string;
  label: string;
  type: string;
  values: Array<{ value: string; count: number }>;
}

export interface SearchResult {
  items: Product[];
  total: number;
  query: string;
  facets?: FacetEntry[];
}

export interface Product {
  id: string;
  storeId: string;
  categoryId: string | null;
  brandId: string | null;
  slug: string;
  title: string;
  titleAr: string | null;
  description: string | null;
  descriptionAr?: string | null;
  status: string;
  condition?: string;
  isAvailable: boolean;
  moq: number;
  images: unknown[];
  attributes: Record<string, unknown>;
  productTypeId?: string | null;
  createdAt: string;
  /**
   * Listing-card enrichment (A5-2), present on search results and on a store's
   * product grid: the seller and the cheapest variant price at this product's
   * MOQ. `priceFromMinor` is null when no active price list covers the product's
   * variants.
   */
  store?: ProductStore | null;
  priceFromMinor?: number | null;
  priceCurrency?: string | null;
  /** Card enrichment: first product image signed for display; null if unresolvable. */
  imageUrl?: string | null;
  /** Offer enrichment: number of ACTIVE merchant offers across all stores. */
  activeOfferCount?: number;
  /** Offer enrichment: lowest base price among active merchant offers. */
  lowestOfferPriceMinor?: number | null;
  lowestOfferCurrency?: string | null;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  barcode: string | null;
  title: string | null;
  titleAr: string | null;
  unit: string;
  weightGrams: number | null;
  isActive: boolean;
  priceMinor?: number;
  minQty?: number;
  /** Effective tier pricing for this variant, present on product detail (A5-1). */
  pricing?: VariantPricing | null;
  /** Stock summary across all store warehouses, present on product detail. */
  stock?: { totalAvailable: number; totalOnHand: number; warehouseCount: number } | null;
}

/** One step of a volume-price ladder. `maxQty` is exclusive; null = unlimited. */
export interface PriceTierDisplay {
  minQty: number;
  maxQty: number | null;
  unitPriceMinor: number;
}

export interface VariantPricing {
  priceListId: string;
  priceListName: string;
  currency: string;
  unitPriceMinor: number;
  minQty: number;
  tiers: PriceTierDisplay[];
}

/** Seller identity as exposed on a product (A5-1) — never the full store record. */
export interface ProductStore {
  id: string;
  displayName: string;
  name: string;
  slug: string;
  /** The store's own currency, used when no price list has been resolved. */
  currency: string;
  verificationStatus: string;
  status: string;
}

export interface ProductDetail extends Product {
  store: ProductStore | null;
  variants: ProductVariant[];
  /** Product photos (GET /v1/products/:id/media), URLs signed for display. */
  media?: MediaItem[];
  categoryName?: string | null;
  brandName?: string | null;
  imageCount?: number;
  /** Structured attribute values (PHASE 5e). */
  attributeValues?: Array<{ code: string; label: string; value: unknown }>;
}

export interface Category {
  id: string;
  name: string;
  nameAr: string | null;
  slug: string;
  path: string;
  productCount: number;
  isActive: boolean;
}

export interface Cart {
  id: string;
  userId: string;
  status: string;
  promoCode: string | null;
  totalMinor: number;
  items: CartItem[];
}

export interface CartItem {
  id: string;
  cartId: string;
  storeId: string;
  variantId: string;
  quantity: number;
  priceMinor: number;
  tierMinQty: number;
  lineTotalMinor: number;
  promoSnapshot: Record<string, unknown>;
  // PHASE 10: the offer that priced this line (null for legacy/price-list-only).
  offerId?: string | null;
  // projected by CartService.listCartItems (A5-3)
  title?: string;
  sku?: string;
  storeName?: string;
  storeSlug?: string;
  currency?: string;
  // PHASE 14: enriched offer metadata joined from merchant_offers.
  offer?: {
    id: string;
    leadTimeDays: number | null;
    moq: number;
    status: string;
  } | null;
}

export interface MasterOrder {
  id: string;
  buyerId: string;
  status: string;
  deliveryAddress: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
  subOrders: SubOrder[];
  // A2-4: set only when every sub-order shares one currency; null means the cart
  // spanned suppliers with different money, so totalsByCurrency is the answer.
  currency?: string | null;
  totalsByCurrency?: Record<string, number>;
}

export interface SubOrder {
  id: string;
  masterOrderId: string;
  storeId: string;
  buyerId: string;
  status: string;
  fulfillmentMethod: string;
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  taxMinor: number;
  totalMinor: number;
  createdAt: string;
  items: OrderItem[];
  // joined
  storeName?: string;
  storeSlug?: string;
  // A2-4: the currency every *_Minor field on this order is expressed in.
  currency?: string;
  /** False when it was inferred from the seller rather than snapshotted. */
  currencyFromSnapshot?: boolean;
  /**
   * Line count, from `listOrders`, which returns orders without their `items`
   * (A5-16). A card must read this instead of `items?.length`, which is
   * undefined on a list response and used to render "0 items" for every order.
   */
  itemCount?: number;
  /**
   * Organization that owns the fulfilling store (from `attachOrderIdentity`).
   * Lets a merchant view detect an activeOrg/order mismatch.
   */
  storeOrgId?: string | null;
  /**
   * Buyer contact resolved server-side by `attachBuyerContacts` from the
   * order's own `buyerId`, so the merchant queue no longer depends on the
   * cached org-scoped customers directory for labels. Null when the buyer
   * row cannot be read (deleted user) or when a spec mock lacks `query.users`.
   */
  buyerName?: string | null;
  buyerPhone?: string | null;
  buyerEmail?: string | null;
}

export interface OrderItem {
  id: string;
  orderId: string;
  variantId: string;
  sku: string;
  title: string;
  quantity: number;
  qtyConfirmed: number | null;
  unitPriceMinor: number;
  tierMinQty: number;
  lineTotalMinor: number;
}

export interface StatusHistoryEntry {
  id: string;
  orderId: string;
  fromStatus: string | null;
  toStatus: string;
  changedBy: string | null;
  actorType: string;
  reason: string | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  channel: string;
  template: string;
  title: string | null;
  body: string;
  status: string;
  readAt: string | null;
  createdAt: string;
}

export interface Review {
  id: string;
  orderId: string;
  reviewerId: string;
  subjectId: string;
  subjectType: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

// ── Search ───────────────────────────────────────────────────

export async function searchProducts(params: {
  q?: string;
  categoryId?: string;
  brandId?: string;
  storeId?: string;
  limit?: number;
  offset?: number;
  attrFilters?: Record<string, string[]>;
}): Promise<SearchResult> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.categoryId) qs.set('categoryId', params.categoryId);
  if (params.brandId) qs.set('brandId', params.brandId);
  if (params.storeId) qs.set('storeId', params.storeId);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.offset) qs.set('offset', String(params.offset));
  if (params.attrFilters && Object.keys(params.attrFilters).length > 0) qs.set('attrFilters', JSON.stringify(params.attrFilters));
  const res = await authFetch(`${API_URL}/v1/search?${qs}`);
  if (!res.ok) throw await ApiError.from(res, `Search failed (${res.status})`);
  return res.json();
}

export async function fetchCategories(): Promise<Category[]> {
  const res = await authFetch(`${API_URL}/v1/search/categories`);
  if (!res.ok) throw await ApiError.from(res, `Categories failed (${res.status})`);
  return res.json();
}

export async function fetchBrands(): Promise<
  { id: string; name: string; slug: string; logoUrl: string | null }[]
> {
  const res = await authFetch(`${API_URL}/v1/search/brands`);
  if (!res.ok) throw await ApiError.from(res, `Brands failed (${res.status})`);
  return res.json();
}

// ── Products ─────────────────────────────────────────────────

/** Product + seller + per-variant pricing (`store`/`variants` added by A5-1). */
export async function fetchProduct(id: string): Promise<ProductDetail> {
  const res = await authFetch(`${API_URL}/v1/products/${id}`);
  if (!res.ok) throw await ApiError.from(res, `Product not found (${res.status})`);
  return res.json();
}

export async function fetchProductVariants(productId: string): Promise<ProductVariant[]> {
  const res = await authFetch(`${API_URL}/v1/products/${productId}/variants`);
  if (!res.ok) throw await ApiError.from(res, `Variants failed (${res.status})`);
  return res.json();
}

// ── Stores (public) ──────────────────────────────────────────

export async function fetchPublicStores(params?: {
  limit?: number;
  offset?: number;
}): Promise<unknown[]> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const res = await authFetch(`${API_URL}/v1/stores?${qs}`);
  if (!res.ok) throw await ApiError.from(res, `Stores failed (${res.status})`);
  return res.json();
}

export async function fetchPublicStore(slugOrId: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/stores/${slugOrId}`);
  if (!res.ok) throw await ApiError.from(res, `Store not found (${res.status})`);
  return res.json();
}

/**
 * A store's product grid. Rows arrive enriched like search results (name,
 * price), so `Product.store` / `priceFromMinor` are populated here too.
 *
 * `status` is not defaulted: the endpoint is shared with the merchant's own
 * catalog screen, which must keep seeing DRAFT and REJECTED listings, so a
 * buyer-facing caller has to ask for ACTIVE explicitly.
 */
export interface StoreProductsEnvelope {
  items: unknown[];
  total: number;
}

export async function fetchStoreProducts(
  storeId: string,
  params?: { categoryId?: string; status?: string; search?: string; limit?: number; offset?: number },
): Promise<StoreProductsEnvelope> {
  const qs = new URLSearchParams();
  if (params?.categoryId) qs.set('categoryId', params.categoryId);
  if (params?.status) qs.set('status', params.status);
  if (params?.search) qs.set('q', params.search);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const res = await authFetch(`${API_URL}/v1/stores/${storeId}/products?${qs}`);
  if (!res.ok) throw await ApiError.from(res, `Store products failed (${res.status})`);
  return res.json();
}

// ── Cart ─────────────────────────────────────────────────────

export async function fetchCart(): Promise<Cart> {
  const res = await authFetch(`${API_URL}/v1/cart`);
  if (!res.ok) throw await ApiError.from(res, `Cart failed (${res.status})`);
  return res.json();
}

export async function addToCart(input: {
  variantId: string;
  storeId: string;
  quantity: number;
  /** PHASE 13: Optional explicit merchant offer to buy under. */
  offerId?: string;
}): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/cart/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Could not add to cart (${res.status})`);
  return res.json();
}

export async function updateCartItem(itemId: string, quantity: number): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/cart/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity }),
  });
  if (!res.ok) throw await ApiError.from(res, `Update cart failed (${res.status})`);
  return res.json();
}

export async function removeCartItem(itemId: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/cart/items/${itemId}`, { method: 'DELETE' });
  if (!res.ok) throw await ApiError.from(res, `Remove cart item failed (${res.status})`);
  return res.json();
}

export async function clearCart(): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/cart`, { method: 'DELETE' });
  if (!res.ok) throw await ApiError.from(res, `Clear cart failed (${res.status})`);
  return res.json();
}

/** PHASE 11: Validate offers in cart; re-price stale items. */
export interface CartValidationReport {
  valid: string[];
  repriced: Array<{ itemId: string; oldPriceMinor: number; newPriceMinor: number }>;
  stale: Array<{ itemId: string; reason: string }>;
  cart: unknown;
}

export async function validateCart(): Promise<CartValidationReport> {
  const res = await authFetch(`${API_URL}/v1/cart/validate`, { method: 'POST' });
  if (!res.ok) throw await ApiError.from(res, `Cart validation failed (${res.status})`);
  return res.json();
}

export async function applyPromoCode(code: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/cart/promo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw await ApiError.from(res, `Invalid promo code (${res.status})`);
  return res.json();
}

// ── Checkout ─────────────────────────────────────────────────

export async function checkout(input: {
  deliveryAddress: Record<string, unknown>;
  notes?: string;
  idempotencyKey?: string;
  fulfillmentMethod?: string;
}): Promise<MasterOrder> {
  const res = await authFetch(`${API_URL}/v1/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Checkout failed (${res.status})`);
  return res.json();
}

// ── Orders ───────────────────────────────────────────────────

export async function fetchOrders(params?: {
  status?: string;
  storeId?: string;
}): Promise<unknown[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.storeId) qs.set('storeId', params.storeId);
  const res = await authFetch(`${API_URL}/v1/orders?${qs}`);
  if (!res.ok) throw await ApiError.from(res, `Orders failed (${res.status})`);
  return res.json();
}

export async function fetchOrder(
  id: string,
): Promise<SubOrder & { items: OrderItem[]; financialBreakdown: unknown }> {
  const res = await authFetch(`${API_URL}/v1/orders/${id}`);
  if (!res.ok) throw await ApiError.from(res, `Order failed (${res.status})`);
  return res.json();
}

export async function fetchMasterOrder(id: string): Promise<MasterOrder> {
  const res = await authFetch(`${API_URL}/v1/orders/master/${id}`);
  if (!res.ok) throw await ApiError.from(res, `Master order failed (${res.status})`);
  return res.json();
}

export async function fetchOrderHistory(orderId: string): Promise<StatusHistoryEntry[]> {
  const res = await authFetch(`${API_URL}/v1/orders/${orderId}/history`);
  if (!res.ok) throw await ApiError.from(res, `History failed (${res.status})`);
  return res.json();
}

export async function cancelOrder(orderId: string, reason: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/orders/${orderId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw await ApiError.from(res, `Cancel failed (${res.status})`);
  return res.json();
}

/** A4-7: reorder reports per-line outcomes, because a past order can contain
 *  variants that were delisted or lost their price tier since. */
export interface ReorderResult {
  masterOrderId: string;
  added: { title: string; quantity: number }[];
  skipped: { title: string; reason: string }[];
  cart: Cart;
}

export async function reorder(orderId: string): Promise<ReorderResult> {
  const res = await authFetch(`${API_URL}/v1/orders/master/${orderId}/reorder`, {
    method: 'POST',
  });
  if (!res.ok) throw await ApiError.from(res, `Reorder failed (${res.status})`);
  return res.json();
}

// ── Notifications ────────────────────────────────────────────

export async function fetchNotifications(limit = 50, offset = 0): Promise<Notification[]> {
  const res = await authFetch(`${API_URL}/v1/notifications?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw await ApiError.from(res, `Notifications failed (${res.status})`);
  return res.json();
}

export async function fetchUnreadCount(): Promise<{ count: number }> {
  const res = await authFetch(`${API_URL}/v1/notifications/unread-count`);
  if (!res.ok) throw await ApiError.from(res, `Unread count failed (${res.status})`);
  return res.json();
}

export async function markNotificationRead(id: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/notifications/${id}/read`, { method: 'PATCH' });
  if (!res.ok) throw await ApiError.from(res, `Mark read failed (${res.status})`);
  return res.json();
}

export async function markNotificationUnread(id: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/notifications/${id}/unread`, { method: 'PATCH' });
  if (!res.ok) throw await ApiError.from(res, `Mark unread failed (${res.status})`);
  return res.json();
}

export async function markAllNotificationsRead(): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/notifications/read-all`, { method: 'PATCH' });
  if (!res.ok) throw await ApiError.from(res, `Mark all read failed (${res.status})`);
  return res.json();
}

// ── Reviews ──────────────────────────────────────────────────

export async function createReview(
  orderId: string,
  input: {
    subjectId: string;
    subjectType: string;
    rating: number;
    comment?: string;
  },
): Promise<Review> {
  const res = await authFetch(`${API_URL}/v1/orders/${orderId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Review failed (${res.status})`);
  return res.json();
}

export async function fetchStoreReviews(storeId: string): Promise<Review[]> {
  const res = await authFetch(`${API_URL}/v1/stores/${storeId}/reviews`);
  if (!res.ok) throw await ApiError.from(res, `Store reviews failed (${res.status})`);
  return res.json();
}

export interface TrustSnapshot {
  entityId: string;
  entityType: string;
  avgRating: string | null;
  totalReviews: number;
  score: string;
  badges: string[];
  computedAt: string;
}

export async function fetchTrust(entityType: string, entityId: string): Promise<TrustSnapshot | null> {
  const res = await authFetch(`${API_URL}/v1/trust/${entityType}/${entityId}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw await ApiError.from(res, `Trust snapshot failed (${res.status})`);
  }
  return res.json();
}

// ── Disputes ─────────────────────────────────────────────────

export interface Dispute {
  id: string;
  orderId: string;
  raisedBy: string;
  againstId: string;
  reason: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

export interface DisputeEvent {
  id: string;
  disputeId: string;
  type: string;
  body: string;
  attachments: string[] | null;
  submittedBy: string;
  createdAt: string;
}

export async function createDispute(
  orderId: string,
  input: {
    againstId: string;
    reason: string;
  },
): Promise<Dispute> {
  const res = await authFetch(`${API_URL}/v1/orders/${orderId}/dispute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Dispute failed (${res.status})`);
  return res.json();
}

export async function fetchDisputes(status?: string): Promise<Dispute[]> {
  const qs = status ? `?status=${status}` : '';
  const res = await authFetch(`${API_URL}/v1/disputes${qs}`);
  if (!res.ok) throw await ApiError.from(res, `Disputes failed (${res.status})`);
  return res.json();
}

export async function fetchDisputeEvents(disputeId: string): Promise<DisputeEvent[]> {
  const res = await authFetch(`${API_URL}/v1/disputes/${disputeId}/events`);
  if (!res.ok) throw await ApiError.from(res, `Dispute events failed (${res.status})`);
  return res.json();
}

export async function submitDisputeEvidence(
  disputeId: string,
  body: string,
  attachments?: string[],
): Promise<DisputeEvent> {
  const res = await authFetch(`${API_URL}/v1/disputes/${disputeId}/evidence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, attachments }),
  });
  if (!res.ok) throw await ApiError.from(res, `Evidence submission failed (${res.status})`);
  return res.json();
}

// ── Merchant Order Management ────────────────────────────────

export async function acceptMerchantOrder(orderId: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/orders/${orderId}/accept`, { method: 'POST' });
  if (!res.ok) throw await ApiError.from(res, `Accept failed (${res.status})`);
  return res.json();
}

export async function rejectMerchantOrder(orderId: string, reason: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/orders/${orderId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw await ApiError.from(res, `Reject failed (${res.status})`);
  return res.json();
}

export async function partiallyAcceptMerchantOrder(
  orderId: string,
  confirmations: { itemId: string; qtyConfirmed: number }[],
): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/orders/${orderId}/items/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmations }),
  });
  if (!res.ok) throw await ApiError.from(res, `Partial accept failed (${res.status})`);
  return res.json();
}

export async function transitionOrderStatus(
  orderId: string,
  status: string,
  reason?: string,
): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/orders/${orderId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, reason }),
  });
  if (!res.ok) throw await ApiError.from(res, `Status transition failed (${res.status})`);
  return res.json();
}

// ── Favorites / Wishlist ─────────────────────────────────────

export interface Favorite {
  id: string;
  userId: string;
  productId: string;
  createdAt: string;
  product?: Product;
}

export async function fetchFavorites(): Promise<Favorite[]> {
  const res = await authFetch(`${API_URL}/v1/me/favorites`);
  if (!res.ok) throw await ApiError.from(res, `Favorites failed (${res.status})`);
  return res.json();
}

export async function addFavorite(productId: string): Promise<Favorite> {
  const res = await authFetch(`${API_URL}/v1/me/favorites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId }),
  });
  if (!res.ok) throw await ApiError.from(res, `Add favorite failed (${res.status})`);
  return res.json();
}

export async function removeFavorite(productId: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/me/favorites/${productId}`, { method: 'DELETE' });
  if (!res.ok) throw await ApiError.from(res, `Remove favorite failed (${res.status})`);
  return res.json();
}

// ── Saved Suppliers (§21.3) ──────────────────────────────────

/** A store (supplier) bookmarked by a retailer, enriched with store data. */
export interface SavedSupplier {
  id: string;
  userId: string;
  storeId: string;
  createdAt: string;
  store?: Record<string, unknown> | null;
}

export async function fetchSavedSuppliers(): Promise<SavedSupplier[]> {
  const res = await authFetch(`${API_URL}/v1/me/saved-suppliers`);
  if (!res.ok) throw await ApiError.from(res, `Saved suppliers failed (${res.status})`);
  return res.json();
}

export async function saveSupplier(storeId: string): Promise<SavedSupplier> {
  const res = await authFetch(`${API_URL}/v1/me/saved-suppliers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId }),
  });
  if (!res.ok) throw await ApiError.from(res, `Save supplier failed (${res.status})`);
  return res.json();
}

export async function removeSavedSupplier(storeId: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/me/saved-suppliers/${storeId}`, { method: 'DELETE' });
  if (!res.ok) throw await ApiError.from(res, `Remove saved supplier failed (${res.status})`);
  return res.json();
}

// ── Profile ─────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  phone: string;
  email: string | null;
  fullName: string;
  locale: string;
  status: string;
  /** Resolved server-side for the caller's active org (RBAC audit GAP-6). */
  role?: string;
  activeOrgId?: string | null;
  perms?: string[];
}

export async function fetchProfile(): Promise<UserProfile> {
  const res = await authFetch(`${API_URL}/v1/me`);
  if (!res.ok) throw await ApiError.from(res, `Profile failed (${res.status})`);
  return res.json();
}

export async function updateProfile(body: {
  fullName?: string;
  email?: string;
  locale?: string;
}): Promise<UserProfile> {
  const res = await authFetch(`${API_URL}/v1/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await ApiError.from(res, `Update profile failed (${res.status})`);
  return res.json();
}

export async function fetchMyOrganizations(): Promise<unknown[]> {
  const res = await authFetch(`${API_URL}/v1/me/organizations`);
  if (!res.ok) throw await ApiError.from(res, `Organizations failed (${res.status})`);
  return res.json();
}

// ── Merchant Customers ───────────────────────────────────────

export interface CustomerSummary {
  buyerId: string;
  buyerName: string | null;
  buyerPhone: string | null;
  buyerEmail: string | null;
  orderCount: number;
  totalSpentMinor: number;
  lastOrderAt: string;
}

export async function fetchMerchantCustomers(): Promise<CustomerSummary[]> {
  const res = await authFetch(`${API_URL}/v1/merchant/customers`);
  if (!res.ok) throw await ApiError.from(res, `Fetch customers failed (${res.status})`);
  return res.json();
}

/**
 * Cached buyer-directory lookup for order rows.
 *
 * The orders list endpoint returns only `buyerId` (A5-16), so buyer names and
 * phone numbers come from the org-scoped customers endpoint
 * (GET /v1/merchant/customers), which joins the users table. Results are
 * cached in-module for 60s so revisits and re-renders do not refetch. The
 * cache is deliberately not invalidated on order transitions: names and
 * phone numbers do not change when an order status does.
 */
let customersCache: { data: CustomerSummary[]; at: number } | null = null;
const CUSTOMERS_CACHE_TTL_MS = 60_000;

export async function fetchMerchantCustomersCached(): Promise<CustomerSummary[]> {
  if (customersCache && Date.now() - customersCache.at < CUSTOMERS_CACHE_TTL_MS) {
    return customersCache.data;
  }
  const data = await fetchMerchantCustomers();
  customersCache = { data, at: Date.now() };
  return data;
}

/**
 * Drop the cached customers directory so the next fetch re-reads it. Called when
 * a new order arrives (a first-time buyer only appears in the directory once
 * they have an order), so a merchant sees the new customer immediately instead
 * of waiting out the 60s TTL.
 */
export function clearMerchantCustomersCache(): void {
  customersCache = null;
}

// ── Merchant Catalog Management ──────────────────────────────

export interface MediaItem {
  id: string;
  productId: string;
  variantId: string | null;
  mediaType: string;
  url: string;
  thumbUrl: string | null;
  blurhash: string | null;
  altText: string | null;
  altTextAr: string | null;
  sortOrder: number;
  fileSize: number;
  mimeType: string | null;
  createdAt: string;
  /** Browser-renderable URL (signed or absolute); null when the object is missing. */
  displayUrl?: string | null;
  /** Signed thumbnail URL, when a thumb exists and is renderable. */
  thumbSrc?: string | null;
}

export interface CreateProductInput {
  storeId: string;
  title: string;
  titleAr?: string;
  slug?: string;
  description?: string;
  descriptionAr?: string;
  categoryId?: string;
  brandId?: string;
  condition?: string;
  images?: string[];
}

export interface UpdateProductInput {
  title?: string;
  titleAr?: string;
  description?: string;
  descriptionAr?: string;
  status?: string;
  condition?: string;
  images?: string[];
  categoryId?: string;
  brandId?: string;
  slug?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateVariantInput {
  sku: string;
  barcode?: string;
  title?: string;
  titleAr?: string;
  unit?: string;
  weightGrams?: number;
  dimensionsMm?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  images?: string[];
}

export interface AddMediaInput {
  url: string;
  variantId?: string;
  mediaType?: string;
  thumbUrl?: string;
  blurhash?: string;
  altText?: string;
  altTextAr?: string;
  sortOrder?: number;
  fileSize?: number;
  mimeType?: string;
}

export interface CreateCategoryInput {
  name: string;
  nameAr?: string;
  slug?: string;
  description?: string;
  imageUrl?: string;
  storeId?: string;
  parentId?: string;
  sortOrder?: number;
}

export interface UpdateCategoryInput {
  name?: string;
  nameAr?: string;
  description?: string;
  imageUrl?: string;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const res = await authFetch(`${API_URL}/v1/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Create product failed (${res.status})`);
  return res.json();
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
  const res = await authFetch(`${API_URL}/v1/products/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Update product failed (${res.status})`);
  return res.json();
}

export async function deleteProduct(id: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/products/${id}`, { method: 'DELETE' });
  if (!res.ok) throw await ApiError.from(res, `Delete product failed (${res.status})`);
  return res.json();
}

export async function listVariants(productId: string): Promise<ProductVariant[]> {
  const res = await authFetch(`${API_URL}/v1/products/${productId}/variants`);
  if (!res.ok) throw await ApiError.from(res, `Variants failed (${res.status})`);
  return res.json();
}

export async function createVariant(
  productId: string,
  input: CreateVariantInput,
): Promise<ProductVariant> {
  const res = await authFetch(`${API_URL}/v1/products/${productId}/variants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Create variant failed (${res.status})`);
  return res.json();
}

export async function updateVariant(
  productId: string,
  variantId: string,
  input: Partial<CreateVariantInput>,
): Promise<ProductVariant> {
  const res = await authFetch(`${API_URL}/v1/products/${productId}/variants/${variantId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Update variant failed (${res.status})`);
  return res.json();
}

export async function listMedia(productId: string): Promise<MediaItem[]> {
  const res = await authFetch(`${API_URL}/v1/products/${productId}/media`);
  if (!res.ok) throw await ApiError.from(res, `Media failed (${res.status})`);
  return res.json();
}

export async function addMedia(productId: string, input: AddMediaInput): Promise<MediaItem> {
  const res = await authFetch(`${API_URL}/v1/products/${productId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Add media failed (${res.status})`);
  return res.json();
}

export async function removeMedia(productId: string, mediaId: string): Promise<void> {
  const res = await authFetch(`${API_URL}/v1/products/${productId}/media/${mediaId}`, { method: 'DELETE' });
  if (!res.ok) throw await ApiError.from(res, `Remove media failed (${res.status})`);
}

export async function bulkVariantOperations(
  productId: string,
  ops: {
    create?: CreateVariantInput[];
    deleteIds?: string[];
    toggleActive?: Array<{ id: string; isActive: boolean }>;
  },
): Promise<{ created: string[]; deleted: string[]; toggled: string[] }> {
  const res = await authFetch(`${API_URL}/v1/products/${productId}/variants/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ops),
  });
  if (!res.ok) throw await ApiError.from(res, `Bulk variant ops failed (${res.status})`);
  return res.json();
}

export async function reorderProductMedia(
  productId: string,
  order: string[],
): Promise<{ success: boolean }> {
  const res = await authFetch(`${API_URL}/v1/products/${productId}/media/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order }),
  });
  if (!res.ok) throw await ApiError.from(res, `Reorder media failed (${res.status})`);
  return res.json();
}

export async function presignMedia(input: {
  fileName: string;
  mimeType: string;
}): Promise<{ uploadUrl: string; storageKey: string }> {
  const res = await authFetch(`${API_URL}/v1/media/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Presign failed (${res.status})`);
  return res.json();
}

export async function fetchStoreCategories(storeId: string): Promise<Category[]> {
  const res = await authFetch(`${API_URL}/v1/categories?storeId=${encodeURIComponent(storeId)}`);
  if (!res.ok) throw await ApiError.from(res, `Categories failed (${res.status})`);
  return res.json();
}

export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  const res = await authFetch(`${API_URL}/v1/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Create category failed (${res.status})`);
  return res.json();
}

export async function updateCategory(id: string, input: UpdateCategoryInput): Promise<Category> {
  const res = await authFetch(`${API_URL}/v1/categories/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Update category failed (${res.status})`);
  return res.json();
}

export async function deleteCategory(id: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/categories/${id}`, { method: 'DELETE' });
  if (!res.ok) throw await ApiError.from(res, `Delete category failed (${res.status})`);
  return res.json();
}

// ── Merchant Warehouses / Inventory ──────────────────────────

export interface WarehouseSummary {
  id: string;
  storeId: string;
  name: string;
  address: Record<string, unknown>;
  managerName: string | null;
  managerPhone: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  variantId: string;
  warehouseId: string;
  qtyOnHand: number;
  qtyReserved: number;
  reorderPoint: number;
  maxStock: number | null;
  lowStockAlert: boolean;
  lastCountedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchStoreWarehouses(storeId: string): Promise<WarehouseSummary[]> {
  const res = await authFetch(`${API_URL}/v1/stores/${storeId}/warehouses`);
  if (!res.ok) throw await ApiError.from(res, `Warehouses failed (${res.status})`);
  return res.json();
}

export async function fetchWarehouseInventory(warehouseId: string): Promise<InventoryItem[]> {
  const res = await authFetch(`${API_URL}/v1/inventory/warehouse/${warehouseId}`);
  if (!res.ok) throw await ApiError.from(res, `Inventory failed (${res.status})`);
  return res.json();
}

export async function fetchLowStock(warehouseId?: string): Promise<InventoryItem[]> {
  const qs = warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}` : '';
  const res = await authFetch(`${API_URL}/v1/inventory/low-stock${qs}`);
  if (!res.ok) throw await ApiError.from(res, `Low stock failed (${res.status})`);
  return res.json();
}

export async function adjustStock(input: {
  inventoryItemId: string;
  quantity: number;
  reason?: string;
}): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/inventory/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Adjust stock failed (${res.status})`);
  return res.json();
}

export interface StockMovement {
  id: string;
  inventoryItemId: string;
  movementType: string;
  quantity: number;
  referenceType: string | null;
  referenceId: string | null;
  performedBy: string | null;
  createdAt: string;
}

export async function fetchInventoryMovements(inventoryItemId: string, limit = 50): Promise<StockMovement[]> {
  const res = await authFetch(`${API_URL}/v1/inventory/${inventoryItemId}/movements?limit=${limit}`);
  if (!res.ok) throw await ApiError.from(res, `Movements failed (${res.status})`);
  return res.json();
}

export async function createInventoryItem(input: {
  variantId: string;
  warehouseId: string;
  initialQty?: number;
  reason?: string;
}): Promise<InventoryItem> {
  const res = await authFetch(`${API_URL}/v1/inventory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Create inventory item failed (${res.status})`);
  return res.json();
}

export async function updateInventoryItem(id: string, input: {
  reorderPoint?: number;
  maxStock?: number;
  lowStockAlert?: boolean;
}): Promise<InventoryItem> {
  const res = await authFetch(`${API_URL}/v1/inventory/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Update inventory item failed (${res.status})`);
  return res.json();
}

export async function bulkAdjustStock(items: Array<{
  inventoryItemId: string;
  quantity: number;
  reason?: string;
}>): Promise<Array<{ inventoryItemId: string; newQty: number }>> {
  const res = await authFetch(`${API_URL}/v1/inventory/bulk-adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw await ApiError.from(res, `Bulk adjust failed (${res.status})`);
  return res.json();
}

export async function fetchStoreInventory(
  storeId: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ data: InventoryItem[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  if (opts?.offset != null) params.set('offset', String(opts.offset));
  const qs = params.toString();
  const res = await authFetch(`${API_URL}/v1/stores/${storeId}/inventory${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw await ApiError.from(res, `Store inventory failed (${res.status})`);
  return res.json();
}

export async function exportInventoryCsv(storeId: string): Promise<string> {
  const res = await authFetch(`${API_URL}/v1/stores/${storeId}/inventory/export`);
  if (!res.ok) throw await ApiError.from(res, `Export inventory failed (${res.status})`);
  return res.text();
}

export async function transferStock(input: {
  inventoryItemId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  reason?: string;
}): Promise<{ sourceNewQty: number; destId: string; destNewQty: number }> {
  const res = await authFetch(`${API_URL}/v1/inventory/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Transfer failed (${res.status})`);
  return res.json();
}

export async function exportMovementsCsv(storeId: string): Promise<string> {
  const res = await authFetch(`${API_URL}/v1/stores/${storeId}/inventory/movements/export`);
  if (!res.ok) throw await ApiError.from(res, `Export movements failed (${res.status})`);
  return res.text();
}

export async function checkLowStock(storeId: string): Promise<InventoryItem[]> {
  const res = await authFetch(`${API_URL}/v1/stores/${storeId}/inventory/check-low-stock`, {
    method: 'POST',
  });
  if (!res.ok) throw await ApiError.from(res, `Low stock check failed (${res.status})`);
  return res.json();
}

// ── Brand Management ──────────────────────────────────────────

export interface Brand {
  id: string;
  name: string;
  nameAr: string | null;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function fetchBrandsAdmin(includeInactive = false): Promise<Brand[]> {
  const qs = includeInactive ? '?includeInactive=true' : '';
  const res = await authFetch(`${API_URL}/v1/brands${qs}`);
  if (!res.ok) throw await ApiError.from(res, `Brands failed (${res.status})`);
  return res.json();
}

export async function createBrand(input: { name: string; nameAr?: string; logoUrl?: string; description?: string }): Promise<Brand> {
  const res = await authFetch(`${API_URL}/v1/brands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Create brand failed (${res.status})`);
  return res.json();
}

export async function updateBrand(id: string, input: Partial<Brand>): Promise<Brand> {
  const res = await authFetch(`${API_URL}/v1/brands/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Update brand failed (${res.status})`);
  return res.json();
}

export async function deactivateBrand(id: string): Promise<Brand> {
  const res = await authFetch(`${API_URL}/v1/brands/${id}`, { method: 'DELETE' });
  if (!res.ok) throw await ApiError.from(res, `Deactivate brand failed (${res.status})`);
  return res.json();
}

// ── Merchant Pricing ─────────────────────────────────────────

export interface PriceList {
  id: string;
  storeId: string;
  name: string;
  currency: string;
  channel: string;
  audience: string;
  isActive: boolean;
  priority: number;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PriceTier {
  id: string;
  priceListId: string;
  variantId: string;
  minQty: number;
  maxQty: number | null;
  unitPriceMinor: number;
  createdAt: string;
  updatedAt: string;
}

export async function fetchStorePriceLists(storeId: string): Promise<PriceList[]> {
  const res = await authFetch(`${API_URL}/v1/stores/${storeId}/price-lists`);
  if (!res.ok) throw await ApiError.from(res, `Price lists failed (${res.status})`);
  return res.json();
}

export async function fetchPriceListTiers(listId: string): Promise<PriceTier[]> {
  const res = await authFetch(`${API_URL}/v1/price-lists/${listId}/tiers`);
  if (!res.ok) throw await ApiError.from(res, `Price tiers failed (${res.status})`);
  return res.json();
}

export async function createPriceList(input: { storeId: string; name: string; currency: string; channel?: string; audience?: string }): Promise<PriceList> {
  const res = await authFetch(`${API_URL}/v1/price-lists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Create price list failed (${res.status})`);
  return res.json();
}

export async function addPriceTier(input: { priceListId: string; variantId: string; minQty: number; maxQty?: number; unitPriceMinor: number }): Promise<PriceTier> {
  const res = await authFetch(`${API_URL}/v1/price-lists/${input.priceListId}/tiers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Add tier failed (${res.status})`);
  return res.json();
}

export async function updatePriceTier(tierId: string, input: { minQty?: number; maxQty?: number | null; unitPriceMinor?: number }): Promise<PriceTier> {
  const res = await authFetch(`${API_URL}/v1/tiers/${tierId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Update tier failed (${res.status})`);
  return res.json();
}

export async function removePriceTier(tierId: string): Promise<void> {
  const res = await authFetch(`${API_URL}/v1/tiers/${tierId}`, { method: 'DELETE' });
  if (!res.ok) throw await ApiError.from(res, `Remove tier failed (${res.status})`);
}

// ── Device Management ────────────────────────────────────────

export interface DeviceToken {
  id: string;
  token: string;
  platform: string;
  appVersion: string | null;
  isActive: boolean;
  lastSeenAt: string;
  createdAt: string;
}

export async function fetchDevices(): Promise<DeviceToken[]> {
  const res = await authFetch(`${API_URL}/v1/me/devices`);
  if (!res.ok) throw await ApiError.from(res, `Fetch devices failed (${res.status})`);
  return res.json();
}

export async function unregisterDevice(token: string): Promise<{ success: boolean }> {
  const res = await authFetch(`${API_URL}/v1/me/devices/${encodeURIComponent(token)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw await ApiError.from(res, `Unregister device failed (${res.status})`);
  return res.json();
}

// ── Catalog Bulk / Export / Store Variants ───────────────────

export async function bulkProductAction(
  storeId: string,
  body: { ids: string[]; action: 'delete' | 'archive' | 'draft' },
): Promise<{ affected: number }> {
  const res = await authFetch(`${API_URL}/v1/stores/${storeId}/products/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await ApiError.from(res, `Bulk action failed (${res.status})`);
  return res.json();
}

export async function exportProductsCsv(storeId: string): Promise<string> {
  const res = await authFetch(`${API_URL}/v1/stores/${storeId}/products/export`);
  if (!res.ok) throw await ApiError.from(res, `Export failed (${res.status})`);
  return res.text();
}

export async function fetchStoreVariants(storeId: string): Promise<ProductVariant[]> {
  const res = await authFetch(`${API_URL}/v1/stores/${storeId}/variants`);
  if (!res.ok) throw await ApiError.from(res, `Store variants failed (${res.status})`);
  return res.json();
}

// ── Merchant Offers (PHASE 5) ─────────────────────────────────

export interface Offer {
  id: string;
  storeId: string;
  productId: string;
  variantId: string | null;
  status: 'DRAFT' | 'PROPOSED' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED' | 'WITHDRAWN';
  currency: string;
  basePriceMinor: number;
  compareAtPriceMinor: number | null;
  moq: number;
  orderIncrement: number | null;
  leadTimeDays: number | null;
  isAvailable: boolean;
  priceListId: string | null;
  warehouseId: string | null;
  externalRef: string | null;
  proposedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOfferInput {
  storeId: string;
  productId: string;
  variantId?: string;
  currency?: string;
  basePriceMinor: number;
  compareAtPriceMinor?: number;
  moq?: number;
  orderIncrement?: number;
  leadTimeDays?: number;
  priceListId?: string;
  warehouseId?: string;
  externalRef?: string;
}

export async function fetchProductOffers(productId: string): Promise<Offer[]> {
  const res = await authFetch(`${API_URL}/v1/products/${productId}/offers`);
  if (!res.ok) throw await ApiError.from(res, `Product offers failed (${res.status})`);
  return res.json();
}

/**
 * PHASE 22: Buyer-facing "most popular seller" row returned by
 * GET /v1/products/:productId/offers/ranked. Fields mirror the service response
 * exactly (see CatalogOfferService.listOffersForProductRanked) so a shape drift
 * shows up as a compile error rather than an undefined property at render.
 */
export interface RankedProductOffer {
  offerId: string;
  storeId: string;
  storeName: string | null;
  storeSlug: string | null;
  storeVerified: boolean;
  variantId: string | null;
  currency: string;
  basePriceMinor: number | null;
  moq: number;
  leadTimeDays: number | null;
  priceListId: string | null;
  ordersCount: number;
  unitsSold: number;
  /**
   * PHASE 23: `null` when the seller opted out of disclosure (their store has
   * `hidePopularityBadge = true`). The server also zeroes `ordersCount` and
   * `unitsSold` in that case, so a consumer must not rely on rank > 0 alone.
   */
  rank: number | null;
  isMostPopular: boolean;
  /**
   * PHASE 23: explicit opt-out marker so the UI can render a discreet "sales
   * not disclosed" affordance instead of a false "0 sold" for opted-out rows.
   */
  disclosureHidden: boolean;
}

export async function fetchProductOffersRanked(productId: string): Promise<RankedProductOffer[]> {
  const res = await authFetch(`${API_URL}/v1/products/${productId}/offers/ranked`);
  if (!res.ok) throw await ApiError.from(res, `Ranked product offers failed (${res.status})`);
  return res.json();
}

export async function fetchMerchantOffers(storeId: string, status?: string): Promise<Offer[]> {
  const params = status ? `?status=${status}` : '';
  const res = await authFetch(`${API_URL}/v1/merchant/offers?storeId=${storeId}${status ? `&status=${status}` : ''}`);
  if (!res.ok) throw await ApiError.from(res, `Merchant offers failed (${res.status})`);
  return res.json();
}

/**
 * PHASE 16: Per-offer sales performance for a store.
 * Returned by GET /v1/merchant/offers/analytics?storeId=...
 */
export interface OfferAnalyticsRow {
  offerId: string;
  storeId: string;
  productId: string;
  variantId: string | null;
  status: Offer['status'];
  currency: string;
  basePriceMinor: number | null;
  moq: number;
  leadTimeDays: number | null;
  createdAt: string;
  productTitle: string | null;
  variantSku: string | null;
  variantTitle: string | null;
  ordersCount: number;
  unitsSold: number;
  revenueMinor: number;
}

export async function fetchMerchantOfferAnalytics(storeId: string): Promise<OfferAnalyticsRow[]> {
  const res = await authFetch(`${API_URL}/v1/merchant/offers/analytics?storeId=${storeId}`);
  if (!res.ok) throw await ApiError.from(res, `Offer analytics failed (${res.status})`);
  return res.json();
}

/**
 * PHASE 18: Time-series bucket of sales trend returned by
 * GET /v1/merchant/offers/analytics/trend. `bucket` is a UTC YYYY-MM-DD string
 * for daily rows and the ISO date of the week's Monday for weekly rows.
 */
export interface OfferTrendPoint {
  bucket: string;
  ordersCount: number;
  unitsSold: number;
  revenueMinor: number;
}

export async function fetchMerchantOfferTrend(opts: {
  storeId: string;
  offerId?: string;
  granularity?: 'day' | 'week';
  days?: number;
  from?: string;
}): Promise<OfferTrendPoint[]> {
  const params = new URLSearchParams({ storeId: opts.storeId });
  if (opts.offerId) params.set('offerId', opts.offerId);
  params.set('granularity', opts.granularity === 'week' ? 'week' : 'day');
  if (opts.from) params.set('from', opts.from);
  else if (opts.days != null) params.set('days', String(opts.days));
  const res = await authFetch(`${API_URL}/v1/merchant/offers/analytics/trend?${params.toString()}`);
  if (!res.ok) throw await ApiError.from(res, `Offer trend failed (${res.status})`);
  return res.json();
}

export async function createMerchantOffer(input: CreateOfferInput): Promise<Offer> {
  const res = await authFetch(`${API_URL}/v1/merchant/offers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Create offer failed (${res.status})`);
  return res.json();
}

export async function proposeOffer(offerId: string): Promise<Offer> {
  const res = await authFetch(`${API_URL}/v1/merchant/offers/${offerId}/propose`, { method: 'POST' });
  if (!res.ok) throw await ApiError.from(res, `Propose failed (${res.status})`);
  return res.json();
}

export async function withdrawOffer(offerId: string): Promise<Offer> {
  const res = await authFetch(`${API_URL}/v1/merchant/offers/${offerId}/withdraw`, { method: 'POST' });
  if (!res.ok) throw await ApiError.from(res, `Withdraw failed (${res.status})`);
  return res.json();
}

export async function updateOfferPricing(offerId: string, patch: { basePriceMinor?: number; moq?: number; leadTimeDays?: number; isAvailable?: boolean }): Promise<Offer> {
  const res = await authFetch(`${API_URL}/v1/merchant/offers/${offerId}/pricing`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
  });
  if (!res.ok) throw await ApiError.from(res, `Pricing update failed (${res.status})`);
  return res.json();
}

// ── Product Studio — Taxonomy + Attribute Values ─────────────

export interface ProductTypeSummary {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  categoryId: string | null;
  version: number;
  status: string;
  variantDimensions: string[];
}

export async function fetchProductTypes(params?: {
  categoryId?: string; status?: string;
}): Promise<ProductTypeSummary[]> {
  const sp = new URLSearchParams();
  if (params?.categoryId) sp.set('categoryId', params.categoryId);
  if (params?.status) sp.set('status', params.status);
  const qs = sp.toString();
  const res = await authFetch(`${API_URL}/v1/product-types${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw await ApiError.from(res, `Product types failed (${res.status})`);
  return res.json();
}

export interface ProductTypeSchemaAttribute {
  attributeDefinitionId: string;
  displayOrder: number;
  required: boolean;
  filterable: boolean;
  searchable: boolean;
  comparable: boolean;
  visibleInListing: boolean;
  visibleInDetail: boolean;
  conditionalRules: unknown[];
  definition: {
    id: string; code: string; name: string; nameAr: string | null;
    type: string; scope: string; unit: string | null; description: string | null;
  } | null;
  options: Array<{ id: string; value: string; valueAr: string | null; label: string | null; sortOrder: number }>;
}

export interface ProductTypeSchemaDetail extends ProductTypeSummary {
  description: string | null;
  groups: Array<{ id: string; name: string; nameAr: string | null; kind: string | null }>;
  attributes: ProductTypeSchemaAttribute[];
}

export async function fetchProductTypeSchema(id: string): Promise<ProductTypeSchemaDetail> {
  const res = await authFetch(`${API_URL}/v1/product-types/${id}/schema`);
  if (!res.ok) throw await ApiError.from(res, `Product type schema failed (${res.status})`);
  return res.json();
}

export async function searchCanonicalProducts(params: {
  gtin?: string; ean?: string; mpn?: string; title?: string;
}): Promise<Product[]> {
  const sp = new URLSearchParams();
  if (params.gtin) sp.set('gtin', params.gtin);
  if (params.ean) sp.set('ean', params.ean);
  if (params.mpn) sp.set('mpn', params.mpn);
  if (params.title) sp.set('title', params.title);
  const qs = sp.toString();
  const res = await authFetch(`${API_URL}/v1/canonical/match${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw await ApiError.from(res, `Canonical search failed (${res.status})`);
  return res.json();
}

// ── Variant Matrix — dimension-based variant selector ──────────────

export interface VariantMatrixDimension {
  attributeDefinitionId: string;
  code: string;
  name: string;
  nameAr: string | null;
  unit: string | null;
  displayOrder: number;
  options: string[];
}

export interface VariantMatrixCombination {
  variantId: string;
  sku: string;
  title: string | null;
  isActive: boolean;
  values: Record<string, string>;
  pricing: VariantPricing | null;
  stock: { totalAvailable: number; totalOnHand: number; warehouseCount: number } | null;
}

export interface VariantMatrix {
  productTypeId: string;
  dimensions: VariantMatrixDimension[];
  combinations: VariantMatrixCombination[];
}

export async function fetchVariantMatrix(productId: string): Promise<VariantMatrix> {
  const res = await authFetch(`${API_URL}/v1/products/${productId}/variant-matrix`);
  if (!res.ok) throw await ApiError.from(res, `Variant matrix failed (${res.status})`);
  return res.json();
}

export async function upsertProductAttributeValues(
  productId: string,
  values: Array<{ attributeDefinitionId: string; valueText?: string; valueNumber?: number; valueBoolean?: boolean; optionValue?: string }>,
): Promise<{ success: boolean }> {
  const res = await authFetch(`${API_URL}/v1/products/${productId}/attribute-values`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw await ApiError.from(res, `Upsert attribute values failed (${res.status})`);
  return res.json();
}

// ── Promotions ──────────────────────────────────────────────────

export interface Promotion {
  id: string;
  storeId: string;
  code: string | null;
  name: string;
  description: string | null;
  promoType: string;
  scope: string;
  scopeId: string | null;
  discountValue: number;
  minOrderMinor: number | null;
  maxDiscountMinor: number | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  perUserLimit: number | null;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromotionInput {
  storeId: string;
  code?: string;
  name: string;
  description?: string;
  promoType: 'PERCENT' | 'FIXED' | 'QTY_DISCOUNT' | 'TIME_LIMITED';
  scope?: 'STORE' | 'CATEGORY' | 'PRODUCT' | 'VARIANT';
  scopeId?: string;
  discountValue: number;
  minOrderMinor?: number;
  maxDiscountMinor?: number;
  maxRedemptions?: number;
  perUserLimit?: number;
  startsAt: string;
  endsAt: string;
}

export async function fetchStorePromotions(storeId: string): Promise<Promotion[]> {
  const res = await authFetch(`${API_URL}/v1/stores/${encodeURIComponent(storeId)}/promotions`);
  if (!res.ok) throw await ApiError.from(res, `Failed to fetch promotions (${res.status})`);
  return res.json();
}

export async function createPromotion(input: CreatePromotionInput): Promise<Promotion> {
  const res = await authFetch(`${API_URL}/v1/promotions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Create promotion failed (${res.status})`);
  return res.json();
}

export async function updatePromotion(id: string, input: Partial<CreatePromotionInput>): Promise<Promotion> {
  const res = await authFetch(`${API_URL}/v1/promotions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.from(res, `Update promotion failed (${res.status})`);
  return res.json();
}
