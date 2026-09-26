import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/app_widgets.dart';
import '../../widgets/common_widgets.dart';

/// Commerce landing tab (spec §14). Every section is backed by a real API call
/// — categories, a ranked product listing and suppliers — with no fabricated
/// "recommendations" or hardcoded promo banners. Merchant tooling is gated to
/// merchant roles so buyers never see dead "Merchant Dashboard" launchers
/// (fixes the role leakage the audit flagged at the old home L164-170).
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadCountProvider).valueOrNull ?? 0;
    final profile = ref.watch(profileProvider).valueOrNull;
    // activeOrgIdProvider updates immediately on switch; the profile's
    // activeOrgId is the fallback until the provider is populated.
    final effectiveOrgId =
        ref.watch(activeOrgIdProvider) ?? profile?.activeOrgId;
    final activeOrg = (effectiveOrgId != null && profile != null)
        ? profile.organizations
            .where((o) => o.orgId == effectiveOrgId)
            .firstOrNull
        : null;
    final role = profile?.role;
    final isMerchant = role == 'MERCHANT_OWNER' || role == 'MERCHANT_STAFF';
    final phone = ref.watch(currentUserPhoneProvider);
    final fullName = profile?.fullName;
    final avatarLetter = (fullName != null && fullName.isNotEmpty)
        ? fullName.substring(0, 1)
        : (phone.isNotEmpty ? phone.substring(0, 1) : '?');

    return Scaffold(
      appBar: AppBar(title: const Text('Smart Commerce'), actions: [
        IconButton(
          tooltip: 'Notifications',
          icon: Badge(
            isLabelVisible: unread > 0,
            label: Text(unread > 99 ? '99+' : '$unread'),
            child: const Icon(Icons.notifications_outlined),
          ),
          onPressed: () => context.push('/notifications'),
        ),
      ]),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(profileProvider);
          ref.invalidate(unreadCountProvider);
          ref.invalidate(categoriesProvider);
          ref.invalidate(featuredProductsProvider);
          ref.invalidate(storesProvider);
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            _greeting(context, fullName, phone, avatarLetter),
            if (activeOrg != null) ...[
              const SizedBox(height: 12),
              _orgBanner(context, activeOrg),
            ],
            if (activeOrg == null &&
                (profile?.organizations.isEmpty ?? true)) ...[
              const SizedBox(height: 12),
              _registerCta(context),
            ],
            const SizedBox(height: 16),
            _searchBar(context),
            const SizedBox(height: 20),
            _categoriesSection(context, ref),
            _popularSection(context, ref),
            _suppliersSection(context, ref),
            if (isMerchant) _manageSection(context),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  // ── Header ────────────────────────────────────────────────
  Widget _greeting(
      BuildContext context, String? fullName, String phone, String letter) {
    return Row(children: [
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(
            'Welcome back${fullName != null && fullName.isNotEmpty ? ', $fullName' : ''}',
            style: Theme.of(context)
                .textTheme
                .headlineSmall
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          Text(phone, style: const TextStyle(color: TaifTokens.muted)),
        ]),
      ),
      GestureDetector(
        onTap: () => context.go('/profile'),
        child: CircleAvatar(
          radius: 22,
          backgroundColor: TaifTokens.brandPrimary,
          child: Text(letter.toUpperCase(),
              style: const TextStyle(
                  color: Colors.white, fontWeight: FontWeight.w700)),
        ),
      ),
    ]);
  }

  Widget _orgBanner(BuildContext context, OrgMembership org) {
    return GestureDetector(
      onTap: () => context.push('/organizations'),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: TaifTokens.ok.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(TaifTokens.radiusSm),
          border: Border.all(color: TaifTokens.ok.withValues(alpha: 0.3)),
        ),
        child: Row(children: [
          const Icon(Icons.business, size: 16, color: TaifTokens.ok),
          const SizedBox(width: 8),
          Expanded(
            child: Text(org.orgName,
                style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: TaifTokens.ok)),
          ),
          const Chip(
            label: Text('Active', style: TextStyle(fontSize: 10)),
            backgroundColor: Color(0xFFDCFCE7),
            visualDensity: VisualDensity.compact,
          ),
        ]),
      ),
    );
  }

  Widget _registerCta(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/merchant/register'),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: TaifTokens.brandAccent.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
          border:
              Border.all(color: TaifTokens.brandAccent.withValues(alpha: 0.4)),
        ),
        child: const Row(children: [
          Icon(Icons.store, size: 24, color: TaifTokens.brandAccent),
          SizedBox(width: 12),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Register Your Store',
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: TaifTokens.ink)),
              Text('Set up your business on the platform',
                  style: TextStyle(fontSize: 12, color: TaifTokens.muted)),
            ]),
          ),
          Icon(Icons.arrow_forward_ios, size: 14, color: TaifTokens.muted),
        ]),
      ),
    );
  }

  Widget _searchBar(BuildContext context) {
    return GestureDetector(
      onTap: () => context.go('/search'),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: TaifTokens.surface,
          borderRadius: BorderRadius.circular(TaifTokens.radiusSm),
          border: Border.all(color: TaifTokens.line),
        ),
        child: const Row(children: [
          Icon(Icons.search, color: TaifTokens.muted),
          SizedBox(width: 10),
          Expanded(
            child: Text('Search products, brands, stores…',
                style: TextStyle(fontSize: 14, color: TaifTokens.muted)),
          ),
        ]),
      ),
    );
  }

  // ── Sections ──────────────────────────────────────────────
  Widget _sectionHeader(BuildContext context, String title,
      {String? actionLabel, VoidCallback? onAction}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(children: [
        Text(title,
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w600)),
        const Spacer(),
        if (onAction != null)
          TextButton(
              onPressed: onAction, child: Text(actionLabel ?? 'See all')),
      ]),
    );
  }

  Widget _categoriesSection(BuildContext context, WidgetRef ref) {
    final cats = ref.watch(categoriesProvider);
    return cats.maybeWhen(
      data: (list) => list.isEmpty
          ? const SizedBox.shrink()
          : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              _sectionHeader(context, 'Categories'),
              SizedBox(
                height: 96,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    for (final c in list) _categoryTile(context, ref, c),
                  ],
                ),
              ),
              const SizedBox(height: 24),
            ]),
      orElse: () => const SizedBox.shrink(),
    );
  }

  Widget _categoryTile(BuildContext context, WidgetRef ref, Category c) {
    return Padding(
      padding: const EdgeInsets.only(right: 10),
      child: GestureDetector(
        onTap: () {
          // Hand the category to the search tab; SearchScreen listens for it.
          ref.read(searchCategoryProvider.notifier).state = c.id;
          context.go('/search');
        },
        child: Container(
          width: 84,
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: TaifTokens.surface,
            borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
            border: Border.all(color: TaifTokens.line),
          ),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: TaifTokens.brandPrimary.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.category_outlined,
                  size: 20, color: TaifTokens.brandPrimary),
            ),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              child: Text(c.name,
                  maxLines: 2,
                  textAlign: TextAlign.center,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 11, fontWeight: FontWeight.w600)),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _popularSection(BuildContext context, WidgetRef ref) {
    final feed = ref.watch(featuredProductsProvider);
    return feed.when(
      data: (res) => res.products.isEmpty
          ? const SizedBox.shrink()
          : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              _sectionHeader(context, 'Popular products',
                  actionLabel: 'See all',
                  onAction: () => context.go('/search')),
              SizedBox(
                height: 288,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    for (final p in res.products)
                      Padding(
                        padding: const EdgeInsets.only(right: 12),
                        child: SizedBox(
                          width: 168,
                          child: ProductCard(
                            product: p,
                            onTap: () => context.push('/products/${p.id}'),
                            onAddToCart: () => _addToCart(context, ref, p),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
            ]),
      loading: () =>
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _sectionHeader(context, 'Popular products'),
        SizedBox(
          height: 288,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: const [
              SizedBox(width: 168, child: AppSkeletonProductCard()),
              SizedBox(width: 12),
              SizedBox(width: 168, child: AppSkeletonProductCard()),
              SizedBox(width: 12),
              SizedBox(width: 168, child: AppSkeletonProductCard()),
            ],
          ),
        ),
        const SizedBox(height: 24),
      ]),
      error: (_, __) => const SizedBox.shrink(),
    );
  }

  Widget _suppliersSection(BuildContext context, WidgetRef ref) {
    final stores = ref.watch(storesProvider);
    return stores.maybeWhen(
      data: (list) => list.isEmpty
          ? const SizedBox.shrink()
          : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              _sectionHeader(context, 'Suppliers',
                  actionLabel: 'See all',
                  onAction: () => context.push('/stores')),
              SizedBox(
                height: 92,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    for (final s in list.take(12)) _storeTile(context, s),
                  ],
                ),
              ),
              const SizedBox(height: 24),
            ]),
      orElse: () => const SizedBox.shrink(),
    );
  }

  Widget _storeTile(BuildContext context, Store s) {
    final verified = s.verificationStatus == 'VERIFIED';
    return Padding(
      padding: const EdgeInsets.only(right: 10),
      child: GestureDetector(
        onTap: () => context.push('/stores/${s.id}'),
        child: Container(
          width: 220,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: TaifTokens.surface,
            borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
            border: Border.all(color: TaifTokens.line),
          ),
          child: Row(children: [
            AppNetworkImage(
              url: s.logoUrl,
              width: 44,
              height: 44,
              radius: TaifTokens.radiusSm,
              fallbackIcon: Icons.storefront,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Flexible(
                      child: Text(s.displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w600)),
                    ),
                    if (verified)
                      const Padding(
                        padding: EdgeInsets.only(left: 4),
                        child: Icon(Icons.verified,
                            size: 14, color: TaifTokens.ok),
                      ),
                  ]),
                  const SizedBox(height: 2),
                  Text(s.currency,
                      style: const TextStyle(
                          fontSize: 11, color: TaifTokens.muted)),
                ],
              ),
            ),
          ]),
        ),
      ),
    );
  }

  /// Merchant tooling — rendered ONLY for merchant roles. Buyers never see
  /// these launchers (the old home showed them to everyone).
  Widget _manageSection(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _sectionHeader(context, 'Manage'),
      Row(children: [
        _navCard(context, 'Dashboard', Icons.dashboard, '/merchant',
            TaifTokens.brandPrimary),
        const SizedBox(width: 12),
        _navCard(context, 'Orders', Icons.receipt_long, '/merchant?tab=orders',
            const Color(0xFF7C3AED)),
      ]),
      const SizedBox(height: 12),
      Row(children: [
        _navCard(context, 'Catalog', Icons.inventory_2, '/merchant?tab=catalog',
            TaifTokens.info),
        const SizedBox(width: 12),
        _navCard(context, 'Inventory', Icons.warehouse,
            '/merchant?tab=inventory', TaifTokens.warn),
      ]),
      const SizedBox(height: 24),
    ]);
  }

  Widget _navCard(BuildContext context, String label, IconData icon,
          String route, Color color) =>
      Expanded(
        child: GestureDetector(
          onTap: () => context.push(route),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(children: [
                Icon(icon, size: 30, color: color),
                const SizedBox(height: 8),
                Text(label,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w600)),
              ]),
            ),
          ),
        ),
      );

  Future<void> _addToCart(
      BuildContext context, WidgetRef ref, Product p) async {
    try {
      await ref.read(apiServiceProvider).addProductToCart(p);
      ref.invalidate(cartProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Added to cart'), duration: Duration(seconds: 1)));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(ApiService.errorMessage(e))));
      }
    }
  }
}
