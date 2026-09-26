import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/common_widgets.dart';

/// Merchant dashboard hub — entry point to all store-management tools.
/// Gated on the merchant having an active org + store; otherwise shows an
/// onboarding CTA. Mirrors the web /merchant hub.
class MerchantDashboardScreen extends ConsumerWidget {
  /// Optional tab-switch callback supplied by the merchant console shell. When
  /// present, the Catalog / Inventory / Orders cards switch the console tab
  /// instead of pushing a standalone route; when null (dashboard rendered
  /// outside the shell) they fall back to `context.push`.
  const MerchantDashboardScreen({super.key, this.onOpenSection});

  final void Function(String sectionKey)? onOpenSection;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider);
    final storeAsync = ref.watch(activeStoreProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Merchant Dashboard'), actions: [
        IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              ref.invalidate(profileProvider);
              ref.invalidate(myStoresProvider);
            }),
      ]),
      body: profile.when(
        loading: () => const LoadingSpinner(),
        error: (e, _) => EmptyState(
            title: 'Error',
            description: ApiService.errorMessage(e),
            onAction: () => ref.invalidate(profileProvider)),
        data: (p) {
          final effectiveOrgId =
              ref.watch(activeOrgIdProvider) ?? p.activeOrgId;
          final hasOrg = effectiveOrgId != null && effectiveOrgId.isNotEmpty;
          if (!hasOrg) {
            return _onboardCta(
              context,
              icon: Icons.store_outlined,
              title: 'No business yet',
              message:
                  'Register your store to start managing products and orders.',
              actionLabel: 'Register Your Store',
            );
          }
          return storeAsync.when(
            loading: () => const LoadingSpinner(),
            error: (e, _) => EmptyState(
                title: 'Error',
                description: ApiService.errorMessage(e),
                onAction: () => ref.invalidate(myStoresProvider)),
            data: (store) {
              if (store == null) {
                return _onboardCta(
                  context,
                  icon: Icons.storefront_outlined,
                  title: 'No store yet',
                  message:
                      'Your organization has no storefront. Complete registration to create one.',
                  actionLabel: 'Create Your Store',
                );
              }
              return _hub(context, ref, store);
            },
          );
        },
      ),
    );
  }

  Widget _hub(BuildContext context, WidgetRef ref, Store store) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: TaifTokens.brandPrimary.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
            border: Border.all(
                color: TaifTokens.brandPrimary.withValues(alpha: 0.2)),
          ),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(
                  child: Text(store.displayName,
                      style: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.w700))),
              StatusBadge(store.verificationStatus),
            ]),
            const SizedBox(height: 4),
            Text('/${store.slug} · ${store.currency}',
                style: const TextStyle(fontSize: 13, color: TaifTokens.muted)),
          ]),
        ),
        const SizedBox(height: 20),
        _kpis(context, ref),
        const SizedBox(height: 20),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.2,
          children: [
            _card(context, 'Store Profile', Icons.storefront, '/merchant/store',
                TaifTokens.brandPrimary),
            _card(context, 'Catalog', Icons.inventory_2, '/merchant/catalog',
                TaifTokens.info,
                onTap: () => _open(context, 'catalog', '/merchant/catalog')),
            _card(context, 'Inventory', Icons.bar_chart, '/merchant/inventory',
                const Color(0xFF059669),
                onTap: () =>
                    _open(context, 'inventory', '/merchant/inventory')),
            _card(context, 'Categories', Icons.category, '/merchant/categories',
                TaifTokens.warn),
            _card(context, 'Orders', Icons.receipt_long, '/merchant/orders',
                const Color(0xFF7C3AED),
                onTap: () => _open(context, 'orders', '/merchant/orders')),
            _card(context, 'Customers', Icons.people, '/merchant/customers',
                TaifTokens.ok),
            _card(context, 'Offers', Icons.local_offer, '/merchant/offers',
                TaifTokens.brandAccent),
            _card(context, 'Organization', Icons.business, '/organizations',
                const Color(0xFF0891B2)),
          ],
        ),
      ]);

  Widget _card(BuildContext context, String label, IconData icon, String route,
          Color color, {VoidCallback? onTap}) =>
      GestureDetector(
          onTap: onTap ?? () => context.push(route),
          child: Card(
              child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(icon, size: 34, color: color),
                        const SizedBox(height: 10),
                        Text(label,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                                fontSize: 13, fontWeight: FontWeight.w600))
                      ]))));

  /// Open a console section: switch tabs when hosted in the shell, else push.
  void _open(BuildContext context, String key, String route) {
    final cb = onOpenSection;
    if (cb != null) {
      cb(key);
    } else {
      context.push(route);
    }
  }

  /// KPI strip (audit row 190 / spec §29). Every figure is real API data; a
  /// `null` (endpoint unavailable) renders "—", never a fabricated zero.
  Widget _kpis(BuildContext context, WidgetRef ref) {
    final kpis = ref.watch(merchantKpisProvider);
    return kpis.when(
      loading: () =>
          const SizedBox(height: 96, child: Center(child: LoadingSpinner())),
      error: (e, _) => const Text('KPIs unavailable',
          style: TextStyle(fontSize: 12, color: TaifTokens.muted)),
      data: (k) => GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 1.7,
        children: [
          _kpiTile(
              context,
              'Revenue',
              k.revenueMinor == null
                  ? '—'
                  : formatMinor(k.revenueMinor!, k.currency),
              sub: k.unitsSold == null ? null : '${k.unitsSold} units sold',
              onTap: () => _open(context, 'orders', '/merchant/orders')),
          _kpiTile(context, 'Orders', '${k.ordersCount}',
              sub: 'total sub-orders',
              onTap: () => _open(context, 'orders', '/merchant/orders')),
          _kpiTile(context, 'Pending', '${k.pendingCount}',
              sub: 'awaiting action',
              accent: k.pendingCount > 0 ? TaifTokens.warn : null,
              onTap: () => _open(context, 'orders', '/merchant/orders')),
          _kpiTile(context, 'Low stock',
              k.lowStockCount == null ? '—' : '${k.lowStockCount}',
              sub: 'at/below reorder',
              accent: (k.lowStockCount ?? 0) > 0 ? TaifTokens.err : null,
              onTap: () => _open(context, 'inventory', '/merchant/inventory')),
        ],
      ),
    );
  }

  Widget _kpiTile(BuildContext context, String label, String value,
      {String? sub, Color? accent, VoidCallback? onTap}) {
    final color = accent ?? TaifTokens.ink;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: TaifTokens.surface,
          borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
          border: Border.all(color: TaifTokens.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(label.toUpperCase(),
                style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: TaifTokens.muted,
                    letterSpacing: 0.4)),
            const SizedBox(height: 6),
            Text(value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 20, fontWeight: FontWeight.w700, color: color)),
            if (sub != null)
              Text(sub,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style:
                      const TextStyle(fontSize: 11, color: TaifTokens.muted)),
          ],
        ),
      ),
    );
  }

  Widget _onboardCta(BuildContext context,
          {required IconData icon,
          required String title,
          required String message,
          required String actionLabel}) =>
      Center(
          child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Icon(icon, size: 64, color: TaifTokens.line),
                const SizedBox(height: 16),
                Text(title,
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Text(message,
                    textAlign: TextAlign.center,
                    style: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.copyWith(color: TaifTokens.muted)),
                const SizedBox(height: 20),
                ElevatedButton.icon(
                    onPressed: () => context.push('/merchant/register'),
                    icon: const Icon(Icons.add_business),
                    label: Text(actionLabel),
                    style: ElevatedButton.styleFrom(
                        backgroundColor: TaifTokens.brandPrimary)),
              ])));
}
