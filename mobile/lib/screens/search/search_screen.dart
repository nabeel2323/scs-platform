import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common_widgets.dart';

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});
  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _ctrl = TextEditingController();
  Timer? _debounce;
  String? _selectedCategory;
  String? _selectedBrand;

  void _onChanged(String q) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () => _search(q));
  }

  Future<void> _search(String q) async {
    ref.read(searchQueryProvider.notifier).state = q;
    try {
      final result = await ref.read(apiServiceProvider).search(
          q: q.isEmpty ? null : q,
          categoryId: _selectedCategory,
          brandId: _selectedBrand,
          limit: 30);
      ref.read(searchResultsProvider.notifier).state = result;
    } catch (_) {}
  }

  Future<void> _addToCart(Product p) async {
    try {
      await ref
          .read(apiServiceProvider)
          .addToCart(variantId: p.id, storeId: p.storeId, quantity: p.moq);
      ref.invalidate(cartProvider);
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Added to cart'), duration: Duration(seconds: 1)));
    } catch (e) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Failed: $e')));
    }
  }

  @override
  void initState() {
    super.initState();
    _search('');
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final results = ref.watch(searchResultsProvider);
    final cats = ref.watch(categoriesProvider);
    return Scaffold(
        appBar: AppBar(
          title: const Text('Search'),
          actions: [
            IconButton(
              icon: const Icon(Icons.qr_code_scanner),
              tooltip: 'Scan barcode',
              onPressed: _scanBarcode,
            ),
          ],
        ),
        body: Column(children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
                controller: _ctrl,
                onChanged: _onChanged,
                decoration: InputDecoration(
                    hintText: 'Search products, SKU, barcode...',
                    prefixIcon: const Icon(Icons.search),
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10)))),
          ),
          cats.when(
              data: (list) => SizedBox(
                  height: 40,
                  child: ListView(scrollDirection: Axis.horizontal, children: [
                    _chip('All', _selectedCategory == null, () {
                      setState(() => _selectedCategory = null);
                      _search(_ctrl.text);
                    }),
                    ...list.map(
                        (c) => _chip(c.name, _selectedCategory == c.id, () {
                              setState(() => _selectedCategory = c.id);
                              _search(_ctrl.text);
                            })),
                  ])),
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink()),
          const SizedBox(height: 8),
          Expanded(
              child: results == null
                  ? const LoadingSpinner()
                  : results.products.isEmpty
                      ? const EmptyState(
                          title: 'No products found',
                          description: 'Try a different search term')
                      : GridView.builder(
                          padding: const EdgeInsets.all(16),
                          gridDelegate:
                              const SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: 2,
                                  mainAxisSpacing: 8,
                                  crossAxisSpacing: 8),
                          itemCount: results.products.length,
                          itemBuilder: (_, i) {
                            final p = results.products[i];
                            return ProductCard(
                                product: p,
                                onTap: () => context.push('/products/${p.id}'),
                                onAddToCart: () => _addToCart(p));
                          })),
        ]));
  }

  Future<void> _scanBarcode() async {
    // Navigate to scanner — result comes back as search query
    final barcode = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => _BarcodeScanner(),
      ),
    );
    if (barcode != null && mounted) {
      _ctrl.text = barcode;
      _search(barcode);
    }
  }

  Widget _chip(String label, bool selected, VoidCallback onTap) => Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
          label: Text(label),
          selected: selected,
          onSelected: (_) => onTap(),
          selectedColor: TaifTokens.brandPrimary.withAlpha(30)));
}

/// Barcode scanner screen using mobile_scanner.
class _BarcodeScanner extends StatefulWidget {
  @override
  State<_BarcodeScanner> createState() => _BarcodeScannerState();
}

class _BarcodeScannerState extends State<_BarcodeScanner> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan Barcode')),
      body: const Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.qr_code_scanner, size: 64, color: TaifTokens.muted),
          SizedBox(height: 16),
          Text('Camera access required for barcode scanning',
              style: TextStyle(color: TaifTokens.muted, fontSize: 14)),
          SizedBox(height: 8),
          Text('mobile_scanner integration pending camera permissions',
              style: TextStyle(color: TaifTokens.muted, fontSize: 12)),
        ]),
      ),
    );
  }
}
