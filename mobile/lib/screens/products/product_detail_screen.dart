import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common_widgets.dart';

class ProductDetailScreen extends ConsumerWidget {
  final String productId;
  const ProductDetailScreen({super.key, required this.productId});

  /// Add one variant (or the product's default) and explain any rejection.
  Future<void> _add(BuildContext context, WidgetRef ref, Product p,
      {String? variantId}) async {
    try {
      await ref
          .read(apiServiceProvider)
          .addProductToCart(p, variantId: variantId);
      ref.invalidate(cartProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Added to cart')));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
        appBar: AppBar(title: const Text('Product')),
        body: FutureBuilder<Product>(
          future: ref.read(apiServiceProvider).fetchProduct(productId),
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const LoadingSpinner();
            }
            if (snap.hasError) {
              return EmptyState(title: 'Error', description: '${snap.error}');
            }
            final p = snap.data!;
            final currency = p.store?.currency ?? 'SAR';
            // Cheapest orderable variant at the product's own MOQ — the number a
            // listing card quotes for the same product, so the two pages cannot
            // disagree about what a buyer will pay.
            int? bestPrice;
            for (final v in p.variants) {
              final price = v.priceMinor;
              if (!v.isActive || price == null) continue;
              if (bestPrice == null || price < bestPrice) bestPrice = price;
            }
            final priced = bestPrice != null;
            return SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                          height: 180,
                          width: double.infinity,
                          clipBehavior: Clip.antiAlias,
                          decoration: BoxDecoration(
                              color: TaifTokens.bg,
                              borderRadius: BorderRadius.circular(10)),
                          child: p.imageUrl == null
                              ? const Center(
                                  child: Icon(Icons.inventory_2,
                                      size: 64, color: TaifTokens.muted))
                              : Image.network(p.imageUrl!,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => const Center(
                                      child: Icon(Icons.inventory_2,
                                          size: 64, color: TaifTokens.muted)))),
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
                            style: const TextStyle(color: TaifTokens.muted))
                      ]),
                      const SizedBox(height: 8),
                      Text(
                        priced
                            ? 'from ${formatMinor(bestPrice, currency)}'
                            : 'Price on request',
                        style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            color: priced ? TaifTokens.ok : TaifTokens.muted),
                      ),
                      // A5-1 on mobile: the detail response carries the seller,
                      // and a buyer deciding between two listings of the same
                      // SKU needs to know who is shipping it.
                      if (p.store != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: GestureDetector(
                            onTap: () => context.push('/stores/${p.store!.id}'),
                            child: Row(
                              children: [
                                const Text('Sold by ',
                                    style: TextStyle(
                                        fontSize: 13, color: TaifTokens.muted)),
                                Flexible(
                                  child: Text(p.store!.name,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w600)),
                                ),
                                if (p.store!.isVerified)
                                  const Padding(
                                    padding: EdgeInsets.only(left: 6),
                                    child: Icon(Icons.verified,
                                        size: 15, color: TaifTokens.ok),
                                  ),
                                const Icon(Icons.chevron_right,
                                    size: 16, color: TaifTokens.muted),
                              ],
                            ),
                          ),
                        ),
                      if (p.description != null) ...[
                        const SizedBox(height: 16),
                        Text(p.description!,
                            style: const TextStyle(fontSize: 14, height: 1.5))
                      ],
                      const SizedBox(height: 24),
                      // The detail response embeds variants with their effective
                      // tier price (A5-1). This refetched them from
                      // /products/:id/variants instead, whose rows carry no price
                      // at all — so every variant printed "—" and the seller's
                      // pricing never reached the screen.
                      if (p.variants.isNotEmpty) ...[
                        Text('Variants',
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(fontWeight: FontWeight.w600)),
                        const SizedBox(height: 8),
                        ...p.variants.map((v) => Card(
                            child: ListTile(
                                title: Text(v.title ?? v.sku),
                                subtitle: Text(
                                    '${v.unit} · ${v.isActive ? "Available" : "Unavailable"}'),
                                trailing: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                          v.priceMinor != null
                                              ? formatMinor(
                                                  v.priceMinor!, currency)
                                              : '—',
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w700,
                                              fontSize: 16)),
                                      if (v.isActive)
                                        IconButton(
                                            tooltip: 'Add ${v.title ?? v.sku}',
                                            onPressed: () => _add(
                                                context, ref, p,
                                                variantId: v.id),
                                            icon: const Icon(
                                                Icons.add_shopping_cart,
                                                size: 20)),
                                    ])))),
                        const SizedBox(height: 16),
                      ],
                      const SizedBox(height: 8),
                      SizedBox(
                          width: double.infinity,
                          height: 48,
                          child: ElevatedButton.icon(
                              icon: const Icon(Icons.add_shopping_cart),
                              // addProductToCart resolves which variant to buy.
                              // This posted the *product* id into
                              // cart_items.variant_id, whose foreign key points at
                              // product_variants, so the server rejected every
                              // press and the error text was the raw 400 (A5-12).
                              onPressed: () => _add(context, ref, p),
                              label: const Text('Add to Cart'))),
                    ]));
          },
        ));
  }
}
