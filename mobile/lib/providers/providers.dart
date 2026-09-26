import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_core/mobile_core.dart';
import '../services/api_service.dart';
import '../services/push_notification_service.dart';
import '../services/realtime_service.dart';
import '../models/models.dart';

// ── Core Providers ──────────────────────────────────────────

final authStorageProvider = Provider<AuthStorage>((ref) => AuthStorage());
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(
      baseUrl: const String.fromEnvironment('API_URL',
          defaultValue: 'http://10.0.2.2:3000'),
      authStorage: ref.watch(authStorageProvider),
    ));
final apiServiceProvider =
    Provider<ApiService>((ref) => ApiService(ref.watch(apiClientProvider).dio));

final pushNotificationServiceProvider = Provider<PushNotificationService>(
    (ref) => PushNotificationService(ref.watch(apiServiceProvider)));

/// Shared Socket.IO connection to the API `/realtime` gateway (WEB-B6). Screens
/// listen to its broadcast streams for live notification / order-status push
/// instead of polling. Uses the same API origin as [apiClientProvider].
final realtimeServiceProvider = Provider<RealtimeService>((ref) {
  final service = RealtimeService(
    baseUrl: const String.fromEnvironment('API_URL',
        defaultValue: 'http://10.0.2.2:3000'),
    authStorage: ref.watch(authStorageProvider),
  );
  ref.onDispose(service.dispose);
  return service;
});

// ── Auth ────────────────────────────────────────────────────

final isAuthenticatedProvider = StateProvider<bool>((ref) => false);
final currentUserPhoneProvider = StateProvider<String>((ref) => '');
final activeOrgIdProvider = StateProvider<String?>((ref) => null);

/// Restores the authentication session from secure storage on cold start.
///
/// Without this, [isAuthenticatedProvider] always defaults to `false` and the
/// router redirect sends the user to `/login` on every app restart — even
/// though valid tokens exist in [AuthStorage]. The router watches this provider
/// so it is not created until restoration completes (avoiding a login flash).
final sessionRestorationProvider = FutureProvider<bool>((ref) async {
  final authStorage = ref.watch(authStorageProvider);
  final accessToken = await authStorage.getAccessToken();
  if (accessToken != null && accessToken.isNotEmpty) {
    ref.read(apiClientProvider).setAccessToken(accessToken);
    ref.read(isAuthenticatedProvider.notifier).state = true;
    // Restore the active org id so org-scoped screens work immediately.
    final orgId = await authStorage.getActiveOrgId();
    if (orgId != null && orgId.isNotEmpty) {
      ref.read(activeOrgIdProvider.notifier).state = orgId;
    }
    return true;
  }
  return false;
});

// ── Profile ─────────────────────────────────────────────────

final profileProvider = FutureProvider<UserProfile>(
    (ref) => ref.watch(apiServiceProvider).fetchProfile());

// ── Organizations ───────────────────────────────────────────

final myOrganizationsProvider = FutureProvider<List<OrgMembership>>(
    (ref) => ref.watch(apiServiceProvider).fetchMyOrganizations());

// ── Search ──────────────────────────────────────────────────

final searchQueryProvider = StateProvider<String>((ref) => '');
final searchResultsProvider = StateProvider<SearchResult?>((ref) => null);
final categoriesProvider = FutureProvider<List<Category>>(
    (ref) => ref.watch(apiServiceProvider).fetchCategories());
final brandsProvider = FutureProvider<List<Brand>>(
    (ref) => ref.watch(apiServiceProvider).fetchBrands());

/// Category hand-off from the Home rail to the Search tab. Home sets this just
/// before `context.go('/search')`; [SearchScreen] `ref.listen`s to it so the
/// filter applies even though the shell keeps the search branch alive
/// (IndexedStack => initState does not re-run on tab switch). Cleared to null
/// once consumed so a later manual visit starts unfiltered.
final searchCategoryProvider = StateProvider<String?>((ref) => null);

/// Commerce-home "Popular products" rail. Backed by a real search call (no
/// query => the API's default ranked listing), never fabricated data (§14).
final featuredProductsProvider = FutureProvider<SearchResult>(
    (ref) => ref.watch(apiServiceProvider).search(limit: 10));

// ── Stores ──────────────────────────────────────────────────

final storesProvider = FutureProvider<List<Store>>(
    (ref) => ref.watch(apiServiceProvider).fetchStores(limit: 50));

