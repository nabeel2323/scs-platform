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
            if (c.items.isEmpty)
              return EmptyState(
                  title: 'Cart is empty',
                  description: 'Browse products and add items to your cart',
                  icon: Icons.shopping_cart_outlined,
                  onAction: () => context.go('/search'),
                  actionLabel: 'Browse Products');
            final grouped = <String, List<CartItem>>{};
            for (final item in c.items) {
              (grouped[item.storeId] ??= []).add(item);
            }
            return Column(children: [
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
                                            subtitle: Text(
                                                '${item.quantity} × ${formatMinor(item.priceMinor)}'),
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
                  decoration: BoxDecoration(
                      color: Colors.white,
                      border: Border(top: BorderSide(color: TaifTokens.line))),
                  child: SafeArea(
                      child: Row(children: [
                    Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Total',
                              style: TextStyle(
                                  fontSize: 12, color: TaifTokens.muted)),
                          Text(formatMinor(c.totalMinor),
                              style: const TextStyle(
                                  fontSize: 20, fontWeight: FontWeight.w700))
                        ]),
                    const Spacer(),
                    ElevatedButton(
                        onPressed: () => context.push('/checkout'),
                        style: ElevatedButton.styleFrom(
                            minimumSize: const Size(160, 48)),
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
