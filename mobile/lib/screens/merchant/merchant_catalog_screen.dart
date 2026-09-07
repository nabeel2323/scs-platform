import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common_widgets.dart';

/// Merchant catalog — lists the store's products with create/edit/delete.
/// Mirrors the web /merchant/catalog products tab.
class MerchantCatalogScreen extends ConsumerWidget {
  const MerchantCatalogScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final storeAsync = ref.watch(activeStoreProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Catalog'), actions: [
        IconButton(
            icon: const Icon(Icons.category),
            tooltip: 'Categories',
            onPressed: () => context.push('/merchant/categories')),
        IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(myStoresProvider)),
      ]),
      floatingActionButton: storeAsync.maybeWhen(
        data: (store) => store == null
            ? null
            : FloatingActionButton.extended(
                onPressed: () => context.push('/merchant/catalog/new'),
                icon: const Icon(Icons.add),
                label: const Text('New Product'),
                backgroundColor: TaifTokens.brandPrimary,
              ),
        orElse: () => null,
      ),
      body: storeAsync.when(
        loading: () => const LoadingSpinner(),
        error: (e, _) => EmptyState(
            title: 'Error',
            description: '$e',
            onAction: () => ref.invalidate(myStoresProvider)),
        data: (store) {
          if (store == null) {
            return const EmptyState(
                title: 'No store',
                description:
                    'Your organization has no storefront yet. Complete merchant registration first.',
                icon: Icons.storefront_outlined);
          }
          return _productList(context, ref, store.id);
        },
      ),
    );
  }

  Widget _productList(BuildContext context, WidgetRef ref, String storeId) {
    final products = ref.watch(storeProductsProvider(storeId));
    return products.when(
      loading: () => const LoadingSpinner(),
      error: (e, _) => EmptyState(
          title: 'Error',
          description: '$e',
          onAction: () => ref.invalidate(storeProductsProvider(storeId))),
      data: (list) => RefreshIndicator(
        onRefresh: () async => ref.invalidate(storeProductsProvider(storeId)),
        child: list.isEmpty
            ? ListView(children: const [
                SizedBox(height: 80),
                EmptyState(
                    title: 'No products',
                    description: 'Tap "New Product" to add your first product.',
                    icon: Icons.inventory_2_outlined)
              ])
            : ListView.builder(
                padding: const EdgeInsets.all(12),
                itemCount: list.length,
                itemBuilder: (_, i) {
                  final p = list[i];
                  return Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      leading: const CircleAvatar(
                          backgroundColor: TaifTokens.bg,
                          child: Icon(Icons.inventory_2_outlined,
                              color: TaifTokens.muted)),
                      title: Text(p.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text('MOQ ${p.moq} · ${p.status}',
                          style: const TextStyle(fontSize: 12)),
                      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                        IconButton(
                            icon: const Icon(Icons.edit_outlined,
                                color: TaifTokens.brandPrimary),
                            onPressed: () => context
                                .push('/merchant/catalog/product/${p.id}')),
                        IconButton(
                            icon: const Icon(Icons.delete_outline,
                                color: TaifTokens.err),
                            onPressed: () =>
                                _confirmDelete(context, ref, storeId, p)),
                      ]),
                      onTap: () =>
                          context.push('/merchant/catalog/product/${p.id}'),
                    ),
                  );
                },
              ),
      ),
    );
  }

  Future<void> _confirmDelete(
      BuildContext context, WidgetRef ref, String storeId, Product p) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete product'),
        content: Text('Delete "${p.title}"? This cannot be undone.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: ElevatedButton.styleFrom(backgroundColor: TaifTokens.err),
              child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(apiServiceProvider).deleteProduct(p.id);
      ref.invalidate(storeProductsProvider(storeId));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Product deleted'), backgroundColor: TaifTokens.ok));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Failed: $e')));
      }
    }
  }
}
