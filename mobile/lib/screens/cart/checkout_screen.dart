import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:uuid/uuid.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/common_widgets.dart';

/// §22 checkout: Address → Fulfillment → Review → Confirmation.
///
/// The old screen was a single form that placed the order the moment the buyer
/// tapped a button, with no chance to see the per-supplier split they were
/// committing to. This walks the buyer through the three inputs and shows a
/// Review of exactly what will be created (one sub-order per supplier) before
/// the irreversible call.
class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});
  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  // §22: no fabricated placeholder values — the buyer must enter a real
  // delivery address. Empty defaults keep the fields honest.
  final _addressCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  String _fulfillment = 'PLATFORM_DELIVERY';
  int _step = 0; // 0 Address · 1 Fulfillment · 2 Review
  bool _submitting = false;
  String? _error;

  /// Set when the buyer reaches Review, i.e. once the request is finalized.
  /// Reused across retries of that same request so a network timeout cannot
  /// create a duplicate order; a fresh key is minted if they go back and edit
  /// (a different logical request), which is what avoids a false 409.
  String? _idempotencyKey;

  /// Non-null once checkout succeeds; switches the body to the Confirmation.
  MasterOrder? _placed;

  @override
  void dispose() {
    _addressCtrl.dispose();
    _cityCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  void _goToFulfillment() {
    if (_addressCtrl.text.trim().isEmpty || _cityCtrl.text.trim().isEmpty) {
      setState(
          () => _error = 'Please enter a delivery street address and city.');
      return;
    }
    setState(() {
      _error = null;
      _step = 1;
    });
  }

  void _goToReview() {
    setState(() {
      _error = null;
      _idempotencyKey = const Uuid().v4();
      _step = 2;
    });
  }

  void _back() => setState(() {
        _error = null;
        if (_step > 0) _step -= 1;
      });

  Future<void> _checkout() async {
    final key = _idempotencyKey;
    if (key == null) return; // defensive: Review always mints one
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final result = await ref.read(apiServiceProvider).checkout(
        deliveryAddress: {
          'street': _addressCtrl.text.trim(),
          'city': _cityCtrl.text.trim(),
        },
        notes: _notesCtrl.text.isEmpty ? null : _notesCtrl.text,
        idempotencyKey: key,
        fulfillmentMethod: _fulfillment,
      );
      ref.invalidate(cartProvider);
      ref.invalidate(ordersProvider);
      if (mounted) {
        setState(() {
          _placed = result;
          _submitting = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = ApiService.errorMessage(e);
          _submitting = false;
        });
      }
    }
  }

  String _fulfillmentLabel(String m) => switch (m) {
        'PLATFORM_DELIVERY' => 'Platform delivery',
        'MERCHANT_DELIVERY' => 'Merchant delivery',
        'PICKUP' => 'Store pickup',
        _ => m.replaceAll('_', ' '),
      };

  @override
  Widget build(BuildContext context) {
    final placed = _placed;
    if (placed != null) return _confirmation(placed);
    final isReview = _step == 2;
    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: Column(children: [
        _progressHeader(),
        if (_error != null) ErrorBanner(message: _error!),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: switch (_step) {
              0 => _addressStep(),
              1 => _fulfillmentStep(),
              _ => _reviewStep(),
            },
          ),
        ),
      ]),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.all(16),
        decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: TaifTokens.line))),
        child: SafeArea(
          child: Row(children: [
            if (_step > 0) ...[
              Expanded(
                child: OutlinedButton(
                  onPressed: _submitting ? null : _back,
                  child: const Text('Back'),
                ),
              ),
              const SizedBox(width: 12),
            ],
            Expanded(
              flex: _step > 0 ? 2 : 1,
              child: ElevatedButton(
                onPressed: _submitting
                    ? null
                    : switch (_step) {
                        0 => _goToFulfillment,
                        1 => _goToReview,
                        _ => _checkout,
                      },
                child: _submitting && isReview
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(switch (_step) {
                        0 => 'Continue',
                        1 => 'Review order',
                        _ => 'Place order',
                      }),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  // ── Step header ───────────────────────────────────────────
  Widget _progressHeader() {
    const labels = ['Address', 'Delivery', 'Review'];
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < labels.length; i++) ...[
            if (i > 0)
              Expanded(
                child: Container(
                  height: 2,
                  margin: const EdgeInsets.only(top: 13, left: 6, right: 6),
                  color: i <= _step ? TaifTokens.brandPrimary : TaifTokens.line,
                ),
              ),
            Column(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color:
                      i <= _step ? TaifTokens.brandPrimary : TaifTokens.surface,
                  border: Border.all(
                      color: i <= _step
                          ? TaifTokens.brandPrimary
                          : TaifTokens.line),
                ),
                child: i < _step
                    ? const Icon(Icons.check, size: 16, color: Colors.white)
                    : Text('${i + 1}',
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color:
                                i <= _step ? Colors.white : TaifTokens.muted)),
              ),
              const SizedBox(height: 4),
              Text(labels[i],
                  style: TextStyle(
                      fontSize: 10,
                      fontWeight:
                          i == _step ? FontWeight.w600 : FontWeight.w400,
                      color: i <= _step
                          ? TaifTokens.brandPrimary
                          : TaifTokens.muted)),
            ]),
          ],
        ],
      ),
    );
  }

  // ── Step 0: Address ───────────────────────────────────────
  Widget _addressStep() => Column(children: [
        TextField(
            controller: _addressCtrl,
            decoration: const InputDecoration(
                labelText: 'Delivery Address',
                prefixIcon: Icon(Icons.location_on)),
            enabled: !_submitting),
        const SizedBox(height: 12),
        TextField(
            controller: _cityCtrl,
            decoration: const InputDecoration(
                labelText: 'City', prefixIcon: Icon(Icons.location_city)),
            enabled: !_submitting),
        const SizedBox(height: 12),
        TextField(
            controller: _notesCtrl,
            decoration: const InputDecoration(labelText: 'Notes (optional)'),
            maxLines: 2,
            enabled: !_submitting),
      ]);

  // ── Step 1: Fulfillment ───────────────────────────────────
  Widget _fulfillmentStep() =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Fulfillment Method',
            style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        RadioGroup<String>(
          groupValue: _fulfillment,
          onChanged: (v) {
            if (!_submitting && v != null) {
              setState(() => _fulfillment = v);
            }
          },
          child: Column(children: [
            ...['PLATFORM_DELIVERY', 'MERCHANT_DELIVERY', 'PICKUP'].map((m) =>
                RadioListTile<String>(
                    title: Text(_fulfillmentLabel(m)), value: m)),
          ]),
        ),
      ]);

  // ── Step 2: Review ────────────────────────────────────────
  Widget _reviewStep() {
    final cart = ref.watch(cartProvider);
    return cart.when(
      data: (c) {
        if (c.items.isEmpty) {
          return const EmptyState(
              title: 'Your cart is empty',
              description: 'Add items before checking out.',
              icon: Icons.shopping_cart_outlined);
        }
        final grouped = <String, List<CartItem>>{};
        for (final item in c.items) {
          (grouped[item.storeId] ??= []).add(item);
        }
        // A5-3 / §9: a mixed-currency cart has no single payable total, so name
        // a grand total only when every line agrees on the currency.
        final currencies =
            c.items.map((i) => i.currency).whereType<String>().toSet();
        final single = currencies.length == 1 ? currencies.first : null;
        final mixed = currencies.length > 1;
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _sectionTitle('Deliver to'),
          _summaryTile(
              Icons.location_on_outlined,
              '${_addressCtrl.text.trim()}, ${_cityCtrl.text.trim()}',
              _notesCtrl.text.trim().isEmpty
                  ? null
                  : 'Notes: ${_notesCtrl.text.trim()}'),
          const SizedBox(height: 16),
          _sectionTitle('Fulfillment'),
          _summaryTile(Icons.local_shipping_outlined,
              _fulfillmentLabel(_fulfillment), null),
          const SizedBox(height: 16),
          _sectionTitle('Items by supplier'),
          ...grouped.entries.map((e) => _merchantBlock(e.value)),
          const SizedBox(height: 8),
          // BG-2: delivery/tax are zero at checkout (pilot waiver) and invoiced
          // per supplier on delivery — never fabricate a quote the API did not
          // return.
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
                color: TaifTokens.bg,
                borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
                border: Border.all(color: TaifTokens.line)),
            child: const Row(children: [
              Icon(Icons.info_outline, size: 16, color: TaifTokens.muted),
              SizedBox(width: 8),
              Expanded(
                  child: Text(
                'Delivery & tax are calculated and invoiced by each supplier on delivery.',
                style: TextStyle(fontSize: 12, color: TaifTokens.muted),
              )),
            ]),
          ),
          const SizedBox(height: 16),
          if (mixed)
            const Text('Separate invoices per supplier',
                style: TextStyle(fontWeight: FontWeight.w700))
          else
            _totalRow('Total', formatMinor(c.totalMinor, single)),
          if (c.promoCode != null && c.promoCode!.isNotEmpty)
            Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('Promo "${c.promoCode}" applied',
                    style:
                        const TextStyle(fontSize: 12, color: TaifTokens.ok))),
        ]);
      },
      loading: () => const LoadingSpinner(),
      error: (e, _) => EmptyState(
          title: 'Could not load your cart',
          description: ApiService.errorMessage(e),
          onAction: () => ref.invalidate(cartProvider)),
    );
  }

  Widget _merchantBlock(List<CartItem> items) {
    final name = items.first.storeName ?? 'Supplier';
    final subtotal = items.fold<int>(0, (s, i) => s + i.lineTotalMinor);
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.storefront_outlined,
                size: 16, color: TaifTokens.brandPrimary),
            const SizedBox(width: 6),
            Expanded(
                child: Text(name,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                        color: TaifTokens.brandPrimary),
                    overflow: TextOverflow.ellipsis)),
            Text(formatMinor(subtotal, items.first.currency),
                style: const TextStyle(fontWeight: FontWeight.w700)),
          ]),
          const SizedBox(height: 6),
          ...items.map((i) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(children: [
                  Expanded(
                      child: Text(
                          '${i.quantity} × ${i.title ?? i.sku ?? i.variantId.substring(0, 8)}',
                          style: const TextStyle(
                              fontSize: 12, color: TaifTokens.muted),
                          overflow: TextOverflow.ellipsis)),
                  Text(formatMinor(i.lineTotalMinor, i.currency),
                      style: const TextStyle(fontSize: 12)),
                ]),
              )),
        ]),
      ),
    );
  }

  Widget _sectionTitle(String t) => Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(t,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)));

  Widget _summaryTile(IconData icon, String title, String? subtitle) =>
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
            border: Border.all(color: TaifTokens.line)),
        child: Row(children: [
          Icon(icon, size: 18, color: TaifTokens.muted),
          const SizedBox(width: 10),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title,
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w600)),
              if (subtitle != null)
                Text(subtitle,
                    style:
                        const TextStyle(fontSize: 12, color: TaifTokens.muted)),
            ]),
          ),
        ]),
      );

  Widget _totalRow(String label, String value) => Row(children: [
        Text(label,
            style: const TextStyle(fontSize: 14, color: TaifTokens.muted)),
        const Spacer(),
        Text(value,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
      ]);

  // ── Confirmation ──────────────────────────────────────────
  Widget _confirmation(MasterOrder m) => Scaffold(
        appBar: AppBar(
            title: const Text('Order placed'),
            automaticallyImplyLeading: false),
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Icon(Icons.check_circle, size: 72, color: TaifTokens.ok),
            const SizedBox(height: 16),
            const Text('Thank you — your order is confirmed',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            Center(child: StatusBadge(m.status)),
            const SizedBox(height: 6),
            Text('Order #${m.id.substring(0, 8)}',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 13, color: TaifTokens.muted)),
            const SizedBox(height: 20),
            // getMasterOrder returns the sub-orders with their lines, so show
            // the real per-supplier split that was just created.
            if (m.subOrders.isNotEmpty) ...[
              const Text('Your suppliers',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              const SizedBox(height: 8),
              ...m.subOrders.map((s) => Card(
                      child: ListTile(
                    leading: const Icon(Icons.storefront_outlined),
                    title: Text(s.storeName ?? 'Supplier',
                        style: const TextStyle(fontSize: 14)),
                    subtitle: Text(
                        '${s.itemCount} ${s.itemCount == 1 ? 'item' : 'items'} · ${formatMinor(s.totalMinor, s.currency)}'),
                    trailing: StatusBadge(s.status),
                  ))),
              const SizedBox(height: 8),
              const Text(
                'Each supplier fulfills and invoices their own order. Track them individually in Orders.',
                style: TextStyle(fontSize: 12, color: TaifTokens.muted),
              ),
            ],
            const SizedBox(height: 24),
            ElevatedButton(
                onPressed: () => context.go('/orders'),
                style: ElevatedButton.styleFrom(
                    minimumSize: const Size.fromHeight(48)),
                child: const Text('View My Orders')),
            const SizedBox(height: 8),
            OutlinedButton(
                onPressed: () => context.go('/home'),
                style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(48)),
                child: const Text('Continue Shopping')),
          ]),
        ),
      );
}
