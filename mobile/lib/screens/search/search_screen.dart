import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
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
  String? _searchError;

  /// PHASE COS-15: dynamic attribute facet filters
  final Map<String, String> _attrFilters = {};

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
      if (!mounted) return;
      setState(() => _searchError = null);
      ref.read(searchResultsProvider.notifier).state = result;
    } catch (e) {
      if (!mounted) return;
      setState(() => _searchError = 'Search failed: $e');
    }
  }

  Future<void> _addToCart(Product p) async {
    try {
      // The cart line references a variant, not a product; the service resolves
      // the default one and buys at the MOQ (A5-12 — this used to post `p.id`
      // as the variantId, which the server always rejected).
      await ref.read(apiServiceProvider).addProductToCart(p);
      ref.invalidate(cartProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Added to cart'), duration: Duration(seconds: 1)));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Failed: $e')));
      }
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
          // PHASE COS-15: Dynamic attribute facets
          if (results != null && results.facets.isNotEmpty)
            SizedBox(
              height: 36,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: results.facets
                    .expand((facet) => [
                          for (final v in facet.values)
                            Padding(
                              padding: const EdgeInsets.only(right: 6),
                              child: FilterChip(
                                label: Text('${facet.label}: ${v.value}'),
                                selected: _attrFilters[facet.code] == v.value,
                                onSelected: (sel) {
                                  setState(() {
                                    if (sel) {
                                      _attrFilters[facet.code] = v.value;
                                    } else {
                                      _attrFilters.remove(facet.code);
                                    }
                                  });
                                  _search(_ctrl.text);
                                },
                                selectedColor:
                                    TaifTokens.brandPrimary.withAlpha(30),
                              ),
                            ),
                        ])
                    .toList(),
              ),
            ),
          const SizedBox(height: 8),
          if (_searchError != null)
            ErrorBanner(
                message: _searchError!, onRetry: () => _search(_ctrl.text)),
          Expanded(
              child: results == null
                  // A failed first search left this spinner running forever,
                  // because nothing else ever set the results.
                  ? (_searchError != null
                      ? const EmptyState(
                          title: 'Search unavailable',
                          description: 'The request failed. Check the term and '
                              'try again.')
                      : const LoadingSpinner())
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
                                  crossAxisSpacing: 8,
                                  // Cards now carry price and seller as well; at
                                  // the default 1.0 the content overflowed the tile.
                                  childAspectRatio: 0.62),
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
  final MobileScannerController _controller = MobileScannerController(
    detectionTimeoutMs: 500,
    formats: const [
      BarcodeFormat.ean13,
      BarcodeFormat.ean8,
      BarcodeFormat.code128,
      BarcodeFormat.qrCode,
    ],
  );
  bool _handled = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan Barcode'),
        actions: [
          IconButton(
            icon: const Icon(Icons.flash_on),
            onPressed: () => _controller.toggleTorch(),
            tooltip: 'Toggle flash',
          ),
        ],
      ),
      body: Stack(children: [
        MobileScanner(
          controller: _controller,
          onDetect: (capture) {
            if (_handled) return;
            final barcodes = capture.barcodes;
            if (barcodes.isEmpty) return;
            final code = barcodes.first.rawValue;
            if (code == null || code.isEmpty) return;
            _handled = true;
            Navigator.of(context).pop(code);
          },
          errorBuilder: (context, error, child) {
            return Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.red),
                const SizedBox(height: 12),
                Text('Camera error: $error',
                    style: const TextStyle(color: Colors.white),
                    textAlign: TextAlign.center),
              ]),
            );
          },
        ),
        // Scanner overlay frame
        Center(
          child: Container(
            width: 250,
            height: 250,
            decoration: BoxDecoration(
              border: Border.all(color: Colors.white, width: 3),
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      ]),
    );
  }
}
