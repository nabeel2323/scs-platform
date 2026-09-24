import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common_widgets.dart';

class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
    // PHASE 11/12: trigger validation on screen load (non-blocking).
    final validation = ref.watch(cartValidationProvider);
    return Scaffold(
        appBar: AppBar(title: const Text('Cart'), actions: [
          TextButton(
              onPressed: () async {
                await ref.read(apiServiceProvider).clearCart();
                ref.invalidate(cartProvider);
              },
              child:
                  const Text('Clear', style: TextStyle(color: TaifTokens.err))),
        ]),
        body: cart.when(
          data: (c) {
            if (c.items.isEmpty) {
              return EmptyState(
                  title: 'Cart is empty',
                  description: 'Browse products and add items to your cart',
                  icon: Icons.shopping_cart_outlined,
                  onAction: () => context.go('/search'),
                  actionLabel: 'Browse Products');
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
                          .map((e) => Column(
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
                                    ...e.value.map((item) => Card(
                                        margin: const EdgeInsets.symmetric(
                                            horizontal: 16, vertical: 4),
                                        child: ListTile(
                                            title: Text(item.title ??
                                                item.sku ??
                                                item.variantId.substring(0, 8)),
                                            // PHASE 14: seller + offer attribution per line
                                            subtitle: Text(
                                                '${item.quantity} × ${formatMinor(item.priceMinor, item.currency)}'
                                                '${item.offer != null ? '  ·  Offer ${item.offer!.status.toLowerCase()}' : ''}'
                                                '${item.offer?.leadTimeDays != null ? '  ·  Lead ${item.offer!.leadTimeDays}d' : ''}'
                                                '${(item.offer?.moq ?? 0) > 1 ? '  ·  MOQ ${item.offer!.moq}' : ''}'),
                                            trailing: Row(
                                                mainAxisSize: MainAxisSize.min,
                                                children: [
                                                  IconButton(
                                                      icon: const Icon(
                                                          Icons
                                                              .remove_circle_outline,
                                                          size: 20),
                                                      onPressed: () async {
                                                        await ref
                                                            .read(
                                                                apiServiceProvider)
                                                            .updateCartItem(
                                                                item.id,
                                                                item.quantity -
                                                                    1);
                                                        ref.invalidate(
                                                            cartProvider);
                                                      }),
                                                  Text('${item.quantity}',
                                                      style: const TextStyle(
                                                          fontWeight:
                                                              FontWeight.w600)),
                                                  IconButton(
                                                      icon: const Icon(
                                                          Icons
                                                              .add_circle_outline,
                                                          size: 20),
                                                      onPressed: () async {
                                                        await ref
                                                            .read(
                                                                apiServiceProvider)
                                                            .updateCartItem(
                                                                item.id,
                                                                item.quantity +
                                                                    1);
                                                        ref.invalidate(
                                                            cartProvider);
                                                      }),
                                                  IconButton(
                                                      icon: const Icon(
                                                          Icons.delete_outline,
                                                          size: 20,
                                                          color:
                                                              TaifTokens.err),
                                                      onPressed: () async {
                                                        await ref
                                                            .read(
                                                                apiServiceProvider)
                                                            .removeCartItem(
                                                                item.id);
                                                        ref.invalidate(
                                                            cartProvider);
                                                      }),
                                                ])))),
                                  ]))
                          .toList())),
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
              description: '$e',
              onAction: () => ref.invalidate(cartProvider)),
        ));
  }
}
