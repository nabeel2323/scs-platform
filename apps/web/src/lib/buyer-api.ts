/**
 * Buyer API client — search, cart, orders, notifications.
 */
import { authFetch } from './auth';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';

// ── Types ────────────────────────────────────────────────────

export interface SearchResult {
  items: Product[];
  total: number;
  query: string;
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
  // projected by CartService.listCartItems (A5-3)
  title?: string;
  sku?: string;
  storeName?: string;
  storeSlug?: string;
  currency?: string;
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
}): Promise<SearchResult> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.categoryId) qs.set('categoryId', params.categoryId);
  if (params.brandId) qs.set('brandId', params.brandId);
  if (params.storeId) qs.set('storeId', params.storeId);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.offset) qs.set('offset', String(params.offset));
  const res = await authFetch(`${API_URL}/v1/search?${qs}`);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

export async function fetchCategories(): Promise<Category[]> {
  const res = await authFetch(`${API_URL}/v1/search/categories`);
  if (!res.ok) throw new Error(`Categories failed: ${res.status}`);
  return res.json();
}

export async function fetchBrands(): Promise<
  { id: string; name: string; slug: string; logoUrl: string | null }[]
> {
  const res = await authFetch(`${API_URL}/v1/search/brands`);
  if (!res.ok) throw new Error(`Brands failed: ${res.status}`);
  return res.json();
}

// ── Products ─────────────────────────────────────────────────

/** Product + seller + per-variant pricing (`store`/`variants` added by A5-1). */
export async function fetchProduct(id: string): Promise<ProductDetail> {
  const res = await authFetch(`${API_URL}/v1/products/${id}`);
  if (!res.ok) throw new Error(`Product failed: ${res.status}`);
  return res.json();
}

export async function fetchProductVariants(productId: string): Promise<ProductVariant[]> {
  const res = await authFetch(`${API_URL}/v1/products/${productId}/variants`);
  if (!res.ok) throw new Error(`Variants failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`Stores failed: ${res.status}`);
  return res.json();
}

export async function fetchPublicStore(slugOrId: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/stores/${slugOrId}`);
  if (!res.ok) throw new Error(`Store failed: ${res.status}`);
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
  params?: { categoryId?: string; status?: string; limit?: number; offset?: number },
): Promise<StoreProductsEnvelope> {
  const qs = new URLSearchParams();
  if (params?.categoryId) qs.set('categoryId', params.categoryId);
  if (params?.status) qs.set('status', params.status);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const res = await authFetch(`${API_URL}/v1/stores/${storeId}/products?${qs}`);
  if (!res.ok) throw new Error(`Store products failed: ${res.status}`);
  return res.json();
}

// ── Cart ─────────────────────────────────────────────────────

export async function fetchCart(): Promise<Cart> {
  const res = await authFetch(`${API_URL}/v1/cart`);
  if (!res.ok) throw new Error(`Cart failed: ${res.status}`);
  return res.json();
}

export async function addToCart(input: {
  variantId: string;
  storeId: string;
  quantity: number;
}): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/cart/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Add to cart failed: ${res.status}`);
  return res.json();
}

export async function updateCartItem(itemId: string, quantity: number): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/cart/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity }),
  });
  if (!res.ok) throw new Error(`Update cart failed: ${res.status}`);
  return res.json();
}

export async function removeCartItem(itemId: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/cart/items/${itemId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Remove cart item failed: ${res.status}`);
  return res.json();
}

export async function clearCart(): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/cart`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Clear cart failed: ${res.status}`);
  return res.json();
}

export async function applyPromoCode(code: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/cart/promo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`Apply promo failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`Checkout failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`Orders failed: ${res.status}`);
  return res.json();
}

export async function fetchOrder(
  id: string,
): Promise<SubOrder & { items: OrderItem[]; financialBreakdown: unknown }> {
  const res = await authFetch(`${API_URL}/v1/orders/${id}`);
  if (!res.ok) throw new Error(`Order failed: ${res.status}`);
  return res.json();
}

export async function fetchMasterOrder(id: string): Promise<MasterOrder> {
  const res = await authFetch(`${API_URL}/v1/orders/master/${id}`);
  if (!res.ok) throw new Error(`Master order failed: ${res.status}`);
  return res.json();
}

export async function fetchOrderHistory(orderId: string): Promise<StatusHistoryEntry[]> {
  const res = await authFetch(`${API_URL}/v1/orders/${orderId}/history`);
  if (!res.ok) throw new Error(`History failed: ${res.status}`);
  return res.json();
}

