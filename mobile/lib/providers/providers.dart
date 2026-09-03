import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_core/mobile_core.dart';
import '../services/api_service.dart';
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

// ── Auth ────────────────────────────────────────────────────

final isAuthenticatedProvider = StateProvider<bool>((ref) => false);
final currentUserPhoneProvider = StateProvider<String>((ref) => '');
final activeOrgIdProvider = StateProvider<String?>((ref) => null);

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

// ── Stores ──────────────────────────────────────────────────

final storesProvider = FutureProvider<List<Store>>(
    (ref) => ref.watch(apiServiceProvider).fetchStores(limit: 50));

// ── Cart ────────────────────────────────────────────────────

final cartProvider =
    FutureProvider<Cart>((ref) => ref.watch(apiServiceProvider).fetchCart());

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
