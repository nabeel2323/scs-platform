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

  bool _returnLoading = false;
  bool _returnBusy = false;
  bool _showReturnForm = false;
  String _returnLoadError = '';
  String _returnError = '';
  String _returnReason = '';
  String _returnDescription = '';
  String _returnTrackingNumber = '';
  List<ReturnRequest> _returnRequests = [];
  final Map<String, int> _returnQuantities = {};

  static const _returnReasons = <String, String>{
    'PRODUCT_NOT_AS_DESCRIBED': 'Item defective, damaged or not as described',
    'CUSTOMER_REQUEST': 'No longer needed',
    'OTHER': 'Other',
  };

  static const _activeReturnStatuses = {
    'REQUESTED', 'MERCHANT_APPROVED', 'BUYER_SHIPPED', 'RECEIVED',
    'INSPECTED', 'REFUND_PENDING', 'REFUND_FAILED', 'ESCALATED',
  };

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
    if (ref.read(profileProvider).valueOrNull?.hasPermission('orders:cancel') != true) return;
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
    if (ref.read(profileProvider).valueOrNull?.hasPermission('orders:write') != true) return;
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


  Future<void> _loadReturns() async {
    if (mounted) {
      setState(() { _returnLoading = true; _returnLoadError = ''; });
    }
    try {
      final returns = await ref.read(apiServiceProvider).fetchMyReturns();
      if (!mounted) return;
      setState(() {
        _returnRequests = returns.where((item) => item.subOrderId == widget.orderId).toList();
        _returnLoading = false;
        _returnLoadError = '';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _returnLoading = false;
        _returnLoadError = ApiService.errorMessage(e);
      });
    }
  }

  Future<void> _submitReturn(SubOrder order) async {
    if (_returnBusy || ref.read(profileProvider).valueOrNull?.id != order.buyerId) return;
    if (!_returnReasons.containsKey(_returnReason)) {
      setState(() => _returnError = 'Please select a return reason.');
      return;
    }
    final lines = order.items
        .where((item) => (_returnQuantities[item.id] ?? 0) > 0)
        .map((item) => {
              'orderItemId': item.id,
              'quantity': _returnQuantities[item.id]!,
            }).toList();
    if (lines.isEmpty) {
      setState(() => _returnError = 'Select at least one item to return.');
      return;
    }

    setState(() { _returnBusy = true; _returnError = ''; });
    try {
      final created = await ref.read(apiServiceProvider).createReturn(
        subOrderId: order.id,
        reason: _returnReason,
        description: _returnDescription.trim().isEmpty ? null : _returnDescription.trim(),
        lines: lines,
      );
      if (!mounted) return;
      setState(() {
        _returnRequests = [created, ..._returnRequests.where((item) => item.id != created.id)];
        _showReturnForm = false;
        _returnReason = '';
        _returnDescription = '';
        _returnQuantities.clear();
        _returnError = '';
      });
      await _loadReturns();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Return request submitted')),
        );
      }
    } catch (e) {
      // A timeout can happen after commit; reconcile with the caller-scoped list
      // instead of blindly repeating a non-idempotent create request.
      try {
        final latest = await ref.read(apiServiceProvider).fetchMyReturns();
        final existing = latest.where((item) =>
          item.subOrderId == order.id && _activeReturnStatuses.contains(item.status)).toList();
        if (existing.isNotEmpty && mounted) {
          setState(() {
            _returnRequests = latest.where((item) => item.subOrderId == widget.orderId).toList();
            _showReturnForm = false;
            _returnError = '';
          });
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('A return request is already recorded for this order'),
          ));
          return;
        }
      } catch (_) {
        // Keep the original create error if reconciliation also fails.
      }
      if (mounted) setState(() => _returnError = ApiService.errorMessage(e));
    } finally {
      if (mounted) setState(() => _returnBusy = false);
    }
  }

  Future<void> _cancelReturn(ReturnRequest request) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel return request?'),
        content: const Text('The return request will be cancelled.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Keep request')),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Cancel return')),
        ],
      ),
    );
    if (confirmed != true || !mounted || _returnBusy) return;
    setState(() { _returnBusy = true; _returnError = ''; });
    try {
      final updated = await ref.read(apiServiceProvider).cancelReturn(request.id);
      if (!mounted) return;
      setState(() {
        _returnRequests = _returnRequests.map((item) => item.id == updated.id ? updated : item).toList();
      });
      await _loadReturns();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Return request cancelled')),
      );
    } catch (e) {
      if (mounted) setState(() => _returnError = ApiService.errorMessage(e));
    } finally {
      if (mounted) setState(() => _returnBusy = false);
    }
  }

  Future<void> _markReturnShipped(ReturnRequest request) async {
    if (_returnBusy) return;
    setState(() { _returnBusy = true; _returnError = ''; });
    try {
      final updated = await ref.read(apiServiceProvider).markReturnShipped(
        request.id,
        trackingNumber: _returnTrackingNumber.trim().isEmpty ? null : _returnTrackingNumber.trim(),
      );
      if (!mounted) return;
      setState(() {
        _returnTrackingNumber = '';
        _returnRequests = _returnRequests.map((item) => item.id == updated.id ? updated : item).toList();
      });
      await _loadReturns();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Return handover recorded')),
      );
    } catch (e) {
      if (mounted) setState(() => _returnError = ApiService.errorMessage(e));
    } finally {
      if (mounted) setState(() => _returnBusy = false);
    }
  }

  Widget _buyerReturnSection(SubOrder order) {
    if (!['DELIVERED', 'COMPLETED'].contains(order.status)) return const SizedBox.shrink();
    if (_returnLoading) {
      return const Padding(
        padding: EdgeInsets.only(bottom: 16),
        child: Row(children: [
          SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
          SizedBox(width: 10),
          Text('Loading return requests…', style: TextStyle(fontSize: 12, color: TaifTokens.muted)),
        ]),
      );
    }
    if (_returnLoadError.isNotEmpty) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(_returnLoadError, style: const TextStyle(color: TaifTokens.err, fontSize: 12)),
          TextButton.icon(
            onPressed: _returnBusy ? null : _loadReturns,
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Retry return requests'),
          ),
        ]),
      );
    }

    final requests = [..._returnRequests]..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    ReturnRequest? active;
    for (final request in requests) {
      if (_activeReturnStatuses.contains(request.status)) { active = request; break; }
    }

    if (active != null) {
      final canCancel = ['REQUESTED', 'MERCHANT_APPROVED'].contains(active.status);
      final canShip = active.status == 'MERCHANT_APPROVED';
      return Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          border: Border.all(color: TaifTokens.line),
          borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Return request', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text('Status: ${active.status.replaceAll('_', ' ')}',
              style: const TextStyle(fontSize: 13, color: TaifTokens.brandPrimary)),
          Text('Reason: ${_returnReasons[active.reason] ?? active.reason}',
              style: const TextStyle(fontSize: 12, color: TaifTokens.muted)),
          if (active.shippingTrackingNumber != null && active.shippingTrackingNumber!.isNotEmpty)
            Text('Tracking: ${active.shippingTrackingNumber}',
                style: const TextStyle(fontSize: 12, color: TaifTokens.muted)),
          if (_returnError.isNotEmpty)
            Padding(padding: const EdgeInsets.only(top: 8),
              child: Text(_returnError, style: const TextStyle(color: TaifTokens.err, fontSize: 12))),
          if (canShip) ...[
            const SizedBox(height: 8),
            TextFormField(
              initialValue: _returnTrackingNumber,
              decoration: const InputDecoration(
                labelText: 'Return tracking number (optional)',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              onChanged: (value) => _returnTrackingNumber = value,
            ),
          ],
          if (canCancel || canShip) ...[
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              if (canCancel)
                OutlinedButton(
                  onPressed: _returnBusy ? null : () => _cancelReturn(active!),
                  child: const Text('Cancel return'),
                ),
              if (canShip)
                FilledButton(
                  onPressed: _returnBusy ? null : () => _markReturnShipped(active!),
                  child: Text(_returnBusy ? 'Saving…' : 'Mark return shipped'),
                ),
            ]),
          ],
        ]),
      );
    }

    final latest = requests.isEmpty ? null : requests.first;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: TaifTokens.line),
        borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Returns', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
        if (latest != null) ...[
          const SizedBox(height: 4),
          Text('Previous request: ${latest.status.replaceAll('_', ' ')}',
              style: const TextStyle(fontSize: 12, color: TaifTokens.muted)),
        ],
        if (_showReturnForm) ...[
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            value: _returnReason.isEmpty ? null : _returnReason,
            decoration: const InputDecoration(labelText: 'Reason', border: OutlineInputBorder(), isDense: true),
            items: _returnReasons.entries.map((entry) => DropdownMenuItem<String>(
              value: entry.key, child: Text(entry.value),
            )).toList(),
            onChanged: _returnBusy ? null : (value) => setState(() => _returnReason = value ?? ''),
          ),
          const SizedBox(height: 10),
          const Text('Quantity per item', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          for (final item in order.items)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(children: [
                Expanded(child: Text(
                  '${item.title.isEmpty ? item.sku : item.title} (max ${item.quantity})',
                  style: const TextStyle(fontSize: 12),
                )),
                SizedBox(
                  width: 76,
                  child: TextFormField(
                    key: ValueKey('return-quantity-${item.id}'),
                    initialValue: (_returnQuantities[item.id] ?? 0).toString(),
                    keyboardType: TextInputType.number,
                    textAlign: TextAlign.center,
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(), isDense: true,
                      contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                    ),
                    onChanged: (text) {
                      final parsed = int.tryParse(text) ?? 0;
                      setState(() => _returnQuantities[item.id] = parsed.clamp(0, item.quantity).toInt());
                    },
                  ),
                ),
              ]),
            ),
          const SizedBox(height: 8),
          TextFormField(
            initialValue: _returnDescription,
            maxLines: 2,
            decoration: const InputDecoration(labelText: 'Description (optional)', border: OutlineInputBorder(), isDense: true),
            onChanged: (value) => _returnDescription = value,
          ),
          if (_returnError.isNotEmpty)
            Padding(padding: const EdgeInsets.only(top: 8),
              child: Text(_returnError, style: const TextStyle(fontSize: 12, color: TaifTokens.err))),
          const SizedBox(height: 8),
          Wrap(spacing: 8, children: [
            FilledButton(
              onPressed: _returnBusy ? null : () => _submitReturn(order),
              child: Text(_returnBusy ? 'Submitting…' : 'Submit return'),
            ),
            TextButton(
              onPressed: _returnBusy ? null : () => setState(() { _showReturnForm = false; _returnError = ''; }),
              child: const Text('Back'),
            ),
          ]),
        ] else
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              onPressed: _returnBusy ? null : () => setState(() { _showReturnForm = true; _returnError = ''; }),
              icon: const Icon(Icons.assignment_return_outlined, size: 18),
              label: const Text('Request a return'),
            ),
          ),
      ]),
    );
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
    unawaited(_loadReturns());
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
    final profile = ref.watch(profileProvider).valueOrNull;
    final permissions = profile?.perms ?? const <String>[];
    final canWrite = permissions.contains('orders:write');
    final canCancel = permissions.contains('orders:cancel');
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
                      if (_confirmableDelivery.contains(o.status) && canWrite) ...[
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
                      if (profile?.id == o.buyerId) _buyerReturnSection(o),
                      // §4.3 row 162: buyer cancel, guarded to the statuses the
                      // API allows and behind a confirm dialog.
                      if (_cancellable.contains(o.status) && canCancel) ...[
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
                      if (['DELIVERED', 'COMPLETED'].contains(o.status) && canWrite)
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
