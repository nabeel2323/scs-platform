import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/app_widgets.dart';
import '../../widgets/common_widgets.dart';

/// Merchant offers list — the pricing / offer-management surface.
///
/// Shows all offers for the active store, enriched with analytics data
/// (product title, orders, units sold, revenue). Supports client-side status
/// filtering and pull-to-refresh. Tapping a card navigates to offer detail
/// (Phase 3); the FAB opens the create-offer workflow (Phase 4).
class MerchantOffersScreen extends ConsumerStatefulWidget {
  const MerchantOffersScreen({super.key});
  @override
  ConsumerState<MerchantOffersScreen> createState() =>
      _MerchantOffersScreenState();
}

class _MerchantOffersScreenState extends ConsumerState<MerchantOffersScreen> {
  /// null = show all; otherwise one of the OfferStatus values.
  String? _statusFilter;

  static const _allStatuses = [
    'DRAFT',
    'PROPOSED',
    'ACTIVE',
    'SUSPENDED',
    'REJECTED',
    'WITHDRAWN',
  ];

  @override
  Widget build(BuildContext context) {
    final storeAsync = ref.watch(activeStoreProvider);
    final offersAsync = ref.watch(merchantOffersProvider);
    final analyticsAsync = ref.watch(merchantOfferAnalyticsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Offers'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              ref.invalidate(merchantOffersProvider);
              ref.invalidate(merchantOfferAnalyticsProvider);
            },
          ),
        ],
      ),
      body: storeAsync.when(
        loading: () => const LoadingSpinner(),
        error: (e, _) => AppErrorState(
          title: 'Could not load store',
          message: ApiService.errorMessage(e),
          onRetry: () => ref.invalidate(myStoresProvider),
        ),
        data: (store) {
          if (store == null) {
            return const EmptyState(
              title: 'No store',
              description: 'Register your store to manage offers and pricing.',
              icon: Icons.storefront_outlined,
            );
          }
          return Column(children: [
            // Store context header
            _storeHeader(store),
            // Status filter chips
            _filterChips(),
            // Offers list
            Expanded(
              child: offersAsync.when(
                loading: () => const _OffersLoadingState(),
                error: (e, _) => AppErrorState(
                  title: 'Could not load offers',
                  message: ApiService.errorMessage(e),
                  onRetry: () => ref.invalidate(merchantOffersProvider),
                ),
                data: (offers) {
                  // Build analytics lookup for enrichment.
                  final analyticsMap = <String, OfferAnalyticsRow>{};
                  analyticsAsync.whenData((rows) {
                    for (final r in rows) {
                      analyticsMap[r.offerId] = r;
                    }
                  });

                  final filtered = _statusFilter == null
                      ? offers
                      : offers.where((o) => o.status == _statusFilter).toList();

                  if (offers.isEmpty) {
                    return EmptyState(
                      title: 'No offers yet',
                      description:
                          'Create your first offer to set pricing and start selling products.',
                      icon: Icons.local_offer_outlined,
                      onAction: () => context.push('/merchant/offers/new'),
                      actionLabel: 'Create Offer',
                    );
                  }

                  if (filtered.isEmpty) {
                    return EmptyState(
                      title: 'No ${_statusFilter!.toLowerCase()} offers',
                      description:
                          'Try a different status filter or create a new offer.',
                      icon: Icons.filter_list_off,
                      onAction: () => setState(() => _statusFilter = null),
                      actionLabel: 'Show All',
                    );
                  }

                  return RefreshIndicator(
                    onRefresh: () async {
                      ref.invalidate(merchantOffersProvider);
                      ref.invalidate(merchantOfferAnalyticsProvider);
                      await ref.read(merchantOffersProvider.future);
                    },
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 80),
                      children: [
                        // Summary strip
                        _summaryStrip(offers, analyticsMap),
                        const SizedBox(height: 12),
                        // Offer cards
                        ...filtered.map((o) =>
                            _offerCard(o, analyticsMap[o.id], store.currency)),
                      ],
                    ),
                  );
                },
              ),
            ),
          ]);
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/merchant/offers/new'),
        backgroundColor: TaifTokens.brandPrimary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('New Offer'),
      ),
    );
  }

  Widget _storeHeader(Store store) => Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
        color: TaifTokens.brandPrimary.withValues(alpha: 0.04),
        child: Row(children: [
          const Icon(Icons.storefront,
              size: 18, color: TaifTokens.brandPrimary),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              store.displayName,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          StatusBadge(store.verificationStatus),
        ]),
      );

  Widget _filterChips() => SizedBox(
        height: 48,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          children: [
            _chip('All', null),
            ..._allStatuses.map((s) => _chip(s.replaceAll('_', ' '), s)),
          ],
        ),
      );

  Widget _chip(String label, String? status) {
    final selected = _statusFilter == status;
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: FilterChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => setState(() => _statusFilter = status),
        selectedColor: TaifTokens.brandPrimary.withValues(alpha: 0.15),
        checkmarkColor: TaifTokens.brandPrimary,
        labelStyle: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: selected ? TaifTokens.brandPrimary : TaifTokens.ink,
        ),
      ),
    );
  }

  Widget _summaryStrip(
      List<MerchantOffer> offers, Map<String, OfferAnalyticsRow> analytics) {
    final activeCount = offers.where((o) => o.status == 'ACTIVE').length;
    final draftCount = offers.where((o) => o.status == 'DRAFT').length;
    int totalRevenueMinor = 0;
    for (final o in offers) {
      final a = analytics[o.id];
      if (a != null) totalRevenueMinor += a.revenueMinor;
    }
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: TaifTokens.surface,
        borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
        border: Border.all(color: TaifTokens.line),
      ),
      child: Row(children: [
        _summaryItem('${offers.length}', 'Total', TaifTokens.ink),
        _divider(),
        _summaryItem('$activeCount', 'Active', TaifTokens.ok),
        _divider(),
        _summaryItem('$draftCount', 'Draft', TaifTokens.muted),
        _divider(),
        _summaryItem(
          totalRevenueMinor > 0 ? formatMinor(totalRevenueMinor) : '—',
          'Revenue',
          TaifTokens.brandPrimary,
        ),
      ]),
    );
  }

  Widget _summaryItem(String value, String label, Color color) => Expanded(
        child: Column(children: [
          Text(value,
              style: TextStyle(
                  fontSize: 16, fontWeight: FontWeight.w700, color: color)),
          const SizedBox(height: 2),
          Text(label.toUpperCase(),
              style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: TaifTokens.muted,
                  letterSpacing: 0.3)),
        ]),
      );

  Widget _divider() => Container(
      width: 1,
      height: 28,
      color: TaifTokens.line,
      margin: const EdgeInsets.symmetric(horizontal: 4));

  Widget _offerCard(
      MerchantOffer offer, OfferAnalyticsRow? analytics, String currency) {
    final productName = analytics?.productTitle ??
        'Product ${offer.productId.substring(0, 8)}…';
    final price = offer.basePriceMinor != null
        ? formatMinor(offer.basePriceMinor!, offer.currency)
        : '—';
    return Semantics(
      button: true,
      label: 'Offer ${offer.status}, $price',
      child: Card(
        margin: const EdgeInsets.only(bottom: 8),
        child: InkWell(
          onTap: () => context.push('/merchant/offers/${offer.id}'),
          borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Row 1: status + price
                Row(children: [
                  StatusBadge(offer.status),
                  const Spacer(),
                  Text(price,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                          color: TaifTokens.brandPrimary)),
                ]),
                const SizedBox(height: 8),
                // Row 2: product name
                Text(productName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 14)),
                const SizedBox(height: 4),
                // Row 3: commercial terms
                Row(children: [
                  _term('MOQ', '${offer.moq}'),
                  const SizedBox(width: 12),
                  if (offer.leadTimeDays != null) ...[
                    _term('Lead', '${offer.leadTimeDays}d'),
                    const SizedBox(width: 12),
                  ],
                  if (offer.compareAtPriceMinor != null &&
                      offer.basePriceMinor != null &&
                      offer.compareAtPriceMinor! > offer.basePriceMinor!)
                    Text(
                      'was ${formatMinor(offer.compareAtPriceMinor!, offer.currency)}',
                      style: const TextStyle(
                          fontSize: 11,
                          color: TaifTokens.muted,
                          decoration: TextDecoration.lineThrough),
                    ),
                ]),
                // Row 4: analytics KPIs (if available)
                if (analytics != null &&
                    (analytics.ordersCount > 0 ||
                        analytics.unitsSold > 0 ||
                        analytics.revenueMinor > 0)) ...[
                  const SizedBox(height: 8),
                  const Divider(height: 1),
                  const SizedBox(height: 8),
                  Row(children: [
                    _kpi(Icons.shopping_cart, '${analytics.ordersCount}',
                        'orders'),
                    const SizedBox(width: 16),
                    _kpi(Icons.inventory_2, '${analytics.unitsSold}', 'units'),
                    const SizedBox(width: 16),
                    _kpi(
                        Icons.trending_up,
                        analytics.revenueMinor > 0
                            ? formatMinor(analytics.revenueMinor, currency)
                            : '—',
                        'revenue'),
                  ]),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _term(String label, String value) =>
      Row(mainAxisSize: MainAxisSize.min, children: [
        Text('$label: ',
            style: const TextStyle(fontSize: 12, color: TaifTokens.muted)),
        Text(value,
            style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: TaifTokens.ink)),
      ]);

  Widget _kpi(IconData icon, String value, String label) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: TaifTokens.muted),
          const SizedBox(width: 3),
          Text(value,
              style:
                  const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
          const SizedBox(width: 2),
          Text(label,
              style: const TextStyle(fontSize: 11, color: TaifTokens.muted)),
        ],
      );
}

/// Shimmer skeleton shown while offers are loading — matches the card layout
/// so the screen shape is visible before data arrives.
class _OffersLoadingState extends StatelessWidget {
  const _OffersLoadingState();
  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 80),
        children: [
          // Summary skeleton
          const AppSkeletonBox(height: 64, radius: 10),
          const SizedBox(height: 12),
          // Card skeletons
          for (int i = 0; i < 4; i++) ...[
            const Card(
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      AppSkeletonBox(width: 70, height: 20, radius: 10),
                      Spacer(),
                      AppSkeletonBox(width: 80, height: 16),
                    ]),
                    SizedBox(height: 10),
                    AppSkeletonBox(height: 14),
                    SizedBox(height: 8),
                    AppSkeletonBox(width: 140, height: 12),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 4),
          ],
        ],
      );
}
