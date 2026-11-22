import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/common_widgets.dart';

/// Buyer view of the order history bucket a status falls into. Mirrors the
/// merchant screen's Pending/Active/Done split, from the buyer's side. Filtering
/// is client-side over the already-fetched list, so tabs switch instantly with
/// no extra round-trip (audit 4.3 row 159 / §24).
enum _OrderFilter { all, active, completed, cancelled }

Future<void> _refreshBuyerOrders(WidgetRef ref) async {
  try {
    await ref.refresh(ordersProvider.future);
  } catch (_) {
    // The AsyncValue carries the refresh failure; keep pull-to-refresh usable.
  }
}

class OrdersListScreen extends ConsumerStatefulWidget {
  const OrdersListScreen({super.key});
  @override
  ConsumerState<OrdersListScreen> createState() => _OrdersListScreenState();
}

class _OrdersListScreenState extends ConsumerState<OrdersListScreen> {
  _OrderFilter _filter = _OrderFilter.all;

  // DELIVERED is grouped with COMPLETED: from the buyer's seat the goods have
  // arrived and nothing further is in motion. DISPUTED stays under "active"
  // because it is still being worked.
  static const _completed = {'DELIVERED', 'COMPLETED'};
  static const _cancelled = {'CANCELLED', 'REJECTED'};

  bool _matches(SubOrder o) => switch (_filter) {
        _OrderFilter.all => true,
        _OrderFilter.active =>
          !_completed.contains(o.status) && !_cancelled.contains(o.status),
        _OrderFilter.completed => _completed.contains(o.status),
        _OrderFilter.cancelled => _cancelled.contains(o.status),
      };

  String _label(_OrderFilter f) => switch (f) {
        _OrderFilter.all => 'All',
        _OrderFilter.active => 'Active',
        _OrderFilter.completed => 'Completed',
        _OrderFilter.cancelled => 'Cancelled',
      };

  @override
  Widget build(BuildContext context) {
    final orders = ref.watch(ordersProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Orders'),
        actions: [
          IconButton(
            tooltip: 'Refresh orders',
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(ordersProvider),
          ),
        ],
      ),
      body: Column(
        children: [
          _filterBar(),
          Expanded(
            child: orders.when(
              skipLoadingOnRefresh: true,
              skipError: true,
              data: (list) {
                final showRefreshNotice =
                    orders.isRefreshing || orders.hasError;
                final filtered = list.where(_matches).toList();
                final children = <Widget>[
                  if (showRefreshNotice)
                    _refreshNotice(
                      orders.isRefreshing
                          ? 'Refreshing orders… showing the last successfully loaded list.'
                          : 'Could not refresh orders: ${ApiService.errorMessage(orders.error!)}. Showing the last successfully loaded list.',
                      () => ref.invalidate(ordersProvider),
                    ),
                  if (list.isEmpty)
                    SizedBox(
                      height: 320,
                      child: EmptyState(
                        title: 'No orders yet',
                        description: 'Place your first order from the store',
                        icon: Icons.receipt_long,
                        onAction: () => context.go('/search'),
                        actionLabel: 'Browse',
                      ),
                    )
                  else if (filtered.isEmpty)
                    SizedBox(
                      height: 320,
                      child: EmptyState(
                        title: 'Nothing here',
                        description: 'No ${_filter.name} orders.',
                        icon: Icons.filter_alt_off_outlined,
                      ),
                    )
                  else
                    ...filtered.map(_orderCard),
                ];

                return RefreshIndicator(
                  onRefresh: () => _refreshBuyerOrders(ref),
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(16),
                    children: children,
                  ),
                );
              },
              loading: () => const LoadingSpinner(),
              error: (e, _) => EmptyState(
                title: 'Error',
                description: ApiService.errorMessage(e),
                onAction: () => ref.invalidate(ordersProvider),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _filterBar() => SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
        child: Row(children: [
          for (final f in _OrderFilter.values)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(_label(f)),
                selected: _filter == f,
                onSelected: (_) => setState(() => _filter = f),
              ),
            ),
        ]),
      );

  Widget _orderCard(SubOrder o) => Card(
      child: ListTile(
          title: Text('Order #${o.id.substring(0, 8)}',
              style: const TextStyle(fontWeight: FontWeight.w600)),
          // A4-6: two suppliers produce two unreadable hex ids, so say who
          // ships each order and how many lines.
          subtitle: Text(
              '${o.storeName ?? 'Seller unavailable'} · ${o.itemCount} ${o.itemCount == 1 ? 'item' : 'items'}\n'
              '${DateTime.tryParse(o.createdAt)?.toLocal().toString().substring(0, 16) ?? o.createdAt} · ${formatMinor(o.totalMinor, o.currency)}'),
          trailing: StatusBadge(o.status),
          onTap: () => context.push('/orders/${o.id}')));

  Widget _refreshNotice(String message, VoidCallback onRetry) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: TaifTokens.err.withValues(alpha: 0.06),
          border: Border.all(color: TaifTokens.err.withValues(alpha: 0.3)),
          borderRadius: BorderRadius.circular(12),
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
}
