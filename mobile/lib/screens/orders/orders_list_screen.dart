import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common_widgets.dart';

class OrdersListScreen extends ConsumerWidget {
  const OrdersListScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(ordersProvider);
    return Scaffold(
        appBar: AppBar(title: const Text('My Orders'), actions: [
          IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: () => ref.invalidate(ordersProvider)),
        ]),
        body: orders.when(
          data: (list) => list.isEmpty
              ? EmptyState(
                  title: 'No orders yet',
                  description: 'Place your first order from the store',
                  icon: Icons.receipt_long,
                  onAction: () => context.go('/search'),
                  actionLabel: 'Browse')
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: list.length,
                  itemBuilder: (_, i) {
                    final o = list[i];
                    return Card(
                        child: ListTile(
                            title: Text('Order #${o.id.substring(0, 8)}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600)),
                            // A4-6: two suppliers produce two unreadable hex ids,
                            // so say who ships each order and how many lines.
                            subtitle: Text(
                                '${o.storeName ?? 'Seller unavailable'} · ${o.itemCount} ${o.itemCount == 1 ? 'item' : 'items'}\n'
                                '${DateTime.tryParse(o.createdAt)?.toLocal().toString().substring(0, 16) ?? o.createdAt} · ${formatMinor(o.totalMinor, o.currency)}'),
                            trailing: StatusBadge(o.status),
                            onTap: () => context.push('/orders/${o.id}')));
                  }),
          loading: () => const LoadingSpinner(),
          error: (e, _) => EmptyState(
              title: 'Error',
              description: '$e',
              onAction: () => ref.invalidate(ordersProvider)),
        ));
  }
}
