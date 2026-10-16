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
  Future<TrackingInfo>? _trackingFuture;
  StreamSubscription<OrderStatusEvent>? _sub;
  bool _busy = false;

  /// M7.3-A: statuses where the buyer can confirm delivery.
  static const _confirmableDelivery = {'DELIVERED'};

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

  /// M7.3-A: buyer confirms delivery → DELIVERED → COMPLETED.
  Future<void> _confirmDelivery(SubOrder o) async {
    setState(() => _busy = true);
    try {
      await ref.read(apiServiceProvider).confirmDelivery(o.id);
      ref.invalidate(ordersProvider);
      _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Delivery confirmed — order completed')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('Confirm failed: ${ApiService.errorMessage(e)}')));
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
    // M7.1: load tracking once the order arrives (we need masterOrderId).
    _orderFuture.then((o) {
      if (!mounted) return;
      setState(() {
        _trackingFuture = api.fetchTracking(o.masterOrderId);
      });
    }).catchError((_) {});
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
                      // M7.3-A: completed order banner
                      if (o.status == 'COMPLETED') ...[
                        const SizedBox(height: 12),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 10),
                          decoration: BoxDecoration(
                            color: TaifTokens.ok.withOpacity(0.08),
                            borderRadius:
                                BorderRadius.circular(TaifTokens.radiusMd),
                            border: Border.all(
                                color: TaifTokens.ok.withOpacity(0.3)),
                          ),
                          child: Row(children: [
                            const Icon(Icons.check_circle,
                                size: 18, color: TaifTokens.ok),
                            const SizedBox(width: 8),
                            const Expanded(
                              child: Text(
                                'Order completed — delivery confirmed',
                                style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: TaifTokens.ok),
                              ),
                            ),
                          ]),
                        ),
                      ],
                      // M7.3-A: confirm delivery prompt when DELIVERED
                      if (_confirmableDelivery.contains(o.status)) ...[
                        const SizedBox(height: 12),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: TaifTokens.warn.withOpacity(0.06),
                            borderRadius:
                                BorderRadius.circular(TaifTokens.radiusMd),
                            border: Border.all(
                                color: TaifTokens.warn.withOpacity(0.3)),
                          ),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Received your order?',
                                    style: TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w600,
                                        color: TaifTokens.ink)),
                                const SizedBox(height: 4),
                                const Text(
                                  'Confirm delivery to complete this order. If you don\'t confirm, it will auto-complete after the dispute window.',
                                  style: TextStyle(
                                      fontSize: 12, color: TaifTokens.muted),
                                ),
                                const SizedBox(height: 10),
                                SizedBox(
                                  width: double.infinity,
                                  child: ElevatedButton.icon(
                                    onPressed: _busy
                                        ? null
                                        : () => _confirmDelivery(o),
                                    icon: _busy
                                        ? const SizedBox(
                                            width: 16,
                                            height: 16,
                                            child: CircularProgressIndicator(
                                                strokeWidth: 2,
                                                color: Colors.white))
                                        : const Icon(Icons.check, size: 18),
                                    label: Text(_busy
                                        ? 'Confirming...'
                                        : 'Confirm Delivery'),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: TaifTokens.ok,
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(
                                          vertical: 10),
                                    ),
                                  ),
                                ),
                              ]),
                        ),
                        const SizedBox(height: 12),
                      ],
                      const SizedBox(height: 16),
                      const Text('Items',
                          style: TextStyle(
                              fontWeight: FontWeight.w600, fontSize: 14)),
                      const SizedBox(height: 8),
                      ...o.items.map((item) => Card(
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(item.title,
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w600,
                                          fontSize: 14)),
                                  const SizedBox(height: 2),
                                  Text(
                                      'SKU: ${item.sku.isNotEmpty ? item.sku : 'N/A'} · Qty: ${item.quantity}${item.qtyConfirmed != null ? ' (Confirmed: ${item.qtyConfirmed})' : ''}',
                                      style: const TextStyle(
                                          fontSize: 12,
                                          color: TaifTokens.muted)),
                                  const SizedBox(height: 4),
                                  Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(
                                          '${formatMinor(item.unitPriceMinor, o.currency)} × ${item.quantity}',
                                          style: const TextStyle(
                                              fontSize: 12,
                                              color: TaifTokens.muted)),
                                      Text(
                                          formatMinor(
                                              item.lineTotalMinor, o.currency),
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w600,
                                              fontSize: 14)),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          )),
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
                      // M7.1: Shipment tracking for this sub-order.
                      if (_trackingFuture != null)
                        FutureBuilder<TrackingInfo>(
                          future: _trackingFuture,
                          builder: (context, tSnap) {
                            if (tSnap.connectionState != ConnectionState.done) {
                              return const SizedBox.shrink();
                            }
                            final tracking = tSnap.data;
                            if (tracking == null)
                              return const SizedBox.shrink();
                            // Find the shipment for THIS sub-order.
                            final shipment = tracking.shipments
                                .where((s) => s.orderId == widget.orderId)
                                .firstOrNull;
                            if (shipment == null || shipment.events.isEmpty) {
                              return const SizedBox.shrink();
                            }
                            return _shipmentTracking(shipment);
                          },
                        ),
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

  /// M7.1: Shipment tracking timeline for a single sub-order's shipment.
  /// Shows each fulfillment event as a dot + label, newest-last.
  Widget _shipmentTracking(TrackingShipment shipment) {
    final events = [...shipment.events]
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.local_shipping, size: 16, color: TaifTokens.info),
          const SizedBox(width: 6),
          const Text('Shipment Tracking',
              style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
          const Spacer(),
          StatusBadge(shipment.status),
        ]),
        const SizedBox(height: 12),
        for (var i = 0; i < events.length; i++)
          _trackingEventNode(events[i], isCurrent: i == events.length - 1),
      ]),
    );
  }

  Widget _trackingEventNode(TrackingEvent evt, {required bool isCurrent}) {
    final color = isCurrent ? TaifTokens.brandPrimary : TaifTokens.info;
    final when = DateTime.tryParse(evt.createdAt)?.toLocal();
    final stamp =
        when == null ? evt.createdAt : when.toString().substring(0, 16);
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SizedBox(
          width: 24,
          child: Column(children: [
            Container(
              width: 12,
              height: 12,
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
            padding: EdgeInsets.only(bottom: isCurrent ? 0 : 14),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(evt.eventType.replaceAll('_', ' '),
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
              if (evt.notes != null && evt.notes!.isNotEmpty)
                Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(evt.notes!,
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
