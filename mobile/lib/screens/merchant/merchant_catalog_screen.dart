import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common_widgets.dart';

/// PHASE COS-15: Enhanced merchant catalog with search, status filter,
/// image thumbnails, price display, and variant counts.
class MerchantCatalogScreen extends ConsumerStatefulWidget {
  const MerchantCatalogScreen({super.key});
  @override
  ConsumerState<MerchantCatalogScreen> createState() =>
      _MerchantCatalogScreenState();
}

class _MerchantCatalogScreenState extends ConsumerState<MerchantCatalogScreen> {
  final _searchCtrl = TextEditingController();
  String _statusFilter = ''; // '' = all

  static const _statusColors = <String, Color>{
    'ACTIVE': TaifTokens.ok,
    'DRAFT': TaifTokens.muted,
    'REJECTED': TaifTokens.err,
    'PENDING': TaifTokens.warn,
  };

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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
          return _productList(context, store.id);
        },
      ),
    );
  }

  Widget _productList(BuildContext context, String storeId) {
    final products = ref.watch(storeProductsProvider(storeId));
    return products.when(
      loading: () => const LoadingSpinner(),
      error: (e, _) => EmptyState(
          title: 'Error',
          description: '$e',
          onAction: () => ref.invalidate(storeProductsProvider(storeId))),
      data: (list) {
        // Apply search + status filters
        final query = _searchCtrl.text.toLowerCase();
        final filtered = list.where((p) {
          if (_statusFilter.isNotEmpty && p.status != _statusFilter) {
            return false;
          }
          if (query.isNotEmpty &&
              !p.title.toLowerCase().contains(query) &&
              !(p.titleAr?.toLowerCase().contains(query) ?? false)) {
            return false;
          }
          return true;
        }).toList();

        // Count by status for filter chips
        final statusCounts = <String, int>{};
        for (final p in list) {
          statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1;
        }

        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(storeProductsProvider(storeId)),
          child: list.isEmpty
              ? ListView(children: const [
                  SizedBox(height: 80),
                  EmptyState(
                      title: 'No products',
                      description:
                          'Tap "New Product" to add your first product.',
                      icon: Icons.inventory_2_outlined)
                ])
              : ListView(
                  padding: const EdgeInsets.all(12),
                  children: [
                    // Search field
                    TextField(
                      controller: _searchCtrl,
                      decoration: InputDecoration(
                        hintText: 'Search your products...',
                        prefixIcon: const Icon(Icons.search, size: 20),
                        suffixIcon: query.isNotEmpty
                            ? IconButton(
                                icon: const Icon(Icons.clear, size: 18),
                                onPressed: () {
                                  _searchCtrl.clear();
                                  setState(() {});
                                })
                            : null,
                        isDense: true,
                        border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10)),
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 8),
                    // Status filter chips
                    SizedBox(
                      height: 36,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        children: [
                          _statusChip('All', list.length, ''),
                          ...statusCounts.entries.map(
                            (e) => _statusChip(e.key, e.value, e.key),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                    // Summary
                    Text(
                      '${filtered.length} of ${list.length} products',
                      style: const TextStyle(
                          fontSize: 12, color: TaifTokens.muted),
                    ),
                    const SizedBox(height: 8),
                    // Product cards
                    if (filtered.isEmpty)
                      const Padding(
                        padding: EdgeInsets.only(top: 40),
                        child: EmptyState(
                            title: 'No matches',
                            description:
                                'Try a different search term or filter',
                            icon: Icons.search_off),
                      )
                    else
                      ...filtered
                          .map((p) => _buildProductCard(context, p, storeId)),
                  ],
                ),
        );
      },
    );
  }

  String get query => _searchCtrl.text.toLowerCase();

  Widget _statusChip(String label, int count, String status) {
    final isSelected = _statusFilter == status;
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: FilterChip(
        label: Text('$label ($count)'),
        selected: isSelected,
        onSelected: (_) => setState(() => _statusFilter = status),
        selectedColor: TaifTokens.brandPrimary.withAlpha(30),
        labelStyle: TextStyle(
          fontSize: 12,
          color: isSelected ? TaifTokens.brandPrimary : TaifTokens.ink,
        ),
      ),
    );
  }

  Widget _buildProductCard(BuildContext context, Product p, String storeId) {
    final activeVariants = p.variants.where((v) => v.isActive).length;
    final statusColor = _statusColors[p.status] ?? TaifTokens.muted;
    final hasImage = p.imageUrl != null;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: () => context.push('/merchant/catalog/product/${p.id}'),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Image thumbnail
              Container(
                width: 64,
                height: 64,
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  color: TaifTokens.bg,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: hasImage
                    ? Image.network(p.imageUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const Icon(
                            Icons.inventory_2_outlined,
                            color: TaifTokens.muted,
                            size: 28))
                    : const Icon(Icons.inventory_2_outlined,
                        color: TaifTokens.muted, size: 28),
              ),
              const SizedBox(width: 12),
              // Content
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Title + status
                    Row(children: [
                      Expanded(
                        child: Text(p.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontWeight: FontWeight.w600, fontSize: 14)),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: statusColor.withAlpha(20),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(p.status,
                            style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                                color: statusColor)),
                      ),
                    ]),
                    if (p.titleAr != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(p.titleAr!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 12, color: TaifTokens.muted),
                            textDirection: TextDirection.rtl),
                      ),
                    const SizedBox(height: 6),
                    // Price + MOQ + variants row
                    Row(children: [
                      // Price
                      Text(
                        p.priceLabel,
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                          color: p.priceFromMinor != null
                              ? TaifTokens.brandPrimary
                              : TaifTokens.muted,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text('MOQ: ${p.moq}',
                          style: const TextStyle(
                              fontSize: 12, color: TaifTokens.muted)),
                      if (activeVariants > 0) ...[
                        const SizedBox(width: 12),
                        Text(
                            '$activeVariants variant${activeVariants == 1 ? '' : 's'}',
                            style: const TextStyle(
                                fontSize: 12, color: TaifTokens.muted)),
                      ],
                    ]),
                    // Product type badge
                    if (p.productTypeId != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: TaifTokens.brandAccent.withAlpha(20),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.category,
                                    size: 10, color: TaifTokens.brandAccent),
                                SizedBox(width: 3),
                                Text('Typed',
                                    style: TextStyle(
                                        fontSize: 10,
                                        color: TaifTokens.brandAccent,
                                        fontWeight: FontWeight.w500)),
                              ]),
                        ),
                      ),
                  ],
                ),
              ),
              // Actions
              Column(
                children: [
                  IconButton(
                      icon: const Icon(Icons.edit_outlined,
                          color: TaifTokens.brandPrimary, size: 20),
                      onPressed: () =>
                          context.push('/merchant/catalog/product/${p.id}')),
                  IconButton(
                      icon: const Icon(Icons.delete_outline,
                          color: TaifTokens.err, size: 20),
                      onPressed: () =>
                          _confirmDelete(context, ref, storeId, p)),
                ],
              ),
            ],
          ),
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