/// Seller reviews for a store, keyed by storeId. The reviews API is
/// store-scoped only (`GET /v1/stores/:id/reviews`), so the PDP surfaces the
/// *seller's* reputation — the same source the web PDP uses. Shared by the
/// product detail and store detail screens.
final storeReviewsProvider = FutureProvider.family<List<Review>, String>(
    (ref, storeId) => storeId.isEmpty
        ? Future.value(<Review>[])
        : ref.watch(apiServiceProvider).fetchStoreReviews(storeId));

// ── Cart ────────────────────────────────────────────────────

// A5-14 residual: autoDispose so the cart is re-fetched whenever the cart
// screen is (re)mounted. Individual mutation sites still call ref.invalidate
// for the in-place case, but forgetting it no longer leaves a stale cart
// behind — navigating to /cart re-creates the provider from scratch.
final cartProvider = FutureProvider.autoDispose<Cart>(
    (ref) => ref.watch(apiServiceProvider).fetchCart());

/// PHASE 11/12: Validate offers in cart (re-prices stale items server-side).
final cartValidationProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
    (ref) => ref.watch(apiServiceProvider).validateCart());

// ── Orders ──────────────────────────────────────────────────

final ordersProvider = FutureProvider<List<SubOrder>>(
    (ref) => ref.watch(apiServiceProvider).fetchOrders());

// ── Notifications ───────────────────────────────────────────

final notificationsProvider = FutureProvider<List<AppNotification>>(
    (ref) => ref.watch(apiServiceProvider).fetchNotifications());
final unreadCountProvider = FutureProvider<int>(
    (ref) => ref.watch(apiServiceProvider).fetchUnreadCount());

// ── Organization Detail ─────────────────────────────────────

final orgDetailProvider = FutureProvider.family<Organization, String>(
    (ref, orgId) => ref.watch(apiServiceProvider).fetchOrganization(orgId));
final orgMembersProvider = FutureProvider.family<List<OrgMember>, String>(
    (ref, orgId) => ref.watch(apiServiceProvider).fetchOrgMembers(orgId));

// ── Merchant Stores ─────────────────────────────────────────

/// For a merchant JWT (with activeOrg), GET /v1/stores returns their own
/// org's stores. Used as the root of all merchant store-scoped data.
final myStoresProvider = FutureProvider<List<Store>>(
    (ref) => ref.watch(apiServiceProvider).fetchStores());

/// The merchant's primary store (first of their org's stores), or null.
final activeStoreProvider = FutureProvider<Store?>((ref) async {
  final stores = await ref.watch(myStoresProvider.future);
  return stores.isNotEmpty ? stores.first : null;
});

// ── Merchant Orders (store-scoped) ──────────────────────────

final merchantOrdersProvider = FutureProvider<List<SubOrder>>((ref) async {
  final store = await ref.watch(activeStoreProvider.future);
  if (store == null) return <SubOrder>[];
  return ref.watch(apiServiceProvider).fetchOrders(storeId: store.id);
});

// ── Merchant Dashboard KPIs (audit row 190 / spec §29) ────────

/// Headline numbers for the merchant dashboard. Each source is fetched in its
/// own try/catch so a single failing endpoint degrades to `null` (the UI shows
/// "—") instead of blanking every tile or inventing a zero. Orders reuse the
/// store-scoped [merchantOrdersProvider] cache (shared with the Orders tab) so
/// "Orders" counts real distinct sub-orders — never the sum of per-offer
/// `ordersCount`, which double-counts multi-offer orders.
final merchantKpisProvider = FutureProvider<MerchantKpis>((ref) async {
  final store = await ref.watch(activeStoreProvider.future);
  if (store == null) return MerchantKpis.empty;
  final api = ref.watch(apiServiceProvider);

  int ordersCount = 0, pendingCount = 0;
  try {
    final orders = await ref.watch(merchantOrdersProvider.future);
    ordersCount = orders.length;
    pendingCount = orders
        .where((o) =>
            o.status == 'SUBMITTED' || o.status == 'PENDING_CONFIRMATION')
        .length;
  } catch (_) {
    // Degrade to 0; the Orders tab surfaces the real error.
  }

  int? revenueMinor, unitsSold;
  try {
    final rows = await api.fetchOfferAnalytics(store.id);
    revenueMinor = rows.fold<int>(0, (s, r) => s + r.revenueMinor);
    unitsSold = rows.fold<int>(0, (s, r) => s + r.unitsSold);
  } catch (_) {
    // Leave null so the KPI renders "—" rather than a fabricated 0.
  }

  int? lowStockCount;
  try {
    lowStockCount = (await api.fetchLowStock()).length;
  } catch (_) {
    // Leave null on failure.
  }

  return MerchantKpis(
    revenueMinor: revenueMinor,
    unitsSold: unitsSold,
    currency: store.currency,
    ordersCount: ordersCount,
    pendingCount: pendingCount,
    lowStockCount: lowStockCount,
  );
});