export async function cancelOrder(orderId: string, reason: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/orders/${orderId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(`Cancel failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`Reorder failed: ${res.status}`);
  return res.json();
}

// ── Notifications ────────────────────────────────────────────

export async function fetchNotifications(limit = 50, offset = 0): Promise<Notification[]> {
  const res = await authFetch(`${API_URL}/v1/notifications?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error(`Notifications failed: ${res.status}`);
  return res.json();
}

export async function fetchUnreadCount(): Promise<{ count: number }> {
  const res = await authFetch(`${API_URL}/v1/notifications/unread-count`);
  if (!res.ok) throw new Error(`Unread count failed: ${res.status}`);
  return res.json();
}

export async function markNotificationRead(id: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/notifications/${id}/read`, { method: 'PATCH' });
  if (!res.ok) throw new Error(`Mark read failed: ${res.status}`);
  return res.json();
}

export async function markAllNotificationsRead(): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/notifications/read-all`, { method: 'PATCH' });
  if (!res.ok) throw new Error(`Mark all read failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`Review failed: ${res.status}`);
  return res.json();
}

export async function fetchStoreReviews(storeId: string): Promise<Review[]> {
  const res = await authFetch(`${API_URL}/v1/stores/${storeId}/reviews`);
  if (!res.ok) throw new Error(`Store reviews failed: ${res.status}`);
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
    throw new Error(`Trust snapshot failed: ${res.status}`);
  }
  return res.json();
}

// ── Disputes ─────────────────────────────────────────────────

export async function createDispute(
  orderId: string,
  input: {
    reason: string;
    description: string;
  },
): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/orders/${orderId}/dispute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Dispute failed: ${res.status}`);
  return res.json();
}

export async function fetchDisputes(status?: string): Promise<unknown[]> {
  const qs = status ? `?status=${status}` : '';
  const res = await authFetch(`${API_URL}/v1/disputes${qs}`);
  if (!res.ok) throw new Error(`Disputes failed: ${res.status}`);
  return res.json();
}

// ── Merchant Order Management ────────────────────────────────

export async function acceptMerchantOrder(orderId: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/orders/${orderId}/accept`, { method: 'POST' });
  if (!res.ok) throw new Error(`Accept failed: ${res.status}`);
  return res.json();
}

export async function rejectMerchantOrder(orderId: string, reason: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/orders/${orderId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(`Reject failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`Partial accept failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`Status transition failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`Favorites failed: ${res.status}`);
  return res.json();
}

export async function addFavorite(productId: string): Promise<Favorite> {
  const res = await authFetch(`${API_URL}/v1/me/favorites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId }),
  });
  if (!res.ok) throw new Error(`Add favorite failed: ${res.status}`);
  return res.json();
}

export async function removeFavorite(productId: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/me/favorites/${productId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Remove favorite failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`Saved suppliers failed: ${res.status}`);
  return res.json();
}

export async function saveSupplier(storeId: string): Promise<SavedSupplier> {
  const res = await authFetch(`${API_URL}/v1/me/saved-suppliers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId }),
  });
  if (!res.ok) throw new Error(`Save supplier failed: ${res.status}`);
  return res.json();
}

export async function removeSavedSupplier(storeId: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/me/saved-suppliers/${storeId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Remove saved supplier failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`Profile failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`Update profile failed: ${res.status}`);
  return res.json();
}

export async function fetchMyOrganizations(): Promise<unknown[]> {
  const res = await authFetch(`${API_URL}/v1/me/organizations`);
  if (!res.ok) throw new Error(`Organizations failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`Fetch customers failed: ${res.status}`);
  return res.json();
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
  moq?: number;
  images?: string[];
  attributes?: Record<string, unknown>;
}

export interface UpdateProductInput {
  title?: string;
  titleAr?: string;
  description?: string;
  descriptionAr?: string;
  status?: string;
  condition?: string;
  isAvailable?: boolean;
  moq?: number;
  images?: string[];
  attributes?: Record<string, unknown>;
  categoryId?: string;
  brandId?: string;
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
  if (!res.ok) throw new Error(`Create product failed: ${res.status}`);
  return res.json();
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
  const res = await authFetch(`${API_URL}/v1/products/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    // Surface the RFC 7807 detail (e.g. moderation-guard rejections) to the UI
    let detail = `Update product failed: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch { /* non-JSON body */ }
    throw new Error(detail);
  }
  return res.json();
}

export async function deleteProduct(id: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/products/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete product failed: ${res.status}`);
  return res.json();
}

export async function listVariants(productId: string): Promise<ProductVariant[]> {
  const res = await authFetch(`${API_URL}/v1/products/${productId}/variants`);
  if (!res.ok) throw new Error(`Variants failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`Create variant failed: ${res.status}`);
  return res.json();
}

