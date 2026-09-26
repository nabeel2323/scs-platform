import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/common_widgets.dart';

/// §33: Context-driven reviews & disputes.
///
/// The buyer never types a raw UUID. Either the screen is opened with an
/// [orderId] (deep link from an order — see `order_detail_screen.dart`), or it
/// loads the buyer's real orders and lets them pick one. The review subject is
/// derived from the chosen order's store; a dispute attaches to the chosen
/// order. Reviews/disputes are only meaningful once an order exists.
class ReviewsDisputesScreen extends ConsumerStatefulWidget {
  /// Optional deep-link context. When supplied, that order is preselected.
  final String? orderId;
  final String? storeId;

  /// 0 = Write Review, 1 = Open Dispute.
  final int initialTab;

  const ReviewsDisputesScreen({
    super.key,
    this.orderId,
    this.storeId,
    this.initialTab = 0,
  });

  @override
  ConsumerState<ReviewsDisputesScreen> createState() =>
      _ReviewsDisputesScreenState();
}

class _ReviewsDisputesScreenState extends ConsumerState<ReviewsDisputesScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl = TabController(
      length: 2, vsync: this, initialIndex: widget.initialTab.clamp(0, 1));
  final _commentCtrl = TextEditingController();
  final _disputeReasonCtrl = TextEditingController();
  final _disputeDescCtrl = TextEditingController();
  int _rating = 5;
  bool _submitting = false;
  String? _msg;
  bool _msgIsError = false;

  // ── Order context (replaces raw UUID entry) ──
  List<SubOrder> _orders = [];
  SubOrder? _selectedOrder;
  bool _ordersLoading = true;
  String? _ordersError;

  @override
  void initState() {
    super.initState();
    _loadOrders();
  }

  Future<void> _loadOrders() async {
    setState(() {
      _ordersLoading = true;
      _ordersError = null;
    });
    try {
      final orders = await ref.read(apiServiceProvider).fetchOrders();
      if (!mounted) return;
      setState(() {
        _orders = orders;
        _ordersLoading = false;
        // Honour a deep-linked order when it is one of the buyer's own.
        if (widget.orderId != null) {
          final match = orders.where((o) => o.id == widget.orderId).toList();
          if (match.isNotEmpty) _selectedOrder = match.first;
        }
        _selectedOrder ??= orders.isNotEmpty ? orders.first : null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _ordersLoading = false;
        _ordersError = ApiService.errorMessage(e);
      });
    }
  }

  Future<void> _submitReview() async {
    final order = _selectedOrder;
    if (order == null) {
      _show('Select an order to review', true);
      return;
    }
    setState(() {
      _submitting = true;
      _msg = null;
    });
    try {
      final comment = _commentCtrl.text.trim();
      await ref.read(apiServiceProvider).createReview(
            order.id,
            subjectId: order.storeId,
            subjectType: 'STORE',
            rating: _rating,
            comment: comment.isEmpty ? null : comment,
          );
      _show('Review submitted — thank you!', false);
      _commentCtrl.clear();
      _rating = 5;
    } catch (e) {
      _show(ApiService.errorMessage(e), true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _submitDispute() async {
    final order = _selectedOrder;
    if (order == null) {
      _show('Select an order to dispute', true);
      return;
    }
    final reason = _disputeReasonCtrl.text.trim();
    final description = _disputeDescCtrl.text.trim();
    if (reason.isEmpty || description.isEmpty) {
      _show('A reason and a description are required', true);
      return;
    }
    setState(() {
      _submitting = true;
      _msg = null;
    });
    try {
      await ref
          .read(apiServiceProvider)
          .createDispute(order.id, reason: reason, description: description);
      _show('Dispute opened — our team will review it', false);
      _disputeReasonCtrl.clear();
      _disputeDescCtrl.clear();
    } catch (e) {
      _show(ApiService.errorMessage(e), true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _show(String msg, bool isError) {
    if (!mounted) return;
    setState(() {
      _msg = msg;
      _msgIsError = isError;
    });
  }

  @override
  void dispose() {
    _commentCtrl.dispose();
    _disputeReasonCtrl.dispose();
    _disputeDescCtrl.dispose();
    _tabCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        appBar: AppBar(
            title: const Text('Reviews & Disputes'),
            bottom: TabBar(controller: _tabCtrl, tabs: const [
              Tab(text: 'Write Review'),
              Tab(text: 'Open Dispute')
            ])),
        body: TabBarView(controller: _tabCtrl, children: [
          // ── Write Review ──
          SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(children: [
                if (_msg != null) _messageBanner(),
                _orderContext(),
                if (_selectedOrder != null) ...[
                  const SizedBox(height: 12),
                  _storeContext(),
                ],
                const SizedBox(height: 16),
                const Align(
                    alignment: Alignment.centerLeft,
                    child: Text('Rating',
                        style: TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 13))),
                Row(
                    children: [1, 2, 3, 4, 5]
                        .map((n) => GestureDetector(
                            onTap: () => setState(() => _rating = n),
                            child: Icon(Icons.star,
                                size: 32,
                                color: n <= _rating
                                    ? Colors.amber
                                    : TaifTokens.line)))
                        .toList()),
                const SizedBox(height: 12),
                _field('Comment (optional)', _commentCtrl, maxLines: 3),
                const SizedBox(height: 16),
                SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                        onPressed: (_submitting || _selectedOrder == null)
                            ? null
                            : _submitReview,
                        child: Text(
                            _submitting ? 'Submitting...' : 'Submit Review'))),
              ])),
          // ── Open Dispute ──
          SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(children: [
                if (_msg != null) _messageBanner(),
                _orderContext(),
                const SizedBox(height: 12),
                _field('Reason *', _disputeReasonCtrl),
                _field('Description *', _disputeDescCtrl, maxLines: 4),
                const SizedBox(height: 16),
                SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                        onPressed: (_submitting || _selectedOrder == null)
                            ? null
                            : _submitDispute,
                        style: ElevatedButton.styleFrom(
                            backgroundColor: TaifTokens.err,
                            foregroundColor: Colors.white),
                        child:
                            Text(_submitting ? 'Opening...' : 'Open Dispute'))),
              ])),
        ]));
  }

  // ── Order picker: loading / error / empty / dropdown ──
  Widget _orderContext() {
    if (_ordersLoading) {
      return const Padding(
          padding: EdgeInsets.symmetric(vertical: 24), child: LoadingSpinner());
    }
    if (_ordersError != null) {
      return ErrorBanner(message: _ordersError!, onRetry: _loadOrders);
    }
    if (_orders.isEmpty) {
      return const EmptyState(
          title: 'No orders yet',
          description:
              'You can review a supplier or open a dispute once you have placed an order.');
    }
    final selectedId = _selectedOrder?.id;
    final valueInList = _orders.any((o) => o.id == selectedId);
    return DropdownButtonFormField<String>(
      initialValue: valueInList ? selectedId : null,
      isExpanded: true,
      decoration: InputDecoration(
          labelText: 'Order',
          hintText: 'Select an order',
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8))),
      items: _orders
          .map((o) => DropdownMenuItem(
              value: o.id,
              child: Text(_orderLabel(o), overflow: TextOverflow.ellipsis)))
          .toList(),
      onChanged: (id) {
        if (id == null) return;
        final match = _orders.where((o) => o.id == id).toList();
        setState(() {
          _selectedOrder = match.isNotEmpty ? match.first : null;
          _msg = null;
        });
      },
    );
  }

  /// Read-only "who you are reviewing" context derived from the order.
  Widget _storeContext() {
    final store = _selectedOrder!.storeName;
    return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
            color: TaifTokens.bg,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: TaifTokens.line)),
        child: Row(children: [
          const Icon(Icons.storefront, size: 18, color: TaifTokens.muted),
          const SizedBox(width: 8),
          Expanded(
              child: Text(
                  store == null
                      ? 'Reviewing this order\'s supplier'
                      : 'Reviewing supplier: $store',
                  style: const TextStyle(fontSize: 13)))
        ]));
  }

  Widget _messageBanner() {
    final isError = _msgIsError;
    final color = isError ? TaifTokens.err : TaifTokens.ok;
    return Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
            color: color.withAlpha(20),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: color)),
        child: Row(children: [
          Icon(isError ? Icons.error_outline : Icons.check_circle_outline,
              size: 18, color: color),
          const SizedBox(width: 8),
          Expanded(
              child: Text(_msg!, style: TextStyle(fontSize: 13, color: color)))
        ]));
  }

  String _orderLabel(SubOrder o) {
    final store = o.storeName ?? 'Order ${o.id.substring(0, 6)}';
    final date =
        o.createdAt.length >= 10 ? o.createdAt.substring(0, 10) : o.createdAt;
    final total = formatMinor(o.totalMinor, o.currency);
    return '$store · $date · ${o.status} · $total';
  }

  Widget _field(String label, TextEditingController ctrl, {int maxLines = 1}) =>
      Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: TextField(
              controller: ctrl,
              decoration: InputDecoration(
                  labelText: label,
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8))),
              maxLines: maxLines));
}