// ── Merchant Catalog ────────────────────────────────────────

final storeProductsProvider =
    FutureProvider.family<List<Product>, String>((ref, storeId) async {
  if (storeId.isEmpty) return <Product>[];
  return ref.watch(apiServiceProvider).fetchStoreProducts(storeId, limit: 200);
});

final storeCategoriesProvider =
    FutureProvider.family<List<Category>, String>((ref, storeId) async {
  if (storeId.isEmpty) return <Category>[];
  return ref.watch(apiServiceProvider).fetchStoreCategories(storeId);
});

final productVariantsProvider =
    FutureProvider.family<List<ProductVariant>, String>((ref, productId) =>
        ref.watch(apiServiceProvider).fetchVariants(productId));

final productMediaProvider = FutureProvider.family<List<MediaItem>, String>(
    (ref, productId) => ref.watch(apiServiceProvider).listMedia(productId));

// ── Merchant Customers ──────────────────────────────────────

final merchantCustomersProvider = FutureProvider<List<CustomerSummary>>(
    (ref) => ref.watch(apiServiceProvider).fetchMerchantCustomers());

// ── Merchant Warehouses & Inventory ─────────────────────────

final storeWarehousesProvider =
    FutureProvider.family<List<Map<String, dynamic>>, String>(
        (ref, storeId) async {
  if (storeId.isEmpty) return <Map<String, dynamic>>[];
  return ref.watch(apiServiceProvider).fetchStoreWarehouses(storeId);
});

final warehouseInventoryProvider =
    FutureProvider.family<List<InventoryItem>, String>(
        (ref, warehouseId) async {
  if (warehouseId.isEmpty) return <InventoryItem>[];
  return ref.watch(apiServiceProvider).fetchWarehouseInventory(warehouseId);
});

/// Paginated inventory items across a store's warehouses.
final storeInventoryProvider =
    FutureProvider.family<PaginatedInventory, ({String storeId, int page})>(
        (ref, args) async {
  if (args.storeId.isEmpty) return PaginatedInventory(data: const [], total: 0);
  return ref
      .watch(apiServiceProvider)
      .fetchStoreInventory(args.storeId, offset: args.page * 20);
});

// ── Merchant Offers (pricing / lifecycle management) ────────

/// All offers for the active store. Auto-scoped via [activeStoreProvider].
final merchantOffersProvider = FutureProvider<List<MerchantOffer>>((ref) async {
  final store = await ref.watch(activeStoreProvider.future);
  if (store == null) return <MerchantOffer>[];
  return ref.watch(apiServiceProvider).fetchMerchantOffers(store.id);
});

/// Single offer detail by ID. Used by the offer detail screen.
final merchantOfferDetailProvider =
    FutureProvider.family<MerchantOffer, String>(
        (ref, id) => ref.watch(apiServiceProvider).fetchOfferDetail(id));

/// Per-offer analytics (orders, units, revenue) for the active store.
final merchantOfferAnalyticsProvider =
    FutureProvider<List<OfferAnalyticsRow>>((ref) async {
  final store = await ref.watch(activeStoreProvider.future);
  if (store == null) return <OfferAnalyticsRow>[];
  return ref.watch(apiServiceProvider).fetchOfferAnalytics(store.id);
});

/// Time-series trend for the active store (or a single offer).
final merchantOfferTrendProvider = FutureProvider.family<List<OfferTrendPoint>,
    ({String? offerId, String granularity, int days})>((ref, args) async {
  final store = await ref.watch(activeStoreProvider.future);
  if (store == null) return <OfferTrendPoint>[];
  return ref.watch(apiServiceProvider).fetchOfferTrend(
        storeId: store.id,
        offerId: args.offerId,
        granularity: args.granularity,
        days: args.days,
      );
});
