import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common_widgets.dart';

class MerchantOrdersScreen extends ConsumerWidget {
  const MerchantOrdersScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(ordersProvider);
    return Scaffold(
        appBar: AppBar(title: const Text('Merchant Orders'), actions: [
          IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: () => ref.invalidate(ordersProvider)),
        ]),
        body: orders.when(
          data: (list) {
            final pending = list
                .where((o) =>
                    o.status == 'SUBMITTED' ||
                    o.status == 'PENDING_CONFIRMATION')
                .toList();
            final active = list
                .where((o) => ![
                      'SUBMITTED',
                      'PENDING_CONFIRMATION',
                      'COMPLETED',
                      'CANCELLED',
                      'REJECTED'
                    ].contains(o.status))
                .toList();
            final done = list
                .where((o) =>
                    ['COMPLETED', 'CANCELLED', 'REJECTED'].contains(o.status))
                .toList();
            return ListView(children: [
              if (pending.isNotEmpty) ...[
                _section('Pending (${pending.length})', TaifTokens.warn),
                ...pending.map((o) => _pendingCard(context, ref, o))
              ],
              if (active.isNotEmpty) ...[
                _section('Active (${active.length})', TaifTokens.info),
                ...active.map((o) => _activeCard(context, ref, o))
              ],
              if (done.isNotEmpty) ...[
                _section('Completed (${done.length})', TaifTokens.muted),
                ...done.map((o) => _doneCard(o))
              ],
              if (list.isEmpty)
                const EmptyState(
                    title: 'No orders',
                    description: 'Orders from buyers will appear here'),
            ]);
          },
          loading: () => const LoadingSpinner(),
          error: (e, _) => EmptyState(
              title: 'Error',
              description: '$e',
              onAction: () => ref.invalidate(ordersProvider)),
        ));
  }

  Widget _section(String title, Color color) => Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Text(title,
          style: TextStyle(
              fontWeight: FontWeight.w600, color: color, fontSize: 14)));
  Widget _pendingCard(BuildContext context, WidgetRef ref, SubOrder o) => Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: ListTile(
          title: Text('Order #${o.id.substring(0, 8)}',
              style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle:
              Text('${formatMinor(o.totalMinor)} · ${o.items.length} items'),
          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
            ElevatedButton(
                onPressed: () async {
                  await ref.read(apiServiceProvider).acceptOrder(o.id);
                  ref.invalidate(ordersProvider);
                },
                style: ElevatedButton.styleFrom(backgroundColor: TaifTokens.ok),
                child: const Text('Accept', style: TextStyle(fontSize: 12))),
            const SizedBox(width: 4),
            OutlinedButton(
                onPressed: () async {
                  await ref
                      .read(apiServiceProvider)
                      .rejectOrder(o.id, 'Rejected by merchant');
                  ref.invalidate(ordersProvider);
                },
                style:
                    OutlinedButton.styleFrom(foregroundColor: TaifTokens.err),
                child: const Text('Reject', style: TextStyle(fontSize: 12))),
          ])));
  Widget _activeCard(BuildContext context, WidgetRef ref, SubOrder o) {
    final next = _nextStatuses(o.status);
    return Card(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        child: ListTile(
            title: Text('Order #${o.id.substring(0, 8)}'),
            subtitle: Text(formatMinor(o.totalMinor)),
            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
              StatusBadge(o.status),
              ...next.map((ns) => Padding(
                  padding: const EdgeInsets.only(left: 4),
                  child: ElevatedButton(
                      onPressed: () async {
                        await ref
                            .read(apiServiceProvider)
                            .transitionStatus(o.id, ns);
                        ref.invalidate(ordersProvider);
                      },
                      style: ElevatedButton.styleFrom(
                          minimumSize: Size.zero,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 4)),
                      child: Text(ns.replaceAll('_', ' '),
                          style: const TextStyle(fontSize: 10)))))
            ])));
  }

  Widget _doneCard(SubOrder o) => Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: ListTile(
          title: Text('Order #${o.id.substring(0, 8)}',
              style: const TextStyle(color: TaifTokens.muted)),
          trailing: StatusBadge(o.status)));
  List<String> _nextStatuses(String s) => switch (s) {
        'ACCEPTED' || 'PARTIALLY_ACCEPTED' => ['PREPARING'],
        'PREPARING' => ['READY'],
        'READY' => ['OUT_FOR_DELIVERY', 'ASSIGNED', 'DELIVERED', 'CANCELLED'],
        'ASSIGNED' => ['PICKED_UP'],
        'PICKED_UP' => ['OUT_FOR_DELIVERY'],
        'OUT_FOR_DELIVERY' => ['DELIVERED'],
        'DELIVERED' => ['COMPLETED', 'DISPUTED'],
        _ => []
      };
}
