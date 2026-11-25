import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/common_widgets.dart';

class CartScreen extends ConsumerStatefulWidget {
  const CartScreen({super.key});
  @override
  ConsumerState<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends ConsumerState<CartScreen> {
  final _promoCtrl = TextEditingController();
  bool _applyingPromo = false;
  bool _removingPromo = false;
  bool _clearing = false;
  bool _itemActionBusy = false;
  String? _busyItemId;
  int _cartMutationRevision = 0;

  bool get _cartActionsDisabled =>
      _itemActionBusy || _clearing || _applyingPromo || _removingPromo;

  @override
  void dispose() {
    _promoCtrl.dispose();
    super.dispose();
  }

  Future<void> _setQty(CartItem item, int qty) async {
    if (_cartActionsDisabled) return;
    setState(() {
      _itemActionBusy = true;
      _busyItemId = item.id;
    });
    try {
      await ref.read(apiServiceProvider).updateCartItem(item.id, qty);
      ref.invalidate(cartProvider);
    } catch (e) {
      // Rebuild the stepper from the last provider value so a failed optimistic
      // text entry cannot remain visible as if the server accepted it.
      if (mounted) setState(() => _cartMutationRevision++);
      ref.invalidate(cartProvider);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(ApiService.errorMessage(e))));
      }
    } finally {
      if (mounted) setState(() {
        _itemActionBusy = false;
        _busyItemId = null;
      });
    }
  }

  Future<void> _removeItem(CartItem item) async {
    if (_cartActionsDisabled) return;
    setState(() {
      _itemActionBusy = true;
      _busyItemId = item.id;
    });
    try {
      await ref.read(apiServiceProvider).removeCartItem(item.id);
      ref.invalidate(cartProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(ApiService.errorMessage(e))));
      }
    } finally {
      if (mounted) setState(() {
        _itemActionBusy = false;
        _busyItemId = null;
      });
    }
  }

  Future<void> _applyPromo() async {
    final code = _promoCtrl.text.trim();
    if (code.isEmpty || _cartActionsDisabled) return;
    setState(() => _applyingPromo = true);
    try {
      await ref.read(apiServiceProvider).applyPromo(code);
      ref.invalidate(cartProvider);
      _promoCtrl.clear();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Promo code applied')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(ApiService.errorMessage(e))));
      }
    } finally {
      if (mounted) setState(() => _applyingPromo = false);
    }
  }

  Future<void> _removePromo() async {
    if (_cartActionsDisabled) return;
    setState(() => _removingPromo = true);
    try {
      await ref.read(apiServiceProvider).removePromo();
      ref.invalidate(cartProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Promo code removed')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(ApiService.errorMessage(e))),
        );
      }
    } finally {
      if (mounted) setState(() => _removingPromo = false);
    }
  }

  /// MOQ floor for a line: the seller's minimum order quantity when the offer
  /// carries one, else 1. [QuantityStepper] refuses to go below it (audit 4.3
  /// row 151: "Use QuantityStepper + MOQ floor" — the raw ± buttons let a buyer
  /// decrement under the MOQ, which checkout would then reject).
  int _floorFor(CartItem item) {
    final moq = item.offer?.moq ?? item.moq;
    return moq > 1 ? moq : 1;
  }

  int _stepFor(CartItem item) {
    final increment = item.offer?.orderIncrement ?? 1;
    return increment > 0 ? increment : 1;
  }

  Widget _cartReadStatus(AsyncValue<Cart> cart) {
    if (cart.isRefreshing) {
      return const Padding(
        padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(children: [
          SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
          SizedBox(width: 8),
          Text('Refreshing cart… showing the last successful cart.',
              style: TextStyle(fontSize: 12, color: TaifTokens.muted)),
        ]),
      );
    }
    if (cart.hasError) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: TaifTokens.err.withValues(alpha: 0.06),
            border: Border.all(color: TaifTokens.err.withValues(alpha: 0.3)),
            borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
          ),
          child: Row(children: [
            Expanded(
              child: Text(
                'Could not refresh cart: ${ApiService.errorMessage(cart.error!)}. Showing the last successfully loaded cart.',
                style: const TextStyle(fontSize: 12, color: TaifTokens.err),
              ),
            ),
            TextButton(
              onPressed: () => ref.invalidate(cartProvider),
              child: const Text('Retry'),
            ),
          ]),
        ),
      );
    }
    return const SizedBox.shrink();
  }

  Widget _cartLine(CartItem item) {
    final floor = _floorFor(item);
    final actionsDisabled = _cartActionsDisabled;
    final itemBusy = _busyItemId == item.id;
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title ?? item.sku ?? item.variantId.substring(0, 8),
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 14),
                    ),
                    const SizedBox(height: 2),
                    // PHASE 14: seller + offer attribution per line.
                    Text(
                      '${formatMinor(item.priceMinor, item.currency)} each'
                      '${item.offer != null ? '  ·  Offer ${item.offer!.status.toLowerCase()}' : ''}'
                      '${item.offer?.leadTimeDays != null ? '  ·  Lead ${item.offer!.leadTimeDays}d' : ''}'
                      '${floor > 1 ? '  ·  MOQ $floor' : ''}'
                      '${item.offer?.orderIncrement != null ? '  ·  Step ${_stepFor(item)}' : ''}',
                      style: const TextStyle(
                          fontSize: 12, color: TaifTokens.muted),
                    ),
                  ]),
            ),
            IconButton(
              tooltip: 'Remove ${item.title ?? item.sku ?? 'item'}',
              onPressed: actionsDisabled ? null : () => _removeItem(item),
              icon: itemBusy
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.delete_outline, size: 20, color: TaifTokens.err),
            ),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            QuantityStepper(
              key: ValueKey('cart-qty-${item.id}-$_cartMutationRevision'),
              enabled: !actionsDisabled,
              value: item.quantity,
              minQty: floor,
              step: _stepFor(item),
              onChanged: (q) => _setQty(item, q),
            ),
            const Spacer(),
            Text(formatMinor(item.lineTotalMinor, item.currency),
                style:
                    const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            const SizedBox(width: 8),
          ]),
        ]),
      ),
    );
  }

  /// Promo code input and applied-promotion removal (finding G-019).
  Widget _promoSection(Cart c) {
    final actionsDisabled = _cartActionsDisabled;
    final applied = c.promoCode != null && c.promoCode!.isNotEmpty;
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: applied
            ? Row(children: [
                const Icon(Icons.local_offer_outlined,
                    size: 18, color: TaifTokens.ok),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('Promo "${c.promoCode}" applied',
                      style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: TaifTokens.ok)),
                ),
                TextButton(
                  onPressed: actionsDisabled ? null : _removePromo,
                  child: _removingPromo
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Remove'),
                ),
              ])
            : Row(children: [
                Expanded(
                  child: TextField(
                    controller: _promoCtrl,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(
                      labelText: 'Promo code',
                      isDense: true,
                      prefixIcon: Icon(Icons.local_offer_outlined, size: 18),
                      border: OutlineInputBorder(),
                    ),
                    enabled: !actionsDisabled,
                    onSubmitted: (_) => _applyPromo(),
                  ),
                ),
                const SizedBox(width: 8),
                TextButton(
                  onPressed: actionsDisabled ? null : _applyPromo,
                  child: _applyingPromo
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Apply'),
                ),
              ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cart = ref.watch(cartProvider);
    // PHASE 11/12: trigger validation on screen load (non-blocking).
    final validation = ref.watch(cartValidationProvider);
    return Scaffold(
        appBar: AppBar(title: const Text('Cart'), actions: [
          IconButton(
            tooltip: 'Refresh cart',
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(cartProvider),
          ),
          TextButton(
              onPressed: _cartActionsDisabled
                  ? null
                  : () async {
                      setState(() => _clearing = true);
                      try {
                        await ref.read(apiServiceProvider).clearCart();
                        ref.invalidate(cartProvider);
                      } catch (e) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                              content: Text(
                                  'Clear failed: ${ApiService.errorMessage(e)}')));
                        }
                      } finally {
                        if (mounted) setState(() => _clearing = false);
                      }
                    },
              child: Text(_clearing ? 'Clearing...' : 'Clear',
                  style: const TextStyle(color: TaifTokens.err))),
        ]),
        body: cart.when(
          skipLoadingOnRefresh: true,
          skipError: true,
          data: (c) {
            if (c.items.isEmpty) {
              return Column(children: [
                if (cart.isRefreshing || cart.hasError) _cartReadStatus(cart),
                Expanded(
                  child: EmptyState(
                    title: 'Cart is empty',
                    description: 'Browse products and add items to your cart',
                    icon: Icons.shopping_cart_outlined,
                    onAction: () => context.go('/search'),
                    actionLabel: 'Browse Products',
                  ),
                ),
              ]);
            }
            final grouped = <String, List<CartItem>>{};
            for (final item in c.items) {
              (grouped[item.storeId] ??= []).add(item);
            }
            // A5-3: mirror the web cart — name a currency for the total only when
            // every line agrees (a mixed cart has no single payable total).
            // §9 policy: show per-supplier subtotals when currencies are mixed.
            final currencies = c.items
                .map((item) => item.currency)
                .whereType<String>()
                .toSet();
            final cartCurrency =
                currencies.length == 1 ? currencies.first : null;
            final isMixedCurrency = currencies.length > 1;
            return Column(children: [
              if (cart.isRefreshing || cart.hasError) _cartReadStatus(cart),
              // PHASE 11/12: show stale/repriced banner
              if (validation.hasValue &&
                  (validation.value!['stale'] as List?)?.isNotEmpty == true)
                Container(
                  width: double.infinity,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  color: const Color(0xFFFFF2F2),
                  child: Text(
                    '${(validation.value!['stale'] as List).length} item(s) are no longer available. Please remove them.',
                    style:
                        const TextStyle(fontSize: 13, color: Color(0xFF991B1B)),
                  ),
                ),
              if (validation.hasValue &&
                  (validation.value!['repriced'] as List?)?.isNotEmpty == true)
                Container(
                  width: double.infinity,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  color: const Color(0xFFFFFBEB),
                  child: Text(
                    '${(validation.value!['repriced'] as List).length} item(s) were re-priced due to seller changes.',
                    style:
                        const TextStyle(fontSize: 13, color: Color(0xFF92400E)),
                  ),
                ),
              Expanded(
                  child: ListView(
                      children: grouped.entries
                          .map<Widget>((e) => Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Padding(
                                        padding: const EdgeInsets.fromLTRB(
                                            16, 16, 16, 8),
                                        child: Text(
                                            e.value.first.storeName ??
                                                'Store ${e.key.substring(0, 8)}',
                                            style: const TextStyle(
                                                fontWeight: FontWeight.w600,
                                                fontSize: 14,
                                                color:
                                                    TaifTokens.brandPrimary))),
                                    ...e.value.map((item) => _cartLine(item)),
                                  ]))
                          .toList()
                        ..add(_promoSection(c)))),
              Container(
                  padding: const EdgeInsets.all(16),
                  decoration: const BoxDecoration(
                      color: Colors.white,
                      border: Border(top: BorderSide(color: TaifTokens.line))),
                  child: SafeArea(
                      child: Row(children: [
                    Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: isMixedCurrency
                              ? [
                                  // §9 policy: per-supplier subtotals when currencies
                                  // are mixed — a single total would be an amount
                                  // nobody can actually pay.
                                  for (final entry in grouped.entries)
                                    Padding(
                                      padding: const EdgeInsets.symmetric(
                                          vertical: 2),
                                      child: Row(
                                        mainAxisAlignment:
                                            MainAxisAlignment.spaceBetween,
                                        children: [
                                          Expanded(
                                            child: Text(
                                              entry.value.first.storeName ??
                                                  'Store ${entry.key.substring(0, 8)}',
                                              style: const TextStyle(
                                                  fontSize: 12,
                                                  fontWeight: FontWeight.w600),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                          Text(
                                            formatMinor(
                                              entry.value.fold<int>(
                                                  0,
                                                  (sum, item) =>
                                                      sum +
                                                      item.lineTotalMinor),
                                              entry.value.first.currency,
                                            ),
                                            style: const TextStyle(
                                                fontSize: 12,
                                                fontWeight: FontWeight.w600),
                                          ),
                                        ],
                                      ),
                                    ),
                                  const Text(
                                    'Separate invoices per supplier',
                                    style: TextStyle(
                                        fontSize: 10, color: TaifTokens.muted),
                                  ),
                                ]
                              : [
                                  const Text('Total',
                                      style: TextStyle(
                                          fontSize: 12,
                                          color: TaifTokens.muted)),
                                  Text(formatMinor(c.totalMinor, cartCurrency),
                                      style: const TextStyle(
                                          fontSize: 20,
                                          fontWeight: FontWeight.w700))
                                ]),
                    ),
                    const SizedBox(width: 12),
                    ElevatedButton(
                        onPressed: () => context.push('/checkout'),
                        style: ElevatedButton.styleFrom(
                            minimumSize: const Size(140, 48)),
                        child: const Text('Checkout')),
                  ]))),
            ]);
          },
          loading: () => const LoadingSpinner(),
          error: (e, _) => EmptyState(
              title: 'Error',
              description: ApiService.errorMessage(e),
              onAction: () => ref.invalidate(cartProvider)),
        ));
  }
}
