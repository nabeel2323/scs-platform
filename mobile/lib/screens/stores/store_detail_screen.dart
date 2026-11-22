import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/common_widgets.dart';

Future<void> _refreshStoreProducts(WidgetRef ref, String storeId) async {
  try {
    await ref.refresh(buyerStoreProductsProvider(storeId).future);
  } catch (_) {
    // Keep the previous successful catalogue visible; the provider carries
    // the refresh error for the stale-data notice and Retry action.
  }
}

class StoreDetailScreen extends ConsumerWidget {
  final String storeId;
  const StoreDetailScreen({super.key, required this.storeId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final products = ref.watch(buyerStoreProductsProvider(storeId));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Store'),
        actions: [
          IconButton(
            tooltip: 'Refresh store products',
            icon: const Icon(Icons.refresh),
            onPressed: () =>
                ref.invalidate(buyerStoreProductsProvider(storeId)),
          ),
        ],
      ),
      body: products.when(
        skipLoadingOnRefresh: true,
        skipError: true,
        data: (items) => Column(
          children: [
            if (products.isRefreshing || products.hasError)
              _refreshNotice(
                products.isRefreshing
                    ? 'Refreshing products… showing the last successfully loaded catalogue.'
                    : 'Could not refresh products: ${ApiService.errorMessage(products.error!)}. Showing the last successfully loaded catalogue.',
                () => ref.invalidate(buyerStoreProductsProvider(storeId)),
              ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () => _refreshStoreProducts(ref, storeId),
                child: items.isEmpty
                    ? ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.all(16),
                        children: const [
                          SizedBox(
                            height: 320,
                            child: EmptyState(
                              title: 'No products',
                              description: 'This store has no active products yet',
                            ),
                          ),
                        ],
                      )
                    : GridView.builder(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.all(16),
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          mainAxisSpacing: 8,
                          crossAxisSpacing: 8,
                          // Price and seller joined the card; at the default
                          // 1.0 its content overflowed the tile.
                          childAspectRatio: 0.62,
                        ),
                        itemCount: items.length,
                        itemBuilder: (_, i) {
                          final product = items[i];
                          return ProductCard(
                            product: product,
                            // The seller is the page itself — repeating it on
                            // every card would only cost layout height.
                            showStore: false,
                            onTap: () =>
                                context.push('/products/${product.id}'),
                            onAddToCart: () async {
                              try {
                                await ref
                                    .read(apiServiceProvider)
                                    .addProductToCart(product);
                                ref.invalidate(cartProvider);
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('Added to cart'),
                                      duration: Duration(seconds: 1),
                                    ),
                                  );
                                }
                              } catch (e) {
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content:
                                          Text(ApiService.errorMessage(e)),
                                    ),
                                  );
                                }
                              }
                            },
                          );
                        },
                      ),
              ),
            ),
          ],
        ),
        loading: () => const LoadingSpinner(),
        error: (e, _) => EmptyState(
          title: 'Error',
          description: ApiService.errorMessage(e),
          onAction: () =>
              ref.invalidate(buyerStoreProductsProvider(storeId)),
        ),
      ),
    );
  }
}

Widget _refreshNotice(String message, VoidCallback onRetry) => Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: TaifTokens.err.withValues(alpha: 0.06),
        border: Border.all(color: TaifTokens.err.withValues(alpha: 0.3)),
        borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              message,
              style: const TextStyle(fontSize: 12, color: TaifTokens.err),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
