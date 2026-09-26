import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/common_widgets.dart';

/// Merchant order queue. Every mutation (accept / partial-accept / reject /
/// status transition) is wrapped in try/catch with a confirmation step and a
/// per-order busy flag so failures surface instead of failing silently (§27).
class MerchantOrdersScreen extends ConsumerStatefulWidget {
  const MerchantOrdersScreen({super.key});
  @override
  ConsumerState<MerchantOrdersScreen> createState() =>
      _MerchantOrdersScreenState();
}

class _MerchantOrdersScreenState extends ConsumerState<MerchantOrdersScreen> {
  /// Id of the order whose action is in flight; disables its buttons and shows
  /// a spinner so a merchant cannot double-submit.
  String? _busyOrderId;

  ApiService get _api => ref.read(apiServiceProvider);

  void _snack(String message, Color color) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message), backgroundColor: color));
  }

  /// Runs a merchant action with busy-state + error handling + refresh.
  Future<void> _run(String orderId, Future<void> Function() action,
      {String? success}) async {
    setState(() => _busyOrderId = orderId);
    try {
      await action();
      ref.invalidate(merchantOrdersProvider);
      if (success != null) _snack(success, TaifTokens.ok);
    } catch (e) {
      _snack(ApiService.errorMessage(e), TaifTokens.err);
    } finally {
      if (mounted) setState(() => _busyOrderId = null);
    }
  }

  Future<void> _accept(SubOrder o) async {
    final ok = await _confirm(
      title: 'Accept order',
      message:
          'Accept order #${o.id.substring(0, 8)} for ${formatMinor(o.totalMinor, o.currency)}? Stock will be reserved.',
      confirmLabel: 'Accept',
      confirmColor: TaifTokens.ok,
    );
    if (ok != true) return;
    await _run(o.id, () => _api.acceptOrder(o.id), success: 'Order accepted');
  }

  Future<void> _reject(SubOrder o) async {
    final reasonCtrl = TextEditingController(text: 'Rejected by merchant');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Reject order #${o.id.substring(0, 8)}'),
        content: TextField(
          controller: reasonCtrl,
          maxLines: 2,
          decoration: const InputDecoration(
              labelText: 'Reason *',
              alignLabelWithHint: true,
              border: OutlineInputBorder()),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: ElevatedButton.styleFrom(backgroundColor: TaifTokens.err),
              child: const Text('Reject')),
        ],
      ),
    );
    final reason = reasonCtrl.text.trim();
    reasonCtrl.dispose();
    if (ok != true) return;
    if (reason.isEmpty) {
      _snack('A rejection reason is required.', TaifTokens.err);
      return;
    }
    await _run(o.id, () => _api.rejectOrder(o.id, reason),
        success: 'Order rejected');
  }

  /// Partial acceptance (§27). The list endpoint ships no lines, so fetch the
  /// full order first, let the merchant confirm a quantity per line (default =
  /// ordered), then post `{itemId, qtyConfirmed}` confirmations.
  Future<void> _partialAccept(SubOrder o) async {
    setState(() => _busyOrderId = o.id);
    List<OrderItem> items;
    try {
      items = (await _api.fetchOrder(o.id)).items;
    } catch (e) {
      if (mounted) setState(() => _busyOrderId = null);
      _snack(ApiService.errorMessage(e), TaifTokens.err);
      return;
    }
    if (!mounted) return;
    setState(() => _busyOrderId = null);
    if (items.isEmpty) {
      _snack('This order has no line items to confirm.', TaifTokens.err);
      return;
    }

    final controllers = <String, TextEditingController>{
      for (final it in items)
        it.id: TextEditingController(text: '${it.qtyConfirmed ?? it.quantity}')
    };
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Partial accept #${o.id.substring(0, 8)}'),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView(
            shrinkWrap: true,
            children: [
              const Text('Confirm the quantity you can fulfil per line.',
                  style: TextStyle(color: TaifTokens.muted, fontSize: 12)),
              const SizedBox(height: 12),
              ...items.map((it) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Row(children: [
                      Expanded(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(it.title.isEmpty ? it.sku : it.title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 13)),
                              Text('Ordered ${it.quantity} · SKU ${it.sku}',
                                  style: const TextStyle(
                                      color: TaifTokens.muted, fontSize: 11)),
                            ]),
                      ),
                      const SizedBox(width: 12),
                      SizedBox(
                        width: 72,
                        child: TextField(
                          controller: controllers[it.id],
                          keyboardType: TextInputType.number,
                          textAlign: TextAlign.center,
                          decoration: const InputDecoration(
                              isDense: true, border: OutlineInputBorder()),
                        ),
                      ),
                    ]),
                  )),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: ElevatedButton.styleFrom(backgroundColor: TaifTokens.ok),
              child: const Text('Confirm')),
        ],
      ),
    );

    // Parse + clamp quantities before submitting.
    final confirmations = <Map<String, dynamic>>[];
    for (final it in items) {
      final raw = int.tryParse(controllers[it.id]!.text.trim());
      controllers[it.id]!.dispose();
      if (raw == null) continue;
      final qty = raw.clamp(0, it.quantity);
      confirmations.add({'itemId': it.id, 'qtyConfirmed': qty});
    }
    if (confirmed != true) return;
    if (confirmations.isEmpty) {
      _snack('Enter a valid quantity for at least one line.', TaifTokens.err);
      return;
    }
    await _run(o.id, () => _api.partialAccept(o.id, confirmations),
        success: 'Order partially accepted');
  }

  Future<bool?> _confirm({
    required String title,
    required String message,
    required String confirmLabel,
    Color confirmColor = TaifTokens.brandPrimary,
  }) =>
      showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(title),
          content: Text(message),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancel')),
            ElevatedButton(
                onPressed: () => Navigator.pop(ctx, true),
                style: ElevatedButton.styleFrom(backgroundColor: confirmColor),
                child: Text(confirmLabel)),
          ],
        ),
      );

  Future<void> _transition(SubOrder o, String next) async {
    await _run(o.id, () => _api.transitionStatus(o.id, next),
        success: 'Moved to ${next.replaceAll('_', ' ')}');
  }

  @override
  Widget build(BuildContext context) {
    final orders = ref.watch(merchantOrdersProvider);
    return Scaffold(
        appBar: AppBar(title: const Text('Merchant Orders'), actions: [
          IconButton(
              tooltip: 'Refresh',
              icon: const Icon(Icons.refresh),
              onPressed: () => ref.invalidate(merchantOrdersProvider)),
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
            if (list.isEmpty) {
              return const EmptyState(
                  title: 'No orders',
                  description: 'Orders from buyers will appear here',
                  icon: Icons.receipt_long_outlined);
            }
            return ListView(children: [
              if (pending.isNotEmpty) ...[
                _section('Pending (${pending.length})', TaifTokens.warn),
                ...pending.map(_pendingCard)
              ],
              if (active.isNotEmpty) ...[
                _section('Active (${active.length})', TaifTokens.info),
                ...active.map(_activeCard)
              ],
              if (done.isNotEmpty) ...[
                _section('Completed (${done.length})', TaifTokens.muted),
                ...done.map(_doneCard)
              ],
            ]);
          },
          loading: () => const LoadingSpinner(),
          error: (e, _) => EmptyState(
              title: 'Error',
              description: ApiService.errorMessage(e),
              onAction: () => ref.invalidate(merchantOrdersProvider)),
        ));
  }

  Widget _section(String title, Color color) => Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Text(title,
          style: TextStyle(
              fontWeight: FontWeight.w600, color: color, fontSize: 14)));

  Widget _pendingCard(SubOrder o) {
    final busy = _busyOrderId == o.id;
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Order #${o.id.substring(0, 8)}',
              style:
                  const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
          const SizedBox(height: 4),
          // A5-16: the list endpoint returns orders without their lines, so the
          // count comes from the server; `items.length` was always 0 here.
          Text(
              '${formatMinor(o.totalMinor, o.currency)} · ${o.itemCount} ${o.itemCount == 1 ? 'item' : 'items'}',
              style: const TextStyle(color: TaifTokens.muted, fontSize: 13)),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: ElevatedButton.icon(
                onPressed: busy ? null : () => _accept(o),
                style: ElevatedButton.styleFrom(backgroundColor: TaifTokens.ok),
                icon: _busyIcon(busy, Icons.check, Colors.white),
                label: const Text('Accept', style: TextStyle(fontSize: 12)),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: busy ? null : () => _partialAccept(o),
                style: OutlinedButton.styleFrom(
                    foregroundColor: TaifTokens.brandPrimary),
                icon: const Icon(Icons.playlist_add_check, size: 16),
                label: const Text('Partial', style: TextStyle(fontSize: 12)),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: busy ? null : () => _reject(o),
                style:
                    OutlinedButton.styleFrom(foregroundColor: TaifTokens.err),
                icon: const Icon(Icons.close, size: 16),
                label: const Text('Reject', style: TextStyle(fontSize: 12)),
              ),
            ),
          ]),
        ]),
      ),
    );
  }

  Widget _busyIcon(bool busy, IconData icon, Color color) => busy
      ? const SizedBox(
          width: 14,
          height: 14,
          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
      : Icon(icon, size: 16, color: color);

  Widget _activeCard(SubOrder o) {
    final next = _nextStatuses(o.status);
    final busy = _busyOrderId == o.id;
    return Card(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        child: ListTile(
            title: Text('Order #${o.id.substring(0, 8)}',
                style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(formatMinor(o.totalMinor, o.currency)),
            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
              StatusBadge(o.status),
              ...next.map((ns) => Padding(
                  padding: const EdgeInsets.only(left: 4),
                  child: ElevatedButton(
                      onPressed: busy ? null : () => _transition(o, ns),
                      style: ElevatedButton.styleFrom(
                          minimumSize: const Size(44, 36),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 6)),
                      child: Text(ns.replaceAll('_', ' '),
                          style: const TextStyle(fontSize: 11)))))
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
