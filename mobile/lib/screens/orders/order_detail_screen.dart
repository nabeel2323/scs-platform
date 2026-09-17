import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/realtime_service.dart';
import '../../widgets/common_widgets.dart';

class OrderDetailScreen extends ConsumerStatefulWidget {
  final String orderId;
  const OrderDetailScreen({super.key, required this.orderId});

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  late final RealtimeService _realtime;
  late Future<SubOrder> _orderFuture;
  late Future<List<StatusHistoryEntry>> _historyFuture;
  StreamSubscription<OrderStatusEvent>? _sub;

  @override
  void initState() {
    super.initState();
    _load();

    // Live order-status push (WEB-B6): join this order's room and refresh the
    // status + history in place, replacing manual pull-to-refresh / polling.
    _realtime = ref.read(realtimeServiceProvider);
    _realtime.connect();
    _realtime.watchOrder(widget.orderId);
    _sub = _realtime.orderStatus.listen((evt) {
      if (!mounted || evt.orderId != widget.orderId) return;
      _load();
    });
  }

  void _load() {
    final api = ref.read(apiServiceProvider);
    final order = api.fetchOrder(widget.orderId);
    final history = api.fetchOrderHistory(widget.orderId);
    if (mounted) {
      setState(() {
        _orderFuture = order;
        _historyFuture = history;
      });
    } else {
      _orderFuture = order;
      _historyFuture = history;
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    _realtime.unwatchOrder(widget.orderId);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        appBar: AppBar(
            title: Text('Order #${widget.orderId.substring(0, 8)}'),
            actions: [
              PopupMenuButton<String>(
                  onSelected: (reason) async {
                    try {
                      await ref
                          .read(apiServiceProvider)
                          .cancelOrder(widget.orderId, reason);
                      ref.invalidate(ordersProvider);
                      if (context.mounted) Navigator.of(context).pop();
                    } catch (e) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Cancel failed: $e')));
                      }
                    }
                  },
                  itemBuilder: (_) => [
                        const PopupMenuItem(
                            value: 'Changed mind', child: Text('Changed mind')),
                        const PopupMenuItem(
                            value: 'Found better price',
                            child: Text('Found better price')),
                        const PopupMenuItem(
                            value: 'Other', child: Text('Other'))
                      ]),
            ]),
        body: FutureBuilder<SubOrder>(
          future: _orderFuture,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const LoadingSpinner();
            }
            if (snap.hasError) {
              return EmptyState(title: 'Error', description: '${snap.error}');
            }
            final o = snap.data!;
            return SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        StatusBadge(o.status),
                        const Spacer(),
                        Text(formatMinor(o.totalMinor, o.currency),
                            style: const TextStyle(
                                fontSize: 18, fontWeight: FontWeight.w700))
                      ]),
                      // A4-6: who this order came from, named instead of a UUID.
                      Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(
                              o.storeName == null
                                  ? 'Seller no longer available'
                                  : 'Sold by ${o.storeName}',
                              style: const TextStyle(
                                  fontSize: 13, color: TaifTokens.muted))),
                      // A2-4: an inferred currency is stated, not implied.
                      if (!o.currencyFromSnapshot)
                        const Padding(
                            padding: EdgeInsets.only(top: 2),
                            child: Text(
                                'Currency inferred from the seller — this order predates currency being recorded on it.',
                                style: TextStyle(
                                    fontSize: 11, color: TaifTokens.warn))),
                      const SizedBox(height: 16),
                      const Text('Items',
                          style: TextStyle(
                              fontWeight: FontWeight.w600, fontSize: 14)),
                      const SizedBox(height: 8),
                      ...o.items.map((item) => Card(
                          child: ListTile(
                              title: Text(item.title),
                              subtitle: Text(
                                  'Qty ${item.quantity} × ${formatMinor(item.unitPriceMinor, o.currency)}'),
                              trailing: Text(
                                  formatMinor(item.lineTotalMinor, o.currency),
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600))))),
                      const SizedBox(height: 16),
                      const Text('Financial Breakdown',
                          style: TextStyle(
                              fontWeight: FontWeight.w600, fontSize: 14)),
                      const SizedBox(height: 8),
                      _row(
                          'Subtotal', formatMinor(o.subtotalMinor, o.currency)),
                      _row('Discount',
                          '-${formatMinor(o.discountMinor, o.currency)}'),
                      _row('Delivery',
                          formatMinor(o.deliveryFeeMinor, o.currency)),
                      _row('Tax', formatMinor(o.taxMinor, o.currency)),
                      const Divider(),
                      _row('Total', formatMinor(o.totalMinor, o.currency),
                          bold: true),
                      const SizedBox(height: 16),
                      // Reorder button for completed/delivered orders
                      if (['DELIVERED', 'COMPLETED'].contains(o.status))
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            onPressed: () async {
                              try {
                                // The endpoint re-adds line by line and reports
                                // what it could not (delisted variant, price tier
                                // removed since). This call was typed
                                // `Future<void>`, so a two-of-five reorder
                                // announced itself exactly like a full one
                                // (A5-14).
                                final result = await ref
                                    .read(apiServiceProvider)
                                    .reorder(o.id);
                                ref.invalidate(cartProvider);
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(content: Text(result.summary)));
                                  context.go('/cart');
                                }
                              } catch (e) {
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                          content: Text('Reorder failed: $e')));
                                }
                              }
                            },
                            icon: const Icon(Icons.refresh),
                            label: const Text('Reorder'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: TaifTokens.brandPrimary,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                            ),
                          ),
                        ),
                      if (['DELIVERED', 'COMPLETED'].contains(o.status))
                        const SizedBox(height: 16),
                      FutureBuilder<List<StatusHistoryEntry>>(
                        future: _historyFuture,
                        builder: (context, hSnap) {
                          if (hSnap.connectionState != ConnectionState.done) {
                            return const SizedBox.shrink();
                          }
                          final history = hSnap.data ?? [];
                          if (history.isEmpty) return const SizedBox.shrink();
                          return Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Status History',
                                    style: TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 14)),
                                const SizedBox(height: 8),
                                ...history.map((h) => Padding(
                                      padding: const EdgeInsets.only(bottom: 8),
                                      child: Row(children: [
                                        Container(
                                            width: 8,
                                            height: 8,
                                            decoration: BoxDecoration(
                                                shape: BoxShape.circle,
                                                color:
                                                    _statusColor(h.toStatus))),
                                        const SizedBox(width: 8),
                                        Text(h.toStatus.replaceAll('_', ' '),
                                            style: const TextStyle(
                                                fontWeight: FontWeight.w500,
                                                fontSize: 13)),
                                        const Spacer(),
                                        Text(
                                          DateTime.tryParse(h.createdAt)
                                                  ?.toLocal()
                                                  .toString()
                                                  .substring(0, 16) ??
                                              h.createdAt,
                                          style: const TextStyle(
                                              fontSize: 11,
                                              color: TaifTokens.muted),
                                        ),
                                      ]),
                                    )),
                              ]);
                        },
                      ),
                    ]));
          },
        ));
  }

  Widget _row(String label, String value, {bool bold = false}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(children: [
        Text(label,
            style: TextStyle(
                fontSize: 13,
                color: TaifTokens.muted,
                fontWeight: bold ? FontWeight.w600 : null)),
        const Spacer(),
        Text(value,
            style: TextStyle(
                fontSize: 13, fontWeight: bold ? FontWeight.w700 : null))
      ]));
  Color _statusColor(String s) => switch (s) {
        'COMPLETED' => TaifTokens.ok,
        'CANCELLED' => TaifTokens.err,
        'REJECTED' => TaifTokens.err,
        'DELIVERED' => TaifTokens.ok,
        _ => TaifTokens.info
      };
}
