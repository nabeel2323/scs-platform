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
        appBar: AppBar(title: Text('Store')),
        body: FutureBuilder<List<Product>>(
          future: ref.read(apiServiceProvider).fetchStoreProducts(storeId),
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done)
              return const LoadingSpinner();
            if (snap.hasError)
              return EmptyState(title: 'Error', description: '${snap.error}');
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
                            crossAxisSpacing: 8),
                    itemCount: items.length,
                    itemBuilder: (_, i) {
                      final p = items[i];
                      return ProductCard(
                          product: p,
                          onTap: () => context.push('/products/${p.id}'),
                          onAddToCart: () async {
                            try {
                              await ref.read(apiServiceProvider).addToCart(
                                  variantId: p.id,
                                  storeId: p.storeId,
                                  quantity: p.moq);
                              ref.invalidate(cartProvider);
                              if (context.mounted)
                                ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                        content: Text('Added to cart'),
                                        duration: Duration(seconds: 1)));
                            } catch (_) {}
                          });
                    });
          },
        ));
  }
}
