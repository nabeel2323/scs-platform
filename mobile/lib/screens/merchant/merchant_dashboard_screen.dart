import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/common_widgets.dart';

Future<void> _refreshRead<T>(Future<T> read) async {
  try {
    await read;
  } catch (_) {
    // Keep refreshing the independent dashboard reads when one source fails.
  }
}

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
      appBar: AppBar(
        title: const Text('Merchant Dashboard'),
        actions: [
          IconButton(
            tooltip: 'Refresh merchant dashboard',
            icon: const Icon(Icons.refresh),
            onPressed: () => _refreshDashboard(ref),
          ),
        ],
      ),
      body: profile.when(
        skipLoadingOnRefresh: true,
        skipLoadingOnReload: true,
        skipError: true,
        data: (p) {
          final effectiveOrgId =
              ref.watch(activeOrgIdProvider) ?? p.activeOrgId;
          final hasOrg = effectiveOrgId != null && effectiveOrgId.isNotEmpty;
          final notices = <Widget>[
            if (profile.isRefreshing)
              _readNotice(
                'Refreshing merchant identity… showing the last successfully loaded profile.',
                () => ref.invalidate(profileProvider),
              ),
            if (profile.hasError)
              _readNotice(
                'Could not refresh merchant identity: ${ApiService.errorMessage(profile.error!)}. Showing the last successfully loaded profile.',
                () => ref.invalidate(profileProvider),
              ),
          ];

          if (!hasOrg) {
            return _withReadNotices(
              _onboardCta(
                context,
                icon: Icons.store_outlined,
                title: p.hasPermission('identity:organizations:create')
                    ? 'No business yet'
                    : 'No active business',
                message: p.hasPermission('identity:organizations:create')
                    ? 'Register your store to start managing products and orders.'
                    : 'Use an invitation code to join an existing business before managing merchant tools.',
                actionLabel:
                    p.hasPermission('identity:organizations:create')
                        ? 'Register Your Store'
                        : 'Join an Organization',
              ),
              notices,
            );
          }

          return storeAsync.when(
            skipLoadingOnRefresh: true,
            skipLoadingOnReload: true,
            skipError: true,
            data: (store) {
              final allNotices = [...notices];
              if (storeAsync.isRefreshing) {
                allNotices.add(
                  _readNotice(
                    'Refreshing storefront… showing the last successfully loaded store.',
                    () => ref.invalidate(activeStoreProvider),
                  ),
                );
              }
              if (storeAsync.hasError) {
                allNotices.add(
                  _readNotice(
                    'Could not refresh storefront: ${ApiService.errorMessage(storeAsync.error!)}. Showing the last successfully loaded store.',
                    () => ref.invalidate(activeStoreProvider),
                  ),
                );
              }

              final content = store == null
                  ? (p.hasPermission('merchant:stores:write')
                      ? _onboardCta(
                          context,
                          icon: Icons.storefront_outlined,
                          title: 'No store yet',
                          message:
                              'Your organization has no storefront. Complete registration to create one.',
                          actionLabel: 'Create Your Store',
                        )
                      : const EmptyState(
                          title: 'No store available',
                          description:
                              'Your active organization can view merchant tools but does not have merchant:stores:write to create a storefront.',
                          icon: Icons.lock_outline,
                        ))
                  : _hub(context, ref, store, p);

              return _withReadNotices(
                content,
                allNotices,
                onRefresh: store == null ? null : () => _refreshDashboard(ref),
              );
            },
            loading: () => const LoadingSpinner(),
            error: (e, _) => EmptyState(
              title: 'Error',
              description: ApiService.errorMessage(e),
              onAction: () => ref.invalidate(activeStoreProvider),
            ),
          );
        },
        loading: () => const LoadingSpinner(),
        error: (e, _) => EmptyState(
          title: 'Error',
          description: ApiService.errorMessage(e),
          onAction: () => ref.invalidate(profileProvider),
        ),
      ),
    );
  }

  Future<void> _refreshDashboard(WidgetRef ref) async {
    await Future.wait<void>([
      _refreshRead(ref.refresh(profileProvider.future)),
      _refreshRead(ref.refresh(activeStoreProvider.future)),
      _refreshRead(ref.refresh(merchantKpisProvider.future)),
    ]);
  }

  Widget _withReadNotices(
    Widget content,
    List<Widget> notices, {
    Future<void> Function()? onRefresh,
  }) {
    final body = onRefresh == null
        ? content
        : RefreshIndicator(
            onRefresh: onRefresh,
            child: content,
          );
    if (notices.isEmpty) return body;
    return Column(
      children: [
        ...notices,
        Expanded(child: body),
      ],
    );
  }

  Widget _readNotice(String message, VoidCallback onRetry) => Container(
        width: double.infinity,
        margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: TaifTokens.err.withValues(alpha: 0.06),
          border: Border.all(color: TaifTokens.err.withValues(alpha: 0.3)),
          borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                message,
                style: const TextStyle(fontSize: 12, color: TaifTokens.err),
              ),
            ),
            TextButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      );

  Widget _hub(BuildContext context, WidgetRef ref, Store store, UserProfile profile) =>
      ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
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
        if (profile.hasPermission('merchant:orders:read')) _kpis(context, ref),
        const SizedBox(height: 20),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.2,
          children: [
            if (profile.hasPermission('merchant:stores:read'))
              _card(context, 'Store Profile', Icons.storefront, '/merchant/store',
                TaifTokens.brandPrimary),
            if (profile.hasPermission('catalog:products:read'))
              _card(context, 'Catalog', Icons.inventory_2, '/merchant/catalog',
                TaifTokens.info,
                onTap: () => _open(context, 'catalog', '/merchant/catalog')),
            if (profile.hasPermission('merchant:inventory:read'))
              _card(context, 'Inventory', Icons.bar_chart, '/merchant/inventory',
                const Color(0xFF059669),
                onTap: () =>
                    _open(context, 'inventory', '/merchant/inventory')),
            if (profile.hasPermission('catalog:categories:read'))
              _card(context, 'Categories', Icons.category, '/merchant/categories',
                TaifTokens.warn),
            if (profile.hasPermission('merchant:orders:read'))
              _card(context, 'Orders', Icons.receipt_long, '/merchant/orders',
                const Color(0xFF7C3AED),
                onTap: () => _open(context, 'orders', '/merchant/orders')),
            if (profile.hasPermission('merchant:orders:read'))
              _card(context, 'Customers', Icons.people, '/merchant/customers',
                TaifTokens.ok),
            if (profile.hasPermission('catalog:offers:write'))
              _card(context, 'Offers', Icons.local_offer, '/merchant/offers',
                TaifTokens.brandAccent),
            if (profile.hasPermission('merchant:pricing:read'))
              _card(context, 'Pricing', Icons.price_change, '/merchant/pricing',
                TaifTokens.info),
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
    final canReadInventory = ref.watch(profileProvider).valueOrNull?.hasPermission('merchant:inventory:read') ?? false;
    final kpis = ref.watch(merchantKpisProvider);
    return kpis.when(
      skipLoadingOnRefresh: true,
      skipError: true,
      loading: () =>
          const SizedBox(height: 96, child: Center(child: LoadingSpinner())),
      error: (e, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('KPIs unavailable',
              style: TextStyle(fontSize: 12, color: TaifTokens.muted)),
          TextButton.icon(
            onPressed: () => ref.invalidate(merchantKpisProvider),
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Retry KPIs'),
          ),
        ],
      ),
      data: (k) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (kpis.isRefreshing)
            const Padding(
              padding: EdgeInsets.only(bottom: 8),
              child: Text('Refreshing dashboard metrics… showing the last successful values.',
                  style: TextStyle(fontSize: 11, color: TaifTokens.muted)),
            ),
          if (kpis.hasError)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: TaifTokens.err.withValues(alpha: 0.06),
                border: Border.all(color: TaifTokens.err.withValues(alpha: 0.3)),
                borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
              ),
              child: Row(children: [
                Expanded(
                  child: Text(
                    'Could not refresh dashboard metrics: ${ApiService.errorMessage(kpis.error!)}. Showing the last successful values.',
                    style: const TextStyle(fontSize: 11, color: TaifTokens.err),
                  ),
                ),
                TextButton(
                  onPressed: () => ref.invalidate(merchantKpisProvider),
                  child: const Text('Retry'),
                ),
              ]),
            ),
          GridView.count(
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
          if (canReadInventory)
            _kpiTile(context, 'Low stock',
                k.lowStockCount == null ? '—' : '${k.lowStockCount}',
                sub: 'at/below reorder',
                accent: (k.lowStockCount ?? 0) > 0 ? TaifTokens.err : null,
                onTap: () => _open(context, 'inventory', '/merchant/inventory')),
        ],
          ),
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
