import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
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
  bool _busy = false;

  /// Statuses the API permits a buyer to cancel from (orders.service.ts
  /// `cancelOrder`); anything else throws a 409, so the action is hidden rather
  /// than offered. Audit 4.3 row 162: the old AppBar popup showed cancel for
  /// every status and fired on a single tap with no confirmation.
  static const _cancellable = {
    'SUBMITTED',
    'PENDING_CONFIRMATION',
    'ACCEPTED',
    'PARTIALLY_ACCEPTED',
    'PREPARING',
    'READY',
    'PAYMENT_PENDING',
  };

  Future<void> _confirmCancel(SubOrder o) async {
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('Cancel this order?'),
        contentPadding: const EdgeInsets.fromLTRB(24, 12, 24, 16),
        children: [
          const Text('The supplier will be notified. This cannot be undone.',
              style: TextStyle(fontSize: 13, color: TaifTokens.muted)),
          const SizedBox(height: 12),
          ...['Changed mind', 'Found better price', 'Order by mistake', 'Other']
              .map((r) => SimpleDialogOption(
                    onPressed: () => Navigator.of(ctx).pop(r),
                    child: Text(r),
                  )),
          SimpleDialogOption(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Keep order',
                style: TextStyle(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
    if (reason == null || !mounted) return; // dismissed or "Keep order"
    setState(() => _busy = true);
    try {
      await ref.read(apiServiceProvider).cancelOrder(o.id, reason);
      ref.invalidate(ordersProvider);
      _load(); // refresh this order's status + history in place
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Order cancelled')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('Cancel failed: ${ApiService.errorMessage(e)}')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// §25: a vertical timeline of what ACTUALLY happened, oldest → newest. Only
  /// real history entries are rendered, so no future step is ever marked done.
  /// Sorted explicitly because the API's row order is not guaranteed.
  Widget _timeline(List<StatusHistoryEntry> history) {
    final ordered = [...history]
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('Status Timeline',
          style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
      const SizedBox(height: 12),
      for (var i = 0; i < ordered.length; i++)
        _timelineNode(ordered[i], isCurrent: i == ordered.length - 1),
    ]);
  }

  Widget _timelineNode(StatusHistoryEntry h, {required bool isCurrent}) {
    final color =
        isCurrent ? TaifTokens.brandPrimary : _statusColor(h.toStatus);
    final when = DateTime.tryParse(h.createdAt)?.toLocal();
    final stamp = when == null ? h.createdAt : when.toString().substring(0, 16);
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        // Rail: dot + connector (connector omitted on the newest node).
        SizedBox(
          width: 24,
          child: Column(children: [
            Container(
              width: 14,
              height: 14,
              decoration: BoxDecoration(shape: BoxShape.circle, color: color),
            ),
            if (!isCurrent)
              Expanded(
                child: Container(
                  width: 2,
                  margin: const EdgeInsets.symmetric(vertical: 2),
                  color: TaifTokens.line,
                ),
              ),
          ]),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Padding(
            padding: EdgeInsets.only(bottom: isCurrent ? 0 : 18),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(h.toStatus.replaceAll('_', ' '),
                  style: TextStyle(
                      fontWeight: isCurrent ? FontWeight.w700 : FontWeight.w500,
                      fontSize: 13,
                      color: isCurrent
                          ? TaifTokens.brandPrimary
                          : TaifTokens.ink)),
              const SizedBox(height: 2),
              Text(stamp,
                  style:
                      const TextStyle(fontSize: 11, color: TaifTokens.muted)),
              if (h.reason != null && h.reason!.isNotEmpty)
                Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(h.reason!,
                        style: const TextStyle(
                            fontSize: 11,
                            color: TaifTokens.muted,
                            fontStyle: FontStyle.italic))),
            ]),
          ),
        ),
      ]),
    );
  }

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
        appBar: AppBar(title: Text('Order #${widget.orderId.substring(0, 8)}')),
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
                      // §4.3 row 162: buyer cancel, guarded to the statuses the
                      // API allows and behind a confirm dialog.
                      if (_cancellable.contains(o.status)) ...[
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed: _busy ? null : () => _confirmCancel(o),
                            icon: const Icon(Icons.cancel_outlined, size: 18),
                            label: const Text('Cancel order'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: TaifTokens.err,
                              side: const BorderSide(color: TaifTokens.err),
                              padding: const EdgeInsets.symmetric(vertical: 12),
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],
                      // Reorder button for completed/delivered orders
                      if (['DELIVERED', 'COMPLETED'].contains(o.status))
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            onPressed: _busy
                                ? null
                                : () async {
                                    setState(() => _busy = true);
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
                                        ScaffoldMessenger.of(context)
                                            .showSnackBar(SnackBar(
                                                content: Text(result.summary)));
                                        context.go('/cart');
                                      }
                                    } catch (e) {
                                      if (context.mounted) {
                                        ScaffoldMessenger.of(context)
                                            .showSnackBar(SnackBar(
                                                content: Text(
                                                    'Reorder failed: ${ApiService.errorMessage(e)}')));
                                      }
                                    } finally {
                                      if (mounted) {
                                        setState(() => _busy = false);
                                      }
                                    }
                                  },
                            icon: _busy
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2, color: Colors.white))
                                : const Icon(Icons.refresh),
                            label: Text(_busy ? 'Reordering...' : 'Reorder'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: TaifTokens.brandPrimary,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                            ),
                          ),
                        ),
                      // §33: context-driven review/dispute — deep links carry
                      // the real order + store, so the buyer never types a UUID.
                      if (['DELIVERED', 'COMPLETED'].contains(o.status))
                        Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Row(children: [
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: () => context.push(
                                    '/reviews?orderId=${o.id}&storeId=${o.storeId}'),
                                icon: const Icon(Icons.star_border, size: 18),
                                label: const Text('Write Review'),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: TaifTokens.brandPrimary,
                                  side:
                                      const BorderSide(color: TaifTokens.line),
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 12),
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: () => context.push(
                                    '/reviews?orderId=${o.id}&storeId=${o.storeId}&tab=dispute'),
                                icon:
                                    const Icon(Icons.report_problem, size: 18),
                                label: const Text('Open Dispute'),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: TaifTokens.err,
                                  side:
                                      const BorderSide(color: TaifTokens.line),
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 12),
                                ),
                              ),
                            ),
                          ]),
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
                          return _timeline(history);
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