export async function listMedia(productId: string): Promise<MediaItem[]> {
  const res = await authFetch(`${API_URL}/v1/products/${productId}/media`);
  if (!res.ok) throw new Error(`Media failed: ${res.status}`);
  return res.json();
}

export async function addMedia(productId: string, input: AddMediaInput): Promise<MediaItem> {
  const res = await authFetch(`${API_URL}/v1/products/${productId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Add media failed: ${res.status}`);
  return res.json();
}

export async function removeMedia(productId: string, mediaId: string): Promise<void> {
  const res = await authFetch(`${API_URL}/v1/products/${productId}/media/${mediaId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Remove media failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`Presign failed: ${res.status}`);
  return res.json();
}

export async function fetchStoreCategories(storeId: string): Promise<Category[]> {
  const res = await authFetch(`${API_URL}/v1/categories?storeId=${encodeURIComponent(storeId)}`);
  if (!res.ok) throw new Error(`Categories failed: ${res.status}`);
  return res.json();
}

export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  const res = await authFetch(`${API_URL}/v1/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Create category failed: ${res.status}`);
  return res.json();
}

export async function updateCategory(id: string, input: UpdateCategoryInput): Promise<Category> {
  const res = await authFetch(`${API_URL}/v1/categories/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Update category failed: ${res.status}`);
  return res.json();
}

export async function deleteCategory(id: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/categories/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete category failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`Warehouses failed: ${res.status}`);
  return res.json();
}

export async function fetchWarehouseInventory(warehouseId: string): Promise<InventoryItem[]> {
  const res = await authFetch(`${API_URL}/v1/inventory/warehouse/${warehouseId}`);
  if (!res.ok) throw new Error(`Inventory failed: ${res.status}`);
  return res.json();
}

export async function fetchLowStock(warehouseId?: string): Promise<InventoryItem[]> {
  const qs = warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}` : '';
  const res = await authFetch(`${API_URL}/v1/inventory/low-stock${qs}`);
  if (!res.ok) throw new Error(`Low stock failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`Adjust stock failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`Movements failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`Brands failed: ${res.status}`);
  return res.json();
}

export async function createBrand(input: { name: string; nameAr?: string; logoUrl?: string; description?: string }): Promise<Brand> {
  const res = await authFetch(`${API_URL}/v1/brands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Create brand failed: ${res.status}`);
  return res.json();
}

export async function updateBrand(id: string, input: Partial<Brand>): Promise<Brand> {
  const res = await authFetch(`${API_URL}/v1/brands/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Update brand failed: ${res.status}`);
  return res.json();
}

export async function deactivateBrand(id: string): Promise<Brand> {
  const res = await authFetch(`${API_URL}/v1/brands/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Deactivate brand failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`Price lists failed: ${res.status}`);
  return res.json();
}

export async function fetchPriceListTiers(listId: string): Promise<PriceTier[]> {
  const res = await authFetch(`${API_URL}/v1/price-lists/${listId}/tiers`);
  if (!res.ok) throw new Error(`Price tiers failed: ${res.status}`);
  return res.json();
}

export async function createPriceList(input: { storeId: string; name: string; currency: string; channel?: string; audience?: string }): Promise<PriceList> {
  const res = await authFetch(`${API_URL}/v1/price-lists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Create price list failed: ${res.status}`);
  return res.json();
}

export async function addPriceTier(input: { priceListId: string; variantId: string; minQty: number; maxQty?: number; unitPriceMinor: number }): Promise<PriceTier> {
  const res = await authFetch(`${API_URL}/v1/price-lists/${input.priceListId}/tiers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Add tier failed: ${res.status}`);
  return res.json();
}

export async function updatePriceTier(tierId: string, input: { minQty?: number; maxQty?: number | null; unitPriceMinor?: number }): Promise<PriceTier> {
  const res = await authFetch(`${API_URL}/v1/tiers/${tierId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Update tier failed: ${res.status}`);
  return res.json();
}

export async function removePriceTier(tierId: string): Promise<void> {
  const res = await authFetch(`${API_URL}/v1/tiers/${tierId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Remove tier failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`Fetch devices failed: ${res.status}`);
  return res.json();
}

export async function unregisterDevice(token: string): Promise<{ success: boolean }> {
  const res = await authFetch(`${API_URL}/v1/me/devices/${encodeURIComponent(token)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Unregister device failed: ${res.status}`);
  return res.json();
}
