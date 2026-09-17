import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common_widgets.dart';

class StoreDetailScreen extends ConsumerWidget {
  final String storeId;
  const StoreDetailScreen({super.key, required this.storeId});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
        appBar: AppBar(title: const Text('Store')),
        body: FutureBuilder<List<Product>>(
          // ACTIVE only: this endpoint also serves a merchant's own catalog, so
          // it does not filter by itself, and a buyer screen listing a store
          // must not show its draft or rejected products (A5-10).
          future: ref
              .read(apiServiceProvider)
              .fetchStoreProducts(storeId, status: 'ACTIVE'),
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const LoadingSpinner();
            }
            if (snap.hasError) {
              return EmptyState(title: 'Error', description: '${snap.error}');
            }
            final items = snap.data ?? [];
            return items.isEmpty
                ? const EmptyState(
                    title: 'No products',
                    description: 'This store has no products yet')
                : GridView.builder(
                    padding: const EdgeInsets.all(16),
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 2,
                            mainAxisSpacing: 8,
                            crossAxisSpacing: 8,
                            // Price and seller joined the card; at the default
                            // 1.0 its content overflowed the tile.
                            childAspectRatio: 0.62),
                    itemCount: items.length,
                    itemBuilder: (_, i) {
                      final p = items[i];
                      return ProductCard(
                          product: p,
                          // The seller is the page itself — repeating it on
                          // every card would only cost layout height.
                          showStore: false,
                          onTap: () => context.push('/products/${p.id}'),
                          onAddToCart: () async {
                            try {
                              await ref
                                  .read(apiServiceProvider)
                                  .addProductToCart(p);
                              ref.invalidate(cartProvider);
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                        content: Text('Added to cart'),
                                        duration: Duration(seconds: 1)));
                              }
                            } catch (e) {
                              // Was `catch (_) {}`: an item that could not be
                              // added gave no feedback at all, so the button
                              // looked dead.
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(content: Text('$e')));
                              }
                            }
                          });
                    });
          },
        ));
  }
}
