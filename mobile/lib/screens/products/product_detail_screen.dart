import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common_widgets.dart';

class ProductDetailScreen extends ConsumerWidget {
  final String productId;
  const ProductDetailScreen({super.key, required this.productId});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
        appBar: AppBar(title: const Text('Product')),
        body: FutureBuilder<Product>(
          future: ref.read(apiServiceProvider).fetchProduct(productId),
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done)
              return const LoadingSpinner();
            if (snap.hasError)
              return EmptyState(title: 'Error', description: '${snap.error}');
            final p = snap.data!;
            return SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                          height: 180,
                          width: double.infinity,
                          decoration: BoxDecoration(
                              color: TaifTokens.bg,
                              borderRadius: BorderRadius.circular(10)),
                          child: const Center(
                              child: Icon(Icons.inventory_2,
                                  size: 64, color: TaifTokens.muted))),
                      const SizedBox(height: 16),
                      Text(p.title,
                          style: Theme.of(context)
                              .textTheme
                              .headlineSmall
                              ?.copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 8),
                      Row(children: [
                        StatusBadge(p.status),
                        const SizedBox(width: 8),
                        Text('MOQ: ${p.moq}',
                            style: TextStyle(color: TaifTokens.muted))
                      ]),
                      if (p.description != null) ...[
                        const SizedBox(height: 16),
                        Text(p.description!,
                            style: const TextStyle(fontSize: 14, height: 1.5))
                      ],
                      const SizedBox(height: 24),
                      FutureBuilder<List<ProductVariant>>(
                        future: ref
                            .read(apiServiceProvider)
                            .fetchVariants(productId),
                        builder: (context, vSnap) {
                          if (vSnap.connectionState != ConnectionState.done)
                            return const CircularProgressIndicator();
                          final variants = vSnap.data ?? [];
                          if (variants.isEmpty) return const SizedBox.shrink();
                          return Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Variants',
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleMedium
                                        ?.copyWith(
                                            fontWeight: FontWeight.w600)),
                                const SizedBox(height: 8),
                                ...variants.map((v) => Card(
                                    child: ListTile(
                                        title: Text(v.title ?? v.sku),
                                        subtitle: Text(
                                            '${v.unit} · ${v.isActive ? "Available" : "Unavailable"}'),
                                        trailing: Text(
                                            v.priceMinor != null
                                                ? formatMinor(v.priceMinor!)
                                                : '—',
                                            style: const TextStyle(
                                                fontWeight: FontWeight.w700,
                                                fontSize: 16))))),
                              ]);
                        },
                      ),
                      const SizedBox(height: 24),
                      SizedBox(
                          width: double.infinity,
                          height: 48,
                          child: ElevatedButton.icon(
                              icon: const Icon(Icons.add_shopping_cart),
                              onPressed: () async {
                                try {
                                  await ref.read(apiServiceProvider).addToCart(
                                      variantId: p.id,
                                      storeId: p.storeId,
                                      quantity: p.moq);
                                  ref.invalidate(cartProvider);
                                  if (context.mounted)
                                    ScaffoldMessenger.of(context).showSnackBar(
                                        const SnackBar(
                                            content: Text('Added to cart')));
                                } catch (e) {
                                  if (context.mounted)
                                    ScaffoldMessenger.of(context).showSnackBar(
                                        SnackBar(content: Text('Failed: $e')));
                                }
                              },
                              label: const Text('Add to Cart'))),
                    ]));
          },
        ));
  }
}
